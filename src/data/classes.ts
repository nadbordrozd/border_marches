/**
 * Hero classes, Commands and specialties: the one data module for them
 * (RULES_V2 3.1, 3.3, 3.6, 3.7; FACTION_HUMANS/UNDEAD/GOBLINS/CANDY/
 * DWARVES.md section 7).
 *
 * Each class has starting stats (sum 6, Power and Lore at least 1), a
 * ten-entry stat pattern (level L uses entry (L - 2) mod 10), skill offer
 * weights (0 to 10), two starting skills, an optional starting page, a
 * Command, a native terrain and a starting army.
 *
 * Skill weights: the faction documents name the taxonomy kinds; this file
 * maps them onto the CONTENT_HEROES skill ids (Bloom -> Greencraft,
 * Offence -> Onslaught, Armour -> Bulwark, Archery -> Marksmanship,
 * Standards -> Long Shadow, Tactics -> Vanguard, Leadership -> Banner,
 * Fortune -> Lucky Streak, Captaincy -> Drill Sergeant, Omens -> Ambush,
 * Logistics -> Wayfaring, Pathfinding -> Trailcraft, Scouting -> Lookout,
 * Wellspring -> Deep Wells, Learning -> Quick Study, Estates ->
 * Stewardship, Scrollcraft -> Packrat). Silver Tongue covers both Parley
 * and Mustering and takes the larger weight; Wayfinder, which no faction
 * table lists, takes CONTENT_HEROES' default (might 2, magic 6).
 *
 * The v0.2 starting armies and the 40 named heroes ({@link NAMED_HEROES},
 * four per class with their specialties) are the faction documents'
 * (sections 7 and 8; beads bzc.11 and, for the Candy Kingdom, bzc.111;
 * for the Deepforge, bzc.130).
 */
import type { Terrain } from "../core/map/types.ts";
import type { PrimaryStat } from "./effects.ts";
import type { SkillId } from "./skills.ts";
import type { CreatureId, FactionId } from "./types.ts";

export interface ClassStats {
  attack: number;
  defense: number;
  power: number;
  lore: number;
}

export interface HeroClassDef {
  id: string;
  name: string;
  faction: FactionId;
  /** Might or magic (RULES_V2 3.6). */
  leaning: "might" | "magic";
  /** Terrain this class crosses at 100 per straight step. */
  nativeTerrain: Terrain;
  /** Starting primary stats: sum 6, Power and Lore at least 1. */
  stats: ClassStats;
  /** Ten stats; reaching level L adds entry (L - 2) mod 10. */
  pattern: readonly PrimaryStat[];
  /** Offer weight per skill, 0 to 10; a missing skill weighs 0. */
  weights: Readonly<Partial<Record<SkillId, number>>>;
  /** Two skills at rank 1. */
  startingSkills: readonly SkillId[];
  /** A magic class's tier 1 page of its school (spell id, bead bzc.9). */
  startingPage?: string;
  /** The class's Command (COMMANDS id). */
  command: string;
  startingArmy: ReadonlyArray<{ creature: CreatureId; count: number }>;
  /** Map sprite key. */
  sprite: string;
  /** Portrait image key for the interface. */
  portrait: string;
}

/** A Command (RULES_V2 3.7): once per battle, scales with C. */
export interface CommandDef {
  id: string;
  name: string;
  /** The rule, using C = 1 + floor(level / 5). */
  text: string;
}

