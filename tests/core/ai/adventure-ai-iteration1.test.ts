/**
 * The adventure AI's iteration-1 decisions (bead bzc.21) on small
 * hand-built states: town defence, no back-and-forth trips for troops,
 * ferrying, key-and-gate puzzles and the turn's time budget. Whole
 * matches belong to the simulation tier (tools/sim/match.ts).
 */
import { describe, expect, it } from "vitest";
import { AdventureAi } from "../../../src/core/ai/index.ts";
import { armyFv } from "../../../src/core/ai/strength.ts";
import {
  aiStep,
  keysOf,
  newGame,
  type ArmySlots,
  type BattleResolver,
  type GameAction,
  type GameState,
  type HeroState,
  type PlayerController,
} from "../../../src/core/game/index.ts";
import type { MapObject } from "../../../src/core/map/types.ts";
import {
  buildMap,
  field,
  heroStart,
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

const fast = (): AdventureAi => new AdventureAi({ resolver: null });

function army(...stacks: Array<[string, number]>): ArmySlots {
  const out: ArmySlots = [null, null, null, null, null, null, null];
  stacks.forEach(([creature, count], i) => {
    out[i] = { creature: creature as never, count };
  });
  return out;
}

/** Everything explored for every player (tests see the whole field). */
function allSeen(s: GameState): GameState {
  return {
    ...s,
    players: s.players.map((p) => ({
      ...p,
      explored: p.explored.map(() => true),
    })),
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

/** Two players on an open field: player 0's town at the west end. */
function duel(
  width: number,
  me: { x: number; army: ArmySlots },
  foe: { x: number; army: ArmySlots },
  extra: MapObject[] = [],
): GameState {
  const s = newGame(
    buildMap(field(width, 5), [
      town("t0", 0, 2, 0),
      heroStart(me.x, 2, 0),
      town("t1", width - 1, 2, 1),
      heroStart(foe.x, 2, 1),
      ...extra,
    ]),
    {
      players: [
        { kind: "ai", faction: "humans" },
        { kind: "ai", faction: "undead" },
      ],
    },
  );
  return allSeen({
    ...withGold(s, 0),
    day: 10,
    heroes: s.heroes.map((h) =>
      h.owner === 0 ? { ...h, army: me.army } : { ...h, army: foe.army },
    ),
  });
}

function hero(s: GameState, owner: number): HeroState {
  const h = s.heroes.find((x) => x.owner === owner && x.alive);
  if (h === undefined) throw new Error("no hero");
  return h;
}

describe("AdventureAi iteration 1", () => {
  it("brings the main hero home when a weaker enemy hero nears its town", () => {
    // The enemy (a dozen ghouls) stands three cells from player 0's empty
    // town; player 0's main hero, far stronger, is twenty cells east.
    const s = duel(
      40,
      { x: 24, army: army(["knight", 12], ["squire", 30]) },
      { x: 3, army: army(["ghoul", 12]) },
    );
    const ai = fast();
    const { actions, state } = turnActions(s, ai);
    const moves = actions.filter(
      (a): a is Extract<GameAction, { type: "move" }> =>
        a.type === "move" && a.heroId === hero(s, 0).id,
    );
    expect(moves.length).toBeGreaterThan(0);
    // Every move heads west, toward the town and the intruder.
    for (const m of moves) {
      const last = m.path[m.path.length - 1]!;
      expect(last.x).toBeLessThan(24);
    }
    expect(state.towns["t0"]?.owner).toBe(0);
  });

  it("keeps the garrison home while a stronger enemy hero is near", () => {
    const s0 = duel(
      30,
      { x: 1, army: army(["squire", 10]) },
      { x: 9, army: army(["vampire", 30]) },
    );
    // The main hero stands in its town, which holds a garrison.
    const s: GameState = {
      ...s0,
      heroes: s0.heroes.map((h) => (h.owner === 0 ? { ...h, x: 0 } : h)),
      towns: {
        ...s0.towns,
        t0: { ...s0.towns["t0"]!, garrison: army(["knight", 4]) },
      },
    };
    const ai = fast();
    for (let i = 0; i < 10; i++) {
      const a = ai.decide(s, 0);
      expect(a.type === "transfer" && a.args.from.army === "garrison").toBe(
        false,
      );
      if (a.type !== "build" && a.type !== "recruit" && a.type !== "hire")
        break;
    }
  });

  it("does not walk back for troops it picked up days ago", () => {
    // The main hero took the garrison three days ago and walked east; the
    // town has refilled to a quarter of its army.
    const base = newGame(
      buildMap(field(30, 5), [town("t0", 0, 2, 0), heroStart(1, 2, 0)]),
      { players: [{ kind: "ai", faction: "humans" }] },
    );
    const mainArmy = army(["knight", 10], ["squire", 20]);
    const at = (x: number, day: number, garrison: ArmySlots): GameState =>
      allSeen({
        ...withGold(base, 0),
        day,
        heroes: base.heroes.map((h) => ({ ...h, x, army: mainArmy, mp: 1500 })),
        towns: { ...base.towns, t0: { ...base.towns["t0"]!, garrison } },
        // A strong stack far east makes troops valuable (need = 1).
        monsters: {},
      });
    const refill = army(["knight", 3]);
    expect(armyFv(refill)).toBeGreaterThan(armyFv(mainArmy) * 0.2);
    // Day 10: the hero stands in town and picks the garrison up.
    const ai = fast();
    const pick = ai.decide(at(0, 10, refill), 0);
    expect(pick).toMatchObject({
      type: "transfer",
      args: { from: { army: "garrison" } },
    });
    // Day 12, eight cells east, the town full again: it does not return.
    const later = at(8, 12, refill);
    const explained = ai.explain(later, 0).join("\n");
    expect(explained).not.toMatch(/home:t0 value/);
    // A fresh AI without the memory would go back.
    expect(fast().explain(later, 0).join("\n")).toMatch(/home:t0 value/);
  });

  it("ferries a meaningful army to a distant main hero", () => {
    const base = newGame(
      buildMap(field(40, 5), [town("t0", 0, 2, 0), heroStart(30, 2, 0)]),
      { players: [{ kind: "ai", faction: "humans" }] },
    );
    const main = base.heroes[0]!;
    const ferry: HeroState = {
      ...main,
      id: "hero-ferry",
      defId: "ferry",
      x: 0,
      y: 2,
      army: army(["squire", 1]),
    };
    const s: GameState = allSeen({
      ...withGold(base, 0),
      day: 10,
      heroes: [{ ...main, army: army(["knight", 10], ["squire", 20]) }, ferry],
      towns: {
        ...base.towns,
        t0: {
          ...base.towns["t0"]!,
          garrison: army(["knight", 4], ["longbowman", 10]),
        },
      },
    });
    const ai = fast();
    const { actions, state } = turnActions(s, ai);
    // It picked the troops up and set off toward the main hero.
    expect(
      actions.some(
        (a) =>
          a.type === "transfer" &&
          a.args.heroId === "hero-ferry" &&
          a.args.from.army === "garrison",
      ),
    ).toBe(true);
    const f = state.heroes.find((h) => h.id === "hero-ferry")!;
    expect(f.x).toBeGreaterThan(5);
    // The knights left town with it (iteration 4: the main hero may come
    // to meet it and take them the same day; the archers stay home as the
    // capital's guard by value).
    const knights = state.heroes.reduce(
      (n, h) =>
        n +
        h.army.reduce(
          (k, x) => k + (x?.creature === "knight" ? x.count : 0),
          0,
        ),
      0,
    );
    expect(knights).toBe(14);
  });

  it("goes for a key and then through its gate", () => {
    // A mountain wall at column 12 with a red gate at (12, 2); the red
    // key's tent lies west, a rich chest east behind the gate.
    const rows = field(24, 5).map((r) => `${r.slice(0, 12)}M${r.slice(13)}`);
    const tent: MapObject = {
      id: "tent",
      kind: "site",
      x: 4,
      y: 0,
      footprint: { w: 1, h: 1 },
      blocked: [],
      data: { type: "keymasters-tent", colour: "red" },
    };
    const gate: MapObject = {
      id: "gate",
      kind: "gate",
      x: 12,
      y: 2,
      footprint: { w: 1, h: 1 },
      blocked: [],
      data: { type: "border-gate", colour: "red", value: 0 },
    };
    rows[2] = `${rows[2]!.slice(0, 12)}g${rows[2]!.slice(13)}`;
    const base = newGame(
      buildMap(rows, [
        town("t0", 0, 2, 0),
        heroStart(1, 2, 0),
        tent,
        gate,
        pickup("gold", 18, 2, { resource: "gold", amount: 5000, value: 5000 }),
      ]),
      { players: [{ kind: "ai", faction: "humans" }] },
    );
    let s = allSeen(withGold(base, 0));
    const ai = fast();
    let keyDay = -1;
    for (let day = 0; day < 4 && !s.collected.includes("gold"); day++) {
      s = turnActions(s, ai).state;
      if (keyDay < 0 && keysOf(s, 0).includes("red")) keyDay = day;
    }
    expect(keyDay).toBeGreaterThanOrEqual(0);
    expect(s.collected).toContain("gold");
  });

  it("respects the turn budget for simulated fights", () => {
    // A resolver that takes 60 ms a battle and many close calls in view.
    const slow: BattleResolver = (setup) => {
      const t = Date.now();
      while (Date.now() - t < 60) {
        // busy
      }
      return winAll(setup);
    };
    const stacks = Array.from({ length: 12 }, (_, i) =>
      monster(`m${i}`, 4 + (i % 6) * 3, i < 6 ? 0 : 4, "goblin", 25 + i),
    );
    const s = allSeen(
      newGame(
        buildMap(field(24, 5), [
          town("t0", 0, 2, 0),
          heroStart(1, 2, 0),
          ...stacks,
        ]),
        { players: [{ kind: "ai", faction: "humans" }] },
      ),
    );
    const ai = new AdventureAi({ resolver: slow });
    const t0 = Date.now();
    turnActions(s, ai);
    const ms = Date.now() - t0;
    // Six simulations a turn at most (and 500 predicted ms of them),
    // however many close fights are in view.
    expect(ai.simulations).toBeLessThanOrEqual(6);
    expect(ms).toBeLessThan(3000);
  });
});
