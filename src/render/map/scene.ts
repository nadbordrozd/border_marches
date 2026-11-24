/**
 * The draw plan of the adventure map: what is drawn, in which pass and in
 * which order. Ported from the pass and sort logic of Pulp Wars
 * src/render/canvas/board-renderer-v7.ts (LESSONS_MAP_AND_FACTION_SPRITES.md
 * section 3.11):
 *
 * | Pass        | What                                                       |
 * | ----------- | ---------------------------------------------------------- |
 * | FOG         | (here: an overlay over everything, see fog.ts)             |
 * | GROUND      | grounds, spill, water shelf, coast, forest shade (ground.ts)|
 * | ROAD_CASING | (painted with the ground, every edge before any fill)      |
 * | ROAD        | (painted with the ground)                                  |
 * | TALL_BODY   | tree and rock bodies on their footprints, tall peaks whole |
 * | FOREGROUND  | bands above low rock and tree tops, objects, units, markers|
 *
 * Inside a pass entries sort by row, then column, then layer (terrain 1,
 * road 2, resource 3, settlement 4, unit 5, markers 6, chips 7), so a cell's
 * overflow is drawn at its own row's turn and covers the feet of the row
 * behind.
 */
import {
  CELL_PX,
  GROUND_TERRAINS,
  MOUNTAIN_LOW_UP_PX,
  OBJECT_ASSETS,
  RESOURCE_MINES,
  RESOURCE_PICKUPS,
  TOWN_3X2_ASSETS,
  TOWN_ASSETS,
  TREASURE_PICKUP,
  UNIT_ASSETS,
  massifPieces,
} from "../../assets/manifest";
import type {
  GroundTerrain,
  MassifPalette,
  Town3x2Asset,
  TownAsset,
  UnitAsset,
} from "../../assets/manifest";
import { townArt } from "../../assets/town-art";
import { artFor, placeArt } from "../../assets/object-art";
import type { GameMap, MapObject } from "../../core/map/types";
import { objectBounds, objectCells } from "../../core/map/types";
import {
  TREE_SPECIES_DRIFT,
  TREE_SPECIES_WEIGHTS,
  treesOf,
} from "../../assets/trees";
import { buildCanopyField, canopyBands, placeCanopy } from "./canopy";
import type {
  CanopyBand,
  CanopyTree,
  TreeSpecies,
  TreeSpeciesTable,
} from "./canopy";
import { placeDoodads } from "./doodads";
import type { GroundLayout } from "./ground";
import { peaksOf } from "../../assets/peaks";
import { buildPeakField, placePeaks } from "./peaks";
import type { PeakField, PeakSprite, PeakTable, PlacedPeak } from "./peaks";
import { CREATURES, isCreatureId } from "../../data/creatures";
import { hash4 } from "./hash";
import { packRanges, paletteOf } from "./massif";

const CELL = CELL_PX;

/** Object kinds drawn from the catalogue art (bead bzc.13 / bzc.16). */
const SITE_KINDS: ReadonlySet<string> = new Set([
  "dwelling",
  "site",
  "bank",
  "artifact",
  "gate",
  "teleport",
]);

/** The art variant of a placed object (bank size, colour, stat, school). */
export function artVariantOf(obj: MapObject): string | undefined {
  const d = obj.data;
  switch (d["type"]) {
    case "stat-shrine":
      return String(d["stat"] ?? "");
    case "school-temple":
      return String(d["school"] ?? "");
    case "school-shrine":
      return `tier-${String(d["tier"] ?? 1)}`;
    case "faction-outpost":
      return String(d["faction"] ?? "");
    case "keymasters-tent":
    case "border-gate":
    case "two-way-waystone":
      return String(d["colour"] ?? "");
    default:
      return typeof d["size"] === "string" ? d["size"] : undefined;
  }
}

export const PASSES = ["TALL_BODY", "FOREGROUND"] as const;
export type Pass = (typeof PASSES)[number];

export const LAYER = {
  TERRAIN: 1,
  ROAD: 2,
  RESOURCE: 3,
  SETTLEMENT: 4,
  UNIT: 5,
  MARKER: 6,
  CHIP: 7,
} as const;

