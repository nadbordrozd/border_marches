/**
 * The sea and coastal objects (docs/design/NAVAL.md 5, bead bzc.151) on
 * small hand-built naval states: producers flagged like mines, the two sea
 * dwellings, the Shipwright, the visitable sites, the three sea banks and
 * their seeded guards and prizes, the four pickups (taken across the
 * shore too), Ferry Landings and Whirlpools, the Moored Boat, saves, and
 * dry maps left as they were.
 */
import { describe, expect, it } from "vitest";
import {
  battleSetup,
  dailyIncome,
  describeObject,
  fightPendingBattle,
  isAfloat,
  isPickup,
  lighthouseBonus,
  moveHeroAlong,
  newGame,
  objectValueFor,
  seaMovementPoints,
  shipAt,
  shipOfHero,
  shipsOf,
  siteOptions,
  takeChest,
  useSite,
  type BattleResolver,
  type GameEvent,
  type GameState,
  type HeroState,
} from "../../../src/core/game/index.ts";
import { armyLuck, armyMorale } from "../../../src/core/game/effects.ts";
import {
  bottleTarget,
  prizeValue,
  sirensRockLosses,
  whirlpoolLoss,
} from "../../../src/core/game/sites.ts";
import {
  seaContents,
  tidesSpell,
} from "../../../src/core/map/gen/sea-contents.ts";
import { createRng } from "../../../src/core/rng.ts";
import { validateMap, type MapObject } from "../../../src/core/map/types.ts";
import { artFor } from "../../../src/assets/object-art.ts";
import { getCreature } from "../../../src/data/creatures.ts";
import { findMapSpell } from "../../../src/data/map-spells.ts";
import {
  MAP_OBJECT_ROWS,
  RULE_ROWS,
  SEA_ROWS,
} from "../../../src/data/mapObjects.ts";
import {
  BANK_GUARD_SHARE,
  BANK_VALUE,
  OBJECT_TYPES,
  OBJECT_TYPE_IDS,
} from "../../../src/data/objectTypes.ts";
import { SEA_HOMES } from "../../../src/data/sea.ts";
import {
  FERRY_MP,
  KRAKENS_DEEP_VALUE,
  SEA_OBJECT_TYPE_IDS,
  SIRENS_ROCK_XP,
} from "../../../src/data/sea-objects.ts";
import { SHIP_PRICE } from "../../../src/data/naval.ts";
import { readSave, saveGame, type SaveStorage } from "../../../src/ui/save.ts";
import { siteCue } from "../../../src/audio/cues.ts";
import { buildMap, errorOf, field, heroStart, ok } from "./helpers.ts";
import { STRAIT, boat, navalGame } from "./naval-helpers.ts";

/** A catalogue object at (x, y), its footprint up and right. */
function site(
  id: string,
  type: keyof typeof OBJECT_TYPES,
  x: number,
  y: number,
  data: Record<string, unknown> = {},
): MapObject {
  const def = OBJECT_TYPES[type];
  const blocked: Array<[number, number]> = [];
  for (let dy = 0; dy < def.h; dy++)
    for (let dx = 0; dx < def.w; dx++)
      if (dx !== 0 || dy !== 0) blocked.push([x + dx, y - dy]);
  return {
    id,
    kind: def.kind,
    x,
    y,
    footprint: { w: def.w, h: def.h },
    blocked,
    data: { type, ...data },
  };
}

/**
 * A naval game on the STRAIT map (land in columns 0-4 and 15-19, sea in
 * 5-14): `land` objects are validated as on any map, `sea` ones (and
 * boats) stand in the water; the whole map must still be valid.
 */
function game(
  land: MapObject[],
  sea: MapObject[],
  hx = 4,
  hy = 5,
  extra: MapObject[] = [],
): GameState {
  const s = navalGame(STRAIT, land, sea, hx, hy, extra);
  expect(validateMap(s.map)).toEqual([]);
  return s;
}

const hero = (s: GameState, id = "hero-0"): HeroState =>
  s.heroes.find((h) => h.id === id)!;

function withHero(
  s: GameState,
  patch: Partial<HeroState>,
  id = "hero-0",
): GameState {
  return {
    ...s,
    heroes: s.heroes.map((h) => (h.id === id ? { ...h, ...patch } : h)),
  };
}

/** The hero aboard the ship moored at (x, y), with 1500 points of each kind. */
function afloat(s: GameState, x: number, y: number): GameState {
  expect(shipAt(s, x, y)).toBeDefined();
  const t = withHero(s, { x, y, mp: 1500, maxMp: 1500, seaMaxMp: 1500 });
  const ships = shipsOf(t).map((sh) =>
    sh.x === x && sh.y === y ? { ...sh, owner: 0 } : sh,
  );
  return { ...t, ships };
}

