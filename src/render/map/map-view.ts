/**
 * The adventure map view: a Canvas 2D renderer of a GameMap as one
 * continuous landscape (bead border_marches-xaj.7).
 *
 * How a frame is drawn:
 *
 * 1. the night sky outside the map (after Pulp Wars starfield-v7.ts, much
 *    simplified: one layer of faint stars moving at a tenth of the pan);
 * 2. the map in CHUNKS of 8 x 8 cells, each cached at master resolution:
 *    the ground layer (ground.ts: grounds, spill, water shelf, coast, forest
 *    shade, roads) and then every TALL_BODY entry (canopy trees, massif
 *    bodies, doodads) that overlaps the chunk, in pass order;
 * 3. the FOREGROUND entries in row, column, layer order: the bands above
 *    low rock, the cached crown bands of the canopy (canopy-paint.ts),
 *    objects, monsters, heroes, path arrows, chips;
 * 4. the fog of war, also cached in chunks, over everything.
 *
 * The camera is a world point at the viewport centre and a zoom step
 * (0.75, 1, 1.5, 2); the world origin is snapped to whole device pixels and
 * whole device scales draw nearest-neighbour, fractional ones smoothed.
 */
import { CELL_PX, HERO_ASSETS, UNIT_ASSETS } from "../../assets/manifest";
import type { UnitAsset } from "../../assets/manifest";
import type { GameMap, MapObject } from "../../core/map/types";
import type { MapAssets, Surface } from "./assets";
import { context2d, createSurface } from "./assets";
import { TREE_ASSETS } from "../../assets/trees";
import { installCanopyBands, toneTree } from "./canopy-paint";
import { paintFog } from "./fog";
import { buildGroundLayout, paintGround } from "./ground";
import type { GroundLayout } from "./ground";
import { hashUnit } from "./hash";
import { doodadArt } from "./doodad-art";
import { doodadSpecs } from "./doodads";
import { packRanges } from "./massif";
import { RELIEF, buildRelief, paintRelief } from "./relief";
import type { Relief } from "./relief";
import {
  compareEntries,
  doodadEntries,
  featuredCells,
  mapCanopy,
  objectEntries,
  terrainEntries,
  unitEntry,
} from "./scene";
import type { SceneEntry } from "./scene";

const CELL = CELL_PX;
export const ZOOM_STEPS = [0.75, 1, 1.5, 2] as const;
export const DEFAULT_ZOOM = 0.75;
/** The hero sprite drawn when a MapHero names none. */
export const DEFAULT_HERO = "dinosaur-chieftain";
/** Cells per side of a cached chunk. */
export const CHUNK_CELLS = 8;
const CHUNK_PX = CHUNK_CELLS * CELL;
/** Cached chunks kept (each about 1.6 MB). */
const CHUNK_LIMIT = 72;
const EDGE_SCROLL_PX = 14;
const EDGE_SCROLL_SPEED = 900; // world px per second
const KEY_SCROLL_SPEED = 1100;

export interface MapHero {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** Unit or hero sprite key; the Lost World Chieftain by default. */
  readonly unit?: string;
}

export interface PathStep {
  readonly x: number;
  readonly y: number;
  /** Reachable this turn (green) or beyond (red). */
  readonly reachable: boolean;
}

export interface Cell {
  readonly x: number;
  readonly y: number;
}

export interface MapViewStats {
  /** Duration of the last render() in ms. */
  readonly lastFrameMs: number;
  /** Chunks built so far and the total time spent building them, ms. */
  readonly chunksBuilt: number;
  readonly chunkBuildMs: number;
  readonly fogChunksBuilt: number;
  readonly fogBuildMs: number;
  readonly drawnEntries: number;
}

