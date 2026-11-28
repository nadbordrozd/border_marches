/**
 * The naval layer on the adventure screen (bead bzc.149): ships as drawn
 * (also mid-walk), the path preview's anchor and landing marks, the ship
 * hover card and the points left on a mixed path.
 */
import { describe, expect, it } from "vitest";
import {
  findPath,
  moveHeroAlong,
  type GameState,
} from "../../src/core/game/index.ts";
import {
  pathMarkers,
  LANDING_LABEL,
} from "../../src/render/map/path-markers.ts";
import { SHIP_ART } from "../../src/assets/map-objects.ts";
import type { PixelImage } from "../../src/render/map/ground.ts";
import {
  NEUTRAL_SAIL,
  recolourShip,
  shipLook,
} from "../../src/render/map/ship-art.ts";
import { pathSummary } from "../../src/ui/hints.ts";
import { mapCard } from "../../src/ui/map-card.ts";
import { displayObjects } from "../../src/ui/objects.ts";
import {
  carriedAtStart,
  carryStep,
  mapShips,
  shipCalledLine,
} from "../../src/ui/ships.ts";
import { ok } from "../core/game/helpers.ts";
import { STRAIT, boat, navalGame } from "../core/game/naval-helpers.ts";

function game(): GameState {
  const s = navalGame(STRAIT, [], [boat("boat-1", 5, 5)]);
  return {
    ...s,
    heroes: s.heroes.map((h) => ({
      ...h,
      mp: 1500,
      maxMp: 1500,
      seaMaxMp: 1500,
    })),
  };
}

describe("ships as drawn", () => {
  it("draws moored ships grey and not as map objects", () => {
    const s = game();
    expect(mapShips(s, [])).toEqual([{ id: "ship-1", x: 5, y: 5 }]);
    expect(displayObjects(s).some((o) => o.kind === "boat")).toBe(false);
  });

  it("carries the boarded ship along a walk and leaves it on landing", () => {
    const s = game();
    const hero = s.heroes[0]!;
    let carried = carriedAtStart(s, hero);
    expect(carried).toBeNull();
    carried = carryStep(s, carried, 5, 5);
    expect(carried).toEqual({ shipId: "ship-1", x: 5, y: 5 });
    carried = carryStep(s, carried, 6, 5);
    expect(carried).toEqual({ shipId: "ship-1", x: 6, y: 5 });
    const moved = new Map([["ship-1", { x: 6, y: 5 }]]);
    expect(mapShips(s, [{ id: hero.id, x: 6, y: 5 }], moved)).toEqual([
      { id: "ship-1", x: 6, y: 5, heroId: hero.id },
    ]);
    expect(carryStep(s, carried, 15, 5)).toBeNull();
  });

  it("colours a ship with its owner once a hero takes it", () => {
    const s = ok(moveHeroAlong(game(), "hero-0", [{ x: 5, y: 5 }])).state;
    const [ship] = mapShips(s, [{ id: "hero-0", x: 5, y: 5 }]);
    expect(ship).toMatchObject({ heroId: "hero-0" });
    expect(typeof ship?.colour).toBe("string");
  });
});

describe("the path preview at sea", () => {
  it("marks a boarding with an anchor and a day-ending landing", () => {
    const s = game();
    const path = findPath(s, "hero-0", 17, 5, { ignoreFog: true })!;
    const markers = pathMarkers(
      path.steps.map((st) => ({
        x: st.x,
        y: st.y,
        reachable: st.day === 0,
        ...(st.board === undefined ? {} : { board: true }),
        ...(st.endsDay === true ? { landEndsDay: true } : {}),
      })),
      { x: 4, y: 5 },
    );
    const centres = markers.filter(
      (m) => m.cx === m.cell.x + 0.5 && m.cy === m.cell.y + 0.5,
    );
    expect(centres.find((m) => m.cell.x === 5)?.kind).toBe("anchor");
    const landing = centres.find((m) => m.cell.x === 15);
    expect(landing).toMatchObject({ kind: "landing", label: LANDING_LABEL });
  });

  it("tells the points left from the exact conversions", () => {
    const s = game();
    const path = findPath(s, "hero-0", 12, 5, { ignoreFog: true })!;
    // 100 to board, 1400 sea points, seven sea steps: 700 left today.
    expect(pathSummary(path, s.heroes[0]!)).toMatchObject({
      days: 0,
      left: 700,
    });
  });
});

