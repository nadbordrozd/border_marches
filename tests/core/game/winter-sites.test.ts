/**
 * The winter sites of bead border_marches-bzc.87: the Frost Giant's Barrow
 * (a bank guarded by Rime Walruses), the Aurora Spire (a school rank and
 * full mana), the Hunter's Lodge (snowshoes and movement) and the Walrus
 * Rookery (a dwelling of Rime Walruses), on small hand-built states.
 */
import { describe, expect, it } from "vitest";
import {
  describeObject,
  fightPendingBattle,
  moveHeroAlong,
  objectValueFor,
  useSite,
  type BattleResolver,
  type GameEvent,
  type GameState,
  type HeroState,
} from "../../../src/core/game/index.ts";
import { maxMana, terrainProfile } from "../../../src/core/game/effects.ts";
import { stepCost } from "../../../src/core/game/pathfinding.ts";
import { rollContents } from "../../../src/core/map/gen/contents.ts";
import { createRng } from "../../../src/core/rng.ts";
import { ARTIFACT_LIST } from "../../../src/data/artifacts.ts";
import { RESOURCE_UNIT_VALUE } from "../../../src/data/mapObjects.ts";
import {
  BANK_VALUE,
  HUNTERS_LODGE_MP,
  OBJECT_TYPES,
  ROOKERY_HIRE,
  ROOKERY_WEEKLY,
  type Prize,
} from "../../../src/data/objectTypes.ts";
import type { MapObject } from "../../../src/core/map/types.ts";
import { field, gameOn, ok } from "./helpers.ts";

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

const hero = (s: GameState): HeroState =>
  s.heroes.find((h) => h.id === "hero-0")!;
const texts = (events: GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === "site" ? [e.text] : []));
const step = (s: GameState, x: number, y: number) =>
  ok(moveHeroAlong(s, "hero-0", [{ x, y }]));
const win: BattleResolver = (setup) => ({
  winner: "attacker",
  attacker: setup.attacker.stacks.map((s) => s.count),
  defender: setup.defender.stacks.map(() => 0),
});

describe("Frost Giant's Barrow", () => {
  const art = ARTIFACT_LIST.find((a) => a.kind === "worn")!.id;
  const barrow = (): MapObject =>
    site("fgb", "frost-giants-barrow", 1, 1, {
      size: "small",
      guard: [{ creature: "rime-walrus", count: 2 }],
      prize: { artifacts: [art], gold: 500 },
      value: 2500,
    });

  it("is a bank: Rime Walruses fight inside, the winner takes the hoard once", () => {
    const s = gameOn(field(5, 2, "n"), [barrow()], 0, 1);
    const a = step(s, 1, 1).state;
    expect(a.pendingBattle).toEqual({
      kind: "site",
      objectId: "fgb",
      heroId: "hero-0",
    });
    const gold = a.players[0]!.resources.gold;
    const b = ok(fightPendingBattle(a, win)).state;
    expect(b.players[0]!.resources.gold).toBe(gold + 500);
    expect(hero(b).backpack).toContain(art);
    expect(b.sites["fgb"]?.done).toBe(true);
    const c = step(step(b, 0, 1).state, 1, 1);
    expect(c.state.pendingBattle).toBeNull();
    expect(texts(c.events)[0]).toMatch(/plundered/);
    expect(
      describeObject(
        s,
        0,
        s.map.objects.find((o) => o.id === "fgb")!,
      ),
    ).toEqual(
      expect.arrayContaining([
        "Frost Giant's Barrow (small)",
        expect.stringMatching(/Inside: 2 Rime Walruses/),
      ]),
    );
  });

  it("rolls a guard of Rime Walruses and a prize worth its bank size", () => {
    const unit = (p: Prize): number => {
      let v = (p.gold ?? 0) + (p.ore ?? 0) * RESOURCE_UNIT_VALUE.ore;
      for (const a of p.artifacts ?? [])
        v += ARTIFACT_LIST.find((x) => x.id === a)?.value ?? 0;
      return v;
    };
    for (let seed = 1; seed <= 30; seed++) {
      const d = rollContents(
        "frost-giants-barrow",
        createRng(seed),
        1 + (seed % 3),
      );
      const size = d["size"] as keyof typeof BANK_VALUE;
      expect(d["value"]).toBe(BANK_VALUE[size]);
      const guard = d["guard"] as Array<{ creature: string; count: number }>;
      expect(guard.every((g) => g.creature === "rime-walrus")).toBe(true);
      const prize = d["prize"] as Prize;
      expect(prize.artifacts?.length ?? 0).toBeGreaterThan(0);
      // Within a quarter of the bank value (artifact values vary).
      expect(Math.abs(unit(prize) - BANK_VALUE[size])).toBeLessThanOrEqual(
        BANK_VALUE[size] / 4,
      );
    }
  });
});

