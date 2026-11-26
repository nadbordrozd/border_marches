/**
 * Denser maps (bead bzc.50): about twice the things to do of the first
 * v0.2 maps, every placeable catalogue type on some map of each size, and
 * one-time pickups (taken from a cell beside them) that never seal a way
 * or slip past their guard.
 */
import { describe, expect, it } from "vitest";
import { mapDensity } from "../../../src/core/map/density.ts";
import { startTownsOf, travelCosts } from "../../../src/core/map/fairness.ts";
import { generateMapWithInfo } from "../../../src/core/map/generate.ts";
import type { GenerateInfo, MapSize } from "../../../src/core/map/generate.ts";
import type { GameMap, MapObject } from "../../../src/core/map/types.ts";
import { DIRECTIONS_8, cellAt, inBounds } from "../../../src/core/map/types.ts";
import { isPickup } from "../../../src/core/game/site-state.ts";
import {
  OBJECT_TYPE_IDS,
  type ObjectTypeId,
} from "../../../src/data/objectTypes.ts";

/** Fixed seeds per size (default players per size). */
const SEEDS: Record<MapSize, readonly number[]> = {
  S: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  M: [1, 2, 3, 4, 5, 6],
  L: [1, 2, 3, 4],
};

/**
 * Visitable objects per 100 passable cells before bead bzc.50 (seeds 1-8,
 * default players): S 11.1, M 10.9, L 9.9.
 */
const BEFORE: Record<MapSize, number> = { S: 11.1, M: 10.9, L: 9.9 };

const cache = new Map<string, { map: GameMap; info: GenerateInfo }>();
function gen(
  seed: number,
  size: MapSize,
): { map: GameMap; info: GenerateInfo } {
  const key = `${seed}${size}`;
  let out = cache.get(key);
  if (out === undefined) {
    out = generateMapWithInfo(seed, { size });
    cache.set(key, out);
  }
  return out;
}

function* all(): Generator<{ label: string; size: MapSize; map: GameMap }> {
  for (const size of ["S", "M", "L"] as const) {
    for (const seed of SEEDS[size]) {
      yield { label: `${size}${seed}`, size, map: gen(seed, size).map };
    }
  }
}

const typeOf = (o: MapObject): string => String(o.data["type"] ?? o.kind);

/** A one-time pickup taken from beside it (the game's rule). */
const beside = (o: MapObject): boolean => isPickup(o);

