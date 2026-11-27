/**
 * The Candy Kingdom's battle rules on hand-built battles (FACTION_CANDY.md
 * sections 3, 5, 5.1, 5.2, 6, 7 and 9): Stuck and Sticky, Afters, Chewy,
 * Reel In, Sitting Ducks, Sugar Rush, the Drills, the Larder, The Four
 * O'Clock, the Commands, the Flypaper Ribbon's Stuck and Pile On.
 */

import { describe, expect, it } from "vitest";
import {
  actionError,
  aftersDue,
  canShoot,
  getStack,
  hexDistance,
  legalActions,
  previewAttack,
  reachableHexes,
  runAutoBattle,
  stepHex,
  strikeAbilityId,
  swapPartners,
} from "../../../src/core/battle/index.ts";
import type {
  AttackAction,
  BattleAction,
  BattleEvent,
  BattleState,
  GroundFeature,
  Hex,
} from "../../../src/core/battle/index.ts";
import { FEATS } from "../../../src/data/feats.ts";
import { at, battle, kinds, stats, strikes, unit } from "./faction-helpers.ts";
import { cond, patchStack, play, withFx } from "./helpers.ts";

const STICKY = { birthright: "sticky" };
const native = { native: true };

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

function defend(s: BattleState): { state: BattleState; events: BattleEvent[] } {
  return play(s, { type: "defend", stackId: s.activeStackId as string });
}

function stuck(s: BattleState, id: string, clock = 2): BattleState {
  return patchStack(s, id, {
    conditions: [...getStack(s, id).conditions, cond("stuck", { clock })],
  });
}

