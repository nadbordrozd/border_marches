// The kingdom overview (UI2-12, bead border_marches-bzc.62): the row models
// of heroes, towns and income on small hand-built states, and the rows'
// clicks (a hero row picks the hero, a town row the town). No DOM library
// in the unit tier: tests/ui/fake-dom.ts.
import { describe, expect, it } from "vitest";
import {
  dailyIncome,
  fortLevel,
  heroesOf,
  newGame,
  townIncome,
  townsOf,
} from "../../src/core/game/index.ts";
import type { GameState, TownState } from "../../src/core/game/index.ts";
import { generateMap } from "../../src/core/map/generate.ts";
import { getCreature } from "../../src/data/creatures.ts";
import { RESOURCE_IDS } from "../../src/data/economy.ts";
import { getHeroClass } from "../../src/data/hero.ts";
import { buildableTowns } from "../../src/ui/hints.ts";
import {
  armyStacks,
  bestHall,
  kingdomModel,
  kingdomTown,
  perDayText,
} from "../../src/ui/kingdom-model.ts";
import { kingdomBody, type KingdomPick } from "../../src/ui/kingdom.ts";
import { dwellingStrip } from "../../src/ui/town-dwellings.ts";
import { useFakeDocument, type FakeElement } from "./fake-dom.ts";

useFakeDocument();

let cached: GameState | undefined;
function game(): GameState {
  cached ??= newGame(generateMap(7, { size: "S", players: 2 }), {
    players: [
      { kind: "human", faction: "humans" },
      { kind: "ai", faction: "undead" },
    ],
  });
  return structuredClone(cached);
}

/** A game where player 0 has two heroes and every town but one. */
function kingdom(): GameState {
  const s = game();
  const towns = Object.values(s.towns);
  towns.forEach((t, i) => {
    t.owner = i === towns.length - 1 ? 1 : 0;
  });
  const h = s.heroes.find((x) => x.owner === 0 && x.alive)!;
  s.heroes.push({
    ...structuredClone(h),
    id: "hero-second",
    name: "Second Hero",
    level: 3,
    army: [
      null,
      { creature: "squire", count: 4 },
      null,
      null,
      null,
      null,
      null,
    ],
  });
  return s;
}

const ownTown = (s: GameState): TownState =>
  Object.values(s.towns).find((t) => t.owner === 0 && !t.isHold)!;

describe("army stacks", () => {
  it("keep the filled slots in order with portrait and count", () => {
    const stacks = armyStacks([
      null,
      { creature: "squire", count: 12 },
      null,
      { creature: "raptor", count: 1 },
      null,
      null,
      null,
    ]);
    expect(stacks).toEqual([
      {
        creature: "squire",
        count: 12,
        portrait: `portrait-${getCreature("squire").sprite}`,
      },
      {
        creature: "raptor",
        count: 1,
        portrait: `portrait-${getCreature("raptor").sprite}`,
      },
    ]);
    expect(armyStacks([null, null])).toEqual([]);
  });
});

