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
import { HERO_ASSETS, UNIT_ASSETS } from "../../assets/manifest.ts";
import { UNIT_OPAQUE_TOP } from "../../assets/unit-tops.ts";

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
 * How far the tallest sprite's paint rises above the top of the hex it
 * stands on (feet FEET_BELOW_CENTER below the centre, hex top HEX_SIZE
 * above), from each sprite's measured contact row and first opaque row. A
 * sprite missing from UNIT_OPAQUE_TOP counts from its canvas top.
 */
export const MAX_SPRITE_RISE = Math.max(
  0,
  ...[...UNIT_ASSETS, ...HERO_ASSETS].map(
    (a) =>
      a.feet.contactY -
      (UNIT_OPAQUE_TOP[a.key] ?? 0) -
      FEET_BELOW_CENTER -
      HEX_SIZE,
  ),
);

/**
 * What must stay in view when the window is tight (bead UI2-02): the whole
 * field, a little side margin, and head room for the tallest sprite standing
 * in row 0, so no head is ever cut. The rest of the stage margin may fall
 * outside the view.
 */
export const VIEW_TOP_MIN = MAX_SPRITE_RISE;
export const VIEW_SIDE_MIN = 8;
/** The extent fitZoom fits: the field plus the margins above. */
export const VIEW_CORE_W = FIELD_W + 2 * VIEW_SIDE_MIN;
export const VIEW_CORE_H = FIELD_H + VIEW_TOP_MIN;

/** Zoom steps above 1: quarter CSS pixels (1.25, 1.5, ...). */
const ZOOM_STEP = 0.25;

/**
 * The largest zoom (CSS pixels per stage pixel) that fits the field and its
 * head room (VIEW_CORE_W x VIEW_CORE_H) in the box. At 1 and above it is a
 * quarter step (1, 1.25, 1.5, ...) or a whole number of device pixels per
 * stage pixel, whichever is larger, and the canvas draws without smoothing,
 * so sprites stay crisp blocks; a box too small for zoom 1 gets the
 * fractional fit.
 */
export function fitZoom(boxW: number, boxH: number, dpr = 1): number {
  const fit = Math.min(boxW / VIEW_CORE_W, boxH / VIEW_CORE_H);
  if (fit < 1) return Math.max(0.25, fit);
  const quarter = Math.floor(fit / ZOOM_STEP) * ZOOM_STEP;
  const whole = Math.floor(fit * dpr) / dpr;
  return Math.max(1, quarter, whole);
}

/**
 * Where the stage sits in a view box: the zoom and the CSS pixel position of
 * stage (0, 0). The field is centred across; down, the full stage is centred
 * when its margins fit, otherwise the head room above row 0 gets what there
 * is (at least VIEW_TOP_MIN) and the bottom margin goes first. Offsets are
 * whole device pixels so the zoomed pixel grid stays even.
 */
export interface StageView {
  readonly zoom: number;
  readonly x: number;
  readonly y: number;
}

export function stageView(boxW: number, boxH: number, dpr = 1): StageView {
  const zoom = fitZoom(boxW, boxH, dpr);
  const snap = (v: number): number => Math.round(v * dpr) / dpr;
  const x = (boxW - STAGE_W * zoom) / 2;
  const head = Math.max(STAGE_TOP, VIEW_TOP_MIN) * zoom;
  const extra = boxH - FIELD_H * zoom;
  const margins = head + STAGE_BOTTOM * zoom;
  const fieldTop =
    extra >= margins ? head + (extra - margins) / 2 : Math.min(head, extra);
  // Down, round toward the bottom so the head room is never short.
  const y = Math.ceil((fieldTop - FIELD_Y * zoom) * dpr - 1e-9) / dpr;
  return { zoom, x: snap(x), y };
}

/** A view point (CSS pixels in the view box) on the stage. */
export function viewToStage(p: Point, v: StageView): Point {
  return { x: (p.x - v.x) / v.zoom, y: (p.y - v.y) / v.zoom };
}

/** A stage point in view CSS pixels. */
export function stageToView(p: Point, v: StageView): Point {
  return { x: v.x + p.x * v.zoom, y: v.y + p.y * v.zoom };
}
