/**
 * The adventure map contract shared by the generator, the rules and the
 * renderer. Keep it small: anything kind-specific lives in MapObject.data.
 *
 * Coordinates: x is the column (0 = left), y is the row (0 = top, growing
 * down, as on screen). Cells are stored row-major: index = y * width + x.
 */
import { decorationKind } from "../../data/decorations.ts";

/** Ground terrain. Every cell has exactly one. */
export type Terrain =
  | "grass"
  | "jungle"
  | "steppe"
  | "badlands"
  | "wasteland"
  | "volcanic"
  | "snow"
  | "sand"
  | "frosting"
  | "water";

/**
 * An impassable feature standing on the ground terrain. Water cells never
 * have one.
 */
export type Obstacle = "none" | "mountain" | "forest";

export const TERRAINS: readonly Terrain[] = [
  "grass",
  "jungle",
  "steppe",
  "badlands",
  "wasteland",
  "volcanic",
  "snow",
  "sand",
  "frosting",
  "water",
];

export const OBSTACLES: readonly Obstacle[] = ["none", "mountain", "forest"];

export interface MapCell {
  terrain: Terrain;
  obstacle: Obstacle;
  /** A road runs through this cell (never on water or an obstacle). */
  road: boolean;
  /** Deep water (water cells only; absent or false means shallow). */
  deep?: boolean;
  /**
   * An impassable decorative prop stands here (a boulder, a fallen log:
   * one of {@link GameMap.decorations}, bead bzc.72): the cell blocks
   * movement like a forest. Only on open land; absent means false.
   */
  prop?: boolean;
}

/**
 * The movement and visit family of an object. Catalogue types
 * (src/data/objectTypes.ts, `data.type`) map onto these:
 * - "mine": flagged producers; "pickup": resource piles and chests;
 * - "dwelling": map dwellings (flag, then recruit);
 * - "site": every other visitable building, service and one-off;
 * - "bank": a fight against its own guard, then its prize;
 * - "artifact": a loose artifact;
 * - "buried": hidden, found by digging (never drawn, never a stop);
 * - "gate": a one-cell passage block, open to some players;
 * - "teleport": moves the hero.
 */
export type MapObjectKind =
  | "town"
  | "mine"
  | "pickup"
  | "monster"
  | "hero-start"
  | "dwelling"
  | "site"
  | "bank"
  | "artifact"
  | "buried"
  | "gate"
  | "teleport";

export const MAP_OBJECT_KINDS: readonly MapObjectKind[] = [
  "town",
  "mine",
  "pickup",
  "monster",
  "hero-start",
  "dwelling",
  "site",
  "bank",
  "artifact",
  "buried",
  "gate",
  "teleport",
];

/** The four resources. */
export type ResourceId = "wood" | "ore" | "gold" | "essence";

/**
 * A thing placed on the map.
 *
 * (x, y) is the ENTRANCE / visit cell: a hero triggers the object (enters the
 * town, flags the mine, takes the pickup, fights the monster) by moving onto
 * it. It must be a passable cell and is never listed in `blocked`.
 *
 * `blocked` lists every other cell the object covers; those are impassable.
 * A 1x1 object (pickup, monster, hero-start) has `blocked: []`.
 *
 * `footprint` is the size in cells of the bounding box of the entrance plus
 * the blocked cells (see {@link objectBounds}); renderers use that box to
 * place the sprite.
 */
export interface MapObject {
  /** Unique within the map, e.g. "town-1", "mine-ore-2". */
  id: string;
  kind: MapObjectKind;
  x: number;
  y: number;
  footprint: { w: number; h: number };
  blocked: Array<[number, number]>;
  /**
   * Kind-specific payload; see {@link MapObjectData} for the expected keys.
   * Kept as a plain record so later beads can add keys without touching the
   * contract.
   */
  data: Record<string, unknown>;
}

/** Expected `data` keys per kind (documentation and casting aid). */
export interface MapObjectData {
  /**
   * `owner` is a player index, or null when neutral. A neutral town with
   * `hold: false` is an ordinary town defended by `garrison`; otherwise it
   * is the Warlord's Hold. `start` marks a player start (owned, or open when
   * that player is not in the game).
   */
  town: {
    faction: string;
    owner: number | null;
    hold?: boolean;
    start?: number;
    garrison?: Array<{ creature: string; count: number }>;
  };
  /** `value`: the prize value from src/data/mapObjects.ts. */
  mine: { resource: ResourceId; value?: number };
  pickup: { resource: ResourceId; amount: number; value?: number };
  /**
   * `creature` is a creature id from src/data. Generated guards also carry
   * `value` (what they guard), `guards` (object ids behind them), `fv` and
   * `ring`, and `pass: true` when they hold a passage between zones.
   */
  monster: {
    creature: string;
    count: number;
    value?: number;
    guards?: string[];
    pass?: boolean;
  };
  /** The player who starts here. */
  "hero-start": { player: number };
}

