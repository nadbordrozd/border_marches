/**
 * Army strength and fight estimates for the adventure AI (bead bzc.19).
 *
 * The fast estimate compares fight values (GAME_DESIGN 8.2) with a small
 * factor for hero Attack and Defense and the fort's Defense bonus. Close
 * calls are fought for real on a copy: the battle the hero would start now
 * is set up exactly as the rules would (battleSetup) and auto-resolved by
 * the game's resolver, so the estimate knows the survivors. That resolver
 * plays the battle AI's fast mode (UNWATCHED_BATTLE_AI in
 * core/battle/resolver.ts, bead bzc.37); {@link predictedMs} still counts
 * in the full mode's milliseconds, so the budgets are unchanged.
 */
import { getCreature } from "../../data/creatures.ts";
import { deriveSeed } from "../rng.ts";
import {
  battleSetup,
  heroStats,
  type ArmySlots,
  type BattleResolver,
  type BattleSetup,
  type BattleSide,
  type GameState,
  type HeroState,
  type PendingBattle,
} from "../game/index.ts";

/** Fight value of `count` creatures. */
export function stackFv(creature: string, count: number): number {
  return count * getCreature(creature).fightValue;
}

/** Fight value of an army. */
export function armyFv(army: ArmySlots): number {
  let fv = 0;
  for (const s of army) if (s !== null) fv += stackFv(s.creature, s.count);
  return fv;
}

/** Multiplier for a hero's Attack and Defense (each point about 3%). */
export function statFactor(attack: number, defense: number): number {
  return 1 + 0.03 * (attack + defense);
}

/** A hero's army fight value scaled by its Attack and Defense. */
export function heroPower(hero: HeroState): number {
  const st = heroStats(hero);
  return armyFv(hero.army) * statFactor(st.attack, st.defense);
}

/** Strength of one battle side (fast estimate). */
export function sidePower(side: BattleSide): number {
  let fv = 0;
  for (const s of side.stacks) fv += stackFv(s.creature, s.count);
  const hero =
    side.hero === null ? 1 : statFactor(side.hero.attack, side.hero.defense);
  return fv * hero * (1 + 0.05 * side.defenseBonus);
}

export interface FightEstimate {
  /** The attacking hero is expected to win. */
  win: boolean;
  /** Fight value the attacker loses (all of it on a loss). */
  lossFv: number;
  /** lossFv as a share of the attacker's fight value, 0..1. */
  lossShare: number;
  /** Attacker strength over defender strength (fast estimate). */
  ratio: number;
  /** Experience the hero gains on a win (HP of the enemies killed). */
  xp: number;
  /** Whether a real battle was simulated. */
  simulated: boolean;
}

/** Below this strength ratio a fight is lost without simulating. */
export const HOPELESS_RATIO = 0.8;
/**
 * Above this ratio a fight is won with small losses, not simulated.
 * Fight values can be far off (before the 15-round limit was adjudicated
 * by fight value, bead bzc.24, 33 bellhops beat 72 undead troops at a
 * ratio of 6.1 in 19 seeds of 20), so fights up to this ratio are
 * simulated while the time budget lasts (iteration 1, bead bzc.21; it
 * was 3).
 */
export const EASY_RATIO = 6;
/**
 * Below this ratio an unsimulated fight waits for the budget; above it a
 * guess (losses counted double) will do unless its creatures are suspect.
 */
export const CLOSE_RATIO = 3;

/** Reads a monotonic clock where one exists (Node, browsers), else 0. */
export function nowMs(): number {
  const g = globalThis as { performance?: { now(): number } };
  return g.performance?.now() ?? 0;
}

function enemyHp(side: BattleSide): number {
  return side.stacks.reduce(
    (n, s) => n + s.count * getCreature(s.creature).hp,
    0,
  );
}

/**
 * Predicted milliseconds of one simulated battle: the battle AI's cost
 * grows with the square of the stacks on the field (measured on M maps,
 * about 0.7-1 ms per stack squared and round, 6 rounds typical).
 */
export function predictedMs(setup: BattleSetup): number {
  const n = setup.attacker.stacks.length + setup.defender.stacks.length;
  return 5 * n * n;
}

/**
 * The fight's family (iteration 2, bead bzc.22): what stays the same while
 * the armies grow or shrink. The defender's creature types and fort
 * bonus, and the attacker's main faction (of its lead stack) and ranged
 * share in quarters. Fights of one family differ mainly by the strength
 * ratio, so a result seen at one ratio predicts others (see
 * {@link FightOracle}). Defenders with a hero are never grouped (spells,
 * artifacts and skills differ).
 */
