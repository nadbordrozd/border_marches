/**
 * Hand-built battles with the v0.2 faction creatures from src/data (the
 * numbers are the faction documents'; tests/data checks them).
 */

import { expect } from "vitest";
import {
  battleStatsFromCreature,
  createBattle,
  getStack,
} from "../../../src/core/battle/index.ts";
import type {
  BattleArmySetup,
  BattleCreatureStats,
  BattleEvent,
  BattleSide,
  BattleStackSetup,
  BattleState,
  GroundFeature,
  Hex,
} from "../../../src/core/battle/index.ts";
import { CREATURES } from "../../../src/data/creatures.ts";
import { registerSpells } from "../../../src/core/magic/spells.ts";
import type { CreatureId } from "../../../src/data/types.ts";

// The creature casters' pages are the magic catalogue's spells.
registerSpells();

export const at = (col: number, row: number): Hex => ({ col, row });

/** Engine stats of a creature from src/data, with extra abilities (Drills). */
export function stats(id: CreatureId, ...extra: string[]): BattleCreatureStats {
  const base = battleStatsFromCreature(CREATURES[id]);
  return { ...base, abilities: [...base.abilities, ...extra] };
}

export function unit(
  id: CreatureId,
  count: number,
  hex: Hex,
  opts: { native?: boolean; extra?: string[]; topHp?: number } = {},
): BattleStackSetup {
  return {
    creature: stats(id, ...(opts.extra ?? [])),
    count,
    hex,
    ...(opts.native !== undefined ? { native: opts.native } : {}),
    ...(opts.topHp !== undefined ? { topHp: opts.topHp } : {}),
  };
}

export function battle(
  attacker: Partial<BattleArmySetup> & { stacks: BattleStackSetup[] },
  defender: Partial<BattleArmySetup> & { stacks: BattleStackSetup[] },
  ground: GroundFeature[] = [],
): BattleState {
  const s = createBattle({
    seed: 1,
    obstacles: [],
    attacker: { hero: null, ...attacker },
    defender: { hero: null, ...defender },
  }).state;
  return ground.length === 0 ? s : { ...s, ground: [...s.ground, ...ground] };
}

/** A remains feature as a death would leave it (test surgery). */
export function remains(
  hex: Hex,
  creature: CreatureId,
  owner: BattleSide,
  kind: "corpse" | "bones" = "corpse",
  source = "dead",
): GroundFeature {
  return {
    hex,
    kind,
    class: "remains",
    school: null,
    size: 0,
    clock: null,
    remains: { creature: stats(creature), owner, initialCount: 6 },
    source,
  };
}

export function uidOf(state: BattleState, id: string, kind: string): number {
  const c = getStack(state, id).conditions.find((x) => x.kind === kind);
  if (!c) throw new Error(`${id} bears no ${kind}`);
  return c.uid;
}

export function kinds(state: BattleState, id: string): string[] {
  return getStack(state, id).conditions.map((c) => c.kind);
}

/** The Strikes of a chain as [source, target, kind, damage, kills]. */
export function strikes(
  events: readonly BattleEvent[],
): [string, string, string, number, number][] {
  return events.flatMap((e) =>
    e.type === "damage"
      ? [[e.sourceId, e.targetId, e.kind, e.damage, e.kills]]
      : [],
  ) as [string, string, string, number, number][];
}

export function countTop(state: BattleState, id: string): [number, number] {
  const s = getStack(state, id);
  return [s.count, s.topHp];
}

export function expectActive(state: BattleState, id: string): void {
  expect(state.activeStackId).toBe(id);
}
