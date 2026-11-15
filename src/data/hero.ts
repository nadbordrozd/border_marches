/**
 * The Chieftain hero class, the XP table, calendar and sight constants
 * (GAME_DESIGN.md sections 5, 6 and 7.3).
 */
import type { Terrain } from "../core/map/types.ts";
import type { CreatureId, FactionId } from "./types.ts";

export interface HeroClassDef {
  id: string;
  name: string;
  faction: FactionId;
  /** Terrain this class crosses at the Grass cost (100). */
  nativeTerrain: Terrain;
  attack: number;
  defense: number;
  /** Movement points per day. */
  movement: number;
  startingArmy: ReadonlyArray<{ creature: CreatureId; count: number }>;
  /** Map sprite key (new art, bead border_marches-xaj.9). */
  sprite: string;
}

export const CHIEFTAIN: HeroClassDef = {
  id: "chieftain",
  name: "Chieftain",
  faction: "lost-world",
  nativeTerrain: "jungle",
  attack: 2,
  defense: 2,
  movement: 1500,
  startingArmy: [
    { creature: "caveman", count: 18 },
    { creature: "spitter", count: 6 },
  ],
  sprite: "hero-chieftain",
};

export const HERO_CLASSES: Readonly<Record<string, HeroClassDef>> = {
  chieftain: CHIEFTAIN,
};

/** The hero class with this id; throws on an unknown id. */
export function getHeroClass(id: string): HeroClassDef {
  const def = Object.hasOwn(HERO_CLASSES, id) ? HERO_CLASSES[id] : undefined;
  if (def === undefined) throw new Error(`unknown hero class "${id}"`);
  return def;
}

/** Army and garrison size in stacks. */
export const ARMY_SLOTS = 7;

/**
 * Total XP needed for levels 1..13 (index 0 = level 1). From level 14 each
 * threshold is the previous x 1.2, rounded down; see core/game/xp.ts.
 */
export const XP_TABLE: readonly number[] = [
  0, 1000, 2000, 3200, 4600, 6200, 8000, 10000, 12200, 14700, 17500, 20600,
  24320,
];

/** Sight radius in cells (GAME_DESIGN.md section 7.3). */
export const HERO_SIGHT = 6;
export const TOWN_SIGHT = 5;

export const DAYS_PER_WEEK = 7;
export const WEEKS_PER_MONTH = 4;

/** Level-up offers in the MVP. */
export type LevelUpChoice = "attack" | "defense";
export const LEVEL_UP_CHOICES: readonly LevelUpChoice[] = ["attack", "defense"];
