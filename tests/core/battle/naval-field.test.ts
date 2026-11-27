/**
 * Naval battlefields (docs/design/NAVAL.md 3.1 to 3.5, bead bzc.153): the
 * sea ground kind and Swimmers, the four layouts, gangplanks, Wet Landing,
 * the deck gun, Swing Across over the water, deployment, and one fixed-seed
 * battle per layout. Land battles must stay exactly as they were.
 */
import { describe, expect, it } from "vitest";
import "../../../src/core/magic/index.ts";
import {
  DECK_GUN_EFFECT,
  GANGPLANK_BANDS,
  createBattle,
  deckGunHarm,
  deployZone,
  fieldHexKinds,
  fieldState,
  findPath,
  gangplankRows,
  generateObstacles,
  getStack,
  hexIndex,
  layoutGround,
  reachableHexes,
  runAutoBattle,
  stackFightValue,
  swims,
} from "../../../src/core/battle/index.ts";
import type {
  BattleLayout,
  BattleSetup,
  BattleStackSetup,
  BattleState,
  GroundFeature,
  Hex,
} from "../../../src/core/battle/index.ts";
import { at, stats, unit } from "./faction-helpers.ts";
import { play, withFx } from "./helpers.ts";

function kindAt(state: BattleState, h: Hex): string | null {
  return (
    state.ground.find((g) => hexIndex(g.hex) === hexIndex(h))?.kind ?? null
  );
}

function featuresOf(state: BattleState, kind: string, look?: string) {
  return state.ground.filter(
    (g) => g.kind === kind && (look === undefined || g.look === look),
  );
}

function setupOf(
  layout: BattleLayout | undefined,
  attacker: BattleStackSetup[],
  defender: BattleStackSetup[],
  seed = 7,
  extra: Partial<BattleSetup> = {},
): BattleSetup {
  return {
    seed,
    ...(layout !== undefined ? { layout } : {}),
    attacker: { hero: null, stacks: attacker },
    defender: { hero: null, stacks: defender },
    ...extra,
  };
}

const knights = (n = 5): BattleStackSetup[] => [
  { creature: stats("knight"), count: n },
];
const swimmers = (): BattleStackSetup[] => [
  { creature: stats("hammerhead"), count: 3 },
];

/** Plays Defend for every stack until `id` is active. */
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

