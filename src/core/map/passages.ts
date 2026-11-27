/**
 * Ways round buildings (bead bzc.110). The user: "these buildings should be
 * placed such that there is always a path around them. they shouldn't
 * obstruct passages (even if it would be possible to pass by stepping on
 * the shrine first). Stuff that you pick up such as resources are exempt
 * from this. they are allowed to be in the way".
 *
 * A building here is what the pathfinder routes round (bead bzc.107,
 * `BUILDING_DETOUR` in src/core/game/pathfinding.ts): the entrance of a
 * mine, dwelling, site, bank or waystone that is not a pickup. Towns are
 * destinations and are left out; pickups (resource piles, chests, loose
 * artifacts, mystery bags), guards and gates may stand in the way.
 *
 * The rule: for every two open cells a hero can walk between with the
 * buildings' entrances open, a walk exists that steps on no building's
 * entrance or footprint. Walkability follows the pathfinder: open land,
 * no object footprint, eight directions, and a diagonal step is barred
 * only when both cells beside it are walls (an entrance is not a wall);
 * every pickup counts as taken and every guard or gate as passed.
 */
import { isPickup } from "../game/site-state.ts";
import { DAY_MP, startTownsOf, travelCosts } from "./fairness.ts";
import { isPassable, objectCells } from "./types.ts";
import type { GameMap, MapObject } from "./types.ts";

/** Object kinds the pathfinder routes round (its VISIT_KINDS but towns). */
const BUILDING_KINDS: ReadonlySet<string> = new Set([
  "mine",
  "dwelling",
  "site",
  "bank",
  "artifact",
  "teleport",
]);

/** The game's pickup rule ({@link isPickup}), remembered per object. */
const PICKUP_OF = new WeakMap<MapObject, boolean>();
function pickupRule(obj: MapObject): boolean {
  let known = PICKUP_OF.get(obj);
  if (known === undefined) {
    known = isPickup(obj);
    PICKUP_OF.set(obj, known);
  }
  return known;
}

/** Whether the rule applies to this object (a building no path may need). */
export function isBuilding(obj: MapObject): boolean {
  return BUILDING_KINDS.has(obj.kind) && !pickupRule(obj);
}

const N8: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

/** Row-major walls for standing and for corners (ground and footprints). */
export function wallMask(map: GameMap): Uint8Array {
  const { width: w, height: h } = map;
  const wall = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const c = map.cells[i];
    if (c === undefined || !isPassable(c)) wall[i] = 1;
  }
  for (const o of map.objects) {
    for (const [x, y] of o.blocked) {
      if (x >= 0 && y >= 0 && x < w && y < h) wall[y * w + x] = 1;
    }
  }
  return wall;
}

/** Row-major index of the building standing at each entrance, else -1. */
export function buildingMask(
  map: GameMap,
  objects: readonly MapObject[] = map.objects,
  blocks: (o: MapObject) => boolean = isBuilding,
): Int32Array {
  const { width: w, height: h } = map;
  const at = new Int32Array(w * h).fill(-1);
  objects.forEach((o, k) => {
    if (!blocks(o)) return;
    if (o.x < 0 || o.y < 0 || o.x >= w || o.y >= h) return;
    at[o.y * w + o.x] = k;
  });
  return at;
}

/**
 * Connected labels of the open cells (`node` true), 8-way with the
 * pathfinder's corner rule on `wall`; -1 elsewhere.
 */
export function labelOpen(
  w: number,
  h: number,
  wall: Uint8Array,
  node: (i: number) => boolean,
): Int32Array {
  const n = w * h;
  const label = new Int32Array(n).fill(-1);
  // The open cells once (a typed mask), then a flood per part.
  const open = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (node(i)) open[i] = 1;
  const stack = new Int32Array(n);
  let next = 0;
  for (let s = 0; s < n; s++) {
    if (label[s] !== -1 || open[s] === 0) continue;
    label[s] = next;
    let top = 0;
    stack[top++] = s;
    while (top > 0) {
      const i = stack[--top] as number;
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const j = ny * w + nx;
          if (label[j] !== -1 || open[j] === 0) continue;
          if (dx !== 0 && dy !== 0 && wall[y * w + nx] && wall[ny * w + x])
            continue;
          label[j] = next;
          stack[top++] = j;
        }
      }
    }
    next++;
  }
  return label;
}

export interface Obstruction {
  /** Ids of the buildings that stand between open ground (map order). */
  blockers: string[];
  /** Open cells cut off from the rest of their ground by buildings. */
  cutCells: number;
}

/** A group of touching building entrances in a way. */
interface BlockGroup {
  /** Entrance cells. */
  cells: number[];
  /** Labels of the open ground it touches, largest first. */
  sides: number[];
}

interface Groups {
  wall: Uint8Array;
  at: Int32Array;
  label: Int32Array;
  size: Map<number, number>;
  groups: BlockGroup[];
}

/**
 * Groups of touching entrances that stand in a way: open ground on two
 * sides or more that reaches across only through them, or a member that
 * is entered only from another building.
 */
export function blockGroups(
  map: GameMap,
  blocks: (o: MapObject) => boolean = isBuilding,
  /** The blocks are walls for the open ground's corners too (pickups). */
  solid = false,
): Groups {
  const { width: w, height: h } = map;
  const wall = wallMask(map);
  const at = buildingMask(map, map.objects, blocks);
  let corner = wall;
  if (solid) {
    corner = wall.slice();
    for (let i = 0; i < w * h; i++) if (at[i] !== -1) corner[i] = 1;
  }
  const label = labelOpen(w, h, corner, (i) => wall[i] === 0 && at[i] === -1);
  const size = new Map<number, number>();
  for (const l of label) if (l >= 0) size.set(l, (size.get(l) ?? 0) + 1);
  const seen = new Uint8Array(w * h);
  const groups: BlockGroup[] = [];
  for (let s = 0; s < w * h; s++) {
    if ((at[s] ?? -1) < 0 || seen[s]) continue;
    // A group of entrances joined by steps, and the open ground it touches.
    const group: number[] = [s];
    const sides = new Set<number>();
    let shut = false;
    seen[s] = 1;
    for (let q = 0; q < group.length; q++) {
      const i = group[q] as number;
      const x = i % w;
      const y = (i - x) / w;
      let own = false;
      for (const [dx, dy] of N8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (wall[j]) continue;
        if (dx !== 0 && dy !== 0 && wall[y * w + nx] && wall[ny * w + x])
          continue;
        if ((at[j] ?? -1) >= 0) {
          if (!seen[j]) {
            seen[j] = 1;
            group.push(j);
          }
        } else {
          sides.add(label[j] as number);
          own = true;
        }
      }
      if (!own) shut = true;
    }
    if (sides.size < 2 && !(shut && group.length > 1 && sides.size > 0))
      continue;
    groups.push({
      cells: group,
      sides: [...sides].sort(
        (a, b) => (size.get(b) ?? 0) - (size.get(a) ?? 0) || a - b,
      ),
    });
  }
  return { wall, at, label, size, groups };
}