export function familyKey(setup: BattleSetup): string | null {
  if (setup.defender.hero !== null) return null;
  const att = setup.attacker.stacks;
  if (att.length === 0) return null;
  let lead = "";
  let leadFv = -1;
  let own = 0;
  let ranged = 0;
  for (const s of att) {
    const def = getCreature(s.creature);
    const fv = s.count * def.fightValue;
    own += fv;
    if (def.shots > 0) ranged += fv;
    if (fv > leadFv) {
      leadFv = fv;
      lead = def.faction;
    }
  }
  const types = [...new Set(setup.defender.stacks.map((s) => s.creature))]
    .sort()
    .join(",");
  const rangedQ = own <= 0 ? 0 : Math.round((ranged / own) * 4);
  return [
    setup.battle.kind,
    types,
    setup.defender.defenseBonus,
    lead,
    rangedQ,
  ].join("|");
}

/** One worst-of-two simulated outcome of a family, at its ratio. */
interface Observation {
  ratio: number;
  win: boolean;
  lossShare: number;
}

/**
 * Losses of a won fight shrink with the square of the strength advantage
 * (the fast estimate's model); a result seen at `seenRatio` scales to
 * `ratio` by this factor.
 */
export function scaleLoss(
  lossShare: number,
  seenRatio: number,
  ratio: number,
): number {
  if (ratio <= 0) return 1;
  return Math.min(1, lossShare * (seenRatio / ratio) ** 2);
}

/**
 * Predicts a fight from its family's observations, or null when they do
 * not bracket `ratio`: a loss seen at this ratio or above means a loss; a
 * win seen at this ratio or below (the closest one) means a win, its
 * losses scaled by the ratio. A win seen slightly above this ratio (within
 * NEAR_MISS) also counts, its scaled losses padded by a quarter. A loss
 * between the win and this ratio (a stubborn outlier) blocks the guess.
 */
export function inferFromFamily(
  obs: readonly Observation[],
  ratio: number,
): { win: boolean; lossShare: number; seenRatio: number } | null {
  for (const o of obs) {
    if (!o.win && o.ratio >= ratio * 0.97) {
      return { win: false, lossShare: 1, seenRatio: o.ratio };
    }
  }
  let best: Observation | undefined;
  for (const o of obs) {
    if (!o.win || o.ratio > ratio) continue;
    if (best === undefined || o.ratio > best.ratio) best = o;
  }
  if (best !== undefined) {
    const b = best;
    const blocked = obs.some(
      (o) => !o.win && o.ratio >= b.ratio && o.ratio <= ratio,
    );
    if (!blocked) {
      return {
        win: true,
        lossShare: scaleLoss(b.lossShare, b.ratio, ratio),
        seenRatio: b.ratio,
      };
    }
  }
  // A win a little above this ratio: the losses grow, padded.
  let above: Observation | undefined;
  for (const o of obs) {
    if (!o.win || o.ratio <= ratio || o.ratio > ratio / NEAR_MISS) continue;
    if (above === undefined || o.ratio < above.ratio) above = o;
  }
  if (above !== undefined) {
    const share = scaleLoss(above.lossShare, above.ratio, ratio) * 1.25;
    if (share <= 0.5) {
      return { win: true, lossShare: share, seenRatio: above.ratio };
    }
  }
  return null;
}

/** A family win seen this much above a ratio still predicts it. */
export const NEAR_MISS = 0.9;

function setupKey(setup: BattleSetup): string {
  const side = (s: BattleSide): unknown[] => [
    s.stacks.map((x) => `${x.creature}:${x.count}`).join(","),
    s.hero === null ? "" : `${s.hero.id}:${s.hero.attack}:${s.hero.defense}`,
    s.defenseBonus,
  ];
  return JSON.stringify([
    setup.battle.kind,
    setup.battle.objectId,
    side(setup.attacker),
    side(setup.defender),
  ]);
}

/** Options of a {@link FightOracle}. */
export interface OracleOptions {
  /**
   * Predicted milliseconds of simulating `setup` with the oracle's
   * resolver (the budget's unit; default {@link predictedMs}). A faster
   * resolver (bead bzc.37's battle-AI mode) passes its own model and the
   * same turn budget then buys more simulations, with no other change.
   */
  costOf?: (setup: BattleSetup) => number;
  /** Predict fights from their family's earlier results (default true). */
  families?: boolean;
}

