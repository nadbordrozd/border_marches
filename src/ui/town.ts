/**
 * The town screen: a header with the town's income, fort level and the
 * day's build as icons and the Tavern and Marketplace buttons; the town
 * picture with every built dwelling's stock; the build grid as a Heroes
 * hall (bead bzc.60, UI_V2.md UI2-09): rows Hall, Fort, Economy, Specials
 * and Magic, then the dwellings in tier columns, each building a compact
 * tile coloured by state, and a detail pane beside the grid with the
 * selected building's picture, effect, cost, requirements and the Build
 * button; then the garrison and visiting-hero rows with click-to-swap/merge
 * (shift-click splits in half).
 */
import {
  FOREST_SETS,
  GROUND_TEXTURES,
  TOWN_ASSETS,
} from "../assets/manifest.ts";
import { buildingArt, townArt, townBackdrop } from "../assets/town-art.ts";
import {
  build,
  buildStatus,
  fortLevel,
  hasMarketplace,
  heroInTownOf,
  hireHero,
  tavernOffer,
  marketQuote,
  marketTrade,
  maxAffordable,
  recruit,
  scaleResources,
  townIncome,
  transferStack,
} from "../core/game/index.ts";
import type {
  CommandResult,
  GameState,
  SlotRef,
  TownState,
} from "../core/game/index.ts";
import type { ResourceId } from "../core/map/types.ts";
import { playSound } from "../audio/sound.ts";
import { recruitCue, townCue } from "../audio/cues.ts";
import { fxEvent } from "../audio/fx.ts";
import { bump, countUp } from "./anim.ts";
import { buildingDef, FORT_DEFENSE, townTree } from "../data/factions.ts";
import { getHeroClass } from "../data/hero.ts";
import { namedHeroPortrait } from "../assets/unit-art.ts";
import { findHeroDef, HIRE_COST, MAX_HEROES } from "../data/players.ts";
import { getCreature } from "../data/creatures.ts";
import {
  MARKET_BUY_PRICE,
  MARKET_SELL_PRICE,
  RESOURCE_IDS,
  RESOURCE_NAMES,
} from "../data/economy.ts";
import type { BuildingId, CreatureId } from "../data/types.ts";
import { armyRow } from "./army.ts";
import { specialtyText } from "../core/game/effects.ts";
import { abilityText, creatureTip, unlockedBy } from "./info-tips.ts";
import { findFaction } from "../data/factions.ts";
import { setTip, tipCard } from "./tooltip.ts";
import { creatureAbilities } from "../data/creatures.ts";
import { townLevel } from "./objects.ts";
import {
  blockedReason,
  hallLayout,
  TILE_STATE_LABEL,
  tileState,
} from "./town-hall.ts";
import type { HallGroupId, HallLayout, TileState } from "./town-hall.ts";
import {
  button,
  costView,
  el,
  img,
  imageUrl,
  keyButton,
  modal,
  resourceIcon,
} from "./dom.ts";

export interface TownHost {
  state(): GameState;
  /** Applies a command result (toasts the error when it failed). */
  run(result: CommandResult): boolean;
  /** The resource bar element to show at the top (kept up to date by the host). */
  resourceBar(): HTMLElement;
}

/**
 * The hall's rows on screen, two to a line where they fit: Hall beside
 * Fort, Economy beside Specials, then Magic (up to five guilds) on a line
 * of its own, then the dwellings.
 */
const SCREEN_ROWS: readonly HallGroupId[] = [
  "hall",
  "fort",
  "economy",
  "specials",
  "magic",
];

/** The building the detail pane opens on: the first one buildable today. */
function firstChoice(
  state: GameState,
  town: TownState,
  layout: HallLayout,
): BuildingId | null {
  const ids = [
    ...SCREEN_ROWS.flatMap(
      (g) => layout.groups.find((x) => x.id === g)?.buildings ?? [],
    ),
    ...layout.dwellings.flatMap((c) => c.buildings),
  ];
  const look = (id: BuildingId): TileState =>
    tileState(state, town.id, id).state;
  return (
    ids.find((id) => look(id) === "can") ??
    ids.find((id) => look(id) !== "built") ??
    ids[0] ??
    null
  );
}

