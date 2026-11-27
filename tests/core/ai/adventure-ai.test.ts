/**
 * The adventure AI's key decisions on small hand-built states (bead
 * bzc.19), plus a short fixed-seed smoke match. Whole matches belong to the
 * simulation tier (tools/sim/match.ts), not here.
 */
import { describe, expect, it } from "vitest";
import { HEAVY_TIMEOUT } from "../../timeouts.ts";
import {
  AdventureAi,
  buildQueue,
  chooseBuild,
} from "../../../src/core/ai/index.ts";
import { playMatch } from "../../../src/core/ai/match.ts";
import { pathIn, reachFor } from "../../../src/core/ai/reach.ts";
import {
  aiStep,
  newGame,
  runAiTurn,
  type BattleResolver,
  type GameAction,
  type GameState,
  type HeroState,
  type PlayerController,
} from "../../../src/core/game/index.ts";
import type { MapObject } from "../../../src/core/map/types.ts";
import { createBattleResolver } from "../../../src/core/battle/resolver.ts";
import { ARTIFACT_LIST } from "../../../src/data/artifacts.ts";
import {
  buildMap,
  field,
  heroStart,
  mine,
  monster,
  pickup,
  town,
} from "../game/helpers.ts";

/** The attacker always wins without losses (rules plumbing only). */
const winAll: BattleResolver = (setup) => ({
  winner: "attacker",
  attacker: setup.attacker.stacks.map((s) => s.count),
  defender: setup.defender.stacks.map(() => 0),
});

