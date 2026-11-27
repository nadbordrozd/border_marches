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
  roundLimitOf,
  roundLimitWinner,
  bears,
  blockingHexes,
  effectiveSpeed,
  enemySide,
  groundAt,
  isRangedCreature,
  shootsPointBlank,
  timelineClass,
} from "./resolve.ts";
import {
  BATTLE_HEX_COUNT,
  hexDistance,
  hexFromIndex,
  hexIndex,
  inBounds,
  isAdjacent,
  neighbors,
  sameHex,
} from "./hex.ts";
import type { Hex } from "./hex.ts";
import {
  creatureCastError,
  creatureCastPower,
  echoError,
  fuelError,
  heroCastError,
  heroCastPower,
  heroManaCost,
  schoolRelation,
  secondCastError,
} from "./magic.ts";
import { adjacentStacks, hasRule, otherSide, strongestOf } from "./rules.ts";
import { stoke } from "./steam.ts";
import type { Acting } from "./resolve.ts";
import type {
  CastInfo,
  JsonValue,
  ActTarget,
  AttackAction,
  AttackPreview,
  BattleAction,
  BattleEvent,
  BattleSide,
  BattleStack,
  BattleState,
  BattleStep,
  NoStrikeReason,
  StackId,
  StrikeResult,
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

/** The stack's walk is a teleport within its Speed (Mist). */
export function teleportsToWalk(stack: BattleStack): boolean {
  return stack.creature.abilities.some((a) => ability(a).teleportWalk === true);
}

/**
 * The stack cannot walk now: it bears a condition that stops walking
 * (Stuck), or this is its round-end turn (Afters, FACTION_CANDY 5). Every
 * walk reads it, and every rule that replaces a walk (Mist, a Sworn swap).
 */
export function cannotWalk(state: BattleState, stack: BattleStack): boolean {
  return bears(stack, "cannotWalk") || stack.aftersRound === state.round;
}

/** The stack takes a round-end turn (an ability with `roundEndTurn`). */
function hasRoundEndTurn(stack: BattleStack): boolean {
  return stack.creature.abilities.some((a) => ability(a).roundEndTurn === true);
}

/**
 * Stacks that will take a round-end turn (Afters) once every other turn of
 * this round is done, as the board stands, in turn order: living, with the
 * ability, no extra turn yet this round and no Hold.
 */
export function aftersDue(state: BattleState): StackId[] {
  return state.stacks
    .filter(
      (s) =>
        isAlive(s) &&
        hasRoundEndTurn(s) &&
        s.extraTurnRound !== state.round &&
        !bears(s, "hold"),
    )
    .sort(compareTurnOrder)
    .map((s) => s.id);
}

function bfs(
  state: BattleState,
  stack: BattleStack,
  limit: number = effectiveSpeed(stack),
): Reach {
  const dist = new Int16Array(BATTLE_HEX_COUNT).fill(-1);
  const prev = new Int16Array(BATTLE_HEX_COUNT).fill(-1);
  const blocked = blockedCells(state, stack.id);
  const start = hexIndex(stack.hex);
  // A stack that cannot walk reaches only its own hex.
  const speed = cannotWalk(state, stack) ? 0 : limit;
  if (teleportsToWalk(stack)) {
    // Stacks, features and hazards between do not matter: any free hex
    // within Speed.
    for (let i = 0; i < BATTLE_HEX_COUNT; i++) {
      if (i !== start && blocked[i]) continue;
      const d = hexDistance(hexFromIndex(i), stack.hex);
      if (d <= speed) {
        dist[i] = d;
        prev[i] = start;
      }
    }
    return { dist, prev };
  }
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
  limit?: number,
): Hex[] | null {
  if (!inBounds(to)) return null;
  const stack = getStack(state, stackId);
  const { dist, prev } = bfs(state, stack, limit ?? effectiveSpeed(stack));
  let cur = hexIndex(to);
  if ((dist[cur] as number) < 0) return null;
  if (teleportsToWalk(stack)) return cur === hexIndex(stack.hex) ? [] : [to];
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

/**
 * Ranged, has shots, may shoot and no enemy stack adjacent (unless the
 * stack shoots point-blank: Turret).
 */
export function canShoot(
  state: BattleState,
  stackId: StackId,
  at?: Hex,
): boolean {
  const s = getStack(state, stackId);
  const hex = at ?? s.hex;
  const g = groundAt(state, hex);
  return (
    isRangedCreature(s.creature) &&
    s.shotsLeft > 0 &&
    !bears(s, "cannotShoot") &&
    // Soaked Powder: Drenched enemy stacks cannot shoot.
    !(
      s.conditions.some((c) => c.kind === "drenched") &&
      hasRule(state, otherSide(s.side), "soaked-powder")
    ) &&
    !(g !== null && groundKind(g.kind).cannotShoot === true) &&
    // Turret (FACTION_DWARVES 5): an enemy next to it does not stop it.
    (!enemyAdjacent(state, s, hex) || shootsPointBlank(s.creature))
  );
}

/** The shooter may aim at any hex (an ability with `shootAnyHex`). */
export function shootsAnyHex(stack: BattleStack): boolean {
  return stack.creature.abilities.some((a) => ability(a).shootAnyHex === true);
}

/**
 * The stacks the active stack may swap with in place of its walk: the far
 * ends of its links whose kind has `swapAction` (Sworn), still alive.
 */
export function swapPartners(state: BattleState, stackId: StackId): StackId[] {
  const s = getStack(state, stackId);
  const out: StackId[] = [];
  // The swap replaces the walk: a stack that cannot walk cannot swap.
  if (cannotWalk(state, s)) return out;
  for (const c of s.conditions) {
    if (c.link === null || conditionKind(c.kind).swapAction !== true) continue;
    const far = state.stacks.find((x) => x.id === c.link);
    if (far && isAlive(far) && !out.includes(far.id)) out.push(far.id);
  }
  return out;
}

/** A state with one stack moved (to test what it could do from there). */
function withStackAt(state: BattleState, id: StackId, hex: Hex): BattleState {
  return {
    ...state,
    stacks: state.stacks.map((x) => (x.id === id ? { ...x, hex } : x)),
  };
}

/** The state after a swap of two stacks' hexes (for legality checks). */
function swapped(state: BattleState, a: StackId, b: StackId): BattleState {
  const ha = getStack(state, a).hex;
  const hb = getStack(state, b).hex;
  return {
    ...state,
    stacks: state.stacks.map((x) =>
      x.id === a ? { ...x, hex: hb } : x.id === b ? { ...x, hex: ha } : x,
    ),
  };
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
  // A swap with a linked partner stands in for the walk (Sworn).
  for (const partner of swapPartners(state, s.id)) {
    const p = getStack(state, partner);
    out.push({ type: "move", stackId: s.id, to: p.hex, swapWith: partner });
    const after = swapped(state, s.id, partner);
    if (canShoot(after, s.id)) {
      for (const e of enemies)
        out.push({
          type: "shoot",
          stackId: s.id,
          targetId: e.id,
          swapWith: partner,
        });
    }
    for (const e of enemies) {
      if (isAdjacent(p.hex, e.hex))
        out.push({
          type: "attack",
          stackId: s.id,
          targetId: e.id,
          from: p.hex,
          swapWith: partner,
        });
    }
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
  max: number = want,
  step = 1,
): string | null {
  if (
    targets.length < want ||
    targets.length > Math.max(want, max) ||
    (targets.length - want) % step !== 0
  ) {
    return max > want
      ? `choose ${want} to ${max} target(s)`
      : `choose ${want} target(s)`;
  }
  for (const t of targets) {
    if ("stack" in t) {
      const s = state.stacks.find((x) => x.id === t.stack);
      if (!s || !isAlive(s)) return `no living stack ${t.stack}`;
      if ("condition" in t && !s.conditions.some((c) => c.uid === t.condition))
        return `${t.stack} bears no condition ${t.condition}`;
    } else if ("hex" in t && !inBounds(t.hex)) {
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
  scroll = false,
): string | null {
  const sideState = state.sides[side];
  if (!sideState.hero) return "this side has no hero";
  const def = actDef(actId);
  switch (def.kind) {
    case "cast":
      return sideState.castRound === state.round
        ? secondCastError(state, side, def, scroll)
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
      if (action.swapWith !== undefined) {
        if (!swapPartners(state, s.id).includes(action.swapWith))
          return "no link to swap with";
        return sameHex(getStack(state, action.swapWith).hex, action.to)
          ? null
          : "a swap moves to the partner's hex";
      }
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
      if (action.swapWith !== undefined) {
        if (!swapPartners(state, s.id).includes(action.swapWith))
          return "no link to swap with";
        return canShoot(swapped(state, s.id, action.swapWith), s.id)
          ? null
          : "this stack cannot shoot after the swap";
      }
      return canShoot(state, s.id) ? null : "this stack cannot shoot now";
    }
    case "shootHex": {
      if (!shootsAnyHex(s)) return "this stack cannot shoot at a hex";
      if (!inBounds(action.at)) return "target hex out of bounds";
      return canShoot(state, s.id) ? null : "this stack cannot shoot now";
    }
    case "attack": {
      const t = state.stacks.find((x) => x.id === action.targetId);
      if (!t || !isAlive(t) || t.side === s.side) return "no such enemy stack";
      if (!inBounds(action.from)) return "attack hex out of bounds";
      if (!isAdjacent(action.from, t.hex))
        return "attack hex is not adjacent to the target";
      if (action.swapWith !== undefined) {
        if (!swapPartners(state, s.id).includes(action.swapWith))
          return "no link to swap with";
        return sameHex(getStack(state, action.swapWith).hex, action.from)
          ? null
          : "a swap attacks from the partner's hex";
      }
      const { dist } = bfs(state, s);
      return (dist[hexIndex(action.from)] as number) >= 0
        ? null
        : "attack hex not reachable";
    }
    case "ability": {
      if (!s.creature.abilities.includes(action.ability))
        return `${s.creature.id} has no ability ${action.ability}`;
      const abDef = ability(action.ability);
      const actId = abDef.act;
      if (!actId) return `${action.ability} is not an activated ability`;
      // A repeat use of a once-per-battle ability is the act's to allow
      // (Patch Up with Salvage, `repeatByCheck`).
      if (
        abDef.everyTurn !== true &&
        abDef.repeatByCheck !== true &&
        s.abilitiesUsed.includes(action.ability)
      )
        return "this ability is used for the battle";
      let at = state;
      if (action.from !== undefined && !sameHex(action.from, s.hex)) {
        if (abDef.moveFirst !== true) return "this ability cannot move first";
        if (!inBounds(action.from)) return "hex out of bounds";
        const { dist } = bfs(state, s);
        if ((dist[hexIndex(action.from)] as number) < 0)
          return "hex not reachable";
        at = withStackAt(state, s.id, action.from);
      }
      const def = actDef(actId);
      return (
        targetsError(
          at,
          action.targets,
          def.targets,
          def.maxTargets?.(at, s.id),
          def.targetStep,
        ) ??
        def.check?.(at, s.id, action.targets) ??
        null
      );
    }
    case "heroAct": {
      const err = heroActError(
        state,
        s.side,
        action.act,
        action.scroll === true,
      );
      if (err) return err;
      const def = actDef(action.act);
      if (def.kind !== "cast") {
        if (action.scroll || action.echo || action.fuel)
          return "only a cast takes a scroll, Echo or Fuel";
      } else {
        const castErr = heroCastError(
          state,
          s.side,
          action.act,
          action.scroll === true,
        );
        if (castErr) return castErr;
      }
      const shape =
        targetsError(
          state,
          action.targets,
          def.targets,
          def.maxTargets?.(state, s.id),
          def.targetStep,
        ) ??
        def.check?.(state, s.id, action.targets) ??
        null;
      if (shape) return shape;
      if (action.echo) {
        const e = echoError(state, def, s.id, action.targets, action.echo);
        if (e) return e;
      }
      if (action.fuel) {
        const e = fuelError(
          state,
          s.side,
          def,
          s.id,
          action.targets,
          action.fuel,
        );
        if (e) return e;
        if (
          action.echo &&
          action.echo.stack === action.fuel.stack &&
          action.echo.condition === action.fuel.condition
        )
          return "one condition cannot be both Echoed and burnt";
      }
      return null;
    }
    case "creatureCast": {
      const e = creatureCastError(s, action.spell);
      if (e) return e;
      const def = actDef(action.spell);
      return (
        targetsError(
          state,
          action.targets,
          def.targets,
          def.maxTargets?.(state, s.id),
          def.targetStep,
        ) ??
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
  // The Hourglass and its bulbs stop clocks on a side's stacks (Holds
  // always tick).
  d.beginStep();
  const strongest = new Set(
    (["attacker", "defender"] as const).flatMap((side) =>
      strongestOf(d.stacks, side, 1).map((x) => x.id),
    ),
  );
  for (const s of d.stacks.slice()) {
    if (!fx.isAlive(s.id)) continue;
    for (const c of d.get(s.id).conditions) {
      if (!fx.isAlive(s.id)) break;
      const cur = d.get(s.id).conditions.find((x) => x.uid === c.uid);
      if (!cur) continue;
      const side = d.get(s.id).side;
      const stopped =
        !cur.hold &&
        (hasRule(d, side, "own-clocks-frozen") ||
          (cur.polarity === "bane" &&
            hasRule(d, side, "own-bane-clocks-frozen")) ||
          (cur.polarity === "boon" &&
            strongest.has(s.id) &&
            hasRule(d, side, "strongest-boon-clocks-frozen")));
      const next = {
        ...cur,
        roundsBorne: cur.roundsBorne + 1,
        clock: cur.clock === null || stopped ? cur.clock : cur.clock - 1,
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
  // Round limit (1.12): the side with more fight value left wins (a tie
  // goes to the defender); the loser's survivors flee.
  if (d.round >= roundLimitOf(d)) finish(d, roundLimitWinner(d), "roundLimit");
}

function startRound(d: Draft, fx: Resolver, round: number): void {
  d.round = round;
  for (const s of d.stacks) {
    if (s.retaliatedThisRound || s.waitedThisRound) {
      d.update(s.id, {
        retaliatedThisRound: false,
        waitedThisRound: false,
        ...(s.retaliationsThisRound !== undefined
          ? { retaliationsThisRound: 0 }
          : {}),
      });
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
    // Round-end turns (Afters) come before the round-end events.
    if (grantAfters(d, fx)) continue;
    endRound(d, fx);
    if (d.winner !== null) return;
    startRound(d, fx, d.round + 1);
  }
}

/**
 * Grants the round-end turns (Afters, FACTION_CANDY 5) once every other
 * turn of the round is taken: each is the stack's one extra turn of the
 * round (RULES_V2 1.11), taken in turn order. True when any was granted.
 */
function grantAfters(d: Draft, fx: Resolver): boolean {
  const due = aftersDue(d.toState());
  if (due.length === 0) return false;
  d.beginStep();
  for (const id of due) {
    d.within(null, "ability:afters", () => {
      if (fx.extraTurn(id)) d.update(id, { aftersRound: d.round });
    });
  }
  fx.resolveReactions();
  return true;
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
    case "shootHex":
      return [];
    case "ability":
    case "heroAct":
    case "creatureCast":
      return action.targets.flatMap((t) => ("stack" in t ? [t.stack] : []));
    default:
      return [];
  }
}

/**
 * The active stack's walk to `to` (its own move): a path walk, or a
 * teleport for a stack whose walk is one (Mist). Returns hexes moved.
 */
function walkTo(d: Draft, fx: Resolver, id: StackId, to: Hex): number {
  const s = d.get(id);
  if (sameHex(s.hex, to)) return 0;
  if (teleportsToWalk(s)) {
    const n = hexDistance(s.hex, to);
    fx.teleport(id, to);
    fx.walkEnded(id);
    return n;
  }
  const path = findPath(d.toState(), id, to);
  if (!path) throw new Error("hex not reachable");
  // Hexes actually entered: a walk stops where a hazard kills the stack.
  return fx.walk(id, path, "walk");
}

/**
 * A shot: the shooter's ability may replace it (Bomb: an area shot at a
 * hex); otherwise a shot Strike on the target.
 */
function performShot(
  d: Draft,
  fx: Resolver,
  shooterId: StackId,
  targetId: StackId | null,
  at: Hex,
): void {
  const s = d.get(shooterId);
  d.update(shooterId, { shotsLeft: s.shotsLeft - 1 });
  const idx =
    targetId !== null
      ? d.emit({ type: "shoot", stackId: shooterId, targetId })
      : d.emit({ type: "shootHex", stackId: shooterId, at });
  const override = s.creature.abilities.find(
    (a) => ability(a).shot !== undefined,
  );
  d.within(idx, override ? `ability:${override}` : null, () => {
    if (override) {
      ability(override).shot?.(fx, shooterId, at, targetId);
    } else if (targetId !== null) {
      fx.strikeKind(shooterId, targetId, "shot", 0);
    }
  });
}

/** Runs an attack or shot on the draft (legality already checked). */
function performAttack(d: Draft, fx: Resolver, action: AttackAction): number {
  if (action.swapWith !== undefined) {
    fx.swap(action.stackId, action.swapWith);
  }
  if (action.type === "shoot") {
    const t = d.get(action.targetId);
    performShot(d, fx, action.stackId, action.targetId, t.hex);
    // Seed Bombs: each shooter's first shot leaves brambles 6, clock 3.
    const side = d.get(action.stackId).side;
    if (
      hasRule(d, side, "seed-bombs") &&
      fx.useRule(side, `seed-bombs:${action.stackId}`)
    ) {
      d.within(null, "seed-bombs", () =>
        fx.addGround({ hex: t.hex, kind: "brambles", size: 6, clock: 3 }),
      );
    }
    return 0;
  }
  const moved =
    action.swapWith !== undefined
      ? 0
      : walkTo(d, fx, action.stackId, action.from);
  if (!fx.isAlive(action.stackId) || !fx.isAlive(action.targetId)) return moved;
  const idx = d.emit({
    type: "attack",
    stackId: action.stackId,
    targetId: action.targetId,
  });
  d.within(idx, null, () =>
    fx.strikeKind(action.stackId, action.targetId, "melee", moved),
  );
  return moved;
}

/** A walk after the attack (Hit and Run), if still possible. */
function walkAfter(d: Draft, fx: Resolver, id: StackId, to: Hex): void {
  if (!fx.isAlive(id)) return;
  const s = d.get(id);
  const n = Math.max(
    0,
    ...s.creature.abilities.map((a) => ability(a).walkAfterAttack ?? 0),
  );
  if (n <= 0 || sameHex(s.hex, to)) return;
  const path = findPath(d.toState(), id, to, n);
  if (!path) return;
  d.within(null, "engine:walk-after", () => fx.walk(id, path, "walk"));
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
      const scroll = action.scroll === true;
      const magic = sideState.magic;
      let cast: CastInfo | undefined;
      let nextMagic = magic;
      // Packrat 3: the first scroll each battle does not use the cast.
      const free =
        def.kind === "cast" &&
        scroll &&
        hasRule(d, side, "first-scroll-free") &&
        fx.useRule(side, "first-scroll-free");
      const previousPage = [...(magic?.casts ?? [])]
        .reverse()
        .find((c) => !c.scroll);
      if (def.kind === "cast") {
        const power = magic ? heroCastPower(magic, def, scroll) : 0;
        const mana = magic ? heroManaCost(d, side, def, scroll) : 0;
        cast = {
          power,
          mana,
          scroll,
          fuelled: action.fuel !== undefined,
          echoed: action.echo !== undefined,
        };
        if (magic) {
          // The page is spent even if every target refuses (2.4), unless a
          // rule keeps it: The Unspent Page, Vow of the Grave.
          const keepPage =
            !scroll &&
            (magic.unspentPage === action.act ||
              graveKeeps(d, side, def.school ?? null, action.targets));
          // Scrolls kept: Vow of the Borrowed Book (all, spent once per
          // battle), Bookbinder's Thread (the first each battle).
          const borrowed = scroll && hasRule(d, side, "scrolls-kept");
          const keepScroll =
            scroll &&
            (borrowed ||
              (hasRule(d, side, "first-scroll-kept") &&
                fx.useRule(side, "first-scroll-kept")));
          const i = magic.scrolls.indexOf(action.act);
          const spentNow = scroll
            ? borrowed
              ? [...magic.spent, `scroll:${action.act}`]
              : magic.spent
            : keepPage
              ? magic.spent
              : [...magic.spent, action.act];
          nextMagic = {
            ...magic,
            mana: magic.mana - mana,
            manaSpent: magic.manaSpent + mana,
            spent: spentNow,
            scrolls:
              scroll && !keepScroll
                ? [...magic.scrolls.slice(0, i), ...magic.scrolls.slice(i + 1)]
                : magic.scrolls,
            scrollsUsed:
              scroll && !keepScroll
                ? [...magic.scrollsUsed, action.act]
                : magic.scrollsUsed,
            fuelUsed: magic.fuelUsed + (action.fuel ? 1 : 0),
            casts: [
              ...(magic.casts ?? []),
              { round: d.round, school: def.school ?? null, scroll, free },
            ],
          };
        }
      }
      d.sides = {
        ...d.sides,
        [side]: {
          ...d.sides[side],
          ...(def.kind === "cast" && !free ? { castRound: d.round } : {}),
          ...(def.kind === "command" ? { commandUsed: true } : {}),
          ...(def.kind === "item"
            ? { itemActsUsed: [...sideState.itemActsUsed, action.act] }
            : {}),
          ...(nextMagic ? { magic: nextMagic } : {}),
        },
      };
      const idx = d.emit(
        { type: "heroAct", side, act: action.act, ...(cast ? { cast } : {}) },
        action.act,
      );
      const acting: Acting = {
        side,
        by:
          def.kind === "cast"
            ? scroll
              ? "scroll"
              : "page"
            : def.kind === "command"
              ? "command"
              : "item",
        school: def.school ?? null,
        fuelFactor: hasRule(d, side, "fuel-triples") ? 3 : 2,
      };
      const before = d.events.length;
      d.acting = acting;
      try {
        d.within(idx, action.act, () => {
          // Echo, then Fuel, then the spell (2.4).
          if (action.echo) {
            const { stack, condition } = action.echo;
            const rounds = magic?.echoRounds ?? 1;
            d.within(null, "echo", () =>
              fx.windCondition(stack, condition, rounds),
            );
          }
          if (action.fuel) {
            const { stack, condition } = action.fuel;
            d.within(null, "fuel", () => fx.endCondition(stack, condition));
          }
          def.resolve(
            fx,
            id,
            action.targets,
            cast
              ? {
                  power: cast.power,
                  fuelled: cast.fuelled,
                  by: scroll ? "scroll" : "page",
                  side,
                  fuelFactor: acting.fuelFactor,
                }
              : undefined,
          );
        });
        afterHeroAct(d, fx, idx, before, action.targets, {
          side,
          kind: def.kind,
          school: def.school ?? null,
          scroll,
          previousPageSchool: previousPage?.school ?? null,
        });
        fx.resolveReactions();
      } finally {
        d.acting = null;
      }
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
    case "defend": {
      d.update(id, { defending: true });
      d.emit({ type: "defend", stackId: id });
      // Rules on Defending: Stoke (FACTION_DWARVES 3), and the Pocket
      // Boiler (5.2) for a stack that does not Stoke already.
      const s = d.get(id);
      let stoked = false;
      for (const a of s.creature.abilities) {
        const def = ability(a);
        if (!def.onDefend || !fx.isAlive(id)) continue;
        stoked = true;
        d.within(null, `ability:${a}`, () => def.onDefend?.(fx, id));
      }
      if (!stoked && hasRule(d, s.side, "pocket-boiler"))
        d.within(null, "pocket-boiler", () => stoke(fx, id));
      break;
    }
    case "move": {
      if (action.swapWith !== undefined) fx.swap(id, action.swapWith);
      else walkTo(d, fx, id, action.to);
      break;
    }
    case "attack":
    case "shoot":
      performAttack(d, fx, action);
      break;
    case "shootHex": {
      const t = d.stacks.find((x) => isAlive(x) && sameHex(x.hex, action.at));
      performShot(d, fx, id, t?.id ?? null, action.at);
      break;
    }
    case "ability": {
      const abDef = ability(action.ability);
      if (action.from !== undefined) walkTo(d, fx, id, action.from);
      if (!fx.isAlive(id)) break;
      const s = d.get(id);
      if (abDef.everyTurn !== true)
        d.update(id, { abilitiesUsed: [...s.abilitiesUsed, action.ability] });
      const actId = abDef.act as string;
      const idx = d.emit(
        { type: "ability", stackId: id, ability: action.ability },
        `ability:${action.ability}`,
      );
      d.within(idx, `ability:${action.ability}`, () =>
        actDef(actId).resolve(fx, id, action.targets),
      );
      break;
    }
    case "creatureCast": {
      const s = d.get(id);
      const power = creatureCastPower(s);
      d.update(id, {
        abilitiesUsed: [...s.abilitiesUsed, `page:${action.spell}`],
      });
      const idx = d.emit(
        { type: "creatureCast", stackId: id, spell: action.spell, power },
        action.spell,
      );
      d.acting = {
        side: s.side,
        by: "creature",
        school: actDef(action.spell).school ?? null,
        fuelFactor: 2,
      };
      try {
        d.within(idx, action.spell, () =>
          actDef(action.spell).resolve(fx, id, action.targets, {
            power,
            fuelled: false,
            by: "creature",
            side: s.side,
          }),
        );
      } finally {
        d.acting = null;
      }
      break;
    }
  }
  fx.resolveReactions();
  if (action.type === "attack" && action.after !== undefined) {
    if (!checkWinner(d)) {
      d.beginStep({ actorId: id, targetIds: [] });
      walkAfter(d, fx, id, action.after);
      fx.resolveReactions();
    }
  }
  if (!checkWinner(d)) {
    // Heartened (RULES_V2 6): after the bearer finishes a turn, its side may
    // end Heartened to give it an extra turn. Default: it does.
    const s = d.get(id);
    const hearten = "hearten" in action ? action.hearten !== false : true;
    const h = s.conditions.find((c) => c.kind === "heartened");
    if (hearten && h && isAlive(s) && s.extraTurnRound !== d.round) {
      const side = s.side;
      d.within(null, "condition:heartened", () => {
        // Vow of Flesh and Blood: it survives its first use each battle.
        const survives =
          hasRule(d, side, "heartened-survives-once") &&
          fx.useRule(side, `heartened:${id}`);
        if (!survives) fx.endCondition(id, h.uid);
        fx.extraTurn(id);
        // Mob Rule: ending it for an extra turn gives Fired Up 3, clock 2.
        if (!survives && hasRule(d, side, "mob-rule"))
          d.within(null, "mob-rule", () =>
            fx.addCondition(id, {
              kind: "fired-up",
              size: 3,
              clock: 2,
            }),
          );
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
 * an illegal action. A legal action that ends without the strike (the
 * attacker walks into fire and dies, the target dies first, the shot is
 * taken by an ability) gives `strike: null` and the reason in `noStrike`.
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
  const toResult = (e: (typeof strikes)[number]): StrikeResult => ({
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
  const ret = first
    ? (strikes.find(
        (e) => e.kind === "retaliation" && e.sourceId === action.targetId,
      ) ?? null)
    : null;
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
  const strike = first ? toResult(first) : null;
  const retaliation = ret ? toResult(ret) : null;
  return {
    action,
    hexesMoved,
    damage: strike?.damage ?? 0,
    kills: strike?.kills ?? 0,
    retaliationDamage: retaliation?.damage ?? 0,
    retaliationKills: retaliation?.kills ?? 0,
    strike,
    noStrike: strike !== null ? null : noStrikeReason(chain, action),
    retaliation,
    conditionsApplied,
    chain,
  };
}

/** Why an attack's chain holds no strike on its target (see previewAttack). */
function noStrikeReason(
  chain: readonly BattleEvent[],
  action: AttackAction,
): NoStrikeReason {
  const died = (id: StackId) =>
    chain.some((e) => e.type === "death" && e.stackId === id);
  if (died(action.stackId)) return "attackerDied";
  if (died(action.targetId)) return "targetDied";
  return "averted";
}

/** Resolves battle-start rules of an army (4.6 form 2) by effect id. */
export function runStartRule(
  fx: Resolver,
  side: BattleSide,
  ref: { readonly id: string; readonly args?: JsonValue },
): void {
  fx.d.beginStep();
  const idx = fx.d.emit({ type: "heroAct", side, act: ref.id }, ref.id);
  fx.d.acting = { side, by: "rule", school: null, fuelFactor: 2 };
  try {
    fx.d.within(idx, ref.id, () =>
      effect(ref.id)(fx, ref.args, { side, source: ref.id }),
    );
    fx.resolveReactions();
  } finally {
    fx.d.acting = null;
  }
}

/**
 * Vow of the Grave: a Hush page cast only on the side's own stacks or on
 * remains is not spent.
 */
function graveKeeps(
  d: Draft,
  side: BattleSide,
  school: string | null,
  targets: readonly ActTarget[],
): boolean {
  if (school !== "hush" || !hasRule(d, side, "hush-unspent-own")) return false;
  if (targets.length === 0) return false;
  return targets.every((t) => {
    if ("stack" in t) return d.has(t.stack) && d.get(t.stack).side === side;
    if ("hex" in t) {
      const g = groundAt(d, t.hex);
      return g !== null && g.class === "remains";
    }
    return false;
  });
}

/**
 * Rules that act after a hero act resolves: Spillover (the side's first
 * bane each battle spills to an adjacent stack), The Odd Cufflink (a page
 * opposed to the previous page fires up the strongest stack) and Drill
 * Sergeant (stacks a Command chooses or moves).
 */
function afterHeroAct(
  d: Draft,
  fx: Resolver,
  idx: number,
  before: number,
  targets: readonly ActTarget[],
  info: {
    readonly side: BattleSide;
    readonly kind: string;
    readonly school: string | null;
    readonly scroll: boolean;
    readonly previousPageSchool: string | null;
  },
): void {
  const { side } = info;
  const made = d.events.slice(before);
  if (
    hasRule(d, side, "spillover") &&
    (info.kind === "cast" || info.kind === "item")
  ) {
    const bane = made.find(
      (e) =>
        e.type === "condition" &&
        e.change === "landed" &&
        e.condition.polarity === "bane",
    );
    if (
      bane !== undefined &&
      bane.type === "condition" &&
      fx.useRule(side, "spillover")
    ) {
      const holder = bane.stackId;
      if (fx.isAlive(holder)) {
        const t = d.get(holder);
        const pool = adjacentStacks(
          d.stacks,
          t.hex,
          (s) => s.id !== holder && s.side === t.side,
        );
        const to =
          strongestOf(pool, t.side, 1)[0] ??
          adjacentStacks(d.stacks, t.hex, (s) => s.id !== holder)[0];
        const c = bane.condition;
        if (to !== undefined)
          d.within(idx, "spillover", () => {
            const still = d.get(holder).conditions.some((x) => x.uid === c.uid);
            if (still) fx.copyCondition(holder, c.uid, to.id);
            else
              fx.addCondition(to.id, {
                kind: c.kind,
                size: c.size,
                clock: c.clock,
                gate: c.gate,
                ...(c.link !== null ? { link: c.link } : {}),
              });
          });
      }
    }
  }
  if (
    info.kind === "cast" &&
    !info.scroll &&
    info.school !== null &&
    info.previousPageSchool !== null &&
    hasRule(d, side, "opposed-cast-fires-up") &&
    schoolRelation(info.previousPageSchool as never, info.school as never) ===
      "opposed"
  ) {
    const top = strongestOf(d.stacks, side, 1)[0];
    if (top !== undefined)
      d.within(idx, "the-odd-cufflink", () =>
        fx.addCondition(top.id, {
          kind: "fired-up",
          size: 3,
          clock: 2,
        }),
      );
  }
  if (
    info.kind === "command" &&
    (hasRule(d, side, "drill-sergeant-1") ||
      hasRule(d, side, "drill-sergeant-3"))
  ) {
    const touched = new Set<StackId>();
    for (const t of targets) if ("stack" in t) touched.add(t.stack);
    for (const e of made) if (e.type === "move") touched.add(e.stackId);
    d.within(idx, "drill-sergeant", () => {
      for (const sid of touched) {
        if (!fx.isAlive(sid) || d.get(sid).side !== side) continue;
        fx.addCondition(sid, { kind: "fired-up", size: 2, clock: 2 });
        if (hasRule(d, side, "drill-sergeant-3"))
          fx.addCondition(sid, {
            kind: "shielded",
            size: 3,
            clock: 2,
          });
      }
    });
  }
}
