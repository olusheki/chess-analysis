# AI Coach & Explainability Engine Specification

This document defines the AI Coach system that delivers Chess.com-style move explanations, blunder diagnostics, opening insights, and game recaps using a hybrid **Deterministic Feature Extractor + Google Gemini API**.

---

## 1. The Explainability Problem & Hybrid Solution

LLMs cannot calculate chess variations reliably in their latent space. Asking an LLM *"Why is Nxe5 better than d4?"* without engine ground truth leads to phantom pieces and false tactical claims.

### The Grounded Explainability Pipeline:

```
[ Board State (FEN) ] ──► [ Stockfish Engine ] ──► Evaluation (+2.4) & Best Line (1. Nxe5 d6 2. Nf3)
          │
          ▼
[ Rule-Based Tactical Tagger ]
  ├── Material Hang Detector (e.g. "Rook on a8 unguarded")
  ├── Pin / Fork / Skewer Detector (e.g. "Knight forks Queen & King")
  ├── Opening Classifier (e.g. "Sicilian Defense: Najdorf Variation")
  └── Development Tagger (e.g. "Develops minor piece & readies O-O")
          │
          ▼
[ Structured Grounding Payload ] ──► [ Gemini 2.0 / 1.5 Flash API ]
                                            │
                                            ▼
                             [ Rich Coach Commentary Card ]
                             • Badge: Mistake (?)
                             • Short Comment: "This allows White to win your Rook."
                             • Tactical Insight: "Your Rook on a8 was left undefended..."
                             • Best Move Alternative: "Nd7 would have guarded the back rank."
                             • Interactive Refutation Line: [2... Rxa8 3. Qxf7+]
```

---

## 2. Rule-Based Tactical & Positional Tagger

Before invoking the LLM, the TypeScript/Python backend computes deterministic boolean tags for the move:

### 2.1 Tactical Tags
- `HANGING_PIECE`: Piece moved to or left on an attacked square with zero defenders, or defenders < attackers.
- `TACTICAL_FORK`: Moved piece attacks two or more enemy pieces of equal or higher value simultaneously.
- `ABSOLUTE_PIN`: Enemy piece pinned to the King along an active ray.
- `RELATIVE_PIN`: Enemy piece pinned to the Queen or Rook.
- `SKEWER`: High-value enemy piece attacked in front of a lower-value piece on the same rank/file/diagonal.
- `DISCOVERED_ATTACK`: Moving a piece unblocks an attack from a friendly piece behind it.
- `CHECKMATE_THREAT`: Move threatens an unstoppable mate in 1 or 2 plies.
- `DEFLECTION`: Move forces a defending piece away from protecting a key square or piece.
- `TRAPPED_PIECE`: Enemy piece has zero safe escape squares.

### 2.2 Strategic & Developing Tags
- `DEVELOPMENT`: Minor piece (N/B) moves off the back rank (ranks 1/8) toward active center squares ($c3, d2, f3, e2$, etc.).
- `CENTER_CONTROL`: Pawn or piece occupies or attacks center squares ($d4, e4, d5, e5$).
- `KING_SAFETY_CASTLE`: Kingside or queenside castling ($O-O$ or $O-O-O$).
- `TEMPO_GAIN`: Moving a piece while attacking an enemy high-value piece (e.g., developing bishop while attacking Queen).
- `PAWN_STRUCTURE`: Creates passed pawn, fixes pawn weakness, or avoids doubled/isolated pawns.

---

## 3. Gemini API Prompt Architecture

