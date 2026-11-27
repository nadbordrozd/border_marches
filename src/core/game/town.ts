/**
 * Town commands: building, recruiting, moving stacks between armies (hero,
 * garrison, a neighbouring own hero) and the marketplace
 * (FACTION_LOST_WORLD.md section 6, ECONOMY.md section 7, RULES_V2 5.3).
 *
 * Buildings come from the town's faction tree (src/data/factions.ts).
 */
import { getCreature, isCreatureId } from "../../data/creatures.ts";
import {
  MARKET_BUY_PRICE,
  MARKET_SELL_PRICE,
  RESOURCE_IDS,
} from "../../data/economy.ts";
import { buildingDef, townTree } from "../../data/factions.ts";
import { KEYSTONE_ITEM } from "../../data/factionTowns.ts";
import { ARMY_SLOTS } from "../../data/hero.ts";
import type {
  BuildingId,
  CreatureId,
  ResourceId,
  Resources,
} from "../../data/types.ts";
import { learnInTown } from "../magic/adventure.ts";
import { vowBarsCreature } from "./hero.ts";
import { weeklyGrowth } from "./progression.ts";
import {
  canAfford,
  emptyResources,
  maxAffordable,
  scaleResources,
  subtractResources,
} from "./resources.ts";
import {
  addToArmy,
  armySize,
  builtDefs,
  dwellingGrowth,
  checkPlaying,
  checkTurn,
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
  GameEvent,
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
  | "keystone"
  | "resources";

/** The owner's hero in the town carrying the Keystone, if any. */
function keystoneBearer(
  state: GameState,
  town: TownState,
): HeroState | undefined {
  const hero = heroInTownOf(state, town);
  return hero !== undefined && hero.backpack.includes(KEYSTONE_ITEM)
    ? hero
    : undefined;
}

/** Whether a building can be built now, and if not, the first reason. */
export function buildStatus(
  state: GameState,
  townId: string,
  building: BuildingId,
): BuildStatus {
  const town = state.towns[townId];
  if (town === undefined || town.owner === null) return "not-owner";
  const def = buildingDef(town.faction, building);
  if (def === undefined) return "wrong-faction";
  if (town.buildings.includes(building)) return "built";
  if (def.startBuilt) return "start-only";
  if (town.builtToday) return "built-today";
  if (!def.requires.every((r) => town.buildings.includes(r))) {
    return "requirements";
  }
  if (def.needsKeystone === true && keystoneBearer(state, town) === undefined) {
    return "keystone";
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
  keystone: "requirements",
  resources: "resources",
} as const;

/**
 * Builds in a town: one building per town per day, requirements met, cost
 * paid by the owner on its turn. A new dwelling is stocked with one week's
 * growth.
 */
export function build(
  state: GameState,
  townId: string,
  building: BuildingId,
): CommandResult {
  const playing = checkPlaying(state);
  if (playing !== null) return playing;
  const town0 = state.towns[townId];
  if (town0 === undefined) return fail("unknown-town", `no town ${townId}`);
  const blocked = checkTurn(state, town0.owner);
  if (blocked !== null) return blocked;
  const def = buildingDef(town0.faction, building);
  if (typeof building !== "string" || def === undefined) {
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
  player.resources = subtractResources(player.resources, def.cost);
  const order = townTree(town.faction)?.order ?? [];
  town.buildings = [...town.buildings, building];
  town.buildings.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  town.builtToday = true;
  if (def.dwelling !== undefined) {
    const g = weeklyGrowth(
      dwellingGrowth(town, def.dwelling),
      builtDefs(town).some((d) => d.growthBonus === true),
      0,
    );
    town.dwellings[def.dwelling] = {
      available: g.added,
      remainder: g.remainder,
    };
  }
  const events: GameEvent[] = [];
  if (def.drill !== undefined) {
    // ECONOMY 6.3: a permanent flag for the player.
    const flag = `${def.drill.creature}:${def.drill.ability}`;
    const drills = player.drills ?? [];
    if (!drills.includes(flag)) player.drills = [...drills, flag];
    events.push({
      type: "drill",
      player: player.id,
      creature: def.drill.creature,
      ability: def.drill.ability,
    });
  }
  if (def.needsKeystone === true) {
    const bearer = keystoneBearer(next, town);
    if (bearer !== undefined) {
      const i = bearer.backpack.indexOf(KEYSTONE_ITEM);
      bearer.backpack = bearer.backpack.filter((_, k) => k !== i);
    }
  }
  if (def.guildLevel !== undefined) {
    // RULES_V2 2.9: a hero of the owner in the town learns the new level's
    // spells at once (the town's draw is seeded, src/core/magic/guild.ts).
    const hero = heroInTownOf(next, town);
    if (hero !== undefined) learnInTown(next, hero, town.id, events);
  }
  return success(next, events);
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
  const playing = checkPlaying(state);
  if (playing !== null) return playing;
  const town = state.towns[townId];
  if (town === undefined) return fail("unknown-town", `no town ${townId}`);
  if (town.owner === null) return fail("not-owner", "the town is neutral");
  const blocked = checkTurn(state, town.owner);
  if (blocked !== null) return blocked;
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
  // A vow's barred tag (Vow of Flesh and Blood): never into that army.
  const barred = hero === undefined ? null : vowBarsCreature(hero, creature);
  if (barred !== null && to === "hero") return fail("vow", barred);

  const next = cloneState(state);
  const t = must(next.towns[townId], "town");
  const h = hero === undefined ? undefined : findHero(next, hero.id);
  const targets: ArmySlots[] = [];
  if (to !== "garrison" && h !== undefined && barred === null)
    targets.push(h.army);
  if (to !== "hero") targets.push(t.garrison);
  const army = targets.find((a) => slotFor(a, creature) >= 0);
  if (army === undefined) {
    return barred !== null
      ? fail("vow", `${barred}, and the garrison has no free slot`)
      : fail("army-full", "no free slot");
  }
  addToArmy(army, creature, count);
  must(t.dwellings[creature], "dwelling").available -= count;
  const p = must(
    next.players.find((pl) => pl.id === t.owner),
    "player",
  );
  p.resources = subtractResources(p.resources, cost);
  return success(next);
}

/** One purchase of {@link recruitAllPlan}: a dwelling's creatures and where they go. */
export interface RecruitAllStep {
  readonly creature: CreatureId;
  readonly count: number;
  readonly to: "hero" | "garrison";
}

/** Why "Recruit all" buys nothing. */
export type RecruitAllBlock =
  "not-owner" | "no-dwellings" | "no-stock" | "resources" | "army-full";

export interface RecruitAllPlan {
  /** Highest tier first; empty when nothing can be bought. */
  readonly steps: readonly RecruitAllStep[];
  /** What the whole plan costs. */
  readonly cost: Resources;
  /** Why `steps` is empty, or null. */
  readonly blocked: RecruitAllBlock | null;
}

/**
 * The town's "Recruit all" (bead bzc.104): from the highest tier dwelling
 * down, as many creatures as the stock and the owner's treasury allow
 * (every resource of the cost counts), each placed by {@link recruit}'s
 * rule: the visiting hero's army (merging a stack of the same creature or
 * taking a free slot) unless a vow bars it, else the garrison; a creature
 * with no slot in either is skipped. Within a tier the dearer creature
 * goes first. Pure: the state is not changed.
 */
export function recruitAllPlan(
  state: GameState,
  townId: string,
): RecruitAllPlan {
  const none = (blocked: RecruitAllBlock): RecruitAllPlan => ({
    steps: [],
    cost: emptyResources(),
    blocked,
  });
  const town = state.towns[townId];
  if (town === undefined || town.owner === null) return none("not-owner");
  const player = state.players.find((p) => p.id === town.owner);
  if (player === undefined) return none("not-owner");
  const stocked = (Object.keys(town.dwellings) as CreatureId[])
    .filter((c) => isCreatureId(c))
    .map((c) => ({
      creature: c,
      available: town.dwellings[c]?.available ?? 0,
      def: getCreature(c),
    }));
  if (stocked.length === 0) return none("no-dwellings");
  const order = stocked
    .filter((d) => d.available > 0)
    .sort(
      (a, b) =>
        b.def.tier - a.def.tier ||
        (b.def.cost.gold ?? 0) - (a.def.cost.gold ?? 0) ||
        a.creature.localeCompare(b.creature),
    );
  if (order.length === 0) return none("no-stock");

  const hero = heroInTownOf(state, town);
  const heroArmy: ArmySlots | null =
    hero === undefined
      ? null
      : hero.army.map((s) => (s === null ? s : { ...s }));
  const garrison: ArmySlots = town.garrison.map((s) =>
    s === null ? s : { ...s },
  );
  let have: Resources = { ...player.resources };
  const steps: RecruitAllStep[] = [];
  let affordable = false;
  for (const d of order) {
    const count = Math.min(d.available, maxAffordable(have, d.def.cost));
    if (count < 1) continue;
    affordable = true;
    const intoHero =
      heroArmy !== null &&
      hero !== undefined &&
      vowBarsCreature(hero, d.creature) === null &&
      slotFor(heroArmy, d.creature) >= 0;
    const to = intoHero ? "hero" : "garrison";
    const army = intoHero ? heroArmy : garrison;
    if (army === null || !addToArmy(army, d.creature, count)) continue;
    have = subtractResources(have, scaleResources(d.def.cost, count));
    steps.push({ creature: d.creature, count, to });
  }
  if (steps.length === 0) return none(affordable ? "army-full" : "resources");
  return {
    steps,
    cost: subtractResources({ ...player.resources }, have),
    blocked: null,
  };
}

const RECRUIT_ALL_ERRORS = {
  "not-owner": "not-owner",
  "no-dwellings": "no-dwelling",
  "no-stock": "stock",
  resources: "resources",
  "army-full": "army-full",
} as const;

/**
 * Carries out {@link recruitAllPlan} as one command: each step is a
 * {@link recruit} into the army the plan chose.
 */
export function recruitAll(state: GameState, townId: string): CommandResult {
  const plan = recruitAllPlan(state, townId);
  if (plan.steps.length === 0) {
    const blocked = plan.blocked ?? "no-stock";
    return fail(RECRUIT_ALL_ERRORS[blocked], `nothing to recruit: ${blocked}`);
  }
  let next = state;
  for (const step of plan.steps) {
    const r = recruit(next, townId, step.creature, step.count, step.to);
    if (!r.ok) return r;
    next = r.state;
  }
  return success(next);
}

export interface SlotRef {
  /**
   * "hero" is args.heroId's army, "garrison" args.townId's garrison and
   * "other" args.otherHeroId's army (a meeting, RULES_V2 5.3).
   */
  army: "hero" | "garrison" | "other";
  /** 0..6 */
  slot: number;
}

export interface TransferArgs {
  /** Needed when either side is "hero". */
  heroId?: string;
  /** Needed when either side is "garrison". */
  townId?: string;
  /** Needed when either side is "other": an own hero next to heroId. */
  otherHeroId?: string;
  from: SlotRef;
  to: SlotRef;
  /** Creatures to move; default the whole stack. */
  count?: number;
}

/** Whether two heroes stand on adjacent cells (8 directions). */
export function adjacent(a: HeroState, b: HeroState): boolean {
  const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  return d === 1;
}

/**
 * Moves creatures between two armies of one player, on its turn:
 * - the hero and the garrison of the town it stands in;
 * - two heroes on adjacent cells (a meeting, RULES_V2 5.3; also hero and
 *   "other" alone);
 * - within one army.
 * Covers: move or split into an empty slot (count <= stack size); merge
 * into a stack of the same creature; swap two whole stacks of different
 * creatures. Every hero must keep at least one creature.
 */
export function transferStack(
  state: GameState,
  args: TransferArgs,
): CommandResult {
  const { from, to } = args;
  const uses = (army: SlotRef["army"]): boolean =>
    from.army === army || to.army === army;
  const hero =
    args.heroId === undefined ? undefined : findHero(state, args.heroId);
  if (uses("hero") && (hero === undefined || !hero.alive)) {
    return fail("unknown-hero", `no hero ${String(args.heroId)}`);
  }
  const other =
    args.otherHeroId === undefined
      ? undefined
      : findHero(state, args.otherHeroId);
  if (uses("other") && (other === undefined || !other.alive)) {
    return fail("unknown-hero", `no hero ${String(args.otherHeroId)}`);
  }
  const town = args.townId === undefined ? undefined : state.towns[args.townId];
  if (uses("garrison")) {
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
  const owner = hero?.owner ?? other?.owner ?? town?.owner ?? null;
  const blocked = checkTurn(state, owner);
  if (blocked !== null) return blocked;
  if (
    uses("hero") &&
    uses("garrison") &&
    !heroInTown(state, must(hero, "hero"), must(town, "town").id)
  ) {
    return fail("not-in-town", "the hero is not in the town");
  }
  if (uses("other")) {
    if (uses("garrison")) return fail("bad-slot", "a meeting has no garrison");
    const o = must(other, "other hero");
    if (hero !== undefined && hero.owner !== o.owner) {
      return fail("not-owner", "not your hero");
    }
    if (uses("hero") && !adjacent(must(hero, "hero"), o)) {
      return fail("not-adjacent", "the heroes must stand side by side");
    }
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
  const o = other === undefined ? undefined : findHero(next, other.id);
  const t = town === undefined ? undefined : next.towns[town.id];
  const armyOf = (ref: SlotRef): ArmySlots =>
    ref.army === "hero"
      ? must(h, "hero").army
      : ref.army === "other"
        ? must(o, "other hero").army
        : must(t, "town").garrison;
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
  for (const x of [h, o]) {
    if (x !== undefined && armySize(x.army) === 0) {
      return fail(
        "hero-needs-army",
        "the hero must keep at least one creature",
      );
    }
  }
  // A vow's barred tag (Vow of Flesh and Blood): what arrives in a hero's
  // army from another army must not be barred for that hero.
  if (from.army !== to.army) {
    const heroOf = (ref: SlotRef): HeroState | undefined =>
      ref.army === "hero" ? h : ref.army === "other" ? o : undefined;
    for (const ref of [to, from]) {
      const x = heroOf(ref);
      const arrived = armyOf(ref)[ref.slot] ?? null;
      if (x === undefined || arrived === null) continue;
      const barred = vowBarsCreature(x, arrived.creature);
      if (barred !== null) return fail("vow", barred);
    }
  }
  return success(next);
}

/** Whether the player owns a town with a Marketplace. */
export function hasMarketplace(state: GameState, player: number): boolean {
  const town = Object.values(state.towns).some(
    (t) =>
      t.owner === player && builtDefs(t).some((d) => d.marketplace === true),
  );
  if (town) return true;
  // A hero standing at a Trading Post trades at the same rates (bzc.13).
  return state.heroes.some(
    (h) =>
      h.alive &&
      h.owner === player &&
      state.map.objects.some(
        (o) => o.data["type"] === "trading-post" && o.x === h.x && o.y === h.y,
      ),
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
  const blocked = checkTurn(state, player);
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
