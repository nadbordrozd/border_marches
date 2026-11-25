/**
 * Spellbook and targeting logic for the battle screen (RULES_V2 2.4 to
 * 2.6), kept free of the DOM so it can be tested: the hero's book with each
 * page's state, a creature caster's pages, the targeting steps, the Echo
 * and Fuel options of a cast with what each would do, and the exact
 * rehearsed chain of the cast.
 */

import {
  casterOf,
  conditionKind,
  creatureCastPower,
  creaturePagesLeft,
  echoError,
  fuelError,
  getStack,
  heroCastPower,
  isAlive,
  act as actDef,
  rehearse,
  touchedStacks,
} from "../../core/battle/index.ts";
import {
  heroManaCost,
  pageUses,
  secondCastError,
  timesSpent,
} from "../../core/battle/magic.ts";
import type {
  ActTarget,
  BattleAction,
  BattleSide,
  BattleState,
  ConditionRef,
  Hex,
  School,
  StackId,
} from "../../core/battle/index.ts";
import {
  AREA_RADIUS,
  discHexes,
  isBattleSpell,
  spellDef,
  targetSteps,
} from "../../core/magic/index.ts";
import { ICON_FRAMES } from "../../assets/icons.ts";
import { chainLines } from "./grammar.ts";
import { creatureName } from "./preview.ts";

export const SCHOOL_NAMES: Readonly<Record<School, string>> = {
  bloom: "Bloom",
  accord: "Accord",
  clock: "Clock",
  hush: "Hush",
  storm: "Storm",
};

/**
 * School colours: the spell icons' frame colours (docs/art/classes/icons.md),
 * so a book's chips and tile edges match the frames (bead bzc.63).
 */
export const SCHOOL_COLOURS: Readonly<Record<School, string>> = {
  bloom: ICON_FRAMES.bloom.colour,
  accord: ICON_FRAMES.accord.colour,
  clock: ICON_FRAMES.clock.colour,
  hush: ICON_FRAMES.hush.colour,
  storm: ICON_FRAMES.storm.colour,
};

export type EntryStatus =
  | "ready"
  /** Spent for this battle. */
  | "spent"
  /** Not enough mana. */
  | "mana"
  /** The hero already cast this round. */
  | "cast"
  /** Not the player's moment (no friendly stack's turn). */
  | "wait"
  /** Nothing on the field it can be cast on (spell-targets.ts). */
  | "target";

export interface BookEntry {
  readonly id: string;
  readonly name: string;
  readonly school: School;
  readonly tier: number;
  /** Mana this cast costs (0 for scrolls and creature pages). */
  readonly mana: number;
  /** Effective Power of this cast. */
  readonly power: number;
  /** The effect with this Power's numbers. */
  readonly text: string;
  /** "item": an artifact's item act (RULES_V2 4.6 form 4). */
  readonly source: "page" | "scroll" | "creature" | "item";
  /** Scrolls: how many of this spell the case holds. */
  readonly count: number;
  readonly status: EntryStatus;
  /** Why it cannot be cast now, or null. */
  readonly reason: string | null;
  /** What Fuel doubles, or null. */
  readonly fuel: string | null;
}

/** The side whose hero the player commands on this turn, or null. */
export function heroSideNow(
  state: BattleState,
  playerSides: ReadonlySet<BattleSide>,
): BattleSide | null {
  const id = state.activeStackId;
  if (id === null || state.winner !== null) return null;
  const side = getStack(state, id).side;
  return playerSides.has(side) ? side : null;
}

