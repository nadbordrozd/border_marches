/**
 * The review-only ground and tree switches (bead bzc.144,
 * src/render/map/ground-review.ts): off unless the URL asks, and the tree
 * preview keeps every tree's foot.
 */
import { afterEach, describe, expect, it } from "vitest";
import type {
  CanopyPlacement,
  CanopyTree,
} from "../../src/render/map/canopy.ts";
import {
  NO_REVIEW,
  groundReview,
  parseGroundReview,
  scaleContrast,
  scaleTint,
  setGroundReview,
} from "../../src/render/map/ground-review.ts";
import { reviewTreeScale } from "../../src/render/map/terrain-plan.ts";

afterEach(() => setGroundReview(NO_REVIEW));

describe("ground review switch", () => {
  it("is off without the URL switch", () => {
    expect(parseGroundReview("")).toBe(NO_REVIEW);
    expect(parseGroundReview("?mute=1&seed=4")).toBe(NO_REVIEW);
    expect(parseGroundReview("?groundReview=G9")).toBe(NO_REVIEW);
    expect(parseGroundReview("?treeScale=abc")).toBe(NO_REVIEW);
    // Outside a browser (no location) the game draws as it is.
    expect(groundReview()).toEqual(NO_REVIEW);
  });

  it("reads the variants and the tree scale", () => {
    expect(parseGroundReview("?groundReview=G0")).toMatchObject({
      legacy: true,
      spill: true,
      drift: 0,
      patches: false,
    });
    expect(parseGroundReview("?groundReview=G2")).toMatchObject({
      drift: 0.5,
      contrast: 0.5,
      treeScale: 1,
    });
    expect(parseGroundReview("?groundReview=G4&treeScale=1.5")).toMatchObject({
      edgeAmp: 0.5,
      edgeLine: false,
      treeScale: 1.5,
    });
    expect(parseGroundReview("?treeScale=1.25")).toMatchObject({
      name: "G1",
      treeScale: 1.25,
    });
    expect(parseGroundReview("?treeScale=9").treeScale).toBe(1);
  });

  it("scales contrast round the mean and tints toward 1", () => {
    const data = new Uint8ClampedArray([100, 50, 0, 255, 200, 150, 100, 255]);
    const out = scaleContrast({ width: 2, height: 1, data }, 0.5);
    expect([...out.data]).toEqual([125, 75, 25, 255, 175, 125, 75, 255]);
    expect(scaleTint([0.9, 1.1, 1], 0.5)).toEqual([0.95, 1.05, 1]);
  });

  it("grows trees round their foot, and leaves scale 1 alone", () => {
    const tree: CanopyTree = {
      key: "t",
      x: 90,
      y: 60,
      w: 20,
      h: 40,
      baseX: 100,
      baseY: 100,
      spill: false,
    };
    const placement = {
      trees: [tree],
      byCell: [[tree], undefined],
    } as unknown as CanopyPlacement;
    expect(reviewTreeScale(placement, 1)).toBe(placement);
    const big = reviewTreeScale(placement, 1.5);
    const grown = big.trees[0];
    expect(grown).toMatchObject({ x: 85, y: 40, w: 30, h: 60 });
    expect(grown?.baseX).toBe(100);
    expect(grown?.baseY).toBe(100);
    expect(big.byCell[0]?.[0]).toBe(grown);
    expect(big.byCell[1]).toBeUndefined();
  });
});
