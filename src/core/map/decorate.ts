/**
 * Decorations on a finished map (bead bzc.72): purely decorative pieces of
 * the catalogue in src/data/decorations.ts, placed last, after every
 * object, so they never change what the generator or a named map's edits
 * decided.
 *
 * - Passable decorations (a butterfly, a molehill) are scattered sparsely
 *   by ground in small clusters of one to three, a few per screen: never on
 *   a road, an object, beside a pickup or artifact (no loot look-alikes),
 *   in a town's yard or in a pass or gap corridor.
 * - Impassable props (a boulder, a fallen log), a couple per screen, come
 *   two ways:
 *   1. At a forest's edge, in place of an edge tree facing open ground to
 *      the south: a wall stays a wall, so movement is exactly as before.
 *   2. On open ground, mostly against forest and mountain edges and in
 *      nooks: off the roads, the pass and gap corridors, every object's
 *      approach (two cells from any entrance, so out of every guard's zone
 *      of control too) and the town yards; never leaving a way less than
 *      two cells across, and the open cells round it stay joined close by
 *      (without entrances or zones of control), so it cuts nothing off and
 *      costs at most a short step round it.
 *   A prop's cells get {@link MapCell.prop} and block movement like a
 *   forest (also on the Green Road).
 *
 * A pure function of the map and its seed: the same map decorates the same
 * way, byte for byte. The decorations are part of the map, so a saved game
 * keeps them.
 */
import {
  decorationKindsFor,
  type DecorationKind,
} from "../../data/decorations.ts";
import { createRng, deriveSeed } from "../rng.ts";
import type { Rng } from "../rng.ts";
import {
  DIRECTIONS_8,
  objectCells,
  type GameMap,
  type MapDecoration,
} from "./types.ts";

/** Tunables of the placer (shares are of the open land cells). */
export const DECORATE = {
  /** Passable decorations per open land cell (a few per screen). */
  passableShare: 0.07,
  /** Cluster sizes 1, 2, 3 and their weights. */
  clusterWeights: [5, 4, 2],
  /** Cells between two clusters' first pieces (Chebyshev). */
  clusterSpacing: 3,
  /** Props per open land cell (a couple per screen), both ways. */
  propShare: 0.026,
  /** Of those, the share that stands on open ground (the rest: edges). */
  groundShare: 0.5,
  /** Share of the props that try a two-cell kind first. */
  wideShare: 0.35,
  /** Share of the open-ground props that may stand off any edge. */
  openShare: 0.35,
  /** Cells between two props (Chebyshev, cell to cell). */
  propSpacing: 3,
  /**
   * A prop keeps this far from every object's entrance (Chebyshev): off
   * its approach, and out of every guard's zone of control.
   */
  entranceGap: 2,
  /** And this far from a town's entrance (its yard). */
  townGap: 3,
  /** A passable decoration keeps this far from a pickup or artifact. */
  lootGap: 2,
  /** And this far from a town's entrance. */
  townYard: 2,
  /** Open run across an open-ground prop, both sides together, per axis. */
  minRun: 2,
  /**
   * Most extra cost (straight step 100) of going round an open-ground
   * prop instead of through its cells, between any two cells beside it.
   */
  maxDetour: 100,
} as const;

export interface DecorateOptions {
  /**
   * Row-major cells of the pass and gap corridors (the generator's): kept
   * free of every decoration, and their neighbours free of props.
   */
  corridors?: Iterable<number>;
}

/**
 * Places the decorations of `map` in place: sets `map.decorations` and
 * marks the props' cells (an edge tree a prop replaces loses its forest).
 * Call it once, on a map without decorations.
 */
