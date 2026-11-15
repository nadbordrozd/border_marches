import { describe, expect, it } from "vitest";
import {
  cellAt,
  createMap,
  inBounds,
  isPassable,
  makeCell,
  neighbours8,
  objectBlockedSet,
  objectBounds,
  validateMap,
} from "../../../src/core/map/types.ts";
import type { GameMap, MapObject } from "../../../src/core/map/types.ts";

function map3x2(): GameMap {
  const map = createMap(3, 2, 1);
  map.cells[1] = makeCell("water");
  map.cells[2] = makeCell("grass", "mountain");
  return map;
}

describe("map helpers", () => {
  it("indexes row-major and checks bounds", () => {
    const map = map3x2();
    expect(cellAt(map, 1, 0)?.terrain).toBe("water");
    expect(cellAt(map, 2, 0)?.obstacle).toBe("mountain");
    expect(cellAt(map, 3, 0)).toBeUndefined();
    expect(cellAt(map, 0, -1)).toBeUndefined();
    expect(inBounds(map, 2, 1)).toBe(true);
    expect(inBounds(map, 0.5, 0)).toBe(false);
  });

  it("lists in-bounds neighbours in N, NE, E, SE, S, SW, W, NW order", () => {
    const map = createMap(3, 3, 1);
    expect(neighbours8(map, 1, 1)).toEqual([
      [1, 0],
      [2, 0],
      [2, 1],
      [2, 2],
      [1, 2],
      [0, 2],
      [0, 1],
      [0, 0],
    ]);
    expect(neighbours8(map, 0, 0)).toEqual([
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
  });

  it("passability: no water, no obstacle", () => {
    expect(isPassable(makeCell("grass"))).toBe(true);
    expect(isPassable(makeCell("water"))).toBe(false);
    expect(isPassable(makeCell("jungle", "forest"))).toBe(false);
    expect(isPassable(makeCell("badlands", "mountain"))).toBe(false);
  });

  it("object bounds and blocked set", () => {
    const map = createMap(6, 6, 1);
    const town: MapObject = {
      id: "t",
      kind: "town",
      x: 2,
      y: 3,
      footprint: { w: 3, h: 2 },
      blocked: [
        [1, 2],
        [2, 2],
        [3, 2],
        [1, 3],
        [3, 3],
      ],
      data: {},
    };
    map.objects.push(town);
    expect(objectBounds(town)).toEqual({ x: 1, y: 2, w: 3, h: 2 });
    expect(objectBlockedSet(map).has(2 * 6 + 2)).toBe(true);
    expect(objectBlockedSet(map).has(3 * 6 + 2)).toBe(false);
    expect(validateMap(map)).toEqual([]);
  });
});

describe("validateMap", () => {
  it("reports broken invariants", () => {
    const map = map3x2();
    map.cells[1] = { terrain: "water", obstacle: "forest", road: false };
    map.cells[3] = {
      terrain: "grass",
      obstacle: "none",
      road: false,
      deep: true,
    };
    map.cells[2]!.road = true;
    map.objects.push(
      {
        id: "a",
        kind: "pickup",
        x: 2,
        y: 0,
        footprint: { w: 1, h: 1 },
        blocked: [],
        data: {},
      },
      {
        id: "a",
        kind: "monster",
        x: 0,
        y: 1,
        footprint: { w: 1, h: 1 },
        blocked: [[0, 1]],
        data: {},
      },
    );
    const problems = validateMap(map).join("\n");
    expect(problems).toContain("water with an obstacle");
    expect(problems).toContain("deep on land");
    expect(problems).toContain("road on impassable");
    expect(problems).toContain("entrance on impassable ground");
    expect(problems).toContain("duplicate id");
    expect(problems).toContain("entrance listed as blocked");
  });

  it("rejects a wrong cell count", () => {
    const map = createMap(2, 2, 1);
    map.cells.pop();
    expect(validateMap(map)).toEqual(["cells.length 3 != 4"]);
  });
});
