import { Chess, Square } from "chess.js";
import { ChessEngine, PositionEval } from "../engine/engine-evaluator";
import {
  calculateOverallGameAccuracy,
  centipawnsToWinProbability,
  estimatePerformanceRating,
} from "../engine/win-probability";
import { formatEvalLabel, uciScoreToActiveCentipawns } from "../engine/uci-parser";
import {
  classifyMove,
  ClassificationResult,
  MoveBadge,
} from "./move-classifier";
import { classifyGameOpenings, GameOpeningAnalysis } from "./opening-book";
import { calculateMaterialSacrifice, PIECE_VALUES, staticExchangeOnSquare } from "./sacrifice-detector";
import { extractTacticalContext, TacticalContext } from "./tactical-tagger";

export interface ParsedMove {
  ply: number; // 1-indexed
  moveNumber: number;
  color: "w" | "b";
  san: string;
  uci: string;
  from: Square;
  to: Square;
  fenBefore: string;
  fenAfter: string;
  clock?: string;
}

export interface ParsedPgnGame {
  headers: Record<string, string>;
  startFen: string;
  moves: ParsedMove[];
}

export interface AnalyzedPvLine {
  multipv: number;
  cp: number;
  mate?: number;
  pvSan: string[];
}

export interface AnalyzedMove extends ParsedMove {
  whiteCp: number;
  whiteMate?: number;
  evalLabel: string;
  bestMoveUci: string;
  bestMoveSan: string;
  bestMovePvSan: string[];
  altPvSan: string[];
  refutationPvSan?: string[];
  pvLines?: AnalyzedPvLine[];
  materialSacrificed: number;
  classification: ClassificationResult;
  tacticalContext: TacticalContext;
}

export interface PlayerSummary {
  accuracy: number;
  estimatedElo: number;
  badgeCounts: Record<MoveBadge, number>;
  phaseAccuracies: {
    opening: number;
    middlegame: number;
    endgame: number;
  };
  phaseMoveCounts?: {
    opening: number;
    middlegame: number;
    endgame: number;
  };
}

export interface GameAnalysis {
  headers: Record<string, string>;
  startFen: string;
  startEval?: {
    whiteCp: number;
    whiteMate?: number;
    evalLabel: string;
    pvLines?: AnalyzedPvLine[];
  };
  opening: GameOpeningAnalysis;
  moves: AnalyzedMove[];
  summary: {
    white: PlayerSummary;
    black: PlayerSummary;
  };
}