/** The hero's pages (school order, then tier) and scrolls. */
export function heroBook(state: BattleState, side: BattleSide): BookEntry[] {
  const magic = state.sides[side].magic;
  if (!magic) return [];
  const active =
    state.activeStackId !== null &&
    getStack(state, state.activeStackId).side === side;
  // A second cast this round when a rule allows it (the Glove, Vow of the
  // Opening, Packrat 3's free scroll).
  const castUsedFor = (id: string, scroll: boolean): boolean =>
    state.sides[side].castRound === state.round &&
    secondCastError(state, side, actDef(id), scroll) !== null;
  const out: BookEntry[] = [];
  for (const id of magic.pages) {
    if (!isBattleSpell(id)) continue;
    const s = spellDef(id);
    const def = actDef(id);
    const mana = heroManaCost(state, side, def, false);
    const power = heroCastPower(magic, def, false);
    const spent = timesSpent(magic, id) >= pageUses(state, side, def);
    const castUsed = castUsedFor(id, false);
    const status: EntryStatus = spent
      ? "spent"
      : magic.mana < mana
        ? "mana"
        : castUsed
          ? "cast"
          : active
            ? "ready"
            : "wait";
    out.push({
      id,
      name: s.name,
      school: s.school,
      tier: s.tier,
      mana,
      power,
      text: s.text(power),
      source: "page",
      count: 1,
      status,
      reason: reasonFor(status, mana, magic.mana),
      fuel: s.fuel,
    });
  }
  const seen = new Set<string>();
  for (const id of magic.scrolls) {
    if (seen.has(id) || !isBattleSpell(id)) continue;
    seen.add(id);
    const s = spellDef(id);
    const power = heroCastPower(magic, actDef(id), true);
    const mana = heroManaCost(state, side, actDef(id), true);
    const status: EntryStatus = magic.spent.includes(`scroll:${id}`)
      ? "spent"
      : magic.mana < mana
        ? "mana"
        : castUsedFor(id, true)
          ? "cast"
          : active
            ? "ready"
            : "wait";
    out.push({
      id,
      name: s.name,
      school: s.school,
      tier: s.tier,
      mana,
      power,
      text: s.text(power),
      source: "scroll",
      count: magic.scrolls.filter((x) => x === id).length,
      status,
      reason: reasonFor(status, mana, magic.mana),
      fuel: s.fuel,
    });
  }
  out.push(...itemEntries(state, side));
  const order: readonly School[] = [
    "bloom",
    "accord",
    "clock",
    "hush",
    "storm",
  ];
  return out.sort(
    (a, b) =>
      Number(a.source === "scroll") - Number(b.source === "scroll") ||
      order.indexOf(a.school) - order.indexOf(b.school) ||
      a.tier - b.tier ||
      a.name.localeCompare(b.name),
  );
}

/**
 * Targets of each item act, in order (core/battle/hero-effects.ts): the
 * steps the battle screen walks, as for spells.
 */
export const ITEM_ACT_STEPS: Readonly<
  Record<string, readonly ("stack" | "condition")[]>
> = {
  tinderbox: [],
  "a-pinch-of-sand": ["condition"],
  "cider-flask": ["condition"],
  "the-bellhops-cap": ["stack", "condition", "stack"],
};

export function isItemAct(id: string): boolean {
  return Object.hasOwn(ITEM_ACT_STEPS, id);
}

/** The hero's item acts (once per battle each) as book entries. */
export function itemEntries(state: BattleState, side: BattleSide): BookEntry[] {
  const st = state.sides[side];
  const active =
    state.activeStackId !== null &&
    getStack(state, state.activeStackId).side === side;
  return (st.hero?.itemActs ?? []).filter(isItemAct).map((id) => {
    const def = actDef(id);
    const status: EntryStatus = st.itemActsUsed.includes(id)
      ? "spent"
      : active
        ? "ready"
        : "wait";
    return {
      id,
      name: def.name,
      school: "accord",
      tier: 0,
      mana: 0,
      power: 0,
      text: def.text,
      source: "item",
      count: 1,
      status,
      reason:
        status === "spent"
          ? "Used this battle"
          : status === "wait"
            ? "Use on one of your stacks' turns"
            : null,
      fuel: null,
    };
  });
}

