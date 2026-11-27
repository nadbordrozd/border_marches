/**
 * Ships and sea movement (docs/design/NAVAL.md section 2, bead bzc.149):
 * the sea, boarding and landing with their conversions, sailing, mixed
 * land-sea plans, ownership, zones of control by element, attacks across
 * the shore, the day start, docks, saves, and dry maps left as they were.
 */
import { describe, expect, it } from "vitest";
import {
  applyBattleResult,
  battleSetup,
  endTurn,
  findPath,
  isAfloat,
  isSeaCell,
  isShoreCell,
  moveContext,
  moveHeroAlong,
  newGame,
  reachableCells,
  scuttleShip,
  seaMaxOf,
  seaMovementPoints,
  shipAt,
  shipOfHero,
  shipsOf,
  toSeaPoints,
  townDock,
  type GameState,
  type HeroState,
} from "../../../src/core/game/index.ts";
import { eliminate } from "../../../src/core/game/players.ts";
import { readSave, saveGame, type SaveStorage } from "../../../src/ui/save.ts";
import {
  buildMap,
  errorOf,
  field,
  heroStart,
  monster,
  ok,
  pickup,
  town,
} from "./helpers.ts";
import { STRAIT, boat, navalGame } from "./naval-helpers.ts";

function hero(s: GameState, id = "hero-0"): HeroState {
  return s.heroes.find((h) => h.id === id)!;
}

/** Sets a hero's points (and fixes both maxima for exact numbers). */
function withPoints(
  s: GameState,
  mp: number,
  landMax = 1500,
  seaMax = 1500,
  id = "hero-0",
): GameState {
  return {
    ...s,
    heroes: s.heroes.map((h) =>
      h.id === id ? { ...h, mp, maxMp: landMax, seaMaxMp: seaMax } : h,
    ),
  };
}

describe("the sea (NAVAL 2.1)", () => {
  it("is water in a body of seaMin cells or more, on a naval map only", () => {
    const s = navalGame(STRAIT, [], []);
    expect(isSeaCell(s.map, 7, 5)).toBe(true);
    // The one-cell pond on the west island is a lake: scenery.
    expect(isSeaCell(s.map, 1, 1)).toBe(false);
    expect(isSeaCell(s.map, 2, 2)).toBe(false);
    expect(isShoreCell(s.map, 4, 5)).toBe(true);
    expect(isShoreCell(s.map, 3, 5)).toBe(false);
    const dry = newGame(buildMap(STRAIT, [heroStart(4, 5)]));
    expect(isSeaCell(dry.map, 7, 5)).toBe(false);
    expect(dry.ships).toBeUndefined();
  });

  it("turns the map's moored boats into neutral ships", () => {
    const s = navalGame(
      STRAIT,
      [],
      [boat("boat-1", 5, 5), boat("boat-2", 14, 3)],
    );
    expect(shipsOf(s)).toEqual([
      { id: "ship-1", x: 5, y: 5, owner: null },
      { id: "ship-2", x: 14, y: 3, owner: null },
    ]);
    expect(s.shipsMade).toBe(2);
  });
});

