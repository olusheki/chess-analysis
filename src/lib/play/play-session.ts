import { Chess, type Square } from "chess.js";
import type { GameAnalysis, ParsedMove } from "@/lib/analysis/game-analyzer";
import { evaluateSingleAnalyzedMove, parseHeaderElo } from "@/lib/analysis/game-analyzer";
import type { MoveBadge } from "@/lib/analysis/move-classifier";
import type { CoachPersonaId } from "@/lib/ai/coach-personas";
import {
  buildOfflineMoveExplanation,
  type CoachExplanationResponse,
} from "@/lib/ai/offline-coach";
import type { PositionEval } from "@/lib/engine/engine-evaluator";
import { formatEvalLabel, uciScoreToActiveCentipawns } from "@/lib/engine/uci-parser";
import {
  calculateMoveAccuracy,
  calculateOverallGameAccuracy,
  centipawnsToWinProbability,
} from "@/lib/engine/win-probability";

export const PLAY_MIN_ELO = 400;
export const PLAY_MAX_ELO = 3190;
export const PLAY_DEFAULT_FALLBACK_ELO = 1200;

export const DEFAULT_CHESS_START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type PlayStartMode = "board" | "before-move";

export interface MatchedEloResult {
  elo: number;
  source: "pgn" | "estimated" | "default";
}

export interface ResolvePlayAnchorInput {
  analysis: GameAnalysis | null;
  currentPly: number;
  activeCustomFen?: string | null;
  coachColor: "white" | "black";
  startMode: PlayStartMode;
}

export interface PlayAnchor {
  fen: string;
  moveNumber: number;
  userColor: "w" | "b";
  anchorPly: number;
  description: string;
}

export interface PlayGradedMove {
  ply: number;
  moveNumber: number;
  color: "w" | "b";
  san: string;
  uci: string;
  from: Square;
  to: Square;
  fenBefore: string;
  fenAfter: string;
  badge: MoveBadge;
  deltaWP: number;
  accuracy: number;
  wpBest: number;
  whiteCp: number;
  whiteMate?: number;
  evalLabel: string;
  bestMoveUci: string;
  bestMoveSan: string;
  bestMovePvSan: string[];
  refutationPvSan: string[];
  explanation: CoachExplanationResponse;
}

export interface GradeUserPlayMoveInput {
  fenBefore: string;
  fenAfter: string;
  san: string;
  uci: string;
  from: Square;
  to: Square;
  ply: number;
  evalBefore: PositionEval;
  evalAfter: PositionEval;
  prevMove?: ParsedMove;
  prevDeltaWP?: number;
  coachFor: "White" | "Black";
  personaId?: CoachPersonaId;
  openingName?: string;
  playerName?: string;
  opponentName?: string;
}

export interface PlayGameOverStatus {
  reason:
    | "checkmate"
    | "stalemate"
    | "insufficient_material"
    | "threefold_repetition"
    | "draw";
  winner: "user" | "engine" | "draw";
  title: string;
  subtitle: string;
}

/**
 * Clamps a numeric target ELO rating to the supported play calibration range.
 */
export function clampPlayElo(elo: number): number {
  if (!Number.isFinite(elo)) return PLAY_DEFAULT_FALLBACK_ELO;
  return Math.max(PLAY_MIN_ELO, Math.min(PLAY_MAX_ELO, Math.round(elo)));
}

/**
 * Selects the default Stockfish target ELO for Play Mode from PGN ratings
 * or the coached player's estimated CAPS2 performance rating.
 */
