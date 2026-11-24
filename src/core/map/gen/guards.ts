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
  NEUTRAL_CREATURE_IDS,
  NEUTRAL_CREATURES,
} from "../../../data/neutrals.ts";
import type { Rng } from "../../rng.ts";

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

/**
 * One neutral stack worth about `target` fight value: a creature whose
 * count for that value falls between 5 and 50 (the weakest when none does).
 */
export function stackFor(rng: Rng, target: number): GuardStack {
  const roster = NEUTRAL_CREATURE_IDS.map((id) => NEUTRAL_CREATURES[id]);
  const fits = roster.filter((c) => {
    const n = Math.round(target / c.fightValue);
    return n >= 5 && n <= 50;
  });
  const pool =
    fits.length > 0
      ? fits
      : target < 5 * (roster[0]?.fightValue ?? 50)
        ? roster.slice(0, 1)
        : roster.slice(-1);
  const creature = rng.pick(pool);
  const count = Math.max(1, Math.round(target / creature.fightValue));
  return { creature: creature.id, count, fv: count * creature.fightValue };
}

/** A guard for a prize of `value` at `ring`. */
export function sizeGuard(
  rng: Rng,
  value: number,
  ring: number,
  jitter: number,
  minFv: number,
): GuardStack {
  const target = Math.max(
    minFv,
    guardTarget(value, ring) * (1 + rng.float(-jitter, jitter)),
  );
  return stackFor(rng, target);
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
