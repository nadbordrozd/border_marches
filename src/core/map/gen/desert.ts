/**
 * The desert's sites (bead border_marches-bzc.88): what the object stage
 * (gen/objects.ts) places in the desert zones that gen/terrain.ts
 * placeDesert made. Their catalogue weight is 0, so the ordinary fill never
 * draws them; a map without a desert gets none of them and is unchanged.
 *
 * Per desert zone: one Sphinx, one Sun Temple, one Sunken Tomb and one Oasis
 * (the oasis is a common site elsewhere; the desert always holds one); on a
 * large map the first desert also gets a second Sunken Tomb. The Pyramid,
 * the great guarded treasure, is one to a map, in the deepest desert zone,
 * placed first (before the fill crowds the zone) with one try at half the
 * distance from the starts, like the Keepers' Vault.
 */
import type { ObjectTypeId } from "../../../data/objectTypes.ts";
import type { GenState } from "./state.ts";

/** One desert site to place. */
export interface DesertSite {
  readonly type: ObjectTypeId;
  /** The zones it may go into (the desert zone first). */
  readonly zones: readonly number[];
  /** Zone tier for its contents (1 next to a start, deeper is richer). */
  readonly tier: number;
  /** Placed before everything else, with a relaxed retry (the Pyramid). */
  readonly first: boolean;
}

/** The desert zones of a map: wild zones whose main terrain is sand. */
export function desertZones(st: GenState): number[] {
  return st.zones.filter((z) => z.main === "sand").map((z) => z.id);
}

/** The desert sites of a map, in placing order (empty: no desert). */
export function desertSites(st: GenState): DesertSite[] {
  const zones = desertZones(st)
    .map((id) => st.zones[id])
    .filter((z) => z !== undefined)
    .sort((a, b) => b.tier - a.tier || a.id - b.id);
  const out: DesertSite[] = [];
  const deepest = zones[0];
  if (deepest === undefined) return out;
  const tierOf = (t: number): number => Math.max(1, Math.min(3, t));
  out.push({
    type: "pyramid",
    zones: [deepest.id],
    tier: 3,
    first: true,
  });
  zones.forEach((z, k) => {
    const tier = tierOf(z.tier);
    for (const type of [
      "sphinx",
      "sun-temple",
      "sunken-tomb",
      "oasis",
    ] as const) {
      out.push({ type, zones: [z.id], tier, first: false });
    }
    if (k === 0 && st.size === "L") {
      out.push({ type: "sunken-tomb", zones: [z.id], tier, first: false });
    }
  });
  return out;
}
