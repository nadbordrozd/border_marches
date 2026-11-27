// The adventure screen's hints and the tooltip placement (bead bzc.25):
// path cost and turns, battle estimates, income by source, end-of-turn
// warnings and the next-action hint, on small hand-built states.
import { describe, expect, it } from "vitest";
import {
  dailyIncome,
  endTurn,
  findPath,
  newGame,
} from "../../src/core/game/index.ts";
import type { GameState, Path } from "../../src/core/game/index.ts";
import { generateMap } from "../../src/core/map/generate.ts";
import {
  armyValue,
  battleOdds,
  buildableTowns,
  canAdvanceOnPlan,
  canAffordStep,
  END_TURN_MP_SHARE,
  endTurnWarnings,
  worthMovingOn,
  incomeBreakdown,
  nextActionHint,
  pathLine,
  pathSummary,
  SPENT_MP,
} from "../../src/ui/hints.ts";
import { placeTip } from "../../src/ui/tooltip.ts";
import { getCreature } from "../../src/data/creatures.ts";
import { STRAIT, boat, navalGame } from "../core/game/naval-helpers.ts";

function fresh(): GameState {
  return structuredClone(
    (cached ??= newGame(generateMap(7, { size: "S", players: 2 }), {
      players: [
        { kind: "human", faction: "humans" },
        { kind: "ai", faction: "undead" },
      ],
    })),
  );
}
let cached: GameState | null = null;

function hero(s: GameState) {
  const h = s.heroes.find((x) => x.alive && x.owner === 0);
  if (h === undefined) throw new Error("no hero");
  return h;
}

/** Turns the 8 cells round (x, y) to water; returns them. */
function boxIn(s: GameState, x: number, y: number): Array<[number, number]> {
  const ring: Array<[number, number]> = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const cell = s.map.cells[(y + dy) * s.map.width + x + dx];
      if (cell === undefined) continue;
      cell.terrain = "water";
      cell.obstacle = "none";
      cell.road = false;
      ring.push([x + dx, y + dy]);
    }
  return ring;
}

function step(x: number, cost: number, total: number, day: number) {
  return { x, y: 0, cost, total, day, attack: false };
}

describe("pathSummary", () => {
  it("counts today's movement left after the last step", () => {
    const s = fresh();
    const h = hero(s);
    h.mp = 1000;
    h.maxMp = 1500;
    const path: Path = {
      steps: [step(1, 100, 100, 0), step(2, 150, 250, 0)],
      total: 250,
    };
    const sum = pathSummary(path, h);
    expect(sum).toEqual({ cost: 250, days: 0, left: 750, attack: false });
    expect(pathLine(sum)).toBe("Today: 250 moves, 750 moves left");
  });

  it("counts the arrival day's movement for a walk of several days", () => {
    const s = fresh();
    const h = hero(s);
    h.mp = 200;
    h.maxMp = 1500;
    const path: Path = {
      steps: [
        step(1, 200, 200, 0),
        step(2, 1000, 1200, 1),
        step(3, 400, 1600, 2),
        step(4, 100, 1700, 2),
      ],
      total: 1700,
    };
    const sum = pathSummary(path, h);
    expect(sum.days).toBe(2);
    // Day 2 spends 1700 - 1200 = 500 of a fresh 1500.
    expect(sum.left).toBe(1000);
    expect(pathLine(sum)).toBe("In 2 days: 1700 moves, 1000 moves left");
  });

  it("says when the walk ends by picking something up (bead bzc.49)", () => {
    const s = fresh();
    const h = hero(s);
    h.mp = 1000;
    h.maxMp = 1500;
    const path: Path = {
      steps: [step(1, 300, 300, 0), { ...step(2, 0, 300, 0), pickup: true }],
      total: 300,
    };
    const sum = pathSummary(path, h);
    expect(sum.pickup).toBe(true);
    expect(pathLine(sum)).toBe("Today: 300 moves, then pick up");
    expect(nextActionHint(s, 0, h, sum)).toMatch(/pick it up/);
    const beside: Path = {
      steps: [{ ...step(2, 0, 0, 0), pickup: true }],
      total: 0,
    };
    expect(pathLine(pathSummary(beside, h))).toBe("Pick up: right next to you");
  });

  it("agrees with a real path on a generated map", () => {
    const s = fresh();
    const h = hero(s);
    let path: Path | null = null;
    for (let dx = 3; dx < 8 && path === null; dx++)
      path =
        findPath(s, h.id, h.x + dx, h.y) ?? findPath(s, h.id, h.x, h.y + dx);
    expect(path).not.toBeNull();
    const sum = pathSummary(path as Path, h);
    expect(sum.cost).toBe((path as Path).total);
    expect(sum.left).toBeGreaterThanOrEqual(0);
    expect(sum.left).toBeLessThanOrEqual(h.maxMp);
  });
});

