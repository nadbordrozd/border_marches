/**
 * Pure text helpers for the game screens: dates, costs, stack descriptions
 * and hover descriptions of map cells. No DOM here (unit-tested).
 */
import { isSeaCell } from "../core/game/naval.ts";
import { calendar } from "../core/game/progression.ts";
import { pickupInfo } from "../core/game/newGame.ts";
import type { GameState } from "../core/game/types.ts";
import { propAt } from "../core/map/types.ts";
import type { MapObject, Terrain } from "../core/map/types.ts";
import { decorationKind } from "../data/decorations.ts";
import { describeObject, objectName } from "../core/game/sites.ts";
import { objectTypeOf } from "../core/game/site-state.ts";
import {
  MONSTER_SPELL_RANGE,
  heroMagic,
  inMonsterSpellRange,
  spellInfo,
  storeOf,
} from "../core/magic/index.ts";
import { getCreature } from "../data/creatures.ts";
import { CHEST, MINES, RESOURCE_IDS, RESOURCE_NAMES } from "../data/economy.ts";
import { getHeroClass } from "../data/hero.ts";
import { playerColour } from "../data/players.ts";
import type { ResourceAmounts } from "../data/types.ts";

/** "Month 1, Week 2, Day 3". */
export function dateLabel(day: number): string {
  const c = calendar(day);
  return `Month ${c.month}, Week ${c.week}, Day ${c.dayOfWeek}`;
}

/** "2500 gold, 5 wood, 2 ore" (resources in display order; "free" if none). */
export function costLabel(cost: ResourceAmounts): string {
  const parts = RESOURCE_IDS.filter((r) => (cost[r] ?? 0) > 0).map(
    (r) => `${cost[r] ?? 0} ${RESOURCE_NAMES[r].toLowerCase()}`,
  );
  return parts.length === 0 ? "free" : parts.join(", ");
}

/**
 * Heroes-style count words by stack size (H3's thresholds), the one table
 * behind both the map card's word ("Pack of Goblins", `countWord`) and the
 * messages' group word ("a pack of 12 Goblins", `groupWord`), so a stack
 * of 23 is "Lots" on its card and "lots of 23 Goblins" in a sentence
 * (bead border_marches-bzc.80). `word` is the card's; `group` is the
 * sentence's, the same word where it can take "of 23 Goblins" ("Few" and
 * "Several" cannot, so a sentence says "a band" and "a group").
 */
interface CountBand {
  readonly min: number;
  readonly word: string;
  readonly group: string;
}

/** Below 1 (never a real stack) reads as the smallest band. */
const FEW: CountBand = { min: 1, word: "Few", group: "a band" };

const COUNT_WORDS: readonly CountBand[] = [
  { min: 1000, word: "Legion", group: "a legion" },
  { min: 500, word: "Zounds", group: "zounds" },
  { min: 250, word: "Swarm", group: "a swarm" },
  { min: 100, word: "Throng", group: "a throng" },
  { min: 50, word: "Horde", group: "a horde" },
  { min: 20, word: "Lots", group: "lots" },
  { min: 10, word: "Pack", group: "a pack" },
  { min: 5, word: "Several", group: "a group" },
  FEW,
];

function countBand(count: number): CountBand {
  return COUNT_WORDS.find((b) => count >= b.min) ?? FEW;
}

/** "Few" (1-4), "Several" (5-9), "Pack" (10-19), "Lots" (20-49), "Horde" ... */
export function countWord(count: number): string {
  return countBand(count).word;
}

/** "a band" (1-4), "a group" (5-9), "a pack" (10-19), "lots" (20-49) ... */
export function groupWord(count: number): string {
  return countBand(count).group;
}

/** The creature name for a count ("1 Troll", "23 Goblins"). */
export function creatureCount(creature: string, count: number): string {
  const def = getCreature(creature);
  return `${count} ${count === 1 ? def.name : def.plural}`;
}

