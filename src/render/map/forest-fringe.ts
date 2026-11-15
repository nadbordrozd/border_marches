/**
 * The frayed edge of a wood (bead border_marches-xaj.13): loose tree clumps
 * that break the cell-aligned outline of the packed forest pieces.
 *
 * Packed pieces (forest-packing.ts) fill their footprint edge to edge, so a
 * wood drawn from them alone is a block with straight sides. Three kinds of
 * clumps (the set's single "seam" clumps, drawn at 50 to 100 percent size)
 * break that up:
 *
 * - EDGE clumps stand on the east, west and south edges of a packed cell
 *   that faces land without a packed piece, covering the piece's straight
 *   side and hanging up to SPILL px over the neighbour where crowns may hang
 *   (open land or thin wood; never water, road, rock or an object);
 * - THIN cells (`ForestCell.sparse`: tips, corners, one-cell strands and a
 *   hashed share of edge cells) get two or three clumps instead of a piece;
 * - OUTLIERS: now and then one or two small trees on an open cell beside a
 *   wood, near the shared edge and off the cell centre (decorative: the cell
 *   stays open).
 *
 * Every clump is a pure function of the map (hashes of its cell), drawn in
 * the TALL_BODY pass after every piece anchored in its row or above (a
 * fractional sort row), and kept inside its cell except over edges where
 * crowns may hang, so no later piece cuts it with a straight side.
 */
import { CELL_PX } from "../../assets/manifest";
import type { GroundTerrain } from "../../assets/manifest";
import type { GameMap } from "../../core/map/types";
import { EDGE_E, EDGE_N, EDGE_S, EDGE_W } from "./forest-packing";
import type { ForestCell } from "./forest-packing";
import { hash4 } from "./hash";

const CELL = CELL_PX;

/** Size of a clump image, px. */
export interface ClumpSize {
  readonly w: number;
  readonly h: number;
}

export interface ForestClump {
  readonly set: GroundTerrain;
  /** Index into the set's seam clumps. */
  readonly seam: number;
  /** Drawn rectangle, world px (whole pixels). */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Sort row (fractional: after the pieces of row floor(row)) and column. */
  readonly row: number;
  readonly col: number;
  readonly kind: "edge" | "thin" | "outlier";
}

export const FRINGE = {
  /** How far crowns hang over a neighbour, px. */
  spill: [12, 24],
  /** How far an edge clump stays inside where crowns may not hang, px. */
  tuck: [0, 6],
  edgeScale: [0.8, 0.96],
  /** Share of north-edge cells with a clump rising behind the crowns. */
  northChance: 0.6,
  thinScale: [0.8, 1],
  outlierScale: [0.5, 0.64],
  /** Share of open cells beside a wood with an outlier tree. */
  outlierChance: 0.3,
  /** Share of those with a second one. */
  secondOutlier: 0.25,
  /** Half-size of the cell-centre box an outlier's trunk keeps out of, px. */
  centreGuard: 16,
} as const;

const unit = (x: number, y: number, salt: number): number =>
  hash4(x, y, salt, 0x6f1) / 0x1_0000_0000;

const lerp = (range: readonly [number, number], t: number): number =>
  range[0] + (range[1] - range[0]) * t;

/**
 * The fringe clumps of a map. `cells` are the roles from forestCells,
 * `seams(set)` the clump sizes of each set, `featured` the cells under
 * objects (no outlier there).
 */
