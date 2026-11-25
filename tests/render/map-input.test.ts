import { describe, expect, it } from "vitest";
import {
  EDGE_DWELL_MS,
  EDGE_SCROLL_SPEED,
  KEY_SCROLL_SPEED,
  MapInput,
  WHEEL_COOLDOWN_MS,
  WheelZoom,
  easeInOut,
  edgeDirection,
  glideAt,
  glideMs,
} from "../../src/render/map/input.ts";

const W = 1000;
const H = 700;

describe("map input switch (bead xaj.18)", () => {
  it("ignores presses, moves, keys and edges while off", () => {
    const input = new MapInput();
    input.setEnabled(false);
    expect(input.pointerDown(10, 10, 0, 0)).toBe(false);
    expect(input.pointerMove(2, 2, 1)).toEqual({ kind: "ignored" });
    expect(input.keyDown("ArrowLeft")).toBe(false);
    expect(input.velocity(W, H, 0)).toEqual({ vx: 0, vy: 0 });
    expect(input.velocity(W, H, 10_000)).toEqual({ vx: 0, vy: 0 });
    expect(input.wantsTicks(W, H)).toBe(false);
    expect(input.pointerUp()).toBe(false);
  });

  it("drops a drag in progress when turned off and resumes without it", () => {
    const input = new MapInput();
    input.pointerDown(100, 100, 500, 400);
    expect(input.pointerMove(160, 100, 1)).toMatchObject({ kind: "pan" });
    input.setEnabled(false);
    expect(input.dragging()).toBe(false);
    input.setEnabled(true);
    // The next move hovers instead of panning from the old drag.
    expect(input.pointerMove(200, 120, 1)).toEqual({
      kind: "hover",
      x: 200,
      y: 120,
    });
    // A stray release is not a click.
    expect(input.pointerUp()).toBe(false);
  });

  it("drops held arrow keys and the edge scroll when turned off", () => {
    const input = new MapInput();
    expect(input.keyDown("ArrowRight")).toBe(true);
    input.pointerMove(2, 300, 1);
    expect(input.velocity(W, H, 0).vx).toBe(KEY_SCROLL_SPEED);
    input.setEnabled(false);
    input.setEnabled(true);
    expect(input.heldKeys().size).toBe(0);
    expect(input.velocity(W, H, 10_000)).toEqual({ vx: 0, vy: 0 });
    expect(input.wantsTicks(W, H)).toBe(false);
  });

  it("takes only the arrow keys", () => {
    const input = new MapInput();
    expect(input.keyDown("e")).toBe(false);
    expect(input.keyDown(" ")).toBe(false);
    expect(input.keyDown("ArrowUp")).toBe(true);
    expect(input.velocity(W, H, 0)).toEqual({ vx: 0, vy: -KEY_SCROLL_SPEED });
    input.keyUp("ArrowUp");
    expect(input.velocity(W, H, 0)).toEqual({ vx: 0, vy: 0 });
  });

  it("tells a click from a drag by the slop", () => {
    const input = new MapInput();
    input.pointerDown(100, 100, 0, 0);
    expect(input.pointerMove(102, 101, 1)).toEqual({ kind: "press" });
    expect(input.pointerUp()).toBe(true);
    input.pointerDown(100, 100, 500, 400);
    expect(input.pointerMove(140, 80, 2)).toEqual({
      kind: "pan",
      camX: 480,
      camY: 410,
    });
    expect(input.pointerUp()).toBe(false);
  });

  it("a cancelled pointer leaves no drag behind", () => {
    const input = new MapInput();
    input.pointerDown(100, 100, 0, 0);
    input.pointerUp();
    input.pointerLeave();
    expect(input.dragging()).toBe(false);
    expect(input.wantsTicks(W, H)).toBe(false);
  });

  it("scrolls at an edge only after the pointer rests there", () => {
    const input = new MapInput();
    input.pointerMove(W - 3, 350, 1);
    expect(input.wantsTicks(W, H)).toBe(true);
    expect(input.velocity(W, H, 1000)).toEqual({ vx: 0, vy: 0 });
    expect(input.velocity(W, H, 1000 + EDGE_DWELL_MS - 1).vx).toBe(0);
    expect(input.velocity(W, H, 1000 + EDGE_DWELL_MS).vx).toBe(
      EDGE_SCROLL_SPEED,
    );
    // Leaving the edge stops it, and coming back waits again.
    input.pointerMove(500, 350, 1);
    expect(input.velocity(W, H, 2000)).toEqual({ vx: 0, vy: 0 });
    input.pointerMove(1, 1, 1);
    expect(input.velocity(W, H, 3000)).toEqual({ vx: 0, vy: 0 });
    expect(input.velocity(W, H, 3000 + EDGE_DWELL_MS)).toEqual({
      vx: -EDGE_SCROLL_SPEED,
      vy: -EDGE_SCROLL_SPEED,
    });
  });

  it("never edge-scrolls during a drag", () => {
    const input = new MapInput();
    input.pointerDown(500, 350, 0, 0);
    input.pointerMove(W - 2, 350, 1);
    expect(input.wantsTicks(W, H)).toBe(false);
    expect(input.velocity(W, H, 10_000)).toEqual({ vx: 0, vy: 0 });
  });

  it("finds the edges", () => {
    expect(edgeDirection({ x: 500, y: 300 }, W, H)).toBeNull();
    expect(edgeDirection({ x: 0, y: 300 }, W, H)).toEqual({ x: -1, y: 0 });
    expect(edgeDirection({ x: W, y: H }, W, H)).toEqual({ x: 1, y: 1 });
  });
});

describe("camera glide", () => {
  it("snaps tiny moves and caps long ones", () => {
    expect(glideMs(0)).toBe(0);
    expect(glideMs(1.5)).toBe(0);
    expect(glideMs(40)).toBeGreaterThan(200);
    expect(glideMs(400)).toBeGreaterThan(glideMs(40));
    expect(glideMs(100_000)).toBe(620);
  });

  it("eases from start to end", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.1)).toBeLessThan(0.1);
    const g = { from: { x: 0, y: 0 }, to: { x: 100, y: -50 }, t0: 10, ms: 200 };
    expect(glideAt(g, 10)).toEqual({ x: 0, y: 0, done: false });
    const mid = glideAt(g, 110);
    expect(mid.x).toBeCloseTo(50);
    expect(mid.y).toBeCloseTo(-25);
    expect(glideAt(g, 500)).toEqual({ x: 100, y: -50, done: true });
  });
});

describe("wheel zoom", () => {
  it("steps once per mouse notch, in on wheel up", () => {
    const wheel = new WheelZoom();
    expect(wheel.push(-100, 0, 0)).toBe(1);
    expect(wheel.push(100, 0, 1000)).toBe(-1);
    expect(wheel.push(3, 1, 2000)).toBe(-1);
  });

  it("gathers a trackpad's small deltas and ignores the rest of a flick", () => {
    const wheel = new WheelZoom();
    let steps = 0;
    let t = 0;
    for (let i = 0; i < 12; i += 1) {
      steps += Math.abs(wheel.push(-6, 0, t));
      t += 16;
    }
    expect(steps).toBe(1);
    // The flick goes on during the cooldown: still one step.
    for (; t < 16 * 12 + WHEEL_COOLDOWN_MS - 20; t += 16)
      steps += Math.abs(wheel.push(-6, 0, t));
    expect(steps).toBe(1);
  });
});
