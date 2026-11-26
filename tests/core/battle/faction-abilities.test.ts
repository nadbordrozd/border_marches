/**
 * Every v0.2 unit ability, Drill, creature page and Command on a
 * hand-built battle (FACTION_HUMANS/UNDEAD/GOBLINS sections 5 and 7).
 */

import { describe, expect, it } from "vitest";
import {
  actionError,
  getStack,
  legalActions,
} from "../../../src/core/battle/index.ts";
import type { BattleState } from "../../../src/core/battle/index.ts";
import {
  at,
  battle,
  countTop,
  kinds,
  remains,
  strikes,
  uidOf,
  unit,
} from "./faction-helpers.ts";
import { patchStack, play, withFx } from "./helpers.ts";

const HERO = { attack: 0, defense: 0 };

/** Plays defends until `id` is the active stack. */
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

describe("The Realm's abilities", () => {
  it("Attend refuses a stack above the gate and needs adjacency", () => {
    const s = battle(
      {
        stacks: [
          unit("squire", 5, at(2, 4)), // a0: gate 100
          unit("knight", 2, at(2, 5)), // a1: 170 HP
          unit("squire", 30, at(5, 5)), // a2
        ],
      },
      { stacks: [unit("orc-brute", 5, at(14, 5))] },
    );
    const ready = until(s, "a0");
    const { state, events } = play(ready, {
      type: "ability",
      stackId: "a0",
      ability: "attend",
      targets: [{ stack: "a1" }],
    });
    expect(kinds(state, "a1")).toEqual([]);
    expect(events.find((e) => e.type === "condition")).toMatchObject({
      change: "refused",
      detail: "gate 100 HP, target has 170",
    });
    // Once per battle.
    expect(getStack(state, "a0").abilitiesUsed).toEqual(["attend"]);
    const later = until(state, "a2");
    expect(
      actionError(later, {
        type: "ability",
        stackId: "a2",
        ability: "attend",
        targets: [{ stack: "a1" }],
      }),
    ).toBe("it must be adjacent");
    // May walk first.
    expect(
      actionError(later, {
        type: "ability",
        stackId: "a2",
        ability: "attend",
        from: at(3, 5),
        targets: [{ stack: "a1" }],
      }),
    ).toBeNull();
  });

  it("Shield Wall: +2 Defense to adjacent friends, not stacking", () => {
    const s = battle(
      {
        stacks: [
          unit("man-at-arms", 5, at(5, 5)),
          unit("man-at-arms", 5, at(5, 6)),
          unit("squire", 10, at(6, 5)),
        ],
      },
      { stacks: [unit("orc-brute", 5, at(7, 5))] },
    );
    const ready = until(s, "d0");
    const { events } = play(ready, {
      type: "attack",
      stackId: "d0",
      targetId: "a2",
      from: at(7, 5),
    });
    const hit = events.find((e) => e.type === "damage");
    if (hit?.type !== "damage") throw new Error("no strike");
    expect(hit.breakdown.defenseModifiers).toEqual([
      expect.objectContaining({ source: "shield-wall", amount: 2 }),
    ]);
  });

  it("Stand Fast retaliates against every melee attack", () => {
    const s = battle(
      { stacks: [unit("dragonslayer", 1, at(7, 5))] },
      {
        stacks: [
          unit("orc-brute", 5, at(8, 5)),
          unit("orc-brute", 5, at(8, 4)),
        ],
      },
    );
    let cur = until(s, "d0");
    let step = play(cur, {
      type: "attack",
      stackId: "d0",
      targetId: "a0",
      from: at(8, 5),
    });
    expect(strikes(step.events).map((x) => x[2])).toEqual([
      "melee",
      "retaliation",
    ]);
    cur = step.state;
    step = play(cur, {
      type: "attack",
      stackId: "d1",
      targetId: "a0",
      from: at(8, 4),
    });
    expect(strikes(step.events).map((x) => x[2])).toEqual([
      "melee",
      "retaliation",
    ]);
  });

  it("Paragon: +10% per boon, at most +50%", () => {
    let s = battle(
      { stacks: [unit("dragonslayer", 1, at(7, 5))] },
      { stacks: [unit("orc-brute", 20, at(8, 5))] },
    );
    s = withFx(s, (fx) => {
      for (const kind of ["lucky", "heartened", "hastened"])
        fx.addCondition("a0", { kind });
    }).state;
    const { events } = play(s, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(7, 5),
      hearten: false,
    });
    const hit = events.find((e) => e.type === "damage");
    if (hit?.type !== "damage") throw new Error("no strike");
    expect(hit.breakdown.abilityMultipliers).toContainEqual(
      expect.objectContaining({ source: "paragon", percent: 130 }),
    );
  });

  it("Bodyguard spends the Men-at-Arms' retaliation on the attacker", () => {
    const s = battle(
      {
        stacks: [
          unit("man-at-arms", 5, at(6, 5), { extra: ["bodyguard"] }),
          unit("squire", 10, at(7, 4)),
        ],
      },
      { stacks: [unit("orc-brute", 5, at(10, 5))] },
    );
    const ready = until(s, "d0");
    // (7,5) is adjacent to both the Squires and the Men-at-Arms.
    const { state, events } = play(ready, {
      type: "attack",
      stackId: "d0",
      targetId: "a1",
      from: at(7, 5),
    });
    expect(strikes(events).map((x) => [x[0], x[2]])).toEqual([
      ["d0", "melee"],
      ["a1", "retaliation"],
      ["a0", "retaliation"],
    ]);
    expect(getStack(state, "d0").count).toBeLessThan(5);
  });

  it("Follow Through needs a walk of 4 or more", () => {
    const s = battle(
      {
        stacks: [unit("knight", 2, at(4, 5), { extra: ["follow-through"] })],
      },
      { stacks: [unit("orc-brute", 20, at(8, 5))] },
    );
    const { state, events } = play(s, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(7, 5),
    });
    // 3 hexes: no push, and the Brutes retaliate.
    expect(getStack(state, "d0").hex).toEqual(at(8, 5));
    expect(strikes(events).map((x) => x[2])).toEqual(["melee", "retaliation"]);
  });

  it("Covering Volley only for a linked partner and only if it can shoot", () => {
    let s = battle(
      {
        stacks: [unit("knight", 2, at(7, 5)), unit("longbowman", 10, at(0, 0))],
      },
      { stacks: [unit("orc-brute", 20, at(8, 5))] },
    );
    // Without a link: no volley.
    let step = play(s, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(7, 5),
    });
    expect(strikes(step.events).map((x) => x[0])).toEqual(["a0", "d0"]);
    // With a Sworn link the Longbowmen shoot after the retaliation.
    s = withFx(s, (fx) => {
      fx.link("a1", "a0", { kind: "sworn" });
    }).state;
    step = play(s, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(7, 5),
    });
    expect(strikes(step.events).map((x) => [x[0], x[2]])).toEqual([
      ["a0", "melee"],
      ["d0", "retaliation"],
      ["a1", "shot"],
    ]);
  });

  it("Single Combat: Challenged halves Strikes on anyone but the far end", () => {
    let s = battle(
      {
        hero: { ...HERO, command: "single-combat", commandC: 1 },
        stacks: [unit("knight", 2, at(7, 5)), unit("squire", 10, at(8, 4))],
      },
      { stacks: [unit("orc-brute", 10, at(8, 5))] },
    );
    s = play(s, {
      type: "heroAct",
      stackId: "a0",
      act: "single-combat",
      targets: [{ stack: "a0" }, { stack: "d0" }],
    }).state;
    expect(getStack(s, "d0").conditions[0]).toMatchObject({
      kind: "challenged",
      link: "a0",
      clock: 2,
    });
    s = until(s, "d0");
    const { events } = play(s, {
      type: "attack",
      stackId: "d0",
      targetId: "a1",
      from: at(8, 5),
    });
    const hit = events.find((e) => e.type === "damage");
    if (hit?.type !== "damage") throw new Error("no strike");
    expect(hit.breakdown.abilityMultipliers).toContainEqual(
      expect.objectContaining({ source: "challenged", percent: 50 }),
    );
  });

  it("Swear In takes up to C pairs and refuses stacks already Sworn", () => {
    const s = battle(
      {
        hero: { ...HERO, command: "swear-in", commandC: 2 },
        stacks: [
          unit("knight", 2, at(0, 2)),
          unit("squire", 10, at(0, 4)),
          unit("friar", 2, at(0, 6)),
        ],
      },
      { stacks: [unit("orc-brute", 10, at(14, 5))] },
    );
    const act = (targets: string[]) => ({
      type: "heroAct" as const,
      stackId: "a0",
      act: "swear-in",
      targets: targets.map((stack) => ({ stack })),
    });
    expect(actionError(s, act(["a0", "a1", "a2", "d0"]))).toBeNull();
    expect(actionError(s, act(["a0", "a1", "a2"]))).toMatch(/choose 2 to 4/);
    // Any sides: an oath with the enemy is legal (law 5).
    const sworn = play(s, act(["a1", "d0"])).state;
    expect(kinds(sworn, "d0")).toEqual(["sworn"]);
  });
});

