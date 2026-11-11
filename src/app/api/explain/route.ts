import { NextRequest, NextResponse } from "next/server";
import { BADGE_METADATA, MoveBadge } from "@/lib/analysis/move-classifier";
import {
  CoachExplanationRequest,
  GameStorylineRequest,
  GeminiCoachService,
} from "@/lib/ai/gemini-coach";

const VALID_BADGES = new Set<string>(Object.keys(BADGE_METADATA));

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const mode = body?.mode;
    const payload = body?.payload;

    if (!payload || typeof payload !== "object") {
      return NextResponse.json(
        { error: "Request must include `mode` and `payload`." },
        { status: 400 }
      );
    }

    const coach = new GeminiCoachService();

    if (mode === "move") {
      const reqPayload = payload as Partial<CoachExplanationRequest>;
      if (
        typeof reqPayload.moveSan !== "string" ||
        !reqPayload.moveSan.trim() ||
        typeof reqPayload.badge !== "string" ||
        !VALID_BADGES.has(reqPayload.badge) ||
        (reqPayload.playedBy !== "White" && reqPayload.playedBy !== "Black") ||
        typeof reqPayload.deltaWP !== "number" ||
        !Number.isFinite(reqPayload.deltaWP) ||
        !reqPayload.tacticalContext ||
        typeof reqPayload.tacticalContext !== "object" ||
        !Array.isArray(reqPayload.tacticalContext.tags)
      ) {
        return NextResponse.json(
          { error: "Missing or invalid move explanation fields." },
          { status: 400 }
        );
      }
      const explanation = await coach.explainMove({
        ...reqPayload,
        badge: reqPayload.badge as MoveBadge,
        bestMovePV: Array.isArray(reqPayload.bestMovePV) ? reqPayload.bestMovePV : [],
      } as CoachExplanationRequest);
      return NextResponse.json(explanation);
    }

    if (mode === "storyline") {
      const reqPayload = payload as Partial<GameStorylineRequest>;
      if (
        typeof reqPayload.whiteName !== "string" ||
        typeof reqPayload.blackName !== "string" ||
        !reqPayload.phaseAccuracies ||
        !reqPayload.phaseAccuracies.opening ||
        !reqPayload.phaseAccuracies.middlegame ||
        !reqPayload.phaseAccuracies.endgame
      ) {
        return NextResponse.json(
          { error: "Missing required game storyline fields." },
          { status: 400 }
        );
      }
      const storyline = await coach.generateGameStoryline(reqPayload as GameStorylineRequest);
      return NextResponse.json(storyline);
    }

    return NextResponse.json(
      { error: "Invalid `mode`. Must be `move` or `storyline`." },
      { status: 400 }
    );
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }
}
