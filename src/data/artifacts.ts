/**
 * Artifacts and consumables (CONTENT_ARTIFACTS.md, RULES_V2 section 4):
 * all 80 catalogue kinds (30 Trinkets, 20 Wonders, 6 cursed Wonders, 12
 * Marvel pieces, 12 consumables) and the 4 assembled Marvels.
 *
 * Ids are the catalogue names in kebab case (src/assets/icons.ts
 * `contentId`), and each row carries its gold value: map placement and
 * guards (CONTENT_MAP_OBJECTS) read both.
 *
 * A worn artifact's `effects` apply to its hero (src/data/effects.ts
 * kinds): stat modifiers (form 1), battle-start rules (form 2), reactions
 * and rule switches (forms 3 and 5, as `switch` ids the grammar reads). An
 * item act (form 4) names a battle act of kind "item" registered in
 * src/core/battle/hero-effects.ts. Consumables have no slot and a `use`.
 *
 * To add a row: copy a row of the same grade and form. A Marvel lists its
 * three pieces; each piece names its Marvel.
 */
import type {
  BattleStartRule,
  HeroEffect,
  PrimaryStat,
  RuleSwitchId,
  School,
  StackSelector,
} from "./effects.ts";

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
  | { kind: "redraw" }
  /** Marks the nearest buried cache for the player (Dog-Eared Map). */
  | { kind: "mark-cache" }
  /**
   * An adjacent neutral stack of FV at most `maxFightValue` has no zone of
   * control against the hero until the day ends (Letter of Safe Conduct).
   */
  | { kind: "safe-conduct"; maxFightValue: number }
  /** Dig now for `movement` points (Collapsible Shovel; deferred). */
  | { kind: "dig"; movement: number };

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

/** A Trinket: stat modifiers only (CONTENT_ARTIFACTS 2). */
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

/** A Wonder (CONTENT_ARTIFACTS 3, 4) or a Marvel piece (5). */
function wonder(
  id: string,
  name: string,
  slot: SlotKind,
  value: number,
  text: string,
  effects: HeroEffect[],
  extra: Partial<WornArtifactDef> = {},
): WornArtifactDef {
  return {
    id,
    name,
    kind: "worn",
    slot,
    grade: "wonder",
    value,
    text,
    effects,
    ...extra,
  };
}

/** A battle-start rule (form 2) of a Wonder, tier 3 unless given. */
function start(
  side: "own" | "enemy",
  selector: StackSelector,
  condition: string,
  clock: number | null,
  more: Partial<BattleStartRule> = {},
): HeroEffect {
  return {
    kind: "battle-start",
    rule: { side, selector, condition, clock, ...more },
  };
}

const sw = (id: RuleSwitchId): HeroEffect => ({ kind: "switch", id });
const stat = (s: PrimaryStat, amount: number): HeroEffect => ({
  kind: "stat",
  stat: s,
  amount,
});
const schoolPower = (school: School): HeroEffect => ({
  kind: "school-power",
  school,
  amount: 2,
});

/** A consumable (CONTENT_ARTIFACTS 6). */
function consumable(
  id: string,
  name: string,
  form: ConsumableDef["form"],
  value: number,
  text: string,
  use: ConsumableUse,
): ConsumableDef {
  return { id, name, kind: "consumable", form, value, text, use };
}

