/**
 * The resolver of the battle grammar (RULES_V2.md 1.2 to 1.11): a
 * copy-on-write working copy of a battle state ({@link Draft}) and the verbs
 * of 1.7 acting on it, with the landing rules of conditions, links, ground,
 * the timeline verbs, Strike and Harm, death and the reaction queue.
 *
 * Every change emits an event carrying its index, its cause (the event that
 * triggered it) and the rule that produced it, so a rehearsal of an action
 * is exactly the chain the real action emits.
 */

import {
  ability,
  conditionKind,
  effect,
  groundKind,
  registerEffect,
} from "./registry.ts";
import type {
  AreaRef,
  ConditionKindDef,
  Effects,
  LandResult,
  MovedInfo,
  Reaction,
  StrikeContext,
  StrikeOptions,
} from "./registry.ts";
import { isAlive } from "./abilities.ts";
import {
  adjacentStacks,
  hasRule,
  nearestStack,
  retaliationLimit,
} from "./rules.ts";
import {
  applyDamageToStack,
  computeDamage,
  creatureFightValue,
  computeHarm,
  defendedDefense,
  totalHp,
} from "./damage.ts";
import {
  BATTLE_HEX_COUNT,
  directionToward,
  hexDistance,
  hexFromIndex,
  hexIndex,
  inBounds,
  isAdjacent,
  sameHex,
  stepHex,
} from "./hex.ts";
import type { Hex } from "./hex.ts";
import type {
  BattleCreatureStats,
  BattleEvent,
  BattleEventBody,
  BattleSide,
  BattleSideState,
  BattleStack,
  BattleState,
  Condition,
  ConditionSpec,
  DamageBreakdown,
  EndReason,
  FlatModifier,
  GroundFeature,
  GroundSpec,
  MultiplierModifier,
  RefusalReason,
  Remains,
  ScheduledEvent,
  School,
  SideMagic,
  StackId,
  StrikeKind,
  StrikeResult,
} from "./types.ts";

/**
 * Who is acting now, for rules that read "your page", "your side makes"
 * (hero rules, core/battle/rules.ts): set while a hero act, a creature
 * cast or a battle-start rule resolves.
 */
export interface Acting {
  readonly side: BattleSide;
  readonly by: "page" | "scroll" | "creature" | "item" | "command" | "rule";
  readonly school: School | null;
  /** Fuel's factor for this cast (2, or 3 with Bonfire). */
  readonly fuelFactor: number;
}

// ---------------------------------------------------------------------------
// Caps (RULES_V2 1.11)

export const MAX_CONDITIONS = 6;
export const MAX_CLOCK = 9;
export const MAX_HOLD_CLOCK = 2;
export const MAX_SCHEDULED = 12;
export const MAX_REACTION_STEPS = 64;
export const MAX_LIVING_STACKS_PER_SIDE = 10;
export const MIN_SPEED = 1;
export const MAX_SPEED = 12;
export const ROUND_LIMIT = 15;

/** The battle's round limit (RULES_V2 1.12). */
export function roundLimitOf(state: {
  readonly roundLimit?: number | undefined;
}): number {
  return state.roundLimit ?? ROUND_LIMIT;
}

/**
 * Fight value a side has left (RULES_V2 1.12, the round-limit verdict):
 * per living stack it owns that is not summoned, the creature's fight value
 * (GAME_DESIGN 8.2, base stats) x the stack's HP left / the creature's HP,
 * rounded down. Ownership counts, as for losing: a Turned stack counts for
 * its owner.
 */
export function fightValueLeft(
  state: { readonly stacks: readonly BattleStack[] },
  side: BattleSide,
): number {
  let total = 0;
  for (const s of state.stacks) {
    if (s.owner !== side || s.summoned || !isAlive(s)) continue;
    const hp = totalHp({
      count: s.count,
      hp: s.creature.hp,
      topHp: s.topHp,
    });
    total += Math.floor(
      (creatureFightValue(s.creature) * hp) / Math.max(1, s.creature.hp),
    );
  }
  return total;
}

/**
 * Who wins if the round limit is reached as the board stands: the side
 * with more fight value left; a tie goes to the defender.
 */
export function roundLimitWinner(state: {
  readonly stacks: readonly BattleStack[];
}): BattleSide {
  return fightValueLeft(state, "attacker") > fightValueLeft(state, "defender")
    ? "attacker"
    : "defender";
}

export function enemySide(side: BattleSide): BattleSide {
  return side === "attacker" ? "defender" : "attacker";
}

/** The side a stack fights for: its owner, or the other side while Turned. */
export function sideOf(stack: BattleStack): BattleSide {
  const turned = stack.conditions.some((c) => conditionKind(c.kind).turnsSide);
  return turned ? enemySide(stack.owner) : stack.owner;
}

export function isRangedCreature(creature: BattleCreatureStats): boolean {
  return (creature.shots ?? 0) > 0;
}

/** Any of the stack's conditions has this flag. */
export function bears(
  stack: BattleStack,
  flag: keyof Pick<
    ConditionKindDef,
    "cannotAct" | "cannotRetaliate" | "cannotShoot" | "cannotWait" | "hold"
  >,
): boolean {
  return stack.conditions.some((c) => conditionKind(c.kind)[flag] === true);
}

/** Timeline class (1.6): 0 Hastened, 1 normal, 2 Delayed (Delayed wins). */
export function timelineClass(stack: BattleStack): 0 | 1 | 2 {
  let cls: 0 | 1 | 2 = 1;
  for (const c of stack.conditions) {
    const t = conditionKind(c.kind).timelineClass;
    if (t === "last") return 2;
    if (t === "first") cls = 0;
  }
  return cls;
}

/** Effective Speed: creature Speed plus condition modifiers, 1 to 12. */
export function effectiveSpeed(stack: BattleStack): number {
  let speed = stack.creature.speed;
  for (const c of stack.conditions) {
    speed += conditionKind(c.kind).speedModifier?.(stack, c) ?? 0;
  }
  return Math.max(MIN_SPEED, Math.min(MAX_SPEED, speed));
}

export function stackTotalHp(stack: BattleStack): number {
  return totalHp({
    count: stack.count,
    hp: stack.creature.hp,
    topHp: stack.topHp,
  });
}

/** Hex indexes nothing may enter: blocking ground. */
export function blockingHexes(state: {
  readonly ground: readonly GroundFeature[];
}): Hex[] {
  return state.ground.filter((g) => g.class === "blocking").map((g) => g.hex);
}

export function groundAt(
  state: { readonly ground: readonly GroundFeature[] },
  h: Hex,
): GroundFeature | null {
  return state.ground.find((g) => sameHex(g.hex, h)) ?? null;
}

// ---------------------------------------------------------------------------
// Strike maths (1.8)

function sum(mods: readonly FlatModifier[]): number {
  return mods.reduce((t, m) => t + m.amount, 0);
}

/** Keeps every modifier without a stackKey and the largest of each key. */
function dedupeFlat(mods: readonly FlatModifier[]): FlatModifier[] {
  const out: FlatModifier[] = [];
  const bestByKey = new Map<string, number>();
  for (const m of mods) {
    if (m.stackKey === undefined) {
      out.push(m);
      continue;
    }
    const i = bestByKey.get(m.stackKey);
    if (i === undefined) {
      bestByKey.set(m.stackKey, out.length);
      out.push(m);
    } else if (m.amount > (out[i] as FlatModifier).amount) {
      out[i] = m;
    }
  }
  return out;
}

function* abilityOwners(
  state: BattleState,
): Generator<readonly [ReturnType<typeof ability>, BattleStack]> {
  for (const s of state.stacks) {
    if (!isAlive(s)) continue;
    for (const id of s.creature.abilities) yield [ability(id), s] as const;
  }
}

function* conditionHolders(
  ctx: StrikeContext,
): Generator<readonly [ConditionKindDef, BattleStack, Condition]> {
  for (const holder of [ctx.attacker, ctx.defender]) {
    for (const c of holder.conditions)
      yield [conditionKind(c.kind), holder, c] as const;
  }
}

export function collectAttackModifiers(ctx: StrikeContext): FlatModifier[] {
  const mods: FlatModifier[] = [];
  for (const [def, owner] of abilityOwners(ctx.state)) {
    const m = def.attackModifier?.(ctx, owner);
    if (m) mods.push(m);
  }
  for (const [def, holder, c] of conditionHolders(ctx)) {
    const m = def.attackModifier?.(ctx, holder, c);
    if (m) mods.push(m);
  }
  return dedupeFlat(mods);
}

export function collectDefenseModifiers(ctx: StrikeContext): FlatModifier[] {
  const mods: FlatModifier[] = [];
  for (const [def, owner] of abilityOwners(ctx.state)) {
    const m = def.defenseModifier?.(ctx, owner);
    if (m) mods.push(m);
  }
  for (const [def, holder, c] of conditionHolders(ctx)) {
    const m = def.defenseModifier?.(ctx, holder, c);
    if (m) mods.push(m);
  }
  const g = groundAt(ctx.state, ctx.defender.hex);
  if (g) {
    const m = groundKind(g.kind).defenseModifier?.(g);
    if (m) mods.push(m);
  }
  return dedupeFlat(mods);
}

