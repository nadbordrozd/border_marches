/**
 * Small grid toolkit for the map generator: typed-array fields, neighbour
 * offsets, connected components, distance transforms and a binary heap.
 *
 * Everything works on row-major indices (i = y * w + x) over a fixed
 * width and height, so the generator can keep its state in flat typed arrays.
 */
import { hashInts } from "../../rng.ts";

/** Reads a typed-array slot; the fallback only satisfies the type checker. */
export function at(a: ArrayLike<number>, i: number): number {
  return a[i] ?? 0;
}

/** Orthogonal offsets: N, E, S, W. */
export const N4: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** All 8 offsets: N, NE, E, SE, S, SW, W, NW. */
export const N8: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

export class Grid {
  readonly w: number;
  readonly h: number;
  readonly n: number;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.n = w * h;
  }

  idx(x: number, y: number): number {
    return y * this.w + x;
  }

  x(i: number): number {
    return i % this.w;
  }

  y(i: number): number {
    return Math.floor(i / this.w);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  private cache = new Map<
    ReadonlyArray<readonly [number, number]>,
    ReadonlyArray<readonly number[]>
  >();

  /**
   * In-bounds neighbour indices of i using the given offsets. The lists are
   * built once per offset table and shared: callers must not modify them.
   */
  around(
    i: number,
    offsets: ReadonlyArray<readonly [number, number]> = N8,
  ): readonly number[] {
    let lists = this.cache.get(offsets);
    if (!lists) {
      const built: number[][] = [];
      for (let k = 0; k < this.n; k++) {
        const x = this.x(k);
        const y = this.y(k);
        const out: number[] = [];
        for (const [dx, dy] of offsets) {
          const nx = x + dx;
          const ny = y + dy;
          if (this.inside(nx, ny)) out.push(this.idx(nx, ny));
        }
        built.push(out);
      }
      lists = built;
      this.cache.set(offsets, lists);
    }
    return lists[i] ?? [];
  }

  /** Chebyshev distance between two cells. */
  cheb(a: number, b: number): number {
    return Math.max(
      Math.abs(this.x(a) - this.x(b)),
      Math.abs(this.y(a) - this.y(b)),
    );
  }

  /** Euclidean distance between two cells. */
  dist(a: number, b: number): number {
    return Math.hypot(this.x(a) - this.x(b), this.y(a) - this.y(b));
  }
}

/**
 * Connected components of the cells where `inSet(i)` holds.
 * Returns a label per cell (-1 outside the set) and the size of each label.
 */
export function components(
  g: Grid,
  inSet: (i: number) => boolean,
  conn: 4 | 8,
): { label: Int32Array; sizes: number[]; cells: number[][] } {
  const label = new Int32Array(g.n).fill(-1);
  const sizes: number[] = [];
  const cells: number[][] = [];
  const offsets = conn === 4 ? N4 : N8;
  const stack: number[] = [];
  for (let s = 0; s < g.n; s++) {
    if (at(label, s) !== -1 || !inSet(s)) continue;
    const id = sizes.length;
    const members: number[] = [];
    label[s] = id;
    stack.push(s);
    while (stack.length > 0) {
      const i = stack.pop() as number;
      members.push(i);
      for (const j of g.around(i, offsets)) {
        if (at(label, j) === -1 && inSet(j)) {
          label[j] = id;
          stack.push(j);
        }
      }
    }
    sizes.push(members.length);
    cells.push(members);
  }
  return { label, sizes, cells };
}

/**
 * Chamfer distance (1 and sqrt 2 steps) from every cell to the nearest source
 * cell, ignoring obstacles. Sources have distance 0. Also returns, per cell,
 * the index of the source it is nearest to.
 */