describe("boarding and landing (NAVAL 2.3)", () => {
  it("boards for 100 land points and converts the rest to sea points", () => {
    let s = navalGame(STRAIT, [], [boat("boat-1", 5, 5)]);
    s = withPoints(s, 1200, 1600, 2000);
    const { state, events } = ok(moveHeroAlong(s, "hero-0", [{ x: 5, y: 5 }]));
    const h = hero(state);
    expect(h.mp).toBe(Math.floor(((1200 - 100) * 2000) / 1600));
    expect(isAfloat(state, h)).toBe(true);
    expect(shipAt(state, 5, 5)?.owner).toBe(0);
    expect(events).toContainEqual({
      type: "ship-boarded",
      heroId: "hero-0",
      shipId: "ship-1",
      from: null,
    });
  });

  it("boards diagonally for 141 and never onto open water", () => {
    let s = navalGame(STRAIT, [], [boat("boat-1", 5, 6)]);
    s = withPoints(s, 1000);
    const r = ok(moveHeroAlong(s, "hero-0", [{ x: 5, y: 6 }]));
    expect(hero(r.state).mp).toBe(1000 - 141);
    expect(errorOf(moveHeroAlong(s, "hero-0", [{ x: 5, y: 4 }]))).toBe(
      "bad-path",
    );
  });

  it("sails 100 a step, 141 diagonally, the ship going along", () => {
    let s = navalGame(STRAIT, [], [boat("boat-1", 5, 5)]);
    s = withPoints(s, 1500);
    s = ok(moveHeroAlong(s, "hero-0", [{ x: 5, y: 5 }])).state;
    const before = hero(s).mp;
    const r = ok(
      moveHeroAlong(s, "hero-0", [
        { x: 6, y: 5 },
        { x: 7, y: 6 },
      ]),
    );
    expect(hero(r.state).mp).toBe(before - 100 - 141);
    expect(shipOfHero(r.state, hero(r.state))).toMatchObject({ x: 7, y: 6 });
    expect(shipAt(r.state, 5, 5)).toBeUndefined();
  });

  it("lands with 0 points without Seafaring; the ship stays moored", () => {
    let s = navalGame(STRAIT, [], [boat("boat-1", 14, 5)], 15, 5);
    s = withPoints(s, 1500);
    s = ok(moveHeroAlong(s, "hero-0", [{ x: 14, y: 5 }])).state;
    expect(isAfloat(s, hero(s))).toBe(true);
    const r = ok(
      moveHeroAlong(s, "hero-0", [
        { x: 15, y: 5 },
        { x: 16, y: 5 },
      ]),
    );
    const h = hero(r.state);
    expect([h.x, h.y, h.mp]).toEqual([15, 5, 0]);
    expect(r.events[0]).toMatchObject({ type: "moved", stop: "no-mp" });
    expect(r.events).toContainEqual({
      type: "ship-landed",
      heroId: "hero-0",
      shipId: "ship-1",
      endsDay: true,
    });
    expect(shipAt(r.state, 14, 5)).toMatchObject({ owner: 0 });
    expect(isAfloat(r.state, h)).toBe(false);
  });

  it("with Seafaring converts back and pays the land cost", () => {
    let s = navalGame(STRAIT, [], [boat("boat-1", 14, 5)], 15, 5);
    s = {
      ...s,
      heroes: s.heroes.map((h) => ({
        ...h,
        skills: [...h.skills, { id: "seafaring", rank: 1 }],
      })),
    };
    s = withPoints(s, 1500, 1500, 2000);
    s = ok(moveHeroAlong(s, "hero-0", [{ x: 14, y: 5 }])).state;
    const sea = hero(s).mp;
    expect(sea).toBe(Math.floor((1400 * 2000) / 1500));
    const r = ok(moveHeroAlong(s, "hero-0", [{ x: 15, y: 5 }]));
    expect(hero(r.state).mp).toBe(Math.floor((sea * 1500) / 2000) - 100);
  });

  it("refuses landing on a pickup: it is taken from the ship", () => {
    let s = navalGame(
      STRAIT,
      [pickup("gold-1", 15, 5, { resource: "gold", amount: 500 })],
      [boat("boat-1", 14, 5)],
      15,
      4,
    );
    s = withPoints(s, 1500);
    s = ok(moveHeroAlong(s, "hero-0", [{ x: 14, y: 5 }])).state;
    const r = ok(moveHeroAlong(s, "hero-0", [{ x: 15, y: 5 }]));
    expect(r.events[0]).toMatchObject({ stop: "pickup" });
    expect(r.state.collected).toContain("gold-1");
    expect(isAfloat(r.state, hero(r.state))).toBe(true);
  });
});

