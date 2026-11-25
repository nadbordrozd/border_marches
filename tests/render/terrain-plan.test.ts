/**
 * Incremental terrain (bead border_marches-xaj.31): after each object change
 * (a pickup taken, owner flags and monster counts changed, a new object, a
 * hero moved, a mine by a road gone, an object on a mountain) the updated
 * plan equals a full rebuild and the draw lists the map view built before
 * this bead; a local change places nothing in full, and the chunks it does
 * not repaint really are unchanged.
 */
import { describe, expect, it } from "vitest";
import { CELL_PX } from "../../src/assets/manifest.ts";
import { generateMap } from "../../src/core/map/generate.ts";
import type { GameMap, MapObject } from "../../src/core/map/types.ts";
import { objectCells } from "../../src/core/map/types.ts";
import { canopyBands, canopyTint } from "../../src/render/map/canopy.ts";
import type { CanopyBand, CanopyTree } from "../../src/render/map/canopy.ts";
import { buildGroundLayout } from "../../src/render/map/ground.ts";
import { CHUNK_CELLS } from "../../src/render/map/map-view.ts";
import { paintPeakUnder } from "../../src/render/map/peaks.ts";
import {
  compareEntries,
  doodadEntries,
  featuredCells,
  mapCanopy,
  mapPeaks,
  peakEntries,
  terrainEntries,
} from "../../src/render/map/scene.ts";
import type { SceneEntry } from "../../src/render/map/scene.ts";
import {
  GROUND_REACH,
  planTerrain,
  roadEnds,
} from "../../src/render/map/terrain-plan.ts";
import type {
  TerrainPlan,
  TerrainUpdate,
  WorldRect,
} from "../../src/render/map/terrain-plan.ts";

const CELL = CELL_PX;
const CHUNK = CHUNK_CELLS * CELL;

/**
 * The terrain as map-view.ts rebuilt it in full on every setObjects before
 * this bead (the peaks mode of rebuildTerrain), with the scene's own entry
 * builders and compareEntries.
 */
function rebuiltInFull(map: GameMap, objects: readonly MapObject[]) {
  const featured = featuredCells(map, objects);
  const woods = mapCanopy(map, featured);
  const range = mapPeaks(map, featured);
  const canopy = {
    trees: woods.trees,
    bands: canopyBands(
      [...woods.trees, ...range.peaks].sort(
        (a, b) => a.baseY - b.baseY || a.baseX - b.baseX,
      ),
    ),
  };
  const base = buildGroundLayout(
    map,
    roadEnds(map, objects),
    undefined,
    featured,
  );
  const layout = {
    ...base,
    nearMountain: new Uint8Array(base.mountain.length),
  };
  const terrain = [
    ...terrainEntries(map, objects, canopy).filter(
      (e) => !e.sprites.some((s) => s.key.startsWith("massif-")),
    ),
    ...peakEntries(range.peaks),
  ];
  const entries = [...terrain, ...doodadEntries(map, objects, layout)].sort(
    compareEntries,
  );
  return {
    bodies: entries.filter((e) => e.pass === "TALL_BODY"),
    foreground: entries.filter((e) => e.pass === "FOREGROUND"),
  };
}

/** What an entry draws, without its insertion number. */
const drawn = (e: SceneEntry): string =>
  `${e.pass} ${e.row} ${e.col} ${e.layer} ${JSON.stringify(e.sprites)} ${JSON.stringify(e.shadows)}`;

/** Compares two lists item by item, naming the first difference. */
function expectSameList<T>(
  actual: readonly T[],
  expected: readonly T[],
  show: (item: T) => string,
  what: string,
): void {
  const n = Math.max(actual.length, expected.length);
  for (let i = 0; i < n; i += 1) {
    const a = actual[i] === undefined ? "(none)" : show(actual[i] as T);
    const b = expected[i] === undefined ? "(none)" : show(expected[i] as T);
    if (a !== b)
      expect(`${what}[${i}] of ${actual.length}: ${a}`).toBe(
        `${what}[${i}] of ${expected.length}: ${b}`,
      );
  }
}

const tree = (t: CanopyTree): string => JSON.stringify(t);

