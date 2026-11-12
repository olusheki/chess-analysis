import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  clearTablebaseCache,
  countPiecesInFen,
  isTablebaseEligible,
  parseTablebaseResponse,
  querySyzygyTablebase,
  tablebaseToWhiteEval,
} from "@/lib/engine/tablebase";

describe("Syzygy 7-man tablebase client", () => {
  beforeEach(() => {
    clearTablebaseCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("countPiecesInFen & isTablebaseEligible", () => {
    it("counts total pieces correctly and enforces <= 7 pieces with no castling rights", () => {
      const kqk = "8/8/8/8/8/6K1/4Q3/6k1 w - - 0 1";
      const sevenPieces = "8/5pk1/8/6P1/8/4R3/4PK2/4r3 w - - 0 1";
      const eightPieces = "8/5pk1/8/6P1/4p3/4R3/4PK2/4r3 w - - 0 1";
      const withCastling = "8/8/8/8/8/4K3/8/R3k2R w KQ - 0 1";

      expect(countPiecesInFen(kqk)).toBe(3);
      expect(countPiecesInFen(`  ${kqk}  `)).toBe(3);
      expect(isTablebaseEligible(`  ${kqk}  `)).toBe(true);

      const kvK = "8/8/8/8/8/8/4K3/4k3 b - - 0 1";
      expect(countPiecesInFen(kvK)).toBe(2);
      expect(isTablebaseEligible(kvK)).toBe(true);

      const singleKing = "8/8/8/8/8/8/8/4k3 w - - 0 1";
      expect(countPiecesInFen(singleKing)).toBe(1);
      expect(isTablebaseEligible(singleKing)).toBe(false);

      expect(countPiecesInFen(sevenPieces)).toBe(7);
      expect(isTablebaseEligible(sevenPieces)).toBe(true);

      expect(countPiecesInFen(eightPieces)).toBe(8);
      expect(isTablebaseEligible(eightPieces)).toBe(false);

      expect(countPiecesInFen(withCastling)).toBe(4);
      expect(isTablebaseEligible(withCastling)).toBe(false);

      // Edge-case syntax/turn/digit validation
      expect(countPiecesInFen("8/8/8/8 w - - 0 1")).toBe(64);
      expect(countPiecesInFen("8/8/8/8/8/8/4K0/4k3 w - - 0 1")).toBe(64);
      expect(countPiecesInFen("8/8/8/8/8/8/4K9/4k3 w - - 0 1")).toBe(64);
      expect(countPiecesInFen("8/8/8/8/8/8/8 w - -")).toBe(64);
      expect(isTablebaseEligible("8/8/8/8/8/8/4K3/4k3")).toBe(false);
      expect(isTablebaseEligible("8/8/8/8/8/8/4K3/4k3 x - - 0 1")).toBe(false);

      expect(countPiecesInFen("not-a-fen")).toBe(64);
      expect(isTablebaseEligible("not-a-fen")).toBe(false);
    });
  });

  describe("querySyzygyTablebase & perspective formatting", () => {
    it("translates White-to-move winning position and inverts opponent move outcomes", async () => {
      const fen = "8/8/8/8/8/6K1/4Q3/6k1 w - - 0 1";
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          category: "win",
          dtz: 1,
          dtm: 1,
          checkmate: false,
          stalemate: false,
          insufficient_material: false,
          moves: [
            {
              uci: "e2d1",
              san: "Qd1#",
              zeroing: false,
              checkmate: true,
              stalemate: false,
              dtz: -1,
              dtm: -1,
              category: "loss",
            },
            {
              uci: "e2f3",
              san: "Qf3",
              zeroing: false,
              checkmate: false,
              stalemate: true,
              dtz: 0,
              dtm: 0,
              category: "draw",
            },
          ],
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const res = await querySyzygyTablebase(fen);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        `https://tablebase.lichess.ovh/standard?fen=${encodeURIComponent(fen)}`,
        expect.objectContaining({
          headers: { Accept: "application/json" },
          signal: expect.any(AbortSignal),
        })
      );
      expect(res).not.toBeNull();
      expect(res!.turn).toBe("w");
      expect(res!.pieceCount).toBe(3);
      expect(res!.whiteVerdict).toBe("White Wins");
      expect(res!.bestMoveSan).toBe("Qd1#");
      expect(res!.bestMoveUci).toBe("e2d1");
      expect(res!.moves[0].outcomeForMover).toBe("win");
      expect(res!.moves[1].outcomeForMover).toBe("draw");
      expect(res!.headline).toContain("White Wins");
      expect(res!.headline).toContain("DTM 1 · DTZ 1");

      // Second query hits cache cleanly
      const cached = await querySyzygyTablebase(fen);
      expect(cached).toEqual(res);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Clearing cache forces a fresh fetch even for leading/trailing whitespace FEN
      clearTablebaseCache();
      await querySyzygyTablebase(`  ${fen}  `);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("translates Black-to-move category correctly to White-perspective verdict", async () => {
      const fen = "8/8/8/8/8/6k1/4q3/6K1 b - - 0 1";
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          category: "win",
          dtz: 3,
          dtm: 5,
          checkmate: false,
          stalemate: false,
          insufficient_material: false,
          moves: [
            {
              uci: "e2g4",
              san: "Qg4",
              zeroing: false,
              checkmate: false,
              stalemate: false,
              dtz: -4,
              dtm: -4,
              category: "loss",
            },
          ],
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const res = await querySyzygyTablebase(fen);
      expect(res).not.toBeNull();
      expect(res!.whiteVerdict).toBe("Black Wins");
      expect(res!.moves[0].outcomeForMover).toBe("win");
      const evalConv = tablebaseToWhiteEval(res!);
      expect(evalConv.whiteMate).toBe(-3);
      expect(evalConv.whiteCp).toBe(-10000);
    });

    it("handles draw, cursed-win, blessed-loss, and non-eligible FENs safely without throwing", async () => {
      const over7 = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          category: "cursed-win",
          dtz: 112,
          dtm: 130,
          checkmate: false,
          stalemate: false,
          insufficient_material: false,
          moves: [
            {
              uci: "a1b1",
              san: "Rb1",
              zeroing: false,
              checkmate: false,
              stalemate: false,
              dtz: -111,
              dtm: -129,
              category: "blessed-loss",
            },
          ],
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const skipped = await querySyzygyTablebase(over7);
      expect(skipped).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();

      const cursedFen = "8/8/8/8/8/1k6/8/R1K4R w - - 0 1";
      const cursed = await querySyzygyTablebase(cursedFen);
      expect(cursed!.whiteVerdict).toBe("Cursed Win");
      expect(cursed!.moves[0].outcomeForMover).toBe("cursed-win");
      expect(tablebaseToWhiteEval(cursed!).whiteCp).toBe(0);
    });

    it("returns null gracefully on network errors, non-ok HTTP responses, timeouts, and external aborts", async () => {
      const fen1 = "8/8/8/8/8/6K1/8/6k1 w - - 0 1";
      const fen2 = "8/8/8/8/8/5K2/8/6k1 w - - 0 1";
      const fen3 = "8/8/8/8/8/4K3/8/6k1 w - - 0 1";
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce({
            ok: false,
            status: 429,
            json: async () => ({ category: "win" }),
          })
          .mockRejectedValueOnce(new Error("Network down"))
          .mockImplementationOnce(
            (_url: string, init?: { signal?: AbortSignal }) =>
              new Promise((_resolve, reject) => {
                init?.signal?.addEventListener("abort", () =>
                  reject(new DOMException("Aborted", "AbortError"))
                );
              })
          )
      );

      expect(await querySyzygyTablebase(fen1)).toBeNull();
      expect(await querySyzygyTablebase(fen2)).toBeNull();

      const externalAbort = new AbortController();
      const abortPromise = querySyzygyTablebase(fen3, {
        signal: externalAbort.signal,
        timeoutMs: 5000,
      });
      externalAbort.abort();
      expect(await abortPromise).toBeNull();

      // Already-aborted external signal short-circuits without calling fetch
      const preAbortedFetch = vi.fn();
      vi.stubGlobal("fetch", preAbortedFetch);
      const alreadyAborted = new AbortController();
      alreadyAborted.abort();
      expect(
        await querySyzygyTablebase("8/8/8/8/8/2K5/8/6k1 w - - 0 1", {
          signal: alreadyAborted.signal,
        })
      ).toBeNull();
      expect(preAbortedFetch).not.toHaveBeenCalled();
    });

    it("aborts cleanly when timeoutMs expires before fetch resolves", async () => {
      vi.useFakeTimers();
      try {
        const fen = "8/8/8/8/8/3K4/8/6k1 w - - 0 1";
        let capturedSignal: AbortSignal | undefined;
        vi.stubGlobal(
          "fetch",
          vi.fn().mockImplementation(
            (_url: string, init?: { signal?: AbortSignal }) =>
              new Promise((_resolve, reject) => {
                capturedSignal = init?.signal;
                init?.signal?.addEventListener("abort", () =>
                  reject(new DOMException("Timed out", "AbortError"))
                );
              })
          )
        );

        const promise = querySyzygyTablebase(fen, { timeoutMs: 250 });
        await vi.advanceTimersByTimeAsync(260);
        expect(capturedSignal?.aborted).toBe(true);
        expect(await promise).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it("covers loss, draw, blessed-loss, unknown, checkmate, stalemate, DTZ-only headlines, and malformed move entries", () => {
      const whiteFen = "8/8/8/8/8/6K1/4R3/6k1 w - - 0 1";
      const blackFen = "8/8/8/8/8/6k1/4r3/6K1 b - - 0 1";

      // White losing with only DTZ (dtm null) -> Black Wins (-2500cp, no DTM in headline)
      const whiteLoss = parseTablebaseResponse(`  ${whiteFen}  `, {
        category: "loss",
        dtz: -14,
        dtm: null,
        moves: [
          { uci: 123, san: "a3" },
          { uci: "e2e1", san: null },
          { uci: "e2f2", san: "Rf2", category: "win" },
          { uci: "e2e3", san: "Re3", category: "blessed-loss" },
          { uci: "e2e4", san: "Re4", category: "weird-cat" },
        ],
      });
      expect(whiteLoss.whiteVerdict).toBe("Black Wins");
      expect(whiteLoss.headline).toBe("Syzygy 7-Man: Black Wins (DTZ 14)");
      expect(whiteLoss.moves).toHaveLength(3);
      expect(whiteLoss.moves[0].outcomeForMover).toBe("loss");
      expect(whiteLoss.moves[1].outcomeForMover).toBe("cursed-win");
      expect(whiteLoss.moves[2].outcomeForMover).toBe("unknown");
      expect(tablebaseToWhiteEval(whiteLoss)).toEqual({ whiteCp: -2500 });

      // Black losing with dtm = NaN -> White Wins (+2500cp, empty distance suffix when dtz=0 & dtm invalid)
      const blackLoss = parseTablebaseResponse(blackFen, {
        category: "loss",
        dtz: 0,
        dtm: Number.NaN,
        moves: [],
      });
      expect(blackLoss.turn).toBe("b");
      expect(blackLoss.whiteVerdict).toBe("White Wins");
      expect(blackLoss.headline).toBe("Syzygy 7-Man: White Wins");
      expect(blackLoss.bestMoveSan).toBeUndefined();
      expect(blackLoss.bestMoveUci).toBeUndefined();
      expect(tablebaseToWhiteEval(blackLoss)).toEqual({ whiteCp: 2500 });

      // Draw & Blessed Loss & Unknown
      const drawRes = parseTablebaseResponse(whiteFen, { category: "draw", dtz: 0, dtm: 0 });
      expect(drawRes.whiteVerdict).toBe("Draw");
      expect(tablebaseToWhiteEval(drawRes)).toEqual({ whiteCp: 0 });

      const blessedRes = parseTablebaseResponse(blackFen, { category: "blessed-loss" });
      expect(blessedRes.whiteVerdict).toBe("Blessed Loss");

      const unknownRes = parseTablebaseResponse(whiteFen, { category: 42 });
      expect(unknownRes.category).toBe("unknown");
      expect(unknownRes.whiteVerdict).toBe("Unknown");

      // Checkmate White-to-move (Black delivered mate) -> -10000, whiteMate: -1
      const whiteMated = parseTablebaseResponse(whiteFen, {
        category: "loss",
        checkmate: true,
        moves: [],
      });
      expect(whiteMated.headline).toBe("Syzygy 7-Man: Checkmate (Black Wins)");
      expect(tablebaseToWhiteEval(whiteMated)).toEqual({ whiteCp: -10000, whiteMate: -1 });

      // Checkmate Black-to-move (White delivered mate) -> +10000, whiteMate: 1
      const blackMated = parseTablebaseResponse(blackFen, {
        category: "loss",
        checkmate: true,
        moves: [],
      });
      expect(tablebaseToWhiteEval(blackMated)).toEqual({ whiteCp: 10000, whiteMate: 1 });

      // Stalemate & insufficient material -> 0 cp + stalemate headline
      const stale = parseTablebaseResponse(whiteFen, { category: "draw", stalemate: true });
      expect(stale.headline).toBe("Syzygy 7-Man: Stalemate (Draw)");
      expect(tablebaseToWhiteEval(stale)).toEqual({ whiteCp: 0 });

      const insuff = parseTablebaseResponse(whiteFen, {
        category: "draw",
        insufficient_material: true,
      });
      expect(tablebaseToWhiteEval(insuff)).toEqual({ whiteCp: 0 });
    });
  });
});
