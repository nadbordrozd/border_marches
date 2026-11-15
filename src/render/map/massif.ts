/**
 * Mountain ranges as packed massifs (beads border_marches-xaj.15 and xaj.19),
 * drawn with the studio massif pieces of beads xaj.14 and xaj.19
 * (docs/art/MASSIF_ART.md).
 *
 * The goal, in the user's words: "all the mountain ranges look unique.
 * they're not but there is enough variety and they are cleverly connected so
 * that no matter the shape of the mountain range it looks like a coherent
 * whole and not like the same rock sprite pasted 20 times."
 *
 * A RANGE is an 8-connected group of Mountain cells. Each cell gets a rock
 * PALETTE (granite, sandstone, basalt) from the grounds of the range cells
 * round it (MASSIF_PALETTE_TERRAINS): a small range takes its majority
 * ground, a long border range changes palette where its ground changes;
 * patches under MIN_PATCH cells join their surroundings. No piece spans two
 * palettes, and every cell next to another palette (a SEAM) takes low
 * pieces only, so the rock changes at a saddle, not between two cliffs.
 *
 * The range is then covered exactly, cell by cell, with pieces:
 *
 * 1. MASSIFS (3x2 and 2x2) where the range is two rows deep, picked greedily
 *    by a score that likes big pieces, rock on their vertical sides (a
 *    massif's sides are cliffs of rock that want rock against them), rock
 *    behind them and a coordinate hash, so solid blocks are tiled
 *    irregularly, never on a lattice. A massif filling the whole width of a
 *    band (open ground both sides) scores lower, and massifs sharing a
 *    column are not stacked edge to edge in a narrow band (bead xaj.19:
 *    north-south bands read as a vertical rhythm of equal blocks).
 * 2. SPINES: a one-cell-wide north-south run is cut into 1x2 spines (rock
 *    behind only, they rise 48 px), usually with a single between two.
 * 3. Every remaining run of cells in a row is cut (dynamic programming)
 *    into RIDGES (3x1, 2x1) and singles, liking long pieces and disliking
 *    a seam right under a seam of the row behind (so rows lie like bricks).
 *    A 2x1 on the range's back rim, or in front of rock, is sometimes a low
 *    ROUNDED or FOOTHILL hump; a single is a low 1x1 (rounded, foothill or,
 *    sparingly, a crag) or a PEAK, mostly where rock stands behind it.
 * 4. VARIANTS: a weighted hashed pick that avoids the sprites near by and
 *    keeps pieces of one silhouette FAMILY (the sandstone tower buttes, the
 *    fluted hills, the domes, the tables) apart; pieces whose art has a
 *    straight cut side (EDGE_NEEDS) go only where rock meets that side.
 * 5. BACK-FILLS: where four range cells meet at a corner that is a joint
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
export const MIN_PATCH = 6;

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
  readonly cols: 1 | 2 | 3;
  readonly rows: 1 | 2;
  /** Kinds it may take, with weights. */
  readonly kinds: readonly (readonly [MassifPieceKind, number])[];
  /** Paint over an open cell behind is limited (OPEN_RISE_MAX). */
  readonly openBehind: boolean;
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
  "massif-sandstone-massif-2x2-b": 0.35,
  "massif-sandstone-massif-3x2-a": 0.35,
  "massif-sandstone-massif-3x2-b": 0.35,
  // The fluted badlands hills catch the eye: a little rarer than the rest.
  "massif-sandstone-massif-2x2-c": 0.6,
  "massif-sandstone-massif-3x2-e": 0.6,
  "massif-sandstone-massif-3x2-d": 0.7,
  // The blocky granite foothills read as stairs (bead xaj.19 review): the
  // rounded boulders of xaj.19 take most of their place as singles too.
  "massif-granite-foothill-1x1-a": 0.25,
  "massif-granite-foothill-1x1-b": 0.25,
  // The one basalt massif whose foot is a scree skirt, not a box of
  // columns (xaj.19): favoured over the boxier three.
  "massif-basalt-massif-2x2-c": 1.6,
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
};

/** Cells round a piece in which its family must not repeat. */
const FAMILY_REACH = 3;
/** Wider spacing for the tower buttes, the most recognisable silhouette. */
const FAMILY_REACH_OF: Readonly<Record<string, number>> = {
  "sandstone-tower": 5,
  "sandstone-table": 4,
};

