/**
 * Army strength and fight estimates for the adventure AI (bead bzc.19).
 *
 * The fast estimate compares fight values (GAME_DESIGN 8.2) with a small
 * factor for hero Attack and Defense and the fort's Defense bonus. Close
 * calls are fought for real on a copy: the battle the hero would start now
 * is set up exactly as the rules would (battleSetup) and auto-resolved by
 * the game's resolver, so the estimate knows the survivors.
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

/**
 * Estimates fights for one AI. Results are cached by the two armies (not
 * the battle seed), so a fight is simulated at most once while neither
 * side changes; {@link FightOracle.clear} empties the cache.
 */
export class FightOracle {
  private readonly cache = new Map<string, FightEstimate>();
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

  constructor(private readonly resolver: BattleResolver | null) {}

  clear(): void {
    this.cache.clear();
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
    if (own <= 0 || ratio < HOPELESS_RATIO) {
      est = {
        win: false,
        lossFv: own,
        lossShare: 1,
        ratio,
        xp: 0,
        simulated: false,
      };
    } else if (
      ratio >= EASY_RATIO ||
      this.resolver === null ||
      this.budget <= 0 ||
      predictedMs(setup) > this.msBudget
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
        predictedMs(setup) <= this.maxSimMs &&
        (ratio < CLOSE_RATIO || suspect);
      const fast: FightEstimate = {
        win: ratio >= 1.2 && !deferred,
        lossFv: Math.round(own * share),
        lossShare: share,
        ratio,
        xp: ratio >= 1.2 ? enemyHp(setup.defender) : 0,
        simulated: false,
      };
      if (ratio < EASY_RATIO && this.resolver !== null) return fast;
      est = fast;
    } else {
      est = this.half.get(key) ?? this.simulate(setup, own, ratio, "a");
      // A won fight is fought again with another seed and the worse
      // outcome counts: outcomes can be all or nothing (a stack the
      // attacker cannot finish holds out to the round limit), and one
      // lucky roll must not risk the army. Without the budget for the
      // second, the first is kept and the fight waits (not won yet).
      if (est.win) {
        if (this.budget > 0 && predictedMs(setup) <= this.msBudget) {
          this.half.delete(key);
          const again = this.simulate(setup, own, ratio, "b");
          if (!again.win || again.lossFv > est.lossFv) est = again;
        } else {
          if (this.half.size > 500) this.half.clear();
          this.half.set(key, est);
          return { ...est, win: false, lossFv: own, lossShare: 1 };
        }
      }
    }
    if (this.cache.size > 4000) this.cache.clear();
    this.cache.set(key, est);
    return est;
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
    const cost = predictedMs(setup);
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
