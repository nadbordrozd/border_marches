/**
 * Bead border_marches-bzc.146: the owner flag sprite, its per-player
 * recolour and wave, its anchor on every ownable building sprite, and its
 * place in the draw order.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  ALL_ASSETS,
  HERO_ASSETS,
  TOWN_3X2_ASSETS,
  TOWN_ASSETS,
} from "../../src/assets/manifest";
import { artFor, artVariants } from "../../src/assets/object-art";
import {
  OWNER_FLAG,
  OWNER_FLAG_ANCHORS,
  ownerFlagAnchor,
} from "../../src/assets/owner-flag";
import { OBJECT_TYPES } from "../../src/data/objectTypes";
import { PLAYER_COLOURS } from "../../src/data/players";
import type { MapObject } from "../../src/core/map/types";
import {
  FLAG_FRAMES,
  clothRamp,
  isCloth,
  recolourFlag,
  waveFrame,
  waveShift,
} from "../../src/render/map/owner-flag";
import { mapAssetList } from "../../src/render/map/assets";
import {
  compareEntries,
  objectEntries,
  ownerFlagEntry,
  unitEntry,
} from "../../src/render/map/scene";

const PUBLIC = join(import.meta.dirname, "..", "..", "public");

/** RGBA of a PNG written by the studio pipeline (8-bit RGBA, filter 0). */
function rgbaOf(path: string): {
  width: number;
  height: number;
  data: Uint8ClampedArray;
} {
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
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    expect(raw[y * (w * 4 + 1)], `${path} row ${y} filter`).toBe(0);
    data.set(
      raw.subarray(y * (w * 4 + 1) + 1, (y + 1) * (w * 4 + 1)),
      y * w * 4,
    );
  }
  return { width: w, height: h, data };
}

const flagPixels = rgbaOf(OWNER_FLAG.path);
const alphaAt = (
  img: { width: number; data: Uint8ClampedArray },
  x: number,
  y: number,
): number => img.data[(y * img.width + x) * 4 + 3] ?? 0;

/** Every sprite a town, a mine or a flagged dwelling can be drawn with. */
function ownableSprites(): {
  key: string;
  path: string;
  w: number;
  h: number;
}[] {
  const out = [...TOWN_3X2_ASSETS, ...TOWN_ASSETS].map((a) => ({
    key: a.key,
    path: a.path,
    w: a.w,
    h: a.h,
  }));
  for (const def of Object.values(OBJECT_TYPES)) {
    // Flagged sites too: the Lighthouse and the Shipwright (bead bzc.151).
    const flaggedSite = def.kind === "site" && def.reset === "flag";
    if (def.kind !== "mine" && def.kind !== "dwelling" && !flaggedSite)
      continue;
    const variants = artVariants(def.id);
    for (const variant of variants.length > 0 ? variants : [""]) {
      const art = artFor(def.id, variant);
      if (art === null || art.placeholder) continue;
      out.push({
        key: art.asset.key,
        path: art.asset.path,
        w: art.asset.w,
        h: art.asset.h,
      });
    }
  }
  return out;
}

describe("the owner flag sprite", () => {
  it("is a manifest asset the map loads, whose PNG matches", () => {
    expect(ALL_ASSETS.some((a) => a.key === OWNER_FLAG.key)).toBe(true);
    expect(mapAssetList().some((a) => a.key === OWNER_FLAG.key)).toBe(true);
    expect([flagPixels.width, flagPixels.height]).toEqual([
      OWNER_FLAG.w,
      OWNER_FLAG.h,
    ]);
  });

  it("has a white and grey cloth right of the pole and a pole to its foot", () => {
    let cloth = 0;
    for (let y = 0; y < OWNER_FLAG.h; y += 1)
      for (let x = 0; x < OWNER_FLAG.w; x += 1) {
        const i = (y * OWNER_FLAG.w + x) * 4;
        const d = flagPixels.data;
        if (!isCloth(d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0, d[i + 3] ?? 0))
          continue;
        cloth += 1;
        expect(x).toBeGreaterThanOrEqual(OWNER_FLAG.clothLeft);
        expect(y).toBeLessThanOrEqual(OWNER_FLAG.clothBottom);
      }
    expect(cloth).toBeGreaterThan(200);
    // The pole runs down to the last row.
    for (let y = OWNER_FLAG.clothBottom; y < OWNER_FLAG.h; y += 1)
      expect(alphaAt(flagPixels, OWNER_FLAG.poleX, y)).toBe(255);
  });
});

