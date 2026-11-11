import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

/**
 * Builds a pure static export (`out/`) suitable for GitHub Pages.
 * Temporarily stashes Next.js dynamic API route handlers outside `src/` during the static build
 * so full-stack server mode (`npm run build`) and client-side Pages deployment stay 100% compatible.
 */
function main() {
  const rootDir = process.cwd();
  const apiDir = path.join(rootDir, "src", "app", "api");
  const nextTypesDir = path.join(rootDir, ".next", "types");
  const outDir = path.join(rootDir, "out");
  const backupRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chess-analysis-api-"));
  const backupApiDir = path.join(backupRoot, "api");

  const hasApiDir = fs.existsSync(apiDir);
  if (hasApiDir) {
    fs.cpSync(apiDir, backupApiDir, { recursive: true });
    fs.rmSync(apiDir, { recursive: true, force: true });
  }

  let status = 1;
  try {
    fs.rmSync(nextTypesDir, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });

    const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "/chess-analysis").replace(/\/$/, "");
    const nextBin = path.join(
      rootDir,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "next.cmd" : "next"
    );

    const res = spawnSync(nextBin, ["build"], {
      cwd: rootDir,
      stdio: "inherit",
      env: {
        ...process.env,
        GITHUB_PAGES: "true",
        NEXT_PUBLIC_STATIC_EXPORT: "true",
        NEXT_PUBLIC_BASE_PATH: basePath,
      },
    });

    status = res.status ?? 1;
    if (status === 0) {
      const indexHtml = path.join(outDir, "index.html");
      const stockfishSingle = path.join(
        outDir,
        "stockfish",
        "stockfish-17.1-lite-single-03e3232.wasm"
      );
      if (!fs.existsSync(indexHtml) || !fs.existsSync(stockfishSingle)) {
        console.error("Static export missing expected index.html or Stockfish WASM bundle.");
        status = 1;
      } else {
        fs.writeFileSync(path.join(outDir, ".nojekyll"), "");
        console.log(`\n✅ Static GitHub Pages export ready in ./out (basePath="${basePath || "/"}")`);
      }
    }
  } finally {
    if (hasApiDir && fs.existsSync(backupApiDir)) {
      fs.rmSync(apiDir, { recursive: true, force: true });
      fs.cpSync(backupApiDir, apiDir, { recursive: true });
    }
    fs.rmSync(backupRoot, { recursive: true, force: true });
    fs.rmSync(nextTypesDir, { recursive: true, force: true });
  }

  process.exit(status);
}

main();
