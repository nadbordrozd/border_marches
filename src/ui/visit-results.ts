/**
 * How a visit's outcome is shown (bead bzc.81): floating text over the
 * hero stays for plain pickups (resources, gold, a bare experience bump);
 * anything that carries information (a rumour, a learnt spell, a scroll,
 * a skill or stat, an artifact, a refused or failed visit with its reason,
 * an obelisk or a reveal) opens a dialog the player must dismiss. These are
 * plain models (unit-tested in tests/ui/visit-results.test.ts); game.ts
 * floats or shows them, dialog-kinds.ts draws the dialog.
 */
import type { GameState, HeroState } from "../core/game/index.ts";
import { auroraSkill, objectName, objectTypeOf } from "../core/game/index.ts";
import { tollhouseStock } from "../core/game/sites.ts";
import { heroMagic, isSpell, spellInfo } from "../core/magic/index.ts";
import { isMystery, mysteryArtifactOf } from "../core/map/mystery.ts";
import type { MapObject } from "../core/map/types.ts";
import type { IconKind } from "../assets/icons.ts";
import { ARTIFACT_LIST, findArtifact } from "../data/artifacts.ts";
import { SCHOOL_NAMES } from "../data/effects.ts";
import { MAP_SPELLS } from "../data/map-spells.ts";
import { OBJECT_TYPES, type Prize } from "../data/objectTypes.ts";
import { SKILL_IDS, findSkill } from "../data/skills.ts";
import { rankForTier } from "./guild-learning.ts";
import { objectPictureKey } from "./map-card.ts";

export type VisitShow = "float" | "dialog";

