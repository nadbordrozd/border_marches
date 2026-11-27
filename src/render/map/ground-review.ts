/**
 * Review-only switches for the adventure map's ground and trees (bead
 * bzc.144): a debug variant picked by the URL, off by default, so the user
 * can compare ground styles and tree sizes in real game screenshots
 * (tools/ground-review.mjs builds the pack). Without `?groundReview=`,
 * `?groundIntensity=` and `?treeScale=` in the URL the map is drawn as the
 * game draws it, at GROUND_INTENSITY (ground-intensity.ts).
 *
 *   ?groundReview=G0   the pre-bzc.138 painter: the Pulp Wars spill, no
 *                      drift, rim or trodden patches, each texture at its own
 *                      size (the pack serves the old texture files) and the
 *                      steppe calmed at load as it was
 *   ?groundReview=G1   the bzc.138 ground at full strength (intensity 1)
 *   ?groundReview=G2   calmer: half the colour drift, half the texture
 *                      contrast (intensity 0)
 *   ?groundReview=G3   G1 without trodden patches
 *   ?groundReview=G4   G1 with softer borders: half the brush reach, no
 *                      dark line
 *   ?groundReview=G5   G1's textures with the old smooth spill borders
 *   ?groundReview=G6   G2 and G4 together (calmer, softer borders)
 *   ?groundIntensity=0.25
 *                      the ground intensity knob for this page load (bead
 *                      bzc.164, -1..2; 0 is G2, 1 is G1); it overrides a
 *                      variant's intensity, so G4&groundIntensity=0.5 works
 *   ?treeScale=1.25    trees drawn 1.25x (nearest neighbour), feet kept
 *
 * A leaf module (types only from ground.ts) so the painter can read it.
 */
import type { PixelImage } from "./ground";
import {
  GROUND_INTENSITY,
  groundShares,
  parseGroundIntensity,
} from "./ground-intensity";

export interface GroundReview {
  /** Variant name, for labels. */
  readonly name: string;
  /** The pre-bzc.138 painter (Pulp Wars spill, no drift, rim or patches). */
  readonly legacy: boolean;
  /** Borders by the old smooth spill instead of the brush cut. */
  readonly spill: boolean;
  /** The ground intensity (ground-intensity.ts) `drift` and `contrast` come from. */
  readonly intensity: number;
  /** Share of the colour drift kept (1: as drawn at G1). */
  readonly drift: number;
  /** Share of each texture's contrast round its mean colour kept (1: as baked). */
  readonly contrast: number;
  /** Trodden patches under buildings. */
  readonly patches: boolean;
  /** Share of the brush reach kept (1: EDGE.amp). */
  readonly edgeAmp: number;
  /** The 1 px dark line under a border cut. */
  readonly edgeLine: boolean;
  /** Tree sprites drawn this many times larger (1: as made). */
  readonly treeScale: number;
}

/** An intensity and the drift and contrast shares it gives. */
const atIntensity = (
  intensity: number,
): Pick<GroundReview, "intensity" | "drift" | "contrast"> => ({
  intensity,
  ...groundShares(intensity),
});

/** No review: everything as the game draws it (at GROUND_INTENSITY). */
export const NO_REVIEW: GroundReview = {
  name: "default",
  legacy: false,
  spill: false,
  ...atIntensity(GROUND_INTENSITY),
  patches: true,
  edgeAmp: 1,
  edgeLine: true,
  treeScale: 1,
};

/** G1: the bzc.138 ground at full strength (intensity 1). */
const G1: Omit<GroundReview, "treeScale"> = {
  ...NO_REVIEW,
  name: "G1",
  ...atIntensity(1),
};

/** The ground variants by name (see the module comment). */
export const GROUND_REVIEW_VARIANTS: Readonly<
  Record<string, Omit<GroundReview, "treeScale">>
> = {
  G0: {
    ...G1,
    name: "G0",
    legacy: true,
    spill: true,
    drift: 0,
    patches: false,
    edgeLine: false,
  },
  G1,
  G2: { ...G1, name: "G2", ...atIntensity(0) },
  G3: { ...G1, name: "G3", patches: false },
  G4: { ...G1, name: "G4", edgeAmp: 0.5, edgeLine: false },
  G5: { ...G1, name: "G5", spill: true, edgeLine: false },
  G6: {
    ...G1,
    name: "G6",
    ...atIntensity(0),
    edgeAmp: 0.5,
    edgeLine: false,
  },
};

/** The review a query string asks for, or NO_REVIEW. Pure. */
export function parseGroundReview(search: string): GroundReview {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return NO_REVIEW;
  }
  const variant = GROUND_REVIEW_VARIANTS[params.get("groundReview") ?? ""];
  const intensity = parseGroundIntensity(params);
  const scale = Number(params.get("treeScale") ?? "1");
  const treeScale =
    Number.isFinite(scale) && scale >= 0.5 && scale <= 3 ? scale : 1;
  if (variant === undefined && intensity === undefined && treeScale === 1)
    return NO_REVIEW;
  const base = variant ?? NO_REVIEW;
  // The URL's intensity wins over the variant's (G0 has no drift to scale).
  const tuned =
    intensity === undefined || base.legacy
      ? base
      : {
          ...base,
          name: `${base.name}@${intensity}`,
          ...atIntensity(intensity),
        };
  return { ...tuned, treeScale };
}

let current: GroundReview | null = null;

/** This page load's review (NO_REVIEW outside a browser or without the URL switch). */
export function groundReview(): GroundReview {
  if (current === null) {
    let search: string;
    try {
      search = typeof location === "undefined" ? "" : location.search;
    } catch {
      search = "";
    }
    current = parseGroundReview(search);
  }
  return current;
}

/** Sets the review (tests). */
export function setGroundReview(review: GroundReview): void {
  current = review;
}

/**
 * A copy of a texture with its contrast round its mean colour scaled by
 * `share` (the ground intensity's contrast): still tileable, the same mean colour. Pure.
 */
export function scaleContrast(image: PixelImage, share: number): PixelImage {
  const { width, height, data } = image;
  const n = width * height;
  // Runs on every load at the default intensity (bead bzc.164), so one pass
  // for the means and one through a 3 x 256 table (ten 960 px grounds in a
  // few tens of ms).
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < n * 4; i += 4) {
    r += data[i] ?? 0;
    g += data[i + 1] ?? 0;
    b += data[i + 2] ?? 0;
  }
  const lut = new Uint8ClampedArray(768);
  const means = [r / n, g / n, b / n];
  for (let c = 0; c < 3; c += 1) {
    const m = means[c] ?? 0;
    for (let v = 0; v < 256; v += 1) lut[c * 256 + v] = m + (v - m) * share;
  }
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < n * 4; i += 4) {
    out[i] = lut[data[i] ?? 0] ?? 0;
    out[i + 1] = lut[256 + (data[i + 1] ?? 0)] ?? 0;
    out[i + 2] = lut[512 + (data[i + 2] ?? 0)] ?? 0;
    out[i + 3] = data[i + 3] ?? 255;
  }
  return { width, height, data: out };
}

/** RGB multipliers moved toward 1 by `share` (the ground intensity's drift). */
export function scaleTint(
  k: readonly [number, number, number],
  share: number,
): readonly [number, number, number] {
  return [
    1 + (k[0] - 1) * share,
    1 + (k[1] - 1) * share,
    1 + (k[2] - 1) * share,
  ];
}
