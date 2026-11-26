/**
 * Animated terrain (bead border_marches-bzc.83): the clock, the glints, the
 * magma pulse, the poses of living decorations and the sprite and crack
 * helpers behind them.
 */
import { describe, expect, it } from "vitest";
import { DECORATION_KINDS } from "../../src/data/decorations.ts";
import {
  GROUND_RANK,
  buildGroundLayout,
  openWaterAt,
  paintGround,
} from "../../src/render/map/ground.ts";
import type { GroundSources, PixelImage } from "../../src/render/map/ground.ts";
import {
  CRACK_RIM,
  LIVING_MOTION,
  MOTION,
  cellGlintSlots,
  cellPhase,
  crackOverlay,
  frameDue,
  glintLevel,
  isHot,
  livingPose,
  magmaAlpha,
  spriteParts,
  squashX,
  squashY,
} from "../../src/render/map/terrain-motion.ts";
import type { LivingMotion } from "../../src/render/map/terrain-motion.ts";
import { CELL_PX } from "../../src/assets/manifest.ts";
import type { GroundTerrain } from "../../src/assets/manifest.ts";
import type { GameMap } from "../../src/core/map/types.ts";

function image(
  w: number,
  h: number,
  fill: (x: number, y: number) => readonly number[] | null,
): PixelImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const c = fill(x, y);
      if (c === null) continue;
      data.set([c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 255], (y * w + x) * 4);
    }
  return { width: w, height: h, data };
}

const alpha = (img: PixelImage, x: number, y: number): number =>
  img.data[(y * img.width + x) * 4 + 3] ?? 0;

describe("the animation clock", () => {
  it("throttles frames to the animation's rate", () => {
    expect(MOTION.fps).toBeGreaterThanOrEqual(10);
    expect(MOTION.fps).toBeLessThanOrEqual(15);
    expect(frameDue(0, 10)).toBe(false);
    expect(frameDue(0, 1000 / MOTION.fps)).toBe(true);
    expect(frameDue(500, 500 + 40)).toBe(false);
  });

  it("gives every cell its own phase, the same each time", () => {
    const phases = new Set<number>();
    for (let y = 0; y < 8; y += 1)
      for (let x = 0; x < 8; x += 1) {
        const p = cellPhase(x, y);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThan(1);
        expect(cellPhase(x, y)).toBe(p);
        phases.add(Math.round(p * 1000));
      }
    expect(phases.size).toBeGreaterThan(55);
  });
});

describe("water glints", () => {
  it("keeps every slot inside its cell", () => {
    for (const [cx, cy] of [
      [0, 0],
      [5, 9],
      [40, 3],
    ] as const)
      for (const s of cellGlintSlots(cx, cy)) {
        expect(s.x).toBeGreaterThanOrEqual(cx * CELL_PX);
        expect(s.x + s.len).toBeLessThanOrEqual((cx + 1) * CELL_PX);
        expect(s.y - 1).toBeGreaterThanOrEqual(cy * CELL_PX);
        expect(s.y + 1).toBeLessThan((cy + 1) * CELL_PX);
      }
  });

  it("fades a lit slot in and out, and lights different slots each cycle", () => {
    const slots = cellGlintSlots(3, 4);
    const { periodMs } = MOTION.glint;
    const levels = new Set<number>();
    const litPerCycle: string[] = [];
    for (let cycle = 1; cycle < 9; cycle += 1) {
      const lit = slots.map((s) => {
        let on = false;
        for (let k = 0; k < 20; k += 1) {
          const level = glintLevel(s, (cycle + (k / 20 - s.phase)) * periodMs);
          levels.add(level);
          if (level > 0) on = true;
        }
        return on ? 1 : 0;
      });
      litPerCycle.push(lit.join(""));
    }
    expect([...levels].sort()).toEqual([0, 1, 2]);
    expect(new Set(litPerCycle).size).toBeGreaterThan(2);
  });

  it("stays on open water, clear of the shore", () => {
    // A lake of 5 x 5 cells in grass.
    const n = 9;
    const map: GameMap = {
      width: n,
      height: n,
      seed: 1,
      cells: Array.from({ length: n * n }, (_, i) => {
        const x = i % n;
        const y = Math.floor(i / n);
        const lake = x >= 2 && x <= 6 && y >= 2 && y <= 6;
        return {
          terrain: lake ? "water" : "grass",
          obstacle: "none",
          road: false,
        } as const;
      }),
      objects: [],
    };
    const layout = buildGroundLayout(map);
    const mid = 4.5 * CELL_PX;
    expect(openWaterAt(layout, mid, mid, MOTION.glint.shoreMargin)).toBe(true);
    // On land: no.
    expect(openWaterAt(layout, CELL_PX, CELL_PX, 0)).toBe(false);
    // Across the west shore: closed up to a point past the shore, then
    // open all the way to the middle; a bigger margin starts later.
    const firstOpen = (margin: number): number => {
      let first = -1;
      for (let x = CELL_PX; x < mid; x += 1) {
        const open = openWaterAt(layout, x, mid, margin);
        if (open && first < 0) first = x;
        if (first >= 0) expect(open).toBe(true);
      }
      return first;
    };
    // (The wavering shore may run inside the land cell, up to ~17 px.)
    const near = firstOpen(0);
    expect(near).toBeGreaterThanOrEqual(2 * CELL_PX);
    expect(firstOpen(MOTION.glint.shoreMargin)).toBeGreaterThanOrEqual(near);
    expect(firstOpen(40)).toBeGreaterThan(near + 20);
  });
});

