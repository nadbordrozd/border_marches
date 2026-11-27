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
  CreatureCaster,
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
  SideMagic,
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

/**
 * An area effect (FACTION_GOBLINS 3): a Strike or Harm whose rule names
 * more than one hex. `side` is the side the effect was made by, read when
 * it was made (law 4); `centre` is the hex the rule names.
 */
export interface AreaRef {
  readonly centre: Hex;
  readonly side: BattleSide;
}

/** What a push or pull did to a stack (the "after being moved" reaction). */
export interface MovedInfo {
  readonly state: BattleState;
  readonly stackId: StackId;
  readonly mode: "push" | "pull";
  readonly from: Hex;
  readonly to: Hex;
  /** Hexes actually moved (0 when nothing moved). */
  readonly hexes: number;
  /** The living stack in the next hex that stopped the move, or null. */
  readonly stoppedBy: StackId | null;
}

/** Options of a Strike a rule describes (1.8). */
export interface StrikeOptions {
  /**
   * Default "special". "retaliation" is a retaliation Strike a rule makes
   * (Bodyguard); it never causes a retaliation.
   */
  readonly kind?: "special" | "melee" | "shot" | "retaliation";
  /** The Strike is part of an area effect (Launched reads it). */
  readonly area?: AreaRef;
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
    options?: { readonly fuelled?: boolean; readonly area?: AreaRef },
  ): number;
  /**
   * Heal (1.7). `shared` marks a Heal that arrived through a heal-sharing
   * link (Sworn): it is never shared again.
   */
  heal(
    targetId: StackId,
    x: number,
    options?: { readonly revive?: boolean; readonly shared?: boolean },
  ): number;
  /**
   * The stack spends its retaliation for this round; false when it has
   * none left (Bodyguard).
   */
  spendRetaliation(id: StackId): boolean;
  /** The stack uses one shot; false when it has none left. */
  spendShot(id: StackId): boolean;

  // Movement (1.7)
  push(stackId: StackId, awayFrom: Hex, n: number): Hex;
  /**
   * Pull n hexes toward a hex, stopping next to it. With `reaim` the
   * direction is chosen again at each hex (Reel In, Come In, Dear), so a
   * stack off the six straight lines still ends next to it.
   */
  pull(
    stackId: StackId,
    toward: Hex,
    n: number,
    options?: { readonly reaim?: boolean },
  ): Hex;
  /** Push n hexes in hex direction `dir` (0..5: E, SE, SW, W, NW, NE). */
  pushDir(stackId: StackId, dir: number, n: number): Hex;
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
  /**
   * End it; its bearer takes Harm = perRound x rounds left, counted to at
   * most 3 (a clockless condition counts 3) (2.7).
   */
  setOffCondition(stackId: StackId, uid: number, perRound: number): number;

  // Ground (1.5)
  addGround(spec: GroundSpec, options?: { replaceBlocking?: boolean }): boolean;
  endGround(hex: Hex, options?: { replaceBlocking?: boolean }): boolean;
  /** Consume the remains on a hex; returns what they were. */
  useRemains(hex: Hex): Remains | null;

  /**
   * A dead stack gets up (RULES_V2 3.8, Not Done Yet): it keeps its id and
   * returns with `count` creatures at full HP, no conditions, on `hex` or
   * the nearest free hex, flagged `risen` (it crumbles after the battle).
   * It joins the queue of the current round. Returns false if it cannot.
   */
  getUp(stackId: StackId, count: number, hex: Hex): boolean;
  /** Sets or clears a stack's visible "gets up" badge (One More Time). */
  setGetsUp(stackId: StackId, on: boolean): void;

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

  // Hero rules (RULES_V2 4.6 form 5; core/battle/rules.ts)
  /** Whether the hero of `side` has the battle rule `id`. */
  hasRule(side: BattleSide, id: string): boolean;
  /**
   * Records a once-per-battle use `key` for `side`: true the first time,
   * false once used.
   */
  useRule(side: BattleSide, key: string): boolean;
  /** Changes the hero's battle magic of `side` (item acts, Gleaner). */
  changeMagic(side: BattleSide, change: (m: SideMagic) => SideMagic): boolean;
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
  /**
   * The bearer cannot walk (Stuck): no walk of a move, an attack or an
   * ability, and no rule that replaces its walk (Mist, a Sworn swap).
   * Pushes, pulls, swaps and teleports by other rules still move it.
   */
  readonly cannotWalk?: boolean;
  /** Turned: the bearer fights for the side opposite its owner. */
  readonly turnsSide?: boolean;
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
  /**
   * The bearer was the target of a Heal of `x` (a link kind's heal-sharing
   * hook, RULES_V2 1.4). Not called for Heals that arrived by sharing.
   */
  onHealed?(
    fx: Effects,
    holder: StackId,
    c: Condition,
    x: number,
    revive: boolean,
  ): void;
  /**
   * Links: the far end died and this condition is ending because of it
   * (before it is removed). Chapel of Oaths reads it.
   */
  onFarEndDied?(fx: Effects, holder: StackId, c: Condition): void;
  /**
   * Links: on its turn, in place of its walk, the bearer may swap hexes
   * with the far end (a Move: swap counting 0 hexes; Sworn).
   */
  readonly swapAction?: boolean;
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
  /**
   * At battle start, after the armies' battle-start rules and before
   * Morale and Luck, in field order (Hot from the Oven, The Four O'Clock).
   */
  onBattleStart?(fx: Effects, owner: StackId): void;
  /**
   * The owner takes an extra turn at the end of each round, before the
   * round-end events, if it has had no extra turn this round and bears no
   * Hold; in it, it cannot walk (Afters, FACTION_CANDY 5).
   */
  readonly roundEndTurn?: boolean;
  /**
   * The owner Defends (after its Defend is taken): Stoke (FACTION_DWARVES
   * 3) adds Steam.
   */
  onDefend?(fx: Effects, owner: StackId): void;
  /** Activated: the act id (kind "ability") this ability performs. */
  readonly act?: string;
  /** Activated: usable every turn instead of once per battle (Hurl). */
  readonly everyTurn?: boolean;
  /**
   * Activated, once per battle, but the act's `check` decides whether a
   * further use is allowed (Patch Up with Salvage): the engine does not
   * refuse it as used. Each use is still recorded in `abilitiesUsed`.
   */
  readonly repeatByCheck?: boolean;
  /** Activated: the stack may walk first (`from` on the action). */
  readonly moveFirst?: boolean;
  /** The owner retaliates against every melee attack (Stand Fast). */
  readonly unlimitedRetaliation?: boolean;
  /** The owner's walk is a teleport within its Speed (Mist). */
  readonly teleportWalk?: boolean;
  /**
   * The owner may shoot with an enemy next to it, and none of its Strikes
   * is halved for a shooter in melee (Turret, bends GAME_DESIGN 9.3).
   */
  readonly pointBlank?: boolean;
  /** The owner may walk again after its melee attack (Hit and Run). */
  readonly walkAfterAttack?: number;
  /**
   * The owner's shot may target any hex (`shootHex`); with `shot` the
   * whole shot is this rule (Bomb).
   */
  readonly shootAnyHex?: boolean;
  /** For interfaces only: the hexes a shot centred on `centre` covers. */
  shotArea?(state: BattleState, centre: Hex): Hex[];
  /**
   * Replaces the owner's shot: called with the centre hex and the stack
   * on it (or null). The shot's use is already spent.
   */
  shot?(
    fx: Effects,
    ownerId: StackId,
    centre: Hex,
    target: StackId | null,
  ): void;
  /** The owner ended a walk (its own, not a push) on `hex` (Feast). */
  onWalkEnd?(fx: Effects, ownerId: StackId, hex: Hex): void;
  /** A reaction after the owner was pushed or pulled (Cannonball). */
  onMoved?(info: MovedInfo, owner: BattleStack): Reaction | null;

  // Battle AI hints (core/battle/ai.ts; read only by the AI's evaluation
  // and candidate lists, never by the rules)
  /**
   * The owner pulls a stack next to it in place of an attack (Reel In):
   * its reach in hexes and HP limit against `target`. The AI counts an
   * enemy shooter within the owner's walk plus this range as one it could
   * pull out of shooting, and walks the owner into range before pulling.
   */
  aiPull?(
    owner: BattleStack,
    target: BattleStack,
  ): { readonly range: number; readonly hp: number };
  /**
   * The condition kind the owner's melee Strikes leave on what they strike
   * (Sticky: "stuck"). A shooter such a stack reaches cannot walk clear of
   * it, so the AI counts the shooter's exposure twice.
   */
  readonly aiMeleeMakes?: string;
  /**
   * Remains kinds the owner's `onWalkEnd` feeds on (the Larder: sweets):
   * the AI always tries the owner's walks onto them.
   */
  readonly aiWalkOnto?: readonly string[];
  /**
   * The owner is caught in an area effect: return true to take nothing
   * from it (the hook does what happens instead: Launched).
   */
  onArea?(fx: Effects, ownerId: StackId, area: AreaRef): boolean;
  /**
   * Getting up (RULES_V2 3.8; the engine runs it when the owner dies and
   * leaves remains): "once" returns the stack once per battle (Not Done
   * Yet); "paid" returns it whenever it would not get up otherwise, by
   * consuming the nearest other remains (Long Live the King). The "gets
   * up" badge comes between the two.
   */
  readonly getUp?: "once" | "paid";
  /** When the owner gets up, its remains are not consumed (Spare Parts). */
  readonly keepsRemainsOnGetUp?: boolean;
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
   * With this, between `targets` and `maxTargets` may be chosen, in steps
   * of `targetStep` (default 1): "up to C times, two stacks".
   */
  readonly maxTargets?: (state: BattleState, actorId: StackId) => number;
  readonly targetStep?: number;
  /**
   * For interfaces only (the rules never read it): what each of the first
   * `targets` targets is, repeated in steps of `targetStep` beyond them.
   * "condition" is `{ stack, condition }`. Absent: a stack, or a hex when
   * no stack stands there.
   */
  readonly targetKinds?: readonly ("stack" | "hex" | "condition")[];
  /**
   * For interfaces only: the hexes the act's area covers for these
   * targets (the last one may be the one being aimed), for the outline.
   */
  area?(
    state: BattleState,
    actorId: StackId,
    targets: readonly ActTarget[],
  ): Hex[];
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
  /**
   * Target tuples worth considering, in a fixed order: the battle AI's
   * candidate list (ai.ts). Every tuple still passes `check` before it is
   * used. Absent: the AI tries no targets for a 0-target act and each
   * living stack, then each remains hex, for a 1-target act.
   */
  aiTargets?(
    state: BattleState,
    actorId: StackId,
  ): readonly (readonly ActTarget[])[];
  /**
   * Casts (RULES_V2 2.4): the listed mana cost (default by tier: 4, 7, 10,
   * 14, 20).
   */
  readonly mana?: number;
  /** Casts: the spell marks a size, so Fuel can double it (2.4). */
  readonly sized?: boolean;
  /**
   * Casts: the stacks the spell touches (chosen and caught in its area),
   * for Echo and Fuel (2.4). Default: the stacks named by the targets.
   */
  touches?(
    state: BattleState,
    actorId: StackId,
    targets: readonly ActTarget[],
  ): StackId[];
  /**
   * `cast` is given for spells (hero pages, scrolls and creature casters):
   * the effective Power and whether Fuel doubled the size.
   */
  resolve(
    fx: Effects,
    actorId: StackId,
    targets: readonly ActTarget[],
    cast?: CastContext,
  ): void;
}