describe("layouts (NAVAL 3.2)", () => {
  it("deck to deck: sea in columns 6-8 but three gangplanks, a mast a deck", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = fieldState(setupOf("deck", knights(), knights(), seed));
      expect(s.layout).toBe("deck");
      const planks = gangplankRows("deck", s.ground);
      expect(planks).toHaveLength(3);
      GANGPLANK_BANDS.forEach((band, i) =>
        expect(band).toContain(planks[i] as number),
      );
      for (let row = 0; row < 11; row++)
        for (const col of [6, 7, 8])
          expect(kindAt(s, at(col, row)), `${col},${row}`).toBe(
            planks.includes(row) ? null : "sea",
          );
      const masts = featuresOf(s, "mast").map((g) => g.hex);
      expect(masts).toHaveLength(2);
      const [left, right] = masts.sort((a, b) => a.col - b.col) as [Hex, Hex];
      expect(left.col).toBeGreaterThanOrEqual(2);
      expect(left.col).toBeLessThanOrEqual(4);
      expect(right.col).toBeGreaterThanOrEqual(10);
      expect(right.col).toBeLessThanOrEqual(12);
      for (const m of masts) {
        expect(m.row).toBeGreaterThanOrEqual(3);
        expect(m.row).toBeLessThanOrEqual(7);
      }
      const crates = featuresOf(s, "rock", "crate").map((g) => g.hex);
      expect(crates.filter((h) => h.col <= 5).length).toBeLessThanOrEqual(1);
      expect(crates.filter((h) => h.col >= 9).length).toBeLessThanOrEqual(1);
      // Never in a deployment column, never on a gangplank's deck end.
      for (const h of crates) {
        expect([0, 14]).not.toContain(h.col);
        if (planks.includes(h.row)) expect([5, 9]).not.toContain(h.col);
      }
      // No seeded MVP obstacle: every rock is a crate.
      expect(featuresOf(s, "rock")).toHaveLength(crates.length);
    }
  });

  it("the battle seed decides the gangplanks, and the same seed repeats", () => {
    const rows = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const a = layoutGround("deck", seed);
      expect(layoutGround("deck", seed)).toEqual(a);
      rows.add(gangplankRows("deck", a).join(","));
    }
    expect(rows.size).toBeGreaterThan(3);
  });

  it("open water: a five-column deck with a mast, then sea with 2-4 reefs", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = fieldState(setupOf("open-water", knights(), swimmers(), seed));
      const reefs = featuresOf(s, "rock", "reef").map((g) => g.hex);
      expect(reefs.length).toBeGreaterThanOrEqual(2);
      expect(reefs.length).toBeLessThanOrEqual(4);
      for (const h of reefs) {
        expect(h.col).toBeGreaterThanOrEqual(6);
        expect(h.col).toBeLessThanOrEqual(12);
      }
      const masts = featuresOf(s, "mast").map((g) => g.hex);
      expect(masts).toHaveLength(1);
      expect([2, 3]).toContain(masts[0]?.col);
      for (let row = 0; row < 11; row++) {
        for (let col = 0; col < 15; col++) {
          const k = kindAt(s, at(col, row));
          if (col <= 4) expect(k === null || k === "mast").toBe(true);
          else expect(k === "sea" || k === "rock").toBe(true);
        }
      }
      // The swimmers deploy in column 14, on the water.
      expect(getStack(s, "d0").hex).toEqual(at(14, 5));
      expect(kindAt(s, at(14, 5))).toBe("sea");
    }
  });

  it("pier: the attacker's half is land with 0-2 rocks and no mast", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const deck = fieldState(setupOf("pier-deck", knights(), knights(), seed));
      const water = fieldState(
        setupOf("pier-water", knights(), swimmers(), seed),
      );
      for (const [s, landTo] of [
        [deck, 5],
        [water, 4],
      ] as const) {
        const land = s.ground.filter((g) => g.hex.col <= landTo);
        expect(
          land.every((g) => g.kind === "rock" && g.look === undefined),
        ).toBe(true);
        expect(land.length).toBeLessThanOrEqual(2);
      }
      expect(featuresOf(deck, "mast").map((g) => g.hex.col >= 10)).toEqual([
        true,
      ]);
      expect(gangplankRows("pier-deck", deck.ground)).toHaveLength(3);
      expect(featuresOf(water, "mast")).toEqual([]);
    }
    const kinds = fieldHexKinds(
      "pier-deck",
      fieldState(setupOf("pier-deck", knights(), knights())).ground,
    );
    expect(kinds[hexIndex(at(2, 2))]).toBe("land");
    expect(kinds[hexIndex(at(12, 2))]).toBe("deck");
  });

  it("beach landing: the land field's own obstacles, the layout named", () => {
    const s = fieldState(setupOf("beach", knights(), knights(), 11));
    expect(s.layout).toBe("beach");
    expect(s.ground.map((g) => g.hex)).toEqual(generateObstacles(11));
    expect(featuresOf(s, "sea")).toEqual([]);
  });

  it("the layout stays on the state through the battle", () => {
    const s = createBattle(setupOf("deck", knights(), knights())).state;
    expect(s.layout).toBe("deck");
    const next = play(s, {
      type: "defend",
      stackId: s.activeStackId as string,
    }).state;
    expect(next.layout).toBe("deck");
  });

  it("a land battle is unchanged: no layout key, the same state", () => {
    for (const seed of [1, 2, 3, 99]) {
      const a = createBattle(setupOf(undefined, knights(), knights(), seed));
      const b = createBattle(setupOf("land", knights(), knights(), seed));
      expect(b).toEqual(a);
      expect("layout" in a.state).toBe(false);
      expect(a.state.ground.map((g) => g.hex)).toEqual(generateObstacles(seed));
      expect(a.state.ground.every((g) => !("look" in g))).toBe(true);
    }
  });
});

