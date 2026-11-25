// The adventure map's action cursors (UI2-07, bead bzc.58): drawn in code
// from palette masks, 32x32 with the hotspot in the middle, and a plain CSS
// keyword when no canvas is there (the unit tier).
import { describe, expect, it } from "vitest";
import {
  CURSOR_FALLBACK,
  CURSOR_KINDS,
  CURSOR_MASKS,
  CURSOR_PALETTES,
  CURSOR_PX,
  MASK_SIZE,
  cursorPixels,
  cursorStyle,
} from "../../src/ui/cursors.ts";
import { OUTLINE } from "../../src/render/fx/pixels.ts";

describe("cursor masks", () => {
  it("are 14x14 grids of palette digits with something drawn", () => {
    for (const kind of CURSOR_KINDS) {
      const mask = CURSOR_MASKS[kind];
      expect(mask, kind).toHaveLength(MASK_SIZE);
      for (const row of mask) {
        expect(row, kind).toHaveLength(MASK_SIZE);
        expect(row, kind).toMatch(/^[.1-5]+$/);
      }
      expect(mask.join("").replace(/\./g, "").length, kind).toBeGreaterThan(20);
      expect(CURSOR_PALETTES[kind], kind).toHaveLength(5);
    }
  });

  it("differ from each other (walk-later adds a moon to the boot)", () => {
    const seen = new Set(CURSOR_KINDS.map((k) => CURSOR_MASKS[k].join("|")));
    expect(seen.size).toBe(CURSOR_KINDS.length);
  });

  it("paint into 16x16 with an outline round the shape", () => {
    const px = cursorPixels("blocked");
    expect(px).toHaveLength(MASK_SIZE + 2);
    expect(px.every((row) => row.length === MASK_SIZE + 2)).toBe(true);
    expect(px.flat()).toContain(OUTLINE);
    // The border row is outline or empty, never a fill colour.
    expect(px[0]?.every((c) => c === null || c === OUTLINE)).toBe(true);
    expect(CURSOR_PX).toBe(32);
  });
});

describe("cursorStyle", () => {
  it("falls back to a CSS keyword without a canvas", () => {
    expect(cursorStyle("pickup")).toBe("grab");
    expect(cursorStyle("blocked")).toBe("not-allowed");
    expect(cursorStyle("none")).toBe("default");
    for (const kind of CURSOR_KINDS)
      expect(cursorStyle(kind)).toBe(CURSOR_FALLBACK[kind]);
  });
});
