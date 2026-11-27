/**
 * The swamp (bead border_marches-bzc.126): its ground data, where the
 * generator puts the swamp zones, and the swamp sites in them.
 */
import { describe, expect, it } from "vitest";
import { HEAVY_TIMEOUT } from "../../timeouts.ts";
import { TERRAIN_MOVE_COST } from "../../../src/data/movement.ts";
import { decorationKindsFor } from "../../../src/data/decorations.ts";
import {
  DEFAULT_GEN_CONFIG,
  generateMapWithInfo,
} from "../../../src/core/map/generate.ts";
import { TERRAINS, validateMap } from "../../../src/core/map/types.ts";
import { SWAMP_SITES } from "../../../src/core/map/gen/swamp.ts";
import { NAMED_MAPS, namedConfig } from "../../../src/core/map/named.ts";
import {
  GROUND_FAMILY,
  GROUND_SWATCHES,
  GROUND_TEXTURES,
} from "../../../src/assets/manifest.ts";
import { FOREST_FAMILY } from "../../../src/assets/ground-family.ts";
import { peaksOf } from "../../../src/assets/peaks.ts";
import { TREE_SPECIES_WEIGHTS, treesOf } from "../../../src/assets/trees.ts";
import { findObstructions } from "../../../src/core/map/passages.ts";
import type { MapSize, PlayerCount } from "../../../src/core/map/generate.ts";

describe("swamp ground data", () => {
  it("is a land terrain, the slowest one", () => {
    expect(TERRAINS).toContain("swamp");
    expect(TERRAIN_MOVE_COST.swamp).toBe(175);
    expect(DEFAULT_GEN_CONFIG.movement.cost.swamp).toBe(175);
    for (const t of TERRAINS)
      if (t !== "swamp" && t !== "water")
        expect(TERRAIN_MOVE_COST[t] ?? 0, t).toBeLessThan(175);
  });

  it("has its own texture, swatch, trees and peaks", () => {
    expect(GROUND_TEXTURES.swamp.path).toBe("assets/terrain/grounds/swamp.png");
    expect(GROUND_TEXTURES.swamp.w).toBe(GROUND_TEXTURES.swamp.columns * 80);
    expect(GROUND_SWATCHES.swamp.w).toBe(80);
    expect(GROUND_FAMILY.swamp).toBe("swamp");
    // Battles borrow the jungle family's imported tree clumps.
    expect(FOREST_FAMILY.swamp).toBe("jungle");
    for (const species of Object.keys(TREE_SPECIES_WEIGHTS.swamp))
      expect(treesOf("swamp", species).length, species).toBeGreaterThan(0);
    for (const tier of ["foothill", "peak", "summit"])
      expect(
        peaksOf("swamp").filter((p) => p.tier === tier).length,
        tier,
      ).toBeGreaterThanOrEqual(3);
    // Nothing of the older grounds moved.
    expect(GROUND_FAMILY.frosting).toBe("frosting");
    expect(FOREST_FAMILY.frosting).toBe("grass");
  });

  it("has swamp decorations and props of its own", () => {
    const passable = decorationKindsFor("swamp", true);
    const props = decorationKindsFor("swamp", false);
    const own = (ks: typeof passable) =>
      ks.filter((k) => k.terrains.length === 1 && k.terrains[0] === "swamp");
    expect(own(passable).length).toBeGreaterThanOrEqual(10);
    expect(own(props).length).toBeGreaterThanOrEqual(5);
  });
});

const NO_SWAMP = {
  terrain: {
    swamp: {
      ...DEFAULT_GEN_CONFIG.terrain.swamp,
      chance: { S: 0, M: 0, L: 0 },
    },
  },
};

/** Seeds (2 players) with a swamp. */
const WITH: [number, MapSize, PlayerCount][] = [
  [3, "S", 2],
  [1, "M", 2],
  [8, "L", 2],
];

const KINDS = ["volcanic", "snow", "sand", "frosting"];

