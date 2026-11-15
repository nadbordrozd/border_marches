import { describe, expect, it } from "vitest";
import {
  massifCells,
  packMassif,
  segmentRun,
} from "../../src/render/map/massif.ts";
import type { MassifPlacement } from "../../src/render/map/massif.ts";
import { MASSIF_COUNTS } from "../../src/render/map/scene.ts";
import { createMap } from "../../src/core/map/types.ts";
import { buildSmallMap } from "../fixtures/small-map.ts";

const block = (w: number, h: number, x0 = 3, y0 = 2): [number, number][] => {
  const out: [number, number][] = [];
  for (let y = y0; y < y0 + h; y += 1)
    for (let x = x0; x < x0 + w; x += 1) out.push([x, y]);
  return out;
};

const covered = (pieces: MassifPlacement[]): string[] =>
  pieces
    .flatMap((p) =>
      Array.from({ length: p.columns }, (_, c) => `${p.x + c},${p.y}`),
    )
    .sort();

describe("packMassif", () => {
  it("covers every cell exactly once", () => {
    const cells = block(5, 4);
    const pieces = packMassif(cells, MASSIF_COUNTS);
    expect(covered(pieces)).toEqual(cells.map(([x, y]) => `${x},${y}`).sort());
  });

  it("is deterministic and independent of input order", () => {
    const cells = block(6, 3);
    const a = packMassif(cells, MASSIF_COUNTS);
    const b = packMassif([...cells].reverse(), MASSIF_COUNTS);
    expect(b).toEqual(a);
  });

  it("makes a piece tall only when every cell above it is mountain", () => {
    const cells: [number, number][] = [
      [2, 1],
      [3, 1],
      [2, 2],
      [3, 2],
      [4, 2],
      [3, 3],
      [4, 3],
      [5, 3],
    ];
    const set = new Set(cells.map(([x, y]) => `${x},${y}`));
    for (const p of packMassif(cells, MASSIF_COUNTS)) {
      const above = Array.from({ length: p.columns }, (_, c) =>
        set.has(`${p.x + c},${p.y - 1}`),
      );
      expect(p.tall).toBe(above.every(Boolean));
    }
  });

  it("lays ridges like bricks in a solid block", () => {
    const pieces = packMassif(block(6, 3), MASSIF_COUNTS);
    for (const p of pieces.filter((q) => q.columns === 2 && q.y > 2)) {
      const sameAbove = pieces.some(
        (q) => q.columns === 2 && q.y === p.y - 1 && q.x === p.x,
      );
      expect(sameAbove).toBe(false);
    }
  });

  it("never repeats the variant of its west neighbour of the same kind", () => {
    const pieces = packMassif(block(12, 1), MASSIF_COUNTS);
    for (let i = 1; i < pieces.length; i += 1) {
      const a = pieces[i - 1]!;
      const b = pieces[i]!;
      if (a.columns === b.columns && a.tall === b.tall)
        expect(b.variant).not.toBe(a.variant);
    }
  });
});

describe("segmentRun", () => {
  it("gives a diagonal staircase tall singles where rock is behind", () => {
    // Row 5 of a staircase: rock above columns 12 and 13 only.
    const cut = segmentRun(12, 5, 3, (x) => x === 12 || x === 13, new Set());
    const tallCells = cut.filter(([x, columns]) =>
      Array.from({ length: columns }, (_, c) => x + c).every(
        (cx) => cx === 12 || cx === 13,
      ),
    );
    expect(tallCells.reduce((sum, [, c]) => sum + c, 0)).toBe(2);
  });

  it("cuts a run exactly", () => {
    for (let length = 1; length <= 9; length += 1) {
      const cut = segmentRun(0, 0, length, () => false, new Set());
      expect(cut.reduce((sum, [, c]) => sum + c, 0)).toBe(length);
      let x = 0;
      for (const [at, c] of cut) {
        expect(at).toBe(x);
        x += c;
      }
    }
  });
});

describe("massifCells", () => {
  it("gives every mountain cell of the fixture a body or a share of one", () => {
    const map = buildSmallMap();
    const cells = massifCells(map, MASSIF_COUNTS);
    const mountains = map.cells.filter((c) => c.obstacle === "mountain").length;
    const bodies = [...cells.values()].flatMap((c) => c.bodies);
    expect(bodies.reduce((sum, p) => sum + p.columns, 0)).toBe(mountains);
    expect(massifCells(map, MASSIF_COUNTS)).toEqual(cells);
  });

  it("keeps a featured mountain cell a low single", () => {
    const map = createMap(4, 3, 1);
    for (const i of [1, 2, 5, 6]) map.cells[i]!.obstacle = "mountain";
    const featured = new Set([1]);
    const cells = massifCells(map, MASSIF_COUNTS, featured);
    const pieces = [...cells.values()].flatMap((c) => c.bodies);
    const feature = pieces.find((p) => p.x === 1 && p.y === 0);
    expect(feature).toMatchObject({ columns: 1, tall: false });
    // The piece south of the feature stays low.
    const south = pieces.find(
      (p) => p.y === 1 && p.x <= 1 && p.x + p.columns > 1,
    );
    expect(south?.tall).toBe(false);
  });
});
