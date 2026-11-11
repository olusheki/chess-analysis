/**
 * Deterministic Tactical and Strategic Feature Detector
 * Extracts verifiable chess features from FEN positions before and after a move.
 * These tags ground the AI Coach explanations to eliminate LLM hallucinations.
 */

import { Chess, Square, PieceSymbol, Color } from "chess.js";

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

/**
 * Determines current game phase based on remaining piece material
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

  // If major material drops below 14 (e.g. queens off board or single rook/minor piece each)
  if (totalNonPawnMaterial <= 14) return "Endgame";
  return "Middlegame";
}

/**
 * Extracts tactical features between position before and after move
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
  let hangingPieceDetails: TacticalContext["hangingPieceDetails"];
  const forkTargets: { square: Square; piece: string }[] = [];

  const activeColor = chessBefore.turn(); // The player who just moved
  const opponentColor: Color = activeColor === "w" ? "b" : "w";
  const gamePhase = determineGamePhase(chessBefore, moveNumber);

  // Check & Castling detection
  const isCheck = chessAfter.inCheck();
  const isCastle = moveSan === "O-O" || moveSan === "O-O-O";

  if (isCastle) {
    tags.push("KING_SAFETY_CASTLE");
  }

  // 1. Piece Development Tag (Opening phase minor pieces)
  if (gamePhase === "Opening") {
    const isMinorPiece = moveSan.startsWith("N") || moveSan.startsWith("B");
    if (isMinorPiece) {
      tags.push("DEVELOPMENT");
    }
  }

  // 2. Center Control Tag (e4, d4, e5, d5 occupied or contested)
  const centerSquares: Square[] = ["e4", "d4", "e5", "d5"];
  for (const sq of centerSquares) {
    if (moveSan.includes(sq)) {
      tags.push("CENTER_CONTROL");
      break;
    }
  }

  // 3. Hanging Piece Detection in Position After Move
  // Scan player's pieces: are any of player's pieces attacked by opponent with 0 defenders?
  const boardAfter = chessAfter.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = boardAfter[r][c];
      if (piece && piece.color === activeColor && piece.type !== "k") {
        const file = String.fromCharCode(97 + c);
        const rank = (8 - r).toString();
        const sq = `${file}${rank}` as Square;

        // Check attackers from opponent
        const isAttacked = chessAfter.isAttacked(sq, opponentColor);
        const isDefended = chessAfter.isAttacked(sq, activeColor);

        if (isAttacked && !isDefended) {
          tags.push("HANGING_PIECE");
          hangingPieceDetails = {
            square: sq,
            piece: PIECE_NAMES[piece.type],
            value: PIECE_VALUES[piece.type],
          };
          break;
        }
      }
    }
    if (hangingPieceDetails) break;
  }

  // 4. Tactical Fork Detection
  // Check if player's moved piece attacks multiple valuable opponent pieces
  if (!tags.includes("HANGING_PIECE") && (moveSan.startsWith("N") || moveSan.startsWith("B") || moveSan.startsWith("Q") || moveSan.startsWith("R"))) {
    // Find dest square
    const destMatch = moveSan.match(/[a-h][1-8]/);
    if (destMatch) {
      const destSq = destMatch[0] as Square;
      let attackedValuablePieces = 0;

      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const targetPiece = boardAfter[r][c];
          if (targetPiece && targetPiece.color === opponentColor && (targetPiece.type === "q" || targetPiece.type === "r" || targetPiece.type === "k" || targetPiece.type === "b" || targetPiece.type === "n")) {
            const targetSq = `${String.fromCharCode(97 + c)}${8 - r}` as Square;
            if (chessAfter.isAttacked(targetSq, activeColor)) {
              attackedValuablePieces++;
              forkTargets.push({ square: targetSq, piece: PIECE_NAMES[targetPiece.type] });
            }
          }
        }
      }

      if (attackedValuablePieces >= 2) {
        tags.push("TACTICAL_FORK");
      }
    }
  }

  return {
    tags,
    hangingPieceDetails,
    forkTargets: forkTargets.length >= 2 ? forkTargets : undefined,
    isCheck,
    isCastle,
    gamePhase,
  };
}
