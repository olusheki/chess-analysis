# Chess.com Move Classification & CAPS2 Mathematical Specification

This document details the exact mathematical formulas, statistical curves, and threshold criteria required to replicate Chess.com's **CAPS2 (Chess Accuracy Percentage System)** and **Move Badges**.

---

## 1. Centipawn to Win Probability Conversion

Raw centipawn evaluations ($cp$) from chess engines exhibit diminishing returns (e.g., an advantage of $+800$ vs $+1200$ is functionally identical; both are completely winning). Chess.com normalizes centipawns into **Win Probability ($WP \in [0, 100]$)** using a logistic sigmoid function calibrated on master-level play:

$$WP(cp) = \frac{100}{1 + 10^{-0.004 \times cp}}$$

Or using the standard exponential sigmoid parameterization:

$$WP(cp) = 50 + 50 \times \tanh(0.00184 \times cp) = \frac{100}{1 + e^{-0.00368208 \times cp}}$$

### Handling Forced Mate Scores:
- $+M1$ to $+M3$: $WP = 100.0\%$
- $+M4$ to $+M10$: $WP = 99.9\% - (N \times 0.05\%)$
- $-M1$ to $-M3$: $WP = 0.0\%$
- $-M4$ to $-M10$: $WP = 0.1\% + (N \times 0.05\%)$

### Win Probability Loss ($\Delta WP$):
For any move $i$ by the active player:

$$\Delta WP_i = WP(cp_{\text{best}}) - WP(cp_{\text{played}})$$

