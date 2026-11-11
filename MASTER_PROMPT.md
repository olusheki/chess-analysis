# Master Prompt: 1:1 Chess.com Game Review & AI Coach Clone

> **How to use this prompt**: Copy and paste the entire prompt below into an advanced AI coding assistant (e.g. Google Gemini, Claude, Cursor, Antigravity) to scaffold and implement the full-stack system end-to-end.

---

```markdown
You are a Principal Full-Stack Chess Software Architect and AI Engineer. Your objective is to build a complete, high-fidelity, 1:1 replica of Chess.com's signature "Game Review" and "AI Coach Analysis" system.

The application must accurately recreate Chess.com’s visual styling, mathematical evaluation algorithms (CAPS2 accuracy, Win Probability), all 11 move rating badges (including Brilliant and Miss), opening classification, interactive board annotations (SVG arrows and square badge pills), dynamic eval bar, advantage timeline chart, and an AI Coach powered by a hybrid Stockfish 16 WASM + Gemini API explainability pipeline.

---

### 1. TECH STACK REQUIREMENTS
- **Framework**: Next.js 14+ (App Router) with TypeScript.
- **Styling**: Tailwind CSS configured with Chess.com dark theme tokens (`#312e2b`, `#262522`, `#21201d`, `#769656`, `#eeeed2`).
- **Chess Engine**: Stockfish 16/17 compiled to WebAssembly (WASM) with Web Worker multi-threading and SharedArrayBuffer support.
- **Chess Logic**: `chess.js` (for move validation, legal moves, FEN generation, and PGN parsing).
- **AI Explainability**: Google Gemini API (`gemini-2.0-flash` or `gemini-1.5-flash`) utilizing Structured Outputs (JSON Schema) to eliminate hallucination.
- **State Management**: Zustand for reactive review state (current ply, evaluation history, coach card data, puzzle retry state).
- **Charts**: `recharts` for the smooth evaluation timeline curve with blunder blip markers.
- **Icons**: `lucide-react` + authentic Chess.com SVG move badge icons.

---

### 2. CORE ARCHITECTURAL MODULES

#### Module 1: The Hybrid Analysis Engine Pipeline
Do NOT let the LLM calculate chess moves or evaluations. You must implement a three-tiered pipeline:
1. **Tier 1 (Stockfish WASM Worker)**:
   - Evaluates every ply of the game to depth 18-20.
   - Extracts top 3 Principal Variations (`MultiPV = 3`), numerical centipawn eval ($cp$), and mate scores ($M$).
2. **Tier 2 (Deterministic Tactical & Classification Engine)**:
   - Converts centipawns to Win Probability ($WP$) via the calibrated logistic sigmoid:
     $WP(cp) = 100 / (1 + 10^{-0.004 \times cp})$
   - Computes $\Delta WP = WP_{\text{best}} - WP_{\text{played}}$.
   - Calculates CAPS2 accuracy per move:
     $\text{Accuracy} = \text{clamp}(103.1668 \times e^{-0.04354 \times \Delta WP} - 3.1669, 0, 100)$.
   - Evaluates tactical heuristics: detects hanging pieces, forks, pins, skewers, discovered attacks, mate threats, piece development, and center control.
   - Assigns one of 11 official Chess.com move badges according to strict rules:
     * **Book (📖)**: Matches opening database trie.
     * **Forced (➔)**: Sole legal move or sole escape from mate.
     * **Brilliant (!!)**: Sacrifices material ($\ge 2$ pawns value), retains winning/equal evaluation ($WP \ge 50\%$), matches $PV_1$ or $\Delta WP \le 1.0\%$.
     * **Great (!)**: Critical position where $PV_1$ keeps winning ($WP \ge 60\%$) but $PV_2$ drops $\ge 15\%$ ($WP_{PV2} < 50\%$).
     * **Best (★)**: Top engine move ($PV_1$).
     * **Excellent (✓)**: $\Delta WP \le 2.0\%$.
     * **Good (✓)**: $2.0\% < \Delta WP \le 5.0\%$.
     * **Inaccuracy (?!)**: $5.0\% < \Delta WP \le 12.0\%$.
     * **Mistake (?)**: $12.0\% < \Delta WP \le 25.0\%$.
     * **Miss (X)**: Opponent blundered on previous ply ($\Delta WP_{prev} > 20\%$), but player missed the tactical punishment ($\Delta WP \ge 15\%$).
     * **Blunder (??)**: $\Delta WP > 25.0\%$ or hangs decisive material/mate.
3. **Tier 3 (AI Coach via Gemini API)**:
   - Ingests the structured tactical tags, eval deltas, played move, and best line.
   - Returns a structured JSON commentary object with a punchy 1-sentence headline and 2-sentence tactical explanation grounded 100% in fact.

---

### 3. THE AI COACH VOICE & EXPLAINABILITY ENGINE

#### Coach Persona ("Coach Danny" / Mascot Avatar):
- Tone is pedagogical, supportive, encouraging, and clear.
- Explains **WHY** a move is rated the way it is:
  - If Blunder/Mistake: "You left your Rook on a8 hanging! White captures with 15. Bxa8 winning 5 points of material."
  - If Generic/Developing: "A solid developing move that activates your knight toward the center and prepares kingside castling."
  - If Miss: "You missed a winning tactic! 18. Qh5+ would have forked King and Bishop."
  - If Brilliant: "A stunning piece sacrifice that shatters Black's king shelter and sets up an unstoppable mating net!"
