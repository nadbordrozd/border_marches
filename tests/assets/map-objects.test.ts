/**
 * Bead border_marches-bzc.16: the adventure-map object catalogue's types,
 * their sprites and the `artFor` lookup the object rules (bzc.13) draw with.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { ALL_ASSETS, assetByKey, CELL_PX } from "../../src/assets/manifest";
import {
  MAP_OBJECT_ASSETS,
  MAP_OBJECT_TYPE_IDS,
  MAP_OBJECT_TYPES,
  REUSED_OBJECT_ART,
  SHIP_ART,
} from "../../src/assets/map-objects";
import {
  artFor,
  artVariants,
  placeArt,
  SEAT_PX,
} from "../../src/assets/object-art";

const PUBLIC = join(import.meta.dirname, "..", "..", "public");

/** RGBA of a PNG written by the studio pipeline (8-bit RGBA, filter 0). */
function rgbaOf(path: string): { w: number; h: number; px: Uint8Array } {
  const file = readFileSync(join(PUBLIC, path));
  let at = 8;
  let w = 0;
  let h = 0;
  const idat: Buffer[] = [];
  while (at < file.length) {
    const length = file.readUInt32BE(at);
    const type = file.subarray(at + 4, at + 8).toString("latin1");
    const data = file.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
    } else if (type === "IDAT") idat.push(data);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    expect(raw[y * (w * 4 + 1)], `${path} row ${y} filter`).toBe(0);
    px.set(raw.subarray(y * (w * 4 + 1) + 1, (y + 1) * (w * 4 + 1)), y * w * 4);
  }
  return { w, h, px };
}

describe("map object types (bzc.16)", () => {
  it("list the 62 catalogued types, 53 core and 9 stretch, and the 4 winter sites (bzc.87)", () => {
    expect(MAP_OBJECT_TYPES.map((type) => type.id)).toEqual([
      ...MAP_OBJECT_TYPE_IDS,
    ]);
    // 62 catalogue types, 4 winter sites (bzc.87), 4 desert sites (bzc.88),
    // the Mystery Bag (bzc.105), 3 volcanic sites (bzc.125), 3 candy sites
    // (bzc.124), 3 swamp sites (bzc.126), 20 sea and coastal sites (bzc.158).
    expect(new Set(MAP_OBJECT_TYPE_IDS).size).toBe(
      62 + 4 + 4 + 1 + 3 + 3 + 3 + 20,
    );
    const krakensDeep = MAP_OBJECT_TYPES.find((t) => t.id === "krakens-deep");
    expect([krakensDeep?.cols, krakensDeep?.rows]).toEqual([3, 2]);
    expect(
      MAP_OBJECT_TYPES.filter(
        (t) =>
          t.seat === "pickup" &&
          ["flotsam", "sea-chest", "castaway", "message-in-a-bottle"].includes(
            t.id,
          ),
      ),
    ).toHaveLength(4);
    for (const t of ["infernal-forge", "brimstone-pit", "shrine-of-embers"])
      expect(MAP_OBJECT_TYPE_IDS).toContain(t);
    for (const t of ["witchs-hut", "drowned-temple", "hags-cauldron"])
      expect(MAP_OBJECT_TYPE_IDS).toContain(t);
    for (const t of ["gingerbread-cottage", "sugar-fountain", "sweet-shop"])
      expect(MAP_OBJECT_TYPE_IDS).toContain(t);
    for (const t of ["pyramid", "sphinx", "sun-temple", "sunken-tomb"])
      expect(MAP_OBJECT_TYPE_IDS).toContain(t);
    const pyramid = MAP_OBJECT_TYPES.find((type) => type.id === "pyramid");
    expect([pyramid?.cols, pyramid?.rows]).toEqual([3, 2]);
    expect(MAP_OBJECT_TYPES.filter((type) => type.stretch)).toHaveLength(9);
    expect(
      MAP_OBJECT_TYPES.filter((type) => type.hidden).map((type) => type.id),
    ).toEqual(["buried-keystone", "buried-cache"]);
    const vault = MAP_OBJECT_TYPES.find((type) => type.id === "keepers-vault");
    expect([vault?.cols, vault?.rows]).toEqual([3, 2]);
  });
});

