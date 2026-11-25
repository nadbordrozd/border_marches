/**
 * The battle spells of CONTENT_SPELLS.md section 3 (fifty, ten per school)
 * plus the three faction pages the faction documents define by their
 * RULES_V2 2.4 budget (Mend, Thunderclap, Last Breath; not in the guild
 * pool). Each spell is data (school, tier, mana, target rule, what Fuel
 * doubles, its Power scaling) plus a resolve function written only in the
 * verbs of the grammar ({@link Effects}).
 *
 * Spells are registered as acts of kind "cast" under their own id
 * (registry.ts), so hero pages, scrolls and creature casters all cast the
 * same definition. {@link registerSpells} is idempotent.
 */

import {
  conditionKind,
  getStack,
  groundAt,
  hasAct,
  isAlive,
  registerAct,
  registerEffect,
  stepHex,
} from "../battle/index.ts";
import type {
  ActTarget,
  BattleState,
  CastContext,
  Effects,
  Gate,
  Hex,
  School,
  StackId,
} from "../battle/index.ts";
import { MAX_SIZE, SHADE, SEEDLING, registerMagicKinds } from "./kinds.ts";
import {
  AREA_RADIUS,
  TARGET_COUNT,
  adjacentStacks,
  casterSide,
  conditionOf,
  choiceOf,
  discHexes,
  findCondition,
  hexOf,
  isBlockingHex,
  isFreeHex,
  ownRemains,
  ruleCandidates,
  ruleTouches,
  sideStacks,
  stackOf,
  stacksOn,
  targetRuleError,
} from "./targets.ts";
import type { TargetRule } from "./targets.ts";

/** One battle spell (RULES_V2 2.2). */
export interface SpellDef {
  readonly id: string;
  readonly name: string;
  readonly school: School;
  readonly tier: 1 | 2 | 3 | 4 | 5;
  readonly mana: number;
  readonly target: TargetRule;
  /** What Fuel doubles ("The Harm"), or null: it cannot be Fuelled. */
  readonly fuel: string | null;
  /** One of the five condition tools (RULES_V2 2.7). */
  readonly tool?: boolean;
  /** In the guild and shrine pool (default true). */
  readonly pool?: boolean;
  /** The scaling number as base + per x P, for display. */
  readonly scale?: { readonly base: number; readonly per: number };
  /** The effect with the numbers at Power `p`. */
  text(p: number): string;
  /** Requirements beyond the target rule (law 3). */
  check?(
    state: BattleState,
    actorId: StackId,
    targets: readonly ActTarget[],
  ): string | null;
  /** Stacks touched, when not the target rule's default. */
  touches?(
    state: BattleState,
    actorId: StackId,
    targets: readonly ActTarget[],
  ): StackId[];
  resolve(
    fx: Effects,
    actorId: StackId,
    targets: readonly ActTarget[],
    cast: CastContext,
  ): void;
}

/** base + per x P. */
export function scaled(base: number, per: number, p: number): number {
  return base + per * p;
}

/** A Fuelled size: doubled, or tripled with Bonfire (fuel-triples). */
function dbl(x: number, c: CastContext): number {
  return c.fuelled ? (c.fuelFactor ?? 2) * x : x;
}

function bears(fx: Effects, id: StackId, kind: string): boolean {
  return fx.stack(id).conditions.some((c) => c.kind === kind);
}

function endKind(fx: Effects, id: StackId, kind: string): void {
  const c = fx.stack(id).conditions.find((x) => x.kind === kind);
  if (c) fx.endCondition(id, c.uid);
}

function hpGate(max: number): Gate {
  return { measure: "hp", max };
}

/** A Hold's gate: base, doubled by its softener, doubled by Fuel. */
function holdGate(
  fx: Effects,
  target: StackId,
  base: number,
  softener: string,
  c: CastContext,
): Gate {
  const soft = bears(fx, target, softener) ? 2 : 1;
  return hpGate(dbl(base * soft, c));
}

function capped(kind: string, size: number): number {
  const m = MAX_SIZE[kind];
  return m === undefined ? size : Math.min(m, size);
}

/** Adds a sized condition; the size counts Fuel and the kind's cap. */
function addSized(
  fx: Effects,
  target: StackId,
  kind: string,
  size: number,
  clock: number,
  tier: number,
): void {
  const s = capped(kind, size);
  const m = MAX_SIZE[kind];
  fx.addCondition(target, {
    kind,
    size: s,
    clock,
    tier,
    ...(m !== undefined ? { maxSize: m } : {}),
  });
}

function summonBudget(
  creature: { readonly hp: number },
  budget: number,
): number {
  return Math.max(1, Math.floor(budget / creature.hp));
}

function freeNow(fx: Effects, h: Hex): boolean {
  return isFreeHex(fx.state, h);
}

const n = scaled;

// ---------------------------------------------------------------------------
// Bloom: healing, summoning, effects that grow

