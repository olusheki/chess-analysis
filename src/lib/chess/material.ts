import { Chess, PieceSymbol } from "chess.js";

const PIECE_VALUES: Record<Exclude<PieceSymbol, "k">, number> = {
  q: 9,
  r: 5,
  b: 3,
  n: 3,
  p: 1,
};

const CAPTURE_DISPLAY_ORDER: Array<Exclude<PieceSymbol, "k">> = ["q", "r", "b", "n", "p"];

export interface CapturedPieceInfo {
  type: Exclude<PieceSymbol, "k">;
  color: "w" | "b";
}

export interface CapturedMaterialSummary {
  whiteCaptured: CapturedPieceInfo[]; // Black pieces captured by White
  blackCaptured: CapturedPieceInfo[]; // White pieces captured by Black
  whiteAdvantage: number;
  blackAdvantage: number;
}

const STANDARD_COUNTS: Record<"w" | "b", Record<Exclude<PieceSymbol, "k">, number>> = {
  w: { q: 1, r: 2, b: 2, n: 2, p: 8 },
  b: { q: 1, r: 2, b: 2, n: 2, p: 8 },
};

function countBoardPieces(fen?: string): Record<"w" | "b", Record<Exclude<PieceSymbol, "k">, number>> {
  const counts: Record<"w" | "b", Record<Exclude<PieceSymbol, "k">, number>> = {
    w: { q: 0, r: 0, b: 0, n: 0, p: 0 },
    b: { q: 0, r: 0, b: 0, n: 0, p: 0 },
  };
  if (!fen) {
    return {
      w: { ...STANDARD_COUNTS.w },
      b: { ...STANDARD_COUNTS.b },
    };
  }
  try {
    const chess = new Chess(fen);
    for (const row of chess.board()) {
      for (const sq of row) {
        if (sq && sq.type !== "k") {
          counts[sq.color][sq.type]++;
        }
      }
    }
    return counts;
  } catch {
    return {
      w: { ...STANDARD_COUNTS.w },
      b: { ...STANDARD_COUNTS.b },
    };
  }
}

function sumMaterial(counts: Record<Exclude<PieceSymbol, "k">, number>): number {
  return CAPTURE_DISPLAY_ORDER.reduce((sum, type) => sum + counts[type] * PIECE_VALUES[type], 0);
}

/**
 * Computes captured pieces and net material advantage for both sides
 * relative to baselineFen (defaulting to standard starting setup).
 */
export function computeCapturedMaterial(
  currentFen: string,
  baselineFen?: string
): CapturedMaterialSummary {
  const baseline = countBoardPieces(baselineFen);
  const current = countBoardPieces(currentFen);

  const whiteCaptured: CapturedPieceInfo[] = [];
  const blackCaptured: CapturedPieceInfo[] = [];

  for (const type of CAPTURE_DISPLAY_ORDER) {
    const blackLost = Math.max(0, baseline.b[type] - current.b[type]);
    for (let i = 0; i < blackLost; i++) {
      whiteCaptured.push({ type, color: "b" });
    }
    const whiteLost = Math.max(0, baseline.w[type] - current.w[type]);
    for (let i = 0; i < whiteLost; i++) {
      blackCaptured.push({ type, color: "w" });
    }
  }

  const diff = sumMaterial(current.w) - sumMaterial(current.b);
  return {
    whiteCaptured,
    blackCaptured,
    whiteAdvantage: diff > 0 ? diff : 0,
    blackAdvantage: diff < 0 ? -diff : 0,
  };
}
