/**
 * The adventure AI's town economy (bead bzc.19): what to build, when and
 * what to recruit, marketplace trades for a key building, and hiring.
 *
 * Build order (any faction tree, ranked by what a building does): income
 * first (Town Hall), then the cheap dwellings and the fort they need, the
 * marketplace and first guild level, the City Hall, the big dwellings,
 * the silo, upgrades of fort and guild, drills and specials. A key
 * building (rank <= KEY_RANK) the player cannot afford yet is saved for:
 * cheaper buildings after it wait and recruiting keeps its gold back on
 * quiet days.
 */
import { getCreature } from "../../data/creatures.ts";
import { MARKET_BUY_PRICE, RESOURCE_IDS } from "../../data/economy.ts";
import { townTree } from "../../data/factions.ts";
import { findHeroDef, HIRE_COST, MAX_HEROES } from "../../data/players.ts";
import type {
  BuildingDef,
  BuildingId,
  CreatureId,
  Resources,
} from "../../data/types.ts";
import {
  buildStatus,
  calendar,
  hasMarketplace,
  heroAt,
  heroesOf,
  heroInTownOf,
  maxAffordable,
  subtractResources,
  tavernOffer,
  type GameAction,
  type GameState,
  type HeroState,
  type TownState,
} from "../game/index.ts";
import { heroByDef } from "../game/players.ts";
import { builtDefs, slotFor } from "../game/state.ts";

/** Buildings ranked at most this are worth saving for. */
export const KEY_RANK = 50;

const DWELLING_RANK: Readonly<Record<number, number>> = {
  1: 5,
  2: 20,
  3: 30,
  4: 35,
  5: 48,
  6: 70,
};
const GUILD_RANK = [42, 66, 86, 100, 110];
const FORT_RANK: Readonly<Record<number, number>> = { 1: 25, 2: 80, 3: 95 };

/** Build-order rank of a building (lower is earlier). */
export function buildingRank(def: BuildingDef): number {
  if (def.hallIncome !== undefined) return def.hallIncome <= 1000 ? 10 : 33;
  if (def.dwelling !== undefined) {
    return DWELLING_RANK[getCreature(def.dwelling).tier] ?? 90;
  }
  if (def.fortLevel !== undefined) return FORT_RANK[def.fortLevel] ?? 95;
  if (def.marketplace === true) return 40;
  if (def.guildLevel !== undefined) {
    return GUILD_RANK[def.guildLevel - 1] ?? 110;
  }
  if (def.income !== undefined) return (def.income.gold ?? 0) > 0 ? 52 : 55;
  if (def.evenDayIncome !== undefined) return 58;
  if (def.growthBonus === true) return 60;
  if (def.drill !== undefined) return 75;
  return 90;
}

/** The town's buildings still to build, in build order. */
export function buildQueue(town: TownState): BuildingDef[] {
  const tree = townTree(town.faction);
  if (tree === undefined || town.isHold) return [];
  const defs = Object.values(tree.buildings) as BuildingDef[];
  return defs
    .filter(
      (d) =>
        !d.startBuilt &&
        d.needsKeystone !== true &&
        !town.buildings.includes(d.id),
    )
    .sort(
      (a, b) =>
        buildingRank(a) - buildingRank(b) ||
        tree.order.indexOf(a.id) - tree.order.indexOf(b.id),
    );
}

export interface BuildChoice {
  /** Build this now. */
  build: BuildingId | null;
  /** A key building the player is saving for (not affordable yet). */
  saving: BuildingDef | null;
}

/** What to build in a town today. */
export function chooseBuild(state: GameState, town: TownState): BuildChoice {
  if (town.owner === null || town.builtToday) {
    return { build: null, saving: null };
  }
  const tree = townTree(town.faction);
  if (tree === undefined) return { build: null, saving: null };
  // A building's missing requirements come first, with its rank.
  const seen = new Set<BuildingId>();
  const withRequirements = (def: BuildingDef): BuildingDef[] => {
    if (seen.has(def.id) || town.buildings.includes(def.id)) return [];
    seen.add(def.id);
    const out: BuildingDef[] = [];
    for (const r of def.requires) {
      const req = tree.buildings[r] as BuildingDef | undefined;
      if (req !== undefined) out.push(...withRequirements(req));
    }
    out.push(def);
    return out;
  };
  for (const top of buildQueue(town)) {
    const key = buildingRank(top) <= KEY_RANK;
    for (const def of withRequirements(top)) {
      const status = buildStatus(state, town.id, def.id);
      if (status === "ok") return { build: def.id, saving: null };
      if (status === "resources" && key) return { build: null, saving: def };
    }
  }
  return { build: null, saving: null };
}

/**
 * A marketplace trade that makes `def` affordable (gold for a missing
 * resource), or null.
 */