const step = (s: GameState, ...cells: Array<[number, number]>) =>
  ok(
    moveHeroAlong(
      s,
      "hero-0",
      cells.map(([x, y]) => ({ x, y })),
    ),
  );
const texts = (events: GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === "site" ? [e.text] : []));
const objOf = (s: GameState, id: string): MapObject =>
  s.map.objects.find((o) => o.id === id)!;
const win: BattleResolver = (setup) => ({
  winner: "attacker",
  attacker: setup.attacker.stacks.map((st) => st.count),
  defender: setup.defender.stacks.map(() => 0),
});

describe("the sea objects' catalogue rows (NAVAL 5)", () => {
  it("lists all twenty with their kinds and values, never in the land fill", () => {
    expect(SEA_OBJECT_TYPE_IDS).toHaveLength(20);
    const values: Record<string, [string, number]> = {
      "pearl-bed": ["mine", 5000],
      "fishing-village": ["mine", 4000],
      "pirate-cove": ["dwelling", 3000],
      "siren-grotto": ["dwelling", 3000],
      shipwright: ["site", 1500],
      buoy: ["site", 300],
      "mermaid-rock": ["site", 300],
      lighthouse: ["site", 1500],
      "sirens-rock": ["site", 1500],
      "shrine-of-the-tides": ["site", 1500],
      "ferry-landing": ["teleport", 0],
      shipwreck: ["bank", 2500],
      "coral-grotto": ["bank", 2500],
      "krakens-deep": ["bank", KRAKENS_DEEP_VALUE],
      flotsam: ["site", 500],
      "sea-chest": ["site", 1500],
      castaway: ["site", 1500],
      "message-in-a-bottle": ["site", 500],
      "moored-boat": ["boat", 1000],
      whirlpool: ["teleport", 0],
    };
    for (const t of SEA_OBJECT_TYPE_IDS) {
      const def = OBJECT_TYPES[t];
      expect(OBJECT_TYPE_IDS).toContain(t);
      expect([t, def.kind, def.value]).toEqual([t, ...values[t]!]);
      expect(def.weight, t).toBe(0);
      expect(artFor(t), t).not.toBeNull();
    }
    expect(SEA_ROWS.map((r) => r.type)).toEqual([...SEA_OBJECT_TYPE_IDS]);
    const landTypes = new Set(
      [...MAP_OBJECT_ROWS, ...RULE_ROWS].map((r) => r.type as string),
    );
    for (const t of SEA_OBJECT_TYPE_IDS)
      expect(landTypes.has(t), t).toBe(false);
    const banks = SEA_ROWS.filter((r) => r.kind === "bank");
    expect(banks.every((r) => r.guard === "never")).toBe(true);
    expect([
      OBJECT_TYPES["krakens-deep"].w,
      OBJECT_TYPES["shipwright"].w,
    ]).toEqual([3, 3]);
  });

  it("makes the four floating finds pickups, taken from a next cell", () => {
    for (const t of SEA_OBJECT_TYPE_IDS) {
      const o = site(t, t, 6, 6);
      expect(isPickup(o), t).toBe(
        ["flotsam", "sea-chest", "castaway", "message-in-a-bottle"].includes(t),
      );
    }
  });
});

describe("Pearl Beds and Fishing Villages (NAVAL 5.2)", () => {
  it("are flagged like mines, from a ship and from land, and pay their own yields", () => {
    let s = game(
      [site("village", "fishing-village", 2, 8)],
      [site("pearls", "pearl-bed", 8, 6), boat("boat-1", 7, 6)],
      2,
      10,
    );
    expect(s.mines["pearls"]).toEqual({
      id: "pearls",
      resource: "essence",
      owner: null,
    });
    expect(s.mines["village"]?.resource).toBe("gold");
    const before = dailyIncome(s, 0);
    // Ashore: walk onto the village's door.
    const a = step(s, [2, 9], [2, 8]);
    expect(a.events).toContainEqual({
      type: "mine-flagged",
      mineId: "village",
      owner: 0,
    });
    s = a.state;
    expect(dailyIncome(s, 0).gold).toBe(before.gold + 500);
    // Afloat: sail onto the bed.
    s = afloat(s, 7, 6);
    const b = step(s, [8, 6]);
    expect(b.state.mines["pearls"]?.owner).toBe(0);
    expect(dailyIncome(b.state, 0).essence).toBe(before.essence + 1);
    expect(objectValueFor(b.state, 0, objOf(b.state, "pearls"))).toBe(0);
    expect(objectValueFor(s, 0, objOf(s, "pearls"))).toBe(5000);
    expect(describeObject(s, 0, objOf(s, "pearls"))[0]).toBe("Pearl Bed");
  });

  it("change hands when another player's hero visits", () => {
    let s = game([], [site("pearls", "pearl-bed", 8, 6), boat("b", 7, 6)]);
    s = {
      ...s,
      mines: { ...s.mines, pearls: { ...s.mines["pearls"]!, owner: 1 } },
    };
    const r = step(afloat(s, 7, 6), [8, 6]);
    expect(r.state.mines["pearls"]?.owner).toBe(0);
    expect(r.events.some((e) => e.type === "mine-flagged")).toBe(true);
  });
});

