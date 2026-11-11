import React from "react";

interface EvalBarProps {
  whiteCp: number;
  whiteMate?: number;
  evalLabel: string;
  flipped?: boolean;
}

/**
 * Calibrated Chess.com-like evaluation bar height percentage for White:
 * h_white = clamp(50 + 50 * tanh(0.0026 * cp), 3%, 97%)
 * Forced mates clamp to 100% (White mates) or 0% (Black mates).
 */
export function computeWhiteBarPercent(whiteCp: number, whiteMate?: number): number {
  if (whiteMate !== undefined && whiteMate !== 0) {
    return whiteMate > 0 ? 100 : 0;
  }
  const raw = 50 + 50 * Math.tanh(0.0026 * whiteCp);
  return Math.min(97, Math.max(3, raw));
}

export function EvalBar({ whiteCp, whiteMate, evalLabel, flipped = false }: EvalBarProps) {
  const whitePct = computeWhiteBarPercent(whiteCp, whiteMate);
  const whiteWinning =
    whiteMate !== undefined && whiteMate !== 0 ? whiteMate > 0 : whiteCp >= 0;

  return (
    <div
      className="relative flex h-full w-6 shrink-0 flex-col overflow-hidden rounded-sm border border-[#3d3b38] bg-[#262522] select-none sm:w-7"
      aria-label={`Evaluation ${evalLabel}`}
    >
      {/* When not flipped, Black is at top and White fills from bottom */}
      {!flipped ? (
        <>
          <div
            className="w-full bg-[#312e2b] transition-all duration-300"
            style={{
              height: `${100 - whitePct}%`,
              transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
          <div
            data-testid="eval-bar-white-fill"
            className="w-full bg-[#ffffff] transition-all duration-300"
            style={{
              height: `${whitePct}%`,
              transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </>
      ) : (
        <>
          <div
            data-testid="eval-bar-white-fill"
            className="w-full bg-[#ffffff] transition-all duration-300"
            style={{
              height: `${whitePct}%`,
              transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
          <div
            className="w-full bg-[#312e2b] transition-all duration-300"
            style={{
              height: `${100 - whitePct}%`,
              transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </>
      )}

      {/* Numeric label pinned to winning side */}
      <span
        className={`pointer-events-none absolute left-0 right-0 text-center text-[10px] font-bold tracking-tighter ${
          whiteWinning
            ? flipped
              ? "top-1.5 text-[#1f1e1c]"
              : "bottom-1.5 text-[#1f1e1c]"
            : flipped
            ? "bottom-1.5 text-white"
            : "top-1.5 text-white"
        }`}
      >
        {evalLabel}
      </span>
    </div>
  );
}