const BLOOM: SpellDef[] = [
  {
    id: "poultice",
    name: "Poultice",
    school: "bloom",
    tier: 1,
    mana: 4,
    target: "stack",
    fuel: "The heal",
    scale: { base: 20, per: 10 },
    text: (p) =>
      `Heal a stack for ${n(20, 10, p)} HP and cure its Venomed. Does not revive.`,
    resolve(fx, _a, t, c) {
      const id = stackOf(t[0]);
      fx.heal(id, dbl(n(20, 10, c.power), c));
      endKind(fx, id, "venomed");
    },
  },
  {
    id: "thornskin",
    name: "Thornskin",
    school: "bloom",
    tier: 1,
    mana: 4,
    target: "stack",
    fuel: "Thorned's size",
    scale: { base: 6, per: 3 },
    text: (p) => `A stack gains Thorned ${n(6, 3, p)} for 3 rounds.`,
    resolve(fx, _a, t, c) {
      addSized(fx, stackOf(t[0]), "thorned", dbl(n(6, 3, c.power), c), 3, 1);
    },
  },
  {
    id: "nettle",
    name: "Nettle",
    school: "bloom",
    tier: 1,
    mana: 4,
    target: "stack",
    fuel: "The Harm",
    scale: { base: 12, per: 6 },
    text: (p) =>
      `Deal ${n(12, 6, p)} Harm to a stack and give it Venomed 2 for 3 rounds.`,
    resolve(fx, _a, t, c) {
      const id = stackOf(t[0]);
      fx.harm(id, n(12, 6, c.power), { fuelled: c.fuelled });
      if (fx.isAlive(id)) addSized(fx, id, "venomed", 2, 3, 1);
    },
  },
  {
    id: "feed",
    name: "Feed",
    school: "bloom",
    tier: 2,
    mana: 7,
    target: "condition",
    fuel: null,
    tool: true,
    text: () =>
      "Condition tool. Pick a condition with a size: the size grows by half, rounded up, to its maximum. Not Holds.",
    check(state, _a, t) {
      const ref = conditionOf(t[0]);
      const c = findCondition(state, ref.stack, ref.uid);
      if (!c || c.size <= 0) return "choose a condition with a size";
      return c.hold ? "a Hold cannot be fed" : null;
    },
    resolve(fx, _a, t) {
      const ref = conditionOf(t[0]);
      fx.feedCondition(ref.stack, ref.uid);
    },
  },
  {
    id: "regrow",
    name: "Regrow",
    school: "bloom",
    tier: 2,
    mana: 8,
    target: "stack",
    fuel: "The heal",
    scale: { base: 30, per: 15 },
    text: (p) => `Heal a stack for ${n(30, 15, p)} HP, reviving.`,
    resolve(fx, _a, t, c) {
      fx.heal(stackOf(t[0]), dbl(n(30, 15, c.power), c), { revive: true });
    },
  },
  {
    id: "sprout",
    name: "Sprout",
    school: "bloom",
    tier: 2,
    mana: 7,
    target: "freeHex",
    fuel: "The summon budget",
    scale: { base: 30, per: 15 },
    text: (p) =>
      `Summon ${Math.max(1, Math.floor(n(30, 15, p) / SEEDLING.hp))} Seedlings (${n(30, 15, p)} HP worth) on an empty hex.`,
    resolve(fx, _a, t, c) {
      const budget = dbl(n(30, 15, c.power), c);
      fx.summon(SEEDLING, summonBudget(SEEDLING, budget), hexOf(t[0]), {
        side: c.side,
      });
    },
  },
  {
    id: "bramble-row",
    name: "Bramble Row",
    school: "bloom",
    tier: 3,
    mana: 10,
    target: "line3",
    fuel: "The brambles' size",
    scale: { base: 9, per: 4 },
    text: (p) =>
      `Cover three hexes in a line with brambles of size ${n(9, 4, p)} for 3 rounds.`,
    resolve(fx, _a, t, c) {
      const size = dbl(n(9, 4, c.power), c);
      for (const target of t)
        fx.addGround({ hex: hexOf(target), kind: "brambles", size, clock: 3 });
    },
  },
  {
    id: "ripen",
    name: "Ripen",
    school: "bloom",
    tier: 3,
    mana: 9,
    target: "stack",
    fuel: "Ripening's size",
    text: () =>
      "A stack gains Ripening 20 for 3 rounds: its Strikes do +20% damage, growing by 10% each turn.",
    resolve(fx, _a, t, c) {
      addSized(fx, stackOf(t[0]), "ripening", dbl(20, c), 3, 3);
    },
  },
  {
    id: "orchard-day",
    name: "Orchard Day",
    school: "bloom",
    tier: 4,
    mana: 14,
    target: "allFriendly",
    fuel: "Mending's size",
    scale: { base: 10, per: 4 },
    text: (p) =>
      `Every stack on your side gains Mending ${n(10, 4, p)} for 3 rounds.`,
    resolve(fx, _a, _t, c) {
      const size = dbl(n(10, 4, c.power), c);
      for (const id of sideStacks(fx.state, c.side))
        addSized(fx, id, "mending", size, 3, 4);
    },
  },
  {
    id: "second-spring",
    name: "Second Spring",
    school: "bloom",
    tier: 5,
    mana: 20,
    target: "allFriendly",
    fuel: "The heal",
    scale: { base: 54, per: 21 },
    text: (p) =>
      `Every stack on your side heals ${n(54, 21, p)} HP, reviving; a stack with Mending heals twice that.`,
    resolve(fx, _a, _t, c) {
      const x = dbl(n(54, 21, c.power), c);
      for (const id of sideStacks(fx.state, c.side)) {
        fx.heal(id, bears(fx, id, "mending") ? 2 * x : x, { revive: true });
      }
    },
  },
];

