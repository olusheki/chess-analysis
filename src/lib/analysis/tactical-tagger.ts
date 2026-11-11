/**
 * Deterministic Tactical and Strategic Feature Detector
 * Extracts verifiable chess features from FEN positions before and after a move.
 * These tags ground the AI Coach explanations to eliminate LLM hallucinations.
 */

import { Chess, Square, PieceSymbol, Color, Move } from "chess.js";
import type { MoveBadge } from "./move-classifier";
import { staticExchangeOnSquare } from "./sacrifice-detector";

export type TacticalTag =
  | "HANGING_PIECE"
  | "TACTICAL_FORK"
  | "ABSOLUTE_PIN"
  | "RELATIVE_PIN"
  | "SKEWER"
  | "DISCOVERED_ATTACK"
  | "CHECKMATE_THREAT"
  | "DEFLECTION"
  | "TRAPPED_PIECE"
  | "DEVELOPMENT"
  | "CENTER_CONTROL"
  | "KING_SAFETY_CASTLE"
  | "TEMPO_GAIN"
  | "PAWN_BREAK"
  | "ALLOWS_MATE"
  | "ALLOWS_FORK"
  | "MISSED_MATE"
  | "MISSED_FORK"
  | "MISSED_CAPTURE";

export interface TacticalThreatDetail {
  kind: "CHECKMATE" | "FORK" | "FREE_CAPTURE";
  refutationMoveSan?: string;
  missedMoveSan?: string;
  targetSquares?: Square[];
  targetSummary?: string;
  netGain?: number;
  isExchange?: boolean;
}

export interface ExtractTacticalOptions {
  bestMoveSan?: string;
  refutationPvSan?: string[];
  badge?: MoveBadge;
}

export interface TacticalContext {
  tags: TacticalTag[];
  hangingPieceDetails?: { square: Square; piece: string; value: number };
  forkTargets?: { square: Square; piece: string }[];
  pinnedPieceDetails?: { square: Square; piece: string; pinnedTo: string };
  skeweredPieceDetails?: { frontSquare: Square; frontPiece: string; backSquare: Square; backPiece: string };
  discoveredTarget?: { square: Square; piece: string };
  allowedThreat?: TacticalThreatDetail;
  missedTactic?: TacticalThreatDetail;
  isCheck: boolean;
  isCastle: boolean;
  gamePhase: "Opening" | "Middlegame" | "Endgame";
}

export const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};

export const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: "Pawn",
  n: "Knight",
  b: "Bishop",
  r: "Rook",
  q: "Queen",
  k: "King",
};

type BoardGrid = ReturnType<Chess["board"]>;

function toCoords(sq: Square): [number, number] {
  const file = sq.charCodeAt(0) - 97; // 0..7 (a..h)
  const rank = parseInt(sq[1], 10); // 1..8
  const row = 8 - rank; // 0..7 (rank 8 = row 0)
  return [row, file];
}

function toSquare(row: number, col: number): Square {
  return `${String.fromCharCode(97 + col)}${8 - row}` as Square;
}

function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

const ORTHOGONAL_DIRS: [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

const DIAGONAL_DIRS: [number, number][] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

const KNIGHT_DELTAS: [number, number][] = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2],
  [1, -2], [1, 2], [2, -1], [2, 1],
];

const KING_DELTAS: [number, number][] = [...ORTHOGONAL_DIRS, ...DIAGONAL_DIRS];

/**
 * Returns all squares pseudo-legally attacked by the single piece located at `sq`.
 */
