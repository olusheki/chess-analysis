import {
  ChessEngine,
  PositionEval,
  buildPositionEvalFromUciLines,
  evaluateTerminalPosition,
} from "./engine-evaluator";

/**
 * Browser Web Worker wrapper for Stockfish 17.1 WASM.
 * Automatically upgrades to multi-threaded WASM when SharedArrayBuffer & crossOriginIsolated are active,
 * falling back seamlessly to single-threaded WASM otherwise.
 */
export function createBrowserStockfishEngine(): ChessEngine {
  let worker: Worker | null = null;
  let initialized = false;
  let currentListeners: ((line: string) => void)[] = [];
  const pendingCleanups = new Set<(err: Error) => void>();
  let queue: Promise<void> = Promise.resolve();
  let disposed = false;

  function makeAbortError(msg: string): Error {
    const err = new Error(msg);
    err.name = "AbortError";
    return err;
  }

  function rejectAllPending(err: Error) {
    for (const rejectPending of [...pendingCleanups]) {
      rejectPending(err);
    }
    pendingCleanups.clear();
  }

  function canUseThreads(): boolean {
    return (
      typeof window !== "undefined" &&
      typeof SharedArrayBuffer !== "undefined" &&
      Boolean(window.crossOriginIsolated)
    );
  }

  function ensureWorker(): Worker {
    if (disposed) {
      throw makeAbortError("Stockfish worker has been disposed");
    }
    if (worker) return worker;

    const threaded = canUseThreads();
    const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
    const workerUrl = threaded
      ? `${basePath}/stockfish/stockfish-17.1-lite-51f59da.js`
      : `${basePath}/stockfish/stockfish-17.1-lite-single-03e3232.js`;

    worker = new Worker(workerUrl);
    worker.onmessage = (event: MessageEvent<string>) => {
      const raw = typeof event.data === "string" ? event.data : String(event.data);
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        for (const listener of [...currentListeners]) {
          listener(trimmed);
        }
      }
    };
    worker.onerror = () => {
      rejectAllPending(new Error("Stockfish Web Worker encountered a fatal error"));
    };
    return worker;
  }

  function post(cmd: string) {
    ensureWorker().postMessage(cmd);
  }

  function waitForLine(
    predicate: (line: string) => boolean,
    onLine?: (line: string) => void,
    timeoutMs = 20000
  ): Promise<string> {
    if (disposed) {
      return Promise.reject(makeAbortError("Stockfish worker has been disposed"));
    }

    return new Promise((resolve, reject) => {
      const rejectPending = (err: Error) => {
        cleanup();
        reject(err);
      };

      const timer = setTimeout(() => {
        if (!disposed && worker) {
          try {
            worker.postMessage("stop");
          } catch {
            // ignore
          }
        }
        cleanup();
        reject(new Error("Stockfish Web Worker timed out"));
      }, timeoutMs);

      const handler = (line: string) => {
        if (onLine) onLine(line);
        if (predicate(line)) {
          cleanup();
          resolve(line);
        }
      };

      function cleanup() {
        clearTimeout(timer);
        currentListeners = currentListeners.filter((l) => l !== handler);
        pendingCleanups.delete(rejectPending);
      }

      pendingCleanups.add(rejectPending);
      currentListeners.push(handler);
    });
  }

  async function initIfNeeded(multiPv: number) {
    if (!initialized) {
      const uciWait = waitForLine((l) => l === "uciok");
      post("uci");
      await uciWait;
      post("setoption name Hash value 32");
      if (canUseThreads() && typeof navigator !== "undefined") {
        const threads = Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2));
        post(`setoption name Threads value ${threads}`);
      }
      initialized = true;
    }
    post(`setoption name MultiPV value ${multiPv}`);
    const readyWait = waitForLine((l) => l === "readyok");
    post("isready");
    await readyWait;
  }

  return {
    evaluatePosition(fen: string, depth: number, multiPv = 3): Promise<PositionEval> {
      const terminal = evaluateTerminalPosition(fen);
      if (terminal) return Promise.resolve(terminal);

      const run = queue.then(async () => {
        if (disposed) throw makeAbortError("Engine disposed");
        await initIfNeeded(multiPv);
        const infoLines: string[] = [];
        const bestPromise = waitForLine(
          (l) => l.startsWith("bestmove "),
          (l) => {
            if (l.startsWith("info ")) infoLines.push(l);
          }
        );
        post(`position fen ${fen}`);
        post(`go depth ${depth}`);
        const bestLine = await bestPromise;
        return buildPositionEvalFromUciLines(fen, infoLines, bestLine, depth);
      });

      queue = run.then(
        () => undefined,
        () => undefined
      );

      return run;
    },

    dispose() {
      disposed = true;
      if (worker) {
        try {
          worker.postMessage("stop");
          worker.postMessage("quit");
        } catch {
          // ignore
        }
        worker.terminate();
        worker = null;
      }
      currentListeners = [];
      rejectAllPending(makeAbortError("Stockfish worker disposed"));
    },
  };
}