describe("planning across the sea (NAVAL 2.3-2.4)", () => {
  it("boards, sails and lands, ending that day, with exact points", () => {
    let s = navalGame(STRAIT, [], [boat("boat-1", 5, 5)]);
    s = withPoints(s, 1500, 1500, 1500);
    const path = findPath(s, "hero-0", 17, 5, { ignoreFog: true });
    expect(path).not.toBeNull();
    const steps = path!.steps;
    expect(steps[0]).toMatchObject({
      x: 5,
      y: 5,
      board: "ship-1",
      afloat: true,
    });
    const landing = steps.findIndex((st) => st.land === true);
    expect(steps[landing]).toMatchObject({ x: 15, y: 5, endsDay: true });
    expect(steps.filter((st) => st.afloat === true)).toHaveLength(landing);
    // 100 to board; 1400 sea points; nine sea steps of 100: 500 left.
    expect(steps[landing - 1]).toMatchObject({
      x: 14,
      y: 5,
      day: 0,
      left: 500,
    });
    expect(steps[landing]).toMatchObject({ day: 0, cost: 500, left: 0 });
    // After the landing the walk goes on the next day.
    expect(steps[landing + 1]).toMatchObject({ day: 1, left: 1400 });
  });

  it("finds no way across without a ship, and walks round a lake", () => {
    const s = withPoints(navalGame(STRAIT, [], []), 1500);
    expect(findPath(s, "hero-0", 17, 5, { ignoreFog: true })).toBeNull();
    const land = findPath(s, "hero-0", 0, 0, { ignoreFog: true });
    expect(land?.steps.every((st) => st.afloat !== true)).toBe(true);
  });

  it("sails to a sea cell and lands later in the same plan", () => {
    let s = navalGame(STRAIT, [], [boat("boat-1", 5, 5)]);
    s = withPoints(s, 1500);
    s = ok(moveHeroAlong(s, "hero-0", [{ x: 5, y: 5 }])).state;
    const sail = findPath(s, "hero-0", 10, 2, { ignoreFog: true });
    expect(sail?.steps.every((st) => st.afloat === true)).toBe(true);
    expect(sail?.steps.at(-1)).toMatchObject({ x: 10, y: 2 });
    const reach = reachableCells(s, "hero-0", undefined, { ignoreFog: true });
    expect(reach.has(2 * 20 + 10)).toBe(true);
    // A landing is reachable today; nothing beyond it is.
    expect(reach.has(5 * 20 + 15)).toBe(true);
    expect(reach.has(5 * 20 + 16)).toBe(false);
  });

  it("follows the plan with moveHeroAlong for today's steps", () => {
    let s = navalGame(STRAIT, [], [boat("boat-1", 5, 5)]);
    s = withPoints(s, 1500);
    const path = findPath(s, "hero-0", 17, 5, { ignoreFog: true })!;
    const r = ok(moveHeroAlong(s, "hero-0", path.steps));
    expect(hero(r.state)).toMatchObject({ x: 15, y: 5, mp: 0 });
    expect(shipAt(r.state, 14, 5)).toMatchObject({ id: "ship-1", owner: 0 });
  });
});

describe("zones of control by element (NAVAL 2.7)", () => {
  it("a sea stack guards only sea cells, a land stack only land", () => {
    const s = navalGame(
      STRAIT,
      [monster("land-guard", 4, 8)],
      [boat("boat-1", 5, 5)],
    );
    // The sea stack stands on water: added after validation.
    const sea = {
      ...s,
      monsters: {
        ...s.monsters,
        serpent: {
          id: "serpent",
          creature: "goblin" as const,
          count: 5,
          x: 6,
          y: 2,
        },
      },
      map: {
        ...s.map,
        objects: [...s.map.objects, monster("serpent", 6, 2)],
      },
    };
    const ctx = moveContext(sea, hero(sea), { ignoreFog: true });
    const w = sea.map.width;
    expect(ctx.guards.get(2 * w + 5)).toEqual(["serpent"]);
    expect(ctx.guards.has(2 * w + 4)).toBe(false);
    expect(ctx.guards.get(8 * w + 3)).toEqual(["land-guard"]);
    expect(ctx.guards.has(8 * w + 5)).toBe(false);
    // So the hero walks the shore past the serpent without a fight.
    const walk = findPath(sea, "hero-0", 4, 0, { ignoreFog: true });
    expect(walk?.steps.at(-1)).toMatchObject({ x: 4, y: 0, attack: false });
  });
});