describe("The Restless's abilities", () => {
  it("Drain heals half the damage dealt, reviving", () => {
    let s = battle(
      { stacks: [unit("vampire", 4, at(7, 5))] },
      { stacks: [unit("orc-brute", 6, at(8, 5))] },
    );
    s = patchStack(s, "a0", { count: 2, topHp: 10 });
    const { state, events } = play(s, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(7, 5),
    });
    const [hit] = strikes(events);
    const heal = events.find((e) => e.type === "heal");
    expect(heal).toMatchObject({
      stackId: "a0",
      amount: Math.floor((hit?.[3] ?? 0) / 2),
    });
    expect(getStack(state, "a0").count).toBeGreaterThanOrEqual(2);
  });

  it("Mist: the walk is a teleport past stacks and rocks", () => {
    const s = battle(
      { stacks: [unit("vampire", 2, at(2, 5))] },
      {
        stacks: [
          unit("orc-brute", 5, at(3, 5)),
          unit("orc-brute", 5, at(3, 4)),
          unit("orc-brute", 5, at(3, 6)),
        ],
      },
    );
    const moves = legalActions(s).filter((a) => a.type === "move");
    expect(moves).toContainEqual({
      type: "move",
      stackId: "a0",
      to: at(10, 5),
    });
    const { state, events } = play(s, {
      type: "move",
      stackId: "a0",
      to: at(10, 5),
    });
    expect(getStack(state, "a0").hex).toEqual(at(10, 5));
    expect(events.find((e) => e.type === "move")).toMatchObject({
      mode: "teleport",
    });
  });

  it("Royal Displeasure: +25% per bane on the target, at most +100%", () => {
    let s = battle(
      { stacks: [unit("late-king", 1, at(7, 5))] },
      { stacks: [unit("orc-brute", 30, at(8, 5))] },
    );
    s = withFx(s, (fx) => {
      for (const kind of ["venomed", "jinxed", "delayed", "burning", "shaken"])
        fx.addCondition("d0", { kind, size: 2 });
    }).state;
    const { events } = play(s, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(7, 5),
    });
    const hit = events.find((e) => e.type === "damage");
    if (hit?.type !== "damage") throw new Error("no strike");
    expect(hit.breakdown.abilityMultipliers).toContainEqual(
      expect.objectContaining({ source: "royal-displeasure", percent: 200 }),
    );
  });

  it("Keen: +10% per remains, at most +50%", () => {
    const s = battle(
      { stacks: [unit("banshee", 5, at(0, 5))] },
      { stacks: [unit("orc-brute", 30, at(12, 5))] },
      [0, 1, 2, 3, 4, 5, 6].map((r) =>
        remains(at(6, r), "skeleton", "attacker", "bones", `x${r}`),
      ),
    );
    const { events } = play(s, {
      type: "shoot",
      stackId: "a0",
      targetId: "d0",
    });
    const hit = events.find((e) => e.type === "damage");
    if (hit?.type !== "damage") throw new Error("no strike");
    expect(hit.breakdown.abilityMultipliers).toContainEqual(
      expect.objectContaining({ source: "keen", percent: 150 }),
    );
  });

  it("Grave Rot: Venomed on attacks and retaliations", () => {
    const s = battle(
      { stacks: [unit("ghoul", 10, at(7, 5), { extra: ["grave-rot"] })] },
      { stacks: [unit("orc-brute", 20, at(8, 5))] },
    );
    const ready = until(s, "d0");
    const { state } = play(ready, {
      type: "attack",
      stackId: "d0",
      targetId: "a0",
      from: at(8, 5),
    });
    expect(kinds(state, "d0")).toEqual(["venomed"]);
  });

  it("Mesmerise: Asleep with a gate of 30 per Vampire, once", () => {
    const s = battle(
      { stacks: [unit("vampire", 4, at(2, 5), { extra: ["mesmerise"] })] },
      { stacks: [unit("orc-brute", 4, at(6, 5))] },
    );
    const { state } = play(s, {
      type: "ability",
      stackId: "a0",
      ability: "mesmerise",
      from: at(5, 5),
      targets: [{ stack: "d0" }],
    });
    expect(getStack(state, "a0").hex).toEqual(at(5, 5));
    expect(kinds(state, "d0")).toEqual(["asleep"]);
  });

  it("One More Time: a guest stack gets up once more", () => {
    let s = battle(
      {
        hero: { ...HERO, command: "one-more-time", commandC: 1 },
        stacks: [unit("squire", 9, at(7, 5))],
      },
      { stacks: [unit("orc-brute", 30, at(8, 5))] },
    );
    s = play(s, {
      type: "heroAct",
      stackId: "a0",
      act: "one-more-time",
      targets: [{ stack: "a0" }],
    }).state;
    expect(getStack(s, "a0").getsUp).toBe(true);
    s = withFx(s, (fx) => {
      fx.harm("a0", 999);
    }).state;
    expect(s.scheduled).toHaveLength(1);
    expect(getStack(s, "a0").getsUp).toBe(false);
  });

  it("Long Live the King: returns again and again, paying with remains", () => {
    let s = battle(
      { stacks: [unit("late-king", 3, at(5, 5), { native: true })] },
      { stacks: [unit("orc-brute", 30, at(12, 5))] },
      [
        remains(at(2, 2), "goblin", "defender"),
        remains(at(8, 8), "goblin", "defender"),
      ],
    );
    s = patchStack(s, "a0", { rose: true });
    const killed = withFx(s, (fx) => {
      fx.harm("a0", 999);
    }).state;
    // The nearest other remains is paid; the return is scheduled.
    expect(killed.ground.map((g) => g.kind).sort()).toEqual([
      "bones",
      "corpse",
    ]);
    expect(killed.scheduled).toHaveLength(1);
  });

  it("Second Shift raises Shades from your side's remains", () => {
    const s = battle(
      { stacks: [unit("gravecaller", 4, at(2, 5))] },
      { stacks: [unit("orc-brute", 5, at(14, 5))] },
      [remains(at(4, 5), "skeleton", "attacker", "bones")],
    );
    const { state } = play(s, {
      type: "creatureCast",
      stackId: "a0",
      spell: "second-shift",
      targets: [{ hex: at(4, 5) }],
    });
    // Power 1 + 4 / 2 = 3: 75 HP, 9 Shades of 8 HP.
    const shade = state.stacks.find((x) => x.creature.id === "shade");
    expect(shade).toMatchObject({
      count: 9,
      summoned: true,
      owner: "attacker",
    });
    expect(state.ground).toEqual([]);
  });

  it("Pass On moves a bane to a stack adjacent to its bearer", () => {
    let s = battle(
      { stacks: [unit("gravecaller", 4, at(7, 5))] },
      {
        stacks: [
          unit("orc-brute", 5, at(12, 5)),
          unit("orc-brute", 5, at(12, 4)),
        ],
      },
    );
    s = withFx(s, (fx) => {
      fx.addCondition("a0", { kind: "venomed" });
    }).state;
    expect(
      actionError(s, {
        type: "creatureCast",
        stackId: "a0",
        spell: "pass-on",
        targets: [
          { stack: "a0", condition: uidOf(s, "a0", "venomed") },
          { stack: "d0" },
        ],
      }),
    ).not.toBeNull();
  });
});

