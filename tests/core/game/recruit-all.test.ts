// The town's "Recruit all" (bead border_marches-bzc.104): from the highest
// tier dwelling down, as many creatures as the stock and the treasury allow,
// into the visiting hero's army or the garrison by the recruit rules.
import { describe, expect, it } from "vitest";
import {
  moveHeroAlong,
  recruitAll,
  recruitAllPlan,
  type GameState,
} from "../../../src/core/game/index.ts";
import type { CreatureId, Resources } from "../../../src/data/types.ts";
import { errorOf, field, gameOn, ok, town } from "./helpers.ts";

/** Hero at (0,0), own Lost World town "t" at (2,0) (hero outside). */
function start(): GameState {
  return gameOn(field(5, 1), [town("t", 2, 0, 0)], 0, 0);
}

/** Test surgery: the treasury and the dwellings' stock. */
function stocked(
  s: GameState,
  resources: Partial<Resources>,
  dwellings: Partial<Record<CreatureId, number>>,
): GameState {
  const next = structuredClone(s);
  next.players[0]!.resources = {
    gold: 0,
    wood: 0,
    ore: 0,
    essence: 0,
    ...resources,
  };
  const t = next.towns["t"]!;
  t.dwellings = {};
  for (const [c, n] of Object.entries(dwellings)) {
    t.dwellings[c as CreatureId] = { available: n, remainder: 0 };
  }
  return next;
}

function heroInTown(s: GameState): GameState {
  return ok(
    moveHeroAlong(s, "hero-0", [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]),
  ).state;
}

const RICH = { gold: 100000, wood: 100, ore: 100, essence: 100 };

/** Seven stacks of creatures the Lost World town does not sell. */
const FULL_OTHERS: Array<{ creature: CreatureId; count: number }> = (
  [
    "goblin",
    "wolf-rider",
    "ogre",
    "troll",
    "squire",
    "skeleton",
    "banshee",
  ] as const
).map((creature) => ({ creature, count: 1 }));

