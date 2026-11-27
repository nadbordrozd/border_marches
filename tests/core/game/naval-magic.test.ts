/**
 * Naval spells, Seafaring and sea artifacts on the adventure map
 * (docs/design/NAVAL.md 7.1, 7.3 and 7.4, bead bzc.154): Call the Boat,
 * Scuttle, Lily Road, Fair Wind; Seafaring's ranks and its offers; the
 * Tricorne, the Sextant, the Comb, the Ship in a Bottle and the Locket on
 * the map. Small hand-built maps only.
 */
import { describe, expect, it } from "vitest";
import {
  cloneState,
  findPath,
  heroBattleProfile,
  heroSight,
  isAfloat,
  isLilyCell,
  lilyStepCost,
  moveContext,
  moveHeroAlong,
  newGame,
  reachableCells,
  seaMovementPoints,
  shipAt,
  shipsOf,
  skillOffers,
  skillWeight,
  armyLuck,
  heroStats,
  type GameState,
  type HeroState,
} from "../../../src/core/game/index.ts";
import {
  adventureCastError,
  adventurePower,
  castAdventureSpell,
  heroMagic,
  withHeroMagic,
} from "../../../src/core/magic/index.ts";
import { getHeroClass } from "../../../src/data/classes.ts";
import { WORN_SLOTS, getArtifact } from "../../../src/data/artifacts.ts";
import { SEAFARING_WEIGHT } from "../../../src/data/naval.ts";
import type { MapObject } from "../../../src/core/map/types.ts";
import {
  buildMap,
  errorOf,
  field,
  gameOn,
  heroStart,
  monster,
  ok,
} from "./helpers.ts";
import { STRAIT, boat, navalGame } from "./naval-helpers.ts";

function hero(s: GameState, id = "hero-0"): HeroState {
  return s.heroes.find((h) => h.id === id)!;
}

const SCHOOL_SKILLS: Record<string, string> = {
  bloom: "greencraft",
  accord: "covenant",
  clock: "horology",
  hush: "quietus",
  storm: "stormcalling",
};

/**
 * A plain hero (Power 1, 20 mana, rank 1 in every school unless given)
 * knowing `spells`, with `mp` points and both maxima fixed.
 */
function caster(
  s0: GameState,
  spells: string[],
  opts: { ranks?: Record<string, number>; mp?: number } = {},
): GameState {
  const s = cloneState(s0);
  const h = hero(s);
  h.power = 1;
  h.lore = 2;
  h.feats = [];
  h.worn = h.worn.map(() => null);
  h.skills = Object.entries(SCHOOL_SKILLS).map(([school, id]) => ({
    id,
    rank: opts.ranks?.[school] ?? 1,
  }));
  h.mana = 20;
  h.pages = [];
  h.scrolls = [];
  withHeroMagic(h, { knownSpells: spells });
  if (opts.mp !== undefined) {
    h.mp = opts.mp;
    h.maxMp = Math.max(1500, opts.mp);
    h.seaMaxMp = Math.max(1500, opts.mp);
  }
  return s;
}

const cast = castAdventureSpell;

/** Wears an artifact in its slot (test surgery, in place). */
function wear(h: HeroState, id: string): void {
  const def = getArtifact(id);
  if (def.kind !== "worn") throw new Error(id);
  h.worn[WORN_SLOTS.indexOf(def.slot)] = id;
}

/** The STRAIT with the hero on the west shore (4, 5), and these boats. */
function strait(boats: MapObject[]): GameState {
  return navalGame(STRAIT, [], boats);
}

