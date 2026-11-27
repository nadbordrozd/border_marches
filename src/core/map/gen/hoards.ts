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
import { movementCost, reachable } from "./paths.ts";
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
  /**
   * A start's own cluster (bead bzc.102): the index of its start among
   * the starts. Every start gets one of the same size, and placeObjects
   * fills them alike.
   */
  start?: number;
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
  if (Object.values(hc.rate).every((r) => r <= 0) && hc.start.things < 2)
    return out;
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
  // Ground a cluster may touch at all (fixed while the clusters are cut,
  // so worked out once).
  const allowed = new Uint8Array(g.n);
  for (let i = 0; i < g.n; i++) {
    allowed[i] =
      st.plaza[i] === 0 &&
      st.occupied[i] === 0 &&
      st.objBlocked[i] === 0 &&
      nearPass[i] === 0 &&
      (opt.pocketOf[i] ?? -1) < 0 &&
      !nearTown(i, yard) &&
      !nearGap(i)
        ? 1
        : 0;
  }
  const mine = (i: number, zone: number): boolean =>
    st.zone[i] === zone && allowed[i] === 1;
  /**
   * Open floor the guard and its zone of control may stand on: a room gap
   * may lie in it (the reach check makes sure nothing is cut off).
   */
  const zocFloor = (i: number, zone: number): boolean =>
    isWalkable(st, i) && mine(i, zone);
  /** Open floor that may take loot or a new wall: no pass or gap. */
  const floor = (i: number, zone: number): boolean =>
    zocFloor(i, zone) && corridor[i] === 0;
  // A cut never opens a new way into a pocket or beside a corridor (a cut
  // cell may become open floor round a guard, bead bzc.102).
  const sealed = new Uint8Array(g.n);
  for (let i = 0; i < g.n; i++) {
    if ((opt.pocketOf[i] ?? -1) < 0 && corridor[i] === 0) continue;
    for (const j of g.around(i, N8)) sealed[j] = 1;
  }
  /** Wood or rock a loot cell may be cut out of (never a border's seal). */
  const carvable = (i: number, zone: number): boolean =>
    st.terrain[i] !== T.water &&
    st.obstacle[i] !== O.none &&
    st.spine[i] === 0 &&
    sealed[i] === 0 &&
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

  /**
   * Every loot cell can be taken from the guard's cell or an open cell of
   * its zone of control, by a step the movement rules allow (a diagonal
   * one needs a side open): with walls round the guard (bead bzc.102) a
   * corner loot cell may otherwise sit behind them.
   */
  const lootReached = (
    c: number,
    loot: ReadonlySet<number>,
    cut: ReadonlySet<number>,
  ): boolean => {
    const open = (i: number): boolean =>
      i === c ||
      (!loot.has(i) && g.cheb(i, c) <= 1 && (cut.has(i) || isOpen(st, i)));
    for (const l of loot) {
      const lx = g.x(l);
      const ly = g.y(l);
      const ok = g.around(l, N8).some((j) => {
        if (!open(j)) return false;
        const dx = lx - g.x(j);
        const dy = ly - g.y(j);
        if (dx === 0 || dy === 0) return true;
        return (
          open(g.idx(g.x(j) + dx, g.y(j))) || open(g.idx(g.x(j), g.y(j) + dy))
        );
      });
      if (!ok) return false;
    }
    return true;
  };

  /** The best site of a cluster of `k` things in `zone`, if any. */
  const siteFor = (
    zone: number,
    slot: number,
    k: number,
    cells: readonly number[],
    before: Uint8Array,
    /**
     * A start's own cluster: the guard this far (movement cost) from its
     * town, near the middle, and six new walls at most (few ways
     * lengthen, so the start kit keeps its distances).
     */
    near?: { cost: Float64Array; lo: number; hi: number },
  ): HoardSite | undefined => {
    const slots = SLOTS[k] ?? [];
    // Cheap checks and a score for every guard cell and facing.
    const cand: Array<{ c: number; dir: number; s: number }> = [];
    for (const c of cells) {
      // The guard stands on open floor, or in a notch cut into the edge of
      // a wood or range (bead bzc.102), its front open.
      const dug = !zocFloor(c, zone);
      if ((dug && !carvable(c, zone)) || taken[c] === 1) continue;
      if (nearTown(c, cfg.objects.guardTownClearance)) continue;
      if (out.some((h) => g.cheb(h.guard, c) < 4)) continue;
      if (g.around(c, N8).length < 8) continue;
      // (A guard dug into a wood has no cost of its own: its open side's.)
      if (
        near === undefined &&
        fromStarts !== undefined &&
        [c, ...g.around(c, N8)].some((i) => (fromStarts[i] ?? Infinity) < away)
      )
        continue;
      let pull = 0;
      if (near !== undefined) {
        const d = near.cost[c] ?? Infinity;
        if (d < near.lo || d > near.hi) continue;
        pull = (4 * Math.abs(d - (near.lo + near.hi) / 2)) / cfg.movement.day;
      }
      for (let dir = 0; dir < 4; dir++) {
        let ok = true;
        let cut = dug ? 1 : 0;
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
        // The rest of the zone of control: open floor in front, or wall
        // (bead bzc.102: a guard may stand in a notch of the wood or range
        // with only its front open; the walls are left as they are).
        let fronts = 0;
        for (const i of g.around(c, N8)) {
          if (loot.has(i)) continue;
          if (zocFloor(i, zone)) fronts++;
          else if (isOpen(st, i)) ok = false;
        }
        if (!ok || fronts === 0) continue;
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
        cand.push({ c, dir, s: have + cut + rng.float(0, 3) - pull });
      }
    }
    cand.sort((p, q) => q.s - p.s || p.c - q.c || p.dir - q.dir);
    // The tidiness check is cheap, the reach floods are not: many of the
    // first, a few of the second (bead bzc.102).
    let tries = 0;
    let floods = 0;
    for (const { c, dir } of cand) {
      if (++tries > 64) break;
      const loot = slots.map(([sx, sy]) => {
        const [dx, dy] = turn(sx, sy, dir);
        return g.idx(g.x(c) + dx, g.y(c) + dy);
      });
      const lootSet = new Set(loot);
      const cut = new Set(loot.filter((i) => !isOpen(st, i)));
      if (!isOpen(st, c)) cut.add(c);
      const grown = new Set(
        wallsOf(st, c, lootSet).filter((w) => wallState(w, zone) === "grow"),
      );
      if (near !== undefined && grown.size > 6) continue;
      // With the walls round the guard left standing; else with those
      // beside the loot cut away (so a corner loot cell is reached); else
      // with its whole zone of control dug out of the wood or range (bead
      // bzc.102), where every such wall may go.
      const ring = g
        .around(c, N8)
        .filter((i) => !lootSet.has(i) && !isOpen(st, i));
      const side = ring.filter((i) => g.x(i) === g.x(c) || g.y(i) === g.y(c));
      let rock: Set<number> | undefined;
      for (const extra of [[], side, ring]) {
        if (extra.length > 0 && !extra.every((i) => carvable(i, zone)))
          continue;
        const tryCut = new Set([...cut, ...extra]);
        if (!lootReached(c, lootSet, tryCut)) continue;
        rock = tidy(grown, tryCut);
        if (rock === undefined) continue;
        for (const i of extra) cut.add(i);
        break;
      }
      if (rock === undefined) continue;
      // Nothing else cut off: with the walls up, the loot in place and the
      // guard's zone of control shut, every cell reached before (but
      // those) is reached still. The open cells round the change joined
      // nearby settle it (bead bzc.102); else a flood of the whole map.
      const zoc = new Set<number>([c, ...g.around(c, N8)]);
      const shut = (i: number): boolean =>
        isWalkable(st, i) && !grown.has(i) && !zoc.has(i);
      const changed = [...zoc, ...grown];
      if (!joinedNearby(st, changed, shut, before)) {
        if (++floods > 12) break;
        const reach = reachable(st, home, shut);
        let ok = true;
        for (let i = 0; i < g.n && ok; i++) {
          if (before[i] === 1 && shut(i) && reach[i] !== 1) ok = false;
        }
        if (!ok) continue;
      }
      // And the guard is reached through its open front: from it, a cell
      // outside the change that was reached before (and so is still).
      const front = (i: number): boolean =>
        (isWalkable(st, i) || i === c) && !grown.has(i) && !lootSet.has(i);
      const exits = new Set<number>();
      for (const k of changed)
        for (const j of g.around(k, N8))
          if (before[j] === 1 && shut(j)) exits.add(j);
      if (!joinedNearby(st, [c], front, undefined, exits)) continue;
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

  const before = reachable(st, home);
  // Clusters but the starts' own keep their distance from every start.
  const startCells = st.towns
    .filter((t) => t.role === "player" || t.role === "open-start")
    .map((t) => t.cell);
  const fromStarts =
    hc.awayFromStarts > 0 ? movementCost(st, startCells) : undefined;
  const away = hc.awayFromStarts * cfg.movement.day;
  const zoneCells = (zone: number): number[] => {
    const cells: number[] = [];
    for (let i = 0; i < g.n; i++) if (st.zone[i] === zone) cells.push(i);
    return cells;
  };
  /** Changes the ground for a site; returns how to change it back. */
  const apply = (site: HoardSite): (() => void) => {
    const cells = [...site.walls, ...site.rock, ...site.carved];
    const was = cells.map((i) => [st.obstacle[i] ?? O.none, before[i] ?? 0]);
    const ring = [site.guard, ...g.around(site.guard, N8)];
    const wasTaken = ring.map((i) => taken[i] ?? 0);
    for (const w of site.walls) st.obstacle[w] = O.forest;
    for (const w of site.rock) st.obstacle[w] = O.mountain;
    for (const i of site.carved) st.obstacle[i] = O.none;
    for (const i of ring) taken[i] = 1;
    // Nothing was cut off: the reach changes only where the ground did.
    for (const w of [...site.walls, ...site.rock]) before[w] = 0;
    for (const i of site.carved) before[i] = 1;
    out.push(site);
    return () => {
      cells.forEach((i, n) => {
        st.obstacle[i] = was[n]?.[0] ?? O.none;
        before[i] = was[n]?.[1] ?? 0;
      });
      ring.forEach((i, n) => {
        taken[i] = wasTaken[n] ?? 0;
      });
      out.splice(out.indexOf(site), 1);
    };
  };

  // A modest cluster for every start (bead bzc.102), the same size for
  // each and as far from its own town, or none at all: starts stay alike.
  const sc = hc.start;
  if (sc.things >= 2) {
    const starts = st.towns.filter(
      (t) => t.role === "player" || t.role === "open-start",
    );
    const day = cfg.movement.day;
    const costs = starts.map((t) => movementCost(st, t.cell));
    // As asked; else a wider ring round the towns; else fewer things.
    const tries: Array<[number, number, number]> = [];
    for (let k = Math.min(5, sc.things); k >= 2; k--) {
      tries.push([k, sc.days[0], sc.days[1]]);
      tries.push([k, sc.days[0] * 0.75, sc.days[1] * 1.4]);
    }
    for (const [k, lo, hi] of tries) {
      const undo: Array<() => void> = [];
      for (const [n, t] of starts.entries()) {
        const cost = costs[n];
        if (cost === undefined) break;
        const site = siteFor(t.zone, n, k, zoneCells(t.zone), before, {
          cost,
          lo: lo * day,
          hi: hi * day,
        });
        if (site === undefined) break;
        site.start = n;
        undo.push(apply(site));
      }
      if (undo.length === starts.length) break;
      for (const u of undo.reverse()) u();
    }
  }

  for (const z of st.zones) {
    const rate = hoardRate(st, z.id);
    const want = Math.round(((opt.open[z.id] ?? 0) * rate) / 100);
    if (rate <= 0 || want <= 0) continue;
    const cells = zoneCells(z.id);
    for (const [slot, most] of opt.sizes(z.id).slice(0, want).entries()) {
      // The cluster as drawn, or a smaller one where it finds no nook.
      let site: HoardSite | undefined;
      for (let k = Math.min(5, most); k >= 2 && !site; k--) {
        site = siteFor(z.id, slot, k, cells, before);
      }
      // No nook for even two things: the zone is full.
      if (site === undefined) break;
      apply(site);
    }
  }
  return out;
}

/** How far round a change the quick reach test looks. */
const NEARBY = 6;

/**
 * A quick, sufficient reach test (bead bzc.102), within a box of
 * {@link NEARBY} cells round the `changed` cells, under the movement rules
 * (a diagonal step needs one of its two sides open) over `walk`. Without
 * `targets`: every cell next to the change that was reached before
 * (`before`) and is walkable joins every other, so whatever a way through
 * the change joined is joined still. With `targets`: a walk from the
 * first changed cell meets one of them.
 */
function joinedNearby(
  st: GenState,
  changed: readonly number[],
  walk: (i: number) => boolean,
  before?: Uint8Array,
  targets?: ReadonlySet<number>,
): boolean {
  const { g } = st;
  let x0 = g.w;
  let y0 = g.h;
  let x1 = -1;
  let y1 = -1;
  for (const i of changed) {
    x0 = Math.min(x0, g.x(i));
    y0 = Math.min(y0, g.y(i));
    x1 = Math.max(x1, g.x(i));
    y1 = Math.max(y1, g.y(i));
  }
  x0 = Math.max(0, x0 - NEARBY);
  y0 = Math.max(0, y0 - NEARBY);
  x1 = Math.min(g.w - 1, x1 + NEARBY);
  y1 = Math.min(g.h - 1, y1 + NEARBY);
  const inBox = (x: number, y: number): boolean =>
    x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const ok = (x: number, y: number): boolean =>
    inBox(x, y) && walk(g.idx(x, y));
  let need: Set<number>;
  let start: number;
  if (targets !== undefined) {
    need = new Set(targets);
    start = changed[0] ?? -1;
    if (start < 0 || need.size === 0) return false;
  } else {
    need = new Set<number>();
    for (const k of changed)
      for (const j of g.around(k, N8))
        if (before?.[j] === 1 && walk(j)) need.add(j);
    const first = need.values().next();
    if (first.done === true) return true;
    start = first.value;
  }
  const seen = new Set<number>([start]);
  const stack = [start];
  let left = targets !== undefined ? 1 : need.size - 1;
  if (targets === undefined) need.delete(start);
  while (stack.length > 0 && left > 0) {
    const i = stack.pop() ?? 0;
    const x = g.x(i);
    const y = g.y(i);
    for (const [dx, dy] of N8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!ok(nx, ny)) continue;
      const j = g.idx(nx, ny);
      if (seen.has(j)) continue;
      if (dx !== 0 && dy !== 0 && !ok(x + dx, y) && !ok(x, y + dy)) continue;
      seen.add(j);
      if (need.has(j)) {
        if (targets !== undefined) return true;
        need.delete(j);
        left--;
      }
      stack.push(j);
    }
  }
  return left <= 0;
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
