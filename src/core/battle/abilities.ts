/**
 * Abilities and statuses as small, composable modifier hooks.
 *
 * At every strike the engine asks every living stack on the field (the
 * "owner") for each of its abilities' hooks, so an ability can act on its own
 * strikes (Mob, Charge), on strikes against itself (Bony) or as an aura on
 * neighbours (War Drums, Warcry). Statuses are asked through their holder.
 * The engine combines the answers by the rules of GAME_DESIGN.md 9.4:
 *
 * - flat Attack/Defense modifiers add up (same `stackKey`: only the largest),
 * - damage multipliers (whole percentages) multiply together,
 * - any `preventsRetaliation` cancels the retaliation.
 *
 * Later spells, artifacts and skills plug in by adding entries here.
 */

import { ABILITIES as ABILITY_DATA } from "../../data/abilities.ts";
import { isAdjacent } from "./hex.ts";
import type {
  AbilityId,
  BattleSide,
  BattleStack,
  BattleState,
  FlatModifier,
  MultiplierModifier,
  StatusId,
  StatusInstance,
  StrikeKind,
} from "./types.ts";

/** One strike as the hooks see it. Positions are as at the strike. */
export interface StrikeContext {
  readonly state: BattleState;
  /** The stack dealing the damage (the retaliator, for a retaliation). */
  readonly attacker: BattleStack;
  /** The stack taking the damage. */
  readonly defender: BattleStack;
  readonly kind: StrikeKind;
  /** Hexes the attacker moved this turn before striking (0 for retaliations). */
  readonly hexesMoved: number;
}

export interface StatusApplication {
  readonly status: StatusId;
  /** Removed at the end of this round. */
  readonly expiresAfterRound: number;
}

export interface AbilityDefinition {
  readonly id: AbilityId;
  readonly name: string;
  readonly description: string;
  /** Flat Attack added to `ctx.attacker`. */
  attackModifier?(ctx: StrikeContext, owner: BattleStack): FlatModifier | null;
  /** Flat Defense added to `ctx.defender`. */
  defenseModifier?(ctx: StrikeContext, owner: BattleStack): FlatModifier | null;
  /** A damage multiplier for the strike. */
  damageMultiplier?(
    ctx: StrikeContext,
    owner: BattleStack,
  ): MultiplierModifier | null;
  /** True cancels the defender's retaliation (checked for the melee strike). */
  preventsRetaliation?(ctx: StrikeContext, owner: BattleStack): boolean;
  /** A status put on `ctx.defender` after a hit it survives. */
  onHit?(ctx: StrikeContext, owner: BattleStack): StatusApplication | null;
  /** New top-creature HP at the start of the owner's turn, or null. */
  onTurnStart?(owner: BattleStack): { readonly topHp: number } | null;
}

export interface StatusDefinition {
  readonly id: StatusId;
  readonly name: string;
  attackModifier?(ctx: StrikeContext, holder: BattleStack): FlatModifier | null;
  defenseModifier?(
    ctx: StrikeContext,
    holder: BattleStack,
  ): FlatModifier | null;
}

export function isAlive(stack: BattleStack): boolean {
  return stack.count > 0;
}

/**
 * Living stacks of `side` adjacent to `target`, not counting `excludeId`
 * ("other friendly stacks adjacent to the target").
 */
export function countAdjacentAllies(
  state: BattleState,
  side: BattleSide,
  excludeId: string,
  target: BattleStack,
): number {
  let n = 0;
  for (const s of state.stacks) {
    if (s.side !== side || s.id === excludeId || !isAlive(s)) continue;
    if (s.id === target.id) continue;
    if (isAdjacent(s.hex, target.hex)) n++;
  }
  return n;
}

/** An ability's integer parameter from src/data/abilities.ts. */
function param(id: AbilityId, name: string): number {
  const v = ABILITY_DATA[id].params[name];
  if (v === undefined || !Number.isInteger(v)) {
    throw new Error(`ability ${id} has no integer param ${name}`);
  }
  return v;
}

function info(id: AbilityId): {
  id: AbilityId;
  name: string;
  description: string;
} {
  return {
    id,
    name: ABILITY_DATA[id].name,
    description: ABILITY_DATA[id].text,
  };
}

/**
 * The engine side of every ability. Names, rule text and numbers come from
 * src/data/abilities.ts (ABILITIES); this table supplies the behaviour.
 */
