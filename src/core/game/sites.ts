/**
 * Visit rules of the adventure-map object catalogue
 * (docs/design/CONTENT_MAP_OBJECTS.md, bead bzc.13).
 *
 * - {@link visitSite}: what stepping onto an object's entrance does, in
 *   place (called by visitAtHero for dwellings, sites, banks, artifacts and
 *   teleports). A visit that needs a choice emits a "site" event with
 *   `options`; the player answers with {@link useSite}.
 * - {@link useSite}: the choice (hire, pick a stat, buy, trade, complete a
 *   quest, take one vault treasure...).
 * - {@link digHere}: digging for buried treasure (section 4).
 * - {@link siteBattleWon}: a bank's, vault's or sealed box's prize after its
 *   guard is beaten (called by the battle seam).
 * - {@link objectValueFor}, {@link objectGuardFv}: what an object is worth
 *   to a player now and how strong its guard is, for the AI.
 * - {@link describeObject}: the hover text.
 *
 * Every seeded content (which spell, artifact, quest, size) was fixed by the
 * generator in `obj.data`; weekly rolls (windmill, orchard, tollhouse
 * stock) derive from the game seed, the object and the week.
 */
import {
  CURSE_LIFT_SITE_COST,
  findArtifact,
  getArtifact,
  isCursed,
  KEYSTONE,
} from "../../data/artifacts.ts";
import { getCreature, isCreatureId } from "../../data/creatures.ts";
import { RESOURCE_IDS } from "../../data/economy.ts";
import {
  battleSpellsOfTier,
  findMapSpell,
  SCROLL_VALUE,
  spellName,
} from "../../data/map-spells.ts";
import {
  MAX_HEROES,
  OASIS_MP,
  OBJECT_TYPES,
  RESET_TEXT,
  SHOVEL_DIG_MP,
  STABLES_MP,
  type ObjectTypeId,
  type Prize,
  type Quest,
} from "../../data/objectTypes.ts";
import { findHeroDef } from "../../data/players.ts";
import { findSkill, MAX_SKILL_RANK, MAX_SKILLS } from "../../data/skills.ts";
import { STRAY_HOMES } from "../../data/strays.ts";
import type {
  CreatureId,
  ResourceAmounts,
  ResourceId,
} from "../../data/types.ts";
import type { School } from "../battle/types.ts";
import type { MapObject } from "../map/types.ts";
import { createRng, deriveSeed } from "../rng.ts";
import { canCarry, giveArtifact, giveScroll } from "./artifacts.ts";
import { maxMana, schoolRank, vowRestrictions } from "./effects.ts";
import { gainXp, skillBarred } from "./hero.ts";
import { heroByDef, newHeroState, startingArmy } from "./players.ts";
import { xpForLevel } from "./progression.ts";
import { canAfford, subtractResources } from "./resources.ts";
import {
  gateOpen,
  isGone,
  objectTypeOf,
  playerListed,
  siteFor,
  siteOf,
  weekEnd,
  weekOf,
} from "./site-state.ts";
import {
  addToArmy,
  checkTurn,
  cloneState,
  fail,
  findHero,
  findObject,
  findPlayer,
  heroAt,
  heroesOf,
  must,
  revealDisc,
  slotFor,
  success,
} from "./state.ts";
import type {
  CommandResult,
  GameEvent,
  GameState,
  HeroState,
  PendingBattle,
  SiteOption,
} from "./types.ts";

type Stat = "attack" | "defense" | "power" | "lore";
const STATS: readonly Stat[] = ["attack", "defense", "power", "lore"];
const STAT_NAME: Readonly<Record<Stat, string>> = {
  attack: "Attack",
  defense: "Defense",
  power: "Power",
  lore: "Lore",
};

// ---------------------------------------------------------------------------
// Small readers of obj.data

const str = (obj: MapObject, k: string): string => String(obj.data[k] ?? "");
const num = (obj: MapObject, k: string, d = 0): number => {
  const v = obj.data[k];
  return typeof v === "number" && Number.isFinite(v) ? v : d;
};
function prizeOf(obj: MapObject, k = "prize"): Prize {
  const v = obj.data[k];
  return v !== null && typeof v === "object" ? (v as Prize) : {};
}
function questOf(obj: MapObject): Quest | null {
  const v = obj.data["quest"];
  return v !== null && typeof v === "object" ? (v as Quest) : null;
}
function guardData(
  obj: MapObject,
): Array<{ creature: CreatureId; count: number }> {
  const raw = obj.data["guard"];
  if (!Array.isArray(raw)) return [];
  const out: Array<{ creature: CreatureId; count: number }> = [];
  for (const s of raw as Array<Record<string, unknown>>) {
    const c = s["creature"];
    const n = s["count"];
    if (isCreatureId(c) && typeof n === "number" && n > 0) {
      out.push({ creature: c, count: n });
    }
  }
  return out;
}

/** The guard a bank, vault or sealed box fights with now ([] if beaten). */
export function siteGuard(
  state: GameState,
  obj: MapObject,
): Array<{ creature: CreatureId; count: number }> {
  return siteOf(state, obj.id).guard ?? guardData(obj);
}

function fvOf(
  stacks: ReadonlyArray<{ creature: string; count: number }>,
): number {
  return stacks.reduce(
    (n, s) => n + s.count * getCreature(s.creature).fightValue,
    0,
  );
}

// ---------------------------------------------------------------------------
// Prizes

const RES_VALUE: Readonly<Record<ResourceId, number>> = {
  gold: 1,
  wood: 100,
  ore: 150,
  essence: 500,
};

/** The gold-equivalent value of a prize (section 2's scale). */
export function prizeValue(p: Prize): number {
  let v = 0;
  for (const r of RESOURCE_IDS) v += (p[r] ?? 0) * RES_VALUE[r];
  v += Math.round((p.xp ?? 0) * 1.3);
  for (const a of p.artifacts ?? []) v += findArtifact(a)?.value ?? 0;
  for (const s of p.scrolls ?? []) {
    v += SCROLL_VALUE[findMapSpell(s)?.tier ?? 1] ?? 300;
  }
  for (const j of p.joiners ?? []) {
    if (isCreatureId(j.creature)) {
      v += j.count * getCreature(j.creature).fightValue;
    }
  }
  if (p.stat !== undefined) v += 1500 * p.stat.amount;
  if (p.skill !== undefined) v += 2000;
  if (p.spell !== undefined) {
    v += SCROLL_VALUE[findMapSpell(p.spell)?.tier ?? 1] ?? 300;
  }
  return v;
}

/** "1000 gold, 5 wood, a Tin Sabre, 1500 experience". */
export function prizeText(p: Prize): string {
  const parts: string[] = [];
  for (const r of RESOURCE_IDS) {
    if ((p[r] ?? 0) > 0) parts.push(`${p[r] ?? 0} ${r}`);
  }
  if ((p.xp ?? 0) > 0) parts.push(`${p.xp ?? 0} experience`);
  for (const a of p.artifacts ?? []) {
    parts.push(findArtifact(a)?.name ?? a);
  }
  for (const s of p.scrolls ?? []) parts.push(`a scroll of ${spellName(s)}`);
  for (const j of p.joiners ?? []) {
    if (isCreatureId(j.creature)) {
      const d = getCreature(j.creature);
      parts.push(`${j.count} ${j.count === 1 ? d.name : d.plural} join`);
    }
  }
  if (p.stat !== undefined) {
    parts.push(`+${p.stat.amount} ${STAT_NAME[p.stat.stat]}`);
  }
  if (p.skill !== undefined) parts.push(findSkill(p.skill)?.name ?? p.skill);
  if (p.spell !== undefined) parts.push(`the spell ${spellName(p.spell)}`);
  return parts.length === 0 ? "nothing" : parts.join(", ");
}

/** Whether the hero can learn a spell as a page now (RULES_V2 2.2). */
export function canLearnPage(hero: HeroState, spell: string): boolean {
  const def = findMapSpell(spell);
  if (def === undefined || hero.pages.includes(spell)) return false;
  const rank = schoolRank(hero, def.school);
  const maxTier = rank >= 3 ? 5 : rank === 2 ? 4 : rank === 1 ? 2 : 0;
  return def.tier <= maxTier;
}

/** Teaches a spell: a page if it can, else a scroll. Returns what it did. */
function teachSpell(hero: HeroState, spell: string): string {
  if (canLearnPage(hero, spell)) {
    hero.pages.push(spell);
    return `learns ${spellName(spell)}`;
  }
  if (hero.pages.includes(spell)) return `already knows ${spellName(spell)}`;
  if (giveScroll(hero, spell)) return `takes a scroll of ${spellName(spell)}`;
  return `has no room for a scroll of ${spellName(spell)}`;
}