export function decorateMap(map: GameMap, options: DecorateOptions = {}): void {
  const { width: W, height: H } = map;
  const n = W * H;
  const rng = createRng(deriveSeed(map.seed, "decorations"));
  const cell = (i: number) => map.cells[i];

  // What the map already holds.
  const objectCell = new Uint8Array(n);
  const entrances: number[] = [];
  const loot: number[] = [];
  const towns: number[] = [];
  const monsters: number[] = [];
  for (const o of map.objects) {
    for (const [x, y] of objectCells(o))
      if (x >= 0 && y >= 0 && x < W && y < H) objectCell[y * W + x] = 1;
    const e = o.y * W + o.x;
    entrances.push(e);
    // A waystone's exit is a cell where heroes appear: like an entrance.
    const exit = o.data["exit"];
    if (
      Array.isArray(exit) &&
      typeof exit[0] === "number" &&
      typeof exit[1] === "number" &&
      exit[0] >= 0 &&
      exit[1] >= 0 &&
      exit[0] < W &&
      exit[1] < H
    ) {
      objectCell[exit[1] * W + exit[0]] = 1;
      entrances.push(exit[1] * W + exit[0]);
    }
    if (o.kind === "pickup" || o.kind === "artifact") loot.push(e);
    if (o.kind === "town") towns.push(e);
    if (o.kind === "monster") monsters.push(e);
  }
  const objectList: number[] = [];
  const roads: number[] = [];
  for (let i = 0; i < n; i++) {
    if (objectCell[i] === 1) objectList.push(i);
    if (cell(i)?.road === true) roads.push(i);
  }
  const corridor = new Uint8Array(n);
  const corridorList: number[] = [];
  for (const i of options.corridors ?? [])
    if (i >= 0 && i < n && corridor[i] === 0) {
      corridor[i] = 1;
      corridorList.push(i);
    }

  const cap = 6;
  const nearObject = chebyshevField(W, H, objectList, cap);
  const nearEntrance = chebyshevField(W, H, entrances, cap);
  const nearLoot = chebyshevField(W, H, loot, cap);
  const nearTown = chebyshevField(W, H, towns, cap);
  const nearRoad = chebyshevField(W, H, roads, cap);
  const nearCorridor = chebyshevField(W, H, corridorList, cap);
  const nearMonster = chebyshevField(W, H, monsters, cap);

  const land = (i: number): boolean => {
    const c = cell(i);
    return c !== undefined && c.terrain !== "water" && c.obstacle === "none";
  };
  /** A hero could stand here (ignoring heroes): no wall, prop or object. */
  const walk = (i: number): boolean =>
    land(i) && cell(i)?.prop !== true && objectCell[i] === 0;
  /**
   * A hero walks through freely: also no entrance (a visit stops him) and
   * no guard's zone of control. A prop's way round uses only these.
   */
  const through = (i: number): boolean =>
    walk(i) && at(nearEntrance, i) >= 1 && at(nearMonster, i) >= 2;
  let open = 0;
  for (let i = 0; i < n; i++) if (walk(i)) open++;

  const placed: MapDecoration[] = [];
  const propCells: number[] = [];
  const spaced = (i: number): boolean =>
    propCells.every((j) => cheb(W, i, j) >= DECORATE.propSpacing);
  /** Forest and rock round the footprint (the map edge does not count). */
  const edgeScore = (foot: readonly number[]): number => {
    let s = 0;
    for (const f of foot) {
      for (const [dx, dy] of DIRECTIONS_8) {
        const x = (f % W) + dx;
        const y = Math.floor(f / W) + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const j = y * W + x;
        if (foot.includes(j)) continue;
        if (cell(j)?.obstacle !== "none") s++;
      }
    }
    return s;
  };
  /** The kinds of `cols` cells that suit every ground of the footprint. */
  const kindsFor = (foot: readonly number[]): DecorationKind[] => {
    const first = cell(foot[0] ?? -1)?.terrain;
    if (first === undefined) return [];
    return decorationKindsFor(first, false).filter(
      (k) =>
        k.cols === foot.length &&
        foot.every((f) => {
          const t = cell(f)?.terrain;
          return (
            t !== undefined && (k.terrains as readonly string[]).includes(t)
          );
        }),
    );
  };
  /** A footprint of `cols` cells east from `i` on one row, or null. */
  const footAt = (i: number, cols: number): number[] | null =>
    (i % W) + cols > W ? null : range(cols).map((d) => i + d);
  const addProp = (foot: readonly number[], kind: DecorationKind): void => {
    for (const f of foot) {
      const c = cell(f);
      if (c === undefined) continue;
      c.obstacle = "none";
      c.prop = true;
      propCells.push(f);
    }
    const i = foot[0] ?? 0;
    placed.push({
      id: kind.id,
      x: i % W,
      y: Math.floor(i / W),
      variant: rng.int(0, kind.looks - 1),
    });
  };
  const targetProps = Math.round(open * DECORATE.propShare);
  const targetGround = Math.round(targetProps * DECORATE.groundShare);

  // ------------------------------------------------ props on open ground
  const groundOk = (i: number): boolean =>
    walk(i) &&
    cell(i)?.road !== true &&
    at(nearEntrance, i) >= DECORATE.entranceGap &&
    at(nearTown, i) >= DECORATE.townGap &&
    at(nearCorridor, i) >= 2 &&
    spaced(i);
  // Cells with more walls round them first (edges and nooks), loosely, so
  // the open ground gets its few props last; beside a road or an object
  // later too (room to breathe round the things that matter).
  const ground = range(n)
    .filter((i) => groundOk(i))
    .map((i) => {
      const edge = edgeScore([i]);
      const crowded =
        (at(nearRoad, i) < 2 ? 1.5 : 0) + (at(nearObject, i) < 2 ? 1 : 0);
      return { i, edge, key: Math.min(edge, 4) - crowded + rng.float(0, 3) };
    })
    .sort((a, b) => b.key - a.key || a.i - b.i);
  let onGround = 0;
  let inOpen = 0;
  const openCap = Math.ceil(targetGround * DECORATE.openShare);
  /** Open-ground props until `limit` of them stand. */
  const groundPass = (limit: number): void => {
    for (const { i, edge } of ground) {
      if (onGround >= limit) break;
      if (edge === 0 && inOpen >= openCap) continue;
      const wide = rng.chance(DECORATE.wideShare);
      for (const cols of wide ? [2, 1] : [1]) {
        const foot = footAt(i, cols);
        if (foot === null || !foot.every((f) => groundOk(f))) continue;
        const kinds = kindsFor(foot);
        if (kinds.length === 0) continue;
        // Nothing cut off (every open cell round it still joined), and no
        // way round it through a visit or a zone of control.
        if (
          !narrowOk(map, foot, walk) ||
          !keepsJoined(map, foot, walk) ||
          !keepsJoined(map, foot, through) ||
          !detourOk(map, foot, walk)
        )
          continue;
        addProp(foot, varied(rng, kinds, placed, i, W));
        onGround++;
        if (edgeScore(foot) === 0) inOpen++;
        break;
      }
    }
  };
  groundPass(targetGround);

  // ----------------------------------------- props in place of edge trees
  // A forest cell with open ground to its south (so the prop stands in
  // front of the trees, not hidden behind the next row), keeping most of
  // its wood: two or more forest cells beside it, so no tree is left alone.
  const forest = (i: number): boolean => {
    const c = cell(i);
    return c !== undefined && c.terrain !== "water" && c.obstacle === "forest";
  };
  const woods = (i: number): number => {
    let k = 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const x = (i % W) + dx;
      const y = Math.floor(i / W) + dy;
      if (x >= 0 && y >= 0 && x < W && y < H && forest(y * W + x)) k++;
    }
    return k;
  };
  const edgeOk = (i: number): boolean =>
    forest(i) &&
    i + W < n &&
    walk(i + W) &&
    at(nearEntrance, i) >= DECORATE.entranceGap &&
    at(nearTown, i) >= DECORATE.townGap &&
    at(nearCorridor, i) >= 1 &&
    woods(i) >= 2 &&
    spaced(i);
  const edges = rng.shuffle(range(n).filter((i) => edgeOk(i)));
  let onEdge = 0;
  const targetEdge = targetProps - onGround;
  // The long ones (a fallen log along the wood) first, then single cells.
  const wideTarget = Math.round(targetEdge * DECORATE.wideShare);
  for (const cols of [2, 1]) {
    for (const i of edges) {
      if (onEdge >= (cols === 2 ? wideTarget : targetEdge)) break;
      const foot = footAt(i, cols);
      if (foot === null || !foot.every((f) => edgeOk(f))) continue;
      if (!keepsShape(map, foot)) continue;
      const kinds = kindsFor(foot);
      if (kinds.length === 0) continue;
      addProp(foot, varied(rng, kinds, placed, i, W));
      onEdge++;
    }
  }
  // Few woods (a land of rock): more on the open ground instead.
  groundPass(targetProps - onEdge);

  // ------------------------------------------------- passable decorations
  const smallOk = (i: number): boolean =>
    walk(i) &&
    cell(i)?.road !== true &&
    at(nearLoot, i) >= DECORATE.lootGap &&
    at(nearTown, i) >= DECORATE.townYard &&
    corridor[i] === 0;
  const taken = new Uint8Array(n);
  const seeds: number[] = [];
  const targetSmall = Math.round(open * DECORATE.passableShare);
  let small = 0;
  for (const i of rng.shuffle(range(n).filter((k) => smallOk(k)))) {
    if (small >= targetSmall) break;
    if (seeds.some((s) => cheb(W, i, s) < DECORATE.clusterSpacing)) continue;
    const terrain = cell(i)?.terrain;
    if (terrain === undefined) continue;
    const kinds = decorationKindsFor(terrain, true);
    if (kinds.length === 0) continue;
    seeds.push(i);
    const size = rng.weighted([1, 2, 3], [...DECORATE.clusterWeights]);
    // A cluster is one kind (two snails) or a little mix of the ground's.
    const same = rng.chance(0.5) ? rng.pick(kinds) : null;
    const members = [i];
    const near: number[] = [];
    for (const [dx, dy] of DIRECTIONS_8) {
      const x = (i % W) + dx;
      const y = Math.floor(i / W) + dy;
      if (x >= 0 && y >= 0 && x < W && y < H) near.push(y * W + x);
    }
    for (const j of rng.shuffle(near)) {
      if (members.length >= size) break;
      if (taken[j] === 1 || !smallOk(j) || cell(j)?.terrain !== terrain)
        continue;
      members.push(j);
    }
    for (const j of members) {
      if (taken[j] === 1) continue;
      taken[j] = 1;
      const kind = same ?? rng.pick(kinds);
      placed.push({
        id: kind.id,
        x: j % W,
        y: Math.floor(j / W),
        variant: rng.int(0, kind.looks - 1),
      });
      small++;
    }
  }

  placed.sort((a, b) => a.y - b.y || a.x - b.x);
  map.decorations = placed;
}

