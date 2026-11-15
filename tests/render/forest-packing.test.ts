import { describe, expect, it } from "vitest";
import {
  forestCells,
  forestPlacementCells,
  packForestBlock,
} from "../../src/render/map/forest-packing.ts";
import { FOREST_COUNTS } from "../../src/render/map/scene.ts";
import { createMap } from "../../src/core/map/types.ts";
import { buildSmallMap } from "../fixtures/small-map.ts";

const BITS: [number, number, number][] = [
  [1, 0, 0],
  [2, 1, 0],
  [4, 0, 1],
  [8, 1, 1],
];

describe("packForestBlock", () => {
  it("covers every mask of a block exactly, deterministically", () => {
    for (let mask = 0; mask < 16; mask += 1) {
      for (const [bx, by] of [
        [0, 0],
        [3, 7],
        [11, 2],
      ] as const) {
        const packable = (x: number, y: number): boolean =>
          BITS.some(
            ([bit, dx, dy]) =>
              (mask & bit) !== 0 && x === 2 * bx + dx && y === 2 * by + dy,
          );
        const pieces = packForestBlock(packable, bx, by, FOREST_COUNTS);
        const cells = pieces
          .flatMap(forestPlacementCells)
          .map(([x, y]) => `${x},${y}`);
        const expected = BITS.filter(([bit]) => (mask & bit) !== 0).map(
          ([, dx, dy]) => `${2 * bx + dx},${2 * by + dy}`,
        );
        expect(cells.sort()).toEqual(expected.sort());
        expect(packForestBlock(packable, bx, by, FOREST_COUNTS)).toEqual(
          pieces,
        );
      }
    }
  });

  it("never joins cells that may not share a piece", () => {
    const pieces = packForestBlock(
      () => true,
      0,
      0,
      FOREST_COUNTS,
      (ax, _ay, bx) => ax === bx, // columns may not join
    );
    for (const piece of pieces) {
      const xs = new Set(forestPlacementCells(piece).map(([x]) => x));
      expect(xs.size).toBe(1);
    }
  });
});

describe("forestCells", () => {
  it("packs the fixture's woods with each cell in exactly one piece", () => {
    const map = buildSmallMap();
    const cells = forestCells(map, FOREST_COUNTS, () => 3);
    const pieces = [...cells.values()].flatMap((c) => c.bodies);
    const covered = pieces
      .flatMap(forestPlacementCells)
      .map(([x, y]) => `${x},${y}`);
    const forest = map.cells
      .map((c, i) =>
        c.obstacle === "forest"
          ? `${i % map.width},${Math.floor(i / map.width)}`
          : "",
      )
      .filter(Boolean);
    expect(covered.sort()).toEqual(forest.sort());
    expect(forestCells(map, FOREST_COUNTS, () => 3)).toEqual(cells);
  });

  it("splits a wood where the terrain (tree set) changes", () => {
    const map = createMap(2, 2, 1, "grass");
    for (const cell of map.cells) cell.obstacle = "forest";
    map.cells[1]!.terrain = "jungle";
    map.cells[3]!.terrain = "jungle";
    const cells = forestCells(map, FOREST_COUNTS, () => 3);
    for (const piece of [...cells.values()].flatMap((c) => c.bodies)) {
      const sets = new Set(
        forestPlacementCells(piece).map(
          ([x, y]) => map.cells[y * 2 + x]!.terrain,
        ),
      );
      expect(sets.size).toBe(1);
    }
    expect(cells.get(0)?.set).toBe("grass");
    expect(cells.get(1)?.set).toBe("jungle");
  });

  it("puts seam clumps only between different pieces", () => {
    const map = createMap(6, 6, 1, "grass");
    for (const cell of map.cells) cell.obstacle = "forest";
    const cells = forestCells(map, FOREST_COUNTS, () => 4);
    const pieceAt = new Map<string, unknown>();
    for (const c of cells.values())
      for (const p of c.bodies)
        for (const [x, y] of forestPlacementCells(p))
          pieceAt.set(`${x},${y}`, p);
    for (const [index, c] of cells) {
      const x = index % 6;
      const y = Math.floor(index / 6);
      if (c.eastSeam !== null)
        expect(pieceAt.get(`${x + 1},${y}`)).not.toBe(pieceAt.get(`${x},${y}`));
      if (c.northSeam !== null)
        expect(pieceAt.get(`${x},${y - 1}`)).not.toBe(pieceAt.get(`${x},${y}`));
    }
  });
});
