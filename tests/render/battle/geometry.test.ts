import { describe, expect, it } from "vitest";
import {
  BATTLE_HEX_COUNT,
  hexFromIndex,
  neighbors,
} from "../../../src/core/battle/index.ts";
import {
  FIELD_X,
  FIELD_Y,
  HEX_SIZE,
  HEX_W,
  STAGE_H,
  STAGE_W,
  feetPoint,
  fitZoom,
  hexCorners,
  hexToStage,
  stageToHex,
} from "../../../src/render/battle/geometry.ts";

describe("battle hex geometry", () => {
  it("every hex centre hits its own hex", () => {
    for (let i = 0; i < BATTLE_HEX_COUNT; i++) {
      const h = hexFromIndex(i);
      expect(stageToHex(hexToStage(h))).toEqual(h);
    }
  });

  it("points inside a hex (to 90% of the inner radius) hit it", () => {
    const inner = (HEX_W / 2) * 0.9;
    for (const h of [hexFromIndex(0), hexFromIndex(16), hexFromIndex(97)]) {
      const c = hexToStage(h);
      for (let k = 0; k < 12; k++) {
        const a = (Math.PI * 2 * k) / 12;
        const p = {
          x: c.x + inner * Math.cos(a),
          y: c.y + inner * Math.sin(a),
        };
        expect(stageToHex(p)).toEqual(h);
      }
    }
  });

  it("neighbours are one hex width apart and odd rows shift right", () => {
    const h = { col: 7, row: 5 };
    const c = hexToStage(h);
    for (const n of neighbors(h)) {
      const d = hexToStage(n);
      expect(Math.hypot(d.x - c.x, d.y - c.y)).toBeCloseTo(HEX_W, 6);
    }
    expect(
      hexToStage({ col: 0, row: 1 }).x - hexToStage({ col: 0, row: 0 }).x,
    ).toBeCloseTo(HEX_W / 2, 6);
  });

  it("corners sit one radius out; points off the field are null", () => {
    expect(stageToHex({ x: FIELD_X - 5, y: FIELD_Y + HEX_SIZE })).toBeNull();
    expect(stageToHex({ x: 1, y: 1 })).toBeNull();
    expect(stageToHex({ x: STAGE_W - 1, y: STAGE_H - 1 })).toBeNull();
    const corners = hexCorners({ col: 3, row: 3 });
    expect(corners).toHaveLength(6);
    const c = hexToStage({ col: 3, row: 3 });
    for (const p of corners) {
      expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeCloseTo(HEX_SIZE, 6);
    }
  });

  it("the whole field and the heads of row 0 fit on the stage", () => {
    for (let i = 0; i < BATTLE_HEX_COUNT; i++) {
      const f = feetPoint(hexFromIndex(i));
      // A giant sprite stands 98 px tall over its feet.
      expect(f.y - 98).toBeGreaterThan(-60);
      expect(f.x).toBeGreaterThan(0);
      expect(f.x).toBeLessThan(STAGE_W);
      expect(f.y).toBeLessThan(STAGE_H);
    }
  });
});

describe("fitZoom", () => {
  it("uses whole device pixels when the stage fits", () => {
    expect(fitZoom(STAGE_W, STAGE_H)).toBe(1);
    expect(fitZoom(STAGE_W * 2.7, STAGE_H * 3)).toBe(2);
    expect(fitZoom(STAGE_W * 1.6, STAGE_H * 1.6, 2)).toBe(1.5);
  });

  it("falls back to a fractional fit in a small window", () => {
    expect(fitZoom(STAGE_W * 0.8, STAGE_H)).toBeCloseTo(0.8, 6);
    expect(fitZoom(10, 10)).toBe(0.25);
  });
});
