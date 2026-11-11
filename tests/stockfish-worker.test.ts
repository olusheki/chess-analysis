import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createBrowserStockfishEngine } from "@/lib/engine/stockfish-worker";

class MockWorker {
  static instances: MockWorker[] = [];
  url: string;
  posted: string[] = [];
  onmessage: ((ev: MessageEvent<string>) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  terminated = false;

  constructor(url: string) {
    this.url = url;
    MockWorker.instances.push(this);
  }

  postMessage(cmd: string) {
    this.posted.push(cmd);
  }

  terminate() {
    this.terminated = true;
  }

  emit(lines: string) {
    this.onmessage?.({ data: lines } as MessageEvent<string>);
  }

  emitError() {
    this.onerror?.(new Event("error"));
  }
}

describe("stockfish-worker (browser Web Worker lifecycle & cancellation)", () => {
  const originalWorker = globalThis.Worker;
  const originalWindow = globalThis.window;

  beforeEach(() => {
    MockWorker.instances = [];
    vi.useFakeTimers();
    (globalThis as unknown as { Worker: typeof Worker }).Worker =
      MockWorker as unknown as typeof Worker;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    globalThis.Worker = originalWorker;
    (globalThis as unknown as { window: unknown }).window = originalWindow;
  });

  it("initializes worker, evaluates position, and selects multi-thread vs single-thread WASM cleanly", async () => {
    (globalThis as unknown as { window: { crossOriginIsolated: boolean } }).window = {
      crossOriginIsolated: false,
    };

    const engine = createBrowserStockfishEngine();
    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const evalPromise = engine.evaluatePosition(startFen, 12, 3);
    await Promise.resolve();

    const w = MockWorker.instances[0];
    expect(w.url).toContain("stockfish-17.1-lite-single");
    expect(w.posted).toContain("uci");

    w.emit("uciok");
    await Promise.resolve();
    await Promise.resolve();
    w.emit("readyok");
    await Promise.resolve();
    await Promise.resolve();
    w.emit("info depth 12 multipv 1 score cp 28 pv e2e4 e7e5\nbestmove e2e4");

    const res = await evalPromise;
    expect(res.bestMoveUci).toBe("e2e4");
    expect(res.whiteCp).toBe(28);
    engine.dispose();
  });

  it("H1: rejects pending search immediately with AbortError when dispose() is called", async () => {
    const engine = createBrowserStockfishEngine();
    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const pending = engine.evaluatePosition(startFen, 16, 3);
    await Promise.resolve();

    const w = MockWorker.instances[0];
    w.emit("uciok");
    await Promise.resolve();
    await Promise.resolve();
    w.emit("readyok");
    await Promise.resolve();
    await Promise.resolve();

    // Dispose mid-search (no bestmove emitted)
    engine.dispose();
    expect(w.terminated).toBe(true);

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects pending search on worker error event and sends stop on search timeout", async () => {
    const engine1 = createBrowserStockfishEngine();
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const p1 = engine1.evaluatePosition(fen, 12, 3);
    await Promise.resolve();
    const w1 = MockWorker.instances[0];
    w1.emitError();
    await expect(p1).rejects.toThrow();
    engine1.dispose();

    const engine2 = createBrowserStockfishEngine();
    const p2 = engine2.evaluatePosition(fen, 12, 3);
    await Promise.resolve();
    const w2 = MockWorker.instances[1];
    w2.emit("uciok");
    await Promise.resolve();
    await Promise.resolve();
    w2.emit("readyok");
    await Promise.resolve();
    await Promise.resolve();

    vi.advanceTimersByTime(25000);
    await expect(p2).rejects.toThrow(/timed out/i);
    expect(w2.posted).toContain("stop");
    engine2.dispose();

    // Calling evaluatePosition after dispose() rejects immediately with AbortError
    await expect(engine2.evaluatePosition(fen, 12, 3)).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("selects multi-threaded Stockfish build and configures Threads when crossOriginIsolated", async () => {
    vi.stubGlobal("window", { crossOriginIsolated: true });
    vi.stubGlobal("SharedArrayBuffer", function SharedArrayBufferMock() {});
    vi.stubGlobal("navigator", { hardwareConcurrency: 8 });

    const engine = createBrowserStockfishEngine();
    const p = engine.evaluatePosition(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      10,
      3
    );
    await Promise.resolve();
    const w = MockWorker.instances[0];
    expect(w.url).toContain("stockfish-17.1-lite-51f59da.js");
    w.emit("uciok");
    await Promise.resolve();
    await Promise.resolve();
    expect(w.posted).toContain("setoption name Threads value 4");
    w.emit("readyok");
    await Promise.resolve();
    await Promise.resolve();
    w.emit("info depth 10 multipv 1 score cp 15 pv d2d4\nbestmove d2d4");
    const res = await p;
    expect(res.bestMoveUci).toBe("d2d4");
    engine.dispose();
  });
});
