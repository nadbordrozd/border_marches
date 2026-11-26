/**
 * The adventure screen and the game loop around it: HoMaM II layout for a
 * widescreen browser (map on the left, sidebar on the right with minimap,
 * turn banner, hero list, selected hero, towns and End Turn; resource bar
 * and date at the bottom), hero movement with path preview and walking
 * animation, visits (pickups, mines, chests, towns), battles through the
 * battle screen (as attacker or defender), level-ups, meetings between
 * own heroes, the kingdom summary, AI turns ("thinking" banner), day and
 * week transitions, auto-save and the victory and defeat screens.
 */
import { CELL_PX } from "../assets/manifest.ts";
import {
  aiStep,
  applyBattleResult,
  voidPendingBattle,
  digHere,
  objectTypeOf,
  useSite,
  battlePlayers,
  battleSetup,
  calendar,
  chooseLevelUp,
  dailyIncome,
  endTurn,
  findPath,
  heroesOf,
  humanPlayer,
  heroStats,
  inSight,
  levelUpOffer,
  maxMana,
  moveHeroAlong,
  sightRadius,
  takeChest,
  townsOf,
  xpForLevel,
} from "../core/game/index.ts";
import type {
  BattleResult,
  CommandError,
  CommandResult,
  GameEvent,
  GameState,
  HeroState,
  Path,
  PlayerController,
} from "../core/game/index.ts";
import { AdventureAi } from "../core/ai/index.ts";
import { createBattleResolver } from "../core/battle/resolver.ts";
import type { MapObject, MapObjectKind } from "../core/map/types.ts";
import { CHEST, MINES, RESOURCE_IDS, RESOURCE_NAMES } from "../data/economy.ts";
import { getHeroClass } from "../data/hero.ts";
import { MAX_HEROES, playerColour } from "../data/players.ts";
import { createMapView, ZOOM_STEPS } from "../render/map/map-view.ts";
import type { MapFlag, MapView } from "../render/map/map-view.ts";
import { pickupCue, siteCue } from "../audio/cues.ts";
import { playSound } from "../audio/sound.ts";
import { fxEvent } from "../audio/fx.ts";
import { burst as fxBurst, sparkle as fxSparkle } from "../render/fx/emit.ts";
import { PALETTES } from "../render/fx/pixels.ts";
import { onMotionChange, reducedMotion, terrainAnimated } from "./motion.ts";
import { bump, countUp, dayBanner, floatText, flyTo } from "./anim.ts";
import { openBattleScreen } from "./battle/screen.ts";
import { openAdventureBook, type BookChoice } from "./spellbook.ts";
import { aimHint } from "./adventure-targets.ts";
import type { AdventureAim } from "./adventure-targets.ts";
import { castAdventureSpell, registerSpells } from "../core/magic/index.ts";
import { soundControl } from "./sound-control.ts";
import { devSettings } from "./dev-panel.ts";
import { armyRow } from "./army.ts";
import {
  button,
  el,
  img,
  imageUrl,
  kbd,
  keyButton,
  modal,
  modalOpen,
  onModalChange,
  resourceIcon,
  toast,
  wait,
} from "./dom.ts";
import { findFaction } from "../data/factions.ts";
import {
  buildableTowns,
  endTurnWarnings,
  incomeBreakdown,
  minesOf,
  nextActionHint,
  pathSummary,
  SPENT_MP,
} from "./hints.ts";
import type { ResourceId } from "../core/map/types.ts";
import {
  closeTips,
  hideTip,
  pinTipAt,
  setPinTip,
  setTip,
  showTipAt,
  tipCard,
  unpinTip,
} from "./tooltip.ts";
import { dateLabel, objectAt, stackPhrase } from "./format.ts";
import { loadGameMapAssets } from "./hero-sprite.ts";
import {
  endTurnDialog,
  endTurnRows,
  noSchoolDialog,
  preBattleDialog,
  preBattleModel,
  retreatDialog,
  retreatModel,
  resultDialog,
  siteDialog,
  siteDialogModel,
} from "./dialog-kinds.ts";
import { learnsNothingForNoSchool, noSchoolModel } from "./guild-learning.ts";
import { showLearnt } from "./town-guild.ts";
import {
  areaCells,
  digResult,
  siteResult,
  type VisitArea,
  type VisitResult,
} from "./visit-results.ts";
import { heroArt, namedHeroPortrait } from "../assets/unit-art.ts";
import {
  levelUpDialog,
  openHeroScreen,
  type HeroScreenHost,
} from "./hero-screen.ts";
import { openMeeting } from "./meeting.ts";
import { heroCard, mapCard, mapCardView, townCard } from "./map-card.ts";
import { Minimap } from "./minimap.ts";
import { glyph, heroRow, townRow, type SideGlyph } from "./side-panel.ts";
import { iconElement } from "./icons.ts";
import { PRIMARY_STATS, STAT_NAMES } from "../data/effects.ts";
import { browserStorage, deleteSave, readSave, saveGame } from "./save.ts";
import { displayObjects, objectsSignature } from "./objects.ts";
import { openTownScreen } from "./town.ts";
import { openKingdom } from "./kingdom.ts";
import {
  DOUBLE_CLICK_MS,
  PLAN_OPTIONS,
  blockedWords,
  clickAgain,
  clickTarget,
  isDoubleClick,
  mapAction,
  pathGuard,
  stopsWords,
  townClickAction,
  type LastClick,
  type MapAction,
} from "./map-clicks.ts";
import { cursorImage, cursorStyle } from "./cursors.ts";

/** The human player in the MVP flow (RULES_V2 5.1: player 0). */
export const PLAYER = 0;
const STEP_MS = 110;
/** Pause per visible AI step, so the human can follow it. */
const AI_STEP_MS = 90;
/** Per cell of an AI hero's walk the human sees (ms). */
const AI_WALK_MS = 70;
/** Between two lines floating up from the hero (ms). */
const FLOAT_GAP_MS = 380;
/** How long a rumour's area pulses on the map after "Show on map" (ms). */
const AREA_MARK_MS = 7000;

/** The page hook the scripted browser check drives (window.__bmGame). */
export interface GameHook {
  state(): GameState;
  /** True while walking, fighting, an AI turn, or a dialog or screen is open. */
  busy(): boolean;
  /** True while AI players take their turns. */
  aiThinking(): boolean;
  /** A click on map cell (x, y), as with the mouse. */
  click(x: number, y: number): void;
  /** A key press on the adventure screen. */
  key(key: string): void;
  /** Selects one of the human's heroes. */
  selectHero(heroId: string): void;
  /** The selected hero's id. */
  selectedHero(): string | null;
  /**
   * Uncollected pickups, live monsters and catalogue objects (sites,
   * dwellings, banks, artifacts, teleports) the hero can path to, by cost.
   */
  targets(): HookTarget[];
  /** Hovers map cell (x, y): shows and returns the tooltip text. */
  hover(x: number, y: number): string | null;
  /** The planned walk's goal cell, or null (right-click never plans). */
  planned(): { x: number; y: number } | null;
  /** Opens a town screen by id (screenshot tours of every faction). */
  openTown(townId: string): void;
  /** The page point at the centre of map cell (x, y), or null off screen. */
  cellToClient(x: number, y: number): { x: number; y: number } | null;
  /** The canvas point of cell (x, y), on screen or not (camera evidence). */
  cellToScreen(x: number, y: number): { x: number; y: number };
  /** Shows the victory (true) or defeat screen without ending the game. */
  previewEnd(won: boolean): void;
  /** Plays the capture flag-raise at a town or mine (animation evidence). */
  raiseFlag(objectId: string): void;
  /** Plays the level-up burst round a hero (animation evidence). */
  levelBurst(heroId: string): void;
}

export interface HookTarget {
  id: string;
  kind: MapObjectKind;
  /** Catalogue type (data.type), when it has one. */
  type?: string;
  x: number;
  y: number;
  cost: number;
  /** Reachable with today's movement points. */
  today: boolean;
}

const HOOK_KINDS: ReadonlySet<MapObjectKind> = new Set<MapObjectKind>([
  "pickup",
  "monster",
  "site",
  "dwelling",
  "bank",
  "artifact",
  "teleport",
]);

declare global {
  interface Window {
    __bmGame?: GameHook;
  }
}

export interface GameExit {
  reason: "menu" | "won" | "lost";
}

/** Runs one game until the player wins, loses or quits to the menu. */
export async function playGame(initial: GameState): Promise<GameExit> {
  const assets = await loadGameMapAssets();
  return new Promise((resolve) => {
    new GameScreen(initial, assets, resolve);
  });
}

/** The adventure screen's keys, for the Keys dialog (?) and the menu. */
export const ADVENTURE_KEYS: ReadonlyArray<readonly [string, string]> = [
  ["Click", "Plan a path; click the end again to walk"],
  ["Space", "Walk the planned path"],
  ["Esc", "Cancel the plan or the aimed spell"],
  ["E", "End the turn"],
  ["H", "Next hero with movement left"],
  ["I", "Hero sheet"],
  ["T", "Town (the hero's, else the first)"],
  ["K", "Kingdom overview"],
  ["M", "Spellbook"],
  ["G", "Dig for treasure"],
  ["L", "Adventure log"],
  ["O", "Menu: save, load, sound, quit"],
  ["Arrows", "Pan the map"],
  ["+ / -", "Zoom"],
  ["?", "This list"],
];

function keysTable(): HTMLElement {
  const table = el("table.gm-table.gm-keys-table");
  for (const [key, what] of ADVENTURE_KEYS)
    table.append(el("tr", el("td", kbd(key)), el("td", what)));
  return table;
}

class GameScreen {
  private state: GameState;
  private readonly human: number;
  private readonly host = document.getElementById("ui") ?? document.body;
  private readonly root = el("div.gm-game");
  private readonly mapWrap = el("div.gm-mapwrap");
  private readonly canvas = el("canvas.gm-map");
  private readonly banner = el("div.gm-ai-banner");
  private readonly bar = el("div.gm-bar");
  private readonly side = el("aside.gm-side");
  private readonly turnPanel = el("div.gm-turn");
  private readonly heroList = el("div.gm-hero-list");
  private readonly heroPanel = el("div.gm-hero-panel");
  private readonly townPanel = el("div.gm-town-panel");
  private readonly hint = el("div.gm-hint-line");
  /** Recent events for the log (L), oldest first. */
  private readonly log: Array<{ day: number; text: string }> = [];
  /** The hovered map cell, for the tooltip. */
  private hovered: { x: number; y: number } | null = null;
  /** What a click on the hovered cell does (UI2-07): cursor and status. */
  private hoverAction: MapAction | null = null;
  /** The hero card's movement bar, which shows a planned walk's cost. */
  private mpMeter: HTMLElement | null = null;
  private readonly view: MapView;
  private readonly minimap: Minimap;
  private readonly resolver = createBattleResolver();
  private readonly ai = new AdventureAi();
  private objectsSig = "";
  /** The planned destination and its path. */
  private plan: { x: number; y: number; path: Path } | null = null;
  /** The last click on a town, for double-clicks (map-clicks.ts). */
  private lastTownClick:
    (LastClick & { plan: { x: number; y: number; path: Path } | null }) | null =
    null;
  /** A walk to an own town waiting out the double-click window. */
  private pendingWalk = 0;
  /**
   * Input is ignored while walking, fighting or in a dialog. The four flags
   * below turn the map's own input (pan, zoom, hover, click) off with them
   * (syncInput, bead xaj.18).
   */
  private busyFlag = false;
  private aiFlag = false;
  private screenFlag = false;
  private finishedFlag = false;
  private selectedId: string | null = null;
  private pointer = { x: 0, y: 0 };
  private viewportTimer = 0;
  private offMotion: () => void = () => {};
  private offModal: () => void = () => {};
  /** When the last queued float at the hero starts (ms). */
  private floatQueue = 0;
  /** Visit outcomes waiting to be shown as dialogs (bead bzc.81). */
  private results: VisitResult[] = [];
  /** Pages the human's heroes learnt at a day's start, shown at its turn. */
  private learntQueue: GameEvent[] = [];
  /** Whether the no-school explanation was shown this game. */
  private noSchoolExplained = false;
  /** Clears a rumour's marked area. */
  private markTimer = 0;
  /**
   * An adventure spell aimed on the map (bead bzc.47): its valid targets
   * glow and the next click on one casts.
   */
  private aiming: {
    spell: string;
    scroll: boolean;
    aims: readonly AdventureAim[];
  } | null = null;

