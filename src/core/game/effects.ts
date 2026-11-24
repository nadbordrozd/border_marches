/**
 * The hero hook framework (RULES_V2 3 and 4): every number a hero's
 * skills, feats, vows, specialty, worn artifacts and pending consumables
 * change is read here, from one list of sourced effects.
 *
 * Content is data (src/data/effects.ts kinds). {@link heroEffects} gathers
 * a hero's effects with their source, and each reader below sums the kinds
 * it owns:
 *
 * | Reader              | Kinds                                         |
 * | ------------------- | --------------------------------------------- |
 * | heroStats           | stat (clamped 0..40)                          |
 * | schoolRank          | school-rank                                   |
 * | pagePower           | school-rank bonus, school-power, page-power   |
 * | maxMana, manaRegen  | max-mana-percent, mana-regen (and Lore)       |
 * | movementPoints      | movement-percent, movement-flat               |
 * | terrainProfile      | terrain-cost (and the class native terrain)   |
 * | sightRadius         | sight                                         |
 * | xpPercent           | xp-percent                                    |
 * | heroIncome          | income                                        |
 * | armyMorale, Luck    | morale, luck (clamped -3..3)                  |
 * | backpackSize, ...   | backpack-size, scroll-case-size               |
 * | commandStrength     | command-bonus                                 |
 * | battle.ts profile   | strike-percent, stack-stats, battle-start,    |
 * |                     | switch, spell-power, mana-cost-percent        |
 *
 * Pure functions of a HeroState; nothing here changes the state.
 */
import {
  BACKPACK_SIZE,
  SCROLL_CASE_SIZE,
  findArtifact,
  wornDef,
} from "../../data/artifacts.ts";
import { getHeroClass, type Specialty } from "../../data/classes.ts";
import { getCreature } from "../../data/creatures.ts";
import type {
  HeroEffect,
  PrimaryStat,
  RuleSwitchId,
  School,
  VowRestriction,
} from "../../data/effects.ts";
import { PRIMARY_STATS, STAT_NAMES } from "../../data/effects.ts";
import { findFeat } from "../../data/feats.ts";
import {
  HERO_SIGHT,
  MANA_PER_LORE,
  MAX_SIGHT,
  MAX_STAT,
  MIN_STAT,
  MOVE_BASE,
  MOVE_MAX,
  MOVE_PER_SPEED,
  MOVE_SPEED_MAX,
  MOVE_SPEED_MIN,
} from "../../data/hero.ts";
import { findHeroDef } from "../../data/players.ts";
import { findSkill } from "../../data/skills.ts";
import type { CreatureId, Resources } from "../../data/types.ts";
import type { Terrain } from "../map/types.ts";
import { emptyResources } from "./resources.ts";
import type { HeroState } from "./types.ts";

export type EffectSourceKind =
  "skill" | "feat" | "specialty" | "artifact" | "consumable";

export interface EffectSource {
  kind: EffectSourceKind;
  /** Skill, feat, artifact or consumable id; "specialty" for a specialty. */
  id: string;
  /** Display label, e.g. "Onslaught 2", "Tin Sabre". */
  label: string;
}

export interface SourcedEffect {
  source: EffectSource;
  effect: HeroEffect;
}

/** C grows by 1 per this many levels (RULES_V2 3.7). */
const LEVELS_PER_STEP = 5;

/** The effects of a specialty at a hero level (RULES_V2 3.7). */
export function specialtyEffects(spec: Specialty): HeroEffect[] {
  switch (spec.kind) {
    case "creature":
      return [
        {
          kind: "stack-stats",
          creature: spec.creature,
          attack: 1,
          defense: 1,
          speed: 1,
          perLevels: LEVELS_PER_STEP,
        },
      ];
    case "spell":
      return [
        {
          kind: "spell-power",
          spell: spec.spell,
          amount: 2,
          perLevels: LEVELS_PER_STEP,
        },
      ];
    case "resource":
      if (spec.resource === "gold") {
        return [{ kind: "income", resources: { gold: 250 } }];
      }
      if (spec.resource === "wood-ore") {
        return [{ kind: "income", resources: { wood: 1, ore: 1 } }];
      }
      return [{ kind: "income", resources: { essence: 1 }, everyDays: 2 }];
    case "command":
      return [{ kind: "command-bonus", amount: 1 }];
    case "skill":
      // Applied when the hero is created (a starting skill at rank 2).
      return [];
  }
}

