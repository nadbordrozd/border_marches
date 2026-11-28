/**
 * Ships as the adventure map draws them (bead bzc.149): where each ship
 * is, its sail colour, and who is aboard, also while a hero walks (the
 * ship it boards goes along; a landing leaves it moored). Pure
 * (unit-tested).
 */
import { isSeaCell, shipAt, shipOfHero, shipsOf } from "../core/game/naval.ts";
import type { GameEvent, GameState, HeroState } from "../core/game/types.ts";
import { SHIP_PRICE } from "../data/naval.ts";
import { playerColour } from "../data/players.ts";
import type { MapShip } from "../render/map/map-view.ts";

/** The ship a walking hero carries and where it is now. */
export interface CarriedShip {
  readonly shipId: string;
  readonly x: number;
  readonly y: number;
}

/** The ship under a hero before it walks (null: ashore). */
export function carriedAtStart(
  state: GameState,
  hero: HeroState,
): CarriedShip | null {
  const ship = shipOfHero(state, hero);
  return ship === undefined ? null : { shipId: ship.id, x: hero.x, y: hero.y };
}

/**
 * The carried ship after the hero steps onto (x, y) in the walk that
 * started in `state`: it sails along; a boarding picks up the moored ship
 * there; a step onto land leaves it where it was (null).
 */
export function carryStep(
  state: GameState,
  carried: CarriedShip | null,
  x: number,
  y: number,
): CarriedShip | null {
  if (!isSeaCell(state.map, x, y)) return null;
  if (carried !== null) return { ...carried, x, y };
  const ship = shipAt(state, x, y);
  return ship === undefined ? null : { shipId: ship.id, x, y };
}

/**
 * The ships to draw for `state`: ships moved by a walk being shown at
 * their positions in `moved`; a ship is sailing when a shown hero stands
 * on its cell (`heroes`, as drawn).
 */
export function mapShips(
  state: GameState,
  heroes: ReadonlyArray<{ id: string; x: number; y: number }>,
  moved: ReadonlyMap<string, { x: number; y: number }> = new Map(),
): MapShip[] {
  return shipsOf(state).map((ship) => {
    const at = moved.get(ship.id) ?? { x: ship.x, y: ship.y };
    const aboard = heroes.find((h) => h.x === at.x && h.y === at.y);
    return {
      id: ship.id,
      x: at.x,
      y: at.y,
      ...(ship.owner === null ? {} : { colour: playerColour(ship.owner).hex }),
      ...(aboard === undefined ? {} : { heroId: aboard.id }),
    };
  });
}

/**
 * The message-log line of a Call the Boat (NAVAL 7.1, bead bzc.159): for
 * the player's own hero what came and, for a new boat, its price
 * (`quiet` false: it floats up from the hero); for another player only
 * when the boat's cell is explored, and quietly. Null: nothing to say.
 */
export function shipCalledLine(
  state: GameState,
  event: Extract<GameEvent, { type: "ship-called" }>,
  human: number,
): { text: string; quiet: boolean } | null {
  const hero = state.heroes.find((h) => h.id === event.heroId);
  if (hero === undefined) return null;
  if (hero.owner === human)
    return {
      text: event.built
        ? `${hero.name} calls for a boat: a new one is built alongside (${SHIP_PRICE.gold} gold, ${SHIP_PRICE.wood} wood)`
        : `${hero.name} calls the boat: it sails up alongside`,
      quiet: false,
    };
  const explored = state.players[human]?.explored;
  if (explored?.[event.y * state.map.width + event.x] !== true) return null;
  return {
    text: `${playerColour(hero.owner).name} calls a boat`,
    quiet: true,
  };
}
