/**
 * The worked combos of MAGIC_AND_FACTIONS_CONCEPT.md (sections 2 and 8),
 * built from test-only content (content.ts) on the real engine. Nobody
 * wrote "Notary plus Scapegoat": each combo follows from the laws.
 */

import { describe, expect, it } from "vitest";
import {
  actionError,
  createBattle,
  getStack,
  rehearse,
} from "../../../src/core/battle/index.ts";
import type {
  BattleAction,
  BattleEvent,
  BattleState,
  Hex,
} from "../../../src/core/battle/index.ts";
import { ACOLYTE, BELLHOP, NOTARY } from "./content.ts";
import {
  GOBLIN,
  OGRE,
  ORC_WARBOSS,
  RAPTOR,
  TRICERATOPS,
  TROLL,
  T_REX,
} from "./fixtures.ts";
import { patchStack, play, stack } from "./helpers.ts";

const at = (col: number, row: number): Hex => ({ col, row });
const HERO = { attack: 0, defense: 0 };

function uidOf(state: BattleState, id: string, kind: string): number {
  const c = getStack(state, id).conditions.find((x) => x.kind === kind);
  if (!c) throw new Error(`${id} bears no ${kind}`);
  return c.uid;
}

/** One line per step, like the interface's chain preview. */
function chainTypes(events: readonly BattleEvent[]): string[] {
  return events.map((e) =>
    e.type === "condition"
      ? `condition:${e.change}:${e.condition.kind}`
      : e.type,
  );
}

describe("2. The scapegoat who signed nothing", () => {
  const base = () =>
    createBattle({
      seed: 1,
      obstacles: [],
      attacker: {
        hero: HERO,
        stacks: [
          { creature: TRICERATOPS, count: 3, hex: at(6, 5) }, // a0
          { creature: NOTARY, count: 5, hex: at(2, 2) }, // a1
        ],
      },
      defender: {
        hero: null,
        stacks: [
          { creature: OGRE, count: 8, hex: at(12, 2) }, // d0, 720 HP
          { creature: TROLL, count: 6, hex: at(7, 5) }, // d1
        ],
      },
    }).state;

  /** Round 1: stamp the Ogres, Scapegoat the Triceratops onto them. */
  function signed(): BattleState {
    let s = base();
    expect(s.activeStackId).toBe("a1"); // Notaries, Speed 10
    s = play(s, {
      type: "ability",
      stackId: "a1",
      ability: "notary-stamp",
      targets: [{ stack: "d0" }],
    }).state;
    expect(stack(s, "d0").side).toBe("attacker"); // Turned: mine this round
    expect(stack(s, "d0").owner).toBe("defender");
    expect(s.activeStackId).toBe("a0");
    // Legal now: both stacks are friendly at the moment of choosing.
    s = play(s, {
      type: "heroAct",
      stackId: "a0",
      act: "scapegoat",
      targets: [{ stack: "a0" }, { stack: "d0" }],
    }).state;
    expect(s.activeStackId).toBe("a0"); // the cast does not end the turn
    s = play(
      s,
      { type: "defend", stackId: "a0" },
      { type: "defend", stackId: "d1" },
      { type: "defend", stackId: "d0" }, // the stamped Ogres act for me
    ).state;
    return s;
  }

  it("the stamp is checked once: the link outlives it", () => {
    const s = signed();
    expect(s.round).toBe(2);
    const ogres = stack(s, "d0");
    expect(ogres.side).toBe("defender"); // the stamp expired
    expect(ogres.wary).toBeGreaterThan(0); // a Hold left: Wary
    const link = stack(s, "a0").conditions.find((c) => c.kind === "scapegoat");
    expect(link).toMatchObject({ link: "d0", clock: 2, school: "accord" });
  });

  it("the Trolls' retaliation lands on the Ogres: the preview chain", () => {
    let s = signed();
    s = play(s, { type: "defend", stackId: "a1" }).state;
    expect(s.activeStackId).toBe("a0");
    const r = rehearse(s, {
      type: "attack",
      stackId: "a0",
      targetId: "d1",
      from: at(6, 5),
    });
    expect(r.legal).toBe(true);
    expect(chainTypes(r.steps)).toEqual([
      "attack",
      "damage", // Triceratops strike Trolls
      "retaliation",
      "damage", // Trolls strike Triceratops, redirected
      "linkTransfer",
      "harm", // the Ogres take it
    ]);
    const ret = r.steps[3] as Extract<BattleEvent, { type: "damage" }>;
    expect(ret.redirectedTo).toBe("d0");
    expect(ret.kills).toBe(0);
    const harm = r.steps[5] as Extract<BattleEvent, { type: "harm" }>;
    expect(harm).toMatchObject({ targetId: "d0", viaLink: true });
    expect(harm.harm).toBe(ret.damage);
    expect(harm.cause).toBe(4); // caused by the link transfer
    // The Triceratops lose nothing; the Ogres pay.
    expect(stack(r.after, "a0")).toMatchObject({ count: 3, topHp: 80 });
    const ogresHp = (c: { count: number; topHp: number }) =>
      (c.count - 1) * 90 + c.topHp;
    expect(ogresHp(stack(s, "d0")) - ogresHp(stack(r.after, "d0"))).toBe(
      ret.damage,
    );
    expect(r.summary.find((x) => x.stackId === "a0")?.hpLost ?? 0).toBe(0);
    // The rehearsal is the real chain.
    const real = play(s, {
      type: "attack",
      stackId: "a0",
      targetId: "d1",
      from: at(6, 5),
    });
    expect(real.events.slice(0, r.steps.length)).toEqual(r.steps);
  });

  it("damage the scapegoat cannot absorb comes back to the protected stack", () => {
    let s = signed();
    // Wear the Ogres down to one creature (state surgery for the setup).
    s = patchStack(s, "d0", { count: 1, topHp: 90 });
    s = play(s, { type: "defend", stackId: "a1" }).state;
    // Round 2, a0's turn: a 150 Harm bolt on my own Triceratops (law 5).
    const r = rehearse(s, {
      type: "heroAct",
      stackId: "a0",
      act: "bolt",
      targets: [{ stack: "a0" }],
    });
    const transfer = r.steps.find((e) => e.type === "linkTransfer");
    expect(transfer).toMatchObject({ amount: 150, excess: 60 });
    expect(stack(r.after, "d0").count).toBe(0); // the scapegoat died
    // Its link ended with it; the excess came back as Harm, never redirected.
    expect(stack(r.after, "a0").conditions).toEqual([]);
    expect(stack(r.after, "a0")).toMatchObject({ count: 3, topHp: 20 });
    expect(chainTypes(r.steps)).toEqual([
      "heroAct",
      "harm", // 150 on the Triceratops, redirected
      "linkTransfer",
      "harm", // 150 to the Ogre (90 HP)
      "death",
      "ground", // the Ogre's corpse
      "condition:ended:scapegoat", // the link ends with its far end
      "harm", // 60 back to the Triceratops
    ]);
  });

  it("without the stamp the cast is refused at the choosing step (law 3)", () => {
    let s = base();
    s = play(s, { type: "defend", stackId: "a1" }).state;
    expect(
      actionError(s, {
        type: "heroAct",
        stackId: "a0",
        act: "scapegoat",
        targets: [{ stack: "a0" }, { stack: "d0" }],
      }),
    ).toBe("choose two friendly stacks");
  });
});

