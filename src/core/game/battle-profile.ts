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
  heroEffects,
  heroStats,
  manaCostPercent,
  maxMana,
  pagePower,
  ruleSwitches,
  schoolRank,
  scrollPower,
  vowRestrictions,
} from "./effects.ts";
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
    switches: ruleSwitches(hero),
    command: getHeroClass(hero.heroClass).command,
    commandStrength: commandStrength(hero),
    pages: [...hero.pages],
    scrolls: [...hero.scrolls],
    schoolRanks,
    pagePower: powers,
    scrollPower: scrollPower(hero),
    manaCostPercent: manaCostPercent(hero),
    restrictions: vowRestrictions(hero),
  };
}
