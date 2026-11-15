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
  water: null,
};

/** Straight step when both cells have a road. */
export const ROAD_MOVE_COST = 75;

/** Straight step onto the hero's native terrain. */
export const NATIVE_MOVE_COST = 100;

/** Diagonal steps cost the straight cost x DIAGONAL_NUM / DIAGONAL_DEN, rounded. */
export const DIAGONAL_NUM = 1414;
export const DIAGONAL_DEN = 1000;
