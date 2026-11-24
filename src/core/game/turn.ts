/**
 * Turns and days (RULES_V2 5.1): players take turns in index order; after
 * the last one the next day starts with the global upkeep (income, weekly
 * growth, tavern refresh, movement, build flags). ECONOMY.md section 3.
 */
import { getCreature } from "../../data/creatures.ts";
import { MINES } from "../../data/economy.ts";
import { TOWNLESS_DAYS_LIMIT } from "../../data/players.ts";
import type { Resources } from "../../data/types.ts";
import {
  checkEliminations,
  eliminate,
  refreshTaverns,
  settleOutcome,
} from "./players.ts";
import { isGrowthDay, weeklyGrowth } from "./progression.ts";
import { addResources, emptyResources } from "./resources.ts";
import {
  builtDefs,
  checkPlaying,
  cloneState,
  heroesOf,
  success,
  townsOf,
} from "./state.ts";
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
  for (const def of builtDefs(town)) {
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
  const defs = builtDefs(town);
  const stockade = defs.some((d) => d.growthBonus === true);
  for (const def of defs) {
    const creature = def.dwelling;
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
 * Starts the next day, in place (RULES_V2 5.1 steps 1-4): the day number,
 * the seven-day townless rule, weekly growth and tavern refresh on day 1
 * of weeks 2+, then per surviving player income, hero movement and the
 * town build flags.
 */
export function startDay(state: GameState, events: GameEvent[]): void {
  state.day++;
  events.push({ type: "new-day", day: state.day });
  for (const player of state.players) {
    if (player.eliminated) continue;
    if (townsOf(state, player.id).length > 0) {
      player.townlessDays = 0;
      continue;
    }
    player.townlessDays++;
    if (player.townlessDays >= TOWNLESS_DAYS_LIMIT) {
      eliminate(state, player, events);
    }
  }
  settleOutcome(state, events);
  if (isGrowthDay(state.day)) {
    for (const town of Object.values(state.towns)) growTown(town);
    refreshTaverns(state);
    events.push({ type: "new-week", day: state.day });
    events.push({ type: "tavern-refresh", day: state.day });
  }
  for (const player of state.players) {
    if (player.eliminated) continue;
    const income = dailyIncome(state, player.id);
    player.resources = addResources(player.resources, income);
    events.push({ type: "income", player: player.id, amounts: income });
    for (const hero of heroesOf(state, player.id)) hero.mp = hero.maxMp;
    for (const town of townsOf(state, player.id)) town.builtToday = false;
  }
  // Neutral towns never build; keep their flag clear too.
  for (const town of Object.values(state.towns)) {
    if (town.owner === null) town.builtToday = false;
  }
}

/** The next surviving player after `from`, or null past the last one. */
function nextPlayerAfter(state: GameState, from: number): number | null {
  const later = state.players
    .filter((p) => !p.eliminated && p.id > from)
    .sort((a, b) => a.id - b.id);
  return later[0]?.id ?? null;
}

function firstPlayer(state: GameState): number | null {
  const alive = state.players
    .filter((p) => !p.eliminated)
    .sort((a, b) => a.id - b.id);
  return alive[0]?.id ?? null;
}

/**
 * Ends the current player's turn (RULES_V2 5.1). The next surviving
 * player in index order takes the turn; after the last one a new day
 * starts first. A "turn" event names the player to move.
 */
export function endTurn(state: GameState): CommandResult {
  const blocked = checkPlaying(state);
  if (blocked !== null) return blocked;
  const next = cloneState(state);
  const events: GameEvent[] = [];
  let player = nextPlayerAfter(next, next.currentPlayer);
  if (player === null) {
    startDay(next, events);
    player = firstPlayer(next);
  }
  checkEliminations(next, events);
  if (player !== null) {
    next.currentPlayer = player;
    events.push({ type: "turn", player });
  }
  return success(next, events);
}

/**
 * Ends the day in a one-player game; with several players it is endTurn
 * (kept for the MVP callers and tests).
 */
export function endDay(state: GameState): CommandResult {
  return endTurn(state);
}
