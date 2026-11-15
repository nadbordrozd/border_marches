/**
 * URL query router stub. Later beads hook their screens into {@link VIEWS}.
 *
 *   ?view=map&seed=123   adventure map preview (generator / renderer work)
 *   ?view=battle         battle screen preview
 *   (no view)            the game
 */

export type ViewName = "game" | "map" | "battle";

export const VIEWS: readonly ViewName[] = ["game", "map", "battle"];

export interface Route {
  view: ViewName;
  /** `seed` query parameter as a uint32, or null when absent or invalid. */
  seed: number | null;
  /** All query parameters, for view-specific options. */
  params: URLSearchParams;
}

function isView(value: string | null): value is ViewName {
  return value !== null && (VIEWS as readonly string[]).includes(value);
}

/** Parse a location search string such as "?view=map&seed=123". */
export function parseRoute(search: string): Route {
  const params = new URLSearchParams(search);
  const rawView = params.get("view");
  const view = isView(rawView) ? rawView : "game";
  const rawSeed = params.get("seed");
  let seed: number | null = null;
  if (rawSeed !== null && /^\d+$/.test(rawSeed)) {
    const n = Number(rawSeed);
    if (Number.isSafeInteger(n)) seed = n >>> 0;
  }
  return { view, seed, params };
}
