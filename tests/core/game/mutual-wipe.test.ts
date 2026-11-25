/**
 * Both sides fall in the same step (bead bzc.35, RULES_V2 1.12): the
 * defender wins and makes a last stand with one creature of its weakest
 * stack. And a result the rules refuse never leaves a battle pending
 * forever: the driver voids it with a "battle-error" event.
 */
import { describe, expect, it } from "vitest";
import {
  aiStep,
  applyBattleResult,
  battleSetup,
  cloneState,
  endTurn,
  fightPendingBattle,
  findPath,
  moveHeroAlong,
  newGame,
  voidPendingBattle,
  type BattleResolver,
  type GameState,
  type PlayerController,
} from "../../../src/core/game/index.ts";
import { gameResultFromEngine } from "../../../src/core/battle/resolver.ts";
import type { BattleResult as EngineResult } from "../../../src/core/battle/auto.ts";
import { getCreature } from "../../../src/data/creatures.ts";
import type { MapObject } from "../../../src/core/map/types.ts";
import {
  buildMap,
  errorOf,
  field,
  gameOn,
  heroStart,
  mine,
  monster,
  ok,
  town,
} from "./helpers.ts";

const HP = {
  caveman: getCreature("caveman").hp,
  spitter: getCreature("spitter").hp,
  goblin: getCreature("goblin").hp,
};

/** Every stack on both sides dies; the engine names `winner`. */
const wipe =
  (winner: "attacker" | "defender" = "defender"): BattleResolver =>
  (setup) => ({
    winner,
    attacker: setup.attacker.stacks.map(() => 0),
    defender: setup.defender.stacks.map(() => 0),
  });

const winAll: BattleResolver = (setup) => ({
  winner: "attacker",
  attacker: setup.attacker.stacks.map((s) => s.count),
  defender: setup.defender.stacks.map(() => 0),
});

/** Player 0: town (0,1), hero (1,1). Player 1: town (11,1), hero (10,1). */
function twoPlayers(extra: MapObject[] = []): GameState {
  return newGame(
    buildMap(field(12, 3), [
      town("t0", 0, 1, 0),
      heroStart(1, 1, 0),
      town("t1", 11, 1, 1),
      heroStart(10, 1, 1),
      ...extra,
    ]),
    {
      players: [
        { kind: "human", faction: "lost-world" },
        { kind: "ai", faction: "lost-world" },
      ],
    },
  );
}

function attack(s: GameState, heroId: string, x: number, y: number): GameState {
  const path = findPath(s, heroId, x, y, { ignoreFog: true });
  if (path === null) throw new Error(`no path to ${x},${y}`);
  return ok(moveHeroAlong(s, heroId, path.steps)).state;
}

describe("mutual wipe: hero against neutrals", () => {
  it("the guard makes a last stand; the hero is defeated", () => {
    const s = attack(
      gameOn(field(7, 3), [monster("m", 3, 1)], 0, 1),
      "hero-0",
      3,
      1,
    );
    expect(s.pendingBattle).toMatchObject({ kind: "monster", objectId: "m" });
    const { state, events } = ok(fightPendingBattle(s, wipe()));
    expect(state.pendingBattle).toBeNull();
    expect(state.battles).toBe(1);
    // The guard is not removed: one goblin holds the passage.
    expect(state.monsters["m"]!.count).toBe(1);
    expect(events).toContainEqual({
      type: "last-stand",
      battle: { kind: "monster", objectId: "m", heroId: "hero-0" },
      side: "defender",
      creature: "goblin",
    });
    expect(events.some((e) => e.type === "monster-defeated")).toBe(false);
    expect(state.heroes[0]!.alive).toBe(false);
    expect(state.heroes[0]!.xp).toBe(0);
    expect(state.status).toBe("lost");
  });

  it("a guarded mine stays unflagged", () => {
    const s = cloneState(
      twoPlayers([mine("ore", 4, 0, "ore"), monster("m", 5, 0)]),
    );
    const at = attack(s, "hero-0", 4, 0);
    expect(at.pendingBattle).toMatchObject({ kind: "monster", objectId: "m" });
    const { state } = ok(fightPendingBattle(at, wipe()));
    expect(state.mines["ore"]!.owner).toBeNull();
    expect(state.monsters["m"]!.count).toBe(1);
    expect(state.heroes[0]!.alive).toBe(false);
    // Player 0 still owns a town: the game goes on.
    expect(state.status).toBe("playing");
    // The same guard is fought again later: its setup is a valid battle.
    expect(state.pendingBattle).toBeNull();
  });

  it("a winning attacker left with nothing keeps one creature too", () => {
    // The engine names the attacker when it still had a stack due to return
    // from its remains (1.12); its weakest stack makes the last stand.
    const s = attack(
      gameOn(field(7, 3), [monster("m", 3, 1)], 0, 1),
      "hero-0",
      3,
      1,
    );
    const { state, events } = ok(fightPendingBattle(s, wipe("attacker")));
    const hero = state.heroes[0]!;
    expect(hero.alive).toBe(true);
    // Cavemen (fight value 60) are weaker than Spitters (122).
    expect(hero.army.filter((x) => x !== null)).toEqual([
      { creature: "caveman", count: 1 },
    ]);
    expect(hero.xp).toBe(10 * HP.goblin);
    expect(state.monsters["m"]).toBeUndefined();
    expect(events).toContainEqual({ type: "monster-defeated", monsterId: "m" });
    expect(events).toContainEqual(
      expect.objectContaining({ type: "last-stand", side: "attacker" }),
    );
    // The hero can move on and fight again with its one creature.
    const next = attack(
      ok(fightPendingBattle(s, wipe("attacker"))).state,
      "hero-0",
      5,
      1,
    );
    expect(next.heroes[0]).toMatchObject({ x: 5, y: 1 });
  });
});