export function tradeFor(
  state: GameState,
  player: number,
  def: BuildingDef,
): GameAction | null {
  if (!hasMarketplace(state, player)) return null;
  const p = state.players.find((x) => x.id === player);
  if (p === undefined) return null;
  const cost = def.cost;
  let goldNeeded = cost.gold ?? 0;
  const buys: Array<{ r: (typeof RESOURCE_IDS)[number]; n: number }> = [];
  for (const r of RESOURCE_IDS) {
    if (r === "gold") continue;
    const missing = (cost[r] ?? 0) - p.resources[r];
    if (missing > 0) {
      buys.push({ r, n: missing });
      goldNeeded += missing * MARKET_BUY_PRICE[r];
    }
  }
  const first = buys[0];
  // Keep a cushion of gold for creatures.
  if (first === undefined || p.resources.gold < goldNeeded + 1000) return null;
  return {
    type: "trade",
    give: "gold",
    amount: first.n * MARKET_BUY_PRICE[first.r],
    get: first.r,
  };
}

/**
 * A recruit in the town, best creature first, spending at most the
 * resources above `reserve`. Recruits go to the owner's hero in the town
 * when `toHero` (and it has room), else the garrison.
 */
export function chooseRecruit(
  state: GameState,
  town: TownState,
  reserve: Partial<Resources>,
  toHero: boolean,
  /** Creatures that stay in the garrison even with a hero in town. */
  keepHome: (creature: CreatureId) => boolean = () => false,
): GameAction | null {
  if (town.owner === null) return null;
  const p = state.players.find((x) => x.id === town.owner);
  if (p === undefined) return null;
  const budget = { ...p.resources };
  for (const r of RESOURCE_IDS)
    budget[r] = Math.max(0, budget[r] - (reserve[r] ?? 0));
  const hero = heroInTownOf(state, town);
  const offers = (Object.keys(town.dwellings) as CreatureId[])
    .map((c) => ({ c, d: town.dwellings[c], def: getCreature(c) }))
    .filter((o) => o.d !== undefined && o.d.available > 0)
    .sort(
      (a, b) => b.def.tier - a.def.tier || b.def.fightValue - a.def.fightValue,
    );
  for (const o of offers) {
    const n = Math.min(o.d?.available ?? 0, maxAffordable(budget, o.def.cost));
    if (n <= 0) continue;
    const heroFits =
      toHero &&
      !keepHome(o.c) &&
      hero !== undefined &&
      slotFor(hero.army, o.c) >= 0;
    if (heroFits) {
      return {
        type: "recruit",
        townId: town.id,
        creature: o.c,
        count: n,
        to: "hero",
      };
    }
    if (slotFor(town.garrison, o.c) >= 0) {
      return {
        type: "recruit",
        townId: town.id,
        creature: o.c,
        count: n,
        to: "garrison",
      };
    }
  }
  return null;
}

/** Gold to keep back for a building being saved for. */
export function reserveFor(def: BuildingDef | null): Partial<Resources> {
  if (def === null) return {};
  return { ...def.cost };
}

/** The resources left after paying `cost` (may go negative). */
export function after(res: Resources, cost: Partial<Resources>): Resources {
  return subtractResources(res, cost);
}

/** How many heroes the player wants now. */
export function wantedHeroes(state: GameState, player: number): number {
  const day = state.day;
  const gold = state.players.find((p) => p.id === player)?.resources.gold ?? 0;
  if (day >= 10 && gold >= HIRE_COST + 6000) return 3;
  return 2;
}

/** A hire that the player should make now, or null. */
export function chooseHire(
  state: GameState,
  player: number,
  towns: readonly TownState[],
): GameAction | null {
  const p = state.players.find((x) => x.id === player);
  if (p === undefined) return null;
  const heroes = heroesOf(state, player);
  if (heroes.length >= MAX_HEROES) return null;
  const want = wantedHeroes(state, player);
  if (heroes.length >= want) return null;
  // The first hire may leave little; later ones keep a cushion.
  const cushion = heroes.length === 0 ? 0 : heroes.length === 1 ? 500 : 4000;
  if (p.resources.gold < HIRE_COST + cushion) return null;
  const town = towns.find((t) => {
    const obj = state.map.objects.find((o) => o.id === t.id);
    return (
      obj !== undefined &&
      heroAt(state, obj.x, obj.y) === undefined &&
      builtDefs(t).some((d) => d.tavern === true)
    );
  });
  if (town === undefined) return null;
  const offers = tavernOffer(state, player);
  if (offers.length === 0) return null;
  const score = (o: (typeof offers)[number]): number => {
    const known: HeroState | undefined = heroByDef(state, o.defId);
    const level = known?.level ?? 1;
    const own = findHeroDef(o.defId)?.faction === p.faction ? 1 : 0;
    return level * 10 + own;
  };
  const best = [...offers].sort((a, b) => score(b) - score(a))[0];
  if (best === undefined) return null;
  return { type: "hire", townId: town.id, heroDefId: best.defId };
}

/** Day of the week, 1..7. */
export function dayOfWeek(day: number): number {
  return calendar(day).dayOfWeek;
}
