/**
 * The studio map art of bead border_marches-xaj.14 (docs/art/MASSIF_ART.md):
 * massif pieces, 3x2 towns and doodads. Checks the geometry metadata the
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
  MASSIF_PALETTE_TERRAINS,
  MASSIF_PIECES,
  massifPieces,
  TOWN_3X2_ASSETS,
  type MassifPalette,
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

describe("massif pieces (xaj.14)", () => {
  it("have footprint canvases and measured boxes that match the PNGs", () => {
    for (const piece of MASSIF_PIECES) {
      expect(piece.w).toBe(piece.cols * CELL_PX);
      expect(piece.h).toBe(piece.rows * CELL_PX + piece.up);
      expect(piece.up).toBe(
        ["massif", "ridge", "peak", "spine", "plateau"].includes(piece.kind)
          ? 48
          : 24,
      );
      const measured = opaqueBox(piece.path);
      expect({ key: piece.key, ...measured }).toEqual({
        key: piece.key,
        ...piece.box,
        cw: piece.w,
        ch: piece.h,
      });
      expect(piece.paintUp).toBe(piece.up - piece.box.y);
      expect(piece.footGap).toBe(piece.h - piece.box.y - piece.box.h);
      // Never clipped by the canvas top, never sitting on the bottom edge.
      expect(piece.footGap).toBeGreaterThanOrEqual(3);
    }
  });

  it("cover every palette with massifs, ridges, 1x1 pieces and a mine", () => {
    const palettes: MassifPalette[] = ["granite", "sandstone", "basalt"];
    expect(Object.keys(MASSIF_PALETTE_TERRAINS).sort()).toEqual(
      [...palettes].sort(),
    );
    expect(Object.values(MASSIF_PALETTE_TERRAINS).flat().sort()).toEqual(
      [...GROUND_TERRAINS].sort(),
    );
    for (const palette of palettes) {
      expect(
        massifPieces(palette, "massif", 2, 2).length,
      ).toBeGreaterThanOrEqual(2);
      expect(
        massifPieces(palette, "massif", 3, 2).length,
      ).toBeGreaterThanOrEqual(2);
      expect(
        massifPieces(palette, "ridge", 2, 1).length,
      ).toBeGreaterThanOrEqual(3);
      expect(
        massifPieces(palette, "ridge", 3, 1).length,
      ).toBeGreaterThanOrEqual(2);
      expect(
        massifPieces(palette).filter((p) => p.cols === 1 && p.kind !== "mine")
          .length,
      ).toBeGreaterThanOrEqual(3);
      expect(massifPieces(palette, "mine").length).toBeGreaterThanOrEqual(1);
      // Bead xaj.20 (every Mountain cell in a 2x2 block): a tall 2x3 for
      // north-south bands, four or more 2x2 and 3x2 massifs, and a low 3x1
      // hump for three-cell runs where a tall ridge may not stand.
      expect(massifPieces(palette, "massif", 2, 3).length).toBeGreaterThan(0);
      expect(
        massifPieces(palette, "massif", 2, 2).length,
      ).toBeGreaterThanOrEqual(4);
      expect(
        massifPieces(palette, "massif", 3, 2).length,
      ).toBeGreaterThanOrEqual(4);
      expect(massifPieces(palette, "rounded", 3, 1).length).toBeGreaterThan(0);
    }
  });

  it("number variants 0..n-1 within each palette, kind and footprint", () => {
    const groups = new Map<string, number[]>();
    for (const p of MASSIF_PIECES) {
      const key = `${p.palette}/${p.kind}/${p.cols}x${p.rows}`;
      groups.set(key, [...(groups.get(key) ?? []), p.variant]);
    }
    for (const [key, variants] of groups)
      expect({ key, variants: [...variants].sort((a, b) => a - b) }).toEqual({
        key,
        variants: variants.map((_, i) => i),
      });
  });
});

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
