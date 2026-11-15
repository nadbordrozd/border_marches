/**
 * Mountain ranges as packed massifs (beads border_marches-xaj.15, xaj.19
 * and xaj.20), drawn with the studio massif pieces of beads xaj.14, xaj.19
 * and xaj.20 (docs/art/MASSIF_ART.md).
 *
 * The goal, in the user's words: "all the mountain ranges look unique.
 * they're not but there is enough variety and they are cleverly connected so
 * that no matter the shape of the mountain range it looks like a coherent
 * whole and not like the same rock sprite pasted 20 times."
 *
 * Since bead xaj.20 the generator guarantees that every Mountain cell lies
 * in an all-Mountain 2x2 block (the user: "it is acceptable if the smallest
 * mountain is 2x2 tiles"), so every row run of rock is at least two cells
 * long and the cover needs no single-cell pieces.
 *
 * A RANGE is an 8-connected group of Mountain cells. Each cell gets a rock
 * PALETTE (granite, sandstone, basalt) from the grounds of the range cells
 * round it (MASSIF_PALETTE_TERRAINS): a small range takes its majority
 * ground, a long border range changes palette where its ground changes;
 * patches under MIN_PATCH cells join their surroundings, and a lone cell of
 * a palette in a row takes its neighbour's (widenPaletteRuns). No piece
 * spans two palettes, and every cell next to another palette (a SEAM) takes
 * low pieces only, so the rock changes at a saddle, not between two cliffs.
 *
 * The range is then covered exactly, cell by cell, with pieces:
 *
 * 1. MASSIFS (3x2, 2x2 and the tall 2x3 seen end-on) where the range is two
 *    or three rows deep, picked greedily by a score that likes big pieces,
 *    rock on their vertical sides (a massif's sides are cliffs of rock that
 *    want rock against them), rock behind them and a coordinate hash, so
 *    solid blocks are tiled irregularly, never on a lattice. A massif never
 *    leaves a single free cell beside it in a row. In a north-south band
 *    two or three cells wide a massif is one of the band's summits (2x3
 *    liked most); massifs on exactly the same columns are not stacked edge
 *    to edge in a band, so summits alternate with low saddles, while
 *    massifs offset by a column may touch and step sideways like a ridge.
 * 2. Every remaining run of cells in a row is cut (dynamic programming)
 *    into RIDGES (3x1, 2x1) or low 3x1 and 2x1 humps, liking long pieces
 *    and disliking a seam right under a seam of the row behind (so rows lie
 *    like bricks). A 2x1 on the range's back rim, between two summits of a
 *    band, or in front of rock, is sometimes a low ROUNDED or FOOTHILL hump
 *    (sandstone more often: its 2x1 ridges are little stepped buttes); a
 *    three-cell run where a tall ridge may not stand is a low 3x1 hump. A
 *    1x1 single is a fallback only (a Mountain cell under an object).
 * 3. VARIANTS: a weighted hashed pick that avoids the sprites near by and
 *    keeps pieces of one silhouette FAMILY (the sandstone tower buttes, the
 *    fluted hills, the domes, the tables) apart; pieces whose art has a
 *    straight cut side (EDGE_NEEDS) go only where rock meets that side.
 * 4. BACK-FILLS: where four range cells meet at a corner that is a joint
 *    between pieces (or two cells of a one-cell-wide column meet), a low
 *    1x1 piece stands on the joint half a cell off the grid, drawn behind
 *    the row in front: it fills the ground that would show in the notches
 *    between pieces, so the range reads as one mass, and breaks the cell
 *    lattice. Side boulders straddle the foot of a cliff's open side. Both
 *    are thinned by palette (FILL_RATE, SIDE_RATE): sandstone ranges were
 *    busy with a boulder on every joint.
 *
 * Paint rising above a piece's footprint over an OPEN cell (no rock behind)
 * is held to OPEN_RISE_MAX px, so a hero standing behind a range keeps his
 * cell centre visible; pieces never paint sideways past their footprint.
 * Every choice is a pure function of the range's own cells (and their
 * grounds) and coordinate hashes: the cover is packed over the whole map,
 * explored or not, so nothing changes shape when the fog lifts, and a change
 * outside a range never changes it.
 */
import {
  CELL_PX,
  MASSIF_PALETTE_TERRAINS,
  massifPieces,
} from "../../assets/manifest";
import type {
  MassifPalette,
  MassifPieceAsset,
  MassifPieceKind,
} from "../../assets/manifest";
import type { GameMap, Terrain } from "../../core/map/types";
import { hash4 } from "./hash";

const CELL = CELL_PX;

/** Most paint (px) a piece may raise over an open cell behind it. */
export const OPEN_RISE_MAX = 32;
/** Cells round a cell whose grounds vote on its palette (Chebyshev). */
export const PALETTE_RADIUS = 4;
/** A palette patch of fewer cells joins the palette round it. */
export const MIN_PATCH = 12;
/**
 * A palette patch under ISLAND_PATCH cells that is also under a third of its
 * range joins its surroundings too (bead xaj.21): a small granite patch at a
 * palette border read as a grey island in a sandstone range.
 */
export const ISLAND_PATCH = 30;

export const PALETTES: readonly MassifPalette[] = [
  "granite",
  "sandstone",
  "basalt",
];

/** The palette of a ground terrain (granite for anything unlisted). */
export function paletteOf(terrain: Terrain): MassifPalette {
  for (const palette of PALETTES)
    if (
      (MASSIF_PALETTE_TERRAINS[palette] as readonly string[]).includes(terrain)
    )
      return palette;
  return "granite";
}

/** One piece of the cover: an asset on the footprint whose NW cell is (x, y). */
export interface RangePiece {
  readonly asset: MassifPieceAsset;
  readonly x: number;
  readonly y: number;
}

/** A back-fill: a low piece drawn off the grid, behind the row `row`. */
export interface RangeFill {
  readonly asset: MassifPieceAsset;
  /** Canvas top-left, world px. */
  readonly dx: number;
  readonly dy: number;
  /** Sort position: before the pieces of this row ... */
  readonly row: number;
  readonly col: number;
  /** ... or, for a boulder at a piece's side, after the piece. */
  readonly front?: boolean;
}

export interface RangeCover {
  readonly pieces: readonly RangePiece[];
  readonly fills: readonly RangeFill[];
  /** The palette of every Mountain cell, by row-major index. */
  readonly palette: ReadonlyMap<number, MassifPalette>;
  /** The piece covering every Mountain cell, by row-major index. */
  readonly pieceAt: ReadonlyMap<number, RangePiece>;
}

/** A piece before its variant is chosen. */
interface Slot {
  readonly palette: MassifPalette;
  readonly x: number;
  readonly y: number;
  readonly cols: 1 | 2 | 3 | 4 | 5;
  readonly rows: 1 | 2 | 3;
  /** Kinds it may take, with weights. */
  readonly kinds: readonly (readonly [MassifPieceKind, number])[];
  /** Paint over an open cell behind is limited (OPEN_RISE_MAX). */
  readonly openBehind: boolean;
  /**
   * Rock behind and on at least half its sides (bead xaj.21): the slot
   * lies inside a range, where landmark pieces (LANDMARK_FAMILIES) are not
   * used.
   */
  readonly interior?: boolean;
}

const unit = (x: number, y: number, salt: number): number =>
  hash4(x, y, salt, 0x3a55) / 0x1_0000_0000;

/**
 * Relative weights of pieces that would read as one sprite pasted if they
 * came up as often as the rest. The four sandstone massifs of bead xaj.14
 * and its tall butte ridge are all tower buttes of much the same silhouette
 * (MASSIF_ART.md): since bead xaj.19 brought rounder and lower sandstone
 * massifs, the towers are accents among them.
 */
