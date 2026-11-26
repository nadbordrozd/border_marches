/**
 * The adventure-map object catalogue (docs/design/CONTENT_MAP_OBJECTS.md,
 * bead bzc.13): 62 object types, 53 core and 9 stretch, and the four
 * winter sites of bead bzc.87 (placed by the generator's winter rule only). Type ids are the
 * catalogue names in kebab case (shared with the object art of bead
 * bzc.16). A placed object carries its type in `data.type`.
 *
 * Each type names the map object kind it is placed as (the movement and
 * visit family, src/core/map/types.ts), its footprint, reset, base value
 * (gold equivalent, CONTENT_MAP_OBJECTS section 2), preferred terrain and
 * fill weight. The visit rules are in src/core/game/sites.ts; the
 * generator's rows are in ./mapObjects.ts.
 */
import type { MapObjectKind, Terrain } from "../core/map/types.ts";

export const OBJECT_TYPE_IDS = [
  // 3.1 Mines and producers
  "sawmill",
  "ore-pit",
  "essence-spring",
  "gold-mine",
  "haunted-mine",
  "windmill",
  "water-wheel",
  "orchard",
  // 3.2 External dwellings
  "faction-outpost",
  "stray-hut",
  "caretaker-lodge",
  // 3.3 Visitable buildings
  "stat-shrine",
  "learning-stone",
  "arena",
  "library",
  "tree-of-knowledge",
  "academy",
  "tutors-hut",
  "school-shrine",
  "hermit",
  "rally-camp",
  "wishing-well",
  "oasis",
  "school-temple",
  "mana-well",
  "stables",
  "sanctuary",
  "observatory",
  "scholar",
  // 3.4 Banks and the vault
  "overgrown-greenhouse",
  "sealed-registry",
  "stopped-belfry",
  "quiet-yard",
  "thunderstruck-pylon-yard",
  "landfall-wreck",
  "keepers-vault",
  // 3.5 One-time treasure
  "resource-pile",
  "treasure-chest",
  "campfire",
  "loose-artifact",
  "loose-scroll",
  "fallen-adventurer",
  // 3.6 Hidden treasure
  "obelisk",
  "buried-keystone",
  "buried-cache",
  // 3.7 Quests, gates, prisons
  "keymasters-tent",
  "border-gate",
  "seer-hut",
  "quest-gate",
  "prison",
  // 3.8 Services
  "trading-post",
  "tollhouse",
  "drill-yard",
  "curse-lifters-shrine",
  "roadside-inn",
  "altar-of-sacrifice",
  // 3.9 Teleports
  "two-way-waystone",
  "one-way-waystone",
  "pylon",
  // 3.10 Events and signs
  "event-tile",
  "sealed-box",
  "sign",
  // 3.11 Winter sites (bead bzc.87): placed only in and next to snow zones
  "frost-giants-barrow",
  "aurora-spire",
  "hunters-lodge",
  "walrus-rookery",
  // 3.12 Desert sites (bead bzc.88): placed only in desert zones
  "pyramid",
  "sphinx",
  "sun-temple",
  "sunken-tomb",
] as const;

export type ObjectTypeId = (typeof OBJECT_TYPE_IDS)[number];

/** How often a visit can pay (shown on hover). */
export type ResetKind =
  /** A flag: held until another player visits. */
  | "flag"
  /** The first hero to visit each week collects. */
  | "weekly"
  /** Each hero once. */
  | "per-hero"
  /** Once per day per hero. */
  | "per-day"
  /** Once per week per hero. */
  | "per-week-hero"
  /** Every visit (buffs do not stack with themselves). */
  | "each-visit"
  /** The first visitor takes it; it is gone or spent. */
  | "one-time"
  /** Each player once. */
  | "per-player"
  /** A gate: passable to the right players, always. */
  | "permanent";

export const RESET_TEXT: Readonly<Record<ResetKind, string>> = {
  flag: "Flagged until another player visits.",
  weekly: "The first visitor each week collects (new week: day 1).",
  "per-hero": "Each hero once.",
  "per-day": "Once a day per hero.",
  "per-week-hero": "Once a week per hero.",
  "each-visit": "Works on every visit.",
  "one-time": "One-time: the first visitor takes it.",
  "per-player": "Each player once.",
  permanent: "Permanent.",
};

