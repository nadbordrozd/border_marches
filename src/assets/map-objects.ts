/**
 * Adventure-map object types and their studio sprites (bead
 * border_marches-bzc.16, docs/art/classes/map-objects.md).
 *
 * `MAP_OBJECT_TYPES` lists the 62 object types of
 * docs/design/CONTENT_MAP_OBJECTS.md (53 core, 9 stretch) with their
 * footprints; the ids are the catalogue names in kebab case. The object rules
 * are not here (bead bzc.13): this module only says what each type looks
 * like.
 *
 * `MAP_OBJECT_ASSETS` are the new sprites of studio set `map-objects`,
 * generated at native display size and cropped to their opaque box plus 1 px
 * on the left, right and top; the last row is the foot. Never scaled, never
 * mirrored (the sun is at the bottom left). Look art up with `artFor` in
 * ./object-art.ts, which also covers the types that reuse older art (mines,
 * pickups, the chest, the wishing well) and falls back to a placeholder.
 */
import type { ImageAsset, Point } from "./manifest.ts";

/** Every catalogued object type, by id. */
export const MAP_OBJECT_TYPE_IDS = [
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
  "mystery-bag",
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
  // 3.11 Winter sites (bead bzc.87)
  "frost-giants-barrow",
  "aurora-spire",
  "hunters-lodge",
  "walrus-rookery",
  // 3.12 Desert sites (bead bzc.88, set desert-sites)
  "pyramid",
  "sphinx",
  "sun-temple",
  "sunken-tomb",
  // 3.13 Candy sites (bead bzc.124, set candy-sites)
  "gingerbread-cottage",
  "sugar-fountain",
  "sweet-shop",
  // 3.14 Volcanic sites (bead bzc.125, set volcanic-sites)
  "infernal-forge",
  "brimstone-pit",
  "shrine-of-embers",
  // 3.15 Swamp sites (bead bzc.126, set swamp-sites)
  "witchs-hut",
  "drowned-temple",
  "hags-cauldron",
] as const;

export type MapObjectTypeId = (typeof MAP_OBJECT_TYPE_IDS)[number];

/** How a sprite sits on its footprint. */
export type MapObjectSeat = "site" | "pickup";

export interface MapObjectType {
  readonly id: MapObjectTypeId;
  /** The catalogue name. */
  readonly name: string;
  /** Footprint in cells (CONTENT_MAP_OBJECTS section 3). */
  readonly cols: number;
  readonly rows: number;
  /** A stretch type of the v0.2 catalogue. */
  readonly stretch: boolean;
  /** Buried: nothing is drawn on the map. */
  readonly hidden: boolean;
  /** Sites stand on the footprint's bottom edge; pickups sit mid-cell. */
  readonly seat: MapObjectSeat;
}