// ---------------------------------------------------------------------------
// Accord: links, Turned, guarding, swaps

function friendlyAdjacent(
  state: BattleState,
  id: StackId,
  side: string,
): StackId[] {
  return adjacentStacks(state, id).filter(
    (x) => getStack(state, x).side === side,
  );
}

const ACCORD: SpellDef[] = [
  {
    id: "scapegoat",
    name: "Scapegoat",
    school: "accord",
    tier: 1,
    mana: 4,
    target: "twoFriendly",
    fuel: null,
    text: () =>
      "Pick two friendly stacks: for 3 rounds, damage to the first is taken by the second as Harm (a Scapegoat link).",
    resolve(fx, _a, t) {
      fx.link(stackOf(t[0]), stackOf(t[1]), {
        kind: "scapegoat",
        clock: 3,
        tier: 1,
      });
    },
  },
  {
    id: "close-ranks",
    name: "Close Ranks",
    school: "accord",
    tier: 1,
    mana: 4,
    target: "stack",
    fuel: "Shielded's size",
    text: () =>
      "A stack and every friendly stack next to it gain Shielded 2 for 3 rounds.",
    touches(state, a, t) {
      const id = stackOf(t[0]);
      return [id, ...friendlyAdjacent(state, id, casterSide(state, a))];
    },
    resolve(fx, _a, t, c) {
      const id = stackOf(t[0]);
      const ids = [id, ...friendlyAdjacent(fx.state, id, c.side)];
      for (const x of ids) addSized(fx, x, "shielded", dbl(2, c), 3, 1);
    },
  },
  {
    id: "change-places",
    name: "Change Places",
    school: "accord",
    tier: 1,
    mana: 5,
    target: "twoFriendly",
    fuel: null,
    text: () => "Two friendly stacks swap places.",
    resolve(fx, _a, t) {
      fx.swap(stackOf(t[0]), stackOf(t[1]));
    },
  },
  {
    id: "share",
    name: "Share",
    school: "accord",
    tier: 2,
    mana: 7,
    target: "share",
    fuel: null,
    tool: true,
    text: () =>
      "Condition tool. Pick a link and another condition on one of its two stacks: the stack at the other end gets a copy. Not Holds or links.",
    resolve(fx, _a, t) {
      const l = conditionOf(t[0]);
      const o = conditionOf(t[1]);
      const link = findCondition(fx.state, l.stack, l.uid);
      if (!link || link.link === null) return;
      const to = o.stack === l.stack ? link.link : l.stack;
      fx.copyCondition(o.stack, o.uid, to);
    },
  },
  {
    id: "sign-here",
    name: "Sign Here",
    school: "accord",
    tier: 2,
    mana: 8,
    target: "enemy",
    fuel: "The gate",
    scale: { base: 60, per: 20 },
    text: (p) =>
      `An enemy stack becomes Turned for 1 round: it fights for you. Gate ${n(60, 20, p)} HP, or ${2 * n(60, 20, p)} if it is Mollified.`,
    resolve(fx, _a, t, c) {
      const id = stackOf(t[0]);
      fx.addCondition(id, {
        kind: "turned",
        clock: 1,
        tier: 2,
        gate: holdGate(fx, id, n(60, 20, c.power), "mollified", c),
      });
    },
  },
  {
    id: "soft-words",
    name: "Soft Words",
    school: "accord",
    tier: 2,
    mana: 6,
    target: "stack",
    fuel: "Mollified's size",
    text: () =>
      "A stack gains Mollified 30 for 3 rounds: its Strikes do -30% damage.",
    resolve(fx, _a, t, c) {
      addSized(fx, stackOf(t[0]), "mollified", dbl(30, c), 3, 2);
    },
  },
  {
    id: "sanctuary-oath",
    name: "Sanctuary Oath",
    school: "accord",
    tier: 3,
    mana: 10,
    target: "stack",
    fuel: "Warded's size",
    text: () =>
      "A stack gains Warded 40 for 3 rounds: -40% Harm taken. If it is Shielded, every friendly stack next to it gains the same.",
    touches(state, a, t) {
      const id = stackOf(t[0]);
      const s = getStack(state, id);
      return s.conditions.some((x) => x.kind === "shielded")
        ? [id, ...friendlyAdjacent(state, id, casterSide(state, a))]
        : [id];
    },
    resolve(fx, _a, t, c) {
      const id = stackOf(t[0]);
      const size = dbl(40, c);
      const spread = bears(fx, id, "shielded");
      addSized(fx, id, "warded", size, 3, 3);
      if (spread)
        for (const x of friendlyAdjacent(fx.state, id, c.side))
          addSized(fx, x, "warded", size, 3, 3);
    },
  },
  {
    id: "take-heart",
    name: "Take Heart",
    school: "accord",
    tier: 3,
    mana: 11,
    target: "friendly",
    fuel: null,
    text: () =>
      "A friendly stack loses Shaken and becomes Heartened for 3 rounds.",
    resolve(fx, _a, t) {
      const id = stackOf(t[0]);
      endKind(fx, id, "shaken");
      fx.addCondition(id, { kind: "heartened", clock: 3, tier: 3 });
    },
  },
  {
    id: "change-of-heart",
    name: "Change of Heart",
    school: "accord",
    tier: 4,
    mana: 14,
    target: "enemy",
    fuel: "The gate",
    scale: { base: 120, per: 40 },
    text: (p) =>
      `An enemy stack becomes Turned for 2 rounds: it fights for you. Gate ${n(120, 40, p)} HP, or ${2 * n(120, 40, p)} if it is Mollified.`,
    resolve(fx, _a, t, c) {
      const id = stackOf(t[0]);
      fx.addCondition(id, {
        kind: "turned",
        clock: 2,
        tier: 4,
        gate: holdGate(fx, id, n(120, 40, c.power), "mollified", c),
      });
    },
  },
  {
    id: "the-long-table",
    name: "The Long Table",
    school: "accord",
    tier: 5,
    mana: 20,
    target: "stack",
    fuel: null,
    text: () =>
      "Every condition on a stack, except Holds and links, is copied to every stack next to it, friend or foe.",
    touches(state, _a, t) {
      const id = stackOf(t[0]);
      return [id, ...adjacentStacks(state, id)];
    },
    resolve(fx, _a, t) {
      const id = stackOf(t[0]);
      const conds = fx
        .stack(id)
        .conditions.filter((c) => !c.hold && c.link === null)
        .map((c) => c.uid);
      for (const to of adjacentStacks(fx.state, id)) {
        for (const uid of conds) {
          if (fx.isAlive(id)) fx.copyCondition(id, uid, to);
        }
      }
    },
  },
];

