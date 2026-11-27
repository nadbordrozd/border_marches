// The town's build grid as a Heroes hall (bead border_marches-bzc.60,
// UI2-09): every building of every faction sits in exactly one row or tier
// column, the columns run in tier order with each Drill under its
// creature's dwelling, and the tile colour follows the four states.
import { describe, expect, it } from "vitest";
import { build } from "../../src/core/game/index.ts";
import { newGame } from "../../src/core/game/newGame.ts";
import type { BuildStatus } from "../../src/core/game/index.ts";
import type { GameState } from "../../src/core/game/types.ts";
import { getCreature } from "../../src/data/creatures.ts";
import { FACTIONS, buildingDef, townTree } from "../../src/data/factions.ts";
import type { FactionId } from "../../src/data/types.ts";
import {
  HALL_GROUP_ORDER,
  hallBuildings,
  hallGroupOf,
  hallLayout,
  tileState,
  tileStateOf,
} from "../../src/ui/town-hall.ts";
import { buildMap, field, heroStart, ok, town } from "../core/game/helpers.ts";

const WITH_TOWNS = FACTIONS.filter((f) => f.town !== null);

describe("hallLayout", () => {
  it.each(WITH_TOWNS.map((f) => [f.id]))(
    "puts every %s building in exactly one place",
    (faction) => {
      const tree = townTree(faction)!;
      const placed = hallBuildings(hallLayout(tree));
      expect([...placed].sort()).toEqual([...tree.order].sort());
      expect(new Set(placed).size).toBe(placed.length);
    },
  );

  it.each(WITH_TOWNS.map((f) => [f.id]))(
    "orders %s dwellings by tier with Drills under their creature",
    (faction) => {
      const tree = townTree(faction)!;
      const { dwellings } = hallLayout(tree);
      const tiers = dwellings.map((c) => c.tier);
      expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
      for (const column of dwellings) {
        const [first, ...rest] = column.buildings;
        const head = tree.buildings[first!]!;
        expect(head.dwelling).toBe(column.creature);
        expect(getCreature(column.creature).tier).toBe(column.tier);
        for (const id of rest) {
          expect(tree.buildings[id]!.drill?.creature).toBe(column.creature);
        }
      }
    },
  );

  it("keeps the five rows in order and fills them as designed (Realm)", () => {
    const layout = hallLayout(townTree("humans")!);
    expect(layout.groups.map((g) => g.id)).toEqual(HALL_GROUP_ORDER);
    const row = (id: string): readonly string[] =>
      layout.groups.find((g) => g.id === id)!.buildings;
    expect(row("hall")).toEqual(["village-hall", "town-hall", "city-hall"]);
    expect(row("fort")).toEqual(["fort-1", "fort-2", "fort-3"]);
    expect(row("economy")).toEqual(["marketplace", "resource-silo", "tavern"]);
    expect(row("magic")).toEqual([
      "magic-guild-1",
      "magic-guild-2",
      "magic-guild-3",
      "magic-guild-4",
    ]);
    expect(row("specials")).toEqual([
      "tithe-barn",
      "chapel-of-oaths",
      "round-table",
    ]);
    expect(layout.dwellings.map((c) => c.buildings)).toEqual([
      ["squires-hall"],
      ["archery-range", "butts"],
      ["barracks", "guardroom"],
      ["friary"],
      ["stables", "tiltyard"],
      ["slayers-lodge"],
    ]);
  });

  it("files the Keystone building under Specials for every faction", () => {
    for (const f of WITH_TOWNS) {
      for (const id of f.town!.order) {
        const def = buildingDef(f.id, id)!;
        if (def.needsKeystone === true)
          expect(hallGroupOf(def)).toBe("specials");
      }
    }
  });
});

describe("tileStateOf", () => {
  const met = { requirementsMet: true, affordable: true };
  const cases: Array<[BuildStatus, TileExpect]> = [
    ["ok", "can"],
    ["built", "built"],
    ["resources", "resources"],
    ["requirements", "requirements"],
    ["keystone", "requirements"],
    ["start-only", "requirements"],
    ["not-owner", "requirements"],
    ["wrong-faction", "requirements"],
    ["not-naval", "requirements"],
    ["landlocked", "landlocked"],
  ];
  type TileExpect = ReturnType<typeof tileStateOf>;
  it.each(cases)("maps %s to %s", (status, want) => {
    expect(tileStateOf(status, met)).toBe(want);
  });

  it("shows the lasting reason once the town has built today", () => {
    expect(tileStateOf("built-today", met)).toBe("can");
    expect(
      tileStateOf("built-today", { requirementsMet: true, affordable: false }),
    ).toBe("resources");
    expect(
      tileStateOf("built-today", { requirementsMet: false, affordable: false }),
    ).toBe("requirements");
  });
});

describe("tileState in a game", () => {
  function start(faction: FactionId, gold: number): GameState {
    const map = buildMap(field(10, 10), [
      town("t0", 1, 1, 0),
      heroStart(1, 2, 0),
      town("t1", 8, 8, 1),
      heroStart(8, 7, 1),
    ]);
    const s = newGame(map, {
      players: [
        { kind: "human", faction },
        { kind: "ai", faction: "goblins" },
      ],
    });
    return {
      ...s,
      players: s.players.map((p) =>
        p.id === 0
          ? { ...p, resources: { gold, wood: 50, ore: 50, essence: 10 } }
          : p,
      ),
    };
  }

  it("colours a fresh Realm town's tiles by the four states", () => {
    const s = start("humans", 3000);
    const at = (id: string): string => tileState(s, "t0", id).state;
    expect(at("village-hall")).toBe("built");
    expect(at("fort-1")).toBe("can");
    expect(at("city-hall")).toBe("requirements");
    expect(at("fort-2")).toBe("requirements");
    // Magic Guild 1 costs 1500 gold, the Town Hall 2500: both affordable;
    // Stables need the Barracks first.
    expect(at("town-hall")).toBe("can");
    expect(at("stables")).toBe("requirements");
    const poor = start("humans", 100);
    expect(tileState(poor, "t0", "fort-1").state).toBe("resources");
  });

  it("keeps the lasting colours after the day's building", () => {
    const s0 = start("humans", 20000);
    const s1 = ok(build(s0, "t0", "fort-1")).state;
    expect(tileState(s1, "t0", "fort-1").state).toBe("built");
    const next = tileState(s1, "t0", "fort-2");
    expect(next.status).toBe("built-today");
    expect(next.state).toBe("can");
    expect(tileState(s1, "t0", "fort-3").state).toBe("requirements");
  });
});
