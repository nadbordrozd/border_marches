/**
 * Whether the map being generated is naval (NAVAL 7.5, bead bzc.154): its
 * loot, banks, Mystery Bags, Tollhouses, shrines, scholars and tutors may
 * then hold the sea artifacts, the naval spells and Seafaring. Off by
 * default, so every other map filters them out before drawing and keeps
 * its seeded fingerprints. The generator's water modes (NAVAL bead 7) run a
 * naval map's generation inside {@link withNavalPools}.
 */
let navalPools = false;

/** Runs `fn` (one map's generation) with the naval pools on or off. */
export function withNavalPools<T>(naval: boolean, fn: () => T): T {
  const before = navalPools;
  navalPools = naval;
  try {
    return fn();
  } finally {
    navalPools = before;
  }
}

/** Whether the map being generated draws from the naval pools. */
export function navalPoolsOn(): boolean {
  return navalPools;
}
