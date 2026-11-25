// The meeting of two heroes as two mirrored columns (bead
// border_marches-bzc.64, UI2-14): stacks move between the two army bands
// as in the town (armyMove), "Swap armies" swaps them slot for slot through
// the core's transferStack without ever leaving a hero empty, and "All
// items" hands every item and scroll over through handOver. Hand-built
// states only.
import { describe, expect, it } from "vitest";
import {
  cloneState,
  transferStack,
  type GameState,
  type HeroState,
  type SlotRef,
} from "../../src/core/game/index.ts";
import type { ArmySlots } from "../../src/core/game/types.ts";
import type { CreatureId } from "../../src/data/types.ts";
import { armyMove, swapArmiesPlan } from "../../src/ui/army.ts";
import { giveAllItems, itemCount, swapArmies } from "../../src/ui/meeting.ts";
import { errorOf, field, gameOn, ok } from "../core/game/helpers.ts";

const squire = "squire" as CreatureId;
const archer = "longbowman" as CreatureId;
const titan = "tin-titan" as CreatureId;
const H = (slot: number): SlotRef => ({ army: "hero", slot });
const O = (slot: number): SlotRef => ({ army: "other", slot });
const empty = (): ArmySlots => [null, null, null, null, null, null, null];
const army = (...stacks: Array<[number, CreatureId, number]>): ArmySlots => {
  const a = empty();
  for (const [slot, creature, count] of stacks) a[slot] = { creature, count };
  return a;
};

/** Two own heroes side by side: "hero-0" at (1, 1), "hero-x" at (2, 1). */
function two(a: ArmySlots, b: ArmySlots): GameState {
  const s = cloneState(gameOn(field(8, 3), []));
  const h = s.heroes[0]!;
  h.defId = "nobody";
  h.x = 1;
  h.y = 1;
  h.army = a;
  h.worn = h.worn.map(() => null);
  h.backpack = [];
  h.scrolls = [];
  const o = structuredClone(h);
  o.id = "hero-x";
  o.x = 2;
  o.army = b;
  s.heroes.push(o);
  return s;
}

const heroOf = (s: GameState, id: string): HeroState =>
  s.heroes.find((h) => h.id === id)!;

/** Swaps through the core and checks both armies traded places. */
function expectSwapped(a: ArmySlots, b: ArmySlots): void {
  const s = two(a, b);
  const next = ok(swapArmies(s, "hero-0", "hero-x")).state;
  expect(heroOf(next, "hero-0").army).toEqual(b);
  expect(heroOf(next, "hero-x").army).toEqual(a);
}

describe("armyMove (the town's rule for any two armies)", () => {
  const armies = {
    hero: army([0, squire, 9]),
    other: army([2, archer, 1]),
  };

  it("moves a whole stack, or half with shift, between the heroes", () => {
    expect(armyMove(armies, H(0), O(3), false)).toEqual({
      from: H(0),
      to: O(3),
    });
    expect(armyMove(armies, H(0), O(3), true)).toEqual({
      from: H(0),
      to: O(3),
      count: 4,
    });
  });

  it("does nothing for the same slot, an empty slot or half of one", () => {
    expect(armyMove(armies, H(0), H(0), false)).toBeNull();
    expect(armyMove(armies, H(1), O(1), false)).toBeNull();
    expect(armyMove(armies, O(2), H(1), true)).toBeNull();
    expect(armyMove({ hero: armies.hero }, H(0), O(1), false)).toBeNull();
  });
});

