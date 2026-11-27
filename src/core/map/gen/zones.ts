/**
 * Zone layout: a template graph of organic regions (bead bzc.3).
 *
 * Two to four start zones sit on a ring near the map's corners, the Hold's
 * zone in the centre, and middle zones are spread between them and relaxed
 * (Lloyd). Cells go to the nearest seed after a smooth domain warp, so
 * borders meander instead of forming straight Voronoi edges.
 *
 * Connections make a maze, not a hub: a spanning tree over long shared
 * borders (never start to start or start to Hold), every start with two
 * exits where it can, the Hold reached through one or two middle zones, and
 * a few extra loops between middle zones so there are several routes and
 * still dead ends. Each zone's tier is its distance in that graph from the
 * nearest start; neutral towns go into middle zones away from the starts.
 */
import type { Terrain } from "../types.ts";
import { at, components, fbm, N4, N8 } from "./grid.ts";
import { stageRng, stageSalt } from "./state.ts";
import type { Connection, GenState, ZoneRole } from "./state.ts";

const CORNERS: ReadonlyArray<readonly [number, number]> = [
  [0.19, 0.19],
  [0.81, 0.19],
  [0.81, 0.81],
  [0.19, 0.81],
];

interface Seed {
  x: number;
  y: number;
  role: ZoneRole;
  player?: number;
  /** Distance factor: below 1 grows the zone. */
  f: number;
}

type Spot = readonly [number, number];

/**
 * Start seed positions (fractions of the side) for each player count, and
 * one spot between each pair of neighbouring starts for a middle zone, so
 * every start borders two middle zones (two exits) and no start borders
 * another.
 */
function startSpots(
  rng: ReturnType<typeof stageRng>,
  players: number,
): { starts: Spot[]; between: Spot[] } {
  const corner = rng.int(0, 3);
  const c = (k: number): Spot => CORNERS[(corner + k) % 4] ?? [0.2, 0.2];
  if (players === 2) {
    return { starts: [c(0), c(2)], between: [c(1), c(3)] };
  }
  if (players === 4) {
    const mid = (a: Spot, b: Spot): Spot => {
      // Edge midpoints, a little closer to the edge than the corners.
      const x = (a[0] + b[0]) / 2;
      const y = (a[1] + b[1]) / 2;
      return [0.5 + (x - 0.5) * 1.08, 0.5 + (y - 0.5) * 1.08];
    };
    return {
      starts: [c(0), c(1), c(2), c(3)],
      between: [0, 1, 2, 3].map((k) => mid(c(k), c(k + 1))),
    };
  }
  const clamp = (v: number): number => Math.min(0.83, Math.max(0.17, v));
  const ring = (a: number): Spot => [
    clamp(0.5 + 0.38 * Math.cos(a)),
    clamp(0.5 + 0.38 * Math.sin(a)),
  ];
  const a0 = rng.float(0, 2 * Math.PI);
  const step = (2 * Math.PI) / players;
  const starts: Spot[] = [];
  const between: Spot[] = [];
  for (let k = 0; k < players; k++) {
    starts.push(ring(a0 + step * k));
    between.push(ring(a0 + step * (k + 0.5)));
  }
  return { starts, between };
}

/**
 * Lay out the zones, trying a few seed placements until the starts are fair:
 * every start zone about an average zone or larger, the starts within a
 * quarter of each other in size, and two exits each. Else keep the fairest.
 */
export function layoutZones(st: GenState): void {
  let best:
    | {
        score: number;
        zone: Int32Array;
        zones: GenState["zones"];
        connections: GenState["connections"];
      }
    | undefined;
  const middle = stageRng(st, "zone-count").int(
    ...st.cfg.middleZones[st.size][st.players],
  );
  const warp = warpField(st, middle + st.players + 1);
  for (let attempt = 0; attempt < 8; attempt++) {
    layoutAttempt(st, attempt, middle, warp);
    const starts = st.zones.filter((z) => z.role === "start");
    const areas = starts.map((z) => z.area);
    const exits = starts.map(
      (z) => st.connections.filter((c) => c.a === z.id || c.b === z.id).length,
    );
    const mean = st.g.n / st.zones.length;
    const score = Math.min(
      Math.min(...areas) / Math.max(...areas) / 0.75,
      Math.min(...areas) / mean / 0.95,
      Math.min(...exits) / 2,
    );
    if (!best || score > best.score) {
      best = {
        score,
        zone: st.zone.slice(),
        zones: st.zones.map((z) => ({ ...z })),
        connections: st.connections.map((c) => ({ ...c })),
      };
    }
    if (score >= 1) return;
  }
  if (best) {
    st.zone.set(best.zone);
    st.zones = best.zones;
    st.connections = best.connections;
  }
}

