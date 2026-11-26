// Inspecting artifacts, skills and spells (bead border_marches-bzc.108):
// a backpack item picked on the hero sheet lights the doll slots it goes
// in (fits, swap, barred, off); and every dialog that shows an artifact
// found, won or bought, or a skill or spell gained or offered, carries it
// as an inspectable card built by the inventory's, hero sheet's or
// spellbook's own card builder. Small hand-built states, real visits.
import { describe, expect, it } from "vitest";
import {
  moveHeroAlong,
  useSite,
  type GameEvent,
  type GameState,
  type HeroState,
} from "../../src/core/game/index.ts";
import { cloneState } from "../../src/core/game/state.ts";
import type { MapObject } from "../../src/core/map/types.ts";
import { WORN_SLOTS, findArtifact } from "../../src/data/artifacts.ts";
import { OBJECT_TYPES } from "../../src/data/objectTypes.ts";
import { findSkill } from "../../src/data/skills.ts";
import {
  learntIcons,
  resultIcons,
  siteDialogModel,
} from "../../src/ui/dialog-kinds.ts";
import {
  artifactTipCard,
  fitNote,
  itemCard,
  offerCard,
  paintSlotFits,
  skillTipCard,
  slotFits,
  statTipCard,
} from "../../src/ui/hero-screen.ts";
import { spellTip } from "../../src/ui/info-tips.ts";
import { inspectCard, inspectKey } from "../../src/ui/inspect.ts";
import {
  digResult,
  siteResult,
  spoilsResult,
  textIcons,
  type VisitIcon,
  type VisitResult,
} from "../../src/ui/visit-results.ts";
import { field, gameOn, ok } from "../core/game/helpers.ts";
import { useFakeDocument, type FakeElement } from "./fake-dom.ts";

useFakeDocument();

const node = (n: unknown): FakeElement => n as FakeElement;
const text = (n: unknown): string =>
  typeof n === "string" ? n : node(n).textContent;

function site(
  id: string,
  type: keyof typeof OBJECT_TYPES,
  x: number,
  y: number,
  data: Record<string, unknown> = {},
): MapObject {
  return {
    id,
    kind: OBJECT_TYPES[type].kind,
    x,
    y,
    footprint: { w: 1, h: 1 },
    blocked: [],
    data: { type, ...data },
  };
}

/** A hero at (0, 1), rich, with no skills, next to the object at (1, 1). */
function beside(obj: MapObject): GameState {
  const s = cloneState(gameOn(field(6, 3), [obj], 0, 1));
  const h = s.heroes[0]!;
  h.skills = [];
  h.pages = [];
  h.feats = [];
  s.players[0]!.resources.gold = 50000;
  return s;
}

function siteLine(events: readonly GameEvent[]): string {
  const e = events.find(
    (x): x is Extract<GameEvent, { type: "site" }> => x.type === "site",
  );
  if (e === undefined) throw new Error("no site line");
  return e.text;
}

/** Steps onto the object; the visit's result as it is shown. */
function visit(obj: MapObject, s: GameState = beside(obj)): VisitResult {
  const r = ok(moveHeroAlong(s, "hero-0", [{ x: obj.x, y: obj.y }]));
  return siteResult(r.state, obj, siteLine(r.events), null, r.state.heroes[0]);
}

const has = (icons: readonly VisitIcon[], kind: string, id: string): boolean =>
  icons.some((i) => i.kind === kind && i.id === id);

// ------------------------------------------------------------ the doll

function wearer(worn: Array<string | null> = [], feats: string[] = []) {
  const s = beside(site("x", "windmill", 5, 2));
  const h = s.heroes[0]!;
  h.worn = WORN_SLOTS.map((_, i) => worn[i] ?? null);
  h.feats = feats as HeroState["feats"];
  return h;
}

const RING = WORN_SLOTS.map((k, i) => (k === "ring" ? i : -1)).filter(
  (i) => i >= 0,
);

