/**
 * Multi-player rules on hand-built maps (RULES_V2 section 5): setup, turn
 * order, the tavern, captures, hero battles, town defence, retreat,
 * elimination and victory.
 */
import { describe, expect, it } from "vitest";
import {
  applyBattleResult,
  battleSetup,
  build,
  cloneState,
  endTurn,
  fightPendingBattle,
  findPath,
  hireHero,
  moveHeroAlong,
  newGame,
  tavernOffer,
  type BattleResolver,
  type GameState,
  type PlayerSetup,
} from "../../../src/core/game/index.ts";
import { getCreature } from "../../../src/data/creatures.ts";
import { HIRE_COST, rosterFor } from "../../../src/data/players.ts";
import type { MapObject } from "../../../src/core/map/types.ts";
import {
  buildMap,
  errorOf,
  field,
  heroStart,
  mine,
  ok,
  town,
} from "./helpers.ts";

const HP = {
  caveman: getCreature("caveman").hp,
  spitter: getCreature("spitter").hp,
};

const LW: PlayerSetup[] = [
  { kind: "human", faction: "lost-world" },
  { kind: "ai", faction: "lost-world" },
];

/** Player 0: town (0,1), hero (1,1). Player 1: town (11,1), hero (10,1). */
function twoPlayers(
  extra: MapObject[] = [],
  opts: { hero1?: [number, number] | null; town1?: boolean } = {},
): GameState {
  const objects: MapObject[] = [town("t0", 0, 1, 0), heroStart(1, 1, 0)];
  if (opts.town1 !== false) objects.push(town("t1", 11, 1, 1));
  if (opts.hero1 !== null) {
    const [x, y] = opts.hero1 ?? [10, 1];
    objects.push(heroStart(x, y, 1));
  }
  const s = newGame(buildMap(field(12, 3), [...objects, ...extra]), {
    players: LW,
  });
  // These tests start from empty towns: send the starting militia
  // (RULES_V2 5.5) home.
  for (const t of Object.values(s.towns)) t.garrison.fill(null);
  return s;
}

function attack(s: GameState, heroId: string, x: number, y: number): GameState {
  const path = findPath(s, heroId, x, y, { ignoreFog: true });
  if (path === null) throw new Error(`no path to ${x},${y}`);
  return ok(moveHeroAlong(s, heroId, path.steps)).state;
}

const winLosing =
  (losses: number): BattleResolver =>
  (setup) => ({
    winner: "attacker",
    attacker: setup.attacker.stacks.map((s, i) =>
      i === 0 ? s.count - losses : s.count,
    ),
    defender: setup.defender.stacks.map(() => 0),
  });

const lose: BattleResolver = (setup) => ({
  winner: "defender",
  attacker: setup.attacker.stacks.map(() => 0),
  defender: setup.defender.stacks.map((s) => s.count),
});

/** Ends turns until it is `player`'s turn on `day`. */
function advanceTo(s: GameState, day: number, player = 0): GameState {
  let out = s;
  for (let i = 0; i < 200; i++) {
    if (out.day === day && out.currentPlayer === player) return out;
    out = ok(endTurn(out)).state;
  }
  throw new Error("never reached");
}

describe("new multi-player game", () => {
  it("sets up players, colours, heroes and distinct tavern offers", () => {
    const s = twoPlayers();
    expect(s.players.map((p) => [p.id, p.kind, p.colour, p.faction])).toEqual([
      [0, "human", "red", "lost-world"],
      [1, "ai", "blue", "lost-world"],
    ]);
    expect(s.currentPlayer).toBe(0);
    expect(s.heroes.map((h) => [h.id, h.owner])).toEqual([
      ["hero-0", 0],
      ["hero-1", 1],
    ]);
    const offered = s.players.flatMap((p) => p.tavern.offer);
    expect(offered).toHaveLength(4);
    expect(offered.every((id) => id !== null)).toBe(true);
    const onMap = s.heroes.map((h) => h.defId);
    const all = [...offered, ...onMap];
    expect(new Set(all).size).toBe(6);
    for (const id of all) expect(s.pool).not.toContain(id);
    expect(s.pool).toHaveLength(rosterFor(["lost-world"]).length - 6);
    expect(s.scenario).toBeNull();
  });

  it("is deterministic", () => {
    expect(JSON.stringify(twoPlayers())).toBe(JSON.stringify(twoPlayers()));
  });
});

