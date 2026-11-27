/**
 * Battle AI fast mode (bead bzc.37): the incremental estimate matches the
 * evaluation, choices are deterministic and legal, the battles no human
 * watches use it, and it rehearses far fewer candidates than the full
 * mode (a work count, not the clock: timing is `npm run sim:battles --
 * --mode timing`).
 */
import { describe, expect, it } from "vitest";
import { HEAVY_TIMEOUT } from "../../timeouts.ts";
import {
  UNWATCHED_BATTLE_AI,
  actionError,
  applyAction,
  chooseAiAction,
  createAiMemo,
  createBattle,
  createBattleResolver,
  engineSetupFromGame,
  evaluateFor,
  gameResultFromEngine,
  runAutoBattle,
} from "../../../src/core/battle/index.ts";
import type {
  BattleState,
  BattleSide,
  Hex,
} from "../../../src/core/battle/index.ts";
import { aiRehearsals, placedEstimates } from "../../../src/core/battle/ai.ts";
import type { BattleSetup as GameBattleSetup } from "../../../src/core/game/battle.ts";
import { at, battle, unit } from "./faction-helpers.ts";
import {
  buildArmy,
  buildGuard,
  buildHero,
  gameSetup,
  guardSide,
  heroSide,
} from "../../sim/armies.ts";

type Faction = "humans" | "undead" | "goblins";

function factionSetup(
  a: Faction,
  d: Faction,
  seed: number,
  budget: number,
  level: number,
): GameBattleSetup {
  return gameSetup(
    seed,
    heroSide(
      a,
      buildHero(a, level, seed, "magic"),
      buildArmy(a, budget, seed),
      1,
    ),
    heroSide(
      d,
      buildHero(d, level, seed + 1, "might"),
      buildArmy(d, budget, seed + 1),
      2,
    ),
  );
}

function start(setup: GameBattleSetup): BattleState {
  return createBattle(engineSetupFromGame(setup)).state;
}

function placedAt(state: BattleState, hex: Hex): BattleState {
  const id = state.activeStackId;
  return {
    ...state,
    stacks: state.stacks.map((x) => (x.id === id ? { ...x, hex } : x)),
  };
}

describe("battle AI fast mode: the incremental estimate", () => {
  it("matches the evaluation of the board with the stack placed", () => {
    // Shooters on both sides: standing next to the enemy Longbowmen takes
    // their shot away, and the own Longbowmen shoot from anywhere.
    const s = battle(
      {
        stacks: [
          unit("knight", 4, at(2, 5)),
          unit("longbowman", 12, at(0, 2)),
          unit("squire", 20, at(1, 8)),
        ],
      },
      {
        stacks: [
          unit("longbowman", 10, at(13, 3)),
          unit("ogre", 3, at(12, 6)),
          unit("goblin", 30, at(11, 8)),
        ],
      },
    );
    const side = s.stacks.find((x) => x.id === s.activeStackId)
      ?.side as BattleSide;
    const hexes = [at(3, 5), at(6, 4), at(12, 3), at(11, 6), at(10, 8)];
    const fast = placedEstimates(s, hexes);
    hexes.forEach((h, i) => {
      expect(fast[i]).toBeCloseTo(evaluateFor(placedAt(s, h), side), 6);
    });
  });
});

