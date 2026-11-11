import { describe, it, expect } from "vitest";
import { classifyMove, BADGE_METADATA, MoveClassificationInput } from "@/lib/analysis/move-classifier";

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
});
