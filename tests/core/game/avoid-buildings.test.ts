// Paths go round visitable buildings unless the building is the target
// (bead bzc.107): shrines, wells, mines, dwellings, banks and towns are
// stood on only when they are the clicked cell or no way round exists
// (then the step is marked: PathStep.building). Pickups are not buildings.
import { describe, expect, it } from "vitest";
import { pathIn, reachFor } from "../../../src/core/ai/reach.ts";
import {
  findPath,
  moveHeroAlong,
  type GameState,
  type Path,
} from "../../../src/core/game/index.ts";
import type { MapObject } from "../../../src/core/map/types.ts";
import { OBJECT_TYPES } from "../../../src/data/objectTypes.ts";
import { pathMarkers } from "../../../src/render/map/path-markers.ts";
import { gameOn, mine, ok, pickup, town } from "./helpers.ts";

/** As the player's clicks plan (src/ui/map-clicks.ts PLAN_OPTIONS). */
const PLAN = { throughGuards: true, ignoreFog: true } as const;

function site(
  id: string,
  type: keyof typeof OBJECT_TYPES,
  x: number,
  y: number,
): MapObject {
  const def = OBJECT_TYPES[type];
  return {
    id,
    kind: def.kind,
    x,
    y,
    footprint: { w: 1, h: 1 },
    blocked: [],
    data: { type, value: def.value },
  };
}

/** A road along the middle of a three-row strip of grass. */
const ROAD = ["ggggggg", "#######", "ggggggg"];

const on = (p: Path | null, x: number, y: number): boolean =>
  p?.steps.some((s) => s.x === x && s.y === y) ?? false;

/** The player's mines and towns among `ids` owned by player 0. */
function own(s: GameState, ids: string[]): GameState {
  const mines = { ...s.mines };
  const towns = { ...s.towns };
  for (const id of ids) {
    const m = mines[id];
    if (m !== undefined) mines[id] = { ...m, owner: 0 };
    const t = towns[id];
    if (t !== undefined) towns[id] = { ...t, owner: 0 };
  }
  return { ...s, mines, towns };
}