/** One drawImage of a manifest image (or a code-drawn "code:" image). */
export interface SpriteOp {
  readonly key: string;
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
  /** Destination top-left in world (master) pixels; drawn 1:1 ... */
  readonly dx: number;
  readonly dy: number;
  /** ... unless a destination size is given (a scaled clump). */
  readonly dw?: number;
  readonly dh?: number;
}

/** A flat shadow ellipse, world pixels. */
export interface ShadowOp {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly alpha: number;
}

export interface SceneEntry {
  readonly pass: Pass;
  readonly row: number;
  readonly col: number;
  readonly layer: number;
  /** Insertion order: the last tie-breaker, so sorting is stable. */
  readonly seq: number;
  readonly shadows: readonly ShadowOp[];
  readonly sprites: readonly SpriteOp[];
  /** World bounding box (for culling and chunk building). */
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  /** Cells that make the entry visible under fog (objects and units). */
  readonly cells?: readonly (readonly [number, number])[];
  /** Object id, for hover lookups. */
  readonly objectId?: string;
}

const PASS_ORDER: Readonly<Record<Pass, number>> = {
  TALL_BODY: 0,
  FOREGROUND: 1,
};

/** Pass, then row, then column, then layer, then insertion order. */
export function compareEntries(a: SceneEntry, b: SceneEntry): number {
  return (
    PASS_ORDER[a.pass] - PASS_ORDER[b.pass] ||
    a.row - b.row ||
    a.col - b.col ||
    a.layer - b.layer ||
    a.seq - b.seq
  );
}

let sequence = 0;

function entry(
  pass: Pass,
  row: number,
  col: number,
  layer: number,
  sprites: SpriteOp[],
  shadows: ShadowOp[] = [],
  extra: Partial<Pick<SceneEntry, "cells" | "objectId">> = {},
): SceneEntry {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of sprites) {
    x0 = Math.min(x0, s.dx);
    y0 = Math.min(y0, s.dy);
    x1 = Math.max(x1, s.dx + (s.dw ?? s.sw));
    y1 = Math.max(y1, s.dy + (s.dh ?? s.sh));
  }
  for (const s of shadows) {
    x0 = Math.min(x0, s.cx - s.rx * 1.3);
    y0 = Math.min(y0, s.cy - s.ry * 1.3);
    x1 = Math.max(x1, s.cx + s.rx * 1.3);
    y1 = Math.max(y1, s.cy + s.ry * 1.3);
  }
  sequence += 1;
  return {
    pass,
    row,
    col,
    layer,
    seq: sequence,
    sprites,
    shadows,
    x0,
    y0,
    x1,
    y1,
    ...extra,
  };
}

// ---------------------------------------------------------------- trees

/** The canopy species of every ground, from the tree set (trees.ts). */
export const TREE_SPECIES: TreeSpeciesTable = Object.fromEntries(
  GROUND_TERRAINS.map((terrain) => [
    terrain,
    Object.entries(TREE_SPECIES_WEIGHTS[terrain])
      .map(([name, weight]): TreeSpecies => ({
        name,
        weight,
        ...(TREE_SPECIES_DRIFT[terrain]?.[name] !== undefined
          ? { drift: TREE_SPECIES_DRIFT[terrain][name] }
          : {}),
        sprites: treesOf(terrain, name).map((t) => ({
          key: t.key,
          w: t.w,
          h: t.h,
        })),
      }))
      .filter((species) => species.sprites.length > 0),
  ]),
) as Record<GroundTerrain, TreeSpecies[]>;

/** A map's woods: every tree and the crown bands (canopy.ts). */
export interface MapCanopy {
  readonly trees: readonly CanopyTree[];
  readonly bands: readonly CanopyBand[];
}

export function mapCanopy(
  map: GameMap,
  featured: ReadonlySet<number>,
): MapCanopy {
  const trees = placeCanopy(buildCanopyField(map, featured), TREE_SPECIES);
  return { trees, bands: canopyBands(trees) };
}

// ---------------------------------------------------------------- peaks

/** The peak sprites of every ground's mountains (assets/peaks.ts). */
export const PEAK_SPRITES: PeakTable = Object.fromEntries(
  GROUND_TERRAINS.map((terrain) => [
    terrain,
    peaksOf(terrain).map((p) => ({
      key: p.key,
      w: p.w,
      h: p.h,
      tier: p.tier,
    })),
  ]),
) as Record<GroundTerrain, PeakSprite[]>;

