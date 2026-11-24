/**
 * Players, the tavern and the named-hero roster (RULES_V2 5.1, 5.4, 5.9).
 *
 * The roster is the 24 named heroes of the v0.2 factions (four per class,
 * src/data/classes.ts) followed by sixteen Lost World Chieftains,
 * which only join a game's pool when a player plays the Lost World.
 */
import { NAMED_HEROES } from "./classes.ts";
import type { Specialty } from "./classes.ts";
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
  /** One specialty of RULES_V2 3.7 (src/data/classes.ts). */
  specialty?: Specialty;
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

/**
 * Chieftain specialties, cycling the five forms of RULES_V2 3.7 over the
 * Lost World creatures and skills (an orchestrator call for the stand-in
 * roster; bead bzc.11 brings the factions' named heroes).
 */
const CHIEFTAIN_SPECIALTIES: readonly Specialty[] = [
  { kind: "creature", creature: "caveman" },
  { kind: "skill", skill: "wayfaring", replaces: "trailcraft" },
  { kind: "resource", resource: "gold" },
  { kind: "command" },
  { kind: "creature", creature: "raptor" },
  { kind: "skill", skill: "bulwark", replaces: "onslaught" },
  { kind: "resource", resource: "wood-ore" },
  { kind: "creature", creature: "spitter" },
  { kind: "skill", skill: "banner", replaces: "trailcraft" },
  { kind: "resource", resource: "essence" },
  { kind: "creature", creature: "triceratops" },
  { kind: "skill", skill: "stewardship", replaces: "trailcraft" },
  { kind: "command" },
  { kind: "creature", creature: "shaman" },
  { kind: "skill", skill: "lookout", replaces: "trailcraft" },
  { kind: "creature", creature: "t-rex" },
];

/** The Lost World's sixteen Chieftains (not playable in v0.2). */
export const CHIEFTAIN_ROSTER: readonly HeroDef[] = CHIEFTAIN_NAMES.map(
  (name, i) => ({
    id: name.toLowerCase(),
    name,
    heroClass: "chieftain",
    faction: "lost-world",
    specialty: CHIEFTAIN_SPECIALTIES[
      i % CHIEFTAIN_SPECIALTIES.length
    ] as Specialty,
  }),
);

/**
 * Every named hero: the 24 of the v0.2 factions (four per class,
 * src/data/classes.ts), then the Lost World's Chieftains.
 */
export const HERO_ROSTER: readonly HeroDef[] = [
  ...NAMED_HEROES,
  ...CHIEFTAIN_ROSTER,
];

/**
 * The pool of a new game: every v0.2 hero, and the Chieftains only when a
 * player plays the Lost World.
 */
export function rosterFor(factions: readonly FactionId[]): string[] {
  const lostWorld = factions.includes("lost-world");
  return HERO_ROSTER.filter((h) => h.faction !== "lost-world" || lostWorld).map(
    (h) => h.id,
  );
}

export function findHeroDef(id: string): HeroDef | undefined {
  return HERO_ROSTER.find((h) => h.id === id);
}
