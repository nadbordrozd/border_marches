/**
 * A field of short-lived pixel effects (bead bzc.26): particles, rings,
 * lightning, beams, missiles, clock hands and impact stars. Every effect is
 * a closed-form function of its own clock (no per-frame state), so any
 * moment can be drawn exactly (frame strips, skipping) and nothing has to
 * be updated between frames. Positions snap to whole pixels.
 *
 * The field holds at most {@link MAX_FX} effects; the oldest go first.
 * Effects never read or change game state.
 */
import { OUTLINE, shapeSize, shapeSprite } from "./pixels.ts";
import type { Palette, ShapeId } from "./pixels.ts";

export const MAX_FX = 640;

interface Timing {
  /** Start, on the field's clock (ms); may lie in the future (a stagger). */
  readonly t0: number;
  /** Life in local ms. */
  readonly life: number;
  /** Local time runs this much faster than the clock (battle speed). */
  readonly rate: number;
}

export type FxSpec =
  | {
      /** A pixel sprite flying ballistically. */
      readonly kind: "p";
      readonly shape: ShapeId;
      readonly pal: Palette;
      readonly x: number;
      readonly y: number;
      /** Pixels per second. */
      readonly vx?: number;
      readonly vy?: number;
      /** Pixels per second squared. */
      readonly ay?: number;
      /** Side-to-side flutter: amplitude (px) and frequency (Hz). */
      readonly wob?: number;
      readonly wobF?: number;
      /** Alternate shapes (spinning gears), one per `frameMs`. */
      readonly frames?: readonly ShapeId[] | undefined;
      readonly frameMs?: number;
      readonly fade?: "out" | "blink" | "none" | "in-out";
      readonly scale?: number;
      readonly flip?: boolean;
    }
  | {
      /** A ring of pixels expanding from r0 to r1; `flat` squashes it. */
      readonly kind: "ring";
      readonly x: number;
      readonly y: number;
      readonly r0: number;
      readonly r1: number;
      readonly pal: Palette;
      readonly flat?: number;
      /** Clock face: twelve ticks lit one after another. */
      readonly ticks?: boolean;
      /** Dots on the ring (default by size). */
      readonly dots?: number;
      readonly size?: number;
    }
  | {
      /** A jagged bolt from (x0, y0) to (x1, y1), flickering. */
      readonly kind: "bolt";
      readonly x0: number;
      readonly y0: number;
      readonly x1: number;
      readonly y1: number;
      readonly pal: Palette;
      readonly seed: number;
    }
  | {
      /** A straight beam with a bright pulse travelling along it. */
      readonly kind: "beam";
      readonly x0: number;
      readonly y0: number;
      readonly x1: number;
      readonly y1: number;
      readonly pal: Palette;
      /** Draw as chain links instead of a line. */
      readonly chain?: boolean;
    }
  | {
      /** A projectile along an arc with a pixel trail. */
      readonly kind: "missile";
      readonly x0: number;
      readonly y0: number;
      readonly x1: number;
      readonly y1: number;
      readonly arc: number;
      /** "arrow" draws an oriented shaft; otherwise a sprite. */
      readonly shape: ShapeId | "arrow";
      readonly pal: Palette;
      readonly trail?: number;
      readonly frames?: readonly ShapeId[] | undefined;
    }
  | {
      /** A clock hand sweeping `turns` turns round (x, y). */
      readonly kind: "hand";
      readonly x: number;
      readonly y: number;
      readonly r: number;
      readonly pal: Palette;
      readonly turns: number;
      readonly a0?: number;
    }
  | {
      /** An impact star: rays of pixels thrown out and gone. */
      readonly kind: "star";
      readonly x: number;
      readonly y: number;
      readonly r: number;
      readonly pal: Palette;
      readonly rays?: number;
    }
  | {
      /** A vine or crack growing from (x, y) upward in steps. */
      readonly kind: "vine";
      readonly x: number;
      readonly y: number;
      readonly h: number;
      readonly pal: Palette;
      readonly seed: number;
    };

export type Fx = FxSpec & Timing;

/** Where and how fast new effects start. */
export interface FxClock {
  readonly now: number;
  /** Local time rate (battle speed); 1 by default. */
  readonly rate?: number | undefined;
}

export class FxField {
  items: Fx[] = [];
  /** Effects dropped by the cap (for perf tests). */
  dropped = 0;

  constructor(readonly cap = MAX_FX) {}

