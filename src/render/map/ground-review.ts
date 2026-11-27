/**
 * Review-only switches for the adventure map's ground and trees (bead
 * bzc.144): a debug variant picked by the URL, off by default, so the user
 * can compare ground styles and tree sizes in real game screenshots
 * (tools/ground-review.mjs builds the pack). Without `?groundReview=` and
 * `?treeScale=` in the URL nothing here changes how the map is drawn.
 *
 *   ?groundReview=G0   the pre-bzc.138 painter: the Pulp Wars spill, no
 *                      drift, rim or trodden patches, each texture at its own
 *                      size (the pack serves the old texture files) and the
 *                      steppe calmed at load as it was
 *   ?groundReview=G1   the current ground (the same as no switch)
 *   ?groundReview=G2   calmer: half the colour drift, half the texture contrast
 *   ?groundReview=G3   no trodden patches
 *   ?groundReview=G4   softer borders: half the brush reach, no dark line
 *   ?groundReview=G5   current textures with the old smooth spill borders
 *   ?groundReview=G6   G2 and G4 together (calmer, softer borders)
 *   ?treeScale=1.25    trees drawn 1.25x (nearest neighbour), feet kept
 *
 * A leaf module (types only from ground.ts) so the painter can read it.
 */
import type { PixelImage } from "./ground";

export interface GroundReview {
  /** Variant name, for labels. */
  readonly name: string;
  /** The pre-bzc.138 painter (Pulp Wars spill, no drift, rim or patches). */
  readonly legacy: boolean;
  /** Borders by the old smooth spill instead of the brush cut. */
  readonly spill: boolean;
  /** Share of the colour drift kept (1: as drawn). */
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

/** No review: everything as the game draws it. */
export const NO_REVIEW: GroundReview = {
  name: "G1",
  legacy: false,
  spill: false,
  drift: 1,
  contrast: 1,
  patches: true,
  edgeAmp: 1,
  edgeLine: true,
  treeScale: 1,
};

/** The ground variants by name (see the module comment). */
export const GROUND_REVIEW_VARIANTS: Readonly<
  Record<string, Omit<GroundReview, "treeScale">>
> = {
  G0: {
    ...NO_REVIEW,
    name: "G0",
    legacy: true,
    spill: true,
    drift: 0,
    patches: false,
    edgeLine: false,
  },
  G1: NO_REVIEW,
  G2: { ...NO_REVIEW, name: "G2", drift: 0.5, contrast: 0.5 },
  G3: { ...NO_REVIEW, name: "G3", patches: false },
  G4: { ...NO_REVIEW, name: "G4", edgeAmp: 0.5, edgeLine: false },
  G5: { ...NO_REVIEW, name: "G5", spill: true, edgeLine: false },
  G6: {
    ...NO_REVIEW,
    name: "G6",
    drift: 0.5,
    contrast: 0.5,
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
  const scale = Number(params.get("treeScale") ?? "1");
  const treeScale =
    Number.isFinite(scale) && scale >= 0.5 && scale <= 3 ? scale : 1;
  if (variant === undefined && treeScale === 1) return NO_REVIEW;
  return { ...(variant ?? NO_REVIEW), treeScale };
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
 * `share` (G2): still tileable, the same mean colour. Pure.
 */
export function scaleContrast(image: PixelImage, share: number): PixelImage {
  const { width, height, data } = image;
  const n = width * height;
  const mean = [0, 0, 0];
  for (let p = 0; p < n; p += 1)
    for (let c = 0; c < 3; c += 1)
      mean[c] = (mean[c] ?? 0) + (data[p * 4 + c] ?? 0) / n;
  const out = new Uint8ClampedArray(data.length);
  for (let p = 0; p < n; p += 1) {
    for (let c = 0; c < 3; c += 1) {
      const m = mean[c] ?? 0;
      out[p * 4 + c] = m + ((data[p * 4 + c] ?? 0) - m) * share;
    }
    out[p * 4 + 3] = data[p * 4 + 3] ?? 255;
  }
  return { width, height, data: out };
}

/** RGB multipliers moved toward 1 by `share` (the drift at half strength). */
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
