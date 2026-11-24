/**
 * Artifacts and consumables (CONTENT_ARTIFACTS.md, RULES_V2 section 4).
 *
 * A worn artifact's `effects` apply to its hero (src/data/effects.ts
 * kinds): stat modifiers (form 1), battle-start rules (form 2) and rule
 * switches (form 5). An item act (form 4) names a battle act registered
 * in src/core/game/battle-content.ts. Consumables have no slot and a `use`.
 *
 * To add a row (bead bzc.12): copy a row of the same grade and form.
 * A Marvel lists its three pieces; each piece names its Marvel.
 */
import type { HeroEffect } from "./effects.ts";

/** The slot kinds (RULES_V2 4.1). "pocket" is anything not worn on the body. */
export type SlotKind =
  | "head"
  | "neck"
  | "torso"
  | "cloak"
  | "weapon"
  | "shield"
  | "ring"
  | "feet"
  | "pocket";

/** The eleven worn slots, in slot order (paper doll and 4.4 "slot order"). */
export const WORN_SLOTS: readonly SlotKind[] = [
  "head",
  "neck",
  "torso",
  "cloak",
  "weapon",
  "shield",
  "ring",
  "ring",
  "feet",
  "pocket",
  "pocket",
];

export const SLOT_NAMES: Readonly<Record<SlotKind, string>> = {
  head: "Head",
  neck: "Neck",
  torso: "Torso",
  cloak: "Cloak",
  weapon: "Weapon",
  shield: "Shield",
  ring: "Ring",
  feet: "Feet",
  pocket: "Pocket",
};

export const BACKPACK_SIZE = 12;
export const SCROLL_CASE_SIZE = 8;
/** Consumables of one kind share a backpack slot, three at most. */
export const CONSUMABLES_PER_SLOT = 3;

export type Grade = "trinket" | "wonder" | "marvel";

/** Grade values (RULES_V2 4.2): guards, trade and the AI. */
export const GRADE_VALUES: Readonly<Record<Grade, number>> = {
  trinket: 2000,
  wonder: 5000,
  marvel: 20000,
};
export const PIECE_VALUE = 6000;

/** Lifting a curse (RULES_V2 4.3): at a site, or in a guild-3 town. */
export const CURSE_LIFT_SITE_COST = { gold: 1000, essence: 2 } as const;
export const CURSE_LIFT_TOWN_COST = { gold: 2000 } as const;

export interface WornArtifactDef {
  id: string;
  name: string;
  kind: "worn";
  slot: SlotKind;
  /** A Marvel piece is a Wonder by grade (4.5). */
  grade: Grade;
  value: number;
  /** The rule as shown (bonus first, then any drawback). */
  text: string;
  effects: readonly HeroEffect[];
  /** Cursed: once worn, stuck until lifted (4.3). */
  cursed?: boolean;
  /** Item act ids (form 4), once per battle each. */
  itemActs?: readonly string[];
  /** A Marvel's three pieces. */
  pieces?: readonly [string, string, string];
  /** A piece's Marvel. */
  pieceOf?: string;
}

/** What using a consumable does (CONTENT_ARTIFACTS 6.1, adopted). */
export type ConsumableUse =
  /** Recorded on the hero; its effects apply in the next battle only. */
  | { kind: "next-battle"; effects: readonly HeroEffect[] }
  /** Mana now, which may go above the maximum once. */
  | { kind: "mana"; amount: number }
  /** Movement points today. */
  | { kind: "movement"; amount: number }
  /** Reveal a disc around the hero. */
  | { kind: "reveal"; radius: number }
  /** The next skill offer or feat draft is redrawn once. */
  | { kind: "redraw" };

export interface ConsumableDef {
  id: string;
  name: string;
  kind: "consumable";
  /** Potion, paper or tool (flavour). */
  form: "potion" | "paper" | "tool";
  value: number;
  text: string;
  use: ConsumableUse;
}

/**
 * A relic: carried in the backpack, no slot and no effect, never sold or
 * destroyed (the Keystone of CONTENT_MAP_OBJECTS section 4).
 */
export interface RelicDef {
  id: string;
  name: string;
  kind: "relic";
  value: number;
  text: string;
}

export type ArtifactDef = WornArtifactDef | ConsumableDef | RelicDef;

/** The Keystone: dug up on the map, built into a Keystone Hall. */
export const KEYSTONE: RelicDef = {
  id: "keystone",
  name: "The Keystone",
  kind: "relic",
  value: 30000,
  text: "Carried, not worn. Bring it to one of your towns to build the Keystone Hall.",
};

