// After-battle losses per unit type (beads border_marches-bzc.92, bzc.104):
// the result screen sums every stack of one creature into one row per side,
// from the survivors the game applies, and lists only the types that lost
// units, each with the number killed.
import { describe, expect, it } from "vitest";
import type {
  BattleResult,
  BattleSetup,
} from "../../../src/core/game/battle.ts";
import {
  battleLosses,
  NO_LOSSES,
  totalsByCreature,
} from "../../../src/ui/battle/losses.ts";

describe("totals by creature", () => {
  it("sums stacks of one creature in first-seen order, skipping empty ones", () => {
    expect(
      totalsByCreature([
        { creature: "goblin", count: 4 },
        { creature: "troll", count: 1 },
        { creature: "goblin", count: 3 },
        { creature: "wolf-rider", count: 0 },
        { creature: "goblin", count: 3 },
      ]),
    ).toEqual([
      { creature: "goblin", count: 10 },
      { creature: "troll", count: 1 },
    ]);
  });
});

describe("battle losses", () => {
  const setup = {
    attacker: {
      stacks: [
        { creature: "goblin", count: 10 },
        { creature: "troll", count: 2 },
        { creature: "goblin", count: 6 },
      ],
    },
    defender: {
      stacks: [
        { creature: "wolf-rider", count: 4 },
        { creature: "wolf-rider", count: 3 },
        { creature: "wolf-rider", count: 3 },
      ],
    },
  } as unknown as BattleSetup;

  it("gives one row per creature type that lost units, with the number killed", () => {
    const result: BattleResult = {
      winner: "attacker",
      attacker: [4, 2, 0],
      defender: [0, 0, 0],
    };
    const l = battleLosses(setup, result);
    // The trolls lost nothing: no row.
    expect(l.attacker).toEqual([
      { creature: "goblin", before: 16, left: 4, lost: 12 },
    ]);
    expect(l.defender).toEqual([
      { creature: "wolf-rider", before: 10, left: 0, lost: 10 },
    ]);
  });

  it("counts a loser's whole army as lost, as the game applies it", () => {
    // A round-limit loss: the game result zeroes the loser's survivors.
    const l = battleLosses(setup, {
      winner: "defender",
      attacker: [0, 0, 0],
      defender: [2, 3, 0],
    });
    expect(l.attacker.map((r) => [r.creature, r.lost])).toEqual([
      ["goblin", 16],
      ["troll", 2],
    ]);
    expect(l.defender).toEqual([
      { creature: "wolf-rider", before: 10, left: 5, lost: 5 },
    ]);
  });

  it("leaves a side that lost nothing with no rows", () => {
    const l = battleLosses(setup, {
      winner: "attacker",
      attacker: [10, 2, 6],
      defender: [0, 0, 0],
    });
    expect(l.attacker).toEqual([]);
    expect(l.defender.map((r) => r.lost)).toEqual([10]);
    expect(NO_LOSSES).toBe("No losses");
  });
});
