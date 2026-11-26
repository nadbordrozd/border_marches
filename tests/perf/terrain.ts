/**
 * Map terrain benchmarks (bead border_marches-xaj.31), loaded by run.ts
 * through Vite's module runner (the render code imports without extensions).
 *
 * - "terrain full M/L": the whole terrain plan of a generated map: what
 *   setMap costs. An object change costs the terrain nothing: the plan reads
 *   only the map (bead bzc.106).
 */
import { generateMap } from "../../src/core/map/generate.ts";
import type { MapSize } from "../../src/core/map/generate.ts";
import type { GameMap } from "../../src/core/map/types.ts";
import { planTerrain } from "../../src/render/map/terrain-plan.ts";

export interface Benchmark {
  readonly name: string;
  readonly budgetMs: number;
  readonly run: (k: number) => void;
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
      if (map !== undefined) planTerrain(map);
    },
  };
}

export const TERRAIN_BENCHMARKS: readonly Benchmark[] = [
  fullBenchmark("M", 600),
  fullBenchmark("L", 1200),
];