export function collectDamageMultipliers(
  ctx: StrikeContext,
): MultiplierModifier[] {
  const mods: MultiplierModifier[] = [];
  for (const [def, owner] of abilityOwners(ctx.state)) {
    const m = def.damageMultiplier?.(ctx, owner);
    if (m) mods.push(m);
  }
  for (const [def, holder, c] of conditionHolders(ctx)) {
    const m = def.strikeMultiplier?.(ctx, holder, c);
    if (m) mods.push(m);
  }
  for (const standing of [ctx.attacker, ctx.defender]) {
    const g = groundAt(ctx.state, standing.hex);
    if (!g) continue;
    const m = groundKind(g.kind).strikeMultiplier?.(ctx, g, standing);
    if (m) mods.push(m);
  }
  return mods;
}

/**
 * Hero rules that cancel a retaliation: Peace Dividend (Strikes by the
 * side against a Mollified stack) and Gag Rule (Hushed enemy stacks).
 */
export function ruleBarsRetaliation(
  state: Pick<BattleState, "sides">,
  ctx: StrikeContext,
): boolean {
  const bearsKind = (kind: string): boolean =>
    ctx.defender.conditions.some((c) => c.kind === kind);
  if (
    bearsKind("mollified") &&
    hasRule(state, ctx.attacker.side, "peace-dividend")
  )
    return true;
  const foes = ctx.defender.side === "attacker" ? "defender" : "attacker";
  return bearsKind("hushed") && hasRule(state, foes, "gag-rule");
}

/**
 * Hero rules that make a stack take no Harm from the rule now resolving:
 * Mirror Ward (Warded, from ground), Firewalkers (Fired Up, from Burning
 * or fire) and Vow of the Pyre (the side's own Storm pages).
 */
function harmSpared(d: Draft, target: BattleStack): boolean {
  const side = target.side;
  const bearsKind = (kind: string): boolean =>
    target.conditions.some((c) => c.kind === kind);
  const rule = d.rule;
  if (
    rule.startsWith("ground:") &&
    bearsKind("warded") &&
    hasRule(d, side, "mirror-ward")
  )
    return true;
  if (
    (rule === "condition:burning" || rule === "ground:fire") &&
    bearsKind("fired-up") &&
    hasRule(d, side, "firewalkers")
  )
    return true;
  const a = d.acting;
  return (
    a !== null &&
    a.by === "page" &&
    a.school === "storm" &&
    a.side === side &&
    hasRule(d, side, "storm-spares-own")
  );
}

export function retaliationPrevented(ctx: StrikeContext): boolean {
  for (const [def, owner] of abilityOwners(ctx.state)) {
    if (def.preventsRetaliation?.(ctx, owner)) return true;
  }
  return false;
}

/** The full damage computation for one strike (no state change). */
export function computeBreakdown(
  ctx: StrikeContext,
  extra: readonly MultiplierModifier[] = [],
): DamageBreakdown {
  const { state, attacker, defender, kind } = ctx;
  const heroAttack = state.sides[attacker.side].hero?.attack ?? 0;
  const attackModifiers = collectAttackModifiers(ctx);
  const attack = Math.max(
    0,
    attacker.creature.attack + heroAttack + sum(attackModifiers),
  );

  const defSide = state.sides[defender.side];
  const heroDefense = defSide.hero?.defense ?? 0;
  const defenseModifiers: FlatModifier[] = [];
  if (defSide.defenseBonus !== 0) {
    defenseModifiers.push({
      source: "fortified",
      label: "Fortified",
      amount: defSide.defenseBonus,
    });
  }
  defenseModifiers.push(...collectDefenseModifiers(ctx));
  const defenseBeforeDefend = Math.max(
    0,
    defender.creature.defense + heroDefense + sum(defenseModifiers),
  );
  const defense = defender.defending
    ? defendedDefense(defenseBeforeDefend)
    : defenseBeforeDefend;

  const abilityMultipliers = [...collectDamageMultipliers(ctx), ...extra];
  const rangedInMelee =
    isRangedCreature(attacker.creature) &&
    (kind === "melee" || kind === "retaliation");
  const { damage, multiplier, percentProduct, percentCapped } = computeDamage({
    count: attacker.count,
    damagePerCreature: attacker.creature.damage,
    attack,
    defense,
    percents: abilityMultipliers.map((m) => m.percent),
    halved: rangedInMelee,
  });
  return {
    kind,
    count: attacker.count,
    damagePerCreature: attacker.creature.damage,
    baseAttack: attacker.creature.attack,
    heroAttack,
    attackModifiers,
    attack,
    baseDefense: defender.creature.defense,
    heroDefense,
    defenseModifiers,
    defenseBeforeDefend,
    defending: defender.defending,
    defense,
    multiplier,
    abilityMultipliers,
    percentProduct,
    percentCapped,
    rangedInMelee,
    damage,
  };
}

// ---------------------------------------------------------------------------
// The draft

interface PendingReaction {
  readonly key: string;
  readonly ownerId: StackId;
  readonly onDeath: boolean;
  readonly cause: number;
  readonly rule: string;
  readonly fire: Reaction;
  /** Sort key within one flush: group, timeline position, sub, order. */
  readonly sortKey: readonly number[];
}

/** One step's scope for the reaction rules of 1.10. */
interface StepScope {
  readonly actorId: StackId | null;
  readonly targetIds: readonly StackId[];
}

const NO_SCOPE: StepScope = { actorId: null, targetIds: [] };

/** Copy-on-write working copy of a state, with the event log. */
export class Draft {
  readonly seed: number;
  stacks: BattleStack[];
  ground: GroundFeature[];
  sides: { [S in BattleSide]: BattleSideState };
  round: number;
  queue: StackId[];
  waiting: StackId[];
  extraTurns: StackId[];
  activeStackId: StackId | null;
  winner: BattleSide | null;
  endReason: EndReason | null;
  scheduled: ScheduledEvent[];
  nextUid: number;
  readonly laws: readonly string[];
  readonly roundLimit: number | undefined;
  readonly events: BattleEvent[] = [];
  /** The hero act or rule resolving now (see {@link Acting}). */
  acting: Acting | null = null;

  private readonly index = new Map<StackId, number>();
  private readonly causes: number[] = [];
  private readonly rules: string[] = [];
  private scope: StepScope = NO_SCOPE;
  private pending: PendingReaction[] = [];
  private incoming: PendingReaction[] = [];
  private fired = new Set<string>();
  private steps = 0;
  private seq = 0;

  constructor(state: BattleState) {
    this.seed = state.seed;
    this.stacks = state.stacks.slice();
    this.ground = state.ground.slice();
    this.sides = { ...state.sides };
    this.round = state.round;
    this.queue = state.queue.slice();
    this.waiting = state.waiting.slice();
    this.extraTurns = state.extraTurns.slice();
    this.activeStackId = state.activeStackId;
    this.winner = state.winner;
    this.endReason = state.endReason;
    this.scheduled = state.scheduled.slice();
    this.nextUid = state.nextUid;
    this.laws = state.laws;
    this.roundLimit = state.roundLimit;
    this.stacks.forEach((s, i) => this.index.set(s.id, i));
  }

  has(id: StackId): boolean {
    return this.index.has(id);
  }

  get(id: StackId): BattleStack {
    const i = this.index.get(id);
    if (i === undefined) throw new Error(`no stack ${id}`);
    return this.stacks[i] as BattleStack;
  }

  /** Stores a stack, recomputing its derived side. */
  set(stack: BattleStack): BattleStack {
    const i = this.index.get(stack.id);
    if (i === undefined) throw new Error(`no stack ${stack.id}`);
    const side = sideOf(stack);
    const next = side === stack.side ? stack : { ...stack, side };
    this.stacks[i] = next;
    return next;
  }

  add(stack: BattleStack): void {
    this.index.set(stack.id, this.stacks.length);
    this.stacks.push(stack);
  }

  update(id: StackId, patch: Partial<BattleStack>): BattleStack {
    return this.set({ ...this.get(id), ...patch });
  }

  uid(): number {
    return this.nextUid++;
  }

  toState(): BattleState {
    return {
      seed: this.seed,
      ground: this.ground.slice(),
      sides: { ...this.sides },
      stacks: this.stacks.slice(),
      round: this.round,
      queue: this.queue.slice(),
      waiting: this.waiting.slice(),
      extraTurns: this.extraTurns.slice(),
      activeStackId: this.activeStackId,
      winner: this.winner,
      endReason: this.endReason,
      scheduled: this.scheduled.slice(),
      nextUid: this.nextUid,
      laws: this.laws,
      ...(this.roundLimit !== undefined ? { roundLimit: this.roundLimit } : {}),
    };
  }

  // --- events ------------------------------------------------------------

  get rule(): string {
    return this.rules[this.rules.length - 1] ?? "engine";
  }

  /** The event the current rule was triggered by, or null. */
  get cause(): BattleEvent | null {
    const i = this.causes[this.causes.length - 1];
    return i === undefined ? null : (this.events[i] ?? null);
  }

  emit(body: BattleEventBody, rule?: string): number {
    const index = this.events.length;
    const cause = this.causes[this.causes.length - 1] ?? null;
    this.events.push({ ...body, index, cause, rule: rule ?? this.rule });
    return index;
  }

  /** Runs `fn` with events caused by `cause` and produced by `rule`. */
  within<T>(cause: number | null, rule: string | null, fn: () => T): T {
    if (cause !== null) this.causes.push(cause);
    if (rule !== null) this.rules.push(rule);
    try {
      return fn();
    } finally {
      if (cause !== null) this.causes.pop();
      if (rule !== null) this.rules.pop();
    }
  }

