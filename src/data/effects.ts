/**
 * Hero effects: the data shapes through which skills, feats, vows,
 * specialties, artifacts and consumables change a hero (RULES_V2 sections
 * 3 and 4). Pure data: every row of content lists its effects with these
 * kinds, and src/core/game/effects.ts reads them.
 *
 * Adding a content row never needs code: pick existing kinds. A new kind
 * is added here and read in src/core/game/effects.ts (adventure numbers)
 * or src/core/game/battle.ts (`heroBattleProfile`, battle numbers).
 */
import type { Terrain } from "../core/map/types.ts";
import type { ResourceAmounts } from "./types.ts";

/** The four primary stats (RULES_V2 3.1). */
export type PrimaryStat = "attack" | "defense" | "power" | "lore";

export const PRIMARY_STATS: readonly PrimaryStat[] = [
  "attack",
  "defense",
  "power",
  "lore",
];

/** The five schools, in wheel order (RULES_V2 2.1). */
export type School = "bloom" | "accord" | "clock" | "hush" | "storm";

export const SCHOOLS: readonly School[] = [
  "bloom",
  "accord",
  "clock",
  "hush",
  "storm",
];

/** Which strikes a battle percentage touches. */
export type StrikeFilter = "melee" | "shot" | "all";

/**
 * Selectors of RULES_V2 0.2 and CONTENT_ARTIFACTS 1 for battle-start rules:
 * strongest, weakest, fastest, slowest, and the strongest shooter.
 */
export type StackSelector =
  "strongest" | "weakest" | "fastest" | "slowest" | "strongest-shooter" | "all";

/**
 * A battle-start rule (RULES_V2 4.6 form 2): at deployment, `count`
 * stacks of `side` chosen by `selector` start with a condition. Condition
 * kinds are CONTENT_SPELLS names (bead bzc.8 implements them); a link
 * kind names its far end with `linkTo`.
 */
export interface BattleStartRule {
  side: "own" | "enemy";
  selector: StackSelector;
  /** Stacks chosen (default 1; ignored for "all"). */
  count?: number;
  /** Condition kind id, e.g. "frozen", "warded", "jinxed". */
  condition: string;
  /** Condition size, when the kind has one. */
  size?: number;
  /** Rounds; null is clockless. */
  clock: number | null;
  /** False: the Hold has no gate (CONTENT_ARTIFACTS 4). */
  gate?: boolean;
  /** For a link: its far end. */
  linkTo?: { side: "own" | "enemy"; selector: StackSelector };
}

/**
 * Rule switches (RULES_V2 4.6 form 5) and other battle rules the engine
 * reads by id. The battle engine (bead bzc.8) implements each id; the
 * adventure layer only carries them into the battle profile.
 */
export type RuleSwitchId =
  | "second-cast-opposed"
  | "second-cast-opposed-round-1"
  | "second-cast-round-1"
  | "own-clocks-frozen"
  | "own-bane-clocks-frozen"
  | "strongest-boon-clocks-frozen"
  | "fuel-uses-plus-1"
  | "fuel-triples"
  | "echo-adds-2"
  | "hush-unspent-own"
  | "opposed-page-discount"
  | "opposed-cast-fires-up"
  | "item-act-wind";

/** A vow's restriction, from the fixed list of RULES_V2 3.5. */
export type VowRestriction =
  /** A school that can never be cast (pages and scrolls). */
  | { kind: "never-cast"; school: School }
  /** No school skill above `rank` (0: no school skill at all). */
  | { kind: "max-school-rank"; rank: number; school?: School }
  /** Rounds in which the hero cannot cast. */
  | { kind: "no-cast-rounds"; rounds: "1-2" | "after-3" | "even" }
  /** A creature tag the army may not contain. */
  | { kind: "barred-tag"; tag: string }
  /** An artifact slot kind that must stay empty. */
  | { kind: "empty-slot"; slot: "pocket" | "feet" | "ring" };

/**
 * One effect of a skill rank, feat, specialty, artifact or pending
 * consumable. Percentages are whole numbers (10 is +10%).
 */
