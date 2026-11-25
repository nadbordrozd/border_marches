/**
 * Plays a batch of engine events (one applyAction) on the scene, beat by
 * beat as the scheduler (schedule.ts) orders them: walks, lunges and
 * impacts, shots per shooter, Harm numbers and kill counts, deaths that
 * collapse into remains, get-ups, pushes and Launched arcs, swaps and
 * teleports, condition icons landing and fading, a cast effect per school,
 * the Command's banner and item acts (bead bzc.26).
 *
 * The animator only changes the scene: never the battle state, and the
 * engine never waits on it. The speed toggle divides every duration;
 * "instant" (and quick battles) skip to the end state; reduced motion
 * snaps units and draws no particles, holding only beats with news.
 */

import { conditionKind, hexIndex } from "../../core/battle/index.ts";
import type {
  ActTarget,
  BattleAction,
  BattleEvent,
  BattleSide,
  BattleState,
  Hex,
  StackId,
} from "../../core/battle/index.ts";
import { act, hasAct } from "../../core/battle/index.ts";
import { fxEvent } from "../../audio/fx.ts";
import {
  discHexes,
  isBattleSpell,
  spellDef,
  spellRadius,
} from "../../core/magic/index.ts";
import type { ShotKind } from "../../audio/fx.ts";
import {
  STAGE_TOP,
  STAGE_W,
  feetPoint,
  hexToStage,
} from "../../render/battle/geometry.ts";
import type { Point } from "../../render/battle/geometry.ts";
import {
  SCHOOL_COLORS,
  groundMarks,
  pipOf,
} from "../../render/battle/grammar-view.ts";
import { ensureUnit, syncScene } from "../../render/battle/scene.ts";
import type { Scene, UnitView } from "../../render/battle/scene.ts";
import {
  blink,
  castFlourish,
  deathPuff,
  dust,
  getUpSwirl,
  groundSpawn,
  impact,
  schoolImpact,
  sparkle,
  spellBeam,
  spellBolt,
  spellBurst,
  spellTouch,
  summonRise,
} from "../../render/fx/emit.ts";
import type { Pt } from "../../render/fx/emit.ts";
import type { FxClock } from "../../render/fx/field.ts";
import { PALETTES, SCHOOL_PALETTES } from "../../render/fx/pixels.ts";
import { launchShot, shotKind, shotSplash } from "../../render/fx/shots.ts";
import type { ResolvedSpellFx } from "../../render/fx/spell-fx.ts";
import { DURATIONS, hopDuration, planBatch } from "./schedule.ts";
import type { Beat } from "./schedule.ts";

export { DURATIONS, batchDuration, hopDuration } from "./schedule.ts";

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

const easeOut = (k: number): number => 1 - (1 - k) * (1 - k);
const easeInOut = (k: number): number =>
  k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k);

/** Where a side's hero casts from: its top corner of the field. */
export function heroPoint(side: BattleSide): Point {
  return side === "attacker"
    ? { x: 34, y: STAGE_TOP + 6 }
    : { x: STAGE_W - 34, y: STAGE_TOP + 6 };
}

export class Animator {
  private tweens: Tween[] = [];
  private skipping = false;
  speed: Speed = 1;
  /** Reduced motion (the screen keeps it in step with the setting). */
  reduced = false;
  /** The shot in flight, for its splash on landing. */
  private lastShot: ShotKind = "arrow";
  /** The batch being played (casts look ahead to their consequences). */
  private batch: {
    beats: readonly Beat[];
    before: BattleState;
    after: BattleState;
    action: BattleAction | null;
  } | null = null;

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
    this.scene.fx.clear();
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

  /** Decoration allowed now (particles, banners, badges). */
  private deco(beat: Beat): boolean {
    return beat.decorate && !this.fast() && !this.reduced;
  }

  /** Units may move smoothly now. */
  private moving(beat: Beat): boolean {
    return beat.motion && !this.fast() && !this.reduced;
  }

  private get clock(): FxClock {
    return {
      now: this.scene.now,
      rate: this.speed === Infinity ? 1 : this.speed,
    };
  }