export interface ObjectTypeDef {
  id: ObjectTypeId;
  name: string;
  /** Map object kind it is placed as. */
  kind: MapObjectKind;
  /** Footprint in cells; the entrance is the bottom centre (left of two). */
  w: number;
  h: number;
  stretch: boolean;
  reset: ResetKind;
  /** What a visit does, one or two sentences (hover text). */
  text: string;
  /** Base value (gold equivalent); variants and contents may change it. */
  value: number;
  /** Preferred terrain ([] = any). */
  terrain: readonly Terrain[];
  /** Fill weight 1..10; 0 = placed by a rule (or map-authored). */
  weight: number;
  /** Removed from the map once used (pickups, the scholar, prisons). */
  vanishes: boolean;
}

type Row = [
  ObjectTypeId,
  string,
  MapObjectKind,
  w: number,
  h: number,
  flags: string,
  ResetKind,
  value: number,
  terrain: readonly Terrain[],
  weight: number,
  text: string,
];

const G: Terrain = "grass";
const J: Terrain = "jungle";
const S: Terrain = "steppe";
const B: Terrain = "badlands";
const W: Terrain = "wasteland";
const SN: Terrain = "snow";
const D: Terrain = "sand";

// Flags: "s" stretch, "v" vanishes when used.
const ROWS: readonly Row[] = [
  // prettier-ignore
  ["sawmill", "Sawmill", "mine", 2, 1, "", "flag", 1200, [J, G], 0, "Enter it to claim it: +3 wood each day while you hold it."],
  // prettier-ignore
  ["ore-pit", "Ore Pit", "mine", 2, 1, "", "flag", 1500, [B, S], 0, "Enter it to claim it: +2 ore each day while you hold it."],
  // prettier-ignore
  ["essence-spring", "Essence Spring", "mine", 2, 1, "", "flag", 5000, [W, J], 0, "Enter it to claim it: +1 essence each day while you hold it."],
  // prettier-ignore
  ["gold-mine", "Gold Mine", "mine", 2, 1, "", "flag", 6000, [B, S], 0, "Enter it to claim it: +750 gold each day while you hold it."],
  // prettier-ignore
  ["haunted-mine", "Haunted Mine", "mine", 2, 1, "s", "flag", 3000, [W], 1, "Enter it to claim it: twice the daily yield of a normal mine of its kind. Sextons keep watch beside it."],
  // prettier-ignore
  ["windmill", "Windmill", "site", 2, 2, "", "weekly", 600, [G, S], 4, "The first hero to visit each week collects this week's wood or ore."],
  // prettier-ignore
  ["water-wheel", "Water Wheel", "site", 2, 2, "", "weekly", 1000, [G, J], 3, "The first hero to visit each week collects 1000 gold."],
  // prettier-ignore
  ["orchard", "Orchard", "site", 2, 2, "", "weekly", 800, [J, G], 3, "The first hero to visit each week collects this week's essence or gold."],
  // prettier-ignore
  ["faction-outpost", "Faction Outpost", "dwelling", 2, 2, "", "flag", 1500, [], 5, "Enter it to claim it; then your heroes can recruit its creature here at the normal price. New recruits each week."],
  // prettier-ignore
  ["stray-hut", "Stray Hut", "dwelling", 1, 1, "", "flag", 1500, [], 6, "Enter it to claim it; then your heroes can hire its stray here. New recruits each week."],
  // prettier-ignore
  ["caretaker-lodge", "Caretaker Lodge", "dwelling", 2, 2, "", "flag", 2000, [], 3, "Locked until you finish its errand; then your heroes can hire its caretaker here, as at a stray hut."],
  // prettier-ignore
  ["stat-shrine", "Stat Shrine", "site", 1, 1, "", "per-hero", 1500, [], 6, "The hero gains +1 to the stat the shrine shows."],
  // prettier-ignore
  ["learning-stone", "Learning Stone", "site", 1, 1, "", "per-hero", 1000, [], 5, "The hero gains 1000 experience."],
  // prettier-ignore
  ["arena", "Arena", "site", 2, 2, "", "per-hero", 3000, [S, B], 2, "The hero gains +2 Attack or +2 Defense, your choice."],
  // prettier-ignore
  ["library", "Library", "site", 2, 2, "s", "per-hero", 6000, [], 1, "A hero of level 8 or more gains +1 to all four stats."],
  // prettier-ignore
  ["tree-of-knowledge", "Tree of Knowledge", "site", 1, 1, "", "per-hero", 3000, [J, G], 2, "Pay its price and the hero gains enough experience to reach its next level."],
  // prettier-ignore
  ["academy", "Academy", "site", 2, 2, "s", "per-hero", 1000, [], 2, "Pay 2000 gold: the hero gains +1 to one of the two stats it teaches."],
  // prettier-ignore
  ["tutors-hut", "Tutor's Hut", "site", 1, 1, "", "per-hero", 2000, [], 4, "Teaches its skill at rank 1 to a hero who does not have it and has fewer than six skills."],
  // prettier-ignore
  ["school-shrine", "School Shrine", "site", 1, 1, "", "per-hero", 800, [], 8, "Teaches its spell as a page if the hero can learn it; otherwise gives it as a scroll."],
  // prettier-ignore
  ["hermit", "Hermit", "site", 1, 1, "", "per-hero", 1000, [W, J], 2, "Forget one skill of your choice, or have your next skill offer redrawn."],
  // prettier-ignore
  ["rally-camp", "Rally Camp", "site", 1, 1, "", "each-visit", 300, [], 5, "+1 Morale until the end of the hero's next battle. Visiting again adds no more."],
  // prettier-ignore
  ["wishing-well", "Wishing Well", "site", 1, 1, "", "each-visit", 300, [], 5, "+1 Luck until the end of the hero's next battle. Visiting again adds no more."],
  // prettier-ignore
  ["oasis", "Oasis", "site", 2, 2, "", "per-day", 500, [D, W, B, S], 3, "+1 Morale until the end of the hero's next battle, and 400 more movement points today."],
  // prettier-ignore
  ["school-temple", "School Temple", "site", 2, 2, "", "each-visit", 500, [], 4, "The hero casts pages of its school at +2 Power until the end of its next battle. Visiting again adds no more."],
  // prettier-ignore
  ["mana-well", "Mana Well", "site", 1, 1, "", "per-day", 800, [], 4, "Refills the hero's mana to its maximum."],
  // prettier-ignore
  ["stables", "Stables", "site", 2, 2, "", "per-week-hero", 1000, [G, S], 3, "300 more movement points each day for the rest of this week, starting today."],
  // prettier-ignore
  ["sanctuary", "Sanctuary", "site", 2, 2, "s", "each-visit", 300, [], 1, "A hero standing inside cannot be attacked."],
  // prettier-ignore
  ["observatory", "Observatory", "site", 1, 1, "s", "each-visit", 800, [B, S], 2, "Reveals the map within 12 cells."],
  // prettier-ignore
  ["scholar", "Scholar", "site", 1, 1, "v", "one-time", 1500, [], 4, "The first hero to walk up next to the scholar receives its gift; the scholar then leaves."],
  // prettier-ignore
  ["overgrown-greenhouse", "Overgrown Greenhouse", "bank", 2, 2, "", "one-time", 2500, [J, G], 3, "Groundskeepers guard it; win the battle to take the prize."],
  // prettier-ignore
  ["sealed-registry", "Sealed Registry", "bank", 2, 2, "", "one-time", 2500, [G, S], 3, "Notaries guard it; win the battle to take the prize."],
  // prettier-ignore
  ["stopped-belfry", "Stopped Belfry", "bank", 2, 2, "", "one-time", 2500, [S, B], 3, "Winders guard it; win the battle to take the prize."],
  // prettier-ignore
  ["quiet-yard", "Quiet Yard", "bank", 2, 2, "", "one-time", 2500, [W, B], 3, "Sextons guard it; win the battle to take the prize."],
  // prettier-ignore
  ["thunderstruck-pylon-yard", "Thunderstruck Pylon Yard", "bank", 2, 2, "", "one-time", 2500, [B, S], 3, "Riggers guard it; win the battle to take the prize."],
  // prettier-ignore
  ["landfall-wreck", "Landfall Wreck", "bank", 2, 2, "", "one-time", 2500, [], 4, "Strays of the land guard it; win the battle to take the prize, and some strays join you."],
  // prettier-ignore
  ["keepers-vault", "Keepers' Vault", "bank", 3, 2, "", "one-time", 16000, [], 0, "Guarded by a mix of caretakers; win the battle, then pick one of three treasures to carry out."],
  // prettier-ignore
  ["resource-pile", "Resource Pile", "pickup", 1, 1, "v", "one-time", 0, [], 10, "The first hero to walk up next to it takes it."],
  // prettier-ignore
  ["treasure-chest", "Treasure Chest", "pickup", 1, 1, "v", "one-time", 1000, [], 7, "Walk up next to it, then choose gold or experience (a rich chest holds a Trinket instead)."],
  // prettier-ignore
  ["campfire", "Campfire", "site", 1, 1, "v", "one-time", 1000, [], 4, "Walk up next to it to take gold and wood or ore."],
  // prettier-ignore
  ["loose-artifact", "Loose Artifact", "artifact", 1, 1, "v", "one-time", 2000, [], 5, "Walk up next to it to put it in the hero's backpack."],
  // prettier-ignore
  ["loose-scroll", "Loose Scroll", "site", 1, 1, "v", "one-time", 600, [], 5, "Walk up next to it to put it in the hero's scroll case."],
  // prettier-ignore
  ["fallen-adventurer", "Fallen Adventurer", "site", 1, 1, "v", "one-time", 4500, [W, B], 2, "Walk up next to it to take the adventurer's Wonder, but -2 Morale until the end of the hero's next battle."],
  // prettier-ignore
  ["obelisk", "Obelisk", "site", 1, 1, "", "per-player", 500, [], 0, "Uncovers one more piece of your puzzle map, which leads to the buried Keystone."],
  // prettier-ignore
  ["buried-keystone", "Buried Keystone", "buried", 1, 1, "v", "one-time", 30000, [], 0, "Buried: dig on its cell to find the Keystone."],
  // prettier-ignore
  ["buried-cache", "Buried Cache", "buried", 1, 1, "v", "one-time", 4000, [], 0, "Buried: dig on its cell to find 2000 gold and a Trinket."],
  // prettier-ignore
  ["keymasters-tent", "Keymaster's Tent", "site", 1, 1, "", "per-player", 0, [], 0, "Gives you the key of its colour for the rest of the game."],
  // prettier-ignore
  ["border-gate", "Border Gate", "gate", 1, 1, "", "permanent", 0, [], 0, "Only heroes of a player with the key of its colour can pass."],
  // prettier-ignore
  ["seer-hut", "Seer Hut", "site", 1, 1, "", "one-time", 2000, [], 4, "Gives a quest and shows its reward; the first player to finish the quest and come back gets the reward."],
  // prettier-ignore
  ["quest-gate", "Quest Gate", "gate", 1, 1, "", "per-player", 0, [], 0, "Your heroes can pass once you have finished its quest."],
  // prettier-ignore
  ["prison", "Prison", "site", 1, 1, "v", "one-time", 4500, [], 1, "Walk up next to it to free a named hero, who joins you if you have fewer than 8 heroes."],
  // prettier-ignore
  ["trading-post", "Trading Post", "site", 2, 2, "", "each-visit", 0, [], 2, "Trade resources at the marketplace rates."],
  // prettier-ignore
  ["tollhouse", "Tollhouse", "site", 2, 2, "", "each-visit", 0, [], 3, "Sells three items at their full value and buys artifacts and scrolls at half value. New stock each week."],
  // prettier-ignore
  ["drill-yard", "Drill Yard", "site", 2, 2, "", "each-visit", 0, [], 0, "Sells the Drill of a creature in the hero's army for twice its gold cost in town. You keep it for the rest of the game."],
  // prettier-ignore
  ["curse-lifters-shrine", "Curse-Lifter's Shrine", "site", 1, 1, "", "each-visit", 0, [], 2, "Takes one cursed artifact off the hero, into its backpack, for 1000 gold and 2 essence."],
  // prettier-ignore
  ["roadside-inn", "Roadside Inn", "site", 2, 2, "s", "each-visit", 0, [], 2, "Sells a rumour for 250 gold telling where a buried cache lies. A new rumour each week."],
  // prettier-ignore
  ["altar-of-sacrifice", "Altar of Sacrifice", "site", 1, 1, "s", "each-visit", 0, [W], 1, "Give up creatures for experience equal to their total HP, or an artifact for half its value."],
  // prettier-ignore
  ["two-way-waystone", "Two-Way Waystone", "teleport", 1, 1, "", "each-visit", 0, [], 0, "Step on it to appear on its twin of the same colour."],
  // prettier-ignore
  ["one-way-waystone", "One-Way Waystone", "teleport", 1, 1, "s", "each-visit", 0, [], 0, "Step on it to appear at its exit."],
  // prettier-ignore
  ["pylon", "Pylon", "site", 1, 1, "", "per-player", 500, [], 0, "Visit it to mark it for you: the Tow Line spell carries heroes between your marked pylons."],
  // prettier-ignore
  ["event-tile", "Event Tile", "site", 1, 1, "v", "one-time", 0, [], 0, "Something happens to the first hero to enter."],
  // prettier-ignore
  ["sealed-box", "Sealed Box", "site", 1, 1, "v", "one-time", 3000, [], 3, "The first hero to walk up next to it opens it; what is inside is a surprise."],
  // prettier-ignore
  ["sign", "Sign", "site", 1, 1, "s", "each-visit", 0, [], 0, "Shows its text."],
  // Winter sites (bead bzc.87): weight 0, placed by the winter rule in and
  // next to snow zones (gen/objects.ts), so maps without snow are unchanged.
  // prettier-ignore
  ["frost-giants-barrow", "Frost Giant's Barrow", "bank", 2, 2, "", "one-time", 6500, [SN], 0, "Rime Walruses den in a frost giant's tomb; win the battle to take the giant's hoard: its artifacts, gold and ore."],
  // prettier-ignore
  ["aurora-spire", "Aurora Spire", "site", 1, 1, "", "per-hero", 3000, [SN], 0, "The hero gains a rank in the spire's school of magic (rank 1 if it lacks the school's skill and has a free skill slot) and its mana is refilled."],
  // prettier-ignore
  ["hunters-lodge", "Hunter's Lodge", "site", 2, 2, "", "per-week-hero", 1000, [SN], 0, "Snowshoes: snow costs the hero no more than grass until its next battle ends; and the hunters guide it: +300 movement today."],
  // prettier-ignore
  ["walrus-rookery", "Walrus Rookery", "dwelling", 2, 2, "", "flag", 4500, [SN], 0, "Enter it to claim it; then your heroes can hire Rime Walruses here, 2 a week at 1300 gold each. Rime Walruses keep watch beside it."],
  // 3.12 Desert sites (bead bzc.88): weight 0, placed by the desert rule
  // (gen/desert.ts) in the desert zones only.
  // prettier-ignore
  ["pyramid", "Pyramid", "bank", 3, 2, "", "one-time", 15000, [D], 0, "The Restless dead guard its burial chamber; win the battle to take the pharaoh's treasure: a Wonder, a great spell and gold. One to a map."],
  // prettier-ignore
  ["sphinx", "Sphinx", "site", 2, 2, "", "per-hero", 3000, [D], 0, "Answer the sphinx's riddle. Right: a rank in one of the hero's skills (or 2500 experience). Wrong: the hero loses the rest of today's movement. Each hero gets one try."],
  // prettier-ignore
  ["sun-temple", "Sun Temple", "site", 2, 2, "", "each-visit", 600, [D], 0, "+2 Attack until the end of the hero's next battle. Visiting again adds no more."],
  // prettier-ignore
  ["sunken-tomb", "Sunken Tomb", "bank", 2, 2, "", "one-time", 2500, [D], 0, "Restless dead guard it; win the battle to take the grave goods."],
];