describe("Call the Boat (NAVAL 7.1)", () => {
  it("brings the player's nearest empty ship to free water beside the hero", () => {
    const s0 = caster(
      strait([boat("b1", 13, 5, 0), boat("b2", 10, 2, 0), boat("b3", 6, 8)]),
      ["call-the-boat"],
    );
    const { state, events } = ok(cast(s0, "hero-0", "call-the-boat"));
    // b2 (6 cells away) is nearer than b1 (9); b3 is neutral, never called.
    const called = shipsOf(state).find((s) => s.id === "ship-2")!;
    expect([called.x, called.y]).toEqual([5, 5]);
    expect(shipAt(state, 13, 5)?.id).toBe("ship-1");
    expect(shipAt(state, 6, 8)?.owner).toBeNull();
    expect(events).toContainEqual({
      type: "ship-called",
      heroId: "hero-0",
      shipId: "ship-2",
      x: 5,
      y: 5,
      built: false,
    });
    expect(hero(state).mana).toBe(20 - 7);
    // The hero can board it next.
    const r = ok(moveHeroAlong(state, "hero-0", [{ x: 5, y: 5 }]));
    expect(isAfloat(r.state, hero(r.state))).toBe(true);
  });

  it("moors it on a chosen free berth", () => {
    const s0 = caster(strait([boat("b1", 13, 5, 0)]), ["call-the-boat"]);
    const { state } = ok(cast(s0, "hero-0", "call-the-boat", { x: 5, y: 6 }));
    expect(shipAt(state, 5, 6)?.id).toBe("ship-1");
    expect(errorOf(cast(s0, "hero-0", "call-the-boat", { x: 4, y: 4 }))).toBe(
      "bad-choice",
    );
  });

  it("builds a new ship for 1000 gold and 10 wood when none is in reach", () => {
    let s0 = caster(strait([boat("b1", 9, 5)]), ["call-the-boat"]);
    s0.players[0]!.resources = { gold: 5000, wood: 20, ore: 0, essence: 0 };
    const { state, events } = ok(cast(s0, "hero-0", "call-the-boat"));
    expect(state.players[0]!.resources).toEqual({
      gold: 4000,
      wood: 10,
      ore: 0,
      essence: 0,
    });
    const built = shipAt(state, 5, 5);
    expect(built).toEqual({ id: "ship-2", x: 5, y: 5, owner: 0 });
    expect(events).toContainEqual(
      expect.objectContaining({ type: "ship-called", built: true }),
    );
    // Refused without the money.
    s0 = cloneState(s0);
    s0.players[0]!.resources = { gold: 999, wood: 20, ore: 0, essence: 0 };
    expect(adventureCastError(s0, hero(s0), "call-the-boat")).toMatch(
      /costs 1000 gold and 10 wood/,
    );
  });

  it("reaches 10 + 5 x Power cells", () => {
    // Power 0: reach 10. A ship 10 away is called, one 11 away is not.
    const wide = Array.from({ length: 12 }, () => "ggggg~~~~~~~~~~~~~~~~~gg");
    const near = caster(navalGame(wide, [], [boat("b1", 14, 5, 0)]), [
      "call-the-boat",
    ]);
    hero(near).power = 0;
    expect(adventurePower(hero(near), "call-the-boat", false)).toBe(0);
    const r = ok(cast(near, "hero-0", "call-the-boat"));
    expect(shipAt(r.state, 5, 5)?.id).toBe("ship-1");
    const far = caster(navalGame(wide, [], [boat("b1", 15, 5, 0)]), [
      "call-the-boat",
    ]);
    hero(far).power = 0;
    far.players[0]!.resources = { gold: 0, wood: 0, ore: 0, essence: 0 };
    expect(adventureCastError(far, hero(far), "call-the-boat")).toMatch(
      /no ship of yours within 10 cells/,
    );
  });

  it("refuses off the shore, afloat, with no free water, and on a dry map", () => {
    const s0 = caster(strait([boat("b1", 13, 5, 0)]), ["call-the-boat"]);
    const inland = cloneState(s0);
    hero(inland).x = 2;
    expect(adventureCastError(inland, hero(inland), "call-the-boat")).toMatch(
      /shore/,
    );
    const boarded = caster(
      ok(
        moveHeroAlong(strait([boat("b0", 5, 5, 0)]), "hero-0", [
          { x: 5, y: 5 },
        ]),
      ).state,
      ["call-the-boat"],
    );
    expect(adventureCastError(boarded, hero(boarded), "call-the-boat")).toMatch(
      /already afloat/,
    );
    const crowded = caster(
      strait([boat("n1", 5, 4), boat("n2", 5, 5), boat("n3", 5, 6)]),
      ["call-the-boat"],
    );
    expect(adventureCastError(crowded, hero(crowded), "call-the-boat")).toMatch(
      /no free water/,
    );
    const dry = caster(gameOn(field(6, 6), [], 2, 2), ["call-the-boat"]);
    expect(adventureCastError(dry, hero(dry), "call-the-boat")).toMatch(
      /no sea/,
    );
  });
});