/** One line describing a specialty, for the hero screen. */
export function specialtyText(spec: Specialty): string {
  switch (spec.kind) {
    case "creature": {
      const name = getCreature(spec.creature as CreatureId).plural;
      return `${name}: +1 Attack and Defense (+1 per 5 levels) and +1 Speed.`;
    }
    case "spell":
      return `Starts with ${spec.spell}, cast at +2 Power (+1 per 5 levels).`;
    case "skill": {
      const name = findSkill(spec.skill)?.name ?? spec.skill;
      return `Starts with ${name} at rank 2.`;
    }
    case "resource":
      return spec.resource === "gold"
        ? "250 gold each day."
        : spec.resource === "wood-ore"
          ? "1 wood and 1 ore each day."
          : "1 essence every second day.";
    case "command":
      return "The Command counts C one higher.";
  }
}

/** The hero's specialty, from its named-hero record. */
export function heroSpecialty(hero: HeroState): Specialty | undefined {
  return findHeroDef(hero.defId)?.specialty;
}

/**
 * Every effect acting on the hero, with its source, in a fixed order:
 * skills (in the order gained), feats, specialty, worn artifacts in slot
 * order, then consumables waiting for the next battle.
 */
export function heroEffects(hero: HeroState): SourcedEffect[] {
  const out: SourcedEffect[] = [];
  const push = (source: EffectSource, effects: readonly HeroEffect[]): void => {
    for (const effect of effects) out.push({ source, effect });
  };
  for (const s of hero.skills) {
    const def = findSkill(s.id);
    const rank = def?.ranks[s.rank - 1];
    if (def === undefined || rank === undefined) continue;
    push(
      { kind: "skill", id: s.id, label: `${def.name} ${s.rank}` },
      rank.effects,
    );
  }
  for (const id of hero.feats) {
    const def = findFeat(id);
    if (def !== undefined) {
      push({ kind: "feat", id, label: def.name }, def.effects);
    }
  }
  const spec = heroSpecialty(hero);
  if (spec !== undefined) {
    push(
      { kind: "specialty", id: "specialty", label: "Specialty" },
      specialtyEffects(spec),
    );
  }
  for (const id of hero.worn) {
    if (id === null) continue;
    const def = wornDef(id);
    if (def !== undefined) {
      push({ kind: "artifact", id, label: def.name }, def.effects);
    }
  }
  for (const id of hero.nextBattle) {
    const def = findArtifact(id);
    if (def?.kind === "consumable" && def.use.kind === "next-battle") {
      push({ kind: "consumable", id, label: def.name }, def.use.effects);
    }
  }
  return out;
}

type EffectOf<K extends HeroEffect["kind"]> = Extract<HeroEffect, { kind: K }>;

/** The hero's effects of one kind, with sources. */
export function effectsOf<K extends HeroEffect["kind"]>(
  hero: HeroState,
  kind: K,
): Array<{ source: EffectSource; effect: EffectOf<K> }> {
  return heroEffects(hero).filter(
    (e): e is { source: EffectSource; effect: EffectOf<K> } =>
      e.effect.kind === kind,
  );
}

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

/** One contribution to a number, for tooltips. */
export interface Contribution {
  label: string;
  amount: number;
}

/** Base value and every modifier of one primary stat. */
export function statBreakdown(
  hero: HeroState,
  stat: PrimaryStat,
): Contribution[] {
  const out: Contribution[] = [{ label: "Base", amount: hero[stat] }];
  for (const { source, effect } of effectsOf(hero, "stat")) {
    if (effect.stat === stat)
      out.push({ label: source.label, amount: effect.amount });
  }
  return out;
}

/** Effective primary stats: base plus modifiers, each clamped to 0..40. */
export function heroStats(hero: HeroState): Record<PrimaryStat, number> {
  const out = {} as Record<PrimaryStat, number>;
  for (const stat of PRIMARY_STATS) {
    const total = statBreakdown(hero, stat).reduce((n, c) => n + c.amount, 0);
    out[stat] = clamp(total, MIN_STAT, MAX_STAT);
  }
  return out;
}

/** The hero's rank in a school (RULES_V2 2.2), 0 without its skill. */
export function schoolRank(hero: HeroState, school: School): number {
  let rank = 0;
  for (const { effect } of effectsOf(hero, "school-rank")) {
    if (effect.school === school) rank = Math.max(rank, effect.rank);
  }
  return rank;
}

