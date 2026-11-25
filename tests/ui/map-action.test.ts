// What a click on the hovered map cell does (UI2-07, bead bzc.58): the
// cursor and the status line under the map, on small hand-built states.
import { describe, expect, it } from "vitest";
import type { GameState, HeroState } from "../../src/core/game/index.ts";
import type { MapObject } from "../../src/core/map/types.ts";
import { getCreature } from "../../src/data/creatures.ts";
import type { AdventureAim } from "../../src/ui/adventure-targets.ts";
import {
  clickTarget,
  mapAction,
  targetName,
  whenWords,
  type MapActionInput,
} from "../../src/ui/map-clicks.ts";
import {
  field,
  gameOn,
  mine,
  monster,
  pickup,
  town,
} from "../core/game/helpers.ts";

const ODDS = /: (easy victory|likely victory|an even fight|risky|deadly)/;

function hero(s: GameState): HeroState {
  return s.heroes.find((h) => h.id === "hero-0") as HeroState;
}

/** Hero at (1, 2) on a 12x5 field, everything explored, a day's movement. */
function world(rows: string[], objects: MapObject[]): GameState {
  const s = gameOn(rows, objects, 1, 2);
  for (const p of s.players) p.explored.fill(true);
  const h = hero(s);
  h.mp = 1500;
  h.maxMp = 1500;
  return s;
}

function at(
  s: GameState,
  x: number,
  y: number,
  more: Partial<MapActionInput> = {},
) {
  return mapAction({
    state: s,
    player: 0,
    heroId: "hero-0",
    x,
    y,
    planned: null,
    aiming: null,
    ...more,
  });
}

const goblins = (n: number) => `${n} ${getCreature("goblin").plural}`;

describe("mapAction: walking", () => {
  it("walks to a free cell today", () => {
    const s = world(field(12, 5), []);
    expect(at(s, 3, 2)).toEqual({ cursor: "walk", text: "Walk here" });
  });

  it("walks tomorrow, or in some days, with its own cursor", () => {
    const s = world(field(12, 5), []);
    hero(s).mp = 0;
    expect(at(s, 3, 2)).toEqual({
      cursor: "walk-later",
      text: "Walk here: tomorrow",
    });
    hero(s).maxMp = 150;
    const far = at(s, 10, 2);
    expect(far.cursor).toBe("walk-later");
    expect(far.text).toMatch(/^Walk here: in \d+ days$/);
  });

  it("says to click again on the planned destination", () => {
    const s = world(field(12, 5), []);
    expect(at(s, 3, 2, { planned: { x: 3, y: 2 } }).text).toBe(
      "Walk here. Click again to go.",
    );
    expect(at(s, 4, 2, { planned: { x: 3, y: 2 } }).text).toBe("Walk here");
  });

  it("does nothing on the selected hero or with no hero", () => {
    const s = world(field(12, 5), []);
    expect(at(s, 1, 2)).toEqual({ cursor: "none", text: "" });
    expect(at(s, 3, 2, { heroId: null })).toEqual({ cursor: "none", text: "" });
  });
});

