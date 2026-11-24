/**
 * Strays' and caretakers' abilities (CONTENT_CREATURES section 2, bead
 * bzc.13) on hand-built battles.
 */
import { describe, expect, it } from "vitest";
import { ability, getStack } from "../../../src/core/battle/index.ts";
import type {
  BattleEvent,
  BattleState,
} from "../../../src/core/battle/index.ts";
import { STRAY_CREATURE_IDS } from "../../../src/data/strays.ts";
import { CREATURES } from "../../../src/data/creatures.ts";
import { at, battle, kinds, unit } from "./faction-helpers.ts";
import { play } from "./helpers.ts";

/** Condition kinds that landed on a stack in these events. */
function landed(events: readonly BattleEvent[], id: string): string[] {
  return events.flatMap((e) =>
    e.type === "condition" && e.stackId === id && e.change === "landed"
      ? [e.condition.kind]
      : [],
  );
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

describe("stray abilities", () => {
  it("every stray's ability is registered in the battle grammar", () => {
    for (const id of STRAY_CREATURE_IDS) {
      for (const a of CREATURES[id].abilities ?? []) {
        expect(() => ability(a), `${id}: ${a}`).not.toThrow();
      }
    }
  });

  it("Gremlin: its melee Strike adds Hushed", () => {
    const s = battle(
      { stacks: [unit("gremlin", 10, at(5, 5))] },
      { stacks: [unit("newsie", 10, at(6, 5))] },
    );
    const ready = until(s, "a0");
    const { state } = play(ready, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(5, 5),
    });
    expect(kinds(state, "d0")).toContain("hushed");
  });

  it("Notary: Stamp turns an adjacent enemy under the gate", () => {
    const s = battle(
      { stacks: [unit("notary", 10, at(5, 5))] },
      { stacks: [unit("bellhop", 5, at(6, 5)), unit("bellhop", 5, at(12, 2))] },
    );
    const ready = until(s, "a0");
    const { state, events } = play(ready, {
      type: "ability",
      stackId: "a0",
      ability: "stamp",
      targets: [{ stack: "d0" }],
    });
    // Clock 1: it lands now and ends at this round's end.
    expect(landed(events, "d0")).toContain("turned");
    expect(getStack(state, "a0").abilitiesUsed).toEqual(["stamp"]);
  });

  it("Rime Walrus: Cold Front freezes adjacent enemies", () => {
    const s = battle(
      { stacks: [unit("rime-walrus", 3, at(5, 5))] },
      { stacks: [unit("bellhop", 4, at(6, 5)), unit("bellhop", 4, at(12, 2))] },
    );
    const ready = until(s, "a0");
    const { events } = play(ready, {
      type: "ability",
      stackId: "a0",
      ability: "cold-front",
      targets: [],
    });
    expect(landed(events, "d0")).toContain("frozen");
    expect(landed(events, "d1")).not.toContain("frozen");
  });

  it("Beanstalk Giant: Stomp harms the others next to its target", () => {
    const s = battle(
      { stacks: [unit("beanstalk-giant", 2, at(5, 5))] },
      {
        stacks: [unit("tin-titan", 3, at(6, 5)), unit("bellhop", 20, at(7, 5))],
      },
    );
    const ready = until(s, "a0");
    const before = getStack(ready, "d1").count;
    const { state } = play(ready, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(5, 5),
    });
    expect(getStack(state, "d1").count).toBeLessThan(before);
  });
});
