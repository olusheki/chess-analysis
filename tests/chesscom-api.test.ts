import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChessComApiService } from "@/lib/api/chesscom-api";

describe("ChessComApiService (module 0 username importer)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns null on 404 when player profile does not exist", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    }) as unknown as typeof fetch;

    const profile = await ChessComApiService.getPlayerProfile("nonexistent_user_xyz");
    expect(profile).toBeNull();
  });

  it("fetches player profile and recent games sorted newest-first with accurate win/loss/draw classification", async () => {
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith("/games/archives")) {
        return {
          ok: true,
          json: async () => ({
            archives: [
              "https://api.chess.com/pub/player/hikaru/games/2026/10",
              "https://api.chess.com/pub/player/hikaru/games/2026/11",
            ],
          }),
        } as Response;
      }
      if (u.endsWith("/2026/11")) {
        return {
          ok: true,
          json: async () => ({
            games: [
              {
                url: "https://chess.com/game/1",
                pgn: "1. e4 e5 1-0",
                time_control: "180",
                end_time: 1700000100,
                rated: true,
                time_class: "blitz",
                rules: "chess",
                white: { username: "Hikaru", rating: 3250, result: "win" },
                black: { username: "OpponentA", rating: 3100, result: "resigned" },
              },
              {
                url: "https://chess.com/game/2",
                pgn: "1. d4 d5 1/2-1/2",
                time_control: "600",
                end_time: 1700000500,
                rated: true,
                time_class: "rapid",
                rules: "chess",
                white: { username: "OpponentB", rating: 3150, result: "repetition" },
                black: { username: "hikaru", rating: 3245, result: "repetition" },
              },
              {
                url: "https://chess.com/game/3",
                pgn: "1. c4 e5 0-1",
                time_control: "60",
                end_time: 1700000200,
                rated: true,
                time_class: "bullet",
                rules: "chess",
                white: { username: "OpponentC", rating: 3120, result: "win" },
                black: { username: "hikaru", rating: 3240, result: "checkmated" },
              },
            ],
          }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    }) as unknown as typeof fetch;

    const games = await ChessComApiService.getRecentGames("Hikaru", 15);
    expect(games).toHaveLength(3);
    // Sorted newest first: 500, 200, 100
    expect(games[0].opponent).toBe("OpponentB");
    expect(games[0].result).toBe("draw");
    expect(games[0].userColor).toBe("black");

    expect(games[1].opponent).toBe("OpponentC");
    expect(games[1].result).toBe("loss");
    expect(games[1].userColor).toBe("black");

    expect(games[2].opponent).toBe("OpponentA");
    expect(games[2].result).toBe("win");
    expect(games[2].userColor).toBe("white");
  });

  it("falls back to previous monthly archive when current month has zero games", async () => {
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith("/games/archives")) {
        return {
          ok: true,
          json: async () => ({
            archives: [
              "https://api.chess.com/pub/player/test-user/games/2026/10",
              "https://api.chess.com/pub/player/test-user/games/2026/11",
            ],
          }),
        } as Response;
      }
      if (u.endsWith("/2026/11")) {
        return { ok: true, json: async () => ({ games: [] }) } as Response;
      }
      if (u.endsWith("/2026/10")) {
        return {
          ok: true,
          json: async () => ({
            games: [
              {
                url: "https://chess.com/game/10",
                pgn: "1. e4 c5 1-0",
                time_control: "180",
                end_time: 1698000000,
                rated: true,
                time_class: "blitz",
                rules: "chess",
                white: { username: "test-user", rating: 1500, result: "win" },
                black: { username: "Rival", rating: 1490, result: "timeout" },
              },
            ],
          }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    }) as unknown as typeof fetch;

    const games = await ChessComApiService.getRecentGames("test-user", 10);
    expect(games).toHaveLength(1);
    expect(games[0].userColor).toBe("white");
    expect(games[0].result).toBe("win");
  });
});