/** A map's mountain ranges: the field and every placed peak (peaks.ts). */
export interface MapPeaks {
  readonly field: PeakField;
  readonly peaks: readonly PlacedPeak[];
}

export function mapPeaks(
  map: GameMap,
  featured: ReadonlySet<number>,
): MapPeaks {
  const field = buildPeakField(map, featured);
  return { field, peaks: placePeaks(field, PEAK_SPRITES) };
}

/** Peak bodies, sorted by their base like the trees they stand among. */
export function peakEntries(peaks: readonly PlacedPeak[]): SceneEntry[] {
  return peaks.map((peak) =>
    entry(
      "TALL_BODY",
      (peak.baseY - 1) / CELL,
      peak.baseX / CELL,
      LAYER.TERRAIN,
      [
        {
          key: peak.key,
          sx: 0,
          sy: 0,
          sw: peak.w,
          sh: peak.h,
          dx: peak.x,
          dy: peak.y,
        },
      ],
    ),
  );
}

// --------------------------------------------------------------- terrain

/** Row-major indices of every cell an object covers. */
export function featuredCells(
  map: GameMap,
  objects: readonly MapObject[],
): Set<number> {
  const out = new Set<number>();
  for (const obj of objects)
    for (const [x, y] of objectCells(obj))
      if (x >= 0 && y >= 0 && x < map.width && y < map.height)
        out.add(y * map.width + x);
  return out;
}

/**
 * The terrain entries of a map: massif and forest bodies (TALL_BODY) and the
 * bands above low rock and tree tops (FOREGROUND).
 */
export function terrainEntries(
  map: GameMap,
  objects: readonly MapObject[],
  canopy0?: MapCanopy,
): SceneEntry[] {
  const featured = featuredCells(map, objects);
  const out: SceneEntry[] = [];
  out.push(...massifEntries(map, featured));
  const canopy = canopy0 ?? mapCanopy(map, featured);
  for (const tree of canopy.trees)
    // Sorted by the trunk base, so crowns overlap from north to south.
    out.push(
      entry(
        "TALL_BODY",
        (tree.baseY - 1) / CELL,
        tree.baseX / CELL,
        LAYER.TERRAIN,
        [
          {
            key: tree.key,
            sx: 0,
            sy: 0,
            sw: tree.w,
            sh: tree.h,
            dx: tree.x,
            dy: tree.y,
          },
        ],
      ),
    );
  // The crowns rising above a row's top edge, again, after the row behind
  // (its units and objects) and before the row itself.
  for (const band of canopy.bands)
    out.push(
      entry("FOREGROUND", band.row - 0.5, band.x / CELL, LAYER.TERRAIN, [
        {
          key: band.key,
          sx: 0,
          sy: 0,
          sw: band.w,
          sh: band.h,
          dx: band.x,
          dy: band.y,
        },
      ]),
    );
  return out;
}

/**
 * The decoration layer (doodads.ts): small non-blocking features on open
 * ground, drawn in the body pass after the pieces of their row.
 */
export function doodadEntries(
  map: GameMap,
  objects: readonly MapObject[],
  layout: GroundLayout,
): SceneEntry[] {
  const featured = featuredCells(map, objects);
  return placeDoodads(map, layout, featured).map((d) =>
    entry("TALL_BODY", d.row + 0.25, d.col, LAYER.TERRAIN, [
      {
        key: d.spec.key,
        sx: 0,
        sy: 0,
        sw: d.spec.w,
        sh: d.spec.h,
        dx: d.x,
        dy: d.y,
        dw: d.w,
        dh: d.h,
      },
    ]),
  );
}

/**
 * The mountain ranges (massif.ts): every piece's footprint and the paint it
 * raises over rock behind it in the body pass, sorted with its bottom row
 * (so a hero in front of a range is drawn over it); the paint it raises over
 * an open cell behind in the foreground at its top row, so it covers the
 * feet of a hero standing behind the range; and the back-fills on the joints
 * behind the row in front.
 */
