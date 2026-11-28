#!/usr/bin/env node
/* global console, process */
// The ground bake (bead bzc.138): a checked derivation from accepted
// PixelLab masters to the game's ground textures, in the studio pipeline's
// terms (docs/art/PIPELINE.md): the recipe (art/bake/grounds.json) names the
// takes and every parameter, `bake` writes the game files, `validate`
// derives them again and checks their pixels. Zero dependencies.
//
//   node tools/art/ground-bake.mjs bake [<ground>...]
//   node tools/art/ground-bake.mjs validate
//   node tools/art/ground-bake.mjs preview <out-dir>   (3 x 3 repeats, review)
//
// Per ground: each take is cropped to its open interior, its slow light and
// dark patches pulled toward its own mean (`flatten`), then moved to the
// ground's colour (`mean`) at the ground's luma spread (`spread`, the luma
// standard deviation over the mean luma). The takes are then patch-bombed
// onto a torus of `period` px: warped Voronoi regions about `spacing` px
// across, each reading one take round its middle at its own offset, with a
// dithered seam between regions. Everything is periodic in `period`, so the
// texture tiles. The swatch is the texture's first cell.
//
// The edge mask (`edge`): the ink-blot take bombed the same way, mixed with
// a slow periodic noise, stored as a grey PNG whose value v means a reach of
// (v / 255 * 2 - 1) * range: the brush that cuts the borders between
// grounds (src/render/map/ground.ts).
import fs from "node:fs";
import path from "node:path";
import { loadConfig, readJson, sha256, writeFileAtomic } from "./lib/common.mjs";
import { blank, composite, crop, decodePng, encodePng, pixelSha256 } from "./lib/png.mjs";

const cfg = loadConfig();
const RECIPE = path.join(cfg.dataDir, "bake", "grounds.json");
const luma = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b;
const modulo = (v, by) => ((v % by) + by) % by;

/** A 32-bit hash of four integers (as src/render/map/hash.ts hash4). */
function hash4(a, b, c, d) {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b) ^ Math.imul(c | 0, 0xc2b2ae35) ^ Math.imul(d | 0, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}
const unit = (x, y, salt) => hash4(x, y, salt, 0x6c1b) / 4294967296;

/** Value noise with `n` lattice cells across `period` px, periodic in it. */
function periodicNoise(period, n, salt) {
  if (!Number.isInteger(n) || n < 1) throw new Error(`noise lattice ${n} is not a whole number`);
  const spacing = period / n;
  return (x, y) => {
    const fx = x / spacing;
    const fy = y / spacing;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const ux = tx * tx * (3 - 2 * tx);
    const uy = ty * ty * (3 - 2 * ty);
    const at = (i, j) => unit(modulo(i, n), modulo(j, n), salt);
    const top = at(x0, y0) * (1 - ux) + at(x0 + 1, y0) * ux;
    const bottom = at(x0, y0 + 1) * (1 - ux) + at(x0 + 1, y0 + 1) * ux;
    return top * (1 - uy) + bottom * uy;
  };
}

// --------------------------------------------------------------- the takes

function setState(set) {
  const dir = path.join(cfg.dataDir, "sets", set);
  return { records: readJson(path.join(dir, "records.json"), {}), verdicts: readJson(path.join(dir, "verdicts.json"), {}) };
}

/** An accepted master ("set/id#n"), checked against its recorded take. */
function master(ref) {
  const match = /^([^/]+)\/(.+)#(\d+)$/.exec(ref);
  if (match === null) throw new Error(`bad take ${ref} (want set/id#n)`);
  const [, set, id, n] = match;
  const state = setState(set);
  if (state.verdicts[`${id}#${n}`]?.verdict !== "ACCEPTED") throw new Error(`${ref} is not ACCEPTED`);
  const candidate = state.records[id]?.candidates?.[Number(n)];
  if (candidate === undefined) throw new Error(`${ref} was never generated`);
  const file = path.join(cfg.dataDir, "masters", set, `${id}-${n}.png`);
  if (!fs.existsSync(file)) throw new Error(`${ref}: master ${path.relative(cfg.root, file)} is missing`);
  const bytes = fs.readFileSync(file);
  if (sha256(bytes) !== candidate.sha256) throw new Error(`${path.relative(cfg.root, file)} is not the recorded ${ref}`);
  return decodePng(bytes);
}

