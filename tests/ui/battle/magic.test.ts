/**
 * The battle spellbook's logic (src/ui/battle/magic.ts): page states, the
 * targeting steps, Echo and Fuel options with what they do, and the exact
 * rehearsed chain of a cast.
 */

import { describe, expect, it } from "vitest";
import { applyAction } from "../../../src/core/battle/index.ts";
import {
  castAction,
  castPreview,
  echoOptions,
  fuelOptions,
  heroBook,
  heroSideNow,
  nextStep,
  spellAreaHexes,
  stepPrompt,
} from "../../../src/ui/battle/magic.ts";
import { S, battle, cast, withConditions } from "../../core/magic/helpers.ts";

const field = (magic = {}) =>
  battle({
    mine: [{ hex: { col: 1, row: 5 } }, { hex: { col: 1, row: 6 } }],
    theirs: [{ hex: { col: 8, row: 5 } }, { hex: { col: 8, row: 6 } }],
    magic,
  });

describe("the battle spellbook", () => {
  it("lists pages by school and tier with mana and Power, scrolls last", () => {
    const s = field({
      pages: ["jolt", "regrow", "nettle"],
      scrolls: ["wind", "wind"],
    });
    const book = heroBook(s, "attacker");
    expect(
      book.map((e) => [e.id, e.source, e.mana, e.power, e.status]),
    ).toEqual([
      ["nettle", "page", 4, 2, "ready"],
      ["regrow", "page", 8, 2, "ready"],
      ["jolt", "page", 4, 2, "ready"],
      ["wind", "scroll", 0, 2, "ready"],
    ]);
    expect(book[3]?.count).toBe(2);
    expect(book[2]?.text).toBe("Deal 40 Harm to a stack.");
  });

  it("greys spent pages, unaffordable pages and pages after the round's cast", () => {
    const s0 = field({ pages: ["jolt", "deadline"], mana: 10 });
    expect(
      heroBook(s0, "attacker").find((e) => e.id === "deadline"),
    ).toMatchObject({
      status: "mana",
      reason: "Needs 14 mana (10 left)",
    });
    const s1 = cast(s0, "jolt", [S("d0")]).state;
    const book = heroBook(s1, "attacker");
    expect(book.find((e) => e.id === "jolt")).toMatchObject({
      status: "spent",
      reason: "Spent for this battle",
    });
  });

  it("knows whose turn lets the player cast", () => {
    const s = field();
    expect(heroSideNow(s, new Set(["attacker"]))).toBe("attacker");
    expect(heroSideNow(s, new Set(["defender"]))).toBeNull();
  });
});

describe("targeting", () => {
  it("walks the steps of each target rule", () => {
    expect(nextStep("jolt", [])).toBe("stack");
    expect(nextStep("jolt", [S("d0")])).toBeNull();
    expect(nextStep("gust", [S("d0")])).toBe("hex");
    expect(nextStep("wind", [{ stack: "d0", condition: 1 }])).toBe("choice");
    expect(nextStep("orchard-day", [])).toBeNull();
    expect(stepPrompt("leech-line", [])).toBe("Choose the enemy stack.");
  });

  it("shows an area spell's hexes", () => {
    expect(spellAreaHexes("broadside", { col: 7, row: 5 })).toHaveLength(7);
    expect(spellAreaHexes("whiteout", { col: 7, row: 5 })).toHaveLength(19);
    expect(spellAreaHexes("jolt", { col: 7, row: 5 })).toHaveLength(1);
  });
});

describe("Echo and Fuel options", () => {
  it("offers allied conditions to Echo and opposed ones to burn, with the effect", () => {
    const s = withConditions(field(), "d0", [
      { kind: "venomed", size: 2, clock: 2 },
      { kind: "shielded", size: 2, clock: 3 },
    ]);
    expect(echoOptions(s, "jolt", [S("d0")])).toMatchObject([
      {
        label: "Venomed on Pikeman",
        effect: "Echo: Venomed lasts 2 → 3 rounds",
      },
    ]);
    expect(fuelOptions(s, "jolt", [S("d0")])).toMatchObject([
      {
        label: "Shielded on Pikeman",
        effect: "Fuel: burn Shielded on Pikeman; the Harm is doubled",
      },
    ]);
    expect(fuelOptions(s, "hush-now", [S("d0")])).toEqual([]);
  });
});

describe("the cast preview", () => {
  it("is the exact rehearsed chain, and the cast applies it", () => {
    const s = withConditions(field(), "d0", [
      { kind: "shielded", size: 2, clock: 3 },
    ]);
    const entry = { id: "jolt", source: "page" as const };
    const action = castAction(s, entry, [S("d0")], {
      fuel: {
        stack: "d0",
        condition: s.stacks.find((x) => x.id === "d0")!.conditions[0]!.uid,
      },
    });
    const p = castPreview(s, action);
    expect(p.legal).toBe(true);
    expect(p.summary).toEqual(["Pikeman: −80 HP, 8 killed, −Shielded"]);
    expect(p.lines).toEqual([
      "Shielded on Pikeman ends",
      "Pikeman take 80 Harm, 8 killed",
    ]);
    const after = applyAction(s, action).state;
    expect(after.stacks.find((x) => x.id === "d0")?.count).toBe(2);
  });

  it("names the refusal of an illegal cast", () => {
    const s = field({ mana: 1 });
    const p = castPreview(
      s,
      castAction(s, { id: "jolt", source: "page" }, [S("d0")]),
    );
    expect(p).toMatchObject({
      legal: false,
      message: "needs 4 mana, the hero has 1",
    });
  });

  it("reports summoned stacks", () => {
    const s = field();
    const p = castPreview(
      s,
      castAction(s, { id: "sprout", source: "page" }, [
        { hex: { col: 4, row: 5 } },
      ]),
    );
    expect(p.summary).toContain("Seedling ×10 join the battle");
  });
});
