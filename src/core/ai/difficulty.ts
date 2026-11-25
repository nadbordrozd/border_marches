/**
 * The computer players' difficulty (AI iteration 3, bead bzc.23): Easy,
 * Normal (the default) and Hard scale a few of the adventure AI's
 * parameters, and Hard alone gives the computer players a small head
 * start in resources. Chosen in the new-game setup and kept in the state
 * (`GameState.difficulty`, absent in older saves: normal).
 *
 * What each level changes (docs/design/AI.md "Difficulty"):
 *
 * | Parameter                         | Easy | Normal | Hard |
 * | --------------------------------- | ---- | ------ | ---- |
 * | Simulation budget per turn (ms)   | 150  | 400    | 650  |
 * | Simulated battles per turn        | 6    | 16     | 24   |
 * | Loss share accepted (x)           | 1.3  | 1      | 1    |
 * | Edge wanted against a player (+)  | 0.3  | 0      | -0.1 |
 * | First attack on a player (day)    | 29   | 8      | 4    |
 * | Home guard (x)                    | 2    | 1      | 0.8  |
 * | Builds per town                   | every other day | daily | daily |
 * | Third hero (day, gold over hire)  | never | 10, 6000 | 5, 2000 |
 * | Fourth hero (day, gold over hire) | never | 21, 15000 | 14, 8000 |
 * | Knows where rival towns are       | no   | no     | yes (explores toward them) |
 * | Starting resources bonus          | none | none   | +5000 gold, +15 wood, +10 ore, +4 essence |
 *
 * Easy (iteration 4: slower growth, later and weaker attacks) simulates
 * fewer fights (more guesses, more waste), accepts heavier losses, wants
 * a bigger edge before it attacks a player, leaves the players alone for
 * four weeks (it still defends its own towns), builds every other day,
 * keeps two heroes and twice the home guard. Hard simulates more,
 * attacks players at a smaller edge from day 4, hires its third and
 * fourth heroes early, keeps a smaller home guard and starts twice as
 * rich as in iteration 3 (its 0.85 loss share of iteration 3 made it
 * wait longer than Normal before taking a passive player's capital).
 */
import type { Resources } from "../../data/types.ts";
import type { GameState } from "../game/index.ts";

export type Difficulty = "easy" | "normal" | "hard";

export const DIFFICULTIES: readonly Difficulty[] = ["easy", "normal", "hard"];

export interface DifficultyParams {
  /** Predicted milliseconds of simulated battles per turn (fast mode). */
  turnSimMs: number;
  /** Simulated battles per turn. */
  simsPerTurn: number;
  /** Simulated battles per decision. */
  simsPerDecision: number;
  /** Multiplies every loss share the AI accepts in a fight. */
  lossScale: number;
  /** Added to the fight-value edge wanted against a rival player. */
  edgeBonus: number;
  /**
   * The first day the AI attacks another player's heroes or towns
   * (defending its own towns and retaking a lost one are always allowed).
   */
  aggressionDay: number;
  /** Added to each computer player's resources at the start. */
  startBonus: Partial<Resources>;
  /**
   * Multiplies the guard a town keeps home (iteration 4): Easy leaves
   * more at home, so its main hero grows and attacks with less.
   */
  guardScale: number;
  /** A town builds at most every this many days (Easy: every other day). */
  buildEvery: number;
  /**
   * When a third and fourth hero are hired ([day, gold above the hire
   * cost]); null: never (Easy keeps two).
   */
  thirdHero: readonly [number, number] | null;
  fourthHero: readonly [number, number] | null;
  /**
   * Knows where the rivals' towns are (Hard, iteration 4): exploration
   * leans toward those it has not seen from its first attack day.
   */
  scentTowns: boolean;
}

export const DIFFICULTY: Readonly<Record<Difficulty, DifficultyParams>> = {
  easy: {
    turnSimMs: 150,
    simsPerTurn: 6,
    simsPerDecision: 2,
    lossScale: 1.3,
    edgeBonus: 0.3,
    aggressionDay: 29,
    startBonus: {},
    guardScale: 2,
    buildEvery: 2,
    thirdHero: null,
    fourthHero: null,
    scentTowns: false,
  },
  normal: {
    turnSimMs: 400,
    simsPerTurn: 16,
    simsPerDecision: 4,
    lossScale: 1,
    edgeBonus: 0,
    aggressionDay: 8,
    startBonus: {},
    guardScale: 1,
    buildEvery: 1,
    thirdHero: [10, 6000],
    fourthHero: [21, 15000],
    scentTowns: false,
  },
  hard: {
    turnSimMs: 650,
    simsPerTurn: 24,
    simsPerDecision: 6,
    lossScale: 1,
    edgeBonus: -0.1,
    aggressionDay: 4,
    startBonus: { gold: 5000, wood: 15, ore: 10, essence: 4 },
    guardScale: 0.8,
    buildEvery: 1,
    thirdHero: [5, 2000],
    fourthHero: [14, 8000],
    scentTowns: true,
  },
};

/** Display names and one-line descriptions for the setup screen. */
export const DIFFICULTY_INFO: Readonly<
  Record<Difficulty, { name: string; blurb: string }>
> = {
  easy: {
    name: "Easy",
    blurb:
      "Computer players build slower, keep two heroes and more troops at home, take sloppier fights and leave you alone for the first four weeks.",
  },
  normal: {
    name: "Normal",
    blurb:
      "Computer players weigh their fights and attack other players from the second week.",
  },
  hard: {
    name: "Hard",
    blurb:
      "Computer players start richer, hire more heroes early, keep less at home and press any advantage from day 4.",
  },
};

export function isDifficulty(value: unknown): value is Difficulty {
  return value === "easy" || value === "normal" || value === "hard";
}

/** The state's difficulty (normal when absent). */
export function difficultyOf(state: GameState): Difficulty {
  return isDifficulty(state.difficulty) ? state.difficulty : "normal";
}

/**
 * Sets the game's difficulty and gives each computer player its starting
 * bonus (Hard only). `skip` lists players that get no bonus (the match
 * runner's passive "human"). Returns a new state.
 */
export function applyDifficulty(
  state: GameState,
  difficulty: Difficulty,
  skip: readonly number[] = [],
): GameState {
  const bonus = DIFFICULTY[difficulty].startBonus;
  return {
    ...state,
    difficulty,
    players: state.players.map((p) => {
      if (p.kind !== "ai" || skip.includes(p.id)) return p;
      const resources = { ...p.resources };
      for (const [r, n] of Object.entries(bonus) as Array<
        [keyof Resources, number]
      >) {
        resources[r] += n;
      }
      return { ...p, resources };
    }),
  };
}
