import { Chess, PieceSymbol, Square } from "chess.js";

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

/**
 * Runs a Static Exchange Evaluation (SEE) on `targetSquare` assuming `sideToCapture`
 * initiates the capture sequence. Returns the net material score from `sideToCapture`'s perspective.
 */
function staticExchangeOnSquare(
  chess: Chess,
  targetSquare: Square,
  sideToCapture: "w" | "b"
): number {
  const targetPiece = chess.get(targetSquare);
  if (!targetPiece || targetPiece.color === sideToCapture) return 0;

  // Find lowest-value legal capture onto targetSquare
  const legalMoves = chess.moves({ verbose: true }).filter((m) => m.to === targetSquare);
  if (legalMoves.length === 0) return 0;

  // Sort by least valuable attacker first (putting King last unless no other attacker)
  legalMoves.sort((a, b) => {
    const valA = a.piece === "k" ? 100 : PIECE_VALUES[a.piece];
    const valB = b.piece === "k" ? 100 : PIECE_VALUES[b.piece];
    return valA - valB;
  });

  const bestCapture = legalMoves[0];
  const capturedVal = PIECE_VALUES[targetPiece.type] + (bestCapture.promotion ? PIECE_VALUES[bestCapture.promotion] - 1 : 0);

  // Clone position and play the capture to evaluate opponent's best recapture
  const nextChess = new Chess(chess.fen());
  nextChess.move({
    from: bestCapture.from,
    to: bestCapture.to,
    promotion: bestCapture.promotion,
  });

  const nextSide = sideToCapture === "w" ? "b" : "w";
  const replyGain = staticExchangeOnSquare(nextChess, targetSquare, nextSide);

  // Side to capture can always choose NOT to recapture if replyGain > capturedVal,
  // wait: the current capture happens, then opponent decides whether to recapture (Math.max(0, replyGain))
  return Math.max(0, capturedVal - replyGain);
}

/**
 * Calculates the real net material sacrificed (in pawn units) by playing `moveSan` from `fenBefore`.
 * Uses Static Exchange Evaluation (SEE) on the destination square and any newly exposed friendly pieces
 * so equal trades (Qxd4 cxd4) and winning free captures return 0, while genuine sacrifices
 * (e.g. 24. Rxd4!! in Kasparov vs Topalov or 7. Bxh7+!!) return >= 2.
 */
export function calculateMaterialSacrifice(fenBefore: string, moveSan: string): number {
  const chessBefore = new Chess(fenBefore);
  const activeColor = chessBefore.turn();
  const opponentColor = activeColor === "w" ? "b" : "w";

  const move = chessBefore.move(moveSan);
  if (!move) return 0;

  const immediateGain = move.captured ? PIECE_VALUES[move.captured] : 0;
  const chessAfter = new Chess(chessBefore.fen());

  // 1. Evaluate SEE on destination square (did the moved piece step onto a square where opponent wins material?)
  const opponentSeeOnDest = staticExchangeOnSquare(chessAfter, move.to, opponentColor);
  const netDestLoss = Math.max(0, opponentSeeOnDest - immediateGain);

  // 2. Also check if another friendly piece (value >= 3) is profitably capturable right now (e.g. quiet/desperado sacrifice)
  let maxOtherLoss = 0;
  const boardAfter = chessAfter.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = boardAfter[r][c];
      if (!piece || piece.color !== activeColor || piece.type === "p" || piece.type === "k") continue;
      const sq = `${String.fromCharCode(97 + c)}${8 - r}` as Square;
      if (sq === move.to) continue;
      const seeLoss = staticExchangeOnSquare(chessAfter, sq, opponentColor);
      const netLoss = Math.max(0, seeLoss - immediateGain);
      if (netLoss > maxOtherLoss) {
        maxOtherLoss = netLoss;
      }
    }
  }

  return Math.max(netDestLoss, maxOtherLoss);
}