  constructor(
    initial: GameState,
    assets: Awaited<ReturnType<typeof loadGameMapAssets>>,
    private readonly exit: (result: GameExit) => void,
  ) {
    registerSpells();
    this.state = initial;
    this.human = humanPlayer(initial);
    this.selectedId = heroesOf(initial, this.human)[0]?.id ?? null;
    this.mapWrap.append(this.canvas, this.banner);
    this.minimap = new Minimap((x, y) => {
      if (!this.inputBlocked()) this.view.centerOn(x, y);
    });
    this.buildSide();
    this.root.append(el("div.gm-main", this.mapWrap, this.bar), this.side);
    this.host.append(this.root);
    this.view = createMapView(this.canvas, assets);
    this.view.setFogFade(!reducedMotion());
    this.offMotion = onMotionChange((reduced) => {
      this.view.setFogFade(!reduced);
      this.syncTerrainMotion();
    });
    this.view.setMap(initial.map);
    this.syncTerrainMotion();
    this.view.onClick((cell) => this.onMapClick(cell.x, cell.y));
    this.view.onHover((cell) => this.onHover(cell));
    this.offModal = onModalChange(() => this.syncInput());
    this.canvas.addEventListener("pointermove", (e) => {
      const moved =
        Math.abs(e.clientX - this.pointer.x) +
          Math.abs(e.clientY - this.pointer.y) >
        2;
      this.pointer = { x: e.clientX, y: e.clientY };
      if (moved && this.hovered !== null) this.showMapTip();
    });
    this.canvas.addEventListener("pointerleave", () => {
      this.hovered = null;
      this.renderHint();
      hideTip();
    });
    // Right-click inspects (UI2-18): the cell's card stays pinned; the
    // hero neither moves nor plans (the map acts on the left button only).
    this.canvas.addEventListener("contextmenu", (e) => this.onMapInspect(e));
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("resize", this.onResize);
    this.refresh();
    const hero = this.hero();
    if (hero !== undefined) this.view.centerOn(hero.x, hero.y);
    else this.centreOnTown();
    this.viewportTimer = window.setInterval(() => {
      this.updateViewport();
      this.syncInput();
    }, 120);
    toast(dateLabel(this.state.day));
    // Hook for the scripted browser check (tools and evidence only).
    window.__bmGame = {
      state: () => this.state,
      busy: () => this.inputBlocked(),
      aiThinking: () => this.aiRunning,
      click: (x, y) => this.onMapClick(x, y),
      key: (key) => this.onKey(new KeyboardEvent("keydown", { key })),
      selectHero: (id) => this.selectHero(id),
      selectedHero: () => this.hero()?.id ?? null,
      targets: () => this.targets(),
      hover: (x, y) => {
        const rect = this.canvas.getBoundingClientRect();
        this.pointer = { x: rect.left + 200, y: rect.top + 200 };
        this.onHover({ x, y });
        const tip = document.getElementById("gm-tip");
        return tip?.classList.contains("gm-tip-on") === true
          ? (tip.innerText ?? tip.textContent)
          : null;
      },
      planned: () =>
        this.plan === null ? null : { x: this.plan.x, y: this.plan.y },
      previewEnd: (won) => this.showEnd(won),
      openTown: (id) => void this.openTown(id),
      cellToClient: (x, y) => this.cellToClient(x, y),
      cellToScreen: (x, y) => this.view.cellToScreen(x, y),
      raiseFlag: (id) => this.flagRaised(id),
      levelBurst: (id) => void this.levelBurst(id),
    };
    // Resume a battle, level-up or AI turn left pending.
    void this.afterCommand([]).then(() => {
      if (this.state.currentPlayer !== this.human) void this.runAiTurns();
    });
  }

  // ------------------------------------------------------------ helpers

  private readonly controllers = (player: number): PlayerController | null =>
    player === this.human ? null : this.ai;

  private targets(): HookTarget[] {
    const hero = this.hero();
    if (hero === undefined) return [];
    const out: HookTarget[] = [];
    for (const o of displayObjects(this.state)) {
      if (!HOOK_KINDS.has(o.kind)) continue;
      const path = findPath(this.state, hero.id, o.x, o.y);
      if (path === null) continue;
      out.push({
        id: o.id,
        kind: o.kind,
        ...(typeof o.data["type"] === "string" ? { type: o.data["type"] } : {}),
        x: o.x,
        y: o.y,
        cost: path.total,
        today: path.steps.every((s) => s.day === 0),
      });
    }
    return out.sort((a, b) => a.cost - b.cost);
  }

  /** The client point of a cell's centre, or null when off the map view. */
  private cellToClient(x: number, y: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const p = this.view.cellToScreen(x, y);
    if (p.x < 0 || p.y < 0 || p.x > rect.width || p.y > rect.height)
      return null;
    return { x: rect.left + p.x, y: rect.top + p.y };
  }

  /** The selected hero (or the first of the human's heroes). */
  private hero(): HeroState | undefined {
    const own = heroesOf(this.state, this.human);
    return own.find((h) => h.id === this.selectedId) ?? own[0];
  }

  private player(): GameState["players"][number] | undefined {
    return this.state.players.find((p) => p.id === this.human);
  }

  private ownTowns(): string[] {
    return townsOf(this.state, this.human).map((t) => t.id);
  }

  /** The own town the selected hero stands in, if any. */
  private heroTownId(): string | undefined {
    const hero = this.hero();
    return this.ownTowns().find((id) =>
      this.state.map.objects.some(
        (o) => o.id === id && o.x === hero?.x && o.y === hero?.y,
      ),
    );
  }

  private get busy(): boolean {
    return this.busyFlag;
  }
  private set busy(on: boolean) {
    this.busyFlag = on;
    this.syncInput();
  }
  private get aiRunning(): boolean {
    return this.aiFlag;
  }
  private set aiRunning(on: boolean) {
    this.aiFlag = on;
    this.syncInput();
  }
  private get screenOpen(): boolean {
    return this.screenFlag;
  }
  private set screenOpen(on: boolean) {
    this.screenFlag = on;
    this.syncInput();
  }
  private get finished(): boolean {
    return this.finishedFlag;
  }
  private set finished(on: boolean) {
    this.finishedFlag = on;
    this.syncInput();
  }

  /**
   * The map's terrain animates (bead bzc.83) when the setting says so and
   * no town, battle or end screen covers the map.
   */
  private syncTerrainMotion(): void {
    this.view.setTerrainMotion(
      terrainAnimated() && !this.screenOpen && !this.finished,
    );
  }

  /** The map takes input only while the human could act (bead xaj.18). */
  private syncInput(): void {
    const blocked = this.inputBlocked();
    this.view.setInputEnabled(!blocked);
    this.syncTerrainMotion();
    // No action cursor while walking, fighting or in a dialog (UI2-07).
    if (blocked && this.hoverAction !== null) this.renderHint();
    // A map card pinned by right-click goes with the map's input (UI2-18).
    if (blocked) unpinTip(this.canvas);
  }

  private inputBlocked(): boolean {
    return (
      this.busy ||
      this.aiRunning ||
      this.screenOpen ||
      modalOpen() ||
      this.finished
    );
  }

  /** Applies a command; toasts its message when it failed. */
  private run(result: CommandResult): GameEvent[] | null {
    if (!result.ok) {
      toast(result.message);
      return null;
    }
    this.state = result.state;
    this.refresh();
    return result.events;
  }

  private centreOnTown(): void {
    const id = this.ownTowns()[0];
    const obj = this.state.map.objects.find((o) => o.id === id);
    if (obj !== undefined) this.view.centerOn(obj.x, obj.y);
  }

  // ------------------------------------------------------------ layout

  private buildSide(): void {
    const tips: Array<[string, string, () => void, string, SideGlyph]> = [
      [
        "Next",
        "H",
        () => this.nextHero(),
        "Select the next hero with movement left (H).",
        "next",
      ],
      [
        "Kingdom",
        "K",
        () => void this.kingdom(),
        "Kingdom overview: towns, heroes, mines, income and rivals (K).",
        "kingdom",
      ],
      [
        "Spells",
        "M",
        () => void this.spellbook(),
        "The selected hero's spellbook: cast adventure spells (M).",
        "spells",
      ],
      [
        "Dig",
        "G",
        () => void this.dig(),
        "Dig for buried treasure on the hero's cell (G).",
        "dig",
      ],
      [
        "Log",
        "L",
        () => void this.showLog(),
        "What happened recently, the other players' turns included (L).",
        "log",
      ],
      [
        "Menu",
        "O",
        () => void this.gameMenu(),
        "Save, load, sound settings and quit (O).",
        "menu",
      ],
    ];
    const buttons = el("div.gm-side-buttons");
    for (const [label, key, run, tip, icon] of tips) {
      const b = keyButton(label, key, run);
      b.prepend(glyph(icon));
      buttons.append(setTip(b, tip));
    }
    const endTurnButton = keyButton(
      "End turn",
      "E",
      () => void this.endTurn(),
      "gm-btn gm-primary gm-end-turn",
    );
    endTurnButton.prepend(glyph("end"));
    setTip(endTurnButton, () => {
      const warnings = endTurnWarnings(
        this.state,
        this.human,
        this.plannedPaths(),
      );
      return tipCard(
        "End turn",
        warnings.length === 0
          ? ["Everything is done for today."]
          : warnings.map((w) => w.text),
        { subtitle: "The other players move, then a new day starts." },
      );
    });
    this.side.append(
      this.turnPanel,
      this.minimap.canvas,
      this.heroList,
      this.townPanel,
      this.heroPanel,
      el("div.gm-side-foot", buttons, endTurnButton),
    );
  }

