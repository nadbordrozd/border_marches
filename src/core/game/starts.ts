/**
 * Player starts on a map (RULES_V2 5.1: each player starts with one town and
 * one hero).
 *
 * A map names its starts with `hero-start` objects (`data.player`) and
 * towns whose `data.owner` is that player. The map generator is being
 * reworked to place two to four starts (bead bzc.3); until then
 * {@link prepareStarts} derives missing ones from the current generator's
 * output: first the Warlord's Hold becomes a player's town, then new town
 * sites are found as far as possible from the existing starts, on open
 * ground reachable from player 0 that a town footprint cannot cut off.
 * Pure and deterministic (no randomness: scan order breaks ties).
 */
import { townTree } from "../../data/factions.ts";
import {
  DIRECTIONS_8,
  type GameMap,
  type MapObject,
  inBounds,
  isPassable,
} from "../map/types.ts";

export interface StartSite {
  player: number;
  /** Hero start cell. */
  x: number;
  y: number;
  /** The player's town object id, if the map gives one. */
  townId: string | null;
}

function playerOf(obj: MapObject): number | null {
  const p = obj.kind === "hero-start" ? obj.data["player"] : obj.data["owner"];
  return typeof p === "number" && Number.isInteger(p) && p >= 0 ? p : null;
}

/** The starts a map defines, by player index. */
export function mapStarts(map: GameMap): StartSite[] {
  const out: StartSite[] = [];
  for (const obj of map.objects) {
    if (obj.kind !== "hero-start") continue;
    const player = playerOf(obj);
    if (player === null) continue;
    const town = map.objects.find(
      (o) => o.kind === "town" && playerOf(o) === player,
    );
    out.push({ player, x: obj.x, y: obj.y, townId: town?.id ?? null });
  }
  return out.sort((a, b) => a.player - b.player);
}

/** A neutral fortress without a building tree (the Warlord's Hold). */
function isHoldObject(obj: MapObject): boolean {
  if (obj.kind !== "town" || playerOf(obj) !== null) return false;
  const faction = obj.data["faction"];
  return typeof faction !== "string" || townTree(faction) === undefined;
}

/** Relative footprint (entrance bottom middle) of the map's player town. */
function townShape(map: GameMap): Array<[number, number]> {
  const town = map.objects.find((o) => o.kind === "town");
  if (town === undefined) {
    return [
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
    ];
  }
  return town.blocked.map(([x, y]) => [x - town.x, y - town.y]);
}

interface Grid {
  map: GameMap;
  /** Cells covered by an object (entrance or blocked). */
  occupied: Set<number>;
  /** Cells blocked by objects (not entrances). */
  blocked: Set<number>;
  /** Monster cells and their zones of control. */
  guarded: Set<number>;
}

function gridOf(map: GameMap, objects: readonly MapObject[]): Grid {
  const occupied = new Set<number>();
  const blocked = new Set<number>();
  const guarded = new Set<number>();
  for (const obj of objects) {
    occupied.add(obj.y * map.width + obj.x);
    for (const [x, y] of obj.blocked) {
      occupied.add(y * map.width + x);
      blocked.add(y * map.width + x);
    }
    if (obj.kind === "monster") {
      guarded.add(obj.y * map.width + obj.x);
      for (const [dx, dy] of DIRECTIONS_8) {
        if (inBounds(map, obj.x + dx, obj.y + dy)) {
          guarded.add((obj.y + dy) * map.width + obj.x + dx);
        }
      }
    }
  }
  return { map, occupied, blocked, guarded };
}

function open(grid: Grid, x: number, y: number): boolean {
  const { map } = grid;
  if (!inBounds(map, x, y)) return false;
  const i = y * map.width + x;
  const cell = map.cells[i];
  return cell !== undefined && isPassable(cell) && !grid.blocked.has(i);
}

/** Walkable cells reachable from (sx, sy), with `extra` cells closed. */
function reach(
  grid: Grid,
  sx: number,
  sy: number,
  extra: ReadonlySet<number> = new Set(),
): Uint8Array {
  const { map } = grid;
  const seen = new Uint8Array(map.width * map.height);
  if (!open(grid, sx, sy)) return seen;
  const queue = [sy * map.width + sx];
  seen[sy * map.width + sx] = 1;
  while (queue.length > 0) {
    const cur = queue.pop() as number;
    const cx = cur % map.width;
    const cy = (cur - cx) / map.width;
    for (const [dx, dy] of DIRECTIONS_8) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!open(grid, nx, ny)) continue;
      const ni = ny * map.width + nx;
      if (seen[ni] === 1 || extra.has(ni)) continue;
      // No corner cutting between two closed cells.
      if (dx !== 0 && dy !== 0) {
        const a = open(grid, nx, cy) && !extra.has(cy * map.width + nx);
        const b = open(grid, cx, ny) && !extra.has(ny * map.width + cx);
        if (!a && !b) continue;
      }
      seen[ni] = 1;
      queue.push(ni);
    }
  }
  return seen;
}

const count = (a: Uint8Array): number => a.reduce((n, v) => n + v, 0);

/**
 * A new town and hero start for `player`, as far as possible from
 * `anchors`, or null when the map has no room.
 */
