/**
 * The adventure map's input and camera motion, free of the DOM (bead
 * border_marches-xaj.18), so the rules can be tested in node:
 *
 * - MapInput: drag, hover, edge and key panning behind one enable switch.
 *   While the switch is off (a town or battle screen, a dialog, a walk, the
 *   AI's turn) nothing pans, hovers or clicks, and every half-done gesture
 *   is dropped, so input resumes cleanly: no stuck drag, held key or edge
 *   scroll from before.
 * - Glide: an eased camera move between two world points.
 * - WheelZoom: wheel deltas gathered into zoom steps, so one trackpad flick
 *   does not run through every zoom step at once.
 */

/** Pixels from the map's edge where the pointer scrolls the map. */
export const EDGE_SCROLL_PX = 14;
/** How long the pointer rests at an edge before it scrolls (ms). */
export const EDGE_DWELL_MS = 180;
/** Edge and key scroll speed, screen px per second. */
export const EDGE_SCROLL_SPEED = 900;
export const KEY_SCROLL_SPEED = 1100;
/** Pointer travel (screen px) that turns a press into a drag. */
export const DRAG_SLOP_PX = 4;

export const PAN_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

export interface Point {
  readonly x: number;
  readonly y: number;
}

interface Drag {
  readonly x: number;
  readonly y: number;
  readonly camX: number;
  readonly camY: number;
  moved: boolean;
}

/** What a pointer move does. */
export type MoveOutcome =
  | { readonly kind: "ignored" }
  | { readonly kind: "pan"; readonly camX: number; readonly camY: number }
  | { readonly kind: "press" }
  | { readonly kind: "hover"; readonly x: number; readonly y: number };

export class MapInput {
  private enabled = true;
  private drag: Drag | null = null;
  private pointer: Point | null = null;
  /** When the pointer entered an edge zone (ms), or null. */
  private edgeSince: number | null = null;
  private readonly keys = new Set<string>();

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Turns input on or off; off drops every gesture in progress. */
  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    if (!on) this.reset();
  }

  /** Drops the drag, the pointer and held keys (blur, cancel, disable). */
  reset(): void {
    this.drag = null;
    this.pointer = null;
    this.edgeSince = null;
    this.keys.clear();
  }

  dragging(): boolean {
    return this.drag !== null;
  }

  heldKeys(): ReadonlySet<string> {
    return this.keys;
  }

  /** A press on the map; false when input is off. */
  pointerDown(x: number, y: number, camX: number, camY: number): boolean {
    if (!this.enabled) return false;
    this.drag = { x, y, camX, camY, moved: false };
    this.pointer = { x, y };
    return true;
  }

  pointerMove(x: number, y: number, zoom: number): MoveOutcome {
    if (!this.enabled) return { kind: "ignored" };
    this.pointer = { x, y };
    if (this.drag !== null) {
      const dx = x - this.drag.x;
      const dy = y - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > DRAG_SLOP_PX) this.drag.moved = true;
      if (!this.drag.moved) return { kind: "press" };
      return {
        kind: "pan",
        camX: this.drag.camX - dx / zoom,
        camY: this.drag.camY - dy / zoom,
      };
    }
    return { kind: "hover", x, y };
  }

  /** Ends a press; true when it was a click (no drag). */
  pointerUp(): boolean {
    const drag = this.drag;
    this.drag = null;
    return this.enabled && drag !== null && !drag.moved;
  }

  /** The pointer left the map or its capture was lost. */
  pointerLeave(): void {
    this.pointer = null;
    this.edgeSince = null;
  }

  /** A pan key went down; true when the map takes it. */
  keyDown(key: string): boolean {
    if (!this.enabled || !PAN_KEYS.includes(key)) return false;
    this.keys.add(key);
    return true;
  }

  keyUp(key: string): void {
    this.keys.delete(key);
  }

  /**
   * The scroll velocity now (screen px per second) from held keys and the
   * pointer resting at an edge of a w x h map view.
   */
  velocity(w: number, h: number, now: number): { vx: number; vy: number } {
    if (!this.enabled) return { vx: 0, vy: 0 };
    let vx = 0;
    let vy = 0;
    if (this.keys.has("ArrowLeft")) vx -= KEY_SCROLL_SPEED;
    if (this.keys.has("ArrowRight")) vx += KEY_SCROLL_SPEED;
    if (this.keys.has("ArrowUp")) vy -= KEY_SCROLL_SPEED;
    if (this.keys.has("ArrowDown")) vy += KEY_SCROLL_SPEED;
    const edge =
      this.pointer === null ? null : edgeDirection(this.pointer, w, h);
    if (edge === null || this.drag !== null) this.edgeSince = null;
    else {
      this.edgeSince ??= now;
      if (now - this.edgeSince >= EDGE_DWELL_MS) {
        vx += edge.x * EDGE_SCROLL_SPEED;
        vy += edge.y * EDGE_SCROLL_SPEED;
      }
    }
    return { vx, vy };
  }

  /** True while a key is held or the pointer rests at an edge. */
  wantsTicks(w: number, h: number): boolean {
    return (
      this.enabled &&
      (this.keys.size > 0 ||
        (this.drag === null &&
          this.pointer !== null &&
          edgeDirection(this.pointer, w, h) !== null))
    );
  }
}

