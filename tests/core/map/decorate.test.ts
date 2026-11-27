/**
 * Bead border_marches-bzc.72: decorations on generated and named maps.
 * Passable decorations are scattered by ground; impassable props stand at
 * wood edges and on open ground without cutting anything off, block
 * movement, are seeded and saved with the map.
 */
import { describe, expect, it } from "vitest";
import { HEAVY_TIMEOUT } from "../../timeouts.ts";
import { decorationKind } from "../../../src/data/decorations.ts";
import { DECORATE, decorateMap } from "../../../src/core/map/decorate.ts";
import {
  corridorCells,
  generateMap,
  generateMapWithInfo,
} from "../../../src/core/map/generate.ts";
import {
  buildNamedMap,
  generateNamedBase,
  NAMED_MAPS,
} from "../../../src/core/map/named.ts";
import {
  cellAt,
  decorationCells,
  propAt,
  validateMap,
} from "../../../src/core/map/types.ts";
import type { GameMap } from "../../../src/core/map/types.ts";
import { newGame } from "../../../src/core/game/index.ts";
import {
  findPath,
  isImpassableCell,
  moveContext,
} from "../../../src/core/game/pathfinding.ts";
import { describeCell } from "../../../src/ui/format.ts";
import { buildMap, field, heroStart } from "../game/helpers.ts";
import { moveCosts, startTowns } from "./map-helpers.ts";

const props = (m: GameMap) =>
  (m.decorations ?? []).filter((d) => decorationKind(d.id)?.passable === false);
const small = (m: GameMap) =>
  (m.decorations ?? []).filter((d) => decorationKind(d.id)?.passable === true);
const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

const GENERATED = [
  [3, "S"],
  [7, "M"],
  [11, "M"],
  [5, "L"],
] as const;

