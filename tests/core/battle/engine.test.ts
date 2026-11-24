import { describe, expect, it } from "vitest";
import {
  BATTLE_WIDTH,
  applyAction,
  canShoot,
  createBattle,
  generateObstacles,
  isLegalAction,
  legalActions,
  previewAttack,
  reachableHexes,
} from "../../../src/core/battle/index.ts";
import type {
  BattleCreatureStats,
  BattleStackSetup,
  Hex,
} from "../../../src/core/battle/index.ts";
import {
  CAVEMAN,
  CHIEFTAIN,
  RAPTOR,
  SHAMAN,
  SKELETON,
  SPITTER,
  TRICERATOPS,
  TROLL,
  T_REX,
  ORC_WARBOSS,
  dummy,
} from "./fixtures.ts";
import {
  conditionsOf,
  damageEvents,
  patchStack,
  play,
  stack,
  start,
} from "./helpers.ts";

const at = (col: number, row: number): Hex => ({ col, row });
const attack = (stackId: string, targetId: string, from: Hex) =>
  ({ type: "attack", stackId, targetId, from }) as const;
const shoot = (stackId: string, targetId: string) =>
  ({ type: "shoot", stackId, targetId }) as const;
const defend = (stackId: string) => ({ type: "defend", stackId }) as const;
const wait = (stackId: string) => ({ type: "wait", stackId }) as const;

function duel(
  a: BattleStackSetup[],
  d: BattleStackSetup[],
  opts: { heroes?: boolean; startRound?: number } = {},
) {
  return start({
    ...(opts.startRound ? { startRound: opts.startRound } : {}),
    attacker: { hero: opts.heroes ? CHIEFTAIN : null, stacks: a },
    defender: { hero: null, stacks: d },
  });
}