export function massifEntries(
  map: GameMap,
  featured: ReadonlySet<number>,
): SceneEntry[] {
  const out: SceneEntry[] = [];
  const { width } = map;
  const rock = (x: number, y: number): boolean => {
    if (y < 0) return true;
    const i = y * width + x;
    return map.cells[i]?.obstacle === "mountain" && !featured.has(i);
  };
  const cover = packRanges(map, featured);
  for (const fill of cover.fills)
    if (fill.front !== true)
      out.push(
        entry("TALL_BODY", fill.row, fill.col, 0, [
          {
            key: fill.asset.key,
            sx: 0,
            sy: 0,
            sw: fill.asset.w,
            sh: fill.asset.h,
            dx: fill.dx,
            dy: fill.dy,
          },
        ]),
      );
  for (const { asset, x, y } of cover.pieces) {
    const body: SpriteOp[] = [
      {
        key: asset.key,
        sx: 0,
        sy: asset.up,
        sw: asset.w,
        sh: asset.rows * CELL,
        dx: x * CELL,
        dy: y * CELL,
      },
    ];
    for (let c = 0; c < asset.cols; c += 1) {
      // Columns whose paint stays inside the footprint draw no band.
      const band: SpriteOp = {
        key: asset.key,
        sx: c * CELL,
        sy: 0,
        sw: CELL,
        sh: asset.up,
        dx: (x + c) * CELL,
        dy: y * CELL - asset.up,
      };
      if (asset.paintUp <= 0) continue;
      if (rock(x + c, y - 1)) body.push(band);
      else out.push(entry("FOREGROUND", y, x + c, LAYER.TERRAIN, [band]));
    }
    out.push(
      entry(
        "TALL_BODY",
        y + asset.rows - 1,
        x + asset.cols - 1,
        LAYER.TERRAIN,
        body,
      ),
    );
  }
  // Side boulders after the pieces (same row, column and layer: later seq).
  for (const fill of cover.fills)
    if (fill.front === true)
      out.push(
        entry("TALL_BODY", fill.row, fill.col, LAYER.TERRAIN, [
          {
            key: fill.asset.key,
            sx: 0,
            sy: 0,
            sw: fill.asset.w,
            sh: fill.asset.h,
            dx: fill.dx,
            dy: fill.dy,
          },
        ]),
      );
  return out;
}

/** The rock palette of the ground at (x, y): its mountains' or its own. */
export function paletteNear(map: GameMap, x: number, y: number): MassifPalette {
  const votes = new Map<MassifPalette, number>();
  for (let dy = -1; dy <= 1; dy += 1)
    for (let dx = -1; dx <= 1; dx += 1) {
      const cell = map.cells[(y + dy) * map.width + x + dx];
      if (
        x + dx < 0 ||
        x + dx >= map.width ||
        cell === undefined ||
        cell.obstacle !== "mountain"
      )
        continue;
      const p = paletteOf(cell.terrain);
      votes.set(p, (votes.get(p) ?? 0) + 1);
    }
  let best = paletteOf(map.cells[y * map.width + x]?.terrain ?? "grass");
  let most = 0;
  for (const [p, n] of votes)
    if (n > most) {
      best = p;
      most = n;
    }
  return best;
}

// --------------------------------------------------------------- objects

const SHADOW_ALPHA = 0.24;

/** Unit shadow (after Pulp Wars unit-shadows-v7.ts): an ellipse on the feet. */
export function unitShadow(
  unit: UnitAsset,
  left: number,
  top: number,
): ShadowOp {
  const { feet } = unit;
  const base = feet.baseRight - feet.baseLeft;
  const bounds: readonly [number, number] =
    unit.sizeClass === "giant"
      ? [33, 38]
      : unit.sizeClass === "large"
        ? [24, 28]
        : [21.84, 24];
  const rx = Math.min(bounds[1], Math.max(bounds[0], base * 0.42));
  const footCentre = (feet.footLeft + feet.footRight) / 2;
  const centre = Math.max(
    footCentre - 6,
    Math.min(footCentre + 6, (feet.baseLeft + feet.baseRight) / 2),
  );
  const ry = rx * 0.34;
  return {
    cx: left + centre,
    cy: top + feet.contactY - ry * 0.7 + 1,
    rx,
    ry,
    alpha: SHADOW_ALPHA,
  };
}

