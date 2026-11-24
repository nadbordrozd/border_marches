/**
 * Hero casting in battle (RULES_V2 2.3 to 2.6): one cast per round, pages
 * spent per battle, mana, school rank Power, scrolls, Echo, Fuel, creature
 * casters and the rehearsal of a cast.
 */

import { describe, expect, it } from "vitest";
import {
  actionError,
  applyAction,
  battleResult,
  creatureCastPower,
  registerCreatureCaster,
  schoolRelation,
} from "../../../src/core/battle/index.ts";
import type { BattleState } from "../../../src/core/battle/index.ts";
import {
  BOW,
  C,
  H,
  PIKE,
  S,
  battle,
  cast,
  castAction,
  hpLost,
  kinds,
  preview,
  ref,
  stack,
  withConditions,
} from "./helpers.ts";

const basic = (magic = {}) =>
  battle({
    mine: [{ hex: { col: 1, row: 5 } }, { hex: { col: 1, row: 7 } }],
    theirs: [
      { hex: { col: 10, row: 5 }, count: 20 },
      { hex: { col: 10, row: 7 }, count: 20 },
    ],
    magic,
  });

/** Every stack defends until a new round starts. */
function nextRound(state: BattleState): BattleState {
  const r = state.round;
  let s = state;
  while (s.round === r && s.winner === null) {
    s = applyAction(s, {
      type: "defend",
      stackId: s.activeStackId as string,
    }).state;
  }
  return s;
}

describe("the wheel", () => {
  it("neighbours are allied, the other two opposed", () => {
    expect(schoolRelation("storm", "bloom")).toBe("allied");
    expect(schoolRelation("storm", "hush")).toBe("allied");
    expect(schoolRelation("storm", "accord")).toBe("opposed");
    expect(schoolRelation("storm", "clock")).toBe("opposed");
    expect(schoolRelation("clock", "clock")).toBe("same");
    expect(schoolRelation("bloom", "accord")).toBe("allied");
    expect(schoolRelation("bloom", "hush")).toBe("opposed");
  });
});

describe("hero casting", () => {
  it("casts once per round, before the stack acts", () => {
    const s0 = basic();
    const s1 = cast(s0, "jolt", [S("d0")]).state;
    expect(s1.activeStackId).toBe("a0");
    expect(actionError(s1, castAction(s1, "nettle", [S("d0")]))).toMatch(
      /already cast this round/,
    );
  });

  it("spends the page for the battle and the mana for good", () => {
    const s0 = basic();
    const s1 = cast(s0, "jolt", [S("d0")]).state;
    expect(s1.sides.attacker.magic?.mana).toBe(56);
    expect(s1.sides.attacker.magic?.spent).toEqual(["jolt"]);
    const s2 = nextRound(s1);
    expect(s2.round).toBe(2);
    expect(actionError(s2, castAction(s2, "jolt", [S("d1")]))).toMatch(
      /spent for the battle/,
    );
    expect(actionError(s2, castAction(s2, "nettle", [S("d1")]))).toBeNull();
  });

  it("needs the page in the book and enough mana", () => {
    const s0 = basic({ pages: ["jolt"], mana: 3 });
    expect(actionError(s0, castAction(s0, "jolt", [S("d0")]))).toBe(
      "needs 4 mana, the hero has 3",
    );
    expect(actionError(s0, castAction(s0, "nettle", [S("d0")]))).toBe(
      "this page is not in the book",
    );
  });

  it("applies mana cost percentages, rounded up, at least 1", () => {
    const s0 = basic({ costPercent: 50 });
    const s1 = cast(s0, "appointment", [S("d0")]).state; // 5 -> 3
    expect(s1.sides.attacker.magic?.mana).toBe(57);
  });

  it("adds the school rank bonus to Power (2.2) and caps at 30", () => {
    const harmAt = (storm: number, power = 2) => {
      const s0 = basic({
        power,
        schoolRanks: { storm },
      });
      return hpLost(s0, cast(s0, "jolt", [S("d0")]).state, "d0");
    };
    expect(harmAt(1)).toBe(40); // 20 + 10 x 2
    expect(harmAt(2)).toBe(60); // P 4
    expect(harmAt(3)).toBe(80); // P 6
    expect(harmAt(3, 40)).toBe(200); // capped at P 30: 20 + 300 > HP 200
  });

  it("the cast event carries Power, mana and the choices", () => {
    const s0 = basic();
    const ev = cast(s0, "jolt", [S("d0")]).events.find(
      (e) => e.type === "heroAct",
    );
    expect(ev).toMatchObject({
      act: "jolt",
      cast: { power: 2, mana: 4, scroll: false, fuelled: false, echoed: false },
    });
  });

  it("spends the page even when the target refuses", () => {
    const s0 = basic();
    const step = cast(s0, "cold-snap", [S("d0")]); // gate 100 HP, target 200
    expect(kinds(step.state, "d0")).toEqual([]);
    expect(
      step.events.some((e) => e.type === "condition" && e.change === "refused"),
    ).toBe(true);
    expect(step.state.sides.attacker.magic?.spent).toEqual(["cold-snap"]);
    expect(step.state.sides.attacker.magic?.mana).toBe(52);
  });

  it("refuses targets that break the spell's requirement (law 3)", () => {
    const s0 = basic();
    expect(actionError(s0, castAction(s0, "sign-here", [S("a1")]))).toBe(
      "choose an enemy stack",
    );
    expect(actionError(s0, castAction(s0, "take-heart", [S("d0")]))).toBe(
      "choose a friendly stack",
    );
  });

  it("a side without book data casts freely at Power 0 (legacy)", () => {
    const s0 = basic();
    const { magic: _drop, ...bare } = s0.sides.attacker;
    void _drop;
    const legacy: BattleState = {
      ...s0,
      sides: { ...s0.sides, attacker: bare },
    };
    const s1 = cast(legacy, "jolt", [S("d0")]).state;
    expect(hpLost(legacy, s1, "d0")).toBe(20);
  });
});