describe("Scuttle (NAVAL 7.1)", () => {
  it("sinks an empty ship of any owner within 6 + Power cells", () => {
    const s0 = caster(strait([boat("b1", 9, 5), boat("b2", 11, 3, 1)]), [
      "scuttle",
    ]);
    // Power 1: reach 7.
    const { state, events } = ok(
      cast(s0, "hero-0", "scuttle", { shipId: "ship-1" }),
    );
    expect(shipsOf(state).map((s) => s.id)).toEqual(["ship-2"]);
    expect(events).toContainEqual({
      type: "ship-sunk",
      shipId: "ship-1",
      x: 9,
      y: 5,
      why: "scuttled",
    });
    expect(hero(state).mana).toBe(20 - 7);
    // An enemy's ship too.
    const r = ok(cast(s0, "hero-0", "scuttle", { shipId: "ship-2" }));
    expect(shipsOf(r.state).map((s) => s.id)).toEqual(["ship-1"]);
  });

  it("refuses a ship with a hero aboard, out of reach, or none chosen", () => {
    let s0 = strait([boat("b1", 5, 5, 0), boat("b2", 8, 5), boat("b3", 14, 5)]);
    s0 = ok(moveHeroAlong(s0, "hero-0", [{ x: 5, y: 5 }])).state;
    s0 = caster(s0, ["scuttle"]);
    expect(isAfloat(s0, hero(s0))).toBe(true);
    const aboard = cast(s0, "hero-0", "scuttle", { shipId: "ship-1" });
    expect(errorOf(aboard)).toBe("bad-choice");
    expect(aboard.ok ? "" : aboard.message).toMatch(/a hero is aboard/);
    const far = cast(s0, "hero-0", "scuttle", { shipId: "ship-3" });
    expect(far.ok ? "" : far.message).toMatch(/more than 7 cells/);
    const none = cast(s0, "hero-0", "scuttle", {});
    expect(none.ok ? "" : none.message).toMatch(/choose a ship/);
    // The ship aboard and the far one are untouched by a good cast.
    const r = ok(cast(s0, "hero-0", "scuttle", { shipId: "ship-2" }));
    expect(shipsOf(r.state).map((s) => s.id)).toEqual(["ship-1", "ship-3"]);
  });

  it("is greyed with no empty ship in reach", () => {
    const s0 = caster(strait([boat("b1", 14, 5)]), ["scuttle"]);
    expect(adventureCastError(s0, hero(s0), "scuttle")).toBe(
      "no empty ship within 7 cells",
    );
  });
});

describe("Fair Wind (NAVAL 7.1)", () => {
  it("gives a hero afloat 200 + 50 x Power sea points now, at most 700", () => {
    let s0 = strait([boat("b1", 5, 5)]);
    s0 = ok(moveHeroAlong(s0, "hero-0", [{ x: 5, y: 5 }])).state;
    s0 = caster(s0, ["fair-wind"]);
    const before = hero(s0).mp;
    const r = ok(cast(s0, "hero-0", "fair-wind"));
    expect(hero(r.state).mp).toBe(before + 250); // Power 1
    expect(hero(r.state).mana).toBe(20 - 4);
    // Once a day.
    expect(adventureCastError(r.state, hero(r.state), "fair-wind")).toMatch(
      /already cast today/,
    );
    const strong = cloneState(s0);
    hero(strong).power = 20;
    const big = ok(cast(strong, "hero-0", "fair-wind"));
    expect(hero(big.state).mp).toBe(hero(strong).mp + 700);
  });

  it("refuses a hero ashore", () => {
    const s0 = caster(strait([]), ["fair-wind"]);
    expect(adventureCastError(s0, hero(s0), "fair-wind")).toBe(
      "the hero must be afloat",
    );
  });
});

/** 9 x 3: land, three columns of shallow water, land. */
const POND = ["ggg~~~ggg", "ggg~~~ggg", "ggg~~~ggg"];

