/**
 * Town commands: building, recruiting, moving stacks between the hero and
 * the garrison, and the marketplace (FACTION_LOST_WORLD.md section 6,
 * ECONOMY.md section 7).
 */
import { BUILDING_IDS, BUILDINGS, isBuildingId } from "../../data/buildings.ts";
import { getCreature, isCreatureId } from "../../data/creatures.ts";
import {
  MARKET_BUY_PRICE,
  MARKET_SELL_PRICE,
  RESOURCE_IDS,
} from "../../data/economy.ts";
import { ARMY_SLOTS } from "../../data/hero.ts";
import type { BuildingId, CreatureId, ResourceId } from "../../data/types.ts";
import { weeklyGrowth } from "./progression.ts";
import { canAfford, scaleResources, subtractResources } from "./resources.ts";
import {
  addToArmy,
  armySize,
  checkPlaying,
  cloneState,
  must,
  fail,
  findHero,
  heroesOf,
  heroInTown,
  slotFor,
  success,
} from "./state.ts";
import type {
  ArmySlots,
  CommandResult,
  GameState,
  HeroState,
  TownState,
} from "./types.ts";

export type BuildStatus =
  | "ok"
  | "built"
  | "start-only"
  | "not-owner"
  | "wrong-faction"
  | "built-today"
  | "requirements"
  | "resources";

/** Whether a building can be built now, and if not, the first reason. */
export function buildStatus(
  state: GameState,
  townId: string,
  building: BuildingId,
): BuildStatus {
  const town = state.towns[townId];
  if (town === undefined || town.owner === null) return "not-owner";
  if (town.faction !== "lost-world") return "wrong-faction";
  const def = BUILDINGS[building];
  if (town.buildings.includes(building)) return "built";
  if (def.startBuilt) return "start-only";
  if (town.builtToday) return "built-today";
  if (!def.requires.every((r) => town.buildings.includes(r))) {
    return "requirements";
  }
  const player = state.players.find((p) => p.id === town.owner);
  if (player === undefined || !canAfford(player.resources, def.cost)) {
    return "resources";
  }
  return "ok";
}

const BUILD_ERRORS = {
  built: "already-built",
  "start-only": "cannot-build",
  "not-owner": "not-owner",
  "wrong-faction": "cannot-build",
  "built-today": "built-today",
  requirements: "requirements",
  resources: "resources",
} as const;

/**
 * Builds in a town: one building per town per day, requirements met, cost
 * paid by the owner. A new dwelling is stocked with one week's growth.
 */
export function build(
  state: GameState,
  townId: string,
  building: BuildingId,
): CommandResult {
  const blocked = checkPlaying(state);
  if (blocked !== null) return blocked;
  if (state.towns[townId] === undefined) {
    return fail("unknown-town", `no town ${townId}`);
  }
  if (!isBuildingId(building)) {
    return fail("unknown-building", `no building ${String(building)}`);
  }
  const status = buildStatus(state, townId, building);
  if (status !== "ok") {
    return fail(BUILD_ERRORS[status], `cannot build ${building}: ${status}`);
  }
  const next = cloneState(state);
  const town = must(next.towns[townId], "town");
  const player = must(
    next.players.find((p) => p.id === town.owner),
    "player",
  );
  const def = BUILDINGS[building];
  player.resources = subtractResources(player.resources, def.cost);
  town.buildings = [...town.buildings, building];
  town.buildings.sort((a, b) => buildingOrder(a) - buildingOrder(b));
  town.builtToday = true;
  if (def.dwelling !== undefined) {
    const g = weeklyGrowth(
      getCreature(def.dwelling).growth,
      town.buildings.includes("stockade"),
      0,
    );
    town.dwellings[def.dwelling] = {
      available: g.added,
      remainder: g.remainder,
    };
  }
  return success(next);
}

function buildingOrder(id: BuildingId): number {
  return BUILDING_IDS.indexOf(id);
}

/** The owner's living hero standing in the town, if any. */
export function heroInTownOf(
  state: GameState,
  town: TownState,
): HeroState | undefined {
  if (town.owner === null) return undefined;
  return heroesOf(state, town.owner).find((h) => heroInTown(state, h, town.id));
}

