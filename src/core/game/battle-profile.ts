/**
 * A hero as the battle sees it (RULES_V2 2, 3, 4.6, 6): the numbers and
 * rules its skills, feats, vows, specialty, worn artifacts and pending
 * consumables bring, computed on the map and carried in the battle setup.
 *
 * The resolver (core/battle/resolver.ts) turns `strikes` and `stacks` into
 * registered hero abilities, `startRules` into the setup's start rules and
 * `itemActs` into the hero's item acts. Magic (bead bzc.9) reads Power,
 * mana, pages, scrolls, school ranks and the switches; the factions bead
 * (bzc.11) reads `command` and `commandStrength`.
 */
import { wornDef } from "../../data/artifacts.ts";
import { getHeroClass } from "../../data/classes.ts";
import {
  SCHOOLS,
  type BattleStartRule,
  type RuleSwitchId,
  type School,
  type VowRestriction,
} from "../../data/effects.ts";
import type {
  HeroStackModifier,
  HeroStrikeModifier,
} from "../battle/hero-effects.ts";
import {
  armyLuck,
  armyMorale,
  commandStrength,
  hasEffect,
  heroEffects,
  highestTierPage,
  spellPowerBonus,
  heroStats,
  manaCostPercent,
  maxMana,
  pagePower,
  ruleSwitches,
  schoolRank,
  scrollPower,
  vowRestrictions,
} from "./effects.ts";
import { isSpell, spellInfo } from "../magic/catalog.ts";
import type { HeroState } from "./types.ts";

export interface HeroBattleProfile {
  level: number;
  /** Effective primary stats (Attack and Defense also on BattleHero). */
  power: number;
  lore: number;
  mana: number;
  maxMana: number;
  /** Army Morale and Luck, -3..3 (RULES_V2 6). */
  morale: number;
  luck: number;
  strikes: HeroStrikeModifier[];
  stacks: HeroStackModifier[];
  /** Battle-start rules in source order, with their source label. */
  startRules: Array<{ rule: BattleStartRule; source: string }>;
  /** Item act ids of worn artifacts. */
  itemActs: string[];
  /** Rule switches (form 5) for the engine and magic. */
  switches: RuleSwitchId[];
  /** Class Command id and its C (RULES_V2 3.7). */
  command: string;
  commandStrength: number;
  /** Known spells and the scroll case (bead bzc.9 casts them). */
  pages: string[];
  scrolls: string[];
  schoolRanks: Record<School, number>;
  /** Effective Power of a page of each school (RULES_V2 2.4). */
  pagePower: Record<School, number>;
  scrollPower: number;
  /** Page mana cost percentage (negative is cheaper). */
  manaCostPercent: number;
  /** Vows' restrictions (casting rounds, barred schools). */
  restrictions: VowRestriction[];
  /** Extra Power per spell id (a Spell specialty, RULES_V2 3.7). */
  spellPower: Record<string, number>;
  /** Pages spent before round 1 (The Missing Page). */
  startSpent: string[];
  /** The page that is never spent (The Unspent Page), if worn. */
  unspentPage?: string;
}

/** Tier and listed mana of a battle page, or undefined. */
function pageInfo(id: string): { tier: number; mana: number } | undefined {
  if (!isSpell(id)) return undefined;
  const s = spellInfo(id);
  return s.kind === "battle" ? { tier: s.tier, mana: s.mana } : undefined;
}

/**
 * The page The Unspent Page keeps: the one chosen on the map, else the
 * highest-tier battle page (ties: costliest, then book order).
 */
export function unspentPageOf(hero: HeroState): string | undefined {
  if (hero.unspentPage !== undefined && hero.pages.includes(hero.unspentPage))
    return hero.unspentPage;
  return highestTierPage(hero.pages, pageInfo);
}

/** The pages The Unspent Page may keep: the battle pages in the book. */
export function unspentPageChoices(hero: HeroState): string[] {
  return hero.pages.filter((id) => pageInfo(id) !== undefined);
}

/** Whether the hero holds The Unspent Page's rule (the Marvel). */
export function holdsUnspentPage(hero: HeroState): boolean {
  return ruleSwitches(hero).includes("unspent-page");
}

/** The battle profile of a hero. Pure. */
export function heroBattleProfile(hero: HeroState): HeroBattleProfile {
  const stats = heroStats(hero);
  const strikes: HeroStrikeModifier[] = [];
  const stacks: HeroStackModifier[] = [];
  const startRules: HeroBattleProfile["startRules"] = [];
  for (const { source, effect } of heroEffects(hero)) {
    if (effect.kind === "strike-percent") {
      strikes.push({
        label: source.label,
        strike: effect.strike,
        direction: effect.direction,
        percent: effect.percent,
        ...(effect.targetBears !== undefined
          ? { targetBears: effect.targetBears }
          : {}),
      });
    } else if (effect.kind === "stack-stats") {
      const extra =
        effect.perLevels === undefined
          ? 0
          : Math.floor(hero.level / effect.perLevels);
      const attack = effect.attack === undefined ? 0 : effect.attack + extra;
      const defense = effect.defense === undefined ? 0 : effect.defense + extra;
      stacks.push({
        label: source.label,
        ...(effect.creature !== undefined ? { creature: effect.creature } : {}),
        attack,
        defense,
        speed: effect.speed ?? 0,
      });
    } else if (effect.kind === "battle-start") {
      startRules.push({ rule: effect.rule, source: source.label });
    }
  }
  const itemActs: string[] = [];
  for (const id of hero.worn) {
    for (const act of (id === null ? undefined : wornDef(id))?.itemActs ?? []) {
      if (!itemActs.includes(act)) itemActs.push(act);
    }
  }
  const schoolRanks = {} as Record<School, number>;
  const powers = {} as Record<School, number>;
  for (const school of SCHOOLS) {
    schoolRanks[school] = schoolRank(hero, school);
    powers[school] = pagePower(hero, school);
  }
  const switches = ruleSwitches(hero);
  const spellPower: Record<string, number> = {};
  for (const id of new Set([...hero.pages, ...hero.scrolls])) {
    const n = spellPowerBonus(hero, id);
    if (n !== 0) spellPower[id] = n;
  }
  const missing = hasEffect(hero, "missing-page")
    ? highestTierPage(hero.pages, pageInfo)
    : undefined;
  const unspent = switches.includes("unspent-page")
    ? unspentPageOf(hero)
    : undefined;
  return {
    level: hero.level,
    power: stats.power,
    lore: stats.lore,
    mana: hero.mana,
    maxMana: maxMana(hero),
    morale: armyMorale(hero),
    luck: armyLuck(hero),
    strikes,
    stacks,
    startRules,
    itemActs,
    switches,
    command: getHeroClass(hero.heroClass).command,
    commandStrength: commandStrength(hero),
    pages: [...hero.pages],
    scrolls: [...hero.scrolls],
    schoolRanks,
    pagePower: powers,
    scrollPower: scrollPower(hero),
    manaCostPercent: manaCostPercent(hero),
    restrictions: vowRestrictions(hero),
    spellPower,
    startSpent: missing !== undefined && missing !== unspent ? [missing] : [],
    ...(unspent !== undefined ? { unspentPage: unspent } : {}),
  };
}
