/**
 * The terrain draw plan of the adventure map (its mountains the crowd of
 * peaks, bead xaj.30), kept up to date when objects change
 * (bead border_marches-xaj.31).
 *
 * Objects shape the terrain only through the cells they cover (a tree, a
 * peak or a doodad never stands on them, and the woods' and ranges'
 * outlines keep off them) and through the entrances a road runs into. So
 * when a pickup is taken, a monster beaten or an object added, the plan
 * places again only what stands near the cells that changed: the canopy
 * cell by cell (canopy.ts updateCanopy), the peaks by retrying the feet near
 * the change and those whose neighbours changed (peaks.ts updatePeaks), the
 * doodads by grid point (doodads.ts updateDoodads). Each update equals a
 * full placement exactly (tests/render/terrain-plan.test.ts), keeps the
 * identity of everything unchanged, and says which world rectangles of the
 * cached ground chunks and which crown bands must be painted again.
 *
 * Only the ground layout's road ends depend on objects otherwise; a change
 * of those (a town or mine appearing beside a road) places everything again.
 */
import { CELL_PX } from "../../assets/manifest";
import type { GameMap, MapObject } from "../../core/map/types";
import {
  buildCanopyField,
  canopyBands,
  placeCanopySet,
  treeRow,
  updateCanopy,
} from "./canopy";
import type {
  CanopyBand,
  CanopyField,
  CanopyPlacement,
  CanopyTree,
} from "./canopy";
import { placeDoodadSet, updateDoodads } from "./doodads";
import type { DoodadPlacement, DoodadSet } from "./doodads";
import { buildGroundLayout } from "./ground";
import type { GroundLayout } from "./ground";
import { buildPeakField, placePeakSet, updatePeaks } from "./peaks";
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
import { mergeSorted, updateSorted } from "./sorted";

const CELL = CELL_PX;

/**
 * How far (cells) a changed cell reaches the painted ground round it: the
 * forest shade (canopy.ts canopyTint) and the peak underlay (peaks.ts
 * paintPeakUnder) read the cell under a point a little south of the pixel
 * and the bilinear field of the cells round it, so one cell each way.
 */
export const GROUND_REACH = 1;

