/**
 * Town harbours (docs/design/NAVAL.md 2.2 and 5.7, bead bzc.150): the
 * shared Shipyard, Lighthouse and Admiralty of every town tree, and buying
 * ships at a town's Shipyard onto its dock.
 *
 * The buildings themselves are data (src/data/factionTowns.ts, flag
 * `BuildingDef.harbour`); buildStatus (town.ts) refuses them on a map that
 * is not naval ("not-naval") and in a town without a dock ("landlocked").
 * The Lighthouse's +300 sea movement is naval.ts's lighthouseBonus; the
 * Admiralty's deck gun Harm is a town special (ADMIRALTY_SPECIAL) that the
 * battle setup reads from the side's specials (deckGunBonus).
 */
import { buildingDef } from "../../data/factions.ts";
import {
  ADMIRALTY_DECK_GUN_HARM,
  ADMIRALTY_SHIP_PRICE,
  ADMIRALTY_SPECIAL,
  HARBOUR_ADMIRALTY,
  HARBOUR_SHIPYARD,
  SHIP_PRICE,
} from "../../data/naval.ts";
import type { BuildingId, ResourceAmounts } from "../../data/types.ts";
import type { GameMap } from "../map/types.ts";
import { addShip, isNavalMap, shipAt, townDock } from "./naval.ts";
import { canAfford, subtractResources } from "./resources.ts";
import { isPickup } from "./site-state.ts";
import {
  checkTurn,
  cloneState,
  fail,
  findPlayer,
  heroAt,
  must,
  playerSpecials,
  success,
} from "./state.ts";
import type { CommandResult, GameState } from "./types.ts";

/**
 * Whether the town screen shows a building on this map: a harbour
 * building only on a naval map (a dry map's town tree looks as it always
 * did); every other building always.
 */
export function buildingShown(
  map: GameMap,
  faction: string,
  id: BuildingId,
): boolean {
  const def = buildingDef(faction, id);
  return def?.harbour === undefined || isNavalMap(map);
}

/** What stands on a town's dock and keeps a new ship off it, if anything. */
export type DockOccupant = "ship" | "hero" | "guard" | "object";

/**
 * The first thing on the dock cell that a new ship cannot share: a ship
 * (moored or with a hero aboard), any living hero, a sea guard, or an
 * uncollected pickup or a building's entrance. Null when the dock is free.
 */
export function dockOccupant(
  state: GameState,
  dock: { x: number; y: number },
): DockOccupant | null {
  const { x, y } = dock;
  if (shipAt(state, x, y) !== undefined) return "ship";
  if (heroAt(state, x, y) !== undefined) return "hero";
  if (Object.values(state.monsters).some((m) => m.x === x && m.y === y))
    return "guard";
  const collected = new Set(state.collected);
  for (const obj of state.map.objects) {
    if (obj.x !== x || obj.y !== y) continue;
    if (
      obj.kind === "boat" ||
      obj.kind === "monster" ||
      obj.kind === "hero-start" ||
      obj.kind === "buried"
    )
      continue;
    if (isPickup(obj) && collected.has(obj.id)) continue;
    return "object";
  }
  return null;
}

/** The price of a ship at this town: halved by its own Admiralty (5.7). */
export function shipPrice(state: GameState, townId: string): ResourceAmounts {
  const town = state.towns[townId];
  return town?.buildings.includes(HARBOUR_ADMIRALTY) === true
    ? { ...ADMIRALTY_SHIP_PRICE }
    : { ...SHIP_PRICE };
}

export type ShipBuyStatus =
  | "ok"
  | "unknown-town"
  | "not-naval"
  | "not-owner"
  | "landlocked"
  | "no-shipyard"
  | "dock-occupied"
  | "resources";

/**
 * Whether the town's owner can buy a ship here now, and if not the first
 * reason: the map must be naval, the town the owner's with a dock and a
 * Shipyard, the dock free (dockOccupant) and the price affordable. Not
 * limited by the one-building-a-day rule, and no cap on ships (2.2).
 */
