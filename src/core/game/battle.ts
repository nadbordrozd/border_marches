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
 *
 * Battles (RULES_V2 5.2, 5.5): a hero against neutrals, against a town's
 * garrison, or against another player's hero. The mover is always the
 * attacker (left). A hero defending its own town fights first with the
 * fort bonus; if it loses, the attacker moves into the town and fights the
 * garrison (a second, chained battle) or captures it.
 */
import { getCreature } from "../../data/creatures.ts";
import { getHeroClass } from "../../data/hero.ts";
import { REPAIR_YARD_SHARE, SPECIALS } from "../../data/factionTowns.ts";
import type { CreatureId, FactionId } from "../../data/types.ts";
import type { Terrain } from "../map/types.ts";
import { deriveSeed } from "../rng.ts";
import {
  captureTown,
  guardsAt,
  takePickupAfterFight,
  visitAtHero,
} from "./adventure.ts";
import { heroArtifacts, spoilsEvent, takeSpoils } from "./artifacts.ts";
import { heroBattleProfile, type HeroBattleProfile } from "./battle-profile.ts";
import { effectsOf, heroStats } from "./effects.ts";
import { gainXp } from "./hero.ts";
import { applyBattleMagic } from "../magic/adventure.ts";
import type { MagicOutcome } from "../battle/auto.ts";
import { checkEliminations, sendToPool, sendToTavern } from "./players.ts";
import { splitNeutralStack } from "./progression.ts";
import { siteFor } from "./site-state.ts";
import { siteBattleWon, siteGuard } from "./sites.ts";
import {
  cloneState,
  must,
  fail,
  findHero,
  findObject,
  findPlayer,
  playerDrills,
  playerSpecials,
  success,
  townDefenseBonus,
  townsOf,
  towerHarm,
} from "./state.ts";
import type {
  ArmySlots,
  CommandError,
  CommandResult,
  GameEvent,
  GameState,
  HeroState,
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
  /** Effective Attack and Defense (skills and artifacts included). */
  attack: number;
  defense: number;
  /** Display name. */
  name?: string;
  /** Named hero definition id and class, for the portrait (display only). */
  defId?: string;
  heroClass?: string;
  /**
   * Everything else the hero brings (RULES_V2 2 to 4, 6): Strike and stack
   * modifiers, battle-start rules, item acts, Morale, Luck, Power, mana,
   * pages, switches, Command. Absent in old hand-built setups.
   */
  profile?: HeroBattleProfile;
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
   * Flat Defense bonus for every stack of this side: the fort of a
   * defended town (RULES_V2 5.5: +2, +4 or +6) and the Warlord's Hold; 0
   * otherwise.
   */
  defenseBonus: number;
  /**
   * Tower Harm at each round start against the strongest attacking stack
   * (fort level 3, RULES_V2 5.5); null without a tower.
   * TODO(bzc.8): the new battle engine schedules it; the MVP engine
   * ignores it.
   */
  towerHarm?: number | null;
  /**
   * Whether this side's hero may retreat (RULES_V2 1.12): a hero whose
   * player owns a town and who is not defending inside a town.
   */
  canRetreat?: boolean;
  /**
   * The army's faction (RULES_V2 3.8): its hero's class faction, or the
   * town's for a garrison without a hero; null for neutral guards (no
   * birthright). Creatures of this faction are native.
   */
  faction?: FactionId | null;
  /** The owning player's Drill flags ("<creature>:<ability>"). */
  drills?: string[];
  /** The owning player's town specials and Keystone powers. */
  specials?: string[];
}

export interface BattleSetup {
  /** Seed for the battlefield (obstacles); differs per battle. */
  seed: number;
  /** Ground terrain of the defender's cell (for the battlefield look). */
  terrain: Terrain;
  /** The moving hero's side: always the attacker (left, column 0). */
  attacker: BattleSide;
  /** Neutral stack, town garrison or the attacked hero (right). */
  defender: BattleSide;
  /** What is being fought, for the UI. */
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
  /**
   * The side whose hero retreated (RULES_V2 1.12), if any: it loses (its
   * army is lost, its survivors only count for the other side's XP) and
   * the other side, which must have survivors, wins.
   */
  retreat?: "attacker" | "defender";
  /** Mana spent and scrolls used per side with a hero (RULES_V2 1.12). */
  magic?: { attacker?: MagicOutcome; defender?: MagicOutcome };
}

