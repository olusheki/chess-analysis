import React, { useMemo, useState } from "react";
import { Chess, Square } from "chess.js";
import type { MoveBadge } from "@/lib/analysis/move-classifier";
import { ChessPieceSvg } from "./ChessPieces";
import { MoveBadgeIcon } from "./MoveBadgeIcon";
import { BoardArrow, BoardOverlays } from "./BoardOverlays";

export type BoardThemeId = "green" | "walnut" | "slate";

const BOARD_THEMES: Record<BoardThemeId, { light: string; dark: string }> = {
  green: { light: "#eeeed2", dark: "#769656" },
  walnut: { light: "#f0d9b5", dark: "#b58863" },
  slate: { light: "#dee3e6", dark: "#8ca2ad" },
};

interface ChessboardProps {
  fen: string;
  lastMove?: { from: Square; to: Square } | null;
  badge?: MoveBadge | null;
  arrows?: BoardArrow[];
  flipped?: boolean;
  interactive?: boolean;
  theme?: BoardThemeId;
  onMove?: (from: string, to: string, promotion?: string) => void;
}

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

export function Chessboard(props: ChessboardProps) {
  return (
    <ChessboardSurface
      key={`${props.fen}:${Boolean(props.interactive)}`}
      {...props}
    />
  );
}

function ChessboardSurface({
  fen,
  lastMove = null,
  badge = null,
  arrows = [],
  flipped = false,
  interactive = false,
  theme = "green",
  onMove,
}: ChessboardProps) {
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromo, setPendingPromo] = useState<{ from: Square; to: Square } | null>(null);

  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);

  const legalTargets = useMemo(() => {
    if (!interactive || !selectedSquare) return new Set<Square>();
    const moves = chess.moves({ square: selectedSquare, verbose: true });
    return new Set(moves.map((m) => m.to));
  }, [chess, interactive, selectedSquare]);

  const displayRanks = flipped ? [...RANKS].reverse() : RANKS;
  const displayFiles = flipped ? [...FILES].reverse() : FILES;
  const palette = BOARD_THEMES[theme];

  const handleSquareClick = (sq: Square) => {
    if (!interactive || !onMove) return;

    if (selectedSquare === sq) {
      setSelectedSquare(null);
      return;
    }

    if (selectedSquare && legalTargets.has(sq)) {
      const from = selectedSquare;
      const movingPiece = chess.get(from);
      setSelectedSquare(null);
      if (movingPiece?.type === "p" && (sq[1] === "8" || sq[1] === "1")) {
        setPendingPromo({ from, to: sq });
        return;
      }
      onMove(from, sq);
      return;
    }

    const piece = chess.get(sq);
    if (piece && piece.color === chess.turn()) {
      setPendingPromo(null);
      setSelectedSquare(sq);
    } else if (selectedSquare) {
      setSelectedSquare(null);
    }
  };

  return (
    <div className="relative aspect-square w-full select-none overflow-visible rounded-[3px] shadow-xl">
      <div className="grid h-full w-full grid-cols-8 grid-rows-8 overflow-hidden rounded-[3px]">
        {displayRanks.map((rank, rIdx) =>
          displayFiles.map((file, fIdx) => {
            const sq = `${file}${rank}` as Square;
            const fileNum = file.charCodeAt(0) - 97;
            const rankNum = parseInt(rank, 10) - 1;
            const isLight = (fileNum + rankNum) % 2 === 1;

            const isStart = lastMove?.from === sq;
            const isDest = lastMove?.to === sq;
            const isSelected = selectedSquare === sq;
            const isLegalTarget = legalTargets.has(sq);

            const piece = chess.get(sq);
            const showRankCoord = fIdx === 0;
            const showFileCoord = rIdx === 7;
            const coordColor = isLight ? palette.dark : palette.light;

            return (
              <div
                key={sq}
                data-testid={`square-${sq}`}
                onClick={() => handleSquareClick(sq)}
                className={`relative flex items-center justify-center ${
                  interactive ? "cursor-pointer" : ""
                }`}
                style={{
                  backgroundColor: isLight ? palette.light : palette.dark,
                }}
              >
                {/* Previous Move / Selection Highlight */}
                {(isStart || isSelected) && (
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{ backgroundColor: "rgba(247, 247, 105, 0.45)" }}
                  />
                )}
                {isDest && (
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{ backgroundColor: "rgba(247, 247, 105, 0.70)" }}
                  />
                )}

                {/* Algebraic Coordinates inside edge squares */}
                {showRankCoord && (
                  <span
                    className="pointer-events-none absolute left-1 top-0.5 text-[10px] font-bold leading-none"
                    style={{ color: coordColor }}
                  >
                    {rank}
                  </span>
                )}
                {showFileCoord && (
                  <span
                    className="pointer-events-none absolute bottom-0.5 right-1 text-[10px] font-bold leading-none"
                    style={{ color: coordColor }}
                  >
                    {file}
                  </span>
                )}

                {/* Legal target dot in interactive mode */}
                {isLegalTarget && !piece && (
                  <span className="pointer-events-none z-10 h-3.5 w-3.5 rounded-full bg-black/20" />
                )}
                {isLegalTarget && piece && (
                  <span className="pointer-events-none absolute inset-1 z-10 rounded-full border-[4px] border-black/25" />
                )}

                {/* Vector SVG Chess Piece */}
                {piece && (
                  <div className="relative z-[5] h-[86%] w-[86%] transition-transform duration-150">
                    <ChessPieceSvg color={piece.color} type={piece.type} />
                  </div>
                )}

                {/* Destination Square Move Badge Pin */}
                {isDest && badge && (
                  <div
                    data-testid="board-move-badge"
                    className="pointer-events-none absolute -right-1 -top-1 z-20"
                  >
                    <MoveBadgeIcon badge={badge} size="md" />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* SVG Tactical & Best Move Arrows */}
      <BoardOverlays arrows={arrows} flipped={flipped} />

      {/* Promotion Picker Overlay in Interactive Mode */}
      {pendingPromo && onMove && (
        <div
          data-testid="promotion-picker"
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50"
          onClick={() => setPendingPromo(null)}
        >
          <div
            className="flex items-center gap-2 rounded-lg border border-[#3d3b38] bg-[#262522] p-2.5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {(["q", "r", "b", "n"] as const).map((promo) => (
              <button
                key={promo}
                type="button"
                aria-label={`Promote to ${promo}`}
                onClick={() => {
                  const { from, to } = pendingPromo;
                  setPendingPromo(null);
                  onMove(from, to, promo);
                }}
                className="h-12 w-12 rounded border border-[#3d3b38] bg-[#312e2b] p-1.5 transition hover:border-[#96bc4b] hover:bg-[#3d3a36]"
              >
                <ChessPieceSvg color={chess.turn()} type={promo} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