/** Box blur, clamped at the edges, of the three colour channels. */
function blur(img, r) {
  const { width: w, height: h, data } = img;
  const tmp = new Float64Array(w * h * 3);
  const out = new Float64Array(w * h * 3);
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1)
      for (let c = 0; c < 3; c += 1) {
        let s = 0;
        for (let k = -r; k <= r; k += 1) s += data[(y * w + Math.min(w - 1, Math.max(0, x + k))) * 4 + c];
        tmp[(y * w + x) * 3 + c] = s / (2 * r + 1);
      }
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1)
      for (let c = 0; c < 3; c += 1) {
        let s = 0;
        for (let k = -r; k <= r; k += 1) s += tmp[(Math.min(h - 1, Math.max(0, y + k)) * w + x) * 3 + c];
        out[(y * w + x) * 3 + c] = s / (2 * r + 1);
      }
  return out;
}

/**
 * One take ready to bomb: cropped, flattened, at the ground's colour and
 * spread. Returns float RGB (no rounding until the texture is written).
 */
function prepareTake(spec, ground) {
  const [x, y, w, h] = spec.crop;
  const img = crop(master(spec.take), x, y, w, h);
  const n = w * h;
  const px = new Float64Array(n * 3);
  for (let p = 0; p < n; p += 1) for (let c = 0; c < 3; c += 1) px[p * 3 + c] = img.data[p * 4 + c];
  const flatten = spec.flatten ?? ground.flatten ?? { radius: 24, amount: 0 };
  if (flatten.amount > 0) {
    const local = blur(img, flatten.radius);
    const mean = [0, 0, 0];
    for (let p = 0; p < n; p += 1) for (let c = 0; c < 3; c += 1) mean[c] += px[p * 3 + c] / n;
    for (let p = 0; p < n; p += 1)
      for (let c = 0; c < 3; c += 1) px[p * 3 + c] -= (local[p * 3 + c] - mean[c]) * flatten.amount;
  }
  const mean = [0, 0, 0];
  for (let p = 0; p < n; p += 1) for (let c = 0; c < 3; c += 1) mean[c] += px[p * 3 + c] / n;
  const ml = luma(...mean);
  let v = 0;
  for (let p = 0; p < n; p += 1) {
    const d = luma(px[p * 3], px[p * 3 + 1], px[p * 3 + 2]) - ml;
    v += (d * d) / n;
  }
  const target = parseHex(ground.mean);
  const targetStd = ground.spread * luma(...target);
  const k = targetStd / Math.max(1e-6, Math.sqrt(v));
  for (let p = 0; p < n; p += 1)
    for (let c = 0; c < 3; c += 1) px[p * 3 + c] = target[c] + (px[p * 3 + c] - mean[c]) * k;
  return { width: w, height: h, px };
}

