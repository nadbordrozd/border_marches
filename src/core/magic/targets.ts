/**
 * Target rules of the battle spells (CONTENT_SPELLS.md 1 and 3): how many
 * targets a spell takes, what may be chosen (law 3: checked once, at the
 * cast) and which stacks the spell touches (RULES_V2 2.4, for Echo and
 * Fuel).
 */

import {
  BATTLE_HEX_COUNT,
  getStack,
  groundAt,
  hexDistance,
  hexFromIndex,
  inBounds,
  isAdjacent,
  isAlive,
  neighbors,
  sameHex,
  stepHex,
  turnOrder,
} from "../battle/index.ts";
import { hasRule } from "../battle/rules.ts";
import type {
  ActTarget,
  BattleSide,
  BattleStack,
  BattleState,
  Condition,
  Hex,
  StackId,
} from "../battle/index.ts";

export type TargetRule =
  /** Any one stack. */
  | "stack"
  /** One stack friendly to the caster. */
  | "friendly"
  /** One stack hostile to the caster. */
  | "enemy"
  /** Two different friendly stacks. */
  | "twoFriendly"
  /** One enemy stack, then one friendly stack. */
  | "enemyFriendly"
  /** One stack, then a hex adjacent to it. */
  | "stackHex"
  /** One free hex. */
  | "freeHex"
  /** Three hexes in a straight line, none blocking. */
  | "line3"
  /** A hex and every hex within 1, 2 or 3 of it. */
  | "area1"
  | "area2"
  | "area3"
  /** One condition. */
  | "condition"
  /** A link, then one other condition on either of its ends (Share). */
  | "share"
  /** A bane, then a stack adjacent to its bearer (Pass On). */
  | "passOn"
  /** A condition with a clock, then "+2" or "-2" (Wind). */
  | "wind"
  /** A hex holding remains of a stack the caster's side owned. */
  | "remains"
  /** Every stack of the caster's side (no choice). */
  | "allFriendly"
  /** Every remains of the caster's side (no choice). */
  | "allRemains"
  /** The friendly stack about to act (no choice). */
  | "active";

export const TARGET_COUNT: Readonly<Record<TargetRule, number>> = {
  stack: 1,
  friendly: 1,
  enemy: 1,
  twoFriendly: 2,
  enemyFriendly: 2,
  stackHex: 2,
  freeHex: 1,
  line3: 3,
  area1: 1,
  area2: 1,
  area3: 1,
  condition: 1,
  share: 2,
  passOn: 2,
  wind: 2,
  remains: 1,
  allFriendly: 0,
  allRemains: 0,
  active: 0,
};

export const AREA_RADIUS: Partial<Record<TargetRule, number>> = {
  area1: 1,
  area2: 2,
  area3: 3,
};

/** The kinds of targets a rule asks for, in order (for the UI). */
export function targetSteps(
  rule: TargetRule,
): readonly ("stack" | "hex" | "condition" | "choice")[] {
  switch (rule) {
    case "stack":
    case "friendly":
    case "enemy":
      return ["stack"];
    case "twoFriendly":
    case "enemyFriendly":
      return ["stack", "stack"];
    case "stackHex":
      return ["stack", "hex"];
    case "freeHex":
    case "area1":
    case "area2":
    case "area3":
    case "remains":
      return ["hex"];
    case "line3":
      return ["hex", "hex", "hex"];
    case "condition":
      return ["condition"];
    case "share":
      return ["condition", "condition"];
    case "passOn":
      return ["condition", "stack"];
    case "wind":
      return ["condition", "choice"];
    case "allFriendly":
    case "allRemains":
    case "active":
      return [];
  }
}

// ---------------------------------------------------------------------------
// Readers

export function stackOf(t: ActTarget | undefined): StackId {
  if (!t || !("stack" in t) || "condition" in t)
    throw new Error("a stack target is required");
  return t.stack;
}

