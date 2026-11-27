/**
 * The naval generator (docs/design/NAVAL.md 8, bead bzc.155): the Water
 * modes None, Coast, Inland Sea and Islands; sea zones, straits and their
 * guards, landing cells, docks, the Islands starts' Shipyard and boat, the
 * sea fill, the two naval fairness measures, and dry maps unchanged.
 */
import { describe, expect, it } from "vitest";
import { HEAVY_TIMEOUT } from "../../timeouts.ts";
import {
  generateMap,
  generateMapWithInfo,
  waterModeFor,
  waterModesFor,
} from "../../../src/core/map/generate.ts";
import type {
  GenerateInfo,
  MapSize,
  WaterMode,
} from "../../../src/core/map/generate.ts";
import { mapFingerprint } from "../../../src/core/map/named.ts";
import { startFairness } from "../../../src/core/map/fairness.ts";
import type { GameMap, MapObject } from "../../../src/core/map/types.ts";
import { validateMap } from "../../../src/core/map/types.ts";
import {
  isSeaCell,
  seaMask,
  shipsFromMap,
  townDock,
} from "../../../src/core/game/naval.ts";
import { newGame } from "../../../src/core/game/newGame.ts";
import { HARBOUR_SHIPYARD, NAVAL_ARTIFACTS } from "../../../src/data/naval.ts";
import { SEA_GUARD_IDS, SEA_HOMES } from "../../../src/data/sea.ts";
import { SEA_OBJECT_TYPE_IDS } from "../../../src/data/sea-objects.ts";

const cache = new Map<string, { map: GameMap; info: GenerateInfo }>();
function gen(
  seed: number,
  size: MapSize,
  water?: WaterMode,
): { map: GameMap; info: GenerateInfo } {
  const k = `${seed}${size}${water ?? "-"}`;
  let m = cache.get(k);
  if (m === undefined) {
    m = generateMapWithInfo(
      seed,
      water === undefined ? { size } : { size, water },
    );
    cache.set(k, m);
  }
  return m;
}

const typeOf = (o: MapObject): string => String(o.data["type"] ?? o.kind);
const startTowns = (map: GameMap): MapObject[] =>
  map.objects
    .filter((o) => o.kind === "town" && typeof o.data["start"] === "number")
    .sort((a, b) => Number(a.data["start"]) - Number(b.data["start"]));

/**
 * Today's maps, pinned before bead bzc.155 (mapFingerprint of
 * generateMap(seed, { size })): Water None and no Water at all must still
 * make them byte for byte.
 */
const DRY: Record<string, string> = {
  "S:1": "af8e956c",
  "S:2": "8668d1ec",
  "S:3": "da87fed1",
  "M:1": "c2672b23",
  "M:2": "d388fbc9",
  "M:3": "becbb3c9",
  "L:1": "83ff39a6",
};

describe(
  "Water None: today's maps (bead bzc.155)",
  { timeout: HEAVY_TIMEOUT },
  () => {
    it("makes the same maps as before, with or without the option", () => {
      for (const [key, fp] of Object.entries(DRY)) {
        const [size, seed] = key.split(":") as [MapSize, string];
        const plain = generateMap(Number(seed), { size });
        expect(mapFingerprint(plain), key).toBe(fp);
        expect(plain.naval, key).toBeUndefined();
        const none = generateMap(Number(seed), { size, water: "none" });
        expect(mapFingerprint(none), `${key} none`).toBe(fp);
        expect(JSON.stringify(none)).toBe(JSON.stringify(plain));
      }
    });

    it("offers Inland Sea and Islands on M and up; smaller maps make Coast", () => {
      expect(waterModesFor("S")).toEqual(["none", "coast"]);
      expect(waterModesFor("SM")).toEqual(["none", "coast"]);
      for (const s of ["M", "L", "XL"] as const)
        expect(waterModesFor(s)).toEqual([
          "none",
          "coast",
          "inland",
          "islands",
        ]);
      expect(waterModeFor("S", "islands")).toBe("coast");
      expect(waterModeFor("M", "islands")).toBe("islands");
      const s = gen(1, "S", "islands");
      expect(s.info.sea?.mode).toBe("coast");
    });

    it("never draws a sea artifact on a dry map; a naval map can hold one", () => {
      const sea = (m: GameMap): boolean => {
        const text = JSON.stringify(m.objects);
        return NAVAL_ARTIFACTS.some((a) => text.includes(`"${a}"`));
      };
      for (const seed of [1, 2, 3]) expect(sea(gen(seed, "M").map)).toBe(false);
      const naval = [1, 2, 3, 4].some((seed) =>
        sea(gen(seed, "M", "islands").map),
      );
      expect(naval).toBe(true);
    });
  },
);

