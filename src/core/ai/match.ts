/**
 * AI-against-AI matches and their per-day metrics (bead bzc.19).
 *
 * {@link playMatch} generates a map, gives every start to an AI player
 * (factions in turn: humans, undead, goblins), plays whole days with the
 * given controllers and the battle resolver, and records
 * {@link PlayerMetrics} for every player at the end of every day. The
 * headless runner (tools/sim/match.ts) prints and saves them; the unit
 * tier plays a few days of one fixed seed as a smoke test.
 *
 * Note: the rules still call player 0 "the human" for victory and defeat
 * (RULES_V2 5.9), so a match ends early when player 0 is eliminated or
 * is the last player standing.
 */
import { getCreature } from "../../data/creatures.ts";
import { playableFactions } from "../../data/factions.ts";
import {
  aiStep,
  dailyIncome,
  endTurn,
  heroesOf,
  newGame,
  townsOf,
  type AiStepResult,
  type ArmySlots,
  type BattleResolver,
  type GameAction,
  type GameEvent,
  type GameState,
  type PlayerController,
} from "../game/index.ts";
import {
  generateMap,
  type MapSize,
  type PlayerCount,
} from "../map/generate.ts";
import { buildNamedMap, findNamedMap } from "../map/named.ts";
import { isPassable } from "../map/types.ts";

/** One player's standing at the end of a day. */
export interface PlayerMetrics {
  day: number;
  player: number;
  faction: string;
  eliminated: boolean;
  /** Fight value of every hero army and garrison. */
  armyFv: number;
  /** Fight value of the strongest hero's army. */
  mainFv: number;
  /** Daily gold income and the gold equivalent of all income. */
  income: number;
  incomeValue: number;
  gold: number;
  mines: number;
  towns: number;
  heroes: number;
  /** Explored share of the passable cells, 0..1. */
  explored: number;
  /** Neutral stacks this player's battles removed, so far. */
  guardsCleared: number;
  /** Neutral stacks left on the map (all players). */
  guardsLeft: number;
  /** Neutral towns left on the map (all players). */
  neutralTowns: number;
  /** Highest hero level. */
  level: number;
  /** Artifacts worn or carried by its heroes. */
  artifacts: number;
  /** Heroes that did not move on this day. */
  idleHeroes: number;
  /** Buildings in its towns. */
  buildings: number;
}

export interface MatchOptions {
  seed: number;
  size: MapSize;
  /** A named map id (src/data/named-maps.ts) instead of a generated map. */
  named?: string;
  players: number;
  days: number;
  /** The controller of each player. */
  controller: (player: number) => PlayerController;
  resolver: BattleResolver;
  /** Called after each finished day. */
  onDay?: (
    metrics: PlayerMetrics[],
    state: GameState,
    guardsAtStart: number,
  ) => void;
  /** Called after every AI step with the state before it (tracing). */
  onAction?: (before: GameState, step: AiStepResult) => void;
}

export interface MatchResult {
  /** Metrics per day (index day - 1), one entry per player. */
  days: PlayerMetrics[][];
  state: GameState;
  /** Neutral stacks on the map at the start. */
  guardsAtStart: number;
  /** Milliseconds spent in each player's turns, per turn. */
  turnMs: number[][];
  /**
   * Of that, milliseconds the controllers spent deciding (the rest is the
   * rules and the battles fought).
   */
  thinkMs: number[][];
  /** Actions the rules refused (each ended that player's turn early). */
  failures: Array<{ day: number; player: number; action: GameAction }>;
  /**
   * Player-against-player fighting (bead bzc.21): the day of the first
   * battle against another player's hero or town, the first town a
   * player lost, and every such battle (day, attacker, defender player).
   */
  firstPlayerFight: number | null;
  firstTownLoss: number | null;
  playerFights: Array<{ day: number; attacker: number; defender: number }>;
  /** Day each player was eliminated (null: still in). */
  eliminatedOn: Array<number | null>;
  /**
   * Battles whose result the rules refused, voided by the driver (a
   * resolver bug; there should be none).
   */
  battleErrors: Array<{ day: number; player: number; message: string }>;
  /** Battles where both sides fell at once (RULES_V2 1.12 last stand). */
  lastStands: number;
}

const VALUE: Readonly<Record<string, number>> = {
  gold: 1,
  wood: 100,
  ore: 150,
  essence: 500,
};

