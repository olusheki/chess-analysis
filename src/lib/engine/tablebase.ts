/**
 * Lichess Syzygy 7-Man Endgame Tablebase Client
 * Provides exact WDL / DTZ / DTM lookup for <= 7-piece positions without castling rights.
 */

export type TablebaseCategory =
  | "win"
  | "cursed-win"
  | "draw"
  | "blessed-loss"
  | "loss"
  | "unknown";

export type TablebaseWhiteVerdict =
  | "White Wins"
  | "Black Wins"
  | "Draw"
  | "Cursed Win"
  | "Blessed Loss"
  | "Unknown";

export interface TablebaseMove {
  uci: string;
  san: string;
  opponentCategory: TablebaseCategory;
  outcomeForMover: TablebaseCategory;
  dtz: number | null;
  dtm: number | null;
  zeroing: boolean;
  checkmate: boolean;
  stalemate: boolean;
}

export interface TablebaseResult {
  fen: string;
  turn: "w" | "b";
  category: TablebaseCategory;
  dtz: number | null;
  dtm: number | null;
  checkmate: boolean;
  stalemate: boolean;
  insufficientMaterial: boolean;
  pieceCount: number;
  whiteVerdict: TablebaseWhiteVerdict;
  headline: string;
  bestMoveSan?: string;
  bestMoveUci?: string;
  moves: TablebaseMove[];
}

interface RawTablebaseMove {
  uci?: unknown;
  san?: unknown;
  category?: unknown;
  dtz?: unknown;
  dtm?: unknown;
  zeroing?: unknown;
  checkmate?: unknown;
  stalemate?: unknown;
}

interface RawTablebaseResponse {
  category?: unknown;
  dtz?: unknown;
  dtm?: unknown;
  checkmate?: unknown;
  stalemate?: unknown;
  insufficient_material?: unknown;
  moves?: unknown;
}

const VALID_CATEGORIES = new Set<TablebaseCategory>([
  "win",
  "cursed-win",
  "draw",
  "blessed-loss",
  "loss",
  "unknown",
]);

const MAX_CACHE_ENTRIES = 250;
const tablebaseCache = new Map<string, TablebaseResult>();

/** Clears the in-memory Syzygy tablebase cache. */
export function clearTablebaseCache(): void {
  tablebaseCache.clear();
}

function normalizeCategory(raw: unknown): TablebaseCategory {
  return typeof raw === "string" && VALID_CATEGORIES.has(raw as TablebaseCategory)
    ? (raw as TablebaseCategory)
    : "unknown";
}

function normalizeOptionalNumber(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

/** Counts total pieces on the board in a FEN string; returns 64 when FEN syntax is invalid. */
export function countPiecesInFen(fen: string): number {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) return 64;
  const ranks = parts[0].split("/");
  if (ranks.length !== 8) return 64;

  let count = 0;
  for (const rank of ranks) {
    for (const ch of rank) {
      if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z")) {
        count += 1;
      } else if (ch < "1" || ch > "8") {
        return 64;
      }
    }
  }
  return count;
}

/** Returns true only when FEN has 2..7 pieces and no remaining castling rights. */
export function isTablebaseEligible(fen: string): boolean {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) return false;
  if (parts[1] !== "w" && parts[1] !== "b") return false;
  if (parts[2] !== "-") return false;
  const count = countPiecesInFen(fen);
  return count >= 2 && count <= 7;
}

function invertTablebaseCategory(category: TablebaseCategory): TablebaseCategory {
  switch (category) {
    case "win":
      return "loss";
    case "loss":
      return "win";
    case "cursed-win":
      return "blessed-loss";
    case "blessed-loss":
      return "cursed-win";
    case "draw":
      return "draw";
    default:
      return "unknown";
  }
}

function resolveWhiteVerdict(
  category: TablebaseCategory,
  turn: "w" | "b"
): TablebaseWhiteVerdict {
  if (category === "win") return turn === "w" ? "White Wins" : "Black Wins";
  if (category === "loss") return turn === "w" ? "Black Wins" : "White Wins";
  if (category === "draw") return "Draw";
  if (category === "cursed-win") return "Cursed Win";
  if (category === "blessed-loss") return "Blessed Loss";
  return "Unknown";
}

