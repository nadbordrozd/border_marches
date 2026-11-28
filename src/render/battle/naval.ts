/**
 * The naval battlefield's look (docs/design/NAVAL.md 3.8, bead bzc.153): a
 * plank deck, the water with its glints, gangplanks and jetties, rails
 * along the deck edges, tall masts, crates, reefs and a deck gun at each
 * ship's back rail.
 *
 * Every piece is looked up by key ({@link NAVAL_PIECE_KEYS}). The deck,
 * masts, crates, reefs and deck guns have art (bead bzc.160,
 * {@link NAVAL_PIECE_ART}); each also has a code drawer, used until its
 * images are loaded and for a key without art. The water, gangplanks,
 * rails and foam are drawn in code. All of it is deterministic: hashes of
 * pixel and hex positions, never a random number; the water's motion is a
 * function of the scene clock.
 */

import { BATTLE_PIECE_ART, DECK_BOARDS } from "../../assets/battle-pieces.ts";
import type { ImageAsset } from "../../assets/manifest.ts";
import { clothRamp } from "../map/owner-flag.ts";
import {
  BATTLE_HEIGHT,
  BATTLE_WIDTH,
  fieldHexKinds,
  fieldZones,
  hexIndex,
  isSeaLayout,
  neighbors,
} from "../../core/battle/index.ts";
import type {
  BattleLayout,
  BattleSide,
  BattleState,
  FieldHexKind,
  GroundFeature,
  Hex,
} from "../../core/battle/index.ts";
import {
  FEET_BELOW_CENTER,
  FIELD_X,
  FIELD_Y,
  HEX_SIZE,
  HEX_W,
  STAGE_H,
  STAGE_W,
  hexCorners,
  hexToStage,
  stageToHex,
  type Point,
} from "./geometry.ts";

/** The keys of the naval battle pieces (the art registry takes these). */
export const NAVAL_PIECE_KEYS = {
  deck: "battle-deck",
  mast: "battle-mast",
  crate: "battle-crate",
  reef: "battle-reef",
  deckGun: "battle-deck-gun",
  water: "battle-water",
} as const;

export type NavalPieceKey =
  (typeof NAVAL_PIECE_KEYS)[keyof typeof NAVAL_PIECE_KEYS];

/** The registered art; a key without an entry is drawn in code. */
export const NAVAL_PIECE_ART: Partial<
  Record<NavalPieceKey, readonly ImageAsset[]>
> = BATTLE_PIECE_ART;

/** An image of a piece, at its native size. */
export type PieceImage = CanvasImageSource & {
  readonly width: number;
  readonly height: number;
};

/** Loaded images per key, in the registry's order. */
export type NavalImages = Partial<Record<NavalPieceKey, readonly PieceImage[]>>;

/** A texture's pixels (RGBA), as getImageData gives them. */
export interface TexturePixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export type NavalPieceKind = "mast" | "crate" | "reef";

export interface NavalPiece {
  readonly kind: NavalPieceKind;
  readonly canvas: HTMLCanvasElement;
  /** Where the piece's foot sits below its hex centre (stage pixels). */
  readonly footBelow: number;
  /** The side whose deck a mast stands on (its pennant's colour). */
  readonly side?: BattleSide;
}

/** What the renderer needs to draw a sea layout. */
export interface NavalArt {
  readonly layout: BattleLayout;
  /** Per hex index: land, deck, sea (reefs included) or plank. */
  readonly kinds: readonly FieldHexKind[];
  /** Masts, crates and reefs by hex index, drawn row-sorted with units. */
  readonly pieces: ReadonlyMap<number, NavalPiece>;
  /** Sea hex indexes (for the glints). */
  readonly sea: readonly number[];
  /** Sides that fight from a ship with a deck gun. */
  readonly guns: readonly BattleSide[];
  /** The code-drawn gun (muzzle right, mirrored for the defender). */
  readonly gun: HTMLCanvasElement | null;
  /** The gun art per side, each its own facing; never mirrored. */
  readonly gunArt?: Readonly<Record<BattleSide, PieceImage>>;
  /** The deck art's pixels; absent: code-drawn boards. */
  readonly deck?: TexturePixels;
}

