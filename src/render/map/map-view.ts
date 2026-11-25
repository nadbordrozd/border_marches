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
 *    shade, roads) and then every TALL_BODY entry (canopy trees, peaks,
 *    doodads, placed decorations and props) that overlaps the chunk, in
 *    pass order;
 * 3. the FOREGROUND entries in row, column, layer order: the bands above
 *    low rock, the cached crown bands of the canopy (canopy-paint.ts),
 *    objects, monsters, heroes, path arrows, chips;
 * 4. the fog of war, also cached in chunks, over everything.
 *
 * Changes stay local (bead xaj.31): setObjects updates the terrain plan
 * (terrain-plan.ts) around the cells whose objects changed and repaints only
 * the changed boxes of cached chunks and the changed crown bands; a change
 * of the explored cells rebuilds (and fades) only the fog chunks round them.
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
import { PEAK_ASSETS } from "../../assets/peaks";
import { TREE_ASSETS } from "../../assets/trees";
import { installCanopyBands, paintCanopyBand, toneTree } from "./canopy-paint";
import { paintFog } from "./fog";
import { FxField, drawFx } from "../fx/field.ts";
import type { FxClock } from "../fx/field.ts";
import { paintGround } from "./ground";
import type { GroundLayout } from "./ground";
import { hashUnit } from "./hash";
import { doodadArt } from "./doodad-art";
import { doodadSpecs } from "./doodads";
import { tonePeak } from "./peak-paint";
import { paintPeakUnder } from "./peaks";
import type { PeakField } from "./peaks";
import type { PlacedDecoration } from "./decorations";
import {
  compareEntries,
  decorationEntries,
  objectEntries,
  unitEntry,
} from "./scene";
import type { SceneEntry } from "./scene";
import { MapInput, WheelZoom, glideAt, glideMs } from "./input";
import type { Glide } from "./input";
import { pathMarkers } from "./path-markers";
import type { PathMarker } from "./path-markers";
import { planTerrain } from "./terrain-plan";
import type { TerrainPlan, WorldRect } from "./terrain-plan";

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

export interface MapHero {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** Unit or hero sprite key; the Lost World Chieftain by default. */
  readonly unit?: string;
  /** Owner's flag colour (CSS colour); drawn as a pennant over the hero. */
  readonly colour?: string;
}

/** An owner flag planted at a cell (town and mine entrances). */
export interface MapFlag {
  readonly x: number;
  readonly y: number;
  /** CSS colour. */
  readonly colour: string;
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
  /** Cached chunks painted again in part after an object change. */
  readonly chunksPatched: number;
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
  /**
   * Purely decorative pieces to draw (decorations.ts, bead bzc.48):
   * passable decorations and impassable props. Drawing only: the placer
   * keeps props off paths and makes their cells block movement. setMap
   * clears them.
   */
  setDecorations(decorations: readonly PlacedDecoration[]): void;
  setHeroes(heroes: readonly MapHero[]): void;
  /** Owner flags (player colours) at object entrances. */
  setFlags(flags: readonly MapFlag[]): void;
  /**
   * The planned path's markers (path-markers.ts); `from` is the hero's
   * cell, for the half-way arrow into the first step.
   */
  setPathPreview(steps: readonly PathStep[] | null, from?: Cell): void;
  /** A selected cell: a monster there shows its count chip. */
  setSelected(cell: Cell | null): void;
  /**
   * Spell targeting (bead bzc.47): cells that may be chosen, outlined with
   * a stepped pulse over the units (null clears).
   */
  setTargetCells(cells: readonly Cell[] | null): void;
  setZoom(zoom: number, anchor?: { sx: number; sy: number }): void;
  getZoom(): number;
  /** Centres the view on cell (x, y) at once (stops a glide). */
  centerOn(x: number, y: number): void;
  /**
   * Glides the camera to centre cell (x, y), eased; resolves when it is
   * there (at once when it already is, or when another camera move takes
   * over). `still` (reduced motion) snaps.
   */
  glideTo(x: number, y: number, still?: boolean): Promise<void>;
  /**
   * Map input on or off (bead xaj.18): off while a town or battle screen,
   * a dialog, a walk or the AI's turn is up. Off, the map neither pans,
   * zooms, hovers nor clicks, and a drag, held arrow key or edge scroll in
   * progress is dropped.
   */
  setInputEnabled(on: boolean): void;
  /** The canvas CSS pixel of a cell's centre (may lie off the canvas). */
  cellToScreen(x: number, y: number): { x: number; y: number };
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
  /**
   * Motion (bead bzc.26). Walks a hero sprite from one cell to the next
   * with a bob, the camera following; resolves after `ms`. With `still`
   * (reduced motion) it only waits.
   */
  walkHero(
    id: string,
    from: Cell,
    to: Cell,
    ms: number,
    still?: boolean,
  ): Promise<void>;
  /** Pixel effects over the map (world pixels), drawn under the fog. */
  spawnFx(fn: (field: FxField, clock: FxClock) => void): void;
  /** A flag at cell (x, y) rises up its pole (a capture). */
  raiseFlag(x: number, y: number): void;
  /** Revealed fog fades out instead of vanishing (false: snaps). */
  setFogFade(on: boolean): void;
  /** World pixel of a cell's centre. */
  cellCentre(x: number, y: number): { x: number; y: number };
}

