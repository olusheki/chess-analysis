import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { extractTacticalContext, determineGamePhase } from "@/lib/analysis/tactical-tagger";

function playAndExtract(fenBefore: string, moveSan: string, moveNumber = 15) {
  const chess = new Chess(fenBefore);
  const move = chess.move(moveSan);
  expect(move).not.toBeNull();
  return extractTacticalContext(fenBefore, chess.fen(), moveSan, moveNumber);
}

describe("tactical-tagger (deterministic board feature detector)", () => {
  it("does NOT falsely tag TACTICAL_FORK when other pieces on the board already attack enemy pieces", () => {
    // White has Bc4 attacking Black Nf7 and Ra1 attacking Black Ra7 (already 2 valuable pieces attacked),
    // then White plays Nh4 (which attacks nothing!). Must NOT tag TACTICAL_FORK!
    const fen = "4k3/r4n2/8/8/2B5/5N2/8/R3K3 w - - 0 15";
    const ctx = playAndExtract(fen, "Nh4", 15);
    expect(ctx.tags).not.toContain("TACTICAL_FORK");
  });

  it("detects true Knight fork (Nc7+ forking King on e8 and Rook on a8)", () => {
    const fen = "r3k3/8/8/1N6/8/8/8/4K3 w - - 0 20";
    const ctx = playAndExtract(fen, "Nc7+", 20);
    expect(ctx.tags).toContain("TACTICAL_FORK");
    expect(ctx.isCheck).toBe(true);
    const targetSquares = ctx.forkTargets?.map((t) => t.square) ?? [];
    expect(targetSquares).toContain("e8");
    expect(targetSquares).toContain("a8");
  });

  it("detects forks with disambiguated SAN and pawn promotions", () => {
    // Disambiguated knight fork Nbd5 attacking Qc7 and Re7 (White King on a1)
    const disambigFen = "4k3/2q1r3/8/8/1N3N2/8/8/K7 w - - 0 25";
    const ctx1 = playAndExtract(disambigFen, "Nbd5", 25);
    expect(ctx1.tags).toContain("TACTICAL_FORK");
    expect(ctx1.forkTargets?.map((t) => t.square)).toEqual(expect.arrayContaining(["c7", "e7"]));

    // Pawn promotion to Queen forking King on h8 and Rook on a8: e8=Q+
    const promoFen = "r6k/4P3/8/8/8/8/8/4K3 w - - 0 40";
    const ctx2 = playAndExtract(promoFen, "e8=Q+", 40);
    expect(ctx2.tags).toContain("TACTICAL_FORK");
    expect(ctx2.forkTargets?.map((t) => t.square)).toEqual(expect.arrayContaining(["a8", "h8"]));
  });

  it("prioritizes the highest-value hanging piece rather than stopping at a hanging pawn", () => {
    // White has a hanging a2 pawn AND a hanging Queen on d4 attacked by Black Bishop on g7
    const fen = "4k3/6b1/8/8/3Q4/8/r2P1PPP/4K3 w - - 0 20";
    // White plays h3, leaving both a2 pawn (attacked by Ra2) and Qd4 (attacked by Bg7) hanging!
    const ctx = playAndExtract(fen, "h3", 20);
    expect(ctx.tags).toContain("HANGING_PIECE");
    expect(ctx.hangingPieceDetails?.piece).toBe("Queen");
    expect(ctx.hangingPieceDetails?.square).toBe("d4");
  });

  it("flags high-value piece attacked by a lower-value piece even if defended", () => {
    // White plays Qd4 right where Black Pawn on c5 (defended by b6) attacks it, even if Qd4 is defended by e3
    const fen = "4k3/8/1p6/2p5/8/4P3/8/3QK3 w - - 0 20";
    const ctx = playAndExtract(fen, "Qd4", 20);
    expect(ctx.tags).toContain("HANGING_PIECE");
    expect(ctx.hangingPieceDetails?.piece).toBe("Queen");
    expect(ctx.hangingPieceDetails?.square).toBe("d4");
  });

  it("detects ABSOLUTE_PIN (piece pinned to King)", () => {
    // Black already played ...d6 so d7 is empty; White plays Bb5 pinning Black Nc6 to Ke8
    const fen = "r1bqkbnr/ppp2ppp/2np4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 4";
    const ctx = playAndExtract(fen, "Bb5", 4);
    expect(ctx.tags).toContain("ABSOLUTE_PIN");
    expect(ctx.pinnedPieceDetails?.square).toBe("c6");
    expect(ctx.pinnedPieceDetails?.pinnedTo).toBe("King");
  });

  it("detects RELATIVE_PIN (piece pinned to Queen or Rook)", () => {
    // Black already played ...e6 so e7 is empty; White plays Bg5 pinning Black Nf6 to Qd8
    const fen = "rnbqkb1r/ppp2ppp/3ppn2/8/3PP3/2N5/PPP2PPP/R1BQKBNR w KQkq - 0 5";
    const ctx = playAndExtract(fen, "Bg5", 5);
    expect(ctx.tags).toContain("RELATIVE_PIN");
    expect(ctx.pinnedPieceDetails?.square).toBe("f6");
    expect(ctx.pinnedPieceDetails?.pinnedTo).toBe("Queen");
  });

  it("detects SKEWER (high-value enemy piece attacked in front of another enemy piece)", () => {
    // White plays Re1+ checking Black King on e5 with Black Queen on e8 behind it
    const fen = "4q3/8/8/4k3/8/8/8/K6R w - - 0 30";
    const ctx = playAndExtract(fen, "Re1+", 30);
    expect(ctx.tags).toContain("SKEWER");
  });

  it("detects DISCOVERED_ATTACK when moving a piece unblocks a friendly slider", () => {
    // White has Re1 and Ne4; playing Nd6 discovers an attack from Re1 onto Black Qe8
    const fen = "k3q3/8/8/8/4N3/8/8/4R1K1 w - - 0 25";
    const ctx = playAndExtract(fen, "Nd6", 25);
    expect(ctx.tags).toContain("DISCOVERED_ATTACK");
  });

  it("detects CHECKMATE_THREAT when moved side has mate in 1 on the next turn", () => {
    // White plays Qf3 threatening Qxf7# (with Bc4 already on c4)
    const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 2 3";
    const ctx = playAndExtract(fen, "Qf3", 3);
    expect(ctx.tags).toContain("CHECKMATE_THREAT");
  });

  it("detects DEVELOPMENT, CENTER_CONTROL, KING_SAFETY_CASTLE, and gamePhase", () => {
    const castleFen = "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
    const castleCtx = playAndExtract(castleFen, "O-O", 4);
    expect(castleCtx.tags).toContain("KING_SAFETY_CASTLE");
    expect(castleCtx.isCastle).toBe(true);
    expect(castleCtx.gamePhase).toBe("Opening");

    const centerFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const centerCtx = playAndExtract(centerFen, "e4", 1);
    expect(centerCtx.tags).toContain("CENTER_CONTROL");

    const devCtx = playAndExtract("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", "Nc6", 1);
    expect(devCtx.tags).toContain("DEVELOPMENT");

    const endgameFen = "4k3/8/8/8/8/8/4R3/4K3 w - - 0 35";
    const endgameCtx = playAndExtract(endgameFen, "Re4", 35);
    expect(endgameCtx.gamePhase).toBe("Endgame");
  });

  it("H6.1: handles pinned defenders, pinned attackers, and overloaded 2-on-1 defenders accurately in HANGING_PIECE", () => {
    // Rf4 attacked by g5 pawn, defended ONLY by pinned Bd2 (pinned to Ke1 by Qa5) -> MUST flag Rf4 hanging
    const pinnedDefFen = "4k3/8/8/q5p1/5R2/8/3B3P/4K3 w - - 0 20";
    const pinnedDefCtx = playAndExtract(pinnedDefFen, "h3", 20);
    expect(pinnedDefCtx.tags).toContain("HANGING_PIECE");
    expect(pinnedDefCtx.hangingPieceDetails?.square).toBe("f4");

    // Nf5 pseudo-attacked by Black Nd6, which is absolutely pinned to Kd8 by White Rd1 -> NOT hanging
    const pinnedAttFen = "3k4/8/3n4/5N2/8/8/8/4R1K1 w - - 0 25";
    const pinnedAttCtx = playAndExtract(pinnedAttFen, "Rd1", 25);
    expect(pinnedAttCtx.tags).not.toContain("HANGING_PIECE");

    // Overloaded defender: Re4 attacked by Re8 and Ra4 (2 attackers), defended only by Re1 (1 defender) -> hanging
    const overloadedFen = "4r1k1/8/8/8/r3R3/8/7P/4R1K1 w - - 0 30";
    const overloadedCtx = playAndExtract(overloadedFen, "h3", 30);
    expect(overloadedCtx.tags).toContain("HANGING_PIECE");
    expect(overloadedCtx.hangingPieceDetails?.square).toBe("e4");
  });

  it("H6.2: detects TRAPPED_PIECE even when trapped piece has 3+ losing escape moves", () => {
    // Black Rb5 attacked by Ba4 has 3 moves (Ra5, Rc5, Rxb4), all losing material cleanly
    const trappedRookFen = "6k1/8/1pN5/1r1p4/1P1P4/P7/2B5/6K1 w - - 0 30";
    const ctx = playAndExtract(trappedRookFen, "Ba4", 30);
    expect(ctx.tags).toContain("TRAPPED_PIECE");
  });

  it("H6.3: does NOT tag CHECKMATE_THREAT on a quiet blunder when mate-in-1 already existed before the move", () => {
    // White ALREADY had Re8# / Qb8# before playing quiet h3 -> should not celebrate CHECKMATE_THREAT
    const fen = "6k1/5ppp/8/8/8/8/1Q5P/4R1K1 w - - 0 30";
    const ctx = playAndExtract(fen, "h3", 30);
    expect(ctx.tags).not.toContain("CHECKMATE_THREAT");
  });

  it("H6.4 & M2: refines RELATIVE_PIN, SKEWER, DEVELOPMENT, CENTER_CONTROL, TEMPO_GAIN, PAWN_BREAK, and Endgame phase", () => {
    // Pawn f6 pinned to Bishop e7 is NOT RELATIVE_PIN (spec restricts to Queen or Rook)
    const pawnBishopPinFen = "4k3/4b3/5p2/8/8/8/4B3/4K3 w - - 0 20";
    const pinCtx = playAndExtract(pawnBishopPinFen, "Bh5+", 20);
    expect(pinCtx.tags).not.toContain("RELATIVE_PIN");

    // Undefended Re1 attacking Qe5 in front of Be8 can just be captured by Qxe1+ (NOT a sound skewer)
    const fakeSkewerFen = "4b1k1/8/8/4q3/8/8/8/5RK1 w - - 0 30";
    const fakeSkewerCtx = playAndExtract(fakeSkewerFen, "Re1", 30);
    expect(fakeSkewerCtx.tags).not.toContain("SKEWER");

    // Queen Qa1 attacking defended Rook Ra5 in front of Ba8 is NOT a skewer
    const qSkewFen = "b3k3/8/1p6/r7/8/8/1Q6/6K1 w - - 0 30";
    const qSkewCtx = playAndExtract(qSkewFen, "Qa1", 30);
    expect(qSkewCtx.tags).not.toContain("SKEWER");

    // Minor piece retreat Bf1 is NOT DEVELOPMENT; Nf3 targets e5/d4 so gets CENTER_CONTROL
    const retreatCtx = playAndExtract(
      "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3",
      "Ng1",
      3
    );
    expect(retreatCtx.tags).not.toContain("DEVELOPMENT");

    const nf3Ctx = playAndExtract("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "Nf3", 1);
    expect(nf3Ctx.tags).toContain("CENTER_CONTROL");
    expect(nf3Ctx.tags).toContain("DEVELOPMENT");

    // Endgame detected from material even at move 2
    expect(determineGamePhase(new Chess("4k3/8/8/8/8/8/4R3/4K3 w - - 0 2"), 2)).toBe("Endgame");

    // TEMPO_GAIN & PAWN_BREAK
    const tempoCtx = playAndExtract("4k3/8/8/3q4/8/1P6/8/4KB2 w - - 0 15", "Bc4", 15);
    expect(tempoCtx.tags).toContain("TEMPO_GAIN");

    const breakCtx = playAndExtract("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", "d4", 2);
    expect(breakCtx.tags).toContain("PAWN_BREAK");
  });
});