interface Warp {
  /** Warped position of each cell's centre. */
  px: Float64Array;
  py: Float64Array;
}

/**
 * Where each cell's centre lands after the domain warp: a broad warp that
 * bends borders over whole zones, plus a fine one (bead xaj.21) that
 * wobbles a border by a cell or two every few cells, so no border runs
 * ruler-straight (a range or a ground edge along one reads as a grid line).
 */
function warpField(st: GenState, count: number): Warp {
  const { g, cfg } = st;
  const radius = g.w / Math.sqrt(count);
  const amp = cfg.zones.warp * radius;
  const scale = cfg.zones.warpScale * radius;
  const saltX = stageSalt(st, "zone-warp-x");
  const saltY = stageSalt(st, "zone-warp-y");
  const fine = cfg.zones.fineWarp;
  const fineScale = cfg.zones.fineWarpScale;
  const fineX = stageSalt(st, "zone-fine-x");
  const fineY = stageSalt(st, "zone-fine-y");
  const px = new Float64Array(g.n);
  const py = new Float64Array(g.n);
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const i = g.idx(x, y);
      px[i] =
        x +
        0.5 +
        (fbm(x, y, scale, saltX, 3) - 0.5) * 3.2 * amp +
        (fbm(x, y, fineScale, fineX, 2) - 0.5) * 3.2 * fine;
      py[i] =
        y +
        0.5 +
        (fbm(x, y, scale, saltY, 3) - 0.5) * 3.2 * amp +
        (fbm(x, y, fineScale, fineY, 2) - 0.5) * 3.2 * fine;
    }
  }
  return { px, py };
}

function layoutAttempt(
  st: GenState,
  attempt: number,
  middle: number,
  warp: Warp,
): void {
  const { g, cfg } = st;
  const rng = stageRng(st, attempt === 0 ? "zones" : `zones-${attempt}`);
  const w = g.w;
  const count = middle + st.players + 1;
  const jitter = (): number => rng.float(-0.035, 0.035);
  const spots = startSpots(rng, st.players);
  const starts: Seed[] = spots.starts.map(([x, y], player) => ({
    x: (x + jitter()) * w,
    y: (y + jitter()) * w,
    role: "start",
    player,
    f: 1,
  }));
  const hold: Seed = {
    x: (0.5 + jitter()) * w,
    y: (0.5 + jitter()) * w,
    role: "hold",
    f: 1,
  };
  // A middle zone between each pair of neighbouring starts (fixed), the
  // rest by dart throwing with a shrinking minimum distance (relaxed).
  const between: Seed[] = spots.between.slice(0, middle).map(([x, y]) => ({
    x: (x + jitter()) * w,
    y: (y + jitter()) * w,
    role: "middle",
    f: 1,
  }));
  const fixed = [...starts, hold, ...between];
  let minD = (0.62 * w) / Math.sqrt(count);
  const mids: Seed[] = [...between];
  let guard = 0;
  while (mids.length < middle && guard < 4000) {
    guard++;
    const p: Seed = {
      x: rng.float(0.1, 0.9) * w,
      y: rng.float(0.1, 0.9) * w,
      role: "middle",
      f: 1,
    };
    const ok =
      [...fixed, ...mids.slice(between.length)].every(
        (s) => Math.hypot(s.x - p.x, s.y - p.y) >= minD,
      ) &&
      (st.water !== "inland" || ringSpot(p, starts, w));
    if (ok) mids.push(p);
    if (guard % 200 === 0) minD *= 0.92;
  }
  while (mids.length < middle) {
    mids.push({ x: w / 2 + mids.length, y: w / 3, role: "middle", f: 1 });
  }

  // Order: starts (player order), middles, the Hold last.
  const order = (): Seed[] => [...starts, ...mids, hold];

  // Lloyd relaxation of the middle seeds on a plain Voronoi.
  for (let r = 0; r < cfg.zones.relax; r++) {
    const all = order();
    const sx = new Float64Array(all.length);
    const sy = new Float64Array(all.length);
    const sn = new Float64Array(all.length);
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const k = nearestSeed(all, x + 0.5, y + 0.5);
        sx[k] = (sx[k] ?? 0) + x + 0.5;
        sy[k] = (sy[k] ?? 0) + y + 0.5;
        sn[k] = (sn[k] ?? 0) + 1;
      }
    }
    mids.forEach((m, j) => {
      if (j < between.length) return;
      const k = j + starts.length;
      const n = sn[k] ?? 0;
      if (n > 0) {
        m.x = m.x * 0.3 + ((sx[k] ?? 0) / n) * 0.7;
        m.y = m.y * 0.3 + ((sy[k] ?? 0) / n) * 0.7;
      }
    });
  }

  // Balance the sizes: each seed's distance factor moves until its zone
  // has about its share (starts a little more, the Hold a little less).
  const all = order();
  const weight = (s: Seed): number =>
    s.role === "start"
      ? cfg.zones.startWeight
      : s.role === "hold"
        ? cfg.zones.holdWeight
        : 1;
  const total = all.reduce((t, s) => t + weight(s), 0);
  const area = new Float64Array(all.length);
  for (let round = 0; round < 7; round++) {
    area.fill(0);
    for (let i = 0; i < g.n; i++) {
      const k = nearestSeed(all, warp.px[i] ?? 0, warp.py[i] ?? 0);
      st.zone[i] = k;
      area[k] = (area[k] ?? 0) + 1;
    }
    if (round === 6) break;
    all.forEach((s, k) => {
      const target = (g.n * weight(s)) / total;
      const ratio = Math.max(0.25, area[k] ?? 0) / target;
      s.f *= Math.min(1.25, Math.max(0.8, Math.pow(ratio, 0.35)));
    });
  }

  smoothZones(st, all.length);

  st.zones = all.map((s, id) => ({
    id,
    role: s.role,
    ...(s.player !== undefined ? { player: s.player } : {}),
    tier: 0,
    sx: s.x,
    sy: s.y,
    main: "grass",
    secondary: "grass",
    area: 0,
  }));
  for (let i = 0; i < g.n; i++) {
    const z = st.zones[st.zone[i] ?? 0];
    if (z) z.area++;
  }
  assignTerrains(st);
  st.connections = chooseConnections(st);
  assignTiers(st);
  chooseTownZones(st);
}