const ASSET_WEIGHT: Readonly<Record<string, number>> = {
  "massif-sandstone-ridge-2x1-a": 0.35,
  "massif-sandstone-massif-2x2-a": 0.35,
  "massif-sandstone-massif-2x2-m": 0.35,
  "massif-sandstone-massif-2x2-l": 0.45,
  "massif-sandstone-massif-2x2-b": 0.35,
  "massif-sandstone-massif-3x2-a": 0.35,
  "massif-sandstone-massif-3x2-b": 0.35,
  // The fluted badlands hills catch the eye: a little rarer than the rest.
  "massif-sandstone-massif-2x2-c": 0.45,
  "massif-sandstone-massif-3x2-e": 0.45,
  "massif-sandstone-massif-3x2-d": 0.7,
  "massif-sandstone-massif-2x2-g": 0.45,
  "massif-sandstone-massif-3x2-f": 0.45,
  "massif-sandstone-massif-3x2-g": 0.6,
  // Bead xaj.22: six hoodoo sprites now (three recoloured siblings); the
  // family as a whole should not come up more often than before.
  "massif-sandstone-massif-2x2-e": 0.6,
  "massif-sandstone-massif-2x2-i": 0.6,
  "massif-sandstone-massif-2x2-j": 0.6,
  "massif-sandstone-massif-2x2-k": 0.6,
  "massif-sandstone-massif-3x2-i": 0.6,
  // Bead xaj.22: the low eroded sandstone ridges that are not buttes are
  // the usual sandstone 2x1 hump; the snowy granite 2x1 ridges (one
  // silhouette, three sprites) give way to the snowless ones.
  "massif-sandstone-rounded-2x1-e": 1.6,
  "massif-sandstone-rounded-2x1-f": 1.6,
  "massif-sandstone-rounded-2x1-g": 1.6,
  "massif-granite-ridge-2x1-a": 0.6,
  "massif-granite-ridge-2x1-b": 0.6,
  "massif-granite-ridge-2x1-c": 0.6,
  // The blocky granite foothills read as stairs (bead xaj.19 review): the
  // rounded boulders of xaj.19 take most of their place as singles too.
  "massif-granite-foothill-1x1-a": 0.25,
  "massif-granite-foothill-1x1-b": 0.25,
  // The basalt massifs whose foot is a scree skirt, not a box of columns
  // (xaj.19, xaj.20): favoured; the four boxy ones are accents now.
  "massif-basalt-massif-2x2-c": 1.4,
  "massif-basalt-massif-2x2-d": 1.4,
  "massif-basalt-massif-3x2-c": 1.4,
  "massif-basalt-massif-3x2-d": 1.4,
  "massif-basalt-massif-2x2-a": 0.35,
  "massif-basalt-massif-2x2-b": 0.35,
  "massif-basalt-massif-3x2-a": 0.35,
  "massif-basalt-massif-3x2-b": 0.35,
  // Granite interiors were mostly snowy cones (bead xaj.21 review): the
  // snowless domes, slabs, cliffs and forested shoulders come up as often.
  "massif-granite-massif-2x2-a": 0.6,
  "massif-granite-massif-2x2-c": 0.6,
  "massif-granite-massif-3x2-a": 0.6,
  "massif-granite-massif-3x2-b": 0.6,
};

/**
 * Silhouette families: pieces of one family are never picked within
 * FAMILY_REACH cells of another of the family, even when their sprites
 * differ (four tower buttes side by side read as one tower pasted).
 */
const FAMILY: Readonly<Record<string, string>> = {
  "massif-sandstone-ridge-2x1-a": "sandstone-tower",
  "massif-sandstone-massif-2x2-a": "sandstone-tower",
  "massif-sandstone-massif-2x2-b": "sandstone-tower",
  "massif-sandstone-massif-3x2-a": "sandstone-tower",
  "massif-sandstone-massif-3x2-b": "sandstone-tower",
  // The xaj.19 sandstone massifs are distinctive enough that two of one
  // kind near each other read as one sprite pasted too.
  "massif-sandstone-massif-2x2-c": "sandstone-fluted",
  "massif-sandstone-massif-2x2-d": "sandstone-domes",
  "massif-sandstone-massif-3x2-c": "sandstone-domes",
  "massif-sandstone-massif-3x2-d": "sandstone-table",
  "massif-sandstone-ridge-2x1-d": "sandstone-table",
  "massif-sandstone-massif-2x2-e": "sandstone-hoodoos",
  "massif-sandstone-massif-3x2-e": "sandstone-fluted",
  // Bead xaj.20: two more fluted hills, a low fluted back-rim hill, a
  // hoodoo field and the 2x3 end-on ridge (a mesa summit, so a tower).
  "massif-sandstone-massif-2x2-f": "sandstone-fluted",
  "massif-sandstone-massif-2x2-g": "sandstone-fluted",
  "massif-sandstone-massif-3x2-f": "sandstone-fluted",
  "massif-sandstone-massif-3x2-g": "sandstone-hoodoos",
  "massif-sandstone-massif-2x3-a": "sandstone-tower",
  "massif-sandstone-massif-2x3-b": "sandstone-tower",
  "massif-sandstone-ridge-3x1-d": "sandstone-table",
  "massif-sandstone-massif-2x2-h": "sandstone-table",
  // Bead xaj.22: the red hoodoo mound was in no family and showed three
  // times on one screen.
  "massif-sandstone-massif-2x2-i": "sandstone-hoodoos",
  "massif-sandstone-massif-2x2-j": "sandstone-hoodoos",
  "massif-sandstone-massif-2x2-l": "sandstone-fluted",
  "massif-sandstone-massif-2x2-m": "sandstone-tower",
  "massif-sandstone-massif-2x2-k": "sandstone-hoodoos",
  "massif-sandstone-massif-3x2-i": "sandstone-hoodoos",
  // The 3x2 scree massif was styled from the 2x2 one: the same mountain.
  "massif-basalt-massif-2x2-c": "basalt-scree",
  "massif-basalt-massif-3x2-c": "basalt-scree",
  "massif-basalt-massif-2x2-d": "basalt-spires",
  "massif-basalt-massif-3x2-d": "basalt-spires",
  // Bead xaj.21: the snowless granite domes and forested shoulders, each a
  // 2x2 and a 3x2 of one silhouette.
  "massif-granite-massif-2x2-e": "granite-domes",
  "massif-granite-massif-3x2-f": "granite-domes",
  "massif-granite-massif-3x2-e": "granite-forest",
  "massif-granite-massif-2x2-f": "granite-forest",
  // Bead xaj.22: the tablelands. Every fluted one copies the outline and
  // fluting of plateau-3x2-a, so two of them near each other read as one
  // sprite pasted unless they join into one tableland.
  "massif-sandstone-plateau-3x2-a": "sandstone-tableland",
  "massif-sandstone-plateau-4x2-a": "sandstone-tableland",
  "massif-sandstone-plateau-5x2-a": "sandstone-tableland",
  "massif-sandstone-plateau-4x2-b": "sandstone-tableland",
  "massif-sandstone-plateau-5x2-b": "sandstone-tableland",
  "massif-sandstone-plateau-3x2-c": "sandstone-tableland",
  "massif-sandstone-plateau-3x2-d": "sandstone-tableland",
  "massif-sandstone-plateau-3x2-e": "sandstone-tableland",
  "massif-sandstone-plateau-3x2-f": "sandstone-tableland",
  "massif-sandstone-plateau-3x2-g": "sandstone-tableland",
  "massif-sandstone-plateau-2x2-b": "sandstone-tableland",
  "massif-sandstone-plateau-2x2-c": "sandstone-tableland",
  "massif-sandstone-plateau-2x2-d": "sandstone-tableland",
  "massif-sandstone-plateau-2x2-e": "sandstone-tableland",
  "massif-sandstone-plateau-2x2-f": "sandstone-tableland",
  "massif-sandstone-plateau-2x2-g": "sandstone-tableland",
  "massif-sandstone-plateau-2x2-h": "sandstone-tableland",
  // The banded tablelands (straight striped cliffs): a family of their own.
  "massif-sandstone-plateau-4x2-c": "sandstone-tableland-banded",
  "massif-sandstone-plateau-2x2-i": "sandstone-tableland-banded",
  "massif-sandstone-plateau-2x2-j": "sandstone-tableland-banded",
  "massif-sandstone-plateau-2x2-k": "sandstone-tableland-banded",
  "massif-sandstone-plateau-3x2-h": "sandstone-tableland-banded",
  "massif-sandstone-plateau-3x2-i": "sandstone-tableland-banded",
  "massif-sandstone-plateau-5x2-c": "sandstone-tableland-banded",
  "massif-sandstone-plateau-3x2-j": "sandstone-tableland-banded",
  "massif-sandstone-plateau-3x2-k": "sandstone-tableland-banded",
  "massif-sandstone-plateau-2x2-l": "sandstone-tableland-banded",
  "massif-sandstone-plateau-4x2-d": "sandstone-tableland",
  "massif-sandstone-plateau-4x2-e": "sandstone-tableland",
  "massif-sandstone-plateau-4x2-f": "sandstone-tableland",
  "massif-sandstone-plateau-4x2-g": "sandstone-tableland",
  "massif-sandstone-plateau-4x2-h": "sandstone-tableland-banded",
  "massif-sandstone-plateau-4x2-i": "sandstone-tableland-banded",
  "massif-sandstone-plateau-4x2-j": "sandstone-tableland-banded",
  "massif-sandstone-plateau-2x2-m": "sandstone-tableland-banded",
  "massif-sandstone-plateau-2x2-n": "sandstone-tableland-banded",
  "massif-sandstone-plateau-2x2-o": "sandstone-tableland-banded",
  "massif-sandstone-plateau-3x2-l": "sandstone-tableland-banded",
  "massif-sandstone-plateau-3x2-m": "sandstone-tableland-banded",
  "massif-sandstone-plateau-5x2-d": "sandstone-tableland-banded",
  "massif-sandstone-plateau-3x2-n": "sandstone-tableland-banded",
  "massif-sandstone-plateau-2x2-p": "sandstone-tableland-banded",
  "massif-sandstone-plateau-3x2-o": "sandstone-tableland-banded",
  "massif-sandstone-plateau-4x2-k": "sandstone-tableland-banded",
  "massif-sandstone-plateau-4x2-l": "sandstone-tableland-banded",
  // Whole small banded mesas: quiet pieces for interior 2x2 slots, a family
  // of their own (they never join).
  "massif-sandstone-plateau-2x2-q": "sandstone-mesa-banded",
  "massif-sandstone-plateau-2x2-r": "sandstone-mesa-banded",
};
/**
 * Pieces with a straight cut edge (the art was clipped by the image edge, or
 * its foot is a straight line) and the sides that must have rock against
 * them: they are only picked where no open ground meets that edge, unless
 * nothing else fits the slot.
 */
