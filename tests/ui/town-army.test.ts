// The town's army rows, dwellings strip and recruit dialog (bead
// border_marches-bzc.61, UI2-10): garrison over visiting hero as two army
// bands of the hero sheet's kind, slot for slot; stacks move between them
// by click (pick up, put down) or by drag, shift moving half; the faction's
// dwellings in tier order, locked until built; the recruit dialog's four
// boxes. No DOM library in the unit tier: tests/ui/fake-dom.ts.
import { describe, expect, it } from "vitest";
import { build, transferStack } from "../../src/core/game/index.ts";
import type {
  GameState,
  RecruitAllPlan,
  SlotRef,
} from "../../src/core/game/index.ts";
import { newGame } from "../../src/core/game/newGame.ts";
import type { ArmySlots, TownState } from "../../src/core/game/types.ts";
import { getCreature } from "../../src/data/creatures.ts";
import { FACTIONS, buildingDef, townTree } from "../../src/data/factions.ts";
import type { CreatureId, FactionId } from "../../src/data/types.ts";
import { townArmyMove } from "../../src/ui/army.ts";
import {
  armyBand,
  armySlotHint,
  armySlotViews,
} from "../../src/ui/hero-screen.ts";
import {
  daysToGrowth,
  dwellingStrip,
  growthNote,
  RECRUIT_ALL_BLOCKED,
  recruitAllSummary,
  recruitQuote,
} from "../../src/ui/town-dwellings.ts";
import { hallLayout } from "../../src/ui/town-hall.ts";
import { buildMap, field, heroStart, ok, town } from "../core/game/helpers.ts";
import { useFakeDocument, type FakeElement } from "./fake-dom.ts";

useFakeDocument();

const WITH_TOWNS = FACTIONS.filter((f) => f.town !== null);
const node = (n: unknown): FakeElement => n as FakeElement;

const squire = "squire" as CreatureId;
const archer = "longbowman" as CreatureId;
const garrison: ArmySlots = [
  { creature: squire, count: 24 },
  null,
  { creature: archer, count: 9 },
  null,
  null,
  null,
  { creature: squire, count: 1 },
];
const heroArmy: ArmySlots = [
  { creature: archer, count: 5 },
  null,
  null,
  null,
  null,
  null,
  null,
];
const G = (slot: number): SlotRef => ({ army: "garrison", slot });
const H = (slot: number): SlotRef => ({ army: "hero", slot });

describe("townArmyMove", () => {
  const both = { garrison, hero: heroArmy };

  it("moves the whole stack between the rows and within one", () => {
    expect(townArmyMove(both, G(0), H(1), false)).toEqual({
      from: G(0),
      to: H(1),
    });
    expect(townArmyMove(both, H(0), G(2), false)).toEqual({
      from: H(0),
      to: G(2),
    });
    expect(townArmyMove(both, G(0), G(3), false)).toEqual({
      from: G(0),
      to: G(3),
    });
  });

  it("moves half with shift, and nothing for half of one creature", () => {
    expect(townArmyMove(both, G(0), H(3), true)).toEqual({
      from: G(0),
      to: H(3),
      count: 12,
    });
    expect(townArmyMove(both, G(2), H(3), true)?.count).toBe(4);
    expect(townArmyMove(both, G(6), H(3), true)).toBeNull();
  });

  it("does nothing on the same slot, from an empty slot or with no hero", () => {
    expect(townArmyMove(both, G(0), G(0), false)).toBeNull();
    expect(townArmyMove(both, G(1), H(1), false)).toBeNull();
    expect(townArmyMove({ garrison }, G(0), H(1), false)).toBeNull();
    expect(townArmyMove({ garrison }, H(0), G(1), false)).toBeNull();
    expect(townArmyMove({ garrison }, G(0), G(1), false)).toEqual({
      from: G(0),
      to: G(1),
    });
  });

  it("is a move the core accepts: garrison to the visiting hero", () => {
    const map = buildMap(field(6, 6), [
      town("t0", 2, 2, 0),
      heroStart(2, 3, 0),
      town("t1", 5, 5, 1),
      heroStart(5, 4, 1),
    ]);
    const s0 = newGame(map, {
      players: [
        { kind: "human", faction: "humans" },
        { kind: "ai", faction: "goblins" },
      ],
    });
    const hero = s0.heroes.find((h) => h.owner === 0)!;
    const t0 = s0.towns["t0"]!;
    const s: GameState = {
      ...s0,
      towns: { ...s0.towns, t0: { ...t0, garrison: [...garrison] } },
      // The hero stands in the town gate.
      heroes: s0.heroes.map((h) =>
        h.id === hero.id ? { ...h, x: 2, y: 2, army: [...heroArmy] } : h,
      ),
    };
    const plan = townArmyMove(
      { garrison: s.towns["t0"]!.garrison, hero: heroArmy },
      G(0),
      H(1),
      true,
    )!;
    const next = ok(
      transferStack(s, { heroId: hero.id, townId: "t0", ...plan }),
    ).state;
    expect(next.towns["t0"]!.garrison[0]).toEqual({
      creature: squire,
      count: 12,
    });
    expect(next.heroes.find((h) => h.id === hero.id)!.army[1]).toEqual({
      creature: squire,
      count: 12,
    });
  });
});

