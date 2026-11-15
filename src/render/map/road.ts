/**
 * Code-painted dirt roads. Ported from Pulp Wars
 * src/render/canvas/dirt-road-v7.ts (`dirtRoadLinkV7`, `dirtRoadPixelsV7`);
 * see LESSONS_MAP_AND_FACTION_SPRITES.md section 3.10.
 *
 * A dirt track about 9 px wide whose half-width varies with noise read at
 * each pixel's world position; each link between two road cells bends
 * sideways by at most 4 px (a pure function of its two cells); a one-pixel
 * dark edge in two tones with gaps, crumbs just outside, a warm dirt fill
 * with darker and lighter patches, a shaded and a lit rim, dashed ruts and
 * pebbles. Pulp Wars cut the pixels per cell and cached two sprites; here
 * they are painted straight into the cached ground chunk (ground.ts), which
 * is drawn before every tree and rock, so roads pass under them.
 *
 * Dock gangways are Polytopia-specific and were left out.
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
  wobble: 4,
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
const RUT_HUB = 9;
const EDGE = 1.15;
const CRUMB_REACH = 3.2;
export const ROAD_REACH =
  DIRT_ROAD.halfWidth + DIRT_ROAD.roughness + EDGE + CRUMB_REACH;

/** One link between two road cells, in world pixels. */
export interface RoadLink {
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
  /** Start point (the from-cell's centre), world px. */
  readonly ax: number;
  readonly ay: number;
  /** Vector from start to end, world px, and its length. */
  readonly cx: number;
  readonly cy: number;
  readonly length: number;
  /** Unit normal. */
  readonly nx: number;
  readonly ny: number;
  readonly bend: readonly [number, number];
  /** Per-link hash input (ruts). */
  readonly salt: number;
}

/** Sideways offset of a link at t in [0, 1], world px. */
export function roadBend(link: Pick<RoadLink, "bend">, t: number): number {
  const s = Math.sin(Math.PI * t);
  return s * s * (link.bend[0] + link.bend[1] * Math.cos(Math.PI * t));
}

export function makeRoadLink(
  a: readonly [number, number],
  b: readonly [number, number],
): RoadLink {
  const [from, to] =
    a[1] < b[1] || (a[1] === b[1] && a[0] <= b[0]) ? [a, b] : [b, a];
  const signed = (salt: number): number =>
    (hash4(from[0], from[1], to[0] * 4099 + salt, to[1] * 8191 - salt) /
      0x100000000) *
      2 -
    1;
  const cx = (to[0] - from[0]) * CELL_PX;
  const cy = (to[1] - from[1]) * CELL_PX;
  const length = Math.hypot(cx, cy);
  return {
    from,
    to,
    ax: from[0] * CELL_PX + CELL_PX / 2,
    ay: from[1] * CELL_PX + CELL_PX / 2,
    cx,
    cy,
    length,
    nx: -cy / length,
    ny: cx / length,
    bend: [
      signed(1) * DIRT_ROAD.wobble * 0.65,
      signed(2) * DIRT_ROAD.wobble * 0.9,
    ],
    salt: from[0] * 131 + to[0] + (from[1] * 137 + to[1]) * 7919,
  };
}

/**
 * The road links of a map: every pair of orthogonally neighbouring road
 * nodes, a diagonal pair with no road node at either shared corner cell
 * (so diagonal roads join), and Pulp Wars' corner "joins" (the two road
 * neighbours of a road cell's turn are linked too, which rounds the turn).
 * `nodes` are the road cells plus object entrances a road reaches.
 */
export function roadLinks(
  map: GameMap,
  extraNodes: readonly (readonly [number, number])[] = [],
): RoadLink[] {
  const { width, height } = map;
  const node = new Uint8Array(width * height);
  map.cells.forEach((cell, index) => {
    if (cell.road) node[index] = 1;
  });
  for (const [x, y] of extraNodes)
    if (x >= 0 && y >= 0 && x < width && y < height) node[y * width + x] = 2;
  const isNode = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && node[y * width + x] !== 0;
  const isRoad = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && node[y * width + x] === 1;
  const links: RoadLink[] = [];
  const seen = new Set<string>();
  const add = (a: [number, number], b: [number, number]): void => {
    const k =
      a[1] < b[1] || (a[1] === b[1] && a[0] <= b[0])
        ? `${a},${b}`
        : `${b},${a}`;
    if (seen.has(k)) return;
    seen.add(k);
    links.push(makeRoadLink(a, b));
  };
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      if (!isNode(x, y)) continue;
      // An entrance only joins roads, never another entrance.
      const entrance = !isRoad(x, y);
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ] as const) {
        if (!isNode(x + dx, y + dy)) continue;
        if (entrance && !isRoad(x + dx, y + dy)) continue;
        add([x, y], [x + dx, y + dy]);
      }
      if (entrance) continue;
      for (const dx of [-1, 1]) {
        const dy = 1;
        if (!isRoad(x + dx, y + dy)) continue;
        if (isNode(x + dx, y) || isNode(x, y + dy)) continue;
        add([x, y], [x + dx, y + dy]);
      }
      // Corner joins: round the turn at (x, y). Only at a plain turn
      // (exactly two road neighbours, at right angles): at a junction the
      // joins would close little triangles of ground.
      const sides = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].filter(([dx = 0, dy = 0]) => isNode(x + dx, y + dy));
      if (sides.length === 2)
        for (const dx of [-1, 1])
          for (const dy of [-1, 1])
            if (isRoad(x + dx, y) && isRoad(x, y + dy))
              add([x + dx, y], [x, y + dy]);
    }
  return links;
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
 * The road pixel kind at world pixel (gx, gy) given the links that may reach
 * it (ROAD_PIXEL.*).
 */
export function roadPixelAt(
  links: readonly RoadLink[],
  gx: number,
  gy: number,
): number {
  const P = ROAD_PIXEL;
  const px = gx + 0.5;
  const py = gy + 0.5;
  const bendReach = DIRT_ROAD.wobble + ROAD_REACH;
  let nearest = Number.POSITIVE_INFINITY;
  let southWest = 0;
  let rut = false;
  for (const link of links) {
    const rx = px - link.ax;
    const ry = py - link.ay;
    const t = (rx * link.cx + ry * link.cy) / (link.length * link.length);
    const lateral = rx * link.nx + ry * link.ny;
    if (
      lateral > bendReach ||
      lateral < -bendReach ||
      t * link.length < -ROAD_REACH ||
      (t - 1) * link.length > ROAD_REACH
    )
      continue;
    let best: number;
    let side = 0;
    let sw: number;
    const along = Math.max(0, Math.min(1, t)) * link.length;
    if (t <= 0 || t >= 1) {
      const ex = t <= 0 ? rx : rx - link.cx;
      const ey = t <= 0 ? ry : ry - link.cy;
      best = Math.sqrt(ex * ex + ey * ey);
      sw = ey - ex;
    } else {
      side = lateral - roadBend(link, t);
      best = Math.abs(side);
      sw = side * (link.ny - link.nx);
    }
    if (best < nearest) {
      nearest = best;
      southWest = sw;
    }
    if (Math.abs(best - RUT_OFFSET) < 0.5) {
      const dash = Math.floor(along / RUT_DASH);
      const within = along / RUT_DASH - dash;
      if (
        along > RUT_HUB &&
        along < link.length - RUT_HUB &&
        within > 0.1 &&
        within < 0.9 &&
        hash4(link.salt, 0, dash, side < 0 ? 3 : 7) / 0x100000000 < 0.5
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
