/**
 * Deterministic Offline AI Coach Engine
 * Runs identically on Node and in browser bundles (including static GitHub Pages)
 * without requiring API keys or Node-only SDK dependencies.
 */

import { MoveBadge } from "../analysis/move-classifier";
import { ComparativeCoachInsights } from "../analysis/coach-insights";
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
  coachInsights?: ComparativeCoachInsights;
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

interface OfflinePersonaStyle {
  id: CoachPersonaId;
  errorClose: string;
  praiseClose: string;
  mistakeTip: string;
  oppSlipTip: string;
  blunderHeadline: (san: string, hanging?: { piece: string; square: string }) => string;
  missHeadline: (best: string) => string;
  mistakeHeadline: (san: string) => string;
  inaccuracyHeadline: (san: string, best: string) => string;
  brilliantHeadline: (san: string) => string;
  greatHeadline: (san: string) => string;
  bestHeadline: (san: string) => string;
  bookHeadline: string;
  forcedHeadline: (san: string) => string;
  castleHeadline: string;
  devHeadline: (san: string) => string;
  oppSlipHeadline: (opp: string, san: string, badge: MoveBadge) => string;
  oppStrongHeadline: (opp: string, san: string, badge: MoveBadge) => string;
  bestReasonLead: (best: string, seq: string) => string;
}

const PERSONA_STYLES: Record<CoachPersonaId, OfflinePersonaStyle> = {
  danny: {
    id: "danny",
    errorClose: "Take a breath—spot the tactical clue here and carry that scan into next turn.",
    praiseClose: "Lovely intuition keeping your army active and working together!",
    mistakeTip: "Before locking in a move, do a quick blunder check so every piece stays defended.",
    oppSlipTip: "When your opponent stumbles, pause and check your forcing captures, checks, and threats.",
    blunderHeadline: (san, h) =>
      h
        ? `Oops—${san} left your ${h.piece} on ${h.square} hanging!`
        : `Careful! ${san} hits a snag and swings the game.`,
    missHeadline: (best) => `Close! You had a big knockout with ${best}.`,
    mistakeHeadline: (san) => `${san} lets a good portion of your edge slip away.`,
    inaccuracyHeadline: (san, best) => `${san} works, though ${best} gave you a bit more zip.`,
    brilliantHeadline: (san) => `${san}!! What a fireworks sacrifice—brilliant stuff!`,
    greatHeadline: (san) => `${san}! Clutch calculation finding the lone winning resource!`,
    bestHeadline: (san) => `${san} nails the engine's #1 choice!`,
    bookHeadline: "Clean opening book move—right on track.",
    forcedHeadline: (san) => `${san} was your only legal escape here.`,
    castleHeadline: "Smart castling—tucking your king somewhere cozy.",
    devHeadline: (san) => `Nice developing step with ${san}!`,
    oppSlipHeadline: (opp, san, badge) =>
      `${opp} ${badge === "Miss" ? "let you off the hook" : "slipped up"} with ${san}—time to pounce!`,
    oppStrongHeadline: (opp, san, badge) =>
      `${opp} stayed sharp with a ${badge.toLowerCase()} ${san}.`,
    bestReasonLead: (best, seq) => `${best} would have kept you in great shape (${seq}).`,
  },
  sage: {
    id: "sage",
    errorClose: "Observe how this concession compromises key squares and long-term harmony.",
    praiseClose: "Notice the classical coordination your pieces achieve around the central tension.",
    mistakeTip: "Evaluate which square weakens or which piece lacks a constructive post before committing.",
    oppSlipTip: "Examine the structural weaknesses your opponent just created and pivot smoothly toward them.",
    blunderHeadline: (san, h) =>
      h
        ? `Structural collapse: ${san} drops the undefended ${h.piece} on ${h.square}.`
        : `Positional crisis: ${san} severely compromises your evaluation.`,
    missHeadline: (best) => `Strategic oversight: ${best} realized a decisive advantage.`,
    mistakeHeadline: (san) => `Imbalance alert: ${san} surrenders lasting positional equity.`,
    inaccuracyHeadline: (san, best) => `${san} loosens precision where ${best} held deeper harmony.`,
    brilliantHeadline: (san) => `${san}!! A profound positional-tactical sacrifice transforming the board.`,
    greatHeadline: (san) => `${san}! Classical accuracy—the solitary move preserving balance and pressure.`,
    bestHeadline: (san) => `${san} aligns seamlessly with strategic truth.`,
    bookHeadline: "Established opening theory—respecting central foundations.",
    forcedHeadline: (san) => `Forced continuation: ${san} is uniquely legal.`,
    castleHeadline: "Classical castling harmonizes rook connection and king safety.",
    devHeadline: (san) => `Sound developing principle embodied by ${san}.`,
    oppSlipHeadline: (opp, san, badge) =>
      `${opp}'s ${san} is a ${badge.toLowerCase()} leaving concrete structural targets.`,
    oppStrongHeadline: (opp, san, badge) =>
      `${opp} maintains classical balance via ${badge.toLowerCase()} ${san}.`,
    bestReasonLead: (best, seq) =>
      `Strategically, ${best} preserves harmonious control along ${seq}.`,
  },
  drillmaster: {
    id: "drillmaster",
    errorClose: "Tighten calculation discipline: that concession hands over the initiative on the spot.",
    praiseClose: "Clinical precision—zero tactical loopholes surrendered.",
    mistakeTip: "Checklist every single ply: enemy checks first, enemy captures second, enemy threats third.",
    oppSlipTip: "Lock on immediately! Calculate forcing checks and direct material strikes first.",
    blunderHeadline: (san, h) =>
      h
        ? `Blunder! ${san} abandons your ${h.piece} on ${h.square} to immediate capture!`
        : `Tactical breakdown! ${san} hands the initiative straight over.`,
    missHeadline: (best) => `Missed knockout! ${best} crushed on the spot!`,
    mistakeHeadline: (san) => `Costly slip! ${san} drops real pressure.`,
    inaccuracyHeadline: (san, best) => `Too soft—${san} loses punch compared to ${best}.`,
    brilliantHeadline: (san) => `${san}!! Ruthless sacrificial blow shattering the defense!`,
    greatHeadline: (san) => `${san}! Dead-accurate clutch strike—only winning move on the board!`,
    bestHeadline: (san) => `${san} hits maximum tactical efficiency!`,
    bookHeadline: "Theory locked in—speed through to the fight.",
    forcedHeadline: (san) => `Forced move: zero options other than ${san}.`,
    castleHeadline: "Rapid castling secures the king and enters the rook into action.",
    devHeadline: (san) => `Tempo-driven developing move: ${san}.`,
    oppSlipHeadline: (opp, san, badge) =>
      `Strike now! ${opp}'s ${san} (${badge.toLowerCase()}) opens a direct refutation!`,
    oppStrongHeadline: (opp, san, badge) =>
      `${opp} fired a ${badge.toLowerCase()} ${san}—calculate defenses immediately.`,
    bestReasonLead: (best, seq) =>
      `Calculation demands ${best} first—keeping tactical pressure via ${seq}.`,
  },
};

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