describe("naval maps (NAVAL 8)", { timeout: HEAVY_TIMEOUT }, () => {
  const MODES: ReadonlyArray<[WaterMode, MapSize, readonly [number, number]]> =
    [
      ["coast", "S", [0.05, 0.18]],
      ["coast", "M", [0.07, 0.16]],
      ["coast", "L", [0.07, 0.16]],
      ["inland", "M", [0.24, 0.36]],
      ["inland", "L", [0.24, 0.42]],
      ["islands", "M", [0.43, 0.6]],
      ["islands", "L", [0.43, 0.6]],
    ];

  it("are valid, naval, deterministic and within the water share", () => {
    for (const [water, size, [lo, hi]] of MODES) {
      for (const seed of [1, 2]) {
        const label = `${water} ${size} ${seed}`;
        const { map, info } = gen(seed, size, water);
        expect(validateMap(map), label).toEqual([]);
        expect(map.naval, label).toBe(true);
        expect(info.skipped, label).toEqual([]);
        const sea = info.sea;
        expect(sea, label).toBeDefined();
        if (sea === undefined) continue;
        expect(sea.bodies, label).toBeGreaterThan(0);
        expect(sea.share, label).toBeGreaterThanOrEqual(lo);
        expect(sea.share, label).toBeLessThanOrEqual(hi);
        // Every sea cell the generator counts is sea to the game.
        const mask = seaMask(map);
        let n = 0;
        for (let i = 0; i < mask.length; i++) n += mask[i] ?? 0;
        expect(n, label).toBeGreaterThanOrEqual(sea.seaCells);
      }
    }
    const again = generateMap(2, { size: "M", water: "islands" });
    expect(mapFingerprint(again)).toBe(
      mapFingerprint(gen(2, "M", "islands").map),
    );
  });

  it("keeps three or more landing cells on every coast", () => {
    for (const [water, size] of MODES) {
      for (const seed of [1, 2]) {
        const sea = gen(seed, size, water).info.sea;
        const counts = Object.entries(sea?.landings ?? {});
        expect(counts.length, `${water} ${size} ${seed}`).toBeGreaterThan(0);
        for (const [z, n] of counts)
          expect(
            n,
            `${water} ${size} ${seed} zone ${z}`,
          ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("guards every strait in its channel with a sea guard, Krakens at the Hold", () => {
    for (const [water, size] of MODES) {
      if (water === "coast") continue;
      for (const seed of [1, 2]) {
        const { map, info } = gen(seed, size, water);
        const label: string = `${water} ${size} ${seed}`;
        const straits = info.sea?.straits ?? [];
        if (water === "islands")
          expect(straits.length, label).toBeGreaterThan(0);
        for (const s of straits) {
          const guard = map.objects.find((o) => o.id === s.guard);
          expect(guard?.kind, label).toBe("monster");
          if (guard === undefined) continue;
          expect(guard.data["strait"], label).toBe(true);
          expect(isSeaCell(map, guard.x, guard.y), label).toBe(true);
          expect(SEA_GUARD_IDS, label).toContain(guard.data["creature"]);
          // The channel is 1-3 cells wide and inside the guard's zone.
          expect(s.channel.length, label).toBeLessThanOrEqual(6);
          for (const c of s.channel) {
            const x = c % map.width;
            const y = Math.floor(c / map.width);
            expect(
              Math.max(Math.abs(x - guard.x), Math.abs(y - guard.y)),
              label,
            ).toBeLessThanOrEqual(1);
          }
        }
        // The straits are the only ways between sea zones: with the
        // channels closed, no sea zone's water reaches another's.
        const zoneOf = info.sea?.seaZoneOf;
        if (zoneOf === undefined) continue;
        const shut = new Set(straits.flatMap((s) => s.channel));
        const w = map.width;
        for (let i = 0; i < zoneOf.length; i++) {
          const z: number = zoneOf[i] ?? -1;
          if (z < 0 || shut.has(i)) continue;
          for (const [dx, dy] of [
            [1, 0],
            [0, 1],
          ] as const) {
            const x = (i % w) + dx;
            const y = Math.floor(i / w) + dy;
            if (x >= w || y >= map.height) continue;
            const j = y * w + x;
            const o: number = zoneOf[j] ?? -1;
            if (o < 0 || o === z || shut.has(j)) continue;
            expect.fail(`${label}: sea zones ${z} and ${o} meet at ${i}`);
          }
        }
      }
    }
    // Islands: the strait into the Hold's waters is the strongest guard.
    for (const seed of [1, 2]) {
      const { map, info } = gen(seed, "M", "islands");
      const guards = (info.sea?.straits ?? []).map((s) =>
        map.objects.find((o) => o.id === s.guard),
      );
      const hold = guards.filter((g) => g?.data["holdStrait"] === true);
      expect(hold.length, `islands M ${seed}`).toBeGreaterThan(0);
      const top = Math.max(...guards.map((g) => Number(g?.data["fv"] ?? 0)));
      expect(Math.max(...hold.map((g) => Number(g?.data["fv"] ?? 0)))).toBe(
        top,
      );
    }
  });

  it("gives every Inland Sea and Islands start a dock; Islands starts a built Shipyard and a boat at it", () => {
    for (const [water, size] of MODES) {
      if (water === "coast") continue;
      for (const seed of [1, 2]) {
        const { map } = gen(seed, size, water);
        const label = `${water} ${size} ${seed}`;
        for (const t of startTowns(map)) {
          const dock = townDock(map, t.id);
          expect(dock, `${label} ${t.id}`).not.toBeNull();
          if (water !== "islands" || dock === null) continue;
          expect(t.data["shipyard"], label).toBe(true);
          const boat = map.objects.find(
            (o) => o.kind === "boat" && o.x === dock.x && o.y === dock.y,
          );
          expect(boat, `${label} boat at ${t.id}'s dock`).toBeDefined();
        }
      }
    }
    const { map } = gen(1, "M", "islands");
    const state = newGame(map, {
      players: [
        { kind: "human", faction: "humans" },
        { kind: "ai", faction: "undead" },
      ],
    });
    const owned = Object.values(state.towns).filter((t) => t.owner !== null);
    expect(owned.length).toBeGreaterThan(0);
    for (const t of owned) expect(t.buildings).toContain(HARBOUR_SHIPYARD);
    expect(state.ships?.length ?? 0).toBeGreaterThanOrEqual(
      startTowns(map).length,
    );
    expect(shipsFromMap(map).length).toBe(state.ships?.length);
  });

  it("fills the seas: about 1.5 sites per 100 sea cells, sea types only, pairs and docks set", () => {
    const seen = new Set<string>();
    for (const [water, size] of MODES) {
      for (const seed of [1, 2]) {
        const { map, info } = gen(seed, size, water);
        const label = `${water} ${size} ${seed}`;
        const sea = info.sea;
        if (sea === undefined) continue;
        const placed = map.objects.filter((o) =>
          (SEA_OBJECT_TYPE_IDS as readonly string[]).includes(typeOf(o)),
        );
        for (const o of placed) seen.add(typeOf(o));
        const visitable = placed.filter((o) => o.kind !== "boat").length;
        const want = (sea.seaCells * 1.5) / 100;
        expect(visitable, label).toBeGreaterThanOrEqual(Math.floor(want * 0.6));
        expect(visitable, label).toBeLessThanOrEqual(Math.ceil(want * 1.6) + 6);
        for (const o of placed) {
          const t = typeOf(o);
          if (t === "whirlpool" || t === "ferry-landing") {
            const twins = placed.filter(
              (p) => typeOf(p) === t && p.data["pair"] === o.data["pair"],
            );
            expect(twins.length, `${label} ${o.id}`).toBe(2);
          }
          if (t === "shipwright") {
            const d = o.data["dock"] as [number, number];
            expect(isSeaCell(map, d[0], d[1]), `${label} ${o.id}`).toBe(true);
          }
        }
        // Sea guards guard sea cells; land guards stand on land.
        for (const m of map.objects) {
          if (m.kind !== "monster") continue;
          const c = String(m.data["creature"]);
          if (isSeaCell(map, m.x, m.y))
            expect(
              SEA_GUARD_IDS as readonly string[],
              `${label} ${m.id}`,
            ).toContain(c);
        }
      }
    }
    // The common sea types all show up across these maps.
    for (const t of [
      "lighthouse",
      "moored-boat",
      "shipwright",
      "whirlpool",
      "krakens-deep",
      "flotsam",
      "buoy",
    ])
      expect(seen, t).toContain(t);
  });

  it("sizes sea guards from SEA_HOMES by ring where the count fits", () => {
    const { map } = gen(1, "L", "islands");
    let homed = 0;
    let all = 0;
    for (const m of map.objects) {
      if (m.kind !== "monster" || !isSeaCell(map, m.x, m.y)) continue;
      all++;
      const home = SEA_HOMES[m.data["creature"] as keyof typeof SEA_HOMES];
      const ring = Number(m.data["ring"]);
      if (ring >= home.rings[0] && ring <= home.rings[1]) homed++;
    }
    expect(all).toBeGreaterThan(10);
    expect(homed / all).toBeGreaterThan(0.6);
  });
});

describe("naval fairness (NAVAL 8.4)", { timeout: HEAVY_TIMEOUT }, () => {
  it("measures days to open sea and the first strait on naval maps only", () => {
    const dry = startFairness(gen(1, "M").map);
    for (const s of dry.starts) {
      expect(s.openSea).toBeUndefined();
      expect(s.firstStrait).toBeUndefined();
    }
    const naval = startFairness(gen(1, "M", "islands").map);
    for (const s of naval.starts) {
      expect(s.openSea).toBeGreaterThan(0);
      expect(s.openSea).toBeLessThan(2);
      expect(s.firstStrait).toBeGreaterThan(0);
    }
  });

  it("keeps the starts within the bounds: open sea within half a day, first strait within 25%", () => {
    let fair = 0;
    let maps = 0;
    for (const water of ["inland", "islands"] as const) {
      for (const seed of [1, 2, 3, 5, 6]) {
        const f = startFairness(gen(seed, "M", water).map);
        const open = f.starts.map((s) => s.openSea ?? 0);
        const str = f.starts.map((s) => s.firstStrait ?? 0);
        const top = Math.max(...str);
        // The first strait holds the same guard for every start.
        if (top > 0)
          expect(
            (top - Math.min(...str)) / top,
            `${water} ${seed}`,
          ).toBeLessThan(0.25);
        maps++;
        if (Math.max(...open) - Math.min(...open) < 0.5) fair++;
      }
    }
    // Days to open sea: within half a day on (nearly) every map.
    expect(fair / maps).toBeGreaterThanOrEqual(0.9);
  });
});

describe("generation time per size", { timeout: HEAVY_TIMEOUT }, () => {
  // Not a speed budget (those live in `npm run perf`): a hang guard, with
  // the times printed for the record.
  it("makes Islands maps of every size in reasonable time", () => {
    const times: string[] = [];
    for (const size of ["S", "M", "L"] as const) {
      const t = performance.now();
      const map = generateMap(7, { size, water: "islands" });
      const ms = performance.now() - t;
      times.push(`${size} ${Math.round(ms)} ms`);
      expect(map.naval).toBe(true);
      expect(ms).toBeLessThan(60_000);
    }
    console.info(`naval generation: ${times.join(", ")}`);
  });
});
