// How a visit's outcome is shown (bead border_marches-bzc.81): plain
// pickups (resources, gold, a bare experience bump) float over the hero;
// anything that carries information is a dialog the player dismisses. The
// cases run real visits on small hand-built states, so the texts are the
// rules' own.
import { describe, expect, it } from "vitest";
import {
  moveHeroAlong,
  useSite,
  type GameEvent,
  type GameState,
} from "../../src/core/game/index.ts";
import { cloneState } from "../../src/core/game/state.ts";
import type { MapObject } from "../../src/core/map/types.ts";
import { OBJECT_TYPES } from "../../src/data/objectTypes.ts";
import {
  areaCells,
  clipArea,
  digResult,
  isPlainPrize,
  siteResult,
  visitShow,
  type VisitResult,
} from "../../src/ui/visit-results.ts";
import { field, gameOn, ok } from "../core/game/helpers.ts";

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

/** A hero at (0, 1) with no school, next to the object at (1, 1). */
function beside(obj: MapObject, extra: MapObject[] = []): GameState {
  const s = cloneState(gameOn(field(6, 3), [obj, ...extra], 0, 1));
  const h = s.heroes[0]!;
  h.skills = [];
  h.pages = [];
  h.feats = [];
  return s;
}

/** Steps onto the object; returns its "site" line as presented. */
function visit(s: GameState, obj: MapObject): VisitResult {
  const r = ok(moveHeroAlong(s, "hero-0", [{ x: obj.x, y: obj.y }]));
  return presented(r.state, obj, r.events);
}

function presented(
  s: GameState,
  obj: MapObject,
  events: readonly GameEvent[],
): VisitResult {
  const e = events.find(
    (x): x is Extract<GameEvent, { type: "site" }> => x.type === "site",
  );
  if (e === undefined) throw new Error("no site line");
  return siteResult(s, obj, e.text, e.area ?? null, s.heroes[0]);
}

describe("plain prizes", () => {
  it("knows resources and experience from anything else", () => {
    expect(isPlainPrize("1000 gold, 5 wood")).toBe(true);
    expect(isPlainPrize("+1000 experience.")).toBe(true);
    expect(isPlainPrize("500 gold, 2 essence, 1500 experience")).toBe(true);
    expect(isPlainPrize("1000 gold, a Tin Sabre")).toBe(false);
    expect(isPlainPrize("a scroll of Spark")).toBe(false);
    expect(isPlainPrize("")).toBe(false);
  });

  it("floats plain lines and a hire or sale, shows the rest", () => {
    expect(visitShow("Windmill", "Windmill: 5 wood.")).toBe("float");
    expect(
      visitShow("Learning Stone", "Learning Stone: +1000 experience."),
    ).toBe("float");
    expect(visitShow("Faction Outpost", "Hired 5 Goblins.")).toBe("float");
    expect(visitShow("Tollhouse", "Sold a Tin Sabre for 250 gold.")).toBe(
      "float",
    );
    expect(
      visitShow("Windmill", "Windmill: already collected this week."),
    ).toBe("dialog");
    expect(visitShow("Tutor's Hut", "Tutor's Hut: learns Greencraft.")).toBe(
      "dialog",
    );
    expect(visitShow("Mana Well", "Mana Well: mana restored.")).toBe("dialog");
  });
});

describe("real visits", () => {
  it("a windmill's take floats; the second visit's refusal is a dialog", () => {
    const mill = site("w", "windmill", 1, 1);
    const s0 = beside(mill);
    const first = ok(moveHeroAlong(s0, "hero-0", [{ x: 1, y: 1 }]));
    expect(presented(first.state, mill, first.events).show).toBe("float");
    // Back off and step on again the same week.
    const off = ok(moveHeroAlong(first.state, "hero-0", [{ x: 0, y: 1 }]));
    const again = visit(off.state, mill);
    expect(again.show).toBe("dialog");
    expect(again.sentence).toMatch(/already collected/i);
  });

  it("a campfire and a learning stone float", () => {
    expect(
      visit(
        beside(site("c", "campfire", 1, 1, { gold: 500, amount: 4 })),
        site("c", "campfire", 1, 1),
      ).show,
    ).toBe("float");
    expect(
      visit(
        beside(site("l", "learning-stone", 1, 1)),
        site("l", "learning-stone", 1, 1),
      ).show,
    ).toBe("float");
  });

  it("a stat shrine is a dialog with the stat's icon", () => {
    const obj = site("s", "stat-shrine", 1, 1, { stat: "defense" });
    const r = visit(beside(obj), obj);
    expect(r.show).toBe("dialog");
    expect(r.title).toMatch(/^Stat Shrine/);
    expect(r.sentence).toMatch(/^\+1 Defense/);
    expect(r.icons).toEqual([{ kind: "stat", id: "defense" }]);
  });

  it("a school shrine says why a hero with no school got a scroll", () => {
    const obj = site("sh", "school-shrine", 1, 1, {
      spell: "jolt",
      tier: 1,
      school: "storm",
    });
    const r = visit(beside(obj), obj);
    expect(r.show).toBe("dialog");
    expect(r.sentence).toMatch(/scroll/);
    expect(r.icons).toEqual([{ kind: "spell", id: "jolt" }]);
    expect(r.note).toMatch(/Storm rank 1/);
  });

  it("a library refusal names its reason in a dialog", () => {
    const obj = site("lib", "library", 1, 1);
    const r = visit(beside(obj), obj);
    expect(r.show).toBe("dialog");
    expect(r.sentence).toMatch(/level 8/);
  });

  it("a bought rumour is a dialog with its 5x5 area", () => {
    const inn = site("inn", "roadside-inn", 1, 1);
    const cache = site("bc", "buried-cache", 4, 1, {
      prize: { gold: 2000 },
      buried: true,
    });
    cache.kind = "buried";
    const s0 = beside(inn, [cache]);
    s0.players[0]!.resources.gold = 5000;
    const at = ok(moveHeroAlong(s0, "hero-0", [{ x: 1, y: 1 }]));
    const bought = ok(useSite(at.state, "hero-0", "inn", "rumour"));
    const r = presented(bought.state, inn, bought.events);
    expect(r.show).toBe("dialog");
    expect(r.sentence).toMatch(/^Rumour: a cache lies buried/);
    expect(r.area).not.toBeNull();
    // Clipped to the 6x3 map, and the cache's cell is inside.
    const cells = areaCells(r.area!);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((c) => c.x >= 0 && c.y >= 0 && c.x < 6 && c.y < 3)).toBe(
      true,
    );
    expect(cells).toContainEqual({ x: 4, y: 1 });
  });
});

describe("areas and digs", () => {
  it("clips an area to the map", () => {
    const s = gameOn(field(6, 3), []);
    expect(clipArea(s, { x: -2, y: -1, w: 5, h: 5 })).toEqual({
      x: 0,
      y: 0,
      w: 3,
      h: 3,
    });
    expect(areaCells({ x: 1, y: 1, w: 2, h: 1 })).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
  });

  it("floats a plain find; nothing or an artifact is a dialog", () => {
    expect(digResult("1000 gold, 5 wood").show).toBe("float");
    expect(digResult(null).show).toBe("dialog");
    expect(digResult(null).note).toMatch(/whole day/);
    expect(digResult("The Keystone").show).toBe("dialog");
  });
});
