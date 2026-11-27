/**
 * The seeded adventure-map generator.
 *
 * `generateMap(seed, options)` returns a {@link GameMap} that is a pure
 * function of the seed and options (same input, same map, byte for byte).
 *
 * Pipeline (each stage draws from its own random stream, see gen/state.ts):
 *
 * 1. zones    template graph of organic regions (warped Voronoi): two to
 *             four start zones, middle zones, neutral-town zones and the
 *             Hold's zone in the centre; terrains, a maze of connections
 *             (gen/zones.ts)
 * 2. towns    every start town, the neutral towns and the Warlord's Hold,
 *             deep in their zones
 * 3. water    coast and lakes (gen/water.ts)
 * 4. terrain  main terrain per zone with secondary patches; on some maps a
 *             wild zone turns volcanic, on some one turns to snow, on some
 *             a sand desert (gen/terrain.ts), on some a candy zone of
 *             frosting (gen/candy.ts), on some a swamp (gen/swamp.ts);
 *             each wild zone sets aside an
 *             open plaza for its big sites (gen/fields.ts, bead bzc.96)
 * 5. borders  mountain ranges and forest belts along zone borders, a frame
 *             along the map edge, spurs, and passes (gen/borders.ts)
 * 6. rooms    walls of forest and rock inside each zone with unguarded gaps:
 *             valleys, dead ends and pockets (gen/rooms.ts)
 * 7. clusters forests and mountain groups inside zones (fewer, larger, most
 *             leaning on a range), clean-up, pockets, and the 2x2 rule:
 *             every mountain cell lies in an all-mountain 2x2 block
 *             (gen/clusters.ts); then no range or ground edge runs straight
 *             for more than three cells (gen/wobble.ts); a zone's widest
 *             clearing gets a pond on some maps (gen/fields.ts)
 * 8. objects  everything from the shared object table (src/data/mapObjects.ts):
 *             guarded treasure clusters cut into nooks (gen/hoards.ts),
 *             start kits, pocket treasure (big pockets: treasure
 *             clearings), the rare big sites, zone fill, roads between
 *             towns, guards sized by the value they hold (gen/objects.ts)
 * 9. decorations  passable decorations and impassable props, clear of
 *             every way, object and corridor (decorate.ts)
 *
 * Water (bead bzc.155, docs/design/NAVAL.md 8 and 21): with a water mode
 * other than None, Inland Sea and Islands carve their sea after the zones
 * (gen/sea-water.ts) and the generator sails from then on; Coast draws its
 * coasts in the water stage; landings are set aside before the objects,
 * and after them the sea stage (gen/sea.ts) makes the sea zones, straits,
 * access and the sea fill. Water None runs none of it.
 *
 * Every tunable number lives in {@link DEFAULT_GEN_CONFIG} (gen/config.ts).
 */
import type { GameMap, MapCell } from "./types.ts";
import { DEFAULT_GEN_CONFIG } from "./gen/config.ts";
import { waterModeFor } from "./gen/config.ts";
import type {
  GenConfig,
  MapSize,
  PlayerCount,
  WaterMode,
} from "./gen/config.ts";
import { at } from "./gen/grid.ts";
import { decorateMap } from "./decorate.ts";
import { buildRooms } from "./gen/rooms.ts";
import { buildBorders, cutPasses } from "./gen/borders.ts";
import {
  fixDiagonals,
  fixLoneCells,
  growClusters,
  resolvePockets,
  squareMountains,
} from "./gen/clusters.ts";
import { placeCandy } from "./gen/candy.ts";
import { placeSwamp } from "./gen/swamp.ts";
import { placeObjects, placeTowns } from "./gen/objects.ts";
import { withLootWithout } from "./gen/contents.ts";
import { O, TERRAIN_OF, newState } from "./gen/state.ts";
import type { Connection, GapInfo, PassInfo, ZoneInfo } from "./gen/state.ts";
import {
  mergeSmallRegions,
  paintTerrain,
  placeDesert,
  placeVolcanic,
  placeWinter,
} from "./gen/terrain.ts";
import { wobbleEdges } from "./gen/wobble.ts";
import { fillFields, reservePlazas } from "./gen/fields.ts";
import type { FieldReport } from "./gen/fields.ts";
import { markDeep, placeWater, tidyWater } from "./gen/water.ts";
import { layoutZones } from "./gen/zones.ts";
import { withNavalPools } from "./gen/naval-pools.ts";
import { carveSea, refreshSeaPass } from "./gen/sea-water.ts";
import { placeSea, prepareShores, settleSeaMap } from "./gen/sea.ts";
import type { SeaReport } from "./gen/sea.ts";

