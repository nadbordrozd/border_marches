/**
 * State helpers shared by the commands: cloning, lookups, armies and fog.
 */
import {
  buildingDef,
  FORT_DEFENSE,
  TOWER_BASE_HARM,
  TOWER_HARM_PER_DWELLING,
} from "../../data/factions.ts";
import { ARMY_SLOTS, HERO_SIGHT, TOWN_SIGHT } from "../../data/hero.ts";
import { HOLD_DEFENSE_BONUS } from "../../data/neutrals.ts";
import type { BuildingDef, BuildingId, CreatureId } from "../../data/types.ts";
import type { GameMap, MapObject } from "../map/types.ts";
import type {
  ArmySlots,
  CommandError,
  CommandResult,
  GameEvent,
  GameState,
  HeroState,
  PlayerState,
  Stack,
  TownState,
} from "./types.ts";

function deepClone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(deepClone) as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepClone(v);
    return out as T;
  }
  return value;
}

/** A deep copy of everything except the (read-only, shared) map. */
export function cloneState(state: GameState): GameState {
  const { map, ...rest } = state;
  return { ...deepClone(rest), map };
}

/** Unwraps a value the caller has already checked exists (internal bug otherwise). */
export function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`internal: missing ${what}`);
  }
  return value;
}

export function fail(error: CommandError, message: string): CommandResult {
  return { ok: false, error, message };
}

export function success(
  state: GameState,
  events: GameEvent[] = [],
): CommandResult {
  return { ok: true, state, events };
}

/** Common guard: the game is running and no battle is waiting. */
export function checkPlaying(state: GameState): CommandResult | null {
  if (state.status !== "playing") return fail("game-over", "the game is over");
  if (state.pendingBattle !== null) {
    return fail("battle-pending", "resolve the pending battle first");
  }
  return null;
}

/**
 * checkPlaying plus: `player` is the one whose turn it is (RULES_V2 5.1:
 * adventure-map actions are legal only for the current player).
 */
export function checkTurn(
  state: GameState,
  player: number | null,
): CommandResult | null {
  const blocked = checkPlaying(state);
  if (blocked !== null) return blocked;
  if (player !== state.currentPlayer) {
    return fail("not-your-turn", `it is player ${state.currentPlayer}'s turn`);
  }
  return null;
}

export function findPlayer(
  state: GameState,
  player: number,
): PlayerState | undefined {
  return state.players.find((p) => p.id === player);
}

/** The towns a player owns. */
export function townsOf(state: GameState, player: number): TownState[] {
  return Object.values(state.towns).filter((t) => t.owner === player);
}

/** The living hero standing on (x, y), if any. */
export function heroAt(
  state: GameState,
  x: number,
  y: number,
): HeroState | undefined {
  return state.heroes.find((h) => h.alive && h.x === x && h.y === y);
}

export function findHero(
  state: GameState,
  heroId: string,
): HeroState | undefined {
  return state.heroes.find((h) => h.id === heroId);
}

export function findObject(
  map: GameMap,
  objectId: string,
): MapObject | undefined {
  return map.objects.find((o) => o.id === objectId);
}

/** The town whose entrance the hero stands on, if any. */
export function townAtHero(
  state: GameState,
  hero: HeroState,
): TownState | undefined {
  const obj = state.map.objects.find(
    (o) => o.kind === "town" && o.x === hero.x && o.y === hero.y,
  );
  return obj === undefined ? undefined : state.towns[obj.id];
}

/** Whether the hero stands on the town's entrance cell. */
export function heroInTown(
  state: GameState,
  hero: HeroState,
  townId: string,
): boolean {
  return townAtHero(state, hero)?.id === townId;
}

/** The player's living heroes. */
export function heroesOf(state: GameState, player: number): HeroState[] {
  return state.heroes.filter((h) => h.owner === player && h.alive);
}

// ---------------------------------------------------------------- armies

export function emptyArmy(): ArmySlots {
  return Array.from({ length: ARMY_SLOTS }, () => null);
}