describe("Pirate Coves and Siren Grottoes (NAVAL 5.3)", () => {
  it("a Pirate Cove is flagged from land and hires Corsairs at 290", () => {
    const s0 = game([site("cove", "pirate-cove", 2, 8)], [], 2, 10);
    const s = {
      ...s0,
      players: s0.players.map((p) => ({
        ...p,
        resources: { ...p.resources, gold: 5000 },
      })),
    };
    const a = step(s, [2, 9], [2, 8]);
    expect(texts(a.events)[0]).toMatch(/Pirate Cove flagged: 3 available/);
    const opts = siteOptions(a.state, hero(a.state), objOf(a.state, "cove"));
    expect(opts.map((o) => o.id)).toEqual(["hire:3"]);
    const b = ok(useSite(a.state, "hero-0", "cove", "hire:3")).state;
    const corsairs = hero(b).army.find((x) => x?.creature === "corsair");
    expect(corsairs?.count).toBe(3);
    expect(b.players[0]!.resources.gold).toBe(5000 - 3 * 290);
    expect(describeObject(b, 0, objOf(b, "cove")).join(" ")).toMatch(
      /0 Corsairs for 290 gold each/,
    );
  });

  it("a Siren Grotto is visited from a ship and hires Sirens at 250", () => {
    let s = game([], [site("grotto", "siren-grotto", 8, 6), boat("b", 7, 6)]);
    s = afloat(s, 7, 6);
    const a = step(s, [8, 6]);
    expect(isAfloat(a.state, hero(a.state))).toBe(true);
    const opts = siteOptions(a.state, hero(a.state), objOf(a.state, "grotto"));
    expect(opts[0]?.id).toMatch(/^hire:/);
    const n = Number(opts[0]!.id.split(":")[1]);
    expect(n).toBeGreaterThan(0);
    const gold = a.state.players[0]!.resources.gold;
    const b = ok(useSite(a.state, "hero-0", "grotto", `hire:${n}`)).state;
    expect(b.players[0]!.resources.gold).toBe(gold - n * 250);
    expect(hero(b).army.some((x) => x?.creature === "siren")).toBe(true);
  });
});

describe("the Shipwright (NAVAL 2.2, 5.3)", () => {
  // Entrance (2, 6); the building covers (2..4, 5..6) with the sea at x 5.
  const yard = () =>
    game([site("yard", "shipwright", 2, 6, { dock: [5, 6] })], [], 2, 8);

  it("is flagged by a visit and then sells a ship onto its dock", () => {
    const s = yard();
    const a = step(s, [2, 7], [2, 6]);
    expect(texts(a.events)[0]).toMatch(
      /Shipwright flagged: a ship for 1000 gold, 10 wood/,
    );
    const opts = siteOptions(a.state, hero(a.state), objOf(a.state, "yard"));
    expect(opts).toEqual([
      { id: "ship", label: "Buy a ship for 1000 gold, 10 wood" },
    ]);
    const before = a.state.players[0]!.resources;
    const b = ok(useSite(a.state, "hero-0", "yard", "ship"));
    expect(shipAt(b.state, 5, 6)).toMatchObject({ owner: 0 });
    expect(b.state.players[0]!.resources.gold).toBe(
      before.gold - SHIP_PRICE.gold,
    );
    expect(b.state.players[0]!.resources.wood).toBe(
      before.wood - SHIP_PRICE.wood,
    );
    // The dock is taken now.
    const again = siteOptions(b.state, hero(b.state), objOf(b.state, "yard"));
    expect(again[0]?.disabled).toBe("the dock is taken");
    expect(errorOf(useSite(b.state, "hero-0", "yard", "ship"))).toBe(
      "bad-choice",
    );
  });

  it("sells nothing to a player whose flag it does not fly, or without the price", () => {
    const s = yard();
    const a = step(s, [2, 7], [2, 6]).state;
    const theirs = {
      ...a,
      sites: { ...a.sites, yard: { ...a.sites["yard"], owner: 1 } },
    };
    expect(siteOptions(theirs, hero(theirs), objOf(theirs, "yard"))).toEqual(
      [],
    );
    const poor = {
      ...a,
      players: a.players.map((p) => ({
        ...p,
        resources: { ...p.resources, wood: 3 },
      })),
    };
    expect(
      siteOptions(poor, hero(poor), objOf(poor, "yard"))[0]?.disabled,
    ).toBe("not enough resources");
  });

  it("finds its dock beside the building when the generator named none", () => {
    const s = game([site("yard", "shipwright", 2, 6)], [], 2, 8);
    const a = step(s, [2, 7], [2, 6]).state;
    const b = ok(useSite(a, "hero-0", "yard", "ship")).state;
    // The lowest-index sea cell next to the building: (5, 4).
    expect(shipAt(b, 5, 4)).toMatchObject({ owner: 0 });
  });
});

