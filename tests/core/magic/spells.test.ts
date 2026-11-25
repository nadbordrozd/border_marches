/**
 * Every battle spell of CONTENT_SPELLS.md section 3 (and the three faction
 * pages), batched by school, each on a hand-built state. The hero casts at
 * Power 2 (Power 2, school rank 1) unless a test says otherwise.
 *
 * Field: a0 (1,5) leads (Speed 9); a1 (1,6) is adjacent to it; d0 (8,5)
 * and d1 (8,6) are adjacent to each other. Pikemen: 10 HP each, 10 a stack.
 */

import { describe, expect, it } from "vitest";
import {
  actionError,
  applyAction,
  canShoot,
  hasAct,
  hexDistance,
  isAlive,
} from "../../../src/core/battle/index.ts";
import type {
  BattleState,
  GroundFeature,
  Hex,
} from "../../../src/core/battle/index.ts";
import {
  BATTLE_SPELLS,
  poolBattleSpells,
  spellDef,
} from "../../../src/core/magic/index.ts";
import {
  BOOK,
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
  ref,
  stack,
  withConditions,
} from "./helpers.ts";
import type { Unit } from "./helpers.ts";

function field(
  opts: {
    mine?: Unit[];
    theirs?: Unit[];
    magic?: Parameters<typeof battle>[0]["magic"];
  } = {},
): BattleState {
  return battle({
    mine: opts.mine ?? [
      { hex: { col: 1, row: 5 } },
      { hex: { col: 1, row: 6 } },
    ],
    theirs: opts.theirs ?? [
      { hex: { col: 8, row: 5 } },
      { hex: { col: 8, row: 6 } },
    ],
    magic: opts.magic ?? {},
  });
}

function patch(
  state: BattleState,
  id: string,
  p: Partial<BattleState["stacks"][number]>,
): BattleState {
  return {
    ...state,
    stacks: state.stacks.map((s) => (s.id === id ? { ...s, ...p } : s)),
  };
}

function addRemains(
  state: BattleState,
  hex: Hex,
  owner: "attacker" | "defender",
  creature = PIKE,
): BattleState {
  const g: GroundFeature = {
    hex,
    kind: "corpse",
    class: "remains",
    school: null,
    size: 0,
    clock: null,
    remains: { creature, owner, initialCount: 10 },
    source: "test",
  };
  return { ...state, ground: [...state.ground, g] };
}

function groundKinds(state: BattleState): string[] {
  return state.ground.map((g) => `${g.kind}@${g.hex.col},${g.hex.row}`);
}

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

describe("the spell list", () => {
  it("has 50 battle spells, ten per school, tiers 3, 3, 2, 1, 1", () => {
    const pool = poolBattleSpells();
    expect(pool).toHaveLength(50);
    for (const school of ["bloom", "accord", "clock", "hush", "storm"]) {
      const tiers = pool
        .filter((s) => s.school === school)
        .map((s) => s.tier)
        .sort();
      expect(tiers).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 4, 5]);
    }
  });

  it("every spell is a registered cast act with mana within 2 of its tier", () => {
    const tierMana = [0, 4, 7, 10, 14, 20];
    for (const s of BATTLE_SPELLS) {
      expect(hasAct(s.id)).toBe(true);
      expect(
        Math.abs(s.mana - (tierMana[s.tier] as number)),
      ).toBeLessThanOrEqual(2);
    }
  });

  it("the five tools are tier 2, one per school, with no size", () => {
    const tools = BATTLE_SPELLS.filter((s) => s.tool);
    expect(tools.map((s) => s.id).sort()).toEqual([
      "feed",
      "pass-on",
      "set-off",
      "share",
      "wind",
    ]);
    for (const t of tools) {
      expect(t.tier).toBe(2);
      expect(t.fuel).toBeNull();
    }
  });

  it("texts scale with Power", () => {
    expect(spellDef("jolt").text(3)).toBe("Deal 50 Harm to a stack.");
  });
});