  // --- reactions (1.10) ----------------------------------------------------

  /** Starts a step (action, turn start, scheduled event, round end). */
  beginStep(scope: StepScope = NO_SCOPE): void {
    this.scope = scope;
    this.pending = [];
    this.incoming = [];
    this.fired = new Set();
    this.steps = 0;
  }

  /** Field order and timeline order positions. */
  private timelinePos(id: StackId): number {
    const order = [
      ...(this.activeStackId ? [this.activeStackId] : []),
      ...this.queue,
      ...this.waiting,
    ];
    const i = order.indexOf(id);
    return i >= 0 ? i : order.length + (this.index.get(id) ?? 0);
  }

  /**
   * Queues a reaction of `ownerId` under `rule` triggered by event `cause`.
   * `sub` orders within the owner (on-being-struck 0, retaliation 1).
   */
  trigger(
    ownerId: StackId,
    rule: string,
    cause: number,
    fire: Reaction,
    opts: { sub?: number; order?: number; onDeath?: boolean } = {},
  ): void {
    const key = `${rule}@${ownerId}`;
    if (this.fired.has(key)) return;
    if (this.pending.some((p) => p.key === key)) return;
    if (this.incoming.some((p) => p.key === key)) return;
    const group =
      ownerId === this.scope.actorId
        ? 1
        : this.scope.targetIds.includes(ownerId)
          ? 2
          : 3;
    this.incoming.push({
      key,
      ownerId,
      onDeath: opts.onDeath ?? false,
      cause,
      rule,
      fire,
      sortKey: [
        group,
        group === 1 ? 0 : this.timelinePos(ownerId),
        opts.sub ?? 0,
        opts.order ?? 0,
        this.seq++,
      ],
    });
  }

  private flush(): void {
    if (this.incoming.length === 0) return;
    const batch = this.incoming.sort((a, b) => {
      for (let i = 0; i < a.sortKey.length; i++) {
        const d = (a.sortKey[i] as number) - (b.sortKey[i] as number);
        if (d !== 0) return d;
      }
      return 0;
    });
    this.incoming = [];
    this.pending.push(...batch);
  }

  /** Drops a dead stack's pending reactions, except its on-death ones. */
  dropReactionsOf(id: StackId): void {
    this.pending = this.pending.filter((p) => p.ownerId !== id || p.onDeath);
    this.incoming = this.incoming.filter((p) => p.ownerId !== id || p.onDeath);
  }

  /**
   * Resolves pending reactions one at a time (1.10). `afterEach` runs the
   * battle-end test; a decided battle stops the chain.
   */
  resolveReactions(fx: Effects, afterEach: () => boolean): void {
    this.flush();
    while (this.pending.length > 0) {
      const p = this.pending.shift() as PendingReaction;
      const owner = this.get(p.ownerId);
      if (!isAlive(owner) && !p.onDeath) continue;
      this.fired.add(p.key);
      this.steps++;
      if (this.steps > MAX_REACTION_STEPS) {
        this.emit(
          {
            type: "contentError",
            message: `reaction chain cut after ${MAX_REACTION_STEPS} steps`,
          },
          "engine:hard-stop",
        );
        this.pending = [];
        this.incoming = [];
        return;
      }
      this.within(p.cause, p.rule, () => p.fire(fx));
      if (afterEach()) {
        this.pending = [];
        this.incoming = [];
        return;
      }
      this.flush();
    }
  }
}

// ---------------------------------------------------------------------------
// The verbs (1.7) on a draft

function removeFromTurnLists(d: Draft, id: StackId): void {
  d.queue = d.queue.filter((x) => x !== id);
  d.waiting = d.waiting.filter((x) => x !== id);
  d.extraTurns = d.extraTurns.filter((x) => x !== id);
}

function stackAt(d: Draft, h: Hex): BattleStack | null {
  return d.stacks.find((s) => isAlive(s) && sameHex(s.hex, h)) ?? null;
}

function isBlocked(d: Draft, h: Hex): boolean {
  return groundAt(d, h)?.class === "blocking";
}

function isFree(d: Draft, h: Hex): boolean {
  return inBounds(h) && !isBlocked(d, h) && stackAt(d, h) === null;
}

function redirectLinkOf(stack: BattleStack): Condition | null {
  for (const c of stack.conditions) {
    if (c.link !== null && conditionKind(c.kind).link === "redirect") return c;
  }
  return null;
}

function describeGate(c: Condition, target: BattleStack): string {
  if (!c.gate) return "";
  return c.gate.measure === "hp"
    ? `gate ${c.gate.max} HP, target has ${stackTotalHp(target)}`
    : `gate tier ${c.gate.max}, target is tier ${target.creature.tier}`;
}

/** Builds a condition from a spec and its kind (not yet on any stack). */
export function makeCondition(
  spec: ConditionSpec,
  uid: number,
  source: string,
): Condition {
  const def = conditionKind(spec.kind);
  const size = spec.size ?? def.defaultSize ?? 0;
  const rawClock =
    spec.clock !== undefined
      ? spec.clock
      : def.defaultClock !== undefined
        ? def.defaultClock
        : 3;
  const clock =
    rawClock === null ? null : Math.max(1, Math.min(MAX_CLOCK, rawClock));
  return {
    uid,
    kind: def.id,
    school: def.school,
    polarity: def.polarity,
    size,
    maxSize: spec.maxSize ?? 3 * size,
    clock,
    gate: spec.gate ?? null,
    charge: def.chargeFromSize ? size : (spec.charge ?? 10 * (spec.tier ?? 1)),
    hold: def.hold === true,
    link: spec.link ?? null,
    source: spec.source ?? source,
    roundsBorne: 0,
  };
}

/** The verbs, bound to one draft. */
export class Resolver implements Effects {
  constructor(
    readonly d: Draft,
    /** The battle-end test; true once the battle is decided. */
    readonly checkEnd: () => boolean,
  ) {}

  get state(): BattleState {
    return this.d.toState();
  }
  get round(): number {
    return this.d.round;
  }
  get rule(): string {
    return this.d.rule;
  }
  get cause(): BattleEvent | null {
    return this.d.cause;
  }
  stack(id: StackId): BattleStack {
    return this.d.get(id);
  }
  sideOf(id: StackId): BattleSide {
    return this.d.get(id).side;
  }
  isAlive(id: StackId): boolean {
    return this.d.has(id) && isAlive(this.d.get(id));
  }

  /** Resolves the reactions queued so far (end of a step). */
  resolveReactions(): void {
    this.d.resolveReactions(this, this.checkEnd);
  }

  // --- Strike ------------------------------------------------------------

  /**
   * One Strike (1.8): computed against the target in full; a redirect link
   * on the target carries the number to its far end as Harm.
   */
  strikeKind(
    attackerId: StackId,
    targetId: StackId,
    kind: StrikeKind,
    hexesMoved: number,
    options: StrikeOptions = {},
  ): StrikeResult | null {
    const d = this.d;
    if (!this.isAlive(attackerId) || !this.isAlive(targetId)) return null;
    if (options.area && this.intercepted(targetId, options.area)) return null;
    const ctx: StrikeContext = {
      state: d.toState(),
      attacker: d.get(attackerId),
      defender: d.get(targetId),
      kind,
      hexesMoved,
    };
    const extra: MultiplierModifier[] =
      options.percent !== undefined
        ? [
            {
              source: d.rule,
              label: options.label ?? d.rule,
              percent: options.percent,
            },
          ]
        : [];
    const breakdown = computeBreakdown(ctx, extra);
    const target = ctx.defender;
    const link = redirectLinkOf(target);
    let result: StrikeResult;
    let idx: number;
    if (link && link.link !== null && this.isAlive(link.link)) {
      const far = link.link;
      idx = d.emit({
        type: "damage",
        sourceId: attackerId,
        targetId,
        kind,
        damage: breakdown.damage,
        kills: 0,
        hpLost: 0,
        countAfter: target.count,
        topHpAfter: target.topHp,
        breakdown,
        redirectedTo: far,
      });
      result = {
        attackerId,
        targetId,
        kind,
        breakdown,
        damage: breakdown.damage,
        kills: 0,
        hpLost: 0,
        targetCountAfter: target.count,
        targetTopHpAfter: target.topHp,
        redirectedTo: far,
      };
      d.within(idx, link.kind, () =>
        this.transfer(targetId, far, link.kind, breakdown.damage),
      );
    } else {
      const res = applyDamageToStack(
        { count: target.count, hp: target.creature.hp, topHp: target.topHp },
        breakdown.damage,
      );
      d.update(targetId, { count: res.count, topHp: res.topHp });
      idx = d.emit({
        type: "damage",
        sourceId: attackerId,
        targetId,
        kind,
        damage: breakdown.damage,
        kills: res.kills,
        hpLost: res.hpLost,
        countAfter: res.count,
        topHpAfter: res.topHp,
        breakdown,
        redirectedTo: null,
      });
      result = {
        attackerId,
        targetId,
        kind,
        breakdown,
        damage: breakdown.damage,
        kills: res.kills,
        hpLost: res.hpLost,
        targetCountAfter: res.count,
        targetTopHpAfter: res.topHp,
        redirectedTo: null,
      };
      d.within(idx, null, () => {
        if (res.count === 0) this.kill(targetId);
        else if (res.hpLost > 0) this.endOnDamage(targetId);
      });
    }
    // Frozen: the first Strike against it ends it.
    if (this.isAlive(targetId)) {
      d.within(idx, null, () => {
        for (const c of d.get(targetId).conditions) {
          const def = conditionKind(c.kind);
          if (def.endsWhenStruck)
            d.within(null, def.id, () => this.end(targetId, c.uid, "ended"));
        }
      });
    }
    this.queueStrikeReactions(ctx, idx, options);
    return result;
  }