export const OBJECT_TYPES: Readonly<Record<ObjectTypeId, ObjectTypeDef>> =
  Object.fromEntries(
    ROWS.map(
      ([id, name, kind, w, h, flags, reset, value, terrain, weight, text]) => [
        id,
        {
          id,
          name,
          kind,
          w,
          h,
          stretch: flags.includes("s"),
          reset,
          text,
          value,
          terrain,
          weight,
          vanishes: flags.includes("v"),
        },
      ],
    ),
  ) as Record<ObjectTypeId, ObjectTypeDef>;

export function isObjectTypeId(id: unknown): id is ObjectTypeId {
  return typeof id === "string" && Object.hasOwn(OBJECT_TYPES, id);
}

/** Bank sizes (CONTENT_MAP_OBJECTS section 4). */
export type BankSize = "small" | "medium" | "large";

export const BANK_VALUE: Readonly<Record<BankSize, number>> = {
  small: 2500,
  medium: 6500,
  large: 15000,
};

/** A bank's guard is this share of its prize, in fight value. */
export const BANK_GUARD_SHARE = 0.6;

/** The vault's value; its guard is 60% of it. */
export const VAULT_VALUE = 16000;

/** Movement points a dig costs: all of today's (shovel: 300). */
export const SHOVEL_DIG_MP = 300;