describe("mapAction: targets", () => {
  it("attacks a neutral stack with the battle estimate", () => {
    const s = world(field(12, 5), [monster("m", 6, 2, "goblin", 10)]);
    const a = at(s, 6, 2);
    expect(a.cursor).toBe("attack");
    expect(a.text.startsWith(`Attack ${goblins(10)}`)).toBe(true);
    expect(a.text).toMatch(ODDS);
  });

  it("visits a mine from any of its cells", () => {
    const s = world(field(12, 5), [mine("mine-ore", 8, 2, "ore")]);
    expect(at(s, 8, 2)).toEqual({ cursor: "visit", text: "Visit the Ore Pit" });
  });

  it("picks up a resource pile from the next cell (bead bzc.49)", () => {
    const s = world(field(12, 5), [
      pickup("p", 4, 2, { resource: "gold", amount: 800 }),
    ]);
    expect(at(s, 4, 2)).toEqual({ cursor: "pickup", text: "Pick up 800 gold" });
    const chest = world(field(12, 5), [pickup("c", 4, 2, { chest: true })]);
    expect(at(chest, 4, 2).text).toBe("Pick up the treasure chest");
  });

  it("fights the stack guarding a pickup first", () => {
    const s = world(field(12, 5), [
      pickup("p", 6, 2, { resource: "wood", amount: 5 }),
      monster("m", 7, 2, "goblin", 10),
    ]);
    const a = at(s, 6, 2);
    expect(a.cursor).toBe("attack");
    expect(a.text).toMatch(
      new RegExp(`^Pick up 5 wood: fight ${goblins(10)} first \\(`),
    );
  });

  it("enters an own town, opens it with the hero inside or no hero", () => {
    const own = {
      ...town("t", 6, 2, 0),
      data: { faction: "lost-world", owner: 0, name: "Oathmere" },
    };
    const s = world(field(12, 5), [own]);
    expect(at(s, 6, 2)).toEqual({ cursor: "town", text: "Enter Oathmere" });
    expect(at(s, 6, 2, { heroId: null })).toEqual({
      cursor: "town",
      text: "Open Oathmere",
    });
    hero(s).x = 6;
    expect(at(s, 6, 2)).toEqual({ cursor: "town", text: "Open Oathmere" });
  });

  it("captures an empty neutral town and attacks a garrisoned one", () => {
    const neutral = {
      ...town("t", 6, 2, null),
      data: { faction: "goblin", owner: null, name: "Muckhole" },
    };
    const s = world(field(12, 5), [neutral]);
    const t = s.towns["t"];
    if (t === undefined) throw new Error("no town");
    t.garrison = t.garrison.map(() => null);
    expect(at(s, 6, 2)).toEqual({ cursor: "town", text: "Capture Muckhole" });
    t.garrison[0] = { creature: "goblin", count: 30 };
    const a = at(s, 6, 2);
    expect(a.cursor).toBe("attack");
    expect(a.text).toMatch(/^Attack Muckhole: /);
  });

  it("meets an own hero side by side, else selects it", () => {
    const s = world(field(12, 5), []);
    const other: HeroState = {
      ...structuredClone(hero(s)),
      id: "hero-9",
      name: "Sir Cuthbert",
      x: 2,
      y: 2,
    };
    s.heroes.push(other);
    expect(at(s, 2, 2)).toEqual({ cursor: "meet", text: "Meet Sir Cuthbert" });
    other.x = 6;
    expect(at(s, 6, 2)).toEqual({
      cursor: "none",
      text: "Select Sir Cuthbert",
    });
  });
});

describe("mapAction: can't reach", () => {
  it("refuses mountains, water and walled-off ground", () => {
    const rows = [
      "gggggg~~~ggg",
      "gggggg~g~ggg",
      "ggMggg~~~ggg",
      "gggggggggggg",
      "gggggggggggg",
    ];
    const s = world(rows, []);
    expect(at(s, 2, 2)).toEqual({ cursor: "blocked", text: "Can't reach" });
    expect(at(s, 6, 0)).toEqual({ cursor: "blocked", text: "Can't reach" });
    expect(at(s, 7, 1)).toEqual({ cursor: "blocked", text: "Can't reach" });
  });

  it("names an unreachable target", () => {
    const rows = ["ggggg~ggg", "ggggg~ggg", "ggggg~ggg"];
    const s = world(rows, [mine("mine-ore", 7, 1, "ore")]);
    hero(s).y = 1;
    expect(at(s, 7, 1).text).toBe("Can't reach the Ore Pit");
  });

  it("names an impassable prop (bead bzc.72)", () => {
    const s = world(field(12, 5), []);
    s.map.decorations = [{ id: "fallen-log", x: 6, y: 2, variant: 0 }];
    // Two cells wide, from (6, 2) east.
    for (const x of [6, 7]) {
      const c = s.map.cells[2 * 12 + x];
      if (c !== undefined) c.prop = true;
    }
    expect(at(s, 7, 2)).toEqual({
      cursor: "blocked",
      text: "Can't walk there: Fallen Log",
    });
  });

  it("refuses unexplored ground", () => {
    const s = world(field(12, 5), []);
    const p = s.players.find((x) => x.id === 0);
    if (p === undefined) throw new Error("no player");
    p.explored[2 * 12 + 10] = false;
    expect(at(s, 10, 2)).toEqual({
      cursor: "blocked",
      text: "Can't reach: unexplored",
    });
  });
});

