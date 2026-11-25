// The planned-path markers (bead border_marches-50f): three per cell,
// oriented along the path, coloured by the step they lead to, with the
// destination cross on the last step.
import { describe, expect, it } from "vitest";
import {
  MARKERS_PER_STEP,
  pathMarkers,
  stepDirection,
} from "../../src/render/map/path-markers.ts";

describe("stepDirection", () => {
  it("names the 8 directions from east, clockwise on screen", () => {
    expect(stepDirection(0, 0, 1, 0)).toBe(0);
    expect(stepDirection(0, 0, 1, 1)).toBe(1);
    expect(stepDirection(0, 0, 0, 1)).toBe(2);
    expect(stepDirection(0, 0, -1, 0)).toBe(4);
    expect(stepDirection(0, 0, 0, -1)).toBe(6);
    expect(stepDirection(0, 0, 1, -1)).toBe(7);
  });
});

describe("pathMarkers", () => {
  const steps = [
    { x: 3, y: 2, reachable: true },
    { x: 4, y: 3, reachable: true },
    { x: 5, y: 3, reachable: false },
  ];
  const third = 1 / 3;

  it("puts three markers per cell from the hero to the destination", () => {
    expect(MARKERS_PER_STEP).toBe(3);
    const m = pathMarkers(steps, { x: 2, y: 2 });
    expect(m).toHaveLength(3 * steps.length);
    const expected = [
      [2.5 + third, 2.5],
      [2.5 + 2 * third, 2.5],
      [3.5, 2.5],
      [3.5 + third, 2.5 + third],
      [3.5 + 2 * third, 2.5 + 2 * third],
      [4.5, 3.5],
      [4.5 + third, 3.5],
      [4.5 + 2 * third, 3.5],
      [5.5, 3.5],
    ];
    m.forEach((k, i) => {
      expect(k.cx).toBeCloseTo(expected[i]?.[0] ?? NaN, 9);
      expect(k.cy).toBeCloseTo(expected[i]?.[1] ?? NaN, 9);
    });
    // Neighbours are a third of a step apart: a third of a cell straight,
    // a third of a diagonal on a diagonal.
    for (let i = 1; i < m.length; i++) {
      const a = m[i - 1];
      const b = m[i];
      if (a === undefined || b === undefined) continue;
      expect(Math.hypot(b.cx - a.cx, b.cy - a.cy)).toBeLessThanOrEqual(
        Math.SQRT2 / 3 + 1e-9,
      );
    }
  });

  it("orients arrows along the path and ends in a cross", () => {
    const m = pathMarkers(steps, { x: 2, y: 2 });
    expect(m.map((k) => k.kind)).toEqual([
      ...Array<string>(8).fill("arrow"),
      "cross",
    ]);
    // Lead-in arrows follow their segment; centre arrows face the next step.
    expect(m.slice(0, 8).map((k) => k.dir)).toEqual([0, 0, 1, 1, 1, 0, 0, 0]);
  });

  it("colours each marker by the step it leads to", () => {
    const m = pathMarkers(steps, { x: 2, y: 2 });
    expect(m.map((k) => k.reachable)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(m.map((k) => `${k.cell.x},${k.cell.y}`)).toEqual([
      "3,2",
      "3,2",
      "3,2",
      "4,3",
      "4,3",
      "4,3",
      "5,3",
      "5,3",
      "5,3",
    ]);
  });

  it("skips the first lead-in arrows without a start, and handles one step", () => {
    expect(pathMarkers(steps)).toHaveLength(3 * steps.length - 2);
    const one = pathMarkers([{ x: 1, y: 1, reachable: true }], { x: 0, y: 1 });
    expect(one.map((k) => [k.kind, k.dir])).toEqual([
      ["arrow", 0],
      ["arrow", 0],
      ["cross", 0],
    ]);
    expect(one.map((k) => k.cx)).toEqual([
      expect.closeTo(0.5 + third, 9),
      expect.closeTo(0.5 + 2 * third, 9),
      1.5,
    ]);
    expect(pathMarkers([], { x: 0, y: 0 })).toEqual([]);
  });
});