/** Bonus movement of stables (per day) and an oasis (today). */
export const STABLES_MP = 300;
export const OASIS_MP = 400;

/** A Hunter's Lodge (bead bzc.87): movement today, and the snowshoes' cut. */
export const HUNTERS_LODGE_MP = 300;
/** Snowshoes take this off a snow step (150 down to the 100 of grass). */
export const SNOWSHOES_REDUCE = 50;

/** A Walrus Rookery's weekly Rime Walruses and their price (FV 868 x 1.5). */
export const ROOKERY_WEEKLY = 2;
export const ROOKERY_HIRE = 1300;

/** A drill yard sells a Drill for this many times its town gold cost (ECONOMY 6.3). */
export const DRILL_YARD_MARKUP = 2;

/** The Pyramid's value (a large bank's); its guard is 60% of it. */
export const PYRAMID_VALUE = 15000;

/** Experience of a sphinx's riddle answered right (no skill to raise). */
export const SPHINX_XP = 2500;

/** Attack of a Sun Temple's blessing, until the next battle ends. */
export const SUN_TEMPLE_ATTACK = 2;

/** Heroes a player may hold (a prison's hero needs a free place). */
export const MAX_HEROES = 8;

/** Key and waystone colours. */
export const GATE_COLOURS = ["red", "blue", "green", "yellow"] as const;

