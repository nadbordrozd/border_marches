import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { HERO_ASSETS, UNIT_ASSETS } from "../../../src/assets/manifest.ts";
import { UNIT_OPAQUE_TOP } from "../../../src/assets/unit-tops.ts";
import {
  BATTLE_HEX_COUNT,
  hexFromIndex,
  neighbors,
} from "../../../src/core/battle/index.ts";
import {
  FIELD_H,
  FIELD_W,
  FIELD_X,
  FIELD_Y,
  FEET_BELOW_CENTER,
  HEX_SIZE,
  HEX_W,
  MAX_SPRITE_RISE,
  STAGE_H,
  STAGE_W,
  VIEW_CORE_H,
  VIEW_CORE_W,
  VIEW_TOP_MIN,
  feetPoint,
  fitZoom,
  hexCorners,
  hexToStage,
  stageToHex,
  stageToView,
  stageView,
  viewToStage,
} from "../../../src/render/battle/geometry.ts";

describe("battle hex geometry", () => {
  it("every hex centre hits its own hex", () => {
    for (let i = 0; i < BATTLE_HEX_COUNT; i++) {
      const h = hexFromIndex(i);
      expect(stageToHex(hexToStage(h))).toEqual(h);
    }
  });

  it("points inside a hex (to 90% of the inner radius) hit it", () => {
    const inner = (HEX_W / 2) * 0.9;
    for (const h of [hexFromIndex(0), hexFromIndex(16), hexFromIndex(97)]) {
      const c = hexToStage(h);
      for (let k = 0; k < 12; k++) {
        const a = (Math.PI * 2 * k) / 12;
        const p = {
          x: c.x + inner * Math.cos(a),
          y: c.y + inner * Math.sin(a),
        };
        expect(stageToHex(p)).toEqual(h);
      }
    }
  });

  it("neighbours are one hex width apart and odd rows shift right", () => {
    const h = { col: 7, row: 5 };
    const c = hexToStage(h);
    for (const n of neighbors(h)) {
      const d = hexToStage(n);
      expect(Math.hypot(d.x - c.x, d.y - c.y)).toBeCloseTo(HEX_W, 6);
    }
    expect(
      hexToStage({ col: 0, row: 1 }).x - hexToStage({ col: 0, row: 0 }).x,
    ).toBeCloseTo(HEX_W / 2, 6);
  });

  it("corners sit one radius out; points off the field are null", () => {
    expect(stageToHex({ x: FIELD_X - 5, y: FIELD_Y + HEX_SIZE })).toBeNull();
    expect(stageToHex({ x: 1, y: 1 })).toBeNull();
    expect(stageToHex({ x: STAGE_W - 1, y: STAGE_H - 1 })).toBeNull();
    const corners = hexCorners({ col: 3, row: 3 });
    expect(corners).toHaveLength(6);
    const c = hexToStage({ col: 3, row: 3 });
    for (const p of corners) {
      expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeCloseTo(HEX_SIZE, 6);
    }
  });

  it("the whole field and the heads of row 0 fit on the stage", () => {
    for (let i = 0; i < BATTLE_HEX_COUNT; i++) {
      const f = feetPoint(hexFromIndex(i));
      // A giant sprite stands 98 px tall over its feet.
      expect(f.y - 98).toBeGreaterThan(-60);
      expect(f.x).toBeGreaterThan(0);
      expect(f.x).toBeLessThan(STAGE_W);
      expect(f.y).toBeLessThan(STAGE_H);
    }
  });
});

/**
 * The battle screen's chrome around the stage wrapper, measured in the
 * browser: top bar 32, action bar 58, bottom panel 116.
 */
const CHROME_H = 32 + 58 + 116;
const box = (w: number, h: number): [number, number] => [w, h - CHROME_H];

/** The windows the bead checks, as [width, height]. */
const WINDOWS = [
  [1280, 800],
  [1440, 900],
  [1920, 1080],
  [2560, 1440],
  [1100, 700],
] as const;

