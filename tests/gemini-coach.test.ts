import { describe, it, expect } from "vitest";
import { GeminiCoachService, validateExplanationGrounding } from "@/lib/ai/gemini-coach";
import type { MoveBadge } from "@/lib/analysis/move-classifier";
import type { TacticalContext } from "@/lib/analysis/tactical-tagger";

function makeContext(overrides: Partial<TacticalContext> = {}): TacticalContext {
  return {
    tags: [],
    isCheck: false,
    isCastle: false,
    gamePhase: "Middlegame",
    ...overrides,
  };
}

describe("gemini-coach & explainability grounding", () => {
  const coach = new GeminiCoachService(""); // Force deterministic offline path

  it("generates grounded hanging-piece blunder explanation naming exact piece & square", async () => {
    const res = await coach.explainMove({
      moveSan: "Qe7",
      playedBy: "Black",
      moveNumber: 14,
      badge: "Blunder",
      evalBefore: "+0.4",
      evalAfter: "+3.8",
      deltaWP: 34.2,
      engineBestMove: "Nd7",
      bestMovePV: ["Nd7", "d4", "exd4"],
      refutationPV: ["Bxd7", "Qxd7", "Nxe5"],
      tacticalContext: makeContext({
        tags: ["HANGING_PIECE"],
        hangingPieceDetails: { square: "d7", piece: "Knight", value: 3 },
      }),
    });

    expect(res.badge).toBe("Blunder");
    expect(res.shortComment).toContain("Knight");
    expect(res.shortComment).toContain("d7");
    expect(res.bestMoveReasoning).toContain("Nd7");
    expect(res.detailedExplanation).toContain("d7");
  });

  it("generates distinct pedagogical commentary for all 11 official badges", async () => {
    const badges: MoveBadge[] = [
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
    ];

    for (const badge of badges) {
      const res = await coach.explainMove({
        moveSan: "Nf3",
        playedBy: "White",
        moveNumber: 12,
        badge,
        openingName: "Italian Game",
        evalBefore: "+0.2",
        evalAfter: badge === "Blunder" ? "-3.0" : "+0.3",
        deltaWP: badge === "Blunder" ? 35 : badge === "Mistake" ? 18 : 1,
        engineBestMove: "d4",
        bestMovePV: ["d4", "exd4", "Nxd4"],
        tacticalContext: makeContext({
          tags: badge === "Good" ? ["DEVELOPMENT"] : [],
        }),
      });

      expect(res.badge).toBe(badge);
      expect(res.shortComment.length).toBeGreaterThan(5);
      expect(res.detailedExplanation.length).toBeGreaterThan(10);
    }
  });

  it("explains tactical forks, pins, skewers, and checkmate threats accurately", async () => {
    const forkRes = await coach.explainMove({
      moveSan: "Nc7+",
      playedBy: "White",
      moveNumber: 18,
      badge: "Best",
      evalBefore: "+1.2",
      evalAfter: "+4.5",
      deltaWP: 0,
      engineBestMove: "Nc7+",
      bestMovePV: ["Nc7+", "Kd8", "Nxa8"],
      tacticalContext: makeContext({
        tags: ["TACTICAL_FORK"],
        isCheck: true,
        forkTargets: [
          { square: "e8", piece: "King" },
          { square: "a8", piece: "Rook" },
        ],
      }),
    });

    expect(forkRes.detailedExplanation).toContain("King on e8");
    expect(forkRes.detailedExplanation).toContain("Rook on a8");
  });

  it("generates a complete Game Storyline overview with phase accuracies and empathetic tone", async () => {
    const storyline = await coach.generateGameStoryline({
      whiteName: "Kasparov, Garry",
      blackName: "Topalov, Veselin",
      result: "1-0",
      openingName: "Pirc Defense: 150 Attack",
      whiteAccuracy: 94.2,
      blackAccuracy: 79.5,
      whiteElo: 2720,
      blackElo: 2380,
      phaseAccuracies: {
        opening: { white: 98.0, black: 95.0 },
        middlegame: { white: 92.5, black: 74.1 },
        endgame: { white: 93.0, black: 78.4 },
      },
      keyMomentCount: 4,
      turningPointMove: "24. Rxd4",
    });

    expect(storyline.headline.length).toBeGreaterThan(10);
    expect(storyline.summary).toContain("Pirc Defense");
    expect(storyline.whiteTakeaway.length).toBeGreaterThan(10);
    expect(storyline.blackTakeaway.length).toBeGreaterThan(10);
  });

  it("validates explanation grounding to reject hallucinated square references when ungrounded", () => {
    const check1 = validateExplanationGrounding(
      "You left your Rook on a8 hanging!",
      "r3k3/8/8/8/8/8/8/4K3 w - - 0 1"
    );
    expect(check1.valid).toBe(true);

    // Hallucinates a Queen on h5 when h5 is empty
    const check2 = validateExplanationGrounding(
      "Your Queen on h5 is trapped.",
      "4k3/8/8/8/8/8/8/4K3 w - - 0 1"
    );
    expect(check2.valid).toBe(false);
    expect(check2.hallucinations.length).toBeGreaterThan(0);
  });
});