describe("Buoys, Mermaid Rocks and Lighthouses (NAVAL 5.4)", () => {
  it("a Buoy gives +1 Morale and a Mermaid Rock +1 Luck until the next battle", () => {
    let s = game(
      [],
      [
        site("buoy", "buoy", 8, 6),
        site("rock", "mermaid-rock", 9, 7),
        boat("b", 7, 6),
      ],
    );
    s = afloat(s, 7, 6);
    const m0 = armyMorale(hero(s));
    const l0 = armyLuck(hero(s));
    const a = step(s, [8, 6]).state;
    expect(armyMorale(hero(a))).toBe(m0 + 1);
    expect(objectValueFor(a, 0, objOf(a, "buoy"))).toBe(0);
    const b = step(a, [9, 7]).state;
    expect(armyLuck(hero(b))).toBe(l0 + 1);
    // Visiting again adds no more.
    const c = step(b, [8, 6]).state;
    expect(armyMorale(hero(c))).toBe(m0 + 1);
  });

  it("a Lighthouse is flagged, shows the sea around it and adds 200 sea moves, three at most", () => {
    const lights = [6, 8, 10, 12].map((x, i) =>
      site(`l${i}`, "lighthouse", x, 2),
    );
    let s = game([], [...lights, boat("b", 6, 3)]);
    s = afloat(s, 6, 3);
    const base = seaMovementPoints(s, hero(s));
    const p0 = s.players[0]!;
    const w = s.map.width;
    expect(p0.explored[2 * w + 15]).toBe(false);
    const a = step(s, [6, 2]);
    expect(texts(a.events)[0]).toMatch(/Lighthouse flagged/);
    expect(a.state.players[0]!.explored[2 * w + 15]).toBe(true);
    expect(lighthouseBonus(a.state, 0)).toBe(200);
    expect(seaMovementPoints(a.state, hero(a.state))).toBe(base + 200);
    const all = {
      ...a.state,
      sites: Object.fromEntries(lights.map((l) => [l.id, { owner: 0 }])),
    };
    expect(lighthouseBonus(all, 0)).toBe(600);
    expect(siteCue("lighthouse", texts(a.events)[0]!)).toBe("map.flag");
  });
});

describe("Sirens' Rock (NAVAL 5.4)", () => {
  const army = [
    { creature: "goblin" as const, count: 25 },
    { creature: "wolf-rider" as const, count: 9 },
    null,
    null,
    null,
    null,
    null,
  ];

  it("shows the exact losses first, then trades a tenth of each stack for 2000 experience", () => {
    let s = game([], [site("rock", "sirens-rock", 8, 6), boat("b", 7, 6)]);
    s = withHero(afloat(s, 7, 6), { army: army.slice(0, hero(s).army.length) });
    expect(sirensRockLosses(hero(s))).toEqual([
      { slot: 0, creature: "goblin", lost: 2 },
    ]);
    expect(describeObject(s, 0, objOf(s, "rock")).join(" ")).toMatch(
      /would lose 2 Goblins/,
    );
    const a = step(s, [8, 6]);
    expect(texts(a.events)[0]).toMatch(/2 Goblins would follow it/);
    const xp = hero(a.state).xp;
    const b = ok(useSite(a.state, "hero-0", "rock", "listen")).state;
    expect(hero(b).xp).toBe(xp + SIRENS_ROCK_XP);
    expect(hero(b).army[0]).toEqual({ creature: "goblin", count: 23 });
    expect(hero(b).army[1]).toEqual({ creature: "wolf-rider", count: 9 });
    // Each hero once.
    expect(siteOptions(b, hero(b), objOf(b, "rock"))).toEqual([]);
    expect(objectValueFor(b, 0, objOf(b, "rock"))).toBe(0);
  });

  it("is worth the experience less the creatures to the AI", () => {
    let s = game([], [site("rock", "sirens-rock", 8, 6), boat("b", 7, 6)]);
    s = withHero(afloat(s, 7, 6), { army: army.slice(0, hero(s).army.length) });
    expect(objectValueFor(s, 0, objOf(s, "rock"))).toBe(
      prizeValue({ xp: SIRENS_ROCK_XP }) - 2 * getCreature("goblin").fightValue,
    );
  });
});