function getStyle(personaId?: CoachPersonaId): OfflinePersonaStyle {
  return PERSONA_STYLES[personaId ?? "danny"] ?? PERSONA_STYLES.danny;
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

function pickComparativeReason(insights?: ComparativeCoachInsights): string {
  if (!insights) return "";
  const candidates = [
    ...insights.missedOpportunities,
    ...insights.strategicTradeoffs,
  ].filter(Boolean);
  if (candidates.length > 0) {
    return candidates[0];
  }
  const pvFact = insights.bestPvIntentions?.summaryFacts?.[0];
  return pvFact ?? "";
}

function pickTailoredTip(
  insights: ComparativeCoachInsights | undefined,
  fallbackTip: string,
  style: OfflinePersonaStyle
): string {
  const joined = [
    ...(insights?.missedOpportunities ?? []),
    ...(insights?.strategicTradeoffs ?? []),
  ]
    .join(" ")
    .toLowerCase();

  if (joined.includes("pin")) {
    return style.id === "drillmaster"
      ? "Rule of attack: always test bishop/rook alignments against their King and Queen!"
      : style.id === "sage"
      ? "Respect diagonal and file alignments—a hidden pin often freezes a key defender."
      : "Keep an eye out for pieces lined up with the King—pins can win material fast!";
  }
  if (joined.includes("fork")) {
    return style.id === "drillmaster"
      ? "Calculate knight jumps and queen double attacks before settling for quiet retreats!"
      : "Watch for loose enemy pieces resting on knight-fork or queen-fork geometry.";
  }
  if (joined.includes("develop") || joined.includes("mobiliz")) {
    return style.id === "sage"
      ? "Prioritize full piece mobilization before early castling or unforced flank pawn moves."
      : "Get all your minor pieces off the back rank before starting side skirmishes!";
  }
  if (joined.includes("pawn structure") || joined.includes("isolated") || joined.includes("doubled")) {
    return style.id === "sage"
      ? "Concede structural pawn defects only when compensated by concrete open-file play."
      : "Avoid splitting or doubling pawns unless tactical compensation forces it.";
  }
  return fallbackTip;
}

function buildOpponentMoveOfflineExplanation(
  req: CoachExplanationRequest,
  oppLabel: string,
  tacticalDetail: string,
  refutationSeq: string,
  bestSeq: string,
  style: OfflinePersonaStyle
): CoachExplanationResponse {
  const { badge, moveSan, engineBestMove, coachInsights } = req;
  const whyCompare = pickComparativeReason(coachInsights);
  const pvFuture = coachInsights?.refutationPvIntentions?.summaryFacts?.[0] ?? "";
  const replyClause = refutationSeq
    ? style.id === "drillmaster"
      ? `Execute the refutation immediately starting with ${refutationSeq}.`
      : style.id === "sage"
      ? `The cleanest principled response begins with ${refutationSeq}.`
      : `Your best reply starts with ${refutationSeq}.`
    : "Look for checks, captures, and ways to seize the initiative.";

  if (badge === "Blunder" || badge === "Miss") {
    const targetNote = req.tacticalContext.hangingPieceDetails
      ? ` Their ${req.tacticalContext.hangingPieceDetails.piece} on ${req.tacticalContext.hangingPieceDetails.square} is exposed.`
      : "";
    const bestReasoning = whyCompare
      ? `${style.bestReasonLead(engineBestMove, bestSeq)} (${whyCompare})`
      : style.bestReasonLead(engineBestMove, bestSeq);
    return {
      badge,
      shortComment: style.oppSlipHeadline(oppLabel, moveSan, badge),
      detailedExplanation: `${oppLabel}'s ${moveSan} shifted the evaluation (${req.evalBefore} to ${req.evalAfter}).${targetNote} ${tacticalDetail ? `${tacticalDetail} ` : ""}${replyClause}${pvFuture ? ` ${pvFuture}` : ""}`.trim(),
      bestMoveReasoning: bestReasoning,
      variationTitle: "Your Opportunity to Strike",
      coachingTip: pickTailoredTip(coachInsights, style.oppSlipTip, style),
      coachMode: "offline",
    };
  }

  if (badge === "Mistake" || badge === "Inaccuracy") {
    return {
      badge,
      shortComment: style.oppSlipHeadline(oppLabel, moveSan, badge),
      detailedExplanation: `${oppLabel} conceded ${req.deltaWP.toFixed(1)}% win probability (${req.evalBefore} to ${req.evalAfter}) instead of ${engineBestMove}. ${tacticalDetail ? `${tacticalDetail} ` : ""}${replyClause}`.trim(),
      bestMoveReasoning: whyCompare
        ? `${engineBestMove} was stronger for ${oppLabel} (${bestSeq}): ${whyCompare}`
        : `${engineBestMove} was stronger for ${oppLabel} (${bestSeq}).`,
      variationTitle: "Your Counterplay Plan",
      coachingTip: pickTailoredTip(coachInsights, style.oppSlipTip, style),
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
    const pvIntent = coachInsights?.bestPvIntentions?.summaryFacts?.[0] ?? "";
    return {
      badge,
      shortComment: style.oppStrongHeadline(oppLabel, moveSan, badge),
      detailedExplanation: `${oppLabel}'s ${moveSan} maintains pressure at ${req.evalAfter}. ${tacticalDetail ? `Watch out: ${tacticalDetail} ` : ""}${pvIntent ? `${pvIntent} ` : ""}${refutationSeq ? `Stay alert and consider ${refutationSeq}.` : "Prioritize king safety and defend key squares."}`.trim(),
      variationTitle: "How to Defend & Counter",
      coachingTip: style.mistakeTip,
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
 * Generates deterministic offline game recap grounded in CAPS2 phase metrics & persona voice.
 */
export function buildOfflineGameStoryline(req: GameStorylineRequest): GameStorylineResponse {
  const openingLabel = req.openingName || "the opening";
  const style = getStyle(req.personaId);
  const counts = req.phaseMoveCounts;
  const openW = formatPhaseMetric(req.phaseAccuracies.opening.white, counts?.opening.white);
  const openB = formatPhaseMetric(req.phaseAccuracies.opening.black, counts?.opening.black);
  const midW = formatPhaseMetric(req.phaseAccuracies.middlegame.white, counts?.middlegame.white);
  const midB = formatPhaseMetric(req.phaseAccuracies.middlegame.black, counts?.middlegame.black);
  const noEndgame = counts && counts.endgame.white === 0 && counts.endgame.black === 0;
  const endgameClause = noEndgame
    ? "Endgame N/A"
    : `Endgame ${formatPhaseMetric(req.phaseAccuracies.endgame.white, counts?.endgame.white)}/${formatPhaseMetric(req.phaseAccuracies.endgame.black, counts?.endgame.black)}`;

  const headline = (() => {
    if (req.result === "1-0") {
      return style.id === "drillmaster"
        ? `${req.whiteName} closes the knock-out (${req.whiteAccuracy}% CAPS2)!`
        : style.id === "sage"
        ? `${req.whiteName} prevails through superior harmony (${req.whiteAccuracy}% CAPS2)`
        : `${req.whiteName} takes the victory with ${req.whiteAccuracy}% accuracy`;
    }
    if (req.result === "0-1") {
      return style.id === "drillmaster"
        ? `${req.blackName} converts ruthlessly (${req.blackAccuracy}% CAPS2)!`
        : style.id === "sage"
        ? `${req.blackName} commands the strategic arc (${req.blackAccuracy}% CAPS2)`
        : `${req.blackName} takes the victory with ${req.blackAccuracy}% accuracy`;
    }
    if (req.result === "1/2-1/2") {
      return style.id === "drillmaster"
        ? `Tactical stalemate: deadlocked battle in ${openingLabel}`
        : style.id === "sage"
        ? `Equilibrium preserved in ${openingLabel}`
        : `Hard-fought draw in ${openingLabel}`;
    }
    return `Balanced battle in ${openingLabel} (${req.whiteAccuracy}% vs ${req.blackAccuracy}%)`;
  })();

  const turningNote = req.turningPointMove
    ? ` The critical turning point came around ${req.turningPointMove}.`
    : "";

  const leadPrefix =
    style.id === "drillmaster"
      ? `Combat log — ${openingLabel}:`
      : style.id === "sage"
      ? `Strategic review — ${openingLabel}:`
      : `In ${openingLabel},`;

  const summary = `${leadPrefix} White (${req.whiteName}) posted ${req.whiteAccuracy}% overall CAPS2 accuracy (est. ${req.whiteElo}) against Black (${req.blackName}) at ${req.blackAccuracy}% (est. ${req.blackElo}). Phase accuracy (W/B): Opening ${openW}/${openB}, Middlegame ${midW}/${midB}, ${endgameClause}.${turningNote}`;

  const whiteTakeaway =
    req.whiteAccuracy >= 85
      ? style.id === "drillmaster"
        ? `Sharp execution (${req.whiteAccuracy}%)—review the ${req.keyMomentCount} critical moments to hunt even faster mates.`
        : style.id === "sage"
        ? `Admirable structural discipline (${req.whiteAccuracy}%); study the ${req.keyMomentCount} inflections to deepen endgame technique.`
        : `Strong calculation throughout (${req.whiteAccuracy}% accuracy); keep reviewing the ${req.keyMomentCount} key moments to sharpen conversions.`
      : style.id === "drillmaster"
      ? `Middlegame discipline needs work (${midW}): stop leaving loose pieces undefended during tactical handoffs.`
      : style.id === "sage"
      ? `Center and piece harmony wavered in the middlegame (${midW}); verify weak squares before advancing pawns.`
      : `Focus on double-checking undefended pieces before committing in complex middlegame positions (${midW} middlegame accuracy).`;

  const blackTakeaway =
    req.blackAccuracy >= 85
      ? style.id === "drillmaster"
        ? `Relentless defensive precision (${req.blackAccuracy}%)—drill the turning points to turn equal spots into wins.`
        : style.id === "sage"
        ? `Composed classical defense (${req.blackAccuracy}%); inspect where initiative briefly drifted.`
        : `Resilient accuracy (${req.blackAccuracy}%); look closely at the turning points where small concessions shifted momentum.`
      : style.id === "drillmaster"
      ? `Spot opponent threats faster (${midB} middlegame): force checks and captures before defending passively.`
      : style.id === "sage"
      ? `Middlegame tension (${midB}) tested piece coordination; keep knights and bishops anchored cleanly.`
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
 * Generates deterministic offline coach feedback grounded in tactical tags,
 * comparative chess reasons, PV future intentions, persona style, and perspective.
 */
export function buildOfflineMoveExplanation(req: CoachExplanationRequest): CoachExplanationResponse {
  const { badge, tacticalContext, engineBestMove, moveSan, playedBy, coachInsights } = req;
  const perspective = req.coachFor ?? playedBy;
  const isPlayerMove = playedBy === perspective;
  const oppLabel = req.opponentName || "Your opponent";
  const style = getStyle(req.personaId);
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
    typeof req.moveNumber === "number" && Number.isFinite(req.moveNumber)
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
      style
    );
  }

  const comparativeReason = pickComparativeReason(coachInsights);
  const futureBestFact = coachInsights?.bestPvIntentions?.summaryFacts?.[0] ?? "";
  const futureRefutationFact = coachInsights?.refutationPvIntentions?.summaryFacts?.[0] ?? "";

  if (badge === "Blunder") {
    if (tacticalContext.hangingPieceDetails) {
      const { piece, square } = tacticalContext.hangingPieceDetails;
      const punishClause = refutationSeq
        ? `${oppLabel} can strike right away with ${refutationSeq}, shifting the eval to ${req.evalAfter}.`
        : `${oppLabel} can exploit this immediately, shifting the evaluation to ${req.evalAfter}.`;
      return {
        badge,
        shortComment: style.blunderHeadline(moveSan, { piece, square }),
        detailedExplanation: `${moveSan} left your ${piece} vulnerable on ${square}. ${punishClause} ${comparativeReason ? `Why ${engineBestMove} outperformed: ${comparativeReason} ` : ""}${style.errorClose}`.trim(),
        bestMoveReasoning: `${style.bestReasonLead(engineBestMove, bestSeq)}${futureBestFact ? ` ${futureBestFact}` : ""}`,
        variationTitle: `${oppLabel}'s Winning Punishment`,
        coachingTip: pickTailoredTip(coachInsights, style.mistakeTip, style),
        coachMode: "offline",
      };
    }
    const lineClause = refutationSeq
      ? `${oppLabel} can capitalize with ${refutationSeq}.`
      : `${oppLabel} now holds a decisive tactical continuation.`;
    return {
      badge,
      shortComment: style.blunderHeadline(moveSan),
      detailedExplanation: `This move concedes decisive momentum (${req.evalBefore} to ${req.evalAfter}). ${tacticalDetail || lineClause} ${futureRefutationFact ? `${futureRefutationFact} ` : ""}${comparativeReason ? `${comparativeReason} ` : ""}${style.errorClose}`.trim(),
      bestMoveReasoning: `${style.bestReasonLead(engineBestMove, bestSeq)}${futureBestFact ? ` ${futureBestFact}` : ""}`,
      variationTitle: "Punishment Line",
      coachingTip: pickTailoredTip(coachInsights, style.mistakeTip, style),
      coachMode: "offline",
    };
  }

  if (badge === "Miss") {
    return {
      badge,
      shortComment: style.missHeadline(engineBestMove),
      detailedExplanation: `${oppLabel} had just slipped, but ${moveSan} let them off the hook (${req.evalBefore} to ${req.evalAfter}). ${comparativeReason || tacticalDetail || `Better was ${bestSeq}.`} ${style.errorClose}`.trim(),
      bestMoveReasoning: `${engineBestMove} seized a commanding edge along ${bestSeq}${futureBestFact ? ` — ${futureBestFact}` : "."}`,
      variationTitle: "Missed Winning Line",
      coachingTip: pickTailoredTip(coachInsights, style.oppSlipTip, style),
      coachMode: "offline",
    };
  }

  if (badge === "Mistake") {
    const punishNote = refutationSeq ? ` ${oppLabel} can press with ${refutationSeq}.` : "";
    return {
      badge,
      shortComment: style.mistakeHeadline(moveSan),
      detailedExplanation: `${tacticalContext.hangingPieceDetails ? `Your ${tacticalContext.hangingPieceDetails.piece} on ${tacticalContext.hangingPieceDetails.square} becomes vulnerable. ` : ""}The evaluation shifted from ${req.evalBefore} to ${req.evalAfter}.${punishNote} ${comparativeReason ? `${comparativeReason} ` : ""}${style.errorClose}`.trim(),
      bestMoveReasoning: `${style.bestReasonLead(engineBestMove, bestSeq)}${futureBestFact ? ` ${futureBestFact}` : ""}`,
      variationTitle: "Optimal Continuation",
      coachingTip: pickTailoredTip(coachInsights, style.mistakeTip, style),
      coachMode: "offline",
    };
  }

  if (badge === "Inaccuracy") {
    return {
      badge,
      shortComment: style.inaccuracyHeadline(moveSan, engineBestMove),
      detailedExplanation: `While ${moveSan} stays playable, it trims your edge (${req.evalBefore} to ${req.evalAfter}). ${comparativeReason || tacticalDetail || (refutationSeq ? `Watch for ${oppLabel}'s ${refutationSeq}.` : "")} ${style.errorClose}`.trim(),
      bestMoveReasoning: `${style.bestReasonLead(engineBestMove, bestSeq)}${futureBestFact ? ` ${futureBestFact}` : ""}`,
      variationTitle: "More Accurate Path",
      coachingTip: pickTailoredTip(coachInsights, style.mistakeTip, style),
      coachMode: "offline",
    };
  }

  if (badge === "Brilliant") {
    return {
      badge,
      shortComment: style.brilliantHeadline(moveSan),
      detailedExplanation: `You sacrifice material with ${moveSan} while holding decisive control at ${req.evalAfter}. ${tacticalDetail || "Your active pieces and king attack create unstoppable compensation."} ${futureBestFact ? `${futureBestFact} ` : ""}${style.praiseClose}`.trim(),
      variationTitle: "Brilliant Continuation",
      coachingTip:
        style.id === "drillmaster"
          ? "Shatter the shelter first—calculate follow-up checks before sacrificing!"
          : "Calculated sacrifices work best when every piece enters the attack with tempo.",
      coachMode: "offline",
    };
  }

  if (badge === "Great") {
    return {
      badge,
      shortComment: style.greatHeadline(moveSan),
      detailedExplanation: `In a razor-sharp position, ${moveSan} was the solitary resource holding the edge (${req.evalAfter}). ${tacticalDetail ? `${tacticalDetail} ` : ""}${futureBestFact ? `${futureBestFact} ` : ""}${style.praiseClose}`.trim(),
      variationTitle: "Sole Winning Line",
      coachingTip: style.praiseClose,
      coachMode: "offline",
    };
  }

  if (badge === "Best") {
    return {
      badge,
      shortComment: style.bestHeadline(moveSan),
      detailedExplanation: tacticalDetail
        ? `${tacticalDetail} You matched the engine's top line at ${req.evalAfter}. ${futureBestFact ? `${futureBestFact} ` : ""}${style.praiseClose}`.trim()
        : `You matched Stockfish's sharpest idea (${bestSeq}), keeping initiative at ${req.evalAfter}. ${futureBestFact ? `${futureBestFact} ` : ""}${style.praiseClose}`.trim(),
      variationTitle: "Engine Line",
      coachingTip: futureBestFact || style.praiseClose,
      coachMode: "offline",
    };
  }

  if (badge === "Book") {
    return {
      badge,
      shortComment: style.bookHeadline,
      detailedExplanation: `Following established theory in the ${req.openingName || "opening"}, staking central space and smooth development.`,
      coachMode: "offline",
    };
  }

  if (badge === "Forced") {
    return {
      badge,
      shortComment: style.forcedHeadline(moveSan),
      detailedExplanation: "No legal alternatives existed in this position.",
      coachMode: "offline",
    };
  }

  if (tacticalContext.tags.includes("KING_SAFETY_CASTLE")) {
    return {
      badge,
      shortComment: style.castleHeadline,
      detailedExplanation: `A timely ${badge.toLowerCase()} move tucking the king safely and bringing the rook toward central files. ${style.praiseClose}`,
      coachMode: "offline",
    };
  }

  if (tacticalContext.tags.includes("DEVELOPMENT")) {
    return {
      badge,
      shortComment: style.devHeadline(moveSan),
      detailedExplanation: `You bring a minor piece toward active central squares (${tacticalDetail || "harmonizing development and preparing castling"}). ${style.praiseClose}`,
      coachMode: "offline",
    };
  }

  return {
    badge,
    shortComment: `${moveSan} is a ${badge.toLowerCase()} choice.`,
    detailedExplanation: `${tacticalDetail ? `${tacticalDetail} ` : `A solid continuation holding ${req.evalAfter}. `}${comparativeReason ? `${comparativeReason} ` : engineBestMove !== moveSan ? `${engineBestMove} offered slightly more punch. ` : ""}${style.praiseClose}`.trim(),
    bestMoveReasoning:
      engineBestMove !== moveSan ? style.bestReasonLead(engineBestMove, bestSeq) : undefined,
    coachMode: "offline",
  };
}
