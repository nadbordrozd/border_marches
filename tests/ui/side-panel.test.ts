// The adventure side panel (UI2-06, bead bzc.57): hero row and town row
// models, the button glyphs and the minimap's border inset, on small
// hand-built states.
import { describe, expect, it } from "vitest";
import { maxMana, newGame } from "../../src/core/game/index.ts";
import type { GameState } from "../../src/core/game/index.ts";
import { generateMap } from "../../src/core/map/generate.ts";
import { findFaction } from "../../src/data/factions.ts";
import { SPENT_MP } from "../../src/ui/hints.ts";
import { minimapCell, minimapLayout } from "../../src/ui/minimap.ts";
import {
  GLYPHS,
  glyphRuns,
  heroRow,
  readyToHire,
  townRow,
} from "../../src/ui/side-panel.ts";

let cached: GameState | undefined;
function game(): GameState {
  cached ??= newGame(generateMap(7, { size: "S", players: 2 }), {
    players: [
      { kind: "human", faction: "humans" },
      { kind: "ai", faction: "undead" },
    ],
  });
  return structuredClone(cached);
}

describe("hero rows", () => {
  it("fill the movement and mana bars from the hero", () => {
    const s = game();
    const h = s.heroes.find((x) => x.owner === 0)!;
    h.maxMp = 1500;
    h.mp = 375;
    h.mana = Math.floor(maxMana(h) / 2);
    h.pendingLevelUps = 0;
    const row = heroRow(h);
    expect(row).toMatchObject({
      id: h.id,
      name: h.name,
      mp: 375,
      maxMp: 1500,
      mpPct: 25,
      tired: false,
      levelUp: false,
    });
    expect(row.maxMana).toBe(maxMana(h));
    expect(row.manaPct).toBeCloseTo((h.mana / maxMana(h)) * 100);
  });

  it("clamp the bars and flag tired heroes and level-ups", () => {
    const s = game();
    const h = s.heroes.find((x) => x.owner === 0)!;
    h.mp = SPENT_MP - 1;
    h.mana = maxMana(h) + 50;
    h.pendingLevelUps = 1;
    const row = heroRow(h);
    expect(row.tired).toBe(true);
    expect(row.levelUp).toBe(true);
    expect(row.manaPct).toBe(100);
    h.mp = -5;
    h.maxMp = 0;
    expect(heroRow(h).mpPct).toBe(0);
  });
});

describe("town rows", () => {
  it("carry the faction crest, BUILD badge and growth count", () => {
    const s = game();
    const town = Object.values(s.towns).find((t) => t.owner === 0)!;
    const faction = findFaction(town.faction)!;
    const row = townRow(s, town.id, true)!;
    expect(row).toMatchObject({
      id: town.id,
      name: town.name,
      colour: faction.colour,
      factionName: faction.name,
      build: true,
    });
    expect(row.ready).toBe(readyToHire(town));
    expect(townRow(s, town.id, false)!.build).toBe(false);
    expect(townRow(s, "no-such-town", true)).toBeNull();
  });

  it("count every creature waiting in the dwellings", () => {
    const s = game();
    const town = Object.values(s.towns).find((t) => t.owner === 0)!;
    town.dwellings = {};
    expect(readyToHire(town)).toBe(0);
    town.dwellings = {
      squire: { available: 7, remainder: 0 },
      marksman: { available: 3, remainder: 1 },
    } as typeof town.dwellings;
    expect(readyToHire(town)).toBe(10);
    expect(townRow(s, town.id, false)!.ready).toBe(10);
  });
});

describe("button glyphs", () => {
  it("are 8x8 and their runs cover exactly the lit pixels", () => {
    for (const [name, rows] of Object.entries(GLYPHS)) {
      expect(rows, name).toHaveLength(8);
      for (const row of rows) expect(row, name).toMatch(/^[.#]{8}$/);
      const lit = new Set<string>();
      rows.forEach((row, y) =>
        [...row].forEach((c, x) => c === "#" && lit.add(`${x},${y}`)),
      );
      const covered = new Set<string>();
      for (const [x, y, w] of glyphRuns(rows)) {
        expect(w).toBeGreaterThan(0);
        for (let i = 0; i < w; i++) covered.add(`${x + i},${y}`);
      }
      expect(covered, name).toEqual(lit);
      expect(lit.size, name).toBeGreaterThan(8);
    }
  });
});

describe("minimap border", () => {
  it("keeps an inset free round the map for its one-pixel border", () => {
    for (const frame of [192, 224, 302]) {
      for (const cells of [36, 48, 72]) {
        const at = minimapLayout(frame, frame, cells, cells, 1);
        expect(at.x).toBeGreaterThanOrEqual(1);
        expect(at.y).toBeGreaterThanOrEqual(1);
        expect(at.x + at.w).toBeLessThanOrEqual(frame - 1);
        expect(at.y + at.h).toBeLessThanOrEqual(frame - 1);
        // Square and centred: equal margins within a pixel.
        expect(at.w).toBe(at.h);
        expect(Math.abs(at.x - (frame - at.x - at.w))).toBeLessThanOrEqual(1);
      }
    }
    // A 2x screen insets by two device pixels.
    const hi = minimapLayout(448, 448, 48, 48, 2);
    expect(hi).toMatchObject({ x: 2, y: 2, w: 444, h: 444 });
    // Clicks on the border go to the edge cells.
    expect(minimapCell(hi, 48, 48, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(minimapCell(hi, 48, 48, 447, 447)).toEqual({ x: 47, y: 47 });
  });
});
