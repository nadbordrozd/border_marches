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
 * | Loss share accepted (x)           | 1.3  | 1      | 0.85 |
 * | Edge wanted against a player (+)  | 0.3  | 0      | -0.1 |
 * | First attack on a player (day)    | 22   | 8      | 4    |
 * | Starting resources bonus          | none | none   | +2500 gold, +10 wood, +5 ore, +2 essence |
 *
 * Easy simulates fewer fights (more guesses, more waste), accepts heavier
 * losses, wants a bigger edge before it attacks a player and leaves the
 * players alone for three weeks (it still defends its own towns). Hard
 * simulates more, fights more carefully, attacks players at a smaller
 * edge from day 4 and starts richer.
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
}

export const DIFFICULTY: Readonly<Record<Difficulty, DifficultyParams>> = {
  easy: {
    turnSimMs: 150,
    simsPerTurn: 6,
    simsPerDecision: 2,
    lossScale: 1.3,
    edgeBonus: 0.3,
    aggressionDay: 22,
    startBonus: {},
  },
  normal: {
    turnSimMs: 400,
    simsPerTurn: 16,
    simsPerDecision: 4,
    lossScale: 1,
    edgeBonus: 0,
    aggressionDay: 8,
    startBonus: {},
  },
  hard: {
    turnSimMs: 650,
    simsPerTurn: 24,
    simsPerDecision: 6,
    lossScale: 0.85,
    edgeBonus: -0.1,
    aggressionDay: 4,
    startBonus: { gold: 2500, wood: 10, ore: 5, essence: 2 },
  },
};

/** Display names and one-line descriptions for the setup screen. */
export const DIFFICULTY_INFO: Readonly<
  Record<Difficulty, { name: string; blurb: string }>
> = {
  easy: {
    name: "Easy",
    blurb:
      "Computer players guess more, take sloppier fights and leave you alone for the first three weeks.",
  },
  normal: {
    name: "Normal",
    blurb:
      "Computer players weigh their fights and attack other players from the second week.",
  },
  hard: {
    name: "Hard",
    blurb:
      "Computer players fight carefully, press any advantage from day 4 and start with extra gold and resources.",
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
