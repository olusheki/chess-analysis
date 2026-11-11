import { Chess } from "chess.js";

export interface ParsedUciInfo {
  depth: number;
  multipv: number;
  cp: number;
  mate?: number;
  pv: string[];
}

export interface NormalizedScore {
  cp: number;
  mate?: number;
}

/**
 * Parses a Stockfish UCI `info` line into depth, multipv, centipawns/mate, and PV UCI moves.
 * Ignores non-PV lines and aspiration bound lines (`lowerbound` / `upperbound`).
 */
export function parseUciInfoLine(line: string): ParsedUciInfo | null {
  if (!line.startsWith("info ")) return null;
  if (line.includes(" lowerbound") || line.includes(" upperbound")) return null;

  const depthMatch = line.match(/\bdepth\s+(\d+)/);
  const scoreMatch = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
  const pvMatch = line.match(/\bpv\s+(.+)$/);

  if (!depthMatch || !scoreMatch || !pvMatch) return null;

  const multipvMatch = line.match(/\bmultipv\s+(\d+)/);
  const depth = parseInt(depthMatch[1], 10);
  const multipv = multipvMatch ? parseInt(multipvMatch[1], 10) : 1;
  const scoreType = scoreMatch[1];
  const scoreVal = parseInt(scoreMatch[2], 10);
  const pv = pvMatch[1].trim().split(/\s+/).filter(Boolean);

  if (pv.length === 0) return null;

  if (scoreType === "mate") {
    const cp = scoreVal >= 0 ? 10000 : -10000;
    return {
      depth,
      multipv,
      cp,
      mate: scoreVal,
      pv,
    };
  }

  return {
    depth,
    multipv,
    cp: scoreVal,
    mate: undefined,
    pv,
  };
}

/**
 * Stockfish reports evaluations from the side-to-move's perspective.
 * Converts a raw UCI score into White's perspective (+ = White better, - = Black better).
 */
export function uciScoreToWhiteCentipawns(
  score: { cp: number; mate?: number },
  turnToMove: "w" | "b"
): NormalizedScore {
  const sign = turnToMove === "w" ? 1 : -1;
  return {
    cp: score.cp * sign,
    mate: score.mate !== undefined && score.mate !== 0 ? score.mate * sign : undefined,
  };
}

/**
 * Converts a White-perspective score into the active player's perspective
 * (+ = active player better, - = opponent better).
 */
export function uciScoreToActiveCentipawns(
  whiteScore: { cp: number; mate?: number },
  activePlayer: "w" | "b"
): NormalizedScore {
  const sign = activePlayer === "w" ? 1 : -1;
  return {
    cp: whiteScore.cp * sign,
    mate: whiteScore.mate !== undefined && whiteScore.mate !== 0 ? whiteScore.mate * sign : undefined,
  };
}

/**
 * Converts a sequence of UCI moves (e.g. ["e2e4", "e7e5"]) to SAN strings
 * starting from the provided FEN.
 */
export function uciPvToSan(fen: string, uciMoves: string[]): string[] {
  const chess = new Chess(fen);
  const sanMoves: string[] = [];

  for (const uci of uciMoves) {
    if (uci.length < 4) break;
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
    try {
      const move = chess.move({ from, to, promotion });
      if (!move) break;
      sanMoves.push(move.san);
    } catch {
      break;
    }
  }

  return sanMoves;
}

/**
 * Formats a White-perspective evaluation into a human-readable Chess.com eval label
 * (e.g., "+1.8", "-0.4", "0.0", "M3", "-M2").
 */
export function formatEvalLabel(whiteCp: number, whiteMate?: number): string {
  if (whiteMate !== undefined && whiteMate !== 0) {
    return whiteMate > 0 ? `M${whiteMate}` : `-M${Math.abs(whiteMate)}`;
  }
  const pawns = whiteCp / 100;
  if (Math.abs(pawns) < 0.05) return "0.0";
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(1)}`;
}
