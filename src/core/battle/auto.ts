/**
 * Auto-combat and the battle result the strategic layer needs.
 */

import { chooseAiAction } from "./ai.ts";
import { applyAction, endByRoundLimit } from "./engine.ts";
import { createBattle } from "./setup.ts";
import type {
  BattleEvent,
  BattleSetup,
  BattleSide,
  BattleState,
  StackId,
} from "./types.ts";

/** Battles stop after this many full rounds (no winner). */
export const DEFAULT_MAX_ROUNDS = 100;

export interface AutoBattleOptions {
  readonly maxRounds?: number;
}

export interface StackOutcome {
  readonly id: StackId;
  readonly side: BattleSide;
  readonly slot: number;
  readonly creatureId: string;
  readonly initialCount: number;
  /** Survivors (0 = the stack died). The top creature heals after battle. */
  readonly count: number;
}

export interface BattleResult {
  /** null only when the round limit was hit. */
  readonly winner: BattleSide | null;
  readonly reason: "eliminated" | "roundLimit";
  /** Rounds started. */
  readonly rounds: number;
  readonly stacks: readonly StackOutcome[];
  /**
   * Total HP of enemy creatures each side killed (GAME_DESIGN.md 6.1: the
   * winner's hero gains this as XP).
   */
  readonly killedHp: { readonly [S in BattleSide]: number };
}

/** The result of a finished (or abandoned) battle state. */
export function battleResult(
  state: BattleState,
  reason: BattleResult["reason"],
): BattleResult {
  const killedHp = { attacker: 0, defender: 0 };
  for (const s of state.stacks) {
    const killer = s.side === "attacker" ? "defender" : "attacker";
    killedHp[killer] += (s.initialCount - s.count) * s.creature.hp;
  }
  return {
    winner: state.winner,
    reason,
    rounds: state.round,
    stacks: state.stacks.map((s) => ({
      id: s.id,
      side: s.side,
      slot: s.slot,
      creatureId: s.creature.id,
      initialCount: s.initialCount,
      count: s.count,
    })),
    killedHp,
  };
}

export interface AutoPlayResult {
  readonly state: BattleState;
  readonly events: readonly BattleEvent[];
  readonly result: BattleResult;
}

/**
 * Plays both sides with the AI from any state until a side is eliminated or
 * `maxRounds` full rounds have been played. Same state in, same result out.
 */
export function autoPlay(
  state: BattleState,
  options: AutoBattleOptions = {},
): AutoPlayResult {
  const maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const events: BattleEvent[] = [];
  let cur = state;
  while (cur.winner === null) {
    if (cur.round > maxRounds) {
      const step = endByRoundLimit(cur);
      events.push(...step.events);
      return {
        state: step.state,
        events,
        result: battleResult(step.state, "roundLimit"),
      };
    }
    const step = applyAction(cur, chooseAiAction(cur));
    events.push(...step.events);
    cur = step.state;
  }
  return { state: cur, events, result: battleResult(cur, "eliminated") };
}

/** Creates the battle and auto-plays it to the end (auto-combat). */
export function runAutoBattle(
  setup: BattleSetup,
  options: AutoBattleOptions = {},
): AutoPlayResult {
  const start = createBattle(setup);
  const played = autoPlay(start.state, options);
  return { ...played, events: [...start.events, ...played.events] };
}