describe("attacks across the shore (NAVAL 2.6)", () => {
  it("a hero afloat attacks a land stack beside it and stays aboard", () => {
    let s = navalGame(
      STRAIT,
      [monster("goblins", 15, 3, "goblin", 1)],
      [boat("boat-1", 14, 4)],
      15,
      5,
    );
    s = withPoints(s, 1500);
    s = ok(moveHeroAlong(s, "hero-0", [{ x: 14, y: 4 }])).state;
    const path = findPath(s, "hero-0", 15, 3, { ignoreFog: true })!;
    expect(path.steps).toHaveLength(1);
    expect(path.steps[0]).toMatchObject({ attack: true, cost: 0 });
    const r = ok(moveHeroAlong(s, "hero-0", path.steps));
    expect(r.state.pendingBattle).toMatchObject({
      kind: "monster",
      objectId: "goblins",
    });
    const won = ok(
      applyBattleResult(r.state, {
        winner: "attacker",
        attacker: hero(r.state)
          .army.filter((x) => x !== null)
          .map((x) => x!.count),
        defender: [0],
      }),
    );
    expect(isAfloat(won.state, hero(won.state))).toBe(true);
  });

  it("a hero ashore attacks a sea stack beside the shore", () => {
    let s = navalGame(STRAIT, [], []);
    s = {
      ...s,
      monsters: {
        jelly: { id: "jelly", creature: "goblin", count: 3, x: 5, y: 6 },
      },
      map: { ...s.map, objects: [...s.map.objects, monster("jelly", 5, 6)] },
    };
    s = withPoints(s, 1500);
    const path = findPath(s, "hero-0", 5, 6, { ignoreFog: true })!;
    expect(path.steps.at(-1)).toMatchObject({ x: 5, y: 6, attack: true });
    const r = ok(moveHeroAlong(s, "hero-0", path.steps));
    expect(r.state.pendingBattle?.objectId).toBe("jelly");
  });
});

describe("battles between heroes at the shore (NAVAL 2.5, 3.7)", () => {
  /** Hero 0 ashore at (15, 4); hero 1 (player 1) afloat at (14, 5). */
  function pier(): GameState {
    const s = navalGame(
      STRAIT,
      [town("town-0", 2, 5, 0)],
      [boat("boat-1", 14, 5, 1)],
      15,
      4,
      [heroStart(16, 8, 1)],
    );
    const next = structuredClone(s);
    const foe = next.heroes.find((h) => h.owner === 1)!;
    foe.x = 14;
    foe.y = 5;
    return withPoints(next, 1500);
  }

  it("a hero ashore beats a hero afloat and takes its ship, moored", () => {
    const s = pier();
    const foe = s.heroes.find((h) => h.owner === 1)!;
    expect(isAfloat(s, foe)).toBe(true);
    const path = findPath(s, "hero-0", 14, 5, { ignoreFog: true })!;
    expect(path.steps).toEqual([
      expect.objectContaining({ x: 14, y: 5, attack: true }),
    ]);
    const r = ok(moveHeroAlong(s, "hero-0", path.steps));
    expect(r.state.pendingBattle).toMatchObject({
      kind: "hero",
      objectId: foe.id,
    });
    const setup = battleSetup(r.state)!;
    const won = ok(
      applyBattleResult(r.state, {
        winner: "attacker",
        attacker: setup.attacker.stacks.map((st) => st.count),
        defender: setup.defender.stacks.map(() => 0),
      }),
    );
    expect(shipAt(won.state, 14, 5)).toMatchObject({ owner: 0 });
    expect(won.events).toContainEqual({
      type: "ship-captured",
      shipId: "ship-1",
      owner: 0,
      from: 1,
    });
    // The winner stays ashore and may board its prize next.
    expect(hero(won.state)).toMatchObject({ x: 15, y: 4 });
  });

  it("a hero afloat that retreats loses its ship", () => {
    const s = pier();
    const turned = { ...s, currentPlayer: 1 };
    const foe = turned.heroes.find((h) => h.owner === 1)!;
    const atk = ok(moveHeroAlong(turned, foe.id, [{ x: 15, y: 4 }])).state;
    const setup = battleSetup(atk)!;
    const fled = applyBattleResult(atk, {
      winner: "defender",
      retreat: "attacker",
      attacker: setup.attacker.stacks.map((st) => st.count),
      defender: setup.defender.stacks.map((st) => st.count),
    });
    // Player 1 has no town: it cannot retreat; give it one and retry.
    expect(fled.ok).toBe(false);
    const withTown = structuredClone(atk);
    withTown.towns["town-0"]!.owner = 1;
    const r = ok(
      applyBattleResult(withTown, {
        winner: "defender",
        retreat: "attacker",
        attacker: setup.attacker.stacks.map((st) => st.count),
        defender: setup.defender.stacks.map((st) => st.count),
      }),
    );
    expect(shipsOf(r.state)).toEqual([]);
    expect(r.events).toContainEqual(
      expect.objectContaining({ type: "ship-sunk", why: "retreat" }),
    );
  });
});

