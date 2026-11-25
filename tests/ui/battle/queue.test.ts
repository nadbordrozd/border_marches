import { describe, expect, it } from "vitest";
import { applyAction, legalActions } from "../../../src/core/battle/index.ts";
import {
  QUEUE_MAX,
  queueCount,
  queueSlots,
  turnQueue,
} from "../../../src/ui/battle/queue.ts";
import type { QueueEntry } from "../../../src/ui/battle/queue.ts";
import { at, battle, unit } from "./helpers.ts";

/** "a0*", "d1", "|2", "a0:next": the queue in short. */
function short(q: readonly QueueEntry[]): string[] {
  return q.map((e) =>
    e.kind === "divider"
      ? `|${e.round}`
      : e.kind === "event"
        ? `e:${e.key}`
        : `${e.key}${e.now ? "*" : ""}`,
  );
}

const six = () =>
  battle(
    [
      unit("raptor", 7, at(1, 1)),
      unit("caveman", 20, at(1, 4)),
      unit("triceratops", 2, at(1, 7)),
    ],
    [
      unit("goblin", 30, at(13, 1)),
      unit("ogre", 3, at(13, 4)),
      unit("troll", 2, at(13, 7)),
    ],
  );

describe("turnQueue", () => {
  it("shows the active stack first, this round, a divider and next round, eight tiles", () => {
    const s = six();
    const q = turnQueue(s);
    const tiles = q.filter((e) => e.kind !== "divider");
    expect(tiles).toHaveLength(QUEUE_MAX);
    const first = q[0];
    expect(first?.kind).toBe("stack");
    if (first?.kind !== "stack") return;
    expect(first.id).toBe(s.activeStackId);
    expect(first.now).toBe(true);
    expect(first.round).toBe(1);
    // Six stacks this round, then "Round 2" and the first two of round 2.
    expect(q[6]).toEqual({ kind: "divider", key: "divider", round: 2 });
    expect(q.slice(7).every((e) => e.kind === "stack" && e.round === 2)).toBe(
      true,
    );
    expect(q.slice(7).every((e) => e.key.endsWith(":next"))).toBe(true);
    // Only the first tile is the active one; keys are unique (FLIP).
    expect(q.filter((e) => e.kind === "stack" && e.now)).toHaveLength(1);
    expect(new Set(q.map((e) => e.key)).size).toBe(q.length);
  });

  it("carries side, portrait, count and plural name", () => {
    const s = six();
    const gob = turnQueue(s).find(
      (e) => e.kind === "stack" && e.creatureId === "goblin",
    );
    expect(gob).toMatchObject({
      kind: "stack",
      side: "defender",
      count: 30,
      name: "Goblins",
    });
  });

  it("shows fewer tiles when fewer fit, and no divider without a tile after it", () => {
    const s = six();
    const three = turnQueue(s, 3);
    expect(three).toHaveLength(3);
    expect(three.some((e) => e.kind === "divider")).toBe(false);
    const all = short(turnQueue(s));
    expect(short(three)).toEqual(all.slice(0, 3));
    // Exactly this round's six: still no divider.
    expect(turnQueue(s, 6).some((e) => e.kind === "divider")).toBe(false);
    expect(short(turnQueue(s, 7)).at(-2)).toBe("|2");
  });

  it("moves on as turns are taken", () => {
    const s = six();
    const before = short(turnQueue(s));
    const defend = legalActions(s).find((a) => a.type === "defend");
    expect(defend).toBeDefined();
    if (!defend) return;
    const next = applyAction(s, defend).state;
    const after = short(turnQueue(next));
    // The second stack of the round now acts; the first is gone from round 1.
    expect(after[0]).toBe(`${before[1]?.replace("*", "")}*`);
    expect(after.slice(0, 5)).not.toContain(before[0]?.replace("*", ""));
  });

  it("a finished battle has no active tile and no next round", () => {
    const s = { ...six(), winner: "attacker" as const };
    const q = turnQueue(s);
    expect(q.some((e) => e.kind === "divider")).toBe(false);
    expect(q.some((e) => e.kind === "stack" && e.now)).toBe(false);
  });
});

describe("queueSlots", () => {
  it("fits eight at 1280 wide and fewer in a narrow bar, never none", () => {
    expect(queueSlots(1280 - 2 * 120 - 36)).toBe(QUEUE_MAX);
    expect(queueSlots(200)).toBeLessThan(QUEUE_MAX);
    expect(queueSlots(200)).toBeGreaterThan(1);
    expect(queueSlots(0)).toBe(1);
  });

  it("never asks for more width than it has", () => {
    for (let w = 100; w <= 400; w += 7) {
      const n = queueSlots(w);
      if (n === 1) continue;
      // The active tile, the divider and n - 1 plain tiles.
      expect(33 + 64 + (n - 1) * 29).toBeLessThanOrEqual(w);
    }
  });
});

describe("queueCount", () => {
  it("keeps counts short enough for a 24 px tile", () => {
    expect(queueCount(7)).toBe("7");
    expect(queueCount(999)).toBe("999");
    expect(queueCount(1000)).toBe("1k");
    expect(queueCount(1250)).toBe("1.3k");
    expect(queueCount(12400)).toBe("12k");
  });
});
