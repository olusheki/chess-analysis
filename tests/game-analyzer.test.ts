import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import {
  analyzeGame,
  getFenTurn,
  parseBaseClockFromHeader,
  parsePgnGame,
} from "@/lib/analysis/game-analyzer";
import type { ChessEngine, PositionEval } from "@/lib/engine/engine-evaluator";

const KASPAROV_TOPALOV_1999_PGN = `[Event "Hoogovens"]
[Site "Wijk aan Zee NED"]
[Date "1999.01.20"]
[Round "4"]
[White "Kasparov, Garry"]
[Black "Topalov, Veselin"]
[Result "1-0"]

1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Be3 Bg7 5. Qd2 c6 6. f3 b5 7. Nge2 Nbd7
8. Bh6 Bxh6 9. Qxh6 Bb7 10. a3 e5 11. O-O-O Qe7 12. Kb1 a6 13. Nc1 O-O-O
14. Nb3 exd4 15. Rxd4 c5 16. Rd1 Nb6 17. g3 Kb8 18. Na5 Ba8 19. Bh3 d5
20. Qf4+ Ka7 21. Rhe1 d4 22. Nd5 Nbxd5 23. exd5 Qd6 24. Rxd4 cxd4
25. Re7+ Kb6 26. Qxd4+ Kxa5 27. b4+ Ka4 28. Qc3 Qxd5 29. Ra7 Bb7
30. Rxb7 Qc4 31. Qxf6 Kxa3 32. Qxa6+ Kxb4 33. c3+ Kxc3 34. Qa1+ Kd2
35. Qb2+ Kd1 36. Bf1 Rd2 37. Rd7 Rxd7 38. Bxc4 bxc4 39. Qxh8 Rd3
40. Qa8 c3 41. Qa4+ Ke1 42. f4 f5 43. Kc1 Rd2 44. Qa7 1-0`;

