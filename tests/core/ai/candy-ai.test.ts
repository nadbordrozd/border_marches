/**
 * The adventure AI's Candy Kingdom (FACTION_CANDY.md section 12, bead
 * bzc.116) on small fixed states: the first-week opening, the Bakery and
 * Larder in the build order, the Keystone hall (The Four O'Clock) and the
 * Keystone carried home, the wander range, recruiting and the classes'
 * magic leaning.
 */
import { describe, expect, it } from "vitest";
import {
  AdventureAi,
  buildQueue,
  chooseBuild,
} from "../../../src/core/ai/index.ts";
import {
  OPENINGS,
  chooseRecruit,
  keystoneBuild,
  keystoneHallReady,
} from "../../../src/core/ai/economy.ts";
import {
  WANDER_DAYS,
  leansToMagic,
} from "../../../src/core/ai/adventure-ai.ts";
import { KEYSTONE_ITEM } from "../../../src/data/factionTowns.ts";
import { aiStep, newGame } from "../../../src/core/game/index.ts";
import type {
  BattleResolver,
  GameAction,
  GameState,
  HeroState,
  TownState,
} from "../../../src/core/game/index.ts";
import { build } from "../../../src/core/game/town.ts";
import { registerSpells } from "../../../src/core/magic/index.ts";
import type { MapObject } from "../../../src/core/map/types.ts";
import {
  buildMap,
  field,
  heroStart,
  ok,
  pickup,
  town,
} from "../game/helpers.ts";

registerSpells();

const RICH = { gold: 100000, wood: 500, ore: 500, essence: 100 };

/** The attacker always wins outright (no battle is expected here). */
const winAll: BattleResolver = (setup) => ({
  winner: "attacker",
  attacker: setup.attacker.stacks.map((s) => s.count),
  defender: setup.defender.stacks.map(() => 0),
});

function candy(
  rows: string[] = field(16, 5),
  objects: MapObject[] = [],
): GameState {
  return newGame(
    buildMap(rows, [town("t0", 0, 2, 0), heroStart(1, 2, 0), ...objects]),
    { players: [{ kind: "ai", faction: "candy" }] },
  );
}

function withTown(s: GameState, patch: Partial<TownState>): GameState {
  return { ...s, towns: { ...s.towns, t0: { ...s.towns["t0"]!, ...patch } } };
}

function rich(s: GameState): GameState {
  return {
    ...s,
    players: s.players.map((p) => ({ ...p, resources: { ...RICH } })),
  };
}

function poor(s: GameState): GameState {
  return {
    ...s,
    players: s.players.map((p) => ({
      ...p,
      resources: { gold: 0, wood: 0, ore: 0, essence: 0 },
    })),
  };
}

function withHero(s: GameState, patch: Partial<HeroState>): GameState {
  return {
    ...s,
    heroes: s.heroes.map((h, i) => (i === 0 ? { ...h, ...patch } : h)),
  };
}

const at = (t: TownState, id: string): number =>
  buildQueue(t).findIndex((d) => d.id === id);

describe("the Confectionery's build order", () => {
  it("opens with the Mint Range, Town Hall, Candy-Cane Fence and Taffy Ranch", () => {
    expect(OPENINGS["candy"]).toEqual([
      "mint-range",
      "town-hall",
      "fort-1",
      "taffy-ranch",
    ]);
    let s = rich(candy());
    const built: string[] = [];
    for (let day = 1; day <= 4; day++) {
      const choice = chooseBuild({ ...s, day }, s.towns["t0"]!);
      expect(choice.build).not.toBeNull();
      built.push(choice.build as string);
      s = ok(build({ ...s, day }, "t0", choice.build as string)).state;
      s = withTown(s, { builtToday: false });
    }
    expect(built).toEqual(OPENINGS["candy"]);
  });

  it("puts the Bakery after the Town Hall and the Larder after the Sugarplum Bower", () => {
    const t = candy().towns["t0"]!;
    expect(at(t, "town-hall")).toBeLessThan(at(t, "bakery"));
    expect(at(t, "mint-range")).toBeLessThan(at(t, "bakery"));
    expect(at(t, "bakery")).toBeLessThan(at(t, "fort-1"));
    expect(at(t, "sugarplum-bower")).toBeLessThan(at(t, "larder"));
    expect(at(t, "larder")).toBeLessThan(at(t, "gummy-den"));
    // The Drills and the Keystone hall keep their places (the hall is
    // never queued: it needs the Keystone).
    expect(at(t, "gummy-den")).toBeLessThan(at(t, "bread-oven"));
    expect(at(t, "the-four-oclock")).toBe(-1);
  });

  it("after the opening, builds the Bakery next", () => {
    const s = rich(
      withTown(candy(), {
        buildings: [...candy().towns["t0"]!.buildings, ...OPENINGS["candy"]!],
      }),
    );
    expect(chooseBuild({ ...s, day: 8 }, s.towns["t0"]!).build).toBe("bakery");
  });

  it("builds the Larder as soon as the Sugarplum Bower stands", () => {
    const s0 = candy();
    const s = rich(
      withTown(s0, {
        buildings: [
          ...s0.towns["t0"]!.buildings,
          "town-hall",
          "city-hall",
          "fort-1",
          "mint-range",
          "taffy-ranch",
          "bakery",
          "marketplace",
          "magic-guild-1",
          "sugarplum-bower",
        ],
      }),
    );
    expect(chooseBuild({ ...s, day: 20 }, s.towns["t0"]!).build).toBe("larder");
  });
});

