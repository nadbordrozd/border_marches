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
 * Hero battle rules the engine reads by id (core/battle/rules.ts
 * `hasRule`): the rule switches of RULES_V2 4.6 form 5 and
 * CONTENT_ARTIFACTS 7, and the feat, vow, skill and artifact rules that
 * bend the grammar. The adventure layer only carries them into the battle
 * profile; each is implemented where the comment says and tested in
 * tests/core/battle/hero-rules.test.ts.
 */
export const RULE_SWITCH_IDS = [
  // Casting (core/battle/magic.ts secondCastError, engine.ts heroAct)
  "second-cast-opposed", // The Second Left Glove
  "second-cast-opposed-round-1", // The Glove's Thumb
  "second-cast-round-1", // Vow of the Opening
  "first-scroll-free", // Packrat 3
  "opposed-page-discount", // The Glove's Lining
  "opposed-cast-fires-up", // The Odd Cufflink
  "unspent-page", // The Unspent Page (its page rides in MagicSetup)
  "tier1-twice", // The Torn Corner
  "scrolls-kept", // Vow of the Borrowed Book
  "first-scroll-kept", // Bookbinder's Thread
  "hush-unspent-own", // Vow of the Grave
  "fuel-uses-plus-1", // Vow of Empty Pockets
  "fuel-triples", // Bonfire
  "echo-adds-2", // Long Echo
  "storm-spares-own", // Vow of the Pyre
  "chain-lightning", // Chain Lightning
  "spillover", // Spillover
  // Clocks (engine.ts endRound)
  "own-clocks-frozen", // The Hourglass with No Bottom
  "own-bane-clocks-frozen", // The Upper Bulb
  "strongest-boon-clocks-frozen", // The Lower Bulb
  // Links (resolve.ts land, kill, transfer)
  "link-passes", // Treaty Ink
  "links-clockless", // Vow of the Still Air
  "link-clock-plus-1", // The Quill
  "scapegoat-no-backlash", // The Blotter
  // Ground and remains
  "remains-any-owner", // Sexton's Spade (core/magic/targets.ts)
  "gleaner", // Gleaner
  "mirror-ward", // Mirror Ward
  "firewalkers", // Firewalkers
  "seed-bombs", // Seed Bombs
  // Retaliation (rules.ts retaliationLimit, resolve.ts)
  "riposte-1",
  "riposte-2",
  "riposte-3",
  "shield-wall",
  "peace-dividend",
  "gag-rule",
  // Gates, shooting, timeline, the Command
  "gates-double-hp", // Vow of Bare Hands
  "soaked-powder",
  "heartened-survives-once", // Vow of Flesh and Blood
  "mob-rule",
  "drill-sergeant-1", // Drill Sergeant ranks 1-2
  "drill-sergeant-3", // Drill Sergeant rank 3
  // Ability reach (core/battle/abilities.ts withinReach)
  "long-shadow-1", // Long Shadow ranks 1-3
  "long-shadow-2",
  "long-shadow-3",
  // Deployment before round 1 (core/battle/deploy.ts deployColumns)
  "vanguard-1", // Vanguard ranks 1-3: columns to rearrange within
  "vanguard-2",
  "vanguard-3",
  // Condition kinds (core/magic/kinds.ts, core/battle/standard.ts)
  "cold-hands",
  "double-or-nothing",
  "green-thumb",
  "briar-patch",
  "burr",
  "harvest",
  "windfall",
  "quickstep",
  "co-signer",
  "compound-interest",
  "bloodletting",
  "thicker-than-water",
  "blaze-of-glory",
  "gardeners-apron",
  "hedge-clipper-shears",
  "lightning-rod",
  "metronome-spurs",
  "bailiffs-greatcoat",
  "whetstone-pendant",
  // Retaliation reactions (core/battle/resolve.ts retaliate)
  "flypaper-ribbon", // Flypaper Ribbon (FACTION_CANDY 5.2)
  // Steam (core/battle/factions/dwarves.ts, engine.ts defend)
  "pocket-boiler", // Pocket Boiler (FACTION_DWARVES 5.2)
  "scalding", // Scalding (FACTION_DWARVES 5.2)
] as const;

export type RuleSwitchId = (typeof RULE_SWITCH_IDS)[number];

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
   * Sea movement (NAVAL 2.4, bead bzc.149): Seafaring, the Captain's
   * Tricorne and the Locket; read by seaMovementBreakdown, never on land.
   */
  | { kind: "sea-movement-percent"; percent: number }
  | { kind: "sea-movement-flat"; amount: number }
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
  | { kind: "spell-power"; spell: string; amount: number; perLevels: number }
  /** Silver Tongue: hiring at outposts, stray huts and lodges is cheaper. */
  | { kind: "hire-discount"; percent: number }
  /**
   * Silver Tongue: a neutral stack whose FV is at most `percent` of this
   * army's FV has no zone of control against this hero.
   */
  | { kind: "parley"; percent: number }
  /** Packrat 2: sites buy artifacts and scrolls at `percent` of value. */
  | { kind: "sell-percent"; percent: number }
  /**
   * Wayfinder: adventure spells cost `costPercent` more (negative is
   * cheaper), scale as if Power were `power` higher and may be cast
   * `perDay` times a day.
   */
  | {
      kind: "adventure-magic";
      costPercent: number;
      power: number;
      perDay: number;
    }
  /** The Missing Page: the highest-tier page starts each battle spent. */
  | { kind: "missing-page" };

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
