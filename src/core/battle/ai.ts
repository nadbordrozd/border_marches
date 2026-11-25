/**
 * Battle AI v2 (neutrals, AI heroes, auto-combat and quick battle).
 *
 * A shallow search over the active stack's options, each scored by
 * rehearsing it on the real engine (applyAction on a copy, as
 * rehearse.ts does) and evaluating the resulting board:
 *
 * - **Options.** Moves, attacks (from every reachable hex), shots, swaps,
 *   Defend and Wait ({@link legalActions}); activated abilities with their
 *   candidate targets and walk-first hexes; creature casters' pages;
 *   area shots at hexes (Bomb); a walk after the attack (Hit and Run).
 *   Targets come from each act's `aiTargets` list (registry.ts) and must
 *   pass the act's own check.
 * - **Hero acts.** Casts (pages and scrolls, with every Echo and Fuel
 *   option), the Command and item acts are tried before the stack acts.
 *   The best few are searched one ply deeper: the hero act followed by the
 *   stack's best action, against the stack's best action alone. The act is
 *   taken when that difference, less its mana, scroll or Fuel cost, clears
 *   a threshold (lower for a cast at the side's last turn of the round).
 * - **Evaluation** ({@link evaluate}), from the deciding side: material
 *   (total HP x fight value per HP, by owner; summoned stacks count less),
 *   conditions (a per-kind estimate of what a boon or bane is worth for
 *   the rounds it has left), pending returns from remains, and positional
 *   terms: the damage each side's stacks could deal next turn (enemy
 *   threat weighs more than one's own, so the AI does not walk into reach
 *   needlessly; a shooter an enemy can reach is worth less), targets out
 *   of reach discounted per turn away (the pull forward), Defend's reduced
 *   damage taken. The attacker, who loses at the round limit (1.12), is
 *   bolder: it fears the enemy's reach less, that fear fades over the
 *   first rounds, and its own threat weighs more each round.
 * - **Tuning.** The weights ({@link DEFAULT_AI_WEIGHTS}) were set with the
 *   batch runner, tests/sim/battles.ts (`npm run sim:battles`).
 * - **Pruning.** Moves are first scored on a board with the stack simply
 *   placed on the hex (no engine run); only the best few are rehearsed.
 * - **Determinism.** Candidates are generated in a fixed order and ties go
 *   to the earliest, so the choice is a pure function of the state (the
 *   intents of RULES_V2 1.13 rely on it). Caches only memoise pure values.
 */

