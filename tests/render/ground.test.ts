import { describe, expect, it } from "vitest";
import {
  BIT_N,
  BIT_NE,
  BIT_W,
  GROUND_CALM,
  buildGroundLayout,
  calmTexture,
  cellField,
  coastAt,
  edgeDistance,
  GROUND_RANK,
  paintGround,
  spillReach,
  SPILL,
} from "../../src/render/map/ground.ts";
import type { GroundSources, PixelImage } from "../../src/render/map/ground.ts";
import { paintFog } from "../../src/render/map/fog.ts";
import { createMap } from "../../src/core/map/types.ts";
import type { GroundTerrain } from "../../src/assets/manifest.ts";

/** A flat 80 x 80 raster of one colour. */
const flat = (r: number, g: number, b: number): PixelImage => {
  const data = new Uint8ClampedArray(80 * 80 * 4);
  for (let i = 0; i < data.length; i += 4) data.set([r, g, b, 255], i);
  return { width: 80, height: 80, data };
};

const COLOURS: Record<GroundTerrain, [number, number, number]> = {
  grass: [10, 200, 10],
  steppe: [200, 200, 10],
  jungle: [10, 120, 10],
  badlands: [200, 80, 10],
  wasteland: [80, 80, 80],
  volcanic: [40, 20, 20],
  snow: [230, 236, 242],
};

const SOURCES: GroundSources = {
  textures: Object.fromEntries(
    GROUND_RANK.map((t) => [t, flat(...COLOURS[t])]),
  ) as Record<GroundTerrain, PixelImage>,
  water: { shallow: [flat(140, 210, 220)], deep: [flat(60, 120, 165)] },
};

const pixel = (out: Uint8ClampedArray, w: number, x: number, y: number) =>
  Array.from(out.subarray((y * w + x) * 4, (y * w + x) * 4 + 3));

describe("distance fields", () => {
  it("measures to edges and corners", () => {
    expect(edgeDistance(BIT_N, 10, 7)).toBe(7);
    expect(edgeDistance(BIT_W | BIT_N, 3, 7)).toBe(3);
    expect(edgeDistance(BIT_NE, 77, 4)).toBeCloseTo(5);
    expect(edgeDistance(0, 10, 10)).toBe(Infinity);
  });

  it("keeps the spill strip within its waves", () => {
    const sum = SPILL.waves.reduce((a, b) => a + b, 0);
    for (let i = 0; i < 500; i += 1) {
      const r = spillReach(i * 7.3, i * 3.1);
      expect(r).toBeGreaterThanOrEqual(SPILL.width - sum - 1e-9);
      expect(r).toBeLessThanOrEqual(SPILL.width + sum + 1e-9);
    }
  });

  it("puts sand on the land side of the shore and surf on the water side", () => {
    expect(coastAt(true, 0.5, 10, 10)).toBe("wet");
    expect(coastAt(true, 30, 10, 10)).toBe("none");
    expect(["wet", "surf"]).toContain(coastAt(false, 0.2, 10, 10));
    expect(coastAt(false, 40, 10, 10)).toBe("none");
  });

  it("interpolates a smooth field whose 0.5 contour is the cell edge", () => {
    const values = [1, 0];
    expect(cellField(values, 2, 1, 80, 40).f).toBeCloseTo(0.5);
    expect(cellField(values, 2, 1, 40, 40).f).toBeCloseTo(1);
    // A lone land cell's corner is cut: f < 0.5 at its corner point.
    const lone = [0, 0, 0, 1];
    expect(cellField(lone, 2, 2, 80, 80).f).toBeLessThan(0.5);
  });
});

describe("paintGround", () => {
  it("never draws a straight border between two grounds", () => {
    const map = createMap(4, 4, 1, "grass");
    for (let y = 0; y < 4; y += 1)
      for (let x = 2; x < 4; x += 1)
        map.cells[y * 4 + x]!.terrain = "wasteland";
    const layout = buildGroundLayout(map);
    const out = new Uint8ClampedArray(320 * 320 * 4);
    paintGround(layout, SOURCES, 0, 0, 320, 320, out);
    const edges = new Set<number>();
    for (let y = 40; y < 280; y += 1) {
      let x = 0;
      while (x < 320 && pixel(out, 320, x, y)[0] === COLOURS.grass[0]) x += 1;
      edges.add(x);
    }
    // The darker ground runs into the lighter one and the border wanders.
    expect(Math.min(...edges)).toBeLessThan(160);
    expect(edges.size).toBeGreaterThan(5);
  });

  it("is a pure function of world coordinates (chunks agree)", () => {
    const map = createMap(4, 4, 1, "grass");
    map.cells[5]!.terrain = "water";
    map.cells[6]!.terrain = "jungle";
    map.cells[9]!.obstacle = "forest";
    map.cells[1]!.road = true;
    map.cells[2]!.road = true;
    const layout = buildGroundLayout(map);
    const whole = new Uint8ClampedArray(320 * 320 * 4);
    paintGround(layout, SOURCES, 0, 0, 320, 320, whole);
    const part = new Uint8ClampedArray(100 * 90 * 4);
    paintGround(layout, SOURCES, 130, 70, 100, 90, part);
    for (const [x, y] of [
      [0, 0],
      [55, 33],
      [99, 89],
    ] as const)
      expect(pixel(part, 100, x, y)).toEqual(
        pixel(whole, 320, 130 + x, 70 + y),
      );
  });

  it("rounds a lone water cell into a pond with a sand rim", () => {
    const map = createMap(3, 3, 1, "grass");
    map.cells[4]!.terrain = "water";
    const out = new Uint8ClampedArray(240 * 240 * 4);
    paintGround(buildGroundLayout(map), SOURCES, 0, 0, 240, 240, out);
    // The centre is water; the cell's corner is not (convex water corner).
    expect(pixel(out, 240, 120, 120)).toEqual([140, 210, 220]);
    expect(pixel(out, 240, 81, 81)).not.toEqual([140, 210, 220]);
    // Sand somewhere on the straight shore line.
    let sand = false;
    for (let x = 40; x < 120; x += 1)
      if (pixel(out, 240, x, 120)[0] === 228) sand = true;
    expect(sand).toBe(true);
  });
});

