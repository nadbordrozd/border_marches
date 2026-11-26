/**
 * Code-drawn doodads (bead border_marches-xaj.13): small pixel-art rocks,
 * boulders, bushes, flowers, bones, puddles and cracks for the decoration
 * layer (doodads.ts), tinted per ground, until the dedicated doodad sprites
 * of the asset bead arrive. Each image is a pure function of its kind, ground
 * and variant, painted pixel by pixel into an RGBA buffer: a hashed blob
 * outline, three tones lit from the top left, a dark one-pixel outline and a
 * soft contact shadow, the same light and outline as the imported sprites.
 */
import type { GroundTerrain } from "../../assets/manifest";
import { hash4 } from "./hash";

type Rgb = readonly [number, number, number];

export type DoodadArtKind =
  "rock" | "boulder" | "bush" | "flowers" | "bones" | "puddle" | "crack";

export interface DoodadArt {
  readonly key: string;
  readonly w: number;
  readonly h: number;
  /** RGBA, w x h. */
  readonly data: Uint8ClampedArray;
}

/** Variants drawn of each kind and ground. */
export const DOODAD_ART_VARIANTS = 3;

/** Base colours per ground: rock, bush leaves, flower petals, puddle water. */
const PALETTE: Readonly<
  Record<
    GroundTerrain,
    { rock: Rgb; bush: Rgb; petals: readonly Rgb[]; water: Rgb }
  >
> = {
  grass: {
    rock: [150, 146, 136],
    bush: [70, 140, 52],
    petals: [
      [250, 246, 220],
      [250, 214, 70],
      [236, 120, 150],
    ],
    water: [86, 150, 190],
  },
  jungle: {
    rock: [120, 132, 110],
    bush: [40, 110, 50],
    petals: [
      [236, 70, 60],
      [250, 200, 60],
      [200, 110, 220],
    ],
    water: [70, 140, 150],
  },
  steppe: {
    rock: [176, 160, 128],
    bush: [140, 140, 60],
    petals: [
      [250, 230, 120],
      [240, 170, 80],
      [250, 246, 220],
    ],
    water: [110, 150, 170],
  },
  badlands: {
    rock: [168, 100, 70],
    bush: [130, 110, 60],
    petals: [
      [250, 220, 120],
      [240, 150, 90],
      [250, 246, 220],
    ],
    water: [120, 120, 110],
  },
  wasteland: {
    rock: [110, 106, 104],
    bush: [104, 100, 90],
    petals: [
      [180, 170, 200],
      [210, 200, 190],
      [160, 200, 120],
    ],
    water: [80, 96, 90],
  },
  volcanic: {
    rock: [78, 70, 68],
    bush: [96, 86, 78],
    petals: [
      [240, 140, 60],
      [210, 200, 190],
      [250, 200, 90],
    ],
    water: [70, 60, 58],
  },
  snow: {
    rock: [128, 136, 150],
    bush: [70, 96, 88],
    petals: [
      [238, 244, 250],
      [190, 214, 236],
      [210, 200, 170],
    ],
    water: [160, 196, 220],
  },
};

const OUTLINE: Rgb = [28, 24, 22];

const scale = (c: Rgb, k: number): Rgb => [
  Math.min(255, Math.round(c[0] * k)),
  Math.min(255, Math.round(c[1] * k)),
  Math.min(255, Math.round(c[2] * k)),
];

class Canvas {
  readonly data: Uint8ClampedArray;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }
  set(x: number, y: number, c: Rgb, a = 255): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const o = (y * this.w + x) * 4;
    const under = this.data[o + 3] ?? 0;
    if (a >= 255 || under === 0) {
      this.data[o] = c[0];
      this.data[o + 1] = c[1];
      this.data[o + 2] = c[2];
      this.data[o + 3] = Math.max(a, under);
      return;
    }
    const t = a / 255;
    this.data[o] = (this.data[o] ?? 0) * (1 - t) + c[0] * t;
    this.data[o + 1] = (this.data[o + 1] ?? 0) * (1 - t) + c[1] * t;
    this.data[o + 2] = (this.data[o + 2] ?? 0) * (1 - t) + c[2] * t;
  }
  alpha(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[(y * this.w + x) * 4 + 3] ?? 0;
  }
}

