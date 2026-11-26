/**
 * The town screen: a header with the town's income, fort level and the
 * day's build as icons and the Tavern and Marketplace buttons; at the left
 * the town picture over the dwellings strip (bead bzc.61, UI_V2.md UI2-10:
 * every dwelling in tier order, "available / growth a week", locked until
 * built, a click opens the recruit dialog with Heroes III's four boxes);
 * at the right the build grid as a Heroes hall (bead bzc.60, UI2-09): rows
 * Hall, Fort, Economy, Specials and Magic, then the dwellings in tier
 * columns, each building a compact tile coloured by state, and a detail
 * pane beside the grid with the selected building's picture, effect, cost,
 * requirements and the Build button; under it the garrison over the
 * visiting hero, two of the hero sheet's army bands slot for slot, where a
 * stack moves by click (pick up, put down; shift moves half) or by drag.
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
  recruit,
  townIncome,
  transferStack,
} from "../core/game/index.ts";
import type {
  ArmySlots,
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
import { townArmyMove, wireArmyDrag, type ArmyDrag } from "./army.ts";
import { armyBand, armyFigure, armySlotViews } from "./hero-screen.ts";
import type { ArmySlotView } from "./hero-screen.ts";
import { rulesText } from "./keywords.ts";
import { guildLevels, guildView } from "./guild-learning.ts";
import { guildDialog, guildLevelPane, showLearnt } from "./town-guild.ts";
import { guildLevelOf } from "../core/magic/index.ts";
import { dwellingStrip, growthNote, recruitQuote } from "./town-dwellings.ts";
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

/**
 * The hall's grid column (1-based, inside a group) of a group's `i`-th
 * tile: column 1 is the group's name, then three tiles; column 5 is the
 * right half's name column, which a wide group (Magic, Dwellings) skips.
 */