describe("Swap armies", () => {
  it("swaps different creatures and evens out the same creature", () => {
    expectSwapped(
      army([0, squire, 12], [1, archer, 5], [3, squire, 2]),
      army([0, archer, 3], [1, archer, 9], [3, squire, 2]),
    );
  });

  it("moves stacks only one hero has, both ways", () => {
    expectSwapped(
      army([0, squire, 12], [4, archer, 5]),
      army([0, archer, 3], [6, squire, 1]),
    );
  });

  it("never leaves a hero empty when no slot is shared", () => {
    // Every single move would empty a hero; the swap goes across slots.
    expectSwapped(army([0, squire, 1]), army([1, archer, 1]));
    expectSwapped(
      army([0, squire, 4], [2, archer, 2]),
      army([5, archer, 7], [6, squire, 1]),
    );
    // The same creature in different slots: moves, then the difference.
    expectSwapped(army([0, squire, 1]), army([3, squire, 6]));
    expectSwapped(army([0, squire, 6]), army([3, squire, 1]));
  });

  it("plans nothing for equal armies", () => {
    const a = army([0, squire, 3], [2, archer, 1]);
    expect(swapArmiesPlan(a, a)).toEqual([]);
  });

  it("keeps every core rule: a vow's barred creature stops the swap", () => {
    const s = two(army([0, squire, 5]), army([0, titan, 1]));
    heroOf(s, "hero-0").feats.push("vow-of-flesh-and-blood");
    expect(errorOf(swapArmies(s, "hero-0", "hero-x"))).toBe("vow");
    const far = two(army([0, squire, 5]), army([0, archer, 1]));
    heroOf(far, "hero-x").x = 5;
    expect(errorOf(swapArmies(far, "hero-0", "hero-x"))).toBe("not-adjacent");
  });

  it("is the same move the core's transferStack makes for a click", () => {
    const s = two(army([0, squire, 9]), army([2, archer, 1]));
    const plan = armyMove(
      { hero: heroOf(s, "hero-0").army, other: heroOf(s, "hero-x").army },
      H(0),
      O(2),
      false,
    )!;
    const next = ok(
      transferStack(s, { heroId: "hero-0", otherHeroId: "hero-x", ...plan }),
    ).state;
    expect(heroOf(next, "hero-0").army[0]).toEqual({
      creature: archer,
      count: 1,
    });
    // The last creature rule still holds for a single stack.
    const last = armyMove(
      { hero: heroOf(s, "hero-0").army, other: heroOf(s, "hero-x").army },
      O(2),
      H(3),
      false,
    )!;
    expect(
      errorOf(
        transferStack(s, { heroId: "hero-0", otherHeroId: "hero-x", ...last }),
      ),
    ).toBe("hero-needs-army");
  });
});

describe("All items", () => {
  it("hands over worn items, the backpack and scrolls; cursed ones stay", () => {
    const s = two(army([0, squire, 1]), army([0, squire, 1]));
    const a = heroOf(s, "hero-0");
    a.worn[0] = "thinking-cap";
    a.worn[1] = "the-albatross";
    a.backpack = ["tin-sabre", "tin-sabre"];
    a.scrolls = ["jolt"];
    expect(itemCount(a)).toBe(5);
    const out = giveAllItems(s, "hero-0", "hero-x");
    expect(out.given).toBe(4);
    expect(out.kept).toBe(1);
    const next = ok(out.result).state;
    const b = heroOf(next, "hero-x");
    expect(b.backpack).toEqual(["thinking-cap", "tin-sabre", "tin-sabre"]);
    expect(b.scrolls).toEqual(["jolt"]);
    const left = heroOf(next, "hero-0");
    expect(left.worn.filter((w) => w !== null)).toEqual(["the-albatross"]);
    expect(left.backpack).toEqual([]);
    expect(left.scrolls).toEqual([]);
  });

  it("keeps what does not fit and fails when nothing can go", () => {
    const s = two(army([0, squire, 1]), army([0, squire, 1]));
    heroOf(s, "hero-0").backpack = ["tin-sabre"];
    heroOf(s, "hero-x").backpack = Array.from(
      { length: 12 },
      () => "tin-sabre",
    );
    const full = giveAllItems(s, "hero-0", "hero-x");
    expect(full.given).toBe(0);
    expect(errorOf(full.result)).toBe("backpack-full");
    // The other way 11 fit beside the one sabre; the twelfth stays.
    const back = giveAllItems(s, "hero-x", "hero-0");
    expect(back.given).toBe(11);
    expect(back.kept).toBe(1);
    expect(heroOf(ok(back.result).state, "hero-x").backpack).toHaveLength(1);
    expect(
      errorOf(giveAllItems(two(empty(), empty()), "hero-0", "hero-x").result),
    ).toBe("empty-slot");
  });
});