describe("map object sprites (bzc.16)", () => {
  it("are manifest assets with their foot on the last row's opaque run", () => {
    expect(MAP_OBJECT_ASSETS.length).toBeGreaterThan(0);
    const listed = new Set(ALL_ASSETS);
    for (const asset of MAP_OBJECT_ASSETS) {
      expect(listed.has(asset)).toBe(true);
      const { w, h, px } = rgbaOf(asset.path);
      expect([asset.key, w, h]).toEqual([asset.key, asset.w, asset.h]);
      expect(asset.foot).toEqual({ x: Math.floor(w / 2), y: h - 1 });
      let opaque = 0;
      for (let x = 0; x < w; x += 1)
        if ((px[((h - 1) * w + x) * 4 + 3] ?? 0) > 0) opaque += 1;
      expect({ key: asset.key, footRow: opaque > 0 }).toEqual({
        key: asset.key,
        footRow: true,
      });
    }
  });

  it("fit their footprint's width", () => {
    for (const asset of MAP_OBJECT_ASSETS) {
      const type = MAP_OBJECT_TYPES.find((t) => t.id === asset.type)!;
      // The Moored Boat is the moored ship, 96 px wide on one cell like every
      // ship (NAVAL.md 10.1): it overhangs its cell by 8 px a side.
      const width = type.id === "moored-boat" ? 96 : type.cols * CELL_PX;
      expect({ key: asset.key, fits: asset.w <= width }).toEqual({
        key: asset.key,
        fits: true,
      });
    }
  });

  it("reuse manifest art at its manifest path with the foot inside it", () => {
    for (const art of REUSED_OBJECT_ART) {
      const asset = assetByKey(art.key);
      expect(asset.path).toBe(art.path);
      expect(art.foot.x).toBeGreaterThanOrEqual(0);
      expect(art.foot.x).toBeLessThan(asset.w);
      expect(art.foot.y).toBeLessThan(asset.h);
    }
  });
});

describe("ships (bzc.158)", () => {
  it("are manifest assets, 96 px wide at most, the moored one the Moored Boat's", () => {
    const listed = new Set(ALL_ASSETS);
    for (const ship of Object.values(SHIP_ART)) {
      expect(listed.has(ship.asset)).toBe(true);
      const { w, h } = rgbaOf(ship.asset.path);
      expect([ship.look, w, h]).toEqual([
        ship.look,
        ship.asset.w,
        ship.asset.h,
      ]);
      expect(w).toBeLessThanOrEqual(96);
      expect(ship.foot).toEqual({ x: Math.floor(w / 2), y: h - 1 });
    }
    expect(SHIP_ART.moored.asset).toBe(artFor("moored-boat")?.asset);
  });

  it("key the white sail and pennant for the owner colour", () => {
    for (const ship of Object.values(SHIP_ART)) {
      if (ship.ownerKey === null) continue;
      const { w, h, px } = rgbaOf(ship.asset.path);
      const keys = new Set(ship.ownerKey.colours);
      let sail = 0;
      for (let y = 0; y < h; y += 1)
        for (let x = ship.ownerKey.minX; x < w; x += 1) {
          const i = (y * w + x) * 4;
          if ((px[i + 3] ?? 0) === 0) continue;
          const hex = `#${[px[i], px[i + 1], px[i + 2]]
            .map((v) => (v ?? 0).toString(16).padStart(2, "0"))
            .join("")}`;
          if (keys.has(hex)) sail += 1;
        }
      // A real sail, not a few stray pixels.
      expect({ look: ship.look, big: sail > 120 }).toEqual({
        look: ship.look,
        big: true,
      });
    }
    expect(SHIP_ART.pirate.ownerKey).toBeNull();
  });
});

describe("artFor (bzc.16)", () => {
  it("gives every core type art of its own", () => {
    const missing = MAP_OBJECT_TYPES.filter(
      (type) =>
        !type.stretch && !type.hidden && artFor(type.id)?.placeholder !== false,
    ).map((type) => type.id);
    expect(missing).toEqual([]);
  });

  it("draws nothing for a buried type and a placeholder for an unknown one", () => {
    expect(artFor("buried-keystone")).toBeNull();
    expect(artFor("buried-cache")).toBeNull();
    const unknown = artFor("no-such-object");
    expect(unknown?.placeholder).toBe(true);
    expect(unknown?.asset.category).toBe("object");
  });

  it("picks a named variant, else the type's first look", () => {
    expect(artVariants("resource-pile")).toEqual([
      "wood",
      "ore",
      "gold",
      "essence",
    ]);
    expect(artFor("resource-pile", "gold")?.asset.key).toBe("gold-pile");
    expect(artFor("resource-pile")?.variant).toBe("wood");
    expect(artFor("resource-pile", "nonsense")?.variant).toBe("wood");
    // The mines' 2x2-scale studio art (bzc.30), not the older reused sprites.
    for (const mine of ["sawmill", "ore-pit", "gold-mine", "essence-spring"]) {
      const art = artFor(mine)!;
      expect(art.asset.key).toBe(`map-object-${mine}`);
      expect(art.asset.h).toBeGreaterThan(CELL_PX);
    }
    expect(artFor("treasure-chest")?.seat).toBe("pickup");
    // The Candy Kingdom's outpost (bzc.112) and the Deepforge's (bzc.131),
    // by faction id like the others.
    expect(artVariants("faction-outpost")).toEqual([
      "humans",
      "undead",
      "goblins",
      "candy",
      "dwarves",
    ]);
    expect(artFor("faction-outpost", "candy")?.variant).toBe("candy");
    expect(artFor("faction-outpost", "dwarves")?.variant).toBe("dwarves");
  });

  it("places the foot on the footprint's bottom centre, seated", () => {
    const art = artFor("windmill")!;
    const at = placeArt(art, 3, 5, 2, 2);
    expect(at.x + art.foot.x).toBe(Math.round(3 * CELL_PX + CELL_PX));
    expect(at.y + art.foot.y).toBe(7 * CELL_PX - SEAT_PX.site);
  });
});
