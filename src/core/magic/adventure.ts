/**
 * Magic on the adventure map (RULES_V2.md 2.3, 2.8, 2.9; CONTENT_SPELLS
 * section 4): casting adventure spells, the day start (mana, day effects,
 * guild learning), learning from guilds and shrines, and battle mana.
 *
 * Commands follow the game layer's shape: they never mutate their input
 * and return a CommandResult.
 */

import { getCreature } from "../../data/creatures.ts";
import { clampPower } from "../battle/index.ts";
import type { MagicOutcome } from "../battle/index.ts";
import {
  checkTurn,
  cloneState,
  fail,
  findHero,
  findPlayer,
  must,
  revealDisc,
  success,
  townAtHero,
} from "../game/state.ts";
import type {
  CommandResult,
  GameEvent,
  GameState,
  HeroState,
  MonsterState,
} from "../game/types.ts";
import { adventureMagicBonus, spellPowerBonus } from "../game/effects.ts";
import { objectTypeOf, playerListed } from "../game/site-state.ts";
import { secondHelping, secondHelpingError } from "../game/sites.ts";
import type { MapObject } from "../map/types.ts";
import { adventureSpell, spellInfo } from "./catalog.ts";
import type { AdventureSpellDef } from "./catalog.ts";
import { guildLevelOf, learnableFromGuild, townGuild } from "./guild.ts";
import {
  canLearn,
  heroMagic,
  mutableStore,
  storeOf,
  withHeroMagic,
} from "./hero.ts";

/** The daily movement cap (CONTENT_SPELLS 4, Saved Hour). */
export const DAILY_MP_CAP = 3000;
/** Green Road's cost of a forest step (RULES_V2 2.8). */
export const GREEN_ROAD_COST = 200;
/** Ask the Dead's range from the hero. */
export const ASK_RANGE = 15;
/** Tow Line needs at least this much movement, and spends all of it. */
export const TOW_LINE_MIN_MP = 300;
/**
 * Parley and Opening Salvo reach a neutral stack this many cells away
 * (Chebyshev), so the hero can cast from outside its zone of control.
 */
export const MONSTER_SPELL_RANGE = 2;

export interface AdventureTarget {
  /** Parley, Opening Salvo: the neutral stack (within 2 cells). */
  readonly monsterId?: string;
  /** Ask the Dead: the centre cell. */
  readonly x?: number;
  readonly y?: number;
  /** Read the Seal: the enemy hero (or `objectId` for a sealed site). */
  readonly heroId?: string;
  readonly objectId?: string;
  /** Saved Hour: movement points to save. */
  readonly amount?: number;
}

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** Effective Power of an adventure page or scroll (2.8, 2.5). */
export function adventurePower(
  hero: HeroState,
  spellId: string,
  scroll: boolean,
): number {
  const m = heroMagic(hero);
  // Wayfinder: adventure spells scale as if Power were higher.
  const extra = adventureMagicBonus(hero).power;
  if (scroll) return clampPower(m.scrollPower + extra);
  return clampPower(
    m.pagePower[spellInfo(spellId).school] +
      extra +
      spellPowerBonus(hero, spellId),
  );
}

/** Mana an adventure page costs this hero (percentages, rounded up). */
export function adventureManaCost(hero: HeroState, spellId: string): number {
  const m = heroMagic(hero);
  // Wayfinder: adventure spells cost less.
  const pct = Math.max(
    1,
    m.costPercent + adventureMagicBonus(hero).costPercent,
  );
  return Math.max(1, Math.ceil((adventureSpell(spellId).mana * pct) / 100));
}