/**
 * Estimates fights for one AI. Results are cached by the two armies (not
 * the battle seed), so a fight is simulated at most once while neither
 * side changes; {@link FightOracle.clear} empties the cache.
 *
 * Iteration 2 (bead bzc.22): every full (worst-of-two) simulated result is
 * also kept per fight family ({@link familyKey}: the guard's creature
 * types and the attacker's lead creature, not the counts), and a later
 * fight of the same family is predicted from it, losses scaled by the
 * strength ratio ({@link inferFromFamily}), without a simulation. Army
 * changes (a recruit, a lost stack, a level) no longer reset what the AI
 * knows about a guard type.
 */
export class FightOracle {
  private readonly cache = new Map<string, FightEstimate>();
  /** Family -> its simulated outcomes (newest last). */
  private readonly families = new Map<string, Observation[]>();
  /** Estimates answered from a family instead of a simulation. */
  inferred = 0;
  /** Fights put off for want of budget (profiling). */
  deferrals = 0;
  private readonly costOf: (setup: BattleSetup) => number;
  private readonly useFamilies: boolean;
  /** Creatures that held out in a simulation against a far bigger army. */
  private readonly stubborn = new Set<string>();
  /** Won first simulations still waiting for their second. */
  private readonly half = new Map<string, FightEstimate>();
  /** Battles simulated since construction (for profiling). */
  simulations = 0;
  /**
   * Simulations still allowed (the AI sets it per decision to bound its
   * time); beyond it close calls get the fast estimate, uncached.
   */
  budget = Infinity;
  /** Milliseconds spent simulating since construction (profiling). */
  simMs = 0;
  /** Predicted milliseconds of all simulations so far (the budget's unit). */
  simCost = 0;
  /**
   * Predicted milliseconds of simulation still allowed (the AI sets it
   * per decision); a battle predicted to take longer gets the fast
   * estimate. Predictions, not the clock, keep matches deterministic.
   */
  msBudget = Infinity;
  /**
   * The longest simulation a turn can afford (the AI's turn budget): a
   * fight predicted within it is deferred, not guessed, when this turn's
   * budget is spent.
   */
  maxSimMs = 0;

  constructor(
    private readonly resolver: BattleResolver | null,
    options: OracleOptions = {},
  ) {
    this.costOf = options.costOf ?? predictedMs;
    this.useFamilies = options.families ?? true;
  }

  clear(): void {
    this.cache.clear();
    this.families.clear();
  }

  /** Predicted milliseconds of simulating `setup` (the budget's unit). */
  cost(setup: BattleSetup): number {
    return this.costOf(setup);
  }

  private remember(family: string | null, est: FightEstimate): void {
    if (family === null || !est.simulated) return;
    let obs = this.families.get(family);
    if (obs === undefined) {
      if (this.families.size > 2000) this.families.clear();
      obs = [];
      this.families.set(family, obs);
    }
    obs.push({ ratio: est.ratio, win: est.win, lossShare: est.lossShare });
    if (obs.length > 12) obs.shift();
  }

  /** The battle `battle` would be now (null when it cannot start). */
  setupOf(state: GameState, battle: PendingBattle): BattleSetup | null {
    return battleSetup({ ...state, pendingBattle: battle });
  }

  estimate(state: GameState, battle: PendingBattle): FightEstimate | null {
    const setup = this.setupOf(state, battle);
    if (setup === null) return null;
    return this.estimateSetup(setup);
  }

