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
  type NamedLandscape,
  type NamedMapDef,
} from "../../data/named-maps.ts";
import { OBJECT_TYPES } from "../../data/objectTypes.ts";
import { decorateMap } from "./decorate.ts";
import { keepWaysRound } from "./passages.ts";
import { relayRoads, roadMayCross } from "./gen/objects.ts";
import { LEGACY_COMPOSITION } from "./gen/config.ts";
import {
  DEFAULT_GEN_CONFIG,
  corridorCells,
  generateMapWithInfo,
  resolveConfig,
  type ConfigOverrides,
  type GenConfig,
} from "./generate.ts";
import {
  DIRECTIONS_8,
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
 * named map's base exactly as it was authored. The same holds for the
 * desert zones of bead bzc.88 (and so for the desert's sites).
 */
const NAMED_CONFIG: {
  terrain: Pick<GenConfig["terrain"], NamedLandscape>;
  objects: Pick<
    GenConfig["objects"],
    "keepWaysOpen" | "density" | "reserveRare" | "waysRound" | "mystery"
  >;
  clusters: Partial<GenConfig["clusters"]>;
  hoards: Pick<GenConfig["hoards"], "rate">;
  clearings: Pick<GenConfig["clearings"], "enabled">;
  fields: Pick<GenConfig["fields"], "enabled" | "plazaRadius">;
} = {
  // Placed as authored (bead bzc.95): without the generator's off-road
  // rules and at the fill they were authored at (bead bzc.95 raised the
  // default to make up for the room those rules take). buildNamedMap
  // steps their sites off the roads instead.
  objects: {
    keepWaysOpen: false,
    density: { start: 26, middle: 20, town: 22, hold: 24 },
    reserveRare: false,
    // Bead bzc.110: buildNamedMap moves the buildings that stand in a way
    // aside after the edits (keepWaysRound) instead.
    waysRound: false,
    // Nor their artifacts in bags (their edits name them by id).
    mystery: { share: 0, treasureShare: 0 },
  },
  // Bead bzc.96 (map composition): the named maps keep the obstacle
  // clusters, fill and pockets they were authored on, with no treasure
  // clusters, clearings, ponds or plazas, so their edits find every
  // generated object where they expect it.
  clusters: LEGACY_COMPOSITION.clusters,
  hoards: LEGACY_COMPOSITION.hoards,
  clearings: LEGACY_COMPOSITION.clearings,
  fields: LEGACY_COMPOSITION.fields,
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
    desert: {
      ...DEFAULT_GEN_CONFIG.terrain.desert,
      chance: { S: 0, M: 0, L: 0 },
    },
    // Nor the candy zones of bead bzc.115.
    candy: {
      ...DEFAULT_GEN_CONFIG.terrain.candy,
      chance: { S: 0, M: 0, L: 0 },
    },
  },
};

/**
 * The generator configuration of one named map: {@link NAMED_CONFIG} plus
 * its own options (bead bzc.89). A map without options gets NAMED_CONFIG
 * itself, so the first named maps generate exactly as they were authored.
 *
 * A landscape asked for `n` zones gets chance 2^(n-1) on every size and at
 * most `n` zones: the generator halves the chance after each zone it
 * places and a chance of 1 or more always passes, so it places all `n`
 * unless it runs out of candidate zones (the map's tests check it did not).
 */
export function namedConfig(def: NamedMapDef): ConfigOverrides {
  const gen = def.gen;
  if (gen === undefined) return NAMED_CONFIG;
  const biome = (key: NamedLandscape): GenConfig["terrain"][NamedLandscape] => {
    const n = gen.landscapes?.[key] ?? 0;
    if (n <= 0) return NAMED_CONFIG.terrain[key];
    const chance = 2 ** (n - 1);
    return {
      ...DEFAULT_GEN_CONFIG.terrain[key],
      chance: { S: chance, M: chance, L: chance },
      maxZones: { S: n, M: n, L: n },
    };
  };
  const base = DEFAULT_GEN_CONFIG.objects;
  const towns = gen.neutralTowns;
  return {
    ...(towns !== undefined
      ? { neutralTowns: { S: towns, M: towns, L: towns } }
      : {}),
    clusters: NAMED_CONFIG.clusters,
    // Bead bzc.102: a map authored on the map composition gets its guarded
    // treasure clusters (the starts' own too), treasure clearings and
    // ponds; it keeps the obstacle masses it was drawn on and has no
    // plazas, so its passes and the ways between its starts stay as drawn.
    ...(gen.composition === true
      ? {
          hoards: {
            rate: DEFAULT_GEN_CONFIG.hoards.rate,
            awayFromStarts: NAMED_AWAY_FROM_STARTS,
          },
          clearings: { enabled: true },
          fields: { enabled: true, plazaRadius: 0 },
        }
      : {
          hoards: NAMED_CONFIG.hoards,
          clearings: NAMED_CONFIG.clearings,
          fields: NAMED_CONFIG.fields,
        }),
    terrain: {
      volcanic: biome("volcanic"),
      winter: biome("winter"),
      desert: biome("desert"),
      candy: biome("candy"),
    },
    objects: {
      ...NAMED_CONFIG.objects,
      density: { ...NAMED_CONFIG.objects.density, ...gen.density },
      pocketPrizes: gen.pocketPrizes ?? base.pocketPrizes,
      pocketsPerZone: gen.pocketsPerZone ?? base.pocketsPerZone,
    },
  };
}

/**
 * Days (before roads) a named map's treasure clusters keep from every start
 * but the starts' own (bead bzc.102): what a start reaches in its first
 * days stays as the map was balanced.
 */
const NAMED_AWAY_FROM_STARTS = 2;

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
    config: namedConfig(def),
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

/** How far (Chebyshev) a one-cell site steps off a road (bead bzc.95). */
const STEP_OFF = 5;

/**
 * Bead bzc.95: no road runs over a site. The named maps keep their roads
 * as authored (their balance is measured along them), so each one-cell
 * site that stands on a road (generated there before the rule, or put
 * there by an edit) steps off it to the nearest open cell beside the
 * road: still next to its guard if it has one, never into another
 * guard's zone of control, and never onto a waystone's exit. A site
 * entrance is open ground, so no way opens or closes. Bigger objects
 * (and any site with no such cell) are left to relayRoads.
 */
function stepOffRoads(map: GameMap): void {
  const w = map.width;
  const taken = new Set<number>();
  for (const o of map.objects) {
    for (const [x, y] of objectCells(o)) taken.add(cellIndex(map, x, y));
    const exit = o.data["exit"];
    if (Array.isArray(exit)) taken.add(cellIndex(map, exit[0], exit[1]));
  }
  const blocked = new Set<number>();
  for (const o of map.objects)
    for (const [x, y] of o.blocked) blocked.add(cellIndex(map, x, y));
  const guardOf = new Map<string, MapObject>();
  const zoc = new Set<number>();
  for (const m of map.objects) {
    if (m.kind !== "monster") continue;
    const held = m.data["guards"];
    if (Array.isArray(held)) for (const id of held) guardOf.set(String(id), m);
    for (const [dx, dy] of [[0, 0] as const, ...DIRECTIONS_8]) {
      if (inBounds(map, m.x + dx, m.y + dy))
        zoc.add(cellIndex(map, m.x + dx, m.y + dy));
    }
  }
  const passable = (x: number, y: number): boolean => {
    const c = cellAt(map, x, y);
    return c !== undefined && isPassable(c) && !blocked.has(y * w + x);
  };
  // Room for the roads to bend round the bigger sites that stay on them.
  const bend = new Set<number>();
  for (const o of map.objects) {
    if (roadMayCross(o) !== "never" || o.blocked.length === 0) continue;
    for (const [x, y] of objectCells(o)) {
      if (cellAt(map, x, y)?.road !== true) continue;
      for (const [dx, dy] of DIRECTIONS_8)
        if (inBounds(map, x + dx, y + dy))
          bend.add(cellIndex(map, x + dx, y + dy));
    }
  }
  const cheb = (a: MapObject, x: number, y: number): number =>
    Math.max(Math.abs(a.x - x), Math.abs(a.y - y));
  for (const o of map.objects) {
    if (roadMayCross(o) !== "never" || o.blocked.length > 0) continue;
    const from = cellIndex(map, o.x, o.y);
    if (map.cells[from]?.road !== true) continue;
    const guard = guardOf.get(o.id);
    let best: { x: number; y: number; s: number } | undefined;
    for (let dy = -STEP_OFF; dy <= STEP_OFF; dy++) {
      for (let dx = -STEP_OFF; dx <= STEP_OFF; dx++) {
        const x = o.x + dx;
        const y = o.y + dy;
        if (!inBounds(map, x, y) || !passable(x, y)) continue;
        const i = y * w + x;
        if (taken.has(i) || bend.has(i) || map.cells[i]?.road === true)
          continue;
        const near = guard !== undefined && cheb(guard, x, y) <= 1;
        if (zoc.has(i) && !near) continue;
        // A hero steps onto it from two cells at least.
        const ways = DIRECTIONS_8.filter(
          ([ex, ey]) =>
            passable(x + ex, y + ey) &&
            (ex === 0 ||
              ey === 0 ||
              passable(x + ex, y) ||
              passable(x, y + ey)),
        ).length;
        if (ways < 2) continue;
        const byRoad = DIRECTIONS_8.some(
          ([ex, ey]) => cellAt(map, x + ex, y + ey)?.road === true,
        );
        const s =
          Math.max(Math.abs(dx), Math.abs(dy)) * 10 +
          (byRoad ? 0 : 5) +
          (guard !== undefined && !near ? 40 : 0);
        if (best === undefined || s < best.s) best = { x, y, s };
      }
    }
    if (best === undefined) continue;
    taken.delete(from);
    taken.add(best.y * w + best.x);
    o.x = best.x;
    o.y = best.y;
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
  // Bead bzc.95: sites step off the roads, and the roads bend round the
  // few that cannot.
  stepOffRoads(map);
  // Bead bzc.110: and no building stands in a way.
  keepWaysRound(map);
  relayRoads(map, resolveConfig(namedConfig(def)), def.size);
  // Decorations last, seeded from the map, round the edited objects too
  // (bead bzc.72).
  decorateMap(map, { corridors });
  const problems = validateMap(map);
  if (problems.length > 0) {
    throw new Error(`named map ${def.id}: ${problems.slice(0, 3).join("; ")}`);
  }
  return map;
}