/** A world rectangle, px: [x0, x1) x [y0, y1). */
export interface WorldRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface TerrainPlan {
  readonly map: GameMap;
  /** Row-major indices of the cells under objects. */
  readonly featured: ReadonlySet<number>;
  /** The road ends (object entrances beside a road), as a key. */
  readonly roadEnds: string;
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

export interface TerrainUpdate {
  readonly plan: TerrainPlan;
  /** World rectangles whose ground chunks changed; null: every chunk. */
  readonly dirty: readonly WorldRect[] | null;
  /** Crown bands to paint (new or changed); all of them when dirty is null. */
  readonly paint: readonly CanopyBand[];
  /** Keys of crown bands gone. */
  readonly drop: readonly string[];
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

// Entries are made once per placed tree, peak, doodad and band, so an
// unchanged one keeps its entry (and the chunks can tell what changed).
const treeEntries = new WeakMap<CanopyTree, SceneEntry>();
const doodadEntries = new WeakMap<DoodadPlacement, SceneEntry>();
const bandEntries = new WeakMap<CanopyBand, SceneEntry>();

function cached<K extends object>(
  cache: WeakMap<K, SceneEntry>,
  key: K,
  make: (key: K) => SceneEntry,
): SceneEntry {
  let found = cache.get(key);
  if (found === undefined) {
    found = make(key);
    cache.set(key, found);
  }
  return found;
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

/** A band paints the same as before: same rectangle, same trees. */
function sameBand(a: CanopyBand, b: CanopyBand): boolean {
  return (
    a.key === b.key &&
    a.x === b.x &&
    a.y === b.y &&
    a.w === b.w &&
    a.h === b.h &&
    a.trees.length === b.trees.length &&
    a.trees.every((t, i) => t === b.trees[i])
  );
}

/** The trees of a base-sorted list whose crowns fall in the given rows. */
function inRows(
  sorted: readonly CanopyTree[],
  rows: readonly number[],
): CanopyTree[] {
  const out: CanopyTree[] = [];
  for (const row of rows) {
    // treeRow is floor((baseY - 1) / CELL): rows are runs of the list.
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (treeRow(sorted[mid] as CanopyTree) < row) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < sorted.length; i += 1) {
      const t = sorted[i] as CanopyTree;
      if (treeRow(t) !== row) break;
      out.push(t);
    }
  }
  return out;
}

/**
 * The terrain plan of `map` with `objects`. With `prev` (the plan of the
 * same map with other objects) only what the changed cells reach is placed
 * again; the result is the same as without it.
 */
export function planTerrain(
  map: GameMap,
  objects: readonly MapObject[],
  prev: TerrainPlan | null = null,
): TerrainUpdate {
  const featured = featuredCells(map, objects);
  const ends = roadEnds(map, objects);
  const endsKey = ends.map(([x, y]) => `${x},${y}`).join(";");
  const again = prev !== null && prev.map === map && prev.roadEnds === endsKey;
  // Objects that changed but cover the same cells (a monster's count, a
  // town's level, an owner) change nothing here.
  if (
    again &&
    featured.size === prev.featured.size &&
    [...featured].every((i) => prev.featured.has(i))
  )
    return { plan: prev, dirty: [], paint: [], drop: [] };
  const canopyField = buildCanopyField(map, featured);
  const peakField = buildPeakField(map, featured);
  let base: GroundLayout;
  let layout: GroundLayout;
  if (again) {
    base = prev.base;
    layout = { ...prev.layout, canopy: canopyField };
  } else {
    base = buildGroundLayout(map, ends, featured);
    layout = { ...base, canopy: canopyField };
  }
  const canopy = again
    ? updateCanopy(prev.canopy, canopyField, TREE_SPECIES)
    : placeCanopySet(canopyField, TREE_SPECIES);
  const peaks = again
    ? updatePeaks(prev.peaks, peakField, PEAK_SPRITES)
    : placePeakSet(peakField, PEAK_SPRITES);
  const doodads = again
    ? updateDoodads(prev.doodads, map, layout, featured)
    : placeDoodadSet(map, layout, featured);
  const tree = (t: CanopyTree): SceneEntry => cached(treeEntries, t, treeEntry);
  const doodad = (d: DoodadPlacement): SceneEntry =>
    cached(doodadEntries, d, doodadEntry);
  const band = (b: CanopyBand): SceneEntry => cached(bandEntries, b, bandEntry);
  // What came and went, when every placement could follow on.
  const changes =
    again &&
    canopy.changes !== undefined &&
    peaks.changes !== undefined &&
    doodads.changes !== undefined
      ? {
          removed: [
            ...canopy.changes.removed.map(tree),
            ...peaks.changes.removed.map(tree),
            ...doodads.changes.removed.map(doodad),
          ],
          added: [
            ...canopy.changes.added.map(tree),
            ...peaks.changes.added.map(tree),
            ...doodads.changes.added.map(doodad),
          ],
          rows: [
            ...new Set(
              [
                ...canopy.changes.removed,
                ...canopy.changes.added,
                ...peaks.changes.removed,
                ...peaks.changes.added,
              ].map(treeRow),
            ),
          ].sort((a, b) => a - b),
        }
      : null;
  // Peaks share the crown bands with the trees, in one base order (trees
  // first on a tie), so what rises over an open cell covers only a unit's
  // feet. A row's bands hold only that row's trees: after a local change
  // only the rows of the trees and peaks that came or went are grouped again.
  let bands: CanopyBand[];
  if (changes !== null && again) {
    const rows = new Set(changes.rows);
    bands = [
      ...prev.bands.filter((b) => !rows.has(b.row)),
      ...canopyBands(
        mergeSorted(
          inRows(canopy.trees, changes.rows),
          inRows(peaks.peaks, changes.rows),
          byBase,
        ),
      ),
    ];
  } else bands = canopyBands(mergeSorted(canopy.trees, peaks.peaks, byBase));
  const paint: CanopyBand[] = [];
  const drop: string[] = [];
  const gone = new Set<CanopyBand>();
  if (again) {
    const before = new Map(prev.bands.map((b) => [b.key, b]));
    bands = bands.map((b) => {
      const was = before.get(b.key);
      if (was !== undefined && sameBand(was, b)) return was;
      if (was !== undefined) gone.add(was);
      paint.push(b);
      return b;
    });
    const now = new Set(bands.map((b) => b.key));
    for (const [key, b] of before)
      if (!now.has(key)) {
        drop.push(key);
        gone.add(b);
      }
  } else paint.push(...bands);
  // Draw order: after a local change the previous order with the changes
  // merged in (scene entries tie only on the same spot, rarely).
  const bodies =
    (changes !== null &&
      updateSorted(
        prev?.bodies ?? [],
        new Set(changes.removed),
        changes.added,
        drawOrder,
      )) ||
    [
      ...canopy.trees.map(tree),
      ...peaks.peaks.map(tree),
      ...doodads.doodads.map(doodad),
    ].sort(drawOrder);
  const foreground =
    (again &&
      updateSorted(
        prev.foreground,
        new Set([...gone].map(band)),
        paint.map(band),
        drawOrder,
      )) ||
    bands.map(band).sort(drawOrder);
  const plan: TerrainPlan = {
    map,
    featured,
    roadEnds: endsKey,
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
  if (!again) return { plan, dirty: null, paint, drop };
  // The chunks to paint again: the ground round every changed cell (the
  // canopy's shade, the peaks' underlay) and every body that came or went.
  const dirty: WorldRect[] = [];
  const changed: number[] = [];
  for (const i of featured) if (!prev.featured.has(i)) changed.push(i);
  for (const i of prev.featured) if (!featured.has(i)) changed.push(i);
  for (const i of changed) {
    const x = i % map.width;
    const y = Math.floor(i / map.width);
    dirty.push({
      x0: (x - GROUND_REACH) * CELL,
      y0: (y - GROUND_REACH) * CELL,
      x1: (x + 1 + GROUND_REACH) * CELL,
      y1: (y + 1 + GROUND_REACH) * CELL,
    });
  }
  if (changes !== null) dirty.push(...changes.removed, ...changes.added);
  else {
    const was = new Set(prev.bodies);
    const now = new Set(bodies);
    for (const e of prev.bodies) if (!now.has(e)) dirty.push(e);
    for (const e of bodies) if (!was.has(e)) dirty.push(e);
  }
  return { plan, dirty, paint, drop };
}
