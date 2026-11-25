/**
 * The studio map art of bead border_marches-xaj.14 (docs/art/MASSIF_ART.md):
 * 3x2 towns and doodads (its massif pieces were retired by bead xaj.29).
 * Checks the geometry metadata the
 * wiring bead relies on against the baked PNGs themselves (opaque box,
 * paint above the footprint, foot gap), so a re-bake cannot drift from the
 * manifest. Provenance (studio records, verdicts, hashes) is checked by
 * manifest.test.ts for every studio output.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  CELL_PX,
  DOODAD_ASSETS,
  doodadsOf,
  GROUND_TERRAINS,
  TOWN_3X2_ASSETS,
  type PixelBox,
} from "../../src/assets/manifest";

const PUBLIC = join(import.meta.dirname, "..", "..", "public");

/** Alpha channel of a baked studio PNG (8-bit RGBA, filter 0 rows). */
function alphaOf(path: string): { w: number; h: number; alpha: Uint8Array } {
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
      expect([data[8], data[9], data[12]], path).toEqual([8, 6, 0]);
    } else if (type === "IDAT") idat.push(data);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const alpha = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const row = y * (w * 4 + 1);
    expect(raw[row], `${path} row ${y} filter`).toBe(0);
    for (let x = 0; x < w; x += 1)
      alpha[y * w + x] = raw[row + 1 + x * 4 + 3] ?? 0;
  }
  return { w, h, alpha };
}

function opaqueBox(path: string): PixelBox & { cw: number; ch: number } {
  const { w, h, alpha } = alphaOf(path);
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1)
      if ((alpha[y * w + x] ?? 0) > 0) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, cw: w, ch: h };
}

describe("3x2 towns (xaj.14)", () => {
  it("fill a 3x2 footprint canvas with a measured box", () => {
    expect(
      TOWN_3X2_ASSETS.map((t) => `${t.faction}/${t.stage}`).sort(),
    ).toEqual([
      "dinosaur/fort",
      "goblin/camp",
      "goblin/fort",
      "humans/camp",
      "humans/fort",
      "undead/camp",
      "undead/fort",
    ]);
    for (const town of TOWN_3X2_ASSETS) {
      expect([town.w, town.h]).toEqual([3 * CELL_PX, 2 * CELL_PX + town.up]);
      const measured = opaqueBox(town.path);
      expect({ key: town.key, ...measured }).toEqual({
        key: town.key,
        ...town.box,
        cw: town.w,
        ch: town.h,
      });
      expect(town.contactY).toBe(town.box.y + town.box.h);
    }
  });
});

describe("doodads (xaj.14)", () => {
  it("give every land terrain 4-6 small decorations anchored at the foot", () => {
    for (const terrain of GROUND_TERRAINS) {
      const set = doodadsOf(terrain);
      expect(set.length).toBeGreaterThanOrEqual(4);
      expect(set.length).toBeLessThanOrEqual(6);
    }
    for (const doodad of DOODAD_ASSETS) {
      expect(Math.max(doodad.w, doodad.h)).toBeLessThanOrEqual(48);
      expect(Math.max(doodad.w, doodad.h)).toBeGreaterThanOrEqual(20);
      const measured = opaqueBox(doodad.path);
      // Cropped to the opaque box plus a 1 px margin.
      expect({ key: doodad.key, w: measured.w + 2, h: measured.h + 2 }).toEqual(
        { key: doodad.key, w: doodad.w, h: doodad.h },
      );
      expect(doodad.anchor).toEqual({
        x: Math.floor(doodad.w / 2),
        y: doodad.h - 1,
      });
    }
  });
});