/** Why the hero cannot cast this adventure spell now, or null. */
export function adventureCastError(
  state: GameState,
  hero: HeroState,
  spellId: string,
  scroll = false,
): string | null {
  const s = adventureSpell(spellId);
  const m = heroMagic(hero);
  if (scroll) {
    if (!m.scrolls.includes(spellId)) return "no such scroll";
  } else {
    if (!m.knownSpells.includes(spellId)) return "the hero does not know it";
    if (!canLearn(m, s.school, s.tier))
      return `needs ${s.school} rank for tier ${s.tier}`;
    const cost = adventureManaCost(hero, spellId);
    if (m.mana < cost) return `needs ${cost} mana, the hero has ${m.mana}`;
  }
  const today = storeOf(state, hero.id).castToday.filter(
    (x) => x === spellId,
  ).length;
  const perDay = adventureMagicBonus(hero).perDay;
  if (today >= perDay)
    return perDay > 1
      ? `already cast ${perDay} times today`
      : "already cast today";
  if (s.deferred) return `not on this map: ${s.deferred}`;
  if (typeof s.moveCost === "number" && hero.mp < s.moveCost)
    return `needs ${s.moveCost} movement`;
  if (s.moveCost === "all" && hero.mp < TOW_LINE_MIN_MP)
    return `needs at least ${TOW_LINE_MIN_MP} movement`;
  if (spellId === "tow-line") {
    if (pylonAtHero(state, hero) === undefined) return "stand on a pylon";
    if (towLineStops(state, hero).length === 0)
      return "no other pylon your player has marked";
  }
  if (spellId === "second-helping") return secondHelpingError(state, hero);
  return null;
}

/** The pylon whose cell the hero stands on, if any. */
export function pylonAtHero(
  state: GameState,
  hero: HeroState,
): MapObject | undefined {
  return state.map.objects.find(
    (o) => o.x === hero.x && o.y === hero.y && objectTypeOf(o) === "pylon",
  );
}

/**
 * Where Tow Line can take the hero (RULES_V2 2.8): every other pylon its
 * player has marked by visiting, not held by a hero.
 */
export function towLineStops(state: GameState, hero: HeroState): MapObject[] {
  const here = pylonAtHero(state, hero);
  return state.map.objects.filter(
    (o) =>
      objectTypeOf(o) === "pylon" &&
      o.id !== here?.id &&
      playerListed(state, o.id, hero.owner) &&
      !state.heroes.some((h) => h.alive && h.x === o.x && h.y === o.y),
  );
}

type Effect = (
  next: GameState,
  hero: HeroState,
  p: number,
  t: AdventureTarget,
  events: GameEvent[],
) => string | null;

/** Whether a neutral stack at (x, y) is in Parley / Opening Salvo reach. */
export function inMonsterSpellRange(
  hero: HeroState,
  x: number,
  y: number,
): boolean {
  const d = chebyshev(x, y, hero.x, hero.y);
  return d >= 1 && d <= MONSTER_SPELL_RANGE;
}

/** The neutral stacks Parley and Opening Salvo can target from here. */
export function monstersInSpellRange(
  state: GameState,
  hero: HeroState,
): MonsterState[] {
  return Object.values(state.monsters).filter((m) =>
    inMonsterSpellRange(hero, m.x, m.y),
  );
}

function nearbyMonster(
  next: GameState,
  hero: HeroState,
  t: AdventureTarget,
): { id: string; creature: string; count: number } | string {
  const m = t.monsterId ? next.monsters[t.monsterId] : undefined;
  if (!m) return "choose a neutral stack";
  if (!inMonsterSpellRange(hero, m.x, m.y))
    return `the stack must be within ${MONSTER_SPELL_RANGE} cells of the hero`;
  return { id: m.id, creature: m.creature, count: m.count };
}