/** The pieces a slot may take, by its kinds and the rise rule. */
function candidates(
  slot: Slot,
  open?: { west: boolean; east: boolean; front: boolean },
): { asset: MassifPieceAsset; w: number }[] {
  const out: { asset: MassifPieceAsset; w: number }[] = [];
  for (const [kind, weight] of slot.kinds) {
    const list = massifPieces(slot.palette, kind, slot.cols, slot.rows).filter(
      (p) => !slot.openBehind || p.paintUp <= OPEN_RISE_MAX,
    );
    for (const asset of list)
      out.push({
        asset,
        w: ((ASSET_WEIGHT[asset.key] ?? 1) * weight) / list.length,
      });
  }
  if (open === undefined) return out;
  const fit = out.filter(({ asset }) => {
    const needs = EDGE_NEEDS[asset.key];
    return needs === undefined || !needs.some((side) => open[side]);
  });
  return fit.length > 0 ? fit : out;
}

const has = (
  palette: MassifPalette,
  kind: MassifPieceKind,
  cols: number,
  rows: number,
  openBehind: boolean,
): boolean =>
  massifPieces(palette, kind, cols, rows).some(
    (p) => !openBehind || p.paintUp <= OPEN_RISE_MAX,
  );

/**
 * Low kinds of a 1x1 single on each palette (granite crags never: they are
 * darker than the rest of the set; sandstone crags are little buttes, so
 * sparingly). A single with rock behind it may also be a PEAK (singlePeak).
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

/** Chance a massif stacked right on another of its columns is dropped. */
const STACK_SKIP = 0.6;
/** Score taken off a massif with open ground on both of its sides. */
const BAND_PENALTY = 0.55;
/** Chance of a single between two spines of a one-cell-wide column. */
const SPINE_GAP = 0.65;

/** Weight of a peak among a single's kinds when rock stands behind it. */
const PEAK_WEIGHT = 1.5;

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
  sandstone: [1.15, 1.2],
  basalt: [0.85, 0.85],
};

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
  granite: 0.9,
  sandstone: 0.3,
  basalt: 0.45,
};
const SIDE_RATE: Readonly<Record<MassifPalette, number>> = {
  granite: 0.8,
  sandstone: 0.25,
  basalt: 0.45,
};

/** Low 2x1 humps: rounded on the back rim, foothill at the front. */
function lowPairKinds(
  palette: MassifPalette,
  front: boolean,
): readonly (readonly [MassifPieceKind, number])[] {
  const rounded = massifPieces(palette, "rounded", 2, 1).length > 0;
  const foothill = massifPieces(palette, "foothill", 2, 1).length > 0;
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
 * then any palette patch of fewer than 4 cells joins the palette round it.
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
    if (patch.length >= MIN_PATCH || patches.length === 1) continue;
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
 * cell), +3.6 for a 2x1 that can be a tall ridge (+3 when only a low hump
 * fits), +1 for a single, -0.8 for a seam right under a seam of the row
 * behind, and a small coordinate hash.
 */
