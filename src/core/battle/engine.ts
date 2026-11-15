/**
 * The deterministic battle engine: legal actions, movement, strikes,
 * retaliation, turn order and rounds (GAME_DESIGN.md section 9).
 *
 * States are immutable. {@link applyAction} copies what it changes and
 * returns the new state with the events to animate. {@link previewAttack}
 * runs the very same strike code on a scratch copy, so a preview always
 * equals what applying the action does.
 */

import {
  collectAttackModifiers,
  collectDamageMultipliers,
  collectDefenseModifiers,
  collectOnHit,
  isAlive,
  retaliationPrevented,
  withStatus,
  ABILITY_HOOKS,
} from "./abilities.ts";
import type { StrikeContext } from "./abilities.ts";
import {
  applyDamageToStack,
  computeDamage,
  defendedDefense,
} from "./damage.ts";
import {
  BATTLE_HEX_COUNT,
  hexFromIndex,
  hexIndex,
  inBounds,
  isAdjacent,
  neighbors,
  sameHex,
} from "./hex.ts";
import type { Hex } from "./hex.ts";
import type {
  AttackAction,
  AttackPreview,
  BattleAction,
  BattleCreatureStats,
  BattleEvent,
  BattleSide,
  BattleStack,
  BattleState,
  BattleStep,
  DamageBreakdown,
  FlatModifier,
  StackId,
  StatusId,
  StrikeKind,
  StrikeResult,
} from "./types.ts";

export function isRangedCreature(creature: BattleCreatureStats): boolean {
  return (creature.shots ?? 0) > 0;
}

export function getStack(state: BattleState, id: StackId): BattleStack {
  const s = state.stacks.find((x) => x.id === id);
  if (!s) throw new Error(`no stack ${id}`);
  return s;
}

export function activeStack(state: BattleState): BattleStack | null {
  return state.activeStackId === null
    ? null
    : getStack(state, state.activeStackId);
}

export function enemySide(side: BattleSide): BattleSide {
  return side === "attacker" ? "defender" : "attacker";
}

/** Turn-order comparator: Speed descending, attacker first, then slot. */
export function compareTurnOrder(a: BattleStack, b: BattleStack): number {
  if (a.creature.speed !== b.creature.speed)
    return b.creature.speed - a.creature.speed;
  if (a.side !== b.side) return a.side === "attacker" ? -1 : 1;
  return a.slot - b.slot;
}

/** Waiting stacks: slowest first, then attacker first, then slot. */
function compareWaitOrder(a: BattleStack, b: BattleStack): number {
  if (a.creature.speed !== b.creature.speed)
    return a.creature.speed - b.creature.speed;
  if (a.side !== b.side) return a.side === "attacker" ? -1 : 1;
  return a.slot - b.slot;
}

// ---------------------------------------------------------------------------
// Movement

interface Reach {
  readonly dist: Int16Array;
  readonly prev: Int16Array;
}

function blockedCells(state: BattleState, moverId: StackId | null): Uint8Array {
  const blocked = new Uint8Array(BATTLE_HEX_COUNT);
  for (const o of state.obstacles) blocked[hexIndex(o)] = 1;
  for (const s of state.stacks) {
    if (isAlive(s) && s.id !== moverId) blocked[hexIndex(s.hex)] = 1;
  }
  return blocked;
}

function bfs(state: BattleState, stack: BattleStack): Reach {
  const dist = new Int16Array(BATTLE_HEX_COUNT).fill(-1);
  const prev = new Int16Array(BATTLE_HEX_COUNT).fill(-1);
  const blocked = blockedCells(state, stack.id);
  const start = hexIndex(stack.hex);
  dist[start] = 0;
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi] as number;
    const d = dist[cur] as number;
    if (d >= stack.creature.speed) continue;
    for (const n of neighbors(hexFromIndex(cur))) {
      const ni = hexIndex(n);
      if (blocked[ni] || dist[ni] !== -1) continue;
      dist[ni] = d + 1;
      prev[ni] = cur;
      queue.push(ni);
    }
  }
  return { dist, prev };
}

/**
 * Hexes the stack can stand on this turn (its own hex at distance 0), as
 * hex index -> hexes moved. Obstacles and every other living stack block.
 */
