// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { computeArrowGeometry } from "@/components/chess/BoardOverlays";
import { computeWhiteBarPercent, EvalBar } from "@/components/chess/EvalBar";
import { Chessboard } from "@/components/chess/Chessboard";
import { ChessPieceSvg } from "@/components/chess/ChessPieces";
import { NavigationBar } from "@/components/review/NavigationBar";
import { AccuracyHeader } from "@/components/review/AccuracyHeader";
import { MoveBadgeSummary } from "@/components/review/MoveBadgeSummary";
import { CoachCard } from "@/components/review/CoachCard";
import { MoveListReview } from "@/components/review/MoveListReview";
import { UsernameImporter } from "@/components/importer/UsernameImporter";
import { GameSelectionList } from "@/components/importer/GameSelectionList";

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
      expect(computeWhiteBarPercent(260)).toBeGreaterThanOrEqual(77);
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
      const onPunish = vi.fn();
      const onToggleBest = vi.fn();

      const { rerender } = render(
        <CoachCard
          personaId="danny"
          coachColor="black"
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
          onPunishError={onPunish}
          canPunishError={true}
          onExitRetry={vi.fn()}
          onToggleBestMove={onToggleBest}
          onStepBestMove={vi.fn()}
        />
      );

      expect(screen.getByText("You left your Knight on d7 hanging!")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /retry move/i }));
      fireEvent.click(screen.getByRole("button", { name: /show best move/i }));
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onToggleBest).toHaveBeenCalledTimes(1);

      // When reviewing opponent's blunder (coachColor=black, playedBy=White), hide Retry Move and show Punish Error
      rerender(
        <CoachCard
          personaId="danny"
          coachColor="black"
          moveNumber={8}
          playedBy="White"
          moveSan="Bb5+"
          badge="Mistake"
          evalLabel="-1.9"
          bestMoveSan="d3"
          bestMovePvSan={["d3", "Nf6"]}
          explanation={{
            badge: "Mistake",
            shortComment: "Bb5+ allows c6 with tempo.",
            detailedExplanation: "White dropped initiative.",
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
          onPunishError={onPunish}
          canPunishError={true}
          onExitRetry={vi.fn()}
          onToggleBestMove={onToggleBest}
          onStepBestMove={vi.fn()}
        />
      );

      expect(screen.queryByRole("button", { name: /retry move/i })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /punish error/i }));
      expect(onPunish).toHaveBeenCalledTimes(1);
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

    it("renders single-side CoachCard perspective toggle, mode indicator, interactive AccuracyHeader selector, and persistent Chessboard selection reset", () => {
      const onChangeCoachColor = vi.fn();
      render(
        <CoachCard
          personaId="danny"
          coachColor="white"
          onChangeCoachColor={onChangeCoachColor}
          moveNumber={10}
          playedBy="Black"
          moveSan="g5"
          badge="Blunder"
          bestMoveSan="Nf6"
          bestMovePvSan={["Nf6", "d4"]}
          explanation={{
            badge: "Blunder",
            shortComment: "Your opponent blundered with g5 — time to strike!",
            detailedExplanation: "Nxg5 wins material immediately.",
            coachMode: "offline",
          }}
          retryState={{
            active: false, ply: null, fen: null, targetUci: null, targetSan: null,
            status: "idle", feedback: null, attempts: 0,
          }}
          showBestMove={false}
          bestMovePreviewIndex={0}
          onStartRetry={vi.fn()}
          onExitRetry={vi.fn()}
          onToggleBestMove={vi.fn()}
          onStepBestMove={vi.fn()}
        />
      );
      expect(screen.getByText("Offline Coach")).toBeInTheDocument();
      expect(screen.getByText("Opponent Move")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Coach as Black" }));
      expect(onChangeCoachColor).toHaveBeenCalledWith("black");

      cleanup();

      const onSelectHeaderColor = vi.fn();
      render(
        <AccuracyHeader
          whiteName="WhitePlayer"
          blackName="BlackPlayer"
          whiteEloHeader="800"
          blackEloHeader="780"
          summary={{
            white: {
              accuracy: 81.2,
              estimatedElo: 860,
              badgeCounts: {
                Brilliant: 0, Great: 0, Best: 5, Excellent: 0, Good: 0,
                Book: 2, Inaccuracy: 0, Mistake: 0, Miss: 0, Blunder: 0, Forced: 0,
              },
              phaseAccuracies: { opening: 90, middlegame: 80, endgame: 100 },
            },
            black: {
              accuracy: 74.8,
              estimatedElo: 790,
              badgeCounts: {
                Brilliant: 0, Great: 0, Best: 3, Excellent: 0, Good: 0,
                Book: 2, Inaccuracy: 0, Mistake: 0, Miss: 0, Blunder: 1, Forced: 0,
              },
              phaseAccuracies: { opening: 85, middlegame: 70, endgame: 100 },
            },
          }}
          coachColor="black"
          onSelectCoachColor={onSelectHeaderColor}
        />
      );
      expect(screen.getByText("Coaching")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Coach as White/i }));
      expect(onSelectHeaderColor).toHaveBeenCalledWith("white");

      cleanup();

      // Chessboard stays mounted without key={fen} yet clears selection when FEN changes
      const { rerender } = render(
        <Chessboard
          fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
          interactive={true}
          onMove={vi.fn()}
        />
      );
      const boardSurface = screen.getByTestId("chessboard-grid");
      fireEvent.click(screen.getByTestId("square-e2"));
      expect(screen.getByTestId("legal-dot-e4")).toBeInTheDocument();

      rerender(
        <Chessboard
          fen="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
          interactive={true}
          onMove={vi.fn()}
        />
      );
      expect(screen.getByTestId("chessboard-grid")).toBe(boardSurface);
      expect(screen.queryByTestId("legal-dot-e4")).toBeNull();
    });

    it("renders CoachCard in Plain English by default before SAN and toggles cleanly between Plain English and SAN", () => {
      const onChangePlainEnglish = vi.fn();
      const props = {
        personaId: "danny" as const,
        coachColor: "white" as const,
        onChangePlainEnglish,
        moveNumber: 12,
        playedBy: "Black" as const,
        moveSan: "Nxb4",
        badge: "Blunder" as const,
        bestMoveSan: "g8+",
        bestMovePvSan: ["g8+", "Kg1"],
        explanation: {
          badge: "Blunder" as const,
          shortComment: "Your opponent blundered with Nxb4!",
          detailedExplanation: "Better was g8+ instead of Nxb4.",
          bestMoveReasoning: "g8+ forces king movement.",
          coachMode: "offline" as const,
        },
        retryState: {
          active: false,
          ply: null,
          fen: null,
          targetUci: null,
          targetSan: null,
          status: "idle" as const,
          feedback: null,
          attempts: 0,
        },
        showBestMove: true,
        bestMovePreviewIndex: 1,
        onStartRetry: vi.fn(),
        onExitRetry: vi.fn(),
        onToggleBestMove: vi.fn(),
        onStepBestMove: vi.fn(),
      };

      const { rerender } = render(<CoachCard {...props} plainEnglish={true} />);
      expect(screen.getByText("knight takes b4")).toBeInTheDocument();
      expect(screen.getByText("(Nxb4)")).toBeInTheDocument();
      expect(screen.getByText("Your opponent blundered with knight takes b4!")).toBeInTheDocument();
      expect(screen.getByText("Better was pawn g8 check instead of knight takes b4.")).toBeInTheDocument();
      expect(screen.getByText(/Best was pawn g8 check \(g8\+\):/)).toBeInTheDocument();
      expect(screen.getByText("pawn g8 check")).toBeInTheDocument();
      expect(screen.getByText("king g1")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Simple notation (SAN)" }));
      expect(onChangePlainEnglish).toHaveBeenCalledWith(false);

      rerender(<CoachCard {...props} plainEnglish={false} />);
      expect(screen.getByText("Your opponent blundered with Nxb4!")).toBeInTheDocument();
      expect(screen.getByText("Better was g8+ instead of Nxb4.")).toBeInTheDocument();
      expect(screen.getByText("Kg1")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Plain English notation" }));
      expect(onChangePlainEnglish).toHaveBeenCalledWith(true);
    });

    it("renders captured dark ChessPieceSvg with high-contrast stroke on dark plates and shows ECO/reviewed badges in GameSelectionList", () => {
      const { container } = render(
        <ChessPieceSvg color="b" type="n" darkSurfaceContrast={true} />
      );
      const html = container.innerHTML;
      expect(html).not.toContain("#0b0a09");
      expect(html).toContain("#8d8881");

      cleanup();

      render(
        <GameSelectionList
          games={[
            {
              id: "g1",
              opponent: "Coach-David",
              opponentRating: 400,
              userRating: 800,
              userColor: "white",
              result: "win",
              resultDetail: "resigned",
              timeControl: "600",
              timeClass: "rapid",
              date: "Nov 10, 2026",
              pgn: "1. e4 e5 1-0",
              openingName: "Philidor Defense",
              hasChessComAccuracy: true,
            },
          ]}
          onSelectGame={vi.fn()}
        />
      );
      expect(screen.getByText(/Philidor Defense/i)).toBeInTheDocument();
      expect(screen.getByText(/Reviewed/i)).toBeInTheDocument();

      cleanup();
      render(
        <CoachCard
          personaId="danny"
          coachColor="white"
          plainEnglish={true}
          moveNumber={12}
          playedBy="Black"
          moveSan="Nxb4"
          badge="Blunder"
          bestMoveSan="g8+"
          bestMovePvSan={["g8+"]}
          explanation={null}
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
          onStartRetry={vi.fn()}
          onExitRetry={vi.fn()}
          onToggleBestMove={vi.fn()}
          onStepBestMove={vi.fn()}
        />
      );
      expect(screen.getByText("Knight takes b4 (Nxb4) is rated Blunder.")).toBeInTheDocument();

      cleanup();
      render(<EvalBar whiteCp={120} evalLabel="+1.2" />);
      const evalClasses = screen.getByLabelText("Evaluation +1.2").className.split(/\s+/);
      expect(evalClasses).toContain("w-6");
      expect(evalClasses).toContain("sm:w-7");
      expect(evalClasses).not.toContain("w-7");
    });

    it("UsernameImporter staticExport mode fetches directly from Chess.com PubAPI without /api/chesscom", async () => {
      const urls: string[] = [];
      globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
        const u = String(url);
        urls.push(u);
        if (u.endsWith("/player/olusheki")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              username: "olusheki",
              status: "basic",
              followers: 3,
            }),
          } as Response;
        }
        if (u.endsWith("/player/olusheki/games/archives")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              archives: ["https://api.chess.com/pub/player/olusheki/games/2026/11"],
            }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            games: [
              {
                url: "https://chess.com/game/1",
                pgn: "1. e4 e5 1-0",
                time_control: "600",
                end_time: 1700000100,
                rated: true,
                time_class: "rapid",
                rules: "chess",
                white: { username: "olusheki", rating: 450, result: "win" },
                black: { username: "OpponentX", rating: 440, result: "resigned" },
              },
            ],
          }),
        } as Response;
      }) as unknown as typeof fetch;

      render(<UsernameImporter onSelectGame={vi.fn()} staticExport={true} />);
      const input = screen.getByLabelText("Chess.com username");
      fireEvent.change(input, { target: { value: "olusheki" } });
      fireEvent.submit(input.closest("form")!);

      await screen.findByText("olusheki");
      await screen.findByText(/OpponentX/i);
      expect(urls.every((u) => u.startsWith("https://api.chess.com/pub/"))).toBe(true);
      expect(urls.some((u) => u.includes("/api/chesscom"))).toBe(false);
    });
  });
});