/** The incremental plan equals a full plan and the old full rebuild. */
function expectSameAsFull(
  map: GameMap,
  objects: readonly MapObject[],
  update: TerrainUpdate,
): void {
  const inc = update.plan;
  const full = planTerrain(map, objects).plan;
  const old = rebuiltInFull(map, objects);
  expectSameList(inc.canopy.trees, full.canopy.trees, tree, "trees");
  expectSameList(inc.peaks.peaks, full.peaks.peaks, tree, "peaks");
  expectSameList(
    inc.doodads.doodads,
    full.doodads.doodads,
    (d) => JSON.stringify({ ...d, spec: d.spec.key }),
    "doodads",
  );
  // Bands come in any order (each is drawn by its own row).
  const byKey = (a: CanopyBand, b: CanopyBand): number =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  expectSameList(
    [...inc.bands].sort(byKey),
    [...full.bands].sort(byKey),
    (b) => JSON.stringify({ ...b, trees: b.trees.map(tree) }),
    "bands",
  );
  expectSameList(inc.bodies, full.bodies, drawn, "bodies");
  expectSameList(inc.bodies, old.bodies, drawn, "bodies (old rebuild)");
  expectSameList(inc.foreground, old.foreground, drawn, "foreground");
  for (const k of ["open", "featured", "forest", "near", "set"] as const)
    expect(inc.layout.canopy?.[k]).toEqual(full.layout.canopy?.[k]);
  expect(inc.layout.roads).toEqual(full.layout.roads);
}

const overlaps = (r: WorldRect, x0: number, y0: number): boolean =>
  r.x1 > x0 && r.x0 < x0 + CHUNK && r.y1 > y0 && r.y0 < y0 + CHUNK;

/**
 * A local change: nothing placed in full, every chunk the update leaves
 * cached holds the same bodies, and the peak underlay and forest shade
 * change only near the changed cells. Returns how many ground samples
 * changed.
 */
function expectLocal(
  map: GameMap,
  before: TerrainPlan,
  update: TerrainUpdate,
): number {
  const after = update.plan;
  const dirty = update.dirty;
  expect(dirty).not.toBeNull();
  if (dirty === null) return 0;
  // No full placement: the layout is kept, and nearly every candidate foot
  // and every cell's trees are the previous objects.
  expect(after.base).toBe(before.base);
  const feet = new Set(before.peaks.candidates);
  const kept = after.peaks.candidates.filter((c) => feet.has(c)).length;
  expect(kept / after.peaks.candidates.length).toBeGreaterThan(0.9);
  const cells = after.canopy.byCell.filter(
    (list, i) => list !== undefined && list === before.canopy.byCell[i],
  ).length;
  const wooded = after.canopy.byCell.filter((l) => l !== undefined).length;
  expect(cells / wooded).toBeGreaterThan(0.9);
  // Every chunk the update keeps holds the same bodies.
  const cols = Math.ceil(map.width / CHUNK_CELLS);
  const rows = Math.ceil(map.height / CHUNK_CELLS);
  for (let cy = 0; cy < rows; cy += 1)
    for (let cx = 0; cx < cols; cx += 1) {
      const x0 = cx * CHUNK;
      const y0 = cy * CHUNK;
      if (dirty.some((r) => overlaps(r, x0, y0))) continue;
      const inChunk = (plan: TerrainPlan): SceneEntry[] =>
        plan.bodies.filter(
          (e) =>
            e.x1 > x0 && e.x0 < x0 + CHUNK && e.y1 > y0 && e.y0 < y0 + CHUNK,
        );
      expect(inChunk(after)).toEqual(inChunk(before));
    }
  // The painted ground (peak underlay, forest shade) changes only within
  // GROUND_REACH cells of a changed cell: checked pixel by pixel round it.
  const changed = [...after.featured]
    .filter((i) => !before.featured.has(i))
    .concat([...before.featured].filter((i) => !after.featured.has(i)));
  expect(changed.length).toBeGreaterThan(0);
  const reach = (i: number) => {
    const x = i % map.width;
    const y = Math.floor(i / map.width);
    return {
      x,
      y,
      x0: (x - GROUND_REACH) * CELL,
      y0: (y - GROUND_REACH) * CELL,
      x1: (x + 1 + GROUND_REACH) * CELL,
      y1: (y + 1 + GROUND_REACH) * CELL,
    };
  };
  const ground = changed.map(reach);
  const inGround = (px: number, py: number): boolean =>
    ground.some((r) => px >= r.x0 && px < r.x1 && py >= r.y0 && py < r.y1);
  let differs = 0;
  for (const { x, y } of ground) {
    // A window five cells round the change, clipped to the map.
    const x0 = Math.max(0, (x - 5) * CELL);
    const y0 = Math.max(0, (y - 5) * CELL);
    const w = Math.min(map.width * CELL, (x + 6) * CELL) - x0;
    const h = Math.min(map.height * CELL, (y + 6) * CELL) - y0;
    const under = (plan: TerrainPlan): Uint8ClampedArray => {
      const data = new Uint8ClampedArray(w * h * 4);
      paintPeakUnder(plan.peakField, x0, y0, w, h, data);
      return data;
    };
    const a = under(before);
    const b = under(after);
    for (let py = 0; py < h; py += 2)
      for (let px = 0; px < w; px += 2) {
        const o = (py * w + px) * 4;
        const same =
          a[o] === b[o] &&
          a[o + 1] === b[o + 1] &&
          a[o + 2] === b[o + 2] &&
          a[o + 3] === b[o + 3];
        const shade =
          canopyTint(before.canopyField, x0 + px, y0 + py) ===
          canopyTint(after.canopyField, x0 + px, y0 + py);
        if (same && shade) continue;
        differs += 1;
        if (!inGround(x0 + px, y0 + py))
          expect(`ground at ${x0 + px},${y0 + py}`).toBe("unchanged");
      }
  }
  return differs;
}

