/**
 * Chess.com Move Classification Engine
 * Evaluates and assigns one of 11 official Chess.com badges.
 */

import {
  calculateMoveAccuracy,
  calculateWinProbabilityDelta,
  centipawnsToWinProbability,
} from "../engine/win-probability";

export type MoveBadge =
  | "Brilliant"   // !!  #1baca6
  | "Great"       // !   #5c8bb0
  | "Best"        // ★   #96bc4b
  | "Excellent"   // ✓   #96bc4b
  | "Good"        // ✓   #99a83d
  | "Book"        // 📖  #a88a68
  | "Inaccuracy"  // ?!  #e58f2a
  | "Mistake"     // ?   #e65e2b
  | "Miss"        // X   #ca3431
  | "Blunder"     // ??  #fa412d
  | "Forced";     // ➔   #8c8883

export interface MoveClassificationInput {
  ply: number;
  moveSan: string;
  isBook: boolean;
  legalMoveCount: number;
  cpBest: number;
  cpPlayed: number;
  cpPV2?: number;          // Centipawn of 2nd best engine alternative
  mateBest?: number;
  matePlayed?: number;
  matePV2?: number;
  prevMoveOpponentDeltaWP?: number; // Previous move delta WP (to detect missed wins)
  materialSacrificed: number;      // Net points of material sacrificed (e.g. piece given up without immediate recapture)
  isBestMove: boolean;             // Whether move matches PV1
  isRecapture?: boolean;           // Capturing back on the square opponent just captured on
  isObviousFreeCapture?: boolean;  // Capturing an undefended Queen/Rook or free piece left en prise
  isKingCheckEscape?: boolean;     // King moving to escape check (not a creative sacrifice)
}

export interface ClassificationResult {
  badge: MoveBadge;
  deltaWP: number;
  accuracy: number;
  color: string;
  symbol: string;
  isBlunder: boolean;
  isKeyMoment: boolean;
}

export const BADGE_METADATA: Record<MoveBadge, { color: string; symbol: string; priority: number }> = {
  Brilliant:   { color: "#1baca6", symbol: "!!", priority: 1 },
  Great:       { color: "#5c8bb0", symbol: "!",  priority: 2 },
  Best:        { color: "#96bc4b", symbol: "★",  priority: 3 },
  Excellent:   { color: "#96bc4b", symbol: "✓",  priority: 4 },
  Good:        { color: "#99a83d", symbol: "✓",  priority: 5 },
  Book:        { color: "#a88a68", symbol: "📖", priority: 6 },
  Inaccuracy:  { color: "#e58f2a", symbol: "?!", priority: 7 },
  Mistake:     { color: "#e65e2b", symbol: "?",  priority: 8 },
  Miss:        { color: "#ca3431", symbol: "X",  priority: 9 },
  Blunder:     { color: "#fa412d", symbol: "??", priority: 10 },
  Forced:      { color: "#8c8883", symbol: "➔",  priority: 11 },
};

const KEY_MOMENT_BADGES = new Set<MoveBadge>(["Brilliant", "Great", "Miss", "Blunder", "Mistake"]);