  add(clock: FxClock, spec: FxSpec, life: number, delay = 0): void {
    const rate = clock.rate ?? 1;
    this.items.push({ ...spec, t0: clock.now + delay / rate, life, rate });
    if (this.items.length > this.cap) {
      const over = this.items.length - this.cap;
      this.items.splice(0, over);
      this.dropped += over;
    }
  }

  clear(): void {
    this.items = [];
  }

  /** Drops finished effects. */
  prune(now: number): void {
    if (this.items.length === 0) return;
    this.items = this.items.filter((f) => (now - f.t0) * f.rate <= f.life);
  }

  get size(): number {
    return this.items.length;
  }

  /** Whether anything is still to be drawn at `now`. */
  alive(now: number): boolean {
    return this.items.some((f) => (now - f.t0) * f.rate <= f.life);
  }
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** A small seeded random for repeatable effect shapes (never the game's). */
export function fxRandom(seed: number): () => number {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Alpha in quarter steps: fades stay crisp. */
function stepAlpha(a: number): number {
  return Math.max(0, Math.min(1, Math.ceil(a * 4) / 4));
}

function fadeAlpha(fade: string | undefined, k: number): number {
  switch (fade) {
    case "none":
      return 1;
    case "blink":
      return k < 0.6 ? 1 : Math.floor(k * 20) % 2 === 0 ? 1 : 0;
    case "in-out":
      return stepAlpha(k < 0.2 ? k / 0.2 : k > 0.7 ? (1 - k) / 0.3 : 1);
    default:
      return stepAlpha(k < 0.55 ? 1 : (1 - k) / 0.45);
  }
}

function sq(ctx: Ctx, x: number, y: number, s: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
}

/** A line of whole-pixel squares. */
export function pixLine(
  ctx: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  s: number,
  color: string,
): void {
  const n = Math.max(
    1,
    Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))),
  );
  ctx.fillStyle = color;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    ctx.fillRect(
      Math.round(x0 + (x1 - x0) * t - s / 2),
      Math.round(y0 + (y1 - y0) * t - s / 2),
      s,
      s,
    );
  }
}

/**
 * The default scale of a shape: motifs (4 pixels or more across) are drawn
 * at 2 so they read at 1x beside the unit sprites; specks stay at 1.
 */
export function motifScale(shape: ShapeId): number {
  const { w, h } = shapeSize(shape);
  return Math.max(w, h) >= 6 ? 2 : 1;
}

function drawSprite(
  ctx: Ctx,
  shape: ShapeId,
  pal: Palette,
  x: number,
  y: number,
  scale = motifScale(shape),
  flip = false,
): void {
  const img = shapeSprite(shape, pal, scale, flip);
  if (!img) return;
  const { w, h } = shapeSize(shape);
  ctx.drawImage(
    img as CanvasImageSource,
    Math.round(x - (w * scale) / 2),
    Math.round(y - (h * scale) / 2),
  );
}

function boltPoints(f: Extract<Fx, { kind: "bolt" }>): [number, number][] {
  const rnd = fxRandom(f.seed);
  const dx = f.x1 - f.x0;
  const dy = f.y1 - f.y0;
  const len = Math.hypot(dx, dy) || 1;
  const n = Math.max(3, Math.round(len / 14));
  const nx = -dy / len;
  const ny = dx / len;
  const pts: [number, number][] = [[f.x0, f.y0]];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const j = (rnd() * 2 - 1) * Math.min(10, len * 0.12);
    pts.push([f.x0 + dx * t + nx * j, f.y0 + dy * t + ny * j]);
  }
  pts.push([f.x1, f.y1]);
  return pts;
}

function missileAt(
  f: Extract<Fx, { kind: "missile" }>,
  k: number,
): [number, number] {
  const c = Math.max(0, Math.min(1, k));
  return [
    f.x0 + (f.x1 - f.x0) * c,
    f.y0 + (f.y1 - f.y0) * c - Math.sin(Math.PI * c) * f.arc,
  ];
}

