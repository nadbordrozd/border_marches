/**
 * Magic on the adventure layer: the hero magic adapter, adventure spells
 * (RULES_V2 2.8, CONTENT_SPELLS 4), mana by day (2.3), guild learning and
 * battle mana (2.9, 1.12). Tiny hand-built maps.
 */

import { describe, expect, it } from "vitest";
import {
  applyBattleResult,
  battleSetup,
  endDay,
  findPath,
  moveHeroAlong,
} from "../../../src/core/game/index.ts";
import type { GameState, HeroState } from "../../../src/core/game/index.ts";
import { cloneState } from "../../../src/core/game/state.ts";
import { engineSetupFromGame } from "../../../src/core/battle/index.ts";
import {
  ADVENTURE_SPELLS,
  castAdventureSpell,
  heroMagic,
  teachSpell,
  withHeroMagic,
} from "../../../src/core/magic/index.ts";
import {
  errorOf,
  field,
  gameOn,
  monster,
  ok,
  pickup,
  town,
} from "../game/helpers.ts";

function hero(s: GameState, id = "hero-0"): HeroState {
  return s.heroes.find((h) => h.id === id) as HeroState;
}

const SCHOOL_SKILLS: Record<string, string> = {
  bloom: "greencraft",
  accord: "covenant",
  clock: "horology",
  hush: "quietus",
  storm: "stormcalling",
};

/** Sets the hero's Power 1, Lore 1 (10 mana) and school ranks, in place. */
function plain(h: HeroState, ranks: Record<string, number> = {}): void {
  h.power = 1;
  h.lore = 1;
  h.feats = [];
  h.worn = h.worn.map(() => null);
  h.skills = Object.entries(SCHOOL_SKILLS).map(([school, id]) => ({
    id,
    rank: ranks[school] ?? 1,
  }));
  h.mana = 10;
  h.pages = [];
  h.scrolls = [];
}

/** A plain hero (rank 1 everywhere unless given) that knows `spells`. */
function learn(
  s: GameState,
  spells: string[],
  opts: { ranks?: Record<string, number>; mana?: number } = {},
): GameState {
  const next = cloneState(s);
  const h = hero(next);
  plain(h, opts.ranks);
  withHeroMagic(h, {
    knownSpells: spells,
    ...(opts.mana !== undefined ? { mana: opts.mana } : {}),
  });
  return next;
}

const cast = castAdventureSpell;

describe("the hero magic view", () => {
  it("reads Power, Lore, mana, pages and school ranks from the hero model", () => {
    const s = learn(gameOn(field(5, 5), []), ["jolt"], {
      ranks: { storm: 2 },
    });
    expect(heroMagic(hero(s))).toMatchObject({
      power: 1,
      lore: 1,
      mana: 10,
      maxMana: 10,
      knownSpells: ["jolt"],
      scrolls: [],
      schoolRanks: { bloom: 1, accord: 1, clock: 1, hush: 1, storm: 2 },
      pagePower: { bloom: 1, storm: 3 },
      scrollPower: 2,
      costPercent: 100,
    });
  });

  it("writes mana, pages and scrolls to the hero", () => {
    const s = learn(gameOn(field(5, 5), []), []);
    withHeroMagic(hero(s), {
      mana: 4,
      knownSpells: ["mend"],
      scrolls: ["jolt"],
    });
    expect(hero(s)).toMatchObject({
      mana: 4,
      pages: ["mend"],
      scrolls: ["jolt"],
    });
  });

  it("teaches a page when the rank allows, else a scroll", () => {
    const s = learn(gameOn(field(5, 5), []), []);
    expect(teachSpell(hero(s), "jolt")).toBe("page");
    expect(teachSpell(hero(s), "the-sky-falls")).toBe("scroll");
    expect(teachSpell(hero(s), "jolt")).toBe("known");
    expect(heroMagic(hero(s))).toMatchObject({
      knownSpells: ["jolt"],
      scrolls: ["the-sky-falls"],
    });
  });
});

