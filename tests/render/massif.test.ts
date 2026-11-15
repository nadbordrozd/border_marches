import { describe, expect, it } from "vitest";
import {
  LANDMARK_SPRITE_REACH,
  OPEN_RISE_MAX,
  riseAt,
  TABLE_CUT,
  cutRun,
  isLandmark,
  packRanges,
  paletteOf,
} from "../../src/render/map/massif.ts";
import type { RangeCover, RangePiece } from "../../src/render/map/massif.ts";
import { massifEntries } from "../../src/render/map/scene.ts";
import { createMap } from "../../src/core/map/types.ts";
import type { GameMap, Terrain } from "../../src/core/map/types.ts";
import { generateMap } from "../../src/core/map/generate.ts";

/** A map from rows of "M" (mountain) and "." over one ground. */
function mapOf(rows: readonly string[], ground: Terrain = "grass"): GameMap {
  const map = createMap(rows[0]!.length, rows.length, 1);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const cell = map.cells[y * map.width + x]!;
      cell.terrain = ground;
      if (ch === "M") cell.obstacle = "mountain";
    }),
  );
  return map;
}

const cellsOf = (p: RangePiece): [number, number][] => {
  const out: [number, number][] = [];
  for (let r = 0; r < p.asset.rows; r += 1)
    for (let c = 0; c < p.asset.cols; c += 1) out.push([p.x + c, p.y + r]);
  return out;
};

function expectExactCover(map: GameMap, cover: RangeCover): void {
  const seen = new Map<number, number>();
  for (const p of cover.pieces)
    for (const [x, y] of cellsOf(p)) {
      const i = y * map.width + x;
      expect(map.cells[i]?.obstacle).toBe("mountain");
      seen.set(i, (seen.get(i) ?? 0) + 1);
    }
  const mountains = map.cells.filter((c) => c.obstacle === "mountain").length;
  expect(seen.size).toBe(mountains);
  for (const n of seen.values()) expect(n).toBe(1);
}

const BLOCK = [
  "............",
  "..MMMMMMMM..",
  ".MMMMMMMMMM.",
  ".MMMMMMMMMM.",
  "..MMMMMMMM..",
  "...MMMMMM...",
  "............",
];