export function openTownScreen(host: TownHost, townId: string): Promise<void> {
  return new Promise((resolve) => {
    const root = el("div.gm-town");
    (document.getElementById("ui") ?? document.body).append(root);
    let selected: SlotRef | null = null;
    /** The building in the detail pane (kept across renders). */
    let chosen: BuildingId | null = null;
    // A one-shot of the faction's town life as the screen opens.
    const ambience = townCue(host.state().towns[townId]?.faction);
    if (ambience !== null) playSound(ambience);

    const close = (): void => {
      window.removeEventListener("keydown", onKey);
      root.remove();
      resolve();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (document.querySelector(".gm-backdrop:not(.gm-closing)") !== null)
        return;
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);

    const run = (result: CommandResult): boolean => {
      const ok = host.run(result);
      render();
      return ok;
    };

    const doBuild = (id: BuildingId): void => {
      if (run(build(host.state(), townId, id))) {
        playSound("build");
        // The new building flashes gold and settles (bead bzc.26).
        fxEvent("ui.build.complete");
        bump(
          root.querySelector(`.gm-hall [data-building="${id}"]`),
          "gm-just-built",
        );
      }
    };

    const recruitFrom = (creature: CreatureId): void => {
      const left =
        host.state().towns[townId]?.dwellings[creature]?.available ?? 0;
      void openRecruit(host, townId, creature).then(() => {
        render();
        // The stock counts down to what is left (bead bzc.26).
        const now = host.state().towns[townId]?.dwellings[creature]?.available;
        const node = root.querySelector<HTMLElement>(
          `[data-stock="${creature}"]`,
        );
        const count = node?.querySelector<HTMLElement>(".gm-stock-count");
        if (node && count && now !== undefined && now !== left) {
          fxEvent("ui.recruit.count");
          bump(node);
          void countUp(count, left, now, 420);
        }
      });
    };

    /** Selects a building: the tiles' outline and the detail pane follow. */
    const choose = (id: BuildingId): void => {
      chosen = id;
      const state = host.state();
      const town = state.towns[townId];
      if (town === undefined) return;
      for (const t of root.querySelectorAll<HTMLElement>(".gm-hall-tile")) {
        const on = t.dataset["building"] === id;
        t.classList.toggle("gm-selected", on);
        t.setAttribute("aria-pressed", String(on));
      }
      root
        .querySelector(".gm-hall-detail")
        ?.replaceWith(detailPane(state, town, id));
    };

    const render = (): void => {
      const state = host.state();
      const town = state.towns[townId];
      if (town === undefined) {
        close();
        return;
      }
      const hero = heroInTownOf(state, town);
      root.replaceChildren();
      root.append(header(state, town));

      // ------------------------------------------------ picture + stock
      const picture = el("div.gm-town-view");
      const backdrop = townBackdrop(town.faction);
      if (backdrop !== null) {
        // v0.2 factions (bead bzc.15): the faction's backdrop and its 3x2
        // town at the fort level built, both at x2.
        picture.classList.add("gm-town-view-faction");
        picture.style.backgroundImage = `url("${imageUrl(backdrop.key)}")`;
        picture.append(
          img(
            townArt(town.faction, fortLevel(town)).key,
            "gm-town-city gm-town-city-3x2",
            2,
          ),
        );
      } else {
        picture.style.backgroundImage = `url("${imageUrl(GROUND_TEXTURES.jungle.key)}")`;
        const sky = el("div.gm-town-sky");
        picture.append(sky);
        const trees = FOREST_SETS.jungle.pieces.filter(
          (p) => p.shape === "2x2",
        );
        const left = trees[0];
        const right = trees[1] ?? trees[0];
        if (left !== undefined)
          picture.append(img(left.key, "gm-town-tree gm-town-tree-l", 2));
        if (right !== undefined)
          picture.append(img(right.key, "gm-town-tree gm-town-tree-r", 2));
        const art =
          TOWN_ASSETS.find(
            (t) =>
              t.faction === (townTree(town.faction)?.art ?? "dinosaur") &&
              t.level === townLevel(town),
          ) ?? TOWN_ASSETS[0];
        if (art !== undefined) picture.append(img(art.key, "gm-town-city", 3));
      }

      // Every built dwelling's stock at a glance, as the Heroes II castle
      // screen shows it (bead bzc.25).
      const stock = el("div.gm-town-stock", el("h3.gm-rule", "Recruit"));
      const dwellings = (townTree(town.faction)?.order ?? [])
        .map((b) => buildingDef(town.faction, b))
        .filter(
          (d) =>
            d !== undefined &&
            d.dwelling !== undefined &&
            town.buildings.includes(d.id),
        );
      const stockRow = el("div.gm-stock-row");
      for (const d of dwellings) {
        const creature = d?.dwelling;
        if (creature === undefined) continue;
        const c = getCreature(creature);
        const left = town.dwellings[creature]?.available ?? 0;
        const cell = el(
          "button.gm-stock",
          img(`portrait-${c.sprite}`, "gm-stock-portrait"),
          el("span.gm-stock-count", String(left)),
        );
        cell.type = "button";
        cell.dataset["stock"] = creature;
        cell.disabled = left <= 0;
        cell.setAttribute("aria-label", `Recruit ${c.plural}: ${left}`);
        setTip(cell, () => creatureTip(creature));
        cell.addEventListener("click", () => recruitFrom(creature));
        stockRow.append(cell);
      }
      stock.append(
        dwellings.length === 0
          ? el("div.gm-dim", "No dwellings yet: build one to recruit.")
          : stockRow,
      );

      // ------------------------------------------------ the hall
      const body = el(
        "div.gm-town-body",
        el("div.gm-town-left", picture, stock),
      );
      const tree = townTree(town.faction);
      if (tree === undefined) {
        body.append(
          el(
            "div.gm-hall-none",
            "Nothing can be built here: this town belongs to no faction.",
          ),
        );
      } else {
        const layout = hallLayout(tree);
        if (chosen === null || buildingDef(town.faction, chosen) === undefined)
          chosen = firstChoice(state, town, layout);
        body.append(
          hallGrid(state, town, layout),
          detailPane(state, town, chosen),
        );
      }
      root.append(body);

      // ------------------------------------------------ armies
      const onSlot =
        (army: SlotRef["army"]) => (slot: number, e: MouseEvent) => {
          const here: SlotRef = { army, slot };
          const source = army === "hero" ? hero?.army : town.garrison;
          if (selected === null) {
            if (source?.[slot] != null) selected = here;
            render();
            return;
          }
          if (selected.army === army && selected.slot === slot) {
            selected = null;
            render();
            return;
          }
          const from = selected;
          const fromArmy = from.army === "hero" ? hero?.army : town.garrison;
          const stack = fromArmy?.[from.slot];
          selected = null;
          if (stack == null) {
            render();
            return;
          }
          const count = e.shiftKey ? Math.floor(stack.count / 2) : undefined;
          if (count === 0) {
            render();
            return;
          }
          run(
            transferStack(state, {
              ...(hero !== undefined ? { heroId: hero.id } : {}),
              townId: town.id,
              from,
              to: here,
              ...(count !== undefined ? { count } : {}),
            }),
          );
        };
      const armies = el("div.gm-town-armies");
      armies.append(
        el(
          "div.gm-army-line",
          el("div.gm-army-label", "Garrison"),
          armyRow(town.garrison, {
            selected: selected?.army === "garrison" ? selected.slot : null,
            onClick: onSlot("garrison"),
          }),
        ),
      );
      armies.append(
        el(
          "div.gm-army-line",
          el("div.gm-army-label", hero !== undefined ? hero.name : "No hero"),
          hero !== undefined
            ? armyRow(hero.army, {
                selected: selected?.army === "hero" ? selected.slot : null,
                onClick: onSlot("hero"),
              })
            : el(
                "div.gm-army-empty",
                "No hero is visiting. Recruits join the garrison.",
              ),
        ),
      );
      armies.append(
        el(
          "div.gm-hint",
          "Click a stack, then a slot: move, merge or swap. Shift-click the target to split the stack in half.",
        ),
      );
      root.append(el("div.gm-town-footer", armies));
    };

    /**
     * The header: name and faction, then income, fort level and the day's
     * build as icons with numbers (UI2-09 P3), the resources, the Tavern
     * and Marketplace buttons and Leave.
     */
    const header = (state: GameState, town: TownState): HTMLElement => {
      const faction = findFaction(town.faction);
      const chip = el("span.gm-town-chip.gm-town-chip-big");
      chip.style.background = faction?.colour ?? "#6b5a3e";
      const income = townIncome(town);
      const level = fortLevel(town);
      const stat = (...children: Array<Node | string | null>): HTMLElement =>
        el("span.gm-town-stat", ...children);
      const earns = RESOURCE_IDS.some((r) => income[r] > 0);
      const incomeStat = earns
        ? stat(costView(income), el("span.gm-dim", "/day"))
        : stat("No income");
      setTip(incomeStat, () =>
        tipCard("Income", [
          el("div.gm-tip-line", "Every day: ", costView(income)),
          "The best hall pays the gold; a Resource Silo and specials add to it.",
        ]),
      );
      const fortArt =
        level > 0 ? buildingArt(town.faction, `fort-${level}`) : null;
      const fortStat = stat(
        fortArt !== null ? img(fortArt.key, "gm-town-stat-art") : null,
        level === 0 ? "No fort" : `Fort ${level}`,
      );
      setTip(fortStat, () =>
        tipCard(level === 0 ? "No fort" : `Fort level ${level}`, [
          level === 0
            ? "Defenders fight without a wall bonus. Build a fort to raise their Defense."
            : `Defending stacks get +${FORT_DEFENSE[level] ?? 0} Defense${level >= 3 ? " and a tower shoots" : ""}.`,
        ]),
      );
      // Only a town with a building tree has a day's build to show.
      const buildable = townTree(town.faction) !== undefined;
      const buildStat = stat(
        el(`span.gm-town-dot${town.builtToday ? ".gm-town-dot-done" : ""}`),
        town.builtToday ? "Built today" : "Can build today",
      );
      buildStat.dataset["built"] = String(town.builtToday);
      setTip(buildStat, () =>
        tipCard(town.builtToday ? "Built today" : "Can build today", [
          "Each town raises one building a day.",
          town.builtToday
            ? "The next one can go up tomorrow."
            : "Pick a green building below and press Build.",
        ]),
      );

      const tool = (
        label: string,
        artId: BuildingId,
        onClick: () => void,
      ): HTMLButtonElement => {
        const b = button("", onClick, "gm-btn gm-town-tool");
        const art = buildingArt(town.faction, artId);
        if (art !== null) b.append(img(art.key, "gm-town-tool-art"));
        b.append(el("span", label));
        return b;
      };
      const tavernButton = tool("Tavern", "tavern", () => {
        void openTavern(host, town.id, render);
      });
      tavernButton.disabled = town.owner === null;
      const market = tool("Marketplace", "marketplace", () => {
        void openMarket(host, render).then(render);
      });
      market.disabled =
        town.owner === null || !hasMarketplace(state, town.owner);
      if (market.disabled) market.title = "Build a Marketplace first";

      return el(
        "div.gm-town-header",
        el(
          "div.gm-town-title",
          el("h1.gm-town-name", chip, town.name),
          el(
            "div.gm-town-sub",
            el("span.gm-town-faction", faction?.name ?? "Town"),
            incomeStat,
            fortStat,
            buildable ? buildStat : null,
          ),
        ),
        host.resourceBar(),
        tavernButton,
        market,
        keyButton("Leave", "Esc", close, "gm-btn gm-primary"),
      );
    };

    /** The hall: rows of tiles on a six-column grid, then the dwellings. */
    const hallGrid = (
      state: GameState,
      town: TownState,
      layout: HallLayout,
    ): HTMLElement => {
      const grid = el("div.gm-hall");
      if (town.builtToday) grid.classList.add("gm-hall-today");
      for (const gid of SCREEN_ROWS) {
        const group = layout.groups.find((g) => g.id === gid);
        if (group === undefined || group.buildings.length === 0) continue;
        const box = el(
          "div.gm-hall-group",
          el("div.gm-hall-label", group.label),
        );
        box.dataset["group"] = group.id;
        box.style.gridColumn = `span ${group.buildings.length <= 3 ? 3 : 6}`;
        for (const id of group.buildings) box.append(tile(state, town, id));
        grid.append(box);
      }
      if (layout.dwellings.length > 0) {
        const box = el(
          "div.gm-hall-group.gm-hall-dwellings",
          el("div.gm-hall-label", "Dwellings"),
        );
        box.dataset["group"] = "dwellings";
        layout.dwellings.forEach((column, i) => {
          column.buildings.forEach((id, row) => {
            const t = tile(state, town, id);
            t.style.gridColumn = String(i + 1);
            t.style.gridRow = String(row + 2);
            box.append(t);
          });
        });
        grid.append(box);
      }
      return grid;
    };

    /** One building: its picture and a name bar coloured by its state. */
    const tile = (
      state: GameState,
      town: TownState,
      id: BuildingId,
    ): HTMLElement => {
      const def = buildingDef(town.faction, id);
      if (def === undefined) return el("div");
      const { state: look, status } = tileState(state, town.id, id);
      const b = el("button.gm-building.gm-hall-tile");
      b.type = "button";
      b.classList.add(`gm-hall-${look}`);
      // A Drill is an add-on of the dwelling above it: a smaller tile.
      if (def.drill !== undefined) b.classList.add("gm-hall-drill");
      b.dataset["building"] = id;
      b.dataset["state"] = look;
      const on = id === chosen;
      if (on) b.classList.add("gm-selected");
      b.setAttribute("aria-pressed", String(on));
      b.setAttribute("aria-label", `${def.name}: ${TILE_STATE_LABEL[look]}`);
      const pic = el("span.gm-hall-art");
      const art = buildingArt(town.faction, id);
      if (art !== null) pic.append(img(art.key, "gm-hall-art-img"));
      const creature = def.dwelling ?? def.drill?.creature;
      if (creature !== undefined)
        pic.append(
          img(`portrait-${getCreature(creature).sprite}`, "gm-hall-portrait"),
        );
      b.append(pic, el("span.gm-hall-name", def.name));
      setTip(b, () =>
        tipCard(def.name, [
          def.effect,
          el(
            `div.gm-tip-line.gm-hall-tip-${look}`,
            look === "can" && status === "built-today"
              ? "Ready tomorrow"
              : TILE_STATE_LABEL[look],
          ),
        ]),
      );
      b.addEventListener("click", () => choose(id));
      // A double click on a green tile builds at once.
      b.addEventListener("dblclick", () => {
        if (buildStatus(host.state(), townId, id) === "ok") doBuild(id);
      });
      return b;
    };

    /** The selected building's full card with the Build button. */
    const detailPane = (
      state: GameState,
      town: TownState,
      id: BuildingId | null,
    ): HTMLElement => {
      const pane = el("div.gm-hall-detail");
      const def = id === null ? undefined : buildingDef(town.faction, id);
      if (id === null || def === undefined) {
        pane.append(el("div.gm-dim", "Pick a building to see what it does."));
        return pane;
      }
      const { state: look, status } = tileState(state, town.id, id);
      const built = look === "built";
      const have = state.players.find((p) => p.id === town.owner)?.resources;
      pane.dataset["building"] = id;
      pane.dataset["state"] = look;
      const name = (b: BuildingId): string =>
        buildingDef(town.faction, b)?.name ?? b;
      /** A building name that selects that building. */
      const link = (b: BuildingId, cls: string): HTMLElement => {
        const node = button(name(b), () => choose(b), `gm-hall-link ${cls}`);
        return node;
      };

      const pic = el("div.gm-hall-detail-art");
      const art = buildingArt(town.faction, id);
      if (art !== null) pic.append(img(art.key, "", 2));
      const creature = def.dwelling;
      if (creature !== undefined)
        pic.append(
          img(
            `portrait-${getCreature(creature).sprite}`,
            "gm-hall-detail-portrait",
          ),
        );
      pane.append(
        el("h2.gm-hall-detail-name", def.name),
        look === "can" && status === "built-today"
          ? el("div.gm-hall-badge.gm-hall-badge-tomorrow", "Ready tomorrow")
          : el(
              `div.gm-hall-badge.gm-hall-badge-${look}`,
              TILE_STATE_LABEL[look],
            ),
        pic,
        el("div.gm-hall-effect", def.effect),
      );
      if (creature !== undefined) {
        const c = getCreature(creature);
        const line = el(
          "div.gm-hall-line",
          `${c.plural}: +${c.growth} a week`,
          built
            ? `, ${town.dwellings[creature]?.available ?? 0} to recruit`
            : "",
        );
        setTip(line, () => creatureTip(creature));
        pane.append(line);
      }
      if (!built) {
        const free = RESOURCE_IDS.every((r) => (def.cost[r] ?? 0) <= 0);
        pane.append(
          el(
            "div.gm-hall-row",
            el("span.gm-hall-key", "Cost"),
            free
              ? el("span", def.needsKeystone === true ? "The Keystone" : "Free")
              : costView(def.cost, have),
          ),
        );
        if (def.requires.length > 0) {
          pane.append(
            el(
              "div.gm-hall-row",
              el("span.gm-hall-key", "Needs"),
              el(
                "span.gm-hall-links",
                ...def.requires.map((r) =>
                  link(
                    r,
                    town.buildings.includes(r)
                      ? "gm-hall-met"
                      : "gm-hall-missing",
                  ),
                ),
              ),
            ),
          );
        }
      }
      const unlocks = unlockedBy(town.faction, id);
      if (unlocks.length > 0) {
        pane.append(
          el(
            "div.gm-hall-row",
            el("span.gm-hall-key", "Opens"),
            el(
              "span.gm-hall-links",
              ...unlocks.map((u) => link(u, "gm-hall-plain")),
            ),
          ),
        );
      }
      const actions = el("div.gm-hall-actions");
      if (built) {
        if (creature !== undefined) {
          const stock = town.dwellings[creature]?.available ?? 0;
          const b = button(
            `Recruit (${stock})`,
            () => recruitFrom(creature),
            "gm-btn gm-primary",
          );
          b.disabled = stock <= 0;
          if (stock <= 0)
            b.title =
              "None left this week: dwellings grow on day 1 of each week.";
          actions.append(b);
        }
      } else {
        // The reason, when the badge does not already say it.
        const why =
          status === "resources" || status === "requirements"
            ? null
            : blockedReason(status);
        if (why !== null) actions.append(el("div.gm-hall-why", why));
        const b = button("Build", () => doBuild(id), "gm-btn gm-primary");
        b.disabled = status !== "ok";
        actions.append(b);
      }
      pane.append(actions);
      return pane;
    };

    render();
  });
}