/**
 * The pickups that seal a way, as "id@x,y" (bead bzc.50's rule, which
 * still holds: with every pickup a wall, open ground on two sides of it
 * reaches across only through it). No repair adds one.
 */
export function sealingPickups(map: GameMap): Set<string> {
  const pickup = (o: MapObject): boolean =>
    pickupRule(o) && o.blocked.length === 0;
  const { at, groups } = blockGroups(map, pickup, true);
  const out = new Set<string>();
  for (const g of groups)
    for (const c of g.cells) {
      const o = map.objects[at[c] as number];
      if (o !== undefined) out.add(`${o.id}@${o.x},${o.y}`);
    }
  return out;
}

/** Whether `map` has a pickup sealing a way that `before` did not list. */
function newSeal(map: GameMap, before: ReadonlySet<string>): boolean {
  for (const id of sealingPickups(map)) if (!before.has(id)) return true;
  return false;
}

/**
 * The buildings that obstruct a passage (each group of touching entrances
 * that open ground on two sides reaches only through, or that holds an
 * entrance reached only over another), and the open ground they cut off.
 * Empty when the rule holds.
 */
export function findObstructions(map: GameMap): Obstruction {
  const { at, size, groups } = blockGroups(map);
  const blockers = new Set<number>();
  let cutCells = 0;
  for (const g of groups) {
    for (const i of g.cells) blockers.add(at[i] as number);
    for (const l of g.sides.slice(1)) cutCells += size.get(l) ?? 0;
  }
  return {
    blockers: [...blockers]
      .sort((a, b) => a - b)
      .map((k) => map.objects[k]?.id ?? ""),
    cutCells,
  };
}

/** A step from i by (dx, dy): a diagonal needs one open cell beside it. */
function stepOk(
  w: number,
  i: number,
  dx: number,
  dy: number,
  open: (k: number) => boolean,
): boolean {
  if (dx === 0 || dy === 0) return true;
  return open(i + dx) || open(i + dy * w);
}

/**
 * Whether a building with entrance `e` and cells `foot` (the entrance
 * among them) on cells `open` now (`open`: open land with no footprint;
 * pickups count as taken) leaves a way round itself: with its cells and
 * every building entrance (`building`) shut, every open cell that stepped
 * into its cells stays joined to the others (a window of two cells round
 * it first, then over the whole map), and every building next to it keeps
 * a way in from open ground.
 */
export function leavesWayRound(
  w: number,
  h: number,
  e: number,
  foot: readonly number[],
  open: (k: number) => boolean,
  building: (k: number) => boolean,
): boolean {
  const inside = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < w && y < h;
  /** Open once it stands (its entrance too: an entrance is no wall). */
  const after = (k: number): boolean =>
    open(k) && (k === e || !foot.includes(k));
  const node = (k: number): boolean => after(k) && k !== e && !building(k);
  const ring: number[] = [];
  const doors: number[] = [];
  for (const f of foot) {
    const fx = f % w;
    const fy = (f - fx) / w;
    for (const [dx, dy] of N8) {
      if (!inside(fx - dx, fy - dy)) continue;
      const j = f - dx - dy * w;
      if (foot.includes(j) || !open(j)) continue;
      if (!stepOk(w, j, dx, dy, open)) continue;
      if (node(j)) {
        if (!ring.includes(j)) ring.push(j);
      } else if (building(j) && !doors.includes(j)) doors.push(j);
    }
  }
  for (const d of doors) {
    const dx0 = d % w;
    const dy0 = (d - dx0) / w;
    const way = N8.some(([dx, dy]) => {
      if (!inside(dx0 - dx, dy0 - dy)) return false;
      const j = d - dx - dy * w;
      return node(j) && stepOk(w, j, dx, dy, after);
    });
    if (!way) return false;
  }
  if (ring.length <= 1) return true;
  // A window of two cells round the footprint.
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const f of foot) {
    x0 = Math.min(x0, (f % w) - 2);
    y0 = Math.min(y0, Math.floor(f / w) - 2);
    x1 = Math.max(x1, (f % w) + 2);
    y1 = Math.max(y1, Math.floor(f / w) + 2);
  }
  const start = ring[0] as number;
  const seen = new Set<number>([start]);
  const stack = [start];
  let left = ring.length - 1;
  while (stack.length > 0 && left > 0) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy] of N8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < x0 || ny < y0 || nx > x1 || ny > y1 || !inside(nx, ny)) continue;
      const j = ny * w + nx;
      if (seen.has(j) || !node(j) || !stepOk(w, i, dx, dy, after)) continue;
      seen.add(j);
      if (ring.includes(j)) left--;
      stack.push(j);
    }
  }
  return left === 0 || joined(w, h, ring, node, after);
}

/**
 * Whether the `ring` cells are joined over `node` cells: a search grows
 * from each at once and regions merge where they meet, so it fails as
 * soon as one side runs out of ground (the small side of a cut, usually
 * a few cells) and succeeds once all have met.
 */