/**
 * The battle engine's entry point: a pure, deterministic function from the
 * setup to the outcome. Without a retreat the losing side must have no
 * survivors. A winner with none (both sides fell in the same step, RULES_V2
 * 1.12) is given its last stand by applyBattleResult.
 */
export type BattleResolver = (setup: BattleSetup) => BattleResult;

interface SetupWithSlots {
  setup: BattleSetup;
  /** Hero army slot of each attacker stack. */
  attackerSlots: number[];
  /** Garrison or defending hero army slot of each defender stack. */
  defenderSlots: number[];
}

function stacksOf(army: ArmySlots): { stacks: BattleStack[]; slots: number[] } {
  const stacks: BattleStack[] = [];
  const slots: number[] = [];
  army.forEach((s, i) => {
    if (s !== null) {
      slots.push(i);
      stacks.push({ creature: s.creature, count: s.count });
    }
  });
  return { stacks, slots };
}

function battleHero(hero: HeroState): BattleHero {
  const stats = heroStats(hero);
  return {
    id: hero.id,
    attack: stats.attack,
    defense: stats.defense,
    name: hero.name,
    defId: hero.defId,
    heroClass: hero.heroClass,
    profile: heroBattleProfile(hero),
  };
}

function heroFaction(hero: HeroState): FactionId | null {
  try {
    return getHeroClass(hero.heroClass).faction;
  } catch {
    return null;
  }
}

/** Drill flags and specials of a player (none for neutrals). */
function playerFlags(
  state: GameState,
  owner: Owner,
): { drills: string[]; specials: string[] } {
  if (owner === null) return { drills: [], specials: [] };
  return {
    drills: playerDrills(state, owner),
    specials: playerSpecials(state, owner),
  };
}

function ownsTown(state: GameState, player: number): boolean {
  return townsOf(state, player).length > 0;
}

