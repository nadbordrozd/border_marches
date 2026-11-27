/**
 * Animated terrain (bead border_marches-bzc.83): the pure part. Water
 * shimmers with short glints of light, living decorations (butterflies,
 * birds, a snail...) move a little, and the glowing cracks of volcanic
 * ground pulse. Everything here is a function of world coordinates and a
 * clock, so the map view (map-view.ts) draws only overlays over its cached
 * chunks, for the visible cells, a dozen times a second:
 *
 * - glints: a few fixed slots per open-water cell (clear of the shore and of
 *   anything drawn over the water); each cycle a slot lights or not, and a
 *   lit one fades in and out in three steps;
 * - magma: the hot pixels of the volcanic texture fall into three groups (by
 *   crack) whose glow pulses out of step;
 * - living decorations: a small pose (offset and frame) per decoration and
 *   part, with a phase from a hash of the cell, so no two move in step;
 * - sugar sparkles (bead bzc.115): a few fixed slots per frosting cell
 *   twinkle like the water's glints, a pixel and then a small cross.
 *
 * Nothing here moves when the terrain is still (reduced motion, the
 * "Animated terrain" setting off, a screen over the map): the view then
 * draws every overlay at time 0.
 */
import { CELL_PX } from "../../assets/manifest";
import type { PixelImage } from "./ground";
import { hash4, hashUnit } from "./hash";

const CELL = CELL_PX;

/** Timings and looks of the terrain motion. */
export const MOTION = {
  /** Frames per second of the overlay animation (all of it is slow). */
  fps: 12,
  glint: {
    /** One cycle of a glint slot, ms. */
    periodMs: 1900,
    /** Slots per open-water cell. */
    slots: 8,
    /** Share of slots lit in a cycle. */
    lit: 0.5,
    /** Kept this far (px) from the shore line. */
    shoreMargin: 14,
    /** Kept this far (px) from the cell edge (slots stay in their cell). */
    inset: 4,
    /** Glint colours: dim and bright (CSS). */
    dim: "rgba(226, 243, 255, 0.5)",
    bright: "rgba(255, 255, 255, 0.85)",
  },
  sparkle: {
    /** One cycle of a sparkle slot, ms. */
    periodMs: 2300,
    /** Slots per frosting cell. */
    slots: 3,
    /** Share of slots lit in a cycle. */
    lit: 0.4,
    /** Kept this far (px) from the cell edge, clear of the ground's spill. */
    inset: 10,
    /** Sparkle colours: dim and bright (CSS). */
    dim: "rgba(255, 246, 250, 0.7)",
    bright: "rgba(255, 255, 255, 0.95)",
  },
  magma: {
    /** One pulse, ms. */
    periodMs: 2600,
    /** Pulse groups, out of step by a third of a period each. */
    groups: 3,
    /** Glow alpha at the top and the bottom of a pulse. */
    high: 0.9,
    low: 0.15,
  },
} as const;

/** A frame is due when at least 1/fps has passed since the last one. */
export function frameDue(last: number, now: number, fps = MOTION.fps): boolean {
  return now - last >= 1000 / fps - 1;
}

/** The animation phase of a cell, in [0, 1): its own, from a hash. */
export function cellPhase(x: number, y: number, salt = 0x7a11): number {
  return hashUnit(x, y, salt);
}

// ------------------------------------------------------------------ water

/** A glint slot: a short horizontal line of light, world px. */
export interface GlintSlot {
  readonly x: number;
  readonly y: number;
  readonly len: number;
  /** Phase in [0, 1). */
  readonly phase: number;
  /** A per-slot salt for the cycle draws. */
  readonly seed: number;
}

/** The glint slots of one water cell, before the shore and body checks. */
export function cellGlintSlots(cx: number, cy: number): GlintSlot[] {
  const { slots, inset } = MOTION.glint;
  const out: GlintSlot[] = [];
  for (let k = 0; k < slots; k += 1) {
    const h = hash4(cx, cy, k, 0x611d);
    const len = 3 + (h % 3);
    const x =
      cx * CELL +
      inset +
      Math.floor(hashUnit(cx * 7 + k, cy, 0x61) * (CELL - 2 * inset - len));
    const y =
      cy * CELL +
      inset +
      Math.floor(hashUnit(cx, cy * 7 + k, 0x62) * (CELL - 2 * inset));
    out.push({ x, y, len, phase: ((h >>> 8) & 0xffff) / 65536, seed: h });
  }
  return out;
}

