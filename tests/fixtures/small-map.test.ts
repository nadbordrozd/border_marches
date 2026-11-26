import { describe, expect, it } from "vitest";
import {
  MAP_OBJECT_KINDS,
  TERRAINS,
  cellAt,
  isPassable,
  neighbours8,
  objectBlockedSet,
  validateMap,
} from "../../src/core/map/types.ts";
import { buildSmallMap } from "./small-map.ts";

describe("small-map fixture", () => {
  const map = buildSmallMap();

  it("is a valid 24x18 map", () => {
    expect(map.width).toBe(24);
    expect(map.height).toBe(18);
    expect(validateMap(map)).toEqual([]);
  });

  it("uses every terrain and has deep and shallow water", () => {
    const terrains = new Set(map.cells.map((c) => c.terrain));
    // Volcanic ground (bead bzc.83), snow (bzc.87) and sand (bzc.88) came
    // after the fixture; their own tests are tests/core/map/volcanic.test.ts,
    // winter.test.ts and desert.test.ts.
    expect([...terrains].sort()).toEqual(
      TERRAINS.filter(
        (t) => t !== "volcanic" && t !== "snow" && t !== "sand",
      ).sort(),
    );
    const water = map.cells.filter((c) => c.terrain === "water");
    expect(water.some((c) => c.deep === true)).toBe(true);
    expect(water.some((c) => c.deep !== true)).toBe(true);
  });

  it("has a mountain range, forests and a road", () => {
    const count = (pred: (i: number) => boolean): number =>
      map.cells.filter((_, i) => pred(i)).length;
    expect(
      count((i) => map.cells[i]!.obstacle === "mountain"),
    ).toBeGreaterThanOrEqual(15);
    expect(
      count((i) => map.cells[i]!.obstacle === "forest"),
    ).toBeGreaterThanOrEqual(15);
    expect(count((i) => map.cells[i]!.road)).toBeGreaterThanOrEqual(15);
  });

  it("has one object of each MVP kind (all of them valid kinds)", () => {
    expect(map.objects.map((o) => o.kind).sort()).toEqual(
      ["hero-start", "mine", "monster", "pickup", "town"].sort(),
    );
    for (const o of map.objects) expect(MAP_OBJECT_KINDS).toContain(o.kind);
  });

  it("the road connects the town gate to the mine entrance", () => {
    const town = map.objects.find((o) => o.kind === "town")!;
    const mine = map.objects.find((o) => o.kind === "mine")!;
    const blocked = objectBlockedSet(map);
    // Flood fill over passable, unblocked cells from the town gate.
    const seen = new Set<string>([`${town.x},${town.y}`]);
    const queue: Array<[number, number]> = [[town.x, town.y]];
    while (queue.length > 0) {
      const [x, y] = queue.shift()!;
      for (const [nx, ny] of neighbours8(map, x, y)) {
        const key = `${nx},${ny}`;
        const cell = cellAt(map, nx, ny)!;
        if (
          seen.has(key) ||
          !isPassable(cell) ||
          blocked.has(ny * map.width + nx)
        )
          continue;
        seen.add(key);
        queue.push([nx, ny]);
      }
    }
    expect(seen.has(`${mine.x},${mine.y}`)).toBe(true);
  });

  it("returns a fresh copy each call", () => {
    const a = buildSmallMap();
    a.cells[0]!.terrain = "water";
    expect(buildSmallMap().cells[0]!.terrain).toBe("grass");
  });
});