function armyFv(army: ArmySlots): number {
  let fv = 0;
  for (const s of army) {
    if (s !== null) fv += s.count * getCreature(s.creature).fightValue;
  }
  return fv;
}

/** A new game on a generated map with every start an AI player. */
export function matchState(
  seed: number,
  size: MapSize,
  players: number,
  named?: string,
): GameState {
  if (named !== undefined) {
    // A named map (bead bzc.18): its size, players and factions; `seed`
    // feeds the battles and taverns.
    const def = findNamedMap(named);
    if (def === undefined) throw new Error(`no named map ${named}`);
    return newGame(buildNamedMap(def), {
      seed,
      players: def.factions.map((faction) => ({
        kind: "ai" as const,
        faction,
      })),
    });
  }
  const map = generateMap(seed, {
    size,
    players: players as PlayerCount,
    activePlayers: players,
  });
  const factions = playableFactions().map((f) => f.id);
  return newGame(map, {
    seed,
    players: Array.from({ length: players }, (_, i) => ({
      kind: "ai" as const,
      faction: factions[i % factions.length] ?? "humans",
    })),
  });
}

/** The metrics of one player now. */
export function playerMetrics(
  state: GameState,
  player: number,
  cleared: number,
  idle: number,
): PlayerMetrics {
  const p = state.players.find((x) => x.id === player);
  const heroes = heroesOf(state, player);
  const towns = townsOf(state, player);
  let armies = 0;
  let main = 0;
  let level = 0;
  let artifacts = 0;
  for (const h of heroes) {
    const fv = armyFv(h.army);
    armies += fv;
    main = Math.max(main, fv);
    level = Math.max(level, h.level);
    artifacts += h.worn.filter((w) => w !== null).length + h.backpack.length;
  }
  for (const t of towns) armies += armyFv(t.garrison);
  const income = p === undefined ? null : dailyIncome(state, player);
  let incomeValue = 0;
  if (income !== null) {
    for (const [r, n] of Object.entries(income)) {
      incomeValue += n * (VALUE[r] ?? 0);
    }
  }
  let passable = 0;
  let seen = 0;
  state.map.cells.forEach((c, i) => {
    if (!isPassable(c)) return;
    passable++;
    if (p?.explored[i] === true) seen++;
  });
  return {
    day: state.day,
    player,
    faction: p?.faction ?? "",
    eliminated: p?.eliminated ?? true,
    armyFv: armies,
    mainFv: main,
    income: income?.gold ?? 0,
    incomeValue,
    gold: p?.resources.gold ?? 0,
    mines: Object.values(state.mines).filter((m) => m.owner === player).length,
    towns: towns.length,
    heroes: heroes.length,
    explored: passable === 0 ? 0 : seen / passable,
    guardsCleared: cleared,
    guardsLeft: Object.keys(state.monsters).length,
    neutralTowns: Object.values(state.towns).filter((t) => t.owner === null)
      .length,
    level,
    artifacts,
    idleHeroes: idle,
    buildings: towns.reduce((n, t) => n + t.buildings.length, 0),
  };
}

/** Reads a monotonic clock where one exists (Node, browsers), else 0. */
function now(): number {
  const g = globalThis as { performance?: { now(): number } };
  return g.performance?.now() ?? 0;
}

/** runAiTurn, step by step, reporting every action and its events. */
function tracedTurn(
  state: GameState,
  controllers: (player: number) => PlayerController | null,
  resolver: BattleResolver,
  onAction: NonNullable<MatchOptions["onAction"]>,
): AiStepResult {
  const events: GameEvent[] = [];
  let s = state;
  for (let i = 0; i < 200; i++) {
    const before = s;
    const step = aiStep(s, controllers, resolver);
    onAction(before, step);
    s = step.state;
    events.push(...step.events);
    if (step.outcome !== "continue") return { ...step, events };
  }
  const ended = endTurn(s);
  if (!ended.ok) {
    return { state: s, events, action: null, outcome: "game-over" };
  }
  events.push(...ended.events);
  return {
    state: ended.state,
    events,
    action: { type: "end-turn" },
    outcome: "turn-ended",
  };
}