describe("Lily Road (NAVAL 7.1)", () => {
  function lily(s0: GameState, mp = 1500): GameState {
    const s = caster(s0, ["lily-road"], { ranks: { bloom: 2 }, mp });
    return ok(cast(s, "hero-0", "lily-road")).state;
  }

  it("crosses shallow water at 200 a cell (283 diagonally), ending on land", () => {
    const s0 = gameOn(POND, [], 2, 1);
    expect(findPath(s0, "hero-0", 6, 1, { ignoreFog: true })).toBeNull();
    const s = lily(s0);
    const path = findPath(s, "hero-0", 6, 1, { ignoreFog: true })!;
    expect(path.steps.map((x) => [x.x, x.y, x.cost])).toEqual([
      [3, 1, 200],
      [4, 1, 200],
      [5, 1, 200],
      [6, 1, 100],
    ]);
    // The step off the pads is an ordinary land step (141 diagonally).
    const diag = findPath(s, "hero-0", 6, 2, { ignoreFog: true })!;
    expect(diag.total).toBe(3 * 200 + 141);
    const ctx = moveContext(s, hero(s), { ignoreFog: true });
    expect(lilyStepCost(ctx, 3, 1, 4, 2)).toBe(283);
    expect(isLilyCell(ctx, 4, 2)).toBe(true);
    expect(isLilyCell(ctx, 6, 2)).toBe(false);
    const r = ok(moveHeroAlong(s, "hero-0", path.steps));
    expect([hero(r.state).x, hero(r.state).y]).toEqual([6, 1]);
    expect(hero(r.state).mp).toBe(1500 - 700);
  });

  it("never stops on water: no path ends there, no stand is reachable there", () => {
    const s = lily(gameOn(POND, [], 2, 1));
    expect(findPath(s, "hero-0", 4, 1, { ignoreFog: true })).toBeNull();
    const reach = reachableCells(s, "hero-0", undefined, { ignoreFog: true });
    expect(reach.has(1 * 9 + 4)).toBe(false);
    expect(reach.get(1 * 9 + 6)).toBe(700);
  });

  it("a crossing must fit in today's points; a walk cut short goes back ashore", () => {
    const s = lily(gameOn(POND, [], 2, 1), 500);
    expect(findPath(s, "hero-0", 6, 1, { ignoreFog: true })).toBeNull();
    const r = ok(
      moveHeroAlong(s, "hero-0", [
        { x: 3, y: 1 },
        { x: 4, y: 1 },
        { x: 5, y: 1 },
        { x: 6, y: 1 },
      ]),
    );
    const h = hero(r.state);
    expect([h.x, h.y, h.mp]).toEqual([2, 1, 500]);
    expect(r.events[0]).toMatchObject({
      type: "moved",
      cells: [],
      stop: "no-mp",
    });
  });

  it("does not cross deep water or water next to a guard, and expires with the day", () => {
    const deepMap = buildMap([...POND], [heroStart(2, 1)]);
    for (let y = 0; y < 3; y++) deepMap.cells[y * 9 + 4]!.deep = true;
    const deep = lily(newGame(deepMap));
    expect(findPath(deep, "hero-0", 6, 1, { ignoreFog: true })).toBeNull();
    // A stack on the east shore guards (5, 0) and (5, 1): the crossing
    // keeps to the bottom row.
    const guarded = lily(gameOn(POND, [monster("m", 6, 0, "goblin", 5)], 2, 1));
    const path = findPath(guarded, "hero-0", 6, 2, { ignoreFog: true })!;
    expect(path).not.toBeNull();
    for (const st of path.steps) expect([st.x, st.y]).not.toEqual([5, 1]);
    // Tomorrow the pads are gone.
    const later = cloneState(lily(gameOn(POND, [], 2, 1)));
    later.day += 1;
    expect(findPath(later, "hero-0", 6, 1, { ignoreFog: true })).toBeNull();
  });

  it("on a naval map crosses the sea on foot, round sea guards, and still boards ships", () => {
    const s = lily(navalGame(STRAIT, [], [boat("b1", 5, 2)]), 3000);
    const path = findPath(s, "hero-0", 15, 5, { ignoreFog: true })!;
    expect(path).not.toBeNull();
    const water = path.steps.slice(0, -1);
    expect(water.every((st) => st.afloat !== true)).toBe(true);
    expect(water.every((st) => st.cost === 200 || st.cost === 283)).toBe(true);
    expect(path.total).toBe(10 * 200 + 100);
    const r = ok(moveHeroAlong(s, "hero-0", path.steps));
    expect([hero(r.state).x, hero(r.state).y, hero(r.state).mp]).toEqual([
      15,
      5,
      3000 - 2100,
    ]);
    expect(isAfloat(r.state, hero(r.state))).toBe(false);
    // Boarding still works with the pads out.
    const board = findPath(s, "hero-0", 5, 2, { ignoreFog: true })!;
    expect(board.steps.at(-1)?.board).toBe("ship-1");
    const ctx = moveContext(s, hero(s), { ignoreFog: true });
    expect(ctx.lily).toEqual({ cost: 200, mp: 3000 });
  });

  it("keeps out of a sea stack's zone of control", () => {
    const map = buildMap([...STRAIT], [heroStart(4, 5)]);
    const naval = {
      ...map,
      naval: true,
      objects: [...map.objects, monster("serpent", 9, 5, "jellyfish", 5)],
    };
    const s = lily(newGame(naval), 3000);
    const path = findPath(s, "hero-0", 15, 5, { ignoreFog: true })!;
    expect(path).not.toBeNull();
    for (const st of path.steps)
      expect(Math.max(Math.abs(st.x - 9), Math.abs(st.y - 5))).toBeGreaterThan(
        1,
      );
  });
});

