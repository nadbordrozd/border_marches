/**
 * Named maps (bead bzc.18): a generated map plus a short, reviewed list of
 * hand edits, so a shipped map is compact data (seed, options, edits)
 * rather than a stored grid.
 *
 * {@link buildNamedMap} generates the map from the definition's seed and
 * options (every start active), then applies its edits in order. Every
 * edit that names a generated object also names where that object stands;
 * if a later generator change moved or replaced it, the build throws
 * instead of quietly editing the wrong thing (tests/core/map/named.test.ts
 * also pins key features of each map, so drift is caught early).
 *
 * The definitions live in src/data/named-maps.ts.
 */
import { getCreature, isCreatureId } from "../../data/creatures.ts";
import {
  NAMED_MAPS,
  type MapEdit,
  type NamedMapDef,
} from "../../data/named-maps.ts";
import { OBJECT_TYPES } from "../../data/objectTypes.ts";
import { decorateMap } from "./decorate.ts";
import {
  DEFAULT_GEN_CONFIG,
  corridorCells,
  generateMapWithInfo,
} from "./generate.ts";
import {
  cellAt,
  cellIndex,
  inBounds,
  isPassable,
  objectCells,
  validateMap,
} from "./types.ts";
import type { GameMap, MapObject } from "./types.ts";

export type { MapEdit, NamedMapDef } from "../../data/named-maps.ts";
export { NAMED_MAPS } from "../../data/named-maps.ts";

/** The named map definition with this id, or undefined. */
export function findNamedMap(id: string): NamedMapDef | undefined {
  return NAMED_MAPS.find((m) => m.id === id);
}

/**
 * The generated map of a definition before its edits: the generator's
 * defaults, one-way waystones and Drill Yards included (the named maps
 * were re-authored on the denser generator of bead bzc.50).
 */
export function generateNamedBase(def: NamedMapDef): GameMap {
  return generateNamedBaseWithInfo(def).map;
}

/**
 * The generator configuration of the named maps: the defaults without the
 * volcanic zones of bead bzc.83. The named maps were authored before volcanic
 * ground existed and their edits name generated objects by place; volcanic
 * zones draw from their own random stream, so turning them off leaves each
 * named map's base exactly as it was authored.
 */
const NAMED_CONFIG = {
  terrain: {
    volcanic: {
      ...DEFAULT_GEN_CONFIG.terrain.volcanic,
      chance: { S: 0, M: 0, L: 0 },
    },
    // Nor the winter zones of bead bzc.87, for the same reason.
    winter: {
      ...DEFAULT_GEN_CONFIG.terrain.winter,
      chance: { S: 0, M: 0, L: 0 },
    },
  },
};

/** The base and its corridors; decorations come after the edits. */
function generateNamedBaseWithInfo(def: NamedMapDef): {
  map: GameMap;
  corridors: number[];
} {
  const { map, info } = generateMapWithInfo(def.seed, {
    size: def.size,
    players: def.players,
    activePlayers: def.players,
    decorations: false,
    config: NAMED_CONFIG,
  });
  return { map, corridors: corridorCells(info) };
}

/**
 * A short hash of a map's ground and objects (FNV-1a, hex): terrain,
 * obstacle and road per cell, and every object's id, kind, cells and data.
 * Tests pin the fingerprint of each named map's generated base, so any
 * generator change that would move what the edits rely on is caught.
 */
export function mapFingerprint(map: GameMap): string {
  let h = 0x811c9dc5;
  const feed = (text: string): void => {
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  for (const c of map.cells) {
    feed(`${c.terrain[0] ?? ""}${c.obstacle[0] ?? ""}${c.road ? 1 : 0}`);
  }
  for (const o of map.objects) {
    feed(`|${o.id}:${o.kind}@${o.x},${o.y}:${JSON.stringify(o.blocked)}`);
    feed(JSON.stringify(o.data));
  }
  // Decorations (bead bzc.72): absent on a base, so its hash is unchanged.
  for (const d of map.decorations ?? [])
    feed(`|${d.id}@${d.x},${d.y}:${d.variant}`);
  return h.toString(16).padStart(8, "0");
}

/** Cells of a catalogue object whose entrance is (x, y). */
function footprintAt(
  w: number,
  h: number,
  x: number,
  y: number,
): { blocked: Array<[number, number]>; footprint: { w: number; h: number } } {
  const ex = Math.floor((w - 1) / 2);
  const ey = h - 1;
  const blocked: Array<[number, number]> = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (dx === ex && dy === ey) continue;
      blocked.push([x - ex + dx, y - ey + dy]);
    }
  }
  return { blocked, footprint: { w, h } };
}

function fightValue(creature: string, count: number): number {
  return isCreatureId(creature)
    ? Math.round(count * getCreature(creature).fightValue)
    : 0;
}

/**
 * Applies one edit in place. Throws with the edit's index and a reason when
 * the map does not look the way the edit expects (generator drift).
 */
