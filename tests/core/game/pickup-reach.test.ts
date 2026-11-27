/**
 * Pickups block their cell and are taken from a next cell (bead bzc.49,
 * RULES_V2 5.6). On generated and named maps a pickup may stand in the
 * way, but never as the only way through without being takeable from the
 * approach side: taking every pickup next to the ground a hero reaches,
 * over and over, opens all the ground it would reach with no pickups at
 * all. Plain connectivity: stacks, zones and entrances are ignored.
 */
import { describe, expect, it } from "vitest";
import {
  canEnter,
  moveContext,
  newGame,
  type GameState,
} from "../../../src/core/game/index.ts";
import { cutsCorner } from "../../../src/core/game/pathfinding.ts";
import { generateMap } from "../../../src/core/map/generate.ts";
import { NAMED_MAPS, buildNamedMap } from "../../../src/core/map/named.ts";
import {
  DIRECTIONS_8,
  inBounds,
  type GameMap,
} from "../../../src/core/map/types.ts";

/** Cells the hero reaches with `collected` taken, and the pickups beside. */
function flood(
  s: GameState,
  heroId: string,
  collected: readonly string[],
): { cells: Set<number>; beside: string[] } {
  const st = { ...s, collected: [...collected] };
  const hero = st.heroes.find((h) => h.id === heroId)!;
  const ctx = moveContext(st, hero, { ignoreFog: true });
  ctx.monsterAt.clear();
  ctx.enemyHeroAt.clear();
  ctx.friendAt.clear();
  const w = s.map.width;
  const start = hero.y * w + hero.x;
  const cells = new Set([start]);
  const stack = [start];
  while (stack.length > 0) {
    const c = stack.pop()!;
    const x = c % w;
    const y = (c - x) / w;
    for (const [dx, dy] of DIRECTIONS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(s.map, nx, ny)) continue;
      const n = ny * w + nx;
      if (cells.has(n) || !canEnter(ctx, nx, ny)) continue;
      if (cutsCorner(ctx, x, y, nx, ny)) continue;
      cells.add(n);
      stack.push(n);
    }
  }
  const beside: string[] = [];
  for (const [cell, id] of ctx.pickupAt) {
    const px = cell % w;
    const py = (cell - px) / w;
    const touches = DIRECTIONS_8.some(([dx, dy]) => {
      const x = px + dx;
      const y = py + dy;
      return (
        inBounds(s.map, x, y) &&
        cells.has(y * w + x) &&
        !cutsCorner(ctx, x, y, px, py)
      );
    });
    if (touches) beside.push(id);
  }
  return { cells, beside };
}

function checkMap(map: GameMap, players: number): void {
  const s = newGame(map, {
    players: Array.from({ length: players }, (_, i) => ({
      kind: "ai" as const,
      faction: i % 2 === 0 ? ("humans" as const) : ("undead" as const),
    })),
  });
  const everything = s.map.objects.map((o) => o.id);
  for (const hero of s.heroes) {
    const open = flood(s, hero.id, everything).cells;
    const taken: string[] = [];
    let reach = flood(s, hero.id, taken);
    for (let round = 0; round < 1000; round++) {
      const next = reach.beside.filter((id) => !taken.includes(id));
      if (next.length === 0) break;
      taken.push(...next);
      reach = flood(s, hero.id, taken);
    }
    expect(reach.cells.size).toBe(open.size);
  }
}

describe("pickups never seal ground off (bead bzc.49)", () => {
  for (const [seed, size] of [
    [3, "S"],
    [6, "S"],
    [7, "S"],
    [1, "SM"],
  ] as const) {
    it(`generated ${size} map, seed ${seed}`, () => {
      checkMap(generateMap(seed, { size, players: 2 }), 2);
    });
  }
  for (const def of NAMED_MAPS) {
    it(`named map ${def.id}`, () => {
      const map = buildNamedMap(def);
      const starts = map.objects.filter((o) => o.kind === "hero-start").length;
      checkMap(map, Math.max(2, Math.min(4, starts)));
    });
  }
});
