/**
 * Long Shadow (CONTENT_HEROES.md army skills) reaches the v0.2 faction
 * abilities whose rule text makes "adjacent" the ability's reach: Attend,
 * Shield Wall, Bodyguard, Hurl and Mesmerise. Area shapes (Bomb, Stomp),
 * positioning (Cannonball) and Commands stay strictly adjacent.
 */

import { describe, expect, it } from "vitest";
import { actionError, getStack } from "../../../src/core/battle/index.ts";
import type {
  BattleSide,
  BattleState,
} from "../../../src/core/battle/index.ts";
import { at, battle, strikes, unit } from "./faction-helpers.ts";
import { play } from "./helpers.ts";

/** Test surgery: give a side's hero these rules. */
function withRules(
  state: BattleState,
  side: BattleSide,
  rules: readonly string[],
): BattleState {
  const st = state.sides[side];
  return {
    ...state,
    sides: {
      ...state.sides,
      [side]: { ...st, rules: [...rules], rulesUsed: [] },
    },
  };
}

function until(s: BattleState, id: string): BattleState {
  let cur = s;
  for (let i = 0; i < 40 && cur.activeStackId !== id; i++)
    cur = play(cur, {
      type: "defend",
      stackId: cur.activeStackId as string,
    }).state;
  expect(cur.activeStackId).toBe(id);
  return cur;
}

const LONG = ["long-shadow-3"];

describe("Long Shadow reaches faction abilities", () => {
  it("Attend reaches a friend 2 hexes away", () => {
    const s = battle(
      {
        stacks: [
          unit("squire", 30, at(2, 4)), // a0
          unit("squire", 2, at(4, 4)), // a1, 2 hexes away
        ],
      },
      { stacks: [unit("orc-brute", 5, at(14, 5))] },
    );
    const act = {
      type: "ability" as const,
      stackId: "a0",
      ability: "attend",
      targets: [{ stack: "a1" }],
    };
    expect(actionError(until(s, "a0"), act)).toBe("it must be adjacent");
    expect(actionError(until(withRules(s, "attacker", LONG), "a0"), act)).toBe(
      null,
    );
  });

  it("Shield Wall covers a friend 2 hexes away", () => {
    const base = battle(
      {
        stacks: [
          unit("man-at-arms", 5, at(4, 5)),
          unit("squire", 10, at(6, 5)), // 2 hexes from the Men-at-Arms
        ],
      },
      { stacks: [unit("orc-brute", 5, at(7, 5))] },
    );
    const sources = (s: BattleState): string[] => {
      const { events } = play(until(s, "d0"), {
        type: "attack",
        stackId: "d0",
        targetId: "a1",
        from: at(7, 5),
      });
      const hit = events.find((e) => e.type === "damage");
      if (hit?.type !== "damage") throw new Error("no strike");
      return hit.breakdown.defenseModifiers.map((m) => m.source);
    };
    expect(sources(base)).toEqual([]);
    expect(sources(withRules(base, "attacker", LONG))).toEqual(["shield-wall"]);
  });

  it("Bodyguard answers an attack on a friend within reach", () => {
    const base = battle(
      {
        stacks: [
          unit("man-at-arms", 5, at(5, 5), { extra: ["bodyguard"] }),
          unit("squire", 10, at(7, 4)),
        ],
      },
      { stacks: [unit("orc-brute", 5, at(10, 5))] },
    );
    // (7,5) is adjacent to the Squires and 2 hexes from the Men-at-Arms.
    const who = (s: BattleState): string[][] =>
      strikes(
        play(until(s, "d0"), {
          type: "attack",
          stackId: "d0",
          targetId: "a1",
          from: at(7, 5),
        }).events,
      ).map((x) => [x[0], x[2]]);
    expect(who(base)).toEqual([
      ["d0", "melee"],
      ["a1", "retaliation"],
    ]);
    expect(who(withRules(base, "attacker", LONG))).toEqual([
      ["d0", "melee"],
      ["a1", "retaliation"],
      ["a0", "retaliation"],
    ]);
  });

  it("Hurl reaches a stack 2 hexes away", () => {
    const s = battle(
      { stacks: [unit("ogre", 2, at(7, 5))] },
      { stacks: [unit("goblin", 2, at(9, 5))] },
    );
    const act = {
      type: "ability" as const,
      stackId: "a0",
      ability: "hurl",
      targets: [{ stack: "d0" }],
    };
    expect(actionError(until(s, "a0"), act)).toBe("it must be adjacent");
    const long = until(withRules(s, "attacker", LONG), "a0");
    expect(actionError(long, act)).toBeNull();
    const after = play(long, act).state;
    expect(getStack(after, "d0").hex.col).toBeGreaterThan(9);
  });

  it("Mesmerise reaches an enemy 2 hexes away", () => {
    const s = battle(
      { stacks: [unit("vampire", 4, at(7, 5), { extra: ["mesmerise"] })] },
      { stacks: [unit("orc-brute", 4, at(9, 5))] },
    );
    const act = {
      type: "ability" as const,
      stackId: "a0",
      ability: "mesmerise",
      targets: [{ stack: "d0" }],
    };
    expect(actionError(until(s, "a0"), act)).toBe("it must be adjacent");
    const long = until(withRules(s, "attacker", LONG), "a0");
    expect(actionError(long, act)).toBeNull();
    expect(
      getStack(play(long, act).state, "d0").conditions.map((c) => c.kind),
    ).toEqual(["asleep"]);
  });

  it("only the strongest stack reaches with rank 1", () => {
    const s = battle(
      {
        stacks: [
          unit("squire", 2, at(2, 4)), // a0: weak
          unit("squire", 2, at(4, 4)), // a1
          unit("knight", 10, at(2, 8)), // a2: strongest
        ],
      },
      { stacks: [unit("orc-brute", 5, at(14, 5))] },
    );
    expect(
      actionError(until(withRules(s, "attacker", ["long-shadow-1"]), "a0"), {
        type: "ability",
        stackId: "a0",
        ability: "attend",
        targets: [{ stack: "a1" }],
      }),
    ).toBe("it must be adjacent");
  });
});
