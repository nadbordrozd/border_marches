/**
 * Hand-built naval maps for the ship tests (bead bzc.149).
 */
import type { MapObject } from "../../../src/core/map/types.ts";
import { newGame } from "../../../src/core/game/index.ts";
import type { GameState } from "../../../src/core/game/index.ts";
import { buildMap, heroStart } from "./helpers.ts";

/**
 * 20 x 12: a west island (columns 0-4, with a one-cell lake at (1, 1)), a
 * sea in columns 5-14 (120 cells: a sea on a map this small, seaMin 60)
 * and an east island (columns 15-19).
 */
export const STRAIT = Array.from({ length: 12 }, (_, y) =>
  y === 1 ? "g~ggg~~~~~~~~~~ggggg" : "ggggg~~~~~~~~~~ggggg",
);

/** A moored boat object (NAVAL 5.6). */
export function boat(id: string, x: number, y: number, owner?: number) {
  return {
    id,
    kind: "boat" as const,
    x,
    y,
    footprint: { w: 1, h: 1 },
    blocked: [],
    data: owner === undefined ? {} : { owner },
  };
}

/**
 * A naval game on `rows`: the land objects are validated as on any map,
 * then the map is made naval and the boats (on water) are added.
 */
export function navalGame(
  rows: readonly string[],
  objects: MapObject[],
  boats: MapObject[],
  hx = 4,
  hy = 5,
  extraStarts: MapObject[] = [],
): GameState {
  const dry = buildMap(
    [...rows],
    [heroStart(hx, hy), ...extraStarts, ...objects],
  );
  const map = { ...dry, naval: true, objects: [...dry.objects, ...boats] };
  return newGame(map);
}