const EFFECTS: Readonly<Record<string, Effect>> = {
  "green-road": (next, hero) => {
    const store = mutableStore(next, hero.id);
    store.greenRoadDay = next.day;
    if (!isForest(next, hero.x, hero.y)) store.lastClear = [hero.x, hero.y];
    return null;
  },
  parley: (next, hero, p, t) => {
    const m = nearbyMonster(next, hero, t);
    if (typeof m === "string") return m;
    const fv = getCreature(m.creature as never).fightValue * m.count;
    const max = 300 + 150 * p;
    if (fv > max) return `fight value ${fv} is above ${max}`;
    const store = mutableStore(next, hero.id);
    if (store.parleyDay !== next.day) store.parley = [];
    store.parleyDay = next.day;
    store.parley = [...(store.parley ?? []), m.id];
    return null;
  },
  "read-the-seal": (next, hero, p, t) => {
    const range = 6 + p;
    const player = String(hero.owner);
    const lines: string[] = [];
    if (t.heroId) {
      const foe = findHero(next, t.heroId);
      if (!foe || !foe.alive || foe.owner === hero.owner)
        return "choose an enemy hero";
      if (chebyshev(foe.x, foe.y, hero.x, hero.y) > range)
        return `the hero is more than ${range} cells away`;
      const fm = heroMagic(foe);
      lines.push(
        `${foe.name}: mana ${fm.mana}/${fm.maxMana}`,
        `Pages: ${fm.knownSpells.map((id) => spellInfo(id).name).join(", ") || "none"}`,
        `Scrolls: ${fm.scrolls.map((id) => spellInfo(id).name).join(", ") || "none"}`,
        `Worn: ${foe.worn.filter((x) => x !== null).join(", ") || "nothing"}`,
        `Backpack: ${foe.backpack.join(", ") || "empty"}`,
      );
    } else if (t.objectId) {
      const obj = next.map.objects.find((o) => o.id === t.objectId);
      if (!obj || obj.data.sealed !== true) return "choose a sealed site";
      if (chebyshev(obj.x, obj.y, hero.x, hero.y) > range)
        return `the site is more than ${range} cells away`;
      lines.push(
        `${obj.id}: ${JSON.stringify(obj.data.contents ?? "nothing")}`,
      );
    } else return "choose an enemy hero or a sealed site";
    const m = next.magic ?? { heroes: {} };
    next.magic = { ...m, readings: { ...(m.readings ?? {}), [player]: lines } };
    return null;
  },
  "borrowed-day": (_next, hero, p) => {
    const gain = Math.min(1000, 300 + 50 * p);
    hero.mp += gain;
    // The hero model takes the debt off the next day's movement.
    hero.mpDebt += gain;
    return null;
  },
  "saved-hour": (next, hero, p, t) => {
    const max = Math.min(hero.mp, 200 + 50 * p);
    const amount = Math.trunc(t.amount ?? max);
    if (amount < 1 || amount > max) return `save 1 to ${max} movement`;
    hero.mp -= amount;
    const store = mutableStore(next, hero.id);
    store.saved = (store.saved ?? 0) + amount;
    return null;
  },
  "ask-the-dead": (next, hero, p, t) => {
    if (t.x === undefined || t.y === undefined) return "choose a cell";
    const player = findPlayer(next, hero.owner);
    if (!player) return "no player";
    const w = next.map.width;
    if (t.x < 0 || t.y < 0 || t.x >= w || t.y >= next.map.height)
      return "choose a cell on the map";
    if (player.explored[t.y * w + t.x] !== true)
      return "choose an explored cell";
    if (chebyshev(t.x, t.y, hero.x, hero.y) > ASK_RANGE)
      return `the cell is more than ${ASK_RANGE} cells away`;
    revealDisc(next.map, player.explored, t.x, t.y, 4 + Math.floor(p / 2));
    return null;
  },
  dowse: (next, hero, p) => {
    const range = 5 + p;
    const found: Array<[number, number]> = next.map.objects
      .filter(
        (o) =>
          o.data.buried === true &&
          chebyshev(o.x, o.y, hero.x, hero.y) <= range,
      )
      .map((o) => [o.x, o.y]);
    const m = next.magic ?? { heroes: {} };
    const player = String(hero.owner);
    const old = m.marks?.[player] ?? [];
    const merged = [...old];
    for (const c of found)
      if (!merged.some((x) => x[0] === c[0] && x[1] === c[1])) merged.push(c);
    next.magic = { ...m, marks: { ...(m.marks ?? {}), [player]: merged } };
    return null;
  },
  "second-helping": (next, hero, p, _t, events) =>
    secondHelping(next, hero, 100 + 40 * p, events),
  "tow-line": (next, hero, _p, t, events) => {
    if (pylonAtHero(next, hero) === undefined) return "stand on a pylon";
    const to = towLineStops(next, hero).find((o) => o.id === t.objectId);
    if (to === undefined) return "choose another pylon your player has marked";
    hero.x = to.x;
    hero.y = to.y;
    hero.mp = 0;
    const player = findPlayer(next, hero.owner);
    if (player) revealDisc(next.map, player.explored, to.x, to.y, 4);
    events.push({
      type: "teleported",
      heroId: hero.id,
      x: to.x,
      y: to.y,
      via: "tow-line",
    });
    return null;
  },
  "opening-salvo": (next, hero, p, t, events) => {
    const m = nearbyMonster(next, hero, t);
    if (typeof m === "string") return m;
    const hp = getCreature(m.creature as never).hp;
    const kills = Math.min(m.count, Math.floor((30 + 15 * p) / hp));
    const left = m.count - kills;
    hero.mp -= 100;
    if (left <= 0) {
      next.monsters = Object.fromEntries(
        Object.entries(next.monsters).filter(([id]) => id !== m.id),
      );
      events.push({ type: "monster-defeated", monsterId: m.id });
    } else {
      const live = must(next.monsters[m.id], "monster");
      live.count = left;
    }
    return null;
  },
};

