/**
 * Tiny hand-built maps for rules tests.
 *
 * Codes: g grass, j jungle, s steppe, b badlands, w wasteland, ~ water,
 * M mountain (on grass), F forest (on grass), # road (on grass),
 * = road on jungle.
 */
import type {
  GameMap,
  MapCell,
  MapObject,
  Terrain,
} from "../../../src/core/map/types.ts";
import { validateMap } from "../../../src/core/map/types.ts";
import { newGame } from "../../../src/core/game/index.ts";
import type { CommandResult, GameState } from "../../../src/core/game/index.ts";

const CODES: Record<string, MapCell> = {
  g: { terrain: "grass", obstacle: "none", road: false },
  j: { terrain: "jungle", obstacle: "none", road: false },
  s: { terrain: "steppe", obstacle: "none", road: false },
  b: { terrain: "badlands", obstacle: "none", road: false },
  w: { terrain: "wasteland", obstacle: "none", road: false },
  "~": { terrain: "water", obstacle: "none", road: false },
  M: { terrain: "grass", obstacle: "mountain", road: false },
  F: { terrain: "grass", obstacle: "forest", road: false },
  "#": { terrain: "grass", obstacle: "none", road: true },
  "=": { terrain: "jungle", obstacle: "none", road: true },
};

export function buildMap(rows: string[], objects: MapObject[]): GameMap {
  const height = rows.length;
  const width = rows[0]!.length;
  const cells: MapCell[] = [];
  for (const row of rows) {
    if (row.length !== width) throw new Error("ragged test map");
    for (const ch of row) {
      const cell = CODES[ch];
      if (cell === undefined) throw new Error(`bad code ${ch}`);
      cells.push({ ...cell });
    }
  }
  const map: GameMap = { width, height, seed: 7, cells, objects };
  const problems = validateMap(map);
  if (problems.length > 0) throw new Error(problems.join("; "));
  return map;
}

export function heroStart(x: number, y: number, player = 0): MapObject {
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

export function monster(
  id: string,
  x: number,
  y: number,
  creature = "goblin",
  count = 10,
): MapObject {
  return {
    id,
    kind: "monster",
    x,
    y,
    footprint: { w: 1, h: 1 },
    blocked: [],
    data: { creature, count },
  };
}

export function pickup(
  id: string,
  x: number,
  y: number,
  data: Record<string, unknown>,
): MapObject {
  return {
    id,
    kind: "pickup",
    x,
    y,
    footprint: { w: 1, h: 1 },
    blocked: [],
    data,
  };
}

export function mine(
  id: string,
  x: number,
  y: number,
  resource: string,
): MapObject {
  return {
    id,
    kind: "mine",
    x,
    y,
    footprint: { w: 1, h: 1 },
    blocked: [],
    data: { resource },
  };
}

/** A 1x1 town (entrance only) so tests stay small. */
export function town(
  id: string,
  x: number,
  y: number,
  owner: number | null,
): MapObject {
  return {
    id,
    kind: "town",
    x,
    y,
    footprint: { w: 1, h: 1 },
    blocked: [],
    data: { faction: owner === null ? "goblin" : "lost-world", owner },
  };
}

/** An open grass field of the given size. */
export function field(width: number, height: number, ch = "g"): string[] {
  return Array.from({ length: height }, () => ch.repeat(width));
}

/** Unwraps a successful command; fails the test with the message otherwise. */
export function ok(result: CommandResult): {
  state: GameState;
  events: Extract<CommandResult, { ok: true }>["events"];
} {
  if (!result.ok) throw new Error(`${result.error}: ${result.message}`);
  return { state: result.state, events: result.events };
}

export function errorOf(result: CommandResult): string {
  if (result.ok) throw new Error("expected the command to fail");
  return result.error;
}

export function gameOn(
  rows: string[],
  objects: MapObject[],
  hx = 0,
  hy = 0,
): GameState {
  return newGame(buildMap(rows, [heroStart(hx, hy), ...objects]));
}

export type { Terrain };
