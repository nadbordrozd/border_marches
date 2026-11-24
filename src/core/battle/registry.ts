/**
 * Content plumbing for the battle grammar (RULES_V2.md 1.3, 1.5, 1.7, 4.6).
 *
 * Content (spells, artifacts, creature abilities, birthrights) plugs in as
 * data plus hook functions, registered here by id:
 *
 * - {@link ConditionKindDef}: a condition kind with the hooks of 1.3.
 * - {@link GroundKindDef}: a ground kind (1.5).
 * - {@link AbilityDef}: a creature ability: passive modifier hooks (the MVP
 *   `ABILITY_HOOKS` shape) plus reaction hooks (1.10).
 * - {@link ActDef}: something chosen with targets: a creature's activated
 *   ability, a hero cast, the Command or an item act (1.7).
 * - {@link EffectFn}: a named list of verbs that scheduled events and
 *   battle-start rules refer to by id (they must stay JSON data).
 *
 * Every hook acts on the board only through {@link Effects}, the verbs of
 * 1.7. Hooks must be pure functions of their arguments (no clocks, no
 * randomness) so the engine stays deterministic.
 *
 * Registries are module-level tables filled at import time by content
 * modules; registering an id twice throws.
 */

import { ABILITY_HOOKS } from "./abilities.ts";
import { STANDARD_CONDITION_KINDS, STANDARD_GROUND_KINDS } from "./standard.ts";
import type { Hex } from "./hex.ts";
import type {
  ActTarget,
  BattleCreatureStats,
  BattleEvent,
  BattleSide,
  BattleStack,
  BattleState,
  Condition,
  ConditionSpec,
  FlatModifier,
  GroundClass,
  GroundFeature,
  GroundSpec,
  JsonValue,
  MultiplierModifier,
  Polarity,
  RefusalReason,
  Remains,
  School,
  StackId,
  StrikeKind,
  StrikeResult,
} from "./types.ts";

/** One strike as the hooks see it. Positions are as at the strike. */
export interface StrikeContext {
  readonly state: BattleState;
  /** The stack dealing the damage (the retaliator, for a retaliation). */
  readonly attacker: BattleStack;
  /** The stack taking the damage. */
  readonly defender: BattleStack;
  readonly kind: StrikeKind;
  /** Hexes the attacker moved this turn before striking (0 otherwise). */
  readonly hexesMoved: number;
}

/** The outcome of putting a condition on a stack (1.3 landing). */
export type LandResult =
  | {
      readonly landed: true;
      readonly merged: boolean;
      readonly uid: number;
    }
  | {
      readonly landed: false;
      readonly reason: RefusalReason;
      readonly detail: string;
    };

/** Options of a Strike a rule describes (1.8). */
export interface StrikeOptions {
  /** Default "special". */
  readonly kind?: "special" | "melee" | "shot";
  /** `special` Strikes are not retaliated unless this says so. */
  readonly retaliable?: boolean;
  /** An extra percentage multiplier on this Strike (inside the P cap). */
  readonly percent?: number;
  readonly label?: string;
}

/**
 * The verbs of RULES_V2 1.7, bound to the battle being resolved. Every
 * call emits events (with their cause and the current rule) and queues the
 * reactions it triggers. Ids name stacks by identity (law 4); sides are
 * read live.
 */
export interface Effects {
  /** A snapshot of the board as it stands now. */
  readonly state: BattleState;
  readonly round: number;
  /** The rule now resolving (ability, condition, act or engine id). */
  readonly rule: string;
  /**
   * The event that triggered the rule now resolving (for a reaction: the
   * Strike, death or landing), or null. Lets X scale with "damage already
   * dealt in this action" (1.8).
   */
  readonly cause: BattleEvent | null;
  stack(id: StackId): BattleStack;
  /** The side a stack fights for right now (law 4). */
  sideOf(id: StackId): BattleSide;
  isAlive(id: StackId): boolean;

  // Damage and healing (1.8, 1.7)
  strike(
    attackerId: StackId,
    targetId: StackId,
    options?: StrikeOptions,
  ): StrikeResult | null;
  harm(
    targetId: StackId,
    x: number,
    options?: { readonly fuelled?: boolean },
  ): number;
  heal(
    targetId: StackId,
    x: number,
    options?: { readonly revive?: boolean },
  ): number;

  // Movement (1.7)
  push(stackId: StackId, awayFrom: Hex, n: number): Hex;
  pull(stackId: StackId, toward: Hex, n: number): Hex;
  teleport(stackId: StackId, to: Hex): boolean;
  swap(a: StackId, b: StackId): boolean;

  // Conditions (1.3, 1.4, 2.7)
  addCondition(targetId: StackId, spec: ConditionSpec): LandResult;
  /** A link: `spec.kind` must be a link kind; near end bears it. */
  link(nearId: StackId, farId: StackId, spec: ConditionSpec): LandResult;
  endCondition(stackId: StackId, uid: number): boolean;
  moveCondition(fromId: StackId, uid: number, toId: StackId): LandResult;
  copyCondition(fromId: StackId, uid: number, toId: StackId): LandResult;
  /** Grow the size by `amount` (default: half, rounded up), to maxSize. */
  feedCondition(stackId: StackId, uid: number, amount?: number): boolean;
  /** Change the clock by `delta` (to at most 9; Holds only shorten). */
  windCondition(stackId: StackId, uid: number, delta: number): boolean;
  /** End it; its bearer takes Harm = charge x rounds left (2.7). */
  setOffCondition(stackId: StackId, uid: number): number;