export type HeroEffect =
  /** Adds to a primary stat (RULES_V2 3.1; clamped 0..40 after all). */
  | { kind: "stat"; stat: PrimaryStat; amount: number }
  /** A school skill's rank (RULES_V2 2.2): learnable tiers, Power bonus. */
  | { kind: "school-rank"; school: School; rank: number }
  /** Power for one school's pages (CONTENT_ARTIFACTS Trinkets). */
  | { kind: "school-power"; school: School; amount: number }
  /** Power for every page (a feat or vow). */
  | { kind: "page-power"; amount: number }
  /** Power for scrolls (Packrat). */
  | { kind: "scroll-power"; amount: number }
  | { kind: "max-mana-percent"; percent: number }
  | { kind: "mana-regen"; amount: number }
  /** Page mana cost; negative is cheaper (RULES_V2 2.3). */
  | { kind: "mana-cost-percent"; percent: number }
  | { kind: "movement-percent"; percent: number }
  | { kind: "movement-flat"; amount: number }
  /**
   * Terrain that costs more than 100 costs `reduce` less, never below 100
   * (Trailcraft); `terrain` limits it to one terrain; reduce >= 1000 makes
   * all passable terrain cost 100.
   */
  | { kind: "terrain-cost"; reduce: number; terrain?: Terrain }
  | { kind: "sight"; amount: number }
  | { kind: "xp-percent"; percent: number }
  /** Daily income while on the map; `everyDays` 2 pays on even days. */
  | { kind: "income"; resources: ResourceAmounts; everyDays?: number }
  | { kind: "morale"; amount: number }
  | { kind: "luck"; amount: number }
  | { kind: "backpack-size"; size: number }
  | { kind: "scroll-case-size"; size: number }
  /** Strike multiplier for the hero's side (RULES_V2 1.8). */
  | {
      kind: "strike-percent";
      strike: StrikeFilter;
      /** "dealt": Strikes by your stacks; "taken": Strikes against them. */
      direction: "dealt" | "taken";
      percent: number;
      /** Only Strikes against a stack bearing one of these kinds. */
      targetBears?: readonly string[];
    }
  /**
   * Flat stack stats: every stack of the army, or stacks of one creature
   * (a Creature specialty). `perLevels` adds 1 to Attack and Defense per
   * that many hero levels (RULES_V2 3.7: 5).
   */
  | {
      kind: "stack-stats";
      creature?: string;
      attack?: number;
      defense?: number;
      speed?: number;
      perLevels?: number;
    }
  /** The Command's C counts higher (RULES_V2 3.7). */
  | { kind: "command-bonus"; amount: number }
  | { kind: "battle-start"; rule: BattleStartRule }
  | { kind: "switch"; id: RuleSwitchId }
  /** After a battle you win, each stack regains `tenths`/10 of its losses. */
  | { kind: "field-surgeon"; tenths: number }
  /** A spell page the hero casts at extra Power (a Spell specialty). */
  | { kind: "spell-power"; spell: string; amount: number; perLevels: number };

/** Short names for the UI and tooltips. */
export const STAT_NAMES: Readonly<Record<PrimaryStat, string>> = {
  attack: "Attack",
  defense: "Defense",
  power: "Power",
  lore: "Lore",
};

export const SCHOOL_NAMES: Readonly<Record<School, string>> = {
  bloom: "Bloom",
  accord: "Accord",
  clock: "Clock",
  hush: "Hush",
  storm: "Storm",
};

/** Neighbours on the wheel are allied, the other two opposed (2.1). */
export function schoolRelation(
  a: School,
  b: School,
): "same" | "allied" | "opposed" {
  if (a === b) return "same";
  const i = SCHOOLS.indexOf(a);
  const j = SCHOOLS.indexOf(b);
  const d = (i - j + SCHOOLS.length) % SCHOOLS.length;
  return d === 1 || d === SCHOOLS.length - 1 ? "allied" : "opposed";
}
