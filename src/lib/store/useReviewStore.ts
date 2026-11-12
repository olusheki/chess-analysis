import { create } from "zustand";
import { Chess, type Square } from "chess.js";
import { getFenTurn, type AnalyzedMove, type GameAnalysis } from "@/lib/analysis/game-analyzer";
import type {
  CoachExplanationResponse,
  GameStorylineResponse,
} from "@/lib/ai/gemini-coach";
import type { CoachPersonaId } from "@/lib/ai/coach-personas";
import type { PositionEval } from "@/lib/engine/engine-evaluator";
import {
  addVariationLine,
  attachVariationNodeEval,
  createEmptyVariationTree,
  deleteVariationBranch,
  getStepForwardTarget,
  playVariationMove,
  promoteVariationChild,
  type VariationTreeState,
} from "@/lib/analysis/variation-tree";
import {
  DEFAULT_CHESS_START_FEN,
  PLAY_DEFAULT_FALLBACK_ELO,
  clampPlayElo,
  getPlayGameOverStatus,
  resolveMatchedElo,
  resolvePlayAnchor,
  type PlayGameOverStatus,
  type PlayGradedMove,
  type PlayStartMode,
} from "@/lib/play/play-session";

export type AnalysisStatus = "idle" | "analyzing" | "complete" | "error";

export interface RetryState {
  active: boolean;
  ply: number | null;
  fen: string | null;
  targetUci: string | null;
  targetSan: string | null;
  status: "idle" | "prompt" | "incorrect" | "solved";
  feedback: string | null;
  attempts: number;
}

export interface PlayMoveRecord {
  id: string;
  ply: number;
  moveNumber: number;
  color: "w" | "b";
  san: string;
  uci: string;
  from: Square;
  to: Square;
  fenBefore: string;
  fenAfter: string;
  by: "user" | "engine";
  grade?: PlayGradedMove;
  evalAfterWhiteCp?: number;
  evalAfterWhiteMate?: number;
  evalLabel?: string;
}

export interface PlayUndoSnapshot {
  fen: string;
  moves: PlayMoveRecord[];
  lastMove: { from: Square; to: Square } | null;
  currentEval: PositionEval | null;
  evalWhiteCp: number;
  evalWhiteMate?: number;
}

export interface PlayModeState {
  active: boolean;
  startMode: PlayStartMode;
  anchorFen: string;
  anchorPly: number;
  anchorDescription: string;
  anchorWhiteCp: number;
  anchorWhiteMate?: number;
  userColor: "w" | "b";
  targetElo: number;
  matchedElo: number;
  matchedEloSource: "pgn" | "estimated" | "default";
  fen: string;
  moves: PlayMoveRecord[];
  undoStack: PlayUndoSnapshot[];
  lastMove: { from: Square; to: Square } | null;
  currentEval: PositionEval | null;
  evalWhiteCp: number;
  evalWhiteMate?: number;
  isThinking: boolean;
  isEvaluatingMove: boolean;
  showBestMove: boolean;
  gameOver: PlayGameOverStatus | null;
}

export interface ReviewStoreState {
  pgnInput: string;
  analysisStatus: AnalysisStatus;
  analysisProgress: { completed: number; total: number };
  analysisError: string | null;
  analysis: GameAnalysis | null;
  currentPly: number; // 0 = starting position, 1..N = after move N
  boardFlipped: boolean;
  showBestMove: boolean;
  bestMovePreviewIndex: number; // 0..bestMovePvSan.length
  coachColor: "white" | "black";
  personaId: CoachPersonaId;
  plainEnglishNotation: boolean;
  explanations: Record<number, CoachExplanationResponse>;
  storyline: GameStorylineResponse | null;
  retryState: RetryState;
  playMode: PlayModeState;
  variationTree: VariationTreeState;
  activeVariationNodeId: string | null;

  setPgnInput: (pgn: string) => void;
  setAnalyzing: (completed?: number, total?: number) => void;
  setAnalysisError: (message: string) => void;
  setAnalysis: (analysis: GameAnalysis) => void;
  setCoachColor: (color: "white" | "black") => void;
  setPersonaId: (personaId: CoachPersonaId) => void;
  setPlainEnglishNotation: (enabled: boolean) => void;
  togglePlainEnglishNotation: () => void;
  setExplanation: (ply: number, explanation: CoachExplanationResponse) => void;
  setStoryline: (storyline: GameStorylineResponse) => void;
  clearExplanations: () => void;

