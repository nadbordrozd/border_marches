/**
 * The swamp (bead border_marches-bzc.126): swamp zones of mud and reeds and
 * the three swamp sites that stand in them (CONTENT_MAP_OBJECTS 3.15).
 *
 * - {@link placeSwamp}: on some maps one wild zone turns into a swamp, the
 *   same way as the volcanic, winter, desert and candy zones
 *   (gen/terrain.ts placeBiome), from a random stream of its own
 *   ("swamp-zones") and after all of them, so a map that rolls no swamp is
 *   the map it was before the swamp existed. A swamp's main terrain is
 *   swamp mud with jungle or grass patches; it is never a volcanic, winter,
 *   desert or candy zone nor next to one (reeds beside lava, snow, dunes or
 *   icing read as a mistake).
 * - {@link swampSites}: what the object stage (gen/objects.ts) places in
 *   each swamp zone: a Witch's Hut, a Drowned Temple and a Hag's Cauldron.
 *   Their catalogue weight is 0, so the fill never draws them; a map
 *   without a swamp gets none of them and is unchanged.
 * - {@link swampContents}: their seeded contents (the object stage merges
 *   them over the rolled row, so gen/contents.ts needs no case of its own).
 */
import { CREATURES } from "../../../data/creatures.ts";
import {
  BANK_GUARD_SHARE,
  BANK_VALUE,
  type BankSize,
  type ObjectTypeId,
  type Prize,
} from "../../../data/objectTypes.ts";
import { SKILL_IDS, SKILLS } from "../../../data/skills.ts";
import type { CreatureId } from "../../../data/types.ts";
import type { Rng } from "../../rng.ts";
import { pickArtifact, pickSpell } from "./contents.ts";
import { placeBiome } from "./terrain.ts";
import type { GenState } from "./state.ts";

/** Places the swamp zones (see the module comment); returns their ids. */
export function placeSwamp(st: GenState): number[] {
  const avoid = st.zones
    .filter(
      (z) =>
        z.main === "volcanic" ||
        z.main === "snow" ||
        z.main === "sand" ||
        z.main === "frosting",
    )
    .map((z) => z.id);
  return placeBiome(st, "swamp", st.cfg.terrain.swamp, avoid, "swamp-zones");
}

/** The swamp zones of a map: zones whose main terrain is swamp. */
export function swampZones(st: GenState): number[] {
  return st.zones.filter((z) => z.main === "swamp").map((z) => z.id);
}

/** The swamp sites every swamp zone gets, in placing order. */
export const SWAMP_SITES = [
  "drowned-temple",
  "witchs-hut",
  "hags-cauldron",
] as const satisfies readonly ObjectTypeId[];

/** One swamp site to place. */
export interface SwampSite {
  readonly type: (typeof SWAMP_SITES)[number];
  /** The zone it goes into. */
  readonly zone: number;
  /** Zone tier for its contents (1 next to a start, deeper is richer). */
  readonly tier: number;
}

/** The swamp sites of a map, in placing order (empty: no swamp). */
export function swampSites(st: GenState): SwampSite[] {
  const out: SwampSite[] = [];
  for (const id of swampZones(st)) {
    const z = st.zones[id];
    if (z === undefined) continue;
    const tier = Math.max(1, Math.min(3, z.tier));
    for (const type of SWAMP_SITES) out.push({ type, zone: id, tier });
  }
  return out;
}

/**
 * The bog creatures of a Drowned Temple by size: shares of the guard's
 * fight value (Bog Leeches, Deep-Sea Divers, Lagoon Lurkers).
 */
const TEMPLE_GUARD: Readonly<
  Record<BankSize, ReadonlyArray<readonly [CreatureId, number]>>
> = {
  small: [
    ["bog-leech", 0.5],
    ["deep-sea-diver", 0.5],
  ],
  medium: [
    ["deep-sea-diver", 0.45],
    ["lagoon-lurker", 0.55],
  ],
  large: [
    ["bog-leech", 0.2],
    ["deep-sea-diver", 0.3],
    ["lagoon-lurker", 0.5],
  ],
};

/** A guard of about `fv` in fixed shares, each count nudged by up to 10%. */
function sharedGuard(
  rng: Rng,
  fv: number,
  shares: ReadonlyArray<readonly [CreatureId, number]>,
): Array<{ creature: CreatureId; count: number }> {
  return shares.map(([creature, share]) => {
    const each = CREATURES[creature].fightValue;
    const count = Math.max(
      1,
      Math.round(((fv * share) / each) * (1 + rng.float(-0.1, 0.1))),
    );
    return { creature, count };
  });
}

/**
 * A Drowned Temple's prize by size, worth its bank value: essence and a
 * scroll always (the temple's drowned offerings), gold, and an artifact in
 * the medium and large temples.
 */
function templePrize(rng: Rng, size: BankSize): Prize {
  const scroll = (tier: number): string[] => {
    const s = pickSpell(rng, tier);
    return s === undefined ? [] : [s];
  };
  const artifact = (grade: "trinket" | "wonder"): string[] => {
    const a = pickArtifact(rng, grade);
    return a === undefined ? [] : [a];
  };
  switch (size) {
    case "small":
      // 2 essence 1000, a tier 2 scroll 600, 900 gold: 2500.
      return { essence: 2, scrolls: scroll(2), gold: 900 };
    case "medium":
      // A Trinket 2000, 4 essence 2000, a tier 3 scroll 1000, 1500 gold.
      return {
        artifacts: artifact("trinket"),
        essence: 4,
        scrolls: scroll(3),
        gold: 1500,
      };
    default:
      // A Wonder 5000, 8 essence 4000, a tier 4 scroll 1500, 4500 gold.
      return {
        artifacts: artifact("wonder"),
        essence: 8,
        scrolls: scroll(4),
        gold: 4500,
      };
  }
}

/** The skills a witch may teach: the school skills and the others. */
function skillPools(): { school: string[]; other: string[] } {
  const school: string[] = [];
  const other: string[] = [];
  for (const id of SKILL_IDS) {
    const s = SKILLS[id];
    if (s === undefined) continue;
    (s.family === "school" ? school : other).push(id);
  }
  return { school, other };
}

/** Seeded contents of the swamp sites (bead bzc.126). */
export function swampContents(
  type: ObjectTypeId,
  rng: Rng,
  tier: number,
): Record<string, unknown> {
  switch (type) {
    case "drowned-temple": {
      // Small by the starts, medium or large deeper in (never a bank's
      // largest so close to home).
      const size: BankSize =
        tier <= 1
          ? rng.chance(0.6)
            ? "small"
            : "medium"
          : tier === 2
            ? rng.chance(0.6)
              ? "medium"
              : "large"
            : rng.chance(0.35)
              ? "medium"
              : "large";
      const value = BANK_VALUE[size];
      return {
        size,
        value,
        guard: sharedGuard(rng, value * BANK_GUARD_SHARE, TEMPLE_GUARD[size]),
        prize: templePrize(rng, size),
      };
    }
    case "witchs-hut": {
      // Two skills: a school of magic and one other, the hero's choice.
      const { school, other } = skillPools();
      const skills = [
        ...(school.length > 0 ? [rng.pick(school)] : []),
        ...(other.length > 0 ? [rng.pick(other)] : []),
      ];
      return { skills };
    }
    case "hags-cauldron":
      return {};
    default:
      return {};
  }
}
