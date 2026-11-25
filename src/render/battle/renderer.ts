/**
 * Draws a battle {@link Scene} on a 2D canvas: the terrain's textured ground
 * with faint hex outlines (Heroes II style), the hover and turn overlays,
 * obstacles and units back to front, count chips, and the effects.
 *
 * Sprites are drawn 1:1 in stage pixels (never resampled or mirrored; the
 * stage is scaled as a whole by the zoom). Both sides face south-east until
 * west-facing art exists (ART_DIRECTION.md section 7).
 */

import {
  BATTLE_HEX_COUNT,
  hexFromIndex,
  hexIndex,
} from "../../core/battle/index.ts";
import type { Hex } from "../../core/battle/index.ts";
import type { BattleArt } from "./assets.ts";
import {
  HEX_SIZE,
  STAGE_H,
  STAGE_W,
  feetPoint,
  hexCorners,
  hexToStage,
  stageToHex,
} from "./geometry.ts";
import type { HexMark, Scene, UnitView } from "./scene.ts";

export const SIDE_COLORS = {
  attacker: { chip: "#24477e", edge: "#9cc3ff" },
  defender: { chip: "#7e2424", edge: "#ffb09c" },
} as const;

const NUMBER_FONT = "bold 12px Verdana, Geneva, sans-serif";
const PIP_FONT = "bold 8px Verdana, Geneva, sans-serif";

function hexPath(ctx: CanvasRenderingContext2D, h: Hex, inset = 0): void {
  const pts = hexCorners(h, inset);
  ctx.beginPath();
  pts.forEach((p, i) =>
    i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y),
  );
  ctx.closePath();
}

/** Ground and grid, drawn once per battle at stage resolution. */
export function paintBackground(art: BattleArt): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = STAGE_W;
  c.height = STAGE_H;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.imageSmoothingEnabled = false;
  const pattern = ctx.createPattern(art.ground, "repeat");
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  }
  ctx.strokeStyle = "rgba(24, 32, 12, 0.26)";
  ctx.lineWidth = 1;
  for (let i = 0; i < BATTLE_HEX_COUNT; i++) {
    hexPath(ctx, hexFromIndex(i), 0.5);
    ctx.stroke();
  }
  return c;
}

const silhouettes = new Map<HTMLImageElement, HTMLCanvasElement>();

/** A white copy of a sprite's opaque pixels, for the hit flash. */
function silhouette(img: HTMLImageElement): HTMLCanvasElement {
  let s = silhouettes.get(img);
  if (!s) {
    s = document.createElement("canvas");
    s.width = img.width;
    s.height = img.height;
    const ctx = s.getContext("2d");
    if (ctx) {
      ctx.drawImage(img, 0, 0);
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = "#ff3b2a";
      ctx.fillRect(0, 0, s.width, s.height);
    }
    silhouettes.set(img, s);
  }
  return s;
}

const MARK_STYLE: Readonly<
  Record<HexMark, { fill: string | null; stroke: string | null; width: number }>
> = {
  reachable: { fill: "rgba(10, 18, 0, 0.17)", stroke: null, width: 0 },
  path: { fill: "rgba(255, 246, 200, 0.16)", stroke: null, width: 0 },
  "move-target": {
    fill: "rgba(255, 246, 200, 0.28)",
    stroke: "#fff6c8",
    width: 2,
  },
  "attack-from": {
    fill: "rgba(255, 214, 92, 0.30)",
    stroke: "#ffd65c",
    width: 2,
  },
  target: { fill: "rgba(230, 40, 24, 0.24)", stroke: "#ff4b33", width: 2.5 },
  "target-blocked": {
    fill: "rgba(40, 40, 40, 0.22)",
    stroke: "rgba(240, 240, 240, 0.6)",
    width: 1.5,
  },
  inspect: { fill: null, stroke: "rgba(255, 255, 255, 0.75)", width: 1.5 },
  "act-valid": {
    fill: "rgba(96, 214, 200, 0.16)",
    stroke: "rgba(120, 232, 216, 0.7)",
    width: 1.5,
  },
  "act-hover": {
    fill: "rgba(96, 214, 200, 0.34)",
    stroke: "#8ff5e6",
    width: 3,
  },
  chosen: { fill: "rgba(255, 214, 92, 0.30)", stroke: "#ffd65c", width: 3 },
  after: { fill: "rgba(140, 230, 110, 0.2)", stroke: null, width: 0 },
  swap: { fill: "rgba(96, 214, 200, 0.3)", stroke: "#8ff5e6", width: 2.5 },
};

/** Teal of swaps and act targets. */
const TEAL = "#8ff5e6";