function clockOf(s: BattleState, id: string, kind: string): number | null {
  const c = getStack(s, id).conditions.find((x) => x.kind === kind);
  return c === undefined ? -1 : c.clock;
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

const E = 0; // hex direction east
const C = at(5, 5);

describe("Stuck (FACTION_CANDY 3)", () => {
  it("a Stuck stack cannot walk but still attacks what is next to it", () => {
    const s = stuck(
      battle(
        { stacks: [unit("orc-brute", 5, C)] },
        {
          stacks: [
            unit("orc-brute", 5, stepHex(C, E)),
            unit("orc-brute", 5, at(12, 2)),
          ],
        },
      ),
      "a0",
    );
    expect(s.activeStackId).toBe("a0");
    expect([...reachableHexes(s, "a0").keys()]).toHaveLength(1);
    const legal = legalActions(s);
    expect(legal.some((a) => a.type === "move")).toBe(false);
    expect(
      legal.filter((a) => a.type === "attack").map((a) => a.targetId),
    ).toEqual(["d0"]);
    expect(actionError(s, { type: "move", stackId: "a0", to: at(4, 5) })).toBe(
      "destination not reachable",
    );
    expect(
      actionError(s, {
        type: "attack",
        stackId: "a0",
        targetId: "d0",
        from: stepHex(stepHex(C, E), 1),
      }),
    ).toBe("attack hex not reachable");
    // Defend and Wait stay open.
    expect(legal.map((a) => a.type)).toEqual(
      expect.arrayContaining(["defend", "wait"]),
    );
  });

  it("stops the walks other rules replace: Mist, a Sworn swap, a move-first ability", () => {
    const s = battle(
      {
        stacks: [
          unit("vampire", 2, at(2, 2)),
          unit("squire", 5, at(2, 6)),
          unit("squire", 5, at(2, 8)),
          unit("taffy-wrangler", 6, at(2, 4)),
        ],
      },
      { stacks: [unit("orc-brute", 3, at(8, 4))] },
    );
    const sworn = patchStack(
      patchStack(s, "a1", { conditions: [cond("sworn", { link: "a2" }, 901)] }),
      "a2",
      { conditions: [cond("sworn", { link: "a1" }, 902)] },
    );
    expect(swapPartners(sworn, "a1")).toEqual(["a2"]);
    expect(swapPartners(stuck(sworn, "a1"), "a1")).toEqual([]);
    expect(reachableHexes(s, "a0").size).toBeGreaterThan(1);
    expect([...reachableHexes(stuck(s, "a0"), "a0").keys()]).toHaveLength(1);
    // Reel In may walk first, but not while Stuck.
    const w = until(stuck(s, "a3"), "a3");
    expect(
      actionError(w, {
        type: "ability",
        stackId: "a3",
        ability: "reel-in",
        targets: [{ stack: "d0" }],
        from: at(3, 4),
      }),
    ).toBe("hex not reachable");
  });

  it("pushes and pulls still move a Stuck stack", () => {
    const s = stuck(
      battle(
        { stacks: [unit("orc-brute", 5, C)] },
        { stacks: [unit("orc-brute", 5, at(12, 5))] },
      ),
      "a0",
    );
    const { state } = withFx(s, (fx) => fx.push("a0", at(12, 5), 2));
    expect(getStack(state, "a0").hex).toEqual(at(3, 5));
  });

  it("a Stuck shooter beside an enemy can neither shoot nor walk clear", () => {
    const s = stuck(
      battle(
        { stacks: [unit("bomb-chucker", 6, C)] },
        { stacks: [unit("gingerbread-man", 6, stepHex(C, E))] },
      ),
      "a0",
    );
    const ready = until(s, "a0");
    expect(canShoot(ready, "a0")).toBe(false);
    expect([...new Set(legalActions(ready).map((a) => a.type))].sort()).toEqual(
      ["attack", "defend", "wait"],
    );
  });
});

describe("Sticky (birthright)", () => {
  it("a native melee attack sticks the target, before its retaliation", () => {
    const s = battle(
      { ...STICKY, stacks: [unit("gingerbread-man", 10, C, native)] },
      { stacks: [unit("orc-brute", 5, stepHex(C, E))] },
    );
    const { state, events } = play(s, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: C,
    });
    expect(clockOf(state, "d0", "stuck")).toBe(2);
    const landed = events.findIndex(
      (e) =>
        e.type === "condition" &&
        e.change === "landed" &&
        e.condition.kind === "stuck",
    );
    const ret = events.findIndex((e) => e.type === "retaliation");
    expect(landed).toBeGreaterThanOrEqual(0);
    expect(landed).toBeLessThan(ret);
    // The brute is not native Candy: its retaliation sticks nothing.
    expect(kinds(state, "a0")).toEqual([]);
  });

  it("a native retaliation sticks the attacker", () => {
    const s = battle(
      { stacks: [unit("orc-brute", 5, C)] },
      { ...STICKY, stacks: [unit("gummy-bear", 2, stepHex(C, E), native)] },
    );
    const { state } = play(s, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: C,
    });
    expect(clockOf(state, "a0", "stuck")).toBe(2);
  });

  it("guests and shots do not stick; a new native Strike refreshes the clock", () => {
    const guest = battle(
      { ...STICKY, stacks: [unit("gingerbread-man", 10, C)] },
      { stacks: [unit("orc-brute", 5, stepHex(C, E))] },
    );
    const g = play(guest, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: C,
    }).state;
    expect(kinds(g, "d0")).toEqual([]);
    const shot = battle(
      { ...STICKY, stacks: [unit("peppermint-archer", 10, C, native)] },
      { stacks: [unit("orc-brute", 5, at(12, 5))] },
    );
    const sh = play(until(shot, "a0"), {
      type: "shoot",
      stackId: "a0",
      targetId: "d0",
    }).state;
    expect(kinds(sh, "d0")).toEqual([]);
    const again = stuck(
      battle(
        { ...STICKY, stacks: [unit("gingerbread-man", 10, C, native)] },
        { stacks: [unit("orc-brute", 5, stepHex(C, E))] },
      ),
      "d0",
      1,
    );
    const r = play(again, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: C,
    }).state;
    expect(clockOf(r, "d0", "stuck")).toBe(2);
  });
});

