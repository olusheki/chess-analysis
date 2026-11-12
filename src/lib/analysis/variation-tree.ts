import { Chess, type Square } from "chess.js";
import type { PositionEval } from "../engine/engine-evaluator";

export interface VariationNode {
  id: string;
  parentId: string | null;
  anchorPly: number;
  plyOffset: number;
  moveNumber: number;
  color: "w" | "b";
  san: string;
  uci: string;
  from: Square;
  to: Square;
  fenBefore: string;
  fenAfter: string;
  childrenIds: string[];
  eval?: PositionEval;
}

export interface VariationTreeState {
  nodes: Record<string, VariationNode>;
  rootsByAnchorPly: Record<number, string[]>;
  nextSeq: number;
}

export interface VariationRun {
  anchorPly: number;
  parentNodeId: string | null;
  depth: number;
  nodes: VariationNode[];
}

/** Creates an empty variation tree state for interactive Analysis exploration. */
export function createEmptyVariationTree(): VariationTreeState {
  return {
    nodes: {},
    rootsByAnchorPly: {},
    nextSeq: 1,
  };
}

function resolveMoveAttempt(
  chess: Chess,
  from: string,
  to: string,
  promotion?: string
) {
  if (promotion) {
    return chess.move({ from, to, promotion });
  }
  try {
    return chess.move({ from, to });
  } catch {
    return chess.move({ from, to, promotion: "q" });
  }
}

function getSiblingIds(
  tree: VariationTreeState,
  anchorPly: number,
  parentId: string | null
): string[] {
  if (parentId === null) {
    return tree.rootsByAnchorPly[anchorPly] ?? [];
  }
  return tree.nodes[parentId]?.childrenIds ?? [];
}

/**
 * Plays a board move inside the variation tree starting from either `parentId`
 * or directly off the mainline `anchorPly` / `anchorFen`.
 * Reuses an existing child node if the same UCI move already exists.
 */
export function playVariationMove(
  tree: VariationTreeState,
  input: {
    anchorPly: number;
    anchorFen: string;
    parentId: string | null;
    from: string;
    to: string;
    promotion?: string;
  }
): { moved: boolean; tree: VariationTreeState; node?: VariationNode } {
  const parent = input.parentId ? tree.nodes[input.parentId] : undefined;
  if (input.parentId && !parent) {
    return { moved: false, tree };
  }

  const fenBefore = parent ? parent.fenAfter : input.anchorFen;
  const anchorPly = parent ? parent.anchorPly : input.anchorPly;

  try {
    const chess = new Chess(fenBefore);
    const moveNumber = chess.moveNumber();
    const played = resolveMoveAttempt(chess, input.from, input.to, input.promotion);
    if (!played) return { moved: false, tree };

    const uci = `${played.from}${played.to}${played.promotion ?? ""}`;
    const siblingIds = getSiblingIds(tree, anchorPly, input.parentId);
    for (const sid of siblingIds) {
      const existing = tree.nodes[sid];
      if (existing && existing.uci === uci) {
        return { moved: true, tree, node: existing };
      }
    }

    const id = `v-${tree.nextSeq}`;
    const node: VariationNode = {
      id,
      parentId: input.parentId,
      anchorPly,
      plyOffset: parent ? parent.plyOffset + 1 : 1,
      moveNumber,
      color: played.color,
      san: played.san,
      uci,
      from: played.from,
      to: played.to,
      fenBefore,
      fenAfter: chess.fen(),
      childrenIds: [],
    };

    const nextNodes: Record<string, VariationNode> = {
      ...tree.nodes,
      [id]: node,
    };
    const nextRoots = { ...tree.rootsByAnchorPly };

    if (parent) {
      nextNodes[parent.id] = {
        ...parent,
        childrenIds: [...parent.childrenIds, id],
      };
    } else {
      nextRoots[anchorPly] = [...(nextRoots[anchorPly] ?? []), id];
    }

    return {
      moved: true,
      tree: {
        nodes: nextNodes,
        rootsByAnchorPly: nextRoots,
        nextSeq: tree.nextSeq + 1,
      },
      node,
    };
  } catch {
    return { moved: false, tree };
  }
}

