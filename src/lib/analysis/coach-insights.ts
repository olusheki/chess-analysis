import { Chess, type Color, type Move, type PieceSymbol } from "chess.js";
import {
  extractTacticalContext,
  PIECE_NAMES,
  PIECE_VALUES,
  type TacticalContext,
} from "./tactical-tagger";

export interface PvCaptureFact {
  san: string;
  piece: string;
  square: string;
  byColor: "w" | "b";
}

export interface PvIntentionSummary {
  lineSan: string[];
  checksDelivered: number;
  capturedTargets: PvCaptureFact[];
  castled: boolean;
  promoted: boolean;
  terminalCheckmate: boolean;
  summaryFacts: string[];
}

export interface ComparativeCoachInsights {
  playedSan: string;
  bestMoveSan: string;
  bestMoveFenAfter?: string;
  bestMoveTactics?: TacticalContext;
  whyBetterFacts: string[];
  strategicTradeoffs: string[];
  missedOpportunities: string[];
  playedPvIntentions?: PvIntentionSummary;
  bestPvIntentions?: PvIntentionSummary;
  refutationPvIntentions?: PvIntentionSummary;
  boardPieceMapAfter?: string;
}

export interface AnalyzeComparativeReasonsInput {
  fenBefore: string;
  fenAfter: string;
  playedSan: string;
  bestMoveSan: string;
  bestMovePvSan?: string[];
  playedPvSan?: string[];
  refutationPvSan?: string[];
  moveNumber: number;
  isBook?: boolean;
  playedTactics?: TacticalContext;
  classification?: string;
}

const PIECE_ORDER: PieceSymbol[] = ["k", "q", "r", "b", "n", "p"];
const PIECE_SHORT: Record<PieceSymbol, string> = {
  k: "K",
  q: "Q",
  r: "R",
  b: "B",
  n: "N",
  p: "Pawns",
};

function safeLoadChess(fen: string): Chess | null {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

function safeApplySan(fen: string, san: string): { move: Move; fenAfter: string } | null {
  if (!san) return null;
  const chess = safeLoadChess(fen);
  if (!chess) return null;
  try {
    const move = chess.move(san);
    return move ? { move, fenAfter: chess.fen() } : null;
  } catch {
    return null;
  }
}

/**
 * Traces a principal-variation SAN line forward on a real Chess board to extract
 * verifiable checks, captures, castling, promotion, and mate outcomes.
 */
export function tracePvIntentions(
  fenStart: string,
  pvSan: string[],
  maxPlies = 4
): PvIntentionSummary {
  const empty: PvIntentionSummary = {
    lineSan: [],
    checksDelivered: 0,
    capturedTargets: [],
    castled: false,
    promoted: false,
    terminalCheckmate: false,
    summaryFacts: [],
  };

  if (!pvSan || pvSan.length === 0) return empty;
  const chess = safeLoadChess(fenStart);
  if (!chess) return empty;

  const lineSan: string[] = [];
  const capturedTargets: PvCaptureFact[] = [];
  let checksDelivered = 0;
  let castled = false;
  let promoted = false;
  let terminalCheckmate = false;

  const limit = Math.min(Math.max(1, maxPlies), pvSan.length);
  for (let i = 0; i < limit; i++) {
    const rawSan = pvSan[i];
    if (!rawSan) break;
    let move: Move | null = null;
    try {
      move = chess.move(rawSan);
    } catch {
      move = null;
    }
    if (!move) break;

    lineSan.push(move.san);
    if (move.flags.includes("k") || move.flags.includes("q")) {
      castled = true;
    }
    if (move.promotion) {
      promoted = true;
    }
    if (move.captured) {
      capturedTargets.push({
        san: move.san,
        piece: PIECE_NAMES[move.captured] ?? move.captured,
        square: move.to,
        byColor: move.color,
      });
    }
    if (chess.isCheckmate()) {
      checksDelivered += 1;
      terminalCheckmate = true;
      break;
    }
    if (chess.inCheck()) {
      checksDelivered += 1;
    }
  }

  const summaryFacts: string[] = [];
  const lineText = lineSan.join(" ");

  if (terminalCheckmate && lineSan.length > 0) {
    summaryFacts.push(`Continuation leads to forced checkmate along ${lineText}.`);
  } else if (checksDelivered > 0 && lineSan.length > 0) {
    summaryFacts.push(`Line creates a checking sequence along ${lineText}.`);
  }

  if (capturedTargets.length > 0) {
    const firstCap = capturedTargets[0];
    summaryFacts.push(
      `Line targets material with ${firstCap.san}, winning the ${firstCap.piece} on ${firstCap.square}.`
    );
  }
  if (promoted) {
    summaryFacts.push("Line achieves a pawn promotion.");
  }
  if (castled) {
    summaryFacts.push("Line castles the king to safety.");
  }

  return {
    lineSan,
    checksDelivered,
    capturedTargets,
    castled,
    promoted,
    terminalCheckmate,
    summaryFacts,
  };
}

/**
 * Formats exact piece positions from a FEN string to prevent hallucinated square references.
 */
export function summarizePiecePlacements(fen: string): string {
  const chess = safeLoadChess(fen);
  if (!chess) return "";

  const formatSide = (color: Color): string => {
    const buckets: Record<PieceSymbol, string[]> = {
      k: [],
      q: [],
      r: [],
      b: [],
      n: [],
      p: [],
    };
    const board = chess.board();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const piece = board[r][f];
        if (!piece || piece.color !== color) continue;
        buckets[piece.type].push(piece.square);
      }
    }
    return PIECE_ORDER.filter((type) => buckets[type].length > 0)
      .map((type) => `${PIECE_SHORT[type]} ${buckets[type].join("/")}`)
      .join(", ");
  };

  return `White: ${formatSide("w")} | Black: ${formatSide("b")}`;
}

