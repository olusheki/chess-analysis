"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, Square } from "chess.js";
import {
  Play,
  Upload,
  UserSearch,
  Cpu,
  X,
  Palette,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Undo2,
  Eye,
  RefreshCw,
  LogOut,
} from "lucide-react";
import {
  analyzeGame,
  getFenTurn,
  parseBaseClockFromHeader,
  type AnalyzedPvLine,
  type ParsedMove,
} from "@/lib/analysis/game-analyzer";
import { createBrowserStockfishEngine } from "@/lib/engine/stockfish-worker";
import {
  buildStrengthUciConfig,
  evaluateTerminalPosition,
  type ChessEngine,
  type PositionEval,
  type PvLine,
} from "@/lib/engine/engine-evaluator";
import {
  isTablebaseEligible,
  querySyzygyTablebase,
  type TablebaseResult,
} from "@/lib/engine/tablebase";
import { formatEvalLabel } from "@/lib/engine/uci-parser";
import {
  gradeUserPlayMove,
  type PlayStartMode,
} from "@/lib/play/play-session";
import { computeCapturedMaterial } from "@/lib/chess/material";
import { COACH_PERSONAS, CoachPersonaId } from "@/lib/ai/coach-personas";
import {
  buildOfflineGameStoryline,
  buildOfflineMoveExplanation,
  type CoachExplanationRequest,
  type GameStorylineRequest,
} from "@/lib/ai/offline-coach";
import { SAMPLE_GAMES } from "@/lib/sample-games";
import { getActiveMove, useReviewStore } from "@/lib/store/useReviewStore";
import { Chessboard, BoardThemeId } from "@/components/chess/Chessboard";
import { ChessPieceSvg } from "@/components/chess/ChessPieces";
import type { BoardArrow } from "@/components/chess/BoardOverlays";
import { EvalBar } from "@/components/chess/EvalBar";
import { EvalGraph } from "@/components/chess/EvalGraph";
import { AccuracyHeader } from "@/components/review/AccuracyHeader";
import { AnalysisPanel } from "@/components/review/AnalysisPanel";
import { CoachCard } from "@/components/review/CoachCard";
import { MoveBadgeSummary } from "@/components/review/MoveBadgeSummary";
import { MoveListReview } from "@/components/review/MoveListReview";
import { NavigationBar } from "@/components/review/NavigationBar";
import { PlayModePanel } from "@/components/review/PlayModePanel";
import { UsernameImporter } from "@/components/importer/UsernameImporter";

type SidebarTab = "review" | "analysis" | "moves";
type ImporterTab = "samples" | "chesscom" | "pgn";

function buildPvArrowsFromFen(
  fen: string,
  lines?: ReadonlyArray<AnalyzedPvLine | PvLine>
): BoardArrow[] {
  if (!lines || lines.length === 0) return [];
  const arrows: BoardArrow[] = [];
  const primary = lines[0]?.pvSan[0];
  const alt = lines[1]?.pvSan[0];

  const resolveFirst = (san: string | undefined): { from: Square; to: Square } | null => {
    if (!san) return null;
    try {
      const m = new Chess(fen).move(san);
      return m ? { from: m.from, to: m.to } : null;
    } catch {
      return null;
    }
  };

  const pMove = resolveFirst(primary);
  if (pMove) arrows.push({ ...pMove, category: "best" });

  const aMove = resolveFirst(alt);
  if (aMove && (!pMove || aMove.from !== pMove.from || aMove.to !== pMove.to)) {
    arrows.push({ ...aMove, category: "alternative" });
  }
  return arrows;
}

function normalizeInputToPgn(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+/);
  if (!trimmed.startsWith("[") && parts.length >= 4 && parts.length <= 6 && parts[0].includes("/")) {
    try {
      const check = new Chess(trimmed);
      return `[SetUp "1"]\n[FEN "${check.fen()}"]\n\n*`;
    } catch {
      // Fall through so parsePgnGame reports a consistent error
    }
  }
  return raw;
}

