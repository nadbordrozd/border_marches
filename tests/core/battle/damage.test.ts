import { describe, expect, it } from "vitest";
import {
  applyDamageToStack,
  attackDefenseMultiplier,
  computeDamage,
  defendedDefense,
  totalHp,
} from "../../../src/core/battle/index.ts";

describe("attackDefenseMultiplier (GAME_DESIGN 9.4)", () => {
  it.each([
    // A, D, num, den
    [8, 6, 22, 20], // 1.10
    [8, 3, 25, 20], // 1.25
    [7, 3, 24, 20], // 1.20
    [10, 3, 27, 20], // 1.35
    [5, 5, 20, 20], // 1.00
    [80, 20, 80, 20], // 4.0 exactly at +60
    [100, 0, 80, 20], // capped at 4.0
    [14, 18, 20, 24], // 1 / 1.2
    [0, 46, 20, 66], // 20/66 = 0.303..., still above the cap
    [0, 47, 3, 10], // 20/67 < 0.3: capped
    [0, 200, 3, 10],
  ])("A %i vs D %i -> %i/%i", (a, d, num, den) => {
    expect(attackDefenseMultiplier(a, d)).toEqual({ num, den });
  });
});

describe("defendedDefense: round_half_up(D x 1.3)", () => {
  it.each([
    [0, 0],
    [1, 1], // 1.3
    [2, 3], // 2.6
    [3, 4], // 3.9
    [5, 7], // 6.5 rounds up
    [10, 13],
    [15, 20], // 19.5 rounds up
    [18, 23], // 23.4
  ])("%i -> %i", (d, out) => {
    expect(defendedDefense(d)).toBe(out);
  });
});

describe("computeDamage", () => {
  it.each([
    // count, dmg, A, D, percents, halved, expected
    [9, 3, 8, 6, [], false, 29], // Spitters, worked example: 29.7
    [9, 3, 8, 3, [], false, 33], // 33.75
    [16, 2, 7, 3, [], false, 38], // 38.4
    [17, 6, 9, 5, [], false, 122], // 122.4
    [7, 5, 10, 3, [140], false, 66], // 66.15: Pack Hunter x1.40
    [4, 15, 17, 12, [175], false, 131], // 131.25: Charge x1.75
    [4, 15, 17, 9, [175], false, 147], // exactly 147
    [6, 16, 14, 18, [], false, 80], // 6 x 16 / 1.2 = 80 exactly (79.999 in floats)
    [5, 16, 14, 18, [], false, 66], // 66.67
    [1, 40, 24, 3, [], false, 82], // T-Rex finisher, M 2.05
    [1, 1, 0, 100, [], false, 1], // floor(0.3) = 0 -> min 1
    [10, 3, 6, 3, [], true, 17], // ranged in melee: 34.5 / 2 = 17.25
    [10, 2, 5, 5, [50], false, 10], // Bony x0.5
    [10, 2, 5, 5, [140, 175], false, 49], // multipliers multiply: 20 x 2.45
    [1000, 40, 100, 0, [200, 175], false, 560000], // caps: M 4, x2, x1.75
  ])(
    "%i x %i, A %i, D %i, %j, halved %s -> %i",
    (count, dmg, a, d, percents, halved, expected) => {
      const r = computeDamage({
        count,
        damagePerCreature: dmg,
        attack: a,
        defense: d,
        percents,
        halved,
      });
      expect(r.damage).toBe(expected);
    },
  );

  it("is exact where floating point is not", () => {
    // 100 x 1 x 1.15 is 114.99999999999999 in doubles: a float floor says 114.
    expect(Math.floor(100 * 1 * (1 + 0.05 * 3))).toBe(114);
    expect(
      computeDamage({ count: 100, damagePerCreature: 1, attack: 8, defense: 5 })
        .damage,
    ).toBe(115);
  });

  it("rejects fractional percentages", () => {
    expect(() =>
      computeDamage({
        count: 1,
        damagePerCreature: 1,
        attack: 0,
        defense: 0,
        percents: [112.5],
      }),
    ).toThrow(RangeError);
  });
});

describe("applyDamageToStack (GAME_DESIGN 9.5)", () => {
  it.each([
    // n, H, h, X -> kills, count, top
    [20, 28, 28, 29, 1, 19, 27], // r = 1
    [19, 28, 27, 33, 1, 18, 22],
    [18, 28, 22, 38, 1, 17, 12],
    [16, 10, 10, 122, 12, 4, 8], // r = 112
    [16, 10, 10, 115, 11, 5, 5],
    [16, 28, 2, 12, 1, 15, 18],
    [15, 28, 18, 66, 2, 13, 8],
    [5, 10, 7, 3, 0, 5, 4], // X < h
    [5, 10, 7, 7, 1, 4, 10], // X = h: next creature untouched
    [5, 10, 7, 17, 2, 3, 10], // r mod H = 0
    [5, 10, 7, 1000, 5, 0, 0], // overkill
  ])("n %i H %i h %i takes %i", (n, H, h, X, kills, count, top) => {
    const r = applyDamageToStack({ count: n, hp: H, topHp: h }, X);
    expect([r.kills, r.count, r.topHp]).toEqual([kills, count, top]);
    expect(r.hpLost).toBe(Math.min(X, totalHp({ count: n, hp: H, topHp: h })));
  });
});