export const COMMANDS: Readonly<Record<string, CommandDef>> = {
  stampede: {
    id: "stampede",
    name: "Stampede",
    text: "Pick an enemy stack. Up to C + 1 of your stacks next to it each Strike it in melee, in turn order; it retaliates only once.",
  },
  "single-combat": {
    id: "single-combat",
    name: "Single Combat",
    text: "Pick one of your stacks and an enemy stack. The enemy is Challenged by yours for C + 1 rounds (at most 3): its Strikes on anyone else do half damage.",
  },
  "swear-in": {
    id: "swear-in",
    name: "Swear In",
    text: "Up to C times: pick two stacks, friend or foe, that are not Sworn. They become Sworn to each other.",
  },
  "one-more-time": {
    id: "one-more-time",
    name: "One More Time",
    text: "Pick up to C of your stacks that were not summoned. The next time each one dies and leaves remains, it gets up again.",
  },
  "last-rites": {
    id: "last-rites",
    name: "Last Rites",
    text: "Pick remains on the field and use them up. Every enemy stack within C hexes of them becomes Shaken and Jinxed 25 for 2 rounds.",
  },
  "heave-ho": {
    id: "heave-ho",
    name: "Heave-Ho",
    text: "Up to C + 1 times: pick one of your stacks and a hex in a straight line from it. The stack is pushed 4 hexes toward that hex.",
  },
  kaboom: {
    id: "kaboom",
    name: "Kaboom",
    text: "Pick a hex. Every stack on it or next to it, friend or foe, takes 30 x C Harm.",
  },
  crack: {
    id: "crack",
    name: "Crack!",
    text: "Pick an enemy stack that is Stuck. Up to C + 1 of your stacks next to it each Strike it in melee, in turn order; it retaliates only once.",
  },
  "come-in-dear": {
    id: "come-in-dear",
    name: "Come In, Dear",
    text: "Pick an enemy stack and one of your stacks within C + 4 hexes of it. The enemy is pulled toward yours until it is next to it, and becomes Stuck for 2 rounds.",
  },
  "ramming-speed": {
    id: "ramming-speed",
    name: "Ramming Speed",
    text: "Pick one of your stacks and an enemy in a straight line at most 4 + C hexes away. Yours is pushed toward it until it stops; if it stops next to it, it Strikes it in melee, not retaliated.",
  },
  // FACTION_DWARVES 7's Overpressure: the id keeps the document's word;
  // the name fits the action bar's 11-character line (bead bzc.130).
  overpressure: {
    id: "overpressure",
    name: "Blow Off Steam",
    text: "Pick a stack with Steam. Its Steam ends, and every other stack next to it, friend or foe, takes Harm of 15 x C per point of that Steam.",
  },
};

/** The faction tables' 24 kinds, in the documents' order. */
interface KindWeights {
  bloom: number;
  accord: number;
  clock: number;
  hush: number;
  storm: number;
  offence: number;
  armour: number;
  archery: number;
  riposte: number;
  standards: number;
  tactics: number;
  leadership: number;
  fortune: number;
  captaincy: number;
  omens: number;
  logistics: number;
  pathfinding: number;
  scouting: number;
  wellspring: number;
  learning: number;
  estates: number;
  mustering: number;
  parley: number;
  scrollcraft: number;
}

/** Faction-table weights as skill-id weights (see the file comment). */
function weightsFromKinds(
  k: KindWeights,
  wayfinder: number,
): Partial<Record<SkillId, number>> {
  return {
    greencraft: k.bloom,
    covenant: k.accord,
    horology: k.clock,
    quietus: k.hush,
    stormcalling: k.storm,
    onslaught: k.offence,
    bulwark: k.armour,
    marksmanship: k.archery,
    riposte: k.riposte,
    "long-shadow": k.standards,
    vanguard: k.tactics,
    banner: k.leadership,
    "lucky-streak": k.fortune,
    "drill-sergeant": k.captaincy,
    ambush: k.omens,
    wayfaring: k.logistics,
    trailcraft: k.pathfinding,
    lookout: k.scouting,
    "deep-wells": k.wellspring,
    "quick-study": k.learning,
    stewardship: k.estates,
    "silver-tongue": Math.max(k.parley, k.mustering),
    packrat: k.scrollcraft,
    wayfinder,
  };
}

const A = "attack";
const D = "defense";
const P = "power";
const L = "lore";

