import { describe, expect, it } from "vitest";
import {
  makeCondition,
  previewAttack,
} from "../../../src/core/battle/index.ts";
import {
  attackLine,
  breakdownBonuses,
  conjugate,
  formatMultiplier,
  stackChange,
  strikeHeadline,
  summarizePreview,
} from "../../../src/ui/battle/preview.ts";
import { at, battle, patch, unit } from "./helpers.ts";

describe("conjugate", () => {
  it("agrees with a stack of one", () => {
    expect(conjugate("attack", 1)).toBe("attacks");
    expect(conjugate("retaliate on", 1)).toBe("retaliates on");
    expect(conjugate("attack", 7)).toBe("attack");
  });
});

describe("formatMultiplier", () => {
  it("rounds the exact rational to two decimals", () => {
    expect(formatMultiplier({ num: 20, den: 24 })).toBe("0.83");
    expect(formatMultiplier({ num: 27, den: 20 })).toBe("1.35");
    expect(formatMultiplier({ num: 3, den: 10 })).toBe("0.30");
    expect(formatMultiplier({ num: 80, den: 20 })).toBe("4.00");
  });
});

describe("summarizePreview", () => {
  it("shows FACTION_LOST_WORLD 4.1 without the combo: 42 dealt, 118 back", () => {
    // Raptors (hero +2/+2) hit a fresh stack of 19 Orc Brutes alone.
    const s = battle(
      [unit("raptor", 7, at(6, 5))],
      [unit("orc-brute", 19, at(7, 5))],
    );
    const action = {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(6, 5),
    } as const;
    const p = previewAttack(s, action);
    const sum = summarizePreview(s, p);
    expect(sum.verb).toBe("Attack");
    expect(sum.attacker).toBe("Raptors");
    expect(sum.target).toBe("Orc Brutes");
    expect(attackLine(p.strike.breakdown)).toBe("Atk 10 vs Def 6 → ×1.20");
    expect(strikeHeadline(sum.strike)).toBe("42 damage, 1 killed");
    expect(stackChange(sum.strike)).toBe("Orc Brutes 19 → 18, top 14/28 HP");
    expect(sum.retaliation).not.toBeNull();
    const r = sum.retaliation!;
    expect(strikeHeadline(r)).toBe("118 damage, 5 killed");
    expect(stackChange(r)).toBe("Raptors 7 → 2, top 14/22 HP");
    expect(r.attackLine).toBe("Atk 9 vs Def 7 → ×1.10");
    expect(r.bonuses).toEqual(["Hero +2 Def"]);
    expect(sum.noRetaliation).toBeNull();
    // The numbers are the engine's, not recomputed.
    expect([sum.strike.damage, r.damage]).toEqual([
      p.damage,
      p.retaliationDamage,
    ]);
  });

  it("says why there is no retaliation", () => {
    const s = battle(
      [
        unit("spitter", 10, at(2, 2)),
        unit("t-rex", 1, at(6, 5)),
        unit("raptor", 5, at(8, 8)),
      ],
      [unit("orc-brute", 19, at(7, 5)), unit("goblin", 2, at(9, 8))],
    );
    // Each case makes its attacker the active stack.
    const shooter = { ...s, activeStackId: "a0" };
    const shot = summarizePreview(
      shooter,
      previewAttack(shooter, { type: "shoot", stackId: "a0", targetId: "d0" }),
    );
    expect(shot.verb).toBe("Shoot");
    expect(shot.noRetaliation).toBe("Shots are never retaliated");
    expect(shot.statuses).toEqual(["Venomed on Orc Brutes (−3 Def, 2 rounds)"]);

    const rex = { ...s, activeStackId: "a1" };
    const terror = summarizePreview(
      rex,
      previewAttack(rex, {
        type: "attack",
        stackId: "a1",
        targetId: "d0",
        from: at(6, 5),
      }),
    );
    expect(terror.noRetaliation).toBe("Terror: no retaliation");

    const raptors = { ...s, activeStackId: "a2" };
    const kill = summarizePreview(
      raptors,
      previewAttack(raptors, {
        type: "attack",
        stackId: "a2",
        targetId: "d1",
        from: at(8, 8),
      }),
    );
    expect(strikeHeadline(kill.strike)).toBe("35 damage, all 2 killed");
    expect(stackChange(kill.strike)).toBe("Goblins 2 → 0");
    expect(kill.noRetaliation).toBe("Target destroyed: no retaliation");

    const used = patch(raptors, "d0", { retaliatedThisRound: true });
    const spent = summarizePreview(
      used,
      previewAttack(used, {
        type: "attack",
        stackId: "a2",
        targetId: "d0",
        from: at(7, 6),
      }),
    );
    expect(spent.noRetaliation).toBe("Already retaliated this round");
  });

  it("lists every modifier that applied", () => {
    const s = battle(
      [unit("raptor", 7, at(6, 5)), unit("caveman", 10, at(7, 4))],
      [unit("orc-brute", 19, at(7, 5))],
    );
    const venomed = patch({ ...s, activeStackId: "a0" }, "d0", {
      defending: true,
      conditions: [
        makeCondition({ kind: "venomed", size: 3, clock: 2 }, 900, "x"),
      ],
    });
    const p = previewAttack(venomed, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(6, 5),
    });
    expect(breakdownBonuses(p.strike.breakdown)).toEqual([
      "Hero +2 Atk",
      "Venomed −3 Def",
      "Defending ×1.3 Def",
      "Pack Hunter +20%",
    ]);
  });
});
