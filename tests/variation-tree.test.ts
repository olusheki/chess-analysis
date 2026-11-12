import { describe, it, expect } from "vitest";
import {
  addVariationLine,
  attachVariationNodeEval,
  createEmptyVariationTree,
  deleteVariationBranch,
  formatAnchorVariationRuns,
  getStepForwardTarget,
  getVariationLinePath,
  playVariationMove,
  promoteVariationChild,
} from "@/lib/analysis/variation-tree";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_1_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const PROMO_FEN = "4k3/P7/8/8/8/8/8/4K3 w - - 0 1";

describe("Analysis variation-tree engine", () => {
  it("plays sequential variation moves, creates sub-branches, and deduplicates identical siblings", () => {
    let tree = createEmptyVariationTree();

    const r1 = playVariationMove(tree, {
      anchorPly: 0,
      anchorFen: START_FEN,
      parentId: null,
      from: "d2",
      to: "d4",
    });
    expect(r1.moved).toBe(true);
    expect(r1.node?.san).toBe("d4");
    expect(r1.node?.uci).toBe("d2d4");
    expect(r1.node?.plyOffset).toBe(1);
    expect(r1.tree.nextSeq).toBe(2);
    tree = r1.tree;

    // Missing parentId rejects cleanly
    const missingParent = playVariationMove(tree, {
      anchorPly: 0,
      anchorFen: START_FEN,
      parentId: "v-does-not-exist",
      from: "e7",
      to: "e5",
    });
    expect(missingParent.moved).toBe(false);
    expect(missingParent.tree).toBe(tree);

    // Playing the exact same move again from anchor returns existing node without duplicating
    const r1Dup = playVariationMove(tree, {
      anchorPly: 0,
      anchorFen: START_FEN,
      parentId: null,
      from: "d2",
      to: "d4",
    });
    expect(r1Dup.moved).toBe(true);
    expect(r1Dup.node?.id).toBe(r1.node?.id);
    expect(tree.rootsByAnchorPly[0]).toHaveLength(1);

    // Extend child move 1...Nf6
    const r2 = playVariationMove(tree, {
      anchorPly: 0,
      anchorFen: START_FEN,
      parentId: r1.node!.id,
      from: "g8",
      to: "f6",
    });
    expect(r2.moved).toBe(true);
    expect(r2.node?.san).toBe("Nf6");
    expect(r2.node?.color).toBe("b");
    expect(r2.node?.moveNumber).toBe(1);
    expect(r2.node?.plyOffset).toBe(2);
    tree = r2.tree;

    // Branch a sibling 1...d5 off 1. d4
    const r2Alt = playVariationMove(tree, {
      anchorPly: 0,
      anchorFen: START_FEN,
      parentId: r1.node!.id,
      from: "d7",
      to: "d5",
    });
    expect(r2Alt.moved).toBe(true);
    expect(r2Alt.node?.san).toBe("d5");
    tree = r2Alt.tree;

    expect(tree.nodes[r1.node!.id].childrenIds).toEqual([r2.node!.id, r2Alt.node!.id]);
    expect(getVariationLinePath(tree, r2Alt.node!.id).map((n) => n.san)).toEqual(["d4", "d5"]);
  });

  it("handles promotions safely and rejects illegal moves", () => {
    const tree = createEmptyVariationTree();

    const illegal = playVariationMove(tree, {
      anchorPly: 0,
      anchorFen: START_FEN,
      parentId: null,
      from: "e2",
      to: "e5",
    });
    expect(illegal.moved).toBe(false);
    expect(illegal.node).toBeUndefined();

    // Auto-defaults promotion to queen if omitted, or honors explicit knight underpromotion
    const queenPromo = playVariationMove(tree, {
      anchorPly: 10,
      anchorFen: PROMO_FEN,
      parentId: null,
      from: "a7",
      to: "a8",
    });
    expect(queenPromo.moved).toBe(true);
    expect(queenPromo.node?.san).toBe("a8=Q+");
    expect(queenPromo.node?.uci).toBe("a7a8q");

    const knightPromo = playVariationMove(tree, {
      anchorPly: 10,
      anchorFen: PROMO_FEN,
      parentId: null,
      from: "a7",
      to: "a8",
      promotion: "n",
    });
    expect(knightPromo.moved).toBe(true);
    expect(knightPromo.node?.san).toBe("a8=N");
    expect(knightPromo.node?.uci).toBe("a7a8n");
  });

  it("imports full SAN variation lines, stops cleanly on bad SAN, and caches live PositionEval only when FEN matches", () => {
    const base = createEmptyVariationTree();
    const added = addVariationLine(base, {
      anchorPly: 1,
      anchorFen: AFTER_1_E4,
      parentId: null,
      sanMoves: ["c5", "Nf3", "d6", "notLegalSan", "Nc6"],
    });

    expect(added.nodeIds).toHaveLength(3);
    expect(added.lastNodeId).toBe(added.nodeIds[2]);
    const leaf = added.tree.nodes[added.lastNodeId!];
    expect(leaf.san).toBe("d6");
    expect(leaf.moveNumber).toBe(2);

    // Mismatched FEN must NOT overwrite eval
    const wrongEvalTree = attachVariationNodeEval(added.tree, leaf.id, {
      fen: START_FEN,
      depth: 14,
      bestMoveUci: "e2e4",
      bestMoveSan: "e4",
      whiteCp: 25,
      lines: [],
    });
    expect(wrongEvalTree.nodes[leaf.id].eval).toBeUndefined();

    // Matching FEN attaches eval cleanly
    const rightEvalTree = attachVariationNodeEval(added.tree, leaf.id, {
      fen: leaf.fenAfter,
      depth: 14,
      bestMoveUci: "d2d4",
      bestMoveSan: "d4",
      whiteCp: 35,
      lines: [{ multipv: 1, cp: 35, pvUci: ["d2d4"], pvSan: ["d4"] }],
    });
    expect(rightEvalTree.nodes[leaf.id].eval?.bestMoveSan).toBe("d4");
  });

  it("deletes subtrees recursively, promotes primary lines, and resolves forward navigation & printable runs", () => {
    let tree = createEmptyVariationTree();
    const l1 = addVariationLine(tree, {
      anchorPly: 1,
      anchorFen: AFTER_1_E4,
      parentId: null,
      sanMoves: ["e5", "Nf3", "Nc6"],
    });
    tree = l1.tree;

    const l2 = addVariationLine(tree, {
      anchorPly: 1,
      anchorFen: AFTER_1_E4,
      parentId: null,
      sanMoves: ["c5", "Nf3"],
    });
    tree = l2.tree;

    // Step forward from 1...e5 -> 2. Nf3
    expect(getStepForwardTarget(tree, l1.nodeIds[0], null)).toBe(l1.nodeIds[1]);
    // Step forward at leaf returns null
    expect(getStepForwardTarget(tree, l1.nodeIds[2], null)).toBeNull();

    // Promote 1...c5 ahead of 1...e5
    tree = promoteVariationChild(tree, l2.nodeIds[0]);
    expect(tree.rootsByAnchorPly[1][0]).toBe(l2.nodeIds[0]);
    expect(getStepForwardTarget(tree, null, 1)).toBe(l2.nodeIds[0]);

    // Add nested sub-variation 2. Nc3 Nc6 off 1...c5
    const nested = addVariationLine(tree, {
      anchorPly: 1,
      anchorFen: AFTER_1_E4,
      parentId: l2.nodeIds[0],
      sanMoves: ["Nc3", "Nc6"],
    });
    tree = nested.tree;

    // Check formatted runs include trunk + nested depth-1 sidetrack + second root
    const runs = formatAnchorVariationRuns(tree, 1);
    expect(runs).toHaveLength(3);
    expect(runs[0].depth).toBe(0);
    expect(runs[0].nodes.map((n) => n.san)).toEqual(["c5", "Nf3"]);
    expect(runs[1].depth).toBe(1);
    expect(runs[1].parentNodeId).toBe(l2.nodeIds[0]);
    expect(runs[1].nodes.map((n) => n.san)).toEqual(["Nc3", "Nc6"]);
    expect(runs[2].depth).toBe(0);
    expect(runs[2].nodes.map((n) => n.san)).toEqual(["e5", "Nf3", "Nc6"]);

    // Deleting 1...e5 removes all 3 of its descendants and falls back to anchorPly 1
    const del = deleteVariationBranch(tree, l1.nodeIds[0]);
    expect(del.fallbackParentId).toBeNull();
    expect(del.fallbackAnchorPly).toBe(1);
    expect(del.tree.nodes[l1.nodeIds[0]]).toBeUndefined();
    expect(del.tree.nodes[l1.nodeIds[1]]).toBeUndefined();
    expect(del.tree.nodes[l1.nodeIds[2]]).toBeUndefined();
    expect(del.tree.rootsByAnchorPly[1]).toEqual([l2.nodeIds[0]]);

    // Deleting a child node keeps parent & returns fallbackParentId
    const delChild = deleteVariationBranch(del.tree, l2.nodeIds[1]);
    expect(delChild.fallbackParentId).toBe(l2.nodeIds[0]);
    expect(delChild.fallbackAnchorPly).toBe(1);
    expect(delChild.tree.nodes[l2.nodeIds[0]].childrenIds).toEqual([nested.nodeIds[0]]);

    // Deleting remaining root cleans up rootsByAnchorPly entry completely
    const delLastRoot = deleteVariationBranch(delChild.tree, l2.nodeIds[0]);
    expect(Object.keys(delLastRoot.tree.nodes)).toHaveLength(0);
    expect(1 in delLastRoot.tree.rootsByAnchorPly).toBe(false);
    expect(formatAnchorVariationRuns(delLastRoot.tree, 1)).toEqual([]);

    // Edge cases: missing IDs, null anchors, and child-promotion reordering
    const emptyLine = addVariationLine(tree, {
      anchorPly: 0,
      anchorFen: START_FEN,
      parentId: null,
      sanMoves: ["InvalidMove99"],
    });
    expect(emptyLine.nodeIds).toEqual([]);
    expect(emptyLine.lastNodeId).toBeNull();

    const missingDel = deleteVariationBranch(tree, "missing-id");
    expect(missingDel).toEqual({ tree, fallbackParentId: null, fallbackAnchorPly: null });

    expect(promoteVariationChild(tree, "missing-id")).toBe(tree);
    const promotedChildTree = promoteVariationChild(tree, nested.nodeIds[0]);
    expect(promotedChildTree.nodes[l2.nodeIds[0]].childrenIds[0]).toBe(nested.nodeIds[0]);

    // Promoting from a single-child leaf (1...c5 -> 2. Nf3 while [e5, c5] roots exist) walks up and promotes the root branch
    const rootFirstBeforeLeafPromote = addVariationLine(createEmptyVariationTree(), {
      anchorPly: 1,
      anchorFen: AFTER_1_E4,
      parentId: null,
      sanMoves: ["e5", "Nf3"],
    });
    const secondBranch = addVariationLine(rootFirstBeforeLeafPromote.tree, {
      anchorPly: 1,
      anchorFen: AFTER_1_E4,
      parentId: null,
      sanMoves: ["c5", "Nf3"],
    });
    expect(secondBranch.tree.rootsByAnchorPly[1]).toEqual([
      rootFirstBeforeLeafPromote.nodeIds[0],
      secondBranch.nodeIds[0],
    ]);
    const leafPromoted = promoteVariationChild(secondBranch.tree, secondBranch.nodeIds[1]);
    expect(leafPromoted.rootsByAnchorPly[1]).toEqual([
      secondBranch.nodeIds[0],
      rootFirstBeforeLeafPromote.nodeIds[0],
    ]);

    expect(getVariationLinePath(tree, "missing-id")).toEqual([]);
    expect(getStepForwardTarget(tree, null, null)).toBeNull();
    expect(getStepForwardTarget(tree, null, 999)).toBeNull();
    expect(getStepForwardTarget(tree, "missing-id", null)).toBeNull();
  });
});
