import { describe, it, expect } from "vitest";
import {
  parseUciInfoLine,
  uciScoreToWhiteCentipawns,
  uciScoreToActiveCentipawns,
  uciPvToSan,
  formatEvalLabel,
} from "@/lib/engine/uci-parser";

describe("uci-parser & Stockfish perspective normalization", () => {
  it("parses MultiPV centipawn info lines accurately", () => {
    const line =
      "info depth 18 seldepth 24 multipv 2 score cp -145 nodes 123456 nps 500000 hashfull 120 time 240 pv e7e5 g1f3 b8c6";
    const parsed = parseUciInfoLine(line);
    expect(parsed).toEqual({
      depth: 18,
      multipv: 2,
      cp: -145,
      mate: undefined,
      pv: ["e7e5", "g1f3", "b8c6"],
    });
  });

  it("parses MultiPV forced mate info lines accurately (positive and negative)", () => {
    const matePos = parseUciInfoLine("info depth 16 multipv 1 score mate 3 pv d8h4 g2g3 h4e4");
    expect(matePos).toEqual({
      depth: 16,
      multipv: 1,
      cp: 10000,
      mate: 3,
      pv: ["d8h4", "g2g3", "h4e4"],
    });

    const mateNeg = parseUciInfoLine("info depth 16 multipv 1 score mate -2 pv e1f1 d8d1");
    expect(mateNeg?.mate).toBe(-2);
    expect(mateNeg?.cp).toBe(-10000);
  });

  it("ignores upperbound/lowerbound aspiration lines or lines without score/pv", () => {
    expect(parseUciInfoLine("info depth 12 currmove e2e4 currmovenumber 1")).toBeNull();
    expect(parseUciInfoLine("info depth 14 multipv 1 score cp 40 lowerbound pv e2e4")).toBeNull();
    expect(parseUciInfoLine("info depth 14 multipv 1 score cp 40 upperbound pv e2e4")).toBeNull();
  });

  it("normalizes UCI side-to-move scores to White perspective accurately", () => {
    // White to move, +150cp => White is +150cp
    expect(uciScoreToWhiteCentipawns({ cp: 150 }, "w")).toEqual({ cp: 150, mate: undefined });
    // Black to move, +150cp => Black is +150cp ahead => White is -150cp
    expect(uciScoreToWhiteCentipawns({ cp: 150 }, "b")).toEqual({ cp: -150, mate: undefined });
    // Black to move, mate +2 (Black mates White in 2) => White mate = -2
    expect(uciScoreToWhiteCentipawns({ cp: 10000, mate: 2 }, "b")).toEqual({ cp: -10000, mate: -2 });
  });

  it("normalizes White-perspective scores back to active-player perspective", () => {
    expect(uciScoreToActiveCentipawns({ cp: 200 }, "w")).toEqual({ cp: 200, mate: undefined });
    expect(uciScoreToActiveCentipawns({ cp: 200 }, "b")).toEqual({ cp: -200, mate: undefined });
    expect(uciScoreToActiveCentipawns({ cp: -10000, mate: -3 }, "b")).toEqual({ cp: 10000, mate: 3 });
  });

  it("converts UCI PV lines to SAN notation given starting FEN", () => {
    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const san = uciPvToSan(startFen, ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"]);
    expect(san).toEqual(["e4", "e5", "Nf3", "Nc6", "Bb5"]);
  });

  it("handles promotion UCI moves like e7e8q -> e8=Q+", () => {
    const promoFen = "r6k/4P3/8/8/8/8/8/4K3 w - - 0 40";
    const san = uciPvToSan(promoFen, ["e7e8q"]);
    expect(san).toEqual(["e8=Q+"]);
  });

  it("treats UCI score mate 0 as mated (-10000 cp)", () => {
    const mated = parseUciInfoLine("info depth 1 multipv 1 score mate 0 pv e1d1");
    expect(mated?.cp).toBe(-10000);
    expect(mated?.mate).toBe(0);
  });

  it("formats eval labels for cp, forced mate, and delivered checkmate (#)", () => {
    expect(formatEvalLabel(180)).toBe("+1.8");
    expect(formatEvalLabel(-42)).toBe("-0.4");
    expect(formatEvalLabel(2)).toBe("0.0");
    expect(formatEvalLabel(10000, 3)).toBe("M3");
    expect(formatEvalLabel(-10000, -2)).toBe("-M2");
    expect(formatEvalLabel(10000, 1, true)).toBe("#");
  });
});
