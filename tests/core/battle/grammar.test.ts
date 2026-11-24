/**
 * Every rule of the battle grammar (RULES_V2.md 1.1 to 1.13 and 6) on small
 * hand-built states. Test-only content lives in content.ts; `withFx` runs
 * verbs directly as a content rule would.
 */

import { describe, expect, it } from "vitest";
import {
  MAX_CONDITIONS,
  MAX_REACTION_STEPS,
  MAX_SCHEDULED,
  ROUND_LIMIT,
  actionError,
  applyAction,
  chooseAiAction,
  computeHarm,
  createBattle,
  creatureFightValue,
  enemyIntents,
  groundAt,
  rehearse,
  rehearsePlan,
  strikePercentProduct,
  takeBackIndex,
} from "../../../src/core/battle/index.ts";
import type {
  BattleAction,
  BattleArmySetup,
  BattleEvent,
  BattleSetup,
  BattleState,
  Hex,
  HistoryEntry,
} from "../../../src/core/battle/index.ts";
import { BELLHOP, NOTARY } from "./content.ts";
import {
  CAVEMAN,
  GOBLIN,
  OGRE,
  SHAMAN,
  SPITTER,
  TRICERATOPS,
  dummy,
} from "./fixtures.ts";
import {
  bodies,
  cond,
  conditionsOf,
  patchStack,
  play,
  stack,
  withFx,
} from "./helpers.ts";

type Ev<T extends BattleEvent["type"]> = Extract<BattleEvent, { type: T }>;

const at = (col: number, row: number): Hex => ({ col, row });
const HERO = { attack: 0, defense: 0 };
const defend = (stackId: string): BattleAction => ({ type: "defend", stackId });
const melee = (stackId: string, targetId: string, from: Hex): BattleAction => ({
  type: "attack",
  stackId,
  targetId,
  from,
});

function battle(
  attacker: BattleArmySetup["stacks"],
  defender: BattleArmySetup["stacks"],
  extra: Partial<Omit<BattleSetup, "attacker" | "defender">> & {
    a?: Partial<BattleArmySetup>;
    d?: Partial<BattleArmySetup>;
  } = {},
) {
  const { a, d, ...rest } = extra;
  return createBattle({
    seed: 1,
    obstacles: [],
    attacker: { hero: HERO, stacks: attacker, ...a },
    defender: { hero: null, stacks: defender, ...d },
    ...rest,
  });
}

/** Two stacks of 5 x 100 HP side by side; a0 acts first. */
function duel(over: { a?: object; d?: object } = {}): BattleState {
  return battle(
    [
      {
        creature: dummy({ speed: 9, hp: 100, ...over.a }),
        count: 5,
        hex: at(6, 5),
      },
    ],
    [
      {
        creature: dummy({ speed: 3, hp: 100, ...over.d }),
        count: 5,
        hex: at(7, 5),
      },
    ],
  ).state;
}

const hpOf = (s: BattleState, id: string): number => {
  const x = stack(s, id);
  return x.count <= 0 ? 0 : (x.count - 1) * x.creature.hp + x.topHp;
};

function playRound(s: BattleState): {
  state: BattleState;
  events: BattleEvent[];
} {
  const events: BattleEvent[] = [];
  const r = s.round;
  while (s.round === r && s.winner === null) {
    const step = applyAction(s, defend(s.activeStackId!));
    events.push(...step.events);
    s = step.state;
  }
  return { state: s, events };
}

const firstOf = <T extends BattleEvent["type"]>(
  events: readonly BattleEvent[],
  type: T,
): Ev<T> => events.find((e) => e.type === type) as Ev<T>;

describe("1.8 Strike and Harm", () => {
  it("P is clamped to 1/4 .. 4", () => {
    expect(strikePercentProduct([200, 200, 200])).toEqual({
      value: { num: 4, den: 1 },
      capped: true,
    });
    expect(strikePercentProduct([10, 10])).toEqual({
      value: { num: 1, den: 4 },
      capped: true,
    });
    expect(strikePercentProduct([150, 125])).toEqual({
      value: { num: 15, den: 8 },
      capped: false,
    });
  });

  it("one Strike is at most 16 x count x Dmg (M 4, P 4)", () => {
    let s = duel({
      a: { attack: 200, damage: 10 },
      d: { defense: 0, hp: 100000 },
    });
    s = patchStack(s, "d0", {
      conditions: [
        cond("frozen", { clock: 2 }, 901),
        cond("jinxed", { size: 900, clock: 3 }, 902),
      ],
    });
    const r = rehearse(s, melee("a0", "d0", at(6, 5)));
    const hit = firstOf(r.steps, "damage");
    expect(hit.breakdown.percentCapped).toBe(true);
    expect(hit.breakdown.percentProduct).toEqual({ num: 4, den: 1 });
    expect(hit.damage).toBe(16 * 5 * 10);
  });

  it("Harm = floor(X x Q), Q clamped to 1/4 .. 4, Fuel doubles, 0 is legal", () => {
    expect(computeHarm(100, [150])).toEqual({
      harm: 150,
      q: { num: 3, den: 2 },
    });
    expect(computeHarm(7, [50])).toEqual({ harm: 3, q: { num: 1, den: 2 } });
    expect(computeHarm(10, [500, 500]).harm).toBe(40);
    expect(computeHarm(10, [], true).harm).toBe(20);
    expect(computeHarm(0).harm).toBe(0);
    expect(() => computeHarm(-1)).toThrow();
    expect(() => computeHarm(1.5)).toThrow();
  });

  it("Harm ignores Defense and Defend and triggers no retaliation", () => {
    let s = duel({ d: { defense: 50 } });
    s = patchStack(s, "d0", { defending: true });
    const r = withFx(s, (fx) => fx.harm("d0", 150));
    expect(hpOf(r.state, "d0")).toBe(350);
    expect(r.events.map((e) => e.type)).toEqual(["harm"]);
    const zero = withFx(s, (fx) => fx.harm("d0", 0));
    expect(hpOf(zero.state, "d0")).toBe(500);
  });

  it("law 5: a rule with no requirement may Harm its own side or heal the enemy", () => {
    let s = play(duel(), {
      type: "heroAct",
      stackId: "a0",
      act: "bolt",
      targets: [{ stack: "a0" }],
    }).state;
    expect(hpOf(s, "a0")).toBe(350);
    s = patchStack(s, "d0", { topHp: 10 });
    const healed = withFx(s, (fx) => fx.heal("d0", 50));
    expect(stack(healed.state, "d0").topHp).toBe(60);
  });

  it("Heal tops up first, revives only when told, never above the initial count", () => {
    const s = patchStack(duel(), "d0", { count: 2, topHp: 40 });
    const plain = withFx(s, (fx) => fx.heal("d0", 500));
    expect(stack(plain.state, "d0")).toMatchObject({ count: 2, topHp: 100 });
    const revive = withFx(s, (fx) => fx.heal("d0", 230, { revive: true }));
    // 60 to the top, then one full creature and a partial one of 70.
    expect(stack(revive.state, "d0")).toMatchObject({ count: 4, topHp: 70 });
    expect(firstOf(revive.events, "heal")).toMatchObject({
      amount: 230,
      revived: 2,
    });
    const capped = withFx(s, (fx) => fx.heal("d0", 9999, { revive: true }));
    expect(stack(capped.state, "d0")).toMatchObject({ count: 5, topHp: 100 });
  });

  it("special Strikes are not retaliated unless the rule says so", () => {
    const s = duel();
    const plain = withFx(s, (fx) => fx.strike("a0", "d0"));
    expect(plain.events.map((e) => e.type)).toEqual(["damage"]);
    expect(firstOf(plain.events, "damage").kind).toBe("special");
    const ret = withFx(s, (fx) => fx.strike("a0", "d0", { retaliable: true }));
    expect(ret.events.map((e) => e.type)).toEqual([
      "damage",
      "retaliation",
      "damage",
    ]);
  });
});

