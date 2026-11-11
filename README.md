# Chess Game Review & AI Coach

Interactive chess game review application modeled after Chess.com's Game Review workflow, powered by client-side **Stockfish 17.1 WASM**, **CAPS2** win-probability accuracy scoring, **ECO** opening classification, deterministic tactical feature extraction, and a grounded **AI Coach** with optional Google Gemini integration.

**Live Demo (GitHub Pages):** https://olusheki.github.io/chess-analysis/

---

## Core Capabilities

- **In-Browser Engine Analysis (`MultiPV = 3`)**: Runs Stockfish 17.1 WASM inside a dedicated Web Worker (`src/lib/engine/stockfish-worker.ts`), automatically using multi-threaded WASM under `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers and falling back to single-threaded WASM on static hosts such as GitHub Pages.
- **Win Probability & CAPS2 Accuracy**: Converts centipawn and mate evaluations via logistic sigmoid (`win-probability.ts`), computes leverage-weighted arithmetic/harmonic overall and phase accuracies (Opening, Middlegame, Endgame), and anchors performance ratings to PGN ratings when present.
- **11-Tier Move Classification**: Evaluates moves using Static Exchange Evaluation (`sacrifice-detector.ts`), transposition-aware ECO opening lookup (`opening-book.ts`), and tactical detectors (`tactical-tagger.ts`) across all 11 badges (`Book`, `Forced`, `Brilliant`, `Great`, `Best`, `Excellent`, `Good`, `Inaccuracy`, `Mistake`, `Miss`, `Blunder`).
- **Single-Side Grounded AI Coach**:
  - Exclusive **White** or **Black** coaching perspective distinguishing player errors from opponent opportunities.
  - **Plain English / SAN toggle** (`plain-notation.ts`, Plain English default) formatting moves such as `knight takes b4 (Nxb4)` or `pawn g8 check` directly inside coach commentary.
  - **Offline Deterministic Fallback (`offline-coach.ts`)** grounded strictly in tactical tags and principal variations, with optional live **Gemini (`gemini-2.0-flash`)** synthesis and hallucination verification (`validateExplanationGrounding`) when `GEMINI_API_KEY` is configured on the server.
  - Interactive **Retry Move** (for player mistakes/blunders) and **Punish Error** (for opponent slips) board drills, plus step-through PV line inspection.
- **Game Import & Interactive Board**: Direct Chess.com username lookup via Chess.com PubAPI (`UsernameImporter`), custom PGN and FEN support, smooth WAAPI piece slide transitions, SVG directional arrows, dynamic evaluation bar, and Recharts advantage timeline.

---

## Architecture Overview

| Layer | Module(s) | Responsibility |
| :--- | :--- | :--- |
| **Engine Worker** | `src/lib/engine/stockfish-worker.ts`, `uci-parser.ts`, `engine-evaluator.ts` | Web Worker UCI lifecycle, MultiPV score normalization, active-turn perspective conversion |
| **Metrics & Book** | `src/lib/engine/win-probability.ts`, `src/lib/analysis/opening-book.ts` | Sigmoid WP, CAPS2 accuracy, phase splits, ECO classification with transposition handling |
| **Tactics & Classifier** | `src/lib/analysis/move-classifier.ts`, `sacrifice-detector.ts`, `tactical-tagger.ts`, `game-analyzer.ts` | SEE sacrifice detection, pins/forks/skewers/hanging-piece tagging, 11-badge decision tree |
| **Coach & Notation** | `src/lib/ai/gemini-coach.ts`, `offline-coach.ts`, `coach-personas.ts`, `src/lib/chess/plain-notation.ts` | Grounded Gemini API integration, browser-safe offline coach, persona voices, Plain English formatter |
| **API & Importer** | `src/app/api/{chesscom,explain,openings}/route.ts`, `src/lib/api/chesscom-api.ts` | Server Route Handlers plus direct browser Chess.com PubAPI fallback for static exports |
| **UI & State** | `src/app/page.tsx`, `src/components/{chess,review,importer}/`, `src/lib/store/useReviewStore.ts` | Zustand review state, animated board, eval bar/timeline, sidebar tabs, retry/punish drills |

---

## Move Classification Thresholds

Implemented in `src/lib/analysis/move-classifier.ts`:

| Badge | Symbol | Color | Rule Summary |
| :--- | :---: | :---: | :--- |
| **Book** | 📖 | `#a88a68` | Matches ECO opening book line (`isBook`) |
| **Forced** | ➔ | `#8c8883` | Only 1 legal move (`legalMoveCount === 1`) or sole move escaping mate-in-1 |
| **Brilliant** | `!!` | `#1baca6` | `materialSacrificed >= 2`, near-`PV1` precision, `wpPlayed >= 38%`, non-mop-up and non-king-escape |
| **Great** | `!` | `#5c8bb0` | Non-trivial `PV1` with `wpBest >= 60%` where `PV2` drops below winning territory (`wpPV2 < 55%`) |
| **Best** | `★` | `#96bc4b` | Matches engine `PV1` (`isBestMove`) or `deltaWP <= 0.2%` |
| **Excellent** | `✓` | `#96bc4b` | `deltaWP <= 2.0%` |
| **Good** | `✓` | `#99a83d` | `2.0% < deltaWP <= 5.0%` |
| **Inaccuracy** | `?!` | `#e58f2a` | `5.0% < deltaWP <= 12.0%` |
| **Mistake** | `?` | `#e65e2b` | `12.0% < deltaWP <= 25.0%` |
| **Miss** | `X` | `#ca3431` | `deltaWP >= 15.0%` in a winning position (`wpBest >= 55%`) immediately after opponent error (`>= 18.0%`), excluding extreme blunders |
| **Blunder** | `??` | `#fa412d` | `deltaWP > 25.0%` or decisive evaluation / mate collapse |

