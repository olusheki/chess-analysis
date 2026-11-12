"use client";

import React, { useMemo } from "react";
import { GitBranch, ArrowUpCircle, Trash2, CornerUpLeft, Database, Loader2 } from "lucide-react";
import type { AnalyzedMove, GameAnalysis } from "@/lib/analysis/game-analyzer";
import {
  formatAnchorVariationRuns,
  getVariationLinePath,
  type VariationNode,
  type VariationTreeState,
} from "@/lib/analysis/variation-tree";
import type { PositionEval } from "@/lib/engine/engine-evaluator";
import type { TablebaseCategory, TablebaseResult } from "@/lib/engine/tablebase";
import { formatEvalLabel } from "@/lib/engine/uci-parser";
import { EvalGraph } from "@/components/chess/EvalGraph";

interface AnalysisPanelProps {
  analysis: GameAnalysis;
  currentPly: number;
  boardFen?: string;
  analyzedDepth: number;
  variationTree: VariationTreeState;
  activeVariationNode: VariationNode | null;
  liveMainEval: PositionEval | null;
  isEvaluatingLive: boolean;
  tablebase: TablebaseResult | null;
  tablebaseLoading: boolean;
  onSelectVariationNode: (nodeId: string) => void;
  onExitVariation: () => void;
  onExplorePvMoves: (input: {
    anchorPly: number;
    sanMoves: string[];
    stepIndex?: number;
    parentNodeId?: string | null;
  }) => void;
  onPromoteVariation: (nodeId: string) => void;
  onDeleteVariation: (nodeId: string) => void;
  onClearVariations: () => void;
  onSelectPly: (ply: number) => void;
}

function formatVariationNodeLabel(node: VariationNode): string {
  return `${node.moveNumber}${node.color === "w" ? "." : "..."}${node.san}`;
}

function formatTablebaseOutcomeBadge(outcome: TablebaseCategory): {
  label: string;
  className: string;
} {
  switch (outcome) {
    case "win":
      return { label: "Win", className: "bg-[#96bc4b]/20 text-[#96bc4b]" };
    case "loss":
      return { label: "Loss", className: "bg-[#fa412d]/20 text-[#ff8e80]" };
    case "draw":
      return { label: "Draw", className: "bg-[#5c8bb0]/20 text-[#9fc4e3]" };
    case "cursed-win":
      return { label: "Draw (Cursed)", className: "bg-[#f0c15c]/20 text-[#f0c15c]" };
    case "blessed-loss":
      return { label: "Draw (Blessed)", className: "bg-[#f0c15c]/20 text-[#f0c15c]" };
    default:
      return { label: "?", className: "bg-[#312e2b] text-[#9e9c98]" };
  }
}

function formatTablebaseVerdictLabel(tb: TablebaseResult): string {
  if (tb.whiteVerdict === "Cursed Win") {
    return `${tb.turn === "w" ? "White" : "Black"} Cursed Win`;
  }
  if (tb.whiteVerdict === "Blessed Loss") {
    return `${tb.turn === "w" ? "White" : "Black"} Blessed Loss`;
  }
  return tb.whiteVerdict;
}

