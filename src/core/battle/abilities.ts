/**
 * The MVP abilities on the battle grammar (RULES_V2.md 1.3, 1.7, 1.10).
 *
 * Passive rules use the modifier hook: at every strike the engine asks every
 * living stack on the field (the "owner") for each of its abilities' hooks,
 * so an ability can act on its own strikes (Mob, Charge), on strikes against
 * itself (Bony) or as an aura on neighbours (War Drums, Warcry). The engine
 * combines the answers by GAME_DESIGN.md 9.4 and RULES_V2 1.8:
 *
 * - flat Attack/Defense modifiers add up (same `stackKey`: only the largest),
 * - percentage multipliers multiply together, clamped to 1/4 .. 4,
 * - any `preventsRetaliation` cancels the retaliation.
 *
 * Venom is "on strike, add Venomed" (a reaction); Regenerate is a turn-start
 * Heal. "Friendly" is read from each stack's live side (law 4), so a Turned
 * Shaman's War Drums help its new side. Content abilities register in
 * registry.ts with the same shape.
 */

import { ABILITIES as ABILITY_DATA } from "../../data/abilities.ts";
import { isAdjacent } from "./hex.ts";
import type { AbilityDef } from "./registry.ts";
import type {
  AbilityId,
  BattleSide,
  BattleStack,
  BattleState,
} from "./types.ts";

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
export function abilityParam(id: AbilityId, name: string): number {
  const v = ABILITY_DATA[id].params[name];
  if (v === undefined || !Number.isInteger(v)) {
    throw new Error(`ability ${id} has no integer param ${name}`);
  }
  return v;
}
const param = abilityParam;

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
 * The engine side of every MVP ability. Names, rule text and numbers come
 * from src/data/abilities.ts (ABILITIES); this table supplies the behaviour.
 */
export const ABILITY_HOOKS: { readonly [K in AbilityId]: AbilityDef } = {
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
    // On strike (shot, melee or retaliation): add Venomed (Bloom, bane,
    // size 3, clock 2: "until the end of the next round").
    onStrike(ctx, owner) {
      if (owner.id !== ctx.attacker.id) return null;
      const target = ctx.defender.id;
      const tier = owner.creature.tier;
      return (fx) => {
        fx.addCondition(target, {
          kind: "venomed",
          size: param("venom", "defense"),
          clock: param("venom", "rounds") + 1,
          tier,
          source: owner.id,
        });
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
    // Turn start: Heal the top creature to full (never revives).
    onTurnStart(fx, ownerId) {
      const s = fx.stack(ownerId);
      if (s.topHp < s.creature.hp) fx.heal(ownerId, s.creature.hp - s.topHp);
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
