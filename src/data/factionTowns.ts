/**
 * The v0.2 town trees: the Realm's Castle (FACTION_HUMANS.md section 9),
 * the Restless's Churchyard (FACTION_UNDEAD.md 9), the Horde's Warcamp
 * (FACTION_GOBLINS.md 9), the Candy Kingdom's Confectionery
 * (FACTION_CANDY.md 9) and the Deepforge's Steamworks (FACTION_DWARVES.md
 * 9), with the buildings every town shares
 * (ECONOMY.md 6: halls, forts, Marketplace, Resource Silo, Magic Guild,
 * Tavern, the Keystone Hall) and the harbour (NAVAL.md 5.7: Shipyard,
 * Lighthouse, Admiralty, for naval maps only).
 *
 * Shared buildings use the same ids in every tree ("fort-1",
 * "magic-guild-2", "shipyard", ...) with the faction's names; dwellings,
 * Drills and specials have their own ids.
 */
import {
  ADMIRALTY_DECK_GUN_HARM,
  ADMIRALTY_SHIP_PRICE,
  ADMIRALTY_SPECIAL,
  HARBOUR_ADMIRALTY,
  HARBOUR_LIGHTHOUSE,
  HARBOUR_SHIPYARD,
  SHIP_PRICE,
  TOWN_LIGHTHOUSE_SEA_MP,
} from "./naval.ts";
import type { BuildingDef, CreatureId, ResourceAmounts } from "./types.ts";

/** Flags of the town specials and Keystone powers (BuildingDef.special). */
export const SPECIALS = {
  titheBarn: "tithe-barn",
  chapelOfOaths: "chapel-of-oaths",
  roundTable: "round-table",
  essenceStill: "essence-still",
  familyCrypt: "family-crypt",
  hallOfAncestors: "hall-of-ancestors",
  lootPile: "loot-pile",
  launchRamp: "launch-ramp",
  greatFlinger: "great-flinger",
  bakery: "bakery",
  larder: "larder",
  fourOClock: "the-four-oclock",
  deepShaft: "deep-shaft",
  repairYard: "repair-yard",
  greatBoiler: "the-great-boiler",
  /** The harbour's Admiralty (NAVAL 5.7): +20 deck gun Harm. */
  admiralty: ADMIRALTY_SPECIAL,
} as const;

/**
 * The Repair Yard (FACTION_DWARVES 9): after a battle won by a hero of its
 * owner, each machine stack of that hero's army gets back this share of
 * the creatures it lost (rounded down; one Repair Yard counts per player).
 */
export const REPAIR_YARD_SHARE = { num: 1, den: 3 } as const;

/** The Bakery's extra Gingerbread Men a week (FACTION_CANDY 9). */
export const BAKERY_GROWTH = 8;

/** Keystone Hall: +2000 gold a day and +50% growth (ECONOMY 6.2). */
export const KEYSTONE_INCOME = 2000;
/** Morale the Round Table gives every army of its owner. */
export const ROUND_TABLE_MORALE = 2;
/** The map's Keystone as a carried item id (CONTENT_MAP_OBJECTS 4). */
export const KEYSTONE_ITEM = "keystone";

interface FactionNames {
  fort: readonly [string, string, string];
  /** Shipyard, Lighthouse and Admiralty (NAVAL 5.7). */
  harbour: readonly [string, string, string];
  guildCap: 3 | 4 | 5;
  keystone: { id: string; name: string; special: string; effect: string };
}

function b(
  def: Omit<BuildingDef, "startBuilt" | "requires"> &
    Partial<Pick<BuildingDef, "startBuilt" | "requires">>,
): BuildingDef {
  return { startBuilt: false, requires: [], ...def };
}

const GUILD_COSTS: readonly ResourceAmounts[] = [
  { gold: 1500, wood: 5, ore: 5 },
  { gold: 1500, wood: 5, ore: 5, essence: 1 },
  { gold: 2000, wood: 5, ore: 5, essence: 2 },
  { gold: 2500, wood: 10, ore: 10, essence: 4 },
  { gold: 3500, wood: 10, ore: 10, essence: 6 },
];

const GUILD_TEXT = [
  "Teaches four tier 1 spells; heroes in town start each day with full mana",
  "Teaches three tier 2 spells, one of them a condition tool",
  "Teaches three tier 3 spells; takes a cursed artifact off a hero for 2000 gold",
  "Teaches two tier 4 spells",
  "Teaches one tier 5 spell",
];