/** [id, name, cols, rows, flags] where flags holds "s" stretch, "h" hidden, "p" pickup. */
const TYPE_ROWS: readonly (readonly [
  MapObjectTypeId,
  string,
  number,
  number,
  string,
])[] = [
  ["sawmill", "Sawmill", 2, 2, ""],
  ["ore-pit", "Ore Pit", 2, 2, ""],
  ["essence-spring", "Essence Spring", 2, 2, ""],
  ["gold-mine", "Gold Mine", 2, 2, ""],
  ["haunted-mine", "Haunted Mine", 2, 2, "s"],
  ["windmill", "Windmill", 2, 2, ""],
  ["water-wheel", "Water Wheel", 2, 2, ""],
  ["orchard", "Orchard", 2, 2, ""],
  ["faction-outpost", "Faction Outpost", 2, 2, ""],
  ["stray-hut", "Stray Hut", 1, 1, ""],
  ["caretaker-lodge", "Caretaker Lodge", 2, 2, ""],
  ["stat-shrine", "Stat Shrine", 1, 1, ""],
  ["learning-stone", "Learning Stone", 1, 1, ""],
  ["arena", "Arena", 2, 2, ""],
  ["library", "Library", 2, 2, "s"],
  ["tree-of-knowledge", "Tree of Knowledge", 1, 1, ""],
  ["academy", "Academy", 2, 2, "s"],
  ["tutors-hut", "Tutor's Hut", 1, 1, ""],
  ["school-shrine", "School Shrine", 1, 1, ""],
  ["hermit", "Hermit", 1, 1, ""],
  ["rally-camp", "Rally Camp", 1, 1, ""],
  ["wishing-well", "Wishing Well", 1, 1, ""],
  ["oasis", "Oasis", 2, 2, ""],
  ["school-temple", "School Temple", 2, 2, ""],
  ["mana-well", "Mana Well", 1, 1, ""],
  ["stables", "Stables", 2, 2, ""],
  ["sanctuary", "Sanctuary", 2, 2, "s"],
  ["observatory", "Observatory", 1, 1, "s"],
  ["scholar", "Scholar", 1, 1, ""],
  ["overgrown-greenhouse", "Overgrown Greenhouse", 2, 2, ""],
  ["sealed-registry", "Sealed Registry", 2, 2, ""],
  ["stopped-belfry", "Stopped Belfry", 2, 2, ""],
  ["quiet-yard", "Quiet Yard", 2, 2, ""],
  ["thunderstruck-pylon-yard", "Thunderstruck Pylon Yard", 2, 2, ""],
  ["landfall-wreck", "Landfall Wreck", 2, 2, ""],
  ["keepers-vault", "Keepers' Vault", 3, 2, ""],
  ["resource-pile", "Resource Pile", 1, 1, "p"],
  ["treasure-chest", "Treasure Chest", 1, 1, "p"],
  ["campfire", "Campfire", 1, 1, "p"],
  ["loose-artifact", "Loose Artifact", 1, 1, "p"],
  ["loose-scroll", "Loose Scroll", 1, 1, "p"],
  ["fallen-adventurer", "Fallen Adventurer", 1, 1, ""],
  ["mystery-bag", "Mystery Bag", 1, 1, "p"],
  ["obelisk", "Obelisk", 1, 1, ""],
  ["buried-keystone", "Buried Keystone", 1, 1, "h"],
  ["buried-cache", "Buried Cache", 1, 1, "h"],
  ["keymasters-tent", "Keymaster's Tent", 1, 1, ""],
  ["border-gate", "Border Gate", 1, 1, ""],
  ["seer-hut", "Seer Hut", 1, 1, ""],
  ["quest-gate", "Quest Gate", 1, 1, ""],
  ["prison", "Prison", 1, 1, ""],
  ["trading-post", "Trading Post", 2, 2, ""],
  ["tollhouse", "Tollhouse", 2, 2, ""],
  ["drill-yard", "Drill Yard", 2, 2, ""],
  ["curse-lifters-shrine", "Curse-Lifter's Shrine", 1, 1, ""],
  ["roadside-inn", "Roadside Inn", 2, 2, "s"],
  ["altar-of-sacrifice", "Altar of Sacrifice", 1, 1, "s"],
  ["two-way-waystone", "Two-Way Waystone", 1, 1, ""],
  ["one-way-waystone", "One-Way Waystone", 1, 1, "s"],
  ["pylon", "Pylon", 1, 1, ""],
  ["event-tile", "Event Tile", 1, 1, "p"],
  ["sealed-box", "Sealed Box", 1, 1, "p"],
  ["sign", "Sign", 1, 1, "s"],
  // Winter sites (bead bzc.87).
  ["frost-giants-barrow", "Frost Giant's Barrow", 2, 2, ""],
  ["aurora-spire", "Aurora Spire", 1, 1, ""],
  ["hunters-lodge", "Hunter's Lodge", 2, 2, ""],
  ["walrus-rookery", "Walrus Rookery", 2, 2, ""],
  ["pyramid", "Pyramid", 3, 2, ""],
  ["sphinx", "Sphinx", 2, 2, ""],
  ["sun-temple", "Sun Temple", 2, 2, ""],
  ["sunken-tomb", "Sunken Tomb", 2, 2, ""],
  ["gingerbread-cottage", "Gingerbread Cottage", 2, 2, ""],
  ["sugar-fountain", "Sugar Fountain", 2, 2, ""],
  ["sweet-shop", "Sweet Shop", 2, 2, ""],
  ["infernal-forge", "Infernal Forge", 2, 2, ""],
  ["brimstone-pit", "Brimstone Pit", 2, 2, ""],
  ["shrine-of-embers", "Shrine of Embers", 1, 1, ""],
  ["witchs-hut", "Witch's Hut", 2, 2, ""],
  ["drowned-temple", "Drowned Temple", 2, 2, ""],
  ["hags-cauldron", "Hag's Cauldron", 1, 1, ""],
];

export const MAP_OBJECT_TYPES: readonly MapObjectType[] = TYPE_ROWS.map(
  ([id, name, cols, rows, flags]) => ({
    id,
    name,
    cols,
    rows,
    stretch: flags.includes("s"),
    hidden: flags.includes("h"),
    seat: flags.includes("p") ? "pickup" : "site",
  }),
);

