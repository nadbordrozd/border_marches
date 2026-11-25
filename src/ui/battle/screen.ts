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
  fightValueLeft,
  roundLimitOf,
  activeStack,
  applyAction,
  autoDeploy,
  battleResult,
  blockingHexes,
  chooseAiAction,
  compareTurnOrder,
  createBattle,
  deployingSides,
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
  BattleSetup as EngineBattleSetup,
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
import { onMotionChange, reducedMotion } from "../motion.ts";
import { flipChildren } from "../anim.ts";
import type { Speed } from "./animate.ts";
import {
  attackChainLines,
  conditionTooltip,
  groundTooltip,
  intentMarkers,
  timelineEntries,
} from "./grammar.ts";
import { roundLimitInfo, stackInfo } from "./info.ts";
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
import {
  BATTLE_HEX_COUNT,
  ability as abilityDef,
  act,
  conditionKind,
  findPath,
  hasAct,
  sameHex,
} from "../../core/battle/index.ts";
import type {
  ActTarget,
  AttackAction,
  ConditionRef,
  Hex,
} from "../../core/battle/index.ts";
import { actionBar, actionForKey } from "./actions.ts";
import { DeployPhase } from "./deploy.ts";
import type { ActionIcon, BarAction, BarContext } from "./actions.ts";
import { renderActPanel, renderActionBar, showActionTip } from "./actionbar.ts";
import { iconElement } from "../icons.ts";
import {
  addTarget,
  afterChoices,
  areaHexes,
  backStep,
  choices,
  choicesAt,
  isComplete,
  isFull,
  modeAct,
  modeAction,
  modeName,
  modePrompt,
  pickFrom,
  pickStack,
  shotAreaHexes,
  startMode,
  stepKind,
  walkAfterRange,
  withAfter,
  withHearten,
} from "./targeting.ts";
import type { ActMode, AfterChoice, Choice, ModeKind } from "./targeting.ts";
import "./battle.css";

function actName(id: string): string {
  return hasAct(id) ? act(id).name : id;
}

/** An act being aimed from the action bar (targeting.ts). */
interface Aiming {
  /** The bar action that started it (its icon and rule text). */
  readonly bar: BarAction;
  mode: ActMode;
  choices: Choice[];
  /** The walk-first hex of the completing target, once chosen. */
  from: Hex | null;
  /** The valid target under the pointer, with its exact rehearsal. */
  hover: {
    readonly key: string;
    readonly choice: Choice;
    readonly from: Hex | null;
    readonly preview: CastPreview | null;
  } | null;
}