describe("Bloom", () => {
  it("Poultice heals without reviving and ends Venomed", () => {
    let s0 = patch(field(), "a1", { count: 5, topHp: 3 });
    s0 = withConditions(s0, "a1", [{ kind: "venomed", size: 2, clock: 2 }]);
    const s1 = cast(s0, "poultice", [S("a1")]).state;
    expect(stack(s1, "a1")).toMatchObject({ count: 5, topHp: 10 });
    expect(kinds(s1, "a1")).toEqual([]);
  });

  it("Thornskin: a melee striker takes Harm equal to Thorned's size", () => {
    const s0 = field({
      theirs: [{ hex: { col: 2, row: 5 } }],
    });
    const s1 = cast(s0, "thornskin", [S("a0")]).state;
    expect(stack(s1, "a0").conditions[0]).toMatchObject({
      kind: "thorned",
      size: 12,
      clock: 3,
    });
    // a0 attacks d0; d0 retaliates into the thorns.
    const step = applyAction(s1, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: { col: 1, row: 5 },
    });
    const thorn = step.events.find(
      (e) => e.type === "harm" && e.rule === "condition:thorned",
    );
    expect(thorn).toMatchObject({ targetId: "d0", x: 12 });
  });

  it("Nettle: Harm 12 + 6 P and Venomed 2", () => {
    const s0 = field();
    const s1 = cast(s0, "nettle", [S("d0")]).state;
    expect(hpLost(s0, s1, "d0")).toBe(24);
    expect(stack(s1, "d0").conditions[0]).toMatchObject({
      kind: "venomed",
      size: 2,
      clock: 3,
    });
  });

  it("Feed grows a size by half, rounded up; not Holds", () => {
    let s0 = withConditions(field(), "d0", [
      { kind: "burning", size: 5, clock: 3 },
    ]);
    s0 = withConditions(s0, "d1", [{ kind: "frozen", clock: 2, size: 1 }]);
    const s1 = cast(s0, "feed", [C(s0, "d0", "burning")]).state;
    expect(stack(s1, "d0").conditions[0]?.size).toBe(8);
    expect(
      actionError(s0, castAction(s0, "feed", [C(s0, "d1", "frozen")])),
    ).toBe("a Hold cannot be fed");
  });

  it("Regrow heals 30 + 15 P, reviving, never above the initial count", () => {
    const s0 = patch(field(), "a1", { count: 5, topHp: 10 });
    const s1 = cast(s0, "regrow", [S("a1")]).state;
    expect(stack(s1, "a1")).toMatchObject({ count: 10, topHp: 10 });
  });

  it("Sprout summons Seedlings worth 30 + 15 P HP for the caster's side", () => {
    const s0 = field();
    const s1 = cast(s0, "sprout", [H(4, 5)]).state;
    const seed = s1.stacks.find((s) => s.creature.id === "seedling");
    expect(seed).toMatchObject({
      count: 10,
      owner: "attacker",
      summoned: true,
      hex: { col: 4, row: 5 },
    });
    expect(actionError(s0, castAction(s0, "sprout", [H(8, 5)]))).toBe(
      "choose a free hex",
    );
  });

  it("a Seedling dying leaves brambles 4 (Gone to Seed)", () => {
    const s0 = field();
    const s1 = cast(s0, "sprout", [H(4, 5)]).state;
    const id = s1.stacks.find((s) => s.creature.id === "seedling")
      ?.id as string;
    const s2 = cast(patch(nextRound(s1), id, { count: 1 }), "broadside", [
      H(4, 5),
    ]).state;
    expect(isAlive(stack(s2, id))).toBe(false);
    expect(s2.ground.find((g) => g.kind === "brambles")).toMatchObject({
      hex: { col: 4, row: 5 },
      size: 4,
      clock: 3,
    });
  });

  it("Bramble Row: brambles 9 + 4 P on three hexes in a line", () => {
    const s0 = field();
    const s1 = cast(s0, "bramble-row", [H(4, 5), H(5, 5), H(6, 5)]).state;
    expect(groundKinds(s1)).toEqual([
      "brambles@4,5",
      "brambles@5,5",
      "brambles@6,5",
    ]);
    expect(s1.ground.every((g) => g.size === 17 && g.clock === 3)).toBe(true);
    expect(
      actionError(
        s0,
        castAction(s0, "bramble-row", [H(4, 5), H(5, 5), H(5, 6)]),
      ),
    ).toMatch(/straight line/);
  });

  it("brambles harm and slow a stack that walks in", () => {
    const s0 = field();
    const s1 = cast(s0, "bramble-row", [H(2, 5), H(3, 5), H(4, 5)]).state;
    const step = applyAction(s1, {
      type: "move",
      stackId: "a0",
      to: { col: 2, row: 5 },
    });
    expect(hpLost(s1, step.state, "a0")).toBe(17);
    expect(kinds(step.state, "a0")).toEqual(["slowed"]);
  });

  it("Ripen: Ripening 20, maximum 60, Strikes x 120%", () => {
    const s1 = cast(field(), "ripen", [S("a0")]).state;
    expect(stack(s1, "a0").conditions[0]).toMatchObject({
      kind: "ripening",
      size: 20,
      maxSize: 60,
      clock: 3,
    });
  });

  it("Orchard Day: every friendly stack gains Mending 10 + 4 P", () => {
    const s1 = cast(field(), "orchard-day", []).state;
    for (const id of ["a0", "a1"])
      expect(stack(s1, id).conditions[0]).toMatchObject({
        kind: "mending",
        size: 18,
      });
    expect(kinds(s1, "d0")).toEqual([]);
  });

  it("Mending heals at the bearer's turn start, reviving", () => {
    let s0 = patch(field(), "a1", { count: 5, topHp: 10 });
    s0 = withConditions(s0, "a1", [{ kind: "mending", size: 18, clock: 3 }]);
    // a0 defends; then a1's turn starts (Speed 5 ties with d: attacker first).
    const s1 = applyAction(s0, { type: "defend", stackId: "a0" }).state;
    expect(s1.activeStackId).toBe("a1");
    expect(stack(s1, "a1")).toMatchObject({ count: 7, topHp: 8 });
  });

  it("Second Spring heals 54 + 21 P, twice that under Mending", () => {
    let s0 = patch(field(), "a0", { count: 1, topHp: 1 });
    s0 = patch(s0, "a1", { count: 1, topHp: 1 });
    s0 = withConditions(s0, "a1", [{ kind: "mending", size: 5, clock: 3 }]);
    const s1 = cast(s0, "second-spring", []).state;
    expect(hpLost(s1, s0, "a0")).toBe(96);
    expect(hpLost(s1, s0, "a1")).toBe(99); // 192 capped at 10 creatures
  });
});

