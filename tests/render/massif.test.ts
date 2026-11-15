import { describe, expect, it } from "vitest";
import {
  OPEN_RISE_MAX,
  cutRun,
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

  it("runs a one-cell-wide north-south column as spines and singles (xaj.19)", () => {
    const map = mapOf([
      "........",
      ".MMMMM..",
      "..M.....",
      "..M.....",
      "..M.....",
      "..M.....",
      "..M.....",
      "........",
    ]);
    const cover = packRanges(map);
    const column = cover.pieces.filter((p) => p.x === 2 && p.y >= 2);
    const spines = column.filter((p) => p.asset.kind === "spine");
    expect(spines.length).toBeGreaterThan(0);
    for (const s of spines) {
      expect([s.asset.cols, s.asset.rows]).toEqual([1, 2]);
      // A spine rises 48 px: only with rock behind it.
      expect(
        map.cells[(s.y - 1) * map.width + s.x]?.obstacle === "mountain",
      ).toBe(true);
    }
    // Never one spine sprite right on top of another.
    for (const a of spines)
      for (const b of spines)
        if (a !== b && a.asset.key === b.asset.key)
          expect(Math.abs(a.y - b.y)).toBeGreaterThan(2);
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
            expect(p.asset.paintUp).toBeLessThanOrEqual(OPEN_RISE_MAX);
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