  /** Rich tooltip of one resource: stock, income by source, mines. */
  private resourceTip(r: ResourceId): HTMLElement {
    const player = this.player();
    const total = dailyIncome(this.state, this.human);
    const parts = incomeBreakdown(this.state, this.human, total);
    const rows = el("div.gm-tip-res");
    const add = (label: string, n: number): void => {
      if (n <= 0) return;
      rows.append(el("span", label), el("span", `+${n}`));
    };
    add("Towns", parts.towns[r]);
    const mines = minesOf(this.state, this.human, r);
    add(mines > 0 ? `Mines (${mines})` : "Mines", parts.mines[r]);
    add("Heroes and artifacts", parts.heroes[r]);
    return tipCard(
      RESOURCE_NAMES[r],
      [
        `You have ${player?.resources[r] ?? 0}.`,
        el("div.gm-tip-section", `Income +${total[r]} per day`),
        rows.childElementCount > 0
          ? rows
          : el(
              "div.gm-tip-dim",
              r === "gold"
                ? "Build halls in your towns for gold."
                : `Flag a ${MINES[r].name} for +${MINES[r].income} a day.`,
            ),
      ],
      { icon: resourceIcon(r) },
    );
  }

  private resourceBar(): HTMLElement {
    const player = this.player();
    const income = dailyIncome(this.state, this.human);
    const bar = el("div.gm-resources");
    // Every resource, a zero greyed, the daily income always under it (UI2-07).
    for (const r of RESOURCE_IDS) {
      const have = player?.resources[r] ?? 0;
      const item = el(
        "div.gm-res",
        resourceIcon(r),
        el(
          "span.gm-res-text",
          el("span.gm-res-amount", String(have)),
          el("span.gm-res-income", `+${income[r]}`),
        ),
      );
      if (have <= 0) item.classList.add("gm-res-zero");
      if (income[r] <= 0) item.classList.add("gm-res-no-income");
      item.setAttribute(
        "aria-label",
        `${RESOURCE_NAMES[r]} ${have}, +${income[r]} a day`,
      );
      item.querySelector("img")?.removeAttribute("title");
      item.tabIndex = 0;
      setTip(item, () => this.resourceTip(r));
      bar.append(item);
    }
    return bar;
  }

  /**
   * The line under the map: what a click on the hovered cell does (UI2-07),
   * else what to do next or the planned walk.
   */
  private hintText(): string {
    if (this.hoverAction !== null && this.hoverAction.text !== "")
      return this.hoverAction.text;
    const hero = this.hero();
    const planned =
      this.plan !== null && hero !== undefined
        ? pathSummary(this.plan.path, hero)
        : null;
    if (this.aiming !== null) return aimHint(this.aiming.spell);
    return nextActionHint(this.state, this.human, hero, planned);
  }

  private renderHint(): void {
    this.updateHoverAction();
    const kind = this.hoverAction?.cursor ?? "none";
    const url =
      kind === "none" || this.hoverAction?.text === ""
        ? null
        : cursorImage(kind);
    const icon = url === null ? null : el("img.gm-hint-icon");
    if (icon !== null) {
      icon.src = url ?? "";
      icon.alt = "";
    }
    this.hint.className = `gm-hint-line gm-hint-${kind}`;
    this.hint.replaceChildren(
      ...(icon === null ? [] : [icon]),
      el("span.gm-hint-text", this.hintText()),
    );
    this.renderPlanMeter();
  }

  private renderBar(): void {
    // "Month 1 · Week 1 · Day 1", the day emphasised (UI2-07).
    const c = calendar(this.state.day);
    const date = el(
      "div.gm-date",
      el("span.gm-date-month", `Month ${c.month} · Week ${c.week} · `),
      el("span.gm-date-day", `Day ${c.dayOfWeek}`),
    );
    setTip(date, () => {
      const c = calendar(this.state.day);
      return tipCard(dateLabel(this.state.day), [
        `Day ${this.state.day} of the game.`,
        c.dayOfWeek === 7
          ? "A new week starts tomorrow: dwellings grow and taverns refresh."
          : `${8 - c.dayOfWeek} days to the new week: dwellings grow and taverns refresh.`,
      ]);
    });
    this.renderHint();
    this.bar.replaceChildren(this.resourceBar(), this.hint, date);
  }

  private renderTurn(): void {
    const current = this.state.currentPlayer;
    const colour = playerColour(current);
    const mine = current === this.human;
    const chip = el("span.gm-turn-chip");
    chip.style.background = colour.hex;
    const faction = findFaction(
      this.state.players.find((p) => p.id === current)?.faction ?? "",
    );
    this.turnPanel.replaceChildren(
      chip,
      el(
        "span.gm-turn-text",
        mine ? "Your turn" : `${colour.name} is thinking...`,
      ),
      el("span.gm-turn-faction", faction?.name ?? ""),
    );
    this.turnPanel.classList.toggle("gm-turn-ai", !mine);
    this.banner.replaceChildren();
    this.banner.style.display = this.aiRunning ? "flex" : "none";
    if (this.aiRunning) {
      const dot = el("span.gm-turn-chip");
      dot.style.background = colour.hex;
      this.banner.append(
        dot,
        el("span", `${colour.name} player is thinking...`),
      );
    }
  }

  private heroTip(h: HeroState): HTMLElement {
    return mapCardView(heroCard(this.state, h, this.human, this.hero()?.id));
  }

  private renderHeroList(): void {
    this.heroList.replaceChildren();
    const own = heroesOf(this.state, this.human);
    const selected = this.hero();
    const rows = el("div.gm-hero-rows");
    const bar = (kind: "mp" | "mana", fill: number): HTMLElement => {
      const b = el(`span.gm-hero-row-bar.gm-${kind}`);
      b.style.setProperty("--fill", `${fill}%`);
      return b;
    };
    // Bead bzc.94: a framed 48 px portrait between a movement bar (left)
    // and a mana bar (right), as Heroes' hero list; the name is in the
    // hover card, the label and the selected hero's card below.
    for (const h of own) {
      const row = heroRow(h);
      const item = el(
        "button.gm-hero-row",
        bar("mp", row.mpPct),
        el(
          "span.gm-hero-row-frame",
          img(
            namedHeroPortrait(h.defId, h.heroClass).key,
            "gm-hero-row-portrait",
          ),
        ),
        bar("mana", row.manaPct),
        el("span.gm-hero-row-name", h.name),
      );
      item.type = "button";
      item.setAttribute(
        "aria-label",
        `${h.name}: moves ${row.mp} of ${row.maxMp}, mana ${row.mana} of ${row.maxMana}`,
      );
      if (row.levelUp) item.append(el("span.gm-hero-row-up", "+"));
      setTip(item, () => this.heroTip(h));
      if (h.id === selected?.id) item.classList.add("gm-selected");
      if (row.tired) item.classList.add("gm-tired");
      item.addEventListener("click", () => this.selectHero(h.id));
      item.addEventListener("dblclick", () => void this.heroScreen(h.id));
      rows.append(item);
    }
    this.heroList.append(
      el("div.gm-side-label", `Heroes ${own.length} / ${MAX_HEROES}`),
      own.length === 0
        ? el("div.gm-dim", "No heroes: hire one in a town's tavern.")
        : rows,
    );
  }

  private renderHeroPanel(): void {
    const hero = this.hero();
    this.heroPanel.replaceChildren();
    this.mpMeter = null;
    if (hero === undefined) return;
    const cls = getHeroClass(hero.heroClass);
    const portrait = img(
      namedHeroPortrait(hero.defId, hero.heroClass).key,
      "gm-hero-portrait",
    );
    setTip(portrait, "Centre the map on the hero. Double-click: hero sheet.");
    // Right-click: the hero's own card, as in the hero list (UI2-18).
    setPinTip(portrait, () => this.heroTip(hero));
    portrait.addEventListener("click", () => this.selectHero(hero.id));
    portrait.addEventListener("dblclick", () => void this.heroScreen(hero.id));
    const nextXp = xpForLevel(hero.level + 1);
    const prevXp = xpForLevel(hero.level);
    const pct = (n: number, d: number): number =>
      Math.max(0, Math.min(100, (n / Math.max(1, d)) * 100));
    const st = heroStats(hero);
    // Four stat cells: the stat icon and the number (UI2-06).
    const statLine = el("div.gm-hero-statline");
    for (const stat of PRIMARY_STATS) {
      const icon = iconElement("stat", stat, { className: "gm-stat-icon" });
      icon.removeAttribute("title");
      const cell = el(
        "span.gm-stat",
        icon,
        el("span.gm-stat-value", String(st[stat])),
      );
      cell.setAttribute("aria-label", `${STAT_NAMES[stat]} ${st[stat]}`);
      setTip(cell, `${STAT_NAMES[stat]} ${st[stat]}`);
      statLine.append(cell);
    }
    const sheet = keyButton(
      "Hero sheet",
      "I",
      () => void this.heroScreen(hero.id),
      "gm-btn gm-hero-sheet",
    );
    sheet.prepend(glyph("sheet"));
    if (hero.pendingLevelUps > 0) sheet.classList.add("gm-attention");
    // Moves, mana and XP as three bars in one row, the numbers inside.
    const meter = (
      kind: string,
      fillPct: number,
      label: string,
      tip: string,
    ): HTMLElement => {
      const bar = el(`div.gm-hero-meter.gm-${kind}`, label);
      bar.style.setProperty("--fill", `${fillPct}%`);
      return setTip(bar, tip);
    };
    const head = el(
      "div.gm-hero-stats",
      el("div.gm-hero-name", hero.name),
      el("div.gm-hero-class", `Level ${hero.level} ${cls.name}`),
      sheet,
    );
    this.mpMeter = meter(
      "mp",
      pct(hero.mp, hero.maxMp),
      `Moves ${hero.mp} / ${hero.maxMp}`,
      "Movement left today. Roads are cheaper; forest, swamp and rough ground cost more. A planned walk shows today's share in gold.",
    );
    this.heroPanel.append(
      el("div.gm-hero-top", portrait, head),
      statLine,
      el(
        "div.gm-hero-meters",
        this.mpMeter,
        meter(
          "mana",
          pct(hero.mana, maxMana(hero)),
          `Mana ${hero.mana} / ${maxMana(hero)}`,
          "Mana for spells. It returns each day; Lore raises the maximum.",
        ),
        meter(
          "xp",
          pct(hero.xp - prevXp, nextXp - prevXp),
          `XP ${hero.xp} / ${nextXp}`,
          `Experience to level ${hero.level + 1}.`,
        ),
      ),
      armyRow(hero.army, { small: true }),
    );
    this.heroPanel.classList.add("gm-selected");
    this.renderPlanMeter();
  }

  /**
   * The movement numbers of a planned walk live on the hero card's bar
   * (UI2-07): today's share of the plan in gold, "Moves 1500 → 1080".
   */
  private renderPlanMeter(): void {
    const bar = this.mpMeter;
    const hero = this.hero();
    if (bar === null || hero === undefined) return;
    const today =
      this.plan?.path.steps.filter((s) => s.day === 0).at(-1)?.total ?? 0;
    const spend = Math.max(0, Math.min(hero.mp, today));
    const pct = (n: number): string =>
      `${Math.max(0, Math.min(100, (n / Math.max(1, hero.maxMp)) * 100))}%`;
    bar.style.setProperty("--fill", pct(hero.mp));
    bar.style.setProperty("--keep", pct(hero.mp - spend));
    if (spend > 0) bar.classList.add("gm-planned");
    else bar.classList.remove("gm-planned");
    bar.textContent =
      spend > 0
        ? `Moves ${hero.mp} → ${hero.mp - spend}`
        : `Moves ${hero.mp} / ${hero.maxMp}`;
  }

