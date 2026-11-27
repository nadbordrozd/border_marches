/**
 * The candy zones' sites in the generator (bead border_marches-bzc.124,
 * CONTENT_MAP_OBJECTS 3.13): each candy zone gets a Gingerbread Cottage, a
 * Sugar Fountain and a Sweet Shop on its frosting; they keep off the roads
 * (bead bzc.95) and out of every passage (bead bzc.110); a map without a
 * candy zone has none.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_GEN_CONFIG,
  generateMapWithInfo,
} from "../../../src/core/map/generate.ts";
import { validateMap } from "../../../src/core/map/types.ts";
import type { GameMap, MapObject } from "../../../src/core/map/types.ts";
import { findObstructions } from "../../../src/core/map/passages.ts";
import { NAMED_MAPS, namedConfig } from "../../../src/core/map/named.ts";
import { CANDY_SITES, candySites } from "../../../src/core/map/gen/candy.ts";
import type { GenState } from "../../../src/core/map/gen/state.ts";
import { getCreature } from "../../../src/data/creatures.ts";
import type { MapSize, PlayerCount } from "../../../src/core/map/generate.ts";

const NO_CANDY = {
  terrain: {
    candy: {
      ...DEFAULT_GEN_CONFIG.terrain.candy,
      chance: { S: 0, M: 0, L: 0 },
    },
  },
};

/**
 * Seeds (2 players) with a candy zone (tests/core/map/candy.test.ts and
 * more): the medium and large ones hold all three sites in it; the small
 * map's narrow candy zone (S6) has room for the cottage only ("as room
 * allows", like the desert's sites).
 */
const WITH: [number, MapSize, PlayerCount][] = [
  [3, "M", 2],
  [10, "M", 2],
  [6, "S", 2],
  [4, "L", 2],
  [12, "L", 2],
];

const ofType = (map: GameMap, type: string): MapObject[] =>
  map.objects.filter((o) => o.data["type"] === type);
const cellsOf = (o: MapObject): Array<[number, number]> => [
  [o.x, o.y],
  ...o.blocked,
];

describe("candy sites in the generator", { timeout: 120_000 }, () => {
  it("lists a cottage, a fountain and a shop for each candy zone", () => {
    const st = {
      zones: [
        { id: 0, main: "grass", tier: 0 },
        { id: 1, main: "frosting", tier: 2 },
        { id: 2, main: "frosting", tier: 5 },
      ],
    } as unknown as GenState;
    expect(candySites(st)).toEqual([
      ...CANDY_SITES.map((type) => ({ type, zone: 1, tier: 2 })),
      ...CANDY_SITES.map((type) => ({ type, zone: 2, tier: 3 })),
    ]);
    const plain = { zones: [{ id: 0, main: "grass" }] } as unknown as GenState;
    expect(candySites(plain)).toEqual([]);
  });

  it("puts every candy zone's three sites on its frosting, off the roads and out of the ways", () => {
    let placed = 0;
    let onFrosting = 0;
    for (const [seed, size, players] of WITH) {
      const { map, info } = generateMapWithInfo(seed, { size, players });
      const label = `${size}${seed}`;
      const candy = new Set(
        info.zones.filter((z) => z.main === "frosting").map((z) => z.id),
      );
      expect(candy.size, label).toBeGreaterThan(0);
      const zoneAt = (x: number, y: number): number =>
        info.zoneOf[y * map.width + x] ?? -1;
      const cell = (x: number, y: number) => map.cells[y * map.width + x];
      for (const type of CANDY_SITES) {
        const found = ofType(map, type);
        // The cottage, placed first, always finds room; the others as
        // room allows (all of them on the medium and large maps).
        if (size !== "S" || type === "gingerbread-cottage")
          expect(found.length, `${label} ${type}`).toBe(candy.size);
        for (const o of found) {
          expect(candy.has(zoneAt(o.x, o.y)), `${label} ${o.id}`).toBe(true);
          placed += 1;
          // On frosting while a frosting site is free (the last try takes
          // the zone's grass or steppe patches).
          if (cell(o.x, o.y)?.terrain === "frosting") onFrosting += 1;
          expect(o.data["value"]).toBeGreaterThan(0);
          // Bead bzc.95: no footprint cell on a road.
          for (const [x, y] of cellsOf(o))
            expect(cell(x, y)?.road === true, `${label} ${o.id} road`).toBe(
              false,
            );
        }
      }
      for (const o of ofType(map, "gingerbread-cottage")) {
        expect(["medium", "large"]).toContain(o.data["size"]);
        const guard = o.data["guard"] as Array<{ creature: string }>;
        expect(guard.length).toBeGreaterThan(0);
        for (const g of guard)
          expect(getCreature(g.creature).faction).toBe("candy");
        // Its guard is inside: no stack on the map watches it.
        const watched = map.objects.some(
          (m) =>
            m.kind === "monster" &&
            Array.isArray(m.data["guards"]) &&
            (m.data["guards"] as string[]).includes(o.id),
        );
        expect(watched, `${label} ${o.id}`).toBe(false);
      }
      for (const o of ofType(map, "sweet-shop"))
        expect((o.data["stock"] as string[]).length).toBe(3);
      // Bead bzc.110: no building stands in a passage.
      expect(findObstructions(map).blockers, label).toEqual([]);
      expect(validateMap(map), label).toEqual([]);
    }
    expect(placed).toBeGreaterThanOrEqual(13);
    expect(onFrosting / placed).toBeGreaterThan(0.8);
  });

  it("is switched by objects.candySites: on by default, off on the named maps", () => {
    expect(DEFAULT_GEN_CONFIG.objects.candySites).toBe(true);
    for (const def of NAMED_MAPS)
      expect(namedConfig(def).objects?.candySites, def.id).toBe(false);
    const [seed, size, players] = WITH[0]!;
    const { map, info } = generateMapWithInfo(seed, {
      size,
      players,
      config: { objects: { candySites: false } },
    });
    expect(info.zones.some((z) => z.main === "frosting")).toBe(true);
    for (const t of CANDY_SITES) expect(ofType(map, t)).toEqual([]);
  });

  it("puts no candy site on a map without a candy zone", () => {
    for (let seed = 1; seed <= 4; seed += 1) {
      const { map, info } = generateMapWithInfo(seed, {
        size: "M",
        players: 2,
        config: NO_CANDY,
      });
      expect(info.zones.some((z) => z.main === "frosting")).toBe(false);
      for (const t of CANDY_SITES) expect(ofType(map, t)).toEqual([]);
    }
  });
});
