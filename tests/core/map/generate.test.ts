import { describe, expect, it } from "vitest";
import {
  DEFAULT_GEN_CONFIG,
  generateMap,
  generateMapWithInfo,
} from "../../../src/core/map/generate.ts";
import type { GenerateInfo } from "../../../src/core/map/generate.ts";
import { mapToAscii } from "../../../src/core/map/ascii.ts";
import {
  DIRECTIONS_8,
  cellAt,
  isPassable,
  objectBlockedSet,
  validateMap,
} from "../../../src/core/map/types.ts";
import type { GameMap, MapObject } from "../../../src/core/map/types.ts";

const SEEDS = Array.from({ length: 50 }, (_, k) => k + 1);
const cache = new Map<number, { map: GameMap; info: GenerateInfo }>();
function gen(seed: number): { map: GameMap; info: GenerateInfo } {
  let out = cache.get(seed);
  if (!out) {
    out = generateMapWithInfo(seed);
    cache.set(seed, out);
  }
  return out;
}

const DAY = 1500;
const COST: Record<string, number> = {
  grass: 100,
  steppe: 100,
  jungle: 100, // the Chieftain is native
  badlands: 125,
  wasteland: 150,
};

/** Walkable ground not covered by an object footprint. */
function walkable(map: GameMap): (x: number, y: number) => boolean {
  const blocked = objectBlockedSet(map);
  return (x, y) => {
    const c = cellAt(map, x, y);
    return c !== undefined && isPassable(c) && !blocked.has(y * map.width + x);
  };
}

/**
 * Movement cost from (sx, sy) under GAME_DESIGN 7.1 (8-way, diagonal x1.414,
 * road 75 when both cells have road, no corner cutting between impassable
 * cells). Independent of the generator's own implementation.
 */
function moveCosts(map: GameMap, sx: number, sy: number): Float64Array {
  const walk = walkable(map);
  const w = map.width;
  const dist = new Float64Array(w * map.height).fill(Infinity);
  dist[sy * w + sx] = 0;
  const open: number[] = [sy * w + sx];
  while (open.length > 0) {
    // Small maps: a linear-scan priority queue is fast enough.
    let k = 0;
    for (let m = 1; m < open.length; m++) {
      if (dist[open[m]!]! < dist[open[k]!]!) k = m;
    }
    const i = open.splice(k, 1)[0]!;
    const x = i % w;
    const y = Math.floor(i / w);
    for (const [dx, dy] of DIRECTIONS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!walk(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && !walk(x + dx, y) && !walk(x, y + dy)) {
        continue;
      }
      const a = cellAt(map, x, y)!;
      const b = cellAt(map, nx, ny)!;
      const base = a.road && b.road ? 75 : COST[b.terrain]!;
      const step = dx !== 0 && dy !== 0 ? Math.round(base * 1.414) : base;
      const j = ny * w + nx;
      if (dist[i]! + step < dist[j]!) {
        if (dist[j] === Infinity) open.push(j);
        dist[j] = dist[i]! + step;
      }
    }
  }
  return dist;
}

function heroStart(map: GameMap): MapObject {
  const h = map.objects.find((o) => o.kind === "hero-start");
  if (!h) throw new Error("no hero start");
  return h;
}

function playerTown(map: GameMap): MapObject {
  const t = map.objects.find((o) => o.kind === "town" && o.data["owner"] === 0);
  if (!t) throw new Error("no player town");
  return t;
}

