/**
 * The worked combo examples of docs/design/FACTION_LOST_WORLD.md section 4,
 * played through the engine and checked number by number.
 */

import { describe, expect, it } from "vitest";
import { previewAttack } from "../../../src/core/battle/index.ts";
import type { Hex } from "../../../src/core/battle/index.ts";
import {
  CAVEMAN,
  CHIEFTAIN,
  OGRE,
  ORC_BRUTE,
  RAPTOR,
  SHAMAN,
  SPITTER,
  TRICERATOPS,
  T_REX,
} from "./fixtures.ts";
import {
  conditionsOf,
  cond,
  damageEvents,
  patchStack,
  play,
  stack,
  start,
} from "./helpers.ts";

const at = (col: number, row: number): Hex => ({ col, row });

describe("4.1 Venom, Mob and Pack (worked example, exact)", () => {
  // Orc Brutes stand at (8,5); Cavemen A and B already reached the two hexes
  // (9,4) and (9,6), which stay adjacent when the Orcs step east to (9,5).
  const initial = start({
    startRound: 2,
    attacker: {
      hero: CHIEFTAIN,
      stacks: [
        { creature: CAVEMAN, count: 16, hex: at(9, 4) }, // a0: Cavemen A
        { creature: CAVEMAN, count: 16, hex: at(9, 6) }, // a1: Cavemen B
        { creature: SPITTER, count: 9, hex: at(2, 5) }, // a2
        { creature: RAPTOR, count: 7, hex: at(3, 3) }, // a3
      ],
    },
    defender: {
      hero: null,
      stacks: [{ creature: ORC_BRUTE, count: 20, hex: at(8, 5) }], // d0
    },
  });

  function round2() {
    expect(initial.round).toBe(2);
    expect(initial.activeStackId).toBe("a3"); // Raptors, Speed 9
    let s = play(initial, { type: "defend", stackId: "a3" }).state;
    const shot = previewAttack(s, {
      type: "shoot",
      stackId: "a2",
      targetId: "d0",
    });
    expect(shot.strike.breakdown.attack).toBe(8);
    expect(shot.strike.breakdown.defense).toBe(6);
    expect(shot.strike.breakdown.multiplier).toEqual({ num: 22, den: 20 });
    s = play(s, { type: "shoot", stackId: "a2", targetId: "d0" }).state;
    expect(shot.damage).toBe(29);
    expect(shot.kills).toBe(1);
    expect(stack(s, "d0")).toMatchObject({ count: 19, topHp: 27 });
    // Venomed (Bloom bane, size 3, clock 2): ends when round 3 ends.
    expect(conditionsOf(s, "d0")).toEqual([
      { kind: "venomed", clock: 2, size: 3 },
    ]);
    expect(stack(s, "d0").conditions[0]!.source).toBe("a2");
    // The rest of round 2: Cavemen defend, the Orcs step to (9,5).
    s = play(
      s,
      { type: "defend", stackId: "a0" },
      { type: "defend", stackId: "a1" },
      { type: "move", stackId: "d0", to: at(9, 5) },
    ).state;
    expect(s.round).toBe(3);
    return s;
  }

  it("reproduces every documented number of round 3", () => {
    let s = round2();
    // Order: Raptors wait; Spitters; Cavemen A, B; Orcs; waiting Raptors.
    expect(s.queue).toEqual(["a3", "a2", "a0", "a1", "d0"]);
    s = play(s, { type: "wait", stackId: "a3" }).state;
    expect(s.queue).toEqual(["a2", "a0", "a1", "d0"]);
    expect(s.waiting).toEqual(["a3"]);

    // 1. Spitters shoot: D = 6 - 3 = 3, M 1.25, 33 damage.
    let step = play(s, { type: "shoot", stackId: "a2", targetId: "d0" });
    const [hit] = damageEvents(step.events);
    expect(hit!.breakdown.defense).toBe(3);
    expect(hit!.breakdown.multiplier).toEqual({ num: 25, den: 20 });
    expect([hit!.damage, hit!.kills]).toEqual([33, 1]);
    s = step.state;
    expect(stack(s, "d0")).toMatchObject({ count: 18, topHp: 22 });
    // Refreshed in round 3: clock 2 again (ends when round 4 ends).
    expect(stack(s, "d0").conditions[0]!.clock).toBe(2);

    // 2. Cavemen A attack with Mob +1; 2r. the Orcs retaliate.
    step = play(s, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(9, 4),
    });
    const [a2, r2] = damageEvents(step.events);
    expect(a2!.breakdown.attack).toBe(7);
    expect(a2!.breakdown.attackModifiers).toEqual([
      { source: "mob", label: "Mob", amount: 1 },
    ]);
    expect([a2!.damage, a2!.kills]).toEqual([38, 1]);
    expect(r2!.kind).toBe("retaliation");
    expect(r2!.breakdown.defense).toBe(5);
    expect([r2!.damage, r2!.kills]).toEqual([122, 12]);
    s = step.state;
    expect(stack(s, "d0")).toMatchObject({ count: 17, topHp: 12 });
    expect(stack(s, "a0")).toMatchObject({ count: 4, topHp: 8 });

    // 3. Cavemen B attack, Mob +1 (Cavemen A); no retaliation left.
    step = play(s, {
      type: "attack",
      stackId: "a1",
      targetId: "d0",
      from: at(9, 6),
    });
    expect(damageEvents(step.events).map((e) => [e.damage, e.kills])).toEqual([
      [38, 1],
    ]);
    s = step.state;
    expect(stack(s, "d0")).toMatchObject({ count: 16, topHp: 2 });

    // 4. Orc Brutes attack Cavemen B; 4r. Cavemen B retaliate with Mob +1.
    step = play(s, {
      type: "attack",
      stackId: "d0",
      targetId: "a1",
      from: at(9, 5),
    });
    const [a4, r4] = damageEvents(step.events);
    expect([a4!.damage, a4!.kills]).toEqual([115, 11]);
    expect(r4!.breakdown.attack).toBe(7);
    expect([r4!.damage, r4!.kills]).toEqual([12, 1]);
    s = step.state;
    expect(stack(s, "a1")).toMatchObject({ count: 5, topHp: 5 });
    expect(stack(s, "d0")).toMatchObject({ count: 15, topHp: 18 });

    // 5. The waiting Raptors step in: Pack Hunter x 1.40, 66 damage.
    expect(s.activeStackId).toBe("a3");
    const action = {
      type: "attack",
      stackId: "a3",
      targetId: "d0",
      from: at(10, 5),
    } as const;
    const preview = previewAttack(s, action);
    expect(preview.strike.breakdown.attack).toBe(10);
    expect(preview.strike.breakdown.multiplier).toEqual({ num: 27, den: 20 });
    expect(preview.strike.breakdown.abilityMultipliers).toEqual([
      { source: "pack-hunter", label: "Pack Hunter", percent: 140 },
    ]);
    expect(preview).toMatchObject({
      damage: 66,
      kills: 2,
      retaliationDamage: 0,
      retaliationKills: 0,
      retaliation: null,
    });
    s = play(s, action).state;
    expect(stack(s, "d0")).toMatchObject({ count: 13, topHp: 8 });
    expect(stack(s, "a3").count).toBe(7);
  });

  it("without the combo the Raptors lose 5 of 7", () => {
    // Raptors open round 3 into the unvenomed stack of 19 (top 27).
    let s = round2();
    s = patchStack(s, "d0", { conditions: [] });
    s = patchStack(s, "a0", { hex: at(0, 0) });
    s = patchStack(s, "a1", { hex: at(0, 10) });
    const p = previewAttack(s, {
      type: "attack",
      stackId: "a3",
      targetId: "d0",
      from: at(10, 5),
    });
    expect(p.strike.breakdown.multiplier).toEqual({ num: 24, den: 20 });
    expect([p.damage, p.kills]).toEqual([42, 1]);
    // The doc writes floor(19 x 6 x 1.10) = 125; the rules compute the
    // retaliation on the survivors (18): floor(118.8) = 118. Same 5 kills.
    expect([p.retaliationDamage, p.retaliationKills]).toEqual([118, 5]);
  });
});

