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
/**
 * Guild ranks for a player whose heroes lean to magic (iteration 2, bead
 * bzc.22): the first two levels (Green Road, Opening Salvo, Dowse, Parley
 * and the tier-2 battle pages) become key buildings saved for in week 2.
 */
const MAGIC_GUILD_RANK = [27, 44, 72, 96, 110];

/** What the player's heroes and calendar ask of the build order. */
export interface BuildPlan {
  /** A hero leans to magic: guild levels 1-2 move up. */
  magic?: boolean;
  /** Play the faction's first-week opening (default true). */
  opening?: boolean;
}

/**
 * First-week openings per faction (iteration 2): the cheap ranged or
 * fast dwelling on day one (its first week's creatures arrive at once),
 * then income or the fort its next dwelling needs. Built in this order
 * while affordable during week one, before the general build order.
 */
export const OPENINGS: Readonly<Record<string, readonly BuildingId[]>> = {
  humans: ["archery-range", "town-hall", "fort-1", "barracks"],
  undead: ["charnel-pit", "town-hall", "fort-1", "wailing-tower"],
  goblins: ["powder-shed", "fort-1", "wolf-kennels", "town-hall"],
  // FACTION_CANDY 12: the archers first, then income and the fence the
  // Taffy Ranch needs.
  candy: ["mint-range", "town-hall", "fort-1", "taffy-ranch"],
  // FACTION_DWARVES 12: the Rivet Gunners first, then income and the
  // Riveted Palisade the Gyro Hangar needs.
  dwarves: ["rivet-range", "town-hall", "fort-1", "gyro-hangar"],
};

/**
 * Build-order ranks of town specials by their flag, ahead of what else the
 * building does (FACTION_CANDY 12, FACTION_DWARVES 12): the Larder once
 * the Sugarplum Bower stands (its requirement, rank 35), ahead of the
 * Gummy Den; the Deep Shaft (+1 ore a day, the Deepforge's lean) with the
 * Tithe Barn's gold income, ahead of other resource income; the Repair
 * Yard once the Boiler Works stands (rank 48), after the silo and before
 * the Great Foundry. Specials not listed take their rank from what else
 * the building does.
 */
export const SPECIAL_RANK: Readonly<Record<string, number>> = {
  larder: 45,
  "deep-shaft": 52,
  "repair-yard": 62,
};

/**
 * Rank of a building that adds weekly growth to one dwelling (the Bakery):
 * after the Town Hall and the tier-2 dwelling, before the fort they need.
 */
const GROWTH_EXTRA_RANK = 22;

/** The opening building to build today in `town`, if any. */
export function openingBuild(
  state: GameState,
  town: TownState,
): BuildingId | null {
  if (state.day > 7 || town.owner === null || town.builtToday) return null;
  const plan = OPENINGS[town.faction];
  if (plan === undefined) return null;
  for (const id of plan) {
    if (town.buildings.includes(id)) continue;
    // In order: a step not affordable yet hands the day to the general
    // build order.
    return buildStatus(state, town.id, id) === "ok" ? id : null;
  }
  return null;
}
const FORT_RANK: Readonly<Record<number, number>> = { 1: 25, 2: 80, 3: 95 };

/** Build-order rank of a building (lower is earlier). */
export function buildingRank(def: BuildingDef, plan: BuildPlan = {}): number {
  if (def.hallIncome !== undefined) return def.hallIncome <= 1000 ? 10 : 33;
  if (def.dwelling !== undefined) {
    return DWELLING_RANK[getCreature(def.dwelling).tier] ?? 90;
  }
  if (def.fortLevel !== undefined) return FORT_RANK[def.fortLevel] ?? 95;
  if (def.marketplace === true) return 40;
  if (def.guildLevel !== undefined) {
    const ranks = plan.magic === true ? MAGIC_GUILD_RANK : GUILD_RANK;
    return ranks[def.guildLevel - 1] ?? 110;
  }
  const special =
    def.special === undefined ? undefined : SPECIAL_RANK[def.special];
  if (special !== undefined) return special;
  if (def.income !== undefined) return (def.income.gold ?? 0) > 0 ? 52 : 55;
  if (def.evenDayIncome !== undefined) return 58;
  if (def.growthBonus === true) return 60;
  if (def.growthExtra !== undefined) return GROWTH_EXTRA_RANK;
  if (def.drill !== undefined) return 75;
  return 90;
}

/** The town's buildings still to build, in build order. */
export function buildQueue(
  town: TownState,
  plan: BuildPlan = {},
): BuildingDef[] {
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
        buildingRank(a, plan) - buildingRank(b, plan) ||
        tree.order.indexOf(a.id) - tree.order.indexOf(b.id),
    );
}

