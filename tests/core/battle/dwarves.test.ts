/**
 * The Deepforge's battle rules on hand-built battles (FACTION_DWARVES.md
 * sections 3, 5, 5.1, 6, 7 and 9): Steam and Stoke, Lob's shells, Ram,
 * Turret, Rotors, Spotter, Hot Rivets, Patch Up, the Drills, The Great
 * Boiler and both Commands; and one battle with Deepforge armies. The
 * Pocket Boiler and Scalding are hero rules (hero-rules.test.ts).
 */

import { describe, expect, it } from "vitest";
import {
  actionError,
  canShoot,
  canWait,
  getStack,
  groundAt,
  hexDistance,
  legalActions,
  pendingShells,
  previewAttack,
  reachableHexes,
  runAutoBattle,
  stepHex,
  teleportsToWalk,
} from "../../../src/core/battle/index.ts";
import type {
  AttackAction,
  BattleAction,
  BattleEvent,
  BattleState,
  GroundFeature,
  Hex,
} from "../../../src/core/battle/index.ts";
import { at, battle, kinds, stats, strikes, unit } from "./faction-helpers.ts";
import { cond, patchStack, play, withFx } from "./helpers.ts";

const STOKE = { birthright: "stoke" };
const native = { native: true };
const E = 0; // hex direction east
const W = 3; // hex direction west
const C = at(5, 5);

/**
 * Plays the other stacks' turns until `id` is active: each Waits while it
 * may, else Defends (none of them stoke).
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

/** Every stack Defends until round `n` starts; returns the events too. */
function toRound(
  s: BattleState,
  n: number,
): { state: BattleState; events: BattleEvent[] } {
  let cur = s;
  const events: BattleEvent[] = [];
  for (let i = 0; i < 80 && cur.round < n && cur.winner === null; i++) {
    const step = play(cur, {
      type: "defend",
      stackId: cur.activeStackId as string,
    });
    events.push(...step.events);
    cur = step.state;
  }
  expect(cur.round).toBe(n);
  return { state: cur, events };
}

function steam(s: BattleState, id: string, size: number): BattleState {
  return patchStack(s, id, {
    conditions: [
      ...getStack(s, id).conditions,
      cond("steam", { size, maxSize: 3, clock: null }, 950),
    ],
  });
}

function steamOf(s: BattleState, id: string): number | null {
  return (
    getStack(s, id).conditions.find((c) => c.kind === "steam")?.size ?? null
  );
}

function percents(p: ReturnType<typeof previewAttack>): number[] {
  return p.strike?.breakdown.abilityMultipliers.map((m) => m.percent) ?? [];
}

function wreck(hex: Hex): GroundFeature {
  return {
    hex,
    kind: "wreck",
    class: "remains",
    school: null,
    size: 0,
    clock: null,
    remains: { creature: stats("mortar"), owner: "attacker", initialCount: 2 },
    source: "dead",
  };
}

