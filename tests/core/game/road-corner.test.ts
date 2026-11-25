/**
 * Heroes walk roads as they are drawn (bead border_marches-bzc.44): a
 * diagonal step across a road corner costs more than the two road steps
 * round it, so a hero turning a road corner walks through the corner cell;
 * a genuinely diagonal road keeps its plain diagonal (99).
 */
import { describe, expect, it } from "vitest";
import { findPath, stepCost } from "../../../src/core/game/index.ts";
import { ROAD_CORNER_DIAGONAL_COST } from "../../../src/data/movement.ts";
import { buildMap, gameOn } from "./helpers.ts";

describe("road corners", () => {
  it("charges a diagonal across a road corner more than going round it", () => {
    const map = buildMap(["##g", "g#g", "ggg"], []);
    expect(ROAD_CORNER_DIAGONAL_COST).toBeGreaterThan(2 * 70);
    expect(stepCost(map, null, 0, 0, 1, 1)).toBe(ROAD_CORNER_DIAGONAL_COST);
    expect(stepCost(map, null, 1, 1, 0, 0)).toBe(ROAD_CORNER_DIAGONAL_COST);
    // A diagonal road with no road corner, and a diagonal onto the road.
    const diagonal = buildMap(["#gg", "g#g", "gg#"], []);
    expect(stepCost(diagonal, null, 0, 0, 1, 1)).toBe(99);
    expect(stepCost(map, null, 0, 1, 1, 0)).toBe(141);
  });

  it("walks a hero turning a road corner through the corner cell", () => {
    // Road west to east along row 1, then south down column 4, through
    // wasteland (on grass a hero may still cut a long corner off the road).
    const s = gameOn(
      ["wwwwwww", "#####ww", "wwww#ww", "wwww#ww", "wwwwwww"],
      [],
      0,
      1,
    );
    const path = findPath(s, "hero-0", 4, 3)!;
    expect(path.steps.map((p) => [p.x, p.y])).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1],
      [4, 2],
      [4, 3],
    ]);
    expect(path.total).toBe(6 * 70);
    // And back the other way.
    const back = gameOn(
      ["wwwwwww", "#####ww", "wwww#ww", "wwww#ww", "wwwwwww"],
      [],
      4,
      3,
    );
    expect(
      findPath(back, "hero-0", 0, 1)!.steps.map((p) => [p.x, p.y]),
    ).toEqual([
      [4, 2],
      [4, 1],
      [3, 1],
      [2, 1],
      [1, 1],
      [0, 1],
    ]);
  });

  it("walks the plain T of a junction through its centre", () => {
    // East-west road on row 1 with a branch south from (3, 1).
    const rows = ["wwwwwww", "#######", "www#www", "www#www"];
    const s = gameOn(rows, [], 3, 3);
    const west = findPath(s, "hero-0", 0, 1)!;
    expect(west.steps.map((p) => [p.x, p.y])).toEqual([
      [3, 2],
      [3, 1],
      [2, 1],
      [1, 1],
      [0, 1],
    ]);
  });
});