/** Power bonus of a school rank (RULES_V2 2.2): +0, +2, +4. */
export const SCHOOL_RANK_POWER: readonly number[] = [0, 0, 2, 4];

/**
 * Effective Power of the hero's pages of a school (RULES_V2 2.4): Power +
 * rank bonus + school and page modifiers, 0..30. Magic (bead bzc.9) adds a
 * spell's own specialty bonus with {@link spellPowerBonus}.
 */
export function pagePower(hero: HeroState, school: School): number {
  let p =
    heroStats(hero).power + (SCHOOL_RANK_POWER[schoolRank(hero, school)] ?? 0);
  for (const { effect } of heroEffects(hero)) {
    if (effect.kind === "school-power" && effect.school === school) {
      p += effect.amount;
    } else if (effect.kind === "page-power") p += effect.amount;
  }
  return clamp(p, 0, 30);
}

/** Effective Power of a scroll (RULES_V2 2.5): Power, at least 2, + modifiers. */
export function scrollPower(hero: HeroState): number {
  let p = Math.max(2, heroStats(hero).power);
  for (const { effect } of effectsOf(hero, "scroll-power")) p += effect.amount;
  return clamp(p, 0, 30);
}

/** Extra Power for one named spell (a Spell specialty, RULES_V2 3.7). */
export function spellPowerBonus(hero: HeroState, spell: string): number {
  let n = 0;
  for (const { effect } of effectsOf(hero, "spell-power")) {
    if (effect.spell === spell) {
      n += effect.amount + Math.floor(hero.level / effect.perLevels);
    }
  }
  return n;
}

/** Page mana cost percentage modifier (RULES_V2 2.3); -10 is 10% cheaper. */
export function manaCostPercent(hero: HeroState): number {
  return effectsOf(hero, "mana-cost-percent").reduce(
    (n, e) => n + e.effect.percent,
    0,
  );
}

/** Maximum mana (RULES_V2 2.3): 10 x Lore, then percentages. */
export function maxMana(hero: HeroState): number {
  const pct = effectsOf(hero, "max-mana-percent").reduce(
    (n, e) => n + e.effect.percent,
    0,
  );
  return Math.floor((MANA_PER_LORE * heroStats(hero).lore * (100 + pct)) / 100);
}

/** Daily mana return (RULES_V2 2.3): 1 + floor(Lore / 3) + modifiers. */
export function manaRegen(hero: HeroState): number {
  const flat = effectsOf(hero, "mana-regen").reduce(
    (n, e) => n + e.effect.amount,
    0,
  );
  return 1 + Math.floor(heroStats(hero).lore / 3) + flat;
}

/**
 * Mana after one day's return: up to the maximum; a hero above its maximum
 * does not regenerate (RULES_V2 2.3).
 */
export function regeneratedMana(hero: HeroState): number {
  const max = maxMana(hero);
  if (hero.mana >= max) return hero.mana;
  return Math.min(max, hero.mana + manaRegen(hero));
}

/** The army's slowest creature Speed (4 with an empty army). */
export function slowestSpeed(hero: HeroState): number {
  let slowest = Infinity;
  for (const s of hero.army) {
    if (s !== null) slowest = Math.min(slowest, getCreature(s.creature).speed);
  }
  return slowest === Infinity ? 4 : slowest;
}

/** Each part of the day's movement points, for the hero screen. */
export interface MovementBreakdown {
  base: number;
  percent: number;
  flat: number;
  debt: number;
  total: number;
}

/**
 * Movement points for a day (RULES_V2 3.9): base 1300 + 50 x clamp(slowest
 * Speed, 2, 8), x (100 + percentages) / 100, + flat, at most 3000, minus a
 * Borrowed Day debt.
 */
export function movementBreakdown(hero: HeroState): MovementBreakdown {
  const speed = clamp(slowestSpeed(hero), MOVE_SPEED_MIN, MOVE_SPEED_MAX);
  const base = MOVE_BASE + MOVE_PER_SPEED * speed;
  let percent = 0;
  let flat = 0;
  for (const { effect } of heroEffects(hero)) {
    if (effect.kind === "movement-percent") percent += effect.percent;
    else if (effect.kind === "movement-flat") flat += effect.amount;
  }
  const mp = Math.min(
    MOVE_MAX,
    Math.floor((base * (100 + percent)) / 100) + flat,
  );
  const total = Math.max(0, mp - hero.mpDebt);
  return { base, percent, flat, debt: hero.mpDebt, total };
}

