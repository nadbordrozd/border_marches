// The hero sheet's Army section (bead border_marches-tez): one cell per
// army slot, empty ones included, with the count and name of each stack
// and the army's fight value. No DOM library in the unit tier, so a tiny
// stand-in document covers what the section's builders touch.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ArmySlots } from "../../src/core/game/types.ts";
import { CREATURES } from "../../src/data/creatures.ts";
import type { CreatureId } from "../../src/data/types.ts";
import { armySlotViews, heroArmySection } from "../../src/ui/hero-screen.ts";
import { armyValue } from "../../src/ui/hints.ts";

class FakeElement {
  readonly tagName: string;
  readonly children: FakeElement[] = [];
  readonly style: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Array<(e: unknown) => void>>();
  private text = "";
  private classes: string[] = [];
  [prop: string]: unknown;

  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }

  get className(): string {
    return this.classes.join(" ");
  }
  set className(v: string) {
    this.classes = v.split(/\s+/).filter((c) => c !== "");
  }
  get classList() {
    return {
      add: (...c: string[]) => {
        for (const x of c) if (!this.classes.includes(x)) this.classes.push(x);
      },
      remove: (...c: string[]) => {
        this.classes = this.classes.filter((x) => !c.includes(x));
      },
      contains: (c: string) => this.classes.includes(c),
    };
  }
  get textContent(): string {
    return this.text + this.children.map((c) => c.textContent).join("");
  }
  set textContent(v: string) {
    this.text = v;
    this.children.length = 0;
  }
  append(...nodes: Array<FakeElement | string>): void {
    for (const n of nodes) {
      if (typeof n === "string") {
        const t = new FakeElement("#text");
        t.textContent = n;
        this.children.push(t);
      } else this.children.push(n);
    }
  }
  setAttribute(k: string, v: string): void {
    this.attributes.set(k, v);
  }
  getAttribute(k: string): string | null {
    return this.attributes.get(k) ?? null;
  }
  hasAttribute(k: string): boolean {
    return this.attributes.has(k);
  }
  removeAttribute(k: string): void {
    this.attributes.delete(k);
  }
  addEventListener(type: string, fn: (e: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  /** Every descendant with the class, in document order. */
  all(cls: string): FakeElement[] {
    return this.children.flatMap((c) => [
      ...(c.classList.contains(cls) ? [c] : []),
      ...c.all(cls),
    ]);
  }
  one(cls: string): FakeElement | undefined {
    return this.all(cls)[0];
  }
}

beforeAll(() => {
  vi.stubGlobal("document", {
    createElement: (tag: string) => new FakeElement(tag),
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

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

  it("renders one slot per army slot, with counts and names", () => {
    const node = heroArmySection(army) as unknown as FakeElement;
    const slots = node.all("hs-army-slot");
    expect(slots).toHaveLength(army.length);
    expect(slots.map((s) => s.getAttribute("data-slot"))).toEqual(
      army.map((_, i) => String(i)),
    );
    expect(
      slots.map((s) => s.one("gm-slot-count")?.textContent ?? null),
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
    expect(slots[0]?.one("hs-army-name")?.textContent).toBe(
      CREATURES[a].plural,
    );
    expect(slots[0]?.one("gm-slot-portrait")).toBeDefined();
    expect(slots[1]?.one("gm-slot-portrait")).toBeUndefined();
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
    slots[5]?.listeners.get("click")?.forEach((fn) => fn({}));
    slots[1]?.listeners.get("click")?.forEach((fn) => fn({}));
    expect(clicked).toEqual([5, 1]);
  });
});
