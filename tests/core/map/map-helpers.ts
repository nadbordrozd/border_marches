/**
 * Test helpers for generated maps, independent of the generator's own code:
 * walkability and movement cost under GAME_DESIGN 7.1 (8-way, diagonal
 * x1.414, road 75 when both cells have road, no corner cutting between
 * impassable cells; the Chieftain is native to jungle).
 */
import {
  DIRECTIONS_8,
  cellAt,
  isPassable,
  objectBlockedSet,
} from "../../../src/core/map/types.ts";
import type { GameMap, MapObject } from "../../../src/core/map/types.ts";

export const DAY = 1500;

const COST: Record<string, number> = {
  grass: 100,
  steppe: 100,
  jungle: 100,
  badlands: 125,
  wasteland: 150,
  volcanic: 150,
};

/** Walkable ground not covered by an object footprint. */
export function walkable(map: GameMap): (x: number, y: number) => boolean {
  const blocked = objectBlockedSet(map);
  return (x, y) => {
    const c = cellAt(map, x, y);
    return c !== undefined && isPassable(c) && !blocked.has(y * map.width + x);
  };
}

/**
 * Movement cost from (sx, sy) to every cell. `block` marks extra cells the
 * hero may not enter (e.g. a guard's zone of control).
 */
export function moveCosts(
  map: GameMap,
  sx: number,
  sy: number,
  block?: (x: number, y: number) => boolean,
): Float64Array {
  const base = walkable(map);
  const walk = (x: number, y: number): boolean =>
    base(x, y) && !(block?.(x, y) ?? false);
  const w = map.width;
  const dist = new Float64Array(w * map.height).fill(Infinity);
  dist[sy * w + sx] = 0;
  // Binary heap of [cost, cell].
  const heap: Array<[number, number]> = [[0, sy * w + sx]];
  const push = (item: [number, number]): void => {
    heap.push(item);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p]![0] <= item[0]) break;
      heap[k] = heap[p]!;
      k = p;
    }
    heap[k] = item;
  };
  const pop = (): [number, number] => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        if (l >= heap.length) break;
        const r = l + 1;
        const c = r < heap.length && heap[r]![0] < heap[l]![0] ? r : l;
        if (heap[c]![0] >= last[0]) break;
        heap[k] = heap[c]!;
        k = c;
      }
      heap[k] = last;
    }
    return top;
  };
  while (heap.length > 0) {
    const [d, i] = pop();
    if (d > dist[i]!) continue;
    const x = i % w;
    const y = Math.floor(i / w);
    for (const [dx, dy] of DIRECTIONS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!walk(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && !walk(x + dx, y) && !walk(x, y + dy)) {
        continue;
      }
      const a = cellAt(map, x, y)!;
      const b = cellAt(map, nx, ny)!;
      const stepBase = a.road && b.road ? 75 : COST[b.terrain]!;
      const step =
        dx !== 0 && dy !== 0 ? Math.round(stepBase * 1.414) : stepBase;
      const j = ny * w + nx;
      if (d + step < dist[j]!) {
        dist[j] = d + step;
        push([d + step, j]);
      }
    }
  }
  return dist;
}

export function towns(map: GameMap): MapObject[] {
  return map.objects.filter((o) => o.kind === "town");
}

/** Start towns (owned or open), in player order. */
export function startTowns(map: GameMap): MapObject[] {
  return towns(map)
    .filter((t) => typeof t.data["start"] === "number")
    .sort((a, b) => Number(a.data["start"]) - Number(b.data["start"]));
}

export function playerTown(map: GameMap): MapObject {
  const t = towns(map).find((o) => o.data["owner"] === 0);
  if (!t) throw new Error("no player town");
  return t;
}

export function cheb(a: MapObject, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
