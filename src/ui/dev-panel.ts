/**
 * The Menu's developer tools (bead bzc.93): a "Developer tools" toggle and,
 * while dev mode is on, the Dev panel: reveal the map, build every building
 * in a town or in every own town, add resources, refill the selected hero.
 * The actions are the pure commands of src/core/game/dev.ts, applied through
 * the game screen like any other command (fog, town panel and saves follow).
 */
import {
  DEV_GOLD,
  DEV_OTHER,
  devAddResources,
  devBuildAll,
  devBuildAllTowns,
  devRefillHero,
  devRevealMap,
  findHero,
  townsOf,
} from "../core/game/index.ts";
import type {
  CommandResult,
  GameEvent,
  GameState,
} from "../core/game/index.ts";
import { devMode, setDevMode } from "./dev-mode.ts";
import { button, el } from "./dom.ts";

export interface DevHost {
  state(): GameState;
  /** The human player the cheats help. */
  readonly player: number;
  /** The selected hero's id, or null. */
  heroId(): string | null;
  /** The town to build in by default: the hero's town, else the first. */
  townId(): string | null;
  /** Applies a command; its events, or null when it failed. */
  run(result: CommandResult): GameEvent[] | null;
  /** Logs a line (and shows it as a toast). */
  note(text: string): void;
}

/** Buildings in the player's towns, for "built N" messages. */
function buildingCount(state: GameState, player: number): number {
  return townsOf(state, player).reduce((n, t) => n + t.buildings.length, 0);
}

function learntText(events: readonly GameEvent[]): string {
  const n = events.reduce(
    (k, e) => k + (e.type === "spells-learnt" ? e.spells.length : 0),
    0,
  );
  return n === 0
    ? ""
    : ` The hero in town learnt ${n} spell${n === 1 ? "" : "s"}.`;
}

/** What one dev action did, as one line (null: it failed). */
export function devAction(
  host: DevHost,
  action: "reveal" | "resources" | "build" | "build-all" | "refill",
  townId: string | null = host.townId(),
): string | null {
  const before = host.state();
  const p = host.player;
  if (action === "reveal") {
    return host.run(devRevealMap(before, p)) === null
      ? null
      : "Dev: the whole map is revealed.";
  }
  if (action === "resources") {
    return host.run(devAddResources(before, p)) === null
      ? null
      : `Dev: +${DEV_GOLD} gold, +${DEV_OTHER} wood, ore and essence.`;
  }
  if (action === "refill") {
    const id = host.heroId();
    if (id === null) return null;
    if (host.run(devRefillHero(before, id)) === null) return null;
    const h = findHero(host.state(), id);
    return h === undefined
      ? null
      : `Dev: ${h.name} has ${h.mp} movement and ${h.mana} mana.`;
  }
  const n0 = buildingCount(before, p);
  if (action === "build") {
    if (townId === null) return null;
    const events = host.run(devBuildAll(before, townId));
    if (events === null) return null;
    const name = host.state().towns[townId]?.name ?? townId;
    const n = buildingCount(host.state(), p) - n0;
    return n === 0
      ? `Dev: ${name} has every building already.`
      : `Dev: built ${n} building${n === 1 ? "" : "s"} in ${name}.${learntText(events)}`;
  }
  const events = host.run(devBuildAllTowns(before, p));
  if (events === null) return null;
  const n = buildingCount(host.state(), p) - n0;
  const towns = townsOf(host.state(), p).filter((t) => !t.isHold).length;
  return `Dev: built ${n} building${n === 1 ? "" : "s"} in ${towns} town${towns === 1 ? "" : "s"}.${learntText(events)}`;
}

/** The Dev panel's buttons (only while dev mode is on). */
function devPanel(host: DevHost, status: HTMLElement): HTMLElement {
  const act = (
    action: Parameters<typeof devAction>[1],
    townId?: string | null,
  ): void => {
    const text = devAction(host, action, townId);
    if (text === null) return;
    status.textContent = text;
    host.note(text);
  };
  const state = host.state();
  // The Warlord's Hold has no building tree.
  const towns = townsOf(state, host.player).filter((t) => !t.isHold);
  const select = el("select.gm-dev-town");
  select.setAttribute("aria-label", "Town to build in");
  const first = host.townId();
  for (const t of towns) {
    const o = el("option", t.name);
    o.value = t.id;
    if (t.id === first) o.selected = true;
    select.append(o);
  }
  const noTowns = towns.length === 0;
  const build = button(
    "Build all here",
    () => act("build", select.value === "" ? null : select.value),
    "gm-btn gm-dev-build",
  );
  build.title = "Every building of the chosen town, free, at once";
  const buildAll = button(
    "Build all in every town",
    () => act("build-all"),
    "gm-btn gm-dev-build-all",
  );
  buildAll.title = "Every building of every town you own";
  build.disabled = noTowns;
  buildAll.disabled = noTowns;
  select.disabled = noTowns;

  const hero = (() => {
    const id = host.heroId();
    return id === null ? undefined : findHero(state, id);
  })();
  const refill = button(
    hero === undefined ? "Refill hero (none)" : `Refill ${hero.name}`,
    () => act("refill"),
    "gm-btn gm-dev-refill",
  );
  refill.title = "Movement and mana back to their maximum";
  refill.disabled = hero === undefined;

  const reveal = button(
    "Reveal map",
    () => act("reveal"),
    "gm-btn gm-dev-reveal",
  );
  reveal.title = "Clear the fog of war over the whole map";
  const gold = button(
    `+${DEV_GOLD} gold, +${DEV_OTHER} each`,
    () => act("resources"),
    "gm-btn gm-dev-resources",
  );
  gold.title = `+${DEV_GOLD} gold and +${DEV_OTHER} wood, ore and essence`;

  return el(
    "div.gm-dev-panel",
    el("div.gm-dev-row", reveal, gold),
    el("div.gm-dev-row", select, build),
    el("div.gm-dev-row", buildAll, refill),
    status,
  );
}

/**
 * The Menu's dev block: the "Developer tools" toggle, and the Dev panel
 * under it while dev mode is on.
 */
export function devSettings(host: DevHost): HTMLElement {
  const box = el("div.gm-dev");
  const status = el(
    "p.gm-dev-status.gm-dim",
    "Cheats for testing; each applies at once.",
  );
  const render = (): void => {
    const on = devMode();
    const toggle = button(
      on ? "Developer tools: on" : "Developer tools: off",
      () => {
        setDevMode(!devMode());
        render();
      },
      "gm-btn gm-dev-toggle",
    );
    toggle.setAttribute("aria-pressed", String(on));
    toggle.title = on
      ? "Hide the Dev panel (?dev=1 in the address also turns it on)"
      : "Show the Dev panel: reveal the map, build everything, add resources";
    box.textContent = "";
    box.append(toggle);
    if (on) box.append(devPanel(host, status));
  };
  render();
  return box;
}
