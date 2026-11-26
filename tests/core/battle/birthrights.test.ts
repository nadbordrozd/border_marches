/**
 * The three birthrights (RULES_V2 3.8) on hand-built battles: Sworn, Not
 * Done Yet and Launched, each visible on the board within a round, plus
 * the engine attachments they need (swap, heal sharing, get-up events,
 * area effects, the "after being moved" reaction).
 */

import { describe, expect, it } from "vitest";
import {
  gameResultFromEngine,
  getStack,
  legalActions,
} from "../../../src/core/battle/index.ts";
import type { BattleState } from "../../../src/core/battle/index.ts";
import { battleResult } from "../../../src/core/battle/auto.ts";
import type { BattleSetup as GameBattleSetup } from "../../../src/core/game/battle.ts";
import {
  at,
  battle,
  countTop,
  kinds,
  strikes,
  unit,
} from "./faction-helpers.ts";
import { patchStack, play, withFx } from "./helpers.ts";

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

const SWORN = { startRules: [{ id: "birthright:sworn" }] };

describe("Sworn (the Realm)", () => {
  function realm(flags: string[] = []): BattleState {
    return battle(
      {
        ...SWORN,
        flags,
        stacks: [
          unit("knight", 2, at(1, 5), { native: true }), // a0
          unit("squire", 20, at(6, 5), { native: true }), // a1
          unit("ghoul", 5, at(0, 0)), // a2: a guest, skipped
          unit("friar", 4, at(0, 8), { native: true }), // a3: odd one out
        ],
      },
      { stacks: [unit("orc-brute", 10, at(7, 5))] },
    );
  }

  it("pairs natives in slot order at deployment; guests and the last odd one stay out", () => {
    const s = realm();
    expect(getStack(s, "a0").conditions[0]).toMatchObject({
      kind: "sworn",
      link: "a1",
      clock: null,
      polarity: "boon",
    });
    expect(getStack(s, "a1").conditions[0]).toMatchObject({ link: "a0" });
    expect(kinds(s, "a2")).toEqual([]);
    expect(kinds(s, "a3")).toEqual([]);
  });

  it("shares every Heal with the far end, once", () => {
    let s = realm();
    s = patchStack(s, "a0", { count: 1, topHp: 50 });
    s = patchStack(s, "a1", { topHp: 4 });
    const { state, events } = withFx(s, (fx) => {
      fx.heal("a1", 40, { revive: true });
    });
    // The Squires restore 6 of the 40 (full); the Knights get all 40,
    // reviving: 50 + 35 fills the top, 5 revive a second Knight.
    expect(
      events
        .filter((e) => e.type === "heal")
        .map((e) => e.type === "heal" && [e.stackId, e.amount, e.revived]),
    ).toEqual([
      ["a1", 6, 0],
      ["a0", 40, 1],
    ]);
    expect(countTop(state, "a0")).toEqual([2, 5]);
  });

  it("a swap stands in for the walk and counts 0 hexes (no Charge)", () => {
    const s = realm();
    expect(s.activeStackId).toBe("a0");
    const swaps = legalActions(s).filter(
      (a) => "swapWith" in a && a.swapWith !== undefined,
    );
    expect(swaps).toContainEqual({
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(6, 5),
      swapWith: "a1",
    });
    const { state, events } = play(s, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(6, 5),
      swapWith: "a1",
    });
    expect(getStack(state, "a0").hex).toEqual(at(6, 5));
    expect(getStack(state, "a1").hex).toEqual(at(1, 5));
    expect(
      events
        .filter((e) => e.type === "move")
        .map((e) => e.type === "move" && e.mode),
    ).toEqual(["swap", "swap"]);
    const hit = events.find((e) => e.type === "damage");
    if (hit?.type !== "damage") throw new Error("no strike");
    expect(hit.breakdown.abilityMultipliers.map((m) => m.source)).not.toContain(
      "charge",
    );
  });

  it("Chapel of Oaths: when one end dies the other gains Heartened and Lucky", () => {
    const s = realm(["chapel-of-oaths"]);
    const { state } = withFx(s, (fx) => {
      fx.harm("a0", 999);
    });
    expect(kinds(state, "a1")).toEqual(["heartened", "lucky"]);
    const plain = withFx(realm(), (fx) => {
      fx.harm("a0", 999);
    }).state;
    expect(kinds(plain, "a1")).toEqual([]);
  });
});