describe("the ship hover card", () => {
  it("names a moored boat and how to board it", () => {
    const s = game();
    const card = mapCard(s, 0, 5, 5, "hero-0")!;
    expect(card.title).toBe("Moored Boat");
    expect(card.subtitle).toBe("Neutral · moored");
    expect(card.lines.some((l) => l.kind === "path")).toBe(true);
  });

  it("shows the hero's card, with sea moves, when it is aboard", () => {
    const s = ok(moveHeroAlong(game(), "hero-0", [{ x: 5, y: 5 }])).state;
    const card = mapCard(s, 0, 5, 5, "hero-0")!;
    expect(card.subtitle).toContain("aboard a ship");
    expect(
      card.lines.some(
        (l) => l.kind === "text" && l.text.includes("/ 1500 at sea"),
      ),
    ).toBe(true);
  });

  it("calls open sea the sea", () => {
    const card = mapCard(game(), 0, 8, 8, "hero-0")!;
    expect(card.title).toBe("Sea");
  });
});

describe("the log line of Call the Boat (bead bzc.159)", () => {
  const event = {
    type: "ship-called",
    heroId: "hero-0",
    shipId: "ship-1",
    x: 5,
    y: 5,
    built: false,
  } as const;

  it("says what came to the player's own hero, with a new boat's price", () => {
    const s = game();
    const name = s.heroes[0]!.name;
    expect(shipCalledLine(s, event, 0)).toEqual({
      text: `${name} calls the boat: it sails up alongside`,
      quiet: false,
    });
    expect(shipCalledLine(s, { ...event, built: true }, 0)?.text).toBe(
      `${name} calls for a boat: a new one is built alongside (1000 gold, 10 wood)`,
    );
  });

  it("tells of another player's boat only on explored water, quietly", () => {
    const s = game();
    const other = 1;
    const seen = (explored: boolean): GameState => ({
      ...s,
      players: [
        s.players[0]!,
        {
          ...s.players[0]!,
          id: other,
          explored: s.players[0]!.explored.map(() => explored),
        },
      ],
    });
    expect(shipCalledLine(seen(false), event, other)).toBeNull();
    const line = shipCalledLine(seen(true), event, other);
    expect(line?.quiet).toBe(true);
    expect(line?.text).toMatch(/ calls a boat$/);
  });
});

describe("the ship art's owner colours (bead bzc.158)", () => {
  /** A 30 x 1 strip: key white at x 10 (stern, kept) and x 28 (the sail). */
  function strip(): PixelImage {
    const data = new Uint8ClampedArray(30 * 4);
    for (const x of [10, 28]) data.set([0xf5, 0xf1, 0xea, 255], x * 4);
    data.set([0xcd, 0xc7, 0xbe, 255], 29 * 4);
    return { width: 30, height: 1, data };
  }

  it("recolours the key colours right of minX only", () => {
    const out = recolourShip(strip(), SHIP_ART.sailing.ownerKey, "#d03030");
    expect([...out.data.slice(40, 44)]).toEqual([0xf5, 0xf1, 0xea, 255]);
    const sail = [...out.data.slice(28 * 4, 28 * 4 + 3)];
    expect(sail[0]!).toBeGreaterThan(sail[1]! + 40);
    const shadow = [...out.data.slice(29 * 4, 29 * 4 + 3)];
    expect(shadow[0]!).toBeLessThan(sail[0]!);
  });

  it("keeps the pirate's own colours and greys a neutral boat", () => {
    const pirate = recolourShip(strip(), SHIP_ART.pirate.ownerKey, "#d03030");
    expect([...pirate.data]).toEqual([...strip().data]);
    const grey = recolourShip(strip(), SHIP_ART.moored.ownerKey, NEUTRAL_SAIL);
    const [r, g, b] = [...grey.data.slice(28 * 4, 28 * 4 + 3)];
    expect(Math.max(r!, g!, b!) - Math.min(r!, g!, b!)).toBeLessThan(16);
  });

  it("looks sailing with a hero aboard, moored without", () => {
    expect(shipLook(true)).toBe("sailing");
    expect(shipLook(false)).toBe("moored");
  });
});