describe("mutual wipe: hero against hero", () => {
  it("the defender wins with one creature, XP and the attacker's artifacts", () => {
    const s = cloneState(twoPlayers());
    s.heroes[0]!.backpack = ["tin-sabre"];
    const at = attack(s, "hero-0", 10, 1);
    expect(at.pendingBattle).toMatchObject({
      kind: "hero",
      objectId: "hero-1",
    });
    const { state, events } = ok(fightPendingBattle(at, wipe()));
    const [attacker, defender] = state.heroes;
    expect(attacker!.alive).toBe(false);
    expect(state.pool).toContain(attacker!.defId);
    expect(defender!.alive).toBe(true);
    expect(defender!.army.filter((x) => x !== null)).toEqual([
      { creature: "caveman", count: 1 },
    ]);
    expect(defender!.xp).toBe(18 * HP.caveman + 6 * HP.spitter);
    expect(defender!.backpack).toEqual(["tin-sabre"]);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "last-stand", side: "defender" }),
    );
    expect(state.status).toBe("playing");

    // The survivor keeps the field: on its turn it moves and can fight.
    const p1 = cloneState(ok(endTurn(state)).state);
    p1.towns["t0"]!.garrison[0] = { creature: "goblin", count: 3 };
    expect(p1.currentPlayer).toBe(1);
    const moved = attack(p1, "hero-1", 6, 1);
    expect(moved.heroes[1]).toMatchObject({ x: 6, y: 1 });
    const fight = attack(p1, "hero-1", 0, 1);
    expect(fight.pendingBattle).toMatchObject({ kind: "town", objectId: "t0" });
    expect(battleSetup(fight)?.attacker.stacks).toEqual([
      { creature: "caveman", count: 1 },
    ]);
  });
});