/**
 * How bright a glint slot is at time `t` (ms): 0 off, 1 dim, 2 bright. Each
 * cycle the slot lights or stays dark by a hash of its cycle, so the
 * sparkle moves round the water instead of blinking in place.
 */
export function glintLevel(slot: GlintSlot, t: number): 0 | 1 | 2 {
  const { periodMs, lit } = MOTION.glint;
  const u = t / periodMs + slot.phase;
  const cycle = Math.floor(u);
  if (hashUnit(slot.seed | 0, cycle, 0x613) >= lit) return 0;
  const k = u - cycle;
  // Up, hold, down: dim, bright, dim over the first 60% of the cycle.
  if (k < 0.15) return 1;
  if (k < 0.4) return 2;
  if (k < 0.6) return 1;
  return 0;
}

// --------------------------------------------------------------- frosting

/** A sparkle slot: one pixel of sugar that twinkles, world px. */
export interface SparkleSlot {
  readonly x: number;
  readonly y: number;
  /** Phase in [0, 1). */
  readonly phase: number;
  /** A per-slot salt for the cycle draws. */
  readonly seed: number;
}

/** The sparkle slots of one frosting cell, before the body checks. */
export function cellSparkleSlots(cx: number, cy: number): SparkleSlot[] {
  const { slots, inset } = MOTION.sparkle;
  const out: SparkleSlot[] = [];
  for (let k = 0; k < slots; k += 1) {
    const h = hash4(cx, cy, k, 0x5c4a);
    const x =
      cx * CELL +
      inset +
      Math.floor(hashUnit(cx * 5 + k, cy, 0x5c) * (CELL - 2 * inset));
    const y =
      cy * CELL +
      inset +
      Math.floor(hashUnit(cx, cy * 5 + k, 0x5d) * (CELL - 2 * inset));
    out.push({ x, y, phase: ((h >>> 8) & 0xffff) / 65536, seed: h });
  }
  return out;
}

/**
 * How bright a sparkle slot is at time `t` (ms): 0 off, 1 a pixel, 2 a
 * small cross. Like a glint, each cycle the slot lights or stays dark by a
 * hash of its cycle, so the sugar twinkles here and there, never in step.
 */
export function sparkleLevel(slot: SparkleSlot, t: number): 0 | 1 | 2 {
  const { periodMs, lit } = MOTION.sparkle;
  const u = t / periodMs + slot.phase;
  const cycle = Math.floor(u);
  if (hashUnit(slot.seed | 0, cycle, 0x5c5) >= lit) return 0;
  const k = u - cycle;
  if (k < 0.1) return 1;
  if (k < 0.25) return 2;
  if (k < 0.35) return 1;
  return 0;
}

/** The pixels a sparkle may light: its own and the four round it. */
export function sparklePixels(slot: SparkleSlot): [number, number][] {
  const { x, y } = slot;
  return [
    [x, y],
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ];
}

// ------------------------------------------------------------------ magma

/** The glow alpha of a magma group at time `t` (ms): a slow sine pulse. */
export function magmaAlpha(group: number, t: number): number {
  const { periodMs, groups, high, low } = MOTION.magma;
  const s = Math.sin(2 * Math.PI * (t / periodMs + group / groups));
  return low + (high - low) * (0.5 + 0.5 * s);
}

/**
 * Whether a texture pixel is hot (glowing lava): bright red, orange or
 * yellow, red far above blue; never the grey or brown rock round it.
 */
export function isHot(r: number, g: number, b: number): boolean {
  return r >= 160 && r - b >= 120 && r >= g;
}

/**
 * Whether a texture pixel belongs to a crack at all: hot, or the dark
 * blood red of a crack's own edge (red well above green and blue).
 */
export function isCrack(r: number, g: number, b: number): boolean {
  return isHot(r, g, b) || (r >= 40 && r - b >= 40 && r >= 3 * g);
}

/** The dark rim drawn round each kept crack (one pixel wide). */
export const CRACK_RIM: readonly [number, number, number] = [30, 21, 20];

