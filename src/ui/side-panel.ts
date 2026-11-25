/**
 * The adventure screen's side panel (UI2-06, docs/design/UI_V2.md): the
 * row models of the hero and town lists and the pixel glyphs on its
 * buttons. The models are pure (unit-tested in tests/ui/side-panel.test.ts);
 * src/ui/game.ts builds the rows from them.
 */
import { maxMana } from "../core/game/index.ts";
import type { GameState, HeroState, TownState } from "../core/game/index.ts";
import { findFaction } from "../data/factions.ts";
import { SPENT_MP } from "./hints.ts";

const pct = (n: number, d: number): number =>
  Math.max(0, Math.min(100, (n / Math.max(1, d)) * 100));

/** One row of the hero list: portrait, name, movement and mana bars. */
export interface HeroRow {
  id: string;
  name: string;
  mp: number;
  maxMp: number;
  mana: number;
  maxMana: number;
  /** Bar fills, 0..100. */
  mpPct: number;
  manaPct: number;
  /** Too little movement left for a step on rough ground. */
  tired: boolean;
  /** A level-up waits to be chosen. */
  levelUp: boolean;
}

export function heroRow(hero: HeroState): HeroRow {
  const top = maxMana(hero);
  return {
    id: hero.id,
    name: hero.name,
    mp: hero.mp,
    maxMp: hero.maxMp,
    mana: hero.mana,
    maxMana: top,
    mpPct: pct(hero.mp, hero.maxMp),
    manaPct: pct(hero.mana, top),
    tired: hero.mp < SPENT_MP,
    levelUp: hero.pendingLevelUps > 0,
  };
}

/** Creatures waiting in a town's dwellings, ready to hire. */
export function readyToHire(town: TownState): number {
  let n = 0;
  for (const d of Object.values(town.dwellings)) n += d?.available ?? 0;
  return n;
}

/** One row of the town list: crest, name, BUILD badge, growth flag. */
export interface TownRow {
  id: string;
  name: string;
  /**
   * The crest's field: the faction's flag colour. (No letter on it: The
   * Realm and The Restless would both be an R.)
   */
  colour: string;
  factionName: string;
  /** Something can be built today (buildableTowns). */
  build: boolean;
  /** Creatures ready to hire (the growth flag shows when above 0). */
  ready: number;
}

const NEUTRAL_CREST = "#6b5a3e";

export function townRow(
  state: GameState,
  townId: string,
  buildable: boolean,
): TownRow | null {
  const town = state.towns[townId];
  if (town === undefined) return null;
  const faction = findFaction(town.faction);
  return {
    id: town.id,
    name: town.name,
    colour: faction?.colour ?? NEUTRAL_CREST,
    factionName: faction?.name ?? "Town",
    build: buildable,
    ready: readyToHire(town),
  };
}

// ------------------------------------------------------------ glyphs

/** The side panel's button glyphs. */
export type SideGlyph =
  "next" | "kingdom" | "spells" | "dig" | "log" | "menu" | "sheet" | "end";

/**
 * 8x8 pixel glyphs, drawn in code in the button's text colour ('#' is a
 * pixel). Shown at 2x, so every pixel stays a crisp 2x2 block.
 */
export const GLYPHS: Readonly<Record<SideGlyph, readonly string[]>> = {
  // Two arrowheads: on to the next hero.
  next: [
    "........",
    "#...#...",
    "##..##..",
    "###.###.",
    "########",
    "###.###.",
    "##..##..",
    "#...#...",
  ],
  // A crown.
  kingdom: [
    "........",
    "#..##..#",
    "##.##.##",
    "########",
    "########",
    ".######.",
    "........",
    ".######.",
  ],
  // An open book.
  spells: [
    "........",
    "###..###",
    "#..##..#",
    "#..##..#",
    "#..##..#",
    "#..##..#",
    "###..###",
    "...##...",
  ],
  // A spade, blade down-left.
  dig: [
    "......##",
    ".....###",
    "....##..",
    "...##...",
    ".###....",
    "#####...",
    "####....",
    ".##.....",
  ],
  // A rolled scroll with lines.
  log: [
    ".######.",
    "#.#....#",
    ".#.###.#",
    "..#....#",
    "..#.##.#",
    "..#....#",
    "..######",
    "........",
  ],
  // Three bars.
  menu: [
    "........",
    "########",
    "........",
    "########",
    "........",
    "########",
    "........",
    "........",
  ],
  // A bust: the hero sheet.
  sheet: [
    "..####..",
    ".######.",
    ".######.",
    "..####..",
    "........",
    ".######.",
    "########",
    "########",
  ],
  // An hourglass: end the day.
  end: [
    "########",
    ".#....#.",
    "..#..#..",
    "...##...",
    "..#..#..",
    ".#.##.#.",
    "########",
    "........",
  ],
};

/** Horizontal pixel runs of a glyph: [x, y, length]. */
export function glyphRuns(
  rows: readonly string[],
): Array<[number, number, number]> {
  const runs: Array<[number, number, number]> = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== "#") {
        x++;
        continue;
      }
      const start = x;
      while (row[x] === "#") x++;
      runs.push([start, y, x - start]);
    }
  });
  return runs;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** A glyph as an inline SVG at `scale` px per pixel, in currentColor. */
export function glyph(name: SideGlyph, scale = 2): SVGSVGElement {
  const rows = GLYPHS[name];
  const size = rows.length;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "gm-glyph");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("width", String(size * scale));
  svg.setAttribute("height", String(size * scale));
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("shape-rendering", "crispEdges");
  for (const [x, y, w] of glyphRuns(rows)) {
    const r = document.createElementNS(SVG_NS, "rect");
    r.setAttribute("x", String(x));
    r.setAttribute("y", String(y));
    r.setAttribute("width", String(w));
    r.setAttribute("height", "1");
    svg.append(r);
  }
  return svg;
}