describe("Accord", () => {
  it("Scapegoat links two friendly stacks; damage goes to the far end", () => {
    const s0 = field();
    const s1 = cast(s0, "scapegoat", [S("a0"), S("a1")]).state;
    expect(stack(s1, "a0").conditions[0]).toMatchObject({
      kind: "scapegoat",
      link: "a1",
      clock: 3,
    });
    expect(
      actionError(s0, castAction(s0, "scapegoat", [S("a0"), S("d0")])),
    ).toBe("choose two friendly stacks");
  });

  it("Close Ranks shields it and adjacent friendly stacks", () => {
    const s0 = field({
      mine: [{ hex: { col: 1, row: 5 } }, { hex: { col: 1, row: 6 } }],
      theirs: [{ hex: { col: 2, row: 5 } }],
    });
    const s1 = cast(s0, "close-ranks", [S("a0")]).state;
    expect(kinds(s1, "a0")).toEqual(["shielded"]);
    expect(kinds(s1, "a1")).toEqual(["shielded"]);
    expect(kinds(s1, "d0")).toEqual([]);
  });

  it("Change Places swaps two friendly stacks", () => {
    const s1 = cast(field(), "change-places", [S("a0"), S("a1")]).state;
    expect(stack(s1, "a0").hex).toEqual({ col: 1, row: 6 });
    expect(stack(s1, "a1").hex).toEqual({ col: 1, row: 5 });
  });

  it("Share copies a condition of a linked stack to every stack it is linked to", () => {
    let s0 = withConditions(field(), "a0", [
      { kind: "scapegoat", link: "a1", clock: 3 },
      { kind: "shielded", size: 3, clock: 2 },
    ]);
    s0 = withConditions(s0, "a1", [{ kind: "fired-up", size: 2, clock: 3 }]);
    s0 = withConditions(s0, "d0", [{ kind: "venomed", size: 1, clock: 2 }]);
    // From the link's bearer to its far end.
    const s1 = cast(s0, "share", [C(s0, "a0", "shielded")]).state;
    expect(stack(s1, "a1").conditions[1]).toMatchObject({
      kind: "shielded",
      size: 3,
      clock: 2,
    });
    // From the far end back to the bearer: a link joins both stacks.
    const s2 = cast(s0, "share", [C(s0, "a1", "fired-up")]).state;
    expect(kinds(s2, "a0")).toEqual(["scapegoat", "shielded", "fired-up"]);
    // One pick only, never the link itself, never an unlinked stack.
    expect(spellDef("share").target).toBe("share");
    expect(
      actionError(s0, castAction(s0, "share", [C(s0, "a0", "scapegoat")])),
    ).toMatch(/link cannot be shared/);
    expect(
      actionError(s0, castAction(s0, "share", [C(s0, "d0", "venomed")])),
    ).toMatch(/linked to another/);
  });

  it("Sign Here turns an enemy under its gate of 75 + 25 P; Mollified does not change it", () => {
    const small = field({ theirs: [{ hex: { col: 8, row: 5 }, count: 12 }] });
    const s1 = cast(small, "sign-here", [S("d0")]).state;
    expect(stack(s1, "d0")).toMatchObject({ side: "attacker" });
    expect(stack(s1, "d0").conditions[0]).toMatchObject({
      kind: "turned",
      clock: 1,
      gate: { measure: "hp", max: 125 },
    });
    const big = field({ theirs: [{ hex: { col: 8, row: 5 }, count: 13 }] });
    expect(kinds(cast(big, "sign-here", [S("d0")]).state, "d0")).toEqual([]);
    const soft = withConditions(big, "d0", [
      { kind: "mollified", size: 30, clock: 3 },
    ]);
    expect(kinds(cast(soft, "sign-here", [S("d0")]).state, "d0")).toEqual([
      "mollified",
    ]);
  });

  it("Soft Words: Mollified 30 lowers the bearer's Strikes", () => {
    const s0 = field({ theirs: [{ hex: { col: 2, row: 5 } }] });
    const s1 = cast(s0, "soft-words", [S("a0")]).state;
    expect(stack(s1, "a0").conditions[0]).toMatchObject({
      kind: "mollified",
      size: 30,
      maxSize: 75,
    });
    const step = applyAction(s1, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: { col: 1, row: 5 },
    });
    const hit = step.events.find((e) => e.type === "damage");
    expect(hit?.type === "damage" && hit.breakdown.abilityMultipliers).toEqual([
      { source: "mollified", label: "Mollified", percent: 70 },
    ]);
  });

  it("Fuelled Soft Words caps Mollified at 75", () => {
    const s0 = withConditions(field(), "d0", [
      { kind: "hushed", clock: 2 }, // Hush: opposed to Accord
    ]);
    const s1 = cast(s0, "soft-words", [S("d0")], {
      fuel: ref(s0, "d0", "hushed"),
    }).state;
    expect(stack(s1, "d0").conditions[0]).toMatchObject({
      kind: "mollified",
      size: 60,
    });
  });

  it("Sanctuary Oath: Warded 30 on a stack and its friendly neighbours", () => {
    const s0 = field({
      mine: [{ hex: { col: 1, row: 5 } }, { hex: { col: 1, row: 6 } }],
      theirs: [{ hex: { col: 2, row: 5 } }, { hex: { col: 8, row: 8 } }],
    });
    const s1 = cast(s0, "sanctuary-oath", [S("a0")]).state;
    expect(stack(s1, "a0").conditions).toMatchObject([
      { kind: "warded", size: 30, clock: 3 },
    ]);
    expect(kinds(s1, "a1")).toEqual(["warded"]);
    expect(kinds(s1, "d0")).toEqual([]); // an enemy neighbour gains nothing
    // Warded 30: Harm taken x 70%.
    const s2 = cast(nextRound(s1), "jolt", [S("a0")]).state;
    expect(hpLost(s1, s2, "a0")).toBe(28);
  });

  it("Take Heart ends Shaken and adds Heartened 3", () => {
    const s0 = withConditions(field(), "a1", [{ kind: "shaken", clock: 2 }]);
    const s1 = cast(s0, "take-heart", [S("a1")]).state;
    expect(stack(s1, "a1").conditions).toMatchObject([
      { kind: "heartened", clock: 3 },
    ]);
  });

  it("Change of Heart: Turned clock 2 under gate 150 + 50 P", () => {
    const s0 = field({ theirs: [{ hex: { col: 8, row: 5 }, count: 25 }] });
    const s1 = cast(s0, "change-of-heart", [S("d0")]).state;
    expect(stack(s1, "d0").conditions[0]).toMatchObject({
      kind: "turned",
      clock: 2,
      gate: { max: 250 },
    });
  });

  it("The Long Table copies a friendly stack's boons to its friendly neighbours", () => {
    let s0 = field({
      mine: [{ hex: { col: 1, row: 5 } }, { hex: { col: 1, row: 6 } }],
      theirs: [{ hex: { col: 2, row: 5 } }, { hex: { col: 8, row: 8 } }],
    });
    s0 = withConditions(s0, "a0", [
      { kind: "shielded", size: 2, clock: 3 },
      { kind: "burning", size: 4, clock: 2 },
      { kind: "scapegoat", link: "a1", clock: 3 },
    ]);
    const s1 = cast(s0, "the-long-table", [S("a0")]).state;
    expect(kinds(s1, "a1")).toEqual(["shielded"]); // no bane, no link
    expect(kinds(s1, "d0")).toEqual([]); // never an enemy
    expect(spellDef("the-long-table")).toMatchObject({
      target: "friendly",
      mana: 18,
    });
    expect(
      actionError(s0, castAction(s0, "the-long-table", [S("d0")])),
    ).toMatch(/friendly/);
  });
});

