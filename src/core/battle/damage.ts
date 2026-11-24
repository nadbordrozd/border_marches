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
  /** Percentage multipliers as whole percentages (140 = x 1.40). */
  readonly percents?: readonly number[];
  /** Ranged creature fighting in melee: x 0.5. */
  readonly halved?: boolean;
}

/** The Strike percentage product P is clamped to 1/4 .. 4 (RULES_V2 1.8). */
export const P_MIN: Rational = { num: 1, den: 4 };
export const P_MAX: Rational = { num: 4, den: 1 };

/** The product of whole percentages as an exact rational (BigInt). */
function percentProduct(percents: readonly number[]): {
  num: bigint;
  den: bigint;
} {
  let num = 1n;
  let den = 1n;
  for (const p of percents) {
    if (!Number.isInteger(p) || p < 0) {
      throw new RangeError(`multiplier must be a whole percent, got ${p}`);
    }
    num *= BigInt(p);
    den *= 100n;
  }
  return { num, den };
}

function reduce(num: bigint, den: bigint): Rational {
  const g = (a: bigint, b: bigint): bigint => (b === 0n ? a : g(b, a % b));
  const d = g(num < 0n ? -num : num, den) || 1n;
  return { num: Number(num / d), den: Number(den / d) };
}

/**
 * Clamps an exact product to [lo, hi]; returns the clamped rational and
 * whether the clamp changed it.
 */
function clampProduct(
  num: bigint,
  den: bigint,
  lo: Rational,
  hi: Rational,
): { value: Rational; capped: boolean } {
  if (num * BigInt(hi.den) > BigInt(hi.num) * den) {
    return { value: hi, capped: true };
  }
  if (num * BigInt(lo.den) < BigInt(lo.num) * den) {
    return { value: lo, capped: true };
  }
  return { value: reduce(num, den), capped: false };
}

/** P for a Strike: product of percentages, clamped to 1/4 .. 4. */
export function strikePercentProduct(percents: readonly number[]): {
  value: Rational;
  capped: boolean;
} {
  const { num, den } = percentProduct(percents);
  return clampProduct(num, den, P_MIN, P_MAX);
}

/**
 * damage = max(1, floor(count x Dmg x M x P x (0.5 if ranged in melee))),
 * computed exactly, with P = the product of the percentage multipliers
 * clamped to 1/4 .. 4 (RULES_V2 1.8).
 */
export function computeDamage(input: DamageInput): {
  damage: number;
  multiplier: Rational;
  percentProduct: Rational;
  percentCapped: boolean;
} {
  const m = attackDefenseMultiplier(input.attack, input.defense);
  const p = strikePercentProduct(input.percents ?? []);
  const num =
    BigInt(input.count) *
    BigInt(input.damagePerCreature) *
    BigInt(m.num) *
    BigInt(p.value.num);
  let den = BigInt(m.den) * BigInt(p.value.den);
  if (input.halved) den *= 2n;
  const floored = Number(num / den);
  return {
    damage: Math.max(1, floored),
    multiplier: m,
    percentProduct: p.value,
    percentCapped: p.capped,
  };
}

/** Q for Harm: "Harm taken" percentages, x 2 if Fuelled, clamped 1/4 .. 4. */
export function harmMultiplier(
  percents: readonly number[],
  fuelled = false,
): Rational {
  const { num, den } = percentProduct(fuelled ? [...percents, 200] : percents);
  return clampProduct(num, den, P_MIN, P_MAX).value;
}

/**
 * Harm (RULES_V2 1.8): floor(X x Q). X is a non-negative integer that never
 * reads a stack's hit points; Harm of 0 is legal and does nothing.
 */
export function computeHarm(
  x: number,
  percents: readonly number[] = [],
  fuelled = false,
): { harm: number; q: Rational } {
  if (!Number.isInteger(x) || x < 0) {
    throw new RangeError(`Harm must be a non-negative integer, got ${x}`);
  }
  const q = harmMultiplier(percents, fuelled);
  return { harm: Math.floor((x * q.num) / q.den), q };
}

/** Exact floor(sqrt(n)) for a non-negative BigInt. */
function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = BigInt(Math.floor(Math.sqrt(Number(n))));
  while (x * x > n) x -= 1n;
  while ((x + 1n) * (x + 1n) <= n) x += 1n;
  return x;
}

/**
 * Creature fight value (GAME_DESIGN 8.2), exactly:
 * round(10 x sqrt(HP x Dmg) x (1 + 0.05 x (Atk + Def)) x (1.25 if ranged)).
 * Integer-only: round(sqrt(N)) = floor((floor(sqrt(4N)) + 1) / 2).
 */
export function creatureFightValue(c: {
  readonly hp: number;
  readonly damage: number;
  readonly attack: number;
  readonly defense: number;
  readonly shots?: number;
}): number {
  // value = 10 x sqrt(HP x Dmg) x (20 + A + D) / 20 x (5/4 if ranged)
  // N = value^2 = 100 x HP x Dmg x (20 + A + D)^2 / 400 x (25/16 if ranged)
  const k = BigInt(20 + c.attack + c.defense);
  let num = 100n * BigInt(c.hp) * BigInt(c.damage) * k * k;
  let den = 400n;
  if ((c.shots ?? 0) > 0) {
    num *= 25n;
    den *= 16n;
  }
  const s = isqrt((4n * num) / den);
  return Number((s + 1n) / 2n);
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
