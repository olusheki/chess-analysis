"use client";

import React from "react";
import type { AnalyzedMove } from "@/lib/analysis/game-analyzer";
import type { GameOpeningAnalysis } from "@/lib/analysis/opening-book";
import {
  formatAnchorVariationRuns,
  type VariationTreeState,
} from "@/lib/analysis/variation-tree";
import { MoveBadgeIcon } from "@/components/chess/MoveBadgeIcon";

interface MoveListReviewProps {
  moves: AnalyzedMove[];
  opening: GameOpeningAnalysis;
  currentPly: number;
  onSelectPly: (ply: number) => void;
  variationTree?: VariationTreeState;
  activeVariationNodeId?: string | null;
  onSelectVariationNode?: (nodeId: string) => void;
}

export function MoveListReview({
  moves,
  opening,
  currentPly,
  onSelectPly,
  variationTree,
  activeVariationNodeId = null,
  onSelectVariationNode,
}: MoveListReviewProps) {
  // Group moves into full-move rows preserving custom FEN starting move numbers
  const rows: { moveNumber: number; white?: AnalyzedMove; black?: AnalyzedMove }[] = [];
  for (const move of moves) {
    const last = rows[rows.length - 1];
    if (move.color === "w") {
      rows.push({ moveNumber: move.moveNumber, white: move });
    } else if (last && last.moveNumber === move.moveNumber && !last.black) {
      last.black = move;
    } else {
      rows.push({ moveNumber: move.moveNumber, black: move });
    }
  }

  const renderAnchorVariations = (anchorPly: number) => {
    if (!variationTree) return null;
    const runs = formatAnchorVariationRuns(variationTree, anchorPly);
    if (runs.length === 0) return null;

    return (
      <div
        data-testid="moves-variation-branch"
        className="my-0.5 space-y-0.5 border-l-2 border-[#5c8bb0]/60 pl-2"
      >
        {runs.map((run, idx) => (
          <div
            key={`${anchorPly}-var-${idx}`}
            style={{ paddingLeft: `${run.depth * 10}px` }}
            className="flex flex-wrap items-center gap-1 py-0.5 font-mono text-[11px]"
          >
            {run.nodes.map((node, nodeIdx) => {
              const showNum = nodeIdx === 0 || node.color === "w";
              const prefix = showNum
                ? `${node.moveNumber}${node.color === "w" ? "." : "..."}`
                : "";
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => onSelectVariationNode?.(node.id)}
                  className={`rounded px-1 py-0.5 transition ${
                    activeVariationNodeId === node.id
                      ? "bg-[#96bc4b] font-bold text-[#1a1917]"
                      : "text-[#9fc4e3] hover:bg-[#312e2b] hover:text-white"
                  }`}
                >
                  {prefix}
                  {node.san}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col rounded-md border border-[#3d3b38] bg-[#21201d]">
      {opening.opening && (
        <div className="border-b border-[#3d3b38] bg-[#262522] px-3 py-2">
          <div className="text-xs font-bold text-[#a88a68]">
            [{opening.opening.eco}] {opening.opening.name}
          </div>
          {opening.outOfBookMoveNumber && (
            <div className="text-[10px] text-[#9e9c98]">
              Out of book on move {opening.outOfBookMoveNumber}
            </div>
          )}
        </div>
      )}

      <div className="max-h-72 overflow-y-auto p-1.5">
        {renderAnchorVariations(0)}
        {rows.map((row) => (
          <React.Fragment key={`${row.moveNumber}-${row.white?.ply ?? row.black?.ply ?? 0}`}>
            <div className="grid grid-cols-[36px_1fr_1fr] items-center gap-1 rounded px-1 py-0.5 text-xs odd:bg-[#262522]/40">
              <span className="font-mono text-[11px] text-[#9e9c98]">{row.moveNumber}.</span>

              {row.white ? (
                <button
                  type="button"
                  onClick={() => onSelectPly(row.white!.ply)}
                  className={`flex items-center justify-between gap-1.5 rounded px-2 py-1 text-left transition ${
                    currentPly === row.white.ply && !activeVariationNodeId
                      ? "bg-[#96bc4b]/25 font-bold text-white ring-1 ring-[#96bc4b]/60"
                      : "text-[#e5e3df] hover:bg-[#312e2b]"
                  }`}
                >
                  <span>{row.white.san}</span>
                  <MoveBadgeIcon badge={row.white.classification.badge} size="xs" />
                </button>
              ) : (
                <span className="px-2 py-1 text-[#6b6965]">...</span>
              )}

              {row.black ? (
                <button
                  type="button"
                  onClick={() => onSelectPly(row.black!.ply)}
                  className={`flex items-center justify-between gap-1.5 rounded px-2 py-1 text-left transition ${
                    currentPly === row.black.ply && !activeVariationNodeId
                      ? "bg-[#96bc4b]/25 font-bold text-white ring-1 ring-[#96bc4b]/60"
                      : "text-[#e5e3df] hover:bg-[#312e2b]"
                  }`}
                >
                  <span>{row.black.san}</span>
                  <MoveBadgeIcon badge={row.black.classification.badge} size="xs" />
                </button>
              ) : (
                <span />
              )}
            </div>
            {row.white && renderAnchorVariations(row.white.ply)}
            {row.black && renderAnchorVariations(row.black.ply)}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
