/**
 * Tiny pixel sprites for code-drawn effects (bead bzc.26): leaves, seals,
 * gears, wisps, sparks... as masks of palette indexes, rendered once per
 * palette into a cached canvas and drawn 1:1 at whole pixels. No blur, no
 * soft glow: every effect is made of these and of 1-2 px squares.
 *
 * Mask digits index the palette: 1 light, 2 mid, 3 dark, 4 outline,
 * 5 accent; "." is transparent.
 */

/** Light, mid, dark, outline, accent. */
export type Palette = readonly [string, string, string, string, string?];

export const SHAPES = {
  px: ["1"],
  px2: ["11", "12"],
  dot: [".1.", "121", ".1."],
  spark: ["..1..", "..1..", "11211", "..1..", "..1.."],
  leaf: ["..11.", ".1222", "12223", ".223.", ".3..."],
  sprout: ["1...1", "21.12", ".2.2.", "..2..", "..3..", "..3.."],
  vine: [".222.", "2...2", "2.1.2", "2..2.", ".2..."],
  flower: [".5.5.", "55155", ".555.", "..3..", "..3.."],
  seal: [
    "..444..",
    ".45554.",
    "4551554",
    "4511154",
    "4551554",
    ".45554.",
    "..444..",
  ],
  link: [".222.", "2...2", ".222."],
  paper: ["444444", "411114", "413314", "411114", "413314", "411114", "444444"],
  gear: [
    ".5.5.5.",
    ".55555.",
    "555.555",
    "55.3.55",
    "555.555",
    ".55555.",
    ".5.5.5.",
  ],
  gear2: [
    "5..5..5",
    ".55555.",
    ".55.55.",
    "555.555",
    ".55.55.",
    ".55555.",
    "5..5..5",
  ],
  wisp: [".1.", "121", "121", ".2.", ".2.", "..3"],
  mote: ["11", "12"],
  ink: [".4.", ".4.", "444", ".4."],
  ember: ["12", "23"],
  shard: [".1.", "121", "121", ".2.", ".3."],
  flame: ["..1..", ".12..", ".121.", "12221", "23332", ".333."],
  mist: ["..111..", ".111211", "1111111", ".12221."],
  z: ["1111", "..1.", ".1..", "1111"],
  heart: ["11.11", "12111", ".111.", "..1.."],
  clover: [".1.1.", "11211", ".121.", "..3..", "..3.."],
  bone: ["1...1", ".111.", "1...1"],
  drop: [".1.", "121", "232"],
  // A thorny tangle: brown stems (3), pale thorn tips (5), leaves (1, 2).
  bramble: [
    "5..1.2..5",
    ".3.212.3.",
    "..33233..",
    "53.3.3.35",
    ".3312133.",
    "1.3.3.3.2",
    "21..3..12",
    "3...3...3",
  ],
  pennant: ["1111.", "12221", "1111.", "4....", "4...."],
} as const satisfies Record<string, readonly string[]>;

export type ShapeId = keyof typeof SHAPES;

/** Shapes drawn without the dark outline (single pixels, soft mist). */
const BARE: ReadonlySet<ShapeId> = new Set<ShapeId>(["px", "mist"]);

function maskSize(id: ShapeId): { w: number; h: number } {
  const rows = SHAPES[id];
  return { w: rows[0]?.length ?? 0, h: rows.length };
}

/**
 * The drawn size of a shape: its mask plus a one-pixel dark outline on
 * every side (so motes read on any ground), at scale 1.
 */
export function shapeSize(id: ShapeId): { w: number; h: number } {
  const { w, h } = maskSize(id);
  return BARE.has(id) ? { w, h } : { w: w + 2, h: h + 2 };
}

type Surface = HTMLCanvasElement | OffscreenCanvas;

function makeSurface(w: number, h: number): Surface | null {
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  return null;
}

/** The outline of every effect sprite: near-black, warm. */
export const OUTLINE = "#140e08";

const cache = new Map<string, Surface | null>();

