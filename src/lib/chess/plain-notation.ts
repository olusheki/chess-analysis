/**
 * Deterministic Chess Notation -> Plain English Substitution Utility
 * Converts SAN, long algebraic, and coordinate moves into readable plain English
 * for Coach explanations while preserving square references in prose.
 */

const PIECE_NAMES: Record<string, string> = {
  K: "king",
  Q: "queen",
  R: "rook",
  B: "bishop",
  N: "knight",
};

function capitalizeFirst(text: string): string {
  if (!text) return text;
  return text[0].toUpperCase() + text.slice(1);
}

function isSentenceBoundary(before: string): boolean {
  const trimmed = before.replace(/\s+$/, "");
  if (!trimmed) return true;
  const lastChar = trimmed[trimmed.length - 1];
  if (lastChar === "!" || lastChar === "?") return true;
  if (lastChar !== ".") return false;
  // Move prefixes like "1.", "24.", "5..." are not sentence boundaries, whereas "+6.4." is.
  if (/(?:^|[^\d.])\d+\.{1,3}$/.test(trimmed)) {
    return false;
  }
  return true;
}

const SQUARE_CONTEXT_RE =
  /\b(?:on|at|to|from|in|into|onto|toward|towards|near|via|over|across|along|around|past|between|beyond|behind|through|squares?|targets?|targeting|controls?|controlling|controlled|defends?|defending|defended|attacks?|attacking|attacked|protects?|protecting|protected|guards?|guarding|guarded|occupies|occupy|occupying|diagonal|diagonals|files?|ranks?|corner|outpost|weakness|weaknesses)\s+$/i;

const CONTINUATION_CONJ_RE = /(?:,\s*|\b(?:and|or)\s+)$/i;

/**
 * Converts a single chess move token (SAN, long SAN, or coordinate UCI) into plain English.
 */
export function sanToPlainEnglish(rawToken: string): string {
  let token = rawToken.trim();
  if (!token) return "";

  let enPassant = false;
  if (/\s+e\.p\.$/i.test(token)) {
    enPassant = true;
    token = token.replace(/\s+e\.p\.$/i, "").trim();
  }

  // Strip NAG annotation symbols like !!, ??, !?, ?!, !, ?
  token = token.replace(/[!?]+$/g, "");

  let suffix = "";
  if (token.endsWith("#")) {
    suffix = " checkmate";
    token = token.slice(0, -1);
  } else if (token.endsWith("+")) {
    suffix = " check";
    token = token.slice(0, -1);
  }
  if (enPassant) {
    suffix += " en passant";
  }

  // Castling
  if (token === "O-O-O" || token === "0-0-0") {
    return `castles queenside${suffix}`;
  }
  if (token === "O-O" || token === "0-0") {
    return `castles kingside${suffix}`;
  }

  // Coordinate / UCI move: e2e4, e2-e4, e7e8q
  const uciMatch = /^([a-h][1-8])-?([a-h][1-8])([qrbnQRBN])?$/.exec(token);
  if (uciMatch) {
    const [, fromSq, toSq, promo] = uciMatch;
    const promoPhrase = promo
      ? ` promotes to ${PIECE_NAMES[promo.toUpperCase()] ?? promo.toLowerCase()}`
      : "";
    return `${fromSq} to ${toSq}${promoPhrase}${suffix}`;
  }

  // Piece move / capture (with optional file, rank, or square disambiguation)
  const pieceMatch = /^([KQRBN])([a-h][1-8]|[a-h]|[1-8])?(-|x)?([a-h][1-8])$/.exec(
    token
  );
  if (pieceMatch) {
    const [, pieceCode, disamb, sep, dest] = pieceMatch;
    const pieceName = PIECE_NAMES[pieceCode];
    const isCapture = sep === "x";

    if (!disamb) {
      return isCapture
        ? `${pieceName} takes ${dest}${suffix}`
        : `${pieceName} ${dest}${suffix}`;
    }

    const action = isCapture ? "takes" : "to";
    if (disamb.length === 2) {
      return `${pieceName} from ${disamb} ${action} ${dest}${suffix}`;
    }
    if (/[a-h]/.test(disamb)) {
      return isCapture
        ? `${disamb}-file ${pieceName} takes ${dest}${suffix}`
        : `${disamb}-file ${pieceName} to ${dest}${suffix}`;
    }
    return isCapture
      ? `rank-${disamb} ${pieceName} takes ${dest}${suffix}`
      : `rank-${disamb} ${pieceName} to ${dest}${suffix}`;
  }

  // Pawn capture (with optional promotion): exd5, axb8=N
  const pawnCapMatch = /^([a-h])x([a-h][1-8])(?:=([QRBN]))?$/.exec(token);
  if (pawnCapMatch) {
    const [, file, dest, promo] = pawnCapMatch;
    const promoPhrase = promo
      ? ` promotes to ${PIECE_NAMES[promo]}`
      : "";
    return `${file}-pawn takes ${dest}${promoPhrase}${suffix}`;
  }

  // Pawn advance / promotion: e4, g8, e8=Q
  const pawnMatch = /^([a-h][1-8])(?:=([QRBN]))?$/.exec(token);
  if (pawnMatch) {
    const [, dest, promo] = pawnMatch;
    const promoPhrase = promo
      ? ` promotes to ${PIECE_NAMES[promo]}`
      : "";
    return `pawn ${dest}${promoPhrase}${suffix}`;
  }

  return rawToken.trim();
}