/** Why the hero cannot take this skill (null: it can). */
function skillRefusal(hero: HeroState, skill: string): string | null {
  const have = hero.skills.find((s) => s.id === skill);
  const rank = (have?.rank ?? 0) + 1;
  if (findSkill(skill) === undefined) return "unknown skill";
  if (have !== undefined && rank > MAX_SKILL_RANK) return "already mastered";
  if (have === undefined && hero.skills.length >= MAX_SKILLS) {
    return "no free skill slot";
  }
  if (skillBarred(vowRestrictions(hero), skill as never, rank)) {
    return "a vow bars it";
  }
  return null;
}

function addSkill(hero: HeroState, skill: string, events: GameEvent[]): void {
  const have = hero.skills.find((s) => s.id === skill);
  if (have !== undefined) have.rank++;
  else hero.skills.push({ id: skill, rank: 1 });
  events.push({
    type: "skill-gained",
    heroId: hero.id,
    skill,
    rank: have?.rank ?? 1,
  });
}

function raiseStat(
  hero: HeroState,
  stat: Stat,
  amount: number,
  events: GameEvent[],
): void {
  hero[stat] += amount;
  for (let i = 0; i < amount; i++) {
    events.push({ type: "stat-gained", heroId: hero.id, stat });
  }
}

/** Gives a prize to a hero and its player, in place. Returns its text. */
export function grantPrize(
  state: GameState,
  hero: HeroState,
  p: Prize,
  events: GameEvent[],
): string {
  const player = findPlayer(state, hero.owner);
  const lost: string[] = [];
  if (player !== undefined) {
    for (const r of RESOURCE_IDS) player.resources[r] += p[r] ?? 0;
  }
  if ((p.xp ?? 0) > 0) gainXp(hero, p.xp ?? 0, events);
  for (const a of p.artifacts ?? []) {
    if (!giveArtifact(hero, a)) lost.push(findArtifact(a)?.name ?? a);
  }
  for (const s of p.scrolls ?? []) {
    if (!giveScroll(hero, s)) lost.push(`a scroll of ${spellName(s)}`);
  }
  for (const j of p.joiners ?? []) {
    if (!isCreatureId(j.creature)) continue;
    if (!addToArmy(hero.army, j.creature, j.count)) {
      lost.push(getCreature(j.creature).plural);
    }
  }
  if (p.stat !== undefined) raiseStat(hero, p.stat.stat, p.stat.amount, events);
  if (p.skill !== undefined && skillRefusal(hero, p.skill) === null) {
    addSkill(hero, p.skill, events);
  }
  let extra = "";
  if (p.spell !== undefined) extra = `; the hero ${teachSpell(hero, p.spell)}`;
  const text = prizeText(p) + extra;
  return lost.length > 0
    ? `${text} (no room for ${lost.join(", ")}: left behind)`
    : text;
}

// ---------------------------------------------------------------------------
// Quests

/** One line describing a quest. */
export function questText(state: GameState, q: Quest): string {
  switch (q.kind) {
    case "artifact":
      return `Bring the ${findArtifact(q.artifact)?.name ?? q.artifact}`;
    case "creatures": {
      const d = isCreatureId(q.creature) ? getCreature(q.creature) : null;
      return `Bring ${q.count} ${d?.plural ?? q.creature}`;
    }
    case "resources":
      return `Pay ${prizeText(q.cost)}`;
    case "level":
      return `Arrive with a hero of level ${q.level}`;
    case "guard": {
      const m = state.monsters[q.monster];
      const obj = findObject(state.map, q.monster);
      const name =
        m !== undefined ? getCreature(m.creature).plural : "the marked guard";
      const at = obj !== undefined ? ` at (${obj.x}, ${obj.y})` : "";
      return `Defeat the ${name}${at}`;
    }
    case "visit": {
      const obj = findObject(state.map, q.object);
      const t = obj === undefined ? null : objectTypeOf(obj);
      const name = t === null ? "the named site" : OBJECT_TYPES[t].name;
      const at = obj !== undefined ? ` at (${obj.x}, ${obj.y})` : "";
      return `Visit the ${name}${at}, then return`;
    }
  }
}

/** Why the hero has not completed the quest yet (null: it has). */
export function questMissing(
  state: GameState,
  hero: HeroState,
  q: Quest,
): string | null {
  switch (q.kind) {
    case "artifact":
      return hero.backpack.includes(q.artifact) ||
        hero.worn.includes(q.artifact)
        ? null
        : "the hero does not carry it";
    case "creatures": {
      const have = hero.army.reduce(
        (n, s) => n + (s?.creature === q.creature ? s.count : 0),
        0,
      );
      return have >= q.count ? null : `the hero has ${have}`;
    }
    case "resources": {
      const p = findPlayer(state, hero.owner);
      return p !== undefined && canAfford(p.resources, q.cost)
        ? null
        : "not enough resources";
    }
    case "level":
      return hero.level >= q.level ? null : `the hero is level ${hero.level}`;
    case "guard":
      return state.monsters[q.monster] === undefined ? null : "it still stands";
    case "visit":
      return (siteOf(state, q.object).seen ?? []).includes(hero.owner)
        ? null
        : "not visited yet";
  }
}

/** Takes what a completed quest asks for, in place. */
function payQuest(state: GameState, hero: HeroState, q: Quest): void {
  if (q.kind === "artifact") {
    const i = hero.backpack.indexOf(q.artifact);
    if (i >= 0) hero.backpack.splice(i, 1);
    else hero.worn = hero.worn.map((a) => (a === q.artifact ? null : a));
  } else if (q.kind === "creatures") {
    let left = q.count;
    hero.army = hero.army.map((s) => {
      if (s === null || s.creature !== q.creature || left <= 0) return s;
      const take = Math.min(left, s.count);
      left -= take;
      return s.count - take > 0 ? { ...s, count: s.count - take } : null;
    });
    const emptied = hero.army.every((s) => s === null);
    if (emptied) {
      // Keep the hero standing: one creature stays (RULES_V2 3.9).
      hero.army[0] = { creature: q.creature as CreatureId, count: 1 };
    }
  } else if (q.kind === "resources") {
    const p = findPlayer(state, hero.owner);
    if (p !== undefined) p.resources = subtractResources(p.resources, q.cost);
  }
}

// ---------------------------------------------------------------------------
// Dwellings

/** The creature a map dwelling recruits, its weekly stock and its cost. */
export function dwellingOffer(
  state: GameState,
  obj: MapObject,
): { creature: CreatureId; weekly: number; cost: ResourceAmounts } | null {
  const c = obj.data["creature"];
  if (!isCreatureId(c)) return null;
  const def = getCreature(c);
  const home = STRAY_HOMES[c as keyof typeof STRAY_HOMES];
  if (home !== undefined) {
    return { creature: c, weekly: home.weekly, cost: { gold: home.hire } };
  }
  return { creature: c, weekly: Math.max(1, def.growth), cost: def.cost };
  void state;
}

/** Current stock (refilled to one week's on the first visit of a week). */
export function dwellingStock(state: GameState, obj: MapObject): number {
  const s = siteOf(state, obj.id);
  const offer = dwellingOffer(state, obj);
  if (offer === null) return 0;
  return s.stockWeek === weekOf(state.day) ? (s.stock ?? 0) : offer.weekly;
}

function lodgeOpen(state: GameState, obj: MapObject, player: number): boolean {
  return (
    obj.data["type"] !== "caretaker-lodge" ||
    playerListed(state, obj.id, player)
  );
}

function maxHire(state: GameState, hero: HeroState, obj: MapObject): number {
  const offer = dwellingOffer(state, obj);
  const p = findPlayer(state, hero.owner);
  if (offer === null || p === undefined) return 0;
  if (slotFor(hero.army, offer.creature) < 0) return 0;
  let n = dwellingStock(state, obj);
  for (const r of RESOURCE_IDS) {
    const c = offer.cost[r] ?? 0;
    if (c > 0) n = Math.min(n, Math.floor(p.resources[r] / c));
  }
  return Math.max(0, n);
}

// ---------------------------------------------------------------------------
// Seeded weekly contents

function weekRng(state: GameState, obj: MapObject, salt: string) {
  return createRng(
    deriveSeed(state.seed, `${salt}:${obj.id}`, weekOf(state.day)),
  );
}

