/**
 * Ending the day: income, weekly growth, movement and build resets
 * (GAME_DESIGN.md section 5, ECONOMY.md section 3).
 */
import { BUILDINGS } from "../../data/buildings.ts";
import { getCreature } from "../../data/creatures.ts";
import { MINES } from "../../data/economy.ts";
import type { CreatureId, Resources } from "../../data/types.ts";
import { isGrowthDay, weeklyGrowth } from "./progression.ts";
import { addResources, emptyResources } from "./resources.ts";
import { checkPlaying, cloneState, success } from "./state.ts";
import type {
  CommandResult,
  GameEvent,
  GameState,
  TownState,
} from "./types.ts";

/** A town's daily income: its best hall plus extra building income. */
export function townIncome(town: TownState): Resources {
  let hall = 0;
  let out = emptyResources();
  for (const b of town.buildings) {
    const def = BUILDINGS[b];
    hall = Math.max(hall, def.hallIncome ?? 0);
    if (def.income !== undefined) out = addResources(out, def.income);
  }
  out.gold += hall;
  return out;
}

/** What the player will receive at the start of the next day. */
export function dailyIncome(state: GameState, player: number): Resources {
  let out = emptyResources();
  for (const town of Object.values(state.towns)) {
    if (town.owner === player) out = addResources(out, townIncome(town));
  }
  for (const mine of Object.values(state.mines)) {
    if (mine.owner === player)
      out[mine.resource] += MINES[mine.resource].income;
  }
  return out;
}

/** Adds one week of growth to every built dwelling of a town, in place. */
export function growTown(town: TownState): void {
  const stockade = town.buildings.some(
    (b) => BUILDINGS[b].growthBonus === true,
  );
  for (const b of town.buildings) {
    const creature: CreatureId | undefined = BUILDINGS[b].dwelling;
    if (creature === undefined) continue;
    const d = town.dwellings[creature] ?? { available: 0, remainder: 0 };
    const g = weeklyGrowth(getCreature(creature).growth, stockade, d.remainder);
    town.dwellings[creature] = {
      available: d.available + g.added,
      remainder: g.remainder,
    };
  }
}

/**
 * Ends the day. The new day starts with: income for every player (always
 * day 2+, so always paid; mines flagged yesterday included), weekly growth
 * on day 1 of weeks 2+, full movement points, and towns free to build.
 */
export function endDay(state: GameState): CommandResult {
  const blocked = checkPlaying(state);
  if (blocked !== null) return blocked;
  const next = cloneState(state);
  const events: GameEvent[] = [];
  next.day++;
  events.push({ type: "new-day", day: next.day });
  for (const player of next.players) {
    const income = dailyIncome(state, player.id);
    player.resources = addResources(player.resources, income);
    events.push({ type: "income", player: player.id, amounts: income });
  }
  if (isGrowthDay(next.day)) {
    for (const town of Object.values(next.towns)) growTown(town);
    events.push({ type: "new-week", day: next.day });
  }
  for (const town of Object.values(next.towns)) town.builtToday = false;
  for (const hero of next.heroes) hero.mp = hero.maxMp;
  return success(next, events);
}
