/**
 * The battle AI with and against the Candy Kingdom (FACTION_CANDY.md
 * section 12, bead bzc.116), on hand-built boards: Reel In targets and
 * its walk into range, Stuck in the threat map and the evaluation,
 * Sitting Ducks, Sugar Rush, Afters, Chewy, the Larder, the Commands, and
 * the counters to Stuck (Pass On, Wind) and to the Wranglers' pull.
 */
import { describe, expect, it } from "vitest";
import {
  act,
  aftersDue,
  applyAction,
  chooseAiAction,
  evaluateFor,
  getStack,
  hexDistance,
  isAdjacent,
  scoreActions,
  stepHex,
} from "../../../src/core/battle/index.ts";
import type {
  BattleAction,
  BattleSide,
  BattleState,
  GroundFeature,
  Hex,
} from "../../../src/core/battle/index.ts";
import { placedEstimates } from "../../../src/core/battle/ai.ts";
import { at, battle, stats, unit } from "./faction-helpers.ts";
import { cond, patchStack } from "./helpers.ts";

const native = { native: true };
const STICKY = { birthright: "sticky" };
/** Weights that read the threat map alone (no pressing, no fading). */
const PLAIN = { behindPresses: 0, guardsPress: 0, aheadRounds: 0 };

function stuck(s: BattleState, id: string, clock = 2, uid = 900): BattleState {
  return patchStack(s, id, {
    conditions: [...getStack(s, id).conditions, cond("stuck", { clock }, uid)],
  });
}

/** Plays defends until `id` is the active stack. */
function until(s: BattleState, id: string): BattleState {
  let cur = s;
  for (let i = 0; i < 40 && cur.activeStackId !== id; i++)
    cur = applyAction(cur, {
      type: "defend",
      stackId: cur.activeStackId as string,
    }).state;
  expect(cur.activeStackId).toBe(id);
  return cur;
}

/** The enemy-threat term of `side`'s evaluation (fear weight 1). */
function enemyThreat(s: BattleState, side: BattleSide): number {
  const w = { ...PLAIN, ownThreat: 0 };
  return (
    evaluateFor(s, side, { weights: { ...w, enemyThreat: 0 } }) -
    evaluateFor(s, side, { weights: { ...w, enemyThreat: 1 } })
  );
}

/** The own-threat term of `side`'s evaluation (weight 1). */
function ownThreat(s: BattleState, side: BattleSide): number {
  const w = { ...PLAIN, enemyThreat: 0 };
  return (
    evaluateFor(s, side, { weights: { ...w, ownThreat: 1 } }) -
    evaluateFor(s, side, { weights: { ...w, ownThreat: 0 } })
  );
}

function moved(s: BattleState, id: string, hex: Hex): BattleState {
  return patchStack(s, id, { hex });
}

function ability(a: BattleAction) {
  expect(a.type).toBe("ability");
  return a as Extract<BattleAction, { type: "ability" }>;
}

function heroAct(a: BattleAction) {
  expect(a.type).toBe("heroAct");
  return a as Extract<BattleAction, { type: "heroAct" }>;
}

function sweets(hex: Hex): GroundFeature {
  return {
    hex,
    kind: "sweets",
    class: "remains",
    school: null,
    size: 0,
    clock: null,
    remains: {
      creature: stats("gingerbread-man"),
      owner: "attacker",
      initialCount: 6,
    },
    source: "dead",
  };
}