describe("backpack slot fit (the doll lights where an item goes)", () => {
  it("a ring fits both empty ring slots, the first one taken by default", () => {
    const fits = slotFits(wearer(), "knuckle-dusters");
    expect(fits.map((f) => f.fit)).toEqual(
      WORN_SLOTS.map((k) => (k === "ring" ? "fits" : "off")),
    );
    expect(fits.filter((f) => f.target).length).toBe(1);
    expect(fits[RING[0]!]!.target).toBe(true);
  });

  it("an occupied slot of the kind swaps; the empty one is the default", () => {
    const worn: Array<string | null> = [];
    worn[RING[0]!] = "moneylenders-ring";
    const fits = slotFits(wearer(worn), "knuckle-dusters");
    expect(fits[RING[0]!]!.fit).toBe("swap");
    expect(fits[RING[0]!]!.why).toMatch(
      /Moneylender's Ring goes to the backpack/,
    );
    expect(fits[RING[1]!]!.fit).toBe("fits");
    expect(fits[RING[1]!]!.target).toBe(true);
  });

  it("a cursed item, a vow and the one-Marvel rule bar a slot", () => {
    const worn: Array<string | null> = [];
    worn[RING[0]!] = "the-thirteenth-chime";
    const cursed = slotFits(wearer(worn), "knuckle-dusters");
    expect(cursed[RING[0]!]!.fit).toBe("barred");
    expect(cursed[RING[0]!]!.why).toMatch(/cursed/);
    const vowed = slotFits(
      wearer([], ["vow-of-bare-hands"]),
      "knuckle-dusters",
    );
    expect(RING.map((i) => vowed[i]!.fit)).toEqual(["barred", "barred"]);
    const marvel: Array<string | null> = [];
    const neck = WORN_SLOTS.indexOf("neck");
    marvel[neck] = "the-unspent-page";
    const two = slotFits(wearer(marvel), "the-second-left-glove");
    expect(RING.map((i) => two[i]!.fit)).toEqual(["barred", "barred"]);
    expect(two[RING[0]!]!.why).toMatch(/one Marvel/);
  });

  it("a potion or the Keystone goes nowhere on the doll", () => {
    for (const id of ["blue-tonic", "keystone"])
      expect(slotFits(wearer(), id).every((f) => f.fit === "off")).toBe(true);
    expect(fitNote(wearer(), "blue-tonic")).toMatch(/^Not worn/);
    expect(fitNote(wearer(), "galoshes")).toMatch(/Feet slot: click the lit/);
    expect(fitNote(wearer(), "knuckle-dusters")).toMatch(/click a lit slot/);
  });

  it("paints the doll: picked strong, hovered light, and clears", () => {
    const doll = node(document.createElement("div"));
    const cells = WORN_SLOTS.map(() => node(document.createElement("div")));
    const fits = slotFits(wearer(), "galoshes");
    const feet = WORN_SLOTS.indexOf("feet");
    const as = (x: FakeElement[]) => x as unknown as HTMLElement[];
    paintSlotFits(doll as unknown as HTMLElement, as(cells), fits, "pick");
    expect(doll.classList.contains("hs-doll-pick")).toBe(true);
    expect(cells[feet]!.classList.contains("hs-pick-fits")).toBe(true);
    expect(cells[feet]!.classList.contains("hs-pick-target")).toBe(true);
    expect(cells[0]!.classList.contains("hs-pick-off")).toBe(true);
    paintSlotFits(doll as unknown as HTMLElement, as(cells), fits, "hint");
    expect(cells[feet]!.classList.contains("hs-hint-fits")).toBe(true);
    paintSlotFits(doll as unknown as HTMLElement, as(cells), null, "hint");
    expect(doll.classList.contains("hs-doll-hint")).toBe(false);
    expect(cells[feet]!.classList.contains("hs-hint-fits")).toBe(false);
    // The picked light stays until the pick itself is cleared.
    expect(cells[feet]!.classList.contains("hs-pick-fits")).toBe(true);
  });
});

