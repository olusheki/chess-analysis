"use client";

import React from "react";
import {
  Cpu,
  Eye,
  Lightbulb,
  LogOut,
  RotateCcw,
  Swords,
  Trophy,
  Undo2,
} from "lucide-react";
import { BADGE_METADATA } from "@/lib/analysis/move-classifier";
import { COACH_PERSONAS, type CoachPersonaId, getCoachPersona } from "@/lib/ai/coach-personas";
import {
  formatCoachProse,
  formatNotationPair,
  sanToPlainEnglish,
} from "@/lib/chess/plain-notation";
import {
  PLAY_MAX_ELO,
  PLAY_MIN_ELO,
  calculatePracticeAccuracy,
  type PlayGradedMove,
} from "@/lib/play/play-session";
import type { PlayModeState } from "@/lib/store/useReviewStore";
import { MoveBadgeIcon } from "@/components/chess/MoveBadgeIcon";
import { CoachAvatar } from "@/components/review/CoachAvatar";

const ELO_PRESETS = [
  { label: "800", elo: 800 },
  { label: "1200", elo: 1200 },
  { label: "1600", elo: 1600 },
  { label: "2000", elo: 2000 },
  { label: "Max", elo: PLAY_MAX_ELO },
];

export interface PlayModePanelProps {
  playMode: PlayModeState;
  personaId: CoachPersonaId;
  plainEnglish: boolean;
  onChangePersona?: (personaId: CoachPersonaId) => void;
  onChangePlainEnglish?: (enabled: boolean) => void;
  onSetTargetElo: (elo: number) => void;
  onUndo: () => void;
  onToggleBestMove: () => void;
  onRestart: () => void;
  onExit: () => void;
}

