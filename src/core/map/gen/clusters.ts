/**
 * Obstacles inside zones and the clean-up passes over all obstacles.
 *
 * Clusters are noise-thresholded blobs: from a seed cell they take the
 * connected cells of highest "blob score" (closeness to the seed in a
 * randomly stretched and turned ellipse, plus a noise field), so their
 * outlines are round and lumpy rather than grid-boxy; mountains stretch
 * east-west so they pack into ridges. A share of clusters are small groups
 * of one to three cells (lone peaks and trees within a budget).
 * Clean-up then fills diagonal-only joins, removes lone cells (beyond a small
 * budget of intentional lone peaks), folds single cells of one obstacle type
 * into the surrounding type, and fills or opens enclosed pockets so that all
 * open ground is reachable from the player's town.
 */
import { at, MinHeap, N4, N8, noiseField } from "./grid.ts";
import { O, T, isOpen, isWalkable, stageRng, stageSalt } from "./state.ts";
import type { GenState, PassInfo } from "./state.ts";
import { reachable } from "./paths.ts";

export function growClusters(st: GenState): void {
  const { g, cfg } = st;
  const cc = cfg.clusters;
  const rng = stageRng(st, "clusters");
  const towns = [st.townAt.start, st.townAt.enemy].filter((t) => t >= 0);
  const lumps = noiseField(g, cc.lumpScale, stageSalt(st, "cluster-lumps"), 2);
  let lonePeaks = 0;
  const free = (i: number, zone: number): boolean =>
    isOpen(st, i) &&
    at(st.zone, i) === zone &&
    at(st.keepOpen, i) === 0 &&
    at(st.occupied, i) === 0 &&
    towns.every((t) => g.cheb(t, i) > cc.townClearance + 1);

  for (const z of st.zones) {
    const interior: number[] = [];
    for (let i = 0; i < g.n; i++) if (free(i, z.id)) interior.push(i);
    const target = Math.round(rng.float(...cc.density) * interior.length);
    let placed = 0;
    let attempts = 0;
    while (placed < target && attempts < 400) {
      attempts++;
      const attach = rng.chance(cc.attachChance);
      let seed: number | undefined;
      let type: number = rng.chance(cc.mountainShare[z.main])
        ? O.mountain
        : O.forest;
      if (attach) {
        const s = rng.pick(interior);
        // Walk to an open cell beside an existing obstacle near s.
        const touching = g
          .around(s, N8)
          .concat([s])
          .filter(
            (i) =>
              free(i, z.id) &&
              g.around(i, N4).some((j) => at(st.obstacle, j) !== O.none),
          );
        if (touching.length === 0) continue;
        seed = rng.pick(touching);
        const host = g
          .around(seed, N4)
          .find((j) => at(st.obstacle, j) !== O.none);
        if (host !== undefined) type = at(st.obstacle, host);
      } else {
        // Best of a few candidates: the one farthest from other obstacles,
        // so clusters spread evenly instead of clumping.
        let bestD = -1;
        for (let k = 0; k < 6; k++) {
          const s = rng.pick(interior);
          if (!free(s, z.id)) continue;
          const d = obstacleDistance(st, s, 6);
          if (d > cc.gap && d > bestD) {
            bestD = d;
            seed = s;
          }
        }
        if (seed === undefined) continue;
      }
      const small = rng.chance(cc.smallShare);
      const size = small
        ? 1 + Math.floor(rng.next() * 3)
        : Math.round(
            cc.size[0] + (cc.size[1] - cc.size[0]) * Math.pow(rng.next(), 1.4),
          );
      const blob = grow(st, rng, seed, size, type, z.id, attach, free, lumps);
      if (blob.length === 1 && !attach) {
        if (lonePeaks >= cc.lonePeaks) continue;
        lonePeaks++;
      } else if (blob.length < 2) {
        continue;
      }
      for (const i of blob) st.obstacle[i] = type;
      placed += blob.length;
    }
  }
}

/** Chebyshev distance to the nearest obstacle or water, capped at `max`. */
function obstacleDistance(st: GenState, i: number, max: number): number {
  const { g } = st;
  for (let r = 0; r < max; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = g.x(i) + dx;
        const y = g.y(i) + dy;
        if (!g.inside(x, y)) continue;
        const j = g.idx(x, y);
        if (at(st.obstacle, j) !== O.none || at(st.terrain, j) === T.water) {
          return r;
        }
      }
    }
  }
  return max;
}