export function cutRun(
  x0: number,
  y: number,
  length: number,
  canRidge: (x: number, cols: 2 | 3) => boolean,
  seamAbove: (x: number) => boolean,
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
        if (!canRidge(x, 3)) continue;
        score += 5.6;
      } else if (cols === 2) score += canRidge(x, 2) ? 3.6 : 3;
      else score += 1;
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

  for (const range of components(width, height, mountain)) {
    const pal = rangePalettes(range, width, (i) =>
      paletteOf(map.cells[i]?.terrain ?? "grass"),
    );
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

    // 1. Massifs, best first.
    const offers: {
      x: number;
      y: number;
      cols: 2 | 3;
      score: number;
      sides: number;
    }[] = [];
    for (const i of range) {
      const x = i % width;
      const y = Math.floor(i / width);
      const p = pal.get(i) ?? "granite";
      for (const cols of [3, 2] as const) {
        if (massifPieces(p, "massif", cols, 2).length === 0) continue;
        let fits = true;
        for (let r = 0; r < 2 && fits; r += 1)
          for (let c = 0; c < cols && fits; c += 1)
            if (!free(x + c, y + r, p) || seam(x + c, y + r)) fits = false;
        if (!fits) continue;
        let sides = 0;
        for (let r = 0; r < 2; r += 1) {
          if (rock(x - 1, y + r)) sides += 1;
          if (rock(x + cols, y + r)) sides += 1;
        }
        let behind = 0;
        for (let c = 0; c < cols; c += 1) if (rock(x + c, y - 1)) behind += 1;
        // A massif filling the whole width of a band of the range (open
        // ground on both sides) is a block in a north-south column; such
        // bands read better as ridges, humps and spines.
        const band = sides === 0 ? BAND_PENALTY : 0;
        const score =
          (cols === 3 ? 1 : 0.6) +
          0.5 * (sides / 4) +
          0.45 * (behind / cols) +
          0.9 * unit(x, y, 0x30 + cols) -
          band;
        offers.push({ x, y, cols, score, sides });
      }
    }
    offers.sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);
    for (const o of offers) {
      const p = pal.get(o.y * width + o.x) ?? "granite";
      if (o.score < (MASSIF_THRESHOLD[p][o.cols - 2] ?? 0)) continue;
      let fits = true;
      for (let r = 0; r < 2 && fits; r += 1)
        for (let c = 0; c < o.cols && fits; c += 1)
          if (!free(o.x + c, o.y + r, p)) fits = false;
      if (!fits) continue;
      // A massif right on top of another sharing a column (a range two
      // or three cells wide running north-south) stacks into a vertical
      // rhythm of equal blocks: usually leave the row between to ridges,
      // humps and saddles instead.
      let stacked = false;
      for (let c = 0; c < o.cols; c += 1)
        for (const y of [o.y - 1, o.y + 2]) {
          const s = slotAt.get(y * width + o.x + c);
          if (s !== undefined && s.rows === 2 && s.cols > 1) stacked = true;
        }
      // In a narrow band (rock on at most one side) never; in the bulk of
      // a wide range usually not.
      if (stacked && (o.sides < 2 || unit(o.x, o.y, 0x35) < STACK_SKIP))
        continue;
      take({
        palette: p,
        x: o.x,
        y: o.y,
        cols: o.cols,
        rows: 2,
        kinds: [["massif", 1]],
        openBehind: openBehind(o.x, o.y, o.cols),
      });
    }

    // A single is sometimes a peak: often with rock behind it (inside the
    // range, or at the front end of a spur), now and then on the rim; at
    // a seam always low.
    const singleKinds = (
      p: MassifPalette,
      x: number,
      y: number,
    ): readonly (readonly [MassifPieceKind, number])[] => {
      if (seam(x, y) || !has(p, "peak", 1, 1, !rock(x, y - 1)))
        return SINGLE_KINDS[p];
      const weight = rock(x, y - 1) ? PEAK_WEIGHT : PEAK_WEIGHT / 3;
      return [...SINGLE_KINDS[p], ["peak", weight]];
    };

    // 2. Spines: a one-cell-wide north-south run (no free rock of its
    // palette west or east of it) is cut into 1x2 spines from the bottom
    // up, so its foot is a spine and an odd cell is left at its back end
    // (a single, often a peak). A spine raises up to 48 px, so the back
    // end of a column with open ground behind keeps a low single there.
    const narrow = (x: number, y: number, p: MassifPalette): boolean =>
      free(x, y, p) && !seam(x, y) && !free(x - 1, y, p) && !free(x + 1, y, p);
    for (const i of [...range].reverse()) {
      const x = i % width;
      const yb = Math.floor(i / width);
      const p = pal.get(i) ?? "granite";
      if (!narrow(x, yb, p) || !narrow(x, yb - 1, p)) continue;
      // Only from the foot of a run: the cell below is not narrow rock.
      if (narrow(x, yb + 1, p)) continue;
      let y = yb;
      while (narrow(x, y, p) && narrow(x, y - 1, p)) {
        const open = openBehind(x, y - 1, 1);
        if (!has(p, "spine", 1, 2, open)) break;
        take({
          palette: p,
          x,
          y: y - 1,
          cols: 1,
          rows: 2,
          kinds: [["spine", 1]],
          openBehind: open,
        });
        // Usually a single (often a peak) between two spines, so a long
        // column reads as summits and saddles, not one sprite repeated.
        // Always when the palette has one spine only: two of one sprite
        // in a row would read as pasted.
        const one = massifPieces(p, "spine", 1, 2).length < 2;
        y -= one || unit(x, y, 0x36) < SPINE_GAP ? 3 : 2;
      }
    }

    // 3. Runs of each row: ridges, humps and singles.
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
          return has(p, "ridge", cols, 1, openBehind(x, y, cols));
        };
        let x = x0;
        for (const cols of cutRun(x0, y, length, canRidge, seamAbove)) {
          const open = openBehind(x, y, cols);
          let kinds: readonly (readonly [MassifPieceKind, number])[];
          if (cols === 1) kinds = singleKinds(p, x, y);
          else if (cols === 3) kinds = [["ridge", 1]];
          else {
            let allOpen = true;
            let frontOpen = true;
            for (let c = 0; c < cols; c += 1) {
              if (rock(x + c, y - 1)) allOpen = false;
              if (rock(x + c, y + 1)) frontOpen = false;
            }
            // Right in front of a tall piece of the same two columns (a
            // range two cells wide running north-south), often a low
            // saddle, so the column reads as peaks and saddles, not a
            // stack of towers.
            const behind = slotAt.get((y - 1) * width + x);
            const stacked =
              behind !== undefined &&
              behind.x === x &&
              behind.cols === 2 &&
              behind.kinds.some(([k]) => k === "massif" || k === "ridge");
            const low =
              !canRidge(x, 2) ||
              (allOpen && unit(x, y, 0x41) < 0.45) ||
              (stacked && unit(x, y, 0x43) < 0.6) ||
              (!allOpen && frontOpen && unit(x, y, 0x42) < 0.3);
            kinds = low ? lowPairKinds(p, frontOpen) : [["ridge", 1]];
          }
          take({ palette: p, x, y, cols, rows: 1, kinds, openBehind: open });
          x += cols;
        }
        k += length;
      }
    }
  }

  // 4. Variants: a hashed pick, never the piece of a near neighbour.
  slots.sort((a, b) => a.y - b.y || a.x - b.x);
  const pieceAt = new Map<number, RangePiece>();
  const pieces: RangePiece[] = [];
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
    const list = candidates(slot, { west, east, front });
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
    // The nearest piece of each family already standing (Chebyshev
    // distance in cells from this slot's footprint).
    const families = new Map<string, number>();
    const reachAll = Math.max(FAMILY_REACH, ...Object.values(FAMILY_REACH_OF));
    for (let y = slot.y - reachAll; y <= slot.y + slot.rows; y += 1)
      for (
        let x = slot.x - reachAll;
        x < slot.x + slot.cols + reachAll;
        x += 1
      ) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const key = pieceAt.get(y * width + x)?.asset.key;
        const family = key === undefined ? undefined : FAMILY[key];
        if (family === undefined) continue;
        const d = Math.max(
          slot.y - y,
          y - (slot.y + slot.rows - 1),
          slot.x - x,
          x - (slot.x + slot.cols - 1),
        );
        families.set(family, Math.min(families.get(family) ?? d, d));
      }
    const clash = (asset: MassifPieceAsset): boolean => {
      const family = FAMILY[asset.key];
      if (family === undefined) return false;
      const d = families.get(family);
      return d !== undefined && d <= (FAMILY_REACH_OF[family] ?? FAMILY_REACH);
    };
    let chosen: MassifPieceAsset | undefined;
    // Tiers, strictest first: no repeat of a sprite near by and no family
    // within its reach; then the towers alone keep their spacing (a repeat
    // of a rounder piece reads less as pasted than a second tower); then
    // only touching repeats are avoided.
    for (const [avoid, keepFamily] of [
      [slot.rows === 2 ? near(5, 4) : near(3, 2), "all"],
      [near(3, 2), "all"],
      [near(1, 1), "all"],
      [near(1, 1), "sandstone-tower"],
      [near(1, 1), "none"],
      [new Set<string>(), "none"],
    ] as const) {
      for (
        let step = 0;
        step < list.length && chosen === undefined;
        step += 1
      ) {
        const c = list[(start + step) % list.length] as {
          asset: MassifPieceAsset;
        };
        const family = FAMILY[c.asset.key];
        const kept =
          keepFamily === "all" ||
          (keepFamily !== "none" && family === keepFamily);
        if (!avoid.has(c.asset.key) && !(kept && clash(c.asset)))
          chosen = c.asset;
      }
      if (chosen !== undefined) break;
    }
    if (chosen === undefined) continue;
    const piece: RangePiece = { asset: chosen, x: slot.x, y: slot.y };
    pieces.push(piece);
    for (let r = 0; r < slot.rows; r += 1)
      for (let c = 0; c < slot.cols; c += 1)
        pieceAt.set((slot.y + r) * width + slot.x + c, piece);
  }

  // 5. Back-fills on the joints.
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

  // 6. Boulders at the foot of a tall piece's open side: a low piece
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
