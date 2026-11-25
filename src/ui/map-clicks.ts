/**
 * What a click on a town on the adventure map does (bead border_marches-50f).
 * Pure rules, unit-tested; the adventure screen (game.ts) carries them out.
 *
 * Own towns:
 * - a double-click always opens the town screen and never moves the hero;
 * - a single click opens it when no hero is selected or the selected hero
 *   stands in it;
 * - otherwise a click plans the selected hero's path there, and a click on
 *   the planned town walks, but only once the double-click window has
 *   passed without a second click (so a double-click never walks).
 *
 * Enemy and neutral towns: a click plans a path there, a click on the
 * planned town walks (the hero attacks or captures it).
 *
 * mapAction (UI2-07, bead bzc.58) says what a click on any hovered cell
 * does: the cursor and the status line under the map.
 */
import { findPath } from "../core/game/index.ts";
import type { GameState, HeroState, Path } from "../core/game/index.ts";
import { standsOn } from "../core/game/pathfinding.ts";
import { pickupInfo } from "../core/game/newGame.ts";
import { objectName } from "../core/game/sites.ts";
import { isPickup } from "../core/game/site-state.ts";
import type { MapObject } from "../core/map/types.ts";
import { adventureSpell } from "../core/magic/index.ts";
import { findArtifact } from "../data/artifacts.ts";
import { CHEST, MINES, RESOURCE_NAMES } from "../data/economy.ts";
import { aimHint } from "./adventure-targets.ts";
import type { AdventureAim } from "./adventure-targets.ts";
import type { CursorKind } from "./cursors.ts";
import { creatureCount, objectAt } from "./format.ts";
import { ODDS_TEXT, battleOdds } from "./hints.ts";
import type { ArmyLike } from "./hints.ts";
import { displayObjects } from "./objects.ts";

/** Two clicks on the same town within this many ms are a double-click. */
export const DOUBLE_CLICK_MS = 400;

export interface TownClick {
  /** The town belongs to the human player. */
  readonly own: boolean;
  /** A hero is selected (the player has one). */
  readonly heroSelected: boolean;
  /** The selected hero stands on the town's entrance. */
  readonly heroInTown: boolean;
  /** The current plan already leads to this town. */
  readonly plannedHere: boolean;
  /** This click is the second of a double-click on the town. */
  readonly double: boolean;
}

/**
 * - "open": open the town screen;
 * - "plan": plan the selected hero's path to the town;
 * - "walk": walk the planned path now;
 * - "walk-later": walk after DOUBLE_CLICK_MS unless a second click opens
 *   the town first;
 * - "none": nothing.
 */
export type TownClickAction = "open" | "plan" | "walk" | "walk-later" | "none";

export function townClickAction(click: TownClick): TownClickAction {
  if (click.own) {
    if (click.double || !click.heroSelected || click.heroInTown) return "open";
    return click.plannedHere ? "walk-later" : "plan";
  }
  if (!click.heroSelected || click.heroInTown) return "none";
  return click.plannedHere ? "walk" : "plan";
}

export interface LastClick {
  /** What was clicked, such as a town id. */
  readonly key: string;
  /** When (ms, performance.now()). */
  readonly at: number;
}

/** Whether a click on `key` at `now` completes a double-click. */
export function isDoubleClick(
  last: LastClick | null,
  key: string,
  now: number,
): boolean {
  return last !== null && last.key === key && now - last.at <= DOUBLE_CLICK_MS;
}

// ------------------------------------------------------------ map actions

/**
 * What a click on the hovered map cell does (UI2-07, bead bzc.58): the
 * cursor and the status line under the map, in the same words. It follows
 * the click handler in game.ts (onMapClick): spell aiming first, then own
 * heroes (meet or select), towns (townClickAction), the selected hero's own
 * cell, and a path to the cell (or to the entrance of a building).
 */
export interface MapActionInput {
  readonly state: GameState;
  readonly player: number;
  /** The selected hero, or null. */
  readonly heroId: string | null;
  readonly x: number;
  readonly y: number;
  /** The planned destination, or null. */
  readonly planned: { readonly x: number; readonly y: number } | null;
  /** An adventure spell being aimed (bead bzc.47), or null. */
  readonly aiming: {
    readonly spell: string;
    readonly aims: readonly AdventureAim[];
  } | null;
}

export interface MapAction {
  readonly cursor: CursorKind;
  /** The status line; "" leaves the next-action hint in place. */
  readonly text: string;
}

const NONE: MapAction = { cursor: "none", text: "" };

/** Object kinds a hero visits by stepping on the entrance. */
const VISITED: ReadonlySet<MapObject["kind"]> = new Set<MapObject["kind"]>([
  "town",
  "mine",
  "site",
  "dwelling",
  "bank",
  "gate",
  "teleport",
]);