function grow(
  st: GenState,
  rng: ReturnType<typeof stageRng>,
  seed: number,
  size: number,
  type: number,
  zone: number,
  attached: boolean,
  free: (i: number, zone: number) => boolean,
  lumps: Float64Array,
): number[] {
  const { g, cfg } = st;
  const blob = new Set<number>([seed]);
  // The blob's ellipse: mountains stretched east-west (ridges), woods a
  // random lean; its noise: the stage's lump field plus a little jitter.
  const stretch =
    type === O.mountain
      ? cfg.clusters.ridgeBias * rng.float(0.7, 1.1)
      : rng.float(0.75, 1.6);
  const angle =
    type === O.mountain ? rng.float(-0.35, 0.35) : rng.float(0, Math.PI);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const radius = Math.sqrt(size / Math.PI) + 0.5;
  const sx = g.x(seed);
  const sy = g.y(seed);
  const score = (j: number): number => {
    const dx = g.x(j) - sx;
    const dy = g.y(j) - sy;
    const u = (dx * cos + dy * sin) / Math.sqrt(stretch);
    const v = (dy * cos - dx * sin) * Math.sqrt(stretch);
    return (
      1 -
      Math.hypot(u, v) / radius +
      cfg.clusters.lumpAmount * (at(lumps, j) - 0.5) * 2
    );
  };
  // Unattached clusters keep one free cell from other obstacles.
  const allowed = (i: number): boolean => {
    if (blob.has(i) || !free(i, zone)) return false;
    if (attached) return true;
    return g
      .around(i, N8)
      .every((j) => blob.has(j) || at(st.obstacle, j) === O.none);
  };
  const scores = new Map<number, number>();
  while (blob.size < size) {
    let best = -1;
    let bestScore = -Infinity;
    for (const i of blob) {
      for (const j of g.around(i, N4)) {
        if (!allowed(j)) continue;
        let value = scores.get(j);
        if (value === undefined) {
          value = score(j) + rng.float(-0.06, 0.06);
          scores.set(j, value);
        }
        if (value > bestScore || (value === bestScore && j < best)) {
          bestScore = value;
          best = j;
        }
      }
    }
    if (best < 0) break;
    blob.add(best);
  }
  return [...blob];
}

// ---------------------------------------------------------------------------
// Clean-up

/** Fill one open cell of every 2x2 block whose obstacles touch only at a corner. */
export function fixDiagonals(st: GenState): number {
  const { g } = st;
  let changed = 0;
  const fillable = (i: number): boolean =>
    isOpen(st, i) && at(st.keepOpen, i) === 0 && at(st.occupied, i) === 0;
  for (let y = 0; y + 1 < g.h; y++) {
    for (let x = 0; x + 1 < g.w; x++) {
      const a = g.idx(x, y);
      const b = g.idx(x + 1, y);
      const c = g.idx(x, y + 1);
      const d = g.idx(x + 1, y + 1);
      const ob = (i: number): boolean => at(st.obstacle, i) !== O.none;
      let pair: [number, number, number, number] | undefined;
      if (ob(a) && ob(d) && !ob(b) && !ob(c)) pair = [a, d, b, c];
      else if (ob(b) && ob(c) && !ob(a) && !ob(d)) pair = [b, c, a, d];
      if (!pair) continue;
      const [p, q, r, s] = pair;
      // Fill the open cell that sits under (south of) the pair first: it
      // makes a brick-friendly horizontal run.
      const order = g.y(r) > g.y(s) ? [r, s] : [s, r];
      const target = order.find(fillable);
      if (target === undefined) continue;
      const tp = at(st.obstacle, p);
      const tq = at(st.obstacle, q);
      st.obstacle[target] = tp === tq ? tp : O.mountain;
      changed++;
    }
  }
  return changed;
}

/**
 * Lone obstacle cells (no obstacle among their 8 neighbours) are removed,
 * except spine cells and up to `lonePeaks` lone peaks or trees. A cell whose obstacle
 * neighbours are all of the other type takes that type.
 */