describe("deployment and obstacles", () => {
  it("deploys 1-7 stacks on the documented rows", () => {
    const rows = [
      [5],
      [2, 8],
      [2, 5, 8],
      [0, 4, 6, 10],
      [0, 2, 5, 8, 10],
      [0, 2, 4, 6, 8, 10],
      [0, 2, 4, 5, 6, 8, 10],
    ];
    rows.forEach((expected, i) => {
      const stacks = Array.from({ length: i + 1 }, () => ({
        creature: CAVEMAN,
        count: 1,
      }));
      const { state } = createBattle({
        seed: 3,
        attacker: { hero: null, stacks },
        defender: { hero: null, stacks },
      });
      const a = state.stacks.filter((s) => s.side === "attacker");
      const d = state.stacks.filter((s) => s.side === "defender");
      expect(a.map((s) => s.hex.row)).toEqual(expected);
      expect(a.every((s) => s.hex.col === 0)).toBe(true);
      expect(d.map((s) => s.hex.row)).toEqual(expected);
      expect(d.every((s) => s.hex.col === BATTLE_WIDTH - 1)).toBe(true);
      expect(a.map((s) => s.id)).toEqual(stacks.map((_, k) => `a${k}`));
    });
  });

  it("places 0-6 seeded obstacles outside the deployment columns", () => {
    const counts = new Set<number>();
    for (let seed = 0; seed < 300; seed++) {
      const obs = generateObstacles(seed);
      expect(generateObstacles(seed)).toEqual(obs);
      counts.add(obs.length);
      expect(obs.length).toBeLessThanOrEqual(6);
      expect(new Set(obs.map((h) => `${h.col},${h.row}`)).size).toBe(
        obs.length,
      );
      for (const h of obs) {
        expect(h.col).toBeGreaterThan(0);
        expect(h.col).toBeLessThan(14);
      }
    }
    expect([...counts].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("rejects overlapping hexes and bad counts", () => {
    expect(() =>
      duel(
        [{ creature: CAVEMAN, count: 1, hex: at(3, 3) }],
        [{ creature: CAVEMAN, count: 1, hex: at(3, 3) }],
      ),
    ).toThrow();
    expect(() => duel([{ creature: CAVEMAN, count: 0 }], [])).toThrow();
  });

  it("ends at once when a side is empty", () => {
    const s = duel([{ creature: CAVEMAN, count: 1 }], []);
    expect(s.winner).toBe("attacker");
    expect(s.activeStackId).toBeNull();
  });
});

describe("movement", () => {
  it("reaches by Speed around obstacles and stacks", () => {
    const s = start({
      obstacles: [at(3, 5)],
      attacker: {
        hero: null,
        stacks: [
          { creature: dummy({ speed: 2 }), count: 1, hex: at(2, 5) },
          { creature: dummy({ speed: 1 }), count: 1, hex: at(2, 4) },
        ],
      },
      defender: {
        hero: null,
        stacks: [{ creature: dummy({ speed: 1 }), count: 1 }],
      },
    });
    const reach = reachableHexes(s, "a0");
    const has = (h: Hex) => reach.has(h.row * 15 + h.col);
    expect(reach.get(5 * 15 + 2)).toBe(0);
    expect(has(at(3, 5))).toBe(false); // obstacle
    expect(has(at(2, 4))).toBe(false); // own stack
    expect(has(at(4, 6))).toBe(true); // around the obstacle in 2
    expect(has(at(4, 5))).toBe(false); // behind the obstacle: 3 steps
    for (const d of reach.values()) expect(d).toBeLessThanOrEqual(2);
    expect(() =>
      applyAction(s, { type: "move", stackId: "a0", to: at(5, 5) }),
    ).toThrow(/illegal/);
    const moved = play(s, { type: "move", stackId: "a0", to: at(4, 6) });
    expect(stack(moved.state, "a0").hex).toEqual(at(4, 6));
    const mv = moved.events.find((e) => e.type === "move");
    expect(mv).toMatchObject({ from: at(2, 5), to: at(4, 6) });
    expect(mv?.type === "move" && mv.path.length).toBe(2);
  });
});

describe("turn order and waiting", () => {
  it("orders by Speed, attacker first on ties, then slot; waiters slowest first", () => {
    const fast = dummy({ id: "fast", speed: 7 });
    const mid = dummy({ id: "mid", speed: 5 });
    const slow = dummy({ id: "slow", speed: 3 });
    let s = duel(
      [
        { creature: mid, count: 1 },
        { creature: slow, count: 1 },
        { creature: mid, count: 1 },
      ],
      [
        { creature: mid, count: 1 },
        { creature: fast, count: 1 },
      ],
    );
    expect(s.queue).toEqual(["d1", "a0", "a2", "d0", "a1"]);
    expect(s.activeStackId).toBe("d1");
    s = play(s, wait("d1"), wait("a0"), defend("a2"), wait("d0")).state;
    // Waiting: slowest first, attacker before defender at equal Speed.
    expect(s.queue).toEqual(["a1"]);
    expect(s.waiting).toEqual(["a0", "d0", "d1"]);
    expect(s.activeStackId).toBe("a1");
    s = play(s, defend("a1")).state;
    expect(s.activeStackId).toBe("a0");
    expect(isLegalAction(s, wait("a0"))).toBe(false);
    expect(legalActions(s).some((a) => a.type === "wait")).toBe(false);
    const r = play(s, defend("a0"), defend("d0"), defend("d1"));
    expect(r.state.round).toBe(2);
    expect(r.events.some((e) => e.type === "roundStart" && e.round === 2)).toBe(
      true,
    );
    expect(r.state.activeStackId).toBe("d1");
    expect(isLegalAction(r.state, wait("d1"))).toBe(true);
  });

  it("only the active stack may act", () => {
    const s = duel(
      [{ creature: CAVEMAN, count: 1 }],
      [{ creature: CAVEMAN, count: 1 }],
    );
    expect(s.activeStackId).toBe("a0");
    expect(() => applyAction(s, defend("d0"))).toThrow(/not the active/);
  });
});

describe("retaliation", () => {
  it("happens once per round and resets next round", () => {
    const a = dummy({ speed: 6 });
    let s = duel(
      [
        { creature: a, count: 5, hex: at(7, 4) },
        { creature: a, count: 5, hex: at(7, 6) },
      ],
      [{ creature: dummy({ hp: 100 }), count: 5, hex: at(7, 5) }],
    );
    let step = play(s, attack("a0", "d0", at(7, 4)));
    expect(damageEvents(step.events).map((e) => e.kind)).toEqual([
      "melee",
      "retaliation",
    ]);
    step = play(step.state, attack("a1", "d0", at(7, 6)));
    expect(damageEvents(step.events).map((e) => e.kind)).toEqual(["melee"]);
    s = play(step.state, defend("d0")).state;
    expect(s.round).toBe(2);
    step = play(s, attack("a0", "d0", at(7, 4)));
    expect(damageEvents(step.events).map((e) => e.kind)).toEqual([
      "melee",
      "retaliation",
    ]);
  });

  it("a stack that attacks keeps its own retaliation", () => {
    const s = duel(
      [{ creature: dummy({ speed: 6 }), count: 5, hex: at(6, 5) }],
      [{ creature: dummy({ hp: 100 }), count: 5, hex: at(7, 5) }],
    );
    const step = play(
      s,
      attack("a0", "d0", at(6, 5)),
      attack("d0", "a0", at(7, 5)),
    );
    expect(damageEvents(step.events).map((e) => e.kind)).toEqual([
      "melee",
      "retaliation",
      "melee",
      "retaliation",
    ]);
  });

  it("is not made by a dead stack", () => {
    const s = duel(
      [{ creature: dummy({ damage: 50 }), count: 10, hex: at(6, 5) }],
      [{ creature: CAVEMAN, count: 2, hex: at(7, 5) }],
    );
    const p = previewAttack(s, attack("a0", "d0", at(6, 5)));
    expect(p.kills).toBe(2);
    expect(p.retaliation).toBeNull();
    const r = play(s, attack("a0", "d0", at(6, 5)));
    expect(r.events.map((e) => e.type)).toContain("death");
    expect(r.state.winner).toBe("attacker");
    expect(r.events.at(-1)).toMatchObject({
      type: "end",
      winner: "attacker",
      reason: "eliminated",
    });
  });

  it("Terror: stacks attacked by the T-Rex cannot retaliate", () => {
    const s = duel(
      [{ creature: T_REX, count: 1, hex: at(6, 5) }],
      [{ creature: dummy({ hp: 500 }), count: 10, hex: at(7, 5) }],
    );
    const step = play(s, attack("a0", "d0", at(6, 5)));
    expect(damageEvents(step.events)).toHaveLength(1);
    expect(stack(step.state, "d0").retaliatedThisRound).toBe(false);
    // The T-Rex itself retaliates normally.
    const back = play(step.state, attack("d0", "a0", at(7, 5)));
    expect(damageEvents(back.events).map((e) => e.kind)).toEqual([
      "melee",
      "retaliation",
    ]);
  });
});

describe("Charge", () => {
  const charger = dummy({ speed: 9, abilities: ["charge"] });
  const target = dummy({ hp: 1000 });
  it.each([
    [7, 0, null],
    [6, 1, 115],
    [5, 2, 130],
    [3, 4, 160],
    [2, 5, 175],
    [0, 7, 175], // capped at 5 hexes
  ])("from col %i moves %i hexes: %s%%", (col, moved, percent) => {
    const s = duel(
      [{ creature: charger, count: 10, hex: at(col, 5) }],
      [{ creature: target, count: 1, hex: at(8, 5) }],
    );
    const p = previewAttack(s, attack("a0", "d0", at(7, 5)));
    expect(p.hexesMoved).toBe(moved);
    expect(p.strike.breakdown.abilityMultipliers).toEqual(
      percent === null ? [] : [{ source: "charge", label: "Charge", percent }],
    );
  });

  it("does not apply to retaliations", () => {
    const s = duel(
      [{ creature: dummy({ speed: 9 }), count: 5, hex: at(2, 5) }],
      [{ creature: TRICERATOPS, count: 2, hex: at(8, 5) }],
    );
    const p = previewAttack(s, attack("a0", "d0", at(7, 5)));
    expect(p.retaliation!.breakdown.abilityMultipliers).toEqual([]);
  });
});

describe("Venom", () => {
  it("lasts until the end of the next round, refreshes, never stacks, floors at 0", () => {
    const weak = dummy({ defense: 2, hp: 1000, speed: 3 });
    let s = duel(
      [{ creature: SPITTER, count: 1, hex: at(2, 5) }],
      [{ creature: weak, count: 1, hex: at(12, 5) }],
    );
    s = play(s, shoot("a0", "d0"), defend("d0")).state; // round 1 -> 2
    // Venomed, clock 2 made in round 1, one round end passed: clock 1.
    expect(conditionsOf(s, "d0")).toEqual([
      { kind: "venomed", clock: 1, size: 3 },
    ]);
    // A second hit in round 2 refreshes the clock and still gives -3 once.
    const p = previewAttack(s, shoot("a0", "d0"));
    expect(p.strike.breakdown.defenseModifiers).toEqual([
      { source: "venomed", label: "Venomed", amount: -3 },
    ]);
    expect(p.strike.breakdown.defense).toBe(0); // 2 - 3 floors at 0
    s = play(s, shoot("a0", "d0")).state;
    expect(conditionsOf(s, "d0")).toEqual([
      { kind: "venomed", clock: 2, size: 3 },
    ]);
    // Round 3 passes without hits: expires when round 3 ends.
    s = play(s, defend("d0"), defend("a0")).state;
    expect(s.round).toBe(3);
    expect(stack(s, "d0").conditions).toHaveLength(1);
    const end3 = play(s, defend("d0"));
    expect(end3.state.round).toBe(4);
    expect(stack(end3.state, "d0").conditions).toEqual([]);
    expect(end3.events).toContainEqual(
      expect.objectContaining({
        type: "condition",
        stackId: "d0",
        change: "expired",
        condition: expect.objectContaining({ kind: "venomed", clock: 0 }),
      }),
    );
  });

  it("applies on melee hits and retaliations too", () => {
    const s = duel(
      [{ creature: dummy({ speed: 6 }), count: 3, hex: at(6, 5) }],
      [{ creature: SPITTER, count: 5, hex: at(7, 5) }],
    );
    const p = previewAttack(s, attack("a0", "d0", at(6, 5)));
    expect(p.retaliation!.breakdown.rangedInMelee).toBe(true);
    expect(p.conditionsApplied).toEqual([
      { stackId: "a0", kind: "venomed", clock: 2, size: 3 },
    ]);
  });
});

describe("adjacency abilities", () => {
  // Target at (8,5); its neighbours: (9,5) (9,6) (8,6) (7,5) (8,4) (9,4).
  const helperHexes = [at(9, 6), at(8, 6), at(8, 4), at(9, 4), at(9, 5)];

  function crowd(attacker: BattleCreatureStats, helpers: number) {
    return duel(
      [
        { creature: attacker, count: 10, hex: at(6, 5) },
        ...helperHexes
          .slice(0, helpers)
          .map((hex) => ({ creature: CAVEMAN, count: 1, hex })),
      ],
      [{ creature: dummy({ hp: 1000 }), count: 1, hex: at(8, 5) }],
    );
  }

  it.each([0, 1, 2, 3, 4, 5])("Mob with %i helpers", (n) => {
    const s = crowd(dummy({ speed: 9, abilities: ["mob"] }), n);
    const p = previewAttack(s, attack("a0", "d0", at(7, 5)));
    expect(p.strike.breakdown.attack).toBe(5 + n);
  });

  it.each([0, 1, 2, 3, 4, 5])("Pack Hunter with %i helpers", (n) => {
    const s = crowd(RAPTOR, n);
    const p = previewAttack(s, attack("a0", "d0", at(7, 5)));
    expect(p.strike.breakdown.abilityMultipliers).toEqual(
      n === 0
        ? []
        : [
            {
              source: "pack-hunter",
              label: "Pack Hunter",
              percent: 100 + 20 * n,
            },
          ],
    );
  });

  it("caps Mob at +5 and Pack Hunter at x2.0", () => {
    // Six other stacks touch the target: the attacker fills the 6th side,
    // so build it with a 7-stack army and a ranged target-adjacent helper.
    const s = duel(
      [
        { creature: RAPTOR, count: 10, hex: at(5, 5) },
        ...helperHexes.map((hex) => ({ creature: CAVEMAN, count: 1, hex })),
        { creature: CAVEMAN, count: 1, hex: at(1, 1) },
      ],
      [{ creature: dummy({ hp: 1000 }), count: 1, hex: at(8, 5) }],
    );
    const p = previewAttack(s, attack("a0", "d0", at(7, 5)));
    expect(p.strike.breakdown.abilityMultipliers[0]!.percent).toBe(200);
    const mob = previewAttack(
      patchStack(s, "a0", {
        creature: dummy({ speed: 9, abilities: ["mob"] }),
      }),
      attack("a0", "d0", at(7, 5)),
    );
    expect(mob.strike.breakdown.attack).toBe(10);
  });

  it("Mob and Pack Hunter apply to retaliations", () => {
    const s = duel(
      [{ creature: dummy({ speed: 9 }), count: 1, hex: at(6, 5) }],
      [
        { creature: RAPTOR, count: 5, hex: at(8, 5) },
        { creature: dummy({ id: "helper" }), count: 1, hex: at(7, 4) },
      ],
    );
    // a0 attacks from (7,5): d1 at (7,4) is adjacent to (7,5).
    const p = previewAttack(s, attack("a0", "d0", at(7, 5)));
    expect(p.retaliation!.breakdown.abilityMultipliers).toEqual([
      { source: "pack-hunter", label: "Pack Hunter", percent: 120 },
    ]);
  });

  it("War Drums: +2 to adjacent friends, not to the Shaman, does not stack", () => {
    const base = (hexes: Hex[]) =>
      duel(
        [
          { creature: dummy({ speed: 9 }), count: 1, hex: at(6, 5) },
          ...hexes.map((hex) => ({ creature: SHAMAN, count: 1, hex })),
        ],
        [{ creature: dummy({ hp: 1000 }), count: 1, hex: at(8, 5) }],
      );
    const atk = (s: ReturnType<typeof base>) =>
      previewAttack(s, attack("a0", "d0", at(7, 5))).strike.breakdown.attack;
    expect(atk(base([at(0, 0)]))).toBe(5); // far away
    expect(atk(base([at(7, 4)]))).toBe(7); // adjacent to (7,5)
    expect(atk(base([at(7, 4), at(7, 6)]))).toBe(7); // two Shamans: still +2
    // The Shaman shooting gets nothing from itself.
    const solo = duel(
      [{ creature: SHAMAN, count: 1, hex: at(2, 5) }],
      [{ creature: dummy({ hp: 1000 }), count: 1, hex: at(12, 5) }],
    );
    expect(previewAttack(solo, shoot("a0", "d0")).strike.breakdown.attack).toBe(
      9,
    );
  });

  it("Warcry: +2 Defense to adjacent friends, not to the Warboss", () => {
    const s = duel(
      [{ creature: dummy({ speed: 9 }), count: 1, hex: at(6, 5) }],
      [
        { creature: dummy({ hp: 1000 }), count: 1, hex: at(8, 5) },
        { creature: ORC_WARBOSS, count: 1, hex: at(9, 5) },
        { creature: ORC_WARBOSS, count: 1, hex: at(9, 4) },
      ],
    );
    const p = previewAttack(s, attack("a0", "d0", at(7, 5)));
    expect(p.strike.breakdown.defense).toBe(7);
    const boss = previewAttack(s, attack("a0", "d1", at(10, 5)));
    expect(boss.strike.breakdown.defense).toBe(15 + 2); // only the other Warboss
  });
});

describe("ranged rules", () => {
  it("no shooting with an enemy adjacent; melee at half damage", () => {
    const s = duel(
      [{ creature: SPITTER, count: 10, hex: at(6, 5) }],
      [{ creature: dummy({ hp: 1000, defense: 6 }), count: 1, hex: at(7, 5) }],
    );
    expect(canShoot(s, "a0")).toBe(false);
    expect(legalActions(s).some((a) => a.type === "shoot")).toBe(false);
    expect(() => applyAction(s, shoot("a0", "d0"))).toThrow(/illegal/);
    const p = previewAttack(s, attack("a0", "d0", at(6, 5)));
    expect(p.strike.breakdown.rangedInMelee).toBe(true);
    expect(p.damage).toBe(15); // floor(10 x 3 x 1.0 / 2)
  });

  it("uses shots, never retaliated; out of shots it fights in melee", () => {
    let s = duel(
      [{ creature: { ...SPITTER, shots: 2 }, count: 10, hex: at(2, 5) }],
      [{ creature: dummy({ hp: 1000, speed: 1 }), count: 1, hex: at(12, 5) }],
    );
    const r = play(s, shoot("a0", "d0"));
    expect(damageEvents(r.events).map((e) => e.kind)).toEqual(["shot"]);
    expect(stack(r.state, "a0").shotsLeft).toBe(1);
    s = play(r.state, defend("d0"), shoot("a0", "d0"), defend("d0")).state;
    expect(stack(s, "a0").shotsLeft).toBe(0);
    expect(canShoot(s, "a0")).toBe(false);
    expect(legalActions(s).some((a) => a.type === "shoot")).toBe(false);
  });

  it("Bony halves shots but not melee", () => {
    const s = duel(
      [{ creature: dummy({ shots: 5, speed: 9 }), count: 10, hex: at(2, 5) }],
      [{ creature: SKELETON, count: 50, hex: at(12, 5) }],
    );
    const shot = previewAttack(s, shoot("a0", "d0"));
    expect(shot.strike.breakdown.abilityMultipliers).toEqual([
      { source: "bony", label: "Bony", percent: 50 },
    ]);
    expect(shot.damage).toBe(Math.floor((10 * 2 * 21) / 20 / 2));
    const melee = previewAttack(s, attack("a0", "d0", at(11, 5)));
    expect(melee.strike.breakdown.abilityMultipliers).toEqual([]);
  });
});

describe("Defend, Regenerate, fortification", () => {
  it("Defend gives +30% Defense until the stack's next turn", () => {
    let s = duel(
      [{ creature: dummy({ speed: 9, defense: 5 }), count: 1, hex: at(6, 5) }],
      [{ creature: dummy({ speed: 4 }), count: 5, hex: at(7, 5) }],
    );
    s = play(s, defend("a0")).state;
    expect(stack(s, "a0").defending).toBe(true);
    const p = previewAttack(s, attack("d0", "a0", at(7, 5)));
    expect(p.strike.breakdown.defenseBeforeDefend).toBe(5);
    expect(p.strike.breakdown.defense).toBe(7); // 6.5 rounds up
    s = play(s, defend("d0")).state; // round 2: a0's turn begins
    expect(s.activeStackId).toBe("a0");
    expect(stack(s, "a0").defending).toBe(false);
  });

  it("Regenerate heals the top creature at the start of its turn", () => {
    // The Troll's turn starts inside the attacker's applyAction, right
    // after the hit: the heal is in the same event batch.
    const r = play(
      duel(
        [
          {
            creature: dummy({ speed: 9, damage: 3 }),
            count: 10,
            hex: at(6, 5),
          },
        ],
        [{ creature: TROLL, count: 3, hex: at(7, 5) }],
      ),
      attack("a0", "d0", at(6, 5)),
    );
    const hit = damageEvents(r.events)[0]!;
    expect(hit.topHpAfter).toBeLessThan(50);
    expect(r.state.activeStackId).toBe("d0");
    const heal = r.events.find((e) => e.type === "heal");
    expect(heal).toMatchObject({
      stackId: "d0",
      source: "ability:regenerate",
      topHpAfter: 50,
    });
    expect(stack(r.state, "d0").topHp).toBe(50);
  });

  it("fortified defenders get the flat Defense bonus", () => {
    const s = start({
      attacker: {
        hero: CHIEFTAIN,
        stacks: [{ creature: CAVEMAN, count: 1, hex: at(6, 5) }],
      },
      defender: {
        hero: null,
        defenseBonus: 2,
        stacks: [{ creature: CAVEMAN, count: 1, hex: at(7, 5) }],
      },
    });
    const p = previewAttack(s, attack("a0", "d0", at(6, 5)));
    expect(p.strike.breakdown.defense).toBe(5);
    expect(p.strike.breakdown.defenseModifiers[0]).toEqual({
      source: "fortified",
      label: "Fortified",
      amount: 2,
    });
    expect(p.retaliation!.breakdown.defense).toBe(3 + 2); // hero Defense
  });
});

describe("event log", () => {
  it("orders move, attack, damage, retaliation, damage for a move-attack", () => {
    const s = duel(
      [{ creature: CAVEMAN, count: 5, hex: at(4, 5) }],
      [{ creature: dummy({ hp: 100 }), count: 5, hex: at(8, 5) }],
    );
    const r = play(s, attack("a0", "d0", at(7, 5)));
    expect(r.events.slice(0, 5).map((e) => e.type)).toEqual([
      "move",
      "attack",
      "damage",
      "retaliation",
      "damage",
    ]);
    expect(r.events.at(-1)).toMatchObject({
      type: "turnStart",
      stackId: "d0",
    });
  });
});
