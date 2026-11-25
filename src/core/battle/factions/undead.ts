/**
 * The Restless (FACTION_UNDEAD.md): Not Done Yet (birthright), the six
 * units' abilities, the three Drills and the two Commands. Getting up
 * itself is engine machinery (resolve.ts `tryGetUp`); these abilities
 * opt into it.
 */

import { withinReach } from "../abilities.ts";
import { sameHex } from "../hex.ts";
import type { Hex } from "../hex.ts";
import { registerAbility, registerAct } from "../registry.ts";
import type { StackId } from "../types.ts";
import {
  commandC,
  discAround,
  enemiesOf,
  friendsOf,
  oneEach,
  polarityCount,
  remainsCount,
  stackOf,
  targetHex,
  targetStack,
  within,
} from "./common.ts";

export function registerUndead(): void {
  // --- Birthright --------------------------------------------------------
  registerAbility({
    id: "not-done-yet",
    name: "Not Done Yet",
    description:
      "Once per battle, when this native stack dies and leaves remains, it gets up at the next round start on its remains with a third of its starting count (rounded up) at full HP. It crumbles when the battle ends.",
    getUp: "once",
  });

  // --- Units ---------------------------------------------------------------
  registerAbility({
    id: "feast",
    name: "Feast",
    description:
      "When the Ghouls end a walk on remains, the remains are consumed and the Ghouls are healed 6 x their count, reviving. They may still attack.",
    onWalkEnd(fx, ownerId, hex) {
      const g = fx.state.ground.find((x) => sameHex(x.hex, hex));
      if (!g || g.class !== "remains") return;
      if (fx.useRemains(hex) === null) return;
      fx.heal(ownerId, 6 * fx.stack(ownerId).count, { revive: true });
    },
  });

  registerAbility({
    id: "wail",
    name: "Wail",
    description:
      "A stack hit by the Banshees' shot gains Shaken for 2 rounds, gate 12 HP per Banshee.",
    onStrike(ctx, owner) {
      if (owner.id !== ctx.attacker.id || ctx.kind !== "shot") return null;
      const target = ctx.defender.id;
      const gate = 12 * owner.count;
      const tier = owner.creature.tier;
      return (fx) => {
        fx.addCondition(target, {
          kind: "shaken",
          clock: 2,
          gate: { measure: "hp", max: gate },
          tier,
          source: owner.id,
        });
      };
    },
  });

  registerAbility({
    id: "keen",
    name: "Keen",
    description:
      "The Banshees' shots get +10% damage for each remains feature on the field (max +50%).",
    damageMultiplier(ctx, owner) {
      if (owner.id !== ctx.attacker.id || ctx.kind !== "shot") return null;
      const bonus = Math.min(50, 10 * remainsCount(ctx.state));
      return bonus > 0
        ? { source: "keen", label: "Keen", percent: 100 + bonus }
        : null;
    },
  });

  registerAbility({
    id: "drain",
    name: "Drain",
    description:
      "After the Vampires' melee attack (not a retaliation), they are healed half the damage it dealt, rounded down, reviving.",
    onStrike(ctx, owner) {
      if (owner.id !== ctx.attacker.id || ctx.kind !== "melee") return null;
      return (fx) => {
        const cause = fx.cause;
        const dealt =
          cause !== null && cause.type === "damage"
            ? cause.redirectedTo === null
              ? cause.hpLost
              : cause.damage
            : 0;
        const x = Math.floor(dealt / 2);
        if (x > 0) fx.heal(owner.id, x, { revive: true });
      };
    },
  });

  registerAbility({
    id: "mist",
    name: "Mist",
    description:
      "The Vampires' walk is a teleport to any free hex within their Speed; nothing between matters.",
    teleportWalk: true,
  });

  registerAbility({
    id: "long-live-the-king",
    name: "Long Live the King",
    description:
      "When the Late Kings die and will not get up otherwise, the nearest other remains are consumed and they get up as by Not Done Yet. No limit per battle.",
    getUp: "paid",
  });

  registerAbility({
    id: "royal-displeasure",
    name: "Royal Displeasure",
    description:
      "+25% Strike damage for each bane the target bears (max +100%). Applies to attacks and retaliations.",
    damageMultiplier(ctx, owner) {
      if (owner.id !== ctx.attacker.id) return null;
      const bonus = Math.min(100, 25 * polarityCount(ctx.defender, "bane"));
      return bonus > 0
        ? {
            source: "royal-displeasure",
            label: "Royal Displeasure",
            percent: 100 + bonus,
          }
        : null;
    },
  });

  // --- Drills --------------------------------------------------------------
  registerAbility({
    id: "spare-parts",
    name: "Spare Parts",
    description:
      "When the Skeletons get up, their bones are not consumed: the feature stays under them.",
    keepsRemainsOnGetUp: true,
  });

  registerAbility({
    id: "grave-rot",
    name: "Grave Rot",
    description:
      "A stack struck by the Ghouls in melee (attack or retaliation) gains Venomed 3 for 2 rounds.",
    onStrike(ctx, owner) {
      if (owner.id !== ctx.attacker.id) return null;
      if (ctx.kind !== "melee" && ctx.kind !== "retaliation") return null;
      const target = ctx.defender.id;
      const tier = owner.creature.tier;
      return (fx) => {
        fx.addCondition(target, {
          kind: "venomed",
          size: 3,
          clock: 2,
          tier,
          source: owner.id,
        });
      };
    },
  });

  registerAct({
    id: "mesmerise",
    name: "Mesmerise",
    text: "An adjacent enemy stack gains Asleep for 2 rounds, gate 30 HP per Vampire.",
    kind: "ability",
    targets: 1,
    targetKinds: ["stack"],
    check(state, actorId, t) {
      const me = stackOf(state, actorId);
      const e = stackOf(state, targetStack(t[0]) ?? "");
      if (!me || !e || e.side === me.side) return "choose an enemy stack";
      return withinReach(state, me, me, e) ? null : "it must be adjacent";
    },
    aiTargets: (state, actorId) => oneEach(enemiesOf(state, actorId)),
    resolve(fx, actorId, t) {
      const me = fx.stack(actorId);
      fx.addCondition(targetStack(t[0]) as StackId, {
        kind: "asleep",
        clock: 2,
        gate: { measure: "hp", max: 30 * me.count },
        tier: me.creature.tier,
        source: actorId,
      });
    },
  });
  registerAbility({
    id: "mesmerise",
    name: "Mesmerise",
    description:
      "Once per battle, in place of an attack (may move first): an adjacent enemy stack gains Asleep for 2 rounds, gate 30 HP per Vampire.",
    act: "mesmerise",
    moveFirst: true,
  });

  // --- Commands --------------------------------------------------------------
  registerAct({
    id: "one-more-time",
    name: "One More Time",
    text: "Up to C friendly stacks that are not summoned gain the badge 'gets up': the next time each dies and leaves remains, it gets up as by Not Done Yet.",
    kind: "command",
    targets: 1,
    targetKinds: ["stack"],
    maxTargets: (state, actorId) => {
      const me = stackOf(state, actorId);
      return me ? commandC(state, me.side) : 1;
    },
    check(state, actorId, t) {
      const me = stackOf(state, actorId);
      const seen = new Set<string>();
      for (const x of t) {
        const s = stackOf(state, targetStack(x) ?? "");
        if (!me || !s || s.side !== me.side) return "choose friendly stacks";
        if (s.summoned) return "summoned stacks cannot get up";
        if (seen.has(s.id)) return "each stack once";
        seen.add(s.id);
      }
      return null;
    },
    aiTargets: (state, actorId) =>
      oneEach(friendsOf(state, actorId).filter((s) => !s.summoned)),
    resolve(fx, _actorId, t) {
      for (const x of t) fx.setGetsUp(targetStack(x) as StackId, true);
    },
  });

  registerAct({
    id: "last-rites",
    name: "Last Rites",
    text: "Choose remains: they are consumed, and every enemy stack within C hexes gains Shaken (2 rounds) and Jinxed 25 (2 rounds).",
    kind: "command",
    targets: 1,
    targetKinds: ["hex"],
    area(state, actorId, t) {
      const h = targetHex(t[0]);
      const me = stackOf(state, actorId);
      if (h === null || !me) return [];
      return discAround(h, commandC(state, me.side));
    },
    check(state, _actorId, t) {
      const h = targetHex(t[0]);
      if (h === null) return "choose remains";
      const g = state.ground.find((x) => sameHex(x.hex, h));
      return g && g.class === "remains" ? null : "no remains there";
    },
    aiTargets: (state) =>
      state.ground
        .filter((g) => g.class === "remains")
        .map((g) => [{ hex: g.hex }]),
    resolve(fx, actorId, t) {
      const h = targetHex(t[0]) as Hex;
      const side = fx.sideOf(actorId);
      const c = commandC(fx.state, side);
      if (fx.useRemains(h) === null) return;
      for (const s of within(fx.state, h, c)) {
        if (fx.sideOf(s.id) === side) continue;
        fx.addCondition(s.id, {
          kind: "shaken",
          clock: 2,
          source: "last-rites",
        });
        fx.addCondition(s.id, {
          kind: "jinxed",
          size: 25,
          clock: 2,
          source: "last-rites",
        });
      }
    },
  });
}