export function hexOf(t: ActTarget | undefined): Hex {
  if (!t || !("hex" in t)) throw new Error("a hex target is required");
  return t.hex;
}

export function conditionOf(t: ActTarget | undefined): {
  stack: StackId;
  uid: number;
} {
  if (!t || !("condition" in t)) throw new Error("a condition is required");
  return { stack: t.stack, uid: t.condition };
}

export function choiceOf(t: ActTarget | undefined): string {
  if (!t || !("choice" in t)) throw new Error("a choice is required");
  return t.choice;
}

function isStackTarget(t: ActTarget | undefined): boolean {
  return t !== undefined && "stack" in t && !("condition" in t);
}

function isConditionTarget(t: ActTarget | undefined): boolean {
  return t !== undefined && "condition" in t;
}

function isHexTarget(t: ActTarget | undefined): boolean {
  return t !== undefined && "hex" in t;
}

export function casterSide(state: BattleState, actorId: StackId): BattleSide {
  return getStack(state, actorId).side;
}

export function findCondition(
  state: BattleState,
  stackId: StackId,
  uid: number,
): Condition | null {
  const s = state.stacks.find((x) => x.id === stackId);
  return s?.conditions.find((c) => c.uid === uid) ?? null;
}

export function stackAt(state: BattleState, h: Hex): BattleStack | null {
  return state.stacks.find((s) => isAlive(s) && sameHex(s.hex, h)) ?? null;
}

export function isBlockingHex(state: BattleState, h: Hex): boolean {
  return groundAt(state, h)?.class === "blocking";
}

export function isFreeHex(state: BattleState, h: Hex): boolean {
  return inBounds(h) && !isBlockingHex(state, h) && stackAt(state, h) === null;
}

/** A hex and every hex within `r` of it, in field (row) order. */
export function discHexes(center: Hex, r: number): Hex[] {
  const out: Hex[] = [];
  for (let i = 0; i < BATTLE_HEX_COUNT; i++) {
    const h = hexFromIndex(i);
    if (hexDistance(h, center) <= r) out.push(h);
  }
  return out;
}

/** Stacks in timeline order (1.10 area order), the rest in field order. */
export function inTimelineOrder(
  state: BattleState,
  ids: readonly StackId[],
): StackId[] {
  const order = turnOrder(state);
  const pos = (id: StackId): number => {
    const i = order.indexOf(id);
    return i >= 0
      ? i
      : order.length + state.stacks.findIndex((s) => s.id === id);
  };
  return [...ids].sort((a, b) => pos(a) - pos(b));
}

/** Living stacks standing on the hexes, in timeline order. */
export function stacksOn(state: BattleState, hexes: readonly Hex[]): StackId[] {
  const ids = state.stacks
    .filter((s) => isAlive(s) && hexes.some((h) => sameHex(h, s.hex)))
    .map((s) => s.id);
  return inTimelineOrder(state, ids);
}

/** Living stacks adjacent to a stack, in timeline order. */
export function adjacentStacks(state: BattleState, id: StackId): StackId[] {
  const s = getStack(state, id);
  return stacksOn(state, neighbors(s.hex));
}

/** Living stacks of a side, in timeline order. */
export function sideStacks(state: BattleState, side: BattleSide): StackId[] {
  return inTimelineOrder(
    state,
    state.stacks.filter((s) => isAlive(s) && s.side === side).map((s) => s.id),
  );
}

/**
 * Whether `side`'s rules may use these remains: its own, or any owner's
 * with Sexton's Spade (remains-any-owner).
 */
export function remainsQualify(
  state: Pick<BattleState, "sides">,
  side: BattleSide,
  owner: BattleSide,
): boolean {
  return owner === side || hasRule(state, side, "remains-any-owner");
}

/** Hexes holding remains `side` may use, in field order. */
export function ownRemains(state: BattleState, side: BattleSide): Hex[] {
  return state.ground
    .filter(
      (g) =>
        g.class === "remains" &&
        g.remains !== null &&
        remainsQualify(state, side, g.remains.owner),
    )
    .map((g) => g.hex);
}

