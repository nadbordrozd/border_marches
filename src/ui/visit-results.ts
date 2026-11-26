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
import { heroMagic, isSpell, spellInfo } from "../core/magic/index.ts";
import type { MapObject } from "../core/map/types.ts";
import type { IconKind } from "../assets/icons.ts";
import { SCHOOL_NAMES } from "../data/effects.ts";
import { OBJECT_TYPES, type Prize } from "../data/objectTypes.ts";
import { findSkill } from "../data/skills.ts";
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

function prizeIcons(p: Prize): VisitIcon[] {
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
    icons: show === "dialog" ? siteIcons(obj) : [],
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
    icons: [],
    note:
      found === null
        ? "Digging takes the whole day's movement (300 with a shovel). Obelisks and rumours point at buried things."
        : null,
    area: null,
  };
}