describe("Reel In (the Taffy Wranglers)", () => {
  it("walks into range and pulls a shooter its walk could not reach", () => {
    // Chuckers 10 hexes off: out of the Wranglers' walk (Speed 6), inside
    // walk plus pull (6 + 6). Limit 6 x 30 = 180 HP; 14 Chuckers have 168.
    const s = battle(
      {
        ...STICKY,
        stacks: [
          unit("taffy-wrangler", 6, at(3, 5), native),
          unit("peppermint-archer", 10, at(0, 5), native),
        ],
      },
      {
        stacks: [
          unit("bomb-chucker", 14, at(13, 5)),
          unit("orc-brute", 6, at(13, 9)),
        ],
      },
    );
    expect(s.activeStackId).toBe("a0");
    for (const mode of ["full", "fast"] as const) {
      const a = ability(chooseAiAction(s, { mode }));
      expect(a.ability).toBe("reel-in");
      expect(a.targets).toEqual([{ stack: "d0" }]);
      expect(a.from).toBeDefined();
      const after = applyAction(s, a).state;
      expect(
        isAdjacent(getStack(after, "d0").hex, getStack(after, "a0").hex),
      ).toBe(true);
    }
  });

  it("offers own stacks only when their walk could not do the pull's work", () => {
    const s = battle(
      {
        ...STICKY,
        stacks: [
          unit("rock-candy-dragon", 1, at(1, 1), native),
          unit("taffy-wrangler", 6, at(6, 5), native),
          unit("gingerbread-man", 10, at(3, 8), native),
        ],
      },
      { stacks: [unit("orc-brute", 10, stepHex(at(6, 5), 0))] },
    );
    // The Dragon (Speed 7) acts first; on the Wranglers' turn its turn is
    // over, and the Gingerbread Men are still to act.
    const t = until(s, "a1");
    const targets = act("reel-in")
      .aiTargets?.(t, "a1")
      ?.map((x) => (x[0] as { stack: string }).stack);
    expect(targets).toEqual(["a0", "d0"]);
    // Stuck, the Gingerbread Men are offered too.
    expect(
      act("reel-in")
        .aiTargets?.(stuck(t, "a2"), "a1")
        ?.map((x) => (x[0] as { stack: string }).stack),
    ).toEqual(["a0", "a2", "d0"]);
  });

  it("pulls its own Dragon into contact before the Afters turn", () => {
    // The Dragon (150 HP, under the limit of 180) has had its turn; pulled
    // next to the Brutes it strikes them in its round-end turn.
    const s = battle(
      {
        ...STICKY,
        stacks: [
          unit("rock-candy-dragon", 1, at(8, 1), native),
          unit("taffy-wrangler", 6, at(6, 5), native),
        ],
      },
      { stacks: [unit("orc-brute", 5, stepHex(at(6, 5), 0))] },
    );
    const t = until(s, "a1");
    expect(aftersDue(t)).toEqual(["a0"]);
    const a = ability(chooseAiAction(t));
    expect(a.ability).toBe("reel-in");
    expect(a.targets).toEqual([{ stack: "a0" }]);
    const after = applyAction(t, a).state;
    expect(
      isAdjacent(getStack(after, "a0").hex, getStack(after, "d0").hex),
    ).toBe(true);
  });
});

describe("playing against the Wranglers", () => {
  const board = (shooter: Hex, count = 10): BattleState =>
    battle(
      { stacks: [unit("bomb-chucker", count, shooter)] },
      {
        ...STICKY,
        stacks: [unit("taffy-wrangler", 6, at(14, 5), native)],
      },
    );

  it("a shooter within the Wranglers' walk and pull is exposed", () => {
    // 10 hexes off: out of melee reach (7), inside walk plus pull (12).
    const inRange = board(at(4, 5));
    const outOfRange = board(at(1, 5));
    expect(hexDistance(at(4, 5), at(14, 5))).toBe(10);
    expect(hexDistance(at(1, 5), at(14, 5))).toBe(13);
    expect(enemyThreat(inRange, "attacker")).toBeGreaterThan(
      enemyThreat(outOfRange, "attacker") + 1,
    );
  });

  it("not when the shooter is too heavy to pull", () => {
    // 16 Chuckers have 192 HP: over the limit of 180.
    expect(enemyThreat(board(at(4, 5), 16), "attacker")).toBeCloseTo(
      enemyThreat(board(at(1, 5), 16), "attacker"),
      6,
    );
  });

  it("standing next to a Dragon whose Afters is still due costs one more Strike", () => {
    const D = at(8, 5);
    const s = battle(
      { stacks: [unit("orc-brute", 20, at(0, 0))] },
      {
        ...STICKY,
        stacks: [unit("rock-candy-dragon", 1, D, native)],
      },
    );
    // The Dragon (Speed 7) acts first and defends: the Brutes are next.
    const t = until(s, "a0");
    expect(aftersDue(t)).toEqual(["d0"]);
    const next = moved(t, "a0", stepHex(D, 3));
    const near = moved(t, "a0", stepHex(stepHex(D, 3), 3));
    expect(enemyThreat(next, "attacker")).toBeGreaterThan(
      enemyThreat(near, "attacker") + 1,
    );
    // Once the Afters is taken, both cost the same.
    const done = (b: BattleState): BattleState =>
      patchStack(b, "d0", { extraTurnRound: b.round });
    expect(enemyThreat(done(next), "attacker")).toBeCloseTo(
      enemyThreat(done(near), "attacker"),
      6,
    );
  });

  it("the fast estimate matches the evaluation with Wranglers and Stuck stacks", () => {
    const s = stuck(
      battle(
        {
          stacks: [
            unit("bomb-chucker", 10, at(2, 5)),
            unit("orc-brute", 6, at(9, 4)),
          ],
        },
        {
          ...STICKY,
          stacks: [
            unit("taffy-wrangler", 6, at(14, 5), native),
            unit("gingerbread-man", 10, at(10, 4), native),
            unit("rock-candy-dragon", 1, stepHex(at(8, 8), 0), native),
          ],
        },
      ),
      "d1",
    );
    const t = until(s, "a0");
    // The Dragon has had its turn: its Afters is still due.
    expect(aftersDue(t)).toEqual(["d2"]);
    const hexes = [at(3, 5), at(6, 4), at(9, 3), at(11, 4), at(8, 8)];
    const fast = placedEstimates(t, hexes);
    hexes.forEach((h, i) => {
      expect(fast[i]).toBeCloseTo(
        evaluateFor(moved(t, "a0", h), "attacker"),
        6,
      );
    });
  });
});

