/**
 * A tiny hand-written 24x18 adventure map that exercises every terrain, a
 * mountain range (with a pass), forests, a lake with deep water, a road and
 * one object of each kind, so renderers and rules can be built and tested
 * before the generator exists.
 *
 * Call {@link buildSmallMap} for a fresh, mutable copy.
 */
import type {
  GameMap,
  MapCell,
  MapObject,
  Obstacle,
  Terrain,
} from "../../src/core/map/types.ts";

export const SMALL_MAP_WIDTH = 24;
export const SMALL_MAP_HEIGHT = 18;
export const SMALL_MAP_SEED = 12345;

// Ground. g grass, j jungle, s steppe, b badlands, w wasteland,
// ~ shallow water, = deep water.
// prettier-ignore
const GROUND = [
  "gggggggggggjjjjjjjjjjjjj", //  0
  "gggggggggggjjjjjjjjjjjjj", //  1
  "ggggggggggggjjjjjjjjjjjj", //  2
  "gggggggggggggjjjjjjjjjjj", //  3
  "ggggggggggggbbjjjjjjjjjj", //  4
  "gggggggggggbbbbbjjjjjjjj", //  5
  "ggggggggggbbbbbbbjjjjjjj", //  6
  "ggggggggsbbbbbbbbbbjjjjj", //  7
  "gggggggssssbbbbbbbbbwwww", //  8
  "ggggggsssssssbbbbbbwwwww", //  9
  "gg~~~~ssssssssbbbbwwwwww", // 10
  "g~~~~~~sssssssssbwwwwwww", // 11
  "~~~==~~~sssssssssswwwwww", // 12
  "~~====~~ssssssssssswwwww", // 13
  "~~====~~ssssssssssswwwww", // 14
  "~~~==~~~sssssssssswwwwww", // 15
  "g~~~~~~sssssssssswwwwwww", // 16
  "gg~~~~ssssssssssswwwwwww", // 17
];

// Overlay. . nothing, M mountain, F forest, # road.
// The range runs from (12,4) to (18,11) with a pass on rows 8-9 that the
// road takes from the town to the mine.
// prettier-ignore
const OVERLAY = [
  "........................", //  0
  ".................FFFF...", //  1
  "................FFFFFF..", //  2
  ".................FFFFFF.", //  3
  "............MM.....FFF..", //  4
  "....#.......MMM.........", //  5
  "....#........MMM........", //  6
  ".FF.#.........MMM.......", //  7
  ".F...###############....", //  8
  "...................#....", //  9
  "...............MMM.#....", // 10
  "................MMM.....", // 11
  "........................", // 12
  "........................", // 13
  "........................", // 14
  "........................", // 15
  "........................", // 16
  "........................", // 17
];

const TERRAIN_CODES: Record<string, Terrain> = {
  g: "grass",
  j: "jungle",
  s: "steppe",
  b: "badlands",
  w: "wasteland",
  "~": "water",
  "=": "water",
};

const OBSTACLE_CODES: Record<string, Obstacle> = {
  ".": "none",
  "#": "none",
  M: "mountain",
  F: "forest",
};

function objects(): MapObject[] {
  return [
    {
      // 3x2 town: gate (entrance) at the bottom middle.
      id: "town-1",
      kind: "town",
      x: 4,
      y: 4,
      footprint: { w: 3, h: 2 },
      blocked: [
        [3, 3],
        [4, 3],
        [5, 3],
        [3, 4],
        [5, 4],
      ],
      data: { faction: "lost-world", owner: 0 },
    },
    {
      // 2x2 ore mine at the end of the road; entrance bottom-left.
      id: "mine-ore-1",
      kind: "mine",
      x: 20,
      y: 11,
      footprint: { w: 2, h: 2 },
      blocked: [
        [20, 10],
        [21, 10],
        [21, 11],
      ],
      data: { resource: "ore" },
    },
    {
      id: "pickup-gold-1",
      kind: "pickup",
      x: 10,
      y: 13,
      footprint: { w: 1, h: 1 },
      blocked: [],
      data: { resource: "gold", amount: 500 },
    },
    {
      // Guards the far side of the mountain pass.
      id: "monster-1",
      kind: "monster",
      x: 14,
      y: 9,
      footprint: { w: 1, h: 1 },
      blocked: [],
      data: { creature: "raptor", count: 8 },
    },
    {
      id: "hero-start-0",
      kind: "hero-start",
      x: 5,
      y: 6,
      footprint: { w: 1, h: 1 },
      blocked: [],
      data: { player: 0 },
    },
  ];
}

/** A fresh copy of the fixture map. */
export function buildSmallMap(): GameMap {
  const cells: MapCell[] = [];
  for (let y = 0; y < SMALL_MAP_HEIGHT; y++) {
    const ground = GROUND[y];
    const overlay = OVERLAY[y];
    if (
      ground?.length !== SMALL_MAP_WIDTH ||
      overlay?.length !== SMALL_MAP_WIDTH
    ) {
      throw new Error(`small-map: row ${y} must be ${SMALL_MAP_WIDTH} wide`);
    }
    for (let x = 0; x < SMALL_MAP_WIDTH; x++) {
      const g = ground.charAt(x);
      const o = overlay.charAt(x);
      const terrain = TERRAIN_CODES[g];
      const obstacle = OBSTACLE_CODES[o];
      if (terrain === undefined || obstacle === undefined) {
        throw new Error(`small-map: bad code at (${x},${y})`);
      }
      const cell: MapCell = { terrain, obstacle, road: o === "#" };
      if (g === "=") cell.deep = true;
      cells.push(cell);
    }
  }
  const zones = cells.map((_, i) => (i % SMALL_MAP_WIDTH < 12 ? 0 : 1));
  return {
    width: SMALL_MAP_WIDTH,
    height: SMALL_MAP_HEIGHT,
    seed: SMALL_MAP_SEED,
    cells,
    objects: objects(),
    zones,
  };
}