  jumpToPly: (ply: number) => void;
  jumpToVariationNode: (nodeId: string) => void;
  goToStart: () => void;
  prevMove: () => void;
  nextMove: () => void;
  goToEnd: () => void;
  nextKeyMoment: () => void;
  flipBoard: () => void;

  playAnalysisMove: (
    from: string,
    to: string,
    promotion?: string
  ) => { moved: boolean; mode?: "mainline" | "variation"; nodeId?: string };
  explorePvLineInTree: (input: {
    anchorPly: number;
    sanMoves: string[];
    stepIndex?: number;
    parentNodeId?: string | null;
  }) => string | null;
  attachVariationEval: (nodeId: string, posEval: PositionEval) => void;
  deleteVariationBranchById: (nodeId: string) => void;
  promoteVariationById: (nodeId: string) => void;
  clearVariationTree: () => void;

  toggleShowBestMove: () => void;
  stepBestMoveLine: (delta: number) => void;

  startRetryMode: () => void;
  startPunishMode: () => void;
  exitRetryMode: () => void;
  submitRetryMove: (from: string, to: string, promotion?: string) => { solved: boolean; san?: string };

  startPlayMode: (mode?: PlayStartMode, activeCustomFen?: string | null) => void;
  setPlayTargetElo: (elo: number) => void;
  togglePlayBestMove: () => void;
  setPlayShowBestMove: (show: boolean) => void;
  setPlayThinking: (thinking: boolean) => void;
  setPlayEvaluatingMove: (evaluating: boolean) => void;
  recordPlayEngineEval: (posEval: PositionEval) => void;
  applyUserPlayMove: (input: {
    from: Square;
    to: Square;
    promotion?: string;
  }) => { moved: boolean; move?: PlayMoveRecord; san?: string; fenBefore?: string; fenAfter?: string; isGameOver?: boolean };
  attachPlayMoveGrade: (moveId: string, grade: PlayGradedMove) => void;
  applyEnginePlayMove: (input: {
    uci: string;
    evalAfter?: PositionEval;
  }) => { moved: boolean; move?: PlayMoveRecord; isGameOver?: boolean };
  undoPlayMove: () => void;
  restartPlayMode: () => void;
  exitPlayMode: () => void;

  reset: () => void;
}

const INITIAL_RETRY_STATE: RetryState = {
  active: false,
  ply: null,
  fen: null,
  targetUci: null,
  targetSan: null,
  status: "idle",
  feedback: null,
  attempts: 0,
};

const INITIAL_PLAY_MODE_STATE: PlayModeState = {
  active: false,
  startMode: "board",
  anchorFen: DEFAULT_CHESS_START_FEN,
  anchorPly: 0,
  anchorDescription: "Opening position",
  anchorWhiteCp: 0,
  anchorWhiteMate: undefined,
  userColor: "w",
  targetElo: PLAY_DEFAULT_FALLBACK_ELO,
  matchedElo: PLAY_DEFAULT_FALLBACK_ELO,
  matchedEloSource: "default",
  fen: DEFAULT_CHESS_START_FEN,
  moves: [],
  undoStack: [],
  lastMove: null,
  currentEval: null,
  evalWhiteCp: 0,
  evalWhiteMate: undefined,
  isThinking: false,
  isEvaluatingMove: false,
  showBestMove: false,
  gameOver: null,
};

export function getActiveMove(analysis: GameAnalysis | null, currentPly: number): AnalyzedMove | null {
  if (!analysis || currentPly <= 0 || currentPly > analysis.moves.length) return null;
  return analysis.moves[currentPly - 1];
}

