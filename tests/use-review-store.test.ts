import { describe, it, expect, beforeEach } from "vitest";
import { useReviewStore } from "@/lib/store/useReviewStore";
import type { GameAnalysis } from "@/lib/analysis/game-analyzer";

function buildFixtureAnalysis(): GameAnalysis {
  return {
    headers: {
      White: "PlayerOne",
      Black: "PlayerTwo",
      Result: "1-0",
    },
    startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    opening: {
      opening: { eco: "C20", name: "King's Pawn Game", moves: "1. e4 e5", fenKey: "" },
      bookPlies: 2,
      outOfBookPly: 3,
      outOfBookMoveNumber: 2,
      plyIsBook: [true, true, false, false],
      plyOpenings: [null, null, null, null],
      insight: "Classical open game.",
    },
    summary: {
      white: {
        accuracy: 88.5,
        estimatedElo: 1850,
        badgeCounts: {
          Brilliant: 0, Great: 0, Best: 1, Excellent: 0, Good: 0,
          Book: 1, Inaccuracy: 0, Mistake: 0, Miss: 0, Blunder: 0, Forced: 0,
        },
        phaseAccuracies: { opening: 100, middlegame: 88.5, endgame: 100 },
      },
      black: {
        accuracy: 52.0,
        estimatedElo: 1120,
        badgeCounts: {
          Brilliant: 0, Great: 0, Best: 0, Excellent: 0, Good: 0,
          Book: 1, Inaccuracy: 0, Mistake: 0, Miss: 0, Blunder: 1, Forced: 0,
        },
        phaseAccuracies: { opening: 100, middlegame: 52.0, endgame: 100 },
      },
    },
    moves: [
      {
        ply: 1,
        moveNumber: 1,
        color: "w",
        san: "e4",
        uci: "e2e4",
        from: "e2",
        to: "e4",
        fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        fenAfter: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
        whiteCp: 25,
        evalLabel: "+0.3",
        bestMoveUci: "e2e4",
        bestMoveSan: "e4",
        bestMovePvSan: ["e4", "e5"],
        altPvSan: [],
        materialSacrificed: 0,
        classification: {
          badge: "Book", deltaWP: 0, accuracy: 100, color: "#a88a68", symbol: "📖", isBlunder: false, isKeyMoment: false,
        },
        tacticalContext: { tags: ["CENTER_CONTROL"], isCheck: false, isCastle: false, gamePhase: "Opening" },
      },
      {
        ply: 2,
        moveNumber: 1,
        color: "b",
        san: "e5",
        uci: "e7e5",
        from: "e7",
        to: "e5",
        fenBefore: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
        fenAfter: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
        whiteCp: 20,
        evalLabel: "+0.2",
        bestMoveUci: "e7e5",
        bestMoveSan: "e5",
        bestMovePvSan: ["e5", "Nf3"],
        altPvSan: [],
        materialSacrificed: 0,
        classification: {
          badge: "Book", deltaWP: 0, accuracy: 100, color: "#a88a68", symbol: "📖", isBlunder: false, isKeyMoment: false,
        },
        tacticalContext: { tags: ["CENTER_CONTROL"], isCheck: false, isCastle: false, gamePhase: "Opening" },
      },
      {
        ply: 3,
        moveNumber: 2,
        color: "w",
        san: "Qh5",
        uci: "d1h5",
        from: "d1",
        to: "h5",
        fenBefore: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
        fenAfter: "rnbqkbnr/pppp1ppp/8/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2",
        whiteCp: 0,
        evalLabel: "0.0",
        bestMoveUci: "d1h5",
        bestMoveSan: "Qh5",
        bestMovePvSan: ["Qh5", "Nc6", "Bc4"],
        altPvSan: ["Nf3", "Nc6"],
        materialSacrificed: 0,
        classification: {
          badge: "Best", deltaWP: 0, accuracy: 100, color: "#96bc4b", symbol: "★", isBlunder: false, isKeyMoment: false,
        },
        tacticalContext: { tags: [], isCheck: false, isCastle: false, gamePhase: "Opening" },
      },
      {
        ply: 4,
        moveNumber: 2,
        color: "b",
        san: "Ke7",
        uci: "e8e7",
        from: "e8",
        to: "e7",
        fenBefore: "rnbqkbnr/pppp1ppp/8/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2",
        fenAfter: "rnbq1bnr/ppppkppp/8/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR w KQ - 2 3",
        whiteCp: 10000,
        whiteMate: 1,
        evalLabel: "M1",
        bestMoveUci: "b8c6",
        bestMoveSan: "Nc6",
        bestMovePvSan: ["Nc6", "Bc4", "g6"],
        altPvSan: [],
        materialSacrificed: 0,
        classification: {
          badge: "Blunder", deltaWP: 55, accuracy: 12, color: "#fa412d", symbol: "??", isBlunder: true, isKeyMoment: true,
        },
        tacticalContext: { tags: [], isCheck: false, isCastle: false, gamePhase: "Opening" },
      },
    ],
  };
}

describe("useReviewStore (Zustand reactive review state)", () => {
  beforeEach(() => {
    useReviewStore.getState().reset();
  });

  it("navigates start, next, prev, end, and seeks straight to key moments", () => {
    const store = useReviewStore.getState();
    store.setAnalysis(buildFixtureAnalysis());

    expect(useReviewStore.getState().currentPly).toBe(0);

    useReviewStore.getState().nextMove();
    expect(useReviewStore.getState().currentPly).toBe(1);

    // Jump straight to next key moment (ply 4: Blunder Ke7)
    useReviewStore.getState().nextKeyMoment();
    expect(useReviewStore.getState().currentPly).toBe(4);

    useReviewStore.getState().prevMove();
    expect(useReviewStore.getState().currentPly).toBe(3);

    useReviewStore.getState().goToEnd();
    expect(useReviewStore.getState().currentPly).toBe(4);

    useReviewStore.getState().goToStart();
    expect(useReviewStore.getState().currentPly).toBe(0);
  });

  it("toggles board orientation and Show Best Move preview steps", () => {
    const store = useReviewStore.getState();
    store.setAnalysis(buildFixtureAnalysis());
    store.jumpToPly(4);

    expect(useReviewStore.getState().boardFlipped).toBe(false);
    useReviewStore.getState().flipBoard();
    expect(useReviewStore.getState().boardFlipped).toBe(true);

    useReviewStore.getState().toggleShowBestMove();
    expect(useReviewStore.getState().showBestMove).toBe(true);
    useReviewStore.getState().stepBestMoveLine(1);
    expect(useReviewStore.getState().bestMovePreviewIndex).toBe(1);
  });

  it("supports interactive Retry Blunder puzzle mode and evaluates user attempts", () => {
    const store = useReviewStore.getState();
    store.setAnalysis(buildFixtureAnalysis());
    store.jumpToPly(4); // Blunder 2... Ke7 (best was Nc6)

    useReviewStore.getState().startRetryMode();
    const retryState = useReviewStore.getState().retryState;
    expect(retryState.active).toBe(true);
    expect(retryState.fen).toBe(buildFixtureAnalysis().moves[3].fenBefore);

    // Wrong attempt
    const wrong = useReviewStore.getState().submitRetryMove("g8", "f6");
    expect(wrong.solved).toBe(false);
    expect(useReviewStore.getState().retryState.status).toBe("incorrect");

    // Best move attempt: b8 -> c6 (Nc6)
    const right = useReviewStore.getState().submitRetryMove("b8", "c6");
    expect(right.solved).toBe(true);
    expect(useReviewStore.getState().retryState.status).toBe("solved");
  });
});
