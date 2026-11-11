import { describe, it, expect } from "vitest";
import {
  normalizeFenKey,
  lookupOpeningByFen,
  classifyGameOpenings,
  getOpeningInsight,
  searchOpenings,
} from "@/lib/analysis/opening-book";

describe("opening-book (ECO classifier & transposition matcher)", () => {
  it("normalizes FEN to board/turn/castling/en-passant only", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
    expect(normalizeFenKey(fen)).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3");
  });

  it("identifies Italian Game and Sicilian Najdorf directly by FEN", () => {
    const italian = classifyGameOpenings(["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"]);
    expect(italian.opening?.eco).toBe("C50");
    expect(italian.opening?.name).toContain("Italian Game");
    expect(italian.bookPlies).toBe(6);

    const najdorf = classifyGameOpenings(["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"]);
    expect(najdorf.opening?.eco).toBe("B90");
    expect(najdorf.opening?.name).toContain("Sicilian");
    expect(najdorf.opening?.name).toContain("Najdorf");
    expect(najdorf.bookPlies).toBe(10);
  });

  it("detects transpositions across different move orders (English -> QGD D30)", () => {
    const orderA = classifyGameOpenings(["d4", "Nf6", "c4", "e6", "Nf3", "d5"]);
    const orderB = classifyGameOpenings(["c4", "e6", "d4", "d5", "Nf3", "Nf6"]);
    expect(orderA.opening?.eco).toBe("D30");
    expect(orderB.opening?.eco).toBe("D30");
    expect(orderA.opening?.name).toBe(orderB.opening?.name);
  });

  it("marks moves out of book once the game leaves known ECO theory", () => {
    const result = classifyGameOpenings(["e4", "e5", "Ke2", "Nc6", "Ke1"]);
    expect(result.plyIsBook[0]).toBe(true); // 1. e4
    expect(result.plyIsBook[1]).toBe(true); // 1... e5
    // 2. Ke2 is Bongcloud (may or may not be in eco.json - let's test an unambiguously novel move like a3 h5 a4 h4)
    const novel = classifyGameOpenings(["e4", "e5", "Nf3", "Nc6", "a3", "h5", "Ra2", "Rh6"]);
    expect(novel.plyIsBook[0]).toBe(true);
    expect(novel.plyIsBook[3]).toBe(true);
    expect(novel.outOfBookPly).toBeGreaterThan(4);
    // Once out of book, subsequent plies stay out of book
    const idxOut = novel.outOfBookPly! - 1;
    for (let i = idxOut; i < novel.plyIsBook.length; i++) {
      expect(novel.plyIsBook[i]).toBe(false);
    }
  });

  it("classifies Kasparov vs Topalov 1999 opening as Pirc Defense (B07)", () => {
    const moves = ["e4", "d6", "d4", "Nf6", "Nc3", "g6", "Be3", "Bg7", "Qd2", "c6", "f3", "b5"];
    const res = classifyGameOpenings(moves);
    expect(res.opening?.eco).toBe("B07");
    expect(res.opening?.name).toContain("Pirc");
    expect(res.bookPlies).toBe(12);
  });

  it("provides pedagogical strategic insight for major openings", () => {
    const italianInsight = getOpeningInsight("C50", "Italian Game: Giuoco Piano");
    const sicilianInsight = getOpeningInsight("B90", "Sicilian Defense: Najdorf Variation");
    const genericInsight = getOpeningInsight("A00", "Uncommon Opening");
    expect(italianInsight.toLowerCase()).toContain("f7");
    expect(sicilianInsight.toLowerCase()).toContain("c-file");
    expect(genericInsight.length).toBeGreaterThan(20);
  });

  it("supports searching openings by query or ECO code", () => {
    const results = searchOpenings("Sicilian", 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.name.toLowerCase().includes("sicilian") || r.eco.startsWith("B"))).toBe(true);

    const byFen = lookupOpeningByFen("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1");
    expect(byFen?.eco).toBe("B00");
  });
});
