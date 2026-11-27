#!/usr/bin/env node
/* global console, process */
// Ground lab (bead bzc.127): renders three fixed test scenes with the game's
// own ground painter and with each texture and transition experiment, side
// by side at native size and enlarged, so they can be compared on one sheet.
// Offline and deterministic; nothing here runs in the game.
//
//   node tools/ground-lab/ground-lab.mjs [--out DIR] [--refs DIR]
//
// --out   where the sheets go (default .orchestration/ground-lab, git-ignored)
// --init  writes 400 x 400 underpaintings of grass, red earth and sand as
//         experiment A draws them (the recipes' initImage) to DIR and stops
// --refs  a folder holding homm2-map.webp and homm3-map.webp: adds crops of
//         them to the sheets for their feel (macOS `sips` converts them).
//         The sheets with reference crops are for review only: never commit
//         them.
//
// The PixelLab takes (set ground-lab) are read from art/masters/ground-lab,
// or from the raw folder while they are not accepted yet.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { runnerImport } from "vite";
import { loadConfig } from "../art/lib/common.mjs";
import { drawText } from "../art/lib/font.mjs";
import {
  blank,
  composite,
  crop,
  decodePng,
  encodePng,
  fillRect,
  scaleNearest,
} from "../art/lib/png.mjs";
import { currentModel, paintLab } from "./painter.mjs";
import {
  brushEdge,
  detailOverlay,
  layeredTexel,
  matchTake,
  maskRankAt,
  meanColour,
  noiseEdge,
  noiseKit,
  objectPatches,
  patchBomber,
  rimBand,
} from "./variants.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const CELL = 80;

function parseArgs(argv) {
  const out = { out: path.join(ROOT, ".orchestration", "ground-lab") };
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i]?.replace(/^--/, "");
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`--${name} wants a value`);
    if (name === "out" || name === "refs" || name === "init")
      out[name] = path.resolve(value);
    else throw new Error(`unknown option --${name}`);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const { module: B } = await runnerImport("./tools/ground-lab/bridge.mjs", {
  root: ROOT,
  logLevel: "error",
});
const N = noiseKit(B.hash4);
const readPng = (file) => decodePng(fs.readFileSync(file));
const publicPng = (rel) => readPng(path.join(ROOT, "public", rel));

// ------------------------------------------------------------- the sources

const tiles = Object.fromEntries(
  Object.entries(B.GROUND_TEXTURES).map(([terrain, asset]) => {
    const pixels = publicPng(asset.path);
    const calm = B.GROUND_CALM[terrain];
    return [terrain, calm === undefined ? pixels : B.calmTexture(pixels, calm)];
  }),
);
const water = {
  shallow: B.WATER_TILES.filter((t) => t.depth === "shallow").map((t) =>
    publicPng(t.path),
  ),
  deep: B.WATER_TILES.filter((t) => t.depth === "deep").map((t) =>
    publicPng(t.path),
  ),
};
const sources = { textures: tiles, water };

/** A PixelLab take ("set/id#n"): its master, else the raw take, cropped. */
const cfg = loadConfig(ROOT);
function take({ take: ref, crop: rect }) {
  const [set, rest] = ref.split("/");
  const [name, n] = rest.split("#");
  const master = path.join(ROOT, "art", "masters", set, `${name}-${n}.png`);
  const raw = path.join(cfg.rawDir, set, `${name}-${n}.png`);
  const file = fs.existsSync(master)
    ? master
    : fs.existsSync(raw)
      ? raw
      : undefined;
  if (file === undefined) {
    console.warn(
      `take ${ref}: no master and no raw take on this machine (skipped)`,
    );
    return undefined;
  }
  const img = readPng(file);
  return rect === undefined ? img : crop(img, ...rect);
}

/**
 * Which takes each experiment reads (accepted in set ground-lab-pixen, see
 * its verdicts.json), with the crop that keeps only the ground: pixen draws
 * a rim or a plate round some takes, and a lit corner on others.
 */
