/**
 * Players, the tavern and the temporary named-hero roster (RULES_V2 5.1,
 * 5.4, 5.9).
 *
 * The roster is a stand-in built from the existing Chieftain class so that
 * hiring, the pool and retreat can be played now. Bead bzc.11 replaces
 * {@link HERO_ROSTER} with each faction's named heroes (at least four per
 * class); the rules read only `id`, `name` and `heroClass`.
 */
import type { FactionId } from "./types.ts";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
/** Heroes a player may have on the map (RULES_V2 5.1). */
export const MAX_HEROES = 8;
/** Tavern hire price in gold (RULES_V2 5.4). */
export const HIRE_COST = 2500;
/** Heroes on each player's tavern offer. */
export const TAVERN_OFFER_SIZE = 2;
/** Weekly refreshes a retreated hero stays on its owner's offer. */
export const RETREAT_OFFER_REFRESHES = 2;
/** Days without a town that eliminate a player (RULES_V2 5.9). */
export const TOWNLESS_DAYS_LIMIT = 7;
/** Artifacts a hero can hold: 11 worn plus a 12-slot backpack (RULES_V2 4.1). */
export const ARTIFACT_CAPACITY = 23;

export interface PlayerColourDef {
  id: string;
  name: string;
  /** Flag colour on the map and in the interface. */
  hex: string;
}

/** Player colours by player index. */
export const PLAYER_COLOURS: readonly PlayerColourDef[] = [
  { id: "red", name: "Red", hex: "#d8402f" },
  { id: "blue", name: "Blue", hex: "#3a6fd8" },
  { id: "green", name: "Green", hex: "#3fa34a" },
  { id: "purple", name: "Purple", hex: "#9a4fc9" },
];

export function playerColour(index: number): PlayerColourDef {
  return (
    PLAYER_COLOURS[index % PLAYER_COLOURS.length] ??
    (PLAYER_COLOURS[0] as PlayerColourDef)
  );
}

/** A named hero that can be on the map or in the pool. */
export interface HeroDef {
  id: string;
  name: string;
  /** Hero class id (src/data/hero.ts). */
  heroClass: string;
  faction: FactionId;
}

const CHIEFTAIN_NAMES = [
  "Grok",
  "Ula",
  "Tharn",
  "Mogra",
  "Bresha",
  "Kael",
  "Dura",
  "Rurik",
  "Ysra",
  "Hagg",
  "Orla",
  "Brak",
  "Senn",
  "Varga",
  "Tusk",
  "Imra",
];

/** Temporary roster: sixteen named Chieftains (enough for four players). */
export const HERO_ROSTER: readonly HeroDef[] = CHIEFTAIN_NAMES.map((name) => ({
  id: name.toLowerCase(),
  name,
  heroClass: "chieftain",
  faction: "lost-world",
}));

export function findHeroDef(id: string): HeroDef | undefined {
  return HERO_ROSTER.find((h) => h.id === id);
}
