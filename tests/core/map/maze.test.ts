/**
 * Map generator v2 (bead bzc.3): maze-like, dense maps for 2-4 players.
 *
 * Connectivity from every start, guards in proportion to the value they
 * hold, density per zone, passage width, determinism, player starts and
 * the data-driven object table.
 */
import { describe, expect, it } from "vitest";
import {
  FREE_VALUE,
  GUARD_FV_PER_VALUE,
  MAP_OBJECT_ROWS,
} from "../../../src/data/mapObjects.ts";
import type { MapObjectRow } from "../../../src/data/mapObjects.ts";
import { newGame } from "../../../src/core/game/index.ts";
import { mapDensity, zoneDensity } from "../../../src/core/map/density.ts";
import {
  DEFAULT_GEN_CONFIG,
  generateMap,
  generateMapWithInfo,
} from "../../../src/core/map/generate.ts";
import type {
  GenerateInfo,
  GenerateOptions,
  MapSize,
  PlayerCount,
} from "../../../src/core/map/generate.ts";
import { validateMap } from "../../../src/core/map/types.ts";
import type { GameMap, MapObject } from "../../../src/core/map/types.ts";
import { moveCosts, startTowns, walkable } from "./map-helpers.ts";

const CASES: Array<{ size: MapSize; players: PlayerCount; seeds: number[] }> = [
  { size: "S", players: 2, seeds: [1, 2, 3, 4, 5, 6] },
  { size: "M", players: 3, seeds: [1, 2, 3, 4] },
  { size: "M", players: 2, seeds: [5, 6] },
  { size: "L", players: 4, seeds: [1, 2, 3] },
  { size: "L", players: 3, seeds: [4] },
];

const cache = new Map<string, { map: GameMap; info: GenerateInfo }>();
function gen(
  seed: number,
  options: GenerateOptions,
): { map: GameMap; info: GenerateInfo } {
  const key = `${seed}/${options.size}/${options.players}/${options.activePlayers ?? 1}`;
  let out = cache.get(key);
  if (!out) {
    out = generateMapWithInfo(seed, options);
    cache.set(key, out);
  }
  return out;
}

function* maps(): Generator<{
  label: string;
  map: GameMap;
  info: GenerateInfo;
  players: PlayerCount;
}> {
  for (const c of CASES) {
    for (const seed of c.seeds) {
      const { map, info } = gen(seed, { size: c.size, players: c.players });
      yield {
        label: `${c.size}/${c.players}p seed ${seed}`,
        map,
        info,
        players: c.players,
      };
    }
  }
}

const zoneKind = (info: GenerateInfo, map: GameMap, o: MapObject): string =>
  info.zones[map.zones![o.y * map.width + o.x]!]!.role;