  /** A town's card (UI2-08): picture, income, garrison, today's work. */
  private townTip(id: string): HTMLElement | string {
    const card = townCard(this.state, this.human, id);
    return card === null ? "Town" : mapCardView(card);
  }

  private renderTownPanel(): void {
    this.townPanel.replaceChildren();
    const towns = this.ownTowns();
    const buildable = new Set(buildableTowns(this.state, this.human));
    const list = el("div.gm-town-list");
    towns.forEach((id, i) => {
      const row = townRow(this.state, id, buildable.has(id));
      if (row === null) return;
      const b = button("", () => void this.openTown(id), "gm-town-item");
      // Bead bzc.94: the town's picture (its map sprite on the faction's
      // backdrop) in a frame, a band in the faction colour on top, the
      // name under it; the growth flag and BUILD badge on the picture.
      b.style.setProperty("--crest", row.colour);
      const pic = el("span.gm-town-pic");
      if (row.backdrop !== null)
        pic.style.backgroundImage = `url("${imageUrl(row.backdrop)}")`;
      else pic.classList.add("gm-town-pic-plain");
      const sprite = img(row.art, "gm-town-pic-art");
      const at = row.thumb;
      sprite.style.width = `${at.width}px`;
      sprite.style.height = `${at.height}px`;
      sprite.style.left = `calc(50% + ${at.fromCentre}px)`;
      sprite.style.top = `${at.top}px`;
      pic.append(sprite);
      // Growth flag: creatures wait in the dwellings.
      if (row.ready > 0) {
        pic.append(
          el(
            "span.gm-town-grow",
            el("span.gm-town-grow-flag"),
            String(row.ready),
          ),
        );
      }
      if (row.build) pic.append(el("span.gm-town-build", "build"));
      if (i === 0) pic.append(kbd("T"));
      b.append(pic, el("span.gm-town-item-name", row.name));
      b.setAttribute(
        "aria-label",
        [
          row.name,
          row.ready > 0 ? `${row.ready} creatures to recruit` : "",
          row.build ? "can build today" : "",
        ]
          .filter((s) => s !== "")
          .join(", "),
      );
      setTip(b, () => this.townTip(id));
      list.append(b);
    });
    const player = this.player();
    this.townPanel.append(
      el("div.gm-side-label", `Towns ${towns.length}`),
      towns.length === 0 && player !== undefined
        ? el(
            "div.gm-warn",
            `No town! Out of the game in ${7 - player.townlessDays} days.`,
          )
        : list,
    );
  }

  /** Owner flags at town and mine entrances. */
  private flags(): MapFlag[] {
    const out: MapFlag[] = [];
    for (const obj of this.state.map.objects) {
      let owner: number | null = null;
      if (obj.kind === "town") owner = this.state.towns[obj.id]?.owner ?? null;
      else if (obj.kind === "mine")
        owner = this.state.mines[obj.id]?.owner ?? null;
      if (owner === null) continue;
      out.push({ x: obj.x, y: obj.y, colour: playerColour(owner).hex });
    }
    return out;
  }

  /** Re-syncs every part of the screen with the state. */
  private refresh(): void {
    const objects = displayObjects(this.state);
    const sig = objectsSignature(objects);
    if (sig !== this.objectsSig) {
      this.objectsSig = sig;
      this.view.setObjects(objects);
    }
    this.view.setFlags(this.flags());
    this.view.setExplored(this.player()?.explored ?? null);
    this.syncHeroes();
    this.renderBar();
    this.renderTurn();
    this.renderHeroList();
    this.renderHeroPanel();
    this.renderTownPanel();
    this.minimap.update(this.state, this.human);
    this.updateViewport();
  }

  private syncHeroes(
    moving?: { id: string; x: number; y: number },
    state: GameState = this.state,
  ): void {
    this.view.setHeroes(
      state.heroes
        .filter((h) => h.alive)
        .map((h) => ({
          id: h.id,
          x: h.id === moving?.id ? moving.x : h.x,
          y: h.id === moving?.id ? moving.y : h.y,
          unit: heroArt(h.heroClass).key,
          colour: playerColour(h.owner).hex,
        })),
    );
  }

  private updateViewport(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const centre = this.view.screenToCell(w / 2, h / 2);
    if (centre === null) return;
    const zoom = this.view.getZoom();
    this.minimap.setViewport({
      cx: centre.x + 0.5,
      cy: centre.y + 0.5,
      w: w / zoom / CELL_PX,
      h: h / zoom / CELL_PX,
    });
  }

  private onHover(cell: { x: number; y: number } | null): void {
    if (cell === null || this.inputBlocked()) {
      this.hovered = null;
      this.renderHint();
      hideTip();
      return;
    }
    this.hovered = cell;
    this.renderHint();
    this.showMapTip();
  }

  /**
   * The action cursor and the status line for the hovered cell (UI2-07):
   * walk, attack, visit, pick up (the hand of bzc.49), enter town, meet,
   * can't reach, or cast while a spell is aimed (bzc.47).
   */
  private updateHoverAction(): void {
    const cell = this.hovered;
    this.hoverAction =
      cell === null || this.inputBlocked()
        ? null
        : mapAction({
            state: this.state,
            player: this.human,
            heroId: this.hero()?.id ?? null,
            x: cell.x,
            y: cell.y,
            planned: this.plan,
            aiming: this.aiming,
          });
    this.canvas.style.cursor = cursorStyle(this.hoverAction?.cursor ?? "none");
  }

  /** A right-click on the map pins the card of the cell under it. */
  private onMapInspect(e: MouseEvent): void {
    e.preventDefault();
    if (this.inputBlocked()) return;
    const rect = this.canvas.getBoundingClientRect();
    const cell = this.view.screenToCell(
      e.clientX - rect.left,
      e.clientY - rect.top,
    );
    if (cell === null) return;
    pinTipAt(e.clientX, e.clientY, () => this.cellTip(cell), this.canvas);
  }

  private showMapTip(): void {
    const cell = this.hovered;
    if (cell === null || this.inputBlocked()) return;
    showTipAt(this.pointer.x, this.pointer.y, () => this.cellTip(cell));
  }

  /**
   * The hover card of a map cell (UI2-08): picture first, count and threat
   * words, what it gives, visited, and when the selected hero gets there.
   */
  private cellTip(cell: { x: number; y: number }): HTMLElement | null {
    const card = mapCard(
      this.state,
      this.human,
      cell.x,
      cell.y,
      this.hero()?.id,
    );
    return card === null ? null : mapCardView(card);
  }

  private readonly onResize = (): void => this.updateViewport();

  // ------------------------------------------------------------ input

  private readonly onKey = (e: KeyboardEvent): void => {
    if (this.inputBlocked() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement) return;
    switch (e.key) {
      case "e":
      case "E":
        e.preventDefault();
        void this.endTurn();
        break;
      case "h":
      case "H":
        this.nextHero();
        break;
      case "k":
      case "K":
        void this.kingdom();
        break;
      case "m":
      case "M":
        void this.spellbook();
        break;
      case "g":
      case "G":
        void this.dig();
        break;
      case "i":
      case "I":
        void this.heroScreen();
        break;
      case "t":
      case "T": {
        // The town the selected hero stands in, else the first town.
        const id = this.heroTownId() ?? this.ownTowns()[0];
        if (id !== undefined) void this.openTown(id);
        break;
      }
      case "l":
      case "L":
        void this.showLog();
        break;
      case "o":
      case "O":
        void this.gameMenu();
        break;
      case "?":
        void this.showKeys();
        break;
      case " ":
        e.preventDefault();
        void this.walk();
        break;
      case "+":
      case "=":
        this.zoomBy(1);
        break;
      case "-":
      case "_":
        this.zoomBy(-1);
        break;
      case "Escape":
        if (this.aiming !== null) this.stopAiming();
        else this.clearPlan();
        break;
      default:
        // Layouts without a plain +/- key: fall back to the key position.
        if (e.code === "Equal" || e.code === "NumpadAdd") this.zoomBy(1);
        if (e.code === "Minus" || e.code === "NumpadSubtract") this.zoomBy(-1);
        break;
    }
  };

  private zoomBy(delta: number): void {
    const steps = ZOOM_STEPS as readonly number[];
    const i = steps.indexOf(this.view.getZoom());
    const next = steps[Math.max(0, Math.min(steps.length - 1, i + delta))];
    if (next !== undefined) this.view.setZoom(next);
    this.updateViewport();
  }

  private selectHero(heroId: string): void {
    const hero = heroesOf(this.state, this.human).find((h) => h.id === heroId);
    if (hero === undefined) return;
    if (this.selectedId !== heroId) {
      this.clearPlan();
      // The aim belonged to the other hero.
      if (this.aiming !== null) this.stopAiming();
    }
    this.selectedId = heroId;
    void this.view.glideTo(hero.x, hero.y, reducedMotion());
    this.renderHeroList();
    this.renderHeroPanel();
    this.renderHint();
  }

  /** Cycles to the next hero, preferring heroes with movement left (H). */
  private nextHero(): void {
    const own = heroesOf(this.state, this.human);
    if (own.length === 0) return;
    const i = own.findIndex((h) => h.id === this.hero()?.id);
    const order = own.map((_, k) => own[(i + 1 + k) % own.length]);
    const next =
      order.find((h) => h !== undefined && h.mp >= SPENT_MP) ?? order[0];
    if (next !== undefined) this.selectHero(next.id);
  }

  /** The planned path by hero id (only the selected hero has one). */
  private plannedPaths(): Record<string, Path> {
    const hero = this.hero();
    return this.plan === null || hero === undefined
      ? {}
      : { [hero.id]: this.plan.path };
  }

  /** Leaves adventure-spell aiming: the glow goes, the hint returns. */
  private stopAiming(): void {
    this.aiming = null;
    this.view.setTargetCells(null);
    this.renderHint();
  }

  private clearPlan(): void {
    this.plan = null;
    this.view.setPathPreview(null);
    this.renderHint();
  }

  private showPlan(): void {
    this.renderHint();
    if (this.plan === null) {
      this.view.setPathPreview(null);
      return;
    }
    const hero = this.hero();
    this.view.setPathPreview(
      this.plan.path.steps.map((s) => ({
        x: s.x,
        y: s.y,
        reachable: s.day === 0,
      })),
      hero === undefined ? undefined : { x: hero.x, y: hero.y },
    );
  }

  private planTo(x: number, y: number): boolean {
    const hero = this.hero();
    if (hero === undefined) return false;
    // Behind a guard: the walk to the fight with it (bead bzc.77).
    const path = findPath(this.state, hero.id, x, y, PLAN_OPTIONS);
    if (path === null) {
      this.clearPlan();
      return false;
    }
    this.plan = { x, y, path };
    this.showPlan();
    return true;
  }