export interface MapView {
  setMap(map: GameMap): void;
  /**
   * Explored cells, row-major (non-zero / true = explored); null shows the
   * whole map.
   */
  setExplored(mask: ArrayLike<number | boolean> | null): void;
  /** Objects to draw; defaults to the map's own objects on setMap. */
  setObjects(objects: readonly MapObject[]): void;
  setHeroes(heroes: readonly MapHero[]): void;
  setPathPreview(steps: readonly PathStep[] | null): void;
  /** A selected cell: a monster there shows its count chip. */
  setSelected(cell: Cell | null): void;
  setZoom(zoom: number, anchor?: { sx: number; sy: number }): void;
  getZoom(): number;
  /** Centres the view on cell (x, y). */
  centerOn(x: number, y: number): void;
  /** The cell under canvas CSS pixel (sx, sy), or null off the map. */
  screenToCell(sx: number, sy: number): Cell | null;
  onHover(callback: (cell: Cell | null) => void): void;
  onClick(callback: (cell: Cell, event: PointerEvent) => void): void;
  /** Draws a frame now. */
  render(): void;
  /** Builds every chunk of the map now (for benchmarks and screenshots). */
  prebuild(): void;
  /** Re-reads the canvas size. */
  resize(): void;
  stats(): MapViewStats;
  destroy(): void;
}

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

interface Chunk {
  readonly surface: Surface | null;
}

/** The arrows and crosses of the path preview, code-drawn once each. */
function pathMarker(
  kind: "arrow" | "cross",
  angle: number,
  green: boolean,
): Surface {
  const size = 32;
  const surface = createSurface(size, size);
  const ctx = context2d(surface);
  const fill = green ? "#58d23c" : "#e2402e";
  const dark = "#10160c";
  ctx.translate(size / 2, size / 2);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (kind === "cross") {
    for (const [width, colour] of [
      [8, dark],
      [4, fill],
    ] as const) {
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(-7, -7);
      ctx.lineTo(7, 7);
      ctx.moveTo(7, -7);
      ctx.lineTo(-7, 7);
      ctx.stroke();
    }
    return surface;
  }
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(0, -8);
  ctx.lineTo(0, -3.5);
  ctx.lineTo(-10, -3.5);
  ctx.lineTo(-10, 3.5);
  ctx.lineTo(0, 3.5);
  ctx.lineTo(0, 8);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fill();
  return surface;
}

function starTile(): Surface {
  const size = 256;
  const surface = createSurface(size, size);
  const ctx = context2d(surface);
  ctx.fillStyle = "#0c1024";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 60; i += 1) {
    const x = Math.floor(hashUnit(i, 1, 0x5a) * size);
    const y = Math.floor(hashUnit(i, 2, 0x5a) * size);
    const b = hashUnit(i, 3, 0x5a);
    ctx.fillStyle = b > 0.85 ? "#c8d0f0" : b > 0.5 ? "#7880a8" : "#3e4670";
    ctx.fillRect(x, y, 1, 1);
  }
  return surface;
}

const isWhole = (value: number): boolean =>
  Math.abs(value - Math.round(value)) < 1e-6;

/**
 * How mountains are drawn (bead xaj.25): the continuous low relief
 * (relief.ts), or the old massif sprites behind `?mountains=sprites` for
 * A/B during this iteration.
 */
export function mountainMode(): "relief" | "sprites" {
  const search = typeof location === "undefined" ? "" : location.search;
  return new URLSearchParams(search).get("mountains") === "sprites"
    ? "sprites"
    : "relief";
}

/** Mean colour of each ground texture (the relief's foot leans to it). */
function groundMeans(assets: MapAssets): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [terrain, tex] of Object.entries(assets.ground.textures)) {
    let r = 0;
    let g = 0;
    let b = 0;
    const n = tex.width * tex.height;
    for (let i = 0; i < n; i += 1) {
      r += tex.data[i * 4] ?? 0;
      g += tex.data[i * 4 + 1] ?? 0;
      b += tex.data[i * 4 + 2] ?? 0;
    }
    out[terrain] = [r / n, g / n, b / n];
  }
  return out;
}

const LIP_KEY = "relief-lip:";

