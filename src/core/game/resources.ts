/**
 * Integer arithmetic on resource bundles.
 */
import { RESOURCE_IDS } from "../../data/economy.ts";
import type { ResourceAmounts, Resources } from "../../data/types.ts";

export function emptyResources(): Resources {
  return { gold: 0, wood: 0, ore: 0, essence: 0 };
}

/** A full bundle from a partial one (missing resources are 0). */
export function toResources(amounts: ResourceAmounts): Resources {
  return {
    gold: amounts.gold ?? 0,
    wood: amounts.wood ?? 0,
    ore: amounts.ore ?? 0,
    essence: amounts.essence ?? 0,
  };
}

export function addResources(a: Resources, b: ResourceAmounts): Resources {
  const out = { ...a };
  for (const r of RESOURCE_IDS) out[r] += b[r] ?? 0;
  return out;
}

export function subtractResources(a: Resources, b: ResourceAmounts): Resources {
  const out = { ...a };
  for (const r of RESOURCE_IDS) out[r] -= b[r] ?? 0;
  return out;
}

/** The cost multiplied by n. */
export function scaleResources(cost: ResourceAmounts, n: number): Resources {
  const out = emptyResources();
  for (const r of RESOURCE_IDS) out[r] = (cost[r] ?? 0) * n;
  return out;
}

export function canAfford(have: Resources, cost: ResourceAmounts): boolean {
  return RESOURCE_IDS.every((r) => have[r] >= (cost[r] ?? 0));
}

/** The largest n such that n x cost is affordable (Infinity for a free cost). */
export function maxAffordable(have: Resources, cost: ResourceAmounts): number {
  let n = Number.POSITIVE_INFINITY;
  for (const r of RESOURCE_IDS) {
    const c = cost[r] ?? 0;
    if (c > 0) n = Math.min(n, Math.floor(have[r] / c));
  }
  return n;
}
