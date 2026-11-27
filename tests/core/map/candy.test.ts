/**
 * The Candy Kingdom's frosting (bead border_marches-bzc.115): its ground
 * data and where the generator puts the candy zones; Candy outposts on
 * frosting.
 */
import { describe, expect, it } from "vitest";
import { HEAVY_TIMEOUT } from "../../timeouts.ts";
import { TERRAIN_MOVE_COST } from "../../../src/data/movement.ts";
import { getHeroClass } from "../../../src/data/classes.ts";
import { decorationKindsFor } from "../../../src/data/decorations.ts";
import {
  DEFAULT_GEN_CONFIG,
  generateMapWithInfo,
} from "../../../src/core/map/generate.ts";
import { TERRAINS, validateMap } from "../../../src/core/map/types.ts";
import {
  NATIVE_GROUND,
  preferNativeGround,
} from "../../../src/core/map/gen/native-ground.ts";
import type { GroundRequest } from "../../../src/core/map/gen/native-ground.ts";
import { T } from "../../../src/core/map/gen/state.ts";
import type { GenState } from "../../../src/core/map/gen/state.ts";
import { NAMED_MAPS, namedConfig } from "../../../src/core/map/named.ts";
import {
  GROUND_FAMILY,
  GROUND_SWATCHES,
  GROUND_TEXTURES,
} from "../../../src/assets/manifest.ts";
import { FOREST_FAMILY } from "../../../src/assets/ground-family.ts";
import { peaksOf } from "../../../src/assets/peaks.ts";
import { TREE_SPECIES_WEIGHTS, treesOf } from "../../../src/assets/trees.ts";
import type { MapSize, PlayerCount } from "../../../src/core/map/generate.ts";
import { everySize } from "../../../src/core/map/gen/config.ts";

describe("frosting ground data", () => {
  it("is a land terrain as slow as the sand, native to the Candy Kingdom", () => {
    expect(TERRAINS).toContain("frosting");
    expect(TERRAIN_MOVE_COST.frosting).toBe(125);
    expect(DEFAULT_GEN_CONFIG.movement.cost.frosting).toBe(125);
    expect(getHeroClass("nutcracker").nativeTerrain).toBe("frosting");
    expect(getHeroClass("confectioner").nativeTerrain).toBe("frosting");
    expect(NATIVE_GROUND[getHeroClass("nutcracker").faction]?.zone).toBe(
      "frosting",
    );
  });

  it("has its own texture, swatch, trees and peaks", () => {
    expect(GROUND_TEXTURES.frosting.path).toBe(
      "assets/terrain/grounds/frosting.png",
    );
    expect(GROUND_TEXTURES.frosting.w).toBe(
      GROUND_TEXTURES.frosting.columns * 80,
    );
    expect(GROUND_SWATCHES.frosting.w).toBe(80);
    expect(GROUND_FAMILY.frosting).toBe("frosting");
    // Battles borrow the grass family's imported tree clumps.
    expect(FOREST_FAMILY.frosting).toBe("grass");
    for (const species of Object.keys(TREE_SPECIES_WEIGHTS.frosting))
      expect(treesOf("frosting", species).length, species).toBeGreaterThan(0);
    expect(treesOf("frosting", "frosted").length).toBeGreaterThanOrEqual(5);
    for (const tier of ["foothill", "peak", "summit"])
      expect(
        peaksOf("frosting").filter((p) => p.tier === tier).length,
        tier,
      ).toBeGreaterThanOrEqual(4);
    // Nothing of the older grounds moved.
    expect(GROUND_FAMILY.sand).toBe("sand");
    expect(treesOf("snow").every((t) => t.terrain === "snow")).toBe(true);
  });

  it("has candy decorations and props of its own", () => {
    const passable = decorationKindsFor("frosting", true);
    const props = decorationKindsFor("frosting", false);
    expect(passable.length).toBeGreaterThanOrEqual(6);
    expect(props.length).toBeGreaterThanOrEqual(3);
    // Frosting only: every other ground decorates as before.
    for (const k of [...passable, ...props])
      expect(k.terrains, k.id).toEqual(["frosting"]);
  });
});

