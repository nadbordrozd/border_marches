/**
 * The forest canopy of small trees (bead border_marches-xaj.26): placement is
 * deterministic, crowns obey the height cap, spill never touches roads,
 * objects or entrances, outlines leave the grid, and the crown bands hold
 * exactly the parts that rise above their row.
 */
import { describe, expect, it } from "vitest";
import {
  CANOPY,
  buildCanopyField,
  canopyBands,
  canopyDepth,
  placeCanopy,
  treeRow,
  woodTop,
} from "../../src/render/map/canopy.ts";
import type { CanopyTree } from "../../src/render/map/canopy.ts";
import {
  TREE_SPECIES,
  featuredCells,
  terrainEntries,
} from "../../src/render/map/scene.ts";
import {
  CELL_PX,
  GROUND_FAMILY,
  GROUND_TERRAINS,
} from "../../src/assets/manifest.ts";
import { TREE_ASSETS } from "../../src/assets/trees.ts";
import { createMap } from "../../src/core/map/types.ts";
import type { GameMap, MapObject } from "../../src/core/map/types.ts";
import { generateMap } from "../../src/core/map/generate.ts";

const CELL = CELL_PX;

function woodsOf(map: GameMap, objects: readonly MapObject[] = map.objects) {
  const featured = featuredCells(map, objects);
  const field = buildCanopyField(map, featured);
  return { featured, field, trees: placeCanopy(field, TREE_SPECIES) };
}

/** A grass map with a rectangle of forest, a road and an object beside it. */
function testMap(): { map: GameMap; mine: MapObject } {
  const map = createMap(16, 12, 7);
  for (const cell of map.cells) cell.terrain = "grass";
  for (let y = 3; y < 9; y += 1)
    for (let x = 3; x < 12; x += 1) map.cells[y * 16 + x]!.obstacle = "forest";
  // A road along the wood's west side, and water to the east.
  for (let y = 2; y < 10; y += 1) map.cells[y * 16 + 2]!.road = true;
  for (let y = 0; y < 12; y += 1) map.cells[y * 16 + 13]!.terrain = "water";
  const mine: MapObject = {
    id: "mine-1",
    kind: "mine",
    x: 6,
    y: 10,
    footprint: { w: 1, h: 2 },
    blocked: [[6, 9]],
    data: { resource: "wood" },
  };
  map.cells[9 * 16 + 6]!.obstacle = "none";
  map.objects.push(mine);
  return { map, mine };
}

describe("tree assets", () => {
  it("gives every ground at least three trees of 20-48 px", () => {
    for (const terrain of GROUND_TERRAINS) {
      // Volcanic ground grows the wasteland's trees (bead bzc.83).
      const trees = TREE_ASSETS.filter(
        (t) => t.terrain === GROUND_FAMILY[terrain],
      );
      expect(trees.length, terrain).toBeGreaterThanOrEqual(3);
      expect(TREE_SPECIES[terrain].length, terrain).toBeGreaterThan(0);
      for (const t of trees) {
        expect(t.w).toBeGreaterThanOrEqual(14);
        expect(t.w).toBeLessThanOrEqual(48);
        expect(t.h).toBeLessThanOrEqual(48);
      }
    }
  });
});

describe("canopy placement", () => {
  const map = generateMap(2, { size: "SM" });
  const { featured, field, trees } = woodsOf(map);

  it("is deterministic and dense", () => {
    expect(placeCanopy(field, TREE_SPECIES)).toEqual(trees);
    const woods = map.cells.filter((c) => c.obstacle === "forest").length;
    expect(trees.length).toBeGreaterThan(woods * 6);
  });

  it("caps every crown at 40 px above the top of the wood", () => {
    expect(CANOPY.capPx).toBe(40);
    for (const t of trees) {
      const row = treeRow(t);
      for (const fx of [t.x + 3, t.baseX, t.x + t.w - 4]) {
        const top = woodTop(field, Math.floor(fx / CELL), row);
        expect(t.y, `${t.key} at ${t.baseX},${t.baseY}`).toBeGreaterThanOrEqual(
          top - CANOPY.capPx,
        );
      }
    }
  });

  it("keeps every foot off roads, objects, entrances, water and rock", () => {
    for (const t of trees)
      for (const fx of [t.x + 2, t.baseX, t.x + t.w - 3]) {
        const cx = Math.floor(fx / CELL);
        const cy = Math.floor((t.baseY - 3) / CELL);
        const index = cy * map.width + cx;
        const cell = map.cells[index]!;
        expect(featured.has(index)).toBe(false);
        expect(cell.road).toBe(false);
        expect(cell.terrain).not.toBe("water");
        expect(cell.obstacle).not.toBe("mountain");
      }
  });

  it("spills a few decorative trees onto free ground, never far", () => {
    const spill = trees.filter((t) => t.spill);
    expect(spill.length).toBeGreaterThan(0);
    expect(spill.length).toBeLessThan(trees.length * 0.1);
    for (const t of spill) {
      const cell =
        map.cells[
          Math.floor((t.baseY - 1) / CELL) * map.width +
            Math.floor(t.baseX / CELL)
        ]!;
      expect(cell.obstacle).not.toBe("mountain");
      expect(cell.road).toBe(false);
      expect(canopyDepth(field, t.baseX, t.baseY - 1)).toBeGreaterThan(
        -CANOPY.spillDepth - 0.05,
      );
    }
  });
});

