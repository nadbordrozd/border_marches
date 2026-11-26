/**
 * Test-only content written in the grammar's terms (RULES_V2.md 1, concept
 * sections 2 and 8). The real spells, artifacts and creatures come from
 * later beads; these definitions exist to prove that the grammar composes
 * the concept's worked combos with no special cases.
 *
 * Importing this module registers everything once (vitest isolates each
 * test file, so every file gets a fresh registry).
 */

import {
  hasConditionKind,
  isAdjacent,
  registerAbility,
  registerAct,
  registerConditionKind,
  registerEffect,
  registerGroundKind,
  stackFightValue,
} from "../../../src/core/battle/index.ts";
import type {
  ActTarget,
  BattleCreatureStats,
  BattleState,
  StackId,
} from "../../../src/core/battle/index.ts";

function stackTarget(t: ActTarget | undefined): StackId {
  if (!t || !("stack" in t)) throw new Error("a stack target is required");
  return t.stack;
}

function conditionTarget(t: ActTarget | undefined): {
  stack: StackId;
  uid: number;
} {
  if (!t || !("condition" in t)) throw new Error("a condition is required");
  return { stack: t.stack, uid: t.condition };
}

function sideIn(state: BattleState, id: StackId) {
  const s = state.stacks.find((x) => x.id === id);
  if (!s) throw new Error(`no stack ${id}`);
  return s;
}

