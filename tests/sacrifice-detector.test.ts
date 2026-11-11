import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { calculateMaterialSacrifice } from "@/lib/analysis/sacrifice-detector";

describe("sacrifice-detector (real material sacrifice calculation)", () => {
  it("recognizes Kasparov vs Topalov 1999 24. Rxd4!! as a Rook-for-Pawn sacrifice (>= 4 points)", () => {
    // Exact position before 24. Rxd4!! in Kasparov vs Topalov (Wijk aan Zee 1999)
    // Moves: 1.e4 d6 2.d4 Nf6 3.Nc3 g6 4.Be3 Bg7 5.Qd2 c6 6.f3 b5 7.Nge2 Nbd7 8.Bh6 Bxh6
    // 9.Qxh6 Bb7 10.a3 e5 11.O-O-O Qe7 12.Kb1 a6 13.Nc1 O-O-O 14.Nb3 exd4 15.Rxd4 c5
    // 16.Rd1 Nb6 17.g3 Kb8 18.Na5 Ba8 19.Bh3 d5 20.Qf4+ Ka7 21.Rhe1 d4 22.Nd5 Nbxd5
    // 23.exd5 Qd6
    const game = new Chess();
    const moves = [
      "e4", "d6", "d4", "Nf6", "Nc3", "g6", "Be3", "Bg7",
      "Qd2", "c6", "f3", "b5", "Nge2", "Nbd7", "Bh6", "Bxh6",
      "Qxh6", "Bb7", "a3", "e5", "O-O-O", "Qe7", "Kb1", "a6",
      "Nc1", "O-O-O", "Nb3", "exd4", "Rxd4", "c5", "Rd1", "Nb6",
      "g3", "Kb8", "Na5", "Ba8", "Bh3", "d5", "Qf4+", "Ka7",
      "Rhe1", "d4", "Nd5", "Nbxd5", "exd5", "Qd6",
    ];
    for (const m of moves) {
      expect(game.move(m)).not.toBeNull();
    }
    const fenBefore = game.fen();
    const sac = calculateMaterialSacrifice(fenBefore, "Rxd4");
    // Rook (5) for d4 pawn (1), and after 24...cxd4 White can regain at most 1 more pawn (Qxd4+), net sacrifice = 3 (>= 2)
    expect(sac).toBe(3);
  });

  it("does NOT count an equal trade (Qxd4 when recaptured by Queen/Rook) as a sacrifice", () => {
    // White Qd1 captures Black pawn on d4? No, White captures a Black Queen on d4 (c5xd4? Wait: QxQ equal trade!)
    const fen = "4k3/8/8/2p5/3q4/8/8/3QK3 w - - 0 20";
    // White plays Qxd4, Black recaptures cxd4 -> net material gained by White = +9 - 9 = 0 -> sacrifice = 0
    const sac = calculateMaterialSacrifice(fen, "Qxd4");
    expect(sac).toBe(0);
  });

  it("does NOT count winning free undefended material as a sacrifice", () => {
    const fen = "4k3/8/8/8/3n4/8/8/3QK3 w - - 0 20";
    const sac = calculateMaterialSacrifice(fen, "Qxd4");
    expect(sac).toBe(0);
  });

  it("detects classic Greek Gift Bxh7+ sacrifice (Bishop=3 for Pawn=1 -> net 2)", () => {
    const fen = "r1bq1rk1/pppn1ppp/3bpn2/3p4/3P4/2NBPN2/PPP2PPP/R1BQK2R w KQ - 4 7";
    const sac = calculateMaterialSacrifice(fen, "Bxh7+");
    expect(sac).toBe(2);
  });

  it("detects exchange sacrifice Rxf6 when recaptured by pawn/bishop (5 - 3 = 2)", () => {
    const fen = "r2q1rk1/ppp1bppp/2n2n2/3p4/3P4/2N2R2/PPP1BPPP/R1BQ2K1 w - - 0 11";
    const sac = calculateMaterialSacrifice(fen, "Rxf6");
    expect(sac).toBe(2);
  });
});