function applyEdit(map: GameMap, edit: MapEdit, k: number): void {
  const fail = (why: string): never => {
    throw new Error(`named map edit ${k} (${edit.op}): ${why}`);
  };
  const occupied = (except?: string): Map<number, string> => {
    const out = new Map<number, string>();
    for (const o of map.objects) {
      if (o.id === except) continue;
      for (const [x, y] of objectCells(o)) {
        out.set(cellIndex(map, x, y), o.id);
      }
    }
    return out;
  };
  const free = (cells: ReadonlyArray<[number, number]>): void => {
    const taken = occupied();
    for (const [x, y] of cells) {
      const cell = cellAt(map, x, y);
      if (cell === undefined) fail(`(${x},${y}) is off the map`);
      else if (!isPassable(cell)) fail(`(${x},${y}) is not open ground`);
      const other = taken.get(cellIndex(map, x, y));
      if (other !== undefined) fail(`(${x},${y}) is taken by ${other}`);
    }
  };
  const ids = new Set(map.objects.map((o) => o.id));
  const named = (id: string, at: readonly [number, number]): MapObject => {
    const obj = map.objects.find((o) => o.id === id);
    if (obj === undefined) return fail(`no object ${id}`);
    if (obj.x !== at[0] || obj.y !== at[1]) {
      fail(`${id} is at (${obj.x},${obj.y}), expected (${at[0]},${at[1]})`);
    }
    return obj;
  };
  switch (edit.op) {
    case "add": {
      if (ids.has(edit.id)) fail(`id ${edit.id} is taken`);
      const def = OBJECT_TYPES[edit.type];
      const [x, y] = edit.at;
      const { blocked, footprint } = footprintAt(def.w, def.h, x, y);
      free([[x, y], ...blocked]);
      map.objects.push({
        id: edit.id,
        kind: def.kind,
        x,
        y,
        footprint,
        blocked,
        data: { type: edit.type, value: def.value, ...edit.data },
      });
      return;
    }
    case "guard": {
      if (ids.has(edit.id)) fail(`id ${edit.id} is taken`);
      if (!isCreatureId(edit.creature)) fail(`unknown ${edit.creature}`);
      for (const g of edit.guards) if (!ids.has(g)) fail(`no object ${g}`);
      const [x, y] = edit.at;
      free([[x, y]]);
      map.objects.push({
        id: edit.id,
        kind: "monster",
        x,
        y,
        footprint: { w: 1, h: 1 },
        blocked: [],
        data: {
          creature: edit.creature,
          count: edit.count,
          fv: fightValue(edit.creature, edit.count),
          value: edit.value,
          guards: [...edit.guards],
        },
      });
      return;
    }
    case "remove": {
      const obj = named(edit.id, edit.at);
      map.objects = map.objects.filter((o) => o !== obj);
      for (const o of map.objects) {
        const guards = o.data["guards"];
        if (Array.isArray(guards) && guards.includes(edit.id)) {
          o.data["guards"] = guards.filter((g) => g !== edit.id);
        }
      }
      return;
    }
    case "set": {
      const obj = named(edit.id, edit.at);
      obj.data = { ...obj.data, ...edit.data };
      if (obj.kind === "monster") {
        const creature = String(obj.data["creature"]);
        if (!isCreatureId(creature)) fail(`unknown ${creature}`);
        obj.data["fv"] = fightValue(creature, Number(obj.data["count"]));
      }
      return;
    }
    case "ground": {
      const taken = occupied();
      for (const [x, y] of edit.cells) {
        if (!inBounds(map, x, y)) fail(`(${x},${y}) is off the map`);
        const i = cellIndex(map, x, y);
        const cell = map.cells[i];
        if (cell === undefined || cell.terrain === "water") {
          fail(`(${x},${y}) is water`);
          return;
        }
        if (edit.obstacle !== "none" && taken.has(i)) {
          fail(`(${x},${y}) is taken by ${String(taken.get(i))}`);
        }
        map.cells[i] = {
          ...cell,
          obstacle: edit.obstacle,
          road: edit.obstacle === "none" ? cell.road : false,
        };
      }
      return;
    }
  }
}

/** Builds a named map: generate, then apply the edits. Throws on drift. */
export function buildNamedMap(defOrId: NamedMapDef | string): GameMap {
  const def = typeof defOrId === "string" ? findNamedMap(defOrId) : defOrId;
  if (def === undefined) throw new Error(`no named map ${String(defOrId)}`);
  const { map, corridors } = generateNamedBaseWithInfo(def);
  // Start towns carry their seat's recommended faction, so the map (and
  // its poster) draws each start in its faction's art; a game re-seats
  // them from the actual setup (newGame).
  for (const o of map.objects) {
    const seat = o.data["start"];
    const faction = typeof seat === "number" ? def.factions[seat] : undefined;
    if (o.kind === "town" && faction !== undefined) {
      o.data = { ...o.data, faction };
    }
  }
  def.edits.forEach((edit, k) => applyEdit(map, edit, k));
  // Decorations last, seeded from the map, round the edited objects too
  // (bead bzc.72).
  decorateMap(map, { corridors });
  const problems = validateMap(map);
  if (problems.length > 0) {
    throw new Error(`named map ${def.id}: ${problems.slice(0, 3).join("; ")}`);
  }
  return map;
}