  /**
   * An area effect reaches a stack: its abilities' `onArea` hooks may take
   * it instead (Launched). True when the stack takes nothing from it.
   */
  private intercepted(targetId: StackId, area: AreaRef): boolean {
    const d = this.d;
    const target = d.get(targetId);
    for (const id of target.creature.abilities) {
      const def = ability(id);
      if (!def.onArea) continue;
      const taken = d.within(null, `ability:${id}`, () =>
        def.onArea?.(this, targetId, area),
      );
      if (taken === true) return true;
    }
    return false;
  }

  private queueStrikeReactions(
    ctx: StrikeContext,
    idx: number,
    options: StrikeOptions,
  ): void {
    const d = this.d;
    // Abilities of every living stack (the hook decides whose strike it is).
    for (const s of d.stacks) {
      if (!isAlive(s) && s.id !== ctx.attacker.id) continue;
      s.creature.abilities.forEach((id, order) => {
        const r = ability(id).onStrike?.(ctx, s);
        if (r) d.trigger(s.id, `ability:${id}`, idx, r, { order });
      });
    }
    // The striker's conditions (on strike), the target's (on being struck).
    ctx.attacker.conditions.forEach((c, order) => {
      const r = conditionKind(c.kind).onStrike?.(ctx, ctx.attacker, c);
      if (r)
        d.trigger(ctx.attacker.id, `condition:${c.kind}`, idx, r, {
          order: 100 + order,
        });
    });
    ctx.defender.conditions.forEach((c, order) => {
      const r = conditionKind(c.kind).onStruck?.(ctx, ctx.defender, c);
      if (r)
        d.trigger(ctx.defender.id, `condition:${c.kind}`, idx, r, {
          sub: 0,
          order: 100 + order,
        });
    });
    // Retaliation: a reaction of the target, after its on-being-struck.
    const retaliable =
      ctx.kind === "melee" ||
      (ctx.kind === "special" && options.retaliable === true);
    // A stack that cannot retaliate when struck (a Hold, Jinxed) does not,
    // even if the Strike ends that condition (Frozen thaws).
    if (
      retaliable &&
      !retaliationPrevented(ctx) &&
      !bears(ctx.defender, "cannotRetaliate") &&
      !ruleBarsRetaliation(d, ctx)
    ) {
      const targetId = ctx.defender.id;
      const attackerId = ctx.attacker.id;
      d.trigger(
        targetId,
        "retaliation",
        idx,
        () => this.retaliate(targetId, attackerId),
        { sub: 1 },
      );
    }
  }

  /** Whether a stack retaliates against every melee attack (Stand Fast). */
  private unlimited(stack: BattleStack): boolean {
    return stack.creature.abilities.some(
      (id) => ability(id).unlimitedRetaliation === true,
    );
  }

  private retaliate(retaliatorId: StackId, targetId: StackId): void {
    const d = this.d;
    if (!this.isAlive(retaliatorId) || !this.isAlive(targetId)) return;
    const r = d.get(retaliatorId);
    if (bears(r, "cannotRetaliate")) return;
    // Riposte and Shield Wall raise the limit (core/battle/rules.ts).
    const made = r.retaliationsThisRound ?? (r.retaliatedThisRound ? 1 : 0);
    if (made >= retaliationLimit(d, r) && !this.unlimited(r)) return;
    // A retaliation needs its target adjacent when it resolves (a push in
    // between, e.g. Follow Through, cancels it).
    if (!isAdjacent(r.hex, d.get(targetId).hex)) return;
    d.update(retaliatorId, {
      retaliatedThisRound: true,
      retaliationsThisRound: made + 1,
    });
    const idx = d.emit({
      type: "retaliation",
      stackId: retaliatorId,
      targetId,
    });
    d.within(idx, null, () =>
      this.strikeKind(retaliatorId, targetId, "retaliation", 0),
    );
  }

  spendShot(id: StackId): boolean {
    if (!this.isAlive(id)) return false;
    const s = this.d.get(id);
    if (s.shotsLeft <= 0) return false;
    this.d.update(id, { shotsLeft: s.shotsLeft - 1 });
    return true;
  }

  spendRetaliation(id: StackId): boolean {
    if (!this.isAlive(id)) return false;
    const s = this.d.get(id);
    if (bears(s, "cannotRetaliate")) return false;
    if (s.retaliatedThisRound && !this.unlimited(s)) return false;
    this.d.update(id, { retaliatedThisRound: true });
    return true;
  }

  strike(
    attackerId: StackId,
    targetId: StackId,
    options: StrikeOptions = {},
  ): StrikeResult | null {
    return this.strikeKind(
      attackerId,
      targetId,
      options.kind ?? "special",
      0,
      options,
    );
  }

  // --- Harm --------------------------------------------------------------

  harm(
    targetId: StackId,
    x: number,
    options: { readonly fuelled?: boolean; readonly area?: AreaRef } = {},
  ): number {
    if (!this.isAlive(targetId)) return 0;
    if (options.area && this.intercepted(targetId, options.area)) return 0;
    return this.harmInner(targetId, x, options.fuelled ?? false, false);
  }

  private harmInner(
    targetId: StackId,
    x: number,
    fuelled: boolean,
    viaLink: boolean,
  ): number {
    const d = this.d;
    if (!this.isAlive(targetId)) return 0;
    const target = d.get(targetId);
    if (!viaLink && harmSpared(d, target)) x = 0;
    const percents: number[] = [];
    let warded = 0;
    if (!viaLink) {
      for (const c of target.conditions) {
        const p = conditionKind(c.kind).harmTakenPercent?.(target, c);
        if (p !== undefined && p !== null) {
          percents.push(p);
          if (c.kind === "warded") warded = p;
        }
      }
    }
    // Bonfire: Fuel triples instead of doubling (fuel-triples).
    if (fuelled && (d.acting?.fuelFactor ?? 2) === 3) percents.push(150);
    const { harm, q } = viaLink
      ? { harm: x, q: { num: 1, den: 1 } }
      : computeHarm(x, percents, fuelled);
    if (!viaLink && x > 0)
      this.harmReactions(target, x, harm, percents, warded);
    const link = viaLink ? null : redirectLinkOf(target);
    if (harm > 0 && link && link.link !== null && this.isAlive(link.link)) {
      const far = link.link;
      const idx = d.emit({
        type: "harm",
        targetId,
        x,
        q,
        harm,
        kills: 0,
        countAfter: target.count,
        topHpAfter: target.topHp,
        viaLink,
        redirectedTo: far,
      });
      d.within(idx, link.kind, () =>
        this.transfer(targetId, far, link.kind, harm),
      );
      return harm;
    }
    const res = applyDamageToStack(
      { count: target.count, hp: target.creature.hp, topHp: target.topHp },
      harm,
    );
    if (harm > 0) d.update(targetId, { count: res.count, topHp: res.topHp });
    const idx = d.emit({
      type: "harm",
      targetId,
      x,
      q,
      harm,
      kills: harm > 0 ? res.kills : 0,
      countAfter: harm > 0 ? res.count : target.count,
      topHpAfter: harm > 0 ? res.topHp : target.topHp,
      viaLink,
      redirectedTo: null,
    });
    if (harm > 0) {
      d.within(idx, null, () => {
        if (res.count === 0) this.kill(targetId);
        else this.endOnDamage(targetId);
      });
    }
    return harm;
  }

  /**
   * A redirect link carries X to the far end as Harm; what the far end
   * cannot absorb returns to the near end as Harm (1.4). Neither is
   * redirected again.
   */
  private transfer(
    nearId: StackId,
    farId: StackId,
    kind: string,
    amount: number,
  ): void {
    const d = this.d;
    const farHp = stackTotalHp(d.get(farId));
    const near = d.get(nearId);
    // The Blotter: a Scapegoat's excess does not come back.
    const excess =
      kind === "scapegoat" && hasRule(d, near.side, "scapegoat-no-backlash")
        ? 0
        : Math.max(0, amount - farHp);
    const idx = d.emit({
      type: "linkTransfer",
      nearId,
      farId,
      kind,
      amount,
      excess,
    });
    d.within(idx, null, () => {
      this.harmInner(farId, amount, false, true);
      if (excess > 0) this.harmInner(nearId, excess, false, true);
    });
  }

  private endOnDamage(id: StackId): void {
    for (const c of this.d.get(id).conditions) {
      const def = conditionKind(c.kind);
      if (def.endsOnDamage)
        this.d.within(null, def.id, () => this.end(id, c.uid, "ended"));
    }
  }

  // --- Death (1.5, 1.10) -------------------------------------------------