export {
  DEFAULT_GEN_CONFIG,
  MAP_SIZES,
  WATER_MODES,
  waterModeFor,
  waterModesFor,
} from "./gen/config.ts";
export type {
  GenConfig,
  MapSize,
  PlayerCount,
  WaterMode,
} from "./gen/config.ts";

export interface GenerateOptions {
  /**
   * S = 36x36, M = 72x72 (default), L = 108x108, XL = 144x144; SM = 48x48
   * (bead bzc.147; see MapSize in gen/config.ts).
   */
  size?: MapSize;
  /** Player starts, 2 to 4 (default per size: S 2, SM 3, M, L and XL 4). */
  players?: PlayerCount;
  /**
   * Players with a town and a hero today (default 1, the single-player
   * game). The other starts are generated as open starts: neutral towns
   * marked with `data.start`, without a hero.
   */
  activePlayers?: number;
  /** Called as each stage finishes, with its name (for profiling). */
  onStage?: (stage: string) => void;
  /**
   * Place the decorations and props last (decorate.ts, bead bzc.72).
   * Default true; a named map turns it off and decorates after its edits.
   */
  decorations?: boolean;
  /**
   * Water (docs/design/NAVAL.md 8.1, bead bzc.155): "none" (the default)
   * is today's generator byte for byte, never naval; "coast", "inland"
   * and "islands" make a naval map with seas, sea zones, straits and the
   * sea fill. Inland Sea and Islands need M or larger (smaller sizes make
   * Coast).
   */
  water?: WaterMode;
  /**
   * Overrides of the default configuration, merged one level deep (each
   * given section replaces only the keys it names).
   */
  config?: ConfigOverrides;
}

export type ConfigOverrides = {
  [K in keyof GenConfig]?: Partial<GenConfig[K]>;
};

export interface GenerateInfo {
  size: MapSize;
  zones: ZoneInfo[];
  connections: Connection[];
  passes: PassInfo[];
  /** Gaps in the room walls inside zones (unguarded unless a pocket's). */
  gaps: GapInfo[];
  /** Placement requests that found no site (expected to be empty). */
  skipped: string[];
  /** Optional requests (fill, pocket prizes, rules) that found no site. */
  unplaced: number;
  /** Row-major zone id of every cell (bead bzc.88: tests of placement). */
  zoneOf: Int32Array;
  /** Guarded treasure clusters (bead bzc.96): guard and loot cells. */
  hoards: Array<{ guard: number; loot: number[] }>;
  /** Gap cells of the pockets that became treasure clearings. */
  clearings: number[];
  /** Ponds put in clearings (bead bzc.96). */
  fields: FieldReport;
  /** The water mode made and its seas (bead bzc.155; absent on None). */
  sea?: SeaReport;
}

/** Row-major cells of every pass and gap corridor (kept clear of props). */
export function corridorCells(info: {
  passes: readonly PassInfo[];
  gaps: readonly GapInfo[];
}): number[] {
  return [...info.passes, ...info.gaps].flatMap((p) => p.cells);
}

/** Merge overrides into the default configuration (one level deep). */
export function resolveConfig(overrides?: ConfigOverrides): GenConfig {
  const out = { ...DEFAULT_GEN_CONFIG } as Record<string, unknown>;
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      const base = out[k];
      out[k] =
        base !== null && typeof base === "object" && !Array.isArray(base)
          ? { ...(base as object), ...(v as object) }
          : v;
    }
  }
  return out as unknown as GenConfig;
}

/** Generate a map; see {@link generateMapWithInfo} for generator metadata. */
export function generateMap(
  seed: number,
  options: GenerateOptions = {},
): GameMap {
  return generateMapWithInfo(seed, options).map;
}

export function generateMapWithInfo(
  seed: number,
  options: GenerateOptions = {},
): { map: GameMap; info: GenerateInfo } {
  const cfg = resolveConfig(options.config);
  // The artifacts this map's loot leaves out (the named maps', bead
  // bzc.135), for every stage that rolls an artifact.
  // A naval map's loot, banks, shrines, scholars and tutors may hold the
  // sea artifacts, the naval spells and Seafaring (NAVAL 7.5, bead
  // bzc.154); Water None stays outside, so dry maps keep their draws.
  const naval =
    waterModeFor(options.size ?? "M", options.water ?? "none") !== "none";
  return withNavalPools(naval, () =>
    withLootWithout(cfg.objects.lootWithout, () =>
      generateResolved(seed, options, cfg),
    ),
  );
}