describe("1.3 Conditions", () => {
  it("tags refuse a kind the creature cannot bear", () => {
    const { state, events } = battle(
      [{ creature: NOTARY, count: 3, hex: at(2, 2) }],
      [{ creature: GOBLIN, count: 3, hex: at(12, 2) }],
      { a: { morale: 1 } },
    );
    expect(stack(state, "a0").conditions).toEqual([]);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "condition",
        change: "refused",
        reason: "tag",
      }),
    );
  });

  it("a gate is tested on landing and never afterwards", () => {
    const s = duel();
    const gate = { measure: "hp" as const, max: 120 };
    const refused = withFx(s, (fx) =>
      fx.addCondition("d0", { kind: "asleep", gate }),
    );
    expect(refused.events).toEqual([
      expect.objectContaining({
        type: "condition",
        change: "refused",
        reason: "gate",
        detail: "gate 120 HP, target has 500",
      }),
    ]);
    const small = patchStack(s, "d0", { count: 1, topHp: 100 });
    const landed = withFx(small, (fx) => {
      fx.addCondition("d0", { kind: "asleep", gate });
      fx.heal("d0", 9999, { revive: true }); // back to 500 HP
    });
    expect(conditionsOf(landed.state, "d0")).toEqual([
      { kind: "asleep", clock: 2, size: 0 },
    ]);
    const tier = withFx(s, (fx) =>
      fx.addCondition("d0", {
        kind: "asleep",
        gate: { measure: "tier", max: 0 },
      }),
    );
    expect(firstOf(tier.events, "condition").detail).toBe(
      "gate tier 0, target is tier 1",
    );
  });

  it("same kind merges: larger size, longer clock, null longest, newcomer's source", () => {
    const s = patchStack(duel({ a: { abilities: ["venom"] } }), "d0", {
      conditions: [cond("venomed", { size: 5, clock: 1, source: "old" }, 901)],
    });
    const r = rehearse(s, melee("a0", "d0", at(6, 5)));
    expect(conditionsOf(r.after, "d0")).toEqual([
      { kind: "venomed", clock: 2, size: 5 },
    ]);
    expect(stack(r.after, "d0").conditions[0]).toMatchObject({
      uid: 901,
      source: "a0",
    });
    const clockless = withFx(
      patchStack(s, "d0", { conditions: [cond("lucky", {}, 901)] }),
      (fx) => fx.addCondition("d0", { kind: "lucky", clock: 4 }),
    );
    expect(conditionsOf(clockless.state, "d0")).toEqual([
      { kind: "lucky", clock: null, size: 0 },
    ]);
  });

  it("a full stack displaces its shortest clock that is neither a Hold nor clockless (ties: oldest)", () => {
    const full = patchStack(duel(), "d0", {
      conditions: [
        cond("lucky", { clock: null }, 901),
        cond("burning", { size: 1, clock: 3 }, 902),
        cond("hastened", { clock: 1 }, 903),
        cond("delayed", { clock: 1 }, 904),
        cond("jinxed", { clock: 5 }, 905),
        cond("frozen", { clock: 1 }, 906),
      ],
    });
    expect(stack(full, "d0").conditions).toHaveLength(MAX_CONDITIONS);
    const r = withFx(full, (fx) =>
      fx.addCondition("d0", { kind: "venomed", size: 3, clock: 2 }),
    );
    expect(r.events[0]).toMatchObject({
      change: "displaced",
      condition: { kind: "hastened", uid: 903 },
    });
    expect(stack(r.state, "d0").conditions.map((c) => c.kind)).toEqual([
      "lucky",
      "burning",
      "delayed",
      "jinxed",
      "frozen",
      "venomed",
    ]);
    const stuck = patchStack(duel(), "d0", {
      conditions: [
        cond("lucky", { clock: null }, 901),
        cond("heartened", { clock: null }, 902),
        cond("burning", { size: 1, clock: null }, 903),
        cond("hastened", { clock: null }, 904),
        cond("jinxed", { clock: null }, 905),
        cond("frozen", { clock: 2 }, 906),
      ],
    });
    const refused = withFx(stuck, (fx) =>
      fx.addCondition("d0", { kind: "venomed" }),
    );
    expect(refused.events[0]).toMatchObject({
      change: "refused",
      reason: "full",
    });
  });

  it("a clock made in round r with clock c expires when round r + c - 1 ends", () => {
    let s = withFx(duel(), (fx) =>
      fx.addCondition("d0", { kind: "hastened", clock: 3 }),
    ).state;
    s = playRound(s).state; // round 1 ends: 2 left
    s = playRound(s).state; // round 2 ends: 1 left
    expect(conditionsOf(s, "d0")).toEqual([
      { kind: "hastened", clock: 1, size: 0 },
    ]);
    const r3 = playRound(s);
    expect(r3.state.round).toBe(4);
    expect(stack(r3.state, "d0").conditions).toEqual([]);
    expect(r3.events).toContainEqual(
      expect.objectContaining({ type: "condition", change: "expired" }),
    );
  });

  it("expiry fires the on-expire rule; ending any other way does not", () => {
    const debt = patchStack(duel(), "a0", {
      conditions: [cond("reckoning", { size: 30, maxSize: 99, clock: 1 }, 901)],
    });
    const due = playRound(debt);
    expect(due.events).toContainEqual(
      expect.objectContaining({ type: "harm", targetId: "a0", x: 30 }),
    );
    const ended = withFx(debt, (fx) => fx.endCondition("a0", 901));
    const after = playRound(ended.state);
    expect(after.events.some((e) => e.type === "harm")).toBe(false);
  });

  it("feed, wind, copy, move and set off (law 2: conditions are things)", () => {
    const s = patchStack(duel(), "d0", {
      conditions: [
        cond("venomed", { size: 3, clock: 3 }, 901),
        cond("burning", { size: 4, clock: 5 }, 902),
        cond("lucky", {}, 903),
      ],
    });
    // Feed: +half rounded up, to maxSize (3 x 3 = 9).
    const fed = withFx(s, (fx) => {
      fx.feedCondition("d0", 901);
      fx.feedCondition("d0", 901);
      fx.feedCondition("d0", 901);
    });
    expect(stack(fed.state, "d0").conditions[0]!.size).toBe(9);
    // Wind: +2 to at most 9; down to 0 expires now.
    const wound = withFx(s, (fx) => {
      fx.windCondition("d0", 901, 2);
      fx.windCondition("d0", 902, 9);
    });
    expect(conditionsOf(wound.state, "d0").map((c) => c.clock)).toEqual([
      5,
      9,
      null,
    ]);
    const gone = withFx(s, (fx) => fx.windCondition("d0", 901, -3));
    expect(gone.events.map((e) => (e as Ev<"condition">).change)).toEqual([
      "wound",
      "expired",
    ]);
    // Copy keeps size, clock and gate; move takes it away.
    const copied = withFx(s, (fx) => fx.copyCondition("d0", 902, "a0"));
    expect(conditionsOf(copied.state, "a0")).toEqual([
      { kind: "burning", clock: 5, size: 4 },
    ]);
    expect(stack(copied.state, "d0").conditions).toHaveLength(3);
    const moved = withFx(s, (fx) => fx.moveCondition("d0", 902, "a0"));
    expect(stack(moved.state, "d0").conditions).toHaveLength(2);
    expect(firstOf(moved.events, "condition")).toMatchObject({
      change: "moved",
      stackId: "a0",
      otherId: "d0",
    });
    // Set off: Harm = charge x rounds left (at most 3; clockless counts 3).
    const burnt = withFx(s, (fx) => fx.setOffCondition("d0", 902));
    expect(firstOf(burnt.events, "harm")).toMatchObject({ x: 12 });
    const lucky = withFx(s, (fx) => fx.setOffCondition("d0", 903));
    expect(firstOf(lucky.events, "harm")).toMatchObject({ x: 30 });
    const debt = withFx(
      patchStack(s, "d0", {
        conditions: [cond("reckoning", { size: 50, clock: 3 }, 904)],
      }),
      (fx) => fx.setOffCondition("d0", 904),
    );
    expect(firstOf(debt.events, "harm")).toMatchObject({ x: 50 });
  });
});