const NO_CANDY = {
  terrain: {
    candy: {
      ...DEFAULT_GEN_CONFIG.terrain.candy,
      chance: everySize(0),
    },
  },
};

/** Seeds (2 players) with a candy zone. */
const WITH: [number, MapSize, PlayerCount][] = [
  [3, "SM", 2],
  [6, "S", 2],
  [4, "M", 2],
];

describe("candy zones in the generator", { timeout: HEAVY_TIMEOUT }, () => {
  it("turns a wild zone away from the starts into a candy zone on some maps", () => {
    for (const [seed, size, players] of WITH) {
      const { map, info } = generateMapWithInfo(seed, { size, players });
      const zones = info.zones.filter((z) => z.main === "frosting");
      expect(zones.length, `seed ${seed}`).toBeGreaterThan(0);
      expect(zones.length).toBeLessThanOrEqual(
        DEFAULT_GEN_CONFIG.terrain.candy.maxZones[size],
      );
      for (const z of zones) {
        expect(z.role).toBe("middle");
        expect(z.tier).toBeGreaterThanOrEqual(1);
        expect(["grass", "steppe"]).toContain(z.secondary);
      }
      const cells = map.cells.filter((c) => c.terrain === "frosting").length;
      expect(cells).toBeGreaterThan(50);
      expect(validateMap(map)).toEqual([]);
      // Its own decorations stand on it.
      const at = (x: number, y: number) => map.cells[y * map.width + x];
      const own = new Set(
        [
          ...decorationKindsFor("frosting", true),
          ...decorationKindsFor("frosting", false),
        ].map((k) => k.id),
      );
      const mine = (map.decorations ?? []).filter((d) => own.has(d.id));
      expect(mine.length, `seed ${seed}`).toBeGreaterThan(0);
      for (const d of mine) expect(at(d.x, d.y)?.terrain).toBe("frosting");
    }
  });

  it("leaves no candy zone on many maps", () => {
    let without = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
      const size = (["S", "SM", "M"] as const)[seed % 3] ?? "SM";
      const { info } = generateMapWithInfo(seed, { size, players: 2 });
      if (!info.zones.some((z) => z.main === "frosting")) without += 1;
    }
    expect(without).toBeGreaterThan(3);
    expect(without).toBeLessThan(12);
  });

  it("never puts a candy zone next to a volcanic, winter or desert one", () => {
    let others = 0;
    for (let seed = 1; seed <= 8; seed += 1) {
      const { map, info } = generateMapWithInfo(seed, {
        size: "M",
        players: 2,
      });
      const kind = (i: number): string =>
        info.zones[info.zoneOf[i] ?? -1]?.main ?? "";
      const W = map.width;
      let found = false;
      for (let i = 0; i < map.cells.length; i += 1) {
        if (kind(i) !== "frosting") continue;
        found = true;
        const x = i % W;
        const near = [i - W, i + W];
        if (x > 0) near.push(i - 1);
        if (x < W - 1) near.push(i + 1);
        for (const j of near)
          if (j >= 0 && j < map.cells.length)
            expect(["volcanic", "snow", "sand"], `seed ${seed}`).not.toContain(
              kind(j),
            );
      }
      if (
        found &&
        info.zones.some((z) => ["volcanic", "snow", "sand"].includes(z.main))
      )
        others += 1;
    }
    expect(others).toBeGreaterThan(0);
  });

  it("changes nothing on a map that rolls no candy zone", () => {
    let checked = 0;
    for (let seed = 1; seed <= 8 && checked < 3; seed += 1) {
      const size = (["S", "SM"] as const)[seed % 2] ?? "S";
      const a = generateMapWithInfo(seed, { size, players: 2 });
      if (a.info.zones.some((z) => z.main === "frosting")) continue;
      const b = generateMapWithInfo(seed, {
        size,
        players: 2,
        config: NO_CANDY,
      });
      expect(a.map.cells).toEqual(b.map.cells);
      expect(a.map.objects).toEqual(b.map.objects);
      expect(a.map.decorations).toEqual(b.map.decorations);
      checked += 1;
    }
    expect(checked).toBe(3);
  });

  it("draws from its own stream: the other zones keep their terrains", () => {
    const [seed, size, players] = WITH[0]!;
    const with_ = generateMapWithInfo(seed, { size, players }).info;
    const without = generateMapWithInfo(seed, {
      size,
      players,
      config: NO_CANDY,
    }).info;
    expect(without.zones.some((z) => z.main === "frosting")).toBe(false);
    expect(with_.zones.length).toBe(without.zones.length);
    with_.zones.forEach((z, k) => {
      if (z.main === "frosting") return;
      expect(z.main).toBe(without.zones[k]?.main);
      expect(z.secondary).toBe(without.zones[k]?.secondary);
    });
  });

  it("keeps candy zones off the named maps unless they ask for one", () => {
    for (const def of NAMED_MAPS) {
      const cfg = namedConfig(def);
      // Bead bzc.129: the Cartographer's Folly asks for one (chance 1).
      const n = def.gen?.landscapes?.candy ?? 0;
      const chance = n > 0 ? 2 ** (n - 1) : 0;
      expect(cfg.terrain?.candy?.chance, def.id).toEqual(everySize(chance));
    }
  });
});

