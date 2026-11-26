/**
 * The adventure screen's minimap: one pixel block per cell with terrain
 * colours, obstacles (impassable props among them, as forest or rock), roads,
 * towns and mines in owner colours, the heroes,
 * dark parchment over unexplored cells inside a one-pixel map border, and
 * the viewport rectangle.
 *
 * {@link minimapPixels}, {@link minimapLayout} and {@link minimapCell} are
 * pure (unit-tested); {@link Minimap} draws them.
 */
import type { GameState } from "../core/game/types.ts";
import type { Terrain } from "../core/map/types.ts";
import { PLAYER_COLOURS as PLAYER_COLOUR_DEFS } from "../data/players.ts";

type Rgb = readonly [number, number, number];

function hexRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Player flag colours by player index (src/data/players.ts). */
export const PLAYER_COLOURS: readonly Rgb[] = PLAYER_COLOUR_DEFS.map((c) =>
  hexRgb(c.hex),
);
const NEUTRAL_COLOUR: Rgb = [0xb8, 0xb0, 0xa0];
const HERO_COLOUR: Rgb = [0xff, 0xf4, 0xd0];
/**
 * Unexplored cells: this colour with alpha 0 in {@link minimapPixels}; the
 * canvas paints them as dark parchment with a faint cross-hatch (FOG_BASE,
 * FOG_LINE) that carries no map information, inside a one-pixel map border
 * (MAP_BORDER), so the map's bounds show from turn 1 (UI2-06; before it,
 * bead bzc.42's slate hatch was nearly as dark as the frame).
 */
const FOG: Rgb = [0x0b, 0x0a, 0x08];
export const FOG_BASE = "#3d3122";
export const FOG_LINE = "#4a3c2a";
/** The one-pixel line round the map area, the panel's trim colour. */
export const MAP_BORDER = "#a0824a";

export const TERRAIN_COLOURS: Readonly<Record<Terrain, Rgb>> = {
  grass: [0x5f, 0x8f, 0x3a],
  jungle: [0x2f, 0x6b, 0x2c],
  steppe: [0xb0, 0x9d, 0x5a],
  badlands: [0xa8, 0x5a, 0x36],
  wasteland: [0x6f, 0x6a, 0x5e],
  // Dark basalt with a warm glow, apart from the grey wasteland.
  volcanic: [0x4a, 0x30, 0x2a],
  // Blue-white, apart from the pale steppe.
  snow: [0xd8, 0xe2, 0xee],
  water: [0x2d, 0x5f, 0x9a],
};
const DEEP_WATER: Rgb = [0x1d, 0x3f, 0x72];
const MOUNTAIN: Rgb = [0x6a, 0x5a, 0x4a];
const FOREST: Rgb = [0x1d, 0x45, 0x1d];
const ROAD: Rgb = [0xc8, 0xb0, 0x80];

export function ownerColour(owner: number | null): Rgb {
  return owner === null
    ? NEUTRAL_COLOUR
    : (PLAYER_COLOURS[owner % PLAYER_COLOURS.length] ?? NEUTRAL_COLOUR);
}

/**
 * An impassable prop's cell (bead bzc.78) blocks like the wall it mostly
 * stands against: forest where more forest than mountain is round it (a
 * prop in place of an edge tree keeps the wood's outline), else rock (a
 * boulder in the open is a dot of rock).
 */
function propColour(state: GameState, i: number): Rgb {
  const { map } = state;
  const x = i % map.width;
  const y = Math.floor(i / map.width);
  let forest = 0;
  let rock = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const ax = x + dx;
      const ay = y + dy;
      if ((dx === 0 && dy === 0) || ax < 0 || ay < 0) continue;
      if (ax >= map.width || ay >= map.height) continue;
      const o = map.cells[ay * map.width + ax]?.obstacle;
      if (o === "forest") forest++;
      else if (o === "mountain") rock++;
    }
  return forest > rock ? FOREST : MOUNTAIN;
}

