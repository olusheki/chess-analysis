/**
 * Gemini AI Coach Service
 * Connects to Google Gemini API (gemini-2.0-flash) using Structured Outputs.
 * Generates grounded explanations, blunder diagnoses, and game recaps in authentic Chess.com coach voice.
 */

import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Chess, PieceSymbol, Square } from "chess.js";
import { MoveBadge } from "../analysis/move-classifier";
import { TacticalContext } from "../analysis/tactical-tagger";
import { CoachPersonaId, getCoachPersona } from "./coach-personas";

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
  personaId?: CoachPersonaId;
  fenBefore?: string;
  fenAfter?: string;
}

export interface CoachExplanationResponse {
  badge: MoveBadge;
  shortComment: string; // 1 punchy sentence (e.g., "You left your Rook on a8 hanging!")
  detailedExplanation: string; // 2-3 sentences explaining why it was rated this way
  bestMoveReasoning?: string; // Explanation of why engine move is superior
  variationTitle?: string; // Title for PV line ("Optimal Path", "How White Punishes")
  coachingTip?: string; // Pedagogical advice for future games
}

export interface GameStorylineRequest {
  whiteName: string;
  blackName: string;
  result: string;
  openingName?: string;
  whiteAccuracy: number;
  blackAccuracy: number;
  whiteElo: number;
  blackElo: number;
  phaseAccuracies: {
    opening: { white: number; black: number };
    middlegame: { white: number; black: number };
    endgame: { white: number; black: number };
  };
  keyMomentCount: number;
  turningPointMove?: string;
  personaId?: CoachPersonaId;
}

export interface GameStorylineResponse {
  headline: string;
  summary: string;
  whiteTakeaway: string;
  blackTakeaway: string;
}

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
      return this.generateOfflineFallbackExplanation(req);
    }

    const persona = getCoachPersona(req.personaId);

    const systemPrompt = `
You are "${persona.name}" (${persona.title}), inspired by Chess.com's Game Review coach.
Voice & Style: ${persona.systemTone}

Strict Grounding Rules:
1. Ground your explanation STRICTLY in the provided Engine Evaluation, Tactical Tags, and Best Move PV. NEVER invent piece placements or legal moves.
2. If the move is a Blunder, Mistake, or Miss:
   - State explicitly what was hung, missed, or conceded using only provided tags/lines.
   - Explain why the engine's best move was superior.
3. If the move is Developing or Generic:
   - Explain its positional virtue (developing minor piece, contesting center, castling safety).
4. If the move is Brilliant (!!):
   - Celebrate the sound sacrifice and explain its attacking compensation.
5. Keep shortComment under 15 words and detailedExplanation to 2-3 concise sentences.
`;

    const userPrompt = `
Analyze this move:
- Move: ${req.moveSan} (Move ${req.moveNumber} by ${req.playedBy})
- Game Phase: ${req.tacticalContext.gamePhase}
- Assigned Rating: ${req.badge}
- Evaluation Before: ${req.evalBefore} -> Evaluation After: ${req.evalAfter} (ΔWP: ${req.deltaWP.toFixed(1)}%)
- Opening: ${req.openingName || "Standard Opening"}
- Tactical Tags: ${req.tacticalContext.tags.join(", ") || "None"}
${req.tacticalContext.hangingPieceDetails ? `- ${req.badge === "Brilliant" ? "SACRIFICED PIECE" : "HUNG PIECE"}: ${req.tacticalContext.hangingPieceDetails.piece} on ${req.tacticalContext.hangingPieceDetails.square}` : ""}
${req.tacticalContext.forkTargets ? `- FORK TARGETS: ${req.tacticalContext.forkTargets.map((t) => `${t.piece} on ${t.square}`).join(", ")}` : ""}
${req.tacticalContext.pinnedPieceDetails ? `- PINNED PIECE: ${req.tacticalContext.pinnedPieceDetails.piece} on ${req.tacticalContext.pinnedPieceDetails.square} pinned to ${req.tacticalContext.pinnedPieceDetails.pinnedTo}` : ""}
${req.tacticalContext.skeweredPieceDetails ? `- SKEWER: ${req.tacticalContext.skeweredPieceDetails.frontPiece} on ${req.tacticalContext.skeweredPieceDetails.frontSquare} in front of ${req.tacticalContext.skeweredPieceDetails.backPiece} on ${req.tacticalContext.skeweredPieceDetails.backSquare}` : ""}
- Engine Best Move: ${req.engineBestMove}
- Engine Best PV Line: ${req.bestMovePV.slice(0, 4).join(" ")}
${req.refutationPV ? `- Opponent Refutation Line: ${req.refutationPV.slice(0, 4).join(" ")}` : ""}
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
          return this.generateOfflineFallbackExplanation(req);
        }
      }
      return { ...parsed, badge: req.badge };
    } catch (error) {
      console.error("Gemini API error during move explanation:", error);
      return this.generateOfflineFallbackExplanation(req);
    }
  }

  /**
   * Generates a complete Game Overview storyline summarizing accuracy across Opening, Middlegame, and Endgame.
   */
  async generateGameStoryline(req: GameStorylineRequest): Promise<GameStorylineResponse> {
    if (!this.hasApiKey || !this.ai) {
      return this.generateOfflineStoryline(req);
    }

    const persona = getCoachPersona(req.personaId);
    const prompt = `
