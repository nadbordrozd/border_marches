/**
 * The town screen's harbour (docs/design/NAVAL.md 2.2 and 5.7, bead
 * bzc.150): the "Buy a ship" action. The Shipyard, Lighthouse and
 * Admiralty have building sprites like every other building (bzc.159).
 */
import { shipBuyReason, shipBuyStatus, shipPrice } from "../core/game/index.ts";
import type { GameState } from "../core/game/index.ts";
import { buildingDef } from "../data/factions.ts";
import { HARBOUR_SHIPYARD } from "../data/naval.ts";
import { button, costView, el, img } from "./dom.ts";
import { setTip, tipCard } from "./tooltip.ts";

/** The image key of the "Buy a ship" button: the moored boat. */
export const BUY_SHIP_ART = "map-object-moored-boat";

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
