/**
 * The deterministic battle engine (GAME_DESIGN.md 9, RULES_V2.md 1): legal
 * actions, movement, the round structure of 1.6, actions of 1.7, the
 * battle-end rules of 1.12.
 *
 * States are immutable. {@link applyAction} copies what it changes and
 * returns the new state with the events to animate. The rehearsal
 * (rehearse.ts) runs the very same code on a copy, so a preview always
 * equals what applying the action does.
 */

import { isAlive } from "./abilities.ts";
import {
  act as actDef,
  ability,
  conditionKind,
  effect,
  groundKind,
} from "./registry.ts";
import {
  Draft,
  Resolver,
  ROUND_LIMIT,
  bears,
  blockingHexes,
  effectiveSpeed,
  enemySide,
  groundAt,
  isRangedCreature,
  timelineClass,
} from "./resolve.ts";
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
  JsonValue,
  ActTarget,
  AttackAction,
  AttackPreview,
  BattleAction,
  BattleSide,
  BattleStack,
  BattleState,
  BattleStep,
  StackId,
} from "./types.ts";

export { enemySide, isRangedCreature } from "./resolve.ts";
export { computeBreakdown } from "./resolve.ts";

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

/**
 * Turn-order comparator (1.6): timeline class (Hastened, normal, Delayed),
 * effective Speed descending, attacker's owner first, then field order.
 */
export function compareTurnOrder(a: BattleStack, b: BattleStack): number {
  const ca = timelineClass(a);
  const cb = timelineClass(b);
  if (ca !== cb) return ca - cb;
  const sa = effectiveSpeed(a);
  const sb = effectiveSpeed(b);
  if (sa !== sb) return sb - sa;
  if (a.owner !== b.owner) return a.owner === "attacker" ? -1 : 1;
  if (a.summoned !== b.summoned) return a.summoned ? 1 : -1;
  return a.slot - b.slot;
}

/** Waiting stacks: slowest first, then attacker's owner first, then field order. */
function compareWaitOrder(a: BattleStack, b: BattleStack): number {
  const sa = effectiveSpeed(a);
  const sb = effectiveSpeed(b);
  if (sa !== sb) return sa - sb;
  if (a.owner !== b.owner) return a.owner === "attacker" ? -1 : 1;
  if (a.summoned !== b.summoned) return a.summoned ? 1 : -1;
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
  for (const o of blockingHexes(state)) blocked[hexIndex(o)] = 1;
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
  const speed = effectiveSpeed(stack);
  dist[start] = 0;
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi] as number;
    const d = dist[cur] as number;
    if (d >= speed) continue;
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
 * hex index -> hexes moved. Blocking ground and every other living stack
 * block.
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

/** Ranged, has shots, may shoot and no enemy stack adjacent. */
export function canShoot(state: BattleState, stackId: StackId): boolean {
  const s = getStack(state, stackId);
  const g = groundAt(state, s.hex);
  return (
    isRangedCreature(s.creature) &&
    s.shotsLeft > 0 &&
    !bears(s, "cannotShoot") &&
    !(g !== null && groundKind(g.kind).cannotShoot === true) &&
    !enemyAdjacent(state, s)
  );
}

export function canWait(stack: BattleStack): boolean {
  return !stack.waitedThisRound && !bears(stack, "cannotWait");
}

// ---------------------------------------------------------------------------
// Legal actions

/**
 * Every legal move, attack, shot, defend and wait of the active stack, in a
 * fixed deterministic order. Abilities, hero acts and retreat take chosen
 * targets and are checked by {@link actionError}.
 */
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
  if (canWait(s)) out.push({ type: "wait", stackId: s.id });
  return out;
}

/** Shape checks of chosen targets (law 5: any stack or hex is legal). */
function targetsError(
  state: BattleState,
  targets: readonly ActTarget[],
  want: number,
): string | null {
  if (targets.length !== want) return `choose ${want} target(s)`;
  for (const t of targets) {
    if ("stack" in t) {
      const s = state.stacks.find((x) => x.id === t.stack);
      if (!s || !isAlive(s)) return `no living stack ${t.stack}`;
      if ("condition" in t && !s.conditions.some((c) => c.uid === t.condition))
        return `${t.stack} bears no condition ${t.condition}`;
    } else if (!inBounds(t.hex)) {
      return "target hex out of bounds";
    }
  }
  return null;
}

