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
};

/** A toned copy of a peak image of `terrain`'s family. */
export function tonePeak(
  image: CanvasImageSource,
  w: number,
  h: number,
  terrain: GroundTerrain,
): Surface {
  const surface = createSurface(w, h);
  const ctx = context2d(surface);
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  const line = PEAK_LINE[terrain];
  for (let o = 0; o < px.length; o += 4) {
    if ((px[o + 3] ?? 0) === 0) continue;
    const r = px[o] ?? 0;
    const g = px[o + 1] ?? 0;
    const b = px[o + 2] ?? 0;
    const grey = 0.3 * r + 0.59 * g + 0.11 * b;
    if (grey < PEAK_TONE.outlineGrey) {
      px[o] = line[0];
      px[o + 1] = line[1];
      px[o + 2] = line[2];
      continue;
    }
    const tone = (c: number, d: number): number => {
      const flat = c + (grey - c) * PEAK_TONE.desaturate;
      return flat + (d - flat) * PEAK_DARKEN[terrain];
    };
    px[o] = tone(r, line[0]);
    px[o + 1] = tone(g, line[1]);
    px[o + 2] = tone(b, line[2]);
  }
  ctx.putImageData(data, 0, 0);
  return surface;
}