describe("the two army rows", () => {
  it("draw seven slots each, in the same order, so they line up", () => {
    const top = node(armyBand(garrison, { onSlot: () => {} }));
    const bottom = node(armyBand(heroArmy, { onSlot: () => {} }));
    const vacant = node(armyBand(garrison.map(() => null)));
    for (const row of [top, bottom, vacant]) {
      const slots = row.all("hs-army-slot");
      expect(slots.map((s) => s.getAttribute("data-slot"))).toEqual([
        "0",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
      ]);
    }
    // No captions: the battle sprite and the count only.
    expect(top.textContent).not.toMatch(/Squire|Longbow/);
    // The empty visitor row takes no clicks.
    for (const s of vacant.all("hs-army-slot"))
      expect(s.listeners.has("click")).toBe(false);
  });

  it("marks every slot of the other row as a target while a stack is picked", () => {
    const picked = armySlotViews(garrison)[0]!;
    const row = node(
      armyBand(heroArmy, { pickedElsewhere: picked, onSlot: () => {} }),
    );
    const slots = row.all("hs-army-slot");
    expect(slots.every((s) => s.classList.contains("hs-army-target"))).toBe(
      true,
    );
    expect(slots.some((s) => s.classList.contains("hs-selected"))).toBe(false);
  });

  it("tells in each slot's card what a click does across the rows", () => {
    const views = armySlotViews(heroArmy);
    const squires = armySlotViews(garrison)[0]!;
    const archers = armySlotViews(garrison)[2]!;
    expect(armySlotHint(views, null, 1, squires)).toContain(
      "move the picked stack",
    );
    expect(armySlotHint(views, null, 0, archers)).toContain("merge");
    expect(armySlotHint(views, null, 0, squires)).toContain("swap");
    // An empty slot picked elsewhere is nothing to put down.
    expect(armySlotHint(views, null, 0, armySlotViews(garrison)[1]!)).toBe(
      null,
    );
    // Without a stack picked elsewhere the hero sheet's hints stand.
    expect(armySlotHint(views, null, 0)).toContain("pick this stack up");
    expect(armySlotHint(views, 0, 0)).toContain("put it back");
  });
});

describe("dwellingStrip", () => {
  function start(faction: FactionId): GameState {
    const map = buildMap(field(10, 10), [
      town("t0", 1, 1, 0),
      heroStart(1, 2, 0),
      town("t1", 8, 8, 1),
      heroStart(8, 7, 1),
    ]);
    const s = newGame(map, {
      players: [
        { kind: "human", faction },
        { kind: "ai", faction: faction === "goblins" ? "humans" : "goblins" },
      ],
    });
    return {
      ...s,
      players: s.players.map((p) =>
        p.id === 0
          ? { ...p, resources: { gold: 50000, wood: 99, ore: 99, essence: 99 } }
          : p,
      ),
    };
  }

  it.each(WITH_TOWNS.map((f) => [f.id]))(
    "lists every %s dwelling in tier order, locked until built",
    (faction) => {
      const s = start(faction);
      const t = s.towns["t0"]!;
      const strip = dwellingStrip(t);
      const heads = hallLayout(townTree(faction)!).dwellings.map(
        (c) => c.buildings[0],
      );
      expect(strip.map((d) => d.building)).toEqual(heads);
      const tiers = strip.map((d) => d.tier);
      expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
      for (const d of strip) {
        expect(d.built).toBe(t.buildings.includes(d.building));
        expect(buildingDef(faction, d.building)?.dwelling).toBe(d.creature);
        expect(d.growth).toBe(getCreature(d.creature).growth);
        if (!d.built) expect(d.available).toBe(0);
      }
    },
  );

  it("opens a dwelling with a week's growth once it is built", () => {
    const s = start("humans");
    const first = dwellingStrip(s.towns["t0"]!).find((d) => !d.built)!;
    const def = buildingDef("humans", first.building)!;
    let next = s;
    for (const need of def.requires) {
      if (!next.towns["t0"]!.buildings.includes(need)) {
        next = ok(build(next, "t0", need)).state;
        next = { ...next, towns: { ...next.towns } };
        next.towns["t0"] = { ...next.towns["t0"]!, builtToday: false };
      }
    }
    next = ok(build(next, "t0", first.building)).state;
    const after = dwellingStrip(next.towns["t0"]!).find(
      (d) => d.building === first.building,
    )!;
    expect(after.built).toBe(true);
    expect(after.available).toBe(getCreature(first.creature).growth);
  });

  it("counts the +50% growth of a growth building", () => {
    const s = start("humans");
    const tree = townTree("humans")!;
    const bonus = tree.order.find(
      (b) => buildingDef("humans", b)?.growthBonus === true,
    )!;
    const t: TownState = {
      ...s.towns["t0"]!,
      buildings: [...s.towns["t0"]!.buildings, bonus],
    };
    for (const d of dwellingStrip(t)) {
      expect(d.growth).toBe(
        Math.floor((3 * getCreature(d.creature).growth) / 2),
      );
    }
  });

  it.each(WITH_TOWNS.map((f) => [f.id]))(
    "fits the %s hall's two halves of three columns",
    (faction) => {
      const layout = hallLayout(townTree(faction)!);
      expect(layout.dwellings.length).toBeLessThanOrEqual(6);
      for (const g of layout.groups)
        expect(g.buildings.length).toBeLessThanOrEqual(6);
    },
  );

  it("is empty for a town with no tree", () => {
    const s = start("humans");
    const t: TownState = { ...s.towns["t0"]!, faction: "neutral" as FactionId };
    expect(dwellingStrip(t)).toEqual([]);
  });

  it("says when the dwellings grow next", () => {
    expect(daysToGrowth(1)).toBe(7);
    expect(daysToGrowth(7)).toBe(1);
    expect(daysToGrowth(8)).toBe(7);
    expect(daysToGrowth(10)).toBe(5);
    expect(growthNote(7)).toBe("New creatures arrive tomorrow.");
    expect(growthNote(3)).toBe("New creatures arrive in 5 days.");
  });
});

