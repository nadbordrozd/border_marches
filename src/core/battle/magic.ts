/**
 * Casting rules the engine enforces (RULES_V2.md 2.1 to 2.6): the wheel,
 * effective Power, mana costs, pages spent per battle, scrolls, Echo and
 * Fuel, creature casters. The spells themselves are content
 * (src/core/magic); here they are acts of kind "cast" (registry.ts).
 */

import { isAlive } from "./abilities.ts";
import { act as actDef, casterOf, hasAct } from "./registry.ts";
import { hasRule, ruleUsed } from "./rules.ts";
import type { ActDef } from "./registry.ts";
import type {
  ActTarget,
  BattleSide,
  BattleStack,
  BattleState,
  ConditionRef,
  MagicSetup,
  School,
  SideMagic,
  StackId,
} from "./types.ts";

/** Order around the wheel (2.1): neighbours are allied. */
export const SCHOOLS: readonly School[] = [
  "bloom",
  "accord",
  "clock",
  "hush",
  "storm",
];

export type SchoolRelation = "same" | "allied" | "opposed";

export function schoolRelation(a: School, b: School): SchoolRelation {
  if (a === b) return "same";
  const i = SCHOOLS.indexOf(a);
  const j = SCHOOLS.indexOf(b);
  const d = Math.abs(i - j);
  return d === 1 || d === 4 ? "allied" : "opposed";
}

export function alliedSchools(s: School): School[] {
  return SCHOOLS.filter((x) => schoolRelation(s, x) === "allied");
}

export function opposedSchools(s: School): School[] {
  return SCHOOLS.filter((x) => schoolRelation(s, x) === "opposed");
}

/** Power bonus for a school's pages by school rank 0..3 (2.2). */
export const RANK_POWER_BONUS: readonly number[] = [0, 0, 2, 4];
/** Highest tier a school rank can learn (2.2). */
export const RANK_MAX_TIER: readonly number[] = [0, 2, 4, 5];
/** Mana cost by tier 1..5 (2.3). */
export const TIER_MANA: readonly number[] = [0, 4, 7, 10, 14, 20];
export const MAX_POWER = 30;
export const MAX_FUEL = 3;
/** Effective Power of a scroll is at least this (2.5). */
export const SCROLL_MIN_POWER = 2;

export function clampPower(p: number): number {
  return Math.max(0, Math.min(MAX_POWER, Math.floor(p)));
}

export function emptyRanks(): { [S in School]: number } {
  return { bloom: 0, accord: 0, clock: 0, hush: 0, storm: 0 };
}

/** The battle state of a side's magic, from its setup. */
export function sideMagicFromSetup(m: MagicSetup): SideMagic {
  const ranks = emptyRanks();
  for (const s of SCHOOLS) {
    ranks[s] = Math.max(0, Math.min(3, Math.trunc(m.schoolRanks?.[s] ?? 0)));
  }
  return {
    power: Math.max(0, Math.trunc(m.power)),
    mana: Math.max(0, Math.trunc(m.mana)),
    schoolRanks: ranks,
    pages: [...new Set(m.pages)],
    spent: (m.startSpent ?? []).filter((x) => m.pages.includes(x)),
    scrolls: [...(m.scrolls ?? [])],
    scrollsUsed: [],
    fuelUsed: 0,
    fuelMax: Math.max(0, Math.min(MAX_FUEL, m.fuelMax ?? 1)),
    costPercent: Math.max(1, m.costPercent ?? 100),
    manaSpent: 0,
    pagePower: { ...(m.pagePower ?? {}) },
    scrollPower: m.scrollPower ?? null,
    echoRounds: Math.max(1, m.echoRounds ?? 1),
    neverCast: [...(m.neverCast ?? [])],
    noCastRounds: m.noCastRounds ?? null,
    ...(m.spellPower !== undefined ? { spellPower: { ...m.spellPower } } : {}),
    ...(m.unspentPage !== undefined ? { unspentPage: m.unspentPage } : {}),
    casts: [],
  };
}

/** Listed mana cost of a cast act (its own or its tier's). */
export function listedMana(def: ActDef): number {
  return def.mana ?? TIER_MANA[def.tier ?? 1] ?? 4;
}

/** Mana a page costs this hero: percentages, rounded up, at least 1 (2.3). */
export function manaCost(def: ActDef, magic: SideMagic): number {
  return Math.max(1, Math.ceil((listedMana(def) * magic.costPercent) / 100));
}