describe("denser maps (bzc.50)", { timeout: 120_000 }, () => {
  it("places every placeable catalogue type on some map of each size", () => {
    // Event tiles and signs are map-authored; the Keepers' Vault is a rule
    // of medium and large maps (CONTENT_MAP_OBJECTS 3.4).
    // The Mystery Bag (bead bzc.105) waits for its placing rule (bead
    // bzc.110, which drops it from this list).
    const authored: ObjectTypeId[] = ["event-tile", "sign", "mystery-bag"];
    // The desert sites (bead bzc.88) stand only on maps that roll a desert
    // (tests/core/map/desert.test.ts).
    const desert: ObjectTypeId[] = [
      "pyramid",
      "sphinx",
      "sun-temple",
      "sunken-tomb",
    ];
    // Bead bzc.95: gates need a loop between wild zones or a one-cell
    // choke with a way round, which an S map rarely has (one gate site in
    // seeds 1-14, a quest gate). Bead bzc.96 reserves room for the banks
    // (the Thunderstruck Pylon Yard is back on S) and sets the keymaster's
    // tents down before the fill, but cannot make the gate sites; a
    // follow-up bead looks at gate sites on S maps.
    const rareOnS: ObjectTypeId[] = ["border-gate", "keymasters-tent"];
    for (const size of ["S", "M", "L"] as const) {
      const seen = new Set<string>();
      for (const seed of SEEDS[size]) {
        for (const o of gen(seed, size).map.objects) seen.add(typeOf(o));
      }
      const missing = OBJECT_TYPE_IDS.filter(
        (t) =>
          !authored.includes(t) &&
          !desert.includes(t) &&
          !(size === "S" && t === "keepers-vault") &&
          !(size === "S" && rareOnS.includes(t)) &&
          !seen.has(t),
      );
      expect(missing, size).toEqual([]);
    }
  });

  it("is about twice as dense as before: 18 or more per 100 cells", () => {
    for (const { label, size, map } of all()) {
      const d = mapDensity(map);
      expect(d.visitable, label).toBeGreaterThanOrEqual(18);
      expect(d.visitable, label).toBeGreaterThan(1.6 * BEFORE[size]);
    }
  });

  it("keeps pickups off the roads, and with every pickup a wall, reaches everything", () => {
    for (const { label, map } of all()) {
      const w = map.width;
      const pickups = map.objects.filter(beside);
      expect(pickups.length, label).toBeGreaterThan(10);
      const walls = new Set(pickups.map((o) => o.y * w + o.x));
      for (const o of pickups) {
        expect(cellAt(map, o.x, o.y)?.road, `${label} ${o.id}`).toBe(false);
      }
      for (const t of startTownsOf(map)) {
        const d = travelCosts(map, t.x, t.y, { gatesOpen: true, avoid: walls });
        const at = (x: number, y: number): number => d[y * w + x] ?? Infinity;
        for (const o of map.objects) {
          if (walls.has(o.y * w + o.x)) {
            // Taken from any open cell next to it.
            const near = DIRECTIONS_8.some(
              ([dx, dy]) =>
                inBounds(map, o.x + dx, o.y + dy) &&
                Number.isFinite(at(o.x + dx, o.y + dy)),
            );
            expect(near, `${label} ${o.id} from ${t.id}`).toBe(true);
          } else {
            expect(
              Number.isFinite(at(o.x, o.y)),
              `${label} ${o.id} from ${t.id}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it("guards a pickup from every cell it can be taken from", () => {
    for (const { label, map } of all()) {
      const w = map.width;
      const walls = new Set(
        map.objects.filter(beside).map((o) => o.y * w + o.x),
      );
      const ids = new Map(map.objects.map((o) => [o.id, o]));
      const home = startTownsOf(map)[0];
      if (home === undefined) throw new Error(`${label}: no start`);
      for (const g of map.objects) {
        if (g.kind !== "monster" || g.data["pass"] === true) continue;
        const held = ((g.data["guards"] as string[] | undefined) ?? [])
          .map((id) => ids.get(id))
          .filter((o): o is MapObject => o !== undefined && beside(o));
        if (held.length === 0) continue;
        // With the guard's zone of control shut, no cell beside any of its
        // pickups can be reached.
        const zoc = new Set(walls);
        for (const [dx, dy] of [[0, 0], ...DIRECTIONS_8] as const) {
          if (inBounds(map, g.x + dx, g.y + dy)) {
            zoc.add((g.y + dy) * w + g.x + dx);
          }
        }
        const d = travelCosts(map, home.x, home.y, {
          gatesOpen: true,
          avoid: zoc,
        });
        for (const o of held) {
          for (const [dx, dy] of DIRECTIONS_8) {
            const x = o.x + dx;
            const y = o.y + dy;
            if (!inBounds(map, x, y)) continue;
            expect(
              d[y * w + x],
              `${label} ${o.id} (guard ${g.id}) from ${x},${y}`,
            ).toBe(Infinity);
          }
        }
      }
    }
  });

  it("keeps a single-cell prize's guard and its zone of control off the roads", () => {
    for (const { label, map } of all()) {
      const ids = new Map(map.objects.map((o) => [o.id, o]));
      const road = (x: number, y: number): boolean =>
        cellAt(map, x, y)?.road === true;
      for (const g of map.objects) {
        if (g.kind !== "monster" || g.data["pass"] === true) continue;
        const held = (g.data["guards"] as string[] | undefined) ?? [];
        const o = held.length === 1 ? ids.get(held[0] ?? "") : undefined;
        // Its own guard (a pocket's guard stands in the pocket's gap).
        if (o === undefined || o.footprint.w * o.footprint.h !== 1) continue;
        if (Math.max(Math.abs(o.x - g.x), Math.abs(o.y - g.y)) > 1) continue;
        for (const [dx, dy] of [[0, 0], ...DIRECTIONS_8] as const) {
          expect(road(g.x + dx, g.y + dy), `${label} ${g.id}`).toBe(false);
        }
      }
    }
  });
});
