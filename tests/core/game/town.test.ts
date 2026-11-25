import { describe, expect, it } from "vitest";
import {
  build,
  buildStatus,
  dailyIncome,
  endDay,
  marketQuote,
  marketTrade,
  moveHeroAlong,
  recruit,
  transferStack,
  type GameState,
} from "../../../src/core/game/index.ts";
import { errorOf, field, gameOn, ok, town } from "./helpers.ts";

/** Hero at (0,0), own town at (2,0) (hero outside). */
function start(): GameState {
  return gameOn(field(5, 1), [town("t", 2, 0, 0)], 0, 0);
}

function withResources(
  s: GameState,
  r: Partial<GameState["players"][number]["resources"]>,
): GameState {
  const next = structuredClone(s);
  Object.assign(next.players[0]!.resources, r);
  return next;
}

function days(s: GameState, n: number): GameState {
  let out = s;
  for (let i = 0; i < n; i++) out = ok(endDay(out)).state;
  return out;
}

function heroInTown(s: GameState): GameState {
  return ok(
    moveHeroAlong(s, "hero-0", [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]),
  ).state;
}

describe("build", () => {
  it("pays the cost and allows one building per day", () => {
    const s = ok(build(start(), "t", "town-hall")).state;
    expect(s.players[0]!.resources).toEqual({
      gold: 5000,
      wood: 15,
      ore: 8,
      essence: 4,
    });
    expect(s.towns["t"]!.buildings).toContain("town-hall");
    expect(errorOf(build(s, "t", "marketplace"))).toBe("built-today");
    const tomorrow = days(s, 1);
    expect(
      ok(build(tomorrow, "t", "marketplace")).state.towns["t"]!.buildings,
    ).toContain("marketplace");
  });

  it("checks requirements, duplicates, start buildings and resources", () => {
    const s = start();
    expect(errorOf(build(s, "t", "raptor-pen"))).toBe("requirements");
    expect(errorOf(build(s, "t", "city-hall"))).toBe("requirements");
    expect(errorOf(build(s, "t", "village-hall"))).toBe("already-built");
    expect(errorOf(build(s, "t", "cave"))).toBe("already-built");
    expect(
      errorOf(build(withResources(s, { wood: 4 }), "t", "town-hall")),
    ).toBe("resources");
    expect(errorOf(build(s, "nowhere", "palisade"))).toBe("unknown-town");
    expect(buildStatus(s, "t", "palisade")).toBe("ok");

    let r = withResources(s, {
      gold: 100000,
      wood: 100,
      ore: 100,
      essence: 100,
    });
    for (const b of ["palisade", "town-hall", "city-hall"] as const) {
      r = days(ok(build(r, "t", b)).state, 1);
    }
    expect(r.towns["t"]!.buildings).toEqual([
      "village-hall",
      "town-hall",
      "city-hall",
      "palisade",
      "cave",
    ]);
    expect(buildStatus(r, "t", "raptor-pen")).toBe("ok");
    expect(buildStatus(r, "t", "tyrants-lair")).toBe("requirements");
  });

  it("stocks a new dwelling with one week's growth", () => {
    const s = ok(build(start(), "t", "spitter-nest")).state;
    expect(s.towns["t"]!.dwellings.spitter).toEqual({
      available: 9,
      remainder: 0,
    });
  });
});

