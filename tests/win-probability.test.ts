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

    it("enforces exact immediate-mate delay penalties across M3/M4 boundaries and capping", () => {
      // M3 -> finite cp (matePlayed=undefined) triggers 12.5% delayPenalty
      const m3Lost = calculateWinProbabilityDelta(10000, 300, 3, undefined);
      expect(m3Lost.deltaWP).toBeCloseTo(12.5, 4);

      // M4 -> finite cp 300 (mateBest > 3) uses standard WP delta rather than forced immediate-mate penalty
      const m4ToCp = calculateWinProbabilityDelta(10000, 300, 4, undefined);
      expect(m4ToCp.deltaWP).toBeLessThan(12.5);

      // M2 -> M5 (diff === 3, not > 3) stays tiny, while M2 -> M6 applies (6-2)*1.8 = 7.2%
      const m2ToM5 = calculateWinProbabilityDelta(10000, 10000, 2, 5);
      const m2ToM6 = calculateWinProbabilityDelta(10000, 10000, 2, 6);
      const m1ToM15 = calculateWinProbabilityDelta(10000, 10000, 1, 15);
      expect(m2ToM5.deltaWP).toBeLessThan(0.5);
      expect(m2ToM6.deltaWP).toBeCloseTo(7.2, 4);
      // Capped at 12.5% rather than unbounded (15-1)*1.8
      expect(m1ToM15.deltaWP).toBeCloseTo(12.5, 4);
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

    it("weights critical balanced positions higher than decided positions and penalizes blunders via harmonic blend", () => {
      // Critical position error (wpBest=50) lowers accuracy more than an identical deltaWP in a decided (wpBest=100) position
      const criticalErr = calculateOverallGameAccuracy([
        { deltaWP: 15, wpBest: 50 },
        { deltaWP: 0, wpBest: 99 },
      ]);
      const garbageErr = calculateOverallGameAccuracy([
        { deltaWP: 15, wpBest: 99 },
        { deltaWP: 0, wpBest: 50 },
      ]);
      expect(criticalErr).toBeLessThan(garbageErr);

      // One severe blunder alongside routine optimal moves pulls overall accuracy well below 80%
      const withOneBlunder = calculateOverallGameAccuracy([
        { deltaWP: 60, wpBest: 50 },
        ...Array.from({ length: 9 }, () => ({ deltaWP: 0, wpBest: 50 })),
      ]);
      expect(withOneBlunder).toBeLessThan(70);
      expect(withOneBlunder).toBeGreaterThan(20);
    });

    it("scales harmonic floor & blend adaptively via disaster factor (raises 1-blunder floor, preserves collapse on multi-blunder games, and downweights garbage-time moves)", () => {
      // Game 9 shape: 1 blunder in 16 moves (~68% Chess.com) raises above 59% with ~10.0 calm floor
      const oneBlunderSixteenMoves = calculateOverallGameAccuracy([
        { deltaWP: 0, wpBest: 55 },
        { deltaWP: 0, wpBest: 54 },
        { deltaWP: 7.7, wpBest: 68.8 },
        { deltaWP: 21.5, wpBest: 85.7 },
        { deltaWP: 8.1, wpBest: 72.5 },
        { deltaWP: 13.2, wpBest: 75.0 },
        { deltaWP: 8.8, wpBest: 81.8 },
        { deltaWP: 1.5, wpBest: 85.0 },
        { deltaWP: 73.7, wpBest: 83.9 }, // single ~1% accuracy blunder
        ...Array.from({ length: 7 }, () => ({ deltaWP: 0, wpBest: 99.8 })),
      ]);
      expect(oneBlunderSixteenMoves).toBeGreaterThan(59);

      // Game 2 Black shape: early mistake+blunder in balanced positions followed by 20 dead-lost garbage-time moves
      const deadLostGarbage = calculateOverallGameAccuracy([
        { deltaWP: 2.1, wpBest: 49.1 },
        { deltaWP: 17.6, wpBest: 48.4 },
        { deltaWP: 0, wpBest: 29.4 },
        { deltaWP: 35.5, wpBest: 35.9 },
        ...Array.from({ length: 20 }, () => ({ deltaWP: 0.1, wpBest: 0.1 })),
      ]);
      expect(deadLostGarbage).toBeLessThan(76);

      // Game 10 pistapoc shape: repeated severe competitive blunders trigger full disaster floor (1.5) + harmonic tilt
      const multiBlunderCollapse = calculateOverallGameAccuracy([
        { deltaWP: 28, wpBest: 50 },
        { deltaWP: 35, wpBest: 48 },
        { deltaWP: 42, wpBest: 52 },
        { deltaWP: 55, wpBest: 46 },
        { deltaWP: 30, wpBest: 45 },
        { deltaWP: 0, wpBest: 45 },
        { deltaWP: 0, wpBest: 44 },
        { deltaWP: 0, wpBest: 43 },
      ]);
      expect(multiBlunderCollapse).toBeLessThan(32);
    });

    it("penalizes delaying immediate forced mate (e.g. missing M1 and settling for M8)", () => {
      const m1ToM8 = calculateWinProbabilityDelta(10000, 10000, 1, 8);
      expect(m1ToM8.deltaWP).toBeGreaterThanOrEqual(7.0);
      expect(calculateMoveAccuracy(m1ToM8.deltaWP)).toBeLessThan(80.0);

      // Minor mate-length variation (+M2 -> +M3) remains nearly free
      const m2ToM3 = calculateWinProbabilityDelta(10000, 10000, 2, 3);
      expect(m2ToM3.deltaWP).toBeLessThanOrEqual(1.0);
    });
  });

  describe("estimatePerformanceRating", () => {
    it("scales with accuracy, penalizes blunders and mistakes, and widens beginner fallback floor to 100", () => {
      const high = estimatePerformanceRating(95, 0, 0);
      const withErrors = estimatePerformanceRating(95, 2, 3);
      expect(high).toBe(Math.round(200 + 95 * 26.5));
      expect(withErrors).toBeLessThan(high);
      expect(estimatePerformanceRating(0, 10, 10)).toBe(100);
      expect(estimatePerformanceRating(100, 0, 0)).toBe(2850);
    });

    it("anchors game rating to PGN WhiteElo/BlackElo when available", () => {
      const lowRatedWin = estimatePerformanceRating(87.7, 0, 1, {
        playerElo: 800,
        opponentElo: 400,
        resultScore: 1,
      });
      expect(lowRatedWin).toBeGreaterThanOrEqual(750);
      expect(lowRatedWin).toBeLessThan(1500);

      const weakGame = estimatePerformanceRating(25, 5, 2, {
        playerElo: 195,
        opponentElo: 197,
        resultScore: 0,
      });
      expect(weakGame).toBeLessThan(400);
      expect(weakGame).toBeGreaterThanOrEqual(100);

      // Losing to a massive rating outlier (390 vs 1504 at 70% accuracy) should not inflate above 760
      const massiveMismatchLoss = estimatePerformanceRating(70.1, 1, 1, {
        playerElo: 390,
        opponentElo: 1504,
        resultScore: 0,
      });
      expect(massiveMismatchLoss).toBeLessThan(760);
      expect(massiveMismatchLoss).toBeGreaterThan(450);

      // 272-rated player scoring ~58% accuracy in a competitive loss must not collapse to the 100 floor
      const solidBeginnerLoss = estimatePerformanceRating(58.3, 4, 1, {
        playerElo: 272,
        opponentElo: 322,
        resultScore: 0,
      });
      expect(solidBeginnerLoss).toBeGreaterThan(200);
    });

    it("handles mate === 0 fallback, very deep mates (-M25 / +M25), and boundary move accuracy", () => {
      expect(centipawnsToWinProbability(100, 0)).toBeCloseTo(
        centipawnsToWinProbability(100),
        6
      );
      expect(centipawnsToWinProbability(0, 6)).toBeCloseTo(99.6, 5);
      expect(centipawnsToWinProbability(0, -6)).toBeCloseTo(0.4, 5);
      expect(centipawnsToWinProbability(0, 25)).toBeCloseTo(99.1, 2);
      expect(centipawnsToWinProbability(0, -25)).toBeCloseTo(0.9, 2);
      expect(calculateMoveAccuracy(0.001)).toBe(100.0);
      expect(calculateMoveAccuracy(0.02)).toBeLessThan(100.0);
      expect(calculateWinProbabilityDelta(0, 0, undefined, 0).deltaWP).toBe(0);
      // matePlayed === 0 must not trigger the forced-mate conversion shortcut
      expect(calculateWinProbabilityDelta(500, 0, undefined, 0).deltaWP).toBeGreaterThan(40);
    });

    it("kills remaining anchored and unanchored Elo boundary mutations cleanly", () => {
      // Single-side Elo anchoring and zero-Elo fallback
      const onlyPlayer = estimatePerformanceRating(75, 0, 0, { playerElo: 1200, resultScore: 0.5 });
      const onlyOpp = estimatePerformanceRating(75, 0, 0, { opponentElo: 1200, resultScore: 0.5 });
      const zeroEloFallback = estimatePerformanceRating(80, 1, 2, { playerElo: 0, opponentElo: 0 });
      expect(onlyPlayer).toBe(onlyOpp);
      expect(onlyPlayer).toBeGreaterThan(1200);
      expect(zeroEloFallback).toBe(estimatePerformanceRating(80, 1, 2));

      // Upward & downward opponent gap bounds + draw threshold (score === 0.5 allows +600 vs loss +350)
      const drawVsGiant = estimatePerformanceRating(70, 0, 0, {
        playerElo: 400,
        opponentElo: 2000,
        resultScore: 0.5,
      });
      const lossVsGiant = estimatePerformanceRating(70, 0, 0, {
        playerElo: 400,
        opponentElo: 2000,
        resultScore: 0,
      });
      expect(drawVsGiant).toBeLessThan(900);
      expect(drawVsGiant - lossVsGiant).toBeGreaterThan(80);

      const stompLowRated = estimatePerformanceRating(90, 0, 0, {
        playerElo: 2000,
        opponentElo: 600,
        resultScore: 1,
      });
      expect(stompLowRated).toBeGreaterThan(1950);
      expect(stompLowRated).toBeLessThan(2150);

      // Blunder/mistake tiebreakers affect both anchored and unanchored modes
      const anchoredClean = estimatePerformanceRating(70, 0, 0, { playerElo: 1500, opponentElo: 1500 });
      const anchoredBlunders = estimatePerformanceRating(70, 4, 3, { playerElo: 1500, opponentElo: 1500 });
      expect(anchoredClean - anchoredBlunders).toBe(33);

      const unanchoredNoErr = estimatePerformanceRating(80, 0, 0);
      const unanchoredWithErr = estimatePerformanceRating(80, 2, 3);
      expect(unanchoredNoErr - unanchoredWithErr).toBe(340);
    });
  });
});