describe("casting adventure spells", () => {
  it("lists ten adventure spells, two per school", () => {
    expect(ADVENTURE_SPELLS).toHaveLength(10);
  });

  it("needs the page, the rank for its tier, mana, once a day", () => {
    const s0 = gameOn(field(9, 9), [], 4, 4);
    expect(errorOf(cast(s0, "hero-0", "dowse"))).toBe("bad-choice");
    const s1 = learn(s0, ["dowse", "borrowed-day"], { mana: 20 });
    expect(cast(s1, "hero-0", "borrowed-day")).toMatchObject({
      ok: false,
      message: "needs clock rank for tier 3",
    });
    const s2 = ok(cast(s1, "hero-0", "dowse")).state;
    expect(heroMagic(hero(s2)).mana).toBe(13);
    expect(cast(s2, "hero-0", "dowse")).toMatchObject({
      ok: false,
      message: "already cast today",
    });
    const poor = learn(s0, ["dowse"], { mana: 2 });
    expect(cast(poor, "hero-0", "dowse")).toMatchObject({
      ok: false,
      message: "needs 7 mana, the hero has 2",
    });
  });

  it("casts a scroll with no mana and no rank, destroying it", () => {
    const s0 = learn(gameOn(field(9, 9), [], 4, 4), []);
    withHeroMagic(hero(s0), { scrolls: ["borrowed-day"] });
    const s1 = ok(
      cast(s0, "hero-0", "borrowed-day", {}, { scroll: true }),
    ).state;
    expect(hero(s1).mp).toBe(hero(s0).mp + 400); // Power at least 2
    expect(heroMagic(hero(s1))).toMatchObject({ mana: 10, scrolls: [] });
  });

  it("deferred spells refuse with the reason", () => {
    const s0 = learn(gameOn(field(5, 5), []), ["tow-line", "second-helping"], {
      ranks: { bloom: 3, accord: 1, clock: 1, hush: 1, storm: 3 },
      mana: 50,
    });
    expect(cast(s0, "hero-0", "tow-line")).toMatchObject({
      ok: false,
      message: "not on this map: v0.2 maps have no pylons yet",
    });
    expect(cast(s0, "hero-0", "second-helping")).toMatchObject({ ok: false });
  });
});

describe("Green Road", () => {
  const rows = ["ggFgg", "ggFgg", "ggFgg"];
  it("lets the hero enter forest at 200 a step until the day ends", () => {
    const s0 = learn(gameOn(rows, [], 0, 1), ["green-road"]);
    expect(findPath(s0, "hero-0", 4, 1)).toBeNull();
    const s1 = ok(cast(s0, "hero-0", "green-road")).state;
    const path = findPath(s1, "hero-0", 4, 1);
    expect(path?.steps.map((x) => x.cost)).toEqual([100, 200, 100, 100]);
  });

  it("a hero left in forest at day end goes back to its last clear cell", () => {
    const s0 = learn(gameOn(rows, [], 0, 1), ["green-road"]);
    const s1 = ok(cast(s0, "hero-0", "green-road")).state;
    const path = findPath(s1, "hero-0", 2, 1)!;
    const s2 = ok(moveHeroAlong(s1, "hero-0", path.steps)).state;
    expect([hero(s2).x, hero(s2).y]).toEqual([2, 1]);
    const s3 = ok(endDay(s2)).state;
    expect([hero(s3).x, hero(s3).y]).toEqual([1, 1]);
    expect(findPath(s3, "hero-0", 2, 0)).toBeNull();
  });
});

