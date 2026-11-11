# ♟️ Chess.com Game Review & AI Coach 1:1 Engine

A production-grade reverse-engineered specification, mathematical framework, reference code, and **Master AI Prompt** to build an authentic **1:1 copy of Chess.com's Game Review & AI Coach Analysis System**.

---

## 🌟 What This Repository Contains

1. **[MASTER_PROMPT.md](./MASTER_PROMPT.md)**:
   The ultimate comprehensive prompt designed to be fed into any advanced AI coding assistant (Cursor, Google Gemini, Claude, Antigravity) to build the entire system from scratch with zero missing details.

2. **Full Technical Architecture & Specifications (`docs/`)**:
   - **[CHESSCOM_SYSTEM_ARCHITECTURE.md](./docs/CHESSCOM_SYSTEM_ARCHITECTURE.md)**: 4-tier hybrid pipeline (Stockfish WASM + Tactical Tagger + Gemini API + Front-End).
   - **[MATHEMATICAL_CLASSIFICATION_SPEC.md](./docs/MATHEMATICAL_CLASSIFICATION_SPEC.md)**: Exact Win Probability conversion ($WP$), CAPS2 Accuracy formulas, and decision tree for all 11 badges (Brilliant, Great, Best, Excellent, Good, Book, Inaccuracy, Mistake, Miss, Blunder, Forced).
   - **[AI_COACH_EXPLAINABILITY_ENGINE.md](./docs/AI_COACH_EXPLAINABILITY_ENGINE.md)**: Grounded LLM pipeline that prevents hallucinations, tactical feature tagging, and coach persona mechanics.
   - **[UI_UX_DESIGN_SPEC.md](./docs/UI_UX_DESIGN_SPEC.md)**: Authentic Chess.com color palette, SVG arrows (including L-shape knight arrows), dynamic vertical evaluation bar, and advantage timeline chart.
   - **[OPENING_CLASSIFIER_SPEC.md](./docs/OPENING_CLASSIFIER_SPEC.md)**: ECO code tree, opening variation recognition, and transposition handling.

3. **Core TypeScript Reference Implementations (`src/lib/`)**:
   - `src/lib/api/chesscom-api.ts`: Direct integration with Chess.com's public REST API to fetch player profiles, monthly archives, and recent games by username without an API key.
   - `src/lib/engine/win-probability.ts`: Sigmoid win probability conversion, CAPS2 move accuracy, weighted harmonic game accuracy, and Elo performance estimation.
   - `src/lib/analysis/move-classifier.ts`: 11-badge classification hierarchy with priority resolution (Brilliant sacrifices, Great sole winning moves, Misses, Blunders).
   - `src/lib/analysis/tactical-tagger.ts`: Deterministic board inspector detecting hanging pieces, forks, pins, skewers, checks, castling, and piece development.
   - `src/lib/ai/gemini-coach.ts`: Official Google Gemini API integration using Structured Outputs (`@google/genai`) to generate coach speech cards with offline fallbacks.

---

## 📐 The 11 Move Badges Recreated

| Badge | Symbol | Color | Classification Trigger |
| :--- | :---: | :---: | :--- |
| **Book** | 📖 | `#a88a68` | Matches known opening line in ECO database |
| **Forced** | ➔ | `#8c8883` | Only 1 legal move existed |
| **Brilliant** | `!!` | `#1baca6` | Sound material sacrifice ($\ge 2$ pawns) retaining winning/equal eval ($WP \ge 50\%$) |
| **Great** | `!` | `#5c8bb0` | Critical position where only $PV_1$ keeps the win and all alternatives lose |
| **Best** | `★` | `#96bc4b` | Exact match with Stockfish top choice ($PV_1$) |
| **Excellent**| `✓` | `#96bc4b` | Minimal win probability loss ($\Delta WP \le 2.0\%$) |
| **Good** | `✓` | `#99a83d` | Minor inaccuracy ($2.0\% < \Delta WP \le 5.0\%$) |
| **Inaccuracy**| `?!`| `#e58f2a` | Suboptimal play ($5.0\% < \Delta WP \le 12.0\%$) |
| **Mistake** | `?` | `#e65e2b` | Significant conceded advantage ($12.0\% < \Delta WP \le 25.0\%$) |
| **Miss** | `X` | `#ca3431` | Failed to punish an opponent's previous blunder ($\Delta WP \ge 15.0\%$) |
| **Blunder** | `??`| `#fa412d` | Game-deciding catastrophic error ($\Delta WP > 25.0\%$) or hanging full pieces |

---

## 🚀 How to Use the Master Prompt

1. Open your AI agent or IDE (e.g. Google Gemini, Cursor, Claude 3.7 Sonnet).
2. Copy the entire contents of **[MASTER_PROMPT.md](./MASTER_PROMPT.md)**.
3. Paste it into the chat window and press Enter.
4. The agent will initialize Next.js 14, install the dependencies, wire up Stockfish WASM, and connect the Gemini API.

---

## 🛠️ Tech Stack Overview

- **Frontend**: Next.js 14 (App Router), Tailwind CSS, Lucide React, Recharts.
- **Engine**: Stockfish 16/17 WASM with MultiPV worker support.
- **Chess Rules & Parsing**: `chess.js`.
- **AI Coach**: Google Gemini API (`gemini-2.0-flash` / `gemini-1.5-flash`) via `@google/genai`.
- **State Management**: Zustand.

---

## 📦 Setting Up on GitHub

```bash
# 1. Initialize git (already completed in this repo)
git init

# 2. Add remote repository URL
git remote add origin https://github.com/YOUR_USERNAME/chess-analysis.git

# 3. Push to GitHub
git branch -M main
git push -u origin main
```
