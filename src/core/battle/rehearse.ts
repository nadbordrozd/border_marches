/**
 * Rehearsal, enemy intents and take-back (RULES_V2.md 1.13).
 *
 * - {@link rehearse} runs the real engine on a copy (applyAction never
 *   mutates its input) and returns the ordered step chain of the action, the
 *   resulting state and a per-stack summary. The steps are the very events
 *   the engine emits when the action is applied, so the preview and the
 *   animation cannot disagree.
 * - {@link rehearsePlan} applies a queue of the player's actions, filling the
 *   enemy turns in between with the stack AI.
 * - {@link enemyIntents} shows what each enemy stack still to act this round
 *   would do if its turn came now on the current board.
 * - {@link takeBackIndex} finds how far the player may take back.
 */

import { isAlive } from "./abilities.ts";
import { chooseAiAction } from "./ai.ts";
import { actionError, applyAction, getStack } from "./engine.ts";
import { conditionKind } from "./registry.ts";
import { stackTotalHp } from "./resolve.ts";
import type {
  BattleAction,
  BattleEvent,
  BattleSide,
  BattleState,
  StackId,
} from "./types.ts";

export interface Refusal {
  readonly code: "illegal";
  readonly rule: string;
  readonly message: string;
}

export interface StackSummary {
  readonly stackId: StackId;
  readonly hpLost: number;
  readonly killed: number;
  readonly conditionsGained: readonly string[];
  readonly conditionsLost: readonly string[];
}

export interface Rehearsal {
  /** True, or the refusal of an illegal action. */
  readonly legal: true | Refusal;
  /** The action's own chain, in order (before the next turn starts). */
  readonly steps: readonly BattleEvent[];
  /** Everything up to the next decision (next turns, rounds, the end). */
  readonly followUp: readonly BattleEvent[];
  readonly after: BattleState;
  readonly summary: readonly StackSummary[];
}

/** Index of the first event that is not part of the action's own chain. */
function chainLength(events: readonly BattleEvent[]): number {
  const i = events.findIndex(
    (e) =>
      e.type === "turnStart" ||
      e.type === "roundEnd" ||
      e.type === "roundStart" ||
      e.type === "end",
  );
  return i < 0 ? events.length : i;
}

/** Per stack touched: HP lost, creatures killed, conditions gained and lost. */
export function summarise(
  before: BattleState,
  after: BattleState,
  events: readonly BattleEvent[],
): StackSummary[] {
  const touched = new Set<StackId>();
  const gained = new Map<StackId, string[]>();
  const lost = new Map<StackId, string[]>();
  const push = (m: Map<StackId, string[]>, id: StackId, v: string) => {
    m.set(id, [...(m.get(id) ?? []), v]);
  };
  for (const e of events) {
    switch (e.type) {
      case "damage":
      case "harm":
        touched.add(e.targetId);
        break;
      case "heal":
      case "death":
        touched.add(e.stackId);
        break;
      case "condition":
        touched.add(e.stackId);
        if (
          e.change === "landed" ||
          e.change === "moved" ||
          e.change === "copied"
        )
          push(gained, e.stackId, e.condition.kind);
        if (
          e.change === "ended" ||
          e.change === "expired" ||
          e.change === "setOff" ||
          e.change === "displaced"
        )
          push(lost, e.stackId, e.condition.kind);
        if (e.change === "moved" && e.otherId !== undefined) {
          touched.add(e.otherId);
          push(lost, e.otherId, e.condition.kind);
        }
        break;
      default:
        break;
    }
  }
  const out: StackSummary[] = [];
  for (const s of after.stacks) {
    if (!touched.has(s.id)) continue;
    const b = before.stacks.find((x) => x.id === s.id);
    out.push({
      stackId: s.id,
      hpLost: b ? stackTotalHp(b) - stackTotalHp(s) : 0,
      killed: b ? b.count - s.count : 0,
      conditionsGained: gained.get(s.id) ?? [],
      conditionsLost: lost.get(s.id) ?? [],
    });
  }
  return out;
}

/** Runs the real engine on a copy of the state (RULES_V2 1.13). */
export function rehearse(state: BattleState, action: BattleAction): Rehearsal {
  const err = actionError(state, action);
  if (err) {
    return {
      legal: { code: "illegal", rule: action.type, message: err },
      steps: [],
      followUp: [],
      after: state,
      summary: [],
    };
  }
  const step = applyAction(state, action);
  const n = chainLength(step.events);
  const steps = step.events.slice(0, n);
  return {
    legal: true,
    steps,
    followUp: step.events.slice(n),
    after: step.state,
    summary: summarise(state, step.state, steps),
  };
}