export function resolveMatchedElo(
  analysis: GameAnalysis | null,
  coachColor: "white" | "black"
): MatchedEloResult {
  if (!analysis) {
    return { elo: PLAY_DEFAULT_FALLBACK_ELO, source: "default" };
  }

  const headerRaw =
    coachColor === "white" ? analysis.headers.WhiteElo : analysis.headers.BlackElo;
  const headerElo = parseHeaderElo(headerRaw);
  if (headerElo !== undefined) {
    return { elo: clampPlayElo(headerElo), source: "pgn" };
  }

  const summary =
    coachColor === "white" ? analysis.summary.white : analysis.summary.black;
  if (Number.isFinite(summary?.estimatedElo) && summary.estimatedElo > 0) {
    return { elo: clampPlayElo(summary.estimatedElo), source: "estimated" };
  }

  return { elo: PLAY_DEFAULT_FALLBACK_ELO, source: "default" };
}

function parseFenMoveNumber(fen: string): number {
  const parts = fen.trim().split(/\s+/);
  const fullmove = Number.parseInt(parts[5] ?? "1", 10);
  return Number.isFinite(fullmove) && fullmove > 0 ? fullmove : 1;
}

/**
 * Resolves the starting board FEN, anchor ply, and player color when entering Play Mode.
 */
export function resolvePlayAnchor(input: ResolvePlayAnchorInput): PlayAnchor {
  const { analysis, currentPly, activeCustomFen, coachColor, startMode } = input;
  const userColor: "w" | "b" = coachColor === "white" ? "w" : "b";

  if (!analysis) {
    return {
      fen: DEFAULT_CHESS_START_FEN,
      moveNumber: 1,
      userColor,
      anchorPly: 0,
      description: "Starting position",
    };
  }

  const activeMove =
    currentPly > 0
      ? analysis.moves[currentPly - 1] ?? analysis.moves[analysis.moves.length - 1]
      : undefined;

  if (startMode === "before-move" && activeMove) {
    const marker = activeMove.color === "w" ? "." : "...";
    return {
      fen: activeMove.fenBefore,
      moveNumber: activeMove.moveNumber,
      userColor,
      anchorPly: Math.max(0, activeMove.ply - 1),
      description: `Fix from ${activeMove.moveNumber}${marker} ${activeMove.san}`,
    };
  }

  if (activeCustomFen) {
    return {
      fen: activeCustomFen,
      moveNumber: parseFenMoveNumber(activeCustomFen),
      userColor,
      anchorPly: currentPly,
      description: "Selected variation",
    };
  }

  if (currentPly === 0 || !activeMove) {
    return {
      fen: analysis.startFen || DEFAULT_CHESS_START_FEN,
      moveNumber: parseFenMoveNumber(analysis.startFen || DEFAULT_CHESS_START_FEN),
      userColor,
      anchorPly: 0,
      description: "Opening position",
    };
  }

  const marker = activeMove.color === "w" ? "." : "...";
  return {
    fen: activeMove.fenAfter,
    moveNumber: activeMove.moveNumber,
    userColor,
    anchorPly: activeMove.ply,
    description: `From ${activeMove.moveNumber}${marker} ${activeMove.san}`,
  };
}

/**
 * Evaluates a user move played during Play Mode using the canonical move
 * classification pipeline and produces grounded coach feedback in real time.
 */