describe("1.9 Holds and Wary", () => {
  it("a Hold lands with clock at most 2; one at a time; never copied, fed or wound longer", () => {
    const s = duel();
    const r = withFx(s, (fx) => {
      fx.addCondition("d0", { kind: "frozen", clock: 7 });
      fx.addCondition("d0", { kind: "asleep" });
      fx.copyCondition("d0", stack(fx.state, "d0").conditions[0]!.uid, "a0");
      expect(
        fx.feedCondition("d0", stack(fx.state, "d0").conditions[0]!.uid),
      ).toBe(false);
      expect(
        fx.windCondition("d0", stack(fx.state, "d0").conditions[0]!.uid, 2),
      ).toBe(false);
      expect(
        fx.windCondition("d0", stack(fx.state, "d0").conditions[0]!.uid, -1),
      ).toBe(true);
    });
    expect(conditionsOf(r.state, "d0")).toEqual([
      { kind: "frozen", clock: 1, size: 0 },
    ]);
    const reasons = r.events
      .filter((e) => e.type === "condition" && e.change === "refused")
      .map((e) => (e as Ev<"condition">).reason);
    expect(reasons).toEqual(["hold", "neverProlonged"]);
  });

  it("Frozen: the turn is skipped; the first Strike is x 200%, gets no retaliation and ends it", () => {
    const s = patchStack(duel(), "d0", {
      conditions: [cond("frozen", { clock: 2 }, 901)],
    });
    const r = rehearse(s, melee("a0", "d0", at(6, 5)));
    expect(firstOf(r.steps, "damage").breakdown.abilityMultipliers).toEqual([
      { source: "frozen", label: "Frozen", percent: 200 },
    ]);
    expect(r.steps.some((e) => e.type === "retaliation")).toBe(false);
    expect(stack(r.after, "d0").conditions).toEqual([]);
    expect(r.steps).toContainEqual(
      expect.objectContaining({ type: "wary", stackId: "d0", rounds: 2 }),
    );
    const skip = play(s, defend("a0"));
    expect(skip.events).toContainEqual(
      expect.objectContaining({
        type: "turnSkipped",
        stackId: "d0",
        condition: "frozen",
      }),
    );
  });

  it("Asleep ends on any damage", () => {
    const s = patchStack(duel(), "d0", {
      conditions: [cond("asleep", { clock: 2 }, 901)],
    });
    const r = withFx(s, (fx) => fx.harm("d0", 1));
    expect(stack(r.state, "d0").conditions).toEqual([]);
  });

  it("Wary: held two rounds, refuses Holds for the next two; no stack is stopped more than two rounds in four", () => {
    let s = patchStack(duel(), "d0", {
      conditions: [cond("asleep", { clock: 2 }, 901)],
    });
    const r1 = playRound(s);
    expect(r1.events).toContainEqual(
      expect.objectContaining({ type: "turnSkipped", stackId: "d0" }),
    );
    const r2 = playRound(r1.state);
    s = r2.state;
    expect(stack(s, "d0").conditions).toEqual([]);
    expect(r2.events).toContainEqual(
      expect.objectContaining({ type: "wary", stackId: "d0", rounds: 3 }),
    );
    expect(stack(s, "d0").wary).toBe(2); // rounds 3 and 4
    const refused = withFx(s, (fx) =>
      fx.addCondition("d0", { kind: "frozen" }),
    );
    expect(refused.events[0]).toMatchObject({ reason: "wary" });
    s = playRound(playRound(s).state).state;
    expect(s.round).toBe(5);
    expect(stack(s, "d0").wary).toBe(0);
    const again = withFx(s, (fx) => fx.addCondition("d0", { kind: "frozen" }));
    expect(again.events[0]).toMatchObject({ change: "landed" });
  });

  it("a Hold can be moved: its clock keeps its value and the gate is tested on the receiver", () => {
    let b = battle(
      [
        { creature: BELLHOP, count: 2, hex: at(6, 4) },
        { creature: dummy({ speed: 2 }), count: 5, hex: at(6, 5) },
      ],
      [{ creature: dummy({ speed: 3, hp: 100 }), count: 5, hex: at(7, 4) }],
    ).state;
    b = patchStack(b, "d0", {
      conditions: [cond("frozen", { clock: 1 }, 901)],
    });
    const moved = rehearse(b, {
      type: "ability",
      stackId: "a0",
      ability: "bellhop-carry",
      targets: [{ stack: "d0", condition: 901 }, { stack: "a1" }],
    });
    expect(conditionsOf(moved.after, "a1")).toEqual([
      { kind: "frozen", clock: 1, size: 0 },
    ]);
    expect(stack(moved.after, "d0").wary).toBe(2);
  });

  it("Turned: the stack fights for the other side; its War Drums follow its live side (law 4)", () => {
    let s = battle(
      [
        { creature: NOTARY, count: 3, hex: at(2, 2) },
        { creature: dummy({ speed: 6 }), count: 5, hex: at(8, 4) },
      ],
      [
        { creature: SHAMAN, count: 1, hex: at(8, 5) },
        { creature: dummy({ speed: 1, hp: 100 }), count: 5, hex: at(9, 4) },
      ],
    ).state;
    s = play(s, {
      type: "ability",
      stackId: "a0",
      ability: "notary-stamp",
      targets: [{ stack: "d0" }],
    }).state;
    expect(stack(s, "d0")).toMatchObject({
      side: "attacker",
      owner: "defender",
    });
    expect(s.activeStackId).toBe("a1");
    const r = rehearse(s, melee("a1", "d1", at(8, 4)));
    expect(firstOf(r.steps, "damage").breakdown.attackModifiers).toContainEqual(
      expect.objectContaining({ source: "war-drums", amount: 2 }),
    );
    // Turning a Turned stack is refused (one Hold at a time).
    const twice = withFx(s, (fx) => fx.addCondition("d0", { kind: "turned" }));
    expect(twice.events[0]).toMatchObject({ reason: "hold" });
    // An activated ability is once per battle.
    expect(stack(s, "a0").abilitiesUsed).toEqual(["notary-stamp"]);
  });
});

