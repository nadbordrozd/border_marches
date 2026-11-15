import {
  battleStatsFromCreature,
  createBattle,
} from "../../../src/core/battle/index.ts";
import type {
  BattleStack,
  BattleState,
  BattleStackSetup,
  Hex,
  HeroBattleStats,
} from "../../../src/core/battle/index.ts";
import { getCreature } from "../../../src/data/creatures.ts";

export const at = (col: number, row: number): Hex => ({ col, row });

export function unit(id: string, count: number, hex: Hex): BattleStackSetup {
  return { creature: battleStatsFromCreature(getCreature(id)), count, hex };
}

/** A battle without obstacles from explicit stacks. */
export function battle(
  attacker: BattleStackSetup[],
  defender: BattleStackSetup[],
  hero: HeroBattleStats | null = { attack: 2, defense: 2 },
): BattleState {
  return createBattle({
    seed: 1,
    obstacles: [],
    attacker: { hero, stacks: attacker },
    defender: { hero: null, stacks: defender },
  }).state;
}

export function patch(
  state: BattleState,
  id: string,
  p: Partial<BattleStack>,
): BattleState {
  return {
    ...state,
    stacks: state.stacks.map((s) => (s.id === id ? { ...s, ...p } : s)),
  };
}
