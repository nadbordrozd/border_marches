/**
 * Object density of a map: objects per 100 passable cells, for the map and
 * per generator zone (bead bzc.3: "something to do every few steps").
 *
 * Passable cells are open ground (no water, no obstacle; object footprints
 * count as passable ground). "All" counts every object except hero starts;
 * "visitable" leaves out the neutral stacks too.
 */
import type { GameMap } from "./types.ts";
import { isPassable } from "./types.ts";

export interface DensityStats {
  passable: number;
  all: number;
  visitable: number;
}

function stats(passable: number, all: number, visitable: number): DensityStats {
  const per = (n: number): number => (passable > 0 ? (100 * n) / passable : 0);
  return { passable, all: per(all), visitable: per(visitable) };
}

export function mapDensity(map: GameMap): DensityStats {
  let passable = 0;
  for (const c of map.cells) if (isPassable(c)) passable++;
  const counted = map.objects.filter((o) => o.kind !== "hero-start");
  const visitable = counted.filter((o) => o.kind !== "monster");
  return stats(passable, counted.length, visitable.length);
}

/** Density per zone id (maps without zones give an empty map). */
export function zoneDensity(map: GameMap): Map<number, DensityStats> {
  const out = new Map<number, DensityStats>();
  const zones = map.zones;
  if (!zones) return out;
  const passable = new Map<number, number>();
  const all = new Map<number, number>();
  const visitable = new Map<number, number>();
  map.cells.forEach((c, i) => {
    const z = zones[i] ?? 0;
    if (isPassable(c)) passable.set(z, (passable.get(z) ?? 0) + 1);
  });
  for (const o of map.objects) {
    if (o.kind === "hero-start") continue;
    const z = zones[o.y * map.width + o.x] ?? 0;
    all.set(z, (all.get(z) ?? 0) + 1);
    if (o.kind !== "monster") visitable.set(z, (visitable.get(z) ?? 0) + 1);
  }
  for (const [z, n] of passable) {
    out.set(z, stats(n, all.get(z) ?? 0, visitable.get(z) ?? 0));
  }
  return out;
}