describe("1.4 Links", () => {
  function linked(): BattleState {
    const s = battle(
      [
        { creature: dummy({ speed: 9, hp: 100 }), count: 5, hex: at(6, 5) },
        { creature: dummy({ speed: 8, hp: 10 }), count: 3, hex: at(1, 1) },
      ],
      [
        {
          creature: dummy({ speed: 3, hp: 100, damage: 10 }),
          count: 5,
          hex: at(7, 5),
        },
      ],
    ).state;
    return play(s, {
      type: "heroAct",
      stackId: "a0",
      act: "scapegoat",
      targets: [{ stack: "a0" }, { stack: "a1" }],
    }).state;
  }

  it("the near end bears it (it counts toward its six); the far end is only named", () => {
    const s = linked();
    expect(stack(s, "a0").conditions).toEqual([
      expect.objectContaining({ kind: "scapegoat", link: "a1" }),
    ]);
    expect(stack(s, "a1").conditions).toEqual([]);
  });

  it("the near end retaliates as if hit and loses nothing; the excess comes back", () => {
    let s = linked();
    s = play(s, defend("a0"), defend("a1")).state;
    expect(s.activeStackId).toBe("d0");
    const r = rehearse(s, melee("d0", "a0", at(7, 5)));
    expect(r.steps.map((e) => e.type)).toEqual([
      "attack",
      "damage",
      "linkTransfer",
      "harm",
      "death",
      "ground",
      "condition",
      "harm",
      "retaliation",
      "damage",
    ]);
    const transfer = firstOf(r.steps, "linkTransfer");
    expect(transfer).toMatchObject({
      farId: "a1",
      excess: transfer.amount - 30,
    });
    expect(stack(r.after, "a1").count).toBe(0);
    expect(stack(r.after, "a0").conditions).toEqual([]);
    expect(hpOf(r.after, "a0")).toBe(500 - transfer.excess);
  });

  it("Harm that travelled a link is never redirected again", () => {
    let s = battle(
      [
        { creature: dummy({ speed: 9, hp: 100 }), count: 5, hex: at(6, 5) },
        { creature: dummy({ speed: 8, hp: 100 }), count: 5, hex: at(1, 1) },
        { creature: dummy({ speed: 7, hp: 100 }), count: 5, hex: at(1, 9) },
      ],
      [{ creature: dummy({ speed: 3 }), count: 1, hex: at(13, 5) }],
    ).state;
    s = withFx(s, (fx) => {
      fx.link("a0", "a1", { kind: "scapegoat" });
      fx.link("a1", "a2", { kind: "scapegoat" });
    }).state;
    const r = withFx(s, (fx) => fx.harm("a0", 150));
    expect(r.events.filter((e) => e.type === "linkTransfer")).toHaveLength(1);
    expect(hpOf(r.state, "a0")).toBe(500);
    expect(hpOf(r.state, "a1")).toBe(350);
    expect(hpOf(r.state, "a2")).toBe(500);
  });

  it("a second link of the same kind replaces the first; both ends one stack is refused", () => {
    const s = battle(
      [
        { creature: dummy({ speed: 9 }), count: 5, hex: at(6, 5) },
        { creature: dummy({ speed: 8 }), count: 5, hex: at(1, 1) },
        { creature: dummy({ speed: 7 }), count: 5, hex: at(1, 9) },
      ],
      [{ creature: dummy({ speed: 3 }), count: 1, hex: at(13, 5) }],
    ).state;
    const r = withFx(s, (fx) => {
      fx.link("a0", "a1", { kind: "scapegoat" });
      fx.link("a0", "a2", { kind: "scapegoat" });
      fx.link("a1", "a1", { kind: "scapegoat" });
    });
    expect(stack(r.state, "a0").conditions).toEqual([
      expect.objectContaining({ kind: "scapegoat", link: "a2" }),
    ]);
    expect(r.events.at(-1)).toMatchObject({
      change: "refused",
      reason: "sameStack",
    });
    // Moving the link onto its own far end is refused too.
    const uid = stack(r.state, "a0").conditions[0]!.uid;
    const move = withFx(r.state, (fx) => fx.moveCondition("a0", uid, "a2"));
    expect(move.events[0]).toMatchObject({ reason: "sameStack" });
  });
});

