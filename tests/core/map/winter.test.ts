/**
 * The winter landscape (bead border_marches-bzc.87): snow ground, its art
 * family and decorations, and where the generator puts winter zones and
 * the winter sites.
 */
import { describe, expect, it } from "vitest";
import { TERRAIN_MOVE_COST } from "../../../src/data/movement.ts";
import { decorationKindsFor } from "../../../src/data/decorations.ts";
import { STRAY_HOMES } from "../../../src/data/strays.ts";
import { NAMED_MAPS } from "../../../src/data/named-maps.ts";
import { OBJECT_TYPES } from "../../../src/data/objectTypes.ts";
import {
  DEFAULT_GEN_CONFIG,
  generateMapWithInfo,
} from "../../../src/core/map/generate.ts";
import { WINTER_SITES } from "../../../src/core/map/gen/objects.ts";
import { generateNamedBase } from "../../../src/core/map/named.ts";
import {
  TERRAINS,
  validateMap,
  type GameMap,
} from "../../../src/core/map/types.ts";
import {
  FOREST_SETS,
  GROUND_FAMILY,
  GROUND_SWATCHES,
  GROUND_TEXTURES,
  doodadsOf,
} from "../../../src/assets/manifest.ts";
import { peaksOf } from "../../../src/assets/peaks.ts";
import { treesOf, TREE_SPECIES_WEIGHTS } from "../../../src/assets/trees.ts";
import type { MapSize } from "../../../src/core/map/generate.ts";

describe("snow ground data", () => {
  it("is a land terrain as heavy as the roughest grounds", () => {
    expect(TERRAINS).toContain("snow");
    expect(TERRAIN_MOVE_COST.snow).toBe(150);
    expect(DEFAULT_GEN_CONFIG.movement.cost.snow).toBe(150);
  });

  it("has its own texture, swatch, snowy trees, peaks and doodads", () => {
    expect(GROUND_TEXTURES.snow.path).toBe("assets/terrain/grounds/snow.png");
    expect(GROUND_TEXTURES.snow.w).toBe(GROUND_TEXTURES.snow.columns * 80);
    expect(GROUND_SWATCHES.snow.w).toBe(80);
    expect(GROUND_FAMILY.snow).toBe("snow");
    for (const species of Object.keys(TREE_SPECIES_WEIGHTS.snow))
      expect(treesOf("snow", species).length, species).toBeGreaterThan(1);
    expect(treesOf("snow").every((t) => t.terrain === "snow")).toBe(true);
    for (const tier of ["foothill", "peak", "summit"] as const)
      expect(
        peaksOf("snow").filter((p) => p.tier === tier).length,
      ).toBeGreaterThanOrEqual(5);
    expect(doodadsOf("snow").length).toBeGreaterThanOrEqual(4);
    // Battles on snow borrow the grass conifer clumps.
    expect(FOREST_SETS.snow).toBe(FOREST_SETS.grass);
  });

  it("has decorations, props and strays of its own", () => {
    const passable = decorationKindsFor("snow", true);
    const props = decorationKindsFor("snow", false);
    expect(passable.length).toBeGreaterThanOrEqual(6);
    expect(props.length).toBeGreaterThanOrEqual(4);
    // Snow-only, so no other ground draws a different decoration.
    for (const d of [...passable, ...props])
      expect(d.terrains, d.id).toEqual(["snow"]);
    for (let ring = 0; ring <= 3; ring += 1)
      expect(
        Object.values(STRAY_HOMES).some(
          (h) =>
            (h.terrain as readonly string[]).includes("snow") &&
            ring >= h.rings[0] &&
            ring <= h.rings[1],
        ),
        `ring ${ring}`,
      ).toBe(true);
  });

  it("places the winter sites only by the winter rule", () => {
    for (const t of WINTER_SITES) {
      expect(OBJECT_TYPES[t].weight, t).toBe(0);
      expect(OBJECT_TYPES[t].terrain, t).toEqual(["snow"]);
    }
  });
});

const OFF = {
  terrain: {
    winter: {
      ...DEFAULT_GEN_CONFIG.terrain.winter,
      chance: { S: 0, M: 0, L: 0 },
    },
  },
};

const typeOf = (o: { data: Record<string, unknown> }): string =>
  String(o.data["type"]);
const snowCells = (map: GameMap): number =>
  map.cells.filter((c) => c.terrain === "snow").length;

