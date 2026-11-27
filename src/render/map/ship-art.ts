/**
 * Ships on the adventure map (docs/design/NAVAL.md 10.1, beads bzc.149 and
 * bzc.158).
 *
 * The ship art (SHIP_ART in src/assets/map-objects.ts): a sailing ship
 * (a hero aboard), a moored one (sail furled) and the pirate ship. Their
 * sail and pennant are recoloured in code: pixels of exactly the art's
 * `ownerKey` colours at x >= `minX` go onto a ramp of the owner's colour
 * (neutral grey for an unowned boat); the pirate keeps its own colours.
 * The art's little captain stands in for the hero aboard, so the hero is
 * not drawn (10.1).
 *
 * Until the art is loaded (a missing image) a code-drawn placeholder of
 * the same size is drawn instead, with the hero on its deck: the ship
 * behind it and the hull's front over its legs.
 */
import { CELL_PX } from "../../assets/manifest";
import type { ShipArt, ShipLook } from "../../assets/map-objects";
import { context2d, createSurface, type Surface } from "./assets";
import type { PixelImage } from "./ground";
import { clothRamp } from "./owner-flag";
import { LAYER, sceneEntry, type SceneEntry } from "./scene";

/** The placeholder's size (the art's canvas, NAVAL 10.2). */
export const SHIP_W = 96;
export const SHIP_H = 88;
/** The placeholder's foot: bottom centre of its waterline. */
const PLACEHOLDER_FOOT = { x: 48, y: 72 } as const;
/** How far above the cell's bottom edge a ship's waterline sits. */
export const SHIP_SEAT_PX = 16;
/** The placeholder's deck row: a hero aboard stands here. */
const DECK = 54;
/** The placeholder's hull bottom: a hero aboard is cut off above it. */
const KEEL = 68;
/** A hero aboard the placeholder is drawn at this scale. */
const HERO_ON_DECK_SCALE = 0.78;
/** The sail of a neutral boat (RULES_V2 5.10: grey for nobody's). */
export const NEUTRAL_SAIL = "#9b9ea6";

/** The look of a ship: sailing with a hero aboard, else moored. */
export function shipLook(aboard: boolean): ShipLook {
  return aboard ? "sailing" : "moored";
}

/** What the map draws for one ship. */
export interface ShipSprite {
  /** The image key (a tinted art copy, or the placeholder). */
  readonly key: string;
  readonly w: number;
  readonly h: number;
  /** The pixel on the waterline under the cell centre. */
  readonly foot: { readonly x: number; readonly y: number };
  /** The placeholder's hull front over a hero aboard; null for the art. */
  readonly front: string | null;
  /** The hero aboard is drawn on the deck (placeholder) or hidden (art). */
  readonly heroOnDeck: boolean;
}

// ------------------------------------------------------------ recolour

function hexKey(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function luma(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    ((n >> 16) & 0xff) * 0.3 + ((n >> 8) & 0xff) * 0.59 + (n & 0xff) * 0.11
  );
}

/**
 * A copy of a ship sprite with its owner-key pixels (exact colours, at x
 * >= minX) recoloured onto the owner colour's ramp: the brightest key
 * colour becomes the highlight, the darkest the fold shadow, the rest in
 * between. Without a key (the pirate) the copy is unchanged. Pure.
 */
export function recolourShip(
  src: PixelImage,
  ownerKey: ShipArt["ownerKey"],
  hex: string,
): PixelImage {
  const data = new Uint8ClampedArray(src.data);
  if (ownerKey === null) return { width: src.width, height: src.height, data };
  const { shade, base, light } = clothRamp(hex);
  const lumas = ownerKey.colours.map(luma);
  const lo = Math.min(...lumas);
  const hi = Math.max(...lumas);
  const target = new Map<string, readonly number[]>();
  ownerKey.colours.forEach((c, i) => {
    const t = hi === lo ? 0.5 : ((lumas[i] ?? lo) - lo) / (hi - lo);
    const [a, b, k] = t < 0.5 ? [shade, base, t * 2] : [base, light, t * 2 - 1];
    target.set(
      c.toLowerCase(),
      [0, 1, 2].map((j) =>
        Math.round((a[j] ?? 0) + ((b[j] ?? 0) - (a[j] ?? 0)) * k),
      ),
    );
  });
  for (let y = 0; y < src.height; y++) {
    for (let x = ownerKey.minX; x < src.width; x++) {
      const i = (y * src.width + x) * 4;
      if ((data[i + 3] ?? 0) === 0) continue;
      const to = target.get(
        hexKey(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0),
      );
      if (to === undefined) continue;
      data[i] = to[0] ?? 0;
      data[i + 1] = to[1] ?? 0;
      data[i + 2] = to[2] ?? 0;
    }
  }
  return { width: src.width, height: src.height, data };
}

