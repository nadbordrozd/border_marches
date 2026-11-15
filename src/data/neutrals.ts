/**
 * Neutral monsters: the roster, guard sizing rings and the Warlord's Hold
 * garrison (GAME_DESIGN.md section 8).
 */
import type { CreatureDef, CreatureId, NeutralCreatureId } from "./types.ts";

function neutral(
  def: Omit<CreatureDef, "faction" | "growth" | "cost">,
): CreatureDef {
  return { ...def, faction: "neutral", growth: 0, cost: {} };
}

export const NEUTRAL_CREATURES: Readonly<
  Record<NeutralCreatureId, CreatureDef>
> = {
  goblin: neutral({
    id: "goblin",
    name: "Goblin",
    plural: "Goblins",
    tier: 1,
    hp: 8,
    attack: 4,
    defense: 2,
    damage: 2,
    speed: 5,
    shots: 0,
    ability: null,
    fightValue: 52,
    sprite: "goblin-goblin",
  }),
  skeleton: neutral({
    id: "skeleton",
    name: "Skeleton",
    plural: "Skeletons",
    tier: 1,
    hp: 9,
    attack: 5,
    defense: 4,
    damage: 2,
    speed: 4,
    shots: 0,
    ability: "bony",
    fightValue: 62,
    sprite: "undead-skeleton",
  }),
  "bomb-chucker": neutral({
    id: "bomb-chucker",
    name: "Bomb Chucker",
    plural: "Bomb Chuckers",
    tier: 2,
    hp: 12,
    attack: 6,
    defense: 3,
    damage: 3,
    speed: 4,
    shots: 8,
    ability: null,
    fightValue: 109,
    sprite: "goblin-bomb-chucker",
  }),
  "wolf-rider": neutral({
    id: "wolf-rider",
    name: "Wolf Rider",
    plural: "Wolf Riders",
    tier: 2,
    hp: 18,
    attack: 7,
    defense: 5,
    damage: 4,
    speed: 8,
    shots: 0,
    ability: null,
    fightValue: 136,
    sprite: "goblin-wolf-rider",
  }),
  "orc-brute": neutral({
    id: "orc-brute",
    name: "Orc Brute",
    plural: "Orc Brutes",
    tier: 3,
    hp: 28,
    attack: 9,
    defense: 6,
    damage: 6,
    speed: 4,
    shots: 0,
    ability: null,
    fightValue: 227,
    sprite: "goblin-orc-brute",
  }),
  troll: neutral({
    id: "troll",
    name: "Troll",
    plural: "Trolls",
    tier: 4,
    hp: 50,
    attack: 11,
    defense: 9,
    damage: 10,
    speed: 5,
    shots: 0,
    ability: "regenerate",
    fightValue: 447,
    sprite: "goblin-troll",
  }),
  ogre: neutral({
    id: "ogre",
    name: "Ogre",
    plural: "Ogres",
    tier: 5,
    hp: 90,
    attack: 14,
    defense: 12,
    damage: 16,
    speed: 4,
    shots: 0,
    ability: null,
    fightValue: 873,
    sprite: "goblin-ogre",
  }),
  "orc-warboss": neutral({
    id: "orc-warboss",
    name: "Orc Warboss",
    plural: "Orc Warbosses",
    tier: 6,
    hp: 140,
    attack: 17,
    defense: 15,
    damage: 30,
    speed: 6,
    shots: 0,
    ability: "warcry",
    fightValue: 1685,
    sprite: "goblin-orc-warboss",
  }),
};

export const NEUTRAL_CREATURE_IDS: readonly NeutralCreatureId[] = [
  "goblin",
  "skeleton",
  "bomb-chucker",
  "wolf-rider",
  "orc-brute",
  "troll",
  "ogre",
  "orc-warboss",
];

/** A guard ring: distance band from the player's town and target guard FV. */
export interface GuardRing {
  ring: number;
  /** Movement-cost distance band (exclusive min, inclusive max). */
  minDistance: number;
  maxDistance: number;
  minFightValue: number;
  maxFightValue: number;
}

/** GAME_DESIGN.md section 8.3. Distances are movement points (1 day = 1500). */
export const GUARD_RINGS: readonly GuardRing[] = [
  {
    ring: 0,
    minDistance: 0,
    maxDistance: 1500,
    minFightValue: 600,
    maxFightValue: 1200,
  },
  {
    ring: 1,
    minDistance: 1500,
    maxDistance: 3000,
    minFightValue: 1200,
    maxFightValue: 3000,
  },
  {
    ring: 2,
    minDistance: 3000,
    maxDistance: 6000,
    minFightValue: 3000,
    maxFightValue: 8000,
  },
  {
    ring: 3,
    minDistance: 6000,
    maxDistance: Number.POSITIVE_INFINITY,
    minFightValue: 8000,
    maxFightValue: 16000,
  },
];

/** A neutral stack in battle is deployed as at most this many stacks. */
export const NEUTRAL_MAX_BATTLE_STACKS = 3;

export interface GarrisonStack {
  creature: CreatureId;
  count: number;
}

/** The Warlord's Hold garrison (GAME_DESIGN.md section 8.4), in slot order. */
export const HOLD_GARRISON: readonly GarrisonStack[] = [
  { creature: "orc-warboss", count: 4 },
  { creature: "ogre", count: 8 },
  { creature: "troll", count: 14 },
  { creature: "orc-brute", count: 30 },
  { creature: "bomb-chucker", count: 30 },
];

/** The fortified Hold gives its defenders +2 Defense (like a Palisade). */
export const HOLD_DEFENSE_BONUS = 2;

/** Display name of the neutral goblin town. */
export const HOLD_NAME = "Warlord's Hold";
