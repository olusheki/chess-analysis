import { describe, it, expect } from "vitest";
import { analyzeGame } from "@/lib/analysis/game-analyzer";
import { createNodeStockfishEngine } from "@/lib/engine/stockfish-node";

describe("Stockfish WASM end-to-end acceptance", () => {
  it("ACCEPTANCE TEST (Real Stockfish 17.1 WASM): awards Brilliant (!!) to Kasparov's 24. Rxd4!!", async () => {
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
        startPlyEvalFrom: 45,
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