describe("Parley", () => {
  it("removes an adjacent weak stack's zone of control for the day", () => {
    const s0 = learn(
      gameOn(field(7, 3), [monster("m", 3, 1, "goblin", 10)], 2, 0),
      ["parley"],
      { ranks: { bloom: 1, accord: 2, clock: 1, hush: 1, storm: 1 } },
    );
    // Without Parley a step into its zone stops the hero.
    const s1 = ok(cast(s0, "hero-0", "parley", { monsterId: "m" })).state;
    const moved = ok(
      moveHeroAlong(s1, "hero-0", [
        { x: 3, y: 0 },
        { x: 4, y: 0 },
      ]),
    );
    expect(moved.state.pendingBattle).toBeNull();
    expect([hero(moved.state).x, hero(moved.state).y]).toEqual([4, 0]);
  });

  it("refuses a stack above 300 + 150 P fight value", () => {
    const s0 = learn(
      gameOn(field(7, 3), [monster("m", 3, 1, "goblin", 40)], 2, 0),
      ["parley"],
      { ranks: { bloom: 1, accord: 2, clock: 1, hush: 1, storm: 1 } },
    );
    expect(cast(s0, "hero-0", "parley", { monsterId: "m" })).toMatchObject({
      ok: false,
      message: "fight value 2080 is above 750",
    });
  });
});

describe("Borrowed Day and Saved Hour", () => {
  it("Borrowed Day gives movement now and takes it from tomorrow", () => {
    const s0 = learn(gameOn(field(5, 5), []), ["borrowed-day"], {
      ranks: { bloom: 1, accord: 1, clock: 2, hush: 1, storm: 1 },
    });
    const mp = hero(s0).mp;
    const s1 = ok(cast(s0, "hero-0", "borrowed-day")).state;
    expect(hero(s1).mp).toBe(mp + 450); // P = 1 + 2
    const s2 = ok(endDay(s1)).state;
    expect(hero(s2).mp).toBe(hero(s0).maxMp - 450);
    expect(hero(s2).mpDebt).toBe(0);
  });

  it("Saved Hour moves movement to tomorrow", () => {
    const s0 = learn(gameOn(field(5, 5), []), ["saved-hour"]);
    const s1 = ok(cast(s0, "hero-0", "saved-hour", { amount: 200 })).state;
    expect(hero(s1).mp).toBe(hero(s0).mp - 200);
    const s2 = ok(endDay(s1)).state;
    expect(hero(s2).mp).toBe(hero(s2).maxMp + 200);
    expect(cast(s0, "hero-0", "saved-hour", { amount: 251 })).toMatchObject({
      ok: false,
      message: "save 1 to 250 movement",
    });
  });
});

describe("Ask the Dead, Dowse, Read the Seal", () => {
  it("Ask the Dead reveals a disc around an explored cell in range", () => {
    const s0 = learn(gameOn(field(40, 9), [], 0, 4), ["ask-the-dead"]);
    const explored = (s: GameState, x: number, y: number) =>
      s.players[0]!.explored[y * 40 + x];
    expect(explored(s0, 14, 4)).toBe(false);
    expect(cast(s0, "hero-0", "ask-the-dead", { x: 14, y: 4 })).toMatchObject({
      ok: false,
      message: "choose an explored cell",
    });
    const s1 = ok(cast(s0, "hero-0", "ask-the-dead", { x: 6, y: 4 })).state;
    expect(explored(s1, 10, 4)).toBe(true); // radius 4 + floor(1 / 2)
    expect(explored(s1, 11, 4)).toBe(false);
  });

  it("Dowse marks buried things within 5 + P cells", () => {
    const s0 = learn(
      gameOn(
        field(12, 3),
        [
          pickup("near", 5, 1, { resource: "gold", amount: 1, buried: true }),
          pickup("far", 11, 1, { resource: "gold", amount: 1, buried: true }),
        ],
        0,
        1,
      ),
      ["dowse"],
    );
    const s1 = ok(cast(s0, "hero-0", "dowse")).state;
    expect(s1.magic?.marks?.["0"]).toEqual([[5, 1]]);
  });

  it("Read the Seal shows a sealed site's contents", () => {
    const s0 = learn(
      gameOn(
        field(9, 3),
        [
          pickup("box", 4, 1, {
            resource: "gold",
            amount: 1,
            sealed: true,
            contents: "a Lucky Penny",
          }),
        ],
        0,
        1,
      ),
      ["read-the-seal"],
    );
    const s1 = ok(
      cast(s0, "hero-0", "read-the-seal", { objectId: "box" }),
    ).state;
    expect(s1.magic?.readings?.["0"]).toEqual(['box: "a Lucky Penny"']);
  });
});

