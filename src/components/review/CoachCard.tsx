"use client";

import React, { useState } from "react";
import {
  RotateCcw,
  Eye,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Lightbulb,
  KeyRound,
  Swords,
} from "lucide-react";
import { BADGE_METADATA, MoveBadge } from "@/lib/analysis/move-classifier";
import type { CoachExplanationResponse, GameStorylineResponse } from "@/lib/ai/gemini-coach";
import { COACH_PERSONAS, CoachPersonaId, getCoachPersona } from "@/lib/ai/coach-personas";
import type { RetryState } from "@/lib/store/useReviewStore";
import { MoveBadgeIcon } from "@/components/chess/MoveBadgeIcon";
import { CoachAvatar } from "@/components/review/CoachAvatar";
import {
  formatCoachProse,
  formatNotationPair,
  sanToPlainEnglish,
} from "@/lib/chess/plain-notation";

interface CoachCardProps {
  personaId: CoachPersonaId;
  onChangePersona?: (personaId: CoachPersonaId) => void;
  geminiApiKey?: string;
  onChangeGeminiApiKey?: (apiKey: string) => void;
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
  onFixAndPlayOut?: () => void;
  onPlayFromHere?: () => void;
  onExitRetry: () => void;
  onToggleBestMove: () => void;
  onStepBestMove: (delta: number) => void;
}

