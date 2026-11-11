import { NextRequest, NextResponse } from "next/server";
import { BADGE_METADATA, MoveBadge } from "@/lib/analysis/move-classifier";
import {
  CoachExplanationRequest,
  GameStorylineRequest,
  GeminiCoachService,
} from "@/lib/ai/gemini-coach";

const VALID_BADGES = new Set<string>(Object.keys(BADGE_METADATA));

function isOptionalString(v: unknown): v is string | undefined {
  return v === undefined || typeof v === "string";
}

function isPositiveIntOrUndefined(v: unknown): boolean {
  return v === undefined || (typeof v === "number" && Number.isInteger(v) && v >= 1);
}

function isValidMoveArrayOrUndefined(v: unknown): v is string[] | undefined {
  return v === undefined || (Array.isArray(v) && v.every((m) => typeof m === "string"));
}

function sanitizeMoveArray(v: string[] | undefined): string[] {
  return Array.isArray(v) ? v.map((m) => m.trim()).filter(Boolean) : [];
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isValidHangingPieceDetailsOrUndefined(
  v: unknown
): v is { piece: string; square: string; value?: number } | undefined {
  if (v === undefined) return true;
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const d = v as Record<string, unknown>;
  return (
    typeof d.piece === "string" &&
    d.piece.trim().length > 0 &&
    typeof d.square === "string" &&
    d.square.trim().length > 0 &&
    (d.value === undefined || isFiniteNum(d.value))
  );
}

function isValidPhasePair(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const pair = v as Record<string, unknown>;
  return isFiniteNum(pair.white) && isFiniteNum(pair.black);
}

function isValidStorylinePayload(reqPayload: Partial<GameStorylineRequest>): boolean {
  if (
    typeof reqPayload.whiteName !== "string" ||
    !reqPayload.whiteName.trim() ||
    typeof reqPayload.blackName !== "string" ||
    !reqPayload.blackName.trim() ||
    typeof reqPayload.result !== "string" ||
    !reqPayload.result.trim() ||
    !isFiniteNum(reqPayload.whiteAccuracy) ||
    !isFiniteNum(reqPayload.blackAccuracy) ||
    !isFiniteNum(reqPayload.whiteElo) ||
    !isFiniteNum(reqPayload.blackElo) ||
    !isFiniteNum(reqPayload.keyMomentCount) ||
    !reqPayload.phaseAccuracies ||
    typeof reqPayload.phaseAccuracies !== "object" ||
    !isValidPhasePair(reqPayload.phaseAccuracies.opening) ||
    !isValidPhasePair(reqPayload.phaseAccuracies.middlegame) ||
    !isValidPhasePair(reqPayload.phaseAccuracies.endgame) ||
    (reqPayload.coachFor !== undefined &&
      reqPayload.coachFor !== "White" &&
      reqPayload.coachFor !== "Black")
  ) {
    return false;
  }

  if (reqPayload.phaseMoveCounts !== undefined) {
    const counts = reqPayload.phaseMoveCounts as unknown as Record<string, unknown>;
    if (
      !counts ||
      typeof counts !== "object" ||
      !isValidPhasePair(counts.opening) ||
      !isValidPhasePair(counts.middlegame) ||
      !isValidPhasePair(counts.endgame)
    ) {
      return false;
    }
  }

  return true;
}

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

    const customApiKey = request.headers.get("x-gemini-api-key")?.trim();
    const coach = new GeminiCoachService(customApiKey ? customApiKey : undefined);

    if (mode === "move") {
      const reqPayload = payload as Partial<CoachExplanationRequest>;
      if (
        typeof reqPayload.moveSan !== "string" ||
        !reqPayload.moveSan.trim() ||
        typeof reqPayload.badge !== "string" ||
        !VALID_BADGES.has(reqPayload.badge) ||
        (reqPayload.playedBy !== "White" && reqPayload.playedBy !== "Black") ||
        !isFiniteNum(reqPayload.deltaWP) ||
        !reqPayload.tacticalContext ||
        typeof reqPayload.tacticalContext !== "object" ||
        !Array.isArray(reqPayload.tacticalContext.tags) ||
        (reqPayload.coachFor !== undefined &&
          reqPayload.coachFor !== "White" &&
          reqPayload.coachFor !== "Black") ||
        !isOptionalString(reqPayload.evalBefore) ||
        !isOptionalString(reqPayload.evalAfter) ||
        !isOptionalString(reqPayload.engineBestMove) ||
        !isPositiveIntOrUndefined(reqPayload.moveNumber) ||
        !isValidMoveArrayOrUndefined(reqPayload.bestMovePV) ||
        !isValidMoveArrayOrUndefined(reqPayload.refutationPV) ||
        !isValidHangingPieceDetailsOrUndefined(reqPayload.tacticalContext.hangingPieceDetails)
      ) {
        return NextResponse.json(
          { error: "Missing or invalid move explanation fields." },
          { status: 400 }
        );
      }
      const explanation = await coach.explainMove({
        ...reqPayload,
        badge: reqPayload.badge as MoveBadge,
        evalBefore: reqPayload.evalBefore?.trim() ?? "",
        evalAfter: reqPayload.evalAfter?.trim() ?? "",
        engineBestMove: reqPayload.engineBestMove?.trim() ?? "",
        moveNumber: reqPayload.moveNumber,
        bestMovePV: sanitizeMoveArray(reqPayload.bestMovePV),
        refutationPV:
          reqPayload.refutationPV !== undefined
            ? sanitizeMoveArray(reqPayload.refutationPV)
            : undefined,
        tacticalContext: reqPayload.tacticalContext.hangingPieceDetails
          ? {
              ...reqPayload.tacticalContext,
              hangingPieceDetails: {
                ...reqPayload.tacticalContext.hangingPieceDetails,
                piece: reqPayload.tacticalContext.hangingPieceDetails.piece.trim(),
                square: reqPayload.tacticalContext.hangingPieceDetails.square.trim(),
              },
            }
          : reqPayload.tacticalContext,
      } as CoachExplanationRequest);
      return NextResponse.json(explanation);
    }

    if (mode === "storyline") {
      const reqPayload = payload as Partial<GameStorylineRequest>;
      if (!isValidStorylinePayload(reqPayload)) {
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