/**
 * The cell a click on (x, y) plans to: the entrance when (x, y) is any
 * cell of a building a hero visits, else (x, y) itself.
 */
export function clickTarget(
  obj: MapObject | undefined,
  x: number,
  y: number,
): { x: number; y: number } {
  return obj !== undefined && VISITED.has(obj.kind) && !isPickup(obj)
    ? { x: obj.x, y: obj.y }
    : { x, y };
}

/** Today is left out; "tomorrow"; "in 3 days". */
export function whenWords(days: number): string {
  return days <= 0 ? "" : days === 1 ? "tomorrow" : `in ${days} days`;
}

/** "Attack 10 Bog Leeches" + ": likely victory, tomorrow". */
function sentence(action: string, ...parts: string[]): string {
  const rest = parts.filter((p) => p !== "");
  return rest.length === 0 ? action : `${action}: ${rest.join(", ")}`;
}

/** The odds as words inside a sentence ("likely victory", "risky"). */
function oddsWords(hero: HeroState, enemy: readonly ArmyLike[]): string {
  return ODDS_TEXT[battleOdds(hero, enemy).odds].toLowerCase();
}

/** An artifact named in the object's data, if any. */
function artifactName(obj: MapObject): string | undefined {
  const art = obj.data["artifact"];
  return typeof art === "string" ? findArtifact(art)?.name : undefined;
}

/** A map object named for a sentence: "Oathmere", "the Sawmill", "800 gold". */
export function targetName(state: GameState, obj: MapObject): string {
  switch (obj.kind) {
    case "town":
      return state.towns[obj.id]?.name ?? "the town";
    case "mine": {
      const r = state.mines[obj.id]?.resource;
      return r === undefined ? "the mine" : `the ${MINES[r].name}`;
    }
    case "pickup": {
      const info = pickupInfo(obj);
      if (info.type === "chest")
        return `the ${artifactName(obj) ?? CHEST.name.toLowerCase()}`;
      return `${info.amount} ${RESOURCE_NAMES[info.resource].toLowerCase()}`;
    }
    default:
      return `the ${artifactName(obj) ?? objectName(state, obj)}`;
  }
}

export type PathGuard =
  | { readonly kind: "hero"; readonly hero: HeroState }
  | {
      readonly kind: "monster";
      readonly creature: string;
      readonly count: number;
      /** The stack is the path's target (not a zone the hero stops in). */
      readonly target: boolean;
    };

/**
 * What fights the hero at the end of a path: the attacked stack or hero,
 * or a stack whose zone the hero stops in (a pickup in a zone is fought
 * for first, bead bzc.49). Null when the walk ends in peace.
 */
export function pathGuard(state: GameState, path: Path): PathGuard | null {
  const steps = path.steps;
  const last = steps[steps.length - 1];
  if (last === undefined) return null;
  if (last.attack) {
    const foe = state.heroes.find(
      (h) => h.alive && h.x === last.x && h.y === last.y,
    );
    if (foe !== undefined) return { kind: "hero", hero: foe };
  }
  const monsters = Object.values(state.monsters);
  const stack = (
    m: { creature: string; count: number },
    target: boolean,
  ): PathGuard => ({
    kind: "monster",
    creature: m.creature,
    count: m.count,
    target,
  });
  const target = last.attack
    ? monsters.find((m) => m.x === last.x && m.y === last.y)
    : undefined;
  if (target !== undefined) return stack(target, true);
  const stand = standsOn(last) ? last : steps[steps.length - 2];
  const near = (c: { x: number; y: number } | undefined) =>
    c === undefined
      ? undefined
      : monsters.find(
          (m) => Math.max(Math.abs(m.x - c.x), Math.abs(m.y - c.y)) <= 1,
        );
  const guard = near(stand) ?? (last.pickup === true ? near(last) : undefined);
  return guard === undefined ? null : stack(guard, false);
}

function aimAction(
  state: GameState,
  aiming: NonNullable<MapActionInput["aiming"]>,
  x: number,
  y: number,
): MapAction {
  const hit = aiming.aims.find((a) => a.x === x && a.y === y);
  if (hit === undefined)
    return { cursor: "blocked", text: aimHint(aiming.spell) };
  if (hit.noEffect !== undefined)
    return { cursor: "blocked", text: `No effect: ${hit.noEffect}` };
  const t = hit.target;
  const obj =
    t.objectId === undefined
      ? undefined
      : state.map.objects.find((o) => o.id === t.objectId);
  const on =
    t.monsterId !== undefined || t.heroId !== undefined
      ? ` on ${hit.label}`
      : obj !== undefined
        ? ` on ${targetName(state, obj)}`
        : " here";
  return {
    cursor: "cast",
    text: `Cast ${adventureSpell(aiming.spell).name}${on}`,
  };
}

