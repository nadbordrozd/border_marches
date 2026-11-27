/**
 * The adventure AI's Deepforge (FACTION_DWARVES.md section 12, bead
 * bzc.134) on small fixed states: the first-week opening, the Deep Shaft
 * and the Repair Yard in the build order, the Keystone hall (The Great
 * Boiler), the wander range, recruiting with ore, and the classes' magic
 * leaning.
 */
import { describe, expect, it } from "vitest";
import { buildQueue, chooseBuild } from "../../../src/core/ai/index.ts";
import {
  OPENINGS,
  SPECIAL_RANK,
  buildingRank,
  chooseRecruit,
  keystoneBuild,
} from "../../../src/core/ai/economy.ts";
import {
  WANDER_DAYS,
  leansToMagic,
} from "../../../src/core/ai/adventure-ai.ts";
import { townTree } from "../../../src/data/factions.ts";
import { KEYSTONE_ITEM } from "../../../src/data/factionTowns.ts";
import type { BuildingDef, Resources } from "../../../src/data/types.ts";
import { newGame } from "../../../src/core/game/index.ts";
import type {
  GameState,
  HeroState,
  TownState,
} from "../../../src/core/game/index.ts";
import { build } from "../../../src/core/game/town.ts";
import { registerSpells } from "../../../src/core/magic/index.ts";
import { buildMap, field, heroStart, ok, town } from "../game/helpers.ts";

registerSpells();

const RICH = { gold: 100000, wood: 500, ore: 500, essence: 100 };

function dwarves(): GameState {
  return newGame(
    buildMap(field(16, 5), [town("t0", 0, 2, 0), heroStart(1, 2, 0)]),
    { players: [{ kind: "ai", faction: "dwarves" }] },
  );
}

function withTown(s: GameState, patch: Partial<TownState>): GameState {
  return { ...s, towns: { ...s.towns, t0: { ...s.towns["t0"]!, ...patch } } };
}