  private kill(id: StackId): void {
    const d = this.d;
    const dead = d.get(id);
    const passing = this.linksToPass(dead);
    const idx = d.emit({ type: "death", stackId: id });
    removeFromTurnLists(d, id);
    d.set({ ...dead, count: 0, topHp: 0, conditions: [], defending: false });
    d.within(idx, "engine:death", () => {
      // Death leaves ground.
      if (!dead.summoned && dead.tags.remains !== "nothing") {
        this.placeGround(
          {
            hex: dead.hex,
            kind: dead.tags.remains,
            clock: null,
            size: 0,
            source: id,
          },
          false,
          {
            creature: dead.creature,
            owner: dead.owner,
            initialCount: dead.initialCount,
          },
        );
      }
      // Links naming it end, unless Treaty Ink passes them on.
      for (const s of d.stacks) {
        if (!isAlive(s)) continue;
        for (const c of s.conditions) {
          if (c.link !== id) continue;
          const to = passing.far.get(`${s.id}:${c.uid}`);
          if (to !== undefined && this.isAlive(to) && to !== s.id) {
            const next = { ...c, link: to };
            this.replace(s.id, next);
            d.emit({
              type: "condition",
              stackId: s.id,
              change: "moved",
              condition: next,
              otherId: to,
            });
            continue;
          }
          const def = conditionKind(c.kind);
          if (def.onFarEndDied)
            d.within(null, `condition:${c.kind}`, () =>
              def.onFarEndDied?.(this, s.id, c),
            );
          this.end(s.id, c.uid, "ended");
        }
      }
      // Its own link ends pass to the nearest living stack (Treaty Ink).
      for (const { c, to } of passing.near) {
        if (this.isAlive(to) && c.link !== to)
          this.land(to, { ...c, roundsBorne: 0 }, "moved", id);
      }
    });
    d.dropReactionsOf(id);
    // Getting up (RULES_V2 3.8): the birthright, the badge, a paid return.
    if (!dead.summoned && dead.tags.remains !== "nothing") {
      d.trigger(id, "engine:get-up", idx, () => this.tryGetUp(id), {
        onDeath: true,
        order: -1,
      });
    }
    // On-death reactions: every living stack's, and the dead stack's own.
    for (const s of d.stacks) {
      if (!isAlive(s) && s.id !== id) continue;
      s.creature.abilities.forEach((aid, order) => {
        const r = ability(aid).onDeath?.(id, s);
        if (r)
          d.trigger(s.id, `ability:${aid}:death`, idx, r, {
            order,
            onDeath: s.id === id,
          });
      });
    }
  }

  // --- Getting up (RULES_V2 3.8) ---------------------------------------

  /** The remains a dead stack left on its hex, if they are still there. */
  ownRemains(id: StackId): GroundFeature | null {
    const s = this.d.get(id);
    const g = groundAt(this.d, s.hex);
    return g && g.class === "remains" && g.source === id ? g : null;
  }

  /**
   * A dead stack decides whether it gets up at the next round start:
   * first a birthright that returns it once per battle (`getUp: "once"`,
   * Not Done Yet), then the "gets up" badge, then an ability that pays for
   * a return with other remains (`getUp: "paid"`, Long Live the King).
   */
  private tryGetUp(id: StackId): void {
    const d = this.d;
    const s = d.get(id);
    if (isAlive(s) || !this.ownRemains(id)) return;
    const getUps = s.creature.abilities.map((a) => ability(a).getUp);
    if (getUps.includes("once") && s.rose !== true) {
      d.update(id, { rose: true });
      this.scheduleGetUp(id);
      return;
    }
    if (s.getsUp === true) {
      d.update(id, { getsUp: false });
      this.scheduleGetUp(id);
      return;
    }
    if (getUps.includes("paid")) {
      const own = s.hex;
      let best: GroundFeature | null = null;
      for (const g of d.ground) {
        if (g.class !== "remains" || sameHex(g.hex, own)) continue;
        if (
          best === null ||
          hexDistance(g.hex, own) < hexDistance(best.hex, own)
        ) {
          best = g;
        }
      }
      if (best === null) return;
      this.useRemains(best.hex);
      this.scheduleGetUp(id);
    }
  }

  /** How many creatures a stack gets up with: a third, or half (flag). */
  getUpCount(id: StackId): number {
    const s = this.d.get(id);
    const half =
      s.native && (this.d.sides[s.owner].flags ?? []).includes(GET_UP_HALF);
    return Math.ceil(s.initialCount / (half ? 2 : 3));
  }

  private scheduleGetUp(id: StackId): void {
    const s = this.d.get(id);
    this.schedule({
      round: this.d.round + 1,
      phase: "start",
      effect: { id: GET_UP_EFFECT, args: { stackId: id } },
      side: s.owner,
      returnsStack: true,
    });
  }

  setGetsUp(stackId: StackId, on: boolean): void {
    if (!this.d.has(stackId)) return;
    this.d.update(stackId, { getsUp: on });
  }

  getUp(stackId: StackId, count: number, hex: Hex): boolean {
    const d = this.d;
    if (!d.has(stackId) || count < 1) return false;
    const s = d.get(stackId);
    if (isAlive(s)) return false;
    const living = d.stacks.filter((x) => isAlive(x) && x.owner === s.owner);
    if (living.length >= MAX_LIVING_STACKS_PER_SIDE) return false;
    let at: Hex | null = isFree(d, hex) ? hex : null;
    if (at === null) {
      let bestDist = Infinity;
      for (let i = 0; i < BATTLE_HEX_COUNT; i++) {
        const h = hexFromIndex(i);
        if (!isFree(d, h)) continue;
        const dist = hexDistance(h, hex);
        if (dist < bestDist) {
          bestDist = dist;
          at = h;
        }
      }
    }
    if (at === null) return false;
    const n = Math.min(count, s.initialCount);
    d.update(stackId, {
      count: n,
      topHp: s.creature.hp,
      hex: at,
      conditions: [],
      wary: 0,
      defending: false,
      retaliatedThisRound: false,
      waitedThisRound: false,
      risen: true,
    });
    if (!d.queue.includes(stackId)) d.queue.push(stackId);
    d.emit({ type: "getUp", stackId, hex: at, count: n });
    return true;
  }

  // --- Heal --------------------------------------------------------------

  heal(
    targetId: StackId,
    x: number,
    options: { readonly revive?: boolean; readonly shared?: boolean } = {},
  ): number {
    const amount = this.healInner(targetId, x, options.revive === true);
    // Heal-sharing links (Sworn): the far end is healed the same X, with
    // the same "revives" clause, whether or not the bearer needed it.
    if (!options.shared && x > 0 && this.isAlive(targetId)) {
      for (const c of this.d.get(targetId).conditions) {
        const def = conditionKind(c.kind);
        if (!def.onHealed) continue;
        this.d.within(null, `condition:${c.kind}`, () =>
          def.onHealed?.(this, targetId, c, x, options.revive === true),
        );
      }
    }
    return amount;
  }

  private healInner(targetId: StackId, x: number, revive: boolean): number {
    const d = this.d;
    if (!this.isAlive(targetId) || x <= 0) return 0;
    const s = d.get(targetId);
    const H = s.creature.hp;
    let topHp = s.topHp;
    let count = s.count;
    let rem = x;
    const toTop = Math.min(rem, H - topHp);
    topHp += toTop;
    rem -= toTop;
    let revived = 0;
    if (revive) {
      while (rem > 0 && count < s.initialCount) {
        count++;
        revived++;
        if (rem >= H) {
          topHp = H;
          rem -= H;
        } else {
          topHp = rem;
          rem = 0;
        }
      }
    }
    const amount = x - rem;
    if (amount === 0) return 0;
    d.update(targetId, { count, topHp });
    d.emit({
      type: "heal",
      stackId: targetId,
      source: d.rule,
      amount,
      revived,
      countAfter: count,
      topHpAfter: topHp,
    });
    return amount;
  }

  // --- Movement ----------------------------------------------------------

  /**
   * Walks a path hex by hex, applying the hazard of each hex entered while
   * standing on it. The walk stops on the hex where the stack dies (or is
   * moved by the hazard): its remains lie there, and the move event is cut
   * to end there. Returns the hexes actually entered.
   */
  walk(
    stackId: StackId,
    path: readonly Hex[],
    mode: "walk" | "push" | "pull",
  ): number {
    const d = this.d;
    if (path.length === 0) return 0;
    const s = d.get(stackId);
    const to = path[path.length - 1] as Hex;
    const move = {
      type: "move",
      stackId,
      from: s.hex,
      to,
      path,
      mode,
    } as const;
    const idx = d.emit(move);
    let entered = 0;
    d.within(idx, null, () => {
      for (const h of path) {
        d.update(stackId, { hex: h });
        entered++;
        const g = groundAt(d, h);
        if (g && g.class === "hazard") {
          const def = groundKind(g.kind);
          if (def.onEnter)
            d.within(null, `ground:${g.kind}`, () =>
              def.onEnter?.(this, stackId, g),
            );
        }
        if (!this.isAlive(stackId) || !sameHex(d.get(stackId).hex, h)) break;
      }
      if (entered < path.length) {
        // Cut short: the event ends where the walk did.
        const cut = path.slice(0, entered);
        const ev = d.events[idx] as BattleEvent;
        d.events[idx] = {
          ...move,
          to: cut[cut.length - 1] as Hex,
          path: cut,
          index: ev.index,
          cause: ev.cause,
          rule: ev.rule,
        };
        return;
      }
      if (mode === "walk") this.walkEnded(stackId);
    });
    return entered;
  }