/** Waystone pair colours (the art of bead bzc.16). */
export const WAYSTONE_COLOURS = ["amber", "blue", "crimson", "teal"] as const;
export type GateColour = (typeof GATE_COLOURS)[number];

/** What a bank, quest, box or event gives (CONTENT_MAP_OBJECTS 3-5). */
export interface Prize {
  gold?: number;
  wood?: number;
  ore?: number;
  essence?: number;
  xp?: number;
  /** Artifact ids (to the backpack). */
  artifacts?: string[];
  /** Spell ids (to the scroll case). */
  scrolls?: string[];
  /** Creatures that join the hero's army. */
  joiners?: Array<{ creature: string; count: number }>;
  /** A primary stat raised. */
  stat?: { stat: "attack" | "defense" | "power" | "lore"; amount: number };
  /** A skill: rank 1, or one more rank if the hero has it. */
  skill?: string;
  /** A spell: a page if the hero can learn it, else a scroll. */
  spell?: string;
}

/** A quest of a seer hut, quest gate or lodge errand (section 5). */
export type Quest =
  | { kind: "artifact"; artifact: string }
  | { kind: "creatures"; creature: string; count: number }
  | {
      kind: "resources";
      cost: { gold?: number; wood?: number; ore?: number; essence?: number };
    }
  | { kind: "level"; level: number }
  /** Defeat the neutral stack with this map object id. */
  | { kind: "guard"; monster: string }
  /** Visit the object with this id with any hero, then return. */
  | { kind: "visit"; object: string };

/** A site buff's effect on the hero until its next battle ends. */
export function siteBuffEffect(buff: string): {
  label: string;
  morale?: number;
  luck?: number;
  school?: string;
  power?: number;
  /** Cheaper steps on one terrain (a Hunter's Lodge's snowshoes). */
  terrain?: { terrain: Terrain; reduce: number };
  attack?: number;
} {
  if (buff.startsWith("school-temple:")) {
    return {
      label: "School Temple",
      school: buff.slice("school-temple:".length),
      power: 2,
    };
  }
  switch (buff) {
    case "rally-camp":
      return { label: "Rally Camp", morale: 1 };
    case "wishing-well":
      return { label: "Wishing Well", luck: 1 };
    case "oasis":
      return { label: "Oasis", morale: 1 };
    case "fallen-adventurer":
      return { label: "Fallen Adventurer", morale: -2 };
    case "hunters-lodge":
      return {
        label: "Snowshoes",
        terrain: { terrain: "snow", reduce: SNOWSHOES_REDUCE },
      };
    case "sun-temple":
      return { label: "Sun Temple", attack: SUN_TEMPLE_ATTACK };
    default:
      return { label: buff };
  }
}