// ---------------------------------------------------------------------------
// Clock: turn order, extra and delayed turns, clocks, scheduled events

const CLOCK: SpellDef[] = [
  {
    id: "first-bell",
    name: "First Bell",
    school: "clock",
    tier: 1,
    mana: 4,
    target: "stack",
    fuel: null,
    text: () => "A stack loses Delayed and becomes Hastened for 2 rounds.",
    resolve(fx, _a, t) {
      const id = stackOf(t[0]);
      endKind(fx, id, "delayed");
      fx.addCondition(id, { kind: "hastened", clock: 2, tier: 1 });
    },
  },
  {
    id: "late-bell",
    name: "Late Bell",
    school: "clock",
    tier: 1,
    mana: 4,
    target: "stack",
    fuel: null,
    text: () =>
      "A stack loses Hastened and becomes Delayed for 2 rounds, or 3 if it is Slowed.",
    resolve(fx, _a, t) {
      const id = stackOf(t[0]);
      endKind(fx, id, "hastened");
      const clock = bears(fx, id, "slowed") ? 3 : 2;
      fx.addCondition(id, { kind: "delayed", clock, tier: 1 });
    },
  },
  {
    id: "appointment",
    name: "Appointment",
    school: "clock",
    tier: 1,
    mana: 5,
    target: "stack",
    fuel: "The Harm",
    scale: { base: 24, per: 12 },
    text: (p) =>
      `At the start of next round a stack takes ${n(24, 12, p)} Harm.`,
    resolve(fx, _a, t, c) {
      fx.schedule({
        round: fx.round + 1,
        phase: "start",
        side: c.side,
        effect: {
          id: "spell:appointment",
          args: {
            target: stackOf(t[0]),
            x: n(24, 12, c.power),
            fuelled: c.fuelled,
          },
        },
      });
    },
  },
  {
    id: "wind",
    name: "Wind",
    school: "clock",
    tier: 2,
    mana: 7,
    target: "wind",
    fuel: null,
    tool: true,
    text: () =>
      "Condition tool. Pick a condition with a clock: add 2 rounds (to at most 9) or take 2 away; at 0 it expires at once. Holds can only be shortened.",
    resolve(fx, _a, t) {
      const ref = conditionOf(t[0]);
      fx.windCondition(ref.stack, ref.uid, choiceOf(t[1]) === "+2" ? 2 : -2);
    },
  },
  {
    id: "treacle",
    name: "Treacle",
    school: "clock",
    tier: 2,
    mana: 7,
    target: "area1",
    fuel: "Slowed's size",
    text: () =>
      "Every stack on a hex and the 6 around it gains Slowed 1 for 3 rounds, friend or foe.",
    resolve(fx, _a, t, c) {
      for (const id of stacksOn(fx.state, discHexes(hexOf(t[0]), 1)))
        addSized(fx, id, "slowed", dbl(1, c), 3, 2);
    },
  },
  {
    id: "quick-march",
    name: "Quick March",
    school: "clock",
    tier: 2,
    mana: 8,
    target: "allFriendly",
    fuel: "Quickened's size",
    text: () => "Every stack on your side gains Quickened 1 for 2 rounds.",
    resolve(fx, _a, _t, c) {
      for (const id of sideStacks(fx.state, c.side))
        addSized(fx, id, "quickened", dbl(1, c), 2, 2);
    },
  },
  {
    id: "encore",
    name: "Encore",
    school: "clock",
    tier: 3,
    mana: 10,
    target: "active",
    fuel: null,
    text: () =>
      "The friendly stack about to act takes an extra turn after this one, then becomes Delayed for 2 rounds unless it is Quickened.",
    resolve(fx, a) {
      fx.extraTurn(a);
      if (!bears(fx, a, "quickened"))
        fx.addCondition(a, { kind: "delayed", clock: 2, tier: 3 });
    },
  },
  {
    id: "forced-march",
    name: "Forced March",
    school: "clock",
    tier: 3,
    mana: 10,
    target: "allFriendly",
    fuel: null,
    text: () => "Every stack on your side becomes Hastened for 2 rounds.",
    resolve(fx, _a, _t, c) {
      for (const id of sideStacks(fx.state, c.side))
        fx.addCondition(id, { kind: "hastened", clock: 2, tier: 3 });
    },
  },
  {
    id: "deadline",
    name: "Deadline",
    school: "clock",
    tier: 4,
    mana: 14,
    target: "stack",
    fuel: "Reckoning's size",
    scale: { base: 75, per: 30 },
    text: (p) =>
      `A stack gains Reckoning ${n(75, 30, p)} for 2 rounds: a debt of ${n(75, 30, p)} Harm when it runs out.`,
    resolve(fx, _a, t, c) {
      addSized(
        fx,
        stackOf(t[0]),
        "reckoning",
        dbl(n(75, 30, c.power), c),
        2,
        4,
      );
    },
  },
  {
    id: "double-time",
    name: "Double Time",
    school: "clock",
    tier: 5,
    mana: 20,
    target: "allFriendly",
    fuel: null,
    text: () =>
      "Every stack on your side becomes Heartened for 1 round: each may take an extra turn this round.",
    resolve(fx, _a, _t, c) {
      for (const id of sideStacks(fx.state, c.side))
        fx.addCondition(id, { kind: "heartened", clock: 1, tier: 5 });
    },
  },
];

