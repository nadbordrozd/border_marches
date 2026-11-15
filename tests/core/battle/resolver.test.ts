import { describe, expect, it } from "vitest";
import { CREATURES } from "../../../src/data/creatures.ts";
import type { CreatureId } from "../../../src/data/types.ts";
import type { BattleSetup as GameBattleSetup } from "../../../src/core/game/battle.ts";
import {
  battleStatsFromCreature,
  createBattleResolver,
  engineSetupFromGame,
  gameResultFromEngine,
} from "../../../src/core/battle/index.ts";
import { ALL_CREATURES } from "./fixtures.ts";

function gameSetup(
  attacker: [CreatureId, number][],
  defender: [CreatureId, number][],
  defenseBonus = 0,
): GameBattleSetup {
  return {
    seed: 42,
    terrain: "grass",
    attacker: {
      owner: 0,
      hero: { id: "hero-1", attack: 2, defense: 2 },
      stacks: attacker.map(([creature, count]) => ({ creature, count })),
      defenseBonus: 0,
    },
    defender: {
      owner: null,
      hero: null,
      stacks: defender.map(([creature, count]) => ({ creature, count })),
      defenseBonus,
    },
    battle: { kind: "monster", objectId: "m1", heroId: "hero-1" },
  };
}

describe("data adapter", () => {
  it("builds engine stats from CREATURES matching the documented numbers", () => {
    for (const fixture of ALL_CREATURES) {
      const def = CREATURES[fixture.id as CreatureId];
      const stats = battleStatsFromCreature(def);
      expect({
        ...stats,
        name: undefined,
        shots: stats.shots || undefined,
      }).toEqual({
        ...fixture,
        name: undefined,
        shots: fixture.shots,
      });
    }
  });

  it("maps a game setup: slots in order, hero stats, defense bonus", () => {
    const s = engineSetupFromGame(
      gameSetup(
        [
          ["caveman", 18],
          ["spitter", 6],
        ],
        [["orc-brute", 7]],
        2,
      ),
    );
    expect(s.seed).toBe(42);
    expect(s.attacker.hero).toEqual({ attack: 2, defense: 2 });
    expect(
      s.attacker.stacks.map((x) => [x.creature.id, x.count, x.slot]),
    ).toEqual([
      ["caveman", 18, 0],
      ["spitter", 6, 1],
    ]);
    expect(s.defender.hero).toBeNull();
    expect(s.defender.defenseBonus).toBe(2);
  });
});

describe("createBattleResolver", () => {
  it("returns survivors per input stack with an empty loser", () => {
    const resolve = createBattleResolver();
    const setup = gameSetup(
      [
        ["caveman", 18],
        ["spitter", 6],
      ],
      [
        ["goblin", 5],
        ["goblin", 5],
        ["goblin", 5],
      ],
    );
    const r = resolve(setup);
    expect(r).toEqual(resolve(setup)); // deterministic
    expect(r.attacker).toHaveLength(2);
    expect(r.defender).toHaveLength(3);
    const total = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
    expect(r.winner).toBe("attacker");
    expect(total(r.defender)).toBe(0);
    expect(total(r.attacker)).toBeGreaterThan(0);
    r.attacker.forEach((n, i) => {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(setup.attacker.stacks[i]!.count);
    });
  });

  it("lets a strong garrison win", () => {
    const r = createBattleResolver()(
      gameSetup([["caveman", 5]], [["ogre", 8]], 2),
    );
    expect(r.winner).toBe("defender");
    expect(r.attacker).toEqual([0]);
    expect(r.defender[0]).toBeGreaterThan(0);
  });

  it("turns a round-limit draw into a defender win with no attacker survivors", () => {
    const setup = gameSetup([["caveman", 5]], [["goblin", 3]]);
    const r = gameResultFromEngine(setup, {
      winner: null,
      reason: "roundLimit",
      rounds: 101,
      stacks: [
        {
          id: "a0",
          side: "attacker",
          slot: 0,
          creatureId: "caveman",
          initialCount: 5,
          count: 4,
        },
        {
          id: "d0",
          side: "defender",
          slot: 0,
          creatureId: "goblin",
          initialCount: 3,
          count: 2,
        },
      ],
      killedHp: { attacker: 8, defender: 10 },
    });
    expect(r).toEqual({ winner: "defender", attacker: [0], defender: [2] });
  });
});
