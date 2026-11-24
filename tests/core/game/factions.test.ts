/**
 * The three v0.2 factions in the game: each can be started, built and
 * recruited from; Drills are per-player flags read by the battle setup;
 * natives and birthrights reach the engine; town specials pay and power;
 * the town trees match the faction documents' totals.
 */

import { describe, expect, it } from "vitest";
import { build, buildStatus, recruit } from "../../../src/core/game/town.ts";
import { battleSetup } from "../../../src/core/game/battle.ts";
import { dailyIncome } from "../../../src/core/game/turn.ts";
import { newGame } from "../../../src/core/game/newGame.ts";
import { engineSetupFromGame } from "../../../src/core/battle/index.ts";
import { generateMap } from "../../../src/core/map/generate.ts";
import { townTree } from "../../../src/data/factions.ts";
import { getHeroClass } from "../../../src/data/hero.ts";
import { rosterFor } from "../../../src/data/players.ts";
import { playerSetups } from "../../../src/ui/app.ts";
import type { GameState } from "../../../src/core/game/types.ts";
import type { FactionId } from "../../../src/data/types.ts";
import { buildMap, field, heroStart, monster, ok, town } from "./helpers.ts";

const FACTIONS: FactionId[] = ["humans", "undead", "goblins"];

function startAs(
  faction: FactionId,
  objects = [monster("m", 2, 1)],
): GameState {
  const map = buildMap(field(10, 10), [
    town("t0", 1, 1, 0),
    heroStart(1, 2, 0),
    town("t1", 8, 8, 1),
    heroStart(8, 7, 1),
    ...objects,
  ]);
  const s = newGame(map, {
    players: [
      { kind: "human", faction },
      { kind: "ai", faction: "goblins" },
    ],
  });
  // The first hero stands in its town.
  return {
    ...s,
    heroes: s.heroes.map((h) => (h.owner === 0 ? { ...h, x: 1, y: 1 } : h)),
  };
}

const RICH = { gold: 100000, wood: 500, ore: 500, essence: 100 };

function rich(s: GameState): GameState {
  return {
    ...s,
    players: s.players.map((p) =>
      p.id === 0 ? { ...p, resources: { ...RICH } } : p,
    ),
  };
}

const TOTALS: Record<string, [number, number, number, number, number]> = {
  // [buildings, gold, wood, ore, essence] (FACTION_* section 9)
  humans: [25, 52500, 155, 104, 22],
  undead: [26, 56000, 117, 132, 34],
  goblins: [24, 45800, 179, 72, 13],
};

const FIRST_DWELLING: Record<string, [string, string, number]> = {
  humans: ["archery-range", "longbowman", 9],
  undead: ["charnel-pit", "ghoul", 9],
  goblins: ["powder-shed", "bomb-chucker", 10],
};

describe.each(FACTIONS)("%s", (faction) => {
  it("can be started: its town, a hero of its classes, the class army", () => {
    const s = startAs(faction);
    const t = s.towns["t0"]!;
    expect(t.faction).toBe(faction);
    const hero = s.heroes.find((h) => h.owner === 0)!;
    const cls = getHeroClass(hero.heroClass);
    expect(cls.faction).toBe(faction);
    expect(hero.army.filter((x) => x !== null)).toEqual(
      cls.startingArmy.map((x) => ({ ...x })),
    );
    // Starts with the Village Hall, the tier 1 dwelling and a Tavern.
    const tree = townTree(faction)!;
    expect(t.buildings).toEqual(
      tree.order.filter((b) => tree.buildings[b]!.startBuilt),
    );
    expect(t.buildings).toContain("tavern");
    expect(Object.keys(t.dwellings)).toHaveLength(1);
  });

  it("can build its tier 2 dwelling and recruit from it", () => {
    let s = rich(startAs(faction));
    const [dwelling, creature, growth] = FIRST_DWELLING[faction]!;
    expect(buildStatus(s, "t0", dwelling)).toBe("ok");
    s = ok(build(s, "t0", dwelling)).state;
    expect(s.towns["t0"]!.dwellings[creature as "goblin"]).toEqual({
      available: growth,
      remainder: 0,
    });
    const have = (st: GameState): number =>
      st.heroes
        .find((h) => h.owner === 0)!
        .army.reduce((n, x) => n + (x?.creature === creature ? x.count : 0), 0);
    const n0 = have(s);
    s = ok(recruit(s, "t0", creature as "goblin", 3)).state;
    expect(have(s)).toBe(n0 + 3);
    expect(s.towns["t0"]!.dwellings[creature as "goblin"]!.available).toBe(
      growth - 3,
    );
  });

  it("has the documented tree: building count and every cost", () => {
    const tree = townTree(faction)!;
    const total = [tree.order.length, 0, 0, 0, 0];
    for (const id of tree.order) {
      const c = tree.buildings[id]!.cost;
      total[1]! += c.gold ?? 0;
      total[2]! += c.wood ?? 0;
      total[3]! += c.ore ?? 0;
      total[4]! += c.essence ?? 0;
    }
    expect(total).toEqual(TOTALS[faction]);
  });

  it("marks its creatures native and hands the engine its birthright", () => {
    const s = startAs(faction);
    const hero = s.heroes.find((h) => h.owner === 0)!;
    const pending = {
      ...s,
      pendingBattle: {
        kind: "monster" as const,
        objectId: "m",
        heroId: hero.id,
      },
    };
    const setup = engineSetupFromGame(battleSetup(pending)!);
    expect(setup.attacker.stacks.every((x) => x.native === true)).toBe(true);
    expect(setup.defender.stacks.every((x) => x.native !== true)).toBe(true);
    const bright =
      faction === "humans"
        ? { startRules: [{ id: "birthright:sworn" }] }
        : { birthright: faction === "undead" ? "not-done-yet" : "launched" };
    expect(setup.attacker).toMatchObject(bright);
    expect(setup.attacker.hero?.command).toBe(
      getHeroClass(hero.heroClass).command,
    );
  });
});

