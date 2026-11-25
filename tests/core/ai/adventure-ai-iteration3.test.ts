/**
 * The adventure AI's iteration-3 decisions (bead bzc.23) on small
 * hand-built states: the difficulty levels, the fast mode's cost model,
 * the capital's guard from day one, towns on watch for a rival gone into
 * the fog, the first day of attacks on players, waystones in route
 * planning, garrisons left in towns rivals roam near, and building under
 * threat. Whole matches belong to the simulation tier (tools/sim/match.ts).
 */
import { describe, expect, it } from "vitest";
import {
  AdventureAi,
  applyDifficulty,
  DIFFICULTIES,
  DIFFICULTY,
  difficultyOf,
} from "../../../src/core/ai/index.ts";
import { homeGuard } from "../../../src/core/ai/adventure-ai.ts";
import { pathIn, reachFor } from "../../../src/core/ai/reach.ts";
import {
  armyFv,
  fastPredictedMs,
  predictedMs,
} from "../../../src/core/ai/strength.ts";
import {
  aiStep,
  battleSetup,
  newGame,
  type ArmySlots,
  type BattleResolver,
  type GameAction,
  type GameState,
  type PlayerController,
} from "../../../src/core/game/index.ts";
import type { MapObject } from "../../../src/core/map/types.ts";
import { registerSpells } from "../../../src/core/magic/index.ts";
import { OBJECT_TYPES } from "../../../src/data/objectTypes.ts";
import { buildMap, field, heroStart, town } from "../game/helpers.ts";

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