/**
 * Recruits `count` creatures from a town dwelling. They join the hero's army
 * when the owner's hero is in the town (falling back to the garrison when
 * the hero has no room), otherwise the garrison. `to` forces one side.
 */
export function recruit(
  state: GameState,
  townId: string,
  creature: CreatureId,
  count: number,
  to?: "hero" | "garrison",
): CommandResult {
  const blocked = checkPlaying(state);
  if (blocked !== null) return blocked;
  const town = state.towns[townId];
  if (town === undefined) return fail("unknown-town", `no town ${townId}`);
  if (town.owner === null) return fail("not-owner", "the town is neutral");
  if (!isCreatureId(creature)) {
    return fail("unknown-creature", `no creature ${String(creature)}`);
  }
  const dwelling = town.dwellings[creature];
  if (dwelling === undefined) {
    return fail("no-dwelling", `no dwelling for ${creature}`);
  }
  if (!Number.isInteger(count) || count < 1) {
    return fail("bad-count", `bad count ${count}`);
  }
  if (dwelling.available < count) {
    return fail("stock", `only ${dwelling.available} ${creature} available`);
  }
  const cost = scaleResources(getCreature(creature).cost, count);
  const player = state.players.find((p) => p.id === town.owner);
  if (player === undefined || !canAfford(player.resources, cost)) {
    return fail("resources", "not enough resources");
  }
  const hero = heroInTownOf(state, town);
  if (to === "hero" && hero === undefined) {
    return fail("not-in-town", "no hero in the town");
  }

  const next = cloneState(state);
  const t = must(next.towns[townId], "town");
  const h = hero === undefined ? undefined : findHero(next, hero.id);
  const targets: ArmySlots[] = [];
  if (to !== "garrison" && h !== undefined) targets.push(h.army);
  if (to !== "hero") targets.push(t.garrison);
  const army = targets.find((a) => slotFor(a, creature) >= 0);
  if (army === undefined) return fail("army-full", "no free slot");
  addToArmy(army, creature, count);
  must(t.dwellings[creature], "dwelling").available -= count;
  const p = must(
    next.players.find((pl) => pl.id === t.owner),
    "player",
  );
  p.resources = subtractResources(p.resources, cost);
  return success(next);
}

export interface SlotRef {
  army: "hero" | "garrison";
  /** 0..6 */
  slot: number;
}

export interface TransferArgs {
  /** Needed when either side is "hero". */
  heroId?: string;
  /** Needed when either side is "garrison". */
  townId?: string;
  from: SlotRef;
  to: SlotRef;
  /** Creatures to move; default the whole stack. */
  count?: number;
}

/**
 * Moves creatures between slots of the hero's army and a town garrison
 * (both sides need the hero standing in the town). Covers:
 * - move or split into an empty slot (count <= stack size);
 * - merge into a stack of the same creature;
 * - swap two whole stacks of different creatures.
 * The hero must keep at least one creature.
 */
