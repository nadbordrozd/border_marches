// Picture-first map hover cards (UI2-08, bead border_marches-bzc.59): the
// card builders for a monster, a pickup, a mine, a dwelling, a town and an
// enemy hero; Heroes count words; the threat word against the selected
// hero; the visited state; the path line; and no card over six lines.
import { describe, expect, it } from "vitest";
import { newGame } from "../../src/core/game/index.ts";
import type { GameState } from "../../src/core/game/index.ts";
import { cloneState } from "../../src/core/game/state.ts";
import { generateMap } from "../../src/core/map/generate.ts";
import { propAt } from "../../src/core/map/types.ts";
import type { MapObject } from "../../src/core/map/types.ts";
import { OBJECT_TYPES } from "../../src/data/objectTypes.ts";
import {
  MAX_CARD_LINES,
  countPhrase,
  countWord,
  mapCard,
  mapCardView,
  townCard,
} from "../../src/ui/map-card.ts";
import { mapAction } from "../../src/ui/map-clicks.ts";
import { useFakeDocument, type FakeElement } from "./fake-dom.ts";

useFakeDocument();
import type { CardLine, MapCard } from "../../src/ui/map-card.ts";
import {
  buildMap,
  field,
  gameOn,
  heroStart,
  mine,
  monster,
  pickup,
  town,
} from "../core/game/helpers.ts";

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

const HERO = "hero-0";

function card(s: GameState, x: number, y: number, player = 0): MapCard {
  const c = mapCard(s, player, x, y, HERO);
  if (c === null) throw new Error(`no card at ${x},${y}`);
  return c;
}

function kinds(c: MapCard): string[] {
  return c.lines.map((l) => l.kind);
}

function line<K extends CardLine["kind"]>(
  c: MapCard,
  kind: K,
): Extract<CardLine, { kind: K }> {
  const found = c.lines.find((l) => l.kind === kind);
  if (found === undefined) throw new Error(`no ${kind} line`);
  return found as Extract<CardLine, { kind: K }>;
}

describe("count words", () => {
  it("follows the Heroes thresholds", () => {
    expect([1, 4, 5, 9, 10, 19, 20, 49, 50, 99, 100].map(countWord)).toEqual([
      "Few",
      "Few",
      "Several",
      "Several",
      "Pack",
      "Pack",
      "Lots",
      "Lots",
      "Horde",
      "Horde",
      "Throng",
    ]);
    expect(countWord(250)).toBe("Swarm");
    expect(countWord(500)).toBe("Zounds");
    expect(countWord(1000)).toBe("Legion");
  });

  it("names a stack the Heroes way", () => {
    expect(countPhrase("goblin", 12)).toBe("Pack of Goblins");
    expect(countPhrase("goblin", 3)).toBe("Few Goblins");
    expect(countPhrase("goblin", 7)).toBe("Several Goblins");
    expect(countPhrase("goblin", 30)).toBe("Lots of Goblins");
    expect(countPhrase("troll", 1)).toBe("Lone Troll");
  });
});