import { isAlive } from "./abilities.ts";
import { creatureFightValue, totalHp } from "./damage.ts";
import {
  actionError,
  activeStack,
  applyAction,
  canShoot,
  heroActError,
  isRangedCreature,
  legalActions,
  reachableHexes,
  shootsAnyHex,
} from "./engine.ts";
import {
  BATTLE_HEX_COUNT,
  hexDistance,
  hexFromIndex,
  hexIndex,
  isAdjacent,
  neighbors,
} from "./hex.ts";
import type { Hex } from "./hex.ts";
import {
  creaturePagesLeft,
  echoError,
  fuelError,
  heroCastError,
  manaCost,
  touchedStacks,
} from "./magic.ts";
import { ability, act as actDef, conditionKind, hasAct } from "./registry.ts";
import type { ActDef } from "./registry.ts";
import {
  GET_UP_EFFECT,
  bears,
  blockingHexes,
  computeBreakdown,
  effectiveSpeed,
  enemySide,
} from "./resolve.ts";
import type {
  ActTarget,
  BattleAction,
  BattleCreatureStats,
  BattleSide,
  BattleStack,
  BattleState,
  Condition,
  ConditionRef,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Values

/** AI value per HP: the creature's fight value per hit point. */
export function aiValuePerHp(creature: BattleCreatureStats): number {
  if (creature.aiValuePerHp !== undefined) return creature.aiValuePerHp;
  return creatureFightValue(creature) / Math.max(1, creature.hp);
}

/** A stack's value: total HP x value per HP (0 when dead). */
export function stackValue(stack: BattleStack): number {
  return (
    totalHp({ count: stack.count, hp: stack.creature.hp, topHp: stack.topHp }) *
    aiValuePerHp(stack.creature)
  );
}

/** The tunable weights of the evaluation and of the hero-act thresholds. */
export interface AiWeights {
  /** Weight of the damage the enemy could deal next turn. */
  readonly enemyThreat: number;
  /** Weight of the damage this side could deal next turn. */
  readonly ownThreat: number;
  /** Discount per turn for targets out of reach (the pull forward). */
  readonly far: number;
  /** Extra own-threat weight for the attacker per round (round limit). */
  readonly urgency: number;
  /**
   * The attacker's boldness: its enemy-threat weight is x (1 - this), its
   * own-threat weight x (1 + this).
   */
  readonly aggression: number;
  /** The attacker's enemy-threat weight fades to 0 over these rounds. */
  readonly fearRounds: number;
  /** Fraction of a stack's value that a shooter in enemy reach loses. */
  readonly shooterExposure: number;
  /** Fraction of a stack's value it deals per round (condition values). */
  readonly tempo: number;
  /** Summoned stacks count this fraction of their value. */
  readonly summonWeight: number;
  /** Cast threshold as a fraction of this side's value. */
  readonly castFraction: number;
  /** The same at the side's last turn of the round. */
  readonly lastCastFraction: number;
  /** Command and item-act threshold as a fraction of this side's value. */
  readonly commandFraction: number;
  /** Value of one mana point (it stays spent after the battle). */
  readonly manaValue: number;
  /** Value of the battle's Fuel use. */
  readonly fuelValue: number;
  /** A scroll's cost as a fraction of its gold value. */
  readonly scrollFraction: number;
}

export const DEFAULT_AI_WEIGHTS: AiWeights = {
  enemyThreat: 0.5,
  ownThreat: 0.3,
  far: 0.5,
  urgency: 0.03,
  aggression: 0.3,
  fearRounds: 12,
  shooterExposure: 0.15,
  tempo: 0.2,
  summonWeight: 0.6,
  castFraction: 0.03,
  lastCastFraction: 0.01,
  commandFraction: 0.04,
  manaValue: 8,
  fuelValue: 60,
  scrollFraction: 0.3,
};

export interface AiOptions {
  /** Consider hero acts (casts, the Command, item acts). Default true. */
  readonly heroActs?: boolean;
  /** Weight overrides (tuning and tests). */
  readonly weights?: Partial<AiWeights>;
}

export interface ScoredAction {
  readonly action: BattleAction;
  /** Evaluation after the action minus before, from the acting side. */
  readonly score: number;
}

/** Gold value of a scroll by spell tier (catalog SCROLL_VALUE). */
const SCROLL_GOLD: readonly number[] = [0, 300, 600, 1000, 1500, 2500];

const WIN = 1e7;
/** Moves rehearsed after the cheap estimate. */
const MOVES_REHEARSED = 6;
/** Hero acts searched one ply deeper. */
const HERO_ACTS_SEARCHED = 3;
/** Casts tried with Echo and Fuel options. */
const CASTS_EXTENDED = 3;

// ---------------------------------------------------------------------------
// Static distances (blocking ground only), cached per obstacle layout

const NEIGHBOURS: readonly (readonly number[])[] = Array.from(
  { length: BATTLE_HEX_COUNT },
  (_, i) => neighbors(hexFromIndex(i)).map(hexIndex),
);

const distCache = new Map<string, Uint8Array>();

function distances(state: BattleState): Uint8Array {
  const blocked = blockingHexes(state).map(hexIndex);
  const key = blocked.join(",");
  const hit = distCache.get(key);
  if (hit) return hit;
  const isBlocked = new Uint8Array(BATTLE_HEX_COUNT);
  for (const b of blocked) isBlocked[b] = 1;
  const n = BATTLE_HEX_COUNT;
  const table = new Uint8Array(n * n).fill(255);
  const queue = new Int16Array(n);
  for (let from = 0; from < n; from++) {
    const base = from * n;
    table[base + from] = 0;
    let head = 0;
    let tail = 0;
    queue[tail++] = from;
    while (head < tail) {
      const cur = queue[head++] as number;
      const d = table[base + cur] as number;
      for (const nb of NEIGHBOURS[cur] as readonly number[]) {
        // Blocked hexes get a distance (a stack may stand there after a
        // push) but are never walked through.
        if (table[base + nb] !== 255) continue;
        table[base + nb] = d + 1;
        if (!isBlocked[nb]) queue[tail++] = nb;
      }
    }
  }
  if (distCache.size >= 16) distCache.clear();
  distCache.set(key, table);
  return table;
}

// ---------------------------------------------------------------------------
// The decision context

class Context {
  readonly w: AiWeights;
  readonly me: BattleSide;
  readonly dist: Uint8Array;
  private readonly rates = new Map<string, number>();

  constructor(state: BattleState, me: BattleSide, w: AiWeights) {
    this.w = w;
    this.me = me;
    this.dist = distances(state);
  }

  /** Walking distance between two hexes around blocking ground. */
  distance(a: Hex, b: Hex): number {
    return this.dist[hexIndex(a) * BATTLE_HEX_COUNT + hexIndex(b)] as number;
  }

  /**
   * Damage per creature of `a` striking `b` (melee or shot), with every
   * modifier of the board it is first asked on (memoised per decision).
   */
  rate(
    state: BattleState,
    a: BattleStack,
    b: BattleStack,
    shot: boolean,
  ): number {
    const key = `${a.id}>${b.id}${shot ? "s" : "m"}`;
    const hit = this.rates.get(key);
    if (hit !== undefined) return hit;
    const bd = computeBreakdown({
      state,
      attacker: { ...a, defending: false },
      defender: { ...b, defending: false },
      kind: shot ? "shot" : "melee",
      hexesMoved: 0,
    });
    const r = bd.damage / Math.max(1, a.count);
    this.rates.set(key, r);
    return r;
  }
}

// ---------------------------------------------------------------------------
// Evaluation

/** Fraction of the bearer's value a condition is worth per round left. */
function conditionWorth(
  c: Condition,
  bearer: BattleStack,
  value: number,
  w: AiWeights,
): number {
  const rounds = c.clock === null ? 3 : Math.min(3, c.clock);
  const vph = aiValuePerHp(bearer.creature);
  const t = w.tempo;
  const kind = conditionKind(c.kind);
  const s = c.size;
  let worth: number;
  switch (c.kind) {
    case "frozen":
    case "asleep":
      worth = 1.5 * t * Math.min(2, rounds) * value;
      break;
    case "turned":
      worth = 3 * t * rounds * value;
      break;
    case "delayed":
    case "shaken":
    case "hastened":
      worth = 0.2 * t * rounds * value;
      break;
    case "heartened":
      worth = 0.8 * t * value;
      break;
    case "lucky":
      worth = 0.5 * t * value;
      break;
    case "jinxed":
      worth = (0.01 * s + 0.2) * t * rounds * value;
      break;
    case "venomed":
    case "shielded":
    case "fired-up":
      worth = 0.05 * s * t * rounds * value;
      break;
    case "mollified":
    case "ripening":
      worth = 0.01 * s * t * rounds * value;
      break;
    case "warded":
    case "drenched":
      worth = 0.005 * s * t * rounds * value;
      break;
    case "quickened":
    case "slowed":
      worth = 0.06 * s * t * rounds * value;
      break;
    case "hushed":
      worth =
        isRangedCreature(bearer.creature) && bearer.shotsLeft > 0
          ? t * rounds * value
          : 0;
      break;
    case "burning":
    case "leeched":
      worth = Math.min(s * rounds * vph, value);
      break;
    case "reckoning":
      worth = Math.min(s * vph, value);
      break;
    case "mending":
      worth = 0.7 * s * rounds * vph;
      break;
    case "thorned":
      worth = 5 * s * rounds;
      break;
    case "scapegoat":
      worth = 0.5 * t * rounds * value;
      break;
    case "sworn":
      worth = 0.15 * t * value;
      break;
    case "challenged":
      worth = 0.3 * t * rounds * value;
      break;
    default:
      worth = 0.15 * t * rounds * value;
  }
  return kind.polarity === "boon" ? worth : -worth;
}

/** The creatures a dead stack gets up with (a third, rounded up). */
function getUpValue(stack: BattleStack): number {
  const n = Math.ceil(stack.initialCount / 3);
  return n * stack.creature.hp * aiValuePerHp(stack.creature);
}

function hasRemainsOf(state: BattleState, id: string): boolean {
  return state.ground.some((g) => g.class === "remains" && g.source === id);
}

/**
 * Damage value `side` could deal: each of its stacks that can act strikes
 * the enemy stack where it does the most (shooters anywhere, melee stacks
 * within Speed + 1 hexes around blocking ground). With `far` > 0, targets
 * out of reach count too, at `far` to the power of the turns it takes to
 * reach them (the pull toward the enemy).
 */
function threat(
  ctx: Context,
  state: BattleState,
  side: BattleSide,
  alive: readonly BattleStack[],
  far: number,
): number {
  let total = 0;
  for (const a of alive) {
    if (a.side !== side) continue;
    if (bears(a, "cannotAct")) continue;
    const enemyNear = alive.some(
      (e) => e.side !== side && isAdjacent(e.hex, a.hex),
    );
    const shooter =
      isRangedCreature(a.creature) &&
      a.shotsLeft > 0 &&
      !enemyNear &&
      !bears(a, "cannotShoot");
    const speed = Math.max(1, effectiveSpeed(a));
    const reach = speed + 1;
    const teleport = a.creature.abilities.some(
      (x) => ability(x).teleportWalk === true,
    );
    let best = 0;
    for (const b of alive) {
      if (b.side === side) continue;
      let factor = 1;
      if (!shooter) {
        const d = teleport
          ? hexDistance(a.hex, b.hex)
          : ctx.distance(a.hex, b.hex);
        if (d > reach) {
          if (far <= 0 || d === 255) continue;
          factor = far ** Math.min(6, (d - reach) / speed);
        }
      }
      let dmg = ctx.rate(state, a, b, shooter) * a.count;
      if (b.defending) dmg *= 0.8;
      const hp = totalHp({
        count: b.count,
        hp: b.creature.hp,
        topHp: b.topHp,
      });
      let v = Math.min(dmg, hp) * aiValuePerHp(b.creature);
      // A shooter reached in melee loses its shots too.
      if (
        factor === 1 &&
        !shooter &&
        isRangedCreature(b.creature) &&
        b.shotsLeft > 0 &&
        !b.summoned
      )
        v += ctx.w.shooterExposure * stackValue(b);
      v *= factor;
      if (v > best) best = v;
    }
    total += best;
  }
  return total;
}

/** The board's value for `ctx.me` (higher is better). */
function evaluate(ctx: Context, state: BattleState): number {
  const me = ctx.me;
  if (state.winner !== null) {
    const v = materialOf(ctx, state);
    return state.winner === me ? WIN + v : -WIN + v;
  }
  const alive = state.stacks.filter(isAlive);
  let v = materialOf(ctx, state);
  for (const s of alive) {
    const sign = s.owner === me ? 1 : -1;
    const value = stackValue(s);
    for (const c of s.conditions)
      v += sign * conditionWorth(c, s, value, ctx.w);
    if (s.getsUp === true) v += sign * 0.3 * getUpValue(s);
  }
  for (const e of state.scheduled) {
    if (e.effect.id !== GET_UP_EFFECT) continue;
    const args = e.effect.args as { readonly stackId?: unknown } | undefined;
    const id = typeof args?.stackId === "string" ? args.stackId : null;
    const s = id === null ? null : state.stacks.find((x) => x.id === id);
    if (!s || isAlive(s) || !hasRemainsOf(state, s.id)) continue;
    v += (s.owner === me ? 0.9 : -0.9) * getUpValue(s);
  }
  const them = enemySide(me);
  // The attacker must break the defence before the round limit (1.12):
  // it fears the enemy's reach less and presses harder, more each round.
  const att = me === "attacker";
  const fade =
    att && ctx.w.fearRounds > 0
      ? Math.max(0, 1 - (state.round - 1) / ctx.w.fearRounds)
      : 1;
  const fear = ctx.w.enemyThreat * (att ? 1 - ctx.w.aggression : 1) * fade;
  const own =
    ctx.w.ownThreat * (att ? 1 + ctx.w.aggression : 1) +
    (att ? ctx.w.urgency * Math.max(0, state.round - 1) : 0);
  v -= fear * threat(ctx, state, them, alive, 0);
  v += own * threat(ctx, state, me, alive, ctx.w.far);
  return v;
}

function materialOf(ctx: Context, state: BattleState): number {
  let v = 0;
  for (const s of state.stacks) {
    if (!isAlive(s)) continue;
    const value = stackValue(s) * (s.summoned ? ctx.w.summonWeight : 1);
    v += s.owner === ctx.me ? value : -value;
  }
  return v;
}

/** This side's material (the scale of the thresholds). */
function sideValue(state: BattleState, side: BattleSide): number {
  let v = 0;
  for (const s of state.stacks)
    if (isAlive(s) && s.owner === side && !s.summoned) v += stackValue(s);
  return v;
}

// ---------------------------------------------------------------------------
// Candidates

/** A state with one stack placed on another hex (cheap move estimate). */
function placed(state: BattleState, id: string, hex: Hex): BattleState {
  return {
    ...state,
    stacks: state.stacks.map((x) => (x.id === id ? { ...x, hex } : x)),
  };
}

/** Default targets of an act without an `aiTargets` list. */
function defaultTargets(state: BattleState, def: ActDef): ActTarget[][] {
  if (def.targets === 0) return [[]];
  if (def.targets !== 1) return [];
  const out: ActTarget[][] = state.stacks
    .filter(isAlive)
    .map((s) => [{ stack: s.id }]);
  for (const g of state.ground)
    if (g.class === "remains") out.push([{ hex: g.hex }]);
  return out;
}

function targetsOf(
  state: BattleState,
  def: ActDef,
  actorId: string,
): readonly (readonly ActTarget[])[] {
  return def.aiTargets?.(state, actorId) ?? defaultTargets(state, def);
}

/** Activated abilities, creature casts and area shots of the active stack. */
function extraActions(state: BattleState, self: BattleStack): BattleAction[] {
  const out: BattleAction[] = [];
  let reach: Map<number, number> | null = null;
  for (const abilityId of self.creature.abilities) {
    const ab = ability(abilityId);
    if (!ab.act) continue;
    if (ab.everyTurn !== true && self.abilitiesUsed.includes(abilityId))
      continue;
    const def = actDef(ab.act);
    for (const targets of targetsOf(state, def, self.id)) {
      const base: BattleAction = {
        type: "ability",
        stackId: self.id,
        ability: abilityId,
        targets,
      };
      if (actionError(state, base) === null) out.push(base);
      if (ab.moveFirst !== true) continue;
      const t = targets[0];
      if (t === undefined || !("stack" in t) || "condition" in t) continue;
      const target = state.stacks.find((x) => x.id === t.stack);
      if (!target) continue;
      reach ??= reachableHexes(state, self.id);
      for (const n of neighbors(target.hex)) {
        const d = reach.get(hexIndex(n));
        if (d === undefined || d === 0) continue;
        const a: BattleAction = { ...base, from: n };
        if (actionError(state, a) === null) out.push(a);
      }
    }
  }
  for (const spell of creaturePagesLeft(self)) {
    if (!hasAct(spell)) continue;
    const def = actDef(spell);
    for (const targets of targetsOf(state, def, self.id)) {
      const a: BattleAction = {
        type: "creatureCast",
        stackId: self.id,
        spell,
        targets,
      };
      if (actionError(state, a) === null) out.push(a);
    }
  }
  if (shootsAnyHex(self) && canShoot(state, self.id)) {
    const seen = new Set<number>();
    for (const e of state.stacks) {
      if (!isAlive(e) || e.side === self.side) continue;
      for (const h of neighbors(e.hex)) {
        const i = hexIndex(h);
        if (seen.has(i)) continue;
        seen.add(i);
        if (state.stacks.some((s) => isAlive(s) && hexIndex(s.hex) === i))
          continue;
        out.push({ type: "shootHex", stackId: self.id, at: h });
      }
    }
  }
  return out;
}

interface Scored {
  readonly action: BattleAction;
  readonly value: number;
  readonly after: BattleState;
}

function rehearsed(
  ctx: Context,
  state: BattleState,
  action: BattleAction,
): Scored {
  const after = applyAction(state, action).state;
  return { action, value: evaluate(ctx, after), after };
}

function better(a: Scored | null, b: Scored): Scored {
  return a === null || b.value > a.value ? b : a;
}

/** Hexes within `n` walking steps of `from` (Hit and Run candidates). */
function hexesNear(ctx: Context, from: Hex, n: number): Hex[] {
  const out: Hex[] = [];
  for (let i = 0; i < BATTLE_HEX_COUNT; i++) {
    const h = hexFromIndex(i);
    const d = ctx.distance(from, h);
    if (d > 0 && d <= n) out.push(h);
  }
  return out;
}

/** Every creature option of the active stack, scored by one rehearsal. */
function scoreStackOptions(ctx: Context, state: BattleState): Scored[] {
  const self = activeStack(state);
  if (!self) return [];
  const out: Scored[] = [];
  const moves: BattleAction[] = [];
  for (const action of legalActions(state)) {
    if (action.type === "move" && action.swapWith === undefined) {
      moves.push(action);
      continue;
    }
    out.push(rehearsed(ctx, state, action));
  }
  // Moves: a cheap estimate on the placed board, then the best rehearsed.
  const estimates = moves.map((m, i) => ({
    i,
    v: m.type === "move" ? evaluate(ctx, placed(state, self.id, m.to)) : 0,
  }));
  estimates.sort((a, b) => b.v - a.v || a.i - b.i);
  for (const e of estimates.slice(0, MOVES_REHEARSED))
    out.push(rehearsed(ctx, state, moves[e.i] as BattleAction));
  for (const action of extraActions(state, self))
    out.push(rehearsed(ctx, state, action));
  // Hit and Run: the best attacks, each with its best walk afterwards.
  const walk = Math.max(
    0,
    ...self.creature.abilities.map((a) => ability(a).walkAfterAttack ?? 0),
  );
  if (walk > 0) {
    const attacks = out
      .filter((s) => s.action.type === "attack")
      .sort((a, b) => b.value - a.value)
      .slice(0, 2);
    for (const atk of attacks) {
      if (atk.action.type !== "attack") continue;
      const after = atk.after;
      const me = after.stacks.find((x) => x.id === self.id);
      if (!me || !isAlive(me)) continue;
      const options = hexesNear(ctx, me.hex, walk)
        .filter((h) => !after.stacks.some((s) => isAlive(s) && sameAt(s, h)))
        .map((h, i) => ({ h, i, v: evaluate(ctx, placed(after, self.id, h)) }))
        .sort((a, b) => b.v - a.v || a.i - b.i)
        .slice(0, 2);
      for (const o of options) {
        const a: BattleAction = { ...atk.action, after: o.h };
        if (actionError(state, a) === null) out.push(rehearsed(ctx, state, a));
      }
    }
  }
  return out;
}

function sameAt(s: BattleStack, h: Hex): boolean {
  return s.hex.col === h.col && s.hex.row === h.row;
}

function bestOf(options: readonly Scored[]): Scored | null {
  let best: Scored | null = null;
  for (const o of options) best = better(best, o);
  return best;
}

// ---------------------------------------------------------------------------
// Hero acts

interface HeroOption extends Scored {
  /** Mana, scroll, Fuel or once-per-battle cost in value. */
  readonly cost: number;
  readonly kind: "cast" | "command" | "item";
}

function conditionRefs(
  state: BattleState,
  ids: readonly string[],
): ConditionRef[] {
  const out: ConditionRef[] = [];
  for (const id of ids) {
    const s = state.stacks.find((x) => x.id === id);
    if (!s) continue;
    for (const c of s.conditions) out.push({ stack: s.id, condition: c.uid });
  }
  return out;
}

function heroOptions(ctx: Context, state: BattleState): HeroOption[] {
  const self = activeStack(state);
  if (!self) return [];
  const side = state.sides[self.side];
  const hero = side.hero;
  if (!hero) return [];
  const out: HeroOption[] = [];
  const magic = side.magic;
  const tryAct = (
    action: Extract<BattleAction, { type: "heroAct" }>,
    cost: number,
    kind: HeroOption["kind"],
  ): HeroOption | null => {
    if (actionError(state, action) !== null) return null;
    const s = rehearsed(ctx, state, action);
    const o: HeroOption = { ...s, cost, kind };
    out.push(o);
    return o;
  };

  // Casts: pages, then scrolls (a side without book data casts nothing).
  if (magic && side.castRound !== state.round) {
    const castable: { act: string; scroll: boolean }[] = [];
    for (const scroll of [false, true]) {
      const seen = new Set<string>();
      for (const p of scroll ? magic.scrolls : magic.pages) {
        if (seen.has(p) || !hasAct(p)) continue;
        seen.add(p);
        if (heroCastError(state, self.side, p, scroll) === null)
          castable.push({ act: p, scroll });
      }
    }
    {
      const casts: HeroOption[] = [];
      for (const { act, scroll } of castable) {
        const def = actDef(act);
        if (def.kind !== "cast") continue;
        const cost = scroll
          ? ctx.w.scrollFraction * (SCROLL_GOLD[def.tier ?? 1] ?? 300)
          : magic
            ? manaCost(def, magic) * ctx.w.manaValue
            : 0;
        for (const targets of targetsOf(state, def, self.id)) {
          const o = tryAct(
            {
              type: "heroAct",
              stackId: self.id,
              act,
              targets,
              ...(scroll ? { scroll: true } : {}),
            },
            cost,
            "cast",
          );
          if (o) casts.push(o);
        }
      }
      // Echo and Fuel options on the best casts.
      const top = [...casts]
        .sort((a, b) => b.value - b.cost - (a.value - a.cost))
        .slice(0, CASTS_EXTENDED);
      const fuelLeft = magic ? magic.fuelUsed < magic.fuelMax : false;
      for (const o of top) {
        if (o.action.type !== "heroAct") continue;
        const base = o.action;
        const def = actDef(base.act);
        const touched = touchedStacks(state, def, self.id, base.targets);
        const refs = conditionRefs(state, touched);
        for (const ref of refs) {
          if (echoError(state, def, self.id, base.targets, ref) === null)
            tryAct({ ...base, echo: ref }, o.cost, "cast");
          if (
            fuelLeft &&
            fuelError(state, self.side, def, self.id, base.targets, ref) ===
              null
          )
            tryAct({ ...base, fuel: ref }, o.cost + ctx.w.fuelValue, "cast");
        }
      }
    }
  }

  // The Command and item acts: once per battle each.
  const once: { act: string; kind: "command" | "item" }[] = [];
  if (hero.command !== undefined && !side.commandUsed)
    once.push({ act: hero.command, kind: "command" });
  for (const it of hero.itemActs ?? [])
    if (!side.itemActsUsed.includes(it)) once.push({ act: it, kind: "item" });
  for (const { act, kind } of once) {
    if (!hasAct(act) || heroActError(state, self.side, act) !== null) continue;
    const def = actDef(act);
    const singles: HeroOption[] = [];
    for (const targets of targetsOf(state, def, self.id)) {
      const o = tryAct(
        { type: "heroAct", stackId: self.id, act, targets },
        0,
        kind,
      );
      if (o) singles.push(o);
    }
    // "Up to n times": grow the best choice greedily.
    const step = def.targetStep ?? 1;
    const max = def.maxTargets?.(state, self.id) ?? def.targets;
    let best = bestOf(singles) as HeroOption | null;
    while (best !== null && best.action.type === "heroAct") {
      const cur = best.action;
      if (cur.targets.length + step > max) break;
      let next: HeroOption | null = null;
      for (const extra of targetsOf(state, def, self.id)) {
        if (extra.length !== step) continue;
        const action = {
          ...cur,
          targets: [...cur.targets, ...extra],
        };
        if (actionError(state, action) !== null) continue;
        const s = rehearsed(ctx, state, action);
        if (next === null || s.value > next.value)
          next = { ...s, cost: 0, kind };
      }
      if (next === null || next.value <= best.value) break;
      out.push(next);
      best = next;
    }
  }
  return out;
}

/** True when no other stack of the side is still to act this round. */
function lastTurnOfRound(state: BattleState, self: BattleStack): boolean {
  const rest = [...state.queue, ...state.waiting].filter(
    (id) => id !== self.id,
  );
  return !rest.some((id) => {
    const s = state.stacks.find((x) => x.id === id);
    return s !== undefined && isAlive(s) && s.side === self.side;
  });
}

// ---------------------------------------------------------------------------
// The decision

function weightsOf(options: AiOptions): AiWeights {
  return { ...DEFAULT_AI_WEIGHTS, ...(options.weights ?? {}) };
}

/** Every creature option of the active stack with its score. */
export function scoreActions(
  state: BattleState,
  options: AiOptions = {},
): ScoredAction[] {
  const self = activeStack(state);
  if (!self || state.winner !== null) return [];
  const ctx = new Context(state, self.side, weightsOf(options));
  const before = evaluate(ctx, state);
  return scoreStackOptions(ctx, state).map((s) => ({
    action: s.action,
    score: s.value - before,
  }));
}

/** The AI's action for the active stack. Throws when the battle is over. */
export function chooseAiAction(
  state: BattleState,
  options: AiOptions = {},
): BattleAction {
  const self = activeStack(state);
  if (!self || state.winner !== null)
    throw new Error("no action: the battle is over");
  const ctx = new Context(state, self.side, weightsOf(options));
  const stackBest = bestOf(scoreStackOptions(ctx, state));
  if (!stackBest) throw new Error("no action: the battle is over");
  if (options.heroActs === false || !state.sides[self.side].hero)
    return stackBest.action;

  const heroes = heroOptions(ctx, state)
    .map((o, i) => ({ o, i, net: o.value - o.cost }))
    .sort((a, b) => b.net - a.net || a.i - b.i)
    .slice(0, HERO_ACTS_SEARCHED);
  const scale = Math.max(1, sideValue(state, self.side));
  const last = lastTurnOfRound(state, self);
  let pick: { action: BattleAction; margin: number } | null = null;
  for (const { o } of heroes) {
    // One ply deeper: the hero act, then the stack's best action.
    let value = o.value;
    if (o.after.winner === null && o.after.activeStackId === self.id) {
      const follow = bestOf(scoreStackOptions(ctx, o.after));
      if (follow) value = follow.value;
    }
    const gain = value - stackBest.value - o.cost;
    const fraction =
      o.kind === "cast"
        ? last
          ? ctx.w.lastCastFraction
          : ctx.w.castFraction
        : ctx.w.commandFraction;
    const margin = gain - fraction * scale;
    if (margin > 0 && (pick === null || margin > pick.margin))
      pick = { action: o.action, margin };
  }
  return pick ? pick.action : stackBest.action;
}

/**
 * The board's value for `side` under the AI's evaluation (tools and
 * tests; higher is better).
 */
export function evaluateFor(
  state: BattleState,
  side: BattleSide,
  options: AiOptions = {},
): number {
  return evaluate(new Context(state, side, weightsOf(options)), state);
}