/** The settlement shadow (settlement-shadow-v7.ts): contact plus cast. */
export function townShadows(
  town: TownAsset,
  left: number,
  top: number,
): ShadowOp[] {
  const g = town.ground;
  const half = (g.right - g.left) / 2;
  const cx = left + (g.left + g.right) / 2;
  const depth =
    0.3 + (0.58 - 0.3) * Math.min(1, Math.max(0, (g.fullness - 0.7) / 0.3));
  const ry = Math.max(6, half * depth * 0.6);
  const cy = top + Math.max(g.leftY, g.rightY, g.contactY - ry) + 1;
  const rx = half + 2.5;
  return [
    {
      cx: cx + rx * 0.2,
      cy: cy - rx * 0.1,
      rx: rx * 1.06,
      ry,
      alpha: SHADOW_ALPHA / 2,
    },
    { cx, cy, rx, ry, alpha: SHADOW_ALPHA },
  ];
}

export function townAsset(obj: MapObject): TownAsset {
  const faction = obj.data["faction"];
  const art =
    faction === "lost-world" || faction === "dinosaur" ? "dinosaur" : "goblin";
  const rawLevel = obj.data["level"];
  const level =
    rawLevel === 1 || rawLevel === 2 || rawLevel === 3 ? rawLevel : 3;
  const town = TOWN_ASSETS.find((t) => t.faction === art && t.level === level);
  if (town === undefined) throw new Error(`no town art for ${art} ${level}`);
  return town;
}

/** Factions whose towns always use their 3x2 art (bead bzc.15). */
const STAGED_TOWN_FACTIONS: ReadonlySet<unknown> = new Set([
  "humans",
  "undead",
  "goblins",
]);

/**
 * The 3x2 town sprite (bead xaj.14) of a town with a 3 x 2 footprint, else
 * null. A v0.2 faction town (humans, undead, goblins) always has one, its
 * camp or fort stage by the `fort` level the view sets (townArt, bead
 * bzc.15). Other towns use it at full growth (level 3, or no level given):
 * a smaller one (level 1 or 2, as the game sets it from the halls built)
 * keeps the imported camp art of its level, so the map still shows the town
 * grow.
 */
export function town3x2Asset(obj: MapObject): Town3x2Asset | null {
  const box = objectBounds(obj);
  if (box.w !== 3 || box.h !== 2) return null;
  const faction = obj.data["faction"];
  if (STAGED_TOWN_FACTIONS.has(faction)) {
    const fort = obj.data["fort"];
    return townArt(String(faction), typeof fort === "number" ? fort : 0);
  }
  const level = obj.data["level"];
  if (level === 1 || level === 2) return null;
  const art =
    faction === "lost-world" || faction === "dinosaur" ? "dinosaur" : "goblin";
  return (
    TOWN_3X2_ASSETS.find((t) => t.faction === art && t.stage === "fort") ?? null
  );
}

/** The unit sprite of a creature id ("raptor" -> dinosaur-raptor). */
export function creatureAsset(creature: unknown): UnitAsset {
  const id = typeof creature === "string" ? creature : "";
  // The creature's own sprite (src/data), else a unit named like it.
  const sprite = isCreatureId(id) ? CREATURES[id].sprite : id;
  return (
    UNIT_ASSETS.find((unit) => unit.key === sprite) ??
    UNIT_ASSETS.find((unit) => unit.key.endsWith(`-${id}`)) ??
    (UNIT_ASSETS.find((unit) => unit.key === "goblin-goblin") as UnitAsset)
  );
}

/**
 * The 40 x 40 pickup image of a resource (RESOURCE_PICKUPS), or of a
 * treasure chest (TREASURE_PICKUP).
 */
export function pickupKey(resource: unknown, chest = false): string {
  if (chest) return TREASURE_PICKUP;
  return (
    (RESOURCE_PICKUPS as Readonly<Record<string, string>>)[
      typeof resource === "string" ? resource : ""
    ] ?? TREASURE_PICKUP
  );
}

/** The mine piece of a palette, picked by the cell's hash. */
export function mineAsset(
  palette: MassifPalette,
  x: number,
  y: number,
): { key: string } | undefined {
  const list = massifPieces(palette, "mine");
  return list[hash4(x, y, 0x31, 0x6e) % Math.max(1, list.length)];
}