  /** A tween of `ms` at speed 1. */
  private tween(ms: number, step: (t: number) => void): Promise<void> {
    if (this.fast() || ms <= 0) {
      step(1);
      return Promise.resolve();
    }
    const dur = ms / this.speed;
    return new Promise((resolve) => {
      this.tweens.push({ start: this.scene.now, dur, step, done: resolve });
    });
  }

  private hold(ms: number): Promise<void> {
    return this.tween(ms, () => {});
  }

  private text(
    text: string,
    color: string,
    at: Point,
    big = false,
    delay = 0,
  ): void {
    if (this.fast()) return;
    // Stack above texts still rising near the same spot, never over them.
    let y = at.y;
    const now = this.scene.now;
    for (const t of this.scene.texts) {
      const k = (now - t.t0) / t.life;
      if (k > 0.85 || Math.abs(t.x - at.x) > 40) continue;
      const ty = t.still ? t.y : t.y - Math.max(0, k) * 22;
      if (Math.abs(ty - y) < 17) y = Math.min(y, ty - 17);
    }
    this.scene.texts.push({
      text,
      color,
      x: at.x,
      y,
      t0: this.scene.now + delay / this.speed,
      life: DURATIONS.textLife / Math.min(this.speed, 2),
      big,
      still: this.reduced,
    });
  }

  private unit(id: StackId): UnitView | undefined {
    return this.scene.units.get(id);
  }

  private body(u: UnitView): Pt {
    return { x: u.x, y: u.y - 24 - u.lift };
  }

  private async lunge(
    beat: Beat,
    id: StackId,
    targetId: StackId,
  ): Promise<void> {
    const u = this.unit(id);
    const t = this.unit(targetId);
    if (!u || !t) return;
    if (!this.moving(beat)) {
      await this.hold(beat.base);
      return;
    }
    const x0 = u.x;
    const y0 = u.y;
    const dx = (t.x - x0) * 0.38;
    const dy = (t.y - y0) * 0.38;
    // Wind up a little, thrust, come back.
    await this.tween(DURATIONS.lunge, (k) => {
      const s =
        k < 0.25
          ? -0.12 * Math.sin((k / 0.25) * Math.PI)
          : Math.sin(((k - 0.25) / 0.75) * Math.PI);
      u.x = Math.round(x0 + dx * s);
      u.y = Math.round(y0 + dy * s);
    });
    u.x = x0;
    u.y = y0;
  }

  /**
   * Animates `events` (produced by applying `action` to `before`), then
   * puts the scene exactly on `after`.
   */
  async play(
    events: readonly BattleEvent[],
    before: BattleState,
    after: BattleState,
    action: BattleAction | null = null,
  ): Promise<void> {
    this.skipping = false;
    this.scene.reduced = this.reduced;
    const beats = planBatch(events, before, {
      speed: this.speed,
      reduced: this.reduced,
    });
    this.batch = { beats, before, after, action };
    for (const beat of beats) {
      this.hooks.onLog(beat.event, before);
      if (!this.fast()) for (const cue of beat.cues) fxEvent(cue);
      await this.playBeat(beat);
    }
    this.batch = null;
    this.skipping = false;
    syncScene(this.scene, after);
  }

