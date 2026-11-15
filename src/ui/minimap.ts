/**
 * The adventure screen's minimap: one pixel block per cell with terrain
 * colours, obstacles, roads, towns and mines in owner colours, the heroes,
 * black fog over unexplored cells, and the viewport rectangle.
 *
 * {@link minimapPixels} is pure (unit-tested); {@link Minimap} draws it.
 */
import type { GameState } from "../core/game/types.ts";
import type { Terrain } from "../core/map/types.ts";

type Rgb = readonly [number, number, number];

export const PLAYER_COLOURS: readonly Rgb[] = [[0xfe, 0x75, 0x00]];
const NEUTRAL_COLOUR: Rgb = [0xb8, 0xb0, 0xa0];
const HERO_COLOUR: Rgb = [0xff, 0xf4, 0xd0];
const FOG: Rgb = [0x0b, 0x0a, 0x08];

export const TERRAIN_COLOURS: Readonly<Record<Terrain, Rgb>> = {
  grass: [0x5f, 0x8f, 0x3a],
  jungle: [0x2f, 0x6b, 0x2c],
  steppe: [0xb0, 0x9d, 0x5a],
  badlands: [0xa8, 0x5a, 0x36],
  wasteland: [0x6f, 0x6a, 0x5e],
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
    if (hero.alive) put(hero.y * map.width + hero.x, HERO_COLOUR);
  }
  const explored = state.players.find((p) => p.id === player)?.explored;
  if (explored !== undefined) {
    for (let i = 0; i < n; i++) if (explored[i] !== true) put(i, FOG);
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

export class Minimap {
  readonly canvas = document.createElement("canvas");
  private scale = 1;
  private base: HTMLCanvasElement | null = null;
  private viewport: MinimapViewport | null = null;

  constructor(
    private readonly size: number,
    onJump: (x: number, y: number) => void,
  ) {
    this.canvas.className = "gm-minimap";
    const jump = (e: PointerEvent): void => {
      const rect = this.canvas.getBoundingClientRect();
      const k = this.canvas.width / rect.width / this.scale;
      onJump(
        Math.floor((e.clientX - rect.left) * k),
        Math.floor((e.clientY - rect.top) * k),
      );
    };
    this.canvas.addEventListener("pointerdown", (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      jump(e);
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (e.buttons & 1) jump(e);
    });
  }

  /** Repaints the cells (call after anything on the map changed). */
  update(state: GameState, player: number): void {
    const { map } = state;
    this.scale = Math.max(
      1,
      Math.floor(this.size / Math.max(map.width, map.height)),
    );
    const w = map.width * this.scale;
    const h = map.height * this.scale;
    const small = document.createElement("canvas");
    small.width = map.width;
    small.height = map.height;
    const sctx = small.getContext("2d");
    if (sctx === null) return;
    sctx.putImageData(
      new ImageData(minimapPixels(state, player), map.width, map.height),
      0,
      0,
    );
    const base = document.createElement("canvas");
    base.width = w;
    base.height = h;
    const bctx = base.getContext("2d");
    if (bctx === null) return;
    bctx.imageSmoothingEnabled = false;
    bctx.drawImage(small, 0, 0, w, h);
    this.base = base;
    this.canvas.width = w;
    this.canvas.height = h;
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

  private draw(): void {
    const ctx = this.canvas.getContext("2d");
    if (ctx === null || this.base === null) return;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.base, 0, 0);
    const v = this.viewport;
    if (v === null) return;
    const s = this.scale;
    const x = Math.round((v.cx - v.w / 2) * s) + 0.5;
    const y = Math.round((v.cy - v.h / 2) * s) + 0.5;
    ctx.strokeStyle = "#fff4d0";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, Math.round(v.w * s), Math.round(v.h * s));
  }
}