describe("grass woods (bead xaj.27)", () => {
  it("are calm: no lime takes, autumn only in drifts", () => {
    expect(TREE_ASSETS.some((t) => t.species === "summer")).toBe(false);
    let grass = 0;
    let autumn = 0;
    for (const seed of [3, 5]) {
      const map = generateMap(seed, { size: "SM" });
      for (const t of woodsOf(map).trees) {
        if (!t.key.startsWith("tree-grass-")) continue;
        grass += 1;
        if (t.key.startsWith("tree-grass-autumn-")) autumn += 1;
      }
    }
    expect(grass).toBeGreaterThan(500);
    expect(autumn / grass).toBeGreaterThan(0.03);
    expect(autumn / grass).toBeLessThan(0.25);
  });
});

describe("canopy on a hand-built map", () => {
  const { map, mine } = testMap();
  const { trees } = woodsOf(map);
  const cellOf = (x: number, y: number) =>
    map.cells[Math.floor(y / CELL) * map.width + Math.floor(x / CELL)]!;

  it("never stands a tree on the road, the water or the mine", () => {
    for (const t of trees) {
      for (const fx of [t.x + 2, t.baseX, t.x + t.w - 3]) {
        const cell = cellOf(fx, t.baseY - 3);
        expect(cell.road).toBe(false);
        expect(cell.terrain).toBe("grass");
      }
      const cx = Math.floor(t.baseX / CELL);
      const cy = Math.floor((t.baseY - 1) / CELL);
      expect([cx, cy]).not.toEqual([mine.x, mine.y]);
      expect([cx, cy]).not.toEqual([6, 9]);
    }
  });

  it("rises at most a little into the mine's cells", () => {
    for (const t of trees) {
      const top = cellOf(t.baseX, t.y);
      const cy = Math.floor(t.y / CELL);
      const cx = Math.floor(t.baseX / CELL);
      if (top === map.cells[9 * 16 + 6] && cx === 6 && cy === 9)
        expect((cy + 1) * CELL - t.y).toBeLessThanOrEqual(CANOPY.objectRisePx);
    }
  });

  it("frays the outline off the cell grid", () => {
    // The southernmost trunk of each 20 px column along the wood's south
    // edge (no road there): the edge wanders by more than 12 px.
    const south = new Map<number, number>();
    for (const t of trees) {
      if (t.baseX < 4 * CELL || t.baseX > 11 * CELL) continue;
      const k = Math.floor(t.baseX / 20);
      south.set(k, Math.max(south.get(k) ?? 0, t.baseY));
    }
    const ys = [...south.values()];
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(12);
    // Some trunks stand past the cell edge, some well inside it.
    expect(ys.some((y) => y > 9 * CELL)).toBe(true);
    expect(ys.some((y) => y < 9 * CELL - 4)).toBe(true);
  });

  it("changes only nearby trees when one cell changes", () => {
    const { map: other } = testMap();
    other.cells[5 * 16 + 7]!.obstacle = "none";
    const after = woodsOf(other).trees;
    const far = (t: CanopyTree) =>
      Math.abs(t.baseX - 7.5 * CELL) > 2.5 * CELL ||
      Math.abs(t.baseY - 5.5 * CELL) > 2.5 * CELL;
    const key = (t: CanopyTree) => `${t.key}@${t.x},${t.y}`;
    expect(after.filter(far).map(key)).toEqual(trees.filter(far).map(key));
  });
});

describe("crown bands", () => {
  const map = generateMap(3, { size: "SM" });
  const { trees } = woodsOf(map);
  const bands = canopyBands(trees);

  it("hold the rising part of every crown of their row, and only that", () => {
    expect(bands.length).toBeGreaterThan(0);
    for (const band of bands) {
      expect(band.y + band.h).toBe(band.row * CELL);
      expect(band.h).toBeLessThanOrEqual(48);
      for (const t of band.trees) {
        expect(treeRow(t)).toBe(band.row);
        expect(t.y).toBeLessThan(band.row * CELL);
      }
    }
    const banded = new Set(bands.flatMap((b) => b.trees));
    for (const t of trees) expect(banded.has(t)).toBe(t.y < treeRow(t) * CELL);
  });

  it("are drawn in the foreground before their row", () => {
    const entries = terrainEntries(map, map.objects).filter((e) =>
      e.sprites.some((s) => s.key.startsWith("canopy-band:")),
    );
    expect(entries.length).toBe(bands.length);
    for (const e of entries) {
      expect(e.pass).toBe("FOREGROUND");
      expect(Math.abs(e.row % 1)).toBe(0.5);
    }
  });
});