describe("Drills, specials and the Keystone", () => {
  it("a Drill is a permanent player flag the battle setup applies", () => {
    let s = rich(startAs("humans"));
    for (const b of ["archery-range", "butts"]) {
      s = ok(build(s, "t0", b)).state;
      s = {
        ...s,
        towns: { ...s.towns, t0: { ...s.towns["t0"]!, builtToday: false } },
      };
    }
    expect(s.players[0]!.drills).toEqual(["longbowman:pin-down"]);
    const hero = s.heroes.find((h) => h.owner === 0)!;
    const pending = {
      ...s,
      pendingBattle: {
        kind: "monster" as const,
        objectId: "m",
        heroId: hero.id,
      },
    };
    const setup = engineSetupFromGame(battleSetup(pending)!);
    const bows = setup.attacker.stacks.find(
      (x) => x.creature.id === "longbowman",
    )!;
    expect(bows.creature.abilities).toContain("pin-down");
    const squires = setup.attacker.stacks.find(
      (x) => x.creature.id === "squire",
    )!;
    expect(squires.creature.abilities).not.toContain("pin-down");
  });

  it("town specials: Tithe Barn and Essence Still pay; specials reach the battle", () => {
    let s = rich(startAs("undead"));
    const unbuilt = (st: GameState): GameState => ({
      ...st,
      towns: { ...st.towns, t0: { ...st.towns["t0"]!, builtToday: false } },
    });
    for (const b of ["marketplace", "essence-still"])
      s = unbuilt(ok(build(s, "t0", b)).state);
    expect(dailyIncome(s, 0, 2).essence - dailyIncome(s, 0, 3).essence).toBe(1);
    s = rich(startAs("humans"));
    const before = dailyIncome(s, 0, 2).gold;
    for (const b of ["marketplace", "tithe-barn"])
      s = unbuilt(ok(build(s, "t0", b)).state);
    expect(dailyIncome(s, 0, 2).gold - before).toBe(250);
  });

  it("the Keystone Hall needs the Keystone carried into the town", () => {
    let s = rich(startAs("goblins"));
    const unbuilt = (st: GameState): GameState => ({
      ...st,
      towns: { ...st.towns, t0: { ...st.towns["t0"]!, builtToday: false } },
    });
    for (const b of ["town-hall", "fort-1", "marketplace", "city-hall"])
      s = unbuilt(ok(build(s, "t0", b)).state);
    expect(buildStatus(s, "t0", "great-flinger")).toBe("keystone");
    s = {
      ...s,
      heroes: s.heroes.map((h) =>
        h.owner === 0 ? { ...h, backpack: [...h.backpack, "keystone"] } : h,
      ),
    };
    expect(buildStatus(s, "t0", "great-flinger")).toBe("ok");
    s = ok(build(s, "t0", "great-flinger")).state;
    expect(s.heroes.find((h) => h.owner === 0)!.backpack).not.toContain(
      "keystone",
    );
    const hero = s.heroes.find((h) => h.owner === 0)!;
    const pending = {
      ...s,
      pendingBattle: {
        kind: "monster" as const,
        objectId: "m",
        heroId: hero.id,
      },
    };
    const setup = engineSetupFromGame(battleSetup(pending)!);
    // The Great Flinger: every native has Cannonball (Goblins already do).
    const chuckers = setup.attacker.stacks.find(
      (x) => x.creature.id === "bomb-chucker",
    )!;
    expect(chuckers.creature.abilities).toContain("cannonball");
  });
});

describe("Setup and the map", () => {
  it("neutral towns on generated maps take a v0.2 faction, seeded", () => {
    const map = generateMap(11, { size: "M", players: 2 });
    const neutral = map.objects.filter(
      (o) =>
        o.kind === "town" &&
        o.data["owner"] === null &&
        o.data["hold"] === false,
    );
    expect(neutral.length).toBeGreaterThan(0);
    for (const t of neutral)
      expect(["humans", "undead", "goblins"]).toContain(t.data["faction"]);
    const again = generateMap(11, { size: "M", players: 2 });
    expect(
      again.objects
        .filter((o) => o.kind === "town")
        .map((o) => o.data["faction"]),
    ).toEqual(
      map.objects
        .filter((o) => o.kind === "town")
        .map((o) => o.data["faction"]),
    );
  });

  it("AI players take the other factions in turn", () => {
    expect(
      playerSetups({ seed: 1, size: "S", players: 3, faction: "undead" }).map(
        (p) => [p.kind, p.faction],
      ),
    ).toEqual([
      ["human", "undead"],
      ["ai", "goblins"],
      ["ai", "humans"],
    ]);
  });

  it("the pool holds the 24 named heroes, and Chieftains only for the Lost World", () => {
    expect(rosterFor(["humans", "goblins"])).toHaveLength(24);
    expect(rosterFor(["lost-world"])).toHaveLength(40);
  });

  it("building a guild level teaches the hero in town at once", () => {
    // A hero with Hush (Quietus) 1: level 1 always has a Hush spell (2.9).
    const base = rich(startAs("undead"));
    const s = {
      ...base,
      heroes: base.heroes.map((h) =>
        h.owner === 0
          ? { ...h, skills: [{ id: "quietus" as const, rank: 1 }] }
          : h,
      ),
    };
    const { events } = ok(build(s, "t0", "magic-guild-1"));
    expect(events.some((e) => e.type === "spells-learnt")).toBe(true);
  });
});
