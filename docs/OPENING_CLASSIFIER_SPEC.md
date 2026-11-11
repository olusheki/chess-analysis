# Opening Classification & Book Moves Specification

This document defines how the system identifies, classifies, and explains chess openings, variations, and book moves.

---

## 1. Opening Database & ECO Structure

To replicate Chess.com's instantaneous opening identification:
- **ECO Codes**: Complete coverage of codes $A00$ through $E99$.
- **Dataset Source**: Standard Lichess / Chess.com open-source ECO taxonomy containing over 4,500 distinct lines and variations.
- **Data Model**:
  ```typescript
  export interface OpeningEntry {
    eco: string;              // e.g. "B90"
    name: string;             // e.g. "Sicilian Defense"
    variation?: string;       // e.g. "Najdorf Variation"
    moves_san: string[];      // e.g. ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"]
    fen: string;              // Normalized FEN without move counters
    description: string;      // The strategic ideas and goals for both colors
  }
  ```

---

## 2. Transposition Matching Algorithm

Openings in chess can often be reached via multiple move orders (transpositions). For example:
- Move order A: `1. d4 Nf6 2. c4 e6 3. Nf3 d5` (Queen's Gambit Declined)
- Move order B: `1. c4 e6 2. d4 d5 3. Nf3 Nf6` (English Opening transposing into QGD)

### Matching Logic:
1. **FEN Prefix Trie Search**: Maintain a trie of known opening positions indexed by normalized FEN strings (`pieces`, `active_color`, `castling_rights`, `en_passant`).
2. At every ply $0 \le t \le 30$:
   - Query the current board FEN in the Opening Trie.
   - If a match exists:
     - Mark current move as `Book Move` (`📖`).
     - Update active display: `[ECO] Opening Name: Variation`.
   - If the player deviates from all known opening branches:
     - The move that leaves the book is evaluated as the first non-book move and receives its regular badge (`Best`, `Inaccuracy`, `Mistake`, etc.).
     - Coach card announces: *"Out of book. You entered novel territory on move 8."*

---

## 3. Pedagogical Opening Explanations

For every major opening, the system maintains a structured library of strategic tenets that the AI Coach draws from:

| Opening Name | Strategic Purpose & Coach Note |
| :--- | :--- |
| **Italian Game** (`1. e4 e5 2. Nf3 Nc6 3. Bc4`) | White develops the bishop to an active diagonal targeting the vulnerable f7 square, readying kingside castling while contesting the center. |
| **Sicilian Defense** (`1. e4 c5`) | Black fights for the center symmetrically using a flank pawn, leading to sharp, imbalanced play with counterplay on the c-file. |
| **Queen's Gambit** (`1. d4 d5 2. c4`) | White offers a wing pawn to entice Black away from the center, aiming to construct an imposing central pawn duo with e4. |
| **French Defense** (`1. e4 e6 2. d4 d5`) | Black immediately challenges White's e4 pawn from a protected foundation, willing to accept a cramped light-squared bishop for counterattacks on White's pawn chain. |
| **King's Indian Defense** (`1. d4 Nf6 2. c4 g6`) | Black plays hypermodern chess, allowing White to occupy the center before launching a fierce kingside pawn storm with ...f5. |
