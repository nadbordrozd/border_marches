/**
 * Hand-built battles for the magic tests: plain creatures with round
 * numbers, a hero book on the attacker's side, and helpers to cast.
 */

import {
  applyAction,
  createBattle,
  getStack,
  makeCondition,
  rehearse,
  sideOf,
} from "../../../src/core/battle/index.ts";
import type {
  ActTarget,
  BattleAction,
  BattleCreatureStats,
  BattleSetup,
  BattleStack,
  BattleState,
  ConditionRef,
  ConditionSpec,
  Hex,
  MagicSetup,
  StackId,
} from "../../../src/core/battle/index.ts";
import {
  BATTLE_SPELLS,
  registerSpells,
} from "../../../src/core/magic/index.ts";

registerSpells();

/** 10 HP, Attack 5, Defense 5, Damage 2, Speed 5: easy arithmetic. */
export const PIKE: BattleCreatureStats = {
  id: "pike",
  name: "Pikeman",
  tier: 1,
  hp: 10,
  attack: 5,
  defense: 5,
  damage: 2,
  speed: 5,
  abilities: [],
};
export const BOW: BattleCreatureStats = {
  id: "bow",
  name: "Bowman",
  tier: 2,
  hp: 10,
  attack: 5,
  defense: 5,
  damage: 2,
  speed: 4,
  shots: 10,
  abilities: [],
};
export const OGRE: BattleCreatureStats = {
  id: "ogre",
  name: "Ogre",
  tier: 4,
  hp: 50,
  attack: 10,
  defense: 8,
  damage: 10,
  speed: 3,
  abilities: [],
};

export const BOOK: MagicSetup = {
  power: 2,
  mana: 60,
  schoolRanks: { bloom: 1, accord: 1, clock: 1, hush: 1, storm: 1 },
  pages: BATTLE_SPELLS.map((s) => s.id),
};

export interface Unit {
  readonly creature?: BattleCreatureStats;
  readonly count?: number;
  readonly hex: Hex;
}

/**
 * Attacker stacks a0.. (the hero's side), defender stacks d0... a0 acts
 * first (Speed 9 unless given). No obstacles.
 */
export function battle(opts: {
  readonly mine: readonly Unit[];
  readonly theirs: readonly Unit[];
  readonly magic?: Partial<MagicSetup>;
  readonly enemyMagic?: MagicSetup;
}): BattleState {
  const fast = { ...PIKE, id: "lead", name: "Leader", speed: 9 };
  const setup: BattleSetup = {
    seed: 1,
    obstacles: [],
    attacker: {
      hero: { attack: 0, defense: 0 },
      magic: { ...BOOK, ...opts.magic },
      stacks: opts.mine.map((u, i) => ({
        creature: u.creature ?? (i === 0 ? fast : PIKE),
        count: u.count ?? 10,
        hex: u.hex,
      })),
    },
    defender: {
      hero: opts.enemyMagic ? { attack: 0, defense: 0 } : null,
      ...(opts.enemyMagic ? { magic: opts.enemyMagic } : {}),
      stacks: opts.theirs.map((u) => ({
        creature: u.creature ?? PIKE,
        count: u.count ?? 10,
        hex: u.hex,
      })),
    },
  };
  return createBattle(setup).state;
}

export function stack(state: BattleState, id: StackId): BattleStack {
  return getStack(state, id);
}

/** Test surgery: put conditions on a stack (uids 900+). */
export function withConditions(
  state: BattleState,
  id: StackId,
  specs: readonly ConditionSpec[],
): BattleState {
  let uid = 900 + state.stacks.findIndex((s) => s.id === id) * 10;
  return {
    ...state,
    stacks: state.stacks.map((s) => {
      if (s.id !== id) return s;
      const conditions = [
        ...s.conditions,
        ...specs.map((spec) => makeCondition(spec, uid++, "test")),
      ];
      const next = { ...s, conditions };
      return { ...next, side: sideOf(next) };
    }),
  };
}

export function uidOf(state: BattleState, id: StackId, kind: string): number {
  const c = stack(state, id).conditions.find((x) => x.kind === kind);
  if (!c) throw new Error(`${id} bears no ${kind}`);
  return c.uid;
}

export function ref(
  state: BattleState,
  id: StackId,
  kind: string,
): ConditionRef {
  return { stack: id, condition: uidOf(state, id, kind) };
}

export const S = (id: StackId): ActTarget => ({ stack: id });
export const H = (col: number, row: number): ActTarget => ({
  hex: { col, row },
});
export const C = (
  state: BattleState,
  id: StackId,
  kind: string,
): ActTarget => ({
  stack: id,
  condition: uidOf(state, id, kind),
});

/** The hero's cast as an action of the active stack. */
export function castAction(
  state: BattleState,
  spell: string,
  targets: readonly ActTarget[],
  extra: Partial<Extract<BattleAction, { type: "heroAct" }>> = {},
): BattleAction {
  return {
    type: "heroAct",
    stackId: state.activeStackId as string,
    act: spell,
    targets,
    ...extra,
  };
}

/** Learns the page (if needed) and casts it; returns the step. */
export function cast(
  state: BattleState,
  spell: string,
  targets: readonly ActTarget[],
  extra: Partial<Extract<BattleAction, { type: "heroAct" }>> = {},
) {
  return applyAction(state, castAction(state, spell, targets, extra));
}

export function preview(
  state: BattleState,
  spell: string,
  targets: readonly ActTarget[],
  extra: Partial<Extract<BattleAction, { type: "heroAct" }>> = {},
) {
  return rehearse(state, castAction(state, spell, targets, extra));
}

/** HP lost by a stack between two states. */
export function hpLost(a: BattleState, b: BattleState, id: StackId): number {
  const s0 = stack(a, id);
  const s1 = stack(b, id);
  const total = (s: BattleStack) =>
    s.count === 0 ? 0 : (s.count - 1) * s.creature.hp + s.topHp;
  return total(s0) - total(s1);
}

export function kinds(state: BattleState, id: StackId): string[] {
  return stack(state, id).conditions.map((c) => c.kind);
}
