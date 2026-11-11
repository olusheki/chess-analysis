import React from "react";
import type { Square } from "chess.js";

export type ArrowCategory = "best" | "blunder" | "alternative" | "threat";

export interface BoardArrow {
  from: Square;
  to: Square;
  category: ArrowCategory;
}

export interface ArrowGeometry {
  start: { x: number; y: number };
  end: { x: number; y: number };
  isKnight: boolean;
  path: string;
}

const ARROW_STYLES: Record<ArrowCategory, { color: string; opacity: number; width: number }> = {
  best: { color: "#96bc4b", opacity: 0.88, width: 15 },
  blunder: { color: "#fa412d", opacity: 0.88, width: 15 },
  alternative: { color: "#5c8bb0", opacity: 0.82, width: 12 },
  threat: { color: "#f1b332", opacity: 0.8, width: 11 },
};

function squareToBoardCenter(sq: Square, flipped: boolean): { x: number; y: number; col: number; row: number } {
  const fileIdx = sq.charCodeAt(0) - 97; // 0..7
  const rankIdx = parseInt(sq[1], 10) - 1; // 0..7 (1..8)

  const col = flipped ? 7 - fileIdx : fileIdx;
  const row = flipped ? rankIdx : 7 - rankIdx;

  return {
    x: col * 100 + 50,
    y: row * 100 + 50,
    col,
    row,
  };
}

/**
 * Computes normalized 800x800 SVG path geometry from square `from` to square `to`,
 * using Chess.com's bent L-shaped path with a rounded corner for Knight moves.
 */
export function computeArrowGeometry(from: Square, to: Square, flipped: boolean): ArrowGeometry {
  const start = squareToBoardCenter(from, flipped);
  const target = squareToBoardCenter(to, flipped);

  const dx = target.col - start.col;
  const dy = target.row - start.row;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  const isKnight = (absDx === 1 && absDy === 2) || (absDx === 2 && absDy === 1);
  const tipShorten = 22; // Leave room for crisp arrowhead triangle

  if (isKnight) {
    // Move along the longer leg first, then turn 90 degrees toward target
    const elbow =
      absDx === 2
        ? { x: target.x, y: start.y }
        : { x: start.x, y: target.y };

    const leg2Dx = target.x - elbow.x;
    const leg2Dy = target.y - elbow.y;
    const leg2Len = Math.hypot(leg2Dx, leg2Dy) || 1;
    const endX = target.x - (leg2Dx / leg2Len) * tipShorten;
    const endY = target.y - (leg2Dy / leg2Len) * tipShorten;

    // Rounded L corner radius 18px
    const r = 18;
    const leg1Dx = elbow.x - start.x;
    const leg1Dy = elbow.y - start.y;
    const leg1Len = Math.hypot(leg1Dx, leg1Dy) || 1;

    const p1x = elbow.x - (leg1Dx / leg1Len) * r;
    const p1y = elbow.y - (leg1Dy / leg1Len) * r;
    const p2x = elbow.x + (leg2Dx / leg2Len) * r;
    const p2y = elbow.y + (leg2Dy / leg2Len) * r;

    const startOffset = 14;
    const sx = start.x + (leg1Dx / leg1Len) * startOffset;
    const sy = start.y + (leg1Dy / leg1Len) * startOffset;

    const path = `M ${sx} ${sy} L ${p1x} ${p1y} Q ${elbow.x} ${elbow.y} ${p2x} ${p2y} L ${endX} ${endY}`;
    return {
      start: { x: start.x, y: start.y },
      end: { x: endX, y: endY },
      isKnight: true,
      path,
    };
  }

  const vx = target.x - start.x;
  const vy = target.y - start.y;
  const len = Math.hypot(vx, vy) || 1;
  const startOffset = 14;

  const sx = start.x + (vx / len) * startOffset;
  const sy = start.y + (vy / len) * startOffset;
  const ex = target.x - (vx / len) * tipShorten;
  const ey = target.y - (vy / len) * tipShorten;

  return {
    start: { x: start.x, y: start.y },
    end: { x: ex, y: ey },
    isKnight: false,
    path: `M ${sx} ${sy} L ${ex} ${ey}`,
  };
}

interface BoardOverlaysProps {
  arrows: BoardArrow[];
  flipped: boolean;
}

export function BoardOverlays({ arrows, flipped }: BoardOverlaysProps) {
  if (arrows.length === 0) return null;

  return (
    <svg
      viewBox="0 0 800 800"
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
      aria-label="Board tactical arrows"
    >
      <defs>
        {(Object.keys(ARROW_STYLES) as ArrowCategory[]).map((cat) => (
          <marker
            key={cat}
            id={`arrowhead-${cat}`}
            markerWidth="3.2"
            markerHeight="3.2"
            refX="1.6"
            refY="1.6"
            orient="auto"
          >
            <polygon points="0 0.2, 3.1 1.6, 0 3.0" fill={ARROW_STYLES[cat].color} />
          </marker>
        ))}
      </defs>

      {arrows.map((arrow, idx) => {
        const style = ARROW_STYLES[arrow.category];
        const geom = computeArrowGeometry(arrow.from, arrow.to, flipped);
        return (
          <path
            key={`${arrow.category}-${arrow.from}-${arrow.to}-${idx}`}
            d={geom.path}
            fill="none"
            stroke={style.color}
            strokeWidth={style.width}
            strokeOpacity={style.opacity}
            strokeLinecap="round"
            markerEnd={`url(#arrowhead-${arrow.category})`}
          />
        );
      })}
    </svg>
  );
}