/** This week's take of a weekly producer. */
export function weeklyTake(state: GameState, obj: MapObject): Prize {
  const t = objectTypeOf(obj);
  const rng = weekRng(state, obj, "weekly");
  if (t === "windmill") {
    return rng.chance(0.5) ? { wood: rng.int(3, 6) } : { ore: rng.int(2, 4) };
  }
  if (t === "orchard") {
    return rng.chance(0.5) ? { essence: rng.int(1, 2) } : { gold: 500 };
  }
  return { gold: 1000 };
}

/** The tollhouse's three items this week (artifacts, consumables, scrolls). */
export function tollhouseStock(state: GameState, obj: MapObject): string[] {
  const rng = weekRng(state, obj, "tollhouse");
  const pool = (obj.data["pool"] as string[] | undefined) ?? [];
  const out: string[] = [];
  for (let i = 0; i < 3 && pool.length > 0; i++) out.push(rng.pick(pool));
  return out;
}

/** "scroll:<spell>" items are scrolls; others are artifact ids. */
function itemName(item: string): string {
  return item.startsWith("scroll:")
    ? `Scroll of ${spellName(item.slice(7))}`
    : (findArtifact(item)?.name ?? item);
}
function itemValue(item: string): number {
  if (item.startsWith("scroll:")) {
    return SCROLL_VALUE[findMapSpell(item.slice(7))?.tier ?? 1] ?? 300;
  }
  return findArtifact(item)?.value ?? 0;
}

// ---------------------------------------------------------------------------
// Visiting

function used(state: GameState, obj: MapObject, hero: HeroState): boolean {
  const t = objectTypeOf(obj);
  if (t === null) return false;
  const s = siteOf(state, obj.id);
  switch (OBJECT_TYPES[t].reset) {
    case "per-hero":
      return s.heroes?.includes(hero.id) ?? false;
    case "per-day":
      return s.last?.[hero.id] === state.day;
    case "per-week-hero":
      return s.last?.[hero.id] === weekOf(state.day);
    case "weekly":
      return s.week === weekOf(state.day);
    case "per-player":
      return s.players?.includes(hero.owner) ?? false;
    case "one-time":
      return isGone(state, obj) || s.done === true;
    default:
      return false;
  }
}

function markUsed(state: GameState, obj: MapObject, hero: HeroState): void {
  const t = objectTypeOf(obj);
  if (t === null) return;
  const s = siteFor(state, obj.id);
  switch (OBJECT_TYPES[t].reset) {
    case "per-hero":
      s.heroes = [...(s.heroes ?? []), hero.id];
      break;
    case "per-day":
      s.last = { ...(s.last ?? {}), [hero.id]: state.day };
      break;
    case "per-week-hero":
      s.last = { ...(s.last ?? {}), [hero.id]: weekOf(state.day) };
      break;
    case "weekly":
      s.week = weekOf(state.day);
      break;
    case "per-player":
      if (!(s.players ?? []).includes(hero.owner)) {
        s.players = [...(s.players ?? []), hero.owner];
      }
      break;
    case "one-time":
      if (OBJECT_TYPES[t].vanishes) {
        if (!state.collected.includes(obj.id)) state.collected.push(obj.id);
      } else s.done = true;
      break;
    default:
      break;
  }
}

function say(
  events: GameEvent[],
  hero: HeroState,
  obj: MapObject,
  text: string,
  options?: SiteOption[],
): void {
  events.push({
    type: "site",
    heroId: hero.id,
    objectId: obj.id,
    text,
    ...(options !== undefined && options.length > 0 ? { options } : {}),
  });
}

function addBuff(hero: HeroState, buff: string): boolean {
  if (hero.buffs.includes(buff)) return false;
  hero.buffs.push(buff);
  return true;
}

/** The options a site offers this hero now (empty: no choice). */
export function siteOptions(
  state: GameState,
  hero: HeroState,
  obj: MapObject,
): SiteOption[] {
  const t = objectTypeOf(obj);
  const player = findPlayer(state, hero.owner);
  const gold = player?.resources.gold ?? 0;
  const out: SiteOption[] = [];
  switch (t) {
    case "faction-outpost":
    case "stray-hut":
    case "caretaker-lodge": {
      const offer = dwellingOffer(state, obj);
      if (offer === null || !lodgeOpen(state, obj, hero.owner)) break;
      if (siteOf(state, obj.id).owner !== hero.owner) break;
      const n = maxHire(state, hero, obj);
      const d = getCreature(offer.creature);
      const why = n > 0 ? undefined : "none affordable";
      out.push({
        id: `hire:${n}`,
        label: `Hire ${n} ${n === 1 ? d.name : d.plural}`,
        ...(why !== undefined ? { disabled: why } : {}),
      });
      break;
    }
    case "arena":
      if (used(state, obj, hero)) break;
      out.push({ id: "stat:attack", label: "+2 Attack" });
      out.push({ id: "stat:defense", label: "+2 Defense" });
      break;
    case "academy": {
      if (used(state, obj, hero)) break;
      const pair = (obj.data["stats"] as Stat[] | undefined) ?? [
        "attack",
        "defense",
      ];
      for (const st of pair) {
        out.push({
          id: `stat:${st}`,
          label: `+1 ${STAT_NAME[st]} for 2000 gold`,
          ...(gold < 2000 ? { disabled: "not enough gold" } : {}),
        });
      }
      break;
    }
    case "tree-of-knowledge": {
      if (used(state, obj, hero)) break;
      const price = (obj.data["price"] as ResourceAmounts | undefined) ?? {};
      if (Object.keys(price).length === 0) break;
      const ok = player !== undefined && canAfford(player.resources, price);
      out.push({
        id: "pay",
        label: `Pay ${prizeText(price)} for a level`,
        ...(ok ? {} : { disabled: "not enough resources" }),
      });
      break;
    }
    case "hermit":
      if (used(state, obj, hero)) break;
      for (const s of hero.skills) {
        out.push({
          id: `forget:${s.id}`,
          label: `Forget ${findSkill(s.id)?.name ?? s.id}`,
        });
      }
      out.push({ id: "redraw", label: "Redraw my next skill offer" });
      break;
    case "keepers-vault": {
      const s = siteOf(state, obj.id);
      if (s.done === true || siteGuard(state, obj).length > 0) break;
      const choices = (obj.data["choices"] as Prize[] | undefined) ?? [];
      choices.forEach((c, i) => {
        out.push({ id: `take:${i}`, label: `Take ${prizeText(c)}` });
      });
      break;
    }
    case "tollhouse": {
      const s = siteOf(state, obj.id);
      const sold = s.soldWeek === weekOf(state.day) ? (s.sold ?? []) : [];
      tollhouseStock(state, obj).forEach((item, i) => {
        const price = itemValue(item);
        out.push({
          id: `buy:${i}`,
          label: `Buy ${itemName(item)} for ${price} gold`,
          ...(sold.includes(i)
            ? { disabled: "sold" }
            : gold < price
              ? { disabled: "not enough gold" }
              : {}),
        });
      });
      hero.backpack.forEach((a, i) => {
        const def = findArtifact(a);
        if (def === undefined || def.kind === "relic") return;
        out.push({
          id: `sell:${i}`,
          label: `Sell ${def.name} for ${Math.floor(def.value / 2)} gold`,
        });
      });
      hero.scrolls.forEach((sp, i) => {
        out.push({
          id: `sell-scroll:${i}`,
          label: `Sell a scroll of ${spellName(sp)} for ${Math.floor(itemValue(`scroll:${sp}`) / 2)} gold`,
        });
      });
      break;
    }
    case "curse-lifters-shrine": {
      const ok =
        player !== undefined &&
        canAfford(player.resources, CURSE_LIFT_SITE_COST);
      hero.worn.forEach((a, i) => {
        if (a === null || !isCursed(a)) return;
        out.push({
          id: `lift:${i}`,
          label: `Lift the curse of ${getArtifact(a).name} (1000 gold, 2 essence)`,
          ...(ok ? {} : { disabled: "not enough resources" }),
        });
      });
      break;
    }
    case "roadside-inn": {
      const bought =
        siteOf(state, obj.id).rumours?.[String(weekOf(state.day))] ?? [];
      out.push({
        id: "rumour",
        label: "Buy a rumour for 250 gold",
        ...(bought.includes(hero.owner)
          ? { disabled: "already bought this week" }
          : gold < 250
            ? { disabled: "not enough gold" }
            : {}),
      });
      break;
    }
    case "altar-of-sacrifice": {
      hero.army.forEach((s, i) => {
        if (s === null) return;
        const others = hero.army.filter((x) => x !== null).length;
        const d = getCreature(s.creature);
        out.push({
          id: `sac:${i}`,
          label: `Sacrifice ${s.count} ${d.plural} for ${s.count * d.hp} experience`,
          ...(others <= 1 ? { disabled: "the hero needs an army" } : {}),
        });
      });
      hero.backpack.forEach((a, i) => {
        const def = findArtifact(a);
        if (def === undefined || def.kind === "relic") return;
        out.push({
          id: `give:${i}`,
          label: `Give ${def.name} for ${Math.floor(def.value / 2)} experience`,
        });
      });
      break;
    }
    default:
      break;
  }
  return out;
}

