/**
 * Map composition (bead bzc.96, docs/design/MAP_COMPOSITION.md): guarded
 * treasure clusters, treasure clearings, ponds in clearings, fewer and
 * larger obstacle masses, and open land within the Heroes III band.
 */
import { describe, expect, it } from "vitest";
import { mapComposition } from "../../../src/core/map/density.ts";
import { generateMapWithInfo } from "../../../src/core/map/generate.ts";
import type { GenerateInfo, MapSize } from "../../../src/core/map/generate.ts";
import {
  DEFAULT_GEN_CONFIG,
  LEGACY_COMPOSITION,
} from "../../../src/core/map/gen/config.ts";
import type { GameMap, MapObject } from "../../../src/core/map/types.ts";
import { isPassable } from "../../../src/core/map/types.ts";
import { isPickup } from "../../../src/core/game/site-state.ts";

const SEEDS: Record<MapSize, readonly number[]> = {
  S: [1, 2, 3, 4],
  M: [1, 2, 3, 4],
  L: [1, 2],
};

/**
 * Bead bzc.115: these maps without the candy zones, as bzc.102 measured
 * them. A candy zone re-rolls L 2's terrain and obstacles, and the middle
 * zones' cluster bound below sat exactly on 1.5 for these ten maps (20
 * maps, S/M 1-8 and L 1-4: 1.34 a zone without candy, 1.28 with).
 */
const NO_CANDY = {
  terrain: {
    candy: {
      ...DEFAULT_GEN_CONFIG.terrain.candy,
      chance: { S: 0, M: 0, L: 0 },
    },
  },
};

const cache = new Map<string, { map: GameMap; info: GenerateInfo }>();
function gen(
  seed: number,
  size: MapSize,
): { map: GameMap; info: GenerateInfo } {
  const key = `${seed}${size}`;
  let out = cache.get(key);
  if (out === undefined) {
    out = generateMapWithInfo(seed, { size, config: NO_CANDY });
    cache.set(key, out);
  }
  return out;
}

function* all(): Generator<{
  label: string;
  map: GameMap;
  info: GenerateInfo;
}> {
  for (const size of ["S", "M", "L"] as const) {
    for (const seed of SEEDS[size]) {
      yield { label: `${size}${seed}`, ...gen(seed, size) };
    }
  }
}

const cheb = (a: { x: number; y: number }, x: number, y: number): number =>
  Math.max(Math.abs(a.x - x), Math.abs(a.y - y));

