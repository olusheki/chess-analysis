/**
 * Gemini AI Coach Service
 * Connects to Google Gemini API (gemini-2.0-flash) using Structured Outputs.
 * Generates grounded explanations, blunder diagnoses, and game recaps in authentic Chess.com coach voice.
 */

import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Chess, PieceSymbol, Square } from "chess.js";
import { getCoachPersona } from "./coach-personas";
import {
  buildOfflineGameStoryline,
  buildOfflineMoveExplanation,
  CoachExplanationRequest,
  CoachExplanationResponse,
  formatPhaseMetric,
  GameStorylineRequest,
  GameStorylineResponse,
} from "./offline-coach";

export type {
  CoachExplanationRequest,
  CoachExplanationResponse,
  GameStorylineRequest,
  GameStorylineResponse,
};

const PIECE_NAME_TO_SYMBOL: Record<string, PieceSymbol> = {
  pawn: "p",
  knight: "n",
  bishop: "b",
  rook: "r",
  queen: "q",
  king: "k",
};

/**
 * Verifies that any "<Piece> on <square>" claim in coach text corresponds to an actual piece on that square.
 */
export function validateExplanationGrounding(
  explanationText: string,
  ...fens: string[]
): { valid: boolean; hallucinations: string[] } {
  const hallucinations: string[] = [];
  const regex = /\b(Pawn|Knight|Bishop|Rook|Queen|King)\s+on\s+([a-h][1-8])\b/gi;
  const boards = fens
    .filter(Boolean)
    .map((f) => {
      try {
        return new Chess(f);
      } catch {
        return null;
      }
    })
    .filter((c): c is Chess => c !== null);

  if (boards.length === 0) {
    return { valid: true, hallucinations: [] };
  }

  let match: RegExpExecArray | null;
  while ((match = regex.exec(explanationText)) !== null) {
    const pieceWord = match[1].toLowerCase();
    const square = match[2].toLowerCase() as Square;
    const expectedType = PIECE_NAME_TO_SYMBOL[pieceWord];
    const matchesAnyBoard = boards.some((b) => {
      const piece = b.get(square);
      return piece && piece.type === expectedType;
    });
    if (!matchesAnyBoard) {
      hallucinations.push(match[0]);
    }
  }

  return {
    valid: hallucinations.length === 0,
    hallucinations,
  };
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

const GameStorylineResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    headline: { type: Type.STRING },
    summary: { type: Type.STRING },
    whiteTakeaway: { type: Type.STRING },
    blackTakeaway: { type: Type.STRING },
  },
  required: ["headline", "summary", "whiteTakeaway", "blackTakeaway"],
};

export class GeminiCoachService {
  private ai: GoogleGenAI | null;
  private hasApiKey: boolean;

  constructor(apiKey?: string) {
    const resolvedKey =
      apiKey !== undefined ? apiKey.trim() : (process.env.GEMINI_API_KEY ?? "").trim();
    this.hasApiKey = resolvedKey.length > 0;
    this.ai = this.hasApiKey ? new GoogleGenAI({ apiKey: resolvedKey }) : null;
  }