/** Total creatures in an army. */
export function armySize(army: ArmySlots): number {
  return army.reduce((n, s) => n + (s?.count ?? 0), 0);
}

/**
 * The slot that would receive `creature`: the first stack of the same
 * creature, else the first empty slot, else -1.
 */
export function slotFor(army: ArmySlots, creature: CreatureId): number {
  const same = army.findIndex((s) => s?.creature === creature);
  return same >= 0 ? same : army.findIndex((s) => s === null);
}

/** Adds creatures to the army in place (merging). Returns false when full. */
export function addToArmy(
  army: ArmySlots,
  creature: CreatureId,
  count: number,
): boolean {
  const slot = slotFor(army, creature);
  if (slot < 0) return false;
  const stack: Stack | null = army[slot] ?? null;
  army[slot] =
    stack === null
      ? { creature, count }
      : { creature, count: stack.count + count };
  return true;
}

// ---------------------------------------------------------------- towns

export function hasBuilding(town: TownState, id: BuildingId): boolean {
  return town.buildings.includes(id);
}

/** The definitions of the town's built buildings (its faction's tree). */
export function builtDefs(town: TownState): BuildingDef[] {
  const out: BuildingDef[] = [];
  for (const b of town.buildings) {
    const def = buildingDef(town.faction, b);
    if (def !== undefined) out.push(def);
  }
  return out;
}

/** The town's fort level, 0 to 3 (RULES_V2 5.5): its best fort building. */
export function fortLevel(town: TownState): number {
  let level = 0;
  for (const def of builtDefs(town))
    level = Math.max(level, def.fortLevel ?? 0);
  return level;
}

/** Flat Defense bonus of the town's defenders (the fort, or the Hold). */
export function townDefenseBonus(town: TownState): number {
  if (town.isHold) return HOLD_DEFENSE_BONUS;
  return FORT_DEFENSE[fortLevel(town)] ?? 0;
}

/**
 * Tower Harm per round start at fort level 3 (20 + 10 x dwellings built),
 * else null. TODO(bzc.8): the battle engine schedules this shot on the
 * strongest attacking stack; the setup carries it as BattleSide.towerHarm.
 */
export function towerHarm(town: TownState): number | null {
  if (town.isHold || fortLevel(town) < 3) return null;
  const dwellings = builtDefs(town).filter((d) => d.dwelling !== undefined);
  return TOWER_BASE_HARM + TOWER_HARM_PER_DWELLING * dwellings.length;
}

// ---------------------------------------------------------------- fog

/**
 * Whether (dx, dy) lies in the sight disc of radius r:
 * dx^2 + dy^2 <= r x (r + 1) (GAME_DESIGN.md section 7.3).
 */
export function inSight(dx: number, dy: number, r: number): boolean {
  return dx * dx + dy * dy <= r * (r + 1);
}

/** Marks the disc around (cx, cy) explored, in place. */
export function revealDisc(
  map: GameMap,
  explored: boolean[],
  cx: number,
  cy: number,
  r: number,
): void {
  for (
    let y = Math.max(0, cy - r);
    y <= Math.min(map.height - 1, cy + r);
    y++
  ) {
    for (
      let x = Math.max(0, cx - r);
      x <= Math.min(map.width - 1, cx + r);
      x++
    ) {
      if (inSight(x - cx, y - cy, r)) explored[y * map.width + x] = true;
    }
  }
}

/** Reveals around every living hero and owned town of each player, in place. */
export function revealAll(state: GameState): void {
  for (const player of state.players) {
    for (const hero of heroesOf(state, player.id)) {
      revealDisc(state.map, player.explored, hero.x, hero.y, HERO_SIGHT);
    }
    for (const obj of state.map.objects) {
      if (obj.kind !== "town") continue;
      if (state.towns[obj.id]?.owner !== player.id) continue;
      revealDisc(state.map, player.explored, obj.x, obj.y, TOWN_SIGHT);
    }
  }
}

export function isExplored(
  state: GameState,
  player: number,
  x: number,
  y: number,
): boolean {
  const p = state.players.find((pl) => pl.id === player);
  return p?.explored[y * state.map.width + x] === true;
}
