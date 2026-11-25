/**
 * Hero battle rules (src/data/effects.ts RULE_SWITCH_IDS): one hand-built
 * case per rule id, each the rule's catalogue sentence acted out on a tiny
 * board. The last test checks that every id has a case here.
 */
import { describe, expect, it } from "vitest";
import {
  act as actOf,
  actionError,
  applyAction,
  canShoot,
  computeBreakdown,
  conditionKind,
  heroActError,
  neighbors,
  registerAct,
  type BattleSide,
  type BattleStack,
  type BattleState,
  type ConditionSpec,
  type Hex,
  type StackId,
} from "../../../src/core/battle/index.ts";
import { heroCastError, heroManaCost } from "../../../src/core/battle/magic.ts";
import { Draft, Resolver } from "../../../src/core/battle/resolve.ts";
import {
  abilityReach,
  retaliationLimit,
} from "../../../src/core/battle/rules.ts";
import { remainsQualify } from "../../../src/core/magic/targets.ts";
import { RULE_SWITCH_IDS } from "../../../src/data/effects.ts";
import { magicFromProfile } from "../../../src/core/battle/resolver.ts";
import type { HeroBattleProfile } from "../../../src/core/game/battle-profile.ts";
import {
  BOW,
  PIKE,
  S,
  battle,
  cast,
  castAction,
  hpLost,
  kinds,
  ref,
  stack,
  withConditions,
} from "../magic/helpers.ts";

const covered = new Set<string>();

/** A test of one rule id (registered for the coverage check). */
function rule(id: string, title: string, fn: () => void): void {
  covered.add(id);
  it(`${id}: ${title}`, fn);
}

/** Test surgery: give a side's hero these rules. */
function withRules(
  state: BattleState,
  side: BattleSide,
  rules: readonly string[],
): BattleState {
  const st = state.sides[side];
  return {
    ...state,
    sides: {
      ...state.sides,
      [side]: { ...st, rules: [...rules], rulesUsed: [] },
    },
  };
}

/** Test surgery: patch a stack. */
function patch(
  state: BattleState,
  id: StackId,
  p: Partial<BattleStack>,
): BattleState {
  return {
    ...state,
    stacks: state.stacks.map((s) => (s.id === id ? { ...s, ...p } : s)),
  };
}

const CENTRE: Hex = { col: 7, row: 5 };
const around = neighbors(CENTRE);
const at = (i: number): Hex => around[i] as Hex;

/**
 * a0 (Speed 9, acts first) far left; a1 at the centre with a2 beside it;
 * d0 beside a1, d1 beside d0. Both sides have heroes; the defender's hero
 * has no book.
 */
function board(
  opts: {
    mine?: Parameters<typeof battle>[0]["mine"];
    theirs?: Parameters<typeof battle>[0]["theirs"];
    magic?: Parameters<typeof battle>[0]["magic"];
  } = {},
): BattleState {
  return battle({
    mine: opts.mine ?? [
      { hex: { col: 1, row: 1 } },
      { hex: CENTRE },
      { hex: at(3) },
    ],
    theirs: opts.theirs ?? [{ hex: at(0) }, { hex: neighbors(at(0))[0]! }],
    enemyMagic: { power: 0, mana: 0, pages: [] },
    ...(opts.magic ? { magic: opts.magic } : {}),
  });
}

function fx(state: BattleState): { d: Draft; fx: Resolver } {
  const d = new Draft(state);
  return { d, fx: new Resolver(d, () => false) };
}

function cond(state: BattleState, id: StackId, kind: string) {
  return stack(state, id).conditions.find((c) => c.kind === kind);
}

/** Every stack defends until round `n` starts. */
function toRound(state: BattleState, n: number): BattleState {
  let s = state;
  for (let i = 0; i < 100 && s.round < n && s.winner === null; i++) {
    s = applyAction(s, {
      type: "defend",
      stackId: s.activeStackId as string,
    }).state;
  }
  return s;
}

const totalHp = (s: BattleStack): number =>
  s.count === 0 ? 0 : (s.count - 1) * s.creature.hp + s.topHp;

