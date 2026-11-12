#!/usr/bin/env node
/**
 * Automated Headless Chrome CDP End-to-End & Visual Verification Suite
 *
 * Drives an unmocked production build (localhost or GitHub Pages) using Node 24's
 * built-in WebSocket + Chrome DevTools Protocol without requiring Playwright.
 *
 * Environment variables:
 *   E2E_URL            Target URL (default: http://localhost:3000)
 *   E2E_REQUIRE_CHROME Set "1" to fail instead of skipping when Chrome is missing
 *   E2E_OUT_DIR        Optional directory to save PNG screenshots & JSON report
 *   CHROME_BIN         Optional explicit Chrome/Chromium executable path
 */

import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const TARGET_URL = process.env.E2E_URL || "http://localhost:3000";
const REQUIRE_CHROME = process.env.E2E_REQUIRE_CHROME === "1";
const REQUIRE_NETWORK = process.env.E2E_REQUIRE_NETWORK === "1";
const OUT_DIR = process.env.E2E_OUT_DIR ? path.resolve(process.env.E2E_OUT_DIR) : null;
const EXPLICIT_CDP_PORT = process.env.E2E_CDP_PORT ? Number(process.env.E2E_CDP_PORT) : null;

function allocateUnusedPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 9231;
      server.close(() => resolve(port));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findChromeBinary() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) {
    return process.env.CHROME_BIN;
  }
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  for (const bin of candidates) {
    if (fs.existsSync(bin)) return bin;
  }
  for (const cmd of ["google-chrome", "chromium", "chromium-browser"]) {
    try {
      const resolved = execSync(`command -v ${cmd}`, { encoding: "utf8" }).trim();
      if (resolved && fs.existsSync(resolved)) return resolved;
    } catch {
      // keep looking
    }
  }
  return null;
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.closed = false;
  }

  rejectPending(err) {
    for (const [, slot] of this.pending) {
      slot.reject(err);
    }
    this.pending.clear();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("close", () => {
      this.closed = true;
      this.rejectPending(new Error("CDP WebSocket connection closed unexpectedly"));
    });
    this.ws.addEventListener("error", () => {
      this.closed = true;
      this.rejectPending(new Error("CDP WebSocket error"));
    });
    this.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id) {
        const slot = this.pending.get(msg.id);
        if (slot) {
          this.pending.delete(msg.id);
          if (msg.error) slot.reject(new Error(JSON.stringify(msg.error)));
          else slot.resolve(msg.result);
        }
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }

  send(method, params = {}) {
    if (this.closed) {
      return Promise.reject(new Error(`CDP WebSocket already closed before sending ${method}`));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression: `(async () => { ${expression} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(
        `Browser JS error: ${res.exceptionDetails.text || JSON.stringify(res.exceptionDetails)}`
      );
    }
    return res.result?.value;
  }

  async waitFor(fnExpr, { timeoutMs = 45000, intervalMs = 300, label = "condition" } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const val = await this.eval(fnExpr);
      if (val) return val;
      await sleep(intervalMs);
    }
    throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`);
  }

  async screenshot(name) {
    if (!OUT_DIR) return;
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const { data } = await this.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT_DIR, name), Buffer.from(data, "base64"));
  }

  close() {
    this.ws.close();
  }
}

function assert(cond, msg) {
  if (!cond) {
    throw new Error(`E2E Assertion Failed: ${msg}`);
  }
}