describe("Afters (Rock Candy Dragon)", () => {
  it("takes a round-end turn before the round-end events, without walking", () => {
    const s = battle(
      { stacks: [unit("rock-candy-dragon", 1, at(3, 5))] },
      { stacks: [unit("orc-brute", 10, at(12, 5))] },
    );
    expect(s.activeStackId).toBe("a0");
    expect(aftersDue(s)).toEqual(["a0"]);
    let step = defend(s); // the Dragon's turn
    step = defend(step.state); // the Brutes'
    const t = step.state;
    expect([t.round, t.activeStackId]).toEqual([1, "a0"]);
    expect(getStack(t, "a0").aftersRound).toBe(1);
    expect(
      step.events.find((e) => e.type === "extraTurn" && e.granted),
    ).toMatchObject({ stackId: "a0", rule: "ability:afters" });
    expect(step.events.some((e) => e.type === "roundEnd")).toBe(false);
    expect(legalActions(t).some((a) => a.type === "move")).toBe(false);
    expect(aftersDue(t)).toEqual([]);
    // Then the round ends and the next turn walks again.
    const next = defend(t);
    expect(next.events.some((e) => e.type === "roundEnd")).toBe(true);
    expect([next.state.round, next.state.activeStackId]).toEqual([2, "a0"]);
    expect(legalActions(next.state).some((a) => a.type === "move")).toBe(true);
  });

  it("is the one extra turn of the round: none after Heartened's", () => {
    const s0 = battle(
      { stacks: [unit("rock-candy-dragon", 1, at(3, 5))] },
      { stacks: [unit("orc-brute", 10, at(12, 5))] },
    );
    const s = patchStack(s0, "a0", { conditions: [cond("heartened")] });
    let step = defend(s); // Heartened: an extra turn at once
    expect(step.state.activeStackId).toBe("a0");
    const all = [...step.events];
    for (let i = 0; i < 2; i++) {
      step = defend(step.state);
      all.push(...step.events);
    }
    expect(step.state.round).toBe(2);
    expect(all.filter((e) => e.type === "extraTurn" && e.granted)).toHaveLength(
      1,
    );
  });

  it("not under a Hold", () => {
    // The Dragon takes its turn, then is Frozen before the round ends.
    const played = defend(
      battle(
        { stacks: [unit("rock-candy-dragon", 1, at(3, 5))] },
        { stacks: [unit("orc-brute", 10, at(12, 5))] },
      ),
    ).state;
    const s = patchStack(played, "a0", {
      conditions: [cond("frozen", { clock: 1 })],
    });
    expect(s.activeStackId).toBe("d0");
    expect(aftersDue(s)).toEqual([]);
    const { state, events } = defend(s);
    expect(state.round).toBe(2);
    expect(events.some((e) => e.type === "extraTurn")).toBe(false);
  });

  it("a second attack for the same one retaliation (FACTION_CANDY 6.2)", () => {
    const s = battle(
      { stacks: [unit("rock-candy-dragon", 2, C)] },
      { stacks: [unit("orc-brute", 20, stepHex(C, E))] },
    );
    const first = play(s, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: C,
    });
    expect(strikes(first.events).map((x) => x[2])).toEqual([
      "melee",
      "retaliation",
    ]);
    const afters = defend(first.state); // the Brutes defend
    expect(afters.state.activeStackId).toBe("a0");
    const second = play(afters.state, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: C,
    });
    expect(strikes(second.events).map((x) => x[2])).toEqual(["melee"]);
  });

  it("several Dragon stacks take it in turn order", () => {
    const s = battle(
      {
        stacks: [
          unit("rock-candy-dragon", 1, at(3, 3)),
          unit("rock-candy-dragon", 1, at(3, 7)),
        ],
      },
      { stacks: [unit("orc-brute", 10, at(12, 5))] },
    );
    let cur = s;
    for (let i = 0; i < 3; i++) cur = defend(cur).state;
    expect(cur.activeStackId).toBe("a0");
    expect(cur.extraTurns).toEqual(["a1"]);
  });
});

