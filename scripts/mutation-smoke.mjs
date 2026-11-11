#!/usr/bin/env node
/**
 * Automated Semantic Mutation Smoke Tester
 *
 * Injects targeted, realistic bugs across every architectural tier, runs the
 * corresponding test suite, and verifies that tests FAIL (mutant killed).
 * Restores every file cleanly via try/finally.
 *
 * Exits 0 only if 100% of injected mutants are killed; exits 1 if any mutant survives.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();

/** @type {Array<{ name: string; file: string; target: string; replacement: string; testFile: string }>} */
const MUTANTS = [
  {
    name: "M1: Invert logistic sigmoid exponent sign in win-probability.ts",
    file: "src/lib/engine/win-probability.ts",
    target: "const wp = 100 / (1 + Math.pow(10, -0.004 * cp));",
    replacement: "const wp = 100 / (1 + Math.pow(10, 0.004 * cp));",
    testFile: "tests/win-probability.test.ts",
  },
  {
    name: "M2: Break CAPS2 move accuracy exponential decay formula",
    file: "src/lib/engine/win-probability.ts",
    target: "const raw = 103.1668 * Math.exp(-0.04354 * deltaWP) - 3.1669;",
    replacement: "const raw = 103.1668 * Math.exp(0.04354 * deltaWP) - 3.1669;",
    testFile: "tests/win-probability.test.ts",
  },
  {
    name: "M3: Break Stockfish Black-turn perspective sign flip in uci-parser.ts",
    file: "src/lib/engine/uci-parser.ts",
    target: "const sign = turnToMove === \"w\" ? 1 : -1;",
    replacement: "const sign = 1;",
    testFile: "tests/uci-parser.test.ts",
  },
  {
    name: "M4: Break Brilliant sacrifice material threshold in move-classifier.ts",
    file: "src/lib/analysis/move-classifier.ts",
    target: "if (materialSacrificed >= 2 && isNearBestForSac && wpPlayed >= 38.0)",
    replacement: "if (materialSacrificed >= 10 && isNearBestForSac && wpPlayed >= 38.0)",
    testFile: "tests/move-classifier.test.ts",
  },
  {
    name: "M5: Break Miss detection priority in move-classifier.ts",
    file: "src/lib/analysis/move-classifier.ts",
    target: "prevMoveOpponentDeltaWP >= 18.0 &&",
    replacement: "prevMoveOpponentDeltaWP >= 99.0 &&",
    testFile: "tests/move-classifier.test.ts",
  },
  {
    name: "M6: Reintroduce global isAttacked fork bug in tactical-tagger.ts",
    file: "src/lib/analysis/tactical-tagger.ts",
    target: "const attackedFromDest = getPieceAttackedSquares(\n        boardAfter,\n        movedObj.to,\n        activeColor,\n        movedPieceAfter.type\n      );",
    replacement:
      "const attackedFromDest = (['a8','b8','c8','d8','e8','f8','g8','h8','a7','b7','c7','d7','e7','f7','g7','h7'] as Square[]).filter((s) => chessAfter.isAttacked(s, activeColor));",
    testFile: "tests/tactical-tagger.test.ts",
  },
  {
    name: "M7: Break SEE opponent recapture subtraction in sacrifice-detector.ts",
    file: "src/lib/analysis/sacrifice-detector.ts",
    target: "return Math.max(0, capturedVal - replyGain);",
    replacement: "return 0;",
    testFile: "tests/sacrifice-detector.test.ts",
  },
  {
    name: "M8: Break ECO opening lookup en-passant fallback in opening-book.ts",
    file: "src/lib/analysis/opening-book.ts",
    target: "if (!entry && parts.length >= 4 && parts[3] !== \"-\") {",
    replacement: "if (false && !entry && parts.length >= 4 && parts[3] !== \"-\") {",
    testFile: "tests/opening-book.test.ts",
  },
  {
    name: "M9: Disable grounding hallucination validator in gemini-coach.ts",
    file: "src/lib/ai/gemini-coach.ts",
    target: "if (!matchesAnyBoard) {\n      hallucinations.push(match[0]);\n    }",
    replacement: "if (false && !matchesAnyBoard) {\n      hallucinations.push(match[0]);\n    }",
    testFile: "tests/gemini-coach.test.ts",
  },
  {
    name: "M10: Break Retry Move puzzle verification in useReviewStore.ts",
    file: "src/lib/store/useReviewStore.ts",
    target: "const isMatch =\n      playedUci === retryState.targetUci ||\n      played.san === retryState.targetSan;",
    replacement: "const isMatch = false;",
    testFile: "tests/use-review-store.test.ts",
  },
  {
    name: "M11: Break Knight L-shape arrow bend detection in BoardOverlays.tsx",
    file: "src/components/chess/BoardOverlays.tsx",
    target: "const isKnight = (absDx === 1 && absDy === 2) || (absDx === 2 && absDy === 1);",
    replacement: "const isKnight = false;",
    testFile: "tests/ui-components.test.tsx",
  },
  {
    name: "M12: Break EvalBar forced-mate 100%/0% clamping in EvalBar.tsx",
    file: "src/components/chess/EvalBar.tsx",
    target: "if (whiteMate !== undefined && whiteMate !== 0) {\n    return whiteMate > 0 ? 100 : 0;\n  }",
    replacement: "if (whiteMate !== undefined && whiteMate !== 0) {\n    return 50;\n  }",
    testFile: "tests/ui-components.test.tsx",
  },
  {
    name: "M13: Bypass Brilliant cpDrop <= 35 && !lostMate precision guard in move-classifier.ts",
    file: "src/lib/analysis/move-classifier.ts",
    target: "const isNearBestForSac = isBestMove || (deltaWP <= 1.0 && cpDrop <= 35 && !lostMate);",
    replacement: "const isNearBestForSac = isBestMove || deltaWP <= 1.0;",
    testFile: "tests/move-classifier.test.ts",
  },
  {
    name: "M14: Remove preSeeLoss subtraction for pre-existing hanging pieces in sacrifice-detector.ts",
    file: "src/lib/analysis/sacrifice-detector.ts",
    target: "const preSeeLoss = preTurnFlipped\n        ? staticExchangeOnSquare(preTurnFlipped, sq, opponentColor)\n        : 0;",
    replacement: "const preSeeLoss = 0;",
    testFile: "tests/sacrifice-detector.test.ts",
  },
  {
    name: "M15: Skip rejecting pending searches in dispose() in stockfish-worker.ts",
    file: "src/lib/engine/stockfish-worker.ts",
    target: "rejectAllPending(makeAbortError(\"Stockfish worker disposed\"));",
    replacement: "// broken: leak pending promises without rejecting",
    testFile: "tests/stockfish-worker.test.ts",
  },
  {
    name: "M16: Ignore custom FEN full-move counter in game-analyzer.ts",
    file: "src/lib/analysis/game-analyzer.ts",
    target: "const startFullMove = parseInt(fenParts[5] ?? \"1\", 10) || 1;",
    replacement: "const startFullMove = 1;",
    testFile: "tests/game-analyzer.test.ts",
  },
  {
    name: "M17: Break Recharts v3 string activeTooltipIndex parsing in EvalGraph.tsx",
    file: "src/components/chess/EvalGraph.tsx",
    target: "typeof rawIdx === \"string\" && rawIdx.trim() !== \"\"\n                  ? Number(rawIdx)\n                  : NaN;",
    replacement: "NaN;",
    testFile: "tests/eval-graph.test.tsx",
  },
  {
    name: "M18: Swallow upstream HTTP 429 rate-limit status as 502 in api/chesscom/route.ts",
    file: "src/app/api/chesscom/route.ts",
    target: "const status =\n      error instanceof ChessComApiError && error.status === 429 ? 429 : 502;",
    replacement: "const status = 502;",
    testFile: "tests/api-routes.test.ts",
  },
];

