/**
 * Plays a batch of engine events (one applyAction) on the scene, in order:
 * walk hex to hex, lunge, projectile, damage numbers, death poof, status
 * text. Every piece is short (under 400 ms at normal speed) and the speed
 * toggle divides all durations; "instant" skips straight to the end state.
 */

import { conditionKind } from "../../core/battle/index.ts";
import type {
  BattleEvent,
  BattleState,
  StackId,
} from "../../core/battle/index.ts";
import { feetPoint } from "../../render/battle/geometry.ts";
import { pipOf } from "../../render/battle/grammar-view.ts";
import type { Point } from "../../render/battle/geometry.ts";
import { syncScene } from "../../render/battle/scene.ts";
import type { Scene, UnitView } from "../../render/battle/scene.ts";

/** Playback speeds: animation time is divided by the factor. */
export const SPEEDS = [1, 2, 4, Infinity] as const;
export type Speed = (typeof SPEEDS)[number];

export function speedLabel(speed: Speed): string {
  return speed === Infinity ? "Instant" : `Speed ×${speed}`;
}

export function nextSpeed(speed: Speed): Speed {
  const i = SPEEDS.indexOf(speed);
  return SPEEDS[(i + 1) % SPEEDS.length] as Speed;
}

/** Base durations in ms at speed 1. Each animation stays under 400 ms. */
export const DURATIONS = {
  hopMax: 110,
  walkMax: 380,
  lunge: 240,
  shot: 260,
  hit: 220,
  death: 300,
  text: 160,
  round: 220,
  textLife: 900,
} as const;

/** One hop of a walk: at most 110 ms, and the whole walk at most 380 ms. */
export function hopDuration(pathLength: number): number {
  if (pathLength <= 0) return 0;
  return Math.min(DURATIONS.hopMax, DURATIONS.walkMax / pathLength);
}

/** Total time a batch takes at speed 1 (for tests and pacing). */
export function batchDuration(events: readonly BattleEvent[]): number {
  let t = 0;
  for (const e of events) {
    switch (e.type) {
      case "move":
        t += hopDuration(e.path.length) * e.path.length;
        break;
      case "attack":
      case "retaliation":
        t += DURATIONS.lunge;
        break;
      case "shoot":
        t += DURATIONS.shot;
        break;
      case "damage":
        t += DURATIONS.hit;
        break;
      case "death":
        t += DURATIONS.death;
        break;
      case "heal":
      case "wait":
      case "defend":
        t += DURATIONS.text;
        break;
      case "roundStart":
        t += DURATIONS.round;
        break;
      case "harm":
        t += DURATIONS.hit;
        break;
      case "condition":
      case "linkTransfer":
        t += DURATIONS.text;
        break;
      default:
        break;
    }
  }
  return t;
}

/** Projectile colour by shooter: green spit, violet drum-magic, dark bomb. */
export function projectileColor(creatureId: string): string {
  switch (creatureId) {
    case "spitter":
      return "#86e04a";
    case "shaman":
      return "#c88cff";
    case "bomb-chucker":
      return "#3b3b3b";
    default:
      return "#f0d070";
  }
}

interface Tween {
  readonly start: number;
  readonly dur: number;
  readonly step: (t: number) => void;
  readonly done: () => void;
}

export interface AnimatorHooks {
  /** A new stack's turn starts (for the active highlight). */
  onTurn(stackId: StackId): void;
  onRound(round: number): void;
  /** A one-line log message, e.g. "Raptors attack Orc Brutes". */
  onLog(event: BattleEvent, before: BattleState): void;
}

export class Animator {
  private tweens: Tween[] = [];
  private skipping = false;
  speed: Speed = 1;

  constructor(
    private readonly scene: Scene,
    private readonly hooks: AnimatorHooks,
  ) {}

  /** Advances the running tweens to the scene clock. */
  tick(now: number): void {
    const running = this.tweens;
    this.tweens = [];
    for (const tw of running) {
      const t = tw.dur <= 0 ? 1 : (now - tw.start) / tw.dur;
      if (t >= 1) {
        tw.step(1);
        tw.done();
      } else {
        tw.step(Math.max(0, t));
        this.tweens.push(tw);
      }
    }
  }

