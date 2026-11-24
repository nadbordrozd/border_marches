/**
 * Building the initial game state from a generated (or fixture) map.
 *
 * Map object conventions read here (on top of the map contract):
 * - town: `data.owner` is a player index or null. An owned town gets its
 *   player's faction tree and start buildings. A neutral town whose
 *   `data.faction` has a town tree is a neutral faction town, garrisoned by
 *   `data.garrison` (`[{ creature, count }]`) or the tree's default. Any
 *   other neutral town is the **Warlord's Hold**: no tree, garrisoned by
 *   HOLD_GARRISON. Optional `data.name` (string) names the town.
 * - hero-start: the start hero of `data.player`.
 * - monster: `data.creature` must be a creature id from src/data (Lost World
 *   or neutral); `data.count` >= 1.
 * - mine: `data.resource`.
 * - pickup: `{ resource, amount }`, or a treasure chest with
 *   `data.chest === true` (no resource needed).
 *
 * With `options.players` the map is first given exactly that many starts
 * ({@link prepareStarts}); without it, the map's own starts decide the
 * players (player 0 human, the rest AI, all Lost World).
 */
import { getCreature, isCreatureId } from "../../data/creatures.ts";
import { STARTING_RESOURCES, RESOURCE_IDS } from "../../data/economy.ts";
import { townTree } from "../../data/factions.ts";
import { HOLD_GARRISON, HOLD_NAME } from "../../data/neutrals.ts";
import { findHeroDef, HERO_ROSTER, playerColour } from "../../data/players.ts";
import type { CreatureId, FactionId, ResourceId } from "../../data/types.ts";
import type { GameMap, MapObject } from "../map/types.ts";
import { createRng, deriveSeed } from "../rng.ts";
import { drawFromPool, newHeroState, refreshTaverns } from "./players.ts";
import { weeklyGrowth } from "./progression.ts";
import { prepareStarts } from "./starts.ts";
import { addToArmy, emptyArmy, revealAll } from "./state.ts";
import type {
  GameState,
  HeroState,
  MonsterState,
  PlayerKind,
  PlayerState,
  TownState,
} from "./types.ts";

export type PickupInfo =
  | { type: "resource"; resource: ResourceId; amount: number }
  | { type: "chest" };

/** One player of a new game, by index (RULES_V2 5.1: player 0 is human). */
export interface PlayerSetup {
  kind: PlayerKind;
  faction: FactionId;
}

export interface NewGameOptions {
  /** Feeds battle, tavern and hero seeds (default: the map's seed). */
  seed?: number;
  /** One to four players; see the module comment. */
  players?: PlayerSetup[];
}

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

/**
 * A new town of a faction with its start buildings, stocked dwellings and
 * an empty garrison. Throws when the faction has no town tree.
 */
export function newFactionTown(
  id: string,
  faction: FactionId,
  owner: number | null,
  name: string,
): TownState {
  const tree = townTree(faction);
  if (tree === undefined) throw new Error(`faction ${faction} has no towns`);
  const town: TownState = {
    id,
    owner,
    faction,
    isHold: false,
    name,
    buildings: tree.order.filter((b) => tree.buildings[b]?.startBuilt === true),
    builtToday: false,
    dwellings: {},
    garrison: emptyArmy(),
  };
  for (const b of town.buildings) {
    const creature = tree.buildings[b]?.dwelling;
    if (creature === undefined) continue;
    const g = weeklyGrowth(getCreature(creature).growth, false, 0);
    town.dwellings[creature] = { available: g.added, remainder: g.remainder };
  }
  return town;
}

