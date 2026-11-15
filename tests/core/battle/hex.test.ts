import { describe, expect, it } from "vitest";
import {
  BATTLE_HEX_COUNT,
  hexDistance,
  hexFromIndex,
  hexIndex,
  isAdjacent,
  neighbors,
} from "../../../src/core/battle/index.ts";

describe("odd-r hex grid", () => {
  it("lists neighbours E, SE, SW, W, NW, NE", () => {
    // Even row: SE/SW/NW/NE lean left.
    expect(neighbors({ col: 5, row: 4 })).toEqual([
      { col: 6, row: 4 },
      { col: 5, row: 5 },
      { col: 4, row: 5 },
      { col: 4, row: 4 },
      { col: 4, row: 3 },
      { col: 5, row: 3 },
    ]);
    // Odd row: shifted half a hex right.
    expect(neighbors({ col: 8, row: 5 })).toEqual([
      { col: 9, row: 5 },
      { col: 9, row: 6 },
      { col: 8, row: 6 },
      { col: 7, row: 5 },
      { col: 8, row: 4 },
      { col: 9, row: 4 },
    ]);
    expect(neighbors({ col: 0, row: 0 })).toHaveLength(2);
  });

  it("agrees between neighbours and distance 1, symmetrically", () => {
    for (let i = 0; i < BATTLE_HEX_COUNT; i++) {
      const a = hexFromIndex(i);
      expect(hexIndex(a)).toBe(i);
      const ns = new Set(neighbors(a).map(hexIndex));
      for (let j = 0; j < BATTLE_HEX_COUNT; j++) {
        const b = hexFromIndex(j);
        expect(isAdjacent(a, b)).toBe(ns.has(j));
        expect(hexDistance(a, b)).toBe(hexDistance(b, a));
      }
    }
  });

  it("measures distances across rows", () => {
    expect(hexDistance({ col: 0, row: 5 }, { col: 14, row: 5 })).toBe(14);
    expect(hexDistance({ col: 0, row: 0 }, { col: 0, row: 10 })).toBe(10);
    expect(hexDistance({ col: 0, row: 0 }, { col: 5, row: 10 })).toBe(10);
    expect(hexDistance({ col: 0, row: 0 }, { col: 6, row: 10 })).toBe(11);
  });
});
