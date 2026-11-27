/**
 * The tone of the mountains (bead xaj.30): like trees, peaks are calmer than
 * units (the hierarchy rule), so the map draws a copy with its colour pulled
 * toward grey. Their black outline becomes a dark tone of the family's rock
 * ("terrain pieces: inner outlines softened", ART_DIRECTION.md): the lines
 * between overlapping peaks then sit back and a range reads as one mass.
 */
import type { GroundTerrain } from "../../assets/manifest";
import { context2d, createSurface } from "./assets";
import type { Surface } from "./assets";
import { PEAK_UNDER } from "./peaks";
import type { PeakTier } from "./peaks";

export const PEAK_TONE = {
  /** Share of the way to the pixel's own grey. */
  desaturate: 0.18,
  /** Below this grey a pixel is outline. */
  outlineGrey: 40,
} as const;

/**
 * Share of the way to the family's line colour. The pale jungle limestone
 * goes furthest: bright rock in a crowd reads as speckled rubble.
 */
export const PEAK_DARKEN: Readonly<Record<GroundTerrain, number>> = {
  grass: 0.06,
  jungle: 0.26,
  steppe: 0.06,
  badlands: 0.06,
  wasteland: 0.06,
  volcanic: 0.06,
  snow: 0.06,
  sand: 0.14,
  frosting: 0.12,
  swamp: 0.08,
};

/** The outline colour of each family. */
export const PEAK_LINE: Readonly<
  Record<GroundTerrain, readonly [number, number, number]>
> = {
  grass: [30, 58, 40],
  jungle: [48, 60, 44],
  steppe: [78, 58, 34],
  badlands: [84, 40, 24],
  wasteland: [34, 30, 38],
  volcanic: [34, 30, 38],
  snow: [44, 52, 66],
  sand: [92, 62, 32],
  frosting: [96, 34, 66],
  swamp: [36, 40, 26],
};

/**
 * The massifs (bead xaj.32) are painted with their lower slopes in their
 * own ground's colours: they keep more of their colour (a lighter tone), and
 * the outline along the lower part of their silhouette is replaced by the
 * slope beside it, so the foot runs into the ground without a line, as the
 * Heroes II mountains do.
 */
export const MASSIF_TONE = {
  /** Share of the way to the pixel's own grey. */
  desaturate: 0.08,
  /** Share of the image's height, from the foot, whose outline goes. */
  footShare: 0.45,
  /**
   * Share of the way from the family's line colour to its slope shadow
   * (PEAK_UNDER): where massifs overlap, the lines between them sit back
   * and the range reads as one body.
   */
  lineSoften: 0.4,
} as const;

/**
 * The grass family's older tiers were drawn in a deep forest green, darker
 * than the meadow; beside the massifs, whose slopes are the meadow's own
 * green, they read as dark patches. Their green pixels are brightened and
 * pulled toward the meadow's hue, keeping each pixel's shading.
 */
export const GREEN_LIFT: Partial<
  Record<
    GroundTerrain,
    {
      readonly gain: number;
      readonly share: number;
      readonly hue: readonly [number, number, number];
    }
  >
> = {
  grass: { gain: 1.32, share: 0.45, hue: [139, 185, 94] },
};

/** A toned copy of a peak image of `terrain`'s family. */
export function tonePeak(
  image: CanvasImageSource,
  w: number,
  h: number,
  terrain: GroundTerrain,
  tier: PeakTier = "peak",
): Surface {
  const surface = createSurface(w, h);
  const ctx = context2d(surface);
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  toneRgba(data.data, w, h, terrain, tier);
  ctx.putImageData(data, 0, 0);
  return surface;
}

