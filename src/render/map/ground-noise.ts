/**
 * Smooth noise and ordered dithering for the ground (bead bzc.138): value
 * noise over the coordinate hash, a few octaves of it, and a 4 x 4 Bayer
 * threshold so that a soft field is cut into a few flat palettes with a
 * single-pixel dithered edge, never a gradient (ART_DIRECTION: no blur).
 * Everything is a pure function of world coordinates.
 */
import { hash4 } from "./hash";

const unit = (x: number, y: number, salt: number): number =>
  hash4(x, y, salt, 0x6c1b) / 4294967296;

/** Value noise with a lattice of `spacing` px, smoothstep between nodes, in [0, 1). */
export function valueNoise(
  wx: number,
  wy: number,
  spacing: number,
  salt: number,
): number {
  const fx = wx / spacing;
  const fy = wy / spacing;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const ux = tx * tx * (3 - 2 * tx);
  const uy = ty * ty * (3 - 2 * ty);
  const top = unit(x0, y0, salt) * (1 - ux) + unit(x0 + 1, y0, salt) * ux;
  const bottom =
    unit(x0, y0 + 1, salt) * (1 - ux) + unit(x0 + 1, y0 + 1, salt) * ux;
  return top * (1 - uy) + bottom * uy;
}

/** `octaves` of value noise, each half as strong and 2.1 times finer. */
export function fbm(
  wx: number,
  wy: number,
  spacing: number,
  salt: number,
  octaves: number,
): number {
  let sum = 0;
  let norm = 0;
  let amp = 1;
  let sp = spacing;
  for (let k = 0; k < octaves; k += 1) {
    sum += amp * valueNoise(wx, wy, sp, salt + 31 * k);
    norm += amp;
    amp *= 0.5;
    sp /= 2.1;
  }
  return sum / norm;
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(
  (v) => (v + 0.5) / 16 - 0.5,
);

/** The 4 x 4 ordered-dither threshold at world pixel (wx, wy), in (-0.5, 0.5). */
export function bayer(wx: number, wy: number): number {
  return BAYER4[(wy & 3) * 4 + (wx & 3)] ?? 0;
}

/**
 * The colour drift's smooth field (bead bzc.127 experiment A): two scales,
 * about six cells and about 1.4 cells, rotated and warped so no contour runs
 * along the noise lattice. Near 0.5 on average, roughly 0.2 to 0.8.
 */
export function driftField(wx: number, wy: number): number {
  const salt = 300;
  const wx2 = wx + 60 * (valueNoise(wx, wy, 90, salt + 21) - 0.5);
  const wy2 = wy + 60 * (valueNoise(wx, wy, 90, salt + 22) - 0.5);
  const rx = 0.83 * wx2 - 0.56 * wy2;
  const ry = 0.56 * wx2 + 0.83 * wy2;
  return (
    0.6 * fbm(rx, ry, 470, salt, 3) + 0.4 * fbm(wy2, -wx2, 110, salt + 9, 2)
  );
}

/** Grid step (px) at which paintGround samples the drift field. */
export const DRIFT_STEP = 8;

/**
 * The drift field sampled every DRIFT_STEP world px over a rectangle (the
 * nodes at world multiples of the step, so every chunk reads the same
 * values), for bilinear reads by {@link driftAt}.
 */
export interface DriftGrid {
  readonly gx0: number;
  readonly gy0: number;
  readonly cols: number;
  readonly values: Float32Array;
}

export function driftGrid(
  x0: number,
  y0: number,
  w: number,
  h: number,
): DriftGrid {
  const gx0 = Math.floor(x0 / DRIFT_STEP);
  const gy0 = Math.floor(y0 / DRIFT_STEP);
  const gx1 = Math.floor((x0 + w - 1) / DRIFT_STEP) + 1;
  const gy1 = Math.floor((y0 + h - 1) / DRIFT_STEP) + 1;
  const cols = gx1 - gx0 + 1;
  const rows = gy1 - gy0 + 1;
  const values = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j += 1)
    for (let i = 0; i < cols; i += 1)
      values[j * cols + i] = driftField(
        (gx0 + i) * DRIFT_STEP,
        (gy0 + j) * DRIFT_STEP,
      );
  return { gx0, gy0, cols, values };
}

/** The drift field at world pixel (wx, wy), read bilinearly from the grid. */
export function driftAt(grid: DriftGrid, wx: number, wy: number): number {
  const fx = wx / DRIFT_STEP - grid.gx0;
  const fy = wy / DRIFT_STEP - grid.gy0;
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const tx = fx - i;
  const ty = fy - j;
  const o = j * grid.cols + i;
  const v = grid.values;
  const top = (v[o] ?? 0) * (1 - tx) + (v[o + 1] ?? 0) * tx;
  const bottom =
    (v[o + grid.cols] ?? 0) * (1 - tx) + (v[o + grid.cols + 1] ?? 0) * tx;
  return top * (1 - ty) + bottom * ty;
}