/** Plays an AI-only match for `days` days. Deterministic for a seed. */
export function playMatch(options: MatchOptions): MatchResult {
  let state = matchState(
    options.seed,
    options.size,
    options.players,
    options.named,
  );
  const guardsAtStart = Object.keys(state.monsters).length;
  // Remember each decided action: one the rules refused shows up as the
  // driver's own end-turn (a controller bug: it cost that player its turn).
  let decided: GameAction | null = null;
  let thinking = 0;
  const thinkMs: number[][] = state.players.map(() => []);
  const failures: MatchResult["failures"] = [];
  const battleErrors: MatchResult["battleErrors"] = [];
  let lastStands = 0;
  const wrapped = new Map<number, PlayerController>();
  const controllers = (p: number): PlayerController => {
    let c = wrapped.get(p);
    if (c === undefined) {
      const inner = options.controller(p);
      c = {
        decide: (s, player) => {
          const t = now();
          decided = inner.decide(s, player);
          thinking += now() - t;
          return decided;
        },
        ...(inner.levelUp ? { levelUp: inner.levelUp.bind(inner) } : {}),
        ...(inner.chest ? { chest: inner.chest.bind(inner) } : {}),
      };
      wrapped.set(p, c);
    }
    return c;
  };
  const onAction = (before: GameState, step: AiStepResult): void => {
    if (
      decided !== null &&
      decided.type !== "end-turn" &&
      step.action?.type === "end-turn"
    ) {
      failures.push({
        day: before.day,
        player: before.currentPlayer,
        action: decided,
      });
    }
    decided = null;
    for (const e of step.events) {
      if (e.type === "last-stand") lastStands++;
      if (e.type === "battle-error") {
        battleErrors.push({
          day: before.day,
          player: before.currentPlayer,
          message: `${e.error}: ${e.message}`,
        });
      }
    }
    options.onAction?.(before, step);
  };
  const cleared = state.players.map(() => 0);
  const turnMs: number[][] = state.players.map(() => []);
  const days: PlayerMetrics[][] = [];
  let idle = state.players.map(() => 0);
  let firstPlayerFight: number | null = null;
  let firstTownLoss: number | null = null;
  const playerFights: MatchResult["playerFights"] = [];
  const eliminatedOn: Array<number | null> = state.players.map(() => null);
  while (state.status === "playing" && state.day <= options.days) {
    const day = state.day;
    const player = state.currentPlayer;
    const before = new Map(
      heroesOf(state, player).map((h) => [h.id, `${h.x},${h.y}`]),
    );
    const t0 = now();
    thinking = 0;
    const turn = tracedTurn(state, controllers, options.resolver, onAction);
    turnMs[player]?.push(now() - t0);
    thinkMs[player]?.push(thinking);
    for (const e of turn.events) {
      if (e.type === "monster-defeated") {
        cleared[player] = (cleared[player] ?? 0) + 1;
      }
      if (e.type === "battle") {
        const b = e.battle;
        let defender: number | null = null;
        if (b.kind === "hero") {
          defender =
            state.heroes.find((h) => h.id === b.objectId)?.owner ?? null;
        } else if (b.kind === "town") {
          defender = state.towns[b.objectId]?.owner ?? null;
        }
        if (defender !== null && defender !== player) {
          firstPlayerFight ??= day;
          playerFights.push({ day, attacker: player, defender });
        }
      }
      if (
        e.type === "town-captured" &&
        e.from !== null &&
        e.from !== undefined
      ) {
        firstTownLoss ??= day;
      }
    }
    // Idle: alive before and after and never moved (same cell, no move).
    let still = 0;
    const moved = new Set(
      turn.events.flatMap((e) =>
        e.type === "moved" && e.cells.length > 0 ? [e.heroId] : [],
      ),
    );
    for (const [id] of before) {
      const h = turn.state.heroes.find((x) => x.id === id);
      if (h !== undefined && h.alive && !moved.has(id)) still++;
    }
    idle[player] = still;
    state = turn.state;
    if (state.day !== day || state.status !== "playing") {
      // The day ended (or the game): record every player as it stands.
      const metrics = state.players.map((p) =>
        playerMetrics(state, p.id, cleared[p.id] ?? 0, idle[p.id] ?? 0),
      );
      for (const m of metrics) {
        m.day = day;
        if (m.eliminated && eliminatedOn[m.player] === null) {
          eliminatedOn[m.player] = day;
        }
      }
      days.push(metrics);
      options.onDay?.(metrics, state, guardsAtStart);
      idle = state.players.map(() => 0);
    }
    if (turn.outcome === "game-over") break;
  }
  return {
    days,
    state,
    guardsAtStart,
    turnMs,
    thinkMs,
    failures,
    firstPlayerFight,
    firstTownLoss,
    playerFights,
    eliminatedOn,
    battleErrors,
    lastStands,
  };
}
