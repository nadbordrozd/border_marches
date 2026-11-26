/**
 * The magic wheel's model (bead border_marches-bzc.100): the five schools
 * of magic around the wheel, which pairs are allied (neighbours) and which
 * opposed (across), and where each faction's Magic Guild leans, all read
 * from the game's own data so the picture cannot drift from the rules:
 *
 * - the wheel order and relations: `SCHOOLS` and `schoolRelation`
 *   (src/core/battle/magic.ts, RULES_V2 2.1);
 * - each school's theme: its glossary entry (src/data/keywords.ts), whose
 *   "Allied with ...; opposed to ..." sentence a test holds to the rule;
 * - what a rank gives: `RANK_MAX_TIER` and `RANK_POWER_BONUS` (2.2);
 * - Echo and Fuel: their glossary entries; the opposed-school artifacts:
 *   every artifact whose text names an opposed school;
 * - faction leanings: `factionMagic` (src/core/magic/guild.ts, the weights
 *   the guild draws with); a faction is magical when its town tree has a
 *   Magic Guild (the Lost World's has none).
 *
 * Pure: no DOM. src/ui/magic-wheel.ts draws it.
 */

import { ICON_FRAMES } from "../assets/icons.ts";
import {
  RANK_MAX_TIER,
  RANK_POWER_BONUS,
  SCHOOLS,
  schoolRelation,
} from "../core/battle/index.ts";
import type { School } from "../core/battle/index.ts";
import { factionMagic } from "../core/magic/guild.ts";
import { ARTIFACT_LIST } from "../data/artifacts.ts";
import { getHeroClass } from "../data/classes.ts";
import { SCHOOL_NAMES } from "../data/effects.ts";
import { FACTIONS } from "../data/factions.ts";
import type { FactionDef } from "../data/factions.ts";
import { keyword } from "../data/keywords.ts";
import { findSkill, schoolSkillOf } from "../data/skills.ts";
import type { FactionId } from "../data/types.ts";

/** One school on the wheel. */
export interface WheelSchool {
  readonly id: School;
  readonly name: string;
  readonly colour: string;
  /** Degrees clockwise from the top of the wheel (Bloom at 0). */
  readonly angle: number;
  /** "Healing, summoning and effects that grow." */
  readonly theme: string;
  /** The school skill that gives rank in it ("Greencraft"). */
  readonly skill: string;
  /** The two neighbours, the one before first. */
  readonly allied: readonly [School, School];
  /** The two across, nearer the one after first. */
  readonly opposed: readonly [School, School];
  /** Factions whose guild teaches it, heaviest first. */
  readonly leaners: ReadonlyArray<{ faction: FactionId; weight: number }>;
}

/** A pair of schools: neighbours (allied) or across (opposed). */
export interface WheelLink {
  readonly a: School;
  readonly b: School;
  readonly kind: "allied" | "opposed";
}

/** One faction around the wheel (or, without magic, beside it). */
export interface WheelFaction {
  readonly id: FactionId;
  readonly name: string;
  readonly colour: string;
  /** A Magic Guild in its towns. */
  readonly magical: boolean;
  /** Can be picked in a new game. */
  readonly playable: boolean;
  /** Guild weight 0..4 per school (all 0 without magic). */
  readonly weights: Readonly<Record<School, number>>;
  /** Schools its guild teaches, heaviest first (ties in wheel order). */
  readonly schools: readonly School[];
  /** Highest Magic Guild level its towns can build; 0 without magic. */
  readonly guildCap: number;
  /**
   * Where it sits: the direction of its weights summed as vectors around
   * the wheel, degrees clockwise from the top; null without magic.
   */
  readonly angle: number | null;
  /** The class it shows: its magic class, else its first. */
  readonly hero: {
    readonly id: string;
    readonly name: string;
    readonly portrait: string;
    readonly leaning: "might" | "magic";
    /** The school the class starts with a rank in, if any. */
    readonly school: School | null;
  };
}

/** What each school rank gives (RULES_V2 2.2). */
export interface WheelRank {
  readonly rank: number;
  readonly maxTier: number;
  readonly power: number;
}

export interface MagicWheelModel {
  /** In wheel order. */
  readonly schools: readonly WheelSchool[];
  /** Five allied pairs, then five opposed pairs. */
  readonly links: readonly WheelLink[];
  /** Magical factions first, in registry order. */
  readonly factions: readonly WheelFaction[];
  readonly ranks: readonly WheelRank[];
  /** The glossary's Echo and Fuel (what allied and opposed do in battle). */
  readonly echo: string;
  readonly fuel: string;
  /** Artifacts whose rule pays for opposed schools. */
  readonly opposedArtifacts: ReadonlyArray<{ name: string; text: string }>;
}