/**
 * A purely decorative piece (bead bzc.72): a passable decoration (a
 * butterfly, a molehill) or an impassable prop (a boulder, a fallen log)
 * of the catalogue in src/data/decorations.ts. A prop covers `cols` cells
 * from (x, y) to the east and marks them {@link MapCell.prop}.
 */
export interface MapDecoration {
  /** A decoration kind id (DECORATION_KINDS). */
  id: string;
  /** Its cell, or a prop's footprint's top-left (westmost) cell. */
  x: number;
  y: number;
  /** Which look (wraps round the kind's looks). */
  variant: number;
}

export interface GameMap {
  width: number;
  height: number;
  seed: number;
  /** Row-major, length width * height. */
  cells: MapCell[];
  objects: MapObject[];
  /** Optional zone id per cell (row-major), from the generator. */
  zones?: number[];
  /**
   * Decorations and props (bead bzc.72), placed after the objects
   * (decorate.ts); absent on maps made before them.
   */
  decorations?: MapDecoration[];
}

/** A cell with default values: `{ terrain, obstacle: "none", road: false }`. */
export function makeCell(
  terrain: Terrain,
  obstacle: Obstacle = "none",
): MapCell {
  return { terrain, obstacle, road: false };
}

/** A map filled with one terrain and no objects. */
export function createMap(
  width: number,
  height: number,
  seed: number,
  fill: Terrain = "grass",
): GameMap {
  const cells: MapCell[] = [];
  for (let i = 0; i < width * height; i++) cells.push(makeCell(fill));
  return { width, height, seed, cells, objects: [] };
}

export function inBounds(map: GameMap, x: number, y: number): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x < map.width &&
    y < map.height
  );
}

/** Row-major index of (x, y). Does not check bounds. */
export function cellIndex(map: GameMap, x: number, y: number): number {
  return y * map.width + x;
}

/** The cell at (x, y), or undefined when out of bounds. */
export function cellAt(
  map: GameMap,
  x: number,
  y: number,
): MapCell | undefined {
  return inBounds(map, x, y) ? map.cells[cellIndex(map, x, y)] : undefined;
}

/** Offsets in a fixed order: N, NE, E, SE, S, SW, W, NW. */
export const DIRECTIONS_8: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

/** In-bounds neighbours of (x, y), in {@link DIRECTIONS_8} order. */
export function neighbours8(
  map: GameMap,
  x: number,
  y: number,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const [dx, dy] of DIRECTIONS_8) {
    if (inBounds(map, x + dx, y + dy)) out.push([x + dx, y + dy]);
  }
  return out;
}

/**
 * Whether the ground of a cell can be walked on: not water, no obstacle,
 * no prop. Objects are separate: see {@link objectBlockedSet}.
 */
export function isPassable(cell: MapCell): boolean {
  return (
    cell.terrain !== "water" && cell.obstacle === "none" && cell.prop !== true
  );
}

/** The cells a decoration covers: its own, or a prop's footprint. */
export function decorationCells(d: MapDecoration): Array<[number, number]> {
  const kind = decorationKind(d.id);
  const cols = kind === undefined || kind.passable ? 1 : kind.cols;
  const rows = kind === undefined || kind.passable ? 1 : kind.rows;
  const out: Array<[number, number]> = [];
  for (let dy = 0; dy < rows; dy++)
    for (let dx = 0; dx < cols; dx++) out.push([d.x + dx, d.y + dy]);
  return out;
}

/** The impassable prop covering (x, y), if any. */
export function propAt(
  map: GameMap,
  x: number,
  y: number,
): MapDecoration | undefined {
  if (cellAt(map, x, y)?.prop !== true) return undefined;
  return map.decorations?.find(
    (d) =>
      decorationKind(d.id)?.passable === false &&
      decorationCells(d).some(([cx, cy]) => cx === x && cy === y),
  );
}

/** The entrance cell followed by the blocked cells of an object. */
export function objectCells(obj: MapObject): Array<[number, number]> {
  return [[obj.x, obj.y], ...obj.blocked];
}

/** Bounding box of an object's cells (entrance plus blocked). */
export function objectBounds(obj: MapObject): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  let minX = obj.x;
  let minY = obj.y;
  let maxX = obj.x;
  let maxY = obj.y;
  for (const [x, y] of obj.blocked) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Row-major indices of every cell blocked by an object. */
export function objectBlockedSet(map: GameMap): Set<number> {
  const out = new Set<number>();
  for (const obj of map.objects) {
    for (const [x, y] of obj.blocked) out.add(cellIndex(map, x, y));
  }
  return out;
}