describe("income and growth", () => {
  it("pays halls (replacing each other) from day 2 and the silo on top", () => {
    let s = start();
    expect(dailyIncome(s, 0)).toEqual({
      gold: 500,
      wood: 0,
      ore: 0,
      essence: 0,
    });
    s = days(s, 1);
    expect(s.day).toBe(2);
    expect(s.players[0]!.resources.gold).toBe(8000);
    s = withResources(s, { gold: 100000, wood: 100, ore: 100, essence: 100 });
    s = days(ok(build(s, "t", "town-hall")).state, 1);
    expect(dailyIncome(s, 0).gold).toBe(1000);
    s = days(ok(build(s, "t", "palisade")).state, 1);
    s = days(ok(build(s, "t", "city-hall")).state, 1);
    expect(dailyIncome(s, 0).gold).toBe(2000);
    s = days(ok(build(s, "t", "marketplace")).state, 1);
    s = ok(build(s, "t", "resource-silo")).state;
    expect(dailyIncome(s, 0)).toEqual({
      gold: 2000,
      wood: 1,
      ore: 1,
      essence: 0,
    });
  });

  it("grows dwellings on day 1 of each week from week 2", () => {
    let s = days(start(), 6);
    expect(s.day).toBe(7);
    expect(s.towns["t"]!.dwellings.caveman!.available).toBe(14);
    const { state, events } = ok(endDay(s));
    expect(state.day).toBe(8);
    expect(events).toContainEqual({ type: "new-week", day: 8 });
    expect(state.towns["t"]!.dwellings.caveman!.available).toBe(28);
    s = days(state, 6);
    expect(s.towns["t"]!.dwellings.caveman!.available).toBe(28);
  });

  it("applies the Stockade's alternating +50%", () => {
    let s = withResources(start(), { gold: 100000, wood: 100, ore: 100 });
    s = days(ok(build(s, "t", "spitter-nest")).state, 1);
    s = days(ok(build(s, "t", "palisade")).state, 1);
    s = ok(build(s, "t", "stockade")).state;
    s = days(s, 8 - s.day); // to day 8
    expect(s.towns["t"]!.dwellings.spitter).toEqual({
      available: 9 + 13,
      remainder: 1,
    });
    expect(s.towns["t"]!.dwellings.caveman!.available).toBe(14 + 21);
    s = days(s, 7); // day 15
    expect(s.towns["t"]!.dwellings.spitter).toEqual({
      available: 9 + 13 + 14,
      remainder: 0,
    });
  });

  it("resets movement and the build flag each day", () => {
    let s = ok(moveHeroAlong(start(), "hero-0", [{ x: 1, y: 0 }])).state;
    s = ok(build(s, "t", "marketplace")).state;
    expect(s.heroes[0]!.mp).toBe(1400);
    s = days(s, 1);
    expect(s.heroes[0]!.mp).toBe(1500);
    expect(s.towns["t"]!.builtToday).toBe(false);
  });
});

describe("recruit", () => {
  it("sends recruits to the garrison when the hero is away", () => {
    const { state } = ok(recruit(start(), "t", "caveman", 10));
    expect(state.players[0]!.resources.gold).toBe(7000);
    expect(state.towns["t"]!.dwellings.caveman!.available).toBe(4);
    // On top of the starting militia of 14 (RULES_V2 5.5).
    expect(state.towns["t"]!.garrison[0]).toEqual({
      creature: "caveman",
      count: 14 + 10,
    });
    expect(state.heroes[0]!.army[0]).toEqual({
      creature: "caveman",
      count: 18,
    });
  });

  it("merges recruits into the hero's army when the hero is in town", () => {
    const s = heroInTown(start());
    const { state } = ok(recruit(s, "t", "caveman", 14));
    expect(state.heroes[0]!.army[0]).toEqual({
      creature: "caveman",
      count: 32,
    });
    // The garrison keeps just its starting militia (RULES_V2 5.5).
    expect(state.towns["t"]!.garrison[0]).toEqual({
      creature: "caveman",
      count: 14,
    });
    const forced = ok(recruit(s, "t", "caveman", 4, "garrison")).state;
    expect(forced.towns["t"]!.garrison[0]).toEqual({
      creature: "caveman",
      count: 14 + 4,
    });
    expect(errorOf(recruit(start(), "t", "caveman", 1, "hero"))).toBe(
      "not-in-town",
    );
  });

  it("checks stock, cost, dwellings and counts", () => {
    const s = start();
    expect(errorOf(recruit(s, "t", "caveman", 15))).toBe("stock");
    expect(errorOf(recruit(s, "t", "caveman", 0))).toBe("bad-count");
    expect(errorOf(recruit(s, "t", "raptor", 1))).toBe("no-dwelling");
    expect(
      errorOf(recruit(withResources(s, { gold: 649 }), "t", "caveman", 13)),
    ).toBe("resources");
    expect(
      ok(recruit(withResources(s, { gold: 650 }), "t", "caveman", 13)).state
        .players[0]!.resources.gold,
    ).toBe(0);
  });

  it("charges every resource of the creature's cost", () => {
    let s = withResources(start(), {
      gold: 100000,
      wood: 100,
      ore: 100,
      essence: 100,
    });
    for (const b of ["spitter-nest", "spirit-lodge"] as const) {
      s = days(ok(build(s, "t", b)).state, 1);
    }
    const { state } = ok(recruit(s, "t", "shaman", 3));
    expect(state.players[0]!.resources.essence).toBe(100 - 2 - 3);
  });
});

