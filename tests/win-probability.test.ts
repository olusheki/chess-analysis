import { describe, it, expect } from "vitest";
import {
  centipawnsToWinProbability,
  calculateWinProbabilityDelta,
  calculateMoveAccuracy,
  calculateOverallGameAccuracy,
  estimatePerformanceRating,
} from "@/lib/engine/win-probability";

describe("win-probability engine math", () => {
  describe("centipawnsToWinProbability", () => {
    it("returns 50% at 0 centipawns", () => {
      expect(centipawnsToWinProbability(0)).toBeCloseTo(50.0, 5);
    });

    it("increases monotonically with positive centipawns and approaches 100%", () => {
      const wp100 = centipawnsToWinProbability(100);
      const wp300 = centipawnsToWinProbability(300);
      const wp900 = centipawnsToWinProbability(900);
      expect(wp100).toBeCloseTo(100 / (1 + Math.pow(10, -0.4)), 4);
      expect(wp100).toBeGreaterThan(50);
      expect(wp300).toBeGreaterThan(wp100);
      expect(wp900).toBeGreaterThan(wp300);
      expect(wp900).toBeLessThanOrEqual(100);
    });

    it("is symmetric around 50% for negative centipawns", () => {
      expect(centipawnsToWinProbability(-250) + centipawnsToWinProbability(250)).toBeCloseTo(100.0, 5);
      expect(centipawnsToWinProbability(-1000)).toBeGreaterThanOrEqual(0);
      expect(centipawnsToWinProbability(-1000)).toBeLessThan(1);
    });

    it("handles forced positive mates: +M1..+M3 = 100%, +M4..+M10 above high cp evals", () => {
      const m1 = centipawnsToWinProbability(0, 1);
      const m3 = centipawnsToWinProbability(0, 3);
      const m6 = centipawnsToWinProbability(0, 6);
      const m15 = centipawnsToWinProbability(0, 15);
      expect(m1).toBe(100.0);
      expect(m3).toBe(100.0);
      expect(m6).toBeGreaterThan(99.5);
      expect(m6).toBeLessThan(100.0);
      expect(m15).toBeGreaterThan(99.0);
      expect(m3).toBeGreaterThan(centipawnsToWinProbability(700));
    });

    it("handles forced negative mates: -M1..-M3 = 0%, longer negative mates near 0%", () => {
      const mNeg1 = centipawnsToWinProbability(0, -1);
      const mNeg3 = centipawnsToWinProbability(0, -3);
      const mNeg15 = centipawnsToWinProbability(0, -15);
      expect(mNeg1).toBe(0.0);
      expect(mNeg3).toBe(0.0);
      expect(mNeg15).toBeGreaterThan(0);
      expect(mNeg15).toBeLessThan(1.0);
    });
  });

  describe("calculateWinProbabilityDelta", () => {
    it("computes positive delta when played move is worse than best move", () => {
      const { wpBest, wpPlayed, deltaWP } = calculateWinProbabilityDelta(200, -100);
      expect(wpBest).toBeGreaterThan(80);
      expect(wpPlayed).toBeLessThan(35);
      expect(deltaWP).toBeCloseTo(wpBest - wpPlayed, 6);
    });

    it("clamps deltaWP to 0 when played eval slightly exceeds best eval (depth noise)", () => {
      const { deltaWP } = calculateWinProbabilityDelta(100, 110);
      expect(deltaWP).toBe(0);
    });

    it("detects massive deltaWP when blundering a mate", () => {
      const { deltaWP } = calculateWinProbabilityDelta(300, 0, undefined, -2);
      expect(deltaWP).toBeGreaterThan(90);
    });

    it("yields 0 deltaWP when converting a huge finite cp advantage into a forced mate", () => {
      const { deltaWP } = calculateWinProbabilityDelta(850, 10000, undefined, 5);
      expect(deltaWP).toBe(0);
    });
  });

  describe("calculateMoveAccuracy (CAPS2)", () => {
    it("returns 100.0 for zero or near-zero deltaWP", () => {
      expect(calculateMoveAccuracy(0)).toBe(100.0);
      expect(calculateMoveAccuracy(0.0005)).toBe(100.0);
    });

    it("applies calibrated exponential decay and clamps within [0, 100]", () => {
      const acc5 = calculateMoveAccuracy(5);
      const acc15 = calculateMoveAccuracy(15);
      const acc35 = calculateMoveAccuracy(35);
      const acc100 = calculateMoveAccuracy(100);

      expect(acc5).toBeCloseTo(103.1668 * Math.exp(-0.04354 * 5) - 3.1669, 1);
      expect(acc5).toBeGreaterThan(acc15);
      expect(acc15).toBeGreaterThan(acc35);
      expect(acc100).toBe(0);
    });
  });

  describe("calculateOverallGameAccuracy", () => {
    it("returns 100.0 when all moves are book or forced", () => {
      expect(
        calculateOverallGameAccuracy([
          { deltaWP: 50, wpBest: 50, isBook: true },
          { deltaWP: 30, wpBest: 50, isForced: true },
        ])
      ).toBe(100.0);
    });

    it("excludes book and forced moves from the average", () => {
      const acc = calculateOverallGameAccuracy([
        { deltaWP: 40, wpBest: 50, isBook: true },
        { deltaWP: 0, wpBest: 50 },
      ]);
      expect(acc).toBe(100.0);
    });

    it("weights moves by position leverage (|wpBest - 50| / 50 + 1)", () => {
      const equalAcc = calculateMoveAccuracy(10); // weight 1.0 (wpBest=50)
      const winningAcc = calculateMoveAccuracy(0); // weight 2.0 (wpBest=100)
      const expected = parseFloat(((equalAcc * 1.0 + winningAcc * 2.0) / 3.0).toFixed(1));
      const actual = calculateOverallGameAccuracy([
        { deltaWP: 10, wpBest: 50 },
        { deltaWP: 0, wpBest: 100 },
      ]);
      expect(actual).toBe(expected);
    });
  });

  describe("estimatePerformanceRating", () => {
    it("scales with accuracy and penalizes blunders and mistakes", () => {
      const high = estimatePerformanceRating(95, 0, 0);
      const withErrors = estimatePerformanceRating(95, 2, 3);
      expect(high).toBe(Math.round(600 + 95 * 22.5));
      expect(withErrors).toBe(high - 2 * 90 - 3 * 35);
    });

    it("clamps estimated rating between 400 and 2900", () => {
      expect(estimatePerformanceRating(0, 10, 10)).toBe(400);
      expect(estimatePerformanceRating(100, 0, 0)).toBe(2850);
    });

    it("handles mate === 0 fallback, very deep mates (-M25 / +M25), and boundary move accuracy", () => {
      expect(centipawnsToWinProbability(100, 0)).toBeCloseTo(
        centipawnsToWinProbability(100),
        6
      );
      expect(centipawnsToWinProbability(0, 25)).toBeCloseTo(99.1, 2);
      expect(centipawnsToWinProbability(0, -25)).toBeCloseTo(0.9, 2);
      expect(calculateMoveAccuracy(0.001)).toBe(100.0);
      expect(calculateMoveAccuracy(0.02)).toBeLessThan(100.0);
      expect(calculateWinProbabilityDelta(0, 0, undefined, 0).deltaWP).toBe(0);
    });
  });
});