describe("1.5 Ground", () => {
  it("death leaves remains by tag; tag nothing leaves the hex as it was", () => {
    const s = battle(
      [{ creature: dummy({ speed: 9, damage: 100 }), count: 5, hex: at(6, 5) }],
      [
        { creature: GOBLIN, count: 1, hex: at(7, 5) },
        {
          creature: dummy({ tags: { remains: "nothing", cannotBear: [] } }),
          count: 1,
          hex: at(13, 9),
        },
      ],
    ).state;
    const r = play(s, melee("a0", "d0", at(6, 5)));
    expect(groundAt(r.state, at(7, 5))).toMatchObject({
      kind: "corpse",
      class: "remains",
      remains: { owner: "defender", initialCount: 1 },
    });
    const none = withFx(s, (fx) => fx.harm("d1", 999));
    expect(groundAt(none.state, at(13, 9))).toBeNull();
    // Using remains consumes them.
    const used = withFx(r.state, (fx) => {
      expect(fx.useRemains(at(7, 5))).toMatchObject({ owner: "defender" });
    });
    expect(groundAt(used.state, at(7, 5))).toBeNull();
  });

  it("summoned stacks leave no ground, join the queue's end and do not keep a side alive", () => {
    const s = duel();
    const r = withFx(s, (fx) => {
      const id = fx.summon(GOBLIN, 3, at(1, 1), { side: "defender" });
      expect(id).toBe(`s${s.nextUid}`);
    });
    const id = `s${s.nextUid}`;
    expect(r.state.queue.at(-1)).toBe(id);
    expect(stack(r.state, id)).toMatchObject({
      owner: "defender",
      summoned: true,
    });
    const killed = withFx(r.state, (fx) => fx.harm(id, 999));
    expect(groundAt(killed.state, at(1, 1))).toBeNull();
    // The defender with only a summoned stack has lost.
    const alone = withFx(r.state, (fx) => fx.harm("d0", 9999));
    const next = applyAction(alone.state, defend("a0"));
    expect(next.state.winner).toBe("attacker");
  });

  it("rock blocks; a hazard acts on entry and at turn start", () => {
    const { state } = battle(
      [{ creature: dummy({ speed: 9, hp: 100 }), count: 5, hex: at(3, 5) }],
      [{ creature: dummy({ speed: 3 }), count: 1, hex: at(13, 5) }],
      {
        obstacles: [at(4, 5)],
        ground: [{ hex: at(5, 4), kind: "fire", size: 5 }],
      },
    );
    expect(
      actionError(state, { type: "move", stackId: "a0", to: at(4, 5) }),
    ).toBe("destination not reachable");
    const r = play(state, { type: "move", stackId: "a0", to: at(5, 4) });
    const harm = firstOf(r.events, "harm");
    expect(harm).toMatchObject({
      targetId: "a0",
      harm: 5,
      rule: "ground:fire",
    });
    const next = playRound(r.state);
    expect(
      next.events.filter((e) => e.type === "harm" && e.targetId === "a0"),
    ).toHaveLength(1);
  });

  it("a blocking feature is never replaced unless the rule names it; one feature per hex", () => {
    const { state } = battle(
      [{ creature: dummy({ speed: 9 }), count: 1, hex: at(1, 1) }],
      [{ creature: dummy({ speed: 3 }), count: 1, hex: at(13, 5) }],
      { obstacles: [at(4, 5)] },
    );
    const r = withFx(state, (fx) => {
      expect(fx.addGround({ hex: at(4, 5), kind: "fire", size: 1 })).toBe(
        false,
      );
      expect(fx.addGround({ hex: at(5, 5), kind: "fire", size: 1 })).toBe(true);
      expect(fx.addGround({ hex: at(5, 5), kind: "stones" })).toBe(true);
      expect(
        fx.addGround(
          { hex: at(4, 5), kind: "fire" },
          { replaceBlocking: true },
        ),
      ).toBe(true);
    });
    expect(groundAt(r.state, at(5, 5))?.kind).toBe("stones");
    expect(groundAt(r.state, at(4, 5))?.kind).toBe("fire");
    expect(r.state.ground.filter((g) => g.hex.row === 5)).toHaveLength(2);
  });

  it("a surface can stop shooting from it and scale Strikes into it", () => {
    const { state } = battle(
      [{ creature: { ...SPITTER, speed: 9 }, count: 4, hex: at(1, 5) }],
      [{ creature: dummy({ speed: 3, hp: 100 }), count: 5, hex: at(12, 5) }],
      { ground: [{ hex: at(12, 5), kind: "mist" }] },
    );
    const r = rehearse(state, { type: "shoot", stackId: "a0", targetId: "d0" });
    expect(firstOf(r.steps, "damage").breakdown.abilityMultipliers).toEqual([
      { source: "mist", label: "Mist", percent: 50 },
    ]);
    const inMist = withFx(state, (fx) =>
      fx.addGround({ hex: at(1, 5), kind: "mist" }),
    ).state;
    expect(
      actionError(inMist, { type: "shoot", stackId: "a0", targetId: "d0" }),
    ).toBe("this stack cannot shoot now");
  });

  it("a surface adds Defense; ground clocks tick and the feature ends", () => {
    const { state } = battle(
      [{ creature: dummy({ speed: 9 }), count: 5, hex: at(6, 5) }],
      [{ creature: dummy({ speed: 3, hp: 100 }), count: 5, hex: at(7, 5) }],
      { ground: [{ hex: at(7, 5), kind: "stones", clock: 1 }] },
    );
    const p = rehearse(state, melee("a0", "d0", at(6, 5)));
    expect(
      firstOf(p.steps, "damage").breakdown.defenseModifiers,
    ).toContainEqual(expect.objectContaining({ source: "stones", amount: 3 }));
    expect(groundAt(playRound(state).state, at(7, 5))).toBeNull();
  });
});

