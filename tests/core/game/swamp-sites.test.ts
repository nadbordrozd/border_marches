/**
 * The swamp's sites (bead border_marches-bzc.126, CONTENT_MAP_OBJECTS
 * 3.15): the Witch's Hut, the Drowned Temple and the Hag's Cauldron, on
 * small hand-built states.
 */
import { describe, expect, it } from "vitest";
import {
  describeObject,
  fightPendingBattle,
  hagBrew,
  moveHeroAlong,
  objectGuardFv,
  objectValueFor,
  siteOptions,
  useSite,
  witchSkills,
  type BattleResolver,
  type GameEvent,
  type GameState,
  type HeroState,
} from "../../../src/core/game/index.ts";
import { armyLuck, armyMorale } from "../../../src/core/game/effects.ts";
import {
  BANK_VALUE,
  OBJECT_TYPES,
  WITCH_HUT_PRICE,
} from "../../../src/data/objectTypes.ts";
import { getCreature } from "../../../src/data/creatures.ts";
import { findSkill } from "../../../src/data/skills.ts";
import { swampContents } from "../../../src/core/map/gen/swamp.ts";
import { createRng } from "../../../src/core/rng.ts";
import type { MapObject } from "../../../src/core/map/types.ts";
import { errorOf, field, gameOn, ok } from "./helpers.ts";

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

describe("the swamp sites' catalogue rows", () => {
  it("are rule-placed swamp sites: weight 0, swamp ground", () => {
    for (const t of [
      "witchs-hut",
      "drowned-temple",
      "hags-cauldron",
    ] as const) {
      expect(OBJECT_TYPES[t].weight, t).toBe(0);
      expect(OBJECT_TYPES[t].terrain, t).toEqual(["swamp"]);
    }
    expect(OBJECT_TYPES["drowned-temple"].kind).toBe("bank");
    expect(OBJECT_TYPES["witchs-hut"].reset).toBe("per-hero");
    expect(OBJECT_TYPES["hags-cauldron"].reset).toBe("per-hero");
  });
});