describe("magma", () => {
  it("pulses each group between its low and high glow, out of step", () => {
    const { low, high, periodMs, groups } = MOTION.magma;
    for (let g = 0; g < groups; g += 1)
      for (let t = 0; t < periodMs; t += 97) {
        const a = magmaAlpha(g, t);
        expect(a).toBeGreaterThanOrEqual(low - 1e-9);
        expect(a).toBeLessThanOrEqual(high + 1e-9);
      }
    expect(magmaAlpha(0, 300)).not.toBeCloseTo(magmaAlpha(1, 300), 2);
    expect(magmaAlpha(0, 0)).toBeCloseTo(magmaAlpha(0, periodMs), 6);
  });

  it("knows lava from rock", () => {
    expect(isHot(255, 245, 70)).toBe(true);
    expect(isHot(252, 37, 4)).toBe(true);
    expect(isHot(59, 52, 48)).toBe(false);
    expect(isHot(168, 100, 70)).toBe(false);
  });

  it("keeps whole cracks with a dark rim, groups them, and wraps round", () => {
    // Two long cracks, one across the right edge (wrapping to the left).
    const src = image(40, 40, (x, y) =>
      y === 10 && x >= 5 && x < 20
        ? [255, 133, 19]
        : y === 30 && (x >= 30 || x < 6)
          ? [252, 37, 4]
          : y === 20 && x === 20
            ? [255, 245, 70] // a single hot speck: dropped
            : [60, 50, 48],
    );
    const all = crackOverlay(src, 1);
    expect(all.hot[10 * 40 + 8]).toBeGreaterThan(0);
    expect(all.hot[20 * 40 + 20]).toBe(0);
    // The wrapped crack is one crack: one group on both sides.
    expect(all.hot[30 * 40 + 35]).toBe(all.hot[30 * 40 + 2]);
    expect(alpha(all.image, 8, 11)).toBe(255);
    expect([
      ...all.image.data.slice((11 * 40 + 8) * 4, (11 * 40 + 8) * 4 + 3),
    ]).toEqual([...CRACK_RIM]);
    // Rock is transparent.
    expect(alpha(all.image, 25, 20)).toBe(0);
    for (const g of all.hot) expect(g).toBeLessThanOrEqual(MOTION.magma.groups);
    // keep 0: nothing.
    expect(crackOverlay(src, 0).hot.every((g) => g === 0)).toBe(true);
  });

  it("paints the overlay over the volcanic ground only and flags its hot pixels", () => {
    const n = 4;
    const map: GameMap = {
      width: n,
      height: n,
      seed: 1,
      cells: Array.from({ length: n * n }, (_, i) => ({
        terrain: i % n < 2 ? "grass" : "volcanic",
        obstacle: "none",
        road: false,
      })),
      objects: [],
    };
    const flat = (r: number, g: number, b: number): PixelImage =>
      image(80, 80, () => [r, g, b]);
    const cracks = crackOverlay(
      image(80, 80, (_, y) => (y % 20 === 5 ? [255, 133, 19] : [60, 50, 48])),
      1,
    );
    const sources: GroundSources = {
      textures: Object.fromEntries(
        GROUND_RANK.map((t) => [t, flat(30, 30, 30)]),
      ) as Record<GroundTerrain, PixelImage>,
      overlays: { volcanic: cracks },
      water: { shallow: [flat(0, 0, 200)], deep: [flat(0, 0, 100)] },
    };
    const w = n * CELL_PX;
    const out = new Uint8ClampedArray(w * w * 4);
    const hot = new Uint8Array(w * w);
    paintGround(buildGroundLayout(map), sources, 0, 0, w, w, out, hot);
    const at = (x: number, y: number) => hot[y * w + x] ?? 0;
    expect(at(300, 5)).toBeGreaterThan(0);
    expect(out[(5 * w + 300) * 4]).toBe(255);
    expect(at(20, 5)).toBe(0);
    expect(out[(5 * w + 20) * 4]).toBe(30);
  });
});