const EDGE_NEEDS: Readonly<
  Record<string, readonly ("west" | "east" | "front")[]>
> = {
  "massif-sandstone-massif-3x2-c": ["west", "east", "front"],
  "massif-sandstone-ridge-2x1-d": ["east"],
  "massif-sandstone-massif-3x2-e": ["east"],
  "massif-sandstone-ridge-3x1-c": ["east"],
  "massif-sandstone-massif-2x2-g": ["east"],
  "massif-sandstone-massif-3x2-g": ["east"],
  "massif-sandstone-massif-3x2-i": ["east"],
  "massif-granite-massif-2x2-d": ["east"],
  "massif-sandstone-massif-2x2-h": ["west", "east"],
  // Bead xaj.21 takes cut by the right edge of the image.
  "massif-sandstone-plateau-3x2-b": ["east"],
  "massif-granite-massif-2x2-e": ["east"],
  "massif-granite-massif-2x2-f": ["east"],
  "massif-sandstone-massif-2x3-b": ["west"],
  "massif-sandstone-plateau-2x2-a": ["west", "east"],
};

/**
 * Tableland pieces cut at a cell edge from a wide tableland take (bead
 * xaj.22) and the sides where the rock runs on, uncut by a cliff. Every
 * tableland take copies one composed outline (art/review/compose-style.mjs),
 * so its rim and foot stand at the same heights on every cell edge: a piece
 * cut on its east side joins any piece cut on its west side, and a chain of
 * them reads as one tableland, not a row of separate mesas. A cut piece is
 * used only where it joins, and a slot next to a cut piece always takes a
 * piece cut on that side.
 */
export const TABLE_CUT: Readonly<
  Record<
    string,
    {
      readonly west: boolean;
      readonly east: boolean;
      /** Pieces join only within one outline family. */
      readonly family: "fluted" | "banded";
    }
  >
> = {
  "massif-sandstone-plateau-3x2-c": {
    west: false,
    east: true,
    family: "fluted",
  },
  "massif-sandstone-plateau-3x2-d": {
    west: true,
    east: true,
    family: "fluted",
  },
  "massif-sandstone-plateau-3x2-e": {
    west: true,
    east: false,
    family: "fluted",
  },
  "massif-sandstone-plateau-2x2-b": {
    west: true,
    east: false,
    family: "fluted",
  },
  "massif-sandstone-plateau-2x2-c": {
    west: false,
    east: true,
    family: "fluted",
  },
  "massif-sandstone-plateau-2x2-d": {
    west: true,
    east: false,
    family: "fluted",
  },
  "massif-sandstone-plateau-2x2-e": {
    west: true,
    east: true,
    family: "fluted",
  },
  "massif-sandstone-plateau-2x2-f": {
    west: false,
    east: true,
    family: "fluted",
  },
  "massif-sandstone-plateau-2x2-g": {
    west: true,
    east: false,
    family: "fluted",
  },
  "massif-sandstone-plateau-3x2-f": {
    west: false,
    east: true,
    family: "fluted",
  },
  "massif-sandstone-plateau-2x2-h": {
    west: true,
    east: false,
    family: "fluted",
  },
  "massif-sandstone-plateau-3x2-g": {
    west: true,
    east: true,
    family: "fluted",
  },
  "massif-sandstone-plateau-2x2-i": {
    west: false,
    east: true,
    family: "banded",
  },
  "massif-sandstone-plateau-2x2-j": {
    west: true,
    east: false,
    family: "banded",
  },
  "massif-sandstone-plateau-2x2-k": {
    west: true,
    east: true,
    family: "banded",
  },
  "massif-sandstone-plateau-3x2-h": {
    west: false,
    east: true,
    family: "banded",
  },
  "massif-sandstone-plateau-3x2-i": {
    west: true,
    east: false,
    family: "banded",
  },
  "massif-sandstone-plateau-3x2-j": {
    west: false,
    east: true,
    family: "banded",
  },
  "massif-sandstone-plateau-3x2-k": {
    west: true,
    east: true,
    family: "banded",
  },
  "massif-sandstone-plateau-2x2-l": {
    west: true,
    east: false,
    family: "banded",
  },
  "massif-sandstone-plateau-4x2-d": {
    west: false,
    east: true,
    family: "fluted",
  },
  "massif-sandstone-plateau-4x2-e": {
    west: true,
    east: false,
    family: "fluted",
  },
  "massif-sandstone-plateau-4x2-f": {
    west: false,
    east: true,
    family: "fluted",
  },
  "massif-sandstone-plateau-4x2-g": {
    west: true,
    east: false,
    family: "fluted",
  },
  "massif-sandstone-plateau-4x2-h": {
    west: false,
    east: true,
    family: "banded",
  },
  "massif-sandstone-plateau-4x2-i": {
    west: true,
    east: false,
    family: "banded",
  },
  "massif-sandstone-plateau-2x2-m": {
    west: false,
    east: true,
    family: "banded",
  },
  "massif-sandstone-plateau-2x2-n": {
    west: true,
    east: false,
    family: "banded",
  },
  "massif-sandstone-plateau-2x2-o": {
    west: true,
    east: true,
    family: "banded",
  },
  "massif-sandstone-plateau-3x2-l": {
    west: false,
    east: true,
    family: "banded",
  },
  "massif-sandstone-plateau-3x2-m": {
    west: true,
    east: false,
    family: "banded",
  },
  "massif-sandstone-plateau-3x2-n": {
    west: false,
    east: true,
    family: "banded",
  },
  "massif-sandstone-plateau-2x2-p": {
    west: true,
    east: false,
    family: "banded",
  },
  "massif-sandstone-plateau-3x2-o": {
    west: true,
    east: true,
    family: "banded",
  },
  "massif-sandstone-plateau-4x2-k": {
    west: false,
    east: true,
    family: "banded",
  },
  "massif-sandstone-plateau-4x2-l": {
    west: true,
    east: false,
    family: "banded",
  },
};
/** Share of plateau slots with a plateau slot east of them that join it. */
const JOIN_RATE = 0.9;
/** Share of joined chains that run on past a slot that could end them. */
const CHAIN_RATE = 1;

/** Cut tableland pieces of a footprint with these joined sides. */
function tablePieces(
  palette: MassifPalette,
  cols: number,
  rows: number,
  west: boolean,
  east: boolean,
  family?: string,
): readonly MassifPieceAsset[] {
  return massifPieces(palette, "plateau", cols, rows).filter((p) => {
    const cut = TABLE_CUT[p.key];
    return (
      cut !== undefined &&
      cut.west === west &&
      cut.east === east &&
      (family === undefined || cut.family === family)
    );
  });
}

/** Cells round a piece in which its family must not repeat. */
const FAMILY_REACH = 3;
/**
 * Wider spacing for the landmark families. Since bead xaj.22 the reach is
 * screen-scale: a zoom-0.75 screen is 24 x 15 cells, and the red hoodoo
 * mound showed three times on one along a range edge. Measured over the whole
 * map, not per range, so two ranges side by side keep it too.
 */
const FAMILY_REACH_OF: Readonly<Record<string, number>> = {
  "sandstone-tower": 7,
  "sandstone-table": 4,
  // Five fluted sprites since bead xaj.20: at zoom 1 a screen showed five.
  "sandstone-fluted": 6,
  "sandstone-hoodoos": 7,
  "sandstone-domes": 6,
  "sandstone-tableland": 6,
  "sandstone-tableland-banded": 5,
};
/**
 * Least distance (cells, footprint to footprint) between two copies of one
 * landmark sprite (bead xaj.22): at zoom 0.75 a screen shows a landmark
 * sprite at most about twice. Other sprites keep the near-by rule only.
 */
export const LANDMARK_SPRITE_REACH = 12;
/**
 * The wide tablelands and the 3x3 pieces are big enough to be recognised
 * as one sprite twice on a screen: they keep LANDMARK_SPRITE_REACH too.
 */