  /** Finishes the current batch at once. */
  skip(): void {
    this.skipping = true;
    const running = this.tweens;
    this.tweens = [];
    for (const tw of running) {
      tw.step(1);
      tw.done();
    }
  }

  get busy(): boolean {
    return this.tweens.length > 0;
  }

  private fast(): boolean {
    // A hidden page gets no animation frames: finish instead of stalling.
    const hidden = typeof document !== "undefined" && document.hidden;
    return this.skipping || this.speed === Infinity || hidden;
  }

  private tween(ms: number, step: (t: number) => void): Promise<void> {
    if (this.fast()) {
      step(1);
      return Promise.resolve();
    }
    const dur = ms / this.speed;
    return new Promise((resolve) => {
      this.tweens.push({ start: this.scene.now, dur, step, done: resolve });
    });
  }

  private text(text: string, color: string, at: Point, big = false): void {
    if (this.fast()) return;
    this.scene.texts.push({
      text,
      color,
      x: at.x,
      y: at.y,
      t0: this.scene.now,
      life: DURATIONS.textLife / Math.min(this.speed, 2),
      big,
    });
  }

  private unit(id: StackId): UnitView | undefined {
    return this.scene.units.get(id);
  }

  private async lunge(id: StackId, targetId: StackId): Promise<void> {
    const u = this.unit(id);
    const t = this.unit(targetId);
    if (!u || !t) return;
    const x0 = u.x;
    const y0 = u.y;
    const dx = (t.x - x0) * 0.38;
    const dy = (t.y - y0) * 0.38;
    await this.tween(DURATIONS.lunge, (k) => {
      const s = Math.sin(Math.PI * k);
      u.x = x0 + dx * s;
      u.y = y0 + dy * s;
    });
    u.x = x0;
    u.y = y0;
  }

  /**
   * Animates `events` (produced by applying an action to `before`), then
   * puts the scene exactly on `after`.
   */
  async play(
    events: readonly BattleEvent[],
    before: BattleState,
    after: BattleState,
  ): Promise<void> {
    this.skipping = false;
    for (const e of events) {
      this.hooks.onLog(e, before);
      await this.playOne(e);
    }
    this.skipping = false;
    syncScene(this.scene, after);
  }