function joined(
  w: number,
  h: number,
  ring: readonly number[],
  node: (k: number) => boolean,
  open: (k: number) => boolean,
): boolean {
  const owner = new Map<number, number>();
  const parent = ring.map((_, k) => k);
  const root = (k: number): number => {
    let r = k;
    while (parent[r] !== r) r = parent[r] as number;
    parent[k] = r;
    return r;
  };
  const queues: number[][] = ring.map((c, k) => {
    owner.set(c, k);
    return [c];
  });
  const heads = ring.map(() => 0);
  let regions = ring.length;
  /** Merge region b into a (both roots): b's frontier joins a's queue. */
  const merge = (a: number, b: number): void => {
    parent[b] = a;
    const qa = queues[a] as number[];
    const qb = queues[b] as number[];
    for (let t = heads[b] as number; t < qb.length; t++)
      qa.push(qb[t] as number);
    heads[b] = qb.length;
    regions--;
  };
  for (;;) {
    let moved = false;
    for (let k = 0; k < ring.length; k++) {
      if (root(k) !== k) continue;
      const q = queues[k] as number[];
      const head = heads[k] as number;
      if (head >= q.length) return false;
      const i = q[head] as number;
      heads[k] = head + 1;
      moved = true;
      const x = i % w;
      const y = (i - x) / w;
      for (const [dx, dy] of N8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!node(j) || !stepOk(w, i, dx, dy, open)) continue;
        const o = owner.get(j);
        if (o === undefined) {
          owner.set(j, k);
          q.push(j);
          continue;
        }
        const b = root(o);
        if (b === k) continue;
        merge(k, b);
        if (regions <= 1) return true;
      }
    }
    if (!moved) return false;
  }
}

export interface AsideReport {
  /** Buildings moved aside: id, from and to (entrances). */
  moved: Array<{ id: string; from: [number, number]; to: [number, number] }>;
  /** Buildings that changed places with a pickup nearby. */
  swapped: Array<{
    id: string;
    with: string;
    from: [number, number];
    to: [number, number];
  }>;
  /** Empty dead-end cells behind a building that became wood. */
  filled: Array<[number, number]>;
  /** Wood or rock cleared to open a way round a building. */
  dug: Array<[number, number]>;
  /** Buildings still in a way when nothing helped. */
  left: string[];
}

/** The largest empty dead end behind a building that is filled with wood. */
const FILL_MAX = 6;
/** How far a building trades places with a pickup or guard behind it. */
const SWAP_BEHIND = 3;
/** How many pickups of the same guard a building tries to trade with. */
const SWAP_NEAR = 6;

/**
 * Fills the small empty dead ends behind buildings with wood: a side of a
 * group no bigger than FILL_MAX cells with nothing on it (no object, road
 * or waystone exit) is ground only that building reaches. Every building
 * next to it keeps a way in. Returns the cells filled.
 */
function fillDeadEnds(map: GameMap): Array<[number, number]> {
  const { width: w, height: h } = map;
  const { wall, at, label, size, groups } = blockGroups(map);
  const busy = new Uint8Array(w * h);
  for (const o of map.objects) {
    for (const [x, y] of objectCells(o))
      if (x >= 0 && y >= 0 && x < w && y < h) busy[y * w + x] = 1;
    const exit = o.data["exit"];
    if (Array.isArray(exit) && typeof exit[0] === "number") {
      const [ex, ey] = exit as [number, number];
      if (ex >= 0 && ey >= 0 && ex < w && ey < h) busy[ey * w + ex] = 1;
    }
  }
  const small = new Set<number>();
  for (const g of groups)
    for (const l of g.sides.slice(1))
      if ((size.get(l) ?? 0) <= FILL_MAX) small.add(l);
  if (small.size === 0) return [];
  const cellsOf = new Map<number, number[]>();
  for (let i = 0; i < w * h; i++) {
    const l = label[i] ?? -1;
    if (small.has(l)) cellsOf.set(l, [...(cellsOf.get(l) ?? []), i]);
  }
  const out: Array<[number, number]> = [];
  const filled = new Set<number>();
  const isOpen = (k: number): boolean => wall[k] === 0 && !filled.has(k);
  const solid = wall.slice();
  const g0 = labelOpen(w, h, solid, (i) => solid[i] === 0);
  const sealed = sealingPickups(map);
  for (const [, cells] of [...cellsOf].sort((a, b) => a[0] - b[0])) {
    if (cells.some((i) => busy[i] || map.cells[i]?.road === true)) continue;
    // A dead end behind one building (or touching ones), not a link
    // between buildings a hero walks over.
    const doors = new Set<number>();
    for (const i of cells)
      for (const [dx, dy] of N8) {
        const x = (i % w) + dx;
        const y = Math.floor(i / w) + dy;
        if (x >= 0 && y >= 0 && x < w && y < h && (at[y * w + x] ?? -1) >= 0)
          doors.add(y * w + x);
      }
    const list = [...doors];
    const linked = list.every((a) =>
      list.every(
        (b) =>
          a === b ||
          Math.max(
            Math.abs((a % w) - (b % w)),
            Math.abs(Math.floor(a / w) - Math.floor(b / w)),
          ) <= 1,
      ),
    );
    if (!linked) continue;
    if (cells.some((i) => map.cells[i]?.terrain === "water")) continue;
    for (const i of cells) filled.add(i);
    // Every building beside it keeps open ground to step in from.
    const shut = cells.some((i) =>
      N8.some(([dx, dy]) => {
        const x = (i % w) + dx;
        const y = Math.floor(i / w) + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) return false;
        const b = y * w + x;
        if ((at[b] ?? -1) < 0) return false;
        return !N8.some(([sx, sy]) => {
          const nx = x + sx;
          const ny = y + sy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) return false;
          const j = ny * w + nx;
          return isOpen(j) && (at[j] ?? -1) < 0 && stepOk(w, b, sx, sy, isOpen);
        });
      }),
    );
    // And no other ground parts: it was a dead end, not a link between
    // buildings.
    if (shut || !keepsWhole(w, h, solid, g0, cells)) {
      for (const i of cells) filled.delete(i);
      continue;
    }
    const was = cells.map((i) => map.cells[i]);
    for (const i of cells) {
      const c = map.cells[i];
      if (c === undefined) continue;
      map.cells[i] = { ...c, obstacle: "forest", road: false };
    }
    // Nor does a pickup come to seal a way.
    if (newSeal(map, sealed)) {
      cells.forEach((i, k) => {
        const c = was[k];
        if (c !== undefined) map.cells[i] = c;
      });
      for (const i of cells) filled.delete(i);
      continue;
    }
    for (const i of cells) {
      solid[i] = 1;
      out.push([i % w, Math.floor(i / w)]);
    }
  }
  return out;
}

