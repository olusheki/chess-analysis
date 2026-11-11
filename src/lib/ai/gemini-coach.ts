/**
 * Gemini AI Coach Service
 * Connects to Google Gemini API (gemini-2.0-flash / gemini-1.5-flash) using Structured Outputs.
 * Generates grounded explanations, blunder diagnoses, and game recaps in authentic Chess.com coach voice.
 */

import { GoogleGenAI, Type, Schema } from "@google/genai";
import { MoveBadge } from "../analysis/move-classifier";
import { TacticalContext } from "../analysis/tactical-tagger";

export interface CoachExplanationRequest {
  moveSan: string;
  playedBy: "White" | "Black";
  moveNumber: number;
  badge: MoveBadge;
  openingName?: string;
  evalBefore: string;
  evalAfter: string;
  deltaWP: number;
  engineBestMove: string;
  bestMovePV: string[];
  refutationPV?: string[];
  tacticalContext: TacticalContext;
}

export interface CoachExplanationResponse {
  badge: MoveBadge;
  shortComment: string;         // 1 punchy sentence (e.g., "You left your Rook on a8 hanging!")
  detailedExplanation: string;  // 2-3 sentences explaining why it was rated this way
  bestMoveReasoning?: string;   // Explanation of why engine move is superior
  variationTitle?: string;      // Title for PV line ("Optimal Path", "How White Punishes")
  coachingTip?: string;         // Pedagogical advice for future games
}

const MoveExplanationResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    badge: {
      type: Type.STRING,
      description: "The assigned badge (e.g., Blunder, Best, Brilliant, Inaccuracy)",
    },
    shortComment: {
      type: Type.STRING,
      description: "Punchy 1-sentence headline for the coach speech bubble (max 15 words).",
    },
    detailedExplanation: {
      type: Type.STRING,
      description: "2-3 sentences grounded entirely in the tactical tags and engine evaluation.",
    },
    bestMoveReasoning: {
      type: Type.STRING,
      description: "Why the engine best move is superior if player made a mistake.",
    },
    variationTitle: {
      type: Type.STRING,
      description: "Short label for the variation line (e.g. 'Tactical Punishment Line').",
    },
    coachingTip: {
      type: Type.STRING,
      description: "Supportive advice to improve the player's chess intuition.",
    },
  },
  required: ["badge", "shortComment", "detailedExplanation"],
};

export class GeminiCoachService {
  private ai: GoogleGenAI;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn("GEMINI_API_KEY is not defined. Falling back to offline rule-based coach templates.");
    }
    this.ai = new GoogleGenAI({ apiKey: key || "dummy-key" });
  }

  /**
   * Generates grounded coach commentary for an individual move
   */
  async explainMove(req: CoachExplanationRequest): Promise<CoachExplanationResponse> {
    // If no API key, use instant offline template generator
    if (!process.env.GEMINI_API_KEY) {
      return this.generateOfflineFallbackExplanation(req);
    }

    const systemPrompt = `
You are "Coach Danny", an expert, charismatic, supportive, and pedagogical chess coach inspired by Chess.com's Game Review coach.
Your mission is to explain chess moves clearly to players of all skill levels.

Strict Grounding Rules:
1. Ground your explanation STRICTLY in the provided Engine Evaluation, Tactical Tags, and Best Move PV. NEVER hallucinate piece positions or legal moves.
2. If the move is a Blunder, Mistake, or Miss:
   - Identify what was hung, overlooked, or conceded (e.g., hanging piece on d7, missed fork on e5).
   - Reference the opponent's winning refutation line.
3. If the move is Developing or Generic:
   - Explain its positional virtue (e.g., develops minor piece, stakes claim in the center, readies castling).
4. If the move is Brilliant (!!):
   - Enthusiastically celebrate the piece sacrifice and explain how it demolishes the enemy position.
5. Tone: Encouraging, supportive, concise.
`;

    const userPrompt = `
Analyze this move:
- Move: ${req.moveSan} (Move ${req.moveNumber} by ${req.playedBy})
- Game Phase: ${req.tacticalContext.gamePhase}
- Assigned Rating: ${req.badge}
- Evaluation Before: ${req.evalBefore} -> Evaluation After: ${req.evalAfter} (ΔWP: ${req.deltaWP.toFixed(1)}%)
- Opening: ${req.openingName || "Standard Opening"}
- Tactical Tags: ${req.tacticalContext.tags.join(", ") || "None"}
${req.tacticalContext.hangingPieceDetails ? `- HUNG PIECE: ${req.tacticalContext.hangingPieceDetails.piece} on ${req.tacticalContext.hangingPieceDetails.square}` : ""}
${req.tacticalContext.forkTargets ? `- FORK TARGETS: ${req.tacticalContext.forkTargets.map(t => `${t.piece} on ${t.square}`).join(", ")}` : ""}
- Engine Best Move: ${req.engineBestMove}
- Engine Best PV Line: ${req.bestMovePV.slice(0, 4).join(" ")}
${req.refutationPV ? `- Opponent Refutation Line: ${req.refutationPV.slice(0, 4).join(" ")}` : ""}
`;

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [
          { role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: MoveExplanationResponseSchema,
          temperature: 0.2, // Low temperature for high factual precision
        },
      });

      const parsed: CoachExplanationResponse = JSON.parse(response.text!);
      return parsed;
    } catch (error) {
      console.error("Gemini API error during move explanation:", error);
      return this.generateOfflineFallbackExplanation(req);
    }
  }

  /**
   * Deterministic offline fallback when API key is missing or offline
   */
  private generateOfflineFallbackExplanation(req: CoachExplanationRequest): CoachExplanationResponse {
    const { badge, tacticalContext, engineBestMove } = req;

    if (badge === "Blunder") {
      if (tacticalContext.hangingPieceDetails) {
        const { piece, square } = tacticalContext.hangingPieceDetails;
        return {
          badge,
          shortComment: `You left your ${piece} on ${square} hanging!`,
          detailedExplanation: `Moving here left your ${piece} undefended on ${square}. The opponent can capture it immediately, shifting the advantage decisively.`,
          bestMoveReasoning: `${engineBestMove} would have preserved material and maintained a solid defensive posture.`,
          variationTitle: "Opponent's Winning Capture",
        };
      }
      return {
        badge,
        shortComment: "A critical blunder that loses decisive advantage.",
        detailedExplanation: "This move allows the opponent to seize control of the board with a tactical sequence.",
        bestMoveReasoning: `${engineBestMove} was the engine's recommended path forward.`,
      };
    }

    if (badge === "Brilliant") {
      return {
        badge,
        shortComment: "An incredible sacrifice that cracks the game open!",
        detailedExplanation: "You sacrificed material to generate an unstoppable tactical assault or mating net.",
        variationTitle: "Winning Continuation",
      };
    }

    if (badge === "Best") {
      return {
        badge,
        shortComment: "The best move on the board!",
        detailedExplanation: "This move finds the most accurate path forward, maximizing your piece activity and pressure.",
      };
    }

    if (badge === "Book") {
      return {
        badge,
        shortComment: "Standard opening book theory.",
        detailedExplanation: `Following well-known opening theory in the ${req.openingName || "opening"}.`,
      };
    }

    if (tacticalContext.tags.includes("DEVELOPMENT")) {
      return {
        badge,
        shortComment: "A solid developing move.",
        detailedExplanation: "This develops a minor piece off the back rank, staking claim in the center and facilitating castling.",
      };
    }

    return {
      badge,
      shortComment: `${badge} move.`,
      detailedExplanation: `The game remains contested. ${engineBestMove} was also a strong candidate.`,
    };
  }
}
