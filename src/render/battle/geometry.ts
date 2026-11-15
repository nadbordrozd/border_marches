/**
 * Battle screen geometry: where each hex of the 15 x 11 field sits on the
 * stage, and which hex a stage pixel falls in. Pure (no DOM), so the hit
 * testing is unit tested.
 *
 * Stage pixels are master pixels: sprites are drawn 1:1 at zoom 1 and the
 * whole stage is scaled by one zoom factor for the window.
 */

import {
  BATTLE_HEIGHT,
  BATTLE_WIDTH,
  hexCenter,
  inBounds,
} from "../../core/battle/index.ts";
import type { Hex } from "../../core/battle/index.ts";

/** Hex centre-to-corner radius in master pixels. */
export const HEX_SIZE = 32;
/** Hex width (flat side to flat side). */
export const HEX_W = Math.sqrt(3) * HEX_SIZE;
/** Vertical distance between row centres. */
export const ROW_H = 1.5 * HEX_SIZE;

/** Field extent: odd rows stick out half a hex on the right. */
export const FIELD_W = HEX_W * (BATTLE_WIDTH + 0.5);
export const FIELD_H = 2 * HEX_SIZE + ROW_H * (BATTLE_HEIGHT - 1);

/** Room above row 0 for the heads of the units standing in it. */
export const STAGE_TOP = 52;
/** Side margin around the field. */
export const STAGE_SIDE = 18;
export const STAGE_BOTTOM = 14;

export const FIELD_X = STAGE_SIDE;
export const FIELD_Y = STAGE_TOP;
export const STAGE_W = Math.ceil(FIELD_W + 2 * STAGE_SIDE);
export const STAGE_H = Math.ceil(FIELD_H + STAGE_TOP + STAGE_BOTTOM);

/**
 * How far below the hex centre a unit's feet touch the ground: the feet sit
 * in the lower part of the hex so the body fills it, as in Heroes II.
 */
export const FEET_BELOW_CENTER = 15;

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Stage pixel centre of a hex. */
export function hexToStage(h: Hex): Point {
  const c = hexCenter(h, HEX_SIZE);
  return { x: FIELD_X + c.x, y: FIELD_Y + c.y };
}

/** Where a unit standing on the hex touches the ground. */
export function feetPoint(h: Hex): Point {
  const c = hexToStage(h);
  return { x: c.x, y: c.y + FEET_BELOW_CENTER };
}

/** The six corners of a hex, clockwise from the top, in stage pixels. */
export function hexCorners(h: Hex, inset = 0): Point[] {
  const c = hexToStage(h);
  const r = HEX_SIZE - inset;
  const out: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    out.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  }
  return out;
}

/**
 * The hex under a stage pixel, or null outside the field. Exact hex
 * rounding (cube coordinates), so every pixel belongs to its nearest centre.
 */
export function stageToHex(p: Point): Hex | null {
  // Relative to the centre of hex (0, 0).
  const px = p.x - FIELD_X - HEX_W / 2;
  const py = p.y - FIELD_Y - HEX_SIZE;
  const q = ((Math.sqrt(3) / 3) * px - py / 3) / HEX_SIZE;
  const r = ((2 / 3) * py) / HEX_SIZE;
  const [cx, , cz] = cubeRound(q, -q - r, r);
  const row = cz;
  const col = cx + (row - (row & 1)) / 2;
  const h = { col, row };
  return inBounds(h) ? h : null;
}

function cubeRound(x: number, y: number, z: number): [number, number, number] {
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  // Avoid -0 in the results.
  return [rx + 0, ry + 0, rz + 0];
}

/**
 * The largest zoom (CSS pixels per stage pixel) that fits the stage in the
 * box. When at least 1 fits, zoom x devicePixelRatio is a whole number so
 * every master pixel is a crisp block of device pixels; a box too small for
 * zoom 1 gets the fractional fit.
 */
export function fitZoom(boxW: number, boxH: number, dpr = 1): number {
  const fit = Math.min(boxW / STAGE_W, boxH / STAGE_H);
  if (fit >= 1) return Math.max(1, Math.floor(fit * dpr) / dpr);
  return Math.max(0.25, fit);
}