  // Ground (1.5)
  addGround(spec: GroundSpec, options?: { replaceBlocking?: boolean }): boolean;
  endGround(hex: Hex, options?: { replaceBlocking?: boolean }): boolean;
  /** Consume the remains on a hex; returns what they were. */
  useRemains(hex: Hex): Remains | null;

  // Summon (1.7)
  summon(
    creature: BattleCreatureStats,
    count: number,
    hex: Hex,
    options?: { readonly side?: BattleSide },
  ): StackId | null;

  // Timeline (1.6)
  delay(stackId: StackId, clock?: number): LandResult;
  hasten(stackId: StackId, clock?: number): LandResult;
  extraTurn(stackId: StackId): boolean;
  schedule(event: {
    readonly round: number;
    readonly phase: "start" | "end";
    readonly effect: { readonly id: string; readonly args?: JsonValue };
    readonly side: BattleSide;
    readonly returnsStack?: boolean;
  }): number | null;
  cancel(id: number): boolean;
}

/** A queued reaction: resolves later, in the fixed order of 1.10. */
export type Reaction = (fx: Effects) => void;

// ---------------------------------------------------------------------------
// Condition kinds

export interface ConditionKindDef {
  readonly id: string;
  readonly name: string;
  readonly school: School;
  readonly polarity: Polarity;
  /** Holds (1.9): Frozen, Asleep, Turned and marked content kinds. */
  readonly hold?: boolean;
  /** Marks a link kind; "redirect" carries damage to the far end (1.4). */
  readonly link?: "redirect" | "other";
  /** Timeline class (1.6): "first" (Hastened) or "last" (Delayed). */
  readonly timelineClass?: "first" | "last";
  readonly cannotWait?: boolean;
  /** Holds only. */
  readonly cannotAct?: boolean;
  readonly cannotRetaliate?: boolean;
  readonly cannotShoot?: boolean;
  /** Turned: the bearer fights for the side opposite its owner. */
  readonly turnsSide?: boolean;
  /** Charge = size (Harm per round kinds and debts), else 10 x tier. */
  readonly chargeFromSize?: boolean;
  /** A debt: set off counts one round (2.7). */
  readonly debt?: boolean;
  /** Clock when the rule does not give one (default 3). */
  readonly defaultClock?: number | null;
  readonly defaultSize?: number;
  /** Ends right after the first Strike against the bearer (Frozen). */
  readonly endsWhenStruck?: boolean;
  /** Ends when the bearer loses HP (Asleep). */
  readonly endsOnDamage?: boolean;
  /** One-sentence rule text for tooltips. */
  text(c: Condition): string;

  // Modifier hook (1.3)
  attackModifier?(
    ctx: StrikeContext,
    holder: BattleStack,
    c: Condition,
  ): FlatModifier | null;
  defenseModifier?(
    ctx: StrikeContext,
    holder: BattleStack,
    c: Condition,
  ): FlatModifier | null;
  speedModifier?(holder: BattleStack, c: Condition): number;
  /** A percentage on Strikes the holder deals or takes. */
  strikeMultiplier?(
    ctx: StrikeContext,
    holder: BattleStack,
    c: Condition,
  ): MultiplierModifier | null;
  /** A percentage on Harm the holder takes. */
  harmTakenPercent?(holder: BattleStack, c: Condition): number | null;

  // Time and reaction hooks (1.3, 1.10)
  onTurnStart?(fx: Effects, holder: StackId, c: Condition): void;
  onStrike?(
    ctx: StrikeContext,
    holder: BattleStack,
    c: Condition,
  ): Reaction | null;
  onStruck?(
    ctx: StrikeContext,
    holder: BattleStack,
    c: Condition,
  ): Reaction | null;
  onRoundEnd?(fx: Effects, holder: StackId, c: Condition): void;
  onExpire?(fx: Effects, holder: StackId, c: Condition): void;
}

// ---------------------------------------------------------------------------
// Ground kinds

export interface GroundKindDef {
  readonly id: string;
  readonly name: string;
  readonly class: GroundClass;
  readonly school: School | null;
  readonly defaultClock?: number | null;
  text(f: GroundFeature): string;
  /** Hazards: a stack enters the hex (each hex of a path, in order). */
  onEnter?(fx: Effects, stackId: StackId, f: GroundFeature): void;
  /** Hazards: a stack starts its turn on the hex. */
  onTurnStart?(fx: Effects, stackId: StackId, f: GroundFeature): void;
  /** Surfaces: a flat Defense bonus for the stack standing on it. */
  defenseModifier?(f: GroundFeature): FlatModifier | null;
  /**
   * Surfaces: a percentage on a Strike when the stack standing on it deals
   * (`standing` is the attacker) or takes it (`standing` is the defender).
   */
  strikeMultiplier?(
    ctx: StrikeContext,
    f: GroundFeature,
    standing: BattleStack,
  ): MultiplierModifier | null;
  /** Surfaces: the stack standing on it cannot shoot. */
  readonly cannotShoot?: boolean;
}

