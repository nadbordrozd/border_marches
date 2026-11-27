/**
 * Start fairness of a map (bead bzc.18): what each player start can reach
 * and how far, so a named map can be checked for fair starts.
 *
 * Costs are movement points (GAME_DESIGN 7.1: 8-way, diagonal x1.414, road
 * 75 between two road cells, no corner cutting, 1500 a day) from the start
 * town's entrance. Object footprints and gates block; neutral stacks do not
 * (a guard is a fight, not a wall), but "free" counts only what is reachable
 * without stepping into any guard's zone of control.
 */
import { isNavalMap, seaMask } from "../game/naval.ts";
import { DEFAULT_GEN_CONFIG } from "./gen/config.ts";
import type { GameMap, MapObject, ResourceId } from "./types.ts";
import { DIRECTIONS_8, cellAt, inBounds, isPassable } from "./types.ts";

export const DAY_MP = DEFAULT_GEN_CONFIG.movement.day;

const RESOURCES: readonly ResourceId[] = ["wood", "ore", "gold", "essence"];

/** Gold-equivalent value of one unit (CONTENT_MAP_OBJECTS section 2). */
const UNIT: Readonly<Record<ResourceId, number>> = {
  gold: 1,
  wood: 100,
  ore: 150,
  essence: 500,
};

export interface StartFairness {
  player: number;
  townId: string;
  /** Days to the nearest neutral town (not a start, not the Hold). */
  neutralTown: number;
  /** Days to the nearest mine of each resource. */
  mine: Record<ResourceId, number>;
  /**
   * Gold-equivalent value of resource piles and chests reachable within two
   * days without entering a guard's zone of control.
   */
  freeLoot: number;
  /** Mines reachable within two days without entering a zone of control. */
  freeMines: number;
  /** Visitable objects (not stacks, starts or towns) within three days. */
  nearSites: number;
  /** Fight value of the neutral stacks within two days (the first fights). */
  nearGuards: number;
  /**
   * Naval maps only (NAVAL 8.4, bead bzc.155): days from the start town to
   * open sea, its first deep sea cell (no land beside it; walking to
   * the shore and sailing; a ship at hand assumed).
   */
  openSea?: number;
  /**
   * Naval maps only: fight value of the guard on the first strait the
   * start reaches by sea (0 when the map has no strait).
   */
  firstStrait?: number;
}

export interface FairnessReport {
  starts: StartFairness[];
  /** Days between every pair of start towns, [a, b, days]. */
  pairs: Array<[number, number, number]>;
}

export interface TravelOptions {
  /** Cells the hero may not enter (e.g. guards' zones of control). */
  avoid?: ReadonlySet<number>;
  /** Treat every gate as open (default: every gate is closed). */
  gatesOpen?: boolean;
  /**
   * Sail the seas of a naval map too (bead bzc.155): a sea cell costs 100
   * a step (141 diagonally), boarding and landing nothing extra.
   */
  sail?: boolean;
}

/**
 * Movement cost from (sx, sy) to every cell, in movement points
 * (Infinity where unreachable).
 */
export function travelCosts(
  map: GameMap,
  sx: number,
  sy: number,
  options: TravelOptions = {},
): Float64Array {
  const { avoid, gatesOpen = false, sail = false } = options;
  const w = map.width;
  const sea = sail && isNavalMap(map) ? seaMask(map) : undefined;
  const closed = new Set<number>();
  for (const o of map.objects) {
    for (const [x, y] of o.blocked) closed.add(y * w + x);
    if (o.kind === "gate" && !gatesOpen) closed.add(o.y * w + o.x);
  }
  const cost = DEFAULT_GEN_CONFIG.movement.cost as Record<string, number>;
  const road = DEFAULT_GEN_CONFIG.movement.road;
  const walk = (x: number, y: number): boolean => {
    if (!inBounds(map, x, y)) return false;
    const i = y * w + x;
    const c = map.cells[i];
    return (
      c !== undefined &&
      (isPassable(c) || sea?.[i] === 1) &&
      !closed.has(i) &&
      !(avoid?.has(i) ?? false)
    );
  };
  const dist = new Float64Array(w * map.height).fill(Infinity);
  const start = sy * w + sx;
  dist[start] = 0;
  const heap: Array<[number, number]> = [[0, start]];
  const push = (item: [number, number]): void => {
    heap.push(item);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      const parent = heap[p] as [number, number];
      if (parent[0] <= item[0]) break;
      heap[k] = parent;
      k = p;
    }
    heap[k] = item;
  };
  const pop = (): [number, number] => {
    const top = heap[0] as [number, number];
    const last = heap.pop() as [number, number];
    if (heap.length > 0) {
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        if (l >= heap.length) break;
        const r = l + 1;
        const c =
          r < heap.length &&
          (heap[r] as [number, number])[0] < (heap[l] as [number, number])[0]
            ? r
            : l;
        const child = heap[c] as [number, number];
        if (child[0] >= last[0]) break;
        heap[k] = child;
        k = c;
      }
      heap[k] = last;
    }
    return top;
  };
  while (heap.length > 0) {
    const [d, i] = pop();
    if (d > (dist[i] ?? Infinity)) continue;
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy] of DIRECTIONS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!walk(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && !walk(x + dx, y) && !walk(x, y + dy)) {
        continue;
      }
      const a = cellAt(map, x, y);
      const b = cellAt(map, nx, ny);
      if (a === undefined || b === undefined) continue;
      const base =
        sea?.[ny * w + nx] === 1
          ? 100
          : a.road && b.road
            ? road
            : (cost[b.terrain] ?? 100);
      const step = dx !== 0 && dy !== 0 ? Math.round(base * 1.414) : base;
      const j = ny * w + nx;
      if (d + step < (dist[j] ?? Infinity)) {
        dist[j] = d + step;
        push([d + step, j]);
      }
    }
  }
  return dist;
}