function reasonFor(
  status: EntryStatus,
  cost: number,
  mana: number,
): string | null {
  switch (status) {
    case "ready":
      return null;
    case "spent":
      return "Spent for this battle";
    case "mana":
      return `Needs ${cost} mana (${mana} left)`;
    case "cast":
      return "The hero has cast this round";
    case "wait":
      return "Cast on one of your stacks' turns";
    case "target":
      return "No valid target";
  }
}

/** The active stack's own pages, when it is a creature caster (2.6). */
export function creatureBook(state: BattleState): BookEntry[] {
  const id = state.activeStackId;
  if (id === null) return [];
  const s = getStack(state, id);
  const c = casterOf(s.creature);
  if (!c) return [];
  const left = creaturePagesLeft(s);
  const power = creatureCastPower(s);
  return c.pages.filter(isBattleSpell).map((pid) => {
    const def = spellDef(pid);
    const ok = left.includes(pid);
    return {
      id: pid,
      name: def.name,
      school: def.school,
      tier: def.tier,
      mana: 0,
      power,
      text: def.text(power),
      source: "creature",
      count: 1,
      status: ok ? "ready" : "spent",
      reason: ok ? null : "Spent for this battle",
      fuel: null,
    };
  });
}

/** What the next target of a spell is, or null when all are chosen. */
export function nextStep(
  spellId: string,
  targets: readonly ActTarget[],
): "stack" | "hex" | "condition" | "choice" | null {
  if (isItemAct(spellId))
    return ITEM_ACT_STEPS[spellId]?.[targets.length] ?? null;
  const steps = targetSteps(spellDef(spellId).target);
  return steps[targets.length] ?? null;
}

/** Prompts of the item acts' targeting steps. */
function itemPrompt(id: string, i: number): string {
  switch (id) {
    case "a-pinch-of-sand":
      return "Choose a stack, then the condition whose clock moves by 2.";
    case "cider-flask":
      return "Choose one of your stacks, then its Ripening.";
    case "the-bellhops-cap":
      return i === 0
        ? "Choose one of your stacks."
        : i === 1
          ? "Choose a stack beside it, then the condition to move."
          : "Choose the stack beside yours that receives it.";
    default:
      return "Ready to use.";
  }
}

/** Human prompt for the next target. */
export function stepPrompt(
  spellId: string,
  targets: readonly ActTarget[],
): string {
  const i = targets.length;
  if (isItemAct(spellId)) return itemPrompt(spellId, i);
  const rule = spellDef(spellId).target;
  switch (rule) {
    case "friendly":
      return "Choose one of your stacks.";
    case "enemy":
      return "Choose an enemy stack.";
    case "twoFriendly":
      return i === 0
        ? "Choose the first friendly stack."
        : "Choose the second friendly stack.";
    case "enemyFriendly":
      return i === 0
        ? "Choose the enemy stack."
        : "Choose your stack that receives.";
    case "freeHex":
      return "Choose a free hex.";
    case "line3":
      return i === 0
        ? "Choose where the line starts."
        : "Choose the next hex of the line.";
    case "area1":
    case "area2":
    case "area3":
      return "Choose the centre hex.";
    case "condition":
      return "Choose a stack, then one of its conditions.";
    case "share":
      return "Choose a linked stack, then the condition to copy.";
    case "passOn":
      return i === 0
        ? "Choose a bane (a stack, then the bane)."
        : "Choose the stack beside its bearer.";
    case "wind":
      return i === 0
        ? "Choose a condition with a clock."
        : "Wind it forward or back.";
    case "remains":
      return "Choose remains of one of your stacks.";
    case "stack":
      return "Choose a stack.";
    default:
      return "Ready to cast.";
  }
}