const TYPE_BY_ID: ReadonlyMap<string, MapObjectType> = new Map(
  MAP_OBJECT_TYPES.map((type) => [type.id, type]),
);

/** The catalogued type with this id, or undefined. */
export function mapObjectType(id: string): MapObjectType | undefined {
  return TYPE_BY_ID.get(id);
}

/** Older art a type reuses (an asset of the manifest, by key). */
export interface ReusedObjectArt {
  readonly type: MapObjectTypeId;
  readonly variant: string;
  readonly key: string;
  /** Relative to public/ (the manifest path of `key`). */
  readonly path: string;
  /** The pixel that stands on the footprint's ground point (measured). */
  readonly foot: Point;
}

/**
 * Types that already had art keep it: the resource pickups, the chest and
 * the wishing well. Each foot is the bottom centre of the image's opaque box.
 * The four mines reused their older, smaller art (sawmill, mined mountain,
 * gold claim, essence spring) until bead bzc.30 gave them 2x2-scale studio
 * sprites; that older art stays in the manifest but is no longer drawn.
 */
export const REUSED_OBJECT_ART: readonly ReusedObjectArt[] = (
  [
    ["wishing-well", "", "wishing-well", "objects/wishing-well", 40, 66],
    ["treasure-chest", "", "treasure", "objects/treasure", 20, 37],
    ["resource-pile", "wood", "wood-pile", "objects/wood-pile", 20, 34],
    ["resource-pile", "ore", "ore-pile", "objects/ore-pile", 20, 35],
    ["resource-pile", "gold", "gold-pile", "objects/gold-pile", 19, 32],
    [
      "resource-pile",
      "essence",
      "essence-crystals",
      "objects/essence-crystals",
      20,
      34,
    ],
  ] as const
).map(([type, variant, key, file, x, y]) => ({
  type,
  variant,
  key,
  path: `assets/${file}.png`,
  foot: { x, y },
}));

/** A studio sprite of one object type (and one of its variants). */
export interface MapObjectAsset extends ImageAsset {
  readonly category: "map-object";
  readonly type: MapObjectTypeId;
  /** "" for the type's only look; else e.g. "small", "attack", "bloom". */
  readonly variant: string;
  /** The pixel that stands on the footprint's ground point: bottom centre. */
  readonly foot: Point;
  /** The accepted take it is cropped from. */
  readonly source: string;
}

