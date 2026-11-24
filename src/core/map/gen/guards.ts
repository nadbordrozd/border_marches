/**
 * Guard sizing for neutral stacks (GAME_DESIGN.md section 8), tied to the
 * value of what they guard (bead bzc.3): a guard's fight value is the prize
 * value times GUARD_FV_PER_VALUE, nudged by the ring (distance from the
 * nearest player town) and a small jitter, so the fight is roughly in
 * proportion to the prize. Values come from the shared object table in
 * src/data/mapObjects.ts.
 */
import {
  GUARD_FV_PER_VALUE,
  GUARD_RING_FACTOR,
} from "../../../data/mapObjects.ts";
import {
  GUARD_RINGS,
  HOLD_DEFENSE_BONUS,
  HOLD_GARRISON,
  HOLD_NAME,
} from "../../../data/neutrals.ts";
import {
  GUARD_CREATURE_IDS,
  STRAY_CREATURES,
  STRAY_HOMES,
} from "../../../data/strays.ts";
import type { CreatureDef } from "../../../data/types.ts";
import type { Rng } from "../../rng.ts";
import type { Terrain } from "../types.ts";

export { HOLD_DEFENSE_BONUS, HOLD_GARRISON, HOLD_NAME };

/** Ring of a movement-cost distance from the nearest player town. */
export function ringOf(cost: number): number {
  for (const r of GUARD_RINGS) {
    if (cost <= r.maxDistance) return r.ring;
  }
  return GUARD_RINGS.length - 1;
}

/** Target fight value for a prize of `value` at `ring`, before jitter. */
export function guardTarget(value: number, ring: number): number {
  const f =
    GUARD_RING_FACTOR[Math.min(ring, GUARD_RING_FACTOR.length - 1)] ?? 1;
  return value * GUARD_FV_PER_VALUE * f;
}

export interface GuardStack {
  creature: string;
  count: number;
  fv: number;
}

/** Where a guard stands: picks strays of its terrain and ring. */
export interface GuardPlace {
  terrain?: Terrain;
  ring?: number;
  /** A creature that must guard (a Haunted Mine's Sextons). */
  force?: string;
}

/** The guard roster (strays and caretakers, CONTENT_CREATURES), by FV. */
const ROSTER: readonly CreatureDef[] = GUARD_CREATURE_IDS.map(
  (id) => STRAY_CREATURES[id],
).sort((a, b) => a.fightValue - b.fightValue);

/**
 * One neutral stack worth about `target` fight value (CONTENT_CREATURES
 * section 3): a stray of the cell's terrain and ring whose count for that
 * value falls between 5 and 50; else any stray whose count fits; else the
 * weakest or the strongest.
 */
export function stackFor(
  rng: Rng,
  target: number,
  place: GuardPlace = {},
): GuardStack {
  const roster = ROSTER;
  const forced = roster.find((c) => c.id === place.force);
  const fitsCount = (c: CreatureDef): boolean => {
    const n = Math.round(target / c.fightValue);
    return n >= 5 && n <= 50;
  };
  const home = (c: CreatureDef): boolean => {
    const h = STRAY_HOMES[c.id as keyof typeof STRAY_HOMES];
    if (h === undefined) return false;
    const okTerrain =
      place.terrain === undefined || h.terrain.includes(place.terrain);
    const ring = place.ring;
    const okRing =
      ring === undefined || (ring >= h.rings[0] && ring <= h.rings[1]);
    return okTerrain && okRing;
  };
  const local = roster.filter((c) => home(c) && fitsCount(c));
  const fits = roster.filter(fitsCount);
  const pool =
    forced !== undefined
      ? [forced]
      : local.length > 0
        ? local
        : fits.length > 0
          ? fits
          : target < 5 * (roster[0]?.fightValue ?? 50)
            ? roster.slice(0, 1)
            : roster.slice(-1);
  const creature = rng.pick(pool);
  const count = Math.max(1, Math.round(target / creature.fightValue));
  return { creature: creature.id, count, fv: count * creature.fightValue };
}

/** A guard for a prize of `value` at `ring` (strays of `place`). */
export function sizeGuard(
  rng: Rng,
  value: number,
  ring: number,
  jitter: number,
  minFv: number,
  place: GuardPlace = {},
): GuardStack {
  const target = Math.max(
    minFv,
    guardTarget(value, ring) * (1 + rng.float(-jitter, jitter)),
  );
  return stackFor(rng, target, { ring, ...place });
}

/** A town garrison worth about `target` fight value, in two or three stacks. */
export function garrisonFor(rng: Rng, target: number): GuardStack[] {
  const parts = target > 4000 ? 3 : 2;
  const shares = parts === 3 ? [0.45, 0.35, 0.2] : [0.6, 0.4];
  const out: GuardStack[] = [];
  for (const s of shares) {
    const stack = stackFor(rng, target * s);
    const same = out.find((o) => o.creature === stack.creature);
    if (same) {
      same.count += stack.count;
      same.fv += stack.fv;
    } else out.push(stack);
  }
  return out;
}
