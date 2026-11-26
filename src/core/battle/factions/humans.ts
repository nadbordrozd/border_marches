/**
 * The Realm (FACTION_HUMANS.md): Sworn (birthright), the six units'
 * abilities, the three Drills, Challenged, and the two Commands.
 */

import { COMMANDS } from "../../../data/classes.ts";
import { isAlive, withinReach } from "../abilities.ts";
import { canShoot } from "../engine.ts";
import {
  registerAbility,
  registerAct,
  registerConditionKind,
  registerEffect,
} from "../registry.ts";
import type { BattleStack, StackId } from "../types.ts";
import {
  commandC,
  enemiesOf,
  friendsOf,
  oneEach,
  polarityCount,
  sideFlags,
  stackOf,
  targetStack,
} from "./common.ts";

/** Side flag: Chapel of Oaths (FACTION_HUMANS 9). */
export const CHAPEL_OF_OATHS = "chapel-of-oaths";

export function registerHumans(): void {
  // --- Conditions --------------------------------------------------------
  registerConditionKind({
    id: "sworn",
    name: "Sworn",
    school: "accord",
    polarity: "boon",
    link: "other",
    defaultClock: null,
    swapAction: true,
    text: () =>
      "A link: when this stack is healed, the far end is healed as much (reviving if this heal revives). On its turn, instead of walking, it may swap places with the far end.",
    onHealed(fx, _holder, c, x, revive) {
      if (c.link !== null && fx.isAlive(c.link))
        fx.heal(c.link, x, { revive, shared: true });
    },
    onFarEndDied(fx, holder) {
      const side = fx.sideOf(holder);
      if (!sideFlags(fx.state, side).includes(CHAPEL_OF_OATHS)) return;
      fx.addCondition(holder, { kind: "heartened", source: CHAPEL_OF_OATHS });
      fx.addCondition(holder, { kind: "lucky", source: CHAPEL_OF_OATHS });
    },
  });
  registerConditionKind({
    id: "challenged",
    name: "Challenged",
    school: "accord",
    polarity: "bane",
    link: "other",
    text: (c) =>
      `Its Strikes on any stack other than the far end deal half damage${c.clock === null ? "" : ` for ${c.clock} round${c.clock === 1 ? "" : "s"}`}.`,
    strikeMultiplier(ctx, holder, c) {
      if (holder.id !== ctx.attacker.id || c.link === ctx.defender.id)
        return null;
      return { source: "challenged", label: "Challenged", percent: 50 };
    },
  });

  // --- Birthright: Sworn pairs at deployment -----------------------------
  registerEffect("birthright:sworn", (fx, _args, owner) => {
    const natives = fx.state.stacks
      .filter(
        (s) => s.owner === owner.side && isAlive(s) && s.native && !s.summoned,
      )
      .sort((a, b) => a.slot - b.slot);
    for (let i = 0; i + 1 < natives.length; i += 2) {
      const a = natives[i] as BattleStack;
      const b = natives[i + 1] as BattleStack;
      fx.link(a.id, b.id, { kind: "sworn", source: "sworn" });
      fx.link(b.id, a.id, { kind: "sworn", source: "sworn" });
    }
  });

  // --- Units ---------------------------------------------------------------
  registerAct({
    id: "attend",
    name: "Attend",
    text: "Another friendly stack adjacent to the Squires becomes Heartened. Gate 20 HP per Squire.",
    kind: "ability",
    targets: 1,
    targetKinds: ["stack"],
    check(state, actorId, t) {
      const me = stackOf(state, actorId);
      const id = targetStack(t[0]);
      const other = id === null ? null : stackOf(state, id);
      if (!me || !other || other.id === me.id)
        return "choose another friendly stack";
      if (other.side !== me.side) return "choose a friendly stack";
      if (!withinReach(state, me, me, other)) return "it must be adjacent";
      return null;
    },
    aiTargets: (state, actorId) =>
      oneEach(friendsOf(state, actorId).filter((s) => s.id !== actorId)),
    resolve(fx, actorId, t) {
      const me = fx.stack(actorId);
      fx.addCondition(targetStack(t[0]) as StackId, {
        kind: "heartened",
        gate: { measure: "hp", max: 20 * me.count },
        source: actorId,
      });
    },
  });
  registerAbility({
    id: "attend",
    name: "Attend",
    description:
      "Once per battle, instead of attacking (it may move first): another friendly stack adjacent to the Squires becomes Heartened. Gate 20 HP per Squire.",
    act: "attend",
    moveFirst: true,
  });

  registerAbility({
    id: "covering-volley",
    name: "Covering Volley",
    description:
      "When the far end of one of the Longbowmen's links attacks in melee and its target survives, the Longbowmen shoot that target too, for half damage, after its retaliation (if they can shoot now).",
    onStrike(ctx, owner) {
      if (ctx.kind !== "melee" || ctx.attacker.id === owner.id) return null;
      const linked = owner.conditions.some((c) => c.link === ctx.attacker.id);
      if (!linked) return null;
      const target = ctx.defender.id;
      const me = owner.id;
      return (fx) => {
        if (!fx.isAlive(target) || !fx.isAlive(me)) return;
        if (!canShoot(fx.state, me)) return;
        fx.spendShot(me);
        fx.strike(me, target, {
          kind: "shot",
          percent: 50,
          label: "Covering Volley",
        });
      };
    },
  });

  registerAbility({
    id: "shield-wall",
    name: "Shield Wall",
    description:
      "Other friendly stacks adjacent to the Men-at-Arms get +2 Defense. Two Shield Walls on one stack do not add up.",
    defenseModifier(ctx, owner) {
      const d = ctx.defender;
      if (owner.id === d.id || owner.side !== d.side) return null;
      if (!withinReach(ctx.state, owner, owner, d)) return null;
      return {
        source: "shield-wall",
        label: "Shield Wall",
        amount: 2,
        stackKey: "shield-wall",
      };
    },
  });

  registerAbility({
    id: "stand-fast",
    name: "Stand Fast",
    description:
      "Retaliates against every melee attack, not just once a round.",
    unlimitedRetaliation: true,
  });

  registerAbility({
    id: "paragon",
    name: "Paragon",
    description:
      "The Dragonslayers' Strikes deal 10% more damage for each boon on them (at most 50% more), retaliations included.",
    damageMultiplier(ctx, owner) {
      if (owner.id !== ctx.attacker.id) return null;
      const bonus = Math.min(50, 10 * polarityCount(owner, "boon"));
      return bonus > 0
        ? { source: "paragon", label: "Paragon", percent: 100 + bonus }
        : null;
    },
  });

  // --- Drills --------------------------------------------------------------
  registerAbility({
    id: "pin-down",
    name: "Pin Down",
    description:
      "A stack hit by the Longbowmen's shot becomes Delayed for 2 rounds. Gate 15 HP per Longbowman, doubled against a Slowed stack.",
    onStrike(ctx, owner) {
      if (owner.id !== ctx.attacker.id || ctx.kind !== "shot") return null;
      const target = ctx.defender.id;
      const gate = 15 * owner.count;
      return (fx) => {
        // Doubled against a Slowed stack (a slow stack is easy to pin).
        const slowed =
          fx.isAlive(target) &&
          fx.stack(target).conditions.some((c) => c.kind === "slowed");
        fx.addCondition(target, {
          kind: "delayed",
          clock: 2,
          gate: { measure: "hp", max: slowed ? 2 * gate : gate },
          source: owner.id,
        });
      };
    },
  });

  registerAbility({
    id: "bodyguard",
    name: "Bodyguard",
    description:
      "When an enemy adjacent to the Men-at-Arms attacks another friendly stack adjacent to them in melee, the Men-at-Arms strike that enemy back, using up their retaliation for the round (if they still have it).",
    onStrike(ctx, owner) {
      if (ctx.kind !== "melee") return null;
      const a = ctx.attacker;
      const d = ctx.defender;
      if (d.id === owner.id || a.id === owner.id) return null;
      if (d.side !== owner.side || a.side === owner.side) return null;
      if (
        !withinReach(ctx.state, owner, owner, a) ||
        !withinReach(ctx.state, owner, owner, d)
      )
        return null;
      const me = owner.id;
      return (fx) => {
        if (!fx.isAlive(a.id) || !fx.isAlive(me)) return;
        const now = fx.stack(me);
        if (!withinReach(fx.state, now, now, fx.stack(a.id))) return;
        if (!fx.spendRetaliation(me)) return;
        fx.strike(me, a.id, { kind: "retaliation", label: "Bodyguard" });
      };
    },
  });

  registerAbility({
    id: "follow-through",
    name: "Follow Through",
    description:
      "After a melee attack at the end of a walk of 4 or more hexes, the Knights push the target 1 hex directly away. No longer next to them, it does not retaliate.",
    onStrike(ctx, owner) {
      if (owner.id !== ctx.attacker.id || ctx.kind !== "melee") return null;
      if (ctx.hexesMoved < 4) return null;
      const target = ctx.defender.id;
      return (fx) => {
        if (!fx.isAlive(target) || !fx.isAlive(owner.id)) return;
        fx.push(target, fx.stack(owner.id).hex, 1);
      };
    },
  });

  // --- Commands --------------------------------------------------------------
  registerAct({
    id: "single-combat",
    name: "Single Combat",
    text: COMMANDS["single-combat"]?.text ?? "",
    kind: "command",
    targets: 2,
    targetKinds: ["stack", "stack"],
    check(state, actorId, t) {
      const me = stackOf(state, actorId);
      const f = stackOf(state, targetStack(t[0]) ?? "");
      const e = stackOf(state, targetStack(t[1]) ?? "");
      if (!me || !f || !e) return "choose a friendly and an enemy stack";
      if (f.side !== me.side) return "the first must be friendly";
      if (e.side === me.side) return "the second must be an enemy";
      return null;
    },
    aiTargets: (state, actorId) =>
      friendsOf(state, actorId).flatMap((f) =>
        enemiesOf(state, actorId).map((e) => [
          { stack: f.id },
          { stack: e.id },
        ]),
      ),
    resolve(fx, actorId, t) {
      const c = commandC(fx.state, fx.sideOf(actorId));
      const friend = targetStack(t[0]) as StackId;
      const foe = targetStack(t[1]) as StackId;
      fx.link(foe, friend, {
        kind: "challenged",
        clock: Math.min(3, c + 1),
        source: "single-combat",
      });
    },
  });

  registerAct({
    id: "swear-in",
    name: "Swear In",
    text: COMMANDS["swear-in"]?.text ?? "",
    kind: "command",
    targets: 2,
    targetStep: 2,
    targetKinds: ["stack", "stack"],
    maxTargets: (state, actorId) => {
      const me = stackOf(state, actorId);
      return 2 * (me ? commandC(state, me.side) : 1);
    },
    check(state, _actorId, t) {
      const seen = new Set<string>();
      for (const x of t) {
        const s = stackOf(state, targetStack(x) ?? "");
        if (!s) return "choose stacks";
        if (seen.has(s.id)) return "each stack once";
        seen.add(s.id);
        if (s.conditions.some((c) => c.kind === "sworn"))
          return "a stack already bears Sworn";
      }
      return null;
    },
    aiTargets: (state, actorId) => {
      const free = friendsOf(state, actorId).filter(
        (s) => !s.conditions.some((c) => c.kind === "sworn"),
      );
      return free.flatMap((a, i) =>
        free.slice(i + 1).map((b) => [{ stack: a.id }, { stack: b.id }]),
      );
    },
    resolve(fx, _actorId, t) {
      for (let i = 0; i + 1 < t.length; i += 2) {
        const a = targetStack(t[i]) as StackId;
        const b = targetStack(t[i + 1]) as StackId;
        fx.link(a, b, { kind: "sworn", source: "swear-in" });
        fx.link(b, a, { kind: "sworn", source: "swear-in" });
      }
    },
  });
}