describe("game-analyzer (full Tier 1 + Tier 2 pipeline)", () => {
  it("parses PGN headers and moves accurately", () => {
    const parsed = parsePgnGame(KASPAROV_TOPALOV_1999_PGN);
    expect(parsed.headers.White).toBe("Kasparov, Garry");
    expect(parsed.headers.Black).toBe("Topalov, Veselin");
    expect(parsed.headers.Result).toBe("1-0");
    expect(parsed.moves.length).toBe(87); // 44 moves White, 43 Black
    expect(parsed.moves[46].san).toBe("Rxd4"); // Move 24 White = ply 47 (index 46)
  });

  it("handles Black perspective evaluations and detects a Black blunder + White Miss accurately", async () => {
    // Mini 4-ply game after opening: 1. e4 e5 2. Nf3 Nc6 3. Bc4 g5? (blunder!) 4. O-O? (misses Nxg5!)
    const pgn = `[White "Alice"]\n[Black "Bob"]\n1. e4 e5 2. Nf3 Nc6 3. Bc4 g5 4. O-O`;

    const c = new Chess();
    const fens: string[] = [c.fen()];
    for (const san of ["e4", "e5", "Nf3", "Nc6", "Bc4", "g5", "O-O"]) {
      c.move(san);
      fens.push(c.fen());
    }

    // All evaluations in White-perspective!
    const evalMap: Record<string, PositionEval> = {
      // Before 3... g5 (fen index 5): balanced +20cp for White
      [fens[5]]: {
        fen: fens[5],
        depth: 16,
        bestMoveUci: "g8f6",
        bestMoveSan: "Nf6",
        whiteCp: 20,
        lines: [{ multipv: 1, cp: 20, pvUci: ["g8f6"], pvSan: ["Nf6"] }],
      },
      // After 3... g5 (fen index 6): White is now +350cp! (Black blundered!)
      [fens[6]]: {
        fen: fens[6],
        depth: 16,
        bestMoveUci: "f3g5",
        bestMoveSan: "Nxg5",
        whiteCp: 350,
        lines: [
          { multipv: 1, cp: 350, pvUci: ["f3g5"], pvSan: ["Nxg5"] },
          { multipv: 2, cp: 10, pvUci: ["e1g1"], pvSan: ["O-O"] },
        ],
      },
      // After 4. O-O (fen index 7): back to +10cp (White missed Nxg5!)
      [fens[7]]: {
        fen: fens[7],
        depth: 16,
        bestMoveUci: "g8f6",
        bestMoveSan: "Nf6",
        whiteCp: 10,
        lines: [{ multipv: 1, cp: 10, pvUci: ["g8f6"], pvSan: ["Nf6"] }],
      },
    };

    const mockEngine: ChessEngine = {
      async evaluatePosition(fen: string) {
        return (
          evalMap[fen] ?? {
            fen,
            depth: 16,
            bestMoveUci: "e2e4",
            bestMoveSan: "e4",
            whiteCp: 20,
            lines: [{ multipv: 1, cp: 20, pvUci: ["e2e4"], pvSan: ["e4"] }],
          }
        );
      },
      dispose() {},
    };

    const analysis = await analyzeGame(pgn, mockEngine, { depth: 16 });
    expect(analysis.moves.length).toBe(7);

    // Ply 6 (index 5): 3... g5 by Black -> should be Blunder (White went +20 -> +350, so Black went -20 -> -350!)
    const blackMove = analysis.moves[5];
    expect(blackMove.color).toBe("b");
    expect(blackMove.san).toBe("g5");
    expect(blackMove.classification.badge).toBe("Blunder");

    // Ply 7 (index 6): 4. O-O by White -> opponent blundered on ply 6, White dropped +350 -> +10 => Miss!
    const whiteMove = analysis.moves[6];
    expect(whiteMove.color).toBe("w");
    expect(whiteMove.san).toBe("O-O");
    expect(whiteMove.classification.badge).toBe("Miss");
    expect(whiteMove.coachInsights?.bestMoveSan).toBe("Nxg5");
    expect(
      whiteMove.coachInsights?.whyBetterFacts.some((m) => /Nxg5/.test(m))
    ).toBe(true);
    expect(
      whiteMove.coachInsights?.strategicTradeoffs.some((m) => /O-O/.test(m))
    ).toBe(true);
    expect(whiteMove.coachInsights?.bestPvIntentions?.lineSan).toEqual(["Nxg5"]);
    expect(whiteMove.coachInsights?.boardPieceMapAfter).toContain("K g1");

    // Verify CAPS2 summary & badge counts
    expect(analysis.summary.black.badgeCounts.Blunder).toBe(1);
    expect(analysis.summary.white.badgeCounts.Miss).toBe(1);
    expect(analysis.summary.white.accuracy).toBeLessThan(100);
    expect(analysis.summary.black.accuracy).toBeLessThan(100);
  });

  it("C1 & M1: analyzes custom [FEN] PGNs without crashing, preserves start move numbers/startEval, and labels mate #", async () => {
    const customPgn = `[SetUp "1"]
[FEN "r5k1/4Pppp/8/8/8/8/8/4R1K1 w - - 0 40"]
[White "EndgameTester"]
[Black "Opponent"]
[Result "1-0"]

40. e8=Q+ Rxe8 41. Rxe8# 1-0`;

    const c = new Chess("r5k1/4Pppp/8/8/8/8/8/4R1K1 w - - 0 40");
    const fen0 = c.fen();
    c.move("e8=Q+");
    const fen1 = c.fen();
    c.move("Rxe8");
    const fen2 = c.fen();
    c.move("Rxe8#");
    const fen3 = c.fen();

    const mockEngine: ChessEngine = {
      async evaluatePosition(fen: string, depth: number) {
        if (fen === fen0) {
          return {
            fen,
            depth,
            bestMoveUci: "e7e8q",
            bestMoveSan: "e8=Q+",
            whiteCp: 10000,
            whiteMate: 2,
            lines: [{ multipv: 1, cp: 10000, mate: 2, pvUci: ["e7e8q", "a8e8", "e1e8"], pvSan: ["e8=Q+", "Rxe8", "Rxe8#"] }],
          };
        }
        if (fen === fen1) {
          return {
            fen,
            depth,
            bestMoveUci: "a8e8",
            bestMoveSan: "Rxe8",
            whiteCp: 10000,
            whiteMate: 1,
            lines: [{ multipv: 1, cp: 10000, mate: 1, pvUci: ["a8e8", "e1e8"], pvSan: ["Rxe8", "Rxe8#"] }],
          };
        }
        if (fen === fen2) {
          return {
            fen,
            depth,
            bestMoveUci: "e1e8",
            bestMoveSan: "Rxe8#",
            whiteCp: 10000,
            whiteMate: 1,
            lines: [{ multipv: 1, cp: 10000, mate: 1, pvUci: ["e1e8"], pvSan: ["Rxe8#"] }],
          };
        }
        return {
          fen: fen3,
          depth: 99,
          bestMoveUci: "",
          bestMoveSan: "",
          whiteCp: 10000,
          whiteMate: 1,
          isCheckmate: true,
          lines: [{ multipv: 1, cp: 10000, mate: 1, pvUci: [], pvSan: [] }],
        };
      },
      dispose() {},
    };

    const result = await analyzeGame(customPgn, mockEngine, { depth: 12 });
    expect(result.opening.opening).toBeNull();
    expect(result.opening.bookPlies).toBe(0);
    expect(result.moves).toHaveLength(3);
    expect(result.moves[0].moveNumber).toBe(40);
    expect(result.moves[1].moveNumber).toBe(40);
    expect(result.moves[2].moveNumber).toBe(41);
    expect(result.startEval?.evalLabel).toBe("M2");
    expect(result.moves[2].evalLabel).toBe("#");
    expect(result.moves[0].classification.badge).toBe("Best");
    expect(result.summary.white.phaseMoveCounts?.opening).toBe(0);
  });

  it("M1: handles Black-to-move custom FEN PGNs, empty PGNs, and AbortSignal cancellation", async () => {
    const blackStartPgn = `[SetUp "1"]
[FEN "4k3/8/8/8/8/8/4P3/4K3 b - - 0 12"]
12... Kd7 13. e4 Kd6`;

    const parsed = parsePgnGame(blackStartPgn);
    expect(parsed.moves[0].color).toBe("b");
    expect(parsed.moves[0].moveNumber).toBe(12);
    expect(parsed.moves[1].color).toBe("w");
    expect(parsed.moves[1].moveNumber).toBe(13);

    const mockEngine: ChessEngine = {
      async evaluatePosition(fen, depth) {
        return {
          fen,
          depth,
          bestMoveUci: "e8d7",
          bestMoveSan: "Kd7",
          whiteCp: 80,
          lines: [{ multipv: 1, cp: 80, pvUci: ["e8d7"], pvSan: ["Kd7"] }],
        };
      },
      dispose() {},
    };

    const emptyRes = await analyzeGame("", mockEngine);
    expect(emptyRes.moves).toHaveLength(0);
    expect(emptyRes.summary.white.accuracy).toBe(100);
    expect(emptyRes.summary.black.phaseAccuracies.opening).toBe(100);
    expect(emptyRes.summary.black.phaseMoveCounts?.opening).toBe(0);

    // Verify Book classification, onProgress calls, default/book depths, and bestMovePvSan
    const progressLog: [number, number][] = [];
    const evalCalls: Array<{ depth: number; multiPv: number }> = [];
    const trackingEngine: ChessEngine = {
      async evaluatePosition(fen, depth, multiPv) {
        evalCalls.push({ depth, multiPv: multiPv ?? 1 });
        return {
          fen,
          depth,
          bestMoveUci: "e2e4",
          bestMoveSan: "e4",
          whiteCp: 20,
          lines: [{ multipv: 1, cp: 20, pvUci: ["e2e4", "e7e5"], pvSan: ["e4", "e5"] }],
        };
      },
      dispose() {},
    };
    const tracked = await analyzeGame("1. e4 e5 2. Nf3 Nc6", trackingEngine, {
      onProgress: (c, t) => progressLog.push([c, t]),
    });
    expect(tracked.moves[0].classification.badge).toBe("Book");
    expect(tracked.moves[0].bestMovePvSan).toEqual(["e4", "e5"]);
    expect(tracked.moves[0].altPvSan).toEqual([]);
    expect(tracked.startEval?.whiteCp).toBe(20);
    expect(tracked.summary.white.accuracy).toBe(100);
    expect(tracked.summary.white.badgeCounts.Book).toBe(2);
    expect(tracked.summary.white.estimatedElo).toBe(2850);
    expect(tracked.summary.white.phaseAccuracies).toEqual({
      opening: 100,
      middlegame: 100,
      endgame: 100,
    });
    expect(tracked.summary.white.phaseMoveCounts).toEqual({
      opening: 2,
      middlegame: 0,
      endgame: 0,
    });
    expect(progressLog).toEqual([
      [1, 5],
      [2, 5],
      [3, 5],
      [4, 5],
      [5, 5],
    ]);
    // Standard positions evaluate at default depth 14 multiPv 3, inner book moves fast-path at depth 4
    expect(evalCalls[0]).toEqual({ depth: 14, multiPv: 3 });
    expect(evalCalls[1]).toEqual({ depth: 4, multiPv: 3 });
    expect(evalCalls[3]).toEqual({ depth: 14, multiPv: 3 });
    expect(evalCalls[4]).toEqual({ depth: 14, multiPv: 3 });

    const ac = new AbortController();
    ac.abort();
    await expect(analyzeGame("1. e4 e5", mockEngine, { signal: ac.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("populates refutationPvSan from evalAfter, top-3 scored pvLines from evalBefore, suppresses recapture Great, and anchors ELO to PGN ratings", async () => {
    const pgn = `[White "RatedLow"]
[Black "RatedPeer"]
[WhiteElo "800"]
[BlackElo "400"]
[Result "1-0"]

1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5 4. a3 c5 5. d4 cxd4 6. Qxd4 Nc6 7. Bb5 Qxb5 8. Nxb5 Nxd4 1-0`;

    const c = new Chess();
    const fens: string[] = [c.fen()];
    const sans = ["e4", "d5", "exd5", "Qxd5", "Nc3", "Qa5", "a3", "c5", "d4", "cxd4", "Qxd4", "Nc6", "Bb5", "Qxb5", "Nxb5", "Nxd4"];
    for (const san of sans) {
      c.move(san);
      fens.push(c.fen());
    }

    const evalMap: Record<string, PositionEval> = {
      // Before 4. a3 (fen index 6, out of book): White plays a3 (index 6)
      [fens[6]]: {
        fen: fens[6],
        depth: 14,
        bestMoveUci: "d2d4",
        bestMoveSan: "d4",
        whiteCp: 60,
        lines: [
          { multipv: 1, cp: 60, pvUci: ["d2d4", "g8f6"], pvSan: ["d4", "Nf6"] },
          { multipv: 2, cp: 20, pvUci: ["g1f3", "c7c6"], pvSan: ["Nf3", "c6"] },
          { multipv: 3, cp: 10, pvUci: ["f1c4", "g8f6"], pvSan: ["Bc4", "Nf6"] },
        ],
      },
      // After 4. a3 -> before 4...c5 (fen index 7): Black should play Nf6 (-20), plays c5? (-180 from Black = +180 White)
      [fens[7]]: {
        fen: fens[7],
        depth: 14,
        bestMoveUci: "g8f6",
        bestMoveSan: "Nf6",
        whiteCp: 20,
        lines: [
          { multipv: 1, cp: 20, pvUci: ["g8f6", "d2d4"], pvSan: ["Nf6", "d4"] },
          { multipv: 2, cp: 45, pvUci: ["c7c6", "g1f3"], pvSan: ["c6", "Nf3"] },
        ],
      },
      // After 4...c5 (fen index 8): refutation is d4 / Nb5!
      [fens[8]]: {
        fen: fens[8],
        depth: 14,
        bestMoveUci: "c3b5",
        bestMoveSan: "Nb5",
        whiteCp: 240,
        lines: [{ multipv: 1, cp: 240, pvUci: ["c3b5", "a5d8"], pvSan: ["Nb5", "Qd8"] }],
      },
      // Before 6. Qxd4 (fen index 10): out-of-book recapture on d4 where PV2 drops huge -> must NOT get Great!
      [fens[10]]: {
        fen: fens[10],
        depth: 14,
        bestMoveUci: "d1d4",
        bestMoveSan: "Qxd4",
        whiteCp: 220,
        lines: [
          { multipv: 1, cp: 220, pvUci: ["d1d4", "b8c6"], pvSan: ["Qxd4", "Nc6"] },
          { multipv: 2, cp: -120, pvUci: ["a1b1", "b8c6"], pvSan: ["Rb1", "Nc6"] },
        ],
      },
      [fens[11]]: {
        fen: fens[11],
        depth: 14,
        bestMoveUci: "b8c6",
        bestMoveSan: "Nc6",
        whiteCp: 220,
        lines: [{ multipv: 1, cp: 220, pvUci: ["b8c6", "f1b5"], pvSan: ["Nc6", "Bb5"] }],
      },
    };

    const mockEngine: ChessEngine = {
      async evaluatePosition(fen, depth) {
        return (
          evalMap[fen] ?? {
            fen,
            depth,
            bestMoveUci: "g1f3",
            bestMoveSan: "Nf3",
            whiteCp: 30,
            lines: [{ multipv: 1, cp: 30, pvUci: ["g1f3"], pvSan: ["Nf3"] }],
          }
        );
      },
      dispose() {},
    };

    const res = await analyzeGame(pgn, mockEngine, { depth: 14 });
    // 4. a3 has top-3 scored pvLines populated
    const moveA3 = res.moves[6];
    expect(moveA3.san).toBe("a3");
    expect(moveA3.pvLines).toHaveLength(3);
    expect(moveA3.pvLines?.[0]).toMatchObject({ multipv: 1, cp: 60, pvSan: ["d4", "Nf6"] });

    // 4...c5 carries evalAfter refutation line (distinct from altPvSan)
    const moveC5 = res.moves[7];
    expect(moveC5.san).toBe("c5");
    expect(moveC5.altPvSan).toEqual(["c6", "Nf3"]);
    expect(moveC5.refutationPvSan).toEqual(["Nb5", "Qd8"]);
    expect(moveC5.classification.badge).toBe("Blunder");

    // 6. Qxd4 is an out-of-book recapture after 5...cxd4 and must stay Best instead of Great
    const moveQxd4 = res.moves[10];
    expect(moveQxd4.san).toBe("Qxd4");
    expect(moveQxd4.classification.badge).toBe("Best");

    // PGN ratings 800 vs 400 keep estimatedElo realistic (< 1500) rather than 2850
    expect(res.summary.white.estimatedElo).toBeGreaterThanOrEqual(400);
    expect(res.summary.white.estimatedElo).toBeLessThan(1500);
    expect(res.summary.black.estimatedElo).toBeLessThan(900);
  });

  it("downgrades obvious free-Queen grabs after opponent blunders from Great to Best", async () => {
    const pgn = `[White "Finder"]
[Black "HungQueen"]
[Result "1-0"]

1. d4 Nf6 2. Bg5 d5 3. Nc3 e6 4. e4 Nxe4 5. Bxd8 1-0`;

    const c = new Chess();
    const fens: string[] = [c.fen()];
    const sans = ["d4", "Nf6", "Bg5", "d5", "Nc3", "e6", "e4", "Nxe4", "Bxd8"];
    for (const san of sans) {
      c.move(san);
      fens.push(c.fen());
    }

    const mockEngine: ChessEngine = {
      async evaluatePosition(fen, depth) {
        if (fen === fens[7]) {
          // Before 4...Nxe4?? (index 7): Black had -10
          return {
            fen,
            depth,
            bestMoveUci: "f8e7",
            bestMoveSan: "Be7",
            whiteCp: -10,
            lines: [{ multipv: 1, cp: -10, pvUci: ["f8e7"], pvSan: ["Be7"] }],
          };
        }
        if (fen === fens[8]) {
          // Before 5. Bxd8 (index 8): taking free Queen is +950, PV2 (5. Nxe4) is -20 (wpPV2 < 55%)
          return {
            fen,
            depth,
            bestMoveUci: "g5d8",
            bestMoveSan: "Bxd8",
            whiteCp: 950,
            lines: [
              { multipv: 1, cp: 950, pvUci: ["g5d8", "f8b4"], pvSan: ["Bxd8", "Bb4"] },
              { multipv: 2, cp: -20, pvUci: ["c3e4", "d5e4"], pvSan: ["Nxe4", "dxe4"] },
            ],
          };
        }
        if (fen === fens[9]) {
          return {
            fen,
            depth,
            bestMoveUci: "f8b4",
            bestMoveSan: "Bb4",
            whiteCp: 950,
            lines: [{ multipv: 1, cp: 950, pvUci: ["f8b4"], pvSan: ["Bb4"] }],
          };
        }
        return {
          fen,
          depth,
          bestMoveUci: "e2e4",
          bestMoveSan: "e4",
          whiteCp: 20,
          lines: [{ multipv: 1, cp: 20, pvUci: ["e2e4"], pvSan: ["e4"] }],
        };
      },
      dispose() {},
    };

    const res = await analyzeGame(pgn, mockEngine, { depth: 14 });
    const moveBxd8 = res.moves[8];
    expect(moveBxd8.san).toBe("Bxd8");
    expect(moveBxd8.classification.badge).toBe("Best");
  });

  it("extracts [%clk ...] timestamps (including 00:xx:yy) and parses seconds-only TimeControl headers cleanly", () => {
    const timedPgn = `[Event "Live Chess"]
[TimeControl "600"]

1. e4 {[%clk 00:09:58.7]} 1... e5 {[%clk 0:10:00]} 2. Nf3 {[%clk 00:09:55.1]} 2... Nf6 {[%clk 0:00:12.4]} 1-0`;
    const parsed = parsePgnGame(timedPgn);
    expect(parsed.moves.map((m) => m.clock)).toEqual(["9:58.7", "10:00", "9:55.1", "0:12.4"]);

    expect(parseBaseClockFromHeader("600")).toBe("10:00");
    expect(parseBaseClockFromHeader("600+5")).toBe("10:00");
    expect(parseBaseClockFromHeader("1/86400")).toBeUndefined();
    expect(parseBaseClockFromHeader("40/7200")).toBeUndefined();
    expect(getFenTurn("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1")).toBe("b");
    expect(getFenTurn("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toBe("w");
  });

  it("P0: forwards bestMoveSan, refutationPvSan, and badge to extractTacticalContext during analyzeGame", async () => {
    const pgn = "1. e4 e5 2. Qh5 g6 3. Nc3 *";
    const mockEngine: ChessEngine = {
      async evaluatePosition(fen: string, depth: number): Promise<PositionEval> {
        if (fen.includes("6p1/4p2Q/4P3") && fen.includes(" w ")) {
          return {
            fen,
            depth,
            bestMoveUci: "h5e5",
            bestMoveSan: "Qxe5+",
            whiteCp: 720,
            lines: [{ multipv: 1, cp: 720, pvUci: ["h5e5"], pvSan: ["Qxe5+"] }],
          };
        }
        return {
          fen,
          depth,
          bestMoveUci: "a7a6",
          bestMoveSan: "a6",
          whiteCp: 0,
          lines: [{ multipv: 1, cp: 0, pvUci: ["a7a6"], pvSan: ["a6"] }],
        };
      },
      dispose() {},
    };

    const res = await analyzeGame(pgn, mockEngine, { depth: 12 });
    const blunderMove = res.moves[4]; // 3. Nc3
    expect(blunderMove.san).toBe("Nc3");
    expect(blunderMove.classification.badge).toBe("Miss");
    expect(blunderMove.tacticalContext.tags).toContain("MISSED_FORK");
    expect(blunderMove.tacticalContext.missedTactic?.missedMoveSan).toBe("Qxe5+");
    expect(blunderMove.tacticalContext.missedTactic?.targetSquares).toEqual(
      expect.arrayContaining(["e8", "h8"])
    );
  });

  it("P2: suppresses Great on free pawn grabs after major blunders and captures onto newly blundered squares", async () => {
    // Case A: 4. Nc3?? hangs g2 pawn (>= 25% WP blunder, with f1-bishop already moved to d3) -> 4... Bxg2 should be Best, not Great
    const pawnGrabPgn = "1. d4 b6 2. e3 Bb7 3. Bd3 Nf6 4. Nc3 Bxg2 *";
    const cA = new Chess();
    const fensA: string[] = [cA.fen()];
    for (const san of ["d4", "b6", "e3", "Bb7", "Bd3", "Nf6", "Nc3", "Bxg2"]) {
      cA.move(san);
      fensA.push(cA.fen());
    }
    const engineA: ChessEngine = {
      async evaluatePosition(fen, depth) {
        if (fen === fensA[6]) {
          // Before 4. Nc3?? (ply idx 6): +100cp
          return {
            fen,
            depth,
            bestMoveUci: "g1f3",
            bestMoveSan: "Nf3",
            whiteCp: 100,
            lines: [{ multipv: 1, cp: 100, pvUci: ["g1f3"], pvSan: ["Nf3"] }],
          };
        }
        if (fen === fensA[7]) {
          // Before 4... Bxg2 (ply idx 7): White dropped to -350cp; PV2 is 0
          return {
            fen,
            depth,
            bestMoveUci: "b7g2",
            bestMoveSan: "Bxg2",
            whiteCp: -350,
            lines: [
              { multipv: 1, cp: -350, pvUci: ["b7g2"], pvSan: ["Bxg2"] },
              { multipv: 2, cp: 0, pvUci: ["e7e6"], pvSan: ["e6"] },
            ],
          };
        }
        if (fen === fensA[8]) {
          return {
            fen,
            depth,
            bestMoveUci: "d1f3",
            bestMoveSan: "Qf3",
            whiteCp: -350,
            lines: [{ multipv: 1, cp: -350, pvUci: ["d1f3"], pvSan: ["Qf3"] }],
          };
        }
        return {
          fen,
          depth,
          bestMoveUci: "e7e6",
          bestMoveSan: "e6",
          whiteCp: 100,
          lines: [{ multipv: 1, cp: 100, pvUci: ["e7e6"], pvSan: ["e6"] }],
        };
      },
      dispose() {},
    };
    const resA = await analyzeGame(pawnGrabPgn, engineA, { depth: 12 });
    const moveBxg2 = resA.moves[7];
    expect(moveBxg2.san).toBe("Bxg2");
    expect(moveBxg2.classification.badge).toBe("Best");

    // Case B: 3... Qe6?? blunders onto e6 (defended by Bc8/f7 so SEE net < 4) -> 4. Qxe6 should be Best, not Great
    const blunderSqPgn = "1. e4 d5 2. exd5 Qxd5 3. Qe2 Qe6 4. Qxe6 *";
    const cB = new Chess();
    const fensB: string[] = [cB.fen()];
    for (const san of ["e4", "d5", "exd5", "Qxd5", "Qe2", "Qe6", "Qxe6"]) {
      cB.move(san);
      fensB.push(cB.fen());
    }
    const engineB: ChessEngine = {
      async evaluatePosition(fen, depth) {
        if (fen === fensB[5]) {
          // Before 3... Qe6?? (ply idx 5): +20cp
          return {
            fen,
            depth,
            bestMoveUci: "b8c6",
            bestMoveSan: "Nc6",
            whiteCp: 20,
            lines: [{ multipv: 1, cp: 20, pvUci: ["b8c6"], pvSan: ["Nc6"] }],
          };
        }
        if (fen === fensB[6]) {
          // Before 4. Qxe6 (ply idx 6): +400cp, PV2 is -50cp
          return {
            fen,
            depth,
            bestMoveUci: "e2e6",
            bestMoveSan: "Qxe6",
            whiteCp: 400,
            lines: [
              { multipv: 1, cp: 400, pvUci: ["e2e6"], pvSan: ["Qxe6"] },
              { multipv: 2, cp: -50, pvUci: ["b1c3"], pvSan: ["Nc3"] },
            ],
          };
        }
        if (fen === fensB[7]) {
          return {
            fen,
            depth,
            bestMoveUci: "f7e6",
            bestMoveSan: "fxe6",
            whiteCp: 400,
            lines: [{ multipv: 1, cp: 400, pvUci: ["f7e6"], pvSan: ["fxe6"] }],
          };
        }
        return {
          fen,
          depth,
          bestMoveUci: "e2e6",
          bestMoveSan: "Qxe6",
          whiteCp: 20,
          lines: [{ multipv: 1, cp: 20, pvUci: ["e2e6"], pvSan: ["Qxe6"] }],
        };
      },
      dispose() {},
    };
    const resB = await analyzeGame(blunderSqPgn, engineB, { depth: 12 });
    const moveQxe6 = resB.moves[6];
    expect(moveQxe6.san).toBe("Qxe6");
    expect(moveQxe6.classification.badge).toBe("Best");
  });

  it("suppresses Great on obvious free en passant grabs after major blunders while allowing Great on defended deflection checks", async () => {
    // 1. En passant capture winning undefended pawn after >= 25% WP blunder stays Best
    const epPgn = `[SetUp "1"]
[FEN "4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 20"]

20... d5 21. exd6 *`;
    const cEp = new Chess("4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 20");
    const epFen0 = cEp.fen();
    cEp.move("d5");
    const epFen1 = cEp.fen();
    cEp.move("exd6");
    const epFen2 = cEp.fen();

    const engineEp: ChessEngine = {
      async evaluatePosition(fen, depth) {
        if (fen === epFen0) {
          return {
            fen,
            depth,
            bestMoveUci: "e8f7",
            bestMoveSan: "Kf7",
            whiteCp: 50,
            lines: [{ multipv: 1, cp: 50, pvUci: ["e8f7"], pvSan: ["Kf7"] }],
          };
        }
        if (fen === epFen1) {
          return {
            fen,
            depth,
            bestMoveUci: "e5d6",
            bestMoveSan: "exd6",
            whiteCp: 450,
            lines: [
              { multipv: 1, cp: 450, pvUci: ["e5d6"], pvSan: ["exd6"] },
              { multipv: 2, cp: 0, pvUci: ["e1d2"], pvSan: ["Kd2"] },
            ],
          };
        }
        return {
          fen,
          depth,
          bestMoveUci: "e8d7",
          bestMoveSan: "Kd7",
          whiteCp: 450,
          lines: [{ multipv: 1, cp: 450, pvUci: ["e8d7"], pvSan: ["Kd7"] }],
        };
      },
      dispose() {},
    };
    const resEp = await analyzeGame(epPgn, engineEp, { depth: 12 });
    const moveExd6 = resEp.moves[1];
    expect(moveExd6.san).toBe("exd6");
    expect(moveExd6.classification.badge).toBe("Best");

    // 2. Defended deflection check Bxd7+ onto newly blundered square preserves Great
    const deflectPgn = `[SetUp "1"]
[FEN "1n2k3/2q5/8/1B6/8/8/8/4K3 b - - 0 20"]

20... Nd7 21. Bxd7+ *`;
    const cDef = new Chess("1n2k3/2q5/8/1B6/8/8/8/4K3 b - - 0 20");
    const defFen0 = cDef.fen();
    cDef.move("Nd7");
    const defFen1 = cDef.fen();

    const engineDef: ChessEngine = {
      async evaluatePosition(fen, depth) {
        if (fen === defFen0) {
          return {
            fen,
            depth,
            bestMoveUci: "b8c6",
            bestMoveSan: "Nc6",
            whiteCp: 50,
            lines: [{ multipv: 1, cp: 50, pvUci: ["b8c6"], pvSan: ["Nc6"] }],
          };
        }
        if (fen === defFen1) {
          return {
            fen,
            depth,
            bestMoveUci: "b5d7",
            bestMoveSan: "Bxd7+",
            whiteCp: 500,
            lines: [
              { multipv: 1, cp: 500, pvUci: ["b5d7"], pvSan: ["Bxd7+"] },
              { multipv: 2, cp: -50, pvUci: ["b5a4"], pvSan: ["Ba4"] },
            ],
          };
        }
        return {
          fen,
          depth,
          bestMoveUci: "c7d7",
          bestMoveSan: "Qxd7",
          whiteCp: 500,
          lines: [{ multipv: 1, cp: 500, pvUci: ["c7d7"], pvSan: ["Qxd7"] }],
        };
      },
      dispose() {},
    };
    const resDef = await analyzeGame(deflectPgn, engineDef, { depth: 12 });
    const moveBxd7 = resDef.moves[1];
    expect(moveBxd7.san).toBe("Bxd7+");
    expect(moveBxd7.classification.badge).toBe("Great");
  });
});