/** The buildings every town shares (ECONOMY 6.1, 6.2). */
function commonBuildings(names: FactionNames): BuildingDef[] {
  const out: BuildingDef[] = [
    b({
      id: "village-hall",
      name: "Village Hall",
      cost: {},
      startBuilt: true,
      hallIncome: 500,
      effect: "+500 gold per day",
    }),
    b({
      id: "town-hall",
      name: "Town Hall",
      cost: { gold: 2500, wood: 5, ore: 2 },
      hallIncome: 1000,
      effect: "+1000 gold per day, in place of the Village Hall's 500",
    }),
    b({
      id: "city-hall",
      name: "City Hall",
      cost: { gold: 5000, wood: 10, ore: 5, essence: 3 },
      requires: ["town-hall", "fort-1", "marketplace"],
      hallIncome: 2000,
      effect: "+2000 gold per day, in place of the Town Hall's 1000",
    }),
    b({
      id: "fort-1",
      name: names.fort[0],
      cost: { gold: 2000, wood: 15 },
      fortLevel: 1,
      effect: "Town defenders get +2 Defense; needed for tier 3 dwellings",
    }),
    b({
      id: "fort-2",
      name: names.fort[1],
      cost: { gold: 3000, wood: 10, ore: 10 },
      requires: ["fort-1"],
      fortLevel: 2,
      effect: "Town defenders get +4 Defense",
    }),
    b({
      id: "fort-3",
      name: names.fort[2],
      cost: { gold: 5000, wood: 10, ore: 15, essence: 2 },
      requires: ["fort-2", "city-hall"],
      fortLevel: 3,
      effect: "Town defenders get +6 Defense and a tower",
    }),
    b({
      id: "marketplace",
      name: "Marketplace",
      cost: { gold: 500, wood: 5 },
      marketplace: true,
      effect: "Trade resources at fixed rates",
    }),
    b({
      id: "resource-silo",
      name: "Resource Silo",
      cost: { gold: 1500, ore: 5 },
      requires: ["marketplace"],
      income: { wood: 1, ore: 1 },
      effect: "+1 wood and +1 ore per day",
    }),
    b({
      id: "tavern",
      name: "Tavern",
      cost: {},
      startBuilt: true,
      tavern: true,
      effect: "Hire heroes for 2500 gold",
    }),
  ];
  for (let level = 1; level <= names.guildCap; level++) {
    out.push(
      b({
        id: `magic-guild-${level}`,
        name: `Magic Guild ${level}`,
        cost: GUILD_COSTS[level - 1] as ResourceAmounts,
        requires: [
          ...(level > 1 ? [`magic-guild-${level - 1}`] : []),
          ...(level === 4 ? ["city-hall"] : []),
        ],
        guildLevel: level,
        effect: GUILD_TEXT[level - 1] as string,
      }),
    );
  }
  out.push(
    b({
      id: names.keystone.id,
      name: names.keystone.name,
      cost: {},
      requires: ["city-hall"],
      needsKeystone: true,
      income: { gold: KEYSTONE_INCOME },
      growthBonus: true,
      special: names.keystone.special,
      effect: `Needs the Keystone. +${KEYSTONE_INCOME} gold a day, +50% creature growth; ${names.keystone.effect}`,
    }),
  );
  return out;
}

/**
 * The three harbour buildings every town shares, named per faction
 * (NAVAL 5.7, bead bzc.150). Only a naval map's towns with a dock build
 * them (src/core/game/town.ts buildStatus); other maps never show them.
 */
function harbourBuildings(names: FactionNames): BuildingDef[] {
  const [shipyard, lighthouse, admiralty] = names.harbour;
  return [
    b({
      id: HARBOUR_SHIPYARD,
      name: shipyard,
      cost: { gold: 2000, wood: 10 },
      harbour: "shipyard",
      effect: `Buy ships for ${SHIP_PRICE.gold} gold and ${SHIP_PRICE.wood} wood each; a new ship waits at the town's dock. Coastal towns only`,
    }),
    b({
      id: HARBOUR_LIGHTHOUSE,
      name: lighthouse,
      cost: { gold: 1500, ore: 5 },
      requires: [HARBOUR_SHIPYARD],
      harbour: "lighthouse",
      effect: `+${TOWN_LIGHTHOUSE_SEA_MP} sea movement a day for every hero of yours afloat (one Lighthouse counts, however many you own)`,
    }),
    b({
      id: HARBOUR_ADMIRALTY,
      name: admiralty,
      cost: { gold: 3000, wood: 5, ore: 5, essence: 2 },
      requires: [HARBOUR_LIGHTHOUSE, "town-hall"],
      harbour: "admiralty",
      special: ADMIRALTY_SPECIAL,
      effect: `Ships bought here cost ${ADMIRALTY_SHIP_PRICE.gold} gold and ${ADMIRALTY_SHIP_PRICE.wood} wood; your heroes' deck guns deal +${ADMIRALTY_DECK_GUN_HARM} Harm (one Admiralty counts)`,
    }),
  ];
}

