import { describe, it, expect } from "vitest";
import {
  sanToPlainEnglish,
  formatNotationPair,
  formatCoachProse,
} from "@/lib/chess/plain-notation";

describe("plain-notation converter & coach prose substitution", () => {
  describe("sanToPlainEnglish", () => {
    it("translates common piece moves, captures, checks, and checkmates into plain English", () => {
      expect(sanToPlainEnglish("Nxb4")).toBe("knight takes b4");
      expect(sanToPlainEnglish("g8+")).toBe("pawn g8 check");
      expect(sanToPlainEnglish("e4")).toBe("pawn e4");
      expect(sanToPlainEnglish("Nf3")).toBe("knight f3");
      expect(sanToPlainEnglish("Bb5+")).toBe("bishop b5 check");
      expect(sanToPlainEnglish("Qh5#")).toBe("queen h5 checkmate");
      expect(sanToPlainEnglish("Kf1")).toBe("king f1");
      expect(sanToPlainEnglish("Rxd4!!")).toBe("rook takes d4");
      expect(sanToPlainEnglish("Qxf7+?!")).toBe("queen takes f7 check");
    });

    it("translates castling, pawn captures, en passant, promotions, and disambiguated moves", () => {
      expect(sanToPlainEnglish("O-O")).toBe("castles kingside");
      expect(sanToPlainEnglish("O-O-O")).toBe("castles queenside");
      expect(sanToPlainEnglish("O-O+")).toBe("castles kingside check");
      expect(sanToPlainEnglish("O-O-O#")).toBe("castles queenside checkmate");
      expect(sanToPlainEnglish("0-0")).toBe("castles kingside");
      expect(sanToPlainEnglish("exd5")).toBe("e-pawn takes d5");
      expect(sanToPlainEnglish("cxb4+")).toBe("c-pawn takes b4 check");
      expect(sanToPlainEnglish("exd6 e.p.")).toBe("e-pawn takes d6 en passant");
      expect(sanToPlainEnglish("e8=Q")).toBe("pawn e8 promotes to queen");
      expect(sanToPlainEnglish("axb8=N#")).toBe("a-pawn takes b8 promotes to knight checkmate");
      expect(sanToPlainEnglish("d1=R+")).toBe("pawn d1 promotes to rook check");
      expect(sanToPlainEnglish("Nbd7")).toBe("b-file knight to d7");
      expect(sanToPlainEnglish("R1xe4+")).toBe("rank-1 rook takes e4 check");
      expect(sanToPlainEnglish("Qh4xe1")).toBe("queen from h4 takes e1");
    });

    it("handles coordinate/long algebraic notations cleanly", () => {
      expect(sanToPlainEnglish("e2e4")).toBe("e2 to e4");
      expect(sanToPlainEnglish("e2-e4")).toBe("e2 to e4");
      expect(sanToPlainEnglish("e7e8q")).toBe("e7 to e8 promotes to queen");
      expect(sanToPlainEnglish("Nb1-c3")).toBe("knight from b1 to c3");
      expect(sanToPlainEnglish("Ng1xf3+")).toBe("knight from g1 takes f3 check");
    });
  });

  describe("formatNotationPair", () => {
    it("puts plain English before simple SAN when enabled, or raw SAN when disabled", () => {
      expect(formatNotationPair("Nxb4", true)).toBe("knight takes b4 (Nxb4)");
      expect(formatNotationPair("g8+", true)).toBe("pawn g8 check (g8+)");
      expect(formatNotationPair("Nxb4", false)).toBe("Nxb4");
    });
  });

  describe("formatCoachProse", () => {
    it("converts moves and multi-move lines in coach explanations while keeping square locations untouched", () => {
      const blunderProse =
        "c5 left your Queen vulnerable on e3. Chalata01 can strike right away with Bxe3 Bxc3+ bxc3, shifting the eval to +6.4.";
      expect(formatCoachProse(blunderProse)).toBe(
        "Pawn c5 left your Queen vulnerable on e3. Chalata01 can strike right away with bishop takes e3, bishop takes c3 check, b-pawn takes c3, shifting the eval to +6.4."
      );

      const missProse =
        "JoelDirt95 had just slipped, but a3 let them off the hook (+4.9 to +1.6). Better was Qa4+ Bd7 Qxb4.";
      expect(formatCoachProse(missProse)).toBe(
        "JoelDirt95 had just slipped, but pawn a3 let them off the hook (+4.9 to +1.6). Better was queen a4 check, bishop d7, queen takes b4."
      );

      const moveNumProse = "White had 24. Rxd4!! or 5... c5, after 2.Nf3 e6, forcing O-O-O+.";
      expect(formatCoachProse(moveNumProse)).toBe(
        "White had 24. rook takes d4 or 5... pawn c5, after 2. knight f3, pawn e6, forcing castles queenside check."
      );
    });

    it("preserves square names after prepositions, compound square lists, and non-move tokens", () => {
      expect(formatCoachProse("You left your Knight on d7 hanging!")).toBe(
        "You left your Knight on d7 hanging!"
      );
      expect(formatCoachProse("Your Knight forks targets on c7 and f6 from d5.")).toBe(
        "Your Knight forks targets on c7 and f6 from d5."
      );
      expect(formatCoachProse("White scored 87.6% CAPS2 in PV1 (+M3) against user_b4.")).toBe(
        "White scored 87.6% CAPS2 in PV1 (mate in 3) against user_b4."
      );
    });
  });
});