/** Effective Power of a hero's page or scroll (2.4, 2.5). */
export function heroCastPower(
  magic: SideMagic,
  def: ActDef,
  scroll: boolean,
): number {
  // A Spell specialty's extra Power for its spell (RULES_V2 3.7).
  const special = magic.spellPower?.[def.id] ?? 0;
  if (scroll)
    return clampPower(
      (magic.scrollPower ?? Math.max(SCROLL_MIN_POWER, magic.power)) + special,
    );
  const given = def.school ? magic.pagePower[def.school] : undefined;
  if (given !== undefined) return clampPower(given + special);
  const rank = def.school ? magic.schoolRanks[def.school] : 0;
  return clampPower(magic.power + (RANK_POWER_BONUS[rank] ?? 0) + special);
}

/**
 * Mana a hero cast costs now (RULES_V2 2.3) with the hero's rules: a
 * scroll is free unless Vow of the Borrowed Book keeps it (then it costs
 * its page's mana); The Glove's Lining makes a page of a school opposed to
 * a page cast the round before 25% cheaper (rounded up, at least 1).
 */
export function heroManaCost(
  state: Pick<BattleState, "sides" | "round">,
  side: BattleSide,
  def: ActDef,
  scroll: boolean,
): number {
  const magic = state.sides[side].magic;
  if (!magic) return 0;
  if (scroll && !hasRule(state, side, "scrolls-kept")) return 0;
  let cost = manaCost(def, magic);
  if (
    !scroll &&
    def.school &&
    hasRule(state, side, "opposed-page-discount") &&
    (magic.casts ?? []).some(
      (c) =>
        c.round === state.round - 1 &&
        !c.scroll &&
        c.school !== null &&
        schoolRelation(c.school, def.school as School) === "opposed",
    )
  ) {
    cost = Math.max(1, Math.ceil((cost * 3) / 4));
  }
  return cost;
}

/**
 * Times a page may be cast per battle: 1; 2 for a tier 1 page with The
 * Torn Corner; unlimited for The Unspent Page's page.
 */
export function pageUses(
  state: Pick<BattleState, "sides">,
  side: BattleSide,
  def: ActDef,
): number {
  const magic = state.sides[side].magic;
  if (magic?.unspentPage === def.id) return Infinity;
  return (def.tier ?? 1) === 1 && hasRule(state, side, "tier1-twice") ? 2 : 1;
}

/** Times this page is spent so far this battle. */
export function timesSpent(magic: SideMagic, actId: string): number {
  return magic.spent.filter((x) => x === actId).length;
}

/**
 * Why the hero of `side`, having cast already this round, cannot cast
 * `def` again now, or null when a rule allows it (RULES_V2 1.11: at most
 * two casts a round): Packrat 3's first scroll is free; the Glove (any
 * round) and its Thumb (round 1) allow a second page of an opposed
 * school; Vow of the Opening a second of any school in round 1.
 */
export function secondCastError(
  state: Pick<BattleState, "sides" | "round">,
  side: BattleSide,
  def: ActDef,
  scroll: boolean,
): string | null {
  const used = "the hero has already cast this round";
  if (
    scroll &&
    hasRule(state, side, "first-scroll-free") &&
    !ruleUsed(state, side, "first-scroll-free")
  )
    return null;
  const magic = state.sides[side].magic;
  const now = (magic?.casts ?? []).filter(
    (c) => c.round === state.round && !c.free,
  );
  if (now.length >= 2) return "the hero has already cast twice this round";
  if (now.length === 0) return magic ? null : used;
  if (state.round === 1 && hasRule(state, side, "second-cast-round-1"))
    return null;
  const opposedAllowed =
    hasRule(state, side, "second-cast-opposed") ||
    (state.round === 1 && hasRule(state, side, "second-cast-opposed-round-1"));
  if (!opposedAllowed) return used;
  const first = now[0]?.school ?? null;
  if (
    def.school &&
    first !== null &&
    schoolRelation(first, def.school) === "opposed"
  )
    return null;
  return "the second cast this round must be of a school opposed to the first";
}

/** Effective Power of a creature caster stack, read at the cast (2.6). */
export function creatureCastPower(stack: BattleStack): number {
  const c = casterOf(stack.creature);
  if (!c) return 0;
  return clampPower(
    Math.min(
      c.castCap,
      c.castPower + Math.floor(stack.count / Math.max(1, c.castDivisor)),
    ),
  );
}

/** The stacks a cast touches (2.4): the act's rule, or its stack targets. */
export function touchedStacks(
  state: BattleState,
  def: ActDef,
  actorId: StackId,
  targets: readonly ActTarget[],
): StackId[] {
  const ids = def.touches
    ? def.touches(state, actorId, targets)
    : targets.flatMap((t) => ("stack" in t ? [t.stack] : []));
  const out: StackId[] = [];
  for (const id of ids) {
    const s = state.stacks.find((x) => x.id === id);
    if (s && isAlive(s) && !out.includes(id)) out.push(id);
  }
  return out;
}