- Provides **"How it could play out"**:
  - Exposes the engine's best continuation line with an interactive "Show Moves" button.
  - Generates interactive "Retry" puzzle mode allowing the user to attempt to find the best move on the board after making a blunder.

#### Game Overview & Storyline Generator:
- Creates an empathetic summary of the game:
  *"You played an outstanding opening and established a +3.2 advantage, but slipped in the middlegame under time pressure. Let's work on tactical awareness together!"*
- Summarizes performance across Opening, Middlegame, and Endgame.
- Displays the CAPS2 score comparison (e.g. 88.4% vs 72.1%) and estimated Elo ratings.

---

### 4. UI/UX & VISUAL REPLICA REQUIREMENTS

The UI must look identical to Chess.com's modern Game Review interface:
1. **Layout**:
   - Left: Vertical dynamic Evaluation Bar (width 28px, animated with cubic easing, +X.X label).
   - Center: High-contrast 8x8 Chessboard with coordinates inside/outside squares, highlighting previous move in yellow tint (`rgba(247, 247, 105, 0.45)`).
   - Destination Square Badge: Circular badge icon pinned to the top-right corner of the played piece's destination square (e.g., cyan `!!` or red `??`).
   - SVG Arrows Layer:
     - Green arrow (`#96bc4b`) for Best Move.
     - Red arrow (`#fa412d`) for Player Blunder.
     - Blue arrow (`#5c8bb0`) for Alternative Engine Line.
     - Bent L-shape arrow algorithm for Knight moves.
2. **Right Sidebar**:
   - Header with player avatars, names, rating, and CAPS2 accuracy percentages.
   - Move badge summary table (Brilliant count, Great count, Best count, etc.).
   - Coach Card with friendly mascot avatar, badge title pill, short comment, detailed explanation, "Retry" button, and "Show Best Move" button.
   - Interactive Advantage Timeline Area Chart with blunder markers (`??`).
   - Navigation Controller:
     - Jump to Start (`|<<`)
     - Previous Move (`<`)
     - Next Key Moment / Big Moment (advances straight to next blunder/brilliant move)
     - Next Move (`>`)
     - Jump to End (`>>|`)
     - Flip Board button.

---

### 5. PROMPT EXECUTION & CODE SCAFFOLDING PLAN

When implementing this codebase, proceed systematically through the following file architecture:

```
src/
├── app/
│   ├── page.tsx                           // Main Game Review dashboard & PGN loader
│   ├── api/
│   │   ├── explain/route.ts               // Gemini API proxy for move & game explanation
│   │   └── openings/route.ts              // ECO opening lookup
├── components/
│   ├── chess/
│   │   ├── Chessboard.tsx                 // Interactive board with square highlights
│   │   ├── BoardOverlays.tsx              // SVG Arrow rendering & square badge badges
│   │   ├── EvalBar.tsx                    // Vertical dynamic evaluation bar
│   │   └── EvalGraph.tsx                  // Recharts advantage timeline with blunder pins
│   ├── review/
│   │   ├── CoachCard.tsx                  // Mascot avatar speech bubble & retry controls
│   │   ├── AccuracyHeader.tsx             // CAPS2 score & estimated Elo display
│   │   ├── MoveBadgeSummary.tsx           // Move category count comparison table
│   │   ├── MoveListReview.tsx             // Move history with badge pills
│   │   └── NavigationBar.tsx              // |<<, <, Next Key Moment, >, >>|
├── lib/
│   ├── engine/
│   │   ├── stockfish-worker.ts            // Web Worker wrapper for Stockfish WASM
│   │   ├── engine-evaluator.ts            // MultiPV analysis queue
│   │   └── win-probability.ts             // Sigmoid math & CAPS2 formulas
│   ├── analysis/
│   │   ├── move-classifier.ts             // 11-badge classification hierarchy
│   │   ├── tactical-tagger.ts             // Rule-based hang/fork/pin/skewer detection
│   │   └── opening-book.ts                // ECO trie matcher & book moves
│   ├── ai/
│   │   ├── gemini-coach.ts                // Grounded Gemini prompting & JSON parser
│   │   └── coach-personas.ts              // Coach tone presets & speech templates
│   └── store/
│       └── useReviewStore.ts              // Zustand central analysis state store
```

### 6. ACCEPTANCE TESTS FOR COMPLETION
1. **Engine Accuracy**: Test against known PGN games (e.g. Kasparov vs Topalov 1999) to verify Brilliant moves are awarded to sound sacrifices (e.g., 24. Rxd4!!).
2. **Explainability Grounding**: Confirm every blunder explanation accurately names the hung piece or tactical theme, with zero hallucinated coordinates.
3. **Responsive Parity**: Ensure the board, eval bar, and sidebar adjust seamlessly across desktop and tablet viewport widths.
4. **Git Version Control**: Initialize a git repository with clean commit messages for each architectural tier.

Proceed now to construct this system step-by-step with production-grade TypeScript, robust error handling, and clean code documentation.
```