function newSite(
  map: GameMap,
  objects: readonly MapObject[],
  anchors: ReadonlyArray<{ x: number; y: number }>,
  home: { x: number; y: number },
  player: number,
): MapObject[] | null {
  const grid = gridOf(map, objects);
  const shape = townShape(map);
  const base = reach(grid, home.x, home.y);
  const baseCount = count(base);
  const free = (x: number, y: number): boolean =>
    open(grid, x, y) && !grid.occupied.has(y * map.width + x);
  const candidates: Array<{ x: number; y: number; score: number }> = [];
  for (let y = 2; y < map.height - 2; y++) {
    for (let x = 2; x < map.width - 2; x++) {
      const entrance = y * map.width + x;
      const heroCell = (y + 1) * map.width + x;
      if (base[entrance] !== 1 || !free(x, y) || !free(x, y + 1)) continue;
      if (grid.guarded.has(entrance) || grid.guarded.has(heroCell)) continue;
      if (!shape.every(([dx, dy]) => free(x + dx, y + dy))) continue;
      let score = Number.POSITIVE_INFINITY;
      for (const a of anchors) {
        score = Math.min(score, (a.x - x) ** 2 + (a.y - y) ** 2);
      }
      candidates.push({ x, y, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  for (const c of candidates.slice(0, 40)) {
    const closed = new Set(
      shape.map(([dx, dy]) => (c.y + dy) * map.width + c.x + dx),
    );
    const after = reach(grid, home.x, home.y, closed);
    if (count(after) !== baseCount - closed.size) continue;
    const blocked = shape.map(
      ([dx, dy]) => [c.x + dx, c.y + dy] as [number, number],
    );
    const xs = [c.x, ...blocked.map((b) => b[0])];
    const ys = [c.y, ...blocked.map((b) => b[1])];
    return [
      {
        id: `town-start-${player}`,
        kind: "town",
        x: c.x,
        y: c.y,
        footprint: {
          w: Math.max(...xs) - Math.min(...xs) + 1,
          h: Math.max(...ys) - Math.min(...ys) + 1,
        },
        blocked,
        data: { faction: "lost-world", owner: player },
      },
      heroStartObject(player, c.x, c.y + 1),
    ];
  }
  return null;
}

function heroStartObject(player: number, x: number, y: number): MapObject {
  return {
    id: `hero-start-${player}`,
    kind: "hero-start",
    x,
    y,
    footprint: { w: 1, h: 1 },
    blocked: [],
    data: { player },
  };
}

/** A free open cell next to (x, y) for a hero start, south first. */
function heroCellNear(
  map: GameMap,
  objects: readonly MapObject[],
  x: number,
  y: number,
): { x: number; y: number } | null {
  const grid = gridOf(map, objects);
  const order: Array<[number, number]> = [
    [0, 1],
    [-1, 1],
    [1, 1],
    [-1, 0],
    [1, 0],
    [0, 2],
  ];
  for (const [dx, dy] of order) {
    const nx = x + dx;
    const ny = y + dy;
    const i = ny * map.width + nx;
    if (open(grid, nx, ny) && !grid.occupied.has(i) && !grid.guarded.has(i)) {
      return { x: nx, y: ny };
    }
  }
  return null;
}

/**
 * A copy of the map with starts for exactly `players` players (0 to
 * players - 1). Extra starts are removed (their towns turn neutral); missing
 * ones come from the Warlord's Hold, then from new town sites. Throws when
 * the map has no start for player 0 or no room for the rest.
 */
export function prepareStarts(map: GameMap, players: number): GameMap {
  let objects: MapObject[] = map.objects.map((o) => ({ ...o }));
  const starts = new Set(mapStarts(map).map((s) => s.player));
  if (!starts.has(0)) throw new Error("map has no hero start for player 0");
  // A player with a town but no hero start is present too.
  for (const o of map.objects) {
    const p = o.kind === "town" ? playerOf(o) : null;
    if (p !== null) starts.add(p);
  }
  objects = objects.flatMap((o) => {
    const p = playerOf(o);
    if (p === null || p < players) return [o];
    if (o.kind === "hero-start") return [];
    if (o.kind === "town") return [{ ...o, data: { ...o.data, owner: null } }];
    return [o];
  });
  const home = must0(
    objects.find((o) => o.kind === "hero-start" && playerOf(o) === 0),
  );
  for (let p = 1; p < players; p++) {
    if (starts.has(p)) continue;
    const hold = objects.find(isHoldObject);
    if (hold !== undefined) {
      const cell = heroCellNear(map, objects, hold.x, hold.y);
      if (cell !== null) {
        objects = objects.map((o) =>
          o === hold ? { ...o, data: { faction: "lost-world", owner: p } } : o,
        );
        objects.push(heroStartObject(p, cell.x, cell.y));
        continue;
      }
    }
    const anchors = objects
      .filter((o) => o.kind === "town" || o.kind === "hero-start")
      .map((o) => ({ x: o.x, y: o.y }));
    const site = newSite(map, objects, anchors, home, p);
    if (site === null) {
      throw new Error(`no room on the map for player ${p + 1}'s start`);
    }
    objects.push(...site);
  }
  return { ...map, objects };
}

function must0(obj: MapObject | undefined): { x: number; y: number } {
  if (obj === undefined) throw new Error("map has no hero start");
  return { x: obj.x, y: obj.y };
}
