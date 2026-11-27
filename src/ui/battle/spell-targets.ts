/**
 * What a battle spell can be aimed at now (bead bzc.47), kept free of the
 * DOM so it can be tested: the target type of each spell in plain words
 * with its icon, every valid target of the next targeting step, whether
 * any target exists at all, and why not.
 *
 * Candidates follow the target rules of core/magic/targets.ts; each one is
 * tested by the engine's own `actionError` on the complete cast (a
 * candidate for an early step is valid when some completion of the cast is
 * legal), so what glows on the field is exactly what may be cast.
 */

import {
  BATTLE_HEX_COUNT,
  actionError,
  applyAction,
  getStack,
  hexFromIndex,
  inBounds,
  isAlive,
  neighbors,
  sameHex,
  stepHex,
} from "../../core/battle/index.ts";
import type {
  ActTarget,
  BattleEvent,
  BattleState,
  Hex,
} from "../../core/battle/index.ts";
import {
  AREA_RADIUS,
  directionTo,
  isBattleSpell,
  spellDef,
  targetSteps,
} from "../../core/magic/index.ts";
import type { TargetRule } from "../../core/magic/index.ts";
import { chainLines } from "./grammar.ts";
import { castAction, isItemAct } from "./magic.ts";
import type { BookEntry } from "./magic.ts";

/** The pictogram of a target type (drawn by targetIconSvg). */
export type TargetIcon =
  | "enemy"
  | "friendly"
  | "stack"
  | "hex"
  | "line"
  | "area"
  | "condition"
  | "remains"
  | "all"
  | "self";

export interface TargetKind {
  readonly icon: TargetIcon;
  /** Plain words: "An enemy stack", "Area: a hex and the 6 around it". */
  readonly label: string;
}

const AREA_LABEL: Readonly<Record<number, string>> = {
  1: "Area: a hex and the 6 around it",
  2: "Area: a hex and 2 rings around it (19 hexes)",
  3: "Area: a hex and 3 rings around it (37 hexes)",
};

/** A target rule in plain words with its icon. */
export function targetKind(rule: TargetRule): TargetKind {
  switch (rule) {
    case "stack":
      return { icon: "stack", label: "Any stack, yours or the enemy's" };
    case "friendly":
      return { icon: "friendly", label: "One of your stacks" };
    case "enemy":
      return { icon: "enemy", label: "An enemy stack" };
    case "twoFriendly":
      return { icon: "friendly", label: "Two of your stacks" };
    case "enemyFriendly":
      return { icon: "enemy", label: "An enemy stack, then one of yours" };
    case "freeHex":
      return { icon: "hex", label: "An empty hex" };
    case "line3":
      return { icon: "line", label: "A straight line of 3 hexes" };
    case "area1":
    case "area2":
    case "area3":
      return {
        icon: "area",
        label: AREA_LABEL[AREA_RADIUS[rule] ?? 1] ?? "An area",
      };
    case "condition":
      return { icon: "condition", label: "A condition on any stack" };
    case "share":
      return { icon: "condition", label: "A condition on a linked stack" };
    case "passOn":
      return {
        icon: "condition",
        label: "A bane, then a stack beside its bearer",
      };
    case "wind":
      return { icon: "condition", label: "A condition with a clock" };
    case "remains":
      return { icon: "remains", label: "Remains of one of your stacks" };
    case "allFriendly":
      return { icon: "all", label: "All your stacks (no aiming)" };
    case "allRemains":
      return { icon: "remains", label: "All your remains (no aiming)" };
    case "active":
      return { icon: "self", label: "The stack about to act (no aiming)" };
    case "row":
      return { icon: "line", label: "A whole row of hexes" };
  }
}

/** The target type of a battle spell, or null for anything else. */
export function spellTargetKind(spellId: string): TargetKind | null {
  if (isItemAct(spellId) || !isBattleSpell(spellId)) return null;
  return targetKind(spellDef(spellId).target);
}