describe("Steam (FACTION_DWARVES 3)", () => {
  // Doc 6.1: three Steam Tanks with Steam 2 and a Thane (Attack 1,
  // Defense 3) against 20 Orc Brutes.
  const tanks = () =>
    until(
      battle(
        {
          hero: { attack: 1, defense: 3 },
          stacks: [unit("steam-tank", 3, C)],
        },
        { stacks: [unit("orc-brute", 20, stepHex(C, E))] },
      ),
      "a0",
    );
  const attack: AttackAction = {
    type: "attack",
    stackId: "a0",
    targetId: "d0",
    from: C,
  };

  it("Steam 2 doubles the attack, then ends (doc 6.1: 117, 4 kills)", () => {
    const plain = previewAttack(tanks(), attack);
    expect([plain.damage, plain.kills]).toEqual([58, 2]);
    // ... and the retaliation the Tanks would then take: 69, no kill.
    expect([plain.retaliationDamage, plain.retaliationKills]).toEqual([69, 0]);
    const s = steam(tanks(), "a0", 2);
    const p = previewAttack(s, attack);
    expect(percents(p)).toEqual([200]);
    expect([p.damage, p.kills]).toEqual([117, 4]);
    const after = play(s, attack).state;
    expect(steamOf(after, "a0")).toBeNull();
    const brutes = getStack(after, "d0");
    expect([brutes.count, brutes.topHp]).toEqual([16, 23]);
  });

  it("Steam 1 is x 150% and Steam 3 x 250%; a shot spends it too", () => {
    expect(percents(previewAttack(steam(tanks(), "a0", 1), attack))).toEqual([
      150,
    ]);
    expect(percents(previewAttack(steam(tanks(), "a0", 3), attack))).toEqual([
      250,
    ]);
    const s = steam(
      battle(
        { stacks: [unit("rivet-gunner", 10, at(1, 5))] },
        { stacks: [unit("orc-brute", 5, at(12, 5))] },
      ),
      "a0",
      1,
    );
    const shoot: AttackAction = {
      type: "shoot",
      stackId: "a0",
      targetId: "d0",
    };
    const ready = until(s, "a0");
    expect(percents(previewAttack(ready, shoot))).toEqual([150]);
    expect(steamOf(play(ready, shoot).state, "a0")).toBeNull();
  });

  it("is spent by a retaliation: the stoked stack hits back harder", () => {
    const s = battle(
      { stacks: [unit("orc-brute", 10, C)] },
      { stacks: [unit("tinker", 20, stepHex(C, E))] },
    );
    const hit: AttackAction = {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: C,
    };
    const plain = previewAttack(s, hit);
    const stoked = previewAttack(steam(s, "d0", 2), hit);
    expect(stoked.retaliation?.breakdown.abilityMultipliers).toEqual([
      expect.objectContaining({ source: "steam", percent: 200 }),
    ]);
    expect(stoked.retaliationDamage).toBeGreaterThanOrEqual(
      2 * plain.retaliationDamage,
    );
    // The attack itself is not multiplied: the Steam is the Tinkers'.
    expect(stoked.damage).toBe(plain.damage);
    const after = play(steam(s, "d0", 2), hit).state;
    expect(steamOf(after, "d0")).toBeNull();
  });

  it("never cools: it is still there rounds later", () => {
    const s = steam(
      battle(
        { stacks: [unit("tinker", 5, at(1, 5))] },
        { stacks: [unit("orc-brute", 5, at(13, 5))] },
      ),
      "a0",
      2,
    );
    const { state } = toRound(s, 4);
    expect(steamOf(state, "a0")).toBe(2);
    expect(
      getStack(state, "a0").conditions.find((c) => c.kind === "steam")?.clock,
    ).toBeNull();
  });
});

describe("Stoke (birthright)", () => {
  it("a native's Defend grows Steam by 1 a time, to at most 3; guests only Defend", () => {
    let s = battle(
      {
        ...STOKE,
        stacks: [
          unit("tinker", 10, at(1, 3), native),
          unit("tinker", 10, at(1, 7)),
        ],
      },
      { stacks: [unit("orc-brute", 5, at(13, 5))] },
    );
    const seen: (number | null)[] = [];
    for (let round = 2; round <= 5; round++) {
      s = toRound(s, round).state;
      seen.push(steamOf(s, "a0"));
      expect(steamOf(s, "a1")).toBeNull();
    }
    expect(seen).toEqual([1, 2, 3, 3]);
  });

  it("Stoke is a Defend: the stack also gets the Defend's +30% Defense", () => {
    const s = battle(
      { ...STOKE, stacks: [unit("steam-tank", 2, C, native)] },
      { stacks: [unit("orc-brute", 5, at(13, 5))] },
    );
    const ready = until(s, "a0");
    const { state, events } = play(ready, { type: "defend", stackId: "a0" });
    expect(getStack(state, "a0").defending).toBe(true);
    expect(steamOf(state, "a0")).toBe(1);
    expect(
      events.find(
        (e) => e.type === "condition" && e.condition.kind === "steam",
      ),
    ).toMatchObject({ change: "landed", rule: "ability:stoke" });
  });
});

