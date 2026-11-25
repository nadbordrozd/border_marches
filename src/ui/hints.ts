/**
 * What the adventure screen tells the player beyond the raw state (bead
 * bzc.25): the cost of a planned path in days and movement, a cheap battle
 * estimate, the income breakdown, end-of-turn warnings and the next-action
 * hint. Pure functions over the game state (no DOM; unit-tested).
 */
import { buildStatus, townIncome } from "../core/game/index.ts";
import type { GameState, HeroState, Path } from "../core/game/index.ts";
import { heroStats } from "../core/game/effects.ts";
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
  };
}

/** "Today: 420 moves, 1080 left" / "2 days: 3160 moves, 340 left". */
export function pathLine(s: PathSummary): string {
  const when =
    s.days === 0 ? "Today" : s.days === 1 ? "Tomorrow" : `In ${s.days} days`;
  const tail = s.attack ? "then attack" : `${s.left} moves left`;
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
 * What the player leaves undone by ending the turn now: heroes that have
 * not moved, heroes with movement left, towns that can still build.
 */
export function endTurnWarnings(
  state: GameState,
  player: number,
): TurnWarning[] {
  const out: TurnWarning[] = [];
  for (const h of state.heroes) {
    if (!h.alive || h.owner !== player) continue;
    if (h.maxMp > 0 && h.mp >= h.maxMp)
      out.push({ kind: "unmoved", id: h.id, text: `${h.name} has not moved` });
    else if (h.mp >= SPENT_MP)
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
    return planned.attack && planned.days === 0
      ? "Click the target again or press Space to attack."
      : `Click again or press Space to walk. ${pathLine(planned)}.`;
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
