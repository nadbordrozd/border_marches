/**
 * The desert's sites (bead border_marches-bzc.88): the Pyramid, the Sphinx
 * and its riddles, the Sun Temple and the Sunken Tomb, on small hand-built
 * states.
 */
import { describe, expect, it } from "vitest";
import {
  describeObject,
  fightPendingBattle,
  moveHeroAlong,
  objectGuardFv,
  objectValueFor,
  siteOptions,
  sphinxRiddle,
  sphinxSkill,
  useSite,
  type BattleResolver,
  type GameEvent,
  type GameState,
  type HeroState,
} from "../../../src/core/game/index.ts";
import { heroStats } from "../../../src/core/game/effects.ts";
import {
  OBJECT_TYPES,
  PYRAMID_VALUE,
  SPHINX_XP,
} from "../../../src/data/objectTypes.ts";
import { RIDDLES, riddleAt } from "../../../src/data/riddles.ts";
import { getCreature } from "../../../src/data/creatures.ts";
import { ARTIFACT_LIST } from "../../../src/data/artifacts.ts";
import { battleSpellsOfTier } from "../../../src/data/map-spells.ts";
import { rollContents } from "../../../src/core/map/gen/contents.ts";
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

describe("the Pyramid", () => {
  const wonder = ARTIFACT_LIST.find(
    (a) => a.kind === "worn" && a.grade === "wonder",
  )!.id;
  const spell = battleSpellsOfTier(5)[0]!.id;
  const pyramid = (): MapObject =>
    site("pyr", "pyramid", 1, 2, {
      value: PYRAMID_VALUE,
      guard: [
        { creature: "vampire", count: 5 },
        { creature: "banshee", count: 16 },
        { creature: "ghoul", count: 21 },
      ],
      prize: { artifacts: [wonder], spell, gold: 5000, essence: 5 },
    });

  it("is a once-a-map treasure guarded by the Restless dead", () => {
    const s = gameOn(field(5, 3), [pyramid()], 0, 2);
    const a = step(s, 1, 2).state;
    expect(a.pendingBattle).toEqual({
      kind: "site",
      objectId: "pyr",
      heroId: "hero-0",
    });
    const obj = a.map.objects.find((o) => o.id === "pyr")!;
    expect(objectGuardFv(a, obj)).toBe(
      5 * getCreature("vampire").fightValue +
        16 * getCreature("banshee").fightValue +
        21 * getCreature("ghoul").fightValue,
    );
    const gold = a.players[0]!.resources.gold;
    const essence = a.players[0]!.resources.essence;
    const b = ok(fightPendingBattle(a, win));
    expect(b.state.players[0]!.resources.gold).toBe(gold + 5000);
    expect(b.state.players[0]!.resources.essence).toBe(essence + 5);
    const h = hero(b.state);
    expect([...h.backpack, ...h.worn]).toContain(wonder);
    // The spell: a page if the hero can learn it, else a scroll.
    expect([...h.pages, ...h.scrolls]).toContain(spell);
    expect(texts(b.events).join(" ")).toMatch(/Pyramid/);
    expect(b.state.sites["pyr"]?.done).toBe(true);
    expect(objectValueFor(b.state, 0, obj)).toBe(0);
  });

  it("rolls a large bank's worth behind 60% of it in undead", () => {
    const data = rollContents("pyramid", createRng(7), 3);
    expect(data["value"]).toBe(PYRAMID_VALUE);
    const guard = data["guard"] as Array<{ creature: string; count: number }>;
    expect(guard.map((g) => g.creature)).toEqual([
      "vampire",
      "banshee",
      "ghoul",
    ]);
    const fv = guard.reduce(
      (n, g) => n + g.count * getCreature(g.creature).fightValue,
      0,
    );
    expect(fv).toBeGreaterThan(PYRAMID_VALUE * 0.6 * 0.85);
    expect(fv).toBeLessThan(PYRAMID_VALUE * 0.6 * 1.15);
    const prize = data["prize"] as Record<string, unknown>;
    expect((prize["artifacts"] as string[]).length).toBe(1);
    expect(typeof prize["spell"]).toBe("string");
  });
});

describe("the Sunken Tomb", () => {
  it("is a small or medium bank of the dead", () => {
    for (const tier of [1, 2, 3]) {
      const data = rollContents("sunken-tomb", createRng(tier), tier);
      expect(["small", "medium"]).toContain(data["size"]);
      for (const g of data["guard"] as Array<{ creature: string }>)
        expect(getCreature(g.creature).faction).toBe("undead");
    }
    const s = gameOn(
      field(4, 3),
      [
        site("tomb", "sunken-tomb", 1, 2, {
          size: "small",
          value: 2500,
          guard: [{ creature: "skeleton", count: 12 }],
          prize: { gold: 1000 },
        }),
      ],
      0,
      2,
    );
    const a = step(s, 1, 2).state;
    expect(a.pendingBattle?.kind).toBe("site");
    const gold = a.players[0]!.resources.gold;
    const b = ok(fightPendingBattle(a, win)).state;
    expect(b.players[0]!.resources.gold).toBe(gold + 1000);
    const obj = b.map.objects.find((o) => o.id === "tomb")!;
    expect(describeObject(b, 0, obj).join(" ")).toMatch(/Plundered/);
  });
});

