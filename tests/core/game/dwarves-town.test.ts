/**
 * The Deepforge's town in the game (FACTION_DWARVES.md section 9): the
 * Deep Shaft's ore, the Repair Yard after a won battle, and Stoke and The
 * Great Boiler reaching the battles of their owner's armies.
 */

import { describe, expect, it } from "vitest";
import {
  createBattle,
  engineSetupFromGame,
  getStack,
} from "../../../src/core/battle/index.ts";
import {
  applyBattleResult,
  battleSetup,
} from "../../../src/core/game/battle.ts";
import { build, buildStatus } from "../../../src/core/game/town.ts";
import { dailyIncome } from "../../../src/core/game/turn.ts";
import { newGame } from "../../../src/core/game/newGame.ts";
import type { GameState } from "../../../src/core/game/types.ts";
import { buildMap, field, heroStart, monster, ok, town } from "./helpers.ts";

const RICH = { gold: 100000, wood: 500, ore: 500, essence: 100 };

function deepGame(): GameState {
  const map = buildMap(field(10, 10), [
    town("t0", 1, 1, 0),
    heroStart(1, 2, 0),
    town("t1", 8, 8, 1),
    heroStart(8, 7, 1),
    monster("m", 2, 1, "orc-brute", 6),
  ]);
  const s = newGame(map, {
    players: [
      { kind: "human", faction: "dwarves" },
      { kind: "ai", faction: "goblins" },
    ],
  });
  return {
    ...s,
    heroes: s.heroes.map((h) => (h.owner === 0 ? { ...h, x: 1, y: 1 } : h)),
    players: s.players.map((p) =>
      p.id === 0 ? { ...p, resources: { ...RICH } } : p,
    ),
  };
}

/** Builds in t0, one a day. */
function buildAll(s0: GameState, ids: readonly string[]): GameState {
  let s = s0;
  for (const id of ids) {
    s = ok(build(s, "t0", id)).state;
    s = {
      ...s,
      towns: { ...s.towns, t0: { ...s.towns["t0"]!, builtToday: false } },
    };
  }
  return s;
}

/** Player 0's hero with this army, about to fight the monster. */
function intoBattle(
  s: GameState,
  army: ReadonlyArray<{ creature: string; count: number }>,
): GameState {
  return {
    ...s,
    heroes: s.heroes.map((h) =>
      h.owner === 0
        ? {
            ...h,
            army: h.army.map((_, i) => (army[i] as never) ?? null),
          }
        : h,
    ),
    pendingBattle: {
      kind: "monster",
      objectId: "m",
      heroId: s.heroes.find((h) => h.owner === 0)!.id,
    },
  };
}

describe("The Deep Shaft", () => {
  it("adds 1 ore a day", () => {
    const s = deepGame();
    const before = dailyIncome(s, 0);
    const after = dailyIncome(buildAll(s, ["marketplace", "deep-shaft"]), 0);
    expect(after.ore - before.ore).toBe(1);
    expect(after.gold).toBe(before.gold);
  });
});

describe("The Repair Yard", () => {
  const army = [
    { creature: "steam-tank", count: 6 },
    { creature: "tinker", count: 20 },
    { creature: "mortar", count: 2 },
  ];
  const yard = () =>
    buildAll(deepGame(), [
      "rivet-range",
      "fort-1",
      "gyro-hangar",
      "boiler-works",
      "repair-yard",
    ]);

  function win(s: GameState, survivors: number[]): GameState {
    const setup = battleSetup(s)!;
    expect(setup.attacker.stacks.map((x) => x.creature)).toEqual([
      "steam-tank",
      "tinker",
      "mortar",
    ]);
    return ok(
      applyBattleResult(s, {
        winner: "attacker",
        attacker: survivors,
        defender: setup.defender.stacks.map(() => 0),
      }),
    ).state;
  }

  const counts = (s: GameState) =>
    s.heroes
      .find((h) => h.owner === 0)!
      .army.filter((x) => x !== null)
      .map((x) => [x!.creature, x!.count]);

  it("gives back a third of the machines lost in a won battle, rounded down", () => {
    // Lost: 3 Tanks (1 back), 9 Tinkers (not machines), 1 Mortar (none).
    const s = win(intoBattle(yard(), army), [3, 11, 1]);
    expect(counts(s)).toEqual([
      ["steam-tank", 4],
      ["tinker", 11],
      ["mortar", 1],
    ]);
  });

  it("nothing without the Repair Yard", () => {
    const s = win(intoBattle(deepGame(), army), [3, 11, 1]);
    expect(counts(s)).toEqual([
      ["steam-tank", 3],
      ["tinker", 11],
      ["mortar", 1],
    ]);
  });
});

describe("Stoke and The Great Boiler", () => {
  it("ride on the owner's natives into battle: Stoke, and Steam 1 at the start", () => {
    let s = buildAll(deepGame(), [
      "town-hall",
      "fort-1",
      "marketplace",
      "city-hall",
    ]);
    expect(buildStatus(s, "t0", "the-great-boiler")).toBe("keystone");
    s = {
      ...s,
      heroes: s.heroes.map((h) =>
        h.owner === 0 ? { ...h, backpack: [...h.backpack, "keystone"] } : h,
      ),
    };
    s = buildAll(s, ["the-great-boiler"]);
    const fight = intoBattle(s, [
      { creature: "tinker", count: 10 },
      { creature: "goblin", count: 10 },
    ]);
    const setup = engineSetupFromGame(battleSetup(fight)!);
    expect(setup.attacker.birthright).toBe("stoke");
    const [tinkers, goblins] = setup.attacker.stacks;
    expect(tinkers?.native).toBe(true);
    expect(tinkers?.creature.abilities).toContain("the-great-boiler");
    expect(goblins?.native).toBeUndefined();
    expect(goblins?.creature.abilities).not.toContain("the-great-boiler");
    const b = createBattle({ ...setup, obstacles: [] }).state;
    const steam = (id: string) =>
      getStack(b, id).conditions.find((c) => c.kind === "steam")?.size ?? null;
    expect([steam("a0"), steam("a1")]).toEqual([1, null]);
    expect(getStack(b, "a0").creature.abilities).toContain("stoke");
  });
});
