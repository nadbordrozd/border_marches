/**
 * The kingdom overview (bead border_marches-bzc.62, docs/design/UI_V2.md
 * UI2-12), Heroes III style: one row per hero and one per town, pictures
 * first, and the income as one row of resource icons.
 *
 * - A hero row: portrait, name, level and class, movement and mana bars,
 *   the army as small portraits with counts. A click selects the hero.
 * - A town row: crest, name, fort and hall, income, garrison portraits with
 *   counts, the creatures waiting in the dwellings and the BUILD badge. A
 *   click opens the town.
 * - The income row: each resource "+N per day"; its hover card splits it
 *   by source.
 *
 * The rows come from src/ui/kingdom-model.ts (pure, unit-tested); the
 * adventure screen (src/ui/game.ts) opens the dialog and acts on the pick.
 */
import { buildingArt } from "../assets/town-art.ts";
import { namedHeroPortrait } from "../assets/unit-art.ts";
import type { GameState, HeroState } from "../core/game/index.ts";
import type { ResourceId } from "../core/map/types.ts";
import { FORT_DEFENSE } from "../data/factions.ts";
import { RESOURCE_NAMES } from "../data/economy.ts";
import { MAX_HEROES } from "../data/players.ts";
import { costView, el, img, modal, resourceIcon } from "./dom.ts";
import { creatureCount } from "./format.ts";
import { creatureTip } from "./info-tips.ts";
import {
  kingdomModel,
  perDayText,
  type KingdomHero,
  type KingdomModel,
  type KingdomStack,
  type KingdomTown,
} from "./kingdom-model.ts";
import { setTip, tipCard, type TipBody } from "./tooltip.ts";
import "./kingdom.css";

/** What the player picked in the overview. */
export type KingdomPick =
  | { readonly kind: "hero"; readonly id: string }
  | { readonly kind: "town"; readonly id: string };

/** Hover cards the adventure screen already builds. */
export interface KingdomTips {
  /** A resource's stock and its income by source. */
  resource?: (r: ResourceId) => TipBody;
  /** The hero's map card. */
  hero?: (hero: HeroState) => TipBody;
  /** The town's map card. */
  town?: (townId: string) => TipBody;
}

export interface KingdomOptions {
  readonly state: GameState;
  readonly player: number;
  /** The hero selected on the map (its row is marked). */
  readonly selectedHeroId?: string | null;
  readonly tips?: KingdomTips;
}

/** Small portraits with counts under them; nothing for an empty army. */
export function stackStrip(
  stacks: readonly KingdomStack[],
  className = "",
): HTMLElement {
  const strip = el(`div.kd-stacks${className === "" ? "" : `.${className}`}`);
  for (const s of stacks) {
    const cell = el(
      "span.kd-stack",
      img(s.portrait, "kd-stack-portrait"),
      el("span.kd-stack-count", String(s.count)),
    );
    cell.setAttribute("aria-label", creatureCount(s.creature, s.count));
    setTip(cell, () => creatureTip(s.creature, s.count));
    strip.append(cell);
  }
  return strip;
}

const meter = (kind: string, fill: number, label: string): HTMLElement => {
  const bar = el(`span.kd-meter.kd-${kind}`, label);
  bar.style.setProperty("--fill", `${fill}%`);
  return bar;
};

/** One hero row; `onPick` runs on a click. */
export function heroRowView(
  row: KingdomHero,
  onPick: (pick: KingdomPick) => void,
  tips: KingdomTips = {},
): HTMLElement {
  const hero = row.hero;
  const portrait = el(
    "span.kd-portrait",
    img(namedHeroPortrait(hero.defId, hero.heroClass).key, "kd-portrait-img"),
    row.levelUp ? el("span.kd-level-up", "+") : null,
  );
  const tipHero = tips.hero;
  if (tipHero !== undefined) setTip(portrait, () => tipHero(hero));
  const node = el(
    "button.kd-row.kd-hero-row",
    portrait,
    el(
      "span.kd-name",
      el("span.kd-name-main", row.name),
      el("span.kd-name-sub", row.title),
    ),
    el(
      "span.kd-meters",
      meter("mp", row.mpPct, `Moves ${row.mp} / ${row.maxMp}`),
      meter("mana", row.manaPct, `Mana ${row.mana} / ${row.maxMana}`),
    ),
    row.army.length > 0 ? stackStrip(row.army) : el("span.kd-none", "No army"),
  );
  node.type = "button";
  node.dataset["hero"] = row.id;
  node.setAttribute("aria-label", `${row.name}, ${row.title}: select`);
  if (row.selected) node.classList.add("kd-selected");
  if (row.tired) node.classList.add("kd-tired");
  node.addEventListener("click", () => onPick({ kind: "hero", id: row.id }));
  return node;
}

