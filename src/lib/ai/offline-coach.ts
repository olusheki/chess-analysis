/**
 * Deterministic Offline AI Coach Engine
 * Runs identically on Node and in browser bundles (including static GitHub Pages)
 * without requiring API keys or Node-only SDK dependencies.
 */

import { MoveBadge } from "../analysis/move-classifier";
import { TacticalContext } from "../analysis/tactical-tagger";
import { CoachPersonaId } from "./coach-personas";

export interface CoachExplanationRequest {
  moveSan: string;
  playedBy: "White" | "Black";
  coachFor?: "White" | "Black";
  playerName?: string;
  opponentName?: string;
  moveNumber: number;
  badge: MoveBadge;
  openingName?: string;
  evalBefore: string;
  evalAfter: string;
  deltaWP: number;
  engineBestMove: string;
  bestMovePV: string[];
  refutationPV?: string[];
  tacticalContext: TacticalContext;
  personaId?: CoachPersonaId;
  fenBefore?: string;
  fenAfter?: string;
}

export interface CoachExplanationResponse {
  badge: MoveBadge;
  shortComment: string;
  detailedExplanation: string;
  bestMoveReasoning?: string;
  variationTitle?: string;
  coachingTip?: string;
  coachMode?: "live" | "offline";
}

export interface GameStorylineRequest {
  whiteName: string;
  blackName: string;
  result: string;
  openingName?: string;
  whiteAccuracy: number;
  blackAccuracy: number;
  whiteElo: number;
  blackElo: number;
  phaseAccuracies: {
    opening: { white: number; black: number };
    middlegame: { white: number; black: number };
    endgame: { white: number; black: number };
  };
  phaseMoveCounts?: {
    opening: { white: number; black: number };
    middlegame: { white: number; black: number };
    endgame: { white: number; black: number };
  };
  coachFor?: "White" | "Black";
  keyMomentCount: number;
  turningPointMove?: string;
  personaId?: CoachPersonaId;
}

export interface GameStorylineResponse {
  headline: string;
  summary: string;
  whiteTakeaway: string;
  blackTakeaway: string;
  coachMode?: "live" | "offline";
}

export function formatLineSeq(
  lines?: string[],
  maxMoves = 4,
  startMoveNumber?: number,
  startColor?: "w" | "b"
): string {
  if (!lines || lines.length === 0) return "";
  const slice = lines.slice(0, maxMoves);
  if (
    typeof startMoveNumber !== "number" ||
    !Number.isFinite(startMoveNumber) ||
    startMoveNumber <= 0 ||
    !startColor
  ) {
    return slice.join(" ");
  }
  const tokens: string[] = [];
  let moveNo = startMoveNumber;
  let turn: "w" | "b" = startColor;
  for (let i = 0; i < slice.length; i++) {
    if (turn === "w") {
      tokens.push(`${moveNo}. ${slice[i]}`);
      turn = "b";
    } else {
      tokens.push(i === 0 ? `${moveNo}...${slice[i]}` : slice[i]);
      moveNo += 1;
      turn = "w";
    }
  }
  return tokens.join(" ");
}

export function formatPhaseMetric(acc: number, count?: number): string {
  return count === 0 ? "N/A" : `${acc}%`;
}

function getOfflinePersonaVoice(personaId?: CoachPersonaId): {
  errorClose: string;
  praiseClose: string;
  mistakeTip: string;
  oppSlipTip: string;
} {
  switch (personaId) {
    case "sage":
      return {
        errorClose: "Notice how this weakens key squares and piece harmony.",
        praiseClose: "Your pieces coordinate cleanly around the central structure.",
        mistakeTip: "Ask which piece lacks protection or role before advancing.",
        oppSlipTip: "Pause to evaluate structural targets left behind by their slip.",
      };
    case "drillmaster":
      return {
        errorClose: "That tactical concession surrenders the initiative immediately.",
        praiseClose: "Clinical precision — zero tactical loopholes left on the board.",
        mistakeTip: "Scan checks, captures, and threats every single ply without exception.",
        oppSlipTip: "Strike with forcing checks and captures while your opponent is uncoordinated.",
      };
    case "danny":
    default:
      return {
        errorClose: "No worries — spot the tactical clue here and keep scanning next turn.",
        praiseClose: "Great intuition keeping your army active and coordinated!",
        mistakeTip: "Before moving, scan every piece to verify it stays defended.",
        oppSlipTip: "When your opponent slips, pause to look for checks, captures, and threats.",
      };
  }
}