/** A ground overlay ready to paint: its pixels and its glow groups. */
export interface CrackOverlay {
  /** RGBA, transparent except the kept cracks and their rims. */
  readonly image: PixelImage;
  /** Per pixel: 0, or 1 + the pulse group of a hot crack pixel. */
  readonly hot: Uint8Array;
}

/**
 * The crack overlay of a volcanic ground from a studio take full of lava
 * cracks (bead bzc.83): only its crack pixels (isCrack), grouped into
 * cracks (8-connected, wrapping round the edges); a share `keep` of the
 * cracks of 8 pixels or more is kept (by a hash of the crack's first pixel, so the result is
 * fixed) and drawn with a one-pixel dark rim, everything else left
 * transparent. The hot pixels of each kept crack fall into one of
 * `groups` pulse groups.
 */
export function crackOverlay(
  image: PixelImage,
  keep = 0.55,
  groups: number = MOTION.magma.groups,
): CrackOverlay {
  const { width: w, height: h, data } = image;
  const n = w * h;
  /** 0 rock, 1 crack edge, 2 hot. */
  const kind = new Uint8Array(n);
  for (let p = 0; p < n; p += 1) {
    if ((data[p * 4 + 3] ?? 0) === 0) continue;
    const r = data[p * 4] ?? 0;
    const g = data[p * 4 + 1] ?? 0;
    const b = data[p * 4 + 2] ?? 0;
    kind[p] = isHot(r, g, b) ? 2 : isCrack(r, g, b) ? 1 : 0;
  }
  const kept = new Uint8Array(n);
  const mask = new Uint8Array(n);
  const seen = new Uint8Array(n);
  const stack: number[] = [];
  const members: number[] = [];
  const around = (p: number, fn: (q: number) => void): void => {
    const x = p % w;
    const y = Math.floor(p / w);
    for (let dy = -1; dy <= 1; dy += 1)
      for (let dx = -1; dx <= 1; dx += 1)
        if (dx !== 0 || dy !== 0)
          fn(((y + dy + h) % h) * w + ((x + dx + w) % w));
  };
  for (let s = 0; s < n; s += 1) {
    if (kind[s] === 0 || seen[s] === 1) continue;
    const roll = hash4(s % w, Math.floor(s / w), 0x3a, 0x9e);
    const keepIt = (roll % 1000) / 1000 < keep;
    const group = 1 + ((roll >>> 10) % groups);
    members.length = 0;
    seen[s] = 1;
    stack.push(s);
    while (stack.length > 0) {
      const p = stack.pop() as number;
      members.push(p);
      around(p, (q) => {
        if (kind[q] !== 0 && seen[q] === 0) {
          seen[q] = 1;
          stack.push(q);
        }
      });
    }
    if (!keepIt || members.length < 8 || !members.some((p) => kind[p] === 2))
      continue;
    for (const p of members) {
      kept[p] = 1;
      if (kind[p] === 2) mask[p] = group;
    }
  }
  const out = new Uint8ClampedArray(n * 4);
  for (let p = 0; p < n; p += 1) {
    if (kept[p] === 0) continue;
    for (let c = 0; c < 3; c += 1) out[p * 4 + c] = data[p * 4 + c] ?? 0;
    out[p * 4 + 3] = 255;
    around(p, (q) => {
      if (kept[q] !== 0 || out[q * 4 + 3] !== 0) return;
      out[q * 4] = CRACK_RIM[0];
      out[q * 4 + 1] = CRACK_RIM[1];
      out[q * 4 + 2] = CRACK_RIM[2];
      out[q * 4 + 3] = 255;
    });
  }
  return { image: { width: w, height: h, data: out }, hot: mask };
}

// --------------------------------------------------------- living things

/** How a living decoration moves. */
export type LivingMotion =
  "flap" | "hover" | "hop" | "breathe" | "creep" | "twitch" | "roll";

/**
 * The living decorations (src/data/decorations.ts) and their idle. A flap
 * is a two-frame wing beat of each creature in the sprite (the butterflies
 * are three) plus a drift of a pixel or two; the rest move by one pixel.
 */
