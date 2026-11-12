import { describe, it, expect, beforeEach } from "vitest";
import { getActiveMove, useReviewStore } from "@/lib/store/useReviewStore";
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

    // Toggling Show Best Move ON auto-steps preview index to 1 so the best move immediately plays on board
    useReviewStore.getState().toggleShowBestMove();
    expect(useReviewStore.getState().showBestMove).toBe(true);
    expect(useReviewStore.getState().bestMovePreviewIndex).toBe(1);
    useReviewStore.getState().stepBestMoveLine(1);
    expect(useReviewStore.getState().bestMovePreviewIndex).toBe(2);
    useReviewStore.getState().toggleShowBestMove();
    expect(useReviewStore.getState().showBestMove).toBe(false);
    expect(useReviewStore.getState().bestMovePreviewIndex).toBe(0);
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

    // H3.2: Further clicks after solved MUST NOT overwrite solved status back to incorrect
    const postSolve = useReviewStore.getState().submitRetryMove("d7", "d6");
    expect(postSolve.solved).toBe(true);
    expect(useReviewStore.getState().retryState.status).toBe("solved");
  });

  it("supports startPunishMode on an opponent blunder from fenAfter targeting their refutation", () => {
    const fixture = buildFixtureAnalysis();
    // Inject refutationPvSan and ply 3 white mistake so Black can punish White's move 2. Qh5?
    fixture.moves[2].classification.badge = "Mistake";
    fixture.moves[2].refutationPvSan = ["Nc6", "Bc4", "g6"];
    fixture.moves[3].bestMoveUci = "b8c6";
    fixture.moves[3].bestMoveSan = "Nc6";

    useReviewStore.getState().setAnalysis(fixture);
    useReviewStore.getState().setCoachColor("black");
    useReviewStore.getState().jumpToPly(3); // White played 2. Qh5

    useReviewStore.getState().startPunishMode();
    const punish = useReviewStore.getState().retryState;
    expect(punish.active).toBe(true);
    expect(punish.fen).toBe(fixture.moves[2].fenAfter); // Black's turn!
    expect(punish.targetUci).toBe("b8c6");
    expect(punish.targetSan).toBe("Nc6");

    const res = useReviewStore.getState().submitRetryMove("b8", "c6");
    expect(res.solved).toBe(true);
    expect(useReviewStore.getState().retryState.status).toBe("solved");
  });

  it("H3.3 & M4: supports underpromotion in Retry Mode and clears stale analysis on error", () => {
    const promoAnalysis = buildFixtureAnalysis();
    promoAnalysis.moves = [
      {
        ...promoAnalysis.moves[0],
        ply: 1,
        san: "e8=Q+",
        uci: "e7e8q",
        from: "e7",
        to: "e8",
        fenBefore: "k7/4P3/8/8/8/8/8/4K3 w - - 0 40",
        fenAfter: "k3Q3/8/8/8/8/8/8/4K3 b - - 0 40",
        bestMoveUci: "e7e8n",
        bestMoveSan: "e8=N",
        bestMovePvSan: ["e8=N"],
      },
    ];
    useReviewStore.getState().setAnalysis(promoAnalysis);
    useReviewStore.getState().jumpToPly(1);
    useReviewStore.getState().startRetryMode();

    const wrongPromo = useReviewStore.getState().submitRetryMove("e7", "e8", "q");
    expect(wrongPromo.solved).toBe(false);

    const knightPromo = useReviewStore.getState().submitRetryMove("e7", "e8", "n");
    expect(knightPromo.solved).toBe(true);
    expect(knightPromo.san).toBe("e8=N");

    // M4: setAnalysisError clears previous analysis so stale game does not remain behind error banner
    useReviewStore.getState().setAnalysisError("Invalid PGN");
    expect(useReviewStore.getState().analysis).toBeNull();
    expect(useReviewStore.getState().analysisError).toBe("Invalid PGN");
  });

  it("handles store setters, navigation boundary clamping, key moment wraparound, and reset", () => {
    const initial = useReviewStore.getState();
    expect(initial.pgnInput).toBe("");
    expect(initial.analysisStatus).toBe("idle");
    expect(initial.analysisProgress).toEqual({ completed: 0, total: 0 });
    expect(initial.boardFlipped).toBe(false);
    expect(initial.showBestMove).toBe(false);
    expect(initial.bestMovePreviewIndex).toBe(0);
    expect(initial.personaId).toBe("danny");
    expect(initial.retryState.attempts).toBe(0);

    const fixture = buildFixtureAnalysis();
    expect(getActiveMove(null, 1)).toBeNull();
    expect(getActiveMove(fixture, 0)).toBeNull();
    expect(getActiveMove(fixture, 4)?.san).toBe("Ke7");

    const store = useReviewStore.getState();
    store.setPgnInput("1. d4 d5");
    expect(useReviewStore.getState().pgnInput).toBe("1. d4 d5");

    store.setAnalyzing(2, 10);
    expect(useReviewStore.getState().analysisStatus).toBe("analyzing");
    expect(useReviewStore.getState().analysisProgress).toEqual({ completed: 2, total: 10 });
    expect(useReviewStore.getState().analysisError).toBeNull();

    store.setAnalysis(fixture);
    store.setExplanation(4, {
      badge: "Blunder",
      shortComment: "Blunder!",
      detailedExplanation: "Dropped the pawn structure.",
    });
    store.setStoryline({
      headline: "White wins cleanly",
      summary: "Strong tactical game.",
      whiteTakeaway: "Sharp pressure.",
      blackTakeaway: "Watch king safety.",
    });
    expect(useReviewStore.getState().explanations[4]?.shortComment).toBe("Blunder!");
    expect(useReviewStore.getState().storyline?.headline).toBe("White wins cleanly");

    // Switching persona clears cached move explanations & storyline
    store.setPersonaId("sage");
    expect(useReviewStore.getState().personaId).toBe("sage");
    expect(useReviewStore.getState().explanations).toEqual({});
    expect(useReviewStore.getState().storyline).toBeNull();

    // Switching coachColor defaults to white, switches cleanly, and clears cached commentary + stale retry/punish state
    expect(useReviewStore.getState().coachColor).toBe("white");
    store.jumpToPly(4);
    store.startRetryMode();
    expect(useReviewStore.getState().retryState.active).toBe(true);
    store.setExplanation(4, {
      badge: "Blunder",
      shortComment: "Blunder!",
      detailedExplanation: "Dropped the king safety.",
    });
    store.setCoachColor("black");
    expect(useReviewStore.getState().coachColor).toBe("black");
    expect(useReviewStore.getState().explanations).toEqual({});
    expect(useReviewStore.getState().storyline).toBeNull();
    expect(useReviewStore.getState().retryState.active).toBe(false);
    expect(useReviewStore.getState().retryState.status).toBe("idle");

    // Navigation bounds
    store.jumpToPly(-5);
    expect(useReviewStore.getState().currentPly).toBe(0);
    store.prevMove();
    expect(useReviewStore.getState().currentPly).toBe(0);
    store.jumpToPly(999);
    expect(useReviewStore.getState().currentPly).toBe(fixture.moves.length);
    store.nextMove();
    expect(useReviewStore.getState().currentPly).toBe(fixture.moves.length);

    // Key moment wraps back to first key moment when already at last key moment
    useReviewStore.getState().nextKeyMoment();
    expect(useReviewStore.getState().currentPly).toBe(4);

    // Retry mode ignored at ply 0 (no active move), exited cleanly otherwise
    store.jumpToPly(0);
    store.startRetryMode();
    expect(useReviewStore.getState().retryState.active).toBe(false);
    store.jumpToPly(4);
    store.startRetryMode();
    expect(useReviewStore.getState().retryState.active).toBe(true);
    store.exitRetryMode();
    expect(useReviewStore.getState().retryState.active).toBe(false);
    expect(useReviewStore.getState().retryState.status).toBe("idle");

    // Step best move bounds
    store.stepBestMoveLine(100);
    expect(useReviewStore.getState().bestMovePreviewIndex).toBe(3);
    store.stepBestMoveLine(-100);
    expect(useReviewStore.getState().bestMovePreviewIndex).toBe(0);

    // Plain English coach notation defaults to true and toggles cleanly
    expect(useReviewStore.getState().plainEnglishNotation).toBe(true);
    store.togglePlainEnglishNotation();
    expect(useReviewStore.getState().plainEnglishNotation).toBe(false);
    store.setPlainEnglishNotation(true);
    expect(useReviewStore.getState().plainEnglishNotation).toBe(true);
    store.setPlainEnglishNotation(false);

    // clearExplanations invalidates cached move explanations and storyline while retaining analysis
    store.setExplanation(1, {
      badge: "Best",
      shortComment: "Solid move.",
      detailedExplanation: "Good central development.",
    });
    store.setStoryline({
      headline: "Test game",
      summary: "Summary",
      whiteTakeaway: "W",
      blackTakeaway: "B",
    });
    expect(useReviewStore.getState().explanations[1]).toBeDefined();
    store.clearExplanations();
    expect(useReviewStore.getState().explanations).toEqual({});
    expect(useReviewStore.getState().storyline).toBeNull();
    expect(useReviewStore.getState().analysis).not.toBeNull();

    // Reset clears everything cleanly
    store.flipBoard();
    store.reset();
    expect(useReviewStore.getState().plainEnglishNotation).toBe(true);
    expect(useReviewStore.getState().analysis).toBeNull();
    expect(useReviewStore.getState().pgnInput).toBe("");
    expect(useReviewStore.getState().analysisStatus).toBe("idle");
    expect(useReviewStore.getState().analysisProgress).toEqual({ completed: 0, total: 0 });
    expect(useReviewStore.getState().boardFlipped).toBe(false);
    expect(useReviewStore.getState().showBestMove).toBe(false);
    expect(useReviewStore.getState().bestMovePreviewIndex).toBe(0);
    expect(useReviewStore.getState().currentPly).toBe(0);
    expect(useReviewStore.getState().explanations).toEqual({});
    expect(useReviewStore.getState().storyline).toBeNull();
  });
});

