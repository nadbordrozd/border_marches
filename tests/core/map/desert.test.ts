/**
 * The desert (bead border_marches-bzc.88): its ground data and where the
 * generator puts the desert zones and the desert's sites.
 */
import { describe, expect, it } from "vitest";
import { TERRAIN_MOVE_COST } from "../../../src/data/movement.ts";
import { decorationKindsFor } from "../../../src/data/decorations.ts";
import { OBJECT_TYPES } from "../../../src/data/objectTypes.ts";
import { STRAY_HOMES } from "../../../src/data/strays.ts";
import {
  DEFAULT_GEN_CONFIG,
  generateMapWithInfo,
} from "../../../src/core/map/generate.ts";
import { TERRAINS, validateMap } from "../../../src/core/map/types.ts";
import {
  GROUND_FAMILY,
  GROUND_SWATCHES,
  GROUND_TEXTURES,
} from "../../../src/assets/manifest.ts";
import { FOREST_FAMILY } from "../../../src/assets/ground-family.ts";
import { peaksOf } from "../../../src/assets/peaks.ts";
import { TREE_SPECIES_WEIGHTS, treesOf } from "../../../src/assets/trees.ts";
import type { MapSize, PlayerCount } from "../../../src/core/map/generate.ts";
import type { GameMap } from "../../../src/core/map/types.ts";

const DESERT_TYPES = ["pyramid", "sphinx", "sun-temple", "sunken-tomb"];

describe("sand ground data", () => {
  it("is a land terrain as slow as the badlands", () => {
    expect(TERRAINS).toContain("sand");
    expect(TERRAIN_MOVE_COST.sand).toBe(125);
    expect(DEFAULT_GEN_CONFIG.movement.cost.sand).toBe(125);
  });

  it("has its own texture, swatch, trees and peaks", () => {
    expect(GROUND_TEXTURES.sand.path).toBe("assets/terrain/grounds/sand.png");
    expect(GROUND_TEXTURES.sand.w).toBe(GROUND_TEXTURES.sand.columns * 80);
    expect(GROUND_SWATCHES.sand.w).toBe(80);
    expect(GROUND_FAMILY.sand).toBe("sand");
    // The imported forest set and doodads come from the steppe.
    expect(FOREST_FAMILY.sand).toBe("steppe");
    for (const species of Object.keys(TREE_SPECIES_WEIGHTS.sand))
      expect(treesOf("sand", species).length, species).toBeGreaterThan(0);
    expect(treesOf("sand", "palm").length).toBeGreaterThanOrEqual(6);
    for (const tier of ["foothill", "peak", "summit"])
      expect(
        peaksOf("sand").filter((p) => p.tier === tier).length,
        tier,
      ).toBeGreaterThanOrEqual(4);
    // Nothing of the older grounds moved.
    expect(GROUND_FAMILY.volcanic).toBe("wasteland");
    expect(treesOf("badlands").every((t) => t.terrain === "badlands")).toBe(
      true,
    );
  });

  it("has desert decorations, props and strays of every ring", () => {
    expect(decorationKindsFor("sand", true).length).toBeGreaterThanOrEqual(6);
    expect(decorationKindsFor("sand", false).length).toBeGreaterThanOrEqual(4);
    for (let ring = 0; ring <= 3; ring += 1)
      expect(
        Object.values(STRAY_HOMES).some(
          (h) =>
            (h.terrain as readonly string[]).includes("sand") &&
            ring >= h.rings[0] &&
            ring <= h.rings[1],
        ),
        `ring ${ring}`,
      ).toBe(true);
  });

  it("keeps the desert sites out of the ordinary fill", () => {
    for (const t of DESERT_TYPES)
      expect(OBJECT_TYPES[t as keyof typeof OBJECT_TYPES].weight).toBe(0);
    expect(OBJECT_TYPES.oasis.terrain).toContain("sand");
  });
});

const NONE = {
  terrain: {
    desert: {
      ...DEFAULT_GEN_CONFIG.terrain.desert,
      chance: { S: 0, M: 0, L: 0 },
    },
  },
};

const typeOf = (map: GameMap, type: string) =>
  map.objects.filter((o) => o.data["type"] === type);

/** Seeds (size M, 2 players) with a desert and without one. */
// Bead bzc.95 moved these from M12 and S8: with sites off the roads, S8's
// desert has no room for a sun temple or tomb and M12's decorations lean
// away from the sand. Bead bzc.96 must restore S8 and M12 by reserving room
// for rare multi-cell sites before the general fill.
const WITH: [number, MapSize, PlayerCount][] = [
  [30, "M", 2],
  [19, "S", 2],
  [10, "L", 2],
];