const isBig = (asset: MassifPieceAsset): boolean =>
  asset.cols >= 4 || asset.rows >= 3 || TABLE_CUT[asset.key] !== undefined;
/**
 * What counts as one sprite for the spacing: a tableland piece is its take
 * (a cut piece shows the same rock as the whole take), anything else its
 * own file.
 */
const spriteOf = (asset: MassifPieceAsset): string =>
  asset.kind === "plateau" && (asset.cols >= 4 || TABLE_CUT[asset.key])
    ? asset.source
    : asset.key;

/**
 * Landmark pieces (bead xaj.21): the sandstone towers, hoodoo fields, domes
 * and tall fluted hills each have a silhouette of their own, and a big
 * badlands range made of them read as a collection of monuments, not one
 * eroded plateau. They stand on a range's edges; its interior takes the
 * flat-topped plateaus and the quiet tables.
 */
const LANDMARK_FAMILIES: ReadonlySet<string> = new Set([
  "sandstone-tower",
  "sandstone-hoodoos",
  "sandstone-domes",
  "sandstone-fluted",
]);
/** Low sandstone pieces of the landmark families that may stand inside. */
const QUIET: ReadonlySet<string> = new Set([
  "massif-sandstone-massif-2x2-f",
  "massif-sandstone-massif-3x2-h",
]);
/**
 * The long low sandstone benches of bead xaj.21 are the back edge of a
 * plateau: on the open back rim they replace the 2x1 humps, inside a range
 * (rock behind) they would leave a flat gap between the massifs.
 */
const BACK_EDGE_ONLY: ReadonlySet<string> = new Set([
  "massif-sandstone-rounded-3x1-c",
  "massif-sandstone-rounded-3x1-d",
  "massif-sandstone-rounded-3x1-e",
]);
export const isLandmark = (key: string): boolean =>
  !QUIET.has(key) && LANDMARK_FAMILIES.has(FAMILY[key] ?? "");

/**
 * Weight of a whole family against the rest (bead xaj.22): the fluted
 * tablelands all copy the fluting of plateau-3x2-a (tree stumps, organ
 * pipes), and their 2-cell ends look like fluted hills; the banded ones
 * (straight striped cliffs) come first.
 */
const FAMILY_WEIGHT: Readonly<Record<string, number>> = {
  "sandstone-tableland": 0.5,
  "sandstone-tableland-banded": 1.5,
};
const weightOf = (key: string): number =>
  (ASSET_WEIGHT[key] ?? 1) * (FAMILY_WEIGHT[FAMILY[key] ?? ""] ?? 1);

/** The pieces a slot may take, by its kinds and the rise rule. */
function candidates(
  slot: Slot,
  open?: { west: boolean; east: boolean; front: boolean },
  join?: { west: boolean; east: boolean; family?: string | undefined },
): { asset: MassifPieceAsset; w: number }[] {
  const out: { asset: MassifPieceAsset; w: number }[] = [];
  if (join !== undefined && (join.west || join.east))
    return tablePieces(
      slot.palette,
      slot.cols,
      slot.rows,
      join.west,
      join.east,
      join.family,
    ).map((asset) => ({ asset, w: weightOf(asset.key) }));
  for (const [kind, weight] of slot.kinds) {
    const list = massifPieces(slot.palette, kind, slot.cols, slot.rows).filter(
      (p) =>
        (!slot.openBehind || p.paintUp <= OPEN_RISE_MAX) &&
        (slot.openBehind || !BACK_EDGE_ONLY.has(p.key)) &&
        TABLE_CUT[p.key] === undefined,
    );
    for (const asset of list)
      out.push({
        asset,
        w: (weightOf(asset.key) * weight) / list.length,
      });
  }
  if (open === undefined) return out;
  if (slot.interior === true) {
    const quiet = out.filter(({ asset }) => !isLandmark(asset.key));
    if (quiet.length > 0) out.splice(0, out.length, ...quiet);
  }
  const fit = out.filter(({ asset }) => {
    const needs = EDGE_NEEDS[asset.key];
    return needs === undefined || !needs.some((side) => open[side]);
  });
  return fit.length > 0 ? fit : out;
}

/**
 * Whether a slot of this kind can be filled: at least `least` sprites fit
 * (a rim where only one sprite fits would repeat it along the whole rim).
 */
const has = (
  palette: MassifPalette,
  kind: MassifPieceKind,
  cols: number,
  rows: number,
  openBehind: boolean,
  least = 1,
): boolean =>
  massifPieces(palette, kind, cols, rows).filter(
    (p) =>
      (!openBehind || p.paintUp <= OPEN_RISE_MAX) &&
      TABLE_CUT[p.key] === undefined,
  ).length >= least;

/**
 * Low kinds of a 1x1 single on each palette (granite crags never: they are
 * darker than the rest of the set; sandstone crags are little buttes, so
 * sparingly). Since bead xaj.20 a single is a fallback only (a Mountain cell
 * under an object, or a palette run the smoothing could not widen): the
 * generator guarantees every Mountain cell lies in a 2x2 block of them.
 */
const SINGLE_KINDS: Readonly<
  Record<MassifPalette, readonly (readonly [MassifPieceKind, number])[]>
> = {
  granite: [
    ["rounded", 1],
    ["foothill", 1],
  ],
  sandstone: [
    ["crag", 1],
    ["foothill", 3],
  ],
  basalt: [["crag", 1]],
};

/** Cells between two tall 2x3 pieces of a range, for a palette with one. */
const TALL_SPACING = 8;
/** Chance a massif stacked right on another of its columns is dropped. */
const STACK_SKIP = 0.35;
/**
 * Extra share of 2x1 runs that take a low hump instead of a tall ridge, by
 * palette: the sandstone 2x1 ridges are little stepped buttes, and a row of
 * them reads as separate blocks (bead xaj.19 review).
 */
/** Score taken from a 2x1 on the open back rim, by palette (bead xaj.21). */
const BACK_PAIR_COST: Readonly<Record<MassifPalette, number>> = {
  granite: 0,
  sandstone: 1.5,
  basalt: 0,
};
const LOW_PAIR_RATE: Readonly<Record<MassifPalette, number>> = {
  granite: 0,
  sandstone: 0.75,
  basalt: 0,
};
/**
 * Score added to a massif filling the width of a two- or three-cell-wide
 * north-south band (open ground on both sides), by its rows. Since bead
 * xaj.20 every band is at least two cells wide, and it reads best as
 * summits (a 2x2 or 3x2 massif, or the tall 2x3 seen end-on) with low
 * saddles between them; left to ridges it was a stack of little blocks.
 */
const BAND_BONUS: Readonly<Record<2 | 3, number>> = { 2: 0.3, 3: 0.7 };

/**
 * Least score a massif offer needs, by palette, for 2 and 3 columns. The
 * sandstone set's tower buttes are kept apart by FAMILY instead, so since
 * bead xaj.19 sandstone ranges are massed like the others, only a little
 * more sparingly.
 */
const MASSIF_THRESHOLD: Readonly<
  Record<MassifPalette, readonly [number, number]>
> = {
  granite: [0.85, 0.85],
  sandstone: [0.95, 1.0],
  basalt: [0.85, 0.85],
};

/**
 * Score added to a plateau offer by its rows (bead xaj.21): inside a big
 * sandstone range the flat-topped plateaus come first, so its bulk reads as
 * one eroded tableland and the landmarks stand round its edges.
 */
const PLATEAU_BONUS: Readonly<Record<number, number>> = { 2: 0.45, 3: 0.8 };
/**
 * Score of a massif-sized offer by its columns: the wide tablelands of bead
 * xaj.22 (4 and 5 columns) come first where they fit.
 */
const WIDTH_SCORE: Readonly<Record<2 | 3 | 4 | 5, number>> = {
  2: 0.6,
  3: 1,
  4: 1.15,
  5: 1.25,
};
/** Weight of a plateau against a massif (1) on a range's rim (xaj.22). */
const RIM_PLATEAU_WEIGHT = 0.8;

/**
 * What a massif-sized slot (cols x rows) may take: a plateau inside a range
 * where the palette has one (3x3 plateaus only there), a low back-edge
 * bench of that size on an open back rim (sandstone, bead xaj.21), else a
 * massif. Empty when nothing fits.
 */
function slotKinds(
  palette: MassifPalette,
  cols: number,
  rows: number,
  openBehind: boolean,
  interior: boolean,
): readonly (readonly [MassifPieceKind, number])[] {
  const out: [MassifPieceKind, number][] = [];
  // Plateaus fill a range's interior; since bead xaj.22 they also stand on
  // its rim now and then, so a badlands edge is not a row of landmarks.
  if (has(palette, "plateau", cols, rows, openBehind))
    out.push(["plateau", interior ? 3 : RIM_PLATEAU_WEIGHT]);
  if (
    openBehind &&
    rows === 2 &&
    has(palette, "rounded", cols, rows, openBehind)
  )
    out.push(["rounded", 1]);
  if (has(palette, "massif", cols, rows, openBehind)) out.push(["massif", 1]);
  return out;
}