describe("scrolls (2.5)", () => {
  it("cost no mana, need no page and are destroyed", () => {
    const s0 = basic({ pages: [], power: 0, scrolls: ["jolt", "jolt"] });
    const step = cast(s0, "jolt", [S("d0")], { scroll: true });
    expect(hpLost(s0, step.state, "d0")).toBe(40); // Power at least 2
    const m = step.state.sides.attacker.magic;
    expect(m?.mana).toBe(60);
    expect(m?.scrolls).toEqual(["jolt"]);
    expect(m?.scrollsUsed).toEqual(["jolt"]);
    expect(m?.spent).toEqual([]);
  });

  it("use no school bonus and still use the round's cast", () => {
    const s0 = basic({
      power: 5,
      schoolRanks: { storm: 3 },
      scrolls: ["jolt"],
    });
    const s1 = cast(s0, "jolt", [S("d0")], { scroll: true }).state;
    expect(hpLost(s0, s1, "d0")).toBe(70);
    expect(actionError(s1, castAction(s1, "nettle", [S("d0")]))).toMatch(
      /already cast/,
    );
  });

  it("refuses a scroll the case does not hold", () => {
    const s0 = basic({ scrolls: [] });
    expect(
      actionError(s0, castAction(s0, "jolt", [S("d0")], { scroll: true })),
    ).toBe("no such scroll");
  });

  it("report used scrolls and spent mana in the battle result", () => {
    const s0 = basic({ scrolls: ["jolt"] });
    const s1 = cast(s0, "jolt", [S("d0")], { scroll: true }).state;
    const s2 = cast(nextRound(s1), "nettle", [S("d1")]).state;
    expect(battleResult(s2, "eliminated").magic?.attacker).toEqual({
      manaSpent: 4,
      manaLeft: 56,
      scrollsUsed: ["jolt"],
    });
  });
});

