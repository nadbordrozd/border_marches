import { describe, expect, it } from "vitest";
import {
  build,
  endDay,
  findPath,
  heroIncome,
  isExplored,
  recruit,
  moveHeroAlong,
  newGame,
} from "../../../src/core/game/index.ts";
import { buildSmallMap } from "../../fixtures/small-map.ts";
import { ok } from "./helpers.ts";

describe("newGame on the small fixture map", () => {
  const state = newGame(buildSmallMap());

  it("places the Chieftain with the starting army at the hero start", () => {
    expect(state.heroes).toHaveLength(1);
    const hero = state.heroes[0]!;
    expect(hero).toMatchObject({
      id: "hero-0",
      owner: 0,
      x: 5,
      y: 6,
      mp: 1500,
      maxMp: 1500,
      attack: 2,
      defense: 2,
      xp: 0,
      level: 1,
      alive: true,
    });
    expect(hero.army).toEqual([
      { creature: "caveman", count: 18 },
      { creature: "spitter", count: 6 },
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("sets up resources, the town, mines and monsters", () => {
    expect(state.day).toBe(1);
    expect(state.status).toBe("playing");
    expect(state.players).toHaveLength(1);
    expect(state.players[0]!.resources).toEqual({
      gold: 7500,
      wood: 20,
      ore: 10,
      essence: 4,
    });
    const town = state.towns["town-1"]!;
    expect(town.owner).toBe(0);
    expect(town.isHold).toBe(false);
    expect(town.buildings).toEqual(["village-hall", "cave"]);
    expect(town.dwellings).toEqual({
      caveman: { available: 14, remainder: 0 },
    });
    expect(state.mines["mine-ore-1"]).toEqual({
      id: "mine-ore-1",
      resource: "ore",
      owner: null,
    });
    expect(state.monsters["monster-1"]).toEqual({
      id: "monster-1",
      creature: "raptor",
      count: 8,
      x: 14,
      y: 9,
    });
    expect(state.pendingBattle).toBeNull();
  });

  it("reveals fog around the hero (6) and the town (5)", () => {
    expect(isExplored(state, 0, 5, 6)).toBe(true);
    expect(isExplored(state, 0, 11, 6)).toBe(true); // 6 east of the hero
    expect(isExplored(state, 0, 12, 6)).toBe(false);
    expect(isExplored(state, 0, 4, 0)).toBe(true); // 4 north of the gate
    expect(isExplored(state, 0, 20, 11)).toBe(false);
  });

  it("is deterministic and JSON-serialisable", () => {
    const again = newGame(buildSmallMap());
    expect(again).toEqual(state);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it("walks the hero into its town", () => {
    const path = findPath(state, "hero-0", 4, 4)!;
    expect(path.total).toBe(241);
    const { state: next, events } = ok(
      moveHeroAlong(state, "hero-0", path.steps),
    );
    expect(next.heroes[0]).toMatchObject({ x: 4, y: 4, mp: 1500 - 241 });
    expect(events).toContainEqual({
      type: "visit-town",
      heroId: "hero-0",
      townId: "town-1",
    });
  });

  it("plans to the ore mine without crossing the guarded pass", () => {
    const path = findPath(state, "hero-0", 20, 11, { ignoreFog: true })!;
    expect(path).not.toBeNull();
    for (const s of path.steps) {
      expect(Math.max(Math.abs(s.x - 14), Math.abs(s.y - 9))).toBeGreaterThan(
        1,
      );
    }
    const attack = findPath(state, "hero-0", 14, 9, { ignoreFog: true })!;
    expect(attack.steps.at(-1)).toMatchObject({ x: 14, y: 9, attack: true });
  });

  it("rejects maps without a hero start or with unknown creatures", () => {
    const noHero = buildSmallMap();
    noHero.objects = noHero.objects.filter((o) => o.kind !== "hero-start");
    expect(() => newGame(noHero)).toThrow(/hero start/);
    const badMonster = buildSmallMap();
    badMonster.objects = badMonster.objects.map((o) =>
      o.kind === "monster"
        ? { ...o, data: { creature: "dragon", count: 1 } }
        : o,
    );
    expect(() => newGame(badMonster)).toThrow(/dragon/);
  });
});

describe("determinism", () => {
  function script() {
    let s = newGame(buildSmallMap());
    s = ok(build(s, "town-1", "town-hall")).state;
    s = ok(recruit(s, "town-1", "caveman", 14)).state;
    const toTown = findPath(s, "hero-0", 4, 4)!;
    s = ok(moveHeroAlong(s, "hero-0", toTown.steps)).state;
    for (let i = 0; i < 8; i++) s = ok(endDay(s)).state;
    const attack = findPath(s, "hero-0", 14, 9, { ignoreFog: true })!;
    s = ok(moveHeroAlong(s, "hero-0", attack.steps)).state;
    return s;
  }

  it("gives identical states for the same commands", () => {
    const a = script();
    const b = script();
    expect(a).toEqual(b);
    expect(a.day).toBe(9);
    expect(a.towns["town-1"]!.dwellings.caveman!.available).toBe(14);
    // Plus the start hero's income (skills, specialty: RULES_V2 3.7).
    const daily = 1000 + heroIncome(a.heroes[0]!, 2).gold;
    expect(a.players[0]!.resources.gold).toBe(7500 - 2500 - 700 + 8 * daily);
  });
});