// ------------------------------------------------------------ the cards

describe("an inspect card is the inventory's own card", () => {
  it("artifact, skill, spell and stat cards come from the same builders", () => {
    expect(text(inspectCard({ kind: "artifact", id: "galoshes" }))).toBe(
      text(artifactTipCard("galoshes")),
    );
    // The backpack's hover card is that card plus its click hint.
    expect(text(itemCard("galoshes", "HINT"))).toBe(
      `${text(artifactTipCard("galoshes"))}HINT`,
    );
    expect(text(artifactTipCard("galoshes"))).toContain(
      findArtifact("galoshes")!.text,
    );
    expect(text(inspectCard({ kind: "skill", id: "bulwark", rank: 2 }))).toBe(
      text(skillTipCard("bulwark", 2)),
    );
    expect(text(inspectCard({ kind: "spell", id: "wildfire" }))).toBe(
      text(spellTip("wildfire")),
    );
    expect(text(inspectCard({ kind: "stat", id: "power" }))).toBe(
      text(statTipCard("power")),
    );
  });

  it("a result's tiles are inspectable buttons, one per thing", () => {
    const icons: VisitIcon[] = [
      { kind: "artifact", id: "galoshes" },
      { kind: "spell", id: "wildfire" },
      { kind: "skill", id: "bulwark" },
    ];
    const box = node(resultIcons(icons));
    const tiles = box.all("gm-inspect");
    expect(tiles.map((t) => t.dataset["inspect"])).toEqual(
      icons.map(inspectKey),
    );
    for (const t of tiles) {
      expect(t.tagName).toBe("BUTTON");
      expect(t.hasAttribute("data-tip")).toBe(true);
      expect(t.listeners.has("click")).toBe(true);
    }
    expect(resultIcons([])).toBeNull();
  });
});

// ------------------------------------------------------------ the dialogs

