/**
 * Guarded treasure clusters (bead bzc.96, docs/design/MAP_COMPOSITION.md).
 *
 * "In homm you get clusters of resources guarded by a guardian. and
 * artifacts." A cluster is two to five one-time pickups (resource piles,
 * sometimes an artifact or two) on the cells round a guard's back, in a
 * nook: every cell beside a pickup that the guard's zone of control (the
 * 3x3 round it) does not cover is wall. So nobody takes a pickup without
 * the fight, and the guard is sized by the whole cluster's value. Seen
 * with its back to the north, three things and five:
 *
 *       # # # # #            # # # # #
 *       # L L L #            # L L L #
 *       . . G . .            # L G L #
 *       . . . . .            # . . . #
 *
 * The nook is cut into a wood where one stands (its loot cells cleared of
 * trees), and its walls are the woods and ranges round it, or new forest
 * on open ground; mostly some of each. This stage only finds the sites and
 * changes the ground (before the costs and the fill); placeObjects rolls
 * the loot and the guard. Its own random stream; with every rate at 0
 * nothing changes.
 */
import { inMountainBlock } from "./clusters.ts";
import { N8 } from "./grid.ts";
import { reachable } from "./paths.ts";
import {
  O,
  T,
  corridorMask,
  homeCell,
  isOpen,
  isWalkable,
  stageRng,
} from "./state.ts";
import type { GenState } from "./state.ts";

/** A cluster's site: the guard, its loot cells (back first) and walls. */
export interface HoardSite {
  zone: number;
  /** Which of the zone's drawn clusters (index into `sizes`). */
  slot: number;
  guard: number;
  loot: number[];
  /** Cells turned to forest for it (existing walls not listed). */
  walls: number[];
  /** Cells turned to rock for it (each in a 2x2 block of rock). */
  rock: number[];
  /** Loot cells cut out of a wood (its trees cleared). */
  carved: number[];
}

/** Loot slots by count, as (dx, dy) with the back to the north. */
const SLOTS: Readonly<
  Record<number, ReadonlyArray<readonly [number, number]>>
