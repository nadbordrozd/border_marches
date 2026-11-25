/**
 * The worked combos of FACTION_HUMANS.md, FACTION_UNDEAD.md and
 * FACTION_GOBLINS.md (section 6 of each), on the real engine with the
 * creatures of src/data: each step reproduces the documents' numbers.
 */

import { describe, expect, it } from "vitest";
import {
  actionError,
  getStack,
  rehearse,
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
import { patchStack, play } from "./helpers.ts";

const KNIGHT_ERRANT = { attack: 2, defense: 2 };

describe("The Realm, 6.1: a favour for the knight", () => {
  function opening(): BattleState {
    let s = battle(
      {
        hero: KNIGHT_ERRANT,
        startRules: [{ id: "birthright:sworn" }],
        stacks: [
          unit("knight", 4, at(2, 5), { native: true }), // a0
          unit("dragonslayer", 1, at(9, 4), { native: true }), // a1
          unit("squire", 28, at(2, 4), { native: true }), // a2
          unit("friar", 8, at(0, 0), { native: true }), // a3
        ],
      },
      { stacks: [unit("orc-brute", 20, at(9, 5))] },
    );
    // Sworn pairs by slot order (FACTION_HUMANS 3).
    expect(getStack(s, "a0").conditions[0]).toMatchObject({
      kind: "sworn",
      link: "a1",
    });
    expect(getStack(s, "a1").conditions[0]).toMatchObject({
      kind: "sworn",
      link: "a0",
    });
    // Round 1.
    s = play(
      s,
      { type: "defend", stackId: "a0" },
      { type: "defend", stackId: "a1" },
      { type: "wait", stackId: "a3" },
      // Squires Attend the Knights: gate 20 x 28 = 560 >= 340.
      {
        type: "ability",
        stackId: "a2",
        ability: "attend",
        targets: [{ stack: "a0" }],
      },
      { type: "move", stackId: "d0", to: at(8, 5) },
    ).state;
    expect(kinds(s, "a0")).toEqual(["sworn", "heartened"]);
    // Friars Share the Knights' Heartened with their Sworn partner: the
    // copy keeps the gate.
    s = play(s, {
      type: "creatureCast",
      stackId: "a3",
      spell: "share",
      targets: [{ stack: "a0", condition: uidOf(s, "a0", "heartened") }],
    }).state;
    expect(kinds(s, "a1")).toEqual(["sworn", "heartened"]);
    expect(
      getStack(s, "a1").conditions.find((c) => c.kind === "heartened")?.gate,
    ).toEqual({ measure: "hp", max: 560 });
    expect(s.round).toBe(2);
    expect(s.activeStackId).toBe("a0");
    return s;
  }

  it("kills thirteen Brutes in one round for one retaliation", () => {
    let s = opening();
    // Round 2: the Knights walk 5 hexes and charge: 162, 5 kills.
    let step = play(s, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(7, 5),
    });
    s = step.state;
    expect(strikes(step.events).slice(0, 2)).toEqual([
      ["a0", "d0", "melee", 162, 5],
      // The Brutes' one retaliation: 66, no kill.
      ["d0", "a0", "retaliation", 66, 0],
    ]);
    expect(countTop(s, "d0")).toEqual([15, 6]);
    expect(countTop(s, "a0")).toEqual([4, 19]);
    // Heartened spent for an extra turn: the Knights act again at once.
    expect(s.activeStackId).toBe("a0");
    step = play(s, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(7, 5),
    });
    s = step.state;
    expect(strikes(step.events)).toEqual([["a0", "d0", "melee", 93, 4]]);
    expect(countTop(s, "d0")).toEqual([11, 25]);
    // The Dragonslayer: two boons, Paragon +20%: 69.
    expect(s.activeStackId).toBe("a1");
    step = play(s, {
      type: "attack",
      stackId: "a1",
      targetId: "d0",
      from: at(9, 4),
    });
    s = step.state;
    expect(strikes(step.events)).toEqual([["a1", "d0", "melee", 69, 2]]);
    expect(countTop(s, "d0")).toEqual([9, 12]);
    // Extra turn with one boon left (+10%): 63.
    expect(s.activeStackId).toBe("a1");
    step = play(s, {
      type: "attack",
      stackId: "a1",
      targetId: "d0",
      from: at(9, 4),
    });
    expect(strikes(step.events)).toEqual([["a1", "d0", "melee", 63, 2]]);
    expect(countTop(step.state, "d0")).toEqual([7, 5]);
  });
});