// ---------------------------------------------------------------- helpers

function at(field: Uint8Array, i: number): number {
  return field[i] ?? 0;
}

function range(k: number): number[] {
  return Array.from({ length: k }, (_, i) => i);
}

function cheb(W: number, a: number, b: number): number {
  return Math.max(
    Math.abs((a % W) - (b % W)),
    Math.abs(Math.floor(a / W) - Math.floor(b / W)),
  );
}

/**
 * Chebyshev distance from each cell to the nearest source, capped at
 * `cap` (no sources: every cell is `cap` away).
 */
function chebyshevField(
  W: number,
  H: number,
  sources: readonly number[],
  cap: number,
): Uint8Array {
  const out = new Uint8Array(W * H).fill(cap);
  for (const s of sources) {
    const sx = s % W;
    const sy = Math.floor(s / W);
    for (let dy = -cap + 1; dy < cap; dy++) {
      const y = sy + dy;
      if (y < 0 || y >= H) continue;
      for (let dx = -cap + 1; dx < cap; dx++) {
        const x = sx + dx;
        if (x < 0 || x >= W) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const j = y * W + x;
        if (d < (out[j] ?? cap)) out[j] = d;
      }
    }
  }
  return out;
}

/**
 * A kind for a prop at `i`, preferring one not already standing close by
 * (the same boulder twice in one screen reads as a stamp).
 */