const WOOD = ["#8a5a32", "#94643a", "#7f522c", "#9a6a40"] as const;
const WOOD_SEAM = "#4a2c16";
const PLANK = ["#ab7c4a", "#b68854", "#a07242", "#bd8f58"] as const;
const WOOD_NAIL = "#2e1a0c";
const SEA = ["#1f5a70", "#25687f", "#2c768d"] as const;
const SEA_CREST = "#5fa6ba";
const FOAM = "#d8eef0";

function hash(a: number, b: number, c = 0): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function hexRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/**
 * The hex a stage pixel belongs to, clamped into the field so the margins
 * take the look of the nearest edge hex.
 */
function nearestHex(p: Point): Hex {
  const inside = stageToHex(p);
  if (inside) return inside;
  const x = Math.max(
    FIELD_X + 1,
    Math.min(FIELD_X + HEX_W * (BATTLE_WIDTH + 0.5) - 1, p.x),
  );
  const y = Math.max(
    FIELD_Y + 1,
    Math.min(
      FIELD_Y + 2 * HEX_SIZE + 1.5 * HEX_SIZE * (BATTLE_HEIGHT - 1) - 1,
      p.y,
    ),
  );
  const h = stageToHex({ x, y });
  if (h) return h;
  // Between the staggered rows' notches: the nearest centre.
  let best: Hex = { col: 0, row: 0 };
  let bd = Infinity;
  for (let row = 0; row < BATTLE_HEIGHT; row++)
    for (let col = 0; col < BATTLE_WIDTH; col++) {
      const c = hexToStage({ col, row });
      const d = (c.x - x) ** 2 + (c.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = { col, row };
      }
    }
  return best;
}

/** One stage column of the textured deck. */
export interface DeckColumn {
  /** The texture column it reads. */
  readonly tx: number;
  /** The board's slide down the texture. */
  readonly shift: number;
}

/**
 * The stage's columns cut from the deck texture's boards (`boards`: their
 * left edges, the width last): boards picked by a hash, never the same one
 * twice running, each slid down the texture by its own amount.
 */
export function deckColumns(
  stageWidth: number,
  boards: readonly number[],
): DeckColumn[] {
  const count = boards.length - 1;
  const height = boards[count] ?? 0;
  const out: DeckColumn[] = [];
  let last = -1;
  for (let n = 0; out.length < stageWidth && count > 0; n++) {
    let pick = Math.floor(hash(n, 21) * count);
    if (pick === last && count > 1) pick = (pick + 1) % count;
    last = pick;
    const shift = Math.floor(hash(n, 22) * height);
    const end = boards[pick + 1] ?? 0;
    for (let tx = boards[pick] ?? 0; tx < end; tx++) {
      if (out.length >= stageWidth) break;
      out.push({ tx, shift });
    }
  }
  return out;
}

/**
 * A textured deck pixel. Where a slid board wraps round the texture a butt
 * joint is drawn, so the wrap reads as two planks meeting.
 */
function texturedDeckPixel(
  texture: TexturePixels,
  column: DeckColumn,
  y: number,
): [number, number, number] {
  const ty = (y + column.shift) % texture.height;
  if (ty === 0) return hexRgb(WOOD_SEAM);
  const i = (ty * texture.width + column.tx) * 4;
  const d = texture.data;
  return [d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0];
}

/** A deck pixel: boards 8 px tall with staggered butt joints and nails. */
function deckPixel(x: number, y: number): string {
  const board = Math.floor(y / 8);
  const len = 88;
  const shift = Math.floor(hash(board, 7) * len);
  const seg = Math.floor((x + shift) / len);
  const inBoard = y % 8;
  const along = (x + shift) % len;
  if (inBoard === 0) return WOOD_SEAM;
  if (along === 0) return WOOD_SEAM;
  if ((along === 2 || along === len - 3) && (inBoard === 2 || inBoard === 6))
    return WOOD_NAIL;
  const tone = WOOD[Math.floor(hash(board, seg) * WOOD.length)] as string;
  // A little grain: a darker streak now and then.
  if (hash(x >> 2, board, 3) < 0.06) return "#734a26";
  return tone;
}

