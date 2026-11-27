/**
 * The owner flag's pixels (bead border_marches-bzc.146): the studio sprite
 * (src/assets/owner-flag.ts) has a plain white cloth with grey folds; each
 * player's flag is that sprite with the cloth recoloured onto a ramp of the
 * player's colour, keeping the black outline, the pole, the knob and the
 * shading. Its gentle wave is code-made: the cloth's columns shift by at
 * most one pixel in a travelling sine, more towards the fly end, in
 * {@link FLAG_FRAMES} frames; under reduced motion only frame 0 is drawn.
 *
 * Pure functions over RGBA arrays, so tests run without a canvas.
 */
import type { PixelImage } from "./ground";

/** Frames of the wave. */
export const FLAG_FRAMES = 4;
/** How long each wave frame shows (ms). */
export const FLAG_FRAME_MS = 200;

type Rgb = readonly [number, number, number];

/** The cloth's grey steps in the master: its base and its fold shadow. */
const CLOTH_BASE = 241;
const CLOTH_SHADE = 181;
const CLOTH_LIGHT = 251;

function parseHex(hex: string): Rgb {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (m === null) return [128, 128, 128];
  return [
    parseInt(m[1] ?? "80", 16),
    parseInt(m[2] ?? "80", 16),
    parseInt(m[3] ?? "80", 16),
  ];
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/**
 * The cloth ramp of a player colour: the fold shadow (darker, a touch
 * cooler, like the map's one-shadow-tone rule), the colour itself and a
 * lighter highlight.
 */
export function clothRamp(hex: string): {
  shade: Rgb;
  base: Rgb;
  light: Rgb;
} {
  const base = parseHex(hex);
  const shade = mix(mix(base, [0, 0, 0], 0.38), [20, 20, 60], 0.12);
  const light = mix(base, [255, 255, 255], 0.28);
  return { shade, base, light };
}

/** Whether a pixel is cloth: a light, unsaturated grey. */
export function isCloth(r: number, g: number, b: number, a: number): boolean {
  if (a === 0) return false;
  const hi = Math.max(r, g, b);
  const lo = Math.min(r, g, b);
  return hi - lo <= 12 && lo >= 150;
}

/** A copy of the flag with its cloth recoloured to `hex`. */
export function recolourFlag(src: PixelImage, hex: string): PixelImage {
  const { shade, base, light } = clothRamp(hex);
  const data = new Uint8ClampedArray(src.data);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const a = data[i + 3] ?? 0;
    if (!isCloth(r, g, b, a)) continue;
    const v = (r + g + b) / 3;
    const c =
      v >= CLOTH_BASE
        ? mix(
            base,
            light,
            Math.min(1, (v - CLOTH_BASE) / (CLOTH_LIGHT - CLOTH_BASE)),
          )
        : mix(
            shade,
            base,
            Math.max(0, (v - CLOTH_SHADE) / (CLOTH_BASE - CLOTH_SHADE)),
          );
    data[i] = Math.round(c[0]);
    data[i + 1] = Math.round(c[1]);
    data[i + 2] = Math.round(c[2]);
  }
  return { width: src.width, height: src.height, data };
}

/**
 * Rows a cloth column moves in a frame: 0 at the pole, up to one pixel
 * towards the fly end, in a sine travelling away from the pole.
 */
export function waveShift(
  column: number,
  clothLeft: number,
  frame: number,
): number {
  const d = column - clothLeft;
  if (d <= 0) return 0;
  const reach = Math.min(1, d / 6);
  const phase = (2 * Math.PI * frame) / FLAG_FRAMES - (2 * Math.PI * d) / 14;
  return Math.round(Math.sin(phase) * reach);
}

/** Frame `frame` of the wave: the cloth's columns shifted up or down. */
export function waveFrame(
  src: PixelImage,
  clothLeft: number,
  frame: number,
): PixelImage {
  const { width, height } = src;
  const data = new Uint8ClampedArray(src.data.length);
  for (let x = 0; x < width; x += 1) {
    const dy = waveShift(x, clothLeft, frame);
    for (let y = 0; y < height; y += 1) {
      const ty = y + dy;
      if (ty < 0 || ty >= height) continue;
      const s = (y * width + x) * 4;
      const t = (ty * width + x) * 4;
      // Below the cloth the pole column never moves.
      data[t] = src.data[s] ?? 0;
      data[t + 1] = src.data[s + 1] ?? 0;
      data[t + 2] = src.data[s + 2] ?? 0;
      data[t + 3] = src.data[s + 3] ?? 0;
    }
  }
  return { width, height, data };
}
