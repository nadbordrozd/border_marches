/**
 * Mountain ranges as a crowd of front-view peaks (bead border_marches-xaj.30):
 * placement is deterministic, peaks obey the height cap, feet keep off roads,
 * objects, entrances and water, and the sprites really close a range.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { CELL_PX, GROUND_TERRAINS } from "../../src/assets/manifest.ts";
import type { GroundTerrain } from "../../src/assets/manifest.ts";
import {
  PEAK_ASSETS,
  PEAK_BORROW,
  PEAK_FAMILY,
  peaksOf,
} from "../../src/assets/peaks.ts";
import { createMap } from "../../src/core/map/types.ts";
import type { GameMap, MapObject } from "../../src/core/map/types.ts";
import { generateMap } from "../../src/core/map/generate.ts";
import { canopyBands, treeRow } from "../../src/render/map/canopy.ts";
import {
  PEAKS,
  buildPeakField,
  paintPeakUnder,
  peakDepth,
  placePeaks,
  rangeTop,
} from "../../src/render/map/peaks.ts";
import type { PeakField, PlacedPeak } from "../../src/render/map/peaks.ts";
import { PEAK_SPRITES, featuredCells } from "../../src/render/map/scene.ts";
import { toneRgba } from "../../src/render/map/peak-paint.ts";

const CELL = CELL_PX;
const PUBLIC = join(import.meta.dirname, "..", "..", "public");

/** Alpha of a baked studio PNG (8-bit RGBA, filter 0 rows). */
function alphaOf(path: string): { w: number; h: number; alpha: Uint8Array } {
  const file = readFileSync(join(PUBLIC, path));
  let at = 8;
  let w = 0;
  let h = 0;
  const idat: Buffer[] = [];
  while (at < file.length) {
    const length = file.readUInt32BE(at);
    const type = file.subarray(at + 4, at + 8).toString("latin1");
    const data = file.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
    } else if (type === "IDAT") idat.push(data);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const alpha = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1)
      alpha[y * w + x] = raw[y * (w * 4 + 1) + 1 + x * 4 + 3] ?? 0;
  return { w, h, alpha };
}

const MASKS = new Map(PEAK_ASSETS.map((p) => [p.key, alphaOf(p.path)]));

function rangeMap(rows: readonly string[], terrain: GroundTerrain): GameMap {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const map = createMap(width, height, 7);
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      const cell = map.cells[y * width + x]!;
      cell.terrain = c === "~" ? "water" : terrain;
      if (c === "M") cell.obstacle = "mountain";
      if (c === "#") cell.road = true;
    }),
  );
  return map;
}

const RANGE = [
  "................",
  "...MMMMMMMM.....",
  "..MMMMMMMMMMM...",
  "..MMMMMMMMMMMM..",
  "...MMMMMMMMMM#..",
  "....MMMMMMM.~#..",
  "............~#..",
  "................",
];

const place = (map: GameMap, objects: readonly MapObject[] = []) =>
  placePeaks(buildPeakField(map, featuredCells(map, objects)), PEAK_SPRITES);

/** Share of deep range pixels the sprites alone cover. */
function coverage(field: PeakField, peaks: readonly PlacedPeak[]): number {
  const W = field.width * CELL;
  const H = field.height * CELL;
  const painted = new Uint8Array(W * H);
  for (const peak of peaks) {
    const mask = MASKS.get(peak.key)!;
    for (let y = 0; y < mask.h; y += 1)
      for (let x = 0; x < mask.w; x += 1)
        if (mask.alpha[y * mask.w + x] !== 0)
          painted[(peak.y + y) * W + peak.x + x] = 1;
  }
  let inside = 0;
  let covered = 0;
  for (let y = 0; y < H; y += 2)
    for (let x = 0; x < W; x += 2) {
      if (peakDepth(field, x, y) < PEAKS.underInset) continue;
      if (
        field.rock[
          Math.floor(y / CELL) * field.width + Math.floor(x / CELL)
        ] !== 1
      )
        continue;
      inside += 1;
      covered += painted[y * W + x] ?? 0;
    }
  return covered / inside;
}

describe("peak assets", () => {
  it("gives every ground all three tiers", () => {
    for (const terrain of GROUND_TERRAINS)
      for (const tier of ["foothill", "peak", "summit"] as const)
        expect(
          peaksOf(terrain).filter((p) => p.tier === tier).length,
          `${terrain} ${tier}`,
        ).toBeGreaterThanOrEqual(3);
  });

  it("match the sizes in the table, with paint on the foot row", () => {
    for (const asset of PEAK_ASSETS) {
      const mask = MASKS.get(asset.key)!;
      expect([mask.w, mask.h], asset.key).toEqual([asset.w, asset.h]);
      const foot = mask.alpha.subarray((mask.h - 1) * mask.w);
      expect(
        foot.some((a) => a !== 0),
        asset.key,
      ).toBe(true);
    }
  });
});