export function reachableHexes(
  state: BattleState,
  stackId: StackId,
): Map<number, number> {
  const { dist } = bfs(state, getStack(state, stackId));
  const out = new Map<number, number>();
  for (let i = 0; i < BATTLE_HEX_COUNT; i++) {
    const d = dist[i] as number;
    if (d >= 0) out.set(i, d);
  }
  return out;
}

/** Shortest path (hexes entered, ending at `to`), or null if unreachable. */
export function findPath(
  state: BattleState,
  stackId: StackId,
  to: Hex,
): Hex[] | null {
  if (!inBounds(to)) return null;
  const { dist, prev } = bfs(state, getStack(state, stackId));
  let cur = hexIndex(to);
  if ((dist[cur] as number) < 0) return null;
  const path: Hex[] = [];
  while ((dist[cur] as number) > 0) {
    path.push(hexFromIndex(cur));
    cur = prev[cur] as number;
  }
  return path.reverse();
}

function enemyAdjacent(
  state: BattleState,
  stack: BattleStack,
  at: Hex = stack.hex,
): boolean {
  return state.stacks.some(
    (s) => isAlive(s) && s.side !== stack.side && isAdjacent(s.hex, at),
  );
}

/** Ranged, has shots and no enemy stack adjacent. */
export function canShoot(state: BattleState, stackId: StackId): boolean {
  const s = getStack(state, stackId);
  return (
    isRangedCreature(s.creature) && s.shotsLeft > 0 && !enemyAdjacent(state, s)
  );
}

// ---------------------------------------------------------------------------
// Legal actions

/** Every legal action of the active stack, in a fixed deterministic order. */
export function legalActions(state: BattleState): BattleAction[] {
  const s = activeStack(state);
  if (!s || state.winner !== null) return [];
  const out: BattleAction[] = [];
  const { dist } = bfs(state, s);
  const enemies = state.stacks.filter((e) => isAlive(e) && e.side !== s.side);
  if (canShoot(state, s.id)) {
    for (const e of enemies)
      out.push({ type: "shoot", stackId: s.id, targetId: e.id });
  }
  for (const e of enemies) {
    const froms = neighbors(e.hex)
      .map(hexIndex)
      .filter((i) => (dist[i] as number) >= 0)
      .sort((a, b) => a - b);
    for (const i of froms) {
      out.push({
        type: "attack",
        stackId: s.id,
        targetId: e.id,
        from: hexFromIndex(i),
      });
    }
  }
  for (let i = 0; i < BATTLE_HEX_COUNT; i++) {
    if ((dist[i] as number) > 0)
      out.push({ type: "move", stackId: s.id, to: hexFromIndex(i) });
  }
  out.push({ type: "defend", stackId: s.id });
  if (!s.waitedThisRound) out.push({ type: "wait", stackId: s.id });
  return out;
}

/** Why the action is illegal, or null when it is legal. */
export function actionError(
  state: BattleState,
  action: BattleAction,
): string | null {
  if (state.winner !== null) return "the battle is over";
  if (action.stackId !== state.activeStackId)
    return `${action.stackId} is not the active stack`;
  const s = getStack(state, action.stackId);
  switch (action.type) {
    case "wait":
      return s.waitedThisRound ? "already waited this round" : null;
    case "defend":
      return null;
    case "move": {
      if (!inBounds(action.to)) return "destination out of bounds";
      if (sameHex(action.to, s.hex)) return "a move must leave the hex";
      const { dist } = bfs(state, s);
      return (dist[hexIndex(action.to)] as number) > 0
        ? null
        : "destination not reachable";
    }
    case "shoot": {
      const t = state.stacks.find((x) => x.id === action.targetId);
      if (!t || !isAlive(t) || t.side === s.side) return "no such enemy stack";
      return canShoot(state, s.id) ? null : "this stack cannot shoot now";
    }
    case "attack": {
      const t = state.stacks.find((x) => x.id === action.targetId);
      if (!t || !isAlive(t) || t.side === s.side) return "no such enemy stack";
      if (!inBounds(action.from)) return "attack hex out of bounds";
      if (!isAdjacent(action.from, t.hex))
        return "attack hex is not adjacent to the target";
      const { dist } = bfs(state, s);
      return (dist[hexIndex(action.from)] as number) >= 0
        ? null
        : "attack hex not reachable";
    }
  }
}

