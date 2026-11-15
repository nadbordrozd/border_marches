/**
 * Zone borders become obstacle bands: mountain ranges and forest belts with
 * ragged outlines, a seal guaranteed by a "spine", optional spurs, a noisy
 * frame along the map edge, and guarded passes cut through.
 *
 * The seal: for each pair of neighbouring zones one side holds the spine,
 * every cell of that zone with a neighbour (8-way) in the other zone. Any
 * step from one zone into the other starts on such a cell, so the spine alone
 * closes the border; noise then thickens the band on both sides (1-3 cells
 * in all, with an occasional 4) so it reads as a range, not a line. A
 * mountain band is at least `spineMin` deep on the spine side (two cells,
 * three across a diagonal), so a range is never a one-cell line of rocks.
 */
import { at, chamferDistance, N4, N8, noiseField } from "./grid.ts";
import { O, T, isOpen, stageRng, stageSalt } from "./state.ts";
import type { GenState, PassInfo } from "./state.ts";

/** Stretch fbm output (clustered around 0.5) to roughly [0, 1]. */
function stretch(v: number): number {
  return Math.min(1, Math.max(0, (v - 0.5) * 2.6 + 0.5));
}

function pairKey(a: number, b: number): number {
  return a < b ? a * 64 + b : b * 64 + a;
}

export function buildBorders(st: GenState): void {
  const { g, cfg } = st;
  const bc = cfg.borders;
  const rng = stageRng(st, "borders");
  const thickA = noiseField(g, bc.thicknessScale, stageSalt(st, "thick-a"), 3);
  const thickB = noiseField(g, bc.thicknessScale, stageSalt(st, "thick-b"), 3);
  const typeN = noiseField(g, bc.typeScale, stageSalt(st, "border-type"), 2);
  const edgeN = noiseField(
    g,
    bc.thicknessScale * 1.5,
    stageSalt(st, "edge"),
    3,
  );
  // A slower field that swells and starves the frame: deep bulges in some
  // stretches, bare map edge in others, so the frame is no even band.
  const edgeSwell = noiseField(
    g,
    bc.thicknessScale * 3.2,
    stageSalt(st, "edge-swell"),
    2,
  );

  // Which zone of each pair holds the spine.
  const spineSide = new Map<number, number>();
  for (let a = 0; a < st.zones.length; a++) {
    for (let b = a + 1; b < st.zones.length; b++) {
      spineSide.set(pairKey(a, b), rng.chance(0.5) ? a : b);
    }
  }
  const share = (a: number, b: number): number => {
    const za = st.zones[a];
    const zb = st.zones[b];
    if (!za || !zb) return 0.5;
    return (bc.mountainShare[za.main] + bc.mountainShare[zb.main]) / 2;
  };

  // Distance from each cell to the nearest cell of another zone.
  const foreignDist = new Float64Array(g.n).fill(1e9);
  const foreignZone = new Int32Array(g.n).fill(-1);
  for (const z of st.zones) {
    const { dist, nearest } = chamferDistance(
      g,
      (i) => at(st.zone, i) !== z.id,
    );
    for (let i = 0; i < g.n; i++) {
      if (at(st.zone, i) !== z.id) continue;
      foreignDist[i] = at(dist, i);
      const src = at(nearest, i);
      foreignZone[i] = src >= 0 ? at(st.zone, src) : -1;
    }
  }

  for (let i = 0; i < g.n; i++) {
    if (at(st.terrain, i) === T.water) continue;
    const a = at(st.zone, i);
    const b = at(foreignZone, i);
    const d = at(foreignDist, i);
    // Spine: a neighbour in any zone whose border this side holds. Checked
    // per neighbour, since near a corner the nearest foreign zone is not
    // the only one.
    const spine = g.around(i, N8).some((j) => {
      const z = at(st.zone, j);
      return z !== a && spineSide.get(pairKey(a, z)) === a;
    });
    if (!spine && at(st.keepOpen, i)) continue;
    let type = 0;
    if (b >= 0 && d < 4) {
      const holder = spineSide.get(pairKey(a, b)) === a;
      const ta = stretch(at(thickA, i));
      const tb = stretch(at(thickB, i));
      const kind = stretch(at(typeN, i)) < share(a, b) ? O.mountain : O.forest;
      // A mountain spine is never a one-cell line where there is room.
      const least = kind === O.mountain ? bc.spineMin : 0;
      const limit = holder
        ? Math.max(least, 1.5 + bc.spineExtra * ta)
        : bc.otherDepth * (tb * 1.6 - 0.3);
      if (spine || d <= limit) type = kind;
      if (spine) st.spine[i] = 1;
    }
    if (type === 0 && bc.edgeDepth > 0) {
      const x = g.x(i);
      const y = g.y(i);
      const e = Math.min(x + 1, y + 1, g.w - x, g.h - y);
      const swell = bc.edgeSwell * (stretch(at(edgeSwell, i)) * 2 - 1);
      const limit =
        bc.edgeDepth * (stretch(at(edgeN, i)) * 1.9 - 0.6) * (1 + swell);
      if (e <= limit) {
        const z = st.zones[a];
        const s = z ? bc.mountainShare[z.main] : 0.5;
        type = stretch(at(typeN, i)) < s ? O.mountain : O.forest;
      }
    }
    if (type !== 0) st.obstacle[i] = type;
  }

  addSpurs(st, foreignDist);
  widenLines(st);
}

