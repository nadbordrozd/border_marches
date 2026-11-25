/**
 * What the pointer means on the battle field (pure, unit tested): moving to
 * an empty hex, attacking an enemy from the side the pointer is on (as in
 * Heroes, the attack comes from the neighbouring hex nearest the pointer),
 * shooting, or just looking at a stack.
 */

import {
  findPath,
  getStack,
  hexIndex,
  isAlive,
  previewAttack,
  sameHex,
} from "../../core/battle/index.ts";
import type {
  AttackAction,
  AttackPreview,
  BattleAction,
  BattleStack,
  BattleState,
  Hex,
} from "../../core/battle/index.ts";
import {
  HEX_SIZE,
  feetPoint,
  hexToStage,
  stageToHex,
} from "../../render/battle/geometry.ts";
import type { Point } from "../../render/battle/geometry.ts";

export type HoverIntent =
  | { readonly kind: "none" }
  | {
      readonly kind: "move";
      readonly action: Extract<BattleAction, { type: "move" }>;
      /** Hexes entered, ending at the destination. */
      readonly path: readonly Hex[];
    }
  | {
      readonly kind: "attack";
      readonly action: AttackAction;
      readonly preview: AttackPreview;
      /** Path to the attack hex (empty when attacking from where it stands). */
      readonly path: readonly Hex[];
    }
  /**
   * A linked partner the active stack may swap hexes with in place of its
   * walk (Sworn).
   */
  | {
      readonly kind: "swap";
      readonly action: Extract<BattleAction, { type: "move" }>;
      readonly partner: BattleStack;
    }
  /** An enemy the active stack cannot reach this turn. */
  | { readonly kind: "out-of-reach"; readonly stack: BattleStack }
  /** A stack of the active side, or any stack when it is not our turn. */
  | { readonly kind: "inspect"; readonly stack: BattleStack };

/** Index of the active stack's legal actions, built once per state. */
export interface LegalIndex {
  readonly moves: ReadonlyMap<number, Extract<BattleAction, { type: "move" }>>;
  /** Attack actions by target id (one per attack hex). */
  readonly attacks: ReadonlyMap<string, readonly AttackAction[]>;
  readonly shots: ReadonlyMap<string, AttackAction>;
  /** Swaps in place of the walk, by partner id (Sworn). */
  readonly swaps: ReadonlyMap<string, Extract<BattleAction, { type: "move" }>>;
  /**
   * Shots that need a swap first, by target id: offered only when the
   * stack cannot shoot where it stands.
   */
  readonly swapShots: ReadonlyMap<string, AttackAction>;
  readonly canWait: boolean;
}

export function indexLegalActions(
  actions: readonly BattleAction[],
): LegalIndex {
  const moves = new Map<number, Extract<BattleAction, { type: "move" }>>();
  const attacks = new Map<string, AttackAction[]>();
  const shots = new Map<string, AttackAction>();
  const swaps = new Map<string, Extract<BattleAction, { type: "move" }>>();
  const swapShots = new Map<string, AttackAction>();
  let canWait = false;
  for (const a of actions) {
    switch (a.type) {
      case "move":
        if (a.swapWith !== undefined) swaps.set(a.swapWith, a);
        else moves.set(hexIndex(a.to), a);
        break;
      case "attack": {
        const list = attacks.get(a.targetId) ?? [];
        list.push(a);
        attacks.set(a.targetId, list);
        break;
      }
      case "shoot":
        if (a.swapWith !== undefined) {
          if (!swapShots.has(a.targetId)) swapShots.set(a.targetId, a);
        } else shots.set(a.targetId, a);
        break;
      case "wait":
        canWait = true;
        break;
      case "defend":
        break;
    }
  }
  return { moves, attacks, shots, swaps, swapShots, canWait };
}

/** Half-width and height of a unit's body box over its feet (stage px). */
export const BODY_HALF_W = 18;
export const BODY_H = 56;