function findCondition(state: BattleState, ref: ConditionRef) {
  const s = state.stacks.find((x) => x.id === ref.stack);
  return s?.conditions.find((c) => c.uid === ref.condition) ?? null;
}

/** Why this condition cannot be Echoed by this cast, or null. */
export function echoError(
  state: BattleState,
  def: ActDef,
  actorId: StackId,
  targets: readonly ActTarget[],
  ref: ConditionRef,
): string | null {
  if (!def.school) return "only a spell can Echo";
  const c = findCondition(state, ref);
  if (!c) return "no such condition";
  if (!touchedStacks(state, def, actorId, targets).includes(ref.stack))
    return "Echo needs a condition on a stack the spell touches";
  if (schoolRelation(def.school, c.school) !== "allied")
    return "Echo needs a condition of an allied school";
  if (c.hold) return "a Hold cannot be Echoed";
  if (c.clock === null) return "a clockless condition cannot be Echoed";
  return null;
}

/** Why this condition cannot be burnt as Fuel for this cast, or null. */
export function fuelError(
  state: BattleState,
  side: BattleSide,
  def: ActDef,
  actorId: StackId,
  targets: readonly ActTarget[],
  ref: ConditionRef,
): string | null {
  if (!def.school) return "only a spell can be Fuelled";
  if (!def.sized) return "this spell has no size to double";
  const magic = state.sides[side].magic;
  if (magic && magic.fuelUsed >= magic.fuelMax)
    return "Fuel is used for this battle";
  const c = findCondition(state, ref);
  if (!c) return "no such condition";
  if (!touchedStacks(state, def, actorId, targets).includes(ref.stack))
    return "Fuel needs a condition on a stack the spell touches";
  if (c.kind === "sworn") return "Sworn cannot be burnt as Fuel";
  if (schoolRelation(def.school, c.school) !== "opposed")
    return "Fuel needs a condition of an opposed school";
  return null;
}

/**
 * Why the hero of `side` cannot cast this act now as a page or scroll
 * (book, spent pages, scrolls, mana), or null. A side without magic data
 * casts freely (legacy).
 */
export function heroCastError(
  state: BattleState,
  side: BattleSide,
  actId: string,
  scroll: boolean,
): string | null {
  const magic = state.sides[side].magic;
  if (!magic) return scroll ? "this hero has no scroll case" : null;
  const def = actDef(actId);
  if (def.school && magic.neverCast.includes(def.school))
    return `a vow bars ${def.school} spells`;
  if (noCastRound(magic.noCastRounds, state.round))
    return "a vow bars casting this round";
  if (scroll) {
    if (!magic.scrolls.includes(actId)) return "no such scroll";
    if (!hasRule(state, side, "scrolls-kept")) return null;
    // Vow of the Borrowed Book: spent once per battle, for mana.
    if (magic.spent.includes(`scroll:${actId}`))
      return "this scroll is spent for the battle";
    const cost = heroManaCost(state, side, def, true);
    return magic.mana < cost
      ? `needs ${cost} mana, the hero has ${magic.mana}`
      : null;
  }
  if (!magic.pages.includes(actId)) return "this page is not in the book";
  if (timesSpent(magic, actId) >= pageUses(state, side, def))
    return "this page is spent for the battle";
  const cost = heroManaCost(state, side, def, false);
  if (magic.mana < cost)
    return `needs ${cost} mana, the hero has ${magic.mana}`;
  return null;
}

/** Whether a vow's casting rounds bar `round` (RULES_V2 3.5). */
export function noCastRound(
  rule: SideMagic["noCastRounds"],
  round: number,
): boolean {
  switch (rule) {
    case "1-2":
      return round <= 2;
    case "after-3":
      return round > 3;
    case "even":
      return round % 2 === 0;
    case null:
      return false;
  }
}

/** Why the stack cannot cast this page as its action (2.6), or null. */
export function creatureCastError(
  stack: BattleStack,
  spell: string,
): string | null {
  const c = casterOf(stack.creature);
  if (!c) return `${stack.creature.id} is not a caster`;
  if (!c.pages.includes(spell))
    return `${stack.creature.id} has no page ${spell}`;
  if (!hasAct(spell)) return `unknown spell ${spell}`;
  if (stack.abilitiesUsed.includes(`page:${spell}`))
    return "this page is spent for the battle";
  return null;
}

/** Pages a creature stack may still cast this battle. */
export function creaturePagesLeft(stack: BattleStack): string[] {
  const c = casterOf(stack.creature);
  if (!c) return [];
  return c.pages.filter((p) => !stack.abilitiesUsed.includes(`page:${p}`));
}