describe("1.6 The timeline", () => {
  it("Delayed acts after every stack that is not Delayed, waiting stacks included, and cannot Wait", () => {
    let s = battle(
      [
        { creature: dummy({ speed: 9 }), count: 1, hex: at(1, 1) },
        { creature: dummy({ speed: 5 }), count: 1, hex: at(1, 9) },
      ],
      [{ creature: dummy({ speed: 3 }), count: 1, hex: at(13, 5) }],
    ).state;
    s = withFx(s, (fx) => fx.delay("a0", 2)).state;
    expect(actionError(s, { type: "wait", stackId: "a0" })).toBe(
      "this stack cannot Wait",
    );
    s = play(s, defend("a0"), defend("a1"), defend("d0")).state;
    expect(s.round).toBe(2);
    expect(s.activeStackId).toBe("a1");
    s = play(s, { type: "wait", stackId: "a1" }).state;
    expect(s.activeStackId).toBe("d0");
    s = play(s, defend("d0")).state;
    expect(s.activeStackId).toBe("a1"); // waiting
    s = play(s, defend("a1")).state;
    expect(s.activeStackId).toBe("a0"); // Delayed: last of all
  });

  it("Hastened acts before every stack that is not Hastened", () => {
    let s = battle(
      [{ creature: dummy({ speed: 9 }), count: 1, hex: at(1, 1) }],
      [{ creature: dummy({ speed: 1 }), count: 1, hex: at(13, 5) }],
    ).state;
    s = withFx(s, (fx) => fx.hasten("d0", 2)).state;
    s = play(s, defend("a0")).state;
    s = play(s, defend("d0")).state;
    expect(s.round).toBe(2);
    expect(s.activeStackId).toBe("d0");
  });

  it("at most one extra turn per stack per round; Heartened spends itself for one", () => {
    const { state, events } = battle(
      [{ creature: dummy({ speed: 9 }), count: 5, hex: at(1, 1) }],
      [{ creature: dummy({ speed: 3 }), count: 1, hex: at(13, 5) }],
      { a: { morale: 1 } },
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "condition",
        change: "landed",
        rule: "morale",
      }),
    );
    const r = play(state, { type: "move", stackId: "a0", to: at(2, 1) });
    expect(r.state.activeStackId).toBe("a0");
    expect(stack(r.state, "a0").conditions).toEqual([]);
    const second = withFx(r.state, (fx) => {
      expect(fx.extraTurn("a0")).toBe(false);
    });
    expect(second.events[0]).toMatchObject({
      type: "extraTurn",
      granted: false,
    });
    expect(play(r.state, defend("a0")).state.activeStackId).toBe("d0");
    // Declining keeps Heartened for later.
    const keep = play(state, { type: "defend", stackId: "a0", hearten: false });
    expect(keep.state.activeStackId).toBe("d0");
    expect(conditionsOf(keep.state, "a0")).toHaveLength(1);
  });

  it("scheduled events fire at their phase in order of creation; at most 12 pending; never in the past", () => {
    const s = duel();
    const sched = withFx(s, (fx) => {
      fx.schedule({
        round: 1,
        phase: "end",
        effect: { id: "harm", args: { at: "d0", x: 7 } },
        side: "attacker",
      });
      fx.schedule({
        round: 2,
        phase: "start",
        effect: { id: "harm", args: { at: "d0", x: 3 } },
        side: "attacker",
      });
      expect(
        fx.schedule({
          round: 1,
          phase: "start",
          effect: { id: "harm" },
          side: "attacker",
        }),
      ).toBeNull();
    }).state;
    expect(sched.scheduled).toHaveLength(2);
    const r = playRound(sched);
    const harms = r.events
      .filter((e) => e.type === "harm")
      .map((e) => (e as Ev<"harm">).harm);
    expect(harms).toEqual([7, 3]);
    expect(r.state.scheduled).toEqual([]);
    const many = withFx(s, (fx) => {
      for (let i = 0; i < MAX_SCHEDULED + 2; i++)
        fx.schedule({
          round: 5,
          phase: "end",
          effect: { id: "harm" },
          side: "attacker",
        });
    });
    expect(many.state.scheduled).toHaveLength(MAX_SCHEDULED);
    // A pending event that returns a stack keeps its side in the battle.
    const kept = withFx(s, (fx) => {
      fx.schedule({
        round: 3,
        phase: "start",
        effect: { id: "harm" },
        side: "defender",
        returnsStack: true,
      });
      fx.harm("d0", 9999);
    }).state;
    expect(applyAction(kept, defend("a0")).state.winner).toBeNull();
  });

  it("push moves in a straight line and stops before a blocking feature", () => {
    const { state } = battle(
      [{ creature: dummy({ speed: 9 }), count: 1, hex: at(5, 5) }],
      [{ creature: dummy({ speed: 3 }), count: 1, hex: at(6, 5) }],
      { obstacles: [at(9, 5)] },
    );
    const r = withFx(state, (fx) => {
      expect(fx.push("d0", at(5, 5), 5)).toEqual(at(8, 5));
    });
    expect(firstOf(r.events, "move")).toMatchObject({
      mode: "push",
      to: at(8, 5),
    });
    const pulled = withFx(r.state, (fx) => fx.pull("d0", at(5, 5), 9));
    expect(stack(pulled.state, "d0").hex).toEqual(at(6, 5));
  });
});