/** One AI player of `faction` with a town at (0,2) and its hero at (1,2). */
function game(
  extra: MapObject[] = [],
  faction: "humans" | "undead" | "goblins" = "humans",
  width = 14,
): GameState {
  return newGame(
    buildMap(field(width, 5), [
      town("t0", 0, 2, 0),
      heroStart(1, 2, 0),
      ...extra,
    ]),
    { players: [{ kind: "ai", faction }] },
  );
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

/** Plays one AI turn and returns every action it took. */
function turnActions(
  s: GameState,
  ai: PlayerController,
  resolver: BattleResolver = winAll,
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

const fast = (): AdventureAi => new AdventureAi({ resolver: null });

describe("AdventureAi decisions", () => {
  it("takes a free resource", () => {
    const s = game([pickup("gold", 6, 2, { resource: "gold", amount: 500 })]);
    const after = runAiTurn(s, () => fast(), winAll).state;
    expect(after.collected).toContain("gold");
  });

  it("takes a pickup from the next cell, never stepping on it", () => {
    // No gold: no hire, so hero-0 is the one to go (bead bzc.49).
    const s = withGold(
      game([pickup("gold", 6, 2, { resource: "gold", amount: 500 })]),
      0,
    );
    const { actions, state } = turnActions(s, fast());
    expect(state.collected).toContain("gold");
    const moves = actions.filter((a) => a.type === "move");
    // The first walk to touch the pile's cell reaches for it as its last
    // step (it is open ground afterwards).
    const at = (m: (typeof moves)[number]): number =>
      m.path.findIndex((c) => c.x === 6 && c.y === 2);
    const first = moves.find((m) => at(m) >= 0);
    expect(first).toBeDefined();
    expect(at(first!)).toBe(first!.path.length - 1);
  });

  it("reaches for a pickup beside its walk on the way", () => {
    // Row 2 runs to the mine; the pile lies beside it, a row up.
    const s = withGold(
      game([
        mine("ore-pit", 11, 2, "ore"),
        pickup("wood", 6, 1, { resource: "wood", amount: 5 }),
      ]),
      0,
    );
    const { actions, state } = turnActions(s, fast());
    expect(state.collected).toContain("wood");
    expect(state.mines["ore-pit"]?.owner).toBe(0);
    // The walk to the mine stops beside the pile and reaches for it first.
    const first = actions.find((a) => a.type === "move");
    expect(first?.type === "move" && first.path.at(-1)).toEqual({
      x: 6,
      y: 1,
    });
  });

  it("leaves a loose artifact it has no room for, without looping", () => {
    const art = ARTIFACT_LIST.find((x) => x.kind === "worn")!.id;
    const s0 = withGold(
      game([
        {
          id: "la",
          kind: "artifact",
          x: 2,
          y: 3,
          footprint: { w: 1, h: 1 },
          blocked: [],
          data: { type: "loose-artifact", artifact: art },
        },
      ]),
      0,
    );
    const s: GameState = {
      ...s0,
      heroes: s0.heroes.map((h) => ({
        ...h,
        backpack: Array.from({ length: 40 }, () => art),
      })),
    };
    const { actions, state } = turnActions(s, fast());
    expect(state.collected).not.toContain("la");
    expect(actions.at(-1)).toEqual({ type: "end-turn" });
    expect(actions.length).toBeLessThan(20);
  });

  it("plans through a pickup in a corridor: the walk ends reaching for it", () => {
    // A one-cell corridor (row 0 between mountains) with a pile in it.
    const s0 = newGame(
      buildMap(
        ["gggggggg", "gMMMMMMM"],
        [
          heroStart(0, 0, 0),
          pickup("wood", 3, 0, { resource: "wood", amount: 5 }),
        ],
      ),
      { players: [{ kind: "ai", faction: "humans" }] },
    );
    const hero = s0.heroes[0]!;
    const reach = reachFor(s0, hero, 3000);
    // Ground behind it counts; no hero stands on the pile's cell.
    expect(reach.cost.has(6)).toBe(true);
    expect(reach.cost.has(3)).toBe(false);
    const steps = pathIn(reach, hero, 6)!;
    expect(steps.map((st) => [st.x, st.cost, st.pickup === true])).toEqual([
      [1, 100, false],
      [2, 100, false],
      [3, 0, true],
    ]);
  });

  it("takes a pickup it stands beside at once", () => {
    const s = withGold(
      game([pickup("gold", 2, 3, { resource: "gold", amount: 500 })]),
      0,
    );
    const { actions, state } = turnActions(s, fast());
    expect(state.collected).toContain("gold");
    const move = actions.find((a) => a.type === "move");
    expect(move?.type === "move" && move.path).toEqual([{ x: 2, y: 3 }]);
  });

  it("takes a pickup from the side a stack's zone does not cover", () => {
    const s = game([
      pickup("ore", 7, 3, { resource: "ore", amount: 5 }),
      monster("m", 7, 1, "goblin", 600),
    ]);
    const { state } = turnActions(s, fast());
    expect(state.collected).toContain("ore");
    expect(state.monsters["m"]).toBeDefined();
  });

  it("flags a free mine", () => {
    const s = game([mine("ore-pit", 7, 2, "ore")]);
    const after = runAiTurn(s, () => fast(), winAll).state;
    expect(after.mines["ore-pit"]?.owner).toBe(0);
  });

  it("does not walk into a guard far stronger than its army", () => {
    const s = game([
      pickup("ore", 7, 2, { resource: "ore", amount: 5 }),
      monster("m", 7, 1, "goblin", 600),
    ]);
    const ai = fast();
    const { actions, state } = turnActions(s, ai);
    expect(state.monsters["m"]).toBeDefined();
    expect(state.heroes.find((h) => h.id === "hero-0")?.alive).toBe(true);
    // No move ends in the stack's zone (columns 6..8, rows 0..2).
    for (const a of actions) {
      if (a.type !== "move" || a.heroId !== "hero-0") continue;
      const last = a.path[a.path.length - 1]!;
      expect(last.x >= 6 && last.x <= 8 && last.y <= 2).toBe(false);
    }
    expect(state.collected).not.toContain("ore");
  });

  it("attacks a weak guard to take what it guards", () => {
    const s = game([
      pickup("ore", 7, 2, { resource: "ore", amount: 5 }),
      monster("m", 7, 1, "goblin", 2),
    ]);
    const after = runAiTurn(s, () => fast(), winAll).state;
    expect(after.monsters["m"]).toBeUndefined();
    expect(after.collected).toContain("ore");
  });

  it("estimates a close fight by simulating it", () => {
    const ai = new AdventureAi({ resolver: createBattleResolver() });
    const s = game([monster("m", 4, 2, "goblin", 30)]);
    ai.decide(s, 0);
    // The hero's start army (about 2000 fight value) against 30 goblins
    // (about 1600) is a close call: it is fought on a copy.
    const lines = ai.explain(s, 0).join("\n");
    expect(lines).toContain("mon:m");
    expect(ai.simulations).toBeGreaterThan(0);
  });

  it("builds income first after the first week's opening", () => {
    const s = { ...game(), day: 8 };
    const { actions } = turnActions(s, fast());
    const firstBuild = actions.find((a) => a.type === "build");
    expect(firstBuild).toMatchObject({ type: "build", building: "town-hall" });
    // The build order starts with the hall for every faction.
    for (const f of ["humans", "undead", "goblins"] as const) {
      const t = game([], f).towns["t0"]!;
      expect(buildQueue(t)[0]?.id).toBe("town-hall");
    }
  });

  it("saves for a key building it cannot afford yet", () => {
    const s = { ...withGold(game(), 1000), day: 8 };
    const choice = chooseBuild(s, s.towns["t0"]!);
    expect(choice.build).toBeNull();
    expect(choice.saving?.id).toBe("town-hall");
  });

  it("recruits everything affordable at the week's end", () => {
    const s = { ...withGold(game(), 20000), day: 6 };
    const before = s.towns["t0"]!.dwellings.squire!.available;
    expect(before).toBeGreaterThan(0);
    const { actions, state } = turnActions(s, fast());
    expect(actions.some((a) => a.type === "recruit")).toBe(true);
    expect(state.towns["t0"]!.dwellings.squire!.available).toBe(0);
  });

  it("hires a second hero early", () => {
    const s = game();
    const { actions } = turnActions(s, fast());
    expect(actions[0]?.type).toBe("hire");
  });

  it("hands its troops to the main hero when they meet", () => {
    const s0 = withGold(game(), 0);
    const main = s0.heroes[0]!;
    const second: HeroState = {
      ...main,
      id: "hero-second",
      defId: "second",
      x: 2,
      y: 2,
      army: [
        { creature: "squire", count: 5 },
        { creature: "longbowman", count: 3 },
        null,
        null,
        null,
        null,
        null,
      ],
    };
    const strong: HeroState = {
      ...main,
      army: [
        { creature: "knight", count: 10 },
        null,
        null,
        null,
        null,
        null,
        null,
      ],
    };
    const s = { ...s0, heroes: [strong, second] };
    const action = fast().decide(s, 0);
    expect(action).toMatchObject({
      type: "transfer",
      args: {
        heroId: "hero-second",
        otherHeroId: "hero-0",
        from: { army: "hero" },
        to: { army: "other" },
      },
    });
  });

  it("does not end its day where a much stronger enemy hero can strike", () => {
    const s0 = newGame(
      buildMap(field(24, 5), [
        town("t0", 0, 2, 0),
        heroStart(1, 2, 0),
        town("t1", 23, 2, 1),
        heroStart(14, 2, 1),
        // Taken from a next cell (bead bzc.49): from (7,2) at the nearest,
        // inside the giant's reach.
        pickup("gold", 8, 2, { resource: "gold", amount: 500 }),
      ]),
      {
        players: [
          { kind: "ai", faction: "humans" },
          { kind: "ai", faction: "undead" },
        ],
      },
    );
    const s: GameState = {
      ...withGold(s0, 0),
      // Player 0 sees the whole field; player 1's hero is a giant.
      players: s0.players.map((p) =>
        p.id === 0 ? { ...p, explored: p.explored.map(() => true) } : p,
      ),
      heroes: s0.heroes.map((h) =>
        h.owner === 1
          ? {
              ...h,
              army: [
                { creature: "vampire", count: 40 },
                null,
                null,
                null,
                null,
                null,
                null,
              ],
            }
          : h,
      ),
    };
    const ai = fast();
    const { state } = turnActions(s, ai);
    expect(state.collected).not.toContain("gold");
    const me = state.heroes.find((h) => h.id === "hero-0")!;
    expect(me.alive).toBe(true);
    expect(me.x).toBeLessThan(3);
  });

  it("is deterministic", () => {
    const s = game([
      pickup("gold", 6, 2, { resource: "gold", amount: 500 }),
      mine("ore-pit", 9, 3, "ore"),
    ]);
    const a = runAiTurn(s, () => fast(), winAll).state;
    const b = runAiTurn(s, () => fast(), winAll).state;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("smoke match", { timeout: HEAVY_TIMEOUT }, () => {
  it("plays three days of a fixed-seed small map, AI against AI", () => {
    const resolver = createBattleResolver();
    const play = (): ReturnType<typeof playMatch> => {
      const ai = new AdventureAi({ resolver });
      return playMatch({
        seed: 11,
        size: "S",
        players: 2,
        days: 3,
        controller: () => ai,
        resolver,
      });
    };
    const a = play();
    expect(a.days).toHaveLength(3);
    for (const m of a.days[2]!) {
      expect(m.explored).toBeGreaterThan(0.1);
      expect(m.heroes).toBeGreaterThanOrEqual(1);
      expect(m.buildings).toBeGreaterThan(3);
    }
    // Every player gathered something in three days.
    expect(a.days[2]!.every((m) => m.mines > 0 || m.gold > 0)).toBe(true);
    const b = play();
    expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
  });
});