/** The shape painted in a palette at an integer scale (cached). */
export function shapeSprite(
  id: ShapeId,
  pal: Palette,
  scale = 1,
  flip = false,
): Surface | null {
  const key = `${id}|${pal.join(",")}|${scale}|${flip ? 1 : 0}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const rows = SHAPES[id];
  const { w, h } = maskSize(id);
  const pad = BARE.has(id) ? 0 : 1;
  const s = makeSurface((w + 2 * pad) * scale, (h + 2 * pad) * scale);
  const ctx = s?.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null
    | undefined;
  const at = (x: number, y: number): string => {
    if (x < 0 || y < 0 || x >= w || y >= h) return ".";
    return (rows[y] ?? "")[flip ? w - 1 - x : x] ?? ".";
  };
  if (s && ctx) {
    if (pad > 0) {
      // The outline: transparent pixels touching the shape (4-neighbours).
      ctx.fillStyle = OUTLINE;
      for (let y = -1; y <= h; y++)
        for (let x = -1; x <= w; x++) {
          if (at(x, y) !== ".") continue;
          if (
            at(x - 1, y) !== "." ||
            at(x + 1, y) !== "." ||
            at(x, y - 1) !== "." ||
            at(x, y + 1) !== "."
          )
            ctx.fillRect((x + 1) * scale, (y + 1) * scale, scale, scale);
        }
    }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const ch = at(x, y);
        if (ch === ".") continue;
        const color = pal[Number(ch) - 1] ?? pal[1];
        if (color === undefined) continue;
        ctx.fillStyle = color;
        ctx.fillRect((x + pad) * scale, (y + pad) * scale, scale, scale);
      }
  }
  cache.set(key, s);
  return s;
}

// ------------------------------------------------------------- palettes

export const SCHOOL_PALETTES = {
  bloom: ["#e8f8a8", "#8fe04a", "#3f9e2e", "#1d4a18", "#f08cb8"],
  accord: ["#fff4c8", "#f2c14e", "#b07a1e", "#4a2e0c", "#c0392b"],
  clock: ["#eaf4ff", "#7fb8ff", "#3f6fb8", "#16264a", "#d8b25a"],
  hush: ["#f0e4ff", "#b48cff", "#6b45b0", "#24163f", "#d8d0e8"],
  storm: ["#fffbe0", "#ffd25a", "#ff7a45", "#7a2410", "#bdf3ff"],
} as const satisfies Record<string, Palette>;

export const PALETTES = {
  dust: ["#e8dcc0", "#bfae8a", "#8a7a5a", "#4a3e2a"],
  impact: ["#ffffff", "#fff2a0", "#ffb040", "#8a3a10"],
  bone: ["#f2ead8", "#cfc3a6", "#8f846a", "#3e3828"],
  gold: ["#fffbe0", "#ffd65c", "#c8901e", "#5a3a0a", "#ffffff"],
  frost: ["#ffffff", "#bdf3ff", "#5cc0e8", "#1f4f78", "#e8fbff"],
  fire: ["#fff6c0", "#ffd040", "#ff7a2a", "#8a2410", "#ffffff"],
  lightning: ["#ffffff", "#fff59a", "#ffd23c", "#6a4a10", "#ffffff"],
  rain: ["#e8f4ff", "#9cc8f0", "#4a78b0", "#1a2e50"],
  wind: ["#ffffff", "#e0eef0", "#a8c4c8", "#4a6468"],
  /** Brambles: leaf greens, a brown stem, pale thorns (Bloom's ground). */
  bramble: ["#b4e463", "#4f9a2c", "#7a4a24", "#2a1a0c", "#ecdcaa"],
  spit: ["#d8ff9a", "#86e04a", "#4a8a22", "#1e3a0e"],
  bomb: ["#8a8a8a", "#3b3b3b", "#222222", "#0d0b08", "#ffb040"],
  shade: ["#e8e0f0", "#a89cc0", "#5a4e78", "#1e1830"],
  white: ["#ffffff", "#f0e6c8", "#a89c80", "#2a2412"],
} as const satisfies Record<string, Palette>;