describe("The Realm, 6.2: lance and longbow (the three Drills)", () => {
  function lance(longbowmen: number): BattleState {
    return battle(
      {
        hero: KNIGHT_ERRANT,
        startRules: [{ id: "birthright:sworn" }],
        stacks: [
          unit("knight", 4, at(2, 5), {
            native: true,
            extra: ["follow-through"],
          }),
          unit("longbowman", longbowmen, at(0, 2), {
            native: true,
            extra: ["pin-down"],
          }),
        ],
      },
      { stacks: [unit("orc-brute", 20, at(8, 5))] },
    );
  }

  it("charges, pushes the Brutes clear, then covers and pins them", () => {
    const s = lance(27);
    const { state, events } = play(s, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(7, 5),
    });
    // 162, Follow Through (1 hex), no retaliation, Covering Volley 44.
    expect(strikes(events)).toEqual([
      ["a0", "d0", "melee", 162, 5],
      ["a1", "d0", "shot", 44, 2],
    ]);
    expect(getStack(state, "d0").hex).toEqual(at(9, 5));
    expect(countTop(state, "d0")).toEqual([13, 18]);
    expect(getStack(state, "a1").shotsLeft).toBe(11);
    // Pin Down: gate 405 against 354: Delayed for 2 rounds.
    expect(
      getStack(state, "d0").conditions.map((c) => [c.kind, c.clock]),
    ).toEqual([["delayed", 2]]);
  });

  it("refuses Pin Down when the target is above the gate (18 Longbowmen)", () => {
    const r = rehearse(lance(18), {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(7, 5),
    });
    const refused = r.steps.find(
      (e) => e.type === "condition" && e.change === "refused",
    );
    expect(refused).toMatchObject({ detail: "gate 270 HP, target has 369" });
  });
});

describe("The Realm, 6.3: the ghoul who swore an oath", () => {
  it("Swear In, then a Feast heals the Knights through the oath", () => {
    let s = battle(
      {
        hero: { ...KNIGHT_ERRANT, command: "swear-in", commandC: 1 },
        stacks: [
          unit("knight", 4, at(0, 0), { native: true }), // a0
          unit("ghoul", 12, at(2, 5)), // a1, a guest
        ],
      },
      { stacks: [unit("orc-brute", 5, at(14, 10))] },
      [remains(at(4, 5), "orc-brute", "defender")],
    );
    s = patchStack(s, "a0", { count: 2, topHp: 30 });
    // Guests are not paired: the Enchanter swears them in.
    s = play(s, {
      type: "heroAct",
      stackId: s.activeStackId as string,
      act: "swear-in",
      targets: [{ stack: "a1" }, { stack: "a0" }],
    }).state;
    expect(kinds(s, "a0")).toEqual(["sworn"]);
    expect(kinds(s, "a1")).toEqual(["sworn"]);
    if (s.activeStackId !== "a1")
      s = play(s, { type: "defend", stackId: s.activeStackId as string }).state;
    expect(s.activeStackId).toBe("a1");
    const { state, events } = play(s, {
      type: "move",
      stackId: "a1",
      to: at(4, 5),
    });
    // Feast: Heal 72 on the Ghouls (full), shared: Heal 72 on the Knights.
    const heals = events.filter((e) => e.type === "heal");
    expect(heals).toEqual([
      expect.objectContaining({ stackId: "a0", amount: 72, revived: 1 }),
    ]);
    expect(countTop(state, "a0")).toEqual([3, 17]);
    expect(state.ground.some((g) => g.class === "remains")).toBe(false);
  });
});

const REVENANT = { attack: 3, defense: 1 };

