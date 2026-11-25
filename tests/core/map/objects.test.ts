/**
 * The generator's catalogue placement (bead bzc.13): types, density,
 * value-proportional guards, rule-placed objects, quests and contents.
 */
import { describe, expect, it } from "vitest";
import {
  generateMap,
  generateMapWithInfo,
} from "../../../src/core/map/generate.ts";
import { mapDensity } from "../../../src/core/map/density.ts";
import type { GameMap, MapObject } from "../../../src/core/map/types.ts";
import {
  cellAt,
  isPassable,
  objectCells,
  validateMap,
} from "../../../src/core/map/types.ts";
import {
  OBJECT_TYPES,
  type ObjectTypeId,
} from "../../../src/data/objectTypes.ts";
import { GUARD_CREATURE_IDS } from "../../../src/data/strays.ts";
import { getCreature } from "../../../src/data/creatures.ts";
import { newGame } from "../../../src/core/game/index.ts";

const maps = new Map<string, GameMap>();
function map(seed: number, size: "S" | "M" | "L"): GameMap {
  const k = `${seed}${size}`;
  let m = maps.get(k);
  if (m === undefined) {
    m = generateMap(seed, { size, players: 3 });
    maps.set(k, m);
  }
  return m;
}
const typeOf = (o: MapObject): string => String(o.data["type"] ?? o.kind);

