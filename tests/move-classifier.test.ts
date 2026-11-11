import { describe, it, expect } from "vitest";
import { classifyMove, BADGE_METADATA, MoveClassificationInput } from "@/lib/analysis/move-classifier";
import { centipawnsToWinProbability } from "@/lib/engine/win-probability";

function baseInput(overrides: Partial<MoveClassificationInput> = {}): MoveClassificationInput {
  return {
    ply: 20,
    moveSan: "Nf3",
    isBook: false,
    legalMoveCount: 30,
    cpBest: 50,
    cpPlayed: 50,
    materialSacrificed: 0,
    isBestMove: false,
    ...overrides,
  };
}

function exactCpForWp(target: number): number {
  if (centipawnsToWinProbability(0) === target) return 0;
  let lo = -3000;
  let hi = 3000;
  for (let i = 0; i < 80; i++) {
    const mid = 0.5 * (lo + hi);
    if (centipawnsToWinProbability(mid) < target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const mid = 0.5 * (lo + hi);
  const buf = new ArrayBuffer(8);
  const f64 = new Float64Array(buf);
  const u64 = new BigUint64Array(buf);
  f64[0] = mid;
  const baseBits = u64[0];
  let best = mid;
  let bestErr = Math.abs(centipawnsToWinProbability(mid) - target);
  for (let offset = -16n; offset <= 16n; offset++) {
    u64[0] = baseBits + offset;
    const cand = f64[0];
    if (!Number.isFinite(cand) || (mid < 0 && cand >= 0) || (mid > 0 && cand <= 0)) continue;
    const wp = centipawnsToWinProbability(cand);
    if (wp === target) return cand;
    const err = Math.abs(wp - target);
    if (err < bestErr) {
      bestErr = err;
      best = cand;
    }
  }
  return best;
}

describe("move-classifier (11 official Chess.com badges)", () => {
  it("prioritizes Book over all other badges", () => {
    const res = classifyMove(
      baseInput({
        isBook: true,
        legalMoveCount: 1,
        materialSacrificed: 5,
        isBestMove: true,
        cpPlayed: -500,
      })
    );
    expect(res.badge).toBe("Book");
    expect(res.symbol).toBe(BADGE_METADATA.Book.symbol);
    expect(res.color).toBe("#a88a68");
    expect(res.accuracy).toBe(100);
  });

  it("prioritizes Forced when legalMoveCount === 1 (and not book)", () => {
    const res = classifyMove(
      baseInput({
        legalMoveCount: 1,
        cpBest: 200,
        cpPlayed: -500,
        materialSacrificed: 5,
      })
    );
    expect(res.badge).toBe("Forced");
    expect(res.symbol).toBe("➔");
    expect(res.color).toBe("#8c8883");
    expect(res.accuracy).toBe(100);
  });

  it("awards Brilliant (!!) for sound sacrifices >= 2 pawns keeping >= 38% WP and <= 1% deltaWP", () => {
    // Kasparov vs Topalov 24. Rxd4!! style: rook sac (+3 net sacrificed), engine PV1, dynamic eval
    const res = classifyMove(
      baseInput({
        moveSan: "Rxd4",
        materialSacrificed: 3,
        isBestMove: true,
        cpBest: -40,
        cpPlayed: -40,
      })
    );
    expect(res.badge).toBe("Brilliant");
    expect(res.symbol).toBe("!!");
    expect(res.color).toBe("#1baca6");
    expect(res.isKeyMoment).toBe(true);
    expect(res.isBlunder).toBe(false);
  });

  it("does NOT award Brilliant if sacrifice leaves player losing (wpPlayed < 38%)", () => {
    const res = classifyMove(
      baseInput({
        materialSacrificed: 3,
        isBestMove: false,
        cpBest: 0,
        cpPlayed: -100, // wpPlayed ~ 28.5%
      })
    );
    expect(res.badge).not.toBe("Brilliant");
  });

  it("does NOT award Brilliant if materialSacrificed < 2", () => {
    const res = classifyMove(
      baseInput({
        materialSacrificed: 1,
        isBestMove: true,
        cpBest: 250,
        cpPlayed: 250,
      })
    );
    expect(res.badge).toBe("Best");
  });

  it("awards Great (!) when PV1 keeps wpBest >= 60% and PV2 drops >= 15% or below 48%", () => {
    const res = classifyMove(
      baseInput({
        isBestMove: true,
        cpBest: 120, // ~75.1% WP
        cpPlayed: 120,
        cpPV2: 10, // ~52.3% WP -> drop ~22.8% >= 15%
      })
    );
    expect(res.badge).toBe("Great");
    expect(res.symbol).toBe("!");
    expect(res.color).toBe("#5c8bb0");
    expect(res.isKeyMoment).toBe(true);
  });

  it("does NOT award Great when PV2 is also winning comfortably", () => {
    const res = classifyMove(
      baseInput({
        isBestMove: true,
        cpBest: 350, // ~96.2% WP
        cpPlayed: 350,
        cpPV2: 300, // ~94.1% WP (drop 2.1%)
      })
    );
    expect(res.badge).toBe("Best");
  });

  it("awards Best (★) when isBestMove is true or deltaWP <= 0.2", () => {
    expect(classifyMove(baseInput({ isBestMove: true })).badge).toBe("Best");
    expect(classifyMove(baseInput({ isBestMove: false, cpBest: 0, cpPlayed: 0 })).badge).toBe("Best");
  });

  it("awards Excellent when 0.2 < deltaWP <= 2.0", () => {
    // 0cp -> WP 50%, -8cp -> WP ~48.16%, delta ~ 1.84%
    const res = classifyMove(baseInput({ cpBest: 0, cpPlayed: -8 }));
    expect(res.badge).toBe("Excellent");
    expect(res.deltaWP).toBeGreaterThan(0.2);
    expect(res.deltaWP).toBeLessThanOrEqual(2.0);
  });

  it("awards Good when 2.0 < deltaWP <= 5.0", () => {
    // 0cp (50%) -> -18cp (~45.86%), delta ~ 4.14%
    const res = classifyMove(baseInput({ cpBest: 0, cpPlayed: -18 }));
    expect(res.badge).toBe("Good");
    expect(res.deltaWP).toBeGreaterThan(2.0);
    expect(res.deltaWP).toBeLessThanOrEqual(5.0);
  });

  it("awards Inaccuracy (?!) when 5.0 < deltaWP <= 12.0", () => {
    // 0cp (50%) -> -40cp (~40.89%), delta ~ 9.11%
    const res = classifyMove(baseInput({ cpBest: 0, cpPlayed: -40 }));
    expect(res.badge).toBe("Inaccuracy");
    expect(res.symbol).toBe("?!");
  });

  it("awards Mistake (?) when 12.0 < deltaWP <= 25.0", () => {
    // 0cp (50%) -> -100cp (~28.47%), delta ~ 21.53%
    const res = classifyMove(baseInput({ cpBest: 0, cpPlayed: -100 }));
    expect(res.badge).toBe("Mistake");
    expect(res.symbol).toBe("?");
    expect(res.isKeyMoment).toBe(true);
    expect(res.isBlunder).toBe(false);
  });

  it("awards Miss (X) when opponent blundered previously (prevDelta >= 18) and player fails to punish (deltaWP >= 15, wpBest >= 55)", () => {
    const res = classifyMove(
      baseInput({
        cpBest: 250, // wpBest ~90.9%
        cpPlayed: 50, // wpPlayed ~61.3% -> deltaWP ~29.6%
        prevMoveOpponentDeltaWP: 22.0,
      })
    );
    expect(res.badge).toBe("Miss");
    expect(res.symbol).toBe("X");
    expect(res.isKeyMoment).toBe(true);
    expect(res.isBlunder).toBe(true);
  });

  it("awards Blunder (??) when deltaWP > 25.0 and not a Miss", () => {
    // 250cp (90.9%) -> -50cp (38.7%) -> deltaWP ~52.2%
    const res = classifyMove(baseInput({ cpBest: 250, cpPlayed: -50 }));
    expect(res.badge).toBe("Blunder");
    expect(res.symbol).toBe("??");
    expect(res.isKeyMoment).toBe(true);
    expect(res.isBlunder).toBe(true);
  });

  it("C4: rejects Brilliant when non-best sacrifice drops large centipawns in saturated WP (+1400cp -> +600cp or loses mate)", () => {
    const res1 = classifyMove(
      baseInput({
        materialSacrificed: 3,
        isBestMove: false,
        cpBest: 1400,
        cpPlayed: 600,
      })
    );
    expect(res1.badge).not.toBe("Brilliant");

    const res2 = classifyMove(
      baseInput({
        materialSacrificed: 3,
        isBestMove: false,
        cpBest: 10000,
        mateBest: 3,
        cpPlayed: 500,
      })
    );
    expect(res2.badge).not.toBe("Brilliant");
  });

  it("H5: classifies hanging Queen or mate-blunder as Blunder (??) rather than Miss (X) even after opponent blundered", () => {
    const blunderIntoLost = classifyMove(
      baseInput({
        prevMoveOpponentDeltaWP: 25.0,
        cpBest: 250,
        cpPlayed: -600,
      })
    );
    expect(blunderIntoLost.badge).toBe("Blunder");

    const blunderIntoMate = classifyMove(
      baseInput({
        prevMoveOpponentDeltaWP: 25.0,
        cpBest: 250,
        cpPlayed: -10000,
        matePlayed: -1,
      })
    );
    expect(blunderIntoMate.badge).toBe("Blunder");
  });

  it("M2: requires PV2 to drop out of clearly winning territory for Great (!) and detects Forced mate-escape", () => {
    // +350cp -> +150cp (80% WP) is still comfortably winning, so PV1 is Best, not Great
    const comfortable = classifyMove(
      baseInput({
        isBestMove: true,
        cpBest: 350,
        cpPlayed: 350,
        cpPV2: 150,
      })
    );
    expect(comfortable.badge).toBe("Best");

    // Multiple legal moves, only PV1 avoids immediate mate (-M1)
    const forcedEscape = classifyMove(
      baseInput({
        legalMoveCount: 10,
        isBestMove: true,
        cpBest: 0,
        cpPlayed: 0,
        cpPV2: -10000,
        matePV2: -1,
      })
    );
    expect(forcedEscape.badge).toBe("Forced");
  });

  it("validates BADGE_METADATA completeness, wpPV2 < 48 Great trigger, and single-legal Forced moves", () => {
    for (const key of [
      "Brilliant",
      "Great",
      "Best",
      "Excellent",
      "Good",
      "Book",
      "Inaccuracy",
      "Mistake",
      "Miss",
      "Blunder",
      "Forced",
    ] as const) {
      expect(BADGE_METADATA[key].color.startsWith("#")).toBe(true);
      expect(BADGE_METADATA[key].symbol.length).toBeGreaterThan(0);
      expect(typeof BADGE_METADATA[key].priority).toBe("number");
    }

    // Great via wpPV2 < 48.0 even when wpBest - wpPV2 is ~13.6% (< 15%)
    const greatLowAlt = classifyMove(
      baseInput({
        isBestMove: true,
        cpBest: 50, // wpBest ~61.3%
        cpPlayed: 50,
        cpPV2: -15, // wpPV2 ~46.5%
      })
    );
    expect(greatLowAlt.badge).toBe("Great");

    // Single legal move with bad evaluation stays Forced with 100% accuracy
    const onlyMove = classifyMove(
      baseInput({
        legalMoveCount: 1,
        cpBest: 0,
        cpPlayed: -500,
      })
    );
    expect(onlyMove.badge).toBe("Forced");
    expect(onlyMove.deltaWP).toBe(0);
    expect(onlyMove.accuracy).toBe(100.0);
  });

  it("rejects false Brilliant badges (worsened mate, king check-escape, dead-won mop-up) and trivial recaptures from Great", () => {
    // 1) Worsening mate (M7 -> M9 while leaving rook en prise) cannot be Brilliant
    const worsenedMate = classifyMove(
      baseInput({
        moveSan: "Rd5+",
        materialSacrificed: 4,
        isBestMove: false,
        cpBest: 10000,
        mateBest: 7,
        cpPlayed: 10000,
        matePlayed: 9,
      })
    );
    expect(worsenedMate.badge).not.toBe("Brilliant");

    // 2) Passive King check-escape (e.g. 11...Ke7) cannot be Brilliant
    const kingEscape = classifyMove(
      baseInput({
        moveSan: "Ke7",
        materialSacrificed: 2,
        isBestMove: true,
        cpBest: -20,
        cpPlayed: -20,
        isKingCheckEscape: true,
      })
    );
    expect(kingEscape.badge).toBe("Best");

    // 3) Overwhelmingly won mop-up (+700 when PV2 is also +550) cannot be Brilliant
    const mopUp = classifyMove(
      baseInput({
        materialSacrificed: 3,
        isBestMove: true,
        cpBest: 700,
        cpPlayed: 700,
        cpPV2: 550,
      })
    );
    expect(mopUp.badge).toBe("Best");

    // 4) Trivial recapture (capturing back on opponent's last destination square) should not inflate to Great
    const trivialRecapture = classifyMove(
      baseInput({
        moveSan: "Bxd8",
        isBestMove: true,
        cpBest: 350,
        cpPlayed: 350,
        cpPV2: -100,
        isRecapture: true,
      })
    );
    expect(trivialRecapture.badge).toBe("Best");

    // 5) Capturing an obvious free Queen/piece left en prise elsewhere after opponent blunder (12. Bxd8) stays Best
    const freeQueenCapture = classifyMove(
      baseInput({
        moveSan: "Bxd8",
        isBestMove: true,
        cpBest: 950,
        cpPlayed: 950,
        cpPV2: -20, // wpPV2 ~45.4% (< 55%) if Queen wasn't captured!
        prevMoveOpponentDeltaWP: 45.0,
        isObviousFreeCapture: true,
      })
    );
    expect(freeQueenCapture.badge).toBe("Best");
  });

  it("checks Forced mate-escape guards (isBestMove, mateBest, matePV2, legalMoveCount)", () => {
    // Only PV1 escapes M1 (even when mateBest > 0 is a forced counter-mate!)
    const escapingMateWhileWinning = classifyMove(
      baseInput({
        isBestMove: true,
        mateBest: 3,
        matePlayed: 3,
        matePV2: -1,
      })
    );
    expect(escapingMateWhileWinning.badge).toBe("Forced");
    expect(escapingMateWhileWinning.isKeyMoment).toBe(false);
    expect(escapingMateWhileWinning.isBlunder).toBe(false);

    // mateBest === 0 is a non-mate sentinel (equivalent to undefined), so Forced applies if matePV2 === -1
    const zeroMateEscapingM1 = classifyMove(
      baseInput({
        isBestMove: true,
        mateBest: 0,
        cpBest: 50,
        cpPlayed: 50,
        matePV2: -1,
      })
    );
    expect(zeroMateEscapingM1.badge).toBe("Forced");

    // mateBest < 0 means PV1 itself gets mated, so not an "escape"
    const alreadyMatedNotForced = classifyMove(
      baseInput({
        isBestMove: true,
        mateBest: -2,
        matePlayed: -2,
        matePV2: -1,
      })
    );
    expect(alreadyMatedNotForced.badge).toBe("Best");

    // Player did NOT play the escaping move -> Blunder, not Forced
    const missedMateEscape = classifyMove(
      baseInput({
        isBestMove: false,
        cpBest: 50,
        cpPlayed: -500,
        matePV2: -1,
      })
    );
    expect(missedMateEscape.badge).toBe("Blunder");

    // PV2 is M2 (-2), not immediate M1 (-1) -> not classified as Forced
    const pv2MateInTwoNotForced = classifyMove(
      baseInput({
        isBestMove: true,
        cpBest: 50,
        cpPlayed: 50,
        matePV2: -2,
      })
    );
    expect(pv2MateInTwoNotForced.badge).toBe("Best");

    // legalMoveCount === 2 or 0 is not single-legal Forced
    expect(classifyMove(baseInput({ legalMoveCount: 2, isBestMove: true })).badge).toBe("Best");
    expect(classifyMove(baseInput({ legalMoveCount: 0, isBestMove: true })).badge).toBe("Best");
  });

  it("enforces exact Brilliant (!!), Great (!), and Miss (X) threshold boundaries", () => {
    // --- Brilliant boundaries ---
    // Non-PV1 near-best sacrifice: materialSacrificed === 2, cpDrop === 35, deltaWP <= 1.0
    const nonBestSacAt35Cp = classifyMove(
      baseInput({
        isBestMove: false,
        materialSacrificed: 2,
        cpBest: 435,
        cpPlayed: 400,
      })
    );
    expect(nonBestSacAt35Cp.badge).toBe("Brilliant");
    expect(nonBestSacAt35Cp.isKeyMoment).toBe(true);
    expect(nonBestSacAt35Cp.isBlunder).toBe(false);
    expect(nonBestSacAt35Cp.color).toBe("#1baca6");
    expect(nonBestSacAt35Cp.symbol).toBe("!!");

    // cpDrop === 36 rejects non-PV1 Brilliant
    expect(
      classifyMove(
        baseInput({
          isBestMove: false,
          materialSacrificed: 2,
          cpBest: 436,
          cpPlayed: 400,
        })
      ).badge
    ).toBe("Excellent");

    // Exact deltaWP === 1.0 allows non-PV1 Brilliant; 1.1 rejects
    expect(
      classifyMove(
        baseInput({
          isBestMove: false,
          materialSacrificed: 2,
          cpBest: exactCpForWp(70),
          cpPlayed: exactCpForWp(69),
        })
      ).badge
    ).toBe("Brilliant");
    expect(
      classifyMove(
        baseInput({
          isBestMove: false,
          materialSacrificed: 2,
          cpBest: exactCpForWp(70),
          cpPlayed: exactCpForWp(68.9),
        })
      ).badge
    ).toBe("Excellent");

    // cpPlayed > cpBest clamps cpDrop to 0
    expect(
      classifyMove(
        baseInput({
          isBestMove: false,
          materialSacrificed: 2,
          cpBest: 100,
          cpPlayed: 150,
        })
      ).badge
    ).toBe("Brilliant");

    // wpPlayed === 38.0 exact succeeds; 37.99 fails
    expect(
      classifyMove(
        baseInput({
          isBestMove: true,
          materialSacrificed: 2,
          cpBest: exactCpForWp(38),
          cpPlayed: exactCpForWp(38),
        })
      ).badge
    ).toBe("Brilliant");
    expect(
      classifyMove(
        baseInput({
          isBestMove: true,
          materialSacrificed: 2,
          cpBest: exactCpForWp(37.99),
          cpPlayed: exactCpForWp(37.99),
        })
      ).badge
    ).toBe("Best");

    // matePlayed === mateBest (not worsened) succeeds; matePlayed > mateBest blocks Brilliant; mateBest === 0 is not forced mate
    expect(
      classifyMove(
        baseInput({
          isBestMove: false,
          materialSacrificed: 3,
          cpBest: 0,
          cpPlayed: 0,
          mateBest: 3,
          matePlayed: 3,
        })
      ).badge
    ).toBe("Brilliant");
    expect(
      classifyMove(
        baseInput({
          isBestMove: false,
          materialSacrificed: 3,
          cpBest: 0,
          cpPlayed: 0,
          mateBest: 3,
          matePlayed: 4,
        })
      ).badge
    ).toBe("Excellent");
    expect(
      classifyMove(
        baseInput({
          isBestMove: false,
          materialSacrificed: 3,
          cpBest: 100,
          cpPlayed: 100,
          mateBest: 0,
          matePlayed: 5,
        })
      ).badge
    ).toBe("Brilliant");

    // isMopUp exact thresholds: cpBest >= 650 && cpPV2 >= 450 && !hasForcedMate
    expect(
      classifyMove(
        baseInput({
          isBestMove: true,
          materialSacrificed: 3,
          cpBest: 650,
          cpPlayed: 650,
          cpPV2: 450,
        })
      ).badge
    ).toBe("Best");
    expect(
      classifyMove(
        baseInput({
          isBestMove: true,
          materialSacrificed: 3,
          cpBest: 649,
          cpPlayed: 649,
          cpPV2: 450,
        })
      ).badge
    ).toBe("Brilliant");
    expect(
      classifyMove(
        baseInput({
          isBestMove: true,
          materialSacrificed: 3,
          cpBest: 650,
          cpPlayed: 650,
          cpPV2: 449,
        })
      ).badge
    ).toBe("Brilliant");
    expect(
      classifyMove(
        baseInput({
          isBestMove: true,
          materialSacrificed: 3,
          cpBest: 700,
          cpPlayed: 700,
          cpPV2: 550,
          mateBest: 2,
          matePlayed: 2,
        })
      ).badge
    ).toBe("Brilliant");
    expect(
      classifyMove(
        baseInput({
          isBestMove: true,
          materialSacrificed: 3,
          cpBest: 700,
          cpPlayed: 700,
          cpPV2: 550,
          mateBest: 0,
        })
      ).badge
    ).toBe("Best");

    // --- Great boundaries ---
    const greatAtExact60 = classifyMove(
      baseInput({
        isBestMove: true,
        cpBest: exactCpForWp(60),
        cpPlayed: exactCpForWp(60),
        cpPV2: exactCpForWp(44),
      })
    );
    expect(greatAtExact60.badge).toBe("Great");
    expect(greatAtExact60.isKeyMoment).toBe(true);
    expect(greatAtExact60.isBlunder).toBe(false);
    expect(greatAtExact60.symbol).toBe("!");

    expect(
      classifyMove(
        baseInput({
          isBestMove: true,
          cpBest: exactCpForWp(59.9),
          cpPlayed: exactCpForWp(59.9),
          cpPV2: exactCpForWp(40),
        })
      ).badge
    ).toBe("Best");
    expect(
      classifyMove(
        baseInput({
          isBestMove: true,
          cpBest: exactCpForWp(75),
          cpPlayed: exactCpForWp(75),
          cpPV2: exactCpForWp(55),
        })
      ).badge
    ).toBe("Best");
    expect(
      classifyMove(
        baseInput({
          isBestMove: true,
          cpBest: exactCpForWp(68),
          cpPlayed: exactCpForWp(68),
          cpPV2: exactCpForWp(53), // diff = 15.0 exact, wpPV2 = 53 (>= 48 & < 55)
        })
      ).badge
    ).toBe("Great");
    expect(
      classifyMove(
        baseInput({
          isBestMove: true,
          cpBest: exactCpForWp(67.9),
          cpPlayed: exactCpForWp(67.9),
          cpPV2: exactCpForWp(53), // diff = 14.9 < 15, wpPV2 >= 48
        })
      ).badge
    ).toBe("Best");
    expect(
      classifyMove(
        baseInput({
          isBestMove: true,
          cpBest: exactCpForWp(61),
          cpPlayed: exactCpForWp(61),
          cpPV2: exactCpForWp(48), // wpPV2 === 48.0, diff = 13 < 15 -> Best
        })
      ).badge
    ).toBe("Best");
    expect(
      classifyMove(
        baseInput({
          isBestMove: true,
          cpBest: exactCpForWp(61),
          cpPlayed: exactCpForWp(61),
          cpPV2: exactCpForWp(47.99), // wpPV2 < 48 -> Great
        })
      ).badge
    ).toBe("Great");

    // --- Miss & severe blunder boundaries ---
    const missAtBoundary = classifyMove(
      baseInput({
        prevMoveOpponentDeltaWP: 18.0,
        cpBest: exactCpForWp(55),
        cpPlayed: exactCpForWp(40), // deltaWP = 15.0 exact, wpBest = 55.0 exact
      })
    );
    expect(missAtBoundary.badge).toBe("Miss");
    expect(missAtBoundary.isKeyMoment).toBe(true);
    expect(missAtBoundary.isBlunder).toBe(true);

    expect(
      classifyMove(
        baseInput({
          prevMoveOpponentDeltaWP: undefined,
          cpBest: exactCpForWp(80),
          cpPlayed: exactCpForWp(60),
        })
      ).badge
    ).toBe("Mistake");
    expect(
      classifyMove(
        baseInput({
          prevMoveOpponentDeltaWP: 17.99,
          cpBest: exactCpForWp(80),
          cpPlayed: exactCpForWp(60),
        })
      ).badge
    ).toBe("Mistake");
    expect(
      classifyMove(
        baseInput({
          prevMoveOpponentDeltaWP: 20.0,
          cpBest: exactCpForWp(80),
          cpPlayed: exactCpForWp(65.01), // deltaWP = 14.99 < 15.0 (falls through to Mistake, not Miss)
        })
      ).badge
    ).toBe("Mistake");
    expect(
      classifyMove(
        baseInput({
          prevMoveOpponentDeltaWP: 20.0,
          cpBest: exactCpForWp(54.99),
          cpPlayed: exactCpForWp(34.99),
        })
      ).badge
    ).toBe("Mistake");

    // Severe blunder vs Miss: deltaWP === 55.0 & wpPlayed === 30.0 stays Miss
    expect(
      classifyMove(
        baseInput({
          prevMoveOpponentDeltaWP: 25.0,
          cpBest: exactCpForWp(85),
          cpPlayed: exactCpForWp(30),
        })
      ).badge
    ).toBe("Miss");
    // deltaWP > 55.0 overrides Miss to Blunder even when wpPlayed === 30.0
    expect(
      classifyMove(
        baseInput({
          prevMoveOpponentDeltaWP: 25.0,
          cpBest: exactCpForWp(85.1),
          cpPlayed: exactCpForWp(30),
        })
      ).badge
    ).toBe("Blunder");
    // wpPlayed < 30.0 overrides Miss to Blunder even when deltaWP <= 55.0
    expect(
      classifyMove(
        baseInput({
          prevMoveOpponentDeltaWP: 25.0,
          cpBest: exactCpForWp(60),
          cpPlayed: exactCpForWp(29.99),
        })
      ).badge
    ).toBe("Blunder");
  });

  it("enforces exact deltaWP thresholds, CAPS2 accuracy, and keyMoment/isBlunder flags across remaining badges", () => {
    const nearBest = classifyMove(
      baseInput({
        isBestMove: false,
        cpBest: exactCpForWp(50),
        cpPlayed: exactCpForWp(49.85), // deltaWP = 0.15 <= 0.2
      })
    );
    expect(nearBest.badge).toBe("Best");
    expect(nearBest.isKeyMoment).toBe(false);
    expect(nearBest.isBlunder).toBe(false);

    const excellentAt2 = classifyMove(
      baseInput({
        isBestMove: false,
        cpBest: exactCpForWp(75),
        cpPlayed: exactCpForWp(73), // deltaWP === 2.0
      })
    );
    expect(excellentAt2.badge).toBe("Excellent");
    expect(excellentAt2.isKeyMoment).toBe(false);
    expect(excellentAt2.isBlunder).toBe(false);
    expect(excellentAt2.accuracy).toBe(91.4);

    const goodAt21 = classifyMove(
      baseInput({
        isBestMove: false,
        cpBest: exactCpForWp(75),
        cpPlayed: exactCpForWp(72.9),
      })
    );
    expect(goodAt21.badge).toBe("Good");
    expect(goodAt21.isKeyMoment).toBe(false);

    const goodAt5 = classifyMove(
      baseInput({
        isBestMove: false,
        cpBest: exactCpForWp(50),
        cpPlayed: exactCpForWp(45), // deltaWP === 5.0
      })
    );
    expect(goodAt5.badge).toBe("Good");
    expect(goodAt5.isKeyMoment).toBe(false);

    const inaccuracyAt12 = classifyMove(
      baseInput({
        isBestMove: false,
        cpBest: exactCpForWp(50),
        cpPlayed: exactCpForWp(38), // deltaWP === 12.0
      })
    );
    expect(inaccuracyAt12.badge).toBe("Inaccuracy");
    expect(inaccuracyAt12.isKeyMoment).toBe(false);
    expect(inaccuracyAt12.isBlunder).toBe(false);
    expect(inaccuracyAt12.accuracy).toBe(58.0);

    const mistakeAt25 = classifyMove(
      baseInput({
        isBestMove: false,
        cpBest: exactCpForWp(75),
        cpPlayed: exactCpForWp(50), // deltaWP === 25.0
      })
    );
    expect(mistakeAt25.badge).toBe("Mistake");
    expect(mistakeAt25.isKeyMoment).toBe(true);
    expect(mistakeAt25.isBlunder).toBe(false);
    expect(mistakeAt25.accuracy).toBe(31.6);

    const blunderAt251 = classifyMove(
      baseInput({
        isBestMove: false,
        cpBest: exactCpForWp(75.1),
        cpPlayed: exactCpForWp(50), // deltaWP === 25.1 > 25.0
      })
    );
    expect(blunderAt251.badge).toBe("Blunder");
    expect(blunderAt251.isKeyMoment).toBe(true);
    expect(blunderAt251.isBlunder).toBe(true);
  });
});