function drawMarks(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { overlay } = scene;
  // Reachable shading first, then everything else over it.
  for (const pass of [true, false]) {
    for (const [i, mark] of overlay.marks) {
      if ((mark === "reachable") !== pass) continue;
      const st = MARK_STYLE[mark];
      const h = hexFromIndex(i);
      if (st.fill) {
        hexPath(ctx, h, 1);
        ctx.fillStyle = st.fill;
        ctx.fill();
      }
      if (st.stroke) {
        hexPath(ctx, h, 1 + st.width / 2);
        ctx.strokeStyle = st.stroke;
        ctx.lineWidth = st.width;
        ctx.stroke();
      }
      if (mark === "path") {
        const c = hexToStage(h);
        ctx.fillStyle = "#fff6c8";
        ctx.strokeStyle = "#2a2412";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(c.x, c.y + 4, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  if (overlay.active) {
    hexPath(ctx, overlay.active, 1);
    ctx.fillStyle = "rgba(255, 214, 92, 0.24)";
    ctx.fill();
    hexPath(ctx, overlay.active, 2);
    ctx.strokeStyle = "#ffd65c";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/**
 * An area as one outline: every hex edge whose neighbour across is not in
 * the area, dashed orange over a light wash.
 */
function drawArea(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const area = scene.overlay.area;
  if (!area || area.length === 0) return;
  const inside = new Set(area.map(hexIndex));
  ctx.save();
  for (const h of area) {
    hexPath(ctx, h, 0.5);
    ctx.fillStyle = "rgba(255, 150, 60, 0.16)";
    ctx.fill();
  }
  ctx.beginPath();
  for (const h of area) {
    const c = hexToStage(h);
    const pts = hexCorners(h, 1);
    for (let i = 0; i < 6; i++) {
      const a = pts[i] as { x: number; y: number };
      const b = pts[(i + 1) % 6] as { x: number; y: number };
      // The neighbour across this edge: the centre mirrored through it.
      const across = stageToHex({
        x: c.x + (a.x + b.x - 2 * c.x),
        y: c.y + (a.y + b.y - 2 * c.y),
      });
      if (across !== null && inside.has(hexIndex(across))) continue;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
  }
  ctx.lineCap = "round";
  ctx.strokeStyle = "#1a1208";
  ctx.lineWidth = 4.5;
  ctx.stroke();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = "#ffa04a";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
}

/** A round badge with a glyph (swap partners) above a unit's head. */
function drawSwapBadges(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const swaps = scene.overlay.swaps;
  if (!swaps || swaps.length === 0) return;
  for (const h of swaps) {
    const f = feetPoint(h);
    const x = f.x + 16;
    const y = f.y - 54;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 8.5, 0, Math.PI * 2);
    ctx.fillStyle = "#123a36";
    ctx.fill();
    ctx.strokeStyle = TEAL;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Two arrows: the swap glyph.
    ctx.strokeStyle = TEAL;
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - 4.5, y - 2);
    ctx.lineTo(x + 4.5, y - 2);
    ctx.lineTo(x + 2, y - 4.5);
    ctx.moveTo(x + 4.5, y + 2);
    ctx.lineTo(x - 4.5, y + 2);
    ctx.lineTo(x - 2, y + 4.5);
    ctx.stroke();
    ctx.restore();
  }
}

/** Chosen-target order numbers, at the top of each hex. */
function drawLabels(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const labels = scene.overlay.labels;
  if (!labels || labels.length === 0) return;
  ctx.save();
  ctx.font = "bold 11px Verdana, Geneva, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const l of labels) {
    const c = hexToStage(l.hex);
    const x = c.x - 20;
    const y = c.y - 4;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fillStyle = "#ffd65c";
    ctx.fill();
    ctx.strokeStyle = "#1a1208";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#1a1208";
    ctx.fillText(l.text, x, y + 0.5);
  }
  ctx.restore();
}

/** The attack arrow from the attack hex into the target. */
function drawStrikeArrow(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const s = scene.overlay.strike;
  if (!s) return;
  const a = hexToStage(s.from);
  const b = hexToStage(s.target);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Arrow across the shared edge.
  const x0 = a.x + ux * (len * 0.12);
  const y0 = a.y + uy * (len * 0.12);
  const x1 = a.x + ux * (len * 0.7);
  const y1 = a.y + uy * (len * 0.7);
  const hw = 9;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x0 - uy * 3.5, y0 + ux * 3.5);
  ctx.lineTo(x1 - ux * 12 - uy * 3.5, y1 - uy * 12 + ux * 3.5);
  ctx.lineTo(x1 - ux * 12 - uy * hw, y1 - uy * 12 + ux * hw);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x1 - ux * 12 + uy * hw, y1 - uy * 12 - ux * hw);
  ctx.lineTo(x1 - ux * 12 + uy * 3.5, y1 - uy * 12 - ux * 3.5);
  ctx.lineTo(x0 + uy * 3.5, y0 - ux * 3.5);
  ctx.closePath();
  ctx.fillStyle = "#ffd65c";
  ctx.strokeStyle = "#1a1208";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

type Drawable =
  | { kind: "unit"; y: number; unit: UnitView }
  | { kind: "obstacle"; y: number; index: number };

function drawUnit(
  ctx: CanvasRenderingContext2D,
  art: BattleArt,
  u: UnitView,
): void {
  const entry = art.units.get(u.creatureId);
  ctx.globalAlpha = u.alpha;
  if (!entry) {
    ctx.fillStyle = SIDE_COLORS[u.side].chip;
    ctx.fillRect(Math.round(u.x - 14), Math.round(u.y - 40), 28, 40);
    ctx.globalAlpha = 1;
    return;
  }
  const { img, asset } = entry;
  const f = asset.feet;
  const footW = f.footRight - f.footLeft;
  // Contact shadow: a flat ellipse under the feet (no blur).
  ctx.fillStyle = "rgba(16, 20, 8, 0.28)";
  ctx.beginPath();
  ctx.ellipse(u.x, u.y - 1, footW / 2 + 4, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  const left = Math.round(u.x - (f.footLeft + f.footRight) / 2);
  const top = Math.round(u.y - f.contactY);
  ctx.drawImage(img, left, top);
  if (u.flash > 0) {
    ctx.globalAlpha = u.alpha * Math.min(1, u.flash) * 0.7;
    ctx.drawImage(silhouette(img), left, top);
  }
  ctx.globalAlpha = 1;
}

function drawObstacle(
  ctx: CanvasRenderingContext2D,
  art: BattleArt,
  index: number,
): void {
  const entry = art.obstacles.get(index);
  if (!entry) return;
  const c = hexToStage(hexFromIndex(index));
  const { img, art: ob } = entry;
  if (ob.kind === "rock") {
    // An 80 px cell footprint with 24 px of rock above: seat the footprint
    // on the hex so the ragged foot sits in its lower half.
    ctx.drawImage(
      img,
      Math.round(c.x - img.width / 2),
      Math.round(c.y + 30 - img.height),
    );
  } else {
    ctx.drawImage(
      img,
      Math.round(c.x - img.width / 2),
      Math.round(c.y + 24 - img.height),
    );
  }
}

/** The stack count chip under a unit: it carries news, so it is always on top. */
function drawChip(
  ctx: CanvasRenderingContext2D,
  u: UnitView,
  active: boolean,
): void {
  const text = String(u.count);
  ctx.font = NUMBER_FONT;
  const w = Math.max(20, Math.ceil(ctx.measureText(text).width) + 10);
  const h = 15;
  const x = Math.round(u.x + 4);
  const y = Math.round(u.y + 2);
  ctx.globalAlpha = u.alpha;
  ctx.fillStyle = SIDE_COLORS[u.side].chip;
  ctx.strokeStyle = active ? "#ffd65c" : "#0d0b08";
  ctx.lineWidth = active ? 2 : 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + w / 2, y + h / 2 + 0.5);
  // Pips left of the chip: blue Defend, then one per condition in the
  // school's colour with a placeholder glyph (banes ringed dark red).
  let px = x - 8;
  const pip = (color: string, glyph: string, ring: string): void => {
    ctx.fillStyle = color;
    ctx.strokeStyle = ring;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, y + h / 2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (glyph !== "") {
      ctx.fillStyle = "#0d0b08";
      ctx.font = PIP_FONT;
      ctx.fillText(glyph, px, y + h / 2 + 0.5);
    }
    px -= 13;
  };
  if (u.defending) pip("#5aa8ff", "", "#0d0b08");
  for (const p of u.pips) pip(p.color, p.glyph, p.bane ? "#5a0a0a" : "#0d0b08");
  ctx.globalAlpha = 1;
}

/** Tinted hexes for non-blocking ground (hazards, surfaces, remains). */
function drawGround(ctx: CanvasRenderingContext2D, scene: Scene): void {
  for (const g of scene.ground) {
    hexPath(ctx, g.hex, 3);
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = g.color;
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = g.color;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    const c = hexToStage(g.hex);
    ctx.globalAlpha = 0.85;
    ctx.font = "bold 11px Verdana, Geneva, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#1a1208";
    ctx.fillText(g.glyph, c.x - 16, c.y - 12);
    ctx.globalAlpha = 1;
  }
}

/** Links as dashed lines in the school's colour, near end to far end. */
function drawLinks(ctx: CanvasRenderingContext2D, scene: Scene): void {
  for (const l of scene.links) {
    const a = scene.units.get(l.near);
    const b = scene.units.get(l.far);
    if (!a || !b || !a.visible || !b.visible) continue;
    const ay = a.y - 24;
    const by = b.y - 24;
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0d0b08";
    ctx.lineWidth = 5;
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    ctx.moveTo(a.x, ay);
    ctx.lineTo(b.x, by);
    ctx.stroke();
    ctx.strokeStyle = l.color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.setLineDash([]);
    // A ring at the near end (the bearer).
    ctx.beginPath();
    ctx.arc(a.x, ay, 5, 0, Math.PI * 2);
    ctx.fillStyle = l.color;
    ctx.fill();
    ctx.strokeStyle = "#0d0b08";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}

/** Enemy intent badges above stacks, with a thin line to the target. */
function drawIntents(ctx: CanvasRenderingContext2D, scene: Scene): void {
  ctx.font = "bold 10px Verdana, Geneva, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const it of scene.intents) {
    const u = scene.units.get(it.stackId);
    if (!u || !u.visible) continue;
    const t = it.target ? scene.units.get(it.target) : undefined;
    if (t && t.visible) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 120, 90, 0.75)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(u.x, u.y - 62);
      ctx.lineTo(t.x, t.y - 40);
      ctx.stroke();
      ctx.restore();
    }
    const w = Math.ceil(ctx.measureText(it.text).width) + 10;
    const x = Math.round(u.x - w / 2);
    const y = Math.round(u.y - 74);
    ctx.fillStyle = "rgba(40, 12, 10, 0.86)";
    ctx.strokeStyle = "#ff8a6a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, 14, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffe0d6";
    ctx.fillText(it.text, x + w / 2, y + 7.5);
  }
}

function drawEffects(ctx: CanvasRenderingContext2D, scene: Scene): void {
  for (const p of scene.poofs) {
    const t = (scene.now - p.t0) / p.life;
    if (t < 0 || t > 1) continue;
    ctx.globalAlpha = 1 - t;
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI * 2 * k) / 6 + 0.4;
      const r = 6 + t * 22;
      ctx.fillStyle = k % 2 === 0 ? "#f2eee4" : "#c9c2b2";
      ctx.strokeStyle = "#2a2620";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(
        p.x + Math.cos(a) * r,
        p.y - 18 + Math.sin(a) * r * 0.7,
        7 - t * 4,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  for (const pr of scene.projectiles) {
    const x = pr.from.x + (pr.to.x - pr.from.x) * pr.t;
    const lift = Math.sin(Math.PI * pr.t) * 26;
    const y = pr.from.y + (pr.to.y - pr.from.y) * pr.t - lift;
    for (let k = 2; k >= 0; k--) {
      const back = k * 0.035;
      const tx = pr.from.x + (pr.to.x - pr.from.x) * Math.max(0, pr.t - back);
      const ty =
        pr.from.y +
        (pr.to.y - pr.from.y) * Math.max(0, pr.t - back) -
        Math.sin(Math.PI * Math.max(0, pr.t - back)) * 26;
      ctx.fillStyle = pr.color;
      ctx.strokeStyle = "#0d0b08";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(k === 0 ? x : tx, k === 0 ? y : ty, 5 - k * 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const t of scene.texts) {
    const k = (scene.now - t.t0) / t.life;
    if (k < 0 || k > 1) continue;
    ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    ctx.font = t.big
      ? "bold 18px Verdana, Geneva, sans-serif"
      : "bold 13px Verdana, Geneva, sans-serif";
    const y = t.y - k * 22;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#0d0b08";
    ctx.lineJoin = "round";
    ctx.strokeText(t.text, t.x, y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, y);
  }
  ctx.globalAlpha = 1;
}

export interface RenderInput {
  readonly scene: Scene;
  readonly art: BattleArt;
  readonly background: HTMLCanvasElement;
  readonly obstacles: readonly Hex[];
  readonly activeId: string | null;
}

/** Draws the whole stage; the caller sets the zoom transform. */
export function renderBattle(
  ctx: CanvasRenderingContext2D,
  input: RenderInput,
): void {
  const { scene, art } = input;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(input.background, 0, 0);
  drawGround(ctx, scene);
  drawMarks(ctx, scene);
  drawArea(ctx, scene);
  drawLabels(ctx, scene);

  const drawables: Drawable[] = [];
  for (const o of input.obstacles) {
    drawables.push({
      kind: "obstacle",
      y: hexToStage(o).y + HEX_SIZE / 2,
      index: hexIndex(o),
    });
  }
  for (const u of scene.units.values()) {
    if (u.visible) drawables.push({ kind: "unit", y: u.y, unit: u });
  }
  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) {
    if (d.kind === "unit") drawUnit(ctx, art, d.unit);
    else drawObstacle(ctx, art, d.index);
  }
  drawLinks(ctx, scene);
  for (const u of scene.units.values()) {
    if (u.visible) drawChip(ctx, u, u.id === input.activeId);
  }
  drawIntents(ctx, scene);
  drawSwapBadges(ctx, scene);
  drawStrikeArrow(ctx, scene);
  drawEffects(ctx, scene);
}
