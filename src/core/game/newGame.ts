/**
 * Building the initial game state from a generated (or fixture) map.
 *
 * Map object conventions read here (on top of the map contract):
 * - town: `data.owner` is a player index or null. An owned town is a Lost
 *   World town with its start buildings. A town with owner null is the
 *   **Warlord's Hold** (any faction string): neutral, garrisoned by
 *   HOLD_GARRISON; capturing every Hold wins the game. Optional
 *   `data.name` (string) names the town.
 * - hero-start: one Chieftain for `data.player`.
 * - monster: `data.creature` must be a creature id from src/data (Lost World
 *   or neutral); `data.count` >= 1.
 * - mine: `data.resource`.
 * - pickup: `{ resource, amount }`, or a treasure chest with
 *   `data.chest === true` (no resource needed).
 */
import { BUILDING_IDS, BUILDINGS } from "../../data/buildings.ts";
import { getCreature, isCreatureId } from "../../data/creatures.ts";
import { STARTING_RESOURCES, RESOURCE_IDS } from "../../data/economy.ts";
import { CHIEFTAIN } from "../../data/hero.ts";
import { HOLD_GARRISON, HOLD_NAME } from "../../data/neutrals.ts";
import type { ResourceId } from "../../data/types.ts";
import type { GameMap, MapObject } from "../map/types.ts";
import { weeklyGrowth } from "./progression.ts";
import { addToArmy, emptyArmy, revealAll } from "./state.ts";
import type {
  GameState,
  HeroState,
  MineState,
  MonsterState,
  TownState,
} from "./types.ts";

export type PickupInfo =
  | { type: "resource"; resource: ResourceId; amount: number }
  | { type: "chest" };

function isResourceId(value: unknown): value is ResourceId {
  return (
    typeof value === "string" &&
    (RESOURCE_IDS as readonly string[]).includes(value)
  );
}

/** What a pickup object gives; throws on malformed data. */
export function pickupInfo(obj: MapObject): PickupInfo {
  if (obj.data["chest"] === true) return { type: "chest" };
  const { resource, amount } = obj.data;
  if (!isResourceId(resource) || typeof amount !== "number" || amount < 0) {
    throw new Error(`pickup ${obj.id}: bad data`);
  }
  return { type: "resource", resource, amount };
}

function townOwner(obj: MapObject): number | null {
  const owner = obj.data["owner"];
  if (owner === null || owner === undefined) return null;
  if (typeof owner !== "number" || !Number.isInteger(owner) || owner < 0) {
    throw new Error(`town ${obj.id}: bad owner`);
  }
  return owner;
}

/** A new Lost World town with its start buildings and stocked dwellings. */
export function newLostWorldTown(
  id: string,
  owner: number | null,
  name: string,
): TownState {
  const town: TownState = {
    id,
    owner,
    faction: "lost-world",
    isHold: false,
    name,
    buildings: BUILDING_IDS.filter((b) => BUILDINGS[b].startBuilt),
    builtToday: false,
    dwellings: {},
    garrison: emptyArmy(),
  };
  for (const b of town.buildings) {
    const creature = BUILDINGS[b].dwelling;
    if (creature === undefined) continue;
    const g = weeklyGrowth(getCreature(creature).growth, false, 0);
    town.dwellings[creature] = { available: g.added, remainder: g.remainder };
  }
  return town;
}

function newHold(id: string, name: string): TownState {
  const garrison = emptyArmy();
  HOLD_GARRISON.forEach((s, i) => {
    garrison[i] = { creature: s.creature, count: s.count };
  });
  return {
    id,
    owner: null,
    faction: "neutral",
    isHold: true,
    name,
    buildings: [],
    builtToday: false,
    dwellings: {},
    garrison,
  };
}

/**
 * The initial state for a map. `seed` (default: the map's seed) feeds battle
 * seeds. Throws when the map has no hero start for player 0 or has objects
 * with bad data.
 */
export function newGame(map: GameMap, seed: number = map.seed): GameState {
  const playerIds = new Set<number>();
  const heroes: HeroState[] = [];
  const towns: Record<string, TownState> = {};
  const mines: Record<string, MineState> = {};
  const monsters: Record<string, MonsterState> = {};

  for (const obj of map.objects) {
    switch (obj.kind) {
      case "hero-start": {
        const player = obj.data["player"];
        if (typeof player !== "number" || !Number.isInteger(player)) {
          throw new Error(`hero-start ${obj.id}: bad player`);
        }
        playerIds.add(player);
        const army = emptyArmy();
        for (const s of CHIEFTAIN.startingArmy) {
          addToArmy(army, s.creature, s.count);
        }
        heroes.push({
          id: `hero-${player}`,
          owner: player,
          heroClass: CHIEFTAIN.id,
          x: obj.x,
          y: obj.y,
          mp: CHIEFTAIN.movement,
          maxMp: CHIEFTAIN.movement,
          attack: CHIEFTAIN.attack,
          defense: CHIEFTAIN.defense,
          xp: 0,
          level: 1,
          pendingLevelUps: 0,
          army,
          alive: true,
        });
        break;
      }
      case "town": {
        const owner = townOwner(obj);
        const name =
          typeof obj.data["name"] === "string" ? obj.data["name"] : undefined;
        if (owner === null) {
          towns[obj.id] = newHold(obj.id, name ?? HOLD_NAME);
        } else {
          playerIds.add(owner);
          towns[obj.id] = newLostWorldTown(obj.id, owner, name ?? "Stonejaw");
        }
        break;
      }
      case "mine": {
        const resource = obj.data["resource"];
        if (!isResourceId(resource)) {
          throw new Error(`mine ${obj.id}: bad resource`);
        }
        mines[obj.id] = { id: obj.id, resource, owner: null };
        break;
      }
      case "monster": {
        const { creature, count } = obj.data;
        if (!isCreatureId(creature)) {
          throw new Error(
            `monster ${obj.id}: unknown creature "${String(creature)}"`,
          );
        }
        if (
          typeof count !== "number" ||
          !Number.isInteger(count) ||
          count < 1
        ) {
          throw new Error(`monster ${obj.id}: bad count`);
        }
        monsters[obj.id] = { id: obj.id, creature, count, x: obj.x, y: obj.y };
        break;
      }
      case "pickup":
        pickupInfo(obj);
        break;
    }
  }
  if (!heroes.some((h) => h.owner === 0)) {
    throw new Error("map has no hero start for player 0");
  }

  const state: GameState = {
    map,
    seed: seed >>> 0,
    day: 1,
    status: "playing",
    players: [...playerIds]
      .sort((a, b) => a - b)
      .map((id) => ({
        id,
        resources: { ...STARTING_RESOURCES },
        explored: new Array<boolean>(map.width * map.height).fill(false),
      })),
    heroes: heroes.sort((a, b) => a.owner - b.owner),
    towns,
    mines,
    collected: [],
    monsters,
    pendingBattle: null,
    battles: 0,
  };
  revealAll(state);
  return state;
}