const at = (map: GameMap, x: number, y: number) =>
  x >= 0 && y >= 0 && x < map.width && y < map.height
    ? map.cells[y * map.width + x]
    : undefined;

/** Mountain and forest cells among the eight round (x, y). */
function neighbours(map: GameMap, x: number, y: number) {
  let mountain = 0;
  let forest = 0;
  for (let dy = -1; dy <= 1; dy += 1)
    for (let dx = -1; dx <= 1; dx += 1) {
      const o = at(map, x + dx, y + dy)?.obstacle;
      if (o === "mountain") mountain += 1;
      if (o === "forest") forest += 1;
    }
  return { mountain, forest };
}

/** A free open cell beside a range (and a wood if there is one). */
function freeCellBesideRange(
  map: GameMap,
  objects: readonly MapObject[],
): [number, number] {
  const taken = featuredCells(map, objects);
  let best: [number, number] | null = null;
  let score = -1;
  for (let y = 1; y < map.height - 1; y += 1)
    for (let x = 1; x < map.width - 1; x += 1) {
      const cell = at(map, x, y);
      if (cell === undefined || cell.obstacle !== "none" || cell.road) continue;
      if (cell.terrain === "water" || taken.has(y * map.width + x)) continue;
      const n = neighbours(map, x, y);
      if (n.mountain === 0) continue;
      const s = n.mountain + (n.forest > 0 ? 10 : 0);
      if (s > score) {
        score = s;
        best = [x, y];
      }
    }
  if (best === null) throw new Error("no free cell beside a range");
  return best;
}

