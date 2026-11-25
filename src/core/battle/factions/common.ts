/**
 * Shared pieces of the three v0.2 factions' battle content
 * (FACTION_HUMANS.md, FACTION_UNDEAD.md, FACTION_GOBLINS.md): target
 * readers and selectors, and the Chieftain's Command. The Friar's,
 * Gravecaller's and Boomshaman's pages are the magic catalogue's spells,
 * named in their creature data (`caster`, cast with `creatureCast`).
 */

import { isAlive } from "../abilities.ts";
import { turnOrder } from "../engine.ts";
import {
  BATTLE_HEX_COUNT,
  hexDistance,
  hexFromIndex,
  isAdjacent,
  sameHex,
} from "../hex.ts";
import type { Hex } from "../hex.ts";
import { registerAct } from "../registry.ts";
import type {
  ActTarget,
  BattleSide,
  BattleStack,
  BattleState,
  StackId,
} from "../types.ts";

export function stackOf(state: BattleState, id: StackId): BattleStack | null {
  return state.stacks.find((s) => s.id === id) ?? null;
}

export function targetStack(t: ActTarget | undefined): StackId | null {
  return t !== undefined && "stack" in t ? t.stack : null;
}

export function targetHex(t: ActTarget | undefined): Hex | null {
  return t !== undefined && "hex" in t ? t.hex : null;
}

export function targetCondition(t: ActTarget | undefined): number | null {
  return t !== undefined && "condition" in t ? t.condition : null;
}

/** Living stacks in field order. */
export function friendsOf(state: BattleState, actorId: StackId): BattleStack[] {
  const me = stackOf(state, actorId);
  return living(state).filter((s) => me !== null && s.side === me.side);
}

export function enemiesOf(state: BattleState, actorId: StackId): BattleStack[] {
  const me = stackOf(state, actorId);
  return living(state).filter((s) => me !== null && s.side !== me.side);
}

/** One-stack target tuples (the AI's candidates, ActDef.aiTargets). */
export function oneEach(stacks: readonly BattleStack[]): ActTarget[][] {
  return stacks.map((s) => [{ stack: s.id }]);
}

/** Living stacks in field order. */
export function living(state: BattleState): BattleStack[] {
  return state.stacks.filter(isAlive);
}

/** The living stack on a hex, if any. */
export function stackOn(state: BattleState, h: Hex): BattleStack | null {
  return living(state).find((s) => sameHex(s.hex, h)) ?? null;
}

/** Living stacks on `centre` and on every hex adjacent to it, field order. */
export function inBlast(state: BattleState, centre: Hex): BattleStack[] {
  return living(state).filter(
    (s) => sameHex(s.hex, centre) || isAdjacent(s.hex, centre),
  );
}

/** Every hex within `r` of `centre` (an area's outline). */
export function discAround(centre: Hex, r: number): Hex[] {
  const out: Hex[] = [];
  for (let i = 0; i < BATTLE_HEX_COUNT; i++) {
    const h = hexFromIndex(i);
    if (hexDistance(h, centre) <= r) out.push(h);
  }
  return out;
}

/** Living stacks within `r` hexes of `centre`, field order. */
export function within(
  state: BattleState,
  centre: Hex,
  r: number,
): BattleStack[] {
  return living(state).filter((s) => hexDistance(s.hex, centre) <= r);
}

/** C of the hero of a side (RULES_V2 3.7); 1 without a hero. */
export function commandC(state: BattleState, side: BattleSide): number {
  return Math.max(1, state.sides[side].hero?.commandC ?? 1);
}

/** The flags of a side's battle setup. */
export function sideFlags(state: BattleState, side: BattleSide): string[] {
  return [...(state.sides[side].flags ?? [])];
}

/** Count of conditions of one polarity on a stack. */
export function polarityCount(
  stack: BattleStack,
  polarity: "boon" | "bane",
): number {
  return stack.conditions.filter((c) => c.polarity === polarity).length;
}

/** Remains features on the field. */
export function remainsCount(state: BattleState): number {
  return state.ground.filter((g) => g.class === "remains").length;
}

// ---------------------------------------------------------------------------
// The Lost World Chieftain's Command (RULES_V2 3.7, the model Command)

export function registerStampede(): void {
  registerAct({
    id: "stampede",
    name: "Stampede",
    text: "Choose an enemy stack; up to C + 1 friendly stacks adjacent to it each make a melee Strike against it, in timeline order; it retaliates once.",
    kind: "command",
    targets: 1,
    targetKinds: ["stack"],
    check(state, actorId, t) {
      const me = stackOf(state, actorId);
      const e = stackOf(state, targetStack(t[0]) ?? "");
      return me && e && e.side !== me.side ? null : "choose an enemy stack";
    },
    aiTargets: (state, actorId) => oneEach(enemiesOf(state, actorId)),
    resolve(fx, actorId, t) {
      const enemy = targetStack(t[0]) as StackId;
      const side = fx.sideOf(actorId);
      const n = commandC(fx.state, side) + 1;
      const order = turnOrder(fx.state);
      const friends = living(fx.state)
        .filter(
          (s) =>
            fx.sideOf(s.id) === side && isAdjacent(s.hex, fx.stack(enemy).hex),
        )
        .sort((a, b) => {
          const ia = order.indexOf(a.id);
          const ib = order.indexOf(b.id);
          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        })
        .slice(0, n);
      for (const f of friends) {
        if (!fx.isAlive(enemy)) return;
        fx.strike(f.id, enemy, { kind: "melee", label: "Stampede" });
      }
    },
  });
}