function funds(s: GameState, resources: Resources): GameState {
  return {
    ...s,
    players: s.players.map((p) => ({ ...p, resources: { ...resources } })),
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

function def(faction: string, id: string): BuildingDef {
  const d = townTree(faction as never)?.buildings[id];
  if (d === undefined) throw new Error(`${faction} has no ${id}`);
  return d;
}

describe("the Steamworks' build order", () => {
  it("opens with the Rivet Range, Town Hall, Riveted Palisade and Gyro Hangar", () => {
    expect(OPENINGS["dwarves"]).toEqual([
      "rivet-range",
      "town-hall",
      "fort-1",
      "gyro-hangar",
    ]);
    let s = funds(dwarves(), RICH);
    const built: string[] = [];
    for (let day = 1; day <= 4; day++) {
      const choice = chooseBuild({ ...s, day }, s.towns["t0"]!);
      expect(choice.build).not.toBeNull();
      built.push(choice.build as string);
      s = ok(build({ ...s, day }, "t0", choice.build as string)).state;
      s = withTown(s, { builtToday: false });
    }
    expect(built).toEqual(OPENINGS["dwarves"]);
  });

  it("ranks the Deep Shaft with the Tithe Barn, the Repair Yard after the Boiler Works", () => {
    expect(SPECIAL_RANK["deep-shaft"]).toBe(
      buildingRank(def("humans", "tithe-barn")),
    );
    const t = dwarves().towns["t0"]!;
    expect(at(t, "marketplace")).toBeLessThan(at(t, "deep-shaft"));
    expect(at(t, "deep-shaft")).toBeLessThan(at(t, "resource-silo"));
    expect(at(t, "boiler-works")).toBeLessThan(at(t, "repair-yard"));
    expect(at(t, "repair-yard")).toBeLessThan(at(t, "great-foundry"));
    // The Drills and the Keystone hall keep their places (the hall is
    // never queued: it needs the Keystone).
    expect(at(t, "great-foundry")).toBeLessThan(at(t, "scrap-heap"));
    expect(at(t, "the-great-boiler")).toBe(-1);
  });

  it("other factions' specials keep their ranks", () => {
    expect(buildingRank(def("humans", "tithe-barn"))).toBe(52);
    expect(buildingRank(def("candy", "larder"))).toBe(45);
  });

  it("builds the Deep Shaft once the Marketplace stands", () => {
    const s0 = dwarves();
    const s = funds(
      withTown(s0, {
        buildings: [
          ...s0.towns["t0"]!.buildings,
          ...OPENINGS["dwarves"]!,
          "city-hall",
          "mortar-yard",
          "marketplace",
          "magic-guild-1",
          "boiler-works",
        ],
      }),
      RICH,
    );
    expect(chooseBuild({ ...s, day: 20 }, s.towns["t0"]!).build).toBe(
      "deep-shaft",
    );
  });

  it("builds the Repair Yard once the Boiler Works stands, before the Great Foundry", () => {
    const s0 = dwarves();
    const s = funds(
      withTown(s0, {
        buildings: [
          ...s0.towns["t0"]!.buildings,
          ...OPENINGS["dwarves"]!,
          "city-hall",
          "mortar-yard",
          "marketplace",
          "magic-guild-1",
          "boiler-works",
          "deep-shaft",
          "resource-silo",
        ],
      }),
      RICH,
    );
    expect(chooseBuild({ ...s, day: 20 }, s.towns["t0"]!).build).toBe(
      "repair-yard",
    );
  });

  it("builds The Great Boiler the day a hero brings the Keystone in", () => {
    const s0 = dwarves();
    const s = funds(
      withTown(s0, {
        buildings: [...s0.towns["t0"]!.buildings, "town-hall", "city-hall"],
      }),
      RICH,
    );
    const bearer = withHero(s, { backpack: [KEYSTONE_ITEM], x: 0, y: 2 });
    expect(keystoneBuild(bearer, bearer.towns["t0"]!)).toBe("the-great-boiler");
  });
});

describe("the Deepforge's adventure play", () => {
  it("ranges two days from home in the first weeks", () => {
    expect(WANDER_DAYS["dwarves"]).toBe(2);
  });

  const yard = (resources: Resources): GameState => {
    const s0 = funds(dwarves(), resources);
    const t0 = s0.towns["t0"]!;
    return withTown(s0, {
      dwellings: {
        ...t0.dwellings,
        "steam-tank": { available: 2, remainder: 0 },
        mortar: { available: 4, remainder: 0 },
      },
    });
  };

  it("recruits the Steam Tanks first, paying their ore", () => {
    const s = yard(RICH);
    expect(chooseRecruit(s, s.towns["t0"]!, {}, true)).toMatchObject({
      type: "recruit",
      creature: "steam-tank",
      count: 2,
    });
  });

  it("keeps back the ore a building being saved for needs", () => {
    // 12 ore, 10 kept for the Boiler Works: one Steam Tank's 2 ore left.
    const s = yard({ gold: 20000, wood: 0, ore: 12, essence: 0 });
    expect(chooseRecruit(s, s.towns["t0"]!, { ore: 10 }, true)).toMatchObject({
      type: "recruit",
      creature: "steam-tank",
      count: 1,
    });
    // With 11 ore no Tank fits: the Mortars (1 ore each) are next.
    const t = yard({ gold: 20000, wood: 0, ore: 11, essence: 0 });
    expect(chooseRecruit(t, t.towns["t0"]!, { ore: 10 }, true)).toMatchObject({
      type: "recruit",
      creature: "mortar",
      count: 1,
    });
  });

  it("the Artificer leans to magic (the guild moves up), the Thane does not", () => {
    const h = dwarves().heroes[0]!;
    expect(leansToMagic({ ...h, heroClass: "artificer" })).toBe(true);
    expect(leansToMagic({ ...h, heroClass: "thane", skills: [] })).toBe(false);
    const t = dwarves().towns["t0"]!;
    const plan = { magic: true };
    expect(
      buildQueue(t, plan).findIndex((d) => d.id === "magic-guild-1"),
    ).toBeLessThan(buildQueue(t).findIndex((d) => d.id === "magic-guild-1"));
  });
});
