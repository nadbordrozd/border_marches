/**
 * Battle AI valuation of set-up conditions (bead bzc.36): a Scapegoat link
 * is worth what it moves from a dear stack to a cheap one, Warded only
 * what Harm it saves, and the side well ahead may press at the end.
 */
import { describe, expect, it } from "vitest";
import { evaluateFor } from "../../../src/core/battle/index.ts";
import type { BattleState } from "../../../src/core/battle/index.ts";
import { OGRE, battle, withConditions } from "../magic/helpers.ts";
import { at } from "./faction-helpers.ts";

/** An Ogre (dear per HP) and 30 Pikemen (cheap per HP) against Pikemen. */
function board(): BattleState {
  return battle({
    mine: [
      { creature: OGRE, count: 2, hex: at(0, 4) },
      { count: 30, hex: at(0, 6) },
    ],
    theirs: [{ count: 30, hex: at(14, 5) }],
  });
}

describe("battle AI valuation: Scapegoat", () => {
  it("is worth something when the dear stack's damage goes to the cheap one", () => {
    const plain = board();
    const good = withConditions(plain, "a0", [
      { kind: "scapegoat", link: "a1", clock: 3 },
    ]);
    expect(evaluateFor(good, "attacker")).toBeGreaterThan(
      evaluateFor(plain, "attacker"),
    );
  });

  it("costs value when the cheap stack's damage goes to the dear one", () => {
    const plain = board();
    const bad = withConditions(plain, "a1", [
      { kind: "scapegoat", link: "a0", clock: 3 },
    ]);
    expect(evaluateFor(bad, "attacker")).toBeLessThan(
      evaluateFor(plain, "attacker"),
    );
  });

  it("is worth nothing once the far end is gone", () => {
    const plain = board();
    const linked = withConditions(plain, "a0", [
      { kind: "scapegoat", link: "a1", clock: 3 },
    ]);
    const dead = (s: BattleState): BattleState => ({
      ...s,
      stacks: s.stacks.map((x) => (x.id === "a1" ? { ...x, count: 0 } : x)),
    });
    expect(evaluateFor(dead(linked), "attacker")).toBeCloseTo(
      evaluateFor(dead(plain), "attacker"),
      6,
    );
  });
});

describe("battle AI: the side well ahead presses at the end", () => {
  it("weighs threat differently only in the last rounds and only when ahead", () => {
    const b = board();
    const s: BattleState = {
      ...b,
      stacks: b.stacks.map((x) => (x.id === "d0" ? { ...x, count: 10 } : x)),
    };
    const diff = (round: number, side: "attacker" | "defender"): number => {
      const at = { ...s, round };
      return (
        evaluateFor(at, side, { weights: { aheadRounds: 3 } }) -
        evaluateFor(at, side, { weights: { aheadRounds: 0 } })
      );
    };
    // The attacker (2 Ogres and 30 Pikemen) is well ahead of 10 Pikemen.
    expect(diff(5, "attacker")).toBe(0);
    expect(diff(14, "attacker")).not.toBe(0);
    expect(diff(14, "defender")).toBe(0);
  });
});

describe("battle AI valuation: Warded", () => {
  it("scales with the share of damage that comes as Harm", () => {
    const plain = board();
    const warded = withConditions(plain, "a0", [
      { kind: "warded", size: 40, clock: 3 },
    ]);
    const gain = (harmShare: number): number =>
      evaluateFor(warded, "attacker", { weights: { harmShare } }) -
      evaluateFor(plain, "attacker", { weights: { harmShare } });
    expect(gain(0)).toBeCloseTo(0, 6);
    expect(gain(0.4)).toBeCloseTo(2 * gain(0.2), 6);
    expect(gain(0.2)).toBeGreaterThan(0);
  });
});
