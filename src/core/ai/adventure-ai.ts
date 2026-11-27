/**
 * The adventure AI v1 (bead bzc.19): a {@link PlayerController} that
 * explores, gathers, builds, recruits, fights and clears the map.
 *
 * Every call to `decide` looks at the state afresh and returns the most
 * urgent action, in this order:
 *
 * 1. a choice at the site a hero stands on (hire at a dwelling, a stat at
 *    an arena, a vault treasure);
 * 2. hero upkeep: assemble a Marvel, wear found artifacts, use a scroll of
 *    sight or a mana potion;
 * 3. towns: hire a second (and, when rich, third) hero; build by the
 *    build order (economy.ts), buying a missing resource at the market;
 *    move the garrison into a visiting hero; recruit (all of it when a
 *    hero is in town, at the week's end or under threat, else only what
 *    the key building being saved for leaves);
 * 4. a secondary hero next to the main hero hands it its troops;
 * 5. movement: each hero (the strongest, "main", first) picks the target
 *    with the best net value per day of travel within a few days' reach:
 *    pickups, mines (also the enemy's), artifacts, dwellings, banks,
 *    shrines and other sites, towns, unexplored ground, own towns with
 *    troops to pick up, the main hero (for a secondary carrying troops),
 *    neutral stacks (worth what they guard plus experience and opened
 *    ground) and enemy heroes. A fight is a target only when the fight
 *    estimate (strength.ts: fast fight-value ratio, then a simulated
 *    battle on a copy for close calls) says the hero wins with decent
 *    survivors; its value is reduced by the troops it costs. Targets
 *    already chosen by another hero are skipped; the hero's previous
 *    target gets a small bonus (goal memory);
 * 6. adventure spells and digging: Dowse early in the week, then a dig
 *    on a marked cell (before moving); Borrowed Day when the target is
 *    just out of reach; no hero ends its day where a stronger enemy hero
 *    can strike (it retreats instead). Docs: docs/design/AI.md;
 * 7. end the turn.
 *
 * Iterations 1-3 (docs/design/AI.md) added fight families, who is
 * winning, capital defence (home guard, towns on watch, held towns),
 * consolidation (town guards), waystones and the difficulty levels
 * (difficulty.ts). Iteration 4 added the war plan (one rival at a time),
 * the home guard by value, routes beside pointless stops, round trips
 * from guarded towns, errands and per-player fog memory.
 *
 * Determinism: no randomness; ties break by map order. The goal and
 * futility memories live in the controller instance (a reloaded game
 * starts them empty), so two runs from the same start play alike.
 * Fog: targets are read from the player's explored cells only.
 */
import { findArtifact, isCursed, wornDef } from "../../data/artifacts.ts";
import { getHeroClass } from "../../data/classes.ts";
import { getCreature } from "../../data/creatures.ts";
import { KEYSTONE_ITEM } from "../../data/factionTowns.ts";
import { findSkill } from "../../data/skills.ts";
import type { MapObject } from "../map/types.ts";
import { inBounds, isPassable } from "../map/types.ts";
import {
  adventureCastError,
  adventurePower,
  inMonsterSpellRange,
  MONSTER_SPELL_RANGE,
  towLineStops,
} from "../magic/adventure.ts";
import { registerSpells } from "../magic/index.ts";
import { adventureSpell, isAdventureSpell } from "../magic/catalog.ts";
import { RANK_MAX_TIER } from "../battle/index.ts";
import {
  assemblable,
  calendar,
  heroBattle,
  heroesOf,
  heroInTownOf,
  heroStats,
  inSight,
  keysOf,
  maxMana,
  obeliskCount,
  obelisksVisited,
  objectTypeOf,
  puzzleCells,
  objectValueFor,
  prizeValue,
  questMissing,
  sightRadius,
  siteOptions,
  skillWeight,
  sweetShopStock,
  townsOf,
  wearError,
  type ArmySlots,
  type BattleResolver,
  type BattleSetup,
  type GameAction,
  type GameState,
  type HeroState,
  type LevelUpOffer,
  type PathStep,
  type PendingBattle,
  type PlayerController,
  type TownState,
} from "../game/index.ts";
import { canCarry } from "../game/artifacts.ts";
import { scrollCaseSize } from "../game/effects.ts";
import { featInfo, featWeight } from "../game/hero.ts";
import { cutsCorner, standsOn } from "../game/pathfinding.ts";
import { pathIn, reachFor, type Reach } from "./reach.ts";
import { gateOpen, inSanctuary, playerListed } from "../game/site-state.ts";
import { slotFor } from "../game/state.ts";
import { drillYardOffers, drillYardPrice } from "../game/sites.ts";
import { createBattleResolver } from "../battle/resolver.ts";
import {
  type BuildPlan,
  chooseBuild,
  chooseHire,
  chooseRecruit,
  dayOfWeek,
  keystoneBuild,
  keystoneHallReady,
  reserveFor,
  tradeFor,
} from "./economy.ts";
import {
  armyFv,
  fastPredictedMs,
  FightOracle,
  heroPower,
  stackFv,
  statFactor,
  type FightEstimate,
} from "./strength.ts";
import {
  DIFFICULTY,
  difficultyOf,
  type Difficulty,
  type DifficultyParams,
} from "./difficulty.ts";

export interface AdventureAiOptions {
  /**
   * Resolver for simulated close fights (default: the game's auto-battle).
   * null: fast fight-value estimates only.
   */
  resolver?: BattleResolver | null;
  /** Days of movement a hero plans ahead (default 4). */
  horizonDays?: number;
  /**
   * Predicted milliseconds of one simulated battle with `resolver` (the
   * turn budget's unit; default strength.ts fastPredictedMs, the cost of
   * the battle AI's fast mode that the default resolver plays). A
   * resolver playing the full mode passes predictedMs.
   */
  simCost?: (setup: BattleSetup) => number;
  /**
   * The difficulty (difficulty.ts); default the state's
   * (`GameState.difficulty`, normal when absent).
   */
  difficulty?: Difficulty;
  /** Predict fights from earlier ones of their family (default true). */
  families?: boolean;
  /** Faction openings in week one (default true). */
  openings?: boolean;
}

/*
 * Turn budget (iteration 1, bead bzc.21; per difficulty since iteration
 * 3, difficulty.ts): the simulated battles of one turn may cost so many
 * predicted milliseconds (strength.ts fastPredictedMs) and number so many
 * per turn and per decide call (a high-stakes fight is simulated twice).
 * The budget counts the prediction, never the clock, so a match plays the
 * same on any machine and under any load. The rules' own battles are not
 * counted (the AI cannot shorten them).
 */
/** Gold value of one point of fight value lost in battle. */
const LOSS_COST = 1.6;
/** Gold value of one experience point (main hero; secondaries half). */
const XP_VALUE = 0.5;
/** Value of an unexplored cell brought into sight. */
const EXPLORE_CELL = 28;
/** Fewest new cells that make a cell worth walking to for the view. */
const MIN_NEW_CELLS = 5;
/** Value of clearing a neutral stack beyond what it guards. */
const CLEAR_VALUE = 350;
/** Days a rival hero gone into the fog still puts a town on watch. */
const WATCH_DAYS = 6;
/** Bonus factor for a hero's previous target (goal memory). */
const GOAL_BONUS = 1.25;
/**
 * A rival town is left alone when its owner has a hero seen near it with
 * more than this share of our hero's power (iteration 4; it was worth 35%
 * above 0.8 and still taken and lost again within days).
 */
const CHASE_SHARE = 0.8;
/**
 * A rival is finished off (its towns worth more, a smaller edge) when we
 * outweigh it this much and know at most this many of its towns
 * (iteration 3: 2 and two towns; iteration 4 widens it so wars end).
 */
const FINISH_STANDING = 1.6;
const FINISH_TOWNS = 3;
/**
 * The fight-value edge wanted against a rival hero that threatens one of
 * our towns (iteration 4; was 1.3 like any hero fight).
 */
const DEFEND_EDGE = 1.15;
/** Extra days added to every target (prefers fewer, bigger trips). */
const DAY_OFFSET = 0.35;

/**
 * How many days' walk from its first town a faction's main hero ranges in
 * the first two weeks (iteration 2): goblins (fast wolves, cheap troops)
 * range further; humans, undead, the Candy Kingdom (a Speed 5 early
 * army, FACTION_CANDY 12) and the Deepforge (Tinkers and Rivet Gunners,
 * Speed 4, FACTION_DWARVES 12) stay closer.
 */
export const WANDER_DAYS: Readonly<Record<string, number>> = {
  humans: 2,
  undead: 2,
  goblins: 3,
  candy: 2,
  dwarves: 2,
};

/**
 * What carrying the Keystone home is worth when the town can build its
 * hall (bead bzc.116): about a dug Keystone's own value, so the bearer
 * goes home within a few days rather than at once from across the map.
 */
const KEYSTONE_HOME_VALUE = 8000;

/** A rival hero as a player last saw it (fog memory). */
interface SeenHero {
  owner: number;
  power: number;
  day: number;
  x: number;
  y: number;
  maxMp: number;
}

/** A target a hero may walk to. */
interface Target {
  key: string;
  /** The cell the path goes to (the stack or hero for an attack). */
  x: number;
  y: number;
  /** Movement points to reach it. */
  cost: number;
  /**
   * For an attack: the cell next to the target to attack from; for a
   * pickup (bead bzc.49): the cell next to it to take it from.
   */
  via?: { x: number; y: number };
  /** The last step takes a pickup from `via` instead of attacking. */
  pickup?: boolean;
  /** Stacks whose zone covers `via`: they attack after the target. */
  chained?: string[];
  /** Gold-equivalent value before a fight's losses. */
  value: number;
  /** The fight on arrival, if any. */
  battle?: PendingBattle;
  /** The highest loss share accepted for this fight. */
  maxLoss?: number;
  /** The lowest fight-value ratio accepted (a clear advantage). */
  minRatio?: number;
  /** Parley: the stack to talk past on arrival (iteration 2). */
  parley?: string;
  /** Score after estimating (null until then). */
  score: number;
  /** Optimistic score (before the fight estimate). */
  bound: number;
  fight?: FightEstimate;
}

/** What one decide call knows about the player. */
interface Turn {
  state: GameState;
  player: number;
  heroes: HeroState[];
  main: HeroState | undefined;
  towns: TownState[];
  explored: boolean[];
  exploredShare: number;
  /** Own towns an enemy hero stronger than their defence can reach soon. */
  threatened: Map<string, number>;
  /**
   * Own towns with a visible enemy hero within about two days (its
   * power): they keep their garrison home.
   */
  alert: Map<string, number>;
  /** Towns this player has ever owned (a lost one is worth retaking). */
  owned: ReadonlySet<string>;
  /**
   * Own towns a rival hero seen in the last days could reach by now
   * (iteration 3): it went back into the fog, so its threat is a guess,
   * weighted down by the days since it was seen. The garrison stays home
   * and the town recruits everything.
   */
  watch: Map<string, number>;
  /**
   * Own towns a visible rival hero within reach would take from the
   * garrison alone but not with the hero standing in them (iteration 3):
   * that hero stays unless it attacks the rival.
   */
  held: Map<string, number>;
  /** Visible enemy heroes. */
  enemies: HeroState[];
  /** Cell -> power of the strongest enemy hero that can attack it next. */
  danger: Map<number, number>;
  /**
   * How much the main hero needs more troops, 0.2..1: the strongest known
   * opposition (stack, town garrison, enemy hero) against its power.
   */
  need: number;
  /**
   * Gold value of a point of fight value lost: lower when troops wait at
   * home or with other heroes to replace the losses.
   */
  lossCost: number;
  /** Each hero's reach, computed on first use. */
  reach: Map<string, Reach>;
  /** Seer quest leads (questLeads), computed on first use. */
  leads?: Map<string, number>;
  /** What the heroes ask of the build order (magic guild early). */
  plan: BuildPlan;
  /**
   * Enemy player -> our strength over theirs (heroes as last seen and
   * explored garrisons; iteration 2): who is winning.
   */
  standing: Map<number, number>;
  /** Rivals we are in a war of attrition with (see strategy()). */
  stalled: Set<number>;
  /** Rival players still in the game. */
  rivals: number;
  /**
   * Rivals to finish off (iteration 3): we outweigh them two to one and
   * they hold at most two towns we know of. Their towns are worth more
   * and need a smaller edge.
   */
  finishing: Set<number>;
  /**
   * The rival this player makes war on (iteration 4's war plan), or null
   * with fewer than two rivals: the others are only defended against.
   */
  focus: number | null;
  /**
   * The main hero wants its reserves: a rival target it cannot take alone
   * lies within reach and the secondaries' troops would tip it.
   */
  gather: boolean;
}

/** Fight value of one week's growth of the town's dwellings. */
export function weeklyGrowthFv(town: TownState): number {
  let fv = 0;
  for (const c of Object.keys(town.dwellings)) {
    const def = getCreature(c);
    fv += def.growth * def.fightValue;
  }
  return fv;
}

/**
 * The guard a town keeps by value (iteration 4, bead bzc.41): a share of
 * one week's growth of its dwellings; half of it in the capital's first
 * two weeks (about the starting militia's tier-1 stack, the capital's
 * week-one guard since iteration 3), then 30% there and 15% in other
 * towns. Iterations 1-3 kept every tier-1 creature home, by tier: the
 * undead, whose numbers are tier-1 skeletons, grew slowly, and late in a
 * game a garrison held weeks of tier-1 growth while the main hero lacked
 * it.
 */
export function homeGuard(
  state: GameState,
  town: TownState,
  capital: boolean,
): number {
  const share = capital ? (state.day <= 14 ? 0.5 : 0.3) : 0.15;
  return weeklyGrowthFv(town) * share;
}

/**
 * A hero whose class leans to magic, or who has learnt a school skill:
 * its player wants the guild early (iteration 2).
 */
export function leansToMagic(hero: HeroState): boolean {
  if (getHeroClass(hero.heroClass).leaning === "magic") return true;
  return hero.skills.some((s) => findSkill(s.id)?.school !== undefined);
}

/**
 * Whether taking `skill` to `rank` lets the hero cast an adventure page it
 * knows but cannot cast at its present rank.
 */
export function unlocksPage(
  hero: HeroState,
  skill: string,
  rank: number,
): boolean {
  const school = findSkill(skill as never)?.school;
  if (school === undefined) return false;
  const now = hero.skills.find((s) => s.id === skill)?.rank ?? 0;
  return hero.pages.some((id) => {
    if (!isAdventureSpell(id)) return false;
    const def = adventureSpell(id);
    if (def.school !== school || def.deferred !== undefined) return false;
    const before = RANK_MAX_TIER[now] ?? 0;
    const after = RANK_MAX_TIER[rank] ?? 0;
    return def.tier > before && def.tier <= after;
  });
}

/** Something is still buried at (x, y) and digHere would accept the cell. */
function diggable(state: GameState, x: number, y: number): boolean {
  const here = state.map.objects.filter(
    (o) => o.x === x && o.y === y && !state.collected.includes(o.id),
  );
  if (here.some((o) => o.kind !== "buried" && o.kind !== "hero-start")) {
    return false;
  }
  return here.some((o) => o.kind === "buried");
}

/** The hero's Attack and Defense factor (strength.ts statFactor). */
function heroStatsFactor(hero: HeroState): number {
  const st = heroStats(hero);
  return statFactor(st.attack, st.defense);
}

/** Gold value of one unit of each resource (CONTENT_MAP_OBJECTS 2). */
const RESOURCE_VALUE: Readonly<Record<string, number>> = {
  gold: 1,
  wood: 100,
  ore: 150,
  essence: 500,
};
/** A mine's value by resource, as the generator prices them. */
const MINE_VALUE: Readonly<Record<string, number>> = {
  wood: 1400,
  ore: 1800,
  essence: 3500,
  gold: 6000,
};

/** The value of a pickup or mine whose map data carries none. */
function fallbackValue(
  state: GameState,
  player: number,
  obj: MapObject,
): number {
  if (obj.kind === "pickup" && !state.collected.includes(obj.id)) {
    if (obj.data["chest"] === true) return 1000;
    const r = String(obj.data["resource"] ?? "");
    const n = Number(obj.data["amount"] ?? 0);
    return (RESOURCE_VALUE[r] ?? 0) * n;
  }
  if (obj.kind === "mine" && state.mines[obj.id]?.owner !== player) {
    return MINE_VALUE[String(obj.data["resource"] ?? "")] ?? 0;
  }
  return 0;
}

/** Whether visiting a bank or site starts a fight with its guard first. */
function siteGuard(state: GameState, obj: MapObject): boolean {
  return (
    (obj.kind === "bank" || obj.kind === "site") &&
    Array.isArray(obj.data["guard"]) &&
    state.sites[obj.id]?.guard?.length !== 0 &&
    state.sites[obj.id]?.done !== true
  );
}

