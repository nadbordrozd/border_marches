/**
 * Mountains as massifs. Ported from Pulp Wars
 * src/render/canvas/chibi-massif-v7.ts (`packMassifV7`,
 * `chibiMassifCellsV7`); see LESSONS_MAP_AND_FACTION_SPRITES.md section 3.6.
 *
 * A group of Mountain cells is drawn as one mountain mass: every row of the
 * group is covered by ridges two cells wide and single mountains, laid like
 * bricks so the ridges of one row never line up with the next. A piece whose
 * cells all have a plain Mountain above is TALL (its peaks rise up to 48 px
 * over the row behind and cover that row's feet); otherwise it is LOW (the
 * top row of a range, or under a feature cell). The cover is a pure function
 * of the Mountain cells and their coordinates, packed over the whole map
 * (explored or not), so nothing changes shape when the fog lifts.
 *
 * Border Marches addition: the variant is also kept different from the
 * piece two to the west and the pieces diagonally above, so a long ridge
 * line does not alternate between two pieces.
 */
import type { GameMap } from "../../core/map/types";
import { hash4 } from "./hash";

/** Variants per kind of piece. */
export interface MassifVariantCounts {
  readonly low1: number;
  readonly low2: number;
  readonly tall1: number;
  readonly tall2: number;
}

export interface MassifPlacement {
  /** The piece's west cell. */
  readonly x: number;
  readonly y: number;
  readonly columns: 1 | 2;
  readonly tall: boolean;
  readonly variant: number;
}

const key = (x: number, y: number): string => `${x},${y}`;

const countOf = (
  counts: MassifVariantCounts,
  columns: 1 | 2,
  tall: boolean,
): number =>
  columns === 2
    ? tall
      ? counts.tall2
      : counts.low2
    : tall
      ? counts.tall1
      : counts.low1;

/**
 * How a run of `length` Mountain cells starting at (x0, y) is cut into
 * singles (1) and ridges (2), as [west x, columns] pairs.
 *
 * Pulp Wars cut a run by parity alone (ridges, with a single at the end the
 * row's parity picks, so rows lie like bricks). That leaves a diagonal range
 * (a staircase, each row shifted one cell) as a line of LOW ridges, because
 * a ridge is tall only when both cells above it are Mountain: the range then
 * reads as separate flat clumps. Here the cut is the best-scoring one
 * (dynamic programming over the run): +3 for every cell under a tall piece,
 * +1 for every ridge (bigger pieces, fewer seams) but -1.5 for a ridge
 * lying exactly under a ridge of the row above (brick-laying), and a tiny
 * coordinate hash to break ties. A full block still lies like bricks, and a
 * staircase gets tall singles wherever there is rock behind.
 */
export function segmentRun(
  x0: number,
  y: number,
  length: number,
  rockAbove: (x: number) => boolean,
  ridgesAbove: ReadonlySet<number>,
  ridges = true,
): [number, 1 | 2][] {
  const best: { score: number; cut: [number, 1 | 2][] }[] = [
    { score: 0, cut: [] },
  ];
  for (let i = 1; i <= length; i += 1) {
    const options: { score: number; cut: [number, 1 | 2][] }[] = [];
    for (const columns of ridges ? ([1, 2] as const) : ([1] as const)) {
      const from = best[i - columns];
      if (from === undefined) continue;
      const x = x0 + i - columns;
      let tall = true;
      for (let c = 0; c < columns; c += 1) if (!rockAbove(x + c)) tall = false;
      let score = from.score + (tall ? 3 * columns : 0);
      if (columns === 2) score += ridgesAbove.has(x) ? -1.5 : 1;
      score += (hash4(x, y, columns, 0x5e) % 1000) / 4000;
      options.push({ score, cut: [...from.cut, [x, columns]] });
    }
    options.sort((a, b) => b.score - a.score);
    best.push(options[0] ?? { score: 0, cut: [] });
  }
  return best[length]?.cut ?? [];
}

/**
 * The cover of the plain Mountain cells `cells`: row by row, each run of
 * neighbouring cells is cut into ridges and singles by {@link segmentRun},
 * north to south. A piece is tall when every cell above it is in `cells`.
 * No piece repeats the variant of a nearby piece of its kind.
 */
