/**
 * Ships as the adventure map draws them (bead bzc.149): where each ship
 * is, its sail colour, and who is aboard, also while a hero walks (the
 * ship it boards goes along; a landing leaves it moored). Pure
 * (unit-tested).
 */
import { isSeaCell, shipAt, shipOfHero, shipsOf } from "../core/game/naval.ts";
import type { GameState, HeroState } from "../core/game/types.ts";
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