  private onMapClick(x: number, y: number): void {
    if (this.inputBlocked()) return;
    this.cancelPendingWalk();
    if (this.aiming !== null) {
      const aim = this.aiming;
      const hit = aim.aims.find((a) => a.x === x && a.y === y);
      if (hit === undefined) {
        // Not a valid target: keep aiming (Esc cancels).
        toast("Not a valid target: click a glowing cell, or Esc to cancel.");
        return;
      }
      if (hit.noEffect !== undefined) {
        // Legal but pointless (bzc.47 review): refused with the reason.
        toast(`No effect: ${hit.noEffect}. Click a glowing cell, or Esc.`);
        return;
      }
      this.stopAiming();
      const hero = this.hero();
      if (hero !== undefined) {
        const events = this.run(
          castAdventureSpell(this.state, hero.id, aim.spell, hit.target, {
            scroll: aim.scroll,
          }),
        );
        if (events !== null) {
          this.syncHeroes();
          toast(aim.spell === "ask-the-dead" ? "The dead answer." : "Cast.");
        }
      }
      return;
    }
    const hero = this.hero();
    const clicked = this.state.heroes.find(
      (h) => h.alive && h.owner === this.human && h.x === x && h.y === y,
    );
    if (clicked !== undefined && clicked.id !== hero?.id) {
      // Another own hero: meet it when side by side, else select it.
      if (
        hero !== undefined &&
        Math.max(Math.abs(hero.x - x), Math.abs(hero.y - y)) === 1
      ) {
        void this.meet(hero.id, clicked.id);
      } else this.selectHero(clicked.id);
      return;
    }
    const obj = objectAt(displayObjects(this.state), x, y);
    if (obj?.kind === "town") {
      this.onTownClick(obj, hero);
      return;
    }
    if (hero === undefined) return;
    if (hero.x === x && hero.y === y) {
      // Clicking the selected hero in its town opens the town.
      const town = Object.values(this.state.towns).find(
        (t) =>
          t.owner === this.human &&
          this.state.map.objects.some(
            (o) => o.id === t.id && o.x === x && o.y === y,
          ),
      );
      if (town !== undefined) {
        void this.openTown(town.id);
        return;
      }
      this.clearPlan();
      this.renderHeroPanel();
      return;
    }
    // Clicking any cell of a mine or site targets its entrance.
    const { x: tx, y: ty } = clickTarget(obj, x, y);
    if (this.plannedTo(tx, ty)) {
      void this.walk();
      return;
    }
    this.planWithToast(tx, ty);
  }

  private plannedTo(x: number, y: number): boolean {
    return this.plan !== null && this.plan.x === x && this.plan.y === y;
  }

  /** Plans the selected hero's path, saying when it ends in a fight. */
  private planWithToast(x: number, y: number): void {
    if (!this.planTo(x, y)) {
      toast("No way there");
      return;
    }
    // Behind a guard (bead bzc.77): the same words as the status line.
    const hero = this.hero();
    const blocked =
      hero === undefined || this.plan === null
        ? null
        : blockedWords(this.state, hero, this.plan.path);
    if (blocked !== null) {
      toast(`${blocked}. ${clickAgain(true)}`);
      return;
    }
    // Past a visit or a pickup in the way (bead bzc.79).
    const stops =
      this.plan === null ? null : stopsWords(this.state, this.plan.path);
    if (stops !== null) {
      toast(`${stops}. Click again to go.`);
      return;
    }
    const guard = this.planGuard();
    if (guard !== null) toast(`${guard}. ${clickAgain(true)}`);
  }

  /**
   * A click on any cell of a town (map-clicks.ts): plan or walk there, or
   * open an own town on a double-click, with no hero, or with the hero
   * inside. The second click of a double-click puts back the plan the
   * first one replaced, so the hero neither walks nor keeps a new path.
   */
  private onTownClick(obj: MapObject, hero: HeroState | undefined): void {
    const now = performance.now();
    const last = this.lastTownClick;
    const double = isDoubleClick(last, obj.id, now);
    this.lastTownClick = double
      ? null
      : { key: obj.id, at: now, plan: this.plan };
    const action = townClickAction({
      own: this.state.towns[obj.id]?.owner === this.human,
      heroSelected: hero !== undefined,
      heroInTown: hero !== undefined && hero.x === obj.x && hero.y === obj.y,
      plannedHere: this.plannedTo(obj.x, obj.y),
      double,
    });
    switch (action) {
      case "open":
        if (double && last !== null) {
          this.plan = last.plan;
          this.showPlan();
        }
        void this.openTown(obj.id);
        return;
      case "walk":
        void this.walk();
        return;
      case "walk-later":
        this.pendingWalk = window.setTimeout(() => {
          this.pendingWalk = 0;
          if (this.plannedTo(obj.x, obj.y)) void this.walk();
        }, DOUBLE_CLICK_MS);
        return;
      case "plan":
        this.planWithToast(obj.x, obj.y);
        return;
      case "none":
        return;
    }
  }

  private cancelPendingWalk(): void {
    if (this.pendingWalk === 0) return;
    window.clearTimeout(this.pendingWalk);
    this.pendingWalk = 0;
  }

  /** Who the planned walk ends up fighting, as "a pack of 11 Skeletons". */
  private planGuard(): string | null {
    if (this.plan === null) return null;
    // A pickup in a zone of control is fought for first (bead bzc.49).
    const guard = pathGuard(this.state, this.plan.path);
    if (guard === null) return null;
    if (guard.kind === "hero")
      return `${guard.hero.name} of ${playerColour(guard.hero.owner).name} stands there`;
    return `Guarded by ${stackPhrase(guard.creature, guard.count)}`;
  }

  // ------------------------------------------------------------ walking

  private async walk(): Promise<void> {
    if (this.inputBlocked() || this.plan === null) return;
    const hero = this.hero();
    if (hero === undefined) return;
    const target = { x: this.plan.x, y: this.plan.y };
    const result = moveHeroAlong(this.state, hero.id, this.plan.path.steps);
    if (!result.ok) {
      toast(result.message);
      this.clearPlan();
      return;
    }
    const moved = result.events.find((e) => e.type === "moved");
    if (
      moved?.type === "moved" &&
      moved.cells.length === 0 &&
      moved.stop === "no-mp"
    ) {
      toast("No movement points left today (E ends the turn)");
      return;
    }
    this.busy = true;
    closeTips();
    // The camera comes back to the hero first if the player looked away.
    await this.view.glideTo(hero.x, hero.y, reducedMotion());
    if (moved?.type === "moved") await this.animateWalk(hero, moved.cells);
    this.state = result.state;
    const arrived = !(moved?.type === "moved" && moved.stop === "no-mp");
    this.busy = false;
    this.refresh();
    if (arrived) this.clearPlan();
    else if (!this.planTo(target.x, target.y)) this.clearPlan();
    await this.afterCommand(result.events);
  }

  private async animateWalk(
    hero: HeroState,
    cells: ReadonlyArray<[number, number]>,
  ): Promise<void> {
    const { map } = this.state;
    const explored = [...(this.player()?.explored ?? [])];
    const remaining = this.plan?.path.steps.slice() ?? [];
    const sight = sightRadius(hero);
    let prev = { x: hero.x, y: hero.y };
    for (const [x, y] of cells) {
      for (
        let yy = Math.max(0, y - sight);
        yy <= Math.min(map.height - 1, y + sight);
        yy++
      ) {
        for (
          let xx = Math.max(0, x - sight);
          xx <= Math.min(map.width - 1, x + sight);
          xx++
        ) {
          if (inSight(xx - x, yy - y, sight))
            explored[yy * map.width + xx] = true;
        }
      }
      while (
        remaining.length > 0 &&
        !(remaining[0]?.x === x && remaining[0]?.y === y)
      )
        remaining.shift();
      remaining.shift();
      this.view.setPathPreview(
        remaining.map((s) => ({ x: s.x, y: s.y, reachable: s.day === 0 })),
        { x, y },
      );
      this.view.setExplored(explored);
      this.syncHeroes({ id: hero.id, x, y });
      const still = reducedMotion();
      if (still) this.view.centerOn(x, y);
      this.updateViewport();
      playSound("hero.step", { jitter: 0.08 });
      if (!still) fxEvent("map.walk.bob");
      // The sprite walks from the last cell with a bob, the camera following.
      await this.view.walkHero(hero.id, prev, { x, y }, STEP_MS, still);
      prev = { x, y };
    }
  }

  // ------------------------------------------------------------ events

  /**
   * A visit's outcome (bead bzc.81): a plain pickup floats over the hero;
   * anything else is logged and queued as a dialog the player dismisses
   * ({@link showResults}).
   */
  private present(result: VisitResult, heroId: string): void {
    if (result.show === "float") {
      this.noteAtHero(result.text, "gain", heroId);
      return;
    }
    this.note(result.text, "quiet");
    this.results.push(result);
  }

  /** Shows the queued outcome dialogs one by one. */
  private async showResults(): Promise<void> {
    while (this.results.length > 0) {
      const r = this.results.shift();
      if (r === undefined) break;
      const choice = await resultDialog(r);
      if (choice === "show" && r.area !== null) this.markArea(r.area);
    }
  }

  /**
   * A rumour's area (bead bzc.81): the camera glides there and its cells
   * pulse for a few seconds.
   */
  private markArea(area: VisitArea): void {
    if (this.aiming !== null) return;
    window.clearTimeout(this.markTimer);
    this.view.setTargetCells(areaCells(area));
    void this.view.glideTo(
      area.x + Math.floor(area.w / 2),
      area.y + Math.floor(area.h / 2),
      reducedMotion(),
    );
    this.markTimer = window.setTimeout(() => {
      if (this.aiming === null) this.view.setTargetCells(null);
    }, AREA_MARK_MS);
  }

  /**
   * The human's heroes' new pages (bead bzc.81), then, once a game, why a
   * hero with no school learnt nothing in a guild town it entered.
   */
  private async learnt(events: readonly GameEvent[]): Promise<void> {
    await showLearnt(this.state, events, this.human);
    if (this.noSchoolExplained) return;
    for (const e of events) {
      if (e.type !== "visit-town") continue;
      const hero = this.state.heroes.find((h) => h.id === e.heroId);
      if (hero?.owner !== this.human) continue;
      const learnt = events.some(
        (x) => x.type === "spells-learnt" && x.heroId === e.heroId,
      );
      if (learnt || !learnsNothingForNoSchool(this.state, e.heroId, e.townId))
        continue;
      const model = noSchoolModel(this.state, e.heroId, e.townId);
      if (model === null) continue;
      this.noSchoolExplained = true;
      await noSchoolDialog(
        model,
        namedHeroPortrait(hero.defId, hero.heroClass).key,
      );
      return;
    }
  }