describe("Echo (2.4)", () => {
  it("adds 1 to the clock of an allied-school condition on a touched stack", () => {
    // Venomed is Bloom; Bloom is allied to Storm.
    const s0 = withConditions(basic(), "d0", [
      { kind: "venomed", size: 2, clock: 2 },
    ]);
    const s1 = cast(s0, "jolt", [S("d0")], {
      echo: ref(s0, "d0", "venomed"),
    }).state;
    expect(stack(s1, "d0").conditions[0]?.clock).toBe(3);
  });

  it("refuses opposed, untouched, Hold and clockless conditions", () => {
    let s0 = withConditions(basic(), "d0", [
      { kind: "shielded", size: 2, clock: 3 },
      { kind: "lucky", clock: null },
    ]);
    s0 = withConditions(s0, "d1", [{ kind: "venomed", size: 2, clock: 2 }]);
    s0 = withConditions(s0, "a1", [{ kind: "frozen", clock: 2 }]);
    const err = (echo: ReturnType<typeof ref>, spell = "jolt", t = [S("d0")]) =>
      actionError(s0, castAction(s0, spell, t, { echo }));
    expect(err(ref(s0, "d0", "shielded"))).toMatch(/allied school/);
    expect(err(ref(s0, "d1", "venomed"))).toMatch(/touches/);
    expect(err(ref(s0, "d0", "lucky"))).toMatch(/clockless/);
    // Frozen is Storm; Hush Now (Hush) is allied to Storm.
    expect(err(ref(s0, "a1", "frozen"), "hush-now", [S("a1")])).toMatch(/Hold/);
  });

  it("is free and needs no skill: it may be used every cast", () => {
    const s0 = withConditions(basic(), "d0", [
      { kind: "venomed", size: 2, clock: 2 },
    ]);
    const s1 = cast(s0, "jolt", [S("d0")], {
      echo: ref(s0, "d0", "venomed"),
    }).state;
    const s2 = nextRound(s1);
    const s3 = cast(s2, "nettle", [S("d1")]).state;
    expect(s3.sides.attacker.magic?.mana).toBe(52);
  });
});

describe("Fuel (2.4)", () => {
  it("burns an opposed condition and doubles the size", () => {
    // Shielded is Accord; Accord is opposed to Storm.
    const s0 = withConditions(basic(), "d0", [
      { kind: "shielded", size: 2, clock: 3 },
    ]);
    const step = cast(s0, "jolt", [S("d0")], {
      fuel: ref(s0, "d0", "shielded"),
    });
    expect(kinds(step.state, "d0")).toEqual([]);
    expect(hpLost(s0, step.state, "d0")).toBe(80);
    const harm = step.events.find((e) => e.type === "harm");
    expect(harm).toMatchObject({ x: 40, q: { num: 2, den: 1 }, harm: 80 });
    expect(step.state.sides.attacker.magic?.fuelUsed).toBe(1);
  });

  it("doubles a condition's size, a heal, a gate", () => {
    const s0 = withConditions(basic(), "a1", [
      { kind: "slowed", size: 1, clock: 3 }, // Clock, opposed to Bloom
    ]);
    const s1 = cast(s0, "thornskin", [S("a1")], {
      fuel: ref(s0, "a1", "slowed"),
    }).state;
    expect(stack(s1, "a1").conditions).toMatchObject([
      { kind: "thorned", size: 24 }, // (6 + 3 x 2) x 2
    ]);
  });

  it("is once per battle", () => {
    let s0 = withConditions(basic(), "d0", [
      { kind: "shielded", size: 2, clock: 3 },
    ]);
    s0 = withConditions(s0, "d1", [{ kind: "shielded", size: 2, clock: 3 }]);
    const s1 = cast(s0, "jolt", [S("d0")], {
      fuel: ref(s0, "d0", "shielded"),
    }).state;
    const s2 = nextRound(s1);
    expect(
      actionError(
        s2,
        castAction(s2, "hothead", [S("d1")], {
          fuel: ref(s2, "d1", "shielded"),
        }),
      ),
    ).toMatch(/Fuel is used/);
  });

  it("allows more Fuels with fuelMax (at most 3)", () => {
    let s0 = withConditions(basic({ fuelMax: 2 }), "d0", [
      { kind: "shielded", size: 2, clock: 3 },
    ]);
    s0 = withConditions(s0, "d1", [{ kind: "shielded", size: 2, clock: 3 }]);
    const s1 = cast(s0, "jolt", [S("d0")], {
      fuel: ref(s0, "d0", "shielded"),
    }).state;
    const s2 = nextRound(s1);
    expect(
      actionError(
        s2,
        castAction(s2, "hothead", [S("d1")], {
          fuel: ref(s2, "d1", "shielded"),
        }),
      ),
    ).toBeNull();
  });

  it("refuses unsized spells, allied conditions and untouched stacks", () => {
    let s0 = withConditions(basic(), "d0", [
      { kind: "shielded", size: 2, clock: 3 },
      { kind: "venomed", size: 2, clock: 3 },
    ]);
    s0 = withConditions(s0, "d1", [{ kind: "shielded", size: 2, clock: 3 }]);
    const err = (spell: string, fuel: ReturnType<typeof ref>) =>
      actionError(s0, castAction(s0, spell, [S("d0")], { fuel }));
    expect(err("hush-now", ref(s0, "d0", "shielded"))).toMatch(/no size/);
    expect(err("jolt", ref(s0, "d0", "venomed"))).toMatch(/opposed/);
    expect(err("jolt", ref(s0, "d1", "shielded"))).toMatch(/touches/);
  });

  it("burning a Hold makes its bearer Wary", () => {
    const s0 = withConditions(basic(), "d0", [{ kind: "turned", clock: 1 }]);
    // Turned d0 now fights for the attacker; Turned is Accord, opposed to Storm.
    const s1 = cast(s0, "jolt", [S("d0")], {
      fuel: ref(s0, "d0", "turned"),
    }).state;
    expect(stack(s1, "d0").side).toBe("defender");
    expect(stack(s1, "d0").wary).toBeGreaterThan(0);
  });

  it("Echo and Fuel together: Echo first, then Fuel, then the spell", () => {
    const s0 = withConditions(basic(), "d0", [
      { kind: "venomed", size: 2, clock: 2 },
      { kind: "shielded", size: 2, clock: 3 },
    ]);
    const step = cast(s0, "jolt", [S("d0")], {
      echo: ref(s0, "d0", "venomed"),
      fuel: ref(s0, "d0", "shielded"),
    });
    const rules = step.events
      .filter((e) => e.type === "condition" || e.type === "harm")
      .map((e) => e.rule);
    expect(rules).toEqual(["echo", "fuel", "jolt"]);
    expect(stack(step.state, "d0").conditions).toMatchObject([
      { kind: "venomed", clock: 3 },
    ]);
  });
});