export function chamferDistance(
  g: Grid,
  isSource: (i: number) => boolean,
): { dist: Float64Array; nearest: Int32Array } {
  const INF = 1e9;
  const dist = new Float64Array(g.n).fill(INF);
  const nearest = new Int32Array(g.n).fill(-1);
  for (let i = 0; i < g.n; i++) {
    if (isSource(i)) {
      dist[i] = 0;
      nearest[i] = i;
    }
  }
  const D = Math.SQRT2;
  const relax = (i: number, x: number, y: number, cost: number): void => {
    if (!g.inside(x, y)) return;
    const j = g.idx(x, y);
    const d = at(dist, j) + cost;
    if (d < at(dist, i)) {
      dist[i] = d;
      nearest[i] = at(nearest, j);
    }
  };
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const i = g.idx(x, y);
      relax(i, x - 1, y, 1);
      relax(i, x, y - 1, 1);
      relax(i, x - 1, y - 1, D);
      relax(i, x + 1, y - 1, D);
    }
  }
  for (let y = g.h - 1; y >= 0; y--) {
    for (let x = g.w - 1; x >= 0; x--) {
      const i = g.idx(x, y);
      relax(i, x + 1, y, 1);
      relax(i, x, y + 1, 1);
      relax(i, x + 1, y + 1, D);
      relax(i, x - 1, y + 1, D);
    }
  }
  return { dist, nearest };
}

/** Binary min-heap of (priority, value) pairs. */
export class MinHeap {
  private pri: number[] = [];
  private val: number[] = [];

  get size(): number {
    return this.pri.length;
  }

  push(priority: number, value: number): void {
    const pri = this.pri;
    const val = this.val;
    let k = pri.length;
    pri.push(priority);
    val.push(value);
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (at(pri, p) <= priority) break;
      pri[k] = at(pri, p);
      val[k] = at(val, p);
      k = p;
    }
    pri[k] = priority;
    val[k] = value;
  }

  /** Removes the smallest entry; returns its value (heap must be non-empty). */
  pop(): { priority: number; value: number } {
    const pri = this.pri;
    const val = this.val;
    const top = { priority: at(pri, 0), value: at(val, 0) };
    const lastP = pri.pop() as number;
    const lastV = val.pop() as number;
    const n = pri.length;
    if (n > 0) {
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && at(pri, r) < at(pri, l) ? r : l;
        if (at(pri, c) >= lastP) break;
        pri[k] = at(pri, c);
        val[k] = at(val, c);
        k = c;
      }
      pri[k] = lastP;
      val[k] = lastV;
    }
    return top;
  }
}

// ---------------------------------------------------------------------------
// Noise

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Lattice value in [0, 1) for integer coordinates. */
function lattice(ix: number, iy: number, salt: number): number {
  return hashInts(ix, iy, salt) / 0x1_0000_0000;
}

/** Smooth value noise in [0, 1) with a feature size of `scale` cells. */
export function valueNoise(
  x: number,
  y: number,
  scale: number,
  salt: number,
): number {
  const fx = x / scale;
  const fy = y / scale;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = smooth(fx - ix);
  const ty = smooth(fy - iy);
  const a = lattice(ix, iy, salt);
  const b = lattice(ix + 1, iy, salt);
  const c = lattice(ix, iy + 1, salt);
  const d = lattice(ix + 1, iy + 1, salt);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

/**
 * Fractal value noise in [0, 1): `octaves` layers, each half the scale and
 * half the weight of the previous one.
 */
export function fbm(
  x: number,
  y: number,
  scale: number,
  salt: number,
  octaves = 3,
): number {
  let sum = 0;
  let norm = 0;
  let amp = 1;
  let s = scale;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x, y, s, salt + o * 7919);
    norm += amp;
    amp *= 0.5;
    s = Math.max(1, s / 2);
  }
  return sum / norm;
}

/** A per-cell noise field sampled at cell centres. */
export function noiseField(
  g: Grid,
  scale: number,
  salt: number,
  octaves = 3,
): Float64Array {
  const out = new Float64Array(g.n);
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      out[g.idx(x, y)] = fbm(x + 0.5, y + 0.5, scale, salt, octaves);
    }
  }
  return out;
}

/**
 * The value below which a fraction `q` of the selected cells' values lie
 * (noise is not uniform, so thresholds are taken as quantiles).
 */
export function quantile(
  values: ArrayLike<number>,
  cells: readonly number[],
  q: number,
): number {
  if (cells.length === 0) return 0;
  const sorted = cells.map((i) => at(values, i)).sort((a, b) => a - b);
  const k = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(q * sorted.length)),
  );
  return sorted[k] ?? 0;
}