/**
 * Visits an object at the hero's cell, in place: dwellings, sites, banks,
 * artifacts and teleports. Returns a battle to start, if the visit starts
 * one (a bank's guard, a sealed box's fight).
 */
export function visitSite(
  state: GameState,
  hero: HeroState,
  obj: MapObject,
  events: GameEvent[],
): PendingBattle | null {
  const t = objectTypeOf(obj);
  if (t === null || isGone(state, obj)) return null;
  const def = OBJECT_TYPES[t];
  const s0 = siteFor(state, obj.id);
  if (!(s0.seen ?? []).includes(hero.owner)) {
    s0.seen = [...(s0.seen ?? []), hero.owner];
  }
  const player = findPlayer(state, hero.owner);
  const already = used(state, obj, hero);
  const offer = (text: string): void =>
    say(events, hero, obj, text, siteOptions(state, hero, obj));

  switch (t) {
    // --- Producers -------------------------------------------------------
    case "windmill":
    case "water-wheel":
    case "orchard": {
      if (already) {
        say(events, hero, obj, `${def.name}: already collected this week.`);
        return null;
      }
      const take = weeklyTake(state, obj);
      markUsed(state, obj, hero);
      say(
        events,
        hero,
        obj,
        `${def.name}: ${grantPrize(state, hero, take, events)}.`,
      );
      return null;
    }
    // --- Dwellings -------------------------------------------------------
    case "faction-outpost":
    case "stray-hut":
    case "caretaker-lodge": {
      if (t === "caretaker-lodge" && !lodgeOpen(state, obj, hero.owner)) {
        const q = questOf(obj);
        const missing = q === null ? null : questMissing(state, hero, q);
        if (q !== null && missing !== null) {
          say(
            events,
            hero,
            obj,
            `The lodge is locked. Errand: ${questText(state, q)} (${missing}).`,
          );
          return null;
        }
        if (q !== null) payQuest(state, hero, q);
        const s = siteFor(state, obj.id);
        s.players = [...(s.players ?? []), hero.owner];
      }
      const s = siteFor(state, obj.id);
      if (s.stockWeek !== weekOf(state.day)) {
        s.stock = dwellingStock(state, obj);
        s.stockWeek = weekOf(state.day);
      }
      const flagged = s.owner !== hero.owner;
      s.owner = hero.owner;
      offer(
        `${def.name}${flagged ? " flagged" : ""}: ${s.stock ?? 0} available.`,
      );
      return null;
    }
    // --- Once-per-hero buildings -----------------------------------------
    case "stat-shrine": {
      if (already) break;
      const st = (str(obj, "stat") || "attack") as Stat;
      markUsed(state, obj, hero);
      raiseStat(hero, st, 1, events);
      say(events, hero, obj, `${def.name}: +1 ${STAT_NAME[st]}.`);
      return null;
    }
    case "learning-stone":
      if (already) break;
      markUsed(state, obj, hero);
      gainXp(hero, 1000, events);
      say(events, hero, obj, "Learning Stone: +1000 experience.");
      return null;
    case "library":
      if (already) break;
      if (hero.level < 8) {
        say(
          events,
          hero,
          obj,
          "Library: the scholars admit heroes of level 8 or more.",
        );
        return null;
      }
      markUsed(state, obj, hero);
      for (const st of STATS) raiseStat(hero, st, 1, events);
      say(events, hero, obj, "Library: +1 to all four stats.");
      return null;
    case "tree-of-knowledge": {
      if (already) break;
      const price = (obj.data["price"] as ResourceAmounts | undefined) ?? {};
      if (Object.keys(price).length > 0) {
        offer(`Tree of Knowledge: a level for ${prizeText(price)}.`);
        return null;
      }
      markUsed(state, obj, hero);
      gainXp(hero, Math.max(0, xpForLevel(hero.level + 1) - hero.xp), events);
      say(events, hero, obj, "Tree of Knowledge: the hero gains a level.");
      return null;
    }
    case "tutors-hut": {
      if (already) break;
      const skill = str(obj, "skill");
      const why = hero.skills.some((x) => x.id === skill)
        ? "already known"
        : skillRefusal(hero, skill);
      if (why !== null) {
        say(
          events,
          hero,
          obj,
          `Tutor's Hut: ${findSkill(skill)?.name ?? skill} cannot be taught (${why}).`,
        );
        return null;
      }
      markUsed(state, obj, hero);
      addSkill(hero, skill, events);
      say(
        events,
        hero,
        obj,
        `Tutor's Hut: learns ${findSkill(skill)?.name ?? skill}.`,
      );
      return null;
    }
    case "school-shrine": {
      if (already) break;
      const spell = str(obj, "spell");
      if (hero.pages.includes(spell)) {
        say(
          events,
          hero,
          obj,
          `School Shrine: the hero already knows ${spellName(spell)}.`,
        );
        return null;
      }
      markUsed(state, obj, hero);
      say(
        events,
        hero,
        obj,
        `School Shrine: the hero ${teachSpell(hero, spell)}.`,
      );
      return null;
    }
    case "arena":
    case "academy":
    case "hermit":
      if (already) break;
      offer(`${def.name}: ${def.text}`);
      return null;
    // --- Buffs ----------------------------------------------------------
    case "rally-camp":
    case "wishing-well": {
      const added = addBuff(hero, t);
      const what = t === "rally-camp" ? "+1 Morale" : "+1 Luck";
      say(
        events,
        hero,
        obj,
        `${def.name}: ${added ? what : "already blessed"} until the next battle ends.`,
      );
      return null;
    }
    case "oasis":
      if (already) break;
      markUsed(state, obj, hero);
      addBuff(hero, "oasis");
      hero.mp += OASIS_MP;
      say(
        events,
        hero,
        obj,
        "Oasis: +1 Morale until the next battle ends, +400 movement today.",
      );
      return null;
    case "school-temple": {
      const school = str(obj, "school") || "bloom";
      const added = addBuff(hero, `school-temple:${school}`);
      say(
        events,
        hero,
        obj,
        `School Temple: ${added ? `+2 Power for ${school} pages` : "already blessed"} until the next battle ends.`,
      );
      return null;
    }
    case "mana-well":
      if (already) break;
      markUsed(state, obj, hero);
      hero.mana = Math.max(hero.mana, maxMana(hero));
      say(events, hero, obj, "Mana Well: mana restored.");
      return null;
    case "stables":
      if (already) break;
      markUsed(state, obj, hero);
      hero.stablesUntil = weekEnd(state.day);
      hero.mp += STABLES_MP;
      say(
        events,
        hero,
        obj,
        "Stables: +300 movement each day for the rest of this week.",
      );
      return null;
    case "sanctuary":
      say(
        events,
        hero,
        obj,
        "Sanctuary: no enemy may attack this hero while it stands here.",
      );
      return null;
    case "observatory":
      if (player !== undefined)
        revealDisc(state.map, player.explored, obj.x, obj.y, 12);
      say(events, hero, obj, "Observatory: the land around is revealed.");
      return null;
    case "scholar": {
      const gift = prizeOf(obj, "gift");
      markUsed(state, obj, hero);
      say(
        events,
        hero,
        obj,
        `The scholar gives ${grantPrize(state, hero, gift, events)} and leaves.`,
      );
      return null;
    }
    // --- Banks ------------------------------------------------------------
    case "overgrown-greenhouse":
    case "sealed-registry":
    case "stopped-belfry":
    case "quiet-yard":
    case "thunderstruck-pylon-yard":
    case "landfall-wreck":
    case "keepers-vault": {
      if (s0.done === true) {
        say(events, hero, obj, `${def.name}: already plundered.`);
        return null;
      }
      if (siteGuard(state, obj).length === 0) {
        // Beaten earlier (a vault whose treasure was not chosen yet).
        return siteBattleWon(state, hero, obj, events);
      }
      return { kind: "site", objectId: obj.id, heroId: hero.id };
    }
    // --- Treasure ---------------------------------------------------------
    case "campfire": {
      const p: Prize = {
        gold: num(obj, "gold", 500),
        [str(obj, "resource") || "wood"]: num(obj, "amount", 5),
      };
      markUsed(state, obj, hero);
      say(
        events,
        hero,
        obj,
        `Campfire: ${grantPrize(state, hero, p, events)}.`,
      );
      return null;
    }
    case "loose-artifact": {
      const a = str(obj, "artifact");
      if (!giveArtifact(hero, a)) {
        say(
          events,
          hero,
          obj,
          `No room in the backpack for ${findArtifact(a)?.name ?? a}.`,
        );
        return null;
      }
      markUsed(state, obj, hero);
      say(events, hero, obj, `Found ${findArtifact(a)?.name ?? a}.`);
      return null;
    }
    case "loose-scroll": {
      const sp = str(obj, "spell");
      if (!giveScroll(hero, sp)) {
        say(events, hero, obj, "No room in the scroll case.");
        return null;
      }
      markUsed(state, obj, hero);
      say(events, hero, obj, `Found a scroll of ${spellName(sp)}.`);
      return null;
    }
    case "fallen-adventurer": {
      const a = str(obj, "artifact");
      if (!canCarry(hero, a)) {
        say(events, hero, obj, "No room in the backpack.");
        return null;
      }
      markUsed(state, obj, hero);
      giveArtifact(hero, a);
      addBuff(hero, "fallen-adventurer");
      say(
        events,
        hero,
        obj,
        `You take ${findArtifact(a)?.name ?? a} from the fallen adventurer. -2 Morale until the next battle ends.`,
      );
      return null;
    }
    // --- Hidden: obelisks ----------------------------------------------
    case "obelisk": {
      if (already) break;
      markUsed(state, obj, hero);
      const shares = obeliskCount(state);
      const seen = obelisksVisited(state, hero.owner);
      if (player !== undefined) {
        for (const [x, y] of puzzleCells(state, hero.owner)) {
          player.explored[y * state.map.width + x] = true;
        }
      }
      say(
        events,
        hero,
        obj,
        `Obelisk: share ${seen} of ${shares} of your puzzle map is uncovered.`,
      );
      return null;
    }
    // --- Quests, gates, prisons ----------------------------------------
    case "keymasters-tent":
      if (already) break;
      markUsed(state, obj, hero);
      say(events, hero, obj, `You now hold the ${str(obj, "colour")} key.`);
      return null;
    case "seer-hut":
    case "quest-gate": {
      if (t === "seer-hut" && s0.done === true) {
        say(events, hero, obj, "The seer has nothing more to ask.");
        return null;
      }
      if (t === "quest-gate" && gateOpen(state, obj, hero.owner)) return null;
      const q = questOf(obj);
      if (q === null) return null;
      const missing = questMissing(state, hero, q);
      const reward = prizeOf(obj, "reward");
      if (missing !== null) {
        const pay = t === "seer-hut" ? ` Reward: ${prizeText(reward)}.` : "";
        say(
          events,
          hero,
          obj,
          `${def.name}: ${questText(state, q)} (${missing}).${pay}`,
        );
        return null;
      }
      payQuest(state, hero, q);
      if (t === "seer-hut") {
        siteFor(state, obj.id).done = true;
        say(
          events,
          hero,
          obj,
          `Quest complete! ${grantPrize(state, hero, reward, events)}.`,
        );
      } else {
        const s = siteFor(state, obj.id);
        s.players = [...(s.players ?? []), hero.owner];
        say(
          events,
          hero,
          obj,
          "Quest complete: the gate opens for your heroes.",
        );
      }
      return null;
    }
    case "prison":
      freePrisoner(state, hero, obj, events);
      return null;
    // --- Services ------------------------------------------------------------
    case "trading-post":
      say(
        events,
        hero,
        obj,
        "Trading Post: trade resources at marketplace rates while your hero stands here.",
      );
      return null;
    case "drill-yard":
      say(
        events,
        hero,
        obj,
        "Drill Yard: the drill masters wait for the faction drills (not yet in the game).",
      );
      return null;
    case "tollhouse":
    case "curse-lifters-shrine":
    case "roadside-inn":
    case "altar-of-sacrifice":
      offer(`${def.name}: ${def.text}`);
      return null;
    // --- Teleports -----------------------------------------------------------
    case "two-way-waystone":
    case "one-way-waystone":
      teleport(state, hero, obj, events);
      return null;
    case "pylon":
      if (already) break;
      markUsed(state, obj, hero);
      say(
        events,
        hero,
        obj,
        "Pylon marked: Tow Line can now bring your heroes here.",
      );
      return null;
    // --- Events --------------------------------------------------------------
    case "event-tile":
    case "sealed-box": {
      const guard = siteGuard(state, obj);
      if (guard.length > 0) {
        return { kind: "site", objectId: obj.id, heroId: hero.id };
      }
      markUsed(state, obj, hero);
      const p = prizeOf(obj);
      const text = str(obj, "text");
      say(
        events,
        hero,
        obj,
        `${text !== "" ? `${text} ` : ""}${def.name}: ${grantPrize(state, hero, p, events)}.`,
      );
      return null;
    }
    case "sign":
      say(
        events,
        hero,
        obj,
        str(obj, "text") || "The sign is weathered blank.",
      );
      return null;
    default:
      return null;
  }
  // A once-only site this hero (or player) already used.
  say(
    events,
    hero,
    obj,
    `${def.name}: ${RESET_TEXT[def.reset]} Already visited.`,
  );
  return null;
}