function dwelling(
  id: string,
  name: string,
  creature: CreatureId,
  plural: string,
  cost: ResourceAmounts,
  requires: string[],
  startBuilt = false,
): BuildingDef {
  return b({
    id,
    name,
    cost,
    requires,
    startBuilt,
    dwelling: creature,
    effect: `Recruits ${plural}`,
  });
}

function drill(
  id: string,
  name: string,
  creature: CreatureId,
  ability: string,
  text: string,
  cost: ResourceAmounts,
  requires: string[],
): BuildingDef {
  return b({
    id,
    name,
    cost,
    requires,
    drill: { creature, ability },
    effect: `Drill: ${text}`,
  });
}

export interface TreeData {
  buildings: Readonly<Record<string, BuildingDef>>;
  order: readonly string[];
}

function tree(defs: readonly BuildingDef[]): TreeData {
  const buildings: Record<string, BuildingDef> = {};
  for (const d of defs) {
    if (buildings[d.id] !== undefined) throw new Error(`duplicate ${d.id}`);
    buildings[d.id] = d;
  }
  return { buildings, order: defs.map((d) => d.id) };
}

/**
 * Puts the shared buildings first, then the faction's own, then the
 * harbour (NAVAL 5.7), with the Keystone building last.
 */
function assemble(names: FactionNames, own: readonly BuildingDef[]): TreeData {
  const common = commonBuildings(names);
  const keystone = common.pop() as BuildingDef;
  return tree([...common, ...own, ...harbourBuildings(names), keystone]);
}

export const REALM_TREE: TreeData = assemble(
  {
    fort: ["Palisade", "Keep", "Royal Castle"],
    harbour: ["Royal Docks", "Harbour Light", "Admiralty"],
    guildCap: 4,
    keystone: {
      id: "round-table",
      name: "Round Table",
      special: SPECIALS.roundTable,
      effect: "all your armies get +2 Morale",
    },
  },
  [
    dwelling(
      "squires-hall",
      "Squires' Hall",
      "squire",
      "Squires",
      {},
      [],
      true,
    ),
    dwelling(
      "archery-range",
      "Archery Range",
      "longbowman",
      "Longbowmen",
      { gold: 800, wood: 5, ore: 2 },
      ["squires-hall"],
    ),
    dwelling(
      "barracks",
      "Barracks",
      "man-at-arms",
      "Men-at-Arms",
      { gold: 1200, wood: 5, ore: 5 },
      ["fort-1"],
    ),
    dwelling(
      "friary",
      "Friary",
      "friar",
      "Friars",
      { gold: 2000, wood: 10, essence: 2 },
      ["archery-range"],
    ),
    dwelling(
      "stables",
      "Stables",
      "knight",
      "Knights",
      { gold: 4000, wood: 10, ore: 10 },
      ["barracks"],
    ),
    dwelling(
      "slayers-lodge",
      "Slayers' Lodge",
      "dragonslayer",
      "Dragonslayers",
      { gold: 8000, wood: 10, ore: 10, essence: 6 },
      ["stables", "friary"],
    ),
    drill(
      "butts",
      "Butts",
      "longbowman",
      "pin-down",
      "Longbowmen gain Pin Down",
      { gold: 1000, wood: 5 },
      ["archery-range"],
    ),
    drill(
      "guardroom",
      "Guardroom",
      "man-at-arms",
      "bodyguard",
      "Men-at-Arms gain Bodyguard",
      { gold: 1500, ore: 5 },
      ["barracks"],
    ),
    drill(
      "tiltyard",
      "Tiltyard",
      "knight",
      "follow-through",
      "Knights gain Follow Through",
      { gold: 2500, wood: 10, ore: 5 },
      ["stables"],
    ),
    b({
      id: "tithe-barn",
      name: "Tithe Barn",
      cost: { gold: 1500, wood: 10 },
      requires: ["marketplace"],
      income: { gold: 250 },
      special: SPECIALS.titheBarn,
      effect: "+250 gold per day",
    }),
    b({
      id: "chapel-of-oaths",
      name: "Chapel of Oaths",
      cost: { gold: 3000, wood: 10, ore: 5, essence: 2 },
      requires: ["friary"],
      special: SPECIALS.chapelOfOaths,
      effect:
        "In your battles, when one stack of a Sworn pair dies, the other becomes Heartened and Lucky",
    }),
  ],
);