describe("Seafaring (NAVAL 7.3)", () => {
  const withRank = (rank: number, s0 = strait([])) => {
    const s = cloneState(s0);
    hero(s).skills = [{ id: "seafaring", rank }];
    return s;
  };

  it("adds 10%, 20%, 30% sea movement and 2 sight afloat from rank 2", () => {
    expect(seaMovementPoints(strait([]), hero(strait([])))).toBe(1500);
    for (const [rank, mp] of [
      [1, 1650],
      [2, 1800],
      [3, 1950],
    ] as const) {
      const s = withRank(rank);
      expect(seaMovementPoints(s, hero(s))).toBe(mp);
    }
    let s = withRank(2, strait([boat("b1", 5, 5)]));
    const ashore = heroSight(s, hero(s));
    s = ok(moveHeroAlong(s, "hero-0", [{ x: 5, y: 5 }])).state;
    expect(heroSight(s, hero(s))).toBe(ashore + 2);
    const r1 = ok(
      moveHeroAlong(withRank(1, strait([boat("b1", 5, 5)])), "hero-0", [
        { x: 5, y: 5 },
      ]),
    ).state;
    expect(heroSight(r1, hero(r1))).toBe(ashore);
  });

  it("weighs Might 4, Magic 3 and is offered only on naval maps", () => {
    const s = strait([]);
    const h = hero(s);
    const leaning = getHeroClass(h.heroClass).leaning;
    expect(skillWeight(h, "seafaring", 1)).toBe(2 * SEAFARING_WEIGHT[leaning]);
    const dry = gameOn(field(6, 6), [], 2, 2);
    let naval = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const ns = { ...s, seed };
      const ds = { ...dry, seed };
      const offered = (st: GameState) =>
        skillOffers(st, hero(st)).some(
          (o) => o.kind !== "stat" && o.skill === "seafaring",
        );
      if (offered(ns)) naval++;
      expect(offered(ds)).toBe(false);
    }
    expect(naval).toBeGreaterThan(0);
  });

  it("a held Seafaring is never raised on a dry map", () => {
    const dry = cloneState(gameOn(field(6, 6), [], 2, 2));
    hero(dry).skills = [{ id: "seafaring", rank: 1 }];
    const naval = cloneState(strait([]));
    hero(naval).skills = [{ id: "seafaring", rank: 1 }];
    for (let seed = 1; seed <= 40; seed++) {
      const d = skillOffers({ ...dry, seed }, hero(dry));
      expect(d.some((o) => o.kind === "upgrade")).toBe(false);
      // The guarantee: the only held skill is raised on a naval map.
      const n = skillOffers({ ...naval, seed }, hero(naval));
      expect(n[0]).toEqual({ kind: "upgrade", skill: "seafaring", rank: 2 });
    }
  });
});

