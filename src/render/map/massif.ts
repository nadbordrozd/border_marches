/**
 * Mountain ranges as packed massifs (bead border_marches-xaj.15), drawn with
 * the studio massif pieces of bead xaj.14 (docs/art/MASSIF_ART.md).
 *
 * The goal, in the user's words: "all the mountain ranges look unique.
 * they're not but there is enough variety and they are cleverly connected so
 * that no matter the shape of the mountain range it looks like a coherent
 * whole and not like the same rock sprite pasted 20 times."
 *
 * A RANGE is an 8-connected group of Mountain cells. Each cell gets a rock
 * PALETTE (granite, sandstone, basalt) from the grounds of the range cells
 * round it (MASSIF_PALETTE_TERRAINS): a small range takes its majority
 * ground, a long border range changes palette where its ground changes.
 * No piece spans two palettes.
 *
 * The range is then covered exactly, cell by cell, with pieces:
 *
 * 1. MASSIFS (3x2 and 2x2) where the range is two rows deep, picked greedily
 *    by a score that likes big pieces, rock on their vertical sides (a
 *    massif's sides are cliffs of rock that want rock against them) and a
 *    coordinate hash, so solid blocks are tiled irregularly, never on a
 *    lattice.
 * 2. Every remaining run of cells in a row is cut (dynamic programming)
 *    into RIDGES (3x1, 2x1) and singles, liking long pieces and disliking
 *    a seam right under a seam of the row behind (so rows lie like bricks).
 *    A 2x1 on the range's back rim, or in front of rock, is sometimes a low
 *    ROUNDED or FOOTHILL hump; a single is a low 1x1 (rounded, foothill or,
 *    sparingly, a crag).
 * 3. BACK-FILLS: where four range cells meet at a corner that is a joint
 *    between pieces (or two cells of a one-cell-wide column meet), a low
 *    1x1 piece stands on the joint half a cell off the grid, drawn behind
 *    the row in front: it fills the ground that would show in the notches
 *    between pieces, so the range reads as one mass, and breaks the cell
 *    lattice.
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
 * came up as often as the rest: the tall sandstone butte ridge, the tallest
 * silhouette of its set, is an accent among the low wide mesas.
 */
const ASSET_WEIGHT: Readonly<Record<string, number>> = {
  "massif-sandstone-ridge-2x1-a": 0.35,
};

/** The pieces a slot may take, by its kinds and the rise rule. */
function candidates(slot: Slot): { asset: MassifPieceAsset; w: number }[] {
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
  return out;
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

/** Low kinds of a 1x1 single on each palette (granite crags sparingly). */
const SINGLE_KINDS: Readonly<
  Record<MassifPalette, readonly (readonly [MassifPieceKind, number])[]>
> = {
  // Granite crags are darker than the rest of the set (MASSIF_ART.md): none.
  granite: [
    ["rounded", 1],
    ["foothill", 1],
  ],
  sandstone: [
    ["crag", 1],
    ["foothill", 1],
  ],
  basalt: [["crag", 1]],
};

/**
 * Least score a massif offer needs, by palette, for 2 and 3 columns. The
 * sandstone massifs are four tall buttes of much the same silhouette: as
 * accents among the low wide mesa ridges they read as landmarks, as the
 * bulk of a range as one tower pasted over and over.
 */
const MASSIF_THRESHOLD: Readonly<
  Record<MassifPalette, readonly [number, number]>
> = {
  granite: [0.85, 0.85],
  sandstone: [1.65, 2.05],
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
    if (patch.length >= 4 || patches.length === 1) continue;
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

    // 1. Massifs, best first.
    const offers: { x: number; y: number; cols: 2 | 3; score: number }[] = [];
    for (const i of range) {
      const x = i % width;
      const y = Math.floor(i / width);
      const p = pal.get(i) ?? "granite";
      for (const cols of [3, 2] as const) {
        if (massifPieces(p, "massif", cols, 2).length === 0) continue;
        let fits = true;
        for (let r = 0; r < 2 && fits; r += 1)
          for (let c = 0; c < cols && fits; c += 1)
            if (!free(x + c, y + r, p)) fits = false;
        if (!fits) continue;
        let sides = 0;
        for (let r = 0; r < 2; r += 1) {
          if (rock(x - 1, y + r)) sides += 1;
          if (rock(x + cols, y + r)) sides += 1;
        }
        let behind = 0;
        for (let c = 0; c < cols; c += 1) if (rock(x + c, y - 1)) behind += 1;
        const score =
          (cols === 3 ? 1 : 0.6) +
          0.5 * (sides / 4) +
          0.2 * (behind / cols) +
          0.9 * unit(x, y, 0x30 + cols);
        offers.push({ x, y, cols, score });
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
      // Sandstone massifs are tall buttes: side by side or one in front of
      // another they read as one tower pasted, so each keeps a ring of
      // lower rock (ridges, humps) round it.
      if (p === "sandstone") {
        let near = false;
        for (let r = -1; r <= 2 && !near; r += 1)
          for (let c = -1; c <= o.cols && !near; c += 1) {
            const x = o.x + c;
            if (x < 0 || x >= width) continue;
            if (slotAt.get((o.y + r) * width + x)?.rows === 2) near = true;
          }
        if (near) continue;
      }
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

    // 2. Runs of each row: ridges, humps and singles.
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
        const canRidge = (x: number, cols: 2 | 3): boolean =>
          has(p, "ridge", cols, 1, openBehind(x, y, cols));
        let x = x0;
        for (const cols of cutRun(x0, y, length, canRidge, seamAbove)) {
          const open = openBehind(x, y, cols);
          let kinds: readonly (readonly [MassifPieceKind, number])[];
          if (cols === 1) kinds = SINGLE_KINDS[p];
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

  // Variants: a hashed pick, never the piece of a near neighbour.
  slots.sort((a, b) => a.y - b.y || a.x - b.x);
  const pieceAt = new Map<number, RangePiece>();
  const pieces: RangePiece[] = [];
  for (const slot of slots) {
    const list = candidates(slot);
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
    let chosen: MassifPieceAsset | undefined;
    for (const avoid of [near(3, 2), near(1, 1), new Set<string>()]) {
      for (
        let step = 0;
        step < list.length && chosen === undefined;
        step += 1
      ) {
        const c = list[(start + step) % list.length] as {
          asset: MassifPieceAsset;
        };
        if (!avoid.has(c.asset.key)) chosen = c.asset;
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

  // 3. Back-fills on the joints.
  const fills: RangeFill[] = [];
  const plain = (x: number, y: number): boolean => rock(x, y) && y >= 0;
  const fillAsset = (
    p: MassifPalette,
    x: number,
    y: number,
    salt: number,
    flat = false,
  ): MassifPieceAsset | undefined => {
    const all = FILL_KINDS[p].flatMap((kind) => massifPieces(p, kind, 1, 1));
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
        if (quad.size > 1 && asset !== undefined)
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

  // 4. Boulders at the foot of a tall piece's open side: a low piece
  // straddling the side, SIDE_REACH px into the open cell, drawn in front.
  for (const piece of pieces) {
    const a = piece.asset;
    if (a.kind !== "massif" && a.kind !== "ridge") continue;
    const yb = piece.y + a.rows - 1;
    const p = a.palette;
    for (const west of [true, false]) {
      const nx = west ? piece.x - 1 : piece.x + a.cols;
      if (rock(nx, yb) || nx < 0 || nx >= width) continue;
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