export const CHURCHYARD_TREE: TreeData = assemble(
  {
    fort: ["Iron Railings", "Lych Wall", "Black Gate"],
    harbour: ["Bone Wharf", "Corpse-Candle Tower", "Ghost Fleet Office"],
    guildCap: 5,
    keystone: {
      id: "hall-of-ancestors",
      name: "Hall of Ancestors",
      special: SPECIALS.hallOfAncestors,
      effect:
        "your stacks that got up stay after a battle you win instead of crumbling",
    },
  },
  [
    dwelling(
      "potters-field",
      "Potter's Field",
      "skeleton",
      "Skeletons",
      {},
      [],
      true,
    ),
    dwelling(
      "charnel-pit",
      "Charnel Pit",
      "ghoul",
      "Ghouls",
      { gold: 800, wood: 2, ore: 5 },
      ["potters-field"],
    ),
    dwelling(
      "wailing-tower",
      "Wailing Tower",
      "banshee",
      "Banshees",
      { gold: 1200, wood: 5, ore: 5 },
      ["fort-1"],
    ),
    dwelling(
      "funeral-parlour",
      "Funeral Parlour",
      "gravecaller",
      "Gravecallers",
      { gold: 2000, ore: 5, essence: 3 },
      ["charnel-pit"],
    ),
    dwelling(
      "manor",
      "Manor",
      "vampire",
      "Vampires",
      { gold: 4000, wood: 5, ore: 10, essence: 2 },
      ["wailing-tower"],
    ),
    dwelling(
      "royal-mausoleum",
      "Royal Mausoleum",
      "late-king",
      "Late Kings",
      { gold: 8000, wood: 5, ore: 10, essence: 6 },
      ["manor", "funeral-parlour"],
    ),
    drill(
      "bone-yard",
      "Bone Yard",
      "skeleton",
      "spare-parts",
      "Skeletons gain Spare Parts",
      { gold: 1000, ore: 5 },
      ["fort-1"],
    ),
    drill(
      "rot-cellar",
      "Rot Cellar",
      "ghoul",
      "grave-rot",
      "Ghouls gain Grave Rot",
      { gold: 1000, wood: 5, essence: 1 },
      ["charnel-pit"],
    ),
    drill(
      "drawing-room",
      "Drawing Room",
      "vampire",
      "mesmerise",
      "Vampires gain Mesmerise",
      { gold: 2500, ore: 5, essence: 2 },
      ["manor"],
    ),
    b({
      id: "essence-still",
      name: "Essence Still",
      cost: { gold: 2000, wood: 5, ore: 5 },
      requires: ["marketplace"],
      evenDayIncome: { essence: 1 },
      special: SPECIALS.essenceStill,
      effect: "+1 essence on every even day",
    }),
    b({
      id: "family-crypt",
      name: "Family Crypt",
      cost: { gold: 3000, ore: 10, essence: 2 },
      requires: ["funeral-parlour"],
      special: SPECIALS.familyCrypt,
      effect:
        "Your native stacks get up with half their starting count (rounded up) instead of a third",
    }),
  ],
);

