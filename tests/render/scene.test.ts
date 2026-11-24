import { describe, expect, it } from "vitest";
import {
  compareEntries,
  creatureAsset,
  objectEntries,
  TOWN_SEAT_PX,
  terrainEntries,
  town3x2Asset,
  townAsset,
} from "../../src/render/map/scene.ts";
import { createMap } from "../../src/core/map/types.ts";
import type { MapObject } from "../../src/core/map/types.ts";
import type { SceneEntry } from "../../src/render/map/scene.ts";
import { ALL_ASSETS } from "../../src/assets/manifest.ts";
import { buildSmallMap } from "../fixtures/small-map.ts";

const stub = (over: Partial<SceneEntry>): SceneEntry => ({
  pass: "FOREGROUND",
  row: 0,
  col: 0,
  layer: 1,
  seq: 0,
  shadows: [],
  sprites: [],
  x0: 0,
  y0: 0,
  x1: 0,
  y1: 0,
  ...over,
});

describe("draw order", () => {
  it("sorts by pass, then row, then column, then layer", () => {
    const entries = [
      stub({ pass: "FOREGROUND", row: 0, seq: 1 }),
      stub({ pass: "TALL_BODY", row: 9, seq: 2 }),
      stub({ row: 2, col: 1, layer: 5, seq: 3 }),
      stub({ row: 2, col: 1, layer: 1, seq: 4 }),
      stub({ row: 2, col: 0, layer: 7, seq: 5 }),
      stub({ row: 1, col: 9, seq: 6 }),
    ];
    expect([...entries].sort(compareEntries).map((e) => e.seq)).toEqual([
      2, 1, 6, 5, 4, 3,
    ]);
  });
});

describe("terrain entries", () => {
  const map = buildSmallMap();
  const entries = terrainEntries(map, map.objects);
  const keys = new Set(ALL_ASSETS.map((a) => a.key));

  it("only names images of the manifest", () => {
    for (const e of entries)
      for (const s of e.sprites)
        expect(keys.has(s.key) || s.key.startsWith("canopy-band:")).toBe(true);
  });

  it("is deterministic", () => {
    const again = terrainEntries(map, map.objects);
    const strip = (list: SceneEntry[]) => list.map((e) => ({ ...e, seq: 0 }));
    expect(strip(again)).toEqual(strip(entries));
  });

  it("puts bodies in the body pass and the upward bands in the foreground", () => {
    const bands = entries.filter((e) => e.pass === "FOREGROUND");
    expect(bands.length).toBeGreaterThan(0);
    for (const band of bands)
      // Crown bands sort half a row early (before the row they belong to).
      for (const s of band.sprites)
        expect(s.dy + s.sh).toBe(Math.ceil(band.row) * 80);
  });
});

describe("object entries", () => {
  const map = buildSmallMap();
  const entries = objectEntries(map.objects);

  it("draws a growing town bottom-centred over its footprint", () => {
    const full = map.objects.find((o) => o.kind === "town")!;
    const town = { ...full, data: { ...full.data, level: 1 } };
    const art = townAsset(town);
    const entry = objectEntries([town]).find((e) => e.objectId === town.id)!;
    const sprite = entry.sprites[0]!;
    expect(sprite.key).toBe(art.key);
    const centre = sprite.dx + (art.ground.left + art.ground.right) / 2;
    expect(Math.abs(centre - (3 + 3 / 2) * 80)).toBeLessThanOrEqual(1);
    expect(sprite.dy + art.ground.contactY).toBe(5 * 80 - TOWN_SEAT_PX);
    // Sorted at the footprint's bottom row.
    expect(entry.row).toBe(4);
  });

  it("draws a full 3x2 town with its 3x2 sprite on the footprint", () => {
    const town = map.objects.find((o) => o.kind === "town")!;
    const art = town3x2Asset(town)!;
    expect(art).not.toBeNull();
    const entry = entries.find((e) => e.objectId === town.id)!;
    const sprite = entry.sprites[0]!;
    expect(sprite.key).toBe(art.key);
    expect([sprite.dx, sprite.dy]).toEqual([3 * 80, 3 * 80 - art.up]);
    expect(entry.row).toBe(4);
    expect(town3x2Asset({ ...town, data: { ...town.data, level: 2 } })).toBe(
      null,
    );
  });

  it("draws a v0.2 faction town at its fort stage at every level (bzc.15)", () => {
    const town = map.objects.find((o) => o.kind === "town")!;
    const at = (faction: string, fort: number | undefined, level = 1) =>
      town3x2Asset({ ...town, data: { ...town.data, faction, level, fort } })
        ?.key;
    expect(at("humans", 0)).toBe("realm-village-3x2");
    expect(at("humans", 2)).toBe("realm-castle-3x2");
    expect(at("undead", 1, 3)).toBe("restless-graveyard-3x2");
    expect(at("undead", 3)).toBe("restless-churchyard-3x2");
    expect(at("goblins", undefined)).toBe("horde-warcamp-3x2");
    expect(at("goblins", 2)).toBe("goblin-hold-3x2");
    // The neutral Warlord's Hold keeps its art.
    expect(at("goblin", undefined, 3)).toBe("goblin-hold-3x2");
  });

  it("draws an ore mine as the mine piece of the rock round it", () => {
    const m = createMap(4, 3, 1);
    for (const c of m.cells) c.terrain = "wasteland";
    m.cells[1]!.obstacle = "mountain";
    const mine: MapObject = {
      id: "mine-ore-1",
      kind: "mine",
      x: 1,
      y: 2,
      footprint: { w: 1, h: 2 },
      blocked: [[1, 1]],
      data: { resource: "ore" },
    };
    const sprite = objectEntries([mine], m)[0]!.sprites[0]!;
    expect(sprite.key).toMatch(/^massif-basalt-mine-1x1-/);
    expect([sprite.dx, sprite.dy + sprite.sh]).toEqual([80, 160]);
    // Without the map: the imported mined mountain, as before.
    expect(objectEntries([mine])[0]!.sprites[0]!.key).toBe("mountain-mine-a");
  });

  it("maps creatures to unit sprites and draws them on their cell", () => {
    expect(creatureAsset("raptor").key).toBe("dinosaur-raptor");
    expect(creatureAsset("troll").key).toBe("goblin-troll");
    const monster = entries.find((e) => e.objectId === "monster-1")!;
    expect(monster.row).toBe(9);
    expect(monster.shadows.length).toBe(1);
  });
});
