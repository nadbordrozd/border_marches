import { describe, expect, it } from "vitest";
import {
  Rng,
  createRng,
  deriveSeed,
  hash2,
  hash2Float,
  hashString,
} from "../../src/core/rng.ts";

function draws(rng: Rng, n: number): number[] {
  return Array.from({ length: n }, () => rng.nextUint32());
}

describe("Rng", () => {
  it("is reproducible from a seed", () => {
    expect(draws(createRng(42), 20)).toEqual(draws(createRng(42), 20));
  });

  it("pins the sequence for seed 1 (changing it breaks saves and maps)", () => {
    expect(draws(createRng(1), 4)).toMatchInlineSnapshot(`
      [
        1422497811,
        2365969376,
        3353355597,
        3708388990,
      ]
    `);
  });

  it("separates nearby seeds", () => {
    const a = draws(createRng(1), 8);
    const b = draws(createRng(2), 8);
    expect(a.filter((v, i) => v === b[i])).toEqual([]);
  });

  it("round-trips its state", () => {
    const rng = createRng(7);
    draws(rng, 5);
    const copy = Rng.fromState(rng.getState());
    expect(draws(copy, 10)).toEqual(draws(rng, 10));
    expect(JSON.parse(JSON.stringify(rng.getState()))).toEqual(rng.getState());
  });

  it("clone does not advance the original", () => {
    const rng = createRng(9);
    const clone = rng.clone();
    expect(draws(clone, 5)).toEqual(draws(rng, 5));
  });

  it("next is in [0, 1) and roughly uniform", () => {
    const rng = createRng(3);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 10000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      buckets[Math.floor(v * 10)]! += 1;
    }
    for (const count of buckets) expect(count).toBeGreaterThan(850);
  });

  it("int covers the inclusive range and rejects bad ranges", () => {
    const rng = createRng(4);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(rng.int(-2, 3));
    expect([...seen].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2, 3]);
    expect(() => rng.int(3, 2)).toThrow(RangeError);
    expect(() => rng.int(0.5, 2)).toThrow(RangeError);
  });

  it("pick, weighted and shuffle", () => {
    const rng = createRng(5);
    expect(["a", "b", "c"]).toContain(rng.pick(["a", "b", "c"]));
    expect(() => rng.pick([])).toThrow(RangeError);
    for (let i = 0; i < 50; i++)
      expect(rng.weighted(["x", "y"], [0, 1])).toBe("y");
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = rng.shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(input);
  });

  it("fork gives reproducible, distinct child streams", () => {
    const a = createRng(11);
    const b = createRng(11);
    const childA = a.fork("forests");
    const childB = b.fork("forests");
    expect(draws(childA, 5)).toEqual(draws(childB, 5));
    expect(draws(a.fork("x"), 5)).not.toEqual(draws(b.fork("y"), 5));
  });
});

describe("hashes", () => {
  it("deriveSeed depends on every label, in order", () => {
    expect(deriveSeed(1, "a", 2)).toBe(deriveSeed(1, "a", 2));
    expect(deriveSeed(1, "a", 2)).not.toBe(deriveSeed(1, 2, "a"));
    expect(deriveSeed(1, "a")).not.toBe(deriveSeed(2, "a"));
    expect(deriveSeed(1, "a")).not.toBe(deriveSeed(1, "b"));
  });

  it("hash2 is stable, salted, and spreads neighbours", () => {
    expect(hash2(3, 4)).toBe(hash2(3, 4, 0));
    expect(hash2(3, 4, 1)).not.toBe(hash2(3, 4, 2));
    expect(hash2(3, 4)).not.toBe(hash2(4, 3));
    const values = new Set<number>();
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) values.add(hash2(x, y, 7));
    expect(values.size).toBe(32 * 32);
    for (let i = 0; i < 100; i++) {
      const f = hash2Float(i, -i, 3);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it("hashString returns uint32", () => {
    const h = hashString("Border Marches");
    expect(Number.isInteger(h) && h >= 0 && h < 2 ** 32).toBe(true);
    expect(hashString("a")).not.toBe(hashString("b"));
  });
});
