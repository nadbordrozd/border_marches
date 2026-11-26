/**
 * Magic learning made visible (bead bzc.81). The rule stays RULES_V2 2.2
 * and 2.9: every hero has a book, and a hero in its own town learns every
 * guild spell its school ranks allow, at once and for free (rank 1 teaches
 * tiers 1-2, rank 2 tiers 1-4, rank 3 all five). These plain models say,
 * per guild spell and hero, whether it is learnt and if not why, and how a
 * school rank is had; the town screen, the learn dialogs and the map card
 * draw them (unit-tested in tests/ui/guild-learning.test.ts).
 */
import type { School } from "../core/battle/index.ts";
import { RANK_MAX_TIER, SCHOOLS } from "../core/battle/index.ts";
import type { GameState, HeroState, TownState } from "../core/game/index.ts";
import {
  canLearn,
  guildLevelOf,
  heroMagic,
  isSpell,
  spellInfo,
  townGuild,
} from "../core/magic/index.ts";
import type { MapObject } from "../core/map/types.ts";
import { SCHOOL_NAMES } from "../data/effects.ts";
import { buildingDef } from "../data/factions.ts";
import { getHeroClass } from "../data/hero.ts";
import { SKILLS, type SkillDef } from "../data/skills.ts";

/** Where one guild spell stands for one hero (or for nobody). */
export type GuildSpellState =
  | { readonly kind: "learnt" }
  /** Learnable now but not yet in the book: the next day in town adds it. */
  | { readonly kind: "learns" }
  | {
      readonly kind: "needs-rank";
      readonly school: School;
      readonly rank: number;
    }
  /** A vow bars the school outright. */
  | { readonly kind: "barred"; readonly school: School }
  /** A vow caps the school's rank below what the tier needs. */
  | {
      readonly kind: "capped";
      readonly school: School;
      readonly rank: number;
      readonly cap: number;
    }
  | { readonly kind: "not-built"; readonly level: number }
  /** Built, and no hero is in the town to learn it. */
  | { readonly kind: "no-hero" };

/** The school rank a spell tier needs (RANK_MAX_TIER: 0, 2, 4, 5). */
export function rankForTier(tier: number): number {
  const r = RANK_MAX_TIER.findIndex((max) => max >= tier);
  return r < 0 ? 3 : r;
}

/**
 * Where guild spell `spell` of guild level `level` stands for `hero` in a
 * town whose guild is built up to `built`. A spell already in the book is
 * learnt wherever it came from.
 */
export function guildSpellState(
  hero: HeroState | undefined,
  spell: string,
  level: number,
  built: number,
): GuildSpellState {
  if (hero?.pages.includes(spell) === true) return { kind: "learnt" };
  if (level > built) return { kind: "not-built", level };
  if (hero === undefined) return { kind: "no-hero" };
  const info = spellInfo(spell);
  const m = heroMagic(hero);
  const need = rankForTier(info.tier);
  if (m.barred?.includes(info.school) === true)
    return { kind: "barred", school: info.school };
  const cap = m.rankCap?.[info.school];
  if (cap !== undefined && cap < need)
    return { kind: "capped", school: info.school, rank: need, cap };
  if (m.schoolRanks[info.school] < need)
    return { kind: "needs-rank", school: info.school, rank: need };
  return { kind: "learns" };
}

/** The state as the guild shows it under a spell. */
export function guildStateText(st: GuildSpellState): string {
  switch (st.kind) {
    case "learnt":
      return "Learnt";
    case "learns":
      return "Learns it at the next day's start here";
    case "needs-rank":
      return `Can't learn yet: needs ${SCHOOL_NAMES[st.school]} rank ${st.rank}`;
    case "barred":
      return `Can't learn: a vow bars ${SCHOOL_NAMES[st.school]}`;
    case "capped":
      return `Can't learn: a vow caps ${SCHOOL_NAMES[st.school]} at rank ${st.cap}`;
    case "not-built":
      return "Not built";
    case "no-hero":
      return "A hero who visits learns it";
  }
}

/** The tone of a state: learnt (good), blocked (bad), neither (dim). */
export function guildStateTone(st: GuildSpellState): "good" | "bad" | "dim" {
  if (st.kind === "learnt" || st.kind === "learns") return "good";
  if (st.kind === "not-built" || st.kind === "no-hero") return "dim";
  return "bad";
}

/** The school skill that gives a school's rank (Greencraft for Bloom ...). */
export function schoolSkill(school: School): SkillDef | undefined {
  return Object.values(SKILLS).find(
    (s) => s?.family === "school" && s.school === school,
  );
}