/** Why a spell with this rule has nothing to aim at (book and bar). */
export function noTargetReason(rule: TargetRule): string {
  switch (rule) {
    case "stack":
      return "No stack it can affect";
    case "friendly":
      return "None of your stacks can take it";
    case "enemy":
      return "No enemy stack it can affect";
    case "twoFriendly":
      return "Needs two of your stacks";
    case "enemyFriendly":
      return "Needs an enemy stack and one of yours";
    case "freeHex":
      return "No empty hex";
    case "line3":
      return "No clear straight line of 3 hexes";
    case "area1":
    case "area2":
    case "area3":
      return "No hex it can be aimed at";
    case "condition":
      return "No condition on the field it can take";
    case "share":
      return "No condition on a linked stack to share";
    case "passOn":
      return "No bane with a stack beside its bearer";
    case "wind":
      return "No condition with a clock on the field";
    case "remains":
    case "allRemains":
      return "No remains of your stacks on the field";
    case "allFriendly":
    case "active":
      return "Nothing it can affect now";
    case "row":
      return "No row it can be aimed at";
  }
}

/**
 * From this many valid hexes on, a step aims "anywhere": the field is not
 * shaded or dimmed, only the hovered hex and its footprint are drawn.
 */
export const ANYWHERE = Math.ceil(BATTLE_HEX_COUNT * 0.6);

/** One valid target of the next step. */
export interface CastChoice {
  readonly target: ActTarget;
  /** Where it is on the field (a stack's or condition bearer's hex); null for an option. */
  readonly hex: Hex | null;
  /**
   * Legal, but the cast would change nothing through it: why ("Turned
   * refused by Goblins (gate 120 HP, target has 320)"), else null.
   */
  readonly noEffect: string | null;
}

type Entry = Pick<BookEntry, "id" | "source">;

function allHexes(): Hex[] {
  const out: Hex[] = [];
  for (let i = 0; i < BATTLE_HEX_COUNT; i++) out.push(hexFromIndex(i));
  return out;
}

/**
 * Every target the step after `prefix` could take under the rule, before
 * the engine's check: stacks, conditions, options, and hexes (only the
 * line's next hex for a line).
 */
function stepCandidates(
  state: BattleState,
  rule: TargetRule,
  prefix: readonly ActTarget[],
): ActTarget[] {
  const kind = targetSteps(rule)[prefix.length];
  const living = state.stacks.filter(isAlive);
  switch (kind) {
    case "stack":
      return living.map((s) => ({ stack: s.id }));
    case "condition":
      return living.flatMap((s) =>
        s.conditions.map((c) => ({ stack: s.id, condition: c.uid })),
      );
    case "choice":
      return [{ choice: "+2" }, { choice: "-2" }];
    case "hex": {
      const [t0, t1] = prefix;
      if (rule === "line3" && t0 !== undefined && "hex" in t0) {
        if (prefix.length === 1)
          return neighbors(t0.hex)
            .filter(inBounds)
            .map((hex) => ({ hex }));
        if (t1 !== undefined && "hex" in t1) {
          const d = directionTo(t0.hex, t1.hex);
          const next = d < 0 ? null : stepHex(t1.hex, d);
          return next && inBounds(next) ? [{ hex: next }] : [];
        }
        return [];
      }
      return allHexes().map((hex) => ({ hex }));
    }
    default:
      return [];
  }
}

function ruleOf(entry: Entry): TargetRule | null {
  if (entry.source === "item" || !isBattleSpell(entry.id)) return null;
  return spellDef(entry.id).target;
}

/** What a complete cast would do: nothing legal, something, or nothing. */
type Outcome =
  | { readonly kind: "illegal" }
  | { readonly kind: "effect" }
  | {
      readonly kind: "none";
      /** The refusals in its chain (gate, tag, Hold...), maybe none. */
      readonly refusals: readonly BattleEvent[];
      /** "Turned refused by Goblins (gate 120 HP, target has 320)". */
      readonly text: string;
    };

const TURN_BOUNDARY: ReadonlySet<string> = new Set([
  "turnStart",
  "roundEnd",
  "roundStart",
  "end",
]);

