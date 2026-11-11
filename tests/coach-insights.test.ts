import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import {
  analyzeComparativeReasons,
  summarizePiecePlacements,
  tracePvIntentions,
} from "../src/lib/analysis/coach-insights";
import { extractTacticalContext } from "../src/lib/analysis/tactical-tagger";

describe("coach-insights", () => {
  describe("tracePvIntentions", () => {
    it("traces checks, captures, and checkmate along a PV sequence", () => {
      // White: K g1, Q d1, R f1; Black: K g8, Q d8, pawns f7/g7/h7 (back-rank / f7 motif)
      // Simple legal sequence: 1. Qxf7+ Kh8 2. Qxf8#
      const fen = "5rk1/5ppp/8/8/8/8/5Q2/6K1 w - - 0 1";
      const result = tracePvIntentions(fen, ["Qxf7+", "Kh8", "Qxf8#"]);

      expect(result.lineSan).toEqual(["Qxf7+", "Kh8", "Qxf8#"]);
      expect(result.checksDelivered).toBe(2);
      expect(result.terminalCheckmate).toBe(true);
      expect(result.capturedTargets).toHaveLength(2);
      expect(result.capturedTargets[0]).toEqual({
        san: "Qxf7+",
        piece: "Pawn",
        square: "f7",
        byColor: "w",
      });
      expect(result.capturedTargets[1]).toEqual({
        san: "Qxf8#",
        piece: "Rook",
        square: "f8",
        byColor: "w",
      });
      expect(result.summaryFacts.some((fact) => /checkmate/i.test(fact))).toBe(true);
    });

    it("detects castling and promotion and ignores trailing invalid SAN moves", () => {
      const fen = "4k2r/P6p/8/8/8/8/8/R3K2R w KQk - 0 1";
      const result = tracePvIntentions(fen, ["a8=Q+", "Kd7", "O-O", "INVALID_MOVE"]);

      expect(result.lineSan).toEqual(["a8=Q+", "Kd7", "O-O"]);
      expect(result.promoted).toBe(true);
      expect(result.castled).toBe(true);
      expect(result.checksDelivered).toBe(1);
      expect(result.summaryFacts.some((fact) => /promot/i.test(fact))).toBe(true);
      expect(result.summaryFacts.some((fact) => /castl/i.test(fact))).toBe(true);
    });

    it("respects maxPlies limit", () => {
      const chess = new Chess();
      const result = tracePvIntentions(chess.fen(), ["e4", "e5", "Nf3", "Nc6", "Bb5"], 2);
      expect(result.lineSan).toEqual(["e4", "e5"]);
    });
  });

  describe("summarizePiecePlacements", () => {
    it("produces an exact non-hallucinatory piece summary from FEN", () => {
      const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
      const summary = summarizePiecePlacements(fen);

      expect(summary).toContain("White:");
      expect(summary).toContain("Black:");
      expect(summary).toContain("e4");
      expect(summary).toContain("K e1");
      expect(summary).toContain("K e8");
    });
  });

  describe("analyzeComparativeReasons", () => {
    it("identifies a missed hanging capture when the player retreats passively", () => {
      // White Knight on f3, Black Rook undefended on e5; White plays quiet h3 instead of Nxe5
      const chess = new Chess("4k3/8/8/4r3/8/5N2/PPPPPPPP/R1BQK2R w KQ - 0 10");
      const fenBefore = chess.fen();
      const move = chess.move("h3");
      const fenAfter = chess.fen();
      const playedTactics = extractTacticalContext(fenBefore, fenAfter, move.san, 10);

      const insights = analyzeComparativeReasons({
        fenBefore,
        fenAfter,
        playedSan: "h3",
        bestMoveSan: "Nxe5",
        bestMovePvSan: ["Nxe5"],
        moveNumber: 10,
        playedTactics,
      });

      expect(
        insights.missedOpportunities.some((m) => /Nxe5/.test(m) && /Rook on e5/i.test(m))
      ).toBe(true);
      expect(
        insights.whyBetterFacts.some((w) => /Nxe5/.test(w))
      ).toBe(true);
      expect(insights.boardPieceMapAfter).toContain("N f3");
    });

    it("identifies a missed pin as the reason bestMove outperformed the played move", () => {
      // With d7 pawn moved to d6, 4. Bb5 directly pins the Knight on c6 to the King on e8
      const chess = new Chess("r1bqkbnr/ppp2ppp/2np4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 4");
      const fenBefore = chess.fen();
      const move = chess.move("a3");
      const fenAfter = chess.fen();
      const playedTactics = extractTacticalContext(fenBefore, fenAfter, move.san, 4);

      const insights = analyzeComparativeReasons({
        fenBefore,
        fenAfter,
        playedSan: "a3",
        bestMoveSan: "Bb5",
        bestMovePvSan: ["Bb5", "a6", "Ba4"],
        moveNumber: 4,
        playedTactics,
      });

      expect(insights.bestMoveTactics?.pinnedPieceDetails?.piece).toBe("Knight");
      expect(
        insights.missedOpportunities.some((m) => /Bb5/.test(m) && /pins/i.test(m))
      ).toBe(true);
      expect(
        insights.strategicTradeoffs.some((s) => /flank|develop|pin/i.test(s))
      ).toBe(true);
    });

    it("flags developing a piece vs premature castling or flank pawn move", () => {
      // White has castling ready, plus undeveloped Bc1 and Nb1; White plays O-O instead of Nc3
      const chess = new Chess("r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4");
      const fenBefore = chess.fen();
      chess.move("O-O");
      const fenAfter = chess.fen();
      const playedTactics = extractTacticalContext(fenBefore, fenAfter, "O-O", 4);

      const insights = analyzeComparativeReasons({
        fenBefore,
        fenAfter,
        playedSan: "O-O",
        bestMoveSan: "Nc3",
        bestMovePvSan: ["Nc3", "Bc5", "d3"],
        moveNumber: 4,
        playedTactics,
      });

      expect(
        insights.strategicTradeoffs.some((t) => /develop|mobiliz/i.test(t))
      ).toBe(true);
      expect(insights.whyBetterFacts.some((w) => /Nc3/.test(w))).toBe(true);
    });

    it("detects pawn structure damage (doubled/isolated pawns) avoided by bestMove", () => {
      // White pawns on d4, e4, a2, h2; Black pawn on d5? No: White pawns on e2, f2, g2, h2?
      // Better: White pawns on c2, d4, e4; Black bishop on f5 or pawn on c4 -> wait:
      // White knight on c3 attacked by Black bishop on b4, Black plays Bxc3 instead of Nf6, or White captures gxf3!
      // Position: Black B on b4 pins/takes Nc3? Let's test White playing gxf3 (splitting f/h pawns and doubling f-pawns) when Qxf3 is clean!
      const chess = new Chess("4k3/pppp1ppp/8/8/8/5b2/PPPPQPPP/R3K2R w KQ - 0 10");
      const fenBefore = chess.fen();
      chess.move("gxf3");
      const fenAfter = chess.fen();
      const playedTactics = extractTacticalContext(fenBefore, fenAfter, "gxf3", 10);

      const insights = analyzeComparativeReasons({
        fenBefore,
        fenAfter,
        playedSan: "gxf3",
        bestMoveSan: "Qxf3",
        bestMovePvSan: ["Qxf3"],
        moveNumber: 10,
        playedTactics,
      });

      expect(
        insights.strategicTradeoffs.some((s) => /pawn structure|doubled|isolated/i.test(s))
      ).toBe(true);
    });

    it("traces refutationPV along fenAfter to explain concrete punishment threats", () => {
      // White blunders Ke2?? allowing Black Qe7+? Wait: simpler:
      // White plays Bd3 blocking d-pawn and hanging f2? No, Black Q on h4 after f3??
      const chess = new Chess("rnbqkbnr/pppp1ppp/8/4p3/6P1/8/PPPPPP1P/RNBQKBNR w KQkq - 0 2");
      const fenBefore = chess.fen();
      chess.move("f3");
      const fenAfter = chess.fen();

      const insights = analyzeComparativeReasons({
        fenBefore,
        fenAfter,
        playedSan: "f3",
        bestMoveSan: "Nc3",
        bestMovePvSan: ["Nc3", "d5"],
        refutationPvSan: ["Qh4#"],
        moveNumber: 2,
      });

      expect(insights.refutationPvIntentions?.terminalCheckmate).toBe(true);
      expect(
        insights.whyBetterFacts.some((w) => /Qh4#/.test(w) || /checkmate/i.test(w))
      ).toBe(true);
    });
  });
});