export function CoachCard({
  personaId,
  onChangePersona,
  geminiApiKey = "",
  onChangeGeminiApiKey,
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
  onFixAndPlayOut,
  onPlayFromHere,
  onExitRetry,
  onToggleBestMove,
  onStepBestMove,
}: CoachCardProps) {
  const persona = getCoachPersona(personaId);
  const coachPerspective: "White" | "Black" = coachColor === "black" ? "Black" : "White";
  const activeMode = explanation?.coachMode ?? storyline?.coachMode ?? "offline";
  const [showKeyEditor, setShowKeyEditor] = useState(false);
  const [keyDraft, setKeyDraft] = useState(geminiApiKey);
  const hasCustomKey = geminiApiKey.trim().length > 0;
  const formatProse = (text?: string | null) =>
    text ? (plainEnglish ? formatCoachProse(text) : text) : "";

  const perspectiveBar = (
    <div className="mb-2.5 space-y-2 border-b border-[#3d3b38]/70 pb-2 text-[10px]">
      {onChangePersona && (
        <div
          className="grid grid-cols-3 gap-1.5"
          role="group"
          aria-label="Choose coach persona"
        >
          {Object.values(COACH_PERSONAS).map((p) => {
            const active = p.id === personaId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onChangePersona(p.id)}
                aria-label={`Select ${p.name}`}
                aria-pressed={active}
                className={`flex items-center gap-1.5 rounded border px-1.5 py-1 text-left transition ${
                  active
                    ? "bg-[#2a2926] text-white shadow-sm"
                    : "border-[#3d3b38]/80 bg-[#1c1b18] text-[#9e9c98] hover:border-[#55524d] hover:text-white"
                }`}
                style={active ? { borderColor: p.accentColor } : undefined}
              >
                <CoachAvatar personaId={p.id} color={p.accentColor} size="sm" />
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-[10px] font-bold">
                    {p.name.replace("Coach ", "").replace("Grandmaster ", "GM ")}
                  </div>
                  <div className="truncate text-[9px] opacity-75">
                    {p.id === "danny" ? "Mentor" : p.id === "sage" ? "Positional" : "Tactician"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-1.5">
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

        <div className="flex items-center gap-1.5">
          {onChangeGeminiApiKey && (
            <button
              type="button"
              onClick={() => {
                setKeyDraft(geminiApiKey);
                setShowKeyEditor((prev) => !prev);
              }}
              aria-label="Gemini API key settings"
              aria-expanded={showKeyEditor}
              title="Configure optional Gemini API key (stored only in your browser)"
              className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-semibold transition ${
                hasCustomKey
                  ? "border-[#96bc4b]/60 bg-[#96bc4b]/15 text-[#96bc4b]"
                  : "border-[#3d3b38] bg-[#262522] text-[#c9c7c3] hover:text-white"
              }`}
            >
              <KeyRound className="h-3 w-3" />
              <span>{hasCustomKey ? "Key Set" : "API Key"}</span>
            </button>
          )}
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
      </div>

      {showKeyEditor && onChangeGeminiApiKey && (
        <div className="rounded border border-[#3d3b38] bg-[#1a1917] p-2 text-[11px]">
          <div className="flex items-center gap-1.5">
            <input
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder="Paste optional Gemini API key..."
              aria-label="Optional Gemini API key"
              className="min-w-0 flex-1 rounded border border-[#3d3b38] bg-[#262522] px-2 py-1 text-[11px] text-white placeholder-[#7d7b77] focus:border-[#96bc4b] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                onChangeGeminiApiKey(keyDraft.trim());
                setShowKeyEditor(false);
              }}
              className="rounded bg-[#96bc4b] px-2 py-1 font-bold text-[#1a1917] hover:bg-[#a6cc59]"
            >
              Apply
            </button>
            {hasCustomKey && (
              <button
                type="button"
                onClick={() => {
                  setKeyDraft("");
                  onChangeGeminiApiKey("");
                  setShowKeyEditor(false);
                }}
                className="rounded border border-[#3d3b38] bg-[#262522] px-2 py-1 font-semibold text-[#c9c7c3] hover:text-white"
              >
                Clear
              </button>
            )}
          </div>
          <p className="mt-1 text-[10px] text-[#8d8b86]">
            Stored only in browser localStorage. Leave blank for offline Chess.com-style coaching.
          </p>
        </div>
      )}
    </div>
  );

  // Starting position (Ply 0) shows the Game Overview Storyline
  if (!moveSan || !badge) {
    return (
      <div
        className="rounded-md border border-[#3d3b38] bg-[#21201d] p-3 transition-colors"
        style={{ borderLeftColor: persona.accentColor, borderLeftWidth: "3px" }}
      >
        {perspectiveBar}
        <div
          key={`recap-${coachColor}-${personaId}`}
          className="animate-coach-enter flex items-start gap-3"
        >
          <CoachAvatar personaId={personaId} color={persona.accentColor} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
              <Sparkles className="h-3.5 w-3.5" style={{ color: persona.accentColor }} />
              <span style={{ color: persona.accentColor }}>{persona.name}</span>
              <span className="text-[10px] font-medium text-[#9e9c98]">
                ({persona.title}) • Recap for {coachPerspective}
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
            {storyline && (
              <div
                className="mt-2 rounded border bg-[#262522] px-2.5 py-1.5 text-[11px] text-[#d3d1cd]"
                style={{ borderColor: `${persona.accentColor}40` }}
              >
                <span className="font-semibold" style={{ color: persona.accentColor }}>
                  {coachPerspective} Takeaway:
                </span>{" "}
                {formatProse(
                  coachPerspective === "Black" ? storyline.blackTakeaway : storyline.whiteTakeaway
                )}
              </div>
            )}
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
  const isErrorBadge =
    badge === "Blunder" || badge === "Mistake" || badge === "Miss" || badge === "Inaccuracy";
  const bestMoveHeader = isErrorBadge
    ? "Best Move Continuation"
    : isOpponentMove
    ? "Opponent's Best Continuation"
    : explanation?.variationTitle || "How it could play out";
  const canRetry = !isOpponentMove && isErrorBadge;
  const canPunish =
    isOpponentMove &&
    canPunishError &&
    Boolean(onPunishError) &&
    (badge === "Blunder" || badge === "Mistake");

  return (
    <div
      className="rounded-md border border-[#3d3b38] bg-[#21201d] p-3 transition-colors"
      style={{ borderLeftColor: persona.accentColor, borderLeftWidth: "3px" }}
    >
      {perspectiveBar}
      <div
        key={`move-${moveNumber}-${playedBy}-${moveSan}-${coachColor}-${personaId}`}
        className="animate-coach-enter flex items-start gap-3"
      >
        <CoachAvatar personaId={personaId} color={persona.accentColor} size="md" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="font-bold" style={{ color: persona.accentColor }}>
              {persona.name}
            </span>
            <span className="text-[#7e7c78]">•</span>
            <span className="text-[#9e9c98]">{persona.title}</span>
          </div>
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
                  : (() => {
                      const raw = `${formatNotationPair(moveSan, plainEnglish)} is rated ${badge}.`;
                      return raw ? raw[0].toUpperCase() + raw.slice(1) : raw;
                    })()}
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
              {explanation?.coachingTip && (
                <div
                  className="mt-2 flex items-start gap-1.5 rounded border bg-[#262522] px-2.5 py-1.5 text-[11px] leading-relaxed text-[#d3d1cd]"
                  style={{ borderColor: `${persona.accentColor}40` }}
                >
                  <Lightbulb
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    style={{ color: persona.accentColor }}
                  />
                  <span>
                    <strong style={{ color: persona.accentColor }}>Coach Tip: </strong>
                    {formatProse(explanation.coachingTip)}
                  </span>
                </div>
              )}
            </>
          )}

          {/* How It Could Play Out (PV Continuation Stepper) */}
          {showBestMove && bestMovePvSan.length > 0 && (
            <div className="mt-2.5 rounded border border-[#3d3b38] bg-[#262522] p-2">
              <div className="flex items-center justify-between text-[11px] font-semibold text-[#9e9c98]">
                <span>{bestMoveHeader}</span>
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
              {canRetry && onFixAndPlayOut && (
                <button
                  type="button"
                  onClick={onFixAndPlayOut}
                  className="inline-flex items-center gap-1.5 rounded border border-[#96bc4b]/60 bg-[#96bc4b]/15 px-3 py-1.5 text-xs font-bold text-[#96bc4b] transition hover:bg-[#96bc4b]/25"
                >
                  <Swords className="h-3.5 w-3.5" />
                  Fix & Play Out
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
              {!canRetry && onPlayFromHere && (
                <button
                  type="button"
                  onClick={onPlayFromHere}
                  className="inline-flex items-center gap-1.5 rounded border border-[#3d3b38] bg-[#262522] px-3 py-1.5 text-xs font-semibold text-[#96bc4b] transition hover:bg-[#312e2b]"
                >
                  <Swords className="h-3.5 w-3.5" />
                  Play Here
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