  private async playBeat(beat: Beat): Promise<void> {
    const e = beat.event;
    const deco = this.deco(beat);
    const c = this.clock;
    switch (e.type) {
      case "roundStart":
        this.hooks.onRound(e.round);
        this.scene.round = e.round;
        await this.hold(beat.base);
        return;
      case "turnStart":
        this.hooks.onTurn(e.stackId);
        return;
      case "move":
        await this.move(beat, e);
        return;
      case "attack":
        await this.lunge(beat, e.stackId, e.targetId);
        return;
      case "retaliation": {
        const u = this.unit(e.stackId);
        if (u && deco) this.text("Counter", "#ffe0a0", { x: u.x, y: u.y - 70 });
        await this.lunge(beat, e.stackId, e.targetId);
        return;
      }
      case "shoot":
      case "shootHex": {
        const u = this.unit(e.stackId);
        if (!u) return;
        const to =
          e.type === "shoot"
            ? (() => {
                const t = this.unit(e.targetId);
                return t ? this.body(t) : null;
              })()
            : (() => {
                const p = hexToStage(e.at);
                return { x: p.x, y: p.y - 6 };
              })();
        if (!to) return;
        this.lastShot = shotKind(u.creatureId);
        if (this.moving(beat))
          launchShot(
            this.scene.fx,
            c,
            this.lastShot,
            { x: u.x + 6, y: u.y - 34 },
            to,
            DURATIONS.shot,
          );
        await this.hold(beat.base);
        if (e.type === "shootHex" && deco)
          shotSplash(this.scene.fx, this.clock, this.lastShot, to);
        return;
      }
      case "damage": {
        const t = this.unit(e.targetId);
        if (!t) return;
        if (e.redirectedTo === null) t.count = e.countAfter;
        const at = this.body(t);
        this.text(`−${e.damage}`, "#ff5a40", { x: t.x, y: t.y - 58 }, true);
        if (e.kills > 0)
          this.text(
            `${e.kills} slain`,
            "#ffffff",
            { x: t.x, y: t.y - 40 },
            false,
            60,
          );
        if (deco) {
          if (e.kind === "shot")
            shotSplash(this.scene.fx, c, this.lastShot, at);
          else
            impact(
              this.scene.fx,
              c,
              { x: at.x, y: at.y - 4 },
              beat.cues.includes("battle.impact.heavy"),
            );
        }
        // A recoil away from the blow.
        const src = this.unit(e.sourceId);
        const x0 = t.x;
        const y0 = t.y;
        const away = src && this.moving(beat) ? Math.sign(t.x - src.x) || 1 : 0;
        await this.tween(beat.base, (k) => {
          t.flash = 1 - k;
          if (away !== 0)
            t.x = Math.round(
              x0 + away * 3 * Math.sin(Math.PI * Math.min(1, k * 1.6)),
            );
        });
        t.x = x0;
        t.y = y0;
        t.flash = 0;
        return;
      }
      case "harm": {
        const t = this.unit(e.targetId);
        if (!t || e.harm === 0) return;
        if (e.redirectedTo === null) t.count = e.countAfter;
        this.text(`−${e.harm}`, "#ff9a40", { x: t.x, y: t.y - 58 }, true);
        if (e.kills > 0)
          this.text(
            `${e.kills} slain`,
            "#ffffff",
            { x: t.x, y: t.y - 40 },
            false,
            60,
          );
        await this.tween(beat.base, (k) => {
          t.flash = 1 - k;
        });
        t.flash = 0;
        return;
      }
      case "death":
        await this.death(beat, e.stackId);
        return;
      case "getUp": {
        const u =
          this.unit(e.stackId) ??
          ensureUnit(
            this.scene,
            this.batch?.after ?? this.batchBefore(),
            e.stackId,
          );
        if (!u) return;
        const p = feetPoint(e.hex);
        u.x = p.x;
        u.y = p.y;
        u.count = e.count;
        u.visible = true;
        const key = hexIndex(e.hex);
        this.scene.ground = this.scene.ground.filter(
          (g) => hexIndex(g.hex) !== key,
        );
        if (deco) getUpSwirl(this.scene.fx, c, p);
        this.text("Gets up!", "#d8d0e8", { x: p.x, y: p.y - 70 });
        if (!this.moving(beat)) {
          u.alpha = 1;
          u.squash = 1;
          await this.hold(beat.base);
          return;
        }
        await this.tween(beat.base, (k) => {
          u.alpha = Math.min(1, k * 2);
          u.squash = 0.25 + 0.75 * easeOut(k);
        });
        u.alpha = 1;
        u.squash = 1;
        return;
      }
      case "summon": {
        const u = ensureUnit(
          this.scene,
          this.batch?.after ?? this.batchBefore(),
          e.stackId,
        );
        if (!u) return;
        const school = this.batchSchool() ?? "hush";
        if (deco) summonRise(this.scene.fx, c, school, { x: u.x, y: u.y });
        u.visible = true;
        if (!this.moving(beat)) {
          u.alpha = 1;
          await this.hold(beat.base);
          return;
        }
        await this.tween(beat.base, (k) => {
          u.alpha = k;
          u.squash = 0.4 + 0.6 * easeOut(k);
        });
        u.alpha = 1;
        u.squash = 1;
        return;
      }
      case "condition":
        await this.condition(beat, e);
        return;
      case "linkTransfer": {
        const near = this.unit(e.nearId);
        const u = this.unit(e.farId);
        if (!u) return;
        if (near && deco) {
          const pal = SCHOOL_PALETTES.accord;
          this.scene.fx.add(
            c,
            {
              kind: "beam",
              x0: near.x,
              y0: near.y - 24,
              x1: u.x,
              y1: u.y - 24,
              pal,
            },
            260,
          );
        }
        this.text("link", "#f2c14e", { x: u.x, y: u.y - 80 });
        await this.hold(beat.base);
        return;
      }
      case "turnSkipped": {
        const u = this.unit(e.stackId);
        if (!u) return;
        this.text(`${conditionKind(e.condition).name}: skips`, "#cfe6ff", {
          x: u.x,
          y: u.y - 64,
        });
        if (deco && e.condition === "asleep")
          sparkle(
            this.scene.fx,
            c,
            { x: u.x + 10, y: u.y - 56 },
            "z",
            SCHOOL_PALETTES.hush,
            3,
            8,
          );
        await this.hold(beat.base);
        return;
      }
      case "ground": {
        if (e.change !== "added") return;
        const centre = hexToStage(e.feature.hex);
        if (e.feature.class !== "blocking") {
          const key = hexIndex(e.feature.hex);
          const mark = groundMarks({
            ...this.batchBefore(),
            ground: [e.feature],
          })[0];
          if (
            mark &&
            !this.scene.ground.some(
              (g) => hexIndex(g.hex) === key && g.kind === mark.kind,
            )
          ) {
            this.scene.ground = [...this.scene.ground, mark];
            // Its icon grows up out of the ground (renderer).
            if (deco) this.scene.groundGrow.set(key, this.scene.now);
          }
        }
        if (deco)
          groundSpawn(
            this.scene.fx,
            c,
            e.feature.kind,
            centre,
            e.feature.school,
          );
        await this.hold(beat.base);
        return;
      }
      case "heal": {
        const u = this.unit(e.stackId);
        if (!u) return;
        u.count = e.countAfter;
        this.text(`+${e.amount} HP`, "#8cf05a", { x: u.x, y: u.y - 60 });
        if (deco)
          sparkle(
            this.scene.fx,
            c,
            this.body(u),
            "px2",
            SCHOOL_PALETTES.bloom,
            6,
            16,
          );
        await this.hold(beat.base);
        return;
      }
      case "wait":
      case "defend": {
        const u = this.unit(e.stackId);
        if (!u) return;
        if (e.type === "defend") {
          u.defending = true;
          if (deco)
            this.scene.fx.add(
              c,
              {
                kind: "ring",
                x: u.x,
                y: u.y,
                r0: 18,
                r1: 12,
                pal: SCHOOL_PALETTES.clock,
                flat: 0.45,
              },
              260,
            );
        }
        this.text(
          e.type === "wait" ? "Wait" : "Defend",
          e.type === "wait" ? "#f0e6c8" : "#8cc4ff",
          { x: u.x, y: u.y - 64 },
        );
        await this.hold(beat.base);
        return;
      }
      case "heroAct":
      case "creatureCast":
      case "ability":
        await this.playAct(beat, e);
        return;
      default:
        return;
    }
  }

