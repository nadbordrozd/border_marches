/**
 * The Lost World roster (FACTION_LOST_WORLD.md section 2) and the lookup of
 * every creature in the game (faction creatures plus neutrals).
 */
import { FACTION_CREATURES } from "./factionCreatures.ts";
import { NEUTRAL_CREATURES } from "./neutrals.ts";
import type { CreatureDef, CreatureId, LostWorldCreatureId } from "./types.ts";

export const LOST_WORLD_CREATURES: Readonly<
  Record<LostWorldCreatureId, CreatureDef>
> = {
  caveman: {
    id: "caveman",
    name: "Caveman",
    plural: "Cavemen",
    faction: "lost-world",
    tier: 1,
    hp: 10,
    attack: 4,
    defense: 3,
    damage: 2,
    speed: 4,
    shots: 0,
    ability: "mob",
    growth: 14,
    cost: { gold: 50 },
    fightValue: 60,
    sprite: "dinosaur-caveman",
  },
  spitter: {
    id: "spitter",
    name: "Spitter",
    plural: "Spitters",
    faction: "lost-world",
    tier: 2,
    hp: 14,
    attack: 6,
    defense: 4,
    damage: 3,
    speed: 5,
    shots: 10,
    ability: "venom",
    growth: 9,
    cost: { gold: 110 },
    fightValue: 122,
    sprite: "dinosaur-spitter",
  },
  raptor: {
    id: "raptor",
    name: "Raptor",
    plural: "Raptors",
    faction: "lost-world",
    tier: 3,
    hp: 22,
    attack: 8,
    defense: 5,
    damage: 5,
    speed: 9,
    shots: 0,
    ability: "pack-hunter",
    growth: 7,
    cost: { gold: 220 },
    fightValue: 173,
    sprite: "dinosaur-raptor",
  },
  shaman: {
    id: "shaman",
    name: "Shaman",
    plural: "Shamans",
    faction: "lost-world",
    tier: 4,
    hp: 35,
    attack: 9,
    defense: 8,
    damage: 8,
    speed: 5,
    shots: 6,
    ability: "war-drums",
    growth: 4,
    cost: { gold: 450, essence: 1 },
    fightValue: 387,
    sprite: "dinosaur-shaman",
  },
  triceratops: {
    id: "triceratops",
    name: "Triceratops",
    plural: "Triceratops",
    faction: "lost-world",
    tier: 5,
    hp: 80,
    attack: 13,
    defense: 16,
    damage: 15,
    speed: 5,
    shots: 0,
    ability: "charge",
    growth: 2,
    cost: { gold: 1100, ore: 2 },
    fightValue: 849,
    sprite: "dinosaur-triceratops",
  },
  "t-rex": {
    id: "t-rex",
    name: "T-Rex",
    plural: "T-Rexes",
    faction: "lost-world",
    tier: 6,
    hp: 200,
    attack: 20,
    defense: 16,
    damage: 40,
    speed: 8,
    shots: 0,
    ability: "terror",
    growth: 1,
    cost: { gold: 3000, ore: 4, essence: 2 },
    fightValue: 2504,
    sprite: "dinosaur-t-rex",
  },
};

/** Lost World creatures in tier order. */
export const LOST_WORLD_CREATURE_IDS: readonly LostWorldCreatureId[] = [
  "caveman",
  "spitter",
  "raptor",
  "shaman",
  "triceratops",
  "t-rex",
];

/** Every creature in the game, by id. */
export const CREATURES: Readonly<Record<CreatureId, CreatureDef>> = {
  ...LOST_WORLD_CREATURES,
  ...NEUTRAL_CREATURES,
  ...(FACTION_CREATURES as Record<string, CreatureDef>),
} as Readonly<Record<CreatureId, CreatureDef>>;

/** A creature's battle ability ids (its `abilities`, or its MVP ability). */
export function creatureAbilities(def: CreatureDef): readonly string[] {
  return def.abilities ?? (def.ability === null ? [] : [def.ability]);
}

export function isCreatureId(id: unknown): id is CreatureId {
  return typeof id === "string" && Object.hasOwn(CREATURES, id);
}

/** The creature with this id; throws on an unknown id. */
export function getCreature(id: string): CreatureDef {
  if (!isCreatureId(id)) throw new Error(`unknown creature "${id}"`);
  return CREATURES[id];
}

/** Whether the creature shoots (has shots). */
export function isRanged(def: CreatureDef): boolean {
  return def.shots > 0;
}