describe("kingdom model", () => {
  it("has a row per own hero with level, class, bars and army", () => {
    const s = kingdom();
    const own = heroesOf(s, 0);
    const m = kingdomModel(s, 0, "hero-second");
    expect(m.heroes.map((h) => h.id)).toEqual(own.map((h) => h.id));
    const second = m.heroes.find((h) => h.id === "hero-second")!;
    expect(second.selected).toBe(true);
    expect(m.heroes.filter((h) => h.selected)).toHaveLength(1);
    expect(second.title).toBe(
      `Level 3 ${getHeroClass(second.hero.heroClass).name}`,
    );
    expect(second.army).toEqual(armyStacks(second.hero.army));
    expect(second.army.map((a) => a.count)).toEqual([4]);
  });

  it("has a row per own town: fort, hall, income, garrison, hire, build", () => {
    const s = kingdom();
    const m = kingdomModel(s, 0);
    expect(m.towns.map((t) => t.id)).toEqual(townsOf(s, 0).map((t) => t.id));
    const buildable = new Set(buildableTowns(s, 0));
    for (const row of m.towns) {
      const town = s.towns[row.id]!;
      expect(row.fort).toBe(fortLevel(town));
      expect(row.income).toEqual(townIncome(town, s.day));
      expect(row.garrison).toEqual(armyStacks(town.garrison));
      expect(row.build).toBe(buildable.has(town.id));
      expect(row.builtToday).toBe(town.builtToday);
    }
  });

  it("names the best hall and the fort level", () => {
    const s = kingdom();
    const town = ownTown(s);
    town.buildings = ["village-hall", "town-hall", "fort-1", "fort-2"];
    const row = kingdomTown(s, town, false);
    expect(row.hall).toMatchObject({ building: "town-hall", gold: 1000 });
    expect(row.fort).toBe(2);
    expect(bestHall({ ...town, buildings: [] })).toBeNull();
  });

  it("lists only built dwellings with creatures waiting, in tier order", () => {
    const s = kingdom();
    const town = ownTown(s);
    const strip = dwellingStrip(town);
    const built = strip.filter((d) => d.built);
    expect(built.length).toBeGreaterThan(0);
    for (const d of built)
      town.dwellings[d.creature] = { available: 0 } as never;
    expect(kingdomTown(s, town, false).available).toEqual([]);
    const first = built[0]!;
    town.dwellings[first.creature] = { available: 9 } as never;
    expect(kingdomTown(s, town, false).available).toEqual([
      {
        creature: first.creature,
        count: 9,
        portrait: `portrait-${getCreature(first.creature).sprite}`,
      },
    ]);
  });

  it("shows the Hold as a fortress with no hall and no tree", () => {
    const s = kingdom();
    const hold: TownState = {
      ...structuredClone(ownTown(s)),
      id: "hold",
      name: "Warlord's Hold",
      faction: "neutral" as never,
      isHold: true,
      buildings: [],
      dwellings: {},
    };
    const row = kingdomTown(s, hold, false);
    expect(row).toMatchObject({
      hold: true,
      hall: null,
      hasTree: false,
      factionName: "Fortress",
      available: [],
    });
  });

  it("splits the income per resource by source", () => {
    const s = kingdom();
    const m = kingdomModel(s, 0);
    const total = dailyIncome(s, 0);
    expect(m.income.map((r) => r.resource)).toEqual([...RESOURCE_IDS]);
    for (const r of m.income) {
      expect(r.perDay).toBe(total[r.resource]);
      expect(r.towns + r.mines + r.heroes).toBe(r.perDay);
    }
    expect(perDayText(2000)).toBe("+2000 per day");
  });

  it("lists the rivals with their towns", () => {
    const s = kingdom();
    const m = kingdomModel(s, 0);
    expect(m.rivals.map((r) => r.id)).toEqual([1]);
    expect(m.rivals[0]!.towns).toBe(townsOf(s, 1).length);
    expect(m.rivals[0]!.computer).toBe(true);
  });
});

describe("kingdom rows", () => {
  const click = (node: FakeElement): void => {
    for (const fn of node.listeners.get("click") ?? []) fn({});
  };

  it("a click on a hero row picks the hero, on a town row the town", () => {
    const s = kingdom();
    const m = kingdomModel(s, 0, null);
    const picks: KingdomPick[] = [];
    const body = kingdomBody(m, (p) => picks.push(p)) as unknown as FakeElement;
    const heroRows = body.all("kd-hero-row");
    const townRows = body.all("kd-town-row");
    expect(heroRows).toHaveLength(m.heroes.length);
    expect(townRows).toHaveLength(m.towns.length);
    click(heroRows[1]!);
    click(townRows[0]!);
    expect(picks).toEqual([
      { kind: "hero", id: m.heroes[1]!.id },
      { kind: "town", id: m.towns[0]!.id },
    ]);
  });

  it("draws stacks as portraits with counts, no names", () => {
    const s = kingdom();
    const m = kingdomModel(s, 0, null);
    const body = kingdomBody(m, () => undefined) as unknown as FakeElement;
    const second = body
      .all("kd-hero-row")
      .find((r) => r.dataset["hero"] === "hero-second")!;
    const stacks = second.all("kd-stack");
    expect(stacks).toHaveLength(1);
    expect(stacks[0]!.one("kd-stack-portrait")).toBeDefined();
    expect(stacks[0]!.textContent).toBe("4");
  });

  it("puts every resource in one income row", () => {
    const s = kingdom();
    const m = kingdomModel(s, 0);
    const body = kingdomBody(m, () => undefined) as unknown as FakeElement;
    const res = body.one("kd-income")!.all("kd-res");
    expect(res.map((r) => r.textContent)).toEqual(
      m.income.map((r) => perDayText(r.perDay)),
    );
  });
});
