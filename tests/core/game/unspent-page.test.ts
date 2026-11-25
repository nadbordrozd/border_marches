/**
 * The Unspent Page (CONTENT_ARTIFACTS.md): the page it keeps is chosen on
 * the map (the hero sheet's chooser runs chooseUnspentPage).
 */
import { describe, expect, it } from "vitest";
import {
  chooseUnspentPage,
  heroBattleProfile,
  holdsUnspentPage,
  unspentPageChoices,
  type GameState,
  type HeroState,
} from "../../../src/core/game/index.ts";
import { WORN_SLOTS } from "../../../src/data/artifacts.ts";
import { errorOf, field, gameOn, ok } from "./helpers.ts";

const hero = (s: GameState): HeroState =>
  s.heroes.find((h) => h.id === "hero-0")!;

/** Test surgery: the hero wears the Marvel and has these pages. */
function wearing(pages: string[], worn = true): GameState {
  const s = structuredClone(gameOn(field(3, 1), []));
  const h = hero(s);
  h.pages = pages;
  if (worn) h.worn[WORN_SLOTS.indexOf("neck")] = "the-unspent-page";
  return s;
}

describe("The Unspent Page chooser", () => {
  it("offers the battle pages of the book only", () => {
    const h = hero(wearing(["jolt", "green-road", "the-sky-falls"]));
    expect(holdsUnspentPage(h)).toBe(true);
    expect(unspentPageChoices(h)).toEqual(["jolt", "the-sky-falls"]);
    expect(holdsUnspentPage(hero(wearing(["jolt"], false)))).toBe(false);
  });

  it("keeps the highest tier page until a choice is made", () => {
    const s = wearing(["jolt", "the-sky-falls"]);
    expect(heroBattleProfile(hero(s)).unspentPage).toBe("the-sky-falls");
    const chosen = ok(chooseUnspentPage(s, "hero-0", "jolt")).state;
    expect(hero(chosen).unspentPage).toBe("jolt");
    expect(heroBattleProfile(hero(chosen)).unspentPage).toBe("jolt");
  });

  it("refuses without the Marvel, or for a page not in the book", () => {
    expect(
      errorOf(chooseUnspentPage(wearing(["jolt"], false), "hero-0", "jolt")),
    ).toBe("bad-item");
    const s = wearing(["jolt", "green-road"]);
    expect(errorOf(chooseUnspentPage(s, "hero-0", "gust"))).toBe("bad-choice");
    expect(errorOf(chooseUnspentPage(s, "hero-0", "green-road"))).toBe(
      "bad-choice",
    );
  });
});