/**
 * Whether walling `cells` (on `solid`, ground walls and footprints) keeps
 * every part of the open ground (`whole`, its labels before) in one piece.
 */
function keepsWhole(
  w: number,
  h: number,
  solid: Uint8Array,
  whole: Int32Array,
  cells: readonly number[],
): boolean {
  const trial = solid.slice();
  for (const i of cells) trial[i] = 1;
  const after = labelOpen(w, h, trial, (i) => trial[i] === 0);
  const seen = new Map<number, number>();
  for (let i = 0; i < w * h; i++) {
    const a = after[i] ?? -1;
    if (a < 0) continue;
    const b = whole[i] ?? -1;
    const was = seen.get(b);
    if (was === undefined) seen.set(b, a);
    else if (was !== a) return false;
  }
  return true;
}

/**
 * Whether every mountain cell round `i` keeps an all-mountain 2x2 block
 * once `i` (and the cells `also`) are cleared.
 */
function mountainsStaySquare(
  map: GameMap,
  i: number,
  also: readonly number[] = [],
): boolean {
  const { width: w, height: h } = map;
  const x0 = i % w;
  const y0 = Math.floor(i / w);
  const rock = (x: number, y: number): boolean =>
    x >= 0 &&
    y >= 0 &&
    x < w &&
    y < h &&
    !(x === x0 && y === y0) &&
    !also.includes(y * w + x) &&
    map.cells[y * w + x]?.obstacle === "mountain";
  for (const [dx, dy] of N8) {
    const x = x0 + dx;
    const y = y0 + dy;
    if (!rock(x, y)) continue;
    let square = false;
    for (const [sx, sy] of [
      [0, 0],
      [-1, 0],
      [0, -1],
      [-1, -1],
    ] as const) {
      if (
        rock(x + sx, y + sy) &&
        rock(x + sx + 1, y + sy) &&
        rock(x + sx, y + sy + 1) &&
        rock(x + sx + 1, y + sy + 1)
      )
        square = true;
    }
    if (!square) return false;
  }
  return true;
}

/** The longest run of wood or rock cleared for one way round. */
const DIG_MAX = 3;

/**
 * Opens a way round each building group still in a way: a short run (up
 * to DIG_MAX cells, wood first) of wood or rock within three cells of it
 * that joins two of its sides, cleared where everything round the run
 * outside the guards' zones already lies on one stretch of ground between
 * guards and gates (so no new way past a guard, gate or range opens);
 * a run that keeps every range in 2x2 blocks first. Returns the cells
 * cleared.
 */
function digWaysRound(map: GameMap): Array<[number, number]> {
  const { width: w, height: h } = map;
  const out: Array<[number, number]> = [];
  const inside = (x: number, y: number): boolean =>
    x >= 1 && y >= 1 && x < w - 1 && y < h - 1;
  for (let pass = 0; pass < 8; pass++) {
    const { wall, at, label, groups } = blockGroups(map);
    if (groups.length === 0) break;
    // Ground between guards and gates: buildings and pickups walkable.
    const held = new Uint8Array(w * h);
    for (const o of map.objects) {
      if (o.kind === "gate") held[o.y * w + o.x] = 1;
      if (o.kind !== "monster") continue;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = o.x + dx;
          const y = o.y + dy;
          if (x >= 0 && y >= 0 && x < w && y < h) held[y * w + x] = 1;
        }
    }
    const gate = new Uint8Array(w * h);
    for (const o of map.objects) if (o.kind === "gate") gate[o.y * w + o.x] = 1;
    // A closed gate is a wall, corners too.
    const shut = wall.slice();
    for (let i = 0; i < w * h; i++) if (gate[i]) shut[i] = 1;
    const stretch = labelOpen(w, h, shut, (i) => shut[i] === 0 && !held[i]);
    const diggable = (i: number): boolean => {
      const c = map.cells[i];
      return (
        c !== undefined &&
        c.terrain !== "water" &&
        c.prop !== true &&
        c.obstacle !== "none"
      );
    };
    /** Open cells a run steps to (with the run open), and their labels. */
    const touches = (
      run: readonly number[],
    ): { sides: Set<number>; stretches: Set<number> } => {
      const open = (k: number): boolean => wall[k] === 0 || run.includes(k);
      const sides = new Set<number>();
      const stretches = new Set<number>();
      let gateBy = false;
      for (const c of run) {
        const cx = c % w;
        const cy = Math.floor(c / w);
        for (const [dx, dy] of N8) {
          const j = (cy + dy) * w + cx + dx;
          if (gate[j]) gateBy = true;
          if (wall[j] || !stepOk(w, c, dx, dy, open)) continue;
          // A way through a zone of control still meets its guard.
          if (!held[j]) stretches.add(stretch[j] ?? -1);
          if ((at[j] ?? -1) < 0) sides.add(label[j] ?? -1);
        }
      }
      // Never a way round a gate.
      if (gateBy) stretches.add(-2).add(-3);
      return { sides, stretches };
    };
    let dug = false;
    for (const g of groups) {
      const sides = new Set(g.sides);
      let x0 = w;
      let y0 = h;
      let x1 = 0;
      let y1 = 0;
      for (const b of g.cells) {
        x0 = Math.min(x0, (b % w) - 3);
        y0 = Math.min(y0, Math.floor(b / w) - 3);
        x1 = Math.max(x1, (b % w) + 3);
        y1 = Math.max(y1, Math.floor(b / w) + 3);
      }
      const box = (i: number): boolean => {
        const x = i % w;
        const y = Math.floor(i / w);
        return x >= x0 && y >= y0 && x <= x1 && y <= y1 && inside(x, y);
      };
      // Runs grow from the cells beside a side, shortest first.
      let runs: number[][] = [];
      for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++)
        for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) {
          const i = y * w + x;
          if (!box(i) || !diggable(i)) continue;
          if (touches([i]).sides.size > 0) runs.push([i]);
        }
      runs.sort(
        (a, b) =>
          (map.cells[a[0] as number]?.obstacle === "forest" ? 0 : 1) -
            (map.cells[b[0] as number]?.obstacle === "forest" ? 0 : 1) ||
          (a[0] as number) - (b[0] as number),
      );
      let found: number[] | undefined;
      let ragged: number[] | undefined;
      const tried = new Set<string>();
      for (let len = 1; len <= DIG_MAX && found === undefined; len++) {
        const longer: number[][] = [];
        for (const run of runs) {
          const t = touches(run);
          const mine = [...t.sides].filter((l) => sides.has(l));
          if (
            mine.length >= 2 &&
            mine.length === t.sides.size &&
            t.stretches.size <= 1
          ) {
            const square = run.every(
              (c, k) =>
                map.cells[c]?.obstacle !== "mountain" ||
                mountainsStaySquare(map, c, run.slice(0, k)),
            );
            if (square) {
              found = run;
              break;
            }
            // A range left ragged only when nothing tidier opens a way.
            ragged ??= run;
          }
          if (len === DIG_MAX) continue;
          const last = run[run.length - 1] as number;
          for (const [dx, dy] of N8) {
            if (dx !== 0 && dy !== 0) continue;
            const j = last + dx + dy * w;
            if (!box(j) || !diggable(j) || run.includes(j)) continue;
            const next = [...run, j];
            const key = [...next].sort((p, q) => p - q).join(",");
            if (tried.has(key)) continue;
            tried.add(key);
            longer.push(next);
          }
        }
        runs = longer;
      }
      found ??= ragged;
      if (found === undefined) continue;
      for (const c of found) {
        const cell = map.cells[c];
        if (cell === undefined) continue;
        map.cells[c] = { ...cell, obstacle: "none" };
        out.push([c % w, Math.floor(c / w)]);
      }
      dug = true;
      // One run per pass: the groups change once a way opens.
      break;
    }
    if (!dug) break;
  }
  return out;
}