describe("The Horde's abilities", () => {
  it("Worry: Venomed on every Strike of the Wolf Riders", () => {
    const s = battle(
      { stacks: [unit("wolf-rider", 10, at(4, 5))] },
      { stacks: [unit("orc-brute", 20, at(8, 5))] },
    );
    const { state } = play(s, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(7, 5),
    });
    expect(kinds(state, "d0")).toEqual(["venomed"]);
  });

  it("Hit and Run walks up to 3 hexes after the retaliation", () => {
    const s = battle(
      {
        stacks: [unit("wolf-rider", 10, at(4, 5), { extra: ["hit-and-run"] })],
      },
      { stacks: [unit("orc-brute", 20, at(8, 5))] },
    );
    const { state, events } = play(s, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(7, 5),
      after: at(4, 5),
    });
    expect(strikes(events).map((x) => x[2])).toEqual(["melee", "retaliation"]);
    expect(getStack(state, "a0").hex).toEqual(at(4, 5));
    // Without the Drill the walk is ignored.
    const plain = battle(
      { stacks: [unit("wolf-rider", 10, at(4, 5))] },
      { stacks: [unit("orc-brute", 20, at(8, 5))] },
    );
    const after = play(plain, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(7, 5),
      after: at(4, 5),
    }).state;
    expect(getStack(after, "a0").hex).toEqual(at(7, 5));
  });

  it("Hurl refuses a stack over 40 HP per Ogre", () => {
    const s = battle(
      { stacks: [unit("ogre", 1, at(7, 5))] },
      { stacks: [unit("orc-brute", 2, at(8, 5))] },
    );
    const ready = until(s, "a0");
    expect(
      actionError(ready, {
        type: "ability",
        stackId: "a0",
        ability: "hurl",
        targets: [{ stack: "d0" }],
      }),
    ).toBe("limit 40 HP, the stack has 56");
  });

  it("Bomb at a friendly Goblin: it flies 3 hexes toward the enemy, unhurt", () => {
    const s = battle(
      {
        birthright: "launched",
        stacks: [
          unit("goblin", 10, at(4, 5), { native: true }),
          unit("bomb-chucker", 10, at(0, 0), { native: true }),
        ],
      },
      { stacks: [unit("orc-brute", 5, at(14, 5))] },
    );
    const ready = until(s, "a1");
    const { state, events } = play(ready, {
      type: "shootHex",
      stackId: "a1",
      at: at(4, 5),
    });
    expect(strikes(events)).toEqual([]);
    expect(getStack(state, "a0").hex).toEqual(at(7, 5));
    expect(countTop(state, "a0")).toEqual([10, 10]);
  });

  it("Fire Pots: the centre stack Burns 2 per Bomb Chucker", () => {
    const s = battle(
      { stacks: [unit("bomb-chucker", 6, at(0, 0), { extra: ["fire-pots"] })] },
      { stacks: [unit("orc-brute", 20, at(10, 5))] },
    );
    const { state } = play(s, { type: "shoot", stackId: "a0", targetId: "d0" });
    expect(
      getStack(state, "d0").conditions.map((c) => [c.kind, c.size, c.clock]),
    ).toEqual([["burning", 12, 3]]);
  });

  it("Thunderclap is an area effect: natives of the caster's side fly", () => {
    const s = battle(
      {
        birthright: "launched",
        stacks: [
          unit("boomshaman", 4, at(0, 0), { native: true }),
          unit("goblin", 10, at(7, 4), { native: true }),
        ],
      },
      { stacks: [unit("orc-brute", 20, at(7, 5))] },
    );
    const ready = until(s, "a0");
    const { state, events } = play(ready, {
      type: "creatureCast",
      stackId: "a0",
      spell: "thunderclap",
      targets: [{ hex: at(7, 5) }],
    });
    // Power 3: 30 Harm on the Brutes; the Goblins take nothing.
    expect(
      events.filter((e) => e.type === "harm").map((e) => [e.targetId, e.harm]),
    ).toEqual([["d0", 30]]);
    expect(getStack(state, "a1").count).toBe(10);
    expect(getStack(state, "a1").hex).not.toEqual(at(7, 4));
  });

  it("Kaboom: Harm 30 x C on and around a hex", () => {
    const s = battle(
      {
        hero: { ...HERO, command: "kaboom", commandC: 2 },
        stacks: [unit("goblin", 10, at(0, 0))],
      },
      {
        stacks: [
          unit("orc-brute", 20, at(7, 5)),
          unit("orc-brute", 5, at(8, 5)),
        ],
      },
    );
    const { events } = play(s, {
      type: "heroAct",
      stackId: "a0",
      act: "kaboom",
      targets: [{ hex: at(7, 5) }],
    });
    expect(
      events.filter((e) => e.type === "harm").map((e) => [e.targetId, e.harm]),
    ).toEqual([
      ["d0", 60],
      ["d1", 60],
    ]);
  });

  it("Heave-Ho pushes friendly stacks 4 hexes in a straight line", () => {
    const s = battle(
      {
        hero: { ...HERO, command: "heave-ho", commandC: 1 },
        stacks: [unit("goblin", 10, at(2, 5)), unit("goblin", 10, at(2, 1))],
      },
      { stacks: [unit("orc-brute", 20, at(14, 5))] },
    );
    const { state } = play(s, {
      type: "heroAct",
      stackId: "a0",
      act: "heave-ho",
      targets: [
        { stack: "a0" },
        { hex: at(10, 5) },
        { stack: "a1" },
        { hex: at(9, 1) },
      ],
    });
    expect(getStack(state, "a0").hex).toEqual(at(6, 5));
    expect(getStack(state, "a1").hex).toEqual(at(6, 1));
  });

  it("Stampede: up to C + 1 adjacent friends strike, one retaliation", () => {
    const s = battle(
      {
        hero: { ...HERO, command: "stampede", commandC: 1 },
        stacks: [
          unit("squire", 10, at(8, 4)),
          unit("squire", 10, at(7, 5)),
          unit("squire", 10, at(8, 6)),
        ],
      },
      { stacks: [unit("orc-brute", 20, at(8, 5))] },
    );
    const { events } = play(s, {
      type: "heroAct",
      stackId: s.activeStackId as string,
      act: "stampede",
      targets: [{ stack: "d0" }],
    });
    const kindsOf = strikes(events).map((x) => x[2]);
    expect(kindsOf.filter((k) => k === "melee")).toHaveLength(2);
    expect(kindsOf.filter((k) => k === "retaliation")).toHaveLength(1);
  });
});
