/**
 * Chess.com Public API Integration Service
 * Fetches user profile, monthly game archives, and recent games directly from Chess.com's public REST API.
 * No API key required (public endpoints). Follows Chess.com rate-limiting and User-Agent guidelines.
 */

export interface ChessComPlayerProfile {
  username: string;
  avatar?: string;
  title?: string;
  country?: string;
  status: string;
  followers: number;
}

export interface ChessComGameItem {
  url: string;
  pgn: string;
  time_control: string;
  end_time: number;
  rated: boolean;
  time_class: "bullet" | "blitz" | "rapid" | "daily";
  rules: string;
  white: {
    username: string;
    rating: number;
    result: string;
  };
  black: {
    username: string;
    rating: number;
    result: string;
  };
}

export interface FormattedGameListItem {
  id: string;
  opponent: string;
  opponentRating: number;
  userRating: number;
  userColor: "white" | "black";
  result: "win" | "loss" | "draw";
  resultDetail: string;
  timeControl: string;
  timeClass: string;
  date: string;
  pgn: string;
}

export class ChessComApiService {
  private static readonly BASE_URL = "https://api.chess.com/pub";
  private static readonly HEADERS = {
    "User-Agent": "ChessGameReviewApp/1.0 (contact: support@chessanalysis.app)",
    Accept: "application/json",
  };

  /**
   * Fetches player profile information (avatar, status, title)
   */
  static async getPlayerProfile(username: string): Promise<ChessComPlayerProfile | null> {
    try {
      const normalized = username.trim().toLowerCase();
      if (!normalized) return null;
      const sanitized = encodeURIComponent(normalized);
      const res = await fetch(`${this.BASE_URL}/player/${sanitized}`, {
        headers: this.HEADERS,
      });

      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`Failed to fetch player profile: ${res.statusText}`);
      }

      return await res.json();
    } catch (error) {
      console.error(`Error fetching profile for ${username}:`, error);
      return null;
    }
  }

  /**
   * Fetches recent completed standard chess games for a user
   * (queries latest monthly archives until `limit` games are collected)
   */
  static async getRecentGames(username: string, limit: number = 15): Promise<FormattedGameListItem[]> {
    const rawUser = username.trim().toLowerCase();
    if (!rawUser) {
      throw new Error("Username is required");
    }
    const sanitized = encodeURIComponent(rawUser);

    const archivesRes = await fetch(`${this.BASE_URL}/player/${sanitized}/games/archives`, {
      headers: this.HEADERS,
    });

    if (!archivesRes.ok) {
      throw new Error(`Failed to fetch game archives for ${username}`);
    }

    const { archives }: { archives: string[] } = await archivesRes.json();
    if (!archives || archives.length === 0) {
      return [];
    }

    const collectedGames: ChessComGameItem[] = [];
    // Walk backwards through monthly archives (max 3 months) until limit standard games are gathered
    for (let i = archives.length - 1; i >= Math.max(0, archives.length - 3); i--) {
      const archiveUrl = archives[i];
      const gamesRes = await fetch(archiveUrl, { headers: this.HEADERS });
      if (!gamesRes.ok) {
        if (i === archives.length - 1 && collectedGames.length === 0) {
          throw new Error(`Failed to fetch games from archive ${archiveUrl}`);
        }
        continue;
      }

      const data: { games?: ChessComGameItem[] } = await gamesRes.json();
      const standardGames = (data.games ?? []).filter(
        (g) => Boolean(g.pgn) && (!g.rules || g.rules === "chess")
      );
      collectedGames.push(...standardGames);

      if (collectedGames.length >= limit) break;
    }

    return this.formatAndSortGames(collectedGames, rawUser, limit);
  }

  /**
   * Normalizes and sorts raw Chess.com games from newest to oldest
   */
  private static formatAndSortGames(
    games: ChessComGameItem[],
    username: string,
    limit: number
  ): FormattedGameListItem[] {
    const userLower = username.toLowerCase();

    const sorted = [...games].sort((a, b) => b.end_time - a.end_time);
    const sliced = sorted.slice(0, limit);

    return sliced.map((g, index) => {
      const isWhite = g.white.username.toLowerCase() === userLower;
      const userResult = isWhite ? g.white.result : g.black.result;
      const opponent = isWhite ? g.black : g.white;
      const user = isWhite ? g.white : g.black;

      let outcome: "win" | "loss" | "draw" = "draw";
      if (userResult === "win") {
        outcome = "win";
      } else if (
        [
          "checkmated",
          "resigned",
          "timeout",
          "abandoned",
          "lose",
          "bughousepartnerlose",
        ].includes(userResult)
      ) {
        outcome = "loss";
      }

      const dateObj = new Date(g.end_time * 1000);
      const formattedDate = dateObj.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      return {
        id: `${g.end_time}-${index}`,
        opponent: opponent.username,
        opponentRating: opponent.rating,
        userRating: user.rating,
        userColor: isWhite ? "white" : "black",
        result: outcome,
        resultDetail: userResult,
        timeControl: g.time_control,
        timeClass: g.time_class,
        date: formattedDate,
        pgn: g.pgn,
      };
    });
  }
}