function varied(
  rng: Rng,
  kinds: readonly DecorationKind[],
  placed: readonly MapDecoration[],
  i: number,
  W: number,
): DecorationKind {
  const x = i % W;
  const y = Math.floor(i / W);
  const near = new Set(
    placed
      .filter((d) => Math.max(Math.abs(d.x - x), Math.abs(d.y - y)) <= 10)
      .map((d) => d.id),
  );
  const fresh = kinds.filter((k) => !near.has(k.id));
  return rng.pick(fresh.length > 0 ? fresh : kinds);
}

/**
 * The open run across the footprint along every axis (row, column and both
 * diagonals): the walkable cells beyond it on both sides together, up to
 * `minRun`, must reach `minRun`, unless it is walled on both sides (a nook,
 * judged by {@link keepsJoined}). So a prop never narrows a way to one or
 * two cells across.
 */
function narrowOk(
  map: GameMap,
  foot: readonly number[],
  walk: (i: number) => boolean,
): boolean {
  const W = map.width;
  const need = DECORATE.minRun;
  const run = (from: number, dx: number, dy: number): number => {
    let x = from % W;
    let y = Math.floor(from / W);
    let k = 0;
    for (;;) {
      x += dx;
      y += dy;
      if (x < 0 || y < 0 || x >= W || y >= map.height) return k;
      const j = y * W + x;
      if (foot.includes(j)) continue;
      if (!walk(j)) return k;
      k++;
      if (k >= need) return k;
    }
  };
  for (const f of foot) {
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ] as const) {
      const total = run(f, dx, dy) + run(f, -dx, -dy);
      if (total !== 0 && total < need) return false;
    }
  }
  return true;
}

