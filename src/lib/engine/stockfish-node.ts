import path from "node:path";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import {
  ChessEngine,
  PositionEval,
  buildPositionEvalFromUciLines,
  evaluateTerminalPosition,
} from "./engine-evaluator";

/**
 * Node.js Stockfish 17.1 WASM engine adapter for server-side evaluation and automated Vitest tests.
 */
export function createNodeStockfishEngine(): ChessEngine {
  const sfPath = path.resolve(
    process.cwd(),
    "node_modules/stockfish/src/stockfish-17.1-lite-single-03e3232.js"
  );

  let child: ChildProcessWithoutNullStreams | null = null;
  let initialized = false;
  let buffer = "";
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

  function ensureStarted(): ChildProcessWithoutNullStreams {
    if (disposed) {
      throw makeAbortError("Stockfish Node engine has been disposed");
    }
    if (child && !child.killed) return child;
    child = spawn(process.execPath, [sfPath], { stdio: ["pipe", "pipe", "pipe"] });
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      let newlineIdx = buffer.indexOf("\n");
      while (newlineIdx !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (line) {
          for (const listener of [...currentListeners]) {
            listener(line);
          }
        }
        newlineIdx = buffer.indexOf("\n");
      }
    });
    child.on("error", (err) => {
      rejectAllPending(err instanceof Error ? err : new Error(String(err)));
    });
    child.on("exit", () => {
      rejectAllPending(makeAbortError("Stockfish process exited"));
    });
    return child;
  }

  function send(cmd: string) {
    const proc = ensureStarted();
    proc.stdin.write(`${cmd}\n`);
  }

  function waitForLine(predicate: (line: string) => boolean, onLine?: (line: string) => void): Promise<string> {
    if (disposed) {
      return Promise.reject(makeAbortError("Stockfish Node engine disposed"));
    }

    return new Promise((resolve, reject) => {
      const rejectPending = (err: Error) => {
        cleanup();
        reject(err);
      };

      const timeout = setTimeout(() => {
        if (!disposed && child && !child.killed) {
          try {
            child.stdin.write("stop\n");
          } catch {
            // ignore
          }
        }
        cleanup();
        reject(new Error("Stockfish Node engine timed out"));
      }, 25000);

      const handler = (line: string) => {
        if (onLine) onLine(line);
        if (predicate(line)) {
          cleanup();
          resolve(line);
        }
      };

      function cleanup() {
        clearTimeout(timeout);
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
      send("uci");
      await uciWait;
      send("setoption name Hash value 32");
      initialized = true;
    }
    send(`setoption name MultiPV value ${multiPv}`);
    const readyWait = waitForLine((l) => l === "readyok");
    send("isready");
    await readyWait;
  }

  return {
    evaluatePosition(fen: string, depth: number, multiPv = 3): Promise<PositionEval> {
      const terminal = evaluateTerminalPosition(fen);
      if (terminal) return Promise.resolve(terminal);

      const run = queue.then(async () => {
        if (disposed) throw makeAbortError("Stockfish Node engine disposed");
        await initIfNeeded(multiPv);
        const infoLines: string[] = [];
        const bestPromise = waitForLine(
          (l) => l.startsWith("bestmove "),
          (l) => {
            if (l.startsWith("info ")) infoLines.push(l);
          }
        );
        send(`position fen ${fen}`);
        send(`go depth ${depth}`);
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
      if (child && !child.killed) {
        try {
          child.stdin.write("quit\n");
        } catch {
          // ignore
        }
        child.kill();
        child = null;
      }
      currentListeners = [];
      rejectAllPending(makeAbortError("Stockfish Node engine disposed"));
    },
  };
}