export const WARCAMP_TREE: TreeData = assemble(
  {
    fort: ["Stakes", "Scrap Wall", "Skull Tower"],
    harbour: ["Raft Yard", "Bonfire Beacon", "Pirate King's Tent"],
    guildCap: 3,
    keystone: {
      id: "great-flinger",
      name: "The Great Flinger",
      special: SPECIALS.greatFlinger,
      effect: "every native stack in your armies has Cannonball",
    },
  },
  [
    dwelling("goblin-holes", "Goblin Holes", "goblin", "Goblins", {}, [], true),
    dwelling(
      "powder-shed",
      "Powder Shed",
      "bomb-chucker",
      "Bomb Chuckers",
      { gold: 700, wood: 8 },
      ["goblin-holes"],
    ),
    dwelling(
      "wolf-kennels",
      "Wolf Kennels",
      "wolf-rider",
      "Wolf Riders",
      { gold: 1000, wood: 8 },
      ["fort-1"],
    ),
    dwelling(
      "hex-hut",
      "Hex Hut",
      "boomshaman",
      "Boomshamans",
      { gold: 1800, wood: 10, essence: 2 },
      ["powder-shed"],
    ),
    dwelling(
      "ogre-pit",
      "Ogre Pit",
      "ogre",
      "Ogres",
      { gold: 3500, wood: 15, ore: 5 },
      ["wolf-kennels"],
    ),
    dwelling(
      "boss-tent",
      "Boss Tent",
      "orc-warboss",
      "Orc Warbosses",
      { gold: 7000, wood: 20, ore: 10, essence: 3 },
      ["ogre-pit", "hex-hut"],
    ),
    drill(
      "mosh-pit",
      "Mosh Pit",
      "goblin",
      "mob",
      "Goblins gain Mob",
      { gold: 800, wood: 5 },
      ["fort-1"],
    ),
    drill(
      "pitch-vats",
      "Pitch Vats",
      "bomb-chucker",
      "fire-pots",
      "Bomb Chuckers gain Fire Pots",
      { gold: 1000, wood: 8 },
      ["powder-shed"],
    ),
    drill(
      "racing-track",
      "Racing Track",
      "wolf-rider",
      "hit-and-run",
      "Wolf Riders gain Hit and Run",
      { gold: 1500, wood: 10 },
      ["wolf-kennels"],
    ),
    b({
      id: "loot-pile",
      name: "Loot Pile",
      cost: { gold: 1500, wood: 10 },
      requires: ["marketplace"],
      special: SPECIALS.lootPile,
      effect:
        "After each battle your hero wins, gold equal to the experience it earned (only one Loot Pile counts)",
    }),
    b({
      id: "launch-ramp",
      name: "Launch Ramp",
      cost: { gold: 2500, wood: 15, ore: 5 },
      requires: ["ogre-pit"],
      special: SPECIALS.launchRamp,
      effect: "In your battles, a native that is Launched also becomes Lucky",
    }),
  ],
);

export const CONFECTIONERY_TREE: TreeData = assemble(
  {
    fort: ["Candy-Cane Fence", "Gingerbread Wall", "Sugar-Glass Keep"],
    harbour: ["Gumdrop Marina", "Peppermint Light", "Licorice Admiralty"],
    guildCap: 4,
    keystone: {
      id: "the-four-oclock",
      name: "The Four O'Clock",
      special: SPECIALS.fourOClock,
      effect:
        "every native stack in your armies starts each battle Hastened for 1 round",
    },
  },
  [
    dwelling(
      "gingerbread-house",
      "Gingerbread House",
      "gingerbread-man",
      "Gingerbread Men",
      {},
      [],
      true,
    ),
    dwelling(
      "mint-range",
      "Mint Range",
      "peppermint-archer",
      "Peppermint Archers",
      { gold: 750, wood: 5, essence: 1 },
      ["gingerbread-house"],
    ),
    dwelling(
      "taffy-ranch",
      "Taffy Ranch",
      "taffy-wrangler",
      "Taffy Wranglers",
      { gold: 1200, wood: 10 },
      ["fort-1"],
    ),
    dwelling(
      "sugarplum-bower",
      "Sugarplum Bower",
      "sugarplum",
      "Sugarplums",
      { gold: 2000, wood: 5, essence: 4 },
      ["mint-range"],
    ),
    dwelling(
      "gummy-den",
      "Gummy Den",
      "gummy-bear",
      "Gummy Bears",
      { gold: 3800, wood: 10, ore: 3, essence: 3 },
      ["taffy-ranch"],
    ),
    dwelling(
      "rock-candy-grotto",
      "Rock Candy Grotto",
      "rock-candy-dragon",
      "Rock Candy Dragons",
      { gold: 8000, wood: 10, ore: 5, essence: 8 },
      ["gummy-den", "sugarplum-bower"],
    ),
    drill(
      "bread-oven",
      "Bread Oven",
      "gingerbread-man",
      "hot-from-the-oven",
      "Gingerbread Men gain Hot from the Oven",
      { gold: 800, wood: 5 },
      ["gingerbread-house"],
    ),
    drill(
      "mint-press",
      "Mint Press",
      "peppermint-archer",
      "cool-mint",
      "Peppermint Archers gain Cool Mint",
      { gold: 1000, wood: 5, essence: 1 },
      ["mint-range"],
    ),
    drill(
      "pulling-hooks",
      "Pulling Hooks",
      "taffy-wrangler",
      "long-pull",
      "Taffy Wranglers gain Long Pull",
      { gold: 1500, wood: 10 },
      ["taffy-ranch"],
    ),
    b({
      id: "bakery",
      name: "Bakery",
      cost: { gold: 1000, wood: 5 },
      requires: ["gingerbread-house"],
      growthExtra: { creature: "gingerbread-man", amount: BAKERY_GROWTH },
      special: SPECIALS.bakery,
      effect: `+${BAKERY_GROWTH} Gingerbread Men a week in this town`,
    }),
    b({
      id: "larder",
      name: "Larder",
      cost: { gold: 3000, wood: 5, essence: 3 },
      requires: ["sugarplum-bower"],
      special: SPECIALS.larder,
      effect:
        "In your battles, a native stack that ends a walk on sweets eats them: it becomes Hastened for 2 rounds and heals 5 HP per creature, reviving",
    }),
  ],
);

