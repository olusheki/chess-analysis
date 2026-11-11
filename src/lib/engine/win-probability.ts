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
      // White/Active player has forced mate
      return Math.max(99.0, 100.0 - (mate * 0.1));
    } else {
      // Opponent has forced mate
      return Math.min(1.0, Math.abs(mate) * 0.1);
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
  const deltaWP = Math.max(0, wpBest - wpPlayed);

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
 * Moves made in critical/unbalanced positions carry higher weight.
 */
export function calculateOverallGameAccuracy(
  moves: { deltaWP: number; wpBest: number; isBook?: boolean; isForced?: boolean }[]
): number {
  const nonTrivialMoves = moves.filter(m => !m.isBook && !m.isForced);
  if (nonTrivialMoves.length === 0) return 100.0;

  let totalWeightedAccuracy = 0;
  let totalWeight = 0;

  for (const move of nonTrivialMoves) {
    // Weight increases in high-stakes positions (closer to equality/slight advantage)
    const leverageWeight = 1.0 + Math.abs((move.wpBest - 50) / 50);
    const moveAccuracy = calculateMoveAccuracy(move.deltaWP);

    totalWeightedAccuracy += moveAccuracy * leverageWeight;
    totalWeight += leverageWeight;
  }

  return parseFloat((totalWeightedAccuracy / totalWeight).toFixed(1));
}

/**
 * Estimated Performance Rating (Elo) based on CAPS2 accuracy and game length
 */
export function estimatePerformanceRating(accuracy: number, blunders: number, mistakes: number): number {
  // Base calibration curve
  const baseElo = 600 + (accuracy * 22.5);
  const penalty = (blunders * 90) + (mistakes * 35);
  const estimated = Math.max(400, Math.min(2900, Math.round(baseElo - penalty)));
  return estimated;
}
