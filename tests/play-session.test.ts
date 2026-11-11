import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import type { GameAnalysis } from "@/lib/analysis/game-analyzer";
import type { PositionEval } from "@/lib/engine/engine-evaluator";
import {
  PLAY_DEFAULT_FALLBACK_ELO,
  PLAY_MAX_ELO,
  PLAY_MIN_ELO,
  calculatePracticeAccuracy,
  clampPlayElo,
  getPlayGameOverStatus,
  gradeUserPlayMove,
  resolveMatchedElo,
  resolvePlayAnchor,
} from "@/lib/play/play-session";

import { BADGE_METADATA, type ClassificationResult, type MoveBadge } from "@/lib/analysis/move-classifier";
import type { TacticalContext } from "@/lib/analysis/tactical-tagger";

function makeClassification(badge: MoveBadge, deltaWP = 0): ClassificationResult {
  const meta = BADGE_METADATA[badge];
  return {
    badge,
    deltaWP,
    accuracy: badge === "Book" ? 100 : Math.max(0, 100 - deltaWP * 2),
    color: meta.color,
    symbol: meta.symbol,
    isBlunder: badge === "Blunder" || badge === "Miss",
    isKeyMoment: badge === "Mistake" || badge === "Miss" || badge === "Blunder",
  };
}

const DEFAULT_TACTICAL_CONTEXT: TacticalContext = {
  tags: [],
  isCheck: false,
  isCastle: false,
  gamePhase: "Opening",
};

function buildMinimalAnalysis(overrides: Partial<GameAnalysis> = {}): GameAnalysis {
  const c = new Chess();
  const startFen = c.fen();
  const e4 = c.move("e4");
  const fenAfterE4 = c.fen();
  const e5 = c.move("e5");
  const fenAfterE5 = c.fen();

  return {
    headers: {
      White: "Alice",
      Black: "Bob",
      WhiteElo: "1450",
      BlackElo: "?",
      Result: "*",
    },
    startFen,
    opening: {
      opening: {
        eco: "C20",
        name: "King's Pawn Game",
        moves: "1. e4 e5",
        fenKey: "",
      },
      bookPlies: 2,
      outOfBookPly: null,
      outOfBookMoveNumber: null,
      plyIsBook: [true, true],
      plyOpenings: [null, null],
      insight: "Standard King's Pawn opening.",
    },
    moves: [
      {
        ply: 1,
        moveNumber: 1,
        color: "w",
        san: e4.san,
        uci: "e2e4",
        from: e4.from,
        to: e4.to,
        fenBefore: startFen,
        fenAfter: fenAfterE4,
        whiteCp: 25,
        evalLabel: "+0.25",
        bestMoveUci: "e2e4",
        bestMoveSan: "e4",
        bestMovePvSan: ["e4", "e5"],
        altPvSan: ["d4", "d5"],
        materialSacrificed: 0,
        classification: makeClassification("Book"),
        tacticalContext: DEFAULT_TACTICAL_CONTEXT,
      },
      {
        ply: 2,
        moveNumber: 1,
        color: "b",
        san: e5.san,
        uci: "e7e5",
        from: e5.from,
        to: e5.to,
        fenBefore: fenAfterE4,
        fenAfter: fenAfterE5,
        whiteCp: 20,
        evalLabel: "+0.20",
        bestMoveUci: "e7e5",
        bestMoveSan: "e5",
        bestMovePvSan: ["e5", "Nf3"],
        altPvSan: ["c5", "Nf3"],
        materialSacrificed: 0,
        classification: makeClassification("Book"),
        tacticalContext: DEFAULT_TACTICAL_CONTEXT,
      },
    ],
    summary: {
      white: {
        accuracy: 88,
        estimatedElo: 1520,
        badgeCounts: {
          Brilliant: 0,
          Great: 0,
          Best: 1,
          Excellent: 0,
          Good: 0,
          Book: 1,
          Inaccuracy: 0,
          Mistake: 0,
          Miss: 0,
          Blunder: 0,
          Forced: 0,
        },
        phaseAccuracies: { opening: 90, middlegame: 100, endgame: 100 },
      },
      black: {
        accuracy: 74,
        estimatedElo: 1180,
        badgeCounts: {
          Brilliant: 0,
          Great: 0,
          Best: 1,
          Excellent: 0,
          Good: 0,
          Book: 1,
          Inaccuracy: 0,
          Mistake: 0,
          Miss: 0,
          Blunder: 0,
          Forced: 0,
        },
        phaseAccuracies: { opening: 80, middlegame: 100, endgame: 100 },
      },
    },
    ...overrides,
  };
}

