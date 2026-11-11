# Chess.com UI/UX & Visual Component Specification

This document provides exact color codes, dimensions, component hierarchies, and visual asset guidelines to achieve an authentic 1:1 visual clone of **Chess.com's Game Review interface**.

---

## 1. Color Palette & Design Tokens

Chess.com uses a signature dark charcoal theme paired with high-contrast board themes:

| UI Element | CSS Variable / Token | Hex Value | Usage |
| :--- | :--- | :--- | :--- |
| **App Background** | `--bg-charcoal` | `#312e2b` | Page root and outer wrapper |
| **Sidebar Background** | `--bg-panel` | `#262522` | Right analysis sidebar and cards |
| **Card / Surface** | `--bg-surface` | `#21201d` | Coach speech bubbles, modal popups |
| **Border / Divider** | `--border-subtle` | `#3d3b38` | Card dividers, move list borders |
| **Text Primary** | `--text-primary` | `#ffffff` | Headings, active moves, coach titles |
| **Text Muted** | `--text-muted` | `#9e9c98` | Inactive moves, engine PV text, labels |
| **Board Light Square**| `--sq-light` | `#eeeed2` | Standard Chess.com light wood/vinyl square |
| **Board Dark Square** | `--sq-dark` | `#769656` | Standard Chess.com forest green square |
| **Highlight Move Start**| `--hl-start` | `rgba(247, 247, 105, 0.45)` | Yellow semi-transparent square tint |
| **Highlight Move Dest** | `--hl-dest` | `rgba(247, 247, 105, 0.70)` | Yellow highlight on destination square |

---

## 2. Move Badge Design Tokens

Every move badge rendered on the board (destination square top-right corner) and inside the sidebar follows these standardized tokens:

```
┌─────────────────┬──────────┬─────────────┬───────────┐
│ Badge Name      │ Glyphs   │ Fill Color  │ Text/Icon │
├─────────────────┼──────────┼─────────────┼───────────┤
│ Brilliant       │ !!       │ #1baca6     │ White     │
│ Great           │ !        │ #5c8bb0     │ White     │
│ Best            │ ★        │ #96bc4b     │ White     │
│ Excellent       │ ✓        │ #96bc4b     │ White     │
│ Good            │ ✓        │ #99a83d     │ White     │
│ Book            │ 📖       │ #a88a68     │ White     │
│ Inaccuracy      │ ?!       │ #e58f2a     │ Black     │
│ Mistake         │ ?        │ #e65e2b     │ White     │
│ Miss            │ X        │ #ca3431     │ White     │
│ Blunder         │ ??       │ #fa412d     │ White     │
│ Forced          │ ➔        │ #8c8883     │ White     │
└─────────────────┴──────────┴─────────────┴───────────┘
```

- **Badge Dimensions on Board**: 24px × 24px circular badge placed at `top: -4px; right: -4px` of the destination square with drop-shadow `0 2px 4px rgba(0,0,0,0.4)`.

---

## 3. Board Annotation & Arrow System

Arrows are drawn dynamically over the board using an SVG overlay layer (`pointer-events: none`):

### 3.1 Arrow Categories:
- **Best Move Arrow (Green)**: `#96bc4b`, opacity: 0.85, width: 14px, triangular arrowhead.
- **Player Blunder Arrow (Red)**: `#fa412d`, opacity: 0.85, width: 14px.
- **Alternative / Engine Line Arrow (Blue)**: `#5c8bb0`, opacity: 0.80, width: 12px.
- **Tactical Threat / Defense Arrow (Yellow)**: `#f1b332`, opacity: 0.75, width: 10px.

### 3.2 Arrow Geometry Algorithm:
Arrows must calculate the geometric vector from the center of square `A` $(x_1, y_1)$ to the center of square `B` $(x_2, y_2)$:
- For straight or diagonal moves: single SVG `<path>` with `marker-end="url(#arrowhead)"`.
- For Knight moves (L-shape): 2-segment path (`M x1 y1 L x1 y2 L x2 y2` or bend corner with border-radius curve) to recreate Chess.com's signature bent knight arrow.