function generateResolved(
  seed: number,
  options: GenerateOptions,
  cfg: GenConfig,
): { map: GameMap; info: GenerateInfo } {
  const size = options.size ?? "M";
  const side = cfg.sizes[size];
  const players = options.players ?? cfg.players[size];
  if (![2, 3, 4].includes(players)) {
    throw new Error(`mapgen: players must be 2, 3 or 4, got ${players}`);
  }
  const active = Math.max(1, Math.min(players, options.activePlayers ?? 1));
  const st = newState(seed | 0, size, players, active, cfg, side, side);
  st.water = waterModeFor(size, options.water ?? "none");
  const lap = (stage: string): void => options.onStage?.(stage);

  layoutZones(st);
  // Inland Sea and Islands: the sea goes in before the towns (bead bzc.155).
  carveSea(st);
  placeTowns(st);
  placeVolcanic(st);
  placeWinter(st);
  placeDesert(st);
  placeCandy(st);
  placeSwamp(st);
  lap("zones+towns");
  placeWater(st);
  refreshSeaPass(st);
  paintTerrain(st);
  // Room set aside for the big sites of the wild zones (bead bzc.96).
  reservePlazas(st);
  lap("water+terrain");
  buildBorders(st);
  cutPasses(st);
  lap("borders");
  buildRooms(st);
  lap("rooms");
  growClusters(st);
  lap("clusters");
  for (let round = 0; round < 3; round++) {
    const filled = fixDiagonals(st);
    fixLoneCells(st);
    resolvePockets(st);
    if (filled === 0) break;
  }
  fixLoneCells(st);
  resolvePockets(st);
  tidyWater(st);
  // The smallest mountain is 2x2: grow or trim the rest, re-open any pocket
  // the growth closed, and end with a trim that cannot close one.
  for (let round = 0; round < 3; round++) {
    const squared = squareMountains(st, true);
    if (squared + fixDiagonals(st) === 0) break;
    resolvePockets(st);
  }
  lap("clean-up");
  // Ragged outlines: break every straight range or ground edge (xaj.21).
  wobbleEdges(st);
  resolvePockets(st);
  squareMountains(st, false);
  mergeSmallRegions(st);
  // A clearing gets a pond on some maps (bead bzc.96).
  const fields = fillFields(st);
  markDeep(st);
  refreshSeaPass(st);
  // A naval map's coasts keep their landing cells (bead bzc.155).
  if (st.water !== "none") prepareShores(st);
  lap("wobble");
  const report = placeObjects(st);
  lap("objects");
  // The seas of a naval map: sea zones, straits, landings and the sea fill.
  const sea = st.water === "none" ? undefined : placeSea(st);
  if (sea !== undefined) {
    markDeep(st);
    lap("sea");
  }

  const cells: MapCell[] = [];
  for (let i = 0; i < st.g.n; i++) {
    const terrain = TERRAIN_OF[at(st.terrain, i)] ?? "grass";
    const ob = at(st.obstacle, i);
    const cell: MapCell = {
      terrain,
      obstacle:
        terrain === "water"
          ? "none"
          : ob === O.mountain
            ? "mountain"
            : ob === O.forest
              ? "forest"
              : "none",
      road: at(st.road, i) === 1,
    };
    if (terrain === "water" && at(st.deep, i) === 1) cell.deep = true;
    cells.push(cell);
  }
  const map: GameMap = {
    width: side,
    height: side,
    seed,
    cells,
    objects: st.objects,
    zones: Array.from(st.zone),
  };
  if (sea !== undefined && sea.bodies > 0) map.naval = true;
  if (options.decorations !== false) {
    decorateMap(map, { corridors: corridorCells(st) });
    lap("decorations");
  }
  // Boats at the Islands starts' docks (computed on the finished map).
  if (sea !== undefined && map.naval === true) settleSeaMap(map, sea);
  return {
    map,
    info: {
      size,
      zones: st.zones,
      connections: st.connections,
      passes: st.passes,
      gaps: st.gaps,
      skipped: report.skipped,
      unplaced: report.unplaced,
      zoneOf: st.zone,
      hoards: report.hoards,
      clearings: report.clearings,
      fields,
      ...(sea !== undefined ? { sea } : {}),
    },
  };
}