describe("the Shrine of the Tides (NAVAL 5.4)", () => {
  it("teaches its spell as a page or a scroll, once per hero", () => {
    const spell = tidesSpell(createRng(3))!;
    expect(findMapSpell(spell)).toBeDefined();
    let s = game(
      [],
      [site("shrine", "shrine-of-the-tides", 8, 6, { spell }), boat("b", 7, 6)],
    );
    s = afloat(s, 7, 6);
    const a = step(s, [8, 6]);
    expect(texts(a.events)[0]).toMatch(
      /Shrine of the Tides: the hero (learns|takes a scroll of)/,
    );
    const h = hero(a.state);
    expect(h.pages.includes(spell) || h.scrolls.includes(spell)).toBe(true);
    const b = step(step(a.state, [7, 6]).state, [8, 6]);
    expect(texts(b.events)[0]).toMatch(/Already visited/);
  });
});

describe("Ferry Landings (NAVAL 5.4)", () => {
  const ferries = () => [
    site("f1", "ferry-landing", 4, 3, { pair: "a" }),
    site("f2", "ferry-landing", 15, 8, { pair: "a" }),
  ];

  it("carry a hero ashore across the water for 300 movement points", () => {
    const s = withHero(game(ferries(), [], 4, 5), { mp: 1000 });
    const r = step(s, [4, 4], [4, 3]);
    const h = hero(r.state);
    expect([h.x, h.y]).toEqual([15, 8]);
    expect(h.mp).toBe(1000 - 100 - 100 - FERRY_MP);
    expect(r.events).toContainEqual({
      type: "teleported",
      heroId: "hero-0",
      x: 15,
      y: 8,
    });
    expect(isAfloat(r.state, h)).toBe(false);
  });

  it("need 300 points left", () => {
    const s = withHero(game(ferries(), [], 4, 5), { mp: 399 });
    const r = step(s, [4, 4], [4, 3]);
    expect([hero(r.state).x, hero(r.state).y]).toEqual([4, 3]);
    expect(texts(r.events)[0]).toMatch(/needs 300 movement points/);
  });
});

describe("Whirlpools (NAVAL 5.6)", () => {
  const pools = () => [
    site("w1", "whirlpool", 8, 3, { pair: "p" }),
    site("w2", "whirlpool", 12, 9, { pair: "p" }),
  ];
  const army = [
    { creature: "goblin" as const, count: 30 },
    { creature: "wolf-rider" as const, count: 7 },
  ];

  it("sweep the ship to the twin; the weakest stack loses half", () => {
    let s = game([], [...pools(), boat("b", 8, 4)]);
    s = afloat(s, 8, 4);
    s = withHero(s, {
      army: [
        ...army,
        ...hero(s)
          .army.slice(2)
          .map(() => null),
      ],
    });
    const weakest = whirlpoolLoss(hero(s));
    const gob = 30 * getCreature("goblin").fightValue;
    const wolf = 7 * getCreature("wolf-rider").fightValue;
    const slot = gob <= wolf ? 0 : 1;
    expect(weakest).toEqual({
      slot,
      creature: army[slot]!.creature,
      lost: Math.floor(army[slot]!.count / 2),
    });
    const r = step(s, [8, 3]);
    const h = hero(r.state);
    expect([h.x, h.y]).toEqual([12, 9]);
    expect(shipOfHero(r.state, h)).toMatchObject({ x: 12, y: 9, owner: 0 });
    expect(shipAt(r.state, 8, 3)).toBeUndefined();
    expect(h.army[slot]?.count).toBe(army[slot]!.count - weakest!.lost);
    expect(texts(r.events)[0]).toMatch(/lost overboard/);
    expect(siteCue("whirlpool", texts(r.events)[0]!)).toBe("site.waystone");
  });

  it("take nothing from a hero with Seafaring rank 2", () => {
    let s = game([], [...pools(), boat("b", 8, 4)]);
    s = afloat(s, 8, 4);
    s = withHero(s, {
      army: [
        ...army,
        ...hero(s)
          .army.slice(2)
          .map(() => null),
      ],
      skills: [...hero(s).skills, { id: "seafaring", rank: 2 }],
    });
    expect(whirlpoolLoss(hero(s))).toBeNull();
    const r = step(s, [8, 3]);
    expect([hero(r.state).x, hero(r.state).y]).toEqual([12, 9]);
    expect(hero(r.state).army.slice(0, 2)).toEqual(army);
  });

  it("leave the ship where it went in when the twin is blocked", () => {
    let s = game([], [...pools(), boat("b", 8, 4)]);
    // A moored ship rests on the twin.
    s = afloat(
      {
        ...s,
        ships: [...shipsOf(s), { id: "ship-9", x: 12, y: 9, owner: null }],
      },
      8,
      4,
    );
    const before = hero(s).army;
    const r = step(s, [8, 3]);
    expect([hero(r.state).x, hero(r.state).y]).toEqual([8, 3]);
    expect(hero(r.state).army).toEqual(before);
    expect(texts(r.events)[0]).toMatch(/twin is blocked/);
  });
});