/**
 * Casts an adventure spell from the hero's book (or a scroll from its
 * case): rank, mana, once per day, the spell's own target rules.
 */
export function castAdventureSpell(
  state: GameState,
  heroId: string,
  spellId: string,
  target: AdventureTarget = {},
  options: { readonly scroll?: boolean } = {},
): CommandResult {
  const original = findHero(state, heroId);
  if (!original || !original.alive)
    return fail("unknown-hero", `no hero ${heroId}`);
  const blocked = checkTurn(state, original.owner);
  if (blocked !== null) return blocked;
  let def: AdventureSpellDef;
  try {
    def = adventureSpell(spellId);
  } catch {
    return fail("bad-choice", `${spellId} is not an adventure spell`);
  }
  const scroll = options.scroll === true;
  const err = adventureCastError(state, original, spellId, scroll);
  if (err) return fail("bad-choice", err);
  const next = cloneState(state);
  const hero = must(findHero(next, heroId), "hero");
  const p = adventurePower(hero, spellId, scroll);
  const events: GameEvent[] = [];
  const effect = must(EFFECTS[def.id], "effect");
  const refused = effect(next, hero, p, target, events);
  if (refused) return fail("bad-choice", refused);
  const m = heroMagic(hero);
  if (scroll) {
    const i = m.scrolls.indexOf(spellId);
    withHeroMagic(hero, {
      scrolls: [...m.scrolls.slice(0, i), ...m.scrolls.slice(i + 1)],
    });
  } else {
    withHeroMagic(hero, {
      mana: m.mana - adventureManaCost(hero, spellId),
    });
  }
  const store = mutableStore(next, hero.id);
  store.castToday = [...store.castToday, spellId];
  return success(next, events);
}

// ---------------------------------------------------------------------------
// Movement hooks (pathfinding.ts reads these)

export function isForest(state: GameState, x: number, y: number): boolean {
  return state.map.cells[y * state.map.width + x]?.obstacle === "forest";
}

