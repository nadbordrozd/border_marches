/**
 * Code-painted dirt roads. Ported from Pulp Wars
 * src/render/canvas/dirt-road-v7.ts (`dirtRoadLinkV7`, `dirtRoadPixelsV7`);
 * see LESSONS_MAP_AND_FACTION_SPRITES.md section 3.10.
 *
 * A dirt track about 9 px wide whose half-width varies with noise read at
 * each pixel's world position; a one-pixel
 * dark edge in two tones with gaps, crumbs just outside, a warm dirt fill
 * with darker and lighter patches, a shaded and a lit rim, dashed ruts and
 * pebbles. Pulp Wars cut the pixels per cell and cached two sprites; here
 * they are painted straight into the cached ground chunk (ground.ts), which
 * is drawn before every tree and rock, so roads pass under them.
 *
 * Dock gangways are Polytopia-specific and were left out.
 *
 * Border Marches (bead border_marches-bzc.44, replacing xaj.13's smoothed
 * curves): the track follows the GRID, the way heroes walk. The road cells
 * form a graph whose links run straight from one cell centre to the next,
 * orthogonally or diagonally, exactly where the hero's walk and the path
 * markers go; the graph is cut into chains between junctions and ends
 * (`roadChains`) so ruts run along a whole chain, and the painter measures
 * each pixel's distance to the links (`roadSegments`), so turns and
 * junctions get round joins and ends a round cap. Every road cell is drawn:
 * a right-angle turn is an L through its corner cell and a junction meets
 * at its centre cell; a diagonal link only joins diagonal road cells with
 * no road corner between them. Movement agrees: a diagonal step across a
 * road corner costs more than the two road steps round it
 * (src/core/game/pathfinding.ts `stepCost`), so heroes walk the road as
 * drawn.
 */
import type { GameMap } from "../../core/map/types";
import { CELL_PX } from "../../assets/manifest";
import { hash4 } from "./hash";

export const DIRT_ROAD = {
  casing: [0x57, 0x36, 0x20],
  casingSoft: [0x74, 0x49, 0x2b],
  fill: [0x9c, 0x6a, 0x3b],
  fillDark: [0x87, 0x59, 0x31],
  fillLight: [0xb3, 0x7f, 0x49],
  rut: [0x6b, 0x44, 0x25],
  pebble: [0xd8, 0xbb, 0x8b],
  crumb: [0x7d, 0x54, 0x33],
  halfWidth: 4.5,
  roughness: 1.9,
} as const;

export const ROAD_PIXEL = {
  CLEAR: 0,
  EDGE: 1,
  EDGE_SOFT: 2,
  CRUMB: 3,
  DIRT: 4,
  DIRT_DARK: 5,
  DIRT_LIGHT: 6,
  RUT: 7,
  PEBBLE: 8,
} as const;

export const ROAD_COLOURS: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  DIRT_ROAD.casing,
  DIRT_ROAD.casingSoft,
  DIRT_ROAD.crumb,
  DIRT_ROAD.fill,
  DIRT_ROAD.fillDark,
  DIRT_ROAD.fillLight,
  DIRT_ROAD.rut,
  DIRT_ROAD.pebble,
];

const RUT_OFFSET = 1.9;
const RUT_DASH = 9;
const RUT_HUB = 14;
const EDGE = 1.15;
const CRUMB_REACH = 3.2;
export const ROAD_REACH =
  DIRT_ROAD.halfWidth + DIRT_ROAD.roughness + EDGE + CRUMB_REACH;

/** One straight link of a road path, in world pixels. */
export interface RoadSegment {
  /** Start point, world px. */
  readonly ax: number;
  readonly ay: number;
  /** Vector from start to end, world px, and its length. */
  readonly cx: number;
  readonly cy: number;
  readonly length: number;
  /** Unit normal. */
  readonly nx: number;
  readonly ny: number;
  /** Distance along the whole path at the start, and the path's length. */
  readonly s0: number;
  readonly total: number;
  /** Per-path hash input (ruts). */
  readonly salt: number;
}

/**
 * The road graph's paths: chains of road cells between junctions and ends
 * (a node with other than two links), as lists of cells. A road cell links
 * its orthogonal road neighbours, and a diagonal one only when neither
 * shared corner cell is a road node (a genuinely diagonal road: a turn
 * stays an L, a junction a plain T or plus). `extraNodes` (object
 * entrances) join orthogonal road cells only, one each.
 */