describe(
  "battle AI fast mode: determinism and legality",
  { timeout: HEAVY_TIMEOUT },
  () => {
    it("the same state always gives the same choice", () => {
      let s = start(factionSetup("humans", "goblins", 42, 8000, 6));
      for (let i = 0; i < 12 && s.winner === null; i++) {
        const a = chooseAiAction(s, { mode: "fast" });
        const clone = JSON.parse(JSON.stringify(s)) as BattleState;
        expect(chooseAiAction(clone, { mode: "fast" })).toEqual(a);
        expect(chooseAiAction(s, { mode: "fast" })).toEqual(a);
        s = applyAction(s, a).state;
      }
    });

    it("auto-battles in fast mode replay identically", () => {
      const setup = engineSetupFromGame(
        factionSetup("undead", "humans", 7, 8000, 6),
      );
      const a = runAutoBattle(setup, { ai: "fast" });
      const b = runAutoBattle(setup, { ai: "fast" });
      expect(a.result).toEqual(b.result);
      expect(a.events).toEqual(b.events);
    });

    it("plays seeded faction and guard battles to the end with legal actions only", () => {
      const factions = ["humans", "undead", "goblins"] as const;
      let battles = 0;
      for (let i = 0; i < 3; i++) {
        const a = factions[i % 3] as Faction;
        const d = factions[(i + 1) % 3] as Faction;
        const seed = 600 + i;
        const setups = [
          factionSetup(a, d, seed, 6000, 6),
          gameSetup(
            seed,
            heroSide(
              a,
              buildHero(a, 6, seed, "magic"),
              buildArmy(a, 6000, seed),
              1,
            ),
            guardSide(buildGuard(3000, seed)),
          ),
        ];
        for (const setup of setups) {
          // As auto-play runs it: one memo for the whole battle.
          const memo = createAiMemo();
          let s = start(setup);
          let n = 0;
          while (s.winner === null) {
            const action = chooseAiAction(s, { mode: "fast", memo });
            expect(actionError(s, action)).toBeNull();
            s = applyAction(s, action).state;
            expect(++n).toBeLessThan(3000);
          }
          battles++;
        }
      }
      expect(battles).toBe(6);
    });
  },
);

describe(
  "battle AI fast mode: which battles use it",
  { timeout: HEAVY_TIMEOUT },
  () => {
    const setup = factionSetup("goblins", "undead", 21, 6000, 6);

    it("battles no human watches (the game's resolver) use the fast mode", () => {
      expect(UNWATCHED_BATTLE_AI).toBe("fast");
      const engine = engineSetupFromGame(setup);
      expect(createBattleResolver()(setup)).toEqual(
        gameResultFromEngine(
          setup,
          runAutoBattle(engine, { ai: "fast" }).result,
        ),
      );
      // A caller can still ask the resolver for the full mode.
      expect(createBattleResolver({ ai: "full" })(setup)).toEqual(
        gameResultFromEngine(setup, runAutoBattle(engine).result),
      );
    });

    it("auto-play without a mode is the full mode (the battle screen's AI)", () => {
      const engine = engineSetupFromGame(setup);
      const played = runAutoBattle(engine, { maxRounds: 2 });
      let s = createBattle(engine).state;
      while (s.winner === null && s.round <= 2) {
        s = applyAction(s, chooseAiAction(s)).state;
      }
      expect(played.state).toEqual(s);
    });
  },
);

describe("battle AI fast mode: work", () => {
  it("rehearses far fewer candidates than the full mode on a large battle", () => {
    // Late armies (seven stacks a side) with late heroes: the same 16
    // decisions (the full mode's choices) searched by both modes.
    let s = start(factionSetup("humans", "undead", 3, 80000, 18));
    expect(s.stacks.length).toBeGreaterThanOrEqual(12);
    const memo = createAiMemo();
    let full = 0;
    let fast = 0;
    for (let i = 0; i < 16 && s.winner === null; i++) {
      let before = aiRehearsals();
      chooseAiAction(s, { mode: "fast", memo });
      fast += aiRehearsals() - before;
      before = aiRehearsals();
      const a = chooseAiAction(s);
      full += aiRehearsals() - before;
      s = applyAction(s, a).state;
    }
    expect(fast).toBeGreaterThan(0);
    // At least half the work saved. (It was a quarter until Share became
    // a single pick in bzc.71: the Friars' Share no longer offers every
    // link x condition pair, so the full mode itself rehearses far less.)
    expect(fast * 2).toBeLessThan(full);
  });
});
