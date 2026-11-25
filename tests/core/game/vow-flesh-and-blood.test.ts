/**
 * Vow of Flesh and Blood (CONTENT_HEROES.md section 3): "Your army may
 * contain no creature tagged `wreck`". Creature tags are the remains tag
 * of the data rows (FACTION_*.md section 3, CONTENT_CREATURES.md).
 */
import { describe, expect, it } from "vitest";
import {
  grantPrize,
  moveHeroAlong,
  recruit,
  siteOptions,
  transferStack,
  useSite,
  type GameEvent,
  type GameState,
  type HeroState,
} from "../../../src/core/game/index.ts";
import {
  creatureTags,
  satisfies,
  vowBarsCreature,
} from "../../../src/core/game/hero.ts";
import { getFeat } from "../../../src/data/feats.ts";
import { OBJECT_TYPES } from "../../../src/data/objectTypes.ts";
import type { MapObject } from "../../../src/core/map/types.ts";
import { errorOf, field, gameOn, ok, town } from "./helpers.ts";

const VOW = "vow-of-flesh-and-blood";

const hero = (s: GameState): HeroState =>
  s.heroes.find((h) => h.id === "hero-0")!;

/** Test surgery: the hero has sworn the vow. */
function sworn(s: GameState): GameState {
  const next = structuredClone(s);
  hero(next).feats.push(VOW);
  return next;
}

function strayHut(id: string, x: number, creature: string): MapObject {
  const def = OBJECT_TYPES["stray-hut"];
  return {
    id,
    kind: def.kind,
    x,
    y: 0,
    footprint: { w: def.w, h: def.h },
    blocked: [],
    data: { type: "stray-hut", creature },
  };
}

describe("creature tags", () => {
  it("are the remains each faction and stray leaves", () => {
    expect(creatureTags("squire")).toEqual(["corpse"]);
    expect(creatureTags("ogre")).toEqual(["corpse"]);
    expect(creatureTags("skeleton")).toEqual(["bones"]);
    expect(creatureTags("banshee")).toEqual(["nothing"]);
    expect(creatureTags("tin-titan")).toEqual(["wreck"]);
    expect(creatureTags("bellhop")).toEqual(["wreck"]);
    expect(creatureTags("gremlin")).toEqual(["corpse"]);
    expect(creatureTags("no-such-creature")).toEqual([]);
  });
});

describe("Vow of Flesh and Blood", () => {
  const base = (): GameState => gameOn(field(5, 1), [town("t", 2, 0, 0)]);

  it("bars wreck creatures with a clear message, and nothing else", () => {
    const h = hero(sworn(base()));
    expect(vowBarsCreature(h, "tin-titan")).toMatch(
      /sworn the Vow of Flesh and Blood: Tin Titans \(tagged wreck\) may not join/,
    );
    expect(vowBarsCreature(h, "squire")).toBeNull();
    expect(vowBarsCreature(hero(base()), "tin-titan")).toBeNull();
  });

  it("is offered only to a hero without wrecks in its army", () => {
    const s = structuredClone(base());
    const r = getFeat(VOW).restriction!;
    expect(satisfies(hero(s), r)).toBe(true);
    hero(s).army[5] = { creature: "tin-titan", count: 1 };
    expect(satisfies(hero(s), r)).toBe(false);
  });

  it("a stray hut will not hire wrecks to a sworn hero", () => {
    const s = sworn(gameOn(field(4, 1), [strayHut("hut", 1, "bellhop")]));
    const a = ok(moveHeroAlong(s, "hero-0", [{ x: 1, y: 0 }])).state;
    const obj = a.map.objects.find((o) => o.id === "hut")!;
    const [hire] = siteOptions(a, hero(a), obj);
    expect(hire?.disabled).toMatch(/Vow of Flesh and Blood/);
    expect(errorOf(useSite(a, "hero-0", "hut", hire!.id))).toBe("bad-choice");
  });

  it("town recruits go to the garrison, or fail when forced to the hero", () => {
    let s = sworn(base());
    s = ok(
      moveHeroAlong(s, "hero-0", [
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ]),
    ).state;
    // Test surgery: a wreck dwelling in the town.
    s.towns["t"]!.dwellings["tin-titan"] = { available: 2, remainder: 0 };
    s.players[0]!.resources.gold = 100000;
    const forced = recruit(s, "t", "tin-titan", 1, "hero");
    expect(errorOf(forced)).toBe("vow");
    expect(!forced.ok && forced.message).toMatch(/Vow of Flesh and Blood/);
    const auto = ok(recruit(s, "t", "tin-titan", 1)).state;
    expect(hero(auto).army.some((x) => x?.creature === "tin-titan")).toBe(
      false,
    );
    expect(
      auto.towns["t"]!.garrison.some((x) => x?.creature === "tin-titan"),
    ).toBe(true);
  });

  it("a wreck in the garrison cannot be moved to the sworn hero", () => {
    let s = sworn(base());
    s = ok(
      moveHeroAlong(s, "hero-0", [
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ]),
    ).state;
    s.towns["t"]!.garrison[0] = { creature: "tin-titan", count: 1 };
    const result = transferStack(s, {
      heroId: "hero-0",
      townId: "t",
      from: { army: "garrison", slot: 0 },
      to: { army: "hero", slot: 6 },
    });
    expect(errorOf(result)).toBe("vow");
    // A swap that would bring it in is refused too.
    expect(
      errorOf(
        transferStack(s, {
          heroId: "hero-0",
          townId: "t",
          from: { army: "hero", slot: 0 },
          to: { army: "garrison", slot: 0 },
        }),
      ),
    ).toBe("vow");
  });

  it("wreck joiners of a prize stay behind", () => {
    const s = sworn(base());
    const events: GameEvent[] = [];
    const h = hero(s);
    const text = grantPrize(
      s,
      h,
      {
        joiners: [
          { creature: "tin-titan", count: 2 },
          { creature: "gremlin", count: 3 },
        ],
      },
      events,
    );
    expect(h.army.some((x) => x?.creature === "tin-titan")).toBe(false);
    expect(h.army.some((x) => x?.creature === "gremlin")).toBe(true);
    expect(text).toMatch(/may not join the army: left behind/);
  });
});
