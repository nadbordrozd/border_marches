/**
 * Dev script: print a generated map as text, with object density.
 *
 *   npm run map:ascii -- --seed 7 --size M [--players 2|3|4] [--zones]
 *                        [--no-objects] [--narrow] [--shapes] [--stages]
 */
import { generateMapWithInfo } from "../src/core/map/generate.ts";
import type { MapSize, PlayerCount } from "../src/core/map/generate.ts";
import { ASCII_LEGEND, mapToAscii } from "../src/core/map/ascii.ts";
import { mapDensity } from "../src/core/map/density.ts";

const args = process.argv.slice(2);
const value = (name: string): string | undefined => {
  const k = args.indexOf(name);
  return k >= 0 ? args[k + 1] : undefined;
};
const seed = Number(value("--seed") ?? "1");
const sizeArg = (value("--size") ?? "M").toUpperCase();
if (sizeArg !== "S" && sizeArg !== "M" && sizeArg !== "L") {
  throw new Error(`--size must be S, M or L, got ${sizeArg}`);
}
const size: MapSize = sizeArg;
const playersArg = value("--players");
const players =
  playersArg === undefined ? undefined : (Number(playersArg) as PlayerCount);

const stages: string[] = [];
const t0 = process.hrtime.bigint();
let lap = performance.now();
const { map, info } = generateMapWithInfo(seed, {
  size,
  ...(players !== undefined ? { players } : {}),
  onStage: (stage) => {
    const now = performance.now();
    stages.push(`${stage} ${(now - lap).toFixed(0)}`);
    lap = now;
  },
});
const ms = Number(process.hrtime.bigint() - t0) / 1e6;

console.log(
  mapToAscii(map, {
    objects: !args.includes("--no-objects"),
    zones: args.includes("--zones"),
    shapes: args.includes("--shapes"),
    cellWidth: args.includes("--narrow") ? 1 : 2,
  }),
);
console.log();
console.log(ASCII_LEGEND);
console.log(
  `seed ${seed}, size ${size} (${map.width}x${map.height}), ${ms.toFixed(0)} ms`,
);
if (args.includes("--stages")) console.log(`stages (ms): ${stages.join(", ")}`);
console.log(
  `zones: ${info.zones.map((z) => `${z.id}:${z.role}${z.player !== undefined ? `/p${z.player}` : ""}/t${z.tier}/${z.main}`).join("  ")}`,
);
console.log(
  `connections: ${info.connections.map((c) => `${c.a}-${c.b}`).join(" ")}; passes: ${info.passes.length}; room gaps: ${info.gaps.length}`,
);
const kinds = new Map<string, number>();
for (const o of map.objects) {
  const k =
    o.kind === "mine" || o.kind === "pickup"
      ? `${o.kind}:${String(o.data["chest"] === true ? "chest" : o.data["resource"])}`
      : o.kind;
  kinds.set(k, (kinds.get(k) ?? 0) + 1);
}
console.log(`objects: ${[...kinds].map(([k, n]) => `${k} ${n}`).join(", ")}`);
const d = mapDensity(map);
console.log(
  `density per 100 passable cells: ${d.all.toFixed(1)} objects, ${d.visitable.toFixed(1)} visitable (${d.passable} passable cells)`,
);
if (info.skipped.length > 0) console.log(`skipped: ${info.skipped.join("; ")}`);
