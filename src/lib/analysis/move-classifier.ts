/**
 * Chess.com Move Classification Engine
 * Evaluates and assigns one of 11 official Chess.com badges.
 */

import { calculateWinProbabilityDelta, centipawnsToWinProbability } from "../engine/win-probability";

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
  } = input;

  // 1. Book Move Check (Opening Database match)
  if (isBook) {
    return createResult("Book", 0);
  }

  // 2. Forced Move Check (Only 1 legal move, or only PV1 escapes immediate checkmate)
  const onlyMoveEscapesMate =
    isBestMove && (mateBest === undefined || mateBest > 0) && matePV2 === -1;
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
  const lostMate =
    mateBest !== undefined && mateBest > 0 && (matePlayed === undefined || matePlayed <= 0);
  const isNearBestForSac = isBestMove || (deltaWP <= 1.0 && cpDrop <= 35 && !lostMate);
  if (materialSacrificed >= 2 && isNearBestForSac && wpPlayed >= 38.0) {
    return createResult("Brilliant", deltaWP, true);
  }

  // 4. Great Move (!)
  // Criteria:
  // - Sole winning move found in a critical position
  // - PV1 keeps high advantage (wpBest >= 60%)
  // - PV2 drops out of comfortable winning territory (wpPV2 < 55%) with >= 15% WP gap
  if (isBestMove && cpPV2 !== undefined) {
    const wpPV2 = centipawnsToWinProbability(cpPV2, matePV2);
    if (wpBest >= 60.0 && wpPV2 < 55.0 && (wpBest - wpPV2 >= 15.0 || wpPV2 < 48.0)) {
      return createResult("Great", deltaWP, true);
    }
  }

  // 5. Best Move (★)
  if (isBestMove || deltaWP <= 0.2) {
    return createResult("Best", deltaWP);
  }

  // Guard: extreme blunders (>55% WP drop, falling into <30% lost position, or blundering mate)
  // must always be classified as Blunder rather than Miss even if the opponent previously blundered.
  const isSevereBlunder =
    deltaWP > 25.0 &&
    (deltaWP > 55.0 ||
      wpPlayed < 30.0 ||
      (matePlayed !== undefined && matePlayed < 0 && (mateBest === undefined || mateBest >= 0)));

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
    return createResult("Miss", deltaWP, true);
  }

  // 7. Blunder (??)
  // Dramatic loss of win probability (>= 25%) or hanging checkmate/decisive piece
  if (deltaWP > 25.0) {
    return createResult("Blunder", deltaWP, true);
  }

  // 8. Mistake (?)
  // Loss between 12% and 25% WP
  if (deltaWP > 12.0) {
    return createResult("Mistake", deltaWP, true);
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

function createResult(badge: MoveBadge, deltaWP: number, isKeyMoment: boolean = false): ClassificationResult {
  const meta = BADGE_METADATA[badge];
  const rawAccuracy = 103.1668 * Math.exp(-0.04354 * deltaWP) - 3.1669;
  const accuracy = Math.min(100.0, Math.max(0.0, parseFloat(rawAccuracy.toFixed(1))));

  return {
    badge,
    deltaWP,
    accuracy,
    color: meta.color,
    symbol: meta.symbol,
    isBlunder: badge === "Blunder" || badge === "Miss",
    isKeyMoment: isKeyMoment || badge === "Brilliant" || badge === "Great",
  };
}
