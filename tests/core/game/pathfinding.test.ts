import { describe, expect, it } from "vitest";
import {
  assignDays,
  diagonalCost,
  findPath,
  stepCost,
  type Path,
} from "../../../src/core/game/index.ts";
import { buildMap, field, gameOn, monster, pickup } from "./helpers.ts";

const costs = (p: Path | null) => p?.steps.map((s) => s.cost);

describe("step costs (GAME_DESIGN.md section 7.1)", () => {
  it("rounds diagonals of every terrain cost exactly", () => {
    expect([75, 100, 125, 150].map(diagonalCost)).toEqual([106, 141, 177, 212]);
  });

  it("charges the entered cell, with native jungle and both-cell roads", () => {
    const map = buildMap(["gjbw#", "gs##="], []);
    expect(stepCost(map, null, 0, 0, 1, 0)).toBe(150); // jungle
    expect(stepCost(map, "jungle", 0, 0, 1, 0)).toBe(100); // native
    expect(stepCost(map, null, 1, 0, 2, 0)).toBe(125); // badlands
    expect(stepCost(map, null, 2, 0, 3, 0)).toBe(150); // wasteland
    expect(stepCost(map, null, 0, 1, 1, 1)).toBe(100); // steppe
    expect(stepCost(map, null, 1, 1, 2, 1)).toBe(100); // onto a road from off it
    expect(stepCost(map, null, 2, 1, 3, 1)).toBe(75); // road to road
    expect(stepCost(map, null, 3, 1, 4, 0)).toBe(106); // diagonal road
    expect(stepCost(map, null, 3, 1, 4, 1)).toBe(75); // road on jungle
    expect(stepCost(map, null, 0, 1, 1, 0)).toBe(212); // diagonal jungle
    expect(stepCost(map, "jungle", 0, 1, 1, 0)).toBe(141);
  });
});

describe("findPath", () => {
  it("walks straight and diagonally on grass", () => {
    const s = gameOn(field(5, 5), [], 0, 0);
    const straight = findPath(s, "hero-0", 4, 0)!;
    expect(costs(straight)).toEqual([100, 100, 100, 100]);
    expect(straight.total).toBe(400);
    const diag = findPath(s, "hero-0", 2, 2)!;
    expect(diag.steps.map((p) => [p.x, p.y])).toEqual([
      [1, 1],
      [2, 2],
    ]);
    expect(diag.total).toBe(282);
    expect(diag.steps.map((p) => p.total)).toEqual([141, 282]);
  });

  it("prefers a road when it is cheaper", () => {
    // Along the road: 100 onto it, then 75s, then off.
    const s = gameOn(["g#####g", "ggggggg"], [], 0, 1);
    const p = findPath(s, "hero-0", 6, 1)!;
    expect(p.total).toBe(141 + 4 * 75 + 141);
    expect(p.total).toBeLessThan(600);
  });

  it("crosses native jungle at 100 (the Chieftain)", () => {
    const s = gameOn(["jjjjj"], [], 0, 0);
    expect(findPath(s, "hero-0", 4, 0)!.total).toBe(400);
  });

  it("never enters water, mountains or forests", () => {
    for (const blocker of ["~", "M", "F"]) {
      const s = gameOn([`gg${blocker}gg`], [], 0, 0);
      expect(findPath(s, "hero-0", 4, 0, { ignoreFog: true })).toBeNull();
      expect(findPath(s, "hero-0", 2, 0, { ignoreFog: true })).toBeNull();
    }
  });

  it("does not cut a corner between two impassable cells", () => {
    const blocked = gameOn(["gM", "Mg"], [], 0, 0);
    expect(findPath(blocked, "hero-0", 1, 1)).toBeNull();
    const open = gameOn(["gM", "gg"], [], 0, 0);
    expect(findPath(open, "hero-0", 1, 1)!.total).toBe(141);
  });

  it("never passes through a zone of control", () => {
    // The stack at (3,1) guards the whole 3-row corridor.
    const s = gameOn(field(7, 3), [monster("m", 3, 1)], 0, 1);
    expect(findPath(s, "hero-0", 6, 1, { ignoreFog: true })).toBeNull();
    // Ending on a guarded cell is allowed.
    const toGuard = findPath(s, "hero-0", 2, 1)!;
    expect(toGuard.steps.at(-1)).toMatchObject({ x: 2, y: 1, attack: false });
  });

  it("routes around a zone of control when it can", () => {
    const s = gameOn(field(9, 7), [monster("m", 4, 3)], 0, 3);
    const p = findPath(s, "hero-0", 8, 3, { ignoreFog: true })!;
    expect(p).not.toBeNull();
    for (const step of p.steps) {
      const guarded = Math.max(Math.abs(step.x - 4), Math.abs(step.y - 3)) <= 1;
      expect(guarded, `(${step.x},${step.y})`).toBe(false);
    }
  });

  it("attacks a stack: ends next to it with a free attack step", () => {
    const s = gameOn(field(7, 3), [monster("m", 3, 1)], 0, 1);
    const p = findPath(s, "hero-0", 3, 1)!;
    expect(p.steps.map((st) => [st.x, st.y, st.cost, st.attack])).toEqual([
      [1, 1, 100, false],
      [2, 1, 100, false],
      [3, 1, 0, true],
    ]);
    expect(p.total).toBe(200);
  });

  it("stops at uncollected object entrances", () => {
    const s = gameOn(
      ["ggggg"],
      [pickup("p", 2, 0, { resource: "wood", amount: 5 })],
      0,
      0,
    );
    expect(findPath(s, "hero-0", 4, 0, { ignoreFog: true })).toBeNull();
    expect(findPath(s, "hero-0", 2, 0)!.total).toBe(200);
    const collected = { ...s, collected: ["p"] };
    expect(findPath(collected, "hero-0", 4, 0)!.total).toBe(400);
  });

  it("splits the path into days by movement points", () => {
    expect(assignDays([100, 100, 100, 100, 100], 250, 300)).toEqual([
      0, 0, 1, 1, 1,
    ]);
    const s = gameOn(field(20, 1), [], 0, 0);
    const p = findPath(s, "hero-0", 19, 0, { ignoreFog: true })!;
    expect(p.steps.filter((st) => st.day === 0)).toHaveLength(15);
    expect(p.steps.filter((st) => st.day === 1)).toHaveLength(4);
  });

  it("does not plan into unexplored cells unless asked", () => {
    const s = gameOn(field(20, 1), [], 0, 0);
    expect(findPath(s, "hero-0", 15, 0)).toBeNull();
    expect(findPath(s, "hero-0", 6, 0)!.total).toBe(600);
    expect(findPath(s, "hero-0", 15, 0, { ignoreFog: true })!.total).toBe(1500);
  });

  it("is deterministic", () => {
    const s = gameOn(field(12, 12), [monster("m", 6, 6)], 0, 0);
    const a = findPath(s, "hero-0", 11, 11, { ignoreFog: true });
    const b = findPath(s, "hero-0", 11, 11, { ignoreFog: true });
    expect(a).toEqual(b);
  });
});