  /** Toasts and sounds for events that concern the human. */
  private announce(events: readonly GameEvent[], sites = true): void {
    for (const e of events) {
      switch (e.type) {
        case "pickup":
          if (this.state.currentPlayer !== this.human) break;
          playSound(pickupCue(e.resource));
          // The flying pickup is the toast; without it the line floats up.
          if (this.flyPickup(e.resource, e.amount))
            this.note(
              `+${e.amount} ${RESOURCE_NAMES[e.resource].toLowerCase()}`,
              "quiet",
            );
          else
            this.noteAtHero(
              `+${e.amount} ${RESOURCE_NAMES[e.resource].toLowerCase()}`,
            );
          break;
        case "mine-flagged": {
          const mine = this.state.mines[e.mineId];
          if (mine === undefined) break;
          const def = MINES[mine.resource];
          // The flag going up is the sound (map.flag.raise).
          this.flagRaised(e.mineId);
          if (e.owner === this.human) {
            this.noteAtHero(
              `${def.name} claimed: +${def.income} ${mine.resource} per day`,
            );
          } else if (this.aiRunning) {
            this.note(
              `${playerColour(e.owner).name} flags a ${def.name}`,
              "quiet",
            );
          }
          break;
        }
        case "battle-error":
          toast(`The battle could not be settled and was void: ${e.message}`);
          break;
        case "last-stand": {
          const { attacker, defender } = battlePlayers(this.state, e.battle);
          if (attacker !== this.human && defender !== this.human) break;
          toast(
            `Both armies fell at once; ${stackPhrase(e.creature, 1)} held the field.`,
          );
          break;
        }
        case "xp":
          if (
            this.state.heroes.find((h) => h.id === e.heroId)?.owner ===
            this.human
          )
            this.noteAtHero(`+${e.amount} experience`, "gain", e.heroId);
          break;
        case "town-captured": {
          const name = this.state.towns[e.townId]?.name ?? "Town";
          this.flagRaised(e.townId);
          if (e.owner === this.human) {
            playSound("new-week");
            this.note(`${name} captured!`, "gain");
          } else if (e.from === this.human) {
            this.note(`${name} has fallen to ${playerColour(e.owner).name}!`);
          }
          break;
        }
        case "hero-defeated":
        case "hero-retreated": {
          const h = this.state.heroes.find((x) => x.id === e.heroId);
          if (h === undefined) break;
          if (h.owner === this.human) {
            this.note(
              e.type === "hero-retreated"
                ? `${h.name} retreats to the tavern`
                : `${h.name} has fallen`,
            );
          } else {
            this.note(
              `${h.name} of ${playerColour(h.owner).name} is beaten`,
              "gain",
            );
          }
          break;
        }
        case "artifacts-won":
          if (e.artifacts.length > 0)
            this.note(`${e.artifacts.length} artifacts taken`, "gain");
          break;
        case "site": {
          // A choice's outcome is read in its dialog (siteChoice).
          if (!sites) break;
          const h = this.state.heroes.find((x) => x.id === e.heroId);
          const obj = this.state.map.objects.find((o) => o.id === e.objectId);
          if (h?.owner === this.human && e.options === undefined) {
            this.siteSound(e.objectId, e.text);
            if (obj === undefined) {
              this.noteAtHero(e.text, "gain", e.heroId);
              break;
            }
            this.present(
              siteResult(this.state, obj, e.text, e.area ?? null, h),
              e.heroId,
            );
          }
          break;
        }
        case "teleported": {
          const h = this.state.heroes.find((x) => x.id === e.heroId);
          if (h?.owner === this.human) {
            // A waystone or the Tow Line: the same magical rush.
            playSound("site.waystone");
            // The camera follows the hero to where it lands.
            void this.view.glideTo(e.x, e.y, reducedMotion());
            this.note(
              e.via === "tow-line"
                ? "The tow line hauls you to the pylon."
                : "The waystone carries you.",
            );
          }
          break;
        }
        case "dug":
          if (
            this.state.heroes.find((h) => h.id === e.heroId)?.owner ===
            this.human
          ) {
            playSound("site.dig", { jitter: 0.05 });
            // What turns up opens after the spade.
            if (e.found !== null) playSound("site.treasure", { delay: 0.3 });
          }
          this.present(digResult(e.found), e.heroId);
          break;
        case "hero-freed":
          // The prison's own line says who joins, in a dialog.
          if (e.player === this.human)
            this.note("A prisoner joins you!", "quiet");
          break;
        case "player-eliminated":
          if (e.player !== this.human)
            this.note(
              `${playerColour(e.player).name} is out of the game!`,
              "week",
            );
          break;
        default:
          break;
      }
    }
  }

  /** Reacts to a command's events, then any pending battle or level-up. */
  private async afterCommand(events: readonly GameEvent[]): Promise<void> {
    this.busy = true;
    try {
      let openTown: string | null = null;
      this.announce(events);
      // What the visit said, then what a guild taught (bead bzc.81).
      await this.showResults();
      await this.learnt(events);
      for (const e of events) {
        if (e.type === "chest-offer") await this.chest(e.heroId, e.pickupId);
        if (e.type === "site" && e.options !== undefined) {
          await this.siteChoice(e.heroId, e.objectId, e.text);
        }
        if (e.type === "visit-town") openTown = e.townId;
      }
      await this.levelUps();
      if (this.state.pendingBattle !== null) {
        this.bankFightSound();
        await this.battles();
        return;
      }
      if (this.checkEnd()) return;
      if (openTown !== null && this.state.status === "playing") {
        this.busy = false;
        await this.openTown(openTown);
      }
    } finally {
      this.busy = false;
    }
  }

  /**
   * A map object's choice (bead bzc.13): its options as buttons, plus
   * "Leave"; picking one runs useSite and asks again while an option is
   * still open (a dwelling, a tollhouse), the outcome leading the next
   * question. When nothing is left to pick, the outcome shows on its own
   * (bead bzc.81): a dialog to dismiss, or a float for a plain one (a
   * hire, a sale). A rumour always gets its own dialog (Show on map).
   */
  private async siteChoice(
    heroId: string,
    objectId: string,
    text: string,
  ): Promise<void> {
    let last: string | null = null;
    for (let round = 0; round < 12; round++) {
      const hero = this.state.heroes.find((h) => h.id === heroId);
      const obj = this.state.map.objects.find((o) => o.id === objectId);
      if (hero === undefined || obj === undefined) return;
      if (hero.owner !== this.human) return;
      const model = siteDialogModel(
        this.state,
        hero,
        obj,
        text,
        round === 0,
        last,
      );
      if (model.choices.length === 0) return;
      const choice = await siteDialog(model);
      if (choice === "") return;
      const events = this.run(useSite(this.state, heroId, objectId, choice));
      if (events === null) return;
      this.announce(events, false);
      this.refresh();
      const lines = events.filter(
        (e): e is Extract<GameEvent, { type: "site" }> =>
          e.type === "site" && e.heroId === heroId,
      );
      for (const e of lines) this.siteSound(e.objectId, e.text);
      last = lines.map((e) => e.text).join(" ") || null;
      const after = this.state.heroes.find((h) => h.id === heroId);
      const results = lines.map((e) =>
        siteResult(this.state, obj, e.text, e.area ?? null, after),
      );
      const again =
        after !== undefined &&
        results.every((r) => r.area === null) &&
        siteDialogModel(this.state, after, obj, text, false, last).choices.some(
          (c) => !c.disabled,
        );
      if (again) {
        for (const e of lines) this.note(e.text, "quiet");
        continue;
      }
      for (const r of results) this.present(r, heroId);
      await this.showResults();
      return;
    }
  }

  /** Digs on the selected hero's cell (CONTENT_MAP_OBJECTS section 4). */
  private async dig(): Promise<void> {
    if (this.inputBlocked()) return;
    const hero = this.hero();
    if (hero === undefined) return;
    const events = this.run(digHere(this.state, hero.id));
    if (events === null) return;
    this.refresh();
    await this.afterCommand(events);
  }

  /** The family sound of a visit's outcome (audio/cues.ts siteCue). */
  private siteSound(objectId: string, text: string): void {
    const obj = this.state.map.objects.find((o) => o.id === objectId);
    if (obj === undefined) return;
    const cue = siteCue(objectTypeOf(obj), text);
    if (cue !== null) playSound(cue);
  }

  /** A sword drawn as the human's hero takes on a bank's guard. */
  private bankFightSound(): void {
    const b = this.state.pendingBattle;
    if (b === null || b.kind !== "site") return;
    const obj = this.state.map.objects.find((o) => o.id === b.objectId);
    const hero = this.state.heroes.find((h) => h.id === b.heroId);
    if (obj?.kind === "bank" && hero?.owner === this.human)
      playSound("site.bank");
  }

  private async chest(heroId: string, pickupId: string): Promise<void> {
    playSound("site.treasure");
    const choice = await modal<"gold" | "xp">({
      title: CHEST.name,
      picture: img("treasure", "gm-chest-img", 2),
      sentence:
        "You find a chest of the old warlords. Take the gold, or study the maps and trophies inside?",
      buttons: [
        { label: `${CHEST.gold} gold`, value: "gold", primary: true },
        { label: `${CHEST.xp} experience`, value: "xp", key: "X" },
      ],
    });
    const events = this.run(takeChest(this.state, heroId, pickupId, choice));
    if (events === null) return;
    playSound(choice === "gold" ? "gold" : "pickup");
    for (const e of events) {
      if (e.type === "pickup")
        this.noteAtHero(`+${e.amount} gold`, "gain", heroId);
      if (e.type === "xp")
        this.noteAtHero(`+${e.amount} experience`, "gain", heroId);
    }
  }

  /**
   * A resource picked up flies from the hero to its place in the bar;
   * false when nothing flew (reduced motion, the hero off screen).
   */
  private flyPickup(resource: ResourceId, amount: number): boolean {
    const i = RESOURCE_IDS.indexOf(resource);
    const slot = this.bar.querySelectorAll<HTMLElement>(".gm-res")[i];
    const amountEl = slot?.querySelector<HTMLElement>(".gm-res-amount");
    const hero = this.hero();
    const total = this.player()?.resources[resource] ?? 0;
    if (!slot || !amountEl || hero === undefined || reducedMotion())
      return false;
    const from = this.cellToClient(hero.x, hero.y);
    if (from === null) return false;
    amountEl.textContent = String(total - amount);
    const icon = resourceIcon(resource, "gm-fly-icon");
    const node = el("div.gm-fly-pickup", icon, el("span", `+${amount}`));
    fxEvent("map.pickup.fly");
    void flyTo(node, { x: from.x - 14, y: from.y - 30 }, slot).then(() => {
      fxEvent("map.pickup.land");
      bump(slot);
      if (amountEl.isConnected)
        void countUp(
          amountEl,
          total - amount,
          total,
          520,
          String,
          "map.count.tick",
        );
    });
    return true;
  }

  /** Gold bursts round a hero who levels up; false under reduced motion. */
  private levelBurst(heroId: string): boolean {
    const hero = this.state.heroes.find((h) => h.id === heroId);
    if (hero === undefined || reducedMotion()) return false;
    fxEvent("map.levelup.burst");
    const c = this.view.cellCentre(hero.x, hero.y);
    this.view.spawnFx((field, clock) => {
      fxBurst(field, clock, { x: c.x, y: c.y + 4 }, PALETTES.gold, 22);
      fxSparkle(
        field,
        clock,
        { x: c.x, y: c.y - 24 },
        "spark",
        PALETTES.gold,
        8,
        22,
      );
    });
    return true;
  }

  /** A flag goes up at an object the moment it is captured. */
  private flagRaised(objectId: string): void {
    const obj = this.state.map.objects.find((o) => o.id === objectId);
    if (obj === undefined) return;
    const seen = this.player()?.explored[obj.y * this.state.map.width + obj.x];
    if (seen !== true) return;
    // The flag sounds under reduced motion too; only the animation stops.
    fxEvent("map.flag.raise");
    if (reducedMotion()) return;
    this.view.raiseFlag(obj.x, obj.y);
    const c = this.view.cellCentre(obj.x, obj.y);
    this.view.spawnFx((field, clock) =>
      fxSparkle(
        field,
        clock,
        { x: c.x - 24, y: c.y - 30 },
        "spark",
        PALETTES.gold,
        6,
        12,
      ),
    );
  }