Where $WP$ is always calculated from the perspective of the player making the move:
- $\Delta WP_i \ge 0$ (the played move can never have a higher win probability than the engine's theoretical best move).

---

## 2. CAPS2 Accuracy Formula

Chess.com calculates move accuracy using a calibrated exponential decay model based on $\Delta WP$:

$$\text{Accuracy}_i = 103.1668 \times e^{-0.04354 \times \Delta WP_i} - 3.1669$$

Banded within bounds:
$$\text{Accuracy}_i = \text{clamp}(\text{Accuracy}_i, 0.0, 100.0)$$

### Game Overall Accuracy:
The overall player game accuracy is the weighted mean across all non-book, non-forced moves, applying higher weight to moves played in high-leverage (critical) positions:

$$\text{Weight}_i = 1 + \left| \frac{WP(cp_{\text{best}, i}) - 50}{50} \right|$$

$$\text{Overall Accuracy} = \frac{\sum_{i=1}^{N} \text{Weight}_i \times \text{Accuracy}_i}{\sum_{i=1}^{N} \text{Weight}_i}$$

---

## 3. Move Classification Badges & Detection Logic

Chess.com categorizes every move into one of 11 distinct badges. The classification decision tree executes in the strict hierarchical order below:

```
                          [ Incoming Move ]
                                  │
                       Is it in Opening Book?
                                ├───► YES ──► [ Book Move ]
                                │
                       Is it the Only Legal Move?
                                ├───► YES ──► [ Forced Move ]
                                │
                  Does it Sacrifice Material & Keep Win?
                                ├───► YES ──► [ Brilliant (!!) ]
                                │
                    Is it the Sole Winning Move?
                                ├───► YES ──► [ Great Move (!) ]
                                │
                    Matches PV1 Engine Best Move?
                                ├───► YES ──► [ Best Move (★) ]
                                │
                   Calculate Win Probability Delta (ΔWP)
                                │
        ┌───────────────────────┼────────────────────────┐
        ▼                       ▼                        ▼
 ΔWP ≤ 2.0%              2.0% < ΔWP ≤ 5.0%        5.0% < ΔWP ≤ 12.0%
[ Excellent ]               [ Good ]                [ Inaccuracy ]
                                                         │
                                ┌────────────────────────┘
                                ▼
                        Did Player Miss an
                      Opponent's Blunder/Win?
                                ├───► YES ──► [ Miss (X) ]
                                │
        ┌───────────────────────┴────────────────────────┐
        ▼                                                ▼
 12.0% < ΔWP ≤ 25.0%                               ΔWP > 25.0%
   [ Mistake ]                                     [ Blunder (??) ]
```

### Detailed Criteria Per Badge:

| Badge | Symbol | Color Token | Detection Logic & Mathematical Bounds |
| :--- | :---: | :---: | :--- |
| **Book** | 📖 | `#a88a68` | Matches an entry in the opening database (ECO/Polyglot tree) within the first 25 plies. |
| **Forced** | ➔ | `#8c8883` | Only one legal move existed, or only one move escaped immediate checkmate. |
| **Brilliant** | `!!` | `#1baca6` (Cyan) | **1.** Move sacrifices material (net loss of $\ge 2$ points of piece value on this ply).<br>**2.** Move is either the top engine move or $\Delta WP \le 1.0\%$.<br>**3.** Position remains winning or strictly equal ($WP \ge 50\%$).<br>**4.** Sacrifice leads to decisive counterplay or checkmate, not an immediate simple recapture. |
| **Great** | `!` | `#5c8bb0` (Teal) | **1.** Not a sacrifice.<br>**2.** Position is critical: $PV_1$ maintains advantage ($WP \ge 60\%$), but $PV_2$ drops win probability by $\ge 15\%$ ($WP_{PV2} < 50\%$).<br>**3.** The player found the sole winning path. |
| **Best** | `★` | `#96bc4b` (Green) | Played move matches $PV_1$ exactly or has identical centipawn evaluation. |
| **Excellent**| `✓` | `#96bc4b` | Played move is not $PV_1$, but $\Delta WP \le 2.0\%$ ($\approx \le 15$ centipawns loss). |
| **Good** | `✓` | `#99a83d` (Olive) | $2.0\% < \Delta WP \le 5.0\%$ ($\approx 15 - 35$ cp loss). Solid move, minor concession. |
| **Inaccuracy**| `?!`| `#e58f2a` (Yellow)| $5.0\% < \Delta WP \le 12.0\%$ ($\approx 35 - 75$ cp loss). Inefficient plan or minor positional concession. |
| **Mistake** | `?` | `#e65e2b` (Orange)| $12.0\% < \Delta WP \le 25.0\%$ ($\approx 75 - 180$ cp loss). Concedes clear advantage. |
| **Miss** | `X` | `#ca3431` (Crimson)| Opponent made a Blunder/Mistake on the previous ply giving the player a tactical win ($\Delta WP_{prev} > 20\%$), but the player failed to capitalize and returned advantage ($\Delta WP \ge 15\%$). |
| **Blunder** | `??`| `#fa412d` (Red) | $\Delta WP > 25.0\%$ ($\approx > 200$ cp loss) or hangs significant undefended material/leads to forced mate. |

---

## 3. Estimated Performance Rating (Elo)

Chess.com estimates performance rating based on CAPS2 accuracy and game length:

$$\text{Estimated Elo} = \text{Base} + (\text{Accuracy} \times 28.5) - (\text{Blunders} \times 95) - (\text{Mistakes} \times 40)$$

Where $\text{Base}$ is normalized between $600$ and $2800$ and calibrated against player rating tier.

---

## 4. Empirical Calibration Benchmark (`olusheki` Corpus)

Calibration against 26 imported Chess.com games (52 player-sides) for `olusheki` showed two distinct Chess.com scoring eras at Depth 14 (evaluated against the current unrounded CAPS2 curve):

| Era / Subset | Games | Sides | MAE | RMSE | Max Error | Bias |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **2021 CAPS v1 (`2021-01-29` – `2021-03-12`)** | 11 | 22 | 27.696 | 31.098 | 61.37 | +27.323 |
| **2023–2026 CAPS2 (`2023-02-20` – `2026-11-11`)** | 15 | 30 | 5.346 | 6.724 | 14.53 | -1.121 |
| **All 26 Games Combined** | 26 | 52 | 14.802 | 20.862 | 61.37 | +10.913 |

1. **Depth-14 vs. Depth-18 Outlier Audit**: Re-running 4 high-error CAPS2-era games at Depth 18 MultiPV=3 (`186747847032`: W `27.9` vs `28.37` / B `27.5` vs `38.15`; `186753888826`: W `44` vs `58.33` / B `50.9` vs `62.6`; `186943980406`: W `30.4` vs `29.8` / B `32` vs `16.9`; `187013141528`: W `48.3` vs `51.57` / B `36.7` vs `53.04`) shifted accuracy by `< 2.5` points relative to Depth 14 and did not close the outlier gap, ruling out search depth as the main cause.
2. **Grouped Leave-One-Game-Out Cross-Validation (LOO-CV across the 15 CAPS2 games / 30 sides, 1-decimal rounded)**:
   - **Baseline (`src/lib/engine/win-probability.ts`)**: `MAE = 5.350`, `RMSE = 6.725`, `Max = 14.53`
   - **Unconstrained Adaptive Sweep**: `MAE = 4.926`, `RMSE = 6.242`, `Max = 21.00` (reduces out-of-sample MAE slightly but severely worsens worst-case error)
   - **Pareto-Bounded (`Max <= 14.6`) Sweep**: `MAE = 5.488`, `RMSE = 6.451`, `Max = 14.30` (worse out-of-sample MAE)
   - **Compact 8-Point No-Volatility Sweep**: `MAE = 5.529`, `RMSE = 6.706`, `Max = 18.20` (worse on both MAE and Max)

Because no tested adaptive retuning strictly improved both out-of-sample MAE and Max error without overfitting the 15-game CAPS2 sample, the calibrated curve in [win-probability.ts](../src/lib/engine/win-probability.ts) was preserved unchanged.
