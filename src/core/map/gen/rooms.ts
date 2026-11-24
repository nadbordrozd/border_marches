/**
 * Rooms: the maze inside a zone (bead bzc.3).
 *
 * A zone's open ground is cut into a few rooms (a geodesic Voronoi bent by
 * noise, so walls curve with the land), and every border between two rooms
 * becomes a wall of forest or rock grown from a one-cell seal, like the
 * zone borders but thinner. A spanning tree of the room graph, plus an
 * occasional loop, gets a gap one to three cells wide in its wall; the rest
 * stay closed. So a hero follows valleys that branch, turn back and end in
 * pockets instead of crossing one open field. Gaps are never guarded by
 * this stage; the object stage may post a guard in the gap of a dead-end
 * room it fills with treasure.
 */
import { at, MinHeap, N4, N8, noiseField } from "./grid.ts";
import { O, isOpen, stageRng, stageSalt } from "./state.ts";
import type { GapInfo, GenState } from "./state.ts";

/** Stretch fbm output (clustered around 0.5) to roughly [0, 1]. */
function stretch(v: number): number {
  return Math.min(1, Math.max(0, (v - 0.5) * 2.6 + 0.5));
}

export function buildRooms(st: GenState): void {
  const { g, cfg } = st;
  const rc = cfg.rooms;
  const rng = stageRng(st, "rooms");
  const warp = noiseField(g, rc.warpScale, stageSalt(st, "room-warp"), 2);
  const room = st.room;
  room.fill(-1);
  const roomZone: number[] = [];

  // 1. Rooms per zone.
  const byZone: number[][] = st.zones.map(() => []);
  for (let i = 0; i < g.n; i++) {
    if (isOpen(st, i)) byZone[st.zone[i] ?? 0]?.push(i);
  }
  for (const z of st.zones) {
    const cells = byZone[z.id] ?? [];
    if (cells.length === 0) continue;
    const k = Math.max(
      1,
      Math.min(
        rc.maxPerZone,
        Math.round(cells.length / rng.float(rc.area[0], rc.area[1])),
      ),
    );
    const first = roomZone.length;
    for (let r = 0; r < k; r++) roomZone.push(z.id);
    if (k === 1) {
      for (const i of cells) room[i] = first;
      continue;
    }
    const seeds = spreadSeeds(st, rng, cells, k);
    assignRooms(st, cells, seeds, first, warp, rc.warpAmount);
  }

  // 2. Walls along room borders.
  const pairs = buildWalls(st, rng, roomZone);

  // 3. Gaps: a spanning tree of each zone's room graph, plus loops.
  const parent = roomZone.map((_, k) => k);
  const find = (k: number): number => {
    while (parent[k] !== k) k = parent[k] ?? k;
    return k;
  };
  const order = [...pairs.values()]
    .map((p) => ({ ...p, w: p.border * rng.float(0.6, 1.4) }))
    .sort((p, q) => q.w - p.w || p.a - q.a || p.b - q.b);
  const loops: typeof order = [];
  for (const p of order) {
    const ra = find(p.a);
    const rb = find(p.b);
    if (ra === rb) {
      loops.push(p);
      continue;
    }
    if (carveGap(st, rng, p.a, p.b, roomZone[p.a] ?? 0)) parent[ra] = rb;
  }
  for (const p of loops) {
    if (p.border >= 5 && rng.chance(rc.loopChance)) {
      carveGap(st, rng, p.a, p.b, roomZone[p.a] ?? 0);
    }
  }
}