  /** "On ending a walk" ability hooks (Feast), at once, before any attack. */
  walkEnded(stackId: StackId): void {
    const d = this.d;
    if (!this.isAlive(stackId)) return;
    const hex = d.get(stackId).hex;
    for (const id of d.get(stackId).creature.abilities) {
      const def = ability(id);
      if (def.onWalkEnd && this.isAlive(stackId))
        d.within(null, `ability:${id}`, () =>
          def.onWalkEnd?.(this, stackId, hex),
        );
    }
  }

  /** Moves a stack up to n hexes in direction `dir` (push or pull). */
  private shove(
    stackId: StackId,
    dir: number,
    n: number,
    mode: "push" | "pull",
    stopAt: Hex | null,
  ): Hex {
    const d = this.d;
    const start = d.get(stackId).hex;
    const path: Hex[] = [];
    let cur = start;
    let stoppedBy: StackId | null = null;
    for (let i = 0; i < n; i++) {
      const next = stepHex(cur, dir);
      if (stopAt && sameHex(next, stopAt)) break;
      if (!isFree(d, next)) {
        stoppedBy = inBounds(next) ? (stackAt(d, next)?.id ?? null) : null;
        break;
      }
      path.push(next);
      cur = next;
    }
    const hexes = this.walk(stackId, path, mode);
    if (hexes > 0 && this.isAlive(stackId)) {
      const moved = d.get(stackId);
      const info: MovedInfo = {
        state: d.toState(),
        stackId,
        mode,
        from: start,
        to: moved.hex,
        hexes,
        stoppedBy,
      };
      const idx = d.events.length - 1;
      moved.creature.abilities.forEach((aid, order) => {
        const r = ability(aid).onMoved?.(info, moved);
        if (r) d.trigger(stackId, `ability:${aid}:moved`, idx, r, { order });
      });
    }
    // Where it stands, or where a hazard on the way killed it.
    return d.get(stackId).hex;
  }

  pushDir(stackId: StackId, dir: number, n: number): Hex {
    if (!this.isAlive(stackId) || n <= 0) return this.d.get(stackId).hex;
    return this.shove(stackId, ((dir % 6) + 6) % 6, n, "push", null);
  }

  private line(stackId: StackId, ref: Hex, n: number, away: boolean): Hex {
    const d = this.d;
    if (!this.isAlive(stackId) || n <= 0) return d.get(stackId).hex;
    const start = d.get(stackId).hex;
    if (sameHex(start, ref)) return start;
    // Directly away from (or toward) the named hex: the direction closest
    // to the line between the two hexes.
    const best = away
      ? directionToward(ref, start)
      : directionToward(start, ref);
    return this.shove(
      stackId,
      best,
      n,
      away ? "push" : "pull",
      away ? null : ref,
    );
  }

  push(stackId: StackId, awayFrom: Hex, n: number): Hex {
    return this.line(stackId, awayFrom, n, true);
  }

  pull(stackId: StackId, toward: Hex, n: number): Hex {
    return this.line(stackId, toward, n, false);
  }

  teleport(stackId: StackId, to: Hex): boolean {
    const d = this.d;
    if (!this.isAlive(stackId) || !isFree(d, to)) return false;
    const s = d.get(stackId);
    d.emit({
      type: "move",
      stackId,
      from: s.hex,
      to,
      path: [to],
      mode: "teleport",
    });
    d.update(stackId, { hex: to });
    return true;
  }

  swap(a: StackId, b: StackId): boolean {
    const d = this.d;
    if (a === b || !this.isAlive(a) || !this.isAlive(b)) return false;
    const sa = d.get(a);
    const sb = d.get(b);
    d.emit({
      type: "move",
      stackId: a,
      from: sa.hex,
      to: sb.hex,
      path: [sb.hex],
      mode: "swap",
    });
    d.emit({
      type: "move",
      stackId: b,
      from: sb.hex,
      to: sa.hex,
      path: [sa.hex],
      mode: "swap",
    });
    d.update(a, { hex: sb.hex });
    d.update(b, { hex: sa.hex });
    return true;
  }

  // --- Conditions (1.3, 1.4, 1.9) ----------------------------------------

  private refuse(
    targetId: StackId,
    c: Condition,
    reason: RefusalReason,
    detail: string,
  ): LandResult {
    this.d.emit({
      type: "condition",
      stackId: targetId,
      change: "refused",
      condition: c,
      reason,
      detail,
    });
    return { landed: false, reason, detail };
  }

  /**
   * The landing rules of 1.3, in order: tags, gate, Hold rules, same kind,
   * room. `mode` names the event of a successful landing.
   */
  land(
    targetId: StackId,
    incoming: Condition,
    mode: "landed" | "moved" | "copied",
    otherId?: StackId,
  ): LandResult {
    const d = this.d;
    if (!this.isAlive(targetId)) {
      return { landed: false, reason: "dead", detail: "the stack is dead" };
    }
    const target = d.get(targetId);
    const def = conditionKind(incoming.kind);
    // 1. Tags.
    if (target.tags.cannotBear.includes(incoming.kind)) {
      return this.refuse(
        targetId,
        incoming,
        "tag",
        `${target.creature.name ?? target.creature.id} cannot bear ${def.name}`,
      );
    }
    // 2. Gate (tested on every landing, never afterwards).
    if (incoming.gate) {
      const g = incoming.gate;
      // Vow of Bare Hands: gates read the side's stacks at twice their HP.
      const hpFactor = hasRule(d, target.side, "gates-double-hp") ? 2 : 1;
      const value =
        g.measure === "hp"
          ? hpFactor * stackTotalHp(target)
          : target.creature.tier;
      if (value > g.max) {
        return this.refuse(
          targetId,
          incoming,
          "gate",
          describeGate(incoming, target),
        );
      }
    }
    // Links: both ends the same stack is refused.
    if (incoming.link !== null && incoming.link === targetId) {
      return this.refuse(
        targetId,
        incoming,
        "sameStack",
        "both ends of a link would be the same stack",
      );
    }
    // Links a side makes: Vow of the Still Air (clockless), The Quill (+1).
    let c = incoming;
    if (mode === "landed" && c.link !== null && d.acting !== null) {
      const maker = d.acting.side;
      if (hasRule(d, maker, "links-clockless")) c = { ...c, clock: null };
      else if (c.clock !== null && hasRule(d, maker, "link-clock-plus-1"))
        c = { ...c, clock: Math.min(MAX_CLOCK, c.clock + 1) };
    }
    // 3. Hold rules.
    if (c.hold) {
      if (target.wary > 0) {
        return this.refuse(
          targetId,
          c,
          "wary",
          `Wary for ${target.wary} more round${target.wary === 1 ? "" : "s"}`,
        );
      }
      const held = target.conditions.find((x) => x.hold);
      if (held) {
        return this.refuse(
          targetId,
          c,
          "hold",
          `already held by ${conditionKind(held.kind).name}`,
        );
      }
      if (c.clock === null || c.clock > MAX_HOLD_CLOCK) {
        c = { ...c, clock: MAX_HOLD_CLOCK };
      }
    }
    // 4. Same kind: merge into the old one.
    const old = target.conditions.find((x) => x.kind === c.kind);
    if (old) {
      const clock =
        old.clock === null || c.clock === null
          ? null
          : Math.max(old.clock, c.clock);
      const size = Math.max(old.size, c.size);
      const merged: Condition = {
        ...old,
        size,
        maxSize: Math.max(old.maxSize, c.maxSize),
        clock,
        gate: c.gate,
        source: c.source,
        link: c.link,
        charge: def.chargeFromSize ? size : Math.max(old.charge, c.charge),
      };
      d.update(targetId, {
        conditions: target.conditions.map((x) =>
          x.uid === old.uid ? merged : x,
        ),
      });
      const idx = d.emit({
        type: "condition",
        stackId: targetId,
        change: "merged",
        condition: merged,
        ...(otherId !== undefined ? { otherId } : {}),
      });
      this.triggerLanded(targetId, merged, idx);
      return { landed: true, merged: true, uid: old.uid };
    }
    // 5. Room: displace the shortest clock that is neither a Hold nor
    // clockless (ties: the oldest); else refuse.
    let conditions = target.conditions.slice();
    if (conditions.length >= MAX_CONDITIONS) {
      let victim: Condition | null = null;
      for (const x of conditions) {
        if (x.hold || x.clock === null) continue;
        if (
          victim === null ||
          (x.clock as number) < (victim.clock as number) ||
          ((x.clock as number) === (victim.clock as number) &&
            x.uid < victim.uid)
        ) {
          victim = x;
        }
      }
      if (!victim) {
        return this.refuse(
          targetId,
          c,
          "full",
          "six conditions and none can be displaced",
        );
      }
      this.end(targetId, victim.uid, "displaced");
      conditions = d.get(targetId).conditions.slice();
    }
    const placed: Condition = { ...c, roundsBorne: 0 };
    conditions.push(placed);
    d.update(targetId, { conditions });
    const idx = d.emit({
      type: "condition",
      stackId: targetId,
      change: mode,
      condition: placed,
      ...(otherId !== undefined ? { otherId } : {}),
    });
    this.triggerLanded(targetId, placed, idx);
    return { landed: true, merged: false, uid: placed.uid };
  }

  /** "On a condition landing" reactions (1.10) of every living stack. */
  private triggerLanded(targetId: StackId, c: Condition, idx: number): void {
    const d = this.d;
    for (const s of d.stacks) {
      if (!isAlive(s)) continue;
      s.creature.abilities.forEach((aid, order) => {
        const r = ability(aid).onConditionLanded?.(targetId, c, s);
        if (r) d.trigger(s.id, `ability:${aid}:landed`, idx, r, { order });
      });
    }
  }