/**
 * Inland Sea (NAVAL 8.2, bead bzc.155): the middle zones form a ring round
 * the central sea, so none is seeded near the centre, nor between a start
 * and the centre (the sea reaches every start zone).
 */
function ringSpot(
  p: { x: number; y: number },
  starts: readonly Seed[],
  w: number,
): boolean {
  const c = w / 2;
  const r = Math.hypot(p.x - c, p.y - c);
  if (r < 0.32 * w) return false;
  const a = Math.atan2(p.y - c, p.x - c);
  return starts.every((s) => {
    const sa = Math.atan2(s.y - c, s.x - c);
    const gap = Math.abs(Math.atan2(Math.sin(a - sa), Math.cos(a - sa)));
    return gap > 0.42 || r > Math.hypot(s.x - c, s.y - c);
  });
}

function nearestSeed(seeds: readonly Seed[], x: number, y: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k < seeds.length; k++) {
    const s = seeds[k] as Seed;
    const dx = s.x - x;
    const dy = s.y - y;
    // Squared distance times the squared size factor: same order.
    const d = (dx * dx + dy * dy) * s.f * s.f;
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

/** Majority-smooth zone labels, then keep each zone in one piece. */
function smoothZones(st: GenState, count: number): void {
  const { g } = st;
  const tally = new Int32Array(count);
  for (let round = 0; round < 2; round++) {
    const next = st.zone.slice();
    for (let i = 0; i < g.n; i++) {
      tally.fill(0);
      for (const j of g.around(i, N8)) {
        const z = st.zone[j] ?? 0;
        tally[z] = (tally[z] ?? 0) + 1;
      }
      let best = st.zone[i] ?? 0;
      for (let z = 0; z < count; z++) {
        if ((tally[z] ?? 0) >= 6 && (tally[z] ?? 0) > (tally[best] ?? 0))
          best = z;
      }
      next[i] = best;
    }
    st.zone.set(next);
  }
  // Thin fingers: a cell with at most one 4-neighbour of its own zone joins
  // the most common neighbouring zone.
  for (let round = 0; round < 6; round++) {
    let changed = 0;
    for (let i = 0; i < g.n; i++) {
      const own = st.zone[i] ?? 0;
      tally.fill(0);
      let same = 0;
      for (const j of g.around(i, N4)) {
        const z = st.zone[j] ?? 0;
        if (z === own) same++;
        else tally[z] = (tally[z] ?? 0) + 1;
      }
      if (same > 1) continue;
      let best = -1;
      for (let z = 0; z < count; z++) {
        if (
          z !== own &&
          (tally[z] ?? 0) > 0 &&
          (best < 0 || (tally[z] ?? 0) > (tally[best] ?? 0))
        ) {
          best = z;
        }
      }
      if (best >= 0) {
        st.zone[i] = best;
        changed++;
      }
    }
    if (changed === 0) break;
  }
  // Each zone keeps its largest 4-connected piece; others join a neighbour.
  for (let z = 0; z < count; z++) {
    const comp = components(g, (i) => (st.zone[i] ?? 0) === z, 4);
    if (comp.sizes.length <= 1) continue;
    let keep = 0;
    comp.sizes.forEach((s, k) => {
      if (s > (comp.sizes[keep] ?? 0)) keep = k;
    });
    comp.cells.forEach((cells, k) => {
      if (k !== keep) for (const i of cells) st.zone[i] = -1;
    });
  }
  for (let pass = 0; pass < g.n; pass++) {
    let left = 0;
    for (let i = 0; i < g.n; i++) {
      if ((st.zone[i] ?? 0) !== -1) continue;
      tally.fill(0);
      let found = false;
      for (const j of g.around(i, N4)) {
        const z = st.zone[j] ?? 0;
        if (z >= 0) {
          tally[z] = (tally[z] ?? 0) + 1;
          found = true;
        }
      }
      if (!found) {
        left++;
        continue;
      }
      let best = 0;
      for (let z = 1; z < count; z++)
        if ((tally[z] ?? 0) > (tally[best] ?? 0)) best = z;
      st.zone[i] = best;
    }
    if (left === 0) break;
  }
}

const LAND: readonly Terrain[] = ["grass", "steppe", "badlands", "wasteland"];

function assignTerrains(st: GenState): void {
  const rng = stageRng(st, "zone-terrain");
  const t = st.cfg.terrain;
  const adj = zoneAdjacency(st);
  for (const z of st.zones) {
    if (z.role === "start") {
      const list = t.start.main;
      z.main = list[(z.player ?? 0) % list.length] ?? "grass";
      z.secondary = rng.pick(LAND.filter((m) => m !== z.main));
      continue;
    }
    const options = z.role === "hold" ? t.hold.main : t.middle.main;
    const taken = new Set(
      st.zones
        .filter((o) => o.id < z.id && (adj.get(key(o.id, z.id)) ?? 0) > 0)
        .map((o) => o.main),
    );
    const free = options.filter((m) => !taken.has(m));
    z.main = rng.pick(free.length > 0 ? free : options);
    z.secondary = rng.pick(LAND.filter((m) => m !== z.main));
  }
}

function key(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** Shared border length (4-adjacent cell pairs) per zone pair. */
export function zoneAdjacency(st: GenState): Map<string, number> {
  const { g } = st;
  const out = new Map<string, number>();
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const i = g.idx(x, y);
      const a = st.zone[i] ?? 0;
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ] as const) {
        if (!g.inside(x + dx, y + dy)) continue;
        const b = at(st.zone, g.idx(x + dx, y + dy));
        if (b !== a) out.set(key(a, b), (out.get(key(a, b)) ?? 0) + 1);
      }
    }
  }
  return out;
}