describe("Ram (Steam Tank)", () => {
  it("throws the target 1 hex back per point of the Steam spent: no retaliation", () => {
    const s = until(
      steam(
        battle(
          { stacks: [unit("steam-tank", 3, C)] },
          { stacks: [unit("orc-brute", 20, stepHex(C, E))] },
        ),
        "a0",
        2,
      ),
      "a0",
    );
    const { state, events } = play(s, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: C,
    });
    expect(getStack(state, "d0").hex).toEqual(at(8, 5));
    expect(events.some((e) => e.type === "retaliation")).toBe(false);
  });

  it("without Steam, no push; a blocked target that stays next to it retaliates", () => {
    const plain = until(
      battle(
        { stacks: [unit("steam-tank", 3, C)] },
        { stacks: [unit("orc-brute", 20, stepHex(C, E))] },
      ),
      "a0",
    );
    const a = play(plain, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: C,
    });
    expect(getStack(a.state, "d0").hex).toEqual(stepHex(C, E));
    expect(a.events.some((e) => e.type === "retaliation")).toBe(true);
    const blocked = until(
      steam(
        battle(
          { stacks: [unit("steam-tank", 3, C)] },
          {
            stacks: [
              unit("orc-brute", 20, stepHex(C, E)),
              unit("orc-brute", 5, stepHex(stepHex(C, E), E)),
            ],
          },
        ),
        "a0",
        2,
      ),
      "a0",
    );
    const b = play(blocked, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: C,
    });
    expect(getStack(b.state, "d0").hex).toEqual(stepHex(C, E));
    expect(b.events.some((e) => e.type === "retaliation")).toBe(true);
  });
});

describe("Lob (Mortar)", () => {
  // The Mortars at (1, 5); enemy Tanks at T and east of it; a friendly
  // Gyrocopter west of T (it spots, and it is in the splash).
  const T = at(10, 5);
  const lobBattle = (extra: string[] = []) =>
    battle(
      {
        stacks: [
          unit("mortar", 4, at(1, 5), { extra }),
          unit("gyrocopter", 3, stepHex(T, W)),
        ],
      },
      {
        stacks: [
          unit("steam-tank", 2, T),
          unit("steam-tank", 1, stepHex(T, E)),
        ],
      },
    );
  const lob: BattleAction = { type: "shootHex", stackId: "a0", at: T };

  it("uses a shot and schedules a shell for the next round start; nothing is hit yet", () => {
    const ready = until(lobBattle(), "a0");
    expect(actionError(ready, lob)).toBeNull();
    const { state, events } = play(ready, lob);
    expect(events.filter((e) => e.type === "damage")).toEqual([]);
    expect(getStack(state, "a0").shotsLeft).toBe(5);
    expect(pendingShells(state)).toEqual([
      expect.objectContaining({ round: 2, stackId: "a0", hex: T }),
    ]);
    // A shot at a stack is lobbed at its hex too.
    const shot = play(ready, { type: "shoot", stackId: "a0", targetId: "d1" });
    expect(pendingShells(shot.state)[0]?.hex).toEqual(stepHex(T, E));
  });

  it("lands before any stack acts: a shot on the hex, half on every stack next to it, friend or foe", () => {
    const after = play(until(lobBattle(), "a0"), lob).state;
    const { state, events } = toRound(after, 2);
    const fired = events.findIndex(
      (e) => e.type === "schedule" && e.change === "fired",
    );
    const turn2 = events.findIndex(
      (e, i) => i > fired && e.type === "turnStart",
    );
    const landing = events.slice(fired, turn2);
    const hits = strikes(landing);
    expect(hits.map((h) => [h[0], h[1], h[2]])).toEqual([
      ["a0", "d0", "shot"],
      ["a0", "a1", "shot"],
      ["a0", "d1", "shot"],
    ]);
    const mults = landing.flatMap((e) =>
      e.type === "damage"
        ? [[e.targetId, e.breakdown.abilityMultipliers.map((m) => m.percent)]]
        : [],
    );
    // The centre is spotted by the Gyrocopters beside it; the splash is
    // x 50%, and the Gyrocopters do not spot themselves.
    expect(mults).toEqual([
      ["d0", [125]],
      ["a1", [50]],
      ["d1", [50]],
    ]);
    expect(pendingShells(state)).toEqual([]);
    // Shots are never retaliated.
    expect(landing.some((e) => e.type === "retaliation")).toBe(false);
  });

  it("a stack still to act can step off the hex: only the splash lands", () => {
    const after = play(until(lobBattle(), "a0"), lob).state;
    // The defenders act after the Mortars (attacker first at Speed 3).
    const moved = play(until(after, "d0"), {
      type: "move",
      stackId: "d0",
      to: at(12, 4),
    }).state;
    const { events } = toRound(moved, 2);
    const hits = strikes(events).map((h) => h[1]);
    expect(hits).toEqual(["a1", "d1"]);
  });

  it("is a dud when the Mortars are dead by then", () => {
    const after = play(until(lobBattle(), "a0"), lob).state;
    const dead = withFx(after, (fx) => void fx.harm("a0", 10000)).state;
    expect(getStack(dead, "a0").count).toBe(0);
    const { events } = toRound(dead, 2);
    expect(
      events.some((e) => e.type === "schedule" && e.change === "fired"),
    ).toBe(true);
    expect(strikes(events)).toEqual([]);
  });

  it("spends the Mortars' Steam when it lands, on every Strike of the shell", () => {
    const after = play(until(steam(lobBattle(), "a0", 1), "a0"), lob).state;
    expect(steamOf(after, "a0")).toBe(1);
    const { state, events } = toRound(after, 2);
    const mults = events.flatMap((e) =>
      e.type === "damage"
        ? [e.breakdown.abilityMultipliers.map((m) => m.percent).sort()]
        : [],
    );
    expect(mults).toEqual([
      [125, 150],
      [150, 50],
      [150, 50],
    ]);
    expect(steamOf(state, "a0")).toBeNull();
  });

  it("Incendiary Shells: the hex catches fire of the Mortars' count, clock 2", () => {
    const after = play(
      until(lobBattle(["incendiary-shells"]), "a0"),
      lob,
    ).state;
    const { state } = toRound(after, 2);
    expect(groundAt(state, T)).toMatchObject({
      kind: "fire",
      size: 4,
      clock: 2,
    });
    const plain = toRound(play(until(lobBattle(), "a0"), lob).state, 2).state;
    expect(groundAt(plain, T)).toBeNull();
  });
});