function trinket(
  id: string,
  name: string,
  slot: SlotKind,
  value: number,
  text: string,
  effects: HeroEffect[],
): WornArtifactDef {
  return {
    id,
    name,
    kind: "worn",
    slot,
    grade: "trinket",
    value,
    text,
    effects,
  };
}

const ROWS: ArtifactDef[] = [
  // Trinkets: stat modifiers only.
  trinket("tin-sabre", "Tin Sabre", "weapon", 1000, "+1 Attack.", [
    { kind: "stat", stat: "attack", amount: 1 },
  ]),
  trinket("pot-lid", "Pot Lid", "shield", 1000, "+1 Defense.", [
    { kind: "stat", stat: "defense", amount: 1 },
  ]),
  trinket("reading-glasses", "Reading Glasses", "head", 2000, "+2 Lore.", [
    { kind: "stat", stat: "lore", amount: 2 },
  ]),
  trinket("thinking-cap", "Thinking Cap", "head", 2000, "+2 Power.", [
    { kind: "stat", stat: "power", amount: 2 },
  ]),
  trinket(
    "sprig-pendant",
    "Sprig Pendant",
    "neck",
    2000,
    "+2 Power for Bloom pages.",
    [{ kind: "school-power", school: "bloom", amount: 2 }],
  ),
  trinket("regimental-sash", "Regimental Sash", "cloak", 2000, "+1 Morale.", [
    { kind: "morale", amount: 1 },
  ]),
  trinket(
    "oilskin-of-deep-pockets",
    "Oilskin of Deep Pockets",
    "cloak",
    2000,
    "+15% maximum mana.",
    [{ kind: "max-mana-percent", percent: 15 }],
  ),
  trinket(
    "knuckle-dusters",
    "Knuckle-Dusters",
    "ring",
    2000,
    "+1 Attack and +1 Defense.",
    [
      { kind: "stat", stat: "attack", amount: 1 },
      { kind: "stat", stat: "defense", amount: 1 },
    ],
  ),
  trinket(
    "moneylenders-ring",
    "Moneylender's Ring",
    "ring",
    2000,
    "+125 gold each day while its hero is on the map.",
    [{ kind: "income", resources: { gold: 125 } }],
  ),
  trinket(
    "seven-furlong-boots",
    "Seven-Furlong Boots",
    "feet",
    2500,
    "+10% movement points.",
    [{ kind: "movement-percent", percent: 10 }],
  ),
  trinket(
    "galoshes",
    "Galoshes",
    "feet",
    1500,
    "Wasteland costs this hero 100 per straight step.",
    [{ kind: "terrain-cost", reduce: 1000, terrain: "wasteland" }],
  ),
  trinket("lucky-penny", "Lucky Penny", "pocket", 2000, "+1 Luck.", [
    { kind: "luck", amount: 1 },
  ]),
  trinket("spyglass", "Spyglass", "pocket", 1500, "+1 sight radius.", [
    { kind: "sight", amount: 1 },
  ]),
  trinket(
    "scholars-bookmark",
    "Scholar's Bookmark",
    "pocket",
    1500,
    "+10% to every XP gain.",
    [{ kind: "xp-percent", percent: 10 }],
  ),
  // Wonders.
  {
    id: "winters-pocket-watch",
    name: "Winter's Pocket Watch",
    kind: "worn",
    slot: "pocket",
    grade: "wonder",
    value: 6000,
    text: "The fastest enemy stack starts Frozen, clock 1.",
    effects: [
      {
        kind: "battle-start",
        rule: {
          side: "enemy",
          selector: "fastest",
          condition: "frozen",
          clock: 1,
        },
      },
    ],
  },
  // Cursed Wonders.
  {
    id: "the-albatross",
    name: "The Albatross",
    kind: "worn",
    slot: "neck",
    grade: "wonder",
    value: 4000,
    cursed: true,
    text: "+4 Attack and +4 Defense. Drawback: your strongest stack starts Jinxed 30, clockless.",
    effects: [
      { kind: "stat", stat: "attack", amount: 4 },
      { kind: "stat", stat: "defense", amount: 4 },
      {
        kind: "battle-start",
        rule: {
          side: "own",
          selector: "strongest",
          condition: "jinxed",
          size: 30,
          clock: null,
        },
      },
    ],
  },
  {
    id: "ball-and-chain",
    name: "Ball and Chain",
    kind: "worn",
    slot: "feet",
    grade: "wonder",
    value: 4000,
    cursed: true,
    text: "+5 Defense. Drawback: every stack of yours starts Delayed, clock 2.",
    effects: [
      { kind: "stat", stat: "defense", amount: 5 },
      {
        kind: "battle-start",
        rule: { side: "own", selector: "all", condition: "delayed", clock: 2 },
      },
    ],
  },
  // The Hourglass with No Bottom and its pieces (cursed: the Upper Bulb is).
  {
    id: "hourglass-with-no-bottom",
    name: "The Hourglass with No Bottom",
    kind: "worn",
    slot: "pocket",
    grade: "marvel",
    value: 20000,
    cursed: true,
    text: "Clocks on conditions on your stacks do not tick, Holds excepted: boons and debts alike.",
    effects: [{ kind: "switch", id: "own-clocks-frozen" }],
    pieces: ["the-upper-bulb", "the-lower-bulb", "a-pinch-of-sand"],
  },
  {
    id: "the-upper-bulb",
    name: "The Upper Bulb",
    kind: "worn",
    slot: "pocket",
    grade: "wonder",
    value: 6000,
    cursed: true,
    text: "Clocks on banes on your stacks do not tick, Holds excepted.",
    effects: [{ kind: "switch", id: "own-bane-clocks-frozen" }],
    pieceOf: "hourglass-with-no-bottom",
  },
  {
    id: "the-lower-bulb",
    name: "The Lower Bulb",
    kind: "worn",
    slot: "neck",
    grade: "wonder",
    value: 6000,
    text: "Clocks on boons on your strongest stack do not tick.",
    effects: [{ kind: "switch", id: "strongest-boon-clocks-frozen" }],
    pieceOf: "hourglass-with-no-bottom",
  },
  {
    id: "a-pinch-of-sand",
    name: "A Pinch of Sand",
    kind: "worn",
    slot: "pocket",
    grade: "wonder",
    value: 6000,
    text: "Item act: change one condition's clock by 2, exactly as the Wind tool (longer for your boons and enemy banes, shorter otherwise).",
    effects: [],
    itemActs: ["a-pinch-of-sand"],
    pieceOf: "hourglass-with-no-bottom",
  },
  // Consumables.
  {
    id: "bottled-cheer",
    name: "Bottled Cheer",
    kind: "consumable",
    form: "potion",
    value: 400,
    text: "+1 Morale until the hero's next battle ends.",
    use: { kind: "next-battle", effects: [{ kind: "morale", amount: 1 }] },
  },
  {
    id: "jar-of-fair-chances",
    name: "Jar of Fair Chances",
    kind: "consumable",
    form: "potion",
    value: 400,
    text: "+1 Luck until the hero's next battle ends.",
    use: { kind: "next-battle", effects: [{ kind: "luck", amount: 1 }] },
  },
  {
    id: "blue-tonic",
    name: "Blue Tonic",
    kind: "consumable",
    form: "potion",
    value: 500,
    text: "The hero gains 20 mana, which may take it above its maximum once.",
    use: { kind: "mana", amount: 20 },
  },
  {
    id: "road-cordial",
    name: "Road Cordial",
    kind: "consumable",
    form: "potion",
    value: 500,
    text: "+400 movement points today.",
    use: { kind: "movement", amount: 400 },
  },
  {
    id: "elixir-of-hindsight",
    name: "Elixir of Hindsight",
    kind: "consumable",
    form: "potion",
    value: 1000,
    text: "The hero's next skill offer or feat draft is redrawn once, with the seed advanced by one.",
    use: { kind: "redraw" },
  },
  {
    id: "signal-lantern",
    name: "Signal Lantern",
    kind: "consumable",
    form: "tool",
    value: 500,
    text: "Reveals the cells in a disc of radius 8 around the hero.",
    use: { kind: "reveal", radius: 8 },
  },
];

