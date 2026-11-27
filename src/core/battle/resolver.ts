/**
 * Adapter between the adventure layer's battle seam (src/core/game/battle.ts)
 * and this engine.
 *
 * - {@link engineSetupFromGame}: game setup -> engine setup. Stack i of a side
 *   becomes slot i, id "a<i>" / "d<i>", deployed by the 9.1 table.
 * - {@link gameResultFromEngine}: engine result -> survivors per input stack.
 * - {@link createBattleResolver}: auto-combat (AI on both sides) as a
 *   BattleResolver, for battles no human watches (the battle AI's fast
 *   mode, {@link UNWATCHED_BATTLE_AI}).
 *
 * Round limit (RULES_V2 1.12): the engine ends a battle after round 30 and
 * **the defender wins**; the attacker's (the hero's) stacks are reported as
 * 0 survivors: the hero failed to break the defence. A retreat is a loss
 * and the retreating army is lost (0 survivors).
 */

import { creatureAbilities, getCreature } from "../../data/creatures.ts";
import { birthrightOf } from "../../data/factions.ts";
import { ROUND_TABLE_MORALE, SPECIALS } from "../../data/factionTowns.ts";
import type { CreatureDef } from "../../data/types.ts";
import { GET_UP_HALF } from "./resolve.ts";
import type {
  BattleResolver,
  BattleResult as GameBattleResult,
  BattleSetup as GameBattleSetup,
  BattleSide as GameBattleSide,
} from "../game/battle.ts";
import type { HeroBattleProfile } from "../game/battle-profile.ts";
import { runAutoBattle } from "./auto.ts";
import "./stray-abilities.ts";
import "./sea-abilities.ts";
import type { AutoBattleOptions, BattleResult } from "./auto.ts";
import type { AiMode } from "./ai.ts";
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
  MagicSetup,
  School,
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
    abilities: [...creatureAbilities(def)],
    ...(def.tags
      ? {
          tags: {
            remains: def.tags.remains,
            cannotBear: [...def.tags.cannotBear],
          },
        }
      : {}),
    ...(def.caster
      ? { caster: { ...def.caster, pages: [...def.caster.pages] } }
      : {}),
  };
}

/** Side flags the battle content reads, from the player's specials. */
function battleFlags(specials: readonly string[]): string[] {
  const out: string[] = [];
  if (specials.includes(SPECIALS.chapelOfOaths)) out.push("chapel-of-oaths");
  if (specials.includes(SPECIALS.familyCrypt)) out.push(GET_UP_HALF);
  if (specials.includes(SPECIALS.launchRamp)) out.push("launch-ramp");
  return out;
}

/**
 * The hero's book for the engine (RULES_V2 2.3 to 2.5) from its battle
 * profile: pages, scrolls, mana, per-school page Power, scroll Power, the
 * mana cost percentage, the Fuel and Echo switches and the casting vows.
 */
export function magicFromProfile(p: HeroBattleProfile): MagicSetup {
  const neverCast: School[] = [];
  let noCastRounds: MagicSetup["noCastRounds"];
  for (const r of p.restrictions) {
    if (r.kind === "never-cast") neverCast.push(r.school);
    if (r.kind === "no-cast-rounds") noCastRounds = r.rounds;
  }
  return {
    power: p.power,
    mana: p.mana,
    schoolRanks: p.schoolRanks,
    pages: p.pages,
    scrolls: p.scrolls,
    pagePower: p.pagePower,
    scrollPower: p.scrollPower,
    costPercent: Math.max(1, 100 + p.manaCostPercent),
    fuelMax: p.switches.includes("fuel-uses-plus-1") ? 2 : 1,
    echoRounds: p.switches.includes("echo-adds-2") ? 2 : 1,
    neverCast,
    ...(noCastRounds !== undefined ? { noCastRounds } : {}),
    ...(Object.keys(p.spellPower ?? {}).length > 0
      ? { spellPower: p.spellPower }
      : {}),
    ...((p.startSpent ?? []).length > 0 ? { startSpent: p.startSpent } : {}),
    ...(p.unspentPage !== undefined ? { unspentPage: p.unspentPage } : {}),
  };
}