describe("Spotter, Rotors and Turret", () => {
  it("Spotter: friendly shots at a stack next to the Gyrocopters are x 125%, once", () => {
    const D = at(10, 5);
    const s = battle(
      {
        stacks: [
          unit("rivet-gunner", 10, at(1, 5)),
          unit("gyrocopter", 2, stepHex(D, W)),
          unit("gyrocopter", 2, stepHex(D, 1)),
        ],
      },
      {
        stacks: [
          unit("orc-brute", 10, D),
          unit("gyrocopter", 2, stepHex(D, E)),
          unit("orc-brute", 10, at(13, 1)),
        ],
      },
    );
    const ready = until(s, "a0");
    const shoot = (t: string): AttackAction => ({
      type: "shoot",
      stackId: "a0",
      targetId: t,
    });
    const p = previewAttack(ready, shoot("d0"));
    expect(p.strike?.breakdown.abilityMultipliers).toEqual([
      expect.objectContaining({ source: "spotter", percent: 125 }),
    ]);
    // Not spotted: a stack beside no friendly Gyrocopter.
    expect(percents(previewAttack(ready, shoot("d2")))).toEqual([]);
  });

  it("Rotors: the Gyrocopters fly over whatever is in the way", () => {
    const s = battle(
      {
        stacks: [
          unit("gyrocopter", 3, C),
          ...[0, 1, 2, 3, 4, 5].map((d) => unit("tinker", 2, stepHex(C, d))),
        ],
      },
      { stacks: [unit("orc-brute", 5, at(13, 5))] },
    );
    const g = getStack(s, "a0");
    expect(teleportsToWalk(g)).toBe(true);
    expect(reachableHexes(s, "a0").get(9 + 5 * 15)).toBe(4);
    const { state } = play(until(s, "a0"), {
      type: "move",
      stackId: "a0",
      to: at(9, 5),
    });
    expect(getStack(state, "a0").hex).toEqual(at(9, 5));
  });

  it("Turret: the Ironclads shoot with an enemy next to them, and melee at full strength", () => {
    const s = battle(
      {
        stacks: [unit("ironclad", 1, C), unit("rivet-gunner", 10, at(5, 9))],
      },
      {
        stacks: [
          unit("orc-brute", 10, stepHex(C, E)),
          unit("orc-brute", 10, stepHex(at(5, 9), E)),
          unit("orc-brute", 10, at(13, 1)),
        ],
      },
    );
    const ready = until(s, "a0");
    expect(canShoot(ready, "a0")).toBe(true);
    const shots = legalActions(ready).filter((a) => a.type === "shoot");
    expect(shots.map((a) => a.type === "shoot" && a.targetId)).toEqual([
      "d0",
      "d1",
      "d2",
    ]);
    const melee = previewAttack(ready, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: C,
    });
    expect(melee.strike?.breakdown.rangedInMelee).toBe(false);
    // A shooter without Turret: no shot, melee halved.
    const gunners = until(ready, "a1");
    expect(canShoot(gunners, "a1")).toBe(false);
    const g = previewAttack(gunners, {
      type: "attack",
      stackId: "a1",
      targetId: "d1",
      from: at(5, 9),
    });
    expect(g.strike?.breakdown.rangedInMelee).toBe(true);
  });
});