/**
 * Check the contract's invariants. Returns human-readable problems; an empty
 * array means the map is valid. Generators and fixtures should assert this.
 */
export function validateMap(map: GameMap): string[] {
  const problems: string[] = [];
  const { width, height } = map;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1
  ) {
    problems.push(`bad size ${width}x${height}`);
    return problems;
  }
  if (map.cells.length !== width * height) {
    problems.push(`cells.length ${map.cells.length} != ${width * height}`);
    return problems;
  }
  if (map.zones !== undefined && map.zones.length !== width * height) {
    problems.push(`zones.length ${map.zones.length} != ${width * height}`);
  }
  map.cells.forEach((cell, i) => {
    const at = `cell (${i % width},${Math.floor(i / width)})`;
    if (!TERRAINS.includes(cell.terrain)) problems.push(`${at}: bad terrain`);
    if (!OBSTACLES.includes(cell.obstacle))
      problems.push(`${at}: bad obstacle`);
    if (cell.terrain === "water" && cell.obstacle !== "none") {
      problems.push(`${at}: water with an obstacle`);
    }
    if (cell.deep === true && cell.terrain !== "water") {
      problems.push(`${at}: deep on land`);
    }
    if (cell.road && !isPassable(cell))
      problems.push(`${at}: road on impassable`);
    if (
      cell.prop === true &&
      (cell.terrain === "water" || cell.obstacle !== "none")
    )
      problems.push(`${at}: prop off open land`);
  });

  const ids = new Set<string>();
  const taken = new Map<number, string>();
  for (const obj of map.objects) {
    const at = `object ${obj.id}`;
    if (ids.has(obj.id)) problems.push(`${at}: duplicate id`);
    ids.add(obj.id);
    if (!MAP_OBJECT_KINDS.includes(obj.kind)) problems.push(`${at}: bad kind`);
    const entrance = cellAt(map, obj.x, obj.y);
    if (entrance === undefined) {
      problems.push(`${at}: entrance out of bounds`);
    } else if (!isPassable(entrance)) {
      problems.push(`${at}: entrance on impassable ground`);
    }
    for (const [x, y] of obj.blocked) {
      if (!inBounds(map, x, y))
        problems.push(`${at}: blocked (${x},${y}) out of bounds`);
      if (x === obj.x && y === obj.y)
        problems.push(`${at}: entrance listed as blocked`);
    }
    const box = objectBounds(obj);
    if (box.w !== obj.footprint.w || box.h !== obj.footprint.h) {
      problems.push(
        `${at}: footprint ${obj.footprint.w}x${obj.footprint.h} != bounds ${box.w}x${box.h}`,
      );
    }
    for (const [x, y] of objectCells(obj)) {
      if (!inBounds(map, x, y)) continue;
      const i = cellIndex(map, x, y);
      const other = taken.get(i);
      if (other !== undefined && other !== obj.id) {
        problems.push(`${at}: overlaps ${other} at (${x},${y})`);
      }
      taken.set(i, obj.id);
    }
  }
  problems.push(...decorationProblems(map, taken));
  return problems;
}

/**
 * Decorations: known kinds on open land; props on cells no object uses,
 * off the roads, not overlapping, and exactly the cells marked `prop`.
 */
function decorationProblems(
  map: GameMap,
  taken: ReadonlyMap<number, string>,
): string[] {
  const problems: string[] = [];
  const props = new Set<number>();
  for (const d of map.decorations ?? []) {
    const at = `decoration ${d.id} at (${d.x},${d.y})`;
    const kind = decorationKind(d.id);
    if (kind === undefined) {
      problems.push(`${at}: unknown kind`);
      continue;
    }
    for (const [x, y] of decorationCells(d)) {
      const cell = cellAt(map, x, y);
      if (cell === undefined) {
        problems.push(`${at}: (${x},${y}) off the map`);
        continue;
      }
      if (cell.terrain === "water" || cell.obstacle !== "none")
        problems.push(`${at}: (${x},${y}) not open land`);
      if (kind.passable) continue;
      const i = cellIndex(map, x, y);
      if (props.has(i)) problems.push(`${at}: overlaps a prop`);
      props.add(i);
      if (cell.road) problems.push(`${at}: on a road`);
      const other = taken.get(i);
      if (other !== undefined) problems.push(`${at}: overlaps ${other}`);
    }
  }
  map.cells.forEach((cell, i) => {
    if ((cell.prop === true) !== props.has(i)) {
      const at = `cell (${i % map.width},${Math.floor(i / map.width)})`;
      problems.push(`${at}: prop flag does not match the decorations`);
    }
  });
  return problems;
}
