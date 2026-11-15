/**
 * Composed forests: block-anchored exact-cover packing. Ported from Pulp
 * Wars src/render/canvas/chibi-forest-packing-v7.ts and the cell roles of
 * src/render/canvas/chibi-forest-v7.ts (`chibiForestCellsV7`); see
 * LESSONS_MAP_AND_FACTION_SPRITES.md section 3.7.
 *
 * The map is cut into fixed 2 x 2 blocks aligned at even coordinates. A
 * block's packable Forest cells form a 4-bit mask; its pieces are one exact
 * cover of that mask by 1x1, 2x1, 1x2, 2x2 and L pieces, chosen by a hash of
 * the block and the mask, weighted toward larger pieces. Every piece lies
 * inside its block, so a change to one cell re-picks at most its block.
 *
 * Border Marches: packing also stops where the ground terrain changes (Pulp
 * Wars stopped at territory borders), because each terrain has its own tree
 * set, so a wood changes trees exactly on the terrain edge.
 */
import { FOREST_SHAPES } from "../../assets/manifest";
import type { ForestShape } from "../../assets/manifest";
import type { GameMap, Terrain } from "../../core/map/types";
import { hash4 } from "./hash";

export const FOREST_SHAPE_IDS = Object.keys(FOREST_SHAPES) as ForestShape[];

export interface ForestPlacement {
  readonly shape: ForestShape;
  /** Top-left cell of the shape's bounding box. */
  readonly x: number;
  readonly y: number;
  readonly variant: number;
}

/** Piece variants available per shape; a shape with 0 is never placed. */
export type ForestVariantCounts = Readonly<Record<ForestShape, number>>;

/** Relative preference of each shape; a tiling's weight is their product. */
const SHAPE_WEIGHTS: Readonly<Record<ForestShape, number>> = {
  "1x1": 1,
  "2x1": 2.4,
  "1x2": 2.4,
  "2x2": 9,
  "L-NW": 3,
  "L-NE": 3,
  "L-SW": 3,
  "L-SE": 3,
};

// Block bits: NW 1, NE 2, SW 4, SE 8.
interface BlockPlacement {
  readonly shape: ForestShape;
  readonly mask: number;
  readonly dx: number;
  readonly dy: number;
}

const BLOCK_PLACEMENTS: readonly BlockPlacement[] = [
  { shape: "2x2", mask: 15, dx: 0, dy: 0 },
  { shape: "L-NW", mask: 14, dx: 0, dy: 0 },
  { shape: "L-NE", mask: 13, dx: 0, dy: 0 },
  { shape: "L-SW", mask: 11, dx: 0, dy: 0 },
  { shape: "L-SE", mask: 7, dx: 0, dy: 0 },
  { shape: "2x1", mask: 3, dx: 0, dy: 0 },
  { shape: "2x1", mask: 12, dx: 0, dy: 1 },
  { shape: "1x2", mask: 5, dx: 0, dy: 0 },
  { shape: "1x2", mask: 10, dx: 1, dy: 0 },
  { shape: "1x1", mask: 1, dx: 0, dy: 0 },
  { shape: "1x1", mask: 2, dx: 1, dy: 0 },
  { shape: "1x1", mask: 4, dx: 0, dy: 1 },
  { shape: "1x1", mask: 8, dx: 1, dy: 1 },
];

/** Every exact cover of `mask` by the available shapes. */
function tilings(
  mask: number,
  available: (shape: ForestShape) => boolean,
): BlockPlacement[][] {
  if (mask === 0) return [[]];
  const lowest = mask & -mask;
  const result: BlockPlacement[][] = [];
  for (const placement of BLOCK_PLACEMENTS) {
    if (!available(placement.shape)) continue;
    if ((placement.mask & lowest) === 0) continue;
    if ((placement.mask & ~mask) !== 0) continue;
    for (const rest of tilings(mask & ~placement.mask, available))
      result.push([placement, ...rest]);
  }
  return result;
}

/**
 * The pieces of block (bx, by): a pure function of the block, of which of
 * its four cells are packable, of which may share a piece, and of the
 * variant counts. `joinable(a, b)` says whether two cells of the block may
 * lie in one piece (same tree set); omitted, any two may.
 */