/** {@link tonePeak} on raw RGBA pixels, in place. */
export function toneRgba(
  px: Uint8ClampedArray,
  w: number,
  h: number,
  terrain: GroundTerrain,
  tier: PeakTier,
): void {
  const massif = tier === "massif";
  if (massif) openFoot(px, w, h);
  const dark = PEAK_LINE[terrain];
  const under = PEAK_UNDER[terrain];
  const soft = massif ? MASSIF_TONE.lineSoften : 0;
  const line = [0, 1, 2].map(
    (c) => (dark[c] ?? 0) + ((under[c] ?? 0) - (dark[c] ?? 0)) * soft,
  ) as [number, number, number];
  const desaturate = massif ? MASSIF_TONE.desaturate : PEAK_TONE.desaturate;
  const darken = massif ? 0 : PEAK_DARKEN[terrain];
  const lift = massif ? undefined : GREEN_LIFT[terrain];
  const hueGrey =
    lift === undefined
      ? 1
      : 0.3 * lift.hue[0] + 0.59 * lift.hue[1] + 0.11 * lift.hue[2];
  for (let o = 0; o < px.length; o += 4) {
    if ((px[o + 3] ?? 0) === 0) continue;
    let r = px[o] ?? 0;
    let g = px[o + 1] ?? 0;
    let b = px[o + 2] ?? 0;
    let grey = 0.3 * r + 0.59 * g + 0.11 * b;
    if (
      lift !== undefined &&
      grey >= PEAK_TONE.outlineGrey &&
      g > r + 8 &&
      g > b + 8
    ) {
      const lit = Math.min(255, grey * lift.gain);
      const k = lit / hueGrey;
      r = Math.min(255, r * lift.gain);
      g = Math.min(255, g * lift.gain);
      b = Math.min(255, b * lift.gain);
      r += (lift.hue[0] * k - r) * lift.share;
      g += (lift.hue[1] * k - g) * lift.share;
      b += (lift.hue[2] * k - b) * lift.share;
      grey = 0.3 * r + 0.59 * g + 0.11 * b;
    }
    if (grey < PEAK_TONE.outlineGrey) {
      px[o] = line[0];
      px[o + 1] = line[1];
      px[o + 2] = line[2];
      continue;
    }
    const tone = (c: number, d: number): number => {
      const flat = c + (grey - c) * desaturate;
      return flat + (d - flat) * darken;
    };
    px[o] = tone(r, line[0]);
    px[o + 1] = tone(g, line[1]);
    px[o + 2] = tone(b, line[2]);
  }
}

/**
 * Removes the outline from the lower part of a silhouette: every dark
 * pixel there that touches the transparent outside takes the colour of the
 * nearest light pixel inside it (above, then up and to either side). Two
 * passes, so a 2 px line goes too.
 */
function openFoot(px: Uint8ClampedArray, w: number, h: number): void {
  const top = Math.floor(h * (1 - MASSIF_TONE.footShare));
  const alpha = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : (px[(y * w + x) * 4 + 3] ?? 0);
  const grey = (o: number): number =>
    0.3 * (px[o] ?? 0) + 0.59 * (px[o + 1] ?? 0) + 0.11 * (px[o + 2] ?? 0);
  const edge = new Uint8Array(w * h);
  for (let pass = 0; pass < 2; pass += 1) {
    const fixes: [number, number][] = [];
    for (let y = top; y < h; y += 1)
      for (let x = 0; x < w; x += 1) {
        const o = (y * w + x) * 4;
        if (alpha(x, y) === 0 || grey(o) >= PEAK_TONE.outlineGrey) continue;
        const outside =
          alpha(x - 1, y) === 0 ||
          alpha(x + 1, y) === 0 ||
          alpha(x, y + 1) === 0 ||
          y === h - 1 ||
          edge[y * w + x - 1] === 1 ||
          edge[y * w + x + 1] === 1 ||
          (y + 1 < h && edge[(y + 1) * w + x] === 1);
        if (!outside) continue;
        for (const [dx, dy] of [
          [0, -1],
          [-1, -1],
          [1, -1],
          [-1, 0],
          [1, 0],
          [0, -2],
        ] as const) {
          const sx = x + dx;
          const sy = y + dy;
          if (alpha(sx, sy) === 0) continue;
          const so = (sy * w + sx) * 4;
          if (grey(so) < PEAK_TONE.outlineGrey) continue;
          fixes.push([o, so]);
          break;
        }
      }
    for (const [o, so] of fixes) {
      px[o] = px[so] ?? 0;
      px[o + 1] = px[so + 1] ?? 0;
      px[o + 2] = px[so + 2] ?? 0;
      edge[o / 4] = 1;
    }
  }
}
