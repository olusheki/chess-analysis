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

    it("detects missed forks, skewers, discovered attacks, checkmate threats, and winning exchanges", () => {
      // 1) Missed fork + winning exchange capture: White Knight on b5 can play Nxc7+ forking King e8 & Rook a8 (c7 undefended)
      const forkChess = new Chess("r3k3/ppp2ppp/8/1N6/8/8/PPPPPPPP/R2QK2R w KQ - 0 12");
      const forkBefore = forkChess.fen();
      forkChess.move("a3");
      const forkInsights = analyzeComparativeReasons({
        fenBefore: forkBefore,
        fenAfter: forkChess.fen(),
        playedSan: "a3",
        bestMoveSan: "Nxc7+",
        moveNumber: 12,
      });
      expect(forkInsights.missedOpportunities.some((m) => /fork/i.test(m) && /Nxc7\+/.test(m))).toBe(true);

      // Winning exchange: Knight captures Queen on d5 defended by Black pawn on e6
      const exchChess = new Chess("4k3/8/4p3/3q4/8/2N5/8/4K3 w - - 0 15");
      const exchBefore = exchChess.fen();
      exchChess.move("Kf1");
      const exchInsights = analyzeComparativeReasons({
        fenBefore: exchBefore,
        fenAfter: exchChess.fen(),
        playedSan: "Kf1",
        bestMoveSan: "Nxd5",
        moveNumber: 15,
      });
      expect(
        exchInsights.missedOpportunities.some((m) => /Nxd5/.test(m) && /Queen on d5/.test(m))
      ).toBe(true);

      // 2) Missed skewer: Rook Re1+ skewers King e5 to Queen e8
      const skChess = new Chess("4q3/8/8/4k3/8/8/8/4R1K1 w - - 0 25");
      const skBefore = skChess.fen();
      skChess.move("Kf1");
      const skInsights = analyzeComparativeReasons({
        fenBefore: skBefore,
        fenAfter: skChess.fen(),
        playedSan: "Kf1",
        bestMoveSan: "Re1+",
        bestMovePvSan: ["Re1+"],
        moveNumber: 25,
      });
      // King on e5 -> wait R is already on e1, check Ra1 -> Re1+!
      expect(skInsights).toBeDefined();

      const sk2Chess = new Chess("4q3/8/8/4k3/8/8/8/R5K1 w - - 0 25");
      const sk2Before = sk2Chess.fen();
      sk2Chess.move("Kf1");
      const sk2Insights = analyzeComparativeReasons({
        fenBefore: sk2Before,
        fenAfter: sk2Chess.fen(),
        playedSan: "Kf1",
        bestMoveSan: "Re1+",
        moveNumber: 25,
      });
      expect(
        sk2Insights.missedOpportunities.some((m) => /Re1\+/.test(m) && /skewer/i.test(m))
      ).toBe(true);

      // 3) Missed discovered attack: Rook on d1, White Knight on d4 moves to Nf5 uncovering Queen on d8
      const discChess = new Chess("3q2k1/8/8/8/3N4/8/8/3R2K1 w - - 0 20");
      const discBefore = discChess.fen();
      discChess.move("Kf1");
      const discInsights = analyzeComparativeReasons({
        fenBefore: discBefore,
        fenAfter: discChess.fen(),
        playedSan: "Kf1",
        bestMoveSan: "Nf5",
        moveNumber: 20,
      });
      expect(
        discInsights.missedOpportunities.some((m) => /Nf5/.test(m) && /discovered attack/i.test(m))
      ).toBe(true);
    });

    it("detects open-file rook activation, center control, lost castling rights, passive retreat, and hanging own pieces", () => {
      // Open-file rook Rd1 & losing castling rights via Kf1 vs O-O
      const rookChess = new Chess("4k3/ppp2ppp/8/8/8/8/PPP2PPP/R3K2R w KQ - 0 14");
      const rookBefore = rookChess.fen();
      rookChess.move("Kf1");
      const rookInsights = analyzeComparativeReasons({
        fenBefore: rookBefore,
        fenAfter: rookChess.fen(),
        playedSan: "Kf1",
        bestMoveSan: "Rd1",
        moveNumber: 14,
      });
      expect(rookInsights.strategicTradeoffs.some((s) => /open or semi-open file/i.test(s))).toBe(true);
      expect(rookInsights.strategicTradeoffs.some((s) => /castling rights/i.test(s))).toBe(true);

      // Best is castling (O-O) while played Kf1 -> shelves king & connects rooks
      const castleInsights = analyzeComparativeReasons({
        fenBefore: rookBefore,
        fenAfter: rookChess.fen(),
        playedSan: "Kf1",
        bestMoveSan: "O-O",
        moveNumber: 14,
      });
      expect(castleInsights.strategicTradeoffs.some((s) => /shelters the king/i.test(s))).toBe(true);

      // Center control + leaving own piece hanging + passive retreat (Black side test!)
      const blackChess = new Chess("rnbqkbnr/pppppppp/8/8/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 1");
      const bBefore = blackChess.fen();
      blackChess.move("Nh6"); // move vs d5 center control
      const cInsights = analyzeComparativeReasons({
        fenBefore: bBefore,
        fenAfter: blackChess.fen(),
        playedSan: "Nh6",
        bestMoveSan: "d5",
        moveNumber: 1,
      });
      expect(cInsights.strategicTradeoffs.some((s) => /central control/i.test(s))).toBe(true);

      // Active forward move vs passive retreat + hanging own piece
      const retreatChess = new Chess("4k3/8/8/4r3/3B4/8/8/6K1 w - - 0 20");
      const rBefore = retreatChess.fen();
      retreatChess.move("Bc3"); // passive retreat backward while Bc5 steps forward
      const retreatInsights = analyzeComparativeReasons({
        fenBefore: rBefore,
        fenAfter: retreatChess.fen(),
        playedSan: "Bc3",
        bestMoveSan: "Bc5",
        moveNumber: 20,
      });
      expect(
        retreatInsights.strategicTradeoffs.some((s) => /retreating passively/i.test(s))
      ).toBe(true);

      // Leaving own Queen vulnerable on c4 where Black d5 pawn? Let's hang Queen on e5 attacked by Black d6? Wait: Knight on d7 covers e5!
      const hangChess = new Chess("4k3/3n4/8/8/8/8/4Q3/R3K2R w KQ - 0 18");
      const hBefore = hangChess.fen();
      hangChess.move("Qe5"); // undefended Queen on e5 attacked by Knight on d7!
      const hInsights = analyzeComparativeReasons({
        fenBefore: hBefore,
        fenAfter: hangChess.fen(),
        playedSan: "Qe5",
        bestMoveSan: "O-O",
        moveNumber: 18,
      });
      expect(hInsights.strategicTradeoffs.some((s) => /vulnerable/i.test(s))).toBe(true);
    });

    it("handles book/best-move fast paths, playedPvSan, post-bestMove PV fallback, and invalid inputs cleanly", () => {
      expect(tracePvIntentions("bad-fen", ["e4"])).toEqual({
        lineSan: [],
        checksDelivered: 0,
        capturedTargets: [],
        castled: false,
        promoted: false,
        terminalCheckmate: false,
        summaryFacts: [],
      });
      expect(tracePvIntentions(new Chess().fen(), [])).toEqual({
        lineSan: [],
        checksDelivered: 0,
        capturedTargets: [],
        castled: false,
        promoted: false,
        terminalCheckmate: false,
        summaryFacts: [],
      });
      expect(summarizePiecePlacements("invalid-fen")).toBe("");
      const startMap = summarizePiecePlacements(new Chess().fen());
      expect(startMap).toContain("White: K e1, Q d1, R a1/h1, B c1/f1, N b1/g1, Pawns a2/b2/c2/d2/e2/f2/g2/h2");
      expect(startMap).toContain("Black: K e8, Q d8, R a8/h8, B c8/f8, N b8/g8, Pawns a7/b7/c7/d7/e7/f7/g7/h7");

      const chess = new Chess();
      const fenBefore = chess.fen();
      chess.move("e4");
      const fenAfter = chess.fen();

      // Book move fast path preserves playedPvSan and bestMovePV without false tactical complaints
      const bookInsights = analyzeComparativeReasons({
        fenBefore,
        fenAfter,
        playedSan: "e4",
        bestMoveSan: "d4",
        bestMovePvSan: ["d4", "d5", "c4"],
        playedPvSan: ["e5", "Nf3"],
        moveNumber: 1,
        isBook: true,
      });
      expect(bookInsights.strategicTradeoffs).toEqual([]);
      expect(bookInsights.missedOpportunities).toEqual([]);
      expect(bookInsights.playedPvIntentions?.lineSan).toEqual(["e5", "Nf3"]);

      // Post-bestMove PV fallback (when bestMovePvSan starts AFTER bestMoveSan, e.g. continuation after "e4")
      const postPvInsights = analyzeComparativeReasons({
        fenBefore,
        fenAfter,
        playedSan: "d3",
        bestMoveSan: "e4",
        bestMovePvSan: ["e5", "Nf3"],
        moveNumber: 1,
      });
      expect(postPvInsights.bestPvIntentions?.lineSan).toEqual(["e5", "Nf3"]);
    });

    it("detects checkmate threats, trapped pieces, isolated pawn creation, closed-file rooks, quiet PVs, and invalid move strings", () => {
      // 1) Quiet non-check/non-capture/non-castle PV sets all flags to false & summaryFacts empty
      const quietChess = new Chess();
      const quietPv = tracePvIntentions(quietChess.fen(), ["d3", "d6"]);
      expect(quietPv.checksDelivered).toBe(0);
      expect(quietPv.capturedTargets).toEqual([]);
      expect(quietPv.castled).toBe(false);
      expect(quietPv.promoted).toBe(false);
      expect(quietPv.terminalCheckmate).toBe(false);
      expect(quietPv.summaryFacts).toEqual([]);

      // 2) Checkmate threat: Qh5 in 1.e4 e5 2.Bc4 Nc6 threatens Qxf7# while a3 doesn't
      const mateThreatChess = new Chess("r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 2 3");
      const mBefore = mateThreatChess.fen();
      mateThreatChess.move("a3");
      const mateThreatInsights = analyzeComparativeReasons({
        fenBefore: mBefore,
        fenAfter: mateThreatChess.fen(),
        playedSan: "a3",
        bestMoveSan: "Qh5",
        moveNumber: 3,
      });
      expect(
        mateThreatInsights.missedOpportunities.some((m) => /Qh5/.test(m) && /checkmate threat/i.test(m))
      ).toBe(true);

      // 3) Trapped piece: 20. b4 traps Black's Bishop on a5 (b6 & c7 pawns block retreat, a3 & c3 defend b4)
      const trapChess = new Chess("4k3/2p5/1p6/b7/8/P1P5/1P6/4K3 w - - 0 20");
      const tBefore = trapChess.fen();
      trapChess.move("Kf1");
      const trapInsights = analyzeComparativeReasons({
        fenBefore: tBefore,
        fenAfter: trapChess.fen(),
        playedSan: "Kf1",
        bestMoveSan: "b4",
        moveNumber: 20,
      });
      expect(
        trapInsights.missedOpportunities.some((m) => /b4/.test(m) && /traps/i.test(m))
      ).toBe(true);

      // 4) Pure isolated pawn creation without doubling: bxc3 leaves a2 isolated while Qxc3 avoids it
      const isoChess = new Chess("4k3/8/8/8/8/2n5/PP1Q4/4K3 w - - 0 18");
      const isoBefore = isoChess.fen();
      isoChess.move("bxc3");
      const isoInsights = analyzeComparativeReasons({
        fenBefore: isoBefore,
        fenAfter: isoChess.fen(),
        playedSan: "bxc3",
        bestMoveSan: "Qxc3",
        moveNumber: 18,
      });
      expect(
        isoInsights.strategicTradeoffs.some((s) => /pawn structure/i.test(s))
      ).toBe(true);

      // 5) Closed file rook activation (d2 pawn present) must NOT claim open file
      const closedFileChess = new Chess("4k3/8/8/8/8/8/PPPPP3/R3K3 w - - 0 15");
      const cfBefore = closedFileChess.fen();
      closedFileChess.move("Kf1");
      const cfInsights = analyzeComparativeReasons({
        fenBefore: cfBefore,
        fenAfter: closedFileChess.fen(),
        playedSan: "Kf1",
        bestMoveSan: "Rd1",
        moveNumber: 15,
      });
      expect(cfInsights.strategicTradeoffs.some((s) => /open or semi-open file/i.test(s))).toBe(false);

      // 6) Same-move equal bestMoveSan with checkmate PV preserves whyBetterFacts from bestPvIntentions; invalid FEN handles safely
      const bestPvChess = new Chess("5rk1/5ppp/8/8/8/8/5Q2/6K1 w - - 0 1");
      const bpBefore = bestPvChess.fen();
      bestPvChess.move("Qxf7+");
      const equalInsights = analyzeComparativeReasons({
        fenBefore: bpBefore,
        fenAfter: bestPvChess.fen(),
        playedSan: "Qxf7+",
        bestMoveSan: "Qxf7+",
        bestMovePvSan: ["Qxf7+", "Kh8", "Qxf8#"],
        moveNumber: 1,
      });
      expect(equalInsights.whyBetterFacts.some((w) => /checkmate/i.test(w))).toBe(true);
      expect(equalInsights.strategicTradeoffs).toEqual([]);
      expect(equalInsights.missedOpportunities).toEqual([]);

      const badFenInsights = analyzeComparativeReasons({
        fenBefore: "bad-fen",
        fenAfter: "bad-fen",
        playedSan: "e4",
        bestMoveSan: "d4",
        moveNumber: 1,
      });
      expect(badFenInsights.whyBetterFacts).toEqual([]);
      expect(badFenInsights.missedOpportunities).toEqual([]);
    });
  });
});
