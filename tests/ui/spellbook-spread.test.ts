/**
 * Spellbook v3 (bead border_marches-bzc.99): the open book's school ribbons
 * and Combat / Adventure tabs filter the spells, a spread holds twelve and
 * more turn the page, and a school's frame is gilded when the hero has rank
 * in it. The DOM is checked by the screen tour; this covers what the book
 * is built from.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GameState, HeroState } from "../../src/core/game/index.ts";
import { cloneState } from "../../src/core/game/state.ts";
import { heroMagic, withHeroMagic } from "../../src/core/magic/index.ts";
import { assetByKey } from "../../src/assets/manifest.ts";
import { bookCards, bookPages, IN_BATTLE } from "../../src/ui/spellbook.ts";
import { battleCards, ON_THE_MAP } from "../../src/ui/battle/spellbook.ts";
import type { BookView } from "../../src/ui/battle/spellbook.ts";
import type { BookEntry, EntryStatus } from "../../src/ui/battle/magic.ts";
import {
  BOOK_SCHOOLS,
  cardFrame,
  FRAME_SIZE,
  HOLES,
  mastered,
  masteryText,
  PER_SPREAD,
  RIBBONS,
  spreadAt,
  spreadCards,
  spreadCount,
} from "../../src/ui/spellbook-spread.ts";
import type { SchoolRanks, SpreadCard } from "../../src/ui/spellbook-spread.ts";
import { field, gameOn } from "../core/game/helpers.ts";

const ROOT = join(import.meta.dirname, "../..");

function hero(s: GameState): HeroState {
  return s.heroes.find((h) => h.id === "hero-0") as HeroState;
}

/** A hero with these school skills (id, rank), pages and scrolls. */
function learn(
  skills: [string, number][],
  pages: string[],
  scrolls: string[] = [],
): GameState {
  const s = cloneState(gameOn(field(9, 5), [], 2, 1));
  const h = hero(s);
  h.power = 1;
  h.lore = 1;
  h.feats = [];
  h.worn = h.worn.map(() => null);
  h.skills = skills.map(([id, rank]) => ({ id, rank }));
  withHeroMagic(h, { knownSpells: pages, mana: 30 });
  h.scrolls = [...scrolls];
  return s;
}

const ids = (cards: readonly SpreadCard[]): string[] => cards.map((c) => c.id);

describe("the adventure book's ribbons and tabs", () => {
  // Bloom: nettle (combat), green-road (adventure); Storm: jolt (combat);
  // Clock: saved-hour (adventure); a Hush scroll: lullaby (combat).
  const s = learn(
    [["greencraft", 2]],
    ["nettle", "green-road", "jolt", "saved-hour"],
    ["lullaby"],
  );
  const cards = bookCards(bookPages(s, hero(s)));

  it("puts adventure spells under Adventure and combat ones under Combat", () => {
    expect(ids(spreadCards(cards, "adventure", "all")).sort()).toEqual([
      "green-road",
      "saved-hour",
    ]);
    expect(ids(spreadCards(cards, "combat", "all")).sort()).toEqual([
      "jolt",
      "lullaby",
      "nettle",
    ]);
  });

  it("narrows a tab to one school's ribbon, scrolls included", () => {
    expect(ids(spreadCards(cards, "combat", "bloom"))).toEqual(["nettle"]);
    expect(ids(spreadCards(cards, "combat", "hush"))).toEqual(["lullaby"]);
    expect(ids(spreadCards(cards, "adventure", "bloom"))).toEqual([
      "green-road",
    ]);
    expect(spreadCards(cards, "adventure", "storm")).toEqual([]);
    // Every ribbon's spells together are the All ribbon's.
    for (const t of ["combat", "adventure"] as const)
      expect(
        BOOK_SCHOOLS.flatMap((school) => spreadCards(cards, t, school)).length,
      ).toBe(spreadCards(cards, t, "all").length);
    expect(RIBBONS).toEqual(["all", ...BOOK_SCHOOLS]);
  });

  it("dims combat spells on the map, lightly, with the reason", () => {
    for (const c of spreadCards(cards, "combat", "all")) {
      expect(c.reason).toBe(IN_BATTLE);
      expect(c.away).toBe(true);
    }
    const scroll = cards.find((c) => c.id === "lullaby");
    expect(scroll?.note).toBe("scroll");
  });
});

function entry(
  id: string,
  school: BookEntry["school"],
  status: EntryStatus = "ready",
  extra: Partial<BookEntry> = {},
): BookEntry {
  return {
    id,
    name: id,
    school,
    tier: 1,
    mana: 4,
    power: 3,
    text: "",
    source: "page",
    count: 1,
    status,
    reason: status === "ready" ? null : "Needs 4 mana",
    fuel: null,
    ...extra,
  };
}

