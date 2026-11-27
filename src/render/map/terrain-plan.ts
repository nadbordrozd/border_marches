/**
 * The terrain draw plan of the adventure map (its mountains the crowd of
 * peaks, bead xaj.30): the ground layout, the canopy of the woods, the
 * peaks of the ranges, the doodads and the crown bands.
 *
 * The plan is a function of the map alone (bead border_marches-bzc.106).
 * Objects shape the terrain through the cells they cover (a tree, a peak or
 * a doodad never stands on them, and the woods' and ranges' outlines keep
 * off them) and through the entrances a road runs into, and those are read
 * from the map's own objects as it was made ({@link terrainObjects}), never
 * from the objects still standing. So taking a pickup, beating a monster,
 * opening a gate or revealing fog never changes a tree, a peak or a doodad:
 * a cell an object leaves stays the clearing it was, and its neighbours keep
 * their sprites. Before this bead the plan followed the live objects
 * (bead xaj.31), and a pickup taken beside a range placed the peaks round it
 * again, often with other sprites.
 */
import type { GameMap, MapObject } from "../../core/map/types";
import { buildCanopyField, canopyBands, placeCanopySet } from "./canopy";
import type {
  CanopyBand,
  CanopyField,
  CanopyPlacement,
  CanopyTree,
} from "./canopy";
import { placeDoodadSet } from "./doodads";
import type { DoodadSet } from "./doodads";
import { buildGroundLayout } from "./ground";
import { groundReview } from "./ground-review";
import type { GroundLayout } from "./ground";
import { buildPeakField, placePeakSet } from "./peaks";
import type { PeakField, PeakPlacement } from "./peaks";
import {
  PEAK_SPRITES,
  TREE_SPECIES,
  bandEntry,
  doodadEntry,
  featuredCells,
  treeEntry,
} from "./scene";
import type { SceneEntry } from "./scene";
import { mergeSorted } from "./sorted";

/** A world rectangle, px: [x0, x1) x [y0, y1). */
export interface WorldRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface TerrainPlan {
  readonly map: GameMap;
  /** Row-major indices of the cells under the map's terrain objects. */
  readonly featured: ReadonlySet<number>;
  /** The ground layout as built (its own canopy field). */
  readonly base: GroundLayout;
  /** The layout the chunks paint: this plan's canopy field. */
  readonly layout: GroundLayout;
  readonly canopyField: CanopyField;
  readonly peakField: PeakField;
  readonly canopy: CanopyPlacement;
  readonly peaks: PeakPlacement;
  readonly doodads: DoodadSet;
  /** Crown bands of trees and peaks together (canopy.ts). */
  readonly bands: readonly CanopyBand[];
  /** TALL_BODY entries in draw order: trees, peaks and doodads. */
  readonly bodies: readonly SceneEntry[];
  /** The terrain's FOREGROUND entries (the crown bands) in draw order. */
  readonly foreground: readonly SceneEntry[];
}

/**
 * The objects that shape the terrain: the map's own objects as it was made
 * (hero starts too: a hero stands there on the first day, on clear ground),
 * but for buried things (never drawn, so never a clearing that gives them
 * away). The game never adds objects to its map, only takes them off the
 * screen, so this list stays the same through a whole game.
 */
export function terrainObjects(map: GameMap): MapObject[] {
  return map.objects.filter((o) => o.kind !== "buried");
}

/** Object entrances next to a road: the road runs into them. */
export function roadEnds(
  map: GameMap,
  objects: readonly MapObject[],
): [number, number][] {
  const out: [number, number][] = [];
  for (const obj of objects) {
    if (obj.kind !== "town" && obj.kind !== "mine") continue;
    const near = [
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
    ].some(([dx = 0, dy = 0]) => {
      const x = obj.x + dx;
      const y = obj.y + dy;
      return (
        x >= 0 &&
        y >= 0 &&
        x < map.width &&
        y < map.height &&
        map.cells[y * map.width + x]?.road === true
      );
    });
    if (near) out.push([obj.x, obj.y]);
  }
  return out;
}

/**
 * Draw order (scene.ts compareEntries) without the insertion tie-breaker:
 * a stable sort of entries listed in creation order gives the same order.
 */
const drawOrder = (a: SceneEntry, b: SceneEntry): number =>
  (a.pass === b.pass ? 0 : a.pass === "TALL_BODY" ? -1 : 1) ||
  a.row - b.row ||
  a.col - b.col ||
  a.layer - b.layer;

const byBase = (a: CanopyTree, b: CanopyTree): number =>
  a.baseY - b.baseY || a.baseX - b.baseX;

/**
 * Review only (bead bzc.144, ground-review.ts `?treeScale=`): every tree
 * placed as made, then drawn `scale` times larger round its foot (the
 * trunk base and the centre line kept). Scale 1 returns the placement.
 * Bead bzc.165 drew the trees themselves at 1.5x, so this stays only as a
 * debug switch (off by default) on top of that art.
 */
export function reviewTreeScale(
  placement: CanopyPlacement,
  scale: number,
): CanopyPlacement {
  if (scale === 1) return placement;
  const grown = new Map<CanopyTree, CanopyTree>();
  const grow = (tree: CanopyTree): CanopyTree => {
    let out = grown.get(tree);
    if (out === undefined) {
      const w = Math.round(tree.w * scale);
      const h = Math.round(tree.h * scale);
      out = {
        ...tree,
        x: Math.round(tree.x + tree.w / 2 - w / 2),
        y: tree.baseY - h,
        w,
        h,
      };
      grown.set(tree, out);
    }
    return out;
  };
  return {
    ...placement,
    trees: placement.trees.map(grow),
    byCell: placement.byCell.map((list) => list?.map(grow)),
  };
}

/** The terrain plan of `map`: the same for the whole of a game on it. */
export function planTerrain(map: GameMap): TerrainPlan {
  const objects = terrainObjects(map);
  const featured = featuredCells(map, objects);
  const canopyField = buildCanopyField(map, featured);
  const peakField = buildPeakField(map, featured);
  const base = buildGroundLayout(
    map,
    roadEnds(map, objects),
    featured,
    objects,
  );
  const layout = { ...base, canopy: canopyField };
  const canopy = reviewTreeScale(
    placeCanopySet(canopyField, TREE_SPECIES),
    groundReview().treeScale,
  );
  const peaks = placePeakSet(peakField, PEAK_SPRITES);
  const doodads = placeDoodadSet(map, layout, featured);
  // Peaks share the crown bands with the trees, in one base order (trees
  // first on a tie), so what rises over an open cell covers only a unit's
  // feet.
  const bands = canopyBands(mergeSorted(canopy.trees, peaks.peaks, byBase));
  const bodies = [
    ...canopy.trees.map(treeEntry),
    ...peaks.peaks.map(treeEntry),
    ...doodads.doodads.map(doodadEntry),
  ].sort(drawOrder);
  const foreground = bands.map(bandEntry).sort(drawOrder);
  return {
    map,
    featured,
    base,
    layout,
    canopyField,
    peakField,
    canopy,
    peaks,
    doodads,
    bands,
    bodies,
    foreground,
  };
}