/** Every neutral stack's cell and the eight round it. */
export function zonesOfControl(map: GameMap): Set<number> {
  const out = new Set<number>();
  for (const o of map.objects) {
    if (o.kind !== "monster") continue;
    out.add(o.y * map.width + o.x);
    for (const [dx, dy] of DIRECTIONS_8) {
      if (inBounds(map, o.x + dx, o.y + dy)) {
        out.add((o.y + dy) * map.width + o.x + dx);
      }
    }
  }
  return out;
}

/** Start towns (owned or open), in player order. */
export function startTownsOf(map: GameMap): MapObject[] {
  return map.objects
    .filter((o) => o.kind === "town" && typeof o.data["start"] === "number")
    .sort((a, b) => Number(a.data["start"]) - Number(b.data["start"]));
}

function pickupValue(o: MapObject): number {
  if (o.data["chest"] === true || o.data["type"] === "treasure-chest") {
    return 1000;
  }
  const r = o.data["resource"] as ResourceId | undefined;
  const n = Number(o.data["amount"] ?? 0);
  return r !== undefined && r in UNIT ? n * UNIT[r] : 0;
}

/** Fairness numbers per start and between starts. */
export function startFairness(map: GameMap): FairnessReport {
  const w = map.width;
  const starts = startTownsOf(map);
  const zoc = zonesOfControl(map);
  const at = (d: Float64Array, o: MapObject): number =>
    (d[o.y * w + o.x] ?? Infinity) / DAY_MP;
  const nearest = (d: Float64Array, list: readonly MapObject[]): number =>
    list.reduce((m, o) => Math.min(m, at(d, o)), Infinity);
  const neutralTowns = map.objects.filter(
    (o) =>
      o.kind === "town" &&
      o.data["hold"] === false &&
      typeof o.data["start"] !== "number",
  );
  const mines = map.objects.filter((o) => o.kind === "mine");
  const loot = map.objects.filter((o) => o.kind === "pickup");
  const sites = map.objects.filter((o) =>
    ["site", "dwelling", "bank", "artifact", "mine", "pickup"].includes(o.kind),
  );
  const stacks = map.objects.filter((o) => o.kind === "monster");
  const report: FairnessReport = { starts: [], pairs: [] };
  const costs: Float64Array[] = [];
  for (const t of starts) {
    const d = travelCosts(map, t.x, t.y);
    const free = travelCosts(map, t.x, t.y, { avoid: zoc });
    costs.push(d);
    const mine = {} as Record<ResourceId, number>;
    for (const r of RESOURCES) {
      mine[r] = nearest(
        d,
        mines.filter((m) => m.data["resource"] === r),
      );
    }
    report.starts.push({
      player: Number(t.data["start"]),
      townId: t.id,
      neutralTown: nearest(d, neutralTowns),
      mine,
      freeLoot: loot
        .filter((o) => at(free, o) <= 2)
        .reduce((n, o) => n + pickupValue(o), 0),
      freeMines: mines.filter((o) => at(free, o) <= 2).length,
      nearSites: sites.filter((o) => at(d, o) <= 3).length,
      nearGuards: stacks
        .filter((o) => at(d, o) <= 2)
        .reduce((n, o) => n + Number(o.data["fv"] ?? 0), 0),
    });
  }
  if (isNavalMap(map)) navalFairness(map, starts, report);
  starts.forEach((a, i) => {
    starts.forEach((b, j) => {
      if (j <= i) return;
      const d = costs[i];
      if (d === undefined) return;
      report.pairs.push([
        Number(a.data["start"]),
        Number(b.data["start"]),
        at(d, b),
      ]);
    });
  });
  return report;
}

/**
 * The two naval measures of NAVAL 8.4 (bead bzc.155), per start: days to
 * open sea and the first strait's guard.
 */
function navalFairness(
  map: GameMap,
  starts: readonly MapObject[],
  report: FairnessReport,
): void {
  const w = map.width;
  const sea = seaMask(map);
  // The Hold's straits (the strongest on the sea, NAVAL 8.5) are a goal,
  // not a start's first way out.
  const straits = map.objects.filter(
    (o) =>
      o.kind === "monster" &&
      o.data["strait"] === true &&
      o.data["holdStrait"] !== true,
  );
  starts.forEach((t, k) => {
    const entry = report.starts[k];
    if (entry === undefined) return;
    const d = travelCosts(map, t.x, t.y, { sail: true });
    let open = Infinity;
    for (let i = 0; i < sea.length; i++) {
      if (sea[i] !== 1 || map.cells[i]?.deep !== true) continue;
      open = Math.min(open, d[i] ?? Infinity);
    }
    entry.openSea = open / DAY_MP;
    let first: MapObject | undefined;
    for (const s of straits) {
      const c = d[s.y * w + s.x] ?? Infinity;
      if (first === undefined || c < (d[first.y * w + first.x] ?? Infinity))
        first = s;
    }
    entry.firstStrait = Number(first?.data["fv"] ?? 0);
  });
}