export function fixLoneCells(st: GenState): void {
  const { g, cfg } = st;
  let peaks = 0;
  for (let i = 0; i < g.n; i++) {
    const t = at(st.obstacle, i);
    if (t === O.none) continue;
    let same = 0;
    let other = 0;
    for (const j of g.around(i, N8)) {
      const u = at(st.obstacle, j);
      if (u === t) same++;
      else if (u !== O.none) other++;
    }
    if (same > 0) continue;
    if (other > 0) {
      st.obstacle[i] = t === O.mountain ? O.forest : O.mountain;
      continue;
    }
    if (at(st.spine, i)) continue;
    if (peaks < cfg.clusters.lonePeaks) {
      peaks++;
      continue;
    }
    st.obstacle[i] = O.none;
  }
}

/**
 * Make every open land cell reachable from the player's town: small enclosed
 * pockets are filled with the surrounding obstacle, larger ones are opened by
 * carving the cheapest corridor to the reachable area. A corridor that has to
 * cross a zone border becomes a pass (and gets a guard later).
 */
export function resolvePockets(st: GenState): void {
  const { g, cfg } = st;
  for (let round = 0; round < 60; round++) {
    const reach = reachable(st, st.townAt.start);
    let pocketStart = -1;
    for (let i = 0; i < g.n; i++) {
      if (isWalkable(st, i) && !at(reach, i)) {
        pocketStart = i;
        break;
      }
    }
    if (pocketStart < 0) return;
    const pocket = reachable(st, pocketStart);
    const cells: number[] = [];
    let important = false;
    for (let i = 0; i < g.n; i++) {
      if (!at(pocket, i)) continue;
      cells.push(i);
      if (at(st.keepOpen, i) || at(st.occupied, i)) important = true;
    }
    if (cells.length <= cfg.clusters.pocketFill && !important) {
      for (const i of cells) st.obstacle[i] = surroundingType(st, i);
      continue;
    }
    openPocket(st, cells, reach);
  }
}

function surroundingType(st: GenState, i: number): number {
  let m = 0;
  let f = 0;
  for (const j of st.g.around(i, N8)) {
    const t = at(st.obstacle, j);
    if (t === O.mountain) m++;
    else if (t === O.forest) f++;
  }
  return m >= f && m > 0 ? O.mountain : f > 0 ? O.forest : O.mountain;
}

function openPocket(st: GenState, cells: number[], reach: Uint8Array): void {
  const { g } = st;
  const zone = at(st.zone, cells[0] ?? 0);
  const dist = new Float64Array(g.n).fill(Infinity);
  const prev = new Int32Array(g.n).fill(-1);
  const heap = new MinHeap();
  for (const i of cells) {
    dist[i] = 0;
    heap.push(0, i);
  }
  let goal = -1;
  while (heap.size > 0) {
    const { priority, value: i } = heap.pop();
    if (priority > at(dist, i)) continue;
    if (at(reach, i)) {
      goal = i;
      break;
    }
    for (const j of g.around(i, N4)) {
      if (at(st.objBlocked, j)) continue;
      let step = 0.01;
      if (at(st.terrain, j) === T.water) step = 30;
      else if (at(st.spine, j)) step = 40;
      else if (at(st.obstacle, j) !== O.none) step = 1;
      if (at(st.zone, j) !== zone) step += 3;
      const d = priority + step;
      if (d < at(dist, j)) {
        dist[j] = d;
        prev[j] = i;
        heap.push(d, j);
      }
    }
  }
  if (goal < 0) {
    // Nothing reachable at all: give up by filling the pocket.
    for (const i of cells) st.obstacle[i] = surroundingType(st, i);
    return;
  }
  const path: number[] = [];
  for (let k = goal; k >= 0; k = at(prev, k)) path.push(k);
  let crossing = -1;
  for (let k = 0; k < path.length; k++) {
    const i = path[k] as number;
    if (at(st.terrain, i) === T.water) {
      const z = st.zones[at(st.zone, i)];
      st.terrain[i] = z ? T[z.main] : T.grass;
    }
    st.obstacle[i] = O.none;
    if (at(st.spine, i)) {
      st.spine[i] = 0;
      crossing = i;
    }
    st.keepOpen[i] = 1;
  }
  if (crossing >= 0) {
    // The corridor crosses a zone border: guard it like a pass.
    const zones = [...new Set(path.map((i) => at(st.zone, i)))];
    const pass: PassInfo = {
      a: zones[0] ?? 0,
      b: zones[1] ?? zones[0] ?? 0,
      cell: crossing,
      cells: [...path].sort((p, q) => p - q),
      width: 1,
    };
    st.passes.push(pass);
  }
}