describe("Hot Rivets and Red-Hot Rivets (Rivet Gunner)", () => {
  const range = (count: number, extra: string[] = []) =>
    until(
      battle(
        { stacks: [unit("rivet-gunner", count, at(1, 5), { extra })] },
        { stacks: [unit("orc-brute", 30, at(12, 5))] },
      ),
      "a0",
    );
  const shoot: AttackAction = { type: "shoot", stackId: "a0", targetId: "d0" };
  const burning = (s: BattleState) =>
    getStack(s, "d0").conditions.find((c) => c.kind === "burning");

  it("Hot Rivets: Burning of half the Gunners (at least 1, at most 15) for 2 rounds", () => {
    expect(burning(play(range(15), shoot).state)).toMatchObject({
      size: 7,
      clock: 2,
    });
    expect(burning(play(range(1), shoot).state)?.size).toBe(1);
    expect(burning(play(range(40), shoot).state)?.size).toBe(15);
  });

  it("Red-Hot Rivets: x 125% on a Burning stack or one in fire", () => {
    const hot = range(10, ["red-hot-rivets"]);
    expect(percents(previewAttack(hot, shoot))).toEqual([]);
    const lit = patchStack(hot, "d0", {
      conditions: [cond("burning", { size: 3, clock: 2 })],
    });
    expect(percents(previewAttack(lit, shoot))).toEqual([125]);
    const fire: GroundFeature = {
      hex: at(12, 5),
      kind: "fire",
      class: "hazard",
      school: "storm",
      size: 3,
      clock: 2,
      remains: null,
      source: "test",
    };
    expect(
      percents(previewAttack({ ...hot, ground: [...hot.ground, fire] }, shoot)),
    ).toEqual([125]);
    // Without the Drill, Burning gives no bonus.
    const plain = patchStack(range(10), "d0", {
      conditions: [cond("burning", { size: 3, clock: 2 })],
    });
    expect(percents(previewAttack(plain, shoot))).toEqual([]);
  });
});