/**
 * The tavern (RULES_V2 5.4): this week's offer and retreated heroes. Hiring
 * closes the dialog; `changed` re-renders the town behind it.
 */
async function openTavern(
  host: TownHost,
  townId: string,
  changed: () => void,
): Promise<void> {
  let closeButton: HTMLButtonElement | null = null;
  const body = el("div.gm-tavern");
  const render = (): void => {
    body.replaceChildren();
    const state = host.state();
    const town = state.towns[townId];
    if (town === undefined || town.owner === null) return;
    const player = state.players.find((p) => p.id === town.owner);
    const obj = state.map.objects.find((o) => o.id === town.id);
    const occupied = state.heroes.some(
      (h) => h.alive && h.x === obj?.x && h.y === obj?.y,
    );
    const count = state.heroes.filter(
      (h) => h.alive && h.owner === town.owner,
    ).length;
    const offer = tavernOffer(state, town.owner);
    if (offer.length === 0) {
      body.append(el("div.gm-dim", "Nobody this week. New faces next week."));
    }
    for (const entry of offer) {
      const def = findHeroDef(entry.defId);
      if (def === undefined) continue;
      const known = state.heroes.find((h) => h.defId === entry.defId);
      const level = known?.level ?? 1;
      const reason = occupied
        ? "A hero stands in the town gate"
        : count >= MAX_HEROES
          ? `At most ${MAX_HEROES} heroes`
          : (player?.resources.gold ?? 0) < HIRE_COST
            ? "Not enough gold"
            : null;
      const hire = button(
        `Hire (${HIRE_COST} gold)`,
        () => {
          if (host.run(hireHero(host.state(), townId, entry.defId))) {
            playSound("recruit");
            changed();
            closeButton?.click();
          } else render();
        },
        "gm-btn gm-primary",
      );
      hire.disabled = reason !== null;
      if (reason !== null) hire.title = reason;
      const row = el(
        "div.gm-tavern-hero",
        img(
          namedHeroPortrait(entry.defId, def.heroClass).key,
          "gm-tavern-portrait",
        ),
        el(
          "div.gm-tavern-text",
          el("div.gm-tavern-name", def.name),
          el(
            "div.gm-dim",
            `${getHeroClass(def.heroClass).name}, level ${level}` +
              (entry.retreated ? " (retreated)" : ""),
          ),
          def.specialty !== undefined
            ? el("div.gm-tavern-spec", specialtyText(def.specialty))
            : null,
        ),
        hire,
      );
      setTip(row.querySelector(".gm-tavern-text") ?? row, () =>
        tipCard(
          def.name,
          [
            def.specialty !== undefined
              ? `Specialty: ${specialtyText(def.specialty)}`
              : null,
            entry.retreated
              ? "Retreated from a battle: comes back with the army left at home."
              : "Comes with a small starting army.",
            `Hiring costs ${HIRE_COST} gold; the hero appears in the town gate.`,
          ],
          {
            icon: img(namedHeroPortrait(entry.defId, def.heroClass).key),
            subtitle: `${getHeroClass(def.heroClass).name}, level ${level}`,
          },
        ),
      );
      body.append(row);
    }
  };
  render();
  await modal<undefined>({
    title: "Tavern",
    body,
    buttons: [{ label: "Close", value: undefined }],
    cancel: undefined,
    onOpen: (buttons) => {
      closeButton = buttons[0] ?? null;
    },
  });
}