describe("casting rules", () => {
  rule("second-cast-opposed", "a second page of an opposed school", () => {
    const s0 = withRules(board(), "attacker", ["second-cast-opposed"]);
    const s1 = cast(s0, "nettle", [S("d0")]).state;
    expect(actionError(s1, castAction(s1, "hush-now", [S("d0")]))).toBeNull();
    expect(actionError(s1, castAction(s1, "jolt", [S("d0")]))).toMatch(
      /opposed/,
    );
    const plain = cast(board(), "nettle", [S("d0")]).state;
    expect(
      actionError(plain, castAction(plain, "hush-now", [S("d0")])),
    ).toMatch(/already cast/);
  });

  rule("second-cast-opposed-round-1", "only in round 1", () => {
    const s0 = withRules(board(), "attacker", ["second-cast-opposed-round-1"]);
    const s1 = cast(s0, "nettle", [S("d0")]).state;
    expect(actionError(s1, castAction(s1, "hush-now", [S("d0")]))).toBeNull();
    const r2 = cast({ ...s0, round: 2 }, "nettle", [S("d0")]).state;
    expect(actionError(r2, castAction(r2, "hush-now", [S("d0")]))).toMatch(
      /already cast/,
    );
  });

  rule("second-cast-round-1", "Vow of the Opening: any school", () => {
    const s0 = withRules(board(), "attacker", ["second-cast-round-1"]);
    const s1 = cast(s0, "nettle", [S("d0")]).state;
    expect(actionError(s1, castAction(s1, "jolt", [S("d0")]))).toBeNull();
    const s2 = cast(s1, "jolt", [S("d0")]).state;
    expect(heroActError(s2, "attacker", "hush-now")).toMatch(/twice/);
  });

  rule("first-scroll-free", "Packrat 3: the first scroll is free", () => {
    const s0 = withRules(
      board({ magic: { scrolls: ["jolt", "jolt"] } }),
      "attacker",
      ["first-scroll-free"],
    );
    const s1 = cast(s0, "nettle", [S("d0")]).state;
    expect(
      actionError(s1, castAction(s1, "jolt", [S("d0")], { scroll: true })),
    ).toBeNull();
    const s2 = cast(s1, "jolt", [S("d0")], { scroll: true }).state;
    expect(
      actionError(s2, castAction(s2, "jolt", [S("d0")], { scroll: true })),
    ).toMatch(/already cast/);
  });

  rule("opposed-page-discount", "The Glove's Lining: 25% off", () => {
    const base = board();
    const m = base.sides.attacker.magic!;
    const s = withRules(
      {
        ...base,
        round: 2,
        sides: {
          ...base.sides,
          attacker: {
            ...base.sides.attacker,
            magic: {
              ...m,
              casts: [
                { round: 1, school: "bloom", scroll: false, free: false },
              ],
            },
          },
        },
      },
      "attacker",
      ["opposed-page-discount"],
    );
    // Deadline is Clock tier 4 (14 mana), opposed to Bloom: 11.
    expect(heroManaCost(s, "attacker", actOf("deadline"), false)).toBe(11);
    // Jolt is Storm, allied to Bloom: full price.
    expect(heroManaCost(s, "attacker", actOf("jolt"), false)).toBe(4);
  });

  rule("opposed-cast-fires-up", "The Odd Cufflink", () => {
    const s0 = withRules(board(), "attacker", [
      "second-cast-opposed",
      "opposed-cast-fires-up",
    ]);
    const s1 = cast(s0, "nettle", [S("d0")]).state;
    expect(kinds(s1, "a0")).not.toContain("fired-up");
    const s2 = cast(s1, "hush-now", [S("d0")]).state;
    expect(kinds(s2, "a0")).toContain("fired-up");
  });

  rule("unspent-page", "The Unspent Page's page is never spent", () => {
    const s0 = withRules(
      board({ magic: { unspentPage: "nettle" } }),
      "attacker",
      ["unspent-page"],
    );
    const s1 = cast(s0, "nettle", [S("d0")]).state;
    expect(s1.sides.attacker.magic!.spent).not.toContain("nettle");
    expect(s1.sides.attacker.magic!.mana).toBe(56);
    expect(heroCastError(s1, "attacker", "nettle", false)).toBeNull();
  });

  rule("tier1-twice", "The Torn Corner: tier 1 pages twice", () => {
    const s0 = withRules(board(), "attacker", ["tier1-twice"]);
    const s1 = cast(s0, "nettle", [S("d0")]).state;
    expect(heroCastError(s1, "attacker", "nettle", false)).toBeNull();
    const plain = cast(board(), "nettle", [S("d0")]).state;
    expect(heroCastError(plain, "attacker", "nettle", false)).toMatch(/spent/);
  });

  rule("scrolls-kept", "Vow of the Borrowed Book", () => {
    const s0 = withRules(board({ magic: { scrolls: ["jolt"] } }), "attacker", [
      "scrolls-kept",
    ]);
    const s1 = cast(s0, "jolt", [S("d0")], { scroll: true }).state;
    const m = s1.sides.attacker.magic!;
    expect(m.scrolls).toEqual(["jolt"]);
    expect(m.mana).toBe(56);
    expect(heroCastError(s1, "attacker", "jolt", true)).toMatch(/spent/);
  });

  rule("first-scroll-kept", "Bookbinder's Thread", () => {
    const s0 = withRules(
      board({ magic: { scrolls: ["jolt", "hush-now"] } }),
      "attacker",
      ["first-scroll-kept"],
    );
    const s1 = cast(s0, "jolt", [S("d0")], { scroll: true }).state;
    expect(s1.sides.attacker.magic!.scrolls).toEqual(["jolt", "hush-now"]);
    expect(s1.sides.attacker.magic!.scrollsUsed).toEqual([]);
    expect(s1.sides.attacker.magic!.mana).toBe(60);
  });

  rule("hush-unspent-own", "Vow of the Grave", () => {
    const s0 = withRules(board(), "attacker", ["hush-unspent-own"]);
    const own = cast(s0, "on-credit", [S("a1")]).state;
    expect(own.sides.attacker.magic!.spent).not.toContain("on-credit");
    const foe = cast(s0, "on-credit", [S("d0")]).state;
    expect(foe.sides.attacker.magic!.spent).toContain("on-credit");
  });

  rule("fuel-triples", "Bonfire: Fuel triples the size", () => {
    const base = withConditions(
      patch(board(), "d0", { count: 60, initialCount: 60 }),
      "d0",
      [{ kind: "shielded", size: 2, clock: 3 }],
    );
    const fuel = ref(base, "d0", "shielded");
    const doubled = cast(base, "jolt", [S("d0")], { fuel }).state;
    const tripled = cast(
      withRules(base, "attacker", ["fuel-triples"]),
      "jolt",
      [S("d0")],
      { fuel },
    ).state;
    const big = patch(board(), "d0", { count: 60, initialCount: 60 });
    const x = hpLost(big, cast(big, "jolt", [S("d0")]).state, "d0");
    expect(hpLost(base, doubled, "d0")).toBe(2 * x);
    expect(hpLost(base, tripled, "d0")).toBe(3 * x);
  });

  rule("storm-spares-own", "Vow of the Pyre", () => {
    const s0 = board();
    expect(hpLost(s0, cast(s0, "jolt", [S("a1")]).state, "a1")).toBeGreaterThan(
      0,
    );
    const v = withRules(s0, "attacker", ["storm-spares-own"]);
    expect(hpLost(v, cast(v, "jolt", [S("a1")]).state, "a1")).toBe(0);
  });

  rule("chain-lightning", "a page's Harm to a Drenched enemy jumps", () => {
    const s0 = withConditions(
      withRules(
        board({
          mine: [{ hex: { col: 1, row: 1 } }],
          theirs: [
            { hex: CENTRE, count: 30 },
            { hex: at(0), count: 30 },
          ],
        }),
        "attacker",
        ["chain-lightning"],
      ),
      "d0",
      [{ kind: "drenched", size: 20, clock: 3 }],
    );
    const s1 = cast(s0, "jolt", [S("d0")]).state;
    expect(hpLost(s0, s1, "d1")).toBe(15);
  });

  rule("spillover", "the first bane spills to an adjacent stack", () => {
    const s0 = withRules(board(), "attacker", ["spillover"]);
    const s1 = cast(s0, "hush-now", [S("d0")]).state;
    expect(kinds(s1, "d0")).toContain("hushed");
    expect(kinds(s1, "d1")).toContain("hushed");
    expect(s1.sides.attacker.rulesUsed).toContain("spillover");
    const plain = cast(board(), "hush-now", [S("d0")]).state;
    expect(kinds(plain, "d1")).not.toContain("hushed");
  });
});

