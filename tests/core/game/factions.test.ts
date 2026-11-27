/**
 * The v0.2 factions in the game (the Candy Kingdom too, which is in the
 * data though not yet in setup): each can be started, built and
 * recruited from; Drills are per-player flags read by the battle setup;
 * natives and birthrights reach the engine; town specials pay and power;
 * the town trees match the faction documents' totals.
 */

import { describe, expect, it } from "vitest";
import { build, buildStatus, recruit } from "../../../src/core/game/town.ts";
import { battleSetup } from "../../../src/core/game/battle.ts";
import { dailyIncome } from "../../../src/core/game/turn.ts";
import { newGame, startingMilitia } from "../../../src/core/game/newGame.ts";
import { engineSetupFromGame } from "../../../src/core/battle/index.ts";
import { generateMap } from "../../../src/core/map/generate.ts";
import { NAMED_MAPS, namedConfig } from "../../../src/core/map/named.ts";
import {
  rollContents,
  withLootWithout,
} from "../../../src/core/map/gen/contents.ts";
import { mysteryPool } from "../../../src/core/map/mystery.ts";
import {
  NEUTRAL_TOWN_FACTIONS,
  neutralTownFaction,
} from "../../../src/core/map/gen/objects.ts";
import { createRng } from "../../../src/core/rng.ts";
import { getCreature } from "../../../src/data/creatures.ts";
import { townTree } from "../../../src/data/factions.ts";
import { getHeroClass } from "../../../src/data/hero.ts";
import { rosterFor } from "../../../src/data/players.ts";
import { playerSetups } from "../../../src/ui/app.ts";
import type { GameState } from "../../../src/core/game/types.ts";
import type { CreatureId, FactionId } from "../../../src/data/types.ts";
import { buildMap, field, heroStart, monster, ok, town } from "./helpers.ts";

const FACTIONS: FactionId[] = [
  "humans",
  "undead",
  "goblins",
  "candy",
  "dwarves",
];

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
  candy: [25, 50050, 150, 70, 32],
  dwarves: [25, 50800, 125, 128, 19],
};