export function describeTacticalFeatures(
  ctx: TacticalContext,
  suppressOffensivePraise = false,
  suppressCenterPraise = false
): string {
  if (suppressOffensivePraise) {
    return "";
  }
  const parts: string[] = [];

  if (ctx.tags.includes("TACTICAL_FORK") && ctx.forkTargets && ctx.forkTargets.length >= 2) {
    const targetStr = ctx.forkTargets.map((t) => `${t.piece} on ${t.square}`).join(" and ");
    parts.push(`This creates a fork attacking ${targetStr}.`);
  }
  if (ctx.tags.includes("ABSOLUTE_PIN") && ctx.pinnedPieceDetails) {
    parts.push(
      `It pins the ${ctx.pinnedPieceDetails.piece} on ${ctx.pinnedPieceDetails.square} to the King.`
    );
  } else if (ctx.tags.includes("RELATIVE_PIN") && ctx.pinnedPieceDetails) {
    parts.push(
      `It pins the ${ctx.pinnedPieceDetails.piece} on ${ctx.pinnedPieceDetails.square} against the ${ctx.pinnedPieceDetails.pinnedTo}.`
    );
  }
  if (ctx.tags.includes("SKEWER") && ctx.skeweredPieceDetails) {
    parts.push(
      `This skewers the ${ctx.skeweredPieceDetails.frontPiece} on ${ctx.skeweredPieceDetails.frontSquare} in front of the ${ctx.skeweredPieceDetails.backPiece} on ${ctx.skeweredPieceDetails.backSquare}.`
    );
  }
  if (ctx.tags.includes("DISCOVERED_ATTACK") && ctx.discoveredTarget) {
    parts.push(
      `Moving clears a discovered attack on the ${ctx.discoveredTarget.piece} on ${ctx.discoveredTarget.square}.`
    );
  }
  if (ctx.tags.includes("CHECKMATE_THREAT")) {
    parts.push("It creates an immediate checkmate threat that must be answered.");
  }
  if (!suppressCenterPraise && ctx.tags.includes("CENTER_CONTROL") && parts.length === 0) {
    parts.push("It contests key central squares.");
  }
  return parts.join(" ");
}

function buildOpponentMoveOfflineExplanation(
  req: CoachExplanationRequest,
  oppLabel: string,
  tacticalDetail: string,
  refutationSeq: string,
  bestSeq: string,
  voice: ReturnType<typeof getOfflinePersonaVoice>
): CoachExplanationResponse {
  const { badge, moveSan, engineBestMove } = req;
  const replyClause = refutationSeq
    ? `Your best reply starts with ${refutationSeq}.`
    : "Look for checks, captures, and ways to seize the initiative.";

  if (badge === "Blunder" || badge === "Miss") {
    const targetNote = req.tacticalContext.hangingPieceDetails
      ? ` Their ${req.tacticalContext.hangingPieceDetails.piece} on ${req.tacticalContext.hangingPieceDetails.square} is exposed.`
      : "";
    return {
      badge,
      shortComment: `${oppLabel} ${badge === "Miss" ? "missed a chance" : "blundered"} with ${moveSan} — time to strike!`,
      detailedExplanation: `${oppLabel}'s ${moveSan} shifted the evaluation (${req.evalBefore} to ${req.evalAfter}).${targetNote} ${tacticalDetail ? `${tacticalDetail} ` : ""}${replyClause}`,
      bestMoveReasoning: `${engineBestMove} would have kept ${oppLabel} in the game (${bestSeq}).`,
      variationTitle: "Your Opportunity to Strike",
      coachingTip: voice.oppSlipTip,
      coachMode: "offline",
    };
  }

  if (badge === "Mistake" || badge === "Inaccuracy") {
    return {
      badge,
      shortComment: `${oppLabel} slipped with ${moveSan}; punish with active play.`,
      detailedExplanation: `${oppLabel} conceded ${req.deltaWP.toFixed(1)}% win probability (${req.evalBefore} to ${req.evalAfter}) instead of ${engineBestMove}. ${tacticalDetail ? `${tacticalDetail} ` : ""}${replyClause}`,
      bestMoveReasoning: `${engineBestMove} was stronger for ${oppLabel} (${bestSeq}).`,
      variationTitle: "Your Counterplay Plan",
      coachingTip: voice.oppSlipTip,
      coachMode: "offline",
    };
  }

  if (badge === "Book" || badge === "Forced") {
    return {
      badge,
      shortComment: `${oppLabel} ${badge === "Book" ? "follows opening theory" : "played the only legal move"} with ${moveSan}.`,
      detailedExplanation:
        badge === "Book"
          ? `${oppLabel} stays inside established theory of the ${req.openingName || "opening"}. ${refutationSeq ? `Prepare your next move around ${refutationSeq}.` : "Stick to solid central development."}`
          : `${oppLabel} had no other legal move than ${moveSan}. ${refutationSeq ? `Follow up with ${refutationSeq}.` : ""}`.trim(),
      coachMode: "offline",
    };
  }

  if (badge === "Brilliant" || badge === "Great" || badge === "Best") {
    const strengthDesc =
      badge === "Brilliant"
        ? "sacrificed material soundly"
        : badge === "Great"
        ? "found the critical resource"
        : "found the engine's top move";
    return {
      badge,
      shortComment: `${oppLabel} ${strengthDesc} with ${moveSan}.`,
      detailedExplanation: `${oppLabel}'s ${moveSan} keeps strong pressure at ${req.evalAfter}. ${tacticalDetail ? `Watch out: ${tacticalDetail} ` : ""}${refutationSeq ? `Stay sharp and consider replying with ${refutationSeq}.` : "Prioritize king safety and defend your key squares."}`,
      variationTitle: "How to Defend & Counter",
      coachingTip: voice.mistakeTip,
      coachMode: "offline",
    };
  }

  return {
    badge,
    shortComment: `${oppLabel} played a ${badge.toLowerCase()} move (${moveSan}).`,
    detailedExplanation: `${oppLabel}'s move keeps the evaluation around ${req.evalAfter}. ${tacticalDetail ? `Threat check: ${tacticalDetail} ` : ""}${refutationSeq ? `Consider answering with ${refutationSeq}.` : ""}`.trim(),
    coachMode: "offline",
  };
}

