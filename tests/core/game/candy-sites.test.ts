/**
 * The candy zones' sites (bead border_marches-bzc.124, CONTENT_MAP_OBJECTS
 * 3.13): the Gingerbread Cottage, the Sugar Fountain and the Sweet Shop, on
 * small hand-built states.
 */
import { describe, expect, it } from "vitest";
import {
  describeObject,
  fightPendingBattle,
  moveHeroAlong,
  objectGuardFv,
  objectValueFor,
  siteOptions,
  sweetShopStock,
  useSite,
  type BattleResolver,
  type GameEvent,
  type GameState,
  type HeroState,
} from "../../../src/core/game/index.ts";
import { heroBattleProfile } from "../../../src/core/game/battle-profile.ts";
import { backpackSize } from "../../../src/core/game/effects.ts";
import {
  BANK_VALUE,
  OBJECT_TYPES,
  SUGAR_RUSH_SPEED,
  SWEET_SHOP_STOCK,
} from "../../../src/data/objectTypes.ts";
import { CANDY_ROWS } from "../../../src/data/mapObjects.ts";
import { getCreature } from "../../../src/data/creatures.ts";
import { ARTIFACT_LIST, findArtifact } from "../../../src/data/artifacts.ts";
import { rollContents } from "../../../src/core/map/gen/contents.ts";
import { createRng } from "../../../src/core/rng.ts";
import { siteIcons, optionItem } from "../../../src/ui/visit-results.ts";
import { siteCue } from "../../../src/audio/cues.ts";
import type { MapObject } from "../../../src/core/map/types.ts";
import { errorOf, field, gameOn, ok } from "./helpers.ts";

const CANDY = ["gingerbread-cottage", "sugar-fountain", "sweet-shop"] as const;

/** A catalogue object at (x, y), its footprint up and right. */
function site(
  id: string,
  type: keyof typeof OBJECT_TYPES,
  x: number,
  y: number,
  data: Record<string, unknown> = {},
): MapObject {
  const def = OBJECT_TYPES[type];
  const blocked: Array<[number, number]> = [];
  for (let dy = 0; dy < def.h; dy++)
    for (let dx = 0; dx < def.w; dx++)
      if (dx !== 0 || dy !== 0) blocked.push([x + dx, y - dy]);
  return {
    id,
    kind: def.kind,
    x,
    y,
    footprint: { w: def.w, h: def.h },
    blocked,
    data: { type, ...data },
  };
}

const step = (s: GameState, x: number, y: number) =>
  ok(moveHeroAlong(s, "hero-0", [{ x, y }]));
const hero = (s: GameState): HeroState =>
  s.heroes.find((h) => h.id === "hero-0")!;
const texts = (events: GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === "site" ? [e.text] : []));
const win: BattleResolver = (setup) => ({
  winner: "attacker",
  attacker: setup.attacker.stacks.map((s) => s.count),
  defender: setup.defender.stacks.map(() => 0),
});
const objOf = (s: GameState, id: string): MapObject =>
  s.map.objects.find((o) => o.id === id)!;

describe("the candy catalogue", () => {
  it("has three candy sites, 2x2, placed only by the candy rule, native to frosting", () => {
    for (const t of CANDY) {
      const def = OBJECT_TYPES[t];
      expect(def.weight, t).toBe(0);
      expect([def.w, def.h], t).toEqual([2, 2]);
      expect(def.terrain, t).toEqual(["frosting"]);
      expect(def.text.length, t).toBeGreaterThan(20);
    }
    expect(OBJECT_TYPES["gingerbread-cottage"].kind).toBe("bank");
    expect(CANDY_ROWS.map((r) => r.type)).toEqual([...CANDY]);
    // The cottage's guard is inside; the fountain and the shop are free.
    expect(
      CANDY_ROWS.find((r) => r.type === "gingerbread-cottage")?.guard,
    ).toBe("never");
    expect(OBJECT_TYPES["sugar-fountain"].value).toBeLessThan(1200);
    expect(OBJECT_TYPES["sweet-shop"].value).toBeLessThan(1200);
  });
});

