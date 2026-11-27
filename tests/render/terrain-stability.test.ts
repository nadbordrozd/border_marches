/**
 * Terrain stability (bead border_marches-bzc.106): taking a pickup, beating
 * a monster, opening a gate, visiting a site or revealing the fog never
 * changes a tree, a peak, a doodad, a crown band or a decoration of the
 * adventure map. Before this bead the map view planned its terrain from the
 * objects still standing, so a pickup taken beside a range placed the peaks
 * round it again, often with other sprites (the user saw mountains change
 * shape). Now the plan reads only the map (terrain-plan.ts), which no game
 * action changes: game.ts hands the view the map once (setMap) and the
 * objects to draw on every change (setObjects), and only the map reaches
 * the terrain.
 *
 * Over several generated maps and the named maps, every kind of object is
 * removed one at a time, then all of them together, and a pickup beside a
 * range is taken through the game's own command; every sprite (its key,
 * which names the sprite and its variant, and its place) stays the same.
 */
import { describe, expect, it } from "vitest";
import { HEAVY_TIMEOUT } from "../timeouts.ts";
import { visitObject } from "../../src/core/game/adventure.ts";
import { newGame } from "../../src/core/game/newGame.ts";
import { cloneState } from "../../src/core/game/state.ts";
import type { GameState } from "../../src/core/game/types.ts";
import { generateMap } from "../../src/core/map/generate.ts";
import { NAMED_MAPS, buildNamedMap } from "../../src/core/map/named.ts";
import type { GameMap, MapObject } from "../../src/core/map/types.ts";
import { objectCells } from "../../src/core/map/types.ts";
import { mapDecorations } from "../../src/render/map/decorations.ts";
import {
  featuredCells,
  mapCanopy,
  mapPeaks,
} from "../../src/render/map/scene.ts";
import { planTerrain } from "../../src/render/map/terrain-plan.ts";
import { displayObjects } from "../../src/ui/objects.ts";

/**
 * Every terrain sprite the map view draws for a game state: trees and peaks
 * (key, box, foot), doodads, crown bands, the trodden patches under the
 * buildings and the map's decorations.
 */
function terrainSprites(state: GameState): string[] {
  const plan = planTerrain(state.map);
  const box = (s: { x: number; y: number; w: number; h: number }): string =>
    `${s.x},${s.y} ${s.w}x${s.h}`;
  return [
    ...plan.canopy.trees.map(
      (t) => `tree ${t.key} ${box(t)} foot ${t.baseX},${t.baseY}`,
    ),
    ...plan.peaks.peaks.map(
      (p) => `peak ${p.key} ${box(p)} foot ${p.baseX},${p.baseY}`,
    ),
    ...plan.doodads.doodads.map((d) => `doodad ${d.spec.key} ${box(d)}`),
    ...plan.bands.map(
      (b) => `band ${b.key} ${box(b)} ${b.trees.map((t) => t.key).join("+")}`,
    ),
    // The trodden patches under the buildings (bead bzc.138).
    ...plan.layout.patches.map((p) => `patch ${p.cx},${p.cy} ${p.rx}x${p.ry}`),
    ...mapDecorations(state.map).map(
      (d) =>
        `decoration ${d.id}/${d.variant} ${d.x},${d.y} ${JSON.stringify(d.at ?? null)}`,
    ),
  ];
}

/** The state with `gone` taken off the map as the game does. */
function without(state: GameState, gone: readonly MapObject[]): GameState {
  const next = cloneState(state);
  const ids = new Set(gone.map((o) => o.id));
  // A beaten monster leaves the monster list (battle.ts); anything else
  // taken, spent, opened or freed is listed as collected.
  next.monsters = Object.fromEntries(
    Object.entries(next.monsters).filter(([id]) => !ids.has(id)),
  );
  for (const o of gone)
    if (o.kind !== "monster" && !next.collected.includes(o.id))
      next.collected.push(o.id);
  return next;
}

/** Mountain and Forest cells round an object's cells. */
function rugged(map: GameMap, o: MapObject): number {
  let n = 0;
  for (const [cx, cy] of objectCells(o))
    for (let dy = -1; dy <= 1; dy += 1)
      for (let dx = -1; dx <= 1; dx += 1) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
        const obstacle = map.cells[y * map.width + x]?.obstacle;
        if (obstacle === "mountain" || obstacle === "forest") n += 1;
      }
  return n;
}