/**
 * A mountain cell with no mountain west or east of it (a one-cell-wide
 * column of the frame, a spur, a diagonal staircase) takes a second cell
 * beside it where its zone has room, so a range is never a single column
 * of rocks (bead xaj.15). The side is the open one, a coin when both are.
 */
function widenLines(st: GenState): void {
  const { g } = st;
  const rng = stageRng(st, "widen");
  for (let i = 0; i < g.n; i++) {
    if (at(st.obstacle, i) !== O.mountain) continue;
    const x = g.x(i);
    const y = g.y(i);
    const side = (dx: number): number =>
      g.inside(x + dx, y) ? g.idx(x + dx, y) : -1;
    const west = side(-1);
    const east = side(1);
    if (west >= 0 && at(st.obstacle, west) === O.mountain) continue;
    if (east >= 0 && at(st.obstacle, east) === O.mountain) continue;
    const zone = at(st.zone, i);
    const options = [west, east].filter(
      (j) =>
        j >= 0 &&
        canGrow(st, j, zone) &&
        at(st.spine, j) === 0 &&
        at(st.terrain, j) !== T.water,
    );
    const pick =
      options.length === 2 ? options[rng.chance(0.5) ? 0 : 1] : options[0];
    if (pick !== undefined) st.obstacle[pick] = O.mountain;
  }
}

/** Short ridges or tongues of forest reaching from a band into its zone. */
function addSpurs(st: GenState, foreignDist: Float64Array): void {
  const { g, cfg } = st;
  const rng = stageRng(st, "spurs");
  const starts: number[] = [];
  for (let i = 0; i < g.n; i++) {
    if (at(st.obstacle, i) === O.none) continue;
    if (at(foreignDist, i) > 4) continue;
    if (g.around(i, N4).some((j) => isOpen(st, j))) starts.push(i);
  }
  for (const s of starts) {
    if (!rng.chance(cfg.borders.spurRate)) continue;
    const type = at(st.obstacle, s);
    const zone = at(st.zone, s);
    // Head away from the border: the open neighbour farthest from it.
    let dir: readonly [number, number] | undefined;
    let best = -1;
    for (const off of N4) {
      const x = g.x(s) + off[0];
      const y = g.y(s) + off[1];
      if (!g.inside(x, y)) continue;
      const j = g.idx(x, y);
      if (!isOpen(st, j) || at(st.zone, j) !== zone) continue;
      if (at(foreignDist, j) > best) {
        best = at(foreignDist, j);
        dir = off;
      }
    }
    if (!dir) continue;
    const len = rng.int(...cfg.borders.spurLength);
    let x = g.x(s);
    let y = g.y(s);
    for (let k = 0; k < len; k++) {
      // Mostly straight with a sideways wobble.
      const side = rng.next();
      const [dx, dy] =
        side < 0.7 ? dir : side < 0.85 ? [dir[1], dir[0]] : [-dir[1], -dir[0]];
      const nx = x + dx;
      const ny = y + dy;
      if (!g.inside(nx, ny)) break;
      const j = g.idx(nx, ny);
      if (!canGrow(st, j, zone)) break;
      st.obstacle[j] = type;
      // Mountains get a second cell beside them now and then: a ridge.
      if (type === O.mountain && rng.chance(0.45)) {
        const sx = nx + (rng.chance(0.5) ? 1 : -1);
        if (g.inside(sx, ny)) {
          const k2 = g.idx(sx, ny);
          if (canGrow(st, k2, zone)) st.obstacle[k2] = type;
        }
      }
      x = nx;
      y = ny;
    }
  }
}

function canGrow(st: GenState, j: number, zone: number): boolean {
  return (
    isOpen(st, j) &&
    at(st.zone, j) === zone &&
    at(st.keepOpen, j) === 0 &&
    at(st.occupied, j) === 0
  );
}

/**
 * Cut 1-2 passes through the band of every connection. A pass is a
 * 4-connected corridor 1-3 cells wide from open ground on one side to open
 * ground on the other.
 */