export function shipBuyStatus(state: GameState, townId: string): ShipBuyStatus {
  const town = state.towns[townId];
  if (town === undefined) return "unknown-town";
  if (!isNavalMap(state.map)) return "not-naval";
  if (town.owner === null) return "not-owner";
  const dock = townDock(state.map, townId);
  if (dock === null) return "landlocked";
  if (
    !town.buildings.includes(HARBOUR_SHIPYARD) ||
    buildingDef(town.faction, HARBOUR_SHIPYARD) === undefined
  )
    return "no-shipyard";
  if (dockOccupant(state, dock) !== null) return "dock-occupied";
  const player = findPlayer(state, town.owner);
  if (
    player === undefined ||
    !canAfford(player.resources, shipPrice(state, townId))
  )
    return "resources";
  return "ok";
}

/** Why a ship cannot be bought, in a sentence (null when it can). */
export function shipBuyReason(
  state: GameState,
  townId: string,
  status: ShipBuyStatus = shipBuyStatus(state, townId),
): string | null {
  const shipyard = (): string => {
    const town = state.towns[townId];
    return town === undefined
      ? "Shipyard"
      : (buildingDef(town.faction, HARBOUR_SHIPYARD)?.name ?? "Shipyard");
  };
  switch (status) {
    case "ok":
      return null;
    case "unknown-town":
      return "There is no such town.";
    case "not-naval":
      return "There is no sea on this map.";
    case "not-owner":
      return "Not your town.";
    case "landlocked":
      return "Landlocked: no sea within reach of the town for a dock.";
    case "no-shipyard":
      return `Build the ${shipyard()} first.`;
    case "dock-occupied": {
      const dock = townDock(state.map, townId);
      const what = dock === null ? null : dockOccupant(state, dock);
      return what === "ship"
        ? "The dock is taken: a ship is already moored there. Sail it away first."
        : what === "hero"
          ? "The dock is taken: a hero is standing there."
          : what === "guard"
            ? "The dock is taken: a sea guard lies across it."
            : "The dock is taken: something floats there.";
    }
    case "resources": {
      const price = shipPrice(state, townId);
      return `Not enough resources: a ship costs ${price.gold ?? 0} gold and ${price.wood ?? 0} wood.`;
    }
  }
}

const BUY_ERRORS = {
  "unknown-town": "unknown-town",
  "not-naval": "cannot-build",
  "not-owner": "not-owner",
  landlocked: "landlocked",
  "no-shipyard": "requirements",
  "dock-occupied": "cell-occupied",
  resources: "resources",
} as const;

/**
 * Buys a ship at a town's Shipyard (NAVAL 2.2): the owner pays the price
 * (1000 gold and 10 wood; 500 and 5 with the town's Admiralty) and a new
 * ship, owned and moored, appears on the town's dock.
 */
export function buyShip(state: GameState, townId: string): CommandResult {
  const town0 = state.towns[townId];
  if (town0 === undefined) return fail("unknown-town", `no town ${townId}`);
  const blocked = checkTurn(state, town0.owner);
  if (blocked !== null) return blocked;
  const status = shipBuyStatus(state, townId);
  if (status !== "ok") {
    return fail(
      BUY_ERRORS[status],
      shipBuyReason(state, townId, status) ?? status,
    );
  }
  const price = shipPrice(state, townId);
  const next = cloneState(state);
  const owner = must(town0.owner, "owner");
  const player = must(findPlayer(next, owner), "player");
  player.resources = subtractResources(player.resources, price);
  const dock = must(townDock(next.map, townId), "dock");
  const ship = addShip(next, dock.x, dock.y, owner);
  return success(next, [
    {
      type: "ship-bought",
      townId,
      shipId: ship.id,
      player: owner,
      x: dock.x,
      y: dock.y,
    },
  ]);
}

/**
 * The extra deck gun Harm of a side with these town specials (NAVAL 3.3,
 * 5.7): +20 when its player owns an Admiralty (one counts).
 */
export function deckGunBonus(specials: readonly string[]): number {
  return specials.includes(ADMIRALTY_SPECIAL) ? ADMIRALTY_DECK_GUN_HARM : 0;
}

/** deckGunBonus for a player's current towns. */
export function playerDeckGunBonus(state: GameState, player: number): number {
  return deckGunBonus(playerSpecials(state, player));
}
