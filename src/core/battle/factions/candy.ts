/**
 * The Candy Kingdom (FACTION_CANDY.md): Sticky (birthright) and the Stuck
 * condition, the six units' abilities, the three Drills, the Larder and The
 * Four O'Clock (granted to natives by the battle resolver while their owner
 * holds the building), and the two Commands.
 *
 * Engine pieces they lean on: the "cannot walk" condition flag and the
 * round-end turn (engine.ts `cannotWalk`, `aftersDue`), the per-round
 * "struck in melee" flag (`meleeStruckRound`), the re-aimed pull
 * (`pull(..., { reaim })`) and the abilities' battle-start hook.
 */

import { COMMANDS } from "../../../data/classes.ts";
import { withinReach } from "../abilities.ts";
import { hexDistance, sameHex } from "../hex.ts";
import {
  hasConditionKind,
  registerAbility,
  registerAct,
  registerConditionKind,
} from "../registry.ts";
import type { Effects } from "../registry.ts";
import { stackTotalHp } from "../resolve.ts";
import { clockText } from "../standard.ts";
import type { ActTarget, BattleStack, StackId } from "../types.ts";
import {
  commandC,
  enemiesOf,
  friendsOf,
  living,
  oneEach,
  stackOf,
  stampede,
  targetStack,
} from "./common.ts";

/** Stuck's clock as Sticky, Come In, Dear and the Flypaper Ribbon make it. */
export const STUCK_CLOCK = 2;
/** Reel In: range and HP per Wrangler (FACTION_CANDY 5, 5.1). */
export const REEL_IN_RANGE = 6;
export const LONG_PULL_RANGE = 8;
export const REEL_IN_HP_PER_WRANGLER = 30;
/** Sugar Rush: gate HP per Gingerbread Man. */
export const SUGAR_RUSH_HP = 20;
/** The Larder: HP healed per creature of the stack that eats. */
export const LARDER_HEAL = 5;

function bearsKind(s: BattleStack, kind: string): boolean {
  return s.conditions.some((c) => c.kind === kind);
}

function stick(fx: Effects, id: StackId, source: string): void {
  fx.addCondition(id, { kind: "stuck", clock: STUCK_CLOCK, source });
}

/** Pulls a stack toward a hex until it is next to it (re-aimed each hex). */
function reelTo(fx: Effects, id: StackId, to: StackId): void {
  if (!fx.isAlive(id) || !fx.isAlive(to)) return;
  const n = hexDistance(fx.stack(id).hex, fx.stack(to).hex) - 1;
  if (n > 0) fx.pull(id, fx.stack(to).hex, n, { reaim: true });
}

/** Reel In's reach and HP limit for the Wranglers against a stack. */
export function reelInLimits(
  me: BattleStack,
  target: BattleStack,
): { range: number; hp: number } {
  const long = me.creature.abilities.includes("long-pull");
  const doubled = long && bearsKind(target, "slowed");
  return {
    range: long ? LONG_PULL_RANGE : REEL_IN_RANGE,
    hp: REEL_IN_HP_PER_WRANGLER * me.count * (doubled ? 2 : 1),
  };
}