/**
 * Whether the hero has room for what a pickup gives (bead bzc.49): an
 * artifact in the backpack, a scroll in the case. A full hero would stand
 * beside it for nothing.
 */
function roomFor(hero: HeroState, obj: MapObject): boolean {
  const type = objectTypeOf(obj);
  const art = obj.data["artifact"];
  if (type === "loose-scroll")
    return hero.scrolls.length < scrollCaseSize(hero);
  // A loose artifact, the fallen adventurer's Wonder, a rich chest's Trinket.
  const carries =
    type === "loose-artifact" ||
    type === "fallen-adventurer" ||
    type === "mystery-bag" ||
    obj.kind === "pickup";
  return typeof art !== "string" || !carries || canCarry(hero, art);
}

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

function townObject(state: GameState, id: string): MapObject | undefined {
  return state.map.objects.find((o) => o.id === id);
}

export class AdventureAi implements PlayerController {
  private readonly oracle: FightOracle;
  private readonly horizon: number;
  private readonly difficulty: Difficulty | undefined;
  /** This decide call's difficulty parameters. */
  private params: DifficultyParams = DIFFICULTY.normal;
  private readonly openings: boolean;
  /** "<player>:<object>" -> last day it is not worth a visit. */
  private readonly futile = new Map<string, number>();
  /** Hero id -> its target key (goal memory). */
  private readonly goals = new Map<string, string>();
  /** "<day>:<hero>:<object>:<option>" site choices made (no repeats). */
  private readonly answered = new Set<string>();
  /**
   * "<day>:<hero>:<object>" pickups a hero reached for (bead bzc.49): one
   * still there on a second try gave nothing (no room, eight heroes), so
   * it is futile for a while, as a site the hero stood on is.
   */
  private readonly reached = new Set<string>();
  private day = 0;
  private turnKey = "";
  private turnSims = 0;
  /** The oracle's predicted simulation cost when this turn began. */
  private turnSimAt = 0;
  /** Player -> its main hero's id (sticky: see mainHero). */
  private readonly mains = new Map<number, string>();
  /** "<player>:<town>" -> last day the main hero took troops there. */
  private readonly lastPickup = new Map<string, number>();
  /** Player -> towns it has owned (to retake one it lost). */
  private readonly ownedTowns = new Map<number, Set<string>>();
  private dangerCache: { key: string; danger: Map<number, number> } | null =
    null;
  /**
   * Player -> enemy hero id -> owner, power and place when that player
   * last saw it (fog memory; iteration 4: per player, so one computer
   * player never knows what another saw).
   */
  private readonly seen = new Map<number, Map<string, SeenHero>>();
  /** Player -> its own total power by day (who is winning, over time). */
  private readonly powerLog = new Map<number, Map<number, number>>();
  /** "<player>:<enemy>" -> days this player attacked that enemy. */
  private readonly attacks = new Map<string, number[]>();
  /** "<player>:<enemy hero>" -> day Read the Seal was last cast on it. */
  private readonly sealRead = new Map<string, number>();
  /** "<player>:<town>" -> the day the player took (or began with) it. */
  private readonly since = new Map<string, number>();
  /** "<player>:<town>" -> when the player lost it, after how many days. */
  private readonly lostOn = new Map<string, { day: number; held: number }>();
  /** Hero id -> the town cell it must be back on before the day ends. */
  private readonly anchors = new Map<
    string,
    { day: number; x: number; y: number }
  >();
  /** Town -> the last day a hero left troops there (no taking back). */
  private readonly droppedAt = new Map<string, number>();
  /** Player -> the rival it makes war on (iteration 4, see warPlan). */
  private readonly focusOf = new Map<number, number>();
  /** Hero id -> cells it was seen on, by day (last few days). */
  private readonly trail = new Map<string, Array<[number, number, number]>>();

  constructor(options: AdventureAiOptions = {}) {
    registerSpells();
    const resolver =
      options.resolver === undefined
        ? createBattleResolver()
        : options.resolver;
    this.oracle = new FightOracle(resolver, {
      costOf: options.simCost ?? fastPredictedMs,
      families: options.families ?? true,
    });
    this.openings = options.openings ?? true;
    this.difficulty = options.difficulty;
    this.horizon = options.horizonDays ?? 4;
  }

  /** Battles simulated so far (profiling). */
  get simulations(): number {
    return this.oracle.simulations;
  }

  /** Fights predicted from their family instead of simulated (profiling). */
  get inferred(): number {
    return this.oracle.inferred;
  }

  /** Fight estimates put off for want of simulation budget (profiling). */
  get deferrals(): number {
    return this.oracle.deferrals;
  }

  decide(state: GameState, player: number): GameAction {
    if (state.day !== this.day) {
      // Fight estimates stay cached (keyed by both armies) across days.
      this.day = state.day;
      for (const k of this.answered) {
        if (!k.startsWith(`${state.day}:`)) this.answered.delete(k);
      }
    }
    // At most a few simulated battles per decision and per turn keep a
    // turn fast (the rest get the fast estimate).
    const params = DIFFICULTY[this.difficulty ?? difficultyOf(state)];
    this.params = params;
    this.oracle.maxSimMs = params.turnSimMs;
    const turnKey = `${state.day}:${player}`;
    if (turnKey !== this.turnKey) {
      this.turnKey = turnKey;
      this.turnSims = params.simsPerTurn;
      this.turnSimAt = this.oracle.simCost;
    }
    const before = this.oracle.simulations;
    const left = params.turnSimMs - (this.oracle.simCost - this.turnSimAt);
    this.oracle.budget =
      left <= 0 ? 0 : Math.min(params.simsPerDecision, this.turnSims);
    this.oracle.msBudget = Math.max(0, left);
    const action = this.decideTurn(state, player);
    this.turnSims -= this.oracle.simulations - before;
    return action;
  }

  /** Milliseconds actually spent simulating battles so far (profiling). */
  get simMs(): number {
    return this.oracle.simMs;
  }

  private decideTurn(state: GameState, player: number): GameAction {
    const turn = this.turnOf(state, player);
    const choice = this.siteChoice(turn);
    if (choice !== null) return choice;
    this.noteFutile(turn);
    return (
      this.upkeep(turn) ??
      this.townActions(turn) ??
      this.ferry(turn) ??
      this.digging(turn) ??
      this.scouting(turn) ??
      this.movement(turn) ?? { type: "end-turn" }
    );
  }

  /** Whether the hero stands on a Dowse mark with something still buried. */
  private onMark(turn: Turn, hero: HeroState): boolean {
    return this.digSpots(turn.state, turn.player).some(
      ([x, y]) => x === hero.x && y === hero.y,
    );
  }

  levelUp(state: GameState, heroId: string, offer: LevelUpOffer): number {
    const hero = state.heroes.find((h) => h.id === heroId);
    if (hero === undefined) return 0;
    let best = 0;
    let bestScore = -1;
    if (offer.step === "skill") {
      offer.offers.forEach((o, i) => {
        const base =
          o.kind === "new"
            ? skillWeight(hero, o.skill, 1) *
              (hero.skills.length < 4 ? 1.2 : 0.8)
            : o.kind === "upgrade"
              ? skillWeight(hero, o.skill, o.rank) * 1.4
              : o.stat === "attack" || o.stat === "defense"
                ? 2.5
                : 1.5;
        // A school rank that unlocks a known adventure page (iteration
        // 2: Green Road, Opening Salvo, Parley need a rank in their
        // school) weighs double.
        const s =
          o.kind === "new" || o.kind === "upgrade"
            ? base *
              (unlocksPage(hero, o.skill, o.kind === "new" ? 1 : o.rank)
                ? 2
                : 1)
            : base;
        if (s > bestScore) {
          bestScore = s;
          best = i;
        }
      });
    } else {
      offer.offers.forEach((id, i) => {
        const def = featInfo(id);
        const s = def === undefined ? 0 : featWeight(hero, def);
        if (s > bestScore) {
          bestScore = s;
          best = i;
        }
      });
    }
    return best;
  }

  chest(state: GameState, heroId: string): "gold" | "xp" {
    const hero = state.heroes.find((h) => h.id === heroId);
    if (hero === undefined) return "gold";
    const gold =
      state.players.find((p) => p.id === hero.owner)?.resources.gold ?? 0;
    const main = this.mainHero(hero.owner, heroesOf(state, hero.owner));
    if (main?.id === hero.id && gold >= 4000 && hero.level < 10) return "xp";
    return "gold";
  }

  // ---------------------------------------------------------------- turn

  /**
   * The player's main hero: the strongest, but sticky (iteration 1). A
   * freshly hired hero with a bigger starting army used to become main at
   * once, and the old main handed it every stack; now the main changes
   * only when it is gone or another hero is clearly stronger.
   */
  private mainHero(
    player: number,
    heroes: readonly HeroState[],
  ): HeroState | undefined {
    let best: HeroState | undefined;
    let power = -1;
    const score = (h: HeroState): number => heroPower(h) + h.level * 50;
    for (const h of heroes) {
      const p = score(h);
      if (p > power) {
        power = p;
        best = h;
      }
    }
    const current = heroes.find((h) => h.id === this.mains.get(player));
    if (
      current !== undefined &&
      best !== undefined &&
      best !== current &&
      score(best) < score(current) * 1.6 + 500
    ) {
      best = current;
    }
    if (best !== undefined) this.mains.set(player, best.id);
    return best;
  }