// ---------------------------------------------------------------------------
// Hush: remains, drain, debts, switching off

/** Raises a summon on remains: refused (remains kept) if the hex is taken. */
function raise(
  fx: Effects,
  h: Hex,
  side: CastContext["side"],
  pick: (remains: NonNullable<ReturnType<typeof groundAt>>["remains"]) => {
    creature: Parameters<Effects["summon"]>[0];
    count: number;
  } | null,
): StackId | null {
  const g = groundAt(fx.state, h);
  if (!g || g.class !== "remains" || !g.remains) return null;
  if (!freeNow(fx, h)) return null;
  const choice = pick(g.remains);
  if (!choice) return null;
  const living = fx.state.stacks.filter(
    (s) => isAlive(s) && s.owner === side,
  ).length;
  if (living >= 10) return null;
  fx.useRemains(h);
  return fx.summon(choice.creature, choice.count, h, { side });
}

const HUSH: SpellDef[] = [
  {
    id: "hush-now",
    name: "Hush Now",
    school: "hush",
    tier: 1,
    mana: 4,
    target: "stack",
    fuel: null,
    text: () => "A stack becomes Hushed for 2 rounds: it cannot shoot.",
    resolve(fx, _a, t) {
      fx.addCondition(stackOf(t[0]), { kind: "hushed", clock: 2, tier: 1 });
    },
  },
  {
    id: "on-credit",
    name: "On Credit",
    school: "hush",
    tier: 1,
    mana: 4,
    target: "stack",
    fuel: "The heal (not the debt)",
    scale: { base: 25, per: 12 },
    text: (p) =>
      `Heal a stack for ${n(25, 12, p)} HP, reviving, but it gains Reckoning ${n(25, 12, p)} for 3 rounds: a debt paid back as Harm.`,
    resolve(fx, _a, t, c) {
      const id = stackOf(t[0]);
      const x = n(25, 12, c.power);
      fx.heal(id, dbl(x, c), { revive: true });
      addSized(fx, id, "reckoning", x, 3, 1);
    },
  },
  {
    id: "bad-omen",
    name: "Bad Omen",
    school: "hush",
    tier: 1,
    mana: 4,
    target: "stack",
    fuel: "Jinxed's size",
    text: () =>
      "A stack becomes Jinxed 25 for 3 rounds: it cannot retaliate and Strikes against it do +25% damage.",
    resolve(fx, _a, t, c) {
      addSized(fx, stackOf(t[0]), "jinxed", dbl(25, c), 3, 1);
    },
  },
  {
    id: "pass-on",
    name: "Pass On",
    school: "hush",
    tier: 2,
    mana: 7,
    target: "passOn",
    fuel: null,
    tool: true,
    text: () =>
      "Condition tool. Pick a bane and a stack next to its bearer: the bane moves to that stack (if refused, it stays).",
    resolve(fx, _a, t) {
      const ref = conditionOf(t[0]);
      fx.moveCondition(ref.stack, ref.uid, stackOf(t[1]));
    },
  },
  {
    id: "lullaby",
    name: "Lullaby",
    school: "hush",
    tier: 2,
    mana: 8,
    target: "stack",
    fuel: "The gate",
    scale: { base: 60, per: 20 },
    text: (p) =>
      `A stack falls Asleep for 2 rounds. Gate ${n(60, 20, p)} HP, or ${2 * n(60, 20, p)} if it is Hushed.`,
    resolve(fx, _a, t, c) {
      const id = stackOf(t[0]);
      fx.addCondition(id, {
        kind: "asleep",
        clock: 2,
        tier: 2,
        gate: holdGate(fx, id, n(60, 20, c.power), "hushed", c),
      });
    },
  },
  {
    id: "second-shift",
    name: "Second Shift",
    school: "hush",
    tier: 2,
    mana: 7,
    target: "remains",
    fuel: "The summon budget",
    scale: { base: 30, per: 15 },
    text: (p) =>
      `Raise ${Math.max(1, Math.floor(n(30, 15, p) / SHADE.hp))} Shades (${n(30, 15, p)} HP worth) on remains of your side.`,
    check(state, _a, t) {
      return isFreeHex(state, hexOf(t[0])) ? null : "a stack stands on it";
    },
    resolve(fx, _a, t, c) {
      const budget = dbl(n(30, 15, c.power), c);
      raise(fx, hexOf(t[0]), c.side, () => ({
        creature: SHADE,
        count: Math.max(1, Math.floor(budget / SHADE.hp)),
      }));
    },
  },
  {
    id: "leech-line",
    name: "Leech Line",
    school: "hush",
    tier: 3,
    mana: 10,
    target: "enemyFriendly",
    fuel: "Leeched's size",
    scale: { base: 15, per: 7 },
    text: (p) =>
      `Pick an enemy and a friendly stack: for 3 rounds the enemy takes ${n(15, 7, p)} Harm each turn and the friendly stack heals that much (a Leeched link).`,
    resolve(fx, _a, t, c) {
      fx.link(stackOf(t[0]), stackOf(t[1]), {
        kind: "leeched",
        size: dbl(n(15, 7, c.power), c),
        clock: 3,
        tier: 3,
      });
    },
  },
  {
    id: "curtain-call",
    name: "Curtain Call",
    school: "hush",
    tier: 3,
    mana: 11,
    target: "remains",
    fuel: "The summon budget",
    scale: { base: 45, per: 20 },
    text: (p) =>
      `Raise the creature in remains of your side: ${n(45, 20, p)} HP worth, never more than it started with.`,
    check(state, _a, t) {
      return isFreeHex(state, hexOf(t[0])) ? null : "a stack stands on it";
    },
    resolve(fx, _a, t, c) {
      const budget = dbl(n(45, 20, c.power), c);
      raise(fx, hexOf(t[0]), c.side, (r) =>
        r
          ? {
              creature: r.creature,
              count: Math.min(
                r.initialCount,
                Math.max(1, Math.floor(budget / r.creature.hp)),
              ),
            }
          : null,
      );
    },
  },
  {
    id: "pea-soup",
    name: "Pea Soup",
    school: "hush",
    tier: 4,
    mana: 13,
    target: "area2",
    fuel: null,
    text: () =>
      "Fill a hex and every hex within 2 of it with mist for 3 rounds: no shooting from it, and shots into it do half damage.",
    resolve(fx, _a, t) {
      for (const h of discHexes(hexOf(t[0]), 2)) {
        if (!isBlockingHex(fx.state, h))
          fx.addGround({ hex: h, kind: "mist", clock: 3 });
      }
    },
  },
  {
    id: "everybody-up",
    name: "Everybody Up",
    school: "hush",
    tier: 5,
    mana: 20,
    target: "allRemains",
    fuel: "The summon budget (each)",
    scale: { base: 40, per: 15 },
    text: (p) =>
      `All remains of your side rise as Shades, ${n(40, 15, p)} HP worth each, until your side has ten stacks.`,
    resolve(fx, _a, _t, c) {
      const budget = dbl(n(40, 15, c.power), c);
      for (const h of ownRemains(fx.state, c.side)) {
        raise(fx, h, c.side, () => ({
          creature: SHADE,
          count: Math.max(1, Math.floor(budget / SHADE.hp)),
        }));
      }
    },
  },
];

