import { describe, expect, it } from "vitest";
import { HEAVY_TIMEOUT } from "../../timeouts.ts";
import {
  applyAction,
  chooseAiAction,
  ROUND_LIMIT,
  createBattle,
  fightValueLeft,
  hexDistance,
  isLegalAction,
  roundLimitWinner,
  runAutoBattle,
} from "../../../src/core/battle/index.ts";
import type {
  BattleSetup,
  BattleState,
} from "../../../src/core/battle/index.ts";
import {
  CAVEMAN,
  CHIEFTAIN,
  OGRE,
  SPITTER,
  dummy,
  randomArmy,
} from "./fixtures.ts";
import { start } from "./helpers.ts";

function randomSetup(i: number): BattleSetup {
  return {
    seed: 7000 + i,
    attacker: randomArmy(50_000 + i, true),
    defender: randomArmy(90_000 + i, i % 3 === 0),
  };
}

describe("battle AI", () => {
  it(
    "makes only legal moves and every battle of 40 random armies terminates",
    () => {
      const outcomes = { attacker: 0, defender: 0, roundLimit: 0 };
      let maxRounds = 0;
      for (let i = 0; i < 40; i++) {
        let state: BattleState = createBattle(randomSetup(i)).state;
        let actions = 0;
        while (state.winner === null && state.round <= 100) {
          const action = chooseAiAction(state);
          expect(isLegalAction(state, action)).toBe(true);
          state = applyAction(state, action).state;
          actions++;
          expect(actions).toBeLessThan(100 * 14 * 2 + 1);
        }
        maxRounds = Math.max(maxRounds, state.round);
        if (state.winner === null) outcomes.roundLimit++;
        else outcomes[state.winner]++;
      }
      expect(outcomes.attacker + outcomes.defender + outcomes.roundLimit).toBe(
        40,
      );
      // Battles end by elimination, well inside the cap.
      expect(outcomes.roundLimit).toBe(0);
      expect(maxRounds).toBeLessThan(100);
    },
    HEAVY_TIMEOUT,
  );

  it(
    "is deterministic: the same setup gives the same battle",
    () => {
      for (let i = 0; i < 10; i++) {
        const a = runAutoBattle(randomSetup(i));
        const b = runAutoBattle(randomSetup(i));
        expect(b.result).toEqual(a.result);
        expect(b.events).toEqual(a.events);
      }
    },
    HEAVY_TIMEOUT,
  );

  it("auto-play stops at its maxRounds harness with no winner", () => {
    // Two stacks that can never reach each other: an obstacle wall.
    const wall = Array.from({ length: 11 }, (_, row) => ({ col: 7, row }));
    const r = runAutoBattle(
      {
        seed: 1,
        obstacles: wall,
        attacker: { hero: null, stacks: [{ creature: CAVEMAN, count: 5 }] },
        defender: { hero: null, stacks: [{ creature: CAVEMAN, count: 5 }] },
      },
      { maxRounds: 5 },
    );
    expect(r.result).toMatchObject({
      winner: null,
      reason: "roundLimit",
      rounds: 6,
    });
    expect(r.events.some((e) => e.type === "end")).toBe(false);
  });

  it("the engine ends an unwinnable battle at the round limit: a tie goes to the defender", () => {
    const wall = Array.from({ length: 11 }, (_, row) => ({ col: 7, row }));
    const r = runAutoBattle({
      seed: 1,
      obstacles: wall,
      attacker: { hero: null, stacks: [{ creature: CAVEMAN, count: 5 }] },
      defender: { hero: null, stacks: [{ creature: CAVEMAN, count: 5 }] },
    });
    expect(ROUND_LIMIT).toBe(15);
    expect(r.result).toMatchObject({
      winner: "defender",
      reason: "roundLimit",
      rounds: ROUND_LIMIT,
    });
    expect(r.events.at(-1)).toMatchObject({
      type: "end",
      winner: "defender",
      reason: "roundLimit",
    });
  });

  it("at the round limit the side with more fight value left wins", () => {
    const wall = Array.from({ length: 11 }, (_, row) => ({ col: 7, row }));
    const setup: BattleSetup = {
      seed: 1,
      obstacles: wall,
      attacker: { hero: null, stacks: [{ creature: CAVEMAN, count: 6 }] },
      defender: { hero: null, stacks: [{ creature: CAVEMAN, count: 5 }] },
    };
    const start = createBattle(setup).state;
    expect(fightValueLeft(start, "attacker")).toBe(6 * 60);
    expect(fightValueLeft(start, "defender")).toBe(5 * 60);
    expect(roundLimitWinner(start)).toBe("attacker");
    const r = runAutoBattle(setup);
    expect(r.result).toMatchObject({
      winner: "attacker",
      reason: "roundLimit",
      rounds: ROUND_LIMIT,
    });
    // A setup's own limit (simulations, scenarios).
    const short = runAutoBattle({ ...setup, roundLimit: 4 });
    expect(short.result).toMatchObject({
      winner: "attacker",
      reason: "roundLimit",
      rounds: 4,
    });
  });

  it("ranged units shoot the most valuable target", () => {
    const s = start({
      attacker: {
        hero: CHIEFTAIN,
        stacks: [{ creature: SPITTER, count: 10, hex: { col: 2, row: 5 } }],
      },
      defender: {
        hero: null,
        stacks: [
          { creature: CAVEMAN, count: 30, hex: { col: 12, row: 2 } },
          { creature: OGRE, count: 2, hex: { col: 12, row: 8 } },
        ],
      },
    });
    // 10 Spitters deal the same HP to either; Ogre HP is worth more.
    expect(chooseAiAction(s)).toEqual({
      type: "shoot",
      stackId: "a0",
      targetId: "d1",
    });
  });

  it("melee units approach and attack rather than wait", () => {
    const s = start({
      attacker: {
        hero: null,
        stacks: [{ creature: dummy({ speed: 5 }), count: 10 }],
      },
      defender: { hero: null, stacks: [{ creature: CAVEMAN, count: 5 }] },
    });
    expect(s.activeStackId).toBe("a0");
    const a = chooseAiAction(s);
    expect(a.type).toBe("move");
    // From 14 hexes away it closes the full Speed of 5.
    if (a.type === "move")
      expect(hexDistance(a.to, { col: 14, row: 5 })).toBe(9);
  });

  it("does not suicide into a much stronger stack", () => {
    const s = start({
      attacker: {
        hero: null,
        stacks: [{ creature: CAVEMAN, count: 2, hex: { col: 6, row: 5 } }],
      },
      defender: {
        hero: null,
        stacks: [{ creature: OGRE, count: 10, hex: { col: 7, row: 5 } }],
      },
    });
    expect(chooseAiAction(s).type).not.toBe("attack");
  });
});
