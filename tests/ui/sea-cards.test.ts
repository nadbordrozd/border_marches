// The sea and coastal objects' hover cards and visit results (bead
// border_marches-bzc.151, NAVAL.md 5): producers as mines with their own
// yields, banks with their crews inside, whirlpools with the loss shown
// first, the Moored Boat with the catalogue's text, and inspectable icons
// for what a bank, shrine or chest gives (bead bzc.108).
import { describe, expect, it } from "vitest";
import type { GameState } from "../../src/core/game/index.ts";
import { shipsOf } from "../../src/core/game/index.ts";
import { validateMap, type MapObject } from "../../src/core/map/types.ts";
import { artFor } from "../../src/assets/object-art.ts";
import { OBJECT_TYPES } from "../../src/data/objectTypes.ts";
import {
  MAX_CARD_LINES,
  mapCard,
  type CardLine,
  type MapCard,
} from "../../src/ui/map-card.ts";
import { siteIcons, siteResult } from "../../src/ui/visit-results.ts";
import { STRAIT, boat, navalGame } from "../core/game/naval-helpers.ts";

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

/** Everything explored, so the cards show. */
function seen(s: GameState): GameState {
  return {
    ...s,
    players: s.players.map((p) => ({
      ...p,
      explored: p.explored.map(() => true),
    })),
  };
}

function card(s: GameState, x: number, y: number): MapCard {
  const c = mapCard(s, 0, x, y, "hero-0");
  if (c === null) throw new Error(`no card at ${x},${y}`);
  expect(c.lines.length).toBeLessThanOrEqual(MAX_CARD_LINES);
  return c;
}

const textOf = (c: MapCard): string =>
  c.lines
    .map((l: CardLine) =>
      l.kind === "text" || l.kind === "visited" || l.kind === "path"
        ? l.text
        : l.kind === "stacks"
          ? `${l.label}: ${l.stacks.map((x) => x.name).join(", ")}`
          : "",
    )
    .join(" | ");

const world = (): GameState => {
  const s = navalGame(
    STRAIT,
    [site("village", "fishing-village", 2, 8)],
    [
      site("pearls", "pearl-bed", 8, 6),
      site("wreck", "shipwreck", 11, 6, {
        size: "small",
        value: 2500,
        guard: [
          { creature: "drowned-sailor", count: 10 },
          { creature: "jellyfish", count: 10 },
        ],
        prize: { gold: 2000, wood: 5 },
      }),
      site("w1", "whirlpool", 8, 3, { pair: "p" }),
      site("w2", "whirlpool", 12, 9, { pair: "p" }),
      site("chest", "sea-chest", 6, 9),
      site("shrine", "shrine-of-the-tides", 13, 2, { spell: "gust" }),
      { ...boat("boat-1", 5, 5), data: { type: "moored-boat" } },
    ],
  );
  expect(validateMap(s.map)).toEqual([]);
  return seen(s);
};

describe("sea object cards (bzc.151)", () => {
  it("a Pearl Bed reads as a producer of essence, a Fishing Village of gold", () => {
    const s = world();
    const pearls = card(s, 8, 6);
    expect(pearls.title).toBe("Pearl Bed");
    expect(pearls.subtitle).toBe("Unclaimed");
    expect(pearls.lines[0]).toMatchObject({
      kind: "gives",
      amounts: { essence: 1 },
    });
    expect(pearls.picture?.key).toBe(artFor("pearl-bed")?.asset.key);
    const village = card(s, 2, 8);
    expect(village.title).toBe("Fishing Village");
    expect(village.lines[0]).toMatchObject({ amounts: { gold: 500 } });
  });

  it("a Shipwreck shows its drowned crew inside and its prize", () => {
    const c = card(world(), 11, 6);
    expect(c.title).toBe("Shipwreck (small)");
    expect(textOf(c)).toMatch(/Prize: 2000 gold, 5 wood/);
    expect(textOf(c)).toMatch(/Inside: 10 Drowned Sailors, 10 Jellyfish/);
    expect(c.lines.some((l) => l.kind === "threat")).toBe(true);
    expect(c.picture?.key).toBe(artFor("shipwreck", "small")?.asset.key);
  });

  it("a Whirlpool names its twin and what the hero would lose", () => {
    const c = card(world(), 8, 3);
    expect(c.title).toBe("Whirlpool");
    expect(textOf(c)).toMatch(/Its twin is at \(12, 9\)/);
    expect(textOf(c)).toMatch(/would lose \d+ /);
  });

  it("a Sea Chest is pictured as itself with its offer", () => {
    const c = card(world(), 6, 9);
    expect(c.title).toBe("Sea Chest");
    expect(textOf(c)).toMatch(/1500 gold or 1000 experience/);
    expect(c.picture?.key).toBe(artFor("sea-chest")?.asset.key);
  });

  it("a neutral ship is the catalogue's Moored Boat", () => {
    const s = world();
    expect(shipsOf(s)).toHaveLength(1);
    const c = card(s, 5, 5);
    expect(c.title).toBe("Moored Boat");
    expect(textOf(c)).toContain(OBJECT_TYPES["moored-boat"].text);
    expect(c.picture?.key).toBe(artFor("moored-boat")?.asset.key);
  });

  it("visit results show the spell, Trinket or prize as inspectable icons", () => {
    const s = world();
    const shrine = s.map.objects.find((o) => o.id === "shrine")!;
    expect(siteIcons(shrine)).toEqual([{ kind: "spell", id: "gust" }]);
    const result = siteResult(
      s,
      shrine,
      "Shrine of the Tides: the hero learns Gust.",
    );
    expect(result.show).toBe("dialog");
    expect(result.icons).toContainEqual({ kind: "spell", id: "gust" });
    const deep = site("deep", "krakens-deep", 8, 6, {
      prize: { artifacts: ["galoshes"], gold: 5000 },
    });
    expect(siteIcons(deep)).toEqual([{ kind: "artifact", id: "galoshes" }]);
  });
});
