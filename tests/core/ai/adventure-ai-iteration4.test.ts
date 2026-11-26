/**
 * The adventure AI's iteration-4 decisions (bead bzc.41) on small
 * hand-built states: the war plan (one rival at a time), towns not worth
 * retaking or taking, the home guard by value, routes beside sites that
 * give nothing, round trips from a guarded town, safe hires and the
 * difficulty levels. Whole matches belong to the simulation tier
 * (tools/sim/match.ts).
 */
import { describe, expect, it } from "vitest";
import {
  AdventureAi,
  DIFFICULTIES,
  DIFFICULTY,
} from "../../../src/core/ai/index.ts";
import {
  homeGuard,
  weeklyGrowthFv,
} from "../../../src/core/ai/adventure-ai.ts";
import { pathIn, reachFor } from "../../../src/core/ai/reach.ts";
import { armyFv } from "../../../src/core/ai/strength.ts";
import {
  aiStep,
  newGame,
  type ArmySlots,
  type BattleResolver,
  type GameAction,
  type GameEvent,
  type GameState,
  type PlayerController,
} from "../../../src/core/game/index.ts";
import type { MapObject } from "../../../src/core/map/types.ts";
import { registerSpells } from "../../../src/core/magic/index.ts";
import { OBJECT_TYPES } from "../../../src/data/objectTypes.ts";
import { buildMap, field, heroStart, pickup, town } from "../game/helpers.ts";

registerSpells();

/** The attacker always wins, losing a tenth of every stack. */
const winSome: BattleResolver = (setup) => ({
  winner: "attacker",
  attacker: setup.attacker.stacks.map((s) => Math.ceil(s.count * 0.9)),
  defender: setup.defender.stacks.map(() => 0),
});

const fast = (): AdventureAi => new AdventureAi({ resolver: null });

function army(...stacks: Array<[string, number]>): ArmySlots {
  const out: ArmySlots = [null, null, null, null, null, null, null];
  stacks.forEach(([creature, count], i) => {
    out[i] = { creature: creature as never, count };
  });
  return out;
}

function allSeen(s: GameState, player = 0): GameState {
  return {
    ...s,
    players: s.players.map((p) =>
      p.id === player ? { ...p, explored: p.explored.map(() => true) } : p,
    ),
  };
}

function withGold(s: GameState, gold: number): GameState {
  return {
    ...s,
    players: s.players.map((p) => ({
      ...p,
      resources: { ...p.resources, gold },
    })),
  };
}

/** Player 0's whole turn: its actions, events and the state after. */
function turnActions(
  s: GameState,
  ai: PlayerController,
  resolver: BattleResolver = winSome,
): { actions: GameAction[]; events: GameEvent[]; state: GameState } {
  const actions: GameAction[] = [];
  const events: GameEvent[] = [];
  let state = s;
  for (let i = 0; i < 200; i++) {
    const step = aiStep(state, () => ai, resolver);
    if (step.action !== null) actions.push(step.action);
    events.push(...step.events);
    state = step.state;
    if (step.outcome !== "continue") break;
  }
  return { actions, events, state };
}

function site(
  id: string,
  type: keyof typeof OBJECT_TYPES,
  x: number,
  y: number,
  data: Record<string, unknown> = {},
): MapObject {
  const def = OBJECT_TYPES[type];
  return {
    id,
    kind: def.kind,
    x,
    y,
    footprint: { w: 1, h: 1 },
    blocked: [],
    data: { type, value: def.value, ...data },
  };
}

/** Two players: humans at the west end, undead at the east end. */
function duel(width: number, objects: MapObject[] = []): GameState {
  return newGame(
    buildMap(field(width, 5), [
      town("t0", 0, 2, 0),
      heroStart(1, 2, 0),
      town("t1", width - 1, 2, 1),
      heroStart(width - 2, 2, 1),
      ...objects,
    ]),
    {
      players: [
        { kind: "ai", faction: "humans" },
        { kind: "ai", faction: "undead" },
      ],
    },
  );
}

