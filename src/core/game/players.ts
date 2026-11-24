/**
 * Players, the tavern and the hero pool, elimination and victory
 * (RULES_V2 5.1, 5.4, 5.9).
 */
import { getHeroClass } from "../../data/hero.ts";
import { findFaction } from "../../data/factions.ts";
import {
  findHeroDef,
  HERO_ROSTER,
  HIRE_COST,
  MAX_HEROES,
  RETREAT_OFFER_REFRESHES,
  TAVERN_OFFER_SIZE,
} from "../../data/players.ts";
import type { HeroDef } from "../../data/players.ts";
import { createRng, deriveSeed } from "../rng.ts";
import {
  addToArmy,
  checkTurn,
  cloneState,
  emptyArmy,
  fail,
  findHero,
  findObject,
  findPlayer,
  heroAt,
  heroesOf,
  must,
  revealDisc,
  success,
  townsOf,
} from "./state.ts";
import { HERO_SIGHT } from "../../data/hero.ts";
import type {
  CommandResult,
  GameEvent,
  GameState,
  HeroState,
  PlayerState,
} from "./types.ts";

const ROSTER_INDEX = new Map(HERO_ROSTER.map((h, i) => [h.id, i]));

function rosterOrder(a: string, b: string): number {
  return (ROSTER_INDEX.get(a) ?? 1e9) - (ROSTER_INDEX.get(b) ?? 1e9);
}

/** Puts a named hero back into the pool (kept in roster order), in place. */
export function returnToPool(state: GameState, defId: string): void {
  if (state.pool.includes(defId)) return;
  state.pool.push(defId);
  state.pool.sort(rosterOrder);
}

function heroFaction(def: HeroDef): string {
  return getHeroClass(def.heroClass).faction;
}

/**
 * Draws one hero from the pool, in place: preferring heroes of `faction`'s
 * classes when `preferFaction` is set. Returns null when the pool is empty.
 */
export function drawFromPool(
  state: GameState,
  rng: ReturnType<typeof createRng>,
  preferFaction: string | null,
): string | null {
  let candidates = state.pool;
  if (preferFaction !== null) {
    const own = state.pool.filter((id) => {
      const def = findHeroDef(id);
      return def !== undefined && heroFaction(def) === preferFaction;
    });
    if (own.length > 0) candidates = own;
  }
  if (candidates.length === 0) return null;
  const pick = rng.pick(candidates);
  state.pool = state.pool.filter((id) => id !== pick);
  return pick;
}

/**
 * Redraws every surviving player's two offer slots, in player index order
 * (RULES_V2 5.4): slot A a hero of the player's faction if the pool has
 * one, slot B any hero. Old offers go back to the pool first, and each
 * retreated entry loses one refresh (at 0 the hero joins the pool). Seeded
 * by the game seed and the day. In place.
 */
export function refreshTaverns(state: GameState): void {
  for (const player of state.players) {
    for (const id of player.tavern.offer) {
      if (id !== null) returnToPool(state, id);
    }
    player.tavern.offer = [];
    const kept: PlayerState["tavern"]["retreated"] = [];
    for (const entry of player.tavern.retreated) {
      const left = entry.refreshesLeft - 1;
      if (left > 0) kept.push({ heroId: entry.heroId, refreshesLeft: left });
      else {
        const hero = findHero(state, entry.heroId);
        if (hero !== undefined) returnToPool(state, hero.defId);
      }
    }
    player.tavern.retreated = player.eliminated ? [] : kept;
  }
  for (const player of state.players) {
    if (player.eliminated) continue;
    const rng = createRng(
      deriveSeed(state.seed, "tavern", state.day, player.id),
    );
    const offer: Array<string | null> = [];
    for (let slot = 0; slot < TAVERN_OFFER_SIZE; slot++) {
      offer.push(drawFromPool(state, rng, slot === 0 ? player.faction : null));
    }
    player.tavern.offer = offer;
  }
}

/** Starting army of a hero class as army slots. */
function startingArmy(heroClass: string): HeroState["army"] {
  const army = emptyArmy();
  for (const s of getHeroClass(heroClass).startingArmy) {
    addToArmy(army, s.creature, s.count);
  }
  return army;
}

