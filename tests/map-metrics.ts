/**
 * Dev script (bead bzc.96): composition metrics of generated maps per size
 * over seeds 1-10 (default players), as markdown table rows (mean and max
 * per size; every map with --each). See docs/design/MAP_COMPOSITION.md.
 *
 *   node tests/map-metrics.ts [--seeds 10] [--sizes S,M,L] [--each]
 */
import { generateMapWithInfo } from "../src/core/map/generate.ts";
import type { MapSize } from "../src/core/map/generate.ts";
import { mapComposition, mapDensity } from "../src/core/map/density.ts";

const args = process.argv.slice(2);
const value = (name: string): string | undefined => {
  const k = args.indexOf(name);
  return k >= 0 ? args[k + 1] : undefined;
};
const seeds = Number(value("--seeds") ?? "10");
const sizes = (value("--sizes") ?? "S,M,L").split(",") as MapSize[];
const each = args.includes("--each");

const fmt = (v: number): string => v.toFixed(1);
const line = (label: string, row: readonly number[]): void =>
  console.log(`| ${label} | ${row.map(fmt).join(" | ")} |`);
console.log(
  "| size | passable % | land passable % | obstacle % | water % | visitable /100 | all /100 | masses | small masses | cells/mass | largest empty r | empty-field % | clusters | clearings | ponds | ms |",
);
console.log(
  "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
);
for (const size of sizes) {
  const rows: number[][] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const t0 = performance.now();
    const { map, info } = generateMapWithInfo(seed, { size });
    const ms = performance.now() - t0;
    const c = mapComposition(map);
    const d = mapDensity(map);
    const row = [
      100 * c.passable,
      100 * c.landPassable,
      100 * c.obstacle,
      100 * c.water,
      d.visitable,
      d.all,
      c.masses,
      c.smallMasses,
      c.meanMass,
      c.largestEmpty,
      100 * c.emptyShare,
      info.hoards.length,
      info.clearings.length,
      info.fields.ponds,
      ms,
    ];
    rows.push(row);
    if (each) line(`${size}${seed}`, row);
  }
  const cols = rows[0]?.length ?? 0;
  const col = (k: number): number[] => rows.map((r) => r[k] ?? 0);
  const mean = Array.from(
    { length: cols },
    (_, k) => col(k).reduce((s, v) => s + v, 0) / rows.length,
  );
  const max = Array.from({ length: cols }, (_, k) => Math.max(...col(k)));
  line(`${size} mean`, mean);
  line(`${size} max`, max);
}
