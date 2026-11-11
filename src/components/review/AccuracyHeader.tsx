import React from "react";
import type { PlayerSummary } from "@/lib/analysis/game-analyzer";

interface AccuracyHeaderProps {
  whiteName: string;
  blackName: string;
  whiteEloHeader?: string;
  blackEloHeader?: string;
  summary: {
    white: PlayerSummary;
    black: PlayerSummary;
  };
  coachColor?: "white" | "black";
  onSelectCoachColor?: (color: "white" | "black") => void;
}

export function AccuracyHeader({
  whiteName,
  blackName,
  whiteEloHeader,
  blackEloHeader,
  summary,
  coachColor = "white",
  onSelectCoachColor,
}: AccuracyHeaderProps) {
  const isWhiteCoached = coachColor === "white";
  const isBlackCoached = coachColor === "black";

  return (
    <div className="rounded-md border border-[#3d3b38] bg-[#21201d] p-2.5 sm:p-3">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {/* White */}
        <button
          type="button"
          onClick={() => onSelectCoachColor?.("white")}
          aria-label="Coach as White"
          aria-pressed={isWhiteCoached}
          className={`flex flex-col items-center rounded bg-[#262522] p-2 transition sm:p-2.5 ${
            isWhiteCoached
              ? "ring-2 ring-[#96bc4b] shadow-md"
              : "opacity-85 hover:opacity-100"
          } ${onSelectCoachColor ? "cursor-pointer" : "cursor-default"}`}
        >
          <div className="flex w-full items-center justify-center gap-1.5">
            <span className="h-3 w-3 shrink-0 rounded-sm border border-[#524f4b] bg-white" />
            <span className="max-w-[105px] truncate text-xs font-bold text-white">
              {whiteName || "White"}
            </span>
          </div>
          {whiteEloHeader && (
            <span className="text-[10px] text-[#9e9c98]">Rating: {whiteEloHeader}</span>
          )}
          <div className="mt-1 rounded bg-white px-2.5 py-0.5 text-sm font-black text-[#1a1917] sm:mt-1.5 sm:px-3 sm:py-1 sm:text-base">
            {summary.white.accuracy.toFixed(1)}%
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-[10px] text-[#9e9c98]">
              Rating ~{summary.white.estimatedElo}
            </span>
            {isWhiteCoached && (
              <span className="rounded bg-[#96bc4b]/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#96bc4b]">
                Coaching
              </span>
            )}
          </div>
        </button>

        {/* Black */}
        <button
          type="button"
          onClick={() => onSelectCoachColor?.("black")}
          aria-label="Coach as Black"
          aria-pressed={isBlackCoached}
          className={`flex flex-col items-center rounded bg-[#262522] p-2 transition sm:p-2.5 ${
            isBlackCoached
              ? "ring-2 ring-[#96bc4b] shadow-md"
              : "opacity-85 hover:opacity-100"
          } ${onSelectCoachColor ? "cursor-pointer" : "cursor-default"}`}
        >
          <div className="flex w-full items-center justify-center gap-1.5">
            <span className="h-3 w-3 shrink-0 rounded-sm border border-[#524f4b] bg-[#191816]" />
            <span className="max-w-[105px] truncate text-xs font-bold text-white">
              {blackName || "Black"}
            </span>
          </div>
          {blackEloHeader && (
            <span className="text-[10px] text-[#9e9c98]">Rating: {blackEloHeader}</span>
          )}
          <div className="mt-1 rounded bg-[#141311] px-2.5 py-0.5 text-sm font-black text-white ring-1 ring-[#3d3b38] sm:mt-1.5 sm:px-3 sm:py-1 sm:text-base">
            {summary.black.accuracy.toFixed(1)}%
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-[10px] text-[#9e9c98]">
              Rating ~{summary.black.estimatedElo}
            </span>
            {isBlackCoached && (
              <span className="rounded bg-[#96bc4b]/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#96bc4b]">
                Coaching
              </span>
            )}
          </div>
        </button>
      </div>
    </div>
  );
}