describe("desert zones in the generator", () => {
  it("turns a wild zone away from the starts into a desert on some maps", () => {
    for (const [seed, size, players] of WITH) {
      const { map, info } = generateMapWithInfo(seed, { size, players });
      const zones = info.zones.filter((z) => z.main === "sand");
      expect(zones.length, `seed ${seed}`).toBeGreaterThan(0);
      expect(zones.length).toBeLessThanOrEqual(
        DEFAULT_GEN_CONFIG.terrain.desert.maxZones[size],
      );
      for (const z of zones) {
        expect(z.role).toBe("middle");
        expect(z.tier).toBeGreaterThanOrEqual(1);
        expect(["badlands", "steppe"]).toContain(z.secondary);
      }
      const cells = map.cells.filter((c) => c.terrain === "sand").length;
      expect(cells).toBeGreaterThan(50);
      expect(validateMap(map)).toEqual([]);
    }
  });

  it("leaves no desert on many maps", () => {
    let without = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
      const size = (["S", "M", "L"] as const)[seed % 3] ?? "M";
      const { info } = generateMapWithInfo(seed, { size, players: 2 });
      if (!info.zones.some((z) => z.main === "sand")) without += 1;
    }
    expect(without).toBeGreaterThan(3);
    expect(without).toBeLessThan(12);
  });

  it("never puts a desert zone next to a volcanic or winter one", () => {
    let both = 0;
    for (let seed = 1; seed <= 10; seed += 1) {
      const { map, info } = generateMapWithInfo(seed, {
        size: "L",
        players: 2,
      });
      const kind = (i: number): string =>
        info.zones[info.zoneOf[i] ?? -1]?.main ?? "";
      const W = map.width;
      let found = false;
      for (let i = 0; i < map.cells.length; i += 1) {
        if (kind(i) !== "sand") continue;
        found = true;
        const x = i % W;
        const near = [i - W, i + W];
        if (x > 0) near.push(i - 1);
        if (x < W - 1) near.push(i + 1);
        for (const j of near)
          if (j >= 0 && j < map.cells.length)
            expect(["volcanic", "snow"], `seed ${seed}`).not.toContain(kind(j));
      }
      if (found && info.zones.some((z) => z.main === "volcanic")) both += 1;
    }
    expect(both).toBeGreaterThan(0);
  });

  it("changes nothing on a map that rolls no desert", () => {
    let checked = 0;
    for (let seed = 1; seed <= 8 && checked < 2; seed += 1) {
      const a = generateMapWithInfo(seed, { size: "S", players: 2 });
      if (a.info.zones.some((z) => z.main === "sand")) continue;
      const b = generateMapWithInfo(seed, {
        size: "S",
        players: 2,
        config: NONE,
      });
      expect(a.map.cells).toEqual(b.map.cells);
      expect(a.map.objects).toEqual(b.map.objects);
      expect(a.map.decorations).toEqual(b.map.decorations);
      checked += 1;
    }
    expect(checked).toBe(2);
  });

  it("draws from its own stream: the other zones keep their terrains", () => {
    const [seed, size, players] = WITH[0]!;
    const with_ = generateMapWithInfo(seed, { size, players }).info;
    const without = generateMapWithInfo(seed, {
      size,
      players,
      config: NONE,
    }).info;
    expect(without.zones.some((z) => z.main === "sand")).toBe(false);
    with_.zones.forEach((z, k) => {
      if (z.main === "sand") return;
      expect(z.main).toBe(without.zones[k]?.main);
      expect(z.secondary).toBe(without.zones[k]?.secondary);
    });
  });
});

describe("desert sites in the generator", () => {
  it("puts the desert's sites in the desert, at most one Pyramid a map", () => {
    let pyramids = 0;
    let tombs = 0;
    let oases = 0;
    for (const [seed, size, players] of WITH) {
      const { map, info } = generateMapWithInfo(seed, { size, players });
      const desert = new Set(
        info.zones.filter((z) => z.main === "sand").map((z) => z.id),
      );
      const zoneAt = (x: number, y: number): number =>
        info.zoneOf[y * map.width + x] ?? -1;
      expect(typeOf(map, "pyramid").length).toBeLessThanOrEqual(1);
      pyramids += typeOf(map, "pyramid").length;
      for (const t of DESERT_TYPES) {
        for (const o of typeOf(map, t)) {
          expect(desert.has(zoneAt(o.x, o.y)), `${t} ${o.id}`).toBe(true);
          expect(o.data["value"]).toBeGreaterThan(0);
        }
      }
      expect(typeOf(map, "sphinx").length, `seed ${seed}`).toBeGreaterThan(0);
      expect(typeOf(map, "sun-temple").length).toBeGreaterThan(0);
      tombs += typeOf(map, "sunken-tomb").length;
      // The desert's oases (one asked per desert zone, where it fits).
      oases += typeOf(map, "oasis").filter((o) =>
        desert.has(zoneAt(o.x, o.y)),
      ).length;
      // The tombs hold their dead and a prize; the sphinx its riddles.
      for (const o of [
        ...typeOf(map, "pyramid"),
        ...typeOf(map, "sunken-tomb"),
      ]) {
        expect((o.data["guard"] as unknown[]).length).toBeGreaterThan(0);
        expect(o.data["prize"]).toBeTypeOf("object");
      }
      for (const o of typeOf(map, "sphinx")) {
        expect((o.data["riddles"] as number[]).length).toBe(3);
        expect(["skill", "xp"]).toContain(o.data["gift"]);
      }
    }
    expect(pyramids).toBeGreaterThan(0);
    expect(tombs).toBeGreaterThan(1);
    expect(oases).toBeGreaterThan(1);
  });

  it("puts no desert site on a map without a desert", () => {
    for (let seed = 1; seed <= 6; seed += 1) {
      const { map, info } = generateMapWithInfo(seed, {
        size: "M",
        players: 2,
        config: NONE,
      });
      expect(info.zones.some((z) => z.main === "sand")).toBe(false);
      for (const t of DESERT_TYPES) expect(typeOf(map, t)).toEqual([]);
      expect(map.cells.some((c) => c.terrain === "sand")).toBe(false);
    }
  });

  it("biases the decorations to sand", () => {
    const [seed, size, players] = WITH[0]!;
    const { map } = generateMapWithInfo(seed, { size, players });
    const W = map.width;
    const decorations = map.decorations ?? [];
    const onSand = decorations.filter(
      (d) => map.cells[d.y * W + d.x]?.terrain === "sand",
    );
    const sandCells = map.cells.filter(
      (c) => c.terrain === "sand" && c.obstacle === "none",
    ).length;
    const open = map.cells.filter(
      (c) => c.terrain !== "water" && c.obstacle === "none",
    ).length;
    const share = onSand.length / Math.max(1, decorations.length);
    expect(share).toBeGreaterThan(sandCells / open);
  });
});