describe("the Gingerbread Cottage", () => {
  const wonder = ARTIFACT_LIST.find(
    (a) => a.kind === "worn" && a.grade === "wonder",
  )!.id;
  const cottage = (): MapObject =>
    site("gc", "gingerbread-cottage", 1, 2, {
      size: "medium",
      value: BANK_VALUE.medium,
      guard: [
        { creature: "taffy-wrangler", count: 8 },
        { creature: "peppermint-archer", count: 12 },
      ],
      prize: { artifacts: [wonder], gold: 1500 },
    });

  it("is a bank of sweet guards whose hoard always holds a Wonder", () => {
    const s = gameOn(field(5, 3), [cottage()], 0, 2);
    const a = step(s, 1, 2).state;
    expect(a.pendingBattle).toEqual({
      kind: "site",
      objectId: "gc",
      heroId: "hero-0",
    });
    expect(objectGuardFv(a, objOf(a, "gc"))).toBe(
      8 * getCreature("taffy-wrangler").fightValue +
        12 * getCreature("peppermint-archer").fightValue,
    );
    const card = describeObject(a, 0, objOf(a, "gc")).join(" ");
    expect(card).toMatch(/Gingerbread Cottage \(medium\)/);
    expect(card).toContain(findArtifact(wonder)!.name);
    expect(card).toMatch(/Taffy Wranglers/);
    const gold = a.players[0]!.resources.gold;
    const b = ok(fightPendingBattle(a, win));
    expect(b.state.players[0]!.resources.gold).toBe(gold + 1500);
    const h = hero(b.state);
    expect([...h.backpack, ...h.worn]).toContain(wonder);
    expect(texts(b.events).join(" ")).toMatch(/Gingerbread Cottage/);
    expect(b.state.sites["gc"]?.done).toBe(true);
    expect(objectValueFor(b.state, 0, objOf(b.state, "gc"))).toBe(0);
    expect(describeObject(b.state, 0, objOf(b.state, "gc")).join(" ")).toMatch(
      /Plundered/,
    );
  });

  it("rolls a medium or large bank: Candy creatures at 60% of a Wonder hoard", () => {
    const sizes = new Set<string>();
    for (let seed = 1; seed <= 12; seed += 1) {
      for (const tier of [1, 2, 3]) {
        const data = rollContents("gingerbread-cottage", createRng(seed), tier);
        const size = String(data["size"]);
        sizes.add(size);
        if (tier === 1) expect(size).toBe("medium");
        if (tier === 3) expect(size).toBe("large");
        expect(data["value"]).toBe(BANK_VALUE[size as "medium" | "large"]);
        const guard = data["guard"] as Array<{
          creature: string;
          count: number;
        }>;
        let fv = 0;
        for (const g of guard) {
          expect(getCreature(g.creature).faction).toBe("candy");
          expect(g.count).toBeGreaterThan(0);
          fv += g.count * getCreature(g.creature).fightValue;
        }
        const value = Number(data["value"]);
        expect(fv).toBeGreaterThan(value * 0.6 * 0.8);
        expect(fv).toBeLessThan(value * 0.6 * 1.2);
        const prize = data["prize"] as { artifacts: string[] };
        const grades = prize.artifacts.map((a) => {
          const d = findArtifact(a);
          return d?.kind === "worn" ? d.grade : d?.kind;
        });
        expect(grades).toContain("wonder");
        if (size === "large") expect(grades).toContain("trinket");
      }
    }
    expect([...sizes].sort()).toEqual(["large", "medium"]);
  });

  it("shows its prize on the inspect icons and sounds like treasure", () => {
    const obj = cottage();
    expect(siteIcons(obj)).toEqual([{ kind: "artifact", id: wonder }]);
    expect(
      siteCue("gingerbread-cottage", "Gingerbread Cottage: 1500 gold"),
    ).toBe("site.treasure");
  });
});

describe("the Sugar Fountain", () => {
  it("gives every stack +1 Speed until the next battle ends, never stacking", () => {
    const s0 = gameOn(field(4, 3), [site("sf", "sugar-fountain", 1, 2)], 0, 2);
    expect(heroBattleProfile(hero(s0)).stacks.some((m) => m.speed !== 0)).toBe(
      false,
    );
    const a = step(s0, 1, 2);
    expect(texts(a.events)[0]).toMatch(/sugar rush, \+1 Speed/);
    expect(hero(a.state).buffs).toContain("sugar-fountain");
    const rush = heroBattleProfile(hero(a.state)).stacks.filter(
      (m) => m.speed !== 0,
    );
    expect(rush).toEqual([
      expect.objectContaining({ speed: SUGAR_RUSH_SPEED, label: "Sugar Rush" }),
    ]);
    // Every stack: no creature named.
    expect(rush[0]?.creature).toBeUndefined();
    const obj = objOf(a.state, "sf");
    expect(objectValueFor(a.state, 0, obj)).toBe(0);
    // Out and back in: already on a sugar rush, still +1.
    const b = step(step(a.state, 0, 2).state, 1, 2);
    expect(texts(b.events)[0]).toMatch(/already on a sugar rush/);
    expect(
      heroBattleProfile(hero(b.state)).stacks.filter((m) => m.speed !== 0),
    ).toHaveLength(1);
    expect(describeObject(b.state, 0, obj).join(" ")).toMatch(/\+1 Speed/);
  });

  it("is worth its value to a hero without the rush", () => {
    // The generator stores the row's value on the object.
    const fountain = site("sf", "sugar-fountain", 1, 2, { value: 800 });
    const s0 = gameOn(field(4, 3), [fountain], 0, 2);
    expect(objectValueFor(s0, 0, objOf(s0, "sf"))).toBe(
      OBJECT_TYPES["sugar-fountain"].value,
    );
  });
});