  private async playOne(e: BattleEvent): Promise<void> {
    switch (e.type) {
      case "roundStart":
        this.hooks.onRound(e.round);
        this.scene.round = e.round;
        await this.tween(DURATIONS.round, () => {});
        return;
      case "turnStart":
        this.hooks.onTurn(e.stackId);
        return;
      case "move": {
        const u = this.unit(e.stackId);
        if (!u) return;
        const hop = hopDuration(e.path.length);
        for (const h of e.path) {
          const from = { x: u.x, y: u.y };
          const to = feetPoint(h);
          await this.tween(hop, (k) => {
            u.x = from.x + (to.x - from.x) * k;
            u.y = from.y + (to.y - from.y) * k - Math.sin(Math.PI * k) * 5;
          });
          u.x = to.x;
          u.y = to.y;
        }
        return;
      }
      case "attack":
      case "retaliation":
        await this.lunge(e.stackId, e.targetId);
        return;
      case "shoot": {
        const u = this.unit(e.stackId);
        const t = this.unit(e.targetId);
        if (!u || !t) return;
        const pr = {
          from: { x: u.x + 6, y: u.y - 34 },
          to: { x: t.x, y: t.y - 26 },
          t: 0,
          color: projectileColor(u.creatureId),
        };
        if (!this.fast()) this.scene.projectiles.push(pr);
        await this.tween(DURATIONS.shot, (k) => {
          pr.t = k;
        });
        this.scene.projectiles = this.scene.projectiles.filter((p) => p !== pr);
        return;
      }
      case "damage": {
        const t = this.unit(e.targetId);
        if (!t) return;
        if (e.redirectedTo === null) t.count = e.countAfter;
        this.text(`−${e.damage}`, "#ff5a40", { x: t.x, y: t.y - 58 }, true);
        if (e.kills > 0) {
          this.text(`${e.kills} slain`, "#ffffff", { x: t.x, y: t.y - 40 });
        }
        await this.tween(DURATIONS.hit, (k) => {
          t.flash = 1 - k;
        });
        t.flash = 0;
        return;
      }
      case "death": {
        const u = this.unit(e.stackId);
        if (!u) return;
        if (!this.fast()) {
          this.scene.poofs.push({
            x: u.x,
            y: u.y,
            t0: this.scene.now,
            life: DURATIONS.death / this.speed,
          });
        }
        await this.tween(DURATIONS.death, (k) => {
          u.alpha = 1 - k;
        });
        u.visible = false;
        return;
      }
      case "condition": {
        const u = this.unit(e.stackId);
        if (!u) return;
        const c = e.condition;
        const pip = pipOf(c);
        const name = conditionKind(c.kind).name;
        if (
          e.change === "landed" ||
          e.change === "moved" ||
          e.change === "copied"
        ) {
          u.pips = [...u.pips.filter((p) => p.uid !== c.uid), pip];
          if (e.change === "moved" && e.otherId !== undefined) {
            const from = this.unit(e.otherId);
            if (from) from.pips = from.pips.filter((p) => p.uid !== c.uid);
          }
          this.text(name, pip.color, { x: u.x, y: u.y - 74 });
          await this.tween(DURATIONS.text / 2, () => {});
        } else if (
          e.change === "merged" ||
          e.change === "fed" ||
          e.change === "wound"
        ) {
          u.pips = u.pips.map((p) => (p.uid === c.uid ? pip : p));
        } else if (e.change === "refused") {
          this.text(`${name} refused`, "#d8d0c0", { x: u.x, y: u.y - 74 });
          await this.tween(DURATIONS.text / 2, () => {});
        } else {
          u.pips = u.pips.filter((p) => p.uid !== c.uid);
        }
        return;
      }
      case "harm": {
        const t = this.unit(e.targetId);
        if (!t || e.harm === 0) return;
        if (e.redirectedTo === null) t.count = e.countAfter;
        this.text(`−${e.harm}`, "#ff9a40", { x: t.x, y: t.y - 58 }, true);
        if (e.kills > 0) {
          this.text(`${e.kills} slain`, "#ffffff", { x: t.x, y: t.y - 40 });
        }
        await this.tween(DURATIONS.hit, (k) => {
          t.flash = 1 - k;
        });
        t.flash = 0;
        return;
      }
      case "linkTransfer": {
        const u = this.unit(e.farId);
        if (!u) return;
        this.text("link", "#f2c14e", { x: u.x, y: u.y - 80 });
        await this.tween(DURATIONS.text / 2, () => {});
        return;
      }
      case "turnSkipped": {
        const u = this.unit(e.stackId);
        if (!u) return;
        this.text(`${conditionKind(e.condition).name}: skips`, "#cfe6ff", {
          x: u.x,
          y: u.y - 64,
        });
        await this.tween(DURATIONS.text, () => {});
        return;
      }
      case "heal": {
        const u = this.unit(e.stackId);
        if (!u) return;
        this.text(`+${e.amount} HP`, "#8cf05a", { x: u.x, y: u.y - 60 });
        await this.tween(DURATIONS.text, () => {});
        return;
      }
      case "wait":
      case "defend": {
        const u = this.unit(e.stackId);
        if (!u) return;
        if (e.type === "defend") u.defending = true;
        this.text(
          e.type === "wait" ? "Wait" : "Defend",
          e.type === "wait" ? "#f0e6c8" : "#8cc4ff",
          { x: u.x, y: u.y - 64 },
        );
        await this.tween(DURATIONS.text, () => {});
        return;
      }
      case "end":
        return;
    }
  }
}