/** Alpha channel of an RGBA PNG (any row filter). */
function alphaOf(file: string): { w: number; h: number; alpha: Uint8Array } {
  const buf = readFileSync(file);
  let at = 8;
  let w = 0;
  let h = 0;
  const idat: Buffer[] = [];
  while (at < buf.length) {
    const length = buf.readUInt32BE(at);
    const type = buf.subarray(at + 4, at + 8).toString("latin1");
    const data = buf.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      expect([data[8], data[9], data[12]], file).toEqual([8, 6, 0]);
    } else if (type === "IDAT") idat.push(data);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x] ?? 0;
      const a = x >= 4 ? (px[y * stride + x - 4] ?? 0) : 0;
      const b = y > 0 ? (px[(y - 1) * stride + x] ?? 0) : 0;
      const c = x >= 4 && y > 0 ? (px[(y - 1) * stride + x - 4] ?? 0) : 0;
      let pred = 0;
      if (filter === 1) pred = a;
      else if (filter === 2) pred = b;
      else if (filter === 3) pred = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = (v + pred) & 255;
    }
  }
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = px[i * 4 + 3] ?? 0;
  return { w, h, alpha };
}

/** First opaque row of a sprite, measured from its PNG. */
function opaqueTop(path: string): number {
  const { w, h, alpha } = alphaOf(join(PUBLIC, path));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if ((alpha[y * w + x] ?? 0) > 0) return y;
  }
  return h;
}

const PUBLIC = join(import.meta.dirname, "..", "..", "..", "public");
const SPRITES = [...UNIT_ASSETS, ...HERO_ASSETS];

describe("sprite head room (bzc.53)", () => {
  // Measured from the PNGs, independent of UNIT_OPAQUE_TOP.
  const rises = SPRITES.map((a) => ({
    key: a.key,
    rise: a.feet.contactY - opaqueTop(a.path) - FEET_BELOW_CENTER - HEX_SIZE,
  }));
  const maxRise = Math.max(...rises.map((r) => r.rise));

  it("UNIT_OPAQUE_TOP matches every sprite's PNG", () => {
    for (const a of SPRITES) {
      expect(UNIT_OPAQUE_TOP[a.key], a.key).toBe(opaqueTop(a.path));
    }
    expect(MAX_SPRITE_RISE).toBe(maxRise);
    expect(VIEW_TOP_MIN).toBeGreaterThanOrEqual(maxRise);
    // The tall ones really are tall: Brass Titan and Late King rise 50 px.
    expect(maxRise).toBeGreaterThanOrEqual(50);
  });

  it("the view keeps the tallest head in view above row 0 in every window", () => {
    for (const [W, H] of WINDOWS) {
      for (const dpr of [1, 2]) {
        const [w, h] = box(W, H);
        const v = stageView(w, h, dpr);
        const rowTop = stageToView({ x: 0, y: FIELD_Y }, v).y;
        // Top room in stage pixels, and the field bottom still in the box.
        expect(rowTop / v.zoom, `${W}x${H}@${dpr}`).toBeGreaterThanOrEqual(
          maxRise,
        );
        const bottom = stageToView({ x: 0, y: FIELD_Y + FIELD_H }, v).y;
        expect(bottom, `${W}x${H}@${dpr}`).toBeLessThanOrEqual(h + 1 / dpr);
      }
    }
  });
});

