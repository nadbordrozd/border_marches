/**
 * Zone layout: a template graph of organic regions.
 *
 * The start zone sits in a random corner and the enemy zone in the opposite
 * one; middle zones are spread between them and relaxed (Lloyd). Cells go to
 * the nearest seed after a smooth domain warp, so borders meander instead of
 * forming straight Voronoi edges. Connections are a maximum spanning tree over
 * long shared borders (never start-to-enemy unless unavoidable), plus an
 * optional loop.
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
}

export function layoutZones(st: GenState): void {
  const { g, cfg } = st;
  const rng = stageRng(st, "zones");
  const w = g.w;
  const middle = rng.int(...cfg.middleZones[st.size]);
  const count = middle + 2;
  const corner = rng.int(0, 3);
  const [cx, cy] = CORNERS[corner] ?? [0.2, 0.2];
  const [ex, ey] = CORNERS[(corner + 2) % 4] ?? [0.8, 0.8];
  const jitter = (): number => rng.float(-0.035, 0.035);
  const seeds: Seed[] = [
    { x: (cx + jitter()) * w, y: (cy + jitter()) * w, role: "start" },
  ];
  // Middle seeds: dart throwing with a shrinking minimum distance.
  let minD = (0.62 * w) / Math.sqrt(count);
  const enemy: Seed = {
    x: (ex + jitter()) * w,
    y: (ey + jitter()) * w,
    role: "enemy",
  };
  const fixed = [seeds[0] as Seed, enemy];
  const mids: Seed[] = [];
  let guard = 0;
  while (mids.length < middle && guard < 4000) {
    guard++;
    const p = {
      x: rng.float(0.12, 0.88) * w,
      y: rng.float(0.12, 0.88) * w,
      role: "middle" as const,
    };
    const ok = [...fixed, ...mids].every(
      (s) => Math.hypot(s.x - p.x, s.y - p.y) >= minD,
    );
    if (ok) mids.push(p);
    if (guard % 200 === 0) minD *= 0.92;
  }
  while (mids.length < middle) {
    mids.push({ x: w / 2 + mids.length, y: w / 2, role: "middle" });
  }

  // Lloyd relaxation of the middle seeds on a plain Voronoi.
  for (let r = 0; r < cfg.zones.relax; r++) {
    const all = [fixed[0] as Seed, ...mids, enemy];
    const sx = new Float64Array(all.length);
    const sy = new Float64Array(all.length);
    const sn = new Float64Array(all.length);
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const k = nearestSeed(all, x + 0.5, y + 0.5);
        sx[k] = at(sx, k) + x + 0.5;
        sy[k] = at(sy, k) + y + 0.5;
        sn[k] = at(sn, k) + 1;
      }
    }
    mids.forEach((m, j) => {
      const k = j + 1;
      const n = at(sn, k);
      if (n > 0) {
        m.x = m.x * 0.3 + (at(sx, k) / n) * 0.7;
        m.y = m.y * 0.3 + (at(sy, k) / n) * 0.7;
      }
    });
  }

  // Order: start (0), middles (1..m), enemy (last).
  const all = [fixed[0] as Seed, ...mids, enemy];
  const radius = w / Math.sqrt(count);
  const amp = cfg.zones.warp * radius;
  const scale = cfg.zones.warpScale * radius;
  const saltX = stageSalt(st, "zone-warp-x");
  const saltY = stageSalt(st, "zone-warp-y");
  // A second, fine warp (bead xaj.21): the broad warp bends borders over
  // whole zones but leaves them ruler-straight for eight cells and more,
  // and a range or a ground edge along such a border read as a grid line.
  // This one wobbles a border by a cell or two every few cells.
  const fine = cfg.zones.fineWarp;
  const fineScale = cfg.zones.fineWarpScale;
  const fineX = stageSalt(st, "zone-fine-x");
  const fineY = stageSalt(st, "zone-fine-y");
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const px =
        x +
        0.5 +
        (fbm(x, y, scale, saltX, 3) - 0.5) * 3.2 * amp +
        (fbm(x, y, fineScale, fineX, 2) - 0.5) * 3.2 * fine;
      const py =
        y +
        0.5 +
        (fbm(x, y, scale, saltY, 3) - 0.5) * 3.2 * amp +
        (fbm(x, y, fineScale, fineY, 2) - 0.5) * 3.2 * fine;
      st.zone[g.idx(x, y)] = nearestSeed(all, px, py);
    }
  }

  smoothZones(st, all.length);

  st.zones = all.map((s, id) => ({
    id,
    role: s.role,
    sx: s.x,
    sy: s.y,
    main: "grass",
    secondary: "grass",
    area: 0,
  }));
  for (let i = 0; i < g.n; i++) {
    const z = st.zones[at(st.zone, i)];
    if (z) z.area++;
  }
  assignTerrains(st);
  st.connections = chooseConnections(st);
}

function nearestSeed(seeds: readonly Seed[], x: number, y: number): number {
  let best = 0;
  let bestD = Infinity;
  seeds.forEach((s, k) => {
    // The corner zones get a little more room.
    const f = s.role === "middle" ? 1 : 0.92;
    const d = Math.hypot(s.x - x, s.y - y) * f;
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  });
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
        const z = at(st.zone, j);
        tally[z] = at(tally, z) + 1;
      }
      let best = at(st.zone, i);
      for (let z = 0; z < count; z++) {
        if (at(tally, z) >= 6 && at(tally, z) > at(tally, best)) best = z;
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
      const own = at(st.zone, i);
      tally.fill(0);
      let same = 0;
      for (const j of g.around(i, N4)) {
        const z = at(st.zone, j);
        if (z === own) same++;
        else tally[z] = at(tally, z) + 1;
      }
      if (same > 1) continue;
      let best = -1;
      for (let z = 0; z < count; z++) {
        if (
          z !== own &&
          at(tally, z) > 0 &&
          (best < 0 || at(tally, z) > at(tally, best))
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
    const comp = components(g, (i) => at(st.zone, i) === z, 4);
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
      if (at(st.zone, i) !== -1) continue;
      tally.fill(0);
      let found = false;
      for (const j of g.around(i, N4)) {
        const z = at(st.zone, j);
        if (z >= 0) {
          tally[z] = at(tally, z) + 1;
          found = true;
        }
      }
      if (!found) {
        left++;
        continue;
      }
      let best = 0;
      for (let z = 1; z < count; z++)
        if (at(tally, z) > at(tally, best)) best = z;
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
      z.main = t.start.main;
      z.secondary = rng.pick(t.start.secondary);
      continue;
    }
    const options = z.role === "enemy" ? t.enemy.main : t.middle.main;
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
      const a = at(st.zone, i);
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
  const startId = 0;
  const enemyId = n - 1;
  const edges: Array<Connection & { weight: number }> = [];
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const border = adj.get(key(a, b)) ?? 0;
      if (border < st.cfg.zones.minConnectBorder) continue;
      edges.push({ a, b, border, weight: border * rng.float(0.6, 1.4) });
    }
  }
  edges.sort((p, q) => q.weight - p.weight || p.a - q.a || p.b - q.b);

  const parent = Array.from({ length: n }, (_, k) => k);
  const find = (k: number): number => {
    while (parent[k] !== k) k = parent[k] ?? k;
    return k;
  };
  const chosen: Connection[] = [];
  const direct = (e: Connection): boolean =>
    (e.a === startId && e.b === enemyId) ||
    (e.a === enemyId && e.b === startId);
  for (const pass of [false, true]) {
    for (const e of edges) {
      if (direct(e) !== pass) continue;
      const ra = find(e.a);
      const rb = find(e.b);
      if (ra === rb) continue;
      parent[ra] = rb;
      chosen.push({ a: e.a, b: e.b, border: e.border });
    }
  }
  if (rng.chance(st.cfg.zones.loopChance[st.size])) {
    const extra = edges.filter(
      (e) =>
        !direct(e) &&
        e.border >= 2 * st.cfg.zones.minConnectBorder &&
        !chosen.some((c) => c.a === e.a && c.b === e.b),
    );
    if (extra.length > 0) {
      const e = rng.pick(extra);
      chosen.push({ a: e.a, b: e.b, border: e.border });
    }
  }
  return chosen;
}