/**
 * Generates deterministic offline game recap grounded in CAPS2 phase metrics.
 */
export function buildOfflineGameStoryline(req: GameStorylineRequest): GameStorylineResponse {
  const openingLabel = req.openingName || "the opening";
  const counts = req.phaseMoveCounts;
  const openW = formatPhaseMetric(req.phaseAccuracies.opening.white, counts?.opening.white);
  const openB = formatPhaseMetric(req.phaseAccuracies.opening.black, counts?.opening.black);
  const midW = formatPhaseMetric(req.phaseAccuracies.middlegame.white, counts?.middlegame.white);
  const midB = formatPhaseMetric(req.phaseAccuracies.middlegame.black, counts?.middlegame.black);
  const noEndgame = counts && counts.endgame.white === 0 && counts.endgame.black === 0;
  const endgameClause = noEndgame
    ? "Endgame N/A"
    : `Endgame ${formatPhaseMetric(req.phaseAccuracies.endgame.white, counts?.endgame.white)}/${formatPhaseMetric(req.phaseAccuracies.endgame.black, counts?.endgame.black)}`;

  const headline =
    req.result === "1-0"
      ? `${req.whiteName} takes the victory with ${req.whiteAccuracy}% accuracy`
      : req.result === "0-1"
      ? `${req.blackName} takes the victory with ${req.blackAccuracy}% accuracy`
      : req.result === "1/2-1/2"
      ? `Hard-fought draw in ${openingLabel}`
      : `Balanced battle in ${openingLabel} (${req.whiteAccuracy}% vs ${req.blackAccuracy}%)`;

  const turningNote = req.turningPointMove
    ? ` The critical turning point came around ${req.turningPointMove}.`
    : "";

  const summary = `In ${openingLabel}, White (${req.whiteName}) posted ${req.whiteAccuracy}% overall CAPS2 accuracy (est. ${req.whiteElo}) against Black (${req.blackName}) at ${req.blackAccuracy}% (est. ${req.blackElo}). Phase accuracy (W/B): Opening ${openW}/${openB}, Middlegame ${midW}/${midB}, ${endgameClause}.${turningNote}`;

  const whiteTakeaway =
    req.whiteAccuracy >= 85
      ? `Strong calculation throughout (${req.whiteAccuracy}% accuracy); keep reviewing the ${req.keyMomentCount} key moments to sharpen conversions.`
      : `Focus on double-checking undefended pieces before committing in complex middlegame positions (${midW} middlegame accuracy).`;

  const blackTakeaway =
    req.blackAccuracy >= 85
      ? `Resilient accuracy (${req.blackAccuracy}%); look closely at the turning points where small concessions shifted momentum.`
      : `Review the tactical key moments in the middlegame (${midB} accuracy) to spot counterplay sooner.`;

  return {
    headline,
    summary,
    whiteTakeaway,
    blackTakeaway,
    coachMode: "offline",
  };
}