describe("the Witch's Hut", () => {
  const hut = (): MapObject =>
    site("hut", "witchs-hut", 1, 2, {
      skills: ["greencraft", "onslaught"],
      value: 2500,
    });

  it("seeds a school skill and one other", () => {
    for (let seed = 1; seed <= 6; seed += 1) {
      const data = swampContents("witchs-hut", createRng(seed), 2);
      const skills = data["skills"] as string[];
      expect(skills.length).toBe(2);
      expect(findSkill(skills[0]!)?.family).toBe("school");
      expect(findSkill(skills[1]!)?.family).not.toBe("school");
    }
  });

  it("offers a rank in either skill for gold and essence, once per hero", () => {
    const s0 = gameOn(field(4, 3), [hut()], 0, 2);
    s0.players[0]!.resources.gold = 5000;
    s0.players[0]!.resources.essence = 5;
    hero(s0).skills = [{ id: "onslaught", rank: 1 }];
    const a = step(s0, 1, 2);
    expect(texts(a.events)[0]).toMatch(/Witch's Hut/);
    const obj = objOf(a.state, "hut");
    expect(witchSkills(obj)).toEqual(["greencraft", "onslaught"]);
    const opts = siteOptions(a.state, hero(a.state), obj);
    expect(opts.map((o) => o.id)).toEqual([
      "learn:greencraft",
      "learn:onslaught",
    ]);
    expect(opts[1]!.label).toMatch(/rank 2 for 1500 gold, 2 essence/);
    const b = ok(useSite(a.state, "hero-0", "hut", "learn:onslaught"));
    expect(hero(b.state).skills).toEqual([{ id: "onslaught", rank: 2 }]);
    expect(b.state.players[0]!.resources.gold).toBe(
      5000 - WITCH_HUT_PRICE.gold,
    );
    expect(b.state.players[0]!.resources.essence).toBe(
      5 - WITCH_HUT_PRICE.essence,
    );
    expect(texts(b.events)[0]).toMatch(/rank 2/);
    // Each hero once.
    expect(siteOptions(b.state, hero(b.state), obj)).toEqual([]);
    expect(errorOf(useSite(b.state, "hero-0", "hut", "learn:greencraft"))).toBe(
      "bad-choice",
    );
    expect(objectValueFor(b.state, 0, obj, "hero-0")).toBe(0);
  });

  it("refuses without the price, and the AI values it at nothing then", () => {
    const s0 = gameOn(field(4, 3), [hut()], 0, 2);
    s0.players[0]!.resources.gold = 100;
    s0.players[0]!.resources.essence = 0;
    const a = step(s0, 1, 2).state;
    const obj = objOf(a, "hut");
    for (const o of siteOptions(a, hero(a), obj))
      expect(o.disabled).toBe("not enough resources");
    expect(errorOf(useSite(a, "hero-0", "hut", "learn:greencraft"))).toBe(
      "bad-choice",
    );
    expect(objectValueFor(a, 0, obj)).toBe(0);
    a.players[0]!.resources.gold = 3000;
    a.players[0]!.resources.essence = 3;
    expect(objectValueFor(a, 0, obj)).toBe(1250);
  });

  it("names its two skills and its price on the card", () => {
    const s = gameOn(field(4, 3), [hut()], 0, 2);
    const lines = describeObject(s, 0, objOf(s, "hut")).join(" ");
    expect(lines).toMatch(/Witch's Hut/);
    expect(lines).toMatch(/Greencraft or Onslaught/);
    expect(lines).toMatch(/1500 gold, 2 essence/);
  });
});

describe("the Drowned Temple", () => {
  it("rolls a bank's worth behind 60% of it in bog creatures", () => {
    const sizes = new Set<string>();
    for (let seed = 1; seed <= 12; seed += 1)
      for (const tier of [1, 2, 3]) {
        const data = swampContents("drowned-temple", createRng(seed), tier);
        const size = data["size"] as keyof typeof BANK_VALUE;
        sizes.add(size);
        expect(data["value"]).toBe(BANK_VALUE[size]);
        if (tier === 1) expect(size).not.toBe("large");
        const guard = data["guard"] as Array<{
          creature: string;
          count: number;
        }>;
        for (const g of guard)
          expect(["bog-leech", "deep-sea-diver", "lagoon-lurker"]).toContain(
            g.creature,
          );
        const fv = guard.reduce(
          (n, g) => n + g.count * getCreature(g.creature).fightValue,
          0,
        );
        const want = BANK_VALUE[size] * 0.6;
        expect(fv).toBeGreaterThan(want * 0.85);
        expect(fv).toBeLessThan(want * 1.15);
        const prize = data["prize"] as Record<string, unknown>;
        expect(prize["essence"]).toBeGreaterThan(0);
        expect((prize["scrolls"] as string[]).length).toBe(1);
        if (size !== "small")
          expect((prize["artifacts"] as string[]).length).toBe(1);
      }
    expect(sizes).toEqual(new Set(["small", "medium", "large"]));
  });

  it("is fought like a bank and plundered once", () => {
    const s = gameOn(
      field(4, 3),
      [
        site("tmp", "drowned-temple", 1, 2, {
          size: "small",
          value: 2500,
          guard: [{ creature: "bog-leech", count: 14 }],
          prize: { gold: 900, essence: 2 },
        }),
      ],
      0,
      2,
    );
    const a = step(s, 1, 2).state;
    expect(a.pendingBattle).toEqual({
      kind: "site",
      objectId: "tmp",
      heroId: "hero-0",
    });
    expect(objectGuardFv(a, objOf(a, "tmp"))).toBe(
      14 * getCreature("bog-leech").fightValue,
    );
    const gold = a.players[0]!.resources.gold;
    const essence = a.players[0]!.resources.essence;
    const b = ok(fightPendingBattle(a, win)).state;
    expect(b.players[0]!.resources.gold).toBe(gold + 900);
    expect(b.players[0]!.resources.essence).toBe(essence + 2);
    expect(describeObject(b, 0, objOf(b, "tmp")).join(" ")).toMatch(
      /Plundered/,
    );
    expect(objectValueFor(b, 0, objOf(b, "tmp"))).toBe(0);
  });
});

describe("the Hag's Cauldron", () => {
  const cauldron = (id = "pot"): MapObject =>
    site(id, "hags-cauldron", 1, 2, { value: 1000 });

  it("blesses about two heroes in three and curses the rest, fixed per hero", () => {
    const s = gameOn(field(4, 3), [cauldron()], 0, 2);
    const obj = objOf(s, "pot");
    let blessed = 0;
    const n = 300;
    for (let k = 0; k < n; k += 1) {
      const h = { ...hero(s), id: `h-${k}` };
      const brew = hagBrew(s, obj, h);
      expect(hagBrew(s, obj, h)).toEqual(brew);
      if (brew.kind === "blessing") blessed += 1;
    }
    expect(blessed / n).toBeGreaterThan(0.58);
    expect(blessed / n).toBeLessThan(0.75);
  });

  it("drinking gives the hero its brew, once", () => {
    // Find a game seed whose brew blesses hero-0, and one that curses it.
    const outcome = (seed: number) => {
      const s = gameOn(field(4, 3), [cauldron()], 0, 2);
      s.seed = seed;
      return { s, brew: hagBrew(s, objOf(s, "pot"), hero(s)) };
    };
    let bless: ReturnType<typeof outcome> | undefined;
    let curse: ReturnType<typeof outcome> | undefined;
    for (let seed = 1; seed < 60 && (!bless || !curse); seed += 1) {
      const o = outcome(seed);
      if (o.brew.kind === "blessing") bless ??= o;
      else curse ??= o;
    }
    expect(bless && curse).toBeTruthy();

    const b0 = bless!.s;
    const a = step(b0, 1, 2);
    expect(texts(a.events)[0]).toMatch(/Hag's Cauldron/);
    const opts = siteOptions(a.state, hero(a.state), objOf(a.state, "pot"));
    expect(opts.map((o) => o.id)).toEqual(["drink"]);
    const stat = (bless!.brew as { stat: "attack" }).stat;
    const before = hero(a.state)[stat];
    const b = ok(useSite(a.state, "hero-0", "pot", "drink"));
    expect(hero(b.state)[stat]).toBe(before + 1);
    expect(texts(b.events)[0]).toMatch(/blessing/);
    expect(siteOptions(b.state, hero(b.state), objOf(b.state, "pot"))).toEqual(
      [],
    );

    const c = step(curse!.s, 1, 2).state;
    const morale = armyMorale(hero(c));
    const luck = armyLuck(hero(c));
    const d = ok(useSite(c, "hero-0", "pot", "drink"));
    expect(hero(d.state).buffs).toContain("hags-curse");
    expect(armyMorale(hero(d.state))).toBe(morale - 1);
    expect(armyLuck(hero(d.state))).toBe(luck - 1);
    expect(texts(d.events)[0]).toMatch(/curse/);
    expect(objectValueFor(d.state, 0, objOf(d.state, "pot"), "hero-0")).toBe(0);
  });

  it("states the odds on its card", () => {
    const s = gameOn(field(4, 3), [cauldron()], 0, 2);
    const lines = describeObject(s, 0, objOf(s, "pot")).join(" ");
    expect(lines).toMatch(/two times in three/);
    expect(lines).toMatch(/-1 Morale and -1 Luck/);
  });
});