/**
 * Plays a sequence of SAN moves (e.g. a Stockfish PV or Syzygy continuation)
 * into the variation tree, stopping safely before any invalid SAN.
 */
export function addVariationLine(
  tree: VariationTreeState,
  input: {
    anchorPly: number;
    anchorFen: string;
    parentId: string | null;
    sanMoves: string[];
  }
): { tree: VariationTreeState; nodeIds: string[]; lastNodeId: string | null } {
  let curTree = tree;
  let curParentId = input.parentId;
  const nodeIds: string[] = [];

  for (const san of input.sanMoves) {
    const parent = curParentId ? curTree.nodes[curParentId] : undefined;
    const fen = parent ? parent.fenAfter : input.anchorFen;
    try {
      const probe = new Chess(fen);
      const parsed = probe.move(san);
      if (!parsed) break;
      const step = playVariationMove(curTree, {
        anchorPly: parent ? parent.anchorPly : input.anchorPly,
        anchorFen: input.anchorFen,
        parentId: curParentId,
        from: parsed.from,
        to: parsed.to,
        promotion: parsed.promotion,
      });
      if (!step.moved || !step.node) break;
      curTree = step.tree;
      curParentId = step.node.id;
      nodeIds.push(step.node.id);
    } catch {
      break;
    }
  }

  return {
    tree: curTree,
    nodeIds,
    lastNodeId: nodeIds.length > 0 ? nodeIds[nodeIds.length - 1] : null,
  };
}

/** Attaches a live Stockfish PositionEval to a variation node when FENs match. */
export function attachVariationNodeEval(
  tree: VariationTreeState,
  nodeId: string,
  posEval: PositionEval
): VariationTreeState {
  const existing = tree.nodes[nodeId];
  if (!existing || existing.fenAfter !== posEval.fen) {
    return tree;
  }
  return {
    ...tree,
    nodes: {
      ...tree.nodes,
      [nodeId]: {
        ...existing,
        eval: posEval,
      },
    },
  };
}

/** Recursively removes a variation node and all of its descendants cleanly. */
export function deleteVariationBranch(
  tree: VariationTreeState,
  nodeId: string
): {
  tree: VariationTreeState;
  fallbackParentId: string | null;
  fallbackAnchorPly: number | null;
} {
  const target = tree.nodes[nodeId];
  if (!target) {
    return { tree, fallbackParentId: null, fallbackAnchorPly: null };
  }

  const toDelete = new Set<string>();
  const stack = [nodeId];
  while (stack.length > 0) {
    const curId = stack.pop()!;
    if (toDelete.has(curId)) continue;
    toDelete.add(curId);
    const cur = tree.nodes[curId];
    if (cur) {
      for (const childId of cur.childrenIds) {
        stack.push(childId);
      }
    }
  }

  const nextNodes: Record<string, VariationNode> = {};
  for (const [id, node] of Object.entries(tree.nodes)) {
    if (!toDelete.has(id)) {
      nextNodes[id] = node;
    }
  }

  const nextRoots = { ...tree.rootsByAnchorPly };
  if (target.parentId && nextNodes[target.parentId]) {
    nextNodes[target.parentId] = {
      ...nextNodes[target.parentId],
      childrenIds: nextNodes[target.parentId].childrenIds.filter((id) => id !== nodeId),
    };
  } else {
    const filtered = (nextRoots[target.anchorPly] ?? []).filter((id) => id !== nodeId);
    if (filtered.length > 0) {
      nextRoots[target.anchorPly] = filtered;
    } else {
      delete nextRoots[target.anchorPly];
    }
  }

  return {
    tree: {
      ...tree,
      nodes: nextNodes,
      rootsByAnchorPly: nextRoots,
    },
    fallbackParentId: target.parentId,
    fallbackAnchorPly: target.anchorPly,
  };
}

