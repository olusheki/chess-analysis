import React from "react";
import { BADGE_METADATA, MoveBadge } from "@/lib/analysis/move-classifier";
import type { PlayerSummary } from "@/lib/analysis/game-analyzer";
import { MoveBadgeIcon } from "@/components/chess/MoveBadgeIcon";

interface MoveBadgeSummaryProps {
  summary: {
    white: PlayerSummary;
    black: PlayerSummary;
  };
}

const DISPLAY_ORDER: MoveBadge[] = [
  "Brilliant",
  "Great",
  "Best",
  "Excellent",
  "Good",
  "Book",
  "Inaccuracy",
  "Mistake",
  "Miss",
  "Blunder",
  "Forced",
];

export function MoveBadgeSummary({ summary }: MoveBadgeSummaryProps) {
  return (
    <div className="space-y-3 rounded-md border border-[#3d3b38] bg-[#21201d] p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[#9e9c98]">
        Move Classification
      </div>

      <div className="space-y-1.5">
        {DISPLAY_ORDER.map((badge) => {
          const wCount = summary.white.badgeCounts[badge] ?? 0;
          const bCount = summary.black.badgeCounts[badge] ?? 0;
          const color = BADGE_METADATA[badge].color;

          return (
            <div
              key={badge}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded bg-[#262522]/70 px-2.5 py-1 text-xs"
            >
              <span
                className="text-right font-bold tabular-nums"
                style={{ color: wCount > 0 ? color : "#6b6965" }}
              >
                {wCount}
              </span>
              <div className="flex w-28 items-center justify-center gap-1.5">
                <MoveBadgeIcon badge={badge} size="xs" />
                <span className="font-medium text-[#d8d6d2]">{badge}</span>
              </div>
              <span
                className="text-left font-bold tabular-nums"
                style={{ color: bCount > 0 ? color : "#6b6965" }}
              >
                {bCount}
              </span>
            </div>
          );
        })}
      </div>

      {/* Phase Breakdown */}
      <div className="border-t border-[#3d3b38] pt-2.5">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#9e9c98]">
          Phase Accuracy
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
          {(["opening", "middlegame", "endgame"] as const).map((phase) => {
            const wCount = summary.white.phaseMoveCounts?.[phase] ?? 1;
            const bCount = summary.black.phaseMoveCounts?.[phase] ?? 1;
            return (
              <div key={phase} className="rounded bg-[#262522] p-1.5">
                <div className="capitalize text-[#9e9c98]">{phase}</div>
                <div className="mt-0.5 font-bold text-white">
                  {wCount === 0 && bCount === 0 ? (
                    <span className="text-[#6b6965]">—</span>
                  ) : (
                    <>
                      {wCount === 0 ? "—" : `${summary.white.phaseAccuracies[phase]}%`} /{" "}
                      <span className="text-[#c9c7c3]">
                        {bCount === 0 ? "—" : `${summary.black.phaseAccuracies[phase]}%`}
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