export const LIVING_MOTION: Readonly<Record<string, LivingMotion>> = {
  butterflies: "flap",
  dragonfly: "hover",
  songbird: "hop",
  crow: "hop",
  snail: "creep",
  lizard: "twitch",
  scorpion: "twitch",
  hedgehog: "breathe",
  "tree-frog": "breathe",
  // Winter (bead bzc.87).
  "arctic-hare": "twitch",
  "snowy-owl": "hop",
  fox: "breathe",
  // The desert (bead bzc.88): a tumbleweed rolls to and fro in the wind,
  // a scarab pushes its ball along, a fennec sleeps, a snake flicks.
  "desert-tumbleweed": "roll",
  scarab: "creep",
  fennec: "breathe",
  "sand-snake": "twitch",
  // The frosting (bead bzc.115): a gummy worm wriggles along, a sugar
  // mouse twitches, the gingerbread rabbit breathes (it is alive).
  "gummy-worm": "creep",
  "sugar-mouse": "twitch",
  "gingerbread-rabbit": "breathe",
};

/** The pose of a living decoration (or one of its parts) at a moment. */
export interface Pose {
  /** Offset of the drawn sprite, whole world px. */
  readonly dx: number;
  readonly dy: number;
  /** 0: the sprite as drawn; 1: its second frame (wings in, squashed). */
  readonly frame: 0 | 1;
}

const STILL: Pose = { dx: 0, dy: 0, frame: 0 };

const wave = (t: number, periodMs: number, phase: number): number =>
  Math.sin(2 * Math.PI * (t / periodMs + phase));

/**
 * The pose of a living decoration of `motion` with phase `phase` (in
 * [0, 1)) at time `t` ms; `part` numbers the creatures of one sprite. A
 * still map (t = 0 and no motion) is the sprite as drawn.
 */
export function livingPose(
  motion: LivingMotion,
  phase: number,
  t: number,
  part = 0,
): Pose {
  if (t <= 0) return STILL;
  const p = phase + part * 0.371;
  switch (motion) {
    case "flap": {
      // About four beats a second, each part its own; a slow wander.
      const beat = Math.floor(t / 130 + p * 7) % 2 === 0 ? 0 : 1;
      return {
        dx: Math.round(1.6 * wave(t, 3300, p)),
        dy: Math.round(1.2 * wave(t, 2300, p * 1.7)),
        frame: beat,
      };
    }
    case "hover":
      return {
        dx: Math.round(1.4 * wave(t, 4100, p)),
        dy: Math.round(wave(t, 700, p * 3)),
        frame: 0,
      };
    case "hop": {
      // A little hop (one pixel up) for 160 ms about every three seconds.
      const k = (t / 3100 + p) % 1;
      return { dx: 0, dy: k < 0.05 ? -1 : 0, frame: 0 };
    }
    case "breathe": {
      const k = (t / 1900 + p) % 1;
      return { dx: 0, dy: 0, frame: k < 0.5 ? 0 : 1 };
    }
    case "creep":
      return { dx: Math.round(wave(t, 7000, p)), dy: 0, frame: 0 };
    case "twitch": {
      const k = (t / 4300 + p) % 1;
      return { dx: k < 0.07 ? 1 : 0, dy: 0, frame: 0 };
    }
    case "roll": {
      // Blown three pixels each way over five seconds, with a little bump
      // on the way (bead bzc.88: the tumbleweed).
      const k = (t / 5200 + p) % 1;
      return {
        dx: Math.round(3 * wave(t, 5200, p)),
        dy: k % 0.25 < 0.04 ? -1 : 0,
        frame: 0,
      };
    }
  }
}

/** An opaque part of a sprite: its box in the sprite and its pixels. */
export interface SpritePart {
  readonly x: number;
  readonly y: number;
  readonly image: PixelImage;
}

/**
 * The separate creatures of a sprite: its 8-connected opaque pieces (specks
 * of under 6 pixels join the nearest piece's box), each cut out on its own.
 */
