/**
 * Small, dependency-free helpers about map objects and their memory
 * (GameState.sites, bead bzc.13), shared by pathfinding, the turn, the
 * battle seam and the site rules (./sites.ts).
 */
import {
  isObjectTypeId,
  OBJECT_TYPES,
  type ObjectTypeDef,
  type ObjectTypeId,
} from "../../data/objectTypes.ts";
import { MINES } from "../../data/economy.ts";
import { SEA_PRODUCERS } from "../../data/sea-objects.ts";
import type { MapObject, ResourceId } from "../map/types.ts";
import type { GameState, SiteState } from "./types.ts";

/** The catalogue type of a placed object (from `data.type`), or null. */
export function objectTypeOf(obj: MapObject): ObjectTypeId | null {
  const t = obj.data["type"];
  return isObjectTypeId(t) ? t : null;
}

export function objectTypeDef(obj: MapObject): ObjectTypeDef | null {
  const t = objectTypeOf(obj);
  return t === null ? null : OBJECT_TYPES[t];
}

/**
 * The resource a mine-kind object yields: its `data.resource`, or a sea
 * producer's own (a Pearl Bed's essence, a Fishing Village's gold; bead
 * bzc.151). Undefined when neither names one.
 */
export function mineResourceOf(obj: MapObject): ResourceId | undefined {
  const r = obj.data["resource"];
  if (r === "wood" || r === "ore" || r === "essence" || r === "gold") return r;
  const t = objectTypeOf(obj);
  return t === "pearl-bed" || t === "fishing-village"
    ? SEA_PRODUCERS[t].resource
    : undefined;
}

/**
 * What a flagged mine-kind object pays its owner each day: its kind's
 * yield (MINES) times `data.yield` (a Haunted Mine's 2), or a sea
 * producer's own yield (bead bzc.151).
 */
export function mineIncome(
  obj: MapObject | undefined,
  resource: ResourceId,
): number {
  const t = obj === undefined ? null : objectTypeOf(obj);
  if (t === "pearl-bed" || t === "fishing-village")
    return SEA_PRODUCERS[t].income;
  const y = typeof obj?.data["yield"] === "number" ? obj.data["yield"] : 1;
  return MINES[resource].income * y;
}

/** A mine-kind object's name: a sea producer's own, else its kind's. */
export function mineName(
  obj: MapObject | undefined,
  resource: ResourceId,
): string {
  const t = obj === undefined ? null : objectTypeOf(obj);
  return t === "pearl-bed" || t === "fishing-village"
    ? OBJECT_TYPES[t].name
    : MINES[resource].name;
}

/** The absolute week of a day (1-based; day 1 of each week starts one). */
export function weekOf(day: number): number {
  return Math.floor((day - 1) / 7) + 1;
}

/** The last day of the week that `day` is in. */
export function weekEnd(day: number): number {
  return weekOf(day) * 7;
}

/** The object's memory, read-only (an empty record when it has none). */
export function siteOf(state: GameState, id: string): SiteState {
  return state.sites[id] ?? {};
}

/** The object's memory for writing, created on first use (in place). */
export function siteFor(state: GameState, id: string): SiteState {
  let s = state.sites[id];
  if (s === undefined) {
    s = {};
    state.sites[id] = s;
  }
  return s;
}

/** Whether a player is listed in a site's `players`. */
export function playerListed(
  state: GameState,
  id: string,
  player: number,
): boolean {
  return siteOf(state, id).players?.includes(player) ?? false;
}

/** Colours of the keys a player holds (visited keymaster's tents). */
export function keysOf(state: GameState, player: number): string[] {
  const out: string[] = [];
  for (const o of state.map.objects) {
    if (o.data["type"] !== "keymasters-tent") continue;
    const colour = String(o.data["colour"] ?? "");
    if (playerListed(state, o.id, player) && !out.includes(colour)) {
      out.push(colour);
    }
  }
  return out;
}

/** Whether a gate lets the player's heroes through. */
export function gateOpen(
  state: GameState,
  obj: MapObject,
  player: number,
): boolean {
  if (obj.kind !== "gate") return true;
  if (obj.data["type"] === "border-gate") {
    return keysOf(state, player).includes(String(obj.data["colour"] ?? ""));
  }
  return playerListed(state, obj.id, player);
}

/** One-time objects that are gone (collected, opened, freed). */
export function isGone(state: GameState, obj: MapObject): boolean {
  return state.collected.includes(obj.id);
}

/**
 * One-time pickups (RULES_V2 5.6, bead bzc.49): resource piles, chests,
 * loose artifacts and scrolls, campfires, sealed boxes, the scholar, the
 * fallen adventurer, prisons: every one-cell object that leaves the map
 * once used. Until taken it blocks its cell; a hero takes it from any
 * next cell. Buried treasure and event tiles (dug or stepped on) are not
 * pickups, nor is anything bigger or lasting (mines, dwellings, towns,
 * shrines, wells, banks: entered by stepping on their entrance).
 */
export function isPickup(obj: MapObject): boolean {
  if (obj.kind === "pickup") return true;
  if (obj.kind !== "site" && obj.kind !== "artifact") return false;
  const def = objectTypeDef(obj);
  if (def === null) return obj.kind === "artifact";
  return (
    def.vanishes &&
    def.w === 1 &&
    def.h === 1 &&
    def.reset === "one-time" &&
    def.id !== "event-tile"
  );
}

/** Whether a hero at (x, y) can take the pickup: on it or next to it. */
export function besidePickup(obj: MapObject, x: number, y: number): boolean {
  return Math.max(Math.abs(obj.x - x), Math.abs(obj.y - y)) <= 1;
}

/** A hero standing on a Sanctuary's entrance cannot be attacked. */
export function inSanctuary(state: GameState, x: number, y: number): boolean {
  return state.map.objects.some(
    (o) => o.x === x && o.y === y && o.data["type"] === "sanctuary",
  );
}
