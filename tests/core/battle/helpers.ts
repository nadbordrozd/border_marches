import {
  applyAction,
  createBattle,
  getStack,
  makeCondition,
  sideOf,
} from "../../../src/core/battle/index.ts";
import { Draft, Resolver } from "../../../src/core/battle/resolve.ts";
import type {
  BattleAction,
  BattleEvent,
  BattleSetup,
  BattleStack,
  BattleState,
  Condition,
  ConditionSpec,
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

/** Test-only state surgery: patch one stack (its side is re-derived). */
export function patchStack(
  state: BattleState,
  id: string,
  patch: Partial<BattleStack>,
): BattleState {
  return {
    ...state,
    stacks: state.stacks.map((s) => {
      if (s.id !== id) return s;
      const next = { ...s, ...patch };
      return { ...next, side: sideOf(next) };
    }),
  };
}

/** A condition as a rule would make it (uid 900+ for test surgery). */
export function cond(
  kind: string,
  spec: Omit<ConditionSpec, "kind"> = {},
  uid = 900,
): Condition {
  return makeCondition({ kind, ...spec }, uid, spec.source ?? "test");
}

/** Kind, clock and size of a stack's conditions, in list order. */
export function conditionsOf(
  state: BattleState,
  id: string,
): { kind: string; clock: number | null; size: number }[] {
  return getStack(state, id).conditions.map((c) => ({
    kind: c.kind,
    clock: c.clock,
    size: c.size,
  }));
}

/**
 * Runs verbs directly on a copy of the state, as a content rule would, and
 * resolves the reactions they queue. Returns the new state and the chain.
 */
export function withFx(
  state: BattleState,
  fn: (fx: Resolver, d: Draft) => void,
  rule = "test",
): { state: BattleState; events: BattleEvent[] } {
  const d = new Draft(state);
  const fx = new Resolver(d, () => false);
  d.beginStep();
  d.within(null, rule, () => fn(fx, d));
  fx.resolveReactions();
  return { state: d.toState(), events: d.events.slice() };
}

/** Event bodies without index, cause and rule (for exact comparisons). */
export function bodies(events: readonly BattleEvent[]): unknown[] {
  return events.map((e) => {
    const body: Record<string, unknown> = { ...e };
    delete body.index;
    delete body.cause;
    delete body.rule;
    return body;
  });
}

export function damageEvents(events: readonly BattleEvent[]) {
  return events.filter(
    (e): e is Extract<BattleEvent, { type: "damage" }> => e.type === "damage",
  );
}