/**
 * Formats a single move with Plain English first followed by SAN when Plain English mode is active.
 */
export function formatNotationPair(san: string, plainEnglish: boolean): string {
  if (!plainEnglish) return san;
  const plain = sanToPlainEnglish(san);
  if (!plain || plain === san) return san;
  return `${plain} (${san})`;
}

// Single-pass token pattern matching SAN, long SAN, UCI coordinate moves, and mate tags (+M3 / -M2 / M3).
const PROSE_NOTATION_RE =
  /(?<![A-Za-z0-9_-])(?:(?:O-O-O|O-O|0-0-0|0-0)[+#]?(?:!!|\?\?|!\?|\?!)?|[+-]?M[1-9][0-9]*|[KQRBN](?:[a-h][1-8]|[a-h]|[1-8])?[-x]?[a-h][1-8][+#]?(?:!!|\?\?|!\?|\?!)?|[a-h]x[a-h][1-8](?:=[QRBN])?(?:\s+e\.p\.)?[+#]?(?:!!|\?\?|!\?|\?!)?|[a-h][1-8]-?[a-h][1-8][qrbnQRBN]?[+#]?|[a-h][1-8](?:=[QRBN])?[+#]?(?:!!|\?\?|!\?|\?!)?)(?![A-Za-z0-9_=-])/g;

/**
 * Replaces chess notation tokens within natural-language Coach prose with plain English.
 * Preserves square references ("on d7", "from d5", "targets on c7 and f6"), ratings, evals, and usernames.
 */
export function formatCoachProse(text: string): string {
  if (!text) return text;

  let out = "";
  let lastIndex = 0;
  let lastTokenKind: "move" | "square" | null = null;

  PROSE_NOTATION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = PROSE_NOTATION_RE.exec(text)) !== null) {
    const raw = match[0];
    const start = match.index;
    const gap = text.slice(lastIndex, start);

    // Handle mate tag (+M3 / -M2 / M3) cleanly without inverting -M#
    const mateMatch = /^([+-]?)M([1-9][0-9]*)$/.exec(raw);
    if (mateMatch) {
      const mateText =
        mateMatch[1] === "-"
          ? `mate for Black in ${mateMatch[2]}`
          : `mate in ${mateMatch[2]}`;
      out += gap + mateText;
      lastIndex = start + raw.length;
      lastTokenKind = null;
      continue;
    }

    // Bare two-character square [a-h][1-8] can be either a location ("on e3") or a pawn move ("c5")
    const isBareSquareOnly = /^[a-h][1-8]$/.test(raw);
    const contextBefore = out + gap;

    const precededBySquareWord = SQUARE_CONTEXT_RE.test(contextBefore);
    const continuedFromSquare =
      lastTokenKind === "square" && CONTINUATION_CONJ_RE.test(gap);

    if (isBareSquareOnly && (precededBySquareWord || continuedFromSquare)) {
      out += gap + raw;
      lastIndex = start + raw.length;
      lastTokenKind = "square";
      continue;
    }

    let replacement = sanToPlainEnglish(raw);
    if (isSentenceBoundary(contextBefore)) {
      replacement = capitalizeFirst(replacement);
    }

    if (lastTokenKind === "move" && /^ +$/.test(gap)) {
      out += ", " + replacement;
    } else if (/(?:^|[^\d.])\d+\.{1,3}$/.test(gap)) {
      out += gap + " " + replacement;
    } else {
      out += gap + replacement;
    }

    lastIndex = start + raw.length;
    lastTokenKind = "move";
  }

  out += text.slice(lastIndex);
  return out;
}
