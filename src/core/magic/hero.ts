/**
 * A thin view of the hero's magic (the hero model, bead bzc.10, owns the
 * fields: `power`, `lore`, `mana`, `pages`, `scrolls`, school skills) and
 * the adventure-layer state magic adds on top: adventure-spell day effects
 * kept in `GameState.magic`.
 *
 * Magic reads the hero only through {@link heroMagic} and writes only
 * through {@link withHeroMagic}.
 */

import type { School } from "../battle/index.ts";
import { RANK_MAX_TIER, SCHOOLS } from "../battle/index.ts";
import {
  heroStats,
  manaCostPercent,
  maxMana,
  pagePower,
  ruleSwitches,
  schoolRank,
  scrollCaseSize,
  scrollPower,
  vowRestrictions,
} from "../game/effects.ts";
import type { GameState, HeroState } from "../game/types.ts";

/** What magic needs from a hero. */
export interface HeroMagic {
  readonly power: number;
  readonly lore: number;
  readonly mana: number;
  readonly maxMana: number;
  /** Battle and adventure spells the hero knows (its pages). */
  readonly knownSpells: readonly string[];
  readonly schoolRanks: { readonly [S in School]: number };
  /** Effective Power of a page of each school (RULES_V2 2.4). */
  readonly pagePower: { readonly [S in School]: number };
  readonly scrollPower: number;
  /** The scroll case (spell ids, one per scroll). */
  readonly scrolls: readonly string[];
  readonly scrollCase: number;
  /** Mana cost percentage of pages (100 = listed cost). */
  readonly costPercent: number;
  /** Fuels per battle. */
  readonly fuelMax: number;
  /**
   * Vows (RULES_V2 3.5): schools the hero may never cast, and the highest
   * school rank a max-school-rank vow allows per school. Learning a page
   * reads both ({@link canLearn}).
   */
  readonly barred?: readonly School[];
  readonly rankCap?: { readonly [S in School]?: number };
}

/** Day effects of adventure spells (RULES_V2 2.8, CONTENT_SPELLS 4). */
export interface HeroMagicStore {
  /** Adventure spells cast today (once per day per hero). */
  castToday: string[];
  /** Green Road: the day it is active. */
  greenRoadDay?: number;
  /** Last non-forest cell the hero stood on (Green Road). */
  lastClear?: [number, number];
  /** Lily Road (NAVAL 7.1, bead bzc.154): the day it is active. */
  lilyRoadDay?: number;
  /** Saved Hour: movement to add at the next day start. */
  saved?: number;
  /** Parley: monster ids without zone of control for this hero today. */
  parley?: string[];
  /** Parley's day. */
  parleyDay?: number;
}

/** Magic on the game state (optional: older saves have none). */
export interface MagicGameState {
  heroes: Record<string, HeroMagicStore>;
  /** Dowse marks per player: cells of buried things. */
  marks?: Record<string, Array<[number, number]>>;
  /** Read the Seal results per player (last reading). */
  readings?: Record<string, string[]>;
}

/** The hero's magic as the rules see it. */
export function heroMagic(hero: HeroState): HeroMagic {
  const stats = heroStats(hero);
  const schoolRanks = {} as { [S in School]: number };
  const powers = {} as { [S in School]: number };
  for (const s of SCHOOLS) {
    schoolRanks[s] = schoolRank(hero, s);
    powers[s] = pagePower(hero, s);
  }
  return {
    power: stats.power,
    lore: stats.lore,
    mana: hero.mana,
    maxMana: maxMana(hero),
    knownSpells: hero.pages,
    schoolRanks,
    pagePower: powers,
    scrollPower: scrollPower(hero),
    scrolls: hero.scrolls,
    scrollCase: scrollCaseSize(hero),
    costPercent: Math.max(1, 100 + manaCostPercent(hero)),
    fuelMax: ruleSwitches(hero).includes("fuel-uses-plus-1") ? 2 : 1,
    ...vowMagic(hero),
  };
}

/** The vows' limits on learning pages (never-cast, max-school-rank). */
function vowMagic(hero: HeroState): Pick<HeroMagic, "barred" | "rankCap"> {
  const barred: School[] = [];
  const rankCap: { [S in School]?: number } = {};
  for (const r of vowRestrictions(hero)) {
    if (r.kind === "never-cast") barred.push(r.school);
    if (r.kind === "max-school-rank") {
      for (const s of r.school === undefined ? SCHOOLS : [r.school]) {
        rankCap[s] = Math.min(rankCap[s] ?? 3, r.rank);
      }
    }
  }
  return {
    ...(barred.length > 0 ? { barred } : {}),
    ...(Object.keys(rankCap).length > 0 ? { rankCap } : {}),
  };
}

/** What magic changes: mana, the book, the scroll case. */
export interface HeroMagicPatch {
  readonly mana?: number;
  readonly knownSpells?: readonly string[];
  readonly scrolls?: readonly string[];
}

/** Writes the patch on a hero the caller owns (a clone), in place. */
export function withHeroMagic(hero: HeroState, patch: HeroMagicPatch): void {
  if (patch.mana !== undefined) hero.mana = Math.max(0, Math.round(patch.mana));
  if (patch.knownSpells !== undefined) hero.pages = [...patch.knownSpells];
  if (patch.scrolls !== undefined)
    hero.scrolls = patch.scrolls.slice(0, scrollCaseSize(hero));
}

export function storeOf(state: GameState, heroId: string): HeroMagicStore {
  return state.magic?.heroes[heroId] ?? { castToday: [] };
}

/** Mutable access to a hero's day store, in place. */
export function mutableStore(state: GameState, heroId: string): HeroMagicStore {
  if (!state.magic) state.magic = { heroes: {} };
  const m = state.magic;
  const cur = m.heroes[heroId] ?? { castToday: [] };
  m.heroes = { ...m.heroes, [heroId]: cur };
  return cur;
}

/** Whether the hero's school rank allows learning a spell of this tier. */
export function canLearn(
  magic: Pick<HeroMagic, "schoolRanks" | "barred" | "rankCap">,
  school: School,
  tier: number,
): boolean {
  // A vow's school is never learnt; a vow's rank cap limits the tier.
  if (magic.barred?.includes(school)) return false;
  const rank = Math.min(
    magic.schoolRanks[school],
    magic.rankCap?.[school] ?? 3,
  );
  return tier <= (RANK_MAX_TIER[rank] ?? 0);
}