/** The hero cast or creature cast for a book entry and chosen targets. */
export function castAction(
  state: BattleState,
  entry: Pick<BookEntry, "id" | "source">,
  targets: readonly ActTarget[],
  choice: {
    readonly echo?: ConditionRef | null;
    readonly fuel?: ConditionRef | null;
  } = {},
): BattleAction {
  const stackId = state.activeStackId as StackId;
  if (entry.source === "creature")
    return { type: "creatureCast", stackId, spell: entry.id, targets };
  if (entry.source === "item")
    return { type: "heroAct", stackId, act: entry.id, targets };
  return {
    type: "heroAct",
    stackId,
    act: entry.id,
    targets,
    ...(entry.source === "scroll" ? { scroll: true } : {}),
    ...(choice.echo ? { echo: choice.echo } : {}),
    ...(choice.fuel ? { fuel: choice.fuel } : {}),
  };
}

export interface ConditionOption {
  readonly ref: ConditionRef;
  readonly label: string;
  /** What choosing it would do. */
  readonly effect: string;
}

function describe(
  state: BattleState,
  ref: ConditionRef,
): {
  kind: string;
  who: string;
  clock: number | null;
} {
  const s = getStack(state, ref.stack);
  const c = s.conditions.find((x) => x.uid === ref.condition);
  return {
    kind: c ? conditionKind(c.kind).name : "?",
    who: creatureName(s.creature, Math.max(1, s.count)),
    clock: c?.clock ?? null,
  };
}

function candidates(
  state: BattleState,
  spellId: string,
  actorId: StackId,
  targets: readonly ActTarget[],
): ConditionRef[] {
  const def = actDef(spellId);
  const out: ConditionRef[] = [];
  for (const id of touchedStacks(state, def, actorId, targets)) {
    for (const c of getStack(state, id).conditions)
      out.push({ stack: id, condition: c.uid });
  }
  return out;
}

/** Conditions this cast could Echo (allied school, clocked, not a Hold). */
export function echoOptions(
  state: BattleState,
  spellId: string,
  targets: readonly ActTarget[],
): ConditionOption[] {
  const actor = state.activeStackId;
  if (actor === null) return [];
  const def = actDef(spellId);
  const rounds =
    state.sides[getStack(state, actor).side].magic?.echoRounds ?? 1;
  return candidates(state, spellId, actor, targets)
    .filter((ref) => echoError(state, def, actor, targets, ref) === null)
    .map((ref) => {
      const d = describe(state, ref);
      return {
        ref,
        label: `${d.kind} on ${d.who}`,
        effect: `Echo: ${d.kind} lasts ${d.clock ?? 0} → ${Math.min(9, (d.clock ?? 0) + rounds)} rounds`,
      };
    });
}

/** Conditions this cast could burn as Fuel (opposed school, sized spell). */
export function fuelOptions(
  state: BattleState,
  spellId: string,
  targets: readonly ActTarget[],
): ConditionOption[] {
  const actor = state.activeStackId;
  if (actor === null) return [];
  const side = getStack(state, actor).side;
  const def = actDef(spellId);
  const doubled = spellDef(spellId).fuel ?? "the size";
  return candidates(state, spellId, actor, targets)
    .filter((ref) => fuelError(state, side, def, actor, targets, ref) === null)
    .map((ref) => {
      const d = describe(state, ref);
      return {
        ref,
        label: `${d.kind} on ${d.who}`,
        effect: `Fuel: burn ${d.kind} on ${d.who}; ${doubled.charAt(0).toLowerCase()}${doubled.slice(1)} is doubled`,
      };
    });
}

export interface CastPreview {
  readonly legal: boolean;
  /** The refusal, when not legal. */
  readonly message: string | null;
  /** The exact chain, one line per step. */
  readonly lines: readonly string[];
  /** Per stack touched: "Ogres: -80 HP, 8 killed; +Venomed". */
  readonly summary: readonly string[];
}

/**
 * A condition's new length in plain words: "for 2 → 4 rounds", "for 1
 * round", "for the whole battle" (null clock). `was` is the length before,
 * undefined when the preview does not know it.
 */