describe("sea artifacts on the map (NAVAL 7.4)", () => {
  it("the Captain's Tricorne and the Locket add 15% sea movement each", () => {
    const s = cloneState(strait([]));
    wear(hero(s), "captains-tricorne");
    expect(seaMovementPoints(s, hero(s))).toBe(1725);
    wear(hero(s), "the-drowned-mans-locket");
    expect(seaMovementPoints(s, hero(s))).toBe(1950);
  });

  it("the Locket is cursed: +2 Defense, its strongest stack Drenched 50 throughout", () => {
    const def = getArtifact("the-drowned-mans-locket");
    expect(def.kind === "worn" && def.cursed).toBe(true);
    const s = cloneState(strait([]));
    const before = heroStats(hero(s)).defense;
    wear(hero(s), "the-drowned-mans-locket");
    expect(heroStats(hero(s)).defense).toBe(before + 2);
    expect(heroBattleProfile(hero(s)).startRules).toContainEqual(
      expect.objectContaining({
        rule: {
          side: "own",
          selector: "strongest",
          condition: "drenched",
          clock: null,
          size: 50,
        },
      }),
    );
  });

  it("the Brass Sextant adds 2 sight afloat only; the Comb +1 Luck", () => {
    let s = cloneState(strait([boat("b1", 5, 5)]));
    const plain = ok(moveHeroAlong(s, "hero-0", [{ x: 5, y: 5 }])).state;
    const base = heroSight(plain, hero(plain));
    wear(hero(s), "brass-sextant");
    expect(heroSight(s, hero(s))).toBe(heroSight(strait([]), hero(strait([]))));
    s = ok(moveHeroAlong(s, "hero-0", [{ x: 5, y: 5 }])).state;
    expect(heroSight(s, hero(s))).toBe(Math.min(12, base + 2));
    const c = cloneState(strait([]));
    const luck = armyLuck(hero(c));
    wear(hero(c), "mermaids-comb");
    expect(armyLuck(hero(c))).toBe(luck + 1);
  });

  it("the Ship in a Bottle casts Call the Boat once a day without page, rank or mana, at Power 2 or more", () => {
    const s0 = caster(strait([boat("b1", 14, 5, 0)]), [], {
      ranks: { accord: 0 },
    });
    const h0 = hero(s0);
    h0.mana = 0;
    h0.power = 0;
    expect(adventureCastError(s0, h0, "call-the-boat")).toBe(
      "the hero does not know it",
    );
    wear(h0, "ship-in-a-bottle");
    expect(heroMagic(h0).knownSpells).not.toContain("call-the-boat");
    expect(adventurePower(h0, "call-the-boat", false)).toBe(2);
    expect(adventureCastError(s0, h0, "call-the-boat")).toBeNull();
    // Power 2: reach 20, so the ship 10 cells away comes.
    const r = ok(cast(s0, "hero-0", "call-the-boat"));
    expect(shipAt(r.state, 5, 5)?.id).toBe("ship-1");
    expect(hero(r.state).mana).toBe(0);
    expect(adventureCastError(r.state, hero(r.state), "call-the-boat")).toMatch(
      /already cast today/,
    );
  });

  it("the Anchor, the Cutlass and the Conch reach the battle profile", () => {
    const s = cloneState(strait([]));
    wear(hero(s), "ships-anchor");
    wear(hero(s), "corsairs-cutlass");
    wear(hero(s), "conch-of-the-deep");
    const p = heroBattleProfile(hero(s));
    const rules = p.startRules.map(
      (r) =>
        `${r.rule.selector}:${r.rule.condition}:${r.rule.size ?? "-"}:${r.rule.clock}`,
    );
    expect(rules).toEqual(
      expect.arrayContaining([
        "slowest:shielded:4:3",
        "slowest:stuck:-:2",
        "fastest:fired-up:3:2",
        "fastest:hastened:-:2",
      ]),
    );
    expect(p.itemActs).toContain("conch-of-the-deep");
  });
});