/** Whether one event of a cast's own chain changes the battle. */
function changes(e: BattleEvent): boolean {
  switch (e.type) {
    case "heroAct":
    case "creatureCast":
    case "contentError":
    case "wary":
      return false;
    case "condition":
    case "ground":
    case "schedule":
      return e.change !== "refused";
    case "harm":
      return e.harm > 0 || e.kills > 0;
    case "damage":
      return e.hpLost > 0 || e.kills > 0 || e.redirectedTo !== null;
    case "heal":
      return e.amount > 0 || e.revived > 0;
    case "linkTransfer":
      return e.amount > 0;
    case "move":
      return e.path.length > 0;
    default:
      return true;
  }
}

/** The field a cast can change: stacks, ground and scheduled events. */
function fieldPrint(s: BattleState): string {
  return JSON.stringify([s.stacks, s.ground, s.scheduled]);
}

/**
 * Rehearses a complete cast (the engine's own applyAction) and tells
 * whether it changes anything: an effect event in its chain, or, when the
 * chain ends before any next turn, any change to the field at all.
 */
function outcome(
  state: BattleState,
  entry: Entry,
  targets: readonly ActTarget[],
): Outcome {
  if (state.activeStackId === null) return { kind: "illegal" };
  const action = castAction(state, entry, targets);
  if (actionError(state, action) !== null) return { kind: "illegal" };
  const step = applyAction(state, action);
  const end = step.events.findIndex((e) => TURN_BOUNDARY.has(e.type));
  const chain = end < 0 ? step.events : step.events.slice(0, end);
  const effect =
    chain.some(changes) ||
    // Changes no event names (a "gets up" badge): the field differs.
    (end < 0 && fieldPrint(state) !== fieldPrint(step.state));
  if (effect) return { kind: "effect" };
  const refusals = chain.filter(
    (e) =>
      (e.type === "condition" ||
        e.type === "ground" ||
        e.type === "schedule") &&
      e.change === "refused",
  );
  return {
    kind: "none",
    refusals,
    text: chainLines(state, refusals)[0] ?? "nothing would change",
  };
}

/** Bounds the leaves a search may rehearse (worst case: a line of 3). */
const MAX_LEAVES = 1200;

/**
 * The best completion of `prefix`: an effect if any (stops there), else a
 * legal cast with no effect (with its refusals), else illegal.
 */
function bestCompletion(
  state: BattleState,
  entry: Entry,
  rule: TargetRule,
  prefix: readonly ActTarget[],
  budget: { leaves: number },
  legalOnly = false,
): Outcome {
  const steps = targetSteps(rule);
  if (prefix.length >= steps.length) {
    if (legalOnly) {
      if (state.activeStackId === null) return { kind: "illegal" };
      return actionError(state, castAction(state, entry, prefix)) === null
        ? { kind: "effect" }
        : { kind: "illegal" };
    }
    budget.leaves++;
    return outcome(state, entry, prefix);
  }
  let none: Extract<Outcome, { kind: "none" }> | null = null;
  const refusals: BattleEvent[] = [];
  for (const c of stepCandidates(state, rule, prefix)) {
    // Out of budget: legality alone decides the rest.
    const r = bestCompletion(
      state,
      entry,
      rule,
      [...prefix, c],
      budget,
      legalOnly || budget.leaves >= MAX_LEAVES,
    );
    if (r.kind === "effect") return r;
    if (r.kind === "none") {
      none ??= r;
      refusals.push(...r.refusals);
    }
  }
  return none === null ? { kind: "illegal" } : { ...none, refusals };
}

function hexOfTarget(state: BattleState, t: ActTarget): Hex | null {
  if ("hex" in t) return t.hex;
  if ("stack" in t) {
    const s = state.stacks.find((x) => x.id === t.stack);
    return s ? s.hex : null;
  }
  return null;
}

/**
 * Every legal target of the cast's next step, given the targets chosen so
 * far, each with `noEffect` set when no completion of the cast through it
 * would change anything (refused by a gate, nothing to heal...); empty
 * when all are chosen (or for an item act).
 */
