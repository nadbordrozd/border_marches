import { describe, expect, it } from "vitest";
import {
  calendar,
  inSight,
  isGrowthDay,
  levelForXp,
  splitNeutralStack,
  weeklyGrowth,
  xpForLevel,
} from "../../../src/core/game/index.ts";

describe("calendar", () => {
  it("counts 7-day weeks and 4-week months from day 1", () => {
    expect(calendar(1)).toEqual({
      day: 1,
      dayOfWeek: 1,
      week: 1,
      month: 1,
      weekOfGame: 1,
    });
    expect(calendar(7)).toMatchObject({ dayOfWeek: 7, week: 1 });
    expect(calendar(8)).toMatchObject({ dayOfWeek: 1, week: 2, month: 1 });
    expect(calendar(29)).toMatchObject({
      dayOfWeek: 1,
      week: 1,
      month: 2,
      weekOfGame: 5,
    });
  });

  it("grows on day 1 of week 2 onward only", () => {
    expect(isGrowthDay(1)).toBe(false);
    expect(isGrowthDay(7)).toBe(false);
    expect(isGrowthDay(8)).toBe(true);
    expect(isGrowthDay(15)).toBe(true);
    expect(isGrowthDay(16)).toBe(false);
  });
});

describe("experience", () => {
  it("has the documented thresholds", () => {
    // RULES_V2 3.2 / ECONOMY 9: 100 x (L - 1) x (L + 2).
    expect([1, 2, 3, 4, 10, 15, 20].map(xpForLevel)).toEqual([
      0, 400, 1000, 1800, 10800, 23800, 41800,
    ]);
    expect(xpForLevel(30)).toBe(92800);
  });

  it("maps XP to levels at the exact thresholds", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(399)).toBe(1);
    expect(levelForXp(400)).toBe(2);
    expect(levelForXp(999)).toBe(2);
    expect(levelForXp(1000)).toBe(3);
    expect(levelForXp(23799)).toBe(14);
    expect(levelForXp(23800)).toBe(15);
  });
});

describe("weekly growth", () => {
  function weeks(growth: number, stockade: boolean, n: number): number[] {
    let r = 0;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const g = weeklyGrowth(growth, stockade, r);
      out.push(g.added);
      r = g.remainder;
    }
    return out;
  }

  it("adds the base growth without a Stockade", () => {
    expect(weeks(9, false, 3)).toEqual([9, 9, 9]);
  });

  it("alternates odd Stockade growths, lower first (FACTION table)", () => {
    expect(weeks(14, true, 2)).toEqual([21, 21]);
    expect(weeks(9, true, 4)).toEqual([13, 14, 13, 14]);
    expect(weeks(7, true, 2)).toEqual([10, 11]);
    expect(weeks(4, true, 2)).toEqual([6, 6]);
    expect(weeks(2, true, 2)).toEqual([3, 3]);
    expect(weeks(1, true, 4)).toEqual([1, 2, 1, 2]);
  });
});

describe("neutral split and sight", () => {
  it("splits a neutral stack into up to 3 near-equal stacks, larger first", () => {
    expect(splitNeutralStack(1)).toEqual([1]);
    expect(splitNeutralStack(2)).toEqual([1, 1]);
    expect(splitNeutralStack(10)).toEqual([4, 3, 3]);
    expect(splitNeutralStack(11)).toEqual([4, 4, 3]);
    expect(splitNeutralStack(12)).toEqual([4, 4, 4]);
  });

  it("uses the dx^2 + dy^2 <= r(r+1) disc", () => {
    expect(inSight(6, 0, 6)).toBe(true);
    expect(inSight(6, 1, 6)).toBe(true);
    expect(inSight(6, 2, 6)).toBe(true);
    expect(inSight(6, 3, 6)).toBe(false);
    expect(inSight(5, 4, 6)).toBe(true);
    expect(inSight(5, 5, 6)).toBe(false);
    expect(inSight(7, 0, 6)).toBe(false);
    let cells = 0;
    for (let dx = -5; dx <= 5; dx++) {
      for (let dy = -5; dy <= 5; dy++) if (inSight(dx, dy, 5)) cells++;
    }
    expect(cells).toBe(97);
  });
});