describe("Chewy (Gummy Bear)", () => {
  const gummies = (): BattleState =>
    battle(
      {
        stacks: [
          unit("orc-brute", 17, stepHex(C, E)),
          unit("orc-brute", 17, stepHex(C, 1)),
          unit("longbowman", 10, at(1, 1)),
        ],
      },
      { stacks: [unit("gummy-bear", 3, C)] },
    );
  const chewy = (e: BattleEvent): boolean =>
    e.type === "damage" &&
    e.breakdown.abilityMultipliers.some((m) => m.source === "chewy");
  const atk = (s: BattleState, id: string): BattleAction => ({
    type: "attack",
    stackId: id,
    targetId: "d0",
    from: getStack(s, id).hex,
  });

  it("halves the first melee Strike each round only", () => {
    const s = until(gummies(), "a0");
    const one = play(s, atk(s, "a0"));
    const hit = one.events.find(
      (e) => e.type === "damage" && e.targetId === "d0",
    );
    expect(hit && chewy(hit)).toBe(true);
    const two = play(one.state, atk(one.state, "a1"));
    expect(
      two.events.some(
        (e) => e.type === "damage" && e.targetId === "d0" && chewy(e),
      ),
    ).toBe(false);
    // The next round, the first blow is halved again.
    const r2 = until(
      (() => {
        let cur = two.state;
        while (cur.round < 2) cur = defend(cur).state;
        return cur;
      })(),
      "a0",
    );
    const three = play(r2, atk(r2, "a0"));
    expect(
      three.events.some(
        (e) => e.type === "damage" && e.targetId === "d0" && chewy(e),
      ),
    ).toBe(true);
  });

  it("a retaliation on the Gummy Bears uses it; a shot does not", () => {
    const g = battle(
      { stacks: [unit("gummy-bear", 3, C)] },
      {
        stacks: [
          unit("orc-brute", 17, stepHex(C, E)),
          unit("orc-brute", 17, stepHex(C, 1)),
        ],
      },
    );
    const one = play(g, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: C,
    });
    const ret = one.events.find(
      (e) => e.type === "damage" && e.kind === "retaliation",
    );
    expect(ret && chewy(ret)).toBe(true);
    const s1 = until(one.state, "d1");
    const two = play(s1, {
      type: "attack",
      stackId: "d1",
      targetId: "a0",
      from: getStack(s1, "d1").hex,
    });
    expect(
      two.events.some(
        (e) => e.type === "damage" && e.targetId === "a0" && chewy(e),
      ),
    ).toBe(false);
    // A shot first leaves the first melee blow halved.
    const shot = battle(
      {
        stacks: [
          unit("longbowman", 10, at(1, 1)),
          unit("orc-brute", 17, stepHex(C, E)),
        ],
      },
      { stacks: [unit("gummy-bear", 3, C)] },
    );
    const after = play(shot, { type: "shoot", stackId: "a0", targetId: "d0" });
    const melee = play(after.state, atk(after.state, "a1"));
    const hit = melee.events.find(
      (e) => e.type === "damage" && e.targetId === "d0",
    );
    expect(hit && chewy(hit)).toBe(true);
  });
});