function parseHex(hex) {
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// --------------------------------------------------------------- the bomber

/**
 * Patch bombing on a torus of `period` px: for pixel (x, y), the region's
 * take and the pixel in it. `images` read round their middles; a read that
 * would leave a take is mirrored back into it.
 */
function torusBomber(images, { period, spacing, warp, seam, salt }) {
  const g = period / spacing;
  if (!Number.isInteger(g)) throw new Error(`spacing ${spacing} does not divide ${period}`);
  const wx1 = periodicNoise(period, Math.round(period / 48), salt + 1);
  const wy1 = periodicNoise(period, Math.round(period / 48), salt + 2);
  const wx2 = periodicNoise(period, Math.round(period / 22), salt + 11);
  const wy2 = periodicNoise(period, Math.round(period / 22), salt + 12);
  const sites = [];
  for (let j = 0; j < g; j += 1)
    for (let i = 0; i < g; i += 1) {
      const img = images[Math.floor(unit(i, j, salt + 5) * images.length)];
      const slackX = Math.max(0, img.width / 2 - spacing * 1.05);
      const slackY = Math.max(0, img.height / 2 - spacing * 1.05);
      sites.push({
        jx: (unit(i, j, salt + 3) - 0.5) * 0.8,
        jy: (unit(i, j, salt + 4) - 0.5) * 0.8,
        img,
        ox: Math.round(img.width / 2 + (unit(i, j, salt + 6) - 0.5) * 2 * slackX),
        oy: Math.round(img.height / 2 + (unit(i, j, salt + 7) - 0.5) * 2 * slackY),
      });
    }
  const mirror = (v, n) => {
    const m = modulo(v, 2 * n);
    return m < n ? m : 2 * n - 1 - m;
  };
  return (x, y) => {
    const qx = x + warp * ((wx1(x, y) * 0.67 + wx2(x, y) * 0.33) * 2 - 1);
    const qy = y + warp * ((wy1(x, y) * 0.67 + wy2(x, y) * 0.33) * 2 - 1);
    const gx = Math.floor(qx / spacing);
    const gy = Math.floor(qy / spacing);
    let d1 = Infinity;
    let d2 = Infinity;
    let s1;
    let s2;
    for (let dy = -1; dy <= 1; dy += 1)
      for (let dx = -1; dx <= 1; dx += 1) {
        const cx = gx + dx;
        const cy = gy + dy;
        const site = sites[modulo(cy, g) * g + modulo(cx, g)];
        const sx = (cx + 0.5 + site.jx) * spacing;
        const sy = (cy + 0.5 + site.jy) * spacing;
        const d = Math.sqrt((qx - sx) * (qx - sx) + (qy - sy) * (qy - sy));
        const hit = { site, sx, sy };
        if (d < d1) {
          d2 = d1;
          s2 = s1;
          d1 = d;
          s1 = hit;
        } else if (d < d2) {
          d2 = d;
          s2 = hit;
        }
      }
    // A dithered seam: near the bisector, a stipple of both regions.
    let pick = s1;
    if (d2 - d1 < seam && unit(modulo(x, period), modulo(y, period), salt + 9) < 0.5 * (1 - (d2 - d1) / seam)) pick = s2;
    const { site, sx, sy } = pick;
    const tx = mirror(Math.round(x - sx + site.ox), site.img.width);
    const ty = mirror(Math.round(y - sy + site.oy), site.img.height);
    return { img: site.img, p: ty * site.img.width + tx };
  };
}

function repeatOf(images, period) {
  const img = images[0];
  if (images.length !== 1 || img.width !== period || img.height !== period)
    throw new Error(`repeat wants one take cropped to the period (${period} px)`);
  return (x, y) => ({ img, p: y * img.width + x });
}

function bakeGround(name, ground) {
  const images = ground.takes.map((t) => prepareTake(t, ground));
  const { period } = ground;
  // `repeat`: one take that already tiles, recoloured only (its own period;
  // bombing would break its long strokes at every region seam).
  const bomb = ground.mode === "repeat" ? repeatOf(images, period) : torusBomber(images, {
    period,
    spacing: ground.spacing,
    warp: ground.warp ?? 14,
    seam: ground.seam ?? 6,
    salt: ground.salt,
  });
  const out = blank(period, period, [0, 0, 0, 255]);
  const clamped = new Uint8ClampedArray(out.data.length);
  for (let y = 0; y < period; y += 1)
    for (let x = 0; x < period; x += 1) {
      const { img, p } = bomb(x, y);
      const o = (y * period + x) * 4;
      clamped[o] = img.px[p * 3];
      clamped[o + 1] = img.px[p * 3 + 1];
      clamped[o + 2] = img.px[p * 3 + 2];
      clamped[o + 3] = 255;
    }
  out.data.set(clamped);
  const files = [{ path: ground.output, raster: out, what: `${name} texture` }];
  // A battle surface (bead bzc.160) has no swatch.
  if (ground.swatch !== undefined) files.push({ path: ground.swatch, raster: crop(out, 0, 0, 80, 80), what: `${name} swatch` });
  return files;
}

function bakeEdge(edge) {
  const ink = master(edge.take);
  const n = ink.width * ink.height;
  const l = new Float64Array(n);
  let lo = Infinity;
  let hi = -Infinity;
  for (let p = 0; p < n; p += 1) {
    l[p] = luma(ink.data[p * 4], ink.data[p * 4 + 1], ink.data[p * 4 + 2]);
    lo = Math.min(lo, l[p]);
    hi = Math.max(hi, l[p]);
  }
  let mean = 0;
  for (let p = 0; p < n; p += 1) {
    l[p] = ((l[p] - lo) / Math.max(1, hi - lo)) * 2 - 1;
    mean += l[p] / n;
  }
  const px = new Float64Array(n * 3);
  for (let p = 0; p < n; p += 1) for (let c = 0; c < 3; c += 1) px[p * 3 + c] = l[p] - mean;
  const { period } = edge;
  const bomb = torusBomber([{ width: ink.width, height: ink.height, px }], {
    period,
    spacing: edge.spacing,
    warp: 10,
    seam: 0,
    salt: edge.salt,
  });
  const slow1 = periodicNoise(period, Math.round(period / edge.slow), edge.salt + 40);
  const slow2 = periodicNoise(period, Math.round((2 * period) / edge.slow), edge.salt + 71);
  const out = blank(period, period, [0, 0, 0, 255]);
  for (let y = 0; y < period; y += 1)
    for (let x = 0; x < period; x += 1) {
      const { img, p } = bomb(x, y);
      const slow = ((slow1(x, y) + 0.5 * slow2(x, y)) / 1.5 - 0.5) * 3.2;
      const m = Math.max(-edge.range, Math.min(edge.range, edge.brush * img.px[p * 3] + edge.noise * slow));
      const v = Math.round(((m / edge.range + 1) / 2) * 255);
      const o = (y * period + x) * 4;
      out.data[o] = v;
      out.data[o + 1] = v;
      out.data[o + 2] = v;
    }
  return [{ path: edge.output, raster: out, what: "edge mask" }];
}

function deriveAll(only) {
  const recipe = readJson(RECIPE);
  const files = [];
  for (const [name, ground] of Object.entries(recipe.grounds))
    if (only.length === 0 || only.includes(name)) files.push(...bakeGround(name, ground));
  for (const [name, surface] of Object.entries(recipe.surfaces ?? {}))
    if (only.length === 0 || only.includes(name)) files.push(...bakeGround(name, surface));
  if (only.length === 0 || only.includes("edge")) files.push(...bakeEdge(recipe.edge));
  return files;
}

// --------------------------------------------------------------- commands

const [command, ...rest] = process.argv.slice(2);
if (command === "bake") {
  let written = 0;
  for (const file of deriveAll(rest)) {
    const target = path.join(cfg.root, file.path);
    if (fs.existsSync(target) && pixelSha256(decodePng(fs.readFileSync(target))) === pixelSha256(file.raster)) continue;
    writeFileAtomic(target, encodePng(file.raster));
    written += 1;
    console.log(`baked ${file.path} (${file.raster.width}x${file.raster.height}): ${file.what}`);
  }
  console.log(`${written} file(s) written`);
} else if (command === "validate") {
  const problems = [];
  let files;
  try {
    files = deriveAll([]);
  } catch (error) {
    problems.push(error.message);
    files = [];
  }
  for (const file of files) {
    const target = path.join(cfg.root, file.path);
    if (!fs.existsSync(target)) problems.push(`${file.path} is missing (run ground-bake bake)`);
    else if (pixelSha256(decodePng(fs.readFileSync(target))) !== pixelSha256(file.raster))
      problems.push(`${file.path} is not what ${path.relative(cfg.root, RECIPE)} derives (run ground-bake bake)`);
  }
  if (problems.length > 0) {
    for (const p of problems) console.log(`FAIL ${p}`);
    console.log(`${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log(`ok: ${files.length} baked ground file(s) verified`);
} else if (command === "preview") {
  const dir = rest[0];
  if (dir === undefined) throw new Error("preview wants an output folder");
  fs.mkdirSync(dir, { recursive: true });
  for (const file of deriveAll(rest.slice(1))) {
    if (file.raster.width < 400) continue;
    const r = file.raster;
    const out = blank(r.width * 2, r.height * 2, [0, 0, 0, 255]);
    for (let y = 0; y < 2; y += 1) for (let x = 0; x < 2; x += 1) composite(out, r, x * r.width, y * r.height);
    fs.writeFileSync(path.join(dir, path.basename(file.path).replace(".png", "-2x2.png")), encodePng(out));
  }
  console.log(`previews in ${dir}`);
} else {
  console.log("usage: node tools/art/ground-bake.mjs bake [<ground>...] | validate | preview <dir> [<ground>...]");
  process.exit(command === undefined ? 0 : 1);
}