describe("Clock", () => {
  it("First Bell ends Delayed and adds Hastened 2", () => {
    const s0 = withConditions(field(), "a1", [{ kind: "delayed", clock: 2 }]);
    const s1 = cast(s0, "first-bell", [S("a1")]).state;
    expect(stack(s1, "a1").conditions).toMatchObject([
      { kind: "hastened", clock: 2 },
    ]);
  });

  it("Late Bell ends Hastened and adds Delayed 2, Slowed or not", () => {
    const s0 = withConditions(field(), "d0", [{ kind: "hastened", clock: 2 }]);
    expect(
      stack(cast(s0, "late-bell", [S("d0")]).state, "d0").conditions,
    ).toMatchObject([{ kind: "delayed", clock: 2 }]);
    const s1 = withConditions(field(), "d0", [
      { kind: "slowed", size: 1, clock: 2 },
    ]);
    expect(
      stack(cast(s1, "late-bell", [S("d0")]).state, "d0").conditions[1],
    ).toMatchObject({ kind: "delayed", clock: 2 });
  });

  it("Appointment schedules Harm 24 + 12 P for the next round start", () => {
    const s0 = field();
    const s1 = cast(s0, "appointment", [S("d0")]).state;
    expect(s1.scheduled).toHaveLength(1);
    expect(hpLost(s0, s1, "d0")).toBe(0);
    const s2 = nextRound(s1);
    expect(hpLost(s1, s2, "d0")).toBe(48);
  });

  it("Wind adds or subtracts 2; at 0 it expires and the debt falls due", () => {
    const s0 = withConditions(field(), "d0", [
      { kind: "reckoning", size: 30, clock: 2 },
      { kind: "frozen", clock: 2 },
    ]);
    const up = cast(s0, "wind", [C(s0, "d0", "reckoning"), { choice: "+2" }]);
    expect(stack(up.state, "d0").conditions[0]?.clock).toBe(4);
    const down = cast(s0, "wind", [C(s0, "d0", "reckoning"), { choice: "-2" }]);
    expect(hpLost(s0, down.state, "d0")).toBe(30);
    expect(
      actionError(
        s0,
        castAction(s0, "wind", [C(s0, "d0", "frozen"), { choice: "+2" }]),
      ),
    ).toBe("a Hold can only be shortened");
  });

  it("Treacle slows every stack on a hex and the six around it", () => {
    const s1 = cast(field(), "treacle", [H(8, 5)]).state;
    expect(stack(s1, "d0").conditions[0]).toMatchObject({
      kind: "slowed",
      size: 1,
      clock: 3,
    });
    expect(kinds(s1, "d1")).toEqual(["slowed"]);
    expect(kinds(s1, "a0")).toEqual([]);
  });

  it("Quick March: every friendly stack gains Quickened 1", () => {
    const s1 = cast(field(), "quick-march", []).state;
    expect(kinds(s1, "a0")).toEqual(["quickened"]);
    expect(kinds(s1, "a1")).toEqual(["quickened"]);
  });

  it("Encore gives the acting stack an extra turn, then Delayed", () => {
    const s0 = field();
    const s1 = cast(s0, "encore", []).state;
    expect(kinds(s1, "a0")).toEqual(["delayed"]);
    const s2 = applyAction(s1, { type: "defend", stackId: "a0" }).state;
    expect(s2.activeStackId).toBe("a0");
    // Quickened makes no difference: Delayed always follows.
    const q = withConditions(s0, "a0", [
      { kind: "quickened", size: 1, clock: 2 },
    ]);
    expect(kinds(cast(q, "encore", []).state, "a0")).toEqual([
      "quickened",
      "delayed",
    ]);
    expect(spellDef("encore").mana).toBe(9);
  });

  it("Forced March hastens every friendly stack", () => {
    const s1 = cast(field(), "forced-march", []).state;
    expect(kinds(s1, "a1")).toEqual(["hastened"]);
  });

  it("Deadline: Reckoning 75 + 30 P, clock 2, falls due as Harm", () => {
    const s0 = field({ theirs: [{ hex: { col: 8, row: 5 }, count: 40 }] });
    const s1 = cast(s0, "deadline", [S("d0")]).state;
    expect(stack(s1, "d0").conditions[0]).toMatchObject({
      kind: "reckoning",
      size: 135,
      clock: 2,
    });
    const s2 = nextRound(nextRound(s1));
    expect(hpLost(s1, s2, "d0")).toBe(135);
  });

  it("Double Time: Heartened clock 1 on every friendly stack", () => {
    const s1 = cast(field(), "double-time", []).state;
    expect(stack(s1, "a0").conditions).toMatchObject([
      { kind: "heartened", clock: 1 },
    ]);
    const s2 = applyAction(s1, { type: "defend", stackId: "a0" }).state;
    expect(s2.activeStackId).toBe("a0"); // the extra turn
  });
});

