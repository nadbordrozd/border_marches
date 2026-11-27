/**
 * The naval AI (docs/design/NAVAL.md section 12, bead bzc.156) on small
 * hand-built states: reach over land and sea, boarding and landing, buying
 * ships, the harbour in the build order and the naval adventure spells.
 */
import { describe, expect, it } from "vitest";
import { AdventureAi, buildQueue } from "../../../src/core/ai/index.ts";
import type { BuildPlan } from "../../../src/core/ai/economy.ts";
import { harbourPlan, shipsToScuttle } from "../../../src/core/ai/naval-ai.ts";
import { landPointsNow, pathIn, reachFor } from "../../../src/core/ai/reach.ts";
import {
  cloneState,
  isShoreCell,
  newGame,
  runAiTurn,
  townDock,
  type BattleResolver,
  type GameAction,
  type GameState,
  type HeroState,
  type TownState,
} from "../../../src/core/game/index.ts";
import type { MapObject } from "../../../src/core/map/types.ts";
import {
  registerSpells,
  withHeroMagic,
} from "../../../src/core/magic/index.ts";
import { buildMap, heroStart, mine, pickup, town } from "../game/helpers.ts";
import { STRAIT, boat } from "../game/naval-helpers.ts";

registerSpells();

/** The attacker always wins without losses (rules plumbing only). */
const winAll: BattleResolver = (setup) => ({
  winner: "attacker",
  attacker: setup.attacker.stacks.map((s) => s.count),
  defender: setup.defender.stacks.map(() => 0),
});

/** A naval game for one AI player on `rows` (the boats added on water). */
function naval(
  rows: readonly string[],
  objects: MapObject[],
  boats: MapObject[],
  hx = 4,
  hy = 5,
): GameState {
  const dry = buildMap([...rows], [heroStart(hx, hy), ...objects]);
  const map = { ...dry, naval: true, objects: [...dry.objects, ...boats] };
  const s = newGame(map, { players: [{ kind: "ai", faction: "humans" }] });
  // Seen in full: the tests are about the sea, not the fog.
  return {
    ...s,
    players: s.players.map((p) => ({
      ...p,
      explored: p.explored.map(() => true),
    })),
  };
}

function hero(s: GameState): HeroState {
  return s.heroes[0]!;
}

function withHero(s: GameState, patch: Partial<HeroState>): GameState {
  return {
    ...s,
    heroes: s.heroes.map((h, i) => (i === 0 ? { ...h, ...patch } : h)),
  };
}

const W = 20;

function decide(s: GameState): GameAction {
  return new AdventureAi({ resolver: null }).decide(s, 0);
}

describe("reach over land and sea", () => {
  it("boards a moored boat, sails and lands across the strait", () => {
    const s = withHero(
      naval(STRAIT, [mine("m", 17, 5, "gold")], [boat("b", 5, 5)]),
      { mp: 1500, maxMp: 1500, seaMaxMp: 1500 },
    );
    const h = hero(s);
    const r = reachFor(s, h, 1500 * 4);
    // The far shore is reached (sailing ten cells, then landing).
    expect(r.cost.has(5 * W + 16)).toBe(true);
    expect(r.cost.has(5 * W + 14)).toBe(true);
    const steps = pathIn(r, h, 5 * W + 16)!;
    expect(steps[0]).toMatchObject({ x: 5, y: 5, board: "ship-1" });
    const landing = steps.find((x) => x.land === true)!;
    expect(landing).toMatchObject({ x: 15, endsDay: true });
    // The landing ends the day: the step after it is tomorrow's.
    const after = steps[steps.indexOf(landing) + 1]!;
    expect(after.day).toBe(landing.day + 1);
  });

  it("does not reach across the water without a ship", () => {
    const s = naval(STRAIT, [mine("m", 17, 5, "gold")], []);
    const r = reachFor(s, hero(s), 1500 * 4);
    expect(r.cost.has(5 * W + 16)).toBe(false);
    expect([...r.cost.keys()].every((i) => i % W < 5)).toBe(true);
  });

  it("counts a hero's sea points afloat in land points", () => {
    const s = withHero(naval(STRAIT, [], [boat("b", 7, 5)]), {
      x: 7,
      y: 5,
      mp: 1000,
      maxMp: 1500,
      seaMaxMp: 2000,
    });
    expect(landPointsNow(s, hero(s))).toBe(750);
    const dry = withHero(naval(STRAIT, [], []), { mp: 1000 });
    expect(landPointsNow(dry, hero(dry))).toBe(1000);
  });
});

