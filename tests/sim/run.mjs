/**
 * Launcher for the simulation scripts in tests/sim: Node's own type
 * stripping cannot load the battle engine (it uses TypeScript parameter
 * properties), so the script is loaded through Vite's module runner.
 *
 *   node tests/sim/run.mjs ./tests/sim/battles.ts [args...]
 *
 * The script must export `main(args: string[])`.
 */
/* global process, console */
import { runnerImport } from "vite";

const [script, ...args] = process.argv.slice(2);
if (script === undefined) {
  console.error("usage: node tests/sim/run.mjs <script.ts> [args...]");
  process.exit(2);
}
const { module } = await runnerImport(script);
const code = await module.main(args);
process.exit(typeof code === "number" ? code : 0);