describe("Hush", () => {
  it("Hush Now stops shooting for two rounds", () => {
    const s0 = field({
      mine: [
        { hex: { col: 1, row: 5 } },
        { creature: { ...BOW, speed: 5 }, hex: { col: 1, row: 7 } },
      ],
    });
    const s1 = cast(s0, "hush-now", [S("a1")]).state;
    expect(kinds(s1, "a1")).toEqual(["hushed"]);
    const s2 = applyAction(s1, { type: "defend", stackId: "a0" }).state;
    expect(s2.activeStackId).toBe("a1");
    expect(canShoot(s2, "a1")).toBe(false);
  });

  it("On Credit heals, reviving, and adds a Reckoning of the same size", () => {
    const s0 = patch(field(), "a1", { count: 2, topHp: 10 });
    const s1 = cast(s0, "on-credit", [S("a1")]).state;
    expect(hpLost(s1, s0, "a1")).toBe(49);
    expect(stack(s1, "a1").conditions[0]).toMatchObject({
      kind: "reckoning",
      size: 49,
      clock: 3,
    });
  });

  it("On Credit with Fuel doubles the heal, not the debt", () => {
    let s0 = patch(field(), "a1", { count: 1, topHp: 10 });
    s0 = withConditions(s0, "a1", [{ kind: "mending", size: 2, clock: 3 }]);
    const s1 = cast(s0, "on-credit", [S("a1")], {
      fuel: ref(s0, "a1", "mending"),
    }).state;
    expect(hpLost(s1, s0, "a1")).toBe(90); // 98, capped at 10 creatures
    expect(stack(s1, "a1").conditions[0]).toMatchObject({ size: 49 });
  });

  it("Bad Omen: Jinxed 25", () => {
    const s1 = cast(field(), "bad-omen", [S("d0")]).state;
    expect(stack(s1, "d0").conditions[0]).toMatchObject({
      kind: "jinxed",
      size: 25,
      clock: 3,
    });
  });

  it("Pass On moves a bane to a stack adjacent to its bearer", () => {
    const s0 = withConditions(
      field({ theirs: [{ hex: { col: 2, row: 5 } }] }),
      "a0",
      [{ kind: "venomed", size: 3, clock: 2 }],
    );
    const s1 = cast(s0, "pass-on", [C(s0, "a0", "venomed"), S("d0")]).state;
    expect(kinds(s1, "a0")).toEqual([]);
    expect(kinds(s1, "d0")).toEqual(["venomed"]);
    const far = withConditions(field(), "a0", [
      { kind: "venomed", size: 3, clock: 2 },
    ]);
    expect(
      actionError(
        far,
        castAction(far, "pass-on", [C(far, "a0", "venomed"), S("d0")]),
      ),
    ).toMatch(/adjacent/);
    const boon = withConditions(field(), "a0", [
      { kind: "shielded", size: 3, clock: 2 },
    ]);
    expect(
      actionError(
        boon,
        castAction(boon, "pass-on", [C(boon, "a0", "shielded"), S("a1")]),
      ),
    ).toBe("choose a bane");
  });

  it("Lullaby: Asleep under gate 75 + 25 P; Hushed does not change it", () => {
    const small = field({ theirs: [{ hex: { col: 8, row: 5 }, count: 12 }] });
    expect(kinds(cast(small, "lullaby", [S("d0")]).state, "d0")).toEqual([
      "asleep",
    ]);
    const big = field({ theirs: [{ hex: { col: 8, row: 5 }, count: 13 }] });
    expect(kinds(cast(big, "lullaby", [S("d0")]).state, "d0")).toEqual([]);
    const hushed = withConditions(big, "d0", [{ kind: "hushed", clock: 2 }]);
    expect(kinds(cast(hushed, "lullaby", [S("d0")]).state, "d0")).toEqual([
      "hushed",
    ]);
  });

  it("Second Shift raises Shades on remains of the caster's side only", () => {
    let s0 = addRemains(field(), { col: 4, row: 4 }, "attacker");
    s0 = addRemains(s0, { col: 6, row: 4 }, "defender");
    const s1 = cast(s0, "second-shift", [H(4, 4)]).state;
    const shade = s1.stacks.find((s) => s.creature.id === "shade");
    expect(shade).toMatchObject({
      count: 7,
      owner: "attacker",
      summoned: true,
    });
    expect(groundKinds(s1)).toEqual(["corpse@6,4"]);
    expect(actionError(s0, castAction(s0, "second-shift", [H(6, 4)]))).toBe(
      "the remains must be of a stack your side owned",
    );
  });

  it("Leech Line drains the enemy into the friendly stack each round", () => {
    const s0 = patch(field(), "a1", { count: 5 });
    const s1 = cast(s0, "leech-line", [S("d0"), S("a1")]).state;
    expect(stack(s1, "d0").conditions[0]).toMatchObject({
      kind: "leeched",
      link: "a1",
      size: 29,
    });
    // d0's turn start: it takes 29 Harm and a1 heals 29, reviving.
    let s = s1;
    while (s.activeStackId !== "d0") {
      s = applyAction(s, {
        type: "defend",
        stackId: s.activeStackId as string,
      }).state;
    }
    expect(hpLost(s1, s, "d0")).toBe(29);
    expect(hpLost(s, s1, "a1")).toBe(29);
  });

  it("Curtain Call raises the recorded creature, 40 + 20 P HP worth", () => {
    const s0 = addRemains(field(), { col: 4, row: 4 }, "attacker");
    const s1 = cast(s0, "curtain-call", [H(4, 4)]).state;
    const back = s1.stacks.find((s) => s.summoned);
    expect(back).toMatchObject({ count: 8 }); // 80 HP / 10
    expect(back?.creature.id).toBe("pike");
    // No cap at the dead stack's starting count: the budget alone decides.
    const few = {
      ...s0,
      ground: s0.ground.map((g) =>
        g.remains ? { ...g, remains: { ...g.remains, initialCount: 3 } } : g,
      ),
    };
    const s2 = cast(few, "curtain-call", [H(4, 4)]).state;
    expect(s2.stacks.find((s) => s.summoned)).toMatchObject({ count: 8 });
  });

  it("Pea Soup lays mist within 2: no shooting from it", () => {
    const s1 = cast(field(), "pea-soup", [H(8, 5)]).state;
    expect(s1.ground.filter((g) => g.kind === "mist")).toHaveLength(19);
  });

  it("Everybody Up raises every remains of the caster's side", () => {
    let s0 = addRemains(field(), { col: 4, row: 4 }, "attacker");
    s0 = addRemains(s0, { col: 4, row: 8 }, "attacker");
    s0 = addRemains(s0, { col: 6, row: 4 }, "defender");
    const s1 = cast(s0, "everybody-up", []).state;
    const shades = s1.stacks.filter((s) => s.creature.id === "shade");
    expect(shades.map((s) => s.count)).toEqual([8, 8]);
    expect(groundKinds(s1)).toEqual(["corpse@6,4"]);
  });

  it("Shades cannot bear Heartened and leave mist when they die", () => {
    const s0 = addRemains(field(), { col: 4, row: 4 }, "attacker");
    const s1 = cast(s0, "second-shift", [H(4, 4)]).state;
    const id = s1.stacks.find((s) => s.creature.id === "shade")?.id as string;
    const s2 = cast(patch(nextRound(s1), id, { count: 1 }), "broadside", [
      H(4, 4),
    ]).state;
    expect(isAlive(stack(s2, id))).toBe(false);
    expect(groundKinds(s2)).toContain("mist@4,4");
  });
});