/** The hero acts a side may still use (1.7, 1.11). */
export function heroActError(
  state: BattleState,
  side: BattleSide,
  actId: string,
): string | null {
  const sideState = state.sides[side];
  if (!sideState.hero) return "this side has no hero";
  const def = actDef(actId);
  switch (def.kind) {
    case "cast":
      return sideState.castRound === state.round
        ? "the hero has already cast this round"
        : null;
    case "command":
      return sideState.commandUsed ? "the Command is used" : null;
    case "item":
      if (!(sideState.hero.itemActs ?? []).includes(actId))
        return "the hero carries no such item";
      return sideState.itemActsUsed.includes(actId)
        ? "this item act is used"
        : null;
    case "ability":
      return "an ability is not a hero act";
  }
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
      if (s.waitedThisRound) return "already waited this round";
      return bears(s, "cannotWait") ? "this stack cannot Wait" : null;
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
    case "ability": {
      if (!s.creature.abilities.includes(action.ability))
        return `${s.creature.id} has no ability ${action.ability}`;
      const actId = ability(action.ability).act;
      if (!actId) return `${action.ability} is not an activated ability`;
      if (s.abilitiesUsed.includes(action.ability))
        return "this ability is used for the battle";
      const def = actDef(actId);
      return (
        targetsError(state, action.targets, def.targets) ??
        def.check?.(state, s.id, action.targets) ??
        null
      );
    }
    case "heroAct": {
      const err = heroActError(state, s.side, action.act);
      if (err) return err;
      const def = actDef(action.act);
      return (
        targetsError(state, action.targets, def.targets) ??
        def.check?.(state, s.id, action.targets) ??
        null
      );
    }
    case "retreat": {
      const side = state.sides[s.side];
      if (!side.hero) return "this side has no hero";
      return side.canRetreat ? null : "this hero cannot retreat";
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
// Turns and rounds

/**
 * The battle-end test (1.12): a side loses when it owns no living stack
 * that is not summoned and no scheduled event will return one. Both at
 * once: the defender wins.
 */
function checkWinner(d: Draft): boolean {
  if (d.winner !== null) return true;
  const lost = (side: BattleSide): boolean =>
    !d.stacks.some((s) => s.owner === side && isAlive(s) && !s.summoned) &&
    !d.scheduled.some((e) => e.side === side && e.returnsStack === true);
  const la = lost("attacker");
  const ld = lost("defender");
  if (!la && !ld) return false;
  finish(d, la ? "defender" : "attacker", "eliminated");
  return true;
}

function finish(
  d: Draft,
  winner: BattleSide,
  reason: "eliminated" | "roundLimit" | "retreat",
): void {
  d.winner = winner;
  d.endReason = reason;
  d.activeStackId = null;
  d.queue = [];
  d.waiting = [];
  d.extraTurns = [];
  d.emit({ type: "end", winner, reason }, "engine:end");
}

function resolverFor(d: Draft): Resolver {
  return new Resolver(d, () => checkWinner(d));
}

function endRound(d: Draft, fx: Resolver): void {
  d.emit({ type: "roundEnd", round: d.round });
  // 1. Scheduled events due at round end.
  fx.fireScheduled("end");
  if (checkWinner(d)) return;
  // 2. Round-end hooks, field order, list order.
  d.beginStep();
  for (const s of d.stacks) {
    if (!isAlive(s)) continue;
    for (const c of s.conditions) {
      const def = conditionKind(c.kind);
      if (def.onRoundEnd && fx.isAlive(s.id))
        d.within(null, `condition:${c.kind}`, () =>
          def.onRoundEnd?.(fx, s.id, c),
        );
    }
  }
  fx.resolveReactions();
  if (checkWinner(d)) return;
  // 3. Clocks tick: conditions in field order and list order, then ground.
  d.beginStep();
  for (const s of d.stacks.slice()) {
    if (!fx.isAlive(s.id)) continue;
    for (const c of d.get(s.id).conditions) {
      if (!fx.isAlive(s.id)) break;
      const cur = d.get(s.id).conditions.find((x) => x.uid === c.uid);
      if (!cur) continue;
      const next = {
        ...cur,
        roundsBorne: cur.roundsBorne + 1,
        clock: cur.clock === null ? null : cur.clock - 1,
      };
      d.update(s.id, {
        conditions: d
          .get(s.id)
          .conditions.map((x) => (x.uid === c.uid ? next : x)),
      });
      if (next.clock === 0) fx.expire(s.id, c.uid);
    }
  }
  for (const g of d.ground.slice()) {
    if (g.clock === null) continue;
    if (g.clock <= 1) {
      d.ground = d.ground.filter((x) => x !== g);
      d.emit({ type: "ground", change: "ended", feature: g });
    } else {
      const next = { ...g, clock: g.clock - 1 };
      d.ground = d.ground.map((x) => (x === g ? next : x));
    }
  }
  fx.resolveReactions();
  if (checkWinner(d)) return;
  // 4. Wary counters drop.
  for (const s of d.stacks) {
    if (s.wary > 0) d.update(s.id, { wary: s.wary - 1 });
  }
  // Round limit: the defender wins.
  if (d.round >= ROUND_LIMIT) finish(d, "defender", "roundLimit");
}

function startRound(d: Draft, fx: Resolver, round: number): void {
  d.round = round;
  for (const s of d.stacks) {
    if (s.retaliatedThisRound || s.waitedThisRound) {
      d.update(s.id, { retaliatedThisRound: false, waitedThisRound: false });
    }
  }
  d.waiting = [];
  d.extraTurns = [];
  d.emit({ type: "roundStart", round });
  fx.fireScheduled("start");
  if (d.winner !== null) return;
  d.queue = d.stacks
    .filter(isAlive)
    .sort(compareTurnOrder)
    .map((s) => s.id);
}

/**
 * The next stack to act (1.6): queue then waiting stacks, by timeline
 * class read live (a stack gaining Delayed moves to the back, Hastened to
 * the front).
 */
function pickNext(d: Draft): StackId | null {
  return orderOf(d.queue, d.waiting, (id) => d.get(id))[0] ?? null;
}

function orderOf(
  queue: readonly StackId[],
  waiting: readonly StackId[],
  get: (id: StackId) => BattleStack,
): StackId[] {
  const out: StackId[] = [];
  for (const cls of [0, 1, 2] as const) {
    for (const id of [...queue, ...waiting]) {
      if (timelineClass(get(id)) === cls && !out.includes(id)) out.push(id);
    }
  }
  return out;
}

/**
 * The order in which stacks will act for the rest of this round as the
 * board stands (the timeline bar): the active stack, granted extra turns,
 * then the queue and waiting stacks by timeline class.
 */
export function turnOrder(state: BattleState): StackId[] {
  const out: StackId[] = [];
  if (state.activeStackId !== null) out.push(state.activeStackId);
  for (const id of state.extraTurns) if (!out.includes(id)) out.push(id);
  for (const id of orderOf(state.queue, state.waiting, (id) =>
    getStack(state, id),
  )) {
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * Turn start (1.6 step 3.1): ground, conditions, abilities. Returns false
 * when the turn is skipped (dead, Frozen or Asleep).
 */
function beginTurn(
  d: Draft,
  fx: Resolver,
  id: StackId,
  extra: boolean,
): boolean {
  d.activeStackId = id;
  d.emit({ type: "turnStart", stackId: id });
  const s = d.get(id);
  if (!extra && s.turnStartedRound !== d.round) {
    d.update(id, { turnStartedRound: d.round, defending: false });
    d.beginStep({ actorId: id, targetIds: [] });
    const g = groundAt(d, s.hex);
    if (g && g.class === "hazard") {
      const def = groundKind(g.kind);
      if (def.onTurnStart)
        d.within(null, `ground:${g.kind}`, () => def.onTurnStart?.(fx, id, g));
    }
    for (const c of s.conditions) {
      const def = conditionKind(c.kind);
      if (def.onTurnStart && fx.isAlive(id)) {
        const cur = d.get(id).conditions.find((x) => x.uid === c.uid);
        if (cur)
          d.within(null, `condition:${c.kind}`, () =>
            def.onTurnStart?.(fx, id, cur),
          );
      }
    }
    for (const a of s.creature.abilities) {
      const def = ability(a);
      if (def.onTurnStart && fx.isAlive(id))
        d.within(null, `ability:${a}`, () => def.onTurnStart?.(fx, id));
    }
    fx.resolveReactions();
    if (checkWinner(d)) return false;
  }
  if (!fx.isAlive(id)) {
    d.activeStackId = null;
    return false;
  }
  const held = d
    .get(id)
    .conditions.find((c) => conditionKind(c.kind).cannotAct);
  if (held) {
    d.emit({ type: "turnSkipped", stackId: id, condition: held.kind });
    d.queue = d.queue.filter((x) => x !== id);
    d.waiting = d.waiting.filter((x) => x !== id);
    d.activeStackId = null;
    return false;
  }
  return true;
}

/** Picks the next stack to act, rolling rounds over as needed. */
function advance(d: Draft, fx: Resolver): void {
  for (;;) {
    if (checkWinner(d)) return;
    while (d.extraTurns.length > 0) {
      const id = d.extraTurns.shift() as StackId;
      if (!fx.isAlive(id)) continue;
      if (beginTurn(d, fx, id, true)) return;
      if (d.winner !== null) return;
    }
    const next = pickNext(d);
    if (next !== null) {
      if (beginTurn(d, fx, next, false)) return;
      continue;
    }
    endRound(d, fx);
    if (d.winner !== null) return;
    startRound(d, fx, d.round + 1);
  }
}

/** Starts a battle from a prepared (not yet started) state. Internal to setup. */
export function startBattle(
  state: BattleState,
  round: number,
  before?: (fx: Resolver, d: Draft) => void,
): BattleStep {
  const d = new Draft(state);
  const fx = resolverFor(d);
  if (before) before(fx, d);
  if (!checkWinner(d)) {
    startRound(d, fx, round);
    advance(d, fx);
  }
  return { state: d.toState(), events: d.events };
}

function actionTargets(action: BattleAction): StackId[] {
  switch (action.type) {
    case "attack":
    case "shoot":
      return [action.targetId];
    case "ability":
    case "heroAct":
      return action.targets.flatMap((t) => ("stack" in t ? [t.stack] : []));
    default:
      return [];
  }
}

/** Runs an attack or shot on the draft (legality already checked). */
function performAttack(d: Draft, fx: Resolver, action: AttackAction): number {
  if (action.type === "shoot") {
    const s = d.get(action.stackId);
    d.update(action.stackId, { shotsLeft: s.shotsLeft - 1 });
    const idx = d.emit({
      type: "shoot",
      stackId: action.stackId,
      targetId: action.targetId,
    });
    d.within(idx, null, () =>
      fx.strikeKind(action.stackId, action.targetId, "shot", 0),
    );
    return 0;
  }
  const path = findPath(d.toState(), action.stackId, action.from);
  if (!path) throw new Error("attack hex not reachable");
  fx.walk(action.stackId, path, "walk");
  if (!fx.isAlive(action.stackId) || !fx.isAlive(action.targetId))
    return path.length;
  const idx = d.emit({
    type: "attack",
    stackId: action.stackId,
    targetId: action.targetId,
  });
  d.within(idx, null, () =>
    fx.strikeKind(action.stackId, action.targetId, "melee", path.length),
  );
  return path.length;
}

/** Applies the active stack's action. Throws on an illegal action. */
export function applyAction(
  state: BattleState,
  action: BattleAction,
): BattleStep {
  const err = actionError(state, action);
  if (err) throw new Error(`illegal action: ${err}`);
  const d = new Draft(state);
  const fx = resolverFor(d);
  const id = action.stackId;
  d.beginStep({ actorId: id, targetIds: actionTargets(action) });
  switch (action.type) {
    case "wait": {
      d.update(id, { waitedThisRound: true });
      d.emit({ type: "wait", stackId: id });
      d.queue = d.queue.filter((x) => x !== id);
      d.waiting = [...d.waiting, id].sort((a, b) =>
        compareWaitOrder(d.get(a), d.get(b)),
      );
      d.activeStackId = null;
      advance(d, fx);
      return { state: d.toState(), events: d.events };
    }
    case "retreat": {
      const side = d.get(id).side;
      d.emit({ type: "retreat", side });
      finish(d, enemySide(side), "retreat");
      return { state: d.toState(), events: d.events };
    }
    case "heroAct": {
      const side = d.get(id).side;
      const def = actDef(action.act);
      const sideState = d.sides[side];
      d.sides = {
        ...d.sides,
        [side]: {
          ...sideState,
          ...(def.kind === "cast" ? { castRound: d.round } : {}),
          ...(def.kind === "command" ? { commandUsed: true } : {}),
          ...(def.kind === "item"
            ? { itemActsUsed: [...sideState.itemActsUsed, action.act] }
            : {}),
        },
      };
      const idx = d.emit(
        { type: "heroAct", side, act: action.act },
        action.act,
      );
      d.within(idx, action.act, () => def.resolve(fx, id, action.targets));
      fx.resolveReactions();
      if (checkWinner(d)) return { state: d.toState(), events: d.events };
      // The stack has not acted yet: its turn goes on unless it cannot.
      const s = d.get(id);
      if (isAlive(s) && !bears(s, "cannotAct")) {
        return { state: d.toState(), events: d.events };
      }
      d.queue = d.queue.filter((x) => x !== id);
      d.waiting = d.waiting.filter((x) => x !== id);
      d.activeStackId = null;
      advance(d, fx);
      return { state: d.toState(), events: d.events };
    }
    case "defend":
      d.update(id, { defending: true });
      d.emit({ type: "defend", stackId: id });
      break;
    case "move": {
      const path = findPath(state, id, action.to);
      if (!path) throw new Error("destination not reachable");
      fx.walk(id, path, "walk");
      break;
    }
    case "attack":
    case "shoot":
      performAttack(d, fx, action);
      break;
    case "ability": {
      const s = d.get(id);
      d.update(id, { abilitiesUsed: [...s.abilitiesUsed, action.ability] });
      const actId = ability(action.ability).act as string;
      const idx = d.emit(
        { type: "ability", stackId: id, ability: action.ability },
        `ability:${action.ability}`,
      );
      d.within(idx, `ability:${action.ability}`, () =>
        actDef(actId).resolve(fx, id, action.targets),
      );
      break;
    }
  }
  fx.resolveReactions();
  if (!checkWinner(d)) {
    // Heartened (RULES_V2 6): after the bearer finishes a turn, its side may
    // end Heartened to give it an extra turn. Default: it does.
    const s = d.get(id);
    const hearten = "hearten" in action ? action.hearten !== false : true;
    const h = s.conditions.find((c) => c.kind === "heartened");
    if (hearten && h && isAlive(s) && s.extraTurnRound !== d.round) {
      d.within(null, "condition:heartened", () => {
        fx.endCondition(id, h.uid);
        fx.extraTurn(id);
      });
    }
  }
  d.queue = d.queue.filter((x) => x !== id);
  d.waiting = d.waiting.filter((x) => x !== id);
  d.activeStackId = null;
  advance(d, fx);
  return { state: d.toState(), events: d.events };
}

/**
 * Exactly what an attack or shot will do: damage, kills, the retaliation on
 * the survivors, the modifiers that applied and the full chain. Throws on
 * an illegal action.
 */
export function previewAttack(
  state: BattleState,
  action: AttackAction,
): AttackPreview {
  const err = actionError(state, action);
  if (err) throw new Error(`illegal action: ${err}`);
  const d = new Draft(state);
  const fx = resolverFor(d);
  d.beginStep({ actorId: action.stackId, targetIds: [action.targetId] });
  const hexesMoved = performAttack(d, fx, action);
  fx.resolveReactions();
  const chain = d.events;
  const strikes = chain.filter(
    (e): e is Extract<typeof e, { type: "damage" }> => e.type === "damage",
  );
  const toResult = (e: (typeof strikes)[number]) => ({
    attackerId: e.sourceId,
    targetId: e.targetId,
    kind: e.kind,
    breakdown: e.breakdown,
    damage: e.damage,
    kills: e.kills,
    hpLost: e.hpLost,
    targetCountAfter: e.countAfter,
    targetTopHpAfter: e.topHpAfter,
    redirectedTo: e.redirectedTo,
  });
  const first = strikes.find(
    (e) =>
      e.sourceId === action.stackId &&
      e.targetId === action.targetId &&
      (e.kind === "melee" || e.kind === "shot"),
  );
  if (!first) throw new Error("the attack made no strike");
  const ret =
    strikes.find(
      (e) => e.kind === "retaliation" && e.sourceId === action.targetId,
    ) ?? null;
  const conditionsApplied = chain.flatMap((e) =>
    e.type === "condition" && (e.change === "landed" || e.change === "merged")
      ? [
          {
            stackId: e.stackId,
            kind: e.condition.kind,
            clock: e.condition.clock,
            size: e.condition.size,
          },
        ]
      : [],
  );
  const strike = toResult(first);
  const retaliation = ret ? toResult(ret) : null;
  return {
    action,
    hexesMoved,
    damage: strike.damage,
    kills: strike.kills,
    retaliationDamage: retaliation?.damage ?? 0,
    retaliationKills: retaliation?.kills ?? 0,
    strike,
    retaliation,
    conditionsApplied,
    chain,
  };
}

/** Resolves battle-start rules of an army (4.6 form 2) by effect id. */
export function runStartRule(
  fx: Resolver,
  side: BattleSide,
  ref: { readonly id: string; readonly args?: JsonValue },
): void {
  fx.d.beginStep();
  const idx = fx.d.emit({ type: "heroAct", side, act: ref.id }, ref.id);
  fx.d.within(idx, ref.id, () =>
    effect(ref.id)(fx, ref.args, { side, source: ref.id }),
  );
  fx.resolveReactions();
}
