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
} from "lucide-react";
import { analyzeGame } from "@/lib/analysis/game-analyzer";
import { createBrowserStockfishEngine } from "@/lib/engine/stockfish-worker";
import type { ChessEngine } from "@/lib/engine/engine-evaluator";
import { COACH_PERSONAS, CoachPersonaId } from "@/lib/ai/coach-personas";
import { SAMPLE_GAMES } from "@/lib/sample-games";
import { getActiveMove, useReviewStore } from "@/lib/store/useReviewStore";
import { Chessboard, BoardThemeId } from "@/components/chess/Chessboard";
import type { BoardArrow } from "@/components/chess/BoardOverlays";
import { EvalBar } from "@/components/chess/EvalBar";
import { EvalGraph } from "@/components/chess/EvalGraph";
import { AccuracyHeader } from "@/components/review/AccuracyHeader";
import { CoachCard } from "@/components/review/CoachCard";
import { MoveBadgeSummary } from "@/components/review/MoveBadgeSummary";
import { MoveListReview } from "@/components/review/MoveListReview";
import { NavigationBar } from "@/components/review/NavigationBar";
import { UsernameImporter } from "@/components/importer/UsernameImporter";

type SidebarTab = "review" | "analysis" | "moves";
type ImporterTab = "samples" | "chesscom" | "pgn";

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
    personaId,
    explanations,
    storyline,
    retryState,
    setPgnInput,
    setAnalyzing,
    setAnalysisError,
    setAnalysis,
    setPersonaId,
    setExplanation,
    setStoryline,
    jumpToPly,
    goToStart,
    prevMove,
    nextMove,
    goToEnd,
    nextKeyMoment,
    flipBoard,
    toggleShowBestMove,
    stepBestMoveLine,
    startRetryMode,
    exitRetryMode,
    submitRetryMove,
  } = useReviewStore();

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("review");
  const [showLoaderModal, setShowLoaderModal] = useState(false);
  const [importerTab, setImporterTab] = useState<ImporterTab>("samples");
  const [depth, setDepth] = useState<number>(14);
  const [boardTheme, setBoardTheme] = useState<BoardThemeId>("green");
  const [failedExplainPlies, setFailedExplainPlies] = useState<Record<number, boolean>>({});
  const [customPgnDraft, setCustomPgnDraft] = useState(SAMPLE_GAMES[1].pgn);

  const engineRef = useRef<ChessEngine | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runAnalysis = useCallback(
    async (pgn: string, autoFlipColor?: "white" | "black") => {
      abortRef.current?.abort();
      engineRef.current?.dispose();

      const controller = new AbortController();
      abortRef.current = controller;
      const engine = createBrowserStockfishEngine();
      engineRef.current = engine;

      setPgnInput(pgn);
      setShowLoaderModal(false);
      setAnalyzing(0, 1);

      if (autoFlipColor === "black" && !useReviewStore.getState().boardFlipped) {
        flipBoard();
      } else if (autoFlipColor === "white" && useReviewStore.getState().boardFlipped) {
        flipBoard();
      }

      try {
        const result = await analyzeGame(pgn, engine, {
          depth,
          multiPv: 3,
          signal: controller.signal,
          onProgress: (completed, total) => setAnalyzing(completed, total),
        });

        if (controller.signal.aborted) return;
        setAnalysis(result);

        // Fetch Game Storyline asynchronously
        const turningMove = result.moves.find((m) => m.classification.isKeyMoment);
        fetch("/api/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "storyline",
            payload: {
              whiteName: result.headers.White || "White",
              blackName: result.headers.Black || "Black",
              result: result.headers.Result || "*",
              openingName: result.opening.opening?.name,
              whiteAccuracy: result.summary.white.accuracy,
              blackAccuracy: result.summary.black.accuracy,
              whiteElo: result.summary.white.estimatedElo,
              blackElo: result.summary.black.estimatedElo,
              phaseAccuracies: {
                opening: {
                  white: result.summary.white.phaseAccuracies.opening,
                  black: result.summary.black.phaseAccuracies.opening,
                },
                middlegame: {
                  white: result.summary.white.phaseAccuracies.middlegame,
                  black: result.summary.black.phaseAccuracies.middlegame,
                },
                endgame: {
                  white: result.summary.white.phaseAccuracies.endgame,
                  black: result.summary.black.phaseAccuracies.endgame,
                },
              },
              keyMomentCount: result.moves.filter((m) => m.classification.isKeyMoment).length,
              turningPointMove: turningMove
                ? `${turningMove.moveNumber}${turningMove.color === "w" ? "." : "..."} ${turningMove.san}`
                : undefined,
              personaId,
            },
          }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((story) => {
            if (story) setStoryline(story);
          })
          .catch(() => undefined);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "Failed to analyze PGN.";
        setAnalysisError(msg);
      } finally {
        engine.dispose();
        if (engineRef.current === engine) {
          engineRef.current = null;
        }
      }
    },
    [depth, flipBoard, personaId, setAnalysis, setAnalysisError, setAnalyzing, setPgnInput, setStoryline]
  );

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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard navigation shortcuts (←, →, Home, End, F)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevMove();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nextMove();
      } else if (e.key === "Home") {
        e.preventDefault();
        goToStart();
      } else if (e.key === "End") {
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

  // Fetch grounded coach explanation lazily when navigating to a ply
  useEffect(() => {
    if (!analysis || !activeMove) return;
    if (explanations[activeMove.ply] || failedExplainPlies[activeMove.ply]) return;

    const prevMoveObj =
      activeMove.ply >= 2 ? analysis.moves[activeMove.ply - 2] : undefined;

    let cancelled = false;

    fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "move",
        payload: {
          moveSan: activeMove.san,
          playedBy: activeMove.color === "w" ? "White" : "Black",
          moveNumber: activeMove.moveNumber,
          badge: activeMove.classification.badge,
          openingName: analysis.opening.opening?.name,
          evalBefore: prevMoveObj?.evalLabel ?? "+0.2",
          evalAfter: activeMove.evalLabel,
          deltaWP: activeMove.classification.deltaWP,
          engineBestMove: activeMove.bestMoveSan,
          bestMovePV: activeMove.bestMovePvSan,
          tacticalContext: activeMove.tacticalContext,
          personaId,
          fenAfter: activeMove.fenAfter,
        },
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data) {
          setExplanation(activeMove.ply, data);
        } else {
          setFailedExplainPlies((prev) => ({ ...prev, [activeMove.ply]: true }));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailedExplainPlies((prev) => ({ ...prev, [activeMove.ply]: true }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeMove, analysis, explanations, failedExplainPlies, personaId, setExplanation]);

  // Compute displayed FEN, move highlight, badge, and arrows
  const boardView = useMemo(() => {
    const defaultFen =
      analysis?.startFen ??
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    if (retryState.active && retryState.fen) {
      return {
        fen: retryState.fen,
        lastMove: null,
        badge: null,
        arrows: [] as BoardArrow[],
        whiteCp: activeMove?.whiteCp ?? 20,
        whiteMate: activeMove?.whiteMate,
        evalLabel: activeMove?.evalLabel ?? "+0.2",
      };
    }

    if (!activeMove) {
      return {
        fen: defaultFen,
        lastMove: null,
        badge: null,
        arrows: [] as BoardArrow[],
        whiteCp: 20,
        whiteMate: undefined,
        evalLabel: "+0.2",
      };
    }

    // If user stepped through "Show Best Move" PV continuation
    if (showBestMove && bestMovePreviewIndex > 0) {
      const c = new Chess(activeMove.fenBefore);
      let lastPreviewMove: { from: Square; to: Square } | null = null;
      for (let i = 0; i < bestMovePreviewIndex && i < activeMove.bestMovePvSan.length; i++) {
        const mv = c.move(activeMove.bestMovePvSan[i]);
        if (mv) lastPreviewMove = { from: mv.from, to: mv.to };
      }
      return {
        fen: c.fen(),
        lastMove: lastPreviewMove,
        badge: null,
        arrows: [] as BoardArrow[],
        whiteCp: activeMove.whiteCp,
        whiteMate: activeMove.whiteMate,
        evalLabel: activeMove.evalLabel,
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
  }, [activeMove, analysis?.startFen, bestMovePreviewIndex, retryState, showBestMove]);

  const whiteName = analysis?.headers.White || "White";
  const blackName = analysis?.headers.Black || "Black";
  const whiteEloHeader = analysis?.headers.WhiteElo;
  const blackEloHeader = analysis?.headers.BlackElo;
  const hasKeyMoments = Boolean(analysis?.moves.some((m) => m.classification.isKeyMoment));

  return (
    <div className="min-h-screen bg-[#312e2b] text-white">
      {/* Top Navbar */}
      <header className="border-b border-[#3d3b38] bg-[#262522] px-4 py-2.5">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-[#96bc4b] font-black text-[#1a1917] shadow">
              ♞
            </div>
            <div>
              <h1 className="text-sm font-extrabold tracking-tight text-white sm:text-base">
                Chess.com Game Review <span className="text-[#96bc4b]">AI Coach</span>
              </h1>
              <p className="text-[11px] text-[#9e9c98]">
                Stockfish 17.1 WASM • CAPS2 Accuracy • ECO Classifier • Grounded Gemini Coach
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
      <main className="mx-auto grid max-w-[1320px] grid-cols-1 gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-start">
        {/* Left/Center Column: Eval Bar + Player Bars + Chessboard */}
        <section className="flex flex-col items-center">
          <div className="w-full max-w-[640px]">
            {/* Top Player Plate */}
            <div className="mb-2 flex items-center justify-between rounded bg-[#262522] px-3 py-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`h-3 w-3 rounded-sm border border-[#524f4b] ${
                    boardFlipped ? "bg-white" : "bg-[#191816]"
                  }`}
                />
                <span className="font-bold text-white">
                  {boardFlipped ? whiteName : blackName}
                </span>
                {(boardFlipped ? whiteEloHeader : blackEloHeader) && (
                  <span className="text-[#9e9c98]">
                    ({boardFlipped ? whiteEloHeader : blackEloHeader})
                  </span>
                )}
              </div>
              {analysis && (
                <span className="rounded bg-[#312e2b] px-2 py-0.5 font-mono text-[11px] font-bold text-[#c9c7c3]">
                  CAPS2:{" "}
                  {(boardFlipped
                    ? analysis.summary.white.accuracy
                    : analysis.summary.black.accuracy
                  ).toFixed(1)}
                  %
                </span>
              )}
            </div>

            {/* Eval Bar + Interactive 8x8 Board */}
            <div className="flex items-stretch gap-2.5">
              <div className="w-7 self-stretch">
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
                  interactive={retryState.active}
                  theme={boardTheme}
                  onMove={(from, to) => {
                    if (retryState.active) {
                      submitRetryMove(from, to);
                    }
                  }}
                />
              </div>
            </div>

            {/* Bottom Player Plate */}
            <div className="mt-2 flex items-center justify-between rounded bg-[#262522] px-3 py-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`h-3 w-3 rounded-sm border border-[#524f4b] ${
                    boardFlipped ? "bg-[#191816]" : "bg-white"
                  }`}
                />
                <span className="font-bold text-white">
                  {boardFlipped ? blackName : whiteName}
                </span>
                {(boardFlipped ? blackEloHeader : whiteEloHeader) && (
                  <span className="text-[#9e9c98]">
                    ({boardFlipped ? blackEloHeader : whiteEloHeader})
                  </span>
                )}
              </div>
              {analysis && (
                <span className="rounded bg-[#312e2b] px-2 py-0.5 font-mono text-[11px] font-bold text-[#c9c7c3]">
                  CAPS2:{" "}
                  {(boardFlipped
                    ? analysis.summary.black.accuracy
                    : analysis.summary.white.accuracy
                  ).toFixed(1)}
                  %
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Right Sidebar: Review / Analysis / Moves */}
        <aside className="flex flex-col gap-3 rounded-lg border border-[#3d3b38] bg-[#262522] p-3 shadow-2xl">
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
                onClick={() => setSidebarTab(t.id)}
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
            <>
              {sidebarTab === "review" && (
                <div className="space-y-3">
                  <AccuracyHeader
                    whiteName={whiteName}
                    blackName={blackName}
                    whiteEloHeader={whiteEloHeader}
                    blackEloHeader={blackEloHeader}
                    summary={analysis.summary}
                  />

                  <CoachCard
                    personaId={personaId}
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
                      activeMove && !explanations[activeMove.ply] && !failedExplainPlies[activeMove.ply]
                    )}
                    onStartRetry={startRetryMode}
                    onExitRetry={exitRetryMode}
                    onToggleBestMove={toggleShowBestMove}
                    onStepBestMove={stepBestMoveLine}
                  />

                  <EvalGraph
                    moves={analysis.moves}
                    currentPly={currentPly}
                    onSelectPly={jumpToPly}
                  />

                  <MoveBadgeSummary summary={analysis.summary} />
                </div>
              )}

              {sidebarTab === "analysis" && (
                <div className="space-y-3">
                  <div className="rounded-md border border-[#3d3b38] bg-[#21201d] p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[#9e9c98]">
                      Engine Lines (MultiPV = 3)
                    </div>
                    {activeMove ? (
                      <div className="mt-2 space-y-2 text-xs">
                        <div className="rounded bg-[#262522] p-2">
                          <div className="font-bold text-[#96bc4b]">
                            PV1 (Best): {activeMove.bestMoveSan}
                          </div>
                          <div className="mt-1 font-mono text-[11px] text-[#c9c7c3]">
                            {activeMove.bestMovePvSan.slice(0, 6).join(" ")}
                          </div>
                        </div>
                        {activeMove.altPvSan.length > 0 && (
                          <div className="rounded bg-[#262522] p-2">
                            <div className="font-bold text-[#5c8bb0]">PV2 (Alternative)</div>
                            <div className="mt-1 font-mono text-[11px] text-[#c9c7c3]">
                              {activeMove.altPvSan.slice(0, 6).join(" ")}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-[#9e9c98]">
                        Step to any move to inspect Stockfish principal variations.
                      </p>
                    )}
                  </div>

                  {activeMove && (
                    <div className="rounded-md border border-[#3d3b38] bg-[#21201d] p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-[#9e9c98]">
                        Deterministic Tactical Tags
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="rounded bg-[#312e2b] px-2 py-0.5 text-[11px] text-[#c9c7c3]">
                          Phase: {activeMove.tacticalContext.gamePhase}
                        </span>
                        <span className="rounded bg-[#312e2b] px-2 py-0.5 text-[11px] text-[#c9c7c3]">
                          ΔWP: {activeMove.classification.deltaWP.toFixed(1)}%
                        </span>
                        {activeMove.materialSacrificed > 0 && (
                          <span className="rounded bg-[#1baca6]/20 px-2 py-0.5 text-[11px] font-bold text-[#1baca6]">
                            Sacrifice: {activeMove.materialSacrificed} pts
                          </span>
                        )}
                        {activeMove.tacticalContext.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded bg-[#96bc4b]/15 px-2 py-0.5 font-mono text-[11px] text-[#96bc4b]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <EvalGraph
                    moves={analysis.moves}
                    currentPly={currentPly}
                    onSelectPly={jumpToPly}
                  />
                </div>
              )}

              {sidebarTab === "moves" && (
                <MoveListReview
                  moves={analysis.moves}
                  opening={analysis.opening}
                  currentPly={currentPly}
                  onSelectPly={jumpToPly}
                />
              )}

              {/* Persistent Navigation Footer */}
              <NavigationBar
                currentPly={currentPly}
                totalPlies={analysis.moves.length}
                hasKeyMoments={hasKeyMoments}
                onStart={goToStart}
                onPrev={prevMove}
                onNextKeyMoment={nextKeyMoment}
                onNext={nextMove}
                onEnd={goToEnd}
                onFlip={flipBoard}
              />
            </>
          )}
        </aside>
      </main>

      {/* Game Loader Modal (Chess.com Username, Master Samples, Custom PGN) */}
      {showLoaderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-lg border border-[#3d3b38] bg-[#262522] p-4 shadow-2xl">
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

              {importerTab === "chesscom" && (
                <UsernameImporter
                  onSelectGame={(pgn, meta) => runAnalysis(pgn, meta?.userColor)}
                />
              )}

              {importerTab === "pgn" && (
                <div className="space-y-3">
                  <textarea
                    rows={7}
                    value={customPgnDraft}
                    onChange={(e) => setCustomPgnDraft(e.target.value)}
                    placeholder="Paste PGN here (e.g. 1. e4 e5 2. Nf3 Nc6...)"
                    className="w-full rounded border border-[#3d3b38] bg-[#21201d] p-2.5 font-mono text-xs text-white placeholder-[#9e9c98] focus:border-[#96bc4b] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => runAnalysis(customPgnDraft || pgnInput)}
                    disabled={!customPgnDraft.trim()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded bg-[#96bc4b] py-2 text-sm font-extrabold text-[#1a1917] transition hover:bg-[#a6cc59] disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Analyze PGN
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
