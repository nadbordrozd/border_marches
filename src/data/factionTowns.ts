/**
 * The v0.2 town trees: the Realm's Castle (FACTION_HUMANS.md section 9),
 * the Restless's Churchyard (FACTION_UNDEAD.md 9) and the Horde's Warcamp
 * (FACTION_GOBLINS.md 9), with the buildings every town shares
 * (ECONOMY.md 6: halls, forts, Marketplace, Resource Silo, Magic Guild,
 * Tavern, the Keystone Hall).
 *
 * Shared buildings use the same ids in every tree ("fort-1",
 * "magic-guild-2", ...) with the faction's names; dwellings, Drills and
 * specials have their own ids.
 */
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
} as const;

/** Keystone Hall: +2000 gold a day and +50% growth (ECONOMY 6.2). */
export const KEYSTONE_INCOME = 2000;
/** Morale the Round Table gives every army of its owner. */
export const ROUND_TABLE_MORALE = 2;
/** The map's Keystone as a carried item id (CONTENT_MAP_OBJECTS 4). */
export const KEYSTONE_ITEM = "keystone";

interface FactionNames {
  fort: readonly [string, string, string];
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

/** Puts the shared buildings first, then the faction's own. */
function assemble(names: FactionNames, own: readonly BuildingDef[]): TreeData {
  const common = commonBuildings(names);
  const keystone = common.pop() as BuildingDef;
  return tree([...common, ...own, keystone]);
}

export const REALM_TREE: TreeData = assemble(
  {
    fort: ["Palisade", "Keep", "Royal Castle"],
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