describe("war plan", () => {
  /**
   * Three players on a 50 by 5 field. The humans' strong hero stands at
   * x = 10. The undead hold an empty town at x = 15 and a big garrison
   * far east; the goblins, much weaker, an empty town at x = 21.
   */
  function threeWay(): GameState {
    const s0 = newGame(
      buildMap(field(50, 5), [
        town("t0", 0, 2, 0),
        heroStart(1, 2, 0),
        town("t1", 15, 2, 1),
        town("t1b", 49, 2, 1),
        heroStart(48, 0, 1),
        town("t2", 21, 2, 2),
        heroStart(30, 0, 2),
      ]),
      {
        players: [
          { kind: "ai", faction: "humans" },
          { kind: "ai", faction: "undead" },
          { kind: "ai", faction: "goblins" },
        ],
      },
    );
    return allSeen({
      ...withGold(s0, 0),
      day: 10,
      towns: {
        ...s0.towns,
        t1: { ...s0.towns["t1"]!, garrison: army() },
        t1b: { ...s0.towns["t1b"]!, garrison: army(["vampire", 60]) },
        t2: { ...s0.towns["t2"]!, garrison: army() },
      },
      heroes: s0.heroes.map((h) =>
        h.owner === 0
          ? { ...h, x: 10, y: 2, army: army(["knight", 30]) }
          : h.owner === 1
            ? { ...h, x: 48, y: 0, army: army(["skeleton", 5]) }
            : { ...h, x: 30, y: 0, army: army(["goblin", 5]) },
      ),
    });
  }

  it("makes war on the weaker rival and leaves the other's towns alone", () => {
    const { state } = turnActions(threeWay(), fast());
    // The goblins (weak) are the focus: their town falls; the undead's
    // nearer empty town is left alone.
    expect(state.towns["t2"]!.owner).toBe(0);
    expect(state.towns["t1"]!.owner).toBe(1);
  });

  it("takes the nearer town when only one rival is left", () => {
    const s = threeWay();
    const duo: GameState = {
      ...s,
      players: s.players.map((p) =>
        p.id === 2 ? { ...p, eliminated: true } : p,
      ),
      towns: { ...s.towns, t2: { ...s.towns["t2"]!, owner: null } },
      heroes: s.heroes.filter((h) => h.owner !== 2),
    };
    const { state } = turnActions(duo, fast());
    expect(state.towns["t1"]!.owner).toBe(0);
  });

  it("leaves a rival town alone when its owner's stronger hero is near", () => {
    // An empty undead town between the humans' hero and a stronger undead
    // hero two cells beyond it: taken today, lost tomorrow.
    const s0 = duel(40, [town("t3", 20, 2, 1)]);
    const s: GameState = allSeen({
      ...withGold(s0, 0),
      day: 10,
      towns: {
        ...s0.towns,
        t3: { ...s0.towns["t3"]!, garrison: army() },
        t1: { ...s0.towns["t1"]!, garrison: army(["skeleton", 400]) },
      },
      heroes: s0.heroes.map((h) =>
        h.owner === 0
          ? { ...h, x: 14, y: 2, army: army(["knight", 12]) }
          : { ...h, x: 24, y: 2, army: army(["vampire", 20]) },
      ),
    });
    const ai = fast();
    const { state } = turnActions(s, ai);
    expect(state.towns["t3"]!.owner).toBe(1);
  });
});