  private batchBefore(): BattleState {
    return this.batch?.before as BattleState;
  }

  /** The school of the batch's cast, if any (for summons). */
  private batchSchool(): ResolvedSpellFx["school"] | null {
    const cast = this.batch?.beats.find((b) => b.look !== undefined);
    return cast?.look?.school ?? null;
  }

  private async move(
    beat: Beat,
    e: Extract<BattleEvent, { type: "move" }>,
  ): Promise<void> {
    const u = this.unit(e.stackId);
    if (!u) return;
    const end = feetPoint(e.to);
    const c = this.clock;
    const deco = this.deco(beat);
    if (!this.moving(beat)) {
      u.x = end.x;
      u.y = end.y;
      await this.hold(beat.base);
      return;
    }
    const start = { x: u.x, y: u.y };
    if (e.mode === "walk") {
      const hop = hopDuration(e.path.length);
      for (const [i, h] of e.path.entries()) {
        const from = { x: u.x, y: u.y };
        const to = feetPoint(h);
        await this.tween(hop, (k) => {
          u.x = Math.round(from.x + (to.x - from.x) * k);
          u.y = Math.round(
            from.y + (to.y - from.y) * k - Math.sin(Math.PI * k) * 5,
          );
        });
        u.x = to.x;
        u.y = to.y;
        if (deco && i % 2 === 1) dust(this.scene.fx, this.clock, to, 2);
      }
      return;
    }
    if (e.mode === "teleport") {
      if (deco) blink(this.scene.fx, c, start);
      await this.tween(beat.base / 2, (k) => {
        u.alpha = 1 - k;
      });
      u.x = end.x;
      u.y = end.y;
      if (deco) blink(this.scene.fx, this.clock, end);
      await this.tween(beat.base / 2, (k) => {
        u.alpha = k;
      });
      u.alpha = 1;
      return;
    }
    if (e.mode === "swap") {
      await this.tween(beat.base, (k) => {
        const q = easeInOut(k);
        u.x = Math.round(start.x + (end.x - start.x) * q);
        u.y = Math.round(start.y + (end.y - start.y) * q);
        u.lift = Math.round(Math.sin(Math.PI * k) * 14);
      });
      u.lift = 0;
      if (deco) dust(this.scene.fx, this.clock, end, 3);
      return;
    }
    if (e.rule === "launched") {
      // Launched: a high arc with a squash on landing.
      await this.tween(beat.base, (k) => {
        u.x = Math.round(start.x + (end.x - start.x) * k);
        u.y = Math.round(start.y + (end.y - start.y) * k);
        u.lift = Math.round(Math.sin(Math.PI * k) * 34);
        u.squash = k < 0.15 ? 1 - k : k > 0.9 ? 0.9 : 1;
      });
      u.lift = 0;
      u.squash = 1;
      u.x = end.x;
      u.y = end.y;
      if (deco) {
        dust(this.scene.fx, this.clock, end, 6);
        this.scene.fx.add(
          this.clock,
          {
            kind: "ring",
            x: end.x,
            y: end.y,
            r0: 6,
            r1: 22,
            pal: PALETTES.dust,
            flat: 0.45,
          },
          260,
        );
      }
      return;
    }
    // A push or pull: a fast slide along the path, no bob.
    const pts = [start, ...e.path.map(feetPoint)];
    await this.tween(beat.base, (k) => {
      const q = easeOut(k) * (pts.length - 1);
      const i = Math.min(pts.length - 2, Math.floor(q));
      const a = pts[i] as Point;
      const b = pts[i + 1] as Point;
      const f = q - i;
      u.x = Math.round(a.x + (b.x - a.x) * f);
      u.y = Math.round(a.y + (b.y - a.y) * f);
    });
    u.x = end.x;
    u.y = end.y;
    if (deco) dust(this.scene.fx, this.clock, end, 5);
  }