/** The prize after a site's guard is beaten, in place. */
export function siteBattleWon(
  state: GameState,
  hero: HeroState,
  obj: MapObject,
  events: GameEvent[],
): PendingBattle | null {
  const s = siteFor(state, obj.id);
  s.guard = [];
  const t = objectTypeOf(obj);
  if (t === "keepers-vault") {
    say(
      events,
      hero,
      obj,
      "Keepers' Vault: choose one treasure to carry out.",
      siteOptions(state, hero, obj),
    );
    return null;
  }
  const p = prizeOf(obj);
  markUsed(state, obj, hero);
  if (t !== null && !OBJECT_TYPES[t].vanishes) s.done = true;
  say(
    events,
    hero,
    obj,
    `${t === null ? "Prize" : OBJECT_TYPES[t].name}: ${grantPrize(state, hero, p, events)}.`,
  );
  return null;
}

function teleport(
  state: GameState,
  hero: HeroState,
  obj: MapObject,
  events: GameEvent[],
): void {
  let to: { x: number; y: number } | undefined;
  if (objectTypeOf(obj) === "one-way-waystone") {
    const exit = obj.data["exit"] as [number, number] | undefined;
    if (exit !== undefined) to = { x: exit[0], y: exit[1] };
  } else {
    const pair = str(obj, "pair");
    const twin = state.map.objects.find(
      (o) =>
        o.id !== obj.id &&
        o.data["type"] === "two-way-waystone" &&
        o.data["pair"] === pair,
    );
    if (twin !== undefined) to = { x: twin.x, y: twin.y };
  }
  if (to === undefined) return;
  if (heroAt(state, to.x, to.y) !== undefined) {
    say(events, hero, obj, "The waystone's far side is occupied.");
    return;
  }
  hero.x = to.x;
  hero.y = to.y;
  const p = findPlayer(state, hero.owner);
  if (p !== undefined) revealDisc(state.map, p.explored, to.x, to.y, 4);
  events.push({ type: "teleported", heroId: hero.id, x: to.x, y: to.y });
}

