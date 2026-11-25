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
 */

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