/**
 * What the pointer is on: a unit's body (its sprite stands up into the row
 * behind, so pointing at the body means the unit), else the hex under it.
 * For a body hit, `pointer` is mapped into the unit's hex so the side the
 * pointer is on still picks the attack direction.
 */
export function pointAtField(
  state: BattleState,
  pointer: Point,
): { hex: Hex | null; pointer: Point } {
  const bodies = state.stacks
    .filter(isAlive)
    .map((s) => ({ s, f: feetPoint(s.hex) }))
    .sort((a, b) => b.f.y - a.f.y);
  for (const { s, f } of bodies) {
    const top = f.y - BODY_H;
    if (
      Math.abs(pointer.x - f.x) <= BODY_HALF_W &&
      pointer.y >= top &&
      pointer.y <= f.y + 4
    ) {
      const c = hexToStage(s.hex);
      const k = HEX_SIZE / (BODY_H / 2);
      return {
        hex: s.hex,
        pointer: {
          x: c.x + (pointer.x - f.x) * k,
          y: c.y + (pointer.y - (top + BODY_H / 2)) * k,
        },
      };
    }
  }
  return { hex: stageToHex(pointer), pointer };
}

function stackAt(state: BattleState, h: Hex): BattleStack | null {
  return state.stacks.find((s) => isAlive(s) && sameHex(s.hex, h)) ?? null;
}

/**
 * The melee attack whose attack hex is nearest the pointer. Candidates are
 * the attack hexes around the target; the pointer is inside the target's
 * hex, so the nearest neighbouring centre is the side it points at. Ties go
 * to the earlier candidate (engine order), keeping the choice deterministic.
 */
export function pickAttackFrom(
  candidates: readonly AttackAction[],
  pointer: Point,
): AttackAction | null {
  let best: AttackAction | null = null;
  let bestD = Infinity;
  for (const a of candidates) {
    if (a.type !== "attack") continue;
    const c = hexToStage(a.from);
    const d = (c.x - pointer.x) ** 2 + (c.y - pointer.y) ** 2;
    if (d < bestD - 1e-9) {
      best = a;
      bestD = d;
    }
  }
  return best;
}

/**
 * The intent for the pointer at `pointer` over hex `h` (null = off field).
 * `playerTurn` false means only inspection (an AI side is acting).
 */
export function hoverIntent(
  state: BattleState,
  legal: LegalIndex,
  h: Hex | null,
  pointer: Point,
  playerTurn: boolean,
): HoverIntent {
  if (h === null) return { kind: "none" };
  const occupant = stackAt(state, h);
  const active =
    state.activeStackId === null ? null : getStack(state, state.activeStackId);
  if (!playerTurn || active === null) {
    return occupant ? { kind: "inspect", stack: occupant } : { kind: "none" };
  }
  if (occupant === null) {
    const move = legal.moves.get(hexIndex(h));
    if (!move) return { kind: "none" };
    const path = findPath(state, move.stackId, move.to) ?? [];
    return { kind: "move", action: move, path };
  }
  if (occupant.side === active.side) {
    const swap = legal.swaps.get(occupant.id);
    return swap
      ? { kind: "swap", action: swap, partner: occupant }
      : { kind: "inspect", stack: occupant };
  }
  const shot = legal.shots.get(occupant.id) ?? legal.swapShots.get(occupant.id);
  if (shot) {
    return {
      kind: "attack",
      action: shot,
      preview: previewAttack(state, shot),
      path: [],
    };
  }
  const melee = pickAttackFrom(legal.attacks.get(occupant.id) ?? [], pointer);
  if (melee === null || melee.type !== "attack") {
    return { kind: "out-of-reach", stack: occupant };
  }
  const path =
    sameHex(melee.from, active.hex) || melee.swapWith !== undefined
      ? []
      : (findPath(state, active.id, melee.from) ?? []);
  return {
    kind: "attack",
    action: melee,
    preview: previewAttack(state, melee),
    path,
  };
}