describe("1.10 Reactions", () => {
  it("fixed order: the actor's, the target's (on-struck, then retaliation), then everyone else's, once per action", () => {
    const s = battle(
      [{ creature: { ...SPITTER, speed: 9 }, count: 3, hex: at(6, 5) }],
      [
        { creature: { ...SPITTER, speed: 3 }, count: 3, hex: at(7, 5) },
        {
          creature: dummy({ speed: 2, abilities: ["watcher"] }),
          count: 1,
          hex: at(13, 9),
        },
      ],
    ).state;
    const r = rehearse(s, melee("a0", "d0", at(6, 5)));
    expect(r.steps.map((e) => `${e.type}:${e.rule}`)).toEqual([
      "attack:engine",
      "damage:engine",
      "condition:ability:venom", // a0's on-strike
      "retaliation:retaliation", // d0's retaliation
      "damage:retaliation",
      "harm:ability:watcher", // d2's rule: once, although two Strikes
      "condition:ability:venom", // d0's on-strike from its retaliation
    ]);
  });

  it("a chain is cut after 64 steps with a content error", () => {
    const r = withFx(duel(), (_fx, d) => {
      for (let i = 0; i < MAX_REACTION_STEPS + 10; i++) {
        d.trigger("a0", `rule-${i}`, 0, (f) => {
          f.harm("d0", 0);
        });
      }
    });
    expect(r.events.filter((e) => e.type === "harm")).toHaveLength(
      MAX_REACTION_STEPS,
    );
    expect(r.events.at(-1)).toMatchObject({ type: "contentError" });
  });

  it("legal content cannot loop: once per action stops a strike-back rule", () => {
    const loop = dummy({ abilities: ["echo-loop"], hp: 100000, damage: 1 });
    const s = battle(
      [{ creature: { ...loop, speed: 9 }, count: 1, hex: at(6, 5) }],
      [{ creature: { ...loop, speed: 3 }, count: 1, hex: at(7, 5) }],
    ).state;
    const r = rehearse(s, melee("a0", "d0", at(6, 5)));
    expect(r.steps.filter((e) => e.type === "damage")).toHaveLength(4);
    expect(r.steps.some((e) => e.type === "contentError")).toBe(false);
  });

  it("a dead stack's pending reactions are dropped", () => {
    const s = duel({ d: { abilities: ["venom"] } });
    const r = withFx(s, (fx, d) => {
      d.trigger("d0", "late", 0, (f) => {
        f.harm("a0", 50);
      });
      fx.harm("d0", 9999);
    });
    expect(r.events.filter((e) => e.type === "harm")).toHaveLength(1);
  });
});

describe("1.12 The end of a battle", () => {
  it("ownership counts: a side whose stacks are all Turned has not lost", () => {
    let s = battle(
      [{ creature: NOTARY, count: 3, hex: at(2, 2) }],
      [{ creature: GOBLIN, count: 3, hex: at(12, 2) }],
    ).state;
    s = play(s, {
      type: "ability",
      stackId: "a0",
      ability: "notary-stamp",
      targets: [{ stack: "d0" }],
    }).state;
    expect(s.winner).toBeNull();
    expect(stack(s, "d0").side).toBe("attacker");
  });

  it("both sides losing in one step: the defender wins", () => {
    const s = duel();
    const both = withFx(s, (fx) => {
      fx.harm("a0", 9999);
      fx.harm("d0", 9999);
    }).state;
    const end = applyAction(both, defend("a0"));
    expect(end.state).toMatchObject({
      winner: "defender",
      endReason: "eliminated",
    });
  });

  it("the defender wins after round 30", () => {
    let s = battle(
      [{ creature: dummy({ speed: 9 }), count: 1, hex: at(0, 0) }],
      [{ creature: dummy({ speed: 3 }), count: 1, hex: at(14, 10) }],
    ).state;
    let guard = 0;
    while (s.winner === null && guard++ < 200)
      s = play(s, defend(s.activeStackId!)).state;
    expect(s).toMatchObject({
      winner: "defender",
      endReason: "roundLimit",
      round: ROUND_LIMIT,
    });
  });

  it("retreat: only a hero allowed to; the battle ends as a loss", () => {
    expect(actionError(duel(), { type: "retreat", stackId: "a0" })).toBe(
      "this hero cannot retreat",
    );
    const { state } = battle(
      [{ creature: dummy({ speed: 9 }), count: 1, hex: at(0, 0) }],
      [{ creature: dummy({ speed: 3 }), count: 1, hex: at(14, 10) }],
      { a: { canRetreat: true } },
    );
    const r = play(state, { type: "retreat", stackId: "a0" });
    expect(r.state).toMatchObject({ winner: "defender", endReason: "retreat" });
  });
});