  private turnOf(state: GameState, player: number): Turn {
    const all = heroesOf(state, player);
    const main = this.mainHero(player, all);
    const heroes =
      main === undefined ? all : [main, ...all.filter((h) => h !== main)];
    const towns = townsOf(state, player);
    let owned = this.ownedTowns.get(player);
    if (owned === undefined) {
      owned = new Set();
      this.ownedTowns.set(player, owned);
    }
    for (const t of towns) owned.add(t.id);
    this.noteTenure(state, player, towns);
    const explored = state.players.find((p) => p.id === player)?.explored ?? [];
    let seen = 0;
    for (const e of explored) if (e) seen++;
    const w = state.map.width;
    const enemies = state.heroes.filter(
      (h) =>
        h.alive &&
        h.owner !== player &&
        explored[h.y * w + h.x] === true &&
        !inSanctuary(state, h.x, h.y),
    );
    const threatened = new Map<string, number>();
    const alert = new Map<string, number>();
    const held = new Map<string, number>();
    for (const town of towns) {
      const obj = townObject(state, town.id);
      if (obj === undefined) continue;
      const defenders = heroInTownOf(state, town);
      const defence =
        armyFv(town.garrison) * (1 + 0.05 * 2) +
        (defenders === undefined ? 0 : heroPower(defenders));
      for (const foe of enemies) {
        const d = chebyshev(foe.x, foe.y, obj.x, obj.y);
        const p = heroPower(foe);
        // Within about two days: the town keeps its garrison home.
        if (d <= (foe.maxMp / 100) * 2.6 + 2) {
          alert.set(town.id, Math.max(alert.get(town.id) ?? 0, p));
        }
        const reach = (foe.maxMp / 100) * 1.6 + 1;
        if (d > reach) continue;
        if (p > defence) {
          threatened.set(town.id, Math.max(threatened.get(town.id) ?? 0, p));
        }
        // Held only by the hero standing in it (iteration 3).
        if (
          defenders !== undefined &&
          p <= defence &&
          p > armyFv(town.garrison) * 1.1
        ) {
          held.set(town.id, Math.max(held.get(town.id) ?? 0, p));
        }
      }
    }
    // Cells a visible enemy hero can attack on its next turn. Enemies do
    // not move during this turn: computed once per turn and enemy set
    // (a beaten enemy changes the key).
    // A pickup taken opens its cell (bead bzc.49): the key changes too.
    const dangerKey = `${state.day}:${player}:${state.collected.length}:${enemies
      .map((h) => `${h.id}@${h.x},${h.y}:${Math.round(heroPower(h))}`)
      .join(";")}`;
    const cached = this.dangerCache;
    const fresh = cached === null || cached.key !== dangerKey;
    const danger = fresh ? new Map<number, number>() : cached.danger;
    this.dangerCache = { key: dangerKey, danger };
    for (const foe of fresh ? enemies : []) {
      const p = heroPower(foe);
      const r = reachFor(state, foe, Math.max(foe.maxMp, foe.mp));
      for (const i of r.cost.keys()) {
        const x = i % w;
        const y = (i - x) / w;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!inBounds(state.map, x + dx, y + dy)) continue;
            const j = (y + dy) * w + x + dx;
            if ((danger.get(j) ?? 0) < p) danger.set(j, p);
          }
        }
      }
    }
    let strongest = 0;
    for (const m of Object.values(state.monsters)) {
      if (explored[m.y * w + m.x] !== true) continue;
      strongest = Math.max(strongest, stackFv(m.creature, m.count));
    }
    for (const t of Object.values(state.towns)) {
      if (t.owner === player) continue;
      const obj = townObject(state, t.id);
      if (obj === undefined || explored[obj.y * w + obj.x] !== true) continue;
      strongest = Math.max(strongest, armyFv(t.garrison) * 1.3);
    }
    for (const foe of enemies) strongest = Math.max(strongest, heroPower(foe));
    const mainPower = main === undefined ? 0 : heroPower(main);
    const need =
      mainPower <= 0
        ? 1
        : Math.min(1, Math.max(0.2, (2.5 * strongest) / mainPower));
    let reserves = 0;
    for (const h of all) if (h !== main) reserves += armyFv(h.army);
    for (const t of towns) reserves += armyFv(t.garrison);
    const mainFv = main === undefined ? 0 : armyFv(main.army);
    const lossCost =
      LOSS_COST / Math.min(3, 1 + reserves / Math.max(1, mainFv));
    const strategy = this.strategy(state, player, all, towns, enemies);
    const watch = this.watchList(state, player, towns, enemies);
    this.noteTrail(state, all);
    const turn: Turn = {
      state,
      player,
      heroes,
      main,
      towns,
      explored,
      exploredShare: explored.length === 0 ? 1 : seen / explored.length,
      threatened,
      alert,
      held,
      watch,
      owned,
      enemies,
      danger,
      need,
      lossCost,
      reach: new Map(),
      plan: {
        magic: all.some((h) => leansToMagic(h)),
        opening: this.openings,
      },
      ...strategy,
      gather: false,
    };
    turn.gather = this.wantsReserves(turn);
    return turn;
  }

  /** What `player` remembers of rival heroes (see `seen`). */
  private seenBy(player: number): Map<string, SeenHero> {
    let m = this.seen.get(player);
    if (m === undefined) {
      m = new Map();
      this.seen.set(player, m);
    }
    return m;
  }

  /**
   * Who is winning (iteration 2, bead bzc.22). Our power (heroes and
   * garrisons) against each rival's: its heroes as last seen (a hero seen
   * in the last three weeks counts while alive) and its explored towns'
   * garrisons. A rival we attacked twice in ten days while our own power
   * has not grown in a week, and that we do not clearly outweigh, is a war
   * of attrition ("stalled"): its heroes and towns need a bigger edge.
   */
  private strategy(
    state: GameState,
    player: number,
    heroes: readonly HeroState[],
    towns: readonly TownState[],
    enemies: readonly HeroState[],
  ): Pick<Turn, "standing" | "stalled" | "rivals" | "finishing" | "focus"> {
    for (const foe of enemies) {
      this.seenBy(player).set(foe.id, {
        owner: foe.owner,
        power: heroPower(foe),
        day: state.day,
        x: foe.x,
        y: foe.y,
        maxMp: foe.maxMp,
      });
    }
    let own = 0;
    for (const h of heroes) own += heroPower(h);
    for (const t of towns) own += armyFv(t.garrison);
    let log = this.powerLog.get(player);
    if (log === undefined) {
      log = new Map();
      this.powerLog.set(player, log);
    }
    log.set(state.day, own);
    log.delete(state.day - 15);
    const foes = new Map<number, number>();
    for (const p of state.players) {
      if (p.id !== player && !p.eliminated) foes.set(p.id, 0);
    }
    for (const [id, seen] of this.seenBy(player)) {
      if (!foes.has(seen.owner) || state.day - seen.day > 21) continue;
      const h = state.heroes.find((x) => x.id === id);
      if (h === undefined || !h.alive || h.owner !== seen.owner) continue;
      foes.set(seen.owner, (foes.get(seen.owner) ?? 0) + seen.power);
    }
    const w = state.map.width;
    const explored = state.players.find((p) => p.id === player)?.explored;
    const known = new Map<number, number>();
    for (const t of Object.values(state.towns)) {
      if (t.owner === null || !foes.has(t.owner)) continue;
      const o = townObject(state, t.id);
      if (o === undefined || explored?.[o.y * w + o.x] !== true) continue;
      foes.set(t.owner, (foes.get(t.owner) ?? 0) + armyFv(t.garrison));
      known.set(t.owner, (known.get(t.owner) ?? 0) + 1);
    }
    const standing = new Map<number, number>();
    const stalled = new Set<number>();
    const weekAgo = log.get(state.day - 7);
    const growing = weekAgo === undefined || own > weekAgo * 1.1;
    for (const [p, power] of foes) {
      const ratio = power <= 0 ? 9 : own / power;
      standing.set(p, ratio);
      const recent = (this.attacks.get(`${player}:${p}`) ?? []).filter(
        (d) => state.day - d <= 10,
      );
      if (recent.length >= 2 && !growing && ratio < 1.6) stalled.add(p);
    }
    const finishing = new Set<number>();
    for (const [p, n] of known) {
      if (
        n <= FINISH_TOWNS &&
        (standing.get(p) ?? 0) >= FINISH_STANDING &&
        !stalled.has(p)
      ) {
        finishing.add(p);
      }
    }
    const focus = this.warPlan(state, player, towns, standing, foes);
    return { standing, stalled, rivals: foes.size, finishing, focus };
  }

  /**
   * The war plan (iteration 4, bead bzc.41): with two or more rivals left,
   * the player makes war on one of them (the focus) and holds a defensive
   * posture against the rest (three-player maps had 24-46 player battles
   * a match, towns flipping and every army worn down). Each rival scores
   * by weakness (our power over its known power), nearness (its nearest
   * known town or hero to our towns) and threat (it took a town of ours,
   * or its heroes roam near them); the focus is sticky and changes only
   * when another rival scores 1.5 times as much or the focus is out.
   * Null with fewer than two rivals (no plan needed).
   */
  private warPlan(
    state: GameState,
    player: number,
    towns: readonly TownState[],
    standing: ReadonlyMap<number, number>,
    foes: ReadonlyMap<number, number>,
  ): number | null {
    if (foes.size < 2) {
      this.focusOf.delete(player);
      return null;
    }
    const w = state.map.width;
    const explored = state.players.find((p) => p.id === player)?.explored;
    const homes = towns.flatMap((t) => {
      const o = townObject(state, t.id);
      return o === undefined ? [] : [o];
    });
    const owned = this.ownedTowns.get(player) ?? new Set<string>();
    const score = new Map<number, number>();
    for (const [rival] of foes) {
      let dist = Infinity;
      let threat = 0;
      let seenAny = false;
      const near = (x: number, y: number): number =>
        Math.min(Infinity, ...homes.map((o) => chebyshev(o.x, o.y, x, y)));
      for (const t of Object.values(state.towns)) {
        if (t.owner !== rival) continue;
        const o = townObject(state, t.id);
        if (o === undefined || explored?.[o.y * w + o.x] !== true) continue;
        seenAny = true;
        dist = Math.min(dist, near(o.x, o.y));
        // It holds a town that was ours: it is at war with us.
        if (owned.has(t.id)) threat += 2;
      }
      for (const [id, seen] of this.seenBy(player)) {
        if (seen.owner !== rival || state.day - seen.day > 14) continue;
        const h = state.heroes.find((x) => x.id === id);
        if (h === undefined || !h.alive || h.owner !== rival) continue;
        seenAny = true;
        const d = near(seen.x, seen.y);
        dist = Math.min(dist, d);
        if (state.day - seen.day <= 5 && d <= (seen.maxMp / 100) * 3 + 2) {
          threat = Math.max(threat, 1);
        }
      }
      if (!seenAny) continue;
      const weak = Math.min(4, standing.get(rival) ?? 1);
      const nearness = 30 / (30 + (Number.isFinite(dist) ? dist : 60));
      score.set(rival, Math.sqrt(weak) * nearness * (1 + threat * 0.5));
    }
    const current = this.focusOf.get(player);
    let best: number | null = null;
    let bestScore = 0;
    for (const [rival, s] of score) {
      if (s > bestScore) {
        bestScore = s;
        best = rival;
      }
    }
    const held = current === undefined ? undefined : score.get(current);
    if (current !== undefined && held !== undefined && bestScore < held * 1.5) {
      best = current;
    }
    if (best === null) {
      this.focusOf.delete(player);
      return null;
    }
    this.focusOf.set(player, best);
    return best;
  }

  /**
   * Whether the war plan holds back against `rival` (iteration 4): with a
   * focus chosen, every other rival is only defended against.
   */
  private holding(turn: Turn, rival: number): boolean {
    return (
      turn.focus !== null && rival !== turn.focus && !turn.finishing.has(rival)
    );
  }

  /**
   * Own towns a rival hero last seen in the fog could reach by now
   * (iteration 3, bead bzc.23): a hero seen up to WATCH_DAYS days ago
   * within its possible walk since then (two days more than it had) counts
   * with its power then, weighted down by the days since (a rival coming
   * out of unexplored ground was not seen until it struck). Kept only when
   * stronger than the town's defence (garrison with the fort, a hero in
   * it).
   */
  private watchList(
    state: GameState,
    player: number,
    towns: readonly TownState[],
    enemies: readonly HeroState[],
  ): Map<string, number> {
    const watch = new Map<string, number>();
    const visible = new Set(enemies.map((h) => h.id));
    for (const town of towns) {
      const obj = townObject(state, town.id);
      if (obj === undefined) continue;
      const defenders = heroInTownOf(state, town);
      const defence =
        armyFv(town.garrison) * 1.1 +
        (defenders === undefined ? 0 : heroPower(defenders));
      for (const [id, seen] of this.seenBy(player)) {
        if (visible.has(id)) continue;
        const since = state.day - seen.day;
        if (since < 1 || since > WATCH_DAYS) continue;
        const foe = state.heroes.find((h) => h.id === id);
        if (foe === undefined || !foe.alive || foe.owner !== seen.owner) {
          continue;
        }
        const walk = (seen.maxMp / 100) * (since + 2) + 2;
        if (chebyshev(seen.x, seen.y, obj.x, obj.y) > walk) continue;
        const p = seen.power * Math.max(0.3, 1 - since / (WATCH_DAYS + 2));
        if (p <= defence) continue;
        watch.set(town.id, Math.max(watch.get(town.id) ?? 0, p));
      }
    }
    return watch;
  }

  /** A town's defence: its garrison with the fort, and a hero in it. */
  private townDefence(state: GameState, town: TownState): number {
    const inside = heroInTownOf(state, town);
    return (
      armyFv(town.garrison) * 1.1 +
      (inside === undefined ? 0 : heroPower(inside))
    );
  }

  /** Records where the player's heroes stand now (see wasAt). */
  private noteTrail(state: GameState, heroes: readonly HeroState[]): void {
    for (const h of heroes) {
      let t = this.trail.get(h.id);
      if (t === undefined) {
        t = [];
        this.trail.set(h.id, t);
      }
      const last = t[t.length - 1];
      if (last?.[0] === state.day && last[1] === h.x && last[2] === h.y) {
        continue;
      }
      t.push([state.day, h.x, h.y]);
      while (t.length > 0 && (t[0]?.[0] ?? 0) < state.day - 5) t.shift();
    }
  }

  /**
   * Records since when the player holds each of its towns and, for a town
   * it lost, when and after how long (iteration 4: see worthRetaking).
   */
  private noteTenure(
    state: GameState,
    player: number,
    towns: readonly TownState[],
  ): void {
    const now = new Set(towns.map((t) => t.id));
    for (const t of towns) {
      const key = `${player}:${t.id}`;
      if (!this.since.has(key)) this.since.set(key, state.day);
    }
    for (const [key, day] of this.since) {
      const [p, town] = key.split(":");
      if (Number(p) !== player || town === undefined || now.has(town)) continue;
      this.since.delete(key);
      this.lostOn.set(key, { day: state.day, held: state.day - day });
    }
  }

  /**
   * Whether a town we lost is worth retaking at any edge (iteration 4,
   * bead bzc.41): the capital always; another town only when we held it
   * for a week and lost it in the last week. A town two players each held
   * for a day or two was "ours" for both and flipped back and forth.
   */
  private worthRetaking(turn: Turn, townId: string): boolean {
    if (!turn.owned.has(townId)) return false;
    if (turn.owned.values().next().value === townId) return true;
    const lost = this.lostOn.get(`${turn.player}:${townId}`);
    return (
      lost !== undefined && lost.held >= 7 && turn.state.day - lost.day <= 7
    );
  }

  /** Whether the hero stood on (x, y) in the last `days` days (not today). */
  private wasAt(
    hero: HeroState,
    x: number,
    y: number,
    day: number,
    days: number,
  ): boolean {
    return (this.trail.get(hero.id) ?? []).some(
      ([d, tx, ty]) => d < day && d >= day - days && tx === x && ty === y,
    );
  }

  /** The rival a target's fight is against (its hero or town), or null. */
  private rivalOf(state: GameState, t: Target): number | null {
    const b = t.battle;
    if (b === undefined) return null;
    if (b.kind === "hero") {
      return state.heroes.find((h) => h.id === b.objectId)?.owner ?? null;
    }
    if (b.kind === "town") return state.towns[b.objectId]?.owner ?? null;
    return null;
  }

  /** Notes an attack on `enemy` today (for the attrition check). */
  private noteAttack(player: number, enemy: number, day: number): void {
    const key = `${player}:${enemy}`;
    const days = (this.attacks.get(key) ?? []).filter((d) => day - d <= 14);
    if (!days.includes(day)) days.push(day);
    this.attacks.set(key, days);
  }

  /**
   * The edge a fight against `enemy`'s heroes or towns needs (iteration
   * 2): a stalled war or, with two or more rivals left, a rival stronger
   * than us asks for more (a third player profits from our losses); a
   * rival we clearly outweigh is pressed at a smaller edge.
   */
  private edgeAgainst(turn: Turn, enemy: number, base: number): number {
    const standing = turn.standing.get(enemy) ?? 1;
    const bonus = this.params.edgeBonus;
    if (turn.stalled.has(enemy)) return Math.max(base, 1.7) + bonus;
    if (turn.finishing.has(enemy)) return Math.min(base, 1.15) + bonus;
    if (turn.rivals >= 2 && standing < 1) return Math.max(base, 1.5) + bonus;
    if (standing >= 2) return Math.min(base, 1.2) + bonus;
    return base + bonus;
  }

  // ---------------------------------------------------------- site choice

  private siteChoice(turn: Turn): GameAction | null {
    const { state } = turn;
    const gold =
      state.players.find((p) => p.id === turn.player)?.resources.gold ?? 0;
    for (const hero of turn.heroes) {
      const obj = state.map.objects.find(
        (o) =>
          o.x === hero.x &&
          o.y === hero.y &&
          (o.kind === "dwelling" || o.kind === "site" || o.kind === "bank"),
      );
      if (obj === undefined) continue;
      // Second Helping (bead bzc.32) on our own dwelling before hiring.
      const helping = "second-helping";
      const helpKey = `${state.day}:${hero.id}:${obj.id}:${helping}`;
      if (
        obj.kind === "dwelling" &&
        gold >= 1000 &&
        hero.pages.includes(helping) &&
        !this.answered.has(helpKey) &&
        adventureCastError(state, hero, helping) === null
      ) {
        this.answered.add(helpKey);
        return { type: "cast", heroId: hero.id, spell: helping };
      }
      const options = siteOptions(state, hero, obj).filter(
        (o) => o.disabled === undefined,
      );
      const drills = drillYardOffers(state, hero);
      let pick: string | null = null;
      let best = 0;
      for (const o of options) {
        const [verb, arg = ""] = o.id.split(":");
        let v = 0;
        if (verb === "hire") v = Number(arg) > 0 ? 1000 : 0;
        else if (verb === "stat") {
          const free = objectTypeOf(obj) === "arena";
          if (free || gold >= 7000) v = arg === "attack" ? 600 : 500;
        } else if (verb === "pay") v = gold >= 9000 ? 400 : 0;
        else if (verb === "take") {
          const choices = obj.data["choices"];
          const prize = Array.isArray(choices)
            ? choices[Number(arg)]
            : undefined;
          v = prize === undefined ? 1 : 1 + prizeValue(prize as never);
        } else if (verb === "lift") v = 300;
        // A sphinx's riddle (bead bzc.88): the AI guesses, by the day.
        else if (verb === "answer")
          v = 300 + ((Number(arg) + state.day) % options.length);
        // The Infernal Forge (bead bzc.125): only while reforging gains more
        // than it costs; a worn Trinket first (the Wonder may go on).
        else if (verb === "reforge")
          v =
            objectValueFor(state, turn.player, obj, hero.id) > 0
              ? arg.startsWith("w")
                ? 450
                : 440
              : 0;
        // A Sweet Shop's free treat (bead bzc.124): the dearest potion.
        else if (verb === "treat") {
          const item = sweetShopStock(obj)[Number(arg)];
          v = 200 + (findArtifact(item ?? "")?.value ?? 0) / 10;
        }
        // A Witch's Hut (bead bzc.126): a rank while a week's recruiting
        // stays in the treasury; raising a skill it has before a new one.
        else if (verb === "learn") {
          if (gold >= 1500 + 4000)
            v = hero.skills.some((s) => s.id === arg) ? 520 : 480;
        }
        // A Hag's Cauldron's brew: two in three bless, worth the risk.
        else if (verb === "drink") v = 300;
        else if (verb === "drill") {
          // A Drill (bead bzc.32) for the army's creatures, when the
          // treasury keeps a week of recruiting after it.
          const d = drills.find((x) => x.building === arg);
          if (d !== undefined && gold >= drillYardPrice(d) + 4000) {
            v = 200 + d.townGold / 10;
          }
        }
        if (v > best) {
          best = v;
          pick = o.id;
        }
      }
      if (pick === null) continue;
      const key = `${state.day}:${hero.id}:${obj.id}:${pick}`;
      if (this.answered.has(key)) continue;
      this.answered.add(key);
      return {
        type: "use-site",
        heroId: hero.id,
        objectId: obj.id,
        option: pick,
      };
    }
    return null;
  }

  /**
   * A hero standing on a site that still shows value got nothing from the
   * visit (a locked lodge, an unaffordable hire, a skill it cannot learn):
   * the site is left alone for a while.
   */
  private noteFutile(turn: Turn): void {
    const { state } = turn;
    for (const hero of turn.heroes) {
      const obj = state.map.objects.find(
        (o) =>
          o.x === hero.x &&
          o.y === hero.y &&
          (o.kind === "dwelling" ||
            o.kind === "site" ||
            o.kind === "bank" ||
            o.kind === "artifact"),
      );
      if (obj === undefined) continue;
      if (this.objectValue(turn, hero, obj, 1) > 0) {
        this.markFutile(turn.player, obj.id, state.day, 7);
      }
    }
  }

  // --------------------------------------------------------------- upkeep

  private upkeep(turn: Turn): GameAction | null {
    for (const hero of turn.heroes) {
      const marvel = assemblable(hero)[0];
      if (marvel !== undefined) {
        return { type: "assemble", heroId: hero.id, marvel };
      }
      for (let i = 0; i < hero.backpack.length; i++) {
        const id = hero.backpack[i];
        if (id === undefined) continue;
        const def = findArtifact(id);
        if (def === undefined) continue;
        if (def.kind === "consumable") {
          const use = def.use;
          if (use.kind === "reveal")
            return { type: "use-item", heroId: hero.id, index: i };
          if (use.kind === "mana" && hero.mana < 10) {
            return { type: "use-item", heroId: hero.id, index: i };
          }
          continue;
        }
        if (def.kind !== "worn" || isCursed(id)) continue;
        const slot = this.slotFor(hero, id);
        if (slot !== null) {
          return { type: "equip", heroId: hero.id, index: i, slot };
        }
      }
    }
    return null;
  }

  /** A worn slot where `id` is an upgrade: empty, or holding a weaker item. */
  private slotFor(hero: HeroState, id: string): number | null {
    const def = wornDef(id);
    if (def === undefined) return null;
    let best: number | null = null;
    let bestValue = def.value;
    hero.worn.forEach((w, slot) => {
      if (wearError(hero, id, slot) !== null) return;
      if (w === null) {
        if (best === null || bestValue > 0) {
          best = slot;
          bestValue = 0;
        }
        return;
      }
      if (isCursed(w)) return;
      const v = findArtifact(w)?.value ?? 0;
      if (v < bestValue) {
        best = slot;
        bestValue = v;
      }
    });
    return best;
  }

  // ---------------------------------------------------------------- towns

  private townActions(turn: Turn): GameAction | null {
    const { state, player } = turn;
    // Iteration 4: no hire into a town a stronger rival hero can reach
    // (fresh hires there were killed with the town, again and again).
    const hireTowns =
      turn.heroes.length === 0
        ? turn.towns
        : turn.towns.filter((t) => !turn.threatened.has(t.id));
    const hire = chooseHire(state, player, hireTowns, this.mapWork(turn), {
      third: this.params.thirdHero,
      fourth: this.params.fourthHero,
    });
    if (hire !== null) return hire;
    const dow = dayOfWeek(state.day);
    for (const town of turn.towns) {
      const threat = turn.threatened.has(town.id);
      const hero = heroInTownOf(state, town);
      const isMain = hero !== undefined && hero === turn.main;
      // An enemy hero within about two days: the garrison stays home,
      // unless the main hero is here and, with it, clearly the stronger
      // (it takes the troops to meet the enemy).
      const foe = turn.alert.get(town.id);
      const mainHolds =
        isMain &&
        foe !== undefined &&
        heroPower(hero) + armyFv(town.garrison) >= foe * 1.3;
      // A rival last seen nearby may come out of the fog (iteration 3):
      // the garrison stays unless the main hero alone is clearly the
      // stronger.
      const watched = turn.watch.get(town.id);
      const watchHolds =
        isMain && watched !== undefined && heroPower(hero) >= watched * 1.3;
      const keep =
        threat ||
        (foe !== undefined && !mainHolds) ||
        (watched !== undefined && !watchHolds);
      // A town rivals roam near keeps a guard (iteration 3): the main
      // hero leaves it behind and secondaries do not ferry it away.
      // A town only the main hero's presence holds (iteration 4) wants
      // a garrison that holds it alone.
      const holdOff = isMain ? turn.held.get(town.id) : undefined;
      const guard = keep
        ? 0
        : Math.max(
            this.guardOf(turn, town),
            holdOff === undefined ? 0 : holdOff / 1.05,
          );
      // A town only the main hero's presence holds (iteration 4): when
      // part of its army makes the garrison hold alone, it leaves that
      // part and goes on (main heroes sat in such towns for weeks).
      if (isMain && holdOff !== undefined) {
        const need = holdOff / 1.05 - armyFv(town.garrison);
        if (need > 0 && armyFv(hero.army) * 0.4 >= need) {
          const d = this.topUpGuard(town, hero, need);
          if (d !== null) return this.dropped(turn, town, d);
        }
      }
      // The main hero takes the garrison along.
      if (isMain && !keep) {
        const t = this.garrisonToHero(town, hero, guard);
        if (t !== null) {
          this.lastPickup.set(`${player}:${town.id}`, state.day);
          return t;
        }
      }
      // Under threat everything is recruited first; what gold is left
      // then builds (iteration 3: a threatened town sat on 11000 gold
      // with nothing left to recruit and nothing built for a fortnight).
      if (threat) {
        const r = chooseRecruit(state, town, {}, false, () => true);
        if (r !== null) return r;
      }
      // The Keystone hall as soon as the Keystone is in town (bead
      // bzc.116), on any day.
      const keystone = keystoneBuild(state, town);
      if (keystone !== null) {
        return { type: "build", townId: town.id, building: keystone };
      }
      // Easy builds every other day (iteration 4: slower growth).
      const choice =
        state.day % this.params.buildEvery === 0
          ? chooseBuild(state, town, turn.plan)
          : { build: null, saving: null };
      if (choice.build !== null) {
        return { type: "build", townId: town.id, building: choice.build };
      }
      if (choice.saving !== null) {
        const trade = tradeFor(state, player, choice.saving);
        if (trade !== null) return trade;
      }
      // Rich (iteration 2): buy what any blocked building lacks, keeping
      // a week's recruiting in the treasury.
      if (choice.blocked !== undefined && !threat) {
        const trade = tradeFor(state, player, choice.blocked, 12000);
        if (trade !== null) return trade;
      }
      // Recruit everything when a hero is here, at the week's end or under
      // threat; otherwise keep back what a key building needs. A hall
      // (income) is kept back for even with a hero in town.
      const hall = choice.saving?.hallIncome !== undefined;
      // Without an army worth the name (the main hero lost it), troops
      // come before any building (iteration 1: a player sat on its gold
      // saving for a hall while its heroes idled with one creature).
      const broke =
        turn.main === undefined ||
        heroPower(turn.main) < 1500 + 150 * state.day;
      const all =
        keep ||
        foe !== undefined ||
        watched !== undefined ||
        ((hero !== undefined || dow >= 6) && (!hall || broke));
      const reserve = all ? {} : reserveFor(choice.saving);
      // The cheapest recruits fill the garrison up to its guard (by value,
      // iteration 4); the rest go to the main hero.
      const lowest = Math.min(
        ...Object.keys(town.dwellings).map((c) => getCreature(c).tier),
      );
      const short = armyFv(town.garrison) < guard;
      const recruit = chooseRecruit(
        state,
        town,
        reserve,
        isMain && !keep,
        (c) => short && getCreature(c).tier === lowest,
      );
      if (recruit !== null) return recruit;
      if (isMain && !keep) {
        const t = this.garrisonToHero(town, hero, guard);
        if (t !== null) {
          this.lastPickup.set(`${player}:${town.id}`, state.day);
          return t;
        }
        // Consolidation (iteration 3): a town short of its guard gets
        // some of the main hero's cheaper troops (towns taken and left
        // empty changed hands back and forth, 4-6 times in one match).
        const have = armyFv(town.garrison);
        if (have < guard * 0.6) {
          const d = this.topUpGuard(town, hero, guard - have, true);
          if (d !== null) return this.dropped(turn, town, d);
        }
      }
      // A secondary hero picks the garrison up to bring it to the main
      // hero (a ferry), when the troops are worth the trip.
      if (
        hero !== undefined &&
        !isMain &&
        !keep &&
        turn.main !== undefined &&
        armyFv(town.garrison) - guard >=
          Math.max(300, armyFv(turn.main.army) * 0.1)
      ) {
        const t = this.garrisonToHero(town, hero, guard);
        if (t !== null) return t;
      }
    }
    return null;
  }

  /**
   * Whether the map still has work for a third or fourth hero (iteration
   * 4): ground left to explore, or neutral stacks left in sight.
   */
  private mapWork(turn: Turn): boolean {
    if (turn.exploredShare < 0.8) return true;
    const w = turn.state.map.width;
    let stacks = 0;
    for (const m of Object.values(turn.state.monsters)) {
      if (turn.explored[m.y * w + m.x] === true) stacks++;
    }
    return stacks >= 6;
  }

  /**
   * The guard a town keeps: its home guard by value (iteration 4) or what
   * rivals roaming near it ask for (guardWant), whichever is more.
   */
  private guardOf(turn: Turn, town: TownState): number {
    const capital = turn.owned.values().next().value === town.id;
    return Math.max(
      homeGuard(turn.state, town, capital) * this.params.guardScale,
      this.guardWant(turn, town),
    );
  }

  /**
   * The guard a town keeps (iteration 3, bead bzc.23): a rival hero seen
   * in the last week within three days' walk makes it want 60% of that
   * hero's power, at most a quarter of the main hero's.
   */
  private guardWant(turn: Turn, town: TownState): number {
    const { state } = turn;
    const main = turn.main;
    const obj = townObject(state, town.id);
    if (main === undefined || obj === undefined) return 0;
    let p = 0;
    for (const [id, seen] of this.seenBy(turn.player)) {
      if (seen.owner === turn.player || state.day - seen.day > 7) continue;
      const foe = state.heroes.find((h) => h.id === id);
      if (foe === undefined || !foe.alive || foe.owner !== seen.owner) continue;
      const walk = (seen.maxMp / 100) * 3 + 2;
      if (chebyshev(seen.x, seen.y, obj.x, obj.y) > walk) continue;
      p = Math.max(p, seen.power);
    }
    // A town other than the capital with a rival's town within three
    // days is on the front: it keeps some guard even when no rival hero
    // has been seen (its old owner wants it back).
    let front = 0;
    if (turn.owned.values().next().value !== town.id) {
      const w = state.map.width;
      const cells = (main.maxMp / 100) * 3;
      for (const t of Object.values(state.towns)) {
        if (t.owner === null || t.owner === turn.player) continue;
        const o = townObject(state, t.id);
        if (o === undefined || turn.explored[o.y * w + o.x] !== true) continue;
        if (chebyshev(o.x, o.y, obj.x, obj.y) <= cells) {
          front = heroPower(main) * 0.15;
          break;
        }
      }
    }
    return Math.max(front, Math.min(heroPower(main) * 0.25, p * 0.6));
  }

  /**
   * Whether a hero of `rival` seen in the last five days stands within
   * about two days' walk of (x, y) with more than `power`.
   */
  private chaser(
    state: GameState,
    player: number,
    rival: number,
    x: number,
    y: number,
    power: number,
  ): boolean {
    for (const [id, seen] of this.seenBy(player)) {
      if (seen.owner !== rival || state.day - seen.day > 5) continue;
      if (seen.power <= power) continue;
      if (chebyshev(seen.x, seen.y, x, y) > (seen.maxMp / 100) * 2 + 2) {
        continue;
      }
      const foe = state.heroes.find((h) => h.id === id);
      if (foe !== undefined && foe.alive && foe.owner === rival) return true;
    }
    return false;
  }

  /** Notes troops left in `town` today (see garrisonToHero). */
  private dropped(turn: Turn, town: TownState, action: GameAction): GameAction {
    this.droppedAt.set(town.id, turn.state.day);
    return action;
  }

  /**
   * Troops from the hero into the garrison toward `need` fight value
   * (iteration 4; was one whole smaller stack): the cheapest creatures
   * first, a whole stack or the part of one that covers the need; the
   * hero keeps at least one creature. With `small`, as for a town's
   * guard on the road, only a need within a third of the army.
   */
  private topUpGuard(
    town: TownState,
    hero: HeroState,
    need: number,
    small = false,
  ): GameAction | null {
    const own = armyFv(hero.army);
    if (small && need > own / 3) return null;
    const creatures = hero.army.reduce((n, s) => n + (s?.count ?? 0), 0);
    let pick = -1;
    let pickKey = Infinity;
    hero.army.forEach((s, i) => {
      if (s === null || slotFor(town.garrison, s.creature) < 0) return;
      const def = getCreature(s.creature);
      const key = def.tier * 10000 + def.fightValue;
      if (key < pickKey) {
        pickKey = key;
        pick = i;
      }
    });
    const s = hero.army[pick];
    if (pick < 0 || s === null || s === undefined) return null;
    const unit = getCreature(s.creature).fightValue;
    const count = Math.min(
      s.count,
      Math.ceil(need / Math.max(1, unit)),
      creatures - 1,
    );
    if (count <= 0) return null;
    return {
      type: "transfer",
      args: {
        heroId: hero.id,
        townId: town.id,
        from: { army: "hero", slot: pick },
        to: { army: "garrison", slot: slotFor(town.garrison, s.creature) },
        count,
      },
    };
  }

  /**
   * One transfer from the garrison into the hero's army, if any fits,
   * leaving at least `keep` fight value (the town's guard) behind
   * (iteration 4: by value; the highest tiers go first, and the part of a
   * stack above the guard when the whole stack would breach it).
   */
  private garrisonToHero(
    town: TownState,
    hero: HeroState,
    keep = 0,
  ): GameAction | null {
    // Never take back what a hero left here today (no back and forth).
    if (this.droppedAt.get(town.id) === this.day) return null;
    const g = town.garrison;
    const total = armyFv(g);
    if (total <= keep) return null;
    const order = g
      .map((s, i) => ({ s, i }))
      .filter((x) => x.s !== null)
      .sort((a, b) => {
        const da = getCreature(a.s?.creature ?? "");
        const db = getCreature(b.s?.creature ?? "");
        return db.tier - da.tier || db.fightValue - da.fightValue;
      });
    const heroFv = armyFv(hero.army);
    for (const { s, i } of order) {
      if (s === null) continue;
      const to = slotFor(hero.army, s.creature);
      if (to < 0) continue;
      const unit = getCreature(s.creature).fightValue;
      let count = s.count;
      if (total - unit * s.count < keep) {
        count = Math.floor((total - keep) / Math.max(1, unit));
        // Only a part worth the transfer.
        if (count <= 0 || count * unit < Math.max(150, heroFv * 0.03)) {
          continue;
        }
      }
      return {
        type: "transfer",
        args: {
          heroId: hero.id,
          townId: town.id,
          from: { army: "garrison", slot: i },
          to: { army: "hero", slot: to },
          ...(count < s.count ? { count } : {}),
        },
      };
    }
    // Army full: swap the weakest hero stack for a much stronger one.
    let weak = -1;
    let weakFv = Infinity;
    hero.army.forEach((s, i) => {
      if (s === null) return;
      const fv = stackFv(s.creature, s.count);
      if (fv < weakFv) {
        weakFv = fv;
        weak = i;
      }
    });
    let strong = -1;
    let strongFv = 0;
    g.forEach((s, i) => {
      if (s === null) return;
      const fv = stackFv(s.creature, s.count);
      if (total - fv + weakFv < keep) return;
      if (fv > strongFv) {
        strongFv = fv;
        strong = i;
      }
    });
    if (weak >= 0 && strong >= 0 && strongFv > weakFv * 2) {
      return {
        type: "transfer",
        args: {
          heroId: hero.id,
          townId: town.id,
          from: { army: "garrison", slot: strong },
          to: { army: "hero", slot: weak },
        },
      };
    }
    return null;
  }

  // ---------------------------------------------------------------- ferry

  /**
   * Stacks a secondary hero can hand the main hero: [from slot, to slot,
   * count] in order; the secondary keeps one creature.
   */
  private handOffs(
    from: ArmySlots,
    to: ArmySlots,
  ): Array<{ from: number; to: number; count: number; fv: number }> {
    const dst = to.map((s) => (s === null ? null : { ...s }));
    const out: Array<{ from: number; to: number; count: number; fv: number }> =
      [];
    const stacks = from
      .map((s, i) => ({ s, i }))
      .filter((x) => x.s !== null)
      .sort(
        (a, b) =>
          stackFv(b.s?.creature ?? "", b.s?.count ?? 0) -
          stackFv(a.s?.creature ?? "", a.s?.count ?? 0),
      );
    let left = stacks.reduce((n, x) => n + (x.s?.count ?? 0), 0);
    for (const { s, i } of stacks) {
      if (s === null) continue;
      const slot = slotFor(dst, s.creature);
      if (slot < 0) continue;
      let count = s.count;
      if (left - count < 1) count -= 1;
      if (count <= 0) continue;
      left -= count;
      const cur = dst[slot];
      dst[slot] = { creature: s.creature, count: (cur?.count ?? 0) + count };
      out.push({ from: i, to: slot, count, fv: stackFv(s.creature, count) });
    }
    return out;
  }

  private ferry(turn: Turn): GameAction | null {
    const main = turn.main;
    if (main === undefined) return null;
    for (const hero of turn.heroes) {
      if (hero === main) continue;
      if (Math.max(Math.abs(hero.x - main.x), Math.abs(hero.y - main.y)) !== 1)
        continue;
      const first = this.handOffs(hero.army, main.army)[0];
      if (first === undefined) continue;
      return {
        type: "transfer",
        args: {
          heroId: hero.id,
          otherHeroId: main.id,
          from: { army: "hero", slot: first.from },
          to: { army: "other", slot: first.to },
          count: first.count,
        },
      };
    }
    return null;
  }

  /**
   * Debugging aid (match runner --explain): each hero's best targets now,
   * and the fights it turned down with their estimates.
   */
  explain(state: GameState, player: number): string[] {
    const turn = this.turnOf(state, player);
    const lines: string[] = [];
    for (const hero of turn.heroes) {
      lines.push(
        `${hero.id} at ${hero.x},${hero.y} mp ${hero.mp}/${hero.maxMp} power ${Math.round(heroPower(hero))}${hero === turn.main ? " (main)" : ""}`,
      );
      const rejected: string[] = [];
      const targets = this.targets(turn, hero, new Set(), rejected);
      const { cost: reach, ctx } = this.reachOf(turn, hero);
      lines.push(`  reachable cells ${reach.size}, targets ${targets.length}`);
      // Why the reachable area ends: passable cells next to it.
      const w = state.map.width;
      const edge = new Map<string, number>();
      for (const i of reach.keys()) {
        const x = i % w;
        const y = (i - x) / w;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (!inBounds(state.map, nx, ny)) continue;
            const j = ny * w + nx;
            if (reach.has(j)) continue;
            const cell = state.map.cells[j];
            if (cell === undefined || !isPassable(cell)) continue;
            const why = ctx.objectBlocked.has(j)
              ? "object"
              : ctx.monsterAt.has(j)
                ? `monster ${ctx.monsterAt.get(j)}`
                : turn.explored[j] !== true
                  ? "fog"
                  : ctx.guards.has(i)
                    ? "from a zone"
                    : "other";
            edge.set(why, (edge.get(why) ?? 0) + 1);
          }
        }
      }
      lines.push(
        `  edge: ${[...edge].map(([k, v]) => `${k} ${v}`).join(", ")}`,
      );
      for (const t of targets.slice(0, 8)) {
        lines.push(
          `  ${t.key} value ${Math.round(t.value)} cost ${t.cost} score ${Math.round(t.score)}${t.fight ? ` loss ${t.fight.lossShare.toFixed(2)}` : ""}`,
        );
      }
      for (const r of rejected.slice(0, 12)) lines.push(`  x ${r}`);
    }
    return lines;
  }

  // ------------------------------------------------------------- movement

  /**
   * Whether the main hero should gather its reserves (iteration 2): a
   * rival hero or garrisoned town within three days is too strong for it
   * alone, but not with what the secondaries carry.
   */
  private wantsReserves(turn: Turn): boolean {
    const main = turn.main;
    if (main === undefined || turn.heroes.length < 2) return false;
    const power = heroPower(main);
    let reserve = 0;
    for (const h of turn.heroes) {
      if (h === main) continue;
      reserve += this.handOffs(h.army, main.army).reduce((n, x) => n + x.fv, 0);
    }
    reserve *= heroStatsFactor(main);
    if (reserve < power * 0.15) return false;
    const { state } = turn;
    const w = state.map.width;
    const { cost } = this.reachOf(turn, main);
    const within = (x: number, y: number): boolean => {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const c = cost.get((y + dy) * w + x + dx);
          if (c !== undefined && c <= main.mp + 2 * main.maxMp) return true;
        }
      }
      return false;
    };
    const tips = (theirs: number, owner: number): boolean => {
      const edge = this.edgeAgainst(turn, owner, 1.3) * 1.15;
      return power < theirs * edge && power + reserve >= theirs * edge;
    };
    for (const foe of turn.enemies) {
      if (this.holding(turn, foe.owner)) continue;
      if (within(foe.x, foe.y) && tips(heroPower(foe), foe.owner)) return true;
    }
    for (const t of Object.values(state.towns)) {
      if (t.owner === turn.player) continue;
      const o = townObject(state, t.id);
      if (o === undefined || turn.explored[o.y * w + o.x] !== true) continue;
      const g = armyFv(t.garrison) * 1.15;
      if (g <= 0 || !within(o.x, o.y)) continue;
      // A neutral town's big garrison too (iteration 3: towns with 70-110
      // creatures were left for weeks).
      if (t.owner === null) {
        if (power < g * 1.4 && power + reserve >= g * 1.4) return true;
        continue;
      }
      if (this.holding(turn, t.owner)) continue;
      if (tips(g, t.owner)) return true;
    }
    return false;
  }

  private movement(turn: Turn): GameAction | null {
    const claimed = new Set<string>();
    for (const hero of turn.heroes) {
      if (hero.mp <= 0) continue;
      // Back to the town it guards before the day ends (iteration 4).
      const back = this.homeward(turn, hero);
      if (back !== undefined) {
        if (back !== null) return back;
        continue;
      }
      // On a Dowse mark: wait for tomorrow's full movement to dig.
      if (this.onMark(turn, hero)) continue;
      // A weak hero in a threatened town stays to defend it, and a hero
      // whose presence alone holds its town stays, unless it goes out to
      // beat a rival hero (iteration 3: a hero took a town, walked on,
      // and the rival next to it walked in the same day). Iteration 4:
      // both still run errands they come back from today (no rival moves
      // during our turn): such heroes idled for weeks.
      const town = turn.towns.find((t) => heroInTownOf(turn.state, t) === hero);
      const threatened = town !== undefined && turn.threatened.has(town.id);
      const held = town !== undefined && turn.held.has(town.id);
      let targets = this.targets(turn, hero, claimed);
      const roundTrip = (t: Target): boolean =>
        t.cost * 2.2 <= hero.mp &&
        !t.key.startsWith("home:") &&
        !t.key.startsWith("meet:") &&
        (t.battle === undefined || t.battle.kind !== "town");
      if (threatened) {
        targets = targets.filter((t) => roundTrip(t));
      } else if (held) {
        targets = targets.filter(
          (t) => t.key.startsWith("hero:") || roundTrip(t),
        );
      }
      const anchored = threatened || held;
      const tow = this.towLine(turn, hero, targets[0]);
      if (tow !== null) return tow;
      const road = this.greenRoad(turn, hero, claimed, targets[0]);
      if (road !== null) return road;
      let resting = false;
      let partial: GameAction | null = null;
      for (const t of targets) {
        if (t.parley !== undefined && hero.x === t.x && hero.y === t.y) {
          claimed.add(t.key);
          this.goals.set(hero.id, t.key);
          return {
            type: "cast",
            heroId: hero.id,
            spell: "parley",
            target: { monsterId: t.parley },
          };
        }
        if (this.handOver(turn, hero, t)) continue;
        const steps = this.pathTo(turn, hero, t);
        if (steps === null) continue;
        const first = steps[0];
        if (first === undefined) continue;
        const today = steps.filter((s) => s.day === 0);
        // Do not end the day where a stronger enemy hero can strike
        // (unless that enemy is the target).
        const end = [...today].reverse().find(standsOn);
        const endCell =
          end === undefined
            ? hero.y * turn.state.map.width + hero.x
            : end.y * turn.state.map.width + end.x;
        const trip = anchored && !t.key.startsWith("hero:");
        if (trip && (first.day > 0 || today.length < steps.length)) continue;
        if (
          !t.key.startsWith("hero:") &&
          !trip &&
          !this.safe(turn, hero, endCell)
        ) {
          // Iteration 3: walk as far as is safe toward it instead of
          // idling (a secondary sat in town for days while a rival hero
          // could reach every target's end of day).
          const part = this.safePart(turn, hero, today);
          if (part !== null && partial === null) partial = part;
          continue;
        }
        claimed.add(t.key);
        if (first.day > 0 || first.cost > hero.mp) {
          // Out of movement for this target today: try a spell, else rest.
          const spell = this.borrowedDay(turn, hero, steps);
          if (spell !== null) return spell;
          resting = true;
          break;
        }
        this.goals.set(hero.id, t.key);
        if (trip && town !== undefined) {
          const o = townObject(turn.state, town.id);
          if (o !== undefined) {
            this.anchors.set(hero.id, { day: turn.state.day, x: o.x, y: o.y });
          }
        }
        const rival = this.rivalOf(turn.state, t);
        if (rival !== null && today.length === steps.length) {
          this.noteAttack(turn.player, rival, turn.state.day);
        }
        // Opening Salvo reaches 2 cells (bzc.39): cast it before the
        // fight, stopping 2 cells short first when the walk would step
        // into the stack's zone (which starts the fight at once).
        const attack = today.find((s) => s.attack);
        if (attack !== undefined && this.salvoWanted(turn, hero, t)) {
          const into = today.indexOf(attack) - 1;
          const zone = into >= 0 ? (today[into]?.total ?? 0) : 0;
          // Keep enough movement to walk into the attack afterwards.
          if (hero.mp >= 250 + zone) {
            if (inMonsterSpellRange(hero, t.x, t.y)) {
              return this.openingSalvo(hero, t);
            }
            const stop = today.findIndex(
              (s) => standsOn(s) && chebyshev(s.x, s.y, t.x, t.y) === 2,
            );
            if (stop >= 0) {
              return {
                type: "move",
                heroId: hero.id,
                path: today.slice(0, stop + 1).map((s) => ({ x: s.x, y: s.y })),
              };
            }
          }
        }
        // The walk ends reaching for a pickup (the target, or one in the
        // way): a second reach the same day means it cannot be taken.
        const ending = today[today.length - 1];
        const reachId =
          ending?.pickup === true
            ? this.reachOf(turn, hero).ctx.pickupAt.get(
                ending.y * turn.state.map.width + ending.x,
              )
            : undefined;
        if (reachId !== undefined && !this.firstReach(turn, hero, reachId)) {
          continue;
        }
        const grab = this.grabOnTheWay(turn, hero, today, t);
        if (grab !== null) return grab;
        return {
          type: "move",
          heroId: hero.id,
          path: today.map((s) => ({ x: s.x, y: s.y })),
        };
      }
      // Standing where a stronger enemy can strike: go somewhere safe.
      const here = hero.y * turn.state.map.width + hero.x;
      if (!resting && !this.safe(turn, hero, here)) {
        const flee = this.retreat(turn, hero);
        if (flee !== null) return flee;
      }
      if (!resting && partial !== null) return partial;
      // Iteration 4: nothing to do, not holding a town: a safe errand.
      if (!resting && (town === undefined || !turn.held.has(town.id))) {
        const job = this.errand(turn, hero, town);
        if (job !== null) return job;
      }
    }
    return null;
  }

  /**
   * The walk back to the town a hero left on a round trip today (iteration
   * 4): undefined when it has none (or stands in it), null when it cannot
   * get back today (it then stays where it is).
   */
  private homeward(turn: Turn, hero: HeroState): GameAction | null | undefined {
    const a = this.anchors.get(hero.id);
    if (a === undefined) return undefined;
    if (a.day !== turn.state.day || (hero.x === a.x && hero.y === a.y)) {
      this.anchors.delete(hero.id);
      return undefined;
    }
    const w = turn.state.map.width;
    const steps = pathIn(this.reachOf(turn, hero), hero, a.y * w + a.x);
    const today = (steps ?? []).filter((x) => x.day === 0);
    if (steps === null || today.length === 0 || today.length < steps.length) {
      this.anchors.delete(hero.id);
      return null;
    }
    return {
      type: "move",
      heroId: hero.id,
      path: today.map((x) => ({ x: x.x, y: x.y })),
    };
  }

  /**
   * A safe errand for a hero with nothing better to do (iteration 4, bead
   * bzc.41: idle hero-days were 10-20%, heroes parked in towns while a
   * rival hovered). The main hero collects the troops its towns let go;
   * a secondary brings what it carries to the main hero or fetches troops
   * a town lets go. Only a walk whose end today is safe; not back to a
   * town the hero left in the last two days.
   */
  private errand(
    turn: Turn,
    hero: HeroState,
    inTown: TownState | undefined,
  ): GameAction | null {
    const { state } = turn;
    const w = state.map.width;
    const reach = this.reachOf(turn, hero);
    let best: { cell: number; score: number } | null = null;
    const consider = (cell: number, value: number): void => {
      const cost = reach.cost.get(cell);
      if (cost === undefined || cost === 0 || value <= 0) return;
      if (reach.ctx.guards.has(cell)) return;
      const score = value / (cost / Math.max(1, hero.maxMp) + DAY_OFFSET);
      if (best === null || score > best.score) best = { cell, score };
    };
    const main = turn.main;
    for (const town of turn.towns) {
      if (town === inTown || heroInTownOf(state, town) !== undefined) continue;
      const o = townObject(state, town.id);
      if (o === undefined || this.wasAt(hero, o.x, o.y, state.day, 2)) continue;
      const keeps =
        turn.threatened.has(town.id) ||
        turn.alert.has(town.id) ||
        turn.watch.has(town.id);
      if (keeps) continue;
      const free = this.troopsAt(state, town) - this.guardOf(turn, town);
      // A secondary fetches only for a main hero away from that town.
      if (
        hero !== main &&
        (main === undefined || chebyshev(main.x, main.y, o.x, o.y) <= 6)
      ) {
        continue;
      }
      consider(o.y * w + o.x, free);
    }
    if (hero !== main && main !== undefined) {
      const carried = this.handOffs(hero.army, main.army).reduce(
        (n, h) => n + h.fv,
        0,
      );
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const x = main.x + dx;
          const y = main.y + dy;
          if (!inBounds(state.map, x, y)) continue;
          if (cutsCorner(reach.ctx, x, y, main.x, main.y)) continue;
          consider(y * w + x, carried);
        }
      }
    }
    const pick = best as { cell: number; score: number } | null;
    if (pick === null) return null;
    const steps = pathIn(reach, hero, pick.cell);
    const today = (steps ?? []).filter((x) => x.day === 0 && standsOn(x));
    const end = today[today.length - 1];
    if (end === undefined) return null;
    if (!this.safe(turn, hero, end.y * w + end.x)) return null;
    return {
      type: "move",
      heroId: hero.id,
      path: today.map((x) => ({ x: x.x, y: x.y })),
    };
  }

  /**
   * Whether the main hero leaves a far target to a secondary much nearer
   * to it and strong enough for it (iteration 3: a main hero walked four
   * days to a stack its secondary stood next to, with the army to beat it
   * three times over). Not for fights with players.
   */
  private handOver(turn: Turn, hero: HeroState, t: Target): boolean {
    if (hero !== turn.main || t.cost <= hero.maxMp) return false;
    const b = t.battle;
    if (b !== undefined && b.kind !== "monster") return false;
    const m = b === undefined ? undefined : turn.state.monsters[b.objectId];
    const need = m === undefined ? 0 : stackFv(m.creature, m.count) * 3.5;
    const w = turn.state.map.width;
    const cell = t.via === undefined ? t.y * w + t.x : t.via.y * w + t.via.x;
    for (const h of turn.heroes) {
      if (h === hero || heroPower(h) < need) continue;
      const c = this.reachOf(turn, h).cost.get(cell);
      if (c !== undefined && c * 2.5 < t.cost && c <= h.mp + h.maxMp) {
        return true;
      }
    }
    return false;
  }

  /**
   * The longest safe beginning of today's walk (at least three cells,
   * ending outside every zone and away from towns' doors), or null. Only
   * where no visible enemy hero stronger than this one stands within
   * about two days: creeping to the edge of a strong rival's reach would
   * only make the hero turn back tomorrow.
   */
  private safePart(
    turn: Turn,
    hero: HeroState,
    today: readonly PathStep[],
  ): GameAction | null {
    const w = turn.state.map.width;
    const { ctx } = this.reachOf(turn, hero);
    const mine = heroPower(hero);
    const strong = turn.enemies.filter((f) => heroPower(f) > mine * 0.9);
    for (let i = today.length - 2; i >= 2; i--) {
      const s = today[i];
      if (s === undefined || !standsOn(s)) continue;
      const cell = s.y * w + s.x;
      if (ctx.guards.has(cell) || ctx.stops.has(cell)) continue;
      if (!this.safe(turn, hero, cell)) continue;
      if (
        strong.some(
          (f) => chebyshev(f.x, f.y, s.x, s.y) <= (f.maxMp / 100) * 2 + 2,
        )
      ) {
        continue;
      }
      return {
        type: "move",
        heroId: hero.id,
        path: today.slice(0, i + 1).map((x) => ({ x: x.x, y: x.y })),
      };
    }
    return null;
  }

  /** Whether the hero may end its day on `cell`. */
  private safe(turn: Turn, hero: HeroState, cell: number): boolean {
    const w = turn.state.map.width;
    const threat = turn.danger.get(cell) ?? 0;
    if (threat <= 0) return true;
    let power = heroPower(hero);
    for (const town of turn.towns) {
      const obj = townObject(turn.state, town.id);
      if (obj !== undefined && obj.y * w + obj.x === cell) {
        power += armyFv(town.garrison) + heroPower(hero) * 0.2;
      }
    }
    if (threat < power * 0.9) return true;
    // Escorted (iteration 4): next to an own hero clearly stronger than
    // the threat, whoever strikes here is struck back at once (scouts
    // boxed in by rival heroes idled for weeks rather than join the main
    // hero).
    const x = cell % w;
    const y = (cell - x) / w;
    return turn.heroes.some(
      (h) =>
        h !== hero &&
        chebyshev(h.x, h.y, x, y) <= 1 &&
        heroPower(h) >= threat * 1.2,
    );
  }

  /** A move to the nearest safe cell reachable today (own towns first). */
  private retreat(turn: Turn, hero: HeroState): GameAction | null {
    const reach = this.reachOf(turn, hero);
    const w = turn.state.map.width;
    const towns = new Set(
      turn.towns.flatMap((t) => {
        const o = townObject(turn.state, t.id);
        return o === undefined ? [] : [o.y * w + o.x];
      }),
    );
    let best: number | null = null;
    let bestKey = Infinity;
    for (const [cell, cost] of reach.cost) {
      if (cost === 0 || cost > hero.mp) continue;
      if (reach.ctx.guards.has(cell) || !this.safe(turn, hero, cell)) continue;
      const key = (towns.has(cell) ? 0 : 100000) + cost;
      if (key < bestKey) {
        bestKey = key;
        best = cell;
      }
    }
    if (best === null) return null;
    const steps = pathIn(reach, hero, best);
    if (steps === null || steps.length === 0) return null;
    return {
      type: "move",
      heroId: hero.id,
      path: steps.map((s) => ({ x: s.x, y: s.y })),
    };
  }

  /**
   * A pickup worth having beside today's walk (bead bzc.49): taking one
   * costs no movement, so the walk stops at the first cell beside it and
   * reaches for it; the next decide walks on. (Before pickups blocked their
   * cell, a walk over one took it on the way.) Null when there is none.
   */
  private grabOnTheWay(
    turn: Turn,
    hero: HeroState,
    today: readonly PathStep[],
    target: Target,
  ): GameAction | null {
    const { state } = turn;
    const w = state.map.width;
    const { ctx } = this.reachOf(turn, hero);
    if (ctx.pickupAt.size === 0) return null;
    for (let i = 0; i < today.length; i++) {
      const s = today[i];
      if (s === undefined || !standsOn(s)) break;
      const cell = s.y * w + s.x;
      if (ctx.guards.has(cell) || ctx.stops.has(cell)) break;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const px = s.x + dx;
          const py = s.y + dy;
          if (!inBounds(state.map, px, py)) continue;
          const p = py * w + px;
          const id = ctx.pickupAt.get(p);
          if (id === undefined || ctx.guards.has(p)) continue;
          if (target.x === px && target.y === py) continue;
          if (cutsCorner(ctx, s.x, s.y, px, py)) continue;
          const obj = state.map.objects.find((o) => o.id === id);
          if (obj === undefined || siteGuard(state, obj)) continue;
          if (this.objectValue(turn, hero, obj, 1) <= 0) continue;
          if (!this.firstReach(turn, hero, id)) continue;
          return {
            type: "move",
            heroId: hero.id,
            path: [
              ...today.slice(0, i + 1).map((x) => ({ x: x.x, y: x.y })),
              { x: px, y: py },
            ],
          };
        }
      }
    }
    return null;
  }

  /**
   * Notes that the hero reaches for a pickup today; false (and the pickup
   * is futile for a week) when it already did and the pickup is still
   * there: taking it gave nothing.
   */
  private firstReach(turn: Turn, hero: HeroState, objectId: string): boolean {
    const key = `${turn.state.day}:${hero.id}:${objectId}`;
    if (this.reached.has(key)) {
      this.markFutile(turn.player, objectId, turn.state.day, 7);
      return false;
    }
    this.reached.add(key);
    return true;
  }

  /**
   * The cheapest cell next to a pickup at (x, y) the hero can take it from
   * (bead bzc.49): reached, outside every zone of control, not cutting a
   * corner, and not an entrance that would stop the walk (unless the hero
   * stands there already).
   */
  private pickupSpot(
    reach: Reach,
    x: number,
    y: number,
  ): { cost: number; via: { x: number; y: number } } | undefined {
    const { ctx } = reach;
    const w = ctx.map.width;
    let best: { cost: number; via: { x: number; y: number } } | undefined;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const vx = x + dx;
        const vy = y + dy;
        if (!inBounds(ctx.map, vx, vy)) continue;
        const i = vy * w + vx;
        const c = reach.cost.get(i);
        if (c === undefined) continue;
        if (i !== reach.start) {
          if (ctx.guards.has(i) || ctx.stops.has(i)) continue;
          // A waystone carries the hero away before it could take it.
          if (reach.jumps.has(i)) continue;
        }
        if (cutsCorner(ctx, vx, vy, x, y)) continue;
        if (best === undefined || c < best.cost) {
          best = { cost: c, via: { x: vx, y: vy } };
        }
      }
    }
    return best;
  }

  /**
   * The path to a target; an attack goes through its chosen neighbour
   * cell (so no other stack's zone is crossed) and ends on the target, and
   * so does a pickup (taken from that cell, bead bzc.49).
   */
  private pathTo(turn: Turn, hero: HeroState, t: Target): PathStep[] | null {
    const reach = this.reachOf(turn, hero);
    const w = turn.state.map.width;
    if (t.via === undefined) return pathIn(reach, hero, t.y * w + t.x);
    let steps: PathStep[] = [];
    if (hero.x !== t.via.x || hero.y !== t.via.y) {
      const p = pathIn(reach, hero, t.via.y * w + t.via.x);
      if (p === null) return null;
      steps = p;
      // Through a waystone (iteration 3): the walk ends on it.
      const end = p[p.length - 1];
      if (end !== undefined && (end.x !== t.via.x || end.y !== t.via.y)) {
        return steps;
      }
    }
    const last = steps[steps.length - 1];
    return [
      ...steps,
      {
        x: t.x,
        y: t.y,
        cost: 0,
        total: last?.total ?? 0,
        day: last?.day ?? 0,
        ...(t.pickup === true
          ? { attack: false, pickup: true }
          : { attack: true }),
      },
    ];
  }

  /**
   * Tow Line (bead bzc.32) from the pylon the hero stands on to another
   * marked pylon, when that pylon lies so much nearer the best target
   * that the trip saves more than a day even after spending today's
   * movement on the spell.
   */
  private towLine(
    turn: Turn,
    hero: HeroState,
    best: Target | undefined,
  ): GameAction | null {
    const spell = "tow-line";
    if (best === undefined || !hero.pages.includes(spell)) return null;
    if (hero.mp < 300) return null;
    if (adventureCastError(turn.state, hero, spell) !== null) return null;
    let pick: { id: string; left: number } | null = null;
    for (const stop of towLineStops(turn.state, hero)) {
      // About 120 movement a cell from the far pylon.
      const left = chebyshev(stop.x, stop.y, best.x, best.y) * 120;
      if (pick === null || left < pick.left) pick = { id: stop.id, left };
    }
    if (pick === null) return null;
    if (best.cost - hero.mp < pick.left + hero.maxMp) return null;
    return {
      type: "cast",
      heroId: hero.id,
      spell,
      target: { objectId: pick.id },
    };
  }

  /** Borrowed Day when the rest of today's path needs at most its gain. */
  private borrowedDay(
    turn: Turn,
    hero: HeroState,
    steps: ReadonlyArray<{ cost: number; total: number; day: number }>,
  ): GameAction | null {
    const spell = "borrowed-day";
    if (!hero.pages.includes(spell)) return null;
    if (adventureCastError(turn.state, hero, spell) !== null) return null;
    const total = steps[steps.length - 1]?.total ?? 0;
    // Its gain is at least 300: cast when that reaches the target today.
    if (total <= hero.mp || total - hero.mp > 300) return null;
    return { type: "cast", heroId: hero.id, spell };
  }

  /** The hero's reach this decide call (computed once). */
  private reachOf(turn: Turn, hero: HeroState): Reach {
    let r = turn.reach.get(hero.id);
    if (r === undefined) {
      r = reachFor(
        turn.state,
        hero,
        hero.mp + this.horizon * hero.maxMp,
        this.pointlessStops(turn, hero),
      );
      turn.reach.set(hero.id, r);
    }
    return r;
  }

  /**
   * Entrances whose visit would stop this hero's walk for nothing
   * (iteration 4, bead bzc.41: a main hero stopped at a Wishing Well it
   * was already blessed by on three days running): dwellings, sites and
   * banks worth nothing to it now. Routes go beside them (reach.ts).
   */
  private pointlessStops(turn: Turn, hero: HeroState): Set<number> {
    const { state } = turn;
    const w = state.map.width;
    const out = new Set<number>();
    for (const obj of state.map.objects) {
      if (
        obj.kind !== "dwelling" &&
        obj.kind !== "site" &&
        obj.kind !== "bank"
      ) {
        continue;
      }
      if (state.collected.includes(obj.id)) continue;
      // A tent's value needs the reach being built: never pointless.
      if (objectTypeOf(obj) === "keymasters-tent") continue;
      if (this.objectValue(turn, hero, obj, 1) > 0) continue;
      if ((this.questLeadsOf(turn).get(obj.id) ?? 0) > 0) continue;
      out.add(obj.y * w + obj.x);
    }
    return out;
  }

  /** questLeads, once per decide call. */
  private questLeadsOf(turn: Turn): Map<string, number> {
    if (turn.leads === undefined) turn.leads = this.questLeads(turn);
    return turn.leads;
  }

  /** The hero's targets, best first (fights estimated, losers dropped). */
  private targets(
    turn: Turn,
    hero: HeroState,
    claimed: Set<string>,
    rejected?: string[],
  ): Target[] {
    const { state } = turn;
    const w = state.map.width;
    const reach = this.reachOf(turn, hero);
    const { cost: dist, ctx } = reach;
    const isMain = hero === turn.main;
    const maxMp = Math.max(1, hero.maxMp);
    const out: Target[] = [];
    const goal = this.goals.get(hero.id);
    const tether = this.tether(turn, hero);
    const add = (t: Omit<Target, "score" | "bound">): void => {
      if (claimed.has(t.key) || t.value <= 0) return;
      const days = t.cost / maxMp + DAY_OFFSET;
      // Early on the main hero stays within reach of home (see tether).
      const far =
        tether !== null &&
        !t.key.startsWith("home:") &&
        chebyshev(t.x, t.y, tether.x, tether.y) > tether.cells;
      const bonus = (t.key === goal ? GOAL_BONUS : 1) * (far ? 0.35 : 1);
      const bound = (t.value / days) * bonus;
      out.push({ ...t, bound, score: t.battle === undefined ? bound : -1 });
    };
    // Whether standing on cell i starts a fight with a stack other than
    // `except` (its zone of control).
    const guarded = (i: number, except?: string): boolean =>
      (ctx.guards.get(i) ?? []).some((g) => g !== except);
    // The cheapest cell next to (x, y) the hero can stand on without a
    // fight other than with `except`.
    // With `chain`, a cell in other stacks' zones will do (fewest first):
    // they attack after the target (a chained fight), listed in `others`.
    const nextTo = (
      x: number,
      y: number,
      except?: string,
      chain = false,
    ):
      | { cost: number; via: { x: number; y: number }; others: string[] }
      | undefined => {
      let best:
        | { cost: number; via: { x: number; y: number }; others: string[] }
        | undefined;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const vx = x + dx;
          const vy = y + dy;
          if (!inBounds(state.map, vx, vy)) continue;
          const i = vy * w + vx;
          const c = dist.get(i);
          if (c === undefined) continue;
          const others = (ctx.guards.get(i) ?? []).filter((g) => g !== except);
          if (others.length > 0 && !chain) continue;
          if (cutsCorner(ctx, vx, vy, x, y)) continue;
          if (
            best === undefined ||
            others.length < best.others.length ||
            (others.length === best.others.length && c < best.cost)
          ) {
            best = { cost: c, via: { x: vx, y: vy }, others };
          }
        }
      }
      return best;
    };
    // The cheapest cell within MONSTER_SPELL_RANGE of (x, y) from which
    // Parley or Opening Salvo reaches the stack (bzc.39): where the hero
    // stands, or a cell outside every zone of control.
    const castSpot = (
      x: number,
      y: number,
    ): { cost: number; x: number; y: number } | undefined => {
      let best: { cost: number; x: number; y: number } | undefined;
      const r = MONSTER_SPELL_RANGE;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx === 0 && dy === 0) continue;
          const vx = x + dx;
          const vy = y + dy;
          if (!inBounds(state.map, vx, vy)) continue;
          const c = dist.get(vy * w + vx);
          if (c === undefined) continue;
          if (c > 0 && guarded(vy * w + vx)) continue;
          if (best === undefined || c < best.cost) {
            best = { cost: c, x: vx, y: vy };
          }
        }
      }
      return best;
    };
    const explore = this.exploreWeight(turn);
    const leads = this.questLeadsOf(turn);
    const bonusOf = new Map<string, number>();
    // --- Objects.
    for (const obj of state.map.objects) {
      if (obj.kind === "monster" || obj.kind === "hero-start") continue;
      if (obj.kind === "buried" || obj.kind === "gate") continue;
      const i = obj.y * w + obj.x;
      if (turn.explored[i] !== true) continue;
      const lead = leads.get(obj.id) ?? 0;
      const value = this.objectValue(turn, hero, obj, explore) + lead;
      if (value <= 0) continue;
      if (ctx.pickupAt.has(i) && !ctx.guards.has(i)) {
        // A pickup (bead bzc.49) is taken from a next cell outside every
        // zone of control; with none, the stacks around it carry its value.
        // One in a zone is fought for first: its guards carry its value
        // (below), as for an entrance.
        const near = this.pickupSpot(reach, obj.x, obj.y);
        if (near !== undefined) {
          add({
            key: `obj:${obj.id}`,
            x: obj.x,
            y: obj.y,
            cost: near.cost,
            via: near.via,
            pickup: true,
            value,
            ...(siteGuard(state, obj)
              ? {
                  battle: { kind: "site", objectId: obj.id, heroId: hero.id },
                  maxLoss: isMain ? 0.3 : 0.12,
                }
              : {}),
          });
          continue;
        }
        // Every cell beside it lies in a zone: those stacks guard it.
        const around = new Set<string>();
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!inBounds(state.map, obj.x + dx, obj.y + dy)) continue;
            const j = (obj.y + dy) * w + obj.x + dx;
            if (!dist.has(j)) continue;
            for (const g of ctx.guards.get(j) ?? []) around.add(g);
          }
        }
        for (const g of around) {
          bonusOf.set(g, (bonusOf.get(g) ?? 0) + value / around.size);
        }
        continue;
      }
      const guards = ctx.guards.get(i);
      if (guards !== undefined && guards.length > 0) {
        // Behind a stack: the stack's fight carries the value.
        for (const g of guards) {
          bonusOf.set(g, (bonusOf.get(g) ?? 0) + value / guards.length);
        }
        continue;
      }
      if (obj.kind === "town") {
        const town = state.towns[obj.id];
        if (town === undefined) continue;
        const foe = state.heroes.find(
          (h) =>
            h.alive &&
            h.x === obj.x &&
            h.y === obj.y &&
            h.owner !== turn.player,
        );
        if (foe !== undefined) continue; // an enemy hero target
        const cost = dist.get(i);
        if (cost === undefined || cost === 0) continue;
        const garrison = armyFv(town.garrison) > 0;
        const enemy = town.owner !== null;
        // Without a town the player is out in a week: any town will do,
        // at almost any cost. A town it lost is worth retaking.
        const townless = turn.towns.length === 0;
        const lost = enemy && this.worthRetaking(turn, obj.id) ? 6000 : 0;
        // The difficulty's first day of attacks on players (iteration
        // 3): no week-one raids on Normal; a town that was ours, or any
        // town for a townless player, is always fair game.
        if (
          enemy &&
          lost === 0 &&
          !townless &&
          state.day < this.params.aggressionDay
        ) {
          continue;
        }
        // A rival's town in a stalled war is worth less (iteration 2):
        // armies fed into a stalemate are the third player's gain.
        const rival = town.owner;
        // The war plan (iteration 4): towns of a rival we only hold
        // against are left alone (they flipped back and forth).
        if (
          rival !== null &&
          lost === 0 &&
          !townless &&
          this.holding(turn, rival)
        ) {
          continue;
        }
        // A town its owner's hero would take straight back is barely worth
        // taking (iteration 3: towns changed hands every few days, 28
        // times in one match): a hero of the owner seen in the last days
        // within two days' walk and stronger than most of ours.
        const chased =
          rival !== null &&
          lost === 0 &&
          !turn.finishing.has(rival) &&
          this.chaser(
            state,
            turn.player,
            rival,
            obj.x,
            obj.y,
            heroPower(hero) * CHASE_SHARE,
          );
        // Iteration 4: such a town is left alone (it was worth 35%, and
        // still taken and lost again within days: 4-6 flips a match).
        if (chased && !townless) continue;
        const cool =
          rival !== null && turn.stalled.has(rival) && lost === 0 ? 0.6 : 1;
        const edge =
          rival === null || townless || lost > 0
            ? 1.2
            : this.edgeAgainst(turn, rival, 1.2);
        // A weakened rival's last towns finish it (iteration 3).
        const finish = rival !== null && turn.finishing.has(rival) ? 12000 : 0;
        add({
          key: `obj:${obj.id}`,
          x: obj.x,
          y: obj.y,
          cost,
          // A town is income, dwellings and a guild for the rest of the
          // game; an enemy's also cripples the enemy.
          value:
            (value * 2 + (enemy ? 8000 : 0)) * cool +
            lost +
            finish +
            (townless ? 40000 : 0),
          ...(garrison
            ? {
                battle: { kind: "town", objectId: obj.id, heroId: hero.id },
                maxLoss: townless ? 0.9 : isMain ? 0.45 : 0.2,
                ...(enemy && !townless ? { minRatio: edge } : {}),
              }
            : {}),
        });
        continue;
      }
      const cost = dist.get(i);
      if (cost === undefined || cost === 0) continue;
      const siteGuarded = siteGuard(state, obj);
      add({
        key: `obj:${obj.id}`,
        x: obj.x,
        y: obj.y,
        cost,
        value,
        ...(siteGuarded
          ? {
              battle: { kind: "site", objectId: obj.id, heroId: hero.id },
              maxLoss: isMain ? 0.3 : 0.12,
            }
          : {}),
      });
    }
    // --- Neutral stacks.
    for (const m of Object.values(state.monsters)) {
      const i = m.y * w + m.x;
      if (turn.explored[i] !== true) continue;
      const near = nextTo(m.x, m.y, m.id, true);
      if (near === undefined) {
        rejected?.push(`mon:${m.id} at ${m.x},${m.y}: no cell to attack from`);
        continue;
      }
      const obj = state.map.objects.find((o) => o.id === m.id);
      let value =
        this.clearValue(state) +
        (bonusOf.get(m.id) ?? 0) +
        (leads.get(m.id) ?? 0);
      if (obj !== undefined) {
        const guarded = obj.data["guards"];
        if (Array.isArray(guarded)) {
          for (const id of guarded) {
            const g = state.map.objects.find((o) => o.id === id);
            if (g === undefined) continue;
            // Already counted through the zone of control above?
            const gi = g.y * w + g.x;
            if (ctx.guards.get(gi)?.includes(m.id) === true) continue;
            value += this.objectValue(turn, hero, g, explore) * 0.8;
          }
        }
      }
      // Opening ground: unexplored cells around the stack (often what it
      // blocks), worth more once the open ground is seen.
      const opening = explore < 1 ? 1.5 : 0.6;
      value +=
        this.newCells(turn, m.x, m.y, 6) * EXPLORE_CELL * explore * opening;
      add({
        key: `mon:${m.id}`,
        x: m.x,
        y: m.y,
        cost: near.cost,
        via: near.via,
        value,
        ...(near.others.length > 0 ? { chained: near.others } : {}),
        battle: { kind: "monster", objectId: m.id, heroId: hero.id },
        maxLoss: isMain ? 0.3 : 0.1,
      });
      // Parley (iteration 2): a small stack in front of something worth
      // having is talked past instead of fought (no losses, no clearing);
      // what it guards then lies open for today. Taken when the fight is
      // refused or costs more. Cast from a cell within 2 of the stack
      // outside every zone (bzc.39): stepping into a zone starts the
      // fight at once, so the hero stops short and casts first.
      const behind = (bonusOf.get(m.id) ?? 0) + (leads.get(m.id) ?? 0);
      const spot =
        behind > 0 && near.others.length === 0 && hero.pages.includes("parley")
          ? castSpot(m.x, m.y)
          : undefined;
      if (
        spot !== undefined &&
        adventureCastError(state, hero, "parley") === null &&
        stackFv(m.creature, m.count) <=
          300 + 150 * adventurePower(hero, "parley", false)
      ) {
        add({
          key: `parley:${m.id}`,
          x: spot.x,
          y: spot.y,
          cost: spot.cost,
          value: behind * 0.85,
          parley: m.id,
        });
      }
    }
    // --- Enemy heroes.
    for (const foe of turn.enemies) {
      const near = nextTo(foe.x, foe.y);
      if (near === undefined) continue;
      const battle = heroBattle(state, hero.id, foe.id);
      // Counter-attack: an enemy hero that can strike one of our towns
      // soon is worth beating first. Iteration 4: within the reach that
      // makes a town threatened (was 2.6 days: on most maps any rival hero
      // near any of our towns, a third of all player battles), and at a
      // smaller edge, since that fight comes to us anyway (a main hero and
      // a rival of about its strength stood off for weeks).
      // A rival hero standing in its own town is not coming for ours: an
      // attack on it is an attack on that town (its edge, its rules).
      // Only a hero that could hurt the town counts (a quarter of its
      // defence): a scout near a garrisoned town is no threat.
      const foePower = heroPower(foe);
      // Nor is one at its own door (within 3 cells of one of its towns):
      // a passive player's hero next to its capital was "defended
      // against" on day 7 on Easy, three weeks before its first attack day.
      const atHome = Object.values(state.towns).some((t) => {
        if (t.owner !== foe.owner) return false;
        const o = townObject(state, t.id);
        return o !== undefined && chebyshev(o.x, o.y, foe.x, foe.y) <= 3;
      });
      let near2town = 0;
      const ours = battle.townId === undefined && !atHome ? turn.towns : [];
      for (const t of ours) {
        const o = townObject(state, t.id);
        if (o === undefined) continue;
        if (chebyshev(o.x, o.y, foe.x, foe.y) > (foe.maxMp / 100) * 1.6 + 1) {
          continue;
        }
        if (foePower >= this.townDefence(state, t) * 0.25) near2town = 5000;
      }
      // No hunting scouts and fresh hires (iteration 4: a third of all
      // player battles): a rival hero with a tenth of our army is fought
      // only when it is within today's walk or threatens a town.
      if (
        near2town === 0 &&
        battle.townId === undefined &&
        armyFv(foe.army) < armyFv(hero.army) * 0.1 &&
        near.cost > hero.mp
      ) {
        continue;
      }
      // A stalled war (iteration 2): away from our towns, its heroes
      // need a bigger edge and are worth less.
      const defending = near2town > 0;
      if (!defending && state.day < this.params.aggressionDay) continue;
      // The war plan (iteration 4): no hunting a held-off rival's heroes
      // away from our towns.
      if (!defending && this.holding(turn, foe.owner)) continue;
      // A rival hero in its own town is an attack on that town: not when
      // the owner has a hero near enough to take it straight back.
      if (
        battle.townId !== undefined &&
        !(turn.towns.length === 0) &&
        !turn.finishing.has(foe.owner) &&
        !this.worthRetaking(turn, battle.townId) &&
        this.chaser(
          state,
          turn.player,
          foe.owner,
          foe.x,
          foe.y,
          heroPower(hero) * CHASE_SHARE,
        )
      ) {
        continue;
      }
      const cool = !defending && turn.stalled.has(foe.owner) ? 0.6 : 1;
      add({
        key: `hero:${foe.id}`,
        x: foe.x,
        y: foe.y,
        cost: near.cost,
        via: near.via,
        value:
          (3000 + armyFv(foe.army) * 1.5 + (battle.townId ? 9000 : 0)) * cool +
          near2town,
        battle,
        // Only with a clear advantage (iteration 1): no coin flips.
        maxLoss: isMain ? 0.4 : 0.15,
        minRatio: defending
          ? DEFEND_EDGE + this.params.edgeBonus
          : this.edgeAgainst(turn, foe.owner, 1.3),
      });
    }
    // --- Own towns: troops to pick up, a town to defend.
    for (const town of turn.towns) {
      const obj = townObject(state, town.id);
      if (obj === undefined) continue;
      const i = obj.y * w + obj.x;
      const cost = dist.get(i);
      if (cost === undefined || cost === 0 || guarded(i)) continue;
      let value = 0;
      // The Keystone goes home to a town that can build its hall (bead
      // bzc.116: dug Keystones were carried about and never built).
      if (hero.backpack.includes(KEYSTONE_ITEM) && keystoneHallReady(town)) {
        value += KEYSTONE_HOME_VALUE;
      }
      if (isMain) {
        // Worth the trip only when it adds a good share to the army, and
        // not back and forth (iteration 1): within a few days of the last
        // pick-up there, or with a ferry hero to bring the troops, the
        // share must be larger.
        const troops = this.troopsAt(state, town);
        const since =
          state.day - (this.lastPickup.get(`${turn.player}:${town.id}`) ?? -99);
        const ferry = turn.heroes.some(
          (h) => h !== hero && armyFv(h.army) < armyFv(hero.army) * 0.5,
        );
        const share = since < 5 ? 0.45 : ferry ? 0.3 : 0.15;
        if (troops >= armyFv(hero.army) * share) {
          value += troops * 0.9 * turn.need;
        }
        const threat = turn.threatened.get(town.id) ?? turn.alert.get(town.id);
        // No bouncing between towns on alert (iteration 2: a main hero
        // walked between two alert towns for days): a hero guarding one
        // town does not leave it for another on mere alert, nor for a
        // threatened one while its own is threatened; an alert town it
        // stood in during the last three days does not call it back.
        const here = turn.towns.find((x) => heroInTownOf(state, x) === hero);
        const guarding =
          here !== undefined &&
          (turn.threatened.has(here.id) || turn.alert.has(here.id));
        const bounced = this.wasAt(hero, obj.x, obj.y, state.day, 3);
        // The capital (the first town) is always defended; another town
        // is worth its buildings, and one the main hero cannot hold even
        // with its troops is let go (iteration 3: captured towns pulled
        // the main hero back and forth across the map).
        const capital = turn.owned.values().next().value === town.id;
        const holds = capital
          ? heroPower(hero) >= (threat ?? 0) * 0.6
          : heroPower(hero) + troops >= (threat ?? 0) * 1.1;
        if (threat !== undefined && holds) {
          // Losing a town costs more than taking one gains (its
          // buildings, the week's growth): defence outranks conquest.
          if (turn.threatened.has(town.id)) {
            if (here === undefined || !turn.threatened.has(here.id)) {
              value += capital
                ? 40000
                : Math.min(40000, 15000 + 1500 * town.buildings.length);
            }
          } else if (!guarding && !bounced) value += 6000;
        }
        // Regroup (iteration 2): outmatched by a rival hero within two
        // days, the main hero falls back on a town with troops to take
        // rather than wait in the open to be picked off.
        const mine = heroPower(hero);
        const outmatched = turn.enemies.some(
          (f) =>
            heroPower(f) > mine * 1.1 &&
            chebyshev(f.x, f.y, hero.x, hero.y) <= (f.maxMp / 100) * 2.2,
        );
        if (outmatched && !bounced && troops + mine >= mine * 1.2) {
          value += 8000;
        }
      } else if (turn.main !== undefined) {
        // A secondary fetches troops for a main hero a day or more away.
        const m = turn.main;
        const far = chebyshev(m.x, m.y, obj.x, obj.y) > 6;
        const troops = this.troopsAt(state, town);
        // Only troops the town lets go (iteration 3: a secondary walked
        // between its town and the road every day for troops the town,
        // on alert, kept home), and not straight back to a town it just
        // left.
        const keeps =
          turn.threatened.has(town.id) ||
          turn.alert.has(town.id) ||
          turn.watch.has(town.id);
        const free = keeps ? 0 : troops - this.guardOf(turn, town);
        if (
          far &&
          free >= Math.max(300, armyFv(m.army) * 0.1) &&
          !this.wasAt(hero, obj.x, obj.y, state.day, 2)
        ) {
          value += free * 0.8;
        }
        // Defence (iteration 3): a secondary within a day of a town on
        // alert or threatened goes home when its army (with the garrison
        // and what the town can recruit) holds the town.
        const threat = Math.max(
          turn.threatened.get(town.id) ?? 0,
          turn.alert.get(town.id) ?? 0,
        );
        if (
          threat > 0 &&
          cost <= hero.mp + hero.maxMp &&
          heroPower(hero) + troops * 1.1 >= threat * 0.9
        ) {
          value += turn.threatened.has(town.id) ? 20000 : 4000;
        }
      }
      add({ key: `home:${town.id}`, x: obj.x, y: obj.y, cost, value });
    }
    // --- Meet the main hero with troops.
    if (!isMain && turn.main !== undefined) {
      const m = turn.main;
      const carried = this.handOffs(hero.army, m.army).reduce(
        (n, h) => n + h.fv,
        0,
      );
      // Gathering for a big attack (iteration 2): any reserve counts and
      // the meeting outranks the secondary's own errands.
      const min = turn.gather ? 300 : Math.max(300, armyFv(m.army) * 0.08);
      if (carried >= min) {
        const near = nextTo(m.x, m.y);
        if (near !== undefined) {
          add({
            key: `meet:${m.id}`,
            x: near.via.x,
            y: near.via.y,
            cost: near.cost,
            value:
              carried * (turn.gather ? 2.5 : 1.1) + (turn.gather ? 3000 : 0),
          });
        }
      }
    }
    // --- Exploration.
    this.exploreTargets(turn, hero, dist, explore, add, guarded);
    // --- Dowse marks to dig.
    for (const [x, y] of this.digSpots(state, turn.player)) {
      const cost = dist.get(y * w + x);
      if (cost === undefined || cost === 0 || guarded(y * w + x)) continue;
      const keystone = state.map.objects.some(
        (o) => o.x === x && o.y === y && o.data["type"] === "buried-keystone",
      );
      add({
        key: `dig:${x},${y}`,
        x,
        y,
        cost: cost + hero.maxMp,
        value: keystone ? 9000 : 2000,
      });
    }

    // Lazy fight estimates: best bound first (a fight's experience may
    // lift it above its bound, hence the margin).
    out.sort((a, b) => b.bound - a.bound || a.cost - b.cost);
    const done: Target[] = [];
    let best = -Infinity;
    for (const t of out) {
      if (t.bound * 1.5 < best && done.length >= 3 && rejected === undefined)
        break;
      if (t.battle !== undefined) {
        let est = this.oracle.estimate(state, t.battle);
        if (est !== null && est.win && t.chained !== undefined) {
          est = this.chainedFights(state, hero, est, t.chained);
        }
        if (
          est === null ||
          !est.win ||
          est.lossShare >
            Math.min(0.95, (t.maxLoss ?? 0.3) * this.params.lossScale) ||
          est.ratio < (t.minRatio ?? 0)
        ) {
          rejected?.push(
            `${t.key} value ${Math.round(t.value)} cost ${t.cost} ratio ${est?.ratio.toFixed(2)} win ${est?.win} loss ${est?.lossShare.toFixed(2)}`,
          );
          continue;
        }
        const xp = est.xp * XP_VALUE * (isMain ? 1 : 0.5);
        const net = t.value + xp - est.lossFv * turn.lossCost;
        if (net <= 0) {
          rejected?.push(
            `${t.key} value ${Math.round(t.value)} loses ${Math.round(est.lossFv)} fv: not worth it`,
          );
          continue;
        }
        t.fight = est;
        t.score = (t.bound * net) / t.value;
      }
      done.push(t);
      best = Math.max(best, t.score);
    }
    return done.sort((a, b) => b.score - a.score || a.cost - b.cost);
  }

  /**
   * Adds the stacks that attack after a won fight (their zones cover the
   * cell the hero attacks from) to an estimate, by fight value: each must
   * be clearly weaker than what is left of the army.
   */
  private chainedFights(
    state: GameState,
    hero: HeroState,
    first: FightEstimate,
    others: readonly string[],
  ): FightEstimate {
    const own = armyFv(hero.army);
    let left = own - first.lossFv;
    const st = heroStatsFactor(hero);
    let xp = first.xp;
    for (const id of others) {
      const m = state.monsters[id];
      if (m === undefined) continue;
      const theirs = stackFv(m.creature, m.count);
      const ratio = theirs <= 0 ? 99 : (left * st) / theirs;
      if (ratio < 1.6) {
        return { ...first, win: false, lossFv: own, lossShare: 1 };
      }
      left -= left * Math.min(1, 0.45 / (ratio * ratio));
      xp += m.count * getCreature(m.creature).hp;
    }
    const lossFv = own - left;
    return {
      ...first,
      lossFv,
      lossShare: own <= 0 ? 1 : lossFv / own,
      xp,
    };
  }

  /**
   * The first weeks' leash (iteration 2): while the army is small (days
   * 1-14 by the faction's wander range), the main hero's targets beyond
   * that many days' walk of its first town count a third, so it can come
   * home when a rival shows up (most early eliminations were a town taken
   * while the main hero was far away).
   */
  private tether(
    turn: Turn,
    hero: HeroState,
  ): { x: number; y: number; cells: number } | null {
    if (hero !== turn.main || turn.state.day > 14 || turn.rivals === 0) {
      return null;
    }
    const home = turn.towns[0];
    const o = home === undefined ? undefined : townObject(turn.state, home.id);
    if (home === undefined || o === undefined) return null;
    const days = WANDER_DAYS[home.faction] ?? 2;
    return { x: o.x, y: o.y, cells: Math.round((hero.maxMp / 100) * days) };
  }

  /** Value of clearing a stack beyond what it guards: grows over time. */
  private clearValue(state: GameState): number {
    return Math.min(4000, CLEAR_VALUE + 35 * state.day);
  }

  /** Gold value of troops the main hero could take in a town now. */
  private troopsAt(state: GameState, town: TownState): number {
    let fv = armyFv(town.garrison);
    const p = state.players.find((x) => x.id === town.owner);
    if (p === undefined) return fv;
    let gold = p.resources.gold;
    for (const [c, d] of Object.entries(town.dwellings)) {
      if (d === undefined || d.available <= 0) continue;
      const def = getCreature(c);
      const price = def.cost.gold ?? 0;
      const n =
        price <= 0
          ? d.available
          : Math.min(d.available, Math.floor(gold / price));
      gold -= n * price;
      fv += n * def.fightValue;
    }
    return fv;
  }

  /** Multiplier of exploration value: high early, fading when most is seen. */
  private exploreWeight(turn: Turn): number {
    // The share counts mountains and water too: a whole zone can still be
    // hidden at 95%, so the weight never drops below a half.
    const s = turn.exploredShare;
    return s < 0.6 ? 1 : Math.max(0.5, 1.6 - s);
  }

  /** Unexplored cells within `r` of (x, y). */
  private newCells(turn: Turn, x: number, y: number, r: number): number {
    const { map } = turn.state;
    let n = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (!inSight(dx, dy, r)) continue;
        const cx = x + dx;
        const cy = y + dy;
        if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) continue;
        if (turn.explored[cy * map.width + cx] !== true) n++;
      }
    }
    return n;
  }

  private exploreTargets(
    turn: Turn,
    hero: HeroState,
    dist: Map<number, number>,
    explore: number,
    add: (t: Omit<Target, "score" | "bound">) => void,
    guarded: (i: number) => boolean,
  ): void {
    const { map } = turn.state;
    const w = map.width;
    const r = sightRadius(hero);
    // Cells next to unexplored ground (within 2) and out of any zone.
    const frontier: Array<{ i: number; cost: number }> = [];
    for (const [i, cost] of dist) {
      if (cost === 0 || guarded(i)) continue;
      const x = i % w;
      const y = (i - x) / w;
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const cx = x + dx;
          const cy = y + dy;
          if (cx < 0 || cy < 0 || cx >= w || cy >= map.height) continue;
          if (turn.explored[cy * w + cx] !== true) {
            near = true;
            break;
          }
        }
      }
      if (near) frontier.push({ i, cost });
    }
    const scored: Array<{ i: number; cost: number; value: number }> = [];
    // Hard knows where its rivals' towns are (iteration 4): ground toward
    // one it has not seen yet weighs up to 2.5 times (a Hard player found
    // a passive human's capital weeks after Normal did on the named maps).
    const scent: Array<{ x: number; y: number }> = [];
    if (this.params.scentTowns && turn.state.day >= this.params.aggressionDay) {
      for (const t of Object.values(turn.state.towns)) {
        if (t.owner === null || t.owner === turn.player) continue;
        const o = townObject(turn.state, t.id);
        if (o !== undefined && turn.explored[o.y * w + o.x] !== true) {
          scent.push({ x: o.x, y: o.y });
        }
      }
    }
    for (const f of frontier) {
      const x = f.i % w;
      const y = (f.i - x) / w;
      const n = this.newCells(turn, x, y, r);
      if (n < MIN_NEW_CELLS) continue;
      const share = hero === turn.main ? 1 : 1.3;
      let pull = 1;
      for (const t of scent) {
        const near = Math.max(0, 1 - chebyshev(t.x, t.y, x, y) / 40);
        pull = Math.max(pull, 1 + 1.5 * near);
      }
      scored.push({ ...f, value: n * EXPLORE_CELL * explore * share * pull });
    }
    scored.sort(
      (a, b) =>
        b.value / (b.cost + 300) - a.value / (a.cost + 300) || a.i - b.i,
    );
    for (const s of scored.slice(0, 4)) {
      const x = s.i % w;
      const y = (s.i - x) / w;
      add({ key: `explore:${x},${y}`, x, y, cost: s.cost, value: s.value });
    }
  }

  /** What visiting `obj` is worth to this hero now (0: not a target). */
  private objectValue(
    turn: Turn,
    hero: HeroState,
    obj: MapObject,
    explore: number,
  ): number {
    const { state, player } = turn;
    const until = this.futile.get(`${player}:${obj.id}`);
    if (until !== undefined && until >= state.day) return 0;
    if (!roomFor(hero, obj)) return 0;
    const type = objectTypeOf(obj);
    switch (type) {
      case "one-way-waystone": {
        // Its exit is written on it (iteration 3): worth what the hero
        // would see there, when that is unexplored ground.
        const exit = obj.data["exit"];
        if (!Array.isArray(exit)) return 0;
        const n = this.newCells(turn, Number(exit[0]), Number(exit[1]), 4);
        return n < MIN_NEW_CELLS * 2 ? 0 : n * EXPLORE_CELL * explore * 0.7;
      }
      case "two-way-waystone":
      case "sanctuary":
      case "sign":
      case "trading-post":
      case "tollhouse":
      case "roadside-inn":
      case "altar-of-sacrifice":
      case "hermit":
        return 0;
      case "observatory":
        return this.newCells(turn, obj.x, obj.y, 12) * EXPLORE_CELL * explore;
      case "keymasters-tent": {
        // A key is worth what its closed gates hide (iteration 1).
        const colour = String(obj.data["colour"] ?? "");
        if (keysOf(state, player).includes(colour)) return 0;
        let v = 0;
        for (const g of state.map.objects) {
          if (g.kind !== "gate" || g.data["colour"] !== colour) continue;
          if (turn.explored[g.y * state.map.width + g.x] !== true) continue;
          if (gateOpen(state, g, player)) continue;
          v += 2500 + this.behindGate(turn, hero, g);
        }
        return v;
      }
      case "obelisk": {
        // Every obelisk brings the Keystone closer.
        const total = obeliskCount(state);
        if (playerListed(state, obj.id, player) || total === 0) return 0;
        return 500 + 6000 / total;
      }
      case "mana-well":
        if (hero.mana >= maxMana(hero) * 0.6) return 0;
        break;
      case "curse-lifters-shrine":
        return hero.worn.some((w) => w !== null && isCursed(w)) ? 500 : 0;
      case "library":
        if (hero.level < 8) return 0;
        break;
      case "seer-hut":
      case "quest-gate":
      case "caretaker-lodge": {
        const q = obj.data["quest"];
        if (
          q !== null &&
          typeof q === "object" &&
          type !== "caretaker-lodge" &&
          questMissing(state, hero, q as never) !== null
        ) {
          return 0;
        }
        break;
      }
      default:
        break;
    }
    if (obj.kind === "town") {
      const t = state.towns[obj.id];
      if (t === undefined || t.owner === player) return 0;
    }
    let v = objectValueFor(state, player, obj, hero.id);
    if (v <= 0 && typeof obj.data["value"] !== "number") {
      // Hand-made maps may leave the generator's value out.
      v = fallbackValue(state, player, obj);
    }
    if (v <= 0) return 0;
    if (obj.kind === "mine") {
      const owner = state.mines[obj.id]?.owner;
      if (owner !== null && owner !== undefined && owner !== player) v *= 1.3;
    }
    if (obj.kind === "dwelling") {
      // A flagged dwelling: the hire is worth something only if affordable.
      const s = state.sites[obj.id];
      if (s?.owner === player) {
        const gold =
          state.players.find((p) => p.id === player)?.resources.gold ?? 0;
        if (gold < 1500) return 0;
      }
    }
    return v;
  }

  /**
   * What lies behind a closed gate, seen from `hero`'s side: a flood fill
   * from the gate over passable cells the hero cannot reach, counting the
   * objects there (their value) and unexplored cells (as exploration).
   */
  private behindGate(turn: Turn, hero: HeroState, gate: MapObject): number {
    const { state } = turn;
    const { map } = state;
    const w = map.width;
    const { cost: dist, ctx } = this.reachOf(turn, hero);
    const start = gate.y * w + gate.x;
    const seen = new Set<number>([start]);
    const queue = [start];
    let v = 0;
    while (queue.length > 0 && seen.size < 160) {
      const i = queue.shift() ?? start;
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (!inBounds(map, nx, ny)) continue;
          const j = ny * w + nx;
          if (seen.has(j) || dist.has(j)) continue;
          const cell = map.cells[j];
          if (cell === undefined || !isPassable(cell)) continue;
          if (ctx.objectBlocked.has(j)) continue;
          seen.add(j);
          queue.push(j);
          if (turn.explored[j] !== true) v += EXPLORE_CELL;
        }
      }
    }
    for (const o of map.objects) {
      if (o.kind === "gate" || o.kind === "monster") continue;
      if (!seen.has(o.y * w + o.x)) continue;
      const ov = objectValueFor(state, turn.player, o);
      v += ov > 0 ? ov : Number(o.data["value"] ?? 0) * 0.5;
    }
    return v;
  }

  /**
   * Cells where this player knows something is buried: its Dowse marks
   * and, once every obelisk is seen, the Keystone's cell.
   */
  private digSpots(state: GameState, player: number): Array<[number, number]> {
    const spots: Array<[number, number]> = [
      ...(state.magic?.marks?.[String(player)] ?? []),
    ];
    const total = obeliskCount(state);
    if (total > 0 && obelisksVisited(state, player) >= total) {
      const cells = puzzleCells(state, player);
      const key = cells[cells.length - 1];
      if (key !== undefined) spots.push(key);
    }
    return spots.filter(([x, y]) => diggable(state, x, y));
  }

  /**
   * Seer quests the player could finish (iteration 1): a "defeat this
   * stack" or "visit that site" quest adds part of the seer's reward to
   * the stack or site, so the hero goes there and then to the seer.
   */
  private questLeads(turn: Turn): Map<string, number> {
    const { state, player } = turn;
    const leads = new Map<string, number>();
    const w = state.map.width;
    for (const o of state.map.objects) {
      if (objectTypeOf(o) !== "seer-hut") continue;
      if (turn.explored[o.y * w + o.x] !== true) continue;
      const q = o.data["quest"] as
        | {
            kind?: string;
            monster?: string;
            object?: string;
            artifact?: string;
            creature?: string;
            count?: number;
          }
        | undefined;
      if (q === undefined || q === null) continue;
      const reward = objectValueFor(state, player, o);
      if (reward <= 0) continue;
      // Iteration 2: an artifact quest leads to that artifact on the map
      // (unless a hero of ours carries it), a creatures quest to the stray
      // hut that sells them (unless a hero has enough).
      if (q.kind === "artifact" && q.artifact !== undefined) {
        const art = q.artifact;
        const carried = turn.heroes.some(
          (h) => h.backpack.includes(art) || h.worn.includes(art),
        );
        if (carried) continue;
        for (const a of state.map.objects) {
          if (a.kind !== "artifact" || a.data["artifact"] !== art) continue;
          // A Mystery Bag's artifact is a secret (bead bzc.105).
          if (a.data["type"] === "mystery-bag") continue;
          if (state.collected.includes(a.id)) continue;
          leads.set(a.id, (leads.get(a.id) ?? 0) + reward * 0.6);
        }
        continue;
      }
      if (q.kind === "creatures" && q.creature !== undefined) {
        const c = q.creature;
        const enough = turn.heroes.some(
          (h) =>
            h.army.reduce((n, s) => n + (s?.creature === c ? s.count : 0), 0) >=
            (q.count ?? 1),
        );
        if (enough) continue;
        for (const hut of state.map.objects) {
          if (hut.data["type"] !== "stray-hut" || hut.data["creature"] !== c) {
            continue;
          }
          leads.set(hut.id, (leads.get(hut.id) ?? 0) + reward * 0.5);
        }
        continue;
      }
      const id =
        q.kind === "guard" ? q.monster : q.kind === "visit" ? q.object : null;
      if (id === undefined || id === null) continue;
      if (q.kind === "visit" && state.sites[id]?.seen?.includes(player)) {
        continue;
      }
      leads.set(id, (leads.get(id) ?? 0) + reward * 0.6);
    }
    return leads;
  }

  /**
   * Whether Opening Salvo is worth casting on the stack this target
   * fights: it kills some of the stack for 100 movement, so the fight
   * costs fewer troops.
   */
  private salvoWanted(turn: Turn, hero: HeroState, t: Target): boolean {
    const spell = "opening-salvo";
    if (t.battle?.kind !== "monster" || !hero.pages.includes(spell)) {
      return false;
    }
    if ((t.fight?.lossShare ?? 0) <= 0) return false;
    return adventureCastError(turn.state, hero, spell) === null;
  }

  /** Opening Salvo on the target's stack (within 2 cells of the hero). */
  private openingSalvo(hero: HeroState, t: Target): GameAction {
    return {
      type: "cast",
      heroId: hero.id,
      spell: "opening-salvo",
      target: {
        monsterId: t.battle?.kind === "monster" ? t.battle.objectId : "",
      },
    };
  }

  /**
   * Green Road at the start of a hero's day when walking through forest
   * reaches a clearly better target today than the best one without it.
   */
  private greenRoad(
    turn: Turn,
    hero: HeroState,
    claimed: Set<string>,
    best: Target | undefined,
  ): GameAction | null {
    const spell = "green-road";
    const { state } = turn;
    if (!hero.pages.includes(spell) || hero.mp < hero.maxMp) return null;
    const key = `${state.day}:${hero.id}:${spell}`;
    if (this.answered.has(key)) return null;
    this.answered.add(key);
    if (adventureCastError(state, hero, spell) !== null) return null;
    const magic = state.magic ?? { heroes: {} };
    const store = magic.heroes[hero.id] ?? { castToday: [] };
    const trial: GameState = {
      ...state,
      magic: {
        ...magic,
        heroes: {
          ...magic.heroes,
          [hero.id]: { ...store, greenRoadDay: state.day },
        },
      },
    };
    const trialTurn: Turn = { ...turn, state: trial, reach: new Map() };
    trialTurn.reach.set(hero.id, reachFor(trial, hero, hero.mp));
    const w = state.map.width;
    const plain = this.reachOf(turn, hero).cost;
    const options = this.targets(trialTurn, hero, claimed).filter((t) => {
      const i = t.y * w + t.x;
      // Only targets reached today, off the forest, and new thanks to it.
      if (t.cost > hero.mp || state.map.cells[i]?.obstacle === "forest") {
        return false;
      }
      const c = plain.get(i);
      return c === undefined || c > hero.mp;
    });
    const top = options[0];
    if (top === undefined || top.score <= (best?.score ?? 0) * 1.3) {
      return null;
    }
    return { type: "cast", heroId: hero.id, spell };
  }

  /**
   * Read the Seal (iteration 2) on a rival hero in range, once in three
   * days per rival, with at least half its mana left. The AI's estimates
   * do not need the reading (they use the armies in sight); it is cast so
   * the spell is used as a player would, at no cost to the spells that
   * matter. v0.2 maps have no sealed site (no object sets `sealed`).
   */
  private scouting(turn: Turn): GameAction | null {
    const { state } = turn;
    const spell = "read-the-seal";
    for (const hero of turn.heroes) {
      if (!hero.pages.includes(spell)) continue;
      if (hero.mana < maxMana(hero) * 0.5) continue;
      if (adventureCastError(state, hero, spell) !== null) continue;
      const range = 6 + adventurePower(hero, spell, false);
      for (const foe of turn.enemies) {
        if (chebyshev(foe.x, foe.y, hero.x, hero.y) > range) continue;
        const key = `${turn.player}:${foe.id}`;
        const last = this.sealRead.get(key) ?? -99;
        if (state.day - last < 3) continue;
        this.sealRead.set(key, state.day);
        return {
          type: "cast",
          heroId: hero.id,
          spell,
          target: { heroId: foe.id },
        };
      }
    }
    return null;
  }

  // -------------------------------------------------------------- digging

  private digging(turn: Turn): GameAction | null {
    const { state } = turn;
    for (const hero of turn.heroes) {
      if (hero.mp < hero.maxMp || !this.onMark(turn, hero)) continue;
      return { type: "dig", heroId: hero.id };
    }
    // Dowse once a week per hero that knows it, early in the week.
    if (calendar(state.day).dayOfWeek > 2) return null;
    for (const hero of turn.heroes) {
      if (!hero.pages.includes("dowse")) continue;
      if (adventureCastError(state, hero, "dowse") !== null) continue;
      if (hero.mana < 20) continue;
      return { type: "cast", heroId: hero.id, spell: "dowse" };
    }
    return null;
  }

  /**
   * Marks `obj` as not worth visiting for `days` (a hero stood on it and
   * it still shows value: the visit gave nothing).
   */
  markFutile(player: number, objectId: string, day: number, days = 14): void {
    this.futile.set(`${player}:${objectId}`, day + days);
  }
}
