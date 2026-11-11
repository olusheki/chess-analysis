import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * Fast Vitest configuration used by Stryker mutation testing:
 * excludes the slow real-Stockfish WASM acceptance test (which still runs in `npm test`)
 * so hundreds of mutants across Tier 1 & Tier 2 libraries execute cleanly within timeout.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    testTimeout: 15000,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["tests/stockfish-acceptance.test.ts"],
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
