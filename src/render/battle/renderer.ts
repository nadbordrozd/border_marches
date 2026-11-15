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
  hexCorners,
  hexToStage,
} from "./geometry.ts";
import type { HexMark, Scene, UnitView } from "./scene.ts";

export const SIDE_COLORS = {
  attacker: { chip: "#24477e", edge: "#9cc3ff" },
  defender: { chip: "#7e2424", edge: "#ffb09c" },
} as const;

const NUMBER_FONT = "bold 12px Verdana, Geneva, sans-serif";

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
};

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
  // Status pips left of the chip: green Venom, blue Defend.
  let px = x - 7;
  const pip = (color: string): void => {
    ctx.fillStyle = color;
    ctx.strokeStyle = "#0d0b08";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, y + h / 2, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    px -= 11;
  };
  if (u.venom) pip("#6fdc3c");
  if (u.defending) pip("#5aa8ff");
  ctx.globalAlpha = 1;
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
  drawMarks(ctx, scene);

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
  for (const u of scene.units.values()) {
    if (u.visible) drawChip(ctx, u, u.id === input.activeId);
  }
  drawStrikeArrow(ctx, scene);
  drawEffects(ctx, scene);
}