  /**
   * Offers the human's pending level-ups one by one, also once the game is
   * won (the final battle's levels come before the victory screen).
   */
  private async levelUps(): Promise<void> {
    for (;;) {
      if (this.state.status === "lost" || this.finished) return;
      const hero = heroesOf(this.state, this.human).find(
        (h) => h.pendingLevelUps > 0,
      );
      if (hero === undefined) return;
      const offer = levelUpOffer(this.state, hero.id);
      if (offer === null) return;
      playSound("level-up");
      if (this.levelBurst(hero.id)) await wait(420);
      const portrait = namedHeroPortrait(hero.defId, hero.heroClass).key;
      const choice = await levelUpDialog(this.state, hero, offer, portrait);
      if (this.run(chooseLevelUp(this.state, hero.id, choice)) === null) return;
    }
  }

  /** The commands the hero screens need. */
  private readonly heroHost: HeroScreenHost = {
    state: () => this.state,
    run: (result) => this.run(result) !== null,
    // The sheet's spellbook casts as the map's does: the human's own hero
    // on the human's turn (bead bzc.82).
    canCast: (heroId) =>
      this.state.currentPlayer === this.human &&
      this.state.heroes.some(
        (h) => h.id === heroId && h.owner === this.human && h.alive,
      ),
  };

  /**
   * The hero sheet: stats, skills, feats, worn items, backpack. A spell
   * picked in its spellbook closes it and is cast or aimed for that hero.
   */
  private async heroScreen(heroId?: string): Promise<void> {
    if (this.inputBlocked()) return;
    const id = heroId ?? this.hero()?.id;
    if (id === undefined) return;
    const choice = await openHeroScreen(this.heroHost, id);
    this.refresh();
    if (choice === null) return;
    this.selectHero(id);
    const hero = this.hero();
    if (hero?.id === id) this.useBookChoice(hero, choice);
  }

  /** Settles a pending battle that cannot be applied as void (an error). */
  private voidBattle(error: CommandError, message: string): void {
    const r = voidPendingBattle(this.state, error, message);
    if (!r.ok) return;
    this.state = r.state;
    this.refresh();
    this.announce(r.events);
  }

  /** Fights pending battles the human takes part in, one after another. */
  private async battles(): Promise<void> {
    while (
      this.state.pendingBattle !== null &&
      this.state.status === "playing"
    ) {
      const setup = battleSetup(this.state);
      if (setup === null) {
        // Never wait on a battle that cannot be fought: void it.
        this.voidBattle("no-battle", "the pending battle has no setup");
        continue;
      }
      const model = preBattleModel(this.state, setup, this.human);
      const humanSide = model.side;
      let choice = await preBattleDialog(model);
      // A retreat is confirmed first, with what it costs (bead bzc.92);
      // Cancel goes back to the pre-battle dialog.
      while (
        choice === "retreat" &&
        !(await retreatDialog(retreatModel(this.state, setup, humanSide)))
      )
        choice = await preBattleDialog(model);
      let result: BattleResult;
      if (choice === "retreat") {
        result = {
          winner: humanSide === "attacker" ? "defender" : "attacker",
          attacker: setup.attacker.stacks.map((s) => s.count),
          defender: setup.defender.stacks.map((s) => s.count),
          retreat: humanSide,
        };
      } else {
        this.screenOpen = true;
        result = await openBattleScreen(this.host, setup, {
          autoResolve: choice === "auto",
          playerSides: [humanSide],
        });
        this.screenOpen = false;
      }
      const applied = applyBattleResult(this.state, result);
      if (!applied.ok) {
        // A refused result (a resolver bug) must not leave the game
        // waiting on the battle: it is voided and the error shown.
        this.voidBattle(applied.error, applied.message);
        continue;
      }
      this.state = applied.state;
      this.refresh();
      this.announce(applied.events);
      // A battle that wins the game still offers its level-ups first.
      if (this.state.status === "won") await this.levelUps();
      if (this.checkEnd()) return;
      // A bank's prize, a captured town's guild pages (bead bzc.81).
      await this.showResults();
      await this.learnt(applied.events);
      await this.levelUps();
      // A won fight on an object entrance may visit it (pickups, chests).
      for (const e of applied.events) {
        if (e.type === "chest-offer") await this.chest(e.heroId, e.pickupId);
      }
      await this.levelUps();
      // During an AI turn, the AI settles its own follow-ups.
      if (this.state.currentPlayer !== this.human) return;
    }
  }

  // ------------------------------------------------------------ turns

  private async endTurn(): Promise<void> {
    if (this.inputBlocked()) return;
    if (this.aiming !== null) this.stopAiming();
    const warnings = endTurnWarnings(
      this.state,
      this.human,
      this.plannedPaths(),
    );
    if (warnings.length > 0) {
      const choice = await endTurnDialog(endTurnRows(this.state, warnings));
      if (choice.kind === "hero") this.selectHero(choice.id);
      if (choice.kind === "town") await this.openTown(choice.id);
      if (choice.kind === "stay") {
        const first = warnings.find((w) => w.kind !== "can-build");
        if (first !== undefined) this.selectHero(first.id);
      }
      if (choice.kind !== "end") return;
    }
    const events = this.run(endTurn(this.state));
    if (events === null) return;
    this.clearPlan();
    await this.afterTurnEvents(events);
    await this.runAiTurns();
    // No AI to wait for (or it already ended): the queue shows now.
    if (this.state.currentPlayer === this.human) await this.flushLearnt();
  }

  /** New day / week toasts and sounds. */
  private async afterTurnEvents(events: readonly GameEvent[]): Promise<void> {
    this.announce(events);
    // Pages learnt in town at a day's start wait for the human's turn.
    for (const e of events)
      if (
        e.type === "spells-learnt" &&
        this.state.heroes.find((h) => h.id === e.heroId)?.owner === this.human
      )
        this.learntQueue.push(e);
    if (this.checkEnd()) return;
    const week = events.some((e) => e.type === "new-week");
    const day = events.some((e) => e.type === "new-day");
    if (week) {
      playSound("new-week");
      const c = calendar(this.state.day);
      dayBanner(
        `Week ${c.weekOfGame}`,
        "Creatures grow, taverns refresh",
        "week",
      );
      this.note(
        `Week ${c.weekOfGame}: creatures grow, taverns refresh`,
        "quiet",
      );
    } else if (day) {
      playSound("new-day");
      dayBanner(dateLabel(this.state.day), "A new day", "day");
    }
    await Promise.resolve();
  }

  /** Plays AI turns until it is the human's turn again (or the game ends). */
  private async runAiTurns(): Promise<void> {
    if (this.aiRunning || this.finished) return;
    this.aiRunning = true;
    closeTips();
    this.refresh();
    try {
      for (let guard = 0; guard < 2000; guard++) {
        if (this.state.status !== "playing") break;
        if (this.state.currentPlayer === this.human) break;
        await wait(1);
        const step = aiStep(this.state, this.controllers, this.resolver);
        const before = this.state;
        const walk = step.events.find((e) => e.type === "moved");
        if (walk?.type === "moved") await this.animateAiWalk(before, walk);
        this.state = step.state;
        this.refresh();
        await this.afterTurnEvents(step.events);
        if (step.outcome === "human-battle") {
          this.aiRunning = false;
          this.renderTurn();
          await this.battles();
          this.aiRunning = true;
          this.renderTurn();
        }
        if (step.outcome === "game-over" || this.checkEnd()) break;
        const moved = step.action?.type === "move" ? step.action : null;
        if (moved !== null && this.visibleMove(before, moved.heroId)) {
          await wait(AI_STEP_MS);
        }
      }
    } finally {
      this.aiRunning = false;
    }
    if (this.finished || this.state.status !== "playing") return;
    this.refresh();
    saveGame(browserStorage(), this.state);
    this.note(`${dateLabel(this.state.day)}: your turn`);
    this.centreOnTurnStart();
    await this.flushLearnt();
    await this.levelUps();
  }

  /** The pages learnt at the day's start, now that it is the human's turn. */
  private async flushLearnt(): Promise<void> {
    await this.showResults();
    if (this.learntQueue.length === 0) return;
    const events = this.learntQueue;
    this.learntQueue = [];
    await showLearnt(this.state, events, this.human);
  }

  /**
   * The start of the human's turn: the selected hero if it can still move,
   * else the first hero that can, else the first town; the camera glides
   * there (snaps under reduced motion).
   */
  private centreOnTurnStart(): void {
    const own = heroesOf(this.state, this.human);
    const selected = this.hero();
    const hero =
      selected !== undefined && selected.mp >= SPENT_MP
        ? selected
        : (own.find((h) => h.mp >= SPENT_MP) ?? selected);
    if (hero === undefined) {
      const id = this.ownTowns()[0];
      const obj = this.state.map.objects.find((o) => o.id === id);
      if (obj !== undefined)
        void this.view.glideTo(obj.x, obj.y, reducedMotion());
      return;
    }
    if (hero.id !== this.selectedId) this.selectHero(hero.id);
    else void this.view.glideTo(hero.x, hero.y, reducedMotion());
  }

  /**
   * An AI hero's walk, shown where the human can see it (bead xaj.18): the
   * camera glides to the first seen cell and follows the hero along the
   * seen part; unseen steps take no time. Reduced motion: the camera only
   * glides (snaps) to where the hero ends up in sight.
   */
  private async animateAiWalk(
    before: GameState,
    walk: Extract<GameEvent, { type: "moved" }>,
  ): Promise<void> {
    const hero = before.heroes.find((h) => h.id === walk.heroId);
    if (hero === undefined || hero.owner === this.human) return;
    const explored = this.player()?.explored ?? [];
    const w = before.map.width;
    const seen = (x: number, y: number): boolean =>
      explored[y * w + x] === true;
    const cells: Array<[number, number]> = [[hero.x, hero.y], ...walk.cells];
    const visible = cells.filter(([x, y]) => seen(x, y));
    const first = visible[0];
    if (first === undefined) return;
    if (reducedMotion()) {
      const last = visible[visible.length - 1] ?? first;
      await this.view.glideTo(last[0], last[1], true);
      return;
    }
    await this.view.glideTo(first[0], first[1]);
    let prev = { x: hero.x, y: hero.y };
    for (const [x, y] of walk.cells) {
      if (seen(x, y) || seen(prev.x, prev.y)) {
        this.syncHeroes({ id: hero.id, x, y }, before);
        await this.view.walkHero(hero.id, prev, { x, y }, AI_WALK_MS);
      }
      prev = { x, y };
    }
  }

  /** Whether the human sees the AI hero (start or end of its move). */
  private visibleMove(before: GameState, heroId: string): boolean {
    const explored = this.player()?.explored ?? [];
    const w = this.state.map.width;
    const seen = (s: GameState): boolean => {
      const h = s.heroes.find((x) => x.id === heroId);
      return h !== undefined && explored[h.y * w + h.x] === true;
    };
    return seen(before) || seen(this.state);
  }

