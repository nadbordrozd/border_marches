/**
 * Bead bzc.79: every guard, visit entrance and pickup that the hero can get
 * to from its start over several walks (fighting stacks, visiting and
 * taking pickups on the way) gets a plan from a click: the UI path code
 * (findPath with PLAN_OPTIONS, and mapAction) never says "Can't reach" for
 * it, and the plan is a walk moveHeroAlong accepts.
 *
 * Before the fix a stack standing in a one-cell gap, or a visit or pickup
 * in a one-cell corridor, made everything beyond it unreachable to clicks
 * on every generated map (seed 99 S: the Ore Pit behind 24 Gremlins).
 */
import { describe, expect, it } from "vitest";
import { HEAVY_TIMEOUT } from "../timeouts.ts";
import {
  findPath,
  moveContext,
  moveHeroAlong,
  newGame,
  type GameState,
} from "../../src/core/game/index.ts";
import {
  cutsCorner,
  isImpassableCell,
} from "../../src/core/game/pathfinding.ts";
import { generateMap, type MapSize } from "../../src/core/map/generate.ts";
import { DIRECTIONS_8, inBounds } from "../../src/core/map/types.ts";
import { playableFactions } from "../../src/data/factions.ts";
import { PLAN_OPTIONS, mapAction } from "../../src/ui/map-clicks.ts";

/** A new game as the setup screen makes it, everything explored. */
function game(seed: number, size: MapSize, players: 2 | 3 | 4): GameState {
  const map = generateMap(seed, { size, players, activePlayers: players });
  const factions = playableFactions().map((f) => f.id);
  const s = newGame(map, {
    players: Array.from({ length: players }, (_, i) => ({
      kind: i === 0 ? ("human" as const) : ("ai" as const),
      faction: factions[i % factions.length] ?? "humans",
    })),
  });
  for (const p of s.players) p.explored.fill(true);
  return s;
}

/**
 * Cells the hero can get to over any number of walks: open ground, with
 * neutral stacks beaten, visits made and pickups taken on the way (other
 * heroes move away). The game's step rules: 8 directions, no corner cuts.
 */
function groundReach(s: GameState, heroId: string): Set<number> {
  const hero = s.heroes.find((h) => h.id === heroId);
  if (hero === undefined) throw new Error("no hero");
  const ctx = moveContext(s, hero, { ignoreFog: true });
  const w = s.map.width;
  const open = (x: number, y: number) =>
    ctx.pickupAt.has(y * w + x) || !isImpassableCell(ctx, x, y);
  const start = hero.y * w + hero.x;
  const seen = new Set([start]);
  const stack = [start];
  for (let c = stack.pop(); c !== undefined; c = stack.pop()) {
    const x = c % w;
    const y = (c - x) / w;
    for (const [dx, dy] of DIRECTIONS_8) {
      const nx = x + dx;
      const ny = y + dy;
      const n = ny * w + nx;
      if (!inBounds(s.map, nx, ny) || seen.has(n) || !open(nx, ny)) continue;
      if (cutsCorner(ctx, x, y, nx, ny)) continue;
      seen.add(n);
      stack.push(n);
    }
  }
  return seen;
}

const TARGET_KINDS = new Set([
  "monster",
  "pickup",
  "mine",
  "town",
  "dwelling",
  "site",
  "bank",
  "artifact",
  "teleport",
]);

/** Targets the ground reaches that a click cannot plan to. */
function unplannable(seed: number, size: MapSize, players: 2 | 3 | 4) {
  const s = game(seed, size, players);
  const hero = s.heroes.find((h) => h.alive && h.owner === 0);
  if (hero === undefined) throw new Error("no hero");
  const reach = groundReach(s, hero.id);
  const w = s.map.width;
  const collected = new Set(s.collected);
  const out: string[] = [];
  let checked = 0;
  for (const o of s.map.objects) {
    if (!TARGET_KINDS.has(o.kind) || collected.has(o.id)) continue;
    const m = o.kind === "monster" ? s.monsters[o.id] : undefined;
    if (o.kind === "monster" && m === undefined) continue;
    const x = m?.x ?? o.x;
    const y = m?.y ?? o.y;
    if ((x === hero.x && y === hero.y) || !reach.has(y * w + x)) continue;
    // An own hero standing there is selected by a click, not walked to.
    if (
      s.heroes.some((h) => h.alive && h.owner === 0 && h.x === x && h.y === y)
    )
      continue;
    checked++;
    const where = `${size}/${players}p seed ${seed}: ${o.id} at (${x},${y})`;
    const path = findPath(s, hero.id, x, y, PLAN_OPTIONS);
    if (path === null || path.steps.length === 0) {
      out.push(`${where}: no plan`);
      continue;
    }
    const action = mapAction({
      state: s,
      player: 0,
      heroId: hero.id,
      x,
      y,
      planned: null,
      aiming: null,
    });
    if (action.cursor === "blocked") out.push(`${where}: ${action.text}`);
    const walk = moveHeroAlong(s, hero.id, path.steps);
    if (!walk.ok) out.push(`${where}: walk refused (${walk.message})`);
  }
  return { out, checked };
}

const MAPS: Array<[MapSize, 2 | 3 | 4, number[]]> = [
  // The bead's evidence: seed 99 (Ore Pit) and seed 4242 (Essence Spring).
  ["S", 3, [99, 4242]],
  ["S", 2, [1, 2, 3, 4, 5, 6, 7, 8]],
  ["S", 3, [11, 12, 13, 14, 15, 16]],
  ["S", 4, [21, 22, 23, 24]],
  ["M", 2, [31, 32]],
  ["M", 3, [41, 42]],
  ["M", 4, [51]],
  ["L", 4, [61]],
];

describe(
  "every target the hero can get to gets a plan (bead bzc.79)",
  { timeout: HEAVY_TIMEOUT },
  () => {
    for (const [size, players, seeds] of MAPS) {
      it(`size ${size}, ${players} players, seeds ${seeds.join(" ")}`, () => {
        const failures: string[] = [];
        for (const seed of seeds) {
          const { out, checked } = unplannable(seed, size, players);
          // Guards the test itself: a start that reaches nothing proves nothing.
          expect(checked, `${size} seed ${seed}`).toBeGreaterThan(10);
          failures.push(...out);
        }
        expect(failures.slice(0, 10)).toEqual([]);
      });
    }
  },
);
