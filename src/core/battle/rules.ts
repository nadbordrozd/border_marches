/**
 * Hero battle rules (RULES_V2 4.6 form 5 switches, feat and vow rules,
 * artifact reactions): small readers the grammar calls where a rule bends
 * it. A side's rules are ids of src/data/effects.ts `RULE_SWITCH_IDS`,
 * carried in `BattleSideState.rules`; once-per-battle uses are recorded in
 * `rulesUsed`.
 *
 * "Your" in a rule is the side a stack fights for when the rule acts
 * (law 4), so readers take the side, never the owner.
 */
import { creatureFightValue } from "./damage.ts";
import { hexDistance, isAdjacent, type Hex } from "./hex.ts";
import type {
  BattleSide,
  BattleSideState,
  BattleStack,
  StackId,
} from "./types.ts";

type Sides = {
  readonly sides: { readonly [S in BattleSide]: BattleSideState };
};

/** Alive: at least one creature (as abilities.ts, which imports this). */
const isAlive = (s: BattleStack): boolean => s.count > 0;

/**
 * Long Shadow: how far an ability of `owner` that says "adjacent" reaches
 * (1, or 2 for the side's strongest one, two or all stacks by rank).
 */
export function abilityReach(
  state: Sides & { readonly stacks: readonly BattleStack[] },
  owner: BattleStack,
): number {
  const side = owner.side;
  if (hasRule(state, side, "long-shadow-3")) return 2;
  const n = hasRule(state, side, "long-shadow-2")
    ? 2
    : hasRule(state, side, "long-shadow-1")
      ? 1
      : 0;
  if (n === 0) return 1;
  return strongestOf(state.stacks, side, n).some((s) => s.id === owner.id)
    ? 2
    : 1;
}

/** Whether `side`'s hero has the rule. */
export function hasRule(state: Sides, side: BattleSide, id: string): boolean {
  return (state.sides[side].rules ?? []).includes(id);
}

/** Whether a once-per-battle use (`key`) is already recorded for `side`. */
export function ruleUsed(state: Sides, side: BattleSide, key: string): boolean {
  return (state.sides[side].rulesUsed ?? []).includes(key);
}

export function otherSide(side: BattleSide): BattleSide {
  return side === "attacker" ? "defender" : "attacker";
}

/** Stack fight value (count x creature FV), the "strongest" measure. */
export function stackValue(s: BattleStack): number {
  return s.count * creatureFightValue(s.creature);
}

/**
 * The `n` strongest living stacks fighting for `side`, ties to field
 * order (RULES_V2 0.2 selectors).
 */
export function strongestOf(
  stacks: readonly BattleStack[],
  side: BattleSide,
  n = 1,
): BattleStack[] {
  return stacks
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => isAlive(s) && s.side === side)
    .sort((a, b) => stackValue(b.s) - stackValue(a.s) || a.i - b.i)
    .slice(0, n)
    .map(({ s }) => s);
}

/** Living stacks adjacent to `hex` that pass `filter`, in field order. */
export function adjacentStacks(
  stacks: readonly BattleStack[],
  hex: Hex,
  filter: (s: BattleStack) => boolean = () => true,
): BattleStack[] {
  return stacks.filter(
    (s) => isAlive(s) && isAdjacent(s.hex, hex) && filter(s),
  );
}

/**
 * The nearest living stack to `hex` passing `filter`: hex distance, then
 * field order.
 */
export function nearestStack(
  stacks: readonly BattleStack[],
  hex: Hex,
  filter: (s: BattleStack) => boolean = () => true,
): BattleStack | null {
  let best: BattleStack | null = null;
  let bestDist = Infinity;
  for (const s of stacks) {
    if (!isAlive(s) || !filter(s)) continue;
    const d = hexDistance(s.hex, hex);
    if (d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}

/** How many of a side's strongest stacks Riposte reaches (0 to 3). */
export function riposteReach(state: Sides, side: BattleSide): number {
  for (const n of [3, 2, 1]) if (hasRule(state, side, `riposte-${n}`)) return n;
  return 0;
}

/**
 * Retaliations a stack may make this round (1 by default): Riposte gives
 * its side's strongest stacks 2; Shield Wall makes a Shielded stack
 * unlimited.
 */
export function retaliationLimit(
  state: Sides & { readonly stacks: readonly BattleStack[] },
  s: BattleStack,
): number {
  if (
    hasRule(state, s.side, "shield-wall") &&
    s.conditions.some((c) => c.kind === "shielded")
  ) {
    return Infinity;
  }
  const reach = riposteReach(state, s.side);
  if (
    reach > 0 &&
    strongestOf(state.stacks, s.side, reach).some((x) => x.id === s.id)
  ) {
    return 2;
  }
  return 1;
}

/** Ids of stacks, for messages. */
export function ids(stacks: readonly BattleStack[]): StackId[] {
  return stacks.map((s) => s.id);
}