/** "a pack of 12 Goblins" (a single creature: "a lone Troll"). */
export function stackPhrase(creature: string, count: number): string {
  if (count === 1) return `a lone ${getCreature(creature).name}`;
  return `${groupWord(count)} of ${creatureCount(creature, count)}`;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const TERRAIN_NAMES: Readonly<Record<Terrain, string>> = {
  grass: "Grass",
  jungle: "Jungle",
  steppe: "Steppe",
  badlands: "Badlands",
  wasteland: "Wasteland",
  volcanic: "Volcanic ground",
  snow: "Snow",
  sand: "Sand",
  frosting: "Frosting",
  swamp: "Swamp",
  water: "Water",
};

/** The object whose entrance or blocked cells cover (x, y). */
export function objectAt(
  objects: readonly MapObject[],
  x: number,
  y: number,
): MapObject | undefined {
  return objects.find(
    (o) =>
      (o.x === x && o.y === y) ||
      o.blocked.some(([bx, by]) => bx === x && by === y),
  );
}

/** The adventure spells that target a neutral stack (RULES_V2 2.8). */
const MONSTER_SPELLS = ["parley", "opening-salvo"] as const;

/**
 * The hover line for a neutral stack when the hero has Parley or Opening
 * Salvo (as a page or a scroll): whether it is in their 2-cell reach, and
 * whether Parley already holds it today. Null when the hero has neither.
 */
export function monsterSpellLine(
  state: GameState,
  hero: GameState["heroes"][number],
  monster: { id: string; x: number; y: number },
): string | null {
  const store = storeOf(state, hero.id);
  if (store.parleyDay === state.day && store.parley?.includes(monster.id))
    return "Parleyed: no zone of control against you today.";
  const m = heroMagic(hero);
  const names = MONSTER_SPELLS.filter(
    (id) => m.knownSpells.includes(id) || m.scrolls.includes(id),
  ).map((id) => spellInfo(id).name);
  if (names.length === 0) return null;
  const spells = names.join(" or ");
  if (inMonsterSpellRange(hero, monster.x, monster.y))
    return `In reach of ${spells} (within ${MONSTER_SPELL_RANGE} cells).`;
  return `Out of reach of ${spells}: come within ${MONSTER_SPELL_RANGE} cells to cast.`;
}

/**
 * What the player sees when hovering a cell: one or two short lines, or
 * null for unexplored cells.
 */
export function describeCell(
  state: GameState,
  player: number,
  x: number,
  y: number,
  heroId?: string,
): string | null {
  const { map } = state;
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  const p = state.players.find((pl) => pl.id === player);
  if (p !== undefined && p.explored[y * map.width + x] !== true) {
    return "Unexplored";
  }
  const hero = state.heroes.find((h) => h.alive && h.x === x && h.y === y);
  if (hero !== undefined) {
    const cls = getHeroClass(hero.heroClass).name;
    if (hero.owner === player) return `${hero.name}, your ${cls}`;
    const colour = playerColour(hero.owner).name;
    const army = hero.army
      .filter((s) => s !== null)
      .map((s) => creatureCount(s.creature, s.count))
      .join(", ");
    return `${hero.name}, ${colour}'s ${cls} (level ${hero.level}): ${army}`;
  }
  const monster = Object.values(state.monsters).find(
    (m) => m.x === x && m.y === y,
  );
  if (monster !== undefined) {
    const def = getCreature(monster.creature);
    const lines = [
      capitalize(stackPhrase(monster.creature, monster.count)),
      `Strength about ${monster.count * def.fightValue}.`,
    ];
    const mobj = map.objects.find((o) => o.id === monster.id);
    const guards = mobj?.data["guards"];
    if (Array.isArray(guards) && guards.length > 0) {
      const names = guards
        .map((id) => map.objects.find((o) => o.id === id))
        .filter((o): o is MapObject => o !== undefined)
        .map((o) => objectName(state, o));
      lines.push(`Guards: ${names.join(", ")}.`);
    } else if (mobj?.data["pass"] === true) {
      lines.push("Guards a pass.");
    }
    const hero = state.heroes.find(
      (h) => h.id === heroId && h.alive && h.owner === player,
    );
    if (hero !== undefined) {
      const reach = monsterSpellLine(state, hero, monster);
      if (reach !== null) lines.push(reach);
    }
    return lines.join("\n");
  }
  const obj = objectAt(
    map.objects.filter(
      (o) =>
        o.kind !== "monster" &&
        o.kind !== "hero-start" &&
        o.kind !== "buried" &&
        o.kind !== "boat" &&
        !state.collected.includes(o.id),
    ),
    x,
    y,
  );
  if (obj !== undefined) {
    // Catalogue lines (bead bzc.13): what it does, visited, reset, guard.
    const lines =
      objectTypeOf(obj) === null
        ? []
        : describeObject(state, player, obj, heroId);
    const withLines = (head: string): string =>
      [head, ...lines.slice(1)].join("\n");
    switch (obj.kind) {
      case "town": {
        const town = state.towns[obj.id];
        if (town === undefined) break;
        const owner =
          town.owner === player
            ? "yours"
            : town.owner === null
              ? "neutral"
              : playerColour(town.owner).name;
        return `${town.name} (${owner})`;
      }
      case "mine": {
        const mine = state.mines[obj.id];
        if (mine === undefined) break;
        const def = MINES[mine.resource];
        const owner =
          mine.owner === player
            ? `yours, +${def.income} ${mine.resource}/day`
            : mine.owner === null
              ? "unclaimed"
              : `${playerColour(mine.owner).name}'s`;
        return withLines(`${def.name} (${owner})`);
      }
      case "pickup": {
        const info = pickupInfo(obj);
        if (info.type === "chest") {
          const gold = Number(obj.data["gold"] ?? CHEST.gold);
          const xp = Number(obj.data["xp"] ?? CHEST.xp);
          const art = obj.data["artifact"];
          return withLines(
            typeof art === "string"
              ? `${CHEST.name}: a Trinket`
              : `${CHEST.name}: ${gold} gold or ${xp} experience`,
          );
        }
        return withLines(`${RESOURCE_NAMES[info.resource]}: ${info.amount}`);
      }
      default:
        if (lines.length > 0) return lines.join("\n");
        break;
    }
  }
  const cell = map.cells[y * map.width + x];
  if (cell === undefined) return null;
  // An impassable prop (bead bzc.72): its name, its line, and that it blocks.
  const prop = propAt(map, x, y);
  const kind = prop === undefined ? undefined : decorationKind(prop.id);
  if (kind !== undefined) return `${kind.name}\n${kind.text}\nBlocks the way.`;
  if (cell.obstacle === "mountain") return "Mountains";
  if (cell.obstacle === "forest")
    return `${TERRAIN_NAMES[cell.terrain]} forest`;
  // A naval map's sea (bead bzc.149): ships sail it.
  if (cell.terrain === "water" && isSeaCell(map, x, y))
    return `${cell.deep === true ? "Deep sea" : "Sea"}\nShips sail here.`;
  if (cell.terrain === "water")
    return cell.deep === true ? "Deep water" : "Water";
  return cell.road
    ? `Road (${TERRAIN_NAMES[cell.terrain]})`
    : TERRAIN_NAMES[cell.terrain];
}