function collectMissedTacticalOpportunities(
  bestMove: Move,
  bestMoveFenAfter: string,
  bestTactics: TacticalContext | undefined
): string[] {
  const missed: string[] = [];
  const chessBest = safeLoadChess(bestMoveFenAfter);
  const opponentColor: Color = bestMove.color === "w" ? "b" : "w";

  if (bestMove.captured && chessBest) {
    const capturedName = PIECE_NAMES[bestMove.captured] ?? bestMove.captured;
    const isUndefended = !chessBest.isAttacked(bestMove.to, opponentColor);
    const winningTrade =
      (PIECE_VALUES[bestMove.captured] ?? 0) > (PIECE_VALUES[bestMove.piece] ?? 0);

    if (isUndefended) {
      missed.push(`${bestMove.san} wins the undefended ${capturedName} on ${bestMove.to}.`);
    } else if (winningTrade) {
      missed.push(
        `${bestMove.san} wins material by capturing the ${capturedName} on ${bestMove.to}.`
      );
    }
  }

  if (!bestTactics) return missed;

  if (bestTactics.forkTargets && bestTactics.forkTargets.length >= 2) {
    const targets = bestTactics.forkTargets
      .map((t) => `${t.piece} on ${t.square}`)
      .join(" and ");
    missed.push(`${bestMove.san} creates a fork against the ${targets}.`);
  }
  if (bestTactics.pinnedPieceDetails) {
    const pin = bestTactics.pinnedPieceDetails;
    missed.push(
      `${bestMove.san} pins the ${pin.piece} on ${pin.square} to the ${pin.pinnedTo}.`
    );
  }
  if (bestTactics.skeweredPieceDetails) {
    const sk = bestTactics.skeweredPieceDetails;
    missed.push(
      `${bestMove.san} skewers the ${sk.frontPiece} on ${sk.frontSquare} in front of the ${sk.backPiece} on ${sk.backSquare}.`
    );
  }
  if (bestTactics.discoveredTarget) {
    const dt = bestTactics.discoveredTarget;
    missed.push(
      `${bestMove.san} unleashes a discovered attack on the ${dt.piece} on ${dt.square}.`
    );
  }
  if (bestTactics.tags.includes("TRAPPED_PIECE")) {
    missed.push(`${bestMove.san} traps an enemy piece with no safe retreat.`);
  }
  if (bestTactics.tags.includes("CHECKMATE_THREAT")) {
    missed.push(`${bestMove.san} sets up an immediate checkmate threat.`);
  }
  return missed;
}

