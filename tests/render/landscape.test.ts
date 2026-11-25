/**
 * Map beauty iteration 2 (bead border_marches-xaj.13): smooth roads, frayed
 * woods, the doodad layer, tinted scree, the fog's second layer, and the
 * manifest's pickup and mine sprites.
 */
import { describe, expect, it } from "vitest";
import {
  roadChains,
  roadPaths,
  roadSegments,
  smoothPath,
} from "../../src/render/map/road.ts";
import {
  DOODAD_CENTRE,
  DOODAD_GAP,
  DOODAD_SPRITE_WEIGHT,
  doodadSpecs,
  placeDoodads,
} from "../../src/render/map/doodads.ts";
import { doodadArt } from "../../src/render/map/doodad-art.ts";
import {
  buildGroundLayout,
  screePalette,
} from "../../src/render/map/ground.ts";
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

/** The largest turn (radians) between successive segments of a path. */
function sharpestTurn(path: readonly (readonly [number, number])[]): number {
  let worst = 0;
  for (let k = 1; k + 1 < path.length; k += 1) {
    const [ax, ay] = path[k - 1]!;
    const [bx, by] = path[k]!;
    const [cx, cy] = path[k + 1]!;
    const a = Math.atan2(by - ay, bx - ax);
    const b = Math.atan2(cy - by, cx - bx);
    let d = Math.abs(b - a);
    if (d > Math.PI) d = 2 * Math.PI - d;
    worst = Math.max(worst, d);
  }
  return worst;
}

describe("smooth roads", () => {
  it("traces a turn as one chain with no shortcut across its corner", () => {
    const map = roadMap(6, 6, [
      [0, 2],
      [1, 2],
      [2, 2],
      [2, 3],
      [2, 4],
    ]);
    const chains = roadChains(map);
    expect(chains).toHaveLength(1);
    expect(chains[0]!.cells).toHaveLength(5);
  });

  it("splits a junction into chains that all end on the junction cell", () => {
    const map = roadMap(7, 7, [
      [0, 3],
      [1, 3],
      [2, 3],
      [3, 3],
      [4, 3],
      [3, 4],
      [3, 5],
    ]);
    const chains = roadChains(map);
    expect(chains).toHaveLength(3);
    for (const chain of chains) {
      const ends = [chain.cells[0], chain.cells[chain.cells.length - 1]];
      expect(ends.some((c) => c?.[0] === 3 && c?.[1] === 3)).toBe(true);
    }
    // Every path ends exactly at the junction cell's centre (a merge).
    const junction = [3 * CELL + CELL / 2, 3 * CELL + CELL / 2];
    for (const path of roadPaths(map)) {
      const ends = [path[0]!, path[path.length - 1]!];
      expect(
        ends.some(
          (p) =>
            Math.hypot(p[0] - junction[0]!, p[1] - junction[1]!) < CELL * 0.3,
        ),
      ).toBe(true);
    }
  });

  it("rounds a right-angle turn and a staircase into gentle curves", () => {
    const turn = smoothPath([
      [40, 40],
      [120, 40],
      [200, 40],
      [200, 120],
      [200, 200],
    ]);
    expect(sharpestTurn(turn)).toBeLessThan(0.45);
    const stairs: [number, number][] = [];
    for (let k = 0; k < 8; k += 1) {
      stairs.push([40 + k * 80, 40 + k * 80]);
      stairs.push([120 + k * 80, 40 + k * 80]);
    }
    expect(sharpestTurn(smoothPath(stairs))).toBeLessThan(0.45);
  });

  it("cuts the paths into short segments measured along the whole path", () => {
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
    expect(segments.length).toBeGreaterThan(6);
    for (const s of segments) {
      expect(s.length).toBeLessThan(CELL);
      expect(s.s0 + s.length).toBeLessThanOrEqual(s.total + 1e-6);
    }
    // The meander moves the road off the cells' centre line, but not far.
    const ys = segments.map((s) => s.ay);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(1);
    for (const y of ys) expect(Math.abs(y - 1.5 * CELL)).toBeLessThan(24);
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

describe("scree, fog, objects", () => {
  it("tints the scree from the ground it lies on", () => {
    const red = screePalette([180, 80, 40]);
    const green = screePalette([60, 160, 60]);
    expect(red.dust[0]).toBeGreaterThan(red.dust[2]);
    expect(green.dust[1]).toBeGreaterThan(green.dust[0]);
    expect(red.rock[0]).toBeLessThan(red.dust[0]);
  });

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
