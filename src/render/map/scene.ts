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
  FOREST_SETS,
  FOREST_UP_PX,
  MOUNTAIN_LOW_UP_PX,
  MOUNTAIN_TALL_UP_PX,
  OBJECT_ASSETS,
  RESOURCE_MINES,
  RESOURCE_PICKUPS,
  TOWN_ASSETS,
  TREASURE_PICKUP,
  UNIT_ASSETS,
  mountainPieces,
} from "../../assets/manifest";
import type {
  ForestShape,
  GroundTerrain,
  TownAsset,
  UnitAsset,
} from "../../assets/manifest";
import type { GameMap, MapObject } from "../../core/map/types";
import { objectBounds, objectCells } from "../../core/map/types";
import { placeDoodads } from "./doodads";
import { forestClumps } from "./forest-fringe";
import type { GroundLayout } from "./ground";
import {
  FOREST_SHAPE_IDS,
  forestCells,
  forestShapeRects,
} from "./forest-packing";
import type { ForestVariantCounts } from "./forest-packing";
import { CREATURES, isCreatureId } from "../../data/creatures";
import { hash4 } from "./hash";
import { massifCells } from "./massif";
import type { MassifPlacement, MassifVariantCounts } from "./massif";

const CELL = CELL_PX;
const LETTERS = "abcdefgh";

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

// ------------------------------------------------------------- variants

export const MASSIF_COUNTS: MassifVariantCounts = {
  low1: mountainPieces("low-single").length,
  low2: mountainPieces("low-ridge").length,
  tall1: mountainPieces("tall-single").length,
  tall2: mountainPieces("tall-ridge").length,
};

export const FOREST_COUNTS: ForestVariantCounts = Object.fromEntries(
  FOREST_SHAPE_IDS.map((shape) => [
    shape,
    FOREST_SETS.grass.pieces.filter((piece) => piece.shape === shape).length,
  ]),
) as Record<ForestShape, number>;

export function massifPieceKey(piece: MassifPlacement): string {
  const kind = `${piece.tall ? "tall" : "low"}-${piece.columns === 2 ? "ridge" : "single"}`;
  return `mountain-${kind}-${LETTERS[piece.variant] ?? "a"}`;
}