/**
 * The town's Keystone hall when it can be built today (a hero of the owner
 * stands in the town with the Keystone and the hall's requirements stand),
 * else null. It is never in the build queue: it needs the Keystone.
 */
export function keystoneBuild(
  state: GameState,
  town: TownState,
): BuildingId | null {
  const tree = townTree(town.faction);
  if (tree === undefined || town.isHold) return null;
  for (const def of Object.values(tree.buildings) as BuildingDef[]) {
    if (def.needsKeystone !== true) continue;
    if (buildStatus(state, town.id, def.id) === "ok") return def.id;
  }
  return null;
}

/**
 * The town's Keystone hall is not built and its requirements stand: a hero
 * carrying the Keystone should bring it here.
 */
export function keystoneHallReady(town: TownState): boolean {
  const tree = townTree(town.faction);
  if (tree === undefined || town.isHold) return false;
  return (Object.values(tree.buildings) as BuildingDef[]).some(
    (def) =>
      def.needsKeystone === true &&
      !town.buildings.includes(def.id) &&
      def.requires.every((r) => town.buildings.includes(r)),
  );
}

export interface BuildChoice {
  /** Build this now. */
  build: BuildingId | null;
  /** A key building the player is saving for (not affordable yet). */
  saving: BuildingDef | null;
  /**
   * The first building of any rank that only lacks resources (iteration
   * 2): a rich player buys them at the market instead of sitting on gold.
   */
  blocked?: BuildingDef;
}

/** What to build in a town today. */
export function chooseBuild(
  state: GameState,
  town: TownState,
  plan: BuildPlan = {},
): BuildChoice {
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
  // The Keystone hall (The Four O'Clock, the Round Table...) whenever a
  // hero has carried the Keystone in and the town can build it.
  const keystone = keystoneBuild(state, town);
  if (keystone !== null) return { build: keystone, saving: null };
  const opening = plan.opening === false ? null : openingBuild(state, town);
  if (opening !== null) return { build: opening, saving: null };
  let blocked: BuildingDef | undefined;
  for (const top of buildQueue(town, plan)) {
    const key = buildingRank(top, plan) <= KEY_RANK;
    for (const def of withRequirements(top)) {
      const status = buildStatus(state, town.id, def.id);
      if (status === "ok") return { build: def.id, saving: null };
      if (status === "resources" && key) return { build: null, saving: def };
      if (status === "resources") blocked ??= def;
    }
  }
  return { build: null, saving: null, ...(blocked ? { blocked } : {}) };
}

/**
 * A marketplace trade that makes `def` affordable (gold for a missing
 * resource), or null.
 */
export function tradeFor(
  state: GameState,
  player: number,
  def: BuildingDef,
  /** Gold kept back after the purchase and the building. */
  cushion = 1000,
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
  if (first === undefined || p.resources.gold < goldNeeded + cushion) {
    return null;
  }
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

/**
 * How many heroes the player wants now. `work` (iteration 4) says whether
 * the map still has work for more than two (ground to explore, stacks to
 * clear): late in a game a third and fourth hero hired then only idled.
 */
export function wantedHeroes(
  state: GameState,
  player: number,
  work = true,
  plan: HeroPlan = DEFAULT_HERO_PLAN,
): number {
  const day = state.day;
  const gold = state.players.find((p) => p.id === player)?.resources.gold ?? 0;
  if (!work) return 2;
  // A rich player (iteration 2: 50-70k gold sat unspent in long games)
  // sends a fourth hero for mines, pickups and ferrying.
  const [d4, g4] = plan.fourth ?? [Infinity, 0];
  const [d3, g3] = plan.third ?? [Infinity, 0];
  if (day >= d4 && gold >= HIRE_COST + g4) return 4;
  if (day >= d3 && gold >= HIRE_COST + g3) return 3;
  return 2;
}

/**
 * When a third and fourth hero are hired: [day, gold above the hire
 * cost], or null for never (difficulty.ts; iteration 4).
 */
export interface HeroPlan {
  third: readonly [number, number] | null;
  fourth: readonly [number, number] | null;
}

/** Normal's hero plan (iterations 1-3). */
export const DEFAULT_HERO_PLAN: HeroPlan = {
  third: [10, 6000],
  fourth: [21, 15000],
};

/** A hire that the player should make now, or null. */
export function chooseHire(
  state: GameState,
  player: number,
  towns: readonly TownState[],
  work = true,
  plan: HeroPlan = DEFAULT_HERO_PLAN,
): GameAction | null {
  const p = state.players.find((x) => x.id === player);
  if (p === undefined) return null;
  const heroes = heroesOf(state, player);
  if (heroes.length >= MAX_HEROES) return null;
  const want = wantedHeroes(state, player, work, plan);
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