/** The recruit dialog for one dwelling: slider, Max, total cost. */
async function openRecruit(
  host: TownHost,
  townId: string,
  creature: CreatureId,
): Promise<void> {
  const state = host.state();
  const town = state.towns[townId];
  const player = state.players.find((p) => p.id === town?.owner);
  if (town === undefined || player === undefined) return;
  const def = getCreature(creature);
  const stock = town.dwellings[creature]?.available ?? 0;
  const max = Math.max(
    0,
    Math.min(stock, maxAffordable(player.resources, def.cost)),
  );
  let count = max;

  const slider = el("input.gm-slider");
  slider.type = "range";
  slider.min = "0";
  slider.max = String(max);
  slider.value = String(count);
  const number = el("span.gm-recruit-count");
  const total = el("div.gm-recruit-total");
  let recruitButton: HTMLButtonElement | null = null;
  const update = (): void => {
    number.textContent = `${count} / ${stock}`;
    total.replaceChildren(
      "Total: ",
      costView(scaleResources(def.cost, count), player.resources),
    );
    if (recruitButton !== null) recruitButton.disabled = count < 1;
  };
  slider.addEventListener("input", () => {
    count = Number(slider.value);
    update();
  });
  const maxButton = button("Max", () => {
    count = max;
    slider.value = String(max);
    update();
  });
  const body = el(
    "div.gm-recruit",
    el(
      "div.gm-recruit-top",
      setTip(img(`portrait-${def.sprite}`, "gm-recruit-portrait", 2), () =>
        creatureTip(creature),
      ),
      el(
        "div.gm-recruit-stats",
        el("div", `Attack ${def.attack}  Defense ${def.defense}`),
        el("div", `Damage ${def.damage}  Health ${def.hp}`),
        el(
          "div",
          `Speed ${def.speed}${def.shots > 0 ? `  Shots ${def.shots}` : ""}`,
        ),
        el("div", "Cost each: ", costView(def.cost)),
        el("div", `Available: ${stock} · growth ${def.growth} a week`),
      ),
    ),
    creatureAbilities(def).length > 0
      ? el(
          "div.gm-recruit-abilities",
          ...creatureAbilities(def).map((a) => {
            const t = abilityText(a);
            return el(
              "div",
              el("b", t.name),
              t.text === "" ? "" : `: ${t.text}`,
            );
          }),
        )
      : null,
    el("div.gm-recruit-row", slider, number, maxButton),
    total,
  );
  update();
  const choice = await modal<"recruit" | "cancel">({
    title: `Recruit ${def.plural}`,
    body,
    buttons: [
      {
        label: "Recruit",
        value: "recruit",
        primary: true,
        disabled: count < 1,
      },
      { label: "Cancel", value: "cancel" },
    ],
    cancel: "cancel",
    onOpen: (buttons) => {
      recruitButton = buttons[0] ?? null;
    },
  });
  if (choice === "recruit" && count > 0) {
    if (host.run(recruit(host.state(), townId, creature, count)))
      playSound(recruitCue(getCreature(creature).faction));
  }
}