export const CHIEFTAIN: HeroClassDef = {
  id: "chieftain",
  name: "Chieftain",
  faction: "lost-world",
  leaning: "might",
  nativeTerrain: "jungle",
  // MVP Attack 2 and Defense 2, plus the v2 minimum of Power 1 and Lore 1.
  stats: { attack: 2, defense: 2, power: 1, lore: 1 },
  pattern: [A, D, A, P, D, A, L, D, A, P],
  // CONTENT_HEROES' default might weights.
  weights: weightsFromKinds(
    {
      bloom: 2,
      accord: 2,
      clock: 2,
      hush: 2,
      storm: 2,
      offence: 8,
      armour: 8,
      archery: 6,
      riposte: 5,
      standards: 4,
      tactics: 6,
      leadership: 7,
      fortune: 5,
      captaincy: 6,
      omens: 5,
      logistics: 7,
      pathfinding: 5,
      scouting: 4,
      wellspring: 1,
      learning: 4,
      estates: 5,
      mustering: 4,
      parley: 4,
      scrollcraft: 3,
    },
    2,
  ),
  startingSkills: ["onslaught", "trailcraft"],
  command: "stampede",
  startingArmy: [
    { creature: "caveman", count: 18 },
    { creature: "spitter", count: 6 },
  ],
  sprite: "hero-chieftain",
  portrait: "portrait-dinosaur-chieftain",
};

/** Knight Errant (FACTION_HUMANS 7). Army: 16 Squires, 7 Longbowmen. */
export const KNIGHT_ERRANT: HeroClassDef = {
  id: "knight-errant",
  name: "Knight Errant",
  faction: "humans",
  leaning: "might",
  nativeTerrain: "grass",
  stats: { attack: 2, defense: 2, power: 1, lore: 1 },
  pattern: [D, A, D, P, A, D, L, A, D, L],
  weights: weightsFromKinds(
    {
      bloom: 2,
      accord: 3,
      clock: 1,
      hush: 0,
      storm: 1,
      offence: 6,
      armour: 8,
      archery: 5,
      riposte: 6,
      standards: 6,
      tactics: 6,
      leadership: 10,
      fortune: 4,
      captaincy: 6,
      omens: 2,
      logistics: 6,
      pathfinding: 4,
      scouting: 3,
      wellspring: 1,
      learning: 3,
      estates: 6,
      mustering: 5,
      parley: 5,
      scrollcraft: 2,
    },
    2,
  ),
  startingSkills: ["banner", "bulwark"],
  command: "single-combat",
  startingArmy: [
    { creature: "squire", count: 16 },
    { creature: "longbowman", count: 7 },
  ],
  sprite: "hero-knight-errant",
  portrait: "portrait-hero-knight-errant",
};

/** Enchanter (FACTION_HUMANS 7). Army: 12 Squires, 5 Longbowmen, 2 Friars. */
export const ENCHANTER: HeroClassDef = {
  id: "enchanter",
  name: "Enchanter",
  faction: "humans",
  leaning: "magic",
  nativeTerrain: "grass",
  stats: { attack: 1, defense: 1, power: 2, lore: 2 },
  pattern: [P, L, P, D, L, P, A, L, P, D],
  weights: weightsFromKinds(
    {
      bloom: 10,
      accord: 7,
      clock: 5,
      hush: 1,
      storm: 2,
      offence: 2,
      armour: 4,
      archery: 4,
      riposte: 2,
      standards: 6,
      tactics: 3,
      leadership: 6,
      fortune: 4,
      captaincy: 4,
      omens: 5,
      logistics: 4,
      pathfinding: 3,
      scouting: 3,
      wellspring: 8,
      learning: 5,
      estates: 4,
      mustering: 3,
      parley: 6,
      scrollcraft: 5,
    },
    6,
  ),
  startingSkills: ["greencraft", "deep-wells"],
  startingPage: "mend",
  command: "swear-in",
  startingArmy: [
    { creature: "squire", count: 12 },
    { creature: "longbowman", count: 5 },
    { creature: "friar", count: 2 },
  ],
  sprite: "hero-enchanter",
  portrait: "portrait-hero-enchanter",
};