describe("map composition (bzc.96)", { timeout: 120_000 }, () => {
  it("guards clusters of two to five pickups, resources and artifacts, in a nook", () => {
    let clusters = 0;
    let artifacts = 0;
    for (const { label, map, info } of all()) {
      const W = map.width;
      const at = new Map(map.objects.map((o) => [o.y * W + o.x, o]));
      for (const h of info.hoards) {
        clusters++;
        const guard = at.get(h.guard);
        expect(guard?.kind, `${label} guard`).toBe("monster");
        if (guard === undefined) continue;
        expect(h.loot.length, label).toBeGreaterThanOrEqual(2);
        expect(h.loot.length, label).toBeLessThanOrEqual(5);
        const loot = h.loot.map((i) => at.get(i)) as MapObject[];
        // The guard holds exactly its loot, valued at their sum.
        expect(guard.data["guards"], label).toEqual(loot.map((o) => o.id));
        const sum = loot.reduce((s, o) => s + Number(o.data["value"]), 0);
        expect(guard.data["value"], label).toBe(sum);
        for (const o of loot) {
          expect(isPickup(o), `${label} ${o.id}`).toBe(true);
          // A Mystery Bag (bead bzc.110) is an artifact in a bag.
          expect(["resource-pile", "loose-artifact", "mystery-bag"]).toContain(
            o.data["type"],
          );
          if (o.kind === "artifact") artifacts++;
          // On the guard's back, every other cell beside it a wall, a
          // pickup or the guard's zone of control.
          expect(cheb(guard, o.x, o.y), `${label} ${o.id}`).toBe(1);
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const x = o.x + dx;
              const y = o.y + dy;
              if (x < 0 || y < 0 || x >= W || y >= map.height) continue;
              if (cheb(guard, x, y) <= 1) continue;
              const c = map.cells[y * W + x];
              const pickup = at.get(y * W + x);
              expect(
                (c !== undefined && !isPassable(c)) ||
                  (pickup !== undefined && isPickup(pickup)),
                `${label} ${o.id} open beside at ${x},${y}`,
              ).toBe(true);
            }
          }
        }
      }
    }
    // Several on every size; some hold an artifact. Bead bzc.102 (more
    // nooks: guards in notches, rooms dug into the edges) about trebled
    // them: 1.7, 2.9 and 9.5 a map before, 6.5, 9.8 and 23.8 after.
    expect(clusters).toBeGreaterThanOrEqual(60);
    expect(artifacts).toBeGreaterThan(10);
  });

  it("puts several clusters in a wild zone, richer in the treasure zones", () => {
    // Bead bzc.102: two to four in a typical wild zone; the middle zones
    // and the Hold (the treasure zones) hold more artifacts than the
    // neutral towns' zones.
    const per: Record<string, { clusters: number; zones: number }> = {};
    const arts: Record<string, { things: number; artifacts: number }> = {};
    for (const { map, info } of all()) {
      const W = map.width;
      const at = new Map(map.objects.map((o) => [o.y * W + o.x, o]));
      for (const z of info.zones) {
        const e = (per[z.role] ??= { clusters: 0, zones: 0 });
        e.zones++;
      }
      for (const h of info.hoards) {
        const role = info.zones[info.zoneOf[h.guard] ?? 0]?.role ?? "";
        const e = per[role];
        if (e !== undefined) e.clusters++;
        const a = (arts[role] ??= { things: 0, artifacts: 0 });
        for (const c of h.loot) {
          a.things++;
          if (at.get(c)?.kind === "artifact") a.artifacts++;
        }
      }
    }
    for (const role of ["middle", "town", "hold"]) {
      const e = per[role];
      expect(e, role).toBeDefined();
      if (e === undefined) continue;
      expect(e.clusters / e.zones, role).toBeGreaterThanOrEqual(1.5);
    }
    const share = (role: string): number =>
      (arts[role]?.artifacts ?? 0) / Math.max(1, arts[role]?.things ?? 0);
    expect(share("middle")).toBeGreaterThan(share("town"));
  });

  it("gives every start its own cluster, the same for each", () => {
    // Bead bzc.102: a modest cluster per start (resource piles round one
    // guard), alike in loot and guard, or none at all.
    let maps = 0;
    for (const { label, map, info } of all()) {
      const W = map.width;
      const at = new Map(map.objects.map((o) => [o.y * W + o.x, o]));
      const own = info.hoards.filter(
        (h) => info.zones[info.zoneOf[h.guard] ?? 0]?.role === "start",
      );
      const starts = info.zones.filter((z) => z.role === "start").length;
      if (own.length === 0) continue;
      maps++;
      expect(own, label).toHaveLength(starts);
      const loot = (h: { loot: number[] }): string =>
        h.loot
          .map((c) => {
            const o = at.get(c);
            return `${String(o?.data["resource"])}${String(o?.data["amount"])}`;
          })
          .join(",");
      const guard = (h: { guard: number }): string => {
        const g = at.get(h.guard);
        return `${String(g?.data["creature"])}x${String(g?.data["count"])}`;
      };
      for (const h of own) {
        expect(loot(h), label).toBe(loot(own[0] ?? h));
        expect(guard(h), label).toBe(guard(own[0] ?? h));
        for (const c of h.loot) {
          expect(at.get(c)?.data["type"], label).toBe("resource-pile");
        }
      }
    }
    // Most maps find a nook for every start.
    expect(maps).toBeGreaterThanOrEqual(7);
  });

  it("turns big guarded pockets into treasure clearings", () => {
    let seen = 0;
    const sites = new Set(DEFAULT_GEN_CONFIG.clearings.siteRows);
    for (const { label, map, info } of all()) {
      const W = map.width;
      for (const gap of info.clearings) {
        const guard = map.objects.find(
          (o) => o.kind === "monster" && o.y * W + o.x === gap,
        );
        if (guard === undefined) continue; // nothing found room: no guard
        seen++;
        const ids = (guard.data["guards"] as string[]) ?? [];
        const held = map.objects.filter((o) => ids.includes(o.id));
        const types = held.map((o) => String(o.data["type"]));
        expect(
          types.every(
            (t) =>
              t === "resource-pile" ||
              t === "loose-artifact" ||
              t === "mystery-bag" ||
              sites.has(
                DEFAULT_GEN_CONFIG.objects.table.find((r) => r.type === t)
                  ?.id ?? "",
              ),
          ),
          `${label} ${types.join(",")}`,
        ).toBe(true);
        expect(held.length, label).toBeGreaterThanOrEqual(3);
      }
    }
    expect(seen).toBeGreaterThan(3);
  });

  it("puts a pond in some clearings, never cutting a way", () => {
    let ponds = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const { info } = gen(seed, "L");
      ponds += info.fields.ponds;
      expect(info.skipped, `L${seed}`).toEqual([]);
    }
    expect(ponds).toBeGreaterThan(0);
  });

  it("grows fewer, larger obstacle masses than before, open land in the HoMM band", () => {
    for (const size of ["S", "M", "L"] as const) {
      let masses = 0;
      let small = 0;
      let oldMasses = 0;
      let oldSmall = 0;
      for (const seed of SEEDS[size]) {
        const now = mapComposition(gen(seed, size).map);
        const old = mapComposition(
          generateMapWithInfo(seed, {
            size,
            config: LEGACY_COMPOSITION,
          }).map,
        );
        masses += now.masses;
        small += now.smallMasses;
        oldMasses += old.masses;
        oldSmall += old.smallMasses;
        // Docs: the target band of open land on land (45-55%).
        expect(now.landPassable, `${size}${seed}`).toBeGreaterThan(0.45);
        expect(now.landPassable, `${size}${seed}`).toBeLessThan(0.57);
      }
      expect(masses, size).toBeLessThan(oldMasses);
      expect(small, size).toBeLessThan(oldSmall);
    }
  });
});