describe("packRanges", () => {
  it("covers every mountain cell exactly once", () => {
    for (const rows of [
      BLOCK,
      ["M.M.M", ".M.M.", "MMMMM"],
      ["MM...", ".MM..", "..MM.", "...MM"],
      ["M", "M", "M", "M"],
      ["MM", "MM", "MM", "MM", "MM"],
    ]) {
      const map = mapOf(rows);
      expectExactCover(map, packRanges(map));
    }
    for (const seed of [1, 2, 3]) {
      const map = generateMap(seed, { size: "M" });
      expectExactCover(map, packRanges(map));
    }
  });

  it("is deterministic", () => {
    const map = generateMap(5, { size: "M" });
    expect(packRanges(map)).toEqual(packRanges(map));
  });

  it("tiles a solid range with massifs and ridges, not one piece", () => {
    const map = mapOf(BLOCK);
    const cover = packRanges(map);
    const kinds = new Set(cover.pieces.map((p) => p.asset.kind));
    expect(kinds.has("massif")).toBe(true);
    expect(cover.pieces.some((p) => p.asset.cols === 3)).toBe(true);
    // No two touching pieces are the same sprite.
    for (const a of cover.pieces)
      for (const b of cover.pieces) {
        if (a === b || a.asset.key !== b.asset.key) continue;
        const touch = cellsOf(a).some(([ax, ay]) =>
          cellsOf(b).some(
            ([bx, by]) => Math.abs(ax - bx) + Math.abs(ay - by) === 1,
          ),
        );
        expect(touch).toBe(false);
      }
  });

  it("takes the palette of the range's ground and never mixes palettes in a piece", () => {
    const desert = packRanges(mapOf(BLOCK, "badlands"));
    for (const p of desert.pieces) expect(p.asset.palette).toBe("sandstone");
    const ash = packRanges(mapOf(BLOCK, "wasteland"));
    for (const p of ash.pieces) expect(p.asset.palette).toBe("basalt");
    expect(paletteOf("jungle")).toBe("granite");
    // A long range half on grass, half on wasteland.
    const map = mapOf([
      "..................",
      ".MMMMMMMMMMMMMMMM.",
      ".MMMMMMMMMMMMMMMM.",
      "..................",
    ]);
    map.cells.forEach((c, i) => {
      if (i % map.width >= 9) c.terrain = "wasteland";
    });
    const cover = packRanges(map);
    const palettes = new Set(cover.pieces.map((p) => p.asset.palette));
    expect(palettes).toEqual(new Set(["granite", "basalt"]));
    for (const p of cover.pieces)
      for (const [x, y] of cellsOf(p))
        expect(cover.palette.get(y * map.width + x)).toBe(p.asset.palette);
  });

  it("changes palette only through low pieces at the seam (xaj.19)", () => {
    const map = mapOf([
      "..................",
      ".MMMMMMMMMMMMMMMM.",
      ".MMMMMMMMMMMMMMMM.",
      ".MMMMMMMMMMMMMMMM.",
      "..................",
    ]);
    map.cells.forEach((c, i) => {
      if (i % map.width >= 9) c.terrain = "wasteland";
    });
    const cover = packRanges(map);
    const tall = new Set(["massif", "ridge", "peak", "spine"]);
    for (const p of cover.pieces) {
      const seam = cellsOf(p).some(([x, y]) =>
        [-1, 0, 1].some((dy) =>
          [-1, 0, 1].some((dx) => {
            const other = cover.palette.get((y + dy) * map.width + x + dx);
            return other !== undefined && other !== p.asset.palette;
          }),
        ),
      );
      if (seam) expect(tall.has(p.asset.kind)).toBe(false);
    }
  });

  it("runs a two-cell-wide north-south band as summits and saddles (xaj.20)", () => {
    for (const ground of ["grass", "badlands", "wasteland"] as const) {
      const map = mapOf(
        [
          "........",
          ".MMMMMM.",
          ".MMMMMM.",
          "..MM....",
          "..MM....",
          "..MM....",
          "..MM....",
          "..MM....",
          "..MM....",
          "..MM....",
          "........",
        ],
        ground,
      );
      const cover = packRanges(map);
      expectExactCover(map, cover);
      const band = cover.pieces.filter((p) => p.y >= 3);
      // Two-cell-wide pieces only, at least one of them a massif summit.
      for (const p of band) expect(p.asset.cols).toBe(2);
      expect(band.some((p) => p.asset.rows >= 2)).toBe(true);
      // Never two massifs edge to edge: a saddle row between summits.
      for (const a of band)
        for (const b of band)
          if (a !== b && a.asset.rows >= 2 && b.asset.rows >= 2)
            expect(a.y + a.asset.rows === b.y).toBe(false);
    }
  });

  it("covers generated ranges without single-cell pieces (xaj.20)", () => {
    // Every Mountain cell lies in a 2x2 block of them, so the cover is
    // built from pieces of two cells and more; singles are a fallback for
    // mountains under objects only.
    for (const seed of [1, 2, 3, 4, 5]) {
      const map = generateMap(seed, { size: "M" });
      const singles = packRanges(map).pieces.filter((p) => p.asset.cols === 1);
      expect(singles.map((p) => `${p.asset.key}@${p.x},${p.y}`)).toEqual([]);
    }
  });

  it("keeps the sandstone tower buttes apart on generated maps (xaj.19)", () => {
    const towers = new Set([
      "massif-sandstone-massif-2x2-a",
      "massif-sandstone-massif-2x2-b",
      "massif-sandstone-massif-3x2-a",
      "massif-sandstone-massif-3x2-b",
    ]);
    for (const seed of [1, 2, 3]) {
      const list = packRanges(generateMap(seed, { size: "M" })).pieces.filter(
        (p) => towers.has(p.asset.key),
      );
      for (const a of list)
        for (const b of list) {
          if (a === b) continue;
          const gap = Math.max(
            b.x - (a.x + a.asset.cols - 1),
            a.x - (b.x + b.asset.cols - 1),
            b.y - (a.y + a.asset.rows - 1),
            a.y - (b.y + b.asset.rows - 1),
          );
          // Touching towers never; within the family's reach only where a
          // slot has nothing else left (rare).
          expect(gap).toBeGreaterThan(1);
        }
    }
  });

  it("raises at most OPEN_RISE_MAX px over an open cell behind", () => {
    for (const seed of [1, 2, 3, 4]) {
      const map = generateMap(seed, { size: "M" });
      for (const p of packRanges(map).pieces)
        for (let c = 0; c < p.asset.cols; c += 1) {
          const y = p.y - 1;
          if (y < 0) continue;
          const behind = map.cells[y * map.width + p.x + c];
          if (behind?.obstacle !== "mountain")
            expect(riseAt(p.asset, c)).toBeLessThanOrEqual(OPEN_RISE_MAX);
        }
    }
  });

  it("does not change a range when a cell outside it changes", () => {
    const rows = [
      "..............",
      ".MMMM.........",
      ".MMMMM........",
      "..MMM.........",
      "..............",
      "..........MM..",
    ];
    const a = mapOf(rows);
    const b = mapOf(rows);
    b.cells[5 * b.width + 12]!.obstacle = "none";
    b.cells[0 * b.width + 10]!.terrain = "wasteland";
    const left = (cover: RangeCover) =>
      cover.pieces.filter((p) => p.x < 7).map((p) => ({ ...p }));
    expect(left(packRanges(b))).toEqual(left(packRanges(a)));
  });

  it("keeps a mountain under an object a low single", () => {
    const map = mapOf(["MMM", "MMM"]);
    const cover = packRanges(map, new Set([1]));
    const piece = cover.pieceAt.get(1)!;
    expect(piece.asset.cols).toBe(1);
    expect(piece.asset.rows).toBe(1);
    expect(piece.asset.up).toBe(24);
  });

  it("back-fills joints inside the range only", () => {
    const map = mapOf(BLOCK);
    const cover = packRanges(map);
    expect(cover.fills.length).toBeGreaterThan(0);
    for (const fill of cover.fills.filter((f) => f.front !== true)) {
      // The fill's foot stands inside the range.
      const footX = Math.floor((fill.dx + fill.asset.w / 2) / 80);
      const footY = Math.floor(
        (fill.dy + fill.asset.h - fill.asset.footGap - 1) / 80,
      );
      expect(map.cells[footY * map.width + footX]?.obstacle).toBe("mountain");
    }
  });

  it("fills a big badlands range with plateaus, landmarks on its rim (xaj.21)", () => {
    const map = mapOf(
      [
        "..............",
        ".MMMMMMMMMMMM.",
        ".MMMMMMMMMMMM.",
        ".MMMMMMMMMMMM.",
        ".MMMMMMMMMMMM.",
        ".MMMMMMMMMMMM.",
        ".MMMMMMMMMMMM.",
        "..............",
      ],
      "badlands",
    );
    const cover = packRanges(map);
    expectExactCover(map, cover);
    const rock = (x: number, y: number): boolean =>
      map.cells[y * map.width + x]?.obstacle === "mountain";
    const plateaus = cover.pieces.filter((p) => p.asset.kind === "plateau");
    expect(plateaus.length).toBeGreaterThan(0);
    for (const p of cover.pieces) {
      let behind = true;
      for (let c = 0; c < p.asset.cols; c += 1)
        if (!rock(p.x + c, p.y - 1)) behind = false;
      let sides = 0;
      for (let r = 0; r < p.asset.rows; r += 1)
        sides +=
          (rock(p.x - 1, p.y + r) ? 1 : 0) +
          (rock(p.x + p.asset.cols, p.y + r) ? 1 : 0);
      // Inside the range (rock behind, rock on most sides): no landmark.
      if (behind && sides >= p.asset.rows && p.asset.rows >= 2)
        expect(isLandmark(p.asset.key), p.asset.key).toBe(false);
    }
  });

  it("keeps each landmark sprite a screen apart on generated maps (xaj.22)", () => {
    // A zoom-0.75 screen is 24 x 15 cells; the red hoodoo mound showed
    // three times on one before bead xaj.22.
    let close = 0;
    let landmarks = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const list = packRanges(generateMap(seed, { size: "M" })).pieces.filter(
        (p) => isLandmark(p.asset.key),
      );
      landmarks += list.length;
      for (const a of list)
        for (const b of list) {
          if (a === b || a.asset.key !== b.asset.key) continue;
          const gap = Math.max(
            b.x - (a.x + a.asset.cols - 1),
            a.x - (b.x + b.asset.cols - 1),
            b.y - (a.y + a.asset.rows - 1),
            a.y - (b.y + b.asset.rows - 1),
          );
          if (gap <= LANDMARK_SPRITE_REACH) close += 1;
        }
    }
    expect(landmarks).toBeGreaterThan(30);
    // Only where a slot has nothing else left (each pair counts twice).
    expect(close).toBeLessThanOrEqual(4);
  });

  it("joins cut tableland pieces into one tableland (xaj.22)", () => {
    let joins = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const cover = packRanges(generateMap(seed, { size: "M" }));
      const at = (x: number, y: number): RangePiece | undefined =>
        cover.pieces.find(
          (p) =>
            p.y === y && p.x <= x && x < p.x + p.asset.cols && p.asset.rows,
        );
      for (const p of cover.pieces) {
        const cut = TABLE_CUT[p.asset.key];
        if (cut === undefined) continue;
        // A cut side always meets a cut side of the same outline family,
        // on the same rows: never a cliff, never open ground.
        if (cut.east) {
          const q = at(p.x + p.asset.cols, p.y);
          expect(q, `${p.asset.key} at ${p.x},${p.y}`).toBeDefined();
          expect(q?.x).toBe(p.x + p.asset.cols);
          expect(q?.asset.rows).toBe(p.asset.rows);
          expect(TABLE_CUT[q?.asset.key ?? ""]?.west).toBe(true);
          expect(TABLE_CUT[q?.asset.key ?? ""]?.family).toBe(cut.family);
          joins += 1;
        }
        if (cut.west) {
          const q = at(p.x - 1, p.y);
          expect(TABLE_CUT[q?.asset.key ?? ""]?.east).toBe(true);
        }
      }
    }
    expect(joins).toBeGreaterThan(10);
  });

  it("merges a small palette island into the range round it (xaj.21)", () => {
    const map = mapOf([
      "......................",
      ".MMMMMMMMMMMMMMMMMMMM.",
      ".MMMMMMMMMMMMMMMMMMMM.",
      "......................",
    ]);
    map.cells.forEach((c, i) => {
      if (i % map.width >= 7) c.terrain = "badlands";
    });
    // Six columns of grass (12 cells) against fourteen of badlands.
    const cover = packRanges(map);
    for (const p of cover.pieces) expect(p.asset.palette).toBe("sandstone");
  });
});

