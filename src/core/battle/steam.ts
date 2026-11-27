/**
 * Steam (FACTION_DWARVES.md section 3): the condition the Deepforge's
 * Stoke, its Great Boiler and the Pocket Boiler make. The kind itself is
 * registered with the faction's content (factions/dwarves.ts); this module
 * holds the one operation the engine and the content share, so the
 * Pocket Boiler (engine.ts, a Defend) and Stoke grow Steam the same way.
 */

import { ability } from "./registry.ts";
import type { Effects } from "./registry.ts";
import { hasRule } from "./rules.ts";
import type { BattleStack, BattleState, StackId } from "./types.ts";

/** The Steam condition kind's id. */
export const STEAM = "steam";
/** Steam never grows beyond this, whatever its size at creation. */
export const STEAM_MAX = 3;
/** A Strike that spends Steam of size n is x (100 + 50 n)%. */
export const STEAM_PERCENT_PER_SIZE = 50;

/** The Steam a stack bears now, 0 when none. */
export function steamOf(stack: BattleStack): number {
  return stack.conditions.find((c) => c.kind === STEAM)?.size ?? 0;
}

/**
 * Whether the stack's Defend also stokes it: a native's Stoke (an ability
 * with an `onDefend` hook) or its side's Pocket Boiler (engine.ts Defend).
 */
export function stokesOnDefend(
  state: BattleState,
  stack: BattleStack,
): boolean {
  return (
    stack.creature.abilities.some((a) => ability(a).onDefend !== undefined) ||
    hasRule(state, stack.side, "pocket-boiler")
  );
}

/** Gives a stack Steam `size` (to at most 3); an existing Steam merges. */
export function addSteam(fx: Effects, id: StackId, size = 1): void {
  fx.addCondition(id, {
    kind: STEAM,
    size: Math.min(STEAM_MAX, size),
    maxSize: STEAM_MAX,
    clock: null,
  });
}

/**
 * Stoke: the stack gains Steam 1, or its Steam grows by 1 (the feed
 * operation by 1, RULES_V2 1.7), to at most 3.
 */
export function stoke(fx: Effects, id: StackId): void {
  if (!fx.isAlive(id)) return;
  const c = fx.stack(id).conditions.find((x) => x.kind === STEAM);
  if (c === undefined) addSteam(fx, id, 1);
  else fx.feedCondition(id, c.uid, 1);
}