/**
 * A water pixel: calm horizontal swell lines (a darker trough, a lit
 * crest now and then) over the sea's middle tone.
 */
function seaPixel(x: number, y: number): string {
  const wobble = Math.sin(x * 0.07 + Math.floor(y / 11) * 1.7) * 2.5;
  const k = (((y + wobble) % 11) + 11) % 11;
  const run = hash(Math.floor(x / 23), Math.floor((y + wobble) / 11), 4);
  if (k < 1 && run < 0.7) return SEA[0] as string;
  if (k >= 1 && k < 2 && run < 0.25) return SEA_CREST;
  return SEA[run < 0.5 ? 1 : 2] as string;
}

/** A gangplank or jetty pixel: short boards across the walk, on water. */
function plankPixel(x: number, y: number, h: Hex): string {
  const c = hexToStage(h);
  // A walk 40 px wide (east to west) of boards 6 px wide.
  if (Math.abs(y - c.y) > 20) return seaPixel(x, y);
  if (Math.abs(y - c.y) >= 18) return WOOD_SEAM;
  const k = Math.floor(x / 6);
  if (x % 6 === 0) return WOOD_SEAM;
  return PLANK[Math.floor(hash(k, h.row, 9) * PLANK.length)] as string;
}

/**
 * Paints a sea layout over the background (the land texture already
 * there stays on a pier's land half): deck, water, planks, the rails along
 * the deck edges and the foam along a pier's shore.
 */
export function paintNavalField(
  ctx: CanvasRenderingContext2D,
  naval: NavalArt,
): void {
  const img = ctx.getImageData(0, 0, STAGE_W, STAGE_H);
  const data = img.data;
  const cache = new Map<string, [number, number, number]>();
  const rgb = (c: string): [number, number, number] => {
    let v = cache.get(c);
    if (!v) {
      v = hexRgb(c);
      cache.set(c, v);
    }
    return v;
  };
  const texture = naval.deck;
  const columns = texture ? deckColumns(STAGE_W, DECK_BOARDS) : [];
  for (let y = 0; y < STAGE_H; y++) {
    for (let x = 0; x < STAGE_W; x++) {
      const h = nearestHex({ x: x + 0.5, y: y + 0.5 });
      const kind = naval.kinds[hexIndex(h)];
      let px: [number, number, number];
      if (kind === "deck") {
        const column = columns[x];
        px =
          texture && column
            ? texturedDeckPixel(texture, column, y)
            : rgb(deckPixel(x, y));
      } else if (kind === "sea") px = rgb(seaPixel(x, y));
      else if (kind === "plank") px = rgb(plankPixel(x, y, h));
      else continue;
      const [r, g, b] = px;
      const i = (y * STAGE_W + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // The faint hex grid again, over the deck and the water.
  ctx.strokeStyle = "rgba(20, 12, 6, 0.28)";
  ctx.lineWidth = 1;
  for (let row = 0; row < BATTLE_HEIGHT; row++)
    for (let col = 0; col < BATTLE_WIDTH; col++) {
      const pts = hexCorners({ col, row }, 0.5);
      ctx.beginPath();
      pts.forEach((p, i) =>
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y),
      );
      ctx.closePath();
      ctx.stroke();
    }
  drawEdges(ctx, naval);
}

/** The two corners of hex `a` on the edge it shares with neighbour `b`. */
function sharedEdge(a: Hex, b: Hex): [Point, Point] {
  const cb = hexToStage(b);
  const corners = hexCorners(a)
    .map((p) => ({ p, d: (p.x - cb.x) ** 2 + (p.y - cb.y) ** 2 }))
    .sort((u, v) => u.d - v.d);
  return [corners[0]?.p as Point, corners[1]?.p as Point];
}

function line(
  ctx: CanvasRenderingContext2D,
  a: Point,
  b: Point,
  color: string,
  width: number,
  dy = 0,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(Math.round(a.x) + 0.5, Math.round(a.y + dy) + 0.5);
  ctx.lineTo(Math.round(b.x) + 0.5, Math.round(b.y + dy) + 0.5);
  ctx.stroke();
}

/** Rails where a deck meets the water; foam where land does. */
function drawEdges(ctx: CanvasRenderingContext2D, naval: NavalArt): void {
  const posts: Point[] = [];
  for (let row = 0; row < BATTLE_HEIGHT; row++) {
    for (let col = 0; col < BATTLE_WIDTH; col++) {
      const h = { col, row };
      const kind = naval.kinds[hexIndex(h)];
      if (kind !== "deck" && kind !== "land") continue;
      for (const n of neighbors(h)) {
        if (naval.kinds[hexIndex(n)] !== "sea") continue;
        const [a, b] = sharedEdge(h, n);
        if (kind === "land") {
          line(ctx, a, b, FOAM, 2);
          continue;
        }
        // A rail: a dark beam with a lit top edge, posts at the corners.
        line(ctx, a, b, "#3a2210", 5, -2);
        line(ctx, a, b, "#b07a48", 1, -4);
        posts.push(a, b);
      }
    }
  }
  ctx.fillStyle = "#3a2210";
  for (const p of posts)
    ctx.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 9, 4, 9);
  ctx.fillStyle = "#c08a58";
  for (const p of posts)
    ctx.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 9, 4, 1);
}