describe("the Sphinx", () => {
  const sphinx = (gift: "skill" | "xp", riddles = [0, 1, 2]): MapObject =>
    site("sph", "sphinx", 1, 2, { gift, riddles, value: 3000 });

  it("has original riddles that can be answered: four answers, one right", () => {
    expect(RIDDLES.length).toBeGreaterThanOrEqual(8);
    const ids = new Set(RIDDLES.map((r) => r.id));
    expect(ids.size).toBe(RIDDLES.length);
    for (const r of RIDDLES) {
      expect(r.answers.length).toBe(4);
      expect(new Set(r.answers).size).toBe(4);
      expect(r.right).toBeGreaterThanOrEqual(0);
      expect(r.right).toBeLessThan(4);
    }
    // The right answers are not always in the same place.
    expect(new Set(RIDDLES.map((r) => r.right)).size).toBe(4);
  });

  it("asks a riddle of its seeded pool with the answers as choices", () => {
    const s = gameOn(field(4, 3), [sphinx("xp", [3, 4, 5])], 0, 2);
    const a = step(s, 1, 2);
    const riddle = sphinxRiddle(
      a.state.map.objects.find((o) => o.id === "sph")!,
      hero(a.state),
    );
    expect([3, 4, 5].map((i) => riddleAt(i).id)).toContain(riddle.id);
    const e = a.events.find((x) => x.type === "site");
    expect(e?.type === "site" && e.text).toContain(riddle.text);
    expect(e?.type === "site" && e.options?.map((o) => o.label)).toEqual([
      ...riddle.answers,
    ]);
  });

  it("a right answer raises the hero's lowest skill by a rank, once", () => {
    const s0 = gameOn(field(4, 3), [sphinx("skill")], 0, 2);
    hero(s0).skills = [
      { id: "onslaught", rank: 2 },
      { id: "bulwark", rank: 1 },
    ];
    expect(sphinxSkill(hero(s0))).toBe("bulwark");
    const a = step(s0, 1, 2).state;
    const obj = a.map.objects.find((o) => o.id === "sph")!;
    const riddle = sphinxRiddle(obj, hero(a));
    const b = ok(useSite(a, "hero-0", "sph", `answer:${riddle.right}`));
    expect(hero(b.state).skills).toEqual([
      { id: "onslaught", rank: 2 },
      { id: "bulwark", rank: 2 },
    ]);
    expect(texts(b.events)[0]).toMatch(/is right!/);
    // One try per hero.
    expect(siteOptions(b.state, hero(b.state), obj)).toEqual([]);
    expect(
      errorOf(useSite(b.state, "hero-0", "sph", `answer:${riddle.right}`)),
    ).toBe("bad-choice");
    expect(objectValueFor(b.state, 0, obj, "hero-0")).toBe(0);
  });

  it("a right answer gives experience when the gift is experience or no skill can rise", () => {
    for (const gift of ["xp", "skill"] as const) {
      const s0 = gameOn(field(4, 3), [sphinx(gift)], 0, 2);
      hero(s0).skills = [];
      const a = step(s0, 1, 2).state;
      const xp = hero(a).xp;
      const riddle = sphinxRiddle(
        a.map.objects.find((o) => o.id === "sph")!,
        hero(a),
      );
      const b = ok(useSite(a, "hero-0", "sph", `answer:${riddle.right}`));
      expect(hero(b.state).xp).toBe(xp + SPHINX_XP);
    }
  });

  it("a wrong answer costs the rest of the day's movement and gives nothing", () => {
    const s0 = gameOn(field(4, 3), [sphinx("xp")], 0, 2);
    const a = step(s0, 1, 2).state;
    expect(hero(a).mp).toBeGreaterThan(0);
    const xp = hero(a).xp;
    const riddle = sphinxRiddle(
      a.map.objects.find((o) => o.id === "sph")!,
      hero(a),
    );
    const wrong = (riddle.right + 1) % 4;
    const b = ok(useSite(a, "hero-0", "sph", `answer:${wrong}`));
    expect(hero(b.state).mp).toBe(0);
    expect(hero(b.state).xp).toBe(xp);
    expect(texts(b.events)[0]).toMatch(/is wrong/);
    expect(b.state.sites["sph"]?.heroes).toEqual(["hero-0"]);
  });

  it("tells the gift on its card", () => {
    const s = gameOn(field(4, 3), [sphinx("skill")], 0, 2);
    const obj = s.map.objects.find((o) => o.id === "sph")!;
    const lines = describeObject(s, 0, obj);
    expect(lines[0]).toBe("Sphinx");
    expect(lines.join(" ")).toMatch(/riddle/);
    expect(lines.join(" ")).toMatch(/rank/);
  });

  it("seeds three distinct riddles and a gift", () => {
    const data = rollContents("sphinx", createRng(3), 2);
    const pool = data["riddles"] as number[];
    expect(pool.length).toBe(3);
    expect(new Set(pool).size).toBe(3);
    expect(["skill", "xp"]).toContain(data["gift"]);
  });
});

describe("the Sun Temple", () => {
  it("gives +2 Attack until the next battle ends, never stacking", () => {
    const s0 = gameOn(field(4, 3), [site("sun", "sun-temple", 1, 2)], 0, 2);
    const before = heroStats(hero(s0)).attack;
    const a = step(s0, 1, 2);
    expect(texts(a.events)[0]).toMatch(/\+2 Attack/);
    expect(heroStats(hero(a.state)).attack).toBe(before + 2);
    const obj = a.state.map.objects.find((o) => o.id === "sun")!;
    expect(objectValueFor(a.state, 0, obj)).toBe(0);
    // Out and back in: already blessed.
    const b = step(step(a.state, 0, 2).state, 1, 2);
    expect(texts(b.events)[0]).toMatch(/already blessed/);
    expect(heroStats(hero(b.state)).attack).toBe(before + 2);
  });
});