describe("map cards", () => {
  it("shows a monster with its picture, count word, exact count and threat", () => {
    const s = gameOn(field(8, 3), [monster("m", 3, 1, "goblin", 12)], 1, 1);
    const c = card(s, 3, 1);
    expect(c.title).toBe("Pack of Goblins");
    expect(c.subtitle).toMatch(/^12 Goblins · tier \d$/);
    expect(c.picture?.key).toBeTruthy();
    const threat = line(c, "threat");
    expect(["easy", "likely", "even", "risky", "deadly"]).toContain(
      threat.odds,
    );
    expect(threat.hero).toBe(s.heroes[0]!.name);
    expect(line(c, "path").text).toBe("Reach: today");
    // The old abstract strength line and the move numbers are gone.
    const words = JSON.stringify(c);
    expect(words).not.toMatch(/Strength about/);
    expect(words).not.toMatch(/moves left/);
  });

  it("shows a pickup with what it gives as resource amounts", () => {
    const s = gameOn(
      field(8, 3),
      [pickup("p", 4, 1, { resource: "gold", amount: 800 })],
      1,
      1,
    );
    const c = card(s, 4, 1);
    expect(c.title).toBe("Gold");
    expect(line(c, "gives").amounts).toEqual({ gold: 800 });
    expect(c.picture?.key).toBeTruthy();
    expect(
      c.lines.some((l) => l.kind === "text" && /next cell/.test(l.text)),
    ).toBe(true);
    expect(kinds(c)).not.toContain("threat");
  });

  it("puts a guard as portraits with a count word and the threat word", () => {
    const g = monster("g", 5, 1, "goblin", 25);
    g.data["guards"] = ["p"];
    const s = gameOn(
      field(8, 3),
      [pickup("p", 4, 1, { resource: "wood", amount: 6 }), g],
      1,
      1,
    );
    const c = card(s, 4, 1);
    const stacks = line(c, "stacks");
    expect(stacks.label).toBe("Guarded by");
    expect(stacks.stacks).toEqual([
      expect.objectContaining({
        creature: "goblin",
        count: 25,
        word: "Lots",
        name: "25 Goblins",
      }),
    ]);
    expect(kinds(c)).toContain("threat");
    // The guarded stack's own card names what it guards.
    expect(
      card(s, 5, 1).lines.some(
        (l) => l.kind === "text" && /^Guards /.test(l.text),
      ),
    ).toBe(true);
  });

  it("shows a mine's daily yield and owner", () => {
    const s = cloneState(gameOn(field(8, 3), [mine("mn", 5, 1, "wood")], 1, 1));
    const c = card(s, 5, 1);
    expect(c.title).toBe("Sawmill");
    expect(c.subtitle).toBe("Unclaimed");
    expect(line(c, "gives")).toEqual(
      expect.objectContaining({ amounts: { wood: 3 }, sign: "+" }),
    );
    s.mines["mn"]!.owner = 0;
    expect(card(s, 5, 1).subtitle).toBe("Yours");
    s.mines["mn"]!.owner = 1;
    expect(card(s, 5, 1).subtitle).toMatch(/'s$/);
  });

  it("shows a dwelling's offer and a site's visited state", () => {
    const s = cloneState(
      gameOn(
        field(10, 3),
        [
          site("d", "stray-hut", 4, 1, { creature: "goblin" }),
          site("sh", "stat-shrine", 7, 1, { stat: "attack" }),
        ],
        1,
        1,
      ),
    );
    const d = card(s, 4, 1);
    expect(d.title).toContain("Goblins");
    expect(d.picture?.key).toBeTruthy();
    expect(d.lines[0]).toEqual(expect.objectContaining({ kind: "text" }));
    const sh = card(s, 7, 1);
    expect(line(sh, "visited")).toEqual(
      expect.objectContaining({ done: false }),
    );
    s.sites = {
      ...s.sites,
      sh: { ...(s.sites?.["sh"] ?? {}), heroes: [HERO] },
    };
    expect(line(card(s, 7, 1), "visited").done).toBe(true);
  });

  it("shows a town's income, garrison and owner", () => {
    const s = cloneState(
      gameOn(
        field(8, 3),
        [town("own", 3, 1, 0), town("foe", 6, 1, null)],
        1,
        1,
      ),
    );
    const own = card(s, 3, 1);
    expect(own.title).toBe(s.towns["own"]!.name);
    expect(own.subtitle).toMatch(/Yours/);
    expect(own.picture?.key).toBeTruthy();
    expect(kinds(own)[0]).toBe("gives");
    expect(
      own.lines.some((l) => l.kind === "text" && /Double-click/.test(l.text)),
    ).toBe(true);
    s.towns["foe"]!.garrison[0] = { creature: "goblin", count: 40 };
    const foe = card(s, 6, 1);
    expect(foe.subtitle).toMatch(/Neutral/);
    expect(line(foe, "stacks").stacks[0]?.word).toBe("Lots");
    expect(kinds(foe)).toContain("threat");
    // The side panel's card has no path line or open hint.
    const panel = townCard(s, 0, "own")!;
    expect(kinds(panel)).not.toContain("path");
  });

  it("shows an enemy hero's army and the threat word", () => {
    const s = cloneState(
      newGame(buildMap(field(8, 3), [heroStart(1, 1, 0), heroStart(5, 1, 1)])),
    );
    const me = s.heroes.find((h) => h.owner === 0)!;
    const foe = s.heroes.find((h) => h.owner === 1)!;
    s.players[0]!.explored = s.players[0]!.explored.map(() => true);
    const c = mapCard(s, 0, foe.x, foe.y, me.id)!;
    expect(c.title).toBe(foe.name);
    expect(c.subtitle).toMatch(/Level \d+ .* · \w+/);
    expect(kinds(c)).toEqual(expect.arrayContaining(["stacks", "threat"]));
    // Its own player sees moves and mana instead.
    const mine = mapCard(s, 1, foe.x, foe.y)!;
    expect(kinds(mine)).not.toContain("threat");
    expect(
      mine.lines.some((l) => l.kind === "text" && /^Moves /.test(l.text)),
    ).toBe(true);
    // The stats line is a readout: no Power and Lore boxes (bead bzc.80).
    const stats = mine.lines.find(
      (l) => l.kind === "text" && /^Attack \d/.test(l.text),
    );
    expect(stats).toEqual(expect.objectContaining({ plain: true }));
    const view = mapCardView(mine) as unknown as FakeElement;
    const skipped = view
      .all("gm-tip-line")
      .filter((n) => n.dataset["kwSkip"] !== undefined)
      .map((n) => n.textContent);
    expect(skipped).toEqual([expect.stringMatching(/Power \d+, Lore \d+$/)]);
  });

  it("keeps unexplored ground a one-line card", () => {
    const s = cloneState(gameOn(field(8, 3), [], 1, 1));
    s.players[0]!.explored = s.players[0]!.explored.map(() => false);
    expect(card(s, 6, 2)).toEqual(
      expect.objectContaining({ title: "Unexplored", small: true }),
    );
  });

  it("never exceeds six lines on a whole generated map", () => {
    const s = cloneState(newGame(generateMap(11, { size: "S" })));
    s.players[0]!.explored = s.players[0]!.explored.map(() => true);
    const hero = s.heroes.find((h) => h.owner === 0)!;
    let cards = 0;
    for (let y = 0; y < s.map.height; y++)
      for (let x = 0; x < s.map.width; x++) {
        const c = mapCard(s, 0, x, y, hero.id);
        if (c === null) continue;
        cards++;
        expect(c.lines.length, `${c.title} at ${x},${y}`).toBeLessThanOrEqual(
          MAX_CARD_LINES,
        );
      }
    expect(cards).toBe(s.map.width * s.map.height);
    // Impassable props (bead bzc.72) lead with their own look.
    const prop = (s.map.decorations ?? []).find((d) => propAt(s.map, d.x, d.y));
    expect(prop).toBeDefined();
    if (prop !== undefined) {
      const c = mapCard(s, 0, prop.x, prop.y, hero.id)!;
      expect(c.picture?.key).toMatch(/^decoration-/);
      expect(kinds(c)).toEqual(["text", "text"]);
      // Flavour, never scanned for keywords ("the size of a hut").
      expect(c.lines.every((l) => l.kind === "text" && l.plain === true)).toBe(
        true,
      );
      // The view marks them so the tooltip's highlighter passes them by.
      const view = mapCardView(c) as unknown as FakeElement;
      const lines = view.all("gm-tip-line");
      expect(lines.length).toBe(2);
      for (const n of lines) expect(n.dataset["kwSkip"]).toBe("");
    }
  });
});

describe("map card view", () => {
  it("leads with the picture and draws guards as portraits", () => {
    const g = monster("g", 5, 1, "goblin", 12);
    g.data["guards"] = ["p"];
    const s = gameOn(
      field(8, 3),
      [pickup("p", 4, 1, { resource: "gold", amount: 800 }), g],
      1,
      1,
    );
    const view = mapCardView(card(s, 4, 1)) as unknown as FakeElement;
    const head = view.one("gm-tip-head")!;
    expect(head.children[0]?.classList.contains("gm-card-frame")).toBe(true);
    expect(view.one("gm-card-gives")?.textContent).toContain("800");
    const stack = view.one("gm-card-stack")!;
    expect(stack.one("gm-card-portrait")).toBeDefined();
    expect(stack.textContent).toBe("Pack12");
    expect(view.one("gm-card-threat")?.textContent).toMatch(/ for /);
    expect(view.one("gm-tip-path")?.textContent).toBe("Reach: today");
  });
});

describe("map card path line", () => {
  it("agrees with the status line behind a guard (bead bzc.77)", () => {
    // The stack at (5,2) guards rows 1-3; mountains close rows 0 and 4.
    const rows = [
      "ggggMMMgggg",
      "ggggggggggg",
      "ggggggggggg",
      "ggggggggggg",
      "ggggMMMgggg",
    ];
    const s = cloneState(
      gameOn(
        rows,
        [monster("m", 5, 2, "goblin", 10), mine("mo", 9, 2, "ore")],
        1,
        2,
      ),
    );
    for (const p of s.players) p.explored.fill(true);
    const h = s.heroes[0]!;
    h.mp = 1500;
    h.maxMp = 1500;
    const ask = (planned: { x: number; y: number } | null) =>
      mapAction({
        state: s,
        player: 0,
        heroId: h.id,
        x: 9,
        y: 2,
        planned,
        aiming: null,
      }).text;
    const path = line(card(s, 9, 2), "path");
    expect(path.blocked).toBe(true);
    expect(path.text).toMatch(/^Blocked by 10 Goblins: defeat them first/);
    expect(ask(null)).toBe(path.text);
    // The planned target asks to attack.
    expect(ask({ x: 9, y: 2 })).toBe(`${path.text}. Click again to attack.`);
  });

  it("agrees with the status line past a visit in a gap (bead bzc.79)", () => {
    const rows = ["MMMMMMMMMMM", "ggggggggggg", "MMMMMMMMMMM"];
    const s = cloneState(
      gameOn(rows, [mine("mo", 5, 1, "ore"), mine("mw", 9, 1, "wood")], 1, 1),
    );
    for (const p of s.players) p.explored.fill(true);
    const h = s.heroes[0]!;
    h.mp = 1500;
    h.maxMp = 1500;
    const path = line(card(s, 9, 1), "path");
    expect(path.text).toBe("On the way: visit the Ore Pit first");
    expect(path.blocked).not.toBe(true);
    const status = mapAction({
      state: s,
      player: 0,
      heroId: h.id,
      x: 9,
      y: 1,
      planned: null,
      aiming: null,
    }).text;
    expect(status).toBe(path.text);
  });
});
