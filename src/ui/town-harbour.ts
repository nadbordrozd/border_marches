/**
 * The town screen's harbour (docs/design/NAVAL.md 2.2 and 5.7, bead
 * bzc.150): pictures for the Shipyard, Lighthouse and Admiralty tiles and
 * the "Buy a ship" action.
 *
 * Building art is looked up by id (buildingArt), so the harbour sprites of
 * art bead 9c drop in by registering them in BUILDING_ART_ASSETS. Until
 * then each harbour building borrows a stand-in from the sea art already in
 * the game: the map's Shipwright, its Lighthouse and the sailing ship.
 */
import { buildingArt } from "../assets/town-art.ts";
import { shipBuyReason, shipBuyStatus, shipPrice } from "../core/game/index.ts";
import type { GameState } from "../core/game/index.ts";
import { buildingDef } from "../data/factions.ts";
import { HARBOUR_SHIPYARD } from "../data/naval.ts";
import type { BuildingId } from "../data/types.ts";
import { button, costView, el, img } from "./dom.ts";
import { setTip, tipCard } from "./tooltip.ts";

/** Stand-in pictures (map art keys) until the harbour sprites exist. */
export const HARBOUR_STAND_IN: Readonly<
  Record<"shipyard" | "lighthouse" | "admiralty", string>
> = {
  shipyard: "map-object-shipwright",
  lighthouse: "map-object-lighthouse",
  admiralty: "map-object-ship-sailing",
};

/** The image key of the "Buy a ship" button: the moored boat. */
export const BUY_SHIP_ART = "map-object-moored-boat";

/**
 * A building's picture for the town screen: its own art when it has some,
 * else a harbour building's stand-in (flagged `standIn` so it is drawn
 * whole, not stretched to the tile), else null.
 */
export function townBuildingArt(
  faction: string,
  id: BuildingId,
): { key: string; standIn: boolean } | null {
  const art = buildingArt(faction, id);
  if (art !== null) return { key: art.key, standIn: false };
  const harbour = buildingDef(faction, id)?.harbour;
  return harbour === undefined
    ? null
    : { key: HARBOUR_STAND_IN[harbour], standIn: true };
}

/**
 * The "Buy a ship" button: the price on its face, greyed with the reason
 * (no Shipyard, landlocked, the dock taken, too poor) when a ship cannot
 * be bought now.
 */
export function buyShipButton(
  state: GameState,
  townId: string,
  onBuy: () => void,
  className = "gm-btn gm-town-tool gm-buy-ship",
): HTMLButtonElement {
  const status = shipBuyStatus(state, townId);
  const price = shipPrice(state, townId);
  const b = button("", onBuy, className);
  b.dataset["status"] = status;
  b.append(
    img(BUY_SHIP_ART, "gm-town-tool-art gm-buy-ship-art"),
    el("span", "Buy a ship"),
  );
  b.disabled = status !== "ok";
  const town = state.towns[townId];
  const shipyard =
    town === undefined
      ? "Shipyard"
      : (buildingDef(town.faction, HARBOUR_SHIPYARD)?.name ?? "Shipyard");
  const why = shipBuyReason(state, townId, status);
  // A disabled button gets no hover card: the reason is its title.
  if (why !== null) b.title = why;
  else
    setTip(b, () =>
      tipCard("Buy a ship", [
        `Built at the ${shipyard}; the ship waits, moored, at the town's dock. A hero boards it from the shore.`,
        el("div.gm-tip-line", "Price: ", costView(price)),
      ]),
    );
  return b;
}