describe("The Restless, 6.1: the wake", () => {
  it("Banshees shoot and Wail; Keen grows with remains; Feast revives", () => {
    let s = battle(
      {
        hero: REVENANT,
        birthright: "not-done-yet",
        stacks: [
          unit("skeleton", 12, at(6, 4), {
            native: true,
            extra: ["spare-parts"],
          }), // a0
          unit("skeleton", 18, at(0, 8), { native: true }), // a1
          unit("ghoul", 12, at(0, 0), { native: true }), // a2
          unit("banshee", 10, at(0, 10), { native: true }), // a3
        ],
      },
      {
        stacks: [
          unit("orc-brute", 6, at(12, 2)), // d0
          unit("orc-brute", 6, at(7, 4)), // d1
          unit("orc-brute", 6, at(7, 5)), // d2
        ],
      },
    );
    // Round 1: Ghouls 6, Banshees 5, Skeletons 4. Ghouls hold.
    s = play(s, { type: "defend", stackId: "a2" }).state;
    let step = play(s, { type: "shoot", stackId: "a3", targetId: "d0" });
    expect(strikes(step.events)).toEqual([["a3", "d0", "shot", 60, 2]]);
    expect(countTop(step.state, "d0")).toEqual([4, 24]);
    // Wail: gate 120 against 108: Shaken, 2 rounds.
    expect(
      getStack(step.state, "d0").conditions.map((c) => [c.kind, c.clock]),
    ).toEqual([["shaken", 2]]);
    s = step.state;
    // The other two Brute stacks wipe out Skeletons A (12): 43 each, 4 kills.
    s = patchStack(s, "a0", { count: 4, topHp: 9 });
    s = play(s, { type: "wait", stackId: "a0" }).state;
    s = play(s, { type: "defend", stackId: "a1" }).state;
    step = play(s, {
      type: "attack",
      stackId: "d1",
      targetId: "a0",
      from: at(7, 4),
    });
    expect(strikes(step.events)[0]).toEqual(["d1", "a0", "melee", 43, 4]);
    s = step.state;
    // The bones are on the field and the return is on the timeline.
    expect(getStack(s, "a0").count).toBe(0);
    expect(s.ground.map((g) => g.kind)).toEqual(["bones"]);
    expect(s.scheduled).toEqual([
      expect.objectContaining({
        round: 2,
        phase: "start",
        side: "attacker",
        returnsStack: true,
        effect: { id: "engine:get-up", args: { stackId: "a0" } },
      }),
    ]);
    // A corpse joins the bones: Keen +20%, 72 instead of 60.
    s = {
      ...s,
      ground: [...s.ground, remains(at(3, 9), "orc-brute", "defender")],
    };
    while (s.round === 1)
      s = play(s, { type: "defend", stackId: s.activeStackId as string }).state;
    // Round 2 start: Skeletons A get up with ceil(12 / 3) = 4 on their
    // bones, which stay (Spare Parts).
    expect(countTop(s, "a0")).toEqual([4, 9]);
    expect(getStack(s, "a0").hex).toEqual(at(6, 4));
    expect(getStack(s, "a0").risen).toBe(true);
    expect(s.ground.map((g) => g.kind)).toEqual(["bones", "corpse"]);
    while (s.activeStackId !== "a3")
      s = play(s, { type: "defend", stackId: s.activeStackId as string }).state;
    s = patchStack(s, "d0", {
      count: 6,
      topHp: 28,
      conditions: [],
      defending: false,
    });
    step = play(s, { type: "shoot", stackId: "a3", targetId: "d0" });
    expect(strikes(step.events)).toEqual([["a3", "d0", "shot", 72, 2]]);
    expect(countTop(step.state, "d0")).toEqual([4, 12]);
  });

  it("Ghouls (8 of 12) Feast on a corpse: 48 HP, Ghouls 11", () => {
    let s = battle(
      {
        hero: REVENANT,
        stacks: [unit("ghoul", 12, at(2, 5), { native: true })],
      },
      { stacks: [unit("orc-brute", 6, at(14, 10))] },
      [remains(at(5, 5), "orc-brute", "defender")],
    );
    s = patchStack(s, "a0", { count: 8, topHp: 16 });
    const { state, events } = play(s, {
      type: "move",
      stackId: "a0",
      to: at(5, 5),
    });
    expect(events.find((e) => e.type === "heal")).toMatchObject({
      amount: 48,
      revived: 3,
    });
    expect(countTop(state, "a0")).toEqual([11, 16]);
    expect(state.ground).toEqual([]);
  });
});