/** How a spell is being cast (RULES_V2 2.4 to 2.6). */
export interface CastContext {
  /** Effective Power, 0 to 30. */
  readonly power: number;
  /** Fuel was burnt: the spell's marked size is doubled. */
  readonly fuelled: boolean;
  readonly by: "page" | "scroll" | "creature";
  /** The side the spell is cast for (read at the cast). */
  readonly side: BattleSide;
  /** What Fuel multiplies the size by: 2, or 3 with Bonfire. */
  readonly fuelFactor?: number;
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
export function actIds(): string[] {
  return [...acts.keys()];
}

// ---------------------------------------------------------------------------
// Creature casters (RULES_V2 2.6)

const casters = new Map<string, CreatureCaster>();

/**
 * The faction hook for creature casters: the creature `creatureId` may cast
 * these pages (at most two). A creature's own `caster` field wins.
 */
export function registerCreatureCaster(
  creatureId: string,
  caster: CreatureCaster,
): void {
  if (caster.pages.length < 1 || caster.pages.length > 2)
    throw new Error(`creature caster ${creatureId}: one or two pages`);
  if (caster.castDivisor < 1)
    throw new Error(`creature caster ${creatureId}: castDivisor >= 1`);
  put(casters, "creature caster", creatureId, caster);
}

/** The pages of a creature, or null when it is not a caster. */
export function casterOf(creature: BattleCreatureStats): CreatureCaster | null {
  return creature.caster ?? casters.get(creature.id) ?? null;
}

export function hasGroundKind(id: string): boolean {
  return groundKinds.has(id);
}
/** Every registered ground kind id, in registration order (the gallery). */
export function groundKindIds(): string[] {
  return [...groundKinds.keys()];
}
export function hasAbility(id: string): boolean {
  return id in ABILITY_HOOKS || abilities.has(id);
}