export function movementPoints(hero: HeroState): number {
  return movementBreakdown(hero).total;
}

/** How terrain costs this hero (RULES_V2 3.9): native and reductions. */
export interface TerrainProfile {
  native: Terrain | null;
  /** Reduction for terrain costing more than 100, never below 100. */
  reduce: number;
  /** Per-terrain reductions (an item for one terrain). */
  perTerrain: Partial<Record<Terrain, number>>;
}

export function terrainProfile(hero: HeroState): TerrainProfile {
  const profile: TerrainProfile = {
    native: getHeroClass(hero.heroClass).nativeTerrain,
    reduce: 0,
    perTerrain: {},
  };
  for (const { effect } of effectsOf(hero, "terrain-cost")) {
    if (effect.terrain === undefined) {
      profile.reduce = Math.max(profile.reduce, effect.reduce);
    } else {
      profile.perTerrain[effect.terrain] = Math.max(
        profile.perTerrain[effect.terrain] ?? 0,
        effect.reduce,
      );
    }
  }
  return profile;
}

/** Sight radius (RULES_V2 3.9): 6 plus modifiers, at most 12. */
export function sightRadius(hero: HeroState): number {
  const add = effectsOf(hero, "sight").reduce((n, e) => n + e.effect.amount, 0);
  return clamp(HERO_SIGHT + add, 0, MAX_SIGHT);
}

/** XP gain percentage modifier (RULES_V2 3.2). */
export function xpPercent(hero: HeroState): number {
  return effectsOf(hero, "xp-percent").reduce(
    (n, e) => n + e.effect.percent,
    0,
  );
}

/** A hero's daily income on `day` (skills, artifacts, specialty). */
export function heroIncome(hero: HeroState, day: number): Resources {
  const out = emptyResources();
  for (const { effect } of effectsOf(hero, "income")) {
    const every = effect.everyDays ?? 1;
    if (day % every !== 0) continue;
    for (const [r, n] of Object.entries(effect.resources)) {
      out[r as keyof Resources] += n;
    }
  }
  return out;
}

/** Army Morale (RULES_V2 6): sum of sources, -3..3. */
export function armyMorale(hero: HeroState): number {
  const n = effectsOf(hero, "morale").reduce((a, e) => a + e.effect.amount, 0);
  return clamp(n, -3, 3);
}

/** Army Luck (RULES_V2 6): sum of sources, -3..3. */
export function armyLuck(hero: HeroState): number {
  const n = effectsOf(hero, "luck").reduce((a, e) => a + e.effect.amount, 0);
  return clamp(n, -3, 3);
}

/** Backpack slots (RULES_V2 4.1: 12; Packrat 16). */
export function backpackSize(hero: HeroState): number {
  return effectsOf(hero, "backpack-size").reduce(
    (n, e) => Math.max(n, e.effect.size),
    BACKPACK_SIZE,
  );
}

/** Scroll case capacity (RULES_V2 2.5: 8; Packrat 12). */
export function scrollCaseSize(hero: HeroState): number {
  return effectsOf(hero, "scroll-case-size").reduce(
    (n, e) => Math.max(n, e.effect.size),
    SCROLL_CASE_SIZE,
  );
}

/** C of the Command (RULES_V2 3.7): 1 + floor(level / 5) + bonuses. */
export function commandStrength(hero: HeroState): number {
  const bonus = effectsOf(hero, "command-bonus").reduce(
    (n, e) => n + e.effect.amount,
    0,
  );
  return 1 + Math.floor(hero.level / LEVELS_PER_STEP) + bonus;
}

/** Rule switches the hero carries into battle (form 5), unique, in order. */
export function ruleSwitches(hero: HeroState): RuleSwitchId[] {
  const out: RuleSwitchId[] = [];
  for (const { effect } of effectsOf(hero, "switch")) {
    if (!out.includes(effect.id)) out.push(effect.id);
  }
  return out;
}

/** The vows' restrictions the hero is bound by (RULES_V2 3.5). */
export function vowRestrictions(hero: HeroState): VowRestriction[] {
  const out: VowRestriction[] = [];
  for (const id of hero.feats) {
    const r = findFeat(id)?.restriction;
    if (r !== undefined) out.push(r);
  }
  return out;
}

/** Display name of a stat, re-exported for the interface. */
export function statName(stat: PrimaryStat): string {
  return STAT_NAMES[stat];
}