/** The straight line direction from a to b when b is adjacent, or -1. */
export function directionTo(a: Hex, b: Hex): number {
  for (let d = 0; d < 6; d++) if (sameHex(stepHex(a, d), b)) return d;
  return -1;
}

// ---------------------------------------------------------------------------
// The checks (law 3)

function liveStack(state: BattleState, id: StackId): BattleStack | null {
  const s = state.stacks.find((x) => x.id === id);
  return s && isAlive(s) ? s : null;
}

/** Why these targets do not fit the rule, or null. */
export function targetRuleError(
  rule: TargetRule,
  state: BattleState,
  actorId: StackId,
  targets: readonly ActTarget[],
): string | null {
  const side = casterSide(state, actorId);
  const [t0, t1, t2] = targets;
  switch (rule) {
    case "stack":
      return isStackTarget(t0) ? null : "choose a stack";
    case "friendly": {
      if (!isStackTarget(t0)) return "choose a stack";
      const s = liveStack(state, stackOf(t0));
      return s && s.side === side ? null : "choose a friendly stack";
    }
    case "enemy": {
      if (!isStackTarget(t0)) return "choose a stack";
      const s = liveStack(state, stackOf(t0));
      return s && s.side !== side ? null : "choose an enemy stack";
    }
    case "twoFriendly": {
      if (!isStackTarget(t0) || !isStackTarget(t1)) return "choose two stacks";
      const a = liveStack(state, stackOf(t0));
      const b = liveStack(state, stackOf(t1));
      if (!a || !b || a.side !== side || b.side !== side)
        return "choose two friendly stacks";
      return a.id === b.id ? "choose two different stacks" : null;
    }
    case "enemyFriendly": {
      if (!isStackTarget(t0) || !isStackTarget(t1)) return "choose two stacks";
      const a = liveStack(state, stackOf(t0));
      const b = liveStack(state, stackOf(t1));
      if (!a || a.side === side) return "the first stack must be an enemy";
      if (!b || b.side !== side) return "the second stack must be friendly";
      return null;
    }
    case "stackHex": {
      if (!isStackTarget(t0) || !isHexTarget(t1))
        return "choose a stack and a hex beside it";
      const s = liveStack(state, stackOf(t0));
      if (!s) return "choose a stack";
      return isAdjacent(s.hex, hexOf(t1))
        ? null
        : "the hex must be adjacent to the stack";
    }
    case "freeHex":
      if (!isHexTarget(t0)) return "choose a hex";
      return isFreeHex(state, hexOf(t0)) ? null : "choose a free hex";
    case "line3": {
      if (!isHexTarget(t0) || !isHexTarget(t1) || !isHexTarget(t2))
        return "choose three hexes in a line";
      const [a, b, c] = [hexOf(t0), hexOf(t1), hexOf(t2)];
      const d = directionTo(a, b);
      if (d < 0 || !sameHex(stepHex(b, d), c))
        return "the three hexes must make a straight line";
      if ([a, b, c].some((h) => !inBounds(h) || isBlockingHex(state, h)))
        return "no hex of the line may be blocking";
      return null;
    }
    case "area1":
    case "area2":
    case "area3":
      return isHexTarget(t0) ? null : "choose a hex";
    case "condition":
      return isConditionTarget(t0) ? null : "choose a condition";
    case "share": {
      if (!isConditionTarget(t0) || !isConditionTarget(t1))
        return "choose a link and another condition";
      const l = conditionOf(t0);
      const o = conditionOf(t1);
      const link = findCondition(state, l.stack, l.uid);
      if (!link || link.link === null) return "the first must be a link";
      if (!liveStack(state, link.link)) return "the link's far end is dead";
      if (o.stack !== l.stack && o.stack !== link.link)
        return "the other condition must be on one end of the link";
      const other = findCondition(state, o.stack, o.uid);
      if (!other || other.uid === link.uid) return "choose another condition";
      if (other.hold) return "a Hold cannot be shared";
      if (other.link !== null) return "a link cannot be shared";
      return null;
    }
    case "passOn": {
      if (!isConditionTarget(t0) || !isStackTarget(t1))
        return "choose a bane and a stack beside its bearer";
      const ref = conditionOf(t0);
      const c = findCondition(state, ref.stack, ref.uid);
      if (!c || c.polarity !== "bane") return "choose a bane";
      const bearer = liveStack(state, ref.stack);
      const to = liveStack(state, stackOf(t1));
      if (!bearer || !to || to.id === bearer.id) return "choose another stack";
      return isAdjacent(bearer.hex, to.hex)
        ? null
        : "the stack must be adjacent to the bearer";
    }
    case "wind": {
      if (!isConditionTarget(t0) || t1 === undefined || !("choice" in t1))
        return "choose a condition and +2 or -2";
      const ref = conditionOf(t0);
      const c = findCondition(state, ref.stack, ref.uid);
      if (!c || c.clock === null) return "choose a condition with a clock";
      const ch = choiceOf(t1);
      if (ch !== "+2" && ch !== "-2") return "choose +2 or -2";
      if (c.hold && ch === "+2") return "a Hold can only be shortened";
      return null;
    }
    case "remains": {
      if (!isHexTarget(t0)) return "choose remains";
      const g = groundAt(state, hexOf(t0));
      if (!g || g.class !== "remains" || !g.remains) return "choose remains";
      return remainsQualify(state, side, g.remains.owner)
        ? null
        : "the remains must be of a stack your side owned";
    }
    case "allFriendly":
    case "allRemains":
      return null;
    case "active":
      return null;
  }
}