/**
 * Whether `next` is closer to no obstruction than `now`: less ground cut
 * off, or as much and fewer buildings in a way.
 */
function better(next: Obstruction, now: Obstruction): boolean {
  return (
    next.cutCells < now.cutCells ||
    (next.cutCells === now.cutCells &&
      next.blockers.length < now.blockers.length)
  );
}

/**
 * Whether pickup `p` at (x, y) would seal a way: with every pickup a wall
 * (buildings open), the open cells round (x, y) no longer join.
 */
function sealsWay(map: GameMap, x: number, y: number, p: MapObject): boolean {
  const { width: w, height: h } = map;
  const wall = wallMask(map);
  const pick = new Set<number>();
  for (const o of map.objects)
    if (o !== p && pickupRule(o)) pick.add(o.y * w + o.x);
  const c = y * w + x;
  return !leavesWayRound(
    w,
    h,
    c,
    [c],
    (k) => wall[k] === 0 && !pick.has(k),
    () => false,
  );
}

/** How far a building may move when it leaves its guard behind. */
const FAR_RADIUS = 8;

/** Every offset within `radius` (Chebyshev), nearest first. */
function offsetsWithin(radius: number): Array<[number, number]> {
  const offsets: Array<[number, number]> = [];
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++)
      if (dx !== 0 || dy !== 0) offsets.push([dx, dy]);
  const cheb = (p: readonly [number, number]): number =>
    Math.max(Math.abs(p[0]), Math.abs(p[1]));
  return offsets.sort(
    (a, b) =>
      cheb(a) - cheb(b) ||
      a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]) ||
      a[1] - b[1] ||
      a[0] - b[0],
  );
}

/**
 * Gets every building that stands in a way ({@link findObstructions}) out
 * of it (bead bzc.110: the named maps, placed as authored, after their
 * edits), least change first:
 *
 * 1. an empty dead end of a few cells behind a building grows wood;
 * 2. a building moves to the nearest place within `radius` cells
 *    (Chebyshev), its footprint shifted alike, where it leaves a way round
 *    itself (without a pickup too): open land off the roads that no other
 *    object, waystone exit or other guard's zone of control takes, on the
 *    same ground, zone and stretch between guards and gates, held by its
 *    guard if it has one (in its zone or the room behind it), entered from
 *    two cells; as near each start as before if it can be (the fairness
 *    counts), its footprint never on a way between starts or within the
 *    starts' first days, and the cells it leaves joining no two stretches;
 * 3. a building trades places with a pickup next to it or in the nook
 *    behind it (or one of its own guard's nearby), where the pickup seals
 *    no way;
 * 4. a short run of wood or rock opens a way round, never past a guard
 *    outside its zone, a gate or a range;
 * 5. a building moves farther (eight cells, then anywhere in its zone),
 *    leaving its guard behind if it must (never a mine).
 *
 * Every step must cut off less ground (or as much, with fewer buildings
 * in a way) and no pickup may come to seal a way; the passes repeat while
 * they help.
 */
export function keepWaysRound(map: GameMap, radius = 4): AsideReport {
  const report: AsideReport = {
    moved: [],
    swapped: [],
    filled: [],
    dug: [],
    left: [],
  };
  // Each pass frees room for the next (a building moved off a dead end
  // lets the next one out), until nothing more helps.
  for (let pass = 0; pass < PASSES; pass++) {
    const before = findObstructions(map);
    if (before.blockers.length === 0) break;
    const left = repairPass(map, radius, report);
    if (!better(left, before)) break;
  }
  report.left = findObstructions(map).blockers;
  return report;
}

/** How many times the repairs run over a map at most. */
const PASSES = 3;