describe("the sea banks (NAVAL 5.5)", () => {
  it("seed guards from the sea's own creatures and prizes worth their size", () => {
    const allowed: Record<string, string[]> = {
      shipwreck: ["drowned-sailor", "jellyfish", "hammerhead"],
      "coral-grotto": ["giant-crab", "siren", "sea-serpent"],
      "krakens-deep": ["kraken", "hammerhead"],
    };
    for (const type of ["shipwreck", "coral-grotto", "krakens-deep"] as const)
      for (let seed = 1; seed <= 30; seed++) {
        const d = seaContents(type, createRng(seed), seed % 4);
        const guard = d["guard"] as Array<{ creature: string; count: number }>;
        expect(guard.length).toBeGreaterThan(0);
        expect(guard.length).toBeLessThanOrEqual(3);
        for (const g of guard) {
          expect(allowed[type]).toContain(g.creature);
          expect(SEA_HOMES[g.creature as keyof typeof SEA_HOMES]).toBeDefined();
        }
        const value = d["value"] as number;
        const fv = guard.reduce(
          (n, g) => n + g.count * getCreature(g.creature).fightValue,
          0,
        );
        expect(fv).toBeGreaterThan(value * BANK_GUARD_SHARE * 0.8);
        expect(fv).toBeLessThan(value * BANK_GUARD_SHARE * 1.2);
        if (type === "krakens-deep") {
          expect(value).toBe(KRAKENS_DEEP_VALUE);
          expect(guard.some((g) => g.creature === "kraken")).toBe(true);
          expect(d["prize"]).toMatchObject({ gold: 5000 });
          expect(
            (d["prize"] as { artifacts: string[] }).artifacts,
          ).toHaveLength(2);
        } else {
          const size = d["size"] as "small" | "medium" | "large";
          expect(value).toBe(BANK_VALUE[size]);
        }
      }
    // Prizes without artifacts equal their value on the shared scale.
    const small = {
      shipwreck: { gold: 2000, wood: 5 },
      coral: { essence: 3, ore: 5, gold: 250 },
    };
    expect(prizeValue(small.shipwreck)).toBe(BANK_VALUE.small);
    expect(prizeValue(small.coral)).toBe(BANK_VALUE.small);
    expect(prizeValue({ essence: 6, ore: 10, gold: 2000 })).toBe(
      BANK_VALUE.medium,
    );
  });

  it("a Shipwreck is fought from a ship and plundered once", () => {
    const d = seaContents("shipwreck", createRng(5), 0);
    let s = game([], [site("wreck", "shipwreck", 8, 6, d), boat("b", 7, 6)]);
    s = afloat(s, 7, 6);
    const a = step(s, [8, 6]).state;
    expect(a.pendingBattle).toEqual({
      kind: "site",
      objectId: "wreck",
      heroId: "hero-0",
    });
    // The drowned crew all swim: open water, the hero's deck gun (bead 5).
    expect(battleSetup(a)?.layout).toBe("open-water");
    const gold = a.players[0]!.resources.gold;
    const wood = a.players[0]!.resources.wood;
    const b = ok(fightPendingBattle(a, win)).state;
    expect(b.players[0]!.resources.gold).toBe(gold + 2000);
    expect(b.players[0]!.resources.wood).toBe(wood + 5);
    expect(isAfloat(b, hero(b))).toBe(true);
    expect(describeObject(b, 0, objOf(b, "wreck")).join(" ")).toMatch(
      /Plundered/,
    );
    expect(objectValueFor(b, 0, objOf(b, "wreck"))).toBe(0);
  });

  it("the Kraken's Deep gives its piece, Wonder and gold", () => {
    const d = seaContents("krakens-deep", createRng(9), 3);
    let s = game([], [site("deep", "krakens-deep", 8, 6, d), boat("b", 7, 6)]);
    s = afloat(s, 7, 6);
    expect(describeObject(s, 0, objOf(s, "deep")).join(" ")).toMatch(/Kraken/);
    const a = step(s, [8, 6]).state;
    const gold = a.players[0]!.resources.gold;
    const b = ok(fightPendingBattle(a, win)).state;
    expect(b.players[0]!.resources.gold).toBe(gold + 5000);
    const prize = d["prize"] as { artifacts: string[] };
    for (const art of prize.artifacts) expect(hero(b).backpack).toContain(art);
  });
});