/** A level-1 hero record for a named hero. */
export function newHeroState(
  id: string,
  def: HeroDef,
  owner: number,
  x: number,
  y: number,
): HeroState {
  const cls = getHeroClass(def.heroClass);
  return {
    id,
    defId: def.id,
    name: def.name,
    owner,
    heroClass: cls.id,
    x,
    y,
    mp: cls.movement,
    maxMp: cls.movement,
    attack: cls.attack,
    defense: cls.defense,
    xp: 0,
    level: 1,
    pendingLevelUps: 0,
    army: startingArmy(cls.id),
    artifacts: [],
    alive: true,
  };
}

/** The hero ids a player may hire now: offer slots, then retreated heroes. */
export function tavernOffer(
  state: GameState,
  player: number,
): Array<{ defId: string; retreated: boolean; heroId?: string }> {
  const p = findPlayer(state, player);
  if (p === undefined) return [];
  const out: Array<{ defId: string; retreated: boolean; heroId?: string }> = [];
  for (const id of p.tavern.offer) {
    if (id !== null) out.push({ defId: id, retreated: false });
  }
  for (const entry of p.tavern.retreated) {
    const hero = findHero(state, entry.heroId);
    if (hero !== undefined) {
      out.push({ defId: hero.defId, retreated: true, heroId: hero.id });
    }
  }
  return out;
}

/** The hero record for a named hero, if it has been on the map before. */
export function heroByDef(
  state: GameState,
  defId: string,
): HeroState | undefined {
  return state.heroes.find((h) => h.defId === defId);
}

/**
 * Hires a hero from the player's tavern offer into one of its towns
 * (RULES_V2 5.4): 2500 gold, at most 8 heroes, the town's entrance free of
 * heroes. The hero appears with its class's starting army, full movement.
 * A retreated hero keeps its level, stats and artifacts.
 */
export function hireHero(
  state: GameState,
  townId: string,
  defId: string,
): CommandResult {
  const town = state.towns[townId];
  if (town === undefined) return fail("unknown-town", `no town ${townId}`);
  const blocked = checkTurn(state, town.owner);
  if (blocked !== null) return blocked;
  const player = must(findPlayer(state, state.currentPlayer), "player");
  const entry = tavernOffer(state, player.id).find((o) => o.defId === defId);
  const def = findHeroDef(defId);
  if (entry === undefined || def === undefined) {
    return fail("not-offered", `${defId} is not offered in this tavern`);
  }
  if (heroesOf(state, player.id).length >= MAX_HEROES) {
    return fail("hero-limit", `at most ${MAX_HEROES} heroes`);
  }
  const obj = must(findObject(state.map, townId), "town object");
  if (heroAt(state, obj.x, obj.y) !== undefined) {
    return fail("cell-occupied", "a hero stands in the town");
  }
  if (player.resources.gold < HIRE_COST) {
    return fail("resources", `hiring costs ${HIRE_COST} gold`);
  }

  const next = cloneState(state);
  const p = must(findPlayer(next, player.id), "player");
  p.resources.gold -= HIRE_COST;
  if (entry.retreated) {
    p.tavern.retreated = p.tavern.retreated.filter(
      (r) => r.heroId !== entry.heroId,
    );
  } else {
    p.tavern.offer = p.tavern.offer.map((id) => (id === defId ? null : id));
  }
  next.pool = next.pool.filter((id) => id !== defId);
  let hero = heroByDef(next, defId);
  const cls = getHeroClass(def.heroClass);
  if (hero === undefined) {
    hero = newHeroState(`hero-${defId}`, def, p.id, obj.x, obj.y);
    next.heroes.push(hero);
  } else {
    hero.owner = p.id;
    hero.x = obj.x;
    hero.y = obj.y;
    hero.alive = true;
    hero.army = startingArmy(cls.id);
    hero.mp = hero.maxMp;
  }
  revealDisc(next.map, p.explored, obj.x, obj.y, HERO_SIGHT);
  return success(next, [
    { type: "hero-hired", heroId: hero.id, player: p.id, townId },
  ]);
}

/**
 * Takes a hero off the map into the pool, in place: as if defeated by
 * neutrals (it keeps level, stats and artifacts; its army is lost).
 */