describe("turn order", () => {
  it("passes the turn in index order, then starts the day for everyone", () => {
    const s = twoPlayers();
    const t1 = ok(endTurn(s));
    expect(t1.state.currentPlayer).toBe(1);
    expect(t1.state.day).toBe(1);
    expect(t1.events).toEqual([{ type: "turn", player: 1 }]);
    // Only the current player may act.
    const blocked = moveHeroAlong(t1.state, "hero-0", [{ x: 2, y: 1 }]);
    expect(errorOf(blocked)).toBe("not-your-turn");
    expect(errorOf(build(t1.state, "t0", "palisade"))).toBe("not-your-turn");
    const moved = ok(moveHeroAlong(t1.state, "hero-1", [{ x: 9, y: 1 }]));
    expect(moved.state.heroes[1]!.mp).toBe(1400);

    const day2 = ok(endTurn(moved.state));
    expect(day2.state.day).toBe(2);
    expect(day2.state.currentPlayer).toBe(0);
    expect(day2.events.filter((e) => e.type === "income")).toHaveLength(2);
    expect(day2.state.players.map((p) => p.resources.gold)).toEqual([
      8000, 8000,
    ]);
    expect(day2.state.heroes[1]!.mp).toBe(1500);
  });
});

describe("tavern", () => {
  it("hires an offered hero into a free town for 2500 gold", () => {
    const s = twoPlayers();
    const defId = s.players[0]!.tavern.offer[0]!;
    const { state, events } = ok(hireHero(s, "t0", defId));
    expect(state.players[0]!.resources.gold).toBe(7500 - HIRE_COST);
    const hero = state.heroes.find((h) => h.defId === defId)!;
    expect(hero).toMatchObject({ owner: 0, x: 0, y: 1, alive: true, mp: 1500 });
    expect(hero.army.filter((x) => x !== null)).toHaveLength(2);
    expect(state.players[0]!.tavern.offer[0]).toBeNull();
    expect(events).toContainEqual({
      type: "hero-hired",
      heroId: hero.id,
      player: 0,
      townId: "t0",
    });
    // The town's entrance now holds a hero.
    const other = state.players[0]!.tavern.offer[1]!;
    expect(errorOf(hireHero(state, "t0", other))).toBe("cell-occupied");
    expect(errorOf(hireHero(s, "t0", "nobody"))).toBe("not-offered");
    expect(errorOf(hireHero(s, "t1", s.players[1]!.tavern.offer[0]!))).toBe(
      "not-your-turn",
    );
  });

  it("caps a player at 8 heroes and refreshes offers weekly", () => {
    const s = cloneState(twoPlayers());
    for (let i = 0; i < 7; i++) {
      s.heroes.push({ ...s.heroes[0]!, id: `extra-${i}`, x: 2 + i, y: 0 });
    }
    expect(errorOf(hireHero(s, "t0", s.players[0]!.tavern.offer[0]!))).toBe(
      "hero-limit",
    );
    const hired = ok(
      hireHero(twoPlayers(), "t0", s.players[0]!.tavern.offer[0]!),
    ).state;
    expect(hired.players[0]!.tavern.offer[0]).toBeNull();
    const week2 = advanceTo(hired, 8);
    const offer = week2.players[0]!.tavern.offer;
    expect(offer.every((id) => id !== null)).toBe(true);
    const offered = week2.players.flatMap((p) => p.tavern.offer);
    expect(new Set(offered).size).toBe(offered.length);
  });
});