export function forestPieceKey(
  set: GroundTerrain,
  shape: ForestShape,
  variant: number,
): string {
  return `forest-${set}-piece-${shape.toLowerCase()}-${LETTERS[variant] ?? "a"}`;
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
): SceneEntry[] {
  const featured = featuredCells(map, objects);
  const out: SceneEntry[] = [];
  const { width } = map;
  out.push(...massifBackfill(map, featured));
  for (const [index, cell] of massifCells(map, MASSIF_COUNTS, featured)) {
    const x = index % width;
    const y = Math.floor(index / width);
    for (const piece of cell.bodies) {
      const key = massifPieceKey(piece);
      const w = piece.columns * CELL;
      if (piece.tall)
        out.push(
          entry("TALL_BODY", y, x, LAYER.TERRAIN, [
            {
              key,
              sx: 0,
              sy: 0,
              sw: w,
              sh: CELL + MOUNTAIN_TALL_UP_PX,
              dx: piece.x * CELL,
              dy: piece.y * CELL - MOUNTAIN_TALL_UP_PX,
            },
          ]),
        );
      else
        out.push(
          entry("TALL_BODY", y, x, LAYER.TERRAIN, [
            {
              key,
              sx: 0,
              sy: MOUNTAIN_LOW_UP_PX,
              sw: w,
              sh: CELL,
              dx: piece.x * CELL,
              dy: piece.y * CELL,
            },
          ]),
        );
    }
    if (cell.band !== null) {
      const { piece, column } = cell.band;
      out.push(
        entry("FOREGROUND", y, x, LAYER.TERRAIN, [
          {
            key: massifPieceKey(piece),
            sx: column * CELL,
            sy: 0,
            sw: CELL,
            sh: MOUNTAIN_LOW_UP_PX,
            dx: x * CELL,
            dy: y * CELL - MOUNTAIN_LOW_UP_PX,
          },
        ]),
      );
    }
  }
  const seams = (set: GroundTerrain) => FOREST_SETS[set].seams;
  const woods = forestCells(
    map,
    FOREST_COUNTS,
    (set) => seams(set).length,
    featured,
  );
  for (const [index, cell] of woods) {
    const x = index % width;
    const y = Math.floor(index / width);
    const sprites: SpriteOp[] = [];
    const east =
      cell.eastSeam === null ? undefined : seams(cell.set)[cell.eastSeam];
    if (east !== undefined)
      // Astride the east edge, its top at the cell's top: never above it.
      sprites.push({
        key: east.key,
        sx: 0,
        sy: 0,
        sw: east.w,
        sh: east.h,
        dx: x * CELL + CELL - Math.round(east.w / 2),
        dy: y * CELL + Math.max(0, CELL - east.h),
      });
    const north =
      cell.northSeam === null ? undefined : seams(cell.set)[cell.northSeam];
    if (north !== undefined)
      // Rising 24 px into the forest cell above, over that piece's trunks.
      sprites.push({
        key: north.key,
        sx: 0,
        sy: 0,
        sw: north.w,
        sh: north.h,
        dx: x * CELL + Math.round((CELL - north.w) / 2),
        dy: y * CELL - FOREST_UP_PX,
      });
    for (const piece of cell.bodies) {
      const key = forestPieceKey(cell.set, piece.shape, piece.variant);
      for (const rect of forestShapeRects(piece.shape))
        sprites.push({
          key,
          sx: rect.x * CELL,
          sy: FOREST_UP_PX + rect.y * CELL,
          sw: rect.w * CELL,
          sh: rect.h * CELL,
          dx: (piece.x + rect.x) * CELL,
          dy: (piece.y + rect.y) * CELL,
        });
    }
    if (sprites.length > 0)
      out.push(entry("TALL_BODY", y, x, LAYER.TERRAIN, sprites));
    for (const band of cell.bands) {
      const piece = band.piece;
      out.push(
        entry("FOREGROUND", y, x, LAYER.TERRAIN, [
          {
            key: forestPieceKey(cell.set, piece.shape, piece.variant),
            sx: band.column * CELL,
            sy: band.row * CELL,
            sw: band.columns * CELL,
            sh: FOREST_UP_PX,
            dx: (piece.x + band.column) * CELL,
            dy: (piece.y + band.row) * CELL - FOREST_UP_PX,
          },
        ]),
      );
    }
  }
  for (const clump of forestClumps(map, woods, seams, featured)) {
    const seam = seams(clump.set)[clump.seam];
    if (seam === undefined) continue;
    out.push(
      entry("TALL_BODY", clump.row, clump.col, LAYER.TERRAIN, [
        {
          key: seam.key,
          sx: 0,
          sy: 0,
          sw: seam.w,
          sh: seam.h,
          dx: clump.x,
          dy: clump.y,
          dw: clump.w,
          dh: clump.h,
        },
      ]),
    );
  }
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
 * Back-fill inside a range (a Border Marches addition): where four plain
 * Mountain cells meet, one more low single mountain stands on the shared
 * corner, half a cell off the grid, drawn before the row in front so that
 * row's peaks cover its foot. It fills the ground showing between the
 * pieces of a block, so a wide range reads as one rock mass, and its
 * off-grid position breaks the cell lattice of the peaks. It only ever
 * covers Mountain cells.
 */
export function massifBackfill(
  map: GameMap,
  featured: ReadonlySet<number>,
): SceneEntry[] {
  const out: SceneEntry[] = [];
  const { width, height } = map;
  const plain = (x: number, y: number): boolean =>
    x >= 0 &&
    y >= 0 &&
    x < width &&
    y < height &&
    map.cells[y * width + x]?.obstacle === "mountain" &&
    !featured.has(y * width + x);
  for (let y = 0; y + 1 < height; y += 1)
    for (let x = 0; x + 1 < width; x += 1) {
      if (
        !plain(x, y) ||
        !plain(x + 1, y) ||
        !plain(x, y + 1) ||
        !plain(x + 1, y + 1)
      )
        continue;
      const variant = hash4(x, y, 0x6b, 2) % Math.max(1, MASSIF_COUNTS.low1);
      const key = massifPieceKey({ x, y, columns: 1, tall: false, variant });
      const h = CELL + MOUNTAIN_LOW_UP_PX;
      out.push(
        entry("TALL_BODY", y + 1, x, 0, [
          {
            key,
            sx: 0,
            sy: 0,
            sw: CELL,
            sh: h,
            dx: x * CELL + CELL / 2,
            dy: (y + 1) * CELL + CELL / 2 - h + 6,
          },
        ]),
      );
    }
  return out;
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
export function objectEntries(objects: readonly MapObject[]): SceneEntry[] {
  const out: SceneEntry[] = [];
  for (const obj of objects) {
    const box = objectBounds(obj);
    const cells = objectCells(obj);
    const row = box.y + box.h - 1;
    const col = obj.x;
    const centreX = (box.x + box.w / 2) * CELL;
    const bottom = (box.y + box.h) * CELL;
    if (obj.kind === "town") {
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
    } else if (obj.kind === "mine") {
      const key = mineKey(obj.data["resource"]);
      const building = OBJECT_ASSETS.find((asset) => asset.key === key);
      if (building === undefined) {
        // The mined mountain, bottom-centred over the footprint.
        const w = CELL;
        const h = CELL + MOUNTAIN_LOW_UP_PX;
        const left = Math.round(centreX - w / 2);
        const top = bottom - h;
        out.push(
          entry(
            "FOREGROUND",
            row,
            col,
            LAYER.SETTLEMENT,
            [{ key, sx: 0, sy: 0, sw: w, sh: h, dx: left, dy: top }],
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
