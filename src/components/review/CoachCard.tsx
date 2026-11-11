"use client";

import React from "react";
import { RotateCcw, Eye, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";
import { BADGE_METADATA, MoveBadge } from "@/lib/analysis/move-classifier";
import type { CoachExplanationResponse, GameStorylineResponse } from "@/lib/ai/gemini-coach";
import { CoachPersonaId, getCoachPersona } from "@/lib/ai/coach-personas";
import type { RetryState } from "@/lib/store/useReviewStore";
import { MoveBadgeIcon } from "@/components/chess/MoveBadgeIcon";

interface CoachCardProps {
  personaId: CoachPersonaId;
  moveNumber?: number;
  playedBy?: "White" | "Black";
  moveSan?: string;
  badge?: MoveBadge;
  evalLabel?: string;
  bestMoveSan?: string;
  bestMovePvSan?: string[];
  explanation?: CoachExplanationResponse | null;
  storyline?: GameStorylineResponse | null;
  openingLabel?: string;
  openingInsight?: string;
  retryState: RetryState;
  showBestMove: boolean;
  bestMovePreviewIndex: number;
  loadingExplanation?: boolean;
  onStartRetry: () => void;
  onExitRetry: () => void;
  onToggleBestMove: () => void;
  onStepBestMove: (delta: number) => void;
}

function CoachMascotAvatar({ color }: { color: string }) {
  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 bg-[#312e2b] shadow-md"
      style={{ borderColor: color }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 40 40" className="h-9 w-9">
        <circle cx="20" cy="14" r="7" fill="#f3d2b3" />
        <path d="M12 12c1-5 15-5 16 0-2-2-14-2-16 0z" fill="#3e2c23" />
        <circle cx="17.5" cy="14" r="1.1" fill="#1e1c1a" />
        <circle cx="22.5" cy="14" r="1.1" fill="#1e1c1a" />
        <path d="M17 17.5c1.5 1.5 4.5 1.5 6 0" stroke="#1e1c1a" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        <path d="M9 34c1-7 5-10 11-10s10 3 11 10" fill={color} />
      </svg>
    </div>
  );
}

export function CoachCard({
  personaId,
  moveNumber,
  playedBy,
  moveSan,
  badge,
  evalLabel,
  bestMoveSan,
  bestMovePvSan = [],
  explanation,
  storyline,
  openingLabel,
  openingInsight,
  retryState,
  showBestMove,
  bestMovePreviewIndex,
  loadingExplanation = false,
  onStartRetry,
  onExitRetry,
  onToggleBestMove,
  onStepBestMove,
}: CoachCardProps) {
  const persona = getCoachPersona(personaId);

  // Starting position (Ply 0) shows the Game Overview Storyline
  if (!moveSan || !badge) {
    return (
      <div className="rounded-md border border-[#3d3b38] bg-[#21201d] p-3">
        <div className="flex items-start gap-3">
          <CoachMascotAvatar color={persona.accentColor} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#96bc4b]">
              <Sparkles className="h-3.5 w-3.5" />
              <span>{persona.name} • Game Recap</span>
            </div>
            <h3 className="mt-1 text-sm font-bold text-white">
              {storyline?.headline || "Ready to review the game"}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-[#c9c7c3]">
              {storyline?.summary ||
                "Step forward through the moves or click Next Key Moment to inspect turning points, blunders, and brilliant sacrifices."}
            </p>
            {openingLabel && (
              <div className="mt-2 rounded bg-[#262522] px-2.5 py-1.5 text-[11px] text-[#c9c7c3]">
                <span className="font-semibold text-[#a88a68]">{openingLabel}:</span>{" "}
                {openingInsight}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const badgeColor = BADGE_METADATA[badge].color;
  const canRetry =
    badge === "Blunder" || badge === "Mistake" || badge === "Miss" || badge === "Inaccuracy";

  return (
    <div className="rounded-md border border-[#3d3b38] bg-[#21201d] p-3">
      <div className="flex items-start gap-3">
        <CoachMascotAvatar color={persona.accentColor} />
        <div className="min-w-0 flex-1">
          {/* Move Badge Pill & Eval */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MoveBadgeIcon badge={badge} size="sm" />
              <span className="text-sm font-extrabold text-white">
                {moveNumber}
                {playedBy === "White" ? "." : "..."} {moveSan}
              </span>
              <span
                className="rounded px-1.5 py-0.5 text-[11px] font-bold"
                style={{
                  backgroundColor: `${badgeColor}24`,
                  color: badgeColor,
                }}
              >
                {badge}
              </span>
            </div>
            {evalLabel && (
              <span className="rounded bg-[#312e2b] px-2 py-0.5 font-mono text-xs font-bold text-white">
                {evalLabel}
              </span>
            )}
          </div>

          {/* Retry Puzzle Banner */}
          {retryState.active ? (
            <div
              className={`mt-2.5 rounded border px-3 py-2 text-xs ${
                retryState.status === "solved"
                  ? "border-[#96bc4b] bg-[#96bc4b]/15 text-[#d7f59c]"
                  : retryState.status === "incorrect"
                  ? "border-[#e65e2b] bg-[#e65e2b]/15 text-[#ffaa88]"
                  : "border-[#5c8bb0] bg-[#5c8bb0]/15 text-[#c7e4fc]"
              }`}
            >
              <div className="font-bold">
                {retryState.status === "solved"
                  ? "Puzzle Solved!"
                  : retryState.status === "incorrect"
                  ? "Not quite!"
                  : "Find the Best Move"}
              </div>
              <div className="mt-0.5">{retryState.feedback}</div>
              <button
                type="button"
                onClick={onExitRetry}
                className="mt-2 rounded bg-[#312e2b] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#3d3b38]"
              >
                Exit Retry
              </button>
            </div>
          ) : (
            <>
              <p className="mt-2 text-sm font-bold text-white">
                {loadingExplanation
                  ? "Coach is examining the position..."
                  : explanation?.shortComment || `${moveSan} is rated ${badge}.`}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[#c9c7c3]">
                {explanation?.detailedExplanation}
              </p>
              {explanation?.bestMoveReasoning && (
                <p className="mt-1.5 text-xs leading-relaxed text-[#9e9c98]">
                  <span className="font-semibold text-[#96bc4b]">Best was {bestMoveSan}:</span>{" "}
                  {explanation.bestMoveReasoning}
                </p>
              )}
            </>
          )}

          {/* How It Could Play Out (PV Continuation Stepper) */}
          {showBestMove && bestMovePvSan.length > 0 && (
            <div className="mt-2.5 rounded border border-[#3d3b38] bg-[#262522] p-2">
              <div className="flex items-center justify-between text-[11px] font-semibold text-[#9e9c98]">
                <span>{explanation?.variationTitle || "How it could play out"}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onStepBestMove(-1)}
                    disabled={bestMovePreviewIndex <= 0}
                    aria-label="Step line back"
                    className="rounded bg-[#312e2b] p-0.5 text-white disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onStepBestMove(1)}
                    disabled={bestMovePreviewIndex >= bestMovePvSan.length}
                    aria-label="Step line forward"
                    className="rounded bg-[#312e2b] p-0.5 text-white disabled:opacity-40"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-1 flex flex-wrap gap-1 font-mono text-xs">
                {bestMovePvSan.slice(0, 6).map((san, idx) => (
                  <span
                    key={`${san}-${idx}`}
                    className={`rounded px-1.5 py-0.5 ${
                      idx + 1 === bestMovePreviewIndex
                        ? "bg-[#96bc4b] font-bold text-[#1a1917]"
                        : "bg-[#312e2b] text-[#c9c7c3]"
                    }`}
                  >
                    {san}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          {!retryState.active && (
            <div className="mt-3 flex flex-wrap gap-2">
              {canRetry && (
                <button
                  type="button"
                  onClick={onStartRetry}
                  className="inline-flex items-center gap-1.5 rounded bg-[#96bc4b] px-3 py-1.5 text-xs font-bold text-[#1a1917] transition hover:bg-[#a7cc5c]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Retry Move
                </button>
              )}
              {bestMoveSan && (
                <button
                  type="button"
                  onClick={onToggleBestMove}
                  className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-semibold transition ${
                    showBestMove
                      ? "border-[#96bc4b] bg-[#96bc4b]/15 text-[#96bc4b]"
                      : "border-[#3d3b38] bg-[#262522] text-white hover:bg-[#312e2b]"
                  }`}
                >
                  <Eye className="h-3.5 w-3.5" />
                  {showBestMove ? "Hide Best Move" : "Show Best Move"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
