/**
 * The seam between the adventure layer and the battle engine.
 *
 * This module does not fight battles. When a move or visit starts a fight,
 * `state.pendingBattle` is set and every other command (except
 * chooseLevelUp) is refused until the battle is resolved:
 *
 * ```ts
 * const setup = battleSetup(state)!;      // who fights, where, which seed
 * const result = resolver(setup);         // the battle engine (another module)
 * const next = applyBattleResult(state, result);
 * // or, in one call: fightPendingBattle(state, resolver)
 * ```
 *
 * The battle engine supplies a {@link BattleResolver}. It must be a pure,
 * deterministic function of the setup (the setup carries the battle seed for
 * obstacles). The UI can instead run an interactive battle from the same
 * setup and hand its final outcome to applyBattleResult.
 */
import { getCreature } from "../../data/creatures.ts";
import type { CreatureId } from "../../data/types.ts";
import type { Terrain } from "../map/types.ts";
import { deriveSeed } from "../rng.ts";
import { captureTown, guardsAt, visitAtHero } from "./adventure.ts";
import { gainXp } from "./hero.ts";
import { splitNeutralStack } from "./progression.ts";
import {
  cloneState,
  must,
  fail,
  findHero,
  success,
  townDefenseBonus,
} from "./state.ts";
import type {
  CommandResult,
  GameEvent,
  GameState,
  Owner,
  PendingBattle,
} from "./types.ts";

/** One stack entering battle. All units occupy one hex in the MVP. */
export interface BattleStack {
  creature: CreatureId;
  /** >= 1 */
  count: number;
}

/** The hero leading a side; its Attack and Defense add to every stack. */
export interface BattleHero {
  id: string;
  attack: number;
  defense: number;
}

export interface BattleSide {
  owner: Owner;
  /** null for neutral stacks and garrisons without a hero. */
  hero: BattleHero | null;
  /**
   * Stacks in deployment order (GAME_DESIGN.md section 9.1 rows by count).
   * At most 7. Turn-order ties also break by this order.
   */
  stacks: BattleStack[];
  /**
   * Flat Defense bonus for every stack of this side: +2 for the defenders
   * of a town with a Palisade and of the Warlord's Hold; 0 otherwise.
   */
  defenseBonus: number;
}

export interface BattleSetup {
  /** Seed for the battlefield (obstacles); differs per battle. */
  seed: number;
  /** Ground terrain under the hero (for the battlefield look). */
  terrain: Terrain;
  /** The hero's side: always the attacker (left, column 0). */
  attacker: BattleSide;
  /** Neutral stack (split into up to 3 stacks) or town garrison (right). */
  defender: BattleSide;
  /** What is being fought (map object id), for the UI. */
  battle: PendingBattle;
}

export interface BattleResult {
  winner: "attacker" | "defender";
  /**
   * Survivors per input stack, same order and length as setup.attacker.stacks
   * (0 = the stack died). Each value is 0..count.
   */
  attacker: number[];
  /** Survivors per input stack of setup.defender.stacks. */
  defender: number[];
}

/**
 * The battle engine's entry point: a pure, deterministic function from the
 * setup to the outcome. There is no retreat in the MVP, so the losing side
 * must have no survivors and the winner at least one.
 */
export type BattleResolver = (setup: BattleSetup) => BattleResult;

interface SetupWithSlots {
  setup: BattleSetup;
  /** Hero army slot of each attacker stack. */
  attackerSlots: number[];
  /** Garrison slot of each defender stack (town battles). */
  defenderSlots: number[];
}

function buildSetup(state: GameState): SetupWithSlots | null {
  const battle = state.pendingBattle;
  if (battle === null) return null;
  const hero = findHero(state, battle.heroId);
  if (hero === undefined) return null;
  const attackerSlots: number[] = [];
  const attackerStacks: BattleStack[] = [];
  hero.army.forEach((s, i) => {
    if (s !== null) {
      attackerSlots.push(i);
      attackerStacks.push({ creature: s.creature, count: s.count });
    }
  });
  const defenderSlots: number[] = [];
  let defender: BattleSide;
  if (battle.kind === "monster") {
    const monster = state.monsters[battle.objectId];
    if (monster === undefined) return null;
    defender = {
      owner: null,
      hero: null,
      stacks: splitNeutralStack(monster.count).map((count) => ({
        creature: monster.creature,
        count,
      })),
      defenseBonus: 0,
    };
  } else {
    const town = state.towns[battle.objectId];
    if (town === undefined) return null;
    const stacks: BattleStack[] = [];
    town.garrison.forEach((s, i) => {
      if (s !== null) {
        defenderSlots.push(i);
        stacks.push({ creature: s.creature, count: s.count });
      }
    });
    defender = {
      owner: town.owner,
      hero: null,
      stacks,
      defenseBonus: townDefenseBonus(town),
    };
  }
  const cell = state.map.cells[hero.y * state.map.width + hero.x];
  return {
    setup: {
      seed: deriveSeed(state.seed, "battle", state.battles),
      terrain: cell?.terrain ?? "grass",
      attacker: {
        owner: hero.owner,
        hero: { id: hero.id, attack: hero.attack, defense: hero.defense },
        stacks: attackerStacks,
        defenseBonus: 0,
      },
      defender,
      battle: { ...battle },
    },
    attackerSlots,
    defenderSlots,
  };
}