export function AnalysisPanel({
  analysis,
  currentPly,
  boardFen,
  analyzedDepth,
  variationTree,
  activeVariationNode,
  liveMainEval,
  isEvaluatingLive,
  tablebase,
  tablebaseLoading,
  onSelectVariationNode,
  onExitVariation,
  onExplorePvMoves,
  onPromoteVariation,
  onDeleteVariation,
  onClearVariations,
  onSelectPly,
}: AnalysisPanelProps) {
  const activeMove: AnalyzedMove | null =
    currentPly > 0 && currentPly <= analysis.moves.length
      ? analysis.moves[currentPly - 1]
      : null;
  const nextMainMove: AnalyzedMove | null =
    currentPly >= 0 && currentPly < analysis.moves.length
      ? analysis.moves[currentPly]
      : null;

  const matchingMainEval =
    liveMainEval && (!boardFen || liveMainEval.fen === boardFen) ? liveMainEval : null;
  const matchingTablebase =
    tablebase && (!boardFen || tablebase.fen === boardFen) ? tablebase : null;

  const hasNextMainLines = Boolean(
    !activeVariationNode && currentPly > 0 && nextMainMove?.pvLines?.length
  );

  const currentBoardLines = useMemo(() => {
    if (activeVariationNode) {
      return activeVariationNode.eval?.lines ?? [];
    }
    if (currentPly === 0) {
      return matchingMainEval?.lines ?? analysis.startEval?.pvLines ?? [];
    }
    if (nextMainMove?.pvLines?.length) {
      return nextMainMove.pvLines;
    }
    return matchingMainEval?.lines ?? [];
  }, [activeVariationNode, analysis.startEval?.pvLines, currentPly, matchingMainEval?.lines, nextMainMove]);

  const variationPath = useMemo(() => {
    if (!activeVariationNode) return [];
    return getVariationLinePath(variationTree, activeVariationNode.id);
  }, [activeVariationNode, variationTree]);

  const anchorKeys = useMemo(
    () =>
      Object.keys(variationTree.rootsByAnchorPly)
        .map((k) => Number(k))
        .filter((k) => (variationTree.rootsByAnchorPly[k]?.length ?? 0) > 0)
        .sort((a, b) => a - b),
    [variationTree.rootsByAnchorPly]
  );

  const exploreAnchorPly = activeVariationNode ? activeVariationNode.anchorPly : currentPly;
  const exploreParentId = activeVariationNode ? activeVariationNode.id : null;
  const displayedDepth =
    activeVariationNode?.eval?.depth ??
    (hasNextMainLines ? analyzedDepth : matchingMainEval?.depth ?? analyzedDepth);

  return (
    <div className="space-y-3">
      {/* Exploration Breadcrumb / Variation Banner */}
      <div className="rounded-md border border-[#3d3b38] bg-[#21201d] p-2.5 text-xs">
        {activeVariationNode ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-bold text-[#96bc4b]">
                <GitBranch className="h-3.5 w-3.5" />
                <span>
                  Variation from{" "}
                  {activeVariationNode.anchorPly === 0
                    ? "Start"
                    : `Move ${analysis.moves[activeVariationNode.anchorPly - 1]?.moveNumber ?? ""}${
                        analysis.moves[activeVariationNode.anchorPly - 1]?.color === "w" ? "." : "..."
                      }${analysis.moves[activeVariationNode.anchorPly - 1]?.san ?? ""}`}
                </span>
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onExitVariation}
                  className="inline-flex items-center gap-1 rounded bg-[#312e2b] px-2 py-0.5 text-[11px] font-semibold text-[#c9c7c3] hover:text-white"
                >
                  <CornerUpLeft className="h-3 w-3" />
                  Mainline
                </button>
                <button
                  type="button"
                  onClick={() => onPromoteVariation(activeVariationNode.id)}
                  title="Promote variation"
                  className="inline-flex items-center gap-1 rounded bg-[#312e2b] px-2 py-0.5 text-[11px] font-semibold text-[#c9c7c3] hover:text-white"
                >
                  <ArrowUpCircle className="h-3 w-3" />
                  Promote
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteVariation(activeVariationNode.id)}
                  title="Delete branch"
                  className="inline-flex items-center gap-1 rounded bg-[#fa412d]/15 px-2 py-0.5 text-[11px] font-semibold text-[#ff8e80] hover:bg-[#fa412d]/25"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1 font-mono text-[11px]">
              {variationPath.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => onSelectVariationNode(node.id)}
                  className={`rounded px-1.5 py-0.5 transition ${
                    node.id === activeVariationNode.id
                      ? "bg-[#96bc4b] font-bold text-[#1a1917]"
                      : "bg-[#262522] text-[#c9c7c3] hover:bg-[#312e2b]"
                  }`}
                >
                  {formatVariationNodeLabel(node)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 text-[#9e9c98]">
            <span className="inline-flex items-center gap-1.5">
              <GitBranch className="h-3.5 w-3.5 text-[#96bc4b]" />
              <span>Drag or click pieces on the board to explore variations freely</span>
            </span>
            {anchorKeys.length > 0 && (
              <span className="rounded bg-[#262522] px-1.5 py-0.5 font-mono text-[10px] text-[#c9c7c3]">
                {Object.keys(variationTree.nodes).length} branch moves
              </span>
            )}
          </div>
        )}
      </div>

      {/* Engine Lines (MultiPV = 3) for Current Board */}
      <div className="rounded-md border border-[#3d3b38] bg-[#21201d] p-3">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-[#9e9c98]">
          <span>Engine Lines (MultiPV = 3)</span>
          <span className="inline-flex items-center gap-1 font-mono text-[10px]">
            {isEvaluatingLive && <Loader2 className="h-3 w-3 animate-spin text-[#96bc4b]" />}
            Depth {displayedDepth}
          </span>
        </div>

        {currentBoardLines.length > 0 ? (
          <div className="mt-2 space-y-2 text-xs">
            <div className="text-[10px] text-[#9e9c98]">
              Click any move or line to branch into the variation tree
            </div>
            {currentBoardLines.slice(0, 3).map((line, i) => {
              const label = formatEvalLabel(line.cp, line.mate);
              const colorClass =
                i === 0
                  ? "text-[#96bc4b]"
                  : i === 1
                  ? "text-[#5c8bb0]"
                  : "text-[#a88a68]";
              return (
                <div
                  key={line.multipv}
                  className="rounded border border-transparent bg-[#262522] p-2 transition hover:border-[#3d3b38]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onExplorePvMoves({
                          anchorPly: exploreAnchorPly,
                          sanMoves: line.pvSan,
                          stepIndex: 0,
                          parentNodeId: exploreParentId,
                        })
                      }
                      className={`flex-1 text-left font-bold ${colorClass}`}
                    >
                      PV{line.multipv}{" "}
                      {i === 0 ? "(Best)" : i === 1 ? "(2nd)" : "(3rd)"}:{" "}
                      {line.pvSan[0] || "—"}
                    </button>
                    <span className="rounded bg-[#312e2b] px-1.5 py-0.5 font-mono text-[11px] font-bold text-white">
                      {label}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 font-mono text-[11px]">
                    {line.pvSan.slice(0, 6).map((san, idx) => (
                      <button
                        key={`${line.multipv}-${san}-${idx}`}
                        type="button"
                        onClick={() =>
                          onExplorePvMoves({
                            anchorPly: exploreAnchorPly,
                            sanMoves: line.pvSan,
                            stepIndex: idx,
                            parentNodeId: exploreParentId,
                          })
                        }
                        className="rounded px-1 py-0.5 text-[#c9c7c3] transition hover:bg-[#312e2b] hover:text-white"
                      >
                        {san}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-xs text-[#9e9c98]">
            {isEvaluatingLive
              ? "Computing Stockfish MultiPV=3 lines for this variation..."
              : "Game position is terminal or waiting for engine lines."}
          </p>
        )}

        {/* Alternatives Before Played Mainline Move */}
        {!activeVariationNode &&
          activeMove &&
          activeMove.pvLines &&
          activeMove.pvLines.length > 0 &&
          activeMove.bestMoveSan &&
          activeMove.bestMoveSan !== activeMove.san &&
          activeMove.classification.badge !== "Book" && (
            <div className="mt-3 border-t border-[#3d3b38] pt-2.5 text-xs">
              <div className="text-[11px] font-semibold text-[#c9c7c3]">
                Alternatives to {activeMove.moveNumber}
                {activeMove.color === "w" ? "." : "..."}
                {activeMove.san}:
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {activeMove.pvLines.slice(0, 2).map((line, i) => (
                  <button
                    key={`alt-${line.multipv}`}
                    type="button"
                    onClick={() =>
                      onExplorePvMoves({
                        anchorPly: activeMove.ply - 1,
                        sanMoves: line.pvSan,
                        stepIndex: 0,
                        parentNodeId: null,
                      })
                    }
                    className="inline-flex items-center gap-1 rounded border border-[#3d3b38] bg-[#262522] px-2 py-1 font-mono text-[11px] text-[#e5e3df] hover:border-[#96bc4b]"
                  >
                    <span className={i === 0 ? "font-bold text-[#96bc4b]" : "font-bold text-[#5c8bb0]"}>
                      {i === 0 ? "Best:" : "Alt:"} {line.pvSan[0]}
                    </span>
                    <span className="text-[10px] text-[#9e9c98]">
                      ({formatEvalLabel(line.cp, line.mate)})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
      </div>

      {/* Syzygy 7-Man Endgame Tablebase */}
      {(tablebaseLoading || matchingTablebase) && (
        <div className="rounded-md border border-[#3d3b38] bg-[#21201d] p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#9e9c98]">
              <Database className="h-3.5 w-3.5 text-[#1baca6]" />
              <span>Syzygy Endgame Tablebase</span>
            </span>
            {matchingTablebase && (
              <span
                className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                  matchingTablebase.whiteVerdict === "White Wins"
                    ? "bg-[#96bc4b]/20 text-[#96bc4b]"
                    : matchingTablebase.whiteVerdict === "Black Wins"
                    ? "bg-[#fa412d]/20 text-[#ff8e80]"
                    : matchingTablebase.whiteVerdict === "Cursed Win" ||
                      matchingTablebase.whiteVerdict === "Blessed Loss"
                    ? "bg-[#f0c15c]/20 text-[#f0c15c]"
                    : "bg-[#5c8bb0]/20 text-[#9fc4e3]"
                }`}
              >
                {formatTablebaseVerdictLabel(matchingTablebase)}
              </span>
            )}
          </div>

          {tablebaseLoading && !matchingTablebase ? (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-[#9e9c98]">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#1baca6]" />
              <span>Probing Syzygy 7-man tablebase...</span>
            </div>
          ) : matchingTablebase ? (
            <div className="mt-2 space-y-2 text-xs">
              <div className="font-semibold text-[#e5e3df]">{matchingTablebase.headline}</div>
              {matchingTablebase.moves.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {matchingTablebase.moves.slice(0, 6).map((m) => {
                    const badge = formatTablebaseOutcomeBadge(m.outcomeForMover);
                    const metric =
                      m.dtm !== null && m.dtm !== 0
                        ? `DTM ${Math.abs(m.dtm)}`
                        : m.dtz !== null && m.dtz !== 0
                        ? `DTZ ${Math.abs(m.dtz)}`
                        : null;
                    return (
                      <button
                        key={m.uci}
                        type="button"
                        onClick={() =>
                          onExplorePvMoves({
                            anchorPly: exploreAnchorPly,
                            sanMoves: [m.san],
                            stepIndex: 0,
                            parentNodeId: exploreParentId,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded border border-[#3d3b38] bg-[#262522] px-2 py-1 font-mono text-[11px] text-white transition hover:border-[#1baca6]"
                      >
                        <span className="font-bold">{m.san}</span>
                        <span className={`rounded px-1 py-0.2 text-[10px] font-sans font-bold ${badge.className}`}>
                          {badge.label}
                        </span>
                        {metric && <span className="text-[10px] text-[#9e9c98]">{metric}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Saved Exploration Branches */}
      {anchorKeys.length > 0 && (
        <div className="rounded-md border border-[#3d3b38] bg-[#21201d] p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#9e9c98]">
              Saved Variation Branches
            </span>
            <button
              type="button"
              onClick={onClearVariations}
              className="text-[11px] font-semibold text-[#9e9c98] hover:text-white"
            >
              Clear All
            </button>
          </div>
          <div className="mt-2 space-y-1.5 text-xs">
            {anchorKeys.map((anchorPly) => {
              const runs = formatAnchorVariationRuns(variationTree, anchorPly);
              const anchorMove = anchorPly > 0 ? analysis.moves[anchorPly - 1] : null;
              const anchorTitle = anchorMove
                ? `After ${anchorMove.moveNumber}${anchorMove.color === "w" ? "." : "..."} ${anchorMove.san}`
                : "From Start";
              return (
                <div key={anchorPly} className="rounded bg-[#262522] p-2">
                  <div className="mb-1 text-[10px] font-bold text-[#a88a68]">{anchorTitle}</div>
                  <div className="space-y-1">
                    {runs.map((run, idx) => (
                      <div
                        key={`${anchorPly}-run-${idx}`}
                        style={{ paddingLeft: `${run.depth * 10}px` }}
                        className="flex flex-wrap items-center gap-1 font-mono text-[11px]"
                      >
                        {run.nodes.map((node) => (
                          <button
                            key={node.id}
                            type="button"
                            onClick={() => onSelectVariationNode(node.id)}
                            className={`rounded px-1 py-0.5 ${
                              activeVariationNode?.id === node.id
                                ? "bg-[#96bc4b] font-bold text-[#1a1917]"
                                : "text-[#c9c7c3] hover:bg-[#312e2b] hover:text-white"
                            }`}
                          >
                            {formatVariationNodeLabel(node)}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Deterministic Tactical Tags */}
      {activeMove && !activeVariationNode && (
        <div className="rounded-md border border-[#3d3b38] bg-[#21201d] p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#9e9c98]">
            Deterministic Tactical Tags
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded bg-[#312e2b] px-2 py-0.5 text-[11px] text-[#c9c7c3]">
              Phase: {activeMove.tacticalContext.gamePhase}
            </span>
            <span className="rounded bg-[#312e2b] px-2 py-0.5 text-[11px] text-[#c9c7c3]">
              ΔWP: {activeMove.classification.deltaWP.toFixed(1)}%
            </span>
            {activeMove.materialSacrificed > 0 && (
              <span className="rounded bg-[#1baca6]/20 px-2 py-0.5 text-[11px] font-bold text-[#1baca6]">
                Sacrifice: {activeMove.materialSacrificed} pts
              </span>
            )}
            {activeMove.tacticalContext.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-[#96bc4b]/15 px-2 py-0.5 font-mono text-[11px] text-[#96bc4b]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      <EvalGraph
        moves={analysis.moves}
        currentPly={currentPly}
        startEval={analysis.startEval}
        onSelectPly={onSelectPly}
      />
    </div>
  );
}