describe("cutRun", () => {
  it("cuts a run exactly", () => {
    for (let length = 1; length <= 11; length += 1) {
      const cut = cutRun(
        0,
        3,
        length,
        () => true,
        () => false,
      );
      expect(cut.reduce((sum: number, c) => sum + c, 0)).toBe(length);
    }
  });

  it("uses no 3x1 ridge where one is not allowed", () => {
    const cut = cutRun(
      0,
      0,
      9,
      (_x, cols) => cols === 2,
      () => false,
    );
    expect(cut.includes(3)).toBe(false);
  });
});

describe("massifEntries", () => {
  it("draws the paint over open ground in the foreground at the piece's top row", () => {
    const map = mapOf(["........", ".MMMMMM.", ".MMMMMM.", "........"]);
    const entries = massifEntries(map, new Set());
    const bands = entries.filter((e) => e.pass === "FOREGROUND");
    expect(bands.length).toBeGreaterThan(0);
    for (const band of bands) {
      expect(band.row).toBe(1);
      for (const s of band.sprites) expect(s.dy + s.sh).toBe(80);
    }
    // Bodies sort with their bottom row.
    const bodies = entries.filter(
      (e) => e.pass === "TALL_BODY" && e.layer === 1,
    );
    expect(Math.max(...bodies.map((e) => e.row))).toBe(2);
  });
});