export function sendToPool(state: GameState, hero: HeroState): void {
  hero.alive = false;
  hero.army = emptyArmy();
  hero.mp = 0;
  hero.pendingLevelUps = 0;
  returnToPool(state, hero.defId);
}

/**
 * A retreated hero leaves the map and waits on its owner's offer as an
 * extra entry until the second weekly refresh (RULES_V2 5.4), in place.
 */
export function sendToTavern(state: GameState, hero: HeroState): void {
  hero.alive = false;
  hero.army = emptyArmy();
  hero.mp = 0;
  const player = findPlayer(state, hero.owner);
  if (player === undefined || player.eliminated) {
    returnToPool(state, hero.defId);
    return;
  }
  player.tavern.retreated.push({
    heroId: hero.id,
    refreshesLeft: RETREAT_OFFER_REFRESHES,
  });
}

/** Dismisses one of the current player's heroes (RULES_V2 5.4). */
export function dismissHero(state: GameState, heroId: string): CommandResult {
  const hero = findHero(state, heroId);
  if (hero === undefined || !hero.alive) {
    return fail("unknown-hero", `no hero ${heroId}`);
  }
  const blocked = checkTurn(state, hero.owner);
  if (blocked !== null) return blocked;
  const next = cloneState(state);
  const h = must(findHero(next, heroId), "hero");
  sendToPool(next, h);
  const events: GameEvent[] = [{ type: "hero-dismissed", heroId }];
  checkEliminations(next, events);
  return success(next, events);
}

/**
 * Eliminates, in place, every player left with no town and no hero
 * (RULES_V2 5.9, tested after every battle and capture), then settles
 * victory and defeat.
 */
export function checkEliminations(state: GameState, events: GameEvent[]): void {
  for (const player of state.players) {
    if (player.eliminated) continue;
    if (townsOf(state, player.id).length > 0) continue;
    if (heroesOf(state, player.id).length > 0) continue;
    eliminate(state, player, events);
  }
  settleOutcome(state, events);
}

/**
 * Removes a player from the game, in place: heroes to the pool (keeping
 * artifacts), flags to neutral, offers back to the pool.
 */
export function eliminate(
  state: GameState,
  player: PlayerState,
  events: GameEvent[],
): void {
  player.eliminated = true;
  for (const hero of heroesOf(state, player.id)) sendToPool(state, hero);
  for (const entry of player.tavern.retreated) {
    const hero = findHero(state, entry.heroId);
    if (hero !== undefined) returnToPool(state, hero.defId);
  }
  for (const id of player.tavern.offer)
    if (id !== null) returnToPool(state, id);
  player.tavern = { offer: [], retreated: [] };
  for (const mine of Object.values(state.mines)) {
    if (mine.owner === player.id) mine.owner = null;
  }
  for (const town of Object.values(state.towns)) {
    if (town.owner === player.id) town.owner = null;
  }
  events.push({ type: "player-eliminated", player: player.id });
}

/** The human's player index (RULES_V2 5.1: player 0). */
export function humanPlayer(state: GameState): number {
  return state.players.find((p) => p.kind === "human")?.id ?? 0;
}

/**
 * Victory and defeat (RULES_V2 5.9), in place: the human eliminated loses
 * at once; the human as the only player left wins (games with two or more
 * players); a scenario goal met wins.
 */
export function settleOutcome(state: GameState, events: GameEvent[]): void {
  if (state.status !== "playing") return;
  const human = humanPlayer(state);
  const me = findPlayer(state, human);
  if (me === undefined || me.eliminated) {
    state.status = "lost";
    events.push({ type: "game-lost", player: human });
    return;
  }
  const others = state.players.filter((p) => p.id !== human);
  if (others.length > 0 && others.every((p) => p.eliminated)) {
    state.status = "won";
    events.push({ type: "game-won", player: human });
    return;
  }
  const goal = state.scenario;
  if (
    goal !== null &&
    goal.townIds.length > 0 &&
    goal.townIds.every((id) => state.towns[id]?.owner === human)
  ) {
    state.status = "won";
    events.push({ type: "game-won", player: human });
  }
}

/** The faction's default hero class, for a player's first hero. */
export function factionHeroClass(faction: string): string {
  const cls = findFaction(faction)?.heroClasses[0];
  if (cls === undefined) throw new Error(`faction ${faction} has no heroes`);
  return cls;
}