// ---------------------------------------------------------------------------
// Storm: area Harm, fire, cold, pushing

const STORM: SpellDef[] = [
  {
    id: "jolt",
    name: "Jolt",
    school: "storm",
    tier: 1,
    mana: 4,
    target: "stack",
    fuel: "The Harm",
    scale: { base: 20, per: 10 },
    text: (p) => `Deal ${n(20, 10, p)} Harm to a stack.`,
    resolve(fx, _a, t, c) {
      fx.harm(stackOf(t[0]), n(20, 10, c.power), { fuelled: c.fuelled });
    },
  },
  {
    id: "gust",
    name: "Gust",
    school: "storm",
    tier: 1,
    mana: 4,
    target: "stackHex",
    fuel: "The Harm",
    scale: { base: 8, per: 4 },
    text: (p) =>
      `Deal ${n(8, 4, p)} Harm to a stack, then push it 3 hexes away from a hex next to it that you pick.`,
    resolve(fx, _a, t, c) {
      const id = stackOf(t[0]);
      fx.harm(id, n(8, 4, c.power), { fuelled: c.fuelled });
      if (fx.isAlive(id)) fx.push(id, hexOf(t[1]), 3);
    },
  },
  {
    id: "hothead",
    name: "Hothead",
    school: "storm",
    tier: 1,
    mana: 4,
    target: "stack",
    fuel: "Burning's size",
    scale: { base: 6, per: 3 },
    text: (p) =>
      `A stack gains Burning ${n(6, 3, p)} and Fired Up 2, both for 3 rounds.`,
    resolve(fx, _a, t, c) {
      const id = stackOf(t[0]);
      addSized(fx, id, "burning", dbl(n(6, 3, c.power), c), 3, 1);
      addSized(fx, id, "fired-up", 2, 3, 1);
    },
  },
  {
    id: "set-off",
    name: "Set Off",
    school: "storm",
    tier: 2,
    mana: 7,
    target: "condition",
    fuel: null,
    tool: true,
    text: () =>
      "Condition tool. End a condition: its bearer takes its charge as Harm for each round it had left (at most 3; clockless counts as 3).",
    resolve(fx, _a, t) {
      const ref = conditionOf(t[0]);
      fx.setOffCondition(ref.stack, ref.uid);
    },
  },
  {
    id: "broadside",
    name: "Broadside",
    school: "storm",
    tier: 2,
    mana: 8,
    target: "area1",
    fuel: "The Harm",
    scale: { base: 18, per: 9 },
    text: (p) =>
      `Deal ${n(18, 9, p)} Harm to every stack on a hex and the 6 around it, friend or foe.`,
    resolve(fx, _a, t, c) {
      // An area effect (FACTION_GOBLINS 3: Launched reads it).
      for (const id of stacksOn(fx.state, discHexes(hexOf(t[0]), 1)))
        fx.harm(id, n(18, 9, c.power), {
          fuelled: c.fuelled,
          area: { centre: hexOf(t[0]), side: c.side },
        });
    },
  },
  {
    id: "cold-snap",
    name: "Cold Snap",
    school: "storm",
    tier: 2,
    mana: 8,
    target: "stack",
    fuel: "The gate",
    scale: { base: 60, per: 20 },
    text: (p) =>
      `A stack is Frozen for 2 rounds. Gate ${n(60, 20, p)} HP, or ${2 * n(60, 20, p)} if it is Drenched.`,
    resolve(fx, _a, t, c) {
      const id = stackOf(t[0]);
      fx.addCondition(id, {
        kind: "frozen",
        clock: 2,
        tier: 2,
        gate: holdGate(fx, id, n(60, 20, c.power), "drenched", c),
      });
    },
  },
  {
    id: "downpour",
    name: "Downpour",
    school: "storm",
    tier: 3,
    mana: 9,
    target: "area2",
    fuel: "Drenched's size",
    text: () =>
      "Every stack within 2 hexes of a hex gains Drenched 40 for 3 rounds (+40% Harm taken); fire there goes out.",
    resolve(fx, _a, t, c) {
      const hexes = discHexes(hexOf(t[0]), 2);
      for (const id of stacksOn(fx.state, hexes))
        addSized(fx, id, "drenched", dbl(40, c), 3, 3);
      for (const h of hexes) {
        if (groundAt(fx.state, h)?.kind === "fire") fx.endGround(h);
      }
    },
  },
  {
    id: "wildfire",
    name: "Wildfire",
    school: "storm",
    tier: 3,
    mana: 10,
    target: "area1",
    fuel: "The fire's size",
    scale: { base: 9, per: 4 },
    text: (p) =>
      `Set a hex and the 6 around it on fire for 3 rounds, size ${n(9, 4, p)}.`,
    check(state, _a, t) {
      return isBlockingHex(state, hexOf(t[0])) ? "the hex is blocking" : null;
    },
    touches: () => [],
    resolve(fx, _a, t, c) {
      const size = dbl(n(9, 4, c.power), c);
      for (const h of discHexes(hexOf(t[0]), 1)) {
        if (!isBlockingHex(fx.state, h))
          fx.addGround({ hex: h, kind: "fire", size, clock: 3 });
      }
    },
  },
  {
    id: "whiteout",
    name: "Whiteout",
    school: "storm",
    tier: 4,
    mana: 14,
    target: "area2",
    fuel: "The Harm",
    scale: { base: 36, per: 15 },
    text: (p) =>
      `Deal ${n(36, 15, p)} Harm to every stack within 2 hexes of a hex, friend or foe, and give each Slowed 2 for 2 rounds.`,
    resolve(fx, _a, t, c) {
      for (const id of stacksOn(fx.state, discHexes(hexOf(t[0]), 2))) {
        const h = fx.harm(id, n(36, 15, c.power), {
          fuelled: c.fuelled,
          area: { centre: hexOf(t[0]), side: c.side },
        });
        // A stack the area effect did not reach (Launched) gains nothing.
        if (h > 0 && fx.isAlive(id)) addSized(fx, id, "slowed", 2, 2, 4);
      }
    },
  },
  {
    id: "the-sky-falls",
    name: "The Sky Falls",
    school: "storm",
    tier: 5,
    mana: 20,
    target: "area3",
    fuel: "The Harm",
    scale: { base: 54, per: 21 },
    text: (p) =>
      `Deal ${n(54, 21, p)} Harm to every stack within 3 hexes of a hex that is not Warded, friend or foe; remains there become fire of size 10 for 3 rounds.`,
    resolve(fx, _a, t, c) {
      const hexes = discHexes(hexOf(t[0]), 3);
      for (const id of stacksOn(fx.state, hexes)) {
        if (!bears(fx, id, "warded"))
          fx.harm(id, n(54, 21, c.power), {
            fuelled: c.fuelled,
            area: { centre: hexOf(t[0]), side: c.side },
          });
      }
      for (const h of hexes) {
        if (groundAt(fx.state, h)?.class === "remains")
          fx.addGround({ hex: h, kind: "fire", size: 10, clock: 3 });
      }
    },
  },
];

