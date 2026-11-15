/**
 * The damage and kill maths of GAME_DESIGN.md sections 9.4 and 9.5, in exact
 * integer arithmetic. No floating point touches a game number: M is a
 * rational, ability multipliers are whole percentages, and the product is
 * floored with BigInt division.
 */

import type { Rational } from "./types.ts";

/** M cap above: 4.0 = 80 / 20. */
const M_MAX_NUM = 80;
/** M cap below: 0.3 = 3 / 10. */
const M_MIN: Rational = { num: 3, den: 10 };

/**
 * The Attack/Defense multiplier M:
 * A >= D: min(4.0, (20 + (A - D)) / 20); A < D: max(0.3, 20 / (20 + (D - A))).
 */
export function attackDefenseMultiplier(
  attack: number,
  defense: number,
): Rational {
  if (attack >= defense) {
    return { num: Math.min(M_MAX_NUM, 20 + (attack - defense)), den: 20 };
  }
  const den = 20 + (defense - attack);
  // 20 / den < 3 / 10  <=>  200 < 3 * den
  if (200 < 3 * den) return M_MIN;
  return { num: 20, den };
}

/** Defend: round_half_up(D x 1.3), exactly. */
export function defendedDefense(defense: number): number {
  return Math.floor((defense * 13 + 5) / 10);
}

export interface DamageInput {
  readonly count: number;
  readonly damagePerCreature: number;
  readonly attack: number;
  readonly defense: number;
  /** Ability multipliers as whole percentages (140 = x 1.40). */
  readonly percents?: readonly number[];
  /** Ranged creature fighting in melee: x 0.5. */
  readonly halved?: boolean;
}

/**
 * damage = max(1, floor(count x Dmg x M x (ability multipliers) x (0.5 if
 * ranged in melee))), computed exactly.
 */
export function computeDamage(input: DamageInput): {
  damage: number;
  multiplier: Rational;
} {
  const m = attackDefenseMultiplier(input.attack, input.defense);
  let num =
    BigInt(input.count) * BigInt(input.damagePerCreature) * BigInt(m.num);
  let den = BigInt(m.den);
  for (const p of input.percents ?? []) {
    if (!Number.isInteger(p) || p < 0) {
      throw new RangeError(
        `ability multiplier must be a whole percent, got ${p}`,
      );
    }
    num *= BigInt(p);
    den *= 100n;
  }
  if (input.halved) den *= 2n;
  const floored = Number(num / den);
  return { damage: Math.max(1, floored), multiplier: m };
}

export interface StackHealth {
  readonly count: number;
  /** Full creature HP (H). */
  readonly hp: number;
  /** HP left on the top creature (h), 1..H while alive. */
  readonly topHp: number;
}

export interface KillResult {
  readonly kills: number;
  readonly count: number;
  /** New top creature HP; 0 when the stack died. */
  readonly topHp: number;
  /** HP actually removed (damage capped at the stack's total HP). */
  readonly hpLost: number;
}

/** Total HP of a stack: (n - 1) x H + h. */
export function totalHp(stack: StackHealth): number {
  return stack.count <= 0 ? 0 : (stack.count - 1) * stack.hp + stack.topHp;
}

/** Section 9.5: kills from the top creature's remaining HP. */
export function applyDamageToStack(
  stack: StackHealth,
  damage: number,
): KillResult {
  const { count: n, hp: H, topHp: h } = stack;
  if (n <= 0) return { kills: 0, count: 0, topHp: 0, hpLost: 0 };
  const hpLost = Math.min(damage, totalHp(stack));
  if (damage < h) {
    return { kills: 0, count: n, topHp: h - damage, hpLost };
  }
  const r = damage - h;
  const kills = Math.min(n, 1 + Math.floor(r / H));
  const count = n - kills;
  if (count === 0) return { kills, count: 0, topHp: 0, hpLost };
  return { kills, count, topHp: H - (r % H), hpLost };
}