describe("The Four O'Clock (the Keystone hall)", () => {
  const ready = (): GameState => {
    const s0 = candy();
    return rich(
      withTown(s0, {
        buildings: [...s0.towns["t0"]!.buildings, "town-hall", "city-hall"],
      }),
    );
  };

  it("is built the day a hero brings the Keystone into town", () => {
    const s = ready();
    const t = s.towns["t0"]!;
    expect(keystoneHallReady(t)).toBe(true);
    expect(keystoneBuild(s, t)).toBeNull();
    const bearer = withHero(s, { backpack: [KEYSTONE_ITEM], x: 0, y: 2 });
    expect(keystoneBuild(withHero(s, { x: 0, y: 2 }), t)).toBeNull();
    expect(keystoneBuild(bearer, t)).toBe("the-four-oclock");
    expect(chooseBuild(bearer, t).build).toBe("the-four-oclock");
    const built = ok(build(bearer, "t0", "the-four-oclock")).state;
    expect(built.towns["t0"]!.buildings).toContain("the-four-oclock");
    expect(keystoneHallReady(built.towns["t0"]!)).toBe(false);
  });

  it("needs the City Hall first", () => {
    const s0 = candy();
    expect(keystoneHallReady(s0.towns["t0"]!)).toBe(false);
    const bearer = withHero(rich(s0), {
      backpack: [KEYSTONE_ITEM],
      x: 0,
      y: 2,
    });
    expect(keystoneBuild(bearer, bearer.towns["t0"]!)).toBeNull();
  });

  it("the AI builds it on its turn, whatever the day", () => {
    // No gold to hire or build anything else: the hall costs nothing.
    const s = poor(
      withHero(ready(), { backpack: [KEYSTONE_ITEM], x: 0, y: 2 }),
    );
    // Day 3: Easy builds only on even days; the hall does not wait.
    const ai = new AdventureAi({ resolver: null, difficulty: "easy" });
    const actions: GameAction[] = [];
    let state: GameState = { ...s, day: 3 };
    for (let i = 0; i < 50; i++) {
      const step = aiStep(state, () => ai, winAll);
      if (step.action !== null) actions.push(step.action);
      state = step.state;
      if (step.outcome !== "continue") break;
    }
    expect(actions).toContainEqual({
      type: "build",
      townId: "t0",
      building: "the-four-oclock",
    });
    expect(state.towns["t0"]!.buildings).toContain("the-four-oclock");
  });

  it("a hero carrying the Keystone heads home to build it", () => {
    // Gold lies 8 cells east of the hero, its town 12 cells west.
    const base = candy(field(24, 5), [
      pickup("gold", 20, 2, { resource: "gold", amount: 3000, value: 3000 }),
    ]);
    const s0 = poor(
      withTown(base, {
        buildings: [...base.towns["t0"]!.buildings, "town-hall", "city-hall"],
      }),
    );
    const seen = (s: GameState): GameState => ({
      ...s,
      players: s.players.map((p) => ({
        ...p,
        explored: p.explored.map(() => true),
      })),
    });
    const heading = (backpack: string[]): number => {
      const s = seen(withHero(s0, { backpack, x: 12, y: 2 }));
      const action = new AdventureAi({ resolver: null }).decide(s, 0);
      expect(action.type).toBe("move");
      if (action.type !== "move") return 0;
      return Math.sign(action.path[action.path.length - 1]!.x - 12);
    };
    expect(heading([])).toBe(1);
    expect(heading([KEYSTONE_ITEM])).toBe(-1);
  });
});

describe("the Candy Kingdom's adventure play", () => {
  it("ranges two days from home in the first weeks", () => {
    expect(WANDER_DAYS["candy"]).toBe(2);
  });

  it("recruits the highest tier first", () => {
    const s0 = rich(candy());
    const t0 = s0.towns["t0"]!;
    const s = withTown(s0, {
      dwellings: {
        ...t0.dwellings,
        "gummy-bear": { available: 2, remainder: 0 },
        "peppermint-archer": { available: 9, remainder: 0 },
      },
    });
    expect(chooseRecruit(s, s.towns["t0"]!, {}, true)).toMatchObject({
      type: "recruit",
      creature: "gummy-bear",
      count: 2,
    });
  });

  it("the Confectioner leans to magic (the guild moves up), the Nutcracker does not", () => {
    const h = candy().heroes[0]!;
    expect(leansToMagic({ ...h, heroClass: "confectioner" })).toBe(true);
    expect(leansToMagic({ ...h, heroClass: "nutcracker", skills: [] })).toBe(
      false,
    );
    const t = candy().towns["t0"]!;
    const plan = { magic: true };
    expect(
      buildQueue(t, plan).findIndex((d) => d.id === "magic-guild-1"),
    ).toBeLessThan(buildQueue(t).findIndex((d) => d.id === "magic-guild-1"));
  });
});
