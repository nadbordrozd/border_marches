/**
 * Map terrain benchmarks (bead border_marches-xaj.31), loaded by run.ts
 * through Vite's module runner (the render code imports without extensions).
 *
 * - "terrain full M/L": the whole terrain plan of a generated map: what
 *   setMap costs, and what every setObjects cost before this bead.
 * - "object change M/L": one object change on the same map, a pickup beside
 *   a range taken or put back (alternately), planned incrementally: what a
 *   pickup, a beaten monster or a new object costs now.
 */
import { generateMap } from "../../src/core/map/generate.ts";
import type { MapSize } from "../../src/core/map/generate.ts";
import type { GameMap, MapObject } from "../../src/core/map/types.ts";
import { planTerrain } from "../../src/render/map/terrain-plan.ts";

export interface Benchmark {
  readonly name: string;
  readonly budgetMs: number;
  readonly run: (k: number) => void;
}

/** The pickups with the most Mountain and Forest cells round them. */
function pickupsBesideRanges(map: GameMap, count: number): MapObject[] {
  const score = (o: MapObject): number => {
    let s = 0;
    for (let dy = -1; dy <= 1; dy += 1)
      for (let dx = -1; dx <= 1; dx += 1) {
        const x = o.x + dx;
        const y = o.y + dy;
        if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
        const obstacle = map.cells[y * map.width + x]?.obstacle;
        if (obstacle === "mountain" || obstacle === "forest") s += 1;
      }
    return s;
  };
  return map.objects
    .filter((o) => o.kind === "pickup")
    .sort((a, b) => score(b) - score(a))
    .slice(0, count);
}

function changeBenchmark(size: MapSize, budgetMs: number): Benchmark {
  let state: {
    objects: MapObject[];
    plan: ReturnType<typeof planTerrain>["plan"];
    pickups: MapObject[];
  } | null = null;
  return {
    name: `object change ${size}`,
    budgetMs,
    run: (k) => {
      if (state === null) {
        // Set up outside the timed runs' counting: the first (warm-up) run.
        const map = generateMap(11, { size });
        const objects = map.objects.filter((o) => o.kind !== "buried");
        state = {
          objects,
          plan: planTerrain(map, objects).plan,
          pickups: pickupsBesideRanges(map, 4),
        };
        return;
      }
      // Runs 2j and 2j + 1 take and return pickup j (of four).
      const pickup = state.pickups[(k >> 1) % state.pickups.length];
      if (pickup === undefined) throw new Error("no pickup beside a range");
      const objects = state.objects.includes(pickup)
        ? state.objects.filter((o) => o !== pickup)
        : [...state.objects, pickup];
      const update = planTerrain(state.plan.map, objects, state.plan);
      if (update.dirty === null) throw new Error("placed in full");
      state = { ...state, objects, plan: update.plan };
    },
  };
}

function fullBenchmark(size: MapSize, budgetMs: number): Benchmark {
  const maps = new Map<number, GameMap>();
  return {
    name: `terrain full ${size}`,
    budgetMs,
    run: (k) => {
      // Maps are made once, on the first (warm-up) run.
      if (maps.size === 0)
        for (const seed of [11, 12, 13])
          maps.set(seed, generateMap(seed, { size }));
      const map = maps.get(11 + (k % 3));
      if (map !== undefined) planTerrain(map, map.objects);
    },
  };
}

export const TERRAIN_BENCHMARKS: readonly Benchmark[] = [
  fullBenchmark("M", 600),
  fullBenchmark("L", 1200),
  changeBenchmark("M", 30),
  changeBenchmark("L", 50),
];