describe("captures and flags", () => {
  it("captures an empty enemy town on entry and flags enemy mines", () => {
    const s = cloneState(twoPlayers([mine("m1", 6, 2, "ore")]));
    s.mines["m1"]!.owner = 1;
    const flagged = attack(s, "hero-0", 6, 2);
    expect(flagged.mines["m1"]!.owner).toBe(0);
    const taken = ok(
      moveHeroAlong(
        flagged,
        "hero-0",
        findPath(flagged, "hero-0", 11, 1, { ignoreFog: true })!.steps,
      ),
    );
    expect(taken.state.towns["t1"]!.owner).toBe(0);
    expect(taken.events).toContainEqual({
      type: "town-captured",
      townId: "t1",
      owner: 0,
      from: 1,
    });
    // Player 1 still has a hero: still in the game.
    expect(taken.state.players[1]!.eliminated).toBe(false);
    expect(taken.state.status).toBe("playing");
  });

  it("eliminates a player left without towns and heroes; the human wins", () => {
    const s = twoPlayers([], { hero1: null });
    const { state, events } = ok(
      moveHeroAlong(
        s,
        "hero-0",
        findPath(s, "hero-0", 11, 1, { ignoreFog: true })!.steps,
      ),
    );
    expect(state.players[1]!.eliminated).toBe(true);
    expect(events).toContainEqual({ type: "player-eliminated", player: 1 });
    expect(state.status).toBe("won");
  });

  it("fights the garrison of a defended town, then captures it", () => {
    const s = cloneState(twoPlayers([], { hero1: null }));
    s.towns["t1"]!.garrison[0] = { creature: "caveman", count: 5 };
    const at = attack(s, "hero-0", 11, 1);
    expect(at.pendingBattle).toEqual({
      kind: "town",
      objectId: "t1",
      heroId: "hero-0",
    });
    const won = ok(fightPendingBattle(at, winLosing(0))).state;
    expect(won.towns["t1"]!.owner).toBe(0);
    expect(won.status).toBe("won");
  });
});

describe("hero against hero", () => {
  it("the attacker wins: XP, the loser's artifacts, the loser to the pool", () => {
    const s = cloneState(twoPlayers());
    s.heroes[1]!.worn[0] = "thinking-cap";
    s.heroes[1]!.backpack = ["tin-sabre"];
    s.heroes[1]!.scrolls = ["jolt"];
    const at = attack(s, "hero-0", 10, 1);
    expect(at.pendingBattle).toEqual({
      kind: "hero",
      objectId: "hero-1",
      heroId: "hero-0",
    });
    expect(at.heroes[0]).toMatchObject({ x: 9, y: 1 });
    const setup = battleSetup(at)!;
    expect(setup.defender.hero?.id).toBe("hero-1");
    expect(setup.defender.owner).toBe(1);
    expect(setup.defender.canRetreat).toBe(true);
    expect(setup.attacker.canRetreat).toBe(true);

    const { state, events } = ok(fightPendingBattle(at, winLosing(0)));
    const loser = state.heroes[1]!;
    expect(loser.alive).toBe(false);
    expect(state.pool).toContain(loser.defId);
    // RULES_V2 4.4: worn first, then carried, into the backpack.
    expect(state.heroes[0]!.backpack).toEqual(["thinking-cap", "tin-sabre"]);
    expect(state.heroes[0]!.scrolls).toEqual(["jolt"]);
    expect(loser.worn.every((w) => w === null)).toBe(true);
    expect(events).toContainEqual({
      type: "artifacts-won",
      heroId: "hero-0",
      fromHeroId: "hero-1",
      artifacts: ["thinking-cap", "tin-sabre"],
    });
    expect(state.heroes[0]!.xp).toBe(18 * HP.caveman + 6 * HP.spitter);
    expect(state.players[1]!.eliminated).toBe(false);
    expect(state.heroes[0]).toMatchObject({ x: 9, y: 1 });
  });

  it("the defender wins: it gains XP and the attacker leaves the map", () => {
    const at = attack(twoPlayers(), "hero-0", 10, 1);
    const { state } = ok(fightPendingBattle(at, lose));
    expect(state.heroes[0]!.alive).toBe(false);
    expect(state.heroes[1]!.xp).toBe(18 * HP.caveman + 6 * HP.spitter);
    expect(state.status).toBe("playing");
  });

  it("a hero in its town fights first with the fort, then the garrison", () => {
    const s = cloneState(twoPlayers());
    s.heroes[1]!.x = 11; // standing in its town
    s.towns["t1"]!.buildings.push("palisade");
    s.towns["t1"]!.garrison[0] = { creature: "caveman", count: 5 };
    const at = attack(s, "hero-0", 11, 1);
    expect(at.pendingBattle).toEqual({
      kind: "hero",
      objectId: "hero-1",
      heroId: "hero-0",
      townId: "t1",
    });
    const setup = battleSetup(at)!;
    expect(setup.defender.defenseBonus).toBe(2);
    expect(setup.defender.canRetreat).toBe(false);
    const retreat = applyBattleResult(at, {
      winner: "attacker",
      attacker: setup.attacker.stacks.map((x) => x.count),
      defender: setup.defender.stacks.map((x) => x.count),
      retreat: "defender",
    });
    expect(errorOf(retreat)).toBe("cannot-retreat");

    const first = ok(fightPendingBattle(at, winLosing(3))).state;
    expect(first.heroes[0]).toMatchObject({ x: 11, y: 1 });
    expect(first.pendingBattle).toEqual({
      kind: "town",
      objectId: "t1",
      heroId: "hero-0",
    });
    // The attacker keeps its losses into the second battle.
    expect(battleSetup(first)!.attacker.stacks[0]!.count).toBe(15);
    const second = ok(fightPendingBattle(first, winLosing(0))).state;
    expect(second.towns["t1"]!.owner).toBe(0);
    expect(second.players[1]!.eliminated).toBe(true);
    expect(second.status).toBe("won");
  });
});

