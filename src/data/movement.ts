/**
 * Adventure-map movement costs (GAME_DESIGN.md section 7.1).
 */
import type { Terrain } from "../core/map/types.ts";

/** Straight-step cost of entering a cell; null = impassable. */
export const TERRAIN_MOVE_COST: Readonly<Record<Terrain, number | null>> = {
  grass: 100,
  steppe: 100,
  jungle: 150,
  badlands: 125,
  wasteland: 150,
  // Volcanic ground (bead bzc.83): cracked basalt and ash, as rough as the
  // wasteland.
  volcanic: 150,
  water: null,
};

/**
 * Straight step when both cells have a road. 70, not the MVP's 75 (bead
 * bzc.44): two road steps (140) must cost less than one diagonal step on
 * the cheapest terrain (141), so following a road always beats cutting
 * across the field beside it.
 */
export const ROAD_MOVE_COST = 70;

/**
 * A diagonal step between two road cells whose shared corner cell is also
 * road: one more than the two straight road steps round the corner, so the
 * walk through the corner (the road as drawn) always wins.
 */
export const ROAD_CORNER_DIAGONAL_COST = 2 * ROAD_MOVE_COST + 1;

/** Straight step onto the hero's native terrain. */
export const NATIVE_MOVE_COST = 100;

/** Diagonal steps cost the straight cost x DIAGONAL_NUM / DIAGONAL_DEN, rounded. */
export const DIAGONAL_NUM = 1414;
export const DIAGONAL_DEN = 1000;
