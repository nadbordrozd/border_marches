/**
 * Map beauty iteration 2 (bead border_marches-xaj.13): frayed woods, the
 * doodad layer, the fog's second layer, and the manifest's pickup and mine
 * sprites. Roads follow the grid again (bead bzc.44): a hero's walk along a
 * road stays on the drawn road.
 */
import { describe, expect, it } from "vitest";
import {
  roadChains,
  roadPaths,
  roadSegments,
} from "../../src/render/map/road.ts";
import type { RoadSegment } from "../../src/render/map/road.ts";
import { findPathInContext } from "../../src/core/game/pathfinding.ts";
import { objectBlockedSet } from "../../src/core/map/types.ts";
import { buildNamedMap } from "../../src/core/map/named.ts";
import {
  DOODAD_CENTRE,
  DOODAD_GAP,
  DOODAD_SPRITE_WEIGHT,
  doodadSpecs,
  placeDoodads,
} from "../../src/render/map/doodads.ts";
import { doodadArt } from "../../src/render/map/doodad-art.ts";
import { buildGroundLayout } from "../../src/render/map/ground.ts";
import { FOG_TEXTURE_SIZE, fogTone } from "../../src/render/map/fog.ts";
import {
  doodadEntries,
  featuredCells,
  mineType,
  objectEntries,
  pickupKey,
} from "../../src/render/map/scene.ts";
import {
  ALL_ASSETS,
  DOODAD_ASSETS,
  CELL_PX,
  RESOURCE_MINES,
  RESOURCE_PICKUPS,
  TREASURE_PICKUP,
} from "../../src/assets/manifest.ts";
import { createMap } from "../../src/core/map/types.ts";
import type { GameMap } from "../../src/core/map/types.ts";
import { generateMap } from "../../src/core/map/generate.ts";
import { buildSmallMap } from "../fixtures/small-map.ts";

const CELL = CELL_PX;

/** A map with road cells at the given "x,y" positions. */
function roadMap(w: number, h: number, cells: [number, number][]): GameMap {
  const map = createMap(w, h, 1, "grass");
  for (const [x, y] of cells) map.cells[y * w + x]!.road = true;
  return map;
}

/** Distance (px) from a world point to the nearest road link. */
function roadDistance(
  segments: readonly RoadSegment[],
  px: number,
  py: number,
): number {
  let best = Number.POSITIVE_INFINITY;
  for (const s of segments) {
    const rx = px - s.ax;
    const ry = py - s.ay;
    const t = Math.max(
      0,
      Math.min(1, (rx * s.cx + ry * s.cy) / (s.length * s.length)),
    );
    best = Math.min(best, Math.hypot(rx - s.cx * t, ry - s.cy * t));
  }
  return best;
}

/** Cell centre in world px. */
const centre = (x: number, y: number): [number, number] => [
  x * CELL + CELL / 2,
  y * CELL + CELL / 2,
];

