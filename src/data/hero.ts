/**
 * Hero constants: the XP curve, calendar, sight and army size (RULES_V2
 * 3.2, 3.9; GAME_DESIGN.md sections 5 and 7.3). Classes live in
 * src/data/classes.ts and are re-exported here for older imports.
 */
export {
  CHIEFTAIN,
  HERO_CLASSES,
  getHeroClass,
  type HeroClassDef,
} from "./classes.ts";

/** Army and garrison size in stacks. */
export const ARMY_SLOTS = 7;

/**
 * Total XP needed for level L (RULES_V2 3.2, ECONOMY.md 9):
 * 100 x (L - 1) x (L + 2). No cap.
 */
export function xpCurve(level: number): number {
  return 100 * (level - 1) * (level + 2);
}

/** Sight radius in cells (RULES_V2 3.9); skills and items add to it. */
export const HERO_SIGHT = 6;
export const TOWN_SIGHT = 5;
/** The largest hero sight radius after all modifiers (RULES_V2 3.9). */
export const MAX_SIGHT = 12;

/** Primary stats after all modifiers (RULES_V2 3.1). */
export const MIN_STAT = 0;
export const MAX_STAT = 40;

/** Movement (RULES_V2 3.9): base = 1300 + 50 x clamp(slowest Speed, 2, 8). */
export const MOVE_BASE = 1300;
export const MOVE_PER_SPEED = 50;
export const MOVE_SPEED_MIN = 2;
export const MOVE_SPEED_MAX = 8;
export const MOVE_MAX = 3000;

/** Mana (RULES_V2 2.3): maximum 10 x Lore; daily 1 + floor(Lore / 3). */
export const MANA_PER_LORE = 10;

export const DAYS_PER_WEEK = 7;
export const WEEKS_PER_MONTH = 4;
