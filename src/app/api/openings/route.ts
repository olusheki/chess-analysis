import { NextRequest, NextResponse } from "next/server";
import {
  classifyGameOpenings,
  getOpeningInsight,
  lookupOpeningByFen,
  searchOpenings,
} from "@/lib/analysis/opening-book";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fen = searchParams.get("fen");
  const query = searchParams.get("q");
  const limitParam = parseInt(searchParams.get("limit") ?? "20", 10);
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(50, limitParam)) : 20;

  if (fen) {
    const opening = lookupOpeningByFen(fen);
    if (!opening) {
      return NextResponse.json({ opening: null, insight: null });
    }
    return NextResponse.json({
      opening,
      insight: getOpeningInsight(opening.eco, opening.name),
    });
  }

  if (query) {
    const results = searchOpenings(query, limit);
    return NextResponse.json({ results });
  }

  return NextResponse.json(
    { error: "Provide either `fen` or `q` query parameter." },
    { status: 400 }
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const movesSan = body?.movesSan;
    if (!Array.isArray(movesSan) || !movesSan.every((m) => typeof m === "string")) {
      return NextResponse.json(
        { error: "Request body must contain `movesSan: string[]`." },
        { status: 400 }
      );
    }
    const analysis = classifyGameOpenings(movesSan);
    return NextResponse.json(analysis);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }
}