/** Low kinds of a back-fill on each palette. */
const FILL_KINDS: Readonly<Record<MassifPalette, readonly MassifPieceKind[]>> =
  {
    // The pale rounded domes would repeat; joints get rubble.
    granite: ["foothill"],
    sandstone: ["foothill", "crag"],
    basalt: ["crag"],
  };

/**
 * Pieces never used as a back-fill or side boulder: the two blocky granite
 * foothills read as stairs at a cliff's foot (bead xaj.19 review); the
 * rounded granite boulders of bead xaj.19 take their place.
 */
const FILL_EXCLUDED: ReadonlySet<string> = new Set([
  "massif-granite-foothill-1x1-a",
  "massif-granite-foothill-1x1-b",
]);

/**
 * Share of joints that get a back-fill and of open cliff sides that get a
 * side boulder, by palette. Sandstone ranges looked busy with a boulder on
 * every joint and side (bead xaj.19): the wide mesas carry their own
 * rubble, so fewer fills there.
 */
const FILL_RATE: Readonly<Record<MassifPalette, number>> = {
  granite: 0.45,
  sandstone: 0.3,
  basalt: 0.45,
};
/**
 * Share of deep joints (rock behind them too) where a 1x1 peak stands as a
 * summit between the pieces instead of a low back-fill (bead xaj.20).
 */
const PEAK_FILL_RATE: Readonly<Record<MassifPalette, number>> = {
  granite: 0.15,
  sandstone: 0.12,
  basalt: 0.2,
};
const SIDE_RATE: Readonly<Record<MassifPalette, number>> = {
  granite: 0.5,
  sandstone: 0.25,
  basalt: 0.45,
};

/**
 * Low humps of 2 or 3 columns: rounded on the back rim, foothill at the
 * front (an empty list when the palette has neither).
 */
function lowKinds(
  palette: MassifPalette,
  cols: 2 | 3,
  front: boolean,
): readonly (readonly [MassifPieceKind, number])[] {
  const rounded = massifPieces(palette, "rounded", cols, 1).length > 0;
  const foothill = massifPieces(palette, "foothill", cols, 1).length > 0;
  if (!rounded && !foothill) return [];
  if (rounded && foothill)
    return front
      ? [
          ["foothill", 3],
          ["rounded", 1],
        ]
      : [
          ["rounded", 3],
          ["foothill", 1],
        ];
  return rounded ? [["rounded", 1]] : [["foothill", 1]];
}

/** 8-connected groups of the cells `isIn` accepts, each in row-major order. */
export function components(
  width: number,
  height: number,
  isIn: (index: number) => boolean,
): number[][] {
  const seen = new Uint8Array(width * height);
  const out: number[][] = [];
  for (let start = 0; start < width * height; start += 1) {
    if (seen[start] === 1 || !isIn(start)) continue;
    const group: number[] = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const i = stack.pop() as number;
      group.push(i);
      const x = i % width;
      const y = Math.floor(i / width);
      for (let dy = -1; dy <= 1; dy += 1)
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx;
          if (seen[j] === 1 || !isIn(j)) continue;
          seen[j] = 1;
          stack.push(j);
        }
    }
    out.push(group.sort((a, b) => a - b));
  }
  return out;
}

/**
 * The palette of every cell of one range: the palette most of the range's
 * cells within PALETTE_RADIUS stand on (ties go to the cell's own ground),
 * then any palette patch of fewer than MIN_PATCH cells joins the palette round it.
 */
export function rangePalettes(
  cells: readonly number[],
  width: number,
  paletteAt: (index: number) => MassifPalette,
): Map<number, MassifPalette> {
  const inRange = new Set(cells);
  const out = new Map<number, MassifPalette>();
  for (const i of cells) {
    const x = i % width;
    const y = Math.floor(i / width);
    const votes = new Map<MassifPalette, number>();
    for (let dy = -PALETTE_RADIUS; dy <= PALETTE_RADIUS; dy += 1)
      for (let dx = -PALETTE_RADIUS; dx <= PALETTE_RADIUS; dx += 1) {
        const nx = x + dx;
        if (nx < 0 || nx >= width) continue;
        const j = (y + dy) * width + nx;
        if (!inRange.has(j)) continue;
        const p = paletteAt(j);
        votes.set(p, (votes.get(p) ?? 0) + 1);
      }
    const own = paletteAt(i);
    let best = own;
    let bestVotes = votes.get(own) ?? 0;
    for (const p of PALETTES)
      if ((votes.get(p) ?? 0) > bestVotes) {
        best = p;
        bestVotes = votes.get(p) ?? 0;
      }
    out.set(i, best);
  }
  // Small palette patches join their surroundings.
  const patches = splitBy(cells, width, out);
  for (const patch of patches) {
    const island =
      patch.length < ISLAND_PATCH && patch.length * 3 < cells.length;
    if ((patch.length >= MIN_PATCH && !island) || patches.length === 1)
      continue;
    const votes = new Map<MassifPalette, number>();
    const mine = out.get(patch[0] as number);
    for (const i of patch) {
      const x = i % width;
      for (let dy = -1; dy <= 1; dy += 1)
        for (let dx = -1; dx <= 1; dx += 1) {
          if (x + dx < 0 || x + dx >= width) continue;
          const j = i + dy * width + dx;
          const p = out.get(j);
          if (p === undefined || p === mine) continue;
          votes.set(p, (votes.get(p) ?? 0) + 1);
        }
    }
    let best: MassifPalette | undefined;
    let bestVotes = 0;
    for (const p of PALETTES)
      if ((votes.get(p) ?? 0) > bestVotes) {
        best = p;
        bestVotes = votes.get(p) ?? 0;
      }
    if (best !== undefined) for (const i of patch) out.set(i, best);
  }
  return out;
}

/**
 * Every row run of one palette inside a range is at least two cells long
 * (bead xaj.20): a cell whose west and east range neighbours both have
 * another palette takes its west (else east) neighbour's. Rock runs are at
 * least two cells long (every Mountain cell lies in a 2x2 block), so after
 * this every run can be cut into ridges of two and three cells.
 */
export function widenPaletteRuns(
  cells: readonly number[],
  width: number,
  palette: Map<number, MassifPalette>,
): void {
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (const i of cells) {
      const x = i % width;
      const own = palette.get(i);
      const west = x > 0 ? palette.get(i - 1) : undefined;
      const east = x + 1 < width ? palette.get(i + 1) : undefined;
      if (west === own || east === own) continue;
      const pick = west ?? east;
      if (pick === undefined) continue;
      palette.set(i, pick);
      changed = true;
    }
    if (!changed) break;
  }
}

/** 8-connected patches of one palette inside a range. */
function splitBy(
  cells: readonly number[],
  width: number,
  palette: ReadonlyMap<number, MassifPalette>,
): number[][] {
  const left = new Set(cells);
  const out: number[][] = [];
  for (const start of cells) {
    if (!left.has(start)) continue;
    const p = palette.get(start);
    const group: number[] = [];
    const stack = [start];
    left.delete(start);
    while (stack.length > 0) {
      const i = stack.pop() as number;
      group.push(i);
      const x = i % width;
      for (let dy = -1; dy <= 1; dy += 1)
        for (let dx = -1; dx <= 1; dx += 1) {
          if (x + dx < 0 || x + dx >= width) continue;
          const j = i + dy * width + dx;
          if (!left.has(j) || palette.get(j) !== p) continue;
          left.delete(j);
          stack.push(j);
        }
    }
    out.push(group.sort((a, b) => a - b));
  }
  return out;
}

/**
 * The cut of a run of `length` free cells starting at (x0, y) into pieces of
 * 3, 2 and 1 columns: +5.6 for a 3x1 ridge (only with rock behind every
 * cell), +4.6 for a low 3x1 hump where a ridge is not allowed and
 * `lowTriple` says one fits (bead xaj.20), +3.6 for a 2x1 that can be a tall ridge (+3 when only a low hump
 * fits), -3 for a single (a fallback: with every Mountain cell in a 2x2
 * block, runs of one palette are at least two cells long), -0.8 for a seam
 * right under a seam of the row behind, and a small coordinate hash.
 */
