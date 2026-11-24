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
  battlePlayers,
  battleSetup,
  calendar,
  chooseLevelUp,
  dailyIncome,
  endTurn,
  findPath,
  heroesOf,
  humanPlayer,
  inSight,
  levelUpOffers,
  moveHeroAlong,
  SimpleAi,
  takeChest,
  townIncome,
  townsOf,
  transferStack,
  xpForLevel,
} from "../core/game/index.ts";
import type {
  BattleResult,
  BattleSetup,
  CommandResult,
  GameEvent,
  GameState,
  HeroState,
  Path,
  PlayerController,
  SlotRef,
} from "../core/game/index.ts";
import { createBattleResolver } from "../core/battle/resolver.ts";
import { CHEST, MINES, RESOURCE_IDS, RESOURCE_NAMES } from "../data/economy.ts";
import { HERO_SIGHT, getHeroClass } from "../data/hero.ts";
import { MAX_HEROES, playerColour } from "../data/players.ts";
import { createMapView, ZOOM_STEPS } from "../render/map/map-view.ts";
import type { MapFlag, MapView } from "../render/map/map-view.ts";
import { pickupCue } from "../audio/cues.ts";
import { playSound } from "../audio/sound.ts";
import { openBattleScreen } from "./battle/screen.ts";
import { soundControl } from "./sound-control.ts";
import { armyRow } from "./army.ts";
import {
  button,
  costView,
  el,
  img,
  modal,
  modalOpen,
  resourceIcon,
  toast,
  wait,
} from "./dom.ts";
import {
  capitalize,
  creatureCount,
  dateLabel,
  describeCell,
  objectAt,
  stackPhrase,
} from "./format.ts";
import { heroMapUnit, loadGameMapAssets } from "./hero-sprite.ts";
import { Minimap } from "./minimap.ts";
import { browserStorage, deleteSave, saveGame } from "./save.ts";
import { displayObjects, objectsSignature } from "./objects.ts";
import { openTownScreen } from "./town.ts";

/** The human player in the MVP flow (RULES_V2 5.1: player 0). */
export const PLAYER = 0;
const STEP_MS = 110;
/** Pause per visible AI step, so the human can follow it. */
const AI_STEP_MS = 90;
const MINIMAP_PX = 216;

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
  /** Uncollected pickups and live monsters the hero can path to, by cost. */
  targets(): HookTarget[];
}

export interface HookTarget {
  id: string;
  kind: "pickup" | "monster";
  x: number;
  y: number;
  cost: number;
  /** Reachable with today's movement points. */
  today: boolean;
}

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

class GameScreen {
  private state: GameState;
  private readonly human: number;
  private readonly host = document.getElementById("ui") ?? document.body;
  private readonly root = el("div.gm-game");
  private readonly mapWrap = el("div.gm-mapwrap");
  private readonly canvas = el("canvas.gm-map");
  private readonly tooltip = el("div.gm-tooltip");
  private readonly banner = el("div.gm-ai-banner");
  private readonly bar = el("div.gm-bar");
  private readonly side = el("aside.gm-side");
  private readonly turnPanel = el("div.gm-turn");
  private readonly heroList = el("div.gm-hero-list");
  private readonly heroPanel = el("div.gm-hero-panel");
  private readonly townPanel = el("div.gm-town-panel");
  private readonly view: MapView;
  private readonly minimap: Minimap;
  private readonly heroUnit = heroMapUnit();
  private readonly ai = new SimpleAi();
  private readonly resolver = createBattleResolver();
  private objectsSig = "";
  /** The planned destination and its path. */
  private plan: { x: number; y: number; path: Path } | null = null;
  /** Input is ignored while walking, fighting or in a dialog. */
  private busy = false;
  private aiRunning = false;
  private screenOpen = false;
  private selectedId: string | null = null;
  private pointer = { x: 0, y: 0 };
  private viewportTimer = 0;
  private finished = false;

