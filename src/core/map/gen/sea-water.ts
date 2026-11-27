/**
 * The water of a naval map (docs/design/NAVAL.md 8.1-8.2, bead bzc.155),
 * before the land stages:
 *
 * - **Coast**: one or two coasts along map edges, deep enough for the
 *   water share of 8.1 (8-15%), in the water stage (gen/water.ts) instead
 *   of today's optional coast.
 * - **Inland Sea**: a sea in the middle of the map, after the zones and
 *   before the towns: the middle of every zone near the centre goes under,
 *   the Hold's zone keeps an island ringed by water, and the sea reaches
 *   every start zone so each start town can stand on its shore.
 * - **Islands**: every zone shrinks to an island inside a channel along its
 *   borders and the map edge (45-60% water), each keeping a core of land
 *   (the starts a larger one).
 *
 * Each carve draws from its own random streams ("sea-*"), so Water None
 * never touches them. On Inland Sea and Islands maps the generator's
 * reachability then sails (`GenState.seaPass`, gen/paths.ts).
 */
import { SEA_MIN, SEA_MIN_SMALL, SMALL_MAP_SIDE } from "../../../data/naval.ts";
import { chamferDistance, components, fbm } from "./grid.ts";
import { T, stageRng, stageSalt } from "./state.ts";
import type { GenState } from "./state.ts";

/** The smallest water body that is a sea (NAVAL 2.1, as the game's rule). */
export function seaMinOf(st: GenState): number {
  return Math.max(st.g.w, st.g.h) <= SMALL_MAP_SIDE ? SEA_MIN_SMALL : SEA_MIN;
}

/** The 4-connected water bodies of at least {@link seaMinOf} cells. */
export function seaBodies(st: GenState): number[][] {
  const wet = (i: number): boolean => st.terrain[i] === T.water;
  const min = seaMinOf(st);
  return components(st.g, wet, 4).cells.filter((c) => c.length >= min);
}

/** Recompute the sailed cells of an Inland Sea or Islands map. */
export function refreshSeaPass(st: GenState): void {
  if (st.water !== "inland" && st.water !== "islands") return;
  const pass = new Uint8Array(st.g.n);
  for (const body of seaBodies(st)) for (const i of body) pass[i] = 1;
  st.seaPass = pass;
}

/** Distance of each cell to the nearest cell of another zone. */
function foreignDistance(st: GenState): Float64Array {
  const { g } = st;
  const out = new Float64Array(g.n);
  for (const z of st.zones) {
    const { dist } = chamferDistance(g, (i) => st.zone[i] !== z.id);
    for (let i = 0; i < g.n; i++) {
      if (st.zone[i] === z.id) out[i] = dist[i] ?? 0;
    }
  }
  return out;
}

/** Cells from the map edge (0 on the edge row). */
function edgeDistance(st: GenState, i: number): number {
  const { g } = st;
  const x = g.x(i);
  const y = g.y(i);
  return Math.min(x, y, g.w - 1 - x, g.h - 1 - y);
}

/**
 * The land each zone keeps whatever the share: cells at least this far
 * inside the zone's deepest point stay dry (towns and start kits need
 * room; the starts more).
 */
const CORE = { start: 6.5, hold: 5, middle: 3.5, town: 4.5 } as const;

/** Pick the threshold whose share of water is nearest `target`. */
function searchShare(
  n: number,
  target: number,
  wetAt: (d: number) => Uint8Array,
  lo: number,
  hi: number,
): Uint8Array {
  let best = wetAt(lo);
  let bestGap = Infinity;
  for (let k = 0; k < 14; k++) {
    const mid = (lo + hi) / 2;
    const wet = wetAt(mid);
    let count = 0;
    for (let i = 0; i < n; i++) count += wet[i] ?? 0;
    const share = count / n;
    const gap = Math.abs(share - target);
    if (gap < bestGap) {
      bestGap = gap;
      best = wet;
    }
    if (share < target) lo = mid;
    else hi = mid;
  }
  return best;
}

/**
 * Inland Sea and Islands: carve the sea into the zone layout, before the
 * towns are placed. Sets `st.seaPass`.
 */
export function carveSea(st: GenState): void {
  if (st.water === "islands") carveIslands(st);
  else if (st.water === "inland") carveInland(st);
  else return;
  refreshSeaPass(st);
}

function zoneDepths(
  st: GenState,
  depth: Float64Array,
): { most: Float64Array; core: Float64Array } {
  const most = new Float64Array(st.zones.length);
  for (let i = 0; i < st.g.n; i++) {
    const z = st.zone[i] ?? 0;
    most[z] = Math.max(most[z] ?? 0, depth[i] ?? 0);
  }
  const core = new Float64Array(st.zones.length);
  for (const z of st.zones) core[z.id] = CORE[z.role];
  return { most, core };
}

