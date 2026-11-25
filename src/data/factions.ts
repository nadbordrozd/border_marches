/**
 * Factions and their towns: the registry the new-game setup, the town rules
 * and the hero pool read (RULES_V2 5.1, 5.5).
 *
 * Each faction supplies a {@link TownTreeDef} (its buildings in display
 * order, start buildings, dwellings, halls and fort levels), its hero
 * classes, town names, birthright and magic leanings. The v0.2 factions
 * are the Realm (humans), the Restless (undead) and the Goblin Horde
 * (goblins); the Lost World stays in the code and is not playable.
 */
import { BUILDING_IDS, BUILDINGS } from "./buildings.ts";
import { CHURCHYARD_TREE, REALM_TREE, WARCAMP_TREE } from "./factionTowns.ts";
import type { School } from "../core/battle/types.ts";
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

/**
 * A faction's birthright (RULES_V2 3.8): an ability every native stack
 * gains at deployment, and/or a battle-start effect run for its army.
 */
export interface BirthrightDef {
  name: string;
  text: string;
  ability?: string;
  startRule?: string;
}

export interface FactionDef {
  id: FactionId;
  name: string;
  /** One line for the setup screen. */
  blurb: string;
  /** False for factions that cannot be picked in setup. */
  available: boolean;
  /** Hero class ids (src/data/hero.ts); the first is the default. */
  heroClasses: readonly string[];
  town: TownTreeDef | null;
  /** Flag colour of the faction (the faction document). */
  colour?: string;
  birthright?: BirthrightDef;
  /** Magic school weights 0..4 (RULES_V2 2.9) and the guild cap. */
  schools?: Readonly<Record<School, number>>;
  guildCap?: number;
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

export const REALM_TOWN: TownTreeDef = {
  ...REALM_TREE,
  neutralGarrison: [
    { creature: "squire", count: 20 },
    { creature: "longbowman", count: 8 },
  ],
  townNames: ["Oathmere", "Kingsbridge", "Lancefold", "Brightwater", "Tilting"],
  // The MVP camp family, a fallback only: v0.2 towns draw townArt (bzc.15).
  art: "dinosaur",
};

export const CHURCHYARD_TOWN: TownTreeDef = {
  ...CHURCHYARD_TREE,
  neutralGarrison: [
    { creature: "skeleton", count: 24 },
    { creature: "ghoul", count: 8 },
  ],
  townNames: [
    "Lychgate",
    "Mourning Hill",
    "Yewdown",
    "Saint Elsewhere",
    "Gloam",
  ],
  // The MVP camp family, a fallback only: v0.2 towns draw townArt (bzc.15).
  art: "goblin",
};

export const WARCAMP_TOWN: TownTreeDef = {
  ...WARCAMP_TREE,
  neutralGarrison: [
    { creature: "goblin", count: 30 },
    { creature: "bomb-chucker", count: 8 },
  ],
  townNames: ["Grabbit", "Snotgully", "Boomtown", "Krak's Heap", "Muckmire"],
  art: "goblin",
};

export const FACTIONS: readonly FactionDef[] = [
  {
    id: "humans",
    name: "The Realm",
    blurb:
      "Storybook chivalry: Sworn pairs swap places and share every heal; knights charge, longbows cover.",
    available: true,
    heroClasses: ["knight-errant", "enchanter"],
    town: REALM_TOWN,
    colour: "#2f6fd0",
    birthright: {
      name: "Sworn",
      text: "Native stacks deploy linked in pairs (slot order): each Heal is shared, and a stack may swap hexes with its partner in place of its walk.",
      startRule: "birthright:sworn",
    },
    schools: { bloom: 3, accord: 4, clock: 2, hush: 0, storm: 1 },
    guildCap: 4,
  },
  {
    id: "undead",
    name: "The Restless",
    blurb:
      "Graveyard comedy: a dead stack gets up once with a third of its count; bones feed ghouls, banshees and kings.",
    available: true,
    heroClasses: ["revenant", "mortician"],
    town: CHURCHYARD_TOWN,
    colour: "#7a4fb5",
    birthright: {
      name: "Not Done Yet",
      text: "A dead native stack that leaves remains gets up at the next round start with a third of its starting count, once per battle; it crumbles after the battle.",
      ability: "not-done-yet",
    },
    schools: { bloom: 0, accord: 1, clock: 3, hush: 4, storm: 2 },
    guildCap: 5,
  },
  {
    id: "goblins",
    name: "The Goblin Horde",
    blurb:
      "Throw things, mostly each other: natives are Launched by their own blasts and land on someone.",
    available: true,
    heroClasses: ["warlord", "weatherwitch"],
    town: WARCAMP_TOWN,
    colour: "#5fa52a",
    birthright: {
      name: "Launched",
      text: "Natives caught in their own side's area effects take nothing and are pushed 3 hexes away from the centre.",
      ability: "launched",
    },
    schools: { bloom: 4, accord: 0, clock: 1, hush: 2, storm: 3 },
    guildCap: 3,
  },
  {
    id: "lost-world",
    name: "Lost World",
    blurb:
      "Cavemen, spitters and great beasts of the jungle (MVP; not in v0.2).",
    available: false,
    heroClasses: ["chieftain"],
    town: LOST_WORLD_TOWN,
  },
];

/** The faction record, or undefined for "neutral" and unknown ids. */
export function findFaction(id: string): FactionDef | undefined {
  return FACTIONS.find((f) => f.id === id);
}

/** The faction's birthright, if any. */
export function birthrightOf(faction: string): BirthrightDef | undefined {
  return findFaction(faction)?.birthright;
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
