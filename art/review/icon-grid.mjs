// Review grid for 64-candidate icon recipes (bead border_marches-bzc.17).
//
//   node art/review/icon-grid.mjs <out.png> <set> <recipe-id> [--scale 3]
//
// Every candidate of the recipe, labelled with its index and verdict
// (A accepted, R rejected), at native size on light and dark and enlarged
// on light and dark. Reads raw takes (or masters) through the recorded
// hashes; draws nothing into the repository.
import fs from "node:fs";
import path from "node:path";
import { loadConfig, readJson, sha256 } from "../../tools/art/lib/common.mjs";
import { blank, composite, decodePng, encodePng, parseColour, scaleNearest } from "../../tools/art/lib/png.mjs";
import { drawText } from "../../tools/art/lib/font.mjs";

const [out, set, id, ...rest] = process.argv.slice(2);
const scale = Number(rest[rest.indexOf("--scale") + 1] ?? 3) || 3;
const cfg = loadConfig();
const records = readJson(path.join(cfg.dataDir, "sets", set, "records.json"), {});
const verdicts = readJson(path.join(cfg.dataDir, "sets", set, "verdicts.json"), {});
const record = records[id];
if (record?.status !== "DONE") throw new Error(`${set}/${id} not generated`);

const LIGHT = parseColour("#f2f2f2");
const DARK = parseColour("#1e2126");
const BG = parseColour("#8f949b");
const INK = parseColour("#101114");
const GREEN = parseColour("#0b5d1e");
const RED = parseColour("#8b0d0d");

const cols = 8;
const cellW = 32 * 2 + 32 * scale * 2 + 4 * 6;
const cellH = 32 * scale + 4 + 10;
const rows = Math.ceil(record.candidates.length / cols);
const sheet = blank(cols * (cellW + 8) + 8, rows * (cellH + 8) + 8, BG);
record.candidates.forEach((candidate, n) => {
  const file = [path.join(cfg.dataDir, "masters", set, `${id}-${n}.png`), path.join(cfg.rawDir, set, candidate.file)].find((f) => fs.existsSync(f));
  if (!file) return;
  const bytes = fs.readFileSync(file);
  if (sha256(bytes) !== candidate.sha256) throw new Error(`${file} is not the recorded take`);
  const raster = decodePng(bytes);
  const x0 = 8 + (n % cols) * (cellW + 8);
  const y0 = 8 + Math.floor(n / cols) * (cellH + 8);
  const v = verdicts[`${id}#${n}`]?.verdict;
  drawText(sheet, `${n}${v === "ACCEPTED" ? " A" : v === "REJECTED" ? " R" : ""}`, x0, y0, v === "ACCEPTED" ? GREEN : v === "REJECTED" ? RED : INK);
  let x = x0;
  const y = y0 + 10;
  for (const bg of [LIGHT, DARK]) {
    const tile = blank(36, 36, bg);
    composite(tile, raster, 2, 2);
    composite(sheet, tile, x, y);
    x += 40;
  }
  const big = scaleNearest(raster, scale);
  for (const bg of [LIGHT, DARK]) {
    const tile = blank(big.width + 4, big.height + 4, bg);
    composite(tile, big, 2, 2);
    composite(sheet, tile, x, y);
    x += big.width + 8;
  }
});
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, encodePng(sheet));
console.log(`wrote ${out}`);