const TAKES = {
  grass: [
    { take: "ground-lab-pixen/grass-q#0", crop: [40, 70, 290, 240] },
    { take: "ground-lab-pixen/grass-s#0", crop: [110, 30, 220, 270] },
    { take: "ground-lab-pixen/grass-p#0", crop: [56, 48, 300, 300] },
  ],
  badlands: [
    { take: "ground-lab-pixen/dirt-p#0", crop: [40, 30, 330, 210] },
    { take: "ground-lab-pixen/dirt-s#0", crop: [120, 20, 220, 200] },
  ],
  sand: [{ take: "ground-lab-pixen/sand-p#0", crop: [80, 70, 250, 250] }],
  brush: [{ take: "ground-lab-pixen/ink-p#0" }],
};
const takes = Object.fromEntries(
  Object.entries(TAKES).map(([k, list]) => [
    k,
    list.map(take).filter((t) => t !== undefined),
  ]),
);
// Without takes a ground falls back to the game's texture.
for (const g of ["grass", "badlands", "sand"])
  if (takes[g].length === 0) takes[g] = [tiles[g]];

// --------------------------------------------------------------- the scenes

const T = { g: "grass", b: "badlands", s: "sand", w: "water", d: "water" };

/**
 * Three test scenes, 8 x 6 cells: rows of terrain letters (g grass,
 * b badlands, s sand, w shallow, d deep water), forest cells (F over the
 * ground letter), road cells and the pieces stood on them.
 */
const SCENES = [
  {
    id: "edge",
    title: "grass, red earth, water and a forest edge",
    rows: [
      "ggggbbbb",
      "ggggbbbb",
      "gggggbbw",
      "ggggbbww",
      "ggggwwww",
      "gggwwwdd",
    ],
    forest: ["", ".FF", ".FFF", "..F", "", ""],
    road: [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [5, 0],
      [6, 0],
      [7, 0],
    ],
    pieces: [
      { sprite: "objects/wood-pile.png", cell: [5, 1], kind: "pickup" },
      { sprite: "units/knight.png", cell: [4, 2], kind: "unit" },
    ],
    zoom: [250, 60, 150, 110],
    ref: { file: "homm3-map", x: 900, y: 600 },
  },
  {
    id: "meet",
    title: "sand meeting grass",
    rows: [
      "ggggssss",
      "gggsssss",
      "ggggssss",
      "gggsssss",
      "ggssssss",
      "gggsssss",
    ],
    forest: ["", "......FF", "......F", "", ".F", "FF"],
    road: [],
    pieces: [
      { sprite: "objects/gold-pile.png", cell: [4, 3], kind: "pickup" },
      { sprite: "objects/map/oasis.png", cell: [5, 4], kind: "site" },
    ],
    zoom: [200, 140, 150, 110],
    ref: { file: "homm2-map", x: 30, y: 20 },
  },
  {
    id: "crowd",
    title: "a crowded corner with objects",
    rows: [
      "ggggggbb",
      "gggggbbb",
      "ggggggbb",
      "gggggggb",
      "gggggggg",
      "gggggggg",
    ],
    forest: ["", "", "", "", ".......F", "......FF"],
    road: [
      [0, 3],
      [1, 3],
      [2, 3],
      [3, 3],
      [4, 3],
      [5, 3],
      [6, 3],
      [7, 3],
    ],
    pieces: [
      { sprite: "objects/map/gold-mine.png", cell: [2, 1], kind: "site" },
      { sprite: "objects/sawmill.png", cell: [5, 2], kind: "site" },
      { sprite: "objects/ore-pile.png", cell: [1, 4], kind: "pickup" },
      { sprite: "objects/gold-pile.png", cell: [6, 1], kind: "pickup" },
      { sprite: "units/knight.png", cell: [3, 4], kind: "unit" },
      {
        sprite: "terrain/decorations/fallen-log-1.png",
        cell: [4, 5],
        kind: "pickup",
      },
    ],
    zoom: [100, 20, 150, 110],
    ref: { file: "homm2-map", x: 150, y: 280 },
  },
];