export function packForestBlock(
  packable: (x: number, y: number) => boolean,
  bx: number,
  by: number,
  variants: ForestVariantCounts,
  joinable: (ax: number, ay: number, bx: number, by: number) => boolean = () =>
    true,
): ForestPlacement[] {
  const cellOf = (bit: number): [number, number] => [
    2 * bx + (bit === 2 || bit === 8 ? 1 : 0),
    2 * by + (bit === 4 || bit === 8 ? 1 : 0),
  ];
  const mask =
    (packable(2 * bx, 2 * by) ? 1 : 0) |
    (packable(2 * bx + 1, 2 * by) ? 2 : 0) |
    (packable(2 * bx, 2 * by + 1) ? 4 : 0) |
    (packable(2 * bx + 1, 2 * by + 1) ? 8 : 0);
  if (mask === 0) return [];
  /** A placement whose cells may all be one piece. */
  const united = (placement: BlockPlacement): boolean => {
    const bits = [1, 2, 4, 8].filter((bit) => (placement.mask & bit) !== 0);
    const [first, ...rest] = bits.map(cellOf);
    if (first === undefined) return true;
    return rest.every(([x, y]) => joinable(first[0], first[1], x, y));
  };
  const options = tilings(mask, (shape) => variants[shape] > 0).filter(
    (option) => option.every(united),
  );
  const weights = options.map((option) =>
    option.reduce((product, p) => product * SHAPE_WEIGHTS[p.shape], 1),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = (hash4(bx, by, mask, 0x51) / 0x1_0000_0000) * total;
  let chosen = options[options.length - 1] ?? [];
  for (const [index, option] of options.entries()) {
    roll -= weights[index] ?? 0;
    if (roll < 0) {
      chosen = option;
      break;
    }
  }
  return chosen.map((p) => ({
    shape: p.shape,
    x: 2 * bx + p.dx,
    y: 2 * by + p.dy,
    variant:
      hash4(2 * bx + p.dx, 2 * by + p.dy, p.mask, 0x77) %
      Math.max(1, variants[p.shape]),
  }));
}

/** The cells a placement covers, in row-major order. */
export function forestPlacementCells(
  placement: Pick<ForestPlacement, "shape" | "x" | "y">,
): [number, number][] {
  const cells: [number, number][] = [];
  FOREST_SHAPES[placement.shape].forEach((row, dy) =>
    [...row].forEach((mark, dx) => {
      if (mark === "#") cells.push([placement.x + dx, placement.y + dy]);
    }),
  );
  return cells;
}

/**
 * Rectangles of a shape's footprint in cells from its bounding box: one per
 * run of covered cells in a row, merged downwards when the next row has the
 * same run (a 2 x 2 is one rectangle, an L is two).
 */
export function forestShapeRects(
  shape: ForestShape,
): { x: number; y: number; w: number; h: number }[] {
  const rows = FOREST_SHAPES[shape];
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  rows.forEach((row, y) => {
    const x = row.indexOf("#");
    const w = row.lastIndexOf("#") - x + 1;
    const above = rects[rects.length - 1];
    if (
      above !== undefined &&
      above.x === x &&
      above.w === w &&
      above.y + above.h === y
    )
      above.h += 1;
    else rects.push({ x, y, w, h: 1 });
  });
  return rects;
}

/**
 * The upward bands of a shape: one per run of columns whose topmost covered
 * cell shares a row (column and width in cells, and that row).
 */
export function forestShapeBands(
  shape: ForestShape,
): { column: number; columns: number; row: number }[] {
  const rows = FOREST_SHAPES[shape];
  const width = rows[0]?.length ?? 1;
  const top = (column: number): number =>
    rows.findIndex((line) => line[column] === "#");
  const bands: { column: number; columns: number; row: number }[] = [];
  let start = 0;
  while (start < width) {
    const row = top(start);
    let end = start;
    while (end + 1 < width && top(end + 1) === row) end += 1;
    bands.push({ column: start, columns: end - start + 1, row });
    start = end + 1;
  }
  return bands;
}

// Fringe bits: the edges of a forest cell that face a cell without forest.
export const EDGE_N = 1;
export const EDGE_E = 2;
export const EDGE_S = 4;
export const EDGE_W = 8;

export interface ForestBand {
  readonly piece: ForestPlacement;
  readonly column: number;
  readonly columns: number;
  readonly row: number;
}

export interface ForestCell {
  /** The tree set: the cell's ground terrain. */
  readonly set: Exclude<Terrain, "water">;
  /** A cell under an object: it keeps a single 1x1 piece. */
  readonly clearing: boolean;
  /** Edges facing a cell without forest (EDGE_* bits). */
  readonly edges: number;
  /** The seam clump on this cell's east edge, drawn under both pieces. */
  readonly eastSeam: number | null;
  /** The seam clump over this cell's north edge, drawn under its piece. */
  readonly northSeam: number | null;
  /** Pieces whose footprint is drawn at this cell's turn (their last cell). */
  readonly bodies: readonly ForestPlacement[];
  /** Upward bands drawn in the foreground at this cell's turn. */
  readonly bands: readonly ForestBand[];
}

/**
 * The forest role of every Forest cell of the map, by row-major index.
 * `featured` cells (under an object) are clearings with a single piece and
 * no seam clump. `seamCount(set)` is the number of seam clumps of a set.
 */
export function forestCells(
  map: GameMap,
  variants: ForestVariantCounts,
  seamCount: (set: Exclude<Terrain, "water">) => number,
  featured: ReadonlySet<number> = new Set(),
): Map<number, ForestCell> {
  const { width, height } = map;
  const inside = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height;
  const forest = (x: number, y: number): boolean =>
    inside(x, y) && map.cells[y * width + x]?.obstacle === "forest";
  const terrainAt = (x: number, y: number): Terrain =>
    map.cells[y * width + x]?.terrain ?? "grass";
  const packable = (x: number, y: number): boolean =>
    forest(x, y) && !featured.has(y * width + x);
  const joinable = (ax: number, ay: number, bx: number, by: number): boolean =>
    terrainAt(ax, ay) === terrainAt(bx, by);
  const placements: ForestPlacement[] = [];
  for (let by = 0; by * 2 < height; by += 1)
    for (let bx = 0; bx * 2 < width; bx += 1)
      placements.push(...packForestBlock(packable, bx, by, variants, joinable));
  // A featured forest cell: a lone 1x1 piece.
  for (const index of featured) {
    const x = index % width;
    const y = Math.floor(index / width);
    if (!forest(x, y)) continue;
    placements.push({
      shape: "1x1",
      x,
      y,
      variant: hash4(x, y, 1, 0x77) % Math.max(1, variants["1x1"]),
    });
  }
  const pieceOf = new Map<number, ForestPlacement>();
  const bodies = new Map<number, ForestPlacement[]>();
  const bands = new Map<number, ForestBand[]>();
  for (const piece of placements) {
    const cells = forestPlacementCells(piece);
    for (const [cx, cy] of cells) pieceOf.set(cy * width + cx, piece);
    const last = cells[cells.length - 1];
    if (last === undefined) continue;
    const anchor = last[1] * width + last[0];
    bodies.set(anchor, [...(bodies.get(anchor) ?? []), piece]);
    for (const band of forestShapeBands(piece.shape)) {
      const at = (piece.y + band.row) * width + piece.x + band.column;
      bands.set(at, [...(bands.get(at) ?? []), { piece, ...band }]);
    }
  }
  const result = new Map<number, ForestCell>();
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      if (!forest(x, y)) continue;
      const index = y * width + x;
      const set = terrainAt(x, y);
      if (set === "water") continue;
      let edges = 0;
      if (!forest(x, y - 1)) edges |= EDGE_N;
      if (!forest(x + 1, y)) edges |= EDGE_E;
      if (!forest(x, y + 1)) edges |= EDGE_S;
      if (!forest(x - 1, y)) edges |= EDGE_W;
      const own = pieceOf.get(index);
      const east = forest(x + 1, y) ? pieceOf.get(index + 1) : undefined;
      const north = forest(x, y - 1) ? pieceOf.get(index - width) : undefined;
      const clumps = seamCount(set);
      const clearing = featured.has(index);
      const pick = (salt: number): number =>
        clumps <= 0 ? 0 : hash4(x, y, salt, 0x3d) % clumps;
      result.set(index, {
        set,
        clearing,
        edges,
        eastSeam:
          clumps > 0 &&
          !clearing &&
          own !== undefined &&
          east !== undefined &&
          east !== own &&
          !featured.has(index + 1)
            ? pick(1)
            : null,
        northSeam:
          clumps > 0 &&
          !clearing &&
          own !== undefined &&
          north !== undefined &&
          north !== own &&
          !featured.has(index - width)
            ? pick(2)
            : null,
        bodies: bodies.get(index) ?? [],
        bands: bands.get(index) ?? [],
      });
    }
  return result;
}