describe("clock rules", () => {
  const withClocks = (rules: string[]): BattleState =>
    withRules(
      withConditions(
        withConditions(board(), "a1", [
          { kind: "fired-up", size: 2, clock: 1 },
          { kind: "slowed", size: 1, clock: 1 },
        ]),
        "a2",
        [{ kind: "fired-up", size: 2, clock: 1 }],
      ),
      "attacker",
      rules,
    );

  rule("own-clocks-frozen", "The Hourglass: no clock ticks", () => {
    const s = toRound(withClocks(["own-clocks-frozen"]), 2);
    expect(kinds(s, "a1")).toEqual(
      expect.arrayContaining(["fired-up", "slowed"]),
    );
    expect(kinds(toRound(withClocks([]), 2), "a1")).not.toContain("fired-up");
  });

  rule("own-bane-clocks-frozen", "The Upper Bulb: banes only", () => {
    const s = toRound(withClocks(["own-bane-clocks-frozen"]), 2);
    expect(kinds(s, "a1")).toContain("slowed");
    expect(kinds(s, "a1")).not.toContain("fired-up");
  });

  rule("strongest-boon-clocks-frozen", "The Lower Bulb", () => {
    const s0 = patch(withClocks(["strongest-boon-clocks-frozen"]), "a1", {
      count: 40,
      initialCount: 40,
    });
    const s = toRound(s0, 2);
    expect(kinds(s, "a1")).toContain("fired-up");
    expect(kinds(s, "a1")).not.toContain("slowed");
    expect(kinds(s, "a2")).not.toContain("fired-up");
  });
});

