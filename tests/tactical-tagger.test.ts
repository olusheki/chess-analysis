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

    // Pawn promotion to Queen forking King on h8 and Rook on a4: e8=Q+
    const promoFen = "7k/4P3/8/8/r7/8/8/4K3 w - - 0 40";
    const ctx2 = playAndExtract(promoFen, "e8=Q+", 40);
    expect(ctx2.tags).toContain("TACTICAL_FORK");
    expect(ctx2.forkTargets?.map((t) => t.square)).toEqual(expect.arrayContaining(["a4", "h8"]));
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

    // Hanging pseudo-fork (Nf2 attacking Qd1 and Rh1 directly into Bxf2) must NOT celebrate TACTICAL_FORK
    const pseudoForkFen = "4k3/8/8/8/4n3/4B3/8/3Q2KR b - - 0 20";
    const pseudoForkCtx = playAndExtract(pseudoForkFen, "Nf2", 20);
    expect(pseudoForkCtx.tags).not.toContain("TACTICAL_FORK");
  });

  it("covers castling flags, endgame development gate, tempo bounds, highest-value hanging piece, skewer/pin/discovered edge guards, and piece names", () => {
    // 1. Castling (k and q flags), non-castling King move, and malformed SAN fallback
    const kCastle = playAndExtract("4k3/8/8/8/8/8/8/4K2R w K - 0 15", "O-O", 15);
    expect(kCastle.tags).toContain("KING_SAFETY_CASTLE");
    const qCastle = playAndExtract("4k3/8/8/8/8/8/8/R3K3 w Q - 0 15", "O-O-O", 15);
    expect(qCastle.tags).toContain("KING_SAFETY_CASTLE");
    const kingStep = playAndExtract("r3k2r/8/8/8/8/8/8/4K3 w - - 0 15", "Kf1", 15);
    expect(kingStep.tags).not.toContain("KING_SAFETY_CASTLE");
    const malformedCtx = extractTacticalContext(
      "4k3/8/8/8/8/8/8/4K3 w - - 0 15",
      "4k3/8/8/8/8/8/8/4K3 b - - 0 15",
      "Zzz9",
      15
    );
    expect(malformedCtx.tags).not.toContain("KING_SAFETY_CASTLE");

    // 2. Endgame must suppress DEVELOPMENT tags on Knight/Bishop moves
    const endgameDev = playAndExtract("4k3/8/8/8/8/8/8/1N2K3 w - - 0 40", "Nc3", 40);
    expect(endgameDev.gamePhase).toBe("Endgame");
    expect(endgameDev.tags).not.toContain("DEVELOPMENT");

    // 3. Tempo gain: Pawn & Knight attacking Rook/Queen trigger TEMPO_GAIN; attacking Knight or with Queen does not
    const pawnTempoRook = playAndExtract("4k3/8/8/3r4/2P5/8/8/4K3 w - - 0 15", "c5", 15);
    expect(pawnTempoRook.tags).not.toContain("TEMPO_GAIN"); // c5 stops short; test c4 attacking b5 Rook instead
    const pawnHitsRook = playAndExtract("4k3/8/8/1r6/8/2P5/8/4K3 w - - 0 15", "c4", 15);
    expect(pawnHitsRook.tags).toContain("TEMPO_GAIN");
    const knightHitsRook = playAndExtract("4k3/8/8/3r4/8/8/8/1N2K3 w - - 0 15", "Nc3", 15);
    expect(knightHitsRook.tags).toContain("TEMPO_GAIN");
    const knightHitsFriendlyRook = playAndExtract("4k3/8/8/3R4/8/8/8/1N2K3 w - - 0 15", "Nc3", 15);
    expect(knightHitsFriendlyRook.tags).not.toContain("TEMPO_GAIN");
    const knightHitsBishop = playAndExtract("4k3/8/8/3b4/8/8/8/1N2K3 w - - 0 15", "Nc3", 15);
    expect(knightHitsBishop.tags).not.toContain("TEMPO_GAIN");
    const queenHitsRook = playAndExtract("4k3/8/8/3r4/8/8/8/3QK3 w - - 0 15", "Qd4", 15);
    expect(queenHitsRook.tags).not.toContain("TEMPO_GAIN");

    // 4. Highest-value friendly hanging piece wins regardless of board scan order, ignoring opponent hanging pieces
    // Black Queen is undefended on a8; White has hanging Knight on a6 (attacked by Bb7) AND hanging Rook on h2 (attacked by Rb2) -> Rook (5) wins over Knight (3)
    const highOverLow = playAndExtract("q3k3/1b6/N7/8/8/8/1r5R/4K3 w - - 0 20", "Kf1", 20);
    expect(highOverLow.tags).toContain("HANGING_PIECE");
    expect(highOverLow.hangingPieceDetails?.piece).toBe("Rook");
    expect(highOverLow.hangingPieceDetails?.square).toBe("h2");
    expect(highOverLow.hangingPieceDetails?.value).toBe(5);

    // When higher-value Rook on a6 (attacked by Bb5) appears BEFORE lower-value Pawn on h2 (attacked by Bg3), Rook still wins (>)
    const rookBeforePawn = playAndExtract("4k3/8/R7/1b6/8/6b1/7P/4K3 w - - 0 20", "Kd1", 20);
    expect(rookBeforePawn.hangingPieceDetails?.piece).toBe("Rook");
    expect(rookBeforePawn.hangingPieceDetails?.square).toBe("a6");

    // 5. Skewer value & defense guards
    // Rook defended by Nc2 skewering defended Queen on e5 in front of Knight on e7 (r < q -> valid skewer)
    const rookSkewersDefendedQueen = playAndExtract(
      "4k3/4n3/3p4/4q3/8/8/2N5/R5K1 w - - 0 25",
      "Re1",
      25
    );
    expect(rookSkewersDefendedQueen.tags).toContain("SKEWER");
    expect(rookSkewersDefendedQueen.skeweredPieceDetails?.frontPiece).toBe("Queen");
    expect(rookSkewersDefendedQueen.skeweredPieceDetails?.frontSquare).toBe("e5");
    expect(rookSkewersDefendedQueen.skeweredPieceDetails?.backPiece).toBe("Knight");
    expect(rookSkewersDefendedQueen.skeweredPieceDetails?.backSquare).toBe("e7");

    // Queen on c2 attacking DEFENDED Rook on f5 in front of Knight on g6 (!(9 < 5) && frontDefended -> NOT a skewer)
    const queenBlockedByDefendedRook = playAndExtract(
      "6k1/8/4p1n1/5r2/8/8/8/1Q4K1 w - - 0 25",
      "Qc2",
      25
    );
    expect(queenBlockedByDefendedRook.tags).not.toContain("SKEWER");

    // Queen on c2 attacking UNDEFENDED Rook on f5 in front of Knight on g6 (!frontDefended -> valid skewer)
    const queenSkewersUndefendedRook = playAndExtract(
      "6k1/8/6n1/5r2/8/8/8/1Q4K1 w - - 0 25",
      "Qc2",
      25
    );
    expect(queenSkewersUndefendedRook.tags).toContain("SKEWER");

    // Pawn on g6 behind Knight on f5 must NOT trigger SKEWER (secondEnemy value < 3)
    const skeweringBehindPawn = playAndExtract(
      "6k1/8/6p1/5n2/8/8/8/1Q4K1 w - - 0 25",
      "Qc2",
      25
    );
    expect(skeweringBehindPawn.tags).not.toContain("SKEWER");

    // 6. Relative pin against Rook + non-pin against equal-value Bishop
    const pinToRook = playAndExtract("4k3/8/4r3/3n4/8/8/B7/6K1 w - - 0 25", "Bb3", 25);
    expect(pinToRook.tags).toContain("RELATIVE_PIN");
    expect(pinToRook.pinnedPieceDetails?.piece).toBe("Knight");
    expect(pinToRook.pinnedPieceDetails?.pinnedTo).toBe("Rook");
    const nonPinEqual = playAndExtract("4k3/8/4b3/3n4/8/8/B7/6K1 w - - 0 25", "Bb3", 25);
    expect(nonPinEqual.tags).not.toContain("RELATIVE_PIN");

    // 7. Discovered attack via unblocked Queen & game-over move safe no-mate check
    const discoveredQueen = playAndExtract("3rk3/8/8/8/3N4/8/3Q4/6K1 w - - 0 25", "Nf5", 25);
    expect(discoveredQueen.tags).toContain("DISCOVERED_ATTACK");
    expect(discoveredQueen.discoveredTarget?.piece).toBe("Rook");
    expect(discoveredQueen.discoveredTarget?.square).toBe("d8");

    const checkmateMove = playAndExtract("6k1/5Q2/6K1/8/8/8/8/8 w - - 0 40", "Qg7#", 40);
    expect(checkmateMove.tags).not.toContain("CHECKMATE_THREAT");
  });

  it("P0: prioritizes refutation-first HANGING_PIECE and detects ALLOWS_MATE / ALLOWS_FORK / MISSED_* tactics", () => {
    // 1a. Refutation-first hanging piece: G09 12... Nxd4 hangs BOTH Bb4 and Nd4 (SEE=3),
    // and refutation 13. Rxd4 captures d4 -> must report Knight on d4 (not Bishop on b4).
    const g09Before = "r1bq1rk1/pp3p2/2n1pn1p/1Q1p2p1/1b1P4/2NR2B1/PPP1BPPP/4K1NR b K - 1 12";
    const g09After = "r1bq1rk1/pp3p2/4pn1p/1Q1p2p1/1b1n4/2NR2B1/PPP1BPPP/4K1NR w K - 0 13";
    const g09Ref = extractTacticalContext(g09Before, g09After, "Nxd4", 12, {
      refutationPvSan: ["Rxd4", "Bxc3+"],
      bestMoveSan: "Be7",
      badge: "Blunder",
    });
    expect(g09Ref.tags).toContain("HANGING_PIECE");
    expect(g09Ref.hangingPieceDetails?.square).toBe("d4");
    expect(g09Ref.hangingPieceDetails?.piece).toBe("Knight");

    // Non-capture refutation falls back cleanly to highest-value hanging piece (Bishop on b4 or Knight on d4)
    const g09NonCap = extractTacticalContext(g09Before, g09After, "Nxd4", 12, {
      refutationPvSan: ["Bf4"],
      bestMoveSan: "Be7",
      badge: "Blunder",
    });
    expect(g09NonCap.tags).toContain("HANGING_PIECE");
    expect(g09NonCap.hangingPieceDetails?.value).toBe(3);

    // 1b. G10 7. Nc3 hangs both c5 and g2 pawns; refutation 7... Bxg2 captures g2 -> Pawn on g2
    const g10Before = "rn1qkbnr/p2pppp1/1p6/2P3Bp/B3b3/8/PPP2PPP/RN1QK1NR w KQkq - 0 7";
    const g10After = "rn1qkbnr/p2pppp1/1p6/2P3Bp/B3b3/2N5/PPP2PPP/R2QK1NR b KQkq - 1 7";
    const g10Ref = extractTacticalContext(g10Before, g10After, "Nc3", 7, {
      refutationPvSan: ["Bxg2", "Qg4"],
      bestMoveSan: "Be3",
      badge: "Blunder",
    });
    expect(g10Ref.hangingPieceDetails?.square).toBe("g2");
    expect(g10Ref.hangingPieceDetails?.piece).toBe("Pawn");

    // 1c. En passant refutation capture: d5 captured via exd6 e.p. (d6 completely undefended)
    const epBefore = "rnb1k1nr/pp1p1ppp/8/4P3/8/8/PPPP1PPP/RNBQKB1R b KQkq - 0 4";
    const epAfter = "rnb1k1nr/pp3ppp/8/3pP3/8/8/PPPP1PPP/RNBQKB1R w KQkq d6 0 5";
    const epCtx = extractTacticalContext(epBefore, epAfter, "d5", 4, {
      refutationPvSan: ["exd6"],
      bestMoveSan: "e6",
      badge: "Inaccuracy",
    });
    expect(epCtx.tags).toContain("HANGING_PIECE");
    expect(epCtx.hangingPieceDetails?.square).toBe("d5");
    expect(epCtx.hangingPieceDetails?.piece).toBe("Pawn");

    // 2. ALLOWS_FORK: G10 10... e6 allows 11. Nc7+ forking King on e8 and Rook on a8
    const g10ForkBefore = "r2qkbnr/p2pppp1/1p6/1BnN3p/5B2/8/PPP2PbP/R2QK1NR b KQkq - 1 10";
    const g10ForkAfter = "r2qkbnr/p2p1pp1/1p2p3/1BnN3p/5B2/8/PPP2PbP/R2QK1NR w KQkq - 0 11";
    const g10Fork = extractTacticalContext(g10ForkBefore, g10ForkAfter, "e6", 10, {
      refutationPvSan: ["Nc7+", "Qxc7"],
      bestMoveSan: "Na6",
      badge: "Blunder",
    });
    expect(g10Fork.tags).toContain("ALLOWS_FORK");
    expect(g10Fork.allowedThreat?.kind).toBe("FORK");
    expect(g10Fork.allowedThreat?.refutationMoveSan).toBe("Nc7+");
    expect(g10Fork.allowedThreat?.targetSquares).toEqual(expect.arrayContaining(["e8", "a8"]));

    // 3. ALLOWS_MATE: G06 30. a4 allows 30... Re1#
    const mateBefore = "4r1k1/5ppp/8/8/8/8/P4PPP/6K1 w - - 0 30";
    const mateAfter = "4r1k1/5ppp/8/8/P7/8/5PPP/6K1 b - - 0 30";
    const allowsMate = extractTacticalContext(mateBefore, mateAfter, "a4", 30, {
      refutationPvSan: ["Re1#"],
      bestMoveSan: "Kf1",
      badge: "Blunder",
    });
    expect(allowsMate.tags).toContain("ALLOWS_MATE");
    expect(allowsMate.allowedThreat?.kind).toBe("CHECKMATE");
    expect(allowsMate.allowedThreat?.refutationMoveSan).toBe("Re1#");

    // 4. MISSED_FORK: G03 8. a3 missed 8. Qa4+ forking King on e8 and Bishop on b4
    const missForkBefore = "r1bqk1nr/ppp2ppp/3p4/4p3/1b2P3/3P1N2/P3KPPP/RNBQ1B1R w kq - 0 8";
    const missForkAfter = "r1bqk1nr/ppp2ppp/3p4/4p3/1b2P3/P2P1N2/4KPPP/RNBQ1B1R b kq - 0 8";
    const missFork = extractTacticalContext(missForkBefore, missForkAfter, "a3", 8, {
      bestMoveSan: "Qa4+",
      refutationPvSan: ["Nc6", "Qxb4"],
      badge: "Blunder",
    });
    expect(missFork.tags).toContain("MISSED_FORK");
    expect(missFork.missedTactic?.kind).toBe("FORK");
    expect(missFork.missedTactic?.missedMoveSan).toBe("Qa4+");
    expect(missFork.missedTactic?.targetSquares).toEqual(expect.arrayContaining(["e8", "b4"]));

    // 5. MISSED_MATE: G08 59. Qb6 stalemate/blunder missing 59. Qa1#
    const missMateBefore = "k7/2K5/8/8/8/8/8/1Q6 w - - 0 59";
    const missMateAfter = "k7/2K5/1Q6/8/8/8/8/8 b - - 1 59";
    const missMate = extractTacticalContext(missMateBefore, missMateAfter, "Qb6", 59, {
      bestMoveSan: "Qa1#",
      badge: "Blunder",
    });
    expect(missMate.tags).toContain("MISSED_MATE");
    expect(missMate.missedTactic?.kind).toBe("CHECKMATE");
    expect(missMate.missedTactic?.missedMoveSan).toBe("Qa1#");

    // 6. MISSED_CAPTURE: G03 31. Rb6 missing 31. Rxa8 (free Rook with King on h7), and G11 9... O-O missing 9... Qxd4
    const missCapBefore = "r7/5ppk/R6p/8/8/8/5PPP/6K1 w - - 0 31";
    const missCapAfter = "r7/5ppk/1R5p/8/8/8/5PPP/6K1 b - - 1 31";
    const missCap = extractTacticalContext(missCapBefore, missCapAfter, "Rb6", 31, {
      bestMoveSan: "Rxa8",
      badge: "Blunder",
    });
    expect(missCap.tags).toContain("MISSED_CAPTURE");
    expect(missCap.missedTactic?.kind).toBe("FREE_CAPTURE");
    expect(missCap.missedTactic?.missedMoveSan).toBe("Rxa8");

    const g11Before = "rnbqk2r/pp3ppp/1bp2n2/4N3/1PBPp3/P1N5/2P2PPP/R1BQK2R b KQkq - 1 9";
    const g11After = "rnbq1rk1/pp3ppp/1bp2n2/4N3/1PBPp3/P1N5/2P2PPP/R1BQK2R w KQ - 2 10";
    const g11Miss = extractTacticalContext(g11Before, g11After, "O-O", 9, {
      bestMoveSan: "Qxd4",
      badge: "Blunder",
    });
    expect(g11Miss.missedTactic).toBeDefined();
    expect(g11Miss.tags.some((t) => t === "MISSED_CAPTURE" || t === "MISSED_FORK")).toBe(true);

    // 7. Guards: Equal trade (SEE === 0) or non-error "Best" badge must NOT emit ALLOWS_* or MISSED_*
    const eqTradeBefore = "3rk3/8/8/8/3r4/8/8/3R2K1 w - - 0 25";
    const eqTradeAfter = "3rk3/8/8/8/3r4/8/8/3R3K b - - 1 25";
    const eqTrade = extractTacticalContext(eqTradeBefore, eqTradeAfter, "Kh1", 25, {
      bestMoveSan: "Rxd4",
      badge: "Inaccuracy",
    });
    expect(eqTrade.tags).not.toContain("MISSED_CAPTURE");

    const bestGuard = extractTacticalContext(missForkBefore, missForkAfter, "a3", 8, {
      bestMoveSan: "Qa4+",
      refutationPvSan: ["Re1#"],
      badge: "Best",
    });
    expect(bestGuard.tags).not.toContain("MISSED_FORK");
    expect(bestGuard.tags).not.toContain("ALLOWS_MATE");
  });

  it("suppresses false TACTICAL_FORK, ALLOWS_FORK, and MISSED_FORK when a higher-value attacker targets two defended lesser pieces, while still detecting undefended forks", () => {
    const defendedTargetsFen = "4k3/p7/1n6/6p1/5n2/8/8/3QK3 w - - 0 15";
    const ctxFalseFork = playAndExtract(defendedTargetsFen, "Qd4", 15);
    expect(ctxFalseFork.tags).not.toContain("TACTICAL_FORK");
    expect(ctxFalseFork.forkTargets).toBeUndefined();

    // Remove the defending pawns: Queen double attack on two undefended Knights IS a valid fork
    const undefendedTargetsFen = "4k3/8/1n6/8/5n2/8/8/3QK3 w - - 0 15";
    const ctxTrueFork = playAndExtract(undefendedTargetsFen, "Qd4", 15);
    expect(ctxTrueFork.tags).toContain("TACTICAL_FORK");
    expect(ctxTrueFork.forkTargets).toHaveLength(2);

    // ALLOWS_FORK must also filter defended lesser Queen targets
    const allowsBefore = "4k3/p7/1n6/6p1/5n2/8/8/3QK3 b - - 0 15";
    const chessAllows = new Chess(allowsBefore);
    chessAllows.move("Kf8");
    const ctxAllows = extractTacticalContext(allowsBefore, chessAllows.fen(), "Kf8", 15, {
      refutationPvSan: ["Qd4"],
      badge: "Blunder",
    });
    expect(ctxAllows.tags).not.toContain("ALLOWS_FORK");

    // MISSED_FORK must also filter defended lesser Queen targets
    const chessMiss = new Chess(defendedTargetsFen);
    chessMiss.move("Kd2");
    const ctxMiss = extractTacticalContext(defendedTargetsFen, chessMiss.fen(), "Kd2", 15, {
      bestMoveSan: "Qd4",
      badge: "Miss",
    });
    expect(ctxMiss.tags).not.toContain("MISSED_FORK");
  });

  it("prioritizes ALLOWS_MATE over HANGING_PIECE when the refutation is a capture-mate like Qxf7#", () => {
    const beforeA6 = "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3";
    const chess = new Chess(beforeA6);
    chess.move("a6");
    const ctx = extractTacticalContext(beforeA6, chess.fen(), "a6", 3, {
      refutationPvSan: ["Qxf7#"],
      badge: "Blunder",
    });
    expect(ctx.tags).toContain("ALLOWS_MATE");
    expect(ctx.allowedThreat?.kind).toBe("CHECKMATE");
    expect(ctx.allowedThreat?.refutationMoveSan).toBe("Qxf7#");
    expect(ctx.tags).not.toContain("HANGING_PIECE");
    expect(ctx.hangingPieceDetails).toBeUndefined();
  });

  it("marks exchange wins on defended Rooks as isExchange: true vs full Rook wins as non-exchange", () => {
    const exchangeFen = "4k3/2p5/3r4/8/2N5/8/8/4K3 w - - 0 15";
    const cEx = new Chess(exchangeFen);
    cEx.move("Kf1");
    const ctxExchange = extractTacticalContext(exchangeFen, cEx.fen(), "Kf1", 15, {
      bestMoveSan: "Nxd6+",
      badge: "Miss",
    });
    expect(ctxExchange.tags).toContain("MISSED_CAPTURE");
    expect(ctxExchange.missedTactic?.kind).toBe("FREE_CAPTURE");
    expect(ctxExchange.missedTactic?.netGain).toBe(2);
    expect(ctxExchange.missedTactic?.isExchange).toBe(true);

    const fullRookFen = "4k3/8/3r4/8/2N5/8/8/4K3 w - - 0 15";
    const cFull = new Chess(fullRookFen);
    cFull.move("Kf1");
    const ctxFull = extractTacticalContext(fullRookFen, cFull.fen(), "Kf1", 15, {
      bestMoveSan: "Nxd6+",
      badge: "Miss",
    });
    expect(ctxFull.tags).toContain("MISSED_CAPTURE");
    expect(ctxFull.missedTactic?.netGain).toBe(5);
    expect(ctxFull.missedTactic?.isExchange).toBeFalsy();
  });
});