/** Hit and Run: the attack is chosen, the step after it is being picked. */
interface AfterStep {
  readonly attack: AttackAction;
  readonly choices: readonly AfterChoice[];
  hover: AfterChoice | null;
  preview: CastPreview;
}

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
  /**
   * A harness: stop after this many rounds with no winner (default
   * DEFAULT_MAX_ROUNDS, the engine's limit, where the engine itself ends
   * the battle with a verdict).
   */
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
  private readonly autoBtn = el("button", "bm-btn", "Auto");
  private readonly speedBtn = el("button", "bm-btn", "");
  private readonly actionBarEl = el("div", "bm-actionbar");
  private readonly actTip = el("div", "bm-act-tip");
  private readonly book = el("div", "bm-book");
  private readonly castBox = el("div", "bm-cast");
  private casting: Casting | null = null;
  /** The action bar as last computed, and what it was computed for. */
  private bar: BarAction[] = [];
  private barFor: { state: BattleState; ctx: string } | null = null;
  private barHover: { key: string; anchor: HTMLElement } | null = null;
  private barLook = "";
  private aiming: Aiming | null = null;
  private afterStep: AfterStep | null = null;
  /** Heartened: spend it after this action (the player may keep it). */
  private heartenSpend = true;
  private heartenFor = "";
  /** Applied actions this battle, for take-back (RULES_V2 1.13). */
  private history: HistoryEntry[] = [];
  private readonly info = el("div", "bm-info");
  private readonly playerSides: ReadonlySet<BattleSide>;
  private readonly maxRounds: number;

  private state: BattleState;
  private startEvents: readonly BattleEvent[];
  /** The deployment phase before round 1 (Vanguard), while it lasts. */
  private deploying: DeployPhase | null = null;
  private deployDone: ((setup: EngineBattleSetup) => void) | null = null;
  /** Where a drag started during deployment. */
  private dragFrom: Hex | null = null;
  /** A drag just ended: the click that follows it is not a pick. */
  private suppressClick = false;
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
      // Deployment (Vanguard): the AI places the sides it plays; the
      // player's deploying side gets the phase, unless auto-resolving.
      const engineSetup = engineSetupFromGame(setup);
      const sides = deployingSides(engineSetup);
      const mine = this.auto
        ? undefined
        : sides.find((s) => this.playerSides.has(s));
      const placed = autoDeploy(
        engineSetup,
        sides.filter((s) => s !== mine),
      );
      if (mine !== undefined) {
        this.deploying = new DeployPhase(placed, mine, {
          changed: (state) => {
            this.state = state;
            syncScene(this.scene, state);
            this.refreshHud();
            this.updateOverlay();
          },
          done: (s) => this.deployDone?.(s),
        });
        this.state = this.deploying.state();
        this.startEvents = [];
      } else {
        const start = createBattle(placed);
        this.state = start.state;
        this.startEvents = start.events;
      }
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
    this.animator.reduced = reducedMotion();
    this.scene.reduced = this.animator.reduced;
    this.cleanup.push(
      onMotionChange((reduced) => {
        this.animator.reduced = reduced;
        this.scene.reduced = reduced;
      }),
    );
    this.buildDom();
  }

  // ------------------------------------------------------------------ DOM

  private buildDom(): void {
    const { root } = this;
    this.stageWrap.append(this.canvas, this.tip);
    this.buttons.append(this.autoBtn, this.speedBtn);
    this.bottom.append(this.heroes, this.activeCard, this.panel, this.buttons);
    this.renderHeroes();
    this.info.hidden = true;
    this.book.hidden = true;
    this.castBox.hidden = true;
    this.actTip.hidden = true;
    this.stageWrap.append(this.book, this.castBox);
    root.append(
      this.top,
      this.stageWrap,
      this.actionBarEl,
      this.bottom,
      this.info,
      this.actTip,
    );
    this.container.append(root);

    this.autoBtn.title = "Auto-combat: the AI plays your side (A)";
    this.speedBtn.title = "Animation speed (S); Space skips an animation";

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
    this.on<PointerEvent>(this.canvas, "pointerdown", (e) =>
      this.onPointerDown(e),
    );
    this.on<PointerEvent>(this.canvas, "pointerup", (e) => this.onPointerUp(e));
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
    if (this.deploying !== null) await this.runDeployment();
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
      await this.animate(step.events, before, step.state, action);
    }
    const engine = battleResult(this.state, this.state.endReason ?? reason);
    const result = gameResultFromEngine(this.setup, engine);
    this.refreshHud();
    if (this.options.showResult !== false) await this.showResult(engine);
    this.destroy();
    return { result, engine };
  }

  /**
   * The deployment phase: waits for the player's "Start battle", then
   * creates the battle on the deployed field (battle-start rules run
   * here, after deployment, as RULES_V2 4.6 orders them).
   */
  private async runDeployment(): Promise<void> {
    const setup = await new Promise<EngineBattleSetup>((resolve) => {
      this.deployDone = resolve;
      this.refreshHud();
      this.updateOverlay();
    });
    this.deployDone = null;
    this.deploying = null;
    this.dragFrom = null;
    const start = createBattle(setup);
    this.state = start.state;
    this.startEvents = start.events;
    syncScene(this.scene, this.state);
    this.canvas.style.cursor = "default";
    this.refreshHud();
    this.updateOverlay();
  }

  private async animate(
    events: readonly BattleEvent[],
    before: BattleState,
    after: BattleState,
    action: BattleAction | null = null,
  ): Promise<void> {
    this.animating = true;
    this.refreshButtons();
    await this.animator.play(events, before, after, action);
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
    // Whatever was being aimed belongs to the board being taken back.
    this.aiming = null;
    this.afterStep = null;
    this.casting = null;
    this.castBox.hidden = true;
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
    this.aiming = null;
    this.afterStep = null;
    this.castBox.hidden = true;
    if (this.pendingAction) this.pendingAction(action);
  }

  /** A player's action, with their Heartened choice. */
  private commitPlayer(action: BattleAction): void {
    this.commit(withHearten(action, this.heartenSpend));
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

  /** The hex under a pointer event (deployment's drag and click). */
  private hexOf(e: MouseEvent): Hex | null {
    return pointAtField(this.state, this.toStage(e)).hex;
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.deploying === null || e.button !== 0) return;
    const h = this.hexOf(e);
    this.dragFrom = this.deploying.canDrag(h) ? h : null;
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.deploying === null || this.dragFrom === null) return;
    const from = this.dragFrom;
    const to = this.hexOf(e);
    this.dragFrom = null;
    // A press and release on one hex is a click (handled by onClick).
    if (to === null || sameHex(from, to)) return;
    this.deploying.drag(from, to);
    this.suppressClick = true;
    this.updateHover();
  }

  private onClick(e: MouseEvent): void {
    if (!this.info.hidden) {
      this.closeInfo();
      return;
    }
    if (this.deploying !== null) {
      if (this.suppressClick) this.suppressClick = false;
      else this.deploying.click(this.hexOf(e));
      this.pointer = this.toStage(e);
      this.updateHover();
      return;
    }
    this.pointer = this.toStage(e);
    this.updateHover();
    if (!this.pendingAction || this.animating) return;
    if (this.aiming) {
      this.aimClick();
      return;
    }
    if (this.afterStep) {
      this.afterClick();
      return;
    }
    if (this.casting) {
      this.castClick();
      return;
    }
    const it = this.intent;
    if (it.kind === "attack" && it.action.type === "attack") {
      const active = activeStack(this.state);
      if (active && walkAfterRange(active) > 0) {
        this.startAfter(it.action);
        return;
      }
    }
    if (it.kind === "move" || it.kind === "attack" || it.kind === "swap")
      this.commitPlayer(it.action);
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
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (this.deploying !== null) {
      // Deployment: Enter starts the battle, Escape puts a stack back.
      if (e.key === "Enter") this.deploying.start();
      else if (e.key === "Escape") {
        if (!this.info.hidden) this.closeInfo();
        else this.deploying.cancelSelection();
        this.updateHover();
      } else if (e.key === "s" || e.key === "S") this.cycleSpeed();
      return;
    }
    if (e.key === "Escape") {
      if (this.aiming) this.cancelAim();
      else if (this.afterStep) this.cancelAfter();
      else if (this.casting) this.cancelCast();
      else if (!this.book.hidden) this.closeBook();
      else this.closeInfo();
    } else if (e.key === "Backspace") {
      e.preventDefault();
      if (this.aiming) this.aimBack();
      else if (this.afterStep) this.cancelAfter();
      else if (this.casting) this.castBack();
    } else if (e.key === "Enter") {
      if (this.aiming) this.aimUse();
      else if (this.afterStep) this.commitPlayer(this.afterStep.attack);
      else if (this.casting) this.castNow();
    } else if (/^[1-9cChH]$/.test(e.key)) {
      const a = actionForKey(this.bar, e.key);
      if (a) this.onBarPress(a);
    } else if (e.key === "b" || e.key === "B") this.toggleBook();
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
    this.commitPlayer({ type, stackId: id });
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
    if (this.deploying !== null) {
      this.deploying.point(at?.hex ?? null);
      this.intent = { kind: "none" };
      this.canvas.style.cursor = this.deploying.cursor();
      this.updateOverlay();
      this.renderPanel();
      this.placeTip();
      return;
    }
    const modal =
      this.casting !== null || this.aiming !== null || this.afterStep !== null;
    this.intent =
      at === null || this.animating || modal
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
    if (this.aiming) this.aimHover(at?.hex ?? null, at?.pointer ?? null);
    if (this.afterStep) this.afterHover(at?.hex ?? null);
    if (this.aiming) {
      const v = this.aiming.hover !== null;
      this.canvas.style.cursor = v ? "crosshair" : "default";
    } else if (this.afterStep) {
      this.canvas.style.cursor = this.afterStep.hover ? "pointer" : "default";
    } else if (it.kind === "swap") this.canvas.style.cursor = "pointer";
    this.updateOverlay();
    this.renderPanel();
    this.placeTip();
  }

  private updateOverlay(): void {
    if (this.deploying !== null) {
      this.scene.overlay = this.deploying.overlay();
      return;
    }
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
    let area: Hex[] = [];
    let labels: { hex: Hex; text: string }[] = [];
    switch (it.kind) {
      case "move":
        for (const h of it.path) marks.set(hexIndex(h), "path");
        marks.set(hexIndex(it.action.to), "move-target");
        break;
      case "swap":
        marks.set(hexIndex(it.partner.hex), "swap");
        if (active) marks.set(hexIndex(active.hex), "swap");
        break;
      case "attack": {
        const target = getStack(this.state, it.action.targetId);
        for (const h of it.path) marks.set(hexIndex(h), "path");
        if (it.action.type === "attack") {
          marks.set(hexIndex(it.action.from), "attack-from");
          // No strike arrow when the attacker never gets to strike.
          if (it.preview.strike !== null)
            strike = { from: it.action.from, target: target.hex };
        } else if (active) {
          area = shotAreaHexes(this.state, active, target.hex) ?? [];
        }
        if (it.action.swapWith !== undefined) {
          const p = getStack(this.state, it.action.swapWith);
          marks.set(hexIndex(p.hex), "swap");
          if (active) marks.set(hexIndex(active.hex), "swap");
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
    if (this.aiming) {
      const r = this.aimMarks(marks);
      area = r.area;
      labels = r.labels;
    }
    if (this.afterStep) strike = this.afterMarks(marks);
    // Swap badges on linked partners whenever the swap is legal.
    const swaps =
      playerTurn && !this.aiming && !this.afterStep && !this.casting
        ? [...this.legal.swaps.keys()].map((id) => getStack(this.state, id).hex)
        : [];
    this.scene.overlay =
      active === null && marks.size === 0
        ? EMPTY_OVERLAY
        : {
            marks,
            active: !this.animating && active ? active.hex : null,
            strike,
            area,
            swaps,
            labels,
          };
  }

  /** The floating damage tooltip above the hovered target. */
  private placeTip(): void {
    const it = this.intent;
    const modeTip = this.modeTip();
    if (modeTip !== null) {
      this.tip.replaceChildren(...modeTip.lines);
      this.tip.classList.remove("bm-below");
      this.tip.hidden = false;
      const c = hexToStage(modeTip.hex);
      const p = this.toWrap({ x: c.x, y: c.y - 62 });
      this.tip.style.left = `${Math.round(p.x)}px`;
      this.tip.style.top = `${Math.round(p.y)}px`;
      return;
    }
    if (it.kind !== "attack") {
      this.placeInfoTip();
      return;
    }
    const s = summarizePreview(this.state, it.preview);
    const target = getStack(this.state, it.action.targetId);
    this.tip.replaceChildren();
    const struck = s.strike;
    if (struck === null) {
      // The attacker dies on the way (fire ground, say): no strike lands.
      this.tip.append(
        el("div", "bm-tip-ret", s.noStrike ?? "The attack never lands"),
      );
    } else {
      const dealt = el("div", "bm-tip-deal");
      dealt.append(
        el("span", "bm-tip-big", `\u2212${struck.damage}`),
        el(
          "span",
          "bm-tip-kills",
          struck.after === 0
            ? ` all ${struck.before} slain`
            : struck.kills === 0
              ? " none slain"
              : ` ${struck.kills} slain`,
        ),
      );
      this.tip.append(dealt);
    }
    if (struck === null) {
      // Nothing to retaliate against.
    } else if (s.retaliation) {
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

  /** The tooltip of an aimed act or a Hit and Run step, at the hovered hex. */
  private modeTip(): { hex: Hex; lines: HTMLElement[] } | null {
    if (this.animating) return null;
    const it = this.intent;
    if (it.kind === "swap") {
      const a = getStack(this.state, it.action.stackId);
      return {
        hex: it.partner.hex,
        lines: [
          el(
            "div",
            "bm-tip-act",
            `⇄ Swap: ${creatureName(a.creature, a.count)} ↔ ${creatureName(it.partner.creature, it.partner.count)}`,
          ),
          el("div", "bm-tip-cond", "In place of the walk; ends the turn"),
        ],
      };
    }
    const a = this.aiming;
    if (a?.hover) {
      const p = a.hover.preview;
      const lines: HTMLElement[] = [];
      if (stepKind(a.mode, a.mode.targets.length) === "condition") {
        lines.push(el("div", "bm-tip-act", "Click, then choose one:"));
        for (const c of choicesAt(a.choices, a.hover.choice.hex)) {
          const t = c.target as ConditionRef;
          const cd = getStack(this.state, t.stack).conditions.find(
            (x) => x.uid === t.condition,
          );
          if (cd)
            lines.push(
              el(
                "div",
                "bm-tip-cond",
                `${conditionKind(cd.kind).name}${cd.clock === null ? "" : `, ${cd.clock} round${cd.clock === 1 ? "" : "s"} left`}`,
              ),
            );
        }
      } else if (p === null) {
        lines.push(el("div", "bm-tip-cond", "Then choose the next target"));
      } else if (!p.legal) {
        lines.push(el("div", "bm-tip-ret", `Cannot: ${p.message ?? ""}`));
      } else if (p.summary.length === 0) {
        const rest = p.lines.slice(1, 4);
        for (const s of rest) lines.push(el("div", "bm-tip-act", s));
        if (rest.length === 0)
          lines.push(el("div", "bm-tip-cond", "No visible change"));
      } else {
        for (const s of p.summary.slice(0, 4))
          lines.push(el("div", "bm-tip-act", s));
      }
      return { hex: a.hover.choice.hex, lines };
    }
    const s = this.afterStep;
    if (s?.hover) {
      const n = s.hover.path.length;
      return {
        hex: s.hover.hex,
        lines: [
          el(
            "div",
            "bm-tip-none",
            `Then step here: ${n} hex${n === 1 ? "" : "es"}`,
          ),
        ],
      };
    }
    return null;
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
    this.refreshBar();
    this.autoBtn.disabled = this.state.winner !== null;
    this.autoBtn.textContent = this.auto ? "Auto: on" : "Auto";
    this.autoBtn.classList.toggle("bm-on", this.auto);
    this.speedBtn.textContent = speedLabel(this.animator.speed);
  }

  // ---------------------------------------------------------- action bar

  /** The Heartened switch belongs to one turn: reset it for a new one. */
  private syncHearten(): void {
    const a = activeStack(this.state);
    const k = a ? `${this.state.round}:${a.id}:${a.extraTurnRound}` : "";
    if (k !== this.heartenFor) {
      this.heartenFor = k;
      this.heartenSpend = true;
    }
  }

  private barContext(): BarContext {
    const playerTurn =
      this.pendingAction !== null && this.isPlayerTurn() && !this.animating;
    const a = activeStack(this.state);
    const notTurnReason =
      this.state.winner !== null
        ? "The battle is over"
        : this.animating
          ? "Wait for the animation"
          : this.auto
            ? "Auto-combat is on"
            : a && !this.playerSides.has(a.side)
              ? "The enemy's turn"
              : "Not your turn yet";
    const side = a?.side ?? "attacker";
    const heroName = this.setup[side]?.hero?.name;
    return {
      playerTurn,
      notTurnReason,
      canUndo: this.takeBackPoint() !== null,
      heartenSpend: this.heartenSpend,
      ...(heroName ? { heroName } : {}),
    };
  }

  private refreshBar(): void {
    // No turn during deployment: the bar keeps its room but shows nothing.
    this.actionBarEl.style.visibility = this.deploying ? "hidden" : "";
    if (this.deploying) return;
    this.syncHearten();
    const ctx = this.barContext();
    const key = JSON.stringify(ctx);
    if (
      this.barFor === null ||
      this.barFor.state !== this.state ||
      this.barFor.ctx !== key
    ) {
      this.bar = actionBar(this.state, ctx);
      this.barFor = { state: this.state, ctx: key };
    }
    const on = new Set<string>();
    if (this.aiming) on.add(this.aiming.bar.key);
    if (this.afterStep) on.add("after");
    if (
      !this.book.hidden ||
      (this.casting && this.casting.entry.source !== "creature")
    )
      on.add("spells");
    if (this.casting?.entry.source === "creature")
      on.add(`page:${this.casting.entry.id}`);
    // Rebuild the buttons only when something on them changed.
    const look = JSON.stringify([this.bar, [...on]]);
    if (look === this.barLook) return;
    this.barLook = look;
    renderActionBar(this.actionBarEl, this.bar, on, {
      onPress: (a) => this.onBarPress(a),
      onHover: (a, anchor) => {
        this.barHover = a && anchor ? { key: a.key, anchor } : null;
        this.placeBarTip();
      },
    });
    // The buttons were rebuilt: re-anchor an open tooltip.
    if (this.barHover) {
      const wrap = this.actionBarEl.querySelector(
        `[data-key="${CSS.escape(this.barHover.key)}"]`,
      )?.parentElement;
      this.barHover = wrap ? { key: this.barHover.key, anchor: wrap } : null;
    }
    this.placeBarTip();
  }

  private placeBarTip(): void {
    const h = this.barHover;
    const a = h ? this.bar.find((x) => x.key === h.key) : undefined;
    if (!h || !a) {
      this.actTip.hidden = true;
      return;
    }
    showActionTip(this.actTip, a, h.anchor, this.root);
  }

  private onBarPress(a: BarAction): void {
    if (a.state !== "ready") return;
    if (!this.pendingAction || this.animating || !this.isPlayerTurn()) return;
    switch (a.key) {
      case "spells":
        this.cancelAim();
        this.cancelAfter();
        this.toggleBook();
        return;
      case "wait":
      case "defend":
        this.playerSimple(a.key);
        return;
      case "undo":
        this.takeBack();
        return;
      case "hearten":
        this.heartenSpend = !this.heartenSpend;
        this.refreshButtons();
        return;
    }
    if (a.page !== undefined) {
      const entry = creatureBook(this.state).find((e) => e.id === a.page);
      if (!entry || entry.status !== "ready") return;
      this.cancelAim();
      this.cancelAfter();
      this.closeBook();
      if (this.casting?.entry.id === entry.id) {
        this.cancelCast();
        return;
      }
      this.startCast(entry);
      return;
    }
    if (a.mode) {
      if (this.aiming?.bar.key === a.key) {
        this.cancelAim();
        return;
      }
      this.startAim(a, a.mode.kind, a.mode.id);
    }
  }

  // ------------------------------------------------------------ aiming

  private startAim(bar: BarAction, kind: ModeKind, id: string): void {
    this.closeBook();
    this.casting = null;
    this.afterStep = null;
    const mode = startMode(this.state, kind, id);
    this.aiming = {
      bar,
      mode,
      choices: choices(this.state, mode),
      from: null,
      hover: null,
    };
    this.castBox.hidden = false;
    this.updateHover();
    this.refreshAim();
  }

  private cancelAim(): void {
    if (!this.aiming) return;
    this.aiming = null;
    this.castBox.hidden = true;
    this.updateHover();
    this.refreshButtons();
  }

  private aimSet(mode: ActMode): void {
    const a = this.aiming;
    if (!a) return;
    a.mode = mode;
    a.choices = choices(this.state, mode);
    a.hover = null;
    this.updateHover();
    this.refreshAim();
  }

  private aimBack(): void {
    const a = this.aiming;
    if (!a) return;
    const m = backStep(a.mode);
    if (m === null) this.cancelAim();
    else this.aimSet(m);
  }

  private aimHover(
    h: Hex | null,
    pointer: { x: number; y: number } | null,
  ): void {
    const a = this.aiming;
    if (!a) return;
    const choice = h === null ? undefined : choicesAt(a.choices, h)[0];
    if (!choice) {
      if (a.hover !== null) {
        a.hover = null;
        this.refreshAim();
      }
      return;
    }
    const targets = [...a.mode.targets, choice.target];
    const kind = stepKind(a.mode, a.mode.targets.length);
    const complete =
      kind !== "condition" && isComplete(this.state, a.mode, targets);
    const from = complete ? pickFrom(choice.froms, pointer) : null;
    const key = JSON.stringify([choice.target, from]);
    if (a.hover?.key === key) return;
    const preview = complete
      ? castPreview(this.state, modeAction(this.state, a.mode, targets, from))
      : null;
    a.hover = { key, choice, from, preview };
    this.refreshAim();
  }

  private aimClick(): void {
    const a = this.aiming;
    if (!a?.hover) return;
    const { choice, from } = a.hover;
    if (stepKind(a.mode, a.mode.targets.length) === "condition") {
      if ("stack" in choice.target)
        this.aimSet(pickStack(a.mode, choice.target.stack));
      return;
    }
    this.aimAdd(choice.target, from);
  }

  private aimAdd(t: ActTarget, from: Hex | null): void {
    const a = this.aiming;
    if (!a) return;
    const mode = addTarget(a.mode, t);
    if (isComplete(this.state, mode)) a.from = from;
    if (isFull(this.state, mode)) {
      const action = modeAction(this.state, mode, mode.targets, a.from);
      if (castPreview(this.state, action).legal) {
        this.commitPlayer(action);
        return;
      }
    }
    this.aimSet(mode);
  }

  private aimUse(): void {
    const a = this.aiming;
    if (!a || !this.pendingAction || this.animating) return;
    if (!isComplete(this.state, a.mode)) return;
    const action = modeAction(this.state, a.mode, a.mode.targets, a.from);
    if (!castPreview(this.state, action).legal) return;
    this.commitPlayer(action);
  }

  private aimMarks(marks: Map<number, HexMark>): {
    area: Hex[];
    labels: { hex: Hex; text: string }[];
  } {
    const a = this.aiming;
    if (!a) return { area: [], labels: [] };
    const s = this.state;
    const me = getStack(s, a.mode.actorId);
    marks.clear();
    // When nearly every hex is valid (a shot at any hex), shading them all
    // is noise: only the hovered hex and its area are drawn.
    if (a.choices.length < BATTLE_HEX_COUNT * 0.6)
      for (const c of a.choices) marks.set(hexIndex(c.hex), "act-valid");
    const labels: { hex: Hex; text: string }[] = [];
    a.mode.targets.forEach((t, i) => {
      const h =
        "hex" in t ? t.hex : "stack" in t ? getStack(s, t.stack).hex : null;
      if (h === null) return;
      marks.set(hexIndex(h), "chosen");
      labels.push({ hex: h, text: String(i + 1) });
    });
    if (a.mode.pickFor !== null)
      marks.set(hexIndex(getStack(s, a.mode.pickFor).hex), "chosen");
    let targets: readonly ActTarget[] = a.mode.targets;
    const hv = a.hover;
    if (hv) {
      marks.set(hexIndex(hv.choice.hex), "act-hover");
      targets = [...targets, hv.choice.target];
      if (hv.from && !sameHex(hv.from, me.hex)) {
        for (const p of findPath(s, me.id, hv.from) ?? [])
          marks.set(hexIndex(p), "path");
        marks.set(hexIndex(hv.from), "attack-from");
      }
    }
    return { area: areaHexes(s, a.mode, targets), labels };
  }

  private refreshAim(): void {
    const a = this.aiming;
    if (!a) return;
    const s = this.state;
    const mode = a.mode;
    const n = mode.targets.length;
    const kind = stepKind(mode, n);
    const complete = isComplete(s, mode);
    const name = (id: StackId): string => {
      const st = getStack(s, id);
      return creatureName(st.creature, Math.max(1, st.count));
    };
    const chosen = mode.targets.map((t, i) => {
      const what =
        "condition" in t
          ? `${conditionKind(getStack(s, t.stack).conditions.find((c) => c.uid === t.condition)?.kind ?? "").name} on ${name(t.stack)}`
          : "stack" in t
            ? name(t.stack)
            : "hex" in t
              ? `hex ${t.hex.col},${t.hex.row}`
              : t.choice;
      return `${i + 1} ${what}`;
    });
    let conditions: ConditionOption[] | null = null;
    if (kind === "condition" && mode.pickFor !== null) {
      conditions = a.choices
        .filter((c) => "condition" in c.target)
        .map((c) => {
          const t = c.target as ConditionRef;
          const cd = getStack(s, t.stack).conditions.find(
            (x) => x.uid === t.condition,
          );
          const pv = castPreview(
            s,
            modeAction(s, mode, [...mode.targets, t], null),
          );
          return {
            ref: t,
            label: cd
              ? `${conditionKind(cd.kind).name}${cd.size ? ` ${cd.size}` : ""}${cd.clock === null ? "" : ` (${cd.clock})`}`
              : "?",
            effect: !pv.legal
              ? `Cannot: ${pv.message ?? ""}`
              : (pv.summary.length > 0 ? pv.summary : pv.lines).join("; "),
          };
        });
    }
    const def = modeAct(mode);
    const preview = complete
      ? castPreview(s, modeAction(s, mode, mode.targets, a.from))
      : null;
    const who = creatureName(
      getStack(s, mode.actorId).creature,
      getStack(s, mode.actorId).count,
    );
    const kindLine =
      mode.kind === "command"
        ? "· the hero's Command"
        : mode.kind === "item"
          ? "· item act"
          : mode.kind === "shootHex"
            ? `· ${who}' shot`
            : `· ${who}' ability${abilityDef(mode.id).everyTurn ? ", every turn" : ", once per battle"}`;
    const usePreview = a.hover?.preview ?? preview;
    renderActPanel(
      this.castBox,
      {
        icon: a.bar.icon,
        name: modeName(mode),
        kind: kindLine,
        rule: def?.text ?? a.bar.rule,
        prompt: modePrompt(s, mode),
        conditions,
        preview: usePreview,
        hovered: (a.hover?.preview ?? null) !== null,
        chosen,
        // An act with no targets (Tinderbox) is used from the panel.
        canUse:
          complete &&
          (preview?.legal ?? false) &&
          (!isFull(s, mode) || mode.targets.length === 0),
        useLabel: "Use ⏎",
        canBack: true,
      },
      {
        onCondition: (o) => this.aimAdd(o.ref, null),
        onUse: () => this.aimUse(),
        onBack: () => this.aimBack(),
        onCancel: () => this.cancelAim(),
      },
    );
    this.updateOverlay();
    this.refreshButtons();
  }

  // ------------------------------------------------------- Hit and Run

  private startAfter(attack: AttackAction): void {
    const list = afterChoices(this.state, attack);
    if (list.length === 0) {
      this.commitPlayer(attack);
      return;
    }
    this.afterStep = {
      attack,
      choices: list,
      hover: null,
      preview: castPreview(this.state, attack),
    };
    this.castBox.hidden = false;
    this.updateHover();
    this.refreshAfter();
  }

  private cancelAfter(): void {
    if (!this.afterStep) return;
    this.afterStep = null;
    this.castBox.hidden = true;
    this.updateHover();
    this.refreshButtons();
  }

  private afterHover(h: Hex | null): void {
    const s = this.afterStep;
    if (!s) return;
    const c = h === null ? undefined : s.choices.find((x) => sameHex(x.hex, h));
    const next = c ?? null;
    if (next === s.hover) return;
    s.hover = next;
    s.preview = castPreview(
      this.state,
      withAfter(s.attack, next === null ? null : next.hex),
    );
    this.refreshAfter();
  }

  private afterClick(): void {
    const s = this.afterStep;
    if (!s?.hover) return;
    this.commitPlayer(withAfter(s.attack, s.hover.hex));
  }

  private afterMarks(marks: Map<number, HexMark>): {
    from: Hex;
    target: Hex;
  } | null {
    const s = this.afterStep;
    if (!s || s.attack.type !== "attack") return null;
    marks.clear();
    for (const c of s.choices) marks.set(hexIndex(c.hex), "after");
    const me = getStack(this.state, s.attack.stackId);
    for (const p of findPath(this.state, me.id, s.attack.from) ?? [])
      marks.set(hexIndex(p), "path");
    marks.set(hexIndex(s.attack.from), "attack-from");
    const target = getStack(this.state, s.attack.targetId);
    marks.set(hexIndex(target.hex), "target");
    if (s.hover) {
      for (const p of s.hover.path) marks.set(hexIndex(p), "path");
      marks.set(hexIndex(s.hover.hex), "move-target");
    }
    return { from: s.attack.from, target: target.hex };
  }

  private refreshAfter(): void {
    const s = this.afterStep;
    if (!s) return;
    const me = getStack(this.state, s.attack.stackId);
    const id = me.creature.abilities.find(
      (x) => (abilityDef(x).walkAfterAttack ?? 0) > 0,
    );
    const def = id ? abilityDef(id) : null;
    const icon: ActionIcon = { glyph: "↺" };
    renderActPanel(
      this.castBox,
      {
        icon,
        name: def?.name ?? "Hit and Run",
        kind: `· ${creatureName(me.creature, me.count)}, after the attack`,
        rule: def?.description ?? "",
        prompt: `Attack, then step to: click a green hex (up to ${walkAfterRange(me)} hexes from where they strike), or Stay (Enter).`,
        conditions: null,
        preview: s.preview,
        hovered: s.hover !== null,
        chosen: [],
        canUse: true,
        useLabel: "Stay ⏎",
        canBack: true,
      },
      {
        onCondition: () => {},
        onUse: () => this.commitPlayer(s.attack),
        onBack: () => this.cancelAfter(),
        onCancel: () => this.cancelAfter(),
      },
    );
    this.updateOverlay();
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
    // The timeline slides: chips keep their place by stack id (FLIP).
    const flip = flipChildren(
      this.top.querySelector<HTMLElement>(".bm-order"),
      !this.animator.reduced && this.animator.speed !== Infinity,
    );
    this.top.replaceChildren();
    const limit = roundLimitInfo(
      { ...s, round: this.scene.round || s.round },
      this.playerSides.size === 1 ? this.playerSide() : null,
    );
    const round = el(
      "span",
      "bm-round",
      this.deploying ? "Deployment" : limit.label,
    );
    round.title = this.deploying
      ? "Before round 1: rearrange your stacks (Vanguard)."
      : limit.tooltip;
    const verdict = el(
      "span",
      `bm-limit${limit.roundsLeft <= 3 ? " bm-limit-near" : ""}${
        limit.winner === this.playerSide() ? " bm-limit-ours" : ""
      }`,
      `${limit.left} \u00b7 ${limit.verdict}`,
    );
    verdict.title = limit.tooltip;
    this.top.append(round, verdict);
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
      c.dataset["flip"] = `${id}${cls === "bm-later" ? ":next" : ""}`;
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
    flip(strip);
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
    if (this.deploying !== null) {
      p.append(this.deploying.panel());
      return;
    }
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
      if (it.action.swapWith !== undefined) {
        const partner = getStack(this.state, it.action.swapWith);
        head.append(
          el(
            "span",
            "bm-swap-note",
            `  ⇄ after swapping places with the ${creatureName(partner.creature, partner.count)}`,
          ),
        );
      } else if (s.hexesMoved > 0) {
        head.append(
          el(
            "span",
            "bm-dim",
            `  after moving ${s.hexesMoved} hex${s.hexesMoved === 1 ? "" : "es"}`,
          ),
        );
      }
      const active = activeStack(this.state);
      // No step after an attack that never strikes (the attacker dies first).
      if (
        active &&
        it.action.type === "attack" &&
        it.preview.strike !== null &&
        walkAfterRange(active) > 0
      ) {
        head.append(
          el(
            "span",
            "bm-swap-note",
            `  ↺ click, then choose where to step (up to ${walkAfterRange(active)} hexes)`,
          ),
        );
      }
      p.append(head);
      const chain = attackChainLines(this.state, it.preview);
      const struck = s.strike;
      if (struck === null) {
        // A legal attack that never strikes (the attacker dies on the way).
        p.append(
          el(
            "div",
            "bm-pv-ret",
            s.noStrike ?? `The ${s.verb.toLowerCase()} never lands`,
          ),
        );
        if (s.statuses.length > 0)
          p.append(el("div", "bm-pv-why", s.statuses.join("  ·  ")));
        if (chain.length > 0)
          p.append(el("div", "bm-pv-chain", chain.join(" → ")));
        return;
      }
      const deal = el("div", "bm-pv-deal");
      deal.append(
        el("span", "bm-pv-label", "Deal "),
        el("b", "", strikeHeadline(struck)),
        el("span", "bm-dim", `   ${stackChange(struck)}`),
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
      const why = [struck.attackLine, ...struck.bonuses, ...s.statuses];
      p.append(el("div", "bm-pv-why", why.join("  ·  ")));
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
    if (this.aiming) {
      const m = this.aiming.mode;
      p.append(
        el("div", "bm-pv-head", `${modeName(m)}: aiming`),
        el("div", "bm-dim", modePrompt(this.state, m)),
        el(
          "div",
          "bm-dim",
          "Teal hexes are valid targets; point at one for its exact effect. Backspace goes back, Esc cancels.",
        ),
      );
      return;
    }
    if (this.afterStep) {
      p.append(
        el("div", "bm-pv-head", "Hit and Run: attack, then step to"),
        el(
          "div",
          "bm-dim",
          "Click a green hex to step there after the attack and its retaliation, or Enter to stay. Esc cancels the attack.",
        ),
      );
      return;
    }
    if (it.kind === "swap") {
      const pn = creatureName(it.partner.creature, it.partner.count);
      p.append(
        el("div", "bm-pv-head", `⇄ Swap places: ${name} and ${pn}`),
        el(
          "div",
          "bm-pv-deal bm-swap-line",
          "In place of the walk (Sworn): the two stacks trade hexes. Ends the turn.",
        ),
      );
      for (const c of it.partner.conditions)
        p.append(el("div", "bm-pv-cond", conditionTooltip(this.state, c)));
      return;
    }
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
          this.legal.swaps.size > 0
            ? "Point at an enemy for the exact damage. Click a shaded hex to move, or a ⇄ partner to swap places. Right-click any stack for details."
            : "Point at an enemy for the exact damage, kills and retaliation. Click a shaded hex to move. Right-click any stack for details; keys 1–9 use the bar.",
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
    this.cancelAim();
    this.cancelAfter();
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
        // Item acts are used from the action bar (one flow), not the book.
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
    this.aiming = null;
    this.afterStep = null;
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

  /** Back one step of a cast: a condition stack, else the last target. */
  private castBack(): void {
    const c = this.casting;
    if (!c) return;
    if (c.pickFor !== null) c.pickFor = null;
    else c.targets.pop();
    c.echo = null;
    c.fuel = null;
    this.refreshCast();
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
    this.commitPlayer(action);
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
        onBack: () => this.castBack(),
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
    const section = (title: string): void => {
      box.append(el("div", "bm-info-section", title));
    };
    const TAG = {
      ability: null,
      drill: "Drill",
      birthright: "Birthright",
      other: "Granted",
    } as const;
    if (info.abilities.length > 0) section("Abilities");
    for (const a of info.abilities) {
      const ab = el("div", "bm-info-ability");
      const head = el("div", "bm-info-ab-head");
      head.append(el("b", "", a.name));
      const tag = TAG[a.source];
      if (tag) head.append(el("span", `bm-tag bm-tag-${a.source}`, tag));
      if (a.activated)
        head.append(el("span", "bm-tag bm-tag-act", a.activated));
      ab.append(head, el("div", "bm-info-ab-text", a.text));
      box.append(ab);
    }
    if (
      info.birthright &&
      !info.abilities.some((a) => a.source === "birthright")
    ) {
      const ab = el("div", "bm-info-ability");
      const head = el("div", "bm-info-ab-head");
      head.append(
        el("b", "", info.birthright.name),
        el("span", "bm-tag bm-tag-birthright", "Birthright"),
      );
      ab.append(head, el("div", "bm-info-ab-text", info.birthright.text));
      box.append(ab);
    }
    if (info.drills.length > 0)
      box.append(
        el("div", "bm-dim", `Drilled at the ${info.drills.join(", the ")}.`),
      );
    if (info.pages.length > 0) {
      section(`Pages (Power ${info.castPower ?? 0}, once each per battle)`);
      for (const pg of info.pages) {
        const row = el("div", `bm-info-page${pg.spent ? " bm-spent" : ""}`);
        row.append(
          iconElement("spell", pg.id, { className: "bm-info-page-icon" }),
          el("b", "", pg.name),
          el("span", "", ` ${pg.text}`),
        );
        if (pg.spent) row.append(el("span", "bm-tag", "spent"));
        box.append(row);
      }
    }
    if (info.statuses.length > 0) section("Conditions and state");
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
          ? `The round limit (${roundLimitOf(this.state)} rounds) was reached: ${
              won ? "you" : "the enemy"
            } had more fight value left (${fightValueLeft(this.state, engine.winner ?? "defender")} to ${fightValueLeft(this.state, engine.winner === "attacker" ? "defender" : "attacker")}), and the other side's survivors fled.`
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