  addCondition(targetId: StackId, spec: ConditionSpec): LandResult {
    const c = makeCondition(spec, this.d.uid(), this.d.rule);
    return this.land(targetId, c, "landed");
  }

  link(nearId: StackId, farId: StackId, spec: ConditionSpec): LandResult {
    if (!conditionKind(spec.kind).link) {
      throw new Error(`${spec.kind} is not a link kind`);
    }
    return this.addCondition(nearId, { ...spec, link: farId });
  }

  private find(stackId: StackId, uid: number): Condition | null {
    if (!this.d.has(stackId)) return null;
    return this.d.get(stackId).conditions.find((c) => c.uid === uid) ?? null;
  }

  /** Removes a condition; a Hold leaving makes its bearer Wary (1.9). */
  end(
    stackId: StackId,
    uid: number,
    change: "ended" | "displaced" | "setOff" | "expired" | "moved",
    otherId?: StackId,
  ): Condition | null {
    const d = this.d;
    const c = this.find(stackId, uid);
    if (!c) return null;
    const s = d.get(stackId);
    d.update(stackId, {
      conditions: s.conditions.filter((x) => x.uid !== uid),
    });
    if (change !== "moved") {
      d.emit({
        type: "condition",
        stackId,
        change,
        condition: c,
        ...(otherId !== undefined ? { otherId } : {}),
      });
    }
    if (c.hold && isAlive(s)) {
      const rounds = Math.max(1, c.roundsBorne) + 1;
      d.update(stackId, { wary: Math.max(d.get(stackId).wary, rounds) });
      d.emit({ type: "wary", stackId, rounds });
    }
    if ((change === "ended" || change === "expired") && isAlive(s)) {
      this.endRules(stackId, c);
    }
    return c;
  }

  /** Rules that act when a condition ends or expires on a stack. */
  private endRules(stackId: StackId, c: Condition): void {
    const d = this.d;
    const s = d.get(stackId);
    const side = s.side;
    // Windfall: Ripening spreads half its size to adjacent friends.
    if (c.kind === "ripening" && hasRule(d, side, "windfall")) {
      const size = Math.floor(c.size / 2);
      const friends = adjacentStacks(d.stacks, s.hex, (x) => x.side === side);
      if (size > 0)
        d.within(null, "windfall", () => {
          for (const f of friends)
            this.addCondition(f.id, {
              kind: "ripening",
              size,
              clock: 2,
              tier: 3,
            });
        });
    }
    // Double or Nothing: Lucky leaves Jinxed 25, clock 2.
    if (c.kind === "lucky" && hasRule(d, side, "double-or-nothing")) {
      d.within(null, "double-or-nothing", () =>
        this.addCondition(stackId, {
          kind: "jinxed",
          size: 25,
          clock: 2,
          tier: 3,
        }),
      );
    }
  }

  /**
   * Treaty Ink: when `dead` dies, the links on it and naming it pass to
   * the nearest living stack (friend or foe) when either end's side has
   * the rule. Computed before death clears the dead stack's conditions.
   */
  private linksToPass(dead: BattleStack): {
    far: Map<string, StackId>;
    near: Array<{ c: Condition; to: StackId }>;
  } {
    const d = this.d;
    const far = new Map<string, StackId>();
    const near: Array<{ c: Condition; to: StackId }> = [];
    const passes = (a: BattleSide, b: BattleSide): boolean =>
      hasRule(d, a, "link-passes") || hasRule(d, b, "link-passes");
    const pick = (avoid: StackId): StackId | null =>
      nearestStack(
        d.stacks,
        dead.hex,
        (x) => x.id !== dead.id && x.id !== avoid,
      )?.id ?? null;
    for (const s of d.stacks) {
      if (!isAlive(s) || s.id === dead.id) continue;
      for (const c of s.conditions) {
        if (c.link !== dead.id || !passes(s.side, dead.side)) continue;
        const to = pick(s.id);
        if (to !== null) far.set(`${s.id}:${c.uid}`, to);
      }
    }
    for (const c of dead.conditions) {
      if (c.link === null || !this.isAlive(c.link)) continue;
      if (!passes(dead.side, d.get(c.link).side)) continue;
      const to = pick(c.link);
      if (to !== null) near.push({ c, to });
    }
    return { far, near };
  }

  /**
   * Rules reacting to Harm a stack is about to take (`x` before, `harm`
   * after the percentages): Lightning Rod and Chain Lightning. Both queue
   * reactions, so they resolve after the Harm.
   */
  private harmReactions(
    target: BattleStack,
    x: number,
    harm: number,
    percents: readonly number[],
    warded: number,
  ): void {
    const d = this.d;
    const side = target.side;
    const cause = d.events.length - 1;
    // Lightning Rod: what Warded prevented strikes the nearest enemy.
    if (warded > 0 && warded < 100 && hasRule(d, side, "lightning-rod")) {
      const rest = percents.slice();
      rest.splice(rest.indexOf(warded), 1);
      const prevented = Math.max(0, computeHarm(x, rest).harm - harm);
      const foe = nearestStack(d.stacks, target.hex, (s) => s.side !== side);
      if (prevented > 0 && foe !== null && d.rule !== "lightning-rod") {
        const foeId = foe.id;
        d.trigger(target.id, "lightning-rod", Math.max(0, cause), (fx) => {
          fx.harm(foeId, prevented);
        });
      }
    }
    // Chain Lightning: a page's Harm to a Drenched enemy jumps for 15.
    const a = d.acting;
    if (
      a !== null &&
      a.by === "page" &&
      side !== a.side &&
      d.rule !== "chain-lightning" &&
      hasRule(d, a.side, "chain-lightning") &&
      target.conditions.some((c) => c.kind === "drenched")
    ) {
      const others = adjacentStacks(
        d.stacks,
        target.hex,
        (s) => s.side === side && s.id !== target.id,
      ).map((s) => s.id);
      if (others.length > 0)
        d.trigger(target.id, "chain-lightning", Math.max(0, cause), (fx) => {
          for (const o of others) fx.harm(o, 15);
        });
    }
  }

  // --- Hero rules ---------------------------------------------------------

  hasRule(side: BattleSide, id: string): boolean {
    return hasRule(this.d, side, id);
  }

  useRule(side: BattleSide, key: string): boolean {
    const d = this.d;
    const st = d.sides[side];
    const used = st.rulesUsed ?? [];
    if (used.includes(key)) return false;
    d.sides = { ...d.sides, [side]: { ...st, rulesUsed: [...used, key] } };
    return true;
  }

  changeMagic(side: BattleSide, change: (m: SideMagic) => SideMagic): boolean {
    const d = this.d;
    const st = d.sides[side];
    if (!st.magic) return false;
    d.sides = { ...d.sides, [side]: { ...st, magic: change(st.magic) } };
    return true;
  }

  endCondition(stackId: StackId, uid: number): boolean {
    return this.end(stackId, uid, "ended") !== null;
  }

  moveCondition(fromId: StackId, uid: number, toId: StackId): LandResult {
    const c = this.find(fromId, uid);
    if (!c || !this.isAlive(fromId)) {
      return { landed: false, reason: "dead", detail: "no such condition" };
    }
    if (fromId === toId || c.link === toId) {
      return this.refuse(
        toId,
        c,
        "sameStack",
        "the move would make both ends the same stack",
      );
    }
    const res = this.land(toId, { ...c, roundsBorne: 0 }, "moved", fromId);
    if (res.landed) this.end(fromId, uid, "moved", toId);
    return res;
  }

  copyCondition(fromId: StackId, uid: number, toId: StackId): LandResult {
    const c = this.find(fromId, uid);
    if (!c)
      return { landed: false, reason: "dead", detail: "no such condition" };
    if (c.hold) {
      return this.refuse(toId, c, "neverProlonged", "a Hold cannot be copied");
    }
    if (c.link === toId) {
      return this.refuse(
        toId,
        c,
        "sameStack",
        "the copy would make both ends the same stack",
      );
    }
    return this.land(
      toId,
      { ...c, uid: this.d.uid(), roundsBorne: 0 },
      "copied",
      fromId,
    );
  }

  private replace(stackId: StackId, next: Condition): void {
    const s = this.d.get(stackId);
    this.d.update(stackId, {
      conditions: s.conditions.map((x) => (x.uid === next.uid ? next : x)),
    });
  }

  feedCondition(stackId: StackId, uid: number, amount?: number): boolean {
    const c = this.find(stackId, uid);
    if (!c || c.hold) return false;
    const grow = amount ?? Math.ceil(c.size / 2);
    const size = Math.min(c.maxSize, c.size + grow);
    if (size === c.size) return false;
    const def = conditionKind(c.kind);
    const next = { ...c, size, charge: def.chargeFromSize ? size : c.charge };
    this.replace(stackId, next);
    this.d.emit({ type: "condition", stackId, change: "fed", condition: next });
    return true;
  }

  windCondition(stackId: StackId, uid: number, delta: number): boolean {
    const c = this.find(stackId, uid);
    if (!c || c.clock === null || delta === 0) return false;
    if (c.hold && delta > 0) return false;
    const clock = Math.min(MAX_CLOCK, c.clock + delta);
    if (clock <= 0) {
      const idx = this.d.emit({
        type: "condition",
        stackId,
        change: "wound",
        condition: { ...c, clock: 0 },
      });
      this.d.within(idx, null, () => this.expire(stackId, uid));
      return true;
    }
    const next = { ...c, clock };
    this.replace(stackId, next);
    this.d.emit({
      type: "condition",
      stackId,
      change: "wound",
      condition: next,
    });
    return true;
  }