describe("mapAction: blocked by a guard (bead bzc.77)", () => {
  const BLOCKED = (who: string, them: string) =>
    new RegExp(
      `^Blocked by ${who}: defeat ${them} first \\((easy victory|likely victory|an even fight|risky|deadly)(, tomorrow)?\\)`,
    );

  it("names the guard in the way of a target, with the odds", () => {
    // The stack at (5,2) guards rows 1-3; mountains close rows 0 and 4.
    const rows = [
      "ggggMMMgggg",
      "ggggggggggg",
      "ggggggggggg",
      "ggggggggggg",
      "ggggMMMgggg",
    ];
    const s = world(rows, [
      monster("m", 5, 2, "goblin", 10),
      mine("mine-ore", 9, 2, "ore"),
    ]);
    const a = at(s, 9, 2);
    expect(a.cursor).toBe("attack");
    expect(a.text).toMatch(BLOCKED(goblins(10), "them"));
    expect(a.text).not.toMatch(/tomorrow/);
    // A plain cell beyond the guard says the same.
    expect(at(s, 10, 0).text).toMatch(BLOCKED(goblins(10), "them"));
    // The planned target asks for the second click.
    expect(at(s, 9, 2, { planned: { x: 9, y: 2 } }).text).toMatch(
      /\)\. Click again to go\.$/,
    );
  });

  it("says when the fight comes and words a single creature", () => {
    const rows = ["gggMggg", "ggggggg", "ggggggg", "ggggggg", "gggMggg"];
    const s = world(rows, [monster("m", 3, 2, "goblin", 1)]);
    hero(s).mp = 0;
    const a = at(s, 6, 2);
    expect(a.text).toMatch(BLOCKED(`1 ${getCreature("goblin").name}`, "it"));
    expect(a.text).toMatch(/, tomorrow\)$/);
  });

  it("still says can't reach when no fight opens the way", () => {
    const rows = ["ggggg~ggg", "ggggg~ggg", "ggggg~ggg"];
    const s = world(rows, [monster("m", 3, 1), mine("mine-ore", 7, 1, "ore")]);
    hero(s).y = 1;
    expect(at(s, 7, 1).text).toBe("Can't reach the Ore Pit");
  });
});

describe("mapAction: spell aiming (bead bzc.47)", () => {
  const aims: AdventureAim[] = [
    { x: 3, y: 2, label: "10 Goblin", target: { monsterId: "m" } },
    { x: 5, y: 2, label: "cell", target: { x: 5, y: 2 }, noEffect: "all seen" },
  ];
  it("casts on a glowing target and refuses the rest", () => {
    const s = world(field(12, 5), [monster("m", 3, 2)]);
    const aiming = { spell: "parley", aims };
    expect(at(s, 3, 2, { aiming })).toEqual({
      cursor: "cast",
      text: "Cast Parley on 10 Goblin",
    });
    expect(at(s, 5, 2, { aiming })).toEqual({
      cursor: "blocked",
      text: "No effect: all seen",
    });
    expect(at(s, 8, 2, { aiming })).toEqual({
      cursor: "blocked",
      text: "Parley: click a glowing neutral stack to cast. Esc cancels.",
    });
  });
});

describe("map action helpers", () => {
  it("send a click on a building's other cells to its entrance", () => {
    const site: MapObject = {
      id: "s",
      kind: "site",
      x: 4,
      y: 3,
      footprint: { w: 2, h: 2 },
      blocked: [
        [4, 2],
        [5, 2],
        [5, 3],
      ],
      data: { type: "windmill" },
    };
    expect(clickTarget(site, 5, 2)).toEqual({ x: 4, y: 3 });
    expect(clickTarget(undefined, 5, 2)).toEqual({ x: 5, y: 2 });
    const s = world(field(12, 5), []);
    expect(targetName(s, site)).toMatch(/^the /);
  });

  it("word the day of arrival", () => {
    expect(whenWords(0)).toBe("");
    expect(whenWords(1)).toBe("tomorrow");
    expect(whenWords(3)).toBe("in 3 days");
  });
});