function chooseConnections(st: GenState): Connection[] {
  const rng = stageRng(st, "connections");
  const adj = zoneAdjacency(st);
  const n = st.zones.length;
  const role = (k: number): ZoneRole => st.zones[k]?.role ?? "middle";
  const holdId = n - 1;
  const edges: Array<Connection & { weight: number }> = [];
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const border = adj.get(key(a, b)) ?? 0;
      if (border < st.cfg.zones.minConnectBorder) continue;
      edges.push({ a, b, border, weight: border * rng.float(0.5, 1.5) });
    }
  }
  edges.sort((p, q) => q.weight - p.weight || p.a - q.a || p.b - q.b);
  /** 0: normal, 1: touches the Hold, 2: start-start or start-Hold. */
  const grade = (e: Connection): number => {
    const ra = role(e.a);
    const rb = role(e.b);
    if (ra === "start" && (rb === "start" || rb === "hold")) return 2;
    if (rb === "start" && ra === "hold") return 2;
    return e.a === holdId || e.b === holdId ? 1 : 0;
  };

  const parent = Array.from({ length: n }, (_, k) => k);
  const find = (k: number): number => {
    while (parent[k] !== k) k = parent[k] ?? k;
    return k;
  };
  const chosen: Connection[] = [];
  const has = (e: Connection): boolean =>
    chosen.some((c) => c.a === e.a && c.b === e.b);
  const degree = (z: number): number =>
    chosen.filter((c) => c.a === z || c.b === z).length;
  const add = (e: Connection): void => {
    chosen.push({ a: e.a, b: e.b, border: e.border });
  };
  // The tree over everything but the Hold, then the Hold as a leaf (more
  // only when needed to connect), then the forbidden pairs as a last resort.
  for (const level of [0, 1, 2]) {
    for (const e of edges) {
      if (grade(e) !== level) continue;
      const ra = find(e.a);
      const rb = find(e.b);
      if (ra === rb) continue;
      parent[ra] = rb;
      add(e);
    }
  }
  // Every start gets a second exit where it can.
  for (const z of st.zones) {
    if (z.role !== "start" || degree(z.id) >= 2) continue;
    const extra = edges.find(
      (e) => (e.a === z.id || e.b === z.id) && grade(e) === 0 && !has(e),
    );
    if (extra) add(extra);
  }
  // A second way into the Hold's zone on larger maps.
  if (st.size !== "S" && degree(holdId) < 2) {
    const extra = edges.find(
      (e) => grade(e) === 1 && !has(e) && (e.a === holdId || e.b === holdId),
    );
    if (extra) add(extra);
  }
  // Loops between middle zones: several routes, and still dead ends.
  const loops = rng.int(...st.cfg.zones.loops[st.size]);
  const extra = rng.shuffle(
    edges.filter(
      (e) =>
        grade(e) === 0 &&
        !has(e) &&
        e.border >= 2 * st.cfg.zones.minConnectBorder,
    ),
  );
  let added = 0;
  for (const e of extra) {
    if (added >= loops) break;
    const starts = [e.a, e.b].filter((k) => role(k) === "start");
    if (starts.some((k) => degree(k) >= 3)) continue;
    add(e);
    added++;
  }
  return chosen.sort((p, q) => p.a - q.a || p.b - q.b);
}