describe("decorations on maps (bzc.72)", { timeout: HEAVY_TIMEOUT }, () => {
  const maps = [
    ...GENERATED.map(([seed, size]) => ({
      label: `${size}${seed}`,
      ...generateMapWithInfo(seed, { size }),
    })),
  ];
  const named = NAMED_MAPS.map((def) => ({
    label: def.id,
    map: buildNamedMap(def),
  }));
  const all = [...maps.map((m) => ({ label: m.label, map: m.map })), ...named];

  it("puts a few per screen on every map, valid and from the catalogue", () => {
    for (const { label, map } of all) {
      expect(validateMap(map), label).toEqual([]);
      const open = map.cells.filter(
        (c) => c.terrain !== "water" && c.obstacle === "none",
      ).length;
      // A screen shows about 21 x 13 cells.
      expect(small(map).length, label).toBeGreaterThan(open * 0.04);
      expect(props(map).length, label).toBeGreaterThan(open * 0.006);
      for (const d of map.decorations ?? []) {
        const kind = decorationKind(d.id);
        expect(kind, `${label} ${d.id}`).toBeDefined();
        for (const [x, y] of decorationCells(d)) {
          const t = cellAt(map, x, y)?.terrain;
          expect(
            kind!.terrains as readonly string[],
            `${label} ${d.id}`,
          ).toContain(t);
        }
      }
    }
  });

  it("is seeded: the same map decorates the same way", () => {
    expect(JSON.stringify(generateMap(7, { size: "M" }))).toBe(
      JSON.stringify(maps[1]!.map),
    );
    const def = NAMED_MAPS[0]!;
    expect(JSON.stringify(buildNamedMap(def))).toBe(
      JSON.stringify(named[0]!.map),
    );
    // The named base carries none: they come after the edits.
    expect(generateNamedBase(def).decorations).toBeUndefined();
  });

  it("keeps props off roads, corridors, approaches and town yards", () => {
    for (const { label, map, info } of maps) {
      const corridor = new Set(corridorCells(info));
      for (const d of props(map)) {
        for (const [x, y] of decorationCells(d)) {
          const at = `${label} ${d.id}@${x},${y}`;
          expect(cellAt(map, x, y)?.prop, at).toBe(true);
          expect(cellAt(map, x, y)?.road, at).toBe(false);
          expect(corridor.has(y * map.width + x), at).toBe(false);
          for (const o of map.objects) {
            expect(
              cheb(o, { x, y }),
              `${at} by ${o.id}`,
            ).toBeGreaterThanOrEqual(
              o.kind === "town" ? DECORATE.townGap : DECORATE.entranceGap,
            );
          }
        }
      }
      for (const d of small(map)) {
        const at = `${label} ${d.id}@${d.x},${d.y}`;
        expect(cellAt(map, d.x, d.y)?.road, at).toBe(false);
        expect(corridor.has(d.y * map.width + d.x), at).toBe(false);
        for (const o of map.objects) {
          expect(o.x === d.x && o.y === d.y, `${at} on ${o.id}`).toBe(false);
          if (o.kind === "pickup" || o.kind === "artifact")
            expect(cheb(o, d), `${at} by ${o.id}`).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("cuts nothing off and adds less than a step on the way to anything", () => {
    for (const [seed, size] of GENERATED) {
      const bare = generateMap(seed, { size, decorations: false });
      const map = maps.find((m) => m.label === `${size}${seed}`)!.map;
      for (const t of startTowns(map)) {
        const before = moveCosts(bare, t.x, t.y);
        const after = moveCosts(map, t.x, t.y);
        for (let i = 0; i < before.length; i++) {
          if (map.cells[i]?.prop === true) continue;
          const at = `${size}${seed} (${i % map.width},${Math.floor(i / map.width)})`;
          expect(Number.isFinite(after[i]), at).toBe(
            Number.isFinite(before[i]),
          );
          if (Number.isFinite(before[i]))
            expect(after[i]! - before[i]!, at).toBeLessThan(150);
        }
      }
    }
  });

  it("refuses a map whose prop flags and props disagree", () => {
    const map = buildMap(field(5, 3), []);
    map.cells[7]!.prop = true;
    expect(validateMap(map).join(";")).toMatch(/prop flag/);
    map.decorations = [{ id: "big-boulder", x: 2, y: 1, variant: 0 }];
    expect(validateMap(map)).toEqual([]);
    map.decorations.push({ id: "no-such-thing", x: 0, y: 0, variant: 0 });
    expect(validateMap(map).join(";")).toMatch(/unknown kind/);
  });

  it("replaces only open land and edge trees, never water or rock", () => {
    for (const { label, map } of all) {
      for (const d of map.decorations ?? [])
        for (const [x, y] of decorationCells(d)) {
          const c = cellAt(map, x, y)!;
          expect(c.terrain, label).not.toBe("water");
          expect(c.obstacle, label).toBe("none");
        }
    }
  });
});

describe("props block movement (bzc.72)", () => {
  // A 7 x 3 meadow with a fallen log across the middle row's centre.
  const rows = field(7, 3);
  const decorated = (): GameMap => {
    const map = buildMap(rows, [heroStart(0, 1)]);
    map.decorations = [{ id: "fallen-log", x: 3, y: 1, variant: 1 }];
    for (const [x, y] of decorationCells(map.decorations[0]!))
      map.cells[y * map.width + x]!.prop = true;
    expect(validateMap(map)).toEqual([]);
    return map;
  };

  it("paths go round a prop and never onto it", () => {
    const state = newGame(decorated());
    const hero = state.heroes[0]!;
    const path = findPath(state, hero.id, 6, 1, { ignoreFog: true });
    expect(path).not.toBeNull();
    for (const s of path!.steps)
      expect(s.y === 1 && (s.x === 3 || s.x === 4)).toBe(false);
    expect(findPath(state, hero.id, 3, 1, { ignoreFog: true })).toBeNull();
  });

  it("stays a wall on the Green Road (forests open, props do not)", () => {
    const state = newGame(decorated());
    const hero = state.heroes[0]!;
    const ctx = {
      ...moveContext(state, hero, { ignoreFog: true }),
      forestCost: 200,
    };
    expect(isImpassableCell(ctx, 3, 1)).toBe(true);
    expect(isImpassableCell(ctx, 2, 1)).toBe(false);
  });

  it("names a prop on hover and keeps it in the saved map", () => {
    const state = newGame(decorated());
    expect(propAt(state.map, 4, 1)?.id).toBe("fallen-log");
    const text = describeCell(state, 0, 4, 1) ?? "";
    expect(text.split("\n")[0]).toBe("Fallen Log");
    expect(text).toMatch(/Blocks the way/);
    const saved = JSON.parse(JSON.stringify(state)) as typeof state;
    expect(saved.map.decorations).toEqual(state.map.decorations);
    expect(saved.map.cells[1 * 7 + 3]?.prop).toBe(true);
  });

  it("decorates a bare map in place, the same twice", () => {
    const a = generateMap(9, { size: "S", decorations: false });
    const b = generateMap(9, { size: "S", decorations: false });
    decorateMap(a);
    decorateMap(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect((a.decorations ?? []).length).toBeGreaterThan(10);
  });
});