describe("Reel In (Taffy Wrangler)", () => {
  const reel = (target: string, from?: Hex): BattleAction => ({
    type: "ability",
    stackId: "a0",
    ability: "reel-in",
    targets: [{ stack: target }],
    ...(from ? { from } : {}),
  });

  it("pulls a stack within 6 hexes until it is next to the Wranglers", () => {
    // Doc 6.1: limit 30 x 6 = 180; 14 Bomb Chuckers have 168.
    const s = battle(
      { stacks: [unit("taffy-wrangler", 6, at(2, 5))] },
      { stacks: [unit("bomb-chucker", 14, at(8, 5))] },
    );
    const { state, events } = play(s, reel("d0"));
    expect(hexDistance(getStack(state, "d0").hex, at(2, 5))).toBe(1);
    expect(events.find((e) => e.type === "move")).toMatchObject({
      stackId: "d0",
      mode: "pull",
    });
    // Usable every turn.
    expect(getStack(state, "a0").abilitiesUsed).toEqual([]);
    // Next to an enemy now, the Chuckers cannot shoot.
    expect(canShoot(until(state, "d0"), "d0")).toBe(false);
  });

  it("re-aims at each hex: a stack off the straight lines still ends next to them", () => {
    const s = battle(
      { stacks: [unit("taffy-wrangler", 6, at(2, 5))] },
      { stacks: [unit("bomb-chucker", 10, at(6, 1))] },
    );
    expect(hexDistance(at(2, 5), at(6, 1))).toBeLessThanOrEqual(6);
    const { state } = play(s, reel("d0"));
    expect(hexDistance(getStack(state, "d0").hex, at(2, 5))).toBe(1);
  });

  it("refuses a stack out of range or above the HP limit", () => {
    const far = battle(
      { stacks: [unit("taffy-wrangler", 6, at(2, 5))] },
      { stacks: [unit("bomb-chucker", 10, at(9, 5))] },
    );
    expect(actionError(far, reel("d0"))).toBe("it must be within 6 hexes");
    const heavy = battle(
      { stacks: [unit("taffy-wrangler", 6, at(2, 5))] },
      { stacks: [unit("bomb-chucker", 16, at(8, 5))] },
    );
    expect(actionError(heavy, reel("d0"))).toBe(
      "limit 180 HP, the stack has 192",
    );
    // It may walk first, to bring the stack in range.
    expect(actionError(far, reel("d0", at(3, 5)))).toBeNull();
  });

  it("a stack already next to them stays; a blocker stops the pull; friends too", () => {
    const s = battle(
      {
        stacks: [
          unit("taffy-wrangler", 6, at(2, 5)),
          unit("goblin", 16, at(2, 9)),
        ],
      },
      { stacks: [unit("bomb-chucker", 10, at(3, 5))] },
    );
    const { state, events } = play(s, reel("d0"));
    expect(getStack(state, "d0").hex).toEqual(at(3, 5));
    expect(events.some((e) => e.type === "move")).toBe(false);
    // Its own Goblins (160 HP), friend or foe.
    const own = until(state, "a0");
    const pulled = play(own, reel("a1")).state;
    expect(hexDistance(getStack(pulled, "a1").hex, at(2, 5))).toBe(1);
    const rock: GroundFeature = {
      hex: at(5, 5),
      kind: "rock",
      class: "blocking",
      school: null,
      size: 0,
      clock: null,
      remains: null,
      source: "battlefield",
    };
    const blocked = battle(
      { stacks: [unit("taffy-wrangler", 6, at(2, 5))] },
      { stacks: [unit("bomb-chucker", 10, at(8, 5))] },
      [rock],
    );
    const b = play(blocked, reel("d0")).state;
    expect(getStack(b, "d0").hex).toEqual(at(6, 5));
  });

  it("Long Pull: 8 hexes, and the limit doubled against a Slowed stack", () => {
    const s = battle(
      {
        stacks: [unit("taffy-wrangler", 6, at(2, 5), { extra: ["long-pull"] })],
      },
      { stacks: [unit("bomb-chucker", 25, at(10, 5))] },
    );
    expect(actionError(s, reel("d0"))).toBe("limit 180 HP, the stack has 300");
    const slowed = patchStack(s, "d0", {
      conditions: [cond("slowed", { size: 1, clock: 2 })],
    });
    expect(actionError(slowed, reel("d0"))).toBeNull();
    const { state } = play(slowed, reel("d0"));
    expect(hexDistance(getStack(state, "d0").hex, at(2, 5))).toBe(1);
  });
});

describe("Sitting Ducks, Sugar Rush and the Drills", () => {
  it("Sitting Ducks: shots on a Stuck stack deal 50% more (doc 6.1: 87)", () => {
    const s = battle(
      {
        hero: { attack: 2, defense: 2 },
        stacks: [unit("peppermint-archer", 15, at(1, 5))],
      },
      { stacks: [unit("bomb-chucker", 12, at(8, 5), { topHp: 9 })] },
    );
    const shoot: AttackAction = {
      type: "shoot",
      stackId: "a0",
      targetId: "d0",
    };
    expect(previewAttack(s, shoot).damage).toBe(58);
    const p = previewAttack(stuck(s, "d0"), shoot);
    expect([p.damage, p.kills]).toEqual([87, 7]);
    const t = getStack(play(stuck(s, "d0"), shoot).state, "d0");
    expect([t.count, t.topHp]).toEqual([5, 6]);
  });

  it("Sugar Rush: Hastened for 2 rounds, gated, adjacent, once per battle", () => {
    const s = battle(
      {
        stacks: [
          unit("gingerbread-man", 10, C),
          unit("gummy-bear", 2, stepHex(C, E)),
          unit("gummy-bear", 3, stepHex(C, 3)),
          unit("orc-brute", 3, at(1, 1)),
        ],
      },
      {
        stacks: [
          unit("wolf-rider", 3, at(13, 1)),
          unit("banshee", 3, at(13, 9)),
        ],
      },
    );
    const ready = until(s, "a0");
    const rush = (target: string): BattleAction => ({
      type: "ability",
      stackId: "a0",
      ability: "sugar-rush",
      targets: [{ stack: target }],
    });
    expect(actionError(ready, rush("a3"))).toBe("it must be adjacent");
    // Gate 200 HP: three Gummy Bears (285 HP) refuse it.
    const refused = play(ready, rush("a2"));
    expect(kinds(refused.state, "a2")).toEqual([]);
    expect(refused.events.find((e) => e.type === "condition")).toMatchObject({
      change: "refused",
      reason: "gate",
    });
    const { state } = play(ready, rush("a1"));
    expect(clockOf(state, "a1", "hastened")).toBe(2);
    // It acts before the faster Banshees now.
    expect(state.activeStackId).toBe("a1");
    expect(getStack(state, "a0").abilitiesUsed).toEqual(["sugar-rush"]);
  });

  it("Hot from the Oven and The Four O'Clock start a stack Hastened for 1 round", () => {
    const s = battle(
      {
        stacks: [
          unit("gingerbread-man", 10, at(1, 1), {
            extra: ["hot-from-the-oven"],
          }),
          unit("gummy-bear", 2, at(1, 5), { extra: ["the-four-oclock"] }),
          unit("gingerbread-man", 10, at(1, 9)),
        ],
      },
      { stacks: [unit("orc-brute", 3, at(13, 5))] },
    );
    expect(clockOf(s, "a0", "hastened")).toBe(1);
    expect(clockOf(s, "a1", "hastened")).toBe(1);
    expect(kinds(s, "a2")).toEqual([]);
  });

  it("Cool Mint: a stack the Archers shoot becomes Slowed 1 for 2 rounds", () => {
    const s = battle(
      {
        stacks: [
          unit("peppermint-archer", 6, at(1, 5), { extra: ["cool-mint"] }),
        ],
      },
      { stacks: [unit("orc-brute", 10, at(10, 5))] },
    );
    const { state } = play(s, { type: "shoot", stackId: "a0", targetId: "d0" });
    const c = getStack(state, "d0").conditions.find((x) => x.kind === "slowed");
    expect([c?.size, c?.clock]).toEqual([1, 2]);
  });
});

