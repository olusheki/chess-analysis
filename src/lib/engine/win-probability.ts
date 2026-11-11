/**
 * Mathematical Engine for Centipawn to Win Probability Conversion & CAPS2 Accuracy
 * Implements Chess.com's calibrated logistic sigmoid model and CAPS2 algorithm.
 */

export interface MoveEvalData {
  ply: number;
  cpBefore: number;       // Centipawn eval before move (from perspective of active player)
  cpAfterPlayed: number;  // Centipawn eval after played move
  cpAfterBest: number;    // Centipawn eval of engine's best move
  isMateBefore?: boolean;
  mateBefore?: number;
  isMatePlayed?: boolean;
  matePlayed?: number;
  isMateBest?: boolean;
  mateBest?: number;
}

/**
 * Converts raw centipawns to Win Probability (0.0% to 100.0%)
 * Parameterized to mirror Chess.com's CAPS2 sigmoid curve.
 *
 * WP(cp) = 100 / (1 + 10^(-0.004 * cp))
 */
export function centipawnsToWinProbability(cp: number, mate?: number): number {
  if (mate !== undefined && mate !== 0) {
    if (mate > 0) {
      // +M1..+M3 = 100.0%, longer forced mates decay gently above 99.1%
      if (mate <= 3) return 100.0;
      return Math.max(99.1, 99.9 - mate * 0.05);
    } else {
      // -M1..-M3 = 0.0%, longer forced mates against player stay below 0.9%
      const absMate = Math.abs(mate);
      if (absMate <= 3) return 0.0;
      return Math.min(0.9, 0.1 + absMate * 0.05);
    }
  }

  // Logistic Sigmoid
  const wp = 100 / (1 + Math.pow(10, -0.004 * cp));
  return Math.min(100, Math.max(0, wp));
}

/**
 * Computes Win Probability Delta for a move:
 * ΔWP = WP(best_move) - WP(played_move)
 * Note: ΔWP is always >= 0.
 */
export function calculateWinProbabilityDelta(
  cpBest: number,
  cpPlayed: number,
  mateBest?: number,
  matePlayed?: number
): { wpBest: number; wpPlayed: number; deltaWP: number } {
  const wpBest = centipawnsToWinProbability(cpBest, mateBest);
  const wpPlayed = centipawnsToWinProbability(cpPlayed, matePlayed);

  // Converting a finite centipawn lead into a forced mate is never a win-probability loss
  if (matePlayed !== undefined && matePlayed > 0 && mateBest === undefined) {
    return { wpBest, wpPlayed, deltaWP: 0 };
  }

  let deltaWP = Math.max(0, wpBest - wpPlayed);

  // Penalize missing an immediate forced mate (M1..M3) when settling for a significantly longer mate or non-mate line
  if (
    mateBest !== undefined &&
    mateBest > 0 &&
    mateBest <= 3 &&
    (matePlayed === undefined || matePlayed <= 0 || matePlayed > mateBest + 3)
  ) {
    const delayPenalty =
      matePlayed === undefined || matePlayed <= 0
        ? 12.5
        : Math.min(12.5, (matePlayed - mateBest) * 1.8);
    deltaWP = Math.max(deltaWP, delayPenalty);
  }

  return { wpBest, wpPlayed, deltaWP };
}

/**
 * Calculates CAPS2 Accuracy percentage for an individual move based on ΔWP:
 * Accuracy = clamp(103.1668 * e^(-0.04354 * ΔWP) - 3.1669, 0, 100)
 */
export function calculateMoveAccuracy(deltaWP: number): number {
  if (deltaWP <= 0.001) return 100.0;
  const raw = 103.1668 * Math.exp(-0.04354 * deltaWP) - 3.1669;
  return Math.min(100.0, Math.max(0.0, parseFloat(raw.toFixed(1))));
}

/**
 * Computes overall game accuracy across all evaluated moves.
 * Moves made in critical/competitive (~50% WP) positions carry higher weight,
 * damped in decided (>95%/<5%) positions and blended with floored harmonic mean.
 */
export function calculateOverallGameAccuracy(
  moves: { deltaWP: number; wpBest: number; isBook?: boolean; isForced?: boolean }[]
): number {
  const nonTrivialMoves = moves.filter(m => !m.isBook && !m.isForced);
  if (nonTrivialMoves.length === 0) return 100.0;

  let totalWeightedAccuracy = 0;
  let totalWeight = 0;
  let weightedInvSum = 0;

  for (const move of nonTrivialMoves) {
    // Dynamic leverage weighting applies symmetrically to BOTH arithmetic and harmonic means
    const competitiveness = 1.0 - Math.abs((move.wpBest - 50) / 50);
    const leverageWeight = 0.25 + 1.5 * Math.pow(Math.max(0, competitiveness), 0.6);
    const moveAccuracy = calculateMoveAccuracy(move.deltaWP);

    totalWeightedAccuracy += moveAccuracy * leverageWeight;
    totalWeight += leverageWeight;
    // Calibrated harmonic floor (8.0) prevents 1 blunder out of 16 moves from collapsing accuracy
    weightedInvSum += leverageWeight / Math.max(8.0, moveAccuracy);
  }

  const weightedCompMean = totalWeightedAccuracy / totalWeight;
  const weightedHarmonicMean = totalWeight / weightedInvSum;
  const blended = 0.4 * weightedCompMean + 0.6 * weightedHarmonicMean;

  return parseFloat(Math.min(100, Math.max(0, blended)).toFixed(1));
}

export interface PerformanceRatingContext {
  playerElo?: number;
  opponentElo?: number;
  resultScore?: number; // 1 = win, 0.5 = draw, 0 = loss
}

/**
 * Estimated Performance Rating (Elo) based on CAPS2 accuracy, blunders/mistakes,
 * and anchored to PGN player/opponent Elo ratings when available.
 */
export function estimatePerformanceRating(
  accuracy: number,
  blunders: number,
  mistakes: number,
  context?: PerformanceRatingContext
): number {
  const playerElo =
    context?.playerElo && context.playerElo > 0 ? context.playerElo : undefined;
  const opponentElo =
    context?.opponentElo && context.opponentElo > 0 ? context.opponentElo : undefined;

  if (playerElo !== undefined || opponentElo !== undefined) {
    const score = context?.resultScore ?? 0.5;
    let anchor: number;
    if (playerElo !== undefined && opponentElo !== undefined) {
      // Bound upward pull from huge rating mismatches unless the underdog scored >= 0.5
      const maxUpwardGap = score >= 0.5 ? 600 : 350;
      const boundedOpp = playerElo + Math.max(-400, Math.min(maxUpwardGap, opponentElo - playerElo));
      anchor = 0.75 * playerElo + 0.25 * boundedOpp;
    } else {
      anchor = (opponentElo ?? playerElo)!;
    }

    const expectedAcc = Math.min(90, Math.max(32, 30 + anchor / 40));
    const resultAdjustment =
      context?.resultScore !== undefined ? (context.resultScore - 0.5) * 90 : 0;
    // Accuracy already penalizes blunders/mistakes; keep blunder term as a mild tiebreaker
    const rawDelta =
      (accuracy - expectedAcc) * 9 - blunders * 6 - mistakes * 3 + resultAdjustment;
    const clampedDelta = Math.max(-220, Math.min(350, rawDelta));
    return Math.max(100, Math.min(3200, Math.round(anchor + clampedDelta)));
  }

  const baseElo = 200 + accuracy * 26.5;
  const penalty = blunders * 110 + mistakes * 40;
  const estimated = Math.max(100, Math.min(2900, Math.round(baseElo - penalty)));
  return estimated;
}
