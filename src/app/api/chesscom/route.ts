import { NextRequest, NextResponse } from "next/server";
import { ChessComApiError, ChessComApiService } from "@/lib/api/chesscom-api";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username")?.trim();
  const limitParam = parseInt(searchParams.get("limit") ?? "15", 10);
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(30, limitParam)) : 15;

  if (!username || !/^[a-zA-Z0-9_-]{1,50}$/.test(username)) {
    return NextResponse.json(
      { error: "Provide a valid Chess.com username." },
      { status: 400 }
    );
  }

  try {
    const [profile, games] = await Promise.all([
      ChessComApiService.getPlayerProfile(username),
      ChessComApiService.getRecentGames(username, limit),
    ]);

    if (!profile && games.length === 0) {
      return NextResponse.json(
        { error: `Player "${username}" was not found on Chess.com.` },
        { status: 404 }
      );
    }

    return NextResponse.json({ profile, games });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch Chess.com games";
    const status =
      error instanceof ChessComApiError && error.status === 429 ? 429 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