describe(
  "map generator v2: maze-like dense maps (bzc.3)",
  { timeout: 120_000 },
  () => {
    it("makes valid maps with every start, town and object placed", () => {
      for (const { label, map, info, players } of maps()) {
        expect(validateMap(map), label).toEqual([]);
        expect(info.skipped, label).toEqual([]);
        expect(startTowns(map), label).toHaveLength(players);
        expect(
          info.zones.filter((z) => z.role === "start"),
          label,
        ).toHaveLength(players);
      }
    });

    it("lets every start reach every town and every prize", () => {
      // Guards are ignored here (they are fought, not walked round); object
      // footprints and obstacles block.
      for (const { label, map } of maps()) {
        const w = map.width;
        for (const s of startTowns(map)) {
          const cost = moveCosts(map, s.x, s.y);
          for (const o of map.objects) {
            expect(
              Number.isFinite(cost[o.y * w + o.x]!),
              `${label}: ${o.id} unreachable from ${s.id}`,
            ).toBe(true);
          }
        }
      }
    });

    it("guards every prize worth its zone's free value, in proportion", () => {
      for (const { label, map, info } of maps()) {
        const byId = new Map(map.objects.map((o) => [o.id, o]));
        const guardedIds = new Set<string>();
        for (const m of map.objects) {
          if (m.kind !== "monster") continue;
          const value = Number(m.data["value"]);
          const fv = Number(m.data["fv"]);
          const ids = (m.data["guards"] as string[] | undefined) ?? [];
          // The value a guard holds is the value of what stands behind it.
          if (ids.length > 0) {
            const sum = ids.reduce(
              (s, id) => s + Number(byId.get(id)?.data["value"] ?? NaN),
              0,
            );
            expect(sum, `${label}: ${m.id} value`).toBe(value);
          } else {
            expect(m.data["pass"], `${label}: ${m.id} guards nothing`).toBe(
              true,
            );
          }
          ids.forEach((id) => guardedIds.add(id));
          // Fight value roughly in proportion to the value: the ring factor
          // (0.8-1.4), a 12% jitter and the count's rounding, nothing more.
          if (
            value * GUARD_FV_PER_VALUE >=
            DEFAULT_GEN_CONFIG.guards.minFightValue
          ) {
            const ratio = fv / (value * GUARD_FV_PER_VALUE);
            expect(
              ratio,
              `${label}: ${m.id} fv ${fv} for ${value}`,
            ).toBeGreaterThan(0.6);
            expect(
              ratio,
              `${label}: ${m.id} fv ${fv} for ${value}`,
            ).toBeLessThan(1.75);
          }
        }
        // Everything worth at least its zone's free value has a guard.
        for (const o of map.objects) {
          if (o.kind !== "mine" && o.kind !== "pickup") continue;
          const kind = zoneKind(info, map, o) as keyof typeof FREE_VALUE;
          if (Number(o.data["value"]) >= FREE_VALUE[kind]) {
            expect(guardedIds.has(o.id), `${label}: ${o.id} unguarded`).toBe(
              true,
            );
          }
        }
      }
    });

    it("puts each guard in the way: its prizes are out of reach without it", () => {
      for (const { label, map } of maps()) {
        const w = map.width;
        const home = startTowns(map)[0]!;
        for (const m of map.objects) {
          const ids = (m.data["guards"] as string[] | undefined) ?? [];
          if (m.kind !== "monster" || ids.length === 0) continue;
          // Close the guard's zone of control: what it guards is either
          // inside it or cut off.
          const zoc = (x: number, y: number): boolean =>
            Math.abs(x - m.x) <= 1 && Math.abs(y - m.y) <= 1;
          const cost = moveCosts(map, home.x, home.y, zoc);
          for (const id of ids) {
            const o = map.objects.find((q) => q.id === id)!;
            const inside = zoc(o.x, o.y);
            expect(
              inside || !Number.isFinite(cost[o.y * w + o.x]!),
              `${label}: ${id} reachable past ${m.id}`,
            ).toBe(true);
          }
        }
      }
    });

    it("is dense: something to do in every zone, well above the old maps", () => {
      // The old generator (before bzc.3), seeds 1-10: S 4.35, M 3.27,
      // L 2.45 visitable objects per 100 passable cells.
      const old: Record<MapSize, number> = { S: 4.35, M: 3.27, L: 2.45 };
      for (const { label, map, info } of maps()) {
        const d = mapDensity(map);
        const size = (["S", "M", "L"] as const).find(
          (s) => DEFAULT_GEN_CONFIG.sizes[s] === map.width,
        )!;
        expect(d.visitable, label).toBeGreaterThan(1.4 * old[size]);
        for (const [z, s] of zoneDensity(map)) {
          expect(
            s.visitable,
            `${label}: zone ${z} (${info.zones[z]!.role})`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    });

    it("walls zones off with narrow passages and cuts zones into rooms", () => {
      for (const { label, map, info } of maps()) {
        const w = map.width;
        const zones = map.zones!;
        const walk = walkable(map);
        for (const p of [...info.passes, ...info.gaps]) {
          expect(p.width, label).toBeGreaterThanOrEqual(1);
          expect(p.width, label).toBeLessThanOrEqual(3);
        }
        // Narrow: one stack standing on the pass cell closes it. With its
        // zone of control (3x3) shut, no way leads through the 11x11 window
        // round it from one zone's side (its rim) to the other's.
        const R = 5;
        for (const p of info.passes) {
          if (p.a === p.b) continue;
          const px = p.cell % w;
          const py = Math.floor(p.cell / w);
          const open = (x: number, y: number): boolean =>
            Math.abs(x - px) <= R &&
            Math.abs(y - py) <= R &&
            walk(x, y) &&
            !(Math.abs(x - px) <= 1 && Math.abs(y - py) <= 1);
          const seen = new Set<number>();
          const stack: number[] = [];
          for (let y = py - R; y <= py + R; y++)
            for (let x = px - R; x <= px + R; x++) {
              const rim = Math.max(Math.abs(x - px), Math.abs(y - py)) === R;
              if (rim && open(x, y) && zones[y * w + x] === p.a) {
                seen.add(y * w + x);
                stack.push(y * w + x);
              }
            }
          let crossed = false;
          while (stack.length > 0 && !crossed) {
            const i = stack.pop()!;
            const x = i % w;
            const y = Math.floor(i / w);
            for (let dy = -1; dy <= 1; dy++)
              for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                const j = ny * w + nx;
                if (seen.has(j) || !open(nx, ny)) continue;
                if (
                  dx !== 0 &&
                  dy !== 0 &&
                  !walk(x + dx, y) &&
                  !walk(x, y + dy)
                )
                  continue;
                const rim =
                  Math.max(Math.abs(nx - px), Math.abs(ny - py)) === R;
                if (rim && zones[j] === p.b) crossed = true;
                seen.add(j);
                stack.push(j);
              }
          }
          expect(crossed, `${label}: pass ${p.a}-${p.b} at ${px},${py}`).toBe(
            false,
          );
        }
        // A maze, not a plain: several rooms per zone on average, and open
        // floor (a fully open 5x5 block) is rare.
        expect(info.gaps.length, label).toBeGreaterThanOrEqual(
          info.zones.length,
        );
        let pass = 0;
        let open = 0;
        for (let y = 0; y < map.height; y++)
          for (let x = 0; x < w; x++) {
            const c = map.cells[y * w + x]!;
            if (c.terrain === "water" || c.obstacle !== "none") continue;
            pass++;
            let all = true;
            for (let dy = -2; dy <= 2 && all; dy++)
              for (let dx = -2; dx <= 2; dx++) {
                const q = map.cells[(y + dy) * w + x + dx];
                const inside =
                  x + dx >= 0 &&
                  x + dx < w &&
                  y + dy >= 0 &&
                  y + dy < map.height;
                if (
                  !inside ||
                  !q ||
                  q.terrain === "water" ||
                  q.obstacle !== "none"
                )
                  all = false;
              }
            if (all) open++;
          }
        // The old maps: 13-14% of passable cells sat in open 5x5 blocks.
        expect(open / pass, label).toBeLessThan(0.11);
      }
    });

    it("is deterministic per seed, size and player count", () => {
      for (const [size, players] of [
        ["S", 2],
        ["M", 3],
        ["L", 4],
      ] as const) {
        const a = JSON.stringify(generateMap(21, { size, players }));
        const b = JSON.stringify(generateMap(21, { size, players }));
        expect(a).toBe(b);
      }
      expect(
        JSON.stringify(generateMap(21, { size: "M", players: 2 })),
      ).not.toBe(JSON.stringify(generateMap(21, { size: "M", players: 3 })));
    });

    it("gives every start a town and a fair kit near home", () => {
      for (const { label, map } of maps()) {
        for (const s of startTowns(map)) {
          const cost = moveCosts(map, s.x, s.y);
          const near = (row: string, days: number): number =>
            map.objects.filter(
              (o) =>
                o.id.startsWith(`${row}-`) &&
                cost[o.y * map.width + o.x]! <= days * 1500,
            ).length;
          const who = `${label}: start ${String(s.data["start"])}`;
          expect(near("mine-wood", 1.15), who).toBeGreaterThanOrEqual(1);
          expect(near("mine-ore", 1.15), who).toBeGreaterThanOrEqual(1);
          expect(near("pickup-wood", 1.2), who).toBeGreaterThanOrEqual(2);
          expect(near("mine-essence", 2.5), who).toBeGreaterThanOrEqual(1);
        }
      }
    });

    it("keeps unused starts harmless in today's single-player game", () => {
      const { map } = gen(1, { size: "L", players: 4 });
      const state = newGame(map);
      // One player, one hero; the open starts and neutral towns are guarded
      // towns nobody owns, and the Hold is the only win condition.
      expect(state.players.map((p) => p.id)).toEqual([0]);
      expect(state.heroes).toHaveLength(1);
      const all = Object.values(state.towns);
      expect(all.filter((t) => t.isHold)).toHaveLength(1);
      for (const t of all.filter((q) => q.owner === null && !q.isHold)) {
        expect(t.garrison.some((s) => s !== null)).toBe(true);
      }
      // With every player active each start has its owner and hero.
      const four = generateMap(1, { size: "L", players: 4, activePlayers: 4 });
      const s4 = newGame(four);
      expect(s4.players.map((p) => p.id)).toEqual([0, 1, 2, 3]);
      expect(s4.heroes).toHaveLength(4);
      // The setup screen's path (players = active players = 3): the game
      // uses the generator's starts as they are and derives none.
      const three = generateMap(2, { size: "M", players: 3, activePlayers: 3 });
      const s3 = newGame(three, {
        players: [0, 1, 2].map((i) => ({
          kind: i === 0 ? ("human" as const) : ("ai" as const),
          faction: "lost-world" as const,
        })),
      });
      expect(s3.map.objects.some((o) => o.id.startsWith("town-start-"))).toBe(
        false,
      );
      for (const t of startTowns(three)) {
        expect(s3.towns[t.id]?.owner).toBe(t.data["start"]);
      }
      expect(Object.values(s3.towns).filter((t) => t.isHold)).toHaveLength(1);
    });

    it("places new object types from table rows alone", () => {
      // A made-up row: the generator needs nothing but the row to place it.
      const shrine: MapObjectRow = {
        id: "test-shrine",
        type: "resource-pile",
        kind: "pickup",
        value: 2500,
        footprint: { w: 2, h: 2 },
        entrance: [0, 1],
        visit: "any",
        weights: { middle: 4, town: 4, hold: 4 },
        guard: "auto",
        perZone: 1,
        data: { resource: "gold", amount: 1 },
      };
      const { map, info } = generateMapWithInfo(3, {
        size: "M",
        config: { objects: { table: [...MAP_OBJECT_ROWS, shrine] } },
      });
      expect(validateMap(map)).toEqual([]);
      expect(info.skipped).toEqual([]);
      const placed = map.objects.filter((o) => o.id.startsWith("test-shrine-"));
      expect(placed.length).toBeGreaterThanOrEqual(1);
      const guarded = new Set(
        map.objects.flatMap((o) => (o.data["guards"] as string[]) ?? []),
      );
      for (const o of placed) {
        expect(o.footprint).toEqual({ w: 2, h: 2 });
        expect(o.blocked).toHaveLength(3);
        expect(o.data["value"]).toBe(2500);
        expect(guarded.has(o.id), o.id).toBe(true);
      }
    });
  },
);