/** RGBA pixels, one per cell (row-major), as seen by `player`. */
export function minimapPixels(
  state: GameState,
  player: number,
): Uint8ClampedArray<ArrayBuffer> {
  const { map } = state;
  const n = map.width * map.height;
  const out = new Uint8ClampedArray(n * 4);
  const put = (i: number, c: Rgb): void => {
    out[i * 4] = c[0];
    out[i * 4 + 1] = c[1];
    out[i * 4 + 2] = c[2];
    out[i * 4 + 3] = 255;
  };
  for (let i = 0; i < n; i++) {
    const cell = map.cells[i];
    if (cell === undefined) continue;
    let c: Rgb = TERRAIN_COLOURS[cell.terrain];
    if (cell.terrain === "water" && cell.deep === true) c = DEEP_WATER;
    if (cell.obstacle === "mountain") c = MOUNTAIN;
    else if (cell.obstacle === "forest") c = FOREST;
    else if (cell.prop === true) c = propColour(state, i);
    else if (cell.road) c = ROAD;
    put(i, c);
  }
  for (const obj of map.objects) {
    let c: Rgb | null = null;
    if (obj.kind === "town")
      c = ownerColour(state.towns[obj.id]?.owner ?? null);
    else if (obj.kind === "mine")
      c = ownerColour(state.mines[obj.id]?.owner ?? null);
    if (c === null) continue;
    for (const [x, y] of [[obj.x, obj.y] as const, ...obj.blocked]) {
      put(y * map.width + x, c);
    }
  }
  for (const hero of state.heroes) {
    if (!hero.alive) continue;
    put(
      hero.y * map.width + hero.x,
      hero.owner === player ? HERO_COLOUR : ownerColour(hero.owner),
    );
  }
  const explored = state.players.find((p) => p.id === player)?.explored;
  if (explored !== undefined) {
    for (let i = 0; i < n; i++) {
      if (explored[i] === true) continue;
      put(i, FOG);
      out[i * 4 + 3] = 0; // see-through: the canvas paints the fog hatch
    }
  }
  return out;
}

/** The viewport in cells: centre and size. */
export interface MinimapViewport {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** Where the map sits in the frame: offset and size in frame pixels. */
export interface MinimapLayout {
  /** Frame pixels per cell. */
  scale: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Fits a `mapW` x `mapH` cell map into a `frameW` x `frameH` pixel frame:
 * as large as fits with the aspect ratio kept, centred, on whole pixels.
 * `inset` pixels stay free on every side (room for the map border).
 */
export function minimapLayout(
  frameW: number,
  frameH: number,
  mapW: number,
  mapH: number,
  inset = 0,
): MinimapLayout {
  const innerW = Math.max(0, frameW - 2 * inset);
  const innerH = Math.max(0, frameH - 2 * inset);
  const scale = Math.max(0, Math.min(innerW / mapW, innerH / mapH));
  const w = Math.round(mapW * scale);
  const h = Math.round(mapH * scale);
  return {
    scale,
    x: Math.floor((frameW - w) / 2),
    y: Math.floor((frameH - h) / 2),
    w,
    h,
  };
}

/**
 * The cell under frame pixel (`px`, `py`), clamped onto the map so a click
 * on the letterbox or a drag past the edge goes to the nearest edge cell.
 */
export function minimapCell(
  layout: MinimapLayout,
  mapW: number,
  mapH: number,
  px: number,
  py: number,
): { x: number; y: number } {
  const clamp = (v: number, n: number): number =>
    Math.min(n - 1, Math.max(0, Math.floor(v)));
  return {
    x: clamp(((px - layout.x) / Math.max(1, layout.w)) * mapW, mapW),
    y: clamp(((py - layout.y) / Math.max(1, layout.h)) * mapH, mapH),
  };
}

/** Behind the map where a non-square map leaves room: warm, unlike fog. */
const LETTERBOX = "#1c160e";
const VIEWPORT_COLOUR = "#fff4d0";
/** The frame size used before the canvas has been laid out. */
const FALLBACK_PX = 216;

/**
 * The minimap canvas. CSS sizes the frame (src/ui/game.css); the backing
 * store follows the frame at the device pixel ratio, and the map is scaled
 * to fill it (aspect kept, centred), so every map size fills the frame.
 */
export class Minimap {
  readonly canvas = document.createElement("canvas");
  private cells: HTMLCanvasElement | null = null;
  private mapW = 1;
  private mapH = 1;
  private viewport: MinimapViewport | null = null;
  private fog: CanvasPattern | null = null;
  private fogLine = 0;

  constructor(onJump: (x: number, y: number) => void) {
    this.canvas.className = "gm-minimap";
    const jump = (e: PointerEvent): void => {
      if (this.cells === null) return;
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const cell = minimapCell(
        this.layout(),
        this.mapW,
        this.mapH,
        ((e.clientX - rect.left) * this.canvas.width) / rect.width,
        ((e.clientY - rect.top) * this.canvas.height) / rect.height,
      );
      onJump(cell.x, cell.y);
    };
    this.canvas.addEventListener("pointerdown", (e) => {
      // Only the left button moves the view; a right-click (or the Mac's
      // Control-click) does nothing here (UI2-18, bead bzc.68).
      if (e.button !== 0 || e.ctrlKey) return;
      this.canvas.setPointerCapture(e.pointerId);
      jump(e);
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (e.buttons & 1) jump(e);
    });
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => {
        if (this.fitBacking()) this.draw();
      }).observe(this.canvas);
    }
  }

