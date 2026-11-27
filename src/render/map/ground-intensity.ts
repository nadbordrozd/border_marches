/**
 * THE GROUND INTENSITY KNOB (bead bzc.164).
 *
 * To make the adventure map's ground calmer or richer, change
 * GROUND_INTENSITY below. It scales two things together, both at run time
 * from the baked textures (no re-bake, no art work):
 *
 *   - the colour drift's strength (ground.ts DRIFT_TINT, the darker-cooler
 *     and lighter-warmer palettes), and
 *   - each ground texture's contrast round its own mean colour (applied once
 *     when the textures load, assets.ts).
 *
 *   0    calmer: the review pack's G2 (half the drift, half the contrast)
 *   0.5  half way between them (the user's pick, 2026-11-27)
 *   1    richer: the review pack's G1 (the drift and textures as baked)
 *
 * Values outside 0..1 extrapolate on the same line (-1 is no drift and flat
 * textures, 2 is one and a half times G1); they are for experiments only.
 * Borders (brush, dark line, rim) and trodden patches do not depend on it.
 *
 * For a quick look without editing code, add `?groundIntensity=0.25` to the
 * game's URL (a debug switch: it overrides this constant for that page load,
 * see ground-review.ts).
 */
export const GROUND_INTENSITY = 0.5;

/** The range the URL switch accepts (the constant should stay inside it too). */
export const GROUND_INTENSITY_RANGE = { min: -1, max: 2 } as const;

/** Share of the drift and of the texture contrast kept at intensity 0 (G2). */
const CALM_SHARE = 0.5;

/** What an intensity does to the ground: shares of the drift and contrast kept (1: as baked). */
export interface GroundShares {
  readonly drift: number;
  readonly contrast: number;
}

/** The drift and contrast shares at `intensity` (0: G2's halves, 1: G1's wholes). Pure. */
export function groundShares(intensity: number): GroundShares {
  const share = Math.max(0, CALM_SHARE + (1 - CALM_SHARE) * intensity);
  return { drift: share, contrast: share };
}

/** The `?groundIntensity=` of a query string, or undefined when absent or out of range. Pure. */
export function parseGroundIntensity(
  params: URLSearchParams,
): number | undefined {
  const raw = params.get("groundIntensity");
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) &&
    value >= GROUND_INTENSITY_RANGE.min &&
    value <= GROUND_INTENSITY_RANGE.max
    ? value
    : undefined;
}
