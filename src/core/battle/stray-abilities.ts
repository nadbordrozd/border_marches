/**
 * The strays' and caretakers' abilities (CONTENT_CREATURES section 2, bead
 * bzc.13) in the battle grammar: passive hooks and activated acts, all
 * through the verbs of {@link Effects}.
 *
 * Many abilities make condition kinds of CONTENT_SPELLS (Hushed, Mollified,
 * Warded, Shielded and so on) that magic (src/core/magic/kinds.ts)
 * registers; if a kind is missing, the part of the ability that makes it
 * does nothing (see {@link tryCondition}). The Sexton's Night Shift is its
 * creature-caster page (src/data/strays.ts), and the summons' Gone to Seed
 * and Fade are magic's own registrations. The Beanstalk Giant's Stomp is
 * "giant-stomp" (the Orc Warboss's Stomp is another rule).
 *
 * Imported for its side effect by the battle resolver.
 */
import { STRAY_ABILITY_TEXT } from "../../data/strays.ts";
import type { StrayAbilityId } from "../../data/types.ts";
import { isAlive } from "./abilities.ts";
import { hexDistance, inBounds, isAdjacent, sameHex, stepHex } from "./hex.ts";
import {
  hasAbility,
  hasAct,
  hasConditionKind,
  registerAbility as registerAbilityStrict,
  registerAct as registerActStrict,
  type AbilityDef,
  type ActDef,
  type Effects,
} from "./registry.ts";
import type {
  ActTarget,
  BattleStack,
  ConditionSpec,
  StackId,
} from "./types.ts";

/** Registers unless another content module already did (idempotent). */
function registerAbility(def: AbilityDef): void {
  if (!hasAbility(def.id)) registerAbilityStrict(def);
}
function registerAct(def: ActDef): void {
  if (!hasAct(def.id)) registerActStrict(def);
}

function info(
  id: StrayAbilityId,
): Pick<AbilityDef, "id" | "name" | "description"> {
  const t = STRAY_ABILITY_TEXT[id];
  return { id, name: t.name, description: t.text };
}

/** Adds a condition when its kind is registered; otherwise nothing. */
function tryCondition(fx: Effects, target: StackId, spec: ConditionSpec): void {
  if (!hasConditionKind(spec.kind)) return;
  if (!fx.isAlive(target)) return;
  fx.addCondition(target, spec);
}

function bears(stack: BattleStack, kind: string): boolean {
  return stack.conditions.some((c) => c.kind === kind);
}

function adjacentStacks(fx: Effects, actor: StackId): BattleStack[] {
  const me = fx.stack(actor);
  return fx.state.stacks.filter(
    (s) => s.id !== actor && isAlive(s) && isAdjacent(s.hex, me.hex),
  );
}

/** A stack-target act check: one living stack, optionally adjacent/own side. */
function oneStack(opts: {
  adjacent?: boolean;
  within?: number;
  side?: "friend" | "enemy";
}): NonNullable<ActDef["check"]> {
  return (state, actorId, targets) => {
    const t = targets[0];
    if (targets.length !== 1 || t === undefined || !("stack" in t)) {
      return "choose one stack";
    }
    const me = state.stacks.find((s) => s.id === actorId);
    const them = state.stacks.find((s) => s.id === t.stack);
    if (me === undefined || them === undefined || !isAlive(them)) {
      return "no such stack";
    }
    if (them.id === me.id) return "choose another stack";
    if (opts.adjacent === true && !isAdjacent(me.hex, them.hex)) {
      return "the stack must be adjacent";
    }
    if (
      opts.within !== undefined &&
      hexDistance(me.hex, them.hex) > opts.within
    ) {
      return `the stack must be within ${opts.within} hexes`;
    }
    if (opts.side === "friend" && them.side !== me.side)
      return "a friendly stack";
    if (opts.side === "enemy" && them.side === me.side) return "an enemy stack";
    return null;
  };
}

const target0 = (targets: readonly ActTarget[]): StackId => {
  const t = targets[0];
  return t !== undefined && "stack" in t ? t.stack : "";
};

/**
 * An act's rule: the ability's text without its "Once per battle, instead
 * of attacking:" lead (the action bar shows how often it works), like the
 * faction acts' texts.
 */