export function cutRun(
  x0: number,
  y: number,
  length: number,
  canRidge: (x: number, cols: 2 | 3) => boolean,
  seamAbove: (x: number) => boolean,
  lowTriple: (x: number) => boolean = () => false,
  pairCost: (x: number) => number = () => 0,
): (1 | 2 | 3)[] {
  const best: { score: number; cut: (1 | 2 | 3)[] }[] = [{ score: 0, cut: [] }];
  for (let i = 1; i <= length; i += 1) {
    let top: { score: number; cut: (1 | 2 | 3)[] } | undefined;
    for (const cols of [1, 2, 3] as const) {
      const from = best[i - cols];
      if (from === undefined) continue;
      const x = x0 + i - cols;
      let score = from.score;
      if (cols === 3) {
        if (canRidge(x, 3)) score += 5.6;
        else if (lowTriple(x)) score += 4.6;
        else continue;
      } else if (cols === 2) score += (canRidge(x, 2) ? 3.6 : 3) - pairCost(x);
      else score -= 3;
      if (x > x0 && seamAbove(x)) score -= 0.8;
      score += unit(x, y, cols) * 0.5;
      if (top === undefined || score > top.score)
        top = { score, cut: [...from.cut, cols] };
    }
    best.push(top ?? { score: 0, cut: [] });
  }
  return best[length]?.cut ?? [];
}

/**
 * The cover of every Mountain cell of `map`. `featured` cells (a Mountain
 * under an object) get a low single each and count as open ground behind.
 */
