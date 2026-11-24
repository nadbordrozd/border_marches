/**
 * Factions and their towns: the registry the new-game setup, the town rules
 * and the hero pool read (RULES_V2 5.1, 5.5).
 *
 * Each playable faction supplies a {@link TownTreeDef} (its buildings in
 * display order, start buildings, dwellings, halls and fort levels), its
 * hero classes and town names. The Lost World is the first data set; the
 * Humans, Undead and Goblins are placeholders (`town: null`) until bead
 * bzc.11 adds their rosters, trees, classes and named heroes.
 */
import { BUILDING_IDS, BUILDINGS } from "./buildings.ts";
import type {
  BuildingDef,
  BuildingId,
  CreatureId,
  FactionId,
} from "./types.ts";

/** A faction's town: the building tree and what a neutral town holds. */
export interface TownTreeDef {
  /** Every building of the tree, keyed by id. */
  buildings: Readonly<Record<BuildingId, BuildingDef>>;
  /** Display order (halls, fort, economy, dwellings by tier). */
  order: readonly BuildingId[];
  /** Garrison of a neutral town of this faction (RULES_V2 5.5). */
  neutralGarrison: ReadonlyArray<{ creature: CreatureId; count: number }>;
  /** Names given to towns of this faction, in order of use. */
  townNames: readonly string[];
  /** Town art family in the asset manifest (TOWN_ASSETS faction). */
  art: string;
}

export interface FactionDef {
  id: FactionId;
  name: string;
  /** One line for the setup screen. */
  blurb: string;
  /** False for placeholders: listed in setup, not selectable yet. */
  available: boolean;
  /** Hero class ids (src/data/hero.ts); the first is the default. */
  heroClasses: readonly string[];
  town: TownTreeDef | null;
}

export const LOST_WORLD_TOWN: TownTreeDef = {
  buildings: BUILDINGS,
  order: BUILDING_IDS,
  neutralGarrison: [
    { creature: "caveman", count: 24 },
    { creature: "spitter", count: 8 },
  ],
  townNames: ["Stonejaw", "Ashfern", "Gorehollow", "Tuskridge", "Emberfen"],
  art: "dinosaur",
};

export const FACTIONS: readonly FactionDef[] = [
  {
    id: "lost-world",
    name: "Lost World",
    blurb: "Cavemen, spitters and great beasts of the jungle.",
    available: true,
    heroClasses: ["chieftain"],
    town: LOST_WORLD_TOWN,
  },
  {
    id: "humans",
    name: "Humans",
    blurb: "Coming soon: knights, crossbows and holy orders.",
    available: false,
    heroClasses: [],
    town: null,
  },
  {
    id: "undead",
    name: "Undead",
    blurb: "Coming soon: the restless dead and their necromancers.",
    available: false,
    heroClasses: [],
    town: null,
  },
  {
    id: "goblins",
    name: "Goblins",
    blurb: "Coming soon: wolf riders, bombs and loud machines.",
    available: false,
    heroClasses: [],
    town: null,
  },
];

/** The faction record, or undefined for "neutral" and unknown ids. */
export function findFaction(id: string): FactionDef | undefined {
  return FACTIONS.find((f) => f.id === id);
}

/** Factions a player may pick now. */
export function playableFactions(): FactionDef[] {
  return FACTIONS.filter((f) => f.available && f.town !== null);
}

/** The faction's town tree, or undefined when it has none (yet). */
export function townTree(faction: string): TownTreeDef | undefined {
  return findFaction(faction)?.town ?? undefined;
}

/** A building of a faction's tree, or undefined. */
export function buildingDef(
  faction: string,
  building: BuildingId,
): BuildingDef | undefined {
  const tree = townTree(faction);
  if (tree === undefined || !Object.hasOwn(tree.buildings, building)) {
    return undefined;
  }
  return tree.buildings[building];
}

/** Defense bonus of each fort level (RULES_V2 5.5). */
export const FORT_DEFENSE: readonly number[] = [0, 2, 4, 6];

/** Tower Harm at fort level 3: 20 + 10 x dwellings built (RULES_V2 5.5). */
export const TOWER_BASE_HARM = 20;
export const TOWER_HARM_PER_DWELLING = 10;
