/**
 * Town art lookups (bead border_marches-bzc.15, docs/art/classes/towns.md):
 * the 3x2 map sprite of a faction's town at a fort level, the town-screen
 * sprite of a building and the town-screen backdrop. Each lookup accepts
 * the game's faction ids ("humans", "undead", "goblins", "candy",
 * "lost-world") and the faction names ("realm", "restless", "horde",
 * "candy-kingdom"), and falls back instead of
 * throwing, so a faction or building without art never breaks a screen.
 */
import { TOWN_3X2_ASSETS, type Town3x2Asset } from "./manifest";
import {
  BUILDING_ART_ASSETS,
  FORT_BUILDINGS,
  KEYSTONE_BUILDINGS,
  TOWN_BACKDROP_ASSETS,
  type BuildingArtAsset,
  type TownArtFaction,
  type TownBackdropAsset,
} from "./town-buildings";

const TOWN_ART_FAMILY: Readonly<Record<string, Town3x2Asset["faction"]>> = {
  "lost-world": "dinosaur",
  dinosaur: "dinosaur",
  humans: "humans",
  realm: "humans",
  undead: "undead",
  restless: "undead",
  goblins: "goblin",
  goblin: "goblin",
  horde: "goblin",
  candy: "candy",
  "candy-kingdom": "candy",
};

const SCREEN_FACTION: Readonly<Record<string, TownArtFaction>> = {
  humans: "humans",
  realm: "humans",
  undead: "undead",
  restless: "undead",
  goblins: "goblins",
  goblin: "goblins",
  horde: "goblins",
  candy: "candy",
  "candy-kingdom": "candy",
};

/** The faction with town-screen art, or undefined (Lost World, neutral). */
export function townArtFaction(factionId: string): TownArtFaction | undefined {
  return SCREEN_FACTION[factionId.toLowerCase()];
}

/**
 * The 3x2 map sprite of a town: the faction's "camp" stage at fort level
 * 0-1 and its "fort" stage at 2-3. Falls back to the faction's other stage,
 * then to the Lost World town (unknown factions).
 */
export function townArt(factionId: string, fortLevel: number): Town3x2Asset {
  const family = TOWN_ART_FAMILY[factionId.toLowerCase()] ?? "dinosaur";
  const stage = fortLevel >= 2 ? "fort" : "camp";
  const own = TOWN_3X2_ASSETS.filter((t) => t.faction === family);
  const art =
    own.find((t) => t.stage === stage) ??
    own.find((t) => t.stage === "fort") ??
    own[0] ??
    TOWN_3X2_ASSETS[0];
  if (art === undefined) throw new Error("no 3x2 town art");
  return art;
}

/** "Squires' Hall", "squires_hall" or "SQUIRES-HALL" -> "squires-hall". */
export function normaliseBuildingId(id: string): string {
  return id
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The town-screen sprite of a building, or null when there is none (the
 * Lost World, neutral towns, unknown ids): the caller then shows no picture
 * or the dwelling's creature portrait. Accepts names as well as ids, every
 * Magic Guild level ("magic-guild-3"), the shared role ids "fort-1" to
 * "fort-3" and "keystone-hall".
 */
export function buildingArt(
  factionId: string,
  buildingId: string,
): BuildingArtAsset | null {
  const faction = townArtFaction(factionId);
  if (faction === undefined) return null;
  let id = normaliseBuildingId(buildingId);
  if (/^(magic-)?guild(-\d+)?$/.test(id)) id = "magic-guild";
  const fort = /^fort-?([123])$/.exec(id);
  if (fort !== null) id = FORT_BUILDINGS[faction][Number(fort[1]) - 1] ?? id;
  if (id === "keystone-hall" || id === "keystone")
    id = KEYSTONE_BUILDINGS[faction];
  return (
    BUILDING_ART_ASSETS.find(
      (b) => b.faction === faction && b.building === id,
    ) ?? null
  );
}

/** The town-screen backdrop of a faction, or null (Lost World, neutral). */
export function townBackdrop(factionId: string): TownBackdropAsset | null {
  const faction = townArtFaction(factionId);
  if (faction === undefined) return null;
  return TOWN_BACKDROP_ASSETS.find((b) => b.faction === faction) ?? null;
}