/** Revenant (FACTION_UNDEAD 7). Army: 20 Skeletons, 5 Ghouls. */
export const REVENANT: HeroClassDef = {
  id: "revenant",
  name: "Revenant",
  faction: "undead",
  leaning: "might",
  nativeTerrain: "wasteland",
  stats: { attack: 3, defense: 1, power: 1, lore: 1 },
  pattern: [A, D, A, P, A, D, L, A, D, P],
  weights: weightsFromKinds(
    {
      bloom: 0,
      accord: 1,
      clock: 2,
      hush: 4,
      storm: 2,
      offence: 8,
      armour: 5,
      archery: 3,
      riposte: 8,
      standards: 3,
      tactics: 5,
      leadership: 0,
      fortune: 3,
      captaincy: 7,
      omens: 6,
      logistics: 6,
      pathfinding: 6,
      scouting: 4,
      wellspring: 2,
      learning: 4,
      estates: 3,
      mustering: 5,
      parley: 1,
      scrollcraft: 2,
    },
    2,
  ),
  startingSkills: ["onslaught", "riposte"],
  command: "one-more-time",
  startingArmy: [
    { creature: "skeleton", count: 20 },
    { creature: "ghoul", count: 5 },
  ],
  sprite: "hero-revenant",
  portrait: "portrait-hero-revenant",
};

/** Mortician (FACTION_UNDEAD 7). Army: 14 Skeletons, 4 Ghouls, 2 Gravecallers. */
export const MORTICIAN: HeroClassDef = {
  id: "mortician",
  name: "Mortician",
  faction: "undead",
  leaning: "magic",
  nativeTerrain: "wasteland",
  stats: { attack: 1, defense: 1, power: 2, lore: 2 },
  pattern: [P, L, P, A, L, P, D, P, L, A],
  weights: weightsFromKinds(
    {
      bloom: 0,
      accord: 2,
      clock: 6,
      hush: 10,
      storm: 4,
      offence: 2,
      armour: 3,
      archery: 4,
      riposte: 3,
      standards: 3,
      tactics: 3,
      leadership: 0,
      fortune: 2,
      captaincy: 5,
      omens: 8,
      logistics: 4,
      pathfinding: 4,
      scouting: 5,
      wellspring: 8,
      learning: 6,
      estates: 3,
      mustering: 3,
      parley: 1,
      scrollcraft: 6,
    },
    6,
  ),
  startingSkills: ["quietus", "deep-wells"],
  startingPage: "last-breath",
  command: "last-rites",
  startingArmy: [
    { creature: "skeleton", count: 14 },
    { creature: "ghoul", count: 4 },
    { creature: "gravecaller", count: 2 },
  ],
  sprite: "hero-mortician",
  portrait: "portrait-hero-mortician",
};

/** Warlord (FACTION_GOBLINS 7). Army: 20 Goblins, 6 Bomb Chuckers. */
export const WARLORD: HeroClassDef = {
  id: "warlord",
  name: "Warlord",
  faction: "goblins",
  leaning: "might",
  nativeTerrain: "badlands",
  stats: { attack: 3, defense: 1, power: 1, lore: 1 },
  pattern: [A, D, A, P, A, D, A, L, A, P],
  weights: weightsFromKinds(
    {
      bloom: 2,
      accord: 0,
      clock: 1,
      hush: 1,
      storm: 3,
      offence: 10,
      armour: 3,
      archery: 6,
      riposte: 3,
      standards: 3,
      tactics: 7,
      leadership: 4,
      fortune: 7,
      captaincy: 8,
      omens: 3,
      logistics: 8,
      pathfinding: 6,
      scouting: 5,
      wellspring: 1,
      learning: 2,
      estates: 5,
      mustering: 7,
      parley: 2,
      scrollcraft: 3,
    },
    2,
  ),
  startingSkills: ["onslaught", "wayfaring"],
  command: "heave-ho",
  startingArmy: [
    { creature: "goblin", count: 20 },
    { creature: "bomb-chucker", count: 6 },
  ],
  sprite: "hero-warlord",
  portrait: "portrait-hero-warlord",
};

