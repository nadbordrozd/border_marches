import {
  applyAction,
  createBattle,
  getStack,
} from "../../../src/core/battle/index.ts";
import type {
  BattleAction,
  BattleEvent,
  BattleSetup,
  BattleStack,
  BattleState,
} from "../../../src/core/battle/index.ts";

/** A battle with no obstacles unless the setup says otherwise. */
export function start(setup: Omit<BattleSetup, "seed"> & { seed?: number }) {
  return createBattle({ seed: 1, obstacles: [], ...setup }).state;
}

/** Applies a sequence of actions, returning the final state and all events. */
export function play(
  state: BattleState,
  ...actions: BattleAction[]
): { state: BattleState; events: BattleEvent[] } {
  const events: BattleEvent[] = [];
  let cur = state;
  for (const a of actions) {
    const step = applyAction(cur, a);
    events.push(...step.events);
    cur = step.state;
  }
  return { state: cur, events };
}

export function stack(state: BattleState, id: string): BattleStack {
  return getStack(state, id);
}

/** Test-only state surgery: patch one stack. */
export function patchStack(
  state: BattleState,
  id: string,
  patch: Partial<BattleStack>,
): BattleState {
  return {
    ...state,
    stacks: state.stacks.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  };
}

export function damageEvents(events: readonly BattleEvent[]) {
  return events.filter(
    (e): e is Extract<BattleEvent, { type: "damage" }> => e.type === "damage",
  );
}
