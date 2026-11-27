/**
 * Bead bzc.110: no building stands in a way. The user: "these buildings
 * should be placed such that there is always a path around them. they
 * shouldn't obstruct passages (even if it would be possible to pass by
 * stepping on the shrine first). Stuff that you pick up such as resources
 * are exempt from this." And: "there can be some special pickupable item
 * that has a surprise artifact in it but the usual artifact on adventure
 * map should be fully visible."
 *
 * The check here uses the pathfinder's own rules (moveContext,
 * isImpassableCell and cutsCorner in src/core/game/pathfinding.ts): every
 * two open cells a hero reaches with the buildings' entrances open are
 * joined by a walk that steps on no building (pickups count as taken,
 * guards and gates as passed, towns are destinations).
 */
import { describe, expect, it } from "vitest";
import {
  isPickup,
  moveContext,
  newGame,
} from "../../../src/core/game/index.ts";
import {
  cutsCorner,
  isImpassableCell,
} from "../../../src/core/game/pathfinding.ts";
import { generateMapWithInfo } from "../../../src/core/map/generate.ts";
import type { MapSize } from "../../../src/core/map/generate.ts";
import { isMystery } from "../../../src/core/map/mystery.ts";
import { NAMED_MAPS, buildNamedMap } from "../../../src/core/map/named.ts";
import {
  findObstructions,
  isBuilding,
  keepWaysRound,
  sealingPickups,
} from "../../../src/core/map/passages.ts";
import type { GameMap, MapObject } from "../../../src/core/map/types.ts";
import { buildMap, heroStart, pickup } from "../game/helpers.ts";

const CASES: Array<[MapSize, number[]]> = [
  ["S", [1, 2, 3, 4, 5, 6, 7, 8]],
  ["M", [1, 2, 3, 4, 5, 6]],
  ["L", [1, 2, 3]],
];

/**
 * Open cells cut off from the rest of their ground when the buildings'
 * entrances count as walls, by the pathfinder's rules: "x,y" of one cell
 * of each such part beyond the first, per part of the open ground.
 */
function cutOff(map: GameMap): string[] {
  const state = newGame(map);
  const hero = state.heroes[0];
  if (hero === undefined) throw new Error("no hero");
  const ctx = moveContext(state, hero, { ignoreFog: true });
  // Pickups are taken and gates passed: neither walls a way here.
  for (const o of map.objects) {
    if (isPickup(o) || o.kind === "gate")
      ctx.objectBlocked.delete(o.y * map.width + o.x);
  }
  const w = map.width;
  const towns = new Set(
    map.objects.filter((o) => o.kind === "town").map((o) => o.y * w + o.x),
  );
  const building = (i: number): boolean =>
    ctx.buildings.has(i) && !towns.has(i);
  const flood = (avoid: boolean): Int32Array => {
    const label = new Int32Array(w * map.height).fill(-1);
    let next = 0;
    for (let s = 0; s < label.length; s++) {
      const sx = s % w;
      const sy = (s - sx) / w;
      if (label[s] !== -1 || isImpassableCell(ctx, sx, sy)) continue;
      if (avoid && building(s)) continue;
      label[s] = next;
      const stack = [s];
      while (stack.length > 0) {
        const i = stack.pop() as number;
        const x = i % w;
        const y = (i - x) / w;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= map.height) continue;
            const j = ny * w + nx;
            if (label[j] !== -1 || isImpassableCell(ctx, nx, ny)) continue;
            if (avoid && building(j)) continue;
            if (cutsCorner(ctx, x, y, nx, ny)) continue;
            label[j] = next;
            stack.push(j);
          }
      }
      next++;
    }
    return label;
  };
  const before = flood(false);
  const after = flood(true);
  const first = new Map<number, number>();
  const out: string[] = [];
  for (let i = 0; i < before.length; i++) {
    const a = after[i] ?? -1;
    if (a < 0) continue;
    const b = before[i] ?? -1;
    const seen = first.get(b);
    if (seen === undefined) first.set(b, a);
    else if (seen !== a && !out.includes(`part ${a}`)) {
      out.push(`part ${a}`, `${i % w},${Math.floor(i / w)}`);
    }
  }
  return out.filter((s) => !s.startsWith("part "));
}

