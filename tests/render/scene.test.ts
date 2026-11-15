import { describe, expect, it } from "vitest";
import {
  compareEntries,
  creatureAsset,
  objectEntries,
  TOWN_SEAT_PX,
  terrainEntries,
  townAsset,
} from "../../src/render/map/scene.ts";
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
      for (const s of e.sprites) expect(keys.has(s.key)).toBe(true);
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
      for (const s of band.sprites) expect(s.dy + s.sh).toBe(band.row * 80);
  });
});

describe("object entries", () => {
  const map = buildSmallMap();
  const entries = objectEntries(map.objects);

  it("draws the town bottom-centred over its footprint", () => {
    const town = map.objects.find((o) => o.kind === "town")!;
    const art = townAsset(town);
    const entry = entries.find((e) => e.objectId === town.id)!;
    const sprite = entry.sprites[0]!;
    const centre = sprite.dx + (art.ground.left + art.ground.right) / 2;
    expect(Math.abs(centre - (3 + 3 / 2) * 80)).toBeLessThanOrEqual(1);
    expect(sprite.dy + art.ground.contactY).toBe(5 * 80 - TOWN_SEAT_PX);
    // Sorted at the footprint's bottom row.
    expect(entry.row).toBe(4);
  });

  it("maps creatures to unit sprites and draws them on their cell", () => {
    expect(creatureAsset("raptor").key).toBe("dinosaur-raptor");
    expect(creatureAsset("troll").key).toBe("goblin-troll");
    const monster = entries.find((e) => e.objectId === "monster-1")!;
    expect(monster.row).toBe(9);
    expect(monster.shadows.length).toBe(1);
  });
});
