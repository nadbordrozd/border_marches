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
import type { MapObject } from "../map/types.ts";
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

/** A hero standing on a Sanctuary's entrance cannot be attacked. */
export function inSanctuary(state: GameState, x: number, y: number): boolean {
  return state.map.objects.some(
    (o) => o.x === x && o.y === y && o.data["type"] === "sanctuary",
  );
}