/** The key of a ship art copy tinted to a colour (null: neutral). */
export function tintedShipKey(look: ShipLook, colour: string | null): string {
  return `code:ship-${look}-${colour ?? "neutral"}`;
}

/** The ship art tinted to `colour` (null: neutral grey) as a surface. */
export function tintedShip(
  image: CanvasImageSource,
  art: ShipArt,
  colour: string | null,
): Surface {
  const { w, h } = art.asset;
  const read = createSurface(w, h);
  const ctx = context2d(read);
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, w, h);
  const tinted = recolourShip(
    { width: w, height: h, data: pixels.data },
    art.ownerKey,
    colour ?? NEUTRAL_SAIL,
  );
  const out = createSurface(w, h);
  context2d(out).putImageData(
    new ImageData(new Uint8ClampedArray(tinted.data), w, h),
    0,
    0,
  );
  return out;
}

/** The sprite of a ship drawn from its art. */
export function artSprite(art: ShipArt, key: string): ShipSprite {
  return {
    key,
    w: art.asset.w,
    h: art.asset.h,
    foot: art.foot,
    front: null,
    heroOnDeck: false,
  };
}

// ------------------------------------------------------------ placeholder

export interface PlaceholderShip {
  readonly key: string;
  readonly surface: Surface;
  readonly frontKey: string;
  readonly front: Surface;
}

const OUTLINE = "#1b120a";
const NEUTRAL_PENNANT = "#8d8f96";

