/**
 * Auto-combat and the battle result the strategic layer needs.
 */

import { chooseAiAction, createAiMemo } from "./ai.ts";
import type { AiMode, AiOptions } from "./ai.ts";
import { autoDeploy } from "./deploy.ts";
import { applyAction } from "./engine.ts";
import { ROUND_LIMIT } from "./resolve.ts";
import { createBattle } from "./setup.ts";
import type {
  BattleEvent,
  BattleSetup,
  BattleSide,
  BattleState,
  EndReason,
  StackId,
} from "./types.ts";

/**
 * The engine ends every battle at its round limit (RULES_V2 1.12: the
 * side with more fight value left wins); kept under the old name for
 * callers.
 */
export const DEFAULT_MAX_ROUNDS = ROUND_LIMIT;

export interface AutoBattleOptions {
  /**
   * Stop auto-play once this many rounds have started without a winner (a
   * harness for tests and tools; the result then has winner null). The
   * engine's own limit is ROUND_LIMIT (15).
   */
  readonly maxRounds?: number;
  /**
   * The battle AI's mode for both sides (default "full"; resolver.ts
   * picks "fast" for the battles no human watches).
   */
  readonly ai?: AiMode;
}

export interface StackOutcome {
  readonly id: StackId;
  readonly side: BattleSide;
  readonly slot: number;
  readonly creatureId: string;
  readonly initialCount: number;
  /** Survivors (0 = the stack died). The top creature heals after battle. */
  readonly count: number;
  /** It got up from its remains: it crumbles after the battle (1.12). */
  readonly risen?: boolean;
}

export interface BattleResult {
  /** null only when auto-play was stopped by `maxRounds`. */
  readonly winner: BattleSide | null;
  readonly reason: EndReason;
  /** Rounds started. */
  readonly rounds: number;
  readonly stacks: readonly StackOutcome[];
  /**
   * Total HP of enemy creatures each side killed (GAME_DESIGN.md 6.1: the
   * winner's hero gains this as XP).
   */
  readonly killedHp: { readonly [S in BattleSide]: number };
  /**
   * Per side with a hero book: mana spent and scrolls used (both stay
   * spent after the battle, RULES_V2 1.12). Absent when no side has magic.
   */
  readonly magic?: { readonly [S in BattleSide]?: MagicOutcome };
}

export interface MagicOutcome {
  readonly manaSpent: number;
  readonly manaLeft: number;
  readonly scrollsUsed: readonly string[];
}

function magicOutcome(
  state: BattleState,
): { [S in BattleSide]?: MagicOutcome } | null {
  const out: { [S in BattleSide]?: MagicOutcome } = {};
  let any = false;
  for (const side of ["attacker", "defender"] as const) {
    const m = state.sides[side].magic;
    if (!m) continue;
    any = true;
    out[side] = {
      manaSpent: m.manaSpent,
      manaLeft: m.mana,
      scrollsUsed: m.scrollsUsed,
    };
  }
  return any ? out : null;
}

/** The result of a finished (or abandoned) battle state. */
export function battleResult(
  state: BattleState,
  reason: BattleResult["reason"],
): BattleResult {
  const killedHp = { attacker: 0, defender: 0 };
  for (const s of state.stacks) {
    // Only non-summoned stacks count (1.12), credited by owner.
    if (s.summoned) continue;
    const killer = s.owner === "attacker" ? "defender" : "attacker";
    killedHp[killer] += (s.initialCount - s.count) * s.creature.hp;
  }
  const magic = magicOutcome(state);
  return {
    ...(magic ? { magic } : {}),
    winner: state.winner,
    reason,
    rounds: state.round,
    stacks: state.stacks
      .filter((s) => !s.summoned)
      .map((s) => ({
        id: s.id,
        side: s.owner,
        slot: s.slot,
        creatureId: s.creature.id,
        initialCount: s.initialCount,
        count: s.count,
        ...(s.risen === true ? { risen: true } : {}),
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
  const maxRounds = options.maxRounds ?? ROUND_LIMIT;
  // The fast mode reuses strike rates across the battle's decisions.
  const mode = options.ai ?? "full";
  const ai: AiOptions =
    mode === "fast" ? { mode, memo: createAiMemo() } : { mode };
  const events: BattleEvent[] = [];
  let cur = state;
  while (cur.winner === null) {
    if (cur.round > maxRounds) {
      return { state: cur, events, result: battleResult(cur, "roundLimit") };
    }
    const step = applyAction(cur, chooseAiAction(cur, ai));
    events.push(...step.events);
    cur = step.state;
  }
  return {
    state: cur,
    events,
    result: battleResult(cur, cur.endReason ?? "eliminated"),
  };
}

/**
 * Creates the battle and auto-plays it to the end (auto-combat). A side
 * with a deploy rule (Vanguard) takes the battle AI's placement first.
 */
export function runAutoBattle(
  setup: BattleSetup,
  options: AutoBattleOptions = {},
): AutoPlayResult {
  const start = createBattle(autoDeploy(setup));
  const played = autoPlay(start.state, options);
  return { ...played, events: [...start.events, ...played.events] };
}