const ROWS: ArtifactDef[] = [
  // ------------------------------------------------ Trinkets (30)
  trinket("tin-sabre", "Tin Sabre", "weapon", 1000, "+1 Attack.", [
    stat("attack", 1),
  ]),
  trinket("parade-sword", "Parade Sword", "weapon", 2000, "+2 Attack.", [
    stat("attack", 2),
  ]),
  trinket(
    "ringmasters-whip",
    "Ringmaster's Whip",
    "weapon",
    3000,
    "+3 Attack.",
    [stat("attack", 3)],
  ),
  trinket("pot-lid", "Pot Lid", "shield", 1000, "+1 Defense.", [
    stat("defense", 1),
  ]),
  trinket("tollgate-door", "Tollgate Door", "shield", 2000, "+2 Defense.", [
    stat("defense", 2),
  ]),
  trinket("manhole-cover", "Manhole Cover", "shield", 3000, "+3 Defense.", [
    stat("defense", 3),
  ]),
  trinket("reading-glasses", "Reading Glasses", "head", 2000, "+2 Lore.", [
    stat("lore", 2),
  ]),
  trinket("thinking-cap", "Thinking Cap", "head", 2000, "+2 Power.", [
    stat("power", 2),
  ]),
  trinket(
    "second-best-breastplate",
    "Second-Best Breastplate",
    "torso",
    3000,
    "+1 Attack and +2 Defense.",
    [stat("attack", 1), stat("defense", 2)],
  ),
  trinket(
    "star-chart-robe",
    "Star-Chart Robe",
    "torso",
    3000,
    "+2 Power and +1 Lore.",
    [stat("power", 2), stat("lore", 1)],
  ),
  trinket(
    "sprig-pendant",
    "Sprig Pendant",
    "neck",
    2000,
    "Your Bloom pages are cast at +2 Power.",
    [schoolPower("bloom")],
  ),
  trinket(
    "sealing-wax-locket",
    "Sealing-Wax Locket",
    "neck",
    2000,
    "Your Accord pages are cast at +2 Power.",
    [schoolPower("accord")],
  ),
  trinket(
    "fob-chain",
    "Fob Chain",
    "neck",
    2000,
    "Your Clock pages are cast at +2 Power.",
    [schoolPower("clock")],
  ),
  trinket(
    "mourning-brooch",
    "Mourning Brooch",
    "neck",
    2000,
    "Your Hush pages are cast at +2 Power.",
    [schoolPower("hush")],
  ),
  trinket(
    "lightning-glass-bead",
    "Lightning-Glass Bead",
    "neck",
    2000,
    "Your Storm pages are cast at +2 Power.",
    [schoolPower("storm")],
  ),
  trinket(
    "four-leaf-buttonhole",
    "Four-Leaf Buttonhole",
    "neck",
    2000,
    "+1 Luck.",
    [{ kind: "luck", amount: 1 }],
  ),
  trinket("regimental-sash", "Regimental Sash", "cloak", 2000, "+1 Morale.", [
    { kind: "morale", amount: 1 },
  ]),
  trinket(
    "clerks-cape",
    "Clerk's Cape",
    "cloak",
    2000,
    "Your pages cost 10% less mana.",
    [{ kind: "mana-cost-percent", percent: -10 }],
  ),
  trinket(
    "oilskin-of-deep-pockets",
    "Oilskin of Deep Pockets",
    "cloak",
    2000,
    "The hero's maximum mana is 15% higher.",
    [{ kind: "max-mana-percent", percent: 15 }],
  ),
  trinket(
    "knuckle-dusters",
    "Knuckle-Dusters",
    "ring",
    2000,
    "+1 Attack and +1 Defense.",
    [stat("attack", 1), stat("defense", 1)],
  ),
  trinket(
    "signet-of-the-minor-office",
    "Signet of the Minor Office",
    "ring",
    2000,
    "+1 Power and +1 Lore.",
    [stat("power", 1), stat("lore", 1)],
  ),
  trinket(
    "moneylenders-ring",
    "Moneylender's Ring",
    "ring",
    2000,
    "+125 gold each day while the hero is on the map.",
    [{ kind: "income", resources: { gold: 125 } }],
  ),
  trinket(
    "seven-furlong-boots",
    "Seven-Furlong Boots",
    "feet",
    2500,
    "The hero has 10% more movement points each day.",
    [{ kind: "movement-percent", percent: 10 }],
  ),
  trinket(
    "sensible-shoes",
    "Sensible Shoes",
    "feet",
    2000,
    "The hero has 200 more movement points each day.",
    [{ kind: "movement-flat", amount: 200 }],
  ),
  trinket(
    "galoshes",
    "Galoshes",
    "feet",
    1500,
    "Wasteland costs the hero only 100 movement points a step, like grass.",
    [{ kind: "terrain-cost", reduce: 1000, terrain: "wasteland" }],
  ),
  trinket("lucky-penny", "Lucky Penny", "pocket", 2000, "+1 Luck.", [
    { kind: "luck", amount: 1 },
  ]),
  trinket("brass-bugle", "Brass Bugle", "pocket", 2000, "+1 Morale.", [
    { kind: "morale", amount: 1 },
  ]),
  trinket(
    "spyglass",
    "Spyglass",
    "pocket",
    1500,
    "The hero sees 1 cell farther.",
    [{ kind: "sight", amount: 1 }],
  ),
  trinket(
    "thermos-of-strong-tea",
    "Thermos of Strong Tea",
    "pocket",
    1500,
    "The hero gets 2 more mana back each day.",
    [{ kind: "mana-regen", amount: 2 }],
  ),
  trinket(
    "scholars-bookmark",
    "Scholar's Bookmark",
    "pocket",
    1500,
    "The hero earns 10% more experience.",
    [{ kind: "xp-percent", percent: 10 }],
  ),

  // ------------------------------------------------ Wonders (20)
  wonder(
    "winters-pocket-watch",
    "Winter's Pocket Watch",
    "pocket",
    6000,
    "In each battle, the fastest enemy stack starts Frozen for 1 round.",
    [start("enemy", "fastest", "frozen", 1)],
  ),
  wonder(
    "sextons-spade",
    "Sexton's Spade",
    "weapon",
    5000,
    "Everything of yours that uses remains can use any stack's remains, friend's or foe's.",
    [sw("remains-any-owner")],
  ),
  wonder(
    "the-bellhops-cap",
    "The Bellhop's Cap",
    "head",
    6000,
    "Item act: pick one of your stacks. Move a condition from a stack next to it onto another stack next to it, if that stack can take it.",
    [],
    { itemActs: ["the-bellhops-cap"] },
  ),
  wonder(
    "tinderbox",
    "Tinderbox",
    "pocket",
    5000,
    "Item act: get your Fuel back, so you can Fuel a second time this battle.",
    [],
    { itemActs: ["tinderbox"] },
  ),
  wonder(
    "watering-can",
    "Watering Can",
    "pocket",
    4000,
    "In each battle, your weakest stack starts Mending 12 for 4 rounds.",
    [start("own", "weakest", "mending", 4, { size: 12 })],
  ),
  wonder(
    "gardeners-apron",
    "Gardener's Apron",
    "torso",
    4000,
    "When Mending heals one of your stacks, every enemy stack next to it gains Venomed 2 for 2 rounds.",
    [sw("gardeners-apron")],
  ),
  wonder(
    "thornmail-vest",
    "Thornmail Vest",
    "torso",
    5000,
    "In every battle, your strongest stack is Thorned 12 throughout.",
    [start("own", "strongest", "thorned", null, { size: 12 })],
  ),
  wonder(
    "hedge-clipper-shears",
    "Hedge-Clipper Shears",
    "weapon",
    4000,
    "When Thorned on your stack deals Harm, the attacker gains Slowed 2 for 2 rounds.",
    [sw("hedge-clipper-shears")],
  ),
  wonder(
    "cider-flask",
    "Cider Flask",
    "pocket",
    4000,
    "Item act: end Ripening on one of your stacks. It heals 3 HP for each point of Ripening, reviving.",
    [],
    { itemActs: ["cider-flask"] },
  ),
  wonder(
    "notarys-seal",
    "Notary's Seal",
    "ring",
    5000,
    "In each battle, your strongest stack starts with a Scapegoat link to your weakest stack for 3 rounds: damage to it is taken by the weakest.",
    [
      start("own", "strongest", "scapegoat", 3, {
        linkTo: { side: "own", selector: "weakest" },
      }),
    ],
  ),
  wonder(
    "umbrella-of-state",
    "Umbrella of State",
    "shield",
    5000,
    "In each battle, every stack of yours starts Warded 30 for 3 rounds.",
    [start("own", "all", "warded", 3, { size: 30 })],
  ),
  wonder(
    "lightning-rod",
    "Lightning Rod",
    "weapon",
    5000,
    "When Warded saves your stack from Harm, the nearest enemy stack takes the Harm that was saved.",
    [sw("lightning-rod")],
  ),
  wonder(
    "pressed-olive-branch",
    "Pressed Olive Branch",
    "neck",
    4000,
    "In each battle, the strongest enemy stack starts Mollified 30 for 2 rounds.",
    [start("enemy", "strongest", "mollified", 2, { size: 30 })],
  ),
  wonder(
    "drum-majors-baton",
    "Drum Major's Baton",
    "weapon",
    4000,
    "In each battle, your two slowest stacks start Quickened 2 for 3 rounds.",
    [start("own", "slowest", "quickened", 3, { size: 2, count: 2 })],
  ),
  wonder(
    "metronome-spurs",
    "Metronome Spurs",
    "feet",
    4000,
    "When a Quickened stack of yours Strikes, its target gains Slowed 1 for 2 rounds.",
    [sw("metronome-spurs")],
  ),
  wonder(
    "bailiffs-greatcoat",
    "Bailiff's Greatcoat",
    "cloak",
    5000,
    "When a Reckoning falls due on an enemy stack, your weakest stack heals that much HP, reviving.",
    [sw("bailiffs-greatcoat")],
  ),
  wonder(
    "felt-slippers-of-the-night-shift",
    "Felt Slippers of the Night Shift",
    "feet",
    4000,
    "In each battle, the strongest enemy shooter starts Hushed for 2 rounds: it cannot shoot.",
    [start("enemy", "strongest-shooter", "hushed", 2)],
  ),
  wonder(
    "bloodstone-ring",
    "Bloodstone Ring",
    "ring",
    5000,
    "In each battle, the strongest enemy stack starts Leeched 10 for 3 rounds, linked to your weakest stack: each turn it takes 10 Harm and yours heals 10.",
    [
      start("enemy", "strongest", "leeched", 3, {
        size: 10,
        linkTo: { side: "own", selector: "weakest" },
      }),
    ],
  ),
  wonder(
    "leaky-bucket",
    "Leaky Bucket",
    "head",
    4000,
    "In each battle, the strongest enemy stack starts Drenched 50 for 3 rounds.",
    [start("enemy", "strongest", "drenched", 3, { size: 50 })],
  ),
  wonder(
    "whetstone-pendant",
    "Whetstone Pendant",
    "neck",
    6000,
    "When a Fired Up stack of yours kills a whole stack, it becomes Heartened for 1 round.",
    [sw("whetstone-pendant")],
  ),
  // FACTION_CANDY 5.2: a maker of Stuck outside the Candy Kingdom.
  wonder(
    "flypaper-ribbon",
    "Flypaper Ribbon",
    "pocket",
    4000,
    "The first time each of your stacks retaliates in a battle, the stack it strikes becomes Stuck for 2 rounds.",
    [sw("flypaper-ribbon")],
  ),
  // FACTION_DWARVES 5.2: a maker of Steam outside the Deepforge.
  wonder(
    "pocket-boiler",
    "Pocket Boiler",
    "pocket",
    4000,
    "Your stacks that Defend also gain Steam 1, or their Steam grows by 1, to at most 3.",
    [sw("pocket-boiler")],
  ),

  // ------------------------------------------------ Cursed Wonders (6)
  wonder(
    "the-albatross",
    "The Albatross",
    "neck",
    4000,
    "+4 Attack and +4 Defense. Drawback: in every battle your strongest stack is Jinxed 30 throughout.",
    [
      stat("attack", 4),
      stat("defense", 4),
      start("own", "strongest", "jinxed", null, { size: 30 }),
    ],
    { cursed: true },
  ),
  wonder(
    "coat-of-embers",
    "Coat of Embers",
    "cloak",
    4000,
    "Every stack of yours starts each battle Fired Up 4 for 3 rounds. Drawback: each one also starts Burning 8 for 3 rounds.",
    [
      start("own", "all", "fired-up", 3, { size: 4 }),
      start("own", "all", "burning", 3, { size: 8 }),
    ],
    { cursed: true },
  ),
  wonder(
    "iou-pad",
    "IOU Pad",
    "pocket",
    4000,
    "+3 Power. Drawback: your strongest stack starts each battle with Reckoning 80: it takes 80 Harm after 3 rounds.",
    [stat("power", 3), start("own", "strongest", "reckoning", 3, { size: 80 })],
    { cursed: true },
  ),
  wonder(
    "sleeping-cap-of-the-night-watch",
    "Sleeping Cap of the Night Watch",
    "head",
    4000,
    "+4 Lore and 2 more mana back each day. Drawback: your fastest stack starts each battle Asleep for 2 rounds, however big it is.",
    [
      stat("lore", 4),
      { kind: "mana-regen", amount: 2 },
      start("own", "fastest", "asleep", 2, { gate: false }),
    ],
    { cursed: true },
  ),
  wonder(
    "ball-and-chain",
    "Ball and Chain",
    "feet",
    4000,
    "+5 Defense. Drawback: every stack of yours starts each battle Delayed for 2 rounds.",
    [stat("defense", 5), start("own", "all", "delayed", 2)],
    { cursed: true },
  ),
  wonder(
    "the-thirteenth-chime",
    "The Thirteenth Chime",
    "ring",
    4000,
    "+3 Power and +3 Lore. Drawback: your two strongest stacks start each battle Shaken for 3 rounds.",
    [
      stat("power", 3),
      stat("lore", 3),
      start("own", "strongest", "shaken", 3, { count: 2 }),
    ],
    { cursed: true },
  ),

  // ------------------------------------------------ Marvels (4) and pieces (12)
  marvel(
    "the-second-left-glove",
    "The Second Left Glove",
    "ring",
    "Your hero may cast two pages a round, if the second is of a school opposed to the first.",
    [sw("second-cast-opposed")],
    ["the-gloves-thumb", "the-gloves-lining", "the-odd-cufflink"],
  ),
  piece(
    "the-gloves-thumb",
    "The Glove's Thumb",
    "ring",
    "the-second-left-glove",
    "In round 1 your hero may cast two pages, if the second is of a school opposed to the first.",
    [sw("second-cast-opposed-round-1")],
  ),
  piece(
    "the-gloves-lining",
    "The Glove's Lining",
    "cloak",
    "the-second-left-glove",
    "A page costs 25% less mana if its school is opposed to the school of the page you cast the round before.",
    [sw("opposed-page-discount")],
  ),
  piece(
    "the-odd-cufflink",
    "The Odd Cufflink",
    "ring",
    "the-second-left-glove",
    "When you cast a page of a school opposed to your last page this battle, your strongest stack gains Fired Up 3 for 2 rounds.",
    [sw("opposed-cast-fires-up")],
  ),
  marvel(
    "the-hourglass-with-no-bottom",
    "The Hourglass with No Bottom",
    "pocket",
    "Conditions on your stacks never count down, boons, banes and debts alike. Holds still count down.",
    [sw("own-clocks-frozen")],
    ["the-upper-bulb", "the-lower-bulb", "a-pinch-of-sand"],
    { cursed: true },
  ),
  piece(
    "the-upper-bulb",
    "The Upper Bulb",
    "pocket",
    "the-hourglass-with-no-bottom",
    "Banes on your stacks never count down, except Holds.",
    [sw("own-bane-clocks-frozen")],
    { cursed: true },
  ),
  piece(
    "the-lower-bulb",
    "The Lower Bulb",
    "neck",
    "the-hourglass-with-no-bottom",
    "Boons on your strongest stack never count down.",
    [sw("strongest-boon-clocks-frozen")],
  ),
  piece(
    "a-pinch-of-sand",
    "A Pinch of Sand",
    "pocket",
    "the-hourglass-with-no-bottom",
    "Item act: pick a condition. It lasts 2 rounds longer if it is a boon on your stack or a bane on an enemy, or 2 rounds shorter otherwise.",
    [],
    { itemActs: ["a-pinch-of-sand"] },
  ),
  marvel(
    "treaty-ink",
    "Treaty Ink",
    "pocket",
    "When a linked stack dies, its end of the link jumps to the nearest living stack, friend or foe.",
    [sw("link-passes")],
    ["the-quill", "the-blotter", "the-unsigned-treaty"],
  ),
  piece(
    "the-quill",
    "The Quill",
    "weapon",
    "treaty-ink",
    "Links your side makes last 1 round longer.",
    [sw("link-clock-plus-1")],
  ),
  piece(
    "the-blotter",
    "The Blotter",
    "shield",
    "treaty-ink",
    "When the far end of a Scapegoat link on your stack dies, the Harm it could not take is not passed back to your stack.",
    [sw("scapegoat-no-backlash")],
  ),
  piece(
    "the-unsigned-treaty",
    "The Unsigned Treaty",
    "torso",
    "treaty-ink",
    "In each battle, your strongest stack starts with a Scapegoat link to the strongest enemy stack for 1 round: damage to yours is taken by theirs.",
    [
      start("own", "strongest", "scapegoat", 1, {
        linkTo: { side: "enemy", selector: "strongest" },
      }),
    ],
  ),
  marvel(
    "the-unspent-page",
    "The Unspent Page",
    "neck",
    "Pick one page when you put this on: it is never spent. It still costs mana and uses the round's cast.",
    [sw("unspent-page")],
    ["the-torn-corner", "bookbinders-thread", "the-missing-page"],
  ),
  piece(
    "the-torn-corner",
    "The Torn Corner",
    "pocket",
    "the-unspent-page",
    "Each of your tier 1 pages can be cast twice a battle.",
    [sw("tier1-twice")],
  ),
  piece(
    "bookbinders-thread",
    "Bookbinder's Thread",
    "ring",
    "the-unspent-page",
    "The first scroll you cast each battle is not used up.",
    [sw("first-scroll-kept")],
  ),
  piece(
    "the-missing-page",
    "The Missing Page",
    "head",
    "the-unspent-page",
    "+4 Power, but your highest-tier page starts every battle already spent (on a tie, the costliest, then the first in the book).",
    [stat("power", 4), { kind: "missing-page" }],
  ),

  // ------------------------------------------------ Consumables (12)
  consumable(
    "bottled-cheer",
    "Bottled Cheer",
    "potion",
    400,
    "+1 Morale until the end of the hero's next battle.",
    { kind: "next-battle", effects: [{ kind: "morale", amount: 1 }] },
  ),
  consumable(
    "jar-of-fair-chances",
    "Jar of Fair Chances",
    "potion",
    400,
    "+1 Luck until the end of the hero's next battle.",
    { kind: "next-battle", effects: [{ kind: "luck", amount: 1 }] },
  ),
  consumable(
    "blue-tonic",
    "Blue Tonic",
    "potion",
    500,
    "The hero gains 20 mana, even above its maximum.",
    { kind: "mana", amount: 20 },
  ),
  consumable(
    "road-cordial",
    "Road Cordial",
    "potion",
    500,
    "+400 movement points today.",
    { kind: "movement", amount: 400 },
  ),
  consumable(
    "fire-eaters-draught",
    "Fire-Eater's Draught",
    "potion",
    600,
    "In the hero's next battle, its strongest stack starts Fired Up 4 for 3 rounds.",
    {
      kind: "next-battle",
      effects: [start("own", "strongest", "fired-up", 3, { size: 4 })],
    },
  ),
  consumable(
    "witch-hazel",
    "Witch-Hazel",
    "potion",
    600,
    "In the hero's next battle, its weakest stack starts Mending 10 for 4 rounds.",
    {
      kind: "next-battle",
      effects: [start("own", "weakest", "mending", 4, { size: 10 })],
    },
  ),
  consumable(
    "late-harvest-cordial",
    "Late-Harvest Cordial",
    "potion",
    600,
    "In the hero's next battle, its strongest stack starts Ripening 20 for 4 rounds.",
    {
      kind: "next-battle",
      effects: [start("own", "strongest", "ripening", 4, { size: 20 })],
    },
  ),
  consumable(
    "elixir-of-hindsight",
    "Elixir of Hindsight",
    "potion",
    1000,
    "The hero's next skill offer or feat draft is drawn again, once.",
    { kind: "redraw" },
  ),
  consumable(
    "dog-eared-map",
    "Dog-Eared Map",
    "paper",
    800,
    "Marks the exact cell of the nearest buried cache on the map.",
    { kind: "mark-cache" },
  ),
  consumable(
    "letter-of-safe-conduct",
    "Letter of Safe Conduct",
    "paper",
    1200,
    "Until the day ends, a neutral stack next to the hero with a fight value of 3000 or less loses its zone of control against your heroes.",
    { kind: "safe-conduct", maxFightValue: 3000 },
  ),
  consumable(
    "signal-lantern",
    "Signal Lantern",
    "tool",
    500,
    "Reveals every cell within 8 cells of the hero.",
    { kind: "reveal", radius: 8 },
  ),
  consumable(
    "collapsible-shovel",
    "Collapsible Shovel",
    "tool",
    500,
    "The hero digs here at once for 300 movement points, even if it has already moved today.",
    { kind: "dig", movement: 300 },
  ),
];