describe("Not Done Yet (the Restless)", () => {
  function restless(flags: string[] = [], extra: string[] = []): BattleState {
    return battle(
      {
        birthright: "not-done-yet",
        flags,
        stacks: [
          unit("skeleton", 10, at(5, 5), { native: true, extra }), // a0
          unit("skeleton", 10, at(0, 0)), // a1: a guest (no birthright)
          unit("banshee", 4, at(0, 10), { native: true }), // a2: leaves nothing
        ],
      },
      { stacks: [unit("orc-brute", 10, at(12, 5))] },
    );
  }

  it("a dead native is on the timeline at once and gets up next round with a third", () => {
    let s = restless();
    s = withFx(s, (fx) => {
      fx.harm("a0", 999);
    }).state;
    // Visible within the round: the event and the bones.
    expect(s.scheduled).toEqual([
      expect.objectContaining({ round: 2, phase: "start", returnsStack: true }),
    ]);
    expect(s.ground.map((g) => [g.kind, g.source])).toEqual([["bones", "a0"]]);
    s = until(s, "a2");
    while (s.round === 1)
      s = play(s, { type: "defend", stackId: s.activeStackId as string }).state;
    expect(countTop(s, "a0")).toEqual([4, 9]);
    expect(getStack(s, "a0").risen).toBe(true);
    // The bones are consumed (no Spare Parts) and it joins this round.
    expect(s.ground).toEqual([]);
    expect([s.activeStackId, ...s.queue]).toContain("a0");
    // Once per battle: a second death stays dead.
    const again = withFx(s, (fx) => {
      fx.harm("a0", 999);
    }).state;
    expect(again.scheduled).toEqual([]);
  });

  it("Family Crypt: half rather than a third; Spare Parts keeps the bones", () => {
    let s = restless(["get-up-half"], ["spare-parts"]);
    s = withFx(s, (fx) => {
      fx.harm("a0", 999);
    }).state;
    while (s.round === 1)
      s = play(s, { type: "defend", stackId: s.activeStackId as string }).state;
    expect(getStack(s, "a0").count).toBe(5);
    expect(s.ground.map((g) => g.kind)).toEqual(["bones"]);
  });

  it("is cancelled when the remains are used first; guests and Banshees never get up", () => {
    let s = restless();
    s = withFx(s, (fx) => {
      fx.harm("a0", 999);
      fx.useRemains(at(5, 5));
      fx.harm("a1", 999);
      fx.harm("a2", 999);
    }).state;
    while (s.round === 1 && s.winner === null)
      s = play(s, { type: "defend", stackId: s.activeStackId as string }).state;
    expect(getStack(s, "a0").count).toBe(0);
    expect(getStack(s, "a1").count).toBe(0);
    expect(getStack(s, "a2").count).toBe(0);
    expect(s.winner).toBe("defender");
  });

  it("the battle is not lost while a return is pending", () => {
    let s = battle(
      {
        birthright: "not-done-yet",
        stacks: [unit("skeleton", 3, at(5, 5), { native: true })],
      },
      { stacks: [unit("orc-brute", 10, at(12, 5))] },
    );
    s = withFx(s, (fx) => {
      fx.harm("a0", 999);
    }).state;
    expect(s.winner).toBeNull();
  });

  it("a risen stack crumbles after the battle (unless the Hall of Ancestors and a win)", () => {
    let s = restless();
    s = withFx(s, (fx) => {
      fx.harm("a0", 999);
    }).state;
    while (s.round === 1)
      s = play(s, { type: "defend", stackId: s.activeStackId as string }).state;
    const done = {
      ...s,
      winner: "attacker" as const,
      endReason: "eliminated" as const,
    };
    const result = battleResult(done, "eliminated");
    expect(result.stacks.find((x) => x.id === "a0")).toMatchObject({
      count: 4,
      risen: true,
    });
    const setup = (specials: string[]): GameBattleSetup => ({
      seed: 1,
      terrain: "grass",
      attacker: {
        owner: 0,
        hero: null,
        stacks: [
          { creature: "skeleton", count: 10 },
          { creature: "skeleton", count: 10 },
          { creature: "banshee", count: 4 },
        ],
        defenseBonus: 0,
        specials,
      },
      defender: {
        owner: null,
        hero: null,
        stacks: [{ creature: "orc-brute", count: 10 }],
        defenseBonus: 0,
      },
      battle: { kind: "monster", objectId: "m", heroId: "h" },
    });
    const crumble = gameResultFromEngine(setup([]), result);
    expect(crumble.attacker).toEqual([0, 10, 4]);
    const kept = gameResultFromEngine(setup(["hall-of-ancestors"]), result);
    expect(kept.attacker).toEqual([4, 10, 4]);
  });
});

