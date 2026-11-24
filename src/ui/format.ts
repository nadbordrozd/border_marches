/**
 * Pure text helpers for the game screens: dates, costs, stack descriptions
 * and hover descriptions of map cells. No DOM here (unit-tested).
 */
import { calendar } from "../core/game/progression.ts";
import { pickupInfo } from "../core/game/newGame.ts";
import type { GameState } from "../core/game/types.ts";
import type { MapObject, Terrain } from "../core/map/types.ts";
import { describeObject, objectName } from "../core/game/sites.ts";
import { objectTypeOf } from "../core/game/site-state.ts";
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
    return lines.join("\n");
  }
  const obj = objectAt(
    map.objects.filter(
      (o) =>
        o.kind !== "monster" &&
        o.kind !== "hero-start" &&
        o.kind !== "buried" &&
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
  if (cell.obstacle === "mountain") return "Mountains";
  if (cell.obstacle === "forest")
    return `${TERRAIN_NAMES[cell.terrain]} forest`;
  if (cell.terrain === "water")
    return cell.deep === true ? "Deep water" : "Water";
  return cell.road
    ? `Road (${TERRAIN_NAMES[cell.terrain]})`
    : TERRAIN_NAMES[cell.terrain];
}