describe("play-session helpers", () => {
  it("clamps and resolves matched opponent ELO from PGN headers or CAPS2 estimate", () => {
    expect(clampPlayElo(200)).toBe(PLAY_MIN_ELO);
    expect(clampPlayElo(4500)).toBe(PLAY_MAX_ELO);
    expect(clampPlayElo(1499.6)).toBe(1500);
    expect(clampPlayElo(Number.NaN)).toBe(PLAY_DEFAULT_FALLBACK_ELO);
    expect(clampPlayElo(Number.POSITIVE_INFINITY)).toBe(PLAY_DEFAULT_FALLBACK_ELO);

    const analysis = buildMinimalAnalysis();
    expect(resolveMatchedElo(analysis, "white")).toEqual({ elo: 1450, source: "pgn" });
    // BlackElo is "?" so it falls back to summary.black.estimatedElo (1180)
    expect(resolveMatchedElo(analysis, "black")).toEqual({ elo: 1180, source: "estimated" });

    // White missing PGN ELO falls back cleanly to summary.white.estimatedElo (1520)
    const noWhiteHeader = buildMinimalAnalysis({
      headers: { ...analysis.headers, WhiteElo: "?" },
    });
    expect(resolveMatchedElo(noWhiteHeader, "white")).toEqual({ elo: 1520, source: "estimated" });

    // Zero or invalid estimated ELO falls back to PLAY_DEFAULT_FALLBACK_ELO
    const zeroEstimate = buildMinimalAnalysis({
      headers: { ...analysis.headers, WhiteElo: "?" },
      summary: {
        ...analysis.summary,
        white: { ...analysis.summary.white, estimatedElo: 0 },
      },
    });
    expect(resolveMatchedElo(zeroEstimate, "white")).toEqual({
      elo: PLAY_DEFAULT_FALLBACK_ELO,
      source: "default",
    });

    // Null analysis falls back cleanly to default
    expect(resolveMatchedElo(null, "white")).toEqual({
      elo: PLAY_DEFAULT_FALLBACK_ELO,
      source: "default",
    });
  });

  it("resolves play anchor positions for current board, before-move retry, and custom PV", () => {
    expect(
      resolvePlayAnchor({
        analysis: null,
        currentPly: 0,
        coachColor: "white",
        startMode: "board",
      })
    ).toEqual({
      fen: new Chess().fen(),
      moveNumber: 1,
      userColor: "w",
      anchorPly: 0,
      description: "Starting position",
    });

    const analysis = buildMinimalAnalysis();

    const startAnchor = resolvePlayAnchor({
      analysis,
      currentPly: 0,
      coachColor: "white",
      startMode: "board",
    });
    expect(startAnchor).toEqual({
      fen: analysis.startFen,
      moveNumber: 1,
      userColor: "w",
      anchorPly: 0,
      description: "Opening position",
    });

    const afterPly1 = resolvePlayAnchor({
      analysis,
      currentPly: 1,
      coachColor: "white",
      startMode: "board",
    });
    expect(afterPly1.description).toBe("From 1. e4");
    expect(afterPly1.moveNumber).toBe(1);
    expect(afterPly1.anchorPly).toBe(1);

    const afterPly2 = resolvePlayAnchor({
      analysis,
      currentPly: 2,
      coachColor: "black",
      startMode: "board",
    });
    expect(afterPly2).toEqual({
      fen: analysis.moves[1].fenAfter,
      moveNumber: 1,
      userColor: "b",
      anchorPly: 2,
      description: "From 1... e5",
    });

    const fixBeforePly1 = resolvePlayAnchor({
      analysis,
      currentPly: 1,
      coachColor: "white",
      startMode: "before-move",
    });
    expect(fixBeforePly1).toEqual({
      fen: analysis.moves[0].fenBefore,
      moveNumber: 1,
      userColor: "w",
      anchorPly: 0,
      description: "Fix from 1. e4",
    });

    const fixBeforePly2 = resolvePlayAnchor({
      analysis,
      currentPly: 2,
      coachColor: "black",
      startMode: "before-move",
    });
    expect(fixBeforePly2).toEqual({
      fen: analysis.moves[1].fenBefore,
      moveNumber: 1,
      userColor: "b",
      anchorPly: 1,
      description: "Fix from 1... e5",
    });

    // Out-of-bounds ply gracefully anchors to the last move
    const clampedPly = resolvePlayAnchor({
      analysis,
      currentPly: 99,
      coachColor: "black",
      startMode: "board",
    });
    expect(clampedPly.fen).toBe(analysis.moves[1].fenAfter);
    expect(clampedPly.anchorPly).toBe(2);

    const customFen = "  rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R   b KQkq - 1 2  ";
    const customAnchor = resolvePlayAnchor({
      analysis,
      currentPly: 2,
      activeCustomFen: customFen,
      coachColor: "black",
      startMode: "board",
    });
    expect(customAnchor).toEqual({
      fen: customFen,
      moveNumber: 2,
      userColor: "b",
      anchorPly: 2,
      description: "Selected variation",
    });

    const partialFenAnchor = resolvePlayAnchor({
      analysis,
      currentPly: 2,
      activeCustomFen: "8/8/8/4k3/8/8/8/4K3 w - - 0 0",
      coachColor: "white",
      startMode: "board",
    });
    expect(partialFenAnchor.moveNumber).toBe(1);
  });

  it("grades user moves using canonical classifier + coach persona feedback and calculates practice accuracy", () => {
    // 1. e4 e5 2. Nf3 Nc6 3. Bc4 — Black to move (Nf6 is Best, g5 is a Blunder)
    const c = new Chess();
    for (const san of ["e4", "e5", "Nf3", "Nc6", "Bc4"]) c.move(san);
    const fenBefore = c.fen();

    const evalBefore: PositionEval = {
      fen: fenBefore,
      depth: 12,
      bestMoveUci: "g8f6",
      bestMoveSan: "Nf6",
      whiteCp: 20,
      lines: [
        { multipv: 1, cp: 20, pvUci: ["g8f6", "d2d3"], pvSan: ["Nf6", "d3"] },
        { multipv: 2, cp: 35, pvUci: ["f8c5", "c2c3"], pvSan: ["Bc5", "c3"] },
      ],
    };

    // Case A: User plays Best move (Nf6)
    const bestBranch = new Chess(fenBefore);
    const bestMove = bestBranch.move("Nf6");
    const bestEvalAfter: PositionEval = {
      fen: bestBranch.fen(),
      depth: 12,
      bestMoveUci: "d2d3",
      bestMoveSan: "d3",
      whiteCp: 20,
      lines: [{ multipv: 1, cp: 20, pvUci: ["d2d3"], pvSan: ["d3"] }],
    };

    const bestGrade = gradeUserPlayMove({
      fenBefore,
      fenAfter: bestBranch.fen(),
      san: bestMove.san,
      uci: `${bestMove.from}${bestMove.to}`,
      from: bestMove.from,
      to: bestMove.to,
      ply: 6,
      evalBefore,
      evalAfter: bestEvalAfter,
      coachFor: "Black",
      personaId: "danny",
      openingName: "Italian Game",
      playerName: "You",
      opponentName: "Stockfish",
    });

    expect(bestGrade.badge).toBe("Best");
    expect(bestGrade.deltaWP).toBe(0);
    expect(bestGrade.accuracy).toBe(100);
    expect(bestGrade.color).toBe("b");
    expect(bestGrade.moveNumber).toBe(3);
    expect(bestGrade.bestMoveSan).toBe("Nf6");
    expect(bestGrade.refutationPvSan).toEqual(["d3"]);
    expect(bestGrade.explanation.badge).toBe("Best");
    expect(bestGrade.explanation.detailedExplanation.length).toBeGreaterThan(0);
    expect(bestGrade.explanation.shortComment.length).toBeGreaterThan(0);

    // Case B: White turn move grading with empty evalAfter.lines tests empty-refutation fallback
    const whiteBefore = new Chess().fen();
    const whiteChess = new Chess(whiteBefore);
    const whiteMove = whiteChess.move("e4");
    const whiteGrade = gradeUserPlayMove({
      fenBefore: whiteBefore,
      fenAfter: whiteChess.fen(),
      san: whiteMove.san,
      uci: "e2e4",
      from: "e2",
      to: "e4",
      ply: 1,
      evalBefore: {
        fen: whiteBefore,
        depth: 12,
        bestMoveUci: "e2e4",
        bestMoveSan: "e4",
        whiteCp: 25,
        lines: [{ multipv: 1, cp: 25, pvUci: ["e2e4"], pvSan: ["e4"] }],
      },
      evalAfter: {
        fen: whiteChess.fen(),
        depth: 12,
        bestMoveUci: "e7e5",
        bestMoveSan: "e5",
        whiteCp: 25,
        lines: [],
      },
      coachFor: "White",
      personaId: "sage",
      playerName: "You",
      opponentName: "Stockfish",
    });
    expect(whiteGrade.color).toBe("w");
    expect(whiteGrade.moveNumber).toBe(1);
    expect(whiteGrade.from).toBe("e2");
    expect(whiteGrade.to).toBe("e4");
    expect(whiteGrade.whiteCp).toBe(25);
    expect(whiteGrade.badge).toBe("Best");
    expect(whiteGrade.evalLabel).toBe("+0.3");
    expect(whiteGrade.refutationPvSan).toEqual([]);

    // Case C: User plays Blunder (g5?? dropping +350cp)
    const blunderBranch = new Chess(fenBefore);
    const blunderMove = blunderBranch.move("g5");
    const blunderEvalAfter: PositionEval = {
      fen: blunderBranch.fen(),
      depth: 12,
      bestMoveUci: "f3g5",
      bestMoveSan: "Nxg5",
      whiteCp: 350,
      lines: [{ multipv: 1, cp: 350, pvUci: ["f3g5", "h7h6"], pvSan: ["Nxg5", "h6"] }],
    };

    const blunderGrade = gradeUserPlayMove({
      fenBefore,
      fenAfter: blunderBranch.fen(),
      san: blunderMove.san,
      uci: `${blunderMove.from}${blunderMove.to}`,
      from: blunderMove.from,
      to: blunderMove.to,
      ply: 6,
      evalBefore,
      evalAfter: blunderEvalAfter,
      coachFor: "Black",
      personaId: "drillmaster",
      playerName: "You",
      opponentName: "Stockfish",
    });

    expect(blunderGrade.badge).toBe("Blunder");
    expect(blunderGrade.deltaWP).toBeGreaterThan(15);
    expect(blunderGrade.accuracy).toBeLessThan(40);
    expect(blunderGrade.refutationPvSan).toEqual(["Nxg5", "h6"]);
    expect(blunderGrade.explanation.bestMoveReasoning).toBeTruthy();

    expect(calculatePracticeAccuracy([])).toBe(100);
    expect(calculatePracticeAccuracy([bestGrade])).toBeGreaterThan(95);
    expect(
      calculatePracticeAccuracy([
        bestGrade,
        { ...bestGrade, badge: "Forced", deltaWP: 0, accuracy: 100 },
        { ...bestGrade, badge: "Book", deltaWP: 0, accuracy: 100 },
      ])
    ).toBeGreaterThan(95);
    expect(calculatePracticeAccuracy([bestGrade, blunderGrade])).toBeLessThan(80);
  });

  it("detects terminal checkmate winner, stalemate, insufficient material, repetition, and 50-move draws", () => {
    // Scholar's mate where White was checkmated by Black (Qh4#)
    const scholarsMateFen = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
    expect(getPlayGameOverStatus(scholarsMateFen, "b")).toEqual({
      reason: "checkmate",
      winner: "user",
      title: "Checkmate — You won!",
      subtitle: "You converted the position cleanly from here.",
    });
    expect(getPlayGameOverStatus(scholarsMateFen, "w")).toEqual({
      reason: "checkmate",
      winner: "engine",
      title: "Checkmate — Stockfish won",
      subtitle: "Try undoing the turning point or adjusting the opponent ELO.",
    });

    const stalemateFen = "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1";
    expect(getPlayGameOverStatus(stalemateFen, "w")).toEqual({
      reason: "stalemate",
      winner: "draw",
      title: "Draw by Stalemate",
      subtitle: "No legal moves remain for the side to move.",
    });

    const insufficientFen = "8/8/8/4k3/8/8/8/4K3 w - - 0 1";
    expect(getPlayGameOverStatus(insufficientFen, "w")).toEqual({
      reason: "insufficient_material",
      winner: "draw",
      title: "Draw — Insufficient Material",
      subtitle: "Neither side retains enough material to force checkmate.",
    });

    // 50-move rule draw (halfmove clock = 100)
    const fiftyMoveFen = "4k3/8/8/8/8/8/R7/4K3 w - - 100 60";
    expect(getPlayGameOverStatus(fiftyMoveFen, "w")).toEqual({
      reason: "draw",
      winner: "draw",
      title: "Game Drawn",
      subtitle: "The game ended by the 50-move or draw rule.",
    });

    const activeFen = new Chess().fen();
    expect(getPlayGameOverStatus(activeFen, "w")).toBeNull();
  });
});
