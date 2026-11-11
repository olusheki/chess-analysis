import { Chess } from "chess.js";
import ecoOpeningsRaw from "@/data/eco-openings.json";

export interface OpeningMatch {
  eco: string;
  name: string;
  moves: string;
  fenKey: string;
}

export interface GameOpeningAnalysis {
  opening: OpeningMatch | null;
  bookPlies: number;
  outOfBookPly: number | null;
  outOfBookMoveNumber: number | null;
  plyIsBook: boolean[];
  plyOpenings: (OpeningMatch | null)[];
  insight: string;
}

type CompactEcoEntry = [eco: string, name: string, moves: string];

const ecoMap = ecoOpeningsRaw as unknown as Record<string, CompactEcoEntry>;

/**
 * Normalizes a FEN string to its position + turn + castling + en-passant key
 * so transpositions across different move orders resolve to the same entry.
 */
export function normalizeFenKey(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 4).join(" ");
}

/**
 * Looks up a single FEN position in the offline ECO opening book.
 */
export function lookupOpeningByFen(fen: string): OpeningMatch | null {
  const parts = fen.trim().split(/\s+/);
  const fenKey = parts.slice(0, 4).join(" ");
  let entry = ecoMap[fenKey];
  let matchedKey = fenKey;

  // Fallback for legacy FENs that include pseudo-en-passant square (e.g. e3 after 1.e4)
  if (!entry && parts.length >= 4 && parts[3] !== "-") {
    const noEpKey = `${parts[0]} ${parts[1]} ${parts[2]} -`;
    if (ecoMap[noEpKey]) {
      entry = ecoMap[noEpKey];
      matchedKey = noEpKey;
    }
  }

  if (!entry) return null;
  return {
    eco: entry[0],
    name: entry[1],
    moves: entry[2],
    fenKey: matchedKey,
  };
}

const STANDARD_START_FEN_KEY = normalizeFenKey(
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
);

/**
 * Classifies all moves of a game against the ECO opening database,
 * detecting transpositions and the exact ply where the game exits book theory.
 */
export function classifyGameOpenings(
  movesSan: string[],
  maxBookPly: number = 30,
  startFen?: string
): GameOpeningAnalysis {
  if (startFen && normalizeFenKey(startFen) !== STANDARD_START_FEN_KEY) {
    return {
      opening: null,
      bookPlies: 0,
      outOfBookPly: movesSan.length > 0 ? 1 : null,
      outOfBookMoveNumber: movesSan.length > 0 ? 1 : null,
      plyIsBook: movesSan.map(() => false),
      plyOpenings: movesSan.map(() => null),
      insight:
        "Custom starting position; opening book classification applies only from the standard initial setup.",
    };
  }

  const chess = new Chess();
  const plyIsBook: boolean[] = [];
  const plyOpenings: (OpeningMatch | null)[] = [];

  let stillInBook = true;
  let lastMatchedOpening: OpeningMatch | null = null;
  let bookPlies = 0;
  let outOfBookPly: number | null = null;

  for (let i = 0; i < movesSan.length; i++) {
    let move;
    try {
      move = chess.move(movesSan[i]);
    } catch {
      move = null;
    }
    if (!move) {
      plyIsBook.push(false);
      plyOpenings.push(null);
      if (stillInBook) {
        stillInBook = false;
        outOfBookPly = i + 1;
      }
      continue;
    }

    if (stillInBook && i < maxBookPly) {
      const match = lookupOpeningByFen(chess.fen());
      if (match) {
        plyIsBook.push(true);
        plyOpenings.push(match);
        lastMatchedOpening = match;
        bookPlies = i + 1;
      } else {
        stillInBook = false;
        outOfBookPly = i + 1;
        plyIsBook.push(false);
        plyOpenings.push(null);
      }
    } else {
      if (stillInBook) {
        stillInBook = false;
        outOfBookPly = i + 1;
      }
      plyIsBook.push(false);
      plyOpenings.push(null);
    }
  }

  const insight = lastMatchedOpening
    ? getOpeningInsight(lastMatchedOpening.eco, lastMatchedOpening.name)
    : "An unusual opening departure right away; focus on central pawns, rapid minor piece development, and king safety.";

  return {
    opening: lastMatchedOpening,
    bookPlies,
    outOfBookPly,
    outOfBookMoveNumber: outOfBookPly ? Math.ceil(outOfBookPly / 2) : null,
    plyIsBook,
    plyOpenings,
    insight,
  };
}

/**
 * Searches ECO openings by name or ECO code.
 */