describe("Stuck in the evaluation", () => {
  it("a Stuck stack threatens only what stands next to it", () => {
    // Brutes far from the archers: free, they could walk up; Stuck, not.
    const s = battle(
      {
        ...STICKY,
        stacks: [unit("peppermint-archer", 10, at(2, 5), native)],
      },
      { stacks: [unit("orc-brute", 8, at(6, 5))] },
    );
    expect(enemyThreat(s, "attacker")).toBeGreaterThan(0);
    expect(enemyThreat(stuck(s, "d0"), "attacker")).toBe(0);
  });

  it("a shooter held Stuck beside an enemy is worth far less than one in the clear", () => {
    const pinned = battle(
      {
        ...STICKY,
        stacks: [unit("gummy-bear", 2, at(8, 5), native)],
      },
      { stacks: [unit("longbowman", 12, stepHex(at(8, 5), 0))] },
    );
    const clear = moved(pinned, "d0", at(14, 1));
    const loss = (b: BattleState): number =>
      evaluateFor(stuck(b, "d0"), "attacker") - evaluateFor(b, "attacker");
    expect(loss(pinned)).toBeGreaterThan(5 * loss(clear));
  });

  it("Sitting Ducks: the Archers shoot the Stuck stack", () => {
    const s = battle(
      {
        ...STICKY,
        stacks: [unit("peppermint-archer", 15, at(1, 5), native)],
      },
      {
        stacks: [
          unit("orc-brute", 10, at(12, 3)),
          unit("orc-brute", 10, at(12, 7)),
        ],
      },
    );
    for (const id of ["d0", "d1"]) {
      const a = chooseAiAction(stuck(s, id));
      expect(a).toEqual({ type: "shoot", stackId: "a0", targetId: id });
    }
  });
});

describe("Sugar Rush, Afters and Chewy", () => {
  it("Sugar Rush hastens a heavy stack still to act, not one whose turn is over", () => {
    // Dragons (2, 300 HP) act first; Gummy Bears (3, 285 HP) are still to
    // act. Gate: 15 Gingerbread Men x 20 = 300 HP, so both fit.
    const s = battle(
      {
        ...STICKY,
        stacks: [
          unit("rock-candy-dragon", 2, at(2, 6), native),
          unit("gingerbread-man", 15, at(2, 5), native),
          unit("gummy-bear", 3, at(1, 4), native),
        ],
      },
      { stacks: [unit("orc-brute", 20, at(14, 5))] },
    );
    const t = until(s, "a1");
    const a = ability(chooseAiAction(t));
    expect(a.ability).toBe("sugar-rush");
    expect(a.targets).toEqual([{ stack: "a2" }]);
  });

  it("Afters: a Dragon's reach counts two Strikes", () => {
    const base = stats("rock-candy-dragon");
    const s = battle(
      { stacks: [unit("rock-candy-dragon", 1, at(4, 5), native)] },
      { stacks: [unit("orc-brute", 40, at(8, 5))] },
    );
    const plain = patchStack(s, "a0", {
      creature: {
        ...base,
        abilities: base.abilities.filter((x) => x !== "afters"),
      },
    });
    expect(base.abilities).toContain("afters");
    expect(ownThreat(s, "attacker")).toBeCloseTo(
      2 * ownThreat(plain, "attacker"),
      6,
    );
  });

  it("Chewy: the AI sees the first melee blow on the Gummy Bears halved", () => {
    const s = battle(
      { stacks: [unit("orc-brute", 12, at(6, 5))] },
      {
        ...STICKY,
        stacks: [unit("gummy-bear", 3, stepHex(at(6, 5), 0), native)],
      },
    );
    const hit = (b: BattleState): number =>
      scoreActions(b).find(
        (x) => x.action.type === "attack" && x.action.targetId === "d0",
      )?.score ?? NaN;
    const chewed = patchStack(s, "d0", { meleeStruckRound: s.round });
    expect(hit(s)).toBeLessThan(hit(chewed));
  });
});