async function run() {
  const chromePath = findChromeBinary();
  if (!chromePath) {
    if (REQUIRE_CHROME) {
      console.error("Chrome/Chromium binary not found and E2E_REQUIRE_CHROME=1 is set.");
      process.exit(1);
    }
    console.log("SKIP: Chrome/Chromium binary not found; skipping headless browser E2E suite.");
    return;
  }

  console.log(`\n🌐 Running Browser E2E & Visual Suite against: ${TARGET_URL}`);
  console.log(`   Chrome binary: ${chromePath}`);

  const cdpPort = EXPLICIT_CDP_PORT ?? (await allocateUnusedPort());
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "chess-e2e-"));
  const chrome = spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${profileDir}`,
      "--window-size=1440,960",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  let client;
  try {
    let target;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
        const list = await res.json();
        target = list.find((t) => t.type === "page");
        if (target) break;
      } catch {
        // retry until CDP responds
      }
      await sleep(250);
    }
    if (!target) {
      throw new Error(`Failed to connect to headless Chrome CDP on port ${cdpPort}`);
    }

    client = new CDPClient(target.webSocketDebuggerUrl);
    await client.open();
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Network.enable");
    await client.send("Log.enable");

    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 960,
      deviceScaleFactor: 2,
      mobile: false,
    });

    await client.send("Page.navigate", { url: TARGET_URL });

    // -----------------------------------------------------------------------
    // 1. Initial Opera Game Auto-Analysis + Zero Layout Overflow
    // -----------------------------------------------------------------------
    await client.waitFor(
      `const t = document.body.textContent || '';
       return t.includes('Phase Accuracy') && !t.includes('Running Stockfish 17.1 WASM Analysis');`,
      { timeoutMs: 60000, label: "Opera Game Stockfish WASM analysis" }
    );
    await sleep(400);

    const operaMetrics = await client.eval(`
      const t = document.body.textContent || '';
      return {
        overflowX: document.documentElement.scrollWidth - window.innerWidth,
        hasPhaseAccuracy: t.includes('Phase Accuracy'),
        hasCoachCard: Boolean(document.querySelector('button[aria-label="Plain English notation"]')),
      };
    `);
    assert(operaMetrics.overflowX <= 1, `Desktop overflowX=${operaMetrics.overflowX}`);
    assert(operaMetrics.hasPhaseAccuracy, "Phase Accuracy section missing after initial load");
    assert(operaMetrics.hasCoachCard, "CoachCard controls missing after initial load");
    await client.screenshot("e2e-01-opera-desktop.png");
    console.log("  ✅ 1. Opera Game initial WASM review loaded cleanly");

    // -----------------------------------------------------------------------
    // 2. Coach Personas & Plain English Toggle
    // -----------------------------------------------------------------------
    await client.eval(`
      const pe = document.querySelector('button[aria-label="Plain English notation"]');
      if (!pe) throw new Error('Plain English notation toggle missing');
      pe.click();
    `);
    await sleep(200);
    const plainActive = await client.eval(`
      const pe = document.querySelector('button[aria-label="Plain English notation"]');
      return pe?.getAttribute('aria-pressed') === 'true' || /bg-\\[#96bc4b\\]/.test(pe?.className || '');
    `);
    assert(plainActive, "Plain English notation toggle did not activate");
    await client.eval(`
      document.querySelector('button[aria-label="Plain English notation"]').click();
      const blazeBtn = document.querySelector('button[aria-label*="Blaze"]');
      if (!blazeBtn) throw new Error('Blaze persona button missing');
      blazeBtn.click();
    `);
    await sleep(200);
    const blazeActive = await client.eval(
      `return document.querySelector('button[aria-label*="Blaze"]')?.getAttribute('aria-pressed') === 'true';`
    );
    assert(blazeActive, "Blaze persona button did not activate");
    console.log("  ✅ 2. Coach persona switch & Plain English toggle verified");

    // -----------------------------------------------------------------------
    // 3. Retry Mode & Key Moment Navigation (switch to Black so Duke Karl's errors trigger Retry Move)
    // -----------------------------------------------------------------------
    await client.eval(`
      const blackBtn = document.querySelector('button[aria-label="Coach as Black"]');
      if (!blackBtn) throw new Error('Coach as Black button missing');
      blackBtn.click();
    `);
    await sleep(250);

    const tryTriggerRetry = async () => {
      const hasRetry = await client.eval(
        `return [...document.querySelectorAll('button')].some(b => (b.textContent || '').includes('Retry Move'));`
      );
      if (!hasRetry) return false;
      await client.eval(`
        [...document.querySelectorAll('button')].find(b => (b.textContent || '').includes('Retry Move')).click();
      `);
      await sleep(250);
      const exitRetryVisible = await client.eval(
        `return [...document.querySelectorAll('button')].some(b => (b.textContent || '').includes('Exit Retry'));`
      );
      assert(exitRetryVisible, "Exit Retry button did not appear after clicking Retry Move");
      await client.screenshot("e2e-02-retry-mode.png");
      await client.eval(`
        [...document.querySelectorAll('button')].find(b => (b.textContent || '').includes('Exit Retry')).click();
      `);
      await sleep(200);
      return true;
    };

    let enteredRetry = false;
    for (let step = 0; step < 12 && !enteredRetry; step++) {
      await client.eval(`
        const btn = document.querySelector('button[aria-label="Next Key Moment"]');
        if (btn && !btn.disabled) btn.click();
      `);
      await sleep(200);
      enteredRetry = await tryTriggerRetry();
    }
    if (!enteredRetry) {
      await client.eval(`document.querySelector('button[aria-label="Jump to start"]')?.click();`);
      await sleep(150);
      for (let ply = 0; ply < 34 && !enteredRetry; ply++) {
        await client.eval(`document.querySelector('button[aria-label="Next move"]')?.click();`);
        await sleep(120);
        enteredRetry = await tryTriggerRetry();
      }
    }
    assert(enteredRetry, "Never encountered a Retry Move error on Opera Game");
    await client.eval(`
      const whiteBtn = document.querySelector('button[aria-label="Coach as White"]');
      if (whiteBtn) whiteBtn.click();
    `);
    await sleep(200);
    console.log("  ✅ 3. Key moment Retry Move flow verified");

    // -----------------------------------------------------------------------
    // 4. Analysis Tab Variation Creation + Live Stockfish MultiPV + Moves Tab
    // -----------------------------------------------------------------------
    await client.eval(`
      const firstBtn = document.querySelector('button[aria-label="Jump to start"], button[aria-label="First move"]');
      if (!firstBtn) throw new Error('Jump to start button missing');
      firstBtn.click();
    `);
    await sleep(250);
    await client.eval(`
      const tab = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Analysis');
      if (!tab) throw new Error('Analysis tab not found');
      tab.click();
    `);
    await sleep(300);

    // Jump explicitly to ply 0 by clicking Opening move or playing a variation off whatever legal piece exists
    await client.eval(`
      // Ensure we are at ply 0 if Start button didn't match exact label: try d2->d4 if d2 has white pawn, otherwise find any piece with legal dots
      const sqD2 = document.querySelector('[data-testid="square-d2"]');
      const sqD4 = document.querySelector('[data-testid="square-d4"]');
      if (sqD2 && sqD2.querySelector('[data-piece-node]')) {
        sqD2.click();
      }
    `);
    await sleep(150);
    const playedD4 = await client.eval(`
      const dotD4 = document.querySelector('[data-testid="legal-dot-d4"]');
      const sqD4 = document.querySelector('[data-testid="square-d4"]');
      if (dotD4 && sqD4) {
        sqD4.click();
        return true;
      }
      // Fallback: pick any legal target on the board to guarantee variation creation
      const squares = [...document.querySelectorAll('[data-testid^="square-"]')];
      for (const s of squares) {
        if (!s.querySelector('[data-piece-node]')) continue;
        s.click();
        await new Promise((r) => setTimeout(r, 40));
        const dots = [...document.querySelectorAll('[data-testid^="legal-dot-"]')];
        if (dots.length > 0) {
          const targetSq = dots[0].getAttribute('data-testid').replace('legal-dot-', '');
          document.querySelector('[data-testid="square-' + targetSq + '"]').click();
          return true;
        }
      }
      return false;
    `);
    assert(playedD4, "Failed to play an analysis move on interactive Analysis board");

    await client.waitFor(
      `const t = document.body.textContent || '';
       return t.includes('Variation from') && (t.includes('PV1') || t.includes('Computing Stockfish MultiPV=3'));`,
      { timeoutMs: 25000, label: "Variation creation & live MultiPV evaluation" }
    );
    await client.waitFor(
      `return (document.body.textContent || '').includes('PV1');`,
      { timeoutMs: 25000, label: "Live Stockfish PV1 completion on variation node" }
    );
    await client.screenshot("e2e-03-analysis-variation.png");

    // Verify Moves tab renders inline variation branches
    await client.eval(`
      [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Moves').click();
    `);
    await sleep(300);
    const movesHasBranch = await client.eval(`
      return document.querySelectorAll('[data-testid="moves-variation-branch"]').length > 0;
    `);
    // Double check by switching back to Analysis and asserting Saved Variation Branches exists too
    await client.eval(`
      [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Analysis').click();
    `);
    await sleep(250);
    const savedBranchesVisible = await client.eval(`
      return (document.body.textContent || '').includes('Saved Variation Branches');
    `);
    assert(savedBranchesVisible && movesHasBranch, "Variation branch missing in Analysis/Moves panels");
    await client.eval(`
      const mainBtn = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Mainline');
      if (mainBtn) mainBtn.click();
      const reviewTab = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Review');
      if (reviewTab) reviewTab.click();
    `);
    await sleep(200);
    console.log("  ✅ 4. Analysis board variation + live MultiPV + Moves branch verified");

    // -----------------------------------------------------------------------
    // 5. Syzygy 7-Man Endgame Tablebase Lookup via Paste PGN / FEN
    // -----------------------------------------------------------------------
    const ENDGAME_PGN = `[Event "Syzygy Check"]\n[White "Endgame White"]\n[Black "Endgame Black"]\n[FEN "8/3k4/8/8/8/8/2R5/3K4 w - - 0 1"]\n[SetUp "1"]\n\n1. Rc4 Kd6`;
    await client.eval(`
      [...document.querySelectorAll('button')].find(b => (b.textContent || '').includes('Load Game')).click();
    `);
    await sleep(250);
    await client.eval(`
      [...document.querySelectorAll('button')].find(b => (b.textContent || '').includes('Paste PGN')).click();
    `);
    await sleep(200);
    await client.eval(`
      const ta = document.querySelector('textarea');
      if (!ta) throw new Error('PGN textarea not found');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, ${JSON.stringify(ENDGAME_PGN)});
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
    `);
    await sleep(100);
    await client.eval(`
      const analyzeBtn = [...document.querySelectorAll('button')].find(b => (b.textContent || '').includes('Analyze PGN / FEN'));
      if (!analyzeBtn || analyzeBtn.disabled) throw new Error('Analyze PGN / FEN button missing or disabled');
      analyzeBtn.click();
    `);
    await client.waitFor(
      `const t = document.body.textContent || '';
       const ta = document.querySelector('textarea');
       const modalHidden = !ta || ta.offsetParent === null;
       return modalHidden && t.includes('Endgame White') && t.includes('Phase Accuracy') && !t.includes('Running Stockfish 17.1 WASM Analysis');`,
      { timeoutMs: 25000, label: "3-piece endgame PGN analysis" }
    );
    await client.eval(`
      [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Analysis').click();
    `);
    await sleep(400);
    try {
      const tbVerdict = await client.waitFor(
        `const t = document.body.textContent || '';
         if (!t.includes('Syzygy Endgame Tablebase')) return null;
         const match = t.match(/(White Wins|Black Wins|Draw|(?:White|Black) Cursed Win|(?:White|Black) Blessed Loss)/);
         return match ? match[1] : null;`,
        { timeoutMs: 12000, label: "Syzygy 7-man tablebase result" }
      );
      await client.screenshot("e2e-04-syzygy-endgame.png");
      console.log(`  ✅ 5. Syzygy 7-man tablebase lookup verified (${tbVerdict})`);
    } catch (err) {
      if (REQUIRE_NETWORK) throw err;
      console.warn(`  ⚠️ 5. Syzygy tablebase check timed out (external lichess.ovh API may be unreachable): ${err.message}`);
    }

    // -----------------------------------------------------------------------
    // 6. Play Here: Step to a move on Review tab, Make Legal Move, Undo, Exit
    // -----------------------------------------------------------------------
    await client.eval(`
      [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Review').click();
    `);
    await sleep(250);
    await client.eval(`
      const nextBtn = [...document.querySelectorAll('button')].find((b) => {
        const lbl = (b.getAttribute('aria-label') || b.title || '').toLowerCase();
        return lbl.includes('next') && !lbl.includes('key');
      });
      if (nextBtn && !nextBtn.disabled) nextBtn.click();
    `);
    await sleep(250);
    await client.eval(`
      const playBtn = [...document.querySelectorAll('button')].find((b) => {
        const txt = b.textContent || '';
        return txt.includes('Play Here') || txt.includes('Fix & Play Out');
      });
      if (!playBtn) throw new Error('Play Here button not found on Review tab');
      playBtn.click();
    `);
    await client.waitFor(
      `const t = document.body.textContent || '';
       return (/play vs stockfish/i.test(t)) && !t.includes('is thinking...');`,
      { timeoutMs: 20000, label: "Play Mode activation & initial engine turn" }
    );
    const playedPracticeMove = await client.eval(`
      const squares = [...document.querySelectorAll('[data-testid^="square-"]')];
      for (const s of squares) {
        if (!s.querySelector('[data-piece-node]')) continue;
        s.click();
        await new Promise((r) => setTimeout(r, 40));
        const dots = [...document.querySelectorAll('[data-testid^="legal-dot-"]')];
        if (dots.length > 0) {
          const targetSq = dots[0].getAttribute('data-testid').replace('legal-dot-', '');
          document.querySelector('[data-testid="square-' + targetSq + '"]').click();
          return true;
        }
      }
      return false;
    `);
    assert(playedPracticeMove, "Could not execute legal move in Play Mode");
    await client.waitFor(
      `const undoBtn = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Undo');
       const t = document.body.textContent || '';
       return undoBtn && !undoBtn.disabled && t.includes('Practice Moves') && !t.includes('is thinking...');`,
      { timeoutMs: 25000, label: "Play Mode engine reply & Undo enablement" }
    );
    await client.screenshot("e2e-05-play-mode.png");
    await client.eval(`
      [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Undo').click();
    `);
    await sleep(250);
    await client.eval(`
      const exitBtn = document.querySelector('button[aria-label="Exit play"]');
      if (!exitBtn) throw new Error('Exit play button missing');
      exitBtn.click();
    `);
    await sleep(250);
    const playClosed = await client.eval(
      `return !(/play vs stockfish/i.test(document.body.textContent || ''));`
    );
    assert(playClosed, "Play Mode failed to exit cleanly");
    console.log("  ✅ 6. Play Mode move / Stockfish reply / Undo / Exit verified");

    // -----------------------------------------------------------------------
    // 7. Chess.com User "olusheki" Importer
    // -----------------------------------------------------------------------
    let importerStats = { count: 0, reviewed: 0, skipped: false };
    await client.eval(`
      [...document.querySelectorAll('button')].find(b => (b.textContent || '').includes('Load Game')).click();
    `);
    await sleep(250);
    await client.eval(`
      [...document.querySelectorAll('button')].find(b => (b.textContent || '').includes('Chess.com User')).click();
    `);
    await sleep(200);
    await client.eval(`
      const input = document.querySelector('input[aria-label="Chess.com username"]');
      if (!input) throw new Error('Chess.com username input not found');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'olusheki');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.closest('form').requestSubmit();
    `);
    try {
      await client.waitFor(
        `return (document.body.textContent || '').includes('recent standard games loaded');`,
        { timeoutMs: 20000, label: "olusheki Chess.com archive load" }
      );
      importerStats = await client.eval(`
        const items = [...document.querySelectorAll('[data-testid="chesscom-game-item"]')].map(b => b.textContent || '');
        return {
          count: items.length,
          reviewed: items.filter(t => /reviewed/i.test(t)).length,
          skipped: false,
        };
      `);
      assert(importerStats.count >= 5, `Expected >=5 olusheki games, got ${importerStats.count}`);
      // Pick a short game or Secondkuze to keep total E2E runtime snappy
      await client.eval(`
        const btns = [...document.querySelectorAll('[data-testid="chesscom-game-item"]')];
        const pick = btns.find(b => (b.textContent || '').includes('ImPigoen'))
          || btns.find(b => (b.textContent || '').includes('Secondkuze'))
          || btns[0];
        pick.click();
      `);
      await client.waitFor(
        `const t = document.body.textContent || '';
         return t.includes('Phase Accuracy') && !t.includes('Running Stockfish 17.1 WASM Analysis');`,
        { timeoutMs: 120000, label: "olusheki game client-side analysis" }
      );
      await client.screenshot("e2e-06-olusheki-review.png");
      console.log(
        `  ✅ 7. Chess.com 'olusheki' importer verified (${importerStats.count} games, ${importerStats.reviewed} reviewed)`
      );
    } catch (err) {
      if (REQUIRE_NETWORK) throw err;
      importerStats = { count: 0, reviewed: 0, skipped: true };
      await client.eval(`
        const closeBtn = [...document.querySelectorAll('button')].find(b => (b.textContent || '').trim() === 'Close' || b.getAttribute('aria-label') === 'Close modal');
        if (closeBtn) closeBtn.click();
      `);
      console.warn(`  ⚠️ 7. Chess.com importer skipped due to unreachable external API: ${err.message}`);
    }

    // -----------------------------------------------------------------------
    // 8. Mobile 390x844 Zero Horizontal Overflow Across Tabs
    // -----------------------------------------------------------------------
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await sleep(300);

    for (const tabName of ["Review", "Analysis", "Moves"]) {
      await client.eval(`
        const tab = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === ${JSON.stringify(tabName)});
        if (tab) tab.click();
      `);
      await sleep(250);
      const ov = await client.eval(`return document.documentElement.scrollWidth - window.innerWidth;`);
      assert(ov <= 1, `Mobile 390px horizontal overflow on ${tabName} tab: ${ov}px`);
    }
    await client.screenshot("e2e-07-mobile-390.png");
    console.log("  ✅ 8. Mobile 390x844 zero horizontal overflow verified across Review/Analysis/Moves");

    // -----------------------------------------------------------------------
    // 9. Console & Runtime Error Gate
    // -----------------------------------------------------------------------
    const runtimeErrors = client.events.filter(
      (e) =>
        e.method === "Runtime.exceptionThrown" ||
        (e.method === "Log.entryAdded" && e.params?.entry?.level === "error")
    );
    const sameOriginFailures = client.events.filter((e) => {
      if (e.method !== "Network.responseReceived") return false;
      const url = e.params?.response?.url || "";
      const status = e.params?.response?.status || 0;
      return status >= 400 && url.startsWith(new URL(TARGET_URL).origin);
    });

    if (OUT_DIR) {
      fs.writeFileSync(
        path.join(OUT_DIR, "e2e-report.json"),
        JSON.stringify(
          {
            targetUrl: TARGET_URL,
            operaMetrics,
            importerStats,
            runtimeErrors,
            sameOriginFailures,
          },
          null,
          2
        )
      );
    }

    assert(
      runtimeErrors.length === 0,
      `Console/runtime errors detected: ${JSON.stringify(runtimeErrors)}`
    );
    assert(
      sameOriginFailures.length === 0,
      `Same-origin HTTP >=400 failures detected: ${JSON.stringify(sameOriginFailures)}`
    );
    console.log("  ✅ 9. Zero runtime/console/same-origin network errors\n");
    console.log("🎉 Browser E2E & Visual Suite PASSED!");
  } catch (err) {
    try {
      await client?.screenshot("e2e-failure.png");
      const dump = await client?.eval(`return (document.body?.innerText || '').slice(0, 800);`);
      console.error("\n🔍 Failure DOM text preview:\n", dump);
    } catch {
      // ignore diagnostic failure
    }
    throw err;
  } finally {
    try {
      client?.close();
    } catch {
      // ignore close errors
    }
    try {
      chrome.kill("SIGKILL");
    } catch {
      // ignore already exited
    }
    await sleep(150);
    try {
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // best-effort temp profile cleanup without masking test errors
    }
  }
}

run().catch((err) => {
  console.error("\n❌ E2E Suite Failed:", err);
  process.exit(1);
});