/** How long newly revealed cells take to clear (ms). */
export const FOG_FADE_MS = 160;
/** How long a captured flag takes to rise (ms). */
export const FLAG_RAISE_MS = 520;
/** The most a camera glide advances in one frame (ms). */
const GLIDE_FRAME_MS = 40;

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

interface Chunk {
  readonly surface: Surface | null;
}

/** Size of the path markers against their original 20 px drawing. */
const PATH_MARKER_SCALE = 0.78;

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
  // Three markers per cell (path-markers.ts): smaller, so the line stays calm.
  ctx.scale(PATH_MARKER_SCALE, PATH_MARKER_SCALE);
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
  // The peaks, calmer than units, their outlines softened (peak-paint.ts).
  for (const peak of PEAK_ASSETS) {
    const image = images.get(peak.key);
    if (image !== undefined)
      images.set(peak.key, tonePeak(image, peak.w, peak.h, peak.terrain));
  }
  let peakField: PeakField | null = null;

  let map: GameMap | null = null;
  let objects: readonly MapObject[] = [];
  let heroes: readonly MapHero[] = [];
  let path: readonly PathMarker[] | null = null;
  let flags: readonly MapFlag[] = [];
  let selected: Cell | null = null;
  let hovered: Cell | null = null;
  let targets: readonly Cell[] | null = null;
  let explored: Uint8Array | null = null;

  let layout: GroundLayout | null = null;
  let bodies: readonly SceneEntry[] = [];
  /** Placed decorations and props (setDecorations, bead bzc.48). */
  let decorationBodies: readonly SceneEntry[] = [];
  let foreground: SceneEntry[] = [];
  let terrainForeground: readonly SceneEntry[] = [];
  /** The terrain plan, updated in place on setObjects. */
  let plan: TerrainPlan | null = null;
  const chunks = new Map<string, Chunk>();
  /** Per cached chunk, the world box to paint again before its next draw. */
  const patches = new Map<string, WorldRect>();
  let fogChunks = new Map<string, Chunk>();
  // Motion (bead bzc.26): the fog being faded out, hero offsets, effects.
  let fadingFog: Map<string, Chunk> | null = null;
  let fogFadeStart = 0;
  let fogFade = true;
  const heroOffsets = new Map<string, { dx: number; dy: number }>();
  const flagRaises = new Map<string, number>();
  const fx = new FxField(400);
  let animating = false;

  let zoom = DEFAULT_ZOOM;
  let camX = 0;
  let camY = 0;
  let cssW = 1;
  let cssH = 1;
  let dpr = 1;

  const stat = {
    lastFrameMs: 0,
    chunksBuilt: 0,
    chunksPatched: 0,
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

  /**
   * Marks the parts of cached chunks that world rectangles overlap for
   * painting again (patchChunk, when the chunk is next drawn): per chunk the
   * bounding box of what changed in it.
   */
  const markChunks = (rects: readonly WorldRect[]): void => {
    for (const key of chunks.keys()) {
      const [cx = 0, cy = 0] = key.split(",").map(Number);
      const x0 = cx * CHUNK_PX;
      const y0 = cy * CHUNK_PX;
      let box = patches.get(key) ?? null;
      for (const r of rects) {
        if (
          r.x1 <= x0 ||
          r.x0 >= x0 + CHUNK_PX ||
          r.y1 <= y0 ||
          r.y0 >= y0 + CHUNK_PX
        )
          continue;
        const part = {
          x0: Math.max(x0, r.x0),
          y0: Math.max(y0, r.y0),
          x1: Math.min(x0 + CHUNK_PX, r.x1),
          y1: Math.min(y0 + CHUNK_PX, r.y1),
        };
        box =
          box === null
            ? part
            : {
                x0: Math.min(box.x0, part.x0),
                y0: Math.min(box.y0, part.y0),
                x1: Math.max(box.x1, part.x1),
                y1: Math.max(box.y1, part.y1),
              };
      }
      if (box !== null) patches.set(key, box);
    }
  };

  /**
   * The terrain of the map with the current objects (the crowd of peaks,
   * bead xaj.30: peaks and trees share the crown bands). `incremental` keeps
   * the plan and places again only what the changed cells reach
   * (terrain-plan.ts, bead xaj.31), dropping only the chunks and crown bands
   * that changed.
   */
  const rebuildTerrain = (incremental = false): void => {
    if (map === null) {
      plan = null;
      chunks.clear();
      patches.clear();
      peakField = null;
      layout = null;
      bodies = [];
      terrainForeground = [];
      return;
    }
    const update = planTerrain(map, objects, incremental ? plan : null);
    plan = update.plan;
    peakField = plan.peakField;
    layout = plan.layout;
    bodies = plan.bodies;
    terrainForeground = plan.foreground;
    if (update.dirty === null) {
      chunks.clear();
      patches.clear();
      installCanopyBands(images, plan.bands);
    } else {
      markChunks(update.dirty);
      for (const key of update.drop) images.delete(key);
      for (const band of update.paint)
        images.set(band.key, paintCanopyBand(band, images));
    }
  };

  const rebuildForeground = (): void => {
    const entries: SceneEntry[] = [
      ...terrainForeground,
      ...objectEntries(objects),
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
      const image = images.get(s.key);
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
   * The bodies over a world box in draw order: the terrain plan's and the
   * placed decorations' (bead bzc.48), merged by foot.
   */
  const bodiesOver = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): readonly SceneEntry[] => {
    const over = (e: SceneEntry): boolean =>
      e.x1 > x0 && e.x0 < x1 && e.y1 > y0 && e.y0 < y1;
    const terrain = bodies.filter(over);
    const decor = decorationBodies.filter(over);
    if (decor.length === 0) return terrain;
    return [...terrain, ...decor].sort(compareEntries);
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
    if (peakField !== null) paintPeakUnder(peakField, x0, y0, w, h, image.data);
    ctx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.translate(-x0, -y0);
    for (const e of bodiesOver(x0, y0, x0 + w, y0 + h)) drawSprites(ctx, e);
    stat.chunksBuilt += 1;
    stat.chunkBuildMs += performance.now() - t0;
    return { surface };
  };

  /**
   * Paints a box of a cached chunk again (bead xaj.31): the ground and the
   * peak underlay of the box (both pure functions of the world pixel, the
   * underlay in 2 px blocks, so the box snaps to even pixels), then every
   * body over it, clipped to it: the same pixels as building the chunk anew.
   */
  const patchChunk = (cx: number, cy: number, box: WorldRect): void => {
    const surface = chunks.get(chunkKey(cx, cy))?.surface ?? null;
    if (surface === null || map === null || layout === null) return;
    const t0 = performance.now();
    const ox = cx * CHUNK_PX;
    const oy = cy * CHUNK_PX;
    const x0 = Math.max(ox, Math.floor(box.x0 / 2) * 2);
    const y0 = Math.max(oy, Math.floor(box.y0 / 2) * 2);
    const x1 = Math.min(ox + surface.width, Math.ceil(box.x1 / 2) * 2);
    const y1 = Math.min(oy + surface.height, Math.ceil(box.y1 / 2) * 2);
    if (x1 <= x0 || y1 <= y0) return;
    const ctx = context2d(surface);
    const image = ctx.createImageData(x1 - x0, y1 - y0);
    paintGround(layout, assets.ground, x0, y0, x1 - x0, y1 - y0, image.data);
    if (peakField !== null)
      paintPeakUnder(peakField, x0, y0, x1 - x0, y1 - y0, image.data);
    ctx.putImageData(image, x0 - ox, y0 - oy);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    ctx.rect(x0 - ox, y0 - oy, x1 - x0, y1 - y0);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.translate(-ox, -oy);
    for (const e of bodiesOver(x0, y0, x1, y1)) drawSprites(ctx, e);
    ctx.restore();
    stat.chunksPatched += 1;
    stat.chunkBuildMs += performance.now() - t0;
  };

  const chunkAt = (cx: number, cy: number): Chunk => {
    const key = chunkKey(cx, cy);
    let chunk = chunks.get(key);
    const box = patches.get(key);
    if (box !== undefined) {
      patches.delete(key);
      if (chunk !== undefined) patchChunk(cx, cy, box);
    }
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
    if (path === null) return;
    for (const m of path) {
      if (!isExplored(m.cell.x, m.cell.y)) continue;
      ctx.drawImage(
        marker(m.kind, m.dir, m.reachable),
        m.cx * CELL - 16,
        m.cy * CELL - 16,
      );
    }
  };

  /** Valid spell targets: a gold outline with a stepped pulse. */
  const drawTargets = (ctx: Context, now: number): void => {
    if (targets === null || targets.length === 0) return;
    const step = [0, 1, 2, 3, 2, 1][Math.floor(now / 140) % 6] ?? 1;
    // A wide aim (an explored cell anywhere) is a soft wash, not outlines.
    const wide = targets.length > 40;
    ctx.save();
    for (const c of targets) {
      if (!isExplored(c.x, c.y)) continue;
      const x = c.x * CELL;
      const y = c.y * CELL;
      if (wide) {
        ctx.fillStyle = `rgba(255, 214, 92, ${0.08 + step * 0.025})`;
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
        continue;
      }
      const inset = 3 - step * 0.5;
      ctx.fillStyle = "rgba(255, 214, 92, 0.16)";
      ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(20, 14, 8, 0.8)";
      ctx.strokeRect(x + inset, y + inset, CELL - 2 * inset, CELL - 2 * inset);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = step >= 2 ? "#fff0a0" : "#ffd65c";
      ctx.strokeRect(x + inset, y + inset, CELL - 2 * inset, CELL - 2 * inset);
    }
    if (
      wide &&
      hovered !== null &&
      targets.some((c) => c.x === hovered?.x && c.y === hovered.y)
    ) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "#fff0a0";
      ctx.strokeRect(
        hovered.x * CELL + 2,
        hovered.y * CELL + 2,
        CELL - 4,
        CELL - 4,
      );
    }
    ctx.restore();
  };

  /** A pole with a pennant; (px, py) is the foot of the pole. */
  const drawPennant = (
    ctx: Context,
    px: number,
    py: number,
    colour: string,
    pole: number,
  ): void => {
    ctx.fillStyle = "#2a1f14";
    ctx.fillRect(px - 1, py - pole, 2, pole);
    ctx.fillStyle = colour;
    ctx.strokeStyle = "rgba(20, 14, 8, 0.85)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 1, py - pole);
    ctx.lineTo(px + 15, py - pole + 4);
    ctx.lineTo(px + 1, py - pole + 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };

  const drawFlags = (ctx: Context): void => {
    const now = performance.now();
    for (const f of flags) {
      if (!isExplored(f.x, f.y)) continue;
      // A capture: the pole grows and the pennant climbs it.
      const start = flagRaises.get(`${f.x},${f.y}`);
      const k =
        start === undefined ? 1 : Math.min(1, (now - start) / FLAG_RAISE_MS);
      if (k >= 1 && start !== undefined) flagRaises.delete(`${f.x},${f.y}`);
      const pole = Math.round(30 * (k < 0.6 ? k / 0.6 : 1));
      const px = f.x * CELL + 8;
      const py = f.y * CELL + CELL - 10;
      if (k < 1) {
        ctx.fillStyle = "#2a1f14";
        ctx.fillRect(px - 1, py - pole, 2, pole);
        if (k > 0.45)
          drawPennant(
            ctx,
            px,
            py - Math.round((1 - k) * 18),
            f.colour,
            30 - Math.round((1 - k) * 18),
          );
      } else drawPennant(ctx, px, py, f.colour, 30);
    }
    for (const h of heroes) {
      if (h.colour === undefined || !isExplored(h.x, h.y)) continue;
      const off = heroOffsets.get(h.id);
      drawPennant(
        ctx,
        h.x * CELL + CELL / 2 + 12 + (off?.dx ?? 0),
        h.y * CELL + 10 + (off?.dy ?? 0),
        h.colour,
        20,
      );
    }
  };

  /** Renders every frame while something moves; stops when all is still. */
  const animate = (): void => {
    if (animating) return;
    animating = true;
    const loop = (): void => {
      const now = performance.now();
      fx.prune(now);
      const busy =
        fx.size > 0 ||
        flagRaises.size > 0 ||
        heroOffsets.size > 0 ||
        targets !== null ||
        (fadingFog !== null && now - fogFadeStart < FOG_FADE_MS);
      view.render();
      if (busy) requestAnimationFrame(loop);
      else animating = false;
    };
    requestAnimationFrame(loop);
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
      const off =
        e.objectId === undefined ? undefined : heroOffsets.get(e.objectId);
      if (off !== undefined) {
        ctx.save();
        ctx.translate(off.dx, off.dy);
        drawSprites(ctx, e);
        ctx.restore();
      } else drawSprites(ctx, e);
      stat.drawnEntries += 1;
    }
    // Path markers above the units of their row: drawn after the whole
    // foreground so a tree top never hides the route (HoMaM does the same).
    drawFlags(ctx);
    drawPath(ctx);
    if (chipCell !== null) drawChip(ctx, chipCell);
    const now = performance.now();
    drawTargets(ctx, now);
    drawFx(ctx, fx, now);
    if (explored !== null) {
      for (let cy = r0; cy <= r1; cy += 1)
        for (let cx = c0; cx <= c1; cx += 1) {
          const chunk = fogChunkAt(cx, cy);
          if (chunk.surface !== null)
            ctx.drawImage(chunk.surface, cx * CHUNK_PX, cy * CHUNK_PX);
        }
      // The fog as it was, fading out over the new fog (a reveal).
      const k = (now - fogFadeStart) / FOG_FADE_MS;
      if (fadingFog !== null && k < 1) {
        ctx.globalAlpha = Math.ceil((1 - k) * 4) / 4;
        for (let cy = r0; cy <= r1; cy += 1)
          for (let cx = c0; cx <= c1; cx += 1) {
            const chunk = fadingFog.get(chunkKey(cx, cy));
            if (chunk?.surface)
              ctx.drawImage(chunk.surface, cx * CHUNK_PX, cy * CHUNK_PX);
          }
        ctx.globalAlpha = 1;
      } else fadingFog = null;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    stat.lastFrameMs = performance.now() - t0;
  };

  // ------------------------------------------------------------ input

  const input = new MapInput();
  const wheel = new WheelZoom();
  let lastTick = 0;
  let ticking = false;
  /** The camera glide in progress and the promise waiting on it. */
  let glide: (Glide & { resolve: () => void }) | null = null;

  const stopGlide = (): void => {
    const g = glide;
    glide = null;
    g?.resolve();
  };

  const tick = (now: number): void => {
    ticking = false;
    const dt =
      lastTick === 0 ? 1 / 60 : Math.min(0.05, (now - lastTick) / 1000);
    lastTick = now;
    const { vx, vy } = input.velocity(cssW, cssH, now);
    if (vx !== 0 || vy !== 0) {
      stopGlide();
      camX += (vx * dt) / zoom;
      camY += (vy * dt) / zoom;
      clampCamera();
      render();
    }
    if (!input.wantsTicks(cssW, cssH)) {
      lastTick = 0;
      return;
    }
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

  /** Drops the gesture in progress and the hover (input off, blur). */
  const dropInput = (): void => {
    input.reset();
    setHovered(null);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    if (!input.pointerDown(event.offsetX, event.offsetY, camX, camY)) return;
    canvas.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent): void => {
    const out = input.pointerMove(event.offsetX, event.offsetY, zoom);
    if (out.kind === "pan") {
      stopGlide();
      camX = out.camX;
      camY = out.camY;
      clampCamera();
      requestRender();
    } else if (out.kind === "hover") {
      setHovered(view.screenToCell(out.x, out.y));
      startTicking();
    }
  };
  const onPointerUp = (event: PointerEvent): void => {
    // Settle the press before releasing the capture (lostpointercapture
    // drops a drag in progress).
    const click = input.pointerUp();
    if (canvas.hasPointerCapture(event.pointerId))
      canvas.releasePointerCapture(event.pointerId);
    if (!click) return;
    const cell = view.screenToCell(event.offsetX, event.offsetY);
    if (cell !== null) clickCallback?.(cell, event);
  };
  const onPointerCancel = (): void => {
    input.pointerUp();
    input.pointerLeave();
  };
  const onPointerLeave = (): void => {
    input.pointerLeave();
    setHovered(null);
  };
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (!input.isEnabled()) return;
    const step = wheel.push(event.deltaY, event.deltaMode, performance.now());
    if (step === 0) return;
    const index = ZOOM_STEPS.indexOf(zoom as (typeof ZOOM_STEPS)[number]);
    const next =
      ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, index + step))];
    if (next !== undefined && next !== zoom) {
      stopGlide();
      view.setZoom(next, { sx: event.offsetX, sy: event.offsetY });
    }
  };
  /** Arrow keys pan only the map on screen, never under a text field. */
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    )
      return;
    if (!canvas.isConnected || canvas.offsetParent === null) return;
    if (!input.keyDown(event.key)) return;
    event.preventDefault();
    startTicking();
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    input.keyUp(event.key);
  };
  const onBlur = (): void => dropInput();
  const onResize = (): void => view.resize();

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("lostpointercapture", onPointerCancel);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  window.addEventListener("resize", onResize);

  const view: MapView = {
    setMap(next) {
      map = next;
      objects = next.objects;
      decorationBodies = [];
      explored = null;
      fogChunks.clear();
      fadingFog = null;
      rebuildTerrain();
      rebuildForeground();
      camX = (next.width * CELL) / 2;
      camY = (next.height * CELL) / 2;
      clampCamera();
      requestRender();
    },
    setExplored(mask) {
      if (map === null) return;
      const was = explored;
      if (mask === null) {
        if (explored === null) return;
        explored = null;
      } else {
        const next = new Uint8Array(map.width * map.height);
        for (let i = 0; i < next.length; i += 1) next[i] = mask[i] ? 1 : 0;
        // Unchanged: keep the cached fog (and start no fade).
        if (explored !== null && next.every((v, i) => v === explored?.[i]))
          return;
        explored = next;
      }
      if (was !== null && explored !== null) {
        // Only the fog chunks within a cell of a revealed (or hidden) cell
        // change (a fog pixel reads its cell and the eight round it); only
        // those are built again and fade (bead xaj.31).
        const { width, height } = map;
        const stale = new Set<string>();
        for (let i = 0; i < explored.length; i += 1) {
          if (explored[i] === was[i]) continue;
          const x = i % width;
          const y = Math.floor(i / width);
          for (
            let yy = Math.max(0, y - 1);
            yy <= Math.min(height - 1, y + 1);
            yy += 1
          )
            for (
              let xx = Math.max(0, x - 1);
              xx <= Math.min(width - 1, x + 1);
              xx += 1
            )
              stale.add(
                chunkKey(
                  Math.floor(xx / CHUNK_CELLS),
                  Math.floor(yy / CHUNK_CELLS),
                ),
              );
        }
        const fading = new Map<string, Chunk>();
        for (const key of stale) {
          const chunk = fogChunks.get(key);
          if (chunk === undefined) continue;
          fading.set(key, chunk);
          fogChunks.delete(key);
        }
        if (fogFade && fading.size > 0) {
          fadingFog = fading;
          fogFadeStart = performance.now();
          animate();
        }
      } else if (fogFade && fogChunks.size > 0) {
        fadingFog = fogChunks;
        fogFadeStart = performance.now();
        fogChunks = new Map();
        animate();
      } else fogChunks.clear();
      requestRender();
    },
    setObjects(next) {
      objects = next;
      rebuildTerrain(true);
      rebuildForeground();
      requestRender();
    },
    setDecorations(next) {
      const was = decorationBodies;
      decorationBodies = decorationEntries(next);
      // Paint the boxes of the decorations gone and new again.
      markChunks(
        [...was, ...decorationBodies].map((e) => ({
          x0: e.x0,
          y0: e.y0,
          x1: e.x1,
          y1: e.y1,
        })),
      );
      requestRender();
    },
    setHeroes(next) {
      heroes = next;
      rebuildForeground();
      requestRender();
    },
    setFlags(next) {
      flags = next;
      requestRender();
    },
    setPathPreview(steps, from) {
      path = steps === null ? null : pathMarkers(steps, from ?? null);
      requestRender();
    },
    setSelected(cell) {
      selected = cell;
      requestRender();
    },
    setTargetCells(cells) {
      targets = cells === null ? null : [...cells];
      // The pulse keeps the frame loop running while targets glow.
      if (targets !== null) animate();
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
      stopGlide();
      camX = x * CELL + CELL / 2;
      camY = y * CELL + CELL / 2;
      clampCamera();
      requestRender();
    },
    glideTo(x, y, still = false) {
      stopGlide();
      const from = { x: camX, y: camY };
      camX = x * CELL + CELL / 2;
      camY = y * CELL + CELL / 2;
      clampCamera();
      const to = { x: camX, y: camY };
      const ms = glideMs(Math.hypot(to.x - from.x, to.y - from.y) * zoom);
      if (still || ms === 0) {
        requestRender();
        return Promise.resolve();
      }
      camX = from.x;
      camY = from.y;
      return new Promise<void>((resolve) => {
        const mine = { from, to, t0: 0, ms, resolve };
        glide = mine;
        // The glide's own clock: a slow frame (chunks built on the way)
        // advances it by at most GLIDE_FRAME_MS, so the camera never jumps.
        let clock = 0;
        let last = performance.now();
        const step = (): void => {
          if (glide !== mine) return;
          const now = performance.now();
          clock += Math.min(GLIDE_FRAME_MS, now - last);
          last = now;
          const at = glideAt(mine, clock);
          camX = at.x;
          camY = at.y;
          render();
          if (at.done) stopGlide();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    },
    setInputEnabled(on) {
      if (on === input.isEnabled()) return;
      input.setEnabled(on);
      if (!on) dropInput();
    },
    cellToScreen(x, y) {
      const { ox, oy } = origin();
      return {
        x: ox + (x * CELL + CELL / 2) * zoom,
        y: oy + (y * CELL + CELL / 2) * zoom,
      };
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
    walkHero(id, from, to, ms, still = false) {
      if (still || ms <= 0) {
        heroOffsets.delete(id);
        return new Promise((r) => setTimeout(r, Math.max(0, ms)));
      }
      stopGlide();
      const dx0 = (from.x - to.x) * CELL;
      const dy0 = (from.y - to.y) * CELL;
      const t0 = performance.now();
      heroOffsets.set(id, { dx: dx0, dy: dy0 });
      animate();
      return new Promise((resolve) => {
        const step = (): void => {
          const k = Math.min(1, (performance.now() - t0) / ms);
          const bob = Math.round(Math.abs(Math.sin(Math.PI * k)) * 3);
          heroOffsets.set(id, {
            dx: Math.round(dx0 * (1 - k)),
            dy: Math.round(dy0 * (1 - k)) - bob,
          });
          // The camera glides with the hero.
          camX = (to.x + (from.x - to.x) * (1 - k)) * CELL + CELL / 2;
          camY = (to.y + (from.y - to.y) * (1 - k)) * CELL + CELL / 2;
          clampCamera();
          if (k < 1) requestAnimationFrame(step);
          else {
            heroOffsets.delete(id);
            resolve();
          }
        };
        requestAnimationFrame(step);
      });
    },
    spawnFx(fn) {
      fn(fx, { now: performance.now() });
      animate();
    },
    raiseFlag(x, y) {
      flagRaises.set(`${x},${y}`, performance.now());
      animate();
    },
    setFogFade(on) {
      fogFade = on;
      if (!on) fadingFog = null;
    },
    cellCentre: (x, y) => ({ x: x * CELL + CELL / 2, y: y * CELL + CELL / 2 }),
    destroy() {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("lostpointercapture", onPointerCancel);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      stopGlide();
      window.removeEventListener("resize", onResize);
      chunks.clear();
      patches.clear();
      fogChunks.clear();
    },
  };
  view.resize();
  return view;
}