function buildHeadline(
  whiteVerdict: TablebaseWhiteVerdict,
  dtz: number | null,
  dtm: number | null,
  checkmate: boolean,
  stalemate: boolean
): string {
  if (checkmate) return `Syzygy 7-Man: Checkmate (${whiteVerdict})`;
  if (stalemate) return "Syzygy 7-Man: Stalemate (Draw)";

  const distanceParts: string[] = [];
  if (dtm !== null && dtm !== 0) {
    distanceParts.push(`DTM ${Math.abs(dtm)}`);
  }
  if (dtz !== null && dtz !== 0) {
    distanceParts.push(`DTZ ${Math.abs(dtz)}`);
  }

  const suffix = distanceParts.length > 0 ? ` (${distanceParts.join(" · ")})` : "";
  return `Syzygy 7-Man: ${whiteVerdict}${suffix}`;
}

/** Converts a normalized Syzygy tablebase result into White-perspective centipawns/mate. */
export function tablebaseToWhiteEval(result: TablebaseResult): {
  whiteCp: number;
  whiteMate?: number;
} {
  if (result.stalemate || result.insufficientMaterial) {
    return { whiteCp: 0 };
  }

  if (result.checkmate) {
    const winnerIsWhite = result.turn === "b";
    return { whiteCp: winnerIsWhite ? 10000 : -10000, whiteMate: winnerIsWhite ? 1 : -1 };
  }

  if (result.whiteVerdict === "White Wins" || result.whiteVerdict === "Black Wins") {
    const sign = result.whiteVerdict === "White Wins" ? 1 : -1;
    if (result.dtm !== null && result.dtm !== 0) {
      const mateInMoves = Math.max(1, Math.ceil(Math.abs(result.dtm) / 2));
      return { whiteCp: sign * 10000, whiteMate: sign * mateInMoves };
    }
    return { whiteCp: sign * 2500 };
  }

  return { whiteCp: 0 };
}

/** Parses raw Lichess Syzygy JSON into a strongly typed TablebaseResult. */
export function parseTablebaseResponse(
  fen: string,
  raw: RawTablebaseResponse
): TablebaseResult {
  const parts = fen.trim().split(/\s+/);
  const turn: "w" | "b" = parts[1] === "b" ? "b" : "w";
  const category = normalizeCategory(raw.category);
  const dtz = normalizeOptionalNumber(raw.dtz);
  const dtm = normalizeOptionalNumber(raw.dtm);
  const checkmate = Boolean(raw.checkmate);
  const stalemate = Boolean(raw.stalemate);
  const insufficientMaterial = Boolean(raw.insufficient_material);
  const whiteVerdict = resolveWhiteVerdict(category, turn);

  const rawMoves = Array.isArray(raw.moves) ? (raw.moves as RawTablebaseMove[]) : [];
  const moves: TablebaseMove[] = rawMoves
    .filter((m) => typeof m.uci === "string" && typeof m.san === "string")
    .map((m) => {
      const opponentCategory = normalizeCategory(m.category);
      return {
        uci: m.uci as string,
        san: m.san as string,
        opponentCategory,
        outcomeForMover: invertTablebaseCategory(opponentCategory),
        dtz: normalizeOptionalNumber(m.dtz),
        dtm: normalizeOptionalNumber(m.dtm),
        zeroing: Boolean(m.zeroing),
        checkmate: Boolean(m.checkmate),
        stalemate: Boolean(m.stalemate),
      };
    });

  return {
    fen,
    turn,
    category,
    dtz,
    dtm,
    checkmate,
    stalemate,
    insufficientMaterial,
    pieceCount: countPiecesInFen(fen),
    whiteVerdict,
    headline: buildHeadline(whiteVerdict, dtz, dtm, checkmate, stalemate),
    bestMoveSan: moves[0]?.san,
    bestMoveUci: moves[0]?.uci,
    moves,
  };
}

/**
 * Probes the public Lichess Syzygy 7-man tablebase for eligible positions (<= 7 pieces, no castling).
 * Returns null gracefully when position is ineligible, offline, timed out, or unavailable.
 */
export async function querySyzygyTablebase(
  fen: string,
  options?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<TablebaseResult | null> {
  const trimmedFen = fen.trim();
  if (options?.signal?.aborted) return null;
  if (!isTablebaseEligible(trimmedFen)) return null;

  const cached = tablebaseCache.get(trimmedFen);
  if (cached) return cached;

  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 2500;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const externalSignal = options?.signal;
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

  try {
    const url = `https://tablebase.lichess.ovh/standard?fen=${encodeURIComponent(trimmedFen)}`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;

    const raw = (await response.json()) as RawTablebaseResponse;
    const parsed = parseTablebaseResponse(trimmedFen, raw);

    if (tablebaseCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = tablebaseCache.keys().next().value;
      if (oldestKey !== undefined) tablebaseCache.delete(oldestKey);
    }
    tablebaseCache.set(trimmedFen, parsed);
    return parsed;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}
