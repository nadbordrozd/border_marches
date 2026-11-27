/**
 * The battle AI with and against the Deepforge (FACTION_DWARVES.md
 * section 12, bead bzc.134), on hand-built boards: Stoke and Steam's
 * worth (when to Defend for Steam and when to strike), Ram, Lob's aim and
 * friendly splash, stepping off a marked hex, Turret, Spotter, Patch Up,
 * both Commands, and playing against stoked stacks (Set Off).
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  canWait,
  chooseAiAction,
  evaluateFor,
  getStack,
  hexDistance,
  isAdjacent,
  pendingShells,
  scoreActions,
  stepHex,
} from "../../../src/core/battle/index.ts";
import type {
  BattleAction,
  BattleSide,
  BattleState,
  Hex,
} from "../../../src/core/battle/index.ts";
import { placedEstimates } from "../../../src/core/battle/ai.ts";
import { at, battle, stats, unit } from "./faction-helpers.ts";
import { cond, patchStack, play } from "./helpers.ts";

const STOKE = { birthright: "stoke" };
const native = { native: true };
const MODES = ["full", "fast"] as const;
/** Weights that read the threat map alone (no pressing, no fading). */
const PLAIN = { behindPresses: 0, guardsPress: 0, aheadRounds: 0 };
const E = 0;
const W = 3;

/**
 * Plays the other stacks' turns until `id` is active: each Waits while it
 * may, else Defends.
 */
function until(s: BattleState, id: string): BattleState {
  let cur = s;
  for (let i = 0; i < 60 && cur.activeStackId !== id; i++) {
    const a = cur.activeStackId as string;
    const type = canWait(getStack(cur, a)) ? "wait" : "defend";
    cur = play(cur, { type, stackId: a }).state;
  }
  expect(cur.activeStackId).toBe(id);
  return cur;
}

function steam(s: BattleState, id: string, size: number): BattleState {
  return patchStack(s, id, {
    conditions: [
      ...getStack(s, id).conditions,
      cond("steam", { size, maxSize: 3, clock: null }, 950),
    ],
  });
}

function steamOf(s: BattleState, id: string): number {
  return getStack(s, id).conditions.find((c) => c.kind === "steam")?.size ?? 0;
}

function moved(s: BattleState, id: string, hex: Hex): BattleState {
  return patchStack(s, id, { hex });
}