/** One pass of the repairs (see keepWaysRound); what is left in a way. */
function repairPass(
  map: GameMap,
  radius: number,
  report: AsideReport,
): Obstruction {
  report.filled.push(...fillDeadEnds(map));
  let current = findObstructions(map);
  if (current.blockers.length === 0) return current;
  // The starts' reach and the ways between them, as the pass began.
  const starts = startCosts(map);
  const corridor = startCorridors(map, starts);
  /** Pickups that seal a way: no repair adds one. */
  const sealed = sealingPickups(map);
  const byId = new Map(map.objects.map((o) => [o.id, o]));
  /** Moves each blocker it can; a move that does not help is undone. */
  const moveAll = (
    offsets: ReadonlyArray<readonly [number, number]>,
    unguard: boolean,
  ): void => {
    const ground = new Ground(map, starts, corridor);
    for (const id of [...current.blockers]) {
      if (!current.blockers.includes(id)) continue;
      const o = byId.get(id);
      if (o === undefined) continue;
      const from: [number, number] = [o.x, o.y];
      const was = o.blocked.map(([x, y]) => [x, y] as [number, number]);
      const to = moveAside(map, ground, o, offsets, unguard);
      if (to === undefined) continue;
      const next = findObstructions(map);
      if (!better(next, current)) {
        ground.remove(o);
        o.x = from[0];
        o.y = from[1];
        o.blocked = was;
        ground.add(o);
        continue;
      }
      if (unguard) {
        for (const m of map.objects) {
          const held = m.data["guards"];
          if (m.kind !== "monster" || !Array.isArray(held)) continue;
          if (held.includes(o.id))
            m.data = { ...m.data, guards: held.filter((g) => g !== o.id) };
        }
      }
      report.moved.push({ id: o.id, from, to });
      current = next;
    }
  };
  const offsets = offsetsWithin(radius);
  for (let round = 0; round < 3 && current.blockers.length > 0; round++) {
    const before = report.moved.length;
    moveAll(offsets, false);
    if (report.moved.length === before) break;
  }
  // A building changes places with a pickup that stands next to it or in
  // the small ground behind it, else with a pickup nearby held by the same
  // guard (or by none): a pickup may stand in the way.
  if (current.blockers.length > 0) {
    const guardsOf = new Map<string, string>();
    for (const m of map.objects) {
      const held = m.data["guards"];
      if (m.kind === "monster" && Array.isArray(held))
        for (const id of held) guardsOf.set(String(id), m.id);
    }
    const w = map.width;
    const cheb1 = (p: MapObject, o: MapObject): number =>
      Math.max(Math.abs(p.x - o.x), Math.abs(p.y - o.y));
    for (const id of [...current.blockers]) {
      if (!current.blockers.includes(id)) continue;
      const o = byId.get(id);
      if (o === undefined || o.blocked.length > 0) continue;
      const { label, size, groups } = blockGroups(map);
      const mine = groups.find((g) => g.cells.includes(o.y * w + o.x));
      const behind = new Set(
        (mine?.sides.slice(1) ?? []).filter((l) => (size.get(l) ?? 0) <= 8),
      );
      const movable = (p: MapObject): boolean =>
        p !== o && p.blocked.length === 0 && pickupRule(p);
      const close = map.objects.filter(
        (p) =>
          movable(p) &&
          (cheb1(p, o) <= 1 ||
            (cheb1(p, o) <= SWAP_BEHIND &&
              behind.has(label[p.y * w + p.x] ?? -1))),
      );
      const held = map.objects
        .filter(
          (p) =>
            movable(p) &&
            pickupRule(p) &&
            !close.includes(p) &&
            guardsOf.get(p.id) === guardsOf.get(o.id) &&
            cheb1(p, o) <= radius,
        )
        .sort((a, b) => cheb1(a, o) - cheb1(b, o) || a.y - b.y || a.x - b.x)
        .slice(0, SWAP_NEAR);
      for (const p of [...close, ...held]) {
        const at: [number, number] = [o.x, o.y];
        // A pickup in its new place still seals no way (taken from
        // beside it, it is a wall until then).
        if (pickupRule(p) && sealsWay(map, at[0], at[1], p)) continue;
        [o.x, o.y, p.x, p.y] = [p.x, p.y, o.x, o.y];
        const next = findObstructions(map);
        if (!better(next, current) || newSeal(map, sealed)) {
          [o.x, o.y, p.x, p.y] = [p.x, p.y, o.x, o.y];
          continue;
        }
        report.swapped.push({ id: o.id, with: p.id, from: at, to: [o.x, o.y] });
        current = next;
        break;
      }
    }
  }
  if (current.blockers.length > 0) {
    report.filled.push(...fillDeadEnds(map));
    report.dug.push(...digWaysRound(map));
    current = findObstructions(map);
  }
  // Last: a farther move, leaving its guard behind if it must (a building
  // packed into a dead end with others has no room near its guard).
  if (current.blockers.length > 0) moveAll(offsetsWithin(FAR_RADIUS), true);
  // Then anywhere in its zone.
  if (current.blockers.length > 0)
    moveAll(offsetsWithin(Math.max(map.width, map.height)), true);
  if (current.blockers.length > 0) {
    report.filled.push(...fillDeadEnds(map));
    current = findObstructions(map);
  }
  return current;
}

/**
 * What a move must keep off (bead bzc.110), kept up to date as objects
 * move: open land, the cells objects take (waystone exits too), building
 * entrances and the guards' zones of control (counts, as zones overlap).
 */
class Ground {
  readonly w: number;
  readonly h: number;
  /** Ground walls (water, wood, rock, props) and footprints (counts). */
  readonly wall: Uint8Array;
  readonly taken: Uint8Array;
  readonly building: Uint8Array;
  readonly zoc: Uint8Array;
  private readonly land: Uint8Array;
  /** Per guard: the labels of open ground with its zone shut (cached). */
  private readonly behind = new Map<string, Int32Array>();
  private readonly guardOf = new Map<string, MapObject>();
  private readonly map: GameMap;