/** A soft contact shadow ellipse (under everything drawn later). */
function shadow(
  c: Canvas,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (d < 1) c.set(x, y, [20, 18, 24], 70);
    }
}

interface Lobe {
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
}

/**
 * Lobes painted back to front, each lit from the top left on its own (a
 * light cap, a base, a dark underside) with a dark seam where it overlaps the
 * lobes behind it, then one outline round the whole silhouette: a pile of
 * stones or a clump of foliage. `grain` adds leaf or grit speckles.
 */
function lobed(
  c: Canvas,
  lobes: readonly Lobe[],
  base: Rgb,
  grain: number,
  salt: number,
): void {
  const light = scale(base, 1.3);
  const dark = scale(base, 0.68);
  const seam = scale(base, 0.5);
  const sorted = [...lobes].sort((a, b) => a.y + a.ry - (b.y + b.ry));
  const solid = new Uint8Array(c.w * c.h);
  const within = (l: Lobe, x: number, y: number): boolean =>
    ((x + 0.5 - l.x) / l.rx) ** 2 + ((y + 0.5 - l.y) / l.ry) ** 2 < 1;
  for (const l of sorted)
    for (let y = Math.floor(l.y - l.ry); y <= Math.ceil(l.y + l.ry); y += 1)
      for (let x = Math.floor(l.x - l.rx); x <= Math.ceil(l.x + l.rx); x += 1) {
        if (x < 0 || y < 0 || x >= c.w || y >= c.h || !within(l, x, y))
          continue;
        const rim =
          !within(l, x - 1, y) ||
          !within(l, x + 1, y) ||
          !within(l, x, y - 1) ||
          !within(l, x, y + 1);
        const t = ((x + 0.5 - l.x) / l.rx) * 0.6 + (y + 0.5 - l.y) / l.ry;
        let tone = t < -0.5 ? light : t > 0.45 ? dark : base;
        const roll = hash4(x, y, salt, 0x3b) / 0x1_0000_0000;
        if (roll < grain) tone = t < 0 ? scale(tone, 1.16) : scale(tone, 0.8);
        // A rim pixel over a lobe behind is a seam; elsewhere the outline
        // pass below draws it.
        c.set(x, y, rim && solid[y * c.w + x] === 1 && t > -0.3 ? seam : tone);
        solid[y * c.w + x] = 1;
      }
  // The silhouette outline.
  const filled = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < c.w && y < c.h && solid[y * c.w + x] === 1;
  for (let y = 0; y < c.h; y += 1)
    for (let x = 0; x < c.w; x += 1)
      if (
        filled(x, y) &&
        (!filled(x - 1, y) ||
          !filled(x + 1, y) ||
          !filled(x, y - 1) ||
          !filled(x, y + 1))
      )
        c.set(x, y, OUTLINE);
}

function rock(
  ground: GroundTerrain,
  variant: number,
  big: boolean,
): { w: number; h: number; c: Canvas } {
  const r = (k: number): number =>
    hash4(variant, k, big ? 7 : 3, 0x4c1) / 0x1_0000_0000;
  const w = big ? 40 : 24;
  const h = big ? 30 : 18;
  const c = new Canvas(w, h);
  const base = scale(PALETTE[ground].rock, 0.92 + r(20) * 0.16);
  shadow(c, w / 2 + 1.5, h - 4, w / 2 - 2, big ? 4 : 3);
  const lobes: Lobe[] = [];
  if (big) {
    // A boulder with one or two stones leaning on it.
    const rx = 10 + r(0) * 3;
    lobes.push({ x: w / 2 - 2 + r(1) * 4, y: h - 13, rx, ry: rx * 0.82 });
    lobes.push({ x: w / 2 + 9, y: h - 8, rx: 5 + r(2) * 2, ry: 4 + r(3) });
    if (r(4) < 0.6)
      lobes.push({ x: w / 2 - 11, y: h - 7, rx: 4 + r(5) * 2, ry: 3.4 });
  } else {
    const rx = 6 + r(0) * 2.5;
    lobes.push({ x: w / 2 - 1, y: h - 8, rx, ry: rx * (0.66 + r(1) * 0.16) });
    if (r(2) < 0.7)
      lobes.push({ x: w / 2 + 6, y: h - 5.5, rx: 3.5 + r(3), ry: 2.8 });
  }
  lobed(c, lobes, base, 0.1, variant + 31);
  return { w, h, c };
}