describe("transferStack", () => {
  it("splits, merges and swaps between hero and garrison", () => {
    const s = heroInTown(start());
    const args = { heroId: "hero-0", townId: "t" };
    const split = ok(
      transferStack(s, {
        ...args,
        from: { army: "hero", slot: 0 },
        to: { army: "garrison", slot: 3 },
        count: 5,
      }),
    ).state;
    expect(split.heroes[0]!.army[0]).toEqual({
      creature: "caveman",
      count: 13,
    });
    expect(split.towns["t"]!.garrison[3]).toEqual({
      creature: "caveman",
      count: 5,
    });

    const merged = ok(
      transferStack(split, {
        ...args,
        from: { army: "garrison", slot: 3 },
        to: { army: "hero", slot: 0 },
      }),
    ).state;
    expect(merged.heroes[0]!.army[0]).toEqual({
      creature: "caveman",
      count: 18,
    });
    expect(merged.towns["t"]!.garrison[3]).toBeNull();

    const swapped = ok(
      transferStack(s, {
        heroId: "hero-0",
        from: { army: "hero", slot: 0 },
        to: { army: "hero", slot: 1 },
      }),
    ).state;
    expect(swapped.heroes[0]!.army.slice(0, 2)).toEqual([
      { creature: "spitter", count: 6 },
      { creature: "caveman", count: 18 },
    ]);
  });

  it("keeps the rules: in town, same creature to merge, hero keeps an army", () => {
    const away = start();
    expect(
      errorOf(
        transferStack(away, {
          heroId: "hero-0",
          townId: "t",
          from: { army: "hero", slot: 0 },
          to: { army: "garrison", slot: 0 },
        }),
      ),
    ).toBe("not-in-town");
    // Splitting within the hero's army works anywhere.
    const split = ok(
      transferStack(away, {
        heroId: "hero-0",
        from: { army: "hero", slot: 0 },
        to: { army: "hero", slot: 2 },
        count: 1,
      }),
    ).state;
    expect(split.heroes[0]!.army[2]).toEqual({ creature: "caveman", count: 1 });
    expect(
      errorOf(
        transferStack(away, {
          heroId: "hero-0",
          from: { army: "hero", slot: 0 },
          to: { army: "hero", slot: 1 },
          count: 3,
        }),
      ),
    ).toBe("different-creature");

    let s = heroInTown(start());
    s = ok(
      transferStack(s, {
        heroId: "hero-0",
        townId: "t",
        from: { army: "hero", slot: 1 },
        to: { army: "garrison", slot: 1 },
      }),
    ).state;
    expect(
      errorOf(
        transferStack(s, {
          heroId: "hero-0",
          townId: "t",
          from: { army: "hero", slot: 0 },
          to: { army: "garrison", slot: 0 },
        }),
      ),
    ).toBe("hero-needs-army");
    expect(
      errorOf(
        transferStack(s, {
          heroId: "hero-0",
          from: { army: "hero", slot: 5 },
          to: { army: "hero", slot: 6 },
        }),
      ),
    ).toBe("empty-slot");
    expect(
      errorOf(
        transferStack(s, {
          heroId: "hero-0",
          from: { army: "hero", slot: 0 },
          to: { army: "hero", slot: 7 },
        }),
      ),
    ).toBe("bad-slot");
  });
});

describe("marketplace", () => {
  it("quotes trades through gold at the fixed rates", () => {
    expect(marketQuote("wood", 10, "ore")).toEqual({ receive: 1, change: 0 });
    expect(marketQuote("wood", 4, "gold")).toEqual({ receive: 100, change: 0 });
    expect(marketQuote("gold", 300, "wood")).toEqual({
      receive: 1,
      change: 50,
    });
    expect(marketQuote("essence", 10, "wood")).toEqual({
      receive: 2,
      change: 100,
    });
    expect(marketQuote("gold", 1200, "essence")).toEqual({
      receive: 2,
      change: 0,
    });
  });

  it("needs a Marketplace and applies the trade", () => {
    const s = start();
    expect(errorOf(marketTrade(s, 0, "wood", 10, "ore"))).toBe(
      "no-marketplace",
    );
    const m = ok(build(s, "t", "marketplace")).state; // 7000 gold, 15 wood
    const traded = ok(marketTrade(m, 0, "wood", 10, "ore")).state;
    expect(traded.players[0]!.resources).toMatchObject({
      wood: 5,
      ore: 11,
      gold: 7000,
    });
    const bought = ok(marketTrade(m, 0, "gold", 300, "wood")).state;
    expect(bought.players[0]!.resources).toMatchObject({
      wood: 16,
      gold: 6750,
    });
    expect(errorOf(marketTrade(m, 0, "wood", 5, "ore"))).toBe("bad-trade");
    expect(errorOf(marketTrade(m, 0, "wood", 16, "gold"))).toBe("resources");
    expect(errorOf(marketTrade(m, 0, "wood", 1, "wood"))).toBe("bad-trade");
  });
});