export function roadChains(
  map: GameMap,
  extraNodes: readonly (readonly [number, number])[] = [],
): { cells: [number, number][]; entrance: boolean[] }[] {
  const { width, height } = map;
  const node = new Uint8Array(width * height);
  map.cells.forEach((cell, index) => {
    if (cell.road) node[index] = 1;
  });
  for (const [x, y] of extraNodes)
    if (
      x >= 0 &&
      y >= 0 &&
      x < width &&
      y < height &&
      node[y * width + x] === 0
    )
      node[y * width + x] = 2;
  const kindAt = (x: number, y: number): number =>
    x >= 0 && y >= 0 && x < width && y < height
      ? (node[y * width + x] ?? 0)
      : 0;
  const adjacency = new Map<number, number[]>();
  const link = (a: number, b: number): void => {
    adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
    adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
  };
  const unlink = (a: number, b: number): void => {
    adjacency.set(
      a,
      (adjacency.get(a) ?? []).filter((k) => k !== b),
    );
    adjacency.set(
      b,
      (adjacency.get(b) ?? []).filter((k) => k !== a),
    );
  };
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const own = kindAt(x, y);
      if (own === 0) continue;
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [1, 1],
        [-1, 1],
      ] as const) {
        const other = kindAt(x + dx, y + dy);
        if (other === 0 || (own === 2 && other === 2)) continue;
        if (dx !== 0 && dy !== 0) {
          // Diagonal: only between road cells, and only round no corner.
          if (own !== 1 || other !== 1) continue;
          if (kindAt(x + dx, y) !== 0 || kindAt(x, y + dy) !== 0) continue;
        }
        link(y * width + x, (y + dy) * width + x + dx);
      }
    }
  // An entrance with several road neighbours keeps only the first one: the
  // road ends at the door, it does not loop round.
  for (const [index, list] of adjacency) {
    if (node[index] !== 2 || list.length <= 1) continue;
    for (const other of list.slice(1)) unlink(index, other);
  }
  const degree = (index: number): number => adjacency.get(index)?.length ?? 0;
  const seen = new Set<string>();
  const edgeKey = (a: number, b: number): string =>
    a < b ? `${a}:${b}` : `${b}:${a}`;
  const chains: { cells: [number, number][]; entrance: boolean[] }[] = [];
  const walk = (start: number, next: number): void => {
    const indices = [start];
    let prev = start;
    let at = next;
    seen.add(edgeKey(start, next));
    for (;;) {
      indices.push(at);
      if (at === start || degree(at) !== 2) break;
      const onward = (adjacency.get(at) ?? []).find((k) => k !== prev);
      if (onward === undefined || seen.has(edgeKey(at, onward))) break;
      seen.add(edgeKey(at, onward));
      prev = at;
      at = onward;
    }
    chains.push({
      cells: indices.map((k) => [k % width, Math.floor(k / width)]),
      entrance: indices.map((k) => node[k] === 2),
    });
  };
  const order = [...adjacency.keys()].sort((a, b) => a - b);
  for (const index of order) {
    if (degree(index) === 2) continue;
    for (const next of adjacency.get(index) ?? [])
      if (!seen.has(edgeKey(index, next))) walk(index, next);
  }
  // Closed loops with no junction.
  for (const index of order)
    for (const next of adjacency.get(index) ?? [])
      if (!seen.has(edgeKey(index, next))) walk(index, next);
  return chains;
}

/** The road paths of a map: each chain's cell centres, world pixels. */
export function roadPaths(
  map: GameMap,
  extraNodes: readonly (readonly [number, number])[] = [],
): [number, number][][] {
  return roadChains(map, extraNodes).map((chain) =>
    chain.cells.map(([x, y]): [number, number] => [
      x * CELL_PX + CELL_PX / 2,
      y * CELL_PX + CELL_PX / 2,
    ]),
  );
}

