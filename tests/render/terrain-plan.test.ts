/**
 * The terrain plan (terrain-plan.ts): made from the map alone (bead
 * border_marches-bzc.106; the stability under object changes is
 * tests/render/terrain-stability.test.ts), it draws what the map view built
 * in full before bead xaj.31, with the objects a fresh game shows and its
 * hero starts.
 */
import { describe, expect, it } from "vitest";
import { newGame } from "../../src/core/game/newGame.ts";
import { generateMap } from "../../src/core/map/generate.ts";
import type { GameMap, MapObject } from "../../src/core/map/types.ts";
import { canopyBands } from "../../src/render/map/canopy.ts";
import { GROUND_RANK, buildGroundLayout } from "../../src/render/map/ground.ts";
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
  planTerrain,
  roadEnds,
  terrainObjects,
} from "../../src/render/map/terrain-plan.ts";
import { displayObjects } from "../../src/ui/objects.ts";

/**
 * The terrain as map-view.ts rebuilt it in full on every setObjects before
 * bead xaj.31 (rebuildTerrain), with the scene's own entry builders and
 * compareEntries.
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
  const layout = buildGroundLayout(map, roadEnds(map, objects), featured);
  const terrain = [
    ...terrainEntries(map, objects, canopy),
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
    if (actual[i] === expected[i] && i < actual.length) continue;
    const a = actual[i] === undefined ? "(none)" : show(actual[i] as T);
    const b = expected[i] === undefined ? "(none)" : show(expected[i] as T);
    if (a !== b)
      expect(`${what}[${i}] of ${actual.length}: ${a}`).toBe(
        `${what}[${i}] of ${expected.length}: ${b}`,
      );
  }
}

describe("terrain plan from the map alone (bead bzc.106)", () => {
  it("draws what the map view built in full, with a fresh game's objects and its hero starts", () => {
    for (const seed of [11, 12]) {
      const state = newGame(generateMap(seed, { size: "S" }));
      const plan = planTerrain(state.map);
      const starts = state.map.objects.filter((o) => o.kind === "hero-start");
      expect(starts.length).toBeGreaterThan(0);
      const old = rebuiltInFull(state.map, [
        ...displayObjects(state),
        ...starts,
      ]);
      expectSameList(plan.bodies, old.bodies, drawn, `seed ${seed} bodies`);
      expectSameList(
        plan.foreground,
        old.foreground,
        drawn,
        `seed ${seed} foreground`,
      );
    }
  });

  it("keeps buried things out of the terrain and hero starts clear", () => {
    const map = generateMap(11, { size: "S" });
    const kinds = new Set(terrainObjects(map).map((o) => o.kind));
    expect(map.objects.some((o) => o.kind === "buried")).toBe(true);
    expect(kinds.has("buried")).toBe(false);
    expect(kinds.has("hero-start")).toBe(true);
    const plan = planTerrain(map);
    expect(plan.featured).toEqual(featuredCells(map, terrainObjects(map)));
  });
});

describe("volcanic ground in the terrain plan (bead bzc.83)", () => {
  // Seed 9 (S) rolls a volcanic zone.
  const map = generateMap(9, { size: "S" });
  const volcanic = map.cells
    .map((c, i) => (c.terrain === "volcanic" ? i : -1))
    .filter((i) => i >= 0);

  it("ranks volcanic ground darkest, so its cracked rock spills over every other ground", () => {
    expect(volcanic.length).toBeGreaterThan(0);
    const layout = planTerrain(map).layout;
    const rank = GROUND_RANK.indexOf("volcanic");
    // Above every older ground; the desert sand (bead bzc.88) ranks after
    // it but never meets it (a desert zone never borders a volcanic one).
    expect(rank).toBe(GROUND_RANK.indexOf("sand") - 1);
    for (const i of volcanic) expect(layout.kind[i]).toBe(rank);
    // Where volcanic ground meets another, the border cells list both, the
    // volcanic last (it runs out over the other).
    const border = volcanic.find((i) => (layout.ranks[i]?.length ?? 0) > 1);
    expect(border).toBeDefined();
    expect(layout.ranks[border!]?.at(-1)).toBe(rank);
  });

  it("grows the wasteland's trees and the volcanic peaks on volcanic ground", () => {
    const plan = planTerrain(map);
    // GROUNDS index of the wasteland in canopy.ts; since bead bzc.140 the
    // volcanic ranges are a peak family of their own (index 9 in peaks.ts),
    // with their own massifs and the wasteland's smaller tiers.
    const wasteland = 4;
    const volcanicPeaks = 9;
    let woods = 0;
    let rock = 0;
    for (const i of volcanic) {
      const cell = map.cells[i]!;
      if (cell.obstacle === "forest") {
        woods += 1;
        expect(plan.canopyField.set[i]).toBe(wasteland);
      }
      if (cell.obstacle === "mountain" && plan.peakField.rock[i] === 1) {
        rock += 1;
        expect(plan.peakField.family[i]).toBe(volcanicPeaks);
      }
    }
    expect(woods + rock).toBeGreaterThan(0);
  });
});

describe("snow ground in the terrain plan (bead bzc.87)", () => {
  // The first small map that rolls a winter zone.
  const map = [1, 2, 3, 4, 5, 6, 7, 8]
    .map((seed) => generateMap(seed, { size: "S" }))
    .find((m) => m.cells.some((c) => c.terrain === "snow"))!;
  const snow = map.cells
    .map((c, i) => (c.terrain === "snow" ? i : -1))
    .filter((i) => i >= 0);

  it("drifts out over every ground but the volcanic", () => {
    expect(snow.length).toBeGreaterThan(0);
    const layout = planTerrain(map).layout;
    const rank = GROUND_RANK.indexOf("snow");
    expect(rank).toBe(GROUND_RANK.indexOf("volcanic") - 1);
    for (const i of snow) expect(layout.kind[i]).toBe(rank);
    const border = snow.find((i) => (layout.ranks[i]?.length ?? 0) > 1);
    expect(border).toBeDefined();
    expect(layout.ranks[border!]?.at(-1)).toBe(rank);
  });

  it("grows the snowy trees and peaks of its own family", () => {
    const plan = planTerrain(map);
    // GROUNDS index of the snow in canopy.ts and peaks.ts.
    const family = 5;
    let woods = 0;
    let rock = 0;
    for (const i of snow) {
      const cell = map.cells[i]!;
      if (cell.obstacle === "forest") {
        woods += 1;
        expect(plan.canopyField.set[i]).toBe(family);
      }
      if (cell.obstacle === "mountain" && plan.peakField.rock[i] === 1) {
        rock += 1;
        expect(plan.peakField.family[i]).toBe(family);
      }
    }
    expect(woods + rock).toBeGreaterThan(0);
  });
});

describe("desert sand in the terrain plan (bead bzc.88)", () => {
  // The first medium map that rolls a desert zone.
  const map = [12, 3, 4, 5, 7, 8, 1, 2]
    .map((seed) => generateMap(seed, { size: "SM", players: 2 }))
    .find((m) => m.cells.some((c) => c.terrain === "sand"))!;
  const sand = map.cells
    .map((c, i) => (c.terrain === "sand" ? i : -1))
    .filter((i) => i >= 0);

  it("ranks the sand after the older grounds, so they keep their ranks", () => {
    expect(sand.length).toBeGreaterThan(0);
    const layout = planTerrain(map).layout;
    const rank = GROUND_RANK.indexOf("sand");
    // Only the Candy Kingdom's frosting (bead bzc.115) ranks after it.
    expect(rank).toBe(GROUND_RANK.indexOf("frosting") - 1);
    for (const i of sand) expect(layout.kind[i]).toBe(rank);
    const border = sand.find((i) => (layout.ranks[i]?.length ?? 0) > 1);
    expect(border).toBeDefined();
    expect(layout.ranks[border!]?.at(-1)).toBe(rank);
  });

  it("grows the desert's own palms, cacti and sandstone peaks on sand", () => {
    const plan = planTerrain(map);
    // GROUNDS index of the sand family in canopy.ts and peaks.ts.
    const desert = 6;
    let woods = 0;
    let rock = 0;
    for (const i of sand) {
      const cell = map.cells[i]!;
      if (cell.obstacle === "forest") {
        woods += 1;
        expect(plan.canopyField.set[i]).toBe(desert);
      }
      if (cell.obstacle === "mountain" && plan.peakField.rock[i] === 1) {
        rock += 1;
        expect(plan.peakField.family[i]).toBe(desert);
      }
    }
    expect(woods + rock).toBeGreaterThan(0);
  });
});

describe("frosting in the terrain plan (bead bzc.115)", () => {
  // The first medium map that rolls a candy zone (M 3).
  const map = [3, 6, 10]
    .map((seed) => generateMap(seed, { size: "SM", players: 2 }))
    .find((m) => m.cells.some((c) => c.terrain === "frosting"))!;
  const icing = map.cells
    .map((c, i) => (c.terrain === "frosting" ? i : -1))
    .filter((i) => i >= 0);

  it("ranks the frosting after the older grounds, so they keep their ranks", () => {
    expect(icing.length).toBeGreaterThan(0);
    const layout = planTerrain(map).layout;
    const rank = GROUND_RANK.indexOf("frosting");
    // Only the swamp (bead bzc.126) ranks after it.
    expect(rank).toBe(GROUND_RANK.indexOf("swamp") - 1);
    for (const i of icing) expect(layout.kind[i]).toBe(rank);
    const border = icing.find((i) => (layout.ranks[i]?.length ?? 0) > 1);
    expect(border).toBeDefined();
    expect(layout.ranks[border!]?.at(-1)).toBe(rank);
  });

  it("grows the candy groves and gumdrop peaks on frosting", () => {
    const plan = planTerrain(map);
    // GROUNDS index of the frosting family in canopy.ts and peaks.ts.
    const candy = 7;
    let woods = 0;
    let rock = 0;
    for (const i of icing) {
      const cell = map.cells[i]!;
      if (cell.obstacle === "forest") {
        woods += 1;
        expect(plan.canopyField.set[i]).toBe(candy);
      }
      if (cell.obstacle === "mountain" && plan.peakField.rock[i] === 1) {
        rock += 1;
        expect(plan.peakField.family[i]).toBe(candy);
      }
    }
    expect(woods).toBeGreaterThan(0);
    expect(rock).toBeGreaterThan(0);
  });
});

describe("swamp in the terrain plan (bead bzc.126)", () => {
  // The first medium map that rolls a swamp (M 1).
  const map = generateMap(1, { size: "SM", players: 2 });
  const mud = map.cells
    .map((c, i) => (c.terrain === "swamp" ? i : -1))
    .filter((i) => i >= 0);

  it("ranks the swamp last, so every older ground keeps its rank", () => {
    expect(mud.length).toBeGreaterThan(0);
    const layout = planTerrain(map).layout;
    const rank = GROUND_RANK.indexOf("swamp");
    expect(rank).toBe(GROUND_RANK.length - 1);
    for (const i of mud) expect(layout.kind[i]).toBe(rank);
    const border = mud.find((i) => (layout.ranks[i]?.length ?? 0) > 1);
    expect(border).toBeDefined();
    expect(layout.ranks[border!]?.at(-1)).toBe(rank);
  });

  it("grows the swamp groves and mossy peaks on the swamp", () => {
    const plan = planTerrain(map);
    // GROUNDS index of the swamp family in canopy.ts and peaks.ts.
    const swamp = 8;
    let woods = 0;
    for (const i of mud) {
      const cell = map.cells[i]!;
      if (cell.obstacle === "forest") {
        woods += 1;
        expect(plan.canopyField.set[i]).toBe(swamp);
      }
      if (cell.obstacle === "mountain" && plan.peakField.rock[i] === 1)
        expect(plan.peakField.family[i]).toBe(swamp);
    }
    expect(woods).toBeGreaterThan(0);
  });
});