describe("the adventure AI at sea", () => {
  it("boards the boat to take a gold mine across the strait", () => {
    const s = withHero(
      naval(STRAIT, [mine("m", 17, 5, "gold")], [boat("b", 5, 5)]),
      { mp: 1500, maxMp: 1500, seaMaxMp: 1500 },
    );
    const action = new AdventureAi({ resolver: null }).decide(s, 0);
    expect(action.type).toBe("move");
    const path = (action as Extract<GameAction, { type: "move" }>).path;
    expect(path[0]).toEqual({ x: 5, y: 5 });
  });

  it("takes its boat off a bare start island to explore (Islands)", () => {
    const s0 = withHero(naval(STRAIT, [], [boat("b", 5, 5, 0)]), {
      mp: 1500,
      maxMp: 1500,
      seaMaxMp: 1500,
    });
    // Only the island and the near water are explored.
    const s: GameState = {
      ...s0,
      players: s0.players.map((p) => ({
        ...p,
        explored: p.explored.map((_, i) => i % W <= 7),
      })),
    };
    const action = decide(s);
    expect(action.type).toBe("move");
    const path = (action as Extract<GameAction, { type: "move" }>).path;
    expect(path[0]).toEqual({ x: 5, y: 5 });
    expect(path.length).toBeGreaterThan(1);
  });

  it("sails, lands and flags the mine within three days", () => {
    let s = withHero(
      naval(STRAIT, [mine("m", 17, 5, "gold")], [boat("b", 5, 5)]),
      { mp: 1500, maxMp: 1500, seaMaxMp: 1500 },
    );
    const ai = new AdventureAi({ resolver: null });
    for (let day = 0; day < 3 && s.mines["m"]?.owner !== 0; day++) {
      s = runAiTurn(s, () => ai, winAll).state;
    }
    expect(s.mines["m"]?.owner).toBe(0);
    // The boat is the player's now, moored where the hero landed.
    expect(s.ships?.[0]?.owner).toBe(0);
  });
});

// ------------------------------------------------------------ the harbour

const RICH = { gold: 50000, wood: 200, ore: 200, essence: 50 };

/** STRAIT with the player's town at (3, 5), its Shipyard built. */
function harbourGame(objects: MapObject[], boats: MapObject[] = []): GameState {
  const s = naval(STRAIT, [town("t0", 3, 5, 0), ...objects], boats, 2, 5);
  return {
    ...s,
    players: s.players.map((p) => ({ ...p, resources: { ...RICH } })),
    towns: {
      ...s.towns,
      t0: {
        ...s.towns["t0"]!,
        buildings: [...s.towns["t0"]!.buildings, "shipyard"],
      },
    },
  };
}

describe("buying a ship (NAVAL 12)", () => {
  it("buys one at its Shipyard when the best target lies across the water", () => {
    const s = harbourGame([mine("m", 17, 5, "gold")]);
    expect(townDock(s.map, "t0")).not.toBeNull();
    expect(decide(s)).toEqual({ type: "buy-ship", townId: "t0" });
  });

  it("buys none when nothing across the water is worth a ship", () => {
    const s = harbourGame([]);
    expect(decide(s).type).not.toBe("buy-ship");
    // A gold mine at home and a little wood across: not worth a ship.
    const home = harbourGame([
      mine("m", 1, 9, "gold"),
      pickup("w", 17, 5, { resource: "wood", amount: 2 }),
    ]);
    expect(decide(home).type).not.toBe("buy-ship");
  });

  it("buys none when a boat to take lies within reach", () => {
    const s = harbourGame([mine("m", 17, 5, "gold")], [boat("b", 5, 8)]);
    expect(decide(s).type).not.toBe("buy-ship");
  });
});

