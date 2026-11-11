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
}

export function AccuracyHeader({
  whiteName,
  blackName,
  whiteEloHeader,
  blackEloHeader,
  summary,
}: AccuracyHeaderProps) {
  return (
    <div className="rounded-md border border-[#3d3b38] bg-[#21201d] p-3">
      <div className="grid grid-cols-2 gap-3">
        {/* White */}
        <div className="flex flex-col items-center rounded bg-[#262522] p-2.5">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border border-[#524f4b] bg-white" />
            <span className="max-w-[115px] truncate text-xs font-bold text-white">
              {whiteName || "White"}
            </span>
          </div>
          {whiteEloHeader && (
            <span className="text-[10px] text-[#9e9c98]">Rating: {whiteEloHeader}</span>
          )}
          <div className="mt-1.5 rounded bg-white px-3 py-1 text-base font-black text-[#1a1917]">
            {summary.white.accuracy.toFixed(1)}%
          </div>
          <span className="mt-1 text-[10px] text-[#9e9c98]">
            Game Rating ~{summary.white.estimatedElo}
          </span>
        </div>

        {/* Black */}
        <div className="flex flex-col items-center rounded bg-[#262522] p-2.5">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border border-[#524f4b] bg-[#191816]" />
            <span className="max-w-[115px] truncate text-xs font-bold text-white">
              {blackName || "Black"}
            </span>
          </div>
          {blackEloHeader && (
            <span className="text-[10px] text-[#9e9c98]">Rating: {blackEloHeader}</span>
          )}
          <div className="mt-1.5 rounded bg-[#141311] px-3 py-1 text-base font-black text-white ring-1 ring-[#3d3b38]">
            {summary.black.accuracy.toFixed(1)}%
          </div>
          <span className="mt-1 text-[10px] text-[#9e9c98]">
            Game Rating ~{summary.black.estimatedElo}
          </span>
        </div>
      </div>
    </div>
  );
}
