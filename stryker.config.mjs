/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: "npm",
  reporters: ["html", "clear-text", "progress"],
  testRunner: "vitest",
  vitest: {
    configFile: "vitest.stryker.config.ts",
  },
  coverageAnalysis: "perTest",
  mutate: [
    "src/lib/engine/win-probability.ts",
    "src/lib/engine/uci-parser.ts",
    "src/lib/engine/engine-evaluator.ts",
    "src/lib/engine/stockfish-worker.ts",
    "src/lib/analysis/move-classifier.ts",
    "src/lib/analysis/tactical-tagger.ts",
    "src/lib/analysis/coach-insights.ts",
    "src/lib/analysis/opening-book.ts",
    "src/lib/analysis/sacrifice-detector.ts",
    "src/lib/analysis/game-analyzer.ts",
    "src/lib/play/play-session.ts",
    "src/lib/ai/gemini-coach.ts",
    "src/lib/ai/offline-coach.ts",
    "src/lib/chess/plain-notation.ts",
    "src/lib/api/chesscom-api.ts",
    "src/lib/store/useReviewStore.ts",
  ],
  thresholds: {
    high: 85,
    low: 70,
    break: 65,
  },
  concurrency: 4,
  timeoutMS: 30000,
};

export default config;
