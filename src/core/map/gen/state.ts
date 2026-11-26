/**
 * Mutable working state shared by the generator stages.
 */
import type { MapZoneKind } from "../../../data/mapObjects.ts";
import { createRng, deriveSeed } from "../../rng.ts";
import type { Rng } from "../../rng.ts";
import type { MapObject, Terrain } from "../types.ts";
import type { GenConfig, MapSize, PlayerCount } from "./config.ts";
import { Grid, at } from "./grid.ts";

/** Terrain codes in the state arrays. */
export const T = {
  grass: 0,
  jungle: 1,
  steppe: 2,
  badlands: 3,
  wasteland: 4,
  volcanic: 5,
  snow: 6,
  water: 7,
} as const satisfies Record<Terrain, number>;

export const TERRAIN_OF: readonly Terrain[] = [
  "grass",
  "jungle",
  "steppe",
  "badlands",
  "wasteland",
  "volcanic",
  "snow",
  "water",
];

/** Obstacle codes in the state arrays. */
export const O = { none: 0, mountain: 1, forest: 2 } as const;

/** What a zone is for: a player's home, the wilds, a neutral town, the Hold. */
export type ZoneRole = MapZoneKind;

export interface ZoneInfo {
  id: number;
  role: ZoneRole;
  /** The player who starts here (start zones only). */
  player?: number;
  /**
   * Steps through the connection graph from the nearest start zone (0 for
   * a start zone).
   */
  tier: number;
  /** Seed point (cell coordinates, fractional). */
  sx: number;
  sy: number;
  main: Terrain;
  secondary: Terrain;
  /** Number of cells. */
  area: number;
}

export interface Connection {
  a: number;
  b: number;
  /** Shared border length in cell edges. */
  border: number;
}

export interface PassInfo {
  a: number;
  b: number;
  /** The guard cell (middle of the corridor). */
  cell: number;
  /** Every carved corridor cell. */
  cells: number[];
  width: number;
}

/** A gap in a room wall: an unguarded passage inside one zone. */
export interface GapInfo extends PassInfo {
  zone: number;
}

export type TownRole = "player" | "open-start" | "neutral" | "hold";

export interface TownSite {
  /** Entrance cell. */
  cell: number;
  zone: number;
  role: TownRole;
  /** The player slot of a start (player and open-start towns). */
  player?: number;
}

export interface GenState {
  seed: number;
  size: MapSize;
  players: PlayerCount;
  /** Players with a hero today (the rest of the starts stay open). */
  activePlayers: number;
  cfg: GenConfig;
  g: Grid;
  zone: Int32Array;
  zones: ZoneInfo[];
  connections: Connection[];
  /** Room id per cell (-1 on obstacles and water), from the rooms stage. */
  room: Int32Array;
  terrain: Uint8Array;
  deep: Uint8Array;
  obstacle: Uint8Array;
  /** Obstacle cells that seal a zone border: never removed. */
  spine: Uint8Array;
  /** Cells that must stay open (pass corridors, objects and clearances). */
  keepOpen: Uint8Array;
  /** Cells that already carry an object (entrance or blocked). */
  occupied: Uint8Array;
  /** Cells blocked by an object footprint (impassable). */
  objBlocked: Uint8Array;
  road: Uint8Array;
  passes: PassInfo[];
  gaps: GapInfo[];
  objects: MapObject[];
  /** Every town, player starts first (in player order). */
  towns: TownSite[];
  /** Movement cost from the first player's town (filled before objects). */
  cost: Float64Array;
}

export function newState(
  seed: number,
  size: MapSize,
  players: PlayerCount,
  activePlayers: number,
  cfg: GenConfig,
  w: number,
  h: number,
): GenState {
  const g = new Grid(w, h);
  return {
    seed,
    size,
    players,
    activePlayers,
    cfg,
    g,
    zone: new Int32Array(g.n),
    zones: [],
    connections: [],
    room: new Int32Array(g.n).fill(-1),
    terrain: new Uint8Array(g.n),
    deep: new Uint8Array(g.n),
    obstacle: new Uint8Array(g.n),
    spine: new Uint8Array(g.n),
    keepOpen: new Uint8Array(g.n),
    occupied: new Uint8Array(g.n),
    objBlocked: new Uint8Array(g.n),
    road: new Uint8Array(g.n),
    passes: [],
    gaps: [],
    objects: [],
    towns: [],
    cost: new Float64Array(g.n),
  };
}

/** Entrance cells of every town placed so far. */
export function townCells(st: GenState): number[] {
  return st.towns.map((t) => t.cell);
}

/** The first player's town entrance (the reachability anchor), or -1. */
export function homeCell(st: GenState): number {
  return st.towns[0]?.cell ?? -1;
}

/** Cells of every pass and gap corridor (kept open by the clean-up). */
export function corridorMask(st: GenState): Uint8Array {
  const out = new Uint8Array(st.g.n);
  for (const p of st.passes) for (const c of p.cells) out[c] = 1;
  for (const p of st.gaps) for (const c of p.cells) out[c] = 1;
  return out;
}

/** An independent random stream per stage, so stages do not shift each other. */
export function stageRng(st: GenState, label: string): Rng {
  return createRng(deriveSeed(st.seed, "mapgen", label));
}

/** Salt for stateless noise of a stage. */
export function stageSalt(st: GenState, label: string): number {
  return deriveSeed(st.seed, "noise", label) | 0;
}

export function isWater(st: GenState, i: number): boolean {
  return at(st.terrain, i) === T.water;
}

/** Ground can be walked on (ignoring objects). */
export function isOpen(st: GenState, i: number): boolean {
  return st.terrain[i] !== T.water && st.obstacle[i] === O.none;
}

/** Walkable for the hero: open ground not covered by an object footprint. */
export function isWalkable(st: GenState, i: number): boolean {
  return (
    st.terrain[i] !== T.water &&
    st.obstacle[i] === O.none &&
    st.objBlocked[i] === 0
  );
}