export const useReviewStore = create<ReviewStoreState>((set, get) => ({
  pgnInput: "",
  analysisStatus: "idle",
  analysisProgress: { completed: 0, total: 0 },
  analysisError: null,
  analysis: null,
  currentPly: 0,
  boardFlipped: false,
  showBestMove: false,
  bestMovePreviewIndex: 0,
  coachColor: "white",
  personaId: "danny",
  plainEnglishNotation: true,
  explanations: {},
  storyline: null,
  retryState: INITIAL_RETRY_STATE,
  playMode: INITIAL_PLAY_MODE_STATE,
  variationTree: createEmptyVariationTree(),
  activeVariationNodeId: null,

  setPgnInput: (pgn) => set({ pgnInput: pgn }),

  setAnalyzing: (completed = 0, total = 0) =>
    set({
      analysisStatus: "analyzing",
      analysisProgress: { completed, total },
      analysisError: null,
    }),

  setAnalysisError: (message) =>
    set({
      analysis: null,
      analysisStatus: "error",
      analysisError: message,
      activeVariationNodeId: null,
      variationTree: createEmptyVariationTree(),
      playMode: INITIAL_PLAY_MODE_STATE,
    }),

  setAnalysis: (analysis) =>
    set({
      analysis,
      analysisStatus: "complete",
      analysisError: null,
      currentPly: 0,
      activeVariationNodeId: null,
      variationTree: createEmptyVariationTree(),
      showBestMove: false,
      bestMovePreviewIndex: 0,
      explanations: {},
      storyline: null,
      retryState: INITIAL_RETRY_STATE,
      playMode: INITIAL_PLAY_MODE_STATE,
    }),

  setCoachColor: (coachColor) =>
    set({
      coachColor,
      explanations: {},
      storyline: null,
      retryState: INITIAL_RETRY_STATE,
      playMode: INITIAL_PLAY_MODE_STATE,
    }),

  setPersonaId: (personaId) => set({ personaId, explanations: {}, storyline: null }),

  setPlainEnglishNotation: (plainEnglishNotation) => set({ plainEnglishNotation }),

  togglePlainEnglishNotation: () =>
    set((state) => ({ plainEnglishNotation: !state.plainEnglishNotation })),

  setExplanation: (ply, explanation) =>
    set((state) => ({
      explanations: { ...state.explanations, [ply]: explanation },
    })),

  setStoryline: (storyline) => set({ storyline }),

  clearExplanations: () => set({ explanations: {}, storyline: null }),

  jumpToPly: (ply) => {
    const { analysis } = get();
    const maxPly = analysis ? analysis.moves.length : 0;
    const clamped = Math.max(0, Math.min(maxPly, ply));
    set({
      currentPly: clamped,
      activeVariationNodeId: null,
      showBestMove: false,
      bestMovePreviewIndex: 0,
      retryState: INITIAL_RETRY_STATE,
    });
  },

  jumpToVariationNode: (nodeId) => {
    const { variationTree } = get();
    const node = variationTree.nodes[nodeId];
    if (!node) return;
    set({
      currentPly: node.anchorPly,
      activeVariationNodeId: nodeId,
      showBestMove: false,
      bestMovePreviewIndex: 0,
      retryState: INITIAL_RETRY_STATE,
    });
  },

  goToStart: () => get().jumpToPly(0),

  prevMove: () => {
    const { currentPly, activeVariationNodeId, variationTree } = get();
    if (activeVariationNodeId) {
      const node = variationTree.nodes[activeVariationNodeId];
      if (node?.parentId && variationTree.nodes[node.parentId]) {
        set({
          currentPly: node.anchorPly,
          activeVariationNodeId: node.parentId,
          showBestMove: false,
          bestMovePreviewIndex: 0,
          retryState: INITIAL_RETRY_STATE,
        });
        return;
      }
      get().jumpToPly(node ? node.anchorPly : currentPly);
      return;
    }
    get().jumpToPly(currentPly - 1);
  },

  nextMove: () => {
    const { currentPly, activeVariationNodeId, variationTree } = get();
    if (activeVariationNodeId) {
      const childId = getStepForwardTarget(variationTree, activeVariationNodeId, null);
      if (childId) {
        set({
          activeVariationNodeId: childId,
          showBestMove: false,
          bestMovePreviewIndex: 0,
          retryState: INITIAL_RETRY_STATE,
        });
      }
      return;
    }
    get().jumpToPly(currentPly + 1);
  },

  playAnalysisMove: (from, to, promotion) => {
    const { analysis, currentPly, activeVariationNodeId, variationTree } = get();
    if (!analysis) return { moved: false };

    if (!activeVariationNodeId) {
      const anchorFen =
        currentPly === 0
          ? analysis.startFen
          : analysis.moves[currentPly - 1]?.fenAfter ?? analysis.startFen;
      const nextMain = analysis.moves[currentPly];
      if (nextMain) {
        try {
          const probe = new Chess(anchorFen);
          const attempt = promotion
            ? probe.move({ from, to, promotion })
            : (() => {
                try {
                  return probe.move({ from, to });
                } catch {
                  return probe.move({ from, to, promotion: "q" });
                }
              })();
          if (attempt) {
            const playedUci = `${attempt.from}${attempt.to}${attempt.promotion ?? ""}`;
            if (playedUci === nextMain.uci) {
              get().jumpToPly(currentPly + 1);
              return { moved: true, mode: "mainline" };
            }
          }
        } catch {
          // Illegal move handled cleanly below
        }
      }

      const res = playVariationMove(variationTree, {
        anchorPly: currentPly,
        anchorFen,
        parentId: null,
        from,
        to,
        promotion,
      });
      if (!res.moved || !res.node) return { moved: false };
      set({
        variationTree: res.tree,
        activeVariationNodeId: res.node.id,
        showBestMove: false,
        bestMovePreviewIndex: 0,
        retryState: INITIAL_RETRY_STATE,
      });
      return { moved: true, mode: "variation", nodeId: res.node.id };
    }

    const activeNode = variationTree.nodes[activeVariationNodeId];
    if (!activeNode) return { moved: false };

    const res = playVariationMove(variationTree, {
      anchorPly: activeNode.anchorPly,
      anchorFen: activeNode.fenAfter,
      parentId: activeNode.id,
      from,
      to,
      promotion,
    });
    if (!res.moved || !res.node) return { moved: false };
    set({
      variationTree: res.tree,
      activeVariationNodeId: res.node.id,
      showBestMove: false,
      bestMovePreviewIndex: 0,
      retryState: INITIAL_RETRY_STATE,
    });
    return { moved: true, mode: "variation", nodeId: res.node.id };
  },

  explorePvLineInTree: ({ anchorPly, sanMoves, stepIndex = 0, parentNodeId = null }) => {
    const { analysis, variationTree } = get();
    if (!analysis || sanMoves.length === 0) return null;

    const clampedAnchor = Math.max(0, Math.min(analysis.moves.length, anchorPly));
    const anchorFen =
      clampedAnchor === 0
        ? analysis.startFen
        : analysis.moves[clampedAnchor - 1]?.fenAfter ?? analysis.startFen;

    const parentNode = parentNodeId ? variationTree.nodes[parentNodeId] : undefined;
    const res = addVariationLine(variationTree, {
      anchorPly: parentNode ? parentNode.anchorPly : clampedAnchor,
      anchorFen,
      parentId: parentNode ? parentNode.id : null,
      sanMoves,
    });
    if (res.nodeIds.length === 0) return null;

    const targetId =
      res.nodeIds[Math.max(0, Math.min(res.nodeIds.length - 1, stepIndex))];
    const targetNode = res.tree.nodes[targetId];
    if (!targetNode) return null;

    set({
      variationTree: res.tree,
      currentPly: targetNode.anchorPly,
      activeVariationNodeId: targetId,
      showBestMove: false,
      bestMovePreviewIndex: 0,
      retryState: INITIAL_RETRY_STATE,
    });
    return targetId;
  },

  attachVariationEval: (nodeId, posEval) =>
    set((state) => ({
      variationTree: attachVariationNodeEval(state.variationTree, nodeId, posEval),
    })),

  deleteVariationBranchById: (nodeId) =>
    set((state) => {
      const del = deleteVariationBranch(state.variationTree, nodeId);
      if (state.activeVariationNodeId === null) {
        return {
          variationTree: del.tree,
          activeVariationNodeId: null,
          currentPly: state.currentPly,
        };
      }
      const activeStillExists = Boolean(del.tree.nodes[state.activeVariationNodeId]);
      return {
        variationTree: del.tree,
        activeVariationNodeId: activeStillExists
          ? state.activeVariationNodeId
          : del.fallbackParentId,
        currentPly:
          activeStillExists || del.fallbackAnchorPly === null
            ? state.currentPly
            : del.fallbackAnchorPly,
      };
    }),

  promoteVariationById: (nodeId) =>
    set((state) => ({
      variationTree: promoteVariationChild(state.variationTree, nodeId),
    })),

  clearVariationTree: () =>
    set({
      variationTree: createEmptyVariationTree(),
      activeVariationNodeId: null,
    }),

  goToEnd: () => {
    const { analysis } = get();
    get().jumpToPly(analysis ? analysis.moves.length : 0);
  },

  nextKeyMoment: () => {
    const { analysis, currentPly } = get();
    if (!analysis) return;

    const nextKey = analysis.moves.find(
      (m) => m.ply > currentPly && m.classification.isKeyMoment
    );
    if (nextKey) {
      get().jumpToPly(nextKey.ply);
      return;
    }

    // Wrap around from beginning if none ahead
    const firstKey = analysis.moves.find((m) => m.classification.isKeyMoment);
    if (firstKey) {
      get().jumpToPly(firstKey.ply);
    }
  },

  flipBoard: () => set((state) => ({ boardFlipped: !state.boardFlipped })),

  toggleShowBestMove: () =>
    set((state) => {
      const nextShow = !state.showBestMove;
      const move = getActiveMove(state.analysis, state.currentPly);
      const maxSteps = move ? Math.min(6, move.bestMovePvSan.length) : 0;
      return {
        showBestMove: nextShow,
        bestMovePreviewIndex: nextShow && maxSteps > 0 ? 1 : 0,
      };
    }),

  stepBestMoveLine: (delta) =>
    set((state) => {
      const move = getActiveMove(state.analysis, state.currentPly);
      const maxSteps = move ? Math.min(6, move.bestMovePvSan.length) : 0;
      const nextIdx = Math.max(0, Math.min(maxSteps, state.bestMovePreviewIndex + delta));
      return { bestMovePreviewIndex: nextIdx, showBestMove: true };
    }),

  startRetryMode: () => {
    const { analysis, currentPly } = get();
    const move = getActiveMove(analysis, currentPly);
    if (!move) return;

    set({
      showBestMove: false,
      bestMovePreviewIndex: 0,
      playMode: INITIAL_PLAY_MODE_STATE,
      retryState: {
        active: true,
        ply: move.ply,
        fen: move.fenBefore,
        targetUci: move.bestMoveUci,
        targetSan: move.bestMoveSan,
        status: "prompt",
        feedback: `Find a stronger move than ${move.san}!`,
        attempts: 0,
      },
    });
  },

  startPunishMode: () => {
    const { analysis, currentPly } = get();
    const move = getActiveMove(analysis, currentPly);
    if (!analysis || !move) return;

    // Punishment starts AFTER the opponent's error (`move.fenAfter`) for the player on move
    const nextMove = analysis.moves[move.ply] ?? null;
    let targetUci = nextMove?.bestMoveUci ?? "";
    let targetSan = nextMove?.bestMoveSan ?? "";

    if ((!targetUci || !targetSan) && move.refutationPvSan && move.refutationPvSan.length > 0) {
      const sanCandidate = move.refutationPvSan[0];
      try {
        const probe = new Chess(move.fenAfter);
        const resolved = probe.move(sanCandidate);
        if (resolved) {
          targetUci = `${resolved.from}${resolved.to}${resolved.promotion ?? ""}`;
          targetSan = resolved.san;
        }
      } catch {
        // Invalid refutation SAN in fixture
      }
    }

    if (!targetUci || !targetSan) return;

    const actor = move.color === "w" ? "White" : "Black";
    set({
      showBestMove: false,
      bestMovePreviewIndex: 0,
      playMode: INITIAL_PLAY_MODE_STATE,
      retryState: {
        active: true,
        ply: move.ply,
        fen: move.fenAfter,
        targetUci,
        targetSan,
        status: "prompt",
        feedback: `Punish ${actor}'s ${move.san} — find the best reply!`,
        attempts: 0,
      },
    });
  },

  exitRetryMode: () => set({ retryState: INITIAL_RETRY_STATE }),

  submitRetryMove: (from, to, promotion) => {
    const { retryState } = get();
    if (!retryState.active || !retryState.fen || !retryState.targetUci) {
      return { solved: false };
    }
    if (retryState.status === "solved") {
      return { solved: true };
    }

    const chess = new Chess(retryState.fen);
    let played = null;
    try {
      played = promotion
        ? chess.move({ from, to, promotion })
        : chess.move({ from, to, promotion: "q" });
    } catch {
      if (!promotion) {
        // Retry without promotion if non-promotion move
        try {
          played = chess.move({ from, to });
        } catch {
          played = null;
        }
      }
    }

    if (!played) {
      return { solved: false };
    }

    const playedUci = `${played.from}${played.to}${played.promotion ?? ""}`;
    const isMatch =
      playedUci === retryState.targetUci ||
      played.san === retryState.targetSan;

    if (isMatch) {
      set({
        retryState: {
          ...retryState,
          fen: chess.fen(),
          status: "solved",
          feedback: `Great find! ${played.san} was the engine's top move.`,
          attempts: retryState.attempts + 1,
        },
      });
      return { solved: true, san: played.san };
    }

    set({
      retryState: {
        ...retryState,
        status: "incorrect",
        feedback: `${played.san} isn't the strongest move here. Try another idea!`,
        attempts: retryState.attempts + 1,
      },
    });
    return { solved: false, san: played.san };
  },

  startPlayMode: (mode = "board", activeCustomFen = null) => {
    const { analysis, currentPly, coachColor, activeVariationNodeId, variationTree } = get();
    const activeVarNode =
      mode === "board" && activeVariationNodeId
        ? variationTree.nodes[activeVariationNodeId]
        : undefined;
    const effectiveCustomFen =
      activeCustomFen ?? (activeVarNode ? activeVarNode.fenAfter : null);

    const anchor = resolvePlayAnchor({
      analysis,
      currentPly,
      activeCustomFen: effectiveCustomFen,
      coachColor,
      startMode: mode,
    });
    const matched = resolveMatchedElo(analysis, coachColor);

    let initialWhiteCp = 0;
    let initialWhiteMate: number | undefined;
    let initialEval: PositionEval | null = null;

    if (activeVarNode?.eval && activeVarNode.fenAfter === anchor.fen) {
      initialEval = activeVarNode.eval;
      initialWhiteCp = activeVarNode.eval.whiteCp;
      initialWhiteMate = activeVarNode.eval.whiteMate;
    } else if (analysis && !effectiveCustomFen) {
      if (anchor.anchorPly === 0) {
        initialWhiteCp = analysis.startEval?.whiteCp ?? 0;
        initialWhiteMate = analysis.startEval?.whiteMate;
      } else {
        const anchorMove = analysis.moves[anchor.anchorPly - 1];
        if (anchorMove) {
          initialWhiteCp = anchorMove.whiteCp;
          initialWhiteMate = anchorMove.whiteMate;
        }
      }
    }

    const gameOver = getPlayGameOverStatus(anchor.fen, anchor.userColor);
    const engineToMoveFirst = !gameOver && getFenTurn(anchor.fen) !== anchor.userColor;

    set({
      ...(mode === "before-move" ? { activeVariationNodeId: null } : {}),
      showBestMove: false,
      bestMovePreviewIndex: 0,
      retryState: INITIAL_RETRY_STATE,
      playMode: {
        active: true,
        startMode: mode,
        anchorFen: anchor.fen,
        anchorPly: anchor.anchorPly,
        anchorDescription: anchor.description,
        anchorWhiteCp: initialWhiteCp,
        anchorWhiteMate: initialWhiteMate,
        userColor: anchor.userColor,
        targetElo: matched.elo,
        matchedElo: matched.elo,
        matchedEloSource: matched.source,
        fen: anchor.fen,
        moves: [],
        undoStack: [],
        lastMove: null,
        currentEval: initialEval,
        evalWhiteCp: initialWhiteCp,
        evalWhiteMate: initialWhiteMate,
        isThinking: engineToMoveFirst,
        isEvaluatingMove: false,
        showBestMove: false,
        gameOver,
      },
    });
  },

  setPlayTargetElo: (elo) =>
    set((state) => ({
      playMode: {
        ...state.playMode,
        targetElo: clampPlayElo(elo),
      },
    })),

  togglePlayBestMove: () =>
    set((state) => ({
      playMode: {
        ...state.playMode,
        showBestMove: !state.playMode.showBestMove,
      },
    })),

  setPlayShowBestMove: (show) =>
    set((state) => ({
      playMode: {
        ...state.playMode,
        showBestMove: show,
      },
    })),

  setPlayThinking: (isThinking) =>
    set((state) => ({
      playMode: {
        ...state.playMode,
        isThinking,
      },
    })),

  setPlayEvaluatingMove: (isEvaluatingMove) =>
    set((state) => ({
      playMode: {
        ...state.playMode,
        isEvaluatingMove,
      },
    })),

  recordPlayEngineEval: (posEval) =>
    set((state) => {
      if (!state.playMode.active || posEval.fen !== state.playMode.fen) {
        return state;
      }
      return {
        playMode: {
          ...state.playMode,
          currentEval: posEval,
          evalWhiteCp: posEval.whiteCp,
          evalWhiteMate: posEval.whiteMate,
        },
      };
    }),

  applyUserPlayMove: ({ from, to, promotion }) => {
    const pm = get().playMode;
    if (!pm.active || pm.gameOver || pm.isThinking) {
      return { moved: false };
    }

    try {
      const chess = new Chess(pm.fen);
      if (chess.turn() !== pm.userColor) {
        return { moved: false };
      }
      const move = chess.move({
        from,
        to,
        promotion: promotion as "q" | "r" | "b" | "n" | undefined,
      });
      if (!move) return { moved: false };

      const fenAfter = chess.fen();
      const snapshot: PlayUndoSnapshot = {
        fen: pm.fen,
        moves: pm.moves,
        lastMove: pm.lastMove,
        currentEval: pm.currentEval,
        evalWhiteCp: pm.evalWhiteCp,
        evalWhiteMate: pm.evalWhiteMate,
      };
      const record: PlayMoveRecord = {
        id: `play-${pm.moves.length + 1}-${move.from}${move.to}`,
        ply: pm.anchorPly + pm.moves.length + 1,
        moveNumber: new Chess(pm.fen).moveNumber(),
        color: move.color,
        san: move.san,
        uci: `${move.from}${move.to}${move.promotion ?? ""}`,
        from: move.from,
        to: move.to,
        fenBefore: pm.fen,
        fenAfter,
        by: "user",
      };
      const gameOver = getPlayGameOverStatus(fenAfter, pm.userColor);

      set((state) => ({
        playMode: {
          ...state.playMode,
          fen: fenAfter,
          moves: [...state.playMode.moves, record],
          undoStack: [...state.playMode.undoStack, snapshot],
          lastMove: { from: move.from, to: move.to },
          currentEval: null,
          showBestMove: false,
          gameOver,
          isThinking: !gameOver,
          isEvaluatingMove: true,
        },
      }));

      return {
        moved: true,
        move: record,
        san: move.san,
        fenBefore: pm.fen,
        fenAfter,
        isGameOver: Boolean(gameOver),
      };
    } catch {
      return { moved: false };
    }
  },

  attachPlayMoveGrade: (moveId, grade) =>
    set((state) => {
      if (!state.playMode.active) return state;
      const targetExists = state.playMode.moves.some((m) => m.id === moveId);
      if (!targetExists) return state;

      const updatedMoves = state.playMode.moves.map((m) =>
        m.id === moveId
          ? {
              ...m,
              grade,
              evalAfterWhiteCp: grade.whiteCp,
              evalAfterWhiteMate: grade.whiteMate,
              evalLabel: grade.evalLabel,
            }
          : m
      );
      const stillAtMovedFen = state.playMode.fen === grade.fenAfter;

      return {
        playMode: {
          ...state.playMode,
          moves: updatedMoves,
          evalWhiteCp: stillAtMovedFen ? grade.whiteCp : state.playMode.evalWhiteCp,
          evalWhiteMate: stillAtMovedFen ? grade.whiteMate : state.playMode.evalWhiteMate,
          isEvaluatingMove: false,
        },
      };
    }),

  applyEnginePlayMove: ({ uci, evalAfter }) => {
    const pm = get().playMode;
    if (!pm.active || pm.gameOver || !uci || uci.length < 4) {
      return { moved: false };
    }

    try {
      const chess = new Chess(pm.fen);
      if (chess.turn() === pm.userColor) {
        return { moved: false };
      }

      const from = uci.slice(0, 2) as Square;
      const to = uci.slice(2, 4) as Square;
      const promotion =
        uci.length > 4 ? (uci[4] as "q" | "r" | "b" | "n") : undefined;

      const move = chess.move({ from, to, promotion });
      if (!move) return { moved: false };

      const fenAfter = chess.fen();
      const record: PlayMoveRecord = {
        id: `play-${pm.moves.length + 1}-${move.from}${move.to}`,
        ply: pm.anchorPly + pm.moves.length + 1,
        moveNumber: new Chess(pm.fen).moveNumber(),
        color: move.color,
        san: move.san,
        uci: `${move.from}${move.to}${move.promotion ?? ""}`,
        from: move.from,
        to: move.to,
        fenBefore: pm.fen,
        fenAfter,
        by: "engine",
        evalAfterWhiteCp: evalAfter?.whiteCp,
        evalAfterWhiteMate: evalAfter?.whiteMate,
      };
      const gameOver = getPlayGameOverStatus(fenAfter, pm.userColor);

      set((state) => ({
        playMode: {
          ...state.playMode,
          fen: fenAfter,
          moves: [...state.playMode.moves, record],
          lastMove: { from: move.from, to: move.to },
          currentEval: evalAfter ?? null,
          evalWhiteCp: evalAfter ? evalAfter.whiteCp : state.playMode.evalWhiteCp,
          evalWhiteMate: evalAfter ? evalAfter.whiteMate : state.playMode.evalWhiteMate,
          isThinking: false,
          gameOver,
        },
      }));

      return { moved: true, move: record, isGameOver: Boolean(gameOver) };
    } catch {
      return { moved: false };
    }
  },

  undoPlayMove: () =>
    set((state) => {
      const pm = state.playMode;
      if (!pm.active || pm.undoStack.length === 0) return state;
      const snapshot = pm.undoStack[pm.undoStack.length - 1];
      const nextUndoStack = pm.undoStack.slice(0, -1);
      return {
        playMode: {
          ...pm,
          fen: snapshot.fen,
          moves: snapshot.moves,
          undoStack: nextUndoStack,
          lastMove: snapshot.lastMove,
          currentEval: snapshot.currentEval,
          evalWhiteCp: snapshot.evalWhiteCp,
          evalWhiteMate: snapshot.evalWhiteMate,
          isThinking: false,
          isEvaluatingMove: false,
          showBestMove: false,
          gameOver: getPlayGameOverStatus(snapshot.fen, pm.userColor),
        },
      };
    }),

  restartPlayMode: () =>
    set((state) => {
      const pm = state.playMode;
      if (!pm.active) return state;
      const gameOver = getPlayGameOverStatus(pm.anchorFen, pm.userColor);
      const engineToMoveFirst =
        !gameOver && getFenTurn(pm.anchorFen) !== pm.userColor;
      return {
        playMode: {
          ...pm,
          fen: pm.anchorFen,
          moves: [],
          undoStack: [],
          lastMove: null,
          currentEval: null,
          evalWhiteCp: pm.anchorWhiteCp,
          evalWhiteMate: pm.anchorWhiteMate,
          isThinking: engineToMoveFirst,
          isEvaluatingMove: false,
          showBestMove: false,
          gameOver,
        },
      };
    }),

  exitPlayMode: () => set({ playMode: INITIAL_PLAY_MODE_STATE }),

  reset: () =>
    set({
      pgnInput: "",
      analysisStatus: "idle",
      analysisProgress: { completed: 0, total: 0 },
      analysisError: null,
      analysis: null,
      currentPly: 0,
      activeVariationNodeId: null,
      variationTree: createEmptyVariationTree(),
      boardFlipped: false,
      showBestMove: false,
      bestMovePreviewIndex: 0,
      coachColor: "white",
      plainEnglishNotation: true,
      explanations: {},
      storyline: null,
      retryState: INITIAL_RETRY_STATE,
      playMode: INITIAL_PLAY_MODE_STATE,
    }),
}));
