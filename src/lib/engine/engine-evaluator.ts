import { Chess } from "chess.js";
import { parseUciInfoLine, uciPvToSan, uciScoreToWhiteCentipawns } from "./uci-parser";

export interface PvLine {
  multipv: number;
  cp: number; // White-perspective centipawns
  mate?: number; // White-perspective mate (+ = White mates, - = Black mates)
  pvUci: string[];
  pvSan: string[];
}

export interface PositionEval {
  fen: string;
  depth: number;
  bestMoveUci: string;
  bestMoveSan: string;
  whiteCp: number; // White-perspective centipawns of PV1
  whiteMate?: number; // White-perspective mate of PV1
  lines: PvLine[];
}

export interface ChessEngine {
  evaluatePosition(fen: string, depth: number, multiPv?: number): Promise<PositionEval>;
  dispose(): void;
}

/**
 * Checks if a FEN is already terminal (checkmate, stalemate, insufficient material, etc.)
 * so Stockfish does not need to search zero-legal-move positions.
 */
export function evaluateTerminalPosition(fen: string): PositionEval | null {
  const chess = new Chess(fen);
  if (!chess.isGameOver()) return null;

  if (chess.isCheckmate()) {
    // Side to move is checkmated, so the other side won
    const winnerIsWhite = chess.turn() === "b";
    const whiteCp = winnerIsWhite ? 10000 : -10000;
    const whiteMate = winnerIsWhite ? 1 : -1;
    return {
      fen,
      depth: 99,
      bestMoveUci: "",
      bestMoveSan: "",
      whiteCp,
      whiteMate,
      lines: [
        {
          multipv: 1,
          cp: whiteCp,
          mate: whiteMate,
          pvUci: [],
          pvSan: [],
        },
      ],
    };
  }

  // Stalemate, insufficient material, threefold repetition, or 50-move draw
  return {
    fen,
    depth: 99,
    bestMoveUci: "",
    bestMoveSan: "",
    whiteCp: 0,
    lines: [
      {
        multipv: 1,
        cp: 0,
        pvUci: [],
        pvSan: [],
      },
    ],
  };
}

/**
 * Parses accumulated Stockfish UCI lines for a single `go` search into a normalized PositionEval.
 */
export function buildPositionEvalFromUciLines(
  fen: string,
  infoLines: string[],
  bestMoveLine: string,
  requestedDepth: number
): PositionEval {
  const chess = new Chess(fen);
  const turn = chess.turn();

  const pvByIndex = new Map<number, { depth: number; cp: number; mate?: number; pvUci: string[] }>();

  for (const line of infoLines) {
    const parsed = parseUciInfoLine(line);
    if (!parsed) continue;
    const normalized = uciScoreToWhiteCentipawns({ cp: parsed.cp, mate: parsed.mate }, turn);
    const existing = pvByIndex.get(parsed.multipv);
    if (!existing || parsed.depth >= existing.depth) {
      pvByIndex.set(parsed.multipv, {
        depth: parsed.depth,
        cp: normalized.cp,
        mate: normalized.mate,
        pvUci: parsed.pv,
      });
    }
  }

  const bestMatch = bestMoveLine.match(/^bestmove\s+(\S+)/);
  const bestMoveUci = bestMatch && bestMatch[1] !== "(none)" ? bestMatch[1] : "";

  const sortedLines: PvLine[] = Array.from(pvByIndex.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([multipv, data]) => ({
      multipv,
      cp: data.cp,
      mate: data.mate,
      pvUci: data.pvUci,
      pvSan: uciPvToSan(fen, data.pvUci),
    }));

  if (sortedLines.length === 0 && bestMoveUci) {
    sortedLines.push({
      multipv: 1,
      cp: 0,
      pvUci: [bestMoveUci],
      pvSan: uciPvToSan(fen, [bestMoveUci]),
    });
  }

  const primary = sortedLines[0];
  const resolvedBestUci = bestMoveUci || primary?.pvUci[0] || "";
  const bestMoveSan = resolvedBestUci ? uciPvToSan(fen, [resolvedBestUci])[0] ?? resolvedBestUci : "";

  return {
    fen,
    depth: primary ? pvByIndex.get(1)?.depth ?? requestedDepth : requestedDepth,
    bestMoveUci: resolvedBestUci,
    bestMoveSan,
    whiteCp: primary?.cp ?? 0,
    whiteMate: primary?.mate,
    lines: sortedLines,
  };
}
