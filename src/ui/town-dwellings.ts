/**
 * The town's dwellings strip and recruit dialog (bead border_marches-bzc.61,
 * docs/design/UI_V2.md UI2-10): the pure part, with no DOM, so the unit
 * tier can check it.
 *
 * - {@link dwellingStrip} lists the faction's dwellings in tier order, each
 *   with its creature, whether it is built, the creatures available and
 *   the weekly growth.
 * - {@link recruitQuote} is the recruit dialog's four boxes, Heroes III
 *   style: cost each, available, to recruit and total, with the most the
 *   player can recruit and, when that is none, why.
 */
import {
  maxAffordable,
  scaleResources,
  weeklyGrowth,
} from "../core/game/index.ts";
import type { TownState } from "../core/game/index.ts";
import type { ResourceId } from "../core/map/types.ts";
import { getCreature } from "../data/creatures.ts";
import { RESOURCE_IDS, RESOURCE_NAMES } from "../data/economy.ts";
import { buildingDef, townTree } from "../data/factions.ts";
import { DAYS_PER_WEEK } from "../data/hero.ts";
import type {
  BuildingId,
  CreatureId,
  ResourceAmounts,
  Resources,
} from "../data/types.ts";
import { hallLayout } from "./town-hall.ts";

/** One dwelling of the strip. */
export interface DwellingView {
  readonly building: BuildingId;
  /** The dwelling's name ("Squires' Hall"). */
  readonly name: string;
  readonly creature: CreatureId;
  readonly tier: number;
  readonly built: boolean;
  /** Creatures to recruit now (0 until built). */
  readonly available: number;
  /** Creatures added each week, the Stockade-like bonus included. */
  readonly growth: number;
}

/** The faction's dwellings in tier order; empty for a town with no tree. */
export function dwellingStrip(town: TownState): DwellingView[] {
  const tree = townTree(town.faction);
  if (tree === undefined) return [];
  const bonus = town.buildings.some(
    (b) => buildingDef(town.faction, b)?.growthBonus === true,
  );
  return hallLayout(tree).dwellings.flatMap((column) => {
    const building = column.buildings[0];
    if (building === undefined) return [];
    const built = town.buildings.includes(building);
    return [
      {
        building,
        name: buildingDef(town.faction, building)?.name ?? building,
        creature: column.creature,
        tier: column.tier,
        built,
        available: built
          ? (town.dwellings[column.creature]?.available ?? 0)
          : 0,
        growth: weeklyGrowth(getCreature(column.creature).growth, bonus, 0)
          .added,
      },
    ];
  });
}

/** Days from `day` to the next weekly growth (day 1 of the next week). */
export function daysToGrowth(day: number): number {
  return (
    DAYS_PER_WEEK -
    ((((day - 1) % DAYS_PER_WEEK) + DAYS_PER_WEEK) % DAYS_PER_WEEK)
  );
}

/** The strip's foot line: when the dwellings next grow. */
export function growthNote(day: number): string {
  const n = daysToGrowth(day);
  return n === 1
    ? "New creatures arrive tomorrow."
    : `New creatures arrive in ${n} days.`;
}

/** The recruit dialog's numbers for `count` creatures. */
export interface RecruitQuote {
  /** Cost of one creature. */
  readonly each: ResourceAmounts;
  readonly available: number;
  /** The most the player can recruit now (available and affordable). */
  readonly max: number;
  /** The recruit count, clamped to 0..max. */
  readonly count: number;
  readonly total: Resources;
  /** Why `max` is 0, or null. */
  readonly reason: string | null;
}

/** The first resource the player is short of for one creature. */
function shortOf(cost: ResourceAmounts, have: Resources): ResourceId | null {
  return RESOURCE_IDS.find((r) => (cost[r] ?? 0) > have[r]) ?? null;
}

export function recruitQuote(
  creature: CreatureId,
  available: number,
  have: Resources,
  count?: number,
): RecruitQuote {
  const each = getCreature(creature).cost;
  const max = Math.max(0, Math.min(available, maxAffordable(have, each)));
  const n = Math.max(0, Math.min(count ?? max, max));
  const short = shortOf(each, have);
  const reason =
    max > 0
      ? null
      : available <= 0
        ? "None left this week: dwellings grow on day 1 of each week."
        : short !== null
          ? `Not enough ${RESOURCE_NAMES[short].toLowerCase()} for one.`
          : null;
  return {
    each,
    available,
    max,
    count: n,
    total: scaleResources(each, n),
    reason,
  };
}