describe("Play-from-Position store state", () => {
  beforeEach(() => {
    useReviewStore.getState().reset();
  });

  it("initializes Play Mode from current board or before-move error with matched ELO and opponent-first support", () => {
    const fixture = buildFixtureAnalysis();
    const store = useReviewStore.getState();
    store.setAnalysis(fixture);
    store.setCoachColor("black");
    store.jumpToPly(4); // Black's 2... Ke7?? blunder

    // Mutually exclusive with retry mode
    store.startRetryMode();
    expect(useReviewStore.getState().retryState.active).toBe(true);

    store.startPlayMode("before-move");
    let pm = useReviewStore.getState().playMode;
    expect(useReviewStore.getState().retryState.active).toBe(false);
    expect(pm.active).toBe(true);
    expect(pm.startMode).toBe("before-move");
    expect(pm.anchorFen).toBe(fixture.moves[3].fenBefore);
    expect(pm.fen).toBe(fixture.moves[3].fenBefore);
    expect(pm.userColor).toBe("b");
    expect(pm.matchedElo).toBe(1120); // Black estimated ELO from fixture
    expect(pm.targetElo).toBe(1120);
    expect(pm.isThinking).toBe(false); // Black to move in fenBefore of 2...Ke7

    // Starting at ply 1 (1. e4) for Black (ply 1 fenAfter has Black to move -> false,
    // wait: at ply 2 fenAfter (1...e5), it is White's turn while userColor is Black -> engine moves first!)
    store.jumpToPly(2);
    store.startPlayMode("board");
    pm = useReviewStore.getState().playMode;
    expect(pm.fen).toBe(fixture.moves[1].fenAfter);
    expect(pm.isThinking).toBe(true);
  });

  it("applies user moves, grades, engine replies, 2-ply undo, 1-ply undo during engine turn, restart, and exit", () => {
    const fixture = buildFixtureAnalysis();
    const store = useReviewStore.getState();
    store.setAnalysis(fixture);
    store.setCoachColor("white");
    store.jumpToPly(0);
    store.startPlayMode("board");

    // Pre-evaluation on user turn + Show Best Move toggle
    store.recordPlayEngineEval({
      fen: useReviewStore.getState().playMode.fen,
      depth: 12,
      bestMoveUci: "e2e4",
      bestMoveSan: "e4",
      whiteCp: 25,
      lines: [{ multipv: 1, cp: 25, pvUci: ["e2e4", "e7e5"], pvSan: ["e4", "e5"] }],
    });
    store.togglePlayBestMove();
    expect(useReviewStore.getState().playMode.showBestMove).toBe(true);
    expect(useReviewStore.getState().playMode.currentEval?.bestMoveSan).toBe("e4");

    // ELO control clamps to [400, 3190]
    store.setPlayTargetElo(150);
    expect(useReviewStore.getState().playMode.targetElo).toBe(400);
    store.setPlayTargetElo(1800);
    expect(useReviewStore.getState().playMode.targetElo).toBe(1800);

    // User plays 1. e4
    const res = store.applyUserPlayMove({ from: "e2", to: "e4" });
    expect(res.moved).toBe(true);
    expect(res.san).toBe("e4");
    let pm = useReviewStore.getState().playMode;
    expect(pm.moves).toHaveLength(1);
    expect(pm.undoStack).toHaveLength(1);
    expect(pm.showBestMove).toBe(false);
    expect(pm.isThinking).toBe(true);
    expect(pm.isEvaluatingMove).toBe(true);

    // Stockfish replies 1... e5
    const engRes = store.applyEnginePlayMove({
      uci: "e7e5",
      evalAfter: {
        fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
        depth: 10,
        bestMoveUci: "g1f3",
        bestMoveSan: "Nf3",
        whiteCp: 30,
        lines: [],
      },
    });
    expect(engRes.moved).toBe(true);
    pm = useReviewStore.getState().playMode;
    expect(pm.moves).toHaveLength(2);
    expect(pm.undoStack).toHaveLength(1); // Still 1 snapshot (atomic undo skips back to before user move)
    expect(pm.isThinking).toBe(false);

    // Undo after engine reply pops back 2 plies to start position
    store.undoPlayMove();
    pm = useReviewStore.getState().playMode;
    expect(pm.fen).toBe(fixture.startFen);
    expect(pm.moves).toHaveLength(0);
    expect(pm.undoStack).toHaveLength(0);
    expect(pm.isThinking).toBe(false);

    // Play 1. e4 again and Undo IMMEDIATELY before engine replies (1-ply rollback)
    store.applyUserPlayMove({ from: "e2", to: "e4" });
    expect(useReviewStore.getState().playMode.isThinking).toBe(true);
    store.undoPlayMove();
    expect(useReviewStore.getState().playMode.moves).toHaveLength(0);
    expect(useReviewStore.getState().playMode.isThinking).toBe(false);

    // Play 1. e4 then Restart Here
    store.applyUserPlayMove({ from: "e2", to: "e4" });
    store.restartPlayMode();
    expect(useReviewStore.getState().playMode.fen).toBe(fixture.startFen);
    expect(useReviewStore.getState().playMode.moves).toHaveLength(0);
    expect(useReviewStore.getState().playMode.targetElo).toBe(1800);

    // Exit returns to inactive state cleanly
    store.exitPlayMode();
    expect(useReviewStore.getState().playMode.active).toBe(false);
    expect(useReviewStore.getState().playMode.moves).toHaveLength(0);
  });

  it("supports Analysis variation tree exploration, branching, PV import, navigation, deletion, and Play Mode launch", () => {
    const fixture = buildFixtureAnalysis();
    const store = useReviewStore.getState();
    store.setAnalysis(fixture);
    store.setCoachColor("white");
    store.jumpToPly(0);

    // Playing mainline 1. e4 advances along mainline without creating a branch
    const mainRes = store.playAnalysisMove("e2", "e4");
    expect(mainRes).toEqual({ moved: true, mode: "mainline" });
    expect(useReviewStore.getState().currentPly).toBe(1);
    expect(useReviewStore.getState().activeVariationNodeId).toBeNull();

    // Playing 1...c5 (diverging from mainline 1...e5) creates a variation anchored at ply 1
    const var1 = store.playAnalysisMove("c7", "c5");
    expect(var1.moved).toBe(true);
    expect(var1.mode).toBe("variation");
    expect(var1.nodeId).toBeTruthy();

    // Extend with 2. Nf3 inside variation
    const var2 = store.playAnalysisMove("g1", "f3");
    expect(var2.moved).toBe(true);
    expect(var2.mode).toBe("variation");
    expect(useReviewStore.getState().activeVariationNodeId).toBe(var2.nodeId);

    // Attach cached live Stockfish eval onto var2 node
    const node2Fen = useReviewStore.getState().variationTree.nodes[var2.nodeId!].fenAfter;
    store.attachVariationEval(var2.nodeId!, {
      fen: node2Fen,
      depth: 14,
      bestMoveUci: "d7d6",
      bestMoveSan: "d6",
      whiteCp: 42,
      lines: [{ multipv: 1, cp: 42, pvUci: ["d7d6"], pvSan: ["d6"] }],
    });
    expect(useReviewStore.getState().variationTree.nodes[var2.nodeId!].eval?.bestMoveSan).toBe("d6");

    // Launching Play Here while on var2 anchors Play Mode at var2 FEN & cached eval
    store.startPlayMode("board");
    let pm = useReviewStore.getState().playMode;
    expect(pm.active).toBe(true);
    expect(pm.fen).toBe(node2Fen);
    expect(pm.evalWhiteCp).toBe(42);
    store.exitPlayMode();

    // Stepping prevMove steps back to 1...c5, then back to mainline ply 1 (activeVariationNodeId === null)
    store.jumpToVariationNode(var2.nodeId!);
    store.prevMove();
    expect(useReviewStore.getState().activeVariationNodeId).toBe(var1.nodeId);
    store.prevMove();
    expect(useReviewStore.getState().activeVariationNodeId).toBeNull();
    expect(useReviewStore.getState().currentPly).toBe(1);

    // Stepping nextMove from ply 1 advances along mainline to ply 2
    store.nextMove();
    expect(useReviewStore.getState().currentPly).toBe(2);

    // Clicking back into var1 and stepping nextMove follows variation forward to var2
    store.jumpToVariationNode(var1.nodeId!);
    store.nextMove();
    expect(useReviewStore.getState().activeVariationNodeId).toBe(var2.nodeId);

    // Explore PV line into tree off ply 1 (e.g. 1...Nf6 2. e5 Nd5) and promote it
    const importedId = store.explorePvLineInTree({
      anchorPly: 1,
      sanMoves: ["Nf6", "e5", "Nd5"],
      stepIndex: 1,
    });
    expect(importedId).toBeTruthy();
    expect(useReviewStore.getState().activeVariationNodeId).toBe(importedId);
    const rootNf6Id = useReviewStore.getState().variationTree.nodes[importedId!].parentId!;
    store.promoteVariationById(rootNf6Id);
    expect(useReviewStore.getState().variationTree.rootsByAnchorPly[1][0]).toBe(rootNf6Id);

    // Deleting active branch falls back cleanly to anchorPly 1 mainline
    store.deleteVariationBranchById(rootNf6Id);
    expect(useReviewStore.getState().activeVariationNodeId).toBeNull();
    expect(useReviewStore.getState().currentPly).toBe(1);
    expect(useReviewStore.getState().variationTree.nodes[importedId!]).toBeUndefined();

    // setAnalysis resets variation tree cleanly
    store.setAnalysis(fixture);
    expect(Object.keys(useReviewStore.getState().variationTree.nodes)).toHaveLength(0);
  });

  it("handles playAnalysisMove guards, promotions, sibling deletion preservation, clearVariationTree, and startPlayMode eval seeding", () => {
    const baseStore = useReviewStore.getState();
    baseStore.reset();

    // Without analysis, playAnalysisMove rejects cleanly
    expect(useReviewStore.getState().playAnalysisMove("e2", "e4")).toEqual({ moved: false });

    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const afterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    const afterE4E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
    const promoAnalysis = {
      headers: { White: "W", Black: "B" },
      opening: {
        opening: {
          eco: "C20",
          name: "King's Pawn Game",
          moves: "1. e4 e5",
          fenKey: afterE4E5,
        },
        bookPlies: 2,
        outOfBookPly: 2,
        outOfBookMoveNumber: 1,
        plyIsBook: [true, true],
        plyOpenings: [null, null],
        insight: "",
      },
      summary: {
        white: {
          accuracy: 90,
          estimatedElo: 1250,
          badgeCounts: {
            Brilliant: 0, Great: 0, Best: 1, Excellent: 0, Good: 0,
            Book: 0, Inaccuracy: 0, Mistake: 0, Miss: 0, Blunder: 0, Forced: 0,
          },
          phaseAccuracies: { opening: 90, middlegame: 90, endgame: 90 },
        },
        black: {
          accuracy: 85,
          estimatedElo: 1150,
          badgeCounts: {
            Brilliant: 0, Great: 0, Best: 1, Excellent: 0, Good: 0,
            Book: 0, Inaccuracy: 0, Mistake: 0, Miss: 0, Blunder: 0, Forced: 0,
          },
          phaseAccuracies: { opening: 85, middlegame: 85, endgame: 85 },
        },
      },
      startFen,
      startEval: {
        whiteCp: 22,
        whiteMate: undefined,
        evalLabel: "+0.22",
        pvLines: [{ multipv: 1, cp: 22, pvUci: ["e2e4"], pvSan: ["e4"] }],
      },
      moves: [
        {
          ply: 1,
          moveNumber: 1,
          color: "w" as const,
          san: "e4",
          uci: "e2e4",
          from: "e2" as const,
          to: "e4" as const,
          fenBefore: startFen,
          fenAfter: afterE4,
          whiteCp: 30,
          evalLabel: "+0.30",
          bestMoveUci: "e2e4",
          bestMoveSan: "e4",
          bestMovePvSan: ["e4"],
          altPvSan: [],
          materialSacrificed: 0,
          classification: {
            badge: "Best" as const,
            deltaWP: 0,
            accuracy: 100,
            color: "#96bc4b",
            symbol: "★",
            isBlunder: false,
            isKeyMoment: false,
          },
          tacticalContext: {
            gamePhase: "Opening" as const,
            tags: [],
            isCheck: false,
            isCastle: false,
          },
          pvLines: [],
        },
        {
          ply: 2,
          moveNumber: 1,
          color: "b" as const,
          san: "e5",
          uci: "e7e5",
          from: "e7" as const,
          to: "e5" as const,
          fenBefore: afterE4,
          fenAfter: afterE4E5,
          whiteCp: 45,
          evalLabel: "+0.45",
          bestMoveUci: "c7c5",
          bestMoveSan: "c5",
          bestMovePvSan: ["c5"],
          altPvSan: [],
          materialSacrificed: 0,
          classification: {
            badge: "Inaccuracy" as const,
            deltaWP: 3,
            accuracy: 85,
            color: "#e58f2a",
            symbol: "?!",
            isBlunder: false,
            isKeyMoment: false,
          },
          tacticalContext: {
            gamePhase: "Opening" as const,
            tags: [],
            isCheck: false,
            isCastle: false,
          },
          pvLines: [],
        },
      ],
    };

    baseStore.setAnalysis(promoAnalysis);

    // At ply 0, illegal move rejects & jumpToVariationNode("missing") is a no-op
    expect(useReviewStore.getState().playAnalysisMove("e2", "e5")).toEqual({ moved: false });
    useReviewStore.getState().jumpToVariationNode("missing-var-id");
    expect(useReviewStore.getState().activeVariationNodeId).toBeNull();

    // Start Play Mode from mainline ply 0 seeds from startEval.whiteCp (22)
    useReviewStore.setState({ showBestMove: true });
    useReviewStore.getState().startPlayMode("board");
    expect(useReviewStore.getState().playMode.active).toBe(true);
    expect(useReviewStore.getState().playMode.anchorWhiteCp).toBe(22);
    expect(useReviewStore.getState().playMode.evalWhiteCp).toBe(22);
    expect(useReviewStore.getState().playMode.isEvaluatingMove).toBe(false);
    expect(useReviewStore.getState().showBestMove).toBe(false);
    useReviewStore.getState().exitPlayMode();

    // Jump to ply 1 and seed Play Mode from mainline move whiteCp (30)
    useReviewStore.getState().jumpToPly(1);
    useReviewStore.getState().startPlayMode("board");
    expect(useReviewStore.getState().playMode.anchorWhiteCp).toBe(30);
    expect(useReviewStore.getState().playMode.evalWhiteCp).toBe(30);
    useReviewStore.getState().exitPlayMode();

    // Create two root variations off ply 1: 1...c5 -> 2. Nf3 and sibling 1...d5
    useReviewStore.getState().jumpToPly(1);
    const varC5 = useReviewStore.getState().playAnalysisMove("c7", "c5");
    expect(varC5).toMatchObject({ moved: true, mode: "variation" });
    const c5NodeId = varC5.nodeId!;

    // Illegal move inside active variation returns { moved: false }
    expect(useReviewStore.getState().playAnalysisMove("a1", "a8")).toEqual({ moved: false });

    const varNf3 = useReviewStore.getState().playAnalysisMove("g1", "f3");
    const nf3NodeId = varNf3.nodeId!;

    // Jumping out, deleting sibling should preserve active branch if activeStillExists
    useReviewStore.getState().jumpToPly(1);
    const varD5 = useReviewStore.getState().playAnalysisMove("d7", "d5");
    const d5NodeId = varD5.nodeId!;

    useReviewStore.setState({ showBestMove: true });
    useReviewStore.getState().jumpToVariationNode(nf3NodeId);
    expect(useReviewStore.getState().showBestMove).toBe(false);

    // prevMove from child returns to parent (c5) and clears showBestMove
    useReviewStore.setState({ showBestMove: true });
    useReviewStore.getState().prevMove();
    expect(useReviewStore.getState().activeVariationNodeId).toBe(c5NodeId);
    expect(useReviewStore.getState().showBestMove).toBe(false);

    // nextMove steps back forward into nf3 and clears showBestMove
    useReviewStore.setState({ showBestMove: true });
    useReviewStore.getState().nextMove();
    expect(useReviewStore.getState().activeVariationNodeId).toBe(nf3NodeId);
    expect(useReviewStore.getState().showBestMove).toBe(false);

    // Deleting unrelated sibling d5 keeps active branch nf3 untouched
    useReviewStore.getState().deleteVariationBranchById(d5NodeId);
    expect(useReviewStore.getState().activeVariationNodeId).toBe(nf3NodeId);

    // Attach eval to active variation node & verify startPlayMode seeds from it
    const activeFen = useReviewStore.getState().variationTree.nodes[nf3NodeId].fenAfter;
    useReviewStore.getState().attachVariationEval(nf3NodeId, {
      fen: activeFen,
      depth: 14,
      bestMoveUci: "d2d4",
      bestMoveSan: "d4",
      whiteCp: 245,
      whiteMate: 4,
      lines: [],
    });
    useReviewStore.getState().startPlayMode("board");
    expect(useReviewStore.getState().playMode.anchorWhiteCp).toBe(245);
    expect(useReviewStore.getState().playMode.anchorWhiteMate).toBe(4);
    expect(useReviewStore.getState().playMode.evalWhiteCp).toBe(245);
    expect(useReviewStore.getState().playMode.evalWhiteMate).toBe(4);
    expect(useReviewStore.getState().playMode.currentEval?.whiteCp).toBe(245);
    expect(useReviewStore.getState().playMode.fen).toBe(activeFen);
    useReviewStore.getState().exitPlayMode();

    // Stepping back twice from nf3 -> c5 -> mainline anchorPly 1
    useReviewStore.getState().prevMove();
    useReviewStore.getState().prevMove();
    expect(useReviewStore.getState().activeVariationNodeId).toBeNull();
    expect(useReviewStore.getState().currentPly).toBe(1);

    // clearVariationTree wipes all variation nodes cleanly
    useReviewStore.getState().jumpToVariationNode(nf3NodeId);
    useReviewStore.getState().clearVariationTree();
    expect(Object.keys(useReviewStore.getState().variationTree.nodes)).toHaveLength(0);
    expect(useReviewStore.getState().activeVariationNodeId).toBeNull();
  });

  it("supports pawn promotion & auto-queen in playAnalysisMove from a custom FEN endgame", () => {
    const promoStore = useReviewStore.getState();
    promoStore.reset();
    const promoStart = "4k3/P7/8/8/8/8/8/4K3 w - - 0 1";
    const promoAfterQ = "Q3k3/8/8/8/8/8/8/4K3 b - - 0 1";
    promoStore.setAnalysis({
      headers: { White: "W", Black: "B" },
      opening: {
        opening: null,
        bookPlies: 0,
        outOfBookPly: 0,
        outOfBookMoveNumber: 1,
        plyIsBook: [false],
        plyOpenings: [null],
        insight: "",
      },
      summary: {
        white: {
          accuracy: 100, estimatedElo: 1500,
          badgeCounts: { Brilliant: 0, Great: 0, Best: 1, Excellent: 0, Good: 0, Book: 0, Inaccuracy: 0, Mistake: 0, Miss: 0, Blunder: 0, Forced: 0 },
          phaseAccuracies: { opening: 100, middlegame: 100, endgame: 100 },
        },
        black: {
          accuracy: 100, estimatedElo: 1500,
          badgeCounts: { Brilliant: 0, Great: 0, Best: 0, Excellent: 0, Good: 0, Book: 0, Inaccuracy: 0, Mistake: 0, Miss: 0, Blunder: 0, Forced: 0 },
          phaseAccuracies: { opening: 100, middlegame: 100, endgame: 100 },
        },
      },
      startFen: promoStart,
      moves: [
        {
          ply: 1,
          moveNumber: 1,
          color: "w",
          san: "Ke2",
          uci: "e1e2",
          from: "e1",
          to: "e2",
          fenBefore: promoStart,
          fenAfter: promoAfterQ,
          whiteCp: 0,
          evalLabel: "0.00",
          bestMoveUci: "a7a8q",
          bestMoveSan: "a8=Q+",
          bestMovePvSan: ["a8=Q+"],
          altPvSan: [],
          materialSacrificed: 0,
          classification: {
            badge: "Best",
            deltaWP: 0,
            accuracy: 100,
            color: "#96bc4b",
            symbol: "★",
            isBlunder: false,
            isKeyMoment: false,
          },
          tacticalContext: { gamePhase: "Endgame", tags: [], isCheck: false, isCastle: false },
        },
      ],
    });

    // At ply 0, omit promotion triggers auto-queen mainline mismatch -> creates variation a8=Q+
    const autoPromo = useReviewStore.getState().playAnalysisMove("a7", "a8");
    expect(autoPromo).toMatchObject({ moved: true, mode: "variation" });
    expect(useReviewStore.getState().variationTree.nodes[autoPromo.nodeId!].uci).toBe("a7a8q");

    // Explicit knight underpromotion at ply 0 creates distinct branch a8=N
    useReviewStore.getState().jumpToPly(0);
    const explicitUnderpromo = useReviewStore.getState().playAnalysisMove("a7", "a8", "n");
    expect(explicitUnderpromo).toMatchObject({ moved: true, mode: "variation" });
    expect(useReviewStore.getState().variationTree.nodes[explicitUnderpromo.nodeId!].san).toBe("a8=N");

    // M1: Deleting any branch while viewing mainline preserves activeVariationNodeId=null and currentPly
    useReviewStore.getState().jumpToPly(1);
    const branchToDeleteId = explicitUnderpromo.nodeId!;
    useReviewStore.getState().deleteVariationBranchById(branchToDeleteId);
    expect(useReviewStore.getState().activeVariationNodeId).toBeNull();
    expect(useReviewStore.getState().currentPly).toBe(1);

    // H5: startPlayMode("before-move") clears any lingering activeVariationNodeId
    useReviewStore.getState().jumpToPly(0);
    const secondVar = useReviewStore.getState().playAnalysisMove("a7", "a8");
    expect(secondVar).toMatchObject({ moved: true, mode: "variation" });
    expect(useReviewStore.getState().activeVariationNodeId).toBe(secondVar.nodeId);
    useReviewStore.getState().startPlayMode("before-move");
    expect(useReviewStore.getState().activeVariationNodeId).toBeNull();
    useReviewStore.getState().exitPlayMode();
    expect(useReviewStore.getState().activeVariationNodeId).toBeNull();
  });
});