export const STEAMWORKS_TREE: TreeData = assemble(
  {
    fort: ["Riveted Palisade", "Ironbound Wall", "Gun Keep"],
    harbour: ["Dry Dock", "Lamp Engine", "Ironclad Board"],
    guildCap: 4,
    keystone: {
      id: "the-great-boiler",
      name: "The Great Boiler",
      special: SPECIALS.greatBoiler,
      effect:
        "every native stack in your armies starts each battle with Steam 1",
    },
  },
  [
    dwelling(
      "tinkers-workshop",
      "Tinkers' Workshop",
      "tinker",
      "Tinkers",
      {},
      [],
      true,
    ),
    dwelling(
      "rivet-range",
      "Rivet Range",
      "rivet-gunner",
      "Rivet Gunners",
      { gold: 800, wood: 5, ore: 3 },
      ["tinkers-workshop"],
    ),
    dwelling(
      "gyro-hangar",
      "Gyro Hangar",
      "gyrocopter",
      "Gyrocopters",
      { gold: 1200, wood: 5, ore: 5 },
      ["fort-1"],
    ),
    dwelling(
      "mortar-yard",
      "Mortar Yard",
      "mortar",
      "Mortars",
      { gold: 2000, wood: 5, ore: 8, essence: 1 },
      ["rivet-range"],
    ),
    dwelling(
      "boiler-works",
      "Boiler Works",
      "steam-tank",
      "Steam Tanks",
      { gold: 4000, wood: 5, ore: 10 },
      ["gyro-hangar"],
    ),
    dwelling(
      "great-foundry",
      "Great Foundry",
      "ironclad",
      "Ironclads",
      { gold: 8000, wood: 10, ore: 15, essence: 4 },
      ["boiler-works", "mortar-yard"],
    ),
    drill(
      "scrap-heap",
      "Scrap Heap",
      "tinker",
      "salvage",
      "Tinkers gain Salvage",
      { gold: 800, ore: 5 },
      ["tinkers-workshop"],
    ),
    drill(
      "rivet-forge",
      "Rivet Forge",
      "rivet-gunner",
      "red-hot-rivets",
      "Rivet Gunners gain Red-Hot Rivets",
      { gold: 1000, ore: 5 },
      ["rivet-range"],
    ),
    drill(
      "powder-magazine",
      "Powder Magazine",
      "mortar",
      "incendiary-shells",
      "Mortars gain Incendiary Shells",
      { gold: 1500, wood: 5, ore: 5 },
      ["mortar-yard"],
    ),
    b({
      id: "deep-shaft",
      name: "Deep Shaft",
      cost: { gold: 1500, wood: 10 },
      requires: ["marketplace"],
      income: { ore: 1 },
      special: SPECIALS.deepShaft,
      effect: "+1 ore per day",
    }),
    b({
      id: "repair-yard",
      name: "Repair Yard",
      cost: { gold: 3000, ore: 10, essence: 2 },
      requires: ["boiler-works"],
      special: SPECIALS.repairYard,
      effect:
        "After each battle your hero wins, each machine stack in its army gets back a third of the creatures it lost, rounded down (only one Repair Yard counts)",
    }),
  ],
);