You are "${persona.name}" summarizing a chess game between ${req.whiteName} (${req.whiteAccuracy}% CAPS2, est. ${req.whiteElo}) and ${req.blackName} (${req.blackAccuracy}% CAPS2, est. ${req.blackElo}).
Result: ${req.result}
Opening: ${req.openingName || "Standard Opening"}
Phase Accuracies:
- Opening: White ${req.phaseAccuracies.opening.white}%, Black ${req.phaseAccuracies.opening.black}%
- Middlegame: White ${req.phaseAccuracies.middlegame.white}%, Black ${req.phaseAccuracies.middlegame.black}%
- Endgame: White ${req.phaseAccuracies.endgame.white}%, Black ${req.phaseAccuracies.endgame.black}%
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
      return JSON.parse(response.text!) as GameStorylineResponse;
    } catch {
      return this.generateOfflineStoryline(req);
    }
  }

  private generateOfflineStoryline(req: GameStorylineRequest): GameStorylineResponse {
    const openingLabel = req.openingName || "the opening";
    const headline =
      req.result === "1-0"
        ? `${req.whiteName} takes the victory with ${req.whiteAccuracy}% accuracy`
        : req.result === "0-1"
        ? `${req.blackName} takes the victory with ${req.blackAccuracy}% accuracy`
        : req.result === "1/2-1/2"
        ? `Hard-fought draw in ${openingLabel}`
        : `Balanced battle in ${openingLabel} (${req.whiteAccuracy}% vs ${req.blackAccuracy}%)`;

    const turningNote = req.turningPointMove
      ? ` The critical turning point came around ${req.turningPointMove}.`
      : "";

    const summary = `In ${openingLabel}, White (${req.whiteName}) posted ${req.whiteAccuracy}% overall CAPS2 accuracy (est. ${req.whiteElo}) against Black (${req.blackName}) at ${req.blackAccuracy}% (est. ${req.blackElo}). Phase accuracy (W/B): Opening ${req.phaseAccuracies.opening.white}%/${req.phaseAccuracies.opening.black}%, Middlegame ${req.phaseAccuracies.middlegame.white}%/${req.phaseAccuracies.middlegame.black}%, Endgame ${req.phaseAccuracies.endgame.white}%/${req.phaseAccuracies.endgame.black}%.${turningNote}`;

    const whiteTakeaway =
      req.whiteAccuracy >= 85
        ? `Strong calculation throughout (${req.whiteAccuracy}% accuracy); keep reviewing the ${req.keyMomentCount} key moments to sharpen conversions.`
        : `Focus on double-checking undefended pieces before committing in complex middlegame positions (${req.phaseAccuracies.middlegame.white}% middlegame accuracy).`;

    const blackTakeaway =
      req.blackAccuracy >= 85
        ? `Resilient accuracy (${req.blackAccuracy}%); look closely at the turning points where small concessions shifted momentum.`
        : `Review the tactical key moments in the middlegame (${req.phaseAccuracies.middlegame.black}% accuracy) to spot counterplay sooner.`;

    return {
      headline,
      summary,
      whiteTakeaway,
      blackTakeaway,
    };
  }

  /**
   * Deterministic offline fallback grounded in tactical tags & evaluation deltas.
   */
  private generateOfflineFallbackExplanation(req: CoachExplanationRequest): CoachExplanationResponse {
    const { badge, tacticalContext, engineBestMove, moveSan, playedBy } = req;

    const tacticalDetail = this.describeTacticalFeatures(tacticalContext);

    if (badge === "Blunder") {
      if (tacticalContext.hangingPieceDetails) {
        const { piece, square } = tacticalContext.hangingPieceDetails;
        return {
          badge,
          shortComment: `You left your ${piece} on ${square} hanging!`,
          detailedExplanation: `${moveSan} left your ${piece} vulnerable on ${square}. The opponent can exploit this immediately, shifting the evaluation to ${req.evalAfter}.`,
          bestMoveReasoning: `${engineBestMove} would have kept your position solid and protected your material.`,
          variationTitle: "Opponent's Winning Punishment",
          coachingTip: "Before moving, scan every piece to verify it stays defended.",
        };
      }
      return {
        badge,
        shortComment: `${moveSan} is a critical blunder that shifts the game.`,
        detailedExplanation: `This move concedes decisive momentum (${req.evalBefore} to ${req.evalAfter}). ${tacticalDetail || "Your opponent now has a powerful tactical continuation."}`,
        bestMoveReasoning: `${engineBestMove} was the engine's top move to stay in control.`,
        variationTitle: "Punishment Line",
      };
    }

    if (badge === "Miss") {
      return {
        badge,
        shortComment: `You missed a winning chance with ${engineBestMove}!`,
        detailedExplanation: `Your opponent had just slipped, but ${moveSan} let them off the hook (${req.evalBefore} to ${req.evalAfter}). ${tacticalDetail}`.trim(),
        bestMoveReasoning: `${engineBestMove} would have seized a commanding advantage immediately.`,
        variationTitle: "Missed Winning Line",
        coachingTip: "When your opponent makes an awkward move, pause to check checks, captures, and threats.",
      };
    }

    if (badge === "Mistake") {
      return {
        badge,
        shortComment: `${moveSan} gives away a meaningful advantage.`,
        detailedExplanation: `${tacticalContext.hangingPieceDetails ? `Your ${tacticalContext.hangingPieceDetails.piece} on ${tacticalContext.hangingPieceDetails.square} becomes vulnerable. ` : ""}The evaluation shifted from ${req.evalBefore} to ${req.evalAfter}.`,
        bestMoveReasoning: `${engineBestMove} maintained stronger control over the critical squares.`,
        variationTitle: "Optimal Continuation",
      };
    }

    if (badge === "Inaccuracy") {
      return {
        badge,
        shortComment: `${moveSan} is slightly imprecise; ${engineBestMove} was sharper.`,
        detailedExplanation: `While ${moveSan} remains playable, it concedes a small edge (${req.evalBefore} to ${req.evalAfter}). ${tacticalDetail}`.trim(),
        bestMoveReasoning: `${engineBestMove} kept more active pressure on the position.`,
        variationTitle: "More Accurate Path",
      };
    }

    if (badge === "Brilliant") {
      return {
        badge,
        shortComment: `${moveSan}!! A brilliant sacrifice that breaks the position open!`,
        detailedExplanation: `${playedBy} sacrifices material with ${moveSan} while keeping the evaluation strong at ${req.evalAfter}. ${tacticalDetail || "The resulting piece activity and king pressure give full compensation."}`,
        variationTitle: "Brilliant Continuation",
        coachingTip: "Calculated sacrifices shine when your pieces quickly swarm the opponent's king.",
      };
    }

    if (badge === "Great") {
      return {
        badge,
        shortComment: `${moveSan}! You found the only winning move in a sharp spot.`,
        detailedExplanation: `In a critical position, ${moveSan} was the sole path to preserve the advantage (${req.evalAfter}). ${tacticalDetail}`.trim(),
        variationTitle: "Sole Winning Line",
      };
    }

    if (badge === "Best") {
      return {
        badge,
        shortComment: `${moveSan} is the best move on the board!`,
        detailedExplanation: tacticalDetail
          ? `${tacticalDetail} This finds the engine's top continuation at ${req.evalAfter}.`
          : `This finds the most accurate path forward, maximizing piece activity and maintaining ${req.evalAfter}.`,
        variationTitle: "Engine Line",
      };
    }

    if (badge === "Book") {
      return {
        badge,
        shortComment: "Standard opening book theory.",
        detailedExplanation: `Following established theory in the ${req.openingName || "opening"}, fighting cleanly for central space and development.`,
      };
    }

    if (badge === "Forced") {
      return {
        badge,
        shortComment: `${moveSan} was your only legal move.`,
        detailedExplanation: "There were no legal alternatives available in this position.",
      };
    }

    if (tacticalContext.tags.includes("KING_SAFETY_CASTLE")) {
      return {
        badge,
        shortComment: "Castling tucks the king away safely.",
        detailedExplanation: `A timely ${badge.toLowerCase()} move that safeguards the king and brings the rook closer to the center.`,
      };
    }

    if (tacticalContext.tags.includes("DEVELOPMENT")) {
      return {
        badge,
        shortComment: "A solid developing move.",
        detailedExplanation: `This develops a minor piece toward active central squares (${tacticalDetail || "preparing castling and harmonious coordination"}).`,
      };
    }

    return {
      badge,
      shortComment: `${moveSan} is a ${badge.toLowerCase()} move.`,
      detailedExplanation: tacticalDetail
        ? `${tacticalDetail} ${engineBestMove !== moveSan ? `${engineBestMove} was an alternative worth considering.` : ""}`.trim()
        : `A reasonable continuation keeping the evaluation at ${req.evalAfter}. ${engineBestMove !== moveSan ? `${engineBestMove} was slightly preferred by the engine.` : ""}`.trim(),
      bestMoveReasoning:
        engineBestMove !== moveSan ? `${engineBestMove} offered a touch more precision.` : undefined,
    };
  }

  private describeTacticalFeatures(ctx: TacticalContext): string {
    const parts: string[] = [];

    if (ctx.tags.includes("TACTICAL_FORK") && ctx.forkTargets && ctx.forkTargets.length >= 2) {
      const targetStr = ctx.forkTargets.map((t) => `${t.piece} on ${t.square}`).join(" and ");
      parts.push(`This creates a fork attacking ${targetStr}.`);
    }
    if (ctx.tags.includes("ABSOLUTE_PIN") && ctx.pinnedPieceDetails) {
      parts.push(
        `It pins the ${ctx.pinnedPieceDetails.piece} on ${ctx.pinnedPieceDetails.square} to the King.`
      );
    } else if (ctx.tags.includes("RELATIVE_PIN") && ctx.pinnedPieceDetails) {
      parts.push(
        `It pins the ${ctx.pinnedPieceDetails.piece} on ${ctx.pinnedPieceDetails.square} against the ${ctx.pinnedPieceDetails.pinnedTo}.`
      );
    }
    if (ctx.tags.includes("SKEWER") && ctx.skeweredPieceDetails) {
      parts.push(
        `This skewers the ${ctx.skeweredPieceDetails.frontPiece} on ${ctx.skeweredPieceDetails.frontSquare} in front of the ${ctx.skeweredPieceDetails.backPiece} on ${ctx.skeweredPieceDetails.backSquare}.`
      );
    }
    if (ctx.tags.includes("DISCOVERED_ATTACK") && ctx.discoveredTarget) {
      parts.push(
        `Moving clears a discovered attack on the ${ctx.discoveredTarget.piece} on ${ctx.discoveredTarget.square}.`
      );
    }
    if (ctx.tags.includes("CHECKMATE_THREAT")) {
      parts.push("It creates an immediate checkmate threat that must be answered.");
    }
    if (ctx.tags.includes("CENTER_CONTROL") && parts.length === 0) {
      parts.push("It contests key central squares.");
    }
    return parts.join(" ");
  }
}