describe("grid roads", () => {
  it("draws a right-angle turn as an L through its corner cell", () => {
    const map = roadMap(6, 6, [
      [0, 2],
      [1, 2],
      [2, 2],
      [2, 3],
      [2, 4],
    ]);
    const chains = roadChains(map);
    expect(chains).toHaveLength(1);
    expect(chains[0]!.cells).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
      [2, 3],
      [2, 4],
    ]);
    // No shortcut across the corner.
    const [px, py] = centre(1.5, 2.5);
    expect(roadDistance(roadSegments(map), px, py)).toBeGreaterThan(CELL / 3);
  });

  it("keeps a straight diagonal road as one diagonal chain", () => {
    const map = roadMap(6, 6, [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
    const chains = roadChains(map);
    expect(chains).toHaveLength(1);
    expect(chains[0]!.cells).toHaveLength(4);
    for (const s of roadSegments(map))
      expect(s.length).toBeCloseTo(CELL * Math.SQRT2, 6);
  });

  it("joins every arm of a plain T at the junction cell", () => {
    const map = roadMap(7, 7, [
      [0, 3],
      [1, 3],
      [2, 3],
      [3, 3],
      [4, 3],
      [3, 4],
      [3, 5],
    ]);
    const segments = roadSegments(map);
    // Six orthogonal links, the three arms meeting at the junction's centre.
    expect(segments).toHaveLength(6);
    for (const s of segments) expect(s.length).toBe(CELL);
    const [jx, jy] = centre(3, 3);
    const touching = segments.filter(
      (s) =>
        Math.hypot(s.ax - jx, s.ay - jy) < 1e-6 ||
        Math.hypot(s.ax + s.cx - jx, s.ay + s.cy - jy) < 1e-6,
    );
    expect(touching).toHaveLength(3);
    // No slip roads round the corners.
    for (const [ax, ay, bx, by] of [
      [2, 3, 3, 4],
      [4, 3, 3, 4],
    ] as const) {
      const [px, py] = centre((ax + bx) / 2, (ay + by) / 2);
      expect(roadDistance(segments, px, py)).toBeGreaterThan(CELL / 3);
    }
    // Every path runs through cell centres.
    for (const path of roadPaths(map))
      for (const [x, y] of path) {
        expect((x - CELL / 2) % CELL).toBe(0);
        expect((y - CELL / 2) % CELL).toBe(0);
      }
  });

  it("paints every road cell of the named and generated maps", () => {
    for (const map of [
      buildNamedMap("keepers-toll"),
      buildNamedMap("hourglass-marches"),
      generateMap(1, { size: "M" }),
      generateMap(2, { size: "M" }),
    ]) {
      const segments = roadSegments(map);
      map.cells.forEach((cell, i) => {
        if (!cell.road) return;
        const [x, y] = centre(i % map.width, Math.floor(i / map.width));
        expect(roadDistance(segments, x, y)).toBeLessThan(1e-6);
      });
    }
  });

  it("keeps a hero's road walk on the drawn road (named map)", () => {
    const map = buildNamedMap("keepers-toll");
    const segments = roadSegments(map);
    const ctx = {
      map,
      nativeTerrain: null,
      objectBlocked: objectBlockedSet(map),
      monsterAt: new Map<number, string>(),
      enemyHeroAt: new Map<number, string>(),
      friendAt: new Set<number>(),
      guards: new Map<number, string[]>(),
      stops: new Set<number>(),
      explored: null,
      forestCost: null,
    };
    // Walks between road cells, corners included.
    const ends: number[] = [];
    map.cells.forEach((cell, i) => {
      if (cell.road && !ctx.objectBlocked.has(i)) ends.push(i);
    });
    let steps = 0;
    for (let k = 0; k < 60; k += 1) {
      const a = ends[(k * 7919) % ends.length]!;
      const b = ends[(k * 104729 + 31) % ends.length]!;
      const w = map.width;
      const path = findPathInContext(
        ctx,
        a % w,
        (a / w) | 0,
        b % w,
        (b / w) | 0,
      );
      let [px, py] = [a % w, (a / w) | 0];
      for (const s of path ?? []) {
        if (map.cells[py * w + px]!.road && map.cells[s.y * w + s.x]!.road) {
          steps += 1;
          for (let q = 0; q <= 4; q += 1) {
            const [x, y] = centre(
              px + ((s.x - px) * q) / 4,
              py + ((s.y - py) * q) / 4,
            );
            expect(roadDistance(segments, x, y)).toBeLessThan(1e-6);
          }
        }
        [px, py] = [s.x, s.y];
      }
    }
    expect(steps).toBeGreaterThan(200);
  });

  it("links cell centres, measured along the whole path", () => {
    const map = roadMap(10, 3, [
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1],
      [5, 1],
      [6, 1],
    ]);
    const segments = roadSegments(map);
    expect(segments).toHaveLength(6);
    for (const s of segments) {
      expect(s.length).toBe(CELL);
      expect(s.s0 + s.length).toBeLessThanOrEqual(s.total + 1e-6);
      // On the cells' centre line: no meander, no smoothing.
      expect(s.ay).toBe(1.5 * CELL);
      expect(s.cy).toBe(0);
    }
    expect(segments[0]!.total).toBe(6 * CELL);
  });
});

