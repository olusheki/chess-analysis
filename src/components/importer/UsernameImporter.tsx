"use client";

import React, { useEffect, useRef, useState } from "react";
import { Search, User, Loader2 } from "lucide-react";
import {
  fetchChessComPlayerAndGames,
  type ChessComPlayerProfile,
  type FormattedGameListItem,
} from "@/lib/api/chesscom-api";
import { GameSelectionList } from "./GameSelectionList";

interface UsernameImporterProps {
  onSelectGame: (pgn: string, meta?: { userColor?: "white" | "black" }) => void;
  staticExport?: boolean;
}

export function UsernameImporter({
  onSelectGame,
  staticExport = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true",
}: UsernameImporterProps) {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ChessComPlayerProfile | null>(null);
  const [games, setGames] = useState<FormattedGameListItem[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleFetch = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = username.trim();
    if (!cleaned) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      let loadedProfile: ChessComPlayerProfile | null = null;
      let loadedGames: FormattedGameListItem[] = [];

      if (staticExport) {
        const direct = await fetchChessComPlayerAndGames(cleaned, 15, controller.signal);
        if (controller.signal.aborted) return;
        loadedProfile = direct.profile;
        loadedGames = direct.games;
      } else {
        const res = await fetch(
          `/api/chesscom?username=${encodeURIComponent(cleaned)}&limit=15`,
          { signal: controller.signal }
        );
        if (controller.signal.aborted) return;
        const data = await res.json();
        if (controller.signal.aborted) return;
        if (!res.ok) {
          setError(data.error || "Could not load games for that player.");
          setProfile(null);
          setGames([]);
          return;
        }
        loadedProfile = data.profile ?? null;
        loadedGames = data.games ?? [];
      }

      setProfile(loadedProfile);
      setGames(loadedGames);
      if (loadedGames.length === 0) {
        setError(`No recent standard chess games found for "${cleaned}".`);
      }
    } catch (err) {
      if (
        (err instanceof DOMException && err.name === "AbortError") ||
        controller.signal.aborted
      ) {
        return;
      }
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Network error while connecting to Chess.com API."
      );
      if (staticExport) {
        setProfile(null);
        setGames([]);
      }
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  };

  return (
    <div className="space-y-3">
      <form onSubmit={handleFetch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9e9c98]" />
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Chess.com username (e.g. hikaru)"
            aria-label="Chess.com username"
            className="w-full rounded border border-[#3d3b38] bg-[#21201d] py-2 pl-8 pr-3 text-sm text-white placeholder-[#9e9c98] focus:border-[#96bc4b] focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !username.trim()}
          className="inline-flex items-center gap-1.5 rounded bg-[#96bc4b] px-3.5 py-2 text-sm font-bold text-[#1a1917] transition hover:bg-[#a6cc59] disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Fetch"}
        </button>
      </form>

      {error && (
        <div className="rounded border border-[#fa412d]/40 bg-[#fa412d]/10 px-3 py-2 text-xs text-[#ff8e80]">
          {error}
        </div>
      )}

      {profile && (
        <div className="flex items-center gap-3 rounded border border-[#3d3b38] bg-[#21201d] p-2.5">
          {profile.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar}
              alt={profile.username}
              className="h-9 w-9 rounded object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded bg-[#312e2b]">
              <User className="h-5 w-5 text-[#9e9c98]" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {profile.title && (
                <span className="rounded bg-[#a83226] px-1 py-0.5 text-[10px] font-bold text-white">
                  {profile.title}
                </span>
              )}
              <span className="truncate text-sm font-bold text-white">{profile.username}</span>
            </div>
            <div className="text-[11px] text-[#9e9c98]">
              {games.length} recent standard games loaded
            </div>
          </div>
        </div>
      )}

      {games.length > 0 && (
        <GameSelectionList games={games} onSelectGame={onSelectGame} />
      )}
    </div>
  );
}