describe("Storm", () => {
  it("Jolt: Harm 20 + 10 P", () => {
    const s0 = field();
    expect(hpLost(s0, cast(s0, "jolt", [S("d0")]).state, "d0")).toBe(40);
  });

  it("Gust harms 10 + 5 P and pushes 3 hexes toward the enemy's edge", () => {
    const s0 = field();
    expect(spellDef("gust").target).toBe("stack");
    const s1 = cast(s0, "gust", [S("d0")]).state;
    expect(hpLost(s0, s1, "d0")).toBe(20);
    expect(stack(s1, "d0").hex).toEqual({ col: 11, row: 5 });
    // A friendly stack goes the same way: forward, toward the enemy.
    const s2 = cast(s0, "gust", [S("a1")]).state;
    expect(stack(s2, "a1").hex).toEqual({ col: 4, row: 6 });
  });

  it("Gust cast by the defender pushes toward the attacker's edge", () => {
    const s0 = battle({
      mine: [{ hex: { col: 5, row: 5 } }],
      theirs: [{ hex: { col: 8, row: 5 } }],
      enemyMagic: BOOK,
    });
    // Hand the turn to the defender's stack: it casts with its side's hero.
    const def = { ...s0, activeStackId: "d0" };
    const s1 = applyAction(def, {
      ...castAction(def, "gust", [S("a0")]),
      stackId: "d0",
    }).state;
    expect(stack(s1, "a0").hex).toEqual({ col: 2, row: 5 });
  });

  it("Gust pushes through fire, which harms on the way", () => {
    let s0 = field();
    s0 = {
      ...s0,
      ground: [
        {
          hex: { col: 9, row: 5 },
          kind: "fire",
          class: "hazard",
          school: "storm",
          size: 7,
          clock: 2,
          remains: null,
          source: "test",
        },
      ],
    };
    const s1 = cast(s0, "gust", [S("d0")]).state;
    expect(hpLost(s0, s1, "d0")).toBe(27);
  });

  it("Hothead: Burning 6 + 3 P and Fired Up 2", () => {
    const s1 = cast(field(), "hothead", [S("a0")]).state;
    expect(stack(s1, "a0").conditions).toMatchObject([
      { kind: "burning", size: 12, clock: 3 },
      { kind: "fired-up", size: 2, clock: 3 },
    ]);
  });

  it("Set Off: Harm 8 + 4 P for each round left (at most 3), whatever the kind", () => {
    const s0 = withConditions(field(), "d0", [
      { kind: "burning", size: 12, clock: 3 },
    ]);
    const s1 = cast(s0, "set-off", [C(s0, "d0", "burning")]).state;
    expect(hpLost(s0, s1, "d0")).toBe(48);
    expect(kinds(s1, "d0")).toEqual([]);
    // A clockless boon counts 3 rounds; a debt is ended like any other.
    const lucky = withConditions(field(), "d0", [
      { kind: "lucky", clock: null },
    ]);
    const s2 = cast(lucky, "set-off", [C(lucky, "d0", "lucky")]).state;
    expect(hpLost(lucky, s2, "d0")).toBe(48);
    const debt = withConditions(field(), "d0", [
      { kind: "reckoning", size: 90, clock: 1 },
    ]);
    const s3 = cast(debt, "set-off", [C(debt, "d0", "reckoning")]).state;
    expect(hpLost(debt, s3, "d0")).toBe(16);
    expect(spellDef("set-off").text(2)).toContain("16 Harm");
  });

  it("Broadside harms every stack on a hex and the six around it", () => {
    const s0 = field();
    const s1 = cast(s0, "broadside", [H(8, 5)]).state;
    expect(hpLost(s0, s1, "d0")).toBe(36);
    expect(hpLost(s0, s1, "d1")).toBe(36);
  });

  it("Cold Snap: Frozen under gate 75 + 25 P; Drenched does not change it", () => {
    const s0 = field({ theirs: [{ hex: { col: 8, row: 5 }, count: 12 }] });
    expect(kinds(cast(s0, "cold-snap", [S("d0")]).state, "d0")).toEqual([
      "frozen",
    ]);
    const big = field({ theirs: [{ hex: { col: 8, row: 5 }, count: 13 }] });
    expect(kinds(cast(big, "cold-snap", [S("d0")]).state, "d0")).toEqual([]);
    const wet = withConditions(big, "d0", [
      { kind: "drenched", size: 40, clock: 3 },
    ]);
    expect(kinds(cast(wet, "cold-snap", [S("d0")]).state, "d0")).toEqual([
      "drenched",
    ]);
  });

  it("Downpour drenches stacks within 2 and puts out fire", () => {
    let s0 = field();
    s0 = cast(s0, "wildfire", [H(6, 5)]).state;
    s0 = nextRound(s0);
    const s1 = cast(s0, "downpour", [H(8, 5)]).state;
    expect(stack(s1, "d0").conditions[0]).toMatchObject({
      kind: "drenched",
      size: 40,
    });
    const far = s0.ground.filter(
      (g) => g.kind === "fire" && hexDistance(g.hex, { col: 8, row: 5 }) > 2,
    );
    expect(far.length).toBeGreaterThan(0);
    expect(s1.ground.filter((g) => g.kind === "fire")).toEqual(far);
  });

  it("Drenched 40 makes Harm taken x 140%", () => {
    const s0 = withConditions(field(), "d0", [
      { kind: "drenched", size: 40, clock: 3 },
    ]);
    expect(hpLost(s0, cast(s0, "jolt", [S("d0")]).state, "d0")).toBe(56);
  });

  it("Wildfire: fire 9 + 4 P on a hex and the six around it", () => {
    const s1 = cast(field(), "wildfire", [H(5, 5)]).state;
    const fire = s1.ground.filter((g) => g.kind === "fire");
    expect(fire).toHaveLength(7);
    expect(fire.every((g) => g.size === 17 && g.clock === 3)).toBe(true);
  });

  it("Whiteout harms within 2 and slows survivors", () => {
    const s0 = field({
      theirs: [
        { hex: { col: 8, row: 5 }, count: 20 },
        { hex: { col: 8, row: 6 }, count: 20 },
      ],
    });
    const s1 = cast(s0, "whiteout", [H(8, 5)]).state;
    expect(hpLost(s0, s1, "d0")).toBe(66);
    expect(stack(s1, "d0").conditions[0]).toMatchObject({
      kind: "slowed",
      size: 2,
      clock: 2,
    });
  });

  it("The Sky Falls skips Warded stacks and turns remains to fire", () => {
    let s0 = field({
      theirs: [
        { hex: { col: 8, row: 5 }, count: 20 },
        { hex: { col: 8, row: 6 }, count: 20 },
      ],
    });
    s0 = withConditions(s0, "d1", [{ kind: "warded", size: 40, clock: 3 }]);
    s0 = addRemains(s0, { col: 9, row: 4 }, "defender");
    const s1 = cast(s0, "the-sky-falls", [H(8, 5)]).state;
    expect(hpLost(s0, s1, "d0")).toBe(96);
    expect(hpLost(s0, s1, "d1")).toBe(0);
    expect(groundKinds(s1)).toContain("fire@9,4");
  });
});

describe("faction pages", () => {
  it("Mend heals 20 + 10 P, reviving", () => {
    const s0 = patch(field(), "a1", { count: 6, topHp: 10 });
    expect(hpLost(cast(s0, "mend", [S("a1")]).state, s0, "a1")).toBe(40);
  });

  it("Thunderclap harms each stack on a hex and the six around it", () => {
    const s0 = field();
    const s1 = cast(s0, "thunderclap", [H(8, 5)]).state;
    expect(hpLost(s0, s1, "d0")).toBe(24);
    expect(hpLost(s0, s1, "d1")).toBe(24);
  });

  it("Last Breath: Harm 20 + 10 P", () => {
    const s0 = field();
    expect(hpLost(s0, cast(s0, "last-breath", [S("d0")]).state, "d0")).toBe(40);
  });

  it("are not in the guild pool", () => {
    const pool = poolBattleSpells().map((s) => s.id);
    for (const id of ["mend", "thunderclap", "last-breath"])
      expect(pool).not.toContain(id);
  });
});
