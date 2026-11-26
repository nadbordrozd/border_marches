/**
 * Roads keep clear of sites (bead bzc.95): "There shouldn't ordinarily be
 * buildings on top of a road. resources - sometimes. guardians -
 * sometimes. but not wells and stuff. just getting from A to B by road
 * shouldnt force me to enter things."
 *
 * No object a road may not cross (anything but a town, a hero start, a
 * guard, a gate or a resource pile) has its entrance or a footprint cell
 * on a road, on random maps of every size and on the named maps; guards
 * and resource piles stand on a road only now and then; the roads still
 * join every town they joined.
 */
import { describe, expect, it } from "vitest";
import { generateMap } from "../../../src/core/map/generate.ts";
import { roadMayCross } from "../../../src/core/map/gen/objects.ts";
import { NAMED_MAPS, buildNamedMap } from "../../../src/core/map/named.ts";
import {
  DIRECTIONS_8,
  inBounds,
  objectCells,
} from "../../../src/core/map/types.ts";
import type { GameMap } from "../../../src/core/map/types.ts";

const MAPS: Array<{ label: string; map: () => GameMap }> = [
  ...(["S", "M", "L"] as const).flatMap((size) =>
    [1, 2, 3, 4, 5, 6].map((seed) => ({
      label: `${size}${seed}`,
      map: () => generateMap(seed, { size }),
    })),
  ),
  ...[7, 8].map((seed) => ({
    label: `S${seed}/4p`,
    map: () => generateMap(seed, { size: "S", players: 4 }),
  })),
  ...NAMED_MAPS.map((m) => ({ label: m.id, map: () => buildNamedMap(m.id) })),
];

const built = new Map<string, GameMap>();
function* all(): Generator<{ label: string; map: GameMap }> {
  for (const { label, map } of MAPS) {
    let m = built.get(label);
    if (m === undefined) {
      m = map();
      built.set(label, m);
    }
    yield { label, map: m };
  }
}

const onRoad = (map: GameMap, x: number, y: number): boolean =>
  map.cells[y * map.width + x]?.road === true;

/** Road pieces (8-way), as a label per cell. */
function roadPieces(map: GameMap): Int32Array {
  const w = map.width;
  const part = new Int32Array(map.cells.length).fill(-1);
  let n = 0;
  for (let s = 0; s < map.cells.length; s++) {
    if (map.cells[s]?.road !== true || part[s] !== -1) continue;
    const stack = [s];
    part[s] = n;
    while (stack.length > 0) {
      const i = stack.pop() as number;
      for (const [dx, dy] of DIRECTIONS_8) {
        const x = (i % w) + dx;
        const y = Math.floor(i / w) + dy;
        if (!inBounds(map, x, y)) continue;
        const j = y * w + x;
        if (map.cells[j]?.road !== true || part[j] !== -1) continue;
        part[j] = n;
        stack.push(j);
      }
    }
    n++;
  }
  return part;
}

describe("roads keep clear of sites (bzc.95)", { timeout: 120_000 }, () => {
  it("puts no site, building, dwelling, mine or bank on a road", () => {
    for (const { label, map } of all()) {
      for (const o of map.objects) {
        if (roadMayCross(o) !== "never") continue;
        for (const [x, y] of objectCells(o)) {
          expect(onRoad(map, x, y), `${label} ${o.id} at (${x},${y})`).toBe(
            false,
          );
        }
      }
    }
  });

  it("lets a road cross a guard or a resource pile only now and then", () => {
    let guards = 0;
    let guardsOnRoad = 0;
    let piles = 0;
    let pilesOnRoad = 0;
    for (const { map } of all()) {
      for (const o of map.objects) {
        const rule = roadMayCross(o);
        const on = onRoad(map, o.x, o.y);
        if (o.kind === "monster") {
          guards++;
          if (on) guardsOnRoad++;
        } else if (rule === "pickup") {
          piles++;
          if (on) pilesOnRoad++;
        }
      }
    }
    expect(guardsOnRoad / guards).toBeLessThan(0.2);
    expect(pilesOnRoad / piles).toBeLessThan(0.1);
  });

  it("still joins every town of a random map by road", () => {
    for (const { label, map } of all()) {
      if (!/^[SML]\d/.test(label)) continue;
      const part = roadPieces(map);
      const towns = map.objects.filter((o) => o.kind === "town");
      const first = towns[0];
      if (first === undefined) throw new Error(`${label}: no town`);
      for (const t of towns) {
        expect(
          part[t.y * map.width + t.x],
          `${label} ${t.id} on the first town's road`,
        ).toBe(part[first.y * map.width + first.x]);
      }
    }
  });

  it("keeps each named map's towns on the roads they had", () => {
    // The Hourglass Marches closes one road on purpose (a fallen tree):
    // its western towns keep their own road.
    const pieces: Record<string, number> = {
      "keepers-toll": 1,
      "hourglass-marches": 2,
      "ninefold-landfall": 1,
    };
    for (const { label, map } of all()) {
      const want = pieces[label];
      if (want === undefined) continue;
      const part = roadPieces(map);
      const held = new Set(
        map.objects
          .filter((o) => o.kind === "town")
          .map((t) => part[t.y * map.width + t.x]),
      );
      expect(held.has(-1), `${label}: a town off the roads`).toBe(false);
      expect(held.size, label).toBe(want);
    }
  });
});