function countPawnStructureDefects(
  chess: Chess,
  color: Color
): { doubled: number; isolated: number } {
  const pawnsPerFile = Array<number>(8).fill(0);
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (piece && piece.color === color && piece.type === "p") {
        pawnsPerFile[f] += 1;
      }
    }
  }
  let doubled = 0;
  let isolated = 0;
  for (let f = 0; f < 8; f++) {
    if (pawnsPerFile[f] > 1) {
      doubled += pawnsPerFile[f] - 1;
    }
    if (pawnsPerFile[f] > 0) {
      const hasLeft = f > 0 && pawnsPerFile[f - 1] > 0;
      const hasRight = f < 7 && pawnsPerFile[f + 1] > 0;
      if (!hasLeft && !hasRight) {
        isolated += pawnsPerFile[f];
      }
    }
  }
  return { doubled, isolated };
}

function countUndevelopedMinorPieces(chess: Chess, color: Color): number {
  const homeSquares =
    color === "w" ? (["b1", "c1", "f1", "g1"] as const) : (["b8", "c8", "f8", "g8"] as const);
  let count = 0;
  for (const sq of homeSquares) {
    const piece = chess.get(sq);
    if (piece && piece.color === color && (piece.type === "n" || piece.type === "b")) {
      count += 1;
    }
  }
  return count;
}

function isFileOpenForColor(chess: Chess, fileIndex: number, color: Color): boolean {
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    const piece = board[r][fileIndex];
    if (piece && piece.type === "p" && piece.color === color) {
      return false;
    }
  }
  return true;
}

function rankDeltaForColor(fromSq: string, toSq: string, color: Color): number {
  const fromRank = Number(fromSq[1]);
  const toRank = Number(toSq[1]);
  return color === "w" ? toRank - fromRank : fromRank - toRank;
}

function isFlankFile(sq: string): boolean {
  const file = sq[0];
  return file === "a" || file === "b" || file === "g" || file === "h";
}