describe("The Restless, 6.2: Last Rites for an Ogre", () => {
  const MORTICIAN = {
    attack: 1,
    defense: 1,
    command: "last-rites",
    commandC: 1,
  };
  function field(): BattleState {
    return battle(
      {
        hero: MORTICIAN,
        stacks: [
          unit("late-king", 2, at(6, 5), { native: true }), // a0
          unit("ghoul", 12, at(7, 4), {
            native: true,
            extra: ["grave-rot"],
          }), // a1
          unit("banshee", 10, at(0, 0), { native: true }), // a2
        ],
      },
      { stacks: [unit("ogre", 8, at(7, 5))] },
      [remains(at(8, 4), "skeleton", "attacker", "bones")],
    );
  }

  it("without the combo: 95, and 89 back", () => {
    const s = field();
    // Ghouls (Speed 6, slot 1) and Kings (6, slot 0): the Kings first.
    expect(s.activeStackId).toBe("a0");
    const { events } = play(s, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(6, 5),
    });
    expect(strikes(events)).toEqual([
      ["a0", "d0", "melee", 95, 1],
      ["d0", "a0", "retaliation", 89, 0],
    ]);
  });

  it("Wail is refused against 720 HP", () => {
    let s = field();
    s = play(s, { type: "defend", stackId: "a0" }).state;
    s = play(s, { type: "defend", stackId: "a1" }).state;
    const r = rehearse(s, { type: "shoot", stackId: "a2", targetId: "d0" });
    // The gate is tested when Wail lands, after the shot (720 - 45).
    expect(
      r.steps.find((e) => e.type === "condition" && e.change === "refused"),
    ).toMatchObject({
      reason: "gate",
      detail: "gate 120 HP, target has 675",
    });
  });

  it("Last Rites, then the Kings: 178 and no retaliation", () => {
    let s = field();
    s = play(s, {
      type: "heroAct",
      stackId: "a0",
      act: "last-rites",
      targets: [{ hex: at(8, 4) }],
    }).state;
    expect(
      getStack(s, "d0").conditions.map((c) => [c.kind, c.clock, c.size]),
    ).toEqual([
      ["shaken", 2, 0],
      ["jinxed", 2, 25],
    ]);
    expect(s.ground).toEqual([]);
    const { events } = play(s, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(6, 5),
    });
    expect(strikes(events)).toEqual([["a0", "d0", "melee", 178, 1]]);
  });

  it("Ghouls strike first (Venomed), then Last Rites: three banes, 230", () => {
    let s = field();
    s = play(s, { type: "defend", stackId: "a0" }).state;
    s = play(s, {
      type: "attack",
      stackId: "a1",
      targetId: "d0",
      from: at(7, 4),
    }).state;
    expect(kinds(s, "d0")).toEqual(["venomed"]);
    s = play(s, {
      type: "heroAct",
      stackId: s.activeStackId as string,
      act: "last-rites",
      targets: [{ hex: at(8, 4) }],
    }).state;
    // Next round the Kings (the Venomed lasts until round 2 ends).
    while (s.activeStackId !== "a0")
      s = play(s, { type: "defend", stackId: s.activeStackId as string }).state;
    expect(kinds(s, "d0")).toEqual(["venomed", "shaken", "jinxed"]);
    // (The Ogres defended while we waited; the document's numbers assume not.)
    s = patchStack(s, "d0", { defending: false });
    const { events } = play(s, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(6, 5),
    });
    const [first] = strikes(events);
    expect(first?.slice(0, 4)).toEqual(["a0", "d0", "melee", 230]);
  });
});

const WARLORD = { attack: 3, defense: 1 };

