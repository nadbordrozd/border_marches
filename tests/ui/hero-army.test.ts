// The hero sheet's Army section (beads border_marches-tez, bzc.45): one
// cell per army slot, empty ones included, each stack as its full battle
// sprite on the ground line with its count and no caption, and the army's
// fight value. No DOM library in the unit tier: tests/ui/fake-dom.ts.
import { describe, expect, it } from "vitest";
import type { ArmySlots } from "../../src/core/game/types.ts";
import { CREATURES } from "../../src/data/creatures.ts";
import type { CreatureId } from "../../src/data/types.ts";
import { unitArt } from "../../src/assets/unit-art.ts";
import {
  ARMY_GROUND_Y,
  armySlotViews,
  heroArmySection,
} from "../../src/ui/hero-screen.ts";
import { armyValue } from "../../src/ui/hints.ts";
import { useFakeDocument, type FakeElement } from "./fake-dom.ts";

useFakeDocument();

const ids = Object.keys(CREATURES) as CreatureId[];
const [a, b, c] = [ids[0], ids[3], ids[6]] as [
  CreatureId,
  CreatureId,
  CreatureId,
];
/** A mixed army: three stacks (one of a single creature), four gaps. */
const army: ArmySlots = [
  { creature: a, count: 24 },
  null,
  { creature: b, count: 1 },
  null,
  null,
  { creature: c, count: 7 },
  null,
];

describe("hero sheet army section", () => {
  it("lists every slot with the creature, name and count", () => {
    const views = armySlotViews(army);
    expect(views.map((v) => v.count)).toEqual([24, 0, 1, 0, 0, 7, 0]);
    expect(views.map((v) => v.creature)).toEqual([
      a,
      null,
      b,
      null,
      null,
      c,
      null,
    ]);
    expect(views[0]?.name).toBe(CREATURES[a].plural);
    expect(views[2]?.name).toBe(CREATURES[b].name);
    expect(views[1]?.name).toBe("");
  });

  it("renders one slot per army slot: battle sprite and count, no names", () => {
    const node = heroArmySection(army) as unknown as FakeElement;
    const slots = node.all("hs-army-slot");
    expect(slots).toHaveLength(army.length);
    expect(slots.map((s) => s.getAttribute("data-slot"))).toEqual(
      army.map((_, i) => String(i)),
    );
    expect(
      slots.map((s) => s.one("hs-army-count")?.textContent ?? null),
    ).toEqual(["24", null, "1", null, null, "7", null]);
    expect(slots.map((s) => s.classList.contains("hs-army-empty"))).toEqual([
      false,
      true,
      false,
      true,
      true,
      false,
      true,
    ]);
    // The full battle sprite (not the portrait) at native size, no caption.
    const sprite = slots[0]?.one("hs-army-sprite");
    const art = unitArt(a);
    expect(sprite).toBeDefined();
    expect(sprite?.width).toBe(art.w);
    expect(sprite?.height).toBe(art.h);
    expect(slots[0]?.one("gm-slot-portrait")).toBeUndefined();
    expect(node.all("hs-army-name")).toHaveLength(0);
    expect(slots[0]?.one("hs-army-shadow")).toBeDefined();
    expect(slots[1]?.one("hs-army-sprite")).toBeUndefined();
    expect(slots[1]?.one("hs-army-spot")).toBeDefined();
    // The slot's only text is the count; the name is for screen readers.
    expect(slots[0]?.textContent).toBe("24");
    expect(slots[1]?.textContent).toBe("");
    expect(slots[0]?.getAttribute("aria-label")).toBe(
      `24 ${CREATURES[a].plural}`,
    );
    // Filled slots carry the creature card on hover (setTip marks them).
    expect(slots[0]?.hasAttribute("data-tip")).toBe(true);
    expect(slots[1]?.hasAttribute("data-tip")).toBe(false);
    expect(node.textContent).toContain("Army (3 / 7)");
    expect(node.textContent).toContain(`Fight value ${armyValue(army)}`);
    expect(armyValue(army)).toBe(
      CREATURES[a].fightValue * 24 +
        CREATURES[b].fightValue +
        CREATURES[c].fightValue * 7,
    );
  });

  it("stands every sprite's feet on the ground line, big ones included", () => {
    const big = ids.filter((id) => unitArt(id).h > 88);
    expect(big.length).toBeGreaterThan(0);
    const node = heroArmySection(
      big.slice(0, 7).map((creature) => ({ creature, count: 2 })),
    ) as unknown as FakeElement;
    for (const [i, s] of node.all("hs-army-slot").entries()) {
      const art = unitArt(big[i] as CreatureId);
      const sprite = s.one("hs-army-sprite");
      const top = Number.parseInt(String(sprite?.style.top), 10);
      expect(top + art.feet.contactY).toBe(ARMY_GROUND_Y);
      // The whole sprite fits in the slot: nothing cut off at the top.
      expect(top).toBeGreaterThanOrEqual(0);
      expect(sprite?.style.left).toBe(`calc(50% - ${art.anchor.x}px)`);
    }
  });

  it("is read-only without a handler and clickable with one", () => {
    const still = heroArmySection(army) as unknown as FakeElement;
    for (const s of still.all("hs-army-slot")) {
      expect(s.listeners.has("click")).toBe(false);
    }
    const clicked: number[] = [];
    const live = heroArmySection(army, {
      selected: 2,
      onSlot: (slot) => clicked.push(slot),
    }) as unknown as FakeElement;
    const slots = live.all("hs-army-slot");
    expect(slots[2]?.classList.contains("hs-selected")).toBe(true);
    // With a stack picked, every other slot is marked as a place for it.
    expect(slots.map((s) => s.classList.contains("hs-army-target"))).toEqual([
      true,
      true,
      false,
      true,
      true,
      true,
      true,
    ]);
    slots[5]?.listeners.get("click")?.forEach((fn) => fn({}));
    slots[1]?.listeners.get("click")?.forEach((fn) => fn({}));
    expect(clicked).toEqual([5, 1]);
  });
});