function collectPositionalTradeoffs(params: {
  fenBefore: string;
  fenAfter: string;
  bestMoveFenAfter: string;
  playedMove: Move;
  bestMove: Move;
  playedTactics?: TacticalContext;
  bestTactics?: TacticalContext;
}): string[] {
  const {
    fenBefore,
    fenAfter,
    bestMoveFenAfter,
    playedMove,
    bestMove,
    playedTactics,
    bestTactics,
  } = params;
  const chessBefore = safeLoadChess(fenBefore);
  const chessPlayed = safeLoadChess(fenAfter);
  const chessBest = safeLoadChess(bestMoveFenAfter);
  if (!chessBefore || !chessPlayed || !chessBest) return [];

  const color = playedMove.color;
  const tradeoffs: string[] = [];

  // 1. Development vs premature castling or flank pawn move
  const undevelopedBefore = countUndevelopedMinorPieces(chessBefore, color);
  const bestDevelopsMinor = Boolean(bestTactics?.tags.includes("DEVELOPMENT"));
  const playedCastled = playedMove.flags.includes("k") || playedMove.flags.includes("q");
  const playedFlankPawn = playedMove.piece === "p" && isFlankFile(playedMove.to);

  if (bestDevelopsMinor && playedCastled && undevelopedBefore >= 2) {
    tradeoffs.push(
      `Developing with ${bestMove.san} mobilizes another minor piece before committing to castling (${playedMove.san}).`
    );
  } else if (bestDevelopsMinor && playedFlankPawn) {
    tradeoffs.push(
      `Developing with ${bestMove.san} improves piece activity instead of spending a tempo on a flank pawn push (${playedMove.san}).`
    );
  } else if (bestDevelopsMinor && !playedTactics?.tags.includes("DEVELOPMENT") && undevelopedBefore >= 2) {
    tradeoffs.push(
      `Bringing a new piece into play with ${bestMove.san} aids piece coordination better than ${playedMove.san}.`
    );
  }

  // 2. Attacking / active forward play vs passive retreat
  const bestAdvance = rankDeltaForColor(bestMove.from, bestMove.to, color);
  const playedAdvance = rankDeltaForColor(playedMove.from, playedMove.to, color);
  const bestIsCheckOrCapture = Boolean(bestMove.captured || bestTactics?.isCheck);
  if (bestIsCheckOrCapture && !playedMove.captured && !playedTactics?.isCheck) {
    tradeoffs.push(
      `${bestMove.san} seizes the initiative with direct pressure instead of playing quietly with ${playedMove.san}.`
    );
  } else if (bestAdvance > 0 && playedAdvance < 0 && !playedMove.captured) {
    tradeoffs.push(
      `${bestMove.san} stakes active forward ground rather than retreating passively with ${playedMove.san}.`
    );
  }

  // 3. Castling / king safety
  if (bestTactics?.isCastle && !playedTactics?.isCastle) {
    tradeoffs.push(`${bestMove.san} shelters the king and connects the rooks.`);
  } else if (
    playedMove.piece === "k" &&
    !playedCastled &&
    (chessBefore.getCastlingRights(color).k || chessBefore.getCastlingRights(color).q)
  ) {
    tradeoffs.push(
      `Moving the king manually (${playedMove.san}) forfeits castling rights and can leave the king exposed.`
    );
  }

  // 4. Pawn structure damage comparison (doubled / isolated pawns)
  const defectsBefore = countPawnStructureDefects(chessBefore, color);
  const defectsPlayed = countPawnStructureDefects(chessPlayed, color);
  const defectsBest = countPawnStructureDefects(chessBest, color);
  const playedDoubledDelta = defectsPlayed.doubled - defectsBefore.doubled;
  const bestDoubledDelta = defectsBest.doubled - defectsBefore.doubled;
  const playedIsolatedDelta = defectsPlayed.isolated - defectsBefore.isolated;
  const bestIsolatedDelta = defectsBest.isolated - defectsBefore.isolated;

  if (
    (playedDoubledDelta > bestDoubledDelta && playedDoubledDelta > 0) ||
    (playedIsolatedDelta > bestIsolatedDelta && playedIsolatedDelta > 0)
  ) {
    tradeoffs.push(
      `${playedMove.san} compromises your pawn structure (creating doubled or isolated pawns), which ${bestMove.san} avoids.`
    );
  }

  // 5. Center control
  if (bestTactics?.tags.includes("CENTER_CONTROL") && !playedTactics?.tags.includes("CENTER_CONTROL")) {
    tradeoffs.push(`${bestMove.san} builds stronger central control over d4/e4/d5/e5.`);
  }

  // 6. Open-file rook activation
  if (bestMove.piece === "r") {
    const fileIndex = bestMove.to.charCodeAt(0) - "a".charCodeAt(0);
    if (isFileOpenForColor(chessBest, fileIndex, color) && playedMove.piece !== "r") {
      tradeoffs.push(`${bestMove.san} places the rook actively on an open or semi-open file.`);
    }
  }

  // 7. Leaving own piece hanging
  if (playedTactics?.hangingPieceDetails && !bestTactics?.hangingPieceDetails) {
    const h = playedTactics.hangingPieceDetails;
    tradeoffs.push(`${playedMove.san} leaves your ${h.piece} on ${h.square} vulnerable.`);
  }

  return tradeoffs;
}