describe("ownership, capture and sinking (NAVAL 2.5)", () => {
  /** Hero 0 afloat at (6, 5) on ship-1. */
  function afloat(): GameState {
    let s = navalGame(STRAIT, [], [boat("boat-1", 5, 5)]);
    s = withPoints(s, 1500);
    return ok(
      moveHeroAlong(s, "hero-0", [
        { x: 5, y: 5 },
        { x: 6, y: 5 },
      ]),
    ).state;
  }

  it("a hero afloat beaten by neutrals loses its ship", () => {
    let s = afloat();
    s = {
      ...s,
      monsters: {
        crab: { id: "crab", creature: "goblin", count: 50, x: 7, y: 5 },
      },
      map: { ...s.map, objects: [...s.map.objects, monster("crab", 7, 5)] },
    };
    s = ok(moveHeroAlong(s, "hero-0", [{ x: 7, y: 5 }])).state;
    const setup = battleSetup(s)!;
    const r = ok(
      applyBattleResult(s, {
        winner: "defender",
        attacker: setup.attacker.stacks.map(() => 0),
        defender: setup.defender.stacks.map((st) => st.count),
      }),
    );
    expect(shipsOf(r.state)).toEqual([]);
    expect(r.events).toContainEqual({
      type: "ship-sunk",
      shipId: "ship-1",
      x: 6,
      y: 5,
      why: "defeat",
    });
  });

  it("boarding another player's moored ship takes it", () => {
    let s = navalGame(STRAIT, [], [boat("boat-1", 5, 5, 1)]);
    s = withPoints(s, 1500);
    const r = ok(moveHeroAlong(s, "hero-0", [{ x: 5, y: 5 }]));
    expect(shipAt(r.state, 5, 5)?.owner).toBe(0);
    expect(r.events).toContainEqual(
      expect.objectContaining({ type: "ship-boarded", from: 1 }),
    );
  });

  it("an eliminated player's ships turn neutral; a moored ship scuttles", () => {
    const s = afloat();
    const next = structuredClone(s);
    next.heroes = next.heroes.map((h) => ({ ...h, x: 4, y: 5 }));
    const events: never[] = [];
    eliminate(next, next.players[0]!, events);
    expect(shipAt(next, 6, 5)?.owner).toBeNull();
    const sinks: Parameters<typeof scuttleShip>[2] = [];
    expect(scuttleShip(s, "ship-1", sinks)).toBe(false); // a hero aboard
    const moored = structuredClone(next);
    expect(scuttleShip(moored, "ship-1", sinks)).toBe(true);
    expect(shipsOf(moored)).toEqual([]);
  });
});

