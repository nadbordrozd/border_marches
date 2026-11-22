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
import { PEAK_ASSETS, peaksOf } from "../../src/assets/peaks.ts";
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
      for (const peak of peaks)
        expect(peak.key.startsWith(`peak-${terrain}-`), peak.key).toBe(true);
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
