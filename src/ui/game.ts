/**
 * The adventure screen and the game loop around it: HoMaM II layout for a
 * widescreen browser (map on the left, sidebar on the right with minimap,
 * hero, towns and End Turn; resource bar and date at the bottom), hero
 * movement with path preview and walking animation, visits (pickups, mines,
 * chests, towns), battles through the battle screen, level-ups, day and
 * week transitions, auto-save and the victory and defeat screens.
 */
import { CELL_PX } from "../assets/manifest.ts";
import {
  applyBattleResult,
  battleSetup,
  calendar,
  chooseLevelUp,
  dailyIncome,
  endDay,
  findPath,
  inSight,
  levelUpOffers,
  moveHeroAlong,
  takeChest,
  xpForLevel,
} from "../core/game/index.ts";
import type {
  CommandResult,
  GameEvent,
  GameState,
  HeroState,
  Path,
} from "../core/game/index.ts";
import { CHEST, MINES, RESOURCE_IDS, RESOURCE_NAMES } from "../data/economy.ts";
import { HERO_SIGHT, getHeroClass } from "../data/hero.ts";
import { createMapView, ZOOM_STEPS } from "../render/map/map-view.ts";
import type { MapView } from "../render/map/map-view.ts";
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

/** The human player. */
export const PLAYER = 0;
const STEP_MS = 110;
const MINIMAP_PX = 216;

/** The page hook the scripted browser check drives (window.__bmGame). */
export interface GameHook {
  state(): GameState;
  /** True while walking, fighting, or a dialog or screen is open. */
  busy(): boolean;
  /** A click on map cell (x, y), as with the mouse. */
  click(x: number, y: number): void;
  /** A key press on the adventure screen. */
  key(key: string): void;
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
  private readonly host = document.getElementById("ui") ?? document.body;
  private readonly root = el("div.gm-game");
  private readonly mapWrap = el("div.gm-mapwrap");
  private readonly canvas = el("canvas.gm-map");
  private readonly tooltip = el("div.gm-tooltip");
  private readonly bar = el("div.gm-bar");
  private readonly side = el("aside.gm-side");
  private readonly heroPanel = el("div.gm-hero-panel");
  private readonly townPanel = el("div.gm-town-panel");
  private readonly view: MapView;
  private readonly minimap: Minimap;
  private readonly heroUnit = heroMapUnit();
  private objectsSig = "";
  /** The planned destination and its path. */
  private plan: { x: number; y: number; path: Path } | null = null;
  /** Input is ignored while walking, fighting or in a dialog. */
  private busy = false;
  private screenOpen = false;
  private heroSelected = true;
  private pointer = { x: 0, y: 0 };
  private viewportTimer = 0;
  private finished = false;

  constructor(
    initial: GameState,
    assets: Awaited<ReturnType<typeof loadGameMapAssets>>,
    private readonly exit: (result: GameExit) => void,
  ) {
    this.state = initial;
    this.mapWrap.append(this.canvas, this.tooltip);
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
    this.viewportTimer = window.setInterval(() => this.updateViewport(), 120);
    toast(dateLabel(this.state.day));
    // Hook for the scripted browser check (tools and evidence only).
    window.__bmGame = {
      state: () => this.state,
      busy: () => this.inputBlocked(),
      click: (x, y) => this.onMapClick(x, y),
      key: (key) => this.onKey(new KeyboardEvent("keydown", { key })),
      targets: () => this.targets(),
    };
    // Resume a battle or level-up left pending (not normally saved).
    void this.afterCommand([]);
  }

  // ------------------------------------------------------------ helpers

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

  private hero(): HeroState | undefined {
    return this.state.heroes.find((h) => h.owner === PLAYER && h.alive);
  }

  private player(): GameState["players"][number] | undefined {
    return this.state.players.find((p) => p.id === PLAYER);
  }

  private ownTowns(): string[] {
    return Object.values(this.state.towns)
      .filter((t) => t.owner === PLAYER)
      .map((t) => t.id);
  }