export interface PlanRehearsal {
  readonly steps: readonly BattleEvent[];
  readonly after: BattleState;
  /** Player actions applied (the plan stops early when one is illegal). */
  readonly applied: number;
  readonly refusal: Refusal | null;
}

/**
 * Applies the player's queued actions in order, filling enemy turns in
 * between with their intents (the stack AI). Against an enemy hero the plan
 * stops at the first enemy turn.
 */
export function rehearsePlan(
  state: BattleState,
  playerSide: BattleSide,
  actions: readonly BattleAction[],
  options: { readonly enemyHasHero?: boolean } = {},
): PlanRehearsal {
  const steps: BattleEvent[] = [];
  let cur = state;
  let applied = 0;
  const fillEnemies = (): boolean => {
    while (cur.winner === null && cur.activeStackId !== null) {
      const active = getStack(cur, cur.activeStackId);
      if (active.side === playerSide) return true;
      if (options.enemyHasHero) return false;
      const step = applyAction(cur, chooseAiAction(cur));
      steps.push(...step.events);
      cur = step.state;
    }
    return false;
  };
  for (const action of actions) {
    if (!fillEnemies()) break;
    const err = actionError(cur, action);
    if (err) {
      return {
        steps,
        after: cur,
        applied,
        refusal: { code: "illegal", rule: action.type, message: err },
      };
    }
    const step = applyAction(cur, action);
    steps.push(...step.events);
    cur = step.state;
    applied++;
  }
  return { steps, after: cur, applied, refusal: null };
}

export interface Intent {
  readonly stackId: StackId;
  /** null when the stack's turn will be skipped (`skippedBy`). */
  readonly action: BattleAction | null;
  readonly rehearsal: Rehearsal | null;
  /** The condition that skips its turn (Frozen, Asleep), or null. */
  readonly skippedBy: string | null;
}

/**
 * For every stack of the other side still to act this round, what the stack
 * AI would do if its turn came now on the current board, with the rehearsed
 * numbers. Exact against guards: the AI is a pure function of the state.
 */
export function enemyIntents(
  state: BattleState,
  viewerSide: BattleSide,
): Intent[] {
  if (state.winner !== null) return [];
  const ids = [...state.queue, ...state.waiting].filter(
    (id) => id !== state.activeStackId,
  );
  const out: Intent[] = [];
  for (const id of ids) {
    const s = getStack(state, id);
    if (!isAlive(s) || s.side === viewerSide) continue;
    const held = s.conditions.find((c) => conditionKind(c.kind).cannotAct);
    if (held) {
      out.push({
        stackId: id,
        action: null,
        rehearsal: null,
        skippedBy: held.kind,
      });
      continue;
    }
    const hypothetical: BattleState = { ...state, activeStackId: id };
    let action: BattleAction;
    try {
      // The stack's own action: a hero act would not end its turn.
      action = chooseAiAction(hypothetical, { heroActs: false });
    } catch {
      continue;
    }
    out.push({
      stackId: id,
      action,
      rehearsal: rehearse(hypothetical, action),
      skippedBy: null,
    });
  }
  return out;
}

/** One applied action, as the interface records it for take-back. */
export interface HistoryEntry {
  /** The state the action was applied to. */
  readonly before: BattleState;
  readonly action: BattleAction;
  /** The side that decided it (the acting stack's side at the time). */
  readonly side: BattleSide;
}

/**
 * The history index whose `before` state undoes the newest action of
 * `playerSide`, or null when take-back is not allowed (RULES_V2 1.13):
 * never across a round start, and never past an enemy decision the player
 * could not have known (any action of a stack led by an enemy hero).
 * Against guards (no enemy hero) only the round start limits it.
 */
export function takeBackIndex(
  history: readonly HistoryEntry[],
  current: BattleState,
  playerSide: BattleSide,
  enemyHasHero: boolean,
): number | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i] as HistoryEntry;
    if (h.before.round !== current.round) return null;
    if (h.side === playerSide) return i;
    if (enemyHasHero) return null;
  }
  return null;
}