describe("recruitQuote: the four boxes", () => {
  const cost = getCreature(squire).cost;
  const gold = cost.gold ?? 0;
  const purse = (g: number) => ({ gold: g, wood: 0, ore: 0, essence: 0 });

  it("gives cost each, available, to recruit and total", () => {
    const q = recruitQuote(squire, 28, purse(gold * 100));
    expect(q.each).toEqual(cost);
    expect(q.available).toBe(28);
    expect(q.max).toBe(28);
    expect(q.count).toBe(28);
    expect(q.total.gold).toBe(gold * 28);
    expect(q.reason).toBeNull();
    const some = recruitQuote(squire, 28, purse(gold * 100), 5);
    expect(some.count).toBe(5);
    expect(some.total.gold).toBe(gold * 5);
  });

  it("caps the count at what the purse buys and the dwelling holds", () => {
    expect(recruitQuote(squire, 28, purse(gold * 3 + 1)).max).toBe(3);
    expect(recruitQuote(squire, 28, purse(gold * 3), 10).count).toBe(3);
    expect(recruitQuote(squire, 2, purse(gold * 100), 10).count).toBe(2);
    expect(recruitQuote(squire, 28, purse(gold * 100), -4).count).toBe(0);
  });

  it("says why none can be recruited", () => {
    expect(recruitQuote(squire, 0, purse(gold * 100)).reason).toMatch(
      /None left this week/,
    );
    const poor = recruitQuote(squire, 10, purse(gold - 1));
    expect(poor.max).toBe(0);
    expect(poor.reason).toBe("Not enough gold for one.");
  });
});

describe("recruit all: the toast and the greyed button (bead bzc.104)", () => {
  const plan = (
    steps: Array<{ creature: string; count: number }>,
  ): RecruitAllPlan => ({
    steps: steps.map((s) => ({
      creature: s.creature as CreatureId,
      count: s.count,
      to: "garrison",
    })),
    cost: { gold: 0, wood: 0, ore: 0, essence: 0 },
    blocked: steps.length === 0 ? "no-stock" : null,
  });

  it("lists what was bought, highest tier first, singular for one", () => {
    expect(
      recruitAllSummary(
        plan([
          { creature: "t-rex", count: 1 },
          { creature: "raptor", count: 3 },
          { creature: "caveman", count: 14 },
        ]),
      ),
    ).toBe("Recruited 1 T-Rex, 3 Raptors and 14 Cavemen.");
    expect(recruitAllSummary(plan([{ creature: "raptor", count: 1 }]))).toBe(
      "Recruited 1 Raptor.",
    );
    expect(recruitAllSummary(plan([]))).toBe("Nothing recruited.");
  });

  it("says why nothing can be bought", () => {
    expect(RECRUIT_ALL_BLOCKED.resources).toMatch(/not enough resources/);
    expect(RECRUIT_ALL_BLOCKED["army-full"]).toMatch(/no free slot/);
  });
});