/** The mine image of a resource (RESOURCE_MINES). */
export function mineKey(resource: unknown): string {
  return (
    (RESOURCE_MINES as Readonly<Record<string, string>>)[
      typeof resource === "string" ? resource : ""
    ] ?? "mountain-mine-a"
  );
}

/** A unit sprite standing on cell (x, y): its anchor on the cell centre. */
export function unitEntry(
  unit: UnitAsset,
  x: number,
  y: number,
  extra: Partial<Pick<SceneEntry, "cells" | "objectId">> = {},
): SceneEntry {
  const left = x * CELL + CELL / 2 - unit.anchor.x;
  const top = y * CELL + CELL / 2 - unit.anchor.y;
  return entry(
    "FOREGROUND",
    y,
    x,
    LAYER.UNIT,
    [
      {
        key: unit.key,
        sx: 0,
        sy: 0,
        sw: unit.w,
        sh: unit.h,
        dx: left,
        dy: top,
      },
    ],
    [unitShadow(unit, left, top)],
    { cells: [[x, y]], ...extra },
  );
}

/** How far a mine building leans from its cell toward the entrance, px. */
export const MINE_LEAN_PX = 10;
/** How far above its cell's bottom edge a mine building's image ends, px. */
export const MINE_SEAT_PX = 2;

/** How far above the footprint's bottom edge a town's ground line sits. */
export const TOWN_SEAT_PX = 8;