describe("the sea pickups (NAVAL 5.6)", () => {
  it("Flotsam is taken from a ship and from the shore beside it", () => {
    // From the shore: (5, 8) floats next to the shore cell (4, 8).
    let s = game(
      [],
      [site("drift", "flotsam", 5, 8, { prize: { wood: 7 } })],
      4,
      7,
    );
    const wood = s.players[0]!.resources.wood;
    const a = step(s, [5, 8]);
    expect(a.state.collected).toContain("drift");
    expect(a.state.players[0]!.resources.wood).toBe(wood + 7);
    expect([hero(a.state).x, hero(a.state).y]).toEqual([4, 7]);
    // From a ship.
    s = game(
      [],
      [
        site("drift", "flotsam", 9, 6, { prize: { wood: 4, gold: 300 } }),
        boat("b", 8, 6),
      ],
    );
    s = afloat(s, 8, 6);
    const gold = s.players[0]!.resources.gold;
    const b = step(s, [9, 6]);
    expect(b.state.collected).toContain("drift");
    expect(b.state.players[0]!.resources.gold).toBe(gold + 300);
    expect(isAfloat(b.state, hero(b.state))).toBe(true);
  });

  it("a ship takes a pickup lying on the shore beside it", () => {
    let s = game(
      [site("chest", "sea-chest", 15, 5)],
      [boat("b", 14, 5)],
      16,
      9,
    );
    s = afloat(s, 14, 5);
    const r = step(s, [15, 5]);
    expect(r.events).toContainEqual({
      type: "chest-offer",
      heroId: "hero-0",
      pickupId: "chest",
    });
    expect(isAfloat(r.state, hero(r.state))).toBe(true);
  });

  it("a Sea Chest offers 1500 gold or 1000 experience", () => {
    let s = game([], [site("chest", "sea-chest", 9, 6), boat("b", 8, 6)]);
    s = afloat(s, 8, 6);
    const a = step(s, [9, 6]);
    expect(a.events).toContainEqual({
      type: "chest-offer",
      heroId: "hero-0",
      pickupId: "chest",
    });
    const gold = a.state.players[0]!.resources.gold;
    const g = ok(takeChest(a.state, "hero-0", "chest", "gold")).state;
    expect(g.players[0]!.resources.gold).toBe(gold + 1500);
    expect(g.collected).toContain("chest");
    const xp = hero(a.state).xp;
    const x = ok(takeChest(a.state, "hero-0", "chest", "xp")).state;
    expect(hero(x).xp).toBe(xp + 1000);
  });

  it("a rich Sea Chest gives its Trinket and 500 gold", () => {
    const d = seaContents("sea-chest", createRng(1), 3);
    const rich =
      typeof d["artifact"] === "string"
        ? d
        : { artifact: "galoshes", gold: 500, value: 2500 };
    let s = game([], [site("chest", "sea-chest", 9, 6, rich), boat("b", 8, 6)]);
    s = afloat(s, 8, 6);
    const gold = s.players[0]!.resources.gold;
    const a = step(s, [9, 6]);
    expect(hero(a.state).backpack).toContain(rich["artifact"]);
    expect(a.state.players[0]!.resources.gold).toBe(gold + 500);
    expect(errorOf(takeChest(a.state, "hero-0", "chest", "gold"))).toBe(
      "unknown-object",
    );
  });

  it("a Castaway's strays join, or give 1000 experience when the army is full", () => {
    const d = seaContents("castaway", createRng(4), 1);
    const c = d["creature"] as string;
    const n = d["count"] as number;
    const fv = n * getCreature(c).fightValue;
    expect(fv).toBeGreaterThanOrEqual(300);
    expect(fv).toBeLessThanOrEqual(1000);
    let s = game(
      [],
      [
        site("raft", "castaway", 9, 6, { creature: c, count: n }),
        boat("b", 8, 6),
      ],
    );
    s = afloat(s, 8, 6);
    const a = step(s, [9, 6]);
    expect(
      hero(a.state).army.some((x) => x?.creature === c && x.count >= n),
    ).toBe(true);
    // A full army of other creatures: experience instead.
    const full = withHero(s, {
      army: hero(s).army.map(() => ({
        creature: "skeleton" as const,
        count: 1,
      })),
    });
    const xp = hero(full).xp;
    const b = step(full, [9, 6]);
    expect(hero(b.state).xp).toBe(xp + 1000);
    expect(b.state.collected).toContain("raft");
  });

  it("a Message in a Bottle marks a buried cache's area, else a Marvel piece", () => {
    const cache: MapObject = {
      id: "cache",
      kind: "buried",
      x: 17,
      y: 9,
      footprint: { w: 1, h: 1 },
      blocked: [],
      data: { type: "buried-cache", prize: { gold: 2000 } },
    };
    let s = game(
      [cache],
      [site("bottle", "message-in-a-bottle", 9, 6), boat("b", 8, 6)],
    );
    s = afloat(s, 8, 6);
    const target = bottleTarget(s, objOf(s, "bottle"));
    expect(target?.kind).toBe("cache");
    const a = step(s, [9, 6]);
    const ev = a.events.find((e) => e.type === "site");
    expect(ev && "area" in ev ? ev.area : null).toMatchObject({ w: 5, h: 5 });
    const area = target!.kind === "cache" ? target!.area : null;
    expect(17 - area!.x).toBeGreaterThanOrEqual(0);
    expect(17 - area!.x).toBeLessThan(5);
    expect(a.state.players[0]!.explored[9 * s.map.width + 17]).toBe(true);
    // The cache dug up: no target left (no Marvel piece on this map).
    const dug = { ...s, collected: [...s.collected, "cache"] };
    expect(bottleTarget(dug, objOf(dug, "bottle"))).toBeNull();
  });
});