function getPieceAttackedSquares(board: BoardGrid, sq: Square, color: Color, type: PieceSymbol): Square[] {
  const [r, c] = toCoords(sq);
  const attacked: Square[] = [];

  if (type === "p") {
    const dir = color === "w" ? -1 : 1; // White pawns advance toward row 0 (rank 8)
    for (const dc of [-1, 1]) {
      if (inBounds(r + dir, c + dc)) {
        attacked.push(toSquare(r + dir, c + dc));
      }
    }
    return attacked;
  }

  if (type === "n") {
    for (const [dr, dc] of KNIGHT_DELTAS) {
      if (inBounds(r + dr, c + dc)) attacked.push(toSquare(r + dr, c + dc));
    }
    return attacked;
  }

  if (type === "k") {
    for (const [dr, dc] of KING_DELTAS) {
      if (inBounds(r + dr, c + dc)) attacked.push(toSquare(r + dr, c + dc));
    }
    return attacked;
  }

  const dirs: [number, number][] =
    type === "r" ? ORTHOGONAL_DIRS : type === "b" ? DIAGONAL_DIRS : [...ORTHOGONAL_DIRS, ...DIAGONAL_DIRS];

  for (const [dr, dc] of dirs) {
    let nr = r + dr;
    let nc = c + dc;
    while (inBounds(nr, nc)) {
      attacked.push(toSquare(nr, nc));
      if (board[nr][nc] !== null) break;
      nr += dr;
      nc += dc;
    }
  }

  return attacked;
}

/**
 * Returns the lowest piece value among all pieces of `attackerColor` currently attacking `targetSq`.
 */
function getLowestAttackerValue(board: BoardGrid, targetSq: Square, attackerColor: Color): number | null {
  let lowest: number | null = null;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.color !== attackerColor) continue;
      const sq = toSquare(r, c);
      const attacks = getPieceAttackedSquares(board, sq, attackerColor, p.type);
      if (attacks.includes(targetSq)) {
        const val = PIECE_VALUES[p.type];
        if (lowest === null || val < lowest) {
          lowest = val;
        }
      }
    }
  }
  return lowest;
}

/**
 * Determines current game phase based on remaining non-pawn piece material.
 */
export function determineGamePhase(chess: Chess, moveNumber: number): "Opening" | "Middlegame" | "Endgame" {
  let totalNonPawnMaterial = 0;
  const board = chess.board();

  for (const row of board) {
    for (const sq of row) {
      if (sq && sq.type !== "p" && sq.type !== "k") {
        totalNonPawnMaterial += PIECE_VALUES[sq.type];
      }
    }
  }

  if (totalNonPawnMaterial <= 14) return "Endgame";
  if (moveNumber <= 10) return "Opening";
  return "Middlegame";
}

function hasMateInOne(fen: string, attackerColor: Color): boolean {
  try {
    const fenParts = fen.split(" ");
    fenParts[1] = attackerColor;
    fenParts[3] = "-";
    const probe = new Chess(fenParts.join(" "));
    if (probe.isGameOver()) return false;
    for (const reply of probe.moves({ verbose: true })) {
      probe.move(reply);
      const mates = probe.isCheckmate();
      probe.undo();
      if (mates) return true;
    }
  } catch {
    return false;
  }
  return false;
}

const ERROR_BADGES = new Set<MoveBadge>(["Inaccuracy", "Mistake", "Miss", "Blunder"]);
const SEVERE_ERROR_BADGES = new Set<MoveBadge>(["Miss", "Blunder"]);

function playSafeMove(
  fen: string,
  moveSan?: string
): { chess: Chess; move: Move } | null {
  if (!moveSan) return null;
  try {
    const next = new Chess(fen);
    const move = next.move(moveSan);
    return move ? { chess: next, move } : null;
  } catch {
    return null;
  }
}

function getCapturedSquare(move: Move): Square | null {
  if (!move.captured) return null;
  if (move.flags.includes("e")) {
    return `${move.to[0]}${move.from[1]}` as Square;
  }
  return move.to;
}

function getCaptureNetGain(capMove: Move, chessAfterCap: Chess, defenderColor: Color): number {
  if (!capMove.captured) return 0;
  const promoGain = capMove.promotion ? PIECE_VALUES[capMove.promotion] - 1 : 0;
  const capturedVal = PIECE_VALUES[capMove.captured] + promoGain;
  const replyLoss = staticExchangeOnSquare(chessAfterCap, capMove.to, defenderColor);
  return capturedVal - replyLoss;
}

