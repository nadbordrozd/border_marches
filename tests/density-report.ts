/**
 * Dev script: object density and type variety of generated maps (bead
 * bzc.13), for before/after comparisons of the object table.
 *
 *   node tests/density-report.ts
 */
import { generateMapWithInfo } from "../src/core/map/generate.ts";
import { mapDensity } from "../src/core/map/density.ts";

const rows: string[] = [];
let sumV = 0;
let sumA = 0;
let n = 0;
for (const size of ["S", "SM", "M", "L"] as const) {
  for (const seed of [1, 2, 3, 7]) {
    const t = performance.now();
    const { map } = generateMapWithInfo(seed, { size, players: 3 });
    const ms = performance.now() - t;
    const d = mapDensity(map);
    const kinds: Record<string, number> = {};
    for (const o of map.objects) {
      const k = String(o.data["type"] ?? o.kind);
      kinds[k] = (kinds[k] ?? 0) + 1;
    }
    sumV += d.visitable;
    sumA += d.all;
    n++;
    rows.push(
      `${size} seed ${seed}: ${map.width}x${map.height} objects ${map.objects.length} visitable/100 ${d.visitable.toFixed(2)} all/100 ${d.all.toFixed(2)} types ${Object.keys(kinds).length} ${ms.toFixed(0)}ms`,
    );
  }
}
console.log(rows.join("\n"));
console.log(
  `mean visitable ${(sumV / n).toFixed(2)} all ${(sumA / n).toFixed(2)}`,
);