export default function GameReviewPage() {
  const {
    pgnInput,
    analysisStatus,
    analysisProgress,
    analysisError,
    analysis,
    currentPly,
    boardFlipped,
    showBestMove,
    bestMovePreviewIndex,
    coachColor,
    personaId,
    plainEnglishNotation,
    explanations,
    storyline,
    retryState,
    playMode,
    variationTree,
    activeVariationNodeId,
    setPgnInput,
    setAnalyzing,
    setAnalysisError,
    setAnalysis,
    setCoachColor,
    setPersonaId,
    setPlainEnglishNotation,
    setExplanation,
    setStoryline,
    clearExplanations,
    jumpToPly,
    jumpToVariationNode,
    goToStart,
    prevMove,
    nextMove,
    goToEnd,
    nextKeyMoment,
    flipBoard,
    playAnalysisMove,
    explorePvLineInTree,
    attachVariationEval,
    deleteVariationBranchById,
    promoteVariationById,
    clearVariationTree,
    toggleShowBestMove,
    stepBestMoveLine,
    startRetryMode,
    startPunishMode,
    exitRetryMode,
    submitRetryMove,
    startPlayMode,
    setPlayTargetElo,
    togglePlayBestMove,
    setPlayThinking,
    setPlayEvaluatingMove,
    recordPlayEngineEval,
    applyUserPlayMove,
    attachPlayMoveGrade,
    applyEnginePlayMove,
    undoPlayMove,
    restartPlayMode,
    exitPlayMode,
  } = useReviewStore();

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("review");
  const [showLoaderModal, setShowLoaderModal] = useState(false);
  const [importerTab, setImporterTab] = useState<ImporterTab>("samples");
  const [depth, setDepth] = useState<number>(14);
  const [analyzedDepth, setAnalyzedDepth] = useState<number>(14);
  const [boardTheme, setBoardTheme] = useState<BoardThemeId>("green");
  const [analysisRunId, setAnalysisRunId] = useState(0);
  const [failedExplainPlies, setFailedExplainPlies] = useState<Record<string, boolean>>({});
  const [customPgnDraft, setCustomPgnDraft] = useState(SAMPLE_GAMES[1].pgn);
  const [liveMainEval, setLiveMainEval] = useState<PositionEval | null>(null);
  const [isEvaluatingAnalysisLive, setIsEvaluatingAnalysisLive] = useState(false);
  const [tablebaseResult, setTablebaseResult] = useState<TablebaseResult | null>(null);
  const [tablebaseLoading, setTablebaseLoading] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("chess_review_gemini_api_key");
      if (saved) setGeminiApiKey(saved);
    } catch {
      // Ignore storage access errors
    }
  }, []);

  const handleChangeGeminiApiKey = useCallback(
    (nextKey: string) => {
      const cleaned = nextKey.trim();
      setGeminiApiKey(cleaned);
      setFailedExplainPlies({});
      clearExplanations();
      try {
        if (cleaned) {
          window.localStorage.setItem("chess_review_gemini_api_key", cleaned);
        } else {
          window.localStorage.removeItem("chess_review_gemini_api_key");
        }
      } catch {
        // Ignore storage access errors
      }
    },
    [clearExplanations]
  );

  const activeVariationNode = useMemo(
    () =>
      activeVariationNodeId ? variationTree.nodes[activeVariationNodeId] ?? null : null,
    [activeVariationNodeId, variationTree.nodes]
  );

  const engineRef = useRef<ChessEngine | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const playEngineRef = useRef<ChessEngine | null>(null);
  const playActionTokenRef = useRef(0);
  const playReturnTabRef = useRef<SidebarTab>("review");
  const analysisLiveEngineRef = useRef<ChessEngine | null>(null);
  const analysisLiveTokenRef = useRef(0);

  const getPlayEngine = useCallback(() => {
    if (!playEngineRef.current) {
      playEngineRef.current = createBrowserStockfishEngine();
    }
    return playEngineRef.current;
  }, []);

  const disposePlayEngine = useCallback(() => {
    playActionTokenRef.current += 1;
    playEngineRef.current?.dispose();
    playEngineRef.current = null;
  }, []);

  const getAnalysisLiveEngine = useCallback(() => {
    if (!analysisLiveEngineRef.current) {
      analysisLiveEngineRef.current = createBrowserStockfishEngine();
    }
    return analysisLiveEngineRef.current;
  }, []);

  const disposeAnalysisLiveEngine = useCallback(() => {
    analysisLiveTokenRef.current += 1;
    analysisLiveEngineRef.current?.dispose();
    analysisLiveEngineRef.current = null;
    setIsEvaluatingAnalysisLive(false);
  }, []);

  const runAnalysis = useCallback(
    async (pgn: string, autoFlipColor?: "white" | "black" | "preserve") => {
      abortRef.current?.abort();
      engineRef.current?.dispose();
      disposePlayEngine();
      disposeAnalysisLiveEngine();
      setLiveMainEval(null);
      setTablebaseResult(null);

      const controller = new AbortController();
      abortRef.current = controller;
      const engine = createBrowserStockfishEngine();
      engineRef.current = engine;

      const normalizedPgn = normalizeInputToPgn(pgn);
      const runDepth = depth;
      setAnalysisRunId((n) => n + 1);
      setFailedExplainPlies({});
      setPgnInput(normalizedPgn);
      setShowLoaderModal(false);
      setAnalyzing(0, 1);

      if (autoFlipColor !== "preserve") {
        setCoachColor(autoFlipColor ?? "white");
        if (autoFlipColor === "black" && !useReviewStore.getState().boardFlipped) {
          flipBoard();
        } else if (autoFlipColor !== "black" && useReviewStore.getState().boardFlipped) {
          flipBoard();
        }
      }

      try {
        const result = await analyzeGame(normalizedPgn, engine, {
          depth: runDepth,
          multiPv: 3,
          signal: controller.signal,
          onProgress: (completed, total) => {
            if (!controller.signal.aborted) {
              setAnalyzing(completed, total);
            }
          },
        });

        if (controller.signal.aborted) return;
        setAnalyzedDepth(runDepth);
        setAnalysis(result);
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "Failed to analyze PGN.";
        setAnalysisError(msg);
      } finally {
        engine.dispose();
        if (engineRef.current === engine) {
          engineRef.current = null;
        }
      }
    },
    [depth, disposeAnalysisLiveEngine, disposePlayEngine, flipBoard, setAnalysis, setAnalysisError, setAnalyzing, setCoachColor, setPgnInput]
  );

  // Fetch / re-fetch grounded Game Storyline when analysis finishes, coachColor toggles, or persona changes
  useEffect(() => {
    if (!analysis || analysisStatus !== "complete" || storyline) return;

    const controller = new AbortController();
    const turningMove = analysis.moves.find((m) => m.classification.isKeyMoment);
    const storyPayload: GameStorylineRequest = {
      whiteName: analysis.headers.White || "White",
      blackName: analysis.headers.Black || "Black",
      result: analysis.headers.Result || "*",
      openingName: analysis.opening.opening?.name,
      whiteAccuracy: analysis.summary.white.accuracy,
      blackAccuracy: analysis.summary.black.accuracy,
      whiteElo: analysis.summary.white.estimatedElo,
      blackElo: analysis.summary.black.estimatedElo,
      coachFor: coachColor === "black" ? "Black" : "White",
      phaseAccuracies: {
        opening: {
          white: analysis.summary.white.phaseAccuracies.opening,
          black: analysis.summary.black.phaseAccuracies.opening,
        },
        middlegame: {
          white: analysis.summary.white.phaseAccuracies.middlegame,
          black: analysis.summary.black.phaseAccuracies.middlegame,
        },
        endgame: {
          white: analysis.summary.white.phaseAccuracies.endgame,
          black: analysis.summary.black.phaseAccuracies.endgame,
        },
      },
      phaseMoveCounts: {
        opening: {
          white: analysis.summary.white.phaseMoveCounts?.opening ?? 0,
          black: analysis.summary.black.phaseMoveCounts?.opening ?? 0,
        },
        middlegame: {
          white: analysis.summary.white.phaseMoveCounts?.middlegame ?? 0,
          black: analysis.summary.black.phaseMoveCounts?.middlegame ?? 0,
        },
        endgame: {
          white: analysis.summary.white.phaseMoveCounts?.endgame ?? 0,
          black: analysis.summary.black.phaseMoveCounts?.endgame ?? 0,
        },
      },
      keyMomentCount: analysis.moves.filter((m) => m.classification.isKeyMoment).length,
      turningPointMove: turningMove
        ? `${turningMove.moveNumber}${turningMove.color === "w" ? "." : "..."} ${turningMove.san}`
        : undefined,
      personaId,
    };

    const trimmedKey = geminiApiKey.trim();
    const storylinePromise =
      process.env.NEXT_PUBLIC_STATIC_EXPORT === "true"
        ? trimmedKey
          ? import("@/lib/ai/gemini-coach").then(({ GeminiCoachService }) =>
              new GeminiCoachService(trimmedKey).generateGameStoryline(storyPayload)
            )
          : Promise.resolve(buildOfflineGameStoryline(storyPayload))
        : fetch("/api/explain", {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              ...(trimmedKey ? { "x-gemini-api-key": trimmedKey } : {}),
            },
            body: JSON.stringify({
              mode: "storyline",
              payload: storyPayload,
            }),
          }).then((r) => (r.ok ? r.json() : null));

    storylinePromise
      .then((story) => {
        if (!controller.signal.aborted && story) {
          setStoryline(story);
        }
      })
      .catch(() => undefined);

    return () => {
      controller.abort();
    };
  }, [analysis, analysisStatus, coachColor, geminiApiKey, personaId, setStoryline, storyline]);

  // Auto-load Opera Game on initial mount if idle
  useEffect(() => {
    const timer = setTimeout(() => {
      if (useReviewStore.getState().analysisStatus === "idle" && !useReviewStore.getState().analysis) {
        runAnalysis(SAMPLE_GAMES[1].pgn);
      }
    }, 0);
    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
      engineRef.current?.dispose();
      disposePlayEngine();
      disposeAnalysisLiveEngine();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard navigation shortcuts (←, →, Home, End, F)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const inPlayMode = useReviewStore.getState().playMode.active;
      if (e.key === "ArrowLeft" && !inPlayMode) {
        e.preventDefault();
        prevMove();
      } else if (e.key === "ArrowRight" && !inPlayMode) {
        e.preventDefault();
        nextMove();
      } else if (e.key === "Home" && !inPlayMode) {
        e.preventDefault();
        goToStart();
      } else if (e.key === "End" && !inPlayMode) {
        e.preventDefault();
        goToEnd();
      } else if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        flipBoard();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [flipBoard, goToEnd, goToStart, nextMove, prevMove]);

  const activeMove = useMemo(
    () => getActiveMove(analysis, currentPly),
    [analysis, currentPly]
  );

  const explainKey = activeMove
    ? `${analysisRunId}:${coachColor}:${personaId}:${geminiApiKey.trim() ? "key" : "nokey"}:${activeMove.ply}`
    : null;

  // Fetch grounded coach explanation lazily when navigating to a ply or switching coachColor
  useEffect(() => {
    if (!analysis || !activeMove || !explainKey) return;
    if (explanations[activeMove.ply] || failedExplainPlies[explainKey]) return;

    const prevMoveObj =
      activeMove.ply >= 2 ? analysis.moves[activeMove.ply - 2] : undefined;
    const whitePlayerName = analysis.headers.White || "White";
    const blackPlayerName = analysis.headers.Black || "Black";
    const coachFor: "White" | "Black" = coachColor === "black" ? "Black" : "White";

    const controller = new AbortController();
    const movePayload: CoachExplanationRequest = {
      moveSan: activeMove.san,
      playedBy: activeMove.color === "w" ? "White" : "Black",
      coachFor,
      playerName: coachFor === "White" ? whitePlayerName : blackPlayerName,
      opponentName: coachFor === "White" ? blackPlayerName : whitePlayerName,
      moveNumber: activeMove.moveNumber,
      badge: activeMove.classification.badge,
      openingName: analysis.opening.opening?.name,
      evalBefore: prevMoveObj?.evalLabel ?? analysis.startEval?.evalLabel ?? "+0.2",
      evalAfter: activeMove.evalLabel,
      deltaWP: activeMove.classification.deltaWP,
      engineBestMove: activeMove.bestMoveSan,
      bestMovePV: activeMove.bestMovePvSan,
      refutationPV: activeMove.refutationPvSan ?? [],
      tacticalContext: activeMove.tacticalContext,
      coachInsights: activeMove.coachInsights,
      personaId,
      fenBefore: activeMove.fenBefore,
      fenAfter: activeMove.fenAfter,
    };

    const trimmedKey = geminiApiKey.trim();
    const explainPromise =
      process.env.NEXT_PUBLIC_STATIC_EXPORT === "true"
        ? trimmedKey
          ? import("@/lib/ai/gemini-coach").then(({ GeminiCoachService }) =>
              new GeminiCoachService(trimmedKey).explainMove(movePayload)
            )
          : Promise.resolve(buildOfflineMoveExplanation(movePayload))
        : fetch("/api/explain", {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              ...(trimmedKey ? { "x-gemini-api-key": trimmedKey } : {}),
            },
            body: JSON.stringify({
              mode: "move",
              payload: movePayload,
            }),
          }).then((res) => (res.ok ? res.json() : null));

    explainPromise
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data) {
          setExplanation(activeMove.ply, data);
        } else {
          setFailedExplainPlies((prev) => ({ ...prev, [explainKey]: true }));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFailedExplainPlies((prev) => ({ ...prev, [explainKey]: true }));
        }
      });

    return () => {
      controller.abort();
    };
  }, [activeMove, analysis, coachColor, explainKey, explanations, failedExplainPlies, geminiApiKey, personaId, setExplanation]);

  // Compute displayed FEN, move highlight, badge, and arrows
  const boardView = useMemo(() => {
    const defaultFen =
      analysis?.startFen ??
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    if (playMode.active) {
      const arrows: BoardArrow[] = [];
      const latestMove =
        playMode.moves.length > 0
          ? playMode.moves[playMode.moves.length - 1]
          : null;
      const isLatestUserMove =
        Boolean(latestMove) &&
        latestMove!.by === "user" &&
        Boolean(playMode.lastMove) &&
        latestMove!.from === playMode.lastMove!.from &&
        latestMove!.to === playMode.lastMove!.to;
      const badge = isLatestUserMove ? latestMove?.grade?.badge ?? null : null;

      if (
        isLatestUserMove &&
        badge &&
        ["Inaccuracy", "Mistake", "Miss", "Blunder"].includes(badge)
      ) {
        arrows.push({
          from: latestMove!.from,
          to: latestMove!.to,
          category: "blunder",
        });
      }

      if (
        playMode.showBestMove &&
        !playMode.gameOver &&
        !playMode.isThinking &&
        playMode.currentEval?.bestMoveUci &&
        playMode.currentEval.bestMoveUci.length >= 4
      ) {
        arrows.push({
          from: playMode.currentEval.bestMoveUci.slice(0, 2) as Square,
          to: playMode.currentEval.bestMoveUci.slice(2, 4) as Square,
          category: "best",
        });
      }

      return {
        fen: playMode.fen,
        lastMove: playMode.lastMove,
        badge,
        arrows,
        whiteCp: playMode.evalWhiteCp,
        whiteMate: playMode.evalWhiteMate,
        evalLabel: formatEvalLabel(playMode.evalWhiteCp, playMode.evalWhiteMate),
      };
    }

    if (retryState.active && retryState.fen) {
      return {
        fen: retryState.fen,
        lastMove: null,
        badge: null,
        arrows: [] as BoardArrow[],
        whiteCp: activeMove?.whiteCp ?? analysis?.startEval?.whiteCp ?? 20,
        whiteMate: activeMove?.whiteMate ?? analysis?.startEval?.whiteMate,
        evalLabel: activeMove?.evalLabel ?? analysis?.startEval?.evalLabel ?? "+0.2",
      };
    }

    if (activeVariationNode) {
      const anchorCp =
        activeVariationNode.anchorPly === 0
          ? analysis?.startEval?.whiteCp ?? 20
          : analysis?.moves[activeVariationNode.anchorPly - 1]?.whiteCp ?? 0;
      const anchorMate =
        activeVariationNode.anchorPly === 0
          ? analysis?.startEval?.whiteMate
          : analysis?.moves[activeVariationNode.anchorPly - 1]?.whiteMate;
      const evalData = activeVariationNode.eval;
      const whiteCp = evalData ? evalData.whiteCp : anchorCp;
      const whiteMate = evalData ? evalData.whiteMate : anchorMate;
      const arrows = evalData
        ? buildPvArrowsFromFen(activeVariationNode.fenAfter, evalData.lines)
        : [];
      return {
        fen: activeVariationNode.fenAfter,
        lastMove: { from: activeVariationNode.from, to: activeVariationNode.to },
        badge: null,
        arrows,
        whiteCp,
        whiteMate,
        evalLabel: formatEvalLabel(whiteCp, whiteMate, evalData?.isCheckmate),
      };
    }

    if (!activeMove) {
      const startLines =
        liveMainEval?.fen === defaultFen
          ? liveMainEval.lines
          : analysis?.startEval?.pvLines;
      const arrows =
        sidebarTab === "analysis" ? buildPvArrowsFromFen(defaultFen, startLines) : [];
      const whiteCp =
        liveMainEval?.fen === defaultFen
          ? liveMainEval.whiteCp
          : analysis?.startEval?.whiteCp ?? 20;
      const whiteMate =
        liveMainEval?.fen === defaultFen
          ? liveMainEval.whiteMate
          : analysis?.startEval?.whiteMate;
      return {
        fen: defaultFen,
        lastMove: null,
        badge: null,
        arrows,
        whiteCp,
        whiteMate,
        evalLabel: formatEvalLabel(whiteCp, whiteMate, liveMainEval?.isCheckmate),
      };
    }

    // If user stepped through "Show Best Move" PV continuation
    if (showBestMove && bestMovePreviewIndex > 0) {
      const c = new Chess(activeMove.fenBefore);
      let lastPreviewMove: { from: Square; to: Square } | null = null;
      for (let i = 0; i < bestMovePreviewIndex && i < activeMove.bestMovePvSan.length; i++) {
        try {
          const mv = c.move(activeMove.bestMovePvSan[i]);
          if (mv) lastPreviewMove = { from: mv.from, to: mv.to };
        } catch {
          break;
        }
      }
      const bestLine = activeMove.pvLines?.[0];
      const previewWhiteCp = bestLine ? bestLine.cp : activeMove.whiteCp;
      const previewWhiteMate = bestLine ? bestLine.mate : activeMove.whiteMate;
      return {
        fen: c.fen(),
        lastMove: lastPreviewMove,
        badge: null,
        arrows: [] as BoardArrow[],
        whiteCp: previewWhiteCp,
        whiteMate: previewWhiteMate,
        evalLabel: formatEvalLabel(previewWhiteCp, previewWhiteMate),
      };
    }

    const arrows: BoardArrow[] = [];
    const badge = activeMove.classification.badge;
    const isError =
      badge === "Blunder" ||
      badge === "Miss" ||
      badge === "Mistake" ||
      badge === "Inaccuracy";

    if (isError) {
      arrows.push({ from: activeMove.from, to: activeMove.to, category: "blunder" });
    }

    if ((showBestMove || isError) && activeMove.bestMoveUci.length >= 4) {
      const bestFrom = activeMove.bestMoveUci.slice(0, 2) as Square;
      const bestTo = activeMove.bestMoveUci.slice(2, 4) as Square;
      if (bestFrom !== activeMove.from || bestTo !== activeMove.to) {
        arrows.push({ from: bestFrom, to: bestTo, category: "best" });
      }
    } else if (sidebarTab === "analysis" && !isError && analysis) {
      const nextMove = analysis.moves[activeMove.ply];
      const replyLines =
        nextMove?.pvLines ??
        (liveMainEval?.fen === activeMove.fenAfter ? liveMainEval.lines : undefined);
      arrows.push(...buildPvArrowsFromFen(activeMove.fenAfter, replyLines));
    }

    return {
      fen: activeMove.fenAfter,
      lastMove: { from: activeMove.from, to: activeMove.to },
      badge,
      arrows,
      whiteCp: activeMove.whiteCp,
      whiteMate: activeMove.whiteMate,
      evalLabel: activeMove.evalLabel,
    };
  }, [
    activeMove,
    activeVariationNode,
    analysis,
    bestMovePreviewIndex,
    liveMainEval,
    playMode,
    retryState,
    showBestMove,
    sidebarTab,
  ]);

  // Keep Review tab aligned on mainline when exiting Play Mode (never trapped on an invisible variation)
  useEffect(() => {
    if (sidebarTab === "review" && !playMode.active && activeVariationNodeId) {
      jumpToPly(currentPly);
    }
  }, [activeVariationNodeId, currentPly, jumpToPly, playMode.active, sidebarTab]);

  // Live Stockfish MultiPV=3 evaluation for explored Analysis variation nodes or missing end-of-game lines
  useEffect(() => {
    if (
      sidebarTab !== "analysis" ||
      analysisStatus !== "complete" ||
      !analysis ||
      playMode.active ||
      retryState.active
    ) {
      setIsEvaluatingAnalysisLive(false);
      return;
    }

    const needsVarEval = Boolean(activeVariationNode && !activeVariationNode.eval);
    const needsEndMainEval =
      !activeVariationNode &&
      currentPly >= analysis.moves.length &&
      liveMainEval?.fen !== boardView.fen;
    const needsStartMainEval =
      !activeVariationNode &&
      currentPly === 0 &&
      !analysis.startEval?.pvLines?.length &&
      liveMainEval?.fen !== boardView.fen;

    if (!needsVarEval && !needsEndMainEval && !needsStartMainEval) {
      setIsEvaluatingAnalysisLive(false);
      return;
    }

    const targetFen = boardView.fen;
    const terminal = evaluateTerminalPosition(targetFen);
    if (terminal) {
      setIsEvaluatingAnalysisLive(false);
      if (activeVariationNode) {
        attachVariationEval(activeVariationNode.id, terminal);
      } else {
        setLiveMainEval(terminal);
      }
      return;
    }

    const token = ++analysisLiveTokenRef.current;
    let cancelled = false;
    setIsEvaluatingAnalysisLive(true);

    getAnalysisLiveEngine()
      .evaluatePosition(targetFen, Math.min(depth, 14), 3)
      .then((res) => {
        if (cancelled || token !== analysisLiveTokenRef.current) return;
        if (activeVariationNode) {
          attachVariationEval(activeVariationNode.id, res);
        } else {
          setLiveMainEval(res);
        }
      })
      .catch(() => {
        // Worker disposed or interrupted cleanly
      })
      .finally(() => {
        if (!cancelled && token === analysisLiveTokenRef.current) {
          setIsEvaluatingAnalysisLive(false);
        }
      });

    return () => {
      cancelled = true;
      analysisLiveTokenRef.current += 1;
      setIsEvaluatingAnalysisLive(false);
    };
  }, [
    activeVariationNode,
    analysis,
    analysisStatus,
    attachVariationEval,
    boardView.fen,
    currentPly,
    depth,
    getAnalysisLiveEngine,
    liveMainEval?.fen,
    playMode.active,
    retryState.active,
    sidebarTab,
  ]);

  // On-demand Lichess Syzygy 7-man tablebase lookup in Analysis mode for <= 7-piece endgames
  useEffect(() => {
    if (
      sidebarTab !== "analysis" ||
      analysisStatus !== "complete" ||
      playMode.active ||
      !isTablebaseEligible(boardView.fen)
    ) {
      setTablebaseResult(null);
      setTablebaseLoading(false);
      return;
    }

    const controller = new AbortController();
    setTablebaseResult(null);
    setTablebaseLoading(true);

    querySyzygyTablebase(boardView.fen, { signal: controller.signal })
      .then((res) => {
        if (!controller.signal.aborted) {
          setTablebaseResult(res);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setTablebaseLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [analysisStatus, boardView.fen, playMode.active, sidebarTab]);

  const preEvaluatePlayTurn = useCallback(
    async (fen: string, token: number) => {
      if (token !== playActionTokenRef.current) return;
      const live = useReviewStore.getState().playMode;
      if (
        !live.active ||
        live.fen !== fen ||
        live.gameOver ||
        getFenTurn(fen) !== live.userColor
      ) {
        return;
      }

      const terminal = evaluateTerminalPosition(fen);
      if (terminal) {
        if (token === playActionTokenRef.current) {
          recordPlayEngineEval(terminal);
        }
        return;
      }

      try {
        const evalRes = await getPlayEngine().evaluatePosition(fen, 10, 3);
        if (token !== playActionTokenRef.current) return;
        recordPlayEngineEval(evalRes);
      } catch {
        // Worker disposed or interrupted cleanly on exit/undo
      }
    },
    [getPlayEngine, recordPlayEngineEval]
  );

  const requestEnginePlayReply = useCallback(
    async (fen: string, token: number) => {
      if (token !== playActionTokenRef.current) return;
      const liveBefore = useReviewStore.getState().playMode;
      if (
        !liveBefore.active ||
        liveBefore.fen !== fen ||
        liveBefore.gameOver ||
        getFenTurn(fen) === liveBefore.userColor
      ) {
        setPlayThinking(false);
        return;
      }

      setPlayThinking(true);
      try {
        // Brief pause so user move animation finishes cleanly before Stockfish responds
        await new Promise((resolve) => setTimeout(resolve, 160));
        if (token !== playActionTokenRef.current) return;

        const liveState = useReviewStore.getState().playMode;
        if (
          !liveState.active ||
          liveState.fen !== fen ||
          liveState.gameOver ||
          getFenTurn(fen) === liveState.userColor
        ) {
          return;
        }

        const cfg = buildStrengthUciConfig(liveState.targetElo);
        const search = await getPlayEngine().evaluatePosition(
          fen,
          cfg.recommendedDepth,
          1,
          { limitElo: liveState.targetElo, moveTimeMs: 220 }
        );
        if (token !== playActionTokenRef.current) return;

        if (!search.bestMoveUci) {
          setPlayThinking(false);
          return;
        }

        const applied = applyEnginePlayMove({ uci: search.bestMoveUci });
        if (!applied.moved) {
          setPlayThinking(false);
          return;
        }

        const nextFen = useReviewStore.getState().playMode.fen;
        if (!applied.isGameOver) {
          await preEvaluatePlayTurn(nextFen, token);
        } else {
          const term = evaluateTerminalPosition(nextFen);
          if (term && token === playActionTokenRef.current) {
            recordPlayEngineEval(term);
          }
        }
      } catch {
        if (token === playActionTokenRef.current) {
          setPlayThinking(false);
        }
      } finally {
        if (token === playActionTokenRef.current) {
          const post = useReviewStore.getState().playMode;
          if (post.isThinking && (!post.active || post.gameOver || getFenTurn(post.fen) === post.userColor)) {
            setPlayThinking(false);
          }
        }
      }
    },
    [
      applyEnginePlayMove,
      getPlayEngine,
      preEvaluatePlayTurn,
      recordPlayEngineEval,
      setPlayThinking,
    ]
  );

  const kickOffPlayTurn = useCallback(
    (token: number) => {
      const live = useReviewStore.getState().playMode;
      if (!live.active || live.gameOver) return;
      if (getFenTurn(live.fen) !== live.userColor) {
        void requestEnginePlayReply(live.fen, token);
      } else {
        void preEvaluatePlayTurn(live.fen, token);
      }
    },
    [preEvaluatePlayTurn, requestEnginePlayReply]
  );

  const handleStartPlayMode = useCallback(
    (mode: PlayStartMode = "board") => {
      playReturnTabRef.current = mode === "before-move" ? "review" : sidebarTab;
      const token = ++playActionTokenRef.current;
      startPlayMode(mode);
      setSidebarTab("review");
      kickOffPlayTurn(token);
    },
    [kickOffPlayTurn, sidebarTab, startPlayMode]
  );

  const handleUndoPlayMove = useCallback(() => {
    const token = ++playActionTokenRef.current;
    undoPlayMove();
    const live = useReviewStore.getState().playMode;
    if (live.active && !live.currentEval && !live.gameOver && getFenTurn(live.fen) === live.userColor) {
      void preEvaluatePlayTurn(live.fen, token);
    }
  }, [preEvaluatePlayTurn, undoPlayMove]);

  const handleRestartPlayMode = useCallback(() => {
    const token = ++playActionTokenRef.current;
    restartPlayMode();
    kickOffPlayTurn(token);
  }, [kickOffPlayTurn, restartPlayMode]);

  const handleExitPlayMode = useCallback(() => {
    disposePlayEngine();
    exitPlayMode();
    const returnTab = playReturnTabRef.current;
    setSidebarTab(returnTab);
    if (returnTab === "review" && useReviewStore.getState().activeVariationNodeId) {
      jumpToPly(useReviewStore.getState().currentPly);
    }
  }, [disposePlayEngine, exitPlayMode, jumpToPly]);

  const handlePlayBoardMove = useCallback(
    async (from: string, to: string, promotion?: string) => {
      const storeBefore = useReviewStore.getState();
      const pmBefore = storeBefore.playMode;
      if (!pmBefore.active || pmBefore.isThinking || pmBefore.gameOver) return;
      if (getFenTurn(pmBefore.fen) !== pmBefore.userColor) return;

      const prevRecord =
        pmBefore.moves.length > 0
          ? pmBefore.moves[pmBefore.moves.length - 1]
          : undefined;
      const evalBeforeCached = pmBefore.currentEval;

      const token = ++playActionTokenRef.current;
      const applied = applyUserPlayMove({
        from: from as Square,
        to: to as Square,
        promotion,
      });
      if (!applied.moved || !applied.move || !applied.fenBefore || !applied.fenAfter) {
        return;
      }

      try {
        const evalBefore =
          evalBeforeCached ??
          (await getPlayEngine().evaluatePosition(applied.fenBefore, 10, 3));
        if (token !== playActionTokenRef.current) return;

        const evalAfter =
          evaluateTerminalPosition(applied.fenAfter) ??
          (await getPlayEngine().evaluatePosition(applied.fenAfter, 10, 1));
        if (token !== playActionTokenRef.current) return;

        const prevParsedMove: ParsedMove | undefined = prevRecord
          ? {
              ply: prevRecord.ply,
              moveNumber: prevRecord.moveNumber,
              color: prevRecord.color,
              san: prevRecord.san,
              uci: prevRecord.uci,
              from: prevRecord.from,
              to: prevRecord.to,
              fenBefore: prevRecord.fenBefore,
              fenAfter: prevRecord.fenAfter,
            }
          : undefined;

        const liveState = useReviewStore.getState();
        const curAnalysis = liveState.analysis;
        const wName = curAnalysis?.headers.White || "White";
        const bName = curAnalysis?.headers.Black || "Black";
        const coachForSide: "White" | "Black" =
          liveState.coachColor === "black" ? "Black" : "White";

        const grade = gradeUserPlayMove({
          fenBefore: applied.fenBefore,
          fenAfter: applied.fenAfter,
          san: applied.move.san,
          uci: applied.move.uci,
          from: applied.move.from,
          to: applied.move.to,
          ply: applied.move.ply,
          evalBefore,
          evalAfter,
          prevMove: prevParsedMove,
          prevDeltaWP: prevRecord?.grade?.deltaWP,
          coachFor: coachForSide,
          personaId: liveState.personaId,
          openingName: curAnalysis?.opening.opening?.name,
          playerName: coachForSide === "White" ? wName : bName,
          opponentName: "Stockfish",
        });

        attachPlayMoveGrade(applied.move.id, grade);

        if (!applied.isGameOver) {
          await requestEnginePlayReply(applied.fenAfter, token);
        }
      } catch {
        if (token === playActionTokenRef.current) {
          setPlayEvaluatingMove(false);
          setPlayThinking(false);
        }
      }
    },
    [
      applyUserPlayMove,
      attachPlayMoveGrade,
      getPlayEngine,
      requestEnginePlayReply,
      setPlayEvaluatingMove,
      setPlayThinking,
    ]
  );

  const whiteName = analysis?.headers.White || "White";
  const blackName = analysis?.headers.Black || "Black";
  const whiteEloHeader = analysis?.headers.WhiteElo;
  const blackEloHeader = analysis?.headers.BlackElo;
  const hasKeyMoments = Boolean(analysis?.moves.some((m) => m.classification.isKeyMoment));
  const materialSummary = useMemo(
    () => computeCapturedMaterial(boardView.fen, analysis?.startFen),
    [boardView.fen, analysis?.startFen]
  );

  const playerClocks = useMemo(() => {
    if (!analysis) return { w: undefined, b: undefined };
    const hasClocks = analysis.moves.some((m) => Boolean(m.clock));
    if (!hasClocks) return { w: undefined, b: undefined };
    const baseClock = parseBaseClockFromHeader(analysis.headers.TimeControl);
    let w = baseClock;
    let b = baseClock;
    for (let i = 0; i < Math.min(currentPly, analysis.moves.length); i++) {
      const m = analysis.moves[i];
      if (m.clock) {
        if (m.color === "w") w = m.clock;
        else b = m.clock;
      }
    }
    return { w, b };
  }, [analysis, currentPly]);

  const renderCapturedStrip = (sideIsWhite: boolean) => {
    const pieces = sideIsWhite ? materialSummary.whiteCaptured : materialSummary.blackCaptured;
    const adv = sideIsWhite ? materialSummary.whiteAdvantage : materialSummary.blackAdvantage;
    if (pieces.length === 0 && adv <= 0) return null;
    return (
      <div className="flex items-center gap-1 text-[10px] font-bold text-[#c9c7c3]">
        <div className="flex items-center -space-x-1">
          {pieces.slice(0, 8).map((p, idx) => (
            <span key={`${p.type}-${idx}`} className="h-3.5 w-3.5 inline-block">
              <ChessPieceSvg
                color={p.color}
                type={p.type}
                darkSurfaceContrast={p.color === "b"}
              />
            </span>
          ))}
          {pieces.length > 8 && <span className="pl-1 text-[9px]">+{pieces.length - 8}</span>}
        </div>
        {adv > 0 && <span className="rounded bg-[#312e2b] px-1 text-[#96bc4b]">+{adv}</span>}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#312e2b] text-white">
      {/* Top Navbar */}
      <header className="border-b border-[#3d3b38] bg-[#262522] px-3 py-2 sm:px-4 sm:py-2.5">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-[#96bc4b] font-black text-[#1a1917] shadow sm:h-8 sm:w-8">
              ♞
            </div>
            <div>
              <h1 className="text-sm font-extrabold tracking-tight text-white sm:text-base">
                Chess.com Game Review <span className="text-[#96bc4b]">AI Coach</span>
              </h1>
              <p className="hidden text-[11px] text-[#9e9c98] sm:block">
                Stockfish 17.1 WASM • CAPS2 Accuracy • ECO Classifier • Grounded Gemini Coach
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* Engine Depth */}
            <label className="flex items-center gap-1.5 rounded border border-[#3d3b38] bg-[#21201d] px-2.5 py-1.5 text-xs text-[#c9c7c3]">
              <Cpu className="h-3.5 w-3.5 text-[#96bc4b]" />
              <span>Depth</span>
              <select
                aria-label="Engine depth"
                value={depth}
                onChange={(e) => setDepth(Number(e.target.value))}
                className="bg-transparent font-bold text-white focus:outline-none"
              >
                <option value={10} className="bg-[#21201d]">10 (Fast)</option>
                <option value={14} className="bg-[#21201d]">14 (Standard)</option>
                <option value={18} className="bg-[#21201d]">18 (Deep)</option>
              </select>
            </label>
            {analysis && analysisStatus === "complete" && depth !== analyzedDepth && pgnInput && (
              <button
                type="button"
                onClick={() => runAnalysis(pgnInput, "preserve")}
                className="animate-coach-enter rounded border border-[#96bc4b]/60 bg-[#96bc4b]/15 px-2.5 py-1.5 text-xs font-bold text-[#96bc4b] transition hover:bg-[#96bc4b]/25"
              >
                Re-analyze ({depth})
              </button>
            )}

            {/* Coach Persona */}
            <label className="flex items-center gap-1.5 rounded border border-[#3d3b38] bg-[#21201d] px-2.5 py-1.5 text-xs text-[#c9c7c3]">
              <Sparkles className="h-3.5 w-3.5 text-[#1baca6]" />
              <select
                aria-label="Coach persona"
                value={personaId}
                onChange={(e) => setPersonaId(e.target.value as CoachPersonaId)}
                className="bg-transparent font-bold text-white focus:outline-none"
              >
                {Object.values(COACH_PERSONAS).map((p) => (
                  <option key={p.id} value={p.id} className="bg-[#21201d]">
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            {/* Board Theme */}
            <label className="flex items-center gap-1.5 rounded border border-[#3d3b38] bg-[#21201d] px-2.5 py-1.5 text-xs text-[#c9c7c3]">
              <Palette className="h-3.5 w-3.5 text-[#e58f2a]" />
              <select
                aria-label="Board theme"
                value={boardTheme}
                onChange={(e) => setBoardTheme(e.target.value as BoardThemeId)}
                className="bg-transparent font-bold text-white focus:outline-none"
              >
                <option value="green" className="bg-[#21201d]">Green</option>
                <option value="walnut" className="bg-[#21201d]">Walnut</option>
                <option value="slate" className="bg-[#21201d]">Slate</option>
              </select>
            </label>

            <button
              type="button"
              onClick={() => setShowLoaderModal(true)}
              className="inline-flex items-center gap-1.5 rounded bg-[#96bc4b] px-3 py-1.5 text-xs font-extrabold text-[#1a1917] transition hover:bg-[#a6cc59]"
            >
              <Upload className="h-3.5 w-3.5" />
              Load Game / Username
            </button>
          </div>
        </div>
      </header>

      {/* Main Two-Column Chess.com Workspace */}
      <main className="mx-auto grid max-w-[1320px] grid-cols-1 gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-start lg:gap-5">
        {/* Left/Center Column: Eval Bar + Player Bars + Chessboard + Persistent Controls */}
        <section className="flex flex-col items-center lg:sticky lg:top-4">
          <div className="w-full max-w-[640px]">
            {/* Top Player Plate */}
            {(() => {
              const topIsWhite = boardFlipped;
              const topColor: "w" | "b" = topIsWhite ? "w" : "b";
              const topIsUser = playMode.active && playMode.userColor === topColor;
              const topDisplayName = playMode.active
                ? topIsUser
                  ? `You (${topIsWhite ? whiteName : blackName})`
                  : `Stockfish (~${playMode.targetElo})`
                : topIsWhite
                ? whiteName
                : blackName;
              const topDisplayElo = playMode.active
                ? topIsUser
                  ? String(playMode.matchedElo)
                  : "BOT"
                : topIsWhite
                ? whiteEloHeader
                : blackEloHeader;
              const topClock = !playMode.active
                ? topIsWhite
                  ? playerClocks.w
                  : playerClocks.b
                : undefined;
              const topTurnActive =
                (playMode.active || analysis) && getFenTurn(boardView.fen) === topColor;

              return (
                <div className="mb-2 flex items-center justify-between gap-2 rounded bg-[#262522] px-3 py-1.5 text-xs">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`h-3 w-3 shrink-0 rounded-sm border border-[#524f4b] ${
                        topIsWhite ? "bg-white" : "bg-[#191816]"
                      }`}
                    />
                    <span className="truncate font-bold text-white">{topDisplayName}</span>
                    {topDisplayElo && (
                      <span className="shrink-0 text-[#9e9c98]">({topDisplayElo})</span>
                    )}
                    {renderCapturedStrip(topIsWhite)}
                  </div>
                  {playMode.active ? (
                    topTurnActive && !playMode.gameOver ? (
                      <span className="shrink-0 rounded bg-[#312e2b] px-2 py-0.5 font-mono text-[11px] font-bold text-[#96bc4b]">
                        {topIsUser ? "Your move" : "Thinking..."}
                      </span>
                    ) : null
                  ) : topClock ? (
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded px-2 py-0.5 font-mono text-[11px] font-bold ${
                        topTurnActive
                          ? "bg-[#e2e0dc] text-[#1a1917]"
                          : "bg-[#312e2b] text-[#c9c7c3]"
                      }`}
                    >
                      <Clock className="h-3 w-3 opacity-75" />
                      {topClock}
                    </span>
                  ) : analysis && sidebarTab !== "review" ? (
                    <span className="shrink-0 rounded bg-[#312e2b] px-2 py-0.5 font-mono text-[11px] font-bold text-[#c9c7c3]">
                      CAPS2:{" "}
                      {(topIsWhite
                        ? analysis.summary.white.accuracy
                        : analysis.summary.black.accuracy
                      ).toFixed(1)}
                      %
                    </span>
                  ) : null}
                </div>
              );
            })()}

            {/* Eval Bar + Interactive 8x8 Board */}
            <div className="flex items-stretch gap-2.5">
              <div className="w-6 shrink-0 self-stretch sm:w-7">
                <EvalBar
                  whiteCp={boardView.whiteCp}
                  whiteMate={boardView.whiteMate}
                  evalLabel={boardView.evalLabel}
                  flipped={boardFlipped}
                />
              </div>
              <div className="flex-1">
                <Chessboard
                  fen={boardView.fen}
                  lastMove={boardView.lastMove}
                  badge={boardView.badge}
                  arrows={boardView.arrows}
                  flipped={boardFlipped}
                  interactive={
                    retryState.active ||
                    (playMode.active &&
                      !playMode.gameOver &&
                      !playMode.isThinking &&
                      getFenTurn(playMode.fen) === playMode.userColor) ||
                    (sidebarTab === "analysis" &&
                      analysisStatus === "complete" &&
                      Boolean(analysis))
                  }
                  theme={boardTheme}
                  onMove={(from, to, promotion) => {
                    if (retryState.active) {
                      submitRetryMove(from, to, promotion);
                    } else if (playMode.active) {
                      void handlePlayBoardMove(from, to, promotion);
                    } else if (sidebarTab === "analysis" && analysis) {
                      playAnalysisMove(from, to, promotion);
                    }
                  }}
                />
              </div>
            </div>

            {/* Bottom Player Plate */}
            {(() => {
              const bottomIsWhite = !boardFlipped;
              const bottomColor: "w" | "b" = bottomIsWhite ? "w" : "b";
              const bottomIsUser = playMode.active && playMode.userColor === bottomColor;
              const bottomDisplayName = playMode.active
                ? bottomIsUser
                  ? `You (${bottomIsWhite ? whiteName : blackName})`
                  : `Stockfish (~${playMode.targetElo})`
                : bottomIsWhite
                ? whiteName
                : blackName;
              const bottomDisplayElo = playMode.active
                ? bottomIsUser
                  ? String(playMode.matchedElo)
                  : "BOT"
                : bottomIsWhite
                ? whiteEloHeader
                : blackEloHeader;
              const bottomClock = !playMode.active
                ? bottomIsWhite
                  ? playerClocks.w
                  : playerClocks.b
                : undefined;
              const bottomTurnActive =
                (playMode.active || analysis) && getFenTurn(boardView.fen) === bottomColor;

              return (
                <div className="mt-2 flex items-center justify-between gap-2 rounded bg-[#262522] px-3 py-1.5 text-xs">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`h-3 w-3 shrink-0 rounded-sm border border-[#524f4b] ${
                        bottomIsWhite ? "bg-white" : "bg-[#191816]"
                      }`}
                    />
                    <span className="truncate font-bold text-white">{bottomDisplayName}</span>
                    {bottomDisplayElo && (
                      <span className="shrink-0 text-[#9e9c98]">({bottomDisplayElo})</span>
                    )}
                    {renderCapturedStrip(bottomIsWhite)}
                  </div>
                  {playMode.active ? (
                    bottomTurnActive && !playMode.gameOver ? (
                      <span className="shrink-0 rounded bg-[#312e2b] px-2 py-0.5 font-mono text-[11px] font-bold text-[#96bc4b]">
                        {bottomIsUser ? "Your move" : "Thinking..."}
                      </span>
                    ) : null
                  ) : bottomClock ? (
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded px-2 py-0.5 font-mono text-[11px] font-bold ${
                        bottomTurnActive
                          ? "bg-[#e2e0dc] text-[#1a1917]"
                          : "bg-[#312e2b] text-[#c9c7c3]"
                      }`}
                    >
                      <Clock className="h-3 w-3 opacity-75" />
                      {bottomClock}
                    </span>
                  ) : analysis && sidebarTab !== "review" ? (
                    <span className="shrink-0 rounded bg-[#312e2b] px-2 py-0.5 font-mono text-[11px] font-bold text-[#c9c7c3]">
                      CAPS2:{" "}
                      {(bottomIsWhite
                        ? analysis.summary.white.accuracy
                        : analysis.summary.black.accuracy
                      ).toFixed(1)}
                      %
                    </span>
                  ) : null}
                </div>
              );
            })()}

            {(analysis || playMode.active) && (
              <div className="mt-2.5 rounded-lg border border-[#3d3b38] bg-[#262522] p-2.5 shadow-xl">
                {playMode.active ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#3d3b38] bg-[#21201d] p-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleUndoPlayMove}
                        disabled={playMode.undoStack.length === 0}
                        className="inline-flex items-center gap-1.5 rounded bg-[#262522] px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-[#312e2b] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                        <span>Undo</span>
                      </button>
                      <button
                        type="button"
                        onClick={togglePlayBestMove}
                        disabled={
                          Boolean(playMode.gameOver) ||
                          playMode.isThinking ||
                          !playMode.currentEval?.bestMoveSan
                        }
                        className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                          playMode.showBestMove
                            ? "border-[#96bc4b] bg-[#96bc4b]/15 text-[#96bc4b]"
                            : "border-[#3d3b38] bg-[#262522] text-white hover:bg-[#312e2b]"
                        }`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Best Move</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={flipBoard}
                        aria-label="Flip board"
                        title="Flip board (F)"
                        className="rounded border border-[#3d3b38] bg-[#262522] p-1.5 text-[#c9c7c3] transition hover:bg-[#312e2b] hover:text-white"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={handleExitPlayMode}
                        className="inline-flex items-center gap-1.5 rounded border border-[#3d3b38] bg-[#262522] px-2.5 py-1.5 text-xs font-semibold text-[#c9c7c3] transition hover:bg-[#312e2b] hover:text-white"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        <span>Exit Play</span>
                      </button>
                    </div>
                  </div>
                ) : analysis ? (
                  <NavigationBar
                    currentPly={currentPly}
                    totalPlies={analysis.moves.length}
                    hasKeyMoments={hasKeyMoments}
                    inVariation={Boolean(activeVariationNode)}
                    canStepForwardInVariation={Boolean(
                      activeVariationNode && activeVariationNode.childrenIds.length > 0
                    )}
                    onStart={goToStart}
                    onPrev={prevMove}
                    onNextKeyMoment={nextKeyMoment}
                    onNext={nextMove}
                    onEnd={goToEnd}
                    onFlip={flipBoard}
                    onPlayFromHere={() => handleStartPlayMode("board")}
                    playModeActive={playMode.active}
                  />
                ) : null}
              </div>
            )}
          </div>
        </section>

        {/* Right Sidebar Workspace */}
        <aside className="flex min-w-0 flex-col gap-3 rounded-lg border border-[#3d3b38] bg-[#262522] p-3 shadow-2xl">
          {/* Progress / Error Banner */}
          {analysisStatus === "analyzing" && (
            <div className="rounded border border-[#96bc4b]/40 bg-[#21201d] p-3">
              <div className="flex items-center justify-between text-xs font-bold text-white">
                <span>Running Stockfish 17.1 WASM Analysis (Depth {depth})...</span>
                <span className="text-[#96bc4b]">
                  {analysisProgress.completed}/{analysisProgress.total}
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#312e2b]">
                <div
                  className="h-full bg-[#96bc4b] transition-all duration-200"
                  style={{
                    width: `${
                      analysisProgress.total > 0
                        ? Math.round((analysisProgress.completed / analysisProgress.total) * 100)
                        : 10
                    }%`,
                  }}
                />
              </div>
            </div>
          )}

          {analysisError && (
            <div className="flex items-start gap-2 rounded border border-[#fa412d]/50 bg-[#fa412d]/10 p-3 text-xs text-[#ff8e80]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{analysisError}</span>
            </div>
          )}

          {/* Sidebar Workspace: Play Mode OR Game Review Tabs */}
          {playMode.active ? (
            <PlayModePanel
              playMode={playMode}
              personaId={personaId}
              plainEnglish={plainEnglishNotation}
              onChangePersona={setPersonaId}
              onChangePlainEnglish={setPlainEnglishNotation}
              onSetTargetElo={setPlayTargetElo}
              onUndo={handleUndoPlayMove}
              onToggleBestMove={togglePlayBestMove}
              onRestart={handleRestartPlayMode}
              onExit={handleExitPlayMode}
            />
          ) : (
            <>
              {/* Sidebar Tab Header */}
              <div className="grid grid-cols-3 rounded-md bg-[#21201d] p-1 text-xs font-bold">
                {(
                  [
                    { id: "review", label: "Review" },
                    { id: "analysis", label: "Analysis" },
                    { id: "moves", label: "Moves" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSidebarTab(t.id);
                      if (t.id === "review" && activeVariationNodeId) {
                        jumpToPly(currentPly);
                      }
                    }}
                    className={`rounded py-1.5 transition ${
                      sidebarTab === t.id
                        ? "bg-[#312e2b] text-white shadow"
                        : "text-[#9e9c98] hover:text-white"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {analysis && (
                <div className="min-h-0 flex-1 space-y-3">
                  {sidebarTab === "review" && (
                    <div className="flex flex-col gap-3">
                      <div className="order-2 lg:order-1">
                        <AccuracyHeader
                          whiteName={whiteName}
                          blackName={blackName}
                          whiteEloHeader={whiteEloHeader}
                          blackEloHeader={blackEloHeader}
                          summary={analysis.summary}
                          coachColor={coachColor}
                          onSelectCoachColor={setCoachColor}
                        />
                      </div>

                      <div className="order-1 lg:order-2">
                        <CoachCard
                          personaId={personaId}
                          onChangePersona={setPersonaId}
                          geminiApiKey={geminiApiKey}
                          onChangeGeminiApiKey={handleChangeGeminiApiKey}
                          coachColor={coachColor}
                          onChangeCoachColor={setCoachColor}
                          plainEnglish={plainEnglishNotation}
                          onChangePlainEnglish={setPlainEnglishNotation}
                          moveNumber={activeMove?.moveNumber}
                          playedBy={activeMove ? (activeMove.color === "w" ? "White" : "Black") : undefined}
                          moveSan={activeMove?.san}
                          badge={activeMove?.classification.badge}
                          evalLabel={activeMove?.evalLabel}
                          bestMoveSan={activeMove?.bestMoveSan}
                          bestMovePvSan={activeMove?.bestMovePvSan}
                          explanation={activeMove ? explanations[activeMove.ply] : null}
                          storyline={storyline}
                          openingLabel={
                            analysis.opening.opening
                              ? `[${analysis.opening.opening.eco}] ${analysis.opening.opening.name}`
                              : undefined
                          }
                          openingInsight={analysis.opening.insight}
                          retryState={retryState}
                          showBestMove={showBestMove}
                          bestMovePreviewIndex={bestMovePreviewIndex}
                          loadingExplanation={Boolean(
                            activeMove && explainKey && !explanations[activeMove.ply] && !failedExplainPlies[explainKey]
                          )}
                          canPunishError={Boolean(
                            activeMove &&
                              (activeMove.ply < analysis.moves.length ||
                                (activeMove.refutationPvSan?.length ?? 0) > 0)
                          )}
                          onStartRetry={startRetryMode}
                          onPunishError={startPunishMode}
                          onFixAndPlayOut={() => handleStartPlayMode("before-move")}
                          onExitRetry={exitRetryMode}
                          onToggleBestMove={toggleShowBestMove}
                          onStepBestMove={stepBestMoveLine}
                        />
                      </div>

                  <div className="order-3">
                    <EvalGraph
                      moves={analysis.moves}
                      currentPly={currentPly}
                      startEval={analysis.startEval}
                      onSelectPly={jumpToPly}
                    />
                  </div>

                  <div className="order-4">
                    <MoveBadgeSummary summary={analysis.summary} />
                  </div>
                </div>
              )}

              {sidebarTab === "analysis" && (
                <AnalysisPanel
                  analysis={analysis}
                  currentPly={currentPly}
                  boardFen={boardView.fen}
                  analyzedDepth={analyzedDepth}
                  variationTree={variationTree}
                  activeVariationNode={activeVariationNode}
                  liveMainEval={
                    liveMainEval && liveMainEval.fen === boardView.fen ? liveMainEval : null
                  }
                  isEvaluatingLive={isEvaluatingAnalysisLive}
                  tablebase={tablebaseResult}
                  tablebaseLoading={tablebaseLoading}
                  onSelectVariationNode={jumpToVariationNode}
                  onExitVariation={() => jumpToPly(activeVariationNode?.anchorPly ?? currentPly)}
                  onExplorePvMoves={explorePvLineInTree}
                  onPromoteVariation={promoteVariationById}
                  onDeleteVariation={deleteVariationBranchById}
                  onClearVariations={clearVariationTree}
                  onSelectPly={jumpToPly}
                />
              )}

              {sidebarTab === "moves" && (
                <MoveListReview
                  moves={analysis.moves}
                  opening={analysis.opening}
                  currentPly={currentPly}
                  onSelectPly={jumpToPly}
                  variationTree={variationTree}
                  activeVariationNodeId={activeVariationNodeId}
                  onSelectVariationNode={jumpToVariationNode}
                />
              )}
            </div>
          )}
            </>
          )}
        </aside>
      </main>

      {/* Game Loader Modal (stays mounted so UsernameImporter retains cached results across close/reopen) */}
      <div
        className={
          showLoaderModal
            ? "fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            : "hidden"
        }
        aria-hidden={!showLoaderModal}
      >
        <div className="animate-modal-enter w-full max-w-lg rounded-lg border border-[#3d3b38] bg-[#262522] p-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#3d3b38] pb-3">
              <h2 className="text-base font-extrabold text-white">Load Game for Review</h2>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setShowLoaderModal(false)}
                className="rounded p-1 text-[#9e9c98] hover:bg-[#312e2b] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1 rounded bg-[#21201d] p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setImporterTab("samples")}
                className={`rounded py-1.5 ${
                  importerTab === "samples" ? "bg-[#312e2b] text-white" : "text-[#9e9c98]"
                }`}
              >
                Master Games
              </button>
              <button
                type="button"
                onClick={() => setImporterTab("chesscom")}
                className={`inline-flex items-center justify-center gap-1 rounded py-1.5 ${
                  importerTab === "chesscom" ? "bg-[#312e2b] text-white" : "text-[#9e9c98]"
                }`}
              >
                <UserSearch className="h-3.5 w-3.5" />
                Chess.com User
              </button>
              <button
                type="button"
                onClick={() => setImporterTab("pgn")}
                className={`rounded py-1.5 ${
                  importerTab === "pgn" ? "bg-[#312e2b] text-white" : "text-[#9e9c98]"
                }`}
              >
                Paste PGN
              </button>
            </div>

            <div className="mt-4">
              {importerTab === "samples" && (
                <div className="space-y-2">
                  {SAMPLE_GAMES.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => runAnalysis(g.pgn)}
                      className="flex w-full items-center justify-between rounded border border-[#3d3b38] bg-[#21201d] p-3 text-left transition hover:border-[#96bc4b] hover:bg-[#2d2b28]"
                    >
                      <div>
                        <div className="text-sm font-bold text-white">{g.title}</div>
                        <div className="text-xs text-[#9e9c98]">{g.subtitle}</div>
                      </div>
                      <Play className="h-4 w-4 text-[#96bc4b]" />
                    </button>
                  ))}
                </div>
              )}

              <div className={importerTab === "chesscom" ? "" : "hidden"}>
                <UsernameImporter
                  onSelectGame={(pgn, meta) => runAnalysis(pgn, meta?.userColor)}
                />
              </div>

              {importerTab === "pgn" && (
                <div className="space-y-3">
                  <textarea
                    rows={7}
                    value={customPgnDraft}
                    onChange={(e) => setCustomPgnDraft(e.target.value)}
                    placeholder="Paste PGN or FEN here (e.g. 1. e4 e5 2. Nf3 Nc6... or rnbqkbnr/...)"
                    className="w-full rounded border border-[#3d3b38] bg-[#21201d] p-2.5 font-mono text-xs text-white placeholder-[#9e9c98] focus:border-[#96bc4b] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => runAnalysis(customPgnDraft || pgnInput)}
                    disabled={!customPgnDraft.trim()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded bg-[#96bc4b] py-2 text-sm font-extrabold text-[#1a1917] transition hover:bg-[#a6cc59] disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Analyze PGN / FEN
                  </button>
                </div>
              )}
            </div>
          </div>
      </div>
    </div>
  );
}