function findSafeForkTargets(
  chess: Chess,
  destSq: Square,
  attackerColor: Color,
  defenderColor: Color,
  attackedSquares?: Square[]
): { square: Square; piece: string }[] {
  const board = chess.board();
  const movedPiece = chess.get(destSq);
  if (!movedPiece || movedPiece.color !== attackerColor) return [];

  const attackerVal = PIECE_VALUES[movedPiece.type];
  const attacked =
    attackedSquares ?? getPieceAttackedSquares(board, destSq, attackerColor, movedPiece.type);
  const targets: { square: Square; piece: string; sortVal: number }[] = [];
  for (const targetSq of attacked) {
    const [tr, tc] = toCoords(targetSq);
    const targetPiece = board[tr][tc];
    if (
      targetPiece &&
      targetPiece.color === defenderColor &&
      targetPiece.type !== "p" &&
      (targetPiece.type === "k" ||
        PIECE_VALUES[targetPiece.type] > attackerVal ||
        !chess.isAttacked(targetSq, defenderColor))
    ) {
      targets.push({
        square: targetSq,
        piece: PIECE_NAMES[targetPiece.type],
        sortVal: PIECE_VALUES[targetPiece.type],
      });
    }
  }

  if (targets.length < 2) return [];
  if (staticExchangeOnSquare(chess, destSq, defenderColor) > 0) return [];
  targets.sort((a, b) => b.sortVal - a.sortVal);
  return targets.map(({ square, piece }) => ({ square, piece }));
}

function findKingSquare(chess: Chess, color: Color): Square | null {
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === color && p.type === "k") {
        return toSquare(r, c);
      }
    }
  }
  return null;
}

function formatTargetSummary(targets: { square: Square; piece: string }[]): string {
  return targets
    .slice(0, 2)
    .map((t) => `${t.piece} on ${t.square}`)
    .join(" and ");
}

function resolveRefutationHangingPiece(
  chessAfter: Chess,
  refutationPlayed: { chess: Chess; move: Move } | null,
  activeColor: Color
): TacticalContext["hangingPieceDetails"] {
  if (!refutationPlayed || refutationPlayed.chess.isCheckmate()) return undefined;
  const capSq = getCapturedSquare(refutationPlayed.move);
  if (!capSq) return undefined;

  const victim = chessAfter.get(capSq);
  if (!victim || victim.color !== activeColor || victim.type === "k") return undefined;

  const refGain = getCaptureNetGain(refutationPlayed.move, refutationPlayed.chess, activeColor);
  if (refGain <= 0) return undefined;

  return {
    square: capSq,
    piece: PIECE_NAMES[victim.type],
    value: PIECE_VALUES[victim.type],
  };
}

