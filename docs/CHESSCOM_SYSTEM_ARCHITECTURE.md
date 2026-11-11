# Chess.com Game Review: Reverse-Engineered System Architecture

This document provides a comprehensive, production-grade architectural specification for building an authentic 1:1 replica of **Chess.com's Game Review & Analysis System**.

---

## 1. High-Level System Architecture

A true 1:1 clone of Chess.com Game Review cannot rely on a pure Large Language Model (LLM) alone. LLMs suffer from severe hallucinations when calculating legal chess positions, calculating centipawn evaluations, and tracing multi-move tactical trees.

Instead, the system employs a **Three-Tier Hybrid Engine Pipeline**:

```
 ┌─────────────────────────────────────────────────────────────┐
 │                         INPUT LAYER                         │
 │  • Chess.com Username Fetcher (REST API: /pub/player/games) │
 │  • PGN String / FEN Sequence / Move Timestamps / Player IDs │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │              TIER 1: DETERMINISTIC ENGINE CORE              │
 │  • Stockfish 16/17 (WASM multi-threaded or Server Cluster)   │
 │  • Deep Multi-PV Analysis (PV1, PV2, PV3) @ Depth 18-22     │
 │  • Centipawn (cp) & Forced Mate (#N) evaluations            │
 │  • Opening Book Matcher (ECO + 4,000+ Named Opening Lines)   │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │            TIER 2: CLASSIFICATION & TACTICS ENGINE          │
 │  • Win Probability Transformation (Sigmoid curve)           │
 │  • CAPS2 Accuracy Metric Calculation (0.0% - 100.0%)        │
 │  • Move Badge Classification Engine:                        │
 │    (Brilliant, Great, Best, Excellent, Good, Book,          │
 │     Inaccuracy, Mistake, Miss, Blunder, Forced)             │
 │  • Rule-Based Tactical Pattern Detector:                   │
 │    Hanging piece, Fork, Pin, Skewer, Discovery, Trapped,    │
 │    Deflection, Overloaded Defender, Mate Threat, King Safety│
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │            TIER 3: AI COACH NATURAL LANGUAGE SYNTHESIS       │
 │  • LLM Grounding Pipeline (Gemini 2.0 / 1.5 Flash via API)  │
 │  • Grounded Context Injection: Engine best line + user move  │
 │    + tactical tags + eval delta + game phase + piece role   │
 │  • Persona & Voice: Friendly, educational, constructive     │
 │  • Game Overview Storyline & Key Moments Summary            │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │                      TIER 4: CLIENT UI/UX                   │
 │  • Chess.com Visual Replica (Dark Theme: #312e2b, #262522)  │
 │  • Interactive Canvas/SVG Board with Arrows & Badges        │
 │  • Real-time Eval Bar with cubic easing & gradient fills    │
 │  • Advantage / Eval Timeline Chart                          │
 │  • Move-by-Move Review Carousel & "Retry Blunder" Mode      │
 └─────────────────────────────────────────────────────────────┘
```

---

## 2. Component Breakdown

### 2.1 Engine Evaluation Tier (Stockfish Integration)
- **Engine**: Stockfish 16 or 17 compiled to WebAssembly (WASM) with SIMD and SharedArrayBuffer multi-threading for client-side evaluation, with an optional Python/FastAPI fallback server using native UCI binaries (`python-chess`).
- **Evaluation Parameters**:
  - `Hash`: 64MB - 256MB.
  - `Threads`: `navigator.hardwareConcurrency` (up to 4 threads client-side).
  - `MultiPV`: 3 lines (essential to determine whether an alternative move was equally viable, or if the chosen move was a uniquely brilliant sacrifice).
  - `Target Depth`: 18 to 22 half-moves (plies). Quick mode: depth 16; Deep review: depth 22+.
- **Data Extracted Per Ply**:
  1. Top 3 Principal Variations ($PV_1, PV_2, PV_3$).
  2. Numerical evaluation (Centipawns relative to player or absolute).
  3. Mate scores (`+M3`, `-M1`).
  4. Best engine move in SAN and UCI formats.

### 2.2 Mathematical Classification Tier
Converts raw engine centipawns into human-meaningful win percentages, scores overall accuracy, and assigns badge ratings (Brilliant, Great, Best, Excellent, Good, Book, Inaccuracy, Mistake, Miss, Blunder, Forced). *(Detailed formulas in `docs/MATHEMATICAL_CLASSIFICATION_SPEC.md`)*.

### 2.3 Rule-Based Tactical Heuristics Engine
Before calling the LLM, a fast deterministic board-state comparator (`TacticalAnalyzer`) inspects the position before and after the move:
- **Material Deltas**: Checks whether a piece was sacrificed, captured, or left undefended ("hanging").
- **Attacking Geometries**: Calculates rays and squares controlled to identify pins (absolute/relative), forks (double attacks on higher or undefended pieces), skewers, and discovered attacks.
- **Escape Square Count**: Counts defender moves and king flight squares to detect trapped pieces or mating nets.
- **King Safety & Pawn Structure**: Evaluates king exposure, open files towards the king, pawn breaks, passed pawns, and isolated/doubled pawns.
- **Development & Center Control**: Recognizes opening moves that stake claim to center squares ($d4, e4, d5, e5$), activate knights/bishops, or execute castling.

### 2.4 AI Coach Explainability Pipeline
- **Role**: Translate the structured technical analysis (e.g., `move: Nd5`, `tag: FORK_QUEEN_ROOK`, `pv: 1... Qd8 2. Nxc7+`, `eval_delta: +280cp`) into natural, intuitive chess coaching.
- **Provider**: Google Gemini API (`gemini-2.0-flash` or `gemini-1.5-flash` for low-latency streaming and high accuracy).
- **Format**: Structured JSON output including:
  - `short_comment`: 1 punchy sentence for the move badge (e.g., *"You fork White's Queen and Rook, winning decisive material."*).
  - `detailed_explanation`: 2-3 sentences explaining the tactical or strategic reason.
  - `alternative_explanation`: Explanation of why the engine's suggested move is superior if the player made an error.
  - `threat_analysis`: What opponent threat was overlooked or neutralised.
- **Coach Persona**: Supportive, empathetic coach avatar (resembling Chess.com's "Coach Danny" or custom avatars like "Grandmaster Sage").

### 2.5 Front-End Presentation Tier
- **Modern Web Stack**: Next.js 14+ / React 18, Tailwind CSS, Zustand for reactive state management, Lucide Icons, and Canvas/SVG rendering.
- **Board Engine**: Custom responsive board supporting Chess.com themes (Standard Green `#769656` / `#eeeed2`, Wood, 8-Bit, Glass) and piece sets (Neo, Classic, Alpha, Game Room).
- **Visual Overlays**:
  - Color-coded badges pinned to destination squares (`!!`, `!`, `★`, `✓`, `?!`, `?`, `X`, `??`).
  - Animated directional SVG arrows with dynamic thickness and opacity.
  - Highlighted square rings / halos indicating source and destination.
- **Review Bar & Graph**:
  - Vertical dynamic evaluation bar with white/black advantage fill.
  - Interactive evaluation chart (SVG/Recharts) tracking the game trajectory, phase dividers (Opening, Middlegame, Endgame), and clickable blunder blips.