/** After a move, in place: remember the last clear cell (Green Road). */
export function noteHeroPath(
  state: GameState,
  hero: HeroState,
  from: readonly [number, number],
  cells: ReadonlyArray<readonly [number, number]>,
): void {
  const store = storeOf(state, hero.id);
  if (store.greenRoadDay !== state.day) return;
  const all = [from, ...cells];
  for (let i = all.length - 1; i >= 0; i--) {
    const c = all[i] as readonly [number, number];
    if (!isForest(state, c[0], c[1])) {
      mutableStore(state, hero.id).lastClear = [c[0], c[1]];
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// The day

/**
 * Before the new day starts (the old day's end), in place: heroes left in
 * forest by Green Road go back to their last clear cell.
 */
export function magicDayEnd(state: GameState): void {
  for (const hero of state.heroes) {
    if (!hero.alive) continue;
    const store = storeOf(state, hero.id);
    if (store.greenRoadDay === undefined) continue;
    if (isForest(state, hero.x, hero.y) && store.lastClear) {
      hero.x = store.lastClear[0];
      hero.y = store.lastClear[1];
    }
    const s = mutableStore(state, hero.id);
    delete s.greenRoadDay;
    delete s.lastClear;
  }
}

/**
 * At the start of a day, after movement is reset, in place (2.3, 2.8):
 * mana returns (1 + floor(Lore / 3), full in an own town with a guild),
 * Borrowed Day and Saved Hour settle, the daily casts reset, and heroes in
 * their own towns learn the guild's spells.
 */
export function magicDayStart(
  state: GameState,
  events: GameEvent[],
  hero: HeroState,
): void {
  const store = mutableStore(state, hero.id);
  store.castToday = [];
  delete store.parley;
  delete store.parleyDay;
  if (store.saved) {
    hero.mp = Math.min(DAILY_MP_CAP, hero.mp + store.saved);
    delete store.saved;
  }
  const m = heroMagic(hero);
  const town = townAtHero(state, hero);
  const ownGuild =
    town !== undefined && town.owner === hero.owner ? guildLevelOf(town) : 0;
  // The daily return is the hero model's (startHeroDay); a guild town
  // fills the hero up (RULES_V2 2.3).
  if (ownGuild > 0 && m.mana < m.maxMana)
    withHeroMagic(hero, { mana: m.maxMana });
  if (town !== undefined && town.owner === hero.owner)
    learnInTown(state, hero, town.id, events);
}

/** In place: the hero learns every guild spell of the town it can (2.9). */
export function learnInTown(
  state: GameState,
  hero: HeroState,
  townId: string,
  events: GameEvent[],
): string[] {
  const town = state.towns[townId];
  if (!town || town.owner !== hero.owner) return [];
  const level = guildLevelOf(town);
  if (level === 0) return [];
  const m = heroMagic(hero);
  const learnt = learnableFromGuild(m, townGuild(state.seed, town), level);
  if (learnt.length > 0)
    withHeroMagic(hero, { knownSpells: [...m.knownSpells, ...learnt] });
  if (learnt.length > 0)
    events.push({
      type: "spells-learnt",
      heroId: hero.id,
      townId,
      spells: learnt,
    });
  return learnt;
}

/**
 * A shrine or teaching site (content): the spell as a page if the hero can
 * learn it, else as a scroll while the case has room (2.2, 2.9). In place;
 * returns what happened.
 */
export function teachSpell(
  hero: HeroState,
  spellId: string,
): "page" | "scroll" | "known" | "full" {
  const s = spellInfo(spellId);
  const m = heroMagic(hero);
  if (m.knownSpells.includes(spellId)) return "known";
  if (canLearn(m, s.school, s.tier)) {
    withHeroMagic(hero, { knownSpells: [...m.knownSpells, spellId] });
    return "page";
  }
  if (m.scrolls.length >= m.scrollCase) return "full";
  withHeroMagic(hero, { scrolls: [...m.scrolls, spellId] });
  return "scroll";
}

/** In place: mana spent and scrolls used in a battle stay spent (1.12). */
export function applyBattleMagic(
  hero: HeroState,
  outcome: MagicOutcome | undefined,
): void {
  if (!outcome) return;
  const m = heroMagic(hero);
  const scrolls = [...m.scrolls];
  for (const id of outcome.scrollsUsed) {
    const i = scrolls.indexOf(id);
    if (i >= 0) scrolls.splice(i, 1);
  }
  withHeroMagic(hero, {
    mana: Math.max(0, m.mana - outcome.manaSpent),
    scrolls,
  });
}