/**
 * Compares the played move against Stockfish's top recommendation using deterministic
 * tactical tags, positional deltas, and future principal-variation traces.
 */
export function analyzeComparativeReasons(
  params: AnalyzeComparativeReasonsInput
): ComparativeCoachInsights {
  const {
    fenBefore,
    fenAfter,
    playedSan,
    bestMoveSan,
    bestMovePvSan = [],
    playedPvSan = [],
    refutationPvSan = [],
    moveNumber,
    isBook = false,
    playedTactics,
  } = params;

  const boardPieceMapAfter = summarizePiecePlacements(fenAfter);
  const playedResult = safeApplySan(fenBefore, playedSan);
  const bestResult = safeApplySan(fenBefore, bestMoveSan);

  const resolvedPlayedTactics =
    playedTactics ?? extractTacticalContext(fenBefore, fenAfter, playedSan, moveNumber);

  const traceBestPv = (): PvIntentionSummary | undefined => {
    if (bestMovePvSan.length === 0) return undefined;
    const fromBefore = tracePvIntentions(fenBefore, bestMovePvSan);
    if (fromBefore.lineSan.length > 0) return fromBefore;
    if (bestResult) {
      return tracePvIntentions(bestResult.fenAfter, bestMovePvSan);
    }
    return undefined;
  };

  const bestPvIntentions = traceBestPv();
  const playedPvIntentions =
    playedPvSan.length > 0 ? tracePvIntentions(fenAfter, playedPvSan) : undefined;
  const refutationPvIntentions =
    refutationPvSan.length > 0 ? tracePvIntentions(fenAfter, refutationPvSan) : undefined;

  if (isBook || playedSan === bestMoveSan || !bestResult) {
    const whyBetterFacts: string[] = [];
    if (bestPvIntentions?.summaryFacts.length) {
      whyBetterFacts.push(...bestPvIntentions.summaryFacts);
    }
    return {
      playedSan,
      bestMoveSan,
      bestMoveFenAfter: bestResult?.fenAfter,
      bestMoveTactics: resolvedPlayedTactics,
      whyBetterFacts,
      strategicTradeoffs: [],
      missedOpportunities: [],
      playedPvIntentions,
      bestPvIntentions,
      refutationPvIntentions,
      boardPieceMapAfter,
    };
  }

  const bestMoveTactics = extractTacticalContext(
    fenBefore,
    bestResult.fenAfter,
    bestResult.move.san,
    moveNumber
  );

  const missedOpportunities = collectMissedTacticalOpportunities(
    bestResult.move,
    bestResult.fenAfter,
    bestMoveTactics
  );

  const strategicTradeoffs = playedResult
    ? collectPositionalTradeoffs({
        fenBefore,
        fenAfter,
        bestMoveFenAfter: bestResult.fenAfter,
        playedMove: playedResult.move,
        bestMove: bestResult.move,
        playedTactics: resolvedPlayedTactics,
        bestTactics: bestMoveTactics,
      })
    : [];

  const whyBetterFacts: string[] = [
    ...missedOpportunities,
    ...strategicTradeoffs,
    ...(bestPvIntentions?.summaryFacts ?? []),
  ];

  if (refutationPvIntentions?.summaryFacts.length) {
    for (const fact of refutationPvIntentions.summaryFacts) {
      whyBetterFacts.push(`After ${playedSan}, the opponent can punish with: ${fact}`);
    }
  }

  return {
    playedSan,
    bestMoveSan: bestResult.move.san,
    bestMoveFenAfter: bestResult.fenAfter,
    bestMoveTactics,
    whyBetterFacts: Array.from(new Set(whyBetterFacts)),
    strategicTradeoffs,
    missedOpportunities,
    playedPvIntentions,
    bestPvIntentions,
    refutationPvIntentions,
    boardPieceMapAfter,
  };
}