describe("generateMap", { timeout: 60_000 }, () => {
  it("is deterministic and seed-dependent", () => {
    const a = JSON.stringify(generateMap(7));
    const b = JSON.stringify(generateMap(7));
    const c = JSON.stringify(generateMap(8));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(JSON.stringify(generateMap(7, { size: "S" }))).toBe(
      JSON.stringify(generateMap(7, { size: "S" })),
    );
  });

  it("makes the requested sizes", () => {
    for (const size of ["S", "M", "L"] as const) {
      const map = generateMap(3, { size });
      expect(map.width).toBe(DEFAULT_GEN_CONFIG.sizes[size]);
      expect(map.height).toBe(DEFAULT_GEN_CONFIG.sizes[size]);
      expect(validateMap(map)).toEqual([]);
    }
  });

  it("produces valid maps with nothing skipped (50 seeds, plus S and L)", () => {
    for (const seed of SEEDS) {
      const { map, info } = gen(seed);
      expect(validateMap(map), `seed ${seed}`).toEqual([]);
      expect(info.skipped, `seed ${seed}`).toEqual([]);
    }
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const size of ["S", "L"] as const) {
        const { map, info } = generateMapWithInfo(seed, { size });
        expect(validateMap(map), `${size} seed ${seed}`).toEqual([]);
        expect(info.skipped, `${size} seed ${seed}`).toEqual([]);
      }
    }
  });

  it("reaches every object entrance from the hero start (50 seeds)", () => {
    for (const seed of SEEDS) {
      const { map } = gen(seed);
      const h = heroStart(map);
      const cost = moveCosts(map, h.x, h.y);
      for (const o of map.objects) {
        expect(
          Number.isFinite(cost[o.y * map.width + o.x]),
          `seed ${seed}: ${o.id} unreachable`,
        ).toBe(true);
      }
      // No open ground is cut off either.
      const walk = walkable(map);
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          if (!walk(x, y)) continue;
          expect(
            Number.isFinite(cost[y * map.width + x]),
            `seed ${seed}: pocket at (${x},${y})`,
          ).toBe(true);
        }
      }
    }
  });

  it("keeps objects off obstacles and water", () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const { map } = gen(seed);
      for (const o of map.objects) {
        for (const [x, y] of [[o.x, o.y], ...o.blocked]) {
          expect(isPassable(cellAt(map, x!, y!)!), `seed ${seed} ${o.id}`).toBe(
            true,
          );
        }
      }
    }
  });

  it("seals zone borders except through guarded passes", () => {
    for (const seed of SEEDS.slice(0, 25)) {
      const { map, info } = gen(seed);
      const zones = map.zones!;
      const w = map.width;
      const guarded = new Set(
        map.objects
          .filter((o) => o.kind === "monster")
          .map((o) => o.y * w + o.x),
      );
      const corridor = new Set<number>();
      for (const p of info.passes) {
        expect(guarded.has(p.cell), `seed ${seed}: pass unguarded`).toBe(true);
        for (const c of p.cells) corridor.add(c);
      }
      // With the pass corridors closed, no step crosses a zone border.
      const walk = walkable(map);
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (!walk(x, y) || corridor.has(i)) continue;
          for (const [dx, dy] of DIRECTIONS_8) {
            const nx = x + dx;
            const ny = y + dy;
            if (!walk(nx, ny) || corridor.has(ny * w + nx)) continue;
            expect(
              zones[ny * w + nx],
              `seed ${seed}: leak (${x},${y})->(${nx},${ny})`,
            ).toBe(zones[i]);
          }
        }
      }
      // Every connection has a pass, and the start never touches the enemy.
      for (const c of info.connections) {
        expect(
          info.passes.some(
            (p) => (p.a === c.a && p.b === c.b) || (p.a === c.b && p.b === c.a),
          ),
          `seed ${seed}: connection ${c.a}-${c.b} without a pass`,
        ).toBe(true);
      }
    }
  });

  it("has smooth terrain regions and tidy water", () => {
    const minRegion = DEFAULT_GEN_CONFIG.terrain.minRegion;
    for (const seed of SEEDS.slice(0, 25)) {
      const { map } = gen(seed);
      const w = map.width;
      const seen = new Uint8Array(w * map.height);
      for (let s = 0; s < seen.length; s++) {
        if (seen[s]) continue;
        const t = map.cells[s]!.terrain;
        const stack = [s];
        seen[s] = 1;
        let size = 0;
        while (stack.length > 0) {
          const i = stack.pop()!;
          size++;
          const x = i % w;
          const y = Math.floor(i / w);
          for (const [dx, dy] of [
            [0, -1],
            [1, 0],
            [0, 1],
            [-1, 0],
          ] as const) {
            const c = cellAt(map, x + dx, y + dy);
            const j = (y + dy) * w + x + dx;
            if (c && c.terrain === t && !seen[j]) {
              seen[j] = 1;
              stack.push(j);
            }
          }
        }
        const min =
          t === "water" ? DEFAULT_GEN_CONFIG.water.minBody : minRegion;
        expect(
          size,
          `seed ${seed}: ${t} region at ${s}`,
        ).toBeGreaterThanOrEqual(min);
      }
    }
  });

  it("keeps deep water at least 2 cells from land", () => {
    for (const seed of SEEDS) {
      const { map } = gen(seed);
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          if (cellAt(map, x, y)!.deep !== true) continue;
          for (const [dx, dy] of DIRECTIONS_8) {
            const c = cellAt(map, x + dx, y + dy);
            expect(c === undefined || c.terrain === "water").toBe(true);
          }
        }
      }
    }
  });

  it("grows obstacles in clusters: few lone cells or corner-only joins", () => {
    for (const seed of SEEDS) {
      const { map } = gen(seed);
      const ob = (x: number, y: number): string =>
        cellAt(map, x, y)?.obstacle ?? "none";
      let lone = 0;
      let loneType = 0;
      let lonePeaks = 0;
      let diagonal = 0;
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const t = ob(x, y);
          if (t !== "none") {
            let any = 0;
            let same = 0;
            for (const [dx, dy] of DIRECTIONS_8) {
              const u = ob(x + dx, y + dy);
              if (u !== "none") any++;
              if (u === t) same++;
            }
            if (any === 0) lone++;
            if (same === 0) loneType++;
            if (same === 0 && t === "mountain") lonePeaks++;
          }
          const a = ob(x, y) !== "none";
          const b = ob(x + 1, y) !== "none";
          const c = ob(x, y + 1) !== "none";
          const d = ob(x + 1, y + 1) !== "none";
          if (x + 1 < map.width && y + 1 < map.height) {
            if ((a && d && !b && !c) || (b && c && !a && !d)) diagonal++;
          }
        }
      }
      // The lone-obstacle budget is for trees only: no lone peaks.
      expect(lonePeaks, `seed ${seed}: lone peaks`).toBe(0);
      expect(lone, `seed ${seed}: lone obstacles`).toBeLessThanOrEqual(
        DEFAULT_GEN_CONFIG.clusters.lonePeaks + 1,
      );
      expect(loneType, `seed ${seed}: lone of their type`).toBeLessThanOrEqual(
        DEFAULT_GEN_CONFIG.clusters.lonePeaks + 2,
      );
      expect(diagonal, `seed ${seed}: corner-only joins`).toBeLessThanOrEqual(
        3,
      );
    }
  });

  it("gives badlands and steppe ranges an interior (xaj.22)", () => {
    // Deep clusters: a share of the mountain clusters on badlands and
    // steppe are big round blocks, so their ranges have cells with rock all
    // round (where plateaus and tablelands fit). Seeds 1-10 before bead
    // xaj.22: 288 of 2,684 such cells (10.7%); after: 491 of 3,082 (16%).
    let cells = 0;
    let inner = 0;
    for (const seed of SEEDS.slice(0, 10)) {
      const { map } = gen(seed);
      const rock = (x: number, y: number): boolean =>
        x >= 0 &&
        y >= 0 &&
        x < map.width &&
        y < map.height &&
        map.cells[y * map.width + x]!.obstacle === "mountain";
      for (let y = 0; y < map.height; y++)
        for (let x = 0; x < map.width; x++) {
          const c = map.cells[y * map.width + x]!;
          if (!rock(x, y)) continue;
          if (c.terrain !== "badlands" && c.terrain !== "steppe") continue;
          cells++;
          let all = true;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
              if (!rock(x + dx, y + dy)) all = false;
          if (all) inner++;
        }
    }
    expect(inner / cells).toBeGreaterThan(0.14);
  });

  it("breaks straight range and ground edges (xaj.21, 50 seeds)", () => {
    // Straight runs of one boundary along a cell line: between Mountain
    // and anything else, and between two grounds on open land. Before bead
    // xaj.21 seeds 1-20 had 420 range runs of 4+ cells (24 of 8+) and 220
    // ground runs of 4+; the wobble pass keeps them rare and short.
    let edges = 0;
    let long = 0;
    let veryLong = 0;
    let ground = 0;
    let groundLong = 0;
    for (const seed of SEEDS) {
      const { map } = gen(seed);
      const c = (x: number, y: number) => map.cells[y * map.width + x]!;
      const runs = (
        label: (x0: number, y0: number, x1: number, y1: number) => string,
      ): number[] => {
        const out: number[] = [];
        for (const vertical of [true, false]) {
          const lines = vertical ? map.width : map.height;
          const along = vertical ? map.height : map.width;
          for (let l = 1; l < lines; l++) {
            let prev = "";
            let len = 0;
            for (let k = 0; k <= along; k++) {
              const e =
                k === along
                  ? ""
                  : vertical
                    ? label(l - 1, k, l, k)
                    : label(k, l - 1, k, l);
              if (e !== "" && e === prev) len++;
              else {
                if (prev !== "") out.push(len);
                len = e === "" ? 0 : 1;
              }
              prev = e;
            }
          }
        }
        return out;
      };
      const rock = runs((x0, y0, x1, y1) => {
        const a = c(x0, y0).obstacle === "mountain";
        const b = c(x1, y1).obstacle === "mountain";
        return a === b ? "" : a ? "A" : "B";
      });
      edges += rock.length;
      long += rock.filter((n) => n > 3).length;
      veryLong += rock.filter((n) => n > 8).length;
      const soil = runs((x0, y0, x1, y1) => {
        const a = c(x0, y0);
        const b = c(x1, y1);
        if (a.terrain === "water" || b.terrain === "water") return "";
        if (a.obstacle === "mountain" || b.obstacle === "mountain") return "";
        return a.terrain === b.terrain ? "" : `${a.terrain}>${b.terrain}`;
      });
      ground += soil.length;
      groundLong += soil.filter((n) => n > 3).length;
    }
    expect(long / edges).toBeLessThan(0.045);
    // A run beside a town yard or pass mouth, or along the map-edge frame,
    // may stay (bead xaj.22: three in 50 maps, all three along the frame,
    // at y = 2, y = 46 and x = 5).
    expect(veryLong).toBeLessThanOrEqual(3);
    expect(groundLong / ground).toBeLessThan(0.025);
  });

  it("builds every mountain from 2x2 blocks (50 seeds, plus S and L)", () => {
    // User decision (bead xaj.20): the smallest mountain is 2x2 tiles, so
    // every mountain cell lies in at least one all-mountain 2x2 window.
    const maps = [
      ...SEEDS.map((seed) => gen(seed).map),
      ...[1, 2, 3].map((seed) => generateMap(seed, { size: "S" })),
      ...[1, 2].map((seed) => generateMap(seed, { size: "L" })),
    ];
    for (const map of maps) {
      const m = (x: number, y: number): boolean =>
        cellAt(map, x, y)?.obstacle === "mountain";
      const bad: string[] = [];
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          if (!m(x, y)) continue;
          const ok = [
            [-1, -1],
            [0, -1],
            [-1, 0],
            [0, 0],
          ].some(
            ([ox = 0, oy = 0]) =>
              m(x + ox, y + oy) &&
              m(x + ox + 1, y + oy) &&
              m(x + ox, y + oy + 1) &&
              m(x + ox + 1, y + oy + 1),
          );
          if (!ok) bad.push(`(${x},${y})`);
        }
      }
      expect(bad, `seed ${map.seed} ${map.width}: cells outside a 2x2`).toEqual(
        [],
      );
    }
  });

  it("places the economy the design asks for", () => {
    for (const seed of SEEDS) {
      const { map } = gen(seed);
      const town = playerTown(map);
      const cost = moveCosts(map, town.x, town.y);
      const at = (o: MapObject): number => cost[o.y * map.width + o.x]!;
      const mines = (r: string): MapObject[] =>
        map.objects.filter(
          (o) => o.kind === "mine" && o.data["resource"] === r,
        );
      const pickups = (r: string): MapObject[] =>
        map.objects.filter(
          (o) =>
            o.kind === "pickup" &&
            o.data["resource"] === r &&
            o.data["chest"] !== true,
        );
      const label = `seed ${seed}`;
      expect(map.objects.filter((o) => o.kind === "town")).toHaveLength(2);
      expect(
        map.objects.find((o) => o.kind === "town" && o.data["owner"] === null)
          ?.data["garrison"],
      ).toBeDefined();
      const springs = mines("essence");
      expect(springs.length, label).toBeGreaterThanOrEqual(2);
      expect(springs.length, label).toBeLessThanOrEqual(3);
      expect(
        springs.filter((o) => at(o) <= 2 * DAY),
        label,
      ).toHaveLength(1);
      expect(
        mines("wood").filter((o) => at(o) <= DAY).length,
        label,
      ).toBeGreaterThanOrEqual(1);
      expect(
        mines("ore").filter((o) => at(o) <= DAY).length,
        label,
      ).toBeGreaterThanOrEqual(1);
      expect(
        pickups("wood").filter((o) => at(o) <= DAY).length,
        label,
      ).toBeGreaterThanOrEqual(2);
      expect(mines("gold").length, label).toBeGreaterThanOrEqual(1);
    }
  });

  it("guards mines outside the start zone, chests and passes", () => {
    for (const seed of SEEDS.slice(0, 25)) {
      const { map } = gen(seed);
      const zones = map.zones!;
      const town = playerTown(map);
      const startZone = zones[town.y * map.width + town.x];
      const monsters = map.objects.filter((o) => o.kind === "monster");
      const guarded = (o: MapObject): boolean =>
        monsters.some(
          (m) => Math.max(Math.abs(m.x - o.x), Math.abs(m.y - o.y)) <= 1,
        );
      for (const o of map.objects) {
        const outside = zones[o.y * map.width + o.x] !== startZone;
        if (
          (o.kind === "mine" && outside) ||
          (o.kind === "pickup" && o.data["chest"] === true)
        ) {
          expect(guarded(o), `seed ${seed}: ${o.id} unguarded`).toBe(true);
        }
      }
      for (const m of monsters) {
        expect(typeof m.data["creature"]).toBe("string");
        expect(m.data["count"]).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("joins the two towns by road", () => {
    for (const seed of SEEDS.slice(0, 25)) {
      const { map } = gen(seed);
      const towns = map.objects.filter((o) => o.kind === "town");
      const [a, b] = towns as [MapObject, MapObject];
      const w = map.width;
      const seen = new Set<number>([a.y * w + a.x]);
      const stack = [a.y * w + a.x];
      while (stack.length > 0) {
        const i = stack.pop()!;
        for (const [dx, dy] of DIRECTIONS_8) {
          const x = (i % w) + dx;
          const y = Math.floor(i / w) + dy;
          const j = y * w + x;
          if (cellAt(map, x, y)?.road && !seen.has(j)) {
            seen.add(j);
            stack.push(j);
          }
        }
      }
      expect(seen.has(b.y * w + b.x), `seed ${seed}`).toBe(true);
    }
  });

  it("generates a large map in under 300 ms", () => {
    generateMap(1, { size: "L" });
    const times: number[] = [];
    for (const seed of [11, 12, 13]) {
      const t0 = performance.now();
      generateMap(seed, { size: "L" });
      times.push(performance.now() - t0);
    }
    times.sort((p, q) => p - q);
    expect(times[1]).toBeLessThan(300);
  });

  it("prints an ASCII dump", () => {
    const text = mapToAscii(gen(1).map);
    const lines = text.split("\n");
    expect(lines).toHaveLength(48);
    expect(text).toContain("@");
    expect(text).toContain("&");
  });
});
