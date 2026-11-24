/**
 * Adapter between the adventure layer's battle seam (src/core/game/battle.ts)
 * and this engine.
 *
 * - {@link engineSetupFromGame}: game setup -> engine setup. Stack i of a side
 *   becomes slot i, id "a<i>" / "d<i>", deployed by the 9.1 table.
 * - {@link gameResultFromEngine}: engine result -> survivors per input stack.
 * - {@link createBattleResolver}: auto-combat (AI on both sides) as a
 *   BattleResolver.
 *
 * Round limit (RULES_V2 1.12): the engine ends a battle after round 30 and
 * **the defender wins**; the attacker's (the hero's) stacks are reported as
 * 0 survivors: the hero failed to break the defence. A retreat is a loss
 * and the retreating army is lost (0 survivors).
 */

import { getCreature } from "../../data/creatures.ts";
import type { CreatureDef } from "../../data/types.ts";
import type {
  BattleResolver,
  BattleResult as GameBattleResult,
  BattleSetup as GameBattleSetup,
  BattleSide as GameBattleSide,
} from "../game/battle.ts";
import { runAutoBattle } from "./auto.ts";
import type { AutoBattleOptions, BattleResult } from "./auto.ts";
import {
  heroAbilityIds,
  heroSpeedBonus,
  startRuleRefs,
} from "./hero-effects.ts";
import type {
  BattleArmySetup,
  BattleCreatureStats,
  BattleSetup,
  BattleSide,
} from "./types.ts";

/** Engine stats for a creature record of src/data. */
export function battleStatsFromCreature(def: CreatureDef): BattleCreatureStats {
  return {
    id: def.id,
    name: def.name,
    tier: def.tier,
    hp: def.hp,
    attack: def.attack,
    defense: def.defense,
    damage: def.damage,
    speed: def.speed,
    shots: def.shots,
    abilities: def.ability === null ? [] : [def.ability],
  };
}

/** Hero ability ids of one game side (core/battle/hero-effects.ts). */
function sideAbilities(side: GameBattleSide, which: BattleSide): string[] {
  const p = side.hero?.profile;
  return p === undefined ? [] : heroAbilityIds(which, p.strikes, p.stacks);
}

function armyFromGame(
  side: GameBattleSide,
  heroAbilities: readonly string[],
): BattleArmySetup {
  const profile = side.hero?.profile;
  return {
    hero: side.hero
      ? {
          attack: side.hero.attack,
          defense: side.hero.defense,
          ...(profile !== undefined ? { itemActs: profile.itemActs } : {}),
        }
      : null,
    defenseBonus: side.defenseBonus,
    ...(profile !== undefined
      ? {
          morale: profile.morale,
          luck: profile.luck,
          startRules: startRuleRefs(profile.startRules),
        }
      : {}),
    stacks: side.stacks.map((s, slot) => {
      const base = battleStatsFromCreature(getCreature(s.creature));
      const speed = heroSpeedBonus(profile?.stacks ?? [], s.creature);
      return {
        creature: {
          ...base,
          speed: base.speed + speed,
          abilities: [...base.abilities, ...heroAbilities],
        },
        count: s.count,
        slot,
      };
    }),
  };
}

/**
 * The engine setup for a game battle (the hero is always the attacker).
 * Both heroes' modifier abilities ride on every stack (each applies only
 * for the side it names), so a stack that changes sides changes heroes.
 */
export function engineSetupFromGame(setup: GameBattleSetup): BattleSetup {
  const abilities = [
    ...sideAbilities(setup.attacker, "attacker"),
    ...sideAbilities(setup.defender, "defender"),
  ];
  return {
    seed: setup.seed,
    attacker: armyFromGame(setup.attacker, abilities),
    defender: armyFromGame(setup.defender, abilities),
  };
}

/**
 * Survivors per input stack, as applyBattleResult expects. A round-limit
 * result becomes a defender win with no attacker survivors.
 */
export function gameResultFromEngine(
  setup: GameBattleSetup,
  result: BattleResult,
): GameBattleResult {
  const survivors = (prefix: "a" | "d", n: number): number[] =>
    Array.from({ length: n }, (_, i) => {
      const s = result.stacks.find((x) => x.id === `${prefix}${i}`);
      return s?.count ?? 0;
    });
  const attacker = survivors("a", setup.attacker.stacks.length);
  const defender = survivors("d", setup.defender.stacks.length);
  if (result.winner === null || result.reason === "roundLimit") {
    return { winner: "defender", attacker: attacker.map(() => 0), defender };
  }
  if (result.reason === "retreat") {
    return result.winner === "defender"
      ? { winner: "defender", attacker: attacker.map(() => 0), defender }
      : { winner: "attacker", attacker, defender: defender.map(() => 0) };
  }
  return { winner: result.winner, attacker, defender };
}

/** Auto-combat for the adventure layer: the AI plays both sides. */
export function createBattleResolver(
  options: AutoBattleOptions = {},
): BattleResolver {
  return (setup) =>
    gameResultFromEngine(
      setup,
      runAutoBattle(engineSetupFromGame(setup), options).result,
    );
}