/**
 * Generates deterministic offline coach feedback grounded in tactical tags, evaluation deltas, PV lines, persona voice, and coachFor perspective.
 */
export function buildOfflineMoveExplanation(req: CoachExplanationRequest): CoachExplanationResponse {
  const { badge, tacticalContext, engineBestMove, moveSan, playedBy } = req;
  const perspective = req.coachFor ?? playedBy;
  const isPlayerMove = playedBy === perspective;
  const oppLabel = req.opponentName || "Your opponent";
  const voice = getOfflinePersonaVoice(req.personaId);
  const suppressPositivePraise = badge === "Blunder" || badge === "Miss";
  const suppressCenterTag = suppressPositivePraise || badge === "Mistake" || badge === "Inaccuracy";
  const tacticalDetail = describeTacticalFeatures(
    tacticalContext,
    suppressPositivePraise,
    suppressCenterTag
  );
  const playedTurn: "w" | "b" = playedBy === "Black" ? "b" : "w";
  const replyTurn: "w" | "b" = playedTurn === "w" ? "b" : "w";
  const replyMoveNumber =
    req.moveNumber !== undefined
      ? playedTurn === "b"
        ? req.moveNumber + 1
        : req.moveNumber
      : undefined;
  const refutationSeq = formatLineSeq(req.refutationPV, 4, replyMoveNumber, replyTurn);
  const bestSeq = formatLineSeq(req.bestMovePV, 4, req.moveNumber, playedTurn) || engineBestMove;

  if (!isPlayerMove) {
    return buildOpponentMoveOfflineExplanation(
      req,
      oppLabel,
      tacticalDetail,
      refutationSeq,
      bestSeq,
      voice
    );
  }

  if (badge === "Blunder") {
    if (tacticalContext.hangingPieceDetails) {
      const { piece, square } = tacticalContext.hangingPieceDetails;
      const punishClause = refutationSeq
        ? `${oppLabel} can strike right away with ${refutationSeq}, shifting the eval to ${req.evalAfter}.`
        : `${oppLabel} can exploit this immediately, shifting the evaluation to ${req.evalAfter}.`;
      return {
        badge,
        shortComment: `You left your ${piece} on ${square} hanging!`,
        detailedExplanation: `${moveSan} left your ${piece} vulnerable on ${square}. ${punishClause} ${voice.errorClose}`,
        bestMoveReasoning: `${engineBestMove} would have kept your position solid (${bestSeq}).`,
        variationTitle: `${oppLabel}'s Winning Punishment`,
        coachingTip: voice.mistakeTip,
        coachMode: "offline",
      };
    }
    const lineClause = refutationSeq
      ? `${oppLabel} can capitalize with ${refutationSeq}.`
      : `${oppLabel} now holds a decisive tactical continuation.`;
    return {
      badge,
      shortComment: `${moveSan} is a critical blunder that shifts the game.`,
      detailedExplanation: `This move concedes decisive momentum (${req.evalBefore} to ${req.evalAfter}). ${tacticalDetail || lineClause} ${voice.errorClose}`,
      bestMoveReasoning: `${engineBestMove} was the strongest defense (${bestSeq}).`,
      variationTitle: "Punishment Line",
      coachingTip: voice.mistakeTip,
      coachMode: "offline",
    };
  }

  if (badge === "Miss") {
    return {
      badge,
      shortComment: `You missed a winning chance with ${engineBestMove}!`,
      detailedExplanation: `${oppLabel} had just slipped, but ${moveSan} let them off the hook (${req.evalBefore} to ${req.evalAfter}). ${tacticalDetail || `Better was ${bestSeq}.`} ${voice.errorClose}`.trim(),
      bestMoveReasoning: `${engineBestMove} would have seized a commanding advantage immediately.`,
      variationTitle: "Missed Winning Line",
      coachingTip: voice.oppSlipTip,
      coachMode: "offline",
    };
  }

  if (badge === "Mistake") {
    const punishNote = refutationSeq ? ` ${oppLabel} can press with ${refutationSeq}.` : "";
    return {
      badge,
      shortComment: `${moveSan} gives away a meaningful advantage.`,
      detailedExplanation: `${tacticalContext.hangingPieceDetails ? `Your ${tacticalContext.hangingPieceDetails.piece} on ${tacticalContext.hangingPieceDetails.square} becomes vulnerable. ` : ""}The evaluation shifted from ${req.evalBefore} to ${req.evalAfter}.${punishNote} ${voice.errorClose}`,
      bestMoveReasoning: `${engineBestMove} maintained stronger control (${bestSeq}).`,
      variationTitle: "Optimal Continuation",
      coachingTip: voice.mistakeTip,
      coachMode: "offline",
    };
  }

  if (badge === "Inaccuracy") {
    return {
      badge,
      shortComment: `${moveSan} is slightly imprecise; ${engineBestMove} was sharper.`,
      detailedExplanation: `While ${moveSan} remains playable, it concedes a small edge (${req.evalBefore} to ${req.evalAfter}). ${tacticalDetail || (refutationSeq ? `Watch out for ${oppLabel}'s ${refutationSeq}.` : "")} ${voice.errorClose}`.trim(),
      bestMoveReasoning: `${engineBestMove} kept more active pressure (${bestSeq}).`,
      variationTitle: "More Accurate Path",
      coachMode: "offline",
    };
  }

  if (badge === "Brilliant") {
    return {
      badge,
      shortComment: `${moveSan}!! A brilliant sacrifice that breaks the position open!`,
      detailedExplanation: `You sacrifice material with ${moveSan} while keeping control at ${req.evalAfter}. ${tacticalDetail || "Your piece activity and king pressure deliver full compensation."} ${voice.praiseClose}`,
      variationTitle: "Brilliant Continuation",
      coachingTip: "Calculated sacrifices shine when your pieces quickly swarm the opponent's king.",
      coachMode: "offline",
    };
  }

  if (badge === "Great") {
    return {
      badge,
      shortComment: `${moveSan}! You found the only winning move in a sharp spot.`,
      detailedExplanation: `In a critical position, ${moveSan} was your sole path to keep the edge (${req.evalAfter}). ${tacticalDetail || voice.praiseClose}`.trim(),
      variationTitle: "Sole Winning Line",
      coachMode: "offline",
    };
  }

  if (badge === "Best") {
    return {
      badge,
      shortComment: `${moveSan} is the best move on the board!`,
      detailedExplanation: tacticalDetail
        ? `${tacticalDetail} You found the engine's top continuation at ${req.evalAfter}. ${voice.praiseClose}`
        : `You found the engine's sharpest line (${bestSeq}), maximizing piece activity at ${req.evalAfter}. ${voice.praiseClose}`,
      variationTitle: "Engine Line",
      coachMode: "offline",
    };
  }

  if (badge === "Book") {
    return {
      badge,
      shortComment: "Standard opening book theory.",
      detailedExplanation: `Following established theory in the ${req.openingName || "opening"}, fighting cleanly for central space and development.`,
      coachMode: "offline",
    };
  }

  if (badge === "Forced") {
    return {
      badge,
      shortComment: `${moveSan} was your only legal move.`,
      detailedExplanation: "There were no legal alternatives available in this position.",
      coachMode: "offline",
    };
  }

  if (tacticalContext.tags.includes("KING_SAFETY_CASTLE")) {
    return {
      badge,
      shortComment: "Castling tucks your king away safely.",
      detailedExplanation: `A timely ${badge.toLowerCase()} move that safeguards your king and activates the rook. ${voice.praiseClose}`,
      coachMode: "offline",
    };
  }

  if (tacticalContext.tags.includes("DEVELOPMENT")) {
    return {
      badge,
      shortComment: "A solid developing move.",
      detailedExplanation: `You develop a minor piece toward active central squares (${tacticalDetail || "preparing castling and harmonious coordination"}). ${voice.praiseClose}`,
      coachMode: "offline",
    };
  }

  return {
    badge,
    shortComment: `${moveSan} is a ${badge.toLowerCase()} move.`,
    detailedExplanation: `${tacticalDetail ? `${tacticalDetail} ` : `A reasonable continuation keeping the evaluation at ${req.evalAfter}. `}${engineBestMove !== moveSan ? `${engineBestMove} was slightly sharper. ` : ""}${voice.praiseClose}`.trim(),
    bestMoveReasoning:
      engineBestMove !== moveSan ? `${engineBestMove} offered a touch more precision (${bestSeq}).` : undefined,
    coachMode: "offline",
  };
}