function sceneMap(scene) {
  const height = scene.rows.length;
  const width = scene.rows[0].length;
  const map = B.createMap(width, height, 127);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const c = scene.rows[y][x];
      const cell = map.cells[y * width + x];
      cell.terrain = T[c];
      if (c === "d") cell.deep = true;
      if ((scene.forest[y] ?? "")[x] === "F") cell.obstacle = "forest";
    }
  for (const [x, y] of scene.road) map.cells[y * width + x].road = true;
  return map;
}

/** Where a piece stands: its sprite, top-left and foot. */
function placePiece(piece) {
  const img = publicPng(`assets/${piece.sprite}`);
  const [cx, cy] = piece.cell;
  const footX = cx * CELL + CELL / 2;
  const footY =
    piece.kind === "pickup"
      ? cy * CELL + CELL / 2 + img.height / 2
      : cy * CELL + CELL - 3;
  return {
    img,
    x: Math.round(footX - img.width / 2),
    y: Math.round(footY - img.height),
    footX,
    footY,
  };
}

// ------------------------------------------------------------ experiments

const LAB_GROUNDS = ["grass", "badlands", "sand"];

const matched = Object.fromEntries(
  LAB_GROUNDS.map((g) => [g, takes[g].map((t) => matchTake(t, tiles[g], 2.6))]),
);

/** The widest region spacing whose regions stay inside every take. */
const fitSpacing = (images) =>
  Math.min(
    150,
    ...images.map((img) =>
      Math.floor(Math.min(img.width, img.height) / 2 / 1.12),
    ),
  );

function buildModels(scenePieces) {
  const current = currentModel(B, tiles);
  // A: the game's textures, bombed so their period never shows.
  const tileBombs = Object.fromEntries(
    LAB_GROUNDS.map((g, k) => [
      g,
      patchBomber(N, [tiles[g]], {
        spacing: 170,
        warp: 14,
        salt: 1000 + 17 * k,
        centred: false,
      }),
    ]),
  );
  const overlays = Object.fromEntries(
    LAB_GROUNDS.map((g, k) => [
      g,
      detailOverlay(N, g, meanColour(tiles[g]), 2000 + 23 * k),
    ]),
  );
  // B: the PixelLab takes, bombed round their middles.
  const takeBombs = Object.fromEntries(
    LAB_GROUNDS.map((g, k) => [
      g,
      patchBomber(N, takes[g], {
        spacing: fitSpacing(takes[g]),
        warp: 14,
        salt: 3000 + 17 * k,
        centred: true,
      }),
    ]),
  );
  // B2: the same takes moved to the game ground's colour, at about twice
  // its contrast (variants.mjs matchTake).
  const matchedBombs = Object.fromEntries(
    LAB_GROUNDS.map((g, k) => [
      g,
      patchBomber(N, matched[g], {
        spacing: fitSpacing(matched[g]),
        warp: 14,
        salt: 3000 + 17 * k,
        centred: true,
      }),
    ]),
  );
  const noise = noiseEdge(N, 5000);
  const brush =
    takes.brush.length > 0 ? brushEdge(N, takes.brush, 4000) : noise;
  const sites = scenePieces
    .filter((p) => p.kind === "site")
    .map((p) => ({
      cx: p.footX,
      cy: p.footY - p.img.height * 0.18,
      rx: p.img.width * 0.62,
      ry: p.img.width * 0.36,
      patch: { grass: "badlands", sand: "badlands", badlands: "badlands" },
    }));
  const rim = rimBand(B);
  return [
    { ...current, label: "CURRENT (GAME)" },
    {
      label: "A  CODE LAYERS",
      texel: layeredTexel(B, N, {
        tiles,
        bombs: tileBombs,
        drift: 0.75,
        mottle: 0.06,
        overlays,
      }),
      rankAt: current.rankAt,
    },
    {
      label: "B  PIXELLAB TAKES",
      texel: layeredTexel(B, N, { tiles, bombs: takeBombs }),
      rankAt: current.rankAt,
    },
    {
      label: "B2 TAKES IN GAME COLOURS",
      texel: layeredTexel(B, N, { tiles, bombs: matchedBombs }),
      rankAt: current.rankAt,
    },
    {
      label: "C  BRUSH MASK EDGE",
      texel: current.texel,
      rankAt: maskRankAt(B, brush),
      band: rim,
    },
    {
      label: "C  NOISE EDGE",
      texel: current.texel,
      rankAt: maskRankAt(B, noise),
      band: rim,
    },
    {
      label: "A+C  CODE ONLY",
      texel: layeredTexel(B, N, {
        tiles,
        bombs: tileBombs,
        drift: 0.75,
        mottle: 0.06,
        overlays,
      }),
      rankAt: maskRankAt(B, brush),
      band: rim,
    },
    {
      label: "COMBO  B2+A+C+PATCHES",
      texel: layeredTexel(B, N, {
        tiles,
        bombs: matchedBombs,
        drift: 0.6,
        patches: sites.length > 0 ? objectPatches(N, brush, sites) : undefined,
      }),
      rankAt: maskRankAt(B, brush),
      band: rim,
    },
  ];
}