/** The entries of the map's objects (towns, mines, pickups, monsters). */
export function objectEntries(
  objects: readonly MapObject[],
  map?: GameMap,
): SceneEntry[] {
  const out: SceneEntry[] = [];
  for (const obj of objects) {
    const box = objectBounds(obj);
    const cells = objectCells(obj);
    const row = box.y + box.h - 1;
    const col = obj.x;
    const centreX = (box.x + box.w / 2) * CELL;
    const bottom = (box.y + box.h) * CELL;
    const big = obj.kind === "town" ? town3x2Asset(obj) : null;
    if (big !== null) {
      // The 3x2 canvas on its footprint plus its 24 rows above; the contact
      // and cast shadows under the measured opaque box.
      const left = box.x * CELL;
      const top = box.y * CELL - big.up;
      const half = big.box.w / 2;
      const cx = left + big.box.x + half;
      const cy = top + big.contactY - 6;
      out.push(
        entry(
          "FOREGROUND",
          row,
          col,
          LAYER.SETTLEMENT,
          [
            {
              key: big.key,
              sx: 0,
              sy: 0,
              sw: big.w,
              sh: big.h,
              dx: left,
              dy: top,
            },
          ],
          [
            {
              cx: cx + half * 0.12,
              cy: cy - 2,
              rx: half * 1.04,
              ry: 16,
              alpha: SHADOW_ALPHA / 2,
            },
            { cx, cy, rx: half * 0.96, ry: 13, alpha: SHADOW_ALPHA },
          ],
          { cells, objectId: obj.id },
        ),
      );
    } else if (obj.kind === "town") {
      // Bottom-centred over the footprint, its measured ground line a few
      // pixels above the footprint's bottom edge.
      const town = townAsset(obj);
      const left = Math.round(
        centreX - (town.ground.left + town.ground.right) / 2,
      );
      const top = bottom - TOWN_SEAT_PX - town.ground.contactY;
      out.push(
        entry(
          "FOREGROUND",
          row,
          col,
          LAYER.SETTLEMENT,
          [
            {
              key: town.key,
              sx: 0,
              sy: 0,
              sw: town.w,
              sh: town.h,
              dx: left,
              dy: top,
            },
          ],
          townShadows(town, left, top),
          { cells, objectId: obj.id },
        ),
      );
    } else if (
      SITE_KINDS.has(obj.kind) ||
      obj.data["type"] === "haunted-mine"
    ) {
      // Catalogue objects (bead bzc.13) drawn with their type's art
      // (bead bzc.16); buried things are never drawn.
      const art = artFor(String(obj.data["type"] ?? ""), artVariantOf(obj));
      if (art === null) continue;
      const p = placeArt(art, box.x, box.y, box.w, box.h);
      const pickup = art.seat === "pickup";
      out.push(
        entry(
          "FOREGROUND",
          row,
          col,
          pickup ? LAYER.RESOURCE : LAYER.SETTLEMENT,
          [
            {
              key: art.asset.key,
              sx: 0,
              sy: 0,
              sw: art.asset.w,
              sh: art.asset.h,
              dx: p.x,
              dy: p.y,
            },
          ],
          [
            {
              cx: p.x + art.foot.x + 2,
              cy: p.y + art.foot.y - 3,
              rx: Math.min(art.asset.w * 0.42, box.w * CELL * 0.5),
              ry: pickup ? 5 : 9,
              alpha: SHADOW_ALPHA,
            },
          ],
          { cells, objectId: obj.id },
        ),
      );
    } else if (obj.kind === "mine") {
      const key = mineKey(obj.data["resource"]);
      const building = OBJECT_ASSETS.find((asset) => asset.key === key);
      if (building === undefined) {
        // The mined mountain on the blocked cell: the mine piece of the
        // rock palette round it (bead xaj.14), else the imported one.
        const [bx, by] = obj.blocked[0] ?? [obj.x, obj.y];
        const piece =
          map === undefined
            ? undefined
            : mineAsset(paletteNear(map, bx, by), bx, by);
        const w = CELL;
        const h = CELL + MOUNTAIN_LOW_UP_PX;
        const left =
          piece === undefined ? Math.round(centreX - w / 2) : bx * CELL;
        const top = piece === undefined ? bottom - h : (by + 1) * CELL - h;
        out.push(
          entry(
            "FOREGROUND",
            row,
            col,
            LAYER.SETTLEMENT,
            [
              {
                key: piece?.key ?? key,
                sx: 0,
                sy: 0,
                sw: w,
                sh: h,
                dx: left,
                dy: top,
              },
            ],
            [
              {
                cx: left + 44,
                cy: bottom - 10,
                rx: 38,
                ry: 10,
                alpha: SHADOW_ALPHA / 2,
              },
              {
                cx: left + 40,
                cy: bottom - 8,
                rx: 36,
                ry: 9,
                alpha: SHADOW_ALPHA,
              },
            ],
            { cells, objectId: obj.id },
          ),
        );
      } else {
        // A mine building on its blocked cell, leaning toward the entrance
        // (where the hero stands), its base a few pixels above the bottom.
        const [bx, by] = obj.blocked[0] ?? [obj.x, obj.y];
        const towardEntrance = Math.sign(obj.x - bx) * MINE_LEAN_PX;
        const left = Math.round(
          bx * CELL + CELL / 2 + towardEntrance - building.w / 2,
        );
        const top = (by + 1) * CELL - MINE_SEAT_PX - building.h;
        out.push(
          entry(
            "FOREGROUND",
            row,
            col,
            LAYER.SETTLEMENT,
            [
              {
                key,
                sx: 0,
                sy: 0,
                sw: building.w,
                sh: building.h,
                dx: left,
                dy: top,
              },
            ],
            [
              {
                cx: left + building.w / 2 + 2,
                cy: top + building.h - 9,
                rx: building.w * 0.44,
                ry: 8,
                alpha: SHADOW_ALPHA,
              },
            ],
            { cells, objectId: obj.id },
          ),
        );
      }
    } else if (obj.kind === "pickup") {
      const left = obj.x * CELL + 20;
      const top = obj.y * CELL + 20;
      out.push(
        entry(
          "FOREGROUND",
          obj.y,
          obj.x,
          LAYER.RESOURCE,
          [
            {
              key: pickupKey(obj.data["resource"], obj.data["chest"] === true),
              sx: 0,
              sy: 0,
              sw: 40,
              sh: 40,
              dx: left,
              dy: top,
            },
          ],
          [{ cx: left + 21, cy: top + 35, rx: 16, ry: 5, alpha: SHADOW_ALPHA }],
          { cells, objectId: obj.id },
        ),
      );
    } else if (obj.kind === "monster") {
      out.push(
        unitEntry(creatureAsset(obj.data["creature"]), obj.x, obj.y, {
          objectId: obj.id,
        }),
      );
    }
  }
  return out;
}