const FIRST_DWELLING: Record<string, [string, string, number]> = {
  humans: ["archery-range", "longbowman", 9],
  undead: ["charnel-pit", "ghoul", 9],
  goblins: ["powder-shed", "bomb-chucker", 10],
  candy: ["mint-range", "peppermint-archer", 9],
  dwarves: ["rivet-range", "rivet-gunner", 9],
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
    // The faction document's tree; the shared harbour (NAVAL 5.7) apart.
    const own = tree.order.filter((id) => !tree.buildings[id]!.harbour);
    expect(tree.order.length - own.length).toBe(3);
    const total = [own.length, 0, 0, 0, 0];
    for (const id of own) {
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
        : {
            birthright: {
              undead: "not-done-yet",
              goblins: "launched",
              candy: "sticky",
              dwarves: "stoke",
            }[faction as "undead" | "goblins" | "candy" | "dwarves"],
          };
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
    const map = generateMap(11, { size: "SM", players: 2 });
    const neutral = map.objects.filter(
      (o) =>
        o.kind === "town" &&
        o.data["owner"] === null &&
        o.data["hold"] === false,
    );
    expect(neutral.length).toBeGreaterThan(0);
    for (const t of neutral)
      expect(["humans", "undead", "goblins", "candy", "dwarves"]).toContain(
        t.data["faction"],
      );
    const again = generateMap(11, { size: "SM", players: 2 });
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

  it("the Candy Kingdom joins the outposts, neutral towns and wonders (bzc.117)", () => {
    const outposts = new Set<string>();
    const wonders = new Set<string>();
    const towns = new Set<string>();
    for (let seed = 1; seed <= 400; seed++) {
      const o = rollContents("faction-outpost", createRng(seed), 2);
      outposts.add(String(o["creature"]));
      const w = rollContents("fallen-adventurer", createRng(seed), 2);
      wonders.add(String(w["artifact"]));
      towns.add(neutralTownFaction(seed, 0));
    }
    const candy = [...outposts].filter(
      (c) => getCreature(c as CreatureId).faction === "candy",
    );
    expect(candy.sort()).toEqual([
      "gingerbread-man",
      "peppermint-archer",
      "sugarplum",
      "taffy-wrangler",
    ]);
    expect(wonders).toContain("flypaper-ribbon");
    expect([...towns].sort()).toEqual([
      "candy",
      "dwarves",
      "goblins",
      "humans",
      "undead",
    ]);
  });

  it("the Deepforge joins the outposts, neutral towns and wonders (bzc.135)", () => {
    const outposts = new Set<string>();
    const wonders = new Set<string>();
    for (let seed = 1; seed <= 400; seed++) {
      const o = rollContents("faction-outpost", createRng(seed), 2);
      outposts.add(String(o["creature"]));
      const w = rollContents("fallen-adventurer", createRng(seed), 2);
      wonders.add(String(w["artifact"]));
    }
    const dwarves = [...outposts].filter(
      (c) => getCreature(c as CreatureId).faction === "dwarves",
    );
    expect(dwarves.sort()).toEqual([
      "gyrocopter",
      "mortar",
      "rivet-gunner",
      "tinker",
    ]);
    expect(wonders).toContain("pocket-boiler");
    expect(NEUTRAL_TOWN_FACTIONS).toContain("dwarves");
  });

  it("the named maps keep the outposts and loot they were authored with (bzc.135)", () => {
    for (const def of NAMED_MAPS) {
      expect(namedConfig(def).objects?.outpostsWithout, def.id).toEqual([
        "dwarves",
      ]);
      expect(namedConfig(def).objects?.lootWithout, def.id).toEqual([
        "pocket-boiler",
      ]);
    }
    // Loot left out holds only for the generation it is given to.
    const wonders = (): Set<string> => {
      const out = new Set<string>();
      for (let seed = 1; seed <= 400; seed++)
        out.add(
          String(
            rollContents("fallen-adventurer", createRng(seed), 2)["artifact"],
          ),
        );
      return out;
    };
    expect(withLootWithout(["pocket-boiler"], wonders)).not.toContain(
      "pocket-boiler",
    );
    expect(
      withLootWithout(["pocket-boiler"], () => mysteryPool("wonder")),
    ).not.toContain("pocket-boiler");
    expect(wonders()).toContain("pocket-boiler");
    expect(mysteryPool("wonder")).toContain("pocket-boiler");
    for (let seed = 1; seed <= 200; seed++) {
      const o = rollContents("faction-outpost", createRng(seed), 2, [
        "dwarves",
      ]);
      expect(o["faction"]).not.toBe("dwarves");
    }
  });

  it("AI players take the other factions in turn", () => {
    expect(
      playerSetups({ seed: 1, size: "S", players: 3, faction: "undead" }).map(
        (p) => [p.kind, p.faction],
      ),
    ).toEqual([
      ["human", "undead"],
      ["ai", "goblins"],
      ["ai", "candy"],
    ]);
    expect(
      playerSetups({ seed: 1, size: "SM", players: 4, faction: "candy" }).map(
        (p) => p.faction,
      ),
    ).toEqual(["candy", "dwarves", "humans", "undead"]);
    expect(
      playerSetups({ seed: 1, size: "M", players: 4, faction: "dwarves" }).map(
        (p) => p.faction,
      ),
    ).toEqual(["dwarves", "humans", "undead", "goblins"]);
  });

  it("the pool holds the 40 named heroes, and Chieftains only for the Lost World", () => {
    expect(rosterFor(["humans", "goblins"])).toHaveLength(40);
    expect(rosterFor(["lost-world"])).toHaveLength(56);
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

describe("Starting militia (RULES_V2 5.5)", () => {
  // One week of the tier-1 dwelling; half a week of the tier-2 one (rounded
  // down) only once it is built, which no faction has at the start.
  const EXPECTED: Record<
    string,
    { t1: CreatureId; n1: number; t2: CreatureId; n2: number }
  > = {
    humans: { t1: "squire", n1: 14, t2: "longbowman", n2: 4 },
    undead: { t1: "skeleton", n1: 15, t2: "ghoul", n2: 4 },
    goblins: { t1: "goblin", n1: 20, t2: "bomb-chucker", n2: 5 },
    candy: { t1: "gingerbread-man", n1: 15, t2: "peppermint-archer", n2: 4 },
    dwarves: { t1: "tinker", n1: 14, t2: "rivet-gunner", n2: 4 },
  };

  for (const faction of FACTIONS) {
    const e = EXPECTED[faction]!;
    it(`${faction}: the starting town holds a week of ${e.t1} on top of the dwelling stock`, () => {
      const t0 = startAs(faction).towns["t0"]!;
      expect(t0.garrison.filter((x) => x !== null)).toEqual([
        { creature: e.t1, count: e.n1 },
      ]);
      // The dwelling stock is untouched.
      expect(t0.dwellings[e.t1]?.available).toBe(e.n1);
    });

    it(`${faction}: a built tier-2 dwelling adds half a week of ${e.t2}`, () => {
      const t0 = startAs(faction).towns["t0"]!;
      const tree = townTree(faction)!;
      const t2 = tree.order.find((b) => tree.buildings[b]?.dwelling === e.t2)!;
      expect(
        startingMilitia({ ...t0, buildings: [...t0.buildings, t2] }),
      ).toEqual([
        { creature: e.t1, count: e.n1 },
        { creature: e.t2, count: e.n2 },
      ]);
    });
  }

  it("the opponent's starting town gets its own faction's militia", () => {
    const s = startAs("humans");
    expect(s.towns["t1"]!.garrison.filter((x) => x !== null)).toEqual([
      { creature: "goblin", count: 20 },
    ]);
  });

  it("neutral faction towns keep only their neutral garrison", () => {
    const neutral = {
      ...town("n", 5, 5, null),
      data: { faction: "goblins", owner: null },
    };
    const n = startAs("humans", [neutral]).towns["n"]!;
    expect(n.isHold).toBe(false);
    expect(n.garrison.filter((x) => x !== null)).toEqual(
      (townTree("goblins")?.neutralGarrison ?? []).map((g) => ({
        creature: g.creature,
        count: g.count,
      })),
    );
  });
});