  /** Repaints the cells (call after anything on the map changed). */
  update(state: GameState, player: number): void {
    const { map } = state;
    const cells = this.cells ?? document.createElement("canvas");
    cells.width = map.width;
    cells.height = map.height;
    const ctx = cells.getContext("2d");
    if (ctx === null) return;
    ctx.putImageData(
      new ImageData(minimapPixels(state, player), map.width, map.height),
      0,
      0,
    );
    this.cells = cells;
    this.mapW = map.width;
    this.mapH = map.height;
    this.fitBacking();
    this.draw();
  }

  setViewport(viewport: MinimapViewport): void {
    const v = this.viewport;
    if (
      v !== null &&
      Math.abs(v.cx - viewport.cx) < 0.01 &&
      Math.abs(v.cy - viewport.cy) < 0.01 &&
      v.w === viewport.w &&
      v.h === viewport.h
    ) {
      return;
    }
    this.viewport = viewport;
    this.draw();
  }

  /** Sizes the backing store to the frame; true when it changed. */
  private fitBacking(): boolean {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round((this.canvas.clientWidth || FALLBACK_PX) * dpr);
    const h = Math.round((this.canvas.clientHeight || FALLBACK_PX) * dpr);
    if (w === this.canvas.width && h === this.canvas.height) return false;
    this.canvas.width = w;
    this.canvas.height = h;
    return true;
  }

  /**
   * A dark parchment cross-hatch in device pixels (`line` px per hatch pixel),
   * so it stays crisp whatever the cell scale.
   */
  private fogPattern(
    ctx: CanvasRenderingContext2D,
    line: number,
  ): CanvasPattern | null {
    if (this.fog !== null && this.fogLine === line) return this.fog;
    const tile = document.createElement("canvas");
    const step = 4;
    tile.width = step * line;
    tile.height = step * line;
    const tctx = tile.getContext("2d");
    if (tctx === null) return null;
    tctx.fillStyle = FOG_BASE;
    tctx.fillRect(0, 0, tile.width, tile.height);
    tctx.fillStyle = FOG_LINE;
    for (let i = 0; i < step; i++) {
      tctx.fillRect(i * line, i * line, line, line);
      tctx.fillRect((step - 1 - i) * line, i * line, line, line);
    }
    this.fog = ctx.createPattern(tile, "repeat");
    this.fogLine = line;
    return this.fog;
  }

  /** One CSS pixel in device pixels: the map border and hatch width. */
  private line(): number {
    return Math.max(1, Math.round(window.devicePixelRatio || 1));
  }

  private layout(): MinimapLayout {
    return minimapLayout(
      this.canvas.width,
      this.canvas.height,
      this.mapW,
      this.mapH,
      this.line(),
    );
  }

  private draw(): void {
    const ctx = this.canvas.getContext("2d");
    if (ctx === null || this.cells === null) return;
    const at = this.layout();
    const line = this.line();
    ctx.fillStyle = LETTERBOX;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // The map's bounds: a one-pixel border just outside the map area.
    ctx.fillStyle = MAP_BORDER;
    ctx.fillRect(at.x - line, at.y - line, at.w + 2 * line, at.h + 2 * line);
    // Parchment hatch under the whole map; unexplored cells are see-through.
    ctx.fillStyle = this.fogPattern(ctx, line) ?? FOG_BASE;
    ctx.fillRect(at.x, at.y, at.w, at.h);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.cells, at.x, at.y, at.w, at.h);
    const v = this.viewport;
    if (v === null) return;
    // The viewport rectangle, clamped to the map area so every side shows.
    const px = (cells: number, from: number, size: number): number =>
      Math.round(
        Math.min(from + size, Math.max(from, from + cells * at.scale)),
      );
    const x0 = px(v.cx - v.w / 2, at.x, at.w);
    const y0 = px(v.cy - v.h / 2, at.y, at.h);
    const x1 = px(v.cx + v.w / 2, at.x, at.w);
    const y1 = px(v.cy + v.h / 2, at.y, at.h);
    ctx.strokeStyle = VIEWPORT_COLOUR;
    ctx.lineWidth = line;
    ctx.strokeRect(
      x0 + line / 2,
      y0 + line / 2,
      Math.max(0, x1 - x0 - line),
      Math.max(0, y1 - y0 - line),
    );
  }
}
