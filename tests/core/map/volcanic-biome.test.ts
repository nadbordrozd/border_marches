/**
 * The volcanic (hellish plains) biome (bead border_marches-bzc.125): its
 * decorations, props and charred woods, and where the generator puts the
 * three volcanic sites (CONTENT_MAP_OBJECTS 3.14).
 */
import { describe, expect, it } from "vitest";
import {
  DECORATION_KINDS,
  decorationKindsFor,
} from "../../../src/data/decorations.ts";
import { OBJECT_TYPES } from "../../../src/data/objectTypes.ts";
import { VOLCANIC_ROWS } from "../../../src/data/mapObjects.ts";
import {
  DEFAULT_GEN_CONFIG,
  generateMapWithInfo,
} from "../../../src/core/map/generate.ts";
import { validateMap } from "../../../src/core/map/types.ts";
import type { GameMap } from "../../../src/core/map/types.ts";
import type { MapSize, PlayerCount } from "../../../src/core/map/generate.ts";
import { TREE_SPECIES_WEIGHTS, treesOf } from "../../../src/assets/trees.ts";
import { decorationById } from "../../../src/assets/decorations.ts";
import { artFor } from "../../../src/assets/object-art.ts";
import { everySize } from "../../../src/core/map/gen/config.ts";

const SITES = ["infernal-forge", "brimstone-pit", "shrine-of-embers"] as const;

/** The lava's own kinds (bead bzc.125): volcanic only, so other grounds draw as before. */
const NEW_PASSABLE = [
  "lava-vent",
  "obsidian-shards",
  "brimstone-pool",
  "charred-bones",
  "fumarole",
  "fire-salamander",
  "cinder-heap",
  "fire-lily",
  "ember-beetle",
  "smouldering-stump",
];
const NEW_PROPS = [
  "basalt-columns",
  "demon-horn-rock",
  "obsidian-spire",
  "magma-boulder",
  "charred-log",
  "scorched-skeleton",
  "basalt-wall",
  "obsidian-ridge",
];

const typeOf = (map: GameMap, type: string) =>
  map.objects.filter((o) => o.data["type"] === type);

/** Seeds (2 players) with a volcanic zone that holds all three sites. */
const WITH: [number, MapSize, PlayerCount][] = [
  [4, "SM", 2],
  [9, "S", 2],
  [5, "M", 2],
];

describe("volcanic decorations, props and woods", () => {
  it("has ten volcanic decorations and eight props of its own, on lava only", () => {
    for (const id of [...NEW_PASSABLE, ...NEW_PROPS]) {
      const kind = DECORATION_KINDS.find((d) => d.id === id);
      expect(kind?.terrains, id).toEqual(["volcanic"]);
      expect(decorationById(id)?.looks.length, id).toBeGreaterThan(0);
    }
    for (const id of NEW_PASSABLE)
      expect(decorationKindsFor("volcanic", true).map((d) => d.id)).toContain(
        id,
      );
    expect(decorationKindsFor("volcanic", false).length).toBeGreaterThanOrEqual(
      8,
    );
  });

  it("grows charred woods on the lava, never in the wasteland", () => {
    for (const species of Object.keys(TREE_SPECIES_WEIGHTS.volcanic))
      expect(treesOf("volcanic", species).length, species).toBeGreaterThan(3);
    for (const species of ["charred", "ashen", "cindersnag", "emberleaf"])
      expect(Object.keys(TREE_SPECIES_WEIGHTS.wasteland)).not.toContain(
        species,
      );
  });

  it("draws the sites with their own art (three pit sizes)", () => {
    for (const t of SITES)
      expect(artFor(t)?.placeholder ?? false, t).toBe(false);
    for (const size of ["small", "medium", "large"])
      expect(artFor("brimstone-pit", size)?.variant).toBe(size);
  });
});

describe("volcanic sites in the generator", () => {
  it("are placed by the volcanic rule only, never by the fill", () => {
    for (const t of SITES) {
      expect(OBJECT_TYPES[t].weight).toBe(0);
      expect(OBJECT_TYPES[t].terrain).toEqual(["volcanic"]);
    }
    expect(VOLCANIC_ROWS.map((r) => r.type)).toEqual([...SITES]);
    expect(VOLCANIC_ROWS.find((r) => r.type === "brimstone-pit")?.guard).toBe(
      "never",
    );
    expect(DEFAULT_GEN_CONFIG.objects.volcanicSites).toBe(true);
  });

  it("puts a forge, a pit and a shrine on the lava of every volcanic zone", () => {
    for (const [seed, size, players] of WITH) {
      const { map, info } = generateMapWithInfo(seed, { size, players });
      expect(validateMap(map)).toEqual([]);
      const lava = info.zones.filter((z) => z.main === "volcanic");
      expect(lava.length, `seed ${seed}`).toBeGreaterThan(0);
      const lavaIds = new Set(lava.map((z) => z.id));
      for (const t of SITES) {
        const found = typeOf(map, t);
        expect(found.length, `${size}${seed} ${t}`).toBe(lava.length);
        for (const o of found) {
          expect(lavaIds.has(info.zoneOf[o.y * map.width + o.x] ?? -1)).toBe(
            true,
          );
          expect(map.cells[o.y * map.width + o.x]?.terrain).toBe("volcanic");
          expect(map.cells[o.y * map.width + o.x]?.road).toBe(false);
        }
      }
      for (const o of typeOf(map, "brimstone-pit")) {
        expect(["small", "medium", "large"]).toContain(o.data["size"]);
        expect((o.data["guard"] as unknown[]).length).toBe(2);
        expect(o.data["prize"]).toBeTypeOf("object");
      }
      for (const o of typeOf(map, "infernal-forge"))
        expect(o.data["wonder"]).toBeTypeOf("string");
    }
  });

  it("puts none on a map without lava, or when switched off", () => {
    const noLava = {
      terrain: {
        volcanic: {
          ...DEFAULT_GEN_CONFIG.terrain.volcanic,
          chance: everySize(0),
        },
      },
    };
    const [seed, size, players] = WITH[0]!;
    const a = generateMapWithInfo(seed, { size, players, config: noLava });
    for (const t of SITES) expect(typeOf(a.map, t)).toEqual([]);
    expect(
      (a.map.decorations ?? []).some((d) => NEW_PASSABLE.includes(d.id)),
    ).toBe(false);
    const b = generateMapWithInfo(seed, {
      size,
      players,
      config: { objects: { volcanicSites: false } },
    });
    for (const t of SITES) expect(typeOf(b.map, t)).toEqual([]);
  });

  it("decorates the lava with its own pieces, and nothing else with them", () => {
    let own = 0;
    for (const [seed, size, players] of WITH) {
      const { map } = generateMapWithInfo(seed, { size, players });
      const W = map.width;
      for (const d of map.decorations ?? []) {
        if (!NEW_PASSABLE.includes(d.id) && !NEW_PROPS.includes(d.id)) continue;
        expect(map.cells[d.y * W + d.x]?.terrain).toBe("volcanic");
        own += 1;
      }
    }
    // Lava zones are crowded with their sites and the fill: a few each.
    expect(own).toBeGreaterThanOrEqual(15);
  });
});
