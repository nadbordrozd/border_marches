/**
 * The naval AI's map readings (docs/design/NAVAL.md section 12, bead
 * bzc.156): the harbour part of a player's build plan, the ships a player
 * may plan with, and the rivals' moored ships worth scuttling. The
 * decisions that need the planner (buying a ship, calling one, Lily Road,
 * Fair Wind) are the AdventureAi's; everything here is a pure reading of
 * the state, and nothing applies on a dry map.
 */
import type { GameMap } from "../map/types.ts";
import {
  isMoored,
  isNavalMap,
  seaMask,
  shipsOf,
  townDock,
  type GameState,
  type TownState,
} from "../game/index.ts";
import type { ShipState } from "../game/types.ts";
import type { HarbourPlan } from "./economy.ts";
import { SEAWARD_SHARE } from "./economy.ts";

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

const shareCache = new WeakMap<GameMap, number>();

/** The share of the map's cells that are sea (0 on a dry map), cached. */
export function seaShare(map: GameMap): number {
  const hit = shareCache.get(map);
  if (hit !== undefined) return hit;
  let share = 0;
  if (isNavalMap(map)) {
    const sea = seaMask(map);
    let n = 0;
    for (const v of sea) if (v === 1) n++;
    share = sea.length === 0 ? 0 : n / sea.length;
  }
  shareCache.set(map, share);
  return share;
}

/**
 * The harbour part of a player's build plan (economy.ts HarbourPlan), or
 * nothing on a dry map (the build order is then exactly as before).
 */
export function harbourPlan(
  state: GameState,
  player: number,
  towns: readonly TownState[],
): { harbour?: HarbourPlan } {
  if (state.ships === undefined || !isNavalMap(state.map)) return {};
  const docks = new Set<string>();
  for (const t of towns) {
    if (townDock(state.map, t.id) !== null) docks.add(t.id);
  }
  if (docks.size === 0) return {};
  const ships = shipsOf(state).filter((s) => s.owner === player).length;
  return {
    harbour: {
      docks,
      seaward: seaShare(state.map) >= SEAWARD_SHARE,
      ships,
    },
  };
}

/**
 * How far (Chebyshev cells) from one of the player's towns a rival's
 * moored ship is a landing party waiting to happen: about a day's sail.
 */
export const SCUTTLE_TOWN_RANGE = 15;
/** A rival's hero this near its moored ship is about to board it. */
export const SCUTTLE_BOARDER_RANGE = 4;

/**
 * The rivals' moored ships worth sinking from among `candidates` (Scuttle,
 * NAVAL 12 "Denial"): owned by another player (never our own, never a
 * neutral boat any hero may still use), and either within a day's sail of
 * one of our towns or with one of its owner's heroes beside it, about to
 * board. Nearest to our towns first, then in ship order.
 */
export function shipsToScuttle(
  state: GameState,
  player: number,
  candidates: readonly ShipState[],
): ShipState[] {
  const towns: Array<{ x: number; y: number }> = [];
  for (const obj of state.map.objects) {
    if (obj.kind !== "town" || state.towns[obj.id]?.owner !== player) continue;
    towns.push({ x: obj.x, y: obj.y });
  }
  const scored: Array<{ ship: ShipState; d: number; i: number }> = [];
  candidates.forEach((ship, i) => {
    if (ship.owner === null || ship.owner === player) return;
    if (!isMoored(state, ship)) return;
    let d = Infinity;
    for (const t of towns) d = Math.min(d, chebyshev(t.x, t.y, ship.x, ship.y));
    const boarder = state.heroes.some(
      (h) =>
        h.alive &&
        h.owner === ship.owner &&
        chebyshev(h.x, h.y, ship.x, ship.y) <= SCUTTLE_BOARDER_RANGE,
    );
    if (d > SCUTTLE_TOWN_RANGE && !boarder) return;
    scored.push({ ship, d, i });
  });
  scored.sort((a, b) => a.d - b.d || a.i - b.i);
  return scored.map((x) => x.ship);
}

/** Whether the player owns a ship nobody is aboard (one to call). */
export function hasMooredShip(state: GameState, player: number): boolean {
  return shipsOf(state).some((s) => s.owner === player && isMoored(state, s));
}