if (!hasConditionKind("scapegoat")) {
  // --- Conditions -----------------------------------------------------------

  /** Scapegoat (Accord, tier 1): damage to the bearer goes to the far end. */
  registerConditionKind({
    id: "scapegoat",
    name: "Scapegoat",
    school: "accord",
    polarity: "boon",
    link: "redirect",
    defaultClock: 3,
    text: () => "Damage to this stack is carried to the far end as Harm.",
  });

  /**
   * Reckoning (Hush debt, Acolytes' Dark Bargain): the bearer's Strikes are
   * x 150%; every point of bonus damage is added to the debt, which lands
   * on the bearer as Harm when the clock runs out.
   */
  registerConditionKind({
    id: "reckoning",
    name: "Reckoning",
    school: "hush",
    polarity: "bane",
    defaultClock: 3,
    text: (c) => `Strikes x 150%; owes ${c.size} Harm when the clock runs out.`,
    strikeMultiplier(ctx, holder) {
      if (holder.id !== ctx.attacker.id) return null;
      return { source: "reckoning", label: "Reckoning", percent: 150 };
    },
    onStrike(ctx, holder, c) {
      if (holder.id !== ctx.attacker.id) return null;
      return (fx) => {
        // Bonus = damage - damage without the x 150% (the triggering
        // Strike's number: "damage already dealt in this action").
        const e = fx.cause;
        const hit = e?.type === "damage" ? e.damage : 0;
        const bonus = hit - Math.floor((hit * 2) / 3);
        if (bonus > 0) fx.feedCondition(holder.id, c.uid, bonus);
      };
    },
    onExpire(fx, holder, c) {
      fx.harm(holder, c.size);
    },
  });

  /** A Storm hazard: Harm 5 on entry and at turn start. */
  registerGroundKind({
    id: "fire",
    name: "Fire",
    class: "hazard",
    school: "storm",
    defaultClock: 2,
    text: (f) => `Harm ${f.size} on entry and at turn start.`,
    onEnter(fx, id, f) {
      fx.harm(id, f.size);
    },
    onTurnStart(fx, id, f) {
      fx.harm(id, f.size);
    },
  });

  /** Mist (Hush surface): no shooting from it; shots into it x 50%. */
  registerGroundKind({
    id: "mist",
    name: "Mist",
    class: "surface",
    school: "hush",
    defaultClock: 3,
    cannotShoot: true,
    text: () =>
      "A stack standing in it cannot shoot; shots against it are x 50%.",
    strikeMultiplier(ctx, _f, standing) {
      if (standing.id !== ctx.defender.id || ctx.kind !== "shot") return null;
      return { source: "mist", label: "Mist", percent: 50 };
    },
  });

  /** A surface: +3 Defense to the stack standing on it. */
  registerGroundKind({
    id: "stones",
    name: "Stones",
    class: "surface",
    school: null,
    defaultClock: null,
    text: () => "+3 Defense to the stack standing here.",
    defenseModifier: () => ({ source: "stones", label: "Stones", amount: 3 }),
  });

  // --- Acts -----------------------------------------------------------------

  /** Notary stamp: Turned for the round, gated at 800 HP (concept 2). */
  registerAct({
    id: "stamp",
    name: "Stamp",
    text: "An enemy stack of at most 800 HP fights for you until the round ends.",
    kind: "ability",
    targets: 1,
    check(state, actor, targets) {
      const t = sideIn(state, stackTarget(targets[0]));
      return t.side === sideIn(state, actor).side
        ? "choose an enemy stack"
        : null;
    },
    resolve(fx, _actor, targets) {
      fx.addCondition(stackTarget(targets[0]), {
        kind: "turned",
        clock: 1,
        gate: { measure: "hp", max: 800 },
      });
    },
  });
  registerAbility({
    id: "notary-stamp",
    name: "Stamp",
    description: "Once per battle: Turned for the round (gate 800 HP).",
    act: "stamp",
  });

  /** Bellhop carry: move a condition between two stacks beside the Bellhop. */
  registerAct({
    id: "carry",
    name: "Carry",
    text: "Move one condition from a stack beside the Bellhop to another beside it.",
    kind: "ability",
    targets: 2,
    check(state, actor, targets) {
      const me = sideIn(state, actor);
      const from = sideIn(state, conditionTarget(targets[0]).stack);
      const to = sideIn(state, stackTarget(targets[1]));
      if (!isAdjacent(me.hex, from.hex) || !isAdjacent(me.hex, to.hex))
        return "both stacks must stand beside the Bellhop";
      return null;
    },
    resolve(fx, _actor, targets) {
      const { stack, uid } = conditionTarget(targets[0]);
      fx.moveCondition(stack, uid, stackTarget(targets[1]));
    },
  });
  registerAbility({
    id: "bellhop-carry",
    name: "Carry",
    description: "Once per battle: carry a condition between neighbours.",
    act: "carry",
  });

  /** Acolytes' Dark Bargain: a friendly stack takes on a Reckoning. */
  registerAct({
    id: "bargain",
    name: "Dark Bargain",
    text: "A friendly stack strikes x 150% for 3 rounds and owes the bonus.",
    kind: "ability",
    targets: 1,
    check(state, actor, targets) {
      const t = sideIn(state, stackTarget(targets[0]));
      return t.side !== sideIn(state, actor).side
        ? "choose a friendly stack"
        : null;
    },
    resolve(fx, _actor, targets) {
      fx.addCondition(stackTarget(targets[0]), {
        kind: "reckoning",
        size: 0,
        maxSize: 9999,
        clock: 3,
      });
    },
  });
  registerAbility({
    id: "acolyte-bargain",
    name: "Dark Bargain",
    description: "Once per battle: a Reckoning on a friendly stack.",
    act: "bargain",
  });

  /** Scapegoat (Accord tier 1 page): choose two friendly stacks. */
  registerAct({
    id: "scapegoat",
    name: "Scapegoat",
    text: "Choose two friendly stacks; for 3 rounds damage to the first goes to the second.",
    kind: "cast",
    school: "accord",
    tier: 1,
    targets: 2,
    check(state, actor, targets) {
      const side = sideIn(state, actor).side;
      for (const t of targets) {
        if (sideIn(state, stackTarget(t)).side !== side)
          return "choose two friendly stacks";
      }
      return null;
    },
    resolve(fx, _actor, targets) {
      fx.link(stackTarget(targets[0]), stackTarget(targets[1]), {
        kind: "scapegoat",
        clock: 3,
      });
    },
  });

  /** Pass On (the Hush tool): move a bane to a stack beside its bearer. */
  registerAct({
    id: "pass-on",
    name: "Pass On",
    text: "Choose a bane and a stack adjacent to its bearer; the bane moves there.",
    kind: "cast",
    school: "hush",
    tier: 2,
    targets: 2,
    check(state, _actor, targets) {
      const { stack, uid } = conditionTarget(targets[0]);
      const bearer = sideIn(state, stack);
      const c = bearer.conditions.find((x) => x.uid === uid);
      if (!c || c.polarity !== "bane") return "choose a bane";
      const to = sideIn(state, stackTarget(targets[1]));
      return isAdjacent(bearer.hex, to.hex)
        ? null
        : "choose a stack beside the bearer";
    },
    resolve(fx, _actor, targets) {
      const { stack, uid } = conditionTarget(targets[0]);
      fx.moveCondition(stack, uid, stackTarget(targets[1]));
    },
  });

  /**
   * Regrow (Bloom, size = heal 40, revives). Fuel is modelled in the test
   * content as an optional second target: an opposed-school condition that
   * ends (no expiry) and doubles the size. The real Echo and Fuel belong to
   * the magic bead.
   */
  registerAct({
    id: "regrow",
    name: "Regrow",
    text: "Heal 40, reviving; Fuel: burn an opposed condition to double it.",
    kind: "cast",
    school: "bloom",
    tier: 2,
    targets: 2,
    check(state, _actor, targets) {
      const fuel = targets[1];
      if (fuel && "condition" in fuel) {
        const c = sideIn(state, fuel.stack).conditions.find(
          (x) => x.uid === fuel.condition,
        );
        if (!c) return "no such condition";
        if (c.school !== "clock" && c.school !== "hush")
          return "Fuel must be of a school opposed to Bloom";
      }
      return null;
    },
    resolve(fx, _actor, targets) {
      let size = 40;
      const fuel = targets[1];
      if (fuel && "condition" in fuel) {
        fx.endCondition(fuel.stack, fuel.condition);
        size *= 2;
      }
      fx.heal(stackTarget(targets[0]), size, { revive: true });
    },
  });

  /** Broadside-like test spell: Harm X to one stack (law 5: any stack). */
  registerAct({
    id: "bolt",
    name: "Bolt",
    text: "Harm 150 to any stack.",
    kind: "cast",
    school: "storm",
    tier: 3,
    targets: 1,
    resolve(fx, _actor, targets) {
      fx.harm(stackTarget(targets[0]), 150);
    },
  });

  // --- Effects (scheduled events, battle-start rules) -----------------------

  /** The Albatross: the wearer's strongest stack starts Jinxed. */
  registerEffect("albatross", (fx, _args, owner) => {
    const mine = fx.state.stacks
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.owner === owner.side && s.count > 0)
      .sort((a, b) => stackFightValue(b.s) - stackFightValue(a.s) || a.i - b.i);
    const top = mine[0];
    if (top) fx.addCondition(top.s.id, { kind: "jinxed", size: 25, clock: 3 });
  });

  /** A delayed shell: a special Strike by the named stack at the target. */
  registerEffect("shell", (fx, args) => {
    const a = args as { from: string; at: string };
    fx.strike(a.from, a.at, { kind: "special", label: "Shell" });
  });

  /** Harm to a named stack (for timeline tests). */
  registerEffect("harm", (fx, args) => {
    const a = args as { at: string; x: number };
    fx.harm(a.at, a.x);
  });

  // A broken content rule: every strike triggers a new special strike back.
  registerAbility({
    id: "echo-loop",
    name: "Echo Loop",
    description: "Broken on purpose: strikes back at every strike.",
    onStrike(ctx, owner) {
      if (owner.id !== ctx.defender.id) return null;
      const target = ctx.attacker.id;
      return (fx) => {
        fx.strike(owner.id, target, { kind: "special" });
      };
    },
  });

  // A rule that hits everyone around: "on strike, Harm 1 to the struck
  // stack" owned by a bystander (for reaction-order tests).
  registerAbility({
    id: "watcher",
    name: "Watcher",
    description: "When any stack is struck, Harm 1 to it.",
    onStrike(ctx) {
      const target = ctx.defender.id;
      return (fx) => {
        fx.harm(target, 1);
      };
    },
  });
}

/** Creatures of the worked combos (stats chosen for round numbers). */
export const NOTARY: BattleCreatureStats = {
  id: "notary",
  name: "Notaries",
  tier: 2,
  hp: 15,
  attack: 4,
  defense: 6,
  damage: 2,
  speed: 10,
  abilities: ["notary-stamp"],
  tags: { remains: "wreck", cannotBear: ["heartened", "shaken"] },
};

export const BELLHOP: BattleCreatureStats = {
  id: "bellhop",
  name: "Bellhops",
  tier: 1,
  hp: 8,
  attack: 3,
  defense: 3,
  damage: 1,
  speed: 10,
  abilities: ["bellhop-carry"],
};

export const ACOLYTE: BattleCreatureStats = {
  id: "acolyte",
  name: "Acolytes",
  tier: 2,
  hp: 12,
  attack: 4,
  defense: 4,
  damage: 2,
  speed: 10,
  abilities: ["acolyte-bargain"],
};