describe("home guard by value", () => {
  it("is a share of a week's growth: half in the capital's first fortnight", () => {
    const s = duel(30);
    const t0 = s.towns["t0"]!;
    const growth = weeklyGrowthFv(t0);
    expect(growth).toBeGreaterThan(0);
    expect(homeGuard(s, t0, true)).toBeCloseTo(growth * 0.5);
    expect(homeGuard({ ...s, day: 15 }, t0, true)).toBeCloseTo(growth * 0.3);
    expect(homeGuard(s, t0, false)).toBeCloseTo(growth * 0.15);
  });

  it("lets the main hero take tier-1 creatures above the guard", () => {
    // An undead capital on day 20 with 60 skeletons and nothing else: the
    // main hero takes the skeletons above the guard (by tier it took none).
    const s0 = withGold(duel(30), 0);
    const t1 = s0.towns["t1"]!;
    const s: GameState = allSeen(
      {
        ...s0,
        day: 20,
        currentPlayer: 1,
        towns: {
          ...s0.towns,
          t1: {
            ...t1,
            garrison: army(["skeleton", 60]),
            dwellings: Object.fromEntries(
              Object.entries(t1.dwellings).map(([c, d]) => [
                c,
                { ...d!, available: 0 },
              ]),
            ),
          },
        },
        // No rival in sight: the guard is the home guard alone.
        heroes: s0.heroes
          .filter((h) => h.owner === 1)
          .map((h) => ({ ...h, x: 29, y: 2, army: army(["ghoul", 10]) })),
      },
      1,
    );
    const guard = homeGuard(s, s.towns["t1"]!, true);
    const ai = fast();
    let state = s;
    for (let i = 0; i < 10; i++) {
      const a = ai.decide(state, 1);
      if (a.type !== "transfer") break;
      const step = aiStep(state, () => ai, winSome);
      state = step.state;
    }
    const left = armyFv(state.towns["t1"]!.garrison);
    expect(left).toBeGreaterThanOrEqual(guard);
    expect(left).toBeLessThan(guard + 62 * 3);
    const hero = state.heroes.find((h) => h.owner === 1)!;
    expect(hero.army.some((x) => x?.creature === "skeleton")).toBe(true);
  });

  it("keeps a guard home in the capital on day one", () => {
    const s = withGold(duel(30), 0);
    const here: GameState = {
      ...s,
      heroes: s.heroes.map((h) => (h.owner === 0 ? { ...h, x: 0, y: 2 } : h)),
    };
    const guard = homeGuard(here, here.towns["t0"]!, true);
    const { state } = turnActions(here, fast());
    expect(armyFv(state.towns["t0"]!.garrison)).toBeGreaterThanOrEqual(guard);
  });
});

describe("pointless stops (reach.ts)", () => {
  it("routes beside an entrance that would stop the walk for nothing", () => {
    // A three-row corridor with a site in the middle of the middle row.
    const rows = field(9, 3);
    const s = allSeen(
      newGame(
        buildMap(rows, [heroStart(0, 1), site("well", "wishing-well", 4, 1)]),
      ),
    );
    const hero = s.heroes[0]!;
    const goal = 1 * 9 + 8;
    const well = 1 * 9 + 4;
    // Since bead bzc.107 every building is walked round when it is not
    // the target, a well worth something too.
    const plain = pathIn(reachFor(s, hero, 3000), hero, goal);
    expect(plain?.some((p) => p.y * 9 + p.x === well)).toBe(false);
    const r = reachFor(s, hero, 3000, new Set([well]));
    const around = pathIn(r, hero, goal);
    expect(around?.some((p) => p.y * 9 + p.x === well)).toBe(false);
    // The cost kept is the real cost of the route chosen.
    expect(r.cost.get(goal)).toBe(around?.[around.length - 1]?.total);
  });

  it("walks past a well the hero is already blessed by", () => {
    const rows = field(12, 3);
    const s0 = newGame(
      buildMap(rows, [
        town("t0", 0, 0, 0),
        heroStart(1, 1),
        site("well", "wishing-well", 5, 1),
        pickup("gold", 10, 1, { resource: "gold", amount: 1000, value: 1000 }),
      ]),
    );
    const s = allSeen({
      ...s0,
      heroes: s0.heroes.map((h) => ({ ...h, buffs: ["wishing-well"] })),
    });
    const { events, state } = turnActions(s, fast());
    expect(state.collected).toContain("gold");
    expect(events.some((e) => e.type === "site")).toBe(false);
  });
});