describe("Aurora Spire", () => {
  const spire = (): MapObject =>
    site("as", "aurora-spire", 1, 0, { school: "clock", value: 3000 });

  it("teaches its school's skill at rank 1 and refills the mana, once per hero", () => {
    const s = gameOn(field(3, 1, "n"), [spire()]);
    hero(s).skills = [];
    hero(s).mana = 0;
    const a = step(s, 1, 0);
    const h = hero(a.state);
    expect(h.skills).toContainEqual({ id: "horology", rank: 1 });
    expect(h.mana).toBe(maxMana(h));
    expect(texts(a.events)[0]).toMatch(/learns Horology rank 1; mana/);
    expect(
      objectValueFor(
        a.state,
        0,
        a.state.map.objects.find((o) => o.id === "as")!,
      ),
    ).toBe(0);
    const b = step(step(a.state, 0, 0).state, 1, 0);
    expect(texts(b.events)[0]).toMatch(/Already visited/);
    expect(hero(b.state).skills).toContainEqual({ id: "horology", rank: 1 });
  });

  it("raises a rank the hero has, and refuses a mastered one without using the visit", () => {
    const s = gameOn(field(3, 1, "n"), [spire()]);
    hero(s).skills = [{ id: "horology", rank: 2 }];
    const a = step(s, 1, 0);
    expect(hero(a.state).skills).toContainEqual({ id: "horology", rank: 3 });
    const t = gameOn(field(3, 1, "n"), [spire()]);
    hero(t).skills = [{ id: "horology", rank: 3 }];
    const b = step(t, 1, 0);
    expect(texts(b.events)[0]).toMatch(/cannot teach Horology/);
    expect(b.state.sites["as"]?.heroes ?? []).toEqual([]);
  });

  it("names its skill on hover", () => {
    const s = gameOn(field(3, 1, "n"), [spire()]);
    const lines = describeObject(s, 0, s.map.objects[1]!);
    expect(lines[0]).toBe("Aurora Spire (Horology)");
    expect(lines[1]).toMatch(/rank of Horology/);
  });
});

describe("Hunter's Lodge", () => {
  it("gives snowshoes (snow as cheap as grass) and movement, once a week per hero", () => {
    const s = gameOn(
      field(4, 2, "n"),
      [site("hl", "hunters-lodge", 1, 1)],
      0,
      1,
    );
    const before = terrainProfile(hero(s));
    const snowStep = stepCost(s.map, before, 0, 1, 0, 0);
    expect(snowStep).toBeGreaterThan(100);
    const mp = hero(s).mp;
    const a = step(s, 1, 1);
    const h = hero(a.state);
    expect(h.buffs).toContain("hunters-lodge");
    // The step onto the lodge cost a snow step; the guides added 300.
    expect(h.mp).toBe(mp - snowStep + HUNTERS_LODGE_MP);
    expect(stepCost(a.state.map, terrainProfile(h), 0, 1, 0, 0)).toBe(100);
    const b = step(step(a.state, 0, 1).state, 1, 1);
    expect(texts(b.events)[0]).toMatch(/Already visited/);
  });
});

describe("Walrus Rookery", () => {
  it("is flagged and hires Rime Walruses, two a week at their price", () => {
    const s = gameOn(
      field(4, 2, "n"),
      [
        site("wr", "walrus-rookery", 1, 1, {
          creature: "rime-walrus",
          weekly: ROOKERY_WEEKLY,
          hire: ROOKERY_HIRE,
        }),
      ],
      0,
      1,
    );
    s.players[0]!.resources.gold = 10000;
    const a = step(s, 1, 1);
    expect(a.state.sites["wr"]?.owner).toBe(0);
    const e = a.events.find((x) => x.type === "site");
    expect(e?.type === "site" && e.options?.[0]?.id).toBe("hire:2");
    const b = ok(useSite(a.state, "hero-0", "wr", "hire:2")).state;
    expect(b.players[0]!.resources.gold).toBe(10000 - 2 * ROOKERY_HIRE);
    expect(
      hero(b).army.some((x) => x?.creature === "rime-walrus" && x.count === 2),
    ).toBe(true);
    expect(b.sites["wr"]?.stock).toBe(0);
  });

  it("rolls Rime Walruses at their hire price, watched by Rime Walruses", () => {
    expect(rollContents("walrus-rookery", createRng(1), 2)).toEqual({
      creature: "rime-walrus",
      weekly: ROOKERY_WEEKLY,
      hire: ROOKERY_HIRE,
      guardCreature: "rime-walrus",
    });
  });
});
