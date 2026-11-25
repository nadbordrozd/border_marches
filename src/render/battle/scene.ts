/**
 * What the battle canvas shows at one moment: units where the animation has
 * put them (not necessarily where the engine state has them yet), the
 * overlays of the player's hover, and short-lived effects. The renderer
 * draws a Scene; the animator and the screen change it.
 */

import { isAlive } from "../../core/battle/index.ts";
import type {
  BattleSide,
  BattleState,
  Hex,
  StackId,
} from "../../core/battle/index.ts";
import { feetPoint } from "./geometry.ts";
import type { Point } from "./geometry.ts";
import { conditionPips, groundMarks, linkLines } from "./grammar-view.ts";
import type { ConditionPip, GroundMark, LinkLine } from "./grammar-view.ts";

export interface UnitView {
  readonly id: StackId;
  /** The side it fights for now (a Turned stack changes colour). */
  side: BattleSide;
  readonly creatureId: string;
  /** Feet position in stage pixels. */
  x: number;
  y: number;
  count: number;
  /** 0..1; dying units fade out. */
  alpha: number;
  /** Red hit flash, 0..1. */
  flash: number;
  /** Condition pips beside the count chip, in list order. */
  pips: ConditionPip[];
  defending: boolean;
  visible: boolean;
}

export interface FloatText {
  readonly text: string;
  readonly color: string;
  readonly x: number;
  readonly y: number;
  /** Start time and life in ms (scene clock). */
  readonly t0: number;
  readonly life: number;
  readonly big: boolean;
}

export interface Projectile {
  readonly from: Point;
  readonly to: Point;
  /** 0..1 progress, driven by the animator. */
  t: number;
  readonly color: string;
}

export interface Poof {
  readonly x: number;
  readonly y: number;
  readonly t0: number;
  readonly life: number;
}

export type HexMark =
  | "reachable"
  | "path"
  | "move-target"
  | "attack-from"
  | "target"
  | "target-blocked"
  | "inspect"
  /** A valid target of the act being aimed. */
  | "act-valid"
  /** The valid target under the pointer. */
  | "act-hover"
  /** A target already chosen. */
  | "chosen"
  /** Where Hit and Run may step after the attack. */
  | "after"
  /** A linked partner under the pointer: swap with it. */
  | "swap";

/** A short label drawn on a hex (the order of chosen targets). */
export interface HexLabel {
  readonly hex: Hex;
  readonly text: string;
}

export interface Overlay {
  /** Hex index -> mark; drawn in this order of precedence by the renderer. */
  readonly marks: ReadonlyMap<number, HexMark>;
  /** Hex of the stack whose turn it is, or null. */
  readonly active: Hex | null;
  /** Hex index of an attack target and the side the blow comes from. */
  readonly strike: { readonly from: Hex; readonly target: Hex } | null;
  /** An area effect's hexes, drawn as one dashed outline. */
  readonly area?: readonly Hex[];
  /** Linked partners the active stack may swap with (a badge on each). */
  readonly swaps?: readonly Hex[];
  readonly labels?: readonly HexLabel[];
}

/** An enemy intent badge (RULES_V2 1.13) above a stack. */
export interface IntentBadge {
  readonly stackId: StackId;
  readonly target: StackId | null;
  readonly text: string;
}

export interface Scene {
  readonly units: Map<StackId, UnitView>;
  /** Links drawn as lines from near end to far end. */
  links: LinkLine[];
  /** Non-blocking ground features, tinted on their hexes. */
  ground: GroundMark[];
  /** Enemy intents; empty while animating. */
  intents: IntentBadge[];
  overlay: Overlay;
  texts: FloatText[];
  projectiles: Projectile[];
  poofs: Poof[];
  /** Scene clock in ms, advanced by the screen each frame. */
  now: number;
  /** Round banner. */
  round: number;
}

export const EMPTY_OVERLAY: Overlay = {
  marks: new Map(),
  active: null,
  strike: null,
};

export function createScene(state: BattleState): Scene {
  const scene: Scene = {
    units: new Map(),
    links: [],
    ground: [],
    intents: [],
    overlay: EMPTY_OVERLAY,
    texts: [],
    projectiles: [],
    poofs: [],
    now: 0,
    round: state.round,
  };
  syncScene(scene, state);
  return scene;
}

/** Puts every unit exactly where the engine state has it. */
export function syncScene(scene: Scene, state: BattleState): void {
  for (const s of state.stacks) {
    const p = feetPoint(s.hex);
    const prev = scene.units.get(s.id);
    const view: UnitView = prev ?? {
      id: s.id,
      side: s.side,
      creatureId: s.creature.id,
      x: p.x,
      y: p.y,
      count: s.count,
      alpha: 1,
      flash: 0,
      pips: [],
      defending: false,
      visible: true,
    };
    view.x = p.x;
    view.y = p.y;
    view.count = s.count;
    view.alpha = 1;
    view.flash = 0;
    view.visible = isAlive(s);
    view.pips = conditionPips(state, s.id);
    view.side = s.side;
    view.defending = s.defending;
    scene.units.set(s.id, view);
  }
  scene.links = linkLines(state);
  scene.ground = groundMarks(state);
  scene.round = state.round;
}

/** Drops finished effects. */
export function pruneEffects(scene: Scene): void {
  scene.texts = scene.texts.filter((t) => scene.now - t.t0 < t.life);
  scene.poofs = scene.poofs.filter((p) => scene.now - p.t0 < p.life);
}
