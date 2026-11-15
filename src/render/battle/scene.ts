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

export interface UnitView {
  readonly id: StackId;
  readonly side: BattleSide;
  readonly creatureId: string;
  /** Feet position in stage pixels. */
  x: number;
  y: number;
  count: number;
  /** 0..1; dying units fade out. */
  alpha: number;
  /** Red hit flash, 0..1. */
  flash: number;
  /** Status markers shown under the count chip. */
  venom: boolean;
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
  | "inspect";

export interface Overlay {
  /** Hex index -> mark; drawn in this order of precedence by the renderer. */
  readonly marks: ReadonlyMap<number, HexMark>;
  /** Hex of the stack whose turn it is, or null. */
  readonly active: Hex | null;
  /** Hex index of an attack target and the side the blow comes from. */
  readonly strike: { readonly from: Hex; readonly target: Hex } | null;
}

export interface Scene {
  readonly units: Map<StackId, UnitView>;
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
      venom: false,
      defending: false,
      visible: true,
    };
    view.x = p.x;
    view.y = p.y;
    view.count = s.count;
    view.alpha = 1;
    view.flash = 0;
    view.visible = isAlive(s);
    view.venom = s.statuses.some((st) => st.id === "venom");
    view.defending = s.defending;
    scene.units.set(s.id, view);
  }
  scene.round = state.round;
}

/** Drops finished effects. */
export function pruneEffects(scene: Scene): void {
  scene.texts = scene.texts.filter((t) => scene.now - t.t0 < t.life);
  scene.poofs = scene.poofs.filter((p) => scene.now - p.t0 < p.life);
}