/** The same stack without one of its abilities. */
function without(s: BattleState, id: string, abilityId: string): BattleState {
  const c = getStack(s, id).creature;
  expect(c.abilities).toContain(abilityId);
  return patchStack(s, id, {
    creature: { ...c, abilities: c.abilities.filter((a) => a !== abilityId) },
  });
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

function heroAct(a: BattleAction) {
  expect(a.type).toBe("heroAct");
  return a as Extract<BattleAction, { type: "heroAct" }>;
}

/** The hex a shot or lob lands on. */
function aim(s: BattleState, a: BattleAction): Hex {
  if (a.type === "shootHex") return a.at;
  expect(a.type).toBe("shoot");
  if (a.type !== "shoot") throw new Error("not a shot");
  return getStack(s, a.targetId).hex;
}

describe("Stoke and Steam", () => {
  const far = (): BattleState =>
    until(
      battle(
        { ...STOKE, stacks: [unit("steam-tank", 3, at(1, 5), native)] },
        { stacks: [unit("orc-brute", 20, at(13, 5))] },
      ),
      "a0",
    );

  it("a slow stack with nothing in reach Stokes rather than walk up alone", () => {
    const s = far();
    for (const mode of MODES) {
      const a = chooseAiAction(s, { mode });
      expect(a).toEqual({ type: "defend", stackId: "a0" });
      expect(steamOf(applyAction(s, a).state, "a0")).toBe(1);
    }
  });

  it("it keeps Stoking up to Steam 3 while nothing is in reach", () => {
    for (const size of [1, 2]) {
      const s = steam(far(), "a0", size);
      for (const mode of MODES) {
        const a = chooseAiAction(s, { mode });
        expect(a).toEqual({ type: "defend", stackId: "a0" });
        expect(steamOf(applyAction(s, a).state, "a0")).toBe(size + 1);
      }
    }
  });

  it("at Steam 3 Stoking adds nothing more: it walks", () => {
    const s = steam(far(), "a0", 3);
    for (const mode of MODES)
      expect(chooseAiAction(s, { mode }).type).toBe("move");
  });

  it("a stack with a target strikes instead: Gunners shoot, Tinkers attack", () => {
    const gunners = until(
      battle(
        { ...STOKE, stacks: [unit("rivet-gunner", 15, at(1, 5), native)] },
        { stacks: [unit("orc-brute", 20, at(13, 5))] },
      ),
      "a0",
    );
    const C = at(6, 5);
    const tinkers = until(
      battle(
        { ...STOKE, stacks: [unit("tinker", 20, C, native)] },
        { stacks: [unit("bomb-chucker", 6, stepHex(C, E))] },
      ),
      "a0",
    );
    for (const mode of MODES) {
      expect(chooseAiAction(gunners, { mode })).toEqual({
        type: "shoot",
        stackId: "a0",
        targetId: "d0",
      });
      expect(chooseAiAction(tinkers, { mode })).toMatchObject({
        type: "attack",
        targetId: "d0",
      });
    }
  });

  it("Steam is worth what it adds to the stack's best Strike, more with Ram", () => {
    const s = far();
    const gain = (b: BattleState): number =>
      evaluateFor(steam(b, "a0", 2), "attacker") - evaluateFor(b, "attacker");
    const plain = without(s, "a0", "ram");
    expect(gain(plain)).toBeGreaterThan(0);
    // Ram spares the retaliation of the Strike that spends it.
    expect(gain(s)).toBeGreaterThan(1.5 * gain(plain));
    // Steam 2 is worth twice Steam 1 (until the Strike kills everything).
    const one =
      evaluateFor(steam(plain, "a0", 1), "attacker") -
      evaluateFor(plain, "attacker");
    expect(gain(plain)).toBeGreaterThan(1.95 * one);
    expect(gain(plain)).toBeLessThan(2.05 * one);
  });
});

describe("Ram (doc 6.1)", () => {
  const C = at(5, 5);
  const tanks = (): BattleState =>
    until(
      battle(
        {
          ...STOKE,
          hero: { attack: 1, defense: 3 },
          stacks: [unit("steam-tank", 3, C, native)],
        },
        { stacks: [unit("orc-brute", 20, stepHex(C, E))] },
      ),
      "a0",
    );

  it("Tanks beside 20 Brutes Stoke rather than trade blows", () => {
    for (const mode of MODES)
      expect(chooseAiAction(tanks(), { mode })).toEqual({
        type: "defend",
        stackId: "a0",
      });
  });

  it("with Steam 2 they ram: the Brutes are thrown back and do not retaliate", () => {
    const s = steam(tanks(), "a0", 2);
    for (const mode of MODES) {
      const a = chooseAiAction(s, { mode });
      expect(a).toMatchObject({ type: "attack", targetId: "d0" });
      const { state, events } = applyAction(s, a);
      expect(
        events.some((e) => e.type === "damage" && e.kind === "retaliation"),
      ).toBe(false);
      expect(
        isAdjacent(getStack(state, "a0").hex, getStack(state, "d0").hex),
      ).toBe(false);
    }
  });
});

describe("Lob", () => {
  it("lobs at an enemy that has acted rather than one still to act", () => {
    // The Brutes (Speed 4) act before the Mortars (Speed 3): d0 waits and
    // may still step off a marked hex, d1 walks a hex. Alike otherwise,
    // the earlier stack would be the target.
    const s0 = battle(
      { ...STOKE, stacks: [unit("mortar", 4, at(1, 5), native)] },
      {
        stacks: [
          unit("orc-brute", 10, at(12, 2)),
          unit("orc-brute", 10, at(12, 8)),
        ],
      },
    );
    let s = play(s0, { type: "wait", stackId: "d0" }).state;
    s = play(s, { type: "move", stackId: "d1", to: at(13, 8) }).state;
    expect(s.activeStackId).toBe("a0");
    for (const mode of MODES) {
      const a = chooseAiAction(s, { mode });
      expect(aim(s, a)).toEqual(at(13, 8));
      const after = applyAction(s, a).state;
      expect(pendingShells(after)).toHaveLength(1);
    }
  });

  it("finds that target among many in fast mode too", () => {
    // Four Brute stacks wait; the fifth has walked. Fast mode rehearses
    // only its best few shots, ranked by the shell's worth.
    const s0 = battle(
      { ...STOKE, stacks: [unit("mortar", 4, at(1, 5), native)] },
      {
        stacks: [0, 2, 4, 6, 8].map((r) => unit("orc-brute", 10, at(12, r))),
      },
    );
    let s = s0;
    for (const id of ["d0", "d1", "d2", "d3"])
      s = play(s, { type: "wait", stackId: id }).state;
    s = play(s, { type: "move", stackId: "d4", to: at(13, 8) }).state;
    expect(s.activeStackId).toBe("a0");
    for (const mode of MODES)
      expect(aim(s, chooseAiAction(s, { mode }))).toEqual(at(13, 8));
  });

  it("keeps its own stacks out of the splash", () => {
    // Two like Brute stacks; Tinkers hold the larger one in melee.
    const B = at(10, 3);
    const s = until(
      battle(
        {
          ...STOKE,
          stacks: [
            unit("mortar", 4, at(1, 5), native),
            unit("tinker", 20, stepHex(B, W), native),
          ],
        },
        {
          stacks: [unit("orc-brute", 12, B), unit("orc-brute", 10, at(10, 8))],
        },
      ),
      "a0",
    );
    for (const mode of MODES) {
      const a = chooseAiAction(s, { mode });
      const hex = aim(s, a);
      expect(hexDistance(hex, getStack(s, "a1").hex)).toBeGreaterThan(1);
      expect(hexDistance(hex, at(10, 8))).toBeLessThanOrEqual(1);
    }
  });

  it("a shell in the air is worth its Strikes, and nothing once its Mortars are dead", () => {
    const s = until(
      battle(
        { ...STOKE, stacks: [unit("mortar", 4, at(1, 5), native)] },
        { stacks: [unit("orc-brute", 10, at(12, 5))] },
      ),
      "a0",
    );
    const lobbed = applyAction(s, {
      type: "shoot",
      stackId: "a0",
      targetId: "d0",
    }).state;
    expect(pendingShells(lobbed)).toHaveLength(1);
    const unlobbed = { ...lobbed, scheduled: [] };
    expect(evaluateFor(lobbed, "attacker")).toBeGreaterThan(
      evaluateFor(unlobbed, "attacker") + 50,
    );
    // The Brutes see it too.
    expect(evaluateFor(lobbed, "defender")).toBeLessThan(
      evaluateFor(unlobbed, "defender") - 50,
    );
    const dud = (b: BattleState) => patchStack(b, "a0", { count: 0 });
    expect(evaluateFor(dud(lobbed), "defender")).toBeCloseTo(
      evaluateFor(dud(unlobbed), "defender"),
      6,
    );
  });
});

describe("stepping off a marked hex", () => {
  /** A shell lands on `hex` next round, lobbed by attacker stack a0. */
  function shelled(s: BattleState, hex: Hex): BattleState {
    return {
      ...s,
      scheduled: [
        ...s.scheduled,
        {
          id: 77,
          round: s.round + 1,
          phase: "start",
          effect: {
            id: "dwarves:shell",
            args: { stackId: "a0", hex: { col: hex.col, row: hex.row } },
          },
          source: "ability:lob",
          side: "attacker",
        },
      ],
    };
  }

  it("a stack still to act walks off the shell's hex and splash", () => {
    const B = at(12, 5);
    const s = shelled(
      battle(
        { ...STOKE, stacks: [unit("mortar", 6, at(0, 5), native)] },
        { stacks: [unit("orc-brute", 10, B)] },
      ),
      B,
    );
    expect(s.activeStackId).toBe("d0");
    for (const mode of MODES) {
      const a = chooseAiAction(s, { mode });
      const after = applyAction(s, a).state;
      expect(hexDistance(getStack(after, "d0").hex, B)).toBeGreaterThan(1);
    }
    // Staying put (a Defend) now costs about the shell's Strike.
    const gap = (b: BattleState): number => {
      const scored = scoreActions(b);
      const stay = scored.find((x) => x.action.type === "defend")?.score ?? 0;
      const off = Math.max(
        ...scored
          .filter(
            (x) => x.action.type === "move" && hexDistance(x.action.to, B) > 1,
          )
          .map((x) => x.score),
      );
      return off - stay;
    };
    const plain = { ...s, scheduled: [] };
    expect(gap(s)).toBeGreaterThan(gap(plain) + 50);
  });

  it("attacks from a hex outside the splash when one is free", () => {
    // Brutes beside Tinkers, a shell due on the Brutes' own hex.
    const B = at(8, 5);
    const s = until(
      shelled(
        battle(
          {
            ...STOKE,
            stacks: [
              unit("mortar", 6, at(0, 9), native),
              unit("tinker", 8, stepHex(B, W), native),
            ],
          },
          { stacks: [unit("orc-brute", 10, B)] },
        ),
        B,
      ),
      "d0",
    );
    for (const mode of MODES) {
      const a = chooseAiAction(s, { mode });
      expect(a).toMatchObject({ type: "attack", targetId: "a1" });
      if (a.type !== "attack") continue;
      expect(hexDistance(a.from, B)).toBeGreaterThan(1);
    }
    // The blow from where they stand now costs about the shell's Strike.
    const gap = (b: BattleState): number => {
      const scored = scoreActions(b).filter((x) => x.action.type === "attack");
      const from = (inside: boolean) =>
        Math.max(
          ...scored
            .filter(
              (x) =>
                x.action.type === "attack" &&
                hexDistance(x.action.from, B) > 1 !== inside,
            )
            .map((x) => x.score),
        );
      return from(false) - from(true);
    };
    const plain = { ...s, scheduled: [] };
    expect(gap(s)).toBeGreaterThan(gap(plain) + 50);
  });

  it("an own stack is worth less standing in its own shell's splash", () => {
    const X = at(10, 5);
    const s = shelled(
      battle(
        {
          ...STOKE,
          stacks: [
            unit("mortar", 6, at(0, 5), native),
            unit("tinker", 20, at(2, 2), native),
          ],
        },
        { stacks: [unit("orc-brute", 10, X)] },
      ),
      X,
    );
    const v = (h: Hex) => evaluateFor(moved(s, "a1", h), "attacker");
    expect(v(stepHex(X, W))).toBeLessThan(v(stepHex(stepHex(X, W), W)) - 20);
  });
});

describe("Turret", () => {
  it("an Ironclad with an enemy next to it still threatens its shot", () => {
    // One Brute (28 HP) beside it, twenty farther off: the shot at the
    // twenty is its best Strike whether or not the one stands next to it.
    const I = at(8, 5);
    const s = battle(
      {
        stacks: [
          unit("orc-brute", 1, stepHex(I, W)),
          unit("orc-brute", 20, at(0, 1)),
        ],
      },
      { ...STOKE, stacks: [unit("ironclad", 1, I, native)] },
    );
    const apart = moved(s, "a0", at(2, 9));
    expect(enemyThreat(s, "attacker")).toBeCloseTo(
      enemyThreat(apart, "attacker"),
      6,
    );
    // Without Turret, the Brute next to it holds it to a halved blow.
    const plain = without(s, "d0", "turret");
    expect(enemyThreat(plain, "attacker")).toBeLessThan(
      enemyThreat(s, "attacker") - 1,
    );
  });

  it("reaching an Ironclad does not count as silencing it", () => {
    const s = battle(
      { stacks: [unit("orc-brute", 20, at(4, 5))] },
      { ...STOKE, stacks: [unit("ironclad", 1, at(8, 5), native)] },
    );
    const plain = without(s, "d0", "turret");
    // The exposure term (a shooter reached loses its shots) is gone; the
    // Strike itself is the same.
    expect(ownThreat(plain, "attacker")).toBeGreaterThan(
      ownThreat(s, "attacker") + 1,
    );
  });
});

describe("Spotter and Rotors", () => {
  const board = (gyro: Hex): BattleState =>
    battle(
      {
        ...STOKE,
        stacks: [
          unit("rivet-gunner", 15, at(0, 5), native),
          unit("gyrocopter", 8, gyro, native),
        ],
      },
      { stacks: [unit("orc-brute", 10, at(9, 5))] },
    );

  it("the Gunners' threat on a stack is x 125% while a Gyrocopter stands beside it", () => {
    const beside = board(at(8, 5));
    const away = board(at(3, 1));
    const spot = (b: BattleState) =>
      ownThreat(b, "attacker") -
      ownThreat(without(b, "a1", "spotter"), "attacker");
    expect(spot(away)).toBeCloseTo(0, 6);
    expect(spot(beside)).toBeGreaterThan(10);
  });

  it("within one decision, a Gyrocopter's landing beside the target counts", () => {
    // The fast estimate of the Gyrocopters' flight: beside the Brutes
    // (spotting them for the Gunners) against two hexes off.
    const s = board(at(2, 5));
    expect(s.activeStackId).toBe("a1");
    const flights = (b: BattleState): number => {
      const [beside, off] = placedEstimates(b, [at(8, 5), at(7, 5)]);
      return (beside as number) - (off as number);
    };
    expect(flights(s)).toBeGreaterThan(
      flights(without(s, "a1", "spotter")) + 5,
    );
  });

  it("a Gyrocopter flies over to an enemy shooter to stop it and spot it", () => {
    const s = until(
      battle(
        {
          ...STOKE,
          stacks: [
            unit("gyrocopter", 8, at(2, 5), native),
            unit("rivet-gunner", 15, at(0, 5), native),
          ],
        },
        {
          stacks: [
            unit("orc-brute", 10, at(7, 5)),
            unit("bomb-chucker", 14, at(7, 2)),
          ],
        },
      ),
      "a0",
    );
    for (const mode of MODES) {
      const after = applyAction(s, chooseAiAction(s, { mode })).state;
      expect(
        isAdjacent(getStack(after, "a0").hex, getStack(after, "d1").hex),
      ).toBe(true);
    }
  });

  it("the fast estimate matches the evaluation with a spotter, shells and a Turret", () => {
    const s0 = battle(
      {
        ...STOKE,
        stacks: [
          unit("gyrocopter", 8, at(2, 5), native),
          unit("rivet-gunner", 15, at(0, 5), native),
          unit("mortar", 4, at(0, 8), native),
        ],
      },
      {
        ...STOKE,
        stacks: [
          unit("orc-brute", 10, at(9, 5)),
          unit("ironclad", 1, at(12, 2), native),
          unit("mortar", 3, at(14, 8), native),
        ],
      },
    );
    let s = until(s0, "a2");
    s = applyAction(s, { type: "shootHex", stackId: "a2", at: at(8, 4) }).state;
    // The defenders' Mortars lob back, onto the Gunners.
    s = until(s, "d2");
    s = applyAction(s, { type: "shoot", stackId: "d2", targetId: "a1" }).state;
    expect(pendingShells(s)).toHaveLength(2);
    s = until(s, "a0");
    const hexes = [at(3, 5), at(8, 5), at(8, 4), at(11, 2), at(1, 4)];
    for (const side of [s, steam(s, "d0", 2)]) {
      const fast = placedEstimates(side, hexes);
      hexes.forEach((h, i) => {
        expect(fast[i]).toBeCloseTo(
          evaluateFor(moved(side, "a0", h), "attacker"),
          6,
        );
      });
    }
  });
});

describe("Patch Up", () => {
  const C = at(6, 5);
  const yard = (topHp: number, count: number): BattleState =>
    patchStack(
      until(
        battle(
          {
            ...STOKE,
            stacks: [
              unit("steam-tank", 3, stepHex(C, E), native),
              unit("tinker", 20, stepHex(C, 1), native),
            ],
          },
          { stacks: [unit("orc-brute", 6, at(14, 1))] },
        ),
        "a1",
      ),
      "a0",
      { count, topHp },
    );

  it("the Tinkers repair a damaged machine, reviving", () => {
    const s = yard(30, 1);
    for (const mode of MODES) {
      const a = chooseAiAction(s, { mode });
      expect(a).toMatchObject({
        type: "ability",
        ability: "patch-up",
        targets: [{ stack: "a0" }],
      });
      expect(getStack(applyAction(s, a).state, "a0").count).toBe(2);
    }
  });

  it("not on a machine that has lost nothing", () => {
    const s = yard(90, 3);
    for (const mode of MODES)
      expect(chooseAiAction(s, { mode }).type).not.toBe("ability");
  });
});

describe("the Commands", () => {
  it("Ramming Speed delivers stoked Steam Tanks to the enemy's shooters", () => {
    const s = steam(
      until(
        battle(
          {
            ...STOKE,
            hero: {
              attack: 1,
              defense: 3,
              command: "ramming-speed",
              commandC: 1,
            },
            stacks: [
              unit("steam-tank", 2, at(3, 5), native),
              unit("tinker", 20, at(0, 1), native),
            ],
          },
          {
            stacks: [
              unit("bomb-chucker", 14, at(8, 5)),
              unit("orc-brute", 6, at(13, 9)),
            ],
          },
        ),
        "a0",
      ),
      "a0",
      2,
    );
    for (const mode of MODES) {
      const a = heroAct(chooseAiAction(s, { mode }));
      expect(a.act).toBe("ramming-speed");
      expect(a.targets).toEqual([{ stack: "a0" }, { stack: "d0" }]);
    }
  });

  const pressure = (friend: boolean): BattleState => {
    const C = at(6, 5);
    return steam(
      until(
        battle(
          {
            ...STOKE,
            hero: {
              attack: 1,
              defense: 1,
              command: "overpressure",
              commandC: 2,
            },
            stacks: [
              unit("tinker", 20, C, native),
              ...(friend
                ? [
                    unit("rivet-gunner", 20, stepHex(C, 5), native),
                    unit("gyrocopter", 10, stepHex(C, 4), native),
                  ]
                : []),
            ],
          },
          {
            stacks: [
              unit("orc-brute", 6, stepHex(C, E)),
              unit("orc-brute", 6, stepHex(C, W)),
            ],
          },
        ),
        "a0",
      ),
      "a0",
      3,
    );
  };

  it("Blow Off Steam beside two enemy stacks", () => {
    for (const mode of MODES) {
      const a = heroAct(chooseAiAction(pressure(false), { mode }));
      expect(a.act).toBe("overpressure");
      expect(a.targets).toEqual([{ stack: "a0" }]);
    }
  });

  it("not when the blast costs its own Gunners and Gyrocopters more", () => {
    for (const mode of MODES) {
      const a = chooseAiAction(pressure(true), { mode });
      expect(a.type === "heroAct" && a.act === "overpressure").toBe(false);
    }
  });
});

describe("playing against the Deepforge", () => {
  it("Brutes hit the unstoked Tinkers, not the stoked ones", () => {
    const C = at(6, 5);
    const s = until(
      battle(
        {
          ...STOKE,
          stacks: [
            unit("tinker", 20, stepHex(C, E), native),
            unit("tinker", 20, stepHex(C, W), native),
          ],
        },
        { stacks: [unit("orc-brute", 12, C)] },
      ),
      "d0",
    );
    for (const [stoked, other] of [
      ["a0", "a1"],
      ["a1", "a0"],
    ] as const)
      for (const mode of MODES)
        expect(chooseAiAction(steam(s, stoked, 3), { mode })).toMatchObject({
          type: "attack",
          targetId: other,
        });
  });

  it("a hero Sets Off a stoked stack's Steam", () => {
    const s = steam(
      battle(
        {
          hero: { attack: 1, defense: 1 },
          magic: {
            power: 2,
            mana: 30,
            schoolRanks: { bloom: 0, accord: 0, clock: 0, hush: 0, storm: 2 },
            pages: ["set-off"],
          },
          stacks: [unit("orc-brute", 12, at(1, 5))],
        },
        {
          ...STOKE,
          stacks: [
            unit("steam-tank", 2, at(12, 5), native),
            unit("tinker", 15, at(12, 2), native),
          ],
        },
      ),
      "d0",
      3,
    );
    expect(s.activeStackId).toBe("a0");
    for (const mode of MODES) {
      const a = heroAct(chooseAiAction(s, { mode }));
      expect(a.act).toBe("set-off");
      expect(a.targets).toEqual([{ stack: "d0", condition: 950 }]);
    }
  });
});

describe("Steam as Fuel", () => {
  it("an Accord page on a stoked stack burns its Steam as Fuel", () => {
    const s = steam(
      battle(
        {
          hero: { attack: 1, defense: 1 },
          magic: {
            power: 2,
            mana: 30,
            schoolRanks: { bloom: 0, accord: 2, clock: 0, hush: 0, storm: 0 },
            pages: ["soft-words"],
          },
          stacks: [unit("orc-brute", 12, at(1, 5))],
        },
        {
          ...STOKE,
          stacks: [unit("steam-tank", 2, at(12, 5), native)],
        },
      ),
      "d0",
      3,
    );
    expect(s.activeStackId).toBe("a0");
    for (const mode of MODES) {
      const a = heroAct(chooseAiAction(s, { mode }));
      expect(a.act).toBe("soft-words");
      expect(a.targets).toEqual([{ stack: "d0" }]);
      expect(a.fuel).toEqual({ stack: "d0", condition: 950 });
      expect(steamOf(applyAction(s, a).state, "d0")).toBe(0);
    }
  });
});

describe("creature data the AI reads", () => {
  it("the Deepforge's AI hints sit on its abilities", () => {
    expect(stats("mortar").abilities).toContain("lob");
    expect(stats("gyrocopter").abilities).toContain("spotter");
    expect(stats("steam-tank").abilities).toContain("ram");
  });
});