/**
 * Whether taking the trees off the footprint keeps the wood's outline as
 * the generator made it: no obstacle left joined to the rest by a corner
 * only, and every obstacle beside the footprint keeps two or more
 * obstacle neighbours, one of its own kind (no lone tree or peak).
 */
function keepsShape(map: GameMap, foot: readonly number[]): boolean {
  const W = map.width;
  const H = map.height;
  const ob = (x: number, y: number): string => {
    if (x < 0 || y < 0 || x >= W || y >= H) return "none";
    if (foot.includes(y * W + x)) return "none";
    return map.cells[y * W + x]?.obstacle ?? "none";
  };
  for (const f of foot) {
    const fx = f % W;
    const fy = Math.floor(f / W);
    // The four 2x2 blocks holding the cell.
    for (const [bx, by] of [
      [fx - 1, fy - 1],
      [fx, fy - 1],
      [fx - 1, fy],
      [fx, fy],
    ] as const) {
      if (bx < 0 || by < 0 || bx + 1 >= W || by + 1 >= H) continue;
      const a = ob(bx, by) !== "none";
      const b = ob(bx + 1, by) !== "none";
      const c = ob(bx, by + 1) !== "none";
      const d = ob(bx + 1, by + 1) !== "none";
      if ((a && d && !b && !c) || (b && c && !a && !d)) return false;
    }
    for (const [dx, dy] of DIRECTIONS_8) {
      const x = fx + dx;
      const y = fy + dy;
      const t = ob(x, y);
      if (t === "none") continue;
      let any = 0;
      let same = 0;
      for (const [ex, ey] of DIRECTIONS_8) {
        const u = ob(x + ex, y + ey);
        if (u !== "none") any++;
        if (u === t) same++;
      }
      if (any < 2 || same < 1) return false;
    }
  }
  return true;
}

/**
 * Whether going round the footprint costs at most `DECORATE.maxDetour`
 * more than going through it, between any two walkable cells beside it
 * (straight steps 100, diagonal 141, inside its box grown by three cells,
 * no cutting a corner between two walls). The terrain's own cost is left
 * out: this bounds the detour, it does not price it.
 */