// ----------------------------------------------------------------- render

function renderScene(scene, model, plan, pieces, timing) {
  const w = plan.map.width * CELL;
  const h = plan.map.height * CELL;
  const img = blank(w, h, [0, 0, 0, 255]);
  // Clamped, as the game's ImageData is (blank() is not).
  const pixels = new Uint8ClampedArray(w * h * 4);
  const t0 = performance.now();
  paintLab(B, plan.layout, sources, model, 0, 0, w, h, pixels);
  timing.push(performance.now() - t0);
  img.data.set(pixels);
  drawPieces(img, plan, pieces);
  return img;
}

const sprites = new Map();
const spriteOf = (key) => {
  if (!sprites.has(key)) {
    const asset = [...B.TREE_ASSETS, ...B.DOODAD_ASSETS].find(
      (a) => a.key === key,
    );
    sprites.set(key, asset === undefined ? undefined : publicPng(asset.path));
  }
  return sprites.get(key);
};

/** A soft contact shadow under a piece: a stepped ellipse, never a blur. */
function shadow(img, cx, cy, rx, ry) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y += 1)
    for (let x = Math.floor(cx - rx); x <= cx + rx; x += 1) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
      if (d > 1) continue;
      const a = d < 0.6 ? 0.34 : 0.2;
      const o = (y * img.width + x) * 4;
      for (let c = 0; c < 3; c += 1)
        img.data[o + c] = img.data[o + c] * (1 - a) + 16 * a;
    }
}

function drawPieces(img, plan, pieces) {
  const covered = new Set(pieces.map((p) => `${p.cellX},${p.cellY}`));
  const draws = [];
  for (const tree of plan.canopy.trees)
    draws.push({ key: tree.key, x: tree.x, y: tree.y, base: tree.baseY });
  for (const d of plan.doodads.doodads)
    if (!covered.has(`${d.col},${d.row}`))
      draws.push({ key: d.spec.key, x: d.x, y: d.y, base: d.y + d.h });
  for (const p of pieces) draws.push({ piece: p, base: p.footY });
  draws.sort((a, b) => a.base - b.base);
  for (const d of draws) {
    if (d.piece !== undefined) {
      const p = d.piece;
      shadow(
        img,
        p.footX + 2,
        p.footY - 1,
        p.img.width * 0.42,
        Math.max(4, p.img.width * 0.09),
      );
      composite(img, p.img, p.x, p.y);
    } else {
      const s = spriteOf(d.key);
      if (s !== undefined) composite(img, s, d.x, d.y);
    }
  }
}

// ----------------------------------------------------------------- sheets

const WHITE = [240, 240, 240, 255];
const GREY = [150, 150, 150, 255];

