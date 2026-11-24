import { STRAY_ABILITY_TEXT } from "../../src/data/strays.ts";
import { describe, expect, it } from "vitest";
import { ABILITIES } from "../../src/data/abilities.ts";
import {
  BUILDING_IDS,
  BUILDINGS,
  dwellingFor,
} from "../../src/data/buildings.ts";
import {
  CREATURES,
  LOST_WORLD_CREATURE_IDS,
  LOST_WORLD_CREATURES,
  getCreature,
  isRanged,
} from "../../src/data/creatures.ts";
import { MINES, STARTING_RESOURCES } from "../../src/data/economy.ts";
import { CHIEFTAIN, xpCurve } from "../../src/data/hero.ts";
import {
  HOLD_GARRISON,
  NEUTRAL_CREATURE_IDS,
  NEUTRAL_CREATURES,
} from "../../src/data/neutrals.ts";
import type {
  LostWorldBuildingId as BuildingId,
  ResourceAmounts,
} from "../../src/data/types.ts";
import { fightValue } from "../../src/core/game/progression.ts";
import {
  addResources,
  emptyResources,
  scaleResources,
} from "../../src/core/game/resources.ts";

function sum(costs: ResourceAmounts[]) {
  return costs.reduce<ReturnType<typeof emptyResources>>(
    (acc, c) => addResources(acc, c),
    emptyResources(),
  );
}

describe("creatures", () => {
  it("has the Lost World roster from FACTION_LOST_WORLD.md", () => {
    const rows = LOST_WORLD_CREATURE_IDS.map((id) => {
      const c = LOST_WORLD_CREATURES[id];
      return [
        c.tier,
        c.hp,
        c.attack,
        c.defense,
        c.damage,
        c.speed,
        c.shots,
        c.growth,
      ];
    });
    expect(rows).toEqual([
      [1, 10, 4, 3, 2, 4, 0, 14],
      [2, 14, 6, 4, 3, 5, 10, 9],
      [3, 22, 8, 5, 5, 9, 0, 7],
      [4, 35, 9, 8, 8, 5, 6, 4],
      [5, 80, 13, 16, 15, 5, 0, 2],
      [6, 200, 20, 16, 40, 8, 0, 1],
    ]);
    expect(LOST_WORLD_CREATURES["t-rex"].cost).toEqual({
      gold: 3000,
      ore: 4,
      essence: 2,
    });
    expect(LOST_WORLD_CREATURES.shaman.ability).toBe("war-drums");
  });

  it("has the neutral roster from GAME_DESIGN.md section 8.1", () => {
    const rows = NEUTRAL_CREATURE_IDS.map((id) => {
      const c = NEUTRAL_CREATURES[id];
      return [c.tier, c.hp, c.attack, c.defense, c.damage, c.speed, c.shots];
    });
    expect(rows).toEqual([
      [1, 8, 4, 2, 2, 5, 0],
      [1, 9, 5, 4, 2, 4, 0],
      [2, 12, 6, 3, 3, 4, 8],
      // The Wolf Rider is the Horde's tier 3 and the Orc Warboss gains 20
      // HP, 1 Attack and 2 Damage (FACTION_GOBLINS 4): one record per id.
      [3, 18, 7, 5, 4, 8, 0],
      [3, 28, 9, 6, 6, 4, 0],
      [4, 50, 11, 9, 10, 5, 0],
      [5, 90, 14, 12, 16, 4, 0],
      [6, 160, 18, 15, 32, 6, 0],
    ]);
    expect(isRanged(NEUTRAL_CREATURES["bomb-chucker"])).toBe(true);
    expect(NEUTRAL_CREATURES.goblin.sprite).toBe("goblin-goblin");
  });

  it("stores fight values that match the formula", () => {
    for (const c of Object.values(CREATURES)) {
      expect(fightValue(c), c.id).toBe(c.fightValue);
    }
  });

  it("matches the documented army fight values", () => {
    const army = CHIEFTAIN.startingArmy.reduce(
      (n, s) => n + s.count * getCreature(s.creature).fightValue,
      0,
    );
    expect(army).toBe(1812);
    const week = LOST_WORLD_CREATURE_IDS.reduce(
      (n, id) =>
        n +
        LOST_WORLD_CREATURES[id].growth * LOST_WORLD_CREATURES[id].fightValue,
      0,
    );
    expect(week).toBe(8899);
    const hold = HOLD_GARRISON.reduce(
      (n, s) => n + s.count * getCreature(s.creature).fightValue,
      0,
    );
    expect(hold).toBe(30906);
  });

  it("references only defined abilities", () => {
    for (const c of Object.values(CREATURES)) {
      if (c.ability === null) continue;
      if (c.ability in STRAY_ABILITY_TEXT) continue;
      expect(ABILITIES[c.ability as keyof typeof ABILITIES].id).toBe(c.ability);
    }
    expect(() => getCreature("dragon")).toThrow();
  });
});

describe("buildings and economy totals (ECONOMY.md section 6)", () => {
  it("every building costs 30000 gold, 80 wood, 44 ore, 13 essence", () => {
    expect(sum(BUILDING_IDS.map((b) => BUILDINGS[b].cost))).toEqual({
      gold: 30000,
      wood: 80,
      ore: 44,
      essence: 13,
    });
  });

  it("the T6 chain costs 18000 gold, 55 wood, 27 ore, 10 essence", () => {
    const chain: BuildingId[] = [
      "spitter-nest",
      "palisade",
      "raptor-pen",
      "spirit-lodge",
      "horn-grounds",
      "tyrants-lair",
    ];
    expect(sum(chain.map((b) => BUILDINGS[b].cost))).toEqual({
      gold: 18000,
      wood: 55,
      ore: 27,
      essence: 10,
    });
  });

  it("one week of all dwellings costs 10230 gold, 8 ore, 6 essence", () => {
    const costs = LOST_WORLD_CREATURE_IDS.map((id) =>
      scaleResources(
        LOST_WORLD_CREATURES[id].cost,
        LOST_WORLD_CREATURES[id].growth,
      ),
    );
    expect(sum(costs)).toEqual({ gold: 10230, wood: 0, ore: 8, essence: 6 });
  });

  it("every Lost World creature has exactly one dwelling", () => {
    for (const id of LOST_WORLD_CREATURE_IDS) {
      expect(dwellingFor(id), id).toBeDefined();
    }
    expect(dwellingFor("goblin")).toBeUndefined();
  });

  it("requirements point at real buildings and form no cycle", () => {
    for (const b of BUILDING_IDS) {
      for (const r of BUILDINGS[b].requires) {
        expect(BUILDING_IDS.indexOf(r)).toBeGreaterThanOrEqual(0);
      }
    }
    const depth = (b: BuildingId, seen: BuildingId[] = []): number => {
      if (seen.includes(b)) throw new Error(`cycle at ${b}`);
      return (
        1 +
        Math.max(0, ...BUILDINGS[b].requires.map((r) => depth(r, [...seen, b])))
      );
    };
    expect(depth("tyrants-lair")).toBe(4);
  });

  it("has the starting resources, mine incomes and XP table", () => {
    expect(STARTING_RESOURCES).toEqual({
      gold: 7500,
      wood: 20,
      ore: 10,
      essence: 4,
    });
    expect(MINES.wood.income).toBe(3);
    expect(MINES.gold.income).toBe(750);
    // RULES_V2 3.2: 100 x (L - 1) x (L + 2).
    expect([2, 3, 10, 15, 20].map(xpCurve)).toEqual([
      400, 1000, 10800, 23800, 41800,
    ]);
  });
});
