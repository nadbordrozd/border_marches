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
import { MARKER_ICONS } from "../../assets/icons.ts";
import { assetUrl } from "../../assets/manifest.ts";
import type {
  BattleResult as GameBattleResult,
  BattleSetup as GameBattleSetup,
} from "../../core/game/battle.ts";
import { battleCue, victoryCue } from "../../audio/cues.ts";
import { playSound } from "../../audio/sound.ts";
import {
  battleGround,
  heroPortraitUrl,
  loadBattleArt,
} from "../../render/battle/assets.ts";
import type { BattleArt } from "../../render/battle/assets.ts";
import {
  hexToStage,
  stageToView,
  stageView,
  viewToStage,
} from "../../render/battle/geometry.ts";
import type { Point, StageView } from "../../render/battle/geometry.ts";
import { paintBackground, renderBattle } from "../../render/battle/renderer.ts";
import {
  EMPTY_OVERLAY,
  createScene,
  pruneEffects,
  syncScene,
} from "../../render/battle/scene.ts";
import type {
  HexLabel,
  HexMark,
  Overlay,
  Scene,
  TargetFocus,
} from "../../render/battle/scene.ts";
import { Animator, nextSpeed, speedLabel } from "./animate.ts";
import { onMotionChange, reducedMotion } from "../motion.ts";
import { flipChildren } from "../anim.ts";
import type { Speed } from "./animate.ts";
import { badgeAt, intentMarkers } from "./grammar.ts";
import { conditionCard } from "./condition-card.ts";
import { roundLimitInfo, stackInfo } from "./info.ts";
import { QUEUE_MAX, queueCount, queueSlots, turnQueue } from "./queue.ts";
import type { QueueEntry } from "./queue.ts";
import { setTip, tipCard } from "../tooltip.ts";
import { hoverIntent, indexLegalActions, pointAtField } from "./intent.ts";
import type { HoverIntent, LegalIndex } from "./intent.ts";
import { conjugate, creatureName, summarizePreview } from "./preview.ts";
import { battleLosses, NO_LOSSES } from "./losses.ts";
import { getCreature } from "../../data/creatures.ts";
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
import {
  isAdventureSpell,
  isBattleSpell,
  registerSpells,
  spellDef,
  spellInfo,
} from "../../core/magic/index.ts";
import {
  ANYWHERE,
  castChoices,
  castChoicesAt,
  choiceStacks,
  effectiveChoices,
  withTargetStatus,
} from "./spell-targets.ts";
import type { CastChoice } from "./spell-targets.ts";
import {
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
import { BATTLE_KEYS, statusLine } from "./status.ts";
import type { ActHover, ActStatus, StatusLine, StatusMode } from "./status.ts";
import { noTargetReason as spellNoTarget } from "./spell-targets.ts";
import { iconElement } from "../icons.ts";
import { rulesText } from "../keywords.ts";
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
  /** The valid target under the pointer; the rehearsal when it is the last. */
  hover: { target: ActTarget; preview: CastPreview | null } | null;
  /** Every valid target of the next step (spell-targets.ts). */
  choices: CastChoice[];
  /** The targets the choices were computed for. */
  choicesFor: string;
  /** Why the last click was refused (a target that would change nothing). */
  notice: string | null;
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

/** How long a clicked queue portrait's stack blinks on the field. */
const QUEUE_FLASH_MS = 1300;

/** A small hourglass (the round chip, scheduled events). */
function hourglass(): HTMLElement {
  const span = el("span", "bm-hourglass");
  span.setAttribute("aria-hidden", "true");
  span.innerHTML =
    '<svg viewBox="0 0 10 14" width="10" height="14">' +
    '<path d="M1 1.5h8M1 12.5h8M2 1.5c0 4 3 4.5 3 5.5s-3 1.5-3 5.5' +
    'M8 1.5c0 4-3 4.5-3 5.5s3 1.5 3 5.5" stroke="currentColor" ' +
    'stroke-width="1.4" fill="none"/>' +
    '<path d="M3 11.6h4L5 9.2z" fill="currentColor"/></svg>';
  return span;
}

class BattleScreen {
  private readonly root = el("div", "bm-battle");
  private readonly top = el("div", "bm-top");
  private readonly stageWrap = el("div", "bm-stage-wrap");
  private readonly canvas = el("canvas", "bm-canvas");
  private readonly tip = el("div", "bm-tip");
  /** The status line (UI2-05): what a click does now, and the last event. */
  private readonly status = el("div", "bm-status");
  private readonly statusText = el("span", "bm-status-text");
  private readonly statusLog = el("span", "bm-status-log");
  private statusLook = "";
  /** Auto, Speed and the Keys help: a small cluster at the bar's right. */
  private readonly sys = el("div", "bm-sys");
  private readonly autoBtn = el("button", "bm-sys-btn", "Auto");
  private readonly speedBtn = el("button", "bm-sys-btn", "");
  private readonly helpBtn = el("button", "bm-sys-btn bm-sys-help", "?");
  private readonly help = el("div", "bm-help");
  /** The bar row: hero portraits at its ends, the actions, the cluster. */
  private readonly barRow = el("div", "bm-actionbar");
  private readonly actionBarEl = el("div", "bm-actbar-main");
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
  /** Where the stage sits on the canvas, which fills the stage wrapper. */
  private view: StageView = { zoom: 1, x: 0, y: 0 };
  /** The ground pattern for the canvas beyond the stage. */
  private ground: {
    ctx: CanvasRenderingContext2D;
    fill: CanvasPattern;
  } | null = null;
  private frame = 0;
  private legal: LegalIndex = indexLegalActions([]);
  private pointer: Point | null = null;
  private intent: HoverIntent = { kind: "none" };
  private auto: boolean;
  private animating = false;
  private pendingAction: ((a: BattleAction | "undo") => void) | null = null;
  private infoFor: StackId | null = null;
  /** The stack whose queue portrait is under the pointer (UI2-03). */
  private queueHover: StackId | null = null;
  /** A queue portrait was clicked: that stack blinks from `t0`. */
  private beacon: { id: StackId; t0: number } | null = null;
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
          // A little pitch spread keeps a run of blows from sounding canned.
          if (cue !== null) playSound(cue, { jitter: 0.06 });
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
    this.sys.append(this.helpBtn, this.autoBtn, this.speedBtn);
    this.barRow.append(this.actionBarEl, this.sys);
    this.renderHeroes();
    this.status.append(this.statusText, this.statusLog);
    this.status.setAttribute("role", "status");
    this.info.hidden = true;
    this.book.hidden = true;
    this.castBox.hidden = true;
    this.actTip.hidden = true;
    this.help.hidden = true;
    this.stageWrap.append(this.book, this.castBox, this.help);
    root.append(
      this.top,
      this.stageWrap,
      this.barRow,
      this.status,
      this.info,
      this.actTip,
    );
    this.container.append(root);

    this.autoBtn.title = "Auto-combat: the AI plays your side (A)";
    this.speedBtn.title = "Animation speed (S); Space skips an animation";
    this.helpBtn.title = "Keys and how to play a battle (?)";
    this.helpBtn.setAttribute("aria-label", "Keys and controls (?)");

    this.on(this.autoBtn, "click", () => this.toggleAuto());
    this.on(this.speedBtn, "click", () => this.cycleSpeed());
    this.on(this.helpBtn, "click", () => this.toggleHelp());
    this.on(this.help, "click", () => this.toggleHelp(false));
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

  /**
   * The canvas fills the stage wrapper; the stage is zoomed in quarter steps
   * to fit the field (bead UI2-02) and the ground runs on to the edges.
   */
  private layout(): void {
    const w = this.stageWrap.clientWidth;
    const h = this.stageWrap.clientHeight;
    if (w === 0 || h === 0) return;
    const dpr = window.devicePixelRatio || 1;
    this.view = stageView(w, h, dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    // For the debug routes' pointer helper (debug.ts).
    this.canvas.dataset.zoom = String(this.view.zoom);
    this.canvas.dataset.x = String(this.view.x);
    this.canvas.dataset.y = String(this.view.y);
    this.placeTip();
    // The queue shows as many portraits as the new width holds.
    this.renderTop(false);
  }

  /** CSS pixel position of a stage point, relative to the stage wrapper. */
  private toWrap(p: Point): Point {
    const rect = this.canvas.getBoundingClientRect();
    const wrap = this.stageWrap.getBoundingClientRect();
    const v = stageToView(p, this.view);
    return { x: rect.left - wrap.left + v.x, y: rect.top - wrap.top + v.y };
  }

  private toStage(e: MouseEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return viewToStage(
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      this.view,
    );
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
    if (this.options.showResult !== false)
      await this.showResult(engine, result);
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
    const { zoom, x, y } = this.view;
    const k = zoom * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(k, 0, 0, k, x * dpr, y * dpr);
    // The ground beyond the stage, in step with the stage's own pattern.
    if (this.ground?.ctx !== ctx) {
      const fill = ctx.createPattern(this.art.ground, "repeat");
      this.ground = fill ? { ctx, fill } : null;
    }
    if (this.ground) {
      ctx.fillStyle = this.ground.fill;
      ctx.fillRect(
        -x / zoom,
        -y / zoom,
        this.canvas.width / k,
        this.canvas.height / k,
      );
    }
    const overlay = this.scene.overlay;
    const queued = this.queueOverlay();
    if (queued) this.scene.overlay = queued;
    renderBattle(ctx, {
      scene: this.scene,
      art: this.art,
      background: this.background,
      obstacles: blockingHexes(this.state),
      activeId: this.animating ? null : this.state.activeStackId,
      hoverId: this.animating ? null : this.hoveredStackId(),
    });
    this.scene.overlay = overlay;
    this.drawBeacon(ctx);
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
    // The docked book leaves the field visible (bead bzc.63): a click on
    // the field closes it rather than moving or attacking behind it.
    if (!this.book.hidden) {
      this.closeBook();
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
    // Right-click leaves targeting (as Esc does).
    if (this.casting) {
      this.cancelCast();
      return;
    }
    if (this.aiming) {
      this.cancelAim();
      return;
    }
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
    if (e.key === "?") {
      this.toggleHelp();
      return;
    }
    if (!this.help.hidden && e.key === "Escape") {
      this.toggleHelp(false);
      return;
    }
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
    if (this.casting) {
      // Targeting: a crosshair on what may be chosen, "no" elsewhere.
      const h = at?.hex ?? null;
      const waiting = nextStep(this.casting.entry.id, this.casting.targets);
      this.canvas.style.cursor =
        waiting === null || waiting === "choice" || h === null
          ? "default"
          : this.castValidAt(h)
            ? "crosshair"
            : "not-allowed";
    } else if (this.aiming) {
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
    let focus: TargetFocus | null = null;
    if (this.casting) {
      const r = this.castMarks(marks);
      area = r.area;
      labels = r.labels;
      focus = r.focus;
    }
    if (this.aiming) {
      const r = this.aimMarks(marks);
      area = r.area;
      labels = r.labels;
      focus = r.focus;
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
            ...(focus && !this.animating ? { focus } : {}),
          };
  }

  /** The floating damage tooltip above the hovered target. */
  private placeTip(): void {
    const it = this.intent;
    this.tip.classList.remove("bm-tip-kw");
    const modeTip = this.modeTip();
    if (modeTip !== null) {
      this.tip.replaceChildren(...modeTip.lines);
      this.tip.hidden = false;
      // Above the head; below the feet when the top bar would clip it (a
      // stack in row 0, bzc.53).
      const c = hexToStage(modeTip.hex);
      const above = this.toWrap({ x: c.x, y: c.y - 62 });
      const below = this.toWrap({ x: c.x, y: c.y + 40 });
      const flip = above.y - this.tip.offsetHeight < 2;
      this.tip.classList.toggle("bm-below", flip);
      const p = flip ? below : above;
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
    // The why, small (UI2-05: the bottom panel that carried it is now the
    // status line, which names the conditions the attack leaves).
    if (struck !== null)
      this.tip.append(
        el(
          "div",
          "bm-tip-why",
          [struck.attackLine, ...struck.bonuses].join(" · "),
        ),
      );
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
    const cast = this.castTip();
    if (cast !== null) return cast;
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

  /** The tooltip of a cast's valid target under the pointer: the rehearsal. */
  private castTip(): { hex: Hex; lines: HTMLElement[] } | null {
    const c = this.casting;
    if (!c) return null;
    const at = this.pointer ? pointAtField(this.state, this.pointer).hex : null;
    const none = this.noEffectAt(at);
    if (at !== null && none !== null)
      return {
        hex: at,
        // "No effect", then the refusal and its numbers on their own lines.
        lines: [
          el("div", "bm-tip-ret", "No effect: the click does nothing"),
          ...none
            .replace(/ \(/, "\n(")
            .split("\n")
            .map((t) => el("div", "bm-tip-cond", t)),
        ],
      };
    if (at === null || !this.castValidAt(at)) return null;
    const step = nextStep(c.entry.id, c.targets);
    const lines: HTMLElement[] = [];
    if (step === "condition") {
      lines.push(el("div", "bm-tip-act", "Click, then choose one:"));
      for (const x of effectiveChoices(castChoicesAt(c.choices, at))) {
        const t = x.target as ConditionRef;
        const cd = getStack(this.state, t.stack).conditions.find(
          (y) => y.uid === t.condition,
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
      return { hex: at, lines };
    }
    const p = c.hover?.preview ?? null;
    if (p === null) {
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
    return { hex: at, lines };
  }

  /**
   * The stack under the pointer: one whose condition badges are pointed at,
   * else the one standing on the pointed hex (UI2-04: its links show).
   */
  private hoveredStackId(): StackId | null {
    if (this.pointer === null) return null;
    const badge = badgeAt(this.scene.units.values(), this.pointer);
    if (badge !== null) return badge;
    const h = pointAtField(this.state, this.pointer).hex;
    if (h === null) return null;
    return (
      this.state.stacks.find((s) => isAlive(s) && sameHex(s.hex, h))?.id ?? null
    );
  }

  /**
   * Hover card: a stack's conditions with their icons and keyword boxes
   * (pointing at its body or its badges), or the ground under the pointer.
   */
  private placeInfoTip(): void {
    this.tip.hidden = true;
    this.tip.classList.remove("bm-tip-kw");
    if (this.pointer === null || this.animating) return;
    const badge = badgeAt(this.scene.units.values(), this.pointer);
    const h =
      badge !== null
        ? getStack(this.state, badge).hex
        : pointAtField(this.state, this.pointer).hex;
    if (h === null) return;
    const stack =
      this.state.stacks.find((s) => isAlive(s) && sameHex(s.hex, h)) ?? null;
    const g =
      badge !== null
        ? null
        : (this.state.ground.find((x) => sameHex(x.hex, h)) ?? null);
    const card = conditionCard(this.state, stack, g, h);
    if (card === null) return;
    this.tip.replaceChildren(card);
    this.tip.classList.add("bm-tip-kw");
    this.tip.hidden = false;
    // Beside the stack (right, else left), level with its body and kept
    // inside the stage, so the stack and its badges stay in view.
    this.tip.classList.remove("bm-below");
    const c = hexToStage(h);
    const w = this.tip.offsetWidth;
    const tall = this.tip.offsetHeight;
    const right = this.toWrap({ x: c.x + 34, y: c.y - 16 });
    const left = this.toWrap({ x: c.x - 34, y: c.y - 16 });
    const roomW = this.stageWrap.clientWidth;
    const roomH = this.stageWrap.clientHeight;
    const x = right.x + w <= roomW - 4 || left.x - w < 4 ? right.x : left.x - w;
    const y = Math.min(Math.max(4, right.y - tall / 2), roomH - tall - 4);
    this.tip.style.left = `${Math.round(Math.max(4, x))}px`;
    this.tip.style.top = `${Math.round(Math.max(4, y))}px`;
  }

  // ----------------------------------------------------------------- HUD

  private refreshHud(): void {
    this.renderTop();
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
    // No turn during deployment: the bar holds the phase's buttons.
    if (this.deploying) {
      if (this.barLook !== "deploy") {
        this.barLook = "deploy";
        this.actionBarEl.replaceChildren(this.deploying.buttons());
      }
      return;
    }
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
    focus: TargetFocus | null;
  } {
    const a = this.aiming;
    if (!a) return { area: [], labels: [], focus: null };
    const s = this.state;
    const me = getStack(s, a.mode.actorId);
    marks.clear();
    // When nearly every hex is valid (a shot at any hex), shading them all
    // is noise: only the hovered hex and its area are drawn.
    if (a.choices.length < ANYWHERE)
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
    // Valid targets lit and ringed, the rest dimmed, as for a cast.
    const kind = stepKind(a.mode, a.mode.targets.length);
    const many = a.choices.length >= ANYWHERE;
    const hexes = new Set<number>(marks.keys());
    for (const c of a.choices) hexes.add(hexIndex(c.hex));
    const ringed = new Set<StackId>();
    if (kind === "stack" || kind === "condition")
      for (const c of a.choices)
        if ("stack" in c.target) ringed.add(c.target.stack);
    const stacks = new Set<StackId>([me.id, ...ringed]);
    for (const st of s.stacks)
      if (isAlive(st) && hexes.has(hexIndex(st.hex))) stacks.add(st.id);
    const focus: TargetFocus | null =
      a.choices.length === 0 && a.mode.targets.length === 0
        ? null
        : { hexes, stacks, ringed, dim: a.choices.length > 0 && !many };
    return { area: areaHexes(s, a.mode, targets), labels, focus };
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
    this.renderPanel();
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
    this.renderPanel();
  }

  /**
   * The portraits of the heroes leading the two sides at the ends of the
   * action bar row, the attacker's at the left (as the armies stand).
   */
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
      if (side === "attacker") this.barRow.prepend(img);
      else this.barRow.append(img);
    }
  }

  /** The Keys help (?): the controls and the battle's click rules. */
  private toggleHelp(open = this.help.hidden): void {
    if (!open) {
      this.help.hidden = true;
      return;
    }
    const box = this.help;
    box.replaceChildren(el("div", "bm-help-title", "Battle keys"));
    const table = el("table", "bm-help-table");
    for (const [k, what] of BATTLE_KEYS) {
      const tr = el("tr");
      const key = el("td", "bm-help-key");
      key.append(el("kbd", "", k));
      tr.append(key, el("td", "", what));
      table.append(tr);
    }
    box.append(
      table,
      el("div", "bm-dim bm-help-close", "Click or Esc to close"),
    );
    box.hidden = false;
  }

  /**
   * The top bar (UI2-03): the round chip ("Round 3 / 15" with an hourglass;
   * the limit's verdict in its hover card) and the turn queue as creature
   * portraits, as many as fit. Hover a portrait for its stack card; click
   * it to flash the stack on the field.
   */
  private renderTop(animate = true): void {
    const s = this.state;
    // The queue slides: tiles keep their place by key (FLIP).
    const flip = flipChildren(
      this.top.querySelector<HTMLElement>(".bm-queue"),
      animate && !this.animator.reduced && this.animator.speed !== Infinity,
    );
    this.top.replaceChildren();
    // The hovered tile is gone (its pointerleave will not come).
    this.queueHover = null;
    const player = this.playerSides.size === 1 ? this.playerSide() : null;
    const limit = roundLimitInfo(
      { ...s, round: this.scene.round || s.round },
      player,
    );
    const near = !this.deploying && limit.roundsLeft <= 3;
    const round = el(
      "span",
      `bm-round${near ? " bm-round-near" : ""}${
        near && player !== null
          ? limit.winner === player
            ? " bm-round-ours"
            : " bm-round-theirs"
          : ""
      }`,
    );
    round.append(hourglass(), this.deploying ? "Deployment" : limit.label);
    setTip(round, () =>
      this.deploying
        ? tipCard("Deployment", [
            "Before round 1: rearrange your stacks (Vanguard).",
          ])
        : tipCard(limit.title, [
            limit.left,
            el("div", "gm-tip-line bm-q-verdict", limit.verdict),
            limit.score,
            el("div", "gm-tip-line bm-dim", limit.rule),
          ]),
    );
    this.top.append(round);
    const queue = el("div", "bm-queue");
    this.top.append(queue);
    // The queue is centred, so it has the bar less the chip on both sides
    // (and the padding and gaps); a bar not laid out yet gets the full eight.
    const width = this.top.clientWidth;
    const room = width - 2 * round.offsetWidth - 36;
    const entries = turnQueue(s, width > 0 ? queueSlots(room) : QUEUE_MAX);
    for (const e of entries) queue.append(this.queueTile(e));
    flip(queue);
  }

  /** One tile of the turn queue: a portrait, an event or the divider. */
  private queueTile(e: QueueEntry): HTMLElement {
    if (e.kind === "divider") {
      const d = el("span", "bm-q-div", `Round ${e.round}`);
      d.dataset["flip"] = e.key;
      return d;
    }
    if (e.kind === "event") {
      const t = el(
        "span",
        `bm-q bm-q-event bm-${e.side}${e.shell ? " bm-q-shell" : ""}`,
      );
      t.dataset["flip"] = e.key;
      if (e.shell) {
        const shell = e.shell;
        const img = el("img", "bm-q-shell-img");
        img.src = assetUrl(MARKER_ICONS.shell[16], import.meta.env.BASE_URL);
        img.alt = "";
        img.draggable = false;
        t.append(img);
        t.setAttribute("aria-label", e.label);
        setTip(t, () => this.shellCard(e.label, e.side, shell));
        t.addEventListener("click", () => {
          const on = this.state.stacks.find(
            (x) => isAlive(x) && sameHex(x.hex, shell.hex),
          );
          if (on) this.flashStack(on.id);
        });
      } else {
        t.append(hourglass());
        setTip(t, () =>
          tipCard("Scheduled", [e.label, e.note ? `Set by ${e.note}.` : null]),
        );
      }
      return t;
    }
    const t = el(
      "span",
      `bm-q bm-${e.side}${e.now ? " bm-q-now" : ""}${
        e.round > this.state.round ? " bm-q-next" : ""
      }${e.afters ? " bm-q-afters" : ""}`,
    );
    t.dataset["flip"] = e.key;
    t.setAttribute("aria-label", `${e.name} ${e.count}`);
    const src = this.art?.portraits.get(e.creatureId);
    if (src) {
      const img = el("img", "bm-q-img");
      img.src = src;
      img.alt = "";
      img.draggable = false;
      t.append(img);
    } else {
      t.append(el("span", "bm-q-img bm-q-letter", e.name.slice(0, 1)));
    }
    t.append(el("span", "bm-q-count", queueCount(e.count)));
    setTip(t, () => this.queueCard(e));
    t.addEventListener("pointerenter", () => {
      this.queueHover = e.id;
    });
    t.addEventListener("pointerleave", () => {
      if (this.queueHover === e.id) this.queueHover = null;
    });
    t.addEventListener("click", () => {
      this.flashStack(e.id);
    });
    return t;
  }

  /** The hover card of a shell's timeline tile (FACTION_DWARVES 5, Lob). */
  private shellCard(
    label: string,
    side: BattleSide,
    shell: { readonly hex: Hex; readonly round: number },
  ): HTMLElement {
    const whose = this.playerSides.has(side) ? "Your Mortars" : "Enemy Mortars";
    const on = this.state.stacks.find(
      (x) => isAlive(x) && sameHex(x.hex, shell.hex),
    );
    const icon = el("img", "bm-q-card-img bm-q-card-shell");
    icon.src = assetUrl(MARKER_ICONS.shell[32], import.meta.env.BASE_URL);
    icon.alt = "";
    return tipCard(
      label,
      [
        `Lands at the start of round ${shell.round}, before any stack acts: a shot on whatever stands on the marked hex, friend or foe, and half a shot on every stack next to it.`,
        on
          ? `On the hex now: ${creatureName(on.creature, on.count)} \u00d7${on.count}. A stack that has not acted this round can still step off.`
          : "The hex is empty now: only the splash lands, unless a stack walks in.",
      ],
      { subtitle: `${whose} \u00b7 round ${shell.round}`, icon },
    );
  }

  /** The hover card of a queue portrait: who, whose and when, the stats. */
  private queueCard(e: QueueEntry & { kind: "stack" }): HTMLElement | null {
    const stack = this.state.stacks.find((x) => x.id === e.id);
    if (!stack || !isAlive(stack)) return null;
    const info = stackInfo(this.state, stack);
    const whose = this.playerSides.has(info.side) ? "Your army" : "Enemy";
    const when = e.now
      ? "acting now"
      : e.round > this.state.round
        ? `round ${e.round}`
        : e.afters
          ? "Afters, at the end of this round"
          : "later this round";
    const stats = el("div", "gm-tip-stats");
    for (const st of info.stats) {
      const cell = el("span", "", `${st.label} `);
      cell.append(el("b", "", st.value));
      stats.append(cell);
    }
    const src = this.art?.portraits.get(stack.creature.id);
    let icon: HTMLImageElement | undefined;
    if (src) {
      icon = el("img", "bm-q-card-img");
      icon.src = src;
      icon.alt = "";
    }
    return tipCard(
      `${info.title} \u00d7${info.count}`,
      [
        stats,
        e.afters
          ? "Afters: a second turn once every other turn is done, without walking."
          : e.note
            ? `In the order: ${e.note}.`
            : null,
        el(
          "div",
          "gm-tip-line bm-dim",
          "Click to find it on the field; right-click it there for the full card.",
        ),
      ],
      { subtitle: `${whose} \u00b7 ${when}`, ...(icon ? { icon } : {}) },
    );
  }

  /** Click on a queue portrait: the stack's hex blinks gold for a moment. */
  private flashStack(id: StackId): void {
    this.beacon = { id, t0: performance.now() };
  }

  /**
   * While a clicked queue stack blinks: a gold arrow bobbing over its head
   * (in stage pixels, over everything; still under reduced motion).
   */
  private drawBeacon(ctx: CanvasRenderingContext2D): void {
    if (this.beacon === null) return;
    const u = this.scene.units.get(this.beacon.id);
    if (!u || !u.visible) return;
    const t = performance.now() - this.beacon.t0;
    const tall = this.art?.units.get(u.creatureId)?.asset.feet.contactY ?? 48;
    const bob = this.animator.reduced
      ? 0
      : ([0, 2, 4, 2][Math.floor(t / 110) % 4] ?? 0);
    const x = Math.round(u.x);
    const y = Math.round(u.y - u.lift - tall - 10 + bob);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x - 9, y - 12);
    ctx.lineTo(x + 9, y - 12);
    ctx.lineTo(x + 9, y - 6);
    ctx.lineTo(x, y + 3);
    ctx.lineTo(x - 9, y - 6);
    ctx.closePath();
    ctx.fillStyle = "#ffd65c";
    ctx.strokeStyle = "#2a1d08";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  /**
   * The overlay with the queue's marks added: the hovered portrait's stack
   * outlined, the clicked one blinking gold (steady under reduced motion).
   * Null when there is nothing to add.
   */
  private queueOverlay(): Overlay | null {
    const add: [StackId, HexMark][] = [];
    if (this.queueHover !== null) add.push([this.queueHover, "inspect"]);
    if (this.beacon !== null) {
      const t = performance.now() - this.beacon.t0;
      if (t > QUEUE_FLASH_MS) this.beacon = null;
      else if (this.animator.reduced || Math.floor(t / 160) % 2 === 0)
        add.push([this.beacon.id, "chosen"]);
    }
    if (add.length === 0) return null;
    const marks = new Map(this.scene.overlay.marks);
    for (const [id, mark] of add) {
      const st = this.state.stacks.find((x) => x.id === id);
      if (st && isAlive(st)) marks.set(hexIndex(st.hex), mark);
    }
    return { ...this.scene.overlay, marks };
  }

  /** What the screen is doing, for the status line (status.ts). */
  private statusMode(): StatusMode {
    const a = activeStack(this.state);
    if (this.state.winner !== null || a === null) return { kind: "over" };
    if (!this.playerSides.has(a.side)) return { kind: "enemy" };
    if (this.auto) return { kind: "auto" };
    if (this.animating || !this.pendingAction) return { kind: "busy" };
    if (this.casting) return { kind: "act", act: this.castStatus() };
    if (this.aiming) return { kind: "act", act: this.aimStatus() };
    if (this.afterStep)
      return {
        kind: "after",
        hexes: this.afterStep.hover?.path.length ?? null,
      };
    return {
      kind: "turn",
      intent: this.intent,
      swaps: this.legal.swaps.size > 0,
      stepAfter: walkAfterRange(a),
    };
  }

  /** A stack target by name ("the Goblins"). */
  private targetName(id: StackId): string {
    const s = getStack(this.state, id);
    return `the ${creatureName(s.creature, Math.max(1, s.count))}`;
  }

  /** The cast being aimed, for the status line. */
  private castStatus(): ActStatus {
    const c = this.casting as Casting;
    const step = nextStep(c.entry.id, c.targets);
    const at = this.pointer ? pointAtField(this.state, this.pointer).hex : null;
    const stackOn = (h: Hex): BattleStack | undefined =>
      this.state.stacks.find((s) => isAlive(s) && sameHex(s.hex, h));
    const what = (h: Hex): string => {
      const s = stackOn(h);
      return s ? this.targetName(s.id) : "this hex";
    };
    const live = effectiveChoices(c.choices);
    let hover: ActHover = { kind: "none" };
    const none = this.noEffectAt(at);
    if (at !== null && none !== null)
      hover = { kind: "no-effect", what: what(at), reason: none };
    else if (at !== null && step !== null && this.castValidAt(at)) {
      const t = c.hover?.target;
      hover = {
        kind: "target",
        what: t && "stack" in t ? this.targetName(t.stack) : what(at),
        preview: c.hover?.preview ?? null,
        ...(step === "condition" ? { thenCondition: true } : {}),
      };
    } else if (at !== null && step !== null) hover = { kind: "invalid" };
    const panel =
      step === "choice" || (step === "condition" && c.pickFor !== null);
    return {
      name: c.entry.name,
      verb: c.entry.source === "item" ? "Use" : "Cast",
      prompt:
        step === null
          ? null
          : step === "condition" && c.pickFor !== null
            ? `Choose a condition of ${this.targetName(c.pickFor)}`
            : step === "choice"
              ? "Choose +2 or −2"
              : stepPrompt(c.entry.id, c.targets),
      pickIn: panel ? "panel" : "field",
      valid:
        step === "stack" || step === "hex"
          ? live.length
          : step === "condition"
            ? choiceStacks(this.state, live).length
            : null,
      noTarget:
        c.entry.source === "item" || !isBattleSpell(c.entry.id)
          ? null
          : spellNoTarget(spellDef(c.entry.id).target),
      hover,
    };
  }

  /** The act being aimed from the bar, for the status line. */
  private aimStatus(): ActStatus {
    const a = this.aiming as Aiming;
    const mode = a.mode;
    const s = this.state;
    const kind = stepKind(mode, mode.targets.length);
    const full = isFull(s, mode);
    const at = this.pointer ? pointAtField(s, this.pointer).hex : null;
    let hover: ActHover = { kind: "none" };
    const hv = a.hover;
    if (hv) {
      const t = hv.choice.target;
      hover = {
        kind: "target",
        what: "stack" in t ? this.targetName(t.stack) : "this hex",
        preview: hv.preview,
        ...(kind === "condition" ? { thenCondition: true } : {}),
      };
    } else if (at !== null && !full) hover = { kind: "invalid" };
    return {
      name: modeName(mode),
      verb: "Use",
      prompt: full ? null : modePrompt(s, mode),
      pickIn: kind === "condition" && mode.pickFor !== null ? "panel" : "field",
      valid: full ? null : a.choices.length,
      noTarget: a.bar.reason,
      hover,
    };
  }

  /** The status line (UI2-05): what a click does now, and the last event. */
  private renderPanel(): void {
    let line: StatusLine;
    if (this.deploying !== null) line = this.deploying.status();
    else line = statusLine(this.state, this.statusMode());
    const log =
      this.deploying !== null ? "" : (this.log[this.log.length - 1] ?? "");
    const look = JSON.stringify([line, log]);
    if (look === this.statusLook) return;
    this.statusLook = look;
    this.status.className = `bm-status bm-tone-${line.tone}`;
    this.statusText.textContent = line.text;
    this.statusText.title = line.text;
    this.statusLog.textContent = log;
    this.statusLog.title = this.log.slice(-6).join("\n");
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
      this.renderPanel();
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
    // Pages with nothing to aim at are greyed with the reason (bzc.47).
    const pages = side
      ? withTargetStatus(this.state, heroBook(this.state, side))
      : [];
    const magic = side ? this.state.sides[side].magic : undefined;
    const active = activeStack(this.state);
    const own = withTargetStatus(this.state, creatureBook(this.state));
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
        // Bead bzc.99: rank gilds a school's frames; the hero's adventure
        // pages are listed (dimmed) on the book's Adventure tab.
        ...(magic ? { ranks: magic.schoolRanks } : {}),
        adventure: magic
          ? [
              ...magic.pages.map((id) => [id, false] as const),
              ...[...new Set(magic.scrolls)].map((id) => [id, true] as const),
            ]
              .filter(([id]) => isAdventureSpell(id))
              .map(([id, scroll]) => {
                const s = spellInfo(id);
                return {
                  id,
                  name: s.name,
                  school: s.school,
                  tier: s.tier,
                  mana: Math.max(
                    1,
                    Math.ceil((s.mana * magic.costPercent) / 100),
                  ),
                  scroll,
                };
              })
          : [],
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
      choices: [],
      choicesFor: "",
      notice: null,
    };
    this.castBox.hidden = false;
    this.refreshCast();
    this.updateHover();
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
    else {
      c.targets.pop();
      // A line's third hex follows from the second: drop both.
      if (this.isLine(c) && c.targets.length === 2) c.targets.pop();
    }
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

  /** The cast aims a straight line (its third hex follows the second). */
  private isLine(c: Casting): boolean {
    return c.entry.source !== "item" && spellDef(c.entry.id).target === "line3";
  }

  /** Recomputes the valid targets when the chosen ones changed. */
  private syncCastChoices(c: Casting): void {
    const key = JSON.stringify(c.targets);
    if (key === c.choicesFor) return;
    c.choicesFor = key;
    c.choices = castChoices(this.state, c.entry, c.targets);
  }

  /** The valid target a click or hover on `h` would add, or null. */
  private targetAt(h: Hex | null): ActTarget | null {
    const c = this.casting;
    if (!c || h === null) return null;
    const step = nextStep(c.entry.id, c.targets);
    if (step !== "stack" && step !== "hex") return null;
    return castChoicesAt(c.choices, h)[0]?.target ?? null;
  }

  /** The legal choice of a stack or hex step on hex `h`, or null. */
  private choiceAt(h: Hex | null): CastChoice | null {
    const c = this.casting;
    if (!c || h === null) return null;
    const step = nextStep(c.entry.id, c.targets);
    if (step !== "stack" && step !== "hex") return null;
    return castChoicesAt(c.choices, h)[0] ?? null;
  }

  /**
   * Whether hex `h` holds something the next step may take that changes
   * something (a legal target with no effect is not valid here).
   */
  private castValidAt(h: Hex | null): boolean {
    const c = this.casting;
    if (!c || h === null) return false;
    const step = nextStep(c.entry.id, c.targets);
    if (step === "condition")
      return effectiveChoices(castChoicesAt(c.choices, h)).length > 0;
    const ch = this.choiceAt(h);
    return ch !== null && ch.noEffect === null;
  }

  /** Why the legal targets on hex `h` would change nothing, or null. */
  private noEffectAt(h: Hex | null): string | null {
    const c = this.casting;
    if (!c || h === null || this.castValidAt(h)) return null;
    return (
      castChoicesAt(c.choices, h).find((x) => x.noEffect !== null)?.noEffect ??
      null
    );
  }

  private castClick(): void {
    const c = this.casting;
    if (!c) return;
    const at = this.pointer ? pointAtField(this.state, this.pointer).hex : null;
    const step = nextStep(c.entry.id, c.targets);
    // A legal target that would change nothing is refused with the reason
    // (bzc.47 review: it must not look or act like a real target).
    const none = this.noEffectAt(at);
    if (none !== null) {
      c.notice = `No effect: ${none}`;
      this.refreshCast();
      return;
    }
    c.notice = null;
    if (step === "condition") {
      // A stack with a valid condition: its conditions go to the panel;
      // a single one is taken at once.
      const here =
        at === null ? [] : effectiveChoices(castChoicesAt(c.choices, at));
      const first = here[0];
      if (here.length === 1 && first) {
        c.targets.push(first.target);
        c.pickFor = null;
      } else
        c.pickFor =
          first && "stack" in first.target ? first.target.stack : null;
      c.hover = null;
      this.refreshCast();
      this.updateHover();
      return;
    }
    const t = this.castValidAt(at) ? this.targetAt(at) : null;
    if (!t) return;
    c.targets.push(t);
    // A line of three: the second hex sets the direction, the third follows.
    this.syncCastChoices(c);
    const only = c.choices[0];
    if (
      this.isLine(c) &&
      c.targets.length === 2 &&
      c.choices.length === 1 &&
      only
    )
      c.targets.push(only.target);
    c.hover = null;
    this.refreshCast();
    this.updateHover();
  }

  private castHover(h: Hex | null): void {
    const c = this.casting;
    if (!c) return;
    const t = this.targetAt(h);
    const same =
      c.hover !== null &&
      t !== null &&
      JSON.stringify(c.hover.target) === JSON.stringify(t);
    if (same) return;
    if (t === null) {
      if (c.hover !== null) {
        c.hover = null;
        this.refreshCast();
      }
      return;
    }
    // The rehearsal when this target completes the cast (a line's second
    // hex completes it too: its third follows).
    let full = [...c.targets, t];
    if (this.isLine(c) && full.length === 2) {
      const next = castChoices(this.state, c.entry, full)[0];
      if (next) full = [...full, next.target];
    }
    const last = nextStep(c.entry.id, full) === null;
    c.hover = {
      target: t,
      preview: last
        ? castPreview(this.state, castAction(this.state, c.entry, full))
        : null,
    };
    this.refreshCast();
  }

  /**
   * The targeting overlay of a cast (bead bzc.47): valid targets glow and
   * pulse, everything else dims; chosen targets are numbered; an area
   * spell shows its footprint under the pointer.
   */
  private castMarks(marks: Map<number, HexMark>): {
    area: Hex[];
    labels: HexLabel[];
    focus: TargetFocus | null;
  } {
    const c = this.casting;
    if (!c) return { area: [], labels: [], focus: null };
    const s = this.state;
    marks.clear();
    const step = nextStep(c.entry.id, c.targets);
    const hexes = new Set<number>();
    const stacks = new Set<StackId>();
    let shown = step === null ? [] : c.choices.filter((x) => x.hex !== null);
    if (step === "condition" && c.pickFor !== null)
      shown = shown.filter(
        (x) => "stack" in x.target && x.target.stack === c.pickFor,
      );
    // Targets that would change nothing get a muted outline, no ring and
    // stay dimmed; the rest glow.
    const live = effectiveChoices(shown);
    const dull = shown.filter((x) => x.noEffect !== null);
    // When nearly every hex is valid (an area anywhere), shading them all
    // is noise: only the hovered hex and its footprint are drawn.
    const many = live.length >= ANYWHERE;
    const lit = new Set<number>();
    for (const x of live) {
      const i = hexIndex(x.hex as Hex);
      hexes.add(i);
      lit.add(i);
      if (!many) marks.set(i, "act-valid");
    }
    if (!many)
      for (const x of dull) {
        const i = hexIndex(x.hex as Hex);
        if (lit.has(i)) continue;
        hexes.add(i);
        marks.set(i, "act-noeffect");
      }
    const ringed = new Set<StackId>(
      step === "stack" || step === "condition" ? choiceStacks(s, live) : [],
    );
    for (const id of ringed) stacks.add(id);
    const labels: HexLabel[] = [];
    c.targets.forEach((t, i) => {
      const h =
        "hex" in t ? t.hex : "stack" in t ? getStack(s, t.stack).hex : null;
      if (h === null) return;
      marks.set(hexIndex(h), "chosen");
      hexes.add(hexIndex(h));
      lit.add(hexIndex(h));
      if ("stack" in t) stacks.add(t.stack);
      if (!labels.some((l) => sameHex(l.hex, h)))
        labels.push({ hex: h, text: String(i + 1) });
    });
    if (c.pickFor !== null) {
      const h = getStack(s, c.pickFor).hex;
      marks.set(hexIndex(h), "chosen");
      hexes.add(hexIndex(h));
      stacks.add(c.pickFor);
    }
    let area: Hex[] = [];
    const at = this.pointer ? pointAtField(s, this.pointer).hex : null;
    if (at !== null && step !== null && this.castValidAt(at))
      marks.set(hexIndex(at), "act-hover");
    if (at !== null && step === "hex" && this.choiceAt(at) !== null)
      area = spellAreaHexes(c.entry.id, at);
    // A complete area cast keeps its footprint on the chosen hex.
    const first = c.targets[0];
    if (step === null && first !== undefined && "hex" in first)
      area = spellAreaHexes(c.entry.id, first.hex);
    if (area.length <= 1) area = [];
    // Stacks standing on lit hexes stay lit too.
    for (const st of s.stacks)
      if (isAlive(st) && lit.has(hexIndex(st.hex))) stacks.add(st.id);
    return {
      area,
      labels,
      focus: { hexes, stacks, ringed, dim: step !== null && !many },
    };
  }

  private refreshCast(): void {
    const c = this.casting;
    if (!c) return;
    const id = c.entry.id;
    this.syncCastChoices(c);
    const step = nextStep(id, c.targets);
    const complete = step === null;
    const choiceOf = (ref: ConditionRef): CastChoice | undefined =>
      c.choices.find(
        (x) =>
          "condition" in x.target &&
          x.target.stack === ref.stack &&
          x.target.condition === ref.condition,
      );
    const validRef = (ref: ConditionRef): boolean =>
      choiceOf(ref)?.noEffect === null;
    const live = effectiveChoices(c.choices);
    let conditions:
      (ConditionOption & { valid: boolean; why?: string })[] | null = null;
    if (step === "condition" && c.pickFor !== null) {
      const s = getStack(this.state, c.pickFor);
      conditions = s.conditions.map((x) => {
        const ref = { stack: s.id, condition: x.uid };
        return {
          ref,
          label: `${conditionKind(x.kind).name}${x.size ? ` ${x.size}` : ""}${x.clock === null ? "" : ` (${x.clock})`}`,
          effect: conditionKind(x.kind).text(x),
          valid: validRef(ref),
          ...(choiceOf(ref)?.noEffect
            ? { why: `No effect: ${choiceOf(ref)?.noEffect}` }
            : {}),
        };
      });
    }
    const valid =
      step === "stack" || step === "hex"
        ? live.length
        : step === "condition"
          ? choiceStacks(this.state, live).length
          : null;
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
        badChoices: ["+2", "-2"].filter(
          (x) =>
            !live.some((y) => "choice" in y.target && y.target.choice === x),
        ),
        valid,
        notice: c.notice,
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
          if (!validRef(ref)) return;
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
    this.renderPanel();
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
      ab.append(head);
      // When it may be used, in plain words, under the name.
      if (a.activated) ab.append(el("div", "bm-info-ab-use", a.activated));
      ab.append(
        rulesText(a.text, {
          tag: "div",
          className: "bm-info-ab-text",
          hover: true,
        }),
      );
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
      ab.append(
        head,
        rulesText(info.birthright.text, {
          tag: "div",
          className: "bm-info-ab-text",
          hover: true,
        }),
      );
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
          rulesText(` ${pg.text}`, { hover: true }),
        );
        if (pg.spent) row.append(el("span", "bm-tag", "spent"));
        box.append(row);
      }
    }
    if (info.statuses.length > 0) section("Conditions and state");
    for (const st of info.statuses)
      box.append(
        rulesText(st, { tag: "div", className: "bm-info-status", hover: true }),
      );
    box.append(el("div", "bm-dim bm-info-close", "Click or Esc to close"));
    box.hidden = false;
  }

  private closeInfo(): void {
    this.infoFor = null;
    this.info.hidden = true;
  }

  // -------------------------------------------------------------- result

  private showResult(
    engine: EngineBattleResult,
    result: GameBattleResult,
  ): Promise<void> {
    const player: BattleSide =
      this.playerSides.has("defender") && !this.playerSides.has("attacker")
        ? "defender"
        : "attacker";
    const won = engine.winner === player;
    // The winner's faction sting (the generic one for neutral armies).
    playSound(won ? victoryCue(this.setup[player].faction) : "defeat");
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
            } had more fight value left (${fightValueLeft(this.state, engine.winner ?? "defender")} to ${fightValueLeft(this.state, engine.winner === "attacker" ? "defender" : "attacker")}), and the other side's survivors are lost.`
          : `After ${engine.rounds} round${engine.rounds === 1 ? "" : "s"}.`,
      ),
    );
    // One row per creature type that lost units, its stacks summed, with
    // just the number killed (beads bzc.92, bzc.104).
    const losses = battleLosses(this.setup, result);
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
      for (const r of losses[side]) {
        const row = el("div", "bm-result-row");
        const src = this.art?.portraits.get(r.creature);
        if (src) {
          const img = el("img", "bm-portrait");
          img.src = src;
          img.alt = "";
          row.append(img);
        }
        const def = getCreature(r.creature);
        row.append(
          el("span", "", r.lost === 1 ? def.name : def.plural),
          el("span", "bm-num", String(r.lost)),
        );
        col.append(row);
      }
      if (losses[side].length === 0) col.append(el("div", "bm-dim", NO_LOSSES));
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