describe("swamp zones in the generator", { timeout: HEAVY_TIMEOUT }, () => {
  it("turns a wild zone away from the starts into a swamp on some maps, with its sites", () => {
    for (const [seed, size, players] of WITH) {
      const { map, info } = generateMapWithInfo(seed, { size, players });
      const zones = info.zones.filter((z) => z.main === "swamp");
      expect(zones.length, `seed ${seed}`).toBe(1);
      for (const z of zones) {
        expect(z.role).toBe("middle");
        expect(z.tier).toBeGreaterThanOrEqual(1);
        expect(["jungle", "grass"]).toContain(z.secondary);
      }
      const at = (x: number, y: number) => map.cells[y * map.width + x];
      expect(
        map.cells.filter((c) => c.terrain === "swamp").length,
      ).toBeGreaterThan(80);
      expect(validateMap(map)).toEqual([]);
      // One of each swamp site, on swamp ground in the swamp zone, never
      // on a road and never closing a passage (beads bzc.95 and bzc.110).
      for (const type of SWAMP_SITES) {
        const objs = map.objects.filter((o) => o.data["type"] === type);
        expect(objs.length, `${type} seed ${seed}`).toBe(1);
        const o = objs[0]!;
        expect(at(o.x, o.y)?.terrain, type).toBe("swamp");
        expect(info.zoneOf[o.y * map.width + o.x]).toBe(zones[0]!.id);
        expect(at(o.x, o.y)?.road ?? false, `${type} on a road`).toBe(false);
      }
      const blockers = findObstructions(map).blockers;
      for (const o of map.objects)
        if (SWAMP_SITES.some((t) => t === o.data["type"]))
          expect(blockers, `seed ${seed}`).not.toContain(o.id);
      // The temple is a bank: its guard is inside.
      const temple = map.objects.find(
        (o) => o.data["type"] === "drowned-temple",
      )!;
      expect(Array.isArray(temple.data["guard"])).toBe(true);
      // Its own decorations stand on it.
      const own = new Set(
        [
          ...decorationKindsFor("swamp", true),
          ...decorationKindsFor("swamp", false),
        ]
          .filter((k) => k.terrains.length === 1)
          .map((k) => k.id),
      );
      const mine = (map.decorations ?? []).filter((d) => own.has(d.id));
      expect(mine.length, `seed ${seed}`).toBeGreaterThan(3);
      for (const d of mine) expect(at(d.x, d.y)?.terrain).toBe("swamp");
    }
  });

  it("never puts a swamp next to a volcanic, winter, desert or candy zone", () => {
    for (const [seed, size, players] of WITH) {
      const { map, info } = generateMapWithInfo(seed, { size, players });
      const kind = (i: number): string =>
        info.zones[info.zoneOf[i] ?? -1]?.main ?? "";
      const W = map.width;
      for (let i = 0; i < map.cells.length; i += 1) {
        if (kind(i) !== "swamp") continue;
        const x = i % W;
        const near = [i - W, i + W];
        if (x > 0) near.push(i - 1);
        if (x < W - 1) near.push(i + 1);
        for (const j of near)
          if (j >= 0 && j < map.cells.length)
            expect(KINDS, `seed ${seed}`).not.toContain(kind(j));
      }
    }
    // Seed L 8 has volcanic and desert zones beside its swamp's map.
    const { info } = generateMapWithInfo(8, { size: "L", players: 2 });
    expect(info.zones.some((z) => KINDS.includes(z.main))).toBe(true);
  });

  it("changes nothing on a map that rolls no swamp", () => {
    let checked = 0;
    for (let seed = 1; seed <= 8 && checked < 3; seed += 1) {
      const size = (["S", "M"] as const)[seed % 2] ?? "S";
      const a = generateMapWithInfo(seed, { size, players: 2 });
      if (a.info.zones.some((z) => z.main === "swamp")) continue;
      const b = generateMapWithInfo(seed, {
        size,
        players: 2,
        config: NO_SWAMP,
      });
      expect(a.map.cells).toEqual(b.map.cells);
      expect(a.map.objects).toEqual(b.map.objects);
      expect(a.map.decorations).toEqual(b.map.decorations);
      checked += 1;
    }
    expect(checked).toBe(3);
  });

  it("draws from its own stream: the other zones keep their terrains", () => {
    const [seed, size, players] = WITH[2]!;
    const with_ = generateMapWithInfo(seed, { size, players }).info;
    const without = generateMapWithInfo(seed, {
      size,
      players,
      config: NO_SWAMP,
    }).info;
    expect(without.zones.some((z) => z.main === "swamp")).toBe(false);
    expect(with_.zones.length).toBe(without.zones.length);
    with_.zones.forEach((z, k) => {
      if (z.main === "swamp") return;
      expect(z.main).toBe(without.zones[k]?.main);
      expect(z.secondary).toBe(without.zones[k]?.secondary);
    });
  });

  it("keeps swamps off the named maps", () => {
    for (const def of NAMED_MAPS) {
      const cfg = namedConfig(def);
      expect(cfg.terrain?.swamp?.chance, def.id).toEqual({ S: 0, M: 0, L: 0 });
    }
  });
});