ROWS.push(KEYSTONE);

export const ARTIFACTS: Readonly<Record<string, ArtifactDef>> =
  Object.fromEntries(ROWS.map((a) => [a.id, a]));

export const ARTIFACT_LIST: readonly ArtifactDef[] = ROWS;

export function findArtifact(id: string): ArtifactDef | undefined {
  return Object.hasOwn(ARTIFACTS, id) ? ARTIFACTS[id] : undefined;
}

export function getArtifact(id: string): ArtifactDef {
  const def = findArtifact(id);
  if (def === undefined) throw new Error(`unknown artifact "${id}"`);
  return def;
}

/** The worn-artifact row, or undefined for consumables and unknown ids. */
export function wornDef(id: string): WornArtifactDef | undefined {
  const def = findArtifact(id);
  return def?.kind === "worn" ? def : undefined;
}

export function isCursed(id: string): boolean {
  return wornDef(id)?.cursed === true;
}

/** Grade label for the UI: "Marvel piece" for pieces. */
export function gradeLabel(def: ArtifactDef): string {
  if (def.kind === "consumable") return "Consumable";
  if (def.kind === "relic") return "Relic";
  if (def.pieceOf !== undefined) return "Marvel piece";
  return def.grade[0]?.toUpperCase() + def.grade.slice(1);
}
