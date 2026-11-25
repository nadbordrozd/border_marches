/**
 * What the adventure screen tells the player beyond the raw state (bead
 * bzc.25): the cost of a planned path in days and movement, a cheap battle
 * estimate, the income breakdown, end-of-turn warnings and the next-action
 * hint. Pure functions over the game state (no DOM; unit-tested).
 */
import { buildStatus, townIncome } from "../core/game/index.ts";
import type { GameState, HeroState, Path } from "../core/game/index.ts";
import { heroStats } from "../core/game/effects.ts";
import {
  canEnter,
  cutsCorner,
  moveContext,
  stepCost,
} from "../core/game/pathfinding.ts";
import { DIRECTIONS_8, inBounds } from "../core/map/types.ts";
import type { ResourceId } from "../core/map/types.ts";
import { getCreature, isCreatureId } from "../data/creatures.ts";
import { MINES, RESOURCE_IDS } from "../data/economy.ts";
import { townTree } from "../data/factions.ts";
import type { Resources } from "../data/types.ts";

// ------------------------------------------------------------------ paths

export interface PathSummary {
  /** Movement points of the whole path. */
  cost: number;
  /** 0: arrives today; n: on the n-th day after today. */
  days: number;
  /** Movement left on the arrival day, after the last step. */
  left: number;
  /** The last step attacks (a monster or a hero stands there). */
  attack: boolean;
  /** The last step picks up an object from the next cell (bead bzc.49). */
  pickup?: boolean;
}

/** How long a path takes the hero and what is left on arrival. */
export function pathSummary(path: Path, hero: HeroState): PathSummary {
  const steps = path.steps;
  const last = steps[steps.length - 1];
  if (last === undefined)
    return { cost: 0, days: 0, left: hero.mp, attack: false };
  const days = last.day;
  let left: number;
  if (days === 0) left = hero.mp - last.total;
  else {
    // Movement spent on the arrival day: from the end of the day before.
    const before = steps.filter((s) => s.day < days);
    const start = before[before.length - 1]?.total ?? 0;
    left = hero.maxMp - (last.total - start);
  }
  return {
    cost: path.total,
    days,
    left: Math.max(0, left),
    attack: last.attack,
    ...(last.pickup === true ? { pickup: true } : {}),
  };
}

/**
 * "Today: 420 moves, 1080 left" / "2 days: 3160 moves, 340 left" /
 * "Today: 300 moves, then pick up" / "Pick up: right next to you".
 */
export function pathLine(s: PathSummary): string {
  if (s.pickup === true && s.cost === 0) return "Pick up: right next to you";
  const when =
    s.days === 0 ? "Today" : s.days === 1 ? "Tomorrow" : `In ${s.days} days`;
  const tail = s.attack
    ? "then attack"
    : s.pickup === true
      ? "then pick up"
      : `${s.left} moves left`;
  return `${when}: ${s.cost} moves, ${tail}`;
}

// ---------------------------------------------------------------- battles

export interface ArmyLike {
  creature: string;
  count: number;
}

/** Fight value of an army (creature fight value times count). */
export function armyValue(stacks: ReadonlyArray<ArmyLike | null>): number {
  let total = 0;
  for (const s of stacks) {
    if (s === null || !isCreatureId(s.creature)) continue;
    total += getCreature(s.creature).fightValue * s.count;
  }
  return total;
}

export type Odds = "easy" | "likely" | "even" | "risky" | "deadly";

export const ODDS_TEXT: Readonly<Record<Odds, string>> = {
  easy: "Easy victory",
  likely: "Likely victory",
  even: "An even fight",
  risky: "Risky",
  deadly: "Deadly",
};

/**
 * A cheap estimate (not the battle engine): the hero's army value, raised
 * 5% per point of Attack plus Defense, against the enemy's value.
 */
export function battleOdds(
  hero: HeroState,
  enemy: ReadonlyArray<ArmyLike | null>,
): { odds: Odds; ratio: number } {
  const st = heroStats(hero);
  const own = armyValue(hero.army) * (1 + 0.05 * (st.attack + st.defense));
  const foe = Math.max(1, armyValue(enemy));
  const ratio = own / foe;
  const odds: Odds =
    ratio >= 3
      ? "easy"
      : ratio >= 1.6
        ? "likely"
        : ratio >= 0.9
          ? "even"
          : ratio >= 0.5
            ? "risky"
            : "deadly";
  return { odds, ratio };
}

// ----------------------------------------------------------------- income

export interface IncomeBreakdown {
  towns: Resources;
  mines: Resources;
  /** Heroes' artifacts, skills and specialties. */
  heroes: Resources;
  total: Resources;
}

function zero(): Resources {
  return Object.fromEntries(RESOURCE_IDS.map((r) => [r, 0])) as Resources;
}

/**
 * The player's daily income by source; `total` is the engine's
 * dailyIncome, and `heroes` the part neither towns nor mines explain.
 */
export function incomeBreakdown(
  state: GameState,
  player: number,
  total: Resources,
): IncomeBreakdown {
  const towns = zero();
  for (const t of Object.values(state.towns)) {
    if (t.owner !== player) continue;
    const inc = townIncome(t, state.day);
    for (const r of RESOURCE_IDS) towns[r] += inc[r] ?? 0;
  }
  const mines = zero();
  for (const m of Object.values(state.mines)) {
    if (m.owner !== player) continue;
    const obj = state.map.objects.find((o) => o.id === m.id);
    const y = typeof obj?.data["yield"] === "number" ? obj.data["yield"] : 1;
    mines[m.resource] += MINES[m.resource].income * y;
  }
  const heroes = zero();
  for (const r of RESOURCE_IDS)
    heroes[r] = Math.max(0, (total[r] ?? 0) - towns[r] - mines[r]);
  return { towns, mines, heroes, total };
}