export function classifyMove(input: MoveClassificationInput): ClassificationResult {
  const {
    isBook,
    legalMoveCount,
    cpBest,
    cpPlayed,
    cpPV2,
    mateBest,
    matePlayed,
    matePV2,
    prevMoveOpponentDeltaWP,
    materialSacrificed,
    isBestMove,
    isRecapture = false,
    isKingCheckEscape = false,
  } = input;

  // 1. Book Move Check (Opening Database match)
  if (isBook) {
    return createResult("Book", 0);
  }

  // 2. Forced Move Check (Only 1 legal move, or only PV1 escapes immediate checkmate)
  const onlyMoveEscapesMate =
    isBestMove && (mateBest === undefined || mateBest >= 0) && matePV2 === -1;
  if (legalMoveCount === 1 || onlyMoveEscapesMate) {
    return createResult("Forced", 0);
  }

  const { wpBest, wpPlayed, deltaWP } = calculateWinProbabilityDelta(
    cpBest,
    cpPlayed,
    mateBest,
    matePlayed
  );

  // 3. Brilliant Move (!!)
  // Criteria:
  // - Sacrifices significant material (>= 2 pawns or piece)
  // - Matches PV1 or negligible WP/cp drop (protecting against saturated-WP blunders at >+10 pawns)
  // - Position remains sound / competitive (wpPlayed >= 38%, allowing dynamic equalizing sacrifices like 24. Rxd4!!)
  const cpDrop =
    mateBest === undefined && matePlayed === undefined ? Math.max(0, cpBest - cpPlayed) : 0;
  const hasForcedMate = mateBest !== undefined && mateBest > 0;
  const lostMate = hasForcedMate && (matePlayed === undefined || matePlayed <= 0);
  const worsenedMate =
    lostMate || (hasForcedMate && matePlayed !== undefined && matePlayed > mateBest);
  const isMopUp =
    cpBest >= 650 &&
    !hasForcedMate &&
    cpPV2 !== undefined &&
    cpPV2 >= 450;
  const isNearBestForSac = isBestMove || (deltaWP <= 1.0 && cpDrop <= 35 && !lostMate);
  if (materialSacrificed >= 2 && isNearBestForSac && wpPlayed >= 38.0) {
    if (!worsenedMate && !isKingCheckEscape && !isMopUp) {
      return createResult("Brilliant", deltaWP);
    }
  }

  // 4. Great Move (!)
  // Criteria:
  // - Sole winning move found in a critical position (excluding trivial recaptures and obvious free-piece grabs)
  // - PV1 keeps high advantage (wpBest >= 60%)
  // - PV2 drops out of comfortable winning territory (wpPV2 < 55%) with >= 15% WP gap
  if (isBestMove && !isRecapture && !input.isObviousFreeCapture && cpPV2 !== undefined) {
    const wpPV2 = centipawnsToWinProbability(cpPV2, matePV2);
    if (wpBest >= 60.0 && wpPV2 < 55.0 && (wpBest - wpPV2 >= 15.0 || wpPV2 < 48.0)) {
      return createResult("Great", deltaWP);
    }
  }

  // 5. Best Move (★)
  if (isBestMove || deltaWP <= 0.2) {
    return createResult("Best", deltaWP);
  }

  // Guard: extreme blunders (>55% WP drop or falling into <30% lost position, including getting mated)
  // must always be classified as Blunder rather than Miss even if the opponent previously blundered.
  const isSevereBlunder = deltaWP > 55.0 || wpPlayed < 30.0;

  // 6. Miss (X)
  // Opponent blundered on previous turn giving a big tactical opportunity,
  // but player failed to punish it while avoiding a total collapse.
  if (
    !isSevereBlunder &&
    prevMoveOpponentDeltaWP !== undefined &&
    prevMoveOpponentDeltaWP >= 18.0 &&
    deltaWP >= 15.0 &&
    wpBest >= 55.0
  ) {
    return createResult("Miss", deltaWP);
  }

  // 7. Blunder (??)
  // Dramatic loss of win probability (> 25%) or hanging checkmate/decisive piece
  if (deltaWP > 25.0) {
    return createResult("Blunder", deltaWP);
  }

  // 8. Mistake (?)
  // Loss between 12% and 25% WP
  if (deltaWP > 12.0) {
    return createResult("Mistake", deltaWP);
  }

  // 9. Inaccuracy (?!)
  // Loss between 5% and 12% WP
  if (deltaWP > 5.0) {
    return createResult("Inaccuracy", deltaWP);
  }

  // 10. Good
  if (deltaWP > 2.0) {
    return createResult("Good", deltaWP);
  }

  // 11. Excellent
  return createResult("Excellent", deltaWP);
}

function createResult(badge: MoveBadge, deltaWP: number): ClassificationResult {
  const meta = BADGE_METADATA[badge];

  return {
    badge,
    deltaWP,
    accuracy: calculateMoveAccuracy(deltaWP),
    color: meta.color,
    symbol: meta.symbol,
    isBlunder: badge === "Blunder" || badge === "Miss",
    isKeyMoment: KEY_MOMENT_BADGES.has(badge),
  };
}