/** The fort cell: its building's picture (or the Hold's walls) and level. */
function fortCell(row: KingdomTown): HTMLElement {
  const art =
    row.fort > 0 ? buildingArt(row.faction, `fort-${row.fort}`) : null;
  const cell = el(
    "span.kd-building",
    art !== null ? img(art.key, "kd-building-art") : null,
    el(
      "span.kd-building-text",
      row.hold ? "Hold" : row.fort === 0 ? "No fort" : `Fort ${row.fort}`,
    ),
  );
  if (row.fort === 0 && !row.hold) cell.classList.add("kd-dim");
  setTip(cell, () =>
    row.hold
      ? tipCard("The Hold's walls", ["Defenders fight behind strong walls."])
      : tipCard(row.fort === 0 ? "No fort" : `Fort level ${row.fort}`, [
          row.fort === 0
            ? "Defenders fight without a wall bonus. Build a fort to raise their Defense."
            : `Defending stacks get +${FORT_DEFENSE[row.fort] ?? 0} Defense${row.fort >= 3 ? " and a tower shoots" : ""}.`,
        ]),
  );
  return cell;
}

/** The hall cell: its picture and the gold it pays. */
function hallCell(row: KingdomTown): HTMLElement {
  const hall = row.hall;
  const art = hall === null ? null : buildingArt(row.faction, hall.building);
  const cell = el(
    "span.kd-building",
    art !== null ? img(art.key, "kd-building-art") : null,
    el("span.kd-building-text", hall === null ? "No hall" : hall.name),
  );
  if (hall === null) cell.classList.add("kd-dim");
  else
    setTip(cell, () =>
      tipCard(hall.name, [`Pays ${hall.gold} gold every day.`]),
    );
  return cell;
}

/** One town row; `onPick` runs on a click. */
export function townRowView(
  row: KingdomTown,
  onPick: (pick: KingdomPick) => void,
  tips: KingdomTips = {},
): HTMLElement {
  const crest = el("span.kd-crest");
  crest.style.setProperty("--crest", row.colour);
  crest.setAttribute("aria-hidden", "true");
  const name = el(
    "span.kd-name",
    el("span.kd-name-main", row.name),
    el("span.kd-name-sub", row.factionName),
  );
  const tipTown = tips.town;
  if (tipTown !== undefined) setTip(name, () => tipTown(row.id));
  const earns = Object.values(row.income).some((n) => n > 0);
  const income = el(
    "span.kd-income-cell",
    earns ? costView(row.income) : el("span.kd-dim", "None"),
  );
  setTip(income, "Income every day.");
  const garrison =
    row.garrison.length > 0
      ? stackStrip(row.garrison)
      : el("span.kd-none", "Empty");
  const available =
    row.available.length > 0
      ? stackStrip(row.available, "kd-hire")
      : el("span.kd-none", row.hasTree ? "None yet" : "");
  const today = row.build
    ? el("span.kd-build", "Build")
    : row.builtToday
      ? el("span.kd-built", "Built")
      : el("span.kd-none", "");
  if (row.build)
    setTip(today, "Something can be built here today. Click to open the town.");
  else if (row.builtToday)
    setTip(today, "Built today: the next building can go up tomorrow.");
  const node = el(
    "button.kd-row.kd-town-row",
    el("span.kd-town-id", crest, name),
    fortCell(row),
    hallCell(row),
    income,
    garrison,
    available,
    today,
  );
  node.type = "button";
  node.dataset["town"] = row.id;
  node.setAttribute("aria-label", `${row.name}: open the town`);
  node.addEventListener("click", () => onPick({ kind: "town", id: row.id }));
  return node;
}