describe("Launched (the Horde)", () => {
  function horde(flags: string[] = []): BattleState {
    return battle(
      {
        birthright: "launched",
        flags,
        stacks: [
          unit("goblin", 10, at(6, 5), { native: true }), // a0
          unit("goblin", 10, at(8, 4)), // a1: a guest
          unit("bomb-chucker", 10, at(0, 0), { native: true }), // a2
        ],
      },
      { stacks: [unit("orc-brute", 20, at(7, 5))] },
    );
  }
  const own = { centre: at(7, 5), side: "attacker" as const };

  it("natives take nothing from their own side's area effects and fly 3 hexes", () => {
    const s = horde();
    const { state, events } = withFx(s, (fx) => {
      for (const id of ["d0", "a0", "a1"]) fx.harm(id, 30, { area: own });
    });
    expect(
      events
        .filter((e) => e.type === "harm")
        .map((e) => e.type === "harm" && e.targetId),
    ).toEqual(["d0", "a1"]);
    expect(countTop(state, "a0")).toEqual([10, 10]);
    expect(getStack(state, "a0").hex).toEqual(at(3, 5));
    // The guest takes the blast.
    expect(getStack(state, "a1").count).toBeLessThan(10);
  });

  it("an enemy's area effect hits natives as usual", () => {
    const s = horde();
    const { state } = withFx(s, (fx) => {
      fx.harm("a0", 30, { area: { centre: at(7, 5), side: "defender" } });
    });
    expect(getStack(state, "a0").count).toBeLessThan(10);
    expect(getStack(state, "a0").hex).toEqual(at(6, 5));
  });

  it("from the centre hex: 3 hexes along the row toward the enemy; Launch Ramp gives Lucky", () => {
    const s = patchStack(horde(["launch-ramp"]), "a0", { hex: at(6, 8) });
    const { state } = withFx(s, (fx) => {
      fx.harm("a0", 30, { area: { centre: at(6, 8), side: "attacker" } });
    });
    expect(getStack(state, "a0").hex).toEqual(at(9, 8));
    expect(kinds(state, "a0")).toEqual(["lucky"]);
  });

  it("an enemy push sets off Cannonball (Follow Through on Goblins)", () => {
    let s = battle(
      { stacks: [unit("knight", 2, at(2, 5), { extra: ["follow-through"] })] },
      {
        stacks: [
          unit("goblin", 20, at(7, 5)),
          unit("orc-brute", 1, at(8, 4)),
          unit("squire", 5, at(9, 5)),
        ],
      },
    );
    // The Squires are the Goblins' enemy only after a Turned: use a guard
    // of the knight's side instead.
    s = patchStack(s, "d2", { owner: "attacker", side: "attacker" });
    const { events } = play(s, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(6, 5),
    });
    // Pushed 1 hex into (8,5), beside the Squires: Cannonball +25%.
    expect(strikes(events)).toContainEqual([
      "d0",
      "d2",
      "special",
      expect.any(Number),
      expect.any(Number),
    ]);
  });
});