export function isLegalAction(
  state: BattleState,
  action: BattleAction,
): boolean {
  return actionError(state, action) === null;
}

// ---------------------------------------------------------------------------
// Draft: copy-on-write working copy of a state

class Draft {
  stacks: BattleStack[];
  round: number;
  queue: StackId[];
  waiting: StackId[];
  activeStackId: StackId | null;
  winner: BattleSide | null;
  readonly events: BattleEvent[] = [];
  private readonly base: BattleState;
  private readonly index = new Map<StackId, number>();

  constructor(state: BattleState) {
    this.base = state;
    this.stacks = state.stacks.slice();
    this.round = state.round;
    this.queue = state.queue.slice();
    this.waiting = state.waiting.slice();
    this.activeStackId = state.activeStackId;
    this.winner = state.winner;
    this.stacks.forEach((s, i) => this.index.set(s.id, i));
  }

  get(id: StackId): BattleStack {
    const i = this.index.get(id);
    if (i === undefined) throw new Error(`no stack ${id}`);
    return this.stacks[i] as BattleStack;
  }

  set(stack: BattleStack): void {
    const i = this.index.get(stack.id);
    if (i === undefined) throw new Error(`no stack ${stack.id}`);
    this.stacks[i] = stack;
  }

  update(id: StackId, patch: Partial<BattleStack>): BattleStack {
    const next = { ...this.get(id), ...patch };
    this.set(next);
    return next;
  }

  toState(): BattleState {
    return {
      seed: this.base.seed,
      obstacles: this.base.obstacles,
      sides: this.base.sides,
      stacks: this.stacks.slice(),
      round: this.round,
      queue: this.queue.slice(),
      waiting: this.waiting.slice(),
      activeStackId: this.activeStackId,
      winner: this.winner,
    };
  }
}

// ---------------------------------------------------------------------------
// Strikes

function sum(mods: readonly FlatModifier[]): number {
  return mods.reduce((t, m) => t + m.amount, 0);
}

