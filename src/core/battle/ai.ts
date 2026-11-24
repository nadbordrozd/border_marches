/**
 * Battle AI (neutrals, enemies and auto-combat): one-ply greedy.
 *
 * - Attacks and shots score  HP destroyed x target value per HP
 *   minus HP lost to retaliation x own value per HP, using the exact preview.
 * - Melee units otherwise approach the most valuable enemy stack:
 *   move = -2 x distance to it after the move; defend = -2 x current
 *   distance + 1 (so a stack already in contact holds instead of shuffling).
 * - Ranged units with shots otherwise keep out of contact:
 *   move = -10 x adjacent enemies - 1, defend = -10 x adjacent enemies.
 * - Wait is never chosen. Ties go to the earliest action in
 *   {@link legalActions} order, so the AI is fully deterministic: a pure
 * function of the battle state (the intents of RULES_V2 1.13 rely on it).
 * - Activated abilities and hero acts are left to the AI bead.
 */

import { isAlive } from "./abilities.ts";
import { totalHp } from "./damage.ts";
import { blockingHexes } from "./resolve.ts";
import {
  activeStack,
  isRangedCreature,
  legalActions,
  previewAttack,
} from "./engine.ts";
import {
  BATTLE_HEX_COUNT,
  hexFromIndex,
  hexIndex,
  isAdjacent,
  neighbors,
} from "./hex.ts";
import type { Hex } from "./hex.ts";
import type {
  BattleAction,
  BattleCreatureStats,
  BattleStack,
  BattleState,
} from "./types.ts";

/** AI value per HP by tier (about gold cost per HP of the Lost World tiers). */
export const AI_VALUE_PER_HP_BY_TIER: readonly number[] = [
  5, 8, 10, 13, 14, 15,
];

export function aiValuePerHp(creature: BattleCreatureStats): number {
  if (creature.aiValuePerHp !== undefined) return creature.aiValuePerHp;
  const t = Math.min(6, Math.max(1, Math.round(creature.tier)));
  return AI_VALUE_PER_HP_BY_TIER[t - 1] as number;
}

export function stackValue(stack: BattleStack): number {
  return (
    totalHp({ count: stack.count, hp: stack.creature.hp, topHp: stack.topHp }) *
    aiValuePerHp(stack.creature)
  );
}

export interface ScoredAction {
  readonly action: BattleAction;
  readonly score: number;
}

const UNREACHABLE = 99;

/** Hex distance to `target` around blocking ground only (stacks ignored). */
function distanceField(state: BattleState, target: Hex): Int16Array {
  const dist = new Int16Array(BATTLE_HEX_COUNT).fill(-1);
  const blocked = new Uint8Array(BATTLE_HEX_COUNT);
  for (const o of blockingHexes(state)) blocked[hexIndex(o)] = 1;
  const start = hexIndex(target);
  dist[start] = 0;
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi] as number;
    for (const n of neighbors(hexFromIndex(cur))) {
      const ni = hexIndex(n);
      if (blocked[ni] || dist[ni] !== -1) continue;
      dist[ni] = (dist[cur] as number) + 1;
      queue.push(ni);
    }
  }
  return dist;
}

function adjacentEnemies(
  state: BattleState,
  self: BattleStack,
  at: Hex,
): number {
  let n = 0;
  for (const s of state.stacks) {
    if (isAlive(s) && s.side !== self.side && isAdjacent(s.hex, at)) n++;
  }
  return n;
}

/** Every legal action of the active stack with its AI score. */
export function scoreActions(state: BattleState): ScoredAction[] {
  const self = activeStack(state);
  if (!self) return [];
  const actions = legalActions(state);
  const enemies = state.stacks.filter(
    (s) => isAlive(s) && s.side !== self.side,
  );
  const keepsDistance = isRangedCreature(self.creature) && self.shotsLeft > 0;

  let field: Int16Array | null = null;
  if (!keepsDistance && enemies.length > 0) {
    let best = enemies[0] as BattleStack;
    for (const e of enemies) if (stackValue(e) > stackValue(best)) best = e;
    field = distanceField(state, best.hex);
  }
  const distAt = (h: Hex): number => {
    const d = field ? (field[hexIndex(h)] as number) : -1;
    return d < 0 ? UNREACHABLE : d;
  };

  const out: ScoredAction[] = [];
  for (const action of actions) {
    switch (action.type) {
      case "attack":
      case "shoot": {
        const p = previewAttack(state, action);
        const target = state.stacks.find(
          (s) => s.id === action.targetId,
        ) as BattleStack;
        const gained = p.strike.hpLost * aiValuePerHp(target.creature);
        const lost = (p.retaliation?.hpLost ?? 0) * aiValuePerHp(self.creature);
        out.push({ action, score: gained - lost });
        break;
      }
      case "move":
        out.push({
          action,
          score: keepsDistance
            ? -10 * adjacentEnemies(state, self, action.to) - 1
            : -2 * distAt(action.to),
        });
        break;
      case "defend":
        out.push({
          action,
          score: keepsDistance
            ? -10 * adjacentEnemies(state, self, self.hex)
            : -2 * distAt(self.hex) + 1,
        });
        break;
      case "wait":
        break;
    }
  }
  return out;
}

/** The AI's action for the active stack. Throws when the battle is over. */
export function chooseAiAction(state: BattleState): BattleAction {
  let best: ScoredAction | null = null;
  for (const s of scoreActions(state)) {
    if (best === null || s.score > best.score) best = s;
  }
  if (!best) throw new Error("no action: the battle is over");
  return best.action;
}