describe("The Larder", () => {
  it("a native ending a walk on sweets eats them: Hastened 2, heals 5 per creature", () => {
    const s0 = battle(
      {
        stacks: [unit("gingerbread-man", 8, at(2, 5), { extra: ["larder"] })],
      },
      { stacks: [unit("orc-brute", 3, at(13, 5))] },
      [sweets(at(4, 5))],
    );
    const s = patchStack(s0, "a0", { initialCount: 12, topHp: 3 });
    const { state, events } = play(s, {
      type: "move",
      stackId: "a0",
      to: at(4, 5),
    });
    expect(state.ground.some((g) => g.class === "remains")).toBe(false);
    expect(clockOf(state, "a0", "hastened")).toBe(2);
    expect(events.find((e) => e.type === "heal")).toMatchObject({
      amount: 40,
    });
    // 7 x 9 + 3 = 66 HP, + 40 = 106: 11 whole creatures and a top at 7.
    expect([getStack(state, "a0").count, getStack(state, "a0").topHp]).toEqual([
      12, 7,
    ]);
  });

  it("not without the Larder, and not on other remains", () => {
    const plain = battle(
      { stacks: [unit("gingerbread-man", 8, at(2, 5))] },
      { stacks: [unit("orc-brute", 3, at(13, 5))] },
      [sweets(at(4, 5))],
    );
    const a = play(plain, { type: "move", stackId: "a0", to: at(4, 5) });
    expect(a.state.ground.some((g) => g.class === "remains")).toBe(true);
    const corpse = battle(
      {
        stacks: [unit("gingerbread-man", 8, at(2, 5), { extra: ["larder"] })],
      },
      { stacks: [unit("orc-brute", 3, at(13, 5))] },
      [{ ...sweets(at(4, 5)), kind: "corpse" }],
    );
    const b = play(corpse, { type: "move", stackId: "a0", to: at(4, 5) });
    expect(b.state.ground.some((g) => g.class === "remains")).toBe(true);
    expect(kinds(b.state, "a0")).toEqual([]);
  });
});