describe("link rules", () => {
  rule("link-passes", "Treaty Ink: a dying end passes on", () => {
    const linked = (rules: string[]): BattleState =>
      withRules(
        withConditions(patch(board(), "a2", { count: 1 }), "a1", [
          { kind: "scapegoat", link: "a2", clock: 3 },
        ]),
        "attacker",
        rules,
      );
    const s0 = linked(["link-passes"]);
    const s1 = cast(s0, "jolt", [S("a2")]).state;
    expect(stack(s1, "a2").count).toBe(0);
    const c = cond(s1, "a1", "scapegoat");
    expect(c).toBeDefined();
    expect(c?.link).not.toBe("a2");
    const plain = cast(linked([]), "jolt", [S("a2")]).state;
    expect(cond(plain, "a1", "scapegoat")).toBeUndefined();
  });

  rule("links-clockless", "Vow of the Still Air", () => {
    const s0 = withRules(board(), "attacker", ["links-clockless"]);
    const s1 = cast(s0, "scapegoat", [S("a1"), S("a2")]).state;
    expect(cond(s1, "a1", "scapegoat")?.clock).toBeNull();
  });

  rule("link-clock-plus-1", "The Quill", () => {
    const plain = cast(board(), "scapegoat", [S("a1"), S("a2")]).state;
    const quill = cast(
      withRules(board(), "attacker", ["link-clock-plus-1"]),
      "scapegoat",
      [S("a1"), S("a2")],
    ).state;
    expect(cond(quill, "a1", "scapegoat")!.clock).toBe(
      cond(plain, "a1", "scapegoat")!.clock! + 1,
    );
  });

  rule("scapegoat-no-backlash", "The Blotter", () => {
    const linked = (rules: string[]): BattleState =>
      withRules(
        withConditions(patch(board(), "a2", { count: 1 }), "a1", [
          { kind: "scapegoat", link: "a2", clock: 3 },
        ]),
        "attacker",
        rules,
      );
    const hit = (s: BattleState): number => {
      const { d, fx: r } = fx(s);
      r.harm("a1", 40);
      return totalHp(stack(s, "a1")) - totalHp(d.get("a1"));
    };
    expect(hit(linked([]))).toBe(30);
    expect(hit(linked(["scapegoat-no-backlash"]))).toBe(0);
  });
});

describe("ground and remains rules", () => {
  rule("remains-any-owner", "Sexton's Spade", () => {
    const s = board();
    expect(remainsQualify(s, "attacker", "defender")).toBe(false);
    const spade = withRules(s, "attacker", ["remains-any-owner"]);
    expect(remainsQualify(spade, "attacker", "defender")).toBe(true);
  });

  rule("gleaner", "using remains returns 2 mana", () => {
    const withCorpse = (s: BattleState): BattleState => ({
      ...s,
      ground: [
        ...s.ground,
        {
          hex: { col: 2, row: 3 },
          kind: "corpse",
          class: "remains",
          school: null,
          size: 0,
          clock: null,
          remains: { creature: PIKE, owner: "attacker", initialCount: 5 },
          source: "test",
        },
      ],
    });
    const mana = (rules: string[]): number => {
      const s0 = withRules(withCorpse(board()), "attacker", rules);
      const s1 = cast(s0, "second-shift", [{ hex: { col: 2, row: 3 } }]).state;
      return s1.sides.attacker.magic!.mana;
    };
    expect(mana(["gleaner"]) - mana([])).toBe(2);
  });

  rule("mirror-ward", "Warded stacks take no Harm from ground", () => {
    const s = withConditions(board(), "a1", [{ kind: "warded", size: 30 }]);
    const harm = (st: BattleState): number => {
      const { d, fx: r } = fx(st);
      return d.within(null, "ground:fire", () => r.harm("a1", 10));
    };
    expect(harm(s)).toBe(7);
    expect(harm(withRules(s, "attacker", ["mirror-ward"]))).toBe(0);
  });

  rule("firewalkers", "Fired Up stacks ignore Burning and fire", () => {
    const s = withConditions(board(), "a1", [{ kind: "fired-up", size: 2 }]);
    const harm = (st: BattleState, rule0: string): number => {
      const { d, fx: r } = fx(st);
      return d.within(null, rule0, () => r.harm("a1", 10));
    };
    const fw = withRules(s, "attacker", ["firewalkers"]);
    expect(harm(s, "condition:burning")).toBe(10);
    expect(harm(fw, "condition:burning")).toBe(0);
    expect(harm(fw, "ground:fire")).toBe(0);
    expect(harm(fw, "nettle")).toBe(10);
  });

  rule("seed-bombs", "a shooter's first shot leaves brambles", () => {
    const s0 = withRules(
      board({
        mine: [{ hex: { col: 1, row: 1 }, creature: { ...BOW, speed: 9 } }],
        theirs: [{ hex: CENTRE, count: 30 }],
      }),
      "attacker",
      ["seed-bombs"],
    );
    const s1 = applyAction(s0, {
      type: "shoot",
      stackId: "a0",
      targetId: "d0",
    }).state;
    expect(
      s1.ground.some(
        (g) => g.kind === "brambles" && g.hex.col === 7 && g.hex.row === 5,
      ),
    ).toBe(true);
    expect(s1.sides.attacker.rulesUsed).toContain("seed-bombs:a0");
  });
});

