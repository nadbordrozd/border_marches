/**
 * Paints the cached crown bands of the forest canopy (canopy.ts): for each
 * row and band column, the parts of the row's tree crowns that rise above
 * the row's top edge, in the trees' draw order. Drawn in the foreground just
 * before the row, so the crowns cover the feet of what stands behind.
 */
import type { CanopyBand } from "./canopy";
import { context2d, createSurface } from "./assets";
import type { Surface } from "./assets";

export function paintCanopyBand(
  band: CanopyBand,
  images: ReadonlyMap<string, CanvasImageSource>,
): Surface {
  const surface = createSurface(band.w, band.h);
  const ctx = context2d(surface);
  for (const tree of band.trees) {
    const image = images.get(tree.key);
    if (image !== undefined)
      ctx.drawImage(image, tree.x - band.x, tree.y - band.y);
  }
  return surface;
}

/**
 * The tone of the woods: crowns are calmer than units and pickups (the
 * hierarchy rule), so every tree drawn on the map is a copy with its colour
 * pulled toward grey and toward the dark tone of its ground. The black
 * outline is kept, so the trees still read as chibi.
 */
export const TREE_TONE = {
  /** Share of the way to the pixel's own grey. */
  desaturate: 0.24,
  /** Share of the way to the ground's dark tone. */
  darken: 0.14,
} as const;

const GROUND_DARK: Readonly<Record<string, readonly [number, number, number]>> =
  {
    grass: [30, 62, 40],
    jungle: [18, 52, 40],
    steppe: [76, 70, 34],
    badlands: [80, 40, 26],
    wasteland: [40, 36, 34],
  };

/** A toned copy of a tree image (key "tree-<terrain>-..."). */
export function toneTree(
  image: CanvasImageSource,
  w: number,
  h: number,
  terrain: string,
): Surface {
  const surface = createSurface(w, h);
  const ctx = context2d(surface);
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  const dark = GROUND_DARK[terrain] ?? [30, 30, 30];
  for (let o = 0; o < px.length; o += 4) {
    if ((px[o + 3] ?? 0) === 0) continue;
    const r = px[o] ?? 0;
    const g = px[o + 1] ?? 0;
    const b = px[o + 2] ?? 0;
    const grey = 0.3 * r + 0.59 * g + 0.11 * b;
    if (grey < 40) continue; // the outline
    const tone = (c: number, d: number): number => {
      const flat = c + (grey - c) * TREE_TONE.desaturate;
      return flat + (d - flat) * TREE_TONE.darken;
    };
    px[o] = tone(r, dark[0]);
    px[o + 1] = tone(g, dark[1]);
    px[o + 2] = tone(b, dark[2]);
  }
  ctx.putImageData(data, 0, 0);
  return surface;
}

/** Replaces the crown bands of `images` (keys "canopy-band:...") by `bands`. */
export function installCanopyBands(
  images: Map<string, CanvasImageSource>,
  bands: readonly CanopyBand[],
): void {
  for (const key of [...images.keys()])
    if (key.startsWith("canopy-band:")) images.delete(key);
  for (const band of bands) images.set(band.key, paintCanopyBand(band, images));
}