/** The straight links of the road paths of a map. */
export function roadSegments(
  map: GameMap,
  extraNodes: readonly (readonly [number, number])[] = [],
): RoadSegment[] {
  const out: RoadSegment[] = [];
  roadPaths(map, extraNodes).forEach((path, index) => {
    let total = 0;
    for (let k = 0; k + 1 < path.length; k += 1) {
      const a = path[k] as [number, number];
      const b = path[k + 1] as [number, number];
      total += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    const first = path[0] ?? [0, 0];
    const salt = hash4(Math.round(first[0]), Math.round(first[1]), index, 0x2d);
    let s0 = 0;
    for (let k = 0; k + 1 < path.length; k += 1) {
      const a = path[k] as [number, number];
      const b = path[k + 1] as [number, number];
      const cx = b[0] - a[0];
      const cy = b[1] - a[1];
      const length = Math.hypot(cx, cy);
      if (length < 1e-6) continue;
      out.push({
        ax: a[0],
        ay: a[1],
        cx,
        cy,
        length,
        nx: -cy / length,
        ny: cx / length,
        s0,
        total,
        salt,
      });
      s0 += length;
    }
  });
  return out;
}

function speck(gx: number, gy: number, salt: number): number {
  return hash4(gx, gy, salt, 0x51ed) / 0x100000000;
}

function latticeValue(x: number, y: number, salt: number): number {
  return (hash4(x, y, salt, 0x7a3d) / 0x100000000) * 2 - 1;
}

/** Smooth value noise in [-1, 1] with lattice spacing `spacing` px. */
export function drift(
  gx: number,
  gy: number,
  spacing: number,
  salt: number,
): number {
  const fx = gx / spacing;
  const fy = gy / spacing;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const ux = tx * tx * (3 - 2 * tx);
  const uy = ty * ty * (3 - 2 * ty);
  const top =
    latticeValue(x0, y0, salt) * (1 - ux) + latticeValue(x0 + 1, y0, salt) * ux;
  const bottom =
    latticeValue(x0, y0 + 1, salt) * (1 - ux) +
    latticeValue(x0 + 1, y0 + 1, salt) * ux;
  return top * (1 - uy) + bottom * uy;
}

/**
 * The road pixel kind at world pixel (gx, gy) given the segments that may
 * reach it (ROAD_PIXEL.*).
 */
export function roadPixelAt(
  segments: readonly RoadSegment[],
  gx: number,
  gy: number,
): number {
  const P = ROAD_PIXEL;
  const px = gx + 0.5;
  const py = gy + 0.5;
  let nearest = Number.POSITIVE_INFINITY;
  let southWest = 0;
  let rut = false;
  for (const seg of segments) {
    const rx = px - seg.ax;
    const ry = py - seg.ay;
    const lateral = rx * seg.nx + ry * seg.ny;
    if (lateral > ROAD_REACH || lateral < -ROAD_REACH) continue;
    const t = (rx * seg.cx + ry * seg.cy) / (seg.length * seg.length);
    if (t * seg.length < -ROAD_REACH || (t - 1) * seg.length > ROAD_REACH)
      continue;
    let best: number;
    let sw: number;
    if (t <= 0 || t >= 1) {
      const ex = t <= 0 ? rx : rx - seg.cx;
      const ey = t <= 0 ? ry : ry - seg.cy;
      best = Math.sqrt(ex * ex + ey * ey);
      sw = (ey - ex) * 0.7;
    } else {
      best = Math.abs(lateral);
      sw = lateral * (seg.ny - seg.nx);
    }
    if (best < nearest) {
      nearest = best;
      southWest = sw;
    }
    if (t >= 0 && t < 1 && Math.abs(best - RUT_OFFSET) < 0.5) {
      const along = seg.s0 + t * seg.length;
      const dash = Math.floor(along / RUT_DASH);
      const within = along / RUT_DASH - dash;
      if (
        along > RUT_HUB &&
        along < seg.total - RUT_HUB &&
        within > 0.1 &&
        within < 0.9 &&
        hash4(seg.salt, 0, dash, lateral < 0 ? 3 : 7) / 0x100000000 < 0.5
      )
        rut = true;
    }
  }
  if (nearest > ROAD_REACH) return P.CLEAR;
  const half =
    DIRT_ROAD.halfWidth +
    DIRT_ROAD.roughness *
      (0.68 * drift(gx, gy, 7, 11) + 0.32 * drift(gx, gy, 2.6, 12));
  if (nearest < half) {
    const inside = half - nearest;
    if (inside > 1.7 && speck(gx, gy, 2) < 0.02) return P.PEBBLE;
    const tone = drift(gx, gy, 7, 21) * 0.8 + drift(gx, gy, 3.2, 22) * 0.4;
    const rim = inside < 1.25 && Math.abs(southWest) > 0.8;
    return rut && inside > 1.3
      ? P.RUT
      : rim && southWest > 0 && tone < 0.3
        ? P.DIRT_DARK
        : rim && southWest < 0 && tone > -0.3
          ? P.DIRT_LIGHT
          : tone > 0.3
            ? P.DIRT_LIGHT
            : tone < -0.3
              ? P.DIRT_DARK
              : P.DIRT;
  }
  if (nearest < half + EDGE) {
    if (speck(gx, gy, 1) < 0.07) return P.CLEAR;
    return drift(gx, gy, 3.5, 31) > 0.25 ? P.EDGE_SOFT : P.EDGE;
  }
  if (
    nearest < half + EDGE + CRUMB_REACH &&
    speck(gx, gy, 3) < 0.085 &&
    drift(gx, gy, 4.5, 41) > 0.15
  )
    return P.CRUMB;
  return P.CLEAR;
}
