/**
 * The stack info panel's content (right-click on any stack): stats with the
 * standing modifiers that apply to them now (hero, fortification, auras,
 * conditions such as Venomed, Defend), the ability text, the stack's
 * conditions (with school, clock and gate) and its Wary counter. Pure.
 *
 * Situational bonuses that depend on the target (Mob, Pack Hunter, Charge,
 * Bony) are not standing modifiers: the attack preview shows them.
 */

import { ABILITIES } from "../../data/abilities.ts";
import {
  ability as abilityDef,
  conditionKind,
  defendedDefense,
  effectiveSpeed,
  isAdjacent,
  isAlive,
  isRangedCreature,
} from "../../core/battle/index.ts";
import type {
  BattleStack,
  BattleState,
  StrikeContext,
} from "../../core/battle/index.ts";
import { conditionTooltip } from "./grammar.ts";
import { creatureName } from "./preview.ts";

export interface StatLine {
  readonly label: string;
  /** Effective value now. */
  readonly value: string;
  /** How it is made up, e.g. "8 base, +2 hero, +2 War Drums"; "" if plain. */
  readonly note: string;
}

export interface StackInfo {
  readonly title: string;
  readonly count: number;
  readonly side: "attacker" | "defender";
  /** The side that brought it, when it differs (a Turned stack). */
  readonly owner: "attacker" | "defender";
  readonly stats: readonly StatLine[];
  readonly ability: { readonly name: string; readonly text: string } | null;
  readonly statuses: readonly string[];
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `−${-n}`;
}

function hasAdjacentAura(
  state: BattleState,
  stack: BattleStack,
  ability: "war-drums" | "warcry",
): boolean {
  return state.stacks.some(
    (s) =>
      s.id !== stack.id &&
      s.side === stack.side &&
      isAlive(s) &&
      s.creature.abilities.includes(ability) &&
      isAdjacent(s.hex, stack.hex),
  );
}

export function stackInfo(state: BattleState, stack: BattleStack): StackInfo {
  const c = stack.creature;
  const side = state.sides[stack.side];
  const heroAtk = side.hero?.attack ?? 0;
  const heroDef = side.hero?.defense ?? 0;

  const atkParts: [string, number][] = [];
  if (heroAtk !== 0) atkParts.push(["hero", heroAtk]);
  if (hasAdjacentAura(state, stack, "war-drums")) {
    atkParts.push([
      ABILITIES["war-drums"].name,
      ABILITIES["war-drums"].params.attack ?? 0,
    ]);
  }
  const defParts: [string, number][] = [];
  if (heroDef !== 0) defParts.push(["hero", heroDef]);
  if (side.defenseBonus !== 0) defParts.push(["fortified", side.defenseBonus]);
  if (hasAdjacentAura(state, stack, "warcry")) {
    defParts.push([
      ABILITIES.warcry.name,
      ABILITIES.warcry.params.defense ?? 0,
    ]);
  }
  // Standing condition modifiers, as a Strike against this stack sees them.
  const ctx: StrikeContext = {
    state,
    attacker: stack,
    defender: stack,
    kind: "melee",
    hexesMoved: 0,
  };
  for (const cd of stack.conditions) {
    const m = conditionKind(cd.kind).defenseModifier?.(ctx, stack, cd);
    if (m) defParts.push([m.label, m.amount]);
  }
  const sum = (parts: [string, number][]): number =>
    parts.reduce((t, [, n]) => t + n, 0);
  const note = (base: number, parts: [string, number][]): string =>
    parts.length === 0
      ? ""
      : [`${base} base`, ...parts.map(([l, n]) => `${signed(n)} ${l}`)].join(
          ", ",
        );

  const attack = c.attack + sum(atkParts);
  let defense = Math.max(0, c.defense + sum(defParts));
  let defNote = note(c.defense, defParts);
  if (stack.defending) {
    const before = defense;
    defense = defendedDefense(defense);
    defNote = `${defNote === "" ? `${before}` : `${defNote} = ${before}`}, ×1.3 defending`;
  }

  const stats: StatLine[] = [
    { label: "Attack", value: String(attack), note: note(c.attack, atkParts) },
    { label: "Defense", value: String(defense), note: defNote },
    { label: "Damage", value: String(c.damage), note: "per creature" },
    { label: "Health", value: `${stack.topHp}/${c.hp}`, note: "top creature" },
    {
      label: "Speed",
      value: String(effectiveSpeed(stack)),
      note: effectiveSpeed(stack) === c.speed ? "" : `${c.speed} base`,
    },
  ];
  if (isRangedCreature(c)) {
    stats.push({
      label: "Shots",
      value: `${stack.shotsLeft}/${c.shots ?? 0}`,
      note: "",
    });
  }

  const statuses: string[] = [];
  for (const cd of stack.conditions) statuses.push(conditionTooltip(state, cd));
  if (stack.wary > 0)
    statuses.push(
      `Wary: refuses Holds for ${stack.wary} round${stack.wary === 1 ? "" : "s"} (counting this one)`,
    );
  if (stack.owner !== stack.side)
    statuses.push(`Fights for the ${stack.side}; owned by the ${stack.owner}`);
  if (stack.defending)
    statuses.push("Defending: +30% Defense until its next turn");
  if (isAlive(stack)) {
    statuses.push(
      stack.retaliatedThisRound
        ? "Has retaliated this round"
        : "Can retaliate this round",
    );
  }
  if (stack.waitedThisRound) statuses.push("Waited this round");
  if (!isAlive(stack)) statuses.push("Destroyed");

  const abilityId = c.abilities[0];
  const ability =
    abilityId === undefined
      ? null
      : {
          name: abilityDef(abilityId).name,
          text: abilityDef(abilityId).description,
        };

  return {
    title: creatureName(c, stack.count),
    count: stack.count,
    side: stack.side,
    owner: stack.owner,
    stats,
    ability,
    statuses,
  };
}