describe("retreat", () => {
  it("sends the hero to its own tavern, keeping its level; rehired later", () => {
    const s = cloneState(twoPlayers());
    s.heroes[0]!.xp = 1200;
    s.heroes[0]!.level = 2;
    s.heroes[0]!.backpack = ["pot-lid"];
    const at = attack(s, "hero-0", 10, 1);
    const setup = battleSetup(at)!;
    const { state, events } = ok(
      applyBattleResult(at, {
        winner: "defender",
        attacker: setup.attacker.stacks.map((x) => x.count - 1),
        defender: setup.defender.stacks.map((x) => x.count - 2),
        retreat: "attacker",
      }),
    );
    expect(events).toContainEqual({ type: "hero-retreated", heroId: "hero-0" });
    expect(state.heroes[0]!.alive).toBe(false);
    expect(state.heroes[1]!.backpack).toEqual([]);
    // XP only for what was killed before the retreat: one of each stack.
    expect(state.heroes[1]!.xp).toBe(HP.caveman + HP.spitter);
    const offer = tavernOffer(state, 0);
    expect(offer).toContainEqual({
      defId: state.heroes[0]!.defId,
      retreated: true,
      heroId: "hero-0",
    });
    const back = ok(hireHero(state, "t0", state.heroes[0]!.defId)).state;
    expect(back.heroes[0]).toMatchObject({
      alive: true,
      level: 2,
      xp: 1200,
      backpack: ["pot-lid"],
      x: 0,
      y: 1,
    });
    expect(back.heroes[0]!.army[0]).toEqual({ creature: "caveman", count: 18 });
  });

  it("drops a retreated entry at the second weekly refresh", () => {
    const at = attack(twoPlayers(), "hero-0", 10, 1);
    const setup = battleSetup(at)!;
    const state = ok(
      applyBattleResult(at, {
        winner: "defender",
        attacker: setup.attacker.stacks.map((x) => x.count),
        defender: setup.defender.stacks.map((x) => x.count),
        retreat: "attacker",
      }),
    ).state;
    const defId = state.heroes[0]!.defId;
    const week2 = advanceTo(state, 8);
    expect(tavernOffer(week2, 0).some((o) => o.retreated)).toBe(true);
    const week3 = advanceTo(week2, 15);
    expect(tavernOffer(week3, 0).some((o) => o.retreated)).toBe(false);
    const known = [
      ...week3.pool,
      ...week3.players.flatMap((p) => p.tavern.offer),
    ];
    expect(known).toContain(defId);
  });

  it("is refused for a hero whose player owns no town", () => {
    const at = attack(twoPlayers([], { town1: false }), "hero-0", 10, 1);
    expect(battleSetup(at)!.defender.canRetreat).toBe(false);
  });
});

describe("elimination by the seven-day rule", () => {
  it("eliminates a townless player at the seventh day start", () => {
    const s = twoPlayers([], { town1: false });
    const day7 = advanceTo(s, 7);
    expect(day7.players[1]!.townlessDays).toBe(6);
    expect(day7.players[1]!.eliminated).toBe(false);
    const day8 = advanceTo(day7, 8);
    expect(day8.players[1]!.eliminated).toBe(true);
    expect(day8.heroes[1]!.alive).toBe(false);
    expect(day8.status).toBe("won");
  });

  it("ends the game at once when the human is eliminated", () => {
    const s = cloneState(twoPlayers());
    s.towns["t0"]!.owner = null;
    const day8 = advanceTo(s, 8, 1);
    expect(day8.status).toBe("lost");
    expect(day8.players[0]!.eliminated).toBe(true);
    expect(errorOf(endTurn(day8))).toBe("game-over");
  });
});