---

## 4. Evaluation Bar (Left Edge)

- **Dimensions**: Width: 28px, Height: 100% of chessboard height, positioned immediately to the left of column 'a'.
- **Fill Mechanics**:
  - Top half: White (`#ffffff`), Bottom half: Black (`#312e2b`).
  - White winning: White bar expands downward.
  - Black winning: Black bar expands upward.
  - Height percentage formula:
    $$h_{\text{white}} = \text{clamp}(50 + 50 \times \tanh(0.00184 \times cp), 3\%, 97\%)$$
  - Forced mate: 100% or 0% with label `M3` or `-M2`.
- **Numeric Label**: Shows signed evaluation (e.g., `+1.8`, `-0.4`, `M1`). White text on black background when Black leads; black text on white background when White leads.
- **Animation**: CSS `transition: height 350ms cubic-bezier(0.4, 0, 0.2, 1)`.

---

## 5. Evaluation Timeline Graph

Positioned below or alongside the game summary:
- **X-Axis**: Move numbers ($1, 2, 3, \dots, N$).
- **Y-Axis**: Advantage scale centered at 0.0 (-10 to +10 pawn units clamped).
- **Curve**: Smooth cubic bezier spline (`recharts` `<AreaChart>` with gradient fill: white gradient above 0, dark gray gradient below 0).
- **Blunder & Mistake Markers**: Clickable red dots (`??`) and orange dots (`?`) plotted directly at the move vertex on the graph; clicking jumps the review to that exact ply.
- **Phase Dividers**: Vertical dotted lines demarcating the Opening, Middlegame, and Endgame transitions.

---

## 6. Review Sidebar Structure & Flow

The right sidebar is organized into three primary tabs:

```
┌────────────────────────────────────────────────────────┐
│  [ Review ]           [ Analysis ]           [ Moves ] │
├────────────────────────────────────────────────────────┤
│  CAPS2 Accuracy Header:                                │
│    White: 88.4% [Player 1]     Black: 74.2% [Player 2] │
│  Estimated Elo: 1650 vs 1350                           │
├────────────────────────────────────────────────────────┤
│  COACH SPEECH CARD:                                    │
│  ┌──────────────────────────────────────────────────┐  │
│  │ [Coach Danny Avatar]                             │  │
│  │ "Inaccuracy. You missed a chance to pin the      │  │
│  │  White Queen to the King with Bg4."              │  │
│  │                                                  │  │
│  │ [ 🔄 Retry Move ]       [ 👁 Show Best Move ]    │  │
│  └──────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────┤
│  MOVE CLASSIFICATION BREAKDOWN:                        │
│    Brilliant (!!)  : 1 vs 0                            │
│    Great (!)       : 2 vs 1                            │
│    Best (★)        : 14 vs 10                          │
│    Mistakes (?)    : 2 vs 4                            │
│    Blunders (??)   : 1 vs 3                            │
├────────────────────────────────────────────────────────┤
│  NAVIGATION CONTROLS:                                  │
│   [ |<< ]   [ < ]   [ Next Key Moment ]   [ > ]  [ >>| ]│
└────────────────────────────────────────────────────────┘
```

### Navigation Button Functionality:
- `|<<`: Jump to opening starting position (ply 0).
- `<`: Step backward 1 ply.
- `>`: Step forward 1 ply.
- `>>|`: Jump to final move of the game.
- `Next Key Moment`: Intelligently seeks forward to the next Brilliant, Great, Miss, Mistake, or Blunder move.
- `Retry Move`: Clears the played move on the board and enters interactive puzzle mode, prompting the user: *"Can you find the best move?"*
- `Show Best Move`: Displays the engine's suggested arrow and plays out the 3-ply principal variation on the board.