  private async death(beat: Beat, id: StackId): Promise<void> {
    const u = this.unit(id);
    if (!u) return;
    const after = this.batch?.after;
    const stack = this.batch?.before.stacks.find((s) => s.id === id);
    const hex = stack?.hex;
    // Remains left on the hex (they appear as the stack collapses).
    const remains =
      after && hex
        ? groundMarks(after).filter(
            (g) =>
              hexIndex(g.hex) === hexIndex(hex) &&
              after.ground.some(
                (f) => f.remains !== null && hexIndex(f.hex) === hexIndex(hex),
              ),
          )
        : [];
    if (this.deco(beat))
      deathPuff(
        this.scene.fx,
        this.clock,
        { x: u.x, y: u.y },
        remains.length > 0,
      );
    if (this.moving(beat)) {
      await this.tween(beat.base, (k) => {
        u.squash = 1 - 0.7 * easeInOut(Math.min(1, k * 1.3));
        u.alpha = k < 0.4 ? 1 : 1 - (k - 0.4) / 0.6;
        u.flash = k < 0.2 ? 1 - k * 5 : 0;
      });
    } else {
      await this.hold(beat.base);
    }
    u.visible = false;
    u.squash = 1;
    u.alpha = 1;
    u.flash = 0;
    for (const m of remains)
      if (
        !this.scene.ground.some(
          (g) => hexIndex(g.hex) === hexIndex(m.hex) && g.kind === m.kind,
        )
      ) {
        this.scene.ground = [...this.scene.ground, m];
        if (this.deco(beat))
          this.scene.groundGrow.set(hexIndex(m.hex), this.scene.now);
      }
  }

