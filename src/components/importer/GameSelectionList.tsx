"use client";

import React from "react";
import type { FormattedGameListItem } from "@/lib/api/chesscom-api";
import { Zap, Clock, Flame, Calendar } from "lucide-react";

interface GameSelectionListProps {
  games: FormattedGameListItem[];
  onSelectGame: (pgn: string, meta?: { userColor?: "white" | "black" }) => void;
}

function TimeIcon({ timeClass }: { timeClass: string }) {
  switch (timeClass) {
    case "bullet":
      return <Flame className="h-3.5 w-3.5 text-[#e58f2a]" />;
    case "blitz":
      return <Zap className="h-3.5 w-3.5 text-[#f7c631]" />;
    case "rapid":
      return <Clock className="h-3.5 w-3.5 text-[#96bc4b]" />;
    default:
      return <Calendar className="h-3.5 w-3.5 text-[#a88a68]" />;
  }
}

export function GameSelectionList({ games, onSelectGame }: GameSelectionListProps) {
  return (
    <div data-testid="chesscom-game-list" className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
      {games.map((g) => {
        const badgeStyles =
          g.result === "win"
            ? "bg-[#96bc4b]/20 text-[#96bc4b] border-[#96bc4b]/40"
            : g.result === "loss"
            ? "bg-[#fa412d]/20 text-[#ff7363] border-[#fa412d]/40"
            : "bg-[#9e9c98]/20 text-[#c9c7c3] border-[#9e9c98]/40";

        return (
          <button
            key={g.id}
            data-testid="chesscom-game-item"
            type="button"
            onClick={() => onSelectGame(g.pgn, { userColor: g.userColor })}
            className="flex w-full items-center justify-between gap-2 rounded border border-[#3d3b38] bg-[#21201d] px-2.5 py-2 text-left transition hover:border-[#96bc4b] hover:bg-[#2d2b28]"
          >
            <div className="flex min-w-0 items-center gap-2">
              <TimeIcon timeClass={g.timeClass} />
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-sm border border-[#524f4b] ${
                  g.userColor === "white" ? "bg-white" : "bg-[#191816]"
                }`}
                title={`Played as ${g.userColor}`}
              />
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-white">
                  vs {g.opponent}{" "}
                  <span className="font-normal text-[#9e9c98]">({g.opponentRating})</span>
                </div>
                <div className="text-[10px] text-[#9e9c98]">
                  {g.timeClass} • {g.date}
                  {g.openingName ? ` • ${g.openingName}` : ""}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {g.hasChessComAccuracy && (
                <span
                  title="Game Review already available on Chess.com"
                  className="rounded border border-[#5c8bb0]/40 bg-[#5c8bb0]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#82b6de]"
                >
                  Reviewed
                </span>
              )}
              <span
                className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${badgeStyles}`}
              >
                {g.result}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