function freePrisoner(
  state: GameState,
  hero: HeroState,
  obj: MapObject,
  events: GameEvent[],
): void {
  if (heroesOf(state, hero.owner).length >= MAX_HEROES) {
    say(events, hero, obj, "Prison: you already lead 8 heroes.");
    return;
  }
  if (state.pool.length === 0) {
    say(events, hero, obj, "Prison: the cell is empty.");
    markUsed(state, obj, hero);
    return;
  }
  // A free cell next to the prison for the freed hero.
  let spot: { x: number; y: number } | undefined;
  for (const [dx, dy] of [
    [0, 1],
    [1, 0],
    [-1, 0],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const) {
    const x = obj.x + dx;
    const y = obj.y + dy;
    if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height)
      continue;
    const cell = state.map.cells[y * state.map.width + x];
    if (
      cell === undefined ||
      cell.terrain === "water" ||
      cell.obstacle !== "none"
    )
      continue;
    if (heroAt(state, x, y) !== undefined) continue;
    if (
      state.map.objects.some(
        (o) =>
          (o.x === x &&
            o.y === y &&
            o.kind !== "buried" &&
            !isGone(state, o)) ||
          o.blocked.some(([bx, by]) => bx === x && by === y),
      )
    )
      continue;
    if (Object.values(state.monsters).some((m) => m.x === x && m.y === y))
      continue;
    spot = { x, y };
    break;
  }
  if (spot === undefined) {
    say(events, hero, obj, "Prison: no room outside for the prisoner.");
    return;
  }
  const rng = createRng(deriveSeed(state.seed, `prison:${obj.id}`));
  const defId = rng.pick(state.pool);
  const def = must(findHeroDef(defId), "prisoner");
  state.pool = state.pool.filter((id) => id !== defId);
  let freed = heroByDef(state, defId);
  if (freed === undefined) {
    freed = newHeroState(`hero-${defId}`, def, hero.owner, spot.x, spot.y);
    state.heroes.push(freed);
  } else {
    freed.owner = hero.owner;
    freed.x = spot.x;
    freed.y = spot.y;
    freed.alive = true;
    freed.army = startingArmy(freed.heroClass);
  }
  const level = num(obj, "level", 3);
  if (freed.level < level) {
    gainXp(freed, Math.max(0, xpForLevel(level) - freed.xp), events);
  }
  freed.mp = 0;
  markUsed(state, obj, hero);
  events.push({ type: "hero-freed", heroId: freed.id, player: hero.owner });
  say(
    events,
    hero,
    obj,
    `Prison: ${freed.name} (level ${freed.level}) is freed and joins you.`,
  );
}

// ---------------------------------------------------------------------------
// Obelisks and the puzzle

export function obeliskCount(state: GameState): number {
  return state.map.objects.filter((o) => o.data["type"] === "obelisk").length;
}

export function obelisksVisited(state: GameState, player: number): number {
  return state.map.objects.filter(
    (o) => o.data["type"] === "obelisk" && playerListed(state, o.id, player),
  ).length;
}

/**
 * The cells of the player's puzzle map uncovered so far: the 7x7 area round
 * the Keystone's cell in shares (one per obelisk), in a seeded order with
 * the Keystone's own cell last (CONTENT_MAP_OBJECTS section 4).
 */
export function puzzleCells(
  state: GameState,
  player: number,
): Array<[number, number]> {
  const key = state.map.objects.find(
    (o) => o.data["type"] === "buried-keystone",
  );
  const total = obeliskCount(state);
  if (key === undefined || total === 0) return [];
  const cells: Array<[number, number]> = [];
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = key.x + dx;
      const y = key.y + dy;
      if (x >= 0 && y >= 0 && x < state.map.width && y < state.map.height) {
        cells.push([x, y]);
      }
    }
  }
  const rng = createRng(deriveSeed(state.map.seed, "puzzle"));
  const order = rng.shuffle(cells);
  order.push([key.x, key.y]);
  const seen = obelisksVisited(state, player);
  const n =
    seen >= total ? order.length : Math.floor((order.length * seen) / total);
  return order.slice(0, Math.min(n, order.length - (seen >= total ? 0 : 1)));
}

// ---------------------------------------------------------------------------
// Commands

function onEntrance(
  state: GameState,
  heroId: string,
  objectId: string,
): { hero: HeroState; obj: MapObject } | CommandResult {
  const hero = findHero(state, heroId);
  if (hero === undefined || !hero.alive)
    return fail("unknown-hero", `no hero ${heroId}`);
  const blocked = checkTurn(state, hero.owner);
  if (blocked !== null) return blocked;
  const obj = findObject(state.map, objectId);
  if (obj === undefined) return fail("unknown-object", `no object ${objectId}`);
  if (obj.x !== hero.x || obj.y !== hero.y) {
    return fail("not-on-object", "the hero is not on the object's entrance");
  }
  return { hero, obj };
}

/**
 * Answers a site's choice (an option id from its "site" event or
 * {@link siteOptions}): hire at a dwelling, pick a stat, pay the tree, take
 * a vault treasure, forget a skill, buy or sell, lift a curse, buy a
 * rumour, sacrifice.
 */
export function useSite(
  state: GameState,
  heroId: string,
  objectId: string,
  optionId: string,
): CommandResult {
  const got = onEntrance(state, heroId, objectId);
  if ("ok" in got) return got;
  const option = siteOptions(state, got.hero, got.obj).find(
    (o) => o.id === optionId,
  );
  if (option === undefined)
    return fail("bad-choice", `no option ${optionId} here`);
  if (option.disabled !== undefined) return fail("bad-choice", option.disabled);
  const next = cloneState(state);
  const hero = must(findHero(next, heroId), "hero");
  const obj = got.obj;
  const player = must(findPlayer(next, hero.owner), "player");
  const events: GameEvent[] = [];
  const [verb, arg = ""] = optionId.split(":");
  const t = objectTypeOf(obj) as ObjectTypeId;
  const s = siteFor(next, obj.id);
  switch (verb) {
    case "hire": {
      const offer = must(dwellingOffer(next, obj), "offer");
      const n = Math.min(Number(arg), maxHire(next, hero, obj));
      if (n <= 0) return fail("stock", "nothing to hire");
      for (const r of RESOURCE_IDS)
        player.resources[r] -= (offer.cost[r] ?? 0) * n;
      addToArmy(hero.army, offer.creature, n);
      s.stock = (s.stock ?? 0) - n;
      say(
        events,
        hero,
        obj,
        `Hired ${n} ${getCreature(offer.creature).plural}.`,
      );
      break;
    }
    case "stat": {
      const st = arg as Stat;
      if (t === "academy") player.resources.gold -= 2000;
      markUsed(next, obj, hero);
      raiseStat(hero, st, t === "arena" ? 2 : 1, events);
      say(
        events,
        hero,
        obj,
        `${OBJECT_TYPES[t].name}: +${t === "arena" ? 2 : 1} ${STAT_NAME[st]}.`,
      );
      break;
    }
    case "pay": {
      const price = (obj.data["price"] as ResourceAmounts | undefined) ?? {};
      player.resources = subtractResources(player.resources, price);
      markUsed(next, obj, hero);
      gainXp(hero, Math.max(0, xpForLevel(hero.level + 1) - hero.xp), events);
      say(events, hero, obj, "Tree of Knowledge: the hero gains a level.");
      break;
    }
    case "forget":
      markUsed(next, obj, hero);
      hero.skills = hero.skills.filter((x) => x.id !== arg);
      say(
        events,
        hero,
        obj,
        `Hermit: ${findSkill(arg)?.name ?? arg} is forgotten.`,
      );
      break;
    case "redraw":
      markUsed(next, obj, hero);
      hero.redraw = true;
      say(events, hero, obj, "Hermit: your next skill offer will be redrawn.");
      break;
    case "take": {
      const choices = (obj.data["choices"] as Prize[] | undefined) ?? [];
      const p = choices[Number(arg)] ?? {};
      s.done = true;
      say(
        events,
        hero,
        obj,
        `Keepers' Vault: ${grantPrize(next, hero, p, events)}.`,
      );
      break;
    }
    case "buy": {
      const i = Number(arg);
      const item = tollhouseStock(next, obj)[i];
      if (item === undefined) return fail("bad-choice", "no such item");
      if (item.startsWith("scroll:")) {
        if (!giveScroll(hero, item.slice(7)))
          return fail("scroll-case-full", "the scroll case is full");
      } else if (!giveArtifact(hero, item)) {
        return fail("backpack-full", "the backpack is full");
      }
      player.resources.gold -= itemValue(item);
      const week = weekOf(next.day);
      s.sold = s.soldWeek === week ? [...(s.sold ?? []), i] : [i];
      s.soldWeek = week;
      say(events, hero, obj, `Bought ${itemName(item)}.`);
      break;
    }
    case "sell": {
      const a = hero.backpack[Number(arg)];
      if (a === undefined) return fail("bad-item", "no such item");
      hero.backpack.splice(Number(arg), 1);
      const gold = Math.floor(itemValue(a) / 2);
      player.resources.gold += gold;
      say(events, hero, obj, `Sold ${itemName(a)} for ${gold} gold.`);
      break;
    }
    case "sell-scroll": {
      const sp = hero.scrolls[Number(arg)];
      if (sp === undefined) return fail("bad-item", "no such scroll");
      hero.scrolls.splice(Number(arg), 1);
      const gold = Math.floor(itemValue(`scroll:${sp}`) / 2);
      player.resources.gold += gold;
      say(
        events,
        hero,
        obj,
        `Sold a scroll of ${spellName(sp)} for ${gold} gold.`,
      );
      break;
    }
    case "lift": {
      const slot = Number(arg);
      const a = hero.worn[slot];
      if (a === null || a === undefined)
        return fail("bad-item", "nothing there");
      if (!canCarry(hero, a))
        return fail("backpack-full", "the backpack is full");
      player.resources = subtractResources(
        player.resources,
        CURSE_LIFT_SITE_COST,
      );
      hero.worn[slot] = null;
      hero.backpack.push(a);
      events.push({ type: "curse-lifted", heroId: hero.id, artifact: a });
      say(events, hero, obj, `The curse of ${getArtifact(a).name} is lifted.`);
      break;
    }
    case "rumour": {
      player.resources.gold -= 250;
      const week = String(weekOf(next.day));
      s.rumours = {
        ...(s.rumours ?? {}),
        [week]: [...(s.rumours?.[week] ?? []), hero.owner],
      };
      const caches = next.map.objects.filter(
        (o) =>
          o.data["type"] === "buried-cache" && !next.collected.includes(o.id),
      );
      if (caches.length === 0) {
        say(events, hero, obj, "The innkeeper knows of no buried cache.");
        break;
      }
      const rng = weekRng(next, obj, "rumour");
      const c = rng.pick(caches);
      revealDisc(next.map, player.explored, c.x, c.y, 3);
      const x0 = c.x - 2 + rng.int(0, 2) - 1;
      const y0 = c.y - 2 + rng.int(0, 2) - 1;
      say(
        events,
        hero,
        obj,
        `Rumour: a cache lies buried within the 5x5 area from (${x0}, ${y0}) to (${x0 + 4}, ${y0 + 4}).`,
      );
      break;
    }
    case "sac": {
      const slot = Number(arg);
      const stack = hero.army[slot];
      if (stack === null || stack === undefined)
        return fail("empty-slot", "empty slot");
      hero.army[slot] = null;
      gainXp(hero, stack.count * getCreature(stack.creature).hp, events);
      say(
        events,
        hero,
        obj,
        `The altar accepts ${stack.count} ${getCreature(stack.creature).plural}.`,
      );
      break;
    }
    case "give": {
      const a = hero.backpack[Number(arg)];
      if (a === undefined) return fail("bad-item", "no such item");
      hero.backpack.splice(Number(arg), 1);
      gainXp(hero, Math.floor(itemValue(a) / 2), events);
      say(events, hero, obj, `The altar accepts ${itemName(a)}.`);
      break;
    }
    default:
      return fail("bad-choice", `unknown option ${optionId}`);
  }
  return success(next, events);
}

