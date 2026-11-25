/**
 * Bead border_marches-bzc.48: the decoration catalogue (passable small
 * decorations and impassable props) and its studio sprites.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  ALL_ASSETS,
  CELL_PX,
  DOODAD_ASSETS,
  GROUND_TERRAINS,
} from "../../src/assets/manifest";
import {
  DECORATION_ASSETS,
  DECORATIONS,
  decorationById,
  decorationLook,
  decorationsFor,
} from "../../src/assets/decorations";
import { SEAT_PX } from "../../src/assets/object-art";

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
  for (let y = 0; y < h; y += 1)
    px.set(raw.subarray(y * (w * 4 + 1) + 1, (y + 1) * (w * 4 + 1)), y * w * 4);
  return { w, h, px };
}

describe("decoration catalogue (bzc.48)", () => {
  it("has about 24 passable decorations and 16 props, ids unique", () => {
    const ids = DECORATIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DECORATIONS.filter((d) => d.passable).length).toBeGreaterThan(20);
    expect(DECORATIONS.filter((d) => !d.passable).length).toBeGreaterThan(14);
    expect(DECORATIONS.some((d) => !d.passable && d.cols === 2)).toBe(true);
  });

  it("gives every decoration a name, a line, grounds and a look", () => {
    for (const d of DECORATIONS) {
      expect(d.name, d.id).not.toBe("");
      expect(d.text, d.id).not.toBe("");
      expect(d.terrains.length, d.id).toBeGreaterThan(0);
      expect(d.looks.length, d.id).toBeGreaterThan(0);
      expect(decorationById(d.id)).toBe(d);
      expect(d.rows).toBe(1);
      expect(d.passable ? [1] : [1, 2]).toContain(d.cols);
    }
    expect(decorationById("no-such-thing")).toBeUndefined();
  });

  it("has passable decorations and props on every land ground", () => {
    for (const ground of GROUND_TERRAINS) {
      expect(decorationsFor(ground, true).length, ground).toBeGreaterThan(2);
      expect(decorationsFor(ground, false).length, ground).toBeGreaterThan(2);
    }
  });

  it("wraps look variants", () => {
    const d = DECORATIONS.find((x) => x.looks.length > 1);
    expect(d).toBeDefined();
    if (d === undefined) return;
    expect(decorationLook(d, d.looks.length)).toBe(d.looks[0]);
    expect(decorationLook(d, -1)).toBe(d.looks[d.looks.length - 1]);
  });

  it("does not repeat a doodad's subject", () => {
    const doodadKinds = new Set(DOODAD_ASSETS.map((a) => a.kind));
    for (const d of DECORATIONS)
      expect(doodadKinds.has(d.id), d.id).toBe(false);
  });
});

describe("decoration sprites (bzc.48)", () => {
  it("are manifest assets whose PNG matches, foot on the last row", () => {
    const listed = new Set(ALL_ASSETS);
    for (const asset of DECORATION_ASSETS) {
      expect(listed.has(asset), asset.key).toBe(true);
      const { w, h, px } = rgbaOf(asset.path);
      expect([asset.key, w, h]).toEqual([asset.key, asset.w, asset.h]);
      expect(asset.foot).toEqual({ x: Math.floor(w / 2), y: h - 1 });
      let foot = 0;
      for (let x = 0; x < w; x += 1)
        if ((px[((h - 1) * w + x) * 4 + 3] ?? 0) > 0) foot += 1;
      expect(foot, asset.key).toBeGreaterThan(0);
    }
  });

  it("keep passable decorations small and props inside their row", () => {
    for (const d of DECORATIONS)
      for (const look of d.looks) {
        if (d.passable) {
          // Smaller than a 40 px pickup: never mistaken for loot.
          expect(Math.max(look.w, look.h), look.key).toBeLessThanOrEqual(32);
        } else {
          expect(look.w, look.key).toBeLessThanOrEqual(d.cols * CELL_PX);
          expect(look.h, look.key).toBeLessThanOrEqual(CELL_PX - SEAT_PX.site);
          // A prop fills its footprint: at least half of it wide.
          expect(look.w, look.key).toBeGreaterThan((d.cols * CELL_PX) / 2);
        }
      }
  });
});
