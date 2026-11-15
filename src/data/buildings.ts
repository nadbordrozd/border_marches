/**
 * Lost World town buildings (FACTION_LOST_WORLD.md section 6).
 */
import type { BuildingDef, BuildingId, CreatureId } from "./types.ts";

export const BUILDINGS: Readonly<Record<BuildingId, BuildingDef>> = {
  "village-hall": {
    id: "village-hall",
    name: "Village Hall",
    cost: {},
    requires: [],
    startBuilt: true,
    hallIncome: 500,
    effect: "Income 500 gold per day",
  },
  "town-hall": {
    id: "town-hall",
    name: "Town Hall",
    cost: { gold: 2500, wood: 5, ore: 2 },
    requires: [],
    startBuilt: false,
    hallIncome: 1000,
    effect: "Income 1000 gold per day (replaces the Village Hall)",
  },
  "city-hall": {
    id: "city-hall",
    name: "City Hall",
    cost: { gold: 5000, wood: 10, ore: 5, essence: 3 },
    requires: ["town-hall", "palisade"],
    startBuilt: false,
    hallIncome: 2000,
    effect: "Income 2000 gold per day (replaces the Town Hall)",
  },
  palisade: {
    id: "palisade",
    name: "Palisade",
    cost: { gold: 2000, wood: 15 },
    requires: [],
    startBuilt: false,
    defenseBonus: 2,
    effect: "Needed for tier 3+ dwellings; town defenders get +2 Defense",
  },
  stockade: {
    id: "stockade",
    name: "Stockade",
    cost: { gold: 2500, wood: 5, ore: 5 },
    requires: ["palisade"],
    startBuilt: false,
    growthBonus: true,
    effect: "+50% creature growth",
  },
  marketplace: {
    id: "marketplace",
    name: "Marketplace",
    cost: { gold: 500, wood: 5 },
    requires: [],
    startBuilt: false,
    marketplace: true,
    effect: "Trade resources at fixed rates",
  },
  "resource-silo": {
    id: "resource-silo",
    name: "Resource Silo",
    cost: { gold: 1500, ore: 5 },
    requires: ["marketplace"],
    startBuilt: false,
    income: { wood: 1, ore: 1 },
    effect: "+1 wood and +1 ore per day",
  },
  cave: {
    id: "cave",
    name: "Cave",
    cost: {},
    requires: [],
    startBuilt: true,
    dwelling: "caveman",
    effect: "Recruits Cavemen",
  },
  "spitter-nest": {
    id: "spitter-nest",
    name: "Spitter Nest",
    cost: { gold: 800, wood: 5, ore: 2 },
    requires: ["cave"],
    startBuilt: false,
    dwelling: "spitter",
    effect: "Recruits Spitters",
  },
  "raptor-pen": {
    id: "raptor-pen",
    name: "Raptor Pen",
    cost: { gold: 1200, wood: 10 },
    requires: ["palisade"],
    startBuilt: false,
    dwelling: "raptor",
    effect: "Recruits Raptors",
  },
  "spirit-lodge": {
    id: "spirit-lodge",
    name: "Spirit Lodge",
    cost: { gold: 2000, wood: 5, ore: 5, essence: 2 },
    requires: ["spitter-nest"],
    startBuilt: false,
    dwelling: "shaman",
    effect: "Recruits Shamans",
  },
  "horn-grounds": {
    id: "horn-grounds",
    name: "Horn Grounds",
    cost: { gold: 4000, wood: 10, ore: 10 },
    requires: ["raptor-pen"],
    startBuilt: false,
    dwelling: "triceratops",
    effect: "Recruits Triceratops",
  },
  "tyrants-lair": {
    id: "tyrants-lair",
    name: "Tyrant's Lair",
    cost: { gold: 8000, wood: 10, ore: 10, essence: 8 },
    requires: ["horn-grounds", "spirit-lodge"],
    startBuilt: false,
    dwelling: "t-rex",
    effect: "Recruits T-Rexes",
  },
};

/** Every building in display order (halls, fort, economy, dwellings by tier). */
export const BUILDING_IDS: readonly BuildingId[] = [
  "village-hall",
  "town-hall",
  "city-hall",
  "palisade",
  "stockade",
  "marketplace",
  "resource-silo",
  "cave",
  "spitter-nest",
  "raptor-pen",
  "spirit-lodge",
  "horn-grounds",
  "tyrants-lair",
];

export function isBuildingId(id: unknown): id is BuildingId {
  return typeof id === "string" && Object.hasOwn(BUILDINGS, id);
}

/** The dwelling building that recruits a creature, if any. */
export function dwellingFor(creature: CreatureId): BuildingId | undefined {
  return BUILDING_IDS.find((id) => BUILDINGS[id].dwelling === creature);
}