// ---------------------------------------------------------------------------
// Faction pages (FACTION_HUMANS, FACTION_GOBLINS, FACTION_UNDEAD): named by
// the faction documents and defined there by their 2.4 budget. Not drawn by
// guilds; creature casters and starting heroes list them.

const FACTION_PAGES: SpellDef[] = [
  {
    id: "mend",
    name: "Mend",
    school: "bloom",
    tier: 1,
    mana: 4,
    target: "stack",
    fuel: "The heal",
    pool: false,
    scale: { base: 20, per: 10 },
    text: (p) => `Heal a stack for ${n(20, 10, p)} HP, reviving.`,
    resolve(fx, _a, t, c) {
      fx.heal(stackOf(t[0]), dbl(n(20, 10, c.power), c), { revive: true });
    },
  },
  {
    id: "thunderclap",
    name: "Thunderclap",
    school: "storm",
    tier: 1,
    mana: 4,
    target: "area1",
    fuel: "The Harm",
    pool: false,
    scale: { base: 12, per: 6 },
    text: (p) =>
      `Deal ${n(12, 6, p)} Harm to every stack on a hex and the 6 around it, friend or foe.`,
    resolve(fx, _a, t, c) {
      for (const id of stacksOn(fx.state, discHexes(hexOf(t[0]), 1)))
        fx.harm(id, n(12, 6, c.power), {
          fuelled: c.fuelled,
          area: { centre: hexOf(t[0]), side: c.side },
        });
    },
  },
  {
    id: "last-breath",
    name: "Last Breath",
    school: "hush",
    tier: 1,
    mana: 4,
    target: "stack",
    fuel: "The Harm",
    pool: false,
    scale: { base: 20, per: 10 },
    text: (p) => `Deal ${n(20, 10, p)} Harm to a stack.`,
    resolve(fx, _a, t, c) {
      fx.harm(stackOf(t[0]), n(20, 10, c.power), { fuelled: c.fuelled });
    },
  },
];

