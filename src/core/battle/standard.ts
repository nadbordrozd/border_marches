/**
 * Engine-standard condition and ground kinds (RULES_V2.md 1.3, 1.5, 6).
 * Other rules refer to these by id, so they are fixed here; content adds
 * the rest through registry.ts.
 */

import type { ConditionKindDef, GroundKindDef } from "./registry.ts";
import { hasRule } from "./rules.ts";

const plural = (n: number | null, word: string): string =>
  n === null ? "until the battle ends" : `${n} ${word}${n === 1 ? "" : "s"}`;

/** "for 2 rounds" / "until the battle ends". */
export function clockText(clock: number | null): string {
  return clock === null
    ? "until the battle ends"
    : `for ${plural(clock, "round")}`;
}

export const STANDARD_CONDITION_KINDS: readonly ConditionKindDef[] = [
  {
    id: "venomed",
    name: "Venomed",
    school: "bloom",
    polarity: "bane",
    defaultClock: 2,
    defaultSize: 3,
    text: (c) => `-${c.size} Defense (never below 0) ${clockText(c.clock)}.`,
    defenseModifier(ctx, holder, c) {
      if (holder.id !== ctx.defender.id || c.size === 0) return null;
      return { source: "venomed", label: "Venomed", amount: -c.size };
    },
  },
  {
    id: "burning",
    name: "Burning",
    school: "storm",
    polarity: "bane",
    text: (c) =>
      `Takes ${c.size} Harm at its turn start ${clockText(c.clock)}.`,
    onTurnStart(fx, holder, c) {
      fx.harm(holder, c.size);
    },
  },
  {
    id: "frozen",
    name: "Frozen",
    school: "storm",
    polarity: "bane",
    hold: true,
    cannotAct: true,
    cannotRetaliate: true,
    endsWhenStruck: true,
    defaultClock: 2,
    text: (c) =>
      `Hold: cannot act or retaliate ${clockText(c.clock)}. The first Strike against it deals double damage and ends Frozen.`,
    strikeMultiplier(ctx, holder) {
      if (holder.id !== ctx.defender.id) return null;
      // Cold Hands: the striker's side makes it x 300%.
      const cold = hasRule(ctx.state, ctx.attacker.side, "cold-hands");
      return { source: "frozen", label: "Frozen", percent: cold ? 300 : 200 };
    },
  },
  {
    id: "asleep",
    name: "Asleep",
    school: "hush",
    polarity: "bane",
    hold: true,
    cannotAct: true,
    cannotRetaliate: true,
    endsOnDamage: true,
    defaultClock: 2,
    text: (c) =>
      `Hold: cannot act or retaliate ${clockText(c.clock)}. Any damage ends it.`,
  },
  {
    id: "turned",
    name: "Turned",
    school: "accord",
    polarity: "bane",
    hold: true,
    turnsSide: true,
    defaultClock: 1,
    text: (c) =>
      `Hold: fights for the side opposite its owner ${clockText(c.clock)}.`,
  },
  {
    id: "delayed",
    name: "Delayed",
    school: "clock",
    polarity: "bane",
    timelineClass: "last",
    cannotWait: true,
    defaultClock: 1,
    text: (c) =>
      `Acts after every stack that is not Delayed and cannot Wait ${clockText(c.clock)}.`,
  },
  {
    id: "hastened",
    name: "Hastened",
    school: "clock",
    polarity: "boon",
    timelineClass: "first",
    defaultClock: 1,
    text: (c) =>
      `Acts before every stack that is not Hastened ${clockText(c.clock)}.`,
  },
  {
    id: "heartened",
    name: "Heartened",
    school: "accord",
    polarity: "boon",
    defaultClock: null,
    text: () =>
      "After it finishes a turn, its side may end Heartened to give it an extra turn.",
  },
  {
    id: "shaken",
    name: "Shaken",
    school: "hush",
    polarity: "bane",
    timelineClass: "last",
    cannotWait: true,
    defaultClock: 2,
    text: (c) =>
      `Acts last and cannot Wait, exactly as Delayed, ${clockText(c.clock)}.`,
  },
  {
    id: "lucky",
    name: "Lucky",
    school: "bloom",
    polarity: "boon",
    defaultClock: null,
    text: () =>
      "Its next melee attack or shot (not a retaliation) deals 50% more damage; then Lucky ends.",
    strikeMultiplier(ctx, holder) {
      if (holder.id !== ctx.attacker.id) return null;
      if (ctx.kind !== "melee" && ctx.kind !== "shot") return null;
      // Double or Nothing: x 200% (and Jinxed when it ends, resolve.ts).
      const double = hasRule(ctx.state, holder.side, "double-or-nothing");
      return { source: "lucky", label: "Lucky", percent: double ? 200 : 150 };
    },
    onStrike(ctx, holder, c) {
      if (holder.id !== ctx.attacker.id) return null;
      if (ctx.kind !== "melee" && ctx.kind !== "shot") return null;
      return (fx) => {
        fx.endCondition(holder.id, c.uid);
      };
    },
  },
  {
    id: "jinxed",
    name: "Jinxed",
    school: "hush",
    polarity: "bane",
    cannotRetaliate: true,
    defaultClock: 3,
    defaultSize: 25,
    text: (c) =>
      `Cannot retaliate; Strikes against it deal ${c.size}% more damage ${clockText(c.clock)}.`,
    strikeMultiplier(ctx, holder, c) {
      if (holder.id !== ctx.defender.id) return null;
      return { source: "jinxed", label: "Jinxed", percent: 100 + c.size };
    },
  },
];

const remains = (
  id: "corpse" | "bones" | "wreck" | "sweets",
): GroundKindDef => ({
  id,
  name: id.charAt(0).toUpperCase() + id.slice(1),
  class: "remains",
  school: null,
  defaultClock: null,
  text: (f) =>
    f.remains
      ? `Remains of ${f.remains.initialCount} ${f.remains.creature.name ?? f.remains.creature.id} (${f.remains.owner}).`
      : "Remains.",
});

export const STANDARD_GROUND_KINDS: readonly GroundKindDef[] = [
  {
    id: "rock",
    name: "Rock",
    class: "blocking",
    school: null,
    defaultClock: null,
    text: () => "Blocking: nothing enters this hex.",
  },
  {
    // The naval battlefield's water (docs/design/NAVAL.md 3.1).
    id: "sea",
    name: "Sea",
    class: "blocking",
    school: null,
    defaultClock: null,
    passableFor: "swimmer",
    text: () =>
      "Open sea: only Swimmers enter it; it blocks every other stack. Nothing burns, grows or lies on the water.",
  },
  {
    // A ship's mast on a deck (NAVAL.md 3.2), drawn tall.
    id: "mast",
    name: "Mast",
    class: "blocking",
    school: null,
    defaultClock: null,
    text: () => "A ship's mast: blocking, nothing enters this hex.",
  },
  remains("corpse"),
  remains("bones"),
  remains("wreck"),
  remains("sweets"),
];