describe("catalogue placement", () => {
  it("places a wide variety of catalogued types, valid and deterministic", () => {
    const m = map(3, "L");
    expect(validateMap(m)).toEqual([]);
    const types = new Set(m.objects.map(typeOf));
    expect(types.size).toBeGreaterThanOrEqual(45);
    for (const o of m.objects) {
      if (o.kind === "town" || o.kind === "monster" || o.kind === "hero-start")
        continue;
      expect(OBJECT_TYPES[typeOf(o) as ObjectTypeId]).toBeDefined();
    }
    const again = generateMap(3, { size: "L", players: 3 });
    expect(JSON.stringify(again.objects)).toBe(JSON.stringify(m.objects));
  });

  it("over a few maps, places every type that the fill or rules can", () => {
    const seen = new Set<string>();
    for (const seed of [1, 2, 3, 4]) {
      for (const o of map(seed, "L").objects) seen.add(typeOf(o));
    }
    const authored: ObjectTypeId[] = ["event-tile", "sign"];
    for (const t of Object.keys(OBJECT_TYPES) as ObjectTypeId[]) {
      if (authored.includes(t)) continue;
      expect(seen, t).toContain(t);
    }
  });

  it("is dense: 18 or more visitable objects per 100 open cells", () => {
    // Three starts crowd a small map with town yards: 15 there.
    for (const [seed, size, least] of [
      [1, "S", 15],
      [2, "M", 18],
      [3, "L", 18],
    ] as const) {
      expect(mapDensity(map(seed, size)).visitable).toBeGreaterThan(least);
    }
  });

  it("guards are strays sized in proportion to what they guard", () => {
    const m = map(2, "M");
    const ratios: number[] = [];
    for (const o of m.objects) {
      if (o.kind !== "monster" || o.data["pass"] === true) continue;
      expect(GUARD_CREATURE_IDS).toContain(o.data["creature"]);
      const fv =
        Number(o.data["count"]) *
        getCreature(String(o.data["creature"])).fightValue;
      const value = Number(o.data["value"]);
      if (value >= 1500) ratios.push(fv / value);
    }
    expect(ratios.length).toBeGreaterThan(5);
    for (const r of ratios) {
      expect(r).toBeGreaterThan(0.3);
      expect(r).toBeLessThan(1.6);
    }
  });

  it("never guards banks, seer huts or buried things on the map", () => {
    const m = map(1, "L");
    const guarded = new Set<string>();
    for (const o of m.objects) {
      const g = o.data["guards"];
      if (o.kind === "monster" && Array.isArray(g) && g.length === 1) {
        guarded.add(String(g[0]));
      }
    }
    for (const o of m.objects) {
      if (
        o.kind === "bank" ||
        o.kind === "buried" ||
        typeOf(o) === "seer-hut"
      ) {
        expect(guarded.has(o.id), o.id).toBe(false);
      }
    }
  });

  it("places the rule objects: obelisks, the Keystone, caches, waystone pairs", () => {
    const m = map(2, "M");
    const count = (t: string): number =>
      m.objects.filter((o) => typeOf(o) === t).length;
    expect(count("obelisk")).toBeGreaterThanOrEqual(4);
    expect(count("buried-keystone")).toBe(1);
    expect(count("buried-cache")).toBeGreaterThanOrEqual(3);
    const stones = m.objects.filter((o) => typeOf(o) === "two-way-waystone");
    const pairs = new Map<string, number>();
    for (const s of stones) {
      const p = String(s.data["pair"]);
      pairs.set(p, (pairs.get(p) ?? 0) + 1);
    }
    for (const n of pairs.values()) expect(n).toBe(2);
    expect(count("keepers-vault")).toBeLessThanOrEqual(1);
  });

  it("every border gate has a keymaster's tent of its colour", () => {
    for (const seed of [1, 2, 3]) {
      const m = map(seed, "L");
      for (const g of m.objects.filter((o) => typeOf(o) === "border-gate")) {
        expect(
          m.objects.some(
            (o) =>
              typeOf(o) === "keymasters-tent" &&
              o.data["colour"] === g.data["colour"],
          ),
        ).toBe(true);
      }
    }
  });

  it("gives every seer hut, quest gate and lodge a quest", () => {
    const m = map(4, "L");
    for (const o of m.objects) {
      const t = typeOf(o);
      if (t === "seer-hut" || t === "quest-gate" || t === "caretaker-lodge") {
        expect(o.data["quest"], o.id).toBeDefined();
      }
      if (t === "seer-hut") expect(o.data["reward"]).toBeDefined();
    }
  });

  it("gives every start the same strange thing near home", () => {
    const m = map(5, "M");
    const strange = m.objects.filter((o) => o.data["strange"] === true);
    expect(strange.length).toBeGreaterThanOrEqual(3);
    const kinds = new Set(strange.map((o) => typeOf(o)));
    expect(kinds.size).toBe(1);
  });

  it("starts a playable game on a full map", () => {
    const s = newGame(map(2, "M"), {
      players: [
        { kind: "human", faction: "humans" },
        { kind: "ai", faction: "undead" },
        { kind: "ai", faction: "goblins" },
      ],
    });
    expect(s.sites).toEqual({});
    expect(Object.keys(s.mines).length).toBeGreaterThan(6);
  });
});