/** Every battle spell, by school, in CONTENT_SPELLS order. */
export const BATTLE_SPELLS: readonly SpellDef[] = [
  ...BLOOM,
  ...ACCORD,
  ...CLOCK,
  ...HUSH,
  ...STORM,
  ...FACTION_PAGES,
];

const BY_ID = new Map(BATTLE_SPELLS.map((s) => [s.id, s]));

export function spellDef(id: string): SpellDef {
  const s = BY_ID.get(id);
  if (!s) throw new Error(`unknown battle spell ${id}`);
  return s;
}

export function isBattleSpell(id: string): boolean {
  return BY_ID.has(id);
}

/** The battle spells guilds and shrines draw from. */
export function poolBattleSpells(): SpellDef[] {
  return BATTLE_SPELLS.filter((s) => s.pool !== false);
}

/** Registers every battle spell as a cast act (idempotent). */
export function registerSpells(): void {
  registerMagicKinds();
  if (hasAct("jolt")) return;
  registerEffect("spell:appointment", (fx, args) => {
    const a = args as { target: string; x: number; fuelled: boolean };
    if (fx.isAlive(a.target)) fx.harm(a.target, a.x, { fuelled: a.fuelled });
  });
  for (const s of BATTLE_SPELLS) {
    if (hasAct(s.id)) continue;
    registerAct({
      id: s.id,
      name: s.name,
      text: s.text(0),
      kind: "cast",
      school: s.school,
      tier: s.tier,
      mana: s.mana,
      sized: s.fuel !== null,
      targets: TARGET_COUNT[s.target],
      check: (state, actorId, targets) =>
        targetRuleError(s.target, state, actorId, targets) ??
        s.check?.(state, actorId, targets) ??
        null,
      aiTargets: (state, actorId) => ruleCandidates(s.target, state, actorId),
      touches: (state, actorId, targets) =>
        s.touches
          ? s.touches(state, actorId, targets)
          : ruleTouches(s.target, state, actorId, targets),
      resolve: (fx, actorId, targets, cast) =>
        s.resolve(
          fx,
          actorId,
          targets,
          cast ?? {
            power: 0,
            fuelled: false,
            by: "page",
            side: fx.sideOf(actorId),
          },
        ),
    });
  }
}

/** The area radius of a spell, or null (for the targeting overlay). */
export function spellRadius(s: SpellDef): number | null {
  return AREA_RADIUS[s.target] ?? null;
}

/** The kind's display name (for chain text). */
export function kindName(id: string): string {
  return conditionKind(id).name;
}

/** The next hex of a line from a through b (Bramble Row targeting). */
export function lineThrough(a: Hex, b: Hex): Hex[] {
  for (let d = 0; d < 6; d++) {
    if (stepHex(a, d).col === b.col && stepHex(a, d).row === b.row)
      return [a, b, stepHex(b, d)];
  }
  return [a];
}