describe("massifs (bead xaj.32)", () => {
  const FAMILIES = [
    "grass",
    "jungle",
    "steppe",
    "badlands",
    "wasteland",
    "snow",
    "sand",
    // Bead bzc.140: the candy, swamp and volcanic ranges.
    "frosting",
    "swamp",
    "volcanic",
  ] as const;

  it("gives every family its big forms", () => {
    for (const terrain of FAMILIES)
      expect(
        peaksOf(terrain).filter((p) => p.tier === "massif").length,
        terrain,
      ).toBeGreaterThanOrEqual(3);
  });

  it("stands every massif wholly on the range", () => {
    for (const terrain of FAMILIES) {
      const map = rangeMap(RANGE, terrain);
      const field = buildPeakField(map);
      const massifs = placePeaks(field, PEAK_SPRITES).filter((p) =>
        p.key.includes("-massif-"),
      );
      expect(massifs.length, terrain).toBeGreaterThan(0);
      for (const peak of massifs) {
        const inset = Math.max(4, Math.round(peak.w * 0.14));
        for (let x = peak.x + inset; x <= peak.x + peak.w - 1 - inset; x += 4) {
          const i =
            Math.floor((peak.baseY - 3) / CELL) * map.width +
            Math.floor(x / CELL);
          expect(field.rock[i], peak.key).toBe(1);
        }
      }
    }
  });

  it("paints a massif's foot without the outline, a peak's with it", () => {
    // A 4 x 4 green block outlined in black on all sides.
    const image = (): Uint8ClampedArray => {
      const px = new Uint8ClampedArray(4 * 4 * 4);
      for (let y = 0; y < 4; y += 1)
        for (let x = 0; x < 4; x += 1) {
          const edge = x === 0 || y === 0 || x === 3 || y === 3;
          px.set(edge ? [0, 0, 0, 255] : [120, 180, 90, 255], (y * 4 + x) * 4);
        }
      return px;
    };
    const grey = (px: Uint8ClampedArray, x: number, y: number): number => {
      const o = (y * 4 + x) * 4;
      return 0.3 * px[o]! + 0.59 * px[o + 1]! + 0.11 * px[o + 2]!;
    };
    const massif = image();
    toneRgba(massif, 4, 4, "grass", "massif");
    const peak = image();
    toneRgba(peak, 4, 4, "grass", "peak");
    // The foot row: open on the massif, a dark line on the peak.
    for (const x of [1, 2]) {
      expect(grey(massif, x, 3)).toBeGreaterThan(100);
      expect(grey(peak, x, 3)).toBeLessThan(60);
    }
    // The top keeps its line on both.
    expect(grey(massif, 1, 0)).toBeLessThan(100);
  });

  it("opens the level top edge of a low skirt in the foot band (bead bzc.140)", () => {
    // 4 x 6: transparent above, a dark line along the skirt's top (row 3),
    // pale icing below it.
    const px = new Uint8ClampedArray(4 * 6 * 4);
    for (let x = 0; x < 4; x += 1) {
      px.set([20, 10, 20, 255], (3 * 4 + x) * 4);
      for (const y of [4, 5]) px.set([250, 214, 222, 255], (y * 4 + x) * 4);
    }
    toneRgba(px, 4, 6, "frosting", "massif");
    for (let x = 0; x < 4; x += 1) {
      const o = (3 * 4 + x) * 4;
      expect(
        0.3 * px[o]! + 0.59 * px[o + 1]! + 0.11 * px[o + 2]!,
      ).toBeGreaterThan(180);
    }
  });

  it("gives volcanic ranges their own massifs and the wasteland's small tiers", () => {
    const peaks = peaksOf("volcanic");
    expect(
      peaks
        .filter((p) => p.tier === "massif")
        .every((p) => p.terrain === "volcanic"),
    ).toBe(true);
    for (const tier of ["foothill", "peak", "summit"] as const)
      expect(
        peaks.filter((p) => p.tier === tier && p.terrain === "wasteland")
          .length,
        tier,
      ).toBeGreaterThan(0);
    // The wasteland keeps its own massifs.
    expect(peaksOf("wasteland").every((p) => p.terrain === "wasteland")).toBe(
      true,
    );
  });

  it("builds a range from fewer sprites, the massifs first", () => {
    const peaks = place(rangeMap(RANGE, "grass"));
    const area = (key: string): number =>
      peaks
        .filter((p) => p.key.includes(key))
        .reduce((sum, p) => sum + p.w * p.h, 0);
    // The big forms carry most of the range's paint.
    expect(area("-massif-")).toBeGreaterThan(area("-foothill-"));
    expect(area("-massif-")).toBeGreaterThan(area("-peak-"));
  });
});

