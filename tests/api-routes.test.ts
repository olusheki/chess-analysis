import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getOpenings, POST as postOpenings } from "@/app/api/openings/route";
import { POST as postExplain } from "@/app/api/explain/route";
import { GET as getChessCom } from "@/app/api/chesscom/route";

describe("Next.js API route handlers", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("/api/openings", () => {
    it("looks up opening by FEN and returns insight", async () => {
      const fen = encodeURIComponent(
        "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
      );
      const req = new NextRequest(`http://localhost:3000/api/openings?fen=${fen}`);
      const res = await getOpenings(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.opening.eco).toBe("B00");
      expect(data.insight.length).toBeGreaterThan(10);
    });

    it("searches openings by query string", async () => {
      const req = new NextRequest("http://localhost:3000/api/openings?q=Sicilian&limit=5");
      const res = await getOpenings(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.results.length).toBeGreaterThan(0);
    });

    it("classifies a SAN move sequence via POST", async () => {
      const req = new NextRequest("http://localhost:3000/api/openings", {
        method: "POST",
        body: JSON.stringify({ movesSan: ["e4", "e5", "Nf3", "Nc6", "Bc4"] }),
      });
      const res = await postOpenings(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.opening.eco).toBe("C50");
      expect(data.bookPlies).toBe(5);
    });

    it("C1: returns 200 with bookPlies stopped cleanly on invalid SAN instead of misleading 400 Invalid JSON", async () => {
      const req = new NextRequest("http://localhost:3000/api/openings", {
        method: "POST",
        body: JSON.stringify({ movesSan: ["e4", "Qxh8"] }),
      });
      const res = await postOpenings(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.bookPlies).toBe(1);
      expect(data.plyIsBook).toEqual([true, false]);
    });
  });

  describe("/api/explain", () => {
    it("returns 400 for invalid payload or malformed tacticalContext/badge", async () => {
      const req1 = new NextRequest("http://localhost:3000/api/explain", {
        method: "POST",
        body: JSON.stringify({ mode: "move" }),
      });
      expect((await postExplain(req1)).status).toBe(400);

      const req2 = new NextRequest("http://localhost:3000/api/explain", {
        method: "POST",
        body: JSON.stringify({
          mode: "move",
          payload: {
            moveSan: "e4",
            badge: "NotABadge",
            playedBy: "White",
            deltaWP: "bad",
            tacticalContext: {},
          },
        }),
      });
      expect((await postExplain(req2)).status).toBe(400);
    });

    it("M3: returns grounded game storyline for mode=storyline", async () => {
      const req = new NextRequest("http://localhost:3000/api/explain", {
        method: "POST",
        body: JSON.stringify({
          mode: "storyline",
          payload: {
            whiteName: "Morphy",
            blackName: "Duke",
            result: "1-0",
            openingName: "Philidor Defense",
            whiteAccuracy: 95.1,
            blackAccuracy: 71.2,
            whiteElo: 2600,
            blackElo: 1700,
            phaseAccuracies: {
              opening: { white: 98, black: 85 },
              middlegame: { white: 94, black: 65 },
              endgame: { white: 100, black: 100 },
            },
            keyMomentCount: 3,
          },
        }),
      });
      const res = await postExplain(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.headline).toBeTruthy();
      expect(data.summary).toContain("Philidor Defense");
    });

    it("returns grounded move explanation in offline mode", async () => {
      const req = new NextRequest("http://localhost:3000/api/explain", {
        method: "POST",
        body: JSON.stringify({
          mode: "move",
          payload: {
            moveSan: "Qe7",
            playedBy: "Black",
            moveNumber: 14,
            badge: "Blunder",
            evalBefore: "+0.4",
            evalAfter: "+3.8",
            deltaWP: 34.2,
            engineBestMove: "Nd7",
            bestMovePV: ["Nd7", "d4"],
            tacticalContext: {
              tags: ["HANGING_PIECE"],
              hangingPieceDetails: { square: "d7", piece: "Knight", value: 3 },
              isCheck: false,
              isCastle: false,
              gamePhase: "Middlegame",
            },
          },
        }),
      });
      const res = await postExplain(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.badge).toBe("Blunder");
      expect(data.shortComment).toContain("d7");
      expect(data.coachMode).toBe("offline");

      // Invalid coachFor returns 400
      const invalidCoachReq = new NextRequest("http://localhost:3000/api/explain", {
        method: "POST",
        body: JSON.stringify({
          mode: "move",
          payload: {
            moveSan: "e4",
            playedBy: "White",
            coachFor: "Green",
            badge: "Best",
            deltaWP: 0,
            tacticalContext: { tags: [], isCheck: false, isCastle: false, gamePhase: "Opening" },
          },
        }),
      });
      expect((await postExplain(invalidCoachReq)).status).toBe(400);

      // Optional whitespace x-gemini-api-key header gracefully falls back to offline coach without exposing header
      const blankKeyReq = new NextRequest("http://localhost:3000/api/explain", {
        method: "POST",
        headers: { "x-gemini-api-key": "   " },
        body: JSON.stringify({
          mode: "move",
          payload: {
            moveSan: "Nf3",
            playedBy: "White",
            moveNumber: 2,
            badge: "Good",
            deltaWP: 1.5,
            engineBestMove: "d4",
            bestMovePV: ["d4"],
            tacticalContext: {
              tags: ["DEVELOPMENT"],
              isCheck: false,
              isCastle: false,
              gamePhase: "Opening",
            },
          },
        }),
      });
      const blankKeyRes = await postExplain(blankKeyReq);
      expect(blankKeyRes.status).toBe(200);
      const blankKeyData = await blankKeyRes.json();
      expect(blankKeyData.coachMode).toBe("offline");
    });

    it("omits eval strings cleanly when optional evalBefore/evalAfter/engineBestMove/moveNumber are absent and rejects malformed types", async () => {
      const noEvalsReq = new NextRequest("http://localhost:3000/api/explain", {
        method: "POST",
        body: JSON.stringify({
          mode: "move",
          payload: {
            moveSan: "Qh5",
            playedBy: "White",
            badge: "Blunder",
            deltaWP: -33.8,
            bestMovePV: ["Nf3", "Nc6"],
            tacticalContext: {
              tags: ["HANGING_PIECE"],
              isCheck: false,
              isCastle: false,
              gamePhase: "Opening",
            },
          },
        }),
      });
      const noEvalsRes = await postExplain(noEvalsReq);
      expect(noEvalsRes.status).toBe(200);
      const noEvalsData = await noEvalsRes.json();
      expect(noEvalsData.coachMode).toBe("offline");
      expect(JSON.stringify(noEvalsData)).not.toMatch(/undefined/i);
      expect(noEvalsData.detailedExplanation).toBe(
        "This move concedes decisive momentum. Your opponent now holds a decisive tactical continuation. Take a breath—spot the tactical clue here and carry that scan into next turn."
      );
      expect(noEvalsData.bestMoveReasoning).toBeUndefined();

      const partialEvalReq = new NextRequest("http://localhost:3000/api/explain", {
        method: "POST",
        body: JSON.stringify({
          mode: "move",
          payload: {
            moveSan: "Qh5",
            playedBy: "White",
            badge: "Blunder",
            evalAfter: "-4.5",
            deltaWP: -33.8,
            engineBestMove: "Nf3",
            bestMovePV: ["Nf3", "Nc6"],
            tacticalContext: { tags: [], isCheck: false, isCastle: false, gamePhase: "Opening" },
          },
        }),
      });
      const partialRes = await postExplain(partialEvalReq);
      expect(partialRes.status).toBe(200);
      const partialData = await partialRes.json();
      expect(partialData.detailedExplanation).toContain("(evaluation: -4.5)");
      expect(partialData.detailedExplanation).not.toMatch(/undefined/i);

      const badTypePayloads = [
        { moveSan: "Nf3", playedBy: "White", evalBefore: null, badge: "Good", deltaWP: 1, tacticalContext: { tags: [] } },
        { moveSan: "Nf3", playedBy: "White", evalAfter: 120, badge: "Good", deltaWP: 1, tacticalContext: { tags: [] } },
        { moveSan: "Nf3", playedBy: "White", engineBestMove: null, badge: "Good", deltaWP: 1, tacticalContext: { tags: [] } },
        { moveSan: "Nf3", playedBy: "White", moveNumber: 1.5, badge: "Good", deltaWP: 1, tacticalContext: { tags: [] } },
        { moveSan: "Nf3", playedBy: "White", moveNumber: 0, badge: "Good", deltaWP: 1, tacticalContext: { tags: [] } },
        { moveSan: "Nf3", playedBy: "White", bestMovePV: [null], badge: "Good", deltaWP: 1, tacticalContext: { tags: [] } },
        { moveSan: "Nf3", playedBy: "White", refutationPV: "Qh4#", badge: "Good", deltaWP: 1, tacticalContext: { tags: [] } },
      ];
      for (const badPayload of badTypePayloads) {
        const res = await postExplain(
          new NextRequest("http://localhost:3000/api/explain", {
            method: "POST",
            body: JSON.stringify({ mode: "move", payload: badPayload }),
          })
        );
        expect(res.status).toBe(400);
        const err = await res.json();
        expect(err.error).toBe("Missing or invalid move explanation fields.");
      }

      const incompleteStorylineReq = new NextRequest("http://localhost:3000/api/explain", {
        method: "POST",
        body: JSON.stringify({
          mode: "storyline",
          payload: {
            whiteName: "Morphy",
            blackName: "Duke",
            phaseAccuracies: { opening: { white: 98, black: 85 }, middlegame: {}, endgame: {} },
          },
        }),
      });
      expect((await postExplain(incompleteStorylineReq)).status).toBe(400);
    });
  });

  describe("/api/chesscom", () => {
    it("validates missing username with 400", async () => {
      const req = new NextRequest("http://localhost:3000/api/chesscom");
      const res = await getChessCom(req);
      expect(res.status).toBe(400);
    });

    it("returns profile and formatted recent games for a valid player", async () => {
      globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
        const u = String(url);
        if (u.endsWith("/player/hikaru")) {
          return {
            ok: true,
            json: async () => ({ username: "Hikaru", title: "GM", status: "premium", followers: 1000 }),
          } as Response;
        }
        if (u.endsWith("/games/archives")) {
          return {
            ok: true,
            json: async () => ({
              archives: ["https://api.chess.com/pub/player/hikaru/games/2026/11"],
            }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({
            games: [
              {
                url: "https://chess.com/game/1",
                pgn: "1. e4 e5 1-0",
                time_control: "180",
                end_time: 1700000000,
                rated: true,
                time_class: "blitz",
                rules: "chess",
                white: { username: "Hikaru", rating: 3250, result: "win" },
                black: { username: "Rival", rating: 3100, result: "resigned" },
              },
            ],
          }),
        } as Response;
      }) as unknown as typeof fetch;

      const req = new NextRequest("http://localhost:3000/api/chesscom?username=hikaru&limit=5");
      const res = await getChessCom(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.profile.username).toBe("Hikaru");
      expect(data.games).toHaveLength(1);
      expect(data.games[0].result).toBe("win");
    });

    it("H7: returns 404 when player/archives do not exist, 429 on rate limits, and 502 on upstream errors", async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })) as unknown as typeof fetch;

      const req404 = new NextRequest("http://localhost:3000/api/chesscom?username=no_such_player_123");
      const res404 = await getChessCom(req404);
      expect(res404.status).toBe(404);

      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      })) as unknown as typeof fetch;

      const req429 = new NextRequest("http://localhost:3000/api/chesscom?username=hikaru");
      const res429 = await getChessCom(req429);
      expect(res429.status).toBe(429);

      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 500,
        statusText: "Server Error",
      })) as unknown as typeof fetch;

      const req500 = new NextRequest("http://localhost:3000/api/chesscom?username=hikaru");
      const res500 = await getChessCom(req500);
      expect(res500.status).toBe(502);
    });
  });
});
