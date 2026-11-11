import { describe, it, expect } from "vitest";
import { computeCapturedMaterial } from "@/lib/chess/material";

describe("computeCapturedMaterial", () => {
  it("returns zero captures and 0 advantage at standard starting position", () => {
    const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const res = computeCapturedMaterial(start);
    expect(res.whiteCaptured).toEqual([]);
    expect(res.blackCaptured).toEqual([]);
    expect(res.whiteAdvantage).toBe(0);
    expect(res.blackAdvantage).toBe(0);
  });

  it("tracks captured Black and White pieces and net centipawn/point advantage accurately", () => {
    // White captured Black's Queen (+9) and Pawn (+1); Black captured White's Knight (-3) => net White +7
    const fen = "rnb1kbnr/ppppppp1/8/8/8/8/PPPPPPPP/R1BQKBNR w KQkq - 0 1";
    const res = computeCapturedMaterial(fen);
    expect(res.whiteAdvantage).toBe(7);
    expect(res.blackAdvantage).toBe(0);
    expect(res.whiteCaptured.map((p) => p.type)).toEqual(["q", "p"]);
    expect(res.blackCaptured.map((p) => p.type)).toEqual(["n"]);
  });

  it("respects custom starting FEN baselines without phantom captured pieces", () => {
    const customStart = "4k3/8/8/8/8/8/4P3/4K2R w - - 0 40";
    const res = computeCapturedMaterial(customStart, customStart);
    expect(res.whiteAdvantage).toBe(6);
    expect(res.blackAdvantage).toBe(0);
    expect(res.whiteCaptured).toEqual([]);
    expect(res.blackCaptured).toEqual([]);
  });
});