export function transferStack(
  state: GameState,
  args: TransferArgs,
): CommandResult {
  const blocked = checkPlaying(state);
  if (blocked !== null) return blocked;
  const { from, to } = args;
  const usesHero = from.army === "hero" || to.army === "hero";
  const usesGarrison = from.army === "garrison" || to.army === "garrison";
  const hero =
    args.heroId === undefined ? undefined : findHero(state, args.heroId);
  if (usesHero && (hero === undefined || !hero.alive)) {
    return fail("unknown-hero", `no hero ${String(args.heroId)}`);
  }
  const town = args.townId === undefined ? undefined : state.towns[args.townId];
  if (usesGarrison) {
    if (town === undefined) {
      return fail("unknown-town", `no town ${String(args.townId)}`);
    }
    if (
      town.owner === null ||
      (hero !== undefined && town.owner !== hero.owner)
    ) {
      return fail("not-owner", "not your town");
    }
  }
  if (
    usesHero &&
    usesGarrison &&
    !heroInTown(state, must(hero, "hero"), must(town, "town").id)
  ) {
    return fail("not-in-town", "the hero is not in the town");
  }
  for (const ref of [from, to]) {
    if (!Number.isInteger(ref.slot) || ref.slot < 0 || ref.slot >= ARMY_SLOTS) {
      return fail("bad-slot", `bad slot ${ref.slot}`);
    }
  }
  if (from.army === to.army && from.slot === to.slot) {
    return fail("bad-slot", "same slot");
  }

  const next = cloneState(state);
  const h = hero === undefined ? undefined : findHero(next, hero.id);
  const t = town === undefined ? undefined : next.towns[town.id];
  const armyOf = (ref: SlotRef): ArmySlots =>
    ref.army === "hero" ? must(h, "hero").army : must(t, "town").garrison;
  const src = armyOf(from);
  const dst = armyOf(to);
  const source = src[from.slot] ?? null;
  if (source === null) return fail("empty-slot", "the source slot is empty");
  const count = args.count ?? source.count;
  if (!Number.isInteger(count) || count < 1 || count > source.count) {
    return fail("bad-count", `bad count ${count}`);
  }
  const target = dst[to.slot] ?? null;
  if (target === null || target.creature === source.creature) {
    dst[to.slot] = {
      creature: source.creature,
      count: (target?.count ?? 0) + count,
    };
    src[from.slot] =
      count === source.count
        ? null
        : { creature: source.creature, count: source.count - count };
  } else {
    if (count !== source.count) {
      return fail("different-creature", "split only into an empty slot");
    }
    src[from.slot] = target;
    dst[to.slot] = source;
  }
  if (h !== undefined && armySize(h.army) === 0) {
    return fail("hero-needs-army", "the hero must keep at least one creature");
  }
  return success(next);
}

/** Whether the player owns a town with a Marketplace. */
export function hasMarketplace(state: GameState, player: number): boolean {
  return Object.values(state.towns).some(
    (t) =>
      t.owner === player &&
      t.buildings.some((b) => BUILDINGS[b].marketplace === true),
  );
}

export interface MarketQuote {
  /** Amount of `get` received. */
  receive: number;
  /** Gold handed back (the part of the sale that buys nothing). */
  change: number;
}

/**
 * A trade goes through gold: `giveAmount` of `give` is sold (gold counts at
 * 1), then as much `get` as that gold buys is bought; the remainder is
 * returned as gold. Exact integers.
 */
export function marketQuote(
  give: ResourceId,
  giveAmount: number,
  get: ResourceId,
): MarketQuote {
  const gold = giveAmount * MARKET_SELL_PRICE[give];
  const price = MARKET_BUY_PRICE[get];
  const receive = Math.floor(gold / price);
  return { receive, change: gold - receive * price };
}

/** Trades at the fixed marketplace rates (needs an owned Marketplace). */
export function marketTrade(
  state: GameState,
  player: number,
  give: ResourceId,
  giveAmount: number,
  get: ResourceId,
): CommandResult {
  const blocked = checkPlaying(state);
  if (blocked !== null) return blocked;
  if (!hasMarketplace(state, player)) {
    return fail("no-marketplace", "no Marketplace");
  }
  if (
    !RESOURCE_IDS.includes(give) ||
    !RESOURCE_IDS.includes(get) ||
    give === get ||
    !Number.isInteger(giveAmount) ||
    giveAmount < 1
  ) {
    return fail("bad-trade", "bad trade");
  }
  const p = state.players.find((pl) => pl.id === player);
  if (p === undefined) return fail("not-owner", `no player ${player}`);
  if (p.resources[give] < giveAmount) {
    return fail("resources", "not enough to trade");
  }
  const quote = marketQuote(give, giveAmount, get);
  if (quote.receive < 1) return fail("bad-trade", "too little to buy one");
  const next = cloneState(state);
  const np = must(
    next.players.find((pl) => pl.id === player),
    "player",
  );
  np.resources[give] -= giveAmount;
  np.resources[get] += quote.receive;
  np.resources.gold += quote.change;
  return success(next);
}