describe("Opening Salvo", () => {
  it("harms an adjacent neutral stack before any battle, for 100 movement", () => {
    const s0 = learn(
      gameOn(field(5, 3), [monster("m", 2, 1, "goblin", 10)], 1, 1),
      ["opening-salvo"],
    );
    const s1 = ok(
      cast(s0, "hero-0", "opening-salvo", { monsterId: "m" }),
    ).state;
    // Harm 45 at P 1: five 8-HP goblins die.
    expect(s1.monsters.m?.count).toBe(5);
    expect(hero(s1).mp).toBe(hero(s0).mp - 100);
  });

  it("removes a stack reduced to nothing, with no XP", () => {
    const s0 = learn(
      gameOn(field(5, 3), [monster("m", 2, 1, "goblin", 3)], 1, 1),
      ["opening-salvo"],
    );
    const r = ok(cast(s0, "hero-0", "opening-salvo", { monsterId: "m" }));
    expect(r.state.monsters.m).toBeUndefined();
    expect(hero(r.state).xp).toBe(hero(s0).xp);
    expect(r.events).toContainEqual({
      type: "monster-defeated",
      monsterId: "m",
    });
  });
});

describe("mana by day (2.3)", () => {
  it("returns 1 + floor(Lore / 3) a day, up to the maximum", () => {
    const s0 = learn(gameOn(field(5, 5), []), [], { mana: 3 });
    const s1 = ok(endDay(s0)).state;
    expect(heroMagic(hero(s1)).mana).toBe(4);
  });

  it("is full at the start of a day in an own town with a guild", () => {
    const s0 = cloneState(
      learn(gameOn(field(5, 5), [town("t", 2, 0, 0)], 0, 0), [], { mana: 1 }),
    );
    s0.towns.t!.buildings = [...s0.towns.t!.buildings, "magic-guild-1"];
    const inTown = ok(
      moveHeroAlong(s0, "hero-0", findPath(s0, "hero-0", 2, 0)!.steps),
    ).state;
    const s1 = ok(endDay(inTown)).state;
    expect(heroMagic(hero(s1)).mana).toBe(10);
  });
});

describe("battle mana (1.12)", () => {
  it("the setup carries the book; spent mana and used scrolls stay spent", () => {
    const s0 = learn(
      gameOn(field(7, 3), [monster("m", 3, 1, "goblin", 2)], 0, 1),
      ["jolt", "dowse"],
    );
    withHeroMagic(hero(s0), { scrolls: ["nettle", "nettle"] });
    const s1 = ok(
      moveHeroAlong(s0, "hero-0", findPath(s0, "hero-0", 3, 1)!.steps),
    ).state;
    const setup = battleSetup(s1)!;
    expect(engineSetupFromGame(setup).attacker.magic).toMatchObject({
      pages: ["jolt", "dowse"],
      scrolls: ["nettle", "nettle"],
      mana: 10,
    });
    const after = ok(
      applyBattleResult(s1, {
        winner: "attacker",
        attacker: setup.attacker.stacks.map((x) => x.count),
        defender: setup.defender.stacks.map(() => 0),
        magic: {
          attacker: { manaSpent: 4, manaLeft: 6, scrollsUsed: ["nettle"] },
        },
      }),
    ).state;
    expect(heroMagic(hero(after))).toMatchObject({
      mana: 6,
      scrolls: ["nettle"],
    });
  });
});