/** Weatherwitch (FACTION_GOBLINS 7). Army: 16 Goblins, 4 Bomb Chuckers, 2 Boomshamans. */
export const WEATHERWITCH: HeroClassDef = {
  id: "weatherwitch",
  name: "Weatherwitch",
  faction: "goblins",
  leaning: "magic",
  nativeTerrain: "badlands",
  stats: { attack: 1, defense: 0, power: 3, lore: 2 },
  pattern: [P, L, P, A, P, L, A, P, L, D],
  weights: weightsFromKinds(
    {
      bloom: 6,
      accord: 0,
      clock: 2,
      hush: 4,
      storm: 10,
      offence: 4,
      armour: 1,
      archery: 6,
      riposte: 1,
      standards: 2,
      tactics: 4,
      leadership: 2,
      fortune: 7,
      captaincy: 4,
      omens: 6,
      logistics: 5,
      pathfinding: 5,
      scouting: 5,
      wellspring: 7,
      learning: 4,
      estates: 4,
      mustering: 4,
      parley: 1,
      scrollcraft: 9,
    },
    6,
  ),
  startingSkills: ["stormcalling", "packrat"],
  startingPage: "thunderclap",
  command: "kaboom",
  startingArmy: [
    { creature: "goblin", count: 16 },
    { creature: "bomb-chucker", count: 4 },
    { creature: "boomshaman", count: 2 },
  ],
  sprite: "hero-weatherwitch",
  portrait: "portrait-hero-weatherwitch",
};

/** Nutcracker (FACTION_CANDY 7). Army: 20 Gingerbread Men, 6 Peppermint Archers. */
export const NUTCRACKER: HeroClassDef = {
  id: "nutcracker",
  name: "Nutcracker",
  faction: "candy",
  leaning: "might",
  // Frosting, the Kingdom's own ground (bead bzc.115; was snow).
  nativeTerrain: "frosting",
  stats: { attack: 2, defense: 2, power: 1, lore: 1 },
  pattern: [D, A, D, P, A, D, L, A, D, P],
  weights: weightsFromKinds(
    {
      bloom: 1,
      accord: 3,
      clock: 3,
      hush: 1,
      storm: 0,
      offence: 6,
      armour: 9,
      archery: 6,
      riposte: 7,
      standards: 5,
      tactics: 8,
      leadership: 6,
      fortune: 4,
      captaincy: 6,
      omens: 5,
      logistics: 6,
      pathfinding: 4,
      scouting: 3,
      wellspring: 1,
      learning: 3,
      estates: 5,
      mustering: 5,
      parley: 4,
      scrollcraft: 2,
    },
    2,
  ),
  startingSkills: ["bulwark", "vanguard"],
  command: "crack",
  startingArmy: [
    { creature: "gingerbread-man", count: 20 },
    { creature: "peppermint-archer", count: 6 },
  ],
  sprite: "hero-nutcracker",
  portrait: "portrait-hero-nutcracker",
};

/**
 * Confectioner (FACTION_CANDY 7). Army: 14 Gingerbread Men, 5 Peppermint
 * Archers, 2 Sugarplums.
 */