describe("winter zones in the generator", () => {
  const runs: Array<{ seed: number; size: MapSize }> = [];
  const plain: Array<{ seed: number; size: MapSize }> = [];
  for (let seed = 1; seed <= 12; seed += 1) {
    const size = (["S", "M", "L"] as const)[seed % 3] ?? "M";
    const { info } = generateMapWithInfo(seed, { size, players: 2 });
    (info.zones.some((z) => z.main === "snow") ? runs : plain).push({
      seed,
      size,
    });
  }

  it("turns a wild zone to snow on some maps, not on others", () => {
    expect(runs.length).toBeGreaterThan(3);
    expect(plain.length).toBeGreaterThan(3);
  });

  it("puts winter zones out in the wilds, apart from volcanic ones, with the winter sites", () => {
    for (const { seed, size } of runs) {
      const { map, info } = generateMapWithInfo(seed, { size, players: 2 });
      expect(validateMap(map)).toEqual([]);
      const winter = info.zones.filter((z) => z.main === "snow");
      expect(winter.length).toBeLessThanOrEqual(
        DEFAULT_GEN_CONFIG.terrain.winter.maxZones[size],
      );
      const lava = new Set(
        info.zones.filter((z) => z.main === "volcanic").map((z) => z.id),
      );
      for (const z of winter) {
        expect(z.role).toBe("middle");
        expect(z.tier).toBeGreaterThanOrEqual(1);
        expect(DEFAULT_GEN_CONFIG.terrain.winter.secondary).toContain(
          z.secondary,
        );
        for (const c of info.connections)
          if (c.a === z.id || c.b === z.id)
            expect(lava.has(c.a === z.id ? c.b : c.a)).toBe(false);
      }
      expect(snowCells(map)).toBeGreaterThan(50);
      // Every winter site, near the snow: most of them on it.
      const sites = map.objects.filter((o) =>
        (WINTER_SITES as readonly string[]).includes(typeOf(o)),
      );
      for (const t of WINTER_SITES)
        expect(
          sites.filter((o) => typeOf(o) === t).length,
          `seed ${seed} ${t}`,
        ).toBeGreaterThanOrEqual(1);
      const onSnow = sites.filter(
        (o) => map.cells[o.y * map.width + o.x]?.terrain === "snow",
      ).length;
      expect(onSnow / sites.length).toBeGreaterThanOrEqual(0.7);
      // The rookery is watched by Rime Walruses; the barrow keeps its own.
      for (const o of sites) {
        const guards = map.objects.filter(
          (m) =>
            m.kind === "monster" &&
            Array.isArray(m.data["guards"]) &&
            (m.data["guards"] as string[]).includes(o.id),
        );
        if (typeOf(o) === "frost-giants-barrow") expect(guards).toEqual([]);
        if (typeOf(o) === "walrus-rookery")
          for (const g of guards)
            expect(g.data["creature"], o.id).toBe("rime-walrus");
      }
      // Snow gets its own decorations.
      const snowDecor = (map.decorations ?? []).filter(
        (d) => map.cells[d.y * map.width + d.x]?.terrain === "snow",
      );
      expect(snowDecor.length).toBeGreaterThan(0);
      for (const d of snowDecor)
        expect(
          decorationKindsFor("snow", true).some((k) => k.id === d.id) ||
            decorationKindsFor("snow", false).some((k) => k.id === d.id),
        ).toBe(true);
    }
  });

  it("leaves maps without a winter zone free of snow and winter sites", () => {
    for (const { seed, size } of plain) {
      const { map } = generateMapWithInfo(seed, { size, players: 2 });
      expect(snowCells(map)).toBe(0);
      expect(
        map.objects.some((o) =>
          (WINTER_SITES as readonly string[]).includes(typeOf(o)),
        ),
      ).toBe(false);
    }
  });

  it("draws from its own stream: with winter off, a plain map is the same map", () => {
    const { seed, size } = plain[0]!;
    const a = generateMapWithInfo(seed, { size, players: 2 }).map;
    const b = generateMapWithInfo(seed, { size, players: 2, config: OFF }).map;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("with winter off, the other zones keep their terrains", () => {
    const { seed, size } = runs[0]!;
    const on = generateMapWithInfo(seed, { size, players: 2 }).info;
    const off = generateMapWithInfo(seed, {
      size,
      players: 2,
      config: OFF,
    }).info;
    expect(off.zones.some((z) => z.main === "snow")).toBe(false);
    on.zones.forEach((z, k) => {
      if (z.main === "snow") return;
      expect(z.main).toBe(off.zones[k]?.main);
      expect(z.secondary).toBe(off.zones[k]?.secondary);
    });
  });

  it("keeps the named maps free of snow", () => {
    for (const def of NAMED_MAPS)
      expect(snowCells(generateNamedBase(def)), def.id).toBe(0);
  });
});