export function createMapView(
  canvas: HTMLCanvasElement,
  assets: MapAssets,
): MapView {
  const screen = canvas.getContext("2d");
  if (screen === null) throw new Error("map renderer: no 2D context");
  const images = new Map<string, CanvasImageSource>(assets.images);
  // The canopy's trees, toned toward their ground (canopy-paint.ts).
  for (const tree of TREE_ASSETS) {
    const image = images.get(tree.key);
    if (image !== undefined)
      images.set(tree.key, toneTree(image, tree.w, tree.h, tree.terrain));
  }
  // The code-drawn doodads (doodad-art.ts).
  for (const list of Object.values(doodadSpecs()))
    for (const spec of list) {
      if (spec.art === undefined || images.has(spec.key)) continue;
      const art = doodadArt(spec.art.kind, spec.art.ground, spec.art.variant);
      const surface = createSurface(art.w, art.h);
      const ctx = context2d(surface);
      const data = ctx.createImageData(art.w, art.h);
      data.data.set(art.data);
      ctx.putImageData(data, 0, 0);
      images.set(spec.key, surface);
    }
  const markers = new Map<string, Surface>();
  const marker = (
    kind: "arrow" | "cross",
    dir: number,
    green: boolean,
  ): Surface => {
    const k = `${kind}:${dir}:${green ? 1 : 0}`;
    let found = markers.get(k);
    if (found === undefined) {
      found = pathMarker(kind, (dir * Math.PI) / 4, green);
      markers.set(k, found);
    }
    return found;
  };
  const stars = starTile();
  let starPattern: CanvasPattern | null = null;
  const reliefMode = mountainMode() === "relief";
  const grounds = reliefMode ? groundMeans(assets) : {};
  let relief: Relief | null = null;
  /** The relief's lips (relief-lip:x,y), cut from their chunk when built. */
  const lipImages = new Map<string, Surface>();

  let map: GameMap | null = null;
  let objects: readonly MapObject[] = [];
  let heroes: readonly MapHero[] = [];
  let path: readonly PathStep[] | null = null;
  let selected: Cell | null = null;
  let hovered: Cell | null = null;
  let explored: Uint8Array | null = null;

  let layout: GroundLayout | null = null;
  let bodies: SceneEntry[] = [];
  let foreground: SceneEntry[] = [];
  let terrainForeground: SceneEntry[] = [];
  const chunks = new Map<string, Chunk>();
  const fogChunks = new Map<string, Chunk>();

  let zoom = DEFAULT_ZOOM;
  let camX = 0;
  let camY = 0;
  let cssW = 1;
  let cssH = 1;
  let dpr = 1;

  const stat = {
    lastFrameMs: 0,
    chunksBuilt: 0,
    chunkBuildMs: 0,
    fogChunksBuilt: 0,
    fogBuildMs: 0,
    drawnEntries: 0,
  };

  let hoverCallback: ((cell: Cell | null) => void) | null = null;
  let clickCallback: ((cell: Cell, event: PointerEvent) => void) | null = null;

  // ------------------------------------------------------------ state

  const isExplored = (x: number, y: number): boolean =>
    explored === null || map === null || explored[y * map.width + x] !== 0;

  const visibleEntry = (e: SceneEntry): boolean =>
    e.cells === undefined ||
    explored === null ||
    e.cells.some(([x, y]) => isExplored(x, y));

  /** Object entrances next to a road: the road runs into them. */
  const roadEnds = (): [number, number][] => {
    if (map === null) return [];
    const m = map;
    const out: [number, number][] = [];
    for (const obj of objects) {
      if (obj.kind !== "town" && obj.kind !== "mine") continue;
      const near = [
        [0, 1],
        [1, 0],
        [-1, 0],
        [0, -1],
      ].some(([dx = 0, dy = 0]) => {
        const x = obj.x + dx;
        const y = obj.y + dy;
        return (
          x >= 0 &&
          y >= 0 &&
          x < m.width &&
          y < m.height &&
          m.cells[y * m.width + x]?.road === true
        );
      });
      if (near) out.push([obj.x, obj.y]);
    }
    return out;
  };

  const rebuildTerrain = (): void => {
    chunks.clear();
    lipImages.clear();
    relief = null;
    if (map === null) {
      layout = null;
      bodies = [];
      terrainForeground = [];
      return;
    }
    const featured = featuredCells(map, objects);
    // The forest canopy and its cached crown bands (bead xaj.26).
    const canopy = mapCanopy(map, featured);
    installCanopyBands(images, canopy.bands);
    let terrain: SceneEntry[];
    const lips: SceneEntry[] = [];
    if (reliefMode) {
      // Low relief (bead xaj.25): no scree ring and no massif sprites; the
      // paint a range raises over the open cell north of it is drawn again
      // in the foreground at the range's row, over the feet of a unit
      // standing behind it.
      relief = buildRelief(map, featured, grounds);
      const base = buildGroundLayout(map, roadEnds(), undefined, featured);
      layout = { ...base, nearMountain: new Uint8Array(base.mountain.length) };
      terrain = terrainEntries(map, objects, canopy).filter(
        (e) => !e.sprites.some((s) => s.key.startsWith("massif-")),
      );
      for (const [x, y] of relief.lips)
        lips.push({
          pass: "FOREGROUND",
          row: y,
          col: x,
          layer: 1,
          seq: 0,
          shadows: [],
          sprites: [
            {
              key: `${LIP_KEY}${x},${y}`,
              sx: 0,
              sy: 0,
              sw: CELL,
              sh: RELIEF.cap,
              dx: x * CELL,
              dy: y * CELL - RELIEF.cap,
            },
          ],
          x0: x * CELL,
          y0: y * CELL - RELIEF.cap,
          x1: (x + 1) * CELL,
          y1: y * CELL,
        });
    } else {
      // The scree follows the pieces' silhouettes (bead xaj.21).
      layout = buildGroundLayout(
        map,
        roadEnds(),
        packRanges(map, featured),
        featured,
      );
      terrain = terrainEntries(map, objects, canopy);
    }
    const entries = [
      ...terrain,
      ...lips,
      ...doodadEntries(map, objects, layout),
    ].sort(compareEntries);
    bodies = entries.filter((e) => e.pass === "TALL_BODY");
    terrainForeground = entries.filter((e) => e.pass === "FOREGROUND");
  };

  const rebuildForeground = (): void => {
    const entries: SceneEntry[] = [
      ...terrainForeground,
      ...objectEntries(objects, map ?? undefined),
    ];
    for (const hero of heroes) {
      const key = hero.unit ?? DEFAULT_HERO;
      const unit =
        HERO_ASSETS.find((u) => u.key === key) ??
        UNIT_ASSETS.find((u) => u.key === key) ??
        (HERO_ASSETS[0] as UnitAsset);
      entries.push(unitEntry(unit, hero.x, hero.y, { objectId: hero.id }));
    }
    foreground = entries.sort(compareEntries);
  };

  // ------------------------------------------------------------ chunks

  const chunkKey = (cx: number, cy: number): string => `${cx},${cy}`;

  const touch = (
    cache: Map<string, Chunk>,
    key: string,
    chunk: Chunk,
  ): void => {
    cache.delete(key);
    cache.set(key, chunk);
    while (cache.size > CHUNK_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  };

  const drawSprites = (ctx: Context, e: SceneEntry): void => {
    for (const s of e.shadows) {
      ctx.fillStyle = `rgba(18, 22, 30, ${s.alpha})`;
      ctx.beginPath();
      ctx.ellipse(s.cx, s.cy, s.rx, s.ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const s of e.sprites) {
      const image = images.get(s.key) ?? lipImages.get(s.key);
      if (image === undefined) continue;
      ctx.drawImage(
        image,
        s.sx,
        s.sy,
        s.sw,
        s.sh,
        s.dx,
        s.dy,
        s.dw ?? s.sw,
        s.dh ?? s.sh,
      );
    }
  };

  /**
   * The relief over the chunk's ground, and the lips inside the chunk cut
   * from it (each lip lies in one chunk: chunks are cell-aligned).
   */
  const paintChunkRelief = (
    model: Relief,
    x0: number,
    y0: number,
    w: number,
    h: number,
    data: Uint8ClampedArray,
  ): void => {
    const paint = new Uint8ClampedArray(w * h * 4);
    if (!paintRelief(model, x0, y0, w, h, paint)) return;
    for (let o = 0; o < paint.length; o += 4)
      if (paint[o + 3] !== 0) {
        data[o] = paint[o] ?? 0;
        data[o + 1] = paint[o + 1] ?? 0;
        data[o + 2] = paint[o + 2] ?? 0;
        data[o + 3] = 255;
      }
    const lipH = RELIEF.cap;
    for (const [x, y] of model.lips) {
      const lx = x * CELL - x0;
      const ly = y * CELL - lipH - y0;
      if (lx < 0 || ly < 0 || lx + CELL > w || ly + lipH > h) continue;
      const lip = new ImageData(CELL, lipH);
      for (let r = 0; r < lipH; r += 1) {
        const from = ((ly + r) * w + lx) * 4;
        lip.data.set(paint.subarray(from, from + CELL * 4), r * CELL * 4);
      }
      const surface = createSurface(CELL, lipH);
      context2d(surface).putImageData(lip, 0, 0);
      lipImages.set(`${LIP_KEY}${x},${y}`, surface);
    }
  };

  const buildChunk = (cx: number, cy: number): Chunk => {
    if (map === null || layout === null) return { surface: null };
    const t0 = performance.now();
    const x0 = cx * CHUNK_PX;
    const y0 = cy * CHUNK_PX;
    const w = Math.min(CHUNK_PX, map.width * CELL - x0);
    const h = Math.min(CHUNK_PX, map.height * CELL - y0);
    if (w <= 0 || h <= 0) return { surface: null };
    const surface = createSurface(w, h);
    const ctx = context2d(surface);
    const image = ctx.createImageData(w, h);
    paintGround(layout, assets.ground, x0, y0, w, h, image.data);
    if (relief !== null) paintChunkRelief(relief, x0, y0, w, h, image.data);
    ctx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.translate(-x0, -y0);
    for (const e of bodies)
      if (e.x1 > x0 && e.x0 < x0 + w && e.y1 > y0 && e.y0 < y0 + h)
        drawSprites(ctx, e);
    stat.chunksBuilt += 1;
    stat.chunkBuildMs += performance.now() - t0;
    return { surface };
  };

  const chunkAt = (cx: number, cy: number): Chunk => {
    const key = chunkKey(cx, cy);
    let chunk = chunks.get(key);
    if (chunk === undefined) chunk = buildChunk(cx, cy);
    touch(chunks, key, chunk);
    return chunk;
  };

  const buildFogChunk = (cx: number, cy: number): Chunk => {
    if (map === null || explored === null) return { surface: null };
    const t0 = performance.now();
    const x0 = cx * CHUNK_PX;
    const y0 = cy * CHUNK_PX;
    const w = Math.min(CHUNK_PX, map.width * CELL - x0);
    const h = Math.min(CHUNK_PX, map.height * CELL - y0);
    const data = new Uint8ClampedArray(w * h * 4);
    const any = paintFog(isExplored, map.width, map.height, x0, y0, w, h, data);
    stat.fogChunksBuilt += 1;
    stat.fogBuildMs += performance.now() - t0;
    if (!any) return { surface: null };
    const surface = createSurface(w, h);
    const ctx = context2d(surface);
    const image = ctx.createImageData(w, h);
    image.data.set(data);
    ctx.putImageData(image, 0, 0);
    return { surface };
  };

  const fogChunkAt = (cx: number, cy: number): Chunk => {
    const key = chunkKey(cx, cy);
    let chunk = fogChunks.get(key);
    if (chunk === undefined) chunk = buildFogChunk(cx, cy);
    touch(fogChunks, key, chunk);
    return chunk;
  };

  // ------------------------------------------------------------ camera

  const origin = (): { ox: number; oy: number } => {
    const ox = Math.round((cssW / 2 - camX * zoom) * dpr) / dpr;
    const oy = Math.round((cssH / 2 - camY * zoom) * dpr) / dpr;
    return { ox, oy };
  };

  const clampCamera = (): void => {
    if (map === null) return;
    const w = map.width * CELL;
    const h = map.height * CELL;
    const halfW = cssW / 2 / zoom;
    const halfH = cssH / 2 / zoom;
    // At least half a viewport of map stays in view on each axis.
    camX =
      w <= 2 * halfW
        ? w / 2
        : Math.min(w - halfW + CELL, Math.max(halfW - CELL, camX));
    camY =
      h <= 2 * halfH
        ? h / 2
        : Math.min(h - halfH + CELL, Math.max(halfH - CELL, camY));
  };

  const screenToWorld = (
    sx: number,
    sy: number,
  ): { wx: number; wy: number } => {
    const { ox, oy } = origin();
    return { wx: (sx - ox) / zoom, wy: (sy - oy) / zoom };
  };

  // ------------------------------------------------------------ render

  let frameRequested = false;
  const requestRender = (): void => {
    if (frameRequested) return;
    frameRequested = true;
    requestAnimationFrame(() => {
      frameRequested = false;
      view.render();
    });
  };

  const drawPath = (ctx: Context): void => {
    if (path === null || path.length === 0) return;
    for (let i = 0; i < path.length; i += 1) {
      const step = path[i];
      if (step === undefined || !isExplored(step.x, step.y)) continue;
      const next = path[i + 1];
      let surface: Surface;
      if (next === undefined) surface = marker("cross", 0, step.reachable);
      else {
        const angle = Math.atan2(next.y - step.y, next.x - step.x);
        const dir = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
        surface = marker("arrow", dir, step.reachable);
      }
      ctx.drawImage(
        surface,
        step.x * CELL + CELL / 2 - 16,
        step.y * CELL + CELL / 2 - 16,
      );
    }
  };

  const drawChip = (ctx: Context, cell: Cell): void => {
    if (map === null) return;
    const monster = objects.find(
      (o) => o.kind === "monster" && o.x === cell.x && o.y === cell.y,
    );
    if (monster === undefined || !isExplored(cell.x, cell.y)) return;
    const count = monster.data["count"];
    const text = typeof count === "number" ? String(count) : "?";
    const x = cell.x * CELL + CELL / 2;
    const y = cell.y * CELL + CELL - 6;
    ctx.font = "bold 12px Georgia, serif";
    const w = Math.max(22, ctx.measureText(text).width + 12);
    ctx.fillStyle = "rgba(20, 16, 10, 0.85)";
    ctx.strokeStyle = "#e8c77a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(Math.round(x - w / 2) + 0.5, y - 8.5, Math.round(w), 16, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f4e6c0";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y + 0.5);
  };

  const render = (): void => {
    const t0 = performance.now();
    const ctx = screen;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (starPattern === null)
      starPattern = ctx.createPattern(stars as CanvasImageSource, "repeat");
    const { ox, oy } = origin();
    ctx.save();
    if (starPattern !== null) {
      starPattern.setTransform(
        new DOMMatrix().translate(
          Math.round(ox * 0.1 * dpr),
          Math.round(oy * 0.1 * dpr),
        ),
      );
      ctx.fillStyle = starPattern;
    } else ctx.fillStyle = "#0c1024";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    stat.drawnEntries = 0;
    if (map === null) {
      stat.lastFrameMs = performance.now() - t0;
      return;
    }
    const scale = zoom * dpr;
    ctx.setTransform(scale, 0, 0, scale, ox * dpr, oy * dpr);
    ctx.imageSmoothingEnabled = !isWhole(scale);
    ctx.imageSmoothingQuality = "low";
    // Visible world rectangle.
    const vx0 = -ox / zoom;
    const vy0 = -oy / zoom;
    const vx1 = vx0 + cssW / zoom;
    const vy1 = vy0 + cssH / zoom;
    const chunkCols = Math.ceil(map.width / CHUNK_CELLS);
    const chunkRows = Math.ceil(map.height / CHUNK_CELLS);
    const c0 = Math.max(0, Math.floor(vx0 / CHUNK_PX));
    const c1 = Math.min(chunkCols - 1, Math.floor(vx1 / CHUNK_PX));
    const r0 = Math.max(0, Math.floor(vy0 / CHUNK_PX));
    const r1 = Math.min(chunkRows - 1, Math.floor(vy1 / CHUNK_PX));
    for (let cy = r0; cy <= r1; cy += 1)
      for (let cx = c0; cx <= c1; cx += 1) {
        const chunk = chunkAt(cx, cy);
        if (chunk.surface !== null)
          ctx.drawImage(chunk.surface, cx * CHUNK_PX, cy * CHUNK_PX);
      }
    // Foreground in row, column, layer order.
    const chipCell = selected ?? hovered;
    for (const e of foreground) {
      if (e.x1 < vx0 || e.x0 > vx1 || e.y1 < vy0 || e.y0 > vy1) continue;
      if (!visibleEntry(e)) continue;
      drawSprites(ctx, e);
      stat.drawnEntries += 1;
    }
    // Path markers above the units of their row: drawn after the whole
    // foreground so a tree top never hides the route (HoMaM does the same).
    drawPath(ctx);
    if (chipCell !== null) drawChip(ctx, chipCell);
    if (explored !== null)
      for (let cy = r0; cy <= r1; cy += 1)
        for (let cx = c0; cx <= c1; cx += 1) {
          const chunk = fogChunkAt(cx, cy);
          if (chunk.surface !== null)
            ctx.drawImage(chunk.surface, cx * CHUNK_PX, cy * CHUNK_PX);
        }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    stat.lastFrameMs = performance.now() - t0;
  };

  // ------------------------------------------------------------ input

  let dragging: {
    x: number;
    y: number;
    camX: number;
    camY: number;
    moved: boolean;
  } | null = null;
  let pointer: { x: number; y: number } | null = null;
  const keys = new Set<string>();
  let lastTick = 0;
  let ticking = false;

  const tick = (now: number): void => {
    ticking = false;
    const dt =
      lastTick === 0 ? 1 / 60 : Math.min(0.05, (now - lastTick) / 1000);
    lastTick = now;
    let vx = 0;
    let vy = 0;
    if (keys.has("ArrowLeft")) vx -= KEY_SCROLL_SPEED;
    if (keys.has("ArrowRight")) vx += KEY_SCROLL_SPEED;
    if (keys.has("ArrowUp")) vy -= KEY_SCROLL_SPEED;
    if (keys.has("ArrowDown")) vy += KEY_SCROLL_SPEED;
    if (pointer !== null && dragging === null) {
      if (pointer.x < EDGE_SCROLL_PX) vx -= EDGE_SCROLL_SPEED;
      if (pointer.x > cssW - EDGE_SCROLL_PX) vx += EDGE_SCROLL_SPEED;
      if (pointer.y < EDGE_SCROLL_PX) vy -= EDGE_SCROLL_SPEED;
      if (pointer.y > cssH - EDGE_SCROLL_PX) vy += EDGE_SCROLL_SPEED;
    }
    if (vx === 0 && vy === 0) {
      lastTick = 0;
      return;
    }
    camX += (vx * dt) / zoom;
    camY += (vy * dt) / zoom;
    clampCamera();
    render();
    ticking = true;
    requestAnimationFrame(tick);
  };
  const startTicking = (): void => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(tick);
  };

  const setHovered = (cell: Cell | null): void => {
    if (cell?.x === hovered?.x && cell?.y === hovered?.y) return;
    hovered = cell;
    hoverCallback?.(cell);
    requestRender();
  };

  const onPointerDown = (event: PointerEvent): void => {
    canvas.setPointerCapture(event.pointerId);
    dragging = { x: event.offsetX, y: event.offsetY, camX, camY, moved: false };
  };
  const onPointerMove = (event: PointerEvent): void => {
    pointer = { x: event.offsetX, y: event.offsetY };
    if (dragging !== null) {
      const dx = event.offsetX - dragging.x;
      const dy = event.offsetY - dragging.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) dragging.moved = true;
      if (dragging.moved) {
        camX = dragging.camX - dx / zoom;
        camY = dragging.camY - dy / zoom;
        clampCamera();
        requestRender();
      }
      return;
    }
    setHovered(view.screenToCell(event.offsetX, event.offsetY));
    startTicking();
  };
  const onPointerUp = (event: PointerEvent): void => {
    const drag = dragging;
    dragging = null;
    if (drag !== null && !drag.moved) {
      const cell = view.screenToCell(event.offsetX, event.offsetY);
      if (cell !== null) clickCallback?.(cell, event);
    }
  };
  const onPointerLeave = (): void => {
    pointer = null;
    setHovered(null);
  };
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const index = ZOOM_STEPS.indexOf(zoom as (typeof ZOOM_STEPS)[number]);
    const next =
      ZOOM_STEPS[
        Math.max(
          0,
          Math.min(ZOOM_STEPS.length - 1, index + (event.deltaY < 0 ? 1 : -1)),
        )
      ];
    if (next !== undefined && next !== zoom)
      view.setZoom(next, { sx: event.offsetX, sy: event.offsetY });
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    keys.add(event.key);
    startTicking();
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    keys.delete(event.key);
  };
  const onResize = (): void => view.resize();

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("resize", onResize);

  const view: MapView = {
    setMap(next) {
      map = next;
      objects = next.objects;
      explored = null;
      fogChunks.clear();
      rebuildTerrain();
      rebuildForeground();
      camX = (next.width * CELL) / 2;
      camY = (next.height * CELL) / 2;
      clampCamera();
      requestRender();
    },
    setExplored(mask) {
      if (map === null) return;
      if (mask === null) explored = null;
      else {
        explored = new Uint8Array(map.width * map.height);
        for (let i = 0; i < explored.length; i += 1)
          explored[i] = mask[i] ? 1 : 0;
      }
      fogChunks.clear();
      requestRender();
    },
    setObjects(next) {
      objects = next;
      rebuildTerrain();
      rebuildForeground();
      requestRender();
    },
    setHeroes(next) {
      heroes = next;
      rebuildForeground();
      requestRender();
    },
    setPathPreview(steps) {
      path = steps;
      requestRender();
    },
    setSelected(cell) {
      selected = cell;
      requestRender();
    },
    setZoom(next, anchor) {
      if (!(ZOOM_STEPS as readonly number[]).includes(next)) return;
      const at = anchor ?? { sx: cssW / 2, sy: cssH / 2 };
      const before = screenToWorld(at.sx, at.sy);
      zoom = next;
      // Keep the world point under the anchor where it was.
      camX = before.wx - (at.sx - cssW / 2) / zoom;
      camY = before.wy - (at.sy - cssH / 2) / zoom;
      clampCamera();
      requestRender();
    },
    getZoom: () => zoom,
    centerOn(x, y) {
      camX = x * CELL + CELL / 2;
      camY = y * CELL + CELL / 2;
      clampCamera();
      requestRender();
    },
    screenToCell(sx, sy) {
      if (map === null) return null;
      const { wx, wy } = screenToWorld(sx, sy);
      const x = Math.floor(wx / CELL);
      const y = Math.floor(wy / CELL);
      return x >= 0 && y >= 0 && x < map.width && y < map.height
        ? { x, y }
        : null;
    },
    onHover(callback) {
      hoverCallback = callback;
    },
    onClick(callback) {
      clickCallback = callback;
    },
    render,
    prebuild() {
      if (map === null) return;
      for (let cy = 0; cy < Math.ceil(map.height / CHUNK_CELLS); cy += 1)
        for (let cx = 0; cx < Math.ceil(map.width / CHUNK_CELLS); cx += 1) {
          chunkAt(cx, cy);
          if (explored !== null) fogChunkAt(cx, cy);
        }
    },
    resize() {
      dpr = window.devicePixelRatio || 1;
      cssW = Math.max(1, canvas.clientWidth);
      cssH = Math.max(1, canvas.clientHeight);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      clampCamera();
      requestRender();
    },
    stats: () => ({ ...stat }),
    destroy() {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      chunks.clear();
      fogChunks.clear();
    },
  };
  view.resize();
  return view;
}
