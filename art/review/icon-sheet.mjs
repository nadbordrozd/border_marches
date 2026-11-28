// Contact sheet of derived icons (bead border_marches-bzc.17).
//
//   node art/review/icon-sheet.mjs <out.png> <folder under public/assets/icons>... [--scale 3]
//
// A folder may also be one icon of it ("spells/scuttle"), for a sheet of a
// mixed family (bead bzc.159: the naval icons).
//
// Per icon: its id, then 1x on light and dark, 1x in its frame on light and
// dark (the frame drawn exactly as src/ui/icons.ts draws it: a 2 px border
// in the frame colour and a 1 px bevel, light on the left and bottom,
// shadow on the top and right), then enlarged on light and dark.
import fs from "node:fs";
import path from "node:path";
import { blank, composite, decodePng, encodePng, fillRect, parseColour, scaleNearest } from "../../tools/art/lib/png.mjs";
import { drawText, textWidth } from "../../tools/art/lib/font.mjs";

const args = process.argv.slice(2);
const scaleAt = args.indexOf("--scale");
const scale = scaleAt >= 0 ? Number(args[scaleAt + 1]) : 3;
const [out, ...folders] = args.filter((a, i) => scaleAt < 0 || (i !== scaleAt && i !== scaleAt + 1));
const catalogue = JSON.parse(fs.readFileSync("src/assets/icon-catalogue.json", "utf8"));
const FRAMES = Object.fromEntries(
  [...fs.readFileSync("src/assets/icons.ts", "utf8").matchAll(/frame\("([a-z]+)", "(#[0-9a-f]{6})", "(#[0-9a-f]{6})", "(#[0-9a-f]{6})"\)/g)].map((m) => [m[1], { colour: m[2], shadow: m[3], light: m[4] }]),
);
const KIND = { spells: "spell", artifacts: "artifact", conditions: "condition", "conditions-16": "condition", ground: "ground", skills: "skill", feats: "feat", vows: "vow", stats: "stat", schools: "school" };

const LIGHT = parseColour("#f2f2f2");
const DARK = parseColour("#1e2126");
const BG = parseColour("#8f949b");
const INK = parseColour("#101114");

/** The icon on a background, framed when a frame is given (pixel twin of the CSS). */
function tile(raster, bg, frame, k = 1) {
  const size = raster.width + 10 * k;
  const t = blank(size, size, bg);
  if (frame) {
    const b = 2 * k;
    const inner = raster.width + 6 * k;
    const x0 = 2 * k;
    const c = parseColour(frame.colour);
    fillRect(t, x0, x0, inner, b, c);
    fillRect(t, x0, x0 + inner - b, inner, b, c);
    fillRect(t, x0, x0, b, inner, c);
    fillRect(t, x0 + inner - b, x0, b, inner, c);
    const s = parseColour(frame.shadow);
    const l = parseColour(frame.light);
    const i0 = x0 + b;
    const span = inner - 2 * b;
    fillRect(t, i0, i0, span, k, s); // top
    fillRect(t, i0 + span - k, i0, k, span, s); // right
    fillRect(t, i0, i0, k, span, l); // left
    fillRect(t, i0, i0 + span - k, span, k, l); // bottom
  }
  composite(t, raster, 5 * k, 5 * k);
  return t;
}

const items = folders.flatMap((arg) => {
  const [folder, one] = arg.split("/");
  const dir = path.join("public/assets/icons", folder);
  const files = one === undefined ? fs.readdirSync(dir).filter((f) => f.endsWith(".png")).sort() : [`${one}.png`];
  return files.map((f) => {
    const id = f.slice(0, -4);
    const entry = catalogue[KIND[folder]]?.[id];
    return { id, raster: decodePng(fs.readFileSync(path.join(dir, f))), frame: entry?.frame ? FRAMES[entry.frame] : null };
  });
});
if (items.length === 0) throw new Error("no icons");
const blocks = items.map(({ id, raster, frame }) => {
  const tiles = [tile(raster, LIGHT), tile(raster, DARK), tile(raster, LIGHT, frame), tile(raster, DARK, frame), tile(scaleNearest(raster, scale), LIGHT, frame, scale), tile(scaleNearest(raster, scale), DARK, frame, scale)];
  const w = Math.max(tiles.reduce((s, t) => s + t.width + 3, 0), textWidth(id) + 2);
  const h = 10 + Math.max(...tiles.map((t) => t.height));
  const block = blank(w, h, BG);
  drawText(block, id, 0, 0, INK);
  let x = 0;
  for (const t of tiles) {
    composite(block, t, x, 10 + (h - 10 - t.height));
    x += t.width + 3;
  }
  return block;
});
const cols = Math.max(1, Math.floor(1800 / (blocks[0].width + 10)));
const bw = Math.max(...blocks.map((b) => b.width)) + 10;
const bh = Math.max(...blocks.map((b) => b.height)) + 8;
const sheet = blank(cols * bw + 10, Math.ceil(blocks.length / cols) * bh + 10, BG);
blocks.forEach((b, i) => composite(sheet, b, 10 + (i % cols) * bw, 10 + Math.floor(i / cols) * bh));
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, encodePng(sheet));
console.log(`wrote ${out} (${items.length} icons)`);