// ---------------------------------------------------------------------------
// Abilities

export interface AbilityDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Flat Attack added to `ctx.attacker`. */
  attackModifier?(ctx: StrikeContext, owner: BattleStack): FlatModifier | null;
  /** Flat Defense added to `ctx.defender`. */
  defenseModifier?(ctx: StrikeContext, owner: BattleStack): FlatModifier | null;
  /** A damage multiplier for the strike. */
  damageMultiplier?(
    ctx: StrikeContext,
    owner: BattleStack,
  ): MultiplierModifier | null;
  /** True cancels the defender's retaliation (checked for the melee strike). */
  preventsRetaliation?(ctx: StrikeContext, owner: BattleStack): boolean;
  /** Reaction to any Strike on the field (owner: every living stack). */
  onStrike?(ctx: StrikeContext, owner: BattleStack): Reaction | null;
  /** Reaction to the owner's death or another stack's. */
  onDeath?(deadId: StackId, owner: BattleStack): Reaction | null;
  /** Reaction to a condition landing on any stack (made, moved, copied). */
  onConditionLanded?(
    stackId: StackId,
    c: Condition,
    owner: BattleStack,
  ): Reaction | null;
  /** At the owner's turn start, after ground and conditions. */
  onTurnStart?(fx: Effects, owner: StackId): void;
  /** Activated: the act id (kind "ability") this ability performs. */
  readonly act?: string;
}

// ---------------------------------------------------------------------------
// Acts (activated abilities, hero casts, the Command, item acts)

export interface ActDef {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  readonly kind: "ability" | "cast" | "command" | "item";
  readonly school?: School;
  readonly tier?: number;
  /** Stacks/hexes to choose (shape is checked by `check`). */
  readonly targets: number;
  /**
   * Requirements about who may be chosen (law 3): tested once, when the act
   * is chosen, never again. Returns a refusal message or null. With no
   * check, anything can be chosen (law 5).
   */
  check?(
    state: BattleState,
    actorId: StackId,
    targets: readonly ActTarget[],
  ): string | null;
  resolve(fx: Effects, actorId: StackId, targets: readonly ActTarget[]): void;
}

/** A named effect for scheduled events and battle-start rules. */
export type EffectFn = (
  fx: Effects,
  args: JsonValue | undefined,
  owner: { readonly side: BattleSide; readonly source: string },
) => void;

// ---------------------------------------------------------------------------
// Tables

const conditionKinds = new Map<string, ConditionKindDef>();
const groundKinds = new Map<string, GroundKindDef>();
const abilities = new Map<string, AbilityDef>();
const acts = new Map<string, ActDef>();
const effects = new Map<string, EffectFn>();

function put<T>(table: Map<string, T>, what: string, id: string, def: T): void {
  if (table.has(id)) throw new Error(`${what} ${id} is already registered`);
  table.set(id, def);
}

export function registerConditionKind(def: ConditionKindDef): void {
  put(conditionKinds, "condition kind", def.id, def);
}
export function registerGroundKind(def: GroundKindDef): void {
  put(groundKinds, "ground kind", def.id, def);
}
export function registerAbility(def: AbilityDef): void {
  if (def.id in ABILITY_HOOKS) throw new Error(`ability ${def.id} is built in`);
  put(abilities, "ability", def.id, def);
}
export function registerAct(def: ActDef): void {
  put(acts, "act", def.id, def);
}
export function registerEffect(id: string, fn: EffectFn): void {
  put(effects, "effect", id, fn);
}

for (const k of STANDARD_CONDITION_KINDS) registerConditionKind(k);
for (const g of STANDARD_GROUND_KINDS) registerGroundKind(g);

export function conditionKind(id: string): ConditionKindDef {
  const def = conditionKinds.get(id);
  if (!def) throw new Error(`unknown condition kind ${id}`);
  return def;
}
export function hasConditionKind(id: string): boolean {
  return conditionKinds.has(id);
}
export function groundKind(id: string): GroundKindDef {
  const def = groundKinds.get(id);
  if (!def) throw new Error(`unknown ground kind ${id}`);
  return def;
}
export function ability(id: string): AbilityDef {
  const builtIn = (ABILITY_HOOKS as Readonly<Record<string, AbilityDef>>)[id];
  const def = builtIn ?? abilities.get(id);
  if (!def) throw new Error(`unknown ability ${id}`);
  return def;
}
export function act(id: string): ActDef {
  const def = acts.get(id);
  if (!def) throw new Error(`unknown act ${id}`);
  return def;
}
export function hasAct(id: string): boolean {
  return acts.has(id);
}
export function effect(id: string): EffectFn {
  const fn = effects.get(id);
  if (!fn) throw new Error(`unknown effect ${id}`);
  return fn;
}
export function conditionKindIds(): string[] {
  return [...conditionKinds.keys()];
}