/** Promotes a variation node (or its containing branch at the nearest fork/root) to primary first position. */
export function promoteVariationChild(
  tree: VariationTreeState,
  nodeId: string
): VariationTreeState {
  let current: VariationNode | undefined = tree.nodes[nodeId];
  if (!current) return tree;

  // Walk up single-child chains (or already-first fork children) so clicking Promote on a leaf
  // promotes its enclosing alternative branch rather than silently performing a no-op.
  while (current.parentId) {
    const currentId = current.id;
    const parent: VariationNode | undefined = tree.nodes[current.parentId];
    if (!parent) return tree;
    const isPromotableForkChild =
      parent.childrenIds.length > 1 &&
      parent.childrenIds.includes(currentId) &&
      parent.childrenIds[0] !== currentId;
    if (isPromotableForkChild) {
      const reordered = [currentId, ...parent.childrenIds.filter((id) => id !== currentId)];
      return {
        ...tree,
        nodes: {
          ...tree.nodes,
          [parent.id]: { ...parent, childrenIds: reordered },
        },
      };
    }
    current = parent;
  }

  const rootId = current.id;
  const roots = tree.rootsByAnchorPly[current.anchorPly];
  if (!roots || !roots.includes(rootId)) return tree;
  return {
    ...tree,
    rootsByAnchorPly: {
      ...tree.rootsByAnchorPly,
      [current.anchorPly]: [rootId, ...roots.filter((id) => id !== rootId)],
    },
  };
}

/** Returns ordered nodes from the root variation move down to `nodeId`. */
export function getVariationLinePath(
  tree: VariationTreeState,
  nodeId: string
): VariationNode[] {
  const path: VariationNode[] = [];
  const visited = new Set<string>();
  let curId: string | null = nodeId;

  while (curId && !visited.has(curId)) {
    visited.add(curId);
    const node: VariationNode | undefined = tree.nodes[curId];
    if (!node) break;
    path.push(node);
    curId = node.parentId;
  }

  return path.reverse();
}

/** Resolves the primary child ID when stepping forward inside a variation or from an anchor. */
export function getStepForwardTarget(
  tree: VariationTreeState,
  activeNodeId: string | null,
  anchorPly: number | null
): string | null {
  if (activeNodeId) {
    return tree.nodes[activeNodeId]?.childrenIds[0] ?? null;
  }
  if (anchorPly !== null) {
    return tree.rootsByAnchorPly[anchorPly]?.[0] ?? null;
  }
  return null;
}

/**
 * Formats all variations anchored at `anchorPly` into linear display runs
 * (trunk first, followed by indented sidetracks for sibling alternatives).
 */
export function formatAnchorVariationRuns(
  tree: VariationTreeState,
  anchorPly: number
): VariationRun[] {
  const roots = tree.rootsByAnchorPly[anchorPly] ?? [];
  const runs: VariationRun[] = [];

  function collectTrunk(
    startId: string,
    parentNodeId: string | null,
    depth: number
  ): void {
    const trunkNodes: VariationNode[] = [];
    const deferredSidetracks: Array<{ sid: string; afterId: string }> = [];

    let curId: string | undefined = startId;
    while (curId) {
      const node: VariationNode | undefined = tree.nodes[curId];
      if (!node) break;
      trunkNodes.push(node);
      for (let i = 1; i < node.childrenIds.length; i++) {
        deferredSidetracks.push({ sid: node.childrenIds[i], afterId: node.id });
      }
      curId = node.childrenIds[0];
    }

    if (trunkNodes.length > 0) {
      runs.push({
        anchorPly,
        parentNodeId,
        depth,
        nodes: trunkNodes,
      });
    }

    for (const side of deferredSidetracks) {
      collectTrunk(side.sid, side.afterId, depth + 1);
    }
  }

  for (const rootId of roots) {
    collectTrunk(rootId, null, 0);
  }

  return runs;
}