/** A map area a result points at (a rumour's 5x5 square). */
export interface VisitArea {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface VisitIcon {
  readonly kind: IconKind;
  readonly id: string;
  /** A skill's rank (its card brightens that rank); 1 when absent. */
  readonly rank?: number;
}

export interface VisitResult {
  readonly show: VisitShow;
  /** The site's name (the dialog's title). */
  readonly title: string;
  /** The outcome without the name in front, capitalised. */
  readonly sentence: string;
  /** The whole line, for the float and the log. */
  readonly text: string;
  /** The site's map picture key, or null. */
  readonly picture: string | null;
  /** What it gave or holds: spells, artifacts, skills, stats. */
  readonly icons: readonly VisitIcon[];
  /** A dim line under the sentence (why a spell came as a scroll ...). */
  readonly note: string | null;
  readonly area: VisitArea | null;
}

const PLAIN_PART = /^\+?\d+ (gold|wood|ore|essence|experience)$/;

/**
 * Whether a prize text is only resources and experience ("1000 gold, 5
 * wood", "+1000 experience"): nothing to read twice.
 */
export function isPlainPrize(text: string): boolean {
  const body = text.trim().replace(/[.!]$/, "");
  if (body === "") return false;
  return body.split(/,\s*/).every((p) => PLAIN_PART.test(p));
}

/**
 * The visit's text without "<Name>: " in front, capitalised. `names`: the
 * object's shown name and its catalogue name ("Stat Shrine (Defense)" and
 * "Stat Shrine": the rules write the latter).
 */
export function withoutName(
  names: string | readonly string[],
  text: string,
): string {
  let s = text;
  for (const n of typeof names === "string" ? [names] : names)
    if (n !== "" && s.startsWith(`${n}: `)) {
      s = s.slice(n.length + 2);
      break;
    }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The names a visit's text may start with: shown and catalogue. */
export function siteNames(state: GameState, obj: MapObject): string[] {
  const t = objectTypeOf(obj);
  const names = [objectName(state, obj)];
  if (t !== null) names.push(OBJECT_TYPES[t].name);
  return names;
}

/**
 * Float or dialog for a visit's line (no choice offered): plain prizes
 * float; a hire or a sale the player just made (in a choice) floats too;
 * everything else is a dialog.
 */
export function visitShow(
  names: string | readonly string[],
  text: string,
): VisitShow {
  const s = withoutName(names, text);
  if (isPlainPrize(s)) return "float";
  if (/^(Hired|Sold) /.test(s)) return "float";
  return "dialog";
}

/** What a prize gives, as icons: artifacts, scrolls, a spell, a skill, a stat. */
export function prizeIcons(p: Prize): VisitIcon[] {
  const out: VisitIcon[] = [];
  for (const a of p.artifacts ?? []) out.push({ kind: "artifact", id: a });
  for (const s of p.scrolls ?? []) out.push({ kind: "spell", id: s });
  if (p.spell !== undefined) out.push({ kind: "spell", id: p.spell });
  if (p.skill !== undefined) out.push({ kind: "skill", id: p.skill });
  if (p.stat !== undefined) out.push({ kind: "stat", id: p.stat.stat });
  return out;
}

function prizeOf(obj: MapObject, key: string): Prize {
  const v = obj.data[key];
  return v !== null && typeof v === "object" ? (v as Prize) : {};
}

/** The icons of what a site gives or holds, from its seeded data. */
export function siteIcons(obj: MapObject): VisitIcon[] {
  const str = (k: string): string => String(obj.data[k] ?? "");
  switch (objectTypeOf(obj)) {
    case "school-shrine":
    case "loose-scroll":
      return str("spell") === "" ? [] : [{ kind: "spell", id: str("spell") }];
    case "loose-artifact":
    case "fallen-adventurer":
      return str("artifact") === ""
        ? []
        : [{ kind: "artifact", id: str("artifact") }];
    case "tutors-hut":
      return str("skill") === "" ? [] : [{ kind: "skill", id: str("skill") }];
    case "stat-shrine":
      return [{ kind: "stat", id: str("stat") || "attack" }];
    case "library":
      return ["attack", "defense", "power", "lore"].map((id) => ({
        kind: "stat" as const,
        id,
      }));
    case "scholar":
      return prizeIcons(prizeOf(obj, "gift"));
    case "seer-hut":
      return prizeIcons(prizeOf(obj, "reward"));
    case "event-tile":
    case "sealed-box":
    case "overgrown-greenhouse":
    case "sealed-registry":
    case "stopped-belfry":
    case "quiet-yard":
    case "thunderstruck-pylon-yard":
    case "landfall-wreck":
    case "frost-giants-barrow":
    case "pyramid":
    case "sunken-tomb":
      return prizeIcons(prizeOf(obj, "prize"));
    case "aurora-spire": {
      const skill = auroraSkill(obj);
      return skill === undefined ? [] : [{ kind: "skill", id: skill.id }];
    }
    default:
      return [];
  }
}

/**
 * The icons of what a site gives or holds; a Mystery Bag (bead bzc.105)
 * shows its artifact only once it was opened.
 */
function resultIcons(
  state: GameState,
  obj: MapObject,
  text: string,
): VisitIcon[] {
  if (!isMystery(obj)) return siteIcons(obj);
  return state.collected.includes(obj.id) || /Opened/.test(text)
    ? [{ kind: "artifact", id: mysteryArtifactOf(state.map, obj) }]
    : [];
}

/** Whole-word, case-sensitive: "Galoshes", not "galoshes-like". */
function names(text: string, name: string): boolean {
  if (name === "") return false;
  const at = text.indexOf(name);
  if (at < 0) return false;
  const before = text.charAt(at - 1);
  const after = text.charAt(at + name.length);
  return !/[\w-]/.test(before) && !/[\w-]/.test(after);
}

/**
 * What a result's words say was found, won, bought or taught (bead
 * bzc.108), as icons: every artifact named; a spell after "scroll of",
 * "the spell", "learns" or "knows"; a skill after "learns" or before
 * "rises to rank", at the rank the line gives. This is the generic path
 * for any grant the site's own data does not list (a rich chest's
 * Trinket, a mystery pickup, a sphinx's skill, a dig): whatever gives an
 * artifact names it in its line.
 */
export function textIcons(text: string): VisitIcon[] {
  const out: VisitIcon[] = [];
  let rest = text;
  // Longest names first, each taken out once found ("The Glove's Thumb"
  // before a shorter name inside it).
  const arts = [...ARTIFACT_LIST].sort((a, b) => b.name.length - a.name.length);
  for (const a of arts) {
    if (!names(rest, a.name)) continue;
    out.push({ kind: "artifact", id: a.id });
    rest = rest.split(a.name).join(" ");
  }
  for (const sp of MAP_SPELLS) {
    const said = [
      "scroll of",
      "Scroll of",
      "the spell",
      "learns",
      "knows",
    ].some((w) => names(rest, `${w} ${sp.name}`));
    if (said) out.push({ kind: "spell", id: sp.id });
  }
  const rank = Number(/\brank (\d)/.exec(rest)?.[1] ?? 1);
  for (const id of SKILL_IDS) {
    const def = findSkill(id);
    if (def === undefined) continue;
    if (
      names(rest, `learns ${def.name}`) ||
      names(rest, `${def.name} rises to rank`)
    )
      out.push({ kind: "skill", id, rank });
  }
  return out;
}

/** Icons in order, each kind and id once (a later one may add a rank). */
export function mergeIcons(
  ...lists: ReadonlyArray<readonly VisitIcon[]>
): VisitIcon[] {
  const out: VisitIcon[] = [];
  for (const list of lists)
    for (const i of list) {
      const at = out.findIndex((o) => o.kind === i.kind && o.id === i.id);
      if (at < 0) out.push(i);
      else if (out[at]?.rank === undefined && i.rank !== undefined) out[at] = i;
    }
  return out;
}

/** Skill icons at the rank the hero now holds (its card brightens it). */
function heldRanks(
  icons: readonly VisitIcon[],
  hero: HeroState | undefined,
): VisitIcon[] {
  return icons.map((i) => {
    if (i.kind !== "skill") return i;
    const held = hero?.skills.find((s) => s.id === i.id)?.rank;
    return held === undefined ? i : { ...i, rank: held };
  });
}

/**
 * Battle spoils (bead bzc.108): the artifacts a winning hero of the
 * player's took from the beaten one, each an inspectable card.
 */
export function spoilsResult(
  winner: string,
  loser: string,
  artifacts: readonly string[],
): VisitResult {
  const list = artifacts.map((a) => findArtifact(a)?.name ?? a);
  const sentence = `${winner} takes ${listNames(list)} from ${loser}.`;
  return {
    show: "dialog",
    title: "Spoils of battle",
    sentence,
    text: sentence,
    picture: null,
    icons: artifacts.map((id) => ({ kind: "artifact" as const, id })),
    note: "They are in the backpack; wear them from the hero sheet.",
    area: null,
  };
}

/** "A, B and C". */
function listNames(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * The thing a site's option offers (bead bzc.108), for its inspectable
 * icon: a tollhouse's ware (artifact or scroll), a backpack item to sell
 * or give, a cursed item to lift, a vault's prize, a skill to forget.
 * Null when the option is not about one thing.
 */
export function optionItem(
  state: GameState,
  hero: HeroState,
  obj: MapObject,
  option: string,
): VisitIcon | null {
  const [verb = "", arg = ""] = option.split(":");
  const n = Number(arg);
  const artifact = (id: string | null | undefined): VisitIcon | null =>
    id === null || id === undefined ? null : { kind: "artifact", id };
  switch (verb) {
    case "buy": {
      if (objectTypeOf(obj) !== "tollhouse") return null;
      const item = tollhouseStock(state, obj)[n];
      if (item === undefined) return null;
      return item.startsWith("scroll:")
        ? { kind: "spell", id: item.slice(7) }
        : artifact(item);
    }
    case "sell":
    case "give":
      return artifact(hero.backpack[n]);
    case "lift":
      return artifact(hero.worn[n]);
    case "sell-scroll": {
      const sp = hero.scrolls[n];
      return sp === undefined ? null : { kind: "spell", id: sp };
    }
    case "forget": {
      const held = hero.skills.find((s) => s.id === arg);
      return held === undefined
        ? null
        : { kind: "skill", id: arg, rank: held.rank };
    }
    case "take": {
      const choices = obj.data["choices"];
      const prize = Array.isArray(choices) ? (choices[n] as Prize) : undefined;
      if (prize === undefined) return null;
      return prizeIcons(prize).find((i) => i.kind !== "stat") ?? null;
    }
    default:
      return null;
  }
}

/** The spell a site teaches (a shrine, a scholar's gift), if any. */
function taughtSpell(obj: MapObject): string | null {
  const t = objectTypeOf(obj);
  if (t === "school-shrine") return String(obj.data["spell"] ?? "") || null;
  if (t === "scholar") return prizeOf(obj, "gift").spell ?? null;
  return null;
}

/**
 * Why a taught spell came as a scroll rather than a page, for a hero
 * without the rank (null: it did not, or nothing to say).
 */
function scrollNote(
  hero: HeroState | undefined,
  spell: string | null,
  text: string,
): string | null {
  if (spell === null || !isSpell(spell) || !/scroll/.test(text)) return null;
  const info = spellInfo(spell);
  const need = rankForTier(info.tier);
  const school = SCHOOL_NAMES[info.school];
  const have =
    hero === undefined ? 0 : heroMagic(hero).schoolRanks[info.school];
  const why =
    have < need
      ? `A page needs ${school} rank ${need}; the scroll is cast once, by any hero, at no mana.`
      : "The scroll is cast once, by any hero, at no mana.";
  return why;
}

/**
 * A site visit's result as it is shown. `area`: the event's map area (a
 * rumour). `hero`: the visitor, for notes that depend on it.
 */
export function siteResult(
  state: GameState,
  obj: MapObject,
  text: string,
  area: VisitArea | null = null,
  hero?: HeroState,
): VisitResult {
  const title = objectName(state, obj);
  const names = siteNames(state, obj);
  const sentence = withoutName(names, text);
  const show = area !== null ? "dialog" : visitShow(names, text);
  const skill =
    objectTypeOf(obj) === "tutors-hut"
      ? findSkill(String(obj.data["skill"] ?? ""))
      : undefined;
  let note = scrollNote(hero, taughtSpell(obj), text);
  if (note === null && skill?.family === "school" && /learns/.test(text))
    note = `${skill.ranks[0].text} The Mage Guilds of your towns now teach them.`;
  // An Aurora Spire's school rank (bead bzc.87): what the new rank allows.
  const aurora =
    objectTypeOf(obj) === "aurora-spire" ? auroraSkill(obj) : undefined;
  const auroraRank = /rank (\d)/.exec(text)?.[1];
  if (note === null && aurora !== undefined && auroraRank !== undefined)
    note = aurora.ranks[Number(auroraRank) - 1]?.text ?? null;
  if (area !== null)
    note =
      "The area is uncovered on your map. Dig there with a hero (the whole day's movement).";
  return {
    show,
    title,
    sentence,
    text,
    picture: objectPictureKey(obj),
    // What the site holds, and whatever the line says it gave (bead
    // bzc.108: every granted thing is an inspectable card); a Mystery Bag
    // shows its artifact only once opened (bead bzc.105).
    icons:
      show === "dialog"
        ? heldRanks(
            mergeIcons(resultIcons(state, obj, text), textIcons(sentence)),
            hero,
          )
        : [],
    note,
    area: area === null ? null : clipArea(state, area),
  };
}

/** The area clipped to the map. */
export function clipArea(state: GameState, a: VisitArea): VisitArea {
  const x0 = Math.max(0, a.x);
  const y0 = Math.max(0, a.y);
  const x1 = Math.min(state.map.width, a.x + a.w);
  const y1 = Math.min(state.map.height, a.y + a.h);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/** The cells of an area, row by row. */
export function areaCells(a: VisitArea): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let y = a.y; y < a.y + a.h; y++)
    for (let x = a.x; x < a.x + a.w; x++) out.push({ x, y });
  return out;
}

/** A dig's result: plain finds float; nothing, the Keystone or an artifact is a dialog. */
export function digResult(found: string | null): VisitResult {
  const text =
    found === null ? "You dig, and find nothing." : `Dug up: ${found}!`;
  const show: VisitShow =
    found !== null && isPlainPrize(found) ? "float" : "dialog";
  return {
    show,
    title: "Digging",
    sentence:
      found === null
        ? "You dig, and find nothing here."
        : `You dig, and find ${found}.`,
    text,
    picture: null,
    // The Keystone, a buried artifact or scroll: inspectable (bzc.108).
    icons: show === "dialog" && found !== null ? textIcons(found) : [],
    note:
      found === null
        ? "Digging takes the whole day's movement (300 with a shovel). Obelisks and rumours point at buried things."
        : null,
    area: null,
  };
}
