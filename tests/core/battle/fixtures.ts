/**
 * Creature stats copied from docs/design/FACTION_LOST_WORLD.md section 2 and
 * GAME_DESIGN.md section 8.1. Local to the battle tests so the engine is
 * tested against the documented numbers, independent of src/data.
 */

import { createRng } from "../../../src/core/rng.ts";
import type {
  BattleArmySetup,
  BattleCreatureStats,
  BattleStackSetup,
} from "../../../src/core/battle/index.ts";

export const CAVEMAN: BattleCreatureStats = {
  id: "caveman",
  tier: 1,
  hp: 10,
  attack: 4,
  defense: 3,
  damage: 2,
  speed: 4,
  abilities: ["mob"],
};
export const SPITTER: BattleCreatureStats = {
  id: "spitter",
  tier: 2,
  hp: 14,
  attack: 6,
  defense: 4,
  damage: 3,
  speed: 5,
  shots: 10,
  abilities: ["venom"],
};
export const RAPTOR: BattleCreatureStats = {
  id: "raptor",
  tier: 3,
  hp: 22,
  attack: 8,
  defense: 5,
  damage: 5,
  speed: 9,
  abilities: ["pack-hunter"],
};
export const SHAMAN: BattleCreatureStats = {
  id: "shaman",
  tier: 4,
  hp: 35,
  attack: 9,
  defense: 8,
  damage: 8,
  speed: 5,
  shots: 6,
  abilities: ["war-drums"],
};
export const TRICERATOPS: BattleCreatureStats = {
  id: "triceratops",
  tier: 5,
  hp: 80,
  attack: 13,
  defense: 16,
  damage: 15,
  speed: 5,
  abilities: ["charge"],
};
export const T_REX: BattleCreatureStats = {
  id: "t-rex",
  tier: 6,
  hp: 200,
  attack: 20,
  defense: 16,
  damage: 40,
  speed: 8,
  abilities: ["terror"],
};

export const GOBLIN: BattleCreatureStats = {
  id: "goblin",
  tier: 1,
  hp: 8,
  attack: 4,
  defense: 2,
  damage: 2,
  speed: 5,
  abilities: [],
};
export const SKELETON: BattleCreatureStats = {
  id: "skeleton",
  tier: 1,
  hp: 9,
  attack: 5,
  defense: 4,
  damage: 2,
  speed: 4,
  abilities: ["bony"],
};
export const BOMB_CHUCKER: BattleCreatureStats = {
  id: "bomb-chucker",
  tier: 2,
  hp: 12,
  attack: 6,
  defense: 3,
  damage: 3,
  speed: 4,
  shots: 8,
  abilities: [],
};
export const WOLF_RIDER: BattleCreatureStats = {
  id: "wolf-rider",
  tier: 2,
  hp: 18,
  attack: 7,
  defense: 5,
  damage: 4,
  speed: 8,
  abilities: [],
};
export const ORC_BRUTE: BattleCreatureStats = {
  id: "orc-brute",
  tier: 3,
  hp: 28,
  attack: 9,
  defense: 6,
  damage: 6,
  speed: 4,
  abilities: [],
};
export const TROLL: BattleCreatureStats = {
  id: "troll",
  tier: 4,
  hp: 50,
  attack: 11,
  defense: 9,
  damage: 10,
  speed: 5,
  abilities: ["regenerate"],
};
export const OGRE: BattleCreatureStats = {
  id: "ogre",
  tier: 5,
  hp: 90,
  attack: 14,
  defense: 12,
  damage: 16,
  speed: 4,
  abilities: [],
};
export const ORC_WARBOSS: BattleCreatureStats = {
  id: "orc-warboss",
  tier: 6,
  hp: 140,
  attack: 17,
  defense: 15,
  damage: 30,
  speed: 6,
  abilities: ["warcry"],
};

export const LOST_WORLD = [
  CAVEMAN,
  SPITTER,
  RAPTOR,
  SHAMAN,
  TRICERATOPS,
  T_REX,
];
export const NEUTRALS = [
  GOBLIN,
  SKELETON,
  BOMB_CHUCKER,
  WOLF_RIDER,
  ORC_BRUTE,
  TROLL,
  OGRE,
  ORC_WARBOSS,
];
export const ALL_CREATURES = [...LOST_WORLD, ...NEUTRALS];

export const CHIEFTAIN = { attack: 2, defense: 2 };

/** A plain non-ability creature for isolating one rule. */
export function dummy(
  over: Partial<BattleCreatureStats> = {},
): BattleCreatureStats {
  return {
    id: "dummy",
    tier: 1,
    hp: 10,
    attack: 5,
    defense: 5,
    damage: 2,
    speed: 4,
    abilities: [],
    ...over,
  };
}

/** A random army (1-7 stacks, any creature, counts scaled down by tier). */
export function randomArmy(seed: number, withHero: boolean): BattleArmySetup {
  const rng = createRng(seed);
  const n = rng.int(1, 7);
  const stacks: BattleStackSetup[] = [];
  for (let i = 0; i < n; i++) {
    const creature = rng.pick(ALL_CREATURES);
    const maxCount = [40, 25, 15, 10, 6, 3][creature.tier - 1] as number;
    stacks.push({ creature, count: rng.int(1, maxCount) });
  }
  return {
    hero: withHero ? { attack: rng.int(0, 6), defense: rng.int(0, 6) } : null,
    defenseBonus: rng.chance(0.2) ? 2 : 0,
    stacks,
  };
}
