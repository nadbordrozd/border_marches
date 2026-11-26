/**
 * Typed registry of every image the game ships (bead border_marches-xaj.4).
 *
 * Most of it is imported byte for byte from the sister project Pulp Wars
 * (the user: "FEEL FREE TO REUSE SPRITES from the other game");
 * docs/art/IMPORTED_FROM_PULP_WARS.md lists each file's source and sha256.
 * The rest is new art from this repository's studio pipeline (bead
 * border_marches-xaj.9): the Chieftain hero and its portrait, four resource
 * pickups, the essence spring and the 32 px resource items; each is an
 * `outputs[]` entry of a set under art/sets/, derived from an accepted
 * master (docs/art/MVP_NEW_ART.md), and tests/assets checks it against its
 * studio records instead of the provenance table.
 * The imported metadata is ported from Pulp Wars' own manifests and
 * measurements so its renderer modules port without guesswork:
 *
 * - units and towns: the anchor (the master pixel placed on the owning
 *   cell's centre, from `chibiAnchorV7`), the measured feet of each unit
 *   (unit-shadow-measurements-v7.generated.ts) and the measured ground line
 *   and pennant pole of each town (settlement-shadow-measurements and
 *   DIRECTION_FLAG_ANCHORS_V7);
 * - textured grounds: the period in cells of each periodic texture
 *   (FACTION_GRASS_WORLDS_V7);
 * - mountains: the massif set of chibi-massif-v7.ts (low and tall, single
 *   and ridge pieces, and the mined mountain) with the rows each piece
 *   rises above its footprint;
 * - forests: the composed-forest piece sets of chibi-forest-packing-v7.ts
 *   (eight footprint shapes, 24 px of crown above the footprint) and the
 *   seam clumps drawn between pieces, one set per ground terrain.
 *
 * Sizes are master pixels; one map cell is CELL_PX x CELL_PX. `path` is
 * relative to `public/`; resolve it with {@link assetUrl}. The test
 * tests/assets/manifest.test.ts checks every entry against its PNG header.
 *
 * Not rasters (Pulp Wars draws them in code, so nothing is imported): the
 * dirt roads (dirt-road-v7.ts), the coast sand and surf (coast-sand-v7.ts)
 * and the fog of war, its puffs and lift (fog-of-war-v7.ts, fog-puff-v7.ts,
 * fog-lift-v7.ts).
 */
import { FOREST_FAMILY, FOREST_GROUNDS, GROUND_FAMILY } from "./ground-family";
import type { ForestGround } from "./ground-family";
import type { ResourceId, Terrain } from "../core/map/types";
import { DECORATION_ASSETS } from "./decorations";
import { ALL_ICON_ASSETS } from "./icons";
import { MAP_OBJECT_ASSETS } from "./map-objects";
import { PEAK_ASSETS } from "./peaks";
import { TREE_ASSETS } from "./trees";
import { BUILDING_ART_ASSETS, TOWN_BACKDROP_ASSETS } from "./town-buildings";
import {
  NAMED_HERO_PORTRAITS,
  V02_HERO_ASSETS,
  V02_UNIT_ASSETS,
} from "./v02-units";

/** Master pixels per map cell. */
export const CELL_PX = 80;
/** Rows above the footprint in a low mountain piece (and the mine). */
export const MOUNTAIN_LOW_UP_PX = 24;
/** Rows above the footprint in a tall mountain piece. */
export const MOUNTAIN_TALL_UP_PX = 48;
/** Rows of crown above the footprint in every forest piece. */
export const FOREST_UP_PX = 24;

export type AssetCategory =
  | "unit"
  | "portrait"
  | "town"
  | "ground"
  | "ground-swatch"
  | "ground-overlay"
  | "water"
  | "mountain"
  | "mountain-extra"
  | "forest-piece"
  | "forest-seam"
  | "object"
  | "resource-item"
  | "town-3x2"
  | "doodad"
  | "decoration"
  | "tree"
  | "peak"
  | "map-object"
  | "building"
  | "town-backdrop"
  | "icon"
  | "frame";