  private async condition(
    beat: Beat,
    e: Extract<BattleEvent, { type: "condition" }>,
  ): Promise<void> {
    const u = this.unit(e.stackId);
    if (!u) return;
    const c = e.condition;
    const pip = pipOf(c);
    const name = conditionKind(c.kind).name;
    const deco = this.deco(beat);
    const fx = this.scene.fx;
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
      if (deco) {
        this.scene.badges.push({
          stackId: u.id,
          glyph: pip.glyph,
          color: pip.color,
          bane: pip.bane,
          mode: "land",
          t0: this.scene.now,
          life: 520 / this.speed,
        });
        const head = { x: u.x, y: u.y - 50 };
        if (c.kind === "heartened")
          sparkle(fx, this.clock, head, "heart", PALETTES.gold, 6, 16);
        else if (c.kind === "lucky")
          sparkle(fx, this.clock, head, "clover", SCHOOL_PALETTES.bloom, 6, 16);
        else if (c.kind === "frozen") {
          for (let i = 0; i < 6; i++)
            fx.add(
              this.clock,
              {
                kind: "p",
                shape: "shard",
                pal: PALETTES.frost,
                x: u.x + (i - 2.5) * 6,
                y: u.y - 8,
                vy: -30,
                fade: "out",
              },
              320,
              i * 30,
            );
        } else if (c.kind === "asleep")
          sparkle(
            fx,
            this.clock,
            { x: u.x + 10, y: u.y - 56 },
            "z",
            SCHOOL_PALETTES.hush,
            3,
            8,
          );
      }
      await this.hold(beat.base);
    } else if (
      e.change === "merged" ||
      e.change === "fed" ||
      e.change === "wound"
    ) {
      u.pips = u.pips.map((p) => (p.uid === c.uid ? pip : p));
    } else if (e.change === "refused") {
      this.text(`${name} refused`, "#d8d0c0", { x: u.x, y: u.y - 74 });
      if (deco)
        fx.add(
          this.clock,
          {
            kind: "ring",
            x: u.x,
            y: u.y - 24,
            r0: 22,
            r1: 26,
            pal: PALETTES.white,
          },
          260,
        );
      await this.hold(beat.base);
    } else {
      u.pips = u.pips.filter((p) => p.uid !== c.uid);
      if (deco) {
        this.scene.badges.push({
          stackId: u.id,
          glyph: pip.glyph,
          color: pip.color,
          bane: pip.bane,
          mode: "expire",
          t0: this.scene.now,
          life: 480 / this.speed,
        });
        this.text(`${name} ends`, "#c8c0b0", { x: u.x, y: u.y - 74 });
      }
      await this.hold(beat.base);
    }
  }

  /** The targets of the batch's act as points, with the area's hexes. */
  private actTargets(beat: Beat): {
    points: Pt[];
    feet: Pt[];
    area: Pt[];
    hexes: Hex[];
  } {
    const b = this.batch;
    const points: Pt[] = [];
    const feet: Pt[] = [];
    const hexes: Hex[] = [];
    const addStack = (id: StackId): void => {
      const u = this.unit(id);
      if (!u || !u.visible) return;
      points.push(this.body(u));
      feet.push({ x: u.x, y: u.y });
    };
    const addHex = (h: Hex): void => {
      const p = hexToStage(h);
      points.push({ x: p.x, y: p.y - 8 });
      feet.push({ x: p.x, y: p.y + 14 });
      hexes.push(h);
    };
    const a = b?.action;
    const targets: readonly ActTarget[] =
      a &&
      (a.type === "heroAct" ||
        a.type === "creatureCast" ||
        a.type === "ability")
        ? a.targets
        : [];
    for (const t of targets) {
      if ("stack" in t) addStack(t.stack);
      else if ("hex" in t) addHex(t.hex);
    }
    if (points.length === 0 && b) {
      // No action (an opening rule): the stacks the act touched.
      const seen = new Set<string>();
      for (const x of b.beats) {
        const ev = x.event;
        if (ev.cause !== beat.index) continue;
        const id =
          ev.type === "harm"
            ? ev.targetId
            : ev.type === "condition" ||
                ev.type === "heal" ||
                ev.type === "summon"
              ? ev.stackId
              : null;
        if (id !== null && !seen.has(id)) {
          seen.add(id);
          addStack(id);
        }
        if (ev.type === "ground" && ev.change === "added")
          addHex(ev.feature.hex);
      }
    }
    // The area outline the act declares, if any.
    let area: Pt[] = [];
    const id =
      beat.event.type === "heroAct"
        ? beat.event.act
        : beat.event.type === "creatureCast"
          ? beat.event.spell
          : null;
    if (id !== null && b && a && hasAct(id)) {
      const def = act(id);
      const actor = "stackId" in a ? a.stackId : null;
      if (def.area && actor !== null) {
        try {
          area = def.area(b.before, actor, targets).map((h) => {
            const p = hexToStage(h);
            return { x: p.x, y: p.y + 6 };
          });
        } catch {
          area = [];
        }
      }
      const centre = hexes[0];
      if (area.length === 0 && centre && isBattleSpell(id)) {
        const r = spellRadius(spellDef(id));
        if (r !== null)
          area = discHexes(centre, r).map((h) => {
            const p = hexToStage(h);
            return { x: p.x, y: p.y + 6 };
          });
      }
    }
    return { points, feet, area, hexes };
  }

  private async playAct(
    beat: Beat,
    e: Extract<BattleEvent, { type: "heroAct" | "creatureCast" | "ability" }>,
  ): Promise<void> {
    const deco = this.deco(beat);
    const fx = this.scene.fx;
    const before = this.batch?.before;
    if (e.type === "ability") {
      const u = this.unit(e.stackId);
      if (u && deco) {
        fx.add(
          this.clock,
          {
            kind: "ring",
            x: u.x,
            y: u.y,
            r0: 6,
            r1: 22,
            pal: PALETTES.gold,
            flat: 0.45,
          },
          300,
        );
        sparkle(fx, this.clock, this.body(u), "spark", PALETTES.gold, 5, 14);
      }
      await this.hold(beat.base);
      return;
    }
    const side: BattleSide =
      e.type === "heroAct"
        ? e.side
        : (before?.stacks.find((s) => s.id === e.stackId)?.side ?? "attacker");
    const casterUnit =
      e.type === "creatureCast" ? this.unit(e.stackId) : undefined;
    const from: Pt = casterUnit
      ? { x: casterUnit.x, y: casterUnit.y - 40 }
      : heroPoint(side);
    const name = hasAct(e.type === "heroAct" ? e.act : e.spell)
      ? act(e.type === "heroAct" ? e.act : e.spell).name
      : "";
    if (beat.actKind === "command" || beat.actKind === "item") {
      const { points } = this.actTargets(beat);
      if (deco) {
        const command = beat.actKind === "command";
        this.scene.banners.push({
          text: name,
          sub: command ? "Command" : "Item",
          side,
          color: command ? "#ffd65c" : "#c8e6ff",
          t0: this.scene.now,
          life: (command ? 1100 : 900) / Math.min(this.speed, 2),
        });
        for (const p of points)
          sparkle(
            fx,
            this.clock,
            p,
            command ? "spark" : "px2",
            command ? PALETTES.gold : PALETTES.frost,
            6,
            16,
          );
        castFlourish(fx, this.clock, "accord", from);
      } else if (!this.fast()) {
        this.text(name, "#ffd65c", { x: STAGE_W / 2, y: STAGE_TOP + 4 }, true);
      }
      await this.hold(beat.base);
      return;
    }
    // A spell.
    const look = beat.look;
    if (!look) {
      await this.hold(beat.base);
      return;
    }
    if (!deco) {
      if (!this.fast())
        this.text(
          name,
          SCHOOL_COLORS[look.school],
          casterUnit
            ? { x: from.x, y: from.y - 30 }
            : { x: STAGE_W / 2, y: STAGE_TOP + 4 },
          true,
        );
      await this.hold(beat.base);
      return;
    }
    const { points, feet, area, hexes } = this.actTargets(beat);
    const s = look.school;
    const el = look.element;
    castFlourish(
      fx,
      this.clock,
      s,
      casterUnit
        ? { x: casterUnit.x, y: casterUnit.y }
        : { x: from.x, y: from.y + 30 },
      el,
    );
    if (casterUnit)
      this.text(name, SCHOOL_COLORS[s], { x: from.x, y: from.y - 34 });
    await this.hold(110);
    let travel = 0;
    switch (look.shape) {
      case "bolt":
        for (const p of points)
          travel = Math.max(travel, spellBolt(fx, this.clock, s, from, p, el));
        break;
      case "touch":
      case "tool":
        for (const p of points)
          travel = Math.max(
            travel,
            look.shape === "touch" ? spellTouch(fx, this.clock, s, p, el) : 80,
          );
        break;
      case "beam": {
        const [p0, p1] = points;
        if (p0 && p1 && (p0.x !== p1.x || p0.y !== p1.y))
          travel = spellBeam(fx, this.clock, s, p0, p1);
        else if (p0) travel = spellBolt(fx, this.clock, s, from, p0, el);
        break;
      }
      case "burst": {
        const centre = points[0];
        if (centre && el !== "lightning")
          travel = spellBolt(fx, this.clock, s, from, centre, el);
        else travel = 60;
        break;
      }
      case "ground":
      case "summon":
        travel = 60;
        break;
      case "wave": {
        const friends = (this.batch?.before.stacks ?? []).filter(
          (x) => x.side === side && x.count > 0,
        );
        friends.forEach((x, i) => {
          const u = this.unit(x.id);
          if (u && u.visible)
            spellTouch(
              fx,
              {
                now: this.scene.now + (i * 40) / this.speed,
                rate: this.clock.rate,
              },
              s,
              this.body(u),
              el,
            );
        });
        travel = 200;
        break;
      }
    }
    await this.hold(Math.min(260, travel));
    const c = this.clock;
    switch (look.shape) {
      case "burst":
        spellBurst(
          fx,
          c,
          s,
          points[0] ?? from,
          area.length > 0 ? area : points,
          el,
        );
        break;
      case "ground":
        // The hexes spawn as their ground events play; mark the line now.
        for (const h of hexes) {
          const p = hexToStage(h);
          fx.add(
            c,
            {
              kind: "ring",
              x: p.x,
              y: p.y + 6,
              r0: 4,
              r1: 16,
              pal: SCHOOL_PALETTES[s],
              flat: 0.5,
            },
            280,
          );
        }
        break;
      case "summon":
        for (const p of feet) summonRise(fx, c, s, p);
        break;
      case "wave": {
        const friends = (this.batch?.before.stacks ?? []).filter(
          (x) => x.side === side && x.count > 0,
        );
        for (const x of friends) {
          const u = this.unit(x.id);
          if (u && u.visible)
            schoolImpact(fx, c, s, this.body(u), { x: u.x, y: u.y }, el, true);
        }
        break;
      }
      case "beam":
        break;
      default:
        points.forEach((p, i) =>
          schoolImpact(fx, c, s, p, feet[i] ?? p, el, look.shape !== "bolt"),
        );
    }
    await this.hold(Math.max(0, DURATIONS.cast - 110 - Math.min(260, travel)));
  }
}