function hallColumn(i: number): number {
  return i < 3 ? i + 2 : i + 3;
}

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
      const result = build(host.state(), townId, id);
      if (run(result)) {
        playSound("build");
        // The new building flashes gold and settles (bead bzc.26).
        fxEvent("ui.build.complete");
        bump(
          root.querySelector(`.gm-hall [data-building="${id}"]`),
          "gm-just-built",
        );
        // A guild level built while a hero is in town: its new pages.
        const owner = host.state().towns[townId]?.owner ?? null;
        if (result.ok && owner !== null)
          void showLearnt(host.state(), result.events, owner);
      }
    };

    /** Opens the Mage Guild: every level and the visiting hero's states. */
    const openGuild = (): void => {
      const state = host.state();
      const town = state.towns[townId];
      if (town === undefined) return;
      const view = guildView(state, town, heroInTownOf(state, town));
      if (view !== null) void guildDialog(town.name, view);
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

      // ------------------------------------------------ the hall
      const body = el("div.gm-town-body");
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
      root.append(
        el(
          "div.gm-town-main",
          el("div.gm-town-left", picture, dwellingsStrip(town, state.day)),
          el("div.gm-town-right", body, armyRows(town, hero)),
        ),
      );
    };

    /**
     * Moves a stack between (or within) the two rows: the whole stack, or
     * half of it with shift (bead bzc.61: a click on a picked stack's
     * target or a drop).
     */
    const move = (from: SlotRef, to: SlotRef, half: boolean): void => {
      selected = null;
      const state = host.state();
      const town = state.towns[townId];
      if (town === undefined) return;
      const hero = heroInTownOf(state, town);
      const plan = townArmyMove(
        { garrison: town.garrison, hero: hero?.army },
        from,
        to,
        half,
      );
      if (plan === null) {
        render();
        return;
      }
      run(
        transferStack(state, {
          ...(hero !== undefined ? { heroId: hero.id } : {}),
          townId: town.id,
          ...plan,
        }),
      );
    };

    /** The stack being dragged, if any. */
    const dragging: ArmyDrag = { from: null };

    /**
     * The garrison over the visiting hero (UI2-10): two army bands of the
     * hero sheet's kind, slot for slot, with the town's picture and the
     * hero's portrait at their left. A click picks a stack up and a click
     * elsewhere puts it down (move, merge or swap; shift: half); a stack
     * can also be dragged. Each slot's hover card says what a click does.
     */
    const armyRows = (
      town: TownState,
      hero: ReturnType<typeof heroInTownOf>,
    ): HTMLElement => {
      const pickedView = (army: SlotRef["army"]): ArmySlotView | null => {
        if (selected === null || selected.army === army) return null;
        const source = selected.army === "hero" ? hero?.army : town.garrison;
        return source === undefined
          ? null
          : (armySlotViews(source)[selected.slot] ?? null);
      };
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
          move(selected, here, e.shiftKey);
        };
      const band = (army: SlotRef["army"], slots: ArmySlots): HTMLElement => {
        const node = armyBand(slots, {
          selected: selected?.army === army ? selected.slot : null,
          pickedElsewhere: pickedView(army),
          onSlot: onSlot(army),
        });
        wireDrag(node, army, slots);
        return node;
      };

      // The garrison's lead: the town's fort (or hall) on its colour.
      const faction = findFaction(town.faction);
      const level = fortLevel(town);
      const hall = town.buildings.filter(
        (b) => buildingDef(town.faction, b)?.hallIncome !== undefined,
      );
      const crestArt =
        (level > 0 ? buildingArt(town.faction, `fort-${level}`) : null) ??
        buildingArt(town.faction, hall.at(-1) ?? "village-hall");
      // A town with no building art (neutral): its map sprite, shrunk.
      const crest = el(
        "div.gm-town-army-lead.gm-town-army-crest",
        crestArt !== null
          ? img(crestArt.key, "gm-town-army-lead-art")
          : img(townArt(town.faction, level).key, "gm-town-army-lead-town"),
        el("span.gm-town-army-caption", "Garrison"),
      );
      crest.style.setProperty(
        "--gm-faction-colour",
        faction?.colour ?? "#6b5a3e",
      );
      setTip(crest, () =>
        tipCard(`${town.name} garrison`, [
          "Defends the town when it is attacked.",
          hero === undefined
            ? "Recruits join the garrison while no hero is visiting."
            : `Recruits join ${hero.name}'s army (the garrison when it is full).`,
        ]),
      );
      const garrison = el(
        "div.gm-town-army-row",
        crest,
        band("garrison", town.garrison),
      );
      garrison.dataset["army"] = "garrison";

      let visitor: HTMLElement;
      if (hero !== undefined) {
        const portrait = namedHeroPortrait(hero.defId, hero.heroClass);
        const lead = el(
          "div.gm-town-army-lead.gm-town-army-hero",
          img(portrait.key, "gm-town-army-portrait", 2),
          el("span.gm-town-army-caption", hero.name),
        );
        setTip(lead, () =>
          tipCard(
            hero.name,
            [
              "Visiting the town: move stacks between the hero and the garrison.",
            ],
            {
              icon: img(portrait.key),
              subtitle: `${getHeroClass(hero.heroClass).name}, level ${hero.level}`,
            },
          ),
        );
        visitor = el("div.gm-town-army-row", lead, band("hero", hero.army));
      } else {
        const lead = el(
          "div.gm-town-army-lead.gm-town-army-nobody",
          el("span.gm-town-army-lead-art"),
          el("span.gm-town-army-caption", "No hero"),
        );
        setTip(lead, () =>
          tipCard("No hero visiting", [
            "A hero who stands in the town gate shows here, and stacks move between the hero and the garrison.",
          ]),
        );
        // The empty band keeps the rows aligned; it takes no clicks.
        visitor = el(
          "div.gm-town-army-row.gm-town-army-vacant",
          lead,
          armyBand(town.garrison.map(() => null)),
        );
      }
      visitor.dataset["army"] = "hero";
      return el("div.gm-town-armies", garrison, visitor);
    };

    /** Drag a stack onto any slot of either row (bead bzc.61). */
    const wireDrag = (
      node: HTMLElement,
      army: SlotRef["army"],
      slots: ArmySlots,
    ): void => wireArmyDrag(node, army, slots, dragging, root, move);

    /**
     * The dwellings strip (UI2-10): the faction's dwellings in tier order,
     * each its creature's portrait with "available / growth a week"; a
     * built one opens the recruit dialog, an unbuilt one is greyed and
     * locked and shows its building in the hall.
     */
    const dwellingsStrip = (town: TownState, day: number): HTMLElement => {
      const box = el("div.gm-town-stock", el("h3.gm-rule", "Recruit"));
      const views = dwellingStrip(town);
      if (views.length === 0) {
        box.append(el("div.gm-dim", "This town has no dwellings."));
        return box;
      }
      const grid = el("div.gm-dwell-grid");
      for (const v of views) {
        const c = getCreature(v.creature);
        const cell = el(
          "button.gm-dwell",
          el(
            "span.gm-dwell-pic",
            img(`portrait-${c.sprite}`, "gm-dwell-portrait"),
            v.built ? null : el("span.gm-dwell-lock"),
          ),
          el("span.gm-dwell-name", c.plural),
        );
        cell.type = "button";
        cell.dataset["creature"] = v.creature;
        if (v.built) {
          // `.gm-stock` and `data-stock`: the recruit count-down and the
          // screen tour find the built dwellings by them.
          cell.classList.add("gm-stock");
          cell.dataset["stock"] = v.creature;
          cell.append(
            el(
              "span.gm-dwell-count",
              el("b.gm-stock-count", String(v.available)),
              el("span.gm-dwell-growth", ` / +${v.growth} a week`),
            ),
          );
          if (v.available <= 0) cell.classList.add("gm-dwell-empty");
          cell.setAttribute(
            "aria-label",
            `Recruit ${c.plural}: ${v.available} available, ${v.growth} more each week`,
          );
          setTip(cell, () => {
            const card = creatureTip(v.creature);
            const line = el(
              "div.gm-tip-line.gm-tip-dim",
              `${v.name}: ${v.available} to recruit, +${v.growth} each week. Click to recruit.`,
            );
            if (typeof card !== "string") card.append(line);
            return card;
          });
          cell.addEventListener("click", () => recruitFrom(v.creature));
        } else {
          cell.classList.add("gm-dwell-locked");
          cell.append(el("span.gm-dwell-count", "Not built"));
          cell.setAttribute(
            "aria-label",
            `${c.plural}: build the ${v.name} first`,
          );
          setTip(cell, () =>
            tipCard(v.name, [
              `Not built yet: build it to recruit ${c.plural} (+${v.growth} a week).`,
              "Click to see it in the hall.",
            ]),
          );
          cell.addEventListener("click", () => choose(v.building));
        }
        grid.append(cell);
      }
      box.append(grid, el("div.gm-dwell-note", growthNote(day)));
      return box;
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
      // The Mage Guild (bead bzc.81): who learns what here, and why not.
      const guild =
        guildLevels(town) > 0
          ? tool(
              "Mage Guild",
              `magic-guild-${Math.max(1, guildLevelOf(town))}`,
              openGuild,
            )
          : null;
      if (guild !== null) {
        guild.classList.add("gm-town-guild-tool");
        setTip(guild, () =>
          tipCard("Mage Guild", [
            "Every hero has a spellbook. A hero in its own town learns each guild spell its school ranks allow, at once and free.",
            "Click to see which spells the hero here has learnt, and why not.",
          ]),
        );
      }

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
        guild,
        tavernButton,
        market,
        keyButton("Leave", "Esc", close, "gm-btn gm-primary"),
      );
    };

    /**
     * The hall: two halves of three tile columns, each half led by a
     * narrow column for its group's name written upwards (bead bzc.61:
     * the names no longer take a line each, so the hall and the two army
     * rows fit 1280x800). Rows of tiles, then the dwellings.
     */
    const hallGrid = (
      state: GameState,
      town: TownState,
      layout: HallLayout,
    ): HTMLElement => {
      const grid = el("div.gm-hall");
      if (town.builtToday) grid.classList.add("gm-hall-today");
      const label = (text: string, rows: number): HTMLElement => {
        const node = el("div.gm-hall-label", text);
        node.style.gridColumn = "1";
        node.style.gridRow = `1 / span ${rows}`;
        return node;
      };
      for (const gid of SCREEN_ROWS) {
        const group = layout.groups.find((g) => g.id === gid);
        if (group === undefined || group.buildings.length === 0) continue;
        const box = el("div.gm-hall-group", label(group.label, 1));
        box.dataset["group"] = group.id;
        box.style.gridColumn = `span ${group.buildings.length <= 3 ? 4 : 8}`;
        group.buildings.forEach((id, i) => {
          const t = tile(state, town, id);
          t.style.gridColumn = String(hallColumn(i));
          t.style.gridRow = "1";
          box.append(t);
        });
        grid.append(box);
      }
      if (layout.dwellings.length > 0) {
        const rows = Math.max(
          ...layout.dwellings.map((c) => c.buildings.length),
        );
        const box = el(
          "div.gm-hall-group.gm-hall-dwellings",
          label("Dwellings", rows),
        );
        box.dataset["group"] = "dwellings";
        layout.dwellings.forEach((column, i) => {
          column.buildings.forEach((id, row) => {
            const t = tile(state, town, id);
            t.style.gridColumn = String(hallColumn(i));
            t.style.gridRow = String(row + 1);
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
      // A guild level: its spells and where each stands for the hero here
      // (bead bzc.81); the whole guild opens from the link.
      const view =
        def.guildLevel === undefined
          ? null
          : guildView(state, town, heroInTownOf(state, town));
      if (view !== null && def.guildLevel !== undefined) {
        pane.classList.add("gm-hall-detail-guild");
        pane.append(
          guildLevelPane(view, def.guildLevel),
          button(
            "Whole guild and how to learn more",
            openGuild,
            "gm-hall-link gm-hall-plain gm-guild-open",
          ),
        );
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

/**
 * The recruit dialog for one dwelling (UI2-10): the creature standing on
 * its ground beside its stats, the abilities with their keywords, then
 * Heroes III's four boxes (cost each, available, to recruit, total) above
 * the slider, the -/+ buttons and Max, and where the recruits go.
 */
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
  const have = player.resources;
  const stock = town.dwellings[creature]?.available ?? 0;
  const first = recruitQuote(creature, stock, have);
  const max = first.max;
  let count = max;
  const hero = heroInTownOf(state, town);

  const slider = el("input.gm-slider");
  slider.type = "range";
  slider.min = "0";
  slider.max = String(max);
  slider.value = String(count);
  slider.disabled = max === 0;
  slider.setAttribute("aria-label", `${def.plural} to recruit`);
  const toRecruit = el("b.gm-recruit-count");
  const total = el("span.gm-recruit-total");
  let recruitButton: HTMLButtonElement | null = null;
  const minus = button("−", () => set(count - 1), "gm-btn gm-recruit-step");
  minus.setAttribute("aria-label", "One fewer");
  const plus = button("+", () => set(count + 1), "gm-btn gm-recruit-step");
  plus.setAttribute("aria-label", "One more");
  const maxButton = button("Max", () => set(max));
  const update = (): void => {
    const q = recruitQuote(creature, stock, have, count);
    toRecruit.textContent = String(q.count);
    total.replaceChildren(
      q.count === 0 ? el("span.gm-dim", "0") : costView(q.total, have),
    );
    minus.disabled = count <= 0;
    plus.disabled = count >= max;
    maxButton.disabled = count >= max;
    if (recruitButton !== null) recruitButton.disabled = count < 1;
  };
  const set = (n: number): void => {
    count = Math.max(0, Math.min(max, n));
    slider.value = String(count);
    update();
  };
  slider.addEventListener("input", () => set(Number(slider.value)));

  const box = (label: string, value: Node): HTMLElement =>
    el(
      "div.gm-recruit-box",
      el("span.gm-recruit-box-label", label),
      el("span.gm-recruit-box-value", value),
    );
  const stat = (label: string, value: string | number): HTMLElement[] => [
    el("span", label),
    el("b", String(value)),
  ];
  // The creature as it stands in battle, on the hero sheet's ground patch.
  const stage = el(
    "div.hs-army-slot.gm-recruit-stage",
    ...armyFigure(creature, 0).slice(0, 2),
  );
  setTip(stage, () => creatureTip(creature));
  const abilities = creatureAbilities(def);
  const body = el(
    "div.gm-recruit",
    el(
      "div.gm-recruit-top",
      stage,
      el(
        "div.gm-recruit-stats",
        ...stat("Attack", def.attack),
        ...stat("Defense", def.defense),
        ...stat("Damage", def.damage),
        ...stat("Health", def.hp),
        ...stat("Speed", def.speed),
        ...(def.shots > 0 ? stat("Shots", def.shots) : stat("Melee", "")),
      ),
    ),
    abilities.length > 0
      ? el(
          "div.gm-recruit-abilities",
          ...abilities.map((a) => {
            const t = abilityText(a);
            return el(
              "div",
              el("b", t.name),
              t.text === "" ? "" : ": ",
              t.text === "" ? null : rulesText(t.text, { hover: true }),
            );
          }),
        )
      : null,
    el(
      "div.gm-recruit-boxes",
      box("Cost each", costView(def.cost, have)),
      box("Available", el("b", String(stock))),
      box("To recruit", toRecruit),
      box("Total", total),
    ),
    el("div.gm-recruit-row", minus, slider, plus, maxButton),
    el(
      "div.gm-recruit-note",
      first.reason ??
        (hero !== undefined
          ? `They join ${hero.name}'s army (the garrison when it is full).`
          : "They join the garrison."),
    ),
  );
  if (first.reason !== null) body.classList.add("gm-recruit-none");
  update();
  const choice = await modal<"recruit" | "cancel">({
    title: `Recruit ${def.plural}`,
    body,
    className: "gm-recruit-dialog",
    onOpen: (buttons) => {
      recruitButton = buttons[0] ?? null;
      update();
    },
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