describe("buildings keep a way round (bzc.110)", { timeout: 120_000 }, () => {
  it("never stand in a way on random maps", () => {
    for (const [size, seeds] of CASES) {
      for (const seed of seeds) {
        const { map } = generateMapWithInfo(seed, { size });
        expect(cutOff(map), `${size}${seed}`).toEqual([]);
        expect(findObstructions(map).blockers, `${size}${seed}`).toEqual([]);
      }
    }
  });

  it("never stand in a way on the named maps", () => {
    for (const def of NAMED_MAPS) {
      const map = buildNamedMap(def);
      expect(cutOff(map), def.id).toEqual([]);
      expect(findObstructions(map).blockers, def.id).toEqual([]);
    }
  });

  const shrine = (x: number, y: number): MapObject => ({
    id: "mana-well-1",
    kind: "site",
    x,
    y,
    footprint: { w: 1, h: 1 },
    blocked: [],
    data: { type: "mana-well", value: 800 },
  });

  it("finds a shrine that fills a passage, not a pickup", () => {
    // Two rooms joined by the one cell (3, 1) between two mountains.
    const rows = ["gggMggg", "ggggggg", "gggMggg"];
    const corridor = buildMap(rows, [heroStart(0, 0), shrine(3, 1)]);
    expect(isBuilding(shrine(3, 1))).toBe(true);
    expect(findObstructions(corridor).blockers).toEqual(["mana-well-1"]);
    expect(cutOff(corridor)).not.toEqual([]);
    const pile = buildMap(rows, [
      heroStart(0, 0),
      pickup("pile", 3, 1, { resource: "wood", amount: 5 }),
    ]);
    expect(findObstructions(pile).blockers).toEqual([]);
    expect(cutOff(pile)).toEqual([]);
  });

  it("moves a shrine out of a passage, aside into the room", () => {
    const rows = ["ggggMgggg", "ggggggggg", "ggggMgggg", "ggggMgggg"];
    const map = buildMap(rows, [heroStart(0, 0), shrine(4, 1)]);
    expect(findObstructions(map).blockers).toEqual(["mana-well-1"]);
    const report = keepWaysRound(map);
    expect(report.left).toEqual([]);
    expect(report.moved.map((m) => m.id)).toEqual(["mana-well-1"]);
    expect(findObstructions(map).blockers).toEqual([]);
    expect(cutOff(map)).toEqual([]);
    expect(sealingPickups(map).size).toBe(0);
  });
});

describe("Mystery Bags on random maps (bzc.110)", { timeout: 120_000 }, () => {
  it("lie among the loose artifacts, most of which stay in full view", () => {
    let bags = 0;
    let loose = 0;
    for (const [size, seeds] of CASES) {
      for (const seed of seeds) {
        const { map } = generateMapWithInfo(seed, { size });
        for (const o of map.objects) {
          if (isMystery(o)) {
            bags++;
            expect(isPickup(o), o.id).toBe(true);
            expect(typeof o.data["artifact"], o.id).toBe("string");
          } else if (o.data["type"] === "loose-artifact") loose++;
          // No quest names a bag or the artifact it hides.
          const quest = o.data["quest"] as
            { object?: string; artifact?: string } | undefined;
          if (quest?.object !== undefined) {
            const target = map.objects.find((t) => t.id === quest.object);
            expect(target && isMystery(target), o.id).toBeFalsy();
          }
          if (quest?.artifact !== undefined) {
            const hidden = map.objects.some(
              (t) => isMystery(t) && t.data["artifact"] === quest.artifact,
            );
            const shown = map.objects.some(
              (t) => !isMystery(t) && t.data["artifact"] === quest.artifact,
            );
            expect(!hidden || shown, o.id).toBe(true);
          }
        }
      }
    }
    expect(bags).toBeGreaterThan(5);
    expect(bags).toBeLessThan(loose);
  });

  it("are not on the named maps (their edits name artifacts by id)", () => {
    for (const def of NAMED_MAPS) {
      expect(buildNamedMap(def).objects.some(isMystery), def.id).toBe(false);
    }
  });
});