describe("the battle book's ribbons and tabs", () => {
  const view: BookView = {
    title: "Book",
    status: "Mana 10",
    pages: [
      entry("jolt", "storm"),
      entry("nettle", "bloom", "mana"),
      entry("poultice", "bloom"),
    ],
    scrolls: [
      entry("wind", "clock", "ready", { source: "scroll", mana: 0, count: 2 }),
    ],
    creature: {
      name: "Gravecallers",
      pages: [entry("lullaby", "hush", "ready", { source: "creature" })],
    },
    ranks: { bloom: 1, accord: 0, clock: 0, hush: 0, storm: 3 },
    adventure: [
      {
        id: "green-road",
        name: "Green Road",
        school: "bloom",
        tier: 2,
        mana: 7,
        scroll: false,
      },
    ],
  };
  const { cards, tiles } = battleCards(view);

  it("lists combat pages castable first, then the dimmed ones", () => {
    expect(ids(spreadCards(cards, "combat", "all"))).toEqual([
      "poultice",
      "jolt",
      "wind",
      "lullaby",
      "nettle",
    ]);
    const nettle = cards.find((c) => c.id === "nettle");
    expect(nettle?.reason).toBe("Needs 4 mana");
    expect(nettle?.short).toBe("no mana");
    expect(nettle?.className).toContain("bm-st-mana");
  });

  it("files scrolls and a creature's pages under their school's ribbon", () => {
    expect(ids(spreadCards(cards, "combat", "clock"))).toEqual(["wind"]);
    expect(cards.find((c) => c.id === "wind")?.note).toBe("scroll");
    expect(ids(spreadCards(cards, "combat", "hush"))).toEqual(["lullaby"]);
    expect(cards.find((c) => c.id === "lullaby")?.note).toBe("Gravecallers");
    expect(ids(spreadCards(cards, "combat", "bloom"))).toEqual([
      "poultice",
      "nettle",
    ]);
  });

  it("shows adventure pages on the Adventure tab, dimmed: cast on the map", () => {
    const adventure = spreadCards(cards, "adventure", "all");
    expect(ids(adventure)).toEqual(["green-road"]);
    expect(adventure[0]?.reason).toBe(ON_THE_MAP);
    expect(adventure[0]?.cost).toBe("7 mana");
    expect(spreadCards(cards, "adventure", "storm")).toEqual([]);
  });

  it("maps every combat card back to its page for the detail strip", () => {
    for (const c of spreadCards(cards, "combat", "all"))
      expect(tiles.get(c.key)?.entry.id).toBe(c.id);
  });
});

describe("paging", () => {
  it("holds twelve spells a spread and turns to the rest", () => {
    const list = Array.from({ length: 13 }, (_, i) => i);
    expect(PER_SPREAD).toBe(12);
    expect(spreadCount(0)).toBe(1);
    expect(spreadCount(12)).toBe(1);
    expect(spreadCount(13)).toBe(2);
    expect(spreadAt(list, 0)).toHaveLength(12);
    expect(spreadAt(list, 1)).toEqual([12]);
    // Out of range: the last spread.
    expect(spreadAt(list, 5)).toEqual([12]);
  });
});

describe("the mastery frame", () => {
  const ranks: SchoolRanks = {
    bloom: 2,
    accord: 0,
    clock: 1,
    hush: 0,
    storm: 3,
  };
  const card = (school: SpreadCard["school"]): SpreadCard => ({
    key: String(school),
    id: "x",
    icon: "spell",
    name: "x",
    school,
    context: "combat",
    tier: 1,
    cost: "4 mana",
    reason: null,
  });

  it("is gilded when the hero has any rank in the school", () => {
    expect(mastered(ranks, "bloom")).toBe(true);
    expect(mastered(ranks, "clock")).toBe(true);
    expect(mastered(ranks, "accord")).toBe(false);
    expect(mastered(ranks, null)).toBe(false);
    expect(cardFrame(card("storm"), ranks)).toBe("frame-spell-storm-gilded");
    expect(cardFrame(card("hush"), ranks)).toBe("frame-spell-hush");
    expect(cardFrame(card(null), ranks)).toBeNull();
  });

  it("follows the hero's school skills", () => {
    const s = learn(
      [
        ["greencraft", 1],
        ["stormcalling", 3],
      ],
      ["nettle", "jolt", "lullaby"],
    );
    const m = heroMagic(hero(s));
    const cards = bookCards(bookPages(s, hero(s)));
    const frame = (id: string): string | null =>
      cardFrame(cards.find((c) => c.id === id) as SpreadCard, m.schoolRanks);
    expect(frame("nettle")).toBe("frame-spell-bloom-gilded");
    expect(frame("jolt")).toBe("frame-spell-storm-gilded");
    expect(frame("lullaby")).toBe("frame-spell-hush");
  });

  it("explains the frame in words", () => {
    expect(masteryText("hush", 0)).toMatch(/^Plain Hush frame: no Hush rank/);
    expect(masteryText("storm", 3)).toBe(
      "Gilded Storm frame: Storm rank 3 (learns tiers 1-5, +4 Power).",
    );
  });

  it("has a 48 px plain and gilded frame per school, with the parchment hole inside", () => {
    expect(FRAME_SIZE).toBe(48);
    for (const school of BOOK_SCHOOLS)
      for (const gilded of [false, true]) {
        const a = assetByKey(`frame-spell-${school}${gilded ? "-gilded" : ""}`);
        expect([a.w, a.h]).toEqual([48, 48]);
        const file = join(ROOT, "public", a.path);
        expect(existsSync(file)).toBe(true);
        const head = readFileSync(file).subarray(16, 24);
        expect([head.readUInt32BE(0), head.readUInt32BE(4)]).toEqual([48, 48]);
      }
    for (const school of BOOK_SCHOOLS) {
      const h = HOLES[school];
      // The 32 px icon (centred at 8..40) sits over the hole.
      expect(h.x).toBeGreaterThan(0);
      expect(h.x + h.width).toBeLessThan(48);
      expect(h.width).toBeGreaterThanOrEqual(26);
      expect(h.height).toBeGreaterThanOrEqual(26);
    }
  });
});