export const CONFECTIONER: HeroClassDef = {
  id: "confectioner",
  name: "Confectioner",
  faction: "candy",
  leaning: "magic",
  nativeTerrain: "frosting",
  stats: { attack: 1, defense: 1, power: 2, lore: 2 },
  pattern: [L, P, L, D, P, L, A, P, L, D],
  weights: weightsFromKinds(
    {
      bloom: 2,
      accord: 7,
      clock: 10,
      hush: 5,
      storm: 0,
      offence: 2,
      armour: 3,
      archery: 4,
      riposte: 2,
      standards: 4,
      tactics: 4,
      leadership: 3,
      fortune: 4,
      captaincy: 4,
      omens: 6,
      logistics: 4,
      pathfinding: 4,
      scouting: 4,
      wellspring: 7,
      learning: 5,
      estates: 5,
      mustering: 3,
      parley: 8,
      scrollcraft: 5,
    },
    6,
  ),
  startingSkills: ["horology", "silver-tongue"],
  startingPage: "appointment",
  command: "come-in-dear",
  startingArmy: [
    { creature: "gingerbread-man", count: 14 },
    { creature: "peppermint-archer", count: 5 },
    { creature: "sugarplum", count: 2 },
  ],
  sprite: "hero-confectioner",
  portrait: "portrait-hero-confectioner",
};

/** Thane (FACTION_DWARVES 7). Army: 19 Tinkers, 5 Rivet Gunners. */
export const THANE: HeroClassDef = {
  id: "thane",
  name: "Thane",
  faction: "dwarves",
  leaning: "might",
  nativeTerrain: "volcanic",
  stats: { attack: 1, defense: 3, power: 1, lore: 1 },
  pattern: [D, A, D, P, D, A, L, D, A, P],
  weights: weightsFromKinds(
    {
      bloom: 0,
      accord: 0,
      clock: 2,
      hush: 2,
      storm: 3,
      offence: 5,
      armour: 10,
      archery: 8,
      riposte: 7,
      standards: 4,
      tactics: 6,
      leadership: 2,
      fortune: 3,
      captaincy: 6,
      omens: 3,
      logistics: 5,
      pathfinding: 6,
      scouting: 4,
      wellspring: 1,
      learning: 3,
      estates: 7,
      mustering: 6,
      parley: 1,
      scrollcraft: 3,
    },
    2,
  ),
  startingSkills: ["bulwark", "marksmanship"],
  command: "ramming-speed",
  startingArmy: [
    { creature: "tinker", count: 19 },
    { creature: "rivet-gunner", count: 5 },
  ],
  sprite: "hero-thane",
  portrait: "portrait-hero-thane",
};

/**
 * Artificer (FACTION_DWARVES 7). Army: 16 Tinkers, 4 Rivet Gunners, 1
 * Mortar.
 */
export const ARTIFICER: HeroClassDef = {
  id: "artificer",
  name: "Artificer",
  faction: "dwarves",
  leaning: "magic",
  nativeTerrain: "volcanic",
  stats: { attack: 1, defense: 1, power: 2, lore: 2 },
  pattern: [P, L, P, D, P, L, A, P, L, D],
  weights: weightsFromKinds(
    {
      bloom: 1,
      accord: 0,
      clock: 6,
      hush: 7,
      storm: 10,
      offence: 2,
      armour: 4,
      archery: 6,
      riposte: 2,
      standards: 3,
      tactics: 4,
      leadership: 1,
      fortune: 4,
      captaincy: 4,
      omens: 5,
      logistics: 3,
      pathfinding: 5,
      scouting: 4,
      wellspring: 7,
      learning: 6,
      estates: 7,
      mustering: 3,
      parley: 2,
      scrollcraft: 6,
    },
    6,
  ),
  startingSkills: ["stormcalling", "stewardship"],
  startingPage: "jolt",
  command: "overpressure",
  startingArmy: [
    { creature: "tinker", count: 16 },
    { creature: "rivet-gunner", count: 4 },
    { creature: "mortar", count: 1 },
  ],
  sprite: "hero-artificer",
  portrait: "portrait-hero-artificer",
};