describe("the Moored Boat (NAVAL 5.6)", () => {
  it("is a ship in the state, never a visited object, with the catalogue's card text", () => {
    const s = game(
      [],
      [{ ...boat("boat-1", 5, 5), data: { type: "moored-boat" } }],
    );
    expect(shipsOf(s)).toEqual([{ id: "ship-1", x: 5, y: 5, owner: null }]);
    expect(objectValueFor(s, 0, objOf(s, "boat-1"))).toBe(0);
    const r = step(withHero(s, { mp: 1500 }), [5, 5]);
    expect(texts(r.events)).toEqual([]);
    expect(isAfloat(r.state, hero(r.state))).toBe(true);
  });
});

describe("saves and dry maps", () => {
  it("a game with visited sea objects saves and loads unchanged", () => {
    let s = game(
      [site("village", "fishing-village", 2, 8)],
      [
        site("l", "lighthouse", 8, 6),
        site("w1", "whirlpool", 9, 4, { pair: "p" }),
        site("w2", "whirlpool", 12, 9, { pair: "p" }),
        boat("b", 7, 6),
      ],
    );
    s = afloat(s, 7, 6);
    s = step(s, [8, 6]).state;
    s = step(s, [9, 5], [9, 4]).state;
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
    expect(r.state.sites).toEqual(s.sites);
    expect(r.state.ships).toEqual(s.ships);
    expect(r.state.mines).toEqual(s.mines);
    expect(lighthouseBonus(r.state, 0)).toBe(200);
    expect(shipOfHero(r.state, hero(r.state))).toMatchObject({ x: 12, y: 9 });
  });

  it("a dry map with the same land objects plays as before", () => {
    const rows = field(8, 6);
    const dry = newGame(
      buildMap(rows, [heroStart(0, 0), site("v", "fishing-village", 3, 3)]),
    );
    expect(dry.mines["v"]?.resource).toBe("gold");
    expect(dry.ships).toBeUndefined();
    const r = step(dry, [1, 1], [2, 2], [3, 3]);
    expect(r.state.mines["v"]?.owner).toBe(0);
  });
});
