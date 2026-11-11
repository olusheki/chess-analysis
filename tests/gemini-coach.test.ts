import { describe, it, expect, vi, beforeEach } from "vitest";
import { Chess } from "chess.js";
import { GeminiCoachService, validateExplanationGrounding } from "@/lib/ai/gemini-coach";
import { describeTacticalFeatures, formatPhaseMetric } from "@/lib/ai/offline-coach";
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

    // Suppress positive CENTER_CONTROL / TACTICAL_FORK praise on Blunder & Miss, and add move numbers to PV sequences
    const blunderNoPraise = await coach.explainMove({
      moveSan: "Ne5",
      playedBy: "White",
      moveNumber: 6,
      badge: "Blunder",
      evalBefore: "+0.2",
      evalAfter: "-2.8",
      deltaWP: 42,
      engineBestMove: "O-O",
      bestMovePV: ["O-O", "O-O", "Bg5"],
      refutationPV: ["dxe5", "Bb5", "Nd7"],
      tacticalContext: makeContext({
        tags: ["CENTER_CONTROL", "TACTICAL_FORK"],
        forkTargets: [
          { square: "c6", piece: "Knight" },
          { square: "f7", piece: "Bishop" },
        ],
      }),
    });
    expect(blunderNoPraise.detailedExplanation).not.toContain("contests key central squares");
    expect(blunderNoPraise.detailedExplanation).not.toContain("creates a fork");
    expect(blunderNoPraise.detailedExplanation).toContain("6...dxe5 7. Bb5");
    expect(blunderNoPraise.bestMoveReasoning).toContain("6. O-O O-O 7. Bg5");

    // Null / invalid runtime moveNumber never leaks "null." into line formatting
    const nullMoveNumRes = await coach.explainMove({
      moveSan: "Ne5",
      playedBy: "White",
      moveNumber: null as unknown as number,
      badge: "Blunder",
      evalBefore: "+0.2",
      evalAfter: "-2.8",
      deltaWP: 42,
      engineBestMove: "O-O",
      bestMovePV: ["O-O", "O-O"],
      refutationPV: ["dxe5", "Bb5"],
      tacticalContext: makeContext({ tags: [] }),
    });
    expect(nullMoveNumRes.detailedExplanation).not.toContain("null.");
    expect(nullMoveNumRes.bestMoveReasoning).not.toContain("null.");

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

  it("genuinely differentiates Danny, Sage, and Blaze across headlines, bestMoveReasoning, coachingTip, opponent slips, and storylines while surfacing comparative coachInsights", async () => {
    const baseMistake = {
      moveSan: "a3",
      playedBy: "White" as const,
      coachFor: "White" as const,
      moveNumber: 4,
      badge: "Mistake" as const,
      evalBefore: "+0.4",
      evalAfter: "-0.8",
      deltaWP: 14.5,
      engineBestMove: "Bb5",
      bestMovePV: ["Bb5", "a6", "Bxc6"],
      refutationPV: ["Bg4", "Be2"],
      tacticalContext: makeContext(),
      coachInsights: {
        playedSan: "a3",
        bestMoveSan: "Bb5",
        whyBetterFacts: [
          "Bb5 pins the Knight on c6 to the King.",
          "Developing with Bb5 improves piece activity instead of spending a tempo on a flank pawn push (a3).",
        ],
        strategicTradeoffs: [
          "Developing with Bb5 improves piece activity instead of spending a tempo on a flank pawn push (a3).",
        ],
        missedOpportunities: [
          "Bb5 pins the Knight on c6 to the King.",
        ],
        bestPvIntentions: {
          lineSan: ["Bb5", "a6", "Bxc6"],
          checksDelivered: 0,
          capturedTargets: [{ san: "Bxc6", piece: "Knight", square: "c6", byColor: "w" as const }],
          castled: false,
          promoted: false,
          terminalCheckmate: false,
          summaryFacts: ["Line targets material with Bxc6, winning the Knight on c6."],
        },
      },
    };

    const danny = await coach.explainMove({ ...baseMistake, personaId: "danny" });
    const sage = await coach.explainMove({ ...baseMistake, personaId: "sage" });
    const blaze = await coach.explainMove({ ...baseMistake, personaId: "drillmaster" });

    // Headlines, detailed explanations, bestMoveReasoning, and coachingTip are all genuinely distinct per persona
    expect(new Set([danny.shortComment, sage.shortComment, blaze.shortComment]).size).toBe(3);
    expect(new Set([danny.detailedExplanation, sage.detailedExplanation, blaze.detailedExplanation]).size).toBe(3);
    expect(new Set([danny.bestMoveReasoning, sage.bestMoveReasoning, blaze.bestMoveReasoning]).size).toBe(3);
    expect(new Set([danny.coachingTip, sage.coachingTip, blaze.coachingTip]).size).toBe(3);

    // Comparative chess "why" and PV future target intentions are explained clearly
    expect(danny.detailedExplanation).toContain("pins the Knight on c6");
    expect(danny.bestMoveReasoning).toContain("Knight on c6");
    expect(sage.coachingTip?.toLowerCase()).toContain("pin");

    // Opponent slips also reflect distinct coach personalities
    const oppSlip = {
      ...baseMistake,
      playedBy: "Black" as const,
      coachFor: "White" as const,
      opponentName: "trocaderooo",
      badge: "Blunder" as const,
    };
    const oppDanny = await coach.explainMove({ ...oppSlip, personaId: "danny" });
    const oppSage = await coach.explainMove({ ...oppSlip, personaId: "sage" });
    const oppBlaze = await coach.explainMove({ ...oppSlip, personaId: "drillmaster" });
    expect(new Set([oppDanny.shortComment, oppSage.shortComment, oppBlaze.shortComment]).size).toBe(3);
    expect(new Set([oppDanny.detailedExplanation, oppSage.detailedExplanation, oppBlaze.detailedExplanation]).size).toBe(3);

    // Storylines differ across personas too
    const baseStory = {
      whiteName: "Alice",
      blackName: "Bob",
      result: "1-0",
      openingName: "Ruy Lopez",
      whiteAccuracy: 91.0,
      blackAccuracy: 74.0,
      whiteElo: 1800,
      blackElo: 1450,
      phaseAccuracies: {
        opening: { white: 95, black: 82 },
        middlegame: { white: 89, black: 70 },
        endgame: { white: 92, black: 75 },
      },
      keyMomentCount: 3,
    };
    const sDanny = await coach.generateGameStoryline({ ...baseStory, personaId: "danny" });
    const sSage = await coach.generateGameStoryline({ ...baseStory, personaId: "sage" });
    const sBlaze = await coach.generateGameStoryline({ ...baseStory, personaId: "drillmaster" });
    expect(new Set([sDanny.headline, sSage.headline, sBlaze.headline]).size).toBe(3);
    expect(new Set([sDanny.whiteTakeaway, sSage.whiteTakeaway, sBlaze.whiteTakeaway]).size).toBe(3);
  });

  it("enriches Gemini prompt with verified board inventory, comparative why-facts, and validates against bestMoveFenAfter", async () => {
    const chess = new Chess("r1bqkbnr/ppp2ppp/2np4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 4");
    const fenBefore = chess.fen();
    chess.move("a3");
    const fenAfter = chess.fen();

    const bestChess = new Chess(fenBefore);
    bestChess.move("Bb5");
    const bestMoveFenAfter = bestChess.fen();

    mockGenerateContent.mockReset();
    const onlineCoach = new GeminiCoachService("fake-test-key");
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        badge: "Mistake",
        shortComment: "Missed pinning the Knight.",
        detailedExplanation:
          "Playing Bb5 places the Bishop on b5 and pins the Knight on c6 against their King.",
        bestMoveReasoning: "Developing with Bb5 keeps active central pressure.",
        coachingTip: "Check pin diagonals before making a flank pawn move.",
      }),
    });

    const liveRes = await onlineCoach.explainMove({
      moveSan: "a3",
      playedBy: "White",
      coachFor: "White",
      moveNumber: 4,
      badge: "Mistake",
      evalBefore: "+0.4",
      evalAfter: "-0.3",
      deltaWP: 9.2,
      engineBestMove: "Bb5",
      bestMovePV: ["Bb5", "a6", "Ba4"],
      fenBefore,
      fenAfter,
      personaId: "sage",
      tacticalContext: makeContext(),
      coachInsights: {
        playedSan: "a3",
        bestMoveSan: "Bb5",
        bestMoveFenAfter,
        whyBetterFacts: ["Bb5 pins the Knight on c6 to the King on e8."],
        strategicTradeoffs: ["Developing with Bb5 improves piece activity instead of a flank pawn move (a3)."],
        missedOpportunities: ["Bb5 pins the Knight on c6 to the King on e8."],
        bestPvIntentions: {
          lineSan: ["Bb5", "a6", "Ba4"],
          checksDelivered: 0,
          capturedTargets: [],
          castled: false,
          promoted: false,
          terminalCheckmate: false,
          summaryFacts: ["Line applies lasting diagonal pressure against c6."],
        },
        boardPieceMapAfter: "White: K e1, B f1, P a3 | Black: K e8, N c6",
      },
    });

    // Grounding should ACCEPT "Bishop on b5" because bestMoveFenAfter is in referenceFens
    expect(liveRes.coachMode).toBe("live");
    expect(liveRes.detailedExplanation).toContain("Bishop on b5");

    // Verify prompt includes verified board map, comparative facts, and PV intentions
    const sentPrompt = mockGenerateContent.mock.calls[0]?.[0]?.contents?.[0]?.parts?.[0]?.text ?? "";
    expect(sentPrompt).toContain("Verified Board Pieces After Move:");
    expect(sentPrompt).toContain("Comparative Chess Reasons");
    expect(sentPrompt).toContain("Future Intentions Along Best Line:");
    expect(sentPrompt).toContain("Grandmaster Sage");
  });

  it("ensures distinct offline prose & no empty strings across all 11 badges, opponent branches, tips, and storyline outcomes for all 3 personas", async () => {
    const personas = ["danny", "sage", "drillmaster"] as const;
    const scenarioBadges: Array<{
      label: string;
      badge: MoveBadge;
      tags?: TacticalContext["tags"];
      hanging?: { square: "e5"; piece: "Rook"; value: 5 };
      expectAll3Unique?: boolean;
    }> = [
      { label: "hanging-blunder", badge: "Blunder", tags: ["HANGING_PIECE"], hanging: { square: "e5", piece: "Rook", value: 5 }, expectAll3Unique: true },
      { label: "positional-blunder", badge: "Blunder", expectAll3Unique: true },
      { label: "miss", badge: "Miss", expectAll3Unique: true },
      { label: "mistake", badge: "Mistake", expectAll3Unique: true },
      { label: "inaccuracy", badge: "Inaccuracy", expectAll3Unique: true },
      { label: "brilliant", badge: "Brilliant", expectAll3Unique: true },
      { label: "great", badge: "Great", expectAll3Unique: true },
      { label: "best", badge: "Best", expectAll3Unique: true },
      { label: "book", badge: "Book", expectAll3Unique: true },
      { label: "forced", badge: "Forced", expectAll3Unique: true },
      { label: "castle", badge: "Good", tags: ["KING_SAFETY_CASTLE"], expectAll3Unique: true },
      { label: "dev", badge: "Excellent", tags: ["DEVELOPMENT"], expectAll3Unique: true },
    ];

    for (const sc of scenarioBadges) {
      const results = await Promise.all(
        personas.map((personaId) =>
          coach.explainMove({
            personaId,
            moveSan: sc.badge === "Good" ? "O-O" : "Nf3",
            playedBy: "White",
            coachFor: "White",
            moveNumber: 8,
            badge: sc.badge,
            evalBefore: "+0.3",
            evalAfter: sc.badge === "Blunder" ? "-2.5" : "+0.4",
            deltaWP: sc.badge === "Blunder" ? 30 : 5,
            engineBestMove: "d4",
            bestMovePV: ["d4", "d5"],
            refutationPV: ["Bg4", "Be2"],
            tacticalContext: makeContext({
              tags: sc.tags ?? [],
              hangingPieceDetails: sc.hanging,
            }),
          })
        )
      );
      for (const res of results) {
        expect(res.coachMode).toBe("offline");
        expect(res.shortComment.trim().length).toBeGreaterThan(5);
        expect(res.shortComment).not.toContain("undefined");
        expect(res.detailedExplanation.trim().length).toBeGreaterThan(10);
        if (res.bestMoveReasoning) {
          expect(res.bestMoveReasoning).not.toContain("undefined");
        }
        if (res.coachingTip) {
          expect(res.coachingTip.trim().length).toBeGreaterThan(10);
        }
      }
      if (sc.expectAll3Unique) {
        expect(new Set(results.map((r) => r.shortComment)).size).toBe(3);
      }
      if (
        sc.badge === "Blunder" ||
        sc.badge === "Best" ||
        sc.badge === "Good" ||
        sc.badge === "Excellent"
      ) {
        expect(new Set(results.map((r) => r.detailedExplanation)).size).toBe(3);
      }
      if (sc.badge === "Blunder" || sc.badge === "Mistake") {
        expect(new Set(results.map((r) => r.coachingTip)).size).toBe(3);
        expect(new Set(results.map((r) => r.bestMoveReasoning)).size).toBe(3);
      }
    }

    // Same-san Good move does not produce redundant bestMoveReasoning
    const sameGood = await coach.explainMove({
      personaId: "danny",
      moveSan: "d4",
      playedBy: "White",
      coachFor: "White",
      moveNumber: 12,
      badge: "Good",
      evalBefore: "+0.2",
      evalAfter: "+0.2",
      deltaWP: 0.5,
      engineBestMove: "d4",
      bestMovePV: ["d4", "d5"],
      tacticalContext: makeContext(),
    });
    expect(sameGood.coachMode).toBe("offline");
    expect(sameGood.bestMoveReasoning).toBeUndefined();

    // Verify authentic persona signature voice closings & tips appear for all 3 coaches
    const [dErr, sErr, bErr] = await Promise.all(
      personas.map((personaId) =>
        coach.explainMove({
          personaId,
          moveSan: "Qh5",
          playedBy: "White",
          coachFor: "White",
          moveNumber: 9,
          badge: "Blunder",
          evalBefore: "+0.4",
          evalAfter: "-3.0",
          deltaWP: 38,
          engineBestMove: "Nf3",
          bestMovePV: ["Nf3"],
          tacticalContext: makeContext(),
        })
      )
    );
    expect(dErr.detailedExplanation).toContain("tactical clue");
    expect(sErr.detailedExplanation).toContain("long-term harmony");
    expect(bErr.detailedExplanation).toContain("calculation discipline");
    expect(dErr.coachingTip).toContain("blunder check");
    expect(sErr.coachingTip).toContain("constructive post");
    expect(bErr.coachingTip).toContain("Checklist every single ply");

    const [dBest, sBest, bBest] = await Promise.all(
      personas.map((personaId) =>
        coach.explainMove({
          personaId,
          moveSan: "Nf3",
          playedBy: "White",
          coachFor: "White",
          moveNumber: 3,
          badge: "Best",
          evalBefore: "+0.2",
          evalAfter: "+0.4",
          deltaWP: 0,
          engineBestMove: "Nf3",
          bestMovePV: ["Nf3"],
          tacticalContext: makeContext(),
        })
      )
    );
    expect(dBest.detailedExplanation).toContain("army active");
    expect(sBest.detailedExplanation).toContain("classical coordination");
    expect(bBest.detailedExplanation).toContain("Clinical precision");

    const [dOppSlip, sOppSlip, bOppSlip] = await Promise.all(
      personas.map((personaId) =>
        coach.explainMove({
          personaId,
          moveSan: "g5",
          playedBy: "Black",
          coachFor: "White",
          opponentName: "Rival",
          moveNumber: 6,
          badge: "Blunder",
          evalBefore: "+0.2",
          evalAfter: "+3.5",
          deltaWP: 35,
          engineBestMove: "Nf6",
          bestMovePV: ["Nf6"],
          tacticalContext: makeContext(),
        })
      )
    );
    expect(dOppSlip.coachingTip).toContain("stumbles");
    expect(sOppSlip.coachingTip).toContain("structural weaknesses");
    expect(bOppSlip.coachingTip).toContain("Lock on immediately");

    // Opponent branches across Book, Forced, Blunder, Miss, Mistake, Inaccuracy, Best, Good
    for (const badge of [
      "Book",
      "Forced",
      "Blunder",
      "Miss",
      "Mistake",
      "Inaccuracy",
      "Best",
      "Good",
    ] as const) {
      const oppResults = await Promise.all(
        personas.map((personaId) =>
          coach.explainMove({
            personaId,
            moveSan: "Nc6",
            playedBy: "Black",
            coachFor: "White",
            opponentName: "Rival",
            openingName: "Italian Game",
            moveNumber: 5,
            badge,
            evalBefore: "+0.2",
            evalAfter: "+0.8",
            deltaWP: 12,
            engineBestMove: "d5",
            bestMovePV: ["d5"],
            refutationPV: ["Bb5"],
            tacticalContext: makeContext(),
          })
        )
      );
      for (const r of oppResults) {
        expect(r.coachMode).toBe("offline");
        expect(r.shortComment.trim().length).toBeGreaterThan(5);
        expect(r.detailedExplanation).not.toContain("undefined");
      }
      if (badge === "Blunder" || badge === "Miss") {
        expect(new Set(oppResults.map((r) => r.coachingTip)).size).toBe(3);
        expect(new Set(oppResults.map((r) => r.bestMoveReasoning)).size).toBe(3);
      }
      if (badge === "Book") {
        expect(oppResults[0].detailedExplanation).toContain("Italian Game");
      }
      if (badge === "Forced") {
        expect(oppResults[0].shortComment.toLowerCase()).toContain("only legal move");
      }
      if (badge === "Mistake" || badge === "Best" || badge === "Blunder") {
        expect(new Set(oppResults.map((r) => r.shortComment)).size).toBe(3);
      }
    }

    // Tailored tip branches (fork, develop, pawn structure)
    for (const topic of [
      "Nc7 forks the King and Rook",
      "Develop minor pieces rather than O-O",
      "Pawn structure shows isolated pawns",
    ]) {
      const tipResults = await Promise.all(
        personas.map((personaId) =>
          coach.explainMove({
            personaId,
            moveSan: "a3",
            playedBy: "White",
            coachFor: "White",
            moveNumber: 6,
            badge: "Mistake",
            evalBefore: "+0.4",
            evalAfter: "-0.7",
            deltaWP: 14,
            engineBestMove: "Nc3",
            bestMovePV: ["Nc3"],
            tacticalContext: makeContext(),
            coachInsights: {
              playedSan: "a3",
              bestMoveSan: "Nc3",
              whyBetterFacts: [topic],
              strategicTradeoffs: [topic],
              missedOpportunities: [topic],
            },
          })
        )
      );
      for (const r of tipResults) {
        expect(r.coachingTip?.trim().length).toBeGreaterThan(10);
      }
    }

    // Storylines across 1-0, 0-1, 1/2-1/2 and both low (<85) & high (>=85) accuracy buckets
    for (const outcome of [
      { result: "1-0", wAcc: 92, bAcc: 72 },
      { result: "0-1", wAcc: 74, bAcc: 91 },
      { result: "1/2-1/2", wAcc: 86, bAcc: 86 },
    ]) {
      const stories = await Promise.all(
        personas.map((personaId) =>
          coach.generateGameStoryline({
            personaId,
            whiteName: "W",
            blackName: "B",
            result: outcome.result,
            openingName: "Sicilian Defense",
            whiteAccuracy: outcome.wAcc,
            blackAccuracy: outcome.bAcc,
            whiteElo: 1800,
            blackElo: 1700,
            phaseAccuracies: {
              opening: { white: 90, black: 85 },
              middlegame: { white: outcome.wAcc, black: outcome.bAcc },
              endgame: { white: 88, black: 84 },
            },
            keyMomentCount: 3,
          })
        )
      );
      expect(new Set(stories.map((s) => s.headline)).size).toBe(3);
      expect(new Set(stories.map((s) => s.whiteTakeaway)).size).toBe(3);
      expect(new Set(stories.map((s) => s.blackTakeaway)).size).toBe(3);
    }

    // Exercise relative pins, PV-only fallback, no-refutation opponent copy, and Good punch-line diff
    expect(formatPhaseMetric(82, 0)).toBe("N/A");
    expect(formatPhaseMetric(82, 4)).toBe("82%");
    expect(
      describeTacticalFeatures(
        makeContext({
          tags: ["RELATIVE_PIN"],
          pinnedPieceDetails: { square: "f6", piece: "Knight", pinnedTo: "Queen" },
        })
      )
    ).toContain("pins the Knight on f6 against the Queen");

    const pvOnlyRes = await coach.explainMove({
      personaId: "sage",
      moveSan: "h3",
      playedBy: "White",
      coachFor: "White",
      moveNumber: 9,
      badge: "Good",
      evalBefore: "+0.2",
      evalAfter: "+0.1",
      deltaWP: 2,
      engineBestMove: "d4",
      bestMovePV: ["d4", "exd4"],
      tacticalContext: makeContext(),
      coachInsights: {
        playedSan: "h3",
        bestMoveSan: "d4",
        whyBetterFacts: [],
        strategicTradeoffs: [],
        missedOpportunities: [],
        bestPvIntentions: {
          lineSan: ["d4", "exd4"],
          checksDelivered: 0,
          capturedTargets: [],
          castled: false,
          promoted: false,
          terminalCheckmate: false,
          summaryFacts: ["Line breaks open the center with tempo."],
        },
      },
    });
    expect(pvOnlyRes.detailedExplanation).toContain("breaks open the center");
    expect(pvOnlyRes.bestMoveReasoning).toContain("d4");

    const oppNoRef = await coach.explainMove({
      personaId: "danny",
      moveSan: "e5",
      playedBy: "Black",
      coachFor: "White",
      opponentName: "Rival",
      moveNumber: 1,
      badge: "Book",
      evalBefore: "+0.2",
      evalAfter: "+0.2",
      deltaWP: 0,
      engineBestMove: "e5",
      bestMovePV: [],
      refutationPV: [],
      tacticalContext: makeContext(),
    });
    expect(oppNoRef.detailedExplanation).toContain("central development");

    const goodWithPunch = await coach.explainMove({
      personaId: "danny",
      moveSan: "h3",
      playedBy: "White",
      coachFor: "White",
      moveNumber: 12,
      badge: "Good",
      evalBefore: "+0.3",
      evalAfter: "+0.1",
      deltaWP: 2.5,
      engineBestMove: "d4",
      bestMovePV: ["d4"],
      tacticalContext: makeContext(),
    });
    expect(goodWithPunch.detailedExplanation).toContain("slightly more punch");
    expect(goodWithPunch.bestMoveReasoning).toContain("d4");

    const sameGoodVerified = await coach.explainMove({
      personaId: "danny",
      moveSan: "d4",
      playedBy: "White",
      coachFor: "White",
      moveNumber: 12,
      badge: "Good",
      evalBefore: "+0.2",
      evalAfter: "+0.2",
      deltaWP: 0.4,
      engineBestMove: "d4",
      bestMovePV: ["d4"],
      tacticalContext: makeContext(),
    });
    expect(sameGoodVerified.shortComment).toContain("d4 is a good choice.");
    expect(sameGoodVerified.detailedExplanation).toContain("A solid continuation holding +0.2.");
    expect(sameGoodVerified.detailedExplanation).not.toContain("offered slightly more punch");
    expect(sameGoodVerified.bestMoveReasoning).toBeUndefined();

    expect(describeTacticalFeatures(makeContext({ tags: ["CENTER_CONTROL"] }), false, false)).toContain(
      "contests key central squares."
    );

    const oppBlunderNoRef = await coach.explainMove({
      personaId: "sage",
      moveSan: "Qd5",
      playedBy: "Black",
      coachFor: "White",
      opponentName: "Rival",
      moveNumber: 14,
      badge: "Blunder",
      evalBefore: "+0.4",
      evalAfter: "+4.2",
      deltaWP: 32,
      engineBestMove: "Nf6",
      bestMovePV: [],
      refutationPV: [],
      tacticalContext: makeContext({
        hangingPieceDetails: { piece: "Queen", square: "d5", value: 9 },
      }),
      coachInsights: {
        playedSan: "Qd5",
        bestMoveSan: "Nf6",
        whyBetterFacts: [],
        strategicTradeoffs: [],
        missedOpportunities: [],
        refutationPvIntentions: {
          lineSan: [],
          checksDelivered: 1,
          capturedTargets: [],
          castled: false,
          promoted: false,
          terminalCheckmate: false,
          summaryFacts: ["Line attacks the exposed queen."],
        },
      },
    });
    expect(oppBlunderNoRef.detailedExplanation).toContain("Queen on d5 is exposed");
    expect(oppBlunderNoRef.detailedExplanation).toContain("checks, captures, and ways");
    expect(oppBlunderNoRef.detailedExplanation).toContain("Line attacks the exposed queen.");

    const oppMistakeInsight = await coach.explainMove({
      personaId: "danny",
      moveSan: "h6",
      playedBy: "Black",
      coachFor: "White",
      opponentName: "Rival",
      moveNumber: 10,
      badge: "Mistake",
      evalBefore: "+0.3",
      evalAfter: "+1.9",
      deltaWP: 14,
      engineBestMove: "Nc6",
      bestMovePV: ["Nc6"],
      refutationPV: [],
      tacticalContext: makeContext(),
      coachInsights: {
        playedSan: "h6",
        bestMoveSan: "Nc6",
        whyBetterFacts: ["Nc6 challenges d4 directly."],
        strategicTradeoffs: [],
        missedOpportunities: ["Missed central counterplay."],
      },
    });
    expect(oppMistakeInsight.bestMoveReasoning).toBeTruthy();

    const oppForcedNoRef = await coach.explainMove({
      personaId: "danny",
      moveSan: "Kh8",
      playedBy: "Black",
      coachFor: "White",
      opponentName: "Rival",
      moveNumber: 11,
      badge: "Forced",
      evalBefore: "+2.0",
      evalAfter: "+2.0",
      deltaWP: 0,
      engineBestMove: "Kh8",
      bestMovePV: [],
      refutationPV: [],
      tacticalContext: makeContext(),
    });
    expect(oppForcedNoRef.detailedExplanation).toBe("Rival had no other legal move than Kh8.");

    const oppForcedWithRef = await coach.explainMove({
      personaId: "danny",
      moveSan: "Kh8",
      playedBy: "Black",
      coachFor: "White",
      opponentName: "Rival",
      moveNumber: 11,
      badge: "Forced",
      evalBefore: "+2.0",
      evalAfter: "+2.3",
      deltaWP: 1,
      engineBestMove: "Kh8",
      bestMovePV: [],
      refutationPV: ["Nf3", "Nc6"],
      tacticalContext: makeContext(),
    });
    expect(oppForcedWithRef.detailedExplanation).toContain("Nf3");

    const oppBestNoRef = await coach.explainMove({
      personaId: "drillmaster",
      moveSan: "Nd4",
      playedBy: "Black",
      coachFor: "White",
      opponentName: "Rival",
      moveNumber: 13,
      badge: "Best",
      evalBefore: "+0.1",
      evalAfter: "-0.3",
      deltaWP: 2,
      engineBestMove: "Nd4",
      bestMovePV: [],
      refutationPV: [],
      tacticalContext: makeContext(),
      coachInsights: {
        playedSan: "Nd4",
        bestMoveSan: "Nd4",
        whyBetterFacts: [],
        strategicTradeoffs: [],
        missedOpportunities: [],
        bestPvIntentions: {
          lineSan: ["Nd4"],
          checksDelivered: 0,
          capturedTargets: [],
          castled: false,
          promoted: false,
          terminalCheckmate: false,
          summaryFacts: ["Knight clamps down on central outposts."],
        },
      },
    });
    expect(oppBestNoRef.detailedExplanation).toContain("Prioritize king safety and defend key squares.");
    expect(oppBestNoRef.detailedExplanation).toContain("Knight clamps down on central outposts.");

    const oppGoodThreat = await coach.explainMove({
      personaId: "sage",
      moveSan: "Nb4",
      playedBy: "Black",
      coachFor: "White",
      opponentName: "Rival",
      moveNumber: 15,
      badge: "Good",
      evalBefore: "0.0",
      evalAfter: "-0.2",
      deltaWP: 1.2,
      engineBestMove: "c5",
      bestMovePV: [],
      refutationPV: [],
      tacticalContext: makeContext({
        tags: ["TACTICAL_FORK"],
        forkTargets: [
          { square: "e1", piece: "King" },
          { square: "a1", piece: "Rook" },
        ],
      }),
    });
    expect(oppGoodThreat.detailedExplanation).toContain("Threat check:");

    const playerBlunderHangingNoRef = await coach.explainMove({
      personaId: "danny",
      moveSan: "Qa4",
      playedBy: "White",
      coachFor: "White",
      opponentName: "Rival",
      moveNumber: 16,
      badge: "Blunder",
      evalBefore: "+0.5",
      evalAfter: "-4.5",
      deltaWP: 38,
      engineBestMove: "Nf3",
      bestMovePV: ["Nf3"],
      refutationPV: [],
      tacticalContext: makeContext({
        hangingPieceDetails: { piece: "Queen", square: "a4", value: 9 },
      }),
      coachInsights: {
        playedSan: "Qa4",
        bestMoveSan: "Nf3",
        whyBetterFacts: ["Nf3 develops with tempo toward e5."],
        strategicTradeoffs: [],
        missedOpportunities: [],
        bestPvIntentions: {
          lineSan: ["Nf3"],
          checksDelivered: 0,
          capturedTargets: [],
          castled: false,
          promoted: false,
          terminalCheckmate: false,
          summaryFacts: ["Prepares rapid O-O."],
        },
      },
    });
    expect(playerBlunderHangingNoRef.detailedExplanation).toContain("can exploit this immediately");
    expect(playerBlunderHangingNoRef.detailedExplanation).toContain("Why Nf3 outperformed:");
    expect(playerBlunderHangingNoRef.bestMoveReasoning).toContain("Prepares rapid O-O.");

    const playerBlunderPlainNoRef = await coach.explainMove({
      personaId: "danny",
      moveSan: "g4",
      playedBy: "White",
      coachFor: "White",
      opponentName: "Rival",
      moveNumber: 17,
      badge: "Blunder",
      evalBefore: "+0.2",
      evalAfter: "-3.1",
      deltaWP: 30,
      engineBestMove: "Nf3",
      bestMovePV: ["Nf3"],
      refutationPV: [],
      tacticalContext: makeContext(),
      coachInsights: {
        playedSan: "g4",
        bestMoveSan: "Nf3",
        whyBetterFacts: [],
        strategicTradeoffs: ["Exposes kingside dark squares."],
        missedOpportunities: [],
        refutationPvIntentions: {
          lineSan: [],
          checksDelivered: 1,
          capturedTargets: [],
          castled: false,
          promoted: false,
          terminalCheckmate: false,
          summaryFacts: ["Dark-square diagonal opens toward e1."],
        },
      },
    });
    expect(playerBlunderPlainNoRef.detailedExplanation).toContain("decisive tactical continuation");
    expect(playerBlunderPlainNoRef.detailedExplanation).toContain("Dark-square diagonal opens");
    expect(playerBlunderPlainNoRef.detailedExplanation).toContain("Exposes kingside dark squares.");

    const playerMissNoFuture = await coach.explainMove({
      personaId: "sage",
      moveSan: "a3",
      playedBy: "White",
      coachFor: "White",
      opponentName: "Rival",
      moveNumber: 18,
      badge: "Miss",
      evalBefore: "+3.5",
      evalAfter: "+0.1",
      deltaWP: 28,
      engineBestMove: "Bxf7+",
      bestMovePV: ["Bxf7+"],
      tacticalContext: makeContext(),
    });
    expect(playerMissNoFuture.detailedExplanation).toContain("Better was 18. Bxf7+.");
    expect(playerMissNoFuture.bestMoveReasoning).toBe("Bxf7+ seized a commanding edge along 18. Bxf7+.");

    const playerMistakeHanging = await coach.explainMove({
      personaId: "danny",
      moveSan: "Nb5",
      playedBy: "White",
      coachFor: "White",
      opponentName: "Rival",
      moveNumber: 19,
      badge: "Mistake",
      evalBefore: "+0.4",
      evalAfter: "-1.3",
      deltaWP: 15,
      engineBestMove: "O-O",
      bestMovePV: ["O-O"],
      refutationPV: [],
      tacticalContext: makeContext({
        hangingPieceDetails: { piece: "Knight", square: "b5", value: 3 },
      }),
      coachInsights: {
        playedSan: "Nb5",
        bestMoveSan: "O-O",
        whyBetterFacts: ["O-O safeguards the king."],
        strategicTradeoffs: ["Delays castling while the e-file opens."],
        missedOpportunities: [],
      },
    });
    expect(playerMistakeHanging.detailedExplanation).toContain("Knight on b5 becomes vulnerable.");
    expect(playerMistakeHanging.detailedExplanation).toContain("Delays castling");

    const playerInaccRef = await coach.explainMove({
      personaId: "danny",
      moveSan: "h3",
      playedBy: "White",
      coachFor: "White",
      opponentName: "Rival",
      moveNumber: 20,
      badge: "Inaccuracy",
      evalBefore: "+0.7",
      evalAfter: "+0.3",
      deltaWP: 7,
      engineBestMove: "d4",
      bestMovePV: ["d4"],
      refutationPV: ["c5", "Nf3"],
      tacticalContext: makeContext(),
    });
    expect(playerInaccRef.detailedExplanation).toContain("Watch for Rival's");
    expect(playerInaccRef.detailedExplanation).toContain("c5");

    const playerBrilliantNoDetail = await coach.explainMove({
      personaId: "drillmaster",
      moveSan: "Bxh7+",
      playedBy: "White",
      coachFor: "White",
      moveNumber: 21,
      badge: "Brilliant",
      evalBefore: "+0.8",
      evalAfter: "+3.4",
      deltaWP: 0,
      engineBestMove: "Bxh7+",
      bestMovePV: ["Bxh7+"],
      tacticalContext: makeContext(),
      coachInsights: {
        playedSan: "Bxh7+",
        bestMoveSan: "Bxh7+",
        whyBetterFacts: [],
        strategicTradeoffs: [],
        missedOpportunities: [],
        bestPvIntentions: {
          lineSan: ["Bxh7+", "Kxh7"],
          checksDelivered: 1,
          capturedTargets: [],
          castled: false,
          promoted: false,
          terminalCheckmate: false,
          summaryFacts: ["King is dragged to an exposed shelter."],
        },
      },
    });
    expect(playerBrilliantNoDetail.detailedExplanation).toContain("unstoppable compensation.");
    expect(playerBrilliantNoDetail.detailedExplanation).toContain("King is dragged");
    expect(playerBrilliantNoDetail.coachingTip).toContain("Shatter the shelter");

    const playerGreatAndBest = await Promise.all([
      coach.explainMove({
        personaId: "danny",
        moveSan: "Qh5",
        playedBy: "White",
        coachFor: "White",
        moveNumber: 22,
        badge: "Great",
        evalBefore: "+0.1",
        evalAfter: "+2.4",
        deltaWP: 0,
        engineBestMove: "Qh5",
        bestMovePV: ["Qh5"],
        tacticalContext: makeContext({
          tags: ["TACTICAL_FORK"],
          forkTargets: [
            { square: "e8", piece: "King" },
            { square: "h8", piece: "Rook" },
          ],
        }),
        coachInsights: {
          playedSan: "Qh5",
          bestMoveSan: "Qh5",
          whyBetterFacts: [],
          strategicTradeoffs: [],
          missedOpportunities: [],
          bestPvIntentions: {
            lineSan: ["Qh5"],
            checksDelivered: 0,
            capturedTargets: [],
            castled: false,
            promoted: false,
            terminalCheckmate: false,
            summaryFacts: ["Creates decisive dark-square pressure."],
          },
        },
      }),
      coach.explainMove({
        personaId: "danny",
        moveSan: "Re1",
        playedBy: "White",
        coachFor: "White",
        moveNumber: 23,
        badge: "Best",
        evalBefore: "+0.6",
        evalAfter: "+0.6",
        deltaWP: 0,
        engineBestMove: "Re1",
        bestMovePV: ["Re1", "e5"],
        tacticalContext: makeContext(),
        coachInsights: {
          playedSan: "Re1",
          bestMoveSan: "Re1",
          whyBetterFacts: [],
          strategicTradeoffs: [],
          missedOpportunities: [],
          bestPvIntentions: {
            lineSan: ["Re1"],
            checksDelivered: 0,
            capturedTargets: [],
            castled: false,
            promoted: false,
            terminalCheckmate: false,
            summaryFacts: ["Rook eyes the e-file."],
          },
        },
      }),
      coach.explainMove({
        personaId: "danny",
        moveSan: "e4",
        playedBy: "White",
        coachFor: "White",
        moveNumber: 1,
        badge: "Book",
        evalBefore: "+0.2",
        evalAfter: "+0.2",
        deltaWP: 0,
        engineBestMove: "e4",
        bestMovePV: [],
        tacticalContext: makeContext(),
      }),
      coach.explainMove({
        personaId: "danny",
        moveSan: "O-O",
        playedBy: "White",
        coachFor: "White",
        moveNumber: 8,
        badge: "Good",
        evalBefore: "+0.3",
        evalAfter: "+0.3",
        deltaWP: 0.5,
        engineBestMove: "O-O",
        bestMovePV: [],
        tacticalContext: makeContext({ tags: ["KING_SAFETY_CASTLE"] }),
      }),
      coach.explainMove({
        personaId: "danny",
        moveSan: "Nc3",
        playedBy: "White",
        coachFor: "White",
        moveNumber: 4,
        badge: "Good",
        evalBefore: "+0.3",
        evalAfter: "+0.3",
        deltaWP: 0.5,
        engineBestMove: "Nc3",
        bestMovePV: [],
        tacticalContext: makeContext({ tags: ["DEVELOPMENT"] }),
      }),
    ]);
    expect(playerGreatAndBest[0].detailedExplanation).toContain("fork");
    expect(playerGreatAndBest[0].detailedExplanation).toContain("Creates decisive dark-square pressure.");
    expect(playerGreatAndBest[1].detailedExplanation).toContain("Stockfish's sharpest idea");
    expect(playerGreatAndBest[1].coachingTip).toBe("Rook eyes the e-file.");
    expect(playerGreatAndBest[2].detailedExplanation).toContain("the opening,");
    expect(playerGreatAndBest[3].detailedExplanation).toContain("tucking the king safely");
    expect(playerGreatAndBest[4].detailedExplanation).toContain("harmonizing development");
  });

  it("P0: surfaces allowedThreat and missedTactic in offline explanations & Gemini prompts with zero piece-square hallucinations", async () => {
    const g10ForkBefore = "r2qkbnr/p2pppp1/1p6/1BnN3p/5B2/8/PPP2PbP/R2QK1NR b KQkq - 1 10";
    const g10ForkAfter = "r2qkbnr/p2p1pp1/1p2p3/1BnN3p/5B2/8/PPP2PbP/R2QK1NR w KQkq - 0 11";

    // 1) Player Blunder allowing fork (Nc7+ forking King on e8 and Rook on a8)
    const blunderFork = await coach.explainMove({
      moveSan: "e6",
      playedBy: "Black",
      coachFor: "Black",
      moveNumber: 10,
      badge: "Blunder",
      evalBefore: "+0.8",
      evalAfter: "+6.4",
      deltaWP: 38.0,
      engineBestMove: "Na6",
      bestMovePV: ["Na6", "Nf3"],
      refutationPV: ["Nc7+", "Kf8"],
      fenBefore: g10ForkBefore,
      fenAfter: g10ForkAfter,
      tacticalContext: makeContext({
        tags: ["ALLOWS_FORK"],
        allowedThreat: {
          kind: "FORK",
          refutationMoveSan: "Nc7+",
          targetSquares: ["e8", "a8"],
          targetSummary: "King on e8 and Rook on a8",
        },
      }),
    });
    expect(blunderFork.detailedExplanation).toContain("Nc7+");
    expect(blunderFork.detailedExplanation).toContain("King on e8 and Rook on a8");
    expect(validateExplanationGrounding(blunderFork.detailedExplanation, g10ForkAfter, g10ForkBefore).valid).toBe(true);

    // 2) Player Miss with missed fork (Qa4+ forking King on e8 and Bishop on b4)
    const g03Before = "r1bqk1nr/ppp2ppp/3p4/4p3/1b2P3/3P1N2/P3KPPP/RNBQ1B1R w kq - 0 8";
    const g03After = "r1bqk1nr/ppp2ppp/3p4/4p3/1b2P3/P2P1N2/4KPPP/RNBQ1B1R b kq - 0 8";
    const missFork = await coach.explainMove({
      moveSan: "a3",
      playedBy: "White",
      coachFor: "White",
      moveNumber: 8,
      badge: "Miss",
      evalBefore: "+4.2",
      evalAfter: "+0.5",
      deltaWP: 34.0,
      engineBestMove: "Qa4+",
      bestMovePV: ["Qa4+", "Nc6", "Qxb4"],
      fenBefore: g03Before,
      fenAfter: g03After,
      tacticalContext: makeContext({
        tags: ["MISSED_FORK"],
        missedTactic: {
          kind: "FORK",
          missedMoveSan: "Qa4+",
          targetSquares: ["e8", "b4"],
          targetSummary: "King on e8 and Bishop on b4",
        },
      }),
    });
    expect(missFork.detailedExplanation).toContain("Qa4+");
    expect(missFork.detailedExplanation).toContain("King on e8 and Bishop on b4");
    expect(validateExplanationGrounding(missFork.detailedExplanation, g03After, g03Before).valid).toBe(true);

    // 3) Player Mistake with allowed mate (Re1#)
    const mateBefore = "4r1k1/5ppp/8/8/8/8/P4PPP/6K1 w - - 0 30";
    const mateAfter = "4r1k1/5ppp/8/8/P7/8/5PPP/6K1 b - - 0 30";
    const mistakeMate = await coach.explainMove({
      moveSan: "a4",
      playedBy: "White",
      coachFor: "White",
      moveNumber: 30,
      badge: "Mistake",
      evalBefore: "0.0",
      evalAfter: "-M1",
      deltaWP: 48.0,
      engineBestMove: "Kf1",
      bestMovePV: ["Kf1"],
      refutationPV: ["Re1#"],
      fenBefore: mateBefore,
      fenAfter: mateAfter,
      tacticalContext: makeContext({
        tags: ["ALLOWS_MATE"],
        allowedThreat: {
          kind: "CHECKMATE",
          refutationMoveSan: "Re1#",
          targetSquares: ["g1"],
          targetSummary: "King on g1",
        },
      }),
    });
    expect(mistakeMate.detailedExplanation).toContain("Re1#");
    expect(mistakeMate.detailedExplanation.toLowerCase()).toContain("checkmate");
    expect(validateExplanationGrounding(mistakeMate.detailedExplanation, mateAfter, mateBefore).valid).toBe(true);

    // 4) Opponent corner on opponent's Blunder/Miss names allowed/missed threat
    const oppMissCapBefore = "r5k1/5ppp/R7/8/8/8/5PPP/6K1 w - - 0 31";
    const oppMissCapAfter = "r5k1/5ppp/1R6/8/8/8/5PPP/6K1 b - - 1 31";
    const oppMissed = await coach.explainMove({
      moveSan: "Rb6",
      playedBy: "White",
      coachFor: "Black",
      opponentName: "olusheki",
      moveNumber: 31,
      badge: "Miss",
      evalBefore: "+8.0",
      evalAfter: "+0.2",
      deltaWP: 39.0,
      engineBestMove: "Rxa8",
      bestMovePV: ["Rxa8"],
      fenBefore: oppMissCapBefore,
      fenAfter: oppMissCapAfter,
      tacticalContext: makeContext({
        tags: ["MISSED_CAPTURE"],
        missedTactic: {
          kind: "FREE_CAPTURE",
          missedMoveSan: "Rxa8",
          targetSquares: ["a8"],
          targetSummary: "Rook on a8",
          netGain: 5,
        },
      }),
    });
    expect(oppMissed.detailedExplanation).toContain("Rxa8");
    expect(oppMissed.detailedExplanation).toContain("Rook on a8");
    expect(validateExplanationGrounding(oppMissed.detailedExplanation, oppMissCapAfter, oppMissCapBefore).valid).toBe(true);

    // 5) Gemini prompt includes ALLOWED THREAT & MISSED TACTIC factual grounding
    const onlineCoach = new GeminiCoachService("test-api-key");
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        badge: "Blunder",
        shortComment: "e6 walks into a knight fork.",
        detailedExplanation: "This allows Nc7+, forking the King on e8 and Rook on a8.",
        bestMoveReasoning: "Na6 guarded c7.",
      }),
    });
    await onlineCoach.explainMove({
      moveSan: "e6",
      playedBy: "Black",
      coachFor: "Black",
      moveNumber: 10,
      badge: "Blunder",
      evalBefore: "+0.8",
      evalAfter: "+6.4",
      deltaWP: 38.0,
      engineBestMove: "Na6",
      bestMovePV: ["Na6", "Nf3"],
      refutationPV: ["Nc7+", "Kf8"],
      fenBefore: g10ForkBefore,
      fenAfter: g10ForkAfter,
      tacticalContext: makeContext({
        tags: ["ALLOWS_FORK", "MISSED_CAPTURE"],
        allowedThreat: {
          kind: "FORK",
          refutationMoveSan: "Nc7+",
          targetSquares: ["e8", "a8"],
          targetSummary: "King on e8 and Rook on a8",
        },
        missedTactic: {
          kind: "FREE_CAPTURE",
          missedMoveSan: "Bxd5",
          targetSquares: ["d5"],
          targetSummary: "Knight on d5",
          netGain: 3,
        },
      }),
    });
    const promptText =
      mockGenerateContent.mock.calls.at(-1)?.[0]?.contents?.[0]?.parts?.[0]?.text ?? "";
    expect(promptText).toContain("ALLOWED THREAT");
    expect(promptText).toContain("Nc7+");
    expect(promptText).toContain("King on e8 and Rook on a8");
    expect(promptText).toContain("MISSED TACTIC");
    expect(promptText).toContain("Bxd5");
    expect(promptText).toContain("Knight on d5");
  });

  it("prioritizes checkmate headline on capture-mate blunders, avoids mid-sentence 'Your opponent', and formats exchange wins accurately", async () => {
    for (const personaId of ["danny", "sage", "drillmaster"] as const) {
      const mateBlunder = await coach.explainMove({
        moveSan: "a6",
        playedBy: "Black",
        coachFor: "Black",
        moveNumber: 3,
        badge: "Blunder",
        evalBefore: "+0.4",
        evalAfter: "#1",
        deltaWP: 48,
        engineBestMove: "g6",
        bestMovePV: ["g6"],
        refutationPV: ["Qxf7#"],
        personaId,
        tacticalContext: makeContext({
          tags: ["ALLOWS_MATE", "HANGING_PIECE"],
          hangingPieceDetails: { square: "f7", piece: "Pawn", value: 1 },
          allowedThreat: {
            kind: "CHECKMATE",
            refutationMoveSan: "Qxf7#",
          },
        }),
      });
      expect(mateBlunder.shortComment.toLowerCase()).toMatch(/checkmate|mate/);
      expect(mateBlunder.shortComment).not.toContain("Pawn");
      expect(mateBlunder.detailedExplanation).not.toMatch(/(?<!^|\. )Your opponent/);
      expect(mateBlunder.detailedExplanation).toContain("your opponent");
    }

    const oppMateBlunder = await coach.explainMove({
      moveSan: "a6",
      playedBy: "Black",
      coachFor: "White",
      moveNumber: 3,
      badge: "Blunder",
      evalBefore: "+0.4",
      evalAfter: "#1",
      deltaWP: 48,
      engineBestMove: "g6",
      bestMovePV: ["g6"],
      refutationPV: ["Qxf7#"],
      tacticalContext: makeContext({
        tags: ["ALLOWS_MATE"],
        allowedThreat: {
          kind: "CHECKMATE",
          refutationMoveSan: "Qxf7#",
        },
      }),
    });
    expect(oppMateBlunder.detailedExplanation).toContain("to deliver checkmate (Qxf7#)");
    expect(oppMateBlunder.detailedExplanation).not.toContain(
      "walks into immediate checkmate with Qxf7#"
    );
    expect(oppMateBlunder.detailedExplanation).not.toMatch(/(?<!^|\. )Your opponent/);

    const exchangeFenBefore = "4k3/2p5/3r4/8/2N5/8/8/4K3 w - - 0 15";
    const cEx = new Chess(exchangeFenBefore);
    cEx.move("Kf1");
    const exchangeFenAfter = cEx.fen();
    const exchangeRes = await coach.explainMove({
      moveSan: "Kf1",
      playedBy: "White",
      coachFor: "White",
      moveNumber: 15,
      badge: "Miss",
      evalBefore: "+3.2",
      evalAfter: "0.0",
      deltaWP: 30,
      engineBestMove: "Nxd6+",
      bestMovePV: ["Nxd6+"],
      fenBefore: exchangeFenBefore,
      fenAfter: exchangeFenAfter,
      tacticalContext: makeContext({
        tags: ["MISSED_CAPTURE"],
        missedTactic: {
          kind: "FREE_CAPTURE",
          missedMoveSan: "Nxd6+",
          targetSquares: ["d6"],
          targetSummary: "Rook on d6",
          netGain: 2,
          isExchange: true,
        },
      }),
    });
    expect(exchangeRes.detailedExplanation).toContain("winning the exchange (Rook on d6)");
    expect(exchangeRes.detailedExplanation).not.toContain("winning the Rook on d6");
    expect(exchangeRes.detailedExplanation).not.toMatch(/(?<!^|\. )Your opponent/);
    expect(validateExplanationGrounding(exchangeRes.detailedExplanation, exchangeFenAfter, exchangeFenBefore).valid).toBe(true);

    // Opponent bestMoveReasoning should avoid player 'you' framing while keeping all 3 personas distinct
    const oppReasons = await Promise.all(
      (["danny", "sage", "drillmaster"] as const).map((personaId) =>
        coach.explainMove({
          moveSan: "a6",
          playedBy: "Black",
          coachFor: "White",
          moveNumber: 3,
          badge: "Blunder",
          evalBefore: "+0.4",
          evalAfter: "#1",
          deltaWP: 48,
          engineBestMove: "g6",
          bestMovePV: ["g6", "Qf3"],
          refutationPV: ["Qxf7#"],
          personaId,
          tacticalContext: makeContext({
            tags: ["ALLOWS_MATE"],
            allowedThreat: { kind: "CHECKMATE", refutationMoveSan: "Qxf7#" },
          }),
        })
      )
    );
    const reasonTexts = oppReasons.map((r) => r.bestMoveReasoning ?? "");
    expect(new Set(reasonTexts).size).toBe(3);
    for (const reason of reasonTexts) {
      expect(reason).not.toMatch(/\byou\b/i);
      expect(reason).not.toMatch(/(?<!^|\. )Your opponent/);
    }

    const inaccRes = await coach.explainMove({
      moveSan: "h3",
      playedBy: "White",
      coachFor: "White",
      moveNumber: 12,
      badge: "Inaccuracy",
      evalBefore: "+1.1",
      evalAfter: "+0.6",
      deltaWP: 7,
      engineBestMove: "d4",
      bestMovePV: ["d4"],
      refutationPV: ["Qxd4"],
      tacticalContext: makeContext(),
    });
    expect(inaccRes.detailedExplanation).toContain("Watch for your opponent's");
    expect(inaccRes.detailedExplanation).not.toMatch(/(?<!^|\. )Your opponent/);

    const oppInacc = await coach.explainMove({
      moveSan: "a6",
      playedBy: "Black",
      coachFor: "White",
      moveNumber: 9,
      badge: "Inaccuracy",
      evalBefore: "+0.3",
      evalAfter: "+0.9",
      deltaWP: 7.5,
      engineBestMove: "Nc6",
      bestMovePV: ["Nc6", "d4"],
      refutationPV: ["d4"],
      tacticalContext: makeContext({
        tags: ["ALLOWS_FORK"],
        allowedThreat: {
          kind: "FORK",
          refutationMoveSan: "Nd5",
          targetSummary: "Queen on d8 and Rook on c7",
        },
      }),
    });
    expect(oppInacc.coachMode).toBe("offline");
    expect(oppInacc.detailedExplanation).toContain("conceded 7.5% win probability");
    expect(oppInacc.detailedExplanation).toContain("forking");
    expect(oppInacc.detailedExplanation).not.toMatch(/(?<!^|\. )Your opponent/);
  });

  it("handles omitted or whitespace evalBefore/evalAfter and engineBestMove across player and opponent badges without emitting undefined", async () => {
    const coach = new GeminiCoachService("");
    const badges = [
      "Blunder",
      "Miss",
      "Mistake",
      "Inaccuracy",
      "Brilliant",
      "Great",
      "Best",
      "Excellent",
      "Good",
      "Book",
      "Forced",
    ] as const;

    for (const badge of badges) {
      for (const coachFor of ["White", "Black"] as const) {
        const contexts =
          badge === "Blunder"
            ? [
                makeContext({ hangingPieceDetails: { piece: "Queen", square: "h5", value: 9 } }),
                makeContext(),
              ]
            : [makeContext()];

        for (const tacticalContext of contexts) {
          const res = await coach.explainMove({
            moveSan: "Qh5",
            playedBy: "White",
            coachFor,
            opponentName: "   ",
            badge,
            evalBefore: badge === "Mistake" ? "   " : undefined,
            evalAfter: undefined,
            deltaWP: 12.5,
            engineBestMove: undefined as unknown as string,
            moveNumber: 1.5 as unknown as number,
            bestMovePV: [null, "  ", undefined] as unknown as string[],
            refutationPV: ["", null] as unknown as string[],
            tacticalContext,
          });
          const serialized = JSON.stringify(res);
          expect(serialized).not.toMatch(/undefined|null/i);
          expect(res.detailedExplanation).not.toContain("()");
          expect(res.detailedExplanation).not.toContain("( to )");
          expect(res.detailedExplanation).not.toMatch(/\bat\s+\./);
          expect(res.detailedExplanation).not.toMatch(/\baround\s+\./);
          expect(res.detailedExplanation).not.toMatch(/\bholding\s+\./);
          expect(res.detailedExplanation).not.toContain("  ");
          expect(res.shortComment.length).toBeGreaterThan(5);
          if (badge === "Excellent" && coachFor === "White") {
            expect(res.detailedExplanation).toBe(
              "A solid excellent continuation. Lovely intuition keeping your army active and working together!"
            );
          }
          if (badge === "Good" && coachFor === "Black") {
            expect(res.detailedExplanation).toBe("Your opponent's move keeps the position solid.");
          }
        }
      }
    }

    const afterOnly = await coach.explainMove({
      moveSan: "Qb3",
      playedBy: "White",
      badge: "Great",
      evalBefore: "",
      evalAfter: "+2.4",
      deltaWP: 18,
      engineBestMove: "Qb3",
      moveNumber: 1,
      bestMovePV: ["Qb3", null, "Qxb3", "axb3", "Nc6", "extraMove"] as unknown as string[],
      refutationPV: ["Qxb3", "axb3"],
      tacticalContext: makeContext(),
    });
    expect(afterOnly.detailedExplanation).toContain("holding the edge (+2.4).");
    expect(afterOnly.shortComment.length).toBeGreaterThan(5);
    const bestPvTruncated = await coach.explainMove({
      moveSan: "Nf3",
      playedBy: "White",
      badge: "Best",
      evalBefore: "",
      evalAfter: "+0.8",
      deltaWP: 0,
      engineBestMove: "Nf3",
      moveNumber: 1,
      bestMovePV: ["Nf3", null, "Nc6", "d4", "d5", "extraMove"] as unknown as string[],
      tacticalContext: makeContext(),
    });
    expect(bestPvTruncated.detailedExplanation).toContain(
      "(1. Nf3 Nc6 2. d4 d5), keeping initiative at +0.8."
    );
    expect(bestPvTruncated.detailedExplanation).not.toContain("extraMove");

    const zeroMovePv = await coach.explainMove({
      moveSan: "a4",
      playedBy: "Black",
      badge: "Mistake",
      evalBefore: "+0.1",
      evalAfter: "+1.5",
      deltaWP: 14,
      engineBestMove: "Nf6",
      moveNumber: 0 as unknown as number,
      bestMovePV: ["Nf6", "d4", "d5"],
      tacticalContext: makeContext(),
    });
    expect(zeroMovePv.detailedExplanation).toContain("The evaluation shifted from +0.1 to +1.5.");
    expect(zeroMovePv.bestMoveReasoning).toContain("Nf6 d4 d5");
    expect(zeroMovePv.bestMoveReasoning).not.toContain("0.");

    const inaccShift = await coach.explainMove({
      moveSan: "a3",
      playedBy: "White",
      badge: "Inaccuracy",
      evalBefore: "+0.1",
      evalAfter: "-0.6",
      deltaWP: 7,
      engineBestMove: "Nf3",
      moveNumber: 4,
      bestMovePV: ["Nf3"],
      tacticalContext: makeContext(),
    });
    expect(inaccShift.detailedExplanation).toContain("trims your edge (+0.1 to -0.6).");

    const emptyThreatRes = await coach.explainMove({
      moveSan: "h3",
      playedBy: "White",
      badge: "Mistake",
      evalBefore: "+0.5",
      evalAfter: "-0.8",
      deltaWP: 10,
      engineBestMove: "d4",
      moveNumber: 5,
      bestMovePV: ["d4", ""],
      tacticalContext: makeContext({
        tags: ["MISSED_FORK"],
        missedTactic: { kind: "FORK", missedMoveSan: "   ", targetSummary: "  " },
      }),
    });
    expect(emptyThreatRes.detailedExplanation).toContain("You missed a fork, forking two valuable pieces.");

    const emptyOppFork = await coach.explainMove({
      moveSan: "h3",
      playedBy: "White",
      badge: "Mistake",
      evalBefore: "+0.5",
      evalAfter: "-1.8",
      deltaWP: 18,
      engineBestMove: "d4",
      moveNumber: 5,
      bestMovePV: ["d4"],
      tacticalContext: makeContext({
        tags: ["ALLOWS_FORK"],
        allowedThreat: { kind: "FORK", refutationMoveSan: "  ", targetSummary: "  " },
      }),
    });
    expect(emptyOppFork.detailedExplanation).toContain("This allows a fork, forking two valuable pieces.");

    const emptyCapture = await coach.explainMove({
      moveSan: "h3",
      playedBy: "White",
      coachFor: "Black",
      opponentName: "  ",
      badge: "Blunder",
      evalBefore: "+0.0",
      evalAfter: "-3.1",
      deltaWP: 30,
      engineBestMove: "d4",
      moveNumber: 5,
      bestMovePV: ["d4"],
      tacticalContext: makeContext({
        tags: ["ALLOWS_MATE"],
        allowedThreat: { kind: "CHECKMATE", refutationMoveSan: "  ", targetSummary: "  " },
      }),
    });
    expect(emptyCapture.detailedExplanation).toContain("Your opponent allows you to deliver checkmate (checkmate).");

    const beforeOnly = await coach.explainMove({
      moveSan: "h3",
      playedBy: "White",
      badge: "Mistake",
      evalBefore: "+1.2",
      evalAfter: "",
      deltaWP: 11,
      engineBestMove: "d4",
      moveNumber: 12,
      bestMovePV: ["d4"],
      tacticalContext: makeContext(),
    });
    expect(beforeOnly.detailedExplanation).toContain("The evaluation shifted from +1.2.");
    expect(beforeOnly.detailedExplanation).not.toMatch(/undefined/i);

    const mateNoEval = await coach.explainMove({
      moveSan: "g4",
      playedBy: "White",
      badge: "Blunder",
      evalBefore: "",
      evalAfter: "",
      deltaWP: 50,
      engineBestMove: "Nf3",
      moveNumber: 2,
      bestMovePV: ["Nf3"],
      tacticalContext: makeContext({
        tags: ["ALLOWS_MATE"],
        allowedThreat: { kind: "CHECKMATE", refutationMoveSan: "Qh4#" },
      }),
    });
    expect(mateNoEval.detailedExplanation).toBe(
      "This move concedes decisive momentum. This allows your opponent to deliver checkmate with Qh4#. Take a breath—spot the tactical clue here and carry that scan into next turn."
    );

    mockGenerateContent.mockReset();
    const onlineCoach = new GeminiCoachService("fake-test-key");
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          badge: "Inaccuracy",
          shortComment: "Nf3 develops smoothly.",
          detailedExplanation: "This move drops slight initiative.",
          bestMoveReasoning: "Developing a piece is preferable.",
          coachingTip: "Control the center before flank thrusts.",
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          badge: "Mistake",
          shortComment: "Nf3 keeps control.",
          detailedExplanation: "This move misses an active knight development.",
          bestMoveReasoning: "Nf3 fights for e5 and prepares kingside castling.",
          coachingTip: "Develop knights before pushing rim pawns.",
        }),
      });

    await onlineCoach.explainMove({
      moveSan: "h3",
      playedBy: "White",
      coachFor: "Black",
      opponentName: "   ",
      badge: "Inaccuracy",
      deltaWP: 6,
      moveNumber: 1.5,
      bestMovePV: [null, "  "],
      tacticalContext: makeContext(),
    } as never);

    await onlineCoach.explainMove({
      moveSan: "h3",
      playedBy: "White",
      coachFor: "White",
      opponentName: " Magnusson ",
      badge: "Mistake",
      evalBefore: " +0.4 ",
      evalAfter: " -1.2 ",
      deltaWP: 14,
      moveNumber: 1,
      bestMovePV: [" Nf3 ", null, " e5 ", "Qh4+", "Bb5", "a6"] as unknown as string[],
      refutationPV: ["  ", "Bg4"],
      tacticalContext: makeContext(),
    });

    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    const sentPrompt = String(
      mockGenerateContent.mock.calls[0]?.[0]?.contents?.[0]?.parts?.[0]?.text ?? ""
    );
    expect(sentPrompt).not.toMatch(/\bundefined\b/);
    expect(sentPrompt).not.toContain("Mover's Engine Best Move:");
    expect(sentPrompt).not.toContain("Mover's Best PV Line:");
    expect(sentPrompt).toContain('Refer to White (Your opponent) strictly in the 3rd person');
    expect(sentPrompt).toContain("This move was played by YOUR OPPONENT (White, Your opponent).");
    expect(sentPrompt).toContain("Move: h3 (Move ? played by White [OPPONENT: Your opponent])");
    expect(sentPrompt).toContain("Evaluation Before: N/A -> Evaluation After: N/A");
    expect(sentPrompt).toContain("why the best continuation is better");

    const sentPrompt2 = String(
      mockGenerateContent.mock.calls[1]?.[0]?.contents?.[0]?.parts?.[0]?.text ?? ""
    );
    expect(sentPrompt2).toContain("Move: h3 (Move 1 played by White [YOU])");
    expect(sentPrompt2).toContain('Refer to Black (Magnusson) strictly in the 3rd person');
    expect(sentPrompt2).toContain("Evaluation Before: +0.4 -> Evaluation After: -1.2");
    expect(sentPrompt2).toContain("- Mover's Engine Best Move: Nf3");
    expect(sentPrompt2).toContain("- Mover's Best PV Line: Nf3 e5 Qh4+ Bb5");
    expect(sentPrompt2).not.toContain("a6");
    expect(sentPrompt2).toContain("- Next Reply / Punishment Line (Magnusson): Bg4");
  });
});