  private inputBlocked(): boolean {
    return this.busy || this.screenOpen || modalOpen() || this.finished;
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

  // ------------------------------------------------------------ layout

  private buildSide(): void {
    const title = el("div.gm-side-title", "Border Marches");
    const buttons = el(
      "div.gm-side-buttons",
      button("Next hero (H)", () => this.selectHero()),
      button("Menu", () => void this.quitToMenu()),
    );
    const endTurn = button(
      "End turn (E)",
      () => void this.endTurn(),
      "gm-btn gm-primary gm-end-turn",
    );
    this.side.append(
      title,
      this.minimap.canvas,
      this.heroPanel,
      this.townPanel,
      buttons,
      endTurn,
      soundControl(),
    );
  }

  private resourceBar(): HTMLElement {
    const player = this.player();
    const income = dailyIncome(this.state, PLAYER);
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

  private renderHeroPanel(): void {
    const hero = this.hero();
    this.heroPanel.replaceChildren();
    if (hero === undefined) return;
    const cls = getHeroClass(hero.heroClass);
    const portrait = img("portrait-dinosaur-chieftain", "gm-hero-portrait", 2);
    portrait.title = "Select and centre (H)";
    portrait.addEventListener("click", () => this.selectHero());
    const nextXp = xpForLevel(hero.level + 1);
    const prevXp = xpForLevel(hero.level);
    const xpPct = Math.max(
      0,
      Math.min(100, ((hero.xp - prevXp) / (nextXp - prevXp)) * 100),
    );
    const mpPct = Math.max(0, Math.min(100, (hero.mp / hero.maxMp) * 100));
    const stats = el(
      "div.gm-hero-stats",
      el("div.gm-hero-name", `${cls.name}, level ${hero.level}`),
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
    this.heroPanel.classList.toggle("gm-selected", this.heroSelected);
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
      (m) => m.owner === PLAYER,
    );
    const counts = RESOURCE_IDS.map((r) => ({
      r,
      n: mines.filter((m) => m.resource === r).length,
    })).filter((c) => c.n > 0);
    this.townPanel.append(
      el(
        "div.gm-kingdom",
        el("div.gm-kingdom-row", "Daily income"),
        costView(dailyIncome(this.state, PLAYER)),
        el(
          "div.gm-kingdom-row",
          mines.length === 0
            ? "No mines yet"
            : `Mines: ${counts.map((c) => `${c.n} ${MINES[c.r].name}${c.n > 1 ? "s" : ""}`).join(", ")}`,
        ),
      ),
    );
  }

  /** Re-syncs every part of the screen with the state. */
  private refresh(): void {
    const objects = displayObjects(this.state);
    const sig = objectsSignature(objects);
    if (sig !== this.objectsSig) {
      this.objectsSig = sig;
      this.view.setObjects(objects);
    }
    this.view.setExplored(this.player()?.explored ?? null);
    this.syncHeroes();
    this.renderBar();
    this.renderHeroPanel();
    this.renderTownPanel();
    this.minimap.update(this.state, PLAYER);
    this.updateViewport();
  }

  private syncHeroes(at?: { x: number; y: number }): void {
    const hero = this.hero();
    this.view.setHeroes(
      hero === undefined
        ? []
        : [
            {
              id: hero.id,
              x: at?.x ?? hero.x,
              y: at?.y ?? hero.y,
              unit: this.heroUnit,
            },
          ],
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
    const text = describeCell(this.state, PLAYER, cell.x, cell.y);
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
        this.selectHero();
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

  private selectHero(): void {
    const hero = this.hero();
    if (hero === undefined) return;
    this.heroSelected = true;
    this.view.centerOn(hero.x, hero.y);
    this.renderHeroPanel();
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
    if (hero === undefined) return;
    if (hero.x === x && hero.y === y) {
      // Clicking the hero selects it; clicking it again in a town opens it.
      if (this.heroSelected) {
        const town = Object.values(this.state.towns).find(
          (t) =>
            t.owner === PLAYER &&
            this.state.map.objects.some(
              (o) => o.id === t.id && o.x === x && o.y === y,
            ),
        );
        if (town !== undefined) {
          void this.openTown(town.id);
          return;
        }
      }
      this.heroSelected = true;
      this.clearPlan();
      this.renderHeroPanel();
      return;
    }
    if (!this.heroSelected) return;
    // Clicking any cell of a town or mine targets its entrance.
    let tx = x;
    let ty = y;
    const obj = objectAt(displayObjects(this.state), x, y);
    if (obj !== undefined && (obj.kind === "town" || obj.kind === "mine")) {
      tx = obj.x;
      ty = obj.y;
      if (obj.kind === "town" && hero.x === tx && hero.y === ty) {
        if (this.state.towns[obj.id]?.owner === PLAYER)
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
    if (guard !== null) toast(`Guarded by ${guard}: click again to attack`);
  }

  /** The stack the planned walk ends up fighting, as "a pack of 11 Skeletons". */
  private planGuard(): string | null {
    const steps = this.plan?.path.steps ?? [];
    const last = steps[steps.length - 1];
    if (last === undefined) return null;
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
      : stackPhrase(guard.creature, guard.count);
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
      moved === undefined ||
      moved.type !== "moved" ||
      moved.cells.length === 0
    ) {
      if (moved?.type === "moved" && moved.stop === "no-mp") {
        toast("No movement points left today (E ends the turn)");
        return;
      }
    }
    this.busy = true;
    this.tooltip.style.display = "none";
    if (moved?.type === "moved") await this.animateWalk(hero, moved.cells);
    this.state = result.state;
    const arrived =
      moved?.type === "moved" && moved.stop === "no-mp" ? false : true;
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
      this.view.setHeroes([{ id: hero.id, x, y, unit: this.heroUnit }]);
      this.view.centerOn(x, y);
      this.updateViewport();
      playSound("hero.step", { jitter: 0.08 });
      await wait(STEP_MS);
    }
  }

  // ------------------------------------------------------------ events

  /** Reacts to a command's events, then any pending battle or level-up. */
  private async afterCommand(events: readonly GameEvent[]): Promise<void> {
    this.busy = true;
    try {
      let openTown: string | null = null;
      for (const e of events) {
        switch (e.type) {
          case "pickup":
            playSound(pickupCue(e.resource));
            toast(
              `+${e.amount} ${RESOURCE_NAMES[e.resource].toLowerCase()}`,
              "gain",
            );
            break;
          case "mine-flagged": {
            playSound("pickup");
            const mine = this.state.mines[e.mineId];
            if (mine !== undefined) {
              const def = MINES[mine.resource];
              toast(
                `${def.name} claimed: +${def.income} ${mine.resource} per day`,
                "gain",
              );
            }
            break;
          }
          case "xp":
            toast(`+${e.amount} experience`, "gain");
            break;
          case "town-captured":
            playSound("new-week");
            toast(
              `${this.state.towns[e.townId]?.name ?? "Town"} captured!`,
              "gain",
            );
            break;
          case "chest-offer":
            await this.chest(e.heroId, e.pickupId);
            break;
          case "visit-town":
            openTown = e.townId;
            break;
          default:
            break;
        }
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
      const hero = this.hero();
      if (
        hero === undefined ||
        hero.pendingLevelUps <= 0 ||
        this.state.status !== "playing"
      )
        return;
      const offers = levelUpOffers(this.state, hero.id);
      if (offers.length === 0) return;
      const level = hero.level - hero.pendingLevelUps + 1;
      playSound("level-up");
      const choice = await modal({
        title: `Level ${level}!`,
        className: "gm-levelup",
        body: el(
          "div.gm-levelup-body",
          img("portrait-dinosaur-chieftain", "gm-levelup-portrait", 2),
          el(
            "div",
            el("p", "Your Chieftain has gained a level. Choose a reward:"),
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

  private async battles(): Promise<void> {
    while (
      this.state.pendingBattle !== null &&
      this.state.status === "playing"
    ) {
      const setup = battleSetup(this.state);
      if (setup === null) return;
      const pending = this.state.pendingBattle;
      let title: string;
      let phrase: string;
      if (pending.kind === "monster") {
        const m = this.state.monsters[pending.objectId];
        phrase =
          m === undefined
            ? "Monsters"
            : capitalize(stackPhrase(m.creature, m.count));
        title = "Neutral monsters";
      } else {
        const town = this.state.towns[pending.objectId];
        title = town?.name ?? "Town";
        phrase = `The garrison of ${town?.name ?? "the town"}`;
      }
      const list = el("ul.gm-enemy-list");
      for (const s of setup.defender.stacks)
        list.append(el("li", creatureCount(s.creature, s.count)));
      const ownList = el("ul.gm-enemy-list");
      for (const s of setup.attacker.stacks)
        ownList.append(el("li", creatureCount(s.creature, s.count)));
      const choice = await modal<"fight" | "auto">({
        title,
        className: "gm-battle-confirm",
        body: el(
          "div",
          el(
            "p.gm-phrase",
            `${phrase} ${pending.kind === "monster" ? "attack!" : "stands ready."}`,
          ),
          el(
            "div.gm-versus",
            el("div", el("h3", "Your army"), ownList),
            el("div", el("h3", "Enemy"), list),
          ),
          el(
            "p.gm-dim",
            "There is no retreat: if your army falls, the game is lost.",
          ),
        ),
        buttons: [
          { label: "Fight", value: "fight", primary: true },
          { label: "Quick combat", value: "auto" },
        ],
      });
      this.screenOpen = true;
      const result = await openBattleScreen(this.host, setup, {
        autoResolve: choice === "auto",
      });
      this.screenOpen = false;
      const applied = applyBattleResult(this.state, result);
      if (!applied.ok) {
        toast(applied.message);
        return;
      }
      this.state = applied.state;
      this.refresh();
      for (const e of applied.events) {
        if (e.type === "xp") toast(`+${e.amount} experience`, "gain");
        if (e.type === "town-captured") {
          playSound("new-week");
          toast("Town captured!", "gain");
        }
      }
      if (this.checkEnd()) return;
      await this.levelUps();
      // A won fight on an object entrance may visit it (pickups, chests).
      const visits = applied.events.filter(
        (e) =>
          e.type === "pickup" ||
          e.type === "chest-offer" ||
          e.type === "mine-flagged",
      );
      for (const e of visits) {
        if (e.type === "pickup") playSound(pickupCue(e.resource));
        if (e.type === "mine-flagged") playSound("pickup");
        if (e.type === "pickup")
          toast(
            `+${e.amount} ${RESOURCE_NAMES[e.resource].toLowerCase()}`,
            "gain",
          );
        if (e.type === "chest-offer") await this.chest(e.heroId, e.pickupId);
        if (e.type === "mine-flagged") toast("Mine claimed", "gain");
      }
      await this.levelUps();
    }
  }

  // ------------------------------------------------------------ turn

  private async endTurn(): Promise<void> {
    if (this.inputBlocked()) return;
    const events = this.run(endDay(this.state));
    if (events === null) return;
    saveGame(browserStorage(), this.state);
    const week = events.some((e) => e.type === "new-week");
    playSound(week ? "new-week" : "new-day");
    if (week)
      toast(
        `Week ${calendar(this.state.day).weekOfGame}: creatures grow`,
        "week",
      );
    else toast(dateLabel(this.state.day));
    if (this.plan !== null && !this.planTo(this.plan.x, this.plan.y))
      this.clearPlan();
  }

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
    this.refresh();
    if (this.plan !== null && !this.planTo(this.plan.x, this.plan.y))
      this.clearPlan();
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
    const hero = this.hero();
    const screen = el(
      "div.gm-end",
      el(
        "div.gm-end-box",
        el("h1", won ? "Victory!" : "Defeat"),
        el(
          "p",
          won
            ? "The Warlord's Hold has fallen. The border marches belong to the Lost World."
            : "Your Chieftain has fallen in battle, and with him the hopes of the tribe.",
        ),
        el(
          "p.gm-dim",
          `Month ${c.month}, week ${c.week}, day ${c.dayOfWeek} (day ${this.state.day})` +
            (hero !== undefined ? `. Chieftain level ${hero.level}.` : "."),
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