function bush(
  ground: GroundTerrain,
  variant: number,
): { w: number; h: number; c: Canvas } {
  const r = (k: number): number => hash4(variant, k, 5, 0x6b3) / 0x1_0000_0000;
  const w = 34;
  const h = 28;
  const c = new Canvas(w, h);
  shadow(c, w / 2 + 1.5, h - 4.5, 13, 3.5);
  const lobes: Lobe[] = [];
  const count = 5 + Math.floor(r(0) * 3);
  for (let k = 0; k < count; k += 1) {
    const rr = 4.2 + r(k + 1) * 2.6;
    // A dome: back lobes high, front lobes low and wide apart.
    const a = (k / count) * Math.PI * 2 + r(k + 11) * 0.6;
    lobes.push({
      x: w / 2 + Math.cos(a) * 7.5,
      y: h - 12 + Math.sin(a) * 3.6,
      rx: rr,
      ry: rr * 0.9,
    });
  }
  lobes.push({ x: w / 2 + (r(31) - 0.5) * 4, y: h - 17, rx: 6, ry: 5.2 });
  const base = scale(PALETTE[ground].bush, 0.9 + r(30) * 0.2);
  lobed(c, lobes, base, 0.24, variant + 77);
  // Berries or blossoms on some bushes.
  if (r(40) < 0.45) {
    const petal = PALETTE[ground].petals[variant % 3] ?? [250, 250, 250];
    for (let k = 0; k < 5; k += 1) {
      const x = Math.floor(w / 2 - 9 + r(41 + k) * 18);
      const y = Math.floor(h - 21 + r(51 + k) * 10);
      if (c.alpha(x, y) === 255 && c.alpha(x + 1, y) === 255) {
        c.set(x, y, petal);
        c.set(x + 1, y, scale(petal, 0.8));
      }
    }
  }
  return { w, h, c };
}

function flowers(
  ground: GroundTerrain,
  variant: number,
): { w: number; h: number; c: Canvas } {
  const r = (k: number): number => hash4(variant, k, 9, 0x7f1) / 0x1_0000_0000;
  const w = 22;
  const h = 14;
  const c = new Canvas(w, h);
  const { petals, bush } = PALETTE[ground];
  const petal = petals[variant % petals.length] ?? [250, 250, 250];
  const leaf = scale(bush, 0.85);
  const count = 5 + Math.floor(r(0) * 4);
  for (let k = 0; k < count; k += 1) {
    const x = 2 + Math.floor(r(k + 1) * (w - 5));
    const y = 3 + Math.floor(r(k + 21) * (h - 6));
    c.set(x, y + 1, leaf);
    c.set(x + 1, y + 2, scale(leaf, 0.8));
    c.set(x, y, petal);
    c.set(x + 1, y, scale(petal, 0.85));
    c.set(x, y - 1, scale(petal, 1.1));
    if (r(k + 41) < 0.5) c.set(x + 1, y - 1, [250, 220, 90]);
  }
  return { w, h, c };
}

function bones(variant: number): { w: number; h: number; c: Canvas } {
  const r = (k: number): number => hash4(variant, k, 13, 0x8d5) / 0x1_0000_0000;
  const w = 20;
  const h = 14;
  const c = new Canvas(w, h);
  const bone: Rgb = [236, 228, 206];
  const shade: Rgb = [178, 168, 146];
  const count = 1 + Math.floor(r(0) * 2);
  for (let k = 0; k < count; k += 1) {
    const x0 = 3 + r(k + 1) * 4;
    const y0 = 4 + r(k + 2) * 6;
    const len = 8 + r(k + 3) * 5;
    const slope = (r(k + 4) - 0.5) * 0.8;
    for (let t = 0; t <= len; t += 1) {
      const x = Math.round(x0 + t);
      const y = Math.round(y0 + t * slope);
      c.set(x, y + 1, OUTLINE);
      c.set(x, y - 1, OUTLINE);
      c.set(x, y, bone);
    }
    for (const end of [0, len]) {
      const x = Math.round(x0 + end);
      const y = Math.round(y0 + end * slope);
      for (const [dx, dy] of [
        [0, -1],
        [0, 1],
        [end === 0 ? -1 : 1, -1],
        [end === 0 ? -1 : 1, 1],
      ] as const)
        c.set(x + dx, y + dy, dy > 0 ? shade : bone);
      c.set(x + (end === 0 ? -2 : 2), y - 1, OUTLINE);
      c.set(x + (end === 0 ? -2 : 2), y + 1, OUTLINE);
      c.set(x, y - 2, OUTLINE);
      c.set(x, y + 2, OUTLINE);
    }
  }
  return { w, h, c };
}