export const HERO_CLASSES: Readonly<Record<string, HeroClassDef>> = {
  chieftain: CHIEFTAIN,
  "knight-errant": KNIGHT_ERRANT,
  enchanter: ENCHANTER,
  revenant: REVENANT,
  mortician: MORTICIAN,
  warlord: WARLORD,
  weatherwitch: WEATHERWITCH,
  nutcracker: NUTCRACKER,
  confectioner: CONFECTIONER,
  thane: THANE,
  artificer: ARTIFICER,
};

/** The hero class with this id; throws on an unknown id. */
export function getHeroClass(id: string): HeroClassDef {
  const def = Object.hasOwn(HERO_CLASSES, id) ? HERO_CLASSES[id] : undefined;
  if (def === undefined) throw new Error(`unknown hero class "${id}"`);
  return def;
}

/**
 * A named hero's specialty (RULES_V2 3.7), one of five forms. Its numbers
 * are fixed by the rules; src/core/game/effects.ts turns it into effects.
 */
export type Specialty =
  /** Stacks of one creature: +1 Attack and Defense (+1 per 5 levels), +1 Speed. */
  | { kind: "creature"; creature: string }
  /** Starts with one tier 1-2 page, cast at +2 Power (+1 per 5 levels). */
  | { kind: "spell"; spell: string }
  /** Starts with this skill at rank 2 instead of `replaces`. */
  | { kind: "skill"; skill: SkillId; replaces: SkillId }
  /** Daily: 250 gold; 1 wood and 1 ore; or 1 essence every second day. */
  | { kind: "resource"; resource: "gold" | "wood-ore" | "essence" }
  /** The Command counts C one higher. */
  | { kind: "command" };

/** A named hero of the v0.2 factions (FACTION_* section 8). */
export interface NamedHeroDef {
  id: string;
  name: string;
  heroClass: string;
  faction: FactionId;
  specialty: Specialty;
}

function named(
  id: string,
  name: string,
  heroClass: string,
  specialty: Specialty,
): NamedHeroDef {
  return {
    id,
    name,
    heroClass,
    faction: getHeroClass(heroClass).faction,
    specialty,
  };
}

/**
 * The 40 named heroes (FACTION_HUMANS, FACTION_UNDEAD, FACTION_GOBLINS,
 * FACTION_CANDY and FACTION_DWARVES section 8; a faction's heroes join the hero pool once it
 * is playable, src/data/players.ts `rosterFor`). Skill names map to skill ids as in the file comment
 * (Leadership -> banner, Armour -> bulwark, Accord -> covenant, Hush ->
 * quietus, Storm -> stormcalling).
 */