/** A neutral stone colour for a faction without a flag colour. */
export const NO_FLAG = "#8a7d66";

const STEP = 360 / SCHOOLS.length;

function schoolAt(i: number): School {
  const n = SCHOOLS.length;
  return SCHOOLS[(((i % n) + n) % n) as number] as School;
}

/** The theme part of a school's glossary entry (before "Allied with"). */
export function schoolTheme(school: School): string {
  const text = keyword(`school-${school}`).text;
  return text.split(/\s*Allied with/)[0]?.trim() ?? text;
}

/** Degrees clockwise from the top of the wheel's weighted direction. */
export function leaningAngle(
  weights: Readonly<Record<School, number>>,
): number | null {
  let x = 0;
  let y = 0;
  SCHOOLS.forEach((s, i) => {
    const a = (i * STEP * Math.PI) / 180;
    x += weights[s] * Math.sin(a);
    y += weights[s] * Math.cos(a);
  });
  if (Math.hypot(x, y) < 1e-9) return null;
  const deg = (Math.atan2(x, y) * 180) / Math.PI;
  return (deg + 360) % 360;
}

function hasGuild(f: FactionDef): boolean {
  if (f.town === null) return false;
  return f.town.order.some((b) => b.startsWith("magic-guild"));
}

function wheelFaction(f: FactionDef): WheelFaction {
  const magical = hasGuild(f);
  const zero = Object.fromEntries(SCHOOLS.map((s) => [s, 0])) as Record<
    School,
    number
  >;
  const magic = magical ? factionMagic(f.id) : null;
  const weights = magic === null ? zero : { ...magic.weights };
  const schools = SCHOOLS.filter((s) => weights[s] > 0).sort(
    (a, b) => weights[b] - weights[a],
  );
  const classes = f.heroClasses.map((c) => getHeroClass(c));
  const cls = classes.find((c) => c.leaning === "magic") ?? classes[0];
  if (cls === undefined) throw new Error(`faction ${f.id} has no hero class`);
  const school =
    cls.startingSkills
      .map((s) => findSkill(s)?.school)
      .find((s): s is School => s !== undefined) ?? null;
  return {
    id: f.id,
    name: f.name,
    colour: f.colour ?? NO_FLAG,
    magical,
    playable: f.available && f.town !== null,
    weights,
    schools,
    guildCap: magic === null ? 0 : magic.cap,
    angle: magical ? leaningAngle(weights) : null,
    hero: {
      id: cls.id,
      name: cls.name,
      portrait: cls.portrait,
      leaning: cls.leaning,
      school,
    },
  };
}

/** The whole wheel, from the game's data. */
export function magicWheelModel(): MagicWheelModel {
  const factions = FACTIONS.map(wheelFaction).sort(
    (a, b) => Number(b.magical) - Number(a.magical),
  );
  const schools = SCHOOLS.map((id, i): WheelSchool => {
    const allied = [schoolAt(i - 1), schoolAt(i + 1)] as const;
    const opposed = [schoolAt(i + 2), schoolAt(i + 3)] as const;
    return {
      id,
      name: SCHOOL_NAMES[id],
      colour: ICON_FRAMES[id].colour,
      angle: i * STEP,
      theme: schoolTheme(id),
      skill: schoolSkillOf(id).name,
      allied,
      opposed,
      leaners: factions
        .filter((f) => f.weights[id] > 0)
        .map((f) => ({ faction: f.id, weight: f.weights[id] }))
        .sort((a, b) => b.weight - a.weight),
    };
  });
  const links: WheelLink[] = [];
  for (const kind of ["allied", "opposed"] as const)
    SCHOOLS.forEach((a, i) => {
      for (let j = i + 1; j < SCHOOLS.length; j++) {
        const b = SCHOOLS[j] as School;
        if (schoolRelation(a, b) === kind) links.push({ a, b, kind });
      }
    });
  return {
    schools,
    links,
    factions,
    ranks: [1, 2, 3].map((rank) => ({
      rank,
      maxTier: RANK_MAX_TIER[rank] ?? 0,
      power: RANK_POWER_BONUS[rank] ?? 0,
    })),
    echo: keyword("echo").text,
    fuel: keyword("fuel").text,
    opposedArtifacts: ARTIFACT_LIST.filter((a) =>
      /\bopposed\b/.test(a.text),
    ).map((a) => ({ name: a.name, text: a.text })),
  };
}

/** "Bloom and Accord". */
export function pairName(a: School, b: School): string {
  return `${SCHOOL_NAMES[a]} and ${SCHOOL_NAMES[b]}`;
}

/** What a school rank gives, in words ("learns tiers 1-4, +2 Power"). */
export function rankWords(r: WheelRank): string {
  return `learns tiers 1-${r.maxTier}${r.power > 0 ? `, +${r.power} Power` : ""}`;
}