function drawOne(ctx: Ctx, f: Fx, lt: number): void {
  const k = f.life <= 0 ? 1 : lt / f.life;
  const s = lt / 1000;
  switch (f.kind) {
    case "p": {
      const x =
        f.x +
        (f.vx ?? 0) * s +
        (f.wob ? Math.sin(s * Math.PI * 2 * (f.wobF ?? 1.5)) * f.wob : 0);
      const y = f.y + (f.vy ?? 0) * s + 0.5 * (f.ay ?? 0) * s * s;
      const a = fadeAlpha(f.fade, k);
      if (a <= 0) return;
      ctx.globalAlpha = a;
      const shape =
        f.frames && f.frames.length > 0
          ? (f.frames[Math.floor(lt / (f.frameMs ?? 90)) % f.frames.length] ??
            f.shape)
          : f.shape;
      drawSprite(
        ctx,
        shape,
        f.pal,
        x,
        y,
        f.scale ?? motifScale(shape),
        f.flip ?? false,
      );
      return;
    }
    case "ring": {
      const ease = 1 - (1 - k) * (1 - k);
      const r = f.r0 + (f.r1 - f.r0) * ease;
      const flat = f.flat ?? 1;
      const size = f.size ?? 2;
      ctx.globalAlpha = stepAlpha(k < 0.6 ? 1 : (1 - k) / 0.4);
      if (f.ticks) {
        const lit = Math.floor(k * 12 * 1.5) % 12;
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
          const c = Math.cos(a);
          const sn = Math.sin(a) * flat;
          const color = i === lit ? (f.pal[0] as string) : (f.pal[1] as string);
          pixLine(
            ctx,
            f.x + c * (r - 3),
            f.y + sn * (r - 3),
            f.x + c * r,
            f.y + sn * r,
            size,
            color,
          );
        }
        return;
      }
      const dots = f.dots ?? Math.max(8, Math.round((Math.PI * 2 * r) / 5));
      for (let i = 0; i < dots; i++) {
        const a = (i / dots) * Math.PI * 2;
        sq(
          ctx,
          f.x + Math.cos(a) * r,
          f.y + Math.sin(a) * r * flat,
          size,
          (i % 3 === 0 ? f.pal[0] : f.pal[1]) as string,
        );
      }
      return;
    }
    case "bolt": {
      // Strike, flicker off once, strike again, fade.
      const on =
        k < 0.25 ||
        (k > 0.35 && k < 0.6) ||
        (k >= 0.6 && Math.floor(lt / 45) % 2 === 0);
      if (!on) return;
      ctx.globalAlpha = stepAlpha(k < 0.6 ? 1 : (1 - k) / 0.4 + 0.25);
      const pts = boltPoints(f);
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1] as [number, number];
        const [bx, by] = pts[i] as [number, number];
        pixLine(ctx, ax, ay, bx, by, 4, f.pal[3] as string);
      }
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1] as [number, number];
        const [bx, by] = pts[i] as [number, number];
        pixLine(
          ctx,
          ax,
          ay,
          bx,
          by,
          2,
          (i % 2 ? f.pal[0] : f.pal[1]) as string,
        );
      }
      return;
    }
    case "beam": {
      const grow = Math.min(1, k / 0.3);
      const ex = f.x0 + (f.x1 - f.x0) * grow;
      const ey = f.y0 + (f.y1 - f.y0) * grow;
      ctx.globalAlpha = stepAlpha(k < 0.75 ? 1 : (1 - k) / 0.25);
      if (f.chain) {
        const len = Math.hypot(ex - f.x0, ey - f.y0);
        const n = Math.floor(len / 6);
        for (let i = 0; i <= n; i++) {
          const t = n === 0 ? 0 : i / n;
          drawSprite(
            ctx,
            "link",
            f.pal,
            f.x0 + (ex - f.x0) * t,
            f.y0 + (ey - f.y0) * t,
            1,
          );
        }
      } else {
        pixLine(ctx, f.x0, f.y0, ex, ey, 4, f.pal[3] as string);
        pixLine(ctx, f.x0, f.y0, ex, ey, 2, f.pal[1] as string);
      }
      // The travelling pulse.
      const p = (k * 2.2) % 1;
      const px = f.x0 + (f.x1 - f.x0) * p * grow;
      const py = f.y0 + (f.y1 - f.y0) * p * grow;
      sq(ctx, px, py, 4, f.pal[0] as string);
      return;
    }
    case "missile": {
      if (k > 1) return;
      const [x, y] = missileAt(f, k);
      const trail = f.trail ?? 4;
      for (let i = trail; i >= 1; i--) {
        const [tx, ty] = missileAt(f, k - i * 0.045);
        if (k - i * 0.045 < 0) continue;
        sq(
          ctx,
          tx,
          ty,
          i > trail / 2 ? 1 : 2,
          (i > trail / 2 ? f.pal[2] : f.pal[1]) as string,
        );
      }
      ctx.globalAlpha = 1;
      if (f.shape === "arrow") {
        const [bx, by] = missileAt(f, k - 0.06);
        const dx = x - bx;
        const dy = y - by;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        pixLine(ctx, x - ux * 10, y - uy * 10, x, y, 1, f.pal[2] as string);
        sq(ctx, x, y, 2, f.pal[0] as string);
        sq(
          ctx,
          x - ux * 10 - uy * 2,
          y - uy * 10 + ux * 2,
          1,
          f.pal[1] as string,
        );
        sq(
          ctx,
          x - ux * 10 + uy * 2,
          y - uy * 10 - ux * 2,
          1,
          f.pal[1] as string,
        );
        return;
      }
      const shape =
        f.frames && f.frames.length > 0
          ? (f.frames[Math.floor(lt / 70) % f.frames.length] ?? f.shape)
          : f.shape;
      drawSprite(ctx, shape, f.pal, x, y);
      return;
    }
    case "hand": {
      const a =
        (f.a0 ?? -Math.PI / 2) + f.turns * Math.PI * 2 * Math.min(1, k * 1.2);
      ctx.globalAlpha = stepAlpha(k < 0.7 ? 1 : (1 - k) / 0.3);
      pixLine(
        ctx,
        f.x,
        f.y,
        f.x + Math.cos(a) * f.r,
        f.y + Math.sin(a) * f.r * 0.8,
        2,
        f.pal[0] as string,
      );
      pixLine(
        ctx,
        f.x,
        f.y,
        f.x + Math.cos(a * 0.25) * f.r * 0.6,
        f.y + Math.sin(a * 0.25) * f.r * 0.5,
        2,
        f.pal[4] ?? (f.pal[1] as string),
      );
      sq(ctx, f.x, f.y, 3, f.pal[3] as string);
      return;
    }
    case "star": {
      const rays = f.rays ?? 8;
      const r = f.r * Math.min(1, k * 2.2);
      const inner = f.r * Math.max(0, k * 2 - 0.9);
      if (k > 1) return;
      ctx.globalAlpha = stepAlpha(k < 0.5 ? 1 : (1 - k) / 0.5);
      for (let i = 0; i < rays; i++) {
        const a = (i / rays) * Math.PI * 2 + 0.2;
        const long = i % 2 === 0 ? 1 : 0.6;
        pixLine(
          ctx,
          f.x + Math.cos(a) * inner * long,
          f.y + Math.sin(a) * inner * long,
          f.x + Math.cos(a) * r * long,
          f.y + Math.sin(a) * r * long,
          2,
          (i % 2 === 0 ? f.pal[0] : f.pal[1]) as string,
        );
      }
      if (k < 0.3) sq(ctx, f.x, f.y, 4, f.pal[0] as string);
      return;
    }
    case "vine": {
      const rnd = fxRandom(f.seed);
      const grow = Math.min(1, k / 0.5);
      const steps = Math.round(f.h * grow);
      ctx.globalAlpha = stepAlpha(k < 0.75 ? 1 : (1 - k) / 0.25);
      const phase = rnd() * Math.PI * 2;
      const at = (i: number): number =>
        f.x + Math.round(Math.sin(phase + i * 0.35) * 3);
      const side = (i: number): number => (i % 10 === 3 ? 3 : -3);
      // A dark outline first, then the stem, its leaves and the tip.
      for (let i = 0; i < steps; i++) {
        sq(ctx, at(i), f.y - i, 4, OUTLINE);
        if (i % 5 === 3) sq(ctx, at(i) + side(i), f.y - i, 4, OUTLINE);
      }
      for (let i = 0; i < steps; i++) {
        sq(ctx, at(i), f.y - i, 2, f.pal[2] as string);
        if (i % 5 === 3)
          sq(ctx, at(i) + side(i), f.y - i, 2, f.pal[1] as string);
      }
      if (steps > 3) sq(ctx, at(steps), f.y - steps, 2, f.pal[0] as string);
      return;
    }
  }
}

/** Draws every live effect at `now`; the caller sets the transform. */
export function drawFx(ctx: Ctx, field: FxField, now: number): void {
  if (field.items.length === 0) return;
  const prevAlpha = ctx.globalAlpha;
  for (const f of field.items) {
    const lt = (now - f.t0) * f.rate;
    if (lt < 0 || lt > f.life) continue;
    drawOne(ctx, f, lt);
    ctx.globalAlpha = 1;
  }
  ctx.globalAlpha = prevAlpha;
}