/** Whether the hero carries a shovel (digs for 300 movement points). */
function hasShovel(hero: HeroState): boolean {
  return [...hero.backpack, ...hero.worn].includes("collapsible-shovel");
}

/**
 * Digs on the hero's cell (CONTENT_MAP_OBJECTS section 4): needs the full
 * day's movement points (a shovel: 300) and a cell with no object; finds
 * whatever is buried there, or nothing.
 */
export function digHere(state: GameState, heroId: string): CommandResult {
  const hero = findHero(state, heroId);
  if (hero === undefined || !hero.alive)
    return fail("unknown-hero", `no hero ${heroId}`);
  const blocked = checkTurn(state, hero.owner);
  if (blocked !== null) return blocked;
  const shovel = hasShovel(hero);
  if (shovel ? hero.mp < SHOVEL_DIG_MP : hero.mp < hero.maxMp) {
    return fail(
      "no-dig",
      shovel
        ? "digging needs 300 movement points"
        : "digging needs the whole day's movement",
    );
  }
  const here = state.map.objects.filter(
    (o) => o.x === hero.x && o.y === hero.y && !state.collected.includes(o.id),
  );
  if (here.some((o) => o.kind !== "buried" && o.kind !== "hero-start")) {
    return fail("no-dig", "you cannot dig on an object");
  }
  const buried = here.find((o) => o.kind === "buried");
  if (
    buried !== undefined &&
    buried.data["type"] === "buried-keystone" &&
    !canCarry(hero, KEYSTONE.id)
  ) {
    return fail("backpack-full", "the Keystone needs a free backpack slot");
  }
  const next = cloneState(state);
  const h = must(findHero(next, heroId), "hero");
  h.mp = shovel ? h.mp - SHOVEL_DIG_MP : 0;
  const events: GameEvent[] = [];
  if (buried === undefined) {
    events.push({ type: "dug", heroId, found: null });
    return success(next, events);
  }
  next.collected.push(buried.id);
  if (buried.data["type"] === "buried-keystone") {
    giveArtifact(h, KEYSTONE.id);
    events.push({ type: "dug", heroId, found: KEYSTONE.name });
  } else {
    const text = grantPrize(next, h, prizeOf(buried), events);
    events.push({ type: "dug", heroId, found: text });
  }
  return success(next, events);
}

// ---------------------------------------------------------------------------
// For the AI: values and guards

/** Live neutral stacks that guard an object (by the generator's `guards`). */
export function guardsOf(state: GameState, obj: MapObject): string[] {
  const out: string[] = [];
  for (const o of state.map.objects) {
    if (o.kind !== "monster" || state.monsters[o.id] === undefined) continue;
    const g = o.data["guards"];
    if (Array.isArray(g) && g.includes(obj.id)) out.push(o.id);
  }
  return out;
}

/**
 * Fight value standing between a hero and the object's prize: its map
 * guards plus a bank's own guard (0 when unguarded).
 */
export function objectGuardFv(state: GameState, obj: MapObject): number {
  let fv = 0;
  for (const id of guardsOf(state, obj)) {
    const m = state.monsters[id];
    if (m !== undefined) fv += m.count * getCreature(m.creature).fightValue;
  }
  if (obj.kind === "bank" || obj.kind === "site")
    fv += fvOf(siteGuard(state, obj));
  return fv;
}

/**
 * What visiting the object is worth to `player` now, in gold equivalents
 * (CONTENT_MAP_OBJECTS section 2's scale; 0 when it would give nothing):
 * spent, collected, already flagged or visited objects are 0. With
 * `heroId`, once-per-hero sites count for that hero; without, for any hero
 * of the player that has not used it. The AI plans with this and
 * {@link objectGuardFv}.
 */
