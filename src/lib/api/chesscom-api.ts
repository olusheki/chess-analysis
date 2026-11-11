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
      const sanitized = encodeURIComponent(username.trim().toLowerCase());
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
   * Fetches recent completed games for a user (queries the most recent monthly archive)
   * @param username Chess.com username
   * @param limit Maximum number of recent games to return (defaults to 15)
   */
  static async getRecentGames(username: string, limit: number = 15): Promise<FormattedGameListItem[]> {
    try {
      const sanitized = encodeURIComponent(username.trim().toLowerCase());
      
      // 1. Get list of all monthly archives
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

      // 2. Fetch the most recent monthly archive (last entry in list)
      const latestArchiveUrl = archives[archives.length - 1];
      const gamesRes = await fetch(latestArchiveUrl, { headers: this.HEADERS });

      if (!gamesRes.ok) {
        throw new Error(`Failed to fetch games from archive ${latestArchiveUrl}`);
      }

      const { games }: { games: ChessComGameItem[] } = await gamesRes.json();
      if (!games || games.length === 0) {
        // If current month has no games yet, fallback to previous month if available
        if (archives.length > 1) {
          const prevArchiveUrl = archives[archives.length - 2];
          const prevGamesRes = await fetch(prevArchiveUrl, { headers: this.HEADERS });
          if (prevGamesRes.ok) {
            const prevData = await prevGamesRes.json();
            return this.formatAndSortGames(prevData.games, sanitized, limit);
          }
        }
        return [];
      }

      return this.formatAndSortGames(games, sanitized, limit);
    } catch (error) {
      console.error(`Error retrieving games for ${username}:`, error);
      throw error;
    }
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

    // Sort descending by end_time
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
