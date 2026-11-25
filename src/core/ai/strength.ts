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
/** Above this ratio a fight is won with small losses, not simulated. */
export const EASY_RATIO = 3;

function enemyHp(side: BattleSide): number {
  return side.stacks.reduce(
    (n, s) => n + s.count * getCreature(s.creature).hp,
    0,
  );
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
  /** Battles simulated since construction (for profiling). */
  simulations = 0;
  /**
   * Simulations still allowed (the AI sets it per decision to bound its
   * time); beyond it close calls get the fast estimate, uncached.
   */
  budget = Infinity;

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
      this.budget <= 0
    ) {
      // Without a resolver (or simulations left) the fast estimate
      // decides; a fast answer for want of budget is not cached.
      const share = ratio >= 1.2 ? Math.min(1, 0.45 / (ratio * ratio)) : 1;
      const fast: FightEstimate = {
        win: ratio >= 1.2,
        lossFv: Math.round(own * share),
        lossShare: share,
        ratio,
        xp: ratio >= 1.2 ? enemyHp(setup.defender) : 0,
        simulated: false,
      };
      if (ratio < EASY_RATIO && this.resolver !== null) return fast;
      est = fast;
    } else {
      this.simulations++;
      this.budget--;
      const r = this.resolver(setup);
      const win = r.winner === "attacker" && r.retreat !== "attacker";
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
      est = {
        win,
        lossFv,
        lossShare: own <= 0 ? 1 : lossFv / own,
        ratio,
        xp,
        simulated: true,
      };
    }
    if (this.cache.size > 4000) this.cache.clear();
    this.cache.set(key, est);
    return est;
  }
}