export const NAMED_HEROES: readonly NamedHeroDef[] = [
  // The Realm
  named("cuthbert", "Sir Cuthbert the Unhorsed", "knight-errant", {
    kind: "creature",
    creature: "knight",
  }),
  named("wat", "Wat Greenhood", "knight-errant", {
    kind: "creature",
    creature: "longbowman",
  }),
  named("ysolde", "Dame Ysolde Brightlance", "knight-errant", {
    kind: "command",
  }),
  named("aldous", "Captain Aldous Ferrow", "knight-errant", {
    kind: "skill",
    skill: "banner",
    replaces: "bulwark",
  }),
  named("wilhelmina", "Abbess Wilhelmina", "enchanter", {
    kind: "spell",
    spell: "mend",
  }),
  named("tobias", "Master Tobias Quill", "enchanter", {
    kind: "spell",
    spell: "share",
  }),
  named("rosamund", "Lady Rosamund of the Mere", "enchanter", {
    kind: "skill",
    skill: "greencraft",
    replaces: "greencraft",
  }),
  named("maud", "Reeve Maud Pennywise", "enchanter", {
    kind: "resource",
    resource: "gold",
  }),
  // The Restless
  named("mortimer", "Sir Mortimer Stillstanding", "revenant", {
    kind: "creature",
    creature: "skeleton",
  }),
  named("agatha", "The Dowager Countess Agatha", "revenant", {
    kind: "creature",
    creature: "vampire",
  }),
  named("bartholomew", "Colonel Bartholomew Dust", "revenant", {
    kind: "command",
  }),
  named("jeb", "Old Jeb the Gravedigger", "revenant", {
    kind: "resource",
    resource: "essence",
  }),
  named("graves", "Mr Graves, Funeral Director", "mortician", {
    kind: "spell",
    spell: "pass-on",
  }),
  named("ophelia", "Madame Ophelia Veil", "mortician", {
    kind: "spell",
    spell: "second-shift",
  }),
  named("ignatius", "Doctor Ignatius Crane", "mortician", {
    kind: "skill",
    skill: "quietus",
    replaces: "quietus",
  }),
  named("hester", "Widow Hester Blackwood", "mortician", {
    kind: "creature",
    creature: "banshee",
  }),
  // The Horde
  named("grukk", "Grukk Manyteeth", "warlord", {
    kind: "creature",
    creature: "goblin",
  }),
  named("olga", "Big Olga Anvilfist", "warlord", {
    kind: "creature",
    creature: "ogre",
  }),
  named("skarn", "Skarn the Loud", "warlord", { kind: "command" }),
  named("nix", "Nix Fingers", "warlord", {
    kind: "resource",
    resource: "gold",
  }),
  named("squall", "Old Mother Squall", "weatherwitch", {
    kind: "spell",
    spell: "thunderclap",
  }),
  named("zizzik", "Zizzik Sparkwhisker", "weatherwitch", {
    kind: "spell",
    spell: "set-off",
  }),
  named("snagga", "Snagga Three-Kettles", "weatherwitch", {
    kind: "skill",
    skill: "stormcalling",
    replaces: "stormcalling",
  }),
  named("pim", "Pim Powderkeg", "weatherwitch", {
    kind: "creature",
    creature: "bomb-chucker",
  }),
  // The Candy Kingdom
  named("kernel", "Captain Kernel Crackwell", "nutcracker", {
    kind: "creature",
    creature: "peppermint-archer",
  }),
  named("brittle", "Dame Brittle Hazelby", "nutcracker", {
    kind: "creature",
    creature: "gummy-bear",
  }),
  named("walnut", "Major Walnut Thumps", "nutcracker", { kind: "command" }),
  named("humbug", "Corporal Humbug", "nutcracker", {
    kind: "resource",
    resource: "gold",
  }),
  named("praline", "Madame Praline", "confectioner", {
    kind: "spell",
    spell: "late-bell",
  }),
  named("treacle", "Old Mother Treacle", "confectioner", {
    kind: "spell",
    spell: "treacle",
  }),
  named("fondant", "Auntie Fondant", "confectioner", {
    kind: "skill",
    skill: "horology",
    replaces: "horology",
  }),
  named("gingersnap", "Granny Gingersnap", "confectioner", {
    kind: "creature",
    creature: "gingerbread-man",
  }),
  // The Deepforge
  named("brakka", "Thane Brakka Boltbeard", "thane", {
    kind: "creature",
    creature: "steam-tank",
  }),
  named("gristle", "Old Gristle Copperpot", "thane", {
    kind: "creature",
    creature: "rivet-gunner",
  }),
  named("hilde", "Captain Hilde Ironkettle", "thane", { kind: "command" }),
  named("dunstan", "Foreman Dunstan Coalbright", "thane", {
    kind: "resource",
    resource: "wood-ore",
  }),
  named("mags", "Mags Sparkwrench", "artificer", {
    kind: "spell",
    spell: "jolt",
  }),
  named("silas", "Silas Ledgerby", "artificer", {
    kind: "spell",
    spell: "on-credit",
  }),
  named("valvina", "Auntie Valvina Steamwright", "artificer", {
    kind: "skill",
    skill: "stormcalling",
    replaces: "stormcalling",
  }),
  named("nell", "Nell Fusewright", "artificer", {
    kind: "creature",
    creature: "mortar",
  }),
];