/** k seeds spread over the cells: farthest-point start, then Lloyd steps. */
function spreadSeeds(
  st: GenState,
  rng: ReturnType<typeof stageRng>,
  cells: readonly number[],
  k: number,
): number[] {
  const { g } = st;
  const seeds = [rng.pick(cells)];
  while (seeds.length < k) {
    let best = cells[0] as number;
    let bestD = -1;
    for (const i of cells) {
      let d = Infinity;
      for (const s of seeds) d = Math.min(d, g.dist(i, s));
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    seeds.push(best);
  }
  for (let round = 0; round < 3; round++) {
    const sx = new Float64Array(k);
    const sy = new Float64Array(k);
    const sn = new Float64Array(k);
    const owner = cells.map((i) => {
      let best = 0;
      let bestD = Infinity;
      seeds.forEach((s, m) => {
        const d = g.dist(i, s);
        if (d < bestD) {
          bestD = d;
          best = m;
        }
      });
      sx[best] = (sx[best] ?? 0) + g.x(i);
      sy[best] = (sy[best] ?? 0) + g.y(i);
      sn[best] = (sn[best] ?? 0) + 1;
      return best;
    });
    for (let m = 0; m < k; m++) {
      const n = sn[m] ?? 0;
      if (n === 0) continue;
      const cx = (sx[m] ?? 0) / n;
      const cy = (sy[m] ?? 0) / n;
      let best = seeds[m] as number;
      let bestD = Infinity;
      cells.forEach((i, c) => {
        if (owner[c] !== m) return;
        const d = Math.hypot(g.x(i) - cx, g.y(i) - cy);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      seeds[m] = best;
    }
  }
  return seeds;
}

/** Geodesic Voronoi over the zone's open cells with a noisy step cost. */
function assignRooms(
  st: GenState,
  cells: readonly number[],
  seeds: readonly number[],
  first: number,
  warp: Float64Array,
  amount: number,
): void {
  const { g } = st;
  const zone = at(st.zone, cells[0] ?? 0);
  const dist = new Map<number, number>();
  const heap = new MinHeap();
  seeds.forEach((s, m) => {
    dist.set(s, 0);
    st.room[s] = first + m;
    heap.push(0, s);
  });
  while (heap.size > 0) {
    const { priority, value: i } = heap.pop();
    if (priority > (dist.get(i) ?? Infinity)) continue;
    const x = g.x(i);
    const y = g.y(i);
    for (const [dx, dy] of N8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!g.inside(nx, ny)) continue;
      const j = g.idx(nx, ny);
      if ((st.zone[j] ?? 0) !== zone || !isOpen(st, j)) continue;
      const step =
        (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1) *
        (1 + amount * stretch(warp[j] ?? 0));
      const d = priority + step;
      if (d < (dist.get(j) ?? Infinity)) {
        dist.set(j, d);
        st.room[j] = st.room[i] ?? 0;
        heap.push(d, j);
      }
    }
  }
}

interface RoomPair {
  a: number;
  b: number;
  /** Shared border length (4-adjacent cell pairs). */
  border: number;
}

/**
 * Seal every room border from one side (the holder), then thicken the wall
 * by noise on both sides. Returns the room pairs that share a border.
 */
function buildWalls(
  st: GenState,
  rng: ReturnType<typeof stageRng>,
  roomZone: readonly number[],
): Map<number, RoomPair> {
  const { g, cfg } = st;
  const rc = cfg.rooms;
  const room = st.room;
  const n = roomZone.length;
  const pairKey = (a: number, b: number): number =>
    a < b ? a * n + b : b * n + a;
  const pairs = new Map<number, RoomPair>();
  for (let i = 0; i < g.n; i++) {
    const a = room[i] ?? 0;
    if (a < 0) continue;
    for (const j of g.around(i, N4)) {
      const b = room[j] ?? 0;
      if (b < 0 || b <= a || roomZone[a] !== roomZone[b]) continue;
      const k = pairKey(a, b);
      const p = pairs.get(k);
      if (p) p.border++;
      else pairs.set(k, { a, b, border: 1 });
    }
  }
  const holder = new Map<number, number>();
  for (const [k, p] of pairs) holder.set(k, rng.chance(0.5) ? p.a : p.b);

  // Distance (Chebyshev steps inside the room) to the nearest foreign room,
  // and which room that is, up to three steps.
  const dist = new Int32Array(g.n).fill(99);
  const foreign = new Int32Array(g.n).fill(-1);
  let frontier: number[] = [];
  for (let i = 0; i < g.n; i++) {
    const a = room[i] ?? 0;
    if (a < 0) continue;
    for (const j of g.around(i, N8)) {
      const b = room[j] ?? 0;
      if (b < 0 || b === a || roomZone[a] !== roomZone[b]) continue;
      // A seal cell prefers the room it holds the border against.
      if (foreign[i] === -1 || holder.get(pairKey(a, b)) === a) foreign[i] = b;
      dist[i] = 1;
    }
    if ((dist[i] ?? 0) === 1) frontier.push(i);
  }
  for (let d = 2; d <= 3; d++) {
    const next: number[] = [];
    for (const i of frontier) {
      for (const j of g.around(i, N8)) {
        if ((room[j] ?? 0) !== (room[i] ?? 0) || (dist[j] ?? 0) <= d) continue;
        dist[j] = d;
        foreign[j] = foreign[i] ?? 0;
        next.push(j);
      }
    }
    frontier = next;
  }

  const thickA = noiseField(g, rc.thicknessScale, stageSalt(st, "rw-a"), 3);
  const thickB = noiseField(g, rc.thicknessScale, stageSalt(st, "rw-b"), 3);
  const typeN = noiseField(
    g,
    cfg.borders.typeScale * 0.6,
    stageSalt(st, "rw-type"),
    2,
  );
  for (let i = 0; i < g.n; i++) {
    const a = room[i] ?? 0;
    const b = foreign[i] ?? 0;
    if (a < 0 || b < 0) continue;
    if ((st.keepOpen[i] ?? 0) || (st.occupied[i] ?? 0)) continue;
    const d = dist[i] ?? 0;
    const holds = holder.get(pairKey(a, b)) === a;
    const z = st.zones[roomZone[a] ?? 0];
    const share = z ? cfg.clusters.mountainShare[z.main] : 0.5;
    const kind = stretch(typeN[i] ?? 0) < share ? O.mountain : O.forest;
    const least = kind === O.mountain ? 2 : 1;
    const limit = holds
      ? Math.max(least, 1 + rc.wallExtra * stretch(thickA[i] ?? 0))
      : rc.wallExtra * stretch(thickB[i] ?? 0) - 0.6;
    if (d <= limit) st.obstacle[i] = kind;
  }
  return pairs;
}

/**
 * Open a gap 1-3 cells wide through the wall between rooms a and b: from
 * a seam where they meet, a corridor through each room's side of the wall
 * to open ground, widened sideways. The cells stay open from here on.
 */
function carveGap(
  st: GenState,
  rng: ReturnType<typeof stageRng>,
  a: number,
  b: number,
  zone: number,
): boolean {
  const { g, cfg } = st;
  const cand: Array<{ i: number; j: number }> = [];
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < g.n; i++) {
    if ((st.room[i] ?? 0) !== a) continue;
    for (const j of g.around(i, N4)) {
      if ((st.room[j] ?? 0) !== b) continue;
      cand.push({ i, j });
      cx += g.x(i);
      cy += g.y(i);
    }
  }
  if (cand.length === 0) return false;
  cx /= cand.length;
  cy /= cand.length;
  const scored = cand
    .map((c) => ({
      ...c,
      s: Math.hypot(g.x(c.i) - cx, g.y(c.i) - cy) + rng.float(0, 3),
    }))
    .sort((p, q) => p.s - q.s || p.i - q.i);
  for (const c of scored.slice(0, 6)) {
    const pa = pathToOpen(st, a, c.i, 6);
    const pb = pathToOpen(st, b, c.j, 6);
    if (!pa || !pb) continue;
    const line = [...pa.reverse(), ...pb];
    const first = line[0] as number;
    const last = line[line.length - 1] as number;
    const horizontal =
      Math.abs(g.x(last) - g.x(first)) >= Math.abs(g.y(last) - g.y(first));
    const width = rng.int(cfg.rooms.gapWidth[0], cfg.rooms.gapWidth[1]);
    const side: ReadonlyArray<readonly [number, number]> = horizontal
      ? [
          [0, 1],
          [0, -1],
        ]
      : [
          [1, 0],
          [-1, 0],
        ];
    const cells = new Set<number>(line);
    for (const k of line) {
      for (let s = 0; s < width - 1; s++) {
        const [dx, dy] = side[s] ?? [0, 0];
        const x = g.x(k) + dx;
        const y = g.y(k) + dy;
        if (!g.inside(x, y)) continue;
        const m = g.idx(x, y);
        const r = st.room[m] ?? 0;
        if (r !== a && r !== b) continue;
        cells.add(m);
      }
    }
    for (const k of cells) {
      st.obstacle[k] = O.none;
      st.keepOpen[k] = 1;
    }
    const gap: GapInfo = {
      a,
      b,
      zone,
      cell: c.i,
      cells: [...cells].sort((p, q) => p - q),
      width,
    };
    st.gaps.push(gap);
    return true;
  }
  return false;
}

/** BFS (4-way) inside room `r` from `from` to the nearest open, roomy cell. */
function pathToOpen(
  st: GenState,
  r: number,
  from: number,
  maxLen: number,
): number[] | undefined {
  const { g } = st;
  const prev = new Map<number, number>([[from, -1]]);
  let frontier = [from];
  for (let step = 0; step <= maxLen; step++) {
    const next: number[] = [];
    for (const i of frontier) {
      if (isOpen(st, i) && roomy(st, i)) {
        const path: number[] = [];
        let k = i;
        while (k !== -1) {
          path.push(k);
          k = prev.get(k) ?? -1;
        }
        return path.reverse();
      }
      for (const j of g.around(i, N4)) {
        if (prev.has(j) || (st.room[j] ?? 0) !== r) continue;
        prev.set(j, i);
        next.push(j);
      }
    }
    frontier = next;
  }
  return undefined;
}

/** Most of a cell's neighbours are open: a good gap mouth. */
function roomy(st: GenState, i: number): boolean {
  let blocked = 0;
  for (const j of st.g.around(i, N8)) if (!isOpen(st, j)) blocked++;
  return blocked <= 3;
}