let killed = 0;
let survived = 0;
let errored = 0;

console.log(`\n🧬 Running Automated Mutation Smoke Suite (${MUTANTS.length} targeted mutants)...\n`);

for (const mutant of MUTANTS) {
  const absPath = path.resolve(ROOT, mutant.file);
  const original = fs.readFileSync(absPath, "utf8");

  if (!original.includes(mutant.target)) {
    console.error(`❌ [ERROR] Target snippet not found for ${mutant.name} in ${mutant.file}`);
    errored++;
    continue;
  }

  try {
    const mutated = original.replace(mutant.target, mutant.replacement);
    fs.writeFileSync(absPath, mutated, "utf8");

    const res = spawnSync("npx", ["vitest", "run", mutant.testFile], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "pipe",
    });

    if (res.status !== 0) {
      killed++;
      console.log(`✅ [KILLED] ${mutant.name}`);
    } else {
      survived++;
      console.error(`🚨 [SURVIVED] ${mutant.name} — tests still passed in ${mutant.testFile}!`);
    }
  } finally {
    fs.writeFileSync(absPath, original, "utf8");
  }
}

console.log(`\n📊 Mutation Summary: ${killed} killed, ${survived} survived, ${errored} setup errors (total ${MUTANTS.length})\n`);

if (survived > 0 || errored > 0) {
  process.exit(1);
}
