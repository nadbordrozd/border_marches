/**
 * The battle screen: an interactive, animated front end for the
 * deterministic engine in src/core/battle.
 *
 * Entry point for the game: {@link openBattleScreen} takes the adventure
 * layer's BattleSetup (src/core/game/battle.ts), lets the player fight the
 * attacker's side while the AI plays the other, and resolves with the
 * game-level BattleResult that applyBattleResult takes. `autoResolve`
 * fights both sides with the AI at once and only shows the result dialog.
 */

import {
  DEFAULT_MAX_ROUNDS,
  activeStack,
  applyAction,
  battleResult,
  blockingHexes,
  chooseAiAction,
  compareTurnOrder,
  createBattle,
  enemyIntents,
  enemySide,
  engineSetupFromGame,
  gameResultFromEngine,
  getStack,
  hexIndex,
  isAlive,
  legalActions,
  reachableHexes,
  takeBackIndex,
} from "../../core/battle/index.ts";
import type {
  BattleAction,
  HistoryEntry,
  BattleEvent,
  BattleResult as EngineBattleResult,
  BattleSide,
  BattleStack,
  BattleState,
  StackId,
} from "../../core/battle/index.ts";
import type {
  BattleResult as GameBattleResult,
  BattleSetup as GameBattleSetup,
} from "../../core/game/battle.ts";
import { battleCue } from "../../audio/cues.ts";
import { playSound } from "../../audio/sound.ts";
import {
  battleGround,
  heroPortraitUrl,
  loadBattleArt,
} from "../../render/battle/assets.ts";
import type { BattleArt } from "../../render/battle/assets.ts";
import {
  STAGE_H,
  STAGE_W,
  fitZoom,
  hexToStage,
} from "../../render/battle/geometry.ts";
import type { Point } from "../../render/battle/geometry.ts";
import { paintBackground, renderBattle } from "../../render/battle/renderer.ts";
import {
  EMPTY_OVERLAY,
  createScene,
  pruneEffects,
  syncScene,
} from "../../render/battle/scene.ts";
import type { HexMark, Scene } from "../../render/battle/scene.ts";
import { Animator, nextSpeed, speedLabel } from "./animate.ts";
import type { Speed } from "./animate.ts";
import {
  chainLines,
  conditionTooltip,
  groundTooltip,
  intentMarkers,
  timelineEntries,
} from "./grammar.ts";
import { stackInfo } from "./info.ts";
import { hoverIntent, indexLegalActions, pointAtField } from "./intent.ts";
import type { HoverIntent, LegalIndex } from "./intent.ts";
import {
  conjugate,
  creatureName,
  stackChange,
  strikeHeadline,
  summarizePreview,
} from "./preview.ts";
import {
  castAction,
  castPreview,
  creatureBook,
  echoOptions,
  fuelOptions,
  heroBook,
  heroSideNow,
  nextStep,
  spellAreaHexes,
  stepPrompt,
} from "./magic.ts";
import type { BookEntry, CastPreview, ConditionOption } from "./magic.ts";
import { renderBook, renderCastPanel } from "./spellbook.ts";
import { registerSpells, lineThrough } from "../../core/magic/index.ts";
import { act, conditionKind, hasAct } from "../../core/battle/index.ts";

function actName(id: string): string {
  return hasAct(id) ? act(id).name : id;
}
import type { ActTarget, ConditionRef, Hex } from "../../core/battle/index.ts";
import "./battle.css";

/** A cast being aimed (RULES_V2 2.4): the page, targets, Echo and Fuel. */
interface Casting {
  readonly entry: BookEntry;
  targets: ActTarget[];
  /** A condition step: the stack whose conditions are offered. */
  pickFor: StackId | null;
  echo: ConditionRef | null;
  fuel: ConditionRef | null;
  /** Rehearsal of the hovered last target, if any. */
  hover: { target: ActTarget; preview: CastPreview } | null;
}

export interface BattleScreenOptions {
  /** Sides the player controls (default: the attacker, i.e. the hero). */
  readonly playerSides?: readonly BattleSide[];
  /** Fight both sides with the AI instantly; only the result dialog shows. */
  readonly autoResolve?: boolean;
  /** Show the result dialog (default true). */
  readonly showResult?: boolean;
  /** Initial animation speed (default 1). */
  readonly speed?: Speed;
  /** Round limit (default DEFAULT_MAX_ROUNDS: the engine's 30). */
  readonly maxRounds?: number;
  /**
   * Start from this engine state (built from `engineSetupFromGame(setup)`)
   * instead of a fresh battle. Debug views and tests.
   */
  readonly startState?: BattleState;
  /** Called once the art is loaded and the field is on screen. */
  readonly onReady?: () => void;
}

export interface BattleOutcome {
  /** For applyBattleResult. */
  readonly result: GameBattleResult;
  /** The engine's view: rounds, survivors per stack, HP killed per side. */
  readonly engine: EngineBattleResult;
}

/**
 * Runs a battle in `container` and resolves with the game-level result once
 * the player closes the result dialog. The screen removes itself.
 */
export async function openBattleScreen(
  container: HTMLElement,
  setup: GameBattleSetup,
  options: BattleScreenOptions = {},
): Promise<GameBattleResult> {
  return (await runBattleScreen(container, setup, options)).result;
}