  constructor(
    map: GameMap,
    starts: Float64Array[] = startCosts(map),
    corridor: Uint8Array = startCorridors(map, starts),
  ) {
    this.map = map;
    const { width: w, height: h } = map;
    this.w = w;
    this.h = h;
    this.land = new Uint8Array(w * h);
    this.wall = new Uint8Array(w * h);
    this.taken = new Uint8Array(w * h);
    this.building = new Uint8Array(w * h);
    this.zoc = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const c = map.cells[i];
      if (c === undefined || !isPassable(c)) this.land[i] = 1;
      this.wall[i] = this.land[i] as number;
    }
    const gate = new Uint8Array(w * h);
    this.gate = gate;
    this.pickup = new Uint8Array(w * h);
    for (const o of map.objects)
      if (pickupRule(o) && this.inside(o.x, o.y))
        this.pickup[o.y * w + o.x] = 1;
    for (const o of map.objects) {
      this.add(o);
      const held = o.data["guards"];
      if (o.kind === "monster" && Array.isArray(held))
        for (const id of held) this.guardOf.set(String(id), o);
      if (o.kind === "gate" && this.inside(o.x, o.y)) gate[o.y * w + o.x] = 1;
    }
    this.starts = starts;
    this.corridor = corridor;
    // A closed gate is a wall, corners too.
    const shut = this.wall.slice();
    for (let i = 0; i < w * h; i++) if (gate[i]) shut[i] = 1;
    this.stretch = labelOpen(
      w,
      h,
      shut,
      (i) => shut[i] === 0 && this.zoc[i] === 0,
    );
    this.basin = labelOpen(w, h, shut, (i) => shut[i] === 0);
  }

  /**
   * Labels of the ground between guards' zones and gates (buildings and
   * pickups walkable), as it was when this was built.
   */
  readonly stretch: Int32Array;
  /** The same between gates only (guards passed). */
  readonly basin: Int32Array;
  /** Movement cost from each start town (gates shut), as fairness.ts. */
  readonly starts: Float64Array[];
  /** Cells on or next to a shortest way between two starts. */
  readonly corridor: Uint8Array;

  /** Whether cell `i` lies within HOME_DAYS of a start. */
  home(i: number): boolean {
    return this.starts.some((d) => (d[i] ?? Infinity) <= HOME_DAYS * DAY_MP);
  }

  /**
   * Whether a building at cell `to` stays as near each start as at `from`
   * for the fairness counts (within two days, within three, beyond).
   */
  sameReach(from: number, to: number): boolean {
    return this.starts.every(
      (d) => reachBand(d[from] ?? Infinity) === reachBand(d[to] ?? Infinity),
    );
  }
  private readonly gate: Uint8Array;
  /** Pickups' cells (they do not move while a Ground is in use). */
  readonly pickup: Uint8Array;

  /**
   * Whether opening the cells `left` (a footprint moved off them; `now`
   * the cells it takes instead) joins no two stretches of ground: every
   * open cell they step to outside the guards' zones lies on one stretch,
   * and none is a gate.
   */
  closesNothing(
    left: ReadonlyArray<readonly [number, number]>,
    now: readonly number[],
  ): boolean {
    const { w } = this;
    const freed = left
      .map(([x, y]) => y * w + x)
      .filter((i) => !now.includes(i) && (this.land[i] ?? 1) === 0);
    if (freed.length === 0) return true;
    const open = (k: number): boolean =>
      freed.includes(k) || ((this.wall[k] ?? 1) === 0 && !now.includes(k));
    const seen = new Set<number>();
    for (const c of freed) {
      const cx = c % w;
      const cy = Math.floor(c / w);
      for (const [dx, dy] of N8) {
        if (!this.inside(cx + dx, cy + dy)) continue;
        const j = c + dx + dy * w;
        if (freed.includes(j) || !open(j) || !stepOk(w, c, dx, dy, open))
          continue;
        if (this.gate[j]) return false;
        if (this.zoc[j]) continue;
        seen.add(this.stretch[j] ?? -1);
      }
    }
    return seen.size <= 1;
  }

  /** The labels (of `of`) an object's entrance steps to. */
  labelsBy(of: Int32Array, x: number, y: number): Set<number> {
    const out = new Set<number>();
    for (const [dx, dy] of [[0, 0] as const, ...N8]) {
      if (!this.inside(x + dx, y + dy)) continue;
      const l = of[(y + dy) * this.w + x + dx] ?? -1;
      if (l >= 0) out.add(l);
    }
    return out;
  }

  private inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  private mark(o: MapObject, d: 1 | -1): void {
    const { w } = this;
    for (const [x, y] of o.blocked) {
      if (!this.inside(x, y)) continue;
      (this.wall[y * w + x] as number) += d;
      (this.taken[y * w + x] as number) += d;
    }
    if (this.inside(o.x, o.y)) {
      (this.taken[o.y * w + o.x] as number) += d;
      if (isBuilding(o)) (this.building[o.y * w + o.x] as number) += d;
    }
    const exit = o.data["exit"];
    if (Array.isArray(exit) && typeof exit[0] === "number") {
      const [ex, ey] = exit as [number, number];
      if (this.inside(ex, ey)) (this.taken[ey * w + ex] as number) += d;
    }
    if (o.kind === "monster") {
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (this.inside(o.x + dx, o.y + dy))
            (this.zoc[(o.y + dy) * w + o.x + dx] as number) += d;
    }
  }

  add(o: MapObject): void {
    this.mark(o, 1);
  }

  remove(o: MapObject): void {
    this.mark(o, -1);
  }

  /** The guard that holds `o`, if any. */
  guard(o: MapObject): MapObject | undefined {
    return this.guardOf.get(o.id);
  }

  /**
   * The cells `guard` holds for `o`: its zone of control (not the guard's
   * own cell) and the open ground next to o's entrance that reaches no
   * town without crossing that zone (a pocket's room).
   */
  held(o: MapObject, guard: MapObject): (i: number) => boolean {
    const { w, h } = this;
    let label = this.behind.get(guard.id);
    if (label === undefined) {
      const near = (i: number): boolean =>
        Math.max(
          Math.abs((i % w) - guard.x),
          Math.abs(Math.floor(i / w) - guard.y),
        ) <= 1;
      label = labelOpen(w, h, this.wall, (i) => this.wall[i] === 0 && !near(i));
      this.behind.set(guard.id, label);
    }
    const lab = label;
    const towns = new Set<number>();
    for (const t of this.map.objects) {
      if (t.kind !== "town") continue;
      const l = lab[t.y * w + t.x] ?? -1;
      if (l >= 0) towns.add(l);
    }
    const behind = new Set<number>();
    for (const [dx, dy] of [[0, 0] as const, ...N8]) {
      const x = o.x + dx;
      const y = o.y + dy;
      if (!this.inside(x, y)) continue;
      const l = lab[y * w + x] ?? -1;
      if (l >= 0 && !towns.has(l)) behind.add(l);
    }
    return (i) => {
      const cheb = Math.max(
        Math.abs((i % w) - guard.x),
        Math.abs(Math.floor(i / w) - guard.y),
      );
      if (cheb === 1) return true;
      return cheb > 1 && behind.has(lab[i] ?? -1);
    };
  }
}