export function roundsChange(
  was: number | null | undefined,
  now: number | null,
): string {
  const len = (c: number | null): string =>
    c === null ? "the whole battle" : `${c} round${c === 1 ? "" : "s"}`;
  if (was === undefined) return `for ${len(now)}`;
  if (was !== null && now !== null)
    return `for ${was} → ${now} round${now === 1 ? "" : "s"}`;
  return `for ${len(was)} → ${len(now)}`;
}

/** The rehearsed cast (RULES_V2 1.13): exactly what applying it does. */
export function castPreview(
  state: BattleState,
  action: BattleAction,
): CastPreview {
  const r = rehearse(state, action);
  if (r.legal !== true)
    return { legal: false, message: r.legal.message, lines: [], summary: [] };
  const lines = chainLines(state, r.steps);
  // Effects no number shows: pushes, pulls, teleports, swaps, badges.
  const moved = new Map<StackId, string[]>();
  for (const e of r.steps) {
    if (
      e.type === "condition" &&
      (e.change === "wound" || e.change === "fed")
    ) {
      const name = conditionKind(e.condition.kind).name;
      const was = state.stacks
        .find((x) => x.id === e.stackId)
        ?.conditions.find((c) => c.uid === e.condition.uid);
      const what =
        e.change === "wound"
          ? `${name} ${roundsChange(was ? was.clock : undefined, e.condition.clock)}`
          : `${name} grows to ${e.condition.size}`;
      moved.set(e.stackId, [...(moved.get(e.stackId) ?? []), what]);
      continue;
    }
    if (e.type !== "move" || e.mode === "walk") continue;
    const n = e.path.length;
    const what =
      e.mode === "swap"
        ? "swaps places"
        : e.mode === "teleport"
          ? "teleported"
          : `${e.mode}ed ${n} hex${n === 1 ? "" : "es"}`;
    moved.set(e.stackId, [...(moved.get(e.stackId) ?? []), what]);
  }
  // The "gets up" badge (One More Time) changes no number: name it.
  for (const s of r.after.stacks) {
    const b = state.stacks.find((x) => x.id === s.id);
    if (b && s.getsUp === true && b.getsUp !== true)
      moved.set(s.id, [...(moved.get(s.id) ?? []), "gains 'gets up'"]);
  }
  const nameOf = (id: StackId): string => {
    const st =
      state.stacks.find((x) => x.id === id) ??
      r.after.stacks.find((x) => x.id === id);
    return st ? creatureName(st.creature, Math.max(1, st.count)) : id;
  };
  const summary = r.summary.map((s) => {
    const name = nameOf(s.stackId);
    const parts: string[] = [...(moved.get(s.stackId) ?? [])];
    moved.delete(s.stackId);
    if (s.hpLost > 0) parts.push(`−${s.hpLost} HP`);
    if (s.hpLost < 0) parts.push(`+${-s.hpLost} HP`);
    if (s.killed > 0) parts.push(`${s.killed} killed`);
    if (s.killed < 0) parts.push(`${-s.killed} back`);
    for (const k of s.conditionsGained) parts.push(`+${conditionKind(k).name}`);
    for (const k of s.conditionsLost) parts.push(`−${conditionKind(k).name}`);
    return `${name}: ${parts.join(", ") || "no change"}`;
  });
  summary.unshift(
    ...[...moved].map(([id, parts]) => `${nameOf(id)}: ${parts.join(", ")}`),
  );
  const summoned = r.after.stacks.filter(
    (s) => !state.stacks.some((x) => x.id === s.id) && isAlive(s),
  );
  for (const s of summoned)
    summary.push(
      `${creatureName(s.creature, s.count)} ×${s.count} join the battle`,
    );
  return { legal: true, message: null, lines, summary };
}

/** Hexes an area spell would cover around `centre` (for the overlay). */
export function spellAreaHexes(spellId: string, centre: Hex): Hex[] {
  if (isItemAct(spellId)) return [centre];
  const r = AREA_RADIUS[spellDef(spellId).target];
  return r === undefined ? [centre] : discHexes(centre, r);
}