describe("Commands", () => {
  it("Crack!: up to C + 1 stacks next to a Stuck enemy Strike it; one retaliation", () => {
    const D = stepHex(C, E);
    const s = battle(
      {
        hero: { attack: 0, defense: 0, command: "crack", commandC: 1 },
        stacks: [
          unit("gingerbread-man", 10, stepHex(D, 1)),
          unit("gingerbread-man", 10, stepHex(D, 5)),
          unit("gingerbread-man", 10, stepHex(D, 0)),
        ],
      },
      { stacks: [unit("orc-brute", 20, D)] },
    );
    const act: BattleAction = {
      type: "heroAct",
      stackId: "a0",
      act: "crack",
      targets: [{ stack: "d0" }],
    };
    expect(actionError(s, act)).toBe("the enemy must be Stuck");
    const { events } = play(stuck(s, "d0"), act);
    const hits = strikes(events);
    expect(hits.filter((x) => x[2] === "melee").map((x) => x[0])).toEqual([
      "a0",
      "a1",
    ]);
    expect(hits.filter((x) => x[2] === "retaliation")).toHaveLength(1);
  });

  it("Come In, Dear: pulls an enemy within C + 4 hexes next to a friend and sticks it", () => {
    const s = battle(
      {
        hero: { attack: 0, defense: 0, command: "come-in-dear", commandC: 1 },
        stacks: [
          unit("sugarplum", 4, at(1, 5)),
          unit("gummy-bear", 2, at(3, 5)),
        ],
      },
      {
        stacks: [
          unit("bomb-chucker", 10, at(8, 5)),
          unit("bomb-chucker", 10, at(9, 2)),
        ],
      },
    );
    const act = (enemy: string): BattleAction => ({
      type: "heroAct",
      stackId: s.activeStackId as string,
      act: "come-in-dear",
      targets: [{ stack: enemy }, { stack: "a1" }],
    });
    expect(hexDistance(at(9, 2), at(3, 5))).toBeGreaterThan(5);
    expect(actionError(s, act("d1"))).toBe(
      "they must be within 5 hexes of each other",
    );
    const { state } = play(s, act("d0"));
    expect(hexDistance(getStack(state, "d0").hex, at(3, 5))).toBe(1);
    expect(clockOf(state, "d0", "stuck")).toBe(2);
  });
});

describe("Outside the faction", () => {
  it("Pile On: Strikes on a Stuck stack deal 25% more", () => {
    const effect = FEATS["pile-on"]!.effects[0]!;
    if (effect.kind !== "strike-percent") throw new Error("pile-on");
    expect(effect.targetBears).toContain("stuck");
    const id = strikeAbilityId("attacker", { ...effect, label: "Pile On" });
    const s = battle(
      {
        stacks: [unit("orc-brute", 5, C, { extra: [id] })],
      },
      { stacks: [unit("orc-brute", 10, stepHex(C, E))] },
    );
    const attack: AttackAction = {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: C,
    };
    const src = (st: BattleState) =>
      previewAttack(st, attack).strike?.breakdown.abilityMultipliers.map(
        (m) => m.percent,
      );
    expect(src(s)).toEqual([]);
    expect(src(stuck(s, "d0"))).toEqual([125]);
  });
});

describe("A battle with Candy armies", () => {
  it("plays to the end with the faction's rules in it", () => {
    const candy = {
      hero: { attack: 2, defense: 2, command: "crack", commandC: 1 },
      birthright: "sticky",
      stacks: [
        unit("gingerbread-man", 20, at(0, 0), native),
        unit("peppermint-archer", 8, at(0, 2), native),
        unit("taffy-wrangler", 5, at(0, 4), native),
        unit("sugarplum", 3, at(0, 6), native),
        unit("gummy-bear", 2, at(0, 8), native),
        unit("rock-candy-dragon", 1, at(0, 10), native),
      ],
    };
    const horde = {
      hero: { attack: 2, defense: 1 },
      birthright: "launched",
      stacks: [
        unit("goblin", 25, at(14, 0), native),
        unit("bomb-chucker", 8, at(14, 2), native),
        unit("wolf-rider", 5, at(14, 4), native),
        unit("ogre", 2, at(14, 6), native),
        unit("orc-warboss", 1, at(14, 8), native),
      ],
    };
    const { result, events } = runAutoBattle(
      { seed: 7, obstacles: [], attacker: candy, defender: horde },
      { ai: "fast" },
    );
    expect(result.winner).not.toBeNull();
    // Sticky landed and Afters gave the Dragon its round-end turn.
    expect(
      events.some(
        (e) =>
          e.type === "condition" &&
          e.condition.kind === "stuck" &&
          (e.change === "landed" || e.change === "merged"),
      ),
    ).toBe(true);
    expect(
      events.some(
        (e) =>
          e.type === "extraTurn" && e.granted && e.rule === "ability:afters",
      ),
    ).toBe(true);
  });
});