  // ------------------------------------------------------------ screens

  private async openTown(townId: string): Promise<void> {
    if (this.screenOpen || this.finished) return;
    this.screenOpen = true;
    closeTips();
    await openTownScreen(
      {
        state: () => this.state,
        run: (result) => this.run(result) !== null,
        resourceBar: () => this.resourceBar(),
      },
      townId,
    );
    this.screenOpen = false;
    // A hero hired in the town becomes the selected one.
    const town = this.state.map.objects.find((o) => o.id === townId);
    const there = heroesOf(this.state, this.human).find(
      (h) => h.x === town?.x && h.y === town?.y,
    );
    if (there !== undefined && this.hero() === undefined) {
      this.selectedId = there.id;
    }
    this.refresh();
    if (this.plan !== null && !this.planTo(this.plan.x, this.plan.y))
      this.clearPlan();
  }

  /**
   * Two own heroes side by side trade creatures and items (RULES_V2 5.3):
   * the meeting screen's two mirrored columns (meeting.ts, bead bzc.64).
   */
  private async meet(heroId: string, otherId: string): Promise<void> {
    if (this.inputBlocked()) return;
    await openMeeting(this.heroHost, heroId, otherId);
    this.refresh();
  }

  /**
   * The kingdom overview (UI2-12, src/ui/kingdom.ts): a click on a hero row
   * selects that hero, one on a town row opens the town.
   */
  private async kingdom(): Promise<void> {
    if (this.inputBlocked()) return;
    const pick = await openKingdom({
      state: this.state,
      player: this.human,
      selectedHeroId: this.hero()?.id ?? null,
      tips: {
        resource: (r) => this.resourceTip(r),
        hero: (h) => this.heroTip(h),
        town: (id) => this.townTip(id),
      },
    });
    if (pick?.kind === "hero") this.selectHero(pick.id);
    else if (pick?.kind === "town") await this.openTown(pick.id);
  }

  /** The adventure spellbook (RULES_V2 2.8) of the selected hero. */
  private async spellbook(): Promise<void> {
    if (this.inputBlocked()) return;
    const hero = this.hero();
    if (hero === undefined) return;
    if (this.aiming !== null) this.stopAiming();
    this.screenOpen = true;
    const choice = await openAdventureBook(this.state, hero);
    this.screenOpen = false;
    if (choice === null) return;
    this.useBookChoice(hero, choice);
  }

  /** Casts a spell picked in a spellbook, or aims it on the map. */
  private useBookChoice(
    hero: HeroState,
    choice: NonNullable<BookChoice>,
  ): void {
    if (choice.kind === "aim") {
      this.aiming = {
        spell: choice.spell,
        scroll: choice.scroll,
        aims: choice.aims,
      };
      // Only targets that would change something glow.
      this.view.setTargetCells(
        choice.aims.filter((a) => a.noEffect === undefined),
      );
      this.renderHint();
      toast(aimHint(choice.spell));
      return;
    }
    const events = this.run(
      castAdventureSpell(this.state, hero.id, choice.spell, choice.target, {
        scroll: choice.scroll,
      }),
    );
    if (events !== null) {
      this.syncHeroes();
      toast("Cast.");
    }
  }

  /**
   * Records a message in the log and floats it up from the hero (bead
   * xaj.18): what a visit or pickup gave, where it happened. Lines one after
   * another queue so they never overlap; a hero off screen gets a toast.
   */
  private noteAtHero(
    text: string,
    kind: "info" | "gain" = "gain",
    heroId?: string,
  ): void {
    const hero =
      heroId === undefined
        ? this.hero()
        : this.state.heroes.find((h) => h.id === heroId);
    const at = hero === undefined ? null : this.cellToClient(hero.x, hero.y);
    if (at === null) {
      this.note(text, kind);
      return;
    }
    this.note(text, "quiet");
    const now = performance.now();
    const start = Math.max(now, this.floatQueue);
    this.floatQueue = start + FLOAT_GAP_MS;
    const lift = CELL_PX * 0.6 * this.view.getZoom();
    floatText({ x: at.x, y: at.y - lift }, text, kind, start - now);
  }

  /** Records a message in the log; toasts it unless it is quiet. */
  private note(
    text: string,
    kind: "info" | "gain" | "week" | "quiet" = "info",
  ): void {
    this.log.push({ day: this.state.day, text });
    if (this.log.length > 120) this.log.splice(0, this.log.length - 120);
    if (kind !== "quiet") toast(text, kind);
  }

  /** The adventure log (L): recent events, the AI turns included. */
  private async showLog(): Promise<void> {
    if (this.inputBlocked()) return;
    const list = el("ol.gm-log");
    let day = -1;
    for (const entry of this.log.slice(-60)) {
      if (entry.day !== day) {
        day = entry.day;
        list.append(el("li.gm-log-day", dateLabel(day)));
      }
      list.append(el("li", entry.text));
    }
    if (this.log.length === 0)
      list.append(el("li.gm-dim", "Nothing has happened yet."));
    await modal<undefined>({
      title: "Adventure log",
      className: "gm-log-dialog",
      body: list,
      buttons: [{ label: "Close", value: undefined, primary: true }],
      cancel: undefined,
      onOpen: () => {
        list.scrollTop = list.scrollHeight;
      },
    });
  }

  /** Every keyboard shortcut of the adventure screen (?). */
  private async showKeys(): Promise<void> {
    if (this.inputBlocked()) return;
    await modal<undefined>({
      title: "Keyboard",
      className: "gm-keys-dialog",
      body: keysTable(),
      buttons: [{ label: "Close", value: undefined, primary: true }],
      cancel: undefined,
    });
  }

  /** The game menu (O): save, load, sound settings, keys, quit. */
  private async gameMenu(): Promise<void> {
    if (this.inputBlocked()) return;
    const saved = readSave(browserStorage());
    const savedDay = saved.kind === "ok" ? saved.state.day : null;
    const choice = await modal<"save" | "load" | "keys" | "quit" | "stay">({
      title: "Menu",
      className: "gm-menu-dialog",
      body: el(
        "div.gm-menu-dialog-body",
        el(
          "p.gm-dim",
          "The game saves itself at the end of every turn. Save now to keep this moment.",
        ),
        el("h3.gm-rule", "Sound"),
        soundControl(),
        el("h3.gm-rule", "Developer"),
        devSettings({
          state: () => this.state,
          player: this.human,
          heroId: () => this.hero()?.id ?? null,
          townId: () => this.heroTownId() ?? this.ownTowns()[0] ?? null,
          run: (result) => this.run(result),
          note: (text) => this.note(text),
        }),
      ),
      buttons: [
        { label: "Save game", value: "save", primary: true },
        {
          label: savedDay === null ? "Load (no save)" : `Load day ${savedDay}`,
          value: "load",
          disabled: savedDay === null,
        },
        { label: "Keys", value: "keys" },
        { label: "Quit to menu", value: "quit" },
        { label: "Back", value: "stay" },
      ],
      cancel: "stay",
    });
    if (choice === "save") {
      const ok = saveGame(browserStorage(), this.state);
      this.note(ok ? "Game saved." : "Could not save: storage is full or off.");
    } else if (choice === "keys") {
      await this.showKeys();
    } else if (choice === "load") {
      const again = readSave(browserStorage());
      if (again.kind !== "ok") return;
      const sure = await modal<boolean>({
        title: `Load the save of day ${again.state.day}?`,
        body: "Anything done since that save is lost.",
        buttons: [
          { label: "Load", value: true, primary: true },
          { label: "Cancel", value: false },
        ],
        cancel: false,
      });
      if (!sure) return;
      this.state = again.state;
      this.selectedId = heroesOf(this.state, this.human)[0]?.id ?? null;
      this.clearPlan();
      this.objectsSig = "";
      this.refresh();
      const hero = this.hero();
      if (hero !== undefined) this.view.centerOn(hero.x, hero.y);
      this.note(`Loaded the save of day ${this.state.day}.`);
    } else if (choice === "quit") {
      const sure = await modal<"quit" | "stay">({
        title: "Return to the main menu?",
        body: "The game is saved first; Continue picks it up from here.",
        buttons: [
          { label: "Save and quit", value: "quit", primary: true },
          { label: "Keep playing", value: "stay" },
        ],
        cancel: "stay",
      });
      if (sure !== "quit") return;
      saveGame(browserStorage(), this.state);
      this.finish({ reason: "menu" });
    }
  }

  /** Shows the victory or defeat screen when the game is over. */
  private checkEnd(): boolean {
    if (this.state.status === "playing") return false;
    if (this.finished) return true;
    const won = this.state.status === "won";
    playSound(won ? "victory" : "defeat");
    deleteSave(browserStorage());
    this.finished = true;
    this.showEnd(won);
    return true;
  }

  /** The victory or defeat screen (also previewEnd for screenshots). */
  private showEnd(won: boolean): void {
    const c = calendar(this.state.day);
    const own = heroesOf(this.state, this.human);
    const best = own.reduce<HeroState | null>(
      (a, h) => (a === null || h.level > a.level ? h : a),
      null,
    );
    const scenario =
      this.state.scenario !== null && this.state.players.length === 1;
    const text = won
      ? scenario
        ? "The Warlord's Hold has fallen. The border marches belong to the Lost World."
        : "Every rival has fallen. The border marches are yours."
      : "Your last town and your last hero are gone. The marches belong to others now.";
    const stat = (label: string, value: string, wide = false): HTMLElement =>
      el(
        `div.gm-end-stat${wide ? ".gm-wide" : ""}`,
        el("span", label),
        el("b", value),
      );
    const mines = Object.values(this.state.mines).filter(
      (m) => m.owner === this.human,
    ).length;
    const screen = el(
      "div.gm-end",
      el(
        "div.gm-end-box",
        best !== null
          ? img(
              namedHeroPortrait(best.defId, best.heroClass).key,
              "gm-end-portrait",
              2,
            )
          : null,
        el("h1", won ? "Victory!" : "Defeat"),
        el("p.gm-end-text", text),
        el(
          "div.gm-end-stats",
          stat("Date", `Month ${c.month}, week ${c.week}, day ${c.dayOfWeek}`),
          stat("Days played", String(this.state.day)),
          stat("Towns", String(townsOf(this.state, this.human).length)),
          stat("Heroes", String(own.length)),
          stat("Mines", String(mines)),
          best !== null
            ? stat("Best hero", `${best.name}, level ${best.level}`, true)
            : null,
        ),
        button(
          "Main menu",
          () => {
            screen.remove();
            this.destroy();
            this.exit({ reason: won ? "won" : "lost" });
          },
          "gm-btn gm-primary gm-end-button",
        ),
      ),
    );
    screen.classList.add(won ? "gm-won" : "gm-lost");
    this.host.append(screen);
    screen.querySelector<HTMLButtonElement>(".gm-end-button")?.focus();
  }

  private finish(result: GameExit): void {
    this.finished = true;
    this.destroy();
    this.exit(result);
  }

  private destroy(): void {
    this.offMotion();
    this.offModal();
    delete window.__bmGame;
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("resize", this.onResize);
    window.clearInterval(this.viewportTimer);
    this.cancelPendingWalk();
    this.view.destroy();
    this.root.remove();
  }
}
