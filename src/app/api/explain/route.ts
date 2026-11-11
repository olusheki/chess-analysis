import { NextRequest, NextResponse } from "next/server";
import {
  CoachExplanationRequest,
  GameStorylineRequest,
  GeminiCoachService,
} from "@/lib/ai/gemini-coach";

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
        !reqPayload.moveSan ||
        !reqPayload.badge ||
        !reqPayload.playedBy ||
        !reqPayload.tacticalContext
      ) {
        return NextResponse.json(
          { error: "Missing required move explanation fields." },
          { status: 400 }
        );
      }
      const explanation = await coach.explainMove(reqPayload as CoachExplanationRequest);
      return NextResponse.json(explanation);
    }

    if (mode === "storyline") {
      const reqPayload = payload as Partial<GameStorylineRequest>;
      if (!reqPayload.whiteName || !reqPayload.blackName || !reqPayload.phaseAccuracies) {
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