describe("8.4 The albatross changes necks", () => {
  const base = () =>
    createBattle({
      seed: 1,
      obstacles: [],
      attacker: {
        hero: HERO,
        startRules: [{ id: "albatross" }],
        stacks: [
          { creature: TRICERATOPS, count: 4, hex: at(6, 5) }, // a0, strongest
          { creature: BELLHOP, count: 3, hex: at(7, 4) }, // a1
        ],
      },
      defender: {
        hero: null,
        stacks: [
          { creature: OGRE, count: 5, hex: at(7, 5) }, // d0, their best
          { creature: GOBLIN, count: 10, hex: at(13, 1) },
        ],
      },
    });

  it("every battle my strongest stack starts Jinxed", () => {
    const { state, events } = base();
    expect(stack(state, "a0").conditions).toEqual([
      expect.objectContaining({ kind: "jinxed", size: 25, clock: 3 }),
    ]);
    // A visible battle-start step, before round 1.
    const landed = events.findIndex(
      (e) => e.type === "condition" && e.change === "landed",
    );
    const round1 = events.findIndex((e) => e.type === "roundStart");
    expect(landed).toBeGreaterThanOrEqual(0);
    expect(landed).toBeLessThan(round1);
  });

  it("the Bellhops carry the jinx to the enemy's best stack", () => {
    let s = base().state;
    const jinx = uidOf(s, "a0", "jinxed");
    // Jinxed on my Triceratops: the Ogres' retaliation would not be met
    // with one of mine, and Strikes against it are x 125%.
    const before = rehearse(play(s, { type: "defend", stackId: "a1" }).state, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(6, 5),
    });
    const ret0 = before.steps.find(
      (e) => e.type === "damage" && e.kind === "retaliation",
    ) as Extract<BattleEvent, { type: "damage" }>;
    expect(ret0.breakdown.abilityMultipliers).toContainEqual(
      expect.objectContaining({ source: "jinxed", percent: 125 }),
    );
    s = play(s, {
      type: "ability",
      stackId: "a1",
      ability: "bellhop-carry",
      targets: [{ stack: "a0", condition: jinx }, { stack: "d0" }],
    }).state;
    expect(stack(s, "a0").conditions).toEqual([]);
    expect(stack(s, "d0").conditions).toEqual([
      expect.objectContaining({ kind: "jinxed", size: 25, clock: 3 }),
    ]);
    // Now the Ogres cannot retaliate and take x 125%.
    const r = rehearse(s, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(6, 5),
    });
    const hit = r.steps.find((e) => e.type === "damage") as Extract<
      BattleEvent,
      { type: "damage" }
    >;
    expect(hit.breakdown.abilityMultipliers).toContainEqual(
      expect.objectContaining({ source: "jinxed", percent: 125 }),
    );
    expect(r.steps.some((e) => e.type === "retaliation")).toBe(false);
    // The carry was the Bellhops' one use this battle.
    expect(stack(s, "a1").abilitiesUsed).toEqual(["bellhop-carry"]);
  });
});

