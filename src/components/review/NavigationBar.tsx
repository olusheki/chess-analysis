"use client";

import React from "react";
import {
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Sparkles,
  RefreshCw,
} from "lucide-react";

interface NavigationBarProps {
  currentPly: number;
  totalPlies: number;
  hasKeyMoments: boolean;
  onStart: () => void;
  onPrev: () => void;
  onNextKeyMoment: () => void;
  onNext: () => void;
  onEnd: () => void;
  onFlip: () => void;
}

export function NavigationBar({
  currentPly,
  totalPlies,
  hasKeyMoments,
  onStart,
  onPrev,
  onNextKeyMoment,
  onNext,
  onEnd,
  onFlip,
}: NavigationBarProps) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-[#3d3b38] bg-[#21201d] p-2">
      <button
        type="button"
        onClick={onStart}
        disabled={currentPly <= 0}
        aria-label="Jump to start"
        title="Start (Home)"
        className="rounded bg-[#262522] p-2 text-[#c9c7c3] transition hover:bg-[#312e2b] hover:text-white disabled:opacity-40"
      >
        <ChevronsLeft className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={onPrev}
        disabled={currentPly <= 0}
        aria-label="Previous move"
        title="Previous move (←)"
        className="rounded bg-[#262522] p-2 text-[#c9c7c3] transition hover:bg-[#312e2b] hover:text-white disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={onNextKeyMoment}
        disabled={!hasKeyMoments}
        aria-label="Next Key Moment"
        className="flex flex-1 items-center justify-center gap-1.5 rounded bg-[#96bc4b] px-3 py-2 text-xs font-extrabold text-[#1a1917] transition hover:bg-[#a6cc59] disabled:opacity-50"
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span>Next Key Moment</span>
      </button>

      <button
        type="button"
        onClick={onNext}
        disabled={currentPly >= totalPlies}
        aria-label="Next move"
        title="Next move (→)"
        className="rounded bg-[#262522] p-2 text-[#c9c7c3] transition hover:bg-[#312e2b] hover:text-white disabled:opacity-40"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={onEnd}
        disabled={currentPly >= totalPlies}
        aria-label="Jump to end"
        title="End (End)"
        className="rounded bg-[#262522] p-2 text-[#c9c7c3] transition hover:bg-[#312e2b] hover:text-white disabled:opacity-40"
      >
        <ChevronsRight className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={onFlip}
        aria-label="Flip board"
        title="Flip board (F)"
        className="rounded border border-[#3d3b38] bg-[#262522] p-2 text-[#c9c7c3] transition hover:bg-[#312e2b] hover:text-white"
      >
        <RefreshCw className="h-4 w-4" />
      </button>
    </div>
  );
}