describe("Patch Up and Salvage (Tinker)", () => {
  // Tinkers at C, a damaged Steam Tank east of them (2 of 3 left, top 30).
  const shop = (extra: string[] = [], ground: GroundFeature[] = []) =>
    patchStack(
      battle(
        {
          stacks: [
            unit("tinker", 20, C, { extra }),
            unit("steam-tank", 2, stepHex(C, E), { topHp: 30 }),
            unit("tinker", 5, stepHex(C, W)),
          ],
        },
        {
          stacks: [
            unit("steam-tank", 2, stepHex(C, 1)),
            unit("orc-brute", 5, at(13, 5)),
          ],
        },
        ground,
      ),
      "a1",
      { initialCount: 3 },
    );
  const patch = (target: string): BattleAction => ({
    type: "ability",
    stackId: "a0",
    ability: "patch-up",
    targets: [{ stack: target }],
  });

  it("heals an adjacent friendly machine 4 per Tinker, reviving", () => {
    const ready = until(shop(), "a0");
    const { state, events } = play(ready, patch("a1"));
    // 80: the top to 90 (60), then one Tank back with 20.
    expect(events.find((e) => e.type === "heal")).toMatchObject({
      amount: 80,
      revived: 1,
    });
    const t = getStack(state, "a1");
    expect([t.count, t.topHp]).toEqual([3, 20]);
  });

  it("reaches only friendly machines next to the Tinkers", () => {
    const ready = until(shop(), "a0");
    expect(actionError(ready, patch("a2"))).toBe(
      "only a machine can be patched up",
    );
    expect(actionError(ready, patch("d0"))).toBe("choose a friendly machine");
  });

  it("once per battle, unless Salvage finds a wreck on or next to the Tinkers", () => {
    const used = play(until(shop(), "a0"), patch("a1")).state;
    const next = until(toRound(used, 2).state, "a0");
    expect(actionError(next, patch("a1"))).toBe(
      "this ability is used for the battle",
    );
    // With Salvage but no wreck near.
    const salv = play(until(shop(["salvage"]), "a0"), patch("a1")).state;
    const again = until(toRound(salv, 2).state, "a0");
    expect(actionError(again, patch("a1"))).toBe(
      "Salvage needs a wreck on or next to the Tinkers",
    );
    // A wreck next to them: allowed, and the wreck is consumed.
    const W2 = stepHex(C, 5);
    const withWreck = { ...again, ground: [...again.ground, wreck(W2)] };
    expect(actionError(withWreck, patch("a1"))).toBeNull();
    const { state } = play(withWreck, patch("a1"));
    expect(groundAt(state, W2)).toBeNull();
    expect(
      getStack(state, "a0").abilitiesUsed.filter((a) => a === "patch-up"),
    ).toHaveLength(2);
  });

  it("a machine is a stack that leaves a wreck, native or not", () => {
    for (const id of [
      "gyrocopter",
      "mortar",
      "steam-tank",
      "ironclad",
    ] as const)
      expect(stats(id).tags?.remains, id).toBe("wreck");
    for (const id of ["tinker", "rivet-gunner"] as const)
      expect(stats(id).tags?.remains, id).toBe("corpse");
    // A stray Tin Titan is a machine too.
    expect(stats("tin-titan").tags?.remains).toBe("wreck");
  });
});

describe("The Great Boiler", () => {
  it("starts the stacks that carry it with Steam 1", () => {
    const s = battle(
      {
        stacks: [
          unit("tinker", 10, at(1, 1), { extra: ["the-great-boiler"] }),
          unit("steam-tank", 1, at(1, 5), { extra: ["the-great-boiler"] }),
          unit("tinker", 10, at(1, 9)),
        ],
      },
      { stacks: [unit("orc-brute", 3, at(13, 5))] },
    );
    expect(steamOf(s, "a0")).toBe(1);
    expect(steamOf(s, "a1")).toBe(1);
    expect(kinds(s, "a2")).toEqual([]);
  });
});