  /** The clock reached 0: the condition expires and its rule fires. */
  expire(stackId: StackId, uid: number): void {
    const c = this.end(stackId, uid, "expired");
    if (!c || !this.isAlive(stackId)) return;
    const def = conditionKind(c.kind);
    if (def.onExpire) {
      const idx = this.d.events.length - 1;
      this.d.within(idx, `condition:${c.kind}`, () =>
        def.onExpire?.(this, stackId, c),
      );
    }
  }

  setOffCondition(stackId: StackId, uid: number): number {
    const c = this.find(stackId, uid);
    if (!c || !this.isAlive(stackId)) return 0;
    const def = conditionKind(c.kind);
    const rounds = def.debt ? 1 : c.clock === null ? 3 : Math.min(3, c.clock);
    const x = c.charge * rounds;
    this.end(stackId, uid, "setOff");
    const idx = this.d.events.length - 1;
    return this.d.within(idx, null, () => this.harm(stackId, x));
  }

  delay(stackId: StackId, clock?: number): LandResult {
    return this.addCondition(stackId, {
      kind: "delayed",
      ...(clock !== undefined ? { clock } : {}),
    });
  }

  hasten(stackId: StackId, clock?: number): LandResult {
    return this.addCondition(stackId, {
      kind: "hastened",
      ...(clock !== undefined ? { clock } : {}),
    });
  }

  extraTurn(stackId: StackId): boolean {
    const d = this.d;
    if (!this.isAlive(stackId)) return false;
    const s = d.get(stackId);
    if (s.extraTurnRound === d.round) {
      d.emit({ type: "extraTurn", stackId, granted: false });
      return false;
    }
    d.update(stackId, { extraTurnRound: d.round });
    if (!d.extraTurns.includes(stackId)) d.extraTurns.push(stackId);
    d.emit({ type: "extraTurn", stackId, granted: true });
    return true;
  }

  // --- Ground (1.5) ------------------------------------------------------

  private placeGround(
    spec: GroundSpec,
    replaceBlocking: boolean,
    remains: Remains | null,
  ): boolean {
    const d = this.d;
    if (!inBounds(spec.hex)) return false;
    const def = groundKind(spec.kind);
    const feature: GroundFeature = {
      hex: spec.hex,
      kind: def.id,
      class: def.class,
      school: def.school,
      size: spec.size ?? 0,
      clock:
        spec.clock === undefined
          ? (def.defaultClock ?? null)
          : spec.clock === null
            ? null
            : Math.max(1, Math.min(MAX_CLOCK, spec.clock)),
      remains,
      source: spec.source ?? d.rule,
    };
    const old = groundAt(d, spec.hex);
    if (
      (old && old.class === "blocking" && !replaceBlocking) ||
      (def.class === "blocking" && stackAt(d, spec.hex) !== null)
    ) {
      d.emit({ type: "ground", change: "refused", feature });
      return false;
    }
    if (old) {
      d.emit({ type: "ground", change: "ended", feature: old });
    }
    d.ground = [
      ...d.ground.filter((g) => !sameHex(g.hex, spec.hex)),
      feature,
    ].sort((a, b) => hexIndex(a.hex) - hexIndex(b.hex));
    d.emit({ type: "ground", change: "added", feature });
    return true;
  }

  addGround(
    spec: GroundSpec,
    options: { replaceBlocking?: boolean } = {},
  ): boolean {
    return this.placeGround(spec, options.replaceBlocking ?? false, null);
  }

  endGround(hex: Hex, options: { replaceBlocking?: boolean } = {}): boolean {
    const d = this.d;
    const g = groundAt(d, hex);
    if (!g) return false;
    if (g.class === "blocking" && !options.replaceBlocking) return false;
    d.ground = d.ground.filter((x) => x !== g);
    d.emit({ type: "ground", change: "ended", feature: g });
    return true;
  }

  useRemains(hex: Hex): Remains | null {
    const d = this.d;
    const g = groundAt(d, hex);
    if (!g || g.class !== "remains" || !g.remains) return null;
    d.ground = d.ground.filter((x) => x !== g);
    d.emit({ type: "ground", change: "used", feature: g });
    // Gleaner: the side whose rule used remains regains 2 mana.
    const user =
      d.acting?.side ??
      (d.activeStackId !== null && d.has(d.activeStackId)
        ? d.get(d.activeStackId).side
        : null);
    if (user !== null && hasRule(d, user, "gleaner"))
      this.changeMagic(user, (m) => ({ ...m, mana: m.mana + 2 }));
    return g.remains;
  }

  // --- Summon (1.7) ------------------------------------------------------

  summon(
    creature: BattleCreatureStats,
    count: number,
    hex: Hex,
    options: { readonly side?: BattleSide } = {},
  ): StackId | null {
    const d = this.d;
    const side = options.side ?? "attacker";
    if (count < 1 || !isFree(d, hex)) return null;
    const living = d.stacks.filter((s) => isAlive(s) && s.owner === side);
    if (living.length >= MAX_LIVING_STACKS_PER_SIDE) return null;
    const id = `s${d.uid()}`;
    const stack: BattleStack = {
      id,
      owner: side,
      side,
      slot: 100 + d.stacks.length,
      creature,
      count,
      topHp: creature.hp,
      initialCount: count,
      hex,
      shotsLeft: creature.shots ?? 0,
      native: false,
      summoned: true,
      tags: creature.tags ?? { remains: "corpse", cannotBear: [] },
      conditions: [],
      wary: 0,
      retaliatedThisRound: false,
      defending: false,
      waitedThisRound: false,
      turnStartedRound: 0,
      extraTurnRound: 0,
      abilitiesUsed: [],
    };
    d.add(stack);
    d.queue.push(id);
    d.emit({ type: "summon", stackId: id });
    return id;
  }

  // --- Scheduled events (1.6) --------------------------------------------

  schedule(event: {
    readonly round: number;
    readonly phase: "start" | "end";
    readonly effect: ScheduledEvent["effect"];
    readonly side: BattleSide;
    readonly returnsStack?: boolean;
  }): number | null {
    const d = this.d;
    const ev: ScheduledEvent = {
      id: d.uid(),
      round: event.round,
      phase: event.phase,
      effect: event.effect,
      source: d.rule,
      side: event.side,
      ...(event.returnsStack ? { returnsStack: true } : {}),
    };
    const past =
      event.round < d.round ||
      (event.round === d.round && event.phase === "start");
    if (d.scheduled.length >= MAX_SCHEDULED || past) {
      d.emit({ type: "schedule", change: "refused", event: ev });
      return null;
    }
    d.scheduled.push(ev);
    d.emit({ type: "schedule", change: "added", event: ev });
    return ev.id;
  }

  cancel(id: number): boolean {
    const d = this.d;
    const ev = d.scheduled.find((e) => e.id === id);
    if (!ev) return false;
    d.scheduled = d.scheduled.filter((e) => e.id !== id);
    d.emit({ type: "schedule", change: "cancelled", event: ev });
    return true;
  }

  /** Fires the scheduled events due now, in order of creation. */
  fireScheduled(phase: "start" | "end"): void {
    const d = this.d;
    const due = d.scheduled.filter(
      (e) => e.round === d.round && e.phase === phase,
    );
    for (const ev of due) {
      if (d.winner !== null) return;
      d.scheduled = d.scheduled.filter((e) => e.id !== ev.id);
      d.beginStep();
      const idx = d.emit(
        { type: "schedule", change: "fired", event: ev },
        ev.source,
      );
      d.within(idx, ev.source, () =>
        effect(ev.effect.id)(this, ev.effect.args, {
          side: ev.side,
          source: ev.source,
        }),
      );
      this.resolveReactions();
      if (this.checkEnd()) return;
    }
  }
}

/** Side flag: native stacks get up with half their count (Family Crypt). */
export const GET_UP_HALF = "get-up-half";
/** The scheduled effect that returns a dead stack from its remains. */
export const GET_UP_EFFECT = "engine:get-up";

registerEffect(GET_UP_EFFECT, (fx, args) => {
  const stackId =
    args !== null && typeof args === "object" && !Array.isArray(args)
      ? (args as { readonly stackId?: unknown }).stackId
      : undefined;
  if (typeof stackId !== "string" || !(fx instanceof Resolver)) return;
  const remains = fx.ownRemains(stackId);
  // Used or replaced before the event fired: the return is cancelled.
  if (!remains || fx.isAlive(stackId)) return;
  const s = fx.stack(stackId);
  const keep = s.creature.abilities.some(
    (a) => ability(a).keepsRemainsOnGetUp === true,
  );
  if (!keep) fx.useRemains(remains.hex);
  fx.getUp(stackId, fx.getUpCount(stackId), remains.hex);
});

/** Index of free hexes, for tests and content. */
export function freeHexes(state: BattleState): Hex[] {
  const out: Hex[] = [];
  const d = new Draft(state);
  for (let i = 0; i < BATTLE_HEX_COUNT; i++) {
    const h = hexFromIndex(i);
    if (isFree(d, h)) out.push(h);
  }
  return out;
}