describe("mutual wipe: hero against a defended town", () => {
  function defended(): GameState {
    const s = cloneState(twoPlayers());
    s.heroes[1]!.x = 11; // standing in its town
    s.towns["t1"]!.garrison[0] = { creature: "caveman", count: 5 };
    s.towns["t1"]!.garrison[1] = { creature: "spitter", count: 2 };
    return attack(s, "hero-0", 11, 1);
  }

  it("stage 1: the town's hero holds; no garrison battle follows", () => {
    const at = defended();
    expect(at.pendingBattle).toMatchObject({ kind: "hero", townId: "t1" });
    const { state } = ok(fightPendingBattle(at, wipe()));
    expect(state.pendingBattle).toBeNull();
    expect(state.heroes[0]!.alive).toBe(false);
    expect(state.heroes[1]!.army.filter((x) => x !== null)).toEqual([
      { creature: "caveman", count: 1 },
    ]);
    expect(state.towns["t1"]!.owner).toBe(1);
    // The garrison was never fought.
    expect(state.towns["t1"]!.garrison.slice(0, 2)).toEqual([
      { creature: "caveman", count: 5 },
      { creature: "spitter", count: 2 },
    ]);
  });

  it("stage 2: the garrison holds the town with one creature", () => {
    const first = ok(fightPendingBattle(defended(), winAll)).state;
    expect(first.pendingBattle).toMatchObject({ kind: "town", objectId: "t1" });
    const { state, events } = ok(fightPendingBattle(first, wipe()));
    expect(state.pendingBattle).toBeNull();
    expect(state.towns["t1"]!.owner).toBe(1);
    expect(state.towns["t1"]!.garrison.filter((x) => x !== null)).toEqual([
      { creature: "caveman", count: 1 },
    ]);
    expect(events.some((e) => e.type === "town-captured")).toBe(false);
    expect(state.heroes[0]!.alive).toBe(false);
    expect(state.status).toBe("playing");
    expect(state.players[1]!.eliminated).toBe(false);
  });
});

describe("the engine's mutual wipe reaches the game", () => {
  it("an eliminated-both result maps to a defender last stand", () => {
    const at = attack(cloneState(twoPlayers()), "hero-0", 10, 1);
    const setup = battleSetup(at)!;
    const engine: EngineResult = {
      winner: "defender",
      reason: "eliminated",
      rounds: 2,
      stacks: [],
      killedHp: { attacker: 0, defender: 0 },
    };
    const result = gameResultFromEngine(setup, engine);
    expect(result).toEqual({
      winner: "defender",
      attacker: [0, 0],
      defender: [0, 0],
    });
    const { state } = ok(applyBattleResult(at, result));
    expect(state.pendingBattle).toBeNull();
    expect(state.heroes[1]!.army.filter((x) => x !== null)).toHaveLength(1);
  });
});

describe("never stall on a refused result", () => {
  /** Claims an attacker win while the defender still stands. */
  const broken: BattleResolver = (setup) => ({
    winner: "attacker",
    attacker: setup.attacker.stacks.map((s) => s.count),
    defender: setup.defender.stacks.map((s) => s.count),
  });

  it("applyBattleResult refuses it with an error", () => {
    const at = attack(cloneState(twoPlayers()), "hero-0", 10, 1);
    expect(errorOf(fightPendingBattle(at, broken))).toBe("bad-result");
  });

  it("voidPendingBattle settles it with a battle-error event", () => {
    const at = attack(cloneState(twoPlayers()), "hero-0", 10, 1);
    const { state, events } = ok(
      voidPendingBattle(at, "bad-result", "the loser must have no survivors"),
    );
    expect(state.pendingBattle).toBeNull();
    expect(state.battles).toBe(at.battles + 1);
    expect(state.heroes).toEqual(at.heroes);
    expect(events).toEqual([
      {
        type: "battle-error",
        battle: at.pendingBattle,
        error: "bad-result",
        message: "the loser must have no survivors",
      },
    ]);
    expect(errorOf(voidPendingBattle(state, "bad-result", "x"))).toBe(
      "no-battle",
    );
  });

  it("the AI driver voids it and carries on", () => {
    const s = ok(endTurn(twoPlayers([monster("m", 8, 1)]))).state;
    const path = findPath(s, "hero-1", 8, 1)!.steps;
    let i = 0;
    const c: PlayerController = {
      decide: () =>
        i++ === 0
          ? { type: "move", heroId: "hero-1", path }
          : { type: "end-turn" },
    };
    const ctl = (p: number): PlayerController | null => (p === 1 ? c : null);
    const step = aiStep(s, ctl, broken);
    expect(step.state.pendingBattle).toBeNull();
    expect(step.outcome).toBe("continue");
    expect(step.events).toContainEqual(
      expect.objectContaining({ type: "battle-error", error: "bad-result" }),
    );
    // Nothing was applied: the guard and the hero's army are untouched.
    expect(step.state.monsters["m"]!.count).toBe(10);
    expect(step.state.heroes[1]!.army).toEqual(s.heroes[1]!.army);
    // The turn can end: the game is not stuck.
    const next = aiStep(step.state, ctl, broken);
    expect(next.outcome).toBe("turn-ended");
    expect(next.state.currentPlayer).toBe(0);
  });
});