describe("Commands", () => {
  it("Ramming Speed: pushed in a line until it stops next to the enemy, then an unanswered Strike", () => {
    // Doc 6.3: 16 guest Goblins five hexes from 14 Bomb Chuckers, C = 1.
    const s = battle(
      {
        hero: { attack: 1, defense: 3, command: "ramming-speed", commandC: 1 },
        stacks: [unit("goblin", 16, at(2, 5)), unit("tinker", 5, at(2, 9))],
      },
      {
        stacks: [
          unit("bomb-chucker", 14, at(7, 5)),
          unit("bomb-chucker", 5, at(9, 9)),
        ],
      },
    );
    const ram = (friend: string, enemy: string): BattleAction => ({
      type: "heroAct",
      stackId: s.activeStackId as string,
      act: "ramming-speed",
      targets: [{ stack: friend }, { stack: enemy }],
    });
    expect(hexDistance(at(2, 5), at(7, 5))).toBe(5);
    expect(actionError(s, ram("a1", "d1"))).toBe("they must be within 5 hexes");
    expect(actionError(s, ram("a0", "d1"))).toBe(
      "they must be in a straight hex line",
    );
    expect(actionError(s, ram("d0", "a0"))).toBe("the first must be friendly");
    const { state, events } = play(s, ram("a0", "d0"));
    expect(getStack(state, "a0").hex).toEqual(at(6, 5));
    const hits = strikes(events);
    // The Command's Strike (A 5, D 3: 35, 2 kills), then the Goblins'
    // Cannonball for the 4 hexes; no retaliation.
    expect(hits[0]).toEqual(["a0", "d0", "special", 35, 2]);
    expect(hits[1]?.slice(0, 3)).toEqual(["a0", "d0", "special"]);
    expect(events.some((e) => e.type === "retaliation")).toBe(false);
  });

  it("Ramming Speed delivers a stoked Steam Tank: the Steam is spent and Ram throws the target", () => {
    const s = until(
      steam(
        battle(
          {
            hero: {
              attack: 0,
              defense: 0,
              command: "ramming-speed",
              commandC: 1,
            },
            stacks: [unit("steam-tank", 2, at(2, 5))],
          },
          { stacks: [unit("orc-brute", 10, at(6, 5))] },
        ),
        "a0",
        2,
      ),
      "a0",
    );
    const { state, events } = play(s, {
      type: "heroAct",
      stackId: s.activeStackId as string,
      act: "ramming-speed",
      targets: [{ stack: "a0" }, { stack: "d0" }],
    });
    const hit = events.find((e) => e.type === "damage");
    expect(
      hit?.type === "damage" &&
        hit.breakdown.abilityMultipliers.map((m) => m.percent),
    ).toEqual([200]);
    expect(steamOf(state, "a0")).toBeNull();
    expect(getStack(state, "a0").hex).toEqual(at(5, 5));
    expect(getStack(state, "d0").hex).toEqual(at(8, 5));
  });

  it("Overpressure: the Steam ends and every other stack next to it takes 15 x C x its size", () => {
    const s = steam(
      battle(
        {
          hero: { attack: 0, defense: 0, command: "overpressure", commandC: 2 },
          stacks: [
            unit("tinker", 10, C),
            unit("steam-tank", 2, stepHex(C, 1)),
            unit("tinker", 10, at(1, 1)),
          ],
        },
        {
          stacks: [
            unit("orc-brute", 10, stepHex(C, E)),
            unit("orc-brute", 10, stepHex(C, W)),
            unit("orc-brute", 10, at(13, 1)),
          ],
        },
      ),
      "a0",
      3,
    );
    const blow = (t: string): BattleAction => ({
      type: "heroAct",
      stackId: s.activeStackId as string,
      act: "overpressure",
      targets: [{ stack: t }],
    });
    expect(actionError(s, blow("a2"))).toBe("the stack must bear Steam");
    const { state, events } = play(s, blow("a0"));
    expect(steamOf(state, "a0")).toBeNull();
    const harms = events.flatMap((e) =>
      e.type === "harm" ? [[e.targetId, e.harm]] : [],
    );
    expect(harms).toEqual([
      ["a1", 90],
      ["d0", 90],
      ["d1", 90],
    ]);
    expect(getStack(state, "a0").count).toBe(10);
  });
});

describe("A battle with Deepforge armies", () => {
  it("plays to the end with the faction's rules in it (seed 7, one battle)", () => {
    const boiler = { extra: ["the-great-boiler"], native: true };
    const deepforge = {
      hero: { attack: 1, defense: 3, command: "ramming-speed", commandC: 1 },
      birthright: "stoke",
      stacks: [
        unit("tinker", 20, at(0, 0), boiler),
        unit("rivet-gunner", 10, at(0, 2), boiler),
        unit("gyrocopter", 6, at(0, 4), boiler),
        unit("mortar", 4, at(0, 6), boiler),
        unit("steam-tank", 2, at(0, 8), boiler),
        unit("ironclad", 1, at(0, 10), boiler),
      ],
    };
    const horde = {
      hero: { attack: 2, defense: 1 },
      birthright: "launched",
      stacks: [
        unit("goblin", 30, at(14, 0), native),
        unit("bomb-chucker", 10, at(14, 2), native),
        unit("wolf-rider", 6, at(14, 4), native),
        unit("ogre", 3, at(14, 6), native),
        unit("orc-warboss", 1, at(14, 8), native),
      ],
    };
    const run = () =>
      runAutoBattle(
        { seed: 7, obstacles: [], attacker: deepforge, defender: horde },
        { ai: "fast" },
      );
    const { result, events } = run();
    expect(result.winner).not.toBeNull();
    // Deterministic: the same seed, the same battle.
    expect(run().result).toEqual(result);
    // The Great Boiler's Steam was spent by Strikes in the battle.
    expect(
      events.some(
        (e) =>
          e.type === "condition" &&
          e.condition.kind === "steam" &&
          e.change === "ended",
      ),
    ).toBe(true);
  });
});