describe("the sea and Swimmers (NAVAL 3.1)", () => {
  /** Deck to deck, gangplanks only: a knight at (5, 5) and a crab at (6, 5)? */
  function deckField(
    attacker: BattleStackSetup[],
    defender: BattleStackSetup[],
  ): BattleState {
    return createBattle(setupOf("deck", attacker, defender, 7)).state;
  }

  it("a walker never enters a sea hex; a Swimmer walks the water", () => {
    const s = deckField(
      [unit("knight", 3, at(5, 3))],
      [unit("hammerhead", 2, at(9, 3))],
    );
    const sea = new Set(featuresOf(s, "sea").map((g) => hexIndex(g.hex)));
    const walker = [...reachableHexes(s, "a0").keys()];
    expect(walker.some((i) => sea.has(i))).toBe(false);
    const swimmer = [...reachableHexes(s, "d0").keys()];
    expect(swimmer.some((i) => sea.has(i))).toBe(true);
    expect(swims(stats("hammerhead"))).toBe(true);
    expect(swims(stats("knight"))).toBe(false);
  });

  it("a walker crosses by a gangplank", () => {
    const s = deckField(
      [unit("knight", 3, at(4, 5))],
      [unit("knight", 3, at(13, 5))],
    );
    const planks = gangplankRows("deck", s.ground);
    const path = findPath(s, "a0", at(10, planks[1] as number), 20);
    expect(path).not.toBeNull();
    const crossing = (path ?? []).filter((h) => h.col >= 6 && h.col <= 8);
    expect(crossing.length).toBeGreaterThanOrEqual(3);
    for (const h of crossing) expect(planks).toContain(h.row);
  });

  it("a push stops before the sea; a Swimmer is pushed into it", () => {
    const s = deckField(
      [unit("knight", 3, at(4, 3))],
      [unit("knight", 2, at(5, 3)), unit("hammerhead", 2, at(9, 3))],
    );
    // A row without a gangplank, so (6, row) is sea.
    const planks = gangplankRows("deck", s.ground);
    const row = [0, 3, 7, 10].find((r) => !planks.includes(r)) as number;
    const moved = withFx(
      {
        ...s,
        stacks: s.stacks.map((x) =>
          x.id === "a0"
            ? { ...x, hex: at(4, row) }
            : x.id === "d0"
              ? { ...x, hex: at(5, row) }
              : x.id === "d1"
                ? { ...x, hex: at(10, row) }
                : x,
        ),
      },
      (fx) => {
        fx.push("d0", at(4, row), 3);
        fx.push("d1", at(11, row), 3);
      },
    ).state;
    expect(getStack(moved, "d0").hex).toEqual(at(5, row));
    expect(getStack(moved, "d1").hex.col).toBeLessThan(10);
    expect(kindAt(moved, getStack(moved, "d1").hex)).toBe("sea");
  });

  it("Siren Song pulls a walker only to its own rail", () => {
    const s0 = deckField(
      [unit("knight", 3, at(4, 4))],
      [unit("siren", 3, at(8, 4))],
    );
    const planks = gangplankRows("deck", s0.ground);
    const row = [0, 3, 7, 10].find((r) => !planks.includes(r)) as number;
    const s = {
      ...s0,
      stacks: s0.stacks.map((x) =>
        x.id === "a0"
          ? { ...x, hex: at(3, row) }
          : x.id === "d0"
            ? { ...x, hex: at(7, row) }
            : x,
      ),
    };
    const after = withFx(s, (fx) => {
      fx.pull("a0", at(7, row), 3);
    }).state;
    expect(getStack(after, "a0").hex).toEqual(at(5, row));
  });

  it("Swing Across never lands in the sea", () => {
    const s0 = createBattle(
      setupOf(
        "deck",
        [unit("knight", 2, at(0, 5))],
        [unit("corsair", 4, at(9, 5))],
      ),
    ).state;
    const s = until(s0, "d0");
    const reach = [...reachableHexes(s, "d0").keys()];
    const sea = new Set(featuresOf(s, "sea").map((g) => hexIndex(g.hex)));
    expect(reach.length).toBeGreaterThan(10);
    expect(reach.some((i) => sea.has(i))).toBe(false);
    // But it leaps the water: a deck hex across the sea is reachable.
    expect(reach.some((i) => i % 15 <= 5)).toBe(true);
    const across = reach.find((i) => i % 15 <= 5) as number;
    const target = at(across % 15, Math.floor(across / 15));
    const moved = play(s, { type: "move", stackId: "d0", to: target }).state;
    expect(getStack(moved, "d0").hex).toEqual(target);
  });

  it("a Swimmer dying on the sea leaves no remains; summons need a hex they may stand on", () => {
    const s = createBattle(
      setupOf("open-water", knights(), [unit("jellyfish", 1, at(14, 5))]),
    ).state;
    const killed = withFx(s, (fx) => {
      fx.harm("d0", 999);
    }).state;
    expect(getStack(killed, "d0").count).toBe(0);
    expect(kindAt(killed, at(14, 5))).toBe("sea");
    const summoned = withFx(killed, (fx) => {
      expect(fx.summon(stats("knight"), 2, at(12, 5))).toBeNull();
      expect(fx.summon(stats("giant-crab"), 2, at(12, 5))).not.toBeNull();
    }).state;
    expect(summoned.stacks.filter((x) => x.summoned)).toHaveLength(1);
  });

  it("nothing burns or lies on the water", () => {
    const s = createBattle(setupOf("open-water", knights(), swimmers())).state;
    const r = withFx(s, (fx) => {
      expect(fx.addGround({ hex: at(9, 0), kind: "corpse" })).toBe(false);
    });
    expect(kindAt(r.state, at(9, 0))).not.toBe("corpse");
  });
});

