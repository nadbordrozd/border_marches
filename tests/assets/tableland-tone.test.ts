/**
 * Bead border_marches-xaj.23: the seams of a tableland chain. Pieces of
 * different takes join only when their flat tops are one colour, and no
 * piece the packer uses has dark patches on its top (the caprock patches of
 * s7-table52-b read as dark red smudges along a long tableland).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { MASSIF_PIECES } from "../../src/assets/manifest";
import { RETIRED_TAKES, TABLE_CUT, toneOf } from "../../src/render/map/massif";

const PUBLIC = join(import.meta.dirname, "..", "..", "public");

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

/**
 * The top band of a piece: in every column, the 20 rows under its first
 * opaque pixel (past the 4-row outline). Returns the most common colour, its
 * share, and the share of PATCH pixels: mid-dark red-brown (luma 100-150,
 * red over green by more than 60), the colour of the caprock patches; the
 * outline and cracks are darker, the top and its shading lighter.
 */
export function topBand(path: string): {
  colour: [number, number, number];
  share: number;
  dark: number;
} {
  const { w, h, px } = rgbaOf(path);
  const count = new Map<number, number>();
  let n = 0;
  let dark = 0;
  for (let x = 8; x < w - 8; x += 1) {
    let y0 = 0;
    while (y0 < h && (px[(y0 * w + x) * 4 + 3] ?? 0) < 128) y0 += 1;
    for (let y = y0 + 4; y < Math.min(h, y0 + 24); y += 1) {
      const k = (y * w + x) * 4;
      if ((px[k + 3] ?? 0) < 128) continue;
      const [r = 0, g = 0, b = 0] = px.subarray(k, k + 3);
      const c = (r << 16) | (g << 8) | b;
      count.set(c, (count.get(c) ?? 0) + 1);
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      if (luma >= 100 && luma < 150 && r - g > 60) dark += 1;
      n += 1;
    }
  }
  const [c = 0, v = 0] = [...count].sort((a, b) => b[1] - a[1])[0] ?? [];
  return {
    colour: [(c >> 16) & 255, (c >> 8) & 255, c & 255],
    share: v / Math.max(1, n),
    dark: dark / Math.max(1, n),
  };
}

const joinable = MASSIF_PIECES.filter(
  (p) => TABLE_CUT[p.key] !== undefined && !RETIRED_TAKES.has(p.source),
);

describe("tableland seams (xaj.23)", () => {
  it("joins only takes whose flat tops are one colour", () => {
    const groups = new Map<string, Map<string, [number, number, number]>>();
    for (const p of joinable) {
      const key = `${TABLE_CUT[p.key]?.family}/${toneOf(p.source)}`;
      const group = groups.get(key) ?? new Map();
      groups.set(key, group);
      if (!group.has(p.source)) group.set(p.source, topBand(p.path).colour);
    }
    expect(groups.size).toBeGreaterThan(1);
    for (const [key, group] of groups) {
      const tops = [...group.values()];
      for (const a of tops)
        for (const b of tops)
          for (let i = 0; i < 3; i += 1)
            expect(
              Math.abs((a[i] ?? 0) - (b[i] ?? 0)),
              `${key}: ${a} against ${b}`,
            ).toBeLessThanOrEqual(10);
    }
  });

  it("uses no tableland piece with dark patches on its top", () => {
    for (const p of joinable)
      expect(topBand(p.path).dark, p.key).toBeLessThan(0.05);
  });

  it("retires the take whose caprock patches read as smudges", () => {
    const retired = MASSIF_PIECES.filter((p) => RETIRED_TAKES.has(p.source));
    expect(retired.length).toBeGreaterThan(0);
    expect(
      Math.max(...retired.map((p) => topBand(p.path).dark)),
    ).toBeGreaterThanOrEqual(0.05);
  });
});