describe("the Larder", () => {
  it("a wounded native walks onto sweets to eat them", () => {
    const sw = at(2, 9);
    const s0 = battle(
      {
        ...STICKY,
        stacks: [
          unit("gingerbread-man", 4, at(2, 5), {
            native: true,
            extra: ["larder"],
          }),
        ],
      },
      { stacks: [unit("orc-brute", 5, at(14, 5))] },
      [sweets(sw)],
    );
    const s = patchStack(s0, "a0", { initialCount: 12 });
    const a = chooseAiAction(s);
    expect(a).toEqual({ type: "move", stackId: "a0", to: sw });
    // Without the Larder the sweets are only ground.
    const plain = patchStack(s, "a0", { creature: stats("gingerbread-man") });
    expect(chooseAiAction(plain)).not.toEqual({
      type: "move",
      stackId: "a0",
      to: sw,
    });
  });
});

describe("the Commands", () => {
  it("Crack! when two friendly stacks stand beside a Stuck enemy", () => {
    const D = at(6, 5);
    const s = stuck(
      battle(
        {
          ...STICKY,
          hero: { attack: 2, defense: 2, command: "crack", commandC: 1 },
          stacks: [
            unit("gingerbread-man", 20, stepHex(D, 1), native),
            unit("gingerbread-man", 20, stepHex(D, 5), native),
            unit("peppermint-archer", 10, at(0, 0), native),
          ],
        },
        { stacks: [unit("orc-brute", 12, D)] },
      ),
      "d0",
    );
    const a = heroAct(chooseAiAction(s));
    expect(a.act).toBe("crack");
    expect(a.targets).toEqual([{ stack: "d0" }]);
  });

  it("Come In, Dear pulls the enemy shooter, not the brute", () => {
    const s = battle(
      {
        ...STICKY,
        hero: { attack: 2, defense: 2, command: "come-in-dear", commandC: 1 },
        stacks: [
          unit("gummy-bear", 3, at(3, 5), native),
          unit("gingerbread-man", 10, at(1, 2), native),
        ],
      },
      {
        stacks: [
          unit("bomb-chucker", 12, at(8, 5)),
          unit("orc-brute", 6, at(7, 8)),
        ],
      },
    );
    const a = heroAct(chooseAiAction(s));
    expect(a.act).toBe("come-in-dear");
    expect(a.targets[0]).toEqual({ stack: "d0" });
  });
});

describe("counters to Stuck", () => {
  it("Pass On hands a Stuck back to the native that made it", () => {
    const s0 = battle(
      {
        hero: { attack: 1, defense: 1 },
        magic: {
          power: 2,
          mana: 30,
          schoolRanks: { bloom: 0, accord: 0, clock: 1, hush: 1, storm: 0 },
          pages: ["pass-on", "wind"],
        },
        stacks: [unit("orc-brute", 12, at(6, 5))],
      },
      {
        ...STICKY,
        stacks: [
          unit("gingerbread-man", 6, stepHex(at(6, 5), 0), native),
          unit("peppermint-archer", 12, at(10, 9), native),
        ],
      },
    );
    const s = until(stuck(s0, "a0"), "a0");
    for (const mode of ["full", "fast"] as const) {
      const a = heroAct(chooseAiAction(s, { mode }));
      expect(a.act).toBe("pass-on");
      expect(a.targets).toEqual([
        { stack: "a0", condition: 900 },
        { stack: "d0" },
      ]);
    }
  });

  it("the Sugarplums Wind a Stuck shooter's clock up", () => {
    const s = stuck(
      battle(
        {
          ...STICKY,
          stacks: [
            unit("sugarplum", 4, at(2, 5), native),
            unit("gummy-bear", 2, at(8, 5), native),
          ],
        },
        {
          stacks: [
            unit("longbowman", 12, stepHex(at(8, 5), 0)),
            unit("orc-brute", 5, at(14, 1)),
          ],
        },
      ),
      "d0",
      1,
    );
    expect(chooseAiAction(s)).toEqual({
      type: "creatureCast",
      stackId: "a0",
      spell: "wind",
      targets: [{ stack: "d0", condition: 900 }, { choice: "+2" }],
    });
  });
});
