import { describe, expect, it } from "vitest";
import {
  RELIEF,
  buildRelief,
  paintRelief,
  reliefInside,
} from "../../src/render/map/relief.ts";
import type { Relief } from "../../src/render/map/relief.ts";
import { featuredCells } from "../../src/render/map/scene.ts";
import { mountainMode } from "../../src/render/map/map-view.ts";
import { createMap } from "../../src/core/map/types.ts";
import type { GameMap, MapObject } from "../../src/core/map/types.ts";
import { generateMap } from "../../src/core/map/generate.ts";

const CELL = 80;
/** Least standard deviation (px) of the outline along a straight run. */
const RELIEF_MIN_EDGE_SD = 4;

/** A map from rows of "M" (mountain), "#" (road), "~" (water), "." open. */
function mapOf(rows: readonly string[]): GameMap {
  const map = createMap(rows[0]!.length, rows.length, 1);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const cell = map.cells[y * map.width + x]!;
      cell.terrain = ch === "~" ? "water" : "grass";
      if (ch === "M") cell.obstacle = "mountain";
      if (ch === "#") cell.road = true;
    }),
  );
  return map;
}

const reliefOf = (map: GameMap): Relief =>
  buildRelief(map, featuredCells(map, map.objects));

/** Paints the whole map in chunks of `size` px. */
function paintAll(relief: Relief, size = 640): Uint8ClampedArray {
  const W = relief.width * CELL;
  const H = relief.height * CELL;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y0 = 0; y0 < H; y0 += size)
    for (let x0 = 0; x0 < W; x0 += size) {
      const w = Math.min(size, W - x0);
      const h = Math.min(size, H - y0);
      const part = new Uint8ClampedArray(w * h * 4);
      paintRelief(relief, x0, y0, w, h, part);
      for (let y = 0; y < h; y += 1)
        out.set(
          part.subarray(y * w * 4, (y + 1) * w * 4),
          ((y0 + y) * W + x0) * 4,
        );
    }
  return out;
}

const RANGE = [
  "..........",
  "..MMMM....",
  "..MMMMMM..",
  ".MMMMMMM..",
  ".MM...MM..",
  "..........",
];