/** One PNG under public/. */
export interface ImageAsset {
  /** Unique across the manifest. */
  readonly key: string;
  /** Relative to public/, e.g. "assets/units/dinosaur-caveman.png". */
  readonly path: string;
  readonly w: number;
  readonly h: number;
  readonly category: AssetCategory;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** The URL of an asset for a page served from `base` (Vite's BASE_URL). */
export function assetUrl(asset: Pick<ImageAsset, "path">, base = "/"): string {
  return `${base.endsWith("/") ? base : `${base}/`}${asset.path}`;
}

// ------------------------------------------------------------------ units

export type ArtFaction = "dinosaur" | "human" | "goblin" | "undead" | "martian";
export type UnitArtFaction = ArtFaction | "neutral";
/** Pulp Wars canvas classes: 56x80, 72x88, 88x(72..104). */
export type UnitSizeClass = "standard" | "large" | "giant";

/**
 * Where a unit sprite touches the ground, measured by Pulp Wars
 * (scripts/art/unit-shadows/measure.ts), in master pixels from the top-left:
 * `contactY` is one past the lowest opaque row; foot = the opaque extent of
 * the 4 rows above it; base = of the 14 rows above it (right is exclusive).
 */
export interface UnitFeet {
  readonly contactY: number;
  readonly footLeft: number;
  readonly footRight: number;
  readonly baseLeft: number;
  readonly baseRight: number;
}

export interface UnitAsset extends ImageAsset {
  readonly category: "unit";
  readonly faction: UnitArtFaction;
  readonly sizeClass: UnitSizeClass;
  /** Master pixel placed on the owning cell's centre. */
  readonly anchor: Point;
  readonly feet: UnitFeet;
  /** Key of the unit's 48x48 portrait. */
  readonly portrait: string;
}

export interface PortraitAsset extends ImageAsset {
  readonly category: "portrait";
  /** Key of the unit this portrait shows. */
  readonly unit: string;
}

function unit(
  name: string,
  faction: UnitArtFaction,
  sizeClass: UnitSizeClass,
  w: number,
  h: number,
  anchor: Point,
  feet: UnitFeet,
): UnitAsset {
  return {
    key: name,
    path: `assets/units/${name}.png`,
    w,
    h,
    category: "unit",
    faction,
    sizeClass,
    anchor,
    feet,
    portrait: `portrait-${name}`,
  };
}

function portrait(name: string, w: number, h: number): PortraitAsset {
  return {
    key: `portrait-${name}`,
    path: `assets/portraits/${name}.png`,
    w,
    h,
    category: "portrait",
    unit: name,
  };
}

/**
 * The Lost World roster (Pulp Wars' Dinosaur faction, fixed colours) and a
 * pool of neutral monster candidates from the Goblin, Undead and Martian
 * rosters and the Pulp Wars curiosities.
 */
export const UNIT_ASSETS: readonly UnitAsset[] = [
  // Lost World: the six tiers' candidates and three spares.
  unit(
    "dinosaur-caveman",
    "dinosaur",
    "standard",
    56,
    80,
    { x: 28, y: 40 },
    { contactY: 71, footLeft: 11, footRight: 43, baseLeft: 11, baseRight: 43 },
  ),
  unit(
    "dinosaur-spitter",
    "dinosaur",
    "standard",
    56,
    80,
    { x: 28, y: 40 },
    { contactY: 78, footLeft: 16, footRight: 40, baseLeft: 9, baseRight: 40 },
  ),
  unit(
    "dinosaur-raptor",
    "dinosaur",
    "large",
    72,
    88,
    { x: 34, y: 48 },
    { contactY: 83, footLeft: 19, footRight: 51, baseLeft: 18, baseRight: 67 },
  ),
  unit(
    "dinosaur-shaman",
    "dinosaur",
    "standard",
    56,
    80,
    { x: 28, y: 40 },
    { contactY: 77, footLeft: 10, footRight: 42, baseLeft: 9, baseRight: 42 },
  ),
  unit(
    "dinosaur-triceratops",
    "dinosaur",
    "large",
    72,
    88,
    { x: 34, y: 48 },
    { contactY: 78, footLeft: 10, footRight: 55, baseLeft: 10, baseRight: 65 },
  ),
  unit(
    "dinosaur-t-rex",
    "dinosaur",
    "large",
    72,
    88,
    { x: 30, y: 48 },
    { contactY: 83, footLeft: 16, footRight: 57, baseLeft: 16, baseRight: 57 },
  ),
  unit(
    "dinosaur-stegosaurus",
    "dinosaur",
    "large",
    72,
    88,
    { x: 36, y: 48 },
    { contactY: 76, footLeft: 15, footRight: 55, baseLeft: 14, baseRight: 66 },
  ),
  unit(
    "dinosaur-ankylosaurus",
    "dinosaur",
    "standard",
    56,
    80,
    { x: 28, y: 40 },
    { contactY: 70, footLeft: 17, footRight: 49, baseLeft: 7, baseRight: 49 },
  ),
  unit(
    "dinosaur-brontosaurus",
    "dinosaur",
    "giant",
    88,
    104,
    { x: 44, y: 64 },
    { contactY: 98, footLeft: 34, footRight: 80, baseLeft: 34, baseRight: 80 },
  ),
  // Neutral monster candidates.
  unit(
    "goblin-goblin",
    "goblin",
    "standard",
    56,
    80,
    { x: 28, y: 40 },
    { contactY: 73, footLeft: 9, footRight: 40, baseLeft: 5, baseRight: 53 },
  ),
  unit(
    "goblin-wolf-rider",
    "goblin",
    "large",
    72,
    88,
    { x: 36, y: 48 },
    { contactY: 86, footLeft: 35, footRight: 57, baseLeft: 10, baseRight: 58 },
  ),
  unit(
    "goblin-bomb-chucker",
    "goblin",
    "standard",
    56,
    80,
    { x: 28, y: 40 },
    { contactY: 77, footLeft: 11, footRight: 43, baseLeft: 5, baseRight: 43 },
  ),
  unit(
    "goblin-orc-brute",
    "goblin",
    "standard",
    56,
    80,
    { x: 28, y: 40 },
    { contactY: 76, footLeft: 11, footRight: 40, baseLeft: 2, baseRight: 45 },
  ),
  unit(
    "goblin-troll",
    "goblin",
    "giant",
    88,
    104,
    { x: 44, y: 64 },
    { contactY: 98, footLeft: 22, footRight: 69, baseLeft: 9, baseRight: 74 },
  ),
  unit(
    "goblin-ogre",
    "goblin",
    "large",
    72,
    88,
    { x: 36, y: 48 },
    { contactY: 86, footLeft: 16, footRight: 61, baseLeft: 5, baseRight: 61 },
  ),
  unit(
    "goblin-orc-warboss",
    "goblin",
    "standard",
    56,
    80,
    { x: 27, y: 40 },
    { contactY: 75, footLeft: 10, footRight: 44, baseLeft: 6, baseRight: 44 },
  ),
  unit(
    "undead-skeleton",
    "undead",
    "standard",
    56,
    80,
    { x: 28, y: 40 },
    { contactY: 79, footLeft: 11, footRight: 41, baseLeft: 11, baseRight: 44 },
  ),
  unit(
    "undead-zombie",
    "undead",
    "standard",
    56,
    80,
    { x: 28, y: 40 },
    { contactY: 74, footLeft: 7, footRight: 40, baseLeft: 4, baseRight: 40 },
  ),
  unit(
    "undead-vampire",
    "undead",
    "large",
    72,
    88,
    { x: 33, y: 48 },
    { contactY: 83, footLeft: 22, footRight: 59, baseLeft: 7, baseRight: 59 },
  ),
  unit(
    "martian-grunt",
    "martian",
    "standard",
    56,
    80,
    { x: 28, y: 40 },
    { contactY: 76, footLeft: 15, footRight: 35, baseLeft: 14, baseRight: 35 },
  ),
  unit(
    "martian-tripod",
    "martian",
    "large",
    72,
    88,
    { x: 36, y: 48 },
    { contactY: 84, footLeft: 28, footRight: 62, baseLeft: 5, baseRight: 63 },
  ),
  unit(
    "bigfoot",
    "neutral",
    "giant",
    88,
    96,
    { x: 44, y: 56 },
    { contactY: 89, footLeft: 21, footRight: 66, baseLeft: 21, baseRight: 69 },
  ),
  // The spider's feet are its spread legs: Pulp Wars measured foot from the base band.
  unit(
    "giant-spider",
    "neutral",
    "giant",
    88,
    72,
    { x: 44, y: 32 },
    { contactY: 67, footLeft: 18, footRight: 25, baseLeft: 6, baseRight: 81 },
  ),
  // The v0.2 factions, strays and summons (bead bzc.14, src/assets/v02-units.ts).
  ...V02_UNIT_ASSETS,
];

/**
 * Adventure-map heroes (studio art, bead border_marches-xaj.9), drawn like
 * units: the Lost World Chieftain riding a raptor, facing south-east.
 */
export const HERO_ASSETS: readonly UnitAsset[] = [
  unit(
    "dinosaur-chieftain",
    "dinosaur",
    "large",
    72,
    88,
    { x: 36, y: 48 },
    { contactY: 86, footLeft: 36, footRight: 47, baseLeft: 18, baseRight: 62 },
  ),
  // The six v0.2 hero classes, mounted (bead bzc.14).
  ...V02_HERO_ASSETS,
];

export const PORTRAIT_ASSETS: readonly PortraitAsset[] = [
  ...[...UNIT_ASSETS, ...HERO_ASSETS].map((asset) =>
    portrait(asset.key, 48, 48),
  ),
  // The 24 named heroes' own portraits (bead bzc.29).
  ...NAMED_HERO_PORTRAITS,
];

// ------------------------------------------------------------------ towns

/** Pennant attachment: the top of the pole and the pole length drawn down. */
export interface FlagAnchor {
  readonly x: number;
  readonly y: number;
  /** 0 when the art has its own mast. */
  readonly pole: number;
}

/**
 * Where a town sprite meets the ground, measured by Pulp Wars
 * (scripts/art/settlement-shadows/measure.ts): the contact line (one past
 * the lowest opaque row), the footprint's left and one-past-right ends with
 * the ground line at each end, and how full the lower outline is (1 round,
 * about 0.7 a diamond).
 */
export interface TownGround {
  readonly contactY: number;
  readonly left: number;
  readonly right: number;
  readonly leftY: number;
  readonly rightY: number;
  readonly fullness: number;
}

export interface TownAsset extends ImageAsset {
  readonly category: "town";
  readonly faction: "dinosaur" | "goblin" | "neutral";
  /** City growth level 1-3; null for the village. */
  readonly level: 1 | 2 | 3 | null;
  readonly anchor: Point;
  readonly flag: FlagAnchor | null;
  readonly ground: TownGround;
}

function town(
  key: string,
  faction: TownAsset["faction"],
  level: TownAsset["level"],
  w: number,
  h: number,
  anchor: Point,
  flag: FlagAnchor | null,
  ground: TownGround,
): TownAsset {
  return {
    key,
    path: `assets/towns/${key}.png`,
    w,
    h,
    category: "town",
    faction,
    level,
    anchor,
    flag,
    ground,
  };
}

/** Lost World camps, the goblin scrap camps (the neutral Warlord's Hold), a village. */
export const TOWN_ASSETS: readonly TownAsset[] = [
  town(
    "dinosaur-city-1",
    "dinosaur",
    1,
    88,
    96,
    { x: 44, y: 56 },
    { x: 30.5, y: 0, pole: 6 },
    { contactY: 79, left: 7, right: 80, leftY: 64, rightY: 64, fullness: 0.78 },
  ),
  town(
    "dinosaur-city-2",
    "dinosaur",
    2,
    96,
    100,
    { x: 48, y: 60 },
    { x: 66.5, y: 11, pole: 0 },
    {
      contactY: 80,
      left: 7,
      right: 89,
      leftY: 63.5,
      rightY: 63.5,
      fullness: 0.76,
    },
  ),
  town(
    "dinosaur-city-3",
    "dinosaur",
    3,
    96,
    104,
    { x: 48, y: 64 },
    { x: 68.5, y: 0, pole: 12 },
    { contactY: 87, left: 1, right: 94, leftY: 66, rightY: 73, fullness: 0.77 },
  ),
  town(
    "goblin-city-1",
    "goblin",
    1,
    88,
    96,
    { x: 44, y: 56 },
    { x: 71, y: 31, pole: 0 },
    {
      contactY: 93,
      left: 11,
      right: 78,
      leftY: 79.5,
      rightY: 54.5,
      fullness: 0.9,
    },
  ),
  town(
    "goblin-city-2",
    "goblin",
    2,
    96,
    100,
    { x: 48, y: 60 },
    { x: 57.5, y: 33, pole: 11 },
    { contactY: 97, left: 9, right: 88, leftY: 79, rightY: 78, fullness: 0.75 },
  ),
  town(
    "goblin-city-3",
    "goblin",
    3,
    96,
    104,
    { x: 48, y: 64 },
    { x: 60.5, y: 29, pole: 10 },
    {
      contactY: 101,
      left: 2,
      right: 94,
      leftY: 80,
      rightY: 80,
      fullness: 0.75,
    },
  ),
  town("village", "neutral", null, 72, 72, { x: 36, y: 32 }, null, {
    contactY: 69,
    left: 11,
    right: 61,
    leftY: 59,
    rightY: 58,
    fullness: 0.77,
  }),
];

// ---------------------------------------------------------------- grounds

/** The land terrains: each has a textured ground and a forest set. */
export type GroundTerrain = Exclude<Terrain, "water">;

export const GROUND_TERRAINS: readonly GroundTerrain[] = [
  "grass",
  "jungle",
  "steppe",
  "badlands",
  "wasteland",
  "volcanic",
  "snow",
  "sand",
];

export { ART_GROUNDS, GROUND_FAMILY } from "./ground-family";
export type { ArtGround } from "./ground-family";

/**
 * A periodic texture of `columns` x `rows` cells (Pulp Wars'
 * TEXTURED_GROUNDS.md): a cell draws the part at its own map position modulo
 * the period, so neighbouring cells always continue each other.
 */
export interface GroundTextureAsset extends ImageAsset {
  readonly category: "ground";
  readonly terrain: GroundTerrain;
  readonly columns: number;
  readonly rows: number;
  /** Key of the texture's first cell as an 80x80 tile (interface, forest bake). */
  readonly swatch: string;
}

export interface GroundSwatchAsset extends ImageAsset {
  readonly category: "ground-swatch";
  readonly terrain: GroundTerrain;
}

/** Pulp Wars ground each terrain was taken from. */
export const GROUND_SOURCES: Readonly<Record<GroundTerrain, string>> = {
  grass: "NEUTRAL",
  jungle: "DINOSAUR",
  steppe: "GOBLIN",
  badlands: "MARTIAN",
  wasteland: "UNDEAD",
  volcanic: "none: PixelLab set grounds-volcanic (bead bzc.83)",
  snow: "none: PixelLab set grounds-snow (bead bzc.87)",
  sand: "none: PixelLab set grounds-sand (bead bzc.88)",
};

/** Texture period in cells (FACTION_GRASS_WORLDS_V7). */
const GROUND_PERIODS: Readonly<Record<GroundTerrain, number>> = {
  grass: 8,
  jungle: 6,
  steppe: 8,
  badlands: 8,
  wasteland: 8,
  volcanic: 5,
  snow: 5,
  sand: 5,
};

export const GROUND_TEXTURES: Readonly<
  Record<GroundTerrain, GroundTextureAsset>
> = Object.fromEntries(
  GROUND_TERRAINS.map((terrain) => {
    const period = GROUND_PERIODS[terrain];
    const asset: GroundTextureAsset = {
      key: `ground-${terrain}`,
      path: `assets/terrain/grounds/${terrain}.png`,
      w: period * CELL_PX,
      h: period * CELL_PX,
      category: "ground",
      terrain,
      columns: period,
      rows: period,
      swatch: `ground-${terrain}-swatch`,
    };
    return [terrain, asset];
  }),
) as Record<GroundTerrain, GroundTextureAsset>;

export const GROUND_SWATCHES: Readonly<
  Record<GroundTerrain, GroundSwatchAsset>
> = Object.fromEntries(
  GROUND_TERRAINS.map((terrain) => {
    const asset: GroundSwatchAsset = {
      key: `ground-${terrain}-swatch`,
      path: `assets/terrain/grounds/${terrain}-swatch.png`,
      w: CELL_PX,
      h: CELL_PX,
      category: "ground-swatch",
      terrain,
    };
    return [terrain, asset];
  }),
) as Record<GroundTerrain, GroundSwatchAsset>;

/**
 * A ground's overlay (bead bzc.83): a second periodic image whose glowing
 * pixels the renderer lays over the ground texture at its own period, so
 * the two repeat together only every lcm of the periods. The volcanic
 * cracks: the hot lava pixels of studio take grounds-volcanic/pixen-a,
 * picked out (and thinned) at load by render/map/ground.ts crackOverlay.
 */
export interface GroundOverlayAsset extends ImageAsset {
  readonly category: "ground-overlay";
  readonly terrain: GroundTerrain;
}

export const GROUND_OVERLAYS: Readonly<
  Partial<Record<GroundTerrain, GroundOverlayAsset>>
> = {
  volcanic: {
    key: "ground-volcanic-cracks",
    path: "assets/terrain/grounds/volcanic-cracks.png",
    w: 480,
    h: 480,
    category: "ground-overlay",
    terrain: "volcanic",
  },
};

// ------------------------------------------------------------------ water

export interface WaterTileAsset extends ImageAsset {
  readonly category: "water";
  readonly depth: "shallow" | "deep";
  readonly variant: number;
}

export const WATER_TILES: readonly WaterTileAsset[] = (
  ["shallow", "deep"] as const
).flatMap((depth) =>
  [0, 1].map((variant): WaterTileAsset => ({
    key: `water-${depth}-${variant + 1}`,
    path: `assets/terrain/water/${depth}-${variant + 1}.png`,
    w: CELL_PX,
    h: CELL_PX,
    category: "water",
    depth,
    variant,
  })),
);

// -------------------------------------------------------------- mountains

/**
 * The massif set (chibi-massif-v7.ts). A row of Mountain cells is covered by
 * ridges two cells wide and singles; a piece whose cells all have Mountain
 * above is tall (peaks up to 48 px over the row behind), else low (at most
 * 13 px of rock in its 24 px band, for the top row of an area and under a
 * feature cell). A mine cell draws the mined mountain (low, single).
 */
export type MountainPieceKind =
  "low-single" | "low-ridge" | "tall-single" | "tall-ridge" | "mine";

export interface MountainPieceAsset extends ImageAsset {
  readonly category: "mountain";
  readonly kind: MountainPieceKind;
  /** Footprint width in cells; the footprint is always one row. */
  readonly columns: 1 | 2;
  readonly tall: boolean;
  /** 0-based; the file letter is "abcdefghijklmnopqrst"[variant]. */
  readonly variant: number;
  /** Rows of the image above the footprint: w = columns x 80, h = 80 + up. */
  readonly up: number;
}

const LETTERS = "abcdefghijklmnopqrst";

const MOUNTAIN_VARIANTS: Readonly<Record<MountainPieceKind, number>> = {
  "low-single": 8,
  "low-ridge": 7,
  "tall-single": 6,
  "tall-ridge": 6,
  mine: 1,
};

export const MOUNTAIN_PIECES: readonly MountainPieceAsset[] = (
  Object.keys(MOUNTAIN_VARIANTS) as MountainPieceKind[]
).flatMap((kind) => {
  const columns: 1 | 2 = kind.endsWith("ridge") ? 2 : 1;
  const tall = kind.startsWith("tall");
  const up = tall ? MOUNTAIN_TALL_UP_PX : MOUNTAIN_LOW_UP_PX;
  return Array.from(
    { length: MOUNTAIN_VARIANTS[kind] },
    (_, variant): MountainPieceAsset => ({
      key: `mountain-${kind}-${LETTERS[variant]}`,
      path: `assets/terrain/mountains/${kind}-${LETTERS[variant]}.png`,
      w: columns * CELL_PX,
      h: CELL_PX + up,
      category: "mountain",
      kind,
      columns,
      tall,
      variant,
      up,
    }),
  );
});

/**
 * Pulp Wars' mined-mountain master (the mine flattened onto a grass
 * ground), which its interface (build menu, help) shows, and the 80x80
 * rocky ground tile it registers as the mine's ground layer. The board draws
 * the transparent `mountain-mine-a` piece instead.
 */
export const MOUNTAIN_EXTRAS: readonly ImageAsset[] = [
  {
    key: "mountain-mine-a-composite",
    path: "assets/terrain/mountains/mine-a-composite.png",
    w: CELL_PX,
    h: CELL_PX + MOUNTAIN_LOW_UP_PX,
    category: "mountain-extra",
  },
  {
    key: "mountain-ground-1",
    path: "assets/terrain/mountains/ground-1.png",
    w: CELL_PX,
    h: CELL_PX,
    category: "mountain-extra",
  },
];

/** The pieces of one kind, by variant. */
export function mountainPieces(
  kind: MountainPieceKind,
): readonly MountainPieceAsset[] {
  return MOUNTAIN_PIECES.filter((piece) => piece.kind === kind);
}

/** An opaque bounding box, master pixels from the canvas's top-left. */
export interface PixelBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

// ---------------------------------------------------------------- forests

/** Composed-forest footprints (FOREST_SHAPES_V7). */
export type ForestShape =
  "1x1" | "2x1" | "1x2" | "2x2" | "L-NW" | "L-NE" | "L-SW" | "L-SE";

/**
 * Footprints, rows north to south, "#" a covered cell. "2x1" is two cells
 * wide; "L-NE" is a 2x2 block without its north-east cell.
 */
export const FOREST_SHAPES: Readonly<Record<ForestShape, readonly string[]>> = {
  "1x1": ["#"],
  "2x1": ["##"],
  "1x2": ["#", "#"],
  "2x2": ["##", "##"],
  "L-NW": [".#", "##"],
  "L-NE": ["#.", "##"],
  "L-SW": ["##", ".#"],
  "L-SE": ["##", "#."],
};

export interface ForestPieceAsset extends ImageAsset {
  readonly category: "forest-piece";
  readonly set: GroundTerrain;
  readonly shape: ForestShape;
  /** 0-based; the file letter is "abc"[variant]. */
  readonly variant: number;
  /** Bounding box of the footprint in cells: w = cols x 80, h = rows x 80 + 24. */
  readonly cols: number;
  readonly rows: number;
  readonly footprint: readonly string[];
}

/** A single clump of the set's trees, drawn between pieces to close seams. */
export interface ForestSeamAsset extends ImageAsset {
  readonly category: "forest-seam";
  readonly set: GroundTerrain;
  readonly index: number;
}

export interface ForestSet {
  readonly terrain: GroundTerrain;
  /** Pulp Wars set it was taken from (NEUTRAL is the default Forest). */
  readonly source: string;
  readonly pieces: readonly ForestPieceAsset[];
  /** Pulp Wars calls these the set's clumps. */
  readonly seams: readonly ForestSeamAsset[];
}

/** Variants per shape; the same in every set. */
const FOREST_VARIANTS: Readonly<Record<ForestShape, number>> = {
  "1x1": 3,
  "2x1": 3,
  "1x2": 3,
  "2x2": 3,
  "L-NW": 2,
  "L-NE": 2,
  "L-SW": 2,
  "L-SE": 2,
};

/** Each set's seam clump sizes, by index (file seam-<index + 1>.png). */
const FOREST_SEAM_SIZES: Readonly<
  Record<ForestGround, readonly (readonly [number, number])[]>
> = {
  grass: [
    [63, 63],
    [59, 79],
    [62, 81],
    [63, 72],
  ],
  jungle: [
    [61, 65],
    [78, 59],
    [74, 66],
  ],
  steppe: [
    [74, 68],
    [75, 64],
    [69, 84],
    [64, 58],
  ],
  badlands: [
    [50, 81],
    [67, 80],
    [62, 80],
  ],
  wasteland: [
    [71, 66],
    [72, 56],
    [72, 72],
    [62, 64],
  ],
};

function forestSet(terrain: ForestGround): ForestSet {
  const dir = `assets/terrain/forest/${terrain}`;
  const pieces = (Object.keys(FOREST_VARIANTS) as ForestShape[]).flatMap(
    (shape) => {
      const footprint = FOREST_SHAPES[shape];
      const rows = footprint.length;
      const cols = footprint[0]?.length ?? 1;
      return Array.from(
        { length: FOREST_VARIANTS[shape] },
        (_, variant): ForestPieceAsset => {
          const name = `piece-${shape.toLowerCase()}-${LETTERS[variant]}`;
          return {
            key: `forest-${terrain}-${name}`,
            path: `${dir}/${name}.png`,
            w: cols * CELL_PX,
            h: rows * CELL_PX + FOREST_UP_PX,
            category: "forest-piece",
            set: terrain,
            shape,
            variant,
            cols,
            rows,
            footprint,
          };
        },
      );
    },
  );
  const seams = FOREST_SEAM_SIZES[terrain].map(
    ([w, h], index): ForestSeamAsset => ({
      key: `forest-${terrain}-seam-${index + 1}`,
      path: `${dir}/seam-${index + 1}.png`,
      w,
      h,
      category: "forest-seam",
      set: terrain,
      index,
    }),
  );
  return { terrain, source: GROUND_SOURCES[terrain], pieces, seams };
}

const OWN_FOREST_SETS: Readonly<Record<ForestGround, ForestSet>> =
  Object.fromEntries(
    FOREST_GROUNDS.map((terrain) => [terrain, forestSet(terrain)]),
  ) as Record<ForestGround, ForestSet>;

/**
 * One composed-forest set per land terrain: each art family's own (a
 * volcanic ground shares the wasteland's, GROUND_FAMILY; snow borrows the
 * grass set, FOREST_FAMILY).
 */
export const FOREST_SETS: Readonly<Record<GroundTerrain, ForestSet>> =
  Object.fromEntries(
    GROUND_TERRAINS.map((terrain) => [
      terrain,
      OWN_FOREST_SETS[FOREST_FAMILY[GROUND_FAMILY[terrain]]],
    ]),
  ) as Record<GroundTerrain, ForestSet>;

// ---------------------------------------------------------------- objects

/**
 * building: Pulp Wars improvements (lumber camp, sawmill, dinosaur
 * workshops); curiosity: one-cell landmarks usable as visitable sites;
 * pickup: 40x40 resource and treasure sprites, centred on the cell.
 */
export type ObjectKind = "building" | "curiosity" | "pickup";

export interface ObjectAsset extends ImageAsset {
  readonly category: "object";
  readonly kind: ObjectKind;
  readonly anchor: Point;
}

function object(
  key: string,
  kind: ObjectKind,
  w: number,
  h: number,
  anchor: Point,
): ObjectAsset {
  return {
    key,
    path: `assets/objects/${key}.png`,
    w,
    h,
    category: "object",
    kind,
    anchor,
  };
}

export const OBJECT_ASSETS: readonly ObjectAsset[] = [
  object("lumber-camp", "building", 72, 72, { x: 36, y: 32 }),
  object("sawmill", "building", 72, 72, { x: 36, y: 32 }),
  object("dinosaur-lumber-camp", "building", 72, 72, { x: 36, y: 32 }),
  object("dinosaur-chopping-block", "building", 72, 72, { x: 36, y: 32 }),
  object("dinosaur-grinding-stone", "building", 72, 72, { x: 36, y: 32 }),
  object("gold-claim", "curiosity", 80, 80, { x: 40, y: 40 }),
  object("shrine", "curiosity", 80, 80, { x: 40, y: 40 }),
  object("wishing-well", "curiosity", 80, 80, { x: 40, y: 40 }),
  object("fountain", "curiosity", 80, 80, { x: 40, y: 40 }),
  object("lost-expedition", "curiosity", 80, 80, { x: 40, y: 40 }),
  object("graveyard", "curiosity", 80, 80, { x: 40, y: 40 }),
  object("gate", "curiosity", 80, 80, { x: 40, y: 40 }),
  object("web", "curiosity", 80, 80, { x: 40, y: 40 }),
  object("downed-saucer", "curiosity", 80, 80, { x: 40, y: 40 }),
  object("ore", "pickup", 40, 40, { x: 20, y: 20 }),
  object("treasure", "pickup", 40, 40, { x: 20, y: 20 }),
  object("pearls", "pickup", 40, 40, { x: 20, y: 20 }),
  object("grave", "pickup", 40, 40, { x: 20, y: 20 }),
  // Studio art (bead border_marches-xaj.9).
  object("wood-pile", "pickup", 40, 40, { x: 20, y: 20 }),
  object("ore-pile", "pickup", 40, 40, { x: 20, y: 20 }),
  object("gold-pile", "pickup", 40, 40, { x: 20, y: 20 }),
  object("essence-crystals", "pickup", 40, 40, { x: 20, y: 20 }),
  object("essence-spring", "building", 72, 72, { x: 36, y: 32 }),
];

/**
 * The adventure-map pickup of each resource (docs/art/MVP_NEW_ART.md). The
 * imported copper `ore` is kept for other uses; its orange is too close to
 * the Lost World accent for the ore pile.
 */
export const RESOURCE_PICKUPS: Readonly<Record<ResourceId, string>> = {
  wood: "wood-pile",
  ore: "ore-pile",
  gold: "gold-pile",
  essence: "essence-crystals",
};

/**
 * The mine of each resource: imported art where it already reads well
 * (sawmill, the mined mountain, the gold claim), the studio essence spring
 * for essence. `mountain-mine-a` is a mountain piece (the board draws it in
 * place of a mountain cell); the others are objects.
 */
export const RESOURCE_MINES: Readonly<Record<ResourceId, string>> = {
  wood: "sawmill",
  ore: "mountain-mine-a",
  gold: "gold-claim",
  essence: "essence-spring",
};

/** A treasure chest pickup: the imported `treasure` reads as a chest. */
export const TREASURE_PICKUP = "treasure";

// ------------------------------------------------------- resource items

/** 32x32 resource sprites for the interface bar (own takes at 32 px). */
export interface ResourceItemAsset extends ImageAsset {
  readonly category: "resource-item";
  readonly resource: ResourceId;
}

export const RESOURCE_ITEMS: Readonly<Record<ResourceId, ResourceItemAsset>> =
  Object.fromEntries(
    (["gold", "wood", "ore", "essence"] as const).map((resource) => [
      resource,
      {
        key: `resource-item-${resource}`,
        path: `assets/ui/resources/${resource}.png`,
        w: 32,
        h: 32,
        category: "resource-item",
        resource,
      },
    ]),
  ) as Record<ResourceId, ResourceItemAsset>;

// ------------------------------------------- 3x2 towns (studio, xaj.14)

/**
 * Towns for the 3x2 town footprint (bead border_marches-xaj.14): 3 cells
 * wide, 2 rows deep. The canvas is the footprint plus 24 rows above it
 * (240 x 184); draw it at (x0 x 80, y0 x 80 - 24) for a footprint whose
 * north-west cell is (x0, y0). The art is centred and its lowest opaque row
 * sits 4 px above the canvas bottom (`box`). The yards inside the walls are
 * transparent, so the cell grounds show through; no flag (the owner shows
 * in the interface). The v0.2 factions (bead bzc.15, set faction-towns)
 * have two growth stages each, picked by the town's fort level:
 * `townArt` in src/assets/town-art.ts.
 */
export interface Town3x2Asset extends ImageAsset {
  readonly category: "town-3x2";
  /** Art family: dinosaur (Lost World), goblin (Horde), humans, undead. */
  readonly faction: "dinosaur" | "goblin" | "humans" | "undead";
  /** "camp" for fort levels 0-1 (a light wall), "fort" for 2-3. */
  readonly stage: "camp" | "fort";
  readonly cols: 3;
  readonly rows: 2;
  readonly up: 24;
  /** Opaque bounding box in the canvas. */
  readonly box: PixelBox;
  /** One past the lowest opaque row (= box.y + box.h). */
  readonly contactY: number;
  readonly source: string;
}

function town3x2(
  key: string,
  faction: Town3x2Asset["faction"],
  stage: Town3x2Asset["stage"],
  box: readonly [number, number, number, number],
  source: string,
): Town3x2Asset {
  return {
    key,
    path: `assets/towns/${key}.png`,
    w: 3 * CELL_PX,
    h: 2 * CELL_PX + 24,
    category: "town-3x2",
    faction,
    stage,
    cols: 3,
    rows: 2,
    up: 24,
    box: { x: box[0], y: box[1], w: box[2], h: box[3] },
    contactY: box[1] + box[3],
    source,
  };
}

/**
 * The Lost World town, the goblin Warlord's Hold (also the Horde town's fort
 * stage) and the v0.2 faction towns at 3x2.
 */
export const TOWN_3X2_ASSETS: readonly Town3x2Asset[] = [
  town3x2(
    "dinosaur-town-3x2",
    "dinosaur",
    "fort",
    [4, 13, 232, 167],
    "towns-3x2/lost-world-a-clean2#0",
  ),
  town3x2(
    "goblin-hold-3x2",
    "goblin",
    "fort",
    [4, 10, 232, 170],
    "towns-3x2/goblin-hold-v4a#0",
  ),
  town3x2(
    "horde-warcamp-3x2",
    "goblin",
    "camp",
    [4, 18, 232, 162],
    "faction-towns/horde-camp-a#0",
  ),
  town3x2(
    "realm-village-3x2",
    "humans",
    "camp",
    [4, 44, 232, 136],
    "faction-towns/realm-camp-a#0",
  ),
  town3x2(
    "realm-castle-3x2",
    "humans",
    "fort",
    [4, 6, 232, 174],
    "faction-towns/realm-fort-a#0",
  ),
  town3x2(
    "restless-graveyard-3x2",
    "undead",
    "camp",
    [4, 5, 232, 175],
    "faction-towns/restless-camp-a#0",
  ),
  town3x2(
    "restless-churchyard-3x2",
    "undead",
    "fort",
    [4, 5, 232, 175],
    "faction-towns/restless-fort-a#0",
  ),
];

// --------------------------------------------- doodads (studio, xaj.14)

/**
 * Small decorations for the map's decoration layer (bead xaj.14): 5-6 per
 * land terrain, each cropped to its opaque box plus a 1 px margin (24-41
 * px), calmer than units and pickups. `anchor` is the bottom-centre contact
 * point (place it on the ground point the decoration stands on). Not wired
 * yet (bead xaj.15).
 */
export interface DoodadAsset extends ImageAsset {
  readonly category: "doodad";
  readonly terrain: GroundTerrain;
  /** What it is: bush, flowers, stones, fern, palm, skull, crater, ... */
  readonly kind: string;
  readonly variant: number;
  readonly anchor: Point;
}

/** [terrain, kind, letter, w, h] of every doodad. */
const DOODAD_ROWS: readonly (readonly [
  GroundTerrain,
  string,
  string,
  number,
  number,
])[] = [
  ["grass", "bush", "a", 34, 34],
  ["grass", "bush", "b", 34, 31],
  ["grass", "flowers", "a", 27, 26],
  ["grass", "flowers", "b", 36, 23],
  ["grass", "stones", "a", 33, 27],
  ["grass", "mushrooms", "a", 26, 20],
  ["jungle", "fern", "a", 37, 38],
  ["jungle", "palm", "a", 37, 33],
  ["jungle", "boulder", "a", 34, 31],
  ["jungle", "leaves", "a", 38, 35],
  ["jungle", "log", "a", 37, 30],
  ["steppe", "tumbleweed", "a", 32, 32],
  ["steppe", "skull", "a", 36, 33],
  ["steppe", "cactus", "a", 29, 29],
  ["steppe", "shrub", "a", 37, 31],
  ["steppe", "grass", "a", 34, 34],
  ["badlands", "rocks", "a", 34, 28],
  ["badlands", "rocks", "b", 37, 34],
  ["badlands", "crater", "a", 37, 24],
  ["badlands", "mesa", "a", 38, 28],
  ["badlands", "pillar", "a", 27, 36],
  ["wasteland", "stump", "a", 31, 33],
  ["wasteland", "bones", "a", 31, 24],
  ["wasteland", "ash", "a", 36, 19],
  ["wasteland", "twigs", "a", 34, 27],
  ["wasteland", "stone", "a", 30, 28],
  // Snow (bead bzc.87, set winter-doodads).
  ["snow", "stones", "a", 34, 25],
  ["snow", "stones", "b", 27, 26],
  ["snow", "grass", "a", 29, 23],
  ["snow", "bush", "a", 29, 24],
  ["snow", "ice", "a", 29, 32],
  ["snow", "twigs", "a", 30, 32],
];

export const DOODAD_ASSETS: readonly DoodadAsset[] = DOODAD_ROWS.map(
  ([terrain, kind, letter, w, h]) => ({
    key: `doodad-${terrain}-${kind}-${letter}`,
    path: `assets/terrain/doodads/${terrain}/${kind}-${letter}.png`,
    w,
    h,
    category: "doodad",
    terrain,
    kind,
    variant: LETTERS.indexOf(letter),
    anchor: { x: Math.floor(w / 2), y: h - 1 },
  }),
);

/** The doodads of one terrain. */
export function doodadsOf(terrain: GroundTerrain): readonly DoodadAsset[] {
  const family = GROUND_FAMILY[terrain];
  return DOODAD_ASSETS.filter((doodad) => doodad.terrain === family);
}

// ---------------------------------------------------------- spell frames

/** The schools whose spells get a frame in the book. */
const FRAME_SCHOOLS = ["bloom", "accord", "clock", "hush", "storm"] as const;

/**
 * The spellbook's ornate school frames (bead bzc.99, set `spell-frames`):
 * 48 x 48 around the 32 x 32 spell icon, a plain and a gilded (mastery)
 * frame per school. Key `frame-spell-<school>[-gilded]`.
 */
export const SPELL_FRAME_ASSETS: readonly ImageAsset[] = FRAME_SCHOOLS.flatMap(
  (school) =>
    (["", "-gilded"] as const).map((v) => ({
      key: `frame-spell-${school}${v}`,
      path: `assets/frames/spell-${school}${v}.png`,
      w: 48,
      h: 48,
      category: "frame" as const,
    })),
);

// -------------------------------------------------------------- registry

/** Every image in the manifest, once. */
export const ALL_ASSETS: readonly ImageAsset[] = [
  ...UNIT_ASSETS,
  ...HERO_ASSETS,
  ...PORTRAIT_ASSETS,
  ...TOWN_ASSETS,
  ...Object.values(GROUND_TEXTURES),
  ...Object.values(GROUND_SWATCHES),
  ...Object.values(GROUND_OVERLAYS).filter((a) => a !== undefined),
  ...WATER_TILES,
  ...MOUNTAIN_PIECES,
  ...MOUNTAIN_EXTRAS,
  ...Object.values(OWN_FOREST_SETS).flatMap((set) => [
    ...set.pieces,
    ...set.seams,
  ]),
  ...OBJECT_ASSETS,
  ...Object.values(RESOURCE_ITEMS),
  ...TOWN_3X2_ASSETS,
  ...DOODAD_ASSETS,
  ...DECORATION_ASSETS,
  ...TREE_ASSETS,
  ...PEAK_ASSETS,
  ...MAP_OBJECT_ASSETS,
  ...BUILDING_ART_ASSETS,
  ...TOWN_BACKDROP_ASSETS,
  ...ALL_ICON_ASSETS,
  ...SPELL_FRAME_ASSETS,
];

const BY_KEY: ReadonlyMap<string, ImageAsset> = new Map(
  ALL_ASSETS.map((asset) => [asset.key, asset]),
);

/** The asset with this key; throws on an unknown key. */
export function assetByKey(key: string): ImageAsset {
  const asset = BY_KEY.get(key);
  if (asset === undefined) throw new Error(`unknown asset key: ${key}`);
  return asset;
}
