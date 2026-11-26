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
 * - {@link recruitAllSummary} and {@link RECRUIT_ALL_BLOCKED} are the
 *   "Recruit all" button's toast and disabled tooltip (bead bzc.104).
 */
import {
  maxAffordable,
  scaleResources,
  weeklyGrowth,
} from "../core/game/index.ts";
import type {
  RecruitAllBlock,
  RecruitAllPlan,
  TownState,
} from "../core/game/index.ts";
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

/**
 * What a "Recruit all" plan buys (bead bzc.104), in its order (highest
 * tier first): "1 T-Rex, 3 Raptors and 14 Cavemen"; "" for none.
 */
export function recruitAllList(plan: RecruitAllPlan): string {
  const parts = plan.steps.map((s) => {
    const def = getCreature(s.creature);
    return `${s.count} ${s.count === 1 ? def.name : def.plural}`;
  });
  const last = parts.pop() ?? "";
  return parts.length > 0 ? `${parts.join(", ")} and ${last}` : last;
}

/** The toast after "Recruit all": "Recruited 1 T-Rex and 3 Raptors." */
export function recruitAllSummary(plan: RecruitAllPlan): string {
  return plan.steps.length === 0
    ? "Nothing recruited."
    : `Recruited ${recruitAllList(plan)}.`;
}

/** Why "Recruit all" is disabled: the tooltip of the greyed button. */
export const RECRUIT_ALL_BLOCKED: Readonly<Record<RecruitAllBlock, string>> = {
  "not-owner": "Only the town's owner can recruit here.",
  "no-dwellings": "Nothing to recruit: build a dwelling first.",
  "no-stock":
    "Nothing to recruit: the dwellings are empty until day 1 of next week.",
  resources: "Nothing to recruit: not enough resources for any creature.",
  "army-full":
    "Nothing to recruit: the garrison and the visiting hero have no free slot.",
};

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