describe("doodads", () => {
  const map = generateMap(3, { size: "M" });
  const layout = buildGroundLayout(map);
  const featured = featuredCells(map, map.objects);
  const placed = placeDoodads(map, layout, featured);

  it("decorates open ground deterministically", () => {
    const open = map.cells.filter(
      (c) => c.terrain !== "water" && c.obstacle === "none",
    ).length;
    // Generated M maps run 33-40% decorated (more objects, fewer doodads);
    // this one was 40.4% before the generator placed drill yards and
    // one-way waystones (bead bzc.32) and is 39.2% now.
    expect(placed.length).toBeGreaterThan(open * 0.37);
    expect(placeDoodads(map, layout, featured)).toEqual(placed);
  });

  it("keeps off obstacles, roads, objects, water and (upright) cell centres", () => {
    for (const d of placed) {
      const index = d.row * map.width + d.col;
      const cell = map.cells[index]!;
      expect(cell.obstacle).toBe("none");
      expect(cell.terrain).not.toBe("water");
      expect(cell.road).toBe(false);
      expect(featured.has(index)).toBe(false);
      if (!d.spec.flat) {
        const bx = d.x + d.w / 2;
        const by = d.y + d.h - 2;
        const near =
          Math.abs(bx - (d.col * CELL + CELL / 2)) < DOODAD_CENTRE - 1 &&
          Math.abs(by - (d.row * CELL + CELL / 2)) < DOODAD_CENTRE + 7;
        expect(near).toBe(false);
      }
    }
  });

  it("spaces them out (blue noise)", () => {
    const bases = placed.map((d) => [d.x + d.w / 2, d.y + d.h] as const);
    let close = 0;
    for (let i = 0; i < bases.length; i += 1)
      for (let j = i + 1; j < bases.length; j += 1) {
        const [ax, ay] = bases[i]!;
        const [bx, by] = bases[j]!;
        if (Math.hypot(ax - bx, ay - by) < DOODAD_GAP / 3) close += 1;
      }
    expect(close).toBeLessThan(placed.length * 0.02);
  });

  it("strews every dedicated doodad sprite on its own ground, unless retired", () => {
    for (const doodad of DOODAD_ASSETS) {
      const spec = doodadSpecs()[doodad.terrain].find(
        (s) => s.key === doodad.key,
      );
      if (DOODAD_SPRITE_WEIGHT[doodad.key] === 0) expect(spec).toBeUndefined();
      else expect(spec?.weight).toBeGreaterThan(0);
    }
  });

  it("names only manifest images or code-drawn ones, all with pixels", () => {
    const keys = new Set(ALL_ASSETS.map((a) => a.key));
    for (const list of Object.values(doodadSpecs()))
      for (const spec of list) {
        if (spec.art === undefined) expect(keys.has(spec.key)).toBe(true);
        else {
          const art = doodadArt(
            spec.art.kind,
            spec.art.ground,
            spec.art.variant,
          );
          expect(art.key).toBe(spec.key);
          expect(art.data.length).toBe(art.w * art.h * 4);
          let opaque = 0;
          for (let i = 3; i < art.data.length; i += 4)
            if ((art.data[i] ?? 0) > 150) opaque += 1;
          expect(opaque).toBeGreaterThan(8);
        }
      }
    const small = buildSmallMap();
    const entries = doodadEntries(
      small,
      small.objects,
      buildGroundLayout(small),
    );
    expect(entries.every((e) => e.pass === "TALL_BODY")).toBe(true);
  });
});

describe("fog, objects", () => {
  it("repeats the fog only every 13 cells and shades it with a second layer", () => {
    expect(FOG_TEXTURE_SIZE).toBe(13 * CELL);
    const a = fogTone(100, 100);
    const b = fogTone(100 + FOG_TEXTURE_SIZE, 100);
    expect(a).not.toBeCloseTo(b, 3);
    for (let x = 0; x < 4000; x += 97)
      expect(Math.abs(fogTone(x, x * 0.7) - 1)).toBeLessThan(0.14);
  });

  it("draws pickups, chests and mines with the manifest's sprites", () => {
    expect(pickupKey("wood")).toBe(RESOURCE_PICKUPS.wood);
    expect(pickupKey("gold", true)).toBe(TREASURE_PICKUP);
    const mine = (data: Record<string, unknown>) =>
      mineType({
        id: "m",
        kind: "mine",
        x: 1,
        y: 0,
        footprint: { w: 2, h: 1 },
        blocked: [[0, 0]],
        data,
      });
    expect(mine({ resource: "essence" })).toBe("essence-spring");
    expect(mine({ type: "haunted-mine", resource: "ore" })).toBe(
      "haunted-mine",
    );
    const map = generateMap(1, { size: "M" });
    const keys = objectEntries(map.objects).flatMap((e) =>
      e.sprites.map((s) => s.key),
    );
    // The mines' 2x2-scale art (bead bzc.30), not the older RESOURCE_MINES.
    for (const type of ["sawmill", "ore-pit", "gold-mine", "essence-spring"])
      expect(keys).toContain(`map-object-${type}`);
    for (const key of Object.values(RESOURCE_MINES))
      expect(keys).not.toContain(key);
    expect(keys).toContain(RESOURCE_PICKUPS.wood);
    expect(keys).toContain(TREASURE_PICKUP);
    expect(keys.some((k) => k.startsWith("code:"))).toBe(false);
  });
});
