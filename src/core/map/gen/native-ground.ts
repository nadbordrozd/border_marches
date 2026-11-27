/**
 * Faction outposts on their faction's native ground (CONTENT_MAP_OBJECTS
 * 3.2): the object stage's hook (gen/objects.ts) that stands a faction's
 * outposts on its native terrain while such a site is free, in their own
 * zone or a zone of that terrain.
 *
 * One table, {@link NATIVE_GROUND}: the Candy Kingdom's outposts prefer
 * frosting (bead bzc.115) and the Deepforge's volcanic ground (bead
 * bzc.135, FACTION_DWARVES 11). A faction prefers its ground only on a map
 * with a zone of it, so a map without a candy zone keeps its Candy outposts
 * where they stood and a map without a volcanic zone its Deepforge ones.
 */
import type { Terrain } from "../types.ts";
import { T } from "./state.ts";
import type { GenState } from "./state.ts";

/** A faction's preferred ground: the zones' main terrain and its cell id. */
export interface NativeGround {
  /** The zone main terrain whose zones the outposts may go into. */
  readonly zone: Terrain;
  /** The ground the outpost's entrance prefers. */
  readonly ground: number;
}

/** The factions whose outposts prefer their native ground. */
export const NATIVE_GROUND: Readonly<Record<string, NativeGround>> = {
  candy: { zone: "frosting", ground: T.frosting },
  dwarves: { zone: "volcanic", ground: T.volcanic },
};

/** The parts of an object request {@link preferNativeGround} reads and sets. */
export interface GroundRequest {
  readonly row: { readonly type: string };
  readonly data: Readonly<Record<string, unknown>>;
  zones: readonly number[];
  readonly pocket: number;
  readonly from?: number;
  ground?: number;
}

/**
 * Faction outposts (not a start's kit or a pocket's prize) of a faction in
 * {@link NATIVE_GROUND} prefer its ground: their entrance stands on it
 * while such a site is free, in their own zone or a zone of that terrain
 * (own zone first); the last try takes any ground. A faction whose terrain
 * has no zone on this map is left alone. Returns how many requests it
 * changed.
 */
export function preferNativeGround(
  st: GenState,
  requests: readonly GroundRequest[],
): number {
  const zonesOf = new Map<string, number[]>();
  for (const [faction, g] of Object.entries(NATIVE_GROUND))
    zonesOf.set(
      faction,
      st.zones.filter((z) => z.main === g.zone).map((z) => z.id),
    );
  let changed = 0;
  for (const r of requests) {
    if (
      r.row.type !== "faction-outpost" ||
      r.pocket >= 0 ||
      r.from !== undefined
    )
      continue;
    const faction = String(r.data.faction);
    const g = NATIVE_GROUND[faction];
    const zones = zonesOf.get(faction) ?? [];
    // No zone of its ground: the outposts place exactly as before.
    if (g === undefined || zones.length === 0) continue;
    r.zones = [...new Set([...r.zones, ...zones])];
    r.ground = g.ground;
    changed++;
  }
  return changed;
}