  estimateSetup(setup: BattleSetup): FightEstimate {
    const key = setupKey(setup);
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const own = setup.attacker.stacks.reduce(
      (n, s) => n + stackFv(s.creature, s.count),
      0,
    );
    const ours = sidePower(setup.attacker);
    const theirs = sidePower(setup.defender);
    const ratio = theirs <= 0 ? 99 : ours / theirs;
    let est: FightEstimate;
    const hopeless = own <= 0 || ratio < HOPELESS_RATIO;
    const family = hopeless ? null : this.fromFamily(setup, own, ratio);
    if (hopeless) {
      est = {
        win: false,
        lossFv: own,
        lossShare: 1,
        ratio,
        xp: 0,
        simulated: false,
      };
    } else if (family !== null) {
      est = family;
    } else if (
      ratio >= EASY_RATIO ||
      this.resolver === null ||
      this.budget <= 0 ||
      this.costOf(setup) > this.msBudget
    ) {
      // Without a resolver (or simulations left) the fast estimate
      // decides; a fast answer for want of budget is not cached. Below
      // EASY_RATIO it is a guess where fight values can be off, so its
      // losses count double.
      const unsure = ratio < EASY_RATIO && this.resolver !== null ? 2 : 1;
      const share =
        ratio >= 1.2 ? Math.min(1, (unsure * 0.45) / (ratio * ratio)) : 1;
      // A close fight (or one against creatures a simulation has seen
      // hold out against a much bigger army) small enough to simulate
      // within a turn's budget waits for a turn with budget left instead
      // of being taken on a guess: a budget-starved guess sent whole
      // armies into stacks the auto-battle cannot finish. Bigger fights,
      // and clear ones against creatures not suspected, take the guess.
      const suspect = setup.defender.stacks.some((s) =>
        this.stubborn.has(s.creature),
      );
      const deferred =
        unsure === 2 &&
        this.costOf(setup) <= this.maxSimMs &&
        (ratio < CLOSE_RATIO || suspect);
      const fast: FightEstimate = {
        win: ratio >= 1.2 && !deferred,
        lossFv: Math.round(own * share),
        lossShare: share,
        ratio,
        xp: ratio >= 1.2 ? enemyHp(setup.defender) : 0,
        simulated: false,
      };
      if (deferred) this.deferrals++;
      if (ratio < EASY_RATIO && this.resolver !== null) return fast;
      est = fast;
    } else {
      est = this.half.get(key) ?? this.simulate(setup, own, ratio, "a");
      if (!est.win) this.remember(familyKey(setup), est);
      // A won fight is fought again with another seed and the worse
      // outcome counts: outcomes can be all or nothing (a stack the
      // attacker cannot finish holds out to the round limit), and one
      // lucky roll must not risk the army. Without the budget for the
      // second, the first is kept and the fight waits (not won yet).
      if (est.win) {
        if (this.budget > 0 && this.costOf(setup) <= this.msBudget) {
          this.half.delete(key);
          const again = this.simulate(setup, own, ratio, "b");
          if (!again.win || again.lossFv > est.lossFv) est = again;
          this.remember(familyKey(setup), est);
        } else {
          if (this.half.size > 500) this.half.clear();
          this.half.set(key, est);
          this.deferrals++;
          return { ...est, win: false, lossFv: own, lossShare: 1 };
        }
      }
    }
    if (this.cache.size > 4000) this.cache.clear();
    this.cache.set(key, est);
    return est;
  }

  /** A prediction from the fight's family, or null (see inferFromFamily). */
  private fromFamily(
    setup: BattleSetup,
    own: number,
    ratio: number,
  ): FightEstimate | null {
    if (!this.useFamilies || this.resolver === null) return null;
    if (ratio >= EASY_RATIO) return null;
    const family = familyKey(setup);
    if (family === null) return null;
    const obs = this.families.get(family);
    if (obs === undefined || obs.length === 0) return null;
    const guess = inferFromFamily(obs, ratio);
    if (guess === null) return null;
    this.inferred++;
    return {
      win: guess.win,
      lossFv: guess.win ? Math.round(own * guess.lossShare) : own,
      lossShare: guess.lossShare,
      ratio,
      xp: guess.win ? enemyHp(setup.defender) : 0,
      simulated: false,
    };
  }

  /**
   * One simulated battle on a copy. The seed is not the one the real
   * battle will use (the AI must not foresee the dice), so the estimate
   * is one plausible outcome.
   */
  private simulate(
    setup: BattleSetup,
    own: number,
    ratio: number,
    salt: string,
  ): FightEstimate {
    const resolver = this.resolver;
    if (resolver === null) throw new Error("no resolver");
    this.simulations++;
    this.budget--;
    const t0 = nowMs();
    const r = resolver({ ...setup, seed: deriveSeed(setup.seed, "ai", salt) });
    this.simMs += nowMs() - t0;
    const cost = this.costOf(setup);
    this.simCost += cost;
    this.msBudget -= cost;
    const win = r.winner === "attacker" && r.retreat !== "attacker";
    // Lost (or undecided) at twice the defender's fight value: its
    // creatures are suspected of holding out (always simulated from now).
    if (!win && ratio >= 2) {
      for (const s of setup.defender.stacks) this.stubborn.add(s.creature);
    }
    let lossFv = 0;
    setup.attacker.stacks.forEach((s, i) => {
      const left = win ? (r.attacker[i] ?? 0) : 0;
      lossFv += stackFv(s.creature, s.count - left);
    });
    let xp = 0;
    if (win) {
      setup.defender.stacks.forEach((s, i) => {
        xp += (s.count - (r.defender[i] ?? 0)) * getCreature(s.creature).hp;
      });
    }
    return {
      win,
      lossFv,
      lossShare: own <= 0 ? 1 : lossFv / own,
      ratio,
      xp,
      simulated: true,
    };
  }
}