/** Hero ability ids of one game side (core/battle/hero-effects.ts). */
function sideAbilities(side: GameBattleSide, which: BattleSide): string[] {
  const p = side.hero?.profile;
  return p === undefined ? [] : heroAbilityIds(which, p.strikes, p.stacks);
}

/**
 * One side's engine army: the hero's profile (modifiers, start rules,
 * item acts, Morale, Luck, Command), the faction's birthright for its
 * natives (RULES_V2 3.8), the player's Drills on their creatures and the
 * town specials as battle flags.
 */
function armyFromGame(
  side: GameBattleSide,
  heroAbilities: readonly string[],
): BattleArmySetup {
  const profile = side.hero?.profile;
  const faction = side.faction ?? null;
  const birthright = faction === null ? undefined : birthrightOf(faction);
  const specials = side.specials ?? [];
  const drills = side.drills ?? [];
  const flinger = specials.includes(SPECIALS.greatFlinger);
  // Candy Kingdom specials ride on the natives as abilities (FACTION_CANDY
  // 9): the Larder eats sweets, The Four O'Clock starts them Hastened; so
  // does the Deepforge's Great Boiler (FACTION_DWARVES 9): Steam 1.
  const nativeExtras = [
    ...(flinger ? ["cannonball"] : []),
    ...(specials.includes(SPECIALS.larder) ? ["larder"] : []),
    ...(specials.includes(SPECIALS.fourOClock) ? ["the-four-oclock"] : []),
    ...(specials.includes(SPECIALS.greatBoiler) ? ["the-great-boiler"] : []),
  ];
  const roundTable =
    side.hero !== null && specials.includes(SPECIALS.roundTable)
      ? ROUND_TABLE_MORALE
      : 0;
  const morale = (profile?.morale ?? 0) + roundTable;
  const startRules = [
    ...(profile !== undefined ? startRuleRefs(profile.startRules) : []),
    // The birthright's deployment rule runs after artifacts' (FACTION_HUMANS 3).
    ...(birthright?.startRule !== undefined
      ? [{ id: birthright.startRule }]
      : []),
  ];
  return {
    hero: side.hero
      ? {
          attack: side.hero.attack,
          defense: side.hero.defense,
          ...(profile !== undefined
            ? {
                itemActs: profile.itemActs,
                command: profile.command,
                commandC: profile.commandStrength,
              }
            : {}),
        }
      : null,
    ...(side.hero && profile !== undefined
      ? { magic: magicFromProfile(profile) }
      : {}),
    defenseBonus: side.defenseBonus,
    ...(profile !== undefined || morale !== 0
      ? {
          morale: Math.max(-3, Math.min(3, morale)),
          luck: profile?.luck ?? 0,
          ...(side.hero && profile !== undefined && profile.switches.length > 0
            ? { rules: profile.switches }
            : {}),
        }
      : {}),
    ...(startRules.length > 0 ? { startRules } : {}),
    ...(birthright?.ability !== undefined
      ? { birthright: birthright.ability }
      : {}),
    ...(faction !== null || specials.length > 0
      ? { flags: battleFlags(specials) }
      : {}),
    stacks: side.stacks.map((s, slot) => {
      const cdef = getCreature(s.creature);
      const base = battleStatsFromCreature(cdef);
      const speed = heroSpeedBonus(profile?.stacks ?? [], s.creature);
      const native = faction !== null && cdef.faction === faction;
      const extra = [
        ...drills
          .filter((d) => d.startsWith(`${cdef.id}:`))
          .map((d) => d.slice(cdef.id.length + 1)),
        ...(native ? nativeExtras : []),
      ].filter(
        (a, i, all) => !base.abilities.includes(a) && all.indexOf(a) === i,
      );
      return {
        creature: {
          ...base,
          speed: base.speed + speed,
          abilities: [...base.abilities, ...extra, ...heroAbilities],
        },
        count: s.count,
        slot,
        ...(native ? { native: true } : {}),
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
 * Survivors per input stack, as applyBattleResult expects. At the round
 * limit (RULES_V2 1.12) the side with more fight value left wins and the
 * loser's survivors flee: it keeps none, as if eliminated. An abandoned
 * battle (no winner) is a defender win with no attacker survivors.
 */
export function gameResultFromEngine(
  setup: GameBattleSetup,
  result: BattleResult,
): GameBattleResult {
  const survivors = (prefix: "a" | "d", n: number): number[] => {
    const side = prefix === "a" ? setup.attacker : setup.defender;
    const won = result.winner === (prefix === "a" ? "attacker" : "defender");
    // RULES_V2 1.12: a stack that got up crumbles, unless its owner holds
    // the Hall of Ancestors and won.
    const keepRisen =
      won && (side.specials ?? []).includes(SPECIALS.hallOfAncestors);
    const counts: number[] = Array.from({ length: n }, (_, i) => {
      const s = result.stacks.find((x) => x.id === `${prefix}${i}`);
      if (s === undefined) return 0;
      return s.risen === true && !keepRisen ? 0 : s.count;
    });
    // A winner left with no creatures keeps the weakest crumbling stack
    // with 1 creature.
    if (won && !counts.some((c) => c > 0)) {
      let best = -1;
      let bestFv = Infinity;
      for (let i = 0; i < n; i++) {
        const s = result.stacks.find((x) => x.id === `${prefix}${i}`);
        if (s === undefined || s.count <= 0) continue;
        const fv = s.count * getCreature(s.creatureId).fightValue;
        if (fv < bestFv) {
          bestFv = fv;
          best = i;
        }
      }
      if (best >= 0) counts[best] = 1;
    }
    return counts;
  };
  const attacker = survivors("a", setup.attacker.stacks.length);
  const defender = survivors("d", setup.defender.stacks.length);
  const withMagic = (r: GameBattleResult): GameBattleResult =>
    result.magic ? { ...r, magic: result.magic } : r;
  if (result.winner === null) {
    return withMagic({
      winner: "defender",
      attacker: attacker.map(() => 0),
      defender,
    });
  }
  if (result.reason === "retreat" || result.reason === "roundLimit") {
    return withMagic(
      result.winner === "defender"
        ? { winner: "defender", attacker: attacker.map(() => 0), defender }
        : { winner: "attacker", attacker, defender: defender.map(() => 0) },
    );
  }
  return withMagic({ winner: result.winner, attacker, defender });
}

/**
 * The battle AI mode of every battle resolved without the battle screen
 * (bead bzc.37, docs/design/AI.md "Battle AI fast mode"): the adventure
 * AI's fight simulations (core/ai/strength.ts, through the AI's
 * resolver) and the battles of an AI with another AI or with neutrals
 * (core/game/controller.ts settles them with the game's resolver). A
 * battle with a human side, auto-combat and quick battle included, opens
 * the battle screen, whose AI plays the full mode; so do balance runs
 * (tests/sim/battles.ts). This is the one switch.
 */
export const UNWATCHED_BATTLE_AI: AiMode = "fast";

/**
 * Auto-combat for the adventure layer: the AI plays both sides, in
 * {@link UNWATCHED_BATTLE_AI} mode unless `options.ai` says otherwise.
 */
export function createBattleResolver(
  options: AutoBattleOptions = {},
): BattleResolver {
  const auto: AutoBattleOptions = {
    ...options,
    ai: options.ai ?? UNWATCHED_BATTLE_AI,
  };
  return (setup) =>
    gameResultFromEngine(
      setup,
      runAutoBattle(engineSetupFromGame(setup), auto).result,
    );
}