describe("Candy outposts on frosting", { timeout: HEAVY_TIMEOUT }, () => {
  /** A state with zone 0 of grass and zone 1 a candy zone. */
  const st = {
    zones: [
      { id: 0, main: "grass" },
      { id: 1, main: "frosting" },
    ],
  } as unknown as GenState;
  const request = (
    faction: string,
    extra: Partial<GroundRequest> = {},
  ): GroundRequest => ({
    row: { type: "faction-outpost" },
    data: { faction },
    zones: [0],
    pocket: -1,
    ...extra,
  });

  it("stands a Candy outpost on frosting, in its zone or a candy zone", () => {
    const candy = request("candy");
    const realm = request("humans");
    const kit = request("candy", { from: 0 });
    const pocket = request("candy", { pocket: 2 });
    const shrine: GroundRequest = {
      row: { type: "stat-shrine" },
      data: { faction: "candy" },
      zones: [0],
      pocket: -1,
    };
    expect(preferNativeGround(st, [candy, realm, kit, pocket, shrine])).toBe(1);
    expect(candy.ground).toBe(T.frosting);
    expect(candy.zones).toEqual([0, 1]);
    for (const r of [realm, kit, pocket, shrine]) {
      expect(r.ground).toBeUndefined();
      expect(r.zones).toEqual([0]);
    }
  });

  // Bead bzc.124: the candy zones' own sites (a cottage, a fountain and a
  // shop, placed first) now take most of the frosting's room, so L6 lost
  // its one Candy outpost on frosting. A Candy outpost may still go into
  // the candy zone (its zones list it), on the frosting while a site there
  // is free, else on the zone's grass patches (L24).
  it("lets a generated Candy outpost into the candy zone (L 24)", () => {
    const { map, info } = generateMapWithInfo(24, { size: "M", players: 2 });
    const outposts = map.objects.filter(
      (o) =>
        o.data["type"] === "faction-outpost" && o.data["faction"] === "candy",
    );
    const inCandy = outposts.filter(
      (o) =>
        info.zones[info.zoneOf[o.y * map.width + o.x] ?? -1]?.main ===
        "frosting",
    );
    expect(inCandy.length).toBeGreaterThan(0);
  });

  it("changes nothing on a map without a candy zone", () => {
    const plain = { zones: [{ id: 0, main: "grass" }] } as unknown as GenState;
    const candy = request("candy");
    expect(preferNativeGround(plain, [candy])).toBe(0);
    expect(candy.zones).toEqual([0]);
    expect(candy.ground).toBeUndefined();
  });
});
