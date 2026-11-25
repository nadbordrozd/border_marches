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
 * Determinism: no randomness; ties break by map order. The goal and
 * futility memories live in the controller instance (a reloaded game
 * starts them empty), so two runs from the same start play alike.
 * Fog: targets are read from the player's explored cells only.
 */
import { findArtifact, isCursed, wornDef } from "../../data/artifacts.ts";
import { getCreature } from "../../data/creatures.ts";
import type { MapObject } from "../map/types.ts";
import { inBounds } from "../map/types.ts";
import { adventureCastError } from "../magic/adventure.ts";
import { registerSpells } from "../magic/index.ts";
import {
  assemblable,
  calendar,
  heroBattle,
  heroesOf,
  heroInTownOf,
  heroStats,
  inSight,
  maxMana,
  objectTypeOf,
  objectValueFor,
  prizeValue,
  questMissing,
  sightRadius,
  siteOptions,
  skillWeight,
  townsOf,
  wearError,
  type ArmySlots,
  type BattleResolver,
  type GameAction,
  type GameState,
  type HeroState,
  type LevelUpOffer,
  type PathStep,
  type PendingBattle,
  type PlayerController,
  type TownState,
} from "../game/index.ts";
import { featInfo, featWeight } from "../game/hero.ts";
import { cutsCorner } from "../game/pathfinding.ts";
import { pathIn, reachFor, type Reach } from "./reach.ts";
import { inSanctuary } from "../game/site-state.ts";
import { slotFor } from "../game/state.ts";
import { createBattleResolver } from "../battle/resolver.ts";
import {
  chooseBuild,
  chooseHire,
  chooseRecruit,
  dayOfWeek,
  reserveFor,
  tradeFor,
} from "./economy.ts";
import {
  armyFv,
  FightOracle,
  heroPower,
  stackFv,
  statFactor,
  type FightEstimate,
} from "./strength.ts";

export interface AdventureAiOptions {
  /**
   * Resolver for simulated close fights (default: the game's auto-battle).
   * null: fast fight-value estimates only.
   */
  resolver?: BattleResolver | null;
  /** Days of movement a hero plans ahead (default 4). */
  horizonDays?: number;
}

/** Simulated battles allowed per decide call and per turn (time bound). */
const SIMS_PER_DECISION = 1;
const SIMS_PER_TURN = 4;
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
/** Bonus factor for a hero's previous target (goal memory). */
const GOAL_BONUS = 1.25;
/** Extra days added to every target (prefers fewer, bigger trips). */
const DAY_OFFSET = 0.35;

/** A target a hero may walk to. */
interface Target {
  key: string;
  /** The cell the path goes to (the stack or hero for an attack). */
  x: number;
  y: number;
  /** Movement points to reach it. */
  cost: number;
  /** For an attack: the cell next to the target to attack from. */
  via?: { x: number; y: number };
  /** Stacks whose zone covers `via`: they attack after the target. */
  chained?: string[];
  /** Gold-equivalent value before a fight's losses. */
  value: number;
  /** The fight on arrival, if any. */
  battle?: PendingBattle;
  /** The highest loss share accepted for this fight. */
  maxLoss?: number;
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
}

/**
 * After the first week the cheapest creatures stay in town as its guard:
 * an empty town falls to any passing hero.
 */
