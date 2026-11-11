// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { EvalGraph, computeEvalZeroOffset } from "@/components/chess/EvalGraph";
import type { AnalyzedMove } from "@/lib/analysis/game-analyzer";

vi.mock("recharts", () => {
  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    AreaChart: ({
      children,
      onClick,
    }: {
      children: React.ReactNode;
      onClick?: (state: { activeTooltipIndex?: number | string | null }) => void;
    }) => (
      <div>
        <button
          type="button"
          data-testid="mock-chart-string-click"
          onClick={() => onClick?.({ activeTooltipIndex: "2" })}
        >
          Click Ply 2 (string index)
        </button>
        <button
          type="button"
          data-testid="mock-chart-number-click"
          onClick={() => onClick?.({ activeTooltipIndex: 1 })}
        >
          Click Ply 1 (number index)
        </button>
        <button
          type="button"
          data-testid="mock-chart-null-click"
          onClick={() => onClick?.({ activeTooltipIndex: null })}
        >
          Click Outside
        </button>
        <svg>{children}</svg>
      </div>
    ),
    Area: () => null,
    XAxis: () => null,
    YAxis: () => null,
    ReferenceLine: () => null,
    Tooltip: () => null,
  };
});

function makeMove(ply: number, san: string, whiteCp: number): AnalyzedMove {
  return {
    ply,
    moveNumber: Math.ceil(ply / 2),
    color: ply % 2 === 1 ? "w" : "b",
    san,
    uci: "e2e4",
    from: "e2",
    to: "e4",
    fenBefore: "",
    fenAfter: "",
    whiteCp,
    evalLabel: "+0.2",
    bestMoveUci: "e2e4",
    bestMoveSan: san,
    bestMovePvSan: [san],
    altPvSan: [],
    materialSacrificed: 0,
    classification: {
      badge: "Best",
      deltaWP: 0,
      accuracy: 100,
      color: "#96bc4b",
      symbol: "★",
      isBlunder: false,
      isKeyMoment: false,
    },
    tacticalContext: {
      tags: [],
      isCheck: false,
      isCastle: false,
      gamePhase: "Opening",
    },
  };
}

describe("EvalGraph interactive timeline (Recharts v3)", () => {
  afterEach(() => {
    cleanup();
  });

  it("C2: navigates when Recharts v3 emits activeTooltipIndex as a string ('2') or number (1)", () => {
    const onSelectPly = vi.fn();
    const moves = [makeMove(1, "e4", 25), makeMove(2, "e5", 15)];

    render(<EvalGraph moves={moves} currentPly={0} onSelectPly={onSelectPly} />);

    // Recharts 3.x emits string indices ("2") for activeTooltipIndex!
    fireEvent.click(screen.getByTestId("mock-chart-string-click"));
    expect(onSelectPly).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByTestId("mock-chart-number-click"));
    expect(onSelectPly).toHaveBeenCalledWith(1);

    onSelectPly.mockClear();
    fireEvent.click(screen.getByTestId("mock-chart-null-click"));
    expect(onSelectPly).not.toHaveBeenCalled();
  });

  it("computes dynamic SVG zero-offset percentage from asymmetric evaluation ranges", () => {
    // Max +8, Min -2 => zero line sits 80% down from top (8 / 10 = 0.8)
    expect(computeEvalZeroOffset([{ evalWhite: 8 }, { evalWhite: -2 }])).toBeCloseTo(0.8, 3);
    // All positive => 1.0 (white gradient spans whole chart)
    expect(computeEvalZeroOffset([{ evalWhite: 5 }, { evalWhite: 2 }])).toBe(1);
    // All negative => 0.0 (dark gradient spans whole chart)
    expect(computeEvalZeroOffset([{ evalWhite: -4 }, { evalWhite: -1 }])).toBe(0);
  });

  it("renders a 0.0 baseline label and phase transition indicator", () => {
    const moves = [
      makeMove(1, "e4", 25),
      { ...makeMove(2, "d4", 40), tacticalContext: { tags: [], isCheck: false, isCastle: false, gamePhase: "Middlegame" as const } },
    ];
    render(<EvalGraph moves={moves} currentPly={1} onSelectPly={vi.fn()} />);
    expect(screen.getByText("0.0")).toBeInTheDocument();
    expect(screen.getByText(/phase boundaries/i)).toBeInTheDocument();
  });
});