/** Owned mines of one resource. */
export function minesOf(
  state: GameState,
  player: number,
  resource: ResourceId,
): number {
  return Object.values(state.mines).filter(
    (m) => m.owner === player && m.resource === resource,
  ).length;
}

// --------------------------------------------------------- end of the turn

export interface TurnWarning {
  kind: "unmoved" | "moves-left" | "can-build" | "level-up";
  text: string;
  /** Hero or town id the warning is about. */
  id: string;
}

/** Movement below this is "spent" (a step on rough ground costs more). */
export const SPENT_MP = 100;

/** Town ids where something can be built today. */
export function buildableTowns(state: GameState, player: number): string[] {
  const out: string[] = [];
  for (const t of Object.values(state.towns)) {
    if (t.owner !== player || t.builtToday) continue;
    const order = townTree(t.faction)?.order ?? [];
    if (order.some((b) => buildStatus(state, t.id, b) === "ok")) out.push(t.id);
  }
  return out;
}

/**
 * The end-turn dialog warns about a hero only while it has at least this
 * share of its daily movement left (bead border_marches-50f): a few points
 * left after a long walk are not worth a question.
 */
export const END_TURN_MP_SHARE = 0.25;

/**
 * Whether the hero can afford one step to a neighbouring cell today: a
 * walk onto a free cell it has the movement for, or an attack on a
 * neighbouring stack or enemy hero, or a neighbouring pickup to take (those
 * steps cost nothing).
 */
export function canAffordStep(state: GameState, hero: HeroState): boolean {
  if (hero.mp <= 0) return false;
  const ctx = moveContext(state, hero);
  const w = state.map.width;
  for (const [dx, dy] of DIRECTIONS_8) {
    const x = hero.x + dx;
    const y = hero.y + dy;
    if (!inBounds(state.map, x, y)) continue;
    if (cutsCorner(ctx, hero.x, hero.y, x, y)) continue;
    const i = y * w + x;
    if (ctx.monsterAt.has(i) || ctx.enemyHeroAt.has(i)) return true;
    if (ctx.pickupAt.has(i)) return true;
    if (!canEnter(ctx, x, y)) continue;
    const cost = stepCost(
      state.map,
      ctx.nativeTerrain,
      hero.x,
      hero.y,
      x,
      y,
      ctx.forestCost,
    );
    if (cost <= hero.mp) return true;
  }
  return false;
}

/** Whether the hero can take the first step of its planned path today. */
export function canAdvanceOnPlan(
  hero: HeroState,
  plan: Path | null | undefined,
): boolean {
  const first = plan?.steps[0];
  return first !== undefined && hero.mp > 0 && first.cost <= hero.mp;
}

/**
 * Whether ending the turn wastes something for this hero: at least
 * END_TURN_MP_SHARE of its daily movement left, and either a neighbouring
 * step it can afford or a planned path it can still walk along.
 */
export function worthMovingOn(
  state: GameState,
  hero: HeroState,
  plan: Path | null = null,
): boolean {
  if (hero.mp <= 0 || hero.mp < hero.maxMp * END_TURN_MP_SHARE) return false;
  return canAdvanceOnPlan(hero, plan) || canAffordStep(state, hero);
}

/**
 * What the player leaves undone by ending the turn now: heroes that could
 * still make a meaningful move (worthMovingOn; `plans` are the planned
 * paths by hero id) and towns that can still build.
 */
export function endTurnWarnings(
  state: GameState,
  player: number,
  plans: Readonly<Record<string, Path>> = {},
): TurnWarning[] {
  const out: TurnWarning[] = [];
  for (const h of state.heroes) {
    if (!h.alive || h.owner !== player) continue;
    if (!worthMovingOn(state, h, plans[h.id] ?? null)) continue;
    if (h.maxMp > 0 && h.mp >= h.maxMp)
      out.push({ kind: "unmoved", id: h.id, text: `${h.name} has not moved` });
    else
      out.push({
        kind: "moves-left",
        id: h.id,
        text: `${h.name} has ${h.mp} moves left`,
      });
  }
  for (const id of buildableTowns(state, player)) {
    const name = state.towns[id]?.name ?? "A town";
    out.push({ kind: "can-build", id, text: `${name} can build today` });
  }
  return out;
}

/** The hint under the map: what to do next. */
export function nextActionHint(
  state: GameState,
  player: number,
  hero: HeroState | undefined,
  planned: PathSummary | null,
): string {
  if (state.currentPlayer !== player) return "The other players move...";
  if (hero === undefined)
    return "No heroes: hire one in a town's tavern (T opens the town).";
  if (planned !== null) {
    if (planned.attack && planned.days === 0)
      return "Click the target again or press Space to attack.";
    if (planned.pickup === true && planned.days === 0)
      return `Click again or press Space to pick it up. ${pathLine(planned)}.`;
    return `Click again or press Space to walk. ${pathLine(planned)}.`;
  }
  if (hero.mp < SPENT_MP) {
    const others = state.heroes.some(
      (h) =>
        h.alive && h.owner === player && h.id !== hero.id && h.mp >= SPENT_MP,
    );
    return others
      ? `${hero.name} is tired. H selects the next hero; E ends the turn.`
      : "Every hero has moved. Press E to end the turn.";
  }
  return `Click the map to plan ${hero.name}'s path; hover anything for details.`;
}
