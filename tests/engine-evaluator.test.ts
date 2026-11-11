import { describe, it, expect } from "vitest";
import {
  evaluateTerminalPosition,
  buildPositionEvalFromUciLines,
} from "@/lib/engine/engine-evaluator";

describe("engine-evaluator (terminal evaluation & UCI line builder)", () => {
  it("evaluates checkmate terminal positions for White and Black winners", () => {
    // Scholar's mate delivered by White (Black to move is checkmated)
    const whiteMateFen = "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4";
    const whiteWin = evaluateTerminalPosition(whiteMateFen);
    expect(whiteWin).not.toBeNull();
    expect(whiteWin?.whiteCp).toBe(10000);
    expect(whiteWin?.whiteMate).toBe(1);
    expect(whiteWin?.isCheckmate).toBe(true);

    // Fool's mate delivered by Black (White to move is checkmated)
    const blackMateFen = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
    const blackWin = evaluateTerminalPosition(blackMateFen);
    expect(blackWin?.whiteCp).toBe(-10000);
    expect(blackWin?.whiteMate).toBe(-1);
    expect(blackWin?.isCheckmate).toBe(true);
  });

  it("evaluates stalemate and draw positions with 0 cp and returns null for non-terminal FENs", () => {
    const stalemateFen = "7k/5Q2/6K1/8/8/8/8/8 b - - 0 50";
    const stale = evaluateTerminalPosition(stalemateFen);
    expect(stale?.whiteCp).toBe(0);
    expect(stale?.whiteMate).toBeUndefined();
    expect(stale?.isCheckmate).toBeFalsy();

    expect(
      evaluateTerminalPosition("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
    ).toBeNull();
  });

  it("accumulates MultiPV lines from deepest depth, skips bounds, and converts to White perspective + SAN", () => {
    const blackTurnFen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    const res = buildPositionEvalFromUciLines(
      blackTurnFen,
      [
        "info depth 10 multipv 1 score cp 50 pv e7e5",
        "info depth 14 multipv 1 score cp -10 lowerbound pv c7c5",
        "info depth 14 multipv 2 score cp -35 pv d7d5 d4d5",
        "info depth 14 multipv 1 score cp 15 pv c7c5 g1f3",
      ],
      "bestmove c7c5 ponder g1f3",
      14
    );

    expect(res.depth).toBe(14);
    expect(res.bestMoveUci).toBe("c7c5");
    expect(res.bestMoveSan).toBe("c5");
    // Black reports +15cp => White perspective is -15cp
    expect(res.whiteCp).toBe(-15);
    expect(res.lines).toHaveLength(2);
    expect(res.lines[0].pvSan).toEqual(["c5", "Nf3"]);
    expect(res.lines[1].cp).toBe(35);
  });

  it("handles bestmove (none) without crashing", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const res = buildPositionEvalFromUciLines(fen, [], "bestmove (none)", 10);
    expect(res.bestMoveUci).toBe("");
    expect(res.bestMoveSan).toBe("");
    expect(res.lines).toEqual([]);
  });

  it("synthesizes fallback PV line when info lines are empty and handles Black-winning checkmate", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const fallback = buildPositionEvalFromUciLines(fen, [], "bestmove e2e4 ponder e7e5", 10);
    expect(fallback.bestMoveSan).toBe("e4");
    expect(fallback.lines).toHaveLength(1);
    expect(fallback.lines[0].pvSan).toEqual(["e4"]);

    // Fool's mate: White is checkmated -> Black winning (whiteCp = -10000, whiteMate = -1)
    const foolsMateFen = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
    const term = evaluateTerminalPosition(foolsMateFen);
    expect(term?.whiteCp).toBe(-10000);
    expect(term?.whiteMate).toBe(-1);
    expect(term?.isCheckmate).toBe(true);
  });
});