/** "Bloom rank 1" for each blocked school, highest rank needed, wheel order. */
function neededRanks(states: readonly GuildSpellState[]): Map<School, number> {
  const out = new Map<School, number>();
  for (const st of states)
    if (st.kind === "needs-rank")
      out.set(st.school, Math.max(out.get(st.school) ?? 0, st.rank));
  const ordered = new Map<School, number>();
  for (const s of SCHOOLS) {
    const r = out.get(s);
    if (r !== undefined) ordered.set(s, r);
  }
  return ordered;
}

/** "a, b and c". */
function listWords(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The rule in one sentence. */
export const RANK_RULE =
  "School rank 1 teaches tiers 1 and 2, rank 2 tiers 1 to 4, rank 3 all five.";

/**
 * How a hero gets the school ranks it lacks (null: it lacks none): the
 * school skills by name, a level-up offer (unless the hero's class is
 * never offered it) or a Tutor's Hut, and a hut the player has seen that
 * teaches one. `schools` empty: every school (a hero with none).
 */
export function rankHowTo(
  state: GameState,
  hero: HeroState | undefined,
  schools: readonly School[],
): string {
  const wanted = schools.length === 0 ? SCHOOLS : schools;
  const skills = wanted
    .map((s) => ({ school: s, skill: schoolSkill(s) }))
    .filter((x): x is { school: School; skill: SkillDef } => !!x.skill);
  const names = listWords(
    skills.map((x) => `${x.skill.name} (${SCHOOL_NAMES[x.school]})`),
  );
  const lines = [
    `A school rank is a school skill: ${names}. Take one when a level-up offers it, or learn it at a Tutor's Hut that teaches it.`,
  ];
  if (hero !== undefined) {
    const weights = getHeroClass(hero.heroClass).weights;
    const never = skills.filter((x) => (weights[x.skill.id] ?? 0) <= 0);
    if (never.length > 0 && never.length === skills.length)
      lines.push(
        `Level-ups never offer ${listWords(never.map((x) => x.skill.name))} to a ${getHeroClass(hero.heroClass).name}.`,
      );
    const seen = seenTutors(
      state,
      hero.owner,
      skills.map((x) => x.skill.id),
    );
    if (seen.length > 0)
      lines.push(
        `You have seen a Tutor's Hut that teaches ${listWords(seen.map((id) => SKILLS[id as keyof typeof SKILLS]?.name ?? id))}.`,
      );
  }
  return lines.join(" ");
}

/** Skills of `skills` that a Tutor's Hut the player has explored teaches. */
function seenTutors(
  state: GameState,
  player: number,
  skills: readonly string[],
): string[] {
  const explored = state.players.find((p) => p.id === player)?.explored;
  const out: string[] = [];
  for (const o of state.map.objects) {
    if (o.data["type"] !== "tutors-hut") continue;
    const skill = String(o.data["skill"] ?? "");
    if (!skills.includes(skill) || out.includes(skill)) continue;
    if (explored?.[o.y * state.map.width + o.x] !== true) continue;
    out.push(skill);
  }
  return out;
}

// ------------------------------------------------------------ the guild

export interface GuildSpellView {
  readonly id: string;
  readonly name: string;
  readonly school: School;
  readonly tier: number;
  readonly level: number;
  readonly state: GuildSpellState;
  readonly text: string;
  readonly tone: "good" | "bad" | "dim";
}

export interface GuildLevelView {
  readonly level: number;
  readonly built: boolean;
  readonly spells: readonly GuildSpellView[];
}

export interface GuildView {
  /** The hero the states are for, or null with nobody in the town. */
  readonly hero: { readonly id: string; readonly name: string } | null;
  /** The highest guild level built (0: none). */
  readonly built: number;
  readonly levels: readonly GuildLevelView[];
  /** One sentence: what the guild does for this hero now. */
  readonly summary: string;
  /** How to get the ranks the hero lacks, or the rule with nobody here. */
  readonly howTo: string | null;
}

/** The guild levels the faction can build (its magic-guild-<n> buildings). */
export function guildLevels(town: TownState): number {
  let n = 0;
  while (buildingDef(town.faction, `magic-guild-${n + 1}`) !== undefined) n++;
  return n;
}

/**
 * The town's guild for `hero` (the hero in the town, or undefined): every
 * level the faction can build with its seeded spells and their states.
 * Null when the faction has no guild.
 */
export function guildView(
  state: GameState,
  town: TownState,
  hero: HeroState | undefined,
): GuildView | null {
  const max = guildLevels(town);
  if (max === 0) return null;
  const built = guildLevelOf(town);
  const offer = townGuild(state.seed, town).slice(0, max);
  const levels = offer.map((ids, i): GuildLevelView => {
    const level = i + 1;
    return {
      level,
      built: level <= built,
      spells: ids.map((id): GuildSpellView => {
        const info = spellInfo(id);
        const st = guildSpellState(hero, id, level, built);
        return {
          id,
          name: info.name,
          school: info.school,
          tier: info.tier,
          level,
          state: st,
          text: guildStateText(st),
          tone: guildStateTone(st),
        };
      }),
    };
  });
  const builtSpells = levels.filter((l) => l.built).flatMap((l) => l.spells);
  const states = builtSpells.map((s) => s.state);
  const need = neededRanks(states);
  let summary: string;
  let howTo: string | null = null;
  if (built === 0) {
    summary =
      "No guild is built yet. Build Magic Guild 1, and a hero who visits learns its spells at once, free.";
    howTo = RANK_RULE;
  } else if (hero === undefined) {
    summary =
      "A hero who visits learns these spells at once and for free, as far as its school ranks allow.";
    howTo = RANK_RULE;
  } else {
    const learnt = states.filter((s) => s.kind === "learnt").length;
    const noSchool = SCHOOLS.every((s) => heroMagic(hero).schoolRanks[s] <= 0);
    summary = noSchool
      ? `${hero.name} has no school of magic, so the guild cannot teach them anything yet.`
      : `${hero.name} has learnt ${learnt} of the ${builtSpells.length} spells built here.`;
    if (need.size > 0 || noSchool)
      howTo = `${rankHowTo(state, hero, noSchool ? [] : [...need.keys()])} ${RANK_RULE}`;
  }
  return {
    hero: hero === undefined ? null : { id: hero.id, name: hero.name },
    built,
    levels,
    summary,
    howTo,
  };
}

// ------------------------------------------------------------ learning

export interface LearntSpell {
  readonly id: string;
  readonly name: string;
  readonly school: School;
  readonly tier: number;
}

export interface LearntModel {
  readonly title: string;
  readonly heroId: string;
  readonly heroName: string;
  readonly townName: string;
  readonly sentence: string;
  readonly spells: readonly LearntSpell[];
  /** The built spells the hero still cannot learn, and why; or null. */
  readonly consequence: string | null;
}

/** What the built guild still withholds from the hero (or null). */
function withheld(state: GameState, town: TownState, hero: HeroState) {
  const view = guildView(state, town, hero);
  if (view === null) return null;
  const blocked = view.levels
    .filter((l) => l.built)
    .flatMap((l) => l.spells)
    .filter((s) => s.tone === "bad");
  if (blocked.length === 0) return null;
  const need = neededRanks(blocked.map((s) => s.state));
  const ranks = [...need].map(([s, r]) => `${SCHOOL_NAMES[s]} rank ${r}`);
  const n = blocked.length;
  return ranks.length > 0
    ? `${n} more ${n === 1 ? "spell" : "spells"} here ${n === 1 ? "needs" : "need"} ${listWords(ranks)}.`
    : `${n} more ${n === 1 ? "spell" : "spells"} here ${n === 1 ? "is" : "are"} barred by a vow.`;
}

/** The learn dialog's model: the hero's new pages from a town's guild. */
export function learntModel(
  state: GameState,
  heroId: string,
  townId: string,
  spells: readonly string[],
): LearntModel | null {
  const hero = state.heroes.find((h) => h.id === heroId);
  const town = state.towns[townId];
  if (hero === undefined || town === undefined || spells.length === 0)
    return null;
  const list = spells.map((id): LearntSpell => {
    const s = spellInfo(id);
    return { id, name: s.name, school: s.school, tier: s.tier };
  });
  const n = list.length;
  return {
    title: `${hero.name} learns ${n === 1 ? "a spell" : `${n} spells`}`,
    heroId,
    heroName: hero.name,
    townName: town.name,
    sentence: `The Mage Guild of ${town.name} teaches ${hero.name} ${n === 1 ? "a new page" : `${n} new pages`} for the spellbook, free.`,
    spells: list,
    consequence: withheld(state, town, hero),
  };
}

/**
 * Whether entering the town should explain why the hero learnt nothing:
 * its own town with a guild built, and no school rank at all.
 */
export function learnsNothingForNoSchool(
  state: GameState,
  heroId: string,
  townId: string,
): boolean {
  const hero = state.heroes.find((h) => h.id === heroId);
  const town = state.towns[townId];
  if (hero === undefined || town === undefined) return false;
  if (town.owner !== hero.owner || guildLevelOf(town) === 0) return false;
  const ranks = heroMagic(hero).schoolRanks;
  return SCHOOLS.every((s) => ranks[s] <= 0);
}

export interface NoSchoolModel {
  readonly title: string;
  readonly heroId: string;
  readonly sentence: string;
  readonly howTo: string;
  readonly scrolls: string;
}

/** The one-time explanation for a hero with no school in a guild town. */
export function noSchoolModel(
  state: GameState,
  heroId: string,
  townId: string,
): NoSchoolModel | null {
  const hero = state.heroes.find((h) => h.id === heroId);
  const town = state.towns[townId];
  if (hero === undefined || town === undefined) return null;
  return {
    title: `${hero.name} learns no spells`,
    heroId,
    sentence: `Every hero has a spellbook, and a guild teaches its spells free, but only in a school the hero has a rank in. ${hero.name} has no school of magic, so the Mage Guild of ${town.name} teaches nothing.`,
    howTo: `${rankHowTo(state, hero, [])} ${RANK_RULE}`,
    scrolls:
      "Without a school, scrolls still work: any hero can cast one once, at no mana.",
  };
}

// ------------------------------------------------------------ map card

/**
 * What a learning site means for the selected hero (null: nothing to
 * add): a School Shrine's spell as a page or only a scroll, a Tutor's Hut
 * that teaches a school skill.
 */
export function siteLearningLine(
  obj: MapObject,
  hero: HeroState | undefined,
): { readonly text: string; readonly tone: "good" | "dim" | "bad" } | null {
  if (hero === undefined) return null;
  const type = obj.data["type"];
  if (type === "school-shrine") {
    const spell = String(obj.data["spell"] ?? "");
    if (!isSpell(spell)) return null;
    if (hero.pages.includes(spell))
      return { text: `${hero.name} already knows it.`, tone: "dim" };
    const info = spellInfo(spell);
    const need = rankForTier(info.tier);
    const m = heroMagic(hero);
    const ok =
      canLearn(m, info.school, info.tier) && m.schoolRanks[info.school] >= need;
    return ok
      ? { text: `${hero.name} learns it as a page.`, tone: "good" }
      : {
          text: `${hero.name} has no ${SCHOOL_NAMES[info.school]} rank ${need}: only a scroll (one cast).`,
          tone: "bad",
        };
  }
  if (type === "tutors-hut") {
    const skill =
      SKILLS[String(obj.data["skill"] ?? "") as keyof typeof SKILLS];
    if (skill?.family !== "school" || skill.school === undefined) return null;
    if (hero.skills.some((s) => s.id === skill.id)) return null;
    return {
      text: `${skill.name} gives ${SCHOOL_NAMES[skill.school]} rank 1: your Mage Guilds then teach ${hero.name} its tier 1 and 2 spells.`,
      tone: "good",
    };
  }
  return null;
}

/**
 * The guild line of an own town's map card for the selected hero: what
 * entering would teach it (null: no guild built, or no hero).
 */
export function guildCardLine(
  state: GameState,
  town: TownState,
  hero: HeroState | undefined,
): { readonly text: string; readonly tone: "good" | "dim" | "bad" } | null {
  if (hero === undefined || town.owner !== hero.owner) return null;
  const view = guildView(state, town, hero);
  if (view === null || view.built === 0) return null;
  const spells = view.levels.filter((l) => l.built).flatMap((l) => l.spells);
  const fresh = spells.filter((s) => s.state.kind === "learns").length;
  const blocked = spells.filter((s) => s.tone === "bad").length;
  const ranks = heroMagic(hero).schoolRanks;
  if (SCHOOLS.every((s) => ranks[s] <= 0))
    return {
      text: `Mage Guild ${view.built}: ${hero.name} has no school of magic and learns nothing here.`,
      tone: "bad",
    };
  if (fresh > 0)
    return {
      text: `Mage Guild ${view.built}: ${hero.name} learns ${fresh} new ${fresh === 1 ? "spell" : "spells"} here.`,
      tone: "good",
    };
  if (blocked > 0)
    return {
      text: `Mage Guild ${view.built}: ${hero.name} knows all it can learn here; ${blocked} more need a higher school rank.`,
      tone: "dim",
    };
  return {
    text: `Mage Guild ${view.built}: ${hero.name} knows every spell here.`,
    tone: "dim",
  };
}