describe("paintFog", () => {
  it("fills unexplored cells and leaves explored ground far from fog clear", () => {
    const w = 6;
    const explored = (x: number): boolean => x < 4;
    const out = new Uint8ClampedArray(480 * 80 * 4);
    expect(paintFog(explored, w, 1, 0, 0, 480, 80, out)).toBe(true);
    const alpha = (x: number, y: number): number => out[(y * 480 + x) * 4 + 3]!;
    expect(alpha(400, 40)).toBe(255);
    expect(alpha(100, 40)).toBe(0);
    // The edge reaches a little into the explored cell next to the fog.
    let covered = false;
    for (let x = 300; x < 320; x += 1) if (alpha(x, 40) === 255) covered = true;
    expect(covered).toBe(true);
  });

  it("returns false where nothing is fog", () => {
    const out = new Uint8ClampedArray(80 * 80 * 4);
    expect(paintFog(() => true, 4, 4, 0, 0, 80, 80, out)).toBe(false);
  });
});

describe("mountain cells (xaj.29)", () => {
  it("paint as their own ground: the peaks draw the rock, not the ground", () => {
    const map = createMap(5, 5, 1, "wasteland");
    map.cells.forEach((c) => (c.obstacle = "mountain"));
    const out = new Uint8ClampedArray(240 * 240 * 4);
    paintGround(buildGroundLayout(map), SOURCES, 0, 0, 240, 240, out);
    for (const [x, y] of [
      [0, 0],
      [120, 120],
      [239, 17],
    ] as const)
      expect(pixel(out, 240, x, y)).toEqual(COLOURS.wasteland);
  });
});

describe("calmed ground textures (bead xaj.27)", () => {
  // A 64 x 64 texture: a slow light/dark patch plus a fine checker.
  const size = 64;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const slow = 40 * Math.sin((2 * Math.PI * x) / size);
      const fine = (x + y) % 2 === 0 ? 20 : -20;
      const o = (y * size + x) * 4;
      data[o] = 150 + slow + fine;
      data[o + 1] = 130 + slow + fine;
      data[o + 2] = 80 + slow + fine;
      data[o + 3] = 255;
    }
  const image = { width: size, height: size, data };
  const calm = calmTexture(image, {
    radius: 6,
    flatten: 0.85,
    contrast: 0.8,
    dark: 0.6,
  });
  const red = (img: PixelImage, x: number, y: number): number =>
    img.data[(y * size + x) * 4] ?? 0;
  const mean = (img: PixelImage): number => {
    let sum = 0;
    for (let p = 0; p < size * size; p += 1) sum += img.data[p * 4] ?? 0;
    return sum / (size * size);
  };

  it("calms the steppe only", () => {
    expect(Object.keys(GROUND_CALM)).toEqual(["steppe"]);
  });

  it("keeps the size, alpha and mean colour", () => {
    expect(calm.width).toBe(size);
    expect(calm.height).toBe(size);
    expect(calm.data[3]).toBe(255);
    expect(Math.abs(mean(calm) - mean(image))).toBeLessThan(3);
  });

  it("flattens the slow patches and softens the fine detail", () => {
    // Slow: the light and dark quarter columns move toward each other.
    const slow = (img: PixelImage): number =>
      Math.abs(red(img, size / 4, 0) - red(img, (3 * size) / 4, 0));
    expect(slow(calm)).toBeLessThan(slow(image) * 0.4);
    // Fine: the checker survives, quieter.
    const fine = (img: PixelImage): number =>
      Math.abs(red(img, 0, 0) - red(img, 1, 0));
    expect(fine(calm)).toBeGreaterThan(10);
    expect(fine(calm)).toBeLessThan(fine(image));
  });

  it("stays tileable", () => {
    const step = (img: PixelImage, y: number): number =>
      Math.abs(red(img, size - 1, y) - red(img, 0, y));
    for (const y of [0, 17, 40])
      expect(step(calm, y)).toBeLessThanOrEqual(step(image, y) + 1);
  });
});
