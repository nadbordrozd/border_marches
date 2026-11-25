/**
 * Sorted-list helpers for the incremental terrain (bead xaj.31): keeping a
 * list sorted after a few items come and go costs a merge, not a sort.
 */

/** Merges two lists sorted by `compare` into one (ties: `a` first). */
export function mergeSorted<T>(
  a: readonly T[],
  b: readonly T[],
  compare: (x: T, y: T) => number,
): T[] {
  const out: T[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const x = a[i] as T;
    const y = b[j] as T;
    if (compare(y, x) < 0) {
      out.push(y);
      j += 1;
    } else {
      out.push(x);
      i += 1;
    }
  }
  for (; i < a.length; i += 1) out.push(a[i] as T);
  for (; j < b.length; j += 1) out.push(b[j] as T);
  return out;
}

/**
 * `old` (a stable sort by `compare` of some list) without the `removed`
 * items and with the `added` ones, in order; or null when an added item
 * ties with another item, since then only the list's own order (a full
 * stable sort) can place it. Without such ties the result is exactly the
 * stable sort of the new list, provided the items kept stay in the same
 * relative order in it.
 */
export function updateSorted<T>(
  old: readonly T[],
  removed: ReadonlySet<T>,
  added: readonly T[],
  compare: (x: T, y: T) => number,
): T[] | null {
  const add = [...added].sort(compare);
  for (let k = 1; k < add.length; k += 1)
    if (compare(add[k - 1] as T, add[k] as T) === 0) return null;
  const out: T[] = [];
  let j = 0;
  for (const x of old) {
    if (removed.has(x)) continue;
    while (j < add.length) {
      const c = compare(add[j] as T, x);
      if (c === 0) return null;
      if (c > 0) break;
      out.push(add[j] as T);
      j += 1;
    }
    out.push(x);
  }
  for (; j < add.length; j += 1) out.push(add[j] as T);
  return out;
}