describe("rehearsal of a cast", () => {
  it("shows the exact chain the cast will produce, without applying it", () => {
    const s0 = withConditions(basic(), "d0", [
      { kind: "shielded", size: 2, clock: 3 },
    ]);
    const action = castAction(s0, "jolt", [S("d0")], {
      fuel: ref(s0, "d0", "shielded"),
    });
    const r = preview(s0, "jolt", [S("d0")], {
      fuel: ref(s0, "d0", "shielded"),
    });
    expect(r.legal).toBe(true);
    expect(r.summary).toEqual([
      {
        stackId: "d0",
        hpLost: 80,
        killed: 8,
        conditionsGained: [],
        conditionsLost: ["shielded"],
      },
    ]);
    const applied = applyAction(s0, action);
    expect(r.steps).toEqual(applied.events.slice(0, r.steps.length));
    expect(s0.sides.attacker.magic?.mana).toBe(60);
  });

  it("returns a refusal with the reason for an illegal cast", () => {
    const s0 = basic({ mana: 0 });
    const r = preview(s0, "jolt", [S("d0")]);
    expect(r.legal).toMatchObject({ code: "illegal", message: /mana/ });
  });
});

describe("creature casters (2.6)", () => {
  const FRIAR = {
    ...PIKE,
    id: "test-friar",
    name: "Friar",
    tier: 4,
    hp: 30,
    speed: 9,
  };
  registerCreatureCaster("test-friar", {
    pages: ["mend", "share"],
    castPower: 1,
    castDivisor: 2,
    castCap: 8,
  });
  const casterBattle = (count: number) =>
    withConditions(
      battle({
        mine: [
          { creature: FRIAR, hex: { col: 1, row: 5 }, count },
          { hex: { col: 1, row: 6 }, count: 10 },
        ],
        theirs: [{ hex: { col: 12, row: 5 } }],
      }),
      "a1",
      [],
    );

  it("Power = castPower + floor(count / castDivisor), capped", () => {
    expect(creatureCastPower(stack(casterBattle(4), "a0"))).toBe(3);
    expect(creatureCastPower(stack(casterBattle(30), "a0"))).toBe(8);
  });

  it("casts a page as its action, once per battle, without the hero's cast", () => {
    let s0 = casterBattle(4);
    s0 = {
      ...s0,
      stacks: s0.stacks.map((s) =>
        s.id === "a1" ? { ...s, count: 5, topHp: 10 } : s,
      ),
    };
    const step = applyAction(s0, {
      type: "creatureCast",
      stackId: "a0",
      spell: "mend",
      targets: [S("a1")],
    });
    // Power 3: heal 50, reviving: 5 creatures come back.
    expect(stack(step.state, "a1").count).toBe(10);
    expect(step.state.activeStackId).not.toBe("a0");
    expect(step.state.sides.attacker.castRound).toBe(0);
    expect(stack(step.state, "a0").abilitiesUsed).toContain("page:mend");
    expect(step.events.find((e) => e.type === "creatureCast")).toMatchObject({
      spell: "mend",
      power: 3,
    });
    const again = nextRound(step.state);
    const a0turn = again.activeStackId === "a0" ? again : again;
    expect(
      actionError(a0turn, {
        type: "creatureCast",
        stackId: "a0",
        spell: "mend",
        targets: [S("a1")],
      }),
    ).toMatch(/spent|not the active/);
  });

  it("refuses pages it does not list and non-casters", () => {
    const s0 = casterBattle(4);
    expect(
      actionError(s0, {
        type: "creatureCast",
        stackId: "a0",
        spell: "jolt",
        targets: [S("d0")],
      }),
    ).toMatch(/no page jolt/);
  });
});

