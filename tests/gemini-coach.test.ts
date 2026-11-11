import { describe, it, expect, vi, beforeEach } from "vitest";
import { GeminiCoachService, validateExplanationGrounding } from "@/lib/ai/gemini-coach";
import { COACH_PERSONAS, getCoachPersona } from "@/lib/ai/coach-personas";
import type { MoveBadge } from "@/lib/analysis/move-classifier";
import type { TacticalContext } from "@/lib/analysis/tactical-tagger";

const mockGenerateContent = vi.fn();

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: mockGenerateContent,
    };
  },
  Type: { OBJECT: "OBJECT", STRING: "STRING" },
}));

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

  it("M3: checks grounding against both fenBefore and fenAfter across bestMoveReasoning/coachingTip and handles result '*' storyline", async () => {
    // White Bishop moves c4 -> f7+, leaving c4 empty in fenAfter while present in fenBefore
    const fenBefore = "4k3/8/8/8/2B5/8/8/4K3 w - - 0 20";
    const fenAfter = "4kB2/8/8/8/8/8/8/4K3 b - - 1 20";

    mockGenerateContent.mockReset();
    const onlineCoach = new GeminiCoachService("fake-test-key");

    // Hallucinated Rook on a8 inside bestMoveReasoning should be caught and trigger offline fallback
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        badge: "Mistake",
        shortComment: "Check from f7.",
        detailedExplanation: "The Bishop moved from c4.",
        bestMoveReasoning: "Moving the Rook on a8 was stronger.",
      }),
    });

    const rejected = await onlineCoach.explainMove({
      moveSan: "Bf7+",
      playedBy: "White",
      moveNumber: 20,
      badge: "Mistake",
      evalBefore: "+0.5",
      evalAfter: "-0.5",
      deltaWP: 15,
      engineBestMove: "Kd2",
      bestMovePV: ["Kd2"],
      tacticalContext: makeContext(),
      fenBefore,
      fenAfter,
    });
    expect(rejected.bestMoveReasoning).not.toContain("Rook on a8");

    // Wrong piece type on occupied square (a8 has Rook, not Bishop) fails grounding
    expect(validateExplanationGrounding("Bishop on a8 is pinned", "r3k3/8/8/8/8/8/8/4K3 w - - 0 1").valid).toBe(false);

    // Hallucination inside coachingTip also rejected
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        badge: "Mistake",
        shortComment: "Check from f7.",
        detailedExplanation: "The Bishop moved from c4.",
        coachingTip: "Watch your Queen on h5!",
      }),
    });
    const rejectedTip = await onlineCoach.explainMove({
      moveSan: "Bf7+",
      playedBy: "White",
      moveNumber: 20,
      badge: "Mistake",
      evalBefore: "+0.5",
      evalAfter: "-0.5",
      deltaWP: 15,
      engineBestMove: "Kd2",
      bestMovePV: ["Kd2"],
      tacticalContext: makeContext(),
      fenBefore,
      fenAfter,
    });
    expect(rejectedTip.coachingTip ?? "").not.toContain("Queen on h5");

    // Whitespace API key stays strictly offline without hitting SDK
    mockGenerateContent.mockReset();
    const blankKeyCoach = new GeminiCoachService("   ");
    await blankKeyCoach.explainMove({
      moveSan: "e4",
      playedBy: "White",
      moveNumber: 1,
      badge: "Book",
      evalBefore: "+0.2",
      evalAfter: "+0.2",
      deltaWP: 0,
      engineBestMove: "e4",
      bestMovePV: ["e4"],
      tacticalContext: makeContext(),
    });
    await blankKeyCoach.generateGameStoryline({
      whiteName: "W",
      blackName: "B",
      result: "1-0",
      whiteAccuracy: 90,
      blackAccuracy: 80,
      whiteElo: 2000,
      blackElo: 1800,
      phaseAccuracies: {
        opening: { white: 90, black: 85 },
        middlegame: { white: 90, black: 80 },
        endgame: { white: 90, black: 75 },
      },
      keyMomentCount: 1,
    });
    expect(mockGenerateContent).not.toHaveBeenCalled();

    // Result "*" unfinished game should NOT claim "Neither side takes the victory"
    const openStory = await coach.generateGameStoryline({
      whiteName: "Alice",
      blackName: "Bob",
      result: "*",
      openingName: "Sicilian Defense",
      whiteAccuracy: 86.2,
      blackAccuracy: 84.5,
      whiteElo: 1950,
      blackElo: 1900,
      phaseAccuracies: {
        opening: { white: 92, black: 90 },
        middlegame: { white: 84, black: 81 },
        endgame: { white: 88, black: 86 },
      },
      keyMomentCount: 2,
    });
    expect(openStory.headline.toLowerCase()).not.toContain("neither side takes the victory");
    expect(openStory.summary).toContain("86.2%");
    expect(openStory.summary).toContain("84.5%");
  });

  it("covers all badges, tactical descriptions, persona lookup, online happy paths, and error fallbacks", async () => {
    expect(getCoachPersona("danny").name).toBe(COACH_PERSONAS.danny.name);
    expect(getCoachPersona("sage").id).toBe("sage");
    expect(getCoachPersona("drillmaster").id).toBe("drillmaster");
    expect(getCoachPersona("unknown").id).toBe("danny");

    const tacticalTagsRes = await coach.explainMove({
      moveSan: "Bb5",
      playedBy: "White",
      moveNumber: 6,
      badge: "Best",
      evalBefore: "+0.2",
      evalAfter: "+2.0",
      deltaWP: 0,
      engineBestMove: "Bb5",
      bestMovePV: ["Bb5"],
      tacticalContext: makeContext({
        tags: ["ABSOLUTE_PIN", "SKEWER", "DISCOVERED_ATTACK", "CHECKMATE_THREAT"],
        pinnedPieceDetails: { square: "c6", piece: "Knight", pinnedTo: "King" },
        skeweredPieceDetails: {
          frontPiece: "Rook",
          frontSquare: "c8",
          backPiece: "Queen",
          backSquare: "d8",
        },
        discoveredTarget: { square: "h7", piece: "Queen" },
      }),
    });
    expect(tacticalTagsRes.detailedExplanation).toContain("pins the Knight on c6 to the King");
    expect(tacticalTagsRes.detailedExplanation).toContain("skewers the Rook on c8");
    expect(tacticalTagsRes.detailedExplanation).toContain("discovered attack on the Queen on h7");
    expect(tacticalTagsRes.detailedExplanation).toContain("checkmate threat");

    for (const badge of [
      "Book",
      "Great",
      "Excellent",
      "Good",
      "Inaccuracy",
      "Mistake",
      "Miss",
      "Blunder",
      "Forced",
    ] as const) {
      const res = await coach.explainMove({
        moveSan: "d4",
        playedBy: "White",
        moveNumber: 1,
        badge,
        evalBefore: "+0.2",
        evalAfter: "+0.2",
        deltaWP: badge === "Blunder" ? 30 : 2,
        engineBestMove: "e4",
        bestMovePV: ["e4"],
        openingName: "Queen's Pawn",
        tacticalContext: makeContext({ tags: ["CENTER_CONTROL"] }),
      });
      expect(res.badge).toBe(badge);
      expect(res.shortComment.length).toBeGreaterThan(5);
    }

    // Castle & Development paths
    const castle = await coach.explainMove({
      moveSan: "O-O",
      playedBy: "White",
      moveNumber: 5,
      badge: "Good",
      evalBefore: "+0.2",
      evalAfter: "+0.2",
      deltaWP: 2,
      engineBestMove: "d4",
      bestMovePV: ["d4"],
      tacticalContext: makeContext({ tags: ["KING_SAFETY_CASTLE"] }),
    });
    expect(castle.shortComment.toLowerCase()).toContain("castling");

    const dev = await coach.explainMove({
      moveSan: "Nf3",
      playedBy: "White",
      moveNumber: 2,
      badge: "Excellent",
      evalBefore: "+0.2",
      evalAfter: "+0.2",
      deltaWP: 1,
      engineBestMove: "Nc3",
      bestMovePV: ["Nc3"],
      tacticalContext: makeContext({ tags: ["DEVELOPMENT"] }),
    });
    expect(dev.shortComment.toLowerCase()).toContain("developing");

    // Online happy paths & API error fallback
    mockGenerateContent.mockReset();
    const onlineCoach = new GeminiCoachService("fake-test-key");
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        badge: "Great",
        shortComment: "Found Bf7+ right on time.",
        detailedExplanation: "This checks the King from f7.",
        bestMoveReasoning: "No other move maintains pressure.",
        coachingTip: "Look for forcing checks first.",
      }),
    });
    const onlineMove = await onlineCoach.explainMove({
      moveSan: "Bf7+",
      playedBy: "White",
      moveNumber: 20,
      badge: "Great",
      evalBefore: "+0.5",
      evalAfter: "+2.5",
      deltaWP: 0,
      engineBestMove: "Bf7+",
      bestMovePV: ["Bf7+"],
      tacticalContext: makeContext(),
      fenAfter: "4kB2/8/8/8/8/8/8/4K3 b - - 1 20",
    });
    expect(onlineMove.shortComment).toBe("Found Bf7+ right on time.");

    // M3: Brilliant move with hangingPieceDetails labels SACRIFICED PIECE (not HUNG PIECE) in prompt
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        badge: "Brilliant",
        shortComment: "Sound Rook sacrifice!",
        detailedExplanation: "The sacrifice on d4 blows open the king.",
      }),
    });
    await onlineCoach.explainMove({
      moveSan: "Rxd4",
      playedBy: "White",
      moveNumber: 24,
      badge: "Brilliant",
      evalBefore: "0.0",
      evalAfter: "+1.2",
      deltaWP: 0,
      engineBestMove: "Rxd4",
      bestMovePV: ["Rxd4"],
      tacticalContext: makeContext({
        tags: ["HANGING_PIECE"],
        hangingPieceDetails: { square: "d4", piece: "Rook", value: 5 },
      }),
      fenAfter: "4k3/8/8/8/3R4/8/8/4K3 b - - 0 24",
    });
    const lastPromptText =
      mockGenerateContent.mock.calls.at(-1)?.[0]?.contents?.[0]?.parts?.[0]?.text ?? "";
    expect(lastPromptText).toContain("SACRIFICED PIECE");
    expect(lastPromptText).not.toContain("HUNG PIECE");

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        headline: "Decisive Black win",
        summary: "Accurate counterattack throughout.",
        whiteTakeaway: "Watch king safety.",
        blackTakeaway: "Strong initiative.",
      }),
    });
    const onlineStory = await onlineCoach.generateGameStoryline({
      whiteName: "W",
      blackName: "B",
      result: "0-1",
      whiteAccuracy: 70,
      blackAccuracy: 92,
      whiteElo: 1500,
      blackElo: 2100,
      phaseAccuracies: {
        opening: { white: 80, black: 95 },
        middlegame: { white: 65, black: 91 },
        endgame: { white: 70, black: 90 },
      },
      keyMomentCount: 2,
    });
    expect(onlineStory.headline).toBe("Decisive Black win");

    // Draw & Black win offline fallbacks + online throw fallback
    mockGenerateContent.mockRejectedValueOnce(new Error("API Down"));
    const fallbackStory = await onlineCoach.generateGameStoryline({
      whiteName: "W",
      blackName: "B",
      result: "1/2-1/2",
      whiteAccuracy: 88,
      blackAccuracy: 88,
      whiteElo: 2000,
      blackElo: 2000,
      phaseAccuracies: {
        opening: { white: 90, black: 90 },
        middlegame: { white: 87, black: 87 },
        endgame: { white: 88, black: 88 },
      },
      keyMomentCount: 1,
    });
    expect(fallbackStory.headline.toLowerCase()).toContain("draw");

    // Invalid FEN returns empty hallucinations gracefully
    expect(validateExplanationGrounding("Rook on a1", "invalid-fen")).toEqual({
      valid: true,
      hallucinations: [],
    });
  });

  it("coaches strictly from single-player perspective (coachFor), differentiates offline personas, cites refutationPV, and formats empty phases cleanly", async () => {
    // 1) Coaching White when Black blunders: speak to White about opponent mistake + White's reply
    const oppBlunder = await coach.explainMove({
      moveSan: "g5",
      playedBy: "Black",
      coachFor: "White",
      playerName: "olusheki",
      opponentName: "trocaderooo",
      moveNumber: 12,
      badge: "Blunder",
      evalBefore: "+0.2",
      evalAfter: "+4.1",
      deltaWP: 41.0,
      engineBestMove: "Nf6",
      bestMovePV: ["Nf6", "d4"],
      refutationPV: ["Nxg5", "Nh6", "Qh5"],
      tacticalContext: makeContext({
        tags: ["CHECKMATE_THREAT"],
      }),
    });
    expect(oppBlunder.coachMode).toBe("offline");
    expect(oppBlunder.shortComment.toLowerCase()).toMatch(/trocaderooo|opponent/);
    expect(oppBlunder.shortComment.toLowerCase()).not.toContain("you left");
    expect(oppBlunder.detailedExplanation).toContain("Nxg5");

    // 2) Coaching White when Black makes a strong Best move: describe opponent move in 3rd person & player threat/reply
    const oppBest = await coach.explainMove({
      moveSan: "Nc6",
      playedBy: "Black",
      coachFor: "White",
      opponentName: "trocaderooo",
      moveNumber: 4,
      badge: "Best",
      evalBefore: "+0.2",
      evalAfter: "+0.2",
      deltaWP: 0,
      engineBestMove: "Nc6",
      bestMovePV: ["Nc6", "Bb5"],
      refutationPV: ["Bb5", "a6"],
      tacticalContext: makeContext({ tags: ["DEVELOPMENT"] }),
    });
    expect(oppBest.shortComment.toLowerCase()).toMatch(/trocaderooo|opponent/);
    expect(oppBest.detailedExplanation).toContain("Bb5");

    // 3) Offline personas (danny vs sage vs drillmaster) produce distinct commentary
    const baseBlunder = {
      moveSan: "Qh5",
      playedBy: "White" as const,
      coachFor: "White" as const,
      moveNumber: 8,
      badge: "Blunder" as const,
      evalBefore: "+0.4",
      evalAfter: "-3.1",
      deltaWP: 38.0,
      engineBestMove: "Nf3",
      bestMovePV: ["Nf3", "d6"],
      refutationPV: ["g6", "Qe2"],
      tacticalContext: makeContext(),
    };
    const dannyOut = await coach.explainMove({ ...baseBlunder, personaId: "danny" });
    const sageOut = await coach.explainMove({ ...baseBlunder, personaId: "sage" });
    const blazeOut = await coach.explainMove({ ...baseBlunder, personaId: "drillmaster" });
    expect(new Set([dannyOut.detailedExplanation, sageOut.detailedExplanation, blazeOut.detailedExplanation]).size).toBe(3);
    expect(dannyOut.detailedExplanation).toContain("g6");

    // 4) Storyline formats empty endgame moves as N/A instead of 100%/100%
    const noEndgameStory = await coach.generateGameStoryline({
      whiteName: "olusheki",
      blackName: "pistapoc",
      result: "1-0",
      openingName: "Queen's Pawn",
      whiteAccuracy: 74.2,
      blackAccuracy: 51.0,
      whiteElo: 700,
      blackElo: 450,
      coachFor: "White",
      phaseAccuracies: {
        opening: { white: 82, black: 65 },
        middlegame: { white: 71, black: 44 },
        endgame: { white: 100, black: 100 },
      },
      phaseMoveCounts: {
        opening: { white: 6, black: 6 },
        middlegame: { white: 14, black: 14 },
        endgame: { white: 0, black: 0 },
      },
      keyMomentCount: 4,
    });
    expect(noEndgameStory.coachMode).toBe("offline");
    expect(noEndgameStory.summary).toContain("Endgame N/A");
    expect(noEndgameStory.summary).not.toContain("Endgame 100%/100%");
  });
});