describe("deployment (NAVAL 3.5)", () => {
  it("a Vanguard never places a walker on the sea; swimmers deploy on it", () => {
    const setup: BattleSetup = {
      seed: 5,
      layout: "open-water",
      attacker: {
        hero: { attack: 0, defense: 0 },
        rules: ["vanguard-3"],
        stacks: knights(),
      },
      defender: {
        hero: { attack: 0, defense: 0 },
        rules: ["vanguard-3"],
        stacks: swimmers(),
      },
    };
    const attackerZone = deployZone(setup, "attacker");
    const state = fieldState(setup);
    for (const h of attackerZone) expect(kindAt(state, h)).not.toBe("sea");
    const defenderZone = deployZone(setup, "defender");
    expect(defenderZone.length).toBeGreaterThan(20);
    expect(defenderZone.some((h) => kindAt(state, h) === "sea")).toBe(true);
  });
});

describe("Wet Landing (NAVAL 3.4)", () => {
  it("every attacking stack starts Drenched 25 for 2 rounds", () => {
    const step = createBattle(
      setupOf(
        "beach",
        [unit("knight", 3, at(0, 2)), unit("longbowman", 5, at(0, 8))],
        knights(),
        3,
        {},
      ),
    );
    const plain = step.state;
    expect(getStack(plain, "a0").conditions).toEqual([]);
    const wet = createBattle({
      ...setupOf(
        "beach",
        [unit("knight", 3, at(0, 2)), unit("longbowman", 5, at(0, 8))],
        knights(),
        3,
      ),
      attacker: {
        hero: null,
        wetLanding: true,
        stacks: [unit("knight", 3, at(0, 2)), unit("longbowman", 5, at(0, 8))],
      },
    });
    for (const id of ["a0", "a1"]) {
      const c = getStack(wet.state, id).conditions;
      expect(c).toHaveLength(1);
      expect(c[0]).toMatchObject({
        kind: "drenched",
        size: 25,
        clock: 2,
        source: "naval:wet-landing",
      });
    }
    expect(getStack(wet.state, "d0").conditions).toEqual([]);
  });
});