describe("paths go round buildings (bead bzc.107)", () => {
  it("routes round a shrine on a road", () => {
    const s = gameOn(ROAD, [site("sh", "stat-shrine", 3, 1)], 0, 1);
    for (const opts of [{ ignoreFog: true }, PLAN]) {
      const p = findPath(s, "hero-0", 6, 1, opts);
      expect(p).not.toBeNull();
      expect(on(p, 3, 1)).toBe(false);
      expect(p?.steps.at(-1)).toMatchObject({ x: 6, y: 1 });
      expect(p?.stopsAt).toBeUndefined();
      expect(p?.steps.some((st) => st.building !== undefined)).toBe(false);
    }
  });

  it("routes round own mines and towns, whose visit would not stop it", () => {
    const s = own(
      gameOn(ROAD, [mine("saw", 2, 1, "wood"), town("t", 4, 1, 0)], 0, 1),
      ["saw", "t"],
    );
    const p = findPath(s, "hero-0", 6, 1, PLAN);
    expect(on(p, 2, 1)).toBe(false);
    expect(on(p, 4, 1)).toBe(false);
    expect(p?.steps.at(-1)).toMatchObject({ x: 6, y: 1 });
  });

  it("paths onto the shrine when it is the clicked target", () => {
    const s = gameOn(ROAD, [site("sh", "stat-shrine", 3, 1)], 0, 1);
    const p = findPath(s, "hero-0", 3, 1, PLAN);
    expect(p?.steps.map((st) => [st.x, st.y])).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
    ]);
    expect(p?.steps.at(-1)?.building).toBeUndefined();
    expect(p?.stopsAt).toBeUndefined();
  });

  it("takes a pickup lying on the only way, with no building mark", () => {
    const s = gameOn(
      ["ggggg"],
      [pickup("p", 2, 0, { resource: "wood", amount: 5 })],
      0,
      0,
    );
    const p = findPath(s, "hero-0", 4, 0, PLAN);
    expect(p?.stopsAt).toBe("p");
    expect(p?.steps.at(-1)).toMatchObject({ x: 2, pickup: true });
    expect(p?.steps.some((st) => st.building !== undefined)).toBe(false);
    const after = ok(moveHeroAlong(s, "hero-0", p?.steps ?? [])).state;
    expect(after.collected).toContain("p");
  });

  it("passes a building on the only way, marking the step", () => {
    // A one-row corridor: the own mine's entrance is the only way on.
    const s = own(gameOn(["ggggg"], [mine("saw", 2, 0, "wood")], 0, 0), [
      "saw",
    ]);
    const p = findPath(s, "hero-0", 4, 0, PLAN);
    expect(p?.steps.map((st) => [st.x, st.building])).toEqual([
      [1, undefined],
      [2, "saw"],
      [3, undefined],
      [4, undefined],
    ]);
    // The preview rings that step instead of an arrow.
    const kinds = pathMarkers(
      (p?.steps ?? []).map((st) => ({
        x: st.x,
        y: st.y,
        reachable: true,
        ...(st.building === undefined ? {} : { visit: true }),
      })),
    ).map((m) => m.kind);
    expect(kinds.filter((k) => k === "visit")).toHaveLength(1);
    // Walking it does not stop on the own mine.
    const moved = ok(moveHeroAlong(s, "hero-0", p?.steps ?? []));
    expect(moved.state.heroes[0]).toMatchObject({ x: 4, y: 0 });
  });

  it("a shrine on the only way ends the planned walk there, marked", () => {
    const s = gameOn(["ggggg"], [site("sh", "stat-shrine", 2, 0)], 0, 0);
    expect(findPath(s, "hero-0", 4, 0, { ignoreFog: true })).toBeNull();
    const p = findPath(s, "hero-0", 4, 0, PLAN);
    expect(p?.stopsAt).toBe("sh");
    expect(p?.steps.at(-1)).toMatchObject({ x: 2, building: "sh" });
  });
});

describe("the AI's reach goes round buildings too (bead bzc.107)", () => {
  const allSeen = (s: GameState): GameState => ({
    ...s,
    players: s.players.map((p) => ({
      ...p,
      explored: p.explored.map(() => true),
    })),
  });

  it("walks beside a shrine it does not target", () => {
    const s = allSeen(gameOn(ROAD, [site("sh", "stat-shrine", 3, 1)], 0, 1));
    const hero = s.heroes[0]!;
    const r = reachFor(s, hero, 3000);
    const around = pathIn(r, hero, 1 * 7 + 6);
    expect(around?.some((st) => st.x === 3 && st.y === 1)).toBe(false);
    expect(around?.at(-1)).toMatchObject({ x: 6, y: 1 });
    expect(r.cost.get(1 * 7 + 6)).toBe(around?.at(-1)?.total);
  });

  it("still walks straight onto a site it targets", () => {
    const s = allSeen(gameOn(ROAD, [site("sh", "stat-shrine", 3, 1)], 0, 1));
    const hero = s.heroes[0]!;
    const to = pathIn(reachFor(s, hero, 3000), hero, 1 * 7 + 3);
    expect(to?.map((st) => [st.x, st.y, st.cost])).toEqual([
      [1, 1, 70],
      [2, 1, 70],
      [3, 1, 70],
    ]);
  });

  it("passes a site when it is the only way on", () => {
    const s = allSeen(gameOn(["ggggg"], [site("sh", "stat-shrine", 2, 0)]));
    const hero = s.heroes[0]!;
    const p = pathIn(reachFor(s, hero, 3000), hero, 4);
    expect(p?.map((st) => st.x)).toEqual([1, 2, 3, 4]);
  });
});