function detectAllowedAndMissedThreats(
  fenBefore: string,
  moveSan: string,
  activeColor: Color,
  opponentColor: Color,
  refutationPlayed: { chess: Chess; move: Move } | null,
  options: ExtractTacticalOptions | undefined,
  addTag: (t: TacticalTag) => void
): {
  allowedThreat?: TacticalThreatDetail;
  missedTactic?: TacticalThreatDetail;
} {
  if (options?.badge !== undefined && !ERROR_BADGES.has(options.badge)) {
    return {};
  }

  let allowedThreat: TacticalThreatDetail | undefined;
  if (refutationPlayed) {
    const { chess: chessAfterRef, move: refMove } = refutationPlayed;
    if (chessAfterRef.isCheckmate()) {
      const kingSq = findKingSquare(chessAfterRef, activeColor);
      addTag("ALLOWS_MATE");
      allowedThreat = {
        kind: "CHECKMATE",
        refutationMoveSan: refMove.san,
        targetSquares: kingSq ? [kingSq] : undefined,
        targetSummary: kingSq ? `King on ${kingSq}` : undefined,
      };
    } else {
      const refForks = findSafeForkTargets(chessAfterRef, refMove.to, opponentColor, activeColor);
      if (refForks.length >= 2) {
        addTag("ALLOWS_FORK");
        allowedThreat = {
          kind: "FORK",
          refutationMoveSan: refMove.san,
          targetSquares: refForks.slice(0, 2).map((t) => t.square),
          targetSummary: formatTargetSummary(refForks),
        };
      }
    }
  }

  let missedTactic: TacticalThreatDetail | undefined;
  if (options?.bestMoveSan && options.bestMoveSan !== moveSan) {
    const bestPlayed = playSafeMove(fenBefore, options.bestMoveSan);
    if (bestPlayed) {
      const { chess: chessAfterBest, move: bestMove } = bestPlayed;
      if (chessAfterBest.isCheckmate()) {
        const oppKingSq = findKingSquare(chessAfterBest, opponentColor);
        addTag("MISSED_MATE");
        missedTactic = {
          kind: "CHECKMATE",
          missedMoveSan: bestMove.san,
          targetSquares: oppKingSq ? [oppKingSq] : undefined,
          targetSummary: oppKingSq ? `King on ${oppKingSq}` : undefined,
        };
      } else {
        const capSq = getCapturedSquare(bestMove);
        const netGain = capSq ? getCaptureNetGain(bestMove, chessAfterBest, opponentColor) : 0;
        const missedForks = findSafeForkTargets(
          chessAfterBest,
          bestMove.to,
          activeColor,
          opponentColor
        );
        const allowPawnCap =
          options?.badge === undefined || SEVERE_ERROR_BADGES.has(options.badge);
        const setMissedCapture = () => {
          if (!capSq || !bestMove.captured) return;
          addTag("MISSED_CAPTURE");
          missedTactic = {
            kind: "FREE_CAPTURE",
            missedMoveSan: bestMove.san,
            targetSquares: [capSq],
            targetSummary: `${PIECE_NAMES[bestMove.captured]} on ${capSq}`,
            netGain,
            isExchange:
              bestMove.captured === "r" &&
              !bestMove.promotion &&
              PIECE_VALUES[bestMove.captured] - netGain >= 2,
          };
        };

        if (netGain >= 2 && capSq && bestMove.captured) {
          setMissedCapture();
        } else if (missedForks.length >= 2) {
          addTag("MISSED_FORK");
          missedTactic = {
            kind: "FORK",
            missedMoveSan: bestMove.san,
            targetSquares: missedForks.slice(0, 2).map((t) => t.square),
            targetSummary: formatTargetSummary(missedForks),
          };
        } else if (allowPawnCap && netGain >= 1 && capSq && bestMove.captured) {
          setMissedCapture();
        }
      }
    }
  }

  return { allowedThreat, missedTactic };
}

/**
 * Extracts tactical and positional features between position before and after a move.
 */