  constructor(
    initial: GameState,
    assets: Awaited<ReturnType<typeof loadGameMapAssets>>,
    private readonly exit: (result: GameExit) => void,
  ) {
    this.state = initial;
    this.human = humanPlayer(initial);
    this.selectedId = heroesOf(initial, this.human)[0]?.id ?? null;
    this.mapWrap.append(this.canvas, this.tooltip, this.banner);
    this.minimap = new Minimap(MINIMAP_PX, (x, y) => this.view.centerOn(x, y));
    this.buildSide();
    this.root.append(el("div.gm-main", this.mapWrap, this.bar), this.side);
    this.host.append(this.root);
    this.view = createMapView(this.canvas, assets);
    this.view.setMap(initial.map);
    this.view.onClick((cell) => this.onMapClick(cell.x, cell.y));
    this.view.onHover((cell) => this.onHover(cell));
    this.canvas.addEventListener("pointermove", (e) => {
      this.pointer = { x: e.offsetX, y: e.offsetY };
      this.placeTooltip();
    });
    this.canvas.addEventListener("pointerleave", () => {
      this.tooltip.style.display = "none";
    });
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("resize", this.onResize);
    this.refresh();
    const hero = this.hero();
    if (hero !== undefined) this.view.centerOn(hero.x, hero.y);
    else this.centreOnTown();
    this.viewportTimer = window.setInterval(() => this.updateViewport(), 120);
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
      if (o.kind !== "pickup" && o.kind !== "monster") continue;
      const path = findPath(this.state, hero.id, o.x, o.y);
      if (path === null) continue;
      out.push({
        id: o.id,
        kind: o.kind,
        x: o.x,
        y: o.y,
        cost: path.total,
        today: path.steps.every((s) => s.day === 0),
      });
    }
    return out.sort((a, b) => a.cost - b.cost);
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
    const title = el("div.gm-side-title", "Border Marches");
    const buttons = el(
      "div.gm-side-buttons",
      button("Next hero (H)", () => this.nextHero()),
      button("Kingdom (K)", () => void this.kingdom()),
      button("Menu", () => void this.quitToMenu()),
    );
    const endTurnButton = button(
      "End turn (E)",
      () => void this.endTurn(),
      "gm-btn gm-primary gm-end-turn",
    );
    this.side.append(
      title,
      this.minimap.canvas,
      this.turnPanel,
      this.heroList,
      this.heroPanel,
      this.townPanel,
      buttons,
      endTurnButton,
      soundControl(),
    );
  }

  private resourceBar(): HTMLElement {
    const player = this.player();
    const income = dailyIncome(this.state, this.human);
    const bar = el("div.gm-resources");
    for (const r of RESOURCE_IDS) {
      const item = el(
        "div.gm-res",
        resourceIcon(r),
        el("span.gm-res-amount", String(player?.resources[r] ?? 0)),
      );
      item.title = `${RESOURCE_NAMES[r]}: +${income[r]} per day`;
      bar.append(item);
    }
    return bar;
  }

  private renderBar(): void {
    this.bar.replaceChildren(
      this.resourceBar(),
      el("div.gm-date", dateLabel(this.state.day)),
    );
  }

  private renderTurn(): void {
    const current = this.state.currentPlayer;
    const colour = playerColour(current);
    const mine = current === this.human;
    const chip = el("span.gm-turn-chip");
    chip.style.background = colour.hex;
    this.turnPanel.replaceChildren(
      chip,
      el(
        "span.gm-turn-text",
        mine ? "Your turn" : `${colour.name} is thinking...`,
      ),
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

  private renderHeroList(): void {
    this.heroList.replaceChildren();
    const own = heroesOf(this.state, this.human);
    const selected = this.hero();
    for (const h of own) {
      const item = el(
        "button.gm-hero-item",
        img("portrait-dinosaur-chieftain", "gm-hero-item-portrait"),
        el("span.gm-hero-item-name", h.name),
      );
      item.type = "button";
      const mp = el("span.gm-hero-item-mp");
      mp.style.setProperty(
        "--mp",
        `${Math.max(0, Math.min(100, (h.mp / h.maxMp) * 100))}%`,
      );
      item.append(mp);
      item.title = `${h.name}, level ${h.level}: ${h.mp} / ${h.maxMp} moves`;
      if (h.id === selected?.id) item.classList.add("gm-selected");
      item.addEventListener("click", () => this.selectHero(h.id));
      this.heroList.append(item);
    }
    if (own.length === 0) {
      this.heroList.append(
        el("div.gm-dim", "No heroes: hire one in a town's tavern."),
      );
    }
    this.heroList.append(
      el("div.gm-hero-count", `Heroes ${own.length} / ${MAX_HEROES}`),
    );
  }

  private renderHeroPanel(): void {
    const hero = this.hero();
    this.heroPanel.replaceChildren();
    if (hero === undefined) return;
    const cls = getHeroClass(hero.heroClass);
    const portrait = img("portrait-dinosaur-chieftain", "gm-hero-portrait", 2);
    portrait.title = "Centre on the hero";
    portrait.addEventListener("click", () => this.selectHero(hero.id));
    const nextXp = xpForLevel(hero.level + 1);
    const prevXp = xpForLevel(hero.level);
    const xpPct = Math.max(
      0,
      Math.min(100, ((hero.xp - prevXp) / (nextXp - prevXp)) * 100),
    );
    const mpPct = Math.max(0, Math.min(100, (hero.mp / hero.maxMp) * 100));
    const stats = el(
      "div.gm-hero-stats",
      el("div.gm-hero-name", `${hero.name}, ${cls.name} ${hero.level}`),
      el("div", `Attack ${hero.attack}   Defense ${hero.defense}`),
      el("div.gm-meter", el("div.gm-meter-fill.gm-xp")),
      el("div.gm-meter-label", `XP ${hero.xp} / ${nextXp}`),
      el("div.gm-meter", el("div.gm-meter-fill.gm-mp")),
      el("div.gm-meter-label", `Moves ${hero.mp} / ${hero.maxMp}`),
    );
    const fills = stats.querySelectorAll<HTMLElement>(".gm-meter-fill");
    fills[0]?.style.setProperty("width", `${xpPct}%`);
    fills[1]?.style.setProperty("width", `${mpPct}%`);
    this.heroPanel.append(
      el("div.gm-hero-top", portrait, stats),
      armyRow(hero.army, { small: true }),
    );
    this.heroPanel.classList.add("gm-selected");
  }

  private renderTownPanel(): void {
    this.townPanel.replaceChildren();
    for (const id of this.ownTowns()) {
      const town = this.state.towns[id];
      if (town === undefined) continue;
      const b = button(
        `${town.name} (T)`,
        () => void this.openTown(id),
        "gm-btn gm-town-btn",
      );
      if (town.builtToday) b.title = "Already built today";
      this.townPanel.append(b);
    }
    const mines = Object.values(this.state.mines).filter(
      (m) => m.owner === this.human,
    );
    const counts = RESOURCE_IDS.map((r) => ({
      r,
      n: mines.filter((m) => m.resource === r).length,
    })).filter((c) => c.n > 0);
    const player = this.player();
    this.townPanel.append(
      el(
        "div.gm-kingdom",
        el("div.gm-kingdom-row", "Daily income"),
        costView(dailyIncome(this.state, this.human)),
        el(
          "div.gm-kingdom-row",
          mines.length === 0
            ? "No mines yet"
            : `Mines: ${counts.map((c) => `${c.n} ${MINES[c.r].name}${c.n > 1 ? "s" : ""}`).join(", ")}`,
        ),
        this.ownTowns().length === 0 && player !== undefined
          ? el(
              "div.gm-kingdom-row.gm-warn",
              `No town! Out of the game in ${7 - player.townlessDays} days.`,
            )
          : null,
      ),
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

  private syncHeroes(moving?: { id: string; x: number; y: number }): void {
    this.view.setHeroes(
      this.state.heroes
        .filter((h) => h.alive)
        .map((h) => ({
          id: h.id,
          x: h.id === moving?.id ? moving.x : h.x,
          y: h.id === moving?.id ? moving.y : h.y,
          unit: this.heroUnit,
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
      this.tooltip.style.display = "none";
      return;
    }
    const text = describeCell(this.state, this.human, cell.x, cell.y);
    if (text === null) {
      this.tooltip.style.display = "none";
      return;
    }
    this.tooltip.textContent = text;
    this.tooltip.style.display = "block";
    this.placeTooltip();
  }

  private placeTooltip(): void {
    const w = this.mapWrap.clientWidth;
    const x = Math.min(this.pointer.x + 16, w - this.tooltip.offsetWidth - 4);
    this.tooltip.style.left = `${Math.max(4, x)}px`;
    this.tooltip.style.top = `${this.pointer.y + 18}px`;
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
      case "t":
      case "T": {
        const id = this.ownTowns()[0];
        if (id !== undefined) void this.openTown(id);
        break;
      }
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
        this.clearPlan();
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
    if (this.selectedId !== heroId) this.clearPlan();
    this.selectedId = heroId;
    this.view.centerOn(hero.x, hero.y);
    this.renderHeroList();
    this.renderHeroPanel();
  }

  /** Cycles to the next hero (H). */
  private nextHero(): void {
    const own = heroesOf(this.state, this.human);
    if (own.length === 0) return;
    const i = own.findIndex((h) => h.id === this.hero()?.id);
    const next = own[(i + 1) % own.length];
    if (next !== undefined) this.selectHero(next.id);
  }

  private clearPlan(): void {
    this.plan = null;
    this.view.setPathPreview(null);
  }

  private showPlan(): void {
    if (this.plan === null) {
      this.view.setPathPreview(null);
      return;
    }
    this.view.setPathPreview(
      this.plan.path.steps.map((s) => ({
        x: s.x,
        y: s.y,
        reachable: s.day === 0,
      })),
    );
  }

  private planTo(x: number, y: number): boolean {
    const hero = this.hero();
    if (hero === undefined) return false;
    const path = findPath(this.state, hero.id, x, y);
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
    // Clicking any cell of a town or mine targets its entrance.
    let tx = x;
    let ty = y;
    const obj = objectAt(displayObjects(this.state), x, y);
    if (obj !== undefined && (obj.kind === "town" || obj.kind === "mine")) {
      tx = obj.x;
      ty = obj.y;
      if (obj.kind === "town" && hero.x === tx && hero.y === ty) {
        if (this.state.towns[obj.id]?.owner === this.human)
          void this.openTown(obj.id);
        return;
      }
    }
    if (this.plan !== null && this.plan.x === tx && this.plan.y === ty) {
      void this.walk();
      return;
    }
    if (!this.planTo(tx, ty)) {
      toast("No way there");
      return;
    }
    const guard = this.planGuard();
    if (guard !== null) toast(`${guard}: click again to attack`);
  }

  /** Who the planned walk ends up fighting, as "a pack of 11 Skeletons". */
  private planGuard(): string | null {
    const steps = this.plan?.path.steps ?? [];
    const last = steps[steps.length - 1];
    if (last === undefined) return null;
    if (last.attack) {
      const foe = this.state.heroes.find(
        (h) => h.alive && h.x === last.x && h.y === last.y,
      );
      if (foe !== undefined) {
        return `${foe.name} of ${playerColour(foe.owner).name} stands there`;
      }
    }
    const stand = last.attack ? steps[steps.length - 2] : last;
    const monsters = Object.values(this.state.monsters);
    const target = last.attack
      ? monsters.find((m) => m.x === last.x && m.y === last.y)
      : undefined;
    const guard =
      target ??
      (stand === undefined
        ? undefined
        : monsters.find(
            (m) =>
              Math.max(Math.abs(m.x - stand.x), Math.abs(m.y - stand.y)) <= 1,
          ));
    return guard === undefined
      ? null
      : `Guarded by ${stackPhrase(guard.creature, guard.count)}`;
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
    this.tooltip.style.display = "none";
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
    for (const [x, y] of cells) {
      for (
        let yy = Math.max(0, y - HERO_SIGHT);
        yy <= Math.min(map.height - 1, y + HERO_SIGHT);
        yy++
      ) {
        for (
          let xx = Math.max(0, x - HERO_SIGHT);
          xx <= Math.min(map.width - 1, x + HERO_SIGHT);
          xx++
        ) {
          if (inSight(xx - x, yy - y, HERO_SIGHT))
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
      );
      this.view.setExplored(explored);
      this.syncHeroes({ id: hero.id, x, y });
      this.view.centerOn(x, y);
      this.updateViewport();
      playSound("hero.step", { jitter: 0.08 });
      await wait(STEP_MS);
    }
  }

  // ------------------------------------------------------------ events

  /** Toasts and sounds for events that concern the human. */
  private announce(events: readonly GameEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case "pickup":
          if (this.state.currentPlayer !== this.human) break;
          playSound(pickupCue(e.resource));
          toast(
            `+${e.amount} ${RESOURCE_NAMES[e.resource].toLowerCase()}`,
            "gain",
          );
          break;
        case "mine-flagged": {
          const mine = this.state.mines[e.mineId];
          if (mine === undefined) break;
          const def = MINES[mine.resource];
          if (e.owner === this.human) {
            playSound("pickup");
            toast(
              `${def.name} claimed: +${def.income} ${mine.resource} per day`,
              "gain",
            );
          }
          break;
        }
        case "xp":
          if (
            this.state.heroes.find((h) => h.id === e.heroId)?.owner ===
            this.human
          )
            toast(`+${e.amount} experience`, "gain");
          break;
        case "town-captured": {
          const name = this.state.towns[e.townId]?.name ?? "Town";
          if (e.owner === this.human) {
            playSound("new-week");
            toast(`${name} captured!`, "gain");
          } else if (e.from === this.human) {
            toast(`${name} has fallen to ${playerColour(e.owner).name}!`);
          }
          break;
        }
        case "hero-defeated":
        case "hero-retreated": {
          const h = this.state.heroes.find((x) => x.id === e.heroId);
          if (h === undefined) break;
          if (h.owner === this.human) {
            toast(
              e.type === "hero-retreated"
                ? `${h.name} retreats to the tavern`
                : `${h.name} has fallen`,
            );
          } else {
            toast(
              `${h.name} of ${playerColour(h.owner).name} is beaten`,
              "gain",
            );
          }
          break;
        }
        case "artifacts-won":
          if (e.artifacts.length > 0)
            toast(`${e.artifacts.length} artifacts taken`, "gain");
          break;
        case "player-eliminated":
          if (e.player !== this.human)
            toast(`${playerColour(e.player).name} is out of the game!`, "week");
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
      for (const e of events) {
        if (e.type === "chest-offer") await this.chest(e.heroId, e.pickupId);
        if (e.type === "visit-town") openTown = e.townId;
      }
      await this.levelUps();
      if (this.state.pendingBattle !== null) {
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

  private async chest(heroId: string, pickupId: string): Promise<void> {
    const choice = await modal<"gold" | "xp">({
      title: CHEST.name,
      body: el(
        "div.gm-chest",
        img("treasure", "gm-chest-img", 2),
        el(
          "p",
          "You find a chest of the old warlords. Take the gold, or study the maps and trophies inside?",
        ),
      ),
      buttons: [
        { label: `${CHEST.gold} gold`, value: "gold", primary: true },
        { label: `${CHEST.xp} experience`, value: "xp" },
      ],
    });
    const events = this.run(takeChest(this.state, heroId, pickupId, choice));
    if (events === null) return;
    playSound(choice === "gold" ? "gold" : "pickup");
    for (const e of events) {
      if (e.type === "pickup") toast(`+${e.amount} gold`, "gain");
      if (e.type === "xp") toast(`+${e.amount} experience`, "gain");
    }
  }

  private async levelUps(): Promise<void> {
    for (;;) {
      if (this.state.status !== "playing") return;
      const hero = heroesOf(this.state, this.human).find(
        (h) => h.pendingLevelUps > 0,
      );
      if (hero === undefined) return;
      const offers = levelUpOffers(this.state, hero.id);
      if (offers.length === 0) return;
      const level = hero.level - hero.pendingLevelUps + 1;
      playSound("level-up");
      const choice = await modal({
        title: `${hero.name}: level ${level}!`,
        className: "gm-levelup",
        body: el(
          "div.gm-levelup-body",
          img("portrait-dinosaur-chieftain", "gm-levelup-portrait", 2),
          el(
            "div",
            el("p", `${hero.name} has gained a level. Choose a reward:`),
            el(
              "p.gm-dim",
              `Attack ${hero.attack}, Defense ${hero.defense}. Each point adds to every stack in the army.`,
            ),
          ),
        ),
        buttons: offers.map((o, i) => ({
          label:
            o === "attack"
              ? `+1 Attack (${hero.attack + 1})`
              : `+1 Defense (${hero.defense + 1})`,
          value: o,
          primary: i === 0,
        })),
      });
      this.run(chooseLevelUp(this.state, hero.id, choice));
    }
  }

  /** The battle's title and one line, from the human's point of view. */
  private battleText(setup: BattleSetup): { title: string; phrase: string } {
    const pending = setup.battle;
    if (pending.kind === "monster") {
      const m = this.state.monsters[pending.objectId];
      return {
        title: "Neutral monsters",
        phrase: `${m === undefined ? "Monsters" : capitalize(stackPhrase(m.creature, m.count))} attack!`,
      };
    }
    if (pending.kind === "town") {
      const town = this.state.towns[pending.objectId];
      return {
        title: town?.name ?? "Town",
        phrase: `The garrison of ${town?.name ?? "the town"} stands ready.`,
      };
    }
    const att = this.state.heroes.find((h) => h.id === pending.heroId);
    const def = this.state.heroes.find((h) => h.id === pending.objectId);
    const where =
      pending.townId !== undefined
        ? ` at ${this.state.towns[pending.townId]?.name ?? "the town"}`
        : "";
    return {
      title: "Hero battle",
      phrase:
        att?.owner === this.human
          ? `${att.name} attacks ${def?.name ?? "the enemy"} of ${playerColour(def?.owner ?? 0).name}${where}!`
          : `${att?.name ?? "An enemy"} of ${playerColour(att?.owner ?? 0).name} attacks ${def?.name ?? "your hero"}${where}!`,
    };
  }

  /** Fights pending battles the human takes part in, one after another. */
  private async battles(): Promise<void> {
    while (
      this.state.pendingBattle !== null &&
      this.state.status === "playing"
    ) {
      const setup = battleSetup(this.state);
      if (setup === null) return;
      const sides = battlePlayers(this.state, setup.battle);
      const humanSide: "attacker" | "defender" =
        sides.defender === this.human && sides.attacker !== this.human
          ? "defender"
          : "attacker";
      const own = setup[humanSide];
      const enemy = setup[humanSide === "attacker" ? "defender" : "attacker"];
      const { title, phrase } = this.battleText(setup);
      const list = el("ul.gm-enemy-list");
      for (const s of enemy.stacks)
        list.append(el("li", creatureCount(s.creature, s.count)));
      const ownList = el("ul.gm-enemy-list");
      for (const s of own.stacks)
        ownList.append(el("li", creatureCount(s.creature, s.count)));
      const buttons: Array<{
        label: string;
        value: "fight" | "auto" | "retreat";
        primary?: boolean;
      }> = [
        { label: "Fight", value: "fight", primary: true },
        { label: "Quick combat", value: "auto" },
      ];
      if (own.canRetreat === true && own.hero !== null) {
        buttons.push({ label: "Retreat", value: "retreat" });
      }
      const choice = await modal<"fight" | "auto" | "retreat">({
        title,
        className: "gm-battle-confirm",
        body: el(
          "div",
          el("p.gm-phrase", phrase),
          el(
            "div.gm-versus",
            el("div", el("h3", "Your army"), ownList),
            el("div", el("h3", "Enemy"), list),
          ),
          el(
            "p.gm-dim",
            own.canRetreat === true
              ? "A retreating hero loses its army and waits in your tavern."
              : "If your army falls, the hero leaves the map.",
          ),
        ),
        buttons,
      });
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
        toast(applied.message);
        return;
      }
      this.state = applied.state;
      this.refresh();
      this.announce(applied.events);
      if (this.checkEnd()) return;
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
    const events = this.run(endTurn(this.state));
    if (events === null) return;
    this.clearPlan();
    await this.afterTurnEvents(events);
    await this.runAiTurns();
  }

  /** New day / week toasts and sounds. */
  private async afterTurnEvents(events: readonly GameEvent[]): Promise<void> {
    this.announce(events);
    if (this.checkEnd()) return;
    const week = events.some((e) => e.type === "new-week");
    const day = events.some((e) => e.type === "new-day");
    if (week) {
      playSound("new-week");
      toast(
        `Week ${calendar(this.state.day).weekOfGame}: creatures grow, taverns refresh`,
        "week",
      );
    } else if (day) {
      playSound("new-day");
    }
    await Promise.resolve();
  }

  /** Plays AI turns until it is the human's turn again (or the game ends). */
  private async runAiTurns(): Promise<void> {
    if (this.aiRunning || this.finished) return;
    this.aiRunning = true;
    this.tooltip.style.display = "none";
    this.refresh();
    try {
      for (let guard = 0; guard < 2000; guard++) {
        if (this.state.status !== "playing") break;
        if (this.state.currentPlayer === this.human) break;
        await wait(1);
        const step = aiStep(this.state, this.controllers, this.resolver);
        const before = this.state;
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
    toast(`${dateLabel(this.state.day)}: your turn`);
    const hero = this.hero();
    if (hero !== undefined) this.view.centerOn(hero.x, hero.y);
    await this.levelUps();
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
    this.tooltip.style.display = "none";
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

  /** Two own heroes side by side trade creatures (RULES_V2 5.3). */
  private async meet(heroId: string, otherId: string): Promise<void> {
    if (this.inputBlocked()) return;
    let selected: SlotRef | null = null;
    const body = el("div.gm-meet");
    const render = (): void => {
      const a = this.state.heroes.find((h) => h.id === heroId);
      const b = this.state.heroes.find((h) => h.id === otherId);
      if (a === undefined || b === undefined) return;
      const onSlot =
        (army: "hero" | "other") =>
        (slot: number, e: MouseEvent): void => {
          const here: SlotRef = { army, slot };
          if (selected === null) {
            const src = army === "hero" ? a.army : b.army;
            if (src[slot] != null) selected = here;
            render();
            return;
          }
          const from = selected;
          selected = null;
          if (from.army === army && from.slot === slot) {
            render();
            return;
          }
          const src = from.army === "hero" ? a.army : b.army;
          const stack = src[from.slot];
          const count =
            e.shiftKey && stack != null
              ? Math.floor(stack.count / 2)
              : undefined;
          if (count !== 0) {
            this.run(
              transferStack(this.state, {
                heroId,
                otherHeroId: otherId,
                from,
                to: here,
                ...(count !== undefined ? { count } : {}),
              }),
            );
          }
          render();
        };
      body.replaceChildren(
        el(
          "div.gm-army-line",
          el("div.gm-army-label", a.name),
          armyRow(a.army, {
            selected: selected?.army === "hero" ? selected.slot : null,
            onClick: onSlot("hero"),
          }),
        ),
        el(
          "div.gm-army-line",
          el("div.gm-army-label", b.name),
          armyRow(b.army, {
            selected: selected?.army === "other" ? selected.slot : null,
            onClick: onSlot("other"),
          }),
        ),
        el(
          "div.gm-hint",
          "Click a stack, then a slot: move, merge or swap. Shift-click the target to split in half. Each hero keeps at least one creature.",
        ),
      );
    };
    render();
    await modal<undefined>({
      title: "Heroes meet",
      body,
      className: "gm-meet-dialog",
      buttons: [{ label: "Done", value: undefined, primary: true }],
      cancel: undefined,
    });
    this.refresh();
  }

  /** The kingdom summary: towns, heroes, income, rivals. */
  private async kingdom(): Promise<void> {
    if (this.inputBlocked()) return;
    const s = this.state;
    const towns = el("table.gm-table");
    towns.append(
      el("tr", el("th", "Town"), el("th", "Income"), el("th", "Garrison")),
    );
    for (const t of townsOf(s, this.human)) {
      const garrison = t.garrison.reduce((n, x) => n + (x?.count ?? 0), 0);
      towns.append(
        el(
          "tr",
          el("td", t.name),
          el("td", costView(townIncome(t))),
          el("td", String(garrison)),
        ),
      );
    }
    const heroes = el("table.gm-table");
    heroes.append(
      el(
        "tr",
        el("th", "Hero"),
        el("th", "Level"),
        el("th", "Army"),
        el("th", "Moves"),
      ),
    );
    for (const h of heroesOf(s, this.human)) {
      const army = h.army.reduce((n, x) => n + (x?.count ?? 0), 0);
      heroes.append(
        el(
          "tr",
          el("td", h.name),
          el("td", String(h.level)),
          el("td", String(army)),
          el("td", `${h.mp} / ${h.maxMp}`),
        ),
      );
    }
    const rivals = el("ul.gm-rivals");
    for (const p of s.players) {
      if (p.id === this.human) continue;
      const chip = el("span.gm-turn-chip");
      chip.style.background = playerColour(p.id).hex;
      rivals.append(
        el(
          "li",
          chip,
          `${playerColour(p.id).name} (${p.kind === "ai" ? "AI" : "human"}): ${p.eliminated ? "out of the game" : "in the game"}`,
        ),
      );
    }
    const mines = Object.values(s.mines).filter((m) => m.owner === this.human);
    await modal<undefined>({
      title: "Kingdom",
      className: "gm-kingdom-dialog",
      body: el(
        "div.gm-kingdom-body",
        el("h3", "Daily income"),
        costView(dailyIncome(s, this.human)),
        el("div.gm-dim", `${mines.length} mines`),
        el("h3", "Towns"),
        towns,
        el("h3", "Heroes"),
        heroes,
        el("h3", "Rivals"),
        rivals,
      ),
      buttons: [{ label: "Close", value: undefined, primary: true }],
      cancel: undefined,
    });
  }

  private async quitToMenu(): Promise<void> {
    if (this.inputBlocked()) return;
    const choice = await modal<"quit" | "stay">({
      title: "Return to the main menu?",
      body: "The game is saved; Continue picks it up from here.",
      buttons: [
        { label: "Save and quit", value: "quit", primary: true },
        { label: "Keep playing", value: "stay" },
      ],
      cancel: "stay",
    });
    if (choice !== "quit") return;
    saveGame(browserStorage(), this.state);
    this.finish({ reason: "menu" });
  }

  /** Shows the victory or defeat screen when the game is over. */
  private checkEnd(): boolean {
    if (this.state.status === "playing") return false;
    if (this.finished) return true;
    const won = this.state.status === "won";
    playSound(won ? "victory" : "defeat");
    deleteSave(browserStorage());
    this.finished = true;
    const c = calendar(this.state.day);
    const best = heroesOf(this.state, this.human).reduce<HeroState | null>(
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
    const screen = el(
      "div.gm-end",
      el(
        "div.gm-end-box",
        el("h1", won ? "Victory!" : "Defeat"),
        el("p", text),
        el(
          "p.gm-dim",
          `Month ${c.month}, week ${c.week}, day ${c.dayOfWeek} (day ${this.state.day})` +
            (best !== null
              ? `. ${best.name} reached level ${best.level}.`
              : "."),
        ),
        button(
          "Main menu",
          () => {
            screen.remove();
            this.destroy();
            this.exit({ reason: won ? "won" : "lost" });
          },
          "gm-btn gm-primary",
        ),
      ),
    );
    screen.classList.add(won ? "gm-won" : "gm-lost");
    this.host.append(screen);
    return true;
  }

  private finish(result: GameExit): void {
    this.finished = true;
    this.destroy();
    this.exit(result);
  }

  private destroy(): void {
    delete window.__bmGame;
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("resize", this.onResize);
    window.clearInterval(this.viewportTimer);
    this.view.destroy();
    this.root.remove();
  }
}
