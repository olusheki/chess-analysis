import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { analyzeGame, parsePgnGame } from "@/lib/analysis/game-analyzer";
import type { ChessEngine, PositionEval } from "@/lib/engine/engine-evaluator";
import { createNodeStockfishEngine } from "@/lib/engine/stockfish-node";

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

    // Verify CAPS2 summary & badge counts
    expect(analysis.summary.black.badgeCounts.Blunder).toBe(1);
    expect(analysis.summary.white.badgeCounts.Miss).toBe(1);
    expect(analysis.summary.white.accuracy).toBeLessThan(100);
    expect(analysis.summary.black.accuracy).toBeLessThan(100);
  });

  it("ACCEPTANCE TEST (Real Stockfish 17.1 WASM): awards Brilliant (!!) to Kasparov's 24. Rxd4!!", async () => {
    // Evaluate critical section around 23...Qd6 and 24. Rxd4!! with real Stockfish WASM
    // Using full Kasparov vs Topalov PGN up to move 26 (51 plies) so runtime is fast (<10s)
    const partialPgn = `[Event "Hoogovens"]
[White "Kasparov, Garry"]
[Black "Topalov, Veselin"]
[Result "1-0"]

1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Be3 Bg7 5. Qd2 c6 6. f3 b5 7. Nge2 Nbd7
8. Bh6 Bxh6 9. Qxh6 Bb7 10. a3 e5 11. O-O-O Qe7 12. Kb1 a6 13. Nc1 O-O-O
14. Nb3 exd4 15. Rxd4 c5 16. Rd1 Nb6 17. g3 Kb8 18. Na5 Ba8 19. Bh3 d5
20. Qf4+ Ka7 21. Rhe1 d4 22. Nd5 Nbxd5 23. exd5 Qd6 24. Rxd4 cxd4 25. Re7+ Kb6 26. Qxd4+ Kxa5`;

    const engine = createNodeStockfishEngine();
    try {
      const result = await analyzeGame(partialPgn, engine, {
        depth: 12,
        startPlyEvalFrom: 45, // Focus deep Stockfish evals starting at ply 45 (move 23), fast eval on earlier moves
      });

      const move24White = result.moves.find((m) => m.moveNumber === 24 && m.color === "w");
      expect(move24White).toBeDefined();
      expect(move24White!.san).toBe("Rxd4");
      expect(move24White!.materialSacrificed).toBeGreaterThanOrEqual(2);
      expect(move24White!.classification.badge).toBe("Brilliant");
      expect(move24White!.classification.symbol).toBe("!!");
      expect(result.opening.opening?.eco).toBe("B07");
    } finally {
      engine.dispose();
    }
  }, 30000);
});