export function gradeUserPlayMove(input: GradeUserPlayMoveInput): PlayGradedMove {
  const chessBefore = new Chess(input.fenBefore);
  const color = chessBefore.turn();
  const moveNumber = chessBefore.moveNumber();

  const parsedMove: ParsedMove = {
    ply: input.ply,
    moveNumber,
    color,
    san: input.san,
    uci: input.uci,
    from: input.from,
    to: input.to,
    fenBefore: input.fenBefore,
    fenAfter: input.fenAfter,
  };

  const analyzed = evaluateSingleAnalyzedMove({
    move: parsedMove,
    evalBefore: input.evalBefore,
    evalAfter: input.evalAfter,
    isBook: false,
    prevMove: input.prevMove,
    prevDeltaWP: input.prevDeltaWP,
  });

  const bestLine = input.evalBefore.lines[0];
  const bestActive = uciScoreToActiveCentipawns(
    {
      cp: bestLine?.cp ?? input.evalBefore.whiteCp,
      mate: bestLine?.mate ?? input.evalBefore.whiteMate,
    },
    color
  );
  const wpBest = centipawnsToWinProbability(bestActive.cp, bestActive.mate);
  const accuracy = calculateMoveAccuracy(analyzed.classification.deltaWP);

  const evalBeforeLabel = formatEvalLabel(
    input.evalBefore.whiteCp,
    input.evalBefore.whiteMate,
    input.evalBefore.isCheckmate
  );

  const explanation = buildOfflineMoveExplanation({
    moveSan: input.san,
    playedBy: color === "w" ? "White" : "Black",
    coachFor: input.coachFor,
    playerName: input.playerName,
    opponentName: input.opponentName,
    moveNumber,
    badge: analyzed.classification.badge,
    openingName: input.openingName,
    evalBefore: evalBeforeLabel,
    evalAfter: analyzed.evalLabel,
    deltaWP: analyzed.classification.deltaWP,
    engineBestMove: analyzed.bestMoveSan,
    bestMovePV: analyzed.bestMovePvSan,
    refutationPV: analyzed.refutationPvSan,
    tacticalContext: analyzed.tacticalContext,
    coachInsights: analyzed.coachInsights,
    personaId: input.personaId,
    fenBefore: input.fenBefore,
    fenAfter: input.fenAfter,
  });

  return {
    ply: input.ply,
    moveNumber,
    color,
    san: input.san,
    uci: input.uci,
    from: input.from,
    to: input.to,
    fenBefore: input.fenBefore,
    fenAfter: input.fenAfter,
    badge: analyzed.classification.badge,
    deltaWP: analyzed.classification.deltaWP,
    accuracy,
    wpBest,
    whiteCp: analyzed.whiteCp,
    whiteMate: analyzed.whiteMate,
    evalLabel: analyzed.evalLabel,
    bestMoveUci: analyzed.bestMoveUci,
    bestMoveSan: analyzed.bestMoveSan,
    bestMovePvSan: analyzed.bestMovePvSan,
    refutationPvSan: analyzed.refutationPvSan ?? [],
    explanation,
  };
}

/**
 * Calculates aggregate CAPS2-style practice accuracy across graded user moves.
 */
export function calculatePracticeAccuracy(moves: PlayGradedMove[]): number {
  if (moves.length === 0) return 100;
  return calculateOverallGameAccuracy(
    moves.map((m) => ({
      deltaWP: m.deltaWP,
      wpBest: m.wpBest,
      isBook: m.badge === "Book",
      isForced: m.badge === "Forced",
    }))
  );
}

/**
 * Determines whether the Play Mode board reached a terminal result and who won.
 */
export function getPlayGameOverStatus(
  fen: string,
  userColor: "w" | "b"
): PlayGameOverStatus | null {
  const chess = new Chess(fen);
  if (!chess.isGameOver()) return null;

  if (chess.isCheckmate()) {
    // Side to move is checkmated, so the opposite color delivered mate
    const userWon = chess.turn() !== userColor;
    return {
      reason: "checkmate",
      winner: userWon ? "user" : "engine",
      title: userWon ? "Checkmate — You won!" : "Checkmate — Stockfish won",
      subtitle: userWon
        ? "You converted the position cleanly from here."
        : "Try undoing the turning point or adjusting the opponent ELO.",
    };
  }

  if (chess.isStalemate()) {
    return {
      reason: "stalemate",
      winner: "draw",
      title: "Draw by Stalemate",
      subtitle: "No legal moves remain for the side to move.",
    };
  }

  if (chess.isInsufficientMaterial()) {
    return {
      reason: "insufficient_material",
      winner: "draw",
      title: "Draw — Insufficient Material",
      subtitle: "Neither side retains enough material to force checkmate.",
    };
  }

  return {
    reason: "draw",
    winner: "draw",
    title: "Game Drawn",
    subtitle: "The game ended by the 50-move or draw rule.",
  };
}