function carveIslands(st: GenState): void {
  const { g } = st;
  const rng = stageRng(st, "sea-islands");
  const sc = st.cfg.sea.islands;
  const target = rng.float(sc.share[0] + 0.03, sc.share[1] - 0.05);
  const foreign = foreignDistance(st);
  // Depth inside the zone: from its borders and the map edge alike, so
  // every island has sea all round.
  const depth = new Float64Array(g.n);
  for (let i = 0; i < g.n; i++) {
    depth[i] = Math.min(foreign[i] ?? 0, edgeDistance(st, i) + 1);
  }
  const { most, core } = zoneDepths(st, depth);
  const salt = stageSalt(st, "sea-islands");
  const wobble = new Float64Array(g.n);
  for (let i = 0; i < g.n; i++) {
    wobble[i] = (fbm(g.x(i), g.y(i), 6, salt, 3) - 0.5) * 2.6;
  }
  const wetAt = (d: number): Uint8Array => {
    const wet = new Uint8Array(g.n);
    for (let i = 0; i < g.n; i++) {
      const z = st.zone[i] ?? 0;
      const zone = st.zones[z];
      // The starts' islands are cut from a narrower channel; the Hold's
      // from a wider one (its moat, a sea zone of its own, gen/sea.ts),
      // with less wobble so the moat never pinches shut.
      const hold = zone?.role === "hold";
      const own = zone?.role === "start" ? d * 0.55 : hold ? d * 1.5 : d;
      const limit = Math.min(own, (most[z] ?? 0) - (core[z] ?? 0));
      const wob = (wobble[i] ?? 0) * (hold ? 0.4 : 1);
      if ((depth[i] ?? 0) + wob < Math.max(hold ? 4 : 0, limit)) wet[i] = 1;
    }
    return wet;
  };
  const wet = searchShare(g.n, target, wetAt, 1, 16);
  for (let i = 0; i < g.n; i++) if (wet[i] === 1) st.terrain[i] = T.water;
}

function carveInland(st: GenState): void {
  const { g } = st;
  const rng = stageRng(st, "sea-inland");
  const sc = st.cfg.sea.inland;
  const target = rng.float(sc.share[0] + 0.01, sc.share[1] - 0.04);
  const foreign = foreignDistance(st);
  const depth = new Float64Array(g.n);
  for (let i = 0; i < g.n; i++) {
    depth[i] = Math.min(foreign[i] ?? 0, edgeDistance(st, i) + 1);
  }
  const { most, core } = zoneDepths(st, depth);
  const salt = stageSalt(st, "sea-inland");
  const cx = g.w / 2;
  const cy = g.h / 2;
  const radius = new Float64Array(g.n);
  for (let i = 0; i < g.n; i++) {
    radius[i] =
      Math.hypot(g.x(i) + 0.5 - cx, g.y(i) + 0.5 - cy) +
      (fbm(g.x(i), g.y(i), 7, salt, 3) - 0.5) * 7;
  }
  const hold = st.zones.find((z) => z.role === "hold")?.id ?? -1;
  // The sea reaches every start zone: no smaller than the start nearest
  // the centre needs, plus a little.
  let reach = 0;
  for (const z of st.zones) {
    if (z.role !== "start") continue;
    let near = Infinity;
    for (let i = 0; i < g.n; i++) {
      if (st.zone[i] === z.id) near = Math.min(near, radius[i] ?? 0);
    }
    reach = Math.max(reach, near + 3);
  }
  // The Hold's island: its zone ringed by a channel 3-4 cells wide.
  const ring = Math.min(4, Math.max(2.5, (most[hold] ?? 0) - CORE.hold));
  const wetAt = (r: number): Uint8Array => {
    const wet = new Uint8Array(g.n);
    for (let i = 0; i < g.n; i++) {
      const z = st.zone[i] ?? 0;
      if (z === hold) {
        if ((depth[i] ?? 0) < ring) wet[i] = 1;
        continue;
      }
      if ((radius[i] ?? 0) >= r) continue;
      if ((depth[i] ?? 0) > (most[z] ?? 0) - (core[z] ?? 0)) continue;
      wet[i] = 1;
    }
    return wet;
  };
  const wet = searchShare(g.n, target, wetAt, reach, g.w * 0.48);
  for (let i = 0; i < g.n; i++) if (wet[i] === 1) st.terrain[i] = T.water;
}

/**
 * Coast (bead bzc.155): one or two coasts along distinct map edges, deep
 * enough for the share of NAVAL 8.1, into the water stage's mask. Drawn
 * from its own stream; the shape is today's coast (gen/water.ts).
 */
export function coastWater(st: GenState, water: Uint8Array): void {
  const { g } = st;
  const sc = st.cfg.sea.coast;
  const rng = stageRng(st, "sea-coast");
  const w = g.w;
  const edges = rng.shuffle([0, 1, 2, 3]).slice(0, sc.edges[st.size]);
  const target = rng.float(sc.share[0] + 0.015, sc.share[1] - 0.04);
  const coasts = edges.map((edge, k) => {
    const len = rng.float(...sc.length) * w;
    const centre = rng.float(len / 2 - w * 0.05, w - len / 2 + w * 0.05);
    return { edge, len, centre, salt: stageSalt(st, `sea-coast-${k}`) };
  });
  const wetAt = (depth: number): Uint8Array => {
    const wet = new Uint8Array(g.n);
    for (const c of coasts) {
      for (let y = 0; y < g.h; y++) {
        for (let x = 0; x < g.w; x++) {
          const [u, v] =
            c.edge === 0
              ? [x, y]
              : c.edge === 1
                ? [y, w - 1 - x]
                : c.edge === 2
                  ? [w - 1 - x, g.h - 1 - y]
                  : [g.h - 1 - y, x];
          const t = (u + 0.5 - c.centre) / (c.len / 2);
          const taper = Math.max(0, 1 - t * t);
          const n = fbm(x, y, 6, c.salt, 3) - 0.5;
          if (v + 0.5 < depth * Math.sqrt(taper) + n * 5) wet[g.idx(x, y)] = 1;
        }
      }
    }
    return wet;
  };
  const wet = searchShare(g.n, target, wetAt, 2, w * 0.4);
  for (let i = 0; i < g.n; i++) if (wet[i] === 1) water[i] = 1;
}