describe("The Horde, 6.1: bomb the pile", () => {
  it("one Bomb: 51 on the Brutes, Goblins Launched, a 50 Cannonball", () => {
    let s = battle(
      {
        hero: WARLORD,
        birthright: "launched",
        stacks: [
          unit("goblin", 12, at(8, 5), { native: true }), // a0: A
          unit("goblin", 12, at(6, 5), { native: true }), // a1: B
          unit("bomb-chucker", 15, at(1, 1), { native: true }), // a2
        ],
      },
      {
        stacks: [
          unit("orc-brute", 10, at(7, 5)), // d0
          unit("bomb-chucker", 12, at(12, 5)), // d1
        ],
      },
    );
    s = play(
      s,
      { type: "defend", stackId: "a0" },
      { type: "defend", stackId: "a1" },
    ).state;
    expect(s.activeStackId).toBe("a2");
    const { state, events } = play(s, {
      type: "shoot",
      stackId: "a2",
      targetId: "d0",
    });
    expect(strikes(events)).toEqual([
      ["a2", "d0", "shot", 51, 1],
      ["a0", "d1", "special", 50, 4],
    ]);
    expect(countTop(state, "d0")).toEqual([9, 5]);
    // Unhurt, thrown 3 hexes each way.
    expect(countTop(state, "a0")).toEqual([12, 8]);
    expect(getStack(state, "a0").hex).toEqual(at(11, 5));
    expect(getStack(state, "a1").hex).toEqual(at(3, 5));
    expect(countTop(state, "d1")).toEqual([8, 10]);
  });
});

describe("The Horde, 6.2: fastball, then the boss", () => {
  it("three Ogres hurl 15 Goblins: Cannonball +150% kills 7 of 14", () => {
    let s = battle(
      {
        hero: WARLORD,
        birthright: "launched",
        stacks: [
          unit("goblin", 15, at(4, 5), { native: true }), // a0
          unit("ogre", 3, at(3, 5), { native: true }), // a1
        ],
      },
      { stacks: [unit("bomb-chucker", 14, at(11, 5))] },
    );
    s = play(s, { type: "defend", stackId: "a0" }).state;
    // Bomb Chuckers act before the Ogres (Speed 4, attacker first).
    expect(s.activeStackId).toBe("a1");
    expect(
      actionError(s, {
        type: "ability",
        stackId: "a1",
        ability: "hurl",
        targets: [{ stack: "a0" }],
      }),
    ).toBeNull();
    const { state, events } = play(s, {
      type: "ability",
      stackId: "a1",
      ability: "hurl",
      targets: [{ stack: "a0" }],
    });
    expect(getStack(state, "a0").hex).toEqual(at(10, 5));
    expect(strikes(events)).toEqual([["a0", "d0", "special", 90, 7]]);
    expect(getStack(state, "d0").count).toBe(7);
  });

  it("two Warbosses Stomp: 112 and 56; Goblins Launched into Brutes: 51", () => {
    const s = battle(
      {
        hero: WARLORD,
        birthright: "launched",
        stacks: [
          unit("orc-warboss", 2, at(6, 5), { native: true }), // a0
          unit("goblin", 14, at(5, 5), { native: true }), // a1
        ],
      },
      {
        stacks: [
          unit("orc-brute", 20, at(7, 5)), // d0
          unit("orc-brute", 20, at(6, 4)), // d1, beside the Warbosses
          unit("orc-brute", 20, at(1, 5)), // d2, where the Goblins land
        ],
      },
    );
    expect(s.activeStackId).toBe("a0");
    const { state, events } = play(s, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(6, 5),
    });
    const hits = strikes(events);
    expect(hits[0]).toEqual(["a0", "d0", "melee", 112, 4]);
    expect(hits[1]).toEqual(["a0", "d1", "special", 56, 2]);
    // The Goblins take nothing and fly 3 hexes west, beside the Brutes.
    expect(getStack(state, "a1").hex).toEqual(at(2, 5));
    expect(countTop(state, "a1")).toEqual([14, 8]);
    expect(hits).toContainEqual(["a1", "d2", "special", 51, 1]);
    // Only the target retaliated.
    expect(hits.filter((h) => h[2] === "retaliation").map((h) => h[0])).toEqual(
      ["d0"],
    );
  });
});