describe("8.2 Burning the bill", () => {
  const base = () =>
    createBattle({
      seed: 1,
      obstacles: [],
      attacker: {
        hero: HERO,
        stacks: [
          { creature: ACOLYTE, count: 4, hex: at(2, 2) }, // a0
          { creature: RAPTOR, count: 10, hex: at(6, 5) }, // a1, 220 HP
        ],
      },
      defender: {
        hero: null,
        stacks: [
          { creature: ORC_WARBOSS, count: 2, hex: at(7, 5) }, // d0
          { creature: GOBLIN, count: 5, hex: at(13, 9) }, // d1
        ],
      },
    }).state;

  const hit: BattleAction = {
    type: "attack",
    stackId: "a1",
    targetId: "d0",
    from: at(6, 5),
  };

  /** Rounds 1 and 2: the Raptors strike at x 150% and the debt grows. */
  function indebted(): BattleState {
    let s = base();
    s = play(s, {
      type: "ability",
      stackId: "a0",
      ability: "acolyte-bargain",
      targets: [{ stack: "a1" }],
    }).state;
    expect(stack(s, "a1").conditions).toEqual([
      expect.objectContaining({ kind: "reckoning", size: 0, clock: 3 }),
    ]);
    const p = rehearse(s, hit);
    const strike = p.steps.find((e) => e.type === "damage") as Extract<
      BattleEvent,
      { type: "damage" }
    >;
    expect(strike.breakdown.abilityMultipliers).toContainEqual(
      expect.objectContaining({ source: "reckoning", percent: 150 }),
    );
    const bonus = strike.damage - Math.floor((strike.damage * 2) / 3);
    s = play(s, hit).state;
    expect(stack(s, "a1").conditions[0]!.size).toBe(bonus);
    // Rest of round 1 and round 2: everyone else defends, Raptors hit again.
    while (s.round === 1) {
      s = play(s, { type: "defend", stackId: s.activeStackId! }).state;
    }
    s = play(s, { type: "defend", stackId: "a0" }).state;
    const size1 = stack(s, "a1").conditions[0]!.size;
    s = play(s, hit).state;
    expect(stack(s, "a1").conditions[0]!.size).toBeGreaterThan(size1);
    while (s.round === 2) {
      s = play(s, { type: "defend", stackId: s.activeStackId! }).state;
    }
    s = play(s, { type: "defend", stackId: "a0" }).state;
    expect(s.activeStackId).toBe("a1");
    expect(stack(s, "a1").conditions[0]!.clock).toBe(1); // falls due tonight
    return s;
  }

  it("Regrow burns the Reckoning as Fuel: the debt is gone, the heal doubled", () => {
    const s = indebted();
    const raptors = stack(s, "a1");
    const debt = raptors.conditions[0]!;
    expect(raptors.count).toBeLessThan(10); // losses to the Warboss
    const r = rehearse(s, {
      type: "heroAct",
      stackId: "a1",
      act: "regrow",
      targets: [{ stack: "a1" }, { stack: "a1", condition: debt.uid }],
    });
    // The debt ends (no expiry rule), Regrow heals 80 instead of 40.
    expect(r.steps).toContainEqual(
      expect.objectContaining({
        type: "condition",
        change: "ended",
        condition: expect.objectContaining({ kind: "reckoning" }),
      }),
    );
    const heal = r.steps.find((e) => e.type === "heal") as Extract<
      BattleEvent,
      { type: "heal" }
    >;
    const missing =
      (raptors.initialCount - raptors.count) * 22 + (22 - raptors.topHp);
    expect(heal.amount).toBe(Math.min(80, missing));
    expect(stack(r.after, "a1").count).toBe(
      Math.min(10, raptors.count + heal.revived),
    );
    // Round 3 ends: nothing falls due.
    let t = r.after;
    const events: BattleEvent[] = [];
    while (t.round === 3 && t.winner === null) {
      const step = play(t, { type: "defend", stackId: t.activeStackId! });
      events.push(...step.events);
      t = step.state;
    }
    expect(events.some((e) => e.type === "harm")).toBe(false);
    expect(stack(t, "a1").count).toBe(stack(r.after, "a1").count);
  });

  it("Pass On sends the bill to the enemy Warboss; it falls due on them", () => {
    let s = indebted();
    const debt = stack(s, "a1").conditions[0]!;
    s = play(s, {
      type: "heroAct",
      stackId: "a1",
      act: "pass-on",
      targets: [{ stack: "a1", condition: debt.uid }, { stack: "d0" }],
    }).state;
    expect(stack(s, "a1").conditions).toEqual([]);
    expect(stack(s, "d0").conditions).toEqual([
      expect.objectContaining({ kind: "reckoning", size: debt.size, clock: 1 }),
    ]);
    const raptorsBefore = stack(s, "a1");
    const bossBefore = stack(s, "d0");
    // Round 3 plays out with everyone defending; the clock runs out.
    const events: BattleEvent[] = [];
    while (s.round === 3 && s.winner === null) {
      const step = play(s, { type: "defend", stackId: s.activeStackId! });
      events.push(...step.events);
      s = step.state;
    }
    const due = events.find((e) => e.type === "harm") as Extract<
      BattleEvent,
      { type: "harm" }
    >;
    expect(due).toMatchObject({ targetId: "d0", x: debt.size });
    expect(stack(s, "a1")).toMatchObject({
      count: raptorsBefore.count,
      topHp: raptorsBefore.topHp,
    });
    const hp = (c: { count: number; topHp: number }) =>
      (c.count - 1) * 140 + c.topHp;
    expect(hp(bossBefore) - hp(stack(s, "d0"))).toBe(
      Math.min(debt.size, hp(bossBefore)),
    );
  });
});

