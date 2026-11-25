/**
 * The spellbooks as Heroes books (bead border_marches-bzc.63, UI2-13): the
 * adventure book's two tabs with the castable adventure pages first, and
 * the battle book's school groups, castable-first grid and two-word
 * captions under greyed pages. The DOM is checked by the screen tour; this
 * covers the order and words the books are built from.
 */

import { describe, expect, it } from "vitest";
import type { GameState, HeroState } from "../../src/core/game/index.ts";
import { cloneState } from "../../src/core/game/state.ts";
import { withHeroMagic } from "../../src/core/magic/index.ts";
import { ICON_FRAMES } from "../../src/assets/icons.ts";
import { bookPages, castable, shortReason } from "../../src/ui/spellbook.ts";
import {
  bookGroups,
  bookOrder,
  pageCaption,
} from "../../src/ui/battle/spellbook.ts";
import type { BookView } from "../../src/ui/battle/spellbook.ts";
import { SCHOOL_COLOURS } from "../../src/ui/battle/magic.ts";
import type { BookEntry, EntryStatus } from "../../src/ui/battle/magic.ts";
import { field, gameOn } from "../core/game/helpers.ts";

const SCHOOL_SKILLS = {
  bloom: "greencraft",
  accord: "covenant",
  clock: "horology",
  hush: "quietus",
  storm: "stormcalling",
};

function hero(s: GameState): HeroState {
  return s.heroes.find((h) => h.id === "hero-0") as HeroState;
}

/** A Power 1 hero with rank 2 in every school, these pages and scrolls. */
function learn(pages: string[], scrolls: string[], mana = 10): GameState {
  const s = cloneState(gameOn(field(9, 5), [], 2, 1));
  const h = hero(s);
  h.power = 1;
  h.lore = 1;
  h.feats = [];
  h.worn = h.worn.map(() => null);
  h.skills = Object.values(SCHOOL_SKILLS).map((id) => ({ id, rank: 2 }));
  withHeroMagic(h, { knownSpells: pages, mana });
  h.scrolls = [...scrolls];
  return s;
}

describe("the adventure book", () => {
  it("puts castable adventure pages first, then the greyed ones", () => {
    // Parley has no neutral stack in reach; Saved Hour can always save.
    const s = learn(["parley", "saved-hour", "nettle", "jolt"], []);
    const { adventure } = bookPages(s, hero(s));
    expect(adventure.map((p) => p.id)).toEqual(["saved-hour", "parley"]);
    expect(castable(adventure[0]!)).toBe(true);
    expect(adventure[1]?.usable?.reason).toBe(
      "No neutral stack within 2 cells",
    );
    expect(adventure[0]?.cost).toBe("4 mana");
  });

  it("orders greyed pages by school when none can be cast", () => {
    const s = learn(["saved-hour", "read-the-seal", "green-road"], [], 0);
    const { adventure } = bookPages(s, hero(s));
    expect(adventure.map((p) => p.id)).toEqual([
      "green-road",
      "read-the-seal",
      "saved-hour",
    ]);
    expect(adventure.every((p) => !castable(p))).toBe(true);
    expect(shortReason(adventure[0]?.usable?.reason ?? "")).toBe("no mana");
  });

  it("lists battle pages and scrolls on the Battle tab by school", () => {
    const s = learn(["jolt", "saved-hour", "nettle"], ["lullaby", "dowse"]);
    const { adventure, battle } = bookPages(s, hero(s));
    expect(battle.map((p) => [p.id, p.scroll, p.usable])).toEqual([
      ["nettle", false, null],
      ["lullaby", true, null],
      ["jolt", false, null],
    ]);
    expect(battle.find((p) => p.id === "lullaby")?.cost).toBe("scroll");
    // An adventure scroll is on the Adventure tab, marked as a scroll.
    expect(adventure.some((p) => p.id === "dowse" && p.scroll)).toBe(true);
    expect(adventure.some((p) => p.id === "lullaby")).toBe(false);
  });

  it("says why a page is greyed in two words", () => {
    expect(shortReason("Needs 7 mana, the hero has 2")).toBe("no mana");
    expect(shortReason("Already cast today")).toBe("cast today");
    expect(shortReason("Needs bloom rank for tier 3")).toBe("needs rank");
    expect(shortReason("Needs 300 movement")).toBe("no movement");
    expect(shortReason("Stand on a pylon")).toBe("needs pylon");
    expect(
      shortReason("Would have no effect: everything in reach is explored"),
    ).toBe("no effect");
    expect(shortReason("No neutral stack within 2 cells")).toBe("no target");
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
    reason: status === "ready" ? null : "Not now",
    fuel: null,
    ...extra,
  };
}

const VIEW: BookView = {
  title: "Book",
  status: "Mana 10",
  pages: [
    entry("jolt", "storm"),
    entry("nettle", "bloom", "mana"),
    entry("poultice", "bloom"),
    entry("lullaby", "hush", "target", {
      reason: "Would have no effect: no stack can fall asleep",
    }),
  ],
  scrolls: [
    entry("wind", "clock", "ready", { source: "scroll", mana: 0, count: 2 }),
  ],
  creature: { name: "Gravecallers", pages: [] },
};

describe("the battle book", () => {
  it("groups pages by school, then scrolls; empty groups are left out", () => {
    const groups = bookGroups(VIEW);
    expect(groups.map((g) => [g.key, g.entries.length])).toEqual([
      ["bloom", 2],
      ["hush", 1],
      ["storm", 1],
      ["scroll", 1],
    ]);
    expect(groups[0]?.colour).toBe(ICON_FRAMES.bloom.colour);
  });

  it("shows castable pages first, each part in book order", () => {
    const groups = bookGroups(VIEW);
    expect(bookOrder(groups, "all").map((t) => t.entry.id)).toEqual([
      "poultice",
      "jolt",
      "wind",
      "nettle",
      "lullaby",
    ]);
    expect(bookOrder(groups, "bloom").map((t) => t.entry.id)).toEqual([
      "poultice",
      "nettle",
    ]);
    expect(bookOrder(groups, "scroll")[0]?.group.label).toBe("Scrolls");
  });

  it("writes the cost under a bright page and why under a greyed one", () => {
    const [, nettle, poultice, lullaby] = VIEW.pages;
    expect(pageCaption(poultice!)).toBe("4 mana");
    expect(pageCaption(nettle!)).toBe("no mana");
    expect(pageCaption(lullaby!)).toBe("no effect");
    expect(pageCaption({ ...lullaby!, reason: "No enemy stack" })).toBe(
      "no target",
    );
    expect(pageCaption(VIEW.scrolls[0]!)).toBe("scroll ×2");
    expect(pageCaption({ ...poultice!, status: "spent" })).toBe("spent");
    expect(pageCaption({ ...poultice!, source: "item", mana: 0 })).toBe(
      "item act",
    );
  });

  it("colours schools like the icon frames", () => {
    for (const school of ["bloom", "accord", "clock", "hush", "storm"] as const)
      expect(SCHOOL_COLOURS[school]).toBe(ICON_FRAMES[school].colour);
  });
});