/** The setup of the pending battle, or null when none is pending. */
export function battleSetup(state: GameState): BattleSetup | null {
  return buildSetup(state)?.setup ?? null;
}

function validSurvivors(
  survivors: unknown,
  stacks: readonly BattleStack[],
): survivors is number[] {
  return (
    Array.isArray(survivors) &&
    survivors.length === stacks.length &&
    survivors.every(
      (n, i) => Number.isInteger(n) && n >= 0 && n <= (stacks[i]?.count ?? 0),
    )
  );
}

const total = (ns: readonly number[]): number => ns.reduce((a, b) => a + b, 0);

/**
 * Applies a battle outcome to the pending battle:
 * - casualties on both sides;
 * - attacker wins: the hero gains XP = total HP of the enemy creatures
 *   killed (pending level-ups added), the neutral stack is removed or the
 *   town captured (capturing every Hold wins the game); then the next
 *   adjacent neutral stack attacks (chained pendingBattle), or the object
 *   under the hero is visited;
 * - defender wins: the hero dies and the game is lost.
 */
export function applyBattleResult(
  state: GameState,
  result: BattleResult,
): CommandResult {
  if (state.status !== "playing") return fail("game-over", "the game is over");
  const built = buildSetup(state);
  if (built === null) return fail("no-battle", "no battle is pending");
  const { setup, attackerSlots, defenderSlots } = built;
  if (
    !validSurvivors(result.attacker, setup.attacker.stacks) ||
    !validSurvivors(result.defender, setup.defender.stacks)
  ) {
    return fail("bad-result", "survivor lists do not match the setup");
  }
  const attackerLeft = total(result.attacker);
  const defenderLeft = total(result.defender);
  const attackerWon =
    result.winner === "attacker" && attackerLeft > 0 && defenderLeft === 0;
  const defenderWon =
    result.winner === "defender" && defenderLeft > 0 && attackerLeft === 0;
  if (!attackerWon && !defenderWon) {
    return fail("bad-result", "the loser must have no survivors");
  }

  const next = cloneState(state);
  const battle = must(next.pendingBattle, "battle");
  next.pendingBattle = null;
  next.battles++;
  const hero = must(findHero(next, battle.heroId), "hero");
  const events: GameEvent[] = [];

  attackerSlots.forEach((slot, i) => {
    const s = hero.army[slot];
    const n = result.attacker[i] ?? 0;
    if (s !== null && s !== undefined) {
      hero.army[slot] = n > 0 ? { creature: s.creature, count: n } : null;
    }
  });

  if (defenderWon) {
    if (battle.kind === "monster") {
      const monster = next.monsters[battle.objectId];
      if (monster !== undefined) monster.count = defenderLeft;
    } else {
      const town = next.towns[battle.objectId];
      if (town !== undefined) {
        defenderSlots.forEach((slot, i) => {
          const s = town.garrison[slot];
          const n = result.defender[i] ?? 0;
          if (s !== null && s !== undefined) {
            town.garrison[slot] =
              n > 0 ? { creature: s.creature, count: n } : null;
          }
        });
      }
    }
    hero.alive = false;
    hero.army = hero.army.map(() => null);
    next.status = "lost";
    events.push({ type: "hero-defeated", heroId: hero.id });
    events.push({ type: "game-lost", player: hero.owner });
    return success(next, events);
  }

  let xp = 0;
  setup.defender.stacks.forEach((s, i) => {
    xp += (s.count - (result.defender[i] ?? 0)) * getCreature(s.creature).hp;
  });

  if (battle.kind === "monster") {
    next.monsters = Object.fromEntries(
      Object.entries(next.monsters).filter(([id]) => id !== battle.objectId),
    );
    events.push({ type: "monster-defeated", monsterId: battle.objectId });
    gainXp(hero, xp, events);
  } else {
    gainXp(hero, xp, events);
    const town = next.towns[battle.objectId];
    if (town !== undefined) {
      captureTown(next, town, hero.owner, events);
      events.push({ type: "visit-town", heroId: hero.id, townId: town.id });
    }
  }
  if (next.status !== "playing") return success(next, events);

  let chained: PendingBattle | null = null;
  const guards = guardsAt(next, hero);
  if (guards.length > 0) {
    chained = {
      kind: "monster",
      objectId: must(guards[0], "guard"),
      heroId: hero.id,
    };
  } else if (battle.kind === "monster") {
    chained = visitAtHero(next, hero, events);
  }
  if (chained !== null) {
    next.pendingBattle = chained;
    events.push({ type: "battle", battle: chained });
  }
  return success(next, events);
}

/** battleSetup + resolver + applyBattleResult in one call. */
export function fightPendingBattle(
  state: GameState,
  resolver: BattleResolver,
): CommandResult {
  const setup = battleSetup(state);
  if (setup === null) return fail("no-battle", "no battle is pending");
  return applyBattleResult(state, resolver(setup));
}