export function castChoices(
  state: BattleState,
  entry: Entry,
  targets: readonly ActTarget[],
): CastChoice[] {
  const rule = ruleOf(entry);
  if (rule === null || state.activeStackId === null) return [];
  if (targets.length >= targetSteps(rule).length) return [];
  const out: CastChoice[] = [];
  const budget = { leaves: 0 };
  for (const c of stepCandidates(state, rule, targets)) {
    const r = bestCompletion(state, entry, rule, [...targets, c], budget);
    if (r.kind === "illegal") continue;
    out.push({
      target: c,
      hex: hexOfTarget(state, c),
      noEffect: r.kind === "none" ? r.text : null,
    });
  }
  return out;
}

/** The choices that would change something (the ones that glow). */
export function effectiveChoices(list: readonly CastChoice[]): CastChoice[] {
  return list.filter((c) => c.noEffect === null);
}

/** Whether the spell has any legal cast now (stops at the first). */
export function castHasTarget(state: BattleState, entry: Entry): boolean {
  const rule = ruleOf(entry);
  if (rule === null) return true;
  return (
    bestCompletion(state, entry, rule, [], { leaves: 0 }, true).kind !==
    "illegal"
  );
}

/** "every enemy", "every one of your stacks", "every target". */
function everyOf(rule: TargetRule): string {
  switch (rule) {
    case "enemy":
      return "every enemy";
    case "friendly":
    case "twoFriendly":
    case "allFriendly":
    case "active":
      return "every one of your stacks";
    default:
      return "every target";
  }
}

/** A short why for a spell no legal target of which changes anything. */
export function noEffectReason(
  rule: TargetRule,
  refusals: readonly BattleEvent[],
): string {
  const who = everyOf(rule);
  const reasons = new Set(
    refusals.map((e) => (e.type === "condition" ? e.reason : e.type)),
  );
  if (refusals.length > 0 && reasons.size === 1) {
    const [only] = reasons;
    if (only === "gate") {
      const gates = new Set(
        refusals.map((e) =>
          e.type === "condition"
            ? /gate (\d+) HP/.exec(e.detail ?? "")?.[1]
            : undefined,
        ),
      );
      const [g] = gates;
      return gates.size === 1 && g !== undefined
        ? `${who} is above the ${g} HP gate`
        : `${who} is above its gate`;
    }
    if (only === "tag") return `${who} is immune to it`;
    if (only === "hold" || only === "wary") return `${who} refuses Holds now`;
    if (only === "full") return `it is already at its most on ${who}`;
  }
  return "nothing on the field would change";
}

/**
 * The book entries with "target" status where an otherwise ready page,
 * scroll or creature page has nothing it can be cast on, or nothing it
 * could change ("Would have no effect: ...").
 */
export function withTargetStatus(
  state: BattleState,
  entries: readonly BookEntry[],
): BookEntry[] {
  return entries.map((e) => {
    if (e.status !== "ready" || e.source === "item") return e;
    const rule = ruleOf(e);
    if (rule === null) return e;
    const r = bestCompletion(state, e, rule, [], { leaves: 0 });
    if (r.kind === "effect") return e;
    return {
      ...e,
      status: "target",
      reason:
        r.kind === "illegal"
          ? noTargetReason(rule)
          : `Would have no effect: ${noEffectReason(rule, r.refusals)}`,
    };
  });
}

/** The valid choices on hex `h`. */
export function castChoicesAt(
  list: readonly CastChoice[],
  h: Hex,
): CastChoice[] {
  return list.filter((c) => c.hex !== null && sameHex(c.hex, h));
}

/** The stacks the choices point at (stack and condition steps). */
export function choiceStacks(
  state: BattleState,
  list: readonly CastChoice[],
): string[] {
  const out = new Set<string>();
  for (const c of list) {
    if ("stack" in c.target && isAlive(getStack(state, c.target.stack)))
      out.add(c.target.stack);
  }
  return [...out];
}
