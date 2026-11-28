/**
 * Town-screen art of the v0.2 factions, the Candy Kingdom and the Deepforge
 * (beads border_marches-bzc.15, bzc.114 and bzc.133; the harbour bzc.159,
 * docs/art/classes/towns.md): one 64 x 64 building sprite per building of
 * each faction's tree and one 256 x 224 backdrop per faction. Studio sets
 * `chunky-buildings` (redrawn in the chunky map-town style, bead bzc.98)
 * and `town-backdrops`; every file is an `outputs[]` entry
 * derived from an accepted master. Look them up with `buildingArt` and
 * `townBackdrop` (src/assets/town-art.ts), which normalise names and fall
 * back sensibly.
 *
 * Building ids are the faction documents' names in kebab case without
 * apostrophes ("Squires' Hall" -> "squires-hall"); the Magic Guild levels
 * share one sprite ("magic-guild").
 */
import type { ImageAsset } from "./manifest";

/** The factions with town-screen art, by their FactionId. */
export type TownArtFaction =
  "humans" | "undead" | "goblins" | "candy" | "dwarves";

export const TOWN_ART_FACTIONS: readonly TownArtFaction[] = [
  "humans",
  "undead",
  "goblins",
  "candy",
  "dwarves",
];

/** Side of a building sprite; the building stands bottom-centred, 2 px up. */
export const BUILDING_ART_PX = 64;

export interface BuildingArtAsset extends ImageAsset {
  readonly category: "building";
  readonly faction: TownArtFaction;
  /** Kebab-case building id of the faction's tree. */
  readonly building: string;
}

export interface TownBackdropAsset extends ImageAsset {
  readonly category: "town-backdrop";
  readonly faction: TownArtFaction;
}

/**
 * Every building of each faction's tree (FACTION_*.md section 9) in display
 * order: halls, fort, economy, guild, tavern, dwellings by tier, Drills,
 * specials, the harbour (NAVAL 5.7: one id for every faction, the names
 * differ), the Keystone Hall.
 */
export const TOWN_BUILDING_IDS: Readonly<
  Record<TownArtFaction, readonly string[]>
> = {
  humans: [
    "village-hall",
    "town-hall",
    "city-hall",
    "palisade",
    "keep",
    "royal-castle",
    "marketplace",
    "resource-silo",
    "magic-guild",
    "tavern",
    "squires-hall",
    "archery-range",
    "barracks",
    "friary",
    "stables",
    "slayers-lodge",
    "butts",
    "guardroom",
    "tiltyard",
    "tithe-barn",
    "chapel-of-oaths",
    "shipyard",
    "lighthouse",
    "admiralty",
    "round-table",
  ],
  undead: [
    "village-hall",
    "town-hall",
    "city-hall",
    "iron-railings",
    "lych-wall",
    "black-gate",
    "marketplace",
    "resource-silo",
    "magic-guild",
    "tavern",
    "potters-field",
    "charnel-pit",
    "wailing-tower",
    "funeral-parlour",
    "manor",
    "royal-mausoleum",
    "bone-yard",
    "rot-cellar",
    "drawing-room",
    "essence-still",
    "family-crypt",
    "shipyard",
    "lighthouse",
    "admiralty",
    "hall-of-ancestors",
  ],
  goblins: [
    "village-hall",
    "town-hall",
    "city-hall",
    "stakes",
    "scrap-wall",
    "skull-tower",
    "marketplace",
    "resource-silo",
    "magic-guild",
    "tavern",
    "goblin-holes",
    "powder-shed",
    "wolf-kennels",
    "hex-hut",
    "ogre-pit",
    "boss-tent",
    "mosh-pit",
    "pitch-vats",
    "racing-track",
    "loot-pile",
    "launch-ramp",
    "shipyard",
    "lighthouse",
    "admiralty",
    "great-flinger",
  ],
  candy: [
    "village-hall",
    "town-hall",
    "city-hall",
    "candy-cane-fence",
    "gingerbread-wall",
    "sugar-glass-keep",
    "marketplace",
    "resource-silo",
    "magic-guild",
    "tavern",
    "gingerbread-house",
    "mint-range",
    "taffy-ranch",
    "sugarplum-bower",
    "gummy-den",
    "rock-candy-grotto",
    "bread-oven",
    "mint-press",
    "pulling-hooks",
    "bakery",
    "larder",
    "shipyard",
    "lighthouse",
    "admiralty",
    "the-four-oclock",
  ],
  dwarves: [
    "village-hall",
    "town-hall",
    "city-hall",
    "riveted-palisade",
    "ironbound-wall",
    "gun-keep",
    "marketplace",
    "resource-silo",
    "magic-guild",
    "tavern",
    "tinkers-workshop",
    "rivet-range",
    "gyro-hangar",
    "mortar-yard",
    "boiler-works",
    "great-foundry",
    "scrap-heap",
    "rivet-forge",
    "powder-magazine",
    "deep-shaft",
    "repair-yard",
    "shipyard",
    "lighthouse",
    "admiralty",
    "the-great-boiler",
  ],
};

/** The fort buildings of each faction, fort level 1 to 3. */
export const FORT_BUILDINGS: Readonly<
  Record<TownArtFaction, readonly [string, string, string]>
> = {
  humans: ["palisade", "keep", "royal-castle"],
  undead: ["iron-railings", "lych-wall", "black-gate"],
  goblins: ["stakes", "scrap-wall", "skull-tower"],
  candy: ["candy-cane-fence", "gingerbread-wall", "sugar-glass-keep"],
  dwarves: ["riveted-palisade", "ironbound-wall", "gun-keep"],
};

/** The Keystone Hall of each faction. */
export const KEYSTONE_BUILDINGS: Readonly<Record<TownArtFaction, string>> = {
  humans: "round-table",
  undead: "hall-of-ancestors",
  goblins: "great-flinger",
  candy: "the-four-oclock",
  dwarves: "the-great-boiler",
};

/**
 * Buildings that have a derived sprite. Every building of every tree has
 * one (tests/assets/town-art.test.ts checks the files and the coverage).
 */
export const BUILDING_ART_ASSETS: readonly BuildingArtAsset[] =
  TOWN_ART_FACTIONS.flatMap((faction) =>
    TOWN_BUILDING_IDS[faction].map((building): BuildingArtAsset => ({
      key: `building-${faction}-${building}`,
      path: `assets/towns/buildings/${faction}/${building}.png`,
      w: BUILDING_ART_PX,
      h: BUILDING_ART_PX,
      category: "building",
      faction,
      building,
    })),
  );

/** Backdrop of the town screen picture, shown at x2. */
export const TOWN_BACKDROP_ASSETS: readonly TownBackdropAsset[] =
  TOWN_ART_FACTIONS.map((faction) => ({
    key: `town-backdrop-${faction}`,
    path: `assets/towns/backdrops/${faction}.png`,
    w: 256,
    h: 224,
    category: "town-backdrop",
    faction,
  }));