export function packMassif(
  cells: readonly (readonly [number, number])[],
  counts: MassifVariantCounts,
): MassifPlacement[] {
  const plain = new Set(cells.map(([x, y]) => key(x, y)));
  const placed: MassifPlacement[] = [];
  /** Kind and variant of the piece on each covered cell. */
  const taken = new Map<string, string>();
  const place = (x: number, y: number, wanted: 1 | 2): void => {
    const columns: 1 | 2 = wanted === 2 && counts.low2 > 0 ? 2 : 1;
    if (wanted === 2 && columns === 1) {
      place(x, y, 1);
      place(x + 1, y, 1);
      return;
    }
    let tall = true;
    for (let column = 0; column < columns; column += 1)
      if (!plain.has(key(x + column, y - 1))) tall = false;
    if (countOf(counts, columns, tall) === 0) tall = false;
    const count = Math.max(1, countOf(counts, columns, tall));
    const kind = `${columns}${tall ? "T" : "L"}`;
    // Pulp Wars kept a piece different from its west neighbour and the
    // pieces right above it; here also from the piece two cells west and
    // the cells diagonally above, so a long ridge line does not alternate
    // between two pieces.
    const near = [
      taken.get(key(x - 1, y)),
      taken.get(key(x, y - 1)),
      taken.get(key(x + columns - 1, y - 1)),
      taken.get(key(x - 2, y)),
      taken.get(key(x - 1, y - 1)),
      taken.get(key(x + columns, y - 1)),
    ];
    let variant = hash4(x, y, columns + (tall ? 5 : 0), 0x4d) % count;
    // The first candidate that clashes with none of the nearest pieces;
    // the first three (west, above) always win over the farther ones.
    const clash = (candidate: number, upTo: number): boolean =>
      near.slice(0, upTo).includes(`${kind}#${candidate}`);
    let chosen = -1;
    for (const upTo of [near.length, 3]) {
      for (let step = 0; step < count && chosen < 0; step += 1) {
        const candidate = (variant + step) % count;
        if (!clash(candidate, upTo)) chosen = candidate;
      }
      if (chosen >= 0) break;
    }
    if (chosen >= 0) variant = chosen;
    for (let column = 0; column < columns; column += 1)
      taken.set(key(x + column, y), `${kind}#${variant}`);
    placed.push({ x, y, columns, tall, variant });
  };
  const rows = new Map<number, number[]>();
  for (const [x, y] of cells) rows.set(y, [...(rows.get(y) ?? []), x]);
  /** West cells of the ridges placed in the previous row. */
  let ridgesAbove = new Set<number>();
  let rowAbove = Number.NaN;
  for (const y of [...rows.keys()].sort((a, b) => a - b)) {
    if (rowAbove !== y - 1) ridgesAbove = new Set();
    const ridgesHere = new Set<number>();
    const xs = [...new Set(rows.get(y) ?? [])].sort((a, b) => a - b);
    let start = 0;
    while (start < xs.length) {
      let end = start;
      while (end + 1 < xs.length && xs[end + 1] === (xs[end] ?? 0) + 1)
        end += 1;
      const x0 = xs[start] ?? 0;
      const length = end - start + 1;
      for (const [x, columns] of segmentRun(
        x0,
        y,
        length,
        (cx) => plain.has(key(cx, y - 1)),
        ridgesAbove,
        counts.low2 > 0,
      )) {
        place(x, y, columns);
        if (columns === 2) ridgesHere.add(x);
      }
      start = end + 1;
    }
    ridgesAbove = ridgesHere;
    rowAbove = y;
  }
  return placed;
}

export interface MassifCell {
  /** Pieces drawn at this cell's turn in the body pass (their east cell). */
  readonly bodies: readonly MassifPlacement[];
  /** The low piece whose 24 px band this cell draws in the foreground. */
  readonly band: {
    readonly piece: MassifPlacement;
    readonly column: number;
  } | null;
}

/**
 * What every Mountain cell of the map draws, by row-major index. `featured`
 * cells (a Mountain under an object) draw a low single outside every ridge,
 * and the piece south of one stays low.
 */
export function massifCells(
  map: GameMap,
  counts: MassifVariantCounts,
  featured: ReadonlySet<number> = new Set(),
): Map<number, MassifCell> {
  const plainCells: [number, number][] = [];
  const featureCells: [number, number][] = [];
  map.cells.forEach((cell, index) => {
    if (cell.obstacle !== "mountain") return;
    const at: [number, number] = [
      index % map.width,
      Math.floor(index / map.width),
    ];
    (featured.has(index) ? featureCells : plainCells).push(at);
  });
  const placements = [
    ...packMassif(plainCells, counts),
    ...featureCells.map(([x, y]): MassifPlacement => ({
      x,
      y,
      columns: 1,
      tall: false,
      variant: hash4(x, y, 1, 0x4d) % Math.max(1, counts.low1),
    })),
  ];
  const result = new Map<
    number,
    { bodies: MassifPlacement[]; band: MassifCell["band"] }
  >();
  const at = (x: number, y: number) => {
    const index = y * map.width + x;
    let cell = result.get(index);
    if (cell === undefined) {
      cell = { bodies: [], band: null };
      result.set(index, cell);
    }
    return cell;
  };
  for (const piece of placements) {
    at(piece.x + piece.columns - 1, piece.y).bodies.push(piece);
    if (!piece.tall)
      for (let column = 0; column < piece.columns; column += 1)
        at(piece.x + column, piece.y).band = { piece, column };
  }
  return result;
}
