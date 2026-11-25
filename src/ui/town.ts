/**
 * The town screen: the town picture, the building grid (one build per day),
 * recruiting per dwelling, the garrison and visiting-hero rows with
 * click-to-swap/merge (shift-click splits in half) and the marketplace.
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
  canAfford,
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
  BuildStatus,
  CommandResult,
  GameState,
  SlotRef,
  TownState,
} from "../core/game/index.ts";
import type { ResourceId } from "../core/map/types.ts";
import { playSound } from "../audio/sound.ts";
import { fxEvent } from "../audio/fx.ts";
import { bump, countUp } from "./anim.ts";
import { buildingDef, townTree } from "../data/factions.ts";
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
import { abilityText, buildingTip, creatureTip } from "./info-tips.ts";
import { findFaction } from "../data/factions.ts";
import { setTip, tipCard } from "./tooltip.ts";
import { creatureAbilities } from "../data/creatures.ts";
import { townLevel } from "./objects.ts";
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

const STATUS_TEXT: Record<BuildStatus, string> = {
  ok: "Can build",
  built: "Built",
  "start-only": "Built",
  "not-owner": "Not your town",
  "wrong-faction": "Cannot build here",
  "built-today": "Already built today",
  requirements: "Missing requirements",
  keystone: "Needs the Keystone carried in",
  resources: "Cannot afford",
};

export function openTownScreen(host: TownHost, townId: string): Promise<void> {
  return new Promise((resolve) => {
    const root = el("div.gm-town");
    (document.getElementById("ui") ?? document.body).append(root);
    let selected: SlotRef | null = null;

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

    const render = (): void => {
      const state = host.state();
      const town = state.towns[townId];
      if (town === undefined) {
        close();
        return;
      }
      const hero = heroInTownOf(state, town);
      root.replaceChildren();

      const faction = findFaction(town.faction);
      const chip = el("span.gm-town-chip.gm-town-chip-big");
      chip.style.background = faction?.colour ?? "#6b5a3e";
      const header = el(
        "div.gm-town-header",
        el(
          "div.gm-town-title",
          el("h1.gm-town-name", chip, town.name),
          el(
            "div.gm-town-sub",
            `${faction?.name ?? "Town"} · ${fortLevel(town) === 0 ? "no fort" : `fort level ${fortLevel(town)}`} · ` +
              (town.builtToday ? "built today" : "one building a day"),
          ),
        ),
        host.resourceBar(),
        keyButton("Leave", "Esc", close, "gm-btn gm-primary"),
      );
      root.append(header);

      // ------------------------------------------------ picture + buildings
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
      const income = townIncome(town);
      picture.append(
        el(
          "div.gm-town-caption",
          `Income per day: `,
          costView(income),
          town.builtToday ? el("span.gm-built-today", " - built today") : null,
        ),
      );

      const grid = el("div.gm-buildings");
      const player = state.players.find((p) => p.id === town.owner);
      for (const id of townTree(town.faction)?.order ?? [])
        grid.append(buildingCard(state, town, id, player?.resources));

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
        cell.addEventListener("click", () => {
          void openRecruit(host, town.id, creature).then(() => {
            render();
            // The stock counts down to what is left (bead bzc.26).
            const now =
              host.state().towns[townId]?.dwellings[creature]?.available;
            const node = document.querySelector<HTMLElement>(
              `[data-stock="${creature}"]`,
            );
            const count = node?.querySelector<HTMLElement>(".gm-stock-count");
            if (node && count && now !== undefined && now !== left) {
              fxEvent("ui.recruit.count");
              bump(node);
              void countUp(count, left, now, 420);
            }
          });
        });
        stockRow.append(cell);
      }
      stock.append(
        dwellings.length === 0
          ? el("div.gm-dim", "No dwellings yet: build one to recruit.")
          : stockRow,
      );
      root.append(
        el("div.gm-town-body", el("div.gm-town-left", picture, stock), grid),
      );

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
      const side = el("div.gm-town-actions");
      const market = button("Marketplace", () => {
        void openMarket(host).then(render);
      });
      market.disabled =
        town.owner === null || !hasMarketplace(state, town.owner);
      if (market.disabled) market.title = "Build a Marketplace first";
      side.append(market);
      side.append(tavern(state, town));
      root.append(el("div.gm-town-footer", armies, side));
    };

    /** The tavern: this week's offer and retreated heroes (RULES_V2 5.4). */
    const tavern = (state: GameState, town: TownState): HTMLElement => {
      const box = el("div.gm-tavern", el("h3", "Tavern"));
      if (town.owner === null) return box;
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
        box.append(el("div.gm-dim", "Nobody this week. New faces next week."));
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
            if (run(hireHero(host.state(), town.id, entry.defId)))
              playSound("recruit");
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
        box.append(row);
      }
      return box;
    };

    const buildingCard = (
      state: GameState,
      town: TownState,
      id: BuildingId,
      have: GameState["players"][number]["resources"] | undefined,
    ): HTMLElement => {
      const def = buildingDef(town.faction, id);
      if (def === undefined) return el("div");
      let status = buildStatus(state, town.id, id);
      // Show the lasting reason first: "built today" passes tomorrow.
      if (status === "built-today") {
        if (!def.requires.every((r) => town.buildings.includes(r)))
          status = "requirements";
        else if (have !== undefined && !canAfford(have, def.cost))
          status = "resources";
      }
      const card = el("div.gm-building");
      card.dataset["building"] = id;
      card.classList.add(`gm-b-${status}`);
      setTip(card, () => {
        const t = host.state().towns[town.id];
        return t === undefined ? def.name : buildingTip(t, id);
      });
      const head = el("div.gm-building-head");
      const art = buildingArt(town.faction, id);
      if (art !== null) head.append(img(art.key, "gm-building-art"));
      if (def.dwelling !== undefined) {
        head.append(
          img(
            `portrait-${getCreature(def.dwelling).sprite}`,
            "gm-building-portrait",
          ),
        );
      }
      head.append(el("div.gm-building-name", def.name));
      card.append(head);
      card.append(el("div.gm-building-effect", def.effect));
      const built = status === "built" || status === "start-only";
      if (!built) {
        card.append(costView(def.cost, have));
        if (def.requires.length > 0) {
          const missing = def.requires.filter(
            (r) => !town.buildings.includes(r),
          );
          card.append(
            el(
              "div.gm-building-req",
              `Requires: ${def.requires.map((r) => buildingDef(town.faction, r)?.name ?? r).join(", ")}`,
            ),
          );
          if (missing.length === 0)
            card.lastElementChild?.classList.add("gm-met");
        }
      }
      const actions = el("div.gm-building-actions");
      if (built) {
        actions.append(el("span.gm-badge", "Built"));
        const creature = def.dwelling;
        if (creature !== undefined) {
          const stock = town.dwellings[creature]?.available ?? 0;
          const b = button(`Recruit (${stock})`, () => {
            void openRecruit(host, town.id, creature).then(render);
          });
          b.disabled = stock <= 0;
          b.title =
            stock <= 0
              ? "None left this week: dwellings grow on day 1 of each week."
              : `${stock} ${getCreature(creature).plural} wait to be recruited.`;
          actions.append(b);
        }
      } else {
        const b = button(
          "Build",
          () => {
            if (run(build(state, town.id, id))) {
              playSound("build");
              // The new building flashes gold and settles (bead bzc.26).
              fxEvent("ui.build.complete");
              bump(
                document.querySelector(`[data-building="${id}"]`),
                "gm-just-built",
              );
            }
          },
          "gm-btn gm-primary",
        );
        b.disabled = status !== "ok";
        b.title = STATUS_TEXT[status];
        actions.append(b);
        if (status !== "ok")
          actions.append(el("span.gm-status", STATUS_TEXT[status]));
      }
      card.append(actions);
      return card;
    };

    render();
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
      playSound("recruit");
  }
}

/** The marketplace: pick what to give and what to get, an amount, trade. */
async function openMarket(host: TownHost): Promise<void> {
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
        if (host.run(marketTrade(host.state(), me, give, amount, get)))
          playSound("gold");
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