function loadRefs(dir) {
  if (dir === undefined) return {};
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ground-lab-refs-"));
  const out = {};
  for (const name of ["homm2-map", "homm3-map"]) {
    const src = path.join(dir, `${name}.webp`);
    if (!fs.existsSync(src)) continue;
    const png = path.join(tmp, `${name}.png`);
    execFileSync("sips", ["-s", "format", "png", src, "--out", png], {
      stdio: "ignore",
    });
    out[name] = readPng(png);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  return out;
}

function sheet(scene, panels, ref) {
  const pw = panels[0].img.width;
  const ph = panels[0].img.height;
  const cols = 5;
  const label = 26;
  const gap = 12;
  const [zx, zy, zw, zh] = scene.zoom;
  const zoomW = zw * 2;
  const zoomH = zh * 2;
  const all = ref === undefined ? panels : [...panels, ref];
  const rows = Math.ceil(all.length / cols);
  const width = cols * pw + (cols + 1) * gap;
  const zoomRows = Math.ceil(all.length / Math.floor(width / (zoomW + gap)));
  const height =
    44 +
    rows * (ph + label + gap) +
    30 +
    zoomRows * (zoomH + label + gap) +
    gap;
  const out = blank(width, height, [34, 34, 38, 255]);
  drawText(
    out,
    `BZC.127 GROUND LAB - ${scene.id.toUpperCase()}: ${scene.title.toUpperCase()} - 1X`,
    gap,
    14,
    WHITE,
    2,
  );
  all.forEach((p, k) => {
    const x = gap + (k % cols) * (pw + gap);
    const y = 44 + Math.floor(k / cols) * (ph + label + gap);
    drawText(out, p.label, x, y + 6, p.ref ? GREY : WHITE, 2);
    composite(out, p.img, x, y + label);
    if (!p.ref) {
      // The 2x window's frame.
      fillRect(out, x + zx, y + label + zy, zw, 1, [255, 255, 255, 255]);
      fillRect(
        out,
        x + zx,
        y + label + zy + zh - 1,
        zw,
        1,
        [255, 255, 255, 255],
      );
      fillRect(out, x + zx, y + label + zy, 1, zh, [255, 255, 255, 255]);
      fillRect(
        out,
        x + zx + zw - 1,
        y + label + zy,
        1,
        zh,
        [255, 255, 255, 255],
      );
    }
  });
  const top = 44 + rows * (ph + label + gap);
  drawText(out, "2X (THE FRAMED WINDOW)", gap, top + 6, WHITE, 2);
  const perRow = Math.floor(width / (zoomW + gap));
  all.forEach((p, k) => {
    const x = gap + (k % perRow) * (zoomW + gap);
    const y = top + 30 + Math.floor(k / perRow) * (zoomH + label + gap);
    drawText(out, p.label, x, y + 6, p.ref ? GREY : WHITE, 2);
    const window = p.ref
      ? crop(p.img, 40, 40, zw, zh)
      : crop(p.img, zx, zy, zw, zh);
    composite(out, scaleNearest(window, 2), x, y + label);
  });
  return out;
}

/** The recommendation sheet: current, the code-only path and the combo per scene. */
function overview(rows, pick) {
  const pw = rows[0].panels[0].img.width;
  const ph = rows[0].panels[0].img.height;
  const gap = 12;
  const label = 26;
  const cols = pick.length + (rows[0].ref ? 1 : 0);
  const width = cols * pw + (cols + 1) * gap;
  const height = 44 + rows.length * (ph + label + gap);
  const out = blank(width, height, [34, 34, 38, 255]);
  drawText(out, "BZC.127 GROUND LAB - OVERVIEW AT 1X", gap, 14, WHITE, 2);
  rows.forEach((row, r) => {
    const list = [
      ...pick.map((k) => row.panels[k]),
      ...(row.ref ? [row.ref] : []),
    ];
    list.forEach((p, k) => {
      const x = gap + k * (pw + gap);
      const y = 44 + r * (ph + label + gap);
      drawText(
        out,
        `${row.scene.id.toUpperCase()}  ${p.label}`,
        x,
        y + 6,
        p.ref ? GREY : WHITE,
        2,
      );
      composite(out, p.img, x, y + label);
    });
  });
  return out;
}

// -------------------------------------------------------------------- run

if (args.init !== undefined) {
  // Underpaintings for PixelLab (recipes' initImage): 400 x 400 of one
  // ground as experiment A draws it, away from the scenes' coordinates.
  // Recorded requests name these files by hash: never overwrite one (the
  // ones in art/sets/ground-lab/init came from an earlier A, unclamped).
  fs.mkdirSync(args.init, { recursive: true });
  const a = buildModels([])[1];
  for (const g of LAB_GROUNDS) {
    const file = path.join(args.init, `${g}.png`);
    if (fs.existsSync(file))
      throw new Error(`${file} exists: pick another --init folder`);
    const img = blank(400, 400, [0, 0, 0, 255]);
    const pixels = new Uint8ClampedArray(400 * 400 * 4);
    const rank = B.GROUND_RANK.indexOf(g);
    for (let y = 0; y < 400; y += 1)
      for (let x = 0; x < 400; x += 1)
        a.texel(rank, 4000 + x, 4000 + y, pixels, (y * 400 + x) * 4);
    img.data.set(pixels);
    fs.writeFileSync(file, encodePng(img));
  }
  console.log(`underpaintings in ${args.init}`);
  process.exit(0);
}

fs.mkdirSync(path.join(args.out, "panels"), { recursive: true });
const refs = loadRefs(args.refs);
const rows = [];
const timings = new Map();
let identical = true;
for (const scene of SCENES) {
  const map = sceneMap(scene);
  const plan = B.planTerrain(map);
  const pieces = scene.pieces.map((p) => ({
    ...placePiece(p),
    kind: p.kind,
    cellX: p.cell[0],
    cellY: p.cell[1],
  }));
  // The lab painter must reproduce the game's paintGround exactly.
  const w = map.width * CELL;
  const h = map.height * CELL;
  const game = new Uint8ClampedArray(w * h * 4);
  B.paintGround(plan.layout, sources, 0, 0, w, h, game);
  const mine = new Uint8ClampedArray(w * h * 4);
  paintLab(B, plan.layout, sources, currentModel(B, tiles), 0, 0, w, h, mine);
  if (!game.every((v, k) => v === mine[k])) identical = false;
  const models = buildModels(pieces);
  const panels = models.map((model) => {
    const timing = timings.get(model.label) ?? [];
    timings.set(model.label, timing);
    const img = renderScene(scene, model, plan, pieces, timing);
    const slug = model.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const name = `${scene.id}-${slug}`;
    fs.writeFileSync(
      path.join(args.out, "panels", `${name}.png`),
      encodePng(img),
    );
    fs.writeFileSync(
      path.join(args.out, "panels", `${name}-2x.png`),
      encodePng(scaleNearest(img, 2)),
    );
    return { label: model.label, img };
  });
  const src = refs[scene.ref.file];
  const ref =
    src === undefined
      ? undefined
      : {
          label: `FEEL: ${scene.ref.file.toUpperCase()} CROP`,
          ref: true,
          img: crop(src, scene.ref.x, scene.ref.y, w, h),
        };
  fs.writeFileSync(
    path.join(args.out, `sheet-${scene.id}.png`),
    encodePng(sheet(scene, panels, ref)),
  );
  rows.push({ scene, panels, ref });
}
fs.writeFileSync(
  path.join(args.out, "overview.png"),
  encodePng(overview(rows, [0, 6, 7])),
);
console.log(
  `lab painter equals the game's paintGround: ${identical ? "yes" : "NO"}`,
);
console.log("paint time per 640 x 640 chunk (ms, mean of the scenes):");
for (const [label, list] of timings) {
  const perChunk =
    list.reduce((a, b) => a + b, 0) /
    list.length /
    ((8 * 6 * CELL * CELL) / (640 * 640));
  console.log(`  ${label.padEnd(26)} ${perChunk.toFixed(1)}`);
}
console.log(`sheets in ${args.out}`);