/** The fairness bands of a cost (fairness.ts): two days, three, beyond. */
function reachBand(cost: number): number {
  const days = cost / DAY_MP;
  return days <= 2 ? 0 : days <= 3 ? 1 : 2;
}

/** Movement cost from each start town (gates shut). */
function startCosts(map: GameMap): Float64Array[] {
  return startTownsOf(map).map((t) => travelCosts(map, t.x, t.y));
}

/**
 * The days round each start where no repair puts a new footprint wall (the
 * starts' free loot, mines, sites and first fights stay as balanced).
 */
const HOME_DAYS = 3;

/** How much longer than the shortest a way between starts may run. */
const CORRIDOR_SLACK = DAY_MP / 4;

/**
 * The cells on a way between two starts no more than CORRIDOR_SLACK
 * longer than the shortest: no repair walls them (the start-to-start
 * fairness stays as balanced).
 */
function startCorridors(map: GameMap, costs: Float64Array[]): Uint8Array {
  const out = new Uint8Array(map.width * map.height);
  const towns = startTownsOf(map);
  for (let a = 0; a < towns.length; a++)
    for (let b = a + 1; b < towns.length; b++) {
      const da = costs[a];
      const db = costs[b];
      const tb = towns[b];
      if (da === undefined || db === undefined || tb === undefined) continue;
      const total = da[tb.y * map.width + tb.x] ?? Infinity;
      if (!Number.isFinite(total)) continue;
      for (let i = 0; i < out.length; i++)
        if ((da[i] ?? Infinity) + (db[i] ?? Infinity) <= total + CORRIDOR_SLACK)
          out[i] = 1;
    }
  return out;
}

/**
 * Moves `o` to the first offset where it leaves a way round, keeping
 * `ground` up to date; its new entrance, or undefined (unmoved).
 */
function moveAside(
  map: GameMap,
  ground: Ground,
  o: MapObject,
  offsets: ReadonlyArray<readonly [number, number]>,
  /** Leave its guard behind (it must then keep out of every zone). */
  unguard = false,
): [number, number] | undefined {
  const { width: w, height: h } = map;
  const idx = (x: number, y: number): number => y * w + x;
  const inside = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < w && y < h;
  const { wall, taken, building, zoc } = ground;
  // A mine keeps its guard (the starts' free mines are balanced).
  if (unguard && o.kind === "mine") return undefined;
  const guard = unguard ? undefined : ground.guard(o);
  // A guarded building stays held: its new entrance lies in its guard's
  // zone of control (as the generator puts a site's guard beside it) or
  // behind it (the ground its old entrance reached without crossing the
  // zone: a pocket's room).
  const held = guard === undefined ? undefined : ground.held(o, guard);
  // An unguarded one stays on its stretch of ground (never past a guard
  // or gate; one that leaves its guard, never past a gate), and every one
  // on its own ground (the winter sites on snow).
  const area = unguard ? ground.basin : ground.stretch;
  const stretches = ground.labelsBy(area, o.x, o.y);
  const basins = ground.labelsBy(ground.basin, o.x, o.y);
  const terrain = map.cells[o.y * w + o.x]?.terrain;
  const zone = map.zones?.[o.y * w + o.x];
  const wasFoot = new Set(o.blocked.map(([x, y]) => y * w + x));
  ground.remove(o);
  // As near each start as before first (the fairness counts stay as they
  // were), then anywhere.
  for (const near of [true, false])
    for (const [dx, dy] of offsets) {
      const ex = o.x + dx;
      const ey = o.y + dy;
      if (!inside(ex, ey)) continue;
      const e = idx(ex, ey);
      if (held !== undefined && !held(e)) continue;
      if (map.cells[e]?.terrain !== terrain || map.zones?.[e] !== zone)
        continue;
      if (near && !ground.sameReach(o.y * w + o.x, e)) continue;
      if (held === undefined && !stretches.has(area[e] ?? -1)) continue;
      if (held !== undefined && !basins.has(ground.basin[e] ?? -1)) continue;
      // No other guard's zone of control.
      const own =
        guard !== undefined &&
        Math.max(Math.abs(guard.x - ex), Math.abs(guard.y - ey)) <= 1
          ? 1
          : 0;
      if ((zoc[e] ?? 0) > own) continue;
      const cells: number[] = [];
      let ok = true;
      for (const [x, y] of [[o.x, o.y] as const, ...o.blocked]) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inside(nx, ny)) {
          ok = false;
          break;
        }
        const k = idx(nx, ny);
        if (wall[k] || taken[k] || map.cells[k]?.road === true) {
          ok = false;
          break;
        }
        // Its footprint walls no way between starts, nor any ground within
        // the starts' first days, that it did not wall before.
        if (
          k !== e &&
          !wasFoot.has(k) &&
          (ground.corridor[k] || ground.home(k))
        ) {
          ok = false;
          break;
        }
        cells.push(k);
      }
      if (!ok) continue;
      // Entered from two open cells at least.
      const open = (k: number): boolean => wall[k] === 0 && !cells.includes(k);
      let ways = 0;
      for (const [sx, sy] of N8) {
        if (!inside(ex + sx, ey + sy)) continue;
        const j = idx(ex + sx, ey + sy);
        if (!open(j) || taken[j] || building[j]) continue;
        if (sx !== 0 && sy !== 0 && !open(e + sx) && !open(e + sy * w))
          continue;
        ways++;
      }
      if (ways < 2) continue;
      // Round it without a pickup too, so no pickup comes to seal a way.
      const roomy = leavesWayRound(
        w,
        h,
        e,
        cells,
        (k) => wall[k] === 0,
        (k) => (building[k] ?? 0) > 0 || ground.pickup[k] === 1,
      );
      if (!roomy) continue;
      // The footprint it leaves opens no way past a guard, gate or range.
      if (!ground.closesNothing(o.blocked, cells)) continue;
      o.x = ex;
      o.y = ey;
      o.blocked = o.blocked.map(
        ([x, y]) => [x + dx, y + dy] as [number, number],
      );
      ground.add(o);
      return [ex, ey];
    }
  ground.add(o);
  return undefined;
}