function canvasOf(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** A tall mast with a furled sail and a pennant in the side's colour. */
function drawMast(side: BattleSide): HTMLCanvasElement {
  const c = canvasOf(44, 118);
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const pole = 19;
  // Foot: a ring of rope on the deck.
  ctx.fillStyle = "#5a3a1c";
  ctx.fillRect(pole - 5, 112, 16, 5);
  ctx.fillStyle = "#c8b080";
  ctx.fillRect(pole - 4, 112, 14, 1);
  // The pole, with a lit edge.
  ctx.fillStyle = "#4a2c16";
  ctx.fillRect(pole, 12, 6, 102);
  ctx.fillStyle = "#8a5a32";
  ctx.fillRect(pole + 1, 12, 2, 102);
  // The yard and the furled sail.
  ctx.fillStyle = "#4a2c16";
  ctx.fillRect(3, 34, 38, 4);
  ctx.fillStyle = "#e8dcc0";
  ctx.fillRect(5, 38, 34, 6);
  ctx.fillStyle = "#b8a888";
  for (let x = 8; x < 38; x += 6) ctx.fillRect(x, 38, 1, 6);
  // A crow's nest.
  ctx.fillStyle = "#5a3a1c";
  ctx.fillRect(pole - 5, 20, 16, 6);
  ctx.fillStyle = "#8a5a32";
  ctx.fillRect(pole - 5, 20, 16, 1);
  // The pennant.
  ctx.fillStyle = side === "attacker" ? "#3c6ec8" : "#c83c3c";
  ctx.fillRect(pole + 6, 2, 12, 3);
  ctx.fillRect(pole + 6, 5, 8, 3);
  ctx.fillRect(pole + 6, 8, 4, 2);
  ctx.fillStyle = "#4a2c16";
  ctx.fillRect(pole + 2, 0, 2, 12);
  return c;
}

const PENNANT: Readonly<Record<BattleSide, string>> = {
  attacker: "#3c6ec8",
  defender: "#c83c3c",
};

/** The mast art's pennant: right of the pole's tip, above the crow's nest. */
export const MAST_PENNANT = { minX: 34, maxY: 16 } as const;

/**
 * A copy of the mast art's pixels with its white pennant in the side's
 * colour (its greys become the fold shade). Pure.
 */
export function tintPennant(
  src: TexturePixels,
  side: BattleSide,
): TexturePixels {
  const data = new Uint8ClampedArray(src.data);
  const { shade, base, light } = clothRamp(PENNANT[side]);
  for (let y = 0; y < Math.min(src.height, MAST_PENNANT.maxY); y++) {
    for (let x = MAST_PENNANT.minX; x < src.width; x++) {
      const i = (y * src.width + x) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const v = Math.max(r, g, b);
      const lo = Math.min(r, g, b);
      // The cloth: opaque, light and nearly grey (the art's warm whites).
      if ((data[i + 3] ?? 0) === 0 || v - lo > 20 || lo < 150) continue;
      const to = v >= 247 ? light : v >= 228 ? base : shade;
      data[i] = to[0];
      data[i + 1] = to[1];
      data[i + 2] = to[2];
    }
  }
  return { width: src.width, height: src.height, data };
}

function pixelsOf(image: PieceImage): TexturePixels | null {
  const c = canvasOf(image.width, image.height);
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}

function mastFromArt(image: PieceImage, side: BattleSide): NavalPiece | null {
  const src = pixelsOf(image);
  const canvas = canvasOf(image.width, image.height);
  const ctx = canvas.getContext("2d");
  if (!src || !ctx) return null;
  const out = ctx.createImageData(src.width, src.height);
  out.data.set(tintPennant(src, side).data);
  ctx.putImageData(out, 0, 0);
  return { kind: "mast", canvas, footBelow: 16, side };
}

function crateFromArt(image: PieceImage): NavalPiece | null {
  const canvas = canvasOf(image.width, image.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  return { kind: "crate", canvas, footBelow: 14 };
}

/** The reef art standing in a ring of code-drawn foam at its waterline. */
function reefFromArt(image: PieceImage): NavalPiece | null {
  const canvas = canvasOf(image.width + 8, image.height + 5);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const cx = canvas.width / 2;
  const line = canvas.height - 7;
  const rx = image.width / 2 + 3;
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = FOAM;
  ctx.beginPath();
  ctx.ellipse(cx, line, rx, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = SEA[1];
  ctx.beginPath();
  ctx.ellipse(cx, line, rx - 3, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(image, 4, canvas.height - 4 - image.height);
  // The front of the ring laps over the rocks' feet.
  ctx.strokeStyle = FOAM;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, line, rx - 3, 4, 0, 0.15, Math.PI - 0.15);
  ctx.stroke();
  return { kind: "reef", canvas, footBelow: 16 };
}

/**
 * The look with the registered art swapped in for the code drawers, piece
 * by piece: a key with no image keeps its drawing.
 */
export function dressNaval(art: NavalArt, images: NavalImages): NavalArt {
  if (typeof document === "undefined") return art;
  const pieces = new Map<number, NavalPiece>();
  for (const [index, piece] of art.pieces) {
    const list = images[NAVAL_PIECE_KEYS[piece.kind]];
    const image = list?.[Math.floor(hash(index, 31) * list.length)];
    let dressed: NavalPiece | null = null;
    if (image) {
      if (piece.kind === "mast")
        dressed = mastFromArt(image, piece.side ?? "attacker");
      else if (piece.kind === "crate") dressed = crateFromArt(image);
      else dressed = reefFromArt(image);
    }
    pieces.set(index, dressed ?? piece);
  }
  const deckImage = images[NAVAL_PIECE_KEYS.deck]?.[0];
  const deck = deckImage ? pixelsOf(deckImage) : null;
  const [east, west] = images[NAVAL_PIECE_KEYS.deckGun] ?? [];
  return {
    ...art,
    pieces,
    ...(deck ? { deck } : {}),
    ...(east && west ? { gunArt: { attacker: east, defender: west } } : {}),
  };
}

/** A wooden crate with a cross brace. */
function drawCrate(): HTMLCanvasElement {
  const c = canvasOf(28, 26);
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = "#2e1a0c";
  ctx.fillRect(1, 1, 26, 24);
  ctx.fillStyle = "#a8743e";
  ctx.fillRect(3, 3, 22, 20);
  ctx.fillStyle = "#c08a50";
  ctx.fillRect(3, 3, 22, 2);
  ctx.strokeStyle = "#5a3a1c";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(4, 4);
  ctx.lineTo(24, 22);
  ctx.moveTo(24, 4);
  ctx.lineTo(4, 22);
  ctx.stroke();
  ctx.fillStyle = "#5a3a1c";
  ctx.fillRect(3, 12, 22, 2);
  return c;
}

/** A low dark reef with a ring of foam. */
function drawReef(seed: number): HTMLCanvasElement {
  const c = canvasOf(48, 30);
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = FOAM;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.ellipse(24, 22, 22, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = SEA[1];
  ctx.beginPath();
  ctx.ellipse(24, 22, 18, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  const rocks: [number, number, number, number][] = [
    [10, 12, 12, 12],
    [20, 6, 14, 18],
    [31, 13, 9, 11],
  ];
  rocks.forEach(([x, y, w, h], i) => {
    const dx = Math.round((hash(seed, i, 1) - 0.5) * 4);
    ctx.fillStyle = "#2a2e34";
    ctx.fillRect(x + dx, y, w, h);
    ctx.fillStyle = "#4e5660";
    ctx.fillRect(x + dx + 1, y, w - 3, 3);
    ctx.fillStyle = "#3a4048";
    ctx.fillRect(x + dx + 1, y + 3, w - 2, 2);
  });
  return c;
}

/** A cannon on its carriage, its muzzle to the right (the enemy). */
function drawGun(): HTMLCanvasElement {
  const c = canvasOf(46, 30);
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  // Carriage and wheels.
  ctx.fillStyle = "#2e1a0c";
  ctx.fillRect(5, 15, 28, 9);
  ctx.fillStyle = "#6a4422";
  ctx.fillRect(6, 16, 26, 6);
  ctx.fillStyle = "#2e1a0c";
  ctx.fillRect(6, 21, 9, 9);
  ctx.fillRect(23, 21, 9, 9);
  ctx.fillStyle = "#9a6a40";
  ctx.fillRect(9, 24, 3, 3);
  ctx.fillRect(26, 24, 3, 3);
  // The barrel, banded, with a lit top.
  ctx.fillStyle = "#0e0f12";
  ctx.fillRect(2, 7, 38, 10);
  ctx.fillRect(38, 5, 6, 14);
  ctx.fillRect(0, 9, 3, 6);
  ctx.fillStyle = "#3e444c";
  ctx.fillRect(4, 8, 34, 3);
  ctx.fillStyle = "#6a727c";
  ctx.fillRect(6, 8, 20, 1);
  ctx.fillStyle = "#0e0f12";
  ctx.fillRect(14, 7, 2, 10);
  ctx.fillRect(28, 7, 2, 10);
  return c;
}

/**
 * The look of a sea layout from the battle's state, or null for a land
 * field or a beach landing. `guns` are the sides with a deck gun.
 */
export function navalArtFor(
  state: Pick<BattleState, "layout" | "ground" | "scheduled">,
  guns: readonly BattleSide[],
): NavalArt | null {
  const layout = state.layout;
  if (layout === undefined || !isSeaLayout(layout)) return null;
  const kinds = fieldHexKinds(layout, state.ground);
  const zones = fieldZones(layout);
  const pieces = new Map<number, NavalPiece>();
  if (typeof document !== "undefined") {
    for (const g of state.ground) {
      const i = hexIndex(g.hex);
      if (g.kind === "mast") {
        const side: BattleSide =
          zones !== null && g.hex.col <= zones.attackerTo
            ? "attacker"
            : "defender";
        pieces.set(i, {
          kind: "mast",
          canvas: drawMast(side),
          footBelow: 16,
          side,
        });
      } else if (g.kind === "rock" && g.look === "crate") {
        pieces.set(i, { kind: "crate", canvas: drawCrate(), footBelow: 12 });
      } else if (g.kind === "rock" && g.look === "reef") {
        pieces.set(i, { kind: "reef", canvas: drawReef(i), footBelow: 12 });
      }
    }
  }
  const sea: number[] = [];
  kinds.forEach((k, i) => {
    if (k === "sea" && !pieces.has(i)) sea.push(i);
  });
  return {
    layout,
    kinds,
    pieces,
    sea,
    guns: [...guns],
    gun: typeof document !== "undefined" && guns.length > 0 ? drawGun() : null,
  };
}

/** The sides with a deck gun scheduled (the gun's event is always queued). */
export function deckGunSides(
  state: Pick<BattleState, "scheduled">,
  effectId: string,
): BattleSide[] {
  const out: BattleSide[] = [];
  for (const e of state.scheduled)
    if (e.effect.id === effectId && !out.includes(e.side)) out.push(e.side);
  return out;
}

/**
 * Blocking hexes drawn as ordinary obstacles (trees and rocks): every
 * blocking feature but the sea, masts, crates and reefs, which the naval
 * art draws.
 */
export function drawnObstacles(state: {
  readonly ground: readonly GroundFeature[];
}): Hex[] {
  return state.ground
    .filter(
      (g) =>
        g.class === "blocking" &&
        g.kind !== "sea" &&
        g.kind !== "mast" &&
        g.look === undefined,
    )
    .map((g) => g.hex);
}

/** Where a piece is drawn: its foot `footBelow` under the hex centre. */
export function drawPiece(
  ctx: CanvasRenderingContext2D,
  piece: NavalPiece,
  index: number,
): void {
  const c = hexToStage({
    col: index % BATTLE_WIDTH,
    row: Math.floor(index / BATTLE_WIDTH),
  });
  ctx.drawImage(
    piece.canvas,
    Math.round(c.x - piece.canvas.width / 2),
    Math.round(c.y + piece.footBelow - piece.canvas.height),
  );
}

/**
 * The deck guns on each ship's rail above the field (row 0's top edge,
 * over column 1 for the attacker and 13 for the defender), muzzles toward
 * the enemy.
 */
export function drawDeckGuns(
  ctx: CanvasRenderingContext2D,
  naval: NavalArt,
): void {
  for (const side of naval.guns) {
    const gun = naval.gunArt?.[side] ?? naval.gun;
    if (!gun) continue;
    const h = side === "attacker" ? { col: 1, row: 0 } : { col: 13, row: 0 };
    const c = hexToStage(h);
    const y = Math.round(c.y - HEX_SIZE - gun.height + 6);
    const x = Math.round(c.x - gun.width / 2);
    if (naval.gunArt || side === "attacker") {
      ctx.drawImage(gun, x, y);
    } else {
      ctx.save();
      ctx.translate(x + gun.width, y);
      ctx.scale(-1, 1);
      ctx.drawImage(gun, 0, 0);
      ctx.restore();
    }
  }
}

/** The water's glints: a few hashed slots per sea hex, lit in turns. */
export function drawSeaGlints(
  ctx: CanvasRenderingContext2D,
  naval: NavalArt,
  now: number,
): void {
  const period = 1900;
  for (const i of naval.sea) {
    const c = hexToStage({
      col: i % BATTLE_WIDTH,
      row: Math.floor(i / BATTLE_WIDTH),
    });
    for (let k = 0; k < 3; k++) {
      const phase = hash(i, k, 11) * period;
      const t = now + phase;
      const cycle = Math.floor(t / period);
      if (hash(i, k, cycle) > 0.45) continue;
      const p = (t % period) / period;
      if (p > 0.36) continue;
      const x = Math.round(c.x + (hash(i, k, cycle + 1) - 0.5) * 34);
      const y = Math.round(c.y + (hash(i, k, cycle + 2) - 0.5) * 26);
      const bright = p > 0.12 && p < 0.24;
      ctx.fillStyle = bright
        ? "rgba(255,255,255,0.85)"
        : "rgba(226,243,255,0.5)";
      ctx.fillRect(x, y, 2, 1);
      if (bright) {
        ctx.fillRect(x - 2, y, 6, 1);
        ctx.fillRect(x + 1, y - 1, 1, 3);
      }
    }
  }
}

/** Whether a unit with feet at (x, y) stands on a sea hex. */
export function onSea(
  naval: NavalArt | null | undefined,
  x: number,
  y: number,
): boolean {
  if (!naval) return false;
  const h = stageToHex({ x, y: y - FEET_BELOW_CENTER });
  return h !== null && naval.kinds[hexIndex(h)] === "sea";
}

/** A repeating water tile for the stage's surroundings. */
export function waterTile(): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const c = canvasOf(64, 64);
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = SEA[1];
  ctx.fillRect(0, 0, 64, 64);
  return c;
}
