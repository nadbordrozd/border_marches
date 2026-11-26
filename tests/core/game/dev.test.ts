/**
 * Developer tools (bead bzc.93): reveal the map, build every building,
 * add resources, refill a hero. Pure commands; saves keep loading.
 */
import { describe, expect, it } from "vitest";
import {
  DEV_GOLD,
  DEV_OTHER,
  devAddResources,
  devBuildAll,
  devBuildAllTowns,
  devRefillHero,
  devRevealMap,
  maxMana,
  newGame,
  type GameState,
} from "../../../src/core/game/index.ts";
import { townTree } from "../../../src/data/factions.ts";
import { getCreature } from "../../../src/data/creatures.ts";
import { readSave, saveGame } from "../../../src/ui/save.ts";
import { buildMap, errorOf, field, heroStart, ok, town } from "./helpers.ts";

/** Human (undead) with towns t0 and t2, the AI (goblins) with t1. */
function start(): GameState {
  const map = buildMap(field(12, 12), [
    town("t0", 1, 1, 0),
    heroStart(1, 2, 0),
    town("t2", 5, 1, 0),
    town("t1", 10, 10, 1),
    heroStart(10, 9, 1),
  ]);
  const s = newGame(map, {
    players: [
      { kind: "human", faction: "undead" },
      { kind: "ai", faction: "goblins" },
    ],
  });
  // The human's hero stands in t0 with Hush 1 (guild level 1 teaches it).
  return {
    ...s,
    heroes: s.heroes.map((h) =>
      h.owner === 0
        ? { ...h, x: 1, y: 1, skills: [{ id: "quietus", rank: 1 }] }
        : h,
    ),
  };
}

describe("devRevealMap", () => {
  it("explores every cell for that player only, without touching the input", () => {
    const s = start();
    expect(s.players[0]!.explored.some((e) => !e)).toBe(true);
    const next = ok(devRevealMap(s, 0)).state;
    expect(next.players[0]!.explored).toHaveLength(12 * 12);
    expect(next.players[0]!.explored.every((e) => e)).toBe(true);
    expect(next.players[1]!.explored).toEqual(s.players[1]!.explored);
    expect(s.players[0]!.explored.some((e) => !e)).toBe(true);
  });

  it("refuses an unknown player and a finished game", () => {
    expect(errorOf(devRevealMap(start(), 7))).toBe("not-owner");
    expect(errorOf(devRevealMap({ ...start(), status: "won" }, 0))).toBe(
      "game-over",
    );
  });
});

describe("devAddResources", () => {
  it("adds 10000 gold and 50 of every other resource", () => {
    const s = start();
    const before = s.players[0]!.resources;
    const after = ok(devAddResources(s, 0)).state.players[0]!.resources;
    expect(after).toEqual({
      gold: before.gold + DEV_GOLD,
      wood: before.wood + DEV_OTHER,
      ore: before.ore + DEV_OTHER,
      essence: before.essence + DEV_OTHER,
    });
    expect(DEV_GOLD).toBe(10000);
    expect(DEV_OTHER).toBe(50);
    expect(s.players[0]!.resources).toEqual(before);
  });
});

describe("devBuildAll", () => {
  it("builds the whole tree for free, stocks dwellings, sets Drills and teaches the guild", () => {
    const s = start();
    const tree = townTree("undead")!;
    const gold = s.players[0]!.resources.gold;
    const { state, events } = ok(devBuildAll(s, "t0"));
    const t = state.towns["t0"]!;
    expect(t.buildings).toEqual([...tree.order]);
    expect(state.players[0]!.resources.gold).toBe(gold);
    expect(t.builtToday).toBe(s.towns["t0"]!.builtToday);
    // Every dwelling of the tree has stock; the new ones hold a week's growth.
    for (const id of tree.order) {
      const creature = tree.buildings[id]!.dwelling;
      if (creature === undefined) continue;
      expect(t.dwellings[creature]!.available).toBeGreaterThan(0);
      if (s.towns["t0"]!.dwellings[creature] === undefined) {
        expect(t.dwellings[creature]!.available).toBeGreaterThanOrEqual(
          getCreature(creature).growth,
        );
      }
    }
    const drills = tree.order.filter((id) => tree.buildings[id]!.drill);
    expect(state.players[0]!.drills ?? []).toHaveLength(drills.length);
    expect(events.some((e) => e.type === "spells-learnt")).toBe(true);
    // The other own town and the input are untouched.
    expect(state.towns["t2"]!.buildings).toEqual(s.towns["t2"]!.buildings);
    expect(s.towns["t0"]!.buildings.length).toBeLessThan(tree.order.length);
  });

  it("is a no-op on a finished town and refuses neutral or unknown towns", () => {
    const once = ok(devBuildAll(start(), "t0")).state;
    const twice = ok(devBuildAll(once, "t0"));
    expect(twice.state.towns["t0"]).toEqual(once.towns["t0"]);
    expect(twice.events).toEqual([]);
    expect(errorOf(devBuildAll(start(), "nope"))).toBe("unknown-town");
    const neutral = start();
    neutral.towns["t1"] = { ...neutral.towns["t1"]!, owner: null };
    expect(errorOf(devBuildAll(neutral, "t1"))).toBe("not-owner");
  });

  it("devBuildAllTowns builds every own town and none of the rival's", () => {
    const s = start();
    const state = ok(devBuildAllTowns(s, 0)).state;
    const n = townTree("undead")!.order.length;
    expect(state.towns["t0"]!.buildings).toHaveLength(n);
    expect(state.towns["t2"]!.buildings).toHaveLength(n);
    expect(state.towns["t1"]!.buildings).toEqual(s.towns["t1"]!.buildings);
  });
});

describe("devRefillHero", () => {
  it("restores movement and mana to their maximum", () => {
    const s = start();
    const id = s.heroes.find((h) => h.owner === 0)!.id;
    const drained = {
      ...s,
      heroes: s.heroes.map((h) => (h.id === id ? { ...h, mp: 0, mana: 0 } : h)),
    };
    const hero = ok(devRefillHero(drained, id)).state.heroes.find(
      (h) => h.id === id,
    )!;
    expect(hero.mp).toBe(hero.maxMp);
    expect(hero.mp).toBeGreaterThan(0);
    expect(hero.mana).toBe(maxMana(hero));
    expect(errorOf(devRefillHero(s, "nobody"))).toBe("unknown-hero");
  });
});

describe("saves", () => {
  it("a game after every cheat saves and loads back unchanged", () => {
    let s = start();
    const id = s.heroes.find((h) => h.owner === 0)!.id;
    s = ok(devRevealMap(s, 0)).state;
    s = ok(devAddResources(s, 0)).state;
    s = ok(devBuildAllTowns(s, 0)).state;
    s = ok(devRefillHero(s, id)).state;
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
    expect(saveGame(storage, s)).toBe(true);
    const loaded = readSave(storage);
    expect(loaded.kind).toBe("ok");
    if (loaded.kind === "ok") expect(loaded.state).toEqual(s);
  });
});
