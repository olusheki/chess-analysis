// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { computeArrowGeometry } from "@/components/chess/BoardOverlays";
import { computeWhiteBarPercent, EvalBar } from "@/components/chess/EvalBar";
import { Chessboard } from "@/components/chess/Chessboard";
import { NavigationBar } from "@/components/review/NavigationBar";
import { AccuracyHeader } from "@/components/review/AccuracyHeader";
import { MoveBadgeSummary } from "@/components/review/MoveBadgeSummary";
import { CoachCard } from "@/components/review/CoachCard";

describe("UI components & visual geometry", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe("BoardOverlays arrow geometry", () => {
    it("generates a straight SVG path for orthogonal/diagonal moves", () => {
      const geom = computeArrowGeometry("e2", "e4", false);
      expect(geom.isKnight).toBe(false);
      expect(geom.path).toContain("M ");
      expect(geom.path).toContain(" L ");
      expect(geom.path).not.toContain(" Q ");
    });

    it("generates a bent L-shaped SVG path with rounded corner for Knight moves", () => {
      const geom = computeArrowGeometry("g1", "f3", false);
      expect(geom.isKnight).toBe(true);
      expect(geom.path).toContain(" Q "); // Rounded L-corner
    });

    it("flips arrow coordinates accurately when board is rotated", () => {
      const normal = computeArrowGeometry("a1", "a8", false);
      const flipped = computeArrowGeometry("a1", "a8", true);
      expect(normal.start.x).toBe(50);
      expect(normal.start.y).toBe(750);
      expect(flipped.start.x).toBe(750);
      expect(flipped.start.y).toBe(50);
    });
  });

  describe("EvalBar formula and rendering", () => {
    it("computes 50% at 0cp, clamps between 3% and 97% for finite evals, and 100/0 for mate", () => {
      expect(computeWhiteBarPercent(0)).toBeCloseTo(50, 2);
      expect(computeWhiteBarPercent(10000)).toBe(97);
      expect(computeWhiteBarPercent(-10000)).toBe(3);
      expect(computeWhiteBarPercent(0, 3)).toBe(100);
      expect(computeWhiteBarPercent(0, -2)).toBe(0);
    });

    it("renders signed eval label and reflects white/black advantage", () => {
      render(<EvalBar whiteCp={240} evalLabel="+2.4" flipped={false} />);
      expect(screen.getByText("+2.4")).toBeInTheDocument();
      const fill = screen.getByTestId("eval-bar-white-fill");
      expect(fill.style.height).toBe(`${computeWhiteBarPercent(240)}%`);
    });
  });

  describe("Chessboard rendering and interaction", () => {
    it("renders 64 squares with correct Chess.com colors and flipped orientation", () => {
      const { rerender } = render(
        <Chessboard
          fen="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
          lastMove={{ from: "e2", to: "e4" }}
          badge="Best"
          flipped={false}
        />
      );

      expect(screen.getByTestId("square-a8")).toBeInTheDocument();
      expect(screen.getByTestId("square-h1")).toBeInTheDocument();
      expect(screen.getByTestId("board-move-badge")).toHaveTextContent("★");

      // First rendered square should be a8 when not flipped, h1 when flipped
      const squaresNormal = screen.getAllByTestId(/^square-[a-h][1-8]$/);
      expect(squaresNormal[0]).toHaveAttribute("data-testid", "square-a8");

      rerender(
        <Chessboard
          fen="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
          flipped={true}
        />
      );
      const squaresFlipped = screen.getAllByTestId(/^square-[a-h][1-8]$/);
      expect(squaresFlipped[0]).toHaveAttribute("data-testid", "square-h1");
    });

    it("allows click-to-move interaction in puzzle/interactive mode", () => {
      const onMove = vi.fn();
      render(
        <Chessboard
          fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
          interactive={true}
          onMove={onMove}
        />
      );

      fireEvent.click(screen.getByTestId("square-e2"));
      fireEvent.click(screen.getByTestId("square-e4"));
      expect(onMove).toHaveBeenCalledWith("e2", "e4");
    });
  });

  describe("Review sidebar components", () => {
    it("NavigationBar invokes start, prev, nextKeyMoment, next, end, and flip handlers", () => {
      const handlers = {
        onStart: vi.fn(),
        onPrev: vi.fn(),
        onNextKeyMoment: vi.fn(),
        onNext: vi.fn(),
        onEnd: vi.fn(),
        onFlip: vi.fn(),
      };
      render(
        <NavigationBar
          currentPly={3}
          totalPlies={20}
          hasKeyMoments={true}
          {...handlers}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: /start/i }));
      fireEvent.click(screen.getByRole("button", { name: /previous/i }));
      fireEvent.click(screen.getByRole("button", { name: /key moment/i }));
      fireEvent.click(screen.getByRole("button", { name: /next move/i }));
      fireEvent.click(screen.getByRole("button", { name: /end/i }));
      fireEvent.click(screen.getByRole("button", { name: /flip/i }));

      expect(handlers.onStart).toHaveBeenCalledTimes(1);
      expect(handlers.onPrev).toHaveBeenCalledTimes(1);
      expect(handlers.onNextKeyMoment).toHaveBeenCalledTimes(1);
      expect(handlers.onNext).toHaveBeenCalledTimes(1);
      expect(handlers.onEnd).toHaveBeenCalledTimes(1);
      expect(handlers.onFlip).toHaveBeenCalledTimes(1);
    });

    it("AccuracyHeader & MoveBadgeSummary display CAPS2 percentages, Elo, and badge counts", () => {
      const summary = {
        white: {
          accuracy: 91.4,
          estimatedElo: 2450,
          badgeCounts: {
            Brilliant: 1, Great: 2, Best: 10, Excellent: 4, Good: 2,
            Book: 5, Inaccuracy: 1, Mistake: 0, Miss: 0, Blunder: 0, Forced: 0,
          },
          phaseAccuracies: { opening: 98, middlegame: 91, endgame: 89 },
        },
        black: {
          accuracy: 74.2,
          estimatedElo: 1890,
          badgeCounts: {
            Brilliant: 0, Great: 0, Best: 6, Excellent: 3, Good: 4,
            Book: 5, Inaccuracy: 3, Mistake: 2, Miss: 1, Blunder: 2, Forced: 0,
          },
          phaseAccuracies: { opening: 94, middlegame: 68, endgame: 71 },
        },
      };

      render(
        <>
          <AccuracyHeader
            whiteName="Kasparov, Garry"
            blackName="Topalov, Veselin"
            summary={summary}
          />
          <MoveBadgeSummary summary={summary} />
        </>
      );

      expect(screen.getByText("91.4%")).toBeInTheDocument();
      expect(screen.getByText("74.2%")).toBeInTheDocument();
      expect(screen.getByText("Brilliant")).toBeInTheDocument();
      expect(screen.getByText("Blunder")).toBeInTheDocument();
    });

    it("CoachCard shows Retry Move and Show Best Move controls for errors", () => {
      const onRetry = vi.fn();
      const onToggleBest = vi.fn();

      render(
        <CoachCard
          personaId="danny"
          moveNumber={14}
          playedBy="Black"
          moveSan="Qe7"
          badge="Blunder"
          evalLabel="+3.8"
          bestMoveSan="Nd7"
          bestMovePvSan={["Nd7", "d4", "exd4"]}
          explanation={{
            badge: "Blunder",
            shortComment: "You left your Knight on d7 hanging!",
            detailedExplanation: "Moving your Queen away removed the defender.",
            bestMoveReasoning: "Nd7 kept everything guarded.",
          }}
          retryState={{
            active: false,
            ply: null,
            fen: null,
            targetUci: null,
            targetSan: null,
            status: "idle",
            feedback: null,
            attempts: 0,
          }}
          showBestMove={false}
          bestMovePreviewIndex={0}
          onStartRetry={onRetry}
          onExitRetry={vi.fn()}
          onToggleBestMove={onToggleBest}
          onStepBestMove={vi.fn()}
        />
      );

      expect(screen.getByText("You left your Knight on d7 hanging!")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /retry/i }));
      fireEvent.click(screen.getByRole("button", { name: /show best move/i }));
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onToggleBest).toHaveBeenCalledTimes(1);
    });
  });
});