describe("the recolour", () => {
  for (const colour of PLAYER_COLOURS) {
    it(`turns the cloth ${colour.name} and keeps the outline and pole`, () => {
      const out = recolourFlag(flagPixels, colour.hex);
      const { base, shade } = clothRamp(colour.hex);
      let baseCount = 0;
      for (let i = 0; i < out.data.length; i += 4) {
        const src = flagPixels.data;
        const cloth = isCloth(
          src[i] ?? 0,
          src[i + 1] ?? 0,
          src[i + 2] ?? 0,
          src[i + 3] ?? 0,
        );
        if (!cloth) {
          expect([...out.data.subarray(i, i + 4)]).toEqual([
            ...src.subarray(i, i + 4),
          ]);
          continue;
        }
        const rgb = [...out.data.subarray(i, i + 3)];
        if (rgb.every((v, k) => Math.abs(v - (base[k] ?? 0)) <= 1))
          baseCount += 1;
      }
      // Most of the cloth is the colour itself; the folds stay darker.
      expect(baseCount).toBeGreaterThan(200);
      expect(shade.reduce((a, b) => a + b, 0)).toBeLessThan(
        base.reduce((a, b) => a + b, 0),
      );
    });
  }
});

describe("the wave", () => {
  it("never moves the pole and moves the cloth by at most a pixel", () => {
    for (let frame = 0; frame < FLAG_FRAMES; frame += 1)
      for (let x = 0; x < OWNER_FLAG.w; x += 1) {
        const dy = waveShift(x, OWNER_FLAG.clothLeft, frame);
        expect(Math.abs(dy)).toBeLessThanOrEqual(1);
        if (x <= OWNER_FLAG.clothLeft) expect(dy).toBe(0);
      }
  });

  it("keeps every pixel of the flag in each frame", () => {
    const opaque = (img: { data: Uint8ClampedArray }): number => {
      let n = 0;
      for (let i = 3; i < img.data.length; i += 4)
        if ((img.data[i] ?? 0) > 0) n += 1;
      return n;
    };
    const frames = Array.from({ length: FLAG_FRAMES }, (_, k) =>
      waveFrame(flagPixels, OWNER_FLAG.clothLeft, k),
    );
    for (const frame of frames) expect(opaque(frame)).toBe(opaque(flagPixels));
    // It does move: not every frame is the same.
    expect(new Set(frames.map((f) => f.data.join(","))).size).toBeGreaterThan(
      1,
    );
  });
});

describe("the anchors", () => {
  const sprites = ownableSprites();

  it("cover every town stage, mine and flagged dwelling", () => {
    expect(sprites.length).toBeGreaterThanOrEqual(31);
    for (const s of sprites)
      expect(OWNER_FLAG_ANCHORS[s.key], s.key).toBeDefined();
    const keys = new Set(sprites.map((s) => s.key));
    for (const key of Object.keys(OWNER_FLAG_ANCHORS))
      expect(keys.has(key), `${key} is ownable`).toBe(true);
  });

  it("plant the pole on the building, in its upper half", () => {
    for (const s of sprites) {
      const a = ownerFlagAnchor(s);
      const img = rgbaOf(s.path);
      expect(a.pole, s.key).toBeGreaterThanOrEqual(2);
      expect(a.pole, s.key).toBeLessThanOrEqual(8);
      // Something opaque at or just under the foot: never floating.
      const under = [0, 1, 2, 3].some(
        (d) => a.y + d < img.height && alphaAt(img, a.x, a.y + d) > 0,
      );
      expect(under, `${s.key} foot (${a.x}, ${a.y})`).toBe(true);
      expect(a.y, s.key).toBeLessThan(img.height / 2);
    }
  });
});

describe("the flag in the draw order", () => {
  const town: MapObject = {
    id: "t1",
    kind: "town",
    x: 5,
    y: 6,
    footprint: { w: 3, h: 2 },
    blocked: [
      [4, 5],
      [5, 5],
      [6, 5],
      [4, 6],
      [6, 6],
    ],
    data: { faction: "humans", fort: 2 },
  };
  const building = objectEntries([town])[0];
  if (building === undefined) throw new Error("no town entry");
  const flag = ownerFlagEntry(building, "#d8402f", "5,6");
  if (flag === null) throw new Error("no flag entry");
  const hero = unitEntry(HERO_ASSETS[0] ?? (undefined as never), 5, 6);

  it("is planted at the town sprite's anchor", () => {
    const anchor = OWNER_FLAG_ANCHORS["realm-castle-3x2"];
    const sprite = building.sprites[0];
    const op = flag.sprites[0];
    expect(sprite?.key).toBe("realm-castle-3x2");
    expect(op?.flag?.colour).toBe("#d8402f");
    expect((op?.dx ?? 0) + OWNER_FLAG.poleX).toBe(
      (sprite?.dx ?? 0) + (anchor?.x ?? 0),
    );
    expect((op?.dy ?? 0) + (op?.sh ?? 0) - 1).toBe(
      (sprite?.dy ?? 0) + (anchor?.y ?? 0),
    );
  });

  it("is drawn right after its town and under a hero at the gate", () => {
    const order = [hero, flag, building].sort(compareEntries);
    expect(order).toEqual([building, flag, hero]);
  });

  it("stays clear of a hero standing at the entrance", () => {
    const op = flag.sprites[0];
    const body = hero.sprites[0];
    if (op === undefined || body === undefined) throw new Error("no sprites");
    const apart =
      op.dy + op.sh <= body.dy ||
      op.dx >= body.dx + body.sw ||
      op.dx + op.sw <= body.dx;
    expect(apart).toBe(true);
  });
});