/** The peaks and trees as the view placed them before this bead. */
function oldTerrain(map: GameMap, objects: readonly MapObject[]): string {
  const featured = featuredCells(map, objects);
  return JSON.stringify([
    mapCanopy(map, featured).trees,
    mapPeaks(map, featured).peaks,
  ]);
}

/**
 * The maps: small generated ones (every removal's sprites compared), a
 * medium one and the named maps (slower to plan: there each removal is
 * checked to leave the map as it was, and the sprites are compared with
 * everything taken and after a visit).
 */
const MAPS: readonly { name: string; each: boolean; make: () => GameMap }[] = [
  ...[3, 11, 21].map((seed) => ({
    name: `seed ${seed} S`,
    each: true,
    make: () => generateMap(seed, { size: "S" }),
  })),
  {
    name: "seed 7 M",
    each: false,
    make: () => generateMap(7, { size: "SM" }),
  },
  ...NAMED_MAPS.map((def) => ({
    name: def.id,
    each: false,
    make: () => buildNamedMap(def),
  })),
];

describe("terrain stability under object changes (bead bzc.106)", () => {
  let reproduced = 0;

  for (const { name, each, make } of MAPS)
    it(
      `keeps every terrain sprite on ${name}`,
      () => {
        const state = newGame(make());
        const before = terrainSprites(state);
        expect(before.some((s) => s.startsWith("peak "))).toBe(true);
        expect(before.some((s) => s.startsWith("tree "))).toBe(true);
        const shown = displayObjects(state);
        const kinds = [...new Set(shown.map((o) => o.kind))];
        expect(kinds.length).toBeGreaterThanOrEqual(6);
        const ruggedFirst = (list: readonly MapObject[]): MapObject[] =>
          [...list].sort((a, b) => rugged(state.map, b) - rugged(state.map, a));

        // Each kind of object, one at a time: the one with the most rock and
        // wood round it (where the fault showed).
        for (const kind of kinds) {
          const o = ruggedFirst(shown.filter((x) => x.kind === kind))[0]!;
          const after = without(state, [o]);
          expect(displayObjects(after).some((x) => x.id === o.id)).toBe(false);
          expect(after.map).toBe(state.map);
          expect(after.map.objects).toBe(state.map.objects);
          if (each)
            expect(terrainSprites(after), `${kind} ${o.id} taken`).toEqual(
              before,
            );
        }

        // Everything at once, with the whole map explored.
        const bare = without(state, shown);
        for (const p of bare.players) p.explored = p.explored.map(() => true);
        expect(displayObjects(bare)).toEqual([]);
        expect(terrainSprites(bare), "everything taken").toEqual(before);

        // A pickup beside rock or wood taken through the game's own command.
        const pickup = ruggedFirst(shown.filter((o) => o.kind === "pickup"))[0];
        const hero = state.heroes.find(
          (h) => h.alive && h.owner === state.currentPlayer,
        );
        expect(pickup).toBeDefined();
        expect(hero).toBeDefined();
        const placed = cloneState(state);
        const h = placed.heroes.find((x) => x.id === hero!.id)!;
        h.x = pickup!.x;
        h.y = pickup!.y + (pickup!.y + 1 < state.map.height ? 1 : -1);
        const result = visitObject(placed, hero!.id, pickup!.id);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.state.collected).toContain(pickup!.id);
          expect(result.state.map).toBe(state.map);
          expect(terrainSprites(result.state), "pickup visited").toEqual(
            before,
          );
        }

        // The view before this bead placed the trees and peaks from the
        // objects still standing: there the same pickup moved sprites.
        if (each) {
          const taken = displayObjects(without(state, [pickup!]));
          if (oldTerrain(state.map, shown) !== oldTerrain(state.map, taken))
            reproduced += 1;
        }
      },
      HEAVY_TIMEOUT,
    );

  it("would have caught the fault: the old placement moved sprites", () => {
    expect(reproduced).toBeGreaterThan(0);
  });
});