describe("one-way waystones (stretch, bead bzc.32)", () => {
  const ways = (m: GameMap): MapObject[] =>
    m.objects.filter((o) => typeOf(o) === "one-way-waystone");

  it("places one per size step, exits in another wild zone no deeper, far from starts", () => {
    let total = 0;
    for (const [seed, size, most] of [
      [4, "S", 1],
      [2, "M", 2],
      [1, "L", 3],
      [3, "L", 3],
    ] as const) {
      const { map: m, info } = generateMapWithInfo(seed, { size });
      expect(validateMap(m)).toEqual([]);
      const list = ways(m);
      expect(list.length, `${size}${seed}`).toBeGreaterThanOrEqual(1);
      expect(list.length).toBeLessThanOrEqual(most);
      total += list.length;
      const zoneAt = (x: number, y: number) =>
        info.zones[m.zones?.[y * m.width + x] ?? -1];
      const taken = new Set<string>();
      for (const o of m.objects)
        for (const [x, y] of objectCells(o)) taken.add(`${x},${y}`);
      const starts = m.objects.filter(
        (o) => o.kind === "town" && o.data["start"] !== undefined,
      );
      const guards = m.objects.filter((o) => o.kind === "monster");
      const entranceZones = new Set<number>();
      for (const w of list) {
        const [ex, ey] = w.data["exit"] as [number, number];
        const a = zoneAt(w.x, w.y);
        const b = zoneAt(ex, ey);
        expect(a?.role).toMatch(/^(middle|town)$/);
        expect(b?.role).toMatch(/^(middle|town)$/);
        expect(b?.id).not.toBe(a?.id);
        expect(b!.tier).toBeLessThanOrEqual(a!.tier);
        expect(entranceZones.has(a!.id)).toBe(false);
        entranceZones.add(a!.id);
        // The exit is open ground that no object covers.
        expect(isPassable(cellAt(m, ex, ey)!)).toBe(true);
        expect(taken.has(`${ex},${ey}`)).toBe(false);
        expect(cellAt(m, w.x, w.y)?.road).toBe(false);
        for (const [x, y] of [
          [w.x, w.y],
          [ex, ey],
        ] as const) {
          // The rule is a day of movement with the roads; on the ground
          // that is never fewer than 6 cells from a start town.
          for (const t of starts) {
            expect(
              Math.max(Math.abs(t.x - x), Math.abs(t.y - y)),
            ).toBeGreaterThanOrEqual(6);
          }
          for (const g of guards) {
            expect(
              Math.max(Math.abs(g.x - x), Math.abs(g.y - y)),
            ).toBeGreaterThan(1);
          }
        }
      }
    }
    expect(total).toBeGreaterThanOrEqual(7);
  });

  it("is deterministic and leaves the rest of the map as it was without them", () => {
    const on = generateMap(2, { size: "M" });
    expect(JSON.stringify(generateMap(2, { size: "M" }))).toBe(
      JSON.stringify(on),
    );
    const off = generateMap(2, {
      size: "M",
      config: { objects: { oneWayWaystones: { S: 0, M: 0, L: 0 } } },
    });
    expect(ways(off)).toEqual([]);
    expect(JSON.stringify(off.cells)).toBe(JSON.stringify(on.cells));
    expect(JSON.stringify(off.objects)).toBe(
      JSON.stringify(
        on.objects.filter((o) => typeOf(o) !== "one-way-waystone"),
      ),
    );
  });
});

describe("drill yards (bead bzc.32)", () => {
  it("places one on S and M maps and one or two on L, in wild zones, unguarded at value 0", () => {
    for (const [size, least, most] of [
      ["S", 1, 1],
      ["M", 1, 1],
      ["L", 1, 2],
    ] as const) {
      for (const seed of [1, 2, 3, 4]) {
        const { map: m, info } = generateMapWithInfo(seed, { size });
        const yards = m.objects.filter((o) => typeOf(o) === "drill-yard");
        expect(yards.length, `${size}${seed}`).toBeGreaterThanOrEqual(least);
        expect(yards.length, `${size}${seed}`).toBeLessThanOrEqual(most);
        for (const y of yards) {
          const zone = info.zones[m.zones?.[y.y * m.width + y.x] ?? -1];
          expect(zone?.role).toMatch(/^(middle|town)$/);
          expect(y.footprint).toEqual({ w: 2, h: 2 });
          expect(y.data["value"]).toBe(OBJECT_TYPES["drill-yard"].value);
          // Its value (0) is below every zone's free value: no guard.
          expect(
            m.objects.some(
              (o) =>
                o.kind === "monster" &&
                Array.isArray(o.data["guards"]) &&
                (o.data["guards"] as string[]).includes(y.id),
            ),
          ).toBe(false);
        }
      }
    }
  });

  it("is left out when its per-map count is [0, 0] (the named maps)", () => {
    const off = generateMap(1, {
      size: "L",
      config: {
        objects: {
          perMap: { "drill-yard": { S: [0, 0], M: [0, 0], L: [0, 0] } },
        },
      },
    });
    expect(off.objects.filter((o) => typeOf(o) === "drill-yard")).toEqual([]);
    expect(validateMap(off)).toEqual([]);
  });
});