describe("peak placement", () => {
  it("is deterministic and dense", () => {
    const map = rangeMap(RANGE, "steppe");
    const a = place(map);
    expect(place(map)).toEqual(a);
    expect(a.length).toBeGreaterThan(60);
  });

  it("uses the family of the ground under each foot", () => {
    for (const terrain of GROUND_TERRAINS) {
      const peaks = place(rangeMap(RANGE, terrain));
      expect(peaks.length).toBeGreaterThan(0);
      // Volcanic ground borrows the wasteland's basalt (bead bzc.83) for
      // all but its own massifs (bead bzc.140); the desert sand has its own
      // sandstone (bead bzc.88), the frosting its gumdrop hills (bead
      // bzc.115).
      const family = PEAK_FAMILY[terrain];
      const lender = PEAK_BORROW[family];
      for (const peak of peaks)
        expect(
          peak.key.startsWith(`peak-${family}-`) ||
            (lender !== undefined &&
              peak.key.startsWith(`peak-${lender}-`) &&
              !peak.key.includes("-massif-")),
          peak.key,
        ).toBe(true);
    }
  });

  it("caps every peak at 40 px above the top of the range", () => {
    for (const seed of [11, 12, 13]) {
      const map = generateMap(seed, { size: "S" });
      const field = buildPeakField(map, featuredCells(map, map.objects));
      for (const peak of placePeaks(field, PEAK_SPRITES)) {
        const row = Math.floor((peak.baseY - 1) / CELL);
        for (const x of [
          peak.x + 3,
          peak.x + (peak.w >> 1),
          peak.x + peak.w - 4,
        ])
          expect(peak.y).toBeGreaterThanOrEqual(
            rangeTop(field, Math.floor(x / CELL), row) - PEAKS.capPx,
          );
      }
    }
  });

  it("keeps every foot off roads, objects, entrances and water", () => {
    const map = rangeMap(RANGE, "grass");
    const mine: MapObject = {
      id: "mine-1",
      kind: "mine",
      x: 7,
      y: 6,
      footprint: { w: 1, h: 1 },
      blocked: [[7, 5]],
      data: { resource: "ore" },
    };
    const field = buildPeakField(map, featuredCells(map, [mine]));
    const peaks = placePeaks(field, PEAK_SPRITES);
    const free = (wx: number, wy: number): boolean => {
      const i = Math.floor(wy / CELL) * map.width + Math.floor(wx / CELL);
      return field.rock[i] === 1 || field.open[i] === 1;
    };
    for (const peak of peaks) {
      const inset = Math.max(4, Math.round(peak.w * 0.14));
      for (const x of [peak.x + inset, peak.baseX, peak.x + peak.w - 1 - inset])
        expect(free(x, peak.baseY - 3), peak.key).toBe(true);
    }
  });

  it("closes a range with sprites alone", () => {
    for (const terrain of GROUND_TERRAINS) {
      const map = rangeMap(RANGE, terrain);
      const field = buildPeakField(map);
      const share = coverage(field, placePeaks(field, PEAK_SPRITES));
      expect(share, terrain).toBeGreaterThan(0.97);
    }
  });

  it("never stands two copies of a sprite close together", () => {
    for (const terrain of GROUND_TERRAINS) {
      const peaks = place(rangeMap(RANGE, terrain));
      for (const [i, a] of peaks.entries())
        for (const b of peaks.slice(i + 1))
          if (a.key === b.key)
            expect(
              Math.hypot(a.baseX - b.baseX, a.baseY - b.baseY),
              a.key,
            ).toBeGreaterThanOrEqual(PEAKS.repeatMinPx);
    }
  });

  it("puts what rises above a row into crown bands of that row", () => {
    const peaks = place(rangeMap(RANGE, "steppe"));
    const bands = canopyBands(peaks);
    const rising = peaks.filter((p) => p.y < treeRow(p) * CELL);
    expect(rising.length).toBeGreaterThan(0);
    for (const peak of rising) {
      const row = treeRow(peak);
      const holding = bands.filter(
        (b) => b.row === row && b.trees.includes(peak),
      );
      expect(holding.length, peak.key).toBeGreaterThan(0);
      for (const band of holding) expect(band.y + band.h).toBe(row * CELL);
    }
  });

  it("paints the underlay only on rock, inside the outline", () => {
    const map = rangeMap(RANGE, "badlands");
    const field = buildPeakField(map);
    const w = map.width * CELL;
    const h = map.height * CELL;
    const data = new Uint8ClampedArray(w * h * 4);
    expect(paintPeakUnder(field, 0, 0, w, h, data)).toBe(true);
    for (let y = 0; y < h; y += 2)
      for (let x = 0; x < w; x += 2) {
        if (data[(y * w + x) * 4 + 3] === 0) continue;
        const i = Math.floor(y / CELL) * map.width + Math.floor(x / CELL);
        expect(field.rock[i]).toBe(1);
        expect(peakDepth(field, x + 1, y + 1)).toBeGreaterThanOrEqual(
          PEAKS.underInset,
        );
      }
  });
});
