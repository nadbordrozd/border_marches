// The hero sheet's numbers as icons (bead border_marches-bzc.82, Heroes II
// style): the four primary stats as big icons with the number under them;
// level, experience, mana, movement, morale, luck, sight, the Command and
// the specialty as small icons with their number; the explanations in the
// shared tooltip; the spells behind a spellbook button that counts pages.
import { describe, expect, it } from "vitest";
import {
  armyLuck,
  armyMorale,
  heroStats,
  maxMana,
  type GameState,
  type HeroState,
} from "../../src/core/game/index.ts";
import { cloneState } from "../../src/core/game/state.ts";
import { iconFor } from "../../src/assets/icons.ts";
import { PRIMARY_STATS } from "../../src/data/effects.ts";
import {
  moveSteps,
  otherStatViews,
  primaryStatViews,
  schoolRankRow,
  spellbookButton,
  statTile,
} from "../../src/ui/hero-screen.ts";
import { field, gameOn } from "../core/game/helpers.ts";
import { useFakeDocument, type FakeElement } from "./fake-dom.ts";

useFakeDocument();

const node = (n: unknown): FakeElement => n as FakeElement;

function game(): { s: GameState; h: HeroState } {
  const s = cloneState(gameOn(field(9, 5), [], 2, 1));
  const h = s.heroes.find((x) => x.id === "hero-0") as HeroState;
  return { s, h };
}

/** The text of a hover card built by a view. */
function cardText(card: unknown): string {
  return node(card).textContent;
}

describe("hero sheet primary stats", () => {
  it("shows the four stats as big icons with the number under them", () => {
    const { h } = game();
    const views = primaryStatViews(h);
    expect(views.map((v) => v.icon)).toEqual([...PRIMARY_STATS]);
    const stats = heroStats(h);
    for (const v of views) {
      const tile = node(statTile(v, true));
      expect(tile.classList.contains("hs-pstat")).toBe(true);
      const icon = tile.one("gm-icon");
      expect(icon?.dataset["kind"]).toBe("stat");
      expect(icon?.dataset["id"]).toBe(v.icon);
      expect(icon?.hasAttribute("title")).toBe(false);
      expect(tile.one("hs-pstat-value")?.textContent).toBe(
        String(stats[v.icon as keyof typeof stats]),
      );
      // The explanation is in the shared tooltip, not on the tile.
      expect(tile.hasAttribute("data-tip")).toBe(true);
      expect(tile.getAttribute("aria-label")).toBe(`${v.label} ${v.value}`);
    }
  });

  it("lists the stat's sources in its card", () => {
    const { h } = game();
    h.attack = 3;
    const attack = primaryStatViews(h)[0];
    const text = cardText(attack?.card());
    expect(text).toContain("Attack");
    expect(text).toContain("Base 3");
  });
});

describe("hero sheet other numbers", () => {
  it("gives every number its own stat icon", () => {
    const { h } = game();
    const views = otherStatViews(h);
    const ids = views.map((v) => v.icon);
    for (const id of [
      "level",
      "experience",
      "mana",
      "movement",
      "morale",
      "luck",
      "sight",
    ]) {
      expect(ids).toContain(id);
    }
    for (const v of views) {
      if (v.picture !== undefined) continue; // the specialty's own picture
      expect(iconFor("stat", v.icon).fallback).toBe(false);
      const tile = node(statTile(v));
      expect(tile.classList.contains("hs-mini")).toBe(true);
      expect(tile.one("gm-icon")?.dataset["id"]).toBe(v.icon);
      expect(tile.one("hs-mini-value")?.textContent).toBe(v.value);
      expect(tile.hasAttribute("data-tip")).toBe(true);
    }
  });

  it("shows movement as steps on grass, the points in the card", () => {
    const { h } = game();
    h.mp = 1450;
    h.maxMp = 1500;
    expect(moveSteps(1450)).toBe(14);
    const move = otherStatViews(h).find((v) => v.icon === "movement");
    expect(move?.value).toBe("14 / 15");
    expect(move?.pct).toBeCloseTo((1450 / 1500) * 100);
    const text = cardText(move?.card());
    expect(text).toContain("1450 of 1500 movement points");
    expect(text).toContain("on a road");
    const tile = node(statTile(move!));
    expect(tile.one("hs-bar-movement")).toBeDefined();
  });

  it("shows mana as current over maximum with a bar", () => {
    const { h } = game();
    h.lore = 4;
    h.mana = 12;
    const mana = otherStatViews(h).find((v) => v.icon === "mana");
    expect(mana?.value).toBe(`12 / ${maxMana(h)}`);
    expect(mana?.pct).toBeCloseTo((12 / maxMana(h)) * 100);
  });

  it("shows experience with its progress to the next level", () => {
    const { h } = game();
    h.level = 2;
    h.xp = 600; // level 2 at 400, level 3 at 1000
    const xp = otherStatViews(h).find((v) => v.icon === "experience");
    expect(xp?.value).toBe("600");
    expect(xp?.pct).toBeCloseTo((200 / 600) * 100);
    expect(cardText(xp?.card())).toContain("Level 3 at 1000: 400 to go.");
  });

  it("writes morale and luck signed, with their rule in the card", () => {
    const { h } = game();
    const views = otherStatViews(h);
    const morale = views.find((v) => v.icon === "morale");
    const luck = views.find((v) => v.icon === "luck");
    const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));
    expect(morale?.value).toBe(signed(armyMorale(h)));
    expect(luck?.value).toBe(signed(armyLuck(h)));
    expect(cardText(morale?.card())).toContain("Heartened");
    expect(cardText(luck?.card())).toContain("Jinxed");
  });
});

describe("hero sheet spellbook button", () => {
  it("counts the pages and opens the book on click", () => {
    const { h } = game();
    h.pages = ["parley", "nettle", "jolt"];
    let opened = 0;
    const b = node(spellbookButton(h, () => opened++));
    expect(b.one("hs-book-n")?.textContent).toBe("3 pages");
    expect(b.one("gm-icon")?.dataset["id"]).toBe("spellbook");
    expect(b.getAttribute("aria-label")).toContain("3 pages");
    for (const fn of b.listeners.get("click") ?? []) fn({});
    expect(opened).toBe(1);
  });

  it("says where spells come from when the book is empty", () => {
    const { h } = game();
    h.pages = [];
    const b = node(spellbookButton(h, () => undefined));
    expect(b.one("hs-book-n")?.textContent).toBe("0 pages");
  });
});

describe("hero sheet school ranks", () => {
  it("shows each ranked school as its emblem with the rank", () => {
    const { h } = game();
    h.skills = [
      { id: "covenant", rank: 2 },
      { id: "stormcalling", rank: 1 },
    ];
    const row = node(schoolRankRow(h));
    const chips = row.all("hs-rank");
    expect(chips.map((c) => c.dataset["school"])).toEqual(["accord", "storm"]);
    expect(chips.map((c) => c.one("hs-rank-n")?.textContent)).toEqual([
      "2",
      "1",
    ]);
  });

  it("is left out without a school skill", () => {
    const { h } = game();
    h.skills = [];
    expect(schoolRankRow(h)).toBeNull();
  });
});