function turnActions(
  s: GameState,
  ai: PlayerController,
  resolver: BattleResolver = winSome,
): { actions: GameAction[]; state: GameState } {
  const actions: GameAction[] = [];
  let state = s;
  for (let i = 0; i < 200; i++) {
    const step = aiStep(state, () => ai, resolver);
    if (step.action !== null) actions.push(step.action);
    state = step.state;
    if (step.outcome !== "continue") break;
  }
  return { actions, state };
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

describe("difficulty (difficulty.ts)", () => {
  it("scales the budget, risk and aggression from easy to hard", () => {
    const [easy, normal, hard] = DIFFICULTIES.map((d) => DIFFICULTY[d]);
    expect(easy!.turnSimMs).toBeLessThan(normal!.turnSimMs);
    expect(normal!.turnSimMs).toBeLessThan(hard!.turnSimMs);
    expect(easy!.simsPerTurn).toBeLessThan(hard!.simsPerTurn);
    expect(easy!.lossScale).toBeGreaterThan(hard!.lossScale);
    expect(easy!.edgeBonus).toBeGreaterThan(hard!.edgeBonus);
    expect(easy!.aggressionDay).toBeGreaterThan(normal!.aggressionDay);
    expect(normal!.aggressionDay).toBeGreaterThan(hard!.aggressionDay);
    // Only Hard has a resource bonus.
    expect(easy!.startBonus).toEqual({});
    expect(normal!.startBonus).toEqual({});
    expect(hard!.startBonus.gold).toBeGreaterThan(0);
  });

  it("is normal when the state names none (older saves)", () => {
    const s = duel(12);
    expect(s.difficulty).toBeUndefined();
    expect(difficultyOf(s)).toBe("normal");
  });

  it("gives Hard's bonus to computer players only, and skips the listed", () => {
    const s0 = newGame(
      buildMap(field(12, 5), [
        town("t0", 0, 2, 0),
        heroStart(1, 2, 0),
        town("t1", 11, 2, 1),
        heroStart(10, 2, 1),
      ]),
      {
        players: [
          { kind: "human", faction: "humans" },
          { kind: "ai", faction: "undead" },
        ],
      },
    );
    const gold = (s: GameState, p: number) => s.players[p]!.resources.gold;
    const hard = applyDifficulty(s0, "hard");
    expect(hard.difficulty).toBe("hard");
    expect(gold(hard, 0)).toBe(gold(s0, 0));
    expect(gold(hard, 1)).toBe(
      gold(s0, 1) + (DIFFICULTY.hard.startBonus.gold ?? 0),
    );
    expect(applyDifficulty(s0, "hard", [1]).players[1]!.resources).toEqual(
      s0.players[1]!.resources,
    );
    const normal = applyDifficulty(s0, "normal");
    expect(normal.players).toEqual(s0.players);
    expect(normal.difficulty).toBe("normal");
  });

  it("leaves a weak rival town alone before the difficulty's first attack day", () => {
    // An empty undead town three cells from the humans' strong hero.
    const base = duel(12);
    const s: GameState = allSeen({
      ...withGold(base, 0),
      towns: {
        ...base.towns,
        t1: { ...base.towns["t1"]!, garrison: army() },
      },
      heroes: base.heroes.map((h) =>
        h.owner === 0
          ? { ...h, x: 7, army: army(["knight", 30]) }
          : { ...h, x: 1, y: 0 },
      ),
    });
    const target = (day: number, difficulty: "normal" | "hard") => {
      const ai = new AdventureAi({ resolver: null, difficulty });
      const { state } = turnActions({ ...s, day }, ai);
      return state.towns["t1"]!.owner;
    };
    // Day 5: Normal waits for day 8, Hard (day 4) takes it.
    expect(target(5, "normal")).toBe(1);
    expect(target(5, "hard")).toBe(0);
    expect(target(8, "normal")).toBe(0);
  });
});

describe("fight budget (strength.ts)", () => {
  it("counts the fast battle AI at about a quarter of the full mode", () => {
    const s = duel(12, []);
    const setup = battleSetup({
      ...s,
      pendingBattle: { kind: "hero", objectId: "hero-1", heroId: "hero-0" },
    });
    expect(setup).not.toBeNull();
    const ratio = predictedMs(setup!) / fastPredictedMs(setup!);
    expect(ratio).toBeGreaterThan(3.5);
    expect(ratio).toBeLessThan(5.5);
  });
});

describe("capital defence", () => {
  it("keeps a guard home from day one", () => {
    // Iteration 4: by value (half a week's growth in the capital's first
    // fortnight, about the militia's tier-1 stack), no longer by tier.
    const s = withGold(duel(30), 0);
    const here: GameState = {
      ...s,
      heroes: s.heroes.map((h) => (h.owner === 0 ? { ...h, x: 0, y: 2 } : h)),
    };
    const garrison = here.towns["t0"]!.garrison;
    expect(garrison.some((g) => g !== null)).toBe(true);
    const guard = homeGuard(here, here.towns["t0"]!, true);
    expect(guard).toBeGreaterThan(0);
    const { state } = turnActions(here, fast());
    expect(armyFv(state.towns["t0"]!.garrison)).toBeGreaterThanOrEqual(guard);
  });

  it("keeps the garrison home while a rival seen nearby is in the fog", () => {
    // Day 1: a strong undead hero is seen 50 cells east (beyond the two
    // days of an alert); on day 3 it is in the fog. The humans' main hero
    // in its town does not take the town's archers along.
    const width = 60;
    const s0 = withGold(duel(width), 0);
    const troops = army(["squire", 10], ["longbowman", 12]);
    const start: GameState = {
      ...s0,
      towns: { ...s0.towns, t0: { ...s0.towns["t0"]!, garrison: troops } },
      heroes: s0.heroes.map((h) =>
        h.owner === 0
          ? { ...h, x: 0, y: 2, army: army(["squire", 5]) }
          : { ...h, x: 50, y: 2, army: army(["vampire", 30]) },
      ),
    };
    const ai = fast();
    // Seen on day 1 (decide records it).
    ai.decide(allSeen(start), 0);
    // Day 3: the rival is hidden (its cell unexplored).
    const hidden: GameState = {
      ...start,
      day: 3,
      players: start.players.map((p) =>
        p.id === 0
          ? { ...p, explored: p.explored.map((_, i) => i % width < 30) }
          : p,
      ),
    };
    const { state } = turnActions(hidden, ai);
    const archers = state.towns["t0"]!.garrison.find(
      (g) => g?.creature === "longbowman",
    );
    expect(archers?.count).toBe(12);
    // Without the sighting the hero takes them.
    const { state: fresh } = turnActions(hidden, fast());
    expect(
      fresh.towns["t0"]!.garrison.some((g) => g?.creature === "longbowman"),
    ).toBe(false);
  });

  it("builds in a threatened town once nothing is left to recruit", () => {
    const s0 = duel(14);
    const t0 = s0.towns["t0"]!;
    const empty = Object.fromEntries(
      Object.entries(t0.dwellings).map(([c, d]) => [
        c,
        { ...d!, available: 0 },
      ]),
    );
    const s: GameState = allSeen({
      ...withGold(s0, 20000),
      day: 9,
      towns: { ...s0.towns, t0: { ...t0, dwellings: empty } },
      heroes: [
        ...s0.heroes.map((h) =>
          h.owner === 1 ? { ...h, x: 5, army: army(["vampire", 40]) } : h,
        ),
        // A second hero, so the treasury does not go to the tavern.
        { ...s0.heroes[0]!, id: "hero-second", x: 2, y: 0 },
      ],
    });
    const action = fast().decide(s, 0);
    expect(action.type).toBe("build");
  });
});

describe("waystones in route planning (reach.ts)", () => {
  it("reaches the ground behind a wall through a one-way waystone", () => {
    // A mountain wall at x = 4; the waystone at (2, 1) leads to (7, 1).
    const rows = ["ggggMgggg", "ggggMgggg", "ggggMgggg"];
    const s = allSeen(
      newGame(
        buildMap(rows, [
          heroStart(0, 1),
          site("ow", "one-way-waystone", 2, 1, { exit: [7, 1] }),
        ]),
      ),
    );
    const hero = s.heroes[0]!;
    const r = reachFor(s, hero, 3000);
    const far = 1 * 9 + 8;
    expect(r.cost.has(far)).toBe(true);
    // The walk ends on the waystone: the hero is carried from there.
    const steps = pathIn(r, hero, far);
    expect(steps?.[steps.length - 1]).toMatchObject({ x: 2, y: 1 });
  });
});

describe("consolidation", () => {
  it("leaves a stack in a town a rival roams near", () => {
    // The humans' main hero stands in an empty second town; an undead
    // hero is in sight two days away.
    const s0 = duel(40, [town("t2", 20, 2, 0)]);
    const s: GameState = allSeen({
      ...withGold(s0, 0),
      day: 10,
      towns: {
        ...s0.towns,
        t2: { ...s0.towns["t2"]!, garrison: army() },
      },
      heroes: s0.heroes.map((h) =>
        h.owner === 0
          ? {
              ...h,
              x: 20,
              y: 2,
              army: army(["knight", 10], ["longbowman", 20], ["squire", 30]),
            }
          : { ...h, x: 38, y: 2, army: army(["skeleton", 40]) },
      ),
    });
    const action = fast().decide(s, 0);
    expect(action).toMatchObject({
      type: "transfer",
      args: { from: { army: "hero" }, to: { army: "garrison" } },
    });
  });
});