export function searchOpenings(query: string, limit: number = 20): OpeningMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const matches: OpeningMatch[] = [];
  for (const [fenKey, entry] of Object.entries(ecoMap)) {
    const [eco, name, moves] = entry;
    if (eco.toLowerCase().includes(q) || name.toLowerCase().includes(q)) {
      matches.push({ eco, name, moves, fenKey });
      if (matches.length >= limit) break;
    }
  }
  return matches;
}

const OPENING_INSIGHTS: { pattern: RegExp; insight: string }[] = [
  {
    pattern: /Italian/i,
    insight:
      "White develops the bishop to an active diagonal targeting the vulnerable f7 square, preparing kingside castling while contesting the center.",
  },
  {
    pattern: /Ruy Lopez|Spanish/i,
    insight:
      "White puts immediate pressure on Black's knight on c6, indirectly challenging the e5 pawn and steering toward rich strategic maneuvering.",
  },
  {
    pattern: /Sicilian/i,
    insight:
      "Black fights for the center asymmetrically with a flank pawn, creating imbalanced play with strong counterplay along the half-open c-file.",
  },
  {
    pattern: /French/i,
    insight:
      "Black challenges White's e4 pawn from a solid pawn foundation on e6 and d5, accepting a temporarily cramped light-squared bishop for counterattacks on the pawn chain.",
  },
  {
    pattern: /Caro-Kann/i,
    insight:
      "Black prepares d5 with c6 to maintain a rock-solid pawn structure while keeping the light-squared bishop free to develop outside the chain.",
  },
  {
    pattern: /Pirc|Modern/i,
    insight:
      "Black adopts a hypermodern setup, letting White build a broad pawn center before striking at it with ...c5, ...e5, and fianchettoed bishop pressure.",
  },
  {
    pattern: /Queen's Gambit|QGD/i,
    insight:
      "White offers a wing pawn to deflect Black from the center, aiming to construct a commanding central pawn duo and exert pressure along the c-file.",
  },
  {
    pattern: /Slav/i,
    insight:
      "Black reinforces d5 with c6, maintaining strong central presence while leaving the c8 bishop unobstructed.",
  },
  {
    pattern: /King's Indian/i,
    insight:
      "Black concedes early central space to launch a dynamic kingside pawn storm with ...f5 while the g7 bishop rakes across the long diagonal.",
  },
  {
    pattern: /Nimzo-Indian/i,
    insight:
      "Black pins the c3 knight to control the vital e4 square and fight for dark-square dominance before committing the central pawns.",
  },
  {
    pattern: /Catalan/i,
    insight:
      "White pairs the Queen's Gambit with a kingside fianchetto, exerting relentless long-diagonal pressure on Black's queenside.",
  },
  {
    pattern: /English/i,
    insight:
      "White controls d5 from the flank with 1. c4, keeping flexible transposition options into Queen's Gambit or reversed Sicilian structures.",
  },
  {
    pattern: /London/i,
    insight:
      "White builds a solid triangular pawn pyramid with d4, e3, and c3 while placing the dark-squared bishop actively on f4.",
  },
  {
    pattern: /Scotch/i,
    insight:
      "White immediately opens the center with d4, trading central pawns for open lines and rapid piece activity.",
  },
  {
    pattern: /Philidor/i,
    insight:
      "Black supports e5 solidly with d6, prioritizing structural stability while accepting slightly less space in the opening.",
  },
];

/**
 * Returns a pedagogical explanation of the opening's core strategic themes.
 */
export function getOpeningInsight(eco: string, name: string): string {
  for (const rule of OPENING_INSIGHTS) {
    if (rule.pattern.test(name)) {
      return rule.insight;
    }
  }

  const family = eco.charAt(0).toUpperCase();
  switch (family) {
    case "A":
      return `In the ${name} (${eco}), both sides maneuver in flank or irregular structures, competing for long-term central and diagonal control.`;
    case "B":
      return `In the ${name} (${eco}), Black responds asymmetrically to 1. e4, inviting sharp tactical imbalances and piece counterplay.`;
    case "C":
      return `In the ${name} (${eco}), classical open-game principles apply: rapid piece development, open files, and contesting the central squares.`;
    case "D":
      return `In the ${name} (${eco}), both players contest the d4/d5 center directly, balancing pawn breaks with queen-side space.`;
    case "E":
      return `In the ${name} (${eco}), hypermodern Indian defense themes emerge as Black targets White's center with piece pressure before striking with pawns.`;
    default:
      return `Standard opening theory in the ${name}, aiming for harmonious piece development and king safety.`;
  }
}