export function extractTacticalContext(
  fenBefore: string,
  fenAfter: string,
  moveSan: string,
  moveNumber: number,
  options?: ExtractTacticalOptions
): TacticalContext {
  const chessBefore = new Chess(fenBefore);
  const chessAfter = new Chess(fenAfter);

  const tags: TacticalTag[] = [];
  const tagSet = new Set<TacticalTag>();
  const addTag = (t: TacticalTag) => {
    if (!tagSet.has(t)) {
      tagSet.add(t);
      tags.push(t);
    }
  };

  let hangingPieceDetails: TacticalContext["hangingPieceDetails"];
  let pinnedPieceDetails: TacticalContext["pinnedPieceDetails"];
  let skeweredPieceDetails: TacticalContext["skeweredPieceDetails"];
  let discoveredTarget: TacticalContext["discoveredTarget"];
  const forkTargets: { square: Square; piece: string }[] = [];

  const activeColor = chessBefore.turn(); // The player who just moved
  const opponentColor: Color = activeColor === "w" ? "b" : "w";
  const gamePhase = determineGamePhase(chessBefore, moveNumber);
  const hadMateInOneBefore = !chessBefore.inCheck() && hasMateInOne(fenBefore, activeColor);

  // Resolve exact move object from chessBefore so disambiguation/promotions/captures are exact
  let movedObj: Move | null = null;
  try {
    movedObj = chessBefore.move(moveSan);
  } catch {
    movedObj = null;
  }

  const isCheck = chessAfter.inCheck();
  const isCastle =
    moveSan.startsWith("O-O") ||
    (movedObj ? movedObj.flags.includes("k") || movedObj.flags.includes("q") : false);

  if (isCastle) {
    addTag("KING_SAFETY_CASTLE");
  }

  const boardAfter = chessAfter.board();

  // 1. Piece Development Tag (Opening phase minor pieces moving forward off their back rank)
  if (gamePhase === "Opening" && movedObj) {
    const isMinor = movedObj.piece === "n" || movedObj.piece === "b";
    const backRank = activeColor === "w" ? "1" : "8";
    if (isMinor && movedObj.from[1] === backRank && movedObj.to[1] !== backRank) {
      addTag("DEVELOPMENT");
    }
  }

  // 2. Center Control Tag (e4, d4, e5, d5 occupied or targeted by piece/pawn)
  const centerSquares: Square[] = ["e4", "d4", "e5", "d5"];
  const destSquare = movedObj?.to;
  if (destSquare && centerSquares.includes(destSquare)) {
    addTag("CENTER_CONTROL");
  } else if (destSquare && movedObj && gamePhase !== "Endgame") {
    const movedPieceAfter = chessAfter.get(destSquare);
    if (
      movedPieceAfter &&
      (movedPieceAfter.type === "p" || movedPieceAfter.type === "n" || movedPieceAfter.type === "b")
    ) {
      const attackedCenter = getPieceAttackedSquares(
        boardAfter,
        destSquare,
        activeColor,
        movedPieceAfter.type
      );
      if (attackedCenter.some((sq) => centerSquares.includes(sq))) {
        addTag("CENTER_CONTROL");
      }
    }
  }

  const refutationPlayed = playSafeMove(fenAfter, options?.refutationPvSan?.[0]);

  // 3. Hanging Piece Detection: prioritize the piece targeted by engine's refutation capture first
  hangingPieceDetails = resolveRefutationHangingPiece(chessAfter, refutationPlayed, activeColor);
  if (!hangingPieceDetails && !refutationPlayed?.chess.isCheckmate()) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = boardAfter[r][c];
        if (!piece || piece.color !== activeColor || piece.type === "k") continue;
        const sq = toSquare(r, c);

        const seeLoss = staticExchangeOnSquare(chessAfter, sq, opponentColor);
        if (seeLoss <= 0) continue;

        const pieceValue = PIECE_VALUES[piece.type];
        if (!hangingPieceDetails || pieceValue > hangingPieceDetails.value) {
          hangingPieceDetails = {
            square: sq,
            piece: PIECE_NAMES[piece.type],
            value: pieceValue,
          };
        }
      }
    }
  }
  if (hangingPieceDetails) {
    addTag("HANGING_PIECE");
  }

  // 4. Tactical Fork Detection (strictly from the moved piece's destination square!)
  if (movedObj) {
    const movedPieceAfter = chessAfter.get(movedObj.to);
    if (movedPieceAfter && movedPieceAfter.color === activeColor) {
      const attackedFromDest = getPieceAttackedSquares(
        boardAfter,
        movedObj.to,
        activeColor,
        movedPieceAfter.type
      );
      const safeForks = findSafeForkTargets(
        chessAfter,
        movedObj.to,
        activeColor,
        opponentColor,
        attackedFromDest
      );
      if (safeForks.length >= 2) {
        forkTargets.push(...safeForks);
        addTag("TACTICAL_FORK");
      }

      // 5. Tempo Gain: minor piece or pawn attacks enemy Queen or Rook
      if (movedPieceAfter.type === "p" || movedPieceAfter.type === "n" || movedPieceAfter.type === "b") {
        const attacksMajor = attackedFromDest.some((sq) => {
          const [tr, tc] = toCoords(sq);
          const tp = boardAfter[tr][tc];
          return tp && tp.color === opponentColor && (tp.type === "q" || tp.type === "r");
        });
        if (attacksMajor) {
          addTag("TEMPO_GAIN");
        }
      }

      // 6. Pawn Break: pawn advance attacking an enemy pawn
      if (movedPieceAfter.type === "p") {
        const attacksEnemyPawn = attackedFromDest.some((sq) => {
          const [tr, tc] = toCoords(sq);
          const tp = boardAfter[tr][tc];
          return tp && tp.color === opponentColor && tp.type === "p";
        });
        if (attacksEnemyPawn) {
          addTag("PAWN_BREAK");
        }
      }

      // 7. Pin & Skewer Ray Detection from moved slider piece
      if (
        movedPieceAfter.type === "b" ||
        movedPieceAfter.type === "r" ||
        movedPieceAfter.type === "q"
      ) {
        const dirs =
          movedPieceAfter.type === "r"
            ? ORTHOGONAL_DIRS
            : movedPieceAfter.type === "b"
            ? DIAGONAL_DIRS
            : [...ORTHOGONAL_DIRS, ...DIAGONAL_DIRS];

        const [sr, sc] = toCoords(movedObj.to);

        for (const [dr, dc] of dirs) {
          let nr = sr + dr;
          let nc = sc + dc;
          let firstEnemy: { sq: Square; type: PieceSymbol } | null = null;
          let secondEnemy: { sq: Square; type: PieceSymbol } | null = null;

          while (inBounds(nr, nc)) {
            const cell = boardAfter[nr][nc];
            if (cell) {
              if (cell.color === activeColor) {
                break; // Blocked by friendly piece
              }
              if (!firstEnemy) {
                firstEnemy = { sq: toSquare(nr, nc), type: cell.type };
              } else {
                secondEnemy = { sq: toSquare(nr, nc), type: cell.type };
                break;
              }
            }
            nr += dr;
            nc += dc;
          }

          if (firstEnemy && secondEnemy) {
            if (secondEnemy.type === "k") {
              addTag("ABSOLUTE_PIN");
              pinnedPieceDetails ??= {
                square: firstEnemy.sq,
                piece: PIECE_NAMES[firstEnemy.type],
                pinnedTo: "King",
              };
            } else {
              const frontAttacksAttacker = getPieceAttackedSquares(
                boardAfter,
                firstEnemy.sq,
                opponentColor,
                firstEnemy.type
              ).includes(movedObj.to);
              const attackerDefended = chessAfter.isAttacked(movedObj.to, activeColor);
              const frontDefended = chessAfter.isAttacked(firstEnemy.sq, opponentColor);

              if (
                firstEnemy.type === "k" ||
                (PIECE_VALUES[firstEnemy.type] > PIECE_VALUES[secondEnemy.type] &&
                  PIECE_VALUES[secondEnemy.type] >= 3 &&
                  (!frontAttacksAttacker || attackerDefended) &&
                  (PIECE_VALUES[movedPieceAfter.type] < PIECE_VALUES[firstEnemy.type] || !frontDefended))
              ) {
                addTag("SKEWER");
                skeweredPieceDetails ??= {
                  frontSquare: firstEnemy.sq,
                  frontPiece: PIECE_NAMES[firstEnemy.type],
                  backSquare: secondEnemy.sq,
                  backPiece: PIECE_NAMES[secondEnemy.type],
                };
              } else if (
                (secondEnemy.type === "q" || secondEnemy.type === "r") &&
                PIECE_VALUES[secondEnemy.type] > PIECE_VALUES[firstEnemy.type]
              ) {
                addTag("RELATIVE_PIN");
                pinnedPieceDetails ??= {
                  square: firstEnemy.sq,
                  piece: PIECE_NAMES[firstEnemy.type],
                  pinnedTo: PIECE_NAMES[secondEnemy.type],
                };
              }
            }
          }
        }
      }

      // 8. Discovered Attack Detection: check rays passing through vacated `movedObj.from`
      const [fr, fc] = toCoords(movedObj.from);
      for (const [dr, dc] of [...ORTHOGONAL_DIRS, ...DIAGONAL_DIRS]) {
        const isOrtho = dr === 0 || dc === 0;
        // Walk backwards (-dr, -dc) to find a friendly slider behind `from`
        let br = fr - dr;
        let bc = fc - dc;
        let sliderFound = false;
        while (inBounds(br, bc)) {
          const cell = boardAfter[br][bc];
          if (cell) {
            if (
              cell.color === activeColor &&
              (cell.type === "q" ||
                (isOrtho && cell.type === "r") ||
                (!isOrtho && cell.type === "b"))
            ) {
              sliderFound = true;
            }
            break;
          }
          br -= dr;
          bc -= dc;
        }

        if (!sliderFound) continue;

        // Walk forward (+dr, +dc) in boardAfter to check if the unblocked ray hits an enemy valuable piece
        let ar = fr + dr;
        let ac = fc + dc;
        while (inBounds(ar, ac)) {
          const cell = boardAfter[ar][ac];
          if (cell) {
            if (
              cell.color === opponentColor &&
              PIECE_VALUES[cell.type] >= 3
            ) {
              addTag("DISCOVERED_ATTACK");
              discoveredTarget ??= {
                square: toSquare(ar, ac),
                piece: PIECE_NAMES[cell.type],
              };
            }
            break;
          }
          ar += dr;
          ac += dc;
        }
      }
    }
  }

  // 9. Checkmate Threat Detection: if opponent isn't in check and activeColor didn't already miss mate-in-1
  if (!isCheck && !hadMateInOneBefore && !chessAfter.isGameOver()) {
    if (hasMateInOne(fenAfter, activeColor)) {
      addTag("CHECKMATE_THREAT");
    }
  }

  // 10. Trapped Piece Detection: enemy non-pawn attacked by friendly piece with zero safe escape squares
  const testTrappedFenParts = chessAfter.fen().split(" ");
  if (!isCheck && testTrappedFenParts[1] === opponentColor) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const ep = boardAfter[r][c];
        if (!ep || ep.color !== opponentColor || ep.type === "p" || ep.type === "k") continue;
        const sq = toSquare(r, c);
        const attackerVal = getLowestAttackerValue(boardAfter, sq, activeColor);
        if (attackerVal === null) continue;
        if (attackerVal < PIECE_VALUES[ep.type] || !chessAfter.isAttacked(sq, opponentColor)) {
          const pieceMoves = chessAfter.moves({ square: sq, verbose: true });
          const hasSafeEscape = pieceMoves.some((m) => {
            const tmp = new Chess(chessAfter.fen());
            tmp.move(m);
            const seeDest = staticExchangeOnSquare(tmp, m.to, activeColor);
            const capVal = m.captured ? PIECE_VALUES[m.captured] : 0;
            return seeDest === 0 || capVal >= seeDest;
          });
          if (!hasSafeEscape) {
            addTag("TRAPPED_PIECE");
            break;
          }
        }
      }
      if (tagSet.has("TRAPPED_PIECE")) break;
    }
  }

  const { allowedThreat, missedTactic } = detectAllowedAndMissedThreats(
    fenBefore,
    moveSan,
    activeColor,
    opponentColor,
    refutationPlayed,
    options,
    addTag
  );

  return {
    tags,
    hangingPieceDetails,
    forkTargets: forkTargets.length >= 2 ? forkTargets : undefined,
    pinnedPieceDetails,
    skeweredPieceDetails,
    discoveredTarget,
    allowedThreat,
    missedTactic,
    isCheck,
    isCastle,
    gamePhase,
  };
}