/** Which edges a pointer is at: -1, 0 or 1 per axis; null for none. */
export function edgeDirection(
  p: Point,
  w: number,
  h: number,
  edge = EDGE_SCROLL_PX,
): Point | null {
  const x = p.x < edge ? -1 : p.x > w - edge ? 1 : 0;
  const y = p.y < edge ? -1 : p.y > h - edge ? 1 : 0;
  return x === 0 && y === 0 ? null : { x, y };
}

// ------------------------------------------------------------ glide

export interface Glide {
  readonly from: Point;
  readonly to: Point;
  readonly t0: number;
  readonly ms: number;
}

/** Glides shorter than this (screen px) snap. */
export const GLIDE_SNAP_PX = 2;

/**
 * How long a glide over `distance` screen px takes: a short hop is quick,
 * a long one capped so a jump across the map never drags.
 */
export function glideMs(distance: number): number {
  if (distance < GLIDE_SNAP_PX) return 0;
  return Math.round(Math.min(620, 200 + Math.sqrt(distance) * 9));
}

/** Smooth start and stop. */
export function easeInOut(k: number): number {
  const t = Math.min(1, Math.max(0, k));
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** The camera point of a glide at time `now`, and whether it is over. */
export function glideAt(g: Glide, now: number): Point & { done: boolean } {
  const k = g.ms <= 0 ? 1 : (now - g.t0) / g.ms;
  if (k >= 1) return { x: g.to.x, y: g.to.y, done: true };
  const e = easeInOut(k);
  return {
    x: g.from.x + (g.to.x - g.from.x) * e,
    y: g.from.y + (g.to.y - g.from.y) * e,
    done: false,
  };
}

// ------------------------------------------------------------ wheel

/** Wheel travel (px) per zoom step and the pause between steps (ms). */
export const WHEEL_STEP_PX = 60;
export const WHEEL_COOLDOWN_MS = 220;

/**
 * Gathers wheel deltas into zoom steps: a mouse notch (about 100 px) is one
 * step; a trackpad's stream of small deltas adds up to one, and after a
 * step the rest of the flick is ignored for a moment.
 */
export class WheelZoom {
  private sum = 0;
  private last = -Infinity;
  private lastStep = -Infinity;

  /**
   * A wheel event's delta (deltaMode 1 = lines, 2 = pages); returns +1 to
   * zoom in, -1 to zoom out, 0 for nothing yet.
   */
  push(deltaY: number, deltaMode: number, now: number): -1 | 0 | 1 {
    const px =
      deltaMode === 1 ? deltaY * 40 : deltaMode === 2 ? deltaY * 400 : deltaY;
    if (now - this.last > 300) this.sum = 0;
    this.last = now;
    if (now - this.lastStep < WHEEL_COOLDOWN_MS) {
      this.sum = 0;
      return 0;
    }
    this.sum += px;
    if (Math.abs(this.sum) < WHEEL_STEP_PX) return 0;
    const step = this.sum < 0 ? 1 : -1;
    this.sum = 0;
    this.lastStep = now;
    return step;
  }
}