function detourOk(
  map: GameMap,
  foot: readonly number[],
  walk: (i: number) => boolean,
): boolean {
  const W = map.width;
  const H = map.height;
  const xs = foot.map((f) => f % W);
  const ys = foot.map((f) => Math.floor(f / W));
  const x0 = Math.max(0, Math.min(...xs) - 3);
  const x1 = Math.min(W - 1, Math.max(...xs) + 3);
  const y0 = Math.max(0, Math.min(...ys) - 3);
  const y1 = Math.min(H - 1, Math.max(...ys) + 3);
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const local = (x: number, y: number): number => (y - y0) * bw + (x - x0);
  const costs = (blocked: boolean, from: number): Float64Array => {
    const ok = (x: number, y: number): boolean =>
      x >= x0 &&
      x <= x1 &&
      y >= y0 &&
      y <= y1 &&
      (foot.includes(y * W + x) ? !blocked : walk(y * W + x));
    const dist = new Float64Array(bw * bh).fill(Infinity);
    const fx = from % W;
    const fy = Math.floor(from / W);
    dist[local(fx, fy)] = 0;
    // Small boxes: a plain scan for the nearest open cell is enough.
    const done = new Uint8Array(bw * bh);
    for (;;) {
      let best = -1;
      for (let k = 0; k < dist.length; k++)
        if (done[k] === 0 && Number.isFinite(dist[k] ?? Infinity))
          if (best < 0 || (dist[k] ?? 0) < (dist[best] ?? 0)) best = k;
      if (best < 0) break;
      done[best] = 1;
      const x = (best % bw) + x0;
      const y = Math.floor(best / bw) + y0;
      for (const [dx, dy] of DIRECTIONS_8) {
        const nx = x + dx;
        const ny = y + dy;
        if (!ok(nx, ny)) continue;
        if (dx !== 0 && dy !== 0 && !ok(nx, y) && !ok(x, ny)) continue;
        const k = local(nx, ny);
        const d = (dist[best] ?? 0) + (dx !== 0 && dy !== 0 ? 141 : 100);
        if (d < (dist[k] ?? Infinity)) dist[k] = d;
      }
    }
    return dist;
  };
  const ring: number[] = [];
  for (const f of foot) {
    for (const [dx, dy] of DIRECTIONS_8) {
      const x = (f % W) + dx;
      const y = Math.floor(f / W) + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const j = y * W + x;
      if (!foot.includes(j) && walk(j) && !ring.includes(j)) ring.push(j);
    }
  }
  for (const a of ring) {
    const before = costs(false, a);
    const after = costs(true, a);
    for (const b of ring) {
      const k = local(b % W, Math.floor(b / W));
      if ((after[k] ?? Infinity) - (before[k] ?? 0) > DECORATE.maxDetour)
        return false;
    }
  }
  return true;
}

/**
 * Whether the walkable cells round the footprint stay joined to each other
 * without it, inside its box grown by two cells (8 directions, no cutting
 * a corner between two walls, as heroes move). Any way through the
 * footprint can then go round it close by, so the prop cuts nothing off.
 */
function keepsJoined(
  map: GameMap,
  foot: readonly number[],
  walk: (i: number) => boolean,
): boolean {
  const W = map.width;
  const H = map.height;
  const xs = foot.map((f) => f % W);
  const ys = foot.map((f) => Math.floor(f / W));
  const x0 = Math.max(0, Math.min(...xs) - 2);
  const x1 = Math.min(W - 1, Math.max(...xs) + 2);
  const y0 = Math.max(0, Math.min(...ys) - 2);
  const y1 = Math.min(H - 1, Math.max(...ys) + 2);
  const ok = (x: number, y: number): boolean =>
    x >= x0 &&
    x <= x1 &&
    y >= y0 &&
    y <= y1 &&
    !foot.includes(y * W + x) &&
    walk(y * W + x);
  const ring: number[] = [];
  for (const f of foot) {
    for (const [dx, dy] of DIRECTIONS_8) {
      const x = (f % W) + dx;
      const y = Math.floor(f / W) + dy;
      if (ok(x, y) && !ring.includes(y * W + x)) ring.push(y * W + x);
    }
  }
  const start = ring[0];
  if (start === undefined) return true;
  const seen = new Set<number>([start]);
  const stack = [start];
  while (stack.length > 0) {
    const i = stack.pop() as number;
    const x = i % W;
    const y = Math.floor(i / W);
    for (const [dx, dy] of DIRECTIONS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!ok(nx, ny)) continue;
      const j = ny * W + nx;
      if (seen.has(j)) continue;
      if (dx !== 0 && dy !== 0 && !ok(nx, y) && !ok(x, ny)) continue;
      seen.add(j);
      stack.push(j);
    }
  }
  return ring.every((j) => seen.has(j));
}