export function forestClumps(
  map: GameMap,
  cells: ReadonlyMap<number, ForestCell>,
  seams: (set: GroundTerrain) => readonly ClumpSize[],
  featured: ReadonlySet<number> = new Set(),
): ForestClump[] {
  const { width, height } = map;
  const out: ForestClump[] = [];
  /**
   * A clump of `set` with its trunk base at (bx, by), scaled by `scale`,
   * kept inside x in [left, right] and its base at most `bottom`.
   */
  const place = (
    set: GroundTerrain,
    x: number,
    y: number,
    salt: number,
    bx: number,
    by: number,
    scale: number,
    bounds: { left: number; right: number; bottom: number },
    row: number,
    kind: ForestClump["kind"],
  ): void => {
    const sizes = seams(set);
    if (sizes.length === 0) return;
    const seam = hash4(x, y, salt, 0x2c5) % sizes.length;
    const size = sizes[seam] as ClumpSize;
    const w = Math.max(1, Math.round(size.w * scale));
    const h = Math.max(1, Math.round(size.h * scale));
    let left = Math.round(bx - w / 2);
    left = Math.max(bounds.left, Math.min(bounds.right - w, left));
    const base = Math.min(bounds.bottom, Math.round(by));
    out.push({ set, seam, x: left, y: base - h, w, h, row, col: x, kind });
  };

  for (const [index, cell] of cells) {
    if (cell.clearing) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    const left = x * CELL;
    const top = y * CELL;
    const r = (salt: number): number => unit(x, y, salt);
    const reach = (bit: number, salt: number): number =>
      (cell.spill & bit) !== 0
        ? lerp(FRINGE.spill, r(salt))
        : -lerp(FRINGE.tuck, r(salt));
    const bounds = {
      left: left - ((cell.spill & EDGE_W) !== 0 ? FRINGE.spill[1] : 0),
      right: left + CELL + ((cell.spill & EDGE_E) !== 0 ? FRINGE.spill[1] : 0),
      bottom: top + CELL + ((cell.spill & EDGE_S) !== 0 ? FRINGE.spill[1] : 0),
    };
    if (cell.sparse) {
      const row = y + 0.5;
      const around =
        4 -
        [EDGE_N, EDGE_E, EDGE_S, EDGE_W].filter((b) => (cell.edges & b) !== 0)
          .length;
      const slots: [number, number][] =
        around <= 1 && r(1) < 0.5
          ? [
              [30, 50],
              [52, 76],
            ]
          : around >= 3
            ? [
                [24, 40],
                [58, 44],
                [30, 70],
                [56, 78],
              ]
            : [
                [24, 46],
                [57, 50],
                [40, 76],
              ];
      slots.forEach(([sx, sy], k) => {
        let bx = left + sx + (r(10 + k) - 0.5) * 12;
        let by = top + sy + (r(20 + k) - 0.5) * 10;
        // Lean out over open sides.
        if (sx < 40 && (cell.spill & EDGE_W) !== 0) bx -= r(30 + k) * 10;
        if (sx > 40 && (cell.spill & EDGE_E) !== 0) bx += r(30 + k) * 10;
        if (sy > 60 && (cell.spill & EDGE_S) !== 0) by += r(40 + k) * 14;
        place(
          cell.set,
          x,
          y,
          50 + k,
          bx,
          by,
          lerp(FRINGE.thinScale, r(60 + k)),
          bounds,
          row,
          "thin",
        );
      });
      continue;
    }
    // A north edge: now and then a clump standing just inside, BEHIND the
    // piece (drawn before its row), whose crown rises above the even line
    // of the piece's crown band.
    if (
      (cell.fringe & EDGE_N) !== 0 &&
      (cell.spill & EDGE_N) !== 0 &&
      r(90) < FRINGE.northChance
    )
      place(
        cell.set,
        x,
        y,
        90,
        left + 16 + r(91) * 48,
        top + 10 + r(92) * 10,
        lerp(FRINGE.edgeScale, r(93)),
        { left, right: left + CELL, bottom: top + CELL },
        y - 0.5,
        "edge",
      );
    const row = Math.max(y, cell.anchorRow ?? y) + 0.5;
    const sides: [number, number][] = [];
    if ((cell.fringe & EDGE_E) !== 0) sides.push([EDGE_E, 1]);
    if ((cell.fringe & EDGE_W) !== 0) sides.push([EDGE_W, 2]);
    if ((cell.fringe & EDGE_S) !== 0) sides.push([EDGE_S, 3]);
    for (const [bit, salt] of sides) {
      for (let k = 0; k < 2; k += 1) {
        const scale = lerp(FRINGE.edgeScale, r(salt * 7 + 1 + k));
        const sizes = seams(cell.set);
        const probe =
          sizes[
            hash4(x, y, 100 + salt * 4 + k, 0x2c5) % Math.max(1, sizes.length)
          ];
        const w = (probe?.w ?? 64) * scale;
        const hang = reach(bit, salt * 7 + 3 + k);
        let bx: number;
        let by: number;
        if (bit === EDGE_S) {
          bx = left + (k === 0 ? 22 : 58) + (r(salt * 7 + 5 + k) - 0.5) * 10;
          by = top + CELL + hang;
        } else {
          bx =
            bit === EDGE_E ? left + CELL + hang - w / 2 : left - hang + w / 2;
          by = top + (k === 0 ? 44 : 74) + (r(salt * 7 + 6 + k) - 0.5) * 8;
        }
        place(
          cell.set,
          x,
          y,
          100 + salt * 4 + k,
          bx,
          by,
          scale,
          bounds,
          row,
          "edge",
        );
      }
    }
  }

  // Outliers: small trees on open land beside a wood.
  const forestAt = (x: number, y: number): ForestCell | undefined =>
    x >= 0 && y >= 0 && x < width && y < height
      ? cells.get(y * width + x)
      : undefined;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const own = map.cells[index];
      if (
        own === undefined ||
        own.obstacle !== "none" ||
        own.terrain === "water" ||
        own.road ||
        featured.has(index)
      )
        continue;
      const r = (salt: number): number => unit(x, y, 0x700 + salt);
      if (r(0) >= FRINGE.outlierChance) continue;
      const sides = (
        [
          [EDGE_N, 0, -1],
          [EDGE_E, 1, 0],
          [EDGE_S, 0, 1],
          [EDGE_W, -1, 0],
        ] as const
      ).filter(([, dx, dy]) => forestAt(x + dx, y + dy) !== undefined);
      if (sides.length === 0) continue;
      const count = r(1) < FRINGE.secondOutlier ? 2 : 1;
      const left = x * CELL;
      const top = y * CELL;
      for (let k = 0; k < count; k += 1) {
        const side = sides[Math.floor(r(2 + k) * sides.length)] ?? sides[0];
        if (side === undefined) continue;
        const [bit, dx, dy] = side;
        const set = forestAt(x + dx, y + dy)?.set;
        if (set === undefined) continue;
        const along = r(4 + k) < 0.5 ? 10 + r(6 + k) * 18 : 52 + r(6 + k) * 18;
        let bx: number;
        let by: number;
        if (bit === EDGE_N) {
          bx = left + 12 + r(6 + k) * 56;
          by = top + 16 + r(8 + k) * 10;
        } else if (bit === EDGE_S) {
          // Clear of the crowns the wood below raises over this cell.
          bx = left + along;
          by = top + 46 + r(8 + k) * 8;
        } else {
          bx =
            bit === EDGE_W
              ? left + 10 + r(8 + k) * 8
              : left + 62 + r(8 + k) * 8;
          by = top + 30 + r(10 + k) * 44;
        }
        if (
          Math.abs(bx - left - CELL / 2) < FRINGE.centreGuard &&
          Math.abs(by - top - CELL / 2) < FRINGE.centreGuard * 2
        )
          continue;
        place(
          set,
          x,
          y,
          0x700 + k,
          bx,
          by,
          lerp(FRINGE.outlierScale, r(12 + k)),
          { left, right: left + CELL, bottom: top + CELL - 4 },
          y + 0.5,
          "outlier",
        );
      }
    }
  return out;
}