describe("the deck gun (NAVAL 3.3)", () => {
  it("20 Harm plus 15 a Seafaring rank", () => {
    expect([0, 1, 2, 3].map(deckGunHarm)).toEqual([20, 35, 50, 65]);
  });

  function gunned(): BattleState {
    return createBattle({
      ...setupOf("deck", [], []),
      attacker: {
        hero: null,
        deckGun: 35,
        stacks: [unit("knight", 2, at(0, 5))],
      },
      defender: {
        hero: null,
        stacks: [
          unit("corsair", 3, at(14, 2)),
          unit("corsair", 9, at(14, 5)),
          unit("corsair", 4, at(14, 8)),
        ],
      },
    }).state;
  }

  it("is scheduled at battle start and does not fire in round 1", () => {
    const s = gunned();
    expect(s.round).toBe(1);
    expect(s.scheduled).toEqual([
      expect.objectContaining({
        round: 2,
        phase: "start",
        side: "attacker",
        effect: { id: DECK_GUN_EFFECT, args: { harm: 35 } },
      }),
    ]);
    for (const x of s.stacks) expect(x.count).toBe(x.initialCount);
  });

  it("fires at the start of round 2 at the strongest enemy stack, then again", () => {
    let s = gunned();
    const strongest = [...s.stacks]
      .filter((x) => x.side === "defender")
      .sort((a, b) => stackFightValue(b) - stackFightValue(a))[0]!;
    expect(strongest.id).toBe("d1");
    const before = getStack(s, "d1");
    const events = [];
    for (let i = 0; i < 20 && s.round < 2; i++) {
      const step = play(s, {
        type: "defend",
        stackId: s.activeStackId as string,
      });
      events.push(...step.events);
      s = step.state;
    }
    expect(s.round).toBe(2);
    const damage = events.filter(
      (e) => e.type === "harm" || e.type === "damage",
    );
    expect(damage).toHaveLength(1);
    expect(damage[0]).toMatchObject({ targetId: "d1" });
    const after = getStack(s, "d1");
    const lost =
      (before.count - after.count) * before.creature.hp +
      (before.topHp - after.topHp);
    expect(lost).toBe(35);
    expect(getStack(s, "d0").count).toBe(3);
    expect(s.scheduled).toEqual([
      expect.objectContaining({ round: 3, phase: "start", side: "attacker" }),
    ]);
  });
});

describe("a fixed-seed battle per layout (not a simulation)", () => {
  const cases: Array<[BattleLayout, BattleStackSetup[], BattleStackSetup[]]> = [
    [
      "deck",
      [
        { creature: stats("knight"), count: 6 },
        { creature: stats("longbowman"), count: 10 },
      ],
      [
        { creature: stats("corsair"), count: 6 },
        { creature: stats("siren"), count: 4 },
      ],
    ],
    [
      "open-water",
      [
        { creature: stats("knight"), count: 6 },
        { creature: stats("longbowman"), count: 10 },
      ],
      [
        { creature: stats("hammerhead"), count: 2 },
        { creature: stats("jellyfish"), count: 10 },
      ],
    ],
    [
      "pier-deck",
      [{ creature: stats("man-at-arms"), count: 10 }],
      [{ creature: stats("corsair"), count: 5 }],
    ],
    [
      "pier-water",
      [
        { creature: stats("longbowman"), count: 10 },
        { creature: stats("knight"), count: 4 },
      ],
      [{ creature: stats("giant-crab"), count: 8 }],
    ],
    [
      "beach",
      [{ creature: stats("knight"), count: 6 }],
      [{ creature: stats("goblin"), count: 20 }],
    ],
  ];

  for (const [layout, attacker, defender] of cases) {
    it(`${layout}: ends, repeats exactly and keeps walkers off the water`, () => {
      const setup: BattleSetup = {
        seed: 4242,
        layout,
        attacker: {
          hero: null,
          stacks: attacker,
          ...(layout === "beach" ? { wetLanding: true } : { deckGun: 20 }),
        },
        defender: {
          hero: null,
          stacks: defender,
          ...(layout === "deck" || layout === "pier-deck"
            ? { deckGun: 40 }
            : {}),
        },
      };
      const a = runAutoBattle(setup, { ai: "fast" });
      const b = runAutoBattle(setup, { ai: "fast" });
      expect(a.result).toEqual(b.result);
      expect(a.result.winner).not.toBeNull();
      const sea = new Set(
        a.state.ground
          .filter((g: GroundFeature) => g.kind === "sea")
          .map((g) => hexIndex(g.hex)),
      );
      for (const x of a.state.stacks) {
        if (x.count <= 0 || swims(x.creature)) continue;
        expect(sea.has(hexIndex(x.hex)), x.id).toBe(false);
      }
    });
  }
});