export function objectValueFor(
  state: GameState,
  player: number,
  obj: MapObject,
  heroId?: string,
): number {
  if (state.collected.includes(obj.id)) return 0;
  const base = num(obj, "value", 0);
  switch (obj.kind) {
    case "town": {
      const t = state.towns[obj.id];
      return t === undefined || t.owner === player ? 0 : base || 9000;
    }
    case "mine":
      return state.mines[obj.id]?.owner === player ? 0 : base;
    case "pickup":
    case "artifact":
      return base;
    case "monster":
    case "hero-start":
    case "buried":
      return 0;
    default:
      break;
  }
  const t = objectTypeOf(obj);
  if (t === null) return 0;
  const def = OBJECT_TYPES[t];
  const s = siteOf(state, obj.id);
  const heroes = heroesOf(state, player).filter(
    (h) => heroId === undefined || h.id === heroId,
  );
  if (heroes.length === 0) return 0;
  const anyUnused = heroes.some((h) => !used(state, obj, h));
  switch (def.reset) {
    case "flag": {
      if (s.owner !== player) {
        return lodgeOpen(state, obj, player) || obj.kind !== "dwelling"
          ? base
          : base / 2;
      }
      return dwellingStock(state, obj) > 0 ? Math.round(base / 3) : 0;
    }
    case "weekly":
      return s.week === weekOf(state.day)
        ? 0
        : prizeValue(weeklyTake(state, obj));
    case "per-hero":
    case "per-day":
    case "per-week-hero":
    case "per-player":
      return anyUnused ? base : 0;
    case "one-time":
      if (s.done === true) return 0;
      if (t === "seer-hut") return prizeValue(prizeOf(obj, "reward"));
      return base;
    case "each-visit": {
      if (t === "rally-camp" || t === "wishing-well") {
        return heroes.some((h) => !h.buffs.includes(t)) ? base : 0;
      }
      if (t === "school-temple") {
        const b = `school-temple:${str(obj, "school")}`;
        return heroes.some((h) => !h.buffs.includes(b)) ? base : 0;
      }
      return base;
    }
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Hover text

function guardLine(state: GameState, obj: MapObject): string | null {
  const ids = guardsOf(state, obj);
  const parts: string[] = [];
  let fv = 0;
  for (const id of ids) {
    const m = state.monsters[id];
    if (m === undefined) continue;
    const d = getCreature(m.creature);
    parts.push(`${m.count} ${m.count === 1 ? d.name : d.plural}`);
    fv += m.count * d.fightValue;
  }
  const inside: string[] = [];
  if (obj.kind === "bank") {
    for (const g of siteGuard(state, obj)) {
      const d = getCreature(g.creature);
      inside.push(`${g.count} ${g.count === 1 ? d.name : d.plural}`);
      fv += g.count * d.fightValue;
    }
  }
  if (parts.length === 0 && inside.length === 0) return null;
  const where = [
    parts.length > 0 ? `guarded by ${parts.join(", ")}` : "",
    inside.length > 0 ? `inside: ${inside.join(", ")}` : "",
  ]
    .filter((x) => x !== "")
    .join("; ");
  return `${where.charAt(0).toUpperCase()}${where.slice(1)} (strength about ${fv}).`;
}

/** The object's display name, with its variant ("Stat Shrine (Attack)"). */
export function objectName(state: GameState, obj: MapObject): string {
  const t = objectTypeOf(obj);
  if (t === null) return obj.kind;
  const def = OBJECT_TYPES[t];
  const v = (() => {
    switch (t) {
      case "stat-shrine":
        return STAT_NAME[(str(obj, "stat") || "attack") as Stat];
      case "school-temple":
      case "school-shrine": {
        const sp = findMapSpell(str(obj, "spell"));
        return sp !== undefined ? sp.name : str(obj, "school");
      }
      case "faction-outpost":
      case "stray-hut":
      case "caretaker-lodge": {
        const c = obj.data["creature"];
        return isCreatureId(c) ? getCreature(c).plural : "";
      }
      case "keymasters-tent":
      case "border-gate":
      case "two-way-waystone":
        return str(obj, "colour");
      default:
        if (obj.kind === "bank" && t !== "keepers-vault")
          return str(obj, "size");
        return "";
    }
  })();
  void state;
  return v === "" ? def.name : `${def.name} (${v})`;
}

/**
 * Hover text for an object: its name, what it does (with its seeded
 * contents, except a sealed box's), whether the hero (or player) already
 * used it, its reset and its guard's strength. One line per entry.
 */
export function describeObject(
  state: GameState,
  player: number,
  obj: MapObject,
  heroId?: string,
): string[] {
  const t = objectTypeOf(obj);
  if (t === null) return [];
  const def = OBJECT_TYPES[t];
  const hero =
    heroId !== undefined ? findHero(state, heroId) : heroesOf(state, player)[0];
  const s = siteOf(state, obj.id);
  const lines: string[] = [objectName(state, obj)];
  let what = def.text;
  switch (t) {
    case "school-shrine":
      what = `Teaches ${spellName(str(obj, "spell"))} (tier ${num(obj, "tier", 1)}) as a page if the hero can learn it, otherwise as a scroll.`;
      break;
    case "tutors-hut":
      what = `Teaches ${findSkill(str(obj, "skill"))?.name ?? str(obj, "skill")} at rank 1.`;
      break;
    case "tree-of-knowledge": {
      const price = (obj.data["price"] as ResourceAmounts | undefined) ?? {};
      what = `A level for ${Object.keys(price).length === 0 ? "free" : prizeText(price)}.`;
      break;
    }
    case "academy": {
      const pair = (obj.data["stats"] as Stat[] | undefined) ?? [
        "attack",
        "defense",
      ];
      what = `Pay 2000 gold for +1 ${pair.map((p) => STAT_NAME[p]).join(" or ")}.`;
      break;
    }
    case "loose-artifact":
    case "fallen-adventurer": {
      const a = findArtifact(str(obj, "artifact"));
      if (a !== undefined) {
        const cursed = isCursed(a.id) ? " CURSED." : "";
        what = `${t === "fallen-adventurer" ? "A fallen adventurer's " : ""}${a.name}: ${a.text}${cursed}${t === "fallen-adventurer" ? " Taking it costs -2 Morale until the next battle ends." : ""}`;
      }
      break;
    }
    case "loose-scroll":
      what = `A scroll of ${spellName(str(obj, "spell"))}.`;
      break;
    case "campfire":
      what = `${num(obj, "gold")} gold and ${num(obj, "amount")} ${str(obj, "resource")}.`;
      break;
    case "scholar":
      what = `The scholar's gift: ${prizeText(prizeOf(obj, "gift"))}.`;
      break;
    case "faction-outpost":
    case "stray-hut":
    case "caretaker-lodge": {
      const offer = dwellingOffer(state, obj);
      if (offer !== null) {
        what = `${def.text} ${dwellingStock(state, obj)} ${getCreature(offer.creature).plural} for ${prizeText(offer.cost)} each.`;
      }
      if (t === "caretaker-lodge" && !lodgeOpen(state, obj, player)) {
        const q = questOf(obj);
        if (q !== null) what += ` Errand: ${questText(state, q)}.`;
      }
      if (s.owner !== undefined && s.owner !== null) {
        what +=
          s.owner === player ? " Your flag." : " Flagged by another player.";
      }
      break;
    }
    case "seer-hut":
    case "quest-gate": {
      const q = questOf(obj);
      if (q !== null) {
        what = `Quest: ${questText(state, q)}.`;
        if (t === "seer-hut")
          what += ` Reward: ${prizeText(prizeOf(obj, "reward"))}.`;
        else what += " Done: your heroes may pass.";
      }
      break;
    }
    case "keepers-vault":
    case "overgrown-greenhouse":
    case "sealed-registry":
    case "stopped-belfry":
    case "quiet-yard":
    case "thunderstruck-pylon-yard":
    case "landfall-wreck":
      what =
        t === "keepers-vault"
          ? `${def.text} Each treasure: a Marvel piece, a Wonder and 5000 gold.`
          : `${def.text} Prize: ${prizeText(prizeOf(obj))}.`;
      if (s.done === true) what = "Plundered.";
      break;
    case "prison":
      what = `${def.text} The prisoner is level ${num(obj, "level", 3)}.`;
      break;
    case "obelisk":
      what = `${def.text} You have seen ${obelisksVisited(state, player)} of ${obeliskCount(state)}.`;
      break;
    case "border-gate":
      what = gateOpen(state, obj, player)
        ? `Open to you: you hold the ${str(obj, "colour")} key.`
        : `Closed: find the ${str(obj, "colour")} Keymaster's Tent.`;
      break;
    case "windmill":
    case "orchard":
    case "water-wheel":
      what = `${def.text} This week: ${prizeText(weeklyTake(state, obj))}.`;
      break;
    case "sign":
    case "event-tile":
      if (str(obj, "text") !== "") what = str(obj, "text");
      break;
    default:
      break;
  }
  lines.push(what);
  if (hero !== undefined && def.reset !== "flag" && def.reset !== "permanent") {
    const u = used(state, obj, hero);
    if (def.reset === "per-player") {
      lines.push(u ? "Already visited by your player." : "Not yet visited.");
    } else if (def.reset === "weekly") {
      lines.push(
        u ? "Already collected this week." : "Not collected this week.",
      );
    } else if (def.reset !== "each-visit" && def.reset !== "one-time") {
      lines.push(
        u
          ? `Already visited by ${hero.name}.`
          : `${hero.name} has not used it yet.`,
      );
    }
  }
  lines.push(RESET_TEXT[def.reset]);
  const g = guardLine(state, obj);
  if (g !== null) lines.push(g);
  return lines;
}

/** School of a school temple or shrine, for effects. */
export function siteSchool(obj: MapObject): School | null {
  const s = str(obj, "school");
  return s === "" ? null : (s as School);
}

/** The value a placed object was generated with (data.value). */
export function placedValue(obj: MapObject): number {
  return num(obj, "value", 0);
}

/** For tests and tools: the battle spells a shrine of this tier can teach. */
export function shrineSpells(tier: number): string[] {
  return battleSpellsOfTier(tier).map((s) => s.id);
}