/** A new Lost World town with its start buildings and stocked dwellings. */
export function newLostWorldTown(
  id: string,
  owner: number | null,
  name: string,
): TownState {
  return newFactionTown(id, "lost-world", owner, name);
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

function garrisonData(
  obj: MapObject,
): Array<{ creature: CreatureId; count: number }> | null {
  const raw = obj.data["garrison"];
  if (!Array.isArray(raw)) return null;
  return raw.map((s: unknown) => {
    const { creature, count } = (s ?? {}) as Record<string, unknown>;
    if (
      !isCreatureId(creature) ||
      typeof count !== "number" ||
      !Number.isInteger(count) ||
      count < 1
    ) {
      throw new Error(`town ${obj.id}: bad garrison`);
    }
    return { creature, count };
  });
}

/** Player indices a map starts (hero starts and owned towns). */
function mapPlayers(map: GameMap): number[] {
  const ids = new Set<number>();
  for (const obj of map.objects) {
    if (obj.kind === "hero-start") {
      const p = obj.data["player"];
      if (typeof p !== "number" || !Number.isInteger(p)) {
        throw new Error(`hero-start ${obj.id}: bad player`);
      }
      ids.add(p);
    } else if (obj.kind === "town") {
      const owner = townOwner(obj);
      if (owner !== null) ids.add(owner);
    }
  }
  return [...ids].sort((a, b) => a - b);
}

/**
 * The initial state for a map. `options` may be a seed (the MVP
 * signature). Throws when the map has no hero start for player 0, a
 * faction has no town data, or objects have bad data.
 */
export function newGame(
  sourceMap: GameMap,
  options: number | NewGameOptions = {},
): GameState {
  const opts: NewGameOptions =
    typeof options === "number" ? { seed: options } : options;
  const seed = (opts.seed ?? sourceMap.seed) >>> 0;
  const map =
    opts.players === undefined
      ? sourceMap
      : prepareStarts(sourceMap, opts.players.length);
  const ids = mapPlayers(map);
  const setups = new Map<number, PlayerSetup>();
  ids.forEach((id) => {
    setups.set(id, {
      kind: id === 0 ? "human" : "ai",
      faction: "lost-world",
      ...opts.players?.[id],
    });
  });
  for (const [id, setup] of setups) {
    if (townTree(setup.faction) === undefined) {
      throw new Error(`player ${id}: faction ${setup.faction} is not playable`);
    }
  }

  const players: PlayerState[] = ids.map((id) => {
    const setup = setups.get(id) as PlayerSetup;
    return {
      id,
      kind: setup.kind,
      faction: setup.faction,
      colour: playerColour(id).id,
      resources: { ...STARTING_RESOURCES },
      explored: new Array<boolean>(map.width * map.height).fill(false),
      eliminated: false,
      townlessDays: 0,
      tavern: { offer: [], retreated: [] },
    };
  });
  const state: GameState = {
    map,
    seed,
    day: 1,
    status: "playing",
    currentPlayer: ids[0] ?? 0,
    players,
    heroes: [],
    pool: HERO_ROSTER.map((h) => h.id),
    scenario: null,
    towns: {},
    mines: {},
    collected: [],
    monsters: {},
    pendingBattle: null,
    battles: 0,
  };

  const heroes: HeroState[] = [];
  const namesUsed = new Map<string, number>();
  const townName = (faction: FactionId, obj: MapObject): string => {
    if (typeof obj.data["name"] === "string") return obj.data["name"];
    const names = townTree(faction)?.townNames ?? ["Town"];
    const n = namesUsed.get(faction) ?? 0;
    namesUsed.set(faction, n + 1);
    const base = names[n % names.length] ?? "Town";
    return n < names.length
      ? base
      : `${base} ${Math.floor(n / names.length) + 1}`;
  };

  for (const obj of map.objects) {
    switch (obj.kind) {
      case "hero-start": {
        const player = obj.data["player"] as number;
        const setup = setups.get(player) as PlayerSetup;
        const rng = createRng(deriveSeed(seed, "start-hero", player));
        const defId = drawFromPool(state, rng, setup.faction);
        const def = defId === null ? undefined : findHeroDef(defId);
        if (def === undefined) throw new Error("the hero roster is empty");
        heroes.push(newHeroState(`hero-${player}`, def, player, obj.x, obj.y));
        break;
      }
      case "town": {
        const owner = townOwner(obj);
        const faction = obj.data["faction"];
        if (owner !== null) {
          const f = (setups.get(owner) as PlayerSetup).faction;
          state.towns[obj.id] = newFactionTown(
            obj.id,
            f,
            owner,
            townName(f, obj),
          );
        } else if (
          typeof faction === "string" &&
          townTree(faction) !== undefined
        ) {
          const f = faction as FactionId;
          const town = newFactionTown(obj.id, f, null, townName(f, obj));
          const garrison = garrisonData(obj) ?? townTree(f)?.neutralGarrison;
          for (const s of garrison ?? []) {
            addToArmy(town.garrison, s.creature, s.count);
          }
          state.towns[obj.id] = town;
        } else {
          state.towns[obj.id] = newHold(
            obj.id,
            typeof obj.data["name"] === "string" ? obj.data["name"] : HOLD_NAME,
          );
        }
        break;
      }
      case "mine": {
        const resource = obj.data["resource"];
        if (!isResourceId(resource)) {
          throw new Error(`mine ${obj.id}: bad resource`);
        }
        state.mines[obj.id] = { id: obj.id, resource, owner: null };
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
        const m: MonsterState = {
          id: obj.id,
          creature,
          count,
          x: obj.x,
          y: obj.y,
        };
        state.monsters[obj.id] = m;
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
  state.heroes = heroes.sort((a, b) => a.owner - b.owner);

  const holds = Object.values(state.towns).filter((t) => t.isHold);
  if (players.length === 1 && holds.length > 0) {
    state.scenario = { kind: "capture-towns", townIds: holds.map((t) => t.id) };
  }
  refreshTaverns(state);
  revealAll(state);
  return state;
}