export function PlayModePanel({
  playMode,
  personaId,
  plainEnglish,
  onChangePersona,
  onChangePlainEnglish,
  onSetTargetElo,
  onUndo,
  onToggleBestMove,
  onRestart,
  onExit,
}: PlayModePanelProps) {
  const persona = getCoachPersona(personaId);
  const sideLabel = playMode.userColor === "w" ? "White" : "Black";
  const gradedMoves: PlayGradedMove[] = playMode.moves
    .filter((m) => m.by === "user" && m.grade)
    .map((m) => m.grade!);
  const latestGrade =
    gradedMoves.length > 0 ? gradedMoves[gradedMoves.length - 1] : null;
  const practiceAccuracy = calculatePracticeAccuracy(gradedMoves);

  const bestMoveSan = playMode.currentEval?.bestMoveSan;
  const bestPvSan = playMode.currentEval?.lines[0]?.pvSan ?? [];

  const formatProse = (text?: string | null) =>
    text ? (plainEnglish ? formatCoachProse(text) : text) : "";

  const eloSourceNote =
    playMode.matchedEloSource === "pgn"
      ? "Matched PGN rating"
      : playMode.matchedEloSource === "estimated"
      ? "Matched CAPS2 estimate"
      : "Default baseline";

  return (
    <div className="space-y-3">
      {/* Header Card */}
      <div className="rounded-md border border-[#3d3b38] bg-[#21201d] p-3.5 shadow-md">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#3d3b38] pb-2.5">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded bg-[#96bc4b]/20 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-[#96bc4b]">
                <Swords className="h-3 w-3" />
                PLAY VS STOCKFISH
              </span>
              <span className="text-[11px] font-semibold text-[#c9c7c3]">
                Playing as {sideLabel}
              </span>
            </div>
            <p className="mt-1 text-xs font-medium text-[#9e9c98]">
              {playMode.anchorDescription}
            </p>
          </div>

          <button
            type="button"
            onClick={onExit}
            aria-label="Exit play"
            className="inline-flex items-center gap-1.5 rounded border border-[#3d3b38] bg-[#262522] px-2.5 py-1 text-xs font-semibold text-[#c9c7c3] transition hover:bg-[#312e2b] hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
            Exit Play
          </button>
        </div>

        {/* Status + Practice Accuracy Row */}
        <div className="mt-3 flex items-center justify-between gap-2 rounded bg-[#1a1917] px-3 py-2">
          <div className="flex items-center gap-2.5">
            <CoachAvatar personaId={persona.id} color={persona.accentColor} size="sm" />
            <div>
              <div className="text-xs font-bold" style={{ color: persona.accentColor }}>
                {persona.name}
              </div>
              <div className="text-[11px] text-[#c9c7c3]">
                {playMode.gameOver
                  ? "Game finished"
                  : playMode.isThinking
                  ? `Stockfish (~${playMode.targetElo}) is thinking...`
                  : "Your turn — play on the board"}
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#9e9c98]">
              Practice Accuracy
            </div>
            <div className="font-mono text-sm font-extrabold text-[#96bc4b]">
              {practiceAccuracy.toFixed(1)}%
              <span className="ml-1 text-[10px] font-normal text-[#9e9c98]">
                ({gradedMoves.length} {gradedMoves.length === 1 ? "move" : "moves"})
              </span>
            </div>
          </div>
        </div>

        {/* Optional Persona + Notation Quick Controls */}
        {(onChangePersona || onChangePlainEnglish) && (
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-[#3d3b38]/60 pb-2 text-[10px]">
            {onChangePersona && (
              <div className="flex items-center gap-1" role="group" aria-label="Play coach persona">
                {Object.values(COACH_PERSONAS).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onChangePersona(p.id)}
                    className={`rounded px-1.5 py-0.5 font-bold transition ${
                      personaId === p.id
                        ? "text-[#1a1917]"
                        : "bg-[#262522] text-[#9e9c98] hover:text-white"
                    }`}
                    style={personaId === p.id ? { backgroundColor: p.accentColor } : undefined}
                  >
                    {p.name.replace("Coach ", "").replace("Grandmaster ", "GM ")}
                  </button>
                ))}
              </div>
            )}

            {onChangePlainEnglish && (
              <div className="flex items-center gap-1" role="group" aria-label="Play notation format">
                <button
                  type="button"
                  onClick={() => onChangePlainEnglish(true)}
                  aria-pressed={plainEnglish}
                  className={`rounded px-1.5 py-0.5 font-bold transition ${
                    plainEnglish
                      ? "bg-[#96bc4b] text-[#1a1917]"
                      : "bg-[#262522] text-[#c9c7c3] hover:text-white"
                  }`}
                >
                  Plain English
                </button>
                <button
                  type="button"
                  onClick={() => onChangePlainEnglish(false)}
                  aria-pressed={!plainEnglish}
                  className={`rounded px-1.5 py-0.5 font-bold transition ${
                    !plainEnglish
                      ? "bg-[#96bc4b] text-[#1a1917]"
                      : "bg-[#262522] text-[#c9c7c3] hover:text-white"
                  }`}
                >
                  SAN
                </button>
              </div>
            )}
          </div>
        )}

        {/* ELO Calibration Controls */}
        <div className="mt-3 space-y-2 rounded border border-[#3d3b38]/80 bg-[#1a1917] p-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold text-[#c9c7c3]">
              <Cpu className="h-3.5 w-3.5 text-[#96bc4b]" />
              Stockfish Strength:{" "}
              <strong className="font-mono text-white">
                {playMode.targetElo >= PLAY_MAX_ELO
                  ? `Max (${PLAY_MAX_ELO})`
                  : playMode.targetElo}
              </strong>
            </span>
            <span className="text-[11px] text-[#9e9c98]" title={eloSourceNote}>
              Matched: {playMode.matchedElo}
            </span>
          </div>

          <input
            type="range"
            aria-label="Stockfish target ELO"
            min={PLAY_MIN_ELO}
            max={PLAY_MAX_ELO}
            step={25}
            value={playMode.targetElo}
            onChange={(e) => onSetTargetElo(Number(e.target.value))}
            className="w-full accent-[#96bc4b]"
          />

          <div className="flex flex-wrap gap-1.5">
            {ELO_PRESETS.map((preset) => {
              const isSelected =
                preset.elo === PLAY_MAX_ELO
                  ? playMode.targetElo >= PLAY_MAX_ELO
                  : Math.abs(playMode.targetElo - preset.elo) <= 12;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onSetTargetElo(preset.elo)}
                  className={`rounded px-2 py-0.5 text-[11px] font-bold transition ${
                    isSelected
                      ? "bg-[#96bc4b] text-[#1a1917]"
                      : "bg-[#262522] text-[#c9c7c3] hover:bg-[#312e2b] hover:text-white"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onUndo}
            disabled={playMode.undoStack.length === 0}
            className="inline-flex items-center gap-1.5 rounded border border-[#3d3b38] bg-[#262522] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#312e2b] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Undo
          </button>

          <button
            type="button"
            onClick={onToggleBestMove}
            disabled={
              Boolean(playMode.gameOver) || playMode.isThinking || !bestMoveSan
            }
            className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
              playMode.showBestMove
                ? "border-[#96bc4b] bg-[#96bc4b]/15 text-[#96bc4b]"
                : "border-[#3d3b38] bg-[#262522] text-white hover:bg-[#312e2b]"
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            {playMode.showBestMove ? "Hide Best Move" : "Show Best Move"}
          </button>

          <button
            type="button"
            onClick={onRestart}
            className="inline-flex items-center gap-1.5 rounded border border-[#3d3b38] bg-[#262522] px-3 py-1.5 text-xs font-semibold text-[#c9c7c3] transition hover:bg-[#312e2b] hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restart Here
          </button>
        </div>

        {/* Show Best Move Hint Box */}
        {playMode.showBestMove && bestMoveSan && !playMode.gameOver && (
          <div className="mt-3 rounded border border-[#96bc4b]/40 bg-[#1a1917] p-2.5 text-xs">
            <div className="font-bold text-[#96bc4b]">
              Best Move Hint: {formatNotationPair(bestMoveSan, plainEnglish)}
            </div>
            {bestPvSan.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1 font-mono text-[11px]">
                {bestPvSan.slice(0, 6).map((san, idx) => (
                  <span
                    key={`${san}-${idx}`}
                    title={san}
                    className={`rounded px-1.5 py-0.5 ${
                      idx === 0
                        ? "bg-[#96bc4b] font-bold text-[#1a1917]"
                        : "bg-[#312e2b] text-[#c9c7c3]"
                    }`}
                  >
                    {plainEnglish ? sanToPlainEnglish(san) : san}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Game Over Completion Card */}
      {playMode.gameOver && (
        <div
          className={`rounded-md border p-3.5 ${
            playMode.gameOver.winner === "user"
              ? "border-[#96bc4b]/60 bg-[#25311c]"
              : playMode.gameOver.winner === "engine"
              ? "border-[#ca3431]/60 bg-[#321b1b]"
              : "border-[#5c8bb0]/60 bg-[#1c2630]"
          }`}
        >
          <div className="flex items-start gap-2.5">
            <Trophy className="mt-0.5 h-5 w-5 shrink-0 text-[#f5b041]" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-extrabold text-white">
                {playMode.gameOver.title}
              </div>
              <p className="mt-0.5 text-xs text-[#d6d4d0]">
                {playMode.gameOver.subtitle}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {playMode.undoStack.length > 0 && (
                  <button
                    type="button"
                    onClick={onUndo}
                    className="inline-flex items-center gap-1 rounded border border-[#3d3b38] bg-[#262522] px-2.5 py-1 text-xs font-bold text-white hover:bg-[#312e2b]"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    Undo Last Move
                  </button>
                )}
                <button
                  type="button"
                  onClick={onRestart}
                  className="inline-flex items-center gap-1 rounded bg-[#96bc4b] px-2.5 py-1 text-xs font-extrabold text-[#1a1917] hover:bg-[#a7cc5c]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Play Again
                </button>
                <button
                  type="button"
                  onClick={onExit}
                  className="inline-flex items-center gap-1 rounded border border-[#3d3b38] bg-[#21201d] px-2.5 py-1 text-xs font-semibold text-[#c9c7c3] hover:bg-[#312e2b] hover:text-white"
                >
                  Back to Review
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Real-Time Move Evaluation & Coach Feedback Card */}
      <div className="rounded-md border border-[#3d3b38] bg-[#21201d] p-3.5">
        <div className="flex items-center justify-between border-b border-[#3d3b38]/80 pb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#9e9c98]">
            Live Coach Feedback
          </span>
          {playMode.isEvaluatingMove && (
            <span className="text-[11px] font-semibold text-[#96bc4b]">
              Grading move...
            </span>
          )}
        </div>

        {latestGrade ? (
          <div className="mt-2.5 space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MoveBadgeIcon badge={latestGrade.badge} size="md" />
                <div>
                  <span className="font-bold text-white">
                    {latestGrade.moveNumber}
                    {latestGrade.color === "w" ? "." : "..."}{" "}
                    {formatNotationPair(latestGrade.san, plainEnglish)}
                  </span>{" "}
                  <span
                    className="font-extrabold"
                    style={{ color: BADGE_METADATA[latestGrade.badge].color }}
                  >
                    is {latestGrade.badge}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <span className="rounded bg-[#312e2b] px-1.5 py-0.5 text-[#c9c7c3]">
                  {latestGrade.accuracy.toFixed(1)}%
                </span>
                <span className="rounded bg-[#312e2b] px-1.5 py-0.5 font-bold text-white">
                  {latestGrade.evalLabel}
                </span>
              </div>
            </div>

            <p className="font-semibold text-white">
              {formatProse(latestGrade.explanation.shortComment)}
            </p>
            <p className="leading-relaxed text-[#d6d4d0]">
              {formatProse(latestGrade.explanation.detailedExplanation)}
            </p>

            {latestGrade.explanation.bestMoveReasoning && (
              <div className="rounded bg-[#1a1917] px-2.5 py-1.5 text-[11px] text-[#c9c7c3]">
                {formatProse(latestGrade.explanation.bestMoveReasoning)}
              </div>
            )}

            {latestGrade.explanation.coachingTip && (
              <div className="flex items-start gap-1.5 rounded border border-[#3d3b38]/70 bg-[#262522] px-2.5 py-1.5 text-[11px] text-[#c9c7c3]">
                <Lightbulb
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  style={{ color: persona.accentColor }}
                />
                <span>
                  <strong style={{ color: persona.accentColor }}>Coach Tip:</strong>{" "}
                  {formatProse(latestGrade.explanation.coachingTip)}
                </span>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-2.5 text-xs text-[#9e9c98]">
            Make a move on the board to get real-time classification, accuracy scoring,
            and coaching feedback from {persona.name}.
          </p>
        )}
      </div>

      {/* Play-Out Move Log */}
      {playMode.moves.length > 0 && (
        <div className="rounded-md border border-[#3d3b38] bg-[#21201d] p-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#9e9c98]">
            Practice Moves ({playMode.moves.length})
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-xs">
            {playMode.moves.map((m) => {
              const badgeColor = m.grade
                ? BADGE_METADATA[m.grade.badge].color
                : undefined;
              return (
                <span
                  key={m.id}
                  title={
                    m.grade
                      ? `${m.san} (${m.grade.badge} • ${m.grade.accuracy.toFixed(0)}%)`
                      : `${m.san} (${m.by === "engine" ? "Stockfish" : "Pending"})`
                  }
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 ${
                    m.by === "user"
                      ? "border border-[#3d3b38] bg-[#2b2926] font-bold text-white"
                      : "bg-[#1a1917] text-[#9e9c98]"
                  }`}
                >
                  <span className="text-[10px] opacity-75">
                    {m.moveNumber}
                    {m.color === "w" ? "." : "..."}
                  </span>
                  <span>{m.san}</span>
                  {badgeColor && (
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: badgeColor }}
                      aria-hidden="true"
                    />
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