describe("fitZoom", () => {
  it("takes quarter steps from 1 in the common windows (UI2-02)", () => {
    // No head is cut: 1920x1080 is 1.25x (1.5x would cut 50 px rises).
    const cases: [number, number, number][] = [
      [1280, 800, 1],
      [1440, 900, 1],
      [1920, 1080, 1.25],
      [2560, 1440, 2],
    ];
    for (const [w, h, zoom] of cases) {
      for (const dpr of [1, 2]) {
        expect(fitZoom(...box(w, h), dpr), `${w}x${h}@${dpr}`).toBe(zoom);
      }
    }
    expect(fitZoom(VIEW_CORE_W * 2, VIEW_CORE_H * 1.3)).toBe(1.25);
    expect(fitZoom(VIEW_CORE_W * 2, VIEW_CORE_H * 1.74)).toBe(1.5);
    expect(fitZoom(VIEW_CORE_W * 2, VIEW_CORE_H * 1.76)).toBe(1.75);
  });

  it("prefers a whole number of device pixels when it is larger", () => {
    // At dpr 1.5, 4/3 is two device pixels per stage pixel.
    expect(fitZoom(VIEW_CORE_W * 2, VIEW_CORE_H * 1.4, 1.5)).toBeCloseTo(
      4 / 3,
      9,
    );
    expect(fitZoom(VIEW_CORE_W * 2, VIEW_CORE_H * 1.4, 1)).toBe(1.25);
  });

  it("falls back to a fractional fit in a small window", () => {
    expect(fitZoom(VIEW_CORE_W * 0.8, VIEW_CORE_H)).toBeCloseTo(0.8, 6);
    expect(fitZoom(10, 10)).toBe(0.25);
  });
});

describe("stageView", () => {
  it("fills most of the free height with the field at 1920x1080", () => {
    // UI2-02 asked for 80% at 1.5x; whole heads won over size (bzc.53
    // review), so at 1.25x the field is 680 of 874 px (78%).
    const [w, h] = box(1920, 1080);
    const v = stageView(w, h);
    expect(v.zoom).toBe(1.25);
    expect((FIELD_H * v.zoom) / h).toBeGreaterThanOrEqual(0.75);
  });

  it("keeps the field and its head room in the box", () => {
    for (const [W, H] of WINDOWS) {
      for (const dpr of [1, 2]) {
        const [w, h] = box(W, H);
        const v = stageView(w, h, dpr);
        const top = stageToView({ x: FIELD_X, y: FIELD_Y }, v);
        const bottom = stageToView(
          { x: FIELD_X + FIELD_W, y: FIELD_Y + FIELD_H },
          v,
        );
        expect(top.x, `${W}x${H}`).toBeGreaterThanOrEqual(0);
        expect(bottom.x).toBeLessThanOrEqual(w);
        expect(top.y).toBeGreaterThanOrEqual(VIEW_TOP_MIN * v.zoom);
        expect(bottom.y).toBeLessThanOrEqual(h + 1 / dpr);
        // Offsets are whole device pixels.
        expect(Number.isInteger(v.x * dpr)).toBe(true);
        expect(Number.isInteger(v.y * dpr)).toBe(true);
      }
    }
  });

  it("centres the whole stage when its margins fit", () => {
    const v = stageView(STAGE_W * 2 + 40, STAGE_H * 2 + 20);
    expect(v.zoom).toBe(2);
    expect(v.x).toBe(20);
    expect(v.y).toBe(10);
  });

  it("maps pointer pixels to hexes at a fractional zoom", () => {
    for (const [w, h, zoom] of [
      [1920, 900, 1.5],
      [1500, 760, 1.25],
    ] as const) {
      const v = stageView(w, h);
      expect(v.zoom).toBe(zoom);
      const inner = (HEX_W / 2) * 0.8;
      for (let i = 0; i < BATTLE_HEX_COUNT; i++) {
        const hex = hexFromIndex(i);
        const c = stageToView(hexToStage(hex), v);
        // Pointer events land on whole CSS pixels.
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI * 2 * k) / 6 + 0.3;
          const p = {
            x: Math.round(c.x + inner * zoom * Math.cos(a)),
            y: Math.round(c.y + inner * zoom * Math.sin(a)),
          };
          expect(stageToHex(viewToStage(p, v))).toEqual(hex);
        }
      }
      // The two transforms invert each other; off the field is null.
      const s = viewToStage(stageToView({ x: 123.5, y: 77 }, v), v);
      expect(s.x).toBeCloseTo(123.5, 9);
      expect(s.y).toBeCloseTo(77, 9);
      expect(stageToHex(viewToStage({ x: 2, y: 2 }, v))).toBeNull();
    }
  });
});