### 3.1 System Prompt
```markdown
You are "Coach Danny", an expert, charismatic, and supportive chess master coach inspired by Chess.com's game review coach.
Your job is to explain chess moves to players ranging from beginner (500) to master (2200).

Guidelines:
1. Tone: Encouraging, instructive, clear, and punchy. Never condescending.
2. Accuracy: Ground your explanation STRICTLY in the provided Engine Evaluation, Tactical Tags, and Best Line. NEVER invent moves or hallucinate pieces that do not exist.
3. Brevity: Players want quick, memorable explanations, not walls of text. Keep short comments to 1-2 concise sentences.
4. Explain "Why":
   - If it's a Blunder/Mistake/Miss: State explicitly what was missed or given away (e.g., "This leaves your rook on a8 hanging", "You walked into a knight fork").
   - If it's Generic/Developing: Explain the strategic intent (e.g., "A solid developing move that fights for central control and prepares castling").
   - If it's Best/Great: Explain the key virtue of the move (e.g., "This exerts maximum pressure on the pinned f6 knight").
   - If it's Brilliant: Celebrate the sacrifice! (e.g., "An incredible rook sacrifice that rips open White's king defenses!").
5. Always provide the alternative: Explain why the engine's suggested move is superior when a mistake was made.
```

### 3.2 Structured Output Schema (Zod / JSON Schema)

```typescript
export const MoveExplanationSchema = {
  type: "object",
  properties: {
    badge: {
      type: "string",
      enum: ["Brilliant", "Great", "Best", "Excellent", "Good", "Book", "Inaccuracy", "Mistake", "Miss", "Blunder", "Forced"]
    },
    short_comment: {
      type: "string",
      description: "Punchy 1-sentence coach headline shown directly on the badge card (e.g., 'You hung your queen!' or 'A textbook developing move.')"
    },
    coach_explanation: {
      type: "string",
      description: "2-3 sentences explaining the tactical or strategic mechanics behind this rating."
    },
    best_move_reasoning: {
      type: "string",
      description: "Why the engine's best move was superior (omitted or null if player played Best/Brilliant)."
    },
    variation_title: {
      type: "string",
      description: "Title for the continuation line (e.g., 'Punishment Line' or 'Optimal Continuation')."
    },
    threat_description: {
      type: "string",
      description: "Any active threat created or ignored by this move."
    }
  },
  required: ["badge", "short_comment", "coach_explanation"]
};
```

### 3.3 Sample Payload Sent to Gemini

```json
{
  "move_san": "Qe7",
  "played_by": "Black",
  "move_number": 14,
  "game_phase": "Middlegame",
  "opening_name": "Ruy Lopez: Closed, Chigorin Defense",
  "engine_eval_before": "+0.45",
  "engine_eval_after": "+3.80",
  "eval_delta_wp": 34.2,
  "assigned_badge": "Blunder",
  "tactical_tags": ["HANGING_PIECE", "PIN_EXPLOIT"],
  "hanging_piece_info": { "square": "d7", "piece": "Knight" },
  "engine_best_move": "Nd7",
  "best_move_pv": "14... Nd7 15. d4 exd4 16. cxd4 Bb6",
  "refutation_pv": "15. Bxd7 Qxd7 16. Nxe5 Qd8 17. Nxf7"
}
```

### 3.4 Sample Gemini Output Generated

```json
{
  "badge": "Blunder",
  "short_comment": "You left your knight on d7 hanging!",
  "coach_explanation": "Moving your Queen to e7 removed the defender of your d7 knight. White can immediately capture it with Bxd7, winning a full piece and leaving your king vulnerable.",
  "best_move_reasoning": "14... Nd7 would have defended the piece in place and kept your solid pawn chain intact.",
  "variation_title": "White's Winning Continuation",
  "threat_description": "White threatens 15. Bxd7 winning 3 points of material."
}
```

---

## 4. Game Overview & Recap Synthesis

At the conclusion of the game review, the AI Coach generates a complete **Game Storyline**:

### Overview Schema:
1. **Coach Opening Statement**: Empathetic summary (e.g., *"You played with immense energy in the opening and built a crushing +4.0 advantage, but slipped in the middlegame time scramble. Let's review the critical moments together!"*).
2. **Phase Breakdown**:
   - **Opening**: Opening name, moves in book, accuracy % in phase.
   - **Middlegame**: Tactical accuracy, key turning point move.
   - **Endgame**: Technique evaluation, conversion or defense rating.
3. **Key Moments Carousel**:
   - Up to 5 pivotal moments where the evaluation swung by $\ge 15\% \Delta WP$ (Blunders, Misses, or Brilliant moves).
   - "Retry" interactive puzzle mode where the user is challenged to find the engine's best move.