export function packRanges(
  map: GameMap,
  featured: ReadonlySet<number> = new Set(),
): RangeCover {
  const { width, height } = map;
  const mountain = (i: number): boolean =>
    map.cells[i]?.obstacle === "mountain";
  /** Rock that may stand behind a tall piece: a plain Mountain cell. */
  const rock = (x: number, y: number): boolean => {
    if (y < 0) return true; // off the map's top edge: nothing to hide
    if (x < 0 || x >= width || y >= height) return false;
    const i = y * width + x;
    return mountain(i) && !featured.has(i);
  };
  const palette = new Map<number, MassifPalette>();
  const slots: Slot[] = [];
  const slotAt = new Map<number, Slot>();
  const take = (slot: Slot): void => {
    slots.push(slot);
    for (let r = 0; r < slot.rows; r += 1)
      for (let c = 0; c < slot.cols; c += 1)
        slotAt.set((slot.y + r) * width + slot.x + c, slot);
  };
  const openBehind = (x: number, y: number, cols: number): boolean => {
    for (let c = 0; c < cols; c += 1) if (!rock(x + c, y - 1)) return true;
    return false;
  };

  const wides: { x: number; y: number; cols: number }[] = [];
  for (const range of components(width, height, mountain)) {
    const pal = rangePalettes(range, width, (i) =>
      paletteOf(map.cells[i]?.terrain ?? "grass"),
    );
    widenPaletteRuns(range, width, pal);
    for (const [i, p] of pal) palette.set(i, p);
    // Featured cells: a low single each.
    for (const i of range)
      if (featured.has(i)) {
        const p = pal.get(i) ?? "granite";
        take({
          palette: p,
          x: i % width,
          y: Math.floor(i / width),
          cols: 1,
          rows: 1,
          kinds: SINGLE_KINDS[p],
          openBehind: true,
        });
      }
    const free = (x: number, y: number, p: MassifPalette): boolean => {
      if (x < 0 || y < 0 || x >= width || y >= height) return false;
      const i = y * width + x;
      return (
        mountain(i) && !featured.has(i) && pal.get(i) === p && !slotAt.has(i)
      );
    };
    // A SEAM cell touches range rock of another palette. Seam cells take
    // low pieces only, so a range changes palette at a dip (a saddle of low
    // humps and rubble), never at two tall cliffs of different rock.
    const seam = (x: number, y: number): boolean => {
      const own = pal.get(y * width + x);
      for (let dy = -1; dy <= 1; dy += 1)
        for (let dx = -1; dx <= 1; dx += 1) {
          if (x + dx < 0 || x + dx >= width) continue;
          const other = pal.get((y + dy) * width + x + dx);
          if (other !== undefined && other !== own) return true;
        }
      return false;
    };

    // 1. Massifs, best first: 3x2 and 2x2 blocks and, where the art
    // exists, tall 2x3 pieces (a two-cell-wide north-south ridge seen
    // end-on). A massif never leaves a single free cell of its palette
    // beside it in a row: the rows left over are cut into ridges of two
    // and three cells, never singles.
    const offers: {
      x: number;
      y: number;
      cols: 2 | 3 | 4 | 5;
      rows: 2 | 3;
      score: number;
      sides: number;
      kinds: readonly (readonly [MassifPieceKind, number])[];
      inner: boolean;
    }[] = [];
    // Rock of this palette behind every column and beside at least half
    // the rows: inside the range, not on its rim.
    const interior = (
      x: number,
      y: number,
      cols: number,
      rows: number,
      p: MassifPalette,
    ): boolean => {
      const same = (cx: number, cy: number): boolean =>
        rock(cx, cy) && pal.get(cy * width + cx) === p;
      for (let c = 0; c < cols; c += 1) if (!same(x + c, y - 1)) return false;
      let sides = 0;
      for (let r = 0; r < rows; r += 1) {
        if (same(x - 1, y + r)) sides += 1;
        if (same(x + cols, y + r)) sides += 1;
      }
      return sides >= rows;
    };
    const fitsAt = (
      x: number,
      y: number,
      cols: number,
      rows: number,
      p: MassifPalette,
    ): boolean => {
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1)
          if (!free(x + c, y + r, p) || seam(x + c, y + r)) return false;
        // No orphan: a free cell beside the massif has a free neighbour
        // on its far side, so its row run stays two cells or more.
        if (free(x - 1, y + r, p) && !free(x - 2, y + r, p)) return false;
        if (free(x + cols, y + r, p) && !free(x + cols + 1, y + r, p))
          return false;
      }
      return true;
    };
    for (const i of range) {
      const x = i % width;
      const y = Math.floor(i / width);
      const p = pal.get(i) ?? "granite";
      for (const [cols, rows] of [
        [5, 2],
        [4, 2],
        [3, 3],
        [3, 2],
        [2, 2],
        [2, 3],
      ] as const) {
        const open = openBehind(x, y, cols);
        const inner = interior(x, y, cols, rows, p);
        const kinds = slotKinds(p, cols, rows, open, inner);
        if (kinds.length === 0) continue;
        // Inside a range only quiet pieces: skip a slot only landmarks fit.
        if (
          inner &&
          kinds.every(([kind]) =>
            massifPieces(p, kind, cols, rows).every((a) => isLandmark(a.key)),
          )
        )
          continue;
        if (!fitsAt(x, y, cols, rows, p)) continue;
        let sides = 0;
        for (let r = 0; r < rows; r += 1) {
          if (rock(x - 1, y + r)) sides += 1;
          if (rock(x + cols, y + r)) sides += 1;
        }
        let behind = 0;
        for (let c = 0; c < cols; c += 1) if (rock(x + c, y - 1)) behind += 1;
        // A massif filling the whole width of a band of the range (open
        // ground on both sides) is one of the band's summits.
        const band = sides === 0 ? BAND_BONUS[rows] : 0;
        const plateau =
          inner && kinds.some(([k]) => k === "plateau")
            ? (PLATEAU_BONUS[rows] ?? 0)
            : 0;
        const score =
          WIDTH_SCORE[cols] +
          0.5 * (sides / (2 * rows)) +
          0.45 * (behind / cols) +
          0.9 * unit(x, y, 0x30 + cols + rows * 4) +
          band +
          plateau;
        offers.push({ x, y, cols, rows, score, sides, kinds, inner });
      }
    }
    offers.sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);
    const talls: { x: number; y: number; cols: number }[] = [];
    for (const o of offers) {
      const p = pal.get(o.y * width + o.x) ?? "granite";
      if (o.score < (MASSIF_THRESHOLD[p][Math.min(o.cols, 3) - 2] ?? 0))
        continue;
      if (!fitsAt(o.x, o.y, o.cols, o.rows, p)) continue;
      // A massif right on top of another on the same columns (a range two
      // or three cells wide running north-south) stacks into a vertical
      // rhythm of equal blocks: usually leave the row between to ridges,
      // humps and saddles instead. Massifs offset by a column (a band
      // running diagonally, or staggered in a wide range) may touch: their
      // summits step sideways like a real ridge line.
      let stacked = false;
      for (let c = 0; c < o.cols; c += 1)
        for (const y of [o.y - 1, o.y + o.rows]) {
          const s = slotAt.get(y * width + o.x + c);
          if (
            s !== undefined &&
            s.rows >= 2 &&
            s.x === o.x &&
            s.cols === o.cols
          )
            stacked = true;
        }
      // In a narrow band (rock on at most one side) never; in the bulk of
      // a wide range usually not.
      if (stacked && (o.sides < 2 || unit(o.x, o.y, 0x35) < STACK_SKIP))
        continue;
      // The tall 2x3 pieces are few (one or two per palette) and easy to
      // recognise: keep them TALL_SPACING cells apart (divided by the
      // number of sprites) within the range.
      // So are the 3x3 plateaus (bead xaj.21): one or two sprites, each
      // a big landmark of its own when it repeats close by.
      if (o.rows === 3) {
        const kind = o.cols === 2 ? "massif" : "plateau";
        const gap = Math.ceil(
          TALL_SPACING / Math.max(1, massifPieces(p, kind, o.cols, 3).length),
        );
        const near = talls.some(
          (t) =>
            t.cols === o.cols &&
            Math.max(Math.abs(t.x - o.x), Math.abs(t.y - o.y)) < gap + 3,
        );
        if (near) continue;
        talls.push({ x: o.x, y: o.y, cols: o.cols });
      }
      // The wide tablelands (bead xaj.22): no more of one size within
      // LANDMARK_SPRITE_REACH than there are sprites of it, so the variant
      // pick can keep every sprite a screen apart.
      if (o.cols >= 4) {
        const sprites = massifPieces(p, "plateau", o.cols, o.rows).filter(
          (a) => TABLE_CUT[a.key] === undefined,
        ).length;
        const close = wides.filter(
          (t) =>
            t.cols === o.cols &&
            Math.max(
              0,
              t.x - (o.x + o.cols - 1),
              o.x - (t.x + t.cols - 1),
              Math.abs(t.y - o.y) - 1,
            ) <= LANDMARK_SPRITE_REACH,
        ).length;
        if (close >= sprites) continue;
        wides.push({ x: o.x, y: o.y, cols: o.cols });
      }
      take({
        palette: p,
        x: o.x,
        y: o.y,
        cols: o.cols,
        rows: o.rows,
        kinds: o.kinds,
        openBehind: openBehind(o.x, o.y, o.cols),
        interior: o.inner,
      });
    }

    // 2. Runs of each row: ridges and humps (singles only as a fallback).
    const rows = new Map<number, number[]>();
    for (const i of range) {
      const y = Math.floor(i / width);
      rows.set(y, [...(rows.get(y) ?? []), i % width]);
    }
    for (const y of [...rows.keys()].sort((a, b) => a - b)) {
      const xs = rows.get(y) ?? [];
      let k = 0;
      while (k < xs.length) {
        const x0 = xs[k] as number;
        const p = pal.get(y * width + x0) ?? "granite";
        if (!free(x0, y, p)) {
          k += 1;
          continue;
        }
        let length = 1;
        while (
          k + length < xs.length &&
          xs[k + length] === x0 + length &&
          free(x0 + length, y, p)
        )
          length += 1;
        const seamAbove = (x: number): boolean => {
          const a = slotAt.get((y - 1) * width + x - 1);
          const b = slotAt.get((y - 1) * width + x);
          return a !== undefined && b !== undefined && a !== b;
        };
        const canRidge = (x: number, cols: 2 | 3): boolean => {
          for (let c = 0; c < cols; c += 1) if (seam(x + c, y)) return false;
          // On an open rim only the few low ridges fit; with fewer than two
          // of them the rim takes low humps instead of one ridge repeated.
          const open = openBehind(x, y, cols);
          return has(p, "ridge", cols, 1, open, open ? 2 : 1);
        };
        const lowTriple = (): boolean => lowKinds(p, 3, false).length > 0;
        // On the open back rim a 2x1 hump is small behind the mesas in
        // front of it (a row of pebbles, bead xaj.21): runs there are cut
        // into long benches where they can be.
        const pairCost = (x: number): number =>
          openBehind(x, y, 2) ? (BACK_PAIR_COST[p] ?? 0) : 0;
        let x = x0;
        for (const cols of cutRun(
          x0,
          y,
          length,
          canRidge,
          seamAbove,
          lowTriple,
          pairCost,
        )) {
          const open = openBehind(x, y, cols);
          let frontOpen = true;
          for (let c = 0; c < cols; c += 1)
            if (rock(x + c, y + 1)) frontOpen = false;
          let kinds: readonly (readonly [MassifPieceKind, number])[];
          if (cols === 1) kinds = SINGLE_KINDS[p];
          else if (cols === 3)
            kinds = canRidge(x, 3) ? [["ridge", 1]] : lowKinds(p, 3, frontOpen);
          else {
            let allOpen = true;
            for (let c = 0; c < cols; c += 1)
              if (rock(x + c, y - 1)) allOpen = false;
            // Right in front of a tall piece of the same two columns (a
            // range two cells wide running north-south), often a low
            // saddle, so the column reads as peaks and saddles, not a
            // stack of towers; always in a band between two massifs.
            const behind = slotAt.get((y - 1) * width + x);
            const stacked =
              behind !== undefined &&
              behind.x === x &&
              behind.cols === 2 &&
              behind.kinds.some(([k]) => k === "massif" || k === "ridge");
            const ahead = slotAt.get((y + 1) * width + x);
            const saddle =
              stacked &&
              ahead !== undefined &&
              ahead.x === x &&
              ahead.cols === 2 &&
              ahead.rows >= 2;
            const low =
              !canRidge(x, 2) ||
              saddle ||
              (allOpen && unit(x, y, 0x41) < 0.45) ||
              (stacked && unit(x, y, 0x43) < 0.6) ||
              (!allOpen && frontOpen && unit(x, y, 0x42) < 0.3) ||
              unit(x, y, 0x44) < LOW_PAIR_RATE[p];
            kinds = low ? lowKinds(p, 2, frontOpen) : [["ridge", 1]];
          }
          take({ palette: p, x, y, cols, rows: 1, kinds, openBehind: open });
          x += cols;
        }
        k += length;
      }
    }
  }

  // 3. Variants: a hashed pick, never the piece of a near neighbour.
  slots.sort((a, b) => a.y - b.y || a.x - b.x);
  const pieceAt = new Map<number, RangePiece>();
  const pieces: RangePiece[] = [];
  const bySprite = new Map<string, RangePiece[]>();
  const byFamily = new Map<string, RangePiece[]>();
  for (const slot of slots) {
    let front = false;
    for (let c = 0; c < slot.cols; c += 1)
      if (!rock(slot.x + c, slot.y + slot.rows)) front = true;
    let west = false;
    let east = false;
    for (let r = 0; r < slot.rows; r += 1) {
      if (!rock(slot.x - 1, slot.y + r)) west = true;
      if (!rock(slot.x + slot.cols, slot.y + r)) east = true;
    }
    // Tablelands (bead xaj.22): a slot east of a cut tableland piece takes
    // a piece cut on its west side; a plateau slot with a plateau slot of
    // the same rows right east of it often starts or carries on a chain.
    const westPiece = pieceAt.get(slot.y * width + slot.x - 1);
    const westCut =
      westPiece === undefined ? undefined : TABLE_CUT[westPiece.asset.key];
    const joinWest =
      slot.x > 0 &&
      westPiece !== undefined &&
      westPiece.y === slot.y &&
      westPiece.asset.rows === slot.rows &&
      westCut?.east === true;
    const joinFamily = joinWest ? westCut?.family : undefined;
    const next = slotAt.get(slot.y * width + slot.x + slot.cols);
    const plateauSlot = (s: Slot): boolean =>
      s.kinds.some(([k]) => k === "plateau");
    const eastAccepts =
      slot.x + slot.cols < width &&
      next !== undefined &&
      next.x === slot.x + slot.cols &&
      next.y === slot.y &&
      next.rows === slot.rows &&
      next.palette === slot.palette &&
      plateauSlot(next) &&
      (tablePieces(next.palette, next.cols, next.rows, true, false).length >
        0 ||
        tablePieces(next.palette, next.cols, next.rows, true, true).length > 0);
    let joinEast =
      eastAccepts &&
      (joinWest
        ? unit(slot.x, slot.y, 0x61) < CHAIN_RATE
        : plateauSlot(slot) && unit(slot.x, slot.y, 0x62) < JOIN_RATE);
    if (
      joinEast &&
      tablePieces(
        slot.palette,
        slot.cols,
        slot.rows,
        joinWest,
        true,
        joinFamily,
      ).length === 0
    )
      joinEast = false;
    let list = candidates(
      slot,
      { west, east, front },
      { west: joinWest, east: joinEast, family: joinFamily },
    );
    if (list.length === 0) list = candidates(slot, { west, east, front });
    // A chain goes on with another take where it can: two pieces of one
    // take side by side put the whole take back together, a sprite that
    // may stand a few cells away.
    if (joinWest && westPiece !== undefined) {
      const other = list.filter(
        ({ asset }) => asset.source !== westPiece.asset.source,
      );
      if (other.length > 0) list = other;
    }
    if (list.length === 0) continue;
    const near = (reach: number, rowsUp: number): Set<string> => {
      const keys = new Set<string>();
      for (let y = slot.y - rowsUp; y <= slot.y + slot.rows; y += 1)
        for (let x = slot.x - reach; x < slot.x + slot.cols + reach; x += 1) {
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const piece = pieceAt.get(y * width + x);
          if (piece !== undefined) keys.add(piece.asset.key);
        }
      return keys;
    };
    const total = list.reduce((sum, c) => sum + c.w, 0);
    let roll = unit(slot.x, slot.y, 0x77) * total;
    let start = list.length - 1;
    for (let k = 0; k < list.length; k += 1) {
      roll -= (list[k] as { w: number }).w;
      if (roll < 0) {
        start = k;
        break;
      }
    }
    // Distance (Chebyshev, in cells, footprint to footprint) from this
    // slot to the nearest piece already standing anywhere on the map with
    // the same family, or with the same sprite.
    const gap = (p: RangePiece): number =>
      Math.max(
        0,
        p.x - (slot.x + slot.cols - 1),
        slot.x - (p.x + p.asset.cols - 1),
        p.y - (slot.y + slot.rows - 1),
        slot.y - (p.y + p.asset.rows - 1),
      );
    const nearest = (list: readonly RangePiece[] | undefined): number => {
      let d = Infinity;
      for (const p of list ?? []) d = Math.min(d, gap(p));
      return d;
    };
    const clash = (asset: MassifPieceAsset, family = true): boolean => {
      // A chain carries on whatever stands near: it is one tableland.
      if (joinWest) return false;
      if (
        (isLandmark(asset.key) || isBig(asset)) &&
        nearest(bySprite.get(spriteOf(asset))) <= LANDMARK_SPRITE_REACH
      )
        return true;
      const fam = FAMILY[asset.key];
      if (!family || fam === undefined) return false;
      return (
        nearest(byFamily.get(fam)) <= (FAMILY_REACH_OF[fam] ?? FAMILY_REACH)
      );
    };
    // Tiers, strictest first: no repeat of a sprite near by, no landmark
    // sprite within LANDMARK_SPRITE_REACH and no family within its reach;
    // then the landmark sprites and the towers alone keep their spacing (a
    // repeat of a rounder piece reads less as pasted than a second tower);
    // then only touching repeats are avoided.
    const tiers = [
      [slot.rows >= 2 ? near(5, 4) : near(3, 2), "all"],
      [near(3, 2), "all"],
      [near(1, 1), "all"],
      [near(1, 1), "sandstone-tower"],
      [near(1, 1), "none"],
      [new Set<string>(), "none"],
    ] as const;
    const pick = (
      from: readonly { asset: MassifPieceAsset }[],
      ladder: readonly (readonly [Set<string>, string])[],
    ): MassifPieceAsset | undefined => {
      for (const [avoid, keepFamily] of ladder)
        for (let step = 0; step < from.length; step += 1) {
          const c = from[(start + step) % from.length] as {
            asset: MassifPieceAsset;
          };
          const family = FAMILY[c.asset.key];
          const kept =
            keepFamily === "all" ||
            (keepFamily !== "none" && family === keepFamily);
          const spaced = keepFamily === "none" ? false : clash(c.asset, kept);
          if (!avoid.has(c.asset.key) && !spaced) return c.asset;
        }
      return undefined;
    };
    const chosen = pick(list, tiers);
    if (chosen === undefined) continue;
    const piece: RangePiece = { asset: chosen, x: slot.x, y: slot.y };
    pieces.push(piece);
    const sprite = spriteOf(chosen);
    bySprite.set(sprite, [...(bySprite.get(sprite) ?? []), piece]);
    const fam = FAMILY[chosen.key];
    if (fam !== undefined)
      byFamily.set(fam, [...(byFamily.get(fam) ?? []), piece]);
    for (let r = 0; r < slot.rows; r += 1)
      for (let c = 0; c < slot.cols; c += 1)
        pieceAt.set((slot.y + r) * width + slot.x + c, piece);
  }

  // 4. Back-fills on the joints.
  const fills: RangeFill[] = [];
  const plain = (x: number, y: number): boolean => rock(x, y) && y >= 0;
  const fillAsset = (
    p: MassifPalette,
    x: number,
    y: number,
    salt: number,
    flat = false,
  ): MassifPieceAsset | undefined => {
    const all = FILL_KINDS[p]
      .flatMap((kind) => massifPieces(p, kind, 1, 1))
      .filter((a) => !FILL_EXCLUDED.has(a.key));
    const low = all.filter((a) => a.paintUp <= 0);
    const list = flat && low.length > 0 ? low : all;
    return list[hash4(x, y, salt, 0x6b) % Math.max(1, list.length)];
  };
  for (let y = 0; y + 1 < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!plain(x, y) || !plain(x, y + 1)) continue;
      const p = palette.get(i) ?? "granite";
      const same = (j: number): boolean => palette.get(j) === p;
      const below = i + width;
      if (!same(below)) continue;
      // A corner of four cells, east of (x, y).
      if (
        x + 1 < width &&
        plain(x + 1, y) &&
        plain(x + 1, y + 1) &&
        same(i + 1) &&
        same(below + 1)
      ) {
        const quad = new Set([
          pieceAt.get(i),
          pieceAt.get(i + 1),
          pieceAt.get(below),
          pieceAt.get(below + 1),
        ]);
        // Deep inside a range (rock behind the joint too) a joint is now
        // and then a single summit rising between the pieces: the 1x1 peaks
        // are decoration since bead xaj.20, never structure.
        const peaks = massifPieces(p, "peak", 1, 1);
        const deep =
          plain(x, y - 1) &&
          plain(x + 1, y - 1) &&
          same(i - width) &&
          same(i - width + 1);
        if (
          quad.size > 1 &&
          deep &&
          peaks.length > 0 &&
          unit(x, y, 0x57) < PEAK_FILL_RATE[p]
        ) {
          const peak = peaks[hash4(x, y, 5, 0x6b) % peaks.length];
          if (peak !== undefined)
            fills.push({
              asset: peak,
              dx:
                (x + 1) * CELL -
                CELL / 2 +
                Math.round(unit(x, y, 0x58) * 16 - 8),
              dy: (y + 1) * CELL + 18 - peak.h + peak.footGap,
              row: y + 1,
              col: x,
            });
          continue;
        }
        const asset = fillAsset(p, x, y, 1);
        if (
          quad.size > 1 &&
          asset !== undefined &&
          unit(x, y, 0x54) < FILL_RATE[p]
        )
          fills.push({
            asset,
            dx:
              (x + 1) * CELL - CELL / 2 + Math.round(unit(x, y, 0x51) * 12 - 6),
            dy: (y + 1) * CELL + CELL / 2 - asset.h + 6,
            row: y + 1,
            col: x,
          });
      }
      // A one-cell-wide column: a fill on the joint of its two cells.
      const westPair = plain(x - 1, y) && plain(x - 1, y + 1);
      const eastPair = plain(x + 1, y) && plain(x + 1, y + 1);
      if (westPair || eastPair) continue;
      if (pieceAt.get(i) === pieceAt.get(below)) continue;
      if (unit(x, y, 0x56) >= FILL_RATE[p]) continue;
      const asset = fillAsset(p, x, y, 2, true);
      if (asset === undefined) continue;
      fills.push({
        asset,
        dx: x * CELL + Math.round(unit(x, y, 0x52) * 8 - 4),
        dy: (y + 1) * CELL + 10 - asset.h + asset.footGap,
        row: y + 1,
        col: x,
      });
    }

  // 5. Boulders at the foot of a tall piece's open side: a low piece
  // straddling the side, SIDE_REACH px into the open cell, drawn in front.
  for (const piece of pieces) {
    const a = piece.asset;
    if (a.kind !== "massif" && a.kind !== "ridge") continue;
    const yb = piece.y + a.rows - 1;
    const p = a.palette;
    for (const west of [true, false]) {
      const nx = west ? piece.x - 1 : piece.x + a.cols;
      if (rock(nx, yb) || nx < 0 || nx >= width) continue;
      if (unit(nx, yb, 0x55) >= SIDE_RATE[p]) continue;
      const asset = fillAsset(p, nx, yb, west ? 3 : 4, true);
      if (asset === undefined) continue;
      const edge = (west ? piece.x : piece.x + a.cols) * CELL;
      const jitter = Math.round(unit(nx, yb, 0x53) * 8 - 4);
      fills.push({
        asset,
        dx: west
          ? edge - SIDE_REACH + jitter
          : edge + SIDE_REACH - asset.w + jitter,
        dy: (yb + 1) * CELL - asset.h + asset.footGap - 3,
        row: yb,
        col: piece.x + a.cols - 1,
        front: true,
      });
    }
  }

  return { pieces, fills, palette, pieceAt };
}

/** How far a side boulder reaches into the open cell beside a piece, px. */
export const SIDE_REACH = 22;

/** Whether the cell behind column `c` of a piece is rock (for its band). */
export function rockBehind(
  map: GameMap,
  featured: ReadonlySet<number>,
  x: number,
  y: number,
): boolean {
  if (y < 0) return true;
  if (x < 0 || x >= map.width || y >= map.height) return false;
  const i = y * map.width + x;
  return map.cells[i]?.obstacle === "mountain" && !featured.has(i);
}