// ---------------------------------------------------------------------------
// Candidates (the battle AI's target lists)

/** Hexes worth aiming an area or a free-hex rule at: stacks and their rings. */
function nearStackHexes(
  state: BattleState,
  stacks: readonly BattleStack[],
): Hex[] {
  const seen = new Set<number>();
  const out: Hex[] = [];
  const add = (h: Hex): void => {
    if (!inBounds(h)) return;
    const k = h.row * 100 + h.col;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(h);
  };
  for (const s of stacks) add(s.hex);
  for (const s of stacks) for (const n of neighbors(s.hex)) add(n);
  return out.filter((h) => !isBlockingHex(state, h));
}

function conditionTargets(
  state: BattleState,
  keep: (c: Condition, s: BattleStack) => boolean = () => true,
): ActTarget[] {
  const out: ActTarget[] = [];
  for (const s of state.stacks) {
    if (!isAlive(s)) continue;
    for (const c of s.conditions)
      if (keep(c, s)) out.push({ stack: s.id, condition: c.uid });
  }
  return out;
}

/**
 * Plausible target tuples for a rule, in a fixed order (the battle AI
 * rehearses each that passes the check). Not every legal choice: hexes are
 * limited to stacks' hexes and their neighbours, lines to those touching
 * an enemy.
 */