export function homeGuard(state: GameState, creature: string): boolean {
  return state.day > 7 && getCreature(creature).tier === 1;
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

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

function townObject(state: GameState, id: string): MapObject | undefined {
  return state.map.objects.find((o) => o.id === id);
}

export class AdventureAi implements PlayerController {
  private readonly oracle: FightOracle;
  private readonly horizon: number;
  /** "<player>:<object>" -> last day it is not worth a visit. */
  private readonly futile = new Map<string, number>();
  /** Hero id -> its target key (goal memory). */
  private readonly goals = new Map<string, string>();
  /** "<day>:<hero>:<object>:<option>" site choices made (no repeats). */
  private readonly answered = new Set<string>();
  private day = 0;
  private turnKey = "";
  private turnSims = 0;
  private dangerCache: { key: string; danger: Map<number, number> } | null =
    null;

  constructor(options: AdventureAiOptions = {}) {
    registerSpells();
    const resolver =
      options.resolver === undefined
        ? createBattleResolver()
        : options.resolver;
    this.oracle = new FightOracle(resolver);
    this.horizon = options.horizonDays ?? 4;
  }

  /** Battles simulated so far (profiling). */
  get simulations(): number {
    return this.oracle.simulations;
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
    const turnKey = `${state.day}:${player}`;
    if (turnKey !== this.turnKey) {
      this.turnKey = turnKey;
      this.turnSims = SIMS_PER_TURN;
    }
    const before = this.oracle.simulations;
    this.oracle.budget = Math.min(SIMS_PER_DECISION, this.turnSims);
    const action = this.decideTurn(state, player);
    this.turnSims -= this.oracle.simulations - before;
    return action;
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
      this.movement(turn) ?? { type: "end-turn" }
    );
  }

  /** Whether the hero stands on a Dowse mark with something still buried. */
  private onMark(turn: Turn, hero: HeroState): boolean {
    const marks = turn.state.magic?.marks?.[String(turn.player)] ?? [];
    if (!marks.some(([x, y]) => x === hero.x && y === hero.y)) return false;
    return diggable(turn.state, hero.x, hero.y);
  }

  levelUp(state: GameState, heroId: string, offer: LevelUpOffer): number {
    const hero = state.heroes.find((h) => h.id === heroId);
    if (hero === undefined) return 0;
    let best = 0;
    let bestScore = -1;
    if (offer.step === "skill") {
      offer.offers.forEach((o, i) => {
        const s =
          o.kind === "new"
            ? skillWeight(hero, o.skill, 1) *
              (hero.skills.length < 4 ? 1.2 : 0.8)
            : o.kind === "upgrade"
              ? skillWeight(hero, o.skill, o.rank) * 1.4
              : o.stat === "attack" || o.stat === "defense"
                ? 2.5
                : 1.5;
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
    const main = this.mainHero(heroesOf(state, hero.owner));
    if (main?.id === hero.id && gold >= 4000 && hero.level < 10) return "xp";
    return "gold";
  }

  // ---------------------------------------------------------------- turn

  private mainHero(heroes: readonly HeroState[]): HeroState | undefined {
    let best: HeroState | undefined;
    let power = -1;
    for (const h of heroes) {
      const p = heroPower(h) + h.level * 50;
      if (p > power) {
        power = p;
        best = h;
      }
    }
    return best;
  }

  private turnOf(state: GameState, player: number): Turn {
    const all = heroesOf(state, player);
    const main = this.mainHero(all);
    const heroes =
      main === undefined ? all : [main, ...all.filter((h) => h !== main)];
    const towns = townsOf(state, player);
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
    for (const town of towns) {
      const obj = townObject(state, town.id);
      if (obj === undefined) continue;
      const defenders = heroInTownOf(state, town);
      const defence =
        armyFv(town.garrison) * (1 + 0.05 * 2) +
        (defenders === undefined ? 0 : heroPower(defenders));
      for (const foe of enemies) {
        const reach = (foe.maxMp / 100) * 1.6 + 1;
        if (chebyshev(foe.x, foe.y, obj.x, obj.y) > reach) continue;
        const p = heroPower(foe);
        if (p > defence) {
          threatened.set(town.id, Math.max(threatened.get(town.id) ?? 0, p));
        }
      }
    }
    // Cells a visible enemy hero can attack on its next turn. Enemies do
    // not move during this turn: computed once per turn and enemy set
    // (a beaten enemy changes the key).
    const dangerKey = `${state.day}:${player}:${enemies
      .map((h) => `${h.id}@${h.x},${h.y}:${Math.round(heroPower(h))}`)
      .join(";")}`;
    const cached = this.dangerCache;
    const danger =
      cached !== null && cached.key === dangerKey
        ? cached.danger
        : new Map<number, number>();
    this.dangerCache = { key: dangerKey, danger };
    for (const foe of cached?.key === dangerKey ? [] : enemies) {
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
    return {
      state,
      player,
      heroes,
      main,
      towns,
      explored,
      exploredShare: explored.length === 0 ? 1 : seen / explored.length,
      threatened,
      enemies,
      danger,
      need,
      lossCost,
      reach: new Map(),
    };
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
      const options = siteOptions(state, hero, obj).filter(
        (o) => o.disabled === undefined,
      );
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
    const hire = chooseHire(state, player, turn.towns);
    if (hire !== null) return hire;
    const dow = dayOfWeek(state.day);
    for (const town of turn.towns) {
      const threat = turn.threatened.has(town.id);
      const hero = heroInTownOf(state, town);
      const isMain = hero !== undefined && hero === turn.main;
      // The main hero takes the garrison along.
      if (isMain && !threat) {
        const t = this.garrisonToHero(state, town, hero);
        if (t !== null) return t;
      }
      const choice = chooseBuild(state, town);
      if (choice.build !== null && !threat) {
        return { type: "build", townId: town.id, building: choice.build };
      }
      if (choice.saving !== null && !threat) {
        const trade = tradeFor(state, player, choice.saving);
        if (trade !== null) return trade;
      }
      // Recruit everything when a hero is here, at the week's end or under
      // threat; otherwise keep back what a key building needs. A hall
      // (income) is kept back for even with a hero in town.
      const hall = choice.saving?.hallIncome !== undefined;
      const all = threat || ((hero !== undefined || dow >= 6) && !hall);
      const reserve = all ? {} : reserveFor(choice.saving);
      const recruit = chooseRecruit(state, town, reserve, isMain, (c) =>
        homeGuard(state, c),
      );
      if (recruit !== null) return recruit;
      if (isMain && !threat) {
        const t = this.garrisonToHero(state, town, hero);
        if (t !== null) return t;
      }
      // A secondary hero picks the garrison up to bring it to the main hero.
      if (
        hero !== undefined &&
        !isMain &&
        !threat &&
        turn.main !== undefined &&
        armyFv(town.garrison) >= 300
      ) {
        const t = this.garrisonToHero(state, town, hero);
        if (t !== null) return t;
      }
    }
    return null;
  }

  /** One transfer from the garrison into the hero's army, if any fits. */
  private garrisonToHero(
    state: GameState,
    town: TownState,
    hero: HeroState,
  ): GameAction | null {
    const g = town.garrison;
    let bestSlot = -1;
    let bestFv = 0;
    g.forEach((s, i) => {
      if (s === null || homeGuard(state, s.creature)) return;
      const fv = stackFv(s.creature, s.count);
      if (fv > bestFv && slotFor(hero.army, s.creature) >= 0) {
        bestFv = fv;
        bestSlot = i;
      }
    });
    if (bestSlot >= 0) {
      const s = g[bestSlot];
      if (s === null || s === undefined) return null;
      const to = slotFor(hero.army, s.creature);
      return {
        type: "transfer",
        args: {
          heroId: hero.id,
          townId: town.id,
          from: { army: "garrison", slot: bestSlot },
          to: { army: "hero", slot: to },
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
      if (s === null || homeGuard(state, s.creature)) return;
      const fv = stackFv(s.creature, s.count);
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
            if (cell === undefined || cell.terrain === "water") continue;
            if (cell.obstacle !== "none") continue;
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

  private movement(turn: Turn): GameAction | null {
    const claimed = new Set<string>();
    for (const hero of turn.heroes) {
      if (hero.mp <= 0) continue;
      // On a Dowse mark: wait for tomorrow's full movement to dig.
      if (this.onMark(turn, hero)) continue;
      // A weak hero in a threatened town stays to defend it.
      const town = turn.towns.find((t) => heroInTownOf(turn.state, t) === hero);
      if (town !== undefined && turn.threatened.has(town.id)) continue;
      const targets = this.targets(turn, hero, claimed);
      let resting = false;
      for (const t of targets) {
        const steps = this.pathTo(turn, hero, t);
        if (steps === null) continue;
        const first = steps[0];
        if (first === undefined) continue;
        const today = steps.filter((s) => s.day === 0);
        // Do not end the day where a stronger enemy hero can strike
        // (unless that enemy is the target).
        const end = [...today].reverse().find((s) => !s.attack);
        const endCell =
          end === undefined
            ? hero.y * turn.state.map.width + hero.x
            : end.y * turn.state.map.width + end.x;
        if (!t.key.startsWith("hero:") && !this.safe(turn, hero, endCell)) {
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
    }
    return null;
  }

  /** Whether the hero may end its day on `cell`. */
  private safe(turn: Turn, hero: HeroState, cell: number): boolean {
    const threat = turn.danger.get(cell);
    if (threat === undefined) return true;
    let power = heroPower(hero);
    const w = turn.state.map.width;
    for (const town of turn.towns) {
      const obj = townObject(turn.state, town.id);
      if (obj !== undefined && obj.y * w + obj.x === cell) {
        power += armyFv(town.garrison) + heroPower(hero) * 0.2;
      }
    }
    return threat < power * 0.9;
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
   * The path to a target; an attack goes through its chosen neighbour
   * cell (so no other stack's zone is crossed) and ends on the target.
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
        attack: true,
      },
    ];
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
      r = reachFor(turn.state, hero, hero.mp + this.horizon * hero.maxMp);
      turn.reach.set(hero.id, r);
    }
    return r;
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
    const { cost: dist, ctx } = this.reachOf(turn, hero);
    const isMain = hero === turn.main;
    const maxMp = Math.max(1, hero.maxMp);
    const out: Target[] = [];
    const goal = this.goals.get(hero.id);
    const add = (t: Omit<Target, "score" | "bound">): void => {
      if (claimed.has(t.key) || t.value <= 0) return;
      const days = t.cost / maxMp + DAY_OFFSET;
      const bonus = t.key === goal ? GOAL_BONUS : 1;
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
    const explore = this.exploreWeight(turn);
    const bonusOf = new Map<string, number>();
    // --- Objects.
    for (const obj of state.map.objects) {
      if (obj.kind === "monster" || obj.kind === "hero-start") continue;
      if (obj.kind === "buried" || obj.kind === "gate") continue;
      const i = obj.y * w + obj.x;
      if (turn.explored[i] !== true) continue;
      const value = this.objectValue(turn, hero, obj, explore);
      if (value <= 0) continue;
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
        add({
          key: `obj:${obj.id}`,
          x: obj.x,
          y: obj.y,
          cost,
          // A town is income, dwellings and a guild for the rest of the
          // game; an enemy's also cripples the enemy.
          value: value * 2 + (enemy ? 8000 : 0),
          ...(garrison
            ? {
                battle: { kind: "town", objectId: obj.id, heroId: hero.id },
                maxLoss: isMain ? 0.5 : 0.2,
              }
            : {}),
        });
        continue;
      }
      const cost = dist.get(i);
      if (cost === undefined || cost === 0) continue;
      const siteGuarded =
        (obj.kind === "bank" || obj.kind === "site") &&
        Array.isArray(obj.data["guard"]) &&
        state.sites[obj.id]?.guard?.length !== 0 &&
        state.sites[obj.id]?.done !== true;
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
      let value = this.clearValue(state) + (bonusOf.get(m.id) ?? 0);
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
    }
    // --- Enemy heroes.
    for (const foe of turn.enemies) {
      const near = nextTo(foe.x, foe.y);
      if (near === undefined) continue;
      const battle = heroBattle(state, hero.id, foe.id);
      add({
        key: `hero:${foe.id}`,
        x: foe.x,
        y: foe.y,
        cost: near.cost,
        via: near.via,
        value: 3000 + armyFv(foe.army) * 1.5 + (battle.townId ? 9000 : 0),
        battle,
        maxLoss: isMain ? 0.55 : 0.2,
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
      if (isMain) {
        // Worth the trip only when it adds a good share to the army.
        const troops = this.troopsAt(state, town);
        if (troops >= armyFv(hero.army) * 0.15) {
          value += troops * 0.9 * turn.need;
        }
        const threat = turn.threatened.get(town.id);
        if (threat !== undefined && heroPower(hero) >= threat * 0.6) {
          value += 20000;
        }
      } else if (turn.main !== undefined) {
        // A secondary fetches troops for a main hero far away.
        const m = turn.main;
        const far = chebyshev(m.x, m.y, obj.x, obj.y) > 10;
        if (far) value += armyFv(town.garrison) * 0.6;
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
      if (carried >= Math.max(300, armyFv(m.army) * 0.08)) {
        const near = nextTo(m.x, m.y);
        if (near !== undefined) {
          add({
            key: `meet:${m.id}`,
            x: near.via.x,
            y: near.via.y,
            cost: near.cost,
            value: carried * 1.1,
          });
        }
      }
    }
    // --- Exploration.
    this.exploreTargets(turn, hero, dist, explore, add, guarded);
    // --- Dowse marks to dig.
    const marks = state.magic?.marks?.[String(turn.player)] ?? [];
    for (const [x, y] of marks) {
      if (!diggable(state, x, y)) continue;
      const cost = dist.get(y * w + x);
      if (cost === undefined || cost === 0 || guarded(y * w + x)) continue;
      add({ key: `dig:${x},${y}`, x, y, cost: cost + hero.maxMp, value: 2000 });
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
        if (est === null || !est.win || est.lossShare > (t.maxLoss ?? 0.3)) {
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
    for (const f of frontier) {
      const x = f.i % w;
      const y = (f.i - x) / w;
      const n = this.newCells(turn, x, y, r);
      if (n < MIN_NEW_CELLS) continue;
      const share = hero === turn.main ? 1 : 1.3;
      scored.push({ ...f, value: n * EXPLORE_CELL * explore * share });
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
    const type = objectTypeOf(obj);
    switch (type) {
      case "two-way-waystone":
      case "one-way-waystone":
      case "sanctuary":
      case "sign":
      case "trading-post":
      case "tollhouse":
      case "drill-yard":
      case "roadside-inn":
      case "altar-of-sacrifice":
      case "hermit":
        return 0;
      case "observatory":
        return this.newCells(turn, obj.x, obj.y, 12) * EXPLORE_CELL * explore;
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