  /**
   * Generates grounded coach commentary for an individual move.
   */
  async explainMove(req: CoachExplanationRequest): Promise<CoachExplanationResponse> {
    if (!this.hasApiKey || !this.ai) {
      return buildOfflineMoveExplanation(req);
    }

    const persona = getCoachPersona(req.personaId);
    const perspective = req.coachFor ?? req.playedBy;
    const isPlayerMove = req.playedBy === perspective;
    const oppSide = perspective === "White" ? "Black" : "White";
    const oppName = req.opponentName || "Your opponent";

    const systemPrompt = `
You are "${persona.name}" (${persona.title}), inspired by Chess.com's Game Review coach.
Voice & Style: ${persona.systemTone}

Single-Side Perspective Rule:
- You are coaching EXCLUSIVELY ${perspective} (${req.playerName || perspective}). Always address ${perspective} as "You" / "Your".
- Refer to ${oppSide} (${oppName}) strictly in the 3rd person ("${oppName}" / "Your opponent") — NEVER congratulate the opponent as "You" or blame the student for an opponent's blunder.
${isPlayerMove ? `- This move was played by YOU (${perspective}). Critique or praise your choice, and show how the opponent can respond or punish errors.` : `- This move was played by YOUR OPPONENT (${req.playedBy}, ${oppName}). Explain what threats ${oppName} creates against you, or what tactical opportunity ${oppName}'s error opens for you.`}

Strict Grounding Rules:
1. Ground your explanation STRICTLY in the provided Engine Evaluation, Tactical Tags, Best PV, and Punishment/Reply PV. NEVER invent piece placements or legal moves.
2. If the move is a Blunder, Mistake, or Miss:
   - State explicitly what was hung, missed, or conceded using only provided tags/lines.
   - Cite concrete moves from the PV/refutation line when helpful.
3. If the move is Developing or Generic:
   - Explain its positional virtue or what to prepare in reply.
4. If the move is Brilliant (!!):
   - Celebrate the sound sacrifice and explain its attacking compensation.
5. Keep shortComment under 15 words and detailedExplanation to 2-3 concise sentences.
`;

    const userPrompt = `
Analyze this move from ${perspective}'s coaching corner:
- Move: ${req.moveSan} (Move ${req.moveNumber} played by ${req.playedBy}${isPlayerMove ? " [YOU]" : ` [OPPONENT: ${oppName}]`})
- Game Phase: ${req.tacticalContext.gamePhase}
- Assigned Rating: ${req.badge}
- Evaluation Before: ${req.evalBefore} -> Evaluation After: ${req.evalAfter} (ΔWP: ${req.deltaWP.toFixed(1)}%)
- Opening: ${req.openingName || "Standard Opening"}
- Tactical Tags: ${req.tacticalContext.tags.join(", ") || "None"}
${req.tacticalContext.hangingPieceDetails ? `- ${req.badge === "Brilliant" ? "SACRIFICED PIECE" : "HUNG PIECE"}: ${req.tacticalContext.hangingPieceDetails.piece} on ${req.tacticalContext.hangingPieceDetails.square}` : ""}
${req.tacticalContext.forkTargets ? `- FORK TARGETS: ${req.tacticalContext.forkTargets.map((t) => `${t.piece} on ${t.square}`).join(", ")}` : ""}
${req.tacticalContext.pinnedPieceDetails ? `- PINNED PIECE: ${req.tacticalContext.pinnedPieceDetails.piece} on ${req.tacticalContext.pinnedPieceDetails.square} pinned to ${req.tacticalContext.pinnedPieceDetails.pinnedTo}` : ""}
${req.tacticalContext.skeweredPieceDetails ? `- SKEWER: ${req.tacticalContext.skeweredPieceDetails.frontPiece} on ${req.tacticalContext.skeweredPieceDetails.frontSquare} in front of ${req.tacticalContext.skeweredPieceDetails.backPiece} on ${req.tacticalContext.skeweredPieceDetails.backSquare}` : ""}
- Mover's Engine Best Move: ${req.engineBestMove}
- Mover's Best PV Line: ${req.bestMovePV.slice(0, 4).join(" ")}
${req.refutationPV && req.refutationPV.length > 0 ? `- Next Reply / Punishment Line (${isPlayerMove ? oppName : "Your Reply"}): ${req.refutationPV.slice(0, 4).join(" ")}` : ""}
`;

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: MoveExplanationResponseSchema,
          temperature: 0.2,
        },
      });

      const parsed: CoachExplanationResponse = JSON.parse(response.text!);
      const referenceFens = [req.fenAfter, req.fenBefore].filter(
        (f): f is string => Boolean(f)
      );
      if (referenceFens.length > 0) {
        const fullText = [
          parsed.shortComment,
          parsed.detailedExplanation,
          parsed.bestMoveReasoning ?? "",
          parsed.coachingTip ?? "",
        ].join(" ");
        const grounding = validateExplanationGrounding(fullText, ...referenceFens);
        if (!grounding.valid) {
          return buildOfflineMoveExplanation(req);
        }
      }
      return { ...parsed, badge: req.badge, coachMode: "live" };
    } catch (error) {
      console.error("Gemini API error during move explanation:", error);
      return buildOfflineMoveExplanation(req);
    }
  }

  /**
   * Generates a complete Game Overview storyline summarizing accuracy across Opening, Middlegame, and Endgame.
   */
  async generateGameStoryline(req: GameStorylineRequest): Promise<GameStorylineResponse> {
    if (!this.hasApiKey || !this.ai) {
      return buildOfflineGameStoryline(req);
    }

    const persona = getCoachPersona(req.personaId);
    const counts = req.phaseMoveCounts;
    const openW = formatPhaseMetric(req.phaseAccuracies.opening.white, counts?.opening.white);
    const openB = formatPhaseMetric(req.phaseAccuracies.opening.black, counts?.opening.black);
    const midW = formatPhaseMetric(req.phaseAccuracies.middlegame.white, counts?.middlegame.white);
    const midB = formatPhaseMetric(req.phaseAccuracies.middlegame.black, counts?.middlegame.black);
    const endW = formatPhaseMetric(req.phaseAccuracies.endgame.white, counts?.endgame.white);
    const endB = formatPhaseMetric(req.phaseAccuracies.endgame.black, counts?.endgame.black);
    const coachPerspective = req.coachFor
      ? `Coach Perspective: Speak from ${req.coachFor}'s corner ("You" = ${req.coachFor === "White" ? req.whiteName : req.blackName}).`
      : "";

    const prompt = `
You are "${persona.name}" summarizing a chess game between ${req.whiteName} (${req.whiteAccuracy}% CAPS2, est. ${req.whiteElo}) and ${req.blackName} (${req.blackAccuracy}% CAPS2, est. ${req.blackElo}).
${coachPerspective}
Result: ${req.result}
Opening: ${req.openingName || "Standard Opening"}
Phase Accuracies:
- Opening: White ${openW}, Black ${openB}
- Middlegame: White ${midW}, Black ${midB}
- Endgame: White ${endW}, Black ${endB}
Key Moments: ${req.keyMomentCount}${req.turningPointMove ? `, Turning Point: ${req.turningPointMove}` : ""}

Return an encouraging, factual 2-3 sentence summary and 1 takeaway per side.
`;

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: GameStorylineResponseSchema,
          temperature: 0.3,
        },
      });
      const parsed = JSON.parse(response.text!) as GameStorylineResponse;
      return { ...parsed, coachMode: "live" };
    } catch {
      return buildOfflineGameStoryline(req);
    }
  }
}