describe("retaliation rules", () => {
  /** d0 at the centre with a0, a1 and a2 all beside it. */
  const retBoard = (): BattleState =>
    battle({
      mine: [{ hex: at(1) }, { hex: at(2) }, { hex: at(3) }],
      theirs: [{ hex: CENTRE }, { hex: { col: 13, row: 9 } }],
      enemyMagic: { power: 0, mana: 0, pages: [] },
    });
  /** d0 is struck by a1 `n` times in one round; its retaliations. */
  const retaliations = (s: BattleState, n: number): number => {
    const { d, fx: r } = fx(s);
    for (let i = 0; i < n; i++) {
      d.beginStep();
      r.strikeKind(["a1", "a2", "a0"][i] as string, "d0", "melee", 0);
      r.resolveReactions();
    }
    return d.events.filter((e) => e.type === "retaliation").length;
  };
  const big = (s: BattleState): BattleState =>
    patch(patch(s, "d0", { count: 200, initialCount: 200 }), "a1", {
      count: 500,
      initialCount: 500,
    });

  rule("riposte-1", "the strongest stack retaliates twice", () => {
    expect(retaliations(big(retBoard()), 3)).toBe(1);
    expect(
      retaliations(withRules(big(retBoard()), "defender", ["riposte-1"]), 3),
    ).toBe(2);
  });

  rule("riposte-2", "the two strongest", () => {
    const s = withRules(big(retBoard()), "defender", ["riposte-2"]);
    expect(retaliationLimit(s, stack(s, "d1"))).toBe(2);
    expect(
      retaliationLimit(
        withRules(big(retBoard()), "defender", ["riposte-1"]),
        stack(s, "d1"),
      ),
    ).toBe(1);
  });

  rule("riposte-3", "the three strongest", () => {
    const s = withRules(board(), "attacker", ["riposte-3"]);
    for (const id of ["a0", "a1", "a2"])
      expect(retaliationLimit(s, stack(s, id))).toBe(2);
  });

  rule("shield-wall", "Shielded stacks retaliate every time", () => {
    const s = withRules(
      withConditions(big(retBoard()), "d0", [{ kind: "shielded", size: 2 }]),
      "defender",
      ["shield-wall"],
    );
    expect(retaliations(s, 3)).toBe(3);
  });

  rule("peace-dividend", "no retaliation from a Mollified stack", () => {
    const s = withConditions(big(retBoard()), "d0", [
      { kind: "mollified", size: 25 },
    ]);
    expect(retaliations(s, 1)).toBe(1);
    expect(retaliations(withRules(s, "attacker", ["peace-dividend"]), 1)).toBe(
      0,
    );
  });

  rule("gag-rule", "Hushed enemies cannot retaliate", () => {
    const s = withConditions(big(retBoard()), "d0", [{ kind: "hushed" }]);
    expect(retaliations(s, 1)).toBe(1);
    expect(retaliations(withRules(s, "attacker", ["gag-rule"]), 1)).toBe(0);
  });
});

