/**
 * Dev script: print a generated map as text.
 *
 *   npm run map:ascii -- --seed 7 --size M [--zones] [--no-objects] [--narrow]
 */
import { generateMapWithInfo } from "../src/core/map/generate.ts";
import type { MapSize } from "../src/core/map/generate.ts";
import { ASCII_LEGEND, mapToAscii } from "../src/core/map/ascii.ts";

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

const t0 = process.hrtime.bigint();
const { map, info } = generateMapWithInfo(seed, { size });
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
console.log(
  `zones: ${info.zones.map((z) => `${z.id}:${z.role}/${z.main}+${z.secondary}`).join("  ")}`,
);
console.log(
  `connections: ${info.connections.map((c) => `${c.a}-${c.b}`).join(" ")}; passes: ${info.passes.length}`,
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
if (info.skipped.length > 0) console.log(`skipped: ${info.skipped.join("; ")}`);
