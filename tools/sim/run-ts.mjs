#!/usr/bin/env node
/**
 * Runs a TypeScript entry point of the simulation tier under plain Node.
 *
 *   node tools/sim/run-ts.mjs <entry.ts> [args...]
 *
 * Node's built-in type stripping does not accept every construct the game
 * code uses (parameter properties in the battle engine), so the entry is
 * bundled with rolldown (already installed as Vite's bundler) into
 * `.orchestration/sim/` (git-ignored) and imported from there. The
 * arguments after the entry reach it as `process.argv.slice(2)`.
 */
import { mkdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "rolldown";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const entry = process.argv[2];
if (entry === undefined) {
  console.error("usage: node tools/sim/run-ts.mjs <entry.ts> [args...]");
  process.exit(2);
}
const outDir = resolve(root, ".orchestration/sim");
mkdirSync(outDir, { recursive: true });
const outFile = resolve(outDir, `${basename(entry, ".ts")}.bundle.mjs`);
await build({
  input: resolve(entry),
  platform: "node",
  logLevel: "warn",
  output: { file: outFile, format: "esm", sourcemap: false },
});
process.argv = [process.argv[0], outFile, ...process.argv.slice(3)];
await import(pathToFileURL(outFile).href);
