/**
 * Pure text helpers for the game screens: dates, costs, stack descriptions
 * and hover descriptions of map cells. No DOM here (unit-tested).
 */
import { calendar } from "../core/game/progression.ts";
import { pickupInfo } from "../core/game/newGame.ts";
import type { GameState } from "../core/game/types.ts";
import type { MapObject, Terrain } from "../core/map/types.ts";
import { getCreature } from "../data/creatures.ts";
import { CHEST, MINES, RESOURCE_IDS, RESOURCE_NAMES } from "../data/economy.ts";
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
 * HoMaM-style group words by size; the exact count is shown as well
 * (readable certainty), e.g. "a pack of 23 Goblins".
 */
const GROUP_WORDS: ReadonlyArray<readonly [number, string]> = [
  [1000, "a legion"],
  [500, "a host"],
  [250, "a swarm"],
  [100, "a throng"],
  [50, "a horde"],
  [10, "a pack"],
  [5, "a group"],
  [1, "a band"],
];

export function groupWord(count: number): string {
  for (const [min, word] of GROUP_WORDS) if (count >= min) return word;
  return "a band";
}

/** The creature name for a count ("1 Troll", "23 Goblins"). */
export function creatureCount(creature: string, count: number): string {
  const def = getCreature(creature);
  return `${count} ${count === 1 ? def.name : def.plural}`;
}

/** "a pack of 23 Goblins" (a single creature: "a lone Troll"). */
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

/**
 * What the player sees when hovering a cell: one or two short lines, or
 * null for unexplored cells.
 */
export function describeCell(
  state: GameState,
  player: number,
  x: number,
  y: number,
): string | null {
  const { map } = state;
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  const p = state.players.find((pl) => pl.id === player);
  if (p !== undefined && p.explored[y * map.width + x] !== true) {
    return "Unexplored";
  }
  const hero = state.heroes.find((h) => h.alive && h.x === x && h.y === y);
  if (hero !== undefined) {
    return hero.owner === player ? "Your Chieftain" : "An enemy hero";
  }
  const monster = Object.values(state.monsters).find(
    (m) => m.x === x && m.y === y,
  );
  if (monster !== undefined) {
    return capitalize(stackPhrase(monster.creature, monster.count));
  }
  const obj = objectAt(
    map.objects.filter(
      (o) =>
        o.kind !== "monster" &&
        o.kind !== "hero-start" &&
        !state.collected.includes(o.id),
    ),
    x,
    y,
  );
  if (obj !== undefined) {
    switch (obj.kind) {
      case "town": {
        const town = state.towns[obj.id];
        if (town === undefined) break;
        const owner =
          town.owner === player
            ? "yours"
            : town.owner === null
              ? "neutral"
              : "enemy";
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
              : "enemy";
        return `${def.name} (${owner})`;
      }
      case "pickup": {
        const info = pickupInfo(obj);
        if (info.type === "chest") return CHEST.name;
        return `${RESOURCE_NAMES[info.resource]}: ${info.amount}`;
      }
      default:
        break;
    }
  }
  const cell = map.cells[y * map.width + x];
  if (cell === undefined) return null;
  if (cell.obstacle === "mountain") return "Mountains";
  if (cell.obstacle === "forest")
    return `${TERRAIN_NAMES[cell.terrain]} forest`;
  if (cell.terrain === "water")
    return cell.deep === true ? "Deep water" : "Water";
  return cell.road
    ? `Road (${TERRAIN_NAMES[cell.terrain]})`
    : TERRAIN_NAMES[cell.terrain];
}