describe("4.2 War Drums beside a charging Triceratops", () => {
  function setup(shamanHex: Hex, triHex: Hex) {
    return start({
      attacker: {
        hero: CHIEFTAIN,
        stacks: [
          { creature: TRICERATOPS, count: 4, hex: triHex },
          { creature: SHAMAN, count: 3, hex: shamanHex },
        ],
      },
      defender: {
        hero: null,
        stacks: [{ creature: OGRE, count: 6, hex: at(8, 5) }],
      },
    });
  }
  const charge = {
    type: "attack",
    stackId: "a0",
    targetId: "d0",
    from: at(7, 5),
  } as const;

  it("combo: Drums +2, Charge x 1.75", () => {
    const s = setup(at(7, 4), at(2, 5));
    const p = previewAttack(s, charge);
    expect(p.hexesMoved).toBe(5);
    expect(p.strike.breakdown.attack).toBe(17);
    expect(p.strike.breakdown.attackModifiers).toEqual([
      {
        source: "war-drums",
        label: "War Drums",
        amount: 2,
        stackKey: "war-drums",
      },
    ]);
    expect(p.strike.breakdown.abilityMultipliers).toEqual([
      { source: "charge", label: "Charge", percent: 175 },
    ]);
    expect([p.damage, p.kills, p.strike.targetTopHpAfter]).toEqual([
      131, 1, 49,
    ]);
    expect(p.retaliation!.breakdown.defense).toBe(18);
    expect(p.retaliation!.breakdown.abilityMultipliers).toEqual([]);
    expect([p.retaliationDamage, p.retaliationKills]).toEqual([66, 0]);
  });

  it("no combo: standing still, no Drums", () => {
    const s = setup(at(0, 0), at(7, 5));
    const p = previewAttack(s, charge);
    expect(p.hexesMoved).toBe(0);
    expect([p.damage, p.kills, p.strike.targetTopHpAfter]).toEqual([69, 0, 21]);
    expect([p.retaliationDamage, p.retaliationKills]).toEqual([80, 1]);
  });

  it("combo plus Venom (D 9)", () => {
    const s = patchStack(setup(at(7, 4), at(2, 5)), "d0", {
      conditions: [cond("venomed", { size: 3, clock: 2 })],
    });
    const p = previewAttack(s, charge);
    expect(p.strike.breakdown.defense).toBe(9);
    expect([p.damage, p.kills, p.strike.targetTopHpAfter]).toEqual([
      147, 1, 33,
    ]);
    expect([p.retaliationDamage, p.retaliationKills]).toEqual([66, 0]);
  });
});

describe("4.3 T-Rex finisher", () => {
  it("one T-Rex with Drums into venomed Orc Brutes deals 82, no retaliation", () => {
    let s = start({
      attacker: {
        hero: CHIEFTAIN,
        stacks: [
          { creature: T_REX, count: 1, hex: at(7, 5) },
          { creature: SHAMAN, count: 1, hex: at(7, 4) },
        ],
      },
      defender: {
        hero: null,
        stacks: [{ creature: ORC_BRUTE, count: 20, hex: at(8, 5) }],
      },
    });
    s = patchStack(s, "d0", {
      conditions: [cond("venomed", { size: 3, clock: 2 })],
    });
    const p = previewAttack(s, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(7, 5),
    });
    expect(p.strike.breakdown.attack).toBe(24);
    expect(p.strike.breakdown.defense).toBe(3);
    expect(p.strike.breakdown.multiplier).toEqual({ num: 41, den: 20 });
    expect(p.damage).toBe(82);
    expect(p.retaliation).toBeNull();
  });
});