/** The income row: each resource "+N per day", by source on hover. */
export function incomeRow(
  model: KingdomModel,
  tips: KingdomTips = {},
): HTMLElement {
  const row = el("div.kd-income");
  for (const r of model.income) {
    // The hover card names the resource: no native title on the icon.
    const icon = resourceIcon(r.resource, "kd-res-icon");
    icon.removeAttribute("title");
    const item = el(
      "span.kd-res",
      icon,
      el("span.kd-res-text", perDayText(r.perDay)),
    );
    if (r.perDay <= 0) item.classList.add("kd-dim");
    item.setAttribute(
      "aria-label",
      `${RESOURCE_NAMES[r.resource]} ${perDayText(r.perDay)}`,
    );
    const tip = tips.resource;
    setTip(item, () =>
      tip !== undefined
        ? tip(r.resource)
        : tipCard(RESOURCE_NAMES[r.resource], [
            `Income ${perDayText(r.perDay)}`,
          ]),
    );
    row.append(item);
  }
  return row;
}

const section = (
  title: string,
  hint: string,
  ...children: Array<Node | null>
): HTMLElement =>
  el(
    "section.kd-section",
    el("div.kd-head", el("h3.kd-title", title), el("span.kd-hint", hint)),
    ...children,
  );

/** The overview's body (everything but the title and the Close button). */
export function kingdomBody(
  model: KingdomModel,
  onPick: (pick: KingdomPick) => void,
  tips: KingdomTips = {},
): HTMLElement {
  const heroes = el("div.kd-rows");
  for (const h of model.heroes) heroes.append(heroRowView(h, onPick, tips));
  const towns = el("div.kd-rows");
  if (model.towns.length > 0) {
    towns.append(
      el(
        "div.kd-cols",
        el("span", "Town"),
        el("span", "Fort"),
        el("span", "Hall"),
        el("span", "Income"),
        el("span", "Garrison"),
        el("span", "Ready to hire"),
        el("span", "Today"),
      ),
    );
  }
  for (const t of model.towns) towns.append(townRowView(t, onPick, tips));
  const rivals = el("div.kd-rivals");
  for (const p of model.rivals) {
    const chip = el("span.kd-rival-chip");
    chip.style.background = p.colour;
    const text = p.eliminated
      ? "out of the game"
      : `${p.towns} ${p.towns === 1 ? "town" : "towns"}`;
    const item = el(
      "span.kd-rival",
      chip,
      el("span.kd-rival-name", p.colourName),
      el("span.kd-dim", `${p.factionName}, ${text}`),
    );
    if (p.eliminated) item.classList.add("kd-out");
    setTip(
      item,
      `${p.colourName}: ${p.factionName}, played by ${p.computer ? "the computer" : "a person"}.`,
    );
    rivals.append(item);
  }
  return el(
    "div.kd-body",
    incomeRow(model, tips),
    section(
      `Heroes ${model.heroes.length} / ${MAX_HEROES}`,
      model.heroes.length > 0 ? "Click a hero to select them" : "",
      model.heroes.length > 0
        ? heroes
        : el("div.kd-empty", "No heroes: hire one in a town's tavern."),
    ),
    section(
      `Towns ${model.towns.length}`,
      model.towns.length > 0 ? "Click a town to open it" : "",
      model.towns.length > 0 ? towns : el("div.kd-empty", "No towns."),
    ),
    model.rivals.length > 0 ? rivals : null,
  );
}

/**
 * Opens the overview; resolves with the hero or town clicked, or null when
 * the player closes it.
 */
export async function openKingdom(
  options: KingdomOptions,
): Promise<KingdomPick | null> {
  const model = kingdomModel(
    options.state,
    options.player,
    options.selectedHeroId ?? null,
  );
  let pick: KingdomPick | null = null;
  let close: (() => void) | null = null;
  const body = kingdomBody(
    model,
    (p) => {
      pick = p;
      close?.();
    },
    options.tips,
  );
  await modal<null>({
    title: "Kingdom",
    className: "kd-dialog",
    body,
    buttons: [{ label: "Close", value: null, primary: true }],
    cancel: null,
    onOpen: (buttons) => {
      const button = buttons[0];
      if (button !== undefined) close = () => button.click();
    },
  });
  return pick;
}
