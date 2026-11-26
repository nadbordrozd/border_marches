/**
 * Volcanic ground (bead border_marches-bzc.83): its data and where the
 * generator puts it.
 */
import { describe, expect, it } from "vitest";
import { TERRAIN_MOVE_COST } from "../../../src/data/movement.ts";
import { decorationKindsFor } from "../../../src/data/decorations.ts";
import { STRAY_HOMES } from "../../../src/data/strays.ts";
import {
  DEFAULT_GEN_CONFIG,
  generateMapWithInfo,
} from "../../../src/core/map/generate.ts";
import { TERRAINS, validateMap } from "../../../src/core/map/types.ts";
import {
  GROUND_FAMILY,
  GROUND_OVERLAYS,
  GROUND_SWATCHES,
  GROUND_TEXTURES,
} from "../../../src/assets/manifest.ts";
import type { MapSize, PlayerCount } from "../../../src/core/map/generate.ts";

describe("volcanic ground data", () => {
  it("is a land terrain as rough as the wasteland", () => {
    expect(TERRAINS).toContain("volcanic");
    expect(TERRAIN_MOVE_COST.volcanic).toBe(150);
    expect(TERRAIN_MOVE_COST.volcanic).toBe(TERRAIN_MOVE_COST.wasteland);
    expect(DEFAULT_GEN_CONFIG.movement.cost.volcanic).toBe(150);
  });

  it("has its own texture, swatch and crack overlay, and the wasteland's art family", () => {
    expect(GROUND_TEXTURES.volcanic.path).toBe(
      "assets/terrain/grounds/volcanic.png",
    );
    expect(GROUND_TEXTURES.volcanic.w).toBe(
      GROUND_TEXTURES.volcanic.columns * 80,
    );
    expect(GROUND_SWATCHES.volcanic.w).toBe(80);
    expect(GROUND_OVERLAYS.volcanic?.path).toBe(
      "assets/terrain/grounds/volcanic-cracks.png",
    );
    expect(GROUND_FAMILY.volcanic).toBe("wasteland");
  });

  it("has decorations, props and strays of its own ground", () => {
    expect(decorationKindsFor("volcanic", true).length).toBeGreaterThanOrEqual(
      3,
    );
    expect(decorationKindsFor("volcanic", false).length).toBeGreaterThanOrEqual(
      3,
    );
    // Strays for every ring (0 to 3) live on volcanic ground.
    for (let ring = 0; ring <= 3; ring += 1)
      expect(
        Object.values(STRAY_HOMES).some(
          (h) =>
            (h.terrain as readonly string[]).includes("volcanic") &&
            ring >= h.rings[0] &&
            ring <= h.rings[1],
        ),
        `ring ${ring}`,
      ).toBe(true);
  });
});

const NONE = {
  terrain: {
    volcanic: {
      ...DEFAULT_GEN_CONFIG.terrain.volcanic,
      chance: { S: 0, M: 0, L: 0 },
    },
  },
};

describe("volcanic zones in the generator", () => {
  const runs: [number, MapSize, PlayerCount][] = [
    [4, "M", 2],
    [9, "S", 2],
    [5, "L", 2],
  ];

  it("turns a wild zone away from the starts volcanic on some maps", () => {
    for (const [seed, size, players] of runs) {
      const { map, info } = generateMapWithInfo(seed, { size, players });
      const zones = info.zones.filter((z) => z.main === "volcanic");
      expect(zones.length, `seed ${seed}`).toBeGreaterThan(0);
      expect(zones.length).toBeLessThanOrEqual(
        DEFAULT_GEN_CONFIG.terrain.volcanic.maxZones[size],
      );
      for (const z of zones) {
        expect(z.role).toBe("middle");
        expect(z.tier).toBeGreaterThanOrEqual(1);
        expect(["wasteland", "badlands"]).toContain(z.secondary);
      }
      const cells = map.cells.filter((c) => c.terrain === "volcanic").length;
      expect(cells).toBeGreaterThan(50);
      expect(validateMap(map)).toEqual([]);
    }
  });

  it("leaves no volcanic ground on many maps", () => {
    let without = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
      const size = (["S", "M", "L"] as const)[seed % 3] ?? "M";
      const { info } = generateMapWithInfo(seed, { size, players: 2 });
      if (!info.zones.some((z) => z.main === "volcanic")) without += 1;
    }
    expect(without).toBeGreaterThan(3);
    expect(without).toBeLessThan(12);
  });

  it("draws from its own stream: the other zones keep their terrains", () => {
    const [seed, size, players] = runs[0]!;
    const withLava = generateMapWithInfo(seed, { size, players }).info;
    const without = generateMapWithInfo(seed, {
      size,
      players,
      config: NONE,
    }).info;
    expect(without.zones.some((z) => z.main === "volcanic")).toBe(false);
    expect(withLava.zones.length).toBe(without.zones.length);
    withLava.zones.forEach((z, k) => {
      if (z.main === "volcanic") return;
      expect(z.main).toBe(without.zones[k]?.main);
      expect(z.secondary).toBe(without.zones[k]?.secondary);
    });
  });

  it("is the same map every time", () => {
    const a = generateMapWithInfo(9, { size: "S" }).map;
    const b = generateMapWithInfo(9, { size: "S" }).map;
    expect(a.cells).toEqual(b.cells);
  });
});