describe("8.5 One that fails: laundering a mind", () => {
  const base = () =>
    createBattle({
      seed: 1,
      obstacles: [],
      attacker: {
        hero: HERO,
        stacks: [
          { creature: NOTARY, count: 5, hex: at(2, 2) }, // a0
          { creature: RAPTOR, count: 4, hex: at(2, 8) }, // a1
        ],
      },
      defender: {
        hero: null,
        stacks: [
          { creature: GOBLIN, count: 10, hex: at(8, 5) }, // d0, 80 HP
          { creature: T_REX, count: 5, hex: at(9, 5) }, // d1, 1000 HP
        ],
      },
    }).state;

  function stamped(): { s: BattleState; turned: number } {
    let s = base();
    s = play(s, {
      type: "ability",
      stackId: "a0",
      ability: "notary-stamp",
      targets: [{ stack: "d0" }],
    }).state;
    expect(stack(s, "d0").side).toBe("attacker");
    return { s, turned: uidOf(s, "d0", "turned") };
  }

  it("the stamp carries its gate: passing it to the T-Rex is refused", () => {
    const { s, turned } = stamped();
    expect(s.activeStackId).toBe("a1");
    const pass: BattleAction = {
      type: "heroAct",
      stackId: "a1",
      act: "pass-on",
      targets: [{ stack: "d0", condition: turned }, { stack: "d1" }],
    };
    const r = rehearse(s, pass);
    expect(r.legal).toBe(true); // the choice is legal; the landing refuses
    expect(r.steps).toContainEqual(
      expect.objectContaining({
        type: "condition",
        stackId: "d1",
        change: "refused",
        reason: "gate",
        detail: "gate 800 HP, target has 1000",
      }),
    );
    // It stays where it was, and the page is still spent.
    expect(stack(r.after, "d0").side).toBe("attacker");
    expect(stack(r.after, "d1").side).toBe("defender");
    expect(r.after.sides.attacker.castRound).toBe(r.after.round);
  });

  it("worn down under the gate first, the pass works", () => {
    const { s, turned } = stamped();
    const worn = patchStack(s, "d1", { count: 4 }); // 800 HP: at the gate
    const r = rehearse(worn, {
      type: "heroAct",
      stackId: "a1",
      act: "pass-on",
      targets: [{ stack: "d0", condition: turned }, { stack: "d1" }],
    });
    expect(stack(r.after, "d1").side).toBe("attacker"); // the T-Rex defects
    expect(stack(r.after, "d0").side).toBe("defender");
    expect(stack(r.after, "d0").wary).toBeGreaterThan(0); // held, then left
  });
});