describe("battleOdds", () => {
  it("rates armies by fight value with the hero's Attack and Defense", () => {
    const s = fresh();
    const h = hero(s);
    const own = armyValue(h.army);
    expect(own).toBeGreaterThan(0);
    const fv = getCreature("goblin").fightValue;
    const tiny = battleOdds(h, [{ creature: "goblin", count: 1 }]);
    expect(tiny.odds).toBe("easy");
    const huge = battleOdds(h, [
      { creature: "goblin", count: Math.ceil((own * 10) / fv) },
    ]);
    expect(huge.odds).toBe("deadly");
    expect(armyValue([null, { creature: "goblin", count: 3 }])).toBe(fv * 3);
  });
});

describe("incomeBreakdown", () => {
  it("splits the daily income into towns, mines and heroes", () => {
    const s = fresh();
    const mine = Object.values(s.mines)[0];
    if (mine !== undefined) mine.owner = 0;
    const total = dailyIncome(s, 0);
    const parts = incomeBreakdown(s, 0, total);
    expect(parts.towns.gold).toBeGreaterThan(0);
    if (mine !== undefined)
      expect(parts.mines[mine.resource]).toBeGreaterThan(0);
    for (const r of Object.keys(total) as Array<keyof typeof total>) {
      expect(parts.towns[r] + parts.mines[r] + parts.heroes[r]).toBe(total[r]);
    }
  });
});