export function cutPasses(st: GenState): void {
  const { g, cfg } = st;
  const rng = stageRng(st, "passes");
  const towns = [st.townAt.start, st.townAt.enemy].filter((t) => t >= 0);
  for (const c of st.connections) {
    // Distance from the ends of this border: other zones, water, map edge.
    const { dist: endDist } = chamferDistance(g, (i) => {
      const z = at(st.zone, i);
      return (z !== c.a && z !== c.b) || at(st.terrain, i) === T.water;
    });
    const cand: Array<{ i: number; j: number; score: number }> = [];
    for (let i = 0; i < g.n; i++) {
      if (at(st.zone, i) !== c.a || at(st.terrain, i) === T.water) continue;
      for (const j of g.around(i, N4)) {
        if (at(st.zone, j) !== c.b || at(st.terrain, j) === T.water) continue;
        const x = g.x(i);
        const y = g.y(i);
        const edge = Math.min(x, y, g.w - 1 - x, g.h - 1 - y);
        const ends = Math.min(at(endDist, i), edge + 1);
        if (towns.some((t) => g.dist(t, i) < 7)) continue;
        cand.push({ i, j, score: ends });
      }
    }
    if (cand.length === 0) continue;
    const top = Math.max(...cand.map((p) => p.score));
    const passes = c.border >= cfg.passes.secondPassBorder ? 2 : 1;
    const made: PassInfo[] = [];
    for (let p = 0; p < passes; p++) {
      const pool = cand.filter(
        (q) =>
          q.score >= Math.min(4, top * 0.6) &&
          made.every((m) => g.dist(m.cell, q.i) >= cfg.passes.passSpacing),
      );
      if (pool.length === 0) break;
      // Prefer the middle of the border, with some freedom.
      const weights = pool.map((q) => q.score * q.score);
      for (let attempt = 0; attempt < 6; attempt++) {
        const q = rng.weighted(pool, weights);
        const pass = carve(
          st,
          c.a,
          c.b,
          q.i,
          q.j,
          rng.int(...cfg.passes.width),
        );
        if (pass) {
          made.push(pass);
          st.passes.push(pass);
          break;
        }
      }
    }
  }
}

/** BFS (4-way) inside `zone` from `from` to the nearest open cell. */
function pathToOpen(
  st: GenState,
  zone: number,
  from: number,
  maxLen: number,
): number[] | undefined {
  const { g } = st;
  const prev = new Map<number, number>([[from, -1]]);
  let frontier = [from];
  for (let step = 0; step <= maxLen; step++) {
    const next: number[] = [];
    for (const i of frontier) {
      if (isOpen(st, i) && !nearBand(st, i)) {
        const path: number[] = [];
        let k = i;
        while (k !== -1) {
          path.push(k);
          k = prev.get(k) ?? -1;
        }
        return path.reverse();
      }
      for (const j of g.around(i, N4)) {
        if (prev.has(j)) continue;
        if (at(st.zone, j) !== zone || at(st.terrain, j) === T.water) continue;
        prev.set(j, i);
        next.push(j);
      }
    }
    frontier = next;
  }
  return undefined;
}

/** An open cell is a good pass mouth when most of its neighbours are open. */
function nearBand(st: GenState, i: number): boolean {
  let blocked = 0;
  for (const j of st.g.around(i, N8)) if (!isOpen(st, j)) blocked++;
  return blocked > 3;
}

function carve(
  st: GenState,
  a: number,
  b: number,
  i: number,
  j: number,
  width: number,
): PassInfo | undefined {
  const { g, cfg } = st;
  const pa = pathToOpen(st, a, i, 7);
  const pb = pathToOpen(st, b, j, 7);
  if (!pa || !pb) return undefined;
  const line = [...pa.reverse(), ...pb];
  // A corridor must not open the border of a third zone.
  const foreign = (k: number): boolean =>
    g.around(k, N8).some((m) => {
      const z = at(st.zone, m);
      return z !== a && z !== b;
    });
  if (line.some(foreign)) return undefined;
  const first = line[0] as number;
  const last = line[line.length - 1] as number;
  const horizontal =
    Math.abs(g.x(last) - g.x(first)) >= Math.abs(g.y(last) - g.y(first));
  const cells = new Set<number>(line);
  const sides: Array<readonly [number, number]> = horizontal
    ? [
        [0, 1],
        [0, -1],
      ]
    : [
        [1, 0],
        [-1, 0],
      ];
  const extra = width - 1;
  for (const k of line) {
    for (let s = 0; s < extra; s++) {
      const [dx, dy] = sides[s] ?? [0, 0];
      const x = g.x(k) + dx;
      const y = g.y(k) + dy;
      if (!g.inside(x, y)) continue;
      const m = g.idx(x, y);
      const z = at(st.zone, m);
      if (at(st.terrain, m) === T.water || (z !== a && z !== b)) continue;
      if (!foreign(m)) cells.add(m);
    }
  }
  for (const k of cells) {
    st.obstacle[k] = O.none;
    st.spine[k] = 0;
    st.keepOpen[k] = 1;
  }
  // Keep the mouths clear of clusters.
  for (const end of [first, last]) {
    const r = cfg.passes.mouthClearance;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = g.x(end) + dx;
        const y = g.y(end) + dy;
        if (!g.inside(x, y)) continue;
        const m = g.idx(x, y);
        if (at(st.obstacle, m) === O.none) st.keepOpen[m] = 1;
      }
    }
  }
  // The guard stands on the crossing itself.
  const cell = at(st.zone, i) === a ? i : j;
  return { a, b, cell, cells: [...cells].sort((p, q) => p - q), width };
}