function parseHeaderElo(raw?: string): number | undefined {
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export interface AnalyzeGameOptions {
  depth?: number;
  multiPv?: number;
  startPlyEvalFrom?: number;
  onProgress?: (completed: number, total: number) => void;
  signal?: AbortSignal;
}

const ALL_BADGES: MoveBadge[] = [
  "Brilliant",
  "Great",
  "Best",
  "Excellent",
  "Good",
  "Book",
  "Inaccuracy",
  "Mistake",
  "Miss",
  "Blunder",
  "Forced",
];

function emptyBadgeCounts(): Record<MoveBadge, number> {
  return ALL_BADGES.reduce((acc, badge) => {
    acc[badge] = 0;
    return acc;
  }, {} as Record<MoveBadge, number>);
}

function formatPgnClock(comment?: string): string | undefined {
  if (!comment) return undefined;
  const match = comment.match(/\[%clk\s+([0-9:.]+)\]/);
  if (!match) return undefined;
  const raw = match[1];
  const parts = raw.split(":");
  if (parts.length === 3 && parts[0] === "0") {
    const mins = String(Number.parseInt(parts[1], 10));
    return `${mins}:${parts[2]}`;
  }
  return raw;
}

/**
 * Parses a PGN string into headers, starting FEN, and move-by-move FEN/UCI metadata.
 */
export function parsePgnGame(pgn: string): ParsedPgnGame {
  const chess = new Chess();
  chess.loadPgn(pgn);

  const headers = chess.getHeaders();
  const verboseHistory = chess.history({ verbose: true });
  const commentMap = new Map(chess.getComments().map((entry) => [entry.fen, entry.comment]));

  const startFen = headers.FEN
    ? headers.FEN
    : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  const fenParts = startFen.trim().split(/\s+/);
  const startFullMove = parseInt(fenParts[5] ?? "1", 10) || 1;
  const startTurn: "w" | "b" = fenParts[1] === "b" ? "b" : "w";

  const replay = new Chess(startFen);
  const moves: ParsedMove[] = [];

  for (let i = 0; i < verboseHistory.length; i++) {
    const h = verboseHistory[i];
    const fenBefore = replay.fen();
    const played = replay.move(h.san);
    if (!played) break;
    const fenAfter = replay.fen();
    const uci = `${played.from}${played.to}${played.promotion ?? ""}`;
    const moveNumber =
      startTurn === "w"
        ? startFullMove + Math.floor(i / 2)
        : startFullMove + Math.floor((i + 1) / 2);

    moves.push({
      ply: i + 1,
      moveNumber,
      color: played.color,
      san: played.san,
      uci,
      from: played.from,
      to: played.to,
      fenBefore,
      fenAfter,
      clock: formatPgnClock(commentMap.get(fenAfter)),
    });
  }

  return { headers, startFen, moves };
}

/**
 * Orchestrates the Tier 1 (Stockfish MultiPV) + Tier 2 (Opening, Sacrifice, Tactics, CAPS2 Classifier)
 * pipeline over an entire PGN game.
 */
export async function analyzeGame(
  pgn: string,
  engine: ChessEngine,
  options: AnalyzeGameOptions = {}
): Promise<GameAnalysis> {
  const depth = options.depth ?? 14;
  const multiPv = options.multiPv ?? 3;
  const startPlyEvalFrom = options.startPlyEvalFrom ?? 0;

  const parsed = parsePgnGame(pgn);
  const { headers, startFen, moves } = parsed;

  if (moves.length === 0) {
    return {
      headers,
      startFen,
      opening: classifyGameOpenings([], 30, startFen),
      moves: [],
      summary: {
        white: {
          accuracy: 100,
          estimatedElo: 1500,
          badgeCounts: emptyBadgeCounts(),
          phaseAccuracies: { opening: 100, middlegame: 100, endgame: 100 },
          phaseMoveCounts: { opening: 0, middlegame: 0, endgame: 0 },
        },
        black: {
          accuracy: 100,
          estimatedElo: 1500,
          badgeCounts: emptyBadgeCounts(),
          phaseAccuracies: { opening: 100, middlegame: 100, endgame: 100 },
          phaseMoveCounts: { opening: 0, middlegame: 0, endgame: 0 },
        },
      },
    };
  }

  const opening = classifyGameOpenings(
    moves.map((m) => m.san),
    30,
    startFen
  );

  // Positions to evaluate: startFen + every fenAfter (N + 1 positions, reusing evals across plies!)
  const positionFens = [startFen, ...moves.map((m) => m.fenAfter)];
  const evals: PositionEval[] = [];

  for (let idx = 0; idx < positionFens.length; idx++) {
    if (options.signal?.aborted) {
      throw new DOMException("Analysis aborted", "AbortError");
    }

    // Book moves deep inside theory (except the boundary position right before exiting book)
    // or early focus-skipped plies use fast shallow evaluation for responsiveness.
    const isDeepBookBoundary =
      idx > 0 && idx < opening.bookPlies - 1 && opening.plyIsBook[idx - 1];
    const effectiveDepth =
      idx < Math.max(0, startPlyEvalFrom - 1) || isDeepBookBoundary ? Math.min(4, depth) : depth;

    const posEval = await engine.evaluatePosition(positionFens[idx], effectiveDepth, multiPv);
    evals.push(posEval);
    options.onProgress?.(idx + 1, positionFens.length);
  }

  const analyzedMoves: AnalyzedMove[] = [];
  let prevDeltaWP: number | undefined;

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const evalBefore = evals[i];
    const evalAfter = evals[i + 1];
    const isBook = opening.plyIsBook[i] ?? false;

    const chessBefore = new Chess(move.fenBefore);
    const legalMoveCount = chessBefore.moves().length;

    const isBestMove =
      move.uci === evalBefore.bestMoveUci || move.san === evalBefore.bestMoveSan;

    const bestLine = evalBefore.lines[0];
    const secondLine = evalBefore.lines[1];

    const bestActive = uciScoreToActiveCentipawns(
      { cp: bestLine?.cp ?? evalBefore.whiteCp, mate: bestLine?.mate ?? evalBefore.whiteMate },
      move.color
    );

    const pv2Active = secondLine
      ? uciScoreToActiveCentipawns({ cp: secondLine.cp, mate: secondLine.mate }, move.color)
      : undefined;

    const playedActive = isBestMove
      ? bestActive
      : uciScoreToActiveCentipawns(
          { cp: evalAfter.whiteCp, mate: evalAfter.whiteMate },
          move.color
        );

    const materialSacrificed = isBook ? 0 : calculateMaterialSacrifice(move.fenBefore, move.san);
    const prevMove = i > 0 ? moves[i - 1] : undefined;
    const isRecapture =
      Boolean(prevMove) &&
      prevMove!.san.includes("x") &&
      move.san.includes("x") &&
      prevMove!.to === move.to;
    const movedPiece = chessBefore.get(move.from);
    const capturedPiece = chessBefore.get(move.to);
    const capturedVal = capturedPiece ? PIECE_VALUES[capturedPiece.type] : 0;
    const replyGainOnDest =
      capturedVal >= 3
        ? staticExchangeOnSquare(
            new Chess(move.fenAfter),
            move.to,
            move.color === "w" ? "b" : "w"
          )
        : 0;
    const isObviousFreeCapture =
      capturedVal >= 5
        ? capturedVal - replyGainOnDest >= 4
        : capturedVal >= 3 && replyGainOnDest === 0 && (prevDeltaWP ?? 0) >= 12.0;
    const isKingCheckEscape = chessBefore.inCheck() && movedPiece?.type === "k";

    const classification = classifyMove({
      ply: move.ply,
      moveSan: move.san,
      isBook,
      legalMoveCount,
      cpBest: bestActive.cp,
      cpPlayed: playedActive.cp,
      cpPV2: pv2Active?.cp,
      mateBest: bestActive.mate,
      matePlayed: playedActive.mate,
      matePV2: pv2Active?.mate,
      prevMoveOpponentDeltaWP: prevDeltaWP,
      materialSacrificed,
      isBestMove,
      isRecapture,
      isObviousFreeCapture,
      isKingCheckEscape,
    });

    const tacticalContext = extractTacticalContext(
      move.fenBefore,
      move.fenAfter,
      move.san,
      move.moveNumber
    );

    prevDeltaWP = classification.deltaWP;

    analyzedMoves.push({
      ...move,
      whiteCp: evalAfter.whiteCp,
      whiteMate: evalAfter.whiteMate,
      evalLabel: formatEvalLabel(evalAfter.whiteCp, evalAfter.whiteMate, evalAfter.isCheckmate),
      bestMoveUci: evalBefore.bestMoveUci,
      bestMoveSan: evalBefore.bestMoveSan,
      bestMovePvSan: bestLine?.pvSan ?? [],
      altPvSan: secondLine?.pvSan ?? [],
      refutationPvSan: evalAfter.lines[0]?.pvSan ?? [],
      pvLines: evalBefore.lines.slice(0, 3).map((line) => ({
        multipv: line.multipv,
        cp: line.cp,
        mate: line.mate,
        pvSan: line.pvSan,
      })),
      materialSacrificed,
      classification,
      tacticalContext,
    });
  }

  const whiteHeaderElo = parseHeaderElo(headers.WhiteElo);
  const blackHeaderElo = parseHeaderElo(headers.BlackElo);
  const parseResultScore = (color: "w" | "b"): number | undefined => {
    const r = headers.Result?.trim();
    if (r === "1-0") return color === "w" ? 1 : 0;
    if (r === "0-1") return color === "w" ? 0 : 1;
    if (r === "1/2-1/2") return 0.5;
    return undefined;
  };

  const summarizePlayer = (color: "w" | "b"): PlayerSummary => {
    const playerMoves = analyzedMoves.filter((m) => m.color === color);
    const badgeCounts = emptyBadgeCounts();

    for (const m of playerMoves) {
      badgeCounts[m.classification.badge]++;
    }

    const toAccuracyItems = (subset: AnalyzedMove[]) =>
      subset.map((m) => {
        const beforeEval = evals[m.ply - 1];
        const bestLine = beforeEval.lines[0];
        const bestActive = uciScoreToActiveCentipawns(
          {
            cp: bestLine?.cp ?? beforeEval.whiteCp,
            mate: bestLine?.mate ?? beforeEval.whiteMate,
          },
          color
        );
        return {
          deltaWP: m.classification.deltaWP,
          wpBest: centipawnsToWinProbability(bestActive.cp, bestActive.mate),
          isBook: m.classification.badge === "Book",
          isForced: m.classification.badge === "Forced",
        };
      });

    const accuracy = calculateOverallGameAccuracy(toAccuracyItems(playerMoves));
    const playerElo = color === "w" ? whiteHeaderElo : blackHeaderElo;
    const opponentElo = color === "w" ? blackHeaderElo : whiteHeaderElo;
    const ratingContext =
      playerElo !== undefined || opponentElo !== undefined
        ? { playerElo, opponentElo, resultScore: parseResultScore(color) }
        : undefined;
    const estimatedElo = estimatePerformanceRating(
      accuracy,
      badgeCounts.Blunder + badgeCounts.Miss,
      badgeCounts.Mistake,
      ratingContext
    );

    const openingMoves = playerMoves.filter((m) => m.tacticalContext.gamePhase === "Opening");
    const middleMoves = playerMoves.filter((m) => m.tacticalContext.gamePhase === "Middlegame");
    const endgameMoves = playerMoves.filter((m) => m.tacticalContext.gamePhase === "Endgame");

    const phaseAcc = (subset: AnalyzedMove[]) =>
      subset.length > 0 ? calculateOverallGameAccuracy(toAccuracyItems(subset)) : 100.0;

    return {
      accuracy,
      estimatedElo,
      badgeCounts,
      phaseAccuracies: {
        opening: phaseAcc(openingMoves),
        middlegame: phaseAcc(middleMoves),
        endgame: phaseAcc(endgameMoves),
      },
      phaseMoveCounts: {
        opening: openingMoves.length,
        middlegame: middleMoves.length,
        endgame: endgameMoves.length,
      },
    };
  };

  return {
    headers,
    startFen,
    startEval: evals[0]
      ? {
          whiteCp: evals[0].whiteCp,
          whiteMate: evals[0].whiteMate,
          evalLabel: formatEvalLabel(evals[0].whiteCp, evals[0].whiteMate, evals[0].isCheckmate),
          pvLines: evals[0].lines.slice(0, 3).map((line) => ({
            multipv: line.multipv,
            cp: line.cp,
            mate: line.mate,
            pvSan: line.pvSan,
          })),
        }
      : undefined,
    opening,
    moves: analyzedMoves,
    summary: {
      white: summarizePlayer("w"),
      black: summarizePlayer("b"),
    },
  };
}