describe("recruit all plan", () => {
  it("buys from the highest tier down, the whole stock when affordable", () => {
    const s = stocked(start(), RICH, {
      caveman: 14,
      raptor: 5,
      "t-rex": 1,
      spitter: 8,
    });
    const plan = recruitAllPlan(s, "t");
    expect(plan.blocked).toBeNull();
    expect(plan.steps).toEqual([
      { creature: "t-rex", count: 1, to: "garrison" },
      { creature: "raptor", count: 5, to: "garrison" },
      { creature: "spitter", count: 8, to: "garrison" },
      { creature: "caveman", count: 14, to: "garrison" },
    ]);
    // 3000 + 5 x 220 + 8 x 110 + 14 x 50; the T-Rex's ore and essence.
    expect(plan.cost).toEqual({ gold: 5680, wood: 0, ore: 4, essence: 2 });
  });

  it("spends the gold on the top tier first and fills down with the rest", () => {
    // 3 x 1100 = 3300 on triceratops, 700 left: 3 raptors (660), 40 left.
    const s = stocked(
      start(),
      { gold: 4000, ore: 10 },
      { caveman: 10, raptor: 6, triceratops: 3 },
    );
    expect(recruitAllPlan(s, "t").steps).toEqual([
      { creature: "triceratops", count: 3, to: "garrison" },
      { creature: "raptor", count: 3, to: "garrison" },
    ]);
  });

  it("is limited by every resource of the cost, not only gold", () => {
    // Plenty of gold, ore for two T-Rexes, essence for one (and none
    // left for shamans, who need essence too).
    const s = stocked(
      start(),
      { gold: 100000, ore: 9, essence: 2 },
      { "t-rex": 4, triceratops: 4, shaman: 3 },
    );
    const plan = recruitAllPlan(s, "t");
    expect(plan.steps).toEqual([
      { creature: "t-rex", count: 1, to: "garrison" },
      // 9 - 4 = 5 ore: two triceratops at 2 ore each.
      { creature: "triceratops", count: 2, to: "garrison" },
    ]);
    expect(plan.cost).toEqual({ gold: 5200, wood: 0, ore: 8, essence: 2 });
  });

  it("buys no more than the dwelling has", () => {
    const s = stocked(start(), RICH, { raptor: 2, caveman: 0 });
    expect(recruitAllPlan(s, "t").steps).toEqual([
      { creature: "raptor", count: 2, to: "garrison" },
    ]);
  });

  it("merges into a stack of the same creature and skips a full army", () => {
    const s = stocked(start(), RICH, { caveman: 5, raptor: 4, spitter: 3 });
    const t = s.towns["t"]!;
    // Seven slots, all taken, one of them cavemen: only cavemen fit.
    t.garrison = [
      { creature: "caveman", count: 14 },
      ...FULL_OTHERS.slice(1).map((x) => ({ ...x })),
    ];
    const plan = recruitAllPlan(s, "t");
    expect(plan.steps).toEqual([
      { creature: "caveman", count: 5, to: "garrison" },
    ]);
    // With one free slot, the highest tier takes it.
    t.garrison[6] = null;
    expect(recruitAllPlan(s, "t").steps).toEqual([
      { creature: "raptor", count: 4, to: "garrison" },
      { creature: "caveman", count: 5, to: "garrison" },
    ]);
  });

  it("puts recruits in the visiting hero's army, the garrison when it is full", () => {
    let s = heroInTown(stocked(start(), RICH, { raptor: 4, spitter: 3 }));
    expect(recruitAllPlan(s, "t").steps).toEqual([
      { creature: "raptor", count: 4, to: "hero" },
      { creature: "spitter", count: 3, to: "hero" },
    ]);
    s = structuredClone(s);
    const hero = s.heroes.find((h) => h.id === "hero-0")!;
    // Seven other creatures: no free slot and nothing to merge with.
    hero.army = FULL_OTHERS.map((x) => ({ ...x }));
    expect(recruitAllPlan(s, "t").steps).toEqual([
      { creature: "raptor", count: 4, to: "garrison" },
      { creature: "spitter", count: 3, to: "garrison" },
    ]);
  });

  it("sends a creature the hero's vow bars to the garrison", () => {
    let s = heroInTown(stocked(start(), RICH, { bellhop: 2, caveman: 3 }));
    s = structuredClone(s);
    s.heroes
      .find((h) => h.id === "hero-0")!
      .feats.push("vow-of-flesh-and-blood");
    const steps = recruitAllPlan(s, "t").steps;
    expect(steps.find((x) => x.creature === "bellhop")?.to).toBe("garrison");
    expect(steps.find((x) => x.creature === "caveman")?.to).toBe("hero");
  });

  it("is a no-op, with the reason, when nothing can be bought", () => {
    const empty = recruitAllPlan(
      stocked(start(), RICH, { caveman: 0, raptor: 0 }),
      "t",
    );
    expect(empty).toEqual({
      steps: [],
      cost: { gold: 0, wood: 0, ore: 0, essence: 0 },
      blocked: "no-stock",
    });
    expect(
      recruitAllPlan(stocked(start(), { gold: 49 }, { caveman: 5 }), "t")
        .blocked,
    ).toBe("resources");
    expect(recruitAllPlan(stocked(start(), RICH, {}), "t").blocked).toBe(
      "no-dwellings",
    );
    expect(recruitAllPlan(start(), "nowhere").blocked).toBe("not-owner");
  });
});

describe("recruit all command", () => {
  it("applies the plan: stock, treasury and armies", () => {
    const s = stocked(
      start(),
      { gold: 4000, ore: 10 },
      { caveman: 10, raptor: 6, triceratops: 3 },
    );
    const { state } = ok(recruitAll(s, "t"));
    const t = state.towns["t"]!;
    expect(t.dwellings.triceratops!.available).toBe(0);
    expect(t.dwellings.raptor!.available).toBe(3);
    expect(t.dwellings.caveman!.available).toBe(10);
    expect(state.players[0]!.resources).toEqual({
      gold: 40,
      wood: 0,
      ore: 4,
      essence: 0,
    });
    expect(t.garrison.filter((x) => x !== null)).toEqual([
      { creature: "caveman", count: 14 },
      { creature: "triceratops", count: 3 },
      { creature: "raptor", count: 3 },
    ]);
    // The original state is untouched.
    expect(s.players[0]!.resources.gold).toBe(4000);
  });

  it("fails when nothing can be bought", () => {
    expect(
      errorOf(recruitAll(stocked(start(), { gold: 10 }, { caveman: 5 }), "t")),
    ).toBe("resources");
    expect(errorOf(recruitAll(stocked(start(), RICH, {}), "t"))).toBe(
      "no-dwelling",
    );
  });
});