> = {
  // The middle of the back first: the artifacts go there.
  2: [
    [-1, -1],
    [1, -1],
  ],
  3: [
    [0, -1],
    [-1, -1],
    [1, -1],
  ],
  4: [
    [-1, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
  ],
  5: [
    [0, -1],
    [-1, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
  ],
};

/**
 * Clusters per 100 open cells of a zone: its kind's rate, none in a sand
 * desert (its treasure is its own sites: the Pyramid, the tombs, bead
 * bzc.88, which need the room).
 */
export function hoardRate(st: GenState, zone: number): number {
  const z = st.zones[zone];
  if (z === undefined || z.main === "sand") return 0;
  return st.cfg.hoards.rate[z.role] ?? 0;
}

/** Turn (dx, dy) from "back to the north" to back `dir` (0 N, 1 E, 2 S, 3 W). */
function turn(dx: number, dy: number, dir: number): [number, number] {
  switch (dir) {
    case 1:
      return [-dy, dx];
    case 2:
      return [-dx, -dy];
    case 3:
      return [dy, -dx];
    default:
      return [dx, dy];
  }
}

export interface HoardOptions {
  /** Open cells of each zone (reachable, outside pockets). */
  open: readonly number[];
  /** Pocket index per cell (-1 outside every pocket). */
  pocketOf: Int32Array;
  /** Pocket gap cells (their guards' zones of control stay clear). */
  pocketGaps: readonly number[];
  /** How many things each of a zone's clusters holds (drawn beforehand). */
  sizes: (zone: number) => number[];
}

/**
 * Finds cluster sites zone by zone and changes their ground. Returns the
 * sites placed (fewer than asked where a zone has no room; a cluster that
 * finds no nook for all its things takes a smaller one).
 */
export function carveHoards(st: GenState, opt: HoardOptions): HoardSite[] {
  const { g, cfg } = st;
  const hc = cfg.hoards;
  const out: HoardSite[] = [];
  if (Object.values(hc.rate).every((r) => r <= 0)) return out;
  const rng = stageRng(st, "hoard-sites");
  const home = homeCell(st);
  if (home < 0) return out;
  // The ground round each pass's guard: its zone of control stays clear of
  // a cluster's (the margin of bead bzc.73). The corridors themselves
  // take no loot or wall (floor, below).
  const corridor = corridorMask(st);
  const nearPass = new Uint8Array(g.n);
  const mark = (i: number, r: number): void => {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (g.inside(g.x(i) + dx, g.y(i) + dy))
          nearPass[g.idx(g.x(i) + dx, g.y(i) + dy)] = 1;
      }
    }
  };
  for (const p of st.passes) mark(p.cell, hc.corridorGap + 1);
  // A guard keeps its distance from a town's entrance (as every guard
  // does); the rest of the cluster stays out of the town's yard.
  const nearTown = (i: number, r: number): boolean =>
    st.towns.some((t) => g.cheb(t.cell, i) <= r);
  const yard = cfg.objects.townClearance + 1;
  const nearGap = (i: number): boolean =>
    opt.pocketGaps.some((c) => g.cheb(c, i) <= 2);
  /** Ground a cluster may touch at all. */
  const mine = (i: number, zone: number): boolean =>
    st.zone[i] === zone &&
    st.plaza[i] === 0 &&
    st.occupied[i] === 0 &&
    st.objBlocked[i] === 0 &&
    nearPass[i] === 0 &&
    (opt.pocketOf[i] ?? -1) < 0 &&
    !nearTown(i, yard) &&
    !nearGap(i);
  /**
   * Open floor the guard and its zone of control may stand on: a room gap
   * may lie in it (the reach check makes sure nothing is cut off).
   */
  const zocFloor = (i: number, zone: number): boolean =>
    isWalkable(st, i) && mine(i, zone);
  /** Open floor that may take loot or a new wall: no pass or gap. */
  const floor = (i: number, zone: number): boolean =>
    zocFloor(i, zone) && corridor[i] === 0;
  /** Wood or rock a loot cell may be cut out of (never a border's seal). */
  const carvable = (i: number, zone: number): boolean =>
    st.terrain[i] !== T.water &&
    st.obstacle[i] !== O.none &&
    st.spine[i] === 0 &&
    mine(i, zone);
  /**
   * A wall cell: already blocked, or open floor that may turn to forest
   * (of this zone or the next: never a corridor, a border's seal, a pocket
   * or a town's yard).
   */
  const wallState = (
    i: number,
    zone: number,
  ): "blocked" | "grow" | undefined => {
    if (i < 0 || !isOpen(st, i)) return "blocked";
    if (floor(i, zone)) return "grow";
    return st.zone[i] !== zone && st.spine[i] === 0 && floor(i, st.zone[i] ?? 0)
      ? "grow"
      : undefined;
  };
  const taken = new Uint8Array(g.n);

  /** Obstacle after the change (new walls in, cut cells out). */
  const after = (
    i: number,
    grown: ReadonlySet<number>,
    cut: ReadonlySet<number>,
  ): boolean => grown.has(i) || (!cut.has(i) && st.obstacle[i] !== O.none);
  /**
   * The change leaves the ground tidy: no corner-only join of obstacles
   * round a changed cell, no lone tree among rock (a new wall cell with no
   * wood beside it is rock instead, where it completes a 2x2 block of rock,
   * xaj.20), every rock round a changed cell still in a 2x2 block, and no
   * rock edge beside it straight for long (xaj.21). Returns the new walls
   * that are rock, or undefined when the change is not tidy.
   */
  const tidy = (
    grown: ReadonlySet<number>,
    cut: ReadonlySet<number>,
  ): Set<number> | undefined => {
    for (const w of [...grown, ...cut]) {
      const x = g.x(w);
      const y = g.y(w);
      for (const [ox, oy] of [
        [-1, -1],
        [0, -1],
        [-1, 0],
        [0, 0],
      ] as const) {
        const x0 = x + ox;
        const y0 = y + oy;
        if (!g.inside(x0, y0) || !g.inside(x0 + 1, y0 + 1)) continue;
        const a = after(g.idx(x0, y0), grown, cut);
        const b = after(g.idx(x0 + 1, y0), grown, cut);
        const c = after(g.idx(x0, y0 + 1), grown, cut);
        const d = after(g.idx(x0 + 1, y0 + 1), grown, cut);
        if ((a && d && !b && !c) || (b && c && !a && !d)) return undefined;
      }
    }
    // A new wall with no other new wall or wood beside it is rock.
    const oldWood = (i: number): boolean =>
      !cut.has(i) && st.obstacle[i] === O.forest;
    const rockWalls = new Set<number>();
    for (const w of grown) {
      if (g.around(w, N8).some((k) => grown.has(k) || oldWood(k))) continue;
      rockWalls.add(w);
    }
    const wood = (i: number): boolean =>
      (grown.has(i) && !rockWalls.has(i)) || oldWood(i);
    // No wood left alone among rock that had wood beside it before.
    const near = new Set<number>();
    for (const c of [...grown, ...cut])
      for (const j of g.around(c, N8)) near.add(j);
    for (const j of near) {
      if (!wood(j) || grown.has(j)) continue;
      if (g.around(j, N8).some((k) => wood(k))) continue;
      if (g.around(j, N8).some((k) => st.obstacle[k] === O.forest))
        return undefined;
    }
    // Rock: whole 2x2 blocks and no long straight edge, with the change.
    const rocky =
      rockWalls.size > 0 || [...cut].some((c) => st.obstacle[c] === O.mountain);
    if (!rocky) return rockWalls;
    const changed = [...cut, ...rockWalls];
    const was = changed.map((k) => st.obstacle[k] ?? O.none);
    for (const k of cut) st.obstacle[k] = O.none;
    for (const k of rockWalls) st.obstacle[k] = O.mountain;
    let ok = true;
    for (const c of changed) {
      for (const j of [c, ...g.around(c, N8)]) {
        if (st.obstacle[j] === O.mountain && !inMountainBlock(st, j))
          ok = false;
      }
      if (ok && straightRun(st, c) > cfg.wobble.maxRun) ok = false;
      if (!ok) break;
    }
    changed.forEach((k, n) => {
      st.obstacle[k] = was[n] ?? O.none;
    });
    return ok ? rockWalls : undefined;
  };

  /** The best site of a cluster of `k` things in `zone`, if any. */
  const siteFor = (
    zone: number,
    slot: number,
    k: number,
    cells: readonly number[],
    before: Uint8Array,
  ): HoardSite | undefined => {
    const slots = SLOTS[k] ?? [];
    // Cheap checks and a score for every guard cell and facing.
    const cand: Array<{ c: number; dir: number; s: number }> = [];
    for (const c of cells) {
      if (!zocFloor(c, zone) || taken[c] === 1) continue;
      if (nearTown(c, cfg.objects.guardTownClearance)) continue;
      if (out.some((h) => g.cheb(h.guard, c) < 5)) continue;
      if (g.around(c, N8).length < 8) continue;
      for (let dir = 0; dir < 4; dir++) {
        let ok = true;
        let cut = 0;
        const loot = new Set<number>();
        for (const [sx, sy] of slots) {
          const [dx, dy] = turn(sx, sy, dir);
          const i = g.idx(g.x(c) + dx, g.y(c) + dy);
          if (floor(i, zone)) loot.add(i);
          else if (carvable(i, zone)) {
            loot.add(i);
            cut++;
          } else {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        // The rest of the zone of control: open floor in front.
        for (const i of g.around(c, N8)) {
          if (!loot.has(i) && !zocFloor(i, zone)) ok = false;
        }
        if (!ok) continue;
        // Nooks first: the walls that stand already, and the cells cut
        // into a range (no open ground lost to them).
        let have = 0;
        for (const w of wallsOf(st, c, loot)) {
          const s = wallState(w, zone);
          if (s === undefined) {
            ok = false;
            break;
          }
          if (s === "blocked") have++;
        }
        if (!ok) continue;
        cand.push({ c, dir, s: have + cut + rng.float(0, 3) });
      }
    }
    cand.sort((p, q) => q.s - p.s || p.c - q.c || p.dir - q.dir);
    let tries = 0;
    for (const { c, dir } of cand) {
      if (++tries > 16) break;
      const loot = slots.map(([sx, sy]) => {
        const [dx, dy] = turn(sx, sy, dir);
        return g.idx(g.x(c) + dx, g.y(c) + dy);
      });
      const lootSet = new Set(loot);
      const cut = new Set(loot.filter((i) => !isOpen(st, i)));
      const grown = new Set(
        wallsOf(st, c, lootSet).filter((w) => wallState(w, zone) === "grow"),
      );
      const rock = tidy(grown, cut);
      if (rock === undefined) continue;
      // Nothing else cut off: with the walls up, the loot in place and the
      // guard's zone of control shut, every cell reached before (but
      // those) is reached still.
      const zoc = new Set<number>([c, ...g.around(c, N8)]);
      const shut = (i: number): boolean =>
        isWalkable(st, i) && !grown.has(i) && !zoc.has(i);
      const reach = reachable(st, home, shut);
      let ok = true;
      for (let i = 0; i < g.n && ok; i++) {
        if (before[i] === 1 && shut(i) && reach[i] !== 1) ok = false;
      }
      if (!ok) continue;
      // And the guard is reached through its open front.
      const toGuard = reachable(
        st,
        home,
        (i) => isWalkable(st, i) && !grown.has(i) && !lootSet.has(i),
      );
      if (toGuard[c] !== 1) continue;
      return {
        zone,
        slot,
        guard: c,
        loot,
        walls: [...grown].filter((w) => !rock.has(w)),
        rock: [...rock],
        carved: [...cut],
      };
    }
    return undefined;
  };

  for (const z of st.zones) {
    const rate = hoardRate(st, z.id);
    const want = Math.round(((opt.open[z.id] ?? 0) * rate) / 100);
    if (rate <= 0 || want <= 0) continue;
    const cells: number[] = [];
    for (let i = 0; i < g.n; i++) if (st.zone[i] === z.id) cells.push(i);
    for (const [slot, most] of opt.sizes(z.id).slice(0, want).entries()) {
      const before = reachable(st, home);
      // The cluster as drawn, or a smaller one where it finds no nook.
      let site: HoardSite | undefined;
      for (let k = Math.min(5, most); k >= 2 && !site; k--) {
        site = siteFor(z.id, slot, k, cells, before);
      }
      if (site === undefined) continue;
      for (const w of site.walls) st.obstacle[w] = O.forest;
      for (const w of site.rock) st.obstacle[w] = O.mountain;
      for (const i of site.carved) st.obstacle[i] = O.none;
      for (const i of [site.guard, ...g.around(site.guard, N8)]) taken[i] = 1;
      out.push(site);
    }
  }
  return out;
}

/**
 * The longest straight rock edge (between rock and anything else, on one
 * cell line) that runs along a side of cell `c`.
 */
function straightRun(st: GenState, c: number): number {
  const { g } = st;
  const rock = (x: number, y: number): boolean =>
    g.inside(x, y) && st.obstacle[g.idx(x, y)] === O.mountain;
  /** The edge's label between (x0, y0) and its neighbour by (dx, dy). */
  const label = (x0: number, y0: number, dx: number, dy: number): string => {
    if (!g.inside(x0, y0) || !g.inside(x0 + dx, y0 + dy)) return "";
    const a = rock(x0, y0);
    const b = rock(x0 + dx, y0 + dy);
    return a === b ? "" : a ? "A" : "B";
  };
  let most = 0;
  const x = g.x(c);
  const y = g.y(c);
  // Each side: the edge between c and its neighbour, followed along the
  // line it lies on (vertical edges run in y, horizontal ones in x).
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const x0 = dx < 0 ? x - 1 : x;
    const y0 = dy < 0 ? y - 1 : y;
    const ex = Math.abs(dx);
    const ey = Math.abs(dy);
    const here = label(x0, y0, ex, ey);
    if (here === "") continue;
    // Along the line: vertical edges (ex) step in y, horizontal in x.
    const sx = ey;
    const sy = ex;
    let run = 1;
    for (let k = 1; label(x0 + k * sx, y0 + k * sy, ex, ey) === here; k++)
      run++;
    for (let k = 1; label(x0 - k * sx, y0 - k * sy, ex, ey) === here; k++)
      run++;
    most = Math.max(most, run);
  }
  return most;
}

/**
 * The wall cells of a cluster at guard `c`: every cell two steps from the
 * guard (outside its zone of control) beside a loot cell, -1 for one off
 * the map (the map's edge is a wall too).
 */
function wallsOf(st: GenState, c: number, loot: ReadonlySet<number>): number[] {
  const { g } = st;
  const out = new Set<number>();
  for (const l of loot) {
    for (const [dx, dy] of N8) {
      const x = g.x(l) + dx;
      const y = g.y(l) + dy;
      if (Math.max(Math.abs(x - g.x(c)), Math.abs(y - g.y(c))) <= 1) continue;
      out.add(g.inside(x, y) ? g.idx(x, y) : -1);
    }
  }
  return [...out];
}
