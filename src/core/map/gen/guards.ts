/**
 * Guard sizing for neutral stacks (GAME_DESIGN.md section 8), using the
 * neutral roster, guard rings and Hold garrison from src/data/neutrals.ts.
 */
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

/** Ring of a movement-cost distance from the player's town. */
export function ringOf(cost: number): number {
  for (const r of GUARD_RINGS) {
    if (cost <= r.maxDistance) return r.ring;
  }
  return GUARD_RINGS.length - 1;
}

/** How strong a guard should be within its ring. */
export type GuardGrade = "light" | "normal" | "valuable";

/**
 * A guard stack for an object at the given ring: a target fight value inside
 * the ring's band (low for light guards, the top for valuable objects), and a
 * creature whose count for that value is between 5 and 50.
 */
export function sizeGuard(
  rng: Rng,
  ring: number,
  grade: GuardGrade,
): { creature: string; count: number; fv: number } {
  const band = GUARD_RINGS[Math.min(ring, GUARD_RINGS.length - 1)];
  const lo = band?.minFightValue ?? 600;
  const hi = band?.maxFightValue ?? 1200;
  const t =
    grade === "light"
      ? rng.float(0, 0.3)
      : grade === "valuable"
        ? rng.float(0.75, 1)
        : rng.float(0.25, 0.65);
  const target = lo + (hi - lo) * t;
  const roster = NEUTRAL_CREATURE_IDS.map((id) => NEUTRAL_CREATURES[id]);
  const fits = roster.filter((c) => {
    const n = Math.round(target / c.fightValue);
    return n >= 5 && n <= 50;
  });
  const pool = fits.length > 0 ? fits : roster.slice(0, 1);
  const creature = rng.pick(pool);
  const count = Math.max(1, Math.round(target / creature.fightValue));
  return { creature: creature.id, count, fv: count * creature.fightValue };
}
