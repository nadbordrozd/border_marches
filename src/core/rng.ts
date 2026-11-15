/**
 * Seeded randomness for deterministic game logic.
 *
 * Everything in src/core draws randomness from an {@link Rng} (never
 * Math.random), and renderers use the stateless {@link hash2} family so a cell
 * looks the same every frame and on every machine.
 *
 * Generator: sfc32 (Small Fast Counting, 128-bit state), seeded through
 * splitmix32. Streams are cheap: give each subsystem its own stream with
 * `createRng(deriveSeed(seed, "forests"))` so adding draws in one subsystem
 * never shifts another's results.
 */

/** Serialisable generator state (four uint32 words), for save games. */
export type RngState = readonly [number, number, number, number];

const UINT32 = 0x1_0000_0000;

/** splitmix32 finaliser: a good 32-bit integer mix. Returns a uint32. */
export function mix32(value: number): number {
  let z = (value + 0x9e3779b9) | 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

/** FNV-1a 32-bit hash of a string, mixed. Returns a uint32. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return mix32(h);
}

/** Order-sensitive hash of any number of integers. Returns a uint32. */
export function hashInts(...values: readonly number[]): number {
  let h = 0x2545f491;
  for (const v of values) h = mix32(h ^ mix32(v | 0));
  return h;
}

/**
 * Derive an independent seed from a base seed and labels, e.g.
 * `deriveSeed(mapSeed, "zones")` or `deriveSeed(mapSeed, "town", 3)`.
 * Returns a uint32.
 */
export function deriveSeed(
  seed: number,
  ...labels: ReadonlyArray<string | number>
): number {
  let h = mix32(seed | 0);
  for (const label of labels) {
    const part = typeof label === "string" ? hashString(label) : mix32(label);
    h = mix32(h ^ part);
  }
  return h;
}

/**
 * Stateless coordinate hash for render-side determinism: the same (x, y, salt)
 * always gives the same uint32. Use a distinct salt per purpose (sprite
 * variant, flip, jitter) so the choices are uncorrelated.
 */
export function hash2(x: number, y: number, salt = 0): number {
  return hashInts(x, y, salt);
}

/** {@link hash2} mapped to a float in [0, 1). */
export function hash2Float(x: number, y: number, salt = 0): number {
  return hash2(x, y, salt) / UINT32;
}

/** Deterministic pseudo-random generator (sfc32). */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  private constructor(state: RngState) {
    [this.a, this.b, this.c, this.d] = state;
  }

  /** A generator seeded from any integer (only the low 32 bits matter). */
  static fromSeed(seed: number): Rng {
    const s0 = mix32(seed | 0);
    const s1 = mix32(s0);
    const s2 = mix32(s1);
    const s3 = mix32(s2);
    const rng = new Rng([s0, s1, s2, s3 | 1]);
    // Discard the first outputs so similar seeds diverge fully.
    for (let i = 0; i < 12; i++) rng.nextUint32();
    return rng;
  }

  /** Restore a generator from {@link Rng.getState}. */
  static fromState(state: RngState): Rng {
    return new Rng([
      state[0] >>> 0,
      state[1] >>> 0,
      state[2] >>> 0,
      state[3] >>> 0,
    ]);
  }

  /** The current state; `Rng.fromState(rng.getState())` continues the stream. */
  getState(): RngState {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
  }

  /** An independent copy that will produce the same sequence as this one. */
  clone(): Rng {
    return Rng.fromState(this.getState());
  }

  /** Next uint32 in [0, 2^32). */
  nextUint32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    return this.nextUint32() / UINT32;
  }

  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`Rng.int: bad range [${min}, ${max}]`);
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Float in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** True with probability p (p <= 0 never, p >= 1 always). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** A uniformly chosen element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError("Rng.pick: empty array");
    return items[this.int(0, items.length - 1)] as T;
  }

  /** An element chosen with probability proportional to its weight. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    if (items.length === 0 || items.length !== weights.length) {
      throw new RangeError("Rng.weighted: items and weights must match");
    }
    let total = 0;
    for (const w of weights) {
      if (!(w >= 0)) throw new RangeError("Rng.weighted: negative weight");
      total += w;
    }
    if (total <= 0) throw new RangeError("Rng.weighted: zero total weight");
    let roll = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i] as number;
      if (roll < 0) return items[i] as T;
    }
    return items[items.length - 1] as T;
  }

  /** A shuffled copy (Fisher-Yates); the input is not modified. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }

  /**
   * A child generator for a labelled sub-task. Advances this generator by one
   * draw, so forks taken in the same order are reproducible. For streams that
   * must not depend on call order, prefer `createRng(deriveSeed(seed, label))`.
   */
  fork(label: string | number = 0): Rng {
    return Rng.fromSeed(deriveSeed(this.nextUint32(), label));
  }
}

/** Shorthand for {@link Rng.fromSeed}. */
export function createRng(seed: number): Rng {
  return Rng.fromSeed(seed);
}