/** [type, variant, w, h, take] of every studio sprite. */
const ART_ROWS: readonly (readonly [
  MapObjectTypeId,
  string,
  number,
  number,
  string,
])[] = [
  // The four mines at 2x2-site scale, drawn on their 2x1 footprint (bzc.30).
  ["sawmill", "", 108, 88, "sawmill-c#0"],
  ["ore-pit", "", 102, 85, "ore-pit-b#0"],
  ["essence-spring", "", 111, 107, "essence-spring-c#1"],
  ["gold-mine", "", 120, 118, "gold-mine-b#2"],
  ["haunted-mine", "", 109, 104, "haunted-mine-a#2"],
  ["windmill", "", 73, 105, "windmill-s1#2"],
  ["water-wheel", "", 98, 89, "water-wheel-a#0"],
  ["orchard", "", 106, 89, "orchard-a#0"],
  ["faction-outpost", "humans", 107, 90, "outpost-a#0"],
  ["faction-outpost", "undead", 100, 90, "outpost-a#1"],
  ["faction-outpost", "goblins", 101, 93, "outpost-a#2"],
  ["faction-outpost", "candy", 113, 115, "outpost-candy-a#2"],
  ["faction-outpost", "dwarves", 109, 104, "outpost-dwarves-b#3"],
  ["stray-hut", "", 60, 51, "sites-d#0"],
  ["caretaker-lodge", "", 117, 104, "lodge-a#1"],
  ["stat-shrine", "attack", 46, 63, "shrines-a#10"],
  ["stat-shrine", "defense", 46, 61, "shrines-a#5"],
  ["stat-shrine", "power", 46, 61, "shrines-a#13"],
  ["stat-shrine", "lore", 46, 61, "shrines-a#11"],
  ["learning-stone", "", 32, 57, "sites-a#2"],
  ["arena", "", 89, 86, "arena-a#0"],
  ["library", "", 101, 100, "library-a#0"],
  ["tree-of-knowledge", "", 64, 62, "sites-a#7"],
  ["academy", "", 103, 111, "academy-a#0"],
  ["tutors-hut", "", 53, 51, "huts-s1#5"],
  ["school-shrine", "tier-1", 45, 48, "sites-b#0"],
  ["school-shrine", "tier-2", 39, 48, "sites-b#4"],
  ["school-shrine", "tier-3", 54, 56, "sites-b#10"],
  ["hermit", "", 51, 53, "huts-s1#10"],
  ["rally-camp", "", 58, 50, "sites-b#12"],
  ["oasis", "", 111, 112, "oasis-a#2"],
  ["school-temple", "bloom", 80, 98, "temple-a#0"],
  ["school-temple", "accord", 80, 98, "temple-a#1"],
  ["school-temple", "clock", 82, 98, "temple-a#2"],
  ["school-temple", "hush", 82, 98, "temple-a#3"],
  ["school-temple", "storm", 80, 103, "temple-c#0"],
  ["mana-well", "", 45, 43, "sites-a#10"],
  ["stables", "", 113, 88, "stables-a#1"],
  ["sanctuary", "", 102, 90, "sanctuary-a#0"],
  ["observatory", "", 42, 53, "sites-d#8"],
  ["scholar", "", 60, 61, "sites-a#15"],
  ["overgrown-greenhouse", "small", 64, 78, "greenhouse-a#0"],
  ["overgrown-greenhouse", "medium", 109, 92, "greenhouse-a#1"],
  ["overgrown-greenhouse", "large", 118, 112, "greenhouse-a#2"],
  ["sealed-registry", "small", 81, 77, "registry-a#0"],
  ["sealed-registry", "medium", 96, 89, "registry-a#1"],
  ["sealed-registry", "large", 111, 103, "registry-a#2"],
  ["stopped-belfry", "small", 75, 116, "belfry-s1#3"],
  ["stopped-belfry", "medium", 64, 115, "belfry-s1#0"],
  ["stopped-belfry", "large", 68, 118, "belfry-s1#2"],
  ["quiet-yard", "small", 80, 58, "quiet-yard-a#0"],
  ["quiet-yard", "medium", 110, 84, "quiet-yard-a#1"],
  ["quiet-yard", "large", 119, 114, "quiet-yard-a#2"],
  ["thunderstruck-pylon-yard", "small", 59, 89, "pylon-yard-a#0"],
  ["thunderstruck-pylon-yard", "medium", 82, 99, "pylon-yard-a#1"],
  ["thunderstruck-pylon-yard", "large", 114, 109, "pylon-yard-a#2"],
  ["landfall-wreck", "small", 61, 54, "wreck-a#0"],
  ["landfall-wreck", "medium", 90, 78, "wreck-a#1"],
  ["landfall-wreck", "large", 121, 106, "wreck-a#2"],
  ["keepers-vault", "", 159, 105, "vault-a#0"],
  ["campfire", "", 32, 30, "pickups-a#2"],
  ["loose-artifact", "", 32, 31, "pickups-a#7"],
  ["loose-scroll", "", 30, 26, "pickups-a#9"],
  ["fallen-adventurer", "", 53, 48, "sites-d#7"],
  ["obelisk", "", 38, 60, "gates-a#0"],
  ["keymasters-tent", "red", 46, 53, "sites-e#8"],
  ["keymasters-tent", "blue", 46, 52, "sites-e#12"],
  ["keymasters-tent", "green", 46, 54, "sites-e#4"],
  ["keymasters-tent", "yellow", 46, 54, "sites-e#4"],
  ["border-gate", "red", 54, 48, "gates-a#8"],
  ["border-gate", "blue", 54, 48, "gates-a#8"],
  ["border-gate", "green", 54, 48, "gates-a#8"],
  ["border-gate", "yellow", 54, 48, "gates-a#8"],
  ["seer-hut", "", 53, 55, "huts-s1#4"],
  ["quest-gate", "", 44, 48, "gates-a#12"],
  ["prison", "", 55, 55, "sites-c#0"],
  ["trading-post", "", 112, 94, "trading-post-a#3"],
  ["tollhouse", "", 102, 85, "tollhouse-a#1"],
  ["drill-yard", "", 107, 86, "drill-yard-a#1"],
  ["curse-lifters-shrine", "", 44, 52, "sites-c#4"],
  ["roadside-inn", "", 110, 81, "inn-a#0"],
  ["altar-of-sacrifice", "", 56, 53, "sites-d#13"],
  ["two-way-waystone", "teal", 48, 52, "sites-c#9"],
  ["two-way-waystone", "amber", 48, 52, "sites-c#9"],
  ["two-way-waystone", "crimson", 48, 52, "sites-c#9"],
  ["two-way-waystone", "blue", 48, 52, "sites-c#9"],
  ["one-way-waystone", "", 50, 52, "sites-c#8"],
  ["pylon", "", 33, 62, "sites-c#12"],
  ["event-tile", "", 26, 24, "pickups-a#29"],
  ["sealed-box", "", 30, 32, "pickups-a#10"],
  ["sign", "", 38, 50, "sites-e#0"],
  // The Mystery Bag (bead bzc.105, set artifact-pickups).
  ["mystery-bag", "", 27, 31, "@artifact-pickups/mystery-a#15"],
  // Winter sites (bead bzc.87): studio set winter-objects.
  ["frost-giants-barrow", "small", 58, 51, "@winter-objects/barrow-a#0"],
  ["frost-giants-barrow", "medium", 85, 72, "@winter-objects/barrow-a#1"],
  ["frost-giants-barrow", "large", 121, 111, "@winter-objects/barrow-a#3"],
  ["aurora-spire", "", 40, 64, "@winter-objects/spire-a#0"],
  ["hunters-lodge", "", 109, 93, "@winter-objects/lodge-a#2"],
  ["walrus-rookery", "", 116, 78, "@winter-objects/rookery-a#1"],
  // Desert sites (bead bzc.88, set desert-sites).
  ["pyramid", "", 172, 118, "@desert-sites/pyramid-b#0"],
  ["sphinx", "", 107, 98, "@desert-sites/sphinx-a#3"],
  ["sun-temple", "", 102, 113, "@desert-sites/sun-temple-a#1"],
  ["sunken-tomb", "", 120, 108, "@desert-sites/tomb-a#2"],
  // Candy sites (bead bzc.124, set candy-sites); the cottage's medium and
  // large sizes share one look.
  ["gingerbread-cottage", "", 109, 102, "@candy-sites/cottage-a#2"],
  ["sugar-fountain", "", 101, 112, "@candy-sites/fountain-a#0"],
  ["sweet-shop", "", 115, 102, "@candy-sites/shop-a#1"],
  // Volcanic sites (bead bzc.125, set volcanic-sites).
  ["infernal-forge", "", 109, 102, "@volcanic-sites/forge-a#1"],
  ["brimstone-pit", "small", 84, 60, "@volcanic-sites/pit-a#0"],
  ["brimstone-pit", "medium", 103, 74, "@volcanic-sites/pit-a#1"],
  ["brimstone-pit", "large", 119, 93, "@volcanic-sites/pit-a#2"],
  ["shrine-of-embers", "", 58, 57, "@volcanic-sites/embers-a#0"],
  // Swamp sites (bead bzc.126, set swamp-sites).
  ["witchs-hut", "", 90, 118, "@swamp-sites/witch-hut-a#3"],
  ["drowned-temple", "", 104, 97, "@swamp-sites/ruins-a#1"],
  ["hags-cauldron", "", 62, 56, "@swamp-sites/cauldron-a#0"],
];

/**
 * The cloth a loose artifact's own 32 px icon rests on (bead bzc.105, set
 * artifact-pickups): not an object type of its own; the renderer
 * (`artifactPickupEntry` in src/render/map/scene.ts) draws it under the
 * icon, its foot on the pickup's seat.
 */
export const ARTIFACT_CLOTH: ImageAsset & {
  readonly foot: Point;
  readonly source: string;
} = {
  key: "map-object-artifact-cloth",
  path: "assets/objects/map/artifact-cloth.png",
  w: 38,
  h: 17,
  category: "map-object",
  foot: { x: 19, y: 16 },
  source: "artifact-pickups/cloth-a#0",
};

export const MAP_OBJECT_ASSETS: readonly MapObjectAsset[] = ART_ROWS.map(
  ([type, variant, w, h, source]) => {
    const file = variant === "" ? type : `${type}-${variant}`;
    return {
      key: `map-object-${file}`,
      path: `assets/objects/map/${file}.png`,
      w,
      h,
      category: "map-object",
      type,
      variant,
      foot: { x: Math.floor(w / 2), y: h - 1 },
      source: source.startsWith("@")
        ? source.slice(1)
        : `map-objects/${source}`,
    };
  },
);
