// After-battle losses per unit type (bead border_marches-bzc.92): the
// result screen sums every stack of one creature into one row per side,
// from the survivors the game applies.
import { describe, expect, it } from "vitest";
import type {
  BattleResult,
  BattleSetup,
} from "../../../src/core/game/battle.ts";
import {
  battleLosses,
  lossText,
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

  it("gives one row per creature type per side with the total lost", () => {
    const result: BattleResult = {
      winner: "attacker",
      attacker: [4, 2, 0],
      defender: [0, 0, 0],
    };
    const l = battleLosses(setup, result);
    expect(l.attacker).toEqual([
      { creature: "goblin", before: 16, left: 4, lost: 12 },
      { creature: "troll", before: 2, left: 2, lost: 0 },
    ]);
    expect(l.defender).toEqual([
      { creature: "wolf-rider", before: 10, left: 0, lost: 10 },
    ]);
    expect(l.attacker.map(lossText)).toEqual(["12 of 16 lost", "none lost"]);
    expect(l.defender.map(lossText)).toEqual(["all 10 lost"]);
  });

  it("counts a loser's whole army as lost, as the game applies it", () => {
    // A round-limit loss: the game result zeroes the loser's survivors.
    const l = battleLosses(setup, {
      winner: "defender",
      attacker: [0, 0, 0],
      defender: [2, 3, 0],
    });
    expect(l.attacker.map((r) => r.lost)).toEqual([16, 2]);
    expect(l.defender).toEqual([
      { creature: "wolf-rider", before: 10, left: 5, lost: 5 },
    ]);
  });

  it("says a single creature was lost without a count", () => {
    expect(lossText({ creature: "troll", before: 1, left: 0, lost: 1 })).toBe(
      "lost",
    );
  });
});
