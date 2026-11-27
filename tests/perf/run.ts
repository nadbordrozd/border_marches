/**
 * Opt-in performance budgets. Not part of the unit tier: wall-clock budgets
 * flake when several test runs share a machine, so they live here and run on
 * purpose.
 *
 *   npm run perf                      # every benchmark
 *   npm run perf -- --runs 15 large   # more runs, names containing "large"
 *   npm run perf -- terrain           # the map's whole terrain plan
 *
 * Each benchmark warms up, then times several runs and checks the median
 * against its budget. Exits 1 when a median is over budget. Run it on a quiet
 * machine: the load average is printed so a noisy result can be recognised.
 */
import { cpus, loadavg } from "node:os";
import { performance } from "node:perf_hooks";
import { runnerImport } from "vite";
import { generateMap } from "../../src/core/map/generate.ts";
import type { MapSize } from "../../src/core/map/generate.ts";
import type * as Terrain from "./terrain.ts";

interface Benchmark {
  readonly name: string;
  /** Median wall-clock budget for one run, in milliseconds. */
  readonly budgetMs: number;
  /** One timed operation; `k` counts runs so each can vary its input. */
  readonly run: (k: number) => void;
}

const mapBenchmark = (size: MapSize, budgetMs: number): Benchmark => ({
  name: `generate map ${size}`,
  budgetMs,
  // Seeds 11, 12, 13, ... so one lucky seed cannot carry the median.
  run: (k) => void generateMap(11 + (k % 5), { size }),
});

// The render code imports without extensions, which Node's own type
// stripping cannot load: the terrain benchmarks come through Vite's runner.
const { module: terrain } = await runnerImport<typeof Terrain>(
  "./tests/perf/terrain.ts",
);

const BENCHMARKS: readonly Benchmark[] = [
  mapBenchmark("S", 120),
  // Bead bzc.147: SM and M are the medium and large maps of before, with
  // their budgets (M: the old unit-tier budget of the large map, 300 ms);
  // L and XL are the Heroes sizes on top, measured when they came in.
  mapBenchmark("SM", 180),
  mapBenchmark("M", 300),
  mapBenchmark("L", 900),
  mapBenchmark("XL", 1800),
  // Bead xaj.31: a whole terrain plan (made once per map, bead bzc.106).
  ...terrain.TERRAIN_BENCHMARKS,
];

const args = process.argv.slice(2);
const runsAt = args.indexOf("--runs");
const RUNS = runsAt >= 0 ? Number(args[runsAt + 1]) : 7;
const WARMUP = 2;
if (!Number.isInteger(RUNS) || RUNS < 1) throw new Error("--runs takes N >= 1");
const filters = args.filter((a, i) => a !== "--runs" && i !== runsAt + 1);
const chosen = BENCHMARKS.filter(
  (b) => filters.length === 0 || filters.some((f) => b.name.includes(f)),
);
if (chosen.length === 0) throw new Error(`no benchmark matches ${filters}`);

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const ms = (x: number): string => `${x.toFixed(0)} ms`.padStart(7);

const [load1] = loadavg();
const cores = cpus().length;
console.log(
  `perf: ${WARMUP} warm-up + ${RUNS} timed runs each; load ${load1!.toFixed(1)} on ${cores} cores` +
    (load1! > cores / 2 ? " (busy machine: timings are inflated)" : ""),
);

let over = 0;
for (const bench of chosen) {
  for (let k = 0; k < WARMUP; k++) bench.run(k);
  const wall: number[] = [];
  const cpu: number[] = [];
  for (let k = 0; k < RUNS; k++) {
    const c0 = process.cpuUsage();
    const t0 = performance.now();
    bench.run(k);
    wall.push(performance.now() - t0);
    const c = process.cpuUsage(c0);
    cpu.push((c.user + c.system) / 1000);
  }
  const mid = median(wall);
  const ok = mid <= bench.budgetMs;
  if (!ok) over++;
  console.log(
    `${ok ? "ok  " : "OVER"} ${bench.name.padEnd(24)} median ${ms(mid)}` +
      ` (min ${ms(Math.min(...wall))}, max ${ms(Math.max(...wall))},` +
      ` cpu median ${ms(median(cpu))})  budget ${ms(bench.budgetMs)}`,
  );
}
if (over > 0) {
  console.log(`perf: ${over} benchmark(s) over budget`);
  process.exitCode = 1;
} else console.log("perf: all within budget");
