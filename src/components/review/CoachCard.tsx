"use client";

import React from "react";
import { RotateCcw, Eye, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";
import { BADGE_METADATA, MoveBadge } from "@/lib/analysis/move-classifier";
import type { CoachExplanationResponse, GameStorylineResponse } from "@/lib/ai/gemini-coach";
import { CoachPersonaId, getCoachPersona } from "@/lib/ai/coach-personas";
import type { RetryState } from "@/lib/store/useReviewStore";
import { MoveBadgeIcon } from "@/components/chess/MoveBadgeIcon";
import {
  formatCoachProse,
  formatNotationPair,
  sanToPlainEnglish,
} from "@/lib/chess/plain-notation";

interface CoachCardProps {
  personaId: CoachPersonaId;
  coachColor?: "white" | "black";
  onChangeCoachColor?: (color: "white" | "black") => void;
  plainEnglish?: boolean;
  onChangePlainEnglish?: (enabled: boolean) => void;
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
  canPunishError?: boolean;
  onStartRetry: () => void;
  onPunishError?: () => void;
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
  coachColor = "white",
  onChangeCoachColor,
  plainEnglish = true,
  onChangePlainEnglish,
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
  canPunishError = false,
  onStartRetry,
  onPunishError,
  onExitRetry,
  onToggleBestMove,
  onStepBestMove,
}: CoachCardProps) {
  const persona = getCoachPersona(personaId);
  const coachPerspective: "White" | "Black" = coachColor === "black" ? "Black" : "White";
  const activeMode = explanation?.coachMode ?? storyline?.coachMode ?? "offline";
  const formatProse = (text?: string | null) =>
    text ? (plainEnglish ? formatCoachProse(text) : text) : "";

  const perspectiveBar = (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5 border-b border-[#3d3b38]/70 pb-2 text-[10px]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="font-semibold uppercase tracking-wide text-[#9e9c98]">Coach Side:</span>
          {(["white", "black"] as const).map((side) => {
            const active = coachColor === side;
            return (
              <button
                key={side}
                type="button"
                onClick={() => onChangeCoachColor?.(side)}
                aria-label={`Coach as ${side === "white" ? "White" : "Black"}`}
                aria-pressed={active}
                className={`rounded px-1.5 py-0.5 font-bold capitalize transition ${
                  active
                    ? "bg-[#96bc4b] text-[#1a1917]"
                    : "bg-[#262522] text-[#c9c7c3] hover:bg-[#312e2b] hover:text-white"
                }`}
              >
                {side}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="Coach notation format">
          <span className="font-semibold uppercase tracking-wide text-[#9e9c98]">Notation:</span>
          <button
            type="button"
            onClick={() => onChangePlainEnglish?.(true)}
            aria-label="Plain English notation"
            aria-pressed={plainEnglish}
            title="Show readable plain English move names (e.g. knight takes b4)"
            className={`rounded px-1.5 py-0.5 font-bold transition ${
              plainEnglish
                ? "bg-[#96bc4b] text-[#1a1917]"
                : "bg-[#262522] text-[#c9c7c3] hover:bg-[#312e2b] hover:text-white"
            }`}
          >
            Plain English
          </button>
          <button
            type="button"
            onClick={() => onChangePlainEnglish?.(false)}
            aria-label="Simple notation (SAN)"
            aria-pressed={!plainEnglish}
            title="Show standard chess notation (e.g. Nxb4, g8+)"
            className={`rounded px-1.5 py-0.5 font-bold transition ${
              !plainEnglish
                ? "bg-[#96bc4b] text-[#1a1917]"
                : "bg-[#262522] text-[#c9c7c3] hover:bg-[#312e2b] hover:text-white"
            }`}
          >
            SAN
          </button>
        </div>
      </div>

      <span
        className={`rounded px-1.5 py-0.5 font-semibold ${
          activeMode === "live"
            ? "bg-[#96bc4b]/15 text-[#96bc4b]"
            : "bg-[#262522] text-[#9e9c98]"
        }`}
      >
        {activeMode === "live" ? "Gemini Live" : "Offline Coach"}
      </span>
    </div>
  );

  // Starting position (Ply 0) shows the Game Overview Storyline
  if (!moveSan || !badge) {
    return (
      <div className="rounded-md border border-[#3d3b38] bg-[#21201d] p-3">
        {perspectiveBar}
        <div
          key={`recap-${coachColor}-${personaId}`}
          className="animate-coach-enter flex items-start gap-3"
        >
          <CoachMascotAvatar color={persona.accentColor} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#96bc4b]">
              <Sparkles className="h-3.5 w-3.5" />
              <span>
                {persona.name} • Recap for {coachPerspective}
              </span>
            </div>
            <h3 className="mt-1 text-sm font-bold text-white">
              {storyline?.headline
                ? formatProse(storyline.headline)
                : "Ready to review the game"}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-[#c9c7c3]">
              {storyline?.summary
                ? formatProse(storyline.summary)
                : "Step forward through the moves or click Next Key Moment to inspect turning points, blunders, and brilliant sacrifices."}
            </p>
            {openingLabel && (
              <div className="mt-2 rounded bg-[#262522] px-2.5 py-1.5 text-[11px] text-[#c9c7c3]">
                <span className="font-semibold text-[#a88a68]">{openingLabel}:</span>{" "}
                {openingInsight ? formatProse(openingInsight) : ""}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const badgeColor = BADGE_METADATA[badge].color;
  const isOpponentMove = playedBy !== undefined && playedBy !== coachPerspective;
  const canRetry =
    !isOpponentMove &&
    (badge === "Blunder" || badge === "Mistake" || badge === "Miss" || badge === "Inaccuracy");
  const canPunish =
    isOpponentMove &&
    canPunishError &&
    Boolean(onPunishError) &&
    (badge === "Blunder" || badge === "Mistake");

  return (
    <div className="rounded-md border border-[#3d3b38] bg-[#21201d] p-3">
      {perspectiveBar}
      <div
        key={`move-${moveNumber}-${playedBy}-${moveSan}-${coachColor}-${personaId}`}
        className="animate-coach-enter flex items-start gap-3"
      >
        <CoachMascotAvatar color={persona.accentColor} />
        <div className="min-w-0 flex-1">
          {/* Move Badge Pill & Eval */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <MoveBadgeIcon badge={badge} size="sm" />
              <span className="text-sm font-extrabold text-white">
                {moveNumber}
                {playedBy === "White" ? "." : "..."}{" "}
                {plainEnglish ? (
                  <>
                    <span>{sanToPlainEnglish(moveSan)}</span>{" "}
                    <span className="font-mono text-xs font-semibold text-[#9e9c98]">
                      ({moveSan})
                    </span>
                  </>
                ) : (
                  moveSan
                )}
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
              {isOpponentMove && (
                <span className="rounded border border-[#3d3b38] bg-[#262522] px-1.5 py-0.5 text-[10px] font-semibold text-[#c9c7c3]">
                  Opponent Move
                </span>
              )}
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
              <div className="mt-0.5">{formatProse(retryState.feedback)}</div>
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
                  : explanation?.shortComment
                  ? formatProse(explanation.shortComment)
                  : `${formatNotationPair(moveSan, plainEnglish)} is rated ${badge}.`}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[#c9c7c3]">
                {formatProse(explanation?.detailedExplanation)}
              </p>
              {explanation?.bestMoveReasoning && (
                <p className="mt-1.5 text-xs leading-relaxed text-[#9e9c98]">
                  <span className="font-semibold text-[#96bc4b]">
                    Best was {bestMoveSan ? formatNotationPair(bestMoveSan, plainEnglish) : ""}:
                  </span>{" "}
                  {formatProse(explanation.bestMoveReasoning)}
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
                    disabled={bestMovePreviewIndex >= Math.min(6, bestMovePvSan.length)}
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
                    title={san}
                    className={`rounded px-1.5 py-0.5 ${
                      idx + 1 === bestMovePreviewIndex
                        ? "bg-[#96bc4b] font-bold text-[#1a1917]"
                        : "bg-[#312e2b] text-[#c9c7c3]"
                    }`}
                  >
                    {plainEnglish ? sanToPlainEnglish(san) : san}
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
              {canPunish && (
                <button
                  type="button"
                  onClick={onPunishError}
                  className="inline-flex items-center gap-1.5 rounded bg-[#f5b041] px-3 py-1.5 text-xs font-bold text-[#1a1917] transition hover:bg-[#f7be63]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Punish Error
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
