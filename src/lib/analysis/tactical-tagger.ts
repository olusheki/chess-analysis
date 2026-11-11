/**
 * Deterministic Tactical and Strategic Feature Detector
 * Extracts verifiable chess features from FEN positions before and after a move.
 * These tags ground the AI Coach explanations to eliminate LLM hallucinations.
 */

import { Chess, Square, PieceSymbol, Color, Move } from "chess.js";

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
  | "PAWN_BREAK";

export interface TacticalContext {
  tags: TacticalTag[];
  hangingPieceDetails?: { square: Square; piece: string; value: number };
  forkTargets?: { square: Square; piece: string }[];
  pinnedPieceDetails?: { square: Square; piece: string; pinnedTo: string };
  skeweredPieceDetails?: { frontSquare: Square; frontPiece: string; backSquare: Square; backPiece: string };
  discoveredTarget?: { square: Square; piece: string };
  isCheck: boolean;
  isCastle: boolean;
  gamePhase: "Opening" | "Middlegame" | "Endgame";
}

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};

const PIECE_NAMES: Record<PieceSymbol, string> = {
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
  if (moveNumber <= 10) return "Opening";

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
  return "Middlegame";
}

/**
 * Extracts tactical and positional features between position before and after a move.
 */
export function extractTacticalContext(
  fenBefore: string,
  fenAfter: string,
  moveSan: string,
  moveNumber: number
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

  // 1. Piece Development Tag (Opening phase minor pieces moving off back rank)
  if (gamePhase === "Opening") {
    const movedPieceType = movedObj?.piece;
    const isMinor =
      movedPieceType === "n" ||
      movedPieceType === "b" ||
      moveSan.startsWith("N") ||
      moveSan.startsWith("B");
    if (isMinor) {
      addTag("DEVELOPMENT");
    }
  }

  // 2. Center Control Tag (e4, d4, e5, d5 occupied or directly targeted)
  const centerSquares: Square[] = ["e4", "d4", "e5", "d5"];
  const destSquare = movedObj?.to;
  if (destSquare && centerSquares.includes(destSquare)) {
    addTag("CENTER_CONTROL");
  } else if (centerSquares.some((sq) => moveSan.includes(sq))) {
    addTag("CENTER_CONTROL");
  }

  const boardAfter = chessAfter.board();

  // 3. Hanging Piece Detection (prioritizing highest-value hanging piece)
  // Detects undefended attacked pieces OR high-value pieces attacked by strictly lower-value opponent pieces.
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = boardAfter[r][c];
      if (!piece || piece.color !== activeColor || piece.type === "k") continue;
      const sq = toSquare(r, c);

      const lowestAttacker = getLowestAttackerValue(boardAfter, sq, opponentColor);
      if (lowestAttacker === null) continue;

      const isDefended = chessAfter.isAttacked(sq, activeColor);
      const pieceValue = PIECE_VALUES[piece.type];

      if (!isDefended || lowestAttacker < pieceValue) {
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

      for (const targetSq of attackedFromDest) {
        const [tr, tc] = toCoords(targetSq);
        const targetPiece = boardAfter[tr][tc];
        if (
          targetPiece &&
          targetPiece.color === opponentColor &&
          targetPiece.type !== "p"
        ) {
          forkTargets.push({ square: targetSq, piece: PIECE_NAMES[targetPiece.type] });
        }
      }

      if (forkTargets.length >= 2) {
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
            } else if (
              firstEnemy.type === "k" ||
              (PIECE_VALUES[firstEnemy.type] > PIECE_VALUES[secondEnemy.type] &&
                PIECE_VALUES[secondEnemy.type] >= 3)
            ) {
              addTag("SKEWER");
              skeweredPieceDetails ??= {
                frontSquare: firstEnemy.sq,
                frontPiece: PIECE_NAMES[firstEnemy.type],
                backSquare: secondEnemy.sq,
                backPiece: PIECE_NAMES[secondEnemy.type],
              };
            } else if (PIECE_VALUES[secondEnemy.type] > PIECE_VALUES[firstEnemy.type]) {
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

  // 9. Checkmate Threat Detection: if opponent isn't in check, does activeColor threaten mate in 1?
  if (!isCheck && !chessAfter.isGameOver()) {
    try {
      const fenParts = chessAfter.fen().split(" ");
      fenParts[1] = activeColor;
      fenParts[3] = "-"; // Clear en-passant for probe
      const probe = new Chess(fenParts.join(" "));
      const legalReplies = probe.moves({ verbose: true });
      for (const reply of legalReplies) {
        probe.move(reply);
        const mates = probe.isCheckmate();
        probe.undo();
        if (mates) {
          addTag("CHECKMATE_THREAT");
          break;
        }
      }
    } catch {
      // Ignore invalid synthetic probe positions
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
            const destAttacker = getLowestAttackerValue(tmp.board(), m.to, activeColor);
            if (destAttacker === null) return true;
            if (m.captured && PIECE_VALUES[m.captured] >= PIECE_VALUES[ep.type]) return true;
            return destAttacker >= PIECE_VALUES[ep.type] && tmp.isAttacked(m.to, opponentColor);
          });
          if (!hasSafeEscape && pieceMoves.length <= 2) {
            addTag("TRAPPED_PIECE");
            break;
          }
        }
      }
      if (tagSet.has("TRAPPED_PIECE")) break;
    }
  }

  return {
    tags,
    hangingPieceDetails,
    forkTargets: forkTargets.length >= 2 ? forkTargets : undefined,
    pinnedPieceDetails,
    skeweredPieceDetails,
    discoveredTarget,
    isCheck,
    isCastle,
    gamePhase,
  };
}
