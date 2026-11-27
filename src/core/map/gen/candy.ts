/**
 * The Candy Kingdom's landscape (bead border_marches-bzc.115): candy zones
 * of frosting ground, the Kingdom's native terrain.
 *
 * - {@link placeCandy}: on some maps one wild zone turns into a candy zone,
 *   the same way as the volcanic, winter and desert zones (gen/terrain.ts
 *   placeBiome), from a random stream of its own ("candy-zones") and after
 *   them, so a map that rolls no candy zone is the map it was before
 *   frosting existed. A candy zone's main terrain is frosting with grass or
 *   steppe patches (a sugar meadow); it is never a volcanic, winter or
 *   desert zone nor next to one (icing beside lava, snow or dunes reads as
 *   a mistake).
 * - {@link preferFrosting}: the object stage's hook for Candy faction
 *   outposts, which stand on their faction's native terrain
 *   (CONTENT_MAP_OBJECTS 3.2): while a frosting site is free they stand on
 *   frosting, in their own zone or a candy zone. On a map without a candy
 *   zone it changes nothing, so those maps (the named maps among them)
 *   place exactly as before.
 *
 * Its own module so the object stage (gen/objects.ts) needs one line.
 */
import { placeBiome } from "./terrain.ts";
import { T } from "./state.ts";
import type { GenState } from "./state.ts";

/** Places the candy zones (see the module comment); returns their ids. */
export function placeCandy(st: GenState): number[] {
  const avoid = st.zones
    .filter(
      (z) => z.main === "volcanic" || z.main === "snow" || z.main === "sand",
    )
    .map((z) => z.id);
  return placeBiome(st, "frosting", st.cfg.terrain.candy, avoid, "candy-zones");
}

/** The candy zones of a map: zones whose main terrain is frosting. */
export function candyZones(st: GenState): number[] {
  return st.zones.filter((z) => z.main === "frosting").map((z) => z.id);
}

/** The faction whose native terrain is frosting. */
export const FROSTING_FACTION = "candy";

/** The parts of an object request {@link preferFrosting} reads and sets. */
export interface GroundRequest {
  readonly row: { readonly type: string };
  readonly data: Readonly<Record<string, unknown>>;
  zones: readonly number[];
  readonly pocket: number;
  readonly from?: number;
  ground?: number;
}

/**
 * Candy faction outposts (not a start's kit or a pocket's prize) prefer
 * frosting: their entrance stands on frosting while such a site is free,
 * in their own zone or a candy zone (own zone first); the last try takes
 * any ground. Returns how many requests it changed.
 */
export function preferFrosting(
  st: GenState,
  requests: readonly GroundRequest[],
): number {
  let changed = 0;
  const candy = candyZones(st);
  // No candy zone, no frosting: the outposts place exactly as before (the
  // named maps, which roll no candy zone, keep their pinned fingerprints).
  if (candy.length === 0) return 0;
  for (const r of requests) {
    if (
      r.row.type !== "faction-outpost" ||
      r.data.faction !== FROSTING_FACTION ||
      r.pocket >= 0 ||
      r.from !== undefined
    )
      continue;
    r.zones = [...new Set([...r.zones, ...candy])];
    r.ground = T.frosting;
    changed++;
  }
  return changed;
}