/** Tier: steps through the connection graph from the nearest start zone. */
function assignTiers(st: GenState): void {
  const n = st.zones.length;
  const tier = new Array<number>(n).fill(Infinity);
  let frontier = st.zones.filter((z) => z.role === "start").map((z) => z.id);
  for (const z of frontier) tier[z] = 0;
  for (let t = 1; frontier.length > 0; t++) {
    const next: number[] = [];
    for (const z of frontier) {
      for (const c of st.connections) {
        const other = c.a === z ? c.b : c.b === z ? c.a : -1;
        if (other < 0 || (tier[other] ?? 0) <= t) continue;
        tier[other] = t;
        next.push(other);
      }
    }
    frontier = next;
  }
  for (const z of st.zones) {
    const t = tier[z.id] ?? 1;
    z.tier = Number.isFinite(t) ? t : 1;
  }
}

/**
 * Neutral towns go into middle zones, preferring those farther from the
 * starts (later objectives), one town per zone. With
 * `zones.townsBesideStarts` (bead bzc.129; by size, bead bzc.147) each
 * start first gets one in the largest middle zone connected to it.
 */
function chooseTownZones(st: GenState): void {
  const rng = stageRng(st, "town-zones");
  let want = rng.int(...st.cfg.neutralTowns[st.size]);
  const pool = rng
    .shuffle(st.zones.filter((z) => z.role === "middle"))
    .sort((a, b) => b.tier - a.tier || b.area - a.area);
  const besideStarts = st.cfg.zones.townsBesideStarts;
  if (
    typeof besideStarts === "boolean" ? besideStarts : besideStarts[st.size]
  ) {
    for (const s of st.zones.filter((z) => z.role === "start")) {
      if (want <= 0) break;
      const beside = pool
        .filter(
          (z) =>
            z.role === "middle" &&
            st.connections.some(
              (c) =>
                (c.a === s.id && c.b === z.id) ||
                (c.b === s.id && c.a === z.id),
            ),
        )
        .sort((a, b) => b.area - a.area)[0];
      if (beside === undefined) continue;
      beside.role = "town";
      want--;
    }
  }
  for (const z of pool.filter((p) => p.role === "middle").slice(0, want))
    z.role = "town";
}
