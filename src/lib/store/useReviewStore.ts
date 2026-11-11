import { create } from "zustand";
import { Chess } from "chess.js";
import type { AnalyzedMove, GameAnalysis } from "@/lib/analysis/game-analyzer";
import type {
  CoachExplanationResponse,
  GameStorylineResponse,
} from "@/lib/ai/gemini-coach";
import type { CoachPersonaId } from "@/lib/ai/coach-personas";

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
  explanations: Record<number, CoachExplanationResponse>;
  storyline: GameStorylineResponse | null;
  retryState: RetryState;

  setPgnInput: (pgn: string) => void;
  setAnalyzing: (completed?: number, total?: number) => void;
  setAnalysisError: (message: string) => void;
  setAnalysis: (analysis: GameAnalysis) => void;
  setCoachColor: (color: "white" | "black") => void;
  setPersonaId: (personaId: CoachPersonaId) => void;
  setExplanation: (ply: number, explanation: CoachExplanationResponse) => void;
  setStoryline: (storyline: GameStorylineResponse) => void;

  jumpToPly: (ply: number) => void;
  goToStart: () => void;
  prevMove: () => void;
  nextMove: () => void;
  goToEnd: () => void;
  nextKeyMoment: () => void;
  flipBoard: () => void;

  toggleShowBestMove: () => void;
  stepBestMoveLine: (delta: number) => void;

  startRetryMode: () => void;
  exitRetryMode: () => void;
  submitRetryMove: (from: string, to: string, promotion?: string) => { solved: boolean; san?: string };
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
  explanations: {},
  storyline: null,
  retryState: INITIAL_RETRY_STATE,

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
    }),

  setAnalysis: (analysis) =>
    set({
      analysis,
      analysisStatus: "complete",
      analysisError: null,
      currentPly: 0,
      showBestMove: false,
      bestMovePreviewIndex: 0,
      explanations: {},
      storyline: null,
      retryState: INITIAL_RETRY_STATE,
    }),

  setCoachColor: (coachColor) => set({ coachColor, explanations: {}, storyline: null }),

  setPersonaId: (personaId) => set({ personaId, explanations: {}, storyline: null }),

  setExplanation: (ply, explanation) =>
    set((state) => ({
      explanations: { ...state.explanations, [ply]: explanation },
    })),

  setStoryline: (storyline) => set({ storyline }),

  jumpToPly: (ply) => {
    const { analysis } = get();
    const maxPly = analysis ? analysis.moves.length : 0;
    const clamped = Math.max(0, Math.min(maxPly, ply));
    set({
      currentPly: clamped,
      showBestMove: false,
      bestMovePreviewIndex: 0,
      retryState: INITIAL_RETRY_STATE,
    });
  },

  goToStart: () => get().jumpToPly(0),

  prevMove: () => {
    const { currentPly } = get();
    get().jumpToPly(currentPly - 1);
  },

  nextMove: () => {
    const { currentPly } = get();
    get().jumpToPly(currentPly + 1);
  },

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

  reset: () =>
    set({
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
      explanations: {},
      storyline: null,
      retryState: INITIAL_RETRY_STATE,
    }),
}));