/** Like {@link openBattleScreen}, also returning the engine's result. */
export function runBattleScreen(
  container: HTMLElement,
  setup: GameBattleSetup,
  options: BattleScreenOptions = {},
): Promise<BattleOutcome> {
  return new BattleScreen(container, setup, options).run();
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class BattleScreen {
  private readonly root = el("div", "bm-battle");
  private readonly top = el("div", "bm-top");
  private readonly stageWrap = el("div", "bm-stage-wrap");
  private readonly canvas = el("canvas", "bm-canvas");
  private readonly tip = el("div", "bm-tip");
  private readonly bottom = el("div", "bm-bottom");
  private readonly heroes = el("div", "bm-heroes");
  private readonly activeCard = el("div", "bm-active");
  private readonly panel = el("div", "bm-preview");
  private readonly buttons = el("div", "bm-buttons");
  private readonly waitBtn = el("button", "bm-btn", "Wait");
  private readonly defendBtn = el("button", "bm-btn", "Defend");
  private readonly autoBtn = el("button", "bm-btn", "Auto");
  private readonly speedBtn = el("button", "bm-btn", "");
  private readonly undoBtn = el("button", "bm-btn", "Undo");
  private readonly spellBtn = el("button", "bm-btn bm-spells", "Spells");
  private readonly book = el("div", "bm-book");
  private readonly castBox = el("div", "bm-cast");
  private casting: Casting | null = null;
  /** Applied actions this battle, for take-back (RULES_V2 1.13). */
  private history: HistoryEntry[] = [];
  private readonly info = el("div", "bm-info");
  private readonly playerSides: ReadonlySet<BattleSide>;
  private readonly maxRounds: number;

  private state: BattleState;
  private readonly startEvents: readonly BattleEvent[];
  private scene: Scene;
  private animator: Animator;
  private art: BattleArt | null = null;
  private background: HTMLCanvasElement | null = null;
  private zoom = 1;
  private frame = 0;
  private legal: LegalIndex = indexLegalActions([]);
  private pointer: Point | null = null;
  private intent: HoverIntent = { kind: "none" };
  private auto: boolean;
  private animating = false;
  private pendingAction: ((a: BattleAction | "undo") => void) | null = null;
  private infoFor: StackId | null = null;
  private log: string[] = [];
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly container: HTMLElement,
    private readonly setup: GameBattleSetup,
    private readonly options: BattleScreenOptions,
  ) {
    registerSpells();
    this.playerSides = new Set(options.playerSides ?? ["attacker"]);
    this.maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;
    this.auto = options.autoResolve === true;
    if (options.startState) {
      this.state = options.startState;
      this.startEvents = [];
    } else {
      const start = createBattle(engineSetupFromGame(setup));
      this.state = start.state;
      this.startEvents = start.events;
    }
    this.scene = createScene(this.state);
    this.animator = new Animator(this.scene, {
      onTurn: () => this.refreshHud(),
      onRound: (round) => {
        this.scene.round = round;
        this.refreshHud();
      },
      onLog: (e, before) => {
        this.logEvent(e, before);
        if (this.animator.speed !== Infinity) {
          const cue = battleCue(e, before);
          if (cue !== null) playSound(cue);
        }
      },
    });
    this.animator.speed = options.autoResolve ? Infinity : (options.speed ?? 1);
    this.buildDom();
  }

  // ------------------------------------------------------------------ DOM

  private buildDom(): void {
    const { root } = this;
    this.stageWrap.append(this.canvas, this.tip);
    this.buttons.append(
      this.waitBtn,
      this.defendBtn,
      this.undoBtn,
      this.spellBtn,
      this.autoBtn,
      this.speedBtn,
    );
    this.bottom.append(this.heroes, this.activeCard, this.panel, this.buttons);
    this.renderHeroes();
    this.info.hidden = true;
    this.book.hidden = true;
    this.castBox.hidden = true;
    this.stageWrap.append(this.book, this.castBox);
    root.append(this.top, this.stageWrap, this.bottom, this.info);
    this.spellBtn.title =
      "Spellbook (B): the hero casts one page or scroll a round, before this stack acts";
    this.on(this.spellBtn, "click", () => this.toggleBook());
    this.container.append(root);

    this.waitBtn.title = "Wait: act again after every other stack (W)";
    this.defendBtn.title = "Defend: +30% Defense until the next turn (D)";
    this.autoBtn.title = "Auto-combat: the AI plays your side (A)";
    this.undoBtn.title =
      "Take back your last action this round (U); never across a round start";
    this.on(this.undoBtn, "click", () => this.takeBack());
    this.speedBtn.title = "Animation speed (S); Space skips an animation";

    this.on(this.waitBtn, "click", () => this.playerSimple("wait"));
    this.on(this.defendBtn, "click", () => this.playerSimple("defend"));
    this.on(this.autoBtn, "click", () => this.toggleAuto());
    this.on(this.speedBtn, "click", () => this.cycleSpeed());
    this.on<PointerEvent>(this.canvas, "pointermove", (e) =>
      this.onPointerMove(e),
    );
    this.on(this.canvas, "pointerleave", () => {
      this.pointer = null;
      this.updateHover();
    });
    this.on<MouseEvent>(this.canvas, "click", (e) => this.onClick(e));
    this.on<MouseEvent>(this.canvas, "contextmenu", (e) =>
      this.onContextMenu(e),
    );
    this.on(this.info, "click", () => this.closeInfo());
    this.on<KeyboardEvent>(window, "keydown", (e) => this.onKey(e));
    const ro = new ResizeObserver(() => this.layout());
    ro.observe(this.stageWrap);
    this.cleanup.push(() => ro.disconnect());
  }

  private on<E extends Event>(
    target: EventTarget,
    type: string,
    fn: (e: E) => void,
  ): void {
    const handler = fn as EventListener;
    target.addEventListener(type, handler);
    this.cleanup.push(() => target.removeEventListener(type, handler));
  }

  private layout(): void {
    const w = this.stageWrap.clientWidth;
    const h = this.stageWrap.clientHeight;
    if (w === 0 || h === 0) return;
    const dpr = window.devicePixelRatio || 1;
    this.zoom = fitZoom(w, h, dpr);
    const cssW = STAGE_W * this.zoom;
    const cssH = STAGE_H * this.zoom;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.placeTip();
  }

  /** CSS pixel position of a stage point, relative to the stage wrapper. */
  private toWrap(p: Point): Point {
    const rect = this.canvas.getBoundingClientRect();
    const wrap = this.stageWrap.getBoundingClientRect();
    return {
      x: rect.left - wrap.left + p.x * this.zoom,
      y: rect.top - wrap.top + p.y * this.zoom,
    };
  }

  private toStage(e: MouseEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    const k = rect.width / STAGE_W;
    return { x: (e.clientX - rect.left) / k, y: (e.clientY - rect.top) / k };
  }

  // ----------------------------------------------------------- main loop

  async run(): Promise<BattleOutcome> {
    const engineStacks = this.state.stacks;
    this.art = await loadBattleArt(
      battleGround(this.setup.terrain),
      this.state.seed,
      engineStacks.map((s) => s.creature.id),
      blockingHexes(this.state),
    );
    this.background = paintBackground(this.art);
    this.layout();
    this.startFrames();
    this.refreshHud();
    this.options.onReady?.();

    let reason: EngineBattleResult["reason"] = "eliminated";
    if (this.startEvents.length > 0) {
      await this.animate(this.startEvents, this.state, this.state);
    }
    while (this.state.winner === null) {
      if (this.state.round > this.maxRounds) {
        reason = "roundLimit";
        break;
      }
      const action = await this.nextAction();
      if (action === "undo") {
        const i = this.takeBackPoint();
        const entry = i === null ? undefined : this.history[i];
        if (i === null || entry === undefined) continue;
        this.history = this.history.slice(0, i);
        this.state = entry.before;
        this.log.push("Taken back.");
        syncScene(this.scene, this.state);
        continue;
      }
      const before = this.state;
      const step = applyAction(before, action);
      const actor = activeStack(before);
      this.history.push({
        before,
        action,
        side: actor ? actor.side : "attacker",
      });
      this.state = step.state;
      this.scene.intents = [];
      this.legal = indexLegalActions([]);
      this.intent = { kind: "none" };
      this.updateOverlay();
      await this.animate(step.events, before, step.state);
    }
    const engine = battleResult(this.state, this.state.endReason ?? reason);
    const result = gameResultFromEngine(this.setup, engine);
    this.refreshHud();
    if (this.options.showResult !== false) await this.showResult(engine);
    this.destroy();
    return { result, engine };
  }

  private async animate(
    events: readonly BattleEvent[],
    before: BattleState,
    after: BattleState,
  ): Promise<void> {
    this.animating = true;
    this.refreshButtons();
    await this.animator.play(events, before, after);
    this.animating = false;
    syncScene(this.scene, after);
  }

  private isPlayerTurn(): boolean {
    const a = activeStack(this.state);
    return a !== null && this.playerSides.has(a.side) && !this.auto;
  }

  /** The side the player fights for (its first controlled side). */
  private playerSide(): BattleSide {
    return this.playerSides.has("attacker") ? "attacker" : "defender";
  }

  /** History index take-back would return to, or null. */
  private takeBackPoint(): number | null {
    const me = this.playerSide();
    const enemyHero = this.state.sides[enemySide(me)].hero !== null;
    return takeBackIndex(this.history, this.state, me, enemyHero);
  }

  private takeBack(): void {
    if (!this.pendingAction || this.animating) return;
    if (this.takeBackPoint() === null) return;
    this.pendingAction("undo");
  }

  private async nextAction(): Promise<BattleAction | "undo"> {
    if (!this.isPlayerTurn()) {
      this.refreshHud();
      if (this.animator.speed !== Infinity) {
        await delay(220 / this.animator.speed);
      }
      return chooseAiAction(this.state);
    }
    this.legal = indexLegalActions(legalActions(this.state));
    this.scene.intents = intentMarkers(
      this.state,
      enemyIntents(this.state, this.playerSide()),
    );
    const action = new Promise<BattleAction | "undo">((resolve) => {
      this.pendingAction = (a) => {
        this.pendingAction = null;
        resolve(a);
      };
    });
    this.refreshHud();
    this.updateHover();
    return action;
  }

  private commit(action: BattleAction): void {
    if (this.pendingAction) this.pendingAction(action);
  }

  private startFrames(): void {
    const tick = (now: number): void => {
      this.scene.now = now;
      this.animator.tick(now);
      pruneEffects(this.scene);
      this.draw();
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private draw(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx || !this.art || !this.background) return;
    const dpr = window.devicePixelRatio || 1;
    const k = this.zoom * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    renderBattle(ctx, {
      scene: this.scene,
      art: this.art,
      background: this.background,
      obstacles: blockingHexes(this.state),
      activeId: this.animating ? null : this.state.activeStackId,
    });
  }

  private destroy(): void {
    cancelAnimationFrame(this.frame);
    for (const fn of this.cleanup) fn();
    this.root.remove();
  }

  // --------------------------------------------------------------- input

  private onPointerMove(e: PointerEvent): void {
    this.pointer = this.toStage(e);
    this.updateHover();
  }

  private onClick(e: MouseEvent): void {
    if (!this.info.hidden) {
      this.closeInfo();
      return;
    }
    this.pointer = this.toStage(e);
    this.updateHover();
    if (!this.pendingAction || this.animating) return;
    if (this.casting) {
      this.castClick();
      return;
    }
    const it = this.intent;
    if (it.kind === "move" || it.kind === "attack") this.commit(it.action);
  }

  private onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    const h = pointAtField(this.state, this.toStage(e)).hex;
    const stack =
      h === null
        ? undefined
        : this.state.stacks.find(
            (s) => isAlive(s) && s.hex.col === h.col && s.hex.row === h.row,
          );
    if (stack) this.openInfo(stack.id);
    else this.closeInfo();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      if (this.casting) this.cancelCast();
      else if (!this.book.hidden) this.closeBook();
      else this.closeInfo();
    } else if (e.key === "b" || e.key === "B") this.toggleBook();
    else if (e.key === "Enter" && this.casting) this.castNow();
    else if (e.key === " ") {
      e.preventDefault();
      this.animator.skip();
    } else if (e.key === "w" || e.key === "W") this.playerSimple("wait");
    else if (e.key === "d" || e.key === "D") this.playerSimple("defend");
    else if (e.key === "a" || e.key === "A") this.toggleAuto();
    else if (e.key === "s" || e.key === "S") this.cycleSpeed();
    else if (e.key === "u" || e.key === "U") this.takeBack();
  }

  private playerSimple(type: "wait" | "defend"): void {
    if (!this.pendingAction || this.animating) return;
    const id = this.state.activeStackId;
    if (id === null) return;
    if (type === "wait" && !this.legal.canWait) return;
    this.commit({ type, stackId: id });
  }

  private toggleAuto(): void {
    this.auto = !this.auto;
    if (this.auto && this.pendingAction) {
      this.commit(chooseAiAction(this.state));
    }
    this.refreshHud();
    this.updateHover();
  }

  private cycleSpeed(): void {
    this.animator.speed = nextSpeed(this.animator.speed);
    if (this.animator.speed === Infinity) this.animator.skip();
    this.refreshButtons();
  }

  // --------------------------------------------------------------- hover

  private updateHover(): void {
    const at = this.pointer ? pointAtField(this.state, this.pointer) : null;
    this.intent =
      at === null || this.animating || this.casting !== null
        ? { kind: "none" }
        : hoverIntent(
            this.state,
            this.legal,
            at.hex,
            at.pointer,
            this.pendingAction !== null && this.isPlayerTurn(),
          );
    const it = this.intent;
    this.canvas.style.cursor =
      it.kind === "attack"
        ? "crosshair"
        : it.kind === "move"
          ? "pointer"
          : it.kind === "out-of-reach"
            ? "not-allowed"
            : "default";
    if (this.casting) this.castHover(at?.hex ?? null);
    this.updateOverlay();
    this.renderPanel();
    this.placeTip();
  }

  private updateOverlay(): void {
    const marks = new Map<number, HexMark>();
    const playerTurn = this.pendingAction !== null && this.isPlayerTurn();
    const active = activeStack(this.state);
    if (playerTurn && active) {
      for (const [i, d] of reachableHexes(this.state, active.id)) {
        if (d > 0) marks.set(i, "reachable");
      }
    }
    const it = this.intent;
    let strike: {
      from: BattleStack["hex"];
      target: BattleStack["hex"];
    } | null = null;
    switch (it.kind) {
      case "move":
        for (const h of it.path) marks.set(hexIndex(h), "path");
        marks.set(hexIndex(it.action.to), "move-target");
        break;
      case "attack": {
        const target = getStack(this.state, it.action.targetId);
        for (const h of it.path) marks.set(hexIndex(h), "path");
        if (it.action.type === "attack") {
          marks.set(hexIndex(it.action.from), "attack-from");
          strike = { from: it.action.from, target: target.hex };
        }
        marks.set(hexIndex(target.hex), "target");
        break;
      }
      case "out-of-reach":
        marks.set(hexIndex(it.stack.hex), "target-blocked");
        break;
      case "inspect":
        marks.set(hexIndex(it.stack.hex), "inspect");
        break;
      case "none":
        break;
    }
    if (this.casting) this.castMarks(marks);
    this.scene.overlay =
      active === null && marks.size === 0
        ? EMPTY_OVERLAY
        : {
            marks,
            active: !this.animating && active ? active.hex : null,
            strike,
          };
  }

  /** The floating damage tooltip above the hovered target. */
  private placeTip(): void {
    const it = this.intent;
    if (it.kind !== "attack") {
      this.placeInfoTip();
      return;
    }
    const s = summarizePreview(this.state, it.preview);
    const target = getStack(this.state, it.action.targetId);
    this.tip.replaceChildren();
    const dealt = el("div", "bm-tip-deal");
    dealt.append(
      el("span", "bm-tip-big", `\u2212${s.strike.damage}`),
      el(
        "span",
        "bm-tip-kills",
        s.strike.after === 0
          ? ` all ${s.strike.before} slain`
          : s.strike.kills === 0
            ? " none slain"
            : ` ${s.strike.kills} slain`,
      ),
    );
    this.tip.append(dealt);
    if (s.retaliation) {
      const r = s.retaliation;
      this.tip.append(
        el(
          "div",
          "bm-tip-ret",
          `\u21a9 \u2212${r.damage}, ${r.after === 0 ? "all" : r.kills === 0 ? "none" : r.kills} of yours slain`,
        ),
      );
    } else {
      this.tip.append(el("div", "bm-tip-none", "no retaliation"));
    }
    this.tip.hidden = false;
    // Above the target's head; below its feet when that would leave the field.
    const c = hexToStage(target.hex);
    const above = this.toWrap({ x: c.x, y: c.y - 60 });
    const below = this.toWrap({ x: c.x, y: c.y + 40 });
    const flip = above.y - this.tip.offsetHeight < 2;
    this.tip.classList.toggle("bm-below", flip);
    const p = flip ? below : above;
    this.tip.style.left = `${Math.round(p.x)}px`;
    this.tip.style.top = `${Math.round(p.y)}px`;
  }

  /** Hover tooltip: a stack's conditions, or the ground under the pointer. */
  private placeInfoTip(): void {
    const at = this.pointer ? pointAtField(this.state, this.pointer) : null;
    const h = at?.hex ?? null;
    this.tip.hidden = true;
    if (h === null || this.animating) return;
    const stack = this.state.stacks.find(
      (s) => isAlive(s) && s.hex.col === h.col && s.hex.row === h.row,
    );
    const lines: string[] = [];
    if (stack) {
      for (const c of stack.conditions)
        lines.push(conditionTooltip(this.state, c));
      if (stack.wary > 0) lines.push(`Wary: refuses Holds (${stack.wary})`);
    }
    const g = this.state.ground.find(
      (x) => x.hex.col === h.col && x.hex.row === h.row,
    );
    if (g && g.class !== "blocking") lines.push(groundTooltip(g));
    if (lines.length === 0) return;
    this.tip.replaceChildren(...lines.map((l) => el("div", "bm-tip-cond", l)));
    this.tip.classList.remove("bm-below");
    this.tip.hidden = false;
    const c = hexToStage(h);
    const p = this.toWrap({ x: c.x, y: c.y - 70 });
    this.tip.style.left = `${Math.round(p.x)}px`;
    this.tip.style.top = `${Math.round(p.y)}px`;
  }

  // ----------------------------------------------------------------- HUD

  private refreshHud(): void {
    this.renderTop();
    this.renderActive();
    this.renderPanel();
    this.refreshButtons();
    if (this.infoFor !== null) this.openInfo(this.infoFor);
  }

  private refreshButtons(): void {
    const playerTurn =
      this.pendingAction !== null && this.isPlayerTurn() && !this.animating;
    this.waitBtn.disabled = !playerTurn || !this.legal.canWait;
    this.defendBtn.disabled = !playerTurn;
    this.undoBtn.disabled = !playerTurn || this.takeBackPoint() === null;
    const side = heroSideNow(this.state, this.playerSides);
    const magic = side ? this.state.sides[side].magic : undefined;
    const hasBook =
      (side !== null && heroBook(this.state, side).length > 0) ||
      creatureBook(this.state).length > 0;
    this.spellBtn.disabled = !playerTurn || !hasBook;
    this.spellBtn.textContent = magic ? `Spells · ${magic.mana}` : "Spells";
    this.spellBtn.classList.toggle(
      "bm-on",
      !this.book.hidden || this.casting !== null,
    );
    this.autoBtn.disabled = this.state.winner !== null;
    this.autoBtn.textContent = this.auto ? "Auto: on" : "Auto";
    this.autoBtn.classList.toggle("bm-on", this.auto);
    this.speedBtn.textContent = speedLabel(this.animator.speed);
  }

  /** The portraits of the heroes leading the two sides (attacker first). */
  private renderHeroes(): void {
    for (const side of ["attacker", "defender"] as const) {
      const hero = this.setup[side].hero;
      if (hero === null) continue;
      const img = el("img", `bm-hero-portrait bm-${side}`);
      img.src = heroPortraitUrl(hero);
      img.alt = hero.name ?? "Hero";
      img.title = `${hero.name ?? "Hero"} (${
        this.playerSides.has(side) ? "your hero" : "enemy hero"
      }): Attack ${hero.attack}, Defense ${hero.defense}`;
      this.heroes.append(img);
    }
    this.bottom.classList.toggle(
      "bm-with-heroes",
      this.heroes.childElementCount > 0,
    );
  }

  private renderTop(): void {
    const s = this.state;
    this.top.replaceChildren();
    this.top.append(
      el("span", "bm-round", `Round ${this.scene.round || s.round}`),
    );
    const entries = timelineEntries(s);
    const next = s.stacks
      .filter(isAlive)
      .sort(compareTurnOrder)
      .map((x) => x.id);
    const strip = el("span", "bm-order");
    const chip = (id: StackId, cls: string): void => {
      const st = getStack(s, id);
      if (!isAlive(st)) return;
      const c = el(
        "span",
        `bm-chip bm-${st.side} ${cls}`,
        `${creatureName(st.creature, st.count)} ${st.count}`,
      );
      if (s.waiting.includes(id)) c.title = "waiting";
      strip.append(c);
    };
    entries.forEach((t, i) => {
      if (t.kind === "stack") {
        chip(t.id, i === 0 && s.winner === null ? "bm-now" : "");
        const last = strip.lastElementChild as HTMLElement | null;
        if (last && t.note !== "") last.title = t.note;
      } else {
        const ev = el(
          "span",
          `bm-chip bm-${t.side} bm-event`,
          `\u23f1 ${t.label}`,
        );
        ev.title = `Scheduled by ${t.note}`;
        strip.append(ev);
      }
    });
    if (s.winner === null) {
      strip.append(el("span", "bm-next", `Round ${s.round + 1}:`));
      next
        .slice(0, Math.max(2, 12 - entries.length))
        .forEach((id) => chip(id, "bm-later"));
    }
    this.top.append(strip);
  }

  private renderActive(): void {
    const a = activeStack(this.state);
    this.activeCard.replaceChildren();
    if (!a) return;
    this.activeCard.classList.toggle("bm-enemy", !this.playerSides.has(a.side));
    const src = this.art?.portraits.get(a.creature.id);
    if (src) {
      const img = el("img", "bm-portrait");
      img.src = src;
      img.alt = "";
      this.activeCard.append(img);
    }
    const text = el("div", "bm-active-text");
    text.append(
      el(
        "div",
        "bm-active-name",
        `${creatureName(a.creature, a.count)} ×${a.count}`,
      ),
      el(
        "div",
        "bm-active-stats",
        `Atk ${a.creature.attack}  Def ${a.creature.defense}  Dmg ${a.creature.damage}  Spd ${a.creature.speed}`,
      ),
      el(
        "div",
        "bm-active-stats",
        `HP ${a.topHp}/${a.creature.hp}` +
          (a.creature.shots
            ? `  Shots ${a.shotsLeft}/${a.creature.shots}`
            : ""),
      ),
    );
    this.activeCard.append(text);
  }

  private renderPanel(): void {
    const p = this.panel;
    p.replaceChildren();
    const it = this.intent;
    if (it.kind === "attack") {
      const s = summarizePreview(this.state, it.preview);
      const head = el("div", "bm-pv-head");
      head.append(
        el(
          "span",
          "",
          `${s.attacker} ${conjugate(s.verb.toLowerCase(), s.attackerCount)} ${s.target}`,
        ),
      );
      if (s.hexesMoved > 0) {
        head.append(
          el(
            "span",
            "bm-dim",
            `  after moving ${s.hexesMoved} hex${s.hexesMoved === 1 ? "" : "es"}`,
          ),
        );
      }
      p.append(head);
      const deal = el("div", "bm-pv-deal");
      deal.append(
        el("span", "bm-pv-label", "Deal "),
        el("b", "", strikeHeadline(s.strike)),
        el("span", "bm-dim", `   ${stackChange(s.strike)}`),
      );
      p.append(deal);
      const ret = el("div", "bm-pv-ret");
      if (s.retaliation) {
        ret.append(
          el("span", "bm-pv-label", "Retaliation "),
          el("b", "", strikeHeadline(s.retaliation)),
          el("span", "bm-dim", `   ${stackChange(s.retaliation)}`),
        );
      } else {
        ret.classList.add("bm-safe");
        ret.append(el("b", "", s.noRetaliation ?? "No retaliation"));
      }
      p.append(ret);
      const why = [s.strike.attackLine, ...s.strike.bonuses, ...s.statuses];
      p.append(el("div", "bm-pv-why", why.join("  ·  ")));
      const chain = chainLines(this.state, it.preview.chain);
      if (chain.length > 0)
        p.append(el("div", "bm-pv-chain", chain.join(" \u2192 ")));
      return;
    }
    const a = activeStack(this.state);
    if (this.state.winner !== null || a === null) {
      p.append(el("div", "bm-pv-head", "The battle is over."));
      return;
    }
    const name = creatureName(a.creature, a.count);
    if (it.kind === "move") {
      p.append(
        el("div", "bm-pv-head", `Move ${name}`),
        el(
          "div",
          "bm-pv-deal",
          `${it.path.length} hex${it.path.length === 1 ? "" : "es"} of ${a.creature.speed}`,
        ),
      );
    } else if (it.kind === "out-of-reach") {
      p.append(
        el(
          "div",
          "bm-pv-head",
          `${creatureName(it.stack.creature, it.stack.count)} ×${it.stack.count}: out of reach this turn`,
        ),
      );
      for (const c of it.stack.conditions)
        p.append(el("div", "bm-pv-cond", conditionTooltip(this.state, c)));
    } else if (it.kind === "inspect") {
      p.append(
        el(
          "div",
          "bm-pv-head",
          `${creatureName(it.stack.creature, it.stack.count)} ×${it.stack.count}`,
        ),
        el("div", "bm-dim", "Right-click for details"),
      );
      for (const c of it.stack.conditions)
        p.append(el("div", "bm-pv-cond", conditionTooltip(this.state, c)));
    } else if (this.isPlayerTurn() && this.pendingAction) {
      p.append(
        el("div", "bm-pv-head", `${name}: your move`),
        el(
          "div",
          "bm-dim",
          "Point at an enemy for the exact damage, kills and retaliation. Click a shaded hex to move. Right-click any stack for details.",
        ),
      );
    } else {
      p.append(
        el(
          "div",
          "bm-pv-head",
          !this.playerSides.has(a.side)
            ? `Enemy turn: ${name}`
            : this.auto
              ? `Auto-combat: ${name}`
              : `${name}: your move`,
        ),
      );
    }
    for (const line of this.log.slice(-2)) p.append(el("div", "bm-log", line));
  }

  private logEvent(e: BattleEvent, before: BattleState): void {
    const name = (id: StackId): string => {
      const st = getStack(before, id);
      return creatureName(st.creature, st.count);
    };
    const does = (id: StackId, v: string): string =>
      `${name(id)} ${conjugate(v, getStack(before, id).count)}`;
    let line: string | null = null;
    if (e.type === "damage") {
      const v =
        e.kind === "retaliation"
          ? "retaliate on"
          : e.kind === "shot"
            ? "shoot"
            : "hit";
      const killed =
        e.countAfter === 0
          ? "all killed"
          : e.kills === 0
            ? "none killed"
            : `${e.kills} killed`;
      line = `${does(e.sourceId, v)} ${name(e.targetId)}: ${e.damage} damage, ${killed}`;
    } else if (e.type === "wait") line = does(e.stackId, "wait");
    else if (e.type === "defend") line = does(e.stackId, "defend");
    else if (e.type === "heroAct" && e.cast) {
      const name = this.setup[e.side]?.hero?.name ?? "The hero";
      line = `${name} casts ${actName(e.act)} (Power ${e.cast.power}${e.cast.scroll ? ", scroll" : `, ${e.cast.mana} mana`}${e.cast.fuelled ? ", Fuelled" : ""}${e.cast.echoed ? ", Echo" : ""})`;
    } else if (e.type === "creatureCast")
      line = `${does(e.stackId, "cast")} ${actName(e.spell)} (Power ${e.power})`;
    else if (e.type === "heal")
      line = `${does(e.stackId, "regenerate")} ${e.amount} HP`;
    if (line !== null) {
      this.log.push(line);
      if (this.log.length > 20) this.log.shift();
      if (this.intent.kind !== "attack") this.renderPanel();
    }
  }

  // --------------------------------------------------------------- magic

  private toggleBook(): void {
    if (!this.book.hidden) {
      this.closeBook();
      return;
    }
    if (!this.pendingAction || this.animating || !this.isPlayerTurn()) return;
    this.cancelCast();
    const side = heroSideNow(this.state, this.playerSides);
    const pages = side ? heroBook(this.state, side) : [];
    const magic = side ? this.state.sides[side].magic : undefined;
    const active = activeStack(this.state);
    const own = creatureBook(this.state);
    renderBook(
      this.book,
      {
        title: `${(side && this.setup[side]?.hero?.name) || "Hero"}'s spellbook`,
        status: magic
          ? `Mana ${magic.mana} · Fuel ${magic.fuelMax - magic.fuelUsed} left · ${
              this.state.sides[side as BattleSide].castRound ===
              this.state.round
                ? "already cast this round"
                : "one cast this round"
            }`
          : "No book.",
        pages: pages.filter((p) => p.source === "page"),
        scrolls: pages.filter((p) => p.source === "scroll"),
        items: pages.filter((p) => p.source === "item"),
        creature:
          active && own.length > 0
            ? { name: creatureName(active.creature, active.count), pages: own }
            : null,
      },
      (entry) => this.startCast(entry),
      () => this.closeBook(),
    );
    this.book.hidden = false;
    this.refreshButtons();
  }

  private closeBook(): void {
    this.book.hidden = true;
    this.refreshButtons();
  }

  private startCast(entry: BookEntry): void {
    this.closeBook();
    this.casting = {
      entry,
      targets: [],
      pickFor: null,
      echo: null,
      fuel: null,
      hover: null,
    };
    this.castBox.hidden = false;
    this.refreshCast();
  }

  private cancelCast(): void {
    this.casting = null;
    this.castBox.hidden = true;
    this.updateHover();
    this.refreshButtons();
  }

  private castNow(): void {
    const c = this.casting;
    if (!c || !this.pendingAction || this.animating) return;
    if (nextStep(c.entry.id, c.targets) !== null) return;
    const action = castAction(this.state, c.entry, c.targets, {
      echo: c.echo,
      fuel: c.fuel,
    });
    if (!castPreview(this.state, action).legal) return;
    this.casting = null;
    this.castBox.hidden = true;
    this.commit(action);
  }

  /** The target a click or hover on `h` would add, or null. */
  private targetAt(h: Hex | null): ActTarget | null {
    const c = this.casting;
    if (!c || h === null) return null;
    const step = nextStep(c.entry.id, c.targets);
    const stack = this.state.stacks.find(
      (s) => isAlive(s) && s.hex.col === h.col && s.hex.row === h.row,
    );
    if (step === "stack") return stack ? { stack: stack.id } : null;
    if (step === "hex") return { hex: h };
    return null;
  }

  private castClick(): void {
    const c = this.casting;
    if (!c) return;
    const at = this.pointer ? pointAtField(this.state, this.pointer).hex : null;
    const step = nextStep(c.entry.id, c.targets);
    if (step === "condition") {
      const stack =
        at === null
          ? undefined
          : this.state.stacks.find(
              (s) => isAlive(s) && s.hex.col === at.col && s.hex.row === at.row,
            );
      c.pickFor = stack ? stack.id : null;
      this.refreshCast();
      return;
    }
    const t = this.targetAt(at);
    if (!t) return;
    c.targets.push(t);
    // A line of three: the second hex sets the direction, the third follows.
    const rule = nextStep(c.entry.id, c.targets);
    if (
      rule === "hex" &&
      c.targets.length === 2 &&
      c.entry.id === "bramble-row"
    ) {
      const [a, b] = c.targets.map((x) => ("hex" in x ? x.hex : null));
      if (a && b) {
        const line = lineThrough(a, b);
        if (line[2]) c.targets.push({ hex: line[2] });
      }
    }
    c.hover = null;
    this.refreshCast();
  }

  private castHover(h: Hex | null): void {
    const c = this.casting;
    if (!c) return;
    const steps = nextStep(c.entry.id, c.targets);
    const t = this.targetAt(h);
    const last =
      steps !== null &&
      nextStep(c.entry.id, [...c.targets, t ?? { hex: { col: 0, row: 0 } }]) ===
        null;
    if (t && last) {
      const same =
        c.hover !== null &&
        JSON.stringify(c.hover.target) === JSON.stringify(t);
      if (!same) {
        const action = castAction(this.state, c.entry, [...c.targets, t]);
        c.hover = { target: t, preview: castPreview(this.state, action) };
        this.refreshCast();
      }
    } else if (c.hover !== null) {
      c.hover = null;
      this.refreshCast();
    }
  }

  private castMarks(marks: Map<number, HexMark>): void {
    const c = this.casting;
    if (!c) return;
    marks.clear();
    for (const t of c.targets) {
      if ("hex" in t) marks.set(hexIndex(t.hex), "target");
      else if ("stack" in t)
        marks.set(hexIndex(getStack(this.state, t.stack).hex), "target");
    }
    const at = this.pointer ? pointAtField(this.state, this.pointer).hex : null;
    const step = nextStep(c.entry.id, c.targets);
    if (at !== null && step === "hex") {
      for (const h of spellAreaHexes(c.entry.id, at))
        marks.set(hexIndex(h), "move-target");
    } else if (at !== null && step !== null) {
      marks.set(hexIndex(at), "inspect");
    }
    if (c.pickFor !== null)
      marks.set(hexIndex(getStack(this.state, c.pickFor).hex), "inspect");
  }

  private refreshCast(): void {
    const c = this.casting;
    if (!c) return;
    const id = c.entry.id;
    const step = nextStep(id, c.targets);
    const complete = step === null;
    let conditions: ConditionOption[] | null = null;
    if (step === "condition" && c.pickFor !== null) {
      const s = getStack(this.state, c.pickFor);
      conditions = s.conditions.map((x) => ({
        ref: { stack: s.id, condition: x.uid },
        label: `${conditionKind(x.kind).name}${x.size ? ` ${x.size}` : ""}${x.clock === null ? "" : ` (${x.clock})`}`,
        effect: conditionKind(x.kind).text(x),
      }));
    }
    const spell = c.entry.source === "page" || c.entry.source === "scroll";
    const echo =
      complete && spell ? echoOptions(this.state, id, c.targets) : [];
    const fuel =
      complete && spell ? fuelOptions(this.state, id, c.targets) : [];
    const side = activeStack(this.state)?.side ?? "attacker";
    const magic = this.state.sides[side].magic;
    const preview = complete
      ? castPreview(
          this.state,
          castAction(this.state, c.entry, c.targets, {
            echo: c.echo,
            fuel: c.fuel,
          }),
        )
      : (c.hover?.preview ?? null);
    renderCastPanel(
      this.castBox,
      {
        entry: c.entry,
        prompt:
          step === "condition" && c.pickFor !== null
            ? "Choose the condition."
            : stepPrompt(id, c.targets),
        conditions,
        choices: step === "choice" ? ["+2", "-2"] : null,
        preview,
        hovered: !complete && c.hover !== null,
        echo,
        fuel,
        echoOn: c.echo,
        fuelOn: c.fuel,
        fuelLeft: magic ? magic.fuelUsed < magic.fuelMax : true,
        complete,
      },
      {
        onCondition: (ref) => {
          c.targets.push(ref);
          c.pickFor = null;
          this.refreshCast();
        },
        onChoice: (choice) => {
          c.targets.push({ choice });
          this.refreshCast();
        },
        onEcho: (ref) => {
          c.echo = ref;
          this.refreshCast();
        },
        onFuel: (ref) => {
          c.fuel = ref;
          this.refreshCast();
        },
        onCast: () => this.castNow(),
        onBack: () => {
          c.targets.pop();
          c.pickFor = null;
          c.echo = null;
          c.fuel = null;
          this.refreshCast();
        },
        onCancel: () => this.cancelCast(),
      },
    );
    this.updateOverlay();
    this.refreshButtons();
  }

  // ---------------------------------------------------------------- info

  private openInfo(id: StackId): void {
    this.infoFor = id;
    const stack = getStack(this.state, id);
    const info = stackInfo(this.state, stack);
    const box = this.info;
    box.replaceChildren();
    box.className = `bm-info bm-${info.side}`;
    const head = el("div", "bm-info-head");
    const src = this.art?.portraits.get(stack.creature.id);
    if (src) {
      const img = el("img", "bm-portrait");
      img.src = src;
      img.alt = "";
      head.append(img);
    }
    const title = el("div", "");
    title.append(
      el("div", "bm-info-title", `${info.title} ×${info.count}`),
      el(
        "div",
        "bm-dim",
        this.playerSides.has(info.side)
          ? "Your army"
          : info.side === "defender"
            ? "Enemy"
            : "Attacker",
      ),
    );
    head.append(title);
    box.append(head);
    const table = el("table", "bm-info-stats");
    for (const s of info.stats) {
      const tr = el("tr");
      tr.append(
        el("td", "", s.label),
        el("td", "bm-num", s.value),
        el("td", "bm-dim", s.note),
      );
      table.append(tr);
    }
    box.append(table);
    if (info.ability) {
      const ab = el("div", "bm-info-ability");
      ab.append(
        el("b", "", `${info.ability.name}. `),
        document.createTextNode(info.ability.text),
      );
      box.append(ab);
    }
    for (const st of info.statuses) box.append(el("div", "bm-info-status", st));
    box.append(el("div", "bm-dim bm-info-close", "Click or Esc to close"));
    box.hidden = false;
  }

  private closeInfo(): void {
    this.infoFor = null;
    this.info.hidden = true;
  }

  // -------------------------------------------------------------- result

  private showResult(engine: EngineBattleResult): Promise<void> {
    const player: BattleSide =
      this.playerSides.has("defender") && !this.playerSides.has("attacker")
        ? "defender"
        : "attacker";
    const won = engine.winner === player;
    playSound(won ? "victory" : "defeat");
    const dlg = el("div", "bm-result");
    const box = el("div", `bm-result-box ${won ? "bm-won" : "bm-lost"}`);
    box.append(
      el("div", "bm-result-title", won ? "Victory!" : "Defeat"),
      el(
        "div",
        "bm-dim",
        engine.reason === "roundLimit"
          ? `The round limit (${this.maxRounds} rounds) was reached: the defenders hold the field.`
          : `After ${engine.rounds} round${engine.rounds === 1 ? "" : "s"}.`,
      ),
    );
    const cols = el("div", "bm-result-cols");
    for (const side of ["attacker", "defender"] as const) {
      const col = el("div", "bm-result-col");
      col.append(
        el(
          "div",
          "bm-result-side",
          side === player ? "Your casualties" : "Enemy casualties",
        ),
      );
      let any = false;
      for (const s of this.state.stacks.filter((x) => x.side === side)) {
        const lost = s.initialCount - s.count;
        const row = el("div", "bm-result-row");
        const src = this.art?.portraits.get(s.creature.id);
        if (src) {
          const img = el("img", "bm-portrait");
          img.src = src;
          img.alt = "";
          row.append(img);
        }
        row.append(
          el("span", "", creatureName(s.creature, s.initialCount)),
          el(
            "span",
            "bm-num",
            lost === 0 ? "none lost" : `${lost} of ${s.initialCount} lost`,
          ),
        );
        if (lost === 0) row.classList.add("bm-dim");
        col.append(row);
        any = true;
      }
      if (!any) col.append(el("div", "bm-dim", "none"));
      cols.append(col);
    }
    box.append(cols);
    if (engine.winner === "attacker" && this.setup.attacker.hero) {
      box.append(
        el(
          "div",
          "bm-result-xp",
          `Your hero gains ${engine.killedHp.attacker} experience.`,
        ),
      );
    }
    const ok = el("button", "bm-btn bm-ok", "OK");
    box.append(ok);
    dlg.append(box);
    this.root.append(dlg);
    ok.focus();
    return new Promise((resolve) => {
      const done = (): void => {
        window.removeEventListener("keydown", key);
        resolve();
      };
      const key = (e: KeyboardEvent): void => {
        if (e.key === "Enter" || e.key === "Escape") done();
      };
      ok.addEventListener("click", done);
      window.addEventListener("keydown", key);
    });
  }
}
