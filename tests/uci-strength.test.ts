import { describe, it, expect } from "vitest";
import {
  buildStrengthUciConfig,
  getStrengthKey,
  getStrengthOptionCommands,
  getGoCommand,
} from "@/lib/engine/engine-evaluator";
import { createNodeStockfishEngine } from "@/lib/engine/stockfish-node";

describe("Stockfish UCI strength & ELO calibration", () => {
  it("maps undefined and extreme ELO inputs onto full-strength or bounded Stockfish 17.1 configurations", () => {
    expect(buildStrengthUciConfig(undefined)).toEqual({
      useLimitStrength: false,
      uciElo: 1320,
      skillLevel: 20,
      recommendedDepth: 14,
    });

    expect(buildStrengthUciConfig(1650)).toEqual({
      useLimitStrength: true,
      uciElo: 1650,
      skillLevel: 20,
      recommendedDepth: 10,
    });

    // Upper clamp to Stockfish 17.1 max UCI_Elo = 3190
    expect(buildStrengthUciConfig(4000)).toEqual({
      useLimitStrength: true,
      uciElo: 3190,
      skillLevel: 20,
      recommendedDepth: 10,
    });

    // Sub-1320 ratings calibrate Skill Level 0..5 without exceeding 1320 floor
    const club850 = buildStrengthUciConfig(860);
    expect(club850.useLimitStrength).toBe(false);
    expect(club850.skillLevel).toBeGreaterThanOrEqual(1);
    expect(club850.skillLevel).toBeLessThanOrEqual(4);
    expect(club850.recommendedDepth).toBeGreaterThanOrEqual(3);
    expect(club850.recommendedDepth).toBeLessThanOrEqual(7);

    const floor400 = buildStrengthUciConfig(250);
    expect(floor400).toEqual({
      useLimitStrength: false,
      uciElo: 1320,
      skillLevel: 0,
      recommendedDepth: 3,
    });
  });

  it("emits exact UCI setoption and go commands for limited and full-strength searches", () => {
    expect(getStrengthOptionCommands(1500)).toEqual([
      "setoption name UCI_LimitStrength value true",
      "setoption name UCI_Elo value 1500",
      "setoption name Skill Level value 20",
    ]);

    expect(getStrengthOptionCommands(900)).toEqual([
      "setoption name UCI_LimitStrength value false",
      "setoption name Skill Level value 3",
    ]);

    expect(getStrengthOptionCommands(undefined)).toEqual([
      "setoption name UCI_LimitStrength value false",
      "setoption name Skill Level value 20",
    ]);

    expect(getGoCommand(12)).toBe("go depth 12");
    expect(getGoCommand(10, { moveTimeMs: 220 })).toBe("go movetime 220");
    expect(getGoCommand(10, { moveTimeMs: 10 })).toBe("go movetime 50");

    expect(getStrengthKey(undefined)).toBe("skill:20");
    expect(getStrengthKey(900)).toBe("skill:3");
    expect(getStrengthKey(1500)).toBe("elo:1500");
  });

  it("switches cleanly between ELO-limited play and full-strength analysis in real Stockfish 17.1 WASM", async () => {
    const engine = createNodeStockfishEngine();
    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    try {
      const limited = await engine.evaluatePosition(startFen, 8, 1, {
        limitElo: 1350,
        moveTimeMs: 100,
      });
      expect(limited.bestMoveUci).toMatch(/^[a-h][1-8][a-h][1-8]/);

      const full = await engine.evaluatePosition(startFen, 6, 2);
      expect(full.lines.length).toBeGreaterThanOrEqual(1);
      expect(full.bestMoveUci).toMatch(/^[a-h][1-8][a-h][1-8]/);
    } finally {
      engine.dispose();
    }
  }, 15000);
});