export function registerCandy(): void {
  // --- Stuck (FACTION_CANDY 3) -------------------------------------------
  registerConditionKind({
    id: "stuck",
    name: "Stuck",
    school: "clock",
    polarity: "bane",
    defaultClock: STUCK_CLOCK,
    cannotWalk: true,
    text: (c) =>
      `Cannot walk ${clockText(c.clock)}; it may still attack a stack next to it, shoot, cast and act, and other rules may still move it.`,
  });

  // --- Birthright ----------------------------------------------------------
  registerAbility({
    id: "sticky",
    name: "Sticky",
    description:
      "A stack this native stack strikes in melee, attacking or retaliating, becomes Stuck for 2 rounds: it cannot walk.",
    onStrike(ctx, owner) {
      if (owner.id !== ctx.attacker.id) return null;
      if (ctx.kind !== "melee" && ctx.kind !== "retaliation") return null;
      const target = ctx.defender.id;
      return (fx) => stick(fx, target, owner.id);
    },
  });

  // --- Units ---------------------------------------------------------------
  registerAct({
    id: "sugar-rush",
    name: "Sugar Rush",
    text: "Another friendly stack next to the Gingerbread Men becomes Hastened for 2 rounds. Gate 20 HP per Gingerbread Man.",
    kind: "ability",
    targets: 1,
    targetKinds: ["stack"],
    check(state, actorId, t) {
      const me = stackOf(state, actorId);
      const other = stackOf(state, targetStack(t[0]) ?? "");
      if (!me || !other || other.id === me.id)
        return "choose another friendly stack";
      if (other.side !== me.side) return "choose a friendly stack";
      return withinReach(state, me, me, other) ? null : "it must be adjacent";
    },
    aiTargets: (state, actorId) =>
      oneEach(friendsOf(state, actorId).filter((s) => s.id !== actorId)),
    resolve(fx, actorId, t) {
      const me = fx.stack(actorId);
      fx.addCondition(targetStack(t[0]) as StackId, {
        kind: "hastened",
        clock: 2,
        gate: { measure: "hp", max: SUGAR_RUSH_HP * me.count },
        source: actorId,
      });
    },
  });
  registerAbility({
    id: "sugar-rush",
    name: "Sugar Rush",
    description:
      "Once per battle, instead of attacking (it may move first): another friendly stack next to the Gingerbread Men becomes Hastened for 2 rounds. Gate 20 HP per Gingerbread Man.",
    act: "sugar-rush",
    moveFirst: true,
  });

  registerAbility({
    id: "sitting-ducks",
    name: "Sitting Ducks",
    description:
      "The Peppermint Archers' shots deal 50% more damage to a Stuck stack.",
    damageMultiplier(ctx, owner) {
      if (owner.id !== ctx.attacker.id || ctx.kind !== "shot") return null;
      return bearsKind(ctx.defender, "stuck")
        ? { source: "sitting-ducks", label: "Sitting Ducks", percent: 150 }
        : null;
    },
  });

  registerAct({
    id: "reel-in",
    name: "Reel In",
    text: "A stack, friend or foe, within 6 hexes of the Taffy Wranglers is pulled toward them until it is next to them. It works only on a stack with at most 30 HP per Wrangler.",
    kind: "ability",
    targets: 1,
    targetKinds: ["stack"],
    check(state, actorId, t) {
      const me = stackOf(state, actorId);
      const s = stackOf(state, targetStack(t[0]) ?? "");
      if (!me || !s || s.id === me.id) return "choose another stack";
      const { range, hp } = reelInLimits(me, s);
      if (hexDistance(me.hex, s.hex) > range)
        return `it must be within ${range} hexes`;
      const has = stackTotalHp(s);
      return has <= hp ? null : `limit ${hp} HP, the stack has ${has}`;
    },
    aiTargets: (state, actorId) =>
      oneEach(living(state).filter((s) => s.id !== actorId)),
    resolve(fx, actorId, t) {
      // A stack already next to the Wranglers is not moved; the use is
      // still spent for the turn.
      reelTo(fx, targetStack(t[0]) as StackId, actorId);
    },
  });
  registerAbility({
    id: "reel-in",
    name: "Reel In",
    description:
      "Every turn, instead of attacking (it may move first): a stack, friend or foe, within 6 hexes of the Taffy Wranglers is pulled toward them until it is next to them. Only a stack with at most 30 HP per Wrangler.",
    act: "reel-in",
    moveFirst: true,
    everyTurn: true,
  });

  registerAbility({
    id: "chewy",
    name: "Chewy",
    description:
      "The first melee Strike on the Gummy Bears each round, an attack or a retaliation, deals half damage.",
    damageMultiplier(ctx, owner) {
      if (owner.id !== ctx.defender.id) return null;
      if (ctx.kind !== "melee" && ctx.kind !== "retaliation") return null;
      return owner.meleeStruckRound === ctx.state.round
        ? null
        : { source: "chewy", label: "Chewy", percent: 50 };
    },
  });

  registerAbility({
    id: "afters",
    name: "Afters",
    description:
      "At the end of each round, before the round-end events, the Dragons take an extra turn if they have had none this round and bear no Hold. In it they cannot walk.",
    roundEndTurn: true,
  });

  // --- Drills --------------------------------------------------------------
  registerAbility({
    id: "hot-from-the-oven",
    name: "Hot from the Oven",
    description: "The Gingerbread Men start each battle Hastened for 1 round.",
    onBattleStart(fx, ownerId) {
      fx.hasten(ownerId, 1);
    },
  });

  registerAbility({
    id: "cool-mint",
    name: "Cool Mint",
    description:
      "A stack hit by the Peppermint Archers' shot becomes Slowed 1 for 2 rounds.",
    onStrike(ctx, owner) {
      if (owner.id !== ctx.attacker.id || ctx.kind !== "shot") return null;
      const target = ctx.defender.id;
      return (fx) => {
        // Slowed is a magic kind (core/magic/kinds.ts).
        if (!hasConditionKind("slowed")) return;
        fx.addCondition(target, {
          kind: "slowed",
          size: 1,
          clock: 2,
          source: owner.id,
        });
      };
    },
  });

  registerAbility({
    id: "long-pull",
    name: "Long Pull",
    description:
      "Reel In reaches 8 hexes, and its HP limit is doubled against a Slowed stack.",
  });

  // --- Town buildings (granted to natives by the battle resolver) ---------
  registerAbility({
    id: "larder",
    name: "Larder",
    description:
      "When this native stack ends a walk on sweets, it eats them: it becomes Hastened for 2 rounds and heals 5 HP per creature, reviving.",
    onWalkEnd(fx, ownerId, hex) {
      const g = fx.state.ground.find((x) => sameHex(x.hex, hex));
      if (!g || g.class !== "remains" || g.kind !== "sweets") return;
      if (fx.useRemains(hex) === null) return;
      fx.hasten(ownerId, 2);
      fx.heal(ownerId, LARDER_HEAL * fx.stack(ownerId).count, {
        revive: true,
      });
    },
  });

  registerAbility({
    id: "the-four-oclock",
    name: "The Four O'Clock",
    description: "This native stack starts each battle Hastened for 1 round.",
    onBattleStart(fx, ownerId) {
      fx.hasten(ownerId, 1);
    },
  });

  // --- Commands --------------------------------------------------------------
  registerAct({
    id: "crack",
    name: "Crack!",
    text: COMMANDS.crack?.text ?? "",
    kind: "command",
    targets: 1,
    targetKinds: ["stack"],
    check(state, actorId, t) {
      const me = stackOf(state, actorId);
      const e = stackOf(state, targetStack(t[0]) ?? "");
      if (!me || !e || e.side === me.side) return "choose an enemy stack";
      return bearsKind(e, "stuck") ? null : "the enemy must be Stuck";
    },
    aiTargets: (state, actorId) =>
      oneEach(enemiesOf(state, actorId).filter((e) => bearsKind(e, "stuck"))),
    resolve(fx, actorId, t) {
      stampede(fx, actorId, targetStack(t[0]) as StackId, "Crack!");
    },
  });

  registerAct({
    id: "come-in-dear",
    name: "Come In, Dear",
    text: COMMANDS["come-in-dear"]?.text ?? "",
    kind: "command",
    targets: 2,
    targetKinds: ["stack", "stack"],
    check(state, actorId, t) {
      const me = stackOf(state, actorId);
      const e = stackOf(state, targetStack(t[0]) ?? "");
      const f = stackOf(state, targetStack(t[1]) ?? "");
      if (!me || !e || !f) return "choose an enemy and a friendly stack";
      if (e.side === me.side) return "the first must be an enemy";
      if (f.side !== me.side) return "the second must be friendly";
      const reach = commandC(state, me.side) + 4;
      return hexDistance(e.hex, f.hex) <= reach
        ? null
        : `they must be within ${reach} hexes of each other`;
    },
    aiTargets: (state, actorId) => {
      const out: ActTarget[][] = [];
      for (const e of enemiesOf(state, actorId))
        for (const f of friendsOf(state, actorId))
          out.push([{ stack: e.id }, { stack: f.id }]);
      return out;
    },
    resolve(fx, actorId, t) {
      const enemy = targetStack(t[0]) as StackId;
      const friend = targetStack(t[1]) as StackId;
      reelTo(fx, enemy, friend);
      if (fx.isAlive(enemy)) stick(fx, enemy, actorId);
    },
  });
}
