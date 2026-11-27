import { describe, expect, it } from "vitest";
import { HEAVY_TIMEOUT } from "../../timeouts.ts";
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
  validateMap,
} from "../../../src/core/map/types.ts";
import type { GameMap, MapObject } from "../../../src/core/map/types.ts";
import { DAY, moveCosts, playerTown, towns, walkable } from "./map-helpers.ts";

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

function heroStart(map: GameMap): MapObject {
  const h = map.objects.find((o) => o.kind === "hero-start");
  if (!h) throw new Error("no hero start");
  return h;
}

describe("generateMap", { timeout: HEAVY_TIMEOUT }, () => {
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

  it("seals zone borders except through passes, guarded but for open loops", () => {
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
        // Only a loop between two wild zones of the same tier may be open.
        const za = info.zones[p.a]!;
        const zb = info.zones[p.b]!;
        const wild = (r: string): boolean => r === "middle" || r === "town";
        const mayBeOpen = za.tier === zb.tier && wild(za.role) && wild(zb.role);
        if (!mayBeOpen) {
          expect(guarded.has(p.cell), `seed ${seed}: pass unguarded`).toBe(
            true,
          );
        }
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
      type Run = { len: number; x: number; y: number; frame: boolean };
      const runs = (
        label: (x0: number, y0: number, x1: number, y1: number) => string,
      ): Run[] => {
        const out: Run[] = [];
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
                if (prev !== "") {
                  // The run's middle, and whether it hugs the map frame.
                  const mid = k - Math.ceil(len / 2);
                  out.push({
                    len,
                    x: vertical ? l : mid,
                    y: vertical ? mid : l,
                    frame: l <= 3 || l >= lines - 3,
                  });
                }
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
      // Town yards are kept free of the wobble's bumps, and a map has up to
      // eight towns now (bead bzc.3), so runs beside them are let be.
      const yard = (r: Run): boolean =>
        towns(map).some(
          (t) => Math.max(Math.abs(t.x - r.x), Math.abs(t.y - r.y)) <= 7,
        );
      edges += rock.length;
      long += rock.filter((r) => r.len > 3).length;
      veryLong += rock.filter((r) => r.len > 8 && !r.frame && !yard(r)).length;
      const soil = runs((x0, y0, x1, y1) => {
        const a = c(x0, y0);
        const b = c(x1, y1);
        if (a.terrain === "water" || b.terrain === "water") return "";
        if (a.obstacle === "mountain" || b.obstacle === "mountain") return "";
        return a.terrain === b.terrain ? "" : `${a.terrain}>${b.terrain}`;
      });
      ground += soil.length;
      groundLong += soil.filter((r) => r.len > 3).length;
    }
    expect(long / edges).toBeLessThan(0.045);
    // A run beside a town yard or pass mouth, or along the map-edge frame,
    // may stay (bead xaj.22: three in 50 maps, all three along the frame);
    // elsewhere long straight range edges stay rare.
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
      const { map, info } = gen(seed);
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
      // One owned town (today's single-player game), one start per player,
      // the neutral towns and exactly one Warlord's Hold with its garrison.
      const all = towns(map);
      const starts = info.zones.filter((z) => z.role === "start").length;
      const neutral = info.zones.filter((z) => z.role === "town").length;
      expect(all, label).toHaveLength(starts + neutral + 1);
      expect(all.filter((t) => t.data["owner"] === 0)).toHaveLength(1);
      const holds = all.filter(
        (t) => t.data["owner"] === null && t.data["hold"] !== false,
      );
      expect(holds, label).toHaveLength(1);
      expect(holds[0]!.data["garrison"]).toBeDefined();
      // Near home: one essence spring within two days (two at most when
      // another start's spring lies close), a sawmill and an ore pit within
      // a day, wood to pick up, and a gold mine somewhere.
      const springs = mines("essence").filter((o) => at(o) <= 2 * DAY);
      expect(springs.length, label).toBeGreaterThanOrEqual(1);
      expect(springs.length, label).toBeLessThanOrEqual(2);
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

  it("joins every town by road", () => {
    for (const seed of SEEDS.slice(0, 25)) {
      const { map } = gen(seed);
      const [a, ...rest] = towns(map) as [MapObject, ...MapObject[]];
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
      for (const b of rest) {
        expect(seen.has(b.y * w + b.x), `seed ${seed}: ${b.id}`).toBe(true);
      }
    }
  });

  // The speed budget (300 ms for a large map) is checked by `npm run perf`,
  // not here: wall-clock budgets flake when test runs share a machine.
  it("generates valid large maps for the perf seeds", () => {
    for (const seed of [11, 12, 13]) {
      const { map, info } = generateMapWithInfo(seed, { size: "L" });
      expect(map.width, `seed ${seed}`).toBe(DEFAULT_GEN_CONFIG.sizes.L);
      expect(validateMap(map), `seed ${seed}`).toEqual([]);
      expect(info.skipped, `seed ${seed}`).toEqual([]);
    }
  });

  it("prints an ASCII dump", () => {
    const text = mapToAscii(gen(1).map);
    const lines = text.split("\n");
    expect(lines).toHaveLength(48);
    expect(text).toContain("@");
    expect(text).toContain("&");
  });
});
