"use client";

import React, { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { AnalyzedMove } from "@/lib/analysis/game-analyzer";

interface EvalGraphProps {
  moves: AnalyzedMove[];
  currentPly: number;
  startEval?: { whiteCp: number; whiteMate?: number };
  onSelectPly: (ply: number) => void;
}

interface ChartPoint {
  ply: number;
  label: string;
  evalPawns: number;
  badge: string;
  color: string;
  isMarker: boolean;
  markerColor?: string;
}

function clampEvalPawns(whiteCp: number, whiteMate?: number): number {
  if (whiteMate !== undefined && whiteMate !== 0) {
    return whiteMate > 0 ? 10 : -10;
  }
  return Math.max(-10, Math.min(10, parseFloat((whiteCp / 100).toFixed(2))));
}

export function EvalGraph({ moves, currentPly, startEval, onSelectPly }: EvalGraphProps) {
  const { data, middlegamePly, endgamePly } = useMemo(() => {
    const points: ChartPoint[] = [
      {
        ply: 0,
        label: "Start",
        evalPawns: startEval ? clampEvalPawns(startEval.whiteCp, startEval.whiteMate) : 0.2,
        badge: "Start",
        color: "#ffffff",
        isMarker: false,
      },
    ];

    let midPly: number | null = null;
    let endPly: number | null = null;

    for (const m of moves) {
      if (midPly === null && m.tacticalContext.gamePhase === "Middlegame") {
        midPly = m.ply;
      }
      if (endPly === null && m.tacticalContext.gamePhase === "Endgame") {
        endPly = m.ply;
      }

      const b = m.classification.badge;
      const isMarker =
        b === "Blunder" || b === "Miss" || b === "Mistake" || b === "Brilliant";
      const markerColor =
        b === "Brilliant"
          ? "#1baca6"
          : b === "Blunder" || b === "Miss"
          ? "#fa412d"
          : b === "Mistake"
          ? "#e65e2b"
          : undefined;

      points.push({
        ply: m.ply,
        label: `${m.moveNumber}${m.color === "w" ? "." : "..."} ${m.san}`,
        evalPawns: clampEvalPawns(m.whiteCp, m.whiteMate),
        badge: b,
        color: m.classification.color,
        isMarker,
        markerColor,
      });
    }

    return { data: points, middlegamePly: midPly, endgamePly: endPly };
  }, [moves, startEval]);

  if (moves.length === 0) return null;

  return (
    <div className="rounded-md border border-[#3d3b38] bg-[#21201d] p-2.5">
      <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-[#9e9c98]">
        <span>Advantage Timeline</span>
        <span className="text-[10px] font-normal">Click any move to jump</span>
      </div>
      <div className="h-28 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 6, right: 6, left: 6, bottom: 2 }}
            onClick={(state) => {
              const rawIdx = state?.activeTooltipIndex;
              const activeIdx =
                typeof rawIdx === "number"
                  ? rawIdx
                  : typeof rawIdx === "string" && rawIdx.trim() !== ""
                  ? Number(rawIdx)
                  : NaN;
              if (Number.isInteger(activeIdx) && activeIdx >= 0 && data[activeIdx]) {
                onSelectPly(data[activeIdx].ply);
              }
            }}
          >
            <defs>
              <linearGradient id="evalAdvantageSplit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffffff" stopOpacity={0.9} />
                <stop offset="50%" stopColor="#d4d4d4" stopOpacity={0.7} />
                <stop offset="50%" stopColor="#4c4a46" stopOpacity={0.85} />
                <stop offset="100%" stopColor="#1b1a18" stopOpacity={0.95} />
              </linearGradient>
            </defs>
            <XAxis dataKey="ply" hide />
            <YAxis domain={[-10, 10]} hide />
            <ReferenceLine y={0} stroke="#524f4b" strokeWidth={1} />
            {middlegamePly && (
              <ReferenceLine
                x={middlegamePly}
                stroke="#524f4b"
                strokeDasharray="3 3"
              />
            )}
            {endgamePly && (
              <ReferenceLine
                x={endgamePly}
                stroke="#524f4b"
                strokeDasharray="3 3"
              />
            )}
            <ReferenceLine x={currentPly} stroke="#96bc4b" strokeWidth={2} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const pt = payload[0].payload as ChartPoint;
                return (
                  <div className="rounded border border-[#3d3b38] bg-[#1b1a18] px-2 py-1 text-xs shadow-lg">
                    <div className="font-bold text-white">{pt.label}</div>
                    <div className="text-[#9e9c98]">
                      Eval: {pt.evalPawns > 0 ? `+${pt.evalPawns}` : pt.evalPawns} ({pt.badge})
                    </div>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="evalPawns"
              stroke="#c9c7c3"
              strokeWidth={1.5}
              fill="url(#evalAdvantageSplit)"
              baseValue={0}
              isAnimationActive={false}
              dot={(props) => {
                const { cx, cy, payload } = props as {
                  cx?: number;
                  cy?: number;
                  payload?: ChartPoint;
                };
                if (!cx || !cy || !payload?.isMarker || !payload.markerColor) {
                  return <g key={`empty-${payload?.ply}`} />;
                }
                return (
                  <circle
                    key={`dot-${payload.ply}`}
                    cx={cx}
                    cy={cy}
                    r={4}
                    fill={payload.markerColor}
                    stroke="#21201d"
                    strokeWidth={1.5}
                    className="cursor-pointer"
                    onClick={() => onSelectPly(payload.ply)}
                  />
                );
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