function actText(text: string): string {
  const rest = text.replace(
    /^(?:Once per battle|Every turn), instead of attacking: /,
    "",
  );
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/** One-target activated ability: the act and its ability. */
function activated(
  id: StrayAbilityId,
  check: NonNullable<ActDef["check"]> | undefined,
  targets: number,
  resolve: ActDef["resolve"],
  everyTurn = false,
): void {
  const t = STRAY_ABILITY_TEXT[id];
  registerAct({
    id: `stray:${id}`,
    name: t.name,
    text: actText(t.text),
    kind: "ability",
    targets,
    ...(check !== undefined ? { check } : {}),
    resolve,
  });
  // "Instead of attacking": it may move first (CONTENT_CREATURES 2).
  registerAbility({
    ...info(id),
    act: `stray:${id}`,
    moveFirst: true,
    ...(everyTurn ? { everyTurn: true } : {}),
  });
}

/** Adds a condition to the struck target after the owner's Strike. */
function onOwnStrike(
  id: StrayAbilityId,
  kind: "melee" | "shot",
  spec: (owner: BattleStack) => ConditionSpec,
): AbilityDef {
  return {
    ...info(id),
    onStrike(ctx, owner) {
      if (owner.id !== ctx.attacker.id || ctx.kind !== kind) return null;
      const target = ctx.defender.id;
      const s = spec(owner);
      return (fx) => tryCondition(fx, target, s);
    },
  };
}

/** A condition the owner bears from its first turn, clockless. */
function startsBearing(
  id: StrayAbilityId,
  kind: string,
  size: number,
): AbilityDef {
  return {
    ...info(id),
    onTurnStart(fx, owner) {
      // "Starts each battle bearing": added at its first turn start.
      if (fx.round !== 1) return;
      if (fx.stack(owner).conditions.some((c) => c.source === id)) return;
      tryCondition(fx, owner, { kind, size, clock: null, source: id });
    },
  };
}

let registered = false;

/** Registers every stray ability once (idempotent). */
export function registerStrayAbilities(): void {
  if (registered) return;
  registered = true;

  // --- Passive abilities ---------------------------------------------------
  registerAbility(
    onOwnStrike("sabotage", "melee", (o) => ({
      kind: "hushed",
      clock: 2,
      tier: o.creature.tier,
      source: "sabotage",
    })),
  );
  registerAbility(
    onOwnStrike("croon", "shot", (o) => ({
      kind: "mollified",
      size: 30,
      clock: 2,
      tier: o.creature.tier,
      source: "croon",
    })),
  );
  registerAbility(
    onOwnStrike("drag-under", "melee", (o) => ({
      kind: "drenched",
      size: 50,
      clock: 2,
      tier: o.creature.tier,
      source: "drag-under",
    })),
  );
  registerAbility({
    ...info("latch"),
    onStrike(ctx, owner) {
      if (owner.id !== ctx.attacker.id || ctx.kind !== "melee") return null;
      const target = ctx.defender.id;
      const size = Math.min(40, owner.count);
      return (fx) => {
        if (!hasConditionKind("leeched") || !fx.isAlive(target)) return;
        fx.link(target, owner.id, {
          kind: "leeched",
          size,
          clock: 2,
          source: "latch",
        });
      };
    },
  });
  registerAbility({
    ...info("light-up"),
    damageMultiplier(ctx, owner) {
      if (owner.id !== ctx.attacker.id) return null;
      const d = ctx.defender;
      const inFire = ctx.state.ground.some(
        (g) =>
          g.kind === "fire" &&
          g.hex.col === d.hex.col &&
          g.hex.row === d.hex.row,
      );
      if (!bears(d, "burning") && !inFire) return null;
      return { source: "light-up", label: "Light Up", percent: 150 };
    },
  });
  registerAbility({
    ...info("dead-to-rights"),
    damageMultiplier(ctx, owner) {
      if (owner.id !== ctx.attacker.id || ctx.kind !== "shot") return null;
      if (!bears(ctx.defender, "hushed")) return null;
      return {
        source: "dead-to-rights",
        label: "Dead to Rights",
        percent: 150,
      };
    },
  });
  registerAbility(startsBearing("pressure-suit", "warded", 50));
  registerAbility(startsBearing("late-bloomer", "ripening", 10));
  registerAbility({
    ...info("stand-behind-me"),
    onTurnStart(fx, owner) {
      for (const s of adjacentStacks(fx, owner)) {
        if (s.side !== fx.stack(owner).side) continue;
        tryCondition(fx, s.id, {
          kind: "shielded",
          size: 3,
          clock: 2,
          source: "stand-behind-me",
        });
      }
    },
  });
  registerAbility({
    ...info("giant-stomp"),
    onStrike(ctx, owner) {
      if (owner.id !== ctx.attacker.id || ctx.kind !== "melee") return null;
      const target = ctx.defender;
      return (fx) => {
        const cause = fx.cause;
        const dealt = cause?.type === "damage" ? cause.damage : 0;
        const x = Math.floor(dealt / 4);
        if (x <= 0) return;
        const t = fx.stack(target.id);
        for (const s of fx.state.stacks) {
          if (s.id === t.id || s.id === owner.id || !isAlive(s)) continue;
          if (isAdjacent(s.hex, t.hex)) fx.harm(s.id, x);
        }
      };
    },
  });
  // The Sexton casts Second Shift as a creature caster (its data).
  registerAbility({ ...info("night-shift") });

  // --- Activated abilities (once per battle unless noted) -----------------
  activated(
    "stamp",
    oneStack({ adjacent: true, side: "enemy" }),
    1,
    (fx, a, t) => {
      const n = fx.stack(a).count;
      tryCondition(fx, target0(t), {
        kind: "turned",
        clock: 1,
        gate: { measure: "hp", max: 15 * n },
        source: "stamp",
      });
    },
  );
  activated("cold-front", undefined, 0, (fx, a) => {
    const me = fx.stack(a);
    for (const s of adjacentStacks(fx, a)) {
      if (s.side === me.side) continue;
      tryCondition(fx, s.id, {
        kind: "frozen",
        clock: 1,
        gate: { measure: "hp", max: 15 * me.count },
        source: "cold-front",
      });
    }
  });
  activated("wind-up", oneStack({ within: 3 }), 1, (fx, _a, t) => {
    tryCondition(fx, target0(t), {
      kind: "delayed",
      clock: 2,
      source: "wind-up",
    });
  });
  activated("extra", undefined, 0, (fx, a) => {
    const me = fx.stack(a);
    for (const s of adjacentStacks(fx, a)) {
      if (s.side !== me.side) continue;
      tryCondition(fx, s.id, {
        kind: "quickened",
        size: 2,
        clock: 2,
        source: "extra",
      });
    }
  });
  activated(
    "takes-the-blame",
    oneStack({ adjacent: true, side: "friend" }),
    1,
    (fx, a, t) => {
      if (!hasConditionKind("scapegoat")) return;
      fx.link(target0(t), a, {
        kind: "scapegoat",
        clock: 3,
        source: "takes-the-blame",
      });
    },
  );
  activated("advance", oneStack({ adjacent: true }), 1, (fx, a, t) => {
    const n = fx.stack(a).count;
    const id = target0(t);
    tryCondition(fx, id, {
      kind: "fired-up",
      size: 4,
      clock: 3,
      source: "advance",
    });
    tryCondition(fx, id, {
      kind: "reckoning",
      size: Math.min(150, 5 * n),
      clock: 3,
      source: "advance",
    });
  });
  activated("tend", oneStack({ adjacent: true }), 1, (fx, a, t) => {
    const n = fx.stack(a).count;
    const id = target0(t);
    tryCondition(fx, id, {
      kind: "mending",
      size: Math.min(60, 2 * n),
      clock: 3,
      source: "tend",
    });
    tryCondition(fx, id, {
      kind: "thorned",
      size: Math.min(30, n),
      clock: 3,
      source: "tend",
    });
  });
  activated("tow", oneStack({ within: 6 }), 1, (fx, a, t) => {
    const id = target0(t);
    const n = bears(fx.stack(id), "slowed") ? 5 : 3;
    fx.pull(id, fx.stack(a).hex, n);
  });
  activated("carry", undefined, 2, (fx, a, t) => {
    // Targets: { stack, condition } to move, then { stack } to receive.
    const from = t[0];
    const to = t[1];
    if (from === undefined || to === undefined) return;
    if (!("condition" in from) || !("stack" in to)) return;
    const near = adjacentStacks(fx, a).map((s) => s.id);
    if (!near.includes(from.stack) || !near.includes(to.stack)) return;
    fx.moveCondition(from.stack, from.condition, to.stack);
  });
  activated(
    "breath",
    undefined,
    1,
    (fx, a, t) => {
      const first = t[0];
      if (first === undefined || !("hex" in first)) return;
      const me = fx.stack(a);
      const size = Math.min(30, me.count);
      // Three hexes in a line from the breather through the chosen
      // adjacent hex.
      let dir = -1;
      for (let d = 0; d < 6; d++) {
        if (sameHex(stepHex(me.hex, d), first.hex)) dir = d;
      }
      if (dir < 0) return;
      let hex = me.hex;
      for (let k = 1; k <= 3; k++) {
        hex = stepHex(hex, dir);
        if (!inBounds(hex)) return;
        try {
          fx.addGround({ hex, kind: "fire", size, clock: 2, source: "breath" });
        } catch {
          return; // fire is not registered yet (magic bead)
        }
      }
    },
    true,
  );
}

registerStrayAbilities();