describe("incremental terrain plan", () => {
  it("equals a full rebuild after every kind of object change", () => {
    const map = generateMap(11, { size: "S" });
    let objects: MapObject[] = map.objects.filter((o) => o.kind !== "buried");
    let update = planTerrain(map, objects);
    expect(update.dirty).toBeNull();
    const step = (next: MapObject[]): TerrainUpdate => {
      const before = update.plan;
      objects = next;
      update = planTerrain(map, objects, before);
      expectSameAsFull(map, objects, update);
      return update;
    };

    // 1. A pickup taken beside a range and a wood.
    const pickup = objects
      .filter((o) => o.kind === "pickup")
      .map((o) => ({ o, n: neighbours(map, o.x, o.y) }))
      .sort(
        (a, b) =>
          Number(b.n.forest > 0) - Number(a.n.forest > 0) ||
          b.n.mountain - a.n.mountain,
      )[0]?.o;
    expect(pickup).toBeDefined();
    expect(neighbours(map, pickup!.x, pickup!.y).mountain).toBeGreaterThan(0);
    let before = update.plan;
    let ground = expectLocal(
      map,
      before,
      step(objects.filter((o) => o !== pickup)),
    );

    // 2. Owner flags and monster counts changed: the same cells, so the
    // very same plan contents and nothing to repaint.
    before = update.plan;
    const mine = objects.find((o) => o.kind === "mine");
    const monster = objects.find((o) => o.kind === "monster");
    step(
      objects.map((o) =>
        o === mine
          ? { ...o, data: { ...o.data, owner: 1 } }
          : o === monster
            ? { ...o, data: { ...o.data, count: 99 } }
            : o,
      ),
    );
    expect(update.dirty).toEqual([]);
    expect(update.paint).toEqual([]);
    expect(update.drop).toEqual([]);
    expect(update.plan.bodies).toEqual(before.bodies);
    expect(update.plan.bodies.every((e, i) => e === before.bodies[i])).toBe(
      true,
    );

    // 3. A new object beside a range.
    const [nx, ny] = freeCellBesideRange(map, objects);
    before = update.plan;
    ground += expectLocal(
      map,
      before,
      step([
        ...objects,
        {
          id: "test-gold",
          kind: "pickup",
          x: nx,
          y: ny,
          footprint: { w: 1, h: 1 },
          blocked: [],
          data: { resource: "gold", amount: 500 },
        },
      ]),
    );

    // 4. A hero moved (its start marker stands for it): off one cell, onto
    // another beside a range.
    const hero = objects.find((o) => o.kind === "hero-start");
    expect(hero).toBeDefined();
    const [hx, hy] = freeCellBesideRange(map, objects);
    before = update.plan;
    ground += expectLocal(
      map,
      before,
      step(objects.map((o) => (o === hero ? { ...o, x: hx, y: hy } : o))),
    );
    // The shade and underlay check saw the ground change somewhere.
    expect(ground).toBeGreaterThan(0);

    // 5. A mine by a road gone: its road end goes, so everything is placed
    // again (and still matches).
    const byRoad = objects.find(
      (o) => o.kind === "mine" && roadEnds(map, [o]).length > 0,
    );
    expect(byRoad).toBeDefined();
    step(objects.filter((o) => o !== byRoad));
    expect(update.dirty).toBeNull();

    // 6. An object on a Mountain cell: the rock itself changes, so the
    // peaks are placed again in full (the trees still incrementally).
    const rock = map.cells.findIndex(
      (c, i) =>
        c.obstacle === "mountain" &&
        neighbours(map, i % map.width, Math.floor(i / map.width)).mountain >= 6,
    );
    expect(rock).toBeGreaterThanOrEqual(0);
    before = update.plan;
    step([
      ...objects,
      {
        id: "test-on-rock",
        kind: "artifact",
        x: rock % map.width,
        y: Math.floor(rock / map.width),
        footprint: { w: 1, h: 1 },
        blocked: [],
        data: {},
      },
    ]);
    expect(update.dirty).not.toBeNull();
    expect(update.plan.base).toBe(before.base);
  }, 120_000);

  it("stays equal over a long run of takes and returns", () => {
    const map = generateMap(12, { size: "S" });
    const all = map.objects.filter((o) => o.kind !== "buried");
    // The objects beside ranges or woods, taken one by one, then put back.
    const near = all.filter((o) => {
      const n = neighbours(map, o.x, o.y);
      return n.mountain + n.forest > 0 && roadEnds(map, [o]).length === 0;
    });
    expect(near.length).toBeGreaterThan(10);
    let objects = all;
    let plan = planTerrain(map, objects).plan;
    const check = (next: MapObject[]): void => {
      objects = next;
      plan = planTerrain(map, objects, plan).plan;
      const full = planTerrain(map, objects).plan;
      expectSameList(plan.peaks.peaks, full.peaks.peaks, tree, "peaks");
      expectSameList(plan.canopy.trees, full.canopy.trees, tree, "trees");
      expectSameList(plan.bodies, full.bodies, drawn, "bodies");
      expectSameList(plan.foreground, full.foreground, drawn, "foreground");
    };
    for (const o of near) check(objects.filter((x) => x !== o));
    for (const o of [...near].reverse()) check([...objects, o]);
  }, 120_000);

  it("keeps the dirty chunks to the neighbourhood of the change", () => {
    const map = generateMap(11, { size: "S" });
    const objects = map.objects.filter((o) => o.kind !== "buried");
    const first = planTerrain(map, objects).plan;
    const pickup = objects.find((o) => o.kind === "pickup");
    expect(pickup).toBeDefined();
    const { dirty } = planTerrain(
      map,
      objects.filter((o) => o !== pickup),
      first,
    );
    expect(dirty).not.toBeNull();
    const [x, y] = objectCells(pickup!)[0]!;
    for (const r of dirty ?? []) {
      expect(r.x0).toBeGreaterThan((x - 4) * CELL);
      expect(r.x1).toBeLessThan((x + 5) * CELL);
      expect(r.y0).toBeGreaterThan((y - 5) * CELL);
      expect(r.y1).toBeLessThan((y + 5) * CELL);
    }
  });
});