describe("living decorations", () => {
  it("names only real passable decorations", () => {
    for (const id of Object.keys(LIVING_MOTION)) {
      const kind = DECORATION_KINDS.find((d) => d.id === id);
      expect(kind?.passable, id).toBe(true);
    }
    expect(LIVING_MOTION["butterflies"]).toBe("flap");
  });

  it("stands still at time 0 and moves at most a pixel or two", () => {
    const motions: LivingMotion[] = [
      "flap",
      "hover",
      "hop",
      "breathe",
      "creep",
      "twitch",
    ];
    for (const m of motions) {
      expect(livingPose(m, 0.3, 0)).toEqual({ dx: 0, dy: 0, frame: 0 });
      const seen = new Set<string>();
      for (let t = 1; t < 9000; t += 37) {
        const p = livingPose(m, 0.3, t);
        expect(Math.abs(p.dx)).toBeLessThanOrEqual(2);
        expect(Math.abs(p.dy)).toBeLessThanOrEqual(2);
        seen.add(JSON.stringify(p));
      }
      expect(seen.size, m).toBeGreaterThan(1);
    }
  });

  it("rolls the desert's tumbleweed a few pixels each way (bead bzc.88)", () => {
    expect(LIVING_MOTION["desert-tumbleweed"]).toBe("roll");
    expect(livingPose("roll", 0.3, 0)).toEqual({ dx: 0, dy: 0, frame: 0 });
    const dx = new Set<number>();
    for (let t = 1; t < 11000; t += 37) {
      const p = livingPose("roll", 0.3, t);
      expect(Math.abs(p.dx)).toBeLessThanOrEqual(3);
      expect(p.dy === 0 || p.dy === -1).toBe(true);
      dx.add(p.dx);
    }
    expect(Math.min(...dx)).toBe(-3);
    expect(Math.max(...dx)).toBe(3);
  });

  it("flaps: both frames, each part and each phase out of step", () => {
    const frames = new Set<number>();
    let apart = 0;
    for (let t = 1; t < 2000; t += 20) {
      const a = livingPose("flap", 0.1, t, 0);
      const b = livingPose("flap", 0.1, t, 1);
      const c = livingPose("flap", 0.6, t, 0);
      frames.add(a.frame);
      if (a.frame !== b.frame || a.frame !== c.frame) apart += 1;
    }
    expect([...frames].sort()).toEqual([0, 1]);
    expect(apart).toBeGreaterThan(10);
  });

  it("splits a sprite into its creatures", () => {
    // Two blobs and a speck next to the first.
    const sprite = image(20, 10, (x, y) =>
      (x >= 1 && x <= 4 && y >= 1 && y <= 4) ||
      (x >= 12 && x <= 17 && y >= 3 && y <= 8) ||
      (x === 6 && y === 2)
        ? [200, 120, 40]
        : null,
    );
    const parts = spriteParts(sprite);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({ x: 1, y: 1 });
    expect(parts[0]?.image.width).toBe(6); // the speck joined it
    expect(parts[1]).toMatchObject({ x: 12, y: 3 });
  });

  it("folds wings toward the middle and breathes a pixel", () => {
    const wings = image(9, 3, () => [10, 20, 30]);
    const folded = squashX(wings, 0.5);
    expect(folded.width).toBe(9);
    expect(alpha(folded, 4, 1)).toBe(255);
    expect(alpha(folded, 0, 1)).toBe(0);
    expect(alpha(folded, 8, 1)).toBe(0);
    const tall = image(4, 6, (_, y) => [y * 10, 0, 0]);
    const out = squashY(tall);
    expect(alpha(out, 0, 0)).toBe(0);
    // The foot row stays where it was.
    expect(out.data[(5 * 4 + 0) * 4]).toBe(50);
  });
});