export function ruleCandidates(
  rule: TargetRule,
  state: BattleState,
  actorId: StackId,
): ActTarget[][] {
  const side = casterSide(state, actorId);
  const alive = state.stacks.filter(isAlive);
  const friends = alive.filter((s) => s.side === side);
  const enemies = alive.filter((s) => s.side !== side);
  const one = (xs: readonly BattleStack[]): ActTarget[][] =>
    xs.map((s) => [{ stack: s.id }]);
  switch (rule) {
    case "stack":
      return one(alive);
    case "friendly":
      return one(friends);
    case "enemy":
      return one(enemies);
    case "twoFriendly": {
      const out: ActTarget[][] = [];
      for (const a of friends)
        for (const b of friends)
          if (a.id !== b.id) out.push([{ stack: a.id }, { stack: b.id }]);
      return out;
    }
    case "enemyFriendly": {
      const out: ActTarget[][] = [];
      for (const e of enemies)
        for (const f of friends) out.push([{ stack: e.id }, { stack: f.id }]);
      return out;
    }
    case "stackHex": {
      const out: ActTarget[][] = [];
      for (const s of alive)
        for (const h of neighbors(s.hex))
          if (inBounds(h)) out.push([{ stack: s.id }, { hex: h }]);
      return out;
    }
    case "freeHex":
      return nearStackHexes(state, alive)
        .filter((h) => isFreeHex(state, h))
        .map((h) => [{ hex: h }]);
    case "line3": {
      const out: ActTarget[][] = [];
      const seen = new Set<string>();
      for (const e of enemies) {
        for (const start of neighbors(e.hex)) {
          for (let d = 0; d < 6; d++) {
            const b = stepHex(start, d);
            const c = stepHex(b, d);
            const line = [start, b, c];
            if (line.some((h) => !inBounds(h) || isBlockingHex(state, h)))
              continue;
            const key = line
              .map((h) => h.row * 100 + h.col)
              .sort((x, y) => x - y)
              .join(",");
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(line.map((h) => ({ hex: h })));
          }
        }
      }
      return out;
    }
    case "area1":
    case "area2":
    case "area3":
      return nearStackHexes(state, enemies).map((h) => [{ hex: h }]);
    case "condition":
      return conditionTargets(state).map((t) => [t]);
    case "share": {
      const out: ActTarget[][] = [];
      for (const s of alive) {
        for (const l of s.conditions) {
          if (l.link === null) continue;
          const far = alive.find((x) => x.id === l.link);
          if (!far) continue;
          for (const end of [s, far])
            for (const o of end.conditions)
              if (o.uid !== l.uid && !o.hold && o.link === null)
                out.push([
                  { stack: s.id, condition: l.uid },
                  { stack: end.id, condition: o.uid },
                ]);
        }
      }
      return out;
    }
    case "passOn": {
      const out: ActTarget[][] = [];
      for (const s of alive)
        for (const c of s.conditions) {
          if (c.polarity !== "bane") continue;
          for (const o of alive)
            if (o.id !== s.id && isAdjacent(o.hex, s.hex))
              out.push([{ stack: s.id, condition: c.uid }, { stack: o.id }]);
        }
      return out;
    }
    case "wind": {
      const out: ActTarget[][] = [];
      for (const t of conditionTargets(state, (c) => c.clock !== null))
        for (const choice of ["+2", "-2"]) out.push([t, { choice }]);
      return out;
    }
    case "remains":
      return ownRemains(state, side).map((h) => [{ hex: h }]);
    case "allFriendly":
    case "allRemains":
    case "active":
      return [[]];
  }
}

/** The stacks a spell with this rule touches (2.4), before overrides. */
export function ruleTouches(
  rule: TargetRule,
  state: BattleState,
  actorId: StackId,
  targets: readonly ActTarget[],
): StackId[] {
  const [t0, t1] = targets;
  switch (rule) {
    case "stack":
    case "friendly":
    case "enemy":
    case "stackHex":
      return [stackOf(t0)];
    case "twoFriendly":
    case "enemyFriendly":
      return [stackOf(t0), stackOf(t1)];
    case "area1":
    case "area2":
    case "area3":
      return stacksOn(state, discHexes(hexOf(t0), AREA_RADIUS[rule] as number));
    case "condition":
    case "wind":
      return [conditionOf(t0).stack];
    case "share": {
      const l = conditionOf(t0);
      const link = findCondition(state, l.stack, l.uid);
      return link?.link ? [l.stack, link.link] : [l.stack];
    }
    case "passOn":
      return [conditionOf(t0).stack, stackOf(t1)];
    case "allFriendly":
      return sideStacks(state, casterSide(state, actorId));
    case "active":
      return [actorId];
    case "freeHex":
    case "line3":
    case "remains":
    case "allRemains":
      return [];
  }
}