export const ABILITY_HOOKS: { readonly [K in AbilityId]: AbilityDefinition } = {
  mob: {
    ...info("mob"),
    attackModifier(ctx, owner) {
      if (owner.id !== ctx.attacker.id) return null;
      const n = countAdjacentAllies(
        ctx.state,
        owner.side,
        owner.id,
        ctx.defender,
      );
      const amount = Math.min(
        param("mob", "maxAttack"),
        n * param("mob", "attackPerStack"),
      );
      return amount > 0 ? { source: "mob", label: "Mob", amount } : null;
    },
  },
  venom: {
    ...info("venom"),
    onHit(ctx, owner) {
      if (owner.id !== ctx.attacker.id) return null;
      return {
        status: "venom",
        expiresAfterRound: ctx.state.round + param("venom", "rounds"),
      };
    },
  },
  "pack-hunter": {
    ...info("pack-hunter"),
    damageMultiplier(ctx, owner) {
      if (owner.id !== ctx.attacker.id) return null;
      const n = countAdjacentAllies(
        ctx.state,
        owner.side,
        owner.id,
        ctx.defender,
      );
      const bonus = Math.min(
        param("pack-hunter", "maxPercent"),
        n * param("pack-hunter", "percentPerStack"),
      );
      return bonus > 0
        ? { source: "pack-hunter", label: "Pack Hunter", percent: 100 + bonus }
        : null;
    },
  },
  "war-drums": {
    ...info("war-drums"),
    attackModifier(ctx, owner) {
      const a = ctx.attacker;
      if (owner.id === a.id || owner.side !== a.side) return null;
      if (!isAdjacent(owner.hex, a.hex)) return null;
      return {
        source: "war-drums",
        label: "War Drums",
        amount: param("war-drums", "attack"),
        stackKey: "war-drums",
      };
    },
  },
  charge: {
    ...info("charge"),
    damageMultiplier(ctx, owner) {
      if (owner.id !== ctx.attacker.id || ctx.kind !== "melee") return null;
      const bonus = Math.min(
        param("charge", "maxPercent"),
        ctx.hexesMoved * param("charge", "percentPerHex"),
      );
      return bonus > 0
        ? { source: "charge", label: "Charge", percent: 100 + bonus }
        : null;
    },
  },
  terror: {
    ...info("terror"),
    preventsRetaliation(ctx, owner) {
      return owner.id === ctx.attacker.id;
    },
  },
  bony: {
    ...info("bony"),
    damageMultiplier(ctx, owner) {
      if (owner.id !== ctx.defender.id || ctx.kind !== "shot") return null;
      return {
        source: "bony",
        label: "Bony",
        percent: param("bony", "rangedPercent"),
      };
    },
  },
  regenerate: {
    ...info("regenerate"),
    onTurnStart(owner) {
      return owner.topHp < owner.creature.hp
        ? { topHp: owner.creature.hp }
        : null;
    },
  },
  warcry: {
    ...info("warcry"),
    // Does not stack with itself (like War Drums; GAME_DESIGN.md 10).
    defenseModifier(ctx, owner) {
      const d = ctx.defender;
      if (owner.id === d.id || owner.side !== d.side) return null;
      if (!isAdjacent(owner.hex, d.hex)) return null;
      return {
        source: "warcry",
        label: "Warcry",
        amount: param("warcry", "defense"),
        stackKey: "warcry",
      };
    },
  },
};

export const STATUSES: { readonly [K in StatusId]: StatusDefinition } = {
  venom: {
    id: "venom",
    name: "Venom",
    defenseModifier(ctx, holder) {
      if (holder.id !== ctx.defender.id) return null;
      return {
        source: "venom",
        label: "Venom",
        amount: -param("venom", "defense"),
      };
    },
  },
};

/** Living stacks paired with each of their ability definitions, field order. */
function* abilityOwners(
  state: BattleState,
): Generator<readonly [AbilityDefinition, BattleStack]> {
  for (const s of state.stacks) {
    if (!isAlive(s)) continue;
    for (const id of s.creature.abilities)
      yield [ABILITY_HOOKS[id], s] as const;
  }
}

/** Keeps every modifier without a stackKey and the largest of each key. */
function dedupeFlat(mods: readonly FlatModifier[]): FlatModifier[] {
  const out: FlatModifier[] = [];
  const bestByKey = new Map<string, number>();
  for (const m of mods) {
    if (m.stackKey === undefined) {
      out.push(m);
      continue;
    }
    const i = bestByKey.get(m.stackKey);
    if (i === undefined) {
      bestByKey.set(m.stackKey, out.length);
      out.push(m);
    } else if (m.amount > (out[i] as FlatModifier).amount) {
      out[i] = m;
    }
  }
  return out;
}

function statusHolders(
  ctx: StrikeContext,
): Array<readonly [StatusDefinition, BattleStack]> {
  const out: Array<readonly [StatusDefinition, BattleStack]> = [];
  for (const holder of [ctx.attacker, ctx.defender]) {
    for (const st of holder.statuses) out.push([STATUSES[st.id], holder]);
  }
  return out;
}

export function collectAttackModifiers(ctx: StrikeContext): FlatModifier[] {
  const mods: FlatModifier[] = [];
  for (const [def, owner] of abilityOwners(ctx.state)) {
    const m = def.attackModifier?.(ctx, owner);
    if (m) mods.push(m);
  }
  for (const [def, holder] of statusHolders(ctx)) {
    const m = def.attackModifier?.(ctx, holder);
    if (m) mods.push(m);
  }
  return dedupeFlat(mods);
}

export function collectDefenseModifiers(ctx: StrikeContext): FlatModifier[] {
  const mods: FlatModifier[] = [];
  for (const [def, owner] of abilityOwners(ctx.state)) {
    const m = def.defenseModifier?.(ctx, owner);
    if (m) mods.push(m);
  }
  for (const [def, holder] of statusHolders(ctx)) {
    const m = def.defenseModifier?.(ctx, holder);
    if (m) mods.push(m);
  }
  return dedupeFlat(mods);
}

export function collectDamageMultipliers(
  ctx: StrikeContext,
): MultiplierModifier[] {
  const mods: MultiplierModifier[] = [];
  for (const [def, owner] of abilityOwners(ctx.state)) {
    const m = def.damageMultiplier?.(ctx, owner);
    if (m) mods.push(m);
  }
  return mods;
}

export function retaliationPrevented(ctx: StrikeContext): boolean {
  for (const [def, owner] of abilityOwners(ctx.state)) {
    if (def.preventsRetaliation?.(ctx, owner)) return true;
  }
  return false;
}

export function collectOnHit(ctx: StrikeContext): StatusApplication[] {
  const out: StatusApplication[] = [];
  for (const [def, owner] of abilityOwners(ctx.state)) {
    const a = def.onHit?.(ctx, owner);
    if (a) out.push(a);
  }
  return out;
}

/** Adds or refreshes a status (statuses never stack with themselves). */
export function withStatus(
  statuses: readonly StatusInstance[],
  next: StatusInstance,
): StatusInstance[] {
  return [...statuses.filter((s) => s.id !== next.id), next];
}
