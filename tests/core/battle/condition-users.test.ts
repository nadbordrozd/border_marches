/**
 * Creature users of Mollified, Shielded, Quickened, Slowed, Hushed and
 * Drenched (bead bzc.40; CONTENT_SPELLS 2.3 asks for three users of each
 * new kind). Each rule names the kind and pays out because of it.
 */
import { describe, expect, it } from "vitest";
import { actionError, getStack } from "../../../src/core/battle/index.ts";
import type {
  BattleAction,
  BattleEvent,
  BattleState,
} from "../../../src/core/battle/index.ts";
import { at, battle, kinds, strikes, unit } from "./faction-helpers.ts";
import { cond, patchStack, play } from "./helpers.ts";

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

/** Test surgery: the stack bears these kinds (sizes as a spell makes them). */
function bearing(
  s: BattleState,
  id: string,
  ...ks: [string, (number | undefined)?][]
): BattleState {
  const stack = getStack(s, id);
  return patchStack(s, id, {
    conditions: [
      ...stack.conditions,
      ...ks.map(([k, size], i) =>
        cond(k, { clock: 3, ...(size !== undefined ? { size } : {}) }, 900 + i),
      ),
    ],
  });
}

function landed(events: readonly BattleEvent[], id: string): string[] {
  return events.flatMap((e) =>
    e.type === "condition" && e.stackId === id && e.change === "landed"
      ? [e.condition.kind]
      : [],
  );
}

describe("condition users (bzc.40)", () => {
  // Five Goblins: 40 HP, above a 30 HP gate and under a doubled one.
  const goblins = () => unit("goblin", 5, at(6, 5));

  it("Notary: Stamp's gate is doubled against a Mollified stack", () => {
    const s = until(
      battle(
        { stacks: [unit("notary", 2, at(5, 5))] },
        { stacks: [goblins()] },
      ),
      "a0",
    );
    const stamp: BattleAction = {
      type: "ability",
      stackId: "a0",
      ability: "stamp",
      targets: [{ stack: "d0" }],
    };
    expect(landed(play(s, stamp).events, "d0")).not.toContain("turned");
    const soft = bearing(s, "d0", ["mollified", 30]);
    expect(landed(play(soft, stamp).events, "d0")).toContain("turned");
  });

  it("Rime Walrus: Cold Front's gate is doubled against a Drenched stack", () => {
    const s = until(
      battle(
        { stacks: [unit("rime-walrus", 2, at(5, 5))] },
        { stacks: [goblins()] },
      ),
      "a0",
    );
    const front: BattleAction = {
      type: "ability",
      stackId: "a0",
      ability: "cold-front",
      targets: [],
    };
    expect(landed(play(s, front).events, "d0")).not.toContain("frozen");
    const wet = bearing(s, "d0", ["drenched", 40]);
    expect(landed(play(wet, front).events, "d0")).toContain("frozen");
  });

  it("Vampire: Mesmerise's gate is doubled against a Hushed or Mollified stack", () => {
    const s = until(
      battle(
        { stacks: [unit("vampire", 1, at(5, 5), { extra: ["mesmerise"] })] },
        { stacks: [goblins()] },
      ),
      "a0",
    );
    const lull: BattleAction = {
      type: "ability",
      stackId: "a0",
      ability: "mesmerise",
      targets: [{ stack: "d0" }],
    };
    expect(landed(play(s, lull).events, "d0")).not.toContain("asleep");
    for (const k of ["hushed", "mollified"]) {
      const soft = bearing(s, "d0", [k, k === "mollified" ? 30 : undefined]);
      expect(landed(play(soft, lull).events, "d0"), k).toContain("asleep");
    }
  });

  it("Longbowmen: Pin Down's gate is doubled against a Slowed stack", () => {
    // Three Longbowmen: gate 45; one Ogre keeps about 80 of its 90 HP.
    const s = until(
      battle(
        {
          stacks: [unit("longbowman", 3, at(1, 5), { extra: ["pin-down"] })],
        },
        { stacks: [unit("ogre", 1, at(13, 5))] },
      ),
      "a0",
    );
    const shot: BattleAction = { type: "shoot", stackId: "a0", targetId: "d0" };
    const plain = play(s, shot);
    expect(getStack(plain.state, "d0").topHp).toBeGreaterThan(45);
    expect(kinds(plain.state, "d0")).not.toContain("delayed");
    const slow = play(bearing(s, "d0", ["slowed", 1]), shot);
    expect(getStack(slow.state, "d0").topHp).toBeLessThanOrEqual(90);
    expect(kinds(slow.state, "d0")).toContain("delayed");
  });

  it("Winders: Quickened Winders' Wind Up reaches 6 hexes", () => {
    const s = until(
      battle(
        { stacks: [unit("winder", 2, at(3, 5))] },
        { stacks: [unit("goblin", 5, at(8, 5))] },
      ),
      "a0",
    );
    const wind: BattleAction = {
      type: "ability",
      stackId: "a0",
      ability: "wind-up",
      targets: [{ stack: "d0" }],
    };
    expect(actionError(s, wind)).not.toBeNull();
    const quick = bearing(s, "a0", ["quickened", 1]);
    expect(actionError(quick, wind)).toBeNull();
    expect(landed(play(quick, wind).events, "d0")).toContain("delayed");
  });

  it("Gumshoes: their shots ignore Shielded; other shots do not", () => {
    const shotDamage = (shooter: "gumshoe" | "longbowman", shield: boolean) => {
      let s = until(
        battle(
          { stacks: [unit(shooter, 6, at(1, 5))] },
          { stacks: [unit("ogre", 3, at(13, 5))] },
        ),
        "a0",
      );
      if (shield) s = bearing(s, "d0", ["shielded", 6]);
      const { events } = play(s, {
        type: "shoot",
        stackId: "a0",
        targetId: "d0",
      });
      return strikes(events)[0]?.[3] ?? 0;
    };
    expect(shotDamage("gumshoe", true)).toBe(shotDamage("gumshoe", false));
    expect(shotDamage("longbowman", true)).toBeLessThan(
      shotDamage("longbowman", false),
    );
  });

  it("Ogres: Hurl never works on a Shielded stack", () => {
    const s = until(
      battle({ stacks: [unit("ogre", 2, at(5, 5))] }, { stacks: [goblins()] }),
      "a0",
    );
    const hurl: BattleAction = {
      type: "ability",
      stackId: "a0",
      ability: "hurl",
      targets: [{ stack: "d0" }],
    };
    expect(actionError(s, hurl)).toBeNull();
    expect(actionError(bearing(s, "d0", ["shielded", 2]), hurl)).toMatch(
      /Shielded/,
    );
  });
});