describe("the day afloat (NAVAL 2.4)", () => {
  it("a hero afloat starts the day with sea points, 1500 base", () => {
    let s = navalGame(STRAIT, [], [boat("boat-1", 5, 5)]);
    s = withPoints(s, 1500);
    s = ok(moveHeroAlong(s, "hero-0", [{ x: 5, y: 5 }])).state;
    s = ok(endTurn(s)).state;
    const h = hero(s);
    expect(h.seaMaxMp).toBe(1500);
    expect(h.mp).toBe(1500);
    expect(seaMaxOf(s, h)).toBe(1500);
  });

  it("an own town's Lighthouse adds 300 once", () => {
    const s = navalGame(STRAIT, [town("town-0", 2, 5, 0)], [], 3, 5);
    const h = hero(s);
    expect(seaMovementPoints(s, h)).toBe(1500);
    const lit = structuredClone(s);
    lit.towns["town-0"]!.buildings.push("lighthouse");
    expect(seaMovementPoints(lit, hero(lit))).toBe(1800);
  });

  it("converts by today's two maxima", () => {
    expect(toSeaPoints(1100, 1600, 2000)).toBe(1375);
    expect(toSeaPoints(0, 1600, 2000)).toBe(0);
  });
});

describe("docks (NAVAL 2.2)", () => {
  it("is the nearest sea cell within four steps of a town's entrance", () => {
    const s = navalGame(STRAIT, [town("town-0", 2, 5, 0)], [], 3, 6);
    expect(townDock(s.map, "town-0")).toEqual({ x: 5, y: 2 });
    const far = navalGame(STRAIT, [town("town-0", 0, 9, 0)], [], 3, 6);
    expect(townDock(far.map, "town-0")).toBeNull();
  });
});

describe("saves (bead bzc.149)", () => {
  it("keeps ships, the naval flag and sea maxima through a save", () => {
    let s = navalGame(STRAIT, [], [boat("boat-1", 5, 5)]);
    s = withPoints(s, 1500);
    s = ok(
      moveHeroAlong(s, "hero-0", [
        { x: 5, y: 5 },
        { x: 6, y: 5 },
      ]),
    ).state;
    const store = new Map<string, string>();
    const storage: SaveStorage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
      removeItem: (k) => void store.delete(k),
    };
    expect(saveGame(storage, s)).toBe(true);
    const r = readSave(storage);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.state.map.naval).toBe(true);
    expect(r.state.ships).toEqual(s.ships);
    expect(isAfloat(r.state, hero(r.state))).toBe(true);
    expect(findPath(r.state, "hero-0", 10, 5, { ignoreFog: true })).toEqual(
      findPath(s, "hero-0", 10, 5, { ignoreFog: true }),
    );
  });

  it("gives a naval save without a ships list the map's boats", () => {
    const s = navalGame(STRAIT, [], [boat("boat-1", 5, 5)]);
    const old: Partial<GameState> = structuredClone(s);
    delete old.ships;
    delete old.shipsMade;
    const store = new Map<string, string>([
      ["border-marches.save", JSON.stringify({ version: 4, state: old })],
    ]);
    const r = readSave({
      getItem: (k) => store.get(k) ?? null,
      setItem: () => undefined,
      removeItem: () => undefined,
    });
    expect(r.kind === "ok" && r.state.ships).toEqual(s.ships);
  });
});

describe("dry maps are unchanged (bead bzc.149)", () => {
  it("plans exactly as before when the map is not naval", () => {
    const rows = field(12, 8);
    rows[3] = "gggg~~~~gggg";
    const dry = newGame(buildMap(rows, [heroStart(0, 0)]));
    const flagged = { ...dry, map: { ...dry.map, naval: false } };
    expect(moveContext(dry, hero(dry)).naval).toBeUndefined();
    const a = findPath(dry, "hero-0", 11, 7, { ignoreFog: true });
    const b = findPath(flagged, "hero-0", 11, 7, { ignoreFog: true });
    expect(a).toEqual(b);
    expect(a?.steps.some((st) => "afloat" in st || "left" in st)).toBe(false);
    expect(Object.keys(dry)).not.toContain("ships");
    expect(dry.heroes.every((h) => h.seaMaxMp === undefined)).toBe(true);
  });
});