/**
 * The marketplace: pick what to give and what to get, an amount, trade.
 * `traded` runs after each trade, so the town header's resource totals
 * behind the dialog stay current (bead xaj.18).
 */
async function openMarket(
  host: TownHost,
  traded: () => void = () => {},
): Promise<void> {
  let give: ResourceId = "wood";
  let get: ResourceId = "gold";
  let amount = 1;
  const body = el("div.gm-market");
  const render = (): void => {
    const state = host.state();
    const player = state.players.find((p) => p.id === state.currentPlayer);
    if (player === undefined) return;
    const have = player.resources[give];
    amount = Math.max(0, Math.min(amount, have));
    body.replaceChildren();
    const column = (
      title: string,
      current: ResourceId,
      pick: (r: ResourceId) => void,
      price: (r: ResourceId) => string,
    ): HTMLElement => {
      const col = el("div.gm-market-col", el("h3", title));
      for (const r of RESOURCE_IDS) {
        const b = el(
          "button.gm-market-res",
          resourceIcon(r),
          el("span", RESOURCE_NAMES[r]),
          el("small", price(r)),
        );
        b.type = "button";
        if (r === current) b.classList.add("gm-selected");
        b.addEventListener("click", () => {
          pick(r);
          render();
        });
        col.append(b);
      }
      return col;
    };
    body.append(
      el(
        "div.gm-market-cols",
        column(
          "Give",
          give,
          (r) => {
            give = r;
            amount = 1;
            if (get === give) get = give === "gold" ? "wood" : "gold";
          },
          (r) => `${player.resources[r]} (sells ${MARKET_SELL_PRICE[r]}g)`,
        ),
        column(
          "Get",
          get,
          (r) => {
            get = r;
            if (get === give) give = get === "gold" ? "wood" : "gold";
          },
          (r) => `costs ${MARKET_BUY_PRICE[r]}g`,
        ),
      ),
    );
    const slider = el("input.gm-slider");
    slider.type = "range";
    slider.min = "0";
    slider.max = String(have);
    slider.step = give === "gold" ? "50" : "1";
    slider.value = String(amount);
    const quote = marketQuote(give, amount, get);
    const summary = el(
      "div.gm-market-quote",
      `Give ${amount} ${RESOURCE_NAMES[give].toLowerCase()} for ${quote.receive} ${RESOURCE_NAMES[get].toLowerCase()}`,
      quote.change > 0 ? ` (+${quote.change} gold change)` : "",
    );
    slider.addEventListener("input", () => {
      amount = Number(slider.value);
      const q = marketQuote(give, amount, get);
      summary.textContent = `Give ${amount} ${RESOURCE_NAMES[give].toLowerCase()} for ${q.receive} ${RESOURCE_NAMES[get].toLowerCase()}${q.change > 0 ? ` (+${q.change} gold change)` : ""}`;
      trade.disabled = q.receive < 1;
    });
    const trade = button(
      "Trade",
      () => {
        const me = host.state().currentPlayer;
        if (host.run(marketTrade(host.state(), me, give, amount, get))) {
          playSound("gold");
          traded();
        }
        render();
      },
      "gm-btn gm-primary",
    );
    trade.disabled = quote.receive < 1;
    body.append(el("div.gm-recruit-row", slider, trade), summary);
  };
  render();
  await modal<undefined>({
    title: "Marketplace",
    body,
    buttons: [{ label: "Done", value: undefined }],
    cancel: undefined,
  });
}