describe("6. Morale and Luck at battle start", () => {
  it("the n strongest eligible stacks get the condition; a refused stack is skipped", () => {
    const { state } = battle(
      [
        { creature: TRICERATOPS, count: 2, hex: at(0, 0) },
        { creature: NOTARY, count: 50, hex: at(0, 2) }, // cannot bear Shaken
        { creature: CAVEMAN, count: 1, hex: at(0, 4) },
      ],
      [{ creature: OGRE, count: 1, hex: at(14, 5) }],
      { a: { morale: -2, luck: 1 }, d: { luck: -1 } },
    );
    expect(creatureFightValue(NOTARY) * 50).toBeGreaterThan(
      creatureFightValue(TRICERATOPS) * 2,
    );
    expect(conditionsOf(state, "a1")).toEqual([
      { kind: "lucky", clock: null, size: 0 },
    ]);
    expect(conditionsOf(state, "a0")).toEqual([
      { kind: "shaken", clock: 2, size: 0 },
    ]);
    expect(conditionsOf(state, "a2")).toEqual([
      { kind: "shaken", clock: 2, size: 0 },
    ]);
    expect(conditionsOf(state, "d0")).toEqual([
      { kind: "jinxed", clock: 3, size: 25 },
    ]);
    expect(stack(state, "d0").conditions[0]!.charge).toBe(10);
  });

  it("creature fight value is exact (GAME_DESIGN 8.2 reference values)", () => {
    expect(creatureFightValue(CAVEMAN)).toBe(60);
    expect(creatureFightValue(SPITTER)).toBe(122);
    expect(creatureFightValue(TRICERATOPS)).toBe(849);
  });

  it("Lucky: the next melee attack or shot is x 150%, then Lucky ends", () => {
    const { state } = battle(
      [{ creature: dummy({ speed: 9 }), count: 5, hex: at(6, 5) }],
      [{ creature: dummy({ speed: 3, hp: 100 }), count: 5, hex: at(7, 5) }],
      { a: { luck: 1 } },
    );
    const r = rehearse(state, melee("a0", "d0", at(6, 5)));
    const [hit, ret] = r.steps.filter(
      (e) => e.type === "damage",
    ) as Ev<"damage">[];
    expect(hit!.breakdown.abilityMultipliers).toEqual([
      { source: "lucky", label: "Lucky", percent: 150 },
    ]);
    expect(ret!.breakdown.abilityMultipliers).toEqual([]);
    expect(stack(r.after, "a0").conditions).toEqual([]);
  });

  it("Jinxed: cannot retaliate; Shaken: acts last", () => {
    const { state } = battle(
      [{ creature: dummy({ speed: 9 }), count: 5, hex: at(6, 5) }],
      [{ creature: dummy({ speed: 3, hp: 100 }), count: 5, hex: at(7, 5) }],
      { a: { morale: -1 }, d: { luck: -1 } },
    );
    expect(state.activeStackId).toBe("d0");
    const r = rehearse(state, melee("d0", "a0", at(7, 5)));
    expect(r.steps.some((e) => e.type === "retaliation")).toBe(true);
    const s2 = play(state, defend("d0")).state;
    const r2 = rehearse(s2, melee("a0", "d0", at(6, 5)));
    expect(r2.steps.some((e) => e.type === "retaliation")).toBe(false);
  });
});

describe("1.13 Rehearsal, intents and take-back", () => {
  it("rehearse returns the exact events applyAction emits, a summary and refusals", () => {
    const s = duel();
    const action = melee("a0", "d0", at(6, 5));
    const r = rehearse(s, action);
    const real = applyAction(s, action);
    expect(r.after).toEqual(real.state);
    expect([...r.steps, ...r.followUp]).toEqual(real.events);
    expect(r.steps.every((e, i) => e.index === i)).toBe(true);
    expect(r.summary.map((x) => x.stackId).sort()).toEqual(["a0", "d0"]);
    expect(rehearse(s, { type: "wait", stackId: "d0" }).legal).toMatchObject({
      code: "illegal",
      message: "d0 is not the active stack",
    });
  });

  it("enemy intents are what the stack AI really does if the board does not change", () => {
    const s = battle(
      [{ creature: dummy({ speed: 9 }), count: 5, hex: at(6, 5) }],
      [
        { creature: dummy({ speed: 3, hp: 100 }), count: 5, hex: at(7, 5) },
        { creature: SPITTER, count: 4, hex: at(13, 2) },
      ],
    ).state;
    const intents = enemyIntents(s, "attacker");
    expect(intents.map((i) => i.stackId)).toEqual(["d1", "d0"]);
    const next = play(s, { type: "wait", stackId: "a0" }).state;
    expect(next.activeStackId).toBe("d1");
    expect(intents[0]!.action).toEqual(chooseAiAction(next));
    expect(intents[0]!.rehearsal?.legal).toBe(true);
    // A held stack's intent is to skip its turn.
    const held = patchStack(s, "d1", {
      conditions: [cond("asleep", { clock: 2 }, 901)],
    });
    expect(enemyIntents(held, "attacker")[0]).toMatchObject({
      stackId: "d1",
      action: null,
      skippedBy: "asleep",
    });
  });

  it("rehearsePlan fills enemy turns with intents; against a hero it stops at the first enemy turn", () => {
    const s = duel();
    const plan = rehearsePlan(s, "attacker", [defend("a0"), defend("a0")]);
    expect(plan).toMatchObject({ applied: 2, refusal: null });
    expect(plan.after.round).toBe(2);
    const stop = rehearsePlan(s, "attacker", [defend("a0"), defend("a0")], {
      enemyHasHero: true,
    });
    expect(stop.applied).toBe(1);
  });

  it("take-back reaches the newest own action in the round, never across a round start", () => {
    const s0 = duel();
    const s1 = applyAction(s0, defend("a0")).state;
    const history: HistoryEntry[] = [
      { before: s0, action: defend("a0"), side: "attacker" },
    ];
    expect(takeBackIndex(history, s1, "attacker", false)).toBe(0);
    const s2 = applyAction(s1, defend("d0")).state;
    history.push({ before: s1, action: defend("d0"), side: "defender" });
    expect(s2.round).toBe(2);
    expect(takeBackIndex(history, s2, "attacker", false)).toBeNull();
    const h2: HistoryEntry[] = [
      { before: s0, action: defend("a0"), side: "attacker" },
      { before: s1, action: defend("d0"), side: "defender" },
    ];
    expect(takeBackIndex(h2, s1, "attacker", true)).toBeNull();
    expect(takeBackIndex(h2, s1, "attacker", false)).toBe(0);
  });

  it("every event carries its index, cause and rule", () => {
    const s = duel({ a: { abilities: ["venom"] } });
    const r = rehearse(s, melee("a0", "d0", at(6, 5)));
    const venom = firstOf(r.steps, "condition");
    const strike = firstOf(r.steps, "damage");
    expect(venom.cause).toBe(strike.index);
    expect(venom.rule).toBe("ability:venom");
    expect(bodies([strike])[0]).not.toHaveProperty("index");
  });
});