describe("every reward and offer dialog carries its inspect cards", () => {
  it("found: a loose artifact, a scroll, a shrine's spell", () => {
    const art = visit(
      site("a", "loose-artifact", 1, 1, { artifact: "galoshes" }),
    );
    expect(art.show).toBe("dialog");
    expect(has(art.icons, "artifact", "galoshes")).toBe(true);
    const scroll = visit(
      site("s", "loose-scroll", 1, 1, { spell: "wildfire" }),
    );
    expect(has(scroll.icons, "spell", "wildfire")).toBe(true);
    const shrine = visit(
      site("sh", "school-shrine", 1, 1, { spell: "poultice" }),
    );
    expect(has(shrine.icons, "spell", "poultice")).toBe(true);
  });

  it("any grant that names an artifact gets its card (a rich chest, a mystery pickup)", () => {
    // The generic path: whatever object gives it, the line names it.
    const chest = site("c", "windmill", 1, 1);
    const s = beside(chest);
    const r = siteResult(
      s,
      chest,
      "Found Seven-Furlong Boots.",
      null,
      s.heroes[0],
    );
    expect(r.icons).toEqual([{ kind: "artifact", id: "seven-furlong-boots" }]);
    expect(
      textIcons("Found The Glove's Thumb and a scroll of Wildfire."),
    ).toEqual([
      { kind: "artifact", id: "the-gloves-thumb" },
      { kind: "spell", id: "wildfire" },
    ]);
    // A plain word that happens to be a spell's or skill's name is not one.
    expect(textIcons("The wind rises; a banner flaps.")).toEqual([]);
  });

  it("taught: a tutor's skill and a sphinx's rank, at the rank now held", () => {
    const hut = visit(site("t", "tutors-hut", 1, 1, { skill: "bulwark" }));
    expect(hut.icons).toEqual([{ kind: "skill", id: "bulwark", rank: 1 }]);
    const name = findSkill("bulwark")!.name;
    expect(textIcons(`Sphinx: right! ${name} rises to rank 2.`)).toEqual([
      { kind: "skill", id: "bulwark", rank: 2 },
    ]);
  });

  it("won: battle spoils list every artifact taken", () => {
    const r = spoilsResult("Ada", "Bram", ["galoshes", "knuckle-dusters"]);
    expect(r.show).toBe("dialog");
    expect(r.sentence).toBe(
      "Ada takes Galoshes and Knuckle-Dusters from Bram.",
    );
    expect(r.icons.map((i) => i.id)).toEqual(["galoshes", "knuckle-dusters"]);
  });

  it("dug: the Keystone or a buried artifact", () => {
    expect(digResult("The Keystone").icons).toEqual([
      { kind: "artifact", id: "keystone" },
    ]);
    expect(digResult("500 gold, Galoshes").icons).toEqual([
      { kind: "artifact", id: "galoshes" },
    ]);
  });

  it("guild: every learnt spell", () => {
    const icons = learntIcons({
      title: "",
      sentence: "",
      consequence: null,
      spells: [{ id: "wildfire" }, { id: "poultice" }],
    } as unknown as Parameters<typeof learntIcons>[0]);
    expect(icons.map(inspectKey)).toEqual(["spell:wildfire", "spell:poultice"]);
  });

  it("bought and sold: a tollhouse's wares and the hero's items", () => {
    const toll = site("th", "tollhouse", 1, 1, {
      pool: ["galoshes", "scroll:wildfire"],
    });
    const s0 = beside(toll);
    s0.heroes[0]!.backpack = ["knuckle-dusters"];
    const s = ok(moveHeroAlong(s0, "hero-0", [{ x: 1, y: 1 }])).state;
    const m = siteDialogModel(s, s.heroes[0]!, toll, "Tollhouse", true);
    const buys = m.choices.filter((c) => c.value.startsWith("buy:"));
    expect(buys.length).toBeGreaterThan(0);
    for (const c of buys) {
      expect(c.item).not.toBeNull();
      expect(c.label).toContain(
        c.item!.kind === "spell" ? "Scroll of" : findArtifact(c.item!.id)!.name,
      );
    }
    const sell = m.choices.find((c) => c.value === "sell:0");
    expect(sell?.item).toEqual({ kind: "artifact", id: "knuckle-dusters" });
    // And the purchase's own line shows it as a card.
    const bought = ok(useSite(s, "hero-0", "th", "buy:0"));
    const line = siteLine(bought.events);
    const r = siteResult(
      bought.state,
      toll,
      line,
      null,
      bought.state.heroes[0],
    );
    expect(r.icons).toEqual([buys[0]!.item]);
    // While the tollhouse asks "Anything else?", the purchase heads it.
    const next = siteDialogModel(
      bought.state,
      bought.state.heroes[0]!,
      toll,
      "Tollhouse",
      false,
      line,
    );
    expect(next.gained).toEqual([buys[0]!.item]);
    expect(m.gained).toEqual([]);
  });

  it("level-up: each skill option shows every rank and a details card", () => {
    const h = wearer();
    h.skills = [{ id: "bulwark", rank: 1 }] as HeroState["skills"];
    const up = node(
      offerCard({ kind: "upgrade", skill: "bulwark", rank: 2 }, h),
    );
    expect(up.dataset["offer"]).toBe("skill:bulwark");
    const ranks = findSkill("bulwark")!.ranks;
    expect(up.one("hs-card-ranks")!.children.length).toBe(ranks.length);
    for (const r of ranks) expect(up.textContent).toContain(r.text);
    expect(up.textContent).toContain("You hold Basic now.");
    const details = up.one("hs-card-details")!;
    expect(details.dataset["inspect"]).toBe("details");
    expect(details.hasAttribute("data-tip")).toBe(true);
    const fresh = node(offerCard({ kind: "new", skill: "riposte" }, h));
    expect(fresh.one("hs-card-ranks")!.children.length).toBe(
      findSkill("riposte")!.ranks.length,
    );
    const stat = node(offerCard({ kind: "stat", stat: "power" }, h));
    expect(stat.one("hs-card-details")).toBeDefined();
  });
});
