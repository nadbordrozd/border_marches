/**
 * Calendar, experience levels, creature growth and fight value: the small
 * numeric rules of the adventure layer.
 */
import { DAYS_PER_WEEK, WEEKS_PER_MONTH, XP_TABLE } from "../../data/hero.ts";
import { NEUTRAL_MAX_BATTLE_STACKS } from "../../data/neutrals.ts";
import type { CreatureDef } from "../../data/types.ts";

export interface Calendar {
  /** Absolute day, 1-based. */
  day: number;
  /** 1..7 */
  dayOfWeek: number;
  /** Week within the month, 1..4. */
  week: number;
  /** 1-based. */
  month: number;
  /** Absolute week, 1-based. */
  weekOfGame: number;
}

/** GAME_DESIGN.md section 5: 7-day weeks, 4-week months, day 1 = 1/1/1. */
export function calendar(day: number): Calendar {
  const d = day - 1;
  const weekOfGame = Math.floor(d / DAYS_PER_WEEK) + 1;
  return {
    day,
    dayOfWeek: (d % DAYS_PER_WEEK) + 1,
    week: ((weekOfGame - 1) % WEEKS_PER_MONTH) + 1,
    month: Math.floor((weekOfGame - 1) / WEEKS_PER_MONTH) + 1,
    weekOfGame,
  };
}

/** Whether `day` is day 1 of week 2 or later (weekly growth day). */
export function isGrowthDay(day: number): boolean {
  return day > 1 && (day - 1) % DAYS_PER_WEEK === 0;
}

/**
 * Total XP needed to reach `level` (level 1 = 0). Levels 14+ are the
 * previous threshold x 1.2, rounded down (exact integer arithmetic).
 */
export function xpForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError(`bad level ${level}`);
  }
  if (level <= XP_TABLE.length) return XP_TABLE[level - 1] as number;
  let xp = XP_TABLE[XP_TABLE.length - 1] as number;
  for (let l = XP_TABLE.length + 1; l <= level; l++) {
    xp = Math.floor((xp * 6) / 5);
  }
  return xp;
}

/** The level a hero with `xp` total experience has reached. */
export function levelForXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

/**
 * One week of growth for a dwelling (FACTION_LOST_WORLD.md section 6).
 * Without the Stockade: `growth` creatures, remainder unchanged. With it:
 * t = 3 x growth + remainder, add floor(t / 2), keep t mod 2.
 */
export function weeklyGrowth(
  growth: number,
  stockade: boolean,
  remainder: number,
): { added: number; remainder: number } {
  if (!stockade) return { added: growth, remainder };
  const t = 3 * growth + remainder;
  return { added: Math.floor(t / 2), remainder: t % 2 };
}

/**
 * Fight value per creature (GAME_DESIGN.md section 8.2): a map-generation
 * heuristic, never used in battle.
 * round(10 x sqrt(HP x Dmg) x (1 + 0.05 x (Atk + Def)) x (1.25 if ranged)).
 */
export function fightValue(def: CreatureDef): number {
  const ranged = def.shots > 0 ? 1.25 : 1;
  return Math.round(
    10 *
      Math.sqrt(def.hp * def.damage) *
      ((20 + def.attack + def.defense) / 20) *
      ranged,
  );
}

/**
 * How a neutral stack of `count` is deployed in battle: min(count, 3)
 * stacks with sizes as equal as possible, larger first.
 */
export function splitNeutralStack(count: number): number[] {
  if (!Number.isInteger(count) || count < 1) return [];
  const k = Math.min(count, NEUTRAL_MAX_BATTLE_STACKS);
  const base = Math.floor(count / k);
  const extra = count % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}