function buildSetup(state: GameState): SetupWithSlots | null {
  const battle = state.pendingBattle;
  if (battle === null) return null;
  const hero = findHero(state, battle.heroId);
  if (hero === undefined) return null;
  const own = stacksOf(hero.army);
  let defenderSlots: number[] = [];
  let defender: BattleSide;
  let cellX = hero.x;
  let cellY = hero.y;
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
      towerHarm: null,
      canRetreat: false,
      faction: null,
      drills: [],
      specials: [],
    };
  } else if (battle.kind === "site") {
    // A bank's, vault's or sealed box's own guard (bead bzc.13).
    const obj = findObject(state.map, battle.objectId);
    if (obj === undefined) return null;
    const guard = siteGuard(state, obj);
    if (guard.length === 0) return null;
    defenderSlots = guard.map((_, i) => i);
    defender = {
      owner: null,
      hero: null,
      stacks: guard.map((s) => ({ creature: s.creature, count: s.count })),
      defenseBonus: 0,
      towerHarm: null,
      canRetreat: false,
    };
  } else if (battle.kind === "town") {
    const town = state.towns[battle.objectId];
    if (town === undefined) return null;
    const g = stacksOf(town.garrison);
    defenderSlots = g.slots;
    defender = {
      owner: town.owner,
      hero: null,
      stacks: g.stacks,
      defenseBonus: townDefenseBonus(town),
      towerHarm: towerHarm(town),
      canRetreat: false,
      faction: town.isHold ? null : town.faction,
      ...playerFlags(state, town.owner),
    };
  } else {
    const foe = findHero(state, battle.objectId);
    if (foe === undefined || !foe.alive) return null;
    const town =
      battle.townId === undefined ? undefined : state.towns[battle.townId];
    const g = stacksOf(foe.army);
    defenderSlots = g.slots;
    defender = {
      owner: foe.owner,
      hero: battleHero(foe),
      stacks: g.stacks,
      defenseBonus: town === undefined ? 0 : townDefenseBonus(town),
      towerHarm: town === undefined ? null : towerHarm(town),
      canRetreat: town === undefined && ownsTown(state, foe.owner),
      faction: heroFaction(foe),
      ...playerFlags(state, foe.owner),
    };
    cellX = foe.x;
    cellY = foe.y;
  }
  const cell = state.map.cells[cellY * state.map.width + cellX];
  return {
    setup: {
      seed: deriveSeed(state.seed, "battle", state.battles),
      terrain: cell?.terrain ?? "grass",
      attacker: {
        owner: hero.owner,
        hero: battleHero(hero),
        stacks: own.stacks,
        defenseBonus: 0,
        towerHarm: null,
        canRetreat: ownsTown(state, hero.owner),
        faction: heroFaction(hero),
        ...playerFlags(state, hero.owner),
      },
      defender,
      battle: { ...battle },
    },
    attackerSlots: own.slots,
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
 * The last stand (RULES_V2 1.12): a winner left with no creatures keeps
 * one creature of its weakest stack, the one with the lowest fight value
 * per creature (the first in deployment order on a tie). Null when the
 * side brought no stacks.
 */
function lastStand(
  stacks: readonly BattleStack[],
): { survivors: number[]; index: number } | null {
  let index = -1;
  let best = Infinity;
  stacks.forEach((s, i) => {
    const fv = getCreature(s.creature).fightValue;
    if (fv < best) {
      best = fv;
      index = i;
    }
  });
  if (index < 0) return null;
  return { survivors: stacks.map((_, i) => (i === index ? 1 : 0)), index };
}

/** XP for killing: total HP of the creatures of `stacks` that died. */
function killedHp(stacks: readonly BattleStack[], survivors: number[]): number {
  let xp = 0;
  stacks.forEach((s, i) => {
    xp += (s.count - (survivors[i] ?? 0)) * getCreature(s.creature).hp;
  });
  return xp;
}

/** Writes survivors back into army slots, in place. */
function applySurvivors(
  army: ArmySlots,
  slots: readonly number[],
  survivors: readonly number[],
): void {
  slots.forEach((slot, i) => {
    const s = army[slot];
    const n = survivors[i] ?? 0;
    if (s !== null && s !== undefined) {
      army[slot] = n > 0 ? { creature: s.creature, count: n } : null;
    }
  });
}

/**
 * The loser's artifacts and scrolls move to the winner's backpack and
 * case, in slot order while there is room; the rest are destroyed
 * (RULES_V2 4.4). In place.
 */
function takeArtifacts(
  winner: HeroState,
  loser: HeroState,
  events: GameEvent[],
): void {
  if (heroArtifacts(loser).length === 0 && loser.scrolls.length === 0) return;
  const moved = takeSpoils(winner, loser);
  events.push(spoilsEvent(winner, loser, moved));
}

/** A machine leaves a wreck (FACTION_DWARVES 1). */
function isMachineCreature(creature: CreatureId): boolean {
  return getCreature(creature).tags?.remains === "wreck";
}

/**
 * Field Surgeon (CONTENT_HEROES 2), in place: after a won battle each
 * stack regains tenths of the creatures it lost, rounded down. The
 * Repair Yard (FACTION_DWARVES 9), when the hero's owner holds one, adds
 * a third for each machine stack: the two shares add before rounding.
 */
function fieldSurgeon(
  state: GameState,
  hero: HeroState,
  stacks: readonly BattleStack[],
  slots: readonly number[],
  survivors: readonly number[],
): void {
  const tenths = effectsOf(hero, "field-surgeon").reduce(
    (n, e) => n + e.effect.tenths,
    0,
  );
  const yard = playerSpecials(state, hero.owner).includes(SPECIALS.repairYard);
  if (tenths <= 0 && !yard) return;
  const { num, den } = REPAIR_YARD_SHARE;
  slots.forEach((slot, i) => {
    const creature = stacks[i]?.creature;
    if (creature === undefined) return;
    const before = stacks[i]?.count ?? 0;
    const lost = before - (survivors[i] ?? 0);
    // tenths / 10 + (machine ? num / den : 0), over 10 x den.
    const share =
      tenths * den + (yard && isMachineCreature(creature) ? 10 * num : 0);
    const back = Math.floor((lost * share) / (10 * den));
    if (back <= 0) return;
    const s = hero.army[slot];
    hero.army[slot] = { creature, count: (s?.count ?? 0) + back };
  });
}

/**
 * A hero leaves the map after losing, in place: to its owner's tavern on
 * a retreat, else to the pool; a winner hero takes its artifacts.
 */
function heroLost(
  state: GameState,
  loser: HeroState,
  winner: HeroState | undefined,
  retreated: boolean,
  events: GameEvent[],
): void {
  if (retreated) {
    sendToTavern(state, loser);
    events.push({ type: "hero-retreated", heroId: loser.id });
    return;
  }
  if (winner !== undefined) takeArtifacts(winner, loser, events);
  sendToPool(state, loser);
  events.push({ type: "hero-defeated", heroId: loser.id });
}

/**
 * Applies a battle outcome to the pending battle:
 * - casualties on both sides; a winner with no survivors (both sides fell
 *   in the same step) keeps one creature of its weakest stack, its last
 *   stand (RULES_V2 1.12), so no hero, guard or garrison wins with nothing;
 * - the winning hero gains XP = total HP of the enemy creatures killed
 *   (pending level-ups added); a hero beaten by a hero loses its
 *   artifacts to it; a beaten hero leaves the map (pool, or its tavern
 *   after a retreat);
 * - attacker wins: the neutral stack is removed, the town captured, or
 *   the defending hero removed; a hero beaten in its town lets the
 *   attacker into the town (garrison battle chained, or capture); then the
 *   next adjacent neutral stack attacks (chained), or the object under the
 *   hero is visited;
 * - eliminations and the end of the game are settled (RULES_V2 5.9).
 *
 * A result that cannot be applied is refused ("bad-result" and others) and
 * the battle stays pending: the caller must surface the refusal and settle
 * the battle with voidPendingBattle rather than wait on it.
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
  if (result.winner !== "attacker" && result.winner !== "defender") {
    return fail("bad-result", "the result names no winner");
  }
  let attackerSurvivors = result.attacker;
  let defenderSurvivors = result.defender;
  const attackerLeft = total(attackerSurvivors);
  const defenderLeft = total(defenderSurvivors);
  const retreat = result.retreat;
  let attackerWon: boolean;
  let stand: { side: "attacker" | "defender"; creature: CreatureId } | null =
    null;
  if (retreat !== undefined) {
    const side = retreat === "attacker" ? setup.attacker : setup.defender;
    if (side.canRetreat !== true) {
      return fail("cannot-retreat", `the ${retreat} cannot retreat`);
    }
    attackerWon = retreat === "defender";
    const winnerLeft = attackerWon ? attackerLeft : defenderLeft;
    if (result.winner === retreat || winnerLeft === 0) {
      return fail("bad-result", "the side that stays must win with survivors");
    }
  } else {
    attackerWon = result.winner === "attacker";
    if ((attackerWon ? defenderLeft : attackerLeft) > 0) {
      return fail("bad-result", "the loser must have no survivors");
    }
    // Both sides fell in the same step (the engine names the defender,
    // RULES_V2 1.12): the winner keeps one creature of its weakest stack.
    if ((attackerWon ? attackerLeft : defenderLeft) === 0) {
      const side = attackerWon ? setup.attacker : setup.defender;
      const last = lastStand(side.stacks);
      if (last === null) {
        return fail("bad-result", "the winner has no stacks");
      }
      if (attackerWon) attackerSurvivors = last.survivors;
      else defenderSurvivors = last.survivors;
      stand = {
        side: result.winner,
        creature: must(side.stacks[last.index], "stack").creature,
      };
    }
  }

  const next = cloneState(state);
  const battle = must(next.pendingBattle, "battle");
  next.pendingBattle = null;
  next.battles++;
  const hero = must(findHero(next, battle.heroId), "hero");
  const foe =
    battle.kind === "hero" ? findHero(next, battle.objectId) : undefined;
  const events: GameEvent[] = [];
  if (stand !== null) events.push({ type: "last-stand", battle, ...stand });

  applySurvivors(hero.army, attackerSlots, attackerSurvivors);
  // One-battle consumables and site buffs end with the battle (6.1).
  hero.nextBattle = [];
  hero.buffs = [];
  // Mana spent and scrolls cast stay spent (RULES_V2 1.12).
  applyBattleMagic(hero, result.magic?.attacker);
  if (foe !== undefined) applyBattleMagic(foe, result.magic?.defender);
  if (foe !== undefined) {
    foe.nextBattle = [];
    foe.buffs = [];
  }
  if (battle.kind === "town") {
    const town = next.towns[battle.objectId];
    if (town !== undefined) {
      applySurvivors(town.garrison, defenderSlots, defenderSurvivors);
    }
  } else if (foe !== undefined) {
    applySurvivors(foe.army, defenderSlots, defenderSurvivors);
  }

  if (!attackerWon) {
    if (battle.kind === "monster") {
      const monster = next.monsters[battle.objectId];
      if (monster !== undefined) monster.count = total(defenderSurvivors);
    }
    if (battle.kind === "site") {
      // Guards killed stay dead.
      siteFor(next, battle.objectId).guard = setup.defender.stacks
        .map((s, i) => ({
          creature: s.creature,
          count: defenderSurvivors[i] ?? 0,
        }))
        .filter((s) => s.count > 0);
    }
    if (foe !== undefined) {
      if (retreat === undefined) {
        fieldSurgeon(
          next,
          foe,
          setup.defender.stacks,
          defenderSlots,
          defenderSurvivors,
        );
      }
      gainXp(foe, killedHp(setup.attacker.stacks, attackerSurvivors), events);
    }
    heroLost(next, hero, foe, retreat === "attacker", events);
    checkEliminations(next, events);
    return success(next, events);
  }

  if (retreat === undefined) {
    fieldSurgeon(
      next,
      hero,
      setup.attacker.stacks,
      attackerSlots,
      attackerSurvivors,
    );
  }
  const xp = killedHp(setup.defender.stacks, defenderSurvivors);
  gainXp(hero, xp, events);
  // Loot Pile (FACTION_GOBLINS 9): gold equal to the battle's XP, once.
  if (xp > 0 && playerSpecials(next, hero.owner).includes(SPECIALS.lootPile)) {
    const p = findPlayer(next, hero.owner);
    if (p !== undefined) {
      p.resources.gold += xp;
      events.push({ type: "loot", player: p.id, gold: xp });
    }
  }
  if (battle.kind === "monster") {
    next.monsters = Object.fromEntries(
      Object.entries(next.monsters).filter(([id]) => id !== battle.objectId),
    );
    events.push({ type: "monster-defeated", monsterId: battle.objectId });
  } else if (battle.kind === "site") {
    const obj = findObject(next.map, battle.objectId);
    if (obj !== undefined) siteBattleWon(next, hero, obj, events);
  } else if (battle.kind === "town") {
    const town = next.towns[battle.objectId];
    if (town !== undefined) {
      captureTown(next, town, hero.owner, events);
      events.push({ type: "visit-town", heroId: hero.id, townId: town.id });
    }
  } else if (foe !== undefined) {
    heroLost(next, foe, hero, retreat === "defender", events);
    checkEliminations(next, events);
  }
  if (next.status !== "playing") return success(next, events);

  let chained: PendingBattle | null = null;
  if (battle.kind === "hero" && battle.townId !== undefined) {
    // RULES_V2 5.5: on into the town (garrison battle, or capture).
    const obj = findObject(next.map, battle.townId);
    if (obj !== undefined) {
      hero.x = obj.x;
      hero.y = obj.y;
      chained = visitAtHero(next, hero, events);
    }
  } else {
    const guards = battle.kind === "hero" ? [] : guardsAt(next, hero);
    if (guards.length > 0) {
      chained = {
        kind: "monster",
        objectId: must(guards[0], "guard"),
        heroId: hero.id,
        ...(battle.pickupId !== undefined ? { pickupId: battle.pickupId } : {}),
      };
    } else if (battle.pickupId !== undefined) {
      chained = takePickupAfterFight(next, hero, battle.pickupId, events);
    } else if (battle.kind === "monster") {
      chained = visitAtHero(next, hero, events);
    }
  }
  if (next.status !== "playing") return success(next, events);
  if (chained !== null) {
    next.pendingBattle = chained;
    events.push({ type: "battle", battle: chained });
  }
  return success(next, events);
}

/**
 * The guard against a stalled game: settles a pending battle whose result
 * could not be applied (a resolver bug) as void. Nothing changes but the
 * battle count (so a new fight gets a new seed); the hero stays where the
 * fight started. Emits a "battle-error" event with the refusal, so the
 * error is surfaced rather than leaving the game waiting on the battle.
 */
export function voidPendingBattle(
  state: GameState,
  error: CommandError,
  message: string,
): CommandResult {
  if (state.pendingBattle === null) {
    return fail("no-battle", "no battle is pending");
  }
  const next = cloneState(state);
  const battle = must(next.pendingBattle, "battle");
  next.pendingBattle = null;
  next.battles++;
  return success(next, [{ type: "battle-error", battle, error, message }]);
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

/**
 * Which players a battle involves: the attacker's owner and the
 * defender's (null for neutrals and neutral towns).
 */
export function battlePlayers(
  state: GameState,
  battle: PendingBattle,
): { attacker: number | null; defender: number | null } {
  const attacker = findHero(state, battle.heroId)?.owner ?? null;
  let defender: number | null = null;
  if (battle.kind === "hero") {
    defender = findHero(state, battle.objectId)?.owner ?? null;
  } else if (battle.kind === "town") {
    defender = state.towns[battle.objectId]?.owner ?? null;
  }
  return { attacker, defender };
}
