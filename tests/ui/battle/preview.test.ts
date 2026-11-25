import { describe, expect, it } from "vitest";
import {
  BATTLE_HEIGHT,
  createBattle,
  getStack,
  legalActions,
  makeCondition,
  previewAttack,
  rehearse,
} from "../../../src/core/battle/index.ts";
import { batchDuration, hopDuration } from "../../../src/ui/battle/animate.ts";
import { registerSpells } from "../../../src/core/magic/spells.ts";
import { hexToStage } from "../../../src/render/battle/geometry.ts";
import { attackChainLines } from "../../../src/ui/battle/grammar.ts";
import {
  hoverIntent,
  indexLegalActions,
} from "../../../src/ui/battle/intent.ts";
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
    expect(attackLine(p.strike!.breakdown)).toBe("Atk 10 vs Def 6 → ×1.20");
    expect(strikeHeadline(sum.strike!)).toBe("42 damage, 1 killed");
    expect(stackChange(sum.strike!)).toBe("Orc Brutes 19 → 18, top 14/28 HP");
    expect(sum.retaliation).not.toBeNull();
    const r = sum.retaliation!;
    expect(strikeHeadline(r)).toBe("118 damage, 5 killed");
    expect(stackChange(r)).toBe("Raptors 7 → 2, top 14/22 HP");
    expect(r.attackLine).toBe("Atk 9 vs Def 7 → ×1.10");
    expect(r.bonuses).toEqual(["Hero +2 Def"]);
    expect(sum.noRetaliation).toBeNull();
    // The numbers are the engine's, not recomputed.
    expect([sum.strike!.damage, r.damage]).toEqual([
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
    expect(strikeHeadline(kill.strike!)).toBe("35 damage, all 2 killed");
    expect(stackChange(kill.strike!)).toBe("Goblins 2 → 0");
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
    expect(breakdownBonuses(p.strike!.breakdown)).toEqual([
      "Hero +2 Atk",
      "Venomed −3 Def",
      "Defending ×1.3 Def",
      "Pack Hunter +20%",
    ]);
  });
});

describe("an attack that never strikes (bzc.33)", () => {
  // Wolf Riders charge Skeletons across a column of fire that kills them.
  registerSpells();
  const s = createBattle({
    seed: 1,
    obstacles: [],
    ground: Array.from({ length: BATTLE_HEIGHT }, (_, row) => ({
      hex: at(5, row),
      kind: "fire",
      size: 100,
    })),
    attacker: { hero: null, stacks: [unit("wolf-rider", 2, at(3, 5))] },
    defender: {
      hero: null,
      stacks: [unit("skeleton", 5, at(8, 5)), unit("skeleton", 5, at(14, 0))],
    },
  }).state;
  const charge = {
    type: "attack",
    stackId: "a0",
    targetId: "d0",
    from: at(7, 5),
  } as const;

  it("says the attacker dies on the way, with no strike or retaliation", () => {
    const sum = summarizePreview(s, previewAttack(s, charge));
    expect(sum.strike).toBeNull();
    expect(sum.retaliation).toBeNull();
    expect(sum.noRetaliation).toBeNull();
    expect(sum.noStrike).toBe("Wolf Riders die on the way: no attack");
    // They die on the fire at column 5: two hexes into the four-hex walk.
    expect(sum.hexesMoved).toBe(2);
  });

  it("rehearsal, preview chain and animator agree on where they die", () => {
    const p = previewAttack(s, charge);
    const r = rehearse(s, charge);
    const move = r.steps.find((e) => e.type === "move");
    if (move?.type !== "move") throw new Error("no move");
    const dead = move.to;
    expect(dead.col).toBe(5);
    expect(move.path).toHaveLength(2);
    expect(p.chain.find((e) => e.type === "move")).toEqual(move);
    expect(getStack(r.after, "a0").hex).toEqual(dead);
    // The chain puts the corpse there, and the animator walks two hops.
    expect(attackChainLines(s, p)).toContain(
      `Corpse added at ${dead.col},${dead.row}`,
    );
    expect(batchDuration([move])).toBe(2 * hopDuration(2));
  });

  it("the chain reads as the rehearsal: into the fire, destroyed, no attack", () => {
    const p = previewAttack(s, charge);
    const lines = attackChainLines(s, p);
    expect(lines.slice(0, 2)).toEqual([
      "Wolf Riders walk into fire, take 100 Harm, all killed",
      "Wolf Riders destroyed",
    ]);
    expect(lines.at(-1)).toBe("no attack");
    expect(lines.some((l) => l.includes("strike"))).toBe(false);
  });

  it("a stack of one is singular", () => {
    const one = patch(s, "a0", { count: 1 });
    const p = previewAttack(one, charge);
    expect(summarizePreview(one, p).noStrike).toBe(
      "Wolf Rider dies on the way: no attack",
    );
    expect(attackChainLines(one, p)[0]).toBe(
      "Wolf Rider walks into fire, takes 100 Harm, all killed",
    );
  });

  it("the battle screen's hover gives that preview instead of throwing", () => {
    const legal = indexLegalActions(legalActions(s));
    const c = hexToStage(at(8, 5));
    const n = hexToStage(at(7, 5));
    const pointer = { x: c.x + (n.x - c.x) * 0.4, y: c.y + (n.y - c.y) * 0.4 };
    const it = hoverIntent(s, legal, at(8, 5), pointer, true);
    expect(it.kind).toBe("attack");
    if (it.kind !== "attack") return;
    expect(it.action).toEqual(charge);
    expect(it.preview.strike).toBeNull();
    expect(it.preview.noStrike).toBe("attackerDied");
  });
});