/** The full damage computation for one strike (no state change). */
export function computeBreakdown(ctx: StrikeContext): DamageBreakdown {
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

  const abilityMultipliers = collectDamageMultipliers(ctx);
  const rangedInMelee = isRangedCreature(attacker.creature) && kind !== "shot";
  const { damage, multiplier } = computeDamage({
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
    rangedInMelee,
    damage,
  };
}

interface AppliedStatus {
  readonly stackId: StackId;
  readonly status: StatusId;
  readonly expiresAfterRound: number;
}

function removeFromTurnLists(d: Draft, id: StackId): void {
  d.queue = d.queue.filter((x) => x !== id);
  d.waiting = d.waiting.filter((x) => x !== id);
}

function strike(
  d: Draft,
  attackerId: StackId,
  defenderId: StackId,
  kind: StrikeKind,
  hexesMoved: number,
  applied: AppliedStatus[],
): { result: StrikeResult; ctx: StrikeContext } {
  const ctx: StrikeContext = {
    state: d.toState(),
    attacker: d.get(attackerId),
    defender: d.get(defenderId),
    kind,
    hexesMoved,
  };
  const breakdown = computeBreakdown(ctx);
  const target = ctx.defender;
  const res = applyDamageToStack(
    { count: target.count, hp: target.creature.hp, topHp: target.topHp },
    breakdown.damage,
  );
  d.update(defenderId, { count: res.count, topHp: res.topHp });
  const result: StrikeResult = {
    attackerId,
    targetId: defenderId,
    kind,
    breakdown,
    damage: breakdown.damage,
    kills: res.kills,
    hpLost: res.hpLost,
    targetCountAfter: res.count,
    targetTopHpAfter: res.topHp,
  };
  d.events.push({
    type: "damage",
    sourceId: attackerId,
    targetId: defenderId,
    kind,
    damage: breakdown.damage,
    kills: res.kills,
    countAfter: res.count,
    topHpAfter: res.topHp,
    breakdown,
  });
  if (res.count === 0) {
    d.events.push({ type: "death", stackId: defenderId });
    removeFromTurnLists(d, defenderId);
  } else {
    for (const a of collectOnHit(ctx)) {
      const cur = d.get(defenderId);
      d.set({
        ...cur,
        statuses: withStatus(cur.statuses, {
          id: a.status,
          expiresAfterRound: a.expiresAfterRound,
          sourceId: attackerId,
        }),
      });
      applied.push({
        stackId: defenderId,
        status: a.status,
        expiresAfterRound: a.expiresAfterRound,
      });
      d.events.push({
        type: "status",
        stackId: defenderId,
        status: a.status,
        change: "applied",
        expiresAfterRound: a.expiresAfterRound,
      });
    }
  }
  return { result, ctx };
}

interface AttackOutcome {
  readonly hexesMoved: number;
  readonly strike: StrikeResult;
  readonly retaliation: StrikeResult | null;
  readonly statusesApplied: AppliedStatus[];
}

function moveStack(d: Draft, stackId: StackId, path: readonly Hex[]): void {
  if (path.length === 0) return;
  const s = d.get(stackId);
  const to = path[path.length - 1] as Hex;
  d.events.push({ type: "move", stackId, from: s.hex, to, path });
  d.update(stackId, { hex: to });
}

/** Runs an attack or shot on the draft (legality already checked). */
function performAttack(d: Draft, action: AttackAction): AttackOutcome {
  const applied: AppliedStatus[] = [];
  if (action.type === "shoot") {
    const s = d.get(action.stackId);
    d.update(action.stackId, { shotsLeft: s.shotsLeft - 1 });
    d.events.push({
      type: "shoot",
      stackId: action.stackId,
      targetId: action.targetId,
    });
    const { result } = strike(
      d,
      action.stackId,
      action.targetId,
      "shot",
      0,
      applied,
    );
    return {
      hexesMoved: 0,
      strike: result,
      retaliation: null,
      statusesApplied: applied,
    };
  }
  const path = findPath(d.toState(), action.stackId, action.from);
  if (!path) throw new Error("attack hex not reachable");
  moveStack(d, action.stackId, path);
  d.events.push({
    type: "attack",
    stackId: action.stackId,
    targetId: action.targetId,
  });
  const first = strike(
    d,
    action.stackId,
    action.targetId,
    "melee",
    path.length,
    applied,
  );
  let retaliation: StrikeResult | null = null;
  const target = d.get(action.targetId);
  if (
    isAlive(target) &&
    !target.retaliatedThisRound &&
    !retaliationPrevented(first.ctx)
  ) {
    d.update(action.targetId, { retaliatedThisRound: true });
    d.events.push({
      type: "retaliation",
      stackId: action.targetId,
      targetId: action.stackId,
    });
    retaliation = strike(
      d,
      action.targetId,
      action.stackId,
      "retaliation",
      0,
      applied,
    ).result;
  }
  return {
    hexesMoved: path.length,
    strike: first.result,
    retaliation,
    statusesApplied: applied,
  };
}

/**
 * Exactly what an attack or shot will do: damage, kills, the retaliation on
 * the survivors and the modifiers that applied. Throws on an illegal action.
 */
export function previewAttack(
  state: BattleState,
  action: AttackAction,
): AttackPreview {
  const err = actionError(state, action);
  if (err) throw new Error(`illegal action: ${err}`);
  const out = performAttack(new Draft(state), action);
  return {
    action,
    hexesMoved: out.hexesMoved,
    damage: out.strike.damage,
    kills: out.strike.kills,
    retaliationDamage: out.retaliation?.damage ?? 0,
    retaliationKills: out.retaliation?.kills ?? 0,
    strike: out.strike,
    retaliation: out.retaliation,
    statusesApplied: out.statusesApplied,
  };
}

// ---------------------------------------------------------------------------
// Turns and rounds

function sideAlive(d: Draft, side: BattleSide): boolean {
  return d.stacks.some((s) => s.side === side && isAlive(s));
}

function checkWinner(d: Draft): boolean {
  if (d.winner !== null) return true;
  const a = sideAlive(d, "attacker");
  const b = sideAlive(d, "defender");
  if (a && b) return false;
  d.winner = a ? "attacker" : "defender";
  d.activeStackId = null;
  d.queue = [];
  d.waiting = [];
  d.events.push({ type: "end", winner: d.winner, reason: "eliminated" });
  return true;
}

function endRound(d: Draft): void {
  for (const s of d.stacks) {
    const expired = s.statuses.filter((st) => st.expiresAfterRound <= d.round);
    if (expired.length === 0) continue;
    d.update(s.id, {
      statuses: s.statuses.filter((st) => st.expiresAfterRound > d.round),
    });
    if (!isAlive(s)) continue;
    for (const st of expired) {
      d.events.push({
        type: "status",
        stackId: s.id,
        status: st.id,
        change: "expired",
        expiresAfterRound: st.expiresAfterRound,
      });
    }
  }
}

function startRound(d: Draft, round: number): void {
  d.round = round;
  for (const s of d.stacks) {
    if (s.retaliatedThisRound || s.waitedThisRound) {
      d.update(s.id, { retaliatedThisRound: false, waitedThisRound: false });
    }
  }
  d.queue = d.stacks
    .filter(isAlive)
    .sort(compareTurnOrder)
    .map((s) => s.id);
  d.waiting = [];
  d.events.push({ type: "roundStart", round });
}

function beginTurn(d: Draft, id: StackId): void {
  d.activeStackId = id;
  d.events.push({ type: "turnStart", stackId: id });
  const s = d.get(id);
  if (s.turnStartedRound === d.round) return;
  let next: BattleStack = { ...s, turnStartedRound: d.round, defending: false };
  for (const ab of next.creature.abilities) {
    const eff = ABILITY_HOOKS[ab].onTurnStart?.(next);
    if (eff && eff.topHp !== next.topHp) {
      d.events.push({
        type: "heal",
        stackId: id,
        source: ab,
        amount: eff.topHp - next.topHp,
        topHpAfter: eff.topHp,
      });
      next = { ...next, topHp: eff.topHp };
    }
  }
  d.set(next);
}

/** Picks the next stack to act, rolling rounds over as needed. */
function advance(d: Draft): void {
  if (checkWinner(d)) return;
  for (;;) {
    const next = d.queue[0] ?? d.waiting[0];
    if (next !== undefined) {
      beginTurn(d, next);
      return;
    }
    endRound(d);
    startRound(d, d.round + 1);
  }
}

/** Starts a battle from a prepared (not yet started) state. Internal to setup. */
export function startBattle(state: BattleState, round: number): BattleStep {
  const d = new Draft(state);
  if (!checkWinner(d)) {
    startRound(d, round);
    advance(d);
  }
  return { state: d.toState(), events: d.events };
}

/** Applies the active stack's action. Throws on an illegal action. */
export function applyAction(
  state: BattleState,
  action: BattleAction,
): BattleStep {
  const err = actionError(state, action);
  if (err) throw new Error(`illegal action: ${err}`);
  const d = new Draft(state);
  const id = action.stackId;
  switch (action.type) {
    case "wait": {
      d.update(id, { waitedThisRound: true });
      d.events.push({ type: "wait", stackId: id });
      d.queue = d.queue.filter((x) => x !== id);
      d.waiting = [...d.waiting, id].sort((a, b) =>
        compareWaitOrder(d.get(a), d.get(b)),
      );
      d.activeStackId = null;
      advance(d);
      return { state: d.toState(), events: d.events };
    }
    case "defend":
      d.update(id, { defending: true });
      d.events.push({ type: "defend", stackId: id });
      break;
    case "move": {
      const path = findPath(state, id, action.to);
      if (!path) throw new Error("destination not reachable");
      moveStack(d, id, path);
      break;
    }
    case "attack":
    case "shoot":
      performAttack(d, action);
      break;
  }
  removeFromTurnLists(d, id);
  d.activeStackId = null;
  advance(d);
  return { state: d.toState(), events: d.events };
}

/** Ends a battle that hit a round limit (no winner). */
export function endByRoundLimit(state: BattleState): BattleStep {
  const d = new Draft(state);
  d.activeStackId = null;
  d.queue = [];
  d.waiting = [];
  d.events.push({ type: "end", winner: null, reason: "roundLimit" });
  return { state: d.toState(), events: d.events };
}