describe("low relief (bead xaj.25)", () => {
  it("is no longer the default: mountains are peaks (bead xaj.30)", () => {
    expect(mountainMode()).toBe("peaks");
  });

  it("is deterministic and continuous across chunks", () => {
    const relief = reliefOf(mapOf(RANGE));
    const whole = new Uint8ClampedArray(400 * 320 * 4);
    expect(paintRelief(relief, 120, 40, 400, 320, whole)).toBe(true);
    const again = new Uint8ClampedArray(400 * 320 * 4);
    paintRelief(relief, 120, 40, 400, 320, again);
    expect(again).toEqual(whole);
    // The same rectangle painted as four uneven parts.
    const parts = new Uint8ClampedArray(400 * 320 * 4);
    for (const [x, y, w, h] of [
      [120, 40, 160, 120],
      [280, 40, 240, 120],
      [120, 160, 160, 200],
      [280, 160, 240, 200],
    ] as const) {
      const part = new Uint8ClampedArray(w * h * 4);
      paintRelief(relief, x, y, w, h, part);
      for (let r = 0; r < h; r += 1)
        parts.set(
          part.subarray(r * w * 4, (r + 1) * w * 4),
          ((y - 40 + r) * 400 + (x - 120)) * 4,
        );
    }
    expect(parts).toEqual(whole);
  });

  it("paints nothing far from mountains", () => {
    const relief = reliefOf(mapOf(RANGE));
    const out = new Uint8ClampedArray(80 * 80 * 4);
    expect(paintRelief(relief, 0, 400, 80, 80, out)).toBe(false);
    expect(out.every((v) => v === 0)).toBe(true);
  });

  it("covers the range as one mass: no ground inside it", () => {
    const relief = reliefOf(mapOf(RANGE));
    const all = paintAll(relief, 320);
    const W = relief.width * CELL;
    // Every pixel deeper than the inward bite (43 px) plus the dithered
    // foot (12 px) inside the region cells is painted.
    for (let y = 0; y < relief.height * CELL; y += 2)
      for (let x = 0; x < W; x += 2) {
        let deep = true;
        for (const [dx, dy] of [
          [-60, 0],
          [60, 0],
          [0, -60],
          [0, 60],
          [-52, -52],
          [52, 52],
          [-52, 52],
          [52, -52],
        ] as const) {
          const cx = Math.floor((x + dx) / CELL);
          const cy = Math.floor((y + dy) / CELL);
          if (relief.region[cy * relief.width + cx] !== 1) deep = false;
        }
        if (deep) expect(all[(y * W + x) * 4 + 3]).toBe(255);
      }
  });

  it("never rises more than the cap above the region's northern cells", () => {
    for (const seed of [1, 2]) {
      const map = generateMap(seed, { size: "M" });
      const relief = reliefOf(map);
      const all = paintAll(relief);
      const W = map.width * CELL;
      const H = map.height * CELL;
      const margin = 32;
      let worst = 0;
      for (let sy = 0; sy < H; sy += 1)
        for (let sx = 0; sx < W; sx += 1) {
          if (all[(sy * W + sx) * 4 + 3] === 0) continue;
          // The lowest rise over a region cell near this pixel's column.
          let best = Infinity;
          const cx0 = Math.max(0, Math.floor((sx - margin) / CELL));
          const cx1 = Math.min(map.width - 1, Math.floor((sx + margin) / CELL));
          const cy0 = Math.max(0, Math.floor(sy / CELL) - 1);
          const cy1 = Math.min(map.height - 1, Math.floor(sy / CELL) + 2);
          for (let cy = cy0; cy <= cy1; cy += 1)
            for (let cx = cx0; cx <= cx1; cx += 1)
              if (relief.region[cy * map.width + cx] === 1)
                best = Math.min(best, Math.max(0, cy * CELL - sy));
          worst = Math.max(worst, best);
        }
      expect(worst).toBeLessThanOrEqual(RELIEF.cap + RELIEF.block);
    }
  }, 60000);

  it("keeps its foot inside the region plus a margin, off roads, objects and water", () => {
    const check = (map: GameMap): void => {
      const relief = reliefOf(map);
      const featured = featuredCells(map, map.objects);
      let inside = 0;
      for (let wy = 1; wy < map.height * CELL; wy += 3)
        for (let wx = 1; wx < map.width * CELL; wx += 3) {
          if (reliefInside(relief, wx, wy) <= 0) continue;
          inside += 1;
          const cx = Math.floor(wx / CELL);
          const cy = Math.floor(wy / CELL);
          const i = cy * map.width + cx;
          const cell = map.cells[i]!;
          expect(cell.road).toBe(false);
          expect(cell.terrain).not.toBe("water");
          expect(featured.has(i)).toBe(false);
          if (relief.region[i] === 1) continue;
          // Outside the region: within 32 px of a region cell.
          let near = false;
          for (let dy = -1; dy <= 1; dy += 1)
            for (let dx = -1; dx <= 1; dx += 1) {
              const x = cx + dx;
              const y = cy + dy;
              if (relief.region[y * map.width + x] !== 1) continue;
              const ex = Math.max(x * CELL - wx, 0, wx - (x + 1) * CELL);
              const ey = Math.max(y * CELL - wy, 0, wy - (y + 1) * CELL);
              if (Math.max(ex, ey) <= 32) near = true;
            }
          expect(near).toBe(true);
        }
      expect(inside).toBeGreaterThan(0);
    };
    // A road and a hero entrance hugging the range, and a lake.
    const map = mapOf([
      "...........",
      "..MMMM#....",
      "..MMMM#~~..",
      ".#MMMM..~..",
      ".#MMMM.....",
      "...........",
    ]);
    const hero: MapObject = {
      id: "hero",
      kind: "hero-start",
      x: 4,
      y: 5,
      footprint: { w: 1, h: 1 },
      blocked: [],
      data: {},
    };
    map.objects.push(hero);
    check(map);
    for (const seed of [1, 3]) check(generateMap(seed, { size: "M" }));
  }, 60000);

  it("bends every straight run of region edge (no ruler lines)", () => {
    const stds: number[] = [];
    for (const seed of [1, 2, 3]) {
      const map = generateMap(seed, { size: "M" });
      const relief = reliefOf(map);
      const { width, height } = map;
      const region = (x: number, y: number): boolean =>
        x >= 0 &&
        y >= 0 &&
        x < width &&
        y < height &&
        relief.region[y * width + x] === 1;
      const open = (x: number, y: number): boolean =>
        x >= 0 &&
        y >= 0 &&
        x < width &&
        y < height &&
        relief.region[y * width + x] !== 1 &&
        relief.forbidden[y * width + x] !== 1;
      // Edges facing N, S, W, E: [step along, step inward].
      const sides = [
        [1, 0, 0, 1],
        [1, 0, 0, -1],
        [0, 1, 1, 0],
        [0, 1, -1, 0],
      ] as const;
      for (const [ax, ay, ix, iy] of sides) {
        const seen = new Set<string>();
        for (let y = 0; y < height; y += 1)
          for (let x = 0; x < width; x += 1) {
            if (seen.has(`${x},${y}`)) continue;
            // A run starts at a region cell whose outward neighbour is open.
            let n = 0;
            while (
              region(x + ax * n, y + ay * n) &&
              open(x + ax * n - ix, y + ay * n - iy)
            ) {
              seen.add(`${x + ax * n},${y + ay * n}`);
              n += 1;
            }
            if (n < 3) continue;
            // The cell edge line, and the outline's offset (px inward)
            // along it, sampled every 4 px away from the run's ends.
            const ex = (ix === 1 ? x : ix === -1 ? x + 1 : 0) * CELL;
            const ey = (iy === 1 ? y : iy === -1 ? y + 1 : 0) * CELL;
            const offsets: number[] = [];
            for (let t = 24; t <= n * CELL - 24; t += 4) {
              const px = ax === 1 ? x * CELL + t : ex;
              const py = ay === 1 ? y * CELL + t : ey;
              let off = 60;
              for (let o = -24; o <= 60; o += 1)
                if (reliefInside(relief, px + ix * o, py + iy * o) > 0) {
                  off = o;
                  break;
                }
              offsets.push(off);
            }
            const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;
            const sd = Math.sqrt(
              offsets.reduce((a, b) => a + (b - mean) ** 2, 0) / offsets.length,
            );
            stds.push(sd);
          }
      }
    }
    expect(stds.length).toBeGreaterThan(30);
    // Every run of three cells or more wavers by several px.
    expect(Math.min(...stds)).toBeGreaterThan(RELIEF_MIN_EDGE_SD);
  }, 60000);

  it("lists a lip for every region cell open to the north", () => {
    const relief = reliefOf(mapOf(RANGE));
    const lips = relief.lips.map(([x, y]) => `${x},${y}`).sort();
    const expected: string[] = [];
    for (let y = 1; y < relief.height; y += 1)
      for (let x = 0; x < relief.width; x += 1)
        if (
          relief.region[y * relief.width + x] === 1 &&
          relief.region[(y - 1) * relief.width + x] !== 1
        )
          expected.push(`${x},${y}`);
    expect(lips).toEqual(expected.sort());
  });
});