describe("a Shipwright's ship (NAVAL 12)", () => {
  /** A flagged Shipwright, its entrance (2, 6) and dock (5, 6); the hero on it. */
  function yard(objects: MapObject[]): GameState {
    const blocked: Array<[number, number]> = [];
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 3; dx++)
        if (dx !== 0 || dy !== 0) blocked.push([2 + dx, 6 - dy]);
    const shipwright: MapObject = {
      id: "yard",
      kind: "site",
      x: 2,
      y: 6,
      footprint: { w: 3, h: 2 },
      blocked,
      data: { type: "shipwright", dock: [5, 6] },
    };
    const s = withHero(naval(STRAIT, [shipwright, ...objects], [], 2, 7), {
      y: 6,
    });
    return {
      ...s,
      players: s.players.map((p) => ({ ...p, resources: { ...RICH } })),
      sites: { ...s.sites, yard: { ...s.sites["yard"], owner: 0 } },
    };
  }

  it("buys one for a gold mine across the water, none without", () => {
    const opt = (s: GameState): string | null => {
      const a = decide(s);
      return a.type === "use-site" && a.objectId === "yard" ? a.option : null;
    };
    expect(opt(yard([mine("m", 17, 5, "gold")]))).toBe("ship");
    expect(opt(yard([]))).toBeNull();
  });
});

describe("the harbour in the build order (NAVAL 12)", () => {
  const order = (t: TownState, plan: BuildPlan = {}): string[] =>
    buildQueue(t, plan).map((d) => d.id);

  it("stays out of the order without a harbour plan (every dry map)", () => {
    const s = harbourGame([]);
    const t = { ...s.towns["t0"]!, buildings: ["town-hall"] };
    const ids = order(t);
    expect(ids).not.toContain("shipyard");
    expect(ids).not.toContain("lighthouse");
    expect(ids).not.toContain("admiralty");
  });

  it("ranks the Shipyard with the Marketplace on a seaward map", () => {
    const s = harbourGame([]);
    const t = { ...s.towns["t0"]!, buildings: ["town-hall"] };
    const plan = harbourPlan(s, 0, [t]);
    expect(plan.harbour?.docks.has("t0")).toBe(true);
    expect(plan.harbour?.seaward).toBe(true);
    const ids = order(t, plan);
    expect(Math.abs(ids.indexOf("shipyard") - ids.indexOf("marketplace"))).toBe(
      1,
    );
    // On a Coast map it comes late, after the big dwellings.
    const coast = order(t, { harbour: { ...plan.harbour!, seaward: false } });
    expect(coast.indexOf("shipyard")).toBeGreaterThan(
      coast.indexOf("marketplace") + 5,
    );
  });

  it("puts the Lighthouse after the first ship and the Admiralty late", () => {
    const s = harbourGame([]);
    const t = s.towns["t0"]!;
    const base = harbourPlan(s, 0, [t]).harbour!;
    const none = order(t, { harbour: { ...base, ships: 0 } });
    const one = order(t, { harbour: { ...base, ships: 1 } });
    expect(one.indexOf("lighthouse")).toBeLessThan(none.indexOf("lighthouse"));
    expect(none.indexOf("lighthouse")).toBe(none.length - 1);
    expect(one.indexOf("admiralty")).toBeGreaterThan(one.indexOf("lighthouse"));
  });

  it("is not planned on a dry map", () => {
    const dry = newGame(
      buildMap([...STRAIT], [heroStart(2, 5), town("t0", 3, 5, 0)]),
    );
    expect(harbourPlan(dry, 0, Object.values(dry.towns))).toEqual({});
  });
});

// ------------------------------------------------------------ the spells

const SCHOOL_SKILLS = [
  "greencraft",
  "covenant",
  "horology",
  "quietus",
  "stormcalling",
];

/** The hero knows `spells`, rank 2 in every school, 40 mana. */
function caster(s: GameState, spells: string[]): GameState {
  const out = cloneState(s);
  const h = out.heroes[0]!;
  h.skills = SCHOOL_SKILLS.map((id) => ({ id, rank: 2 }) as never);
  h.mana = 40;
  withHeroMagic(h, { knownSpells: spells });
  return out;
}

const FULL = { mp: 1500, maxMp: 1500, seaMaxMp: 1500 };