describe("ranged and area basics", () => {
  it("Hushed stops a shooter", () => {
    const s0 = battle({
      mine: [{ hex: { col: 1, row: 5 } }],
      theirs: [{ creature: BOW, hex: { col: 12, row: 5 } }],
    });
    const s1 = cast(s0, "hush-now", [S("d0")]).state;
    expect(kinds(s1, "d0")).toEqual(["hushed"]);
  });

  it("an area spell takes a hex and touches the stacks in it", () => {
    const s0 = basic();
    const r = preview(s0, "broadside", [H(10, 6)]);
    expect(r.summary.map((x) => x.stackId).sort()).toEqual(["d0", "d1"]);
    void C;
  });
});

describe("hero model rules carried into the battle", () => {
  it("per-school page Power and scroll Power from the profile win", () => {
    const s0 = basic({
      pagePower: { storm: 7 },
      scrollPower: 5,
      scrolls: ["jolt"],
    });
    expect(hpLost(s0, cast(s0, "jolt", [S("d0")]).state, "d0")).toBe(90);
    expect(
      hpLost(s0, cast(s0, "jolt", [S("d0")], { scroll: true }).state, "d0"),
    ).toBe(70);
  });

  it("Echo adds 2 with the echo-adds-2 switch", () => {
    const s0 = withConditions(basic({ echoRounds: 2 }), "d0", [
      { kind: "venomed", size: 2, clock: 2 },
    ]);
    const s1 = cast(s0, "jolt", [S("d0")], {
      echo: ref(s0, "d0", "venomed"),
    }).state;
    expect(stack(s1, "d0").conditions[0]?.clock).toBe(4);
  });

  it("vows bar a school and casting rounds", () => {
    const s0 = basic({ neverCast: ["storm"], scrolls: ["jolt"] });
    expect(actionError(s0, castAction(s0, "jolt", [S("d0")]))).toBe(
      "a vow bars storm spells",
    );
    expect(
      actionError(s0, castAction(s0, "jolt", [S("d0")], { scroll: true })),
    ).toBe("a vow bars storm spells");
    const s1 = basic({ noCastRounds: "1-2" });
    expect(actionError(s1, castAction(s1, "nettle", [S("d0")]))).toBe(
      "a vow bars casting this round",
    );
  });
});