/** The cursor and status line for a click on (x, y). Pure. */
export function mapAction(input: MapActionInput): MapAction {
  const { state, player, x, y } = input;
  const { map } = state;
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return NONE;
  if (input.aiming !== null) return aimAction(state, input.aiming, x, y);
  const explored =
    state.players.find((p) => p.id === player)?.explored[y * map.width + x] ===
    true;
  if (!explored) return { cursor: "blocked", text: "Can't reach: unexplored" };
  const hero = state.heroes.find(
    (h) => h.alive && h.owner === player && h.id === input.heroId,
  );
  // Another own hero: meet it side by side, else select it.
  const own = state.heroes.find(
    (h) => h.alive && h.owner === player && h.x === x && h.y === y,
  );
  if (own !== undefined && own.id !== hero?.id) {
    if (
      hero !== undefined &&
      Math.max(Math.abs(hero.x - x), Math.abs(hero.y - y)) === 1
    )
      return { cursor: "meet", text: `Meet ${own.name}` };
    return { cursor: "none", text: `Select ${own.name}` };
  }
  const obj = objectAt(displayObjects(state), x, y);
  const mine = obj?.kind === "town" && state.towns[obj.id]?.owner === player;
  if (obj?.kind === "town") {
    const inTown = hero !== undefined && hero.x === obj.x && hero.y === obj.y;
    if (mine && (hero === undefined || inTown))
      return { cursor: "town", text: `Open ${targetName(state, obj)}` };
    if (hero === undefined || inTown) return NONE;
  }
  if (hero === undefined || (hero.x === x && hero.y === y)) return NONE;
  const target = clickTarget(obj, x, y);
  const name = obj === undefined ? null : targetName(state, obj);
  const path = findPath(state, hero.id, target.x, target.y);
  if (path === null || path.steps.length === 0) {
    const monster = Object.values(state.monsters).find(
      (m) => m.x === target.x && m.y === target.y,
    );
    const what =
      monster !== undefined
        ? creatureCount(monster.creature, monster.count)
        : name;
    return {
      cursor: "blocked",
      text: what === null ? "Can't reach" : `Can't reach ${what}`,
    };
  }
  const last = path.steps[path.steps.length - 1];
  const when = whenWords(last?.day ?? 0);
  const guard = pathGuard(state, path);
  const again =
    input.planned !== null &&
    input.planned.x === target.x &&
    input.planned.y === target.y
      ? ". Click again to go."
      : "";
  const done = (cursor: CursorKind, text: string): MapAction => ({
    cursor,
    text: text + again,
  });
  // The click attacks an enemy hero (in a town: the town) or a stack.
  if (guard?.kind === "hero") {
    const foe = obj?.kind === "town" && name !== null ? name : guard.hero.name;
    const army = guard.hero.army.filter((s) => s !== null);
    return done(
      "attack",
      sentence(`Attack ${foe}`, oddsWords(hero, army), when),
    );
  }
  if (guard?.kind === "monster" && guard.target)
    return done(
      "attack",
      sentence(
        `Attack ${creatureCount(guard.creature, guard.count)}`,
        oddsWords(hero, [guard]),
        when,
      ),
    );
  // A stack whose zone the hero stops in fights first.
  const fight =
    guard === null
      ? ""
      : `fight ${creatureCount(guard.creature, guard.count)} first (${oddsWords(hero, [guard])})`;
  const or = (kind: CursorKind): CursorKind => (fight === "" ? kind : "attack");
  if (last?.pickup === true && obj !== undefined)
    return done(
      or("pickup"),
      sentence(`Pick up ${targetName(state, obj)}`, fight, when),
    );
  if (obj?.kind === "town" && name !== null) {
    if (mine) return done(or("town"), sentence(`Enter ${name}`, fight, when));
    const garrison = (state.towns[obj.id]?.garrison ?? []).filter(
      (s) => s !== null,
    );
    return garrison.length > 0
      ? done(
          "attack",
          sentence(`Attack ${name}`, oddsWords(hero, garrison), fight, when),
        )
      : done(or("town"), sentence(`Capture ${name}`, fight, when));
  }
  if (obj !== undefined && name !== null && VISITED.has(obj.kind))
    return done(or("visit"), sentence(`Visit ${name}`, fight, when));
  return done(
    fight !== "" ? "attack" : when === "" ? "walk" : "walk-later",
    sentence("Walk here", fight, when),
  );
}
