/**
 * Obstacles inside zones and the clean-up passes over all obstacles.
 *
 * Clusters are noise-thresholded blobs: from a seed cell they take the
 * connected cells of highest "blob score" (closeness to the seed in a
 * randomly stretched and turned ellipse, plus a noise field), so their
 * outlines are round and lumpy rather than grid-boxy; mountains stretch
 * east-west so they pack into ridges. A share of clusters are small groups
 * of one to three cells (lone trees within a budget; a small mountain is a
 * 2x2 hill, the smallest mountain there is).
 * Clean-up then fills diagonal-only joins, removes lone cells (beyond a small
 * budget of intentional lone peaks), folds single cells of one obstacle type
 * into the surrounding type, and fills or opens enclosed pockets so that all
 * open ground is reachable from the player's town.
 */
import { hashInts } from "../../rng.ts";
import { at, components, MinHeap, N4, N8, noiseField } from "./grid.ts";
import {
  O,
  T,
  corridorMask,
  homeCell,
  isOpen,
  isWalkable,
  stageRng,
  stageSalt,
  townCells,
} from "./state.ts";
import type { GenState, PassInfo } from "./state.ts";
import { reachable } from "./paths.ts";

export function growClusters(st: GenState): void {
  const { g, cfg } = st;
  const cc = cfg.clusters;
  const rng = stageRng(st, "clusters");
  const towns = townCells(st);
  const lumps = noiseField(g, cc.lumpScale, stageSalt(st, "cluster-lumps"), 2);
  let lonePeaks = 0;
  const free = (i: number, zone: number): boolean =>
    isOpen(st, i) &&
    (st.zone[i] ?? 0) === zone &&
    (st.keepOpen[i] ?? 0) === 0 &&
    (st.occupied[i] ?? 0) === 0 &&
    towns.every((t) => g.cheb(t, i) > cc.townClearance + 1);

  for (const z of st.zones) {
    const interior: number[] = [];
    for (let i = 0; i < g.n; i++) if (free(i, z.id)) interior.push(i);
    const share =
      z.role === "start" && cc.startDensity !== undefined
        ? cc.startDensity
        : cc.density;
    const target = Math.round(rng.float(...share) * interior.length);
    let placed = 0;
    let attempts = 0;
    while (placed < target && attempts < 400) {
      attempts++;
      const shape =
        z.role === "start" && cc.startShape !== undefined ? cc.startShape : cc;
      const attach = rng.chance(shape.attachChance);
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
              g.around(i, N4).some((j) => (st.obstacle[j] ?? 0) !== O.none),
          );
        if (touching.length === 0) continue;
        seed = rng.pick(touching);
        const host = g
          .around(seed, N4)
          .find((j) => (st.obstacle[j] ?? 0) !== O.none);
        if (host !== undefined) type = st.obstacle[host] ?? 0;
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
      const small = rng.chance(shape.smallShare);
      // A deep block: big and round, so the range has an interior.
      const deep =
        type === O.mountain &&
        !small &&
        cc.deep.share[z.main] > 0 &&
        rng.chance(cc.deep.share[z.main]);
      const drawn = deep
        ? rng.int(cc.deep.size[0], cc.deep.size[1])
        : small
          ? 1 + Math.floor(rng.next() * 3)
          : Math.round(
              shape.size[0] +
                (shape.size[1] - shape.size[0]) * Math.pow(rng.next(), 1.4),
            );
      // The smallest mountain is a 2x2 hill (squareMountains squares it).
      const size = type === O.mountain ? Math.max(4, drawn) : drawn;
      const blob = grow(
        st,
        rng,
        seed,
        size,
        type,
        z.id,
        attach,
        free,
        lumps,
        deep ? cc.deep.stretch : undefined,
      );
      if (blob.length === 1 && !attach) {
        if (type === O.mountain || lonePeaks >= cc.lonePeaks) continue;
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
        if (
          (st.obstacle[j] ?? 0) !== O.none ||
          (st.terrain[j] ?? 0) === T.water
        ) {
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
  stretchOf?: number,
): number[] {
  const { g, cfg } = st;
  const blob = new Set<number>([seed]);
  // The blob's ellipse: mountains stretched east-west (ridges), woods a
  // random lean; its noise: the stage's lump field plus a little jitter.
  const stretch =
    type === O.mountain
      ? (stretchOf ?? cfg.clusters.ridgeBias) * rng.float(0.7, 1.1)
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
      cfg.clusters.lumpAmount * ((lumps[j] ?? 0) - 0.5) * 2
    );
  };
  // Unattached clusters keep one free cell from other obstacles.
  const allowed = (i: number): boolean => {
    if (blob.has(i) || !free(i, zone)) return false;
    if (attached) return true;
    return g
      .around(i, N8)
      .every((j) => blob.has(j) || (st.obstacle[j] ?? 0) === O.none);
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
    isOpen(st, i) && (st.keepOpen[i] ?? 0) === 0 && (st.occupied[i] ?? 0) === 0;
  for (let y = 0; y + 1 < g.h; y++) {
    for (let x = 0; x + 1 < g.w; x++) {
      const a = g.idx(x, y);
      const b = g.idx(x + 1, y);
      const c = g.idx(x, y + 1);
      const d = g.idx(x + 1, y + 1);
      const ob = (i: number): boolean => (st.obstacle[i] ?? 0) !== O.none;
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
      const tp = st.obstacle[p] ?? 0;
      const tq = st.obstacle[q] ?? 0;
      st.obstacle[target] = tp === tq ? tp : O.mountain;
      changed++;
    }
  }
  return changed;
}

/**
 * Lone obstacle cells (no obstacle among their 8 neighbours) are removed,
 * except spine cells and up to `lonePeaks` lone trees. A cell whose obstacle
 * neighbours are all of the other type takes that type.
 */
export function fixLoneCells(st: GenState): void {
  const { g, cfg } = st;
  let peaks = 0;
  for (let i = 0; i < g.n; i++) {
    const t = st.obstacle[i] ?? 0;
    if (t === O.none) continue;
    let same = 0;
    let other = 0;
    for (const j of g.around(i, N8)) {
      const u = st.obstacle[j] ?? 0;
      if (u === t) same++;
      else if (u !== O.none) other++;
    }
    if (same > 0) continue;
    if (other > 0) {
      st.obstacle[i] = t === O.mountain ? O.forest : O.mountain;
      continue;
    }
    if (st.spine[i] ?? 0) continue;
    // Lone trees only: the smallest mountain is a 2x2 block.
    if (t === O.forest && peaks < cfg.clusters.lonePeaks) {
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
    const reach = reachable(st, homeCell(st));
    let pocketStart = -1;
    for (let i = 0; i < g.n; i++) {
      if (isWalkable(st, i) && !(reach[i] ?? 0)) {
        pocketStart = i;
        break;
      }
    }
    if (pocketStart < 0) {
      if (st.seaPass !== undefined) islandPockets(st);
      return;
    }
    const pocket = reachable(st, pocketStart);
    const cells: number[] = [];
    let important = false;
    for (let i = 0; i < g.n; i++) {
      if (!(pocket[i] ?? 0)) continue;
      cells.push(i);
      if ((st.keepOpen[i] ?? 0) || (st.occupied[i] ?? 0)) important = true;
    }
    if (cells.length <= cfg.clusters.pocketFill && !important) {
      for (const i of cells) st.obstacle[i] = surroundingType(st, i);
      continue;
    }
    openPocket(st, cells, reach);
  }
}

/**
 * Inland Sea and Islands (bead bzc.155): on every island the open ground is
 * one piece on foot, so a start reaches its own island's things by land
 * (a ship is for the other islands). The smaller pieces of an island are
 * filled or opened towards its largest piece, as pockets are.
 */
function islandPockets(st: GenState): void {
  const { g, cfg } = st;
  const sea = st.seaPass;
  st.seaPass = undefined;
  try {
    for (let round = 0; round < 60; round++) {
      const islands = components(g, (i) => st.terrain[i] !== T.water, 4);
      const label = new Int32Array(g.n).fill(-1);
      const pieces: number[][] = [];
      for (let s = 0; s < g.n; s++) {
        if (label[s] !== -1 || !isWalkable(st, s)) continue;
        const r = reachable(st, s);
        const cells: number[] = [];
        for (let i = 0; i < g.n; i++) {
          if (r[i] === 1) {
            label[i] = pieces.length;
            cells.push(i);
          }
        }
        pieces.push(cells);
      }
      // The largest piece of each island is its main ground.
      const main = new Map<number, number>();
      pieces.forEach((cells, k) => {
        const island = islands.label[cells[0] ?? 0] ?? -1;
        const best = main.get(island);
        if (best === undefined || cells.length > (pieces[best]?.length ?? 0))
          main.set(island, k);
      });
      const k = pieces.findIndex(
        (cells, p) => main.get(islands.label[cells[0] ?? 0] ?? -1) !== p,
      );
      if (k < 0) return;
      const cells = pieces[k] ?? [];
      const important = cells.some(
        (i) => (st.keepOpen[i] ?? 0) === 1 || (st.occupied[i] ?? 0) === 1,
      );
      if (cells.length <= cfg.clusters.pocketFill && !important) {
        for (const i of cells) st.obstacle[i] = surroundingType(st, i);
        continue;
      }
      const island = islands.label[cells[0] ?? 0] ?? -1;
      const goal = new Uint8Array(g.n);
      for (const i of pieces[main.get(island) ?? -1] ?? []) goal[i] = 1;
      openPocket(st, cells, goal);
    }
  } finally {
    st.seaPass = sea;
  }
}

function surroundingType(st: GenState, i: number): number {
  let m = 0;
  let f = 0;
  for (const j of st.g.around(i, N8)) {
    const t = st.obstacle[j] ?? 0;
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
  const salt = stageSalt(st, "pocket-cut");
  for (const i of cells) {
    dist[i] = 0;
    heap.push(0, i);
  }
  let goal = -1;
  while (heap.size > 0) {
    const { priority, value: i } = heap.pop();
    if (priority > (dist[i] ?? 0)) continue;
    // A pocket joins land (a naval map's reach includes the sea it sails).
    if ((reach[i] ?? 0) && (st.terrain[i] ?? 0) !== T.water) {
      goal = i;
      break;
    }
    for (const j of g.around(i, N4)) {
      if (st.objBlocked[j] ?? 0) continue;
      let step = 0.01;
      if ((st.terrain[j] ?? 0) === T.water) step = 30;
      else if (st.spine[j] ?? 0) step = 40;
      else if ((st.obstacle[j] ?? 0) !== O.none) {
        // Through rock or wood: a little noise so the cut wanders, and
        // dearer along the map edge, where a cut would run dead straight.
        const x = g.x(j);
        const y = g.y(j);
        const edge = Math.min(x, y, g.w - 1 - x, g.h - 1 - y);
        step = 1 + (hashInts(j, salt) % 1000) / 1600 + (edge < 3 ? 1.5 : 0);
      }
      if ((st.zone[j] ?? 0) !== zone) step += 3;
      const d = priority + step;
      if (d < (dist[j] ?? 0)) {
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
  for (let k = goal; k >= 0; k = prev[k] ?? 0) path.push(k);
  let crossing = -1;
  for (let k = 0; k < path.length; k++) {
    const i = path[k] as number;
    if ((st.terrain[i] ?? 0) === T.water) {
      const z = st.zones[st.zone[i] ?? 0];
      st.terrain[i] = z ? T[z.main] : T.grass;
    }
    st.obstacle[i] = O.none;
    if (st.spine[i] ?? 0) {
      st.spine[i] = 0;
      crossing = i;
    }
    st.keepOpen[i] = 1;
  }
  if (crossing >= 0) {
    // The corridor crosses a zone border: guard it like a pass.
    const zones = [...new Set(path.map((i) => st.zone[i] ?? 0))];
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

// ---------------------------------------------------------------------------
// The smallest mountain is 2x2 (user decision, bead xaj.20)

/** Whether cell (x, y) lies in an all-mountain 2x2 window. */
export function inMountainBlock(st: GenState, i: number): boolean {
  const { g } = st;
  const x = g.x(i);
  const y = g.y(i);
  const m = (cx: number, cy: number): boolean =>
    g.inside(cx, cy) && at(st.obstacle, g.idx(cx, cy)) === O.mountain;
  for (const [ox, oy] of BLOCK_CORNERS) {
    const x0 = x + ox;
    const y0 = y + oy;
    if (m(x0, y0) && m(x0 + 1, y0) && m(x0, y0 + 1) && m(x0 + 1, y0 + 1)) {
      return true;
    }
  }
  return false;
}

/** North-west corners, relative to a cell, of the four 2x2 windows holding it. */
const BLOCK_CORNERS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [0, -1],
  [-1, 0],
  [0, 0],
];

/**
 * Every mountain cell ends up in at least one all-mountain 2x2 window, so
 * the renderer can build every range from 2x2-and-larger pieces.
 *
 * A violating cell grows into the cheapest 2x2 window round it: forest cells
 * turn to rock for free (both block movement, so the seal and reachability
 * are unchanged), open cells (never a pass corridor or a town's yard) cost
 * more and are taken only when `growOpen`
 * (they may close a pocket; the caller resolves pockets afterwards). A cell
 * that cannot grow is removed: it becomes forest when it seals a zone
 * border, touches forest, or would open as an unreachable pocket, else open
 * ground. Removing a violator never breaks another cell's block, and growth
 * only adds whole blocks, so one pass leaves no violator. Returns the number
 * of cells changed.
 */
export function squareMountains(st: GenState, growOpen: boolean): number {
  const { g, cfg } = st;
  const towns = townCells(st);
  const reach = growOpen ? undefined : reachable(st, homeCell(st));
  const rng = stageRng(st, growOpen ? "square-grow" : "square-trim");
  let changed = 0;
  // Pass corridors and town yards stay open; a pass mouth's clearance may
  // take rock to square a range's end (pockets are resolved afterwards).
  const corridor = corridorMask(st);
  const growable = (j: number): boolean =>
    growOpen &&
    isOpen(st, j) &&
    (corridor[j] ?? 0) === 0 &&
    (st.occupied[j] ?? 0) === 0 &&
    (st.objBlocked[j] ?? 0) === 0 &&
    towns.every(
      (t) =>
        g.cheb(t, j) > cfg.clusters.townClearance + 2 ||
        ((st.keepOpen[j] ?? 0) === 0 &&
          g.cheb(t, j) > cfg.clusters.townClearance),
    );
  for (let i = 0; i < g.n; i++) {
    if ((st.obstacle[i] ?? 0) !== O.mountain || inMountainBlock(st, i))
      continue;
    const x = g.x(i);
    const y = g.y(i);
    let best: number[] | undefined;
    let bestCost = Infinity;
    for (const [ox, oy] of BLOCK_CORNERS) {
      const x0 = x + ox;
      const y0 = y + oy;
      if (!g.inside(x0, y0) || !g.inside(x0 + 1, y0 + 1)) continue;
      const cells = [
        g.idx(x0, y0),
        g.idx(x0 + 1, y0),
        g.idx(x0, y0 + 1),
        g.idx(x0 + 1, y0 + 1),
      ];
      let cost = rng.float(0, 0.5);
      for (const j of cells) {
        const ob = st.obstacle[j] ?? 0;
        if (ob === O.mountain) continue;
        if (ob === O.forest) cost += 1;
        else if (growable(j)) cost += 3;
        else cost = Infinity;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = cells;
      }
    }
    if (best) {
      for (const j of best) {
        if ((st.obstacle[j] ?? 0) !== O.mountain) {
          st.obstacle[j] = O.mountain;
          changed++;
        }
      }
      continue;
    }
    const opens =
      !seals(st, i) &&
      !g.around(i, N8).some((j) => (st.obstacle[j] ?? 0) === O.forest) &&
      (reach === undefined ||
        g.around(i, N4).some((j) => (reach[j] ?? 0) === 1));
    st.obstacle[i] = opens ? O.none : O.forest;
    changed++;
  }
  if (reach) changed += tidyStrayTrees(st, reach);
  return changed;
}

/** A spine cell with open ground of another zone beside it holds the seal. */
function seals(st: GenState, i: number): boolean {
  if (!(st.spine[i] ?? 0)) return false;
  const zone = st.zone[i] ?? 0;
  return st.g
    .around(i, N8)
    .some((j) => (st.zone[j] ?? 0) !== zone && isOpen(st, j));
}

/**
 * A forest cell left with no forest round it (its neighbours turned to rock)
 * joins the rock when that completes a 2x2 block, or opens when it is not a
 * seal and borders reachable ground; otherwise it stays a lone tree.
 */
function tidyStrayTrees(st: GenState, reach: Uint8Array): number {
  const { g } = st;
  let changed = 0;
  for (let i = 0; i < g.n; i++) {
    if ((st.obstacle[i] ?? 0) !== O.forest) continue;
    const near = g.around(i, N8);
    if (near.some((j) => (st.obstacle[j] ?? 0) === O.forest)) continue;
    if (!near.some((j) => (st.obstacle[j] ?? 0) === O.mountain)) continue;
    st.obstacle[i] = O.mountain;
    if (inMountainBlock(st, i)) {
      changed++;
      continue;
    }
    const opens =
      !seals(st, i) && g.around(i, N4).some((j) => (reach[j] ?? 0) === 1);
    st.obstacle[i] = opens ? O.none : O.forest;
    if (opens) changed++;
  }
  return changed;
}