function puddle(
  ground: GroundTerrain,
  variant: number,
): { w: number; h: number; c: Canvas } {
  const r = (k: number): number => hash4(variant, k, 17, 0x9e7) / 0x1_0000_0000;
  const w = 28;
  const h = 12;
  const c = new Canvas(w, h);
  const water = PALETTE[ground].water;
  const rim = scale(water, 0.6);
  const lit = scale(water, 1.35);
  const lobes = [
    { x: w / 2 - 3, y: h / 2, rx: 8 + r(0) * 3, ry: 3.4 + r(1) },
    { x: w / 2 + 4, y: h / 2 + 0.5, rx: 6 + r(2) * 3, ry: 3 + r(3) },
  ];
  const inside = (x: number, y: number): boolean =>
    lobes.some(
      (l) => ((x + 0.5 - l.x) / l.rx) ** 2 + ((y + 0.5 - l.y) / l.ry) ** 2 < 1,
    );
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      if (!inside(x, y)) continue;
      const edge = !inside(x, y - 1) || !inside(x, y + 1) || !inside(x - 1, y);
      c.set(x, y, edge ? rim : water, 230);
    }
  // A glint.
  const gx = Math.floor(w / 2 - 4 + r(5) * 6);
  const gy = Math.floor(h / 2 - 1);
  for (let k = 0; k < 3; k += 1)
    if (inside(gx + k, gy) && inside(gx + k, gy - 1)) c.set(gx + k, gy, lit);
  return { w, h, c };
}

function crack(
  ground: GroundTerrain,
  variant: number,
): { w: number; h: number; c: Canvas } {
  const r = (k: number): number => hash4(variant, k, 19, 0xa31) / 0x1_0000_0000;
  const w = 26;
  const h = 16;
  const c = new Canvas(w, h);
  const dark = scale(PALETTE[ground].rock, 0.38);
  const lip = scale(PALETTE[ground].rock, 1.1);
  const walk = (
    x: number,
    y: number,
    dx: number,
    steps: number,
    salt: number,
  ) => {
    let cx = x;
    let cy = y;
    for (let k = 0; k < steps; k += 1) {
      c.set(Math.round(cx), Math.round(cy), dark, 200);
      c.set(Math.round(cx), Math.round(cy) + 1, lip, 110);
      cx += dx;
      cy += (r(salt + k) - 0.5) * 1.8;
      cy = Math.max(1, Math.min(h - 2, cy));
    }
  };
  walk(2, h / 2, 1, w - 4, 1);
  walk(8 + r(60) * 6, h / 2, 0.6, 7, 70);
  if (r(80) < 0.6) walk(14 + r(61) * 6, h / 2, 0.7, 6, 90);
  return { w, h, c };
}

const cache = new Map<string, DoodadArt>();

/** The key of a code-drawn doodad image. */
export function doodadArtKey(
  kind: DoodadArtKind,
  ground: GroundTerrain,
  variant: number,
): string {
  return `code:doodad-${kind}-${ground}-${variant}`;
}

/** The code-drawn doodad image of a kind, ground and variant (cached). */
export function doodadArt(
  kind: DoodadArtKind,
  ground: GroundTerrain,
  variant: number,
): DoodadArt {
  const key = doodadArtKey(kind, ground, variant);
  const found = cache.get(key);
  if (found !== undefined) return found;
  const v = variant + 1;
  const drawn =
    kind === "rock"
      ? rock(ground, v, false)
      : kind === "boulder"
        ? rock(ground, v, true)
        : kind === "bush"
          ? bush(ground, v)
          : kind === "flowers"
            ? flowers(ground, v)
            : kind === "bones"
              ? bones(v)
              : kind === "puddle"
                ? puddle(ground, v)
                : crack(ground, v);
  const art = { key, w: drawn.w, h: drawn.h, data: drawn.c.data };
  cache.set(key, art);
  return art;
}