export function spriteParts(image: PixelImage): SpritePart[] {
  const { width: w, height: h, data } = image;
  const label = new Int32Array(w * h).fill(-1);
  const boxes: { x0: number; y0: number; x1: number; y1: number; n: number }[] =
    [];
  for (let s = 0; s < w * h; s += 1) {
    if (label[s] !== -1 || (data[s * 4 + 3] ?? 0) === 0) continue;
    const id = boxes.length;
    const box = { x0: w, y0: h, x1: -1, y1: -1, n: 0 };
    const stack = [s];
    label[s] = id;
    while (stack.length > 0) {
      const p = stack.pop() as number;
      const x = p % w;
      const y = Math.floor(p / w);
      box.x0 = Math.min(box.x0, x);
      box.y0 = Math.min(box.y0, y);
      box.x1 = Math.max(box.x1, x);
      box.y1 = Math.max(box.y1, y);
      box.n += 1;
      for (let dy = -1; dy <= 1; dy += 1)
        for (let dx = -1; dx <= 1; dx += 1) {
          const qx = x + dx;
          const qy = y + dy;
          if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
          const q = qy * w + qx;
          if (label[q] === -1 && (data[q * 4 + 3] ?? 0) > 0) {
            label[q] = id;
            stack.push(q);
          }
        }
    }
    boxes.push(box);
  }
  const big = boxes.map((b, id) => ({ ...b, id })).filter((b) => b.n >= 6);
  if (big.length === 0) return [{ x: 0, y: 0, image }];
  // Specks belong to the nearest big piece.
  const owner = boxes.map((b, id) => {
    if (b.n >= 6) return id;
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    let best = big[0] as (typeof big)[number];
    let bestD = Infinity;
    for (const o of big) {
      const d = Math.hypot(cx - (o.x0 + o.x1) / 2, cy - (o.y0 + o.y1) / 2);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best.id;
  });
  const merged = new Map<
    number,
    { x0: number; y0: number; x1: number; y1: number }
  >();
  boxes.forEach((b, id) => {
    const o = owner[id] as number;
    const m = merged.get(o);
    merged.set(
      o,
      m === undefined
        ? { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }
        : {
            x0: Math.min(m.x0, b.x0),
            y0: Math.min(m.y0, b.y0),
            x1: Math.max(m.x1, b.x1),
            y1: Math.max(m.y1, b.y1),
          },
    );
  });
  return [...merged.entries()]
    .sort((a, b) => a[1].y0 - b[1].y0 || a[1].x0 - b[1].x0)
    .map(([id, b]) => {
      const pw = b.x1 - b.x0 + 1;
      const ph = b.y1 - b.y0 + 1;
      const out = new Uint8ClampedArray(pw * ph * 4);
      for (let y = 0; y < ph; y += 1)
        for (let x = 0; x < pw; x += 1) {
          const s = (b.y0 + y) * w + b.x0 + x;
          if (owner[label[s] ?? -1] !== id) continue;
          for (let c = 0; c < 4; c += 1)
            out[(y * pw + x) * 4 + c] = data[s * 4 + c] ?? 0;
        }
      return { x: b.x0, y: b.y0, image: { width: pw, height: ph, data: out } };
    });
}

/**
 * The wings-in frame of a flapping creature: its columns pulled toward the
 * middle column to `keep` of the width (nearest pixel), so the wings fold
 * up while the body stays. Same size as the source, transparent round it.
 */
export function squashX(image: PixelImage, keep = 0.5): PixelImage {
  const { width: w, height: h, data } = image;
  const out = new Uint8ClampedArray(w * h * 4);
  const mid = (w - 1) / 2;
  const half = Math.max(0.5, (w / 2) * keep);
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const off = x - mid;
      if (Math.abs(off) > half) continue;
      const sx = Math.round(mid + off / keep);
      if (sx < 0 || sx >= w) continue;
      for (let c = 0; c < 4; c += 1)
        out[(y * w + x) * 4 + c] = data[(y * w + sx) * 4 + c] ?? 0;
    }
  return { width: w, height: h, data: out };
}

/**
 * The breath-out frame: the sprite one pixel lower, its middle row dropped
 * (the bottom row, the foot, stays put). Same size as the source.
 */
export function squashY(image: PixelImage): PixelImage {
  const { width: w, height: h, data } = image;
  const out = new Uint8ClampedArray(w * h * 4);
  const drop = Math.floor(h / 2);
  for (let y = 1; y < h; y += 1) {
    const sy = y <= drop ? y - 1 : y;
    for (let x = 0; x < w; x += 1)
      for (let c = 0; c < 4; c += 1)
        out[(y * w + x) * 4 + c] = data[(sy * w + x) * 4 + c] ?? 0;
  }
  return { width: w, height: h, data: out };
}