describe("Call the Boat (NAVAL 12)", () => {
  it("calls the player's ship to the shore for a gold mine across the water", () => {
    const s = caster(
      withHero(
        naval(STRAIT, [mine("m", 17, 5, "gold")], [boat("b", 14, 6, 0)]),
        FULL,
      ),
      ["call-the-boat"],
    );
    expect(decide(s)).toEqual({
      type: "cast",
      heroId: "hero-0",
      spell: "call-the-boat",
      target: { x: 5, y: 5 },
    });
  });

  it("does not call it with nothing across the water", () => {
    const s = caster(withHero(naval(STRAIT, [], [boat("b", 14, 6, 0)]), FULL), [
      "call-the-boat",
    ]);
    const a = decide(s);
    expect(a.type === "cast" && a.spell === "call-the-boat").toBe(false);
  });

  it("walks a hero with nothing to do to the shore, ready to call a ship", () => {
    const s = caster(withHero(naval(STRAIT, [], []), { ...FULL, x: 1, y: 8 }), [
      "call-the-boat",
    ]);
    const a = decide(s);
    expect(a.type).toBe("move");
    const path = (a as Extract<GameAction, { type: "move" }>).path;
    const end = path[path.length - 1]!;
    expect(isShoreCell(s.map, end.x, end.y)).toBe(true);
    // With a boat to take it has no need to.
    const boatNear = caster(
      withHero(naval(STRAIT, [], [boat("b", 5, 8, 0)]), {
        ...FULL,
        x: 1,
        y: 8,
      }),
      ["call-the-boat"],
    );
    expect(decide(boatNear).type).not.toBe("move");
  });
});

describe("Scuttle (NAVAL 12)", () => {
  it("sinks a rival's moored ship near its towns, never its own or a neutral", () => {
    const s0 = harbourGame([], [boat("own", 5, 4, 0), boat("n", 5, 6)]);
    // Poor, so the town does not hire or recruit first.
    const s = caster(
      {
        ...s0,
        players: s0.players.map((p) => ({
          ...p,
          resources: { gold: 0, wood: 0, ore: 0, essence: 0 },
        })),
        ships: [...s0.ships!, { id: "ship-9", x: 6, y: 5, owner: 1 }],
      },
      ["scuttle"],
    );
    expect(decide(s)).toEqual({
      type: "cast",
      heroId: "hero-0",
      spell: "scuttle",
      target: { shipId: "ship-9" },
    });
    expect(shipsToScuttle(s, 0, s.ships!).map((x) => x.id)).toEqual(["ship-9"]);
    // Far from our towns and from its owner's heroes: left alone.
    expect(
      shipsToScuttle(s, 0, [{ id: "far", x: 19, y: 0, owner: 1 }]),
    ).toEqual([]);
  });
});

describe("Fair Wind (NAVAL 12)", () => {
  const afloat = (mp: number): GameState =>
    caster(
      withHero(
        naval(STRAIT, [mine("m", 17, 5, "gold")], [boat("b", 6, 5, 0)]),
        { ...FULL, x: 6, y: 5, mp },
      ),
      ["fair-wind"],
    );

  it("is cast afloat when the trip goes on at sea past today", () => {
    expect(decide(afloat(300))).toEqual({
      type: "cast",
      heroId: "hero-0",
      spell: "fair-wind",
    });
  });

  it("is not cast when today's points reach the far shore", () => {
    expect(decide(afloat(1500)).type).toBe("move");
  });
});

/** 20 x 12 with a three-cell lake channel (columns 8-10): no sea. */
const CHANNEL = Array.from({ length: 12 }, () => "gggggggg~~~ggggggggg");

describe("Lily Road (NAVAL 12)", () => {
  it("is cast for a short crossing to a gold mine", () => {
    const s = caster(
      withHero(naval(CHANNEL, [mine("m", 13, 5, "gold")], [], 6, 5), FULL),
      ["lily-road"],
    );
    expect(decide(s)).toEqual({
      type: "cast",
      heroId: "hero-0",
      spell: "lily-road",
    });
  });

  it("is not cast with nothing across", () => {
    const s = caster(withHero(naval(CHANNEL, [], [], 6, 5), FULL), [
      "lily-road",
    ]);
    const a = decide(s);
    expect(a.type === "cast" && a.spell === "lily-road").toBe(false);
  });
});