describe("the Sweet Shop", () => {
  const stock = ["bottled-cheer", "road-cordial", "witch-hazel"];
  const shop = (): MapObject =>
    site("ss", "sweet-shop", 1, 2, { stock, value: 1000 });

  it("seeds three distinct potions", () => {
    for (let seed = 1; seed <= 6; seed += 1) {
      const data = rollContents("sweet-shop", createRng(seed), 2);
      const items = data["stock"] as string[];
      expect(items.length).toBe(SWEET_SHOP_STOCK);
      expect(new Set(items).size).toBe(SWEET_SHOP_STOCK);
      for (const a of items) {
        const d = findArtifact(a);
        expect(d?.kind === "consumable" && d.form).toBe("potion");
      }
    }
  });

  it("gives each hero one free potion a week, then sells them at value", () => {
    const s0 = gameOn(field(4, 3), [shop()], 0, 2);
    s0.players[0]!.resources.gold = 1000;
    const a = step(s0, 1, 2);
    const e = a.events.find((x) => x.type === "site");
    expect(e?.type === "site" && e.text).toMatch(/free/);
    expect(e?.type === "site" && e.options?.map((o) => o.id)).toEqual([
      "treat:0",
      "treat:1",
      "treat:2",
    ]);
    const obj = objOf(a.state, "ss");
    expect(objectValueFor(a.state, 0, obj, "hero-0")).toBe(1000);
    const b = ok(useSite(a.state, "hero-0", "ss", "treat:1"));
    expect(hero(b.state).backpack).toContain("road-cordial");
    expect(b.state.players[0]!.resources.gold).toBe(1000);
    expect(texts(b.events)[0]).toMatch(/free treat, Road Cordial/);
    // The free treat is spent this week: now the potions cost gold.
    expect(errorOf(useSite(b.state, "hero-0", "ss", "treat:0"))).toBe(
      "bad-choice",
    );
    const opts = siteOptions(b.state, hero(b.state), obj);
    expect(opts.map((o) => o.id)).toEqual(["sweet:0", "sweet:1", "sweet:2"]);
    expect(opts[0]?.label).toBe("Buy Bottled Cheer for 400 gold");
    expect(opts[2]?.disabled).toBeUndefined();
    expect(objectValueFor(b.state, 0, obj, "hero-0")).toBe(0);
    const c = ok(useSite(b.state, "hero-0", "ss", "sweet:2"));
    expect(c.state.players[0]!.resources.gold).toBe(400);
    expect(hero(c.state).backpack).toContain("witch-hazel");
    // 400 gold left: Witch-Hazel (600) is out of reach.
    const after = siteOptions(c.state, hero(c.state), obj);
    expect(after[0]?.disabled).toBeUndefined();
    expect(after[2]?.disabled).toBe("not enough gold");
  });

  it("refuses a hero with a full backpack without spending its treat", () => {
    const s0 = gameOn(field(4, 3), [shop()], 0, 2);
    const h0 = hero(s0);
    const filler = ARTIFACT_LIST.find((a) => a.kind === "worn")!.id;
    while (h0.backpack.length < backpackSize(h0)) h0.backpack.push(filler);
    const a = step(s0, 1, 2).state;
    const obj = objOf(a, "ss");
    const opts = siteOptions(a, hero(a), obj);
    expect(opts.every((o) => o.disabled === "the backpack is full")).toBe(true);
    expect(errorOf(useSite(a, "hero-0", "ss", "treat:0"))).toBe("bad-choice");
    expect(a.sites["ss"]?.last).toBeUndefined();
    // Nothing to gain for a full hero: the AI leaves it alone.
    expect(objectValueFor(a, 0, obj, "hero-0")).toBe(0);
  });

  it("names its shelf on the card and offers the potions as inspect icons", () => {
    const s = gameOn(field(4, 3), [shop()], 0, 2);
    const obj = objOf(s, "ss");
    const card = describeObject(s, 0, obj).join(" ");
    expect(card).toMatch(/Bottled Cheer \(400 gold\)/);
    expect(card).toMatch(/Once a week per hero/);
    expect(sweetShopStock(obj)).toEqual(stock);
    expect(siteIcons(obj)).toEqual(
      stock.map((id) => ({ kind: "artifact", id })),
    );
    expect(optionItem(s, hero(s), obj, "treat:1")).toEqual({
      kind: "artifact",
      id: "road-cordial",
    });
    expect(optionItem(s, hero(s), obj, "sweet:2")).toEqual({
      kind: "artifact",
      id: "witch-hazel",
    });
    expect(siteCue("sweet-shop", "Sweet Shop: bought Witch-Hazel.")).toBe(
      "site.market",
    );
  });
});