describe("endTurnWarnings", () => {
  it("names unmoved heroes, movement left and towns that can build", () => {
    const s = fresh();
    const h = hero(s);
    const warnings = endTurnWarnings(s, 0);
    expect(warnings.some((w) => w.kind === "unmoved" && w.id === h.id)).toBe(
      true,
    );
    const towns = buildableTowns(s, 0);
    expect(towns.length).toBeGreaterThan(0);
    expect(warnings.filter((w) => w.kind === "can-build").length).toBe(
      towns.length,
    );
    h.mp = h.maxMp - 300;
    expect(endTurnWarnings(s, 0).find((w) => w.id === h.id)?.kind).toBe(
      "moves-left",
    );
    h.mp = SPENT_MP - 1;
    for (const t of Object.values(s.towns)) t.builtToday = true;
    expect(endTurnWarnings(s, 0)).toEqual([]);
  });

  it("warns only from END_TURN_MP_SHARE of the daily movement (bead 50f)", () => {
    const s = fresh();
    const h = hero(s);
    for (const t of Object.values(s.towns)) t.builtToday = true;
    h.maxMp = 2000;
    h.mp = 2000 * END_TURN_MP_SHARE - 1;
    expect(canAffordStep(s, h)).toBe(true);
    expect(worthMovingOn(s, h)).toBe(false);
    expect(endTurnWarnings(s, 0)).toEqual([]);
    h.mp = 2000 * END_TURN_MP_SHARE;
    expect(endTurnWarnings(s, 0)).toEqual([
      { kind: "moves-left", id: h.id, text: `${h.name} has 500 moves left` },
    ]);
    h.mp = 2000;
    expect(endTurnWarnings(s, 0)[0]?.kind).toBe("unmoved");
  });

  it("does not warn for a hero with no step it can take", () => {
    const s = fresh();
    const h = hero(s);
    for (const t of Object.values(s.towns)) t.builtToday = true;
    h.maxMp = 2000;
    h.mp = 1500;
    const ring = boxIn(s, h.x, h.y);
    expect(canAffordStep(s, h)).toBe(false);
    expect(endTurnWarnings(s, 0)).toEqual([]);
    // A planned path it can still advance along counts.
    const plan: Path = { steps: [{ ...step(0, 100, 100, 0) }], total: 100 };
    expect(canAdvanceOnPlan(h, plan)).toBe(true);
    expect(worthMovingOn(s, h, plan)).toBe(true);
    expect(endTurnWarnings(s, 0, { [h.id]: plan }).map((w) => w.id)).toEqual([
      h.id,
    ]);
    // ...but not one whose next step costs more than is left.
    const far: Path = { steps: [step(0, 1600, 1600, 1)], total: 1600 };
    expect(canAdvanceOnPlan(h, far)).toBe(false);
    expect(endTurnWarnings(s, 0, { [h.id]: far })).toEqual([]);
    // A neutral stack next to the hero is a step too (the attack is free).
    // (Orthogonal: a diagonal between two water cells would cut a corner.)
    const [ax, ay] = ring.find(([x, y]) => x === h.x || y === h.y) ?? [0, 0];
    const cell = s.map.cells[ay * s.map.width + ax];
    if (cell !== undefined) cell.terrain = "grass";
    const monster = Object.values(s.monsters)[0];
    if (monster === undefined) throw new Error("no monster");
    monster.x = ax;
    monster.y = ay;
    expect(canAffordStep(s, h)).toBe(true);
    expect(endTurnWarnings(s, 0).map((w) => w.id)).toEqual([h.id]);
  });

  it("does not warn when the cheapest neighbour costs more than is left", () => {
    const s = fresh();
    const h = hero(s);
    h.maxMp = 200;
    h.mp = 60;
    // 30% of the day left, but no step costs under 75 (a road).
    expect(h.mp >= h.maxMp * END_TURN_MP_SHARE).toBe(true);
    expect(canAffordStep(s, h)).toBe(false);
    expect(worthMovingOn(s, h)).toBe(false);
  });

  it("gives the next action for the selected hero", () => {
    const s = fresh();
    const h = hero(s);
    expect(nextActionHint(s, 0, h, null)).toMatch(/plan/);
    h.mp = 0;
    expect(nextActionHint(s, 0, h, null)).toMatch(/end the turn/);
    expect(
      nextActionHint(s, 0, h, { cost: 10, days: 0, left: 5, attack: true }),
    ).toMatch(/attack/);
    expect(nextActionHint(s, 0, undefined, null)).toMatch(/tavern/);
    const next = endTurn(s);
    if (next.ok && next.state.currentPlayer !== 0)
      expect(nextActionHint(next.state, 0, h, null)).toMatch(/other players/);
  });

  it("measures a hero afloat against its sea maximum (bead bzc.156)", () => {
    // The STRAIT (naval-helpers): the hero aboard a boat at (7, 5).
    const s = navalGame(STRAIT, [], [boat("b", 7, 5, 0)]);
    const h = s.heroes[0]!;
    h.x = 7;
    h.y = 5;
    h.maxMp = 1500;
    h.seaMaxMp = 3000;
    // 600 sea points: a quarter of the land maximum, a fifth of the sea's.
    h.mp = 600;
    expect(canAffordStep(s, h)).toBe(true);
    expect(worthMovingOn(s, h)).toBe(false);
    h.mp = 750;
    expect(worthMovingOn(s, h)).toBe(true);
    // A full day at sea is "not moved" at the sea maximum, not the land's.
    h.mp = 1500;
    expect(endTurnWarnings(s, 0)[0]?.kind).toBe("moves-left");
    h.mp = 3000;
    expect(endTurnWarnings(s, 0)[0]?.kind).toBe("unmoved");
  });
});

describe("placeTip", () => {
  it("puts the tip below-right of the pointer", () => {
    expect(placeTip(100, 100, 200, 80, 1280, 800)).toEqual({
      left: 114,
      top: 118,
    });
  });

  it("flips left and up near the right and bottom edges", () => {
    const p = placeTip(1250, 780, 200, 80, 1280, 800);
    expect(p.left).toBe(1250 - 14 - 200);
    expect(p.top).toBe(780 - 14 - 80);
  });

  it("stays inside a viewport smaller than the tip", () => {
    const p = placeTip(10, 10, 400, 300, 300, 200);
    expect(p.left).toBeGreaterThanOrEqual(6);
    expect(p.top).toBeGreaterThanOrEqual(6);
  });
});