describe("guarded towns", () => {
  it("runs a round trip from a threatened town and is back by nightfall", () => {
    // A strong undead hero three days east threatens the humans' town; a
    // pickup lies three cells from it.
    const s0 = duel(60, [
      pickup("gold", 3, 0, { resource: "gold", amount: 1000, value: 1000 }),
    ]);
    const s: GameState = allSeen({
      ...withGold(s0, 0),
      day: 10,
      towns: { ...s0.towns, t0: { ...s0.towns["t0"]!, garrison: army() } },
      heroes: s0.heroes.map((h) =>
        h.owner === 0
          ? { ...h, x: 0, y: 2, army: army(["squire", 10]) }
          : { ...h, x: 20, y: 2, army: army(["vampire", 30]) },
      ),
    });
    const { state } = turnActions(s, fast());
    expect(state.collected).toContain("gold");
    const hero = state.heroes.find((h) => h.owner === 0)!;
    expect([hero.x, hero.y]).toEqual([0, 2]);
  });

  it("does not hire into a town a stronger rival hero can reach", () => {
    const s0 = duel(30);
    const s: GameState = allSeen({
      ...withGold(s0, 20000),
      day: 3,
      heroes: s0.heroes.map((h) =>
        h.owner === 0
          ? { ...h, x: 5, y: 0, army: army(["squire", 10]) }
          : { ...h, x: 8, y: 2, army: army(["vampire", 30]) },
      ),
    });
    const { actions } = turnActions(s, fast());
    expect(actions.some((a) => a.type === "hire")).toBe(false);
    // Without the rival it hires a second hero at once.
    const calm: GameState = {
      ...s,
      heroes: s.heroes.filter((h) => h.owner === 0),
    };
    expect(fast().decide(calm, 0).type).toBe("hire");
  });
});

describe("difficulty levels (iteration 4)", () => {
  it("orders growth, aggression and risk from easy to hard", () => {
    const [easy, normal, hard] = DIFFICULTIES.map((d) => DIFFICULTY[d]);
    expect(easy!.aggressionDay).toBeGreaterThan(normal!.aggressionDay);
    expect(hard!.aggressionDay).toBeLessThan(normal!.aggressionDay);
    expect(easy!.lossScale).toBeGreaterThan(hard!.lossScale);
    expect(easy!.guardScale).toBeGreaterThan(normal!.guardScale);
    expect(hard!.guardScale).toBeLessThan(normal!.guardScale);
    expect(easy!.buildEvery).toBeGreaterThan(normal!.buildEvery);
    expect(easy!.thirdHero).toBeNull();
    expect(hard!.thirdHero![0]).toBeLessThan(normal!.thirdHero![0]);
    expect(hard!.fourthHero![0]).toBeLessThan(normal!.fourthHero![0]);
  });

  it("hires a third hero early on Hard and never on Easy", () => {
    // Day 6, two heroes, 9000 gold, most of the map unexplored.
    const s0 = duel(40);
    const s: GameState = {
      ...withGold(s0, 9000),
      day: 6,
      heroes: [
        ...s0.heroes.filter((h) => h.owner === 0).map((h) => ({ ...h, x: 5 })),
        { ...s0.heroes[0]!, id: "hero-second", x: 8, y: 0 },
      ],
    };
    const first = (difficulty: "easy" | "normal" | "hard") =>
      new AdventureAi({ resolver: null, difficulty }).decide(s, 0).type;
    expect(first("hard")).toBe("hire");
    expect(first("normal")).not.toBe("hire");
    expect(first("easy")).not.toBe("hire");
  });

  it("builds every other day on Easy", () => {
    // Two heroes (no hire first) and gold for any building.
    const s0 = allSeen({ ...withGold(duel(30), 20000), day: 9 });
    const s: GameState = {
      ...s0,
      heroes: [
        ...s0.heroes,
        { ...s0.heroes[0]!, id: "hero-second", x: 8, y: 0 },
      ],
    };
    const built = (day: number, difficulty: "easy" | "normal") =>
      new AdventureAi({ resolver: null, difficulty }).decide({ ...s, day }, 0)
        .type === "build";
    expect(built(9, "normal")).toBe(true);
    expect(built(9, "easy")).toBe(false);
    expect(built(10, "easy")).toBe(true);
  });
});