/** `hex` mixed toward white by `k` (0..1). */
function tint(hex: string, k: number): string {
  const n = Number.parseInt(hex.replace("#", "").slice(0, 6), 16);
  if (!Number.isFinite(n)) return "#d9d6cc";
  const ch = (shift: number): number => {
    const v = (n >> shift) & 0xff;
    return Math.round(v + (255 - v) * k);
  };
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function hullPath(ctx: Ctx): void {
  ctx.beginPath();
  ctx.moveTo(10, 50);
  ctx.quadraticCurveTo(48, 56, 88, 47);
  ctx.quadraticCurveTo(84, 66, 72, 73);
  ctx.lineTo(26, 73);
  ctx.quadraticCurveTo(13, 66, 10, 50);
  ctx.closePath();
}

/** The hull's outside: what stands in front of a hero aboard. */
function drawHull(ctx: Ctx): void {
  ctx.lineJoin = "round";
  hullPath(ctx);
  ctx.fillStyle = "#9a6331";
  ctx.fill();
  ctx.save();
  hullPath(ctx);
  ctx.clip();
  ctx.fillStyle = "#c48a4a";
  ctx.fillRect(0, 58, SHIP_W, 5);
  ctx.fillStyle = "#6e4320";
  ctx.fillRect(0, 68, SHIP_W, 8);
  ctx.restore();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 3;
  hullPath(ctx);
  ctx.stroke();
  for (const x of [34, 58]) {
    ctx.beginPath();
    ctx.arc(x, 64, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = "#f6e7b0";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawWater(ctx: Ctx): void {
  ctx.strokeStyle = "rgba(235, 250, 255, 0.75)";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (const [x0, x1, y] of [
    [6, 24, 76],
    [70, 90, 77],
    [30, 64, 80],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.quadraticCurveTo((x0 + x1) / 2, y - 3, x1, y);
    ctx.stroke();
  }
}

function drawShip(ctx: Ctx, sailing: boolean, colour: string | null): void {
  const sail = colour === null ? "#d9d6cc" : tint(colour, 0.45);
  const pennant = colour ?? NEUTRAL_PENNANT;
  drawWater(ctx);
  ctx.beginPath();
  ctx.ellipse(49, 51, 37, 5, -0.05, 0, Math.PI * 2);
  ctx.fillStyle = "#6b4422";
  ctx.fill();
  ctx.fillStyle = "#5c3a1c";
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2;
  ctx.fillRect(46, 6, 5, 48);
  ctx.strokeRect(46, 6, 5, 48);
  ctx.beginPath();
  ctx.moveTo(51, 6);
  ctx.lineTo(sailing ? 68 : 62, sailing ? 9 : 12);
  ctx.lineTo(51, 13);
  ctx.closePath();
  ctx.fillStyle = pennant;
  ctx.fill();
  ctx.stroke();
  ctx.lineJoin = "round";
  if (sailing) {
    ctx.beginPath();
    ctx.moveTo(52, 14);
    ctx.quadraticCurveTo(86, 22, 80, 46);
    ctx.lineTo(52, 46);
    ctx.closePath();
    ctx.fillStyle = sail;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(45, 18);
    ctx.quadraticCurveTo(22, 30, 18, 46);
    ctx.lineTo(45, 46);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(53, 30);
    ctx.quadraticCurveTo(72, 30, 80, 32);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.roundRect(26, 38, 46, 9, 4.5);
    ctx.fillStyle = sail;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.lineWidth = 1.5;
    for (const x of [36, 48, 60]) {
      ctx.beginPath();
      ctx.moveTo(x, 38);
      ctx.lineTo(x + 2, 47);
      ctx.stroke();
    }
    ctx.strokeStyle = "#3a2a1a";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(86, 50);
    ctx.quadraticCurveTo(93, 62, 91, 79);
    ctx.stroke();
  }
  drawHull(ctx);
}

const cache = new Map<string, PlaceholderShip>();

/** The code-drawn fallback ship for a colour (null: neutral), cached. */
export function placeholderShip(
  sailing: boolean,
  colour: string | null,
): PlaceholderShip {
  const key = `code:ship-placeholder-${sailing ? "sailing" : "moored"}-${colour ?? "neutral"}`;
  const found = cache.get(key);
  if (found !== undefined) return found;
  const surface = createSurface(SHIP_W, SHIP_H);
  drawShip(context2d(surface), sailing, colour);
  const front = createSurface(SHIP_W, SHIP_H);
  drawHull(context2d(front));
  const made = { key, surface, frontKey: "code:ship-hull-front", front };
  cache.set(key, made);
  return made;
}

/** The sprite of the placeholder. */
export function placeholderSprite(drawn: PlaceholderShip): ShipSprite {
  return {
    key: drawn.key,
    w: SHIP_W,
    h: SHIP_H,
    foot: PLACEHOLDER_FOOT,
    front: drawn.frontKey,
    heroOnDeck: true,
  };
}

// ------------------------------------------------------------ the scene

/** The world point of a ship's waterline under cell (x, y)'s centre. */
export function shipFoot(x: number, y: number): { x: number; y: number } {
  return {
    x: x * CELL_PX + CELL_PX / 2,
    y: (y + 1) * CELL_PX - SHIP_SEAT_PX,
  };
}

/**
 * The scene entries of a ship on (x, y): the ship just under the units of
 * its cell and, for the placeholder with a hero aboard, the hull's front
 * just over them. Both move with the hero's walk (objectId).
 */
export function shipEntries(
  art: ShipSprite,
  x: number,
  y: number,
  heroId?: string,
): SceneEntry[] {
  const foot = shipFoot(x, y);
  const left = Math.round(foot.x - art.foot.x);
  const top = Math.round(foot.y - art.foot.y);
  const op = (key: string) => ({
    key,
    sx: 0,
    sy: 0,
    sw: art.w,
    sh: art.h,
    dx: left,
    dy: top,
  });
  const extra: Partial<Pick<SceneEntry, "cells" | "objectId">> = {
    cells: [[x, y]],
    ...(heroId === undefined ? {} : { objectId: heroId }),
  };
  const out = [
    sceneEntry("FOREGROUND", y, x, LAYER.UNIT - 0.4, [op(art.key)], [], extra),
  ];
  if (heroId !== undefined && art.front !== null) {
    out.push(
      sceneEntry(
        "FOREGROUND",
        y,
        x,
        LAYER.UNIT + 0.4,
        [op(art.front)],
        [],
        extra,
      ),
    );
  }
  return out;
}

/**
 * A hero's entry moved onto the placeholder's deck on its cell: a little
 * smaller, its feet on the deck line, cut off above the keel, no ground
 * shadow on the water.
 */
export function onDeck(e: SceneEntry): SceneEntry {
  const cx = e.col * CELL_PX + CELL_PX / 2;
  const cy = e.row * CELL_PX + CELL_PX / 2;
  const top = shipFoot(e.col, e.row).y - PLACEHOLDER_FOOT.y;
  const feet = top + DECK;
  const keel = top + KEEL;
  const k = HERO_ON_DECK_SCALE;
  const sprites = e.sprites.map((s) => {
    const dy = feet + (s.dy - cy) * k;
    const dh = Math.min((s.dh ?? s.sh) * k, Math.max(0, keel - dy));
    const scaleY = (s.dh ?? s.sh) / s.sh;
    return {
      ...s,
      sh: dh / (k * scaleY),
      dx: cx + (s.dx - cx) * k,
      dy,
      dw: (s.dw ?? s.sw) * k,
      dh,
    };
  });
  return sceneEntry(e.pass, e.row, e.col, e.layer, sprites, [], {
    ...(e.cells === undefined ? {} : { cells: e.cells }),
    ...(e.objectId === undefined ? {} : { objectId: e.objectId }),
  });
}