/** A Marvel (RULES_V2 4.5): assembled from three pieces, worth 20000. */
function marvel(
  id: string,
  name: string,
  slot: SlotKind,
  text: string,
  effects: HeroEffect[],
  pieces: readonly [string, string, string],
  extra: Partial<WornArtifactDef> = {},
): WornArtifactDef {
  return {
    id,
    name,
    kind: "worn",
    slot,
    grade: "marvel",
    value: GRADE_VALUES.marvel,
    text,
    effects,
    pieces,
    ...extra,
  };
}

/** A Marvel piece: a Wonder by grade, worth 6000 (RULES_V2 4.5). */
function piece(
  id: string,
  name: string,
  slot: SlotKind,
  of: string,
  text: string,
  effects: HeroEffect[],
  extra: Partial<WornArtifactDef> = {},
): WornArtifactDef {
  return wonder(id, name, slot, PIECE_VALUE, text, effects, {
    pieceOf: of,
    ...extra,
  });
}

/**
 * Catalogue artifacts whose row exists but whose use waits for another
 * bead, with the reason (tests/data/catalogue-coverage.test.ts reads it).
 * None now: the Collapsible Shovel digs through the map objects' Dig
 * (src/core/game/sites.ts digHere).
 */
export const DEFERRED_ARTIFACTS: Readonly<Record<string, string>> = {};

/**
 * Artifacts in the catalogue but kept out of the game's loot for now: no
 * generated map, Mystery Bag or gallery page holds them. The Deepforge's
 * Pocket Boiler joins with the faction's integration bead (bzc.135), which
 * updates the named-map fingerprints with it.
 */
export const HELD_ARTIFACTS: ReadonlySet<string> = new Set(["pocket-boiler"]);

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