describe("gates, shooting, timeline and the Command", () => {
  rule("gates-double-hp", "Vow of Bare Hands", () => {
    const sleep: ConditionSpec = {
      kind: "asleep",
      gate: { measure: "hp", max: 150 },
    };
    const land = (s: BattleState): boolean => {
      const { fx: r } = fx(s);
      return r.addCondition("a1", sleep).landed;
    };
    expect(land(board())).toBe(true);
    expect(land(withRules(board(), "attacker", ["gates-double-hp"]))).toBe(
      false,
    );
  });

  rule("soaked-powder", "Drenched enemy shooters cannot shoot", () => {
    const s0 = withConditions(
      board({
        mine: [{ hex: { col: 1, row: 1 }, creature: { ...BOW, speed: 9 } }],
        theirs: [{ hex: CENTRE }],
      }),
      "a0",
      [{ kind: "drenched", size: 20 }],
    );
    expect(canShoot(s0, "a0")).toBe(true);
    expect(canShoot(withRules(s0, "defender", ["soaked-powder"]), "a0")).toBe(
      false,
    );
  });

  rule("heartened-survives-once", "Vow of Flesh and Blood", () => {
    const s0 = withConditions(board(), "a0", [{ kind: "heartened" }]);
    const kept = applyAction(
      withRules(s0, "attacker", ["heartened-survives-once"]),
      { type: "defend", stackId: "a0" },
    ).state;
    expect(kinds(kept, "a0")).toContain("heartened");
    expect(kept.activeStackId).toBe("a0");
    const plain = applyAction(s0, { type: "defend", stackId: "a0" }).state;
    expect(kinds(plain, "a0")).not.toContain("heartened");
  });

  rule("mob-rule", "spending Heartened fires the stack up", () => {
    const s0 = withRules(
      withConditions(board(), "a0", [{ kind: "heartened" }]),
      "attacker",
      ["mob-rule"],
    );
    const s1 = applyAction(s0, { type: "defend", stackId: "a0" }).state;
    expect(cond(s1, "a0", "fired-up")?.size).toBe(3);
  });

  registerAct({
    id: "test-drill-command",
    name: "Test Command",
    text: "Choose a stack.",
    kind: "command",
    targets: 1,
    resolve() {},
  });
  const command = (rules: string[]): BattleState =>
    applyAction(withRules(board(), "attacker", rules), {
      type: "heroAct",
      stackId: "a0",
      act: "test-drill-command",
      targets: [S("a1")],
    }).state;

  rule("drill-sergeant-1", "Command targets gain Fired Up 2", () => {
    const s = command(["drill-sergeant-1"]);
    expect(cond(s, "a1", "fired-up")?.size).toBe(2);
    expect(kinds(s, "a1")).not.toContain("shielded");
    expect(kinds(command([]), "a1")).not.toContain("fired-up");
  });

  rule("drill-sergeant-3", "and Shielded 3", () => {
    const s = command(["drill-sergeant-3"]);
    expect(cond(s, "a1", "fired-up")?.size).toBe(2);
    expect(cond(s, "a1", "shielded")?.size).toBe(3);
  });
});

describe("ability reach (Long Shadow)", () => {
  const strong = (s: BattleState): BattleState =>
    patch(s, "a1", { count: 50, initialCount: 50 });

  rule("long-shadow-1", "the strongest stack reaches 2", () => {
    const s = withRules(strong(board()), "attacker", ["long-shadow-1"]);
    expect(abilityReach(s, stack(s, "a1"))).toBe(2);
    expect(abilityReach(s, stack(s, "a2"))).toBe(1);
    expect(abilityReach(strong(board()), stack(s, "a1"))).toBe(1);
  });

  rule("long-shadow-2", "the two strongest", () => {
    const s = withRules(strong(board()), "attacker", ["long-shadow-2"]);
    expect(abilityReach(s, stack(s, "a0"))).toBe(2);
    expect(abilityReach(s, stack(s, "a2"))).toBe(1);
  });

  rule("long-shadow-3", "every stack", () => {
    const s = withRules(board(), "attacker", ["long-shadow-3"]);
    for (const id of ["a0", "a1", "a2"])
      expect(abilityReach(s, stack(s, id))).toBe(2);
  });
});