---

## Getting Started

### Prerequisites
- Node.js 20+ (CI uses Node 22)
- npm

### Local Development (Full-Stack Mode)

```bash
npm install
npm run dev
```

Open http://localhost:3000. `next.config.mjs` serves `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` headers automatically so Chrome uses multi-threaded Stockfish WASM.

To enable live Google Gemini move commentary on the server (`POST /api/explain`), create `.env.local`:

```bash
GEMINI_API_KEY=your_google_gemini_api_key
```

Without `GEMINI_API_KEY`, all move commentary and game recaps run locally via the deterministic offline coach (`src/lib/ai/offline-coach.ts`).

### Production & Static GitHub Pages Builds

```bash
# Full-stack Next.js server build (with /api/chesscom, /api/explain, /api/openings)
npm run build
npm start

# Static export build for GitHub Pages (outputs ./out with /chess-analysis basePath)
npm run build:pages
```

Pushes to `main` trigger [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml), which verifies lint, types, and tests before publishing `./out` to GitHub Pages.

---

## Testing & Quality Gates

All test suites run via Vitest (`tests/`), complemented by targeted mutation smoke gates (`scripts/mutation-smoke.mjs`) and full Stryker configuration (`stryker.config.mjs`).

```bash
# Full verification pipeline (lint + typecheck + vitest + 24 smoke mutants + next build)
npm run verify

# Individual checks
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run test:mutate:smoke
npm run test:mutate
```

---

## Stack & Documentation

- **Framework & UI**: Next.js 16 (App Router), React 19, TypeScript 5.8, Tailwind CSS, Lucide React, Recharts, Zustand
- **Chess & Engine**: `chess.js`, `stockfish` 17.1 WASM, `@chess-openings/eco.json`
- **AI**: `@google/genai` (`gemini-2.0-flash`) with schema validation and offline parity
- **Design Specifications**: Detailed architecture, math formulas, UI tokens, and original design specs live in [`docs/`](./docs) (`CHESSCOM_SYSTEM_ARCHITECTURE.md`, `MATHEMATICAL_CLASSIFICATION_SPEC.md`, `AI_COACH_EXPLAINABILITY_ENGINE.md`, `UI_UX_DESIGN_SPEC.md`, `OPENING_CLASSIFIER_SPEC.md`) and [`MASTER_PROMPT.md`](./MASTER_PROMPT.md).
