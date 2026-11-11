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
import { MoveListReview } from "@/components/review/MoveListReview";
import { UsernameImporter } from "@/components/importer/UsernameImporter";

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

    it("H3.1: clears selectedSquare highlight when fen or interactive mode changes", () => {
      const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
      const afterD4Fen = "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1";
      const { rerender } = render(
        <Chessboard fen={startFen} interactive={true} onMove={vi.fn()} />
      );

      fireEvent.click(screen.getByTestId("square-e2"));
      expect(screen.getByTestId("square-e2").innerHTML).toContain("247, 247, 105");

      // Exit interactive mode -> selection highlight MUST clear immediately
      rerender(<Chessboard fen={startFen} interactive={false} onMove={vi.fn()} />);
      expect(screen.getByTestId("square-e2").innerHTML).not.toContain("247, 247, 105");

      // Re-enter interactive mode and select again, then change FEN -> selection MUST clear
      rerender(<Chessboard fen={startFen} interactive={true} onMove={vi.fn()} />);
      fireEvent.click(screen.getByTestId("square-e2"));
      expect(screen.getByTestId("square-e2").innerHTML).toContain("247, 247, 105");

      rerender(<Chessboard fen={afterD4Fen} interactive={true} onMove={vi.fn()} />);
      expect(screen.getByTestId("square-e2").innerHTML).not.toContain("247, 247, 105");
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

    it("M4: MoveBadgeSummary renders Forced badge row and '—' for 0-move phases; CoachCard caps PV stepper at rendered pills", () => {
      const summary = {
        white: {
          accuracy: 91.4,
          estimatedElo: 2450,
          badgeCounts: {
            Brilliant: 0, Great: 0, Best: 5, Excellent: 0, Good: 0,
            Book: 2, Inaccuracy: 0, Mistake: 0, Miss: 0, Blunder: 0, Forced: 2,
          },
          phaseAccuracies: { opening: 98, middlegame: 91, endgame: 100 },
          phaseMoveCounts: { opening: 4, middlegame: 5, endgame: 0 },
        },
        black: {
          accuracy: 74.2,
          estimatedElo: 1890,
          badgeCounts: {
            Brilliant: 0, Great: 0, Best: 3, Excellent: 0, Good: 0,
            Book: 2, Inaccuracy: 0, Mistake: 0, Miss: 0, Blunder: 1, Forced: 1,
          },
          phaseAccuracies: { opening: 94, middlegame: 68, endgame: 100 },
          phaseMoveCounts: { opening: 4, middlegame: 5, endgame: 0 },
        },
      };

      render(<MoveBadgeSummary summary={summary} />);
      expect(screen.getByText("Forced")).toBeInTheDocument();
      expect(screen.getByText("—")).toBeInTheDocument();

      cleanup();

      // CoachCard with 8 PV moves at step 6 should disable "Step line forward" (not go past rendered 6 pills)
      render(
        <CoachCard
          personaId="danny"
          moveNumber={10}
          playedBy="White"
          moveSan="Qh5"
          badge="Mistake"
          bestMoveSan="Nf3"
          bestMovePvSan={["Nf3", "Nc6", "Bc4", "Bc5", "d3", "Nf6", "O-O", "d6"]}
          retryState={{
            active: false, ply: null, fen: null, targetUci: null, targetSan: null,
            status: "idle", feedback: null, attempts: 0,
          }}
          showBestMove={true}
          bestMovePreviewIndex={6}
          onStartRetry={vi.fn()}
          onExitRetry={vi.fn()}
          onToggleBestMove={vi.fn()}
          onStepBestMove={vi.fn()}
        />
      );
      expect(screen.getByRole("button", { name: "Step line forward" })).toBeDisabled();
    });

    it("M1: MoveListReview renders starting move numbers and Black-first custom FEN moves accurately", () => {
      const blackFirstMoves = [
        {
          ply: 1,
          moveNumber: 12,
          color: "b" as const,
          san: "Kd7",
          uci: "e8d7",
          from: "e8" as const,
          to: "d7" as const,
          fenBefore: "",
          fenAfter: "",
          whiteCp: 20,
          evalLabel: "+0.2",
          bestMoveUci: "e8d7",
          bestMoveSan: "Kd7",
          bestMovePvSan: [],
          altPvSan: [],
          materialSacrificed: 0,
          classification: {
            badge: "Best" as const, deltaWP: 0, accuracy: 100, color: "#96bc4b", symbol: "★", isBlunder: false, isKeyMoment: false,
          },
          tacticalContext: { tags: [], isCheck: false, isCastle: false, gamePhase: "Endgame" as const },
        },
        {
          ply: 2,
          moveNumber: 13,
          color: "w" as const,
          san: "e4",
          uci: "e2e4",
          from: "e2" as const,
          to: "e4" as const,
          fenBefore: "",
          fenAfter: "",
          whiteCp: 20,
          evalLabel: "+0.2",
          bestMoveUci: "e2e4",
          bestMoveSan: "e4",
          bestMovePvSan: [],
          altPvSan: [],
          materialSacrificed: 0,
          classification: {
            badge: "Best" as const, deltaWP: 0, accuracy: 100, color: "#96bc4b", symbol: "★", isBlunder: false, isKeyMoment: false,
          },
          tacticalContext: { tags: [], isCheck: false, isCastle: false, gamePhase: "Endgame" as const },
        },
      ];

      render(
        <MoveListReview
          moves={blackFirstMoves}
          opening={{
            opening: null,
            bookPlies: 0,
            outOfBookPly: null,
            outOfBookMoveNumber: null,
            plyIsBook: [false, false],
            plyOpenings: [null, null],
            insight: "",
          }}
          currentPly={1}
          onSelectPly={vi.fn()}
        />
      );

      expect(screen.getByText("12.")).toBeInTheDocument();
      expect(screen.getByText("13.")).toBeInTheDocument();
      expect(screen.getByText("...")).toBeInTheDocument();
    });

    it("M4: UsernameImporter aborts superseded username searches so slow responses never overwrite newer ones", async () => {
      let resolveSlow!: (res: Response) => void;
      const signals: AbortSignal[] = [];

      globalThis.fetch = vi.fn((url: string | URL | Request, init?: RequestInit) => {
        if (init?.signal) signals.push(init.signal);
        const u = String(url);
        if (u.includes("slowuser")) {
          return new Promise<Response>((r) => {
            resolveSlow = r;
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            profile: { username: "FastUser", status: "premium", followers: 10 },
            games: [],
          }),
        } as Response);
      }) as unknown as typeof fetch;

      render(<UsernameImporter onSelectGame={vi.fn()} />);
      const input = screen.getByLabelText("Chess.com username");

      fireEvent.change(input, { target: { value: "slowuser" } });
      fireEvent.submit(input.closest("form")!);

      fireEvent.change(input, { target: { value: "fastuser" } });
      fireEvent.submit(input.closest("form")!);

      await screen.findByText("FastUser");
      expect(signals[0]?.aborted).toBe(true);

      // Now let the superseded slowuser response resolve late -> FastUser MUST remain displayed
      resolveSlow({
        ok: true,
        json: async () => ({
          profile: { username: "SlowUser", status: "basic", followers: 1 },
          games: [],
        }),
      } as Response);

      await Promise.resolve();
      await Promise.resolve();
      expect(screen.getByText("FastUser")).toBeInTheDocument();
      expect(screen.queryByText("SlowUser")).toBeNull();
    });
  });
});