describe("condition-kind rules", () => {
  const breakdown = (s: BattleState, a: StackId, d: StackId) =>
    computeBreakdown({
      state: s,
      attacker: stack(s, a),
      defender: stack(s, d),
      kind: "melee",
      hexesMoved: 0,
    });

  rule("cold-hands", "Frozen's Strike is x 300%", () => {
    const s = withConditions(board(), "d0", [{ kind: "frozen", clock: 1 }]);
    const pct = (st: BattleState) =>
      breakdown(st, "a1", "d0").abilityMultipliers.find(
        (m) => m.label === "Frozen",
      )?.percent;
    expect(pct(s)).toBe(200);
    expect(pct(withRules(s, "attacker", ["cold-hands"]))).toBe(300);
  });

  rule("double-or-nothing", "Lucky x 200%, then Jinxed", () => {
    const s = withRules(
      withConditions(board(), "a1", [{ kind: "lucky" }]),
      "attacker",
      ["double-or-nothing"],
    );
    expect(
      breakdown(s, "a1", "d0").abilityMultipliers.find(
        (m) => m.label === "Lucky",
      )?.percent,
    ).toBe(200);
    const { d, fx: r } = fx(s);
    r.endCondition("a1", cond(s, "a1", "lucky")!.uid);
    expect(d.get("a1").conditions.find((c) => c.kind === "jinxed")?.size).toBe(
      25,
    );
  });

  /** a1 at 5 of 10 Pikemen, bearing `spec`; its turn-start hook runs. */
  const turnStart = (
    rules: string[],
    spec: ConditionSpec,
    id: StackId = "a1",
  ): { before: BattleState; d: Draft } => {
    const s = withRules(
      withConditions(patch(board(), "a1", { count: 5 }), id, [spec]),
      "attacker",
      rules,
    );
    const c = cond(s, id, spec.kind)!;
    const { d, fx: r } = fx(s);
    conditionKind(c.kind).onTurnStart?.(r, id, c);
    r.resolveReactions();
    return { before: s, d };
  };

  rule("green-thumb", "Mending heals half again", () => {
    const m = { kind: "mending", size: 10 };
    const plain = turnStart([], m);
    const green = turnStart(["green-thumb"], m);
    expect(
      totalHp(plain.d.get("a1")) - totalHp(stack(plain.before, "a1")),
    ).toBe(10);
    expect(
      totalHp(green.d.get("a1")) - totalHp(stack(green.before, "a1")),
    ).toBe(15);
  });

  rule("gardeners-apron", "Mending's heal venoms adjacent enemies", () => {
    const { d } = turnStart(["gardeners-apron"], { kind: "mending", size: 10 });
    expect(d.get("d0").conditions.map((c) => c.kind)).toContain("venomed");
    expect(d.get("d1").conditions.map((c) => c.kind)).not.toContain("venomed");
  });

  rule("harvest", "Ripening grows by 20", () => {
    const { d } = turnStart(["harvest"], { kind: "ripening", size: 10 });
    expect(
      d.get("a1").conditions.find((c) => c.kind === "ripening")?.size,
    ).toBe(30);
  });

  rule("compound-interest", "an enemy's Reckoning grows by 10", () => {
    const s = withRules(
      withConditions(board(), "d0", [{ kind: "reckoning", size: 10 }]),
      "attacker",
      ["compound-interest"],
    );
    const c = cond(s, "d0", "reckoning")!;
    const { d, fx: r } = fx(s);
    conditionKind("reckoning").onTurnStart?.(r, "d0", c);
    expect(
      d.get("d0").conditions.find((x) => x.kind === "reckoning")?.size,
    ).toBe(20);
  });

  /** d0 is Leeched with its far end a1 (at 5 of 10); d0's turn starts. */
  const leech = (rules: string[]) => {
    const s = withRules(
      withConditions(patch(board(), "a1", { count: 5 }), "d0", [
        { kind: "leeched", size: 6, link: "a1" },
      ]),
      "attacker",
      rules,
    );
    const c = cond(s, "d0", "leeched")!;
    const { d, fx: r } = fx(s);
    conditionKind("leeched").onTurnStart?.(r, "d0", c);
    return { gained: totalHp(d.get("a1")) - totalHp(stack(s, "a1")), d };
  };

  rule("bloodletting", "Leeched heals its far end twice", () => {
    expect(leech([]).gained).toBe(6);
    expect(leech(["bloodletting"]).gained).toBe(12);
  });

  rule("thicker-than-water", "Leeched's heal fires the far end up", () => {
    const { d } = leech(["thicker-than-water"]);
    expect(
      d.get("a1").conditions.find((c) => c.kind === "fired-up")?.size,
    ).toBe(2);
  });

  /** d0 strikes a1 (Thorned 5) with `kind`; d0's conditions after. */
  const thorns = (rules: string[], kind: "melee" | "shot" = "melee") => {
    const s = withRules(
      withConditions(board(), "a1", [{ kind: "thorned", size: 5 }]),
      "attacker",
      rules,
    );
    const { d, fx: r } = fx(s);
    r.strikeKind("d0", "a1", kind, 0);
    r.resolveReactions();
    return {
      kinds: d.get("d0").conditions.map((c) => c.kind),
      lost: totalHp(stack(s, "d0")) - totalHp(d.get("d0")),
    };
  };

  rule("briar-patch", "Thorned's Harm venoms the striker", () => {
    expect(thorns(["briar-patch"]).kinds).toContain("venomed");
    expect(thorns([]).kinds).not.toContain("venomed");
  });

  rule("hedge-clipper-shears", "Thorned's Harm slows the striker", () => {
    expect(thorns(["hedge-clipper-shears"]).kinds).toContain("slowed");
  });

  rule("burr", "Thorned answers shots", () => {
    expect(thorns([], "shot").lost).toBe(0);
    expect(thorns(["burr"], "shot").lost).toBeGreaterThan(0);
  });

  rule("windfall", "ending Ripening spreads half to friends", () => {
    const s = withRules(
      withConditions(board(), "a1", [{ kind: "ripening", size: 20 }]),
      "attacker",
      ["windfall"],
    );
    const { d, fx: r } = fx(s);
    r.endCondition("a1", cond(s, "a1", "ripening")!.uid);
    expect(
      d.get("a2").conditions.find((c) => c.kind === "ripening")?.size,
    ).toBe(10);
    expect(d.get("d0").conditions.map((c) => c.kind)).not.toContain("ripening");
  });

  rule("quickstep", "Quickened adds twice its size in Attack", () => {
    const s = withConditions(board(), "a1", [{ kind: "quickened", size: 2 }]);
    const mod = (st: BattleState) =>
      breakdown(st, "a1", "d0").attackModifiers.find(
        (m) => m.label === "Quickstep",
      )?.amount;
    expect(mod(s)).toBeUndefined();
    expect(mod(withRules(s, "attacker", ["quickstep"]))).toBe(4);
  });

  rule("metronome-spurs", "a Quickened stack's Strike slows", () => {
    const s = withRules(
      withConditions(board(), "a1", [{ kind: "quickened", size: 2 }]),
      "attacker",
      ["metronome-spurs"],
    );
    const { d, fx: r } = fx(patch(s, "d0", { count: 200, initialCount: 200 }));
    r.strikeKind("a1", "d0", "melee", 0);
    r.resolveReactions();
    expect(d.get("d0").conditions.find((c) => c.kind === "slowed")?.size).toBe(
      1,
    );
  });

  rule("co-signer", "half a Reckoning goes to the nearest enemy", () => {
    const s = withRules(
      withConditions(board(), "a1", [{ kind: "reckoning", size: 20 }]),
      "attacker",
      ["co-signer"],
    );
    const { d, fx: r } = fx(s);
    r.expire("a1", cond(s, "a1", "reckoning")!.uid);
    expect(totalHp(stack(s, "a1")) - totalHp(d.get("a1"))).toBe(10);
    expect(totalHp(stack(s, "d0")) - totalHp(d.get("d0"))).toBe(10);
  });

  rule("bailiffs-greatcoat", "an enemy's Reckoning heals your weakest", () => {
    const s = withRules(
      withConditions(patch(board(), "a2", { count: 2 }), "d0", [
        { kind: "reckoning", size: 20 },
      ]),
      "attacker",
      ["bailiffs-greatcoat"],
    );
    const { d, fx: r } = fx(s);
    r.expire("d0", cond(s, "d0", "reckoning")!.uid);
    expect(totalHp(d.get("a2")) - totalHp(stack(s, "a2"))).toBe(20);
  });

  rule(
    "blaze-of-glory",
    "Fired Up expiring sets adjacent enemies alight",
    () => {
      const s = withRules(
        withConditions(board(), "a1", [{ kind: "fired-up", size: 3 }]),
        "attacker",
        ["blaze-of-glory"],
      );
      const { d, fx: r } = fx(s);
      r.expire("a1", cond(s, "a1", "fired-up")!.uid);
      expect(
        d.get("d0").conditions.find((c) => c.kind === "burning")?.size,
      ).toBe(6);
      expect(d.get("a2").conditions.map((c) => c.kind)).not.toContain(
        "burning",
      );
    },
  );

  rule("lightning-rod", "Warded's prevented Harm strikes back", () => {
    const s = withRules(
      withConditions(board(), "a1", [{ kind: "warded", size: 30 }]),
      "attacker",
      ["lightning-rod"],
    );
    const { d, fx: r } = fx(s);
    r.harm("a1", 40);
    r.resolveReactions();
    expect(totalHp(stack(s, "d0")) - totalHp(d.get("d0"))).toBe(12);
  });

  rule("whetstone-pendant", "a Fired Up kill gives Heartened", () => {
    const s = withRules(
      withConditions(patch(board(), "d0", { count: 1 }), "a1", [
        { kind: "fired-up", size: 2 },
      ]),
      "attacker",
      ["whetstone-pendant"],
    );
    const { d, fx: r } = fx(s);
    r.strikeKind("a1", "d0", "melee", 0);
    r.resolveReactions();
    expect(d.get("d0").count).toBe(0);
    expect(d.get("a1").conditions.map((c) => c.kind)).toContain("heartened");
  });
});

describe("profile switches (adventure to battle)", () => {
  // fuel-uses-plus-1 and echo-adds-2 are read by the resolver adapter.
  rule("fuel-uses-plus-1", "two Fuels per battle", () => {
    expect(PROFILE_SWITCH_CHECK("fuel-uses-plus-1").fuelMax).toBe(2);
  });
  rule("echo-adds-2", "Echo adds 2 rounds", () => {
    expect(PROFILE_SWITCH_CHECK("echo-adds-2").echoRounds).toBe(2);
  });
});

function PROFILE_SWITCH_CHECK(id: string) {
  const p = {
    power: 2,
    mana: 10,
    schoolRanks: { bloom: 0, accord: 0, clock: 0, hush: 0, storm: 0 },
    pages: [],
    scrolls: [],
    pagePower: {},
    scrollPower: 2,
    manaCostPercent: 0,
    switches: [id],
    restrictions: [],
    spellPower: {},
    startSpent: [],
  } as unknown as HeroBattleProfile;
  return magicFromProfile(p);
}

describe("coverage", () => {
  it("every rule id has a case above", () => {
    const missing = RULE_SWITCH_IDS.filter((id) => !covered.has(id));
    expect(missing).toEqual([]);
  });
});
