/**
 * Hero experience and levelling (RULES_V2 3.2 to 3.5).
 *
 * Each level gained gives, in order: +1 to the class pattern's stat (at
 * once, in gainXp), then a one-of-three skill offer, then at levels
 * divisible by 3 a one-of-three feat draft. Offers and drafts are seeded
 * from the game seed, the hero id and the level (and the step), so a
 * reload never changes them. Pending choices are made one at a time in
 * level order: levelUpOffer shows the oldest, chooseLevelUp takes it.
 */
import { getHeroClass, type HeroClassDef } from "../../data/classes.ts";
import {
  PRIMARY_STATS,
  schoolRelation,
  type PrimaryStat,
  type VowRestriction,
} from "../../data/effects.ts";
import {
  FEAT_EVERY,
  FEAT_LIST,
  findFeat,
  isVow,
  type FeatDef,
} from "../../data/feats.ts";
import {
  MAX_SKILL_RANK,
  MAX_SKILLS,
  SKILL_IDS,
  findSkill,
  type SkillId,
} from "../../data/skills.ts";
import { WORN_SLOTS } from "../../data/artifacts.ts";
import { createRng, deriveSeed, type Rng } from "../rng.ts";
import { vowRestrictions, xpPercent } from "./effects.ts";
import { levelForXp } from "./progression.ts";
import { cloneState, fail, findHero, must, success } from "./state.ts";
import type {
  CommandResult,
  GameEvent,
  GameState,
  HeroState,
} from "./types.ts";

/** One of the three skill offers (RULES_V2 3.3). */
export type SkillOffer =
  /** A new skill at rank 1. */
  | { kind: "new"; skill: SkillId }
  /** +1 rank in a held skill; `rank` is the rank after. */
  | { kind: "upgrade"; skill: SkillId; rank: number }
  /** +1 to a primary stat, when fewer than three skill offers exist. */
  | { kind: "stat"; stat: PrimaryStat };

/** The oldest pending choice of a hero. */
export type LevelUpOffer =
  | { step: "skill"; heroId: string; level: number; offers: SkillOffer[] }
  /** Feat ids, one to three. */
  | { step: "feat"; heroId: string; level: number; offers: string[] };

/** The pattern stat for reaching `level` (entry (L - 2) mod 10). */
export function patternStat(cls: HeroClassDef, level: number): PrimaryStat {
  const n = cls.pattern.length;
  return cls.pattern[(((level - 2) % n) + n) % n] as PrimaryStat;
}

/**
 * Adds XP to a hero in place (after its XP percentage, floored). Each level
 * gained adds the pattern stat, one pending choice and a "level-up" event.
 */
export function gainXp(
  hero: HeroState,
  amount: number,
  events: GameEvent[],
): void {
  if (amount <= 0) return;
  const gained = Math.floor((amount * (100 + xpPercent(hero))) / 100);
  hero.xp += gained;
  events.push({ type: "xp", heroId: hero.id, amount: gained });
  const level = levelForXp(hero.xp);
  const cls = getHeroClass(hero.heroClass);
  for (let l = hero.level + 1; l <= level; l++) {
    const stat = patternStat(cls, l);
    hero[stat]++;
    if (hero.pendingLevelUps === 0) hero.levelUpStep = "skill";
    hero.pendingLevelUps++;
    events.push({ type: "level-up", heroId: hero.id, level: l });
    events.push({ type: "stat-gained", heroId: hero.id, stat });
  }
  hero.level = Math.max(hero.level, level);
}

/** The level whose choice is pending next. */
export function pendingLevel(hero: HeroState): number {
  return hero.level - hero.pendingLevelUps + 1;
}

// ------------------------------------------------------------------ vows

/** Whether a vow restriction bars this skill at this rank (RULES_V2 3.5). */
export function skillBarred(
  restrictions: readonly VowRestriction[],
  skill: SkillId,
  rank: number,
): boolean {
  const school = findSkill(skill)?.school;
  if (school === undefined) return false;
  return restrictions.some(
    (r) =>
      (r.kind === "never-cast" && r.school === school) ||
      (r.kind === "max-school-rank" &&
        (r.school === undefined || r.school === school) &&
        rank > r.rank),
  );
}

/** Whether the hero already satisfies a restriction (RULES_V2 3.5). */
export function satisfies(hero: HeroState, r: VowRestriction): boolean {
  switch (r.kind) {
    case "max-school-rank":
      return hero.skills.every((s) => {
        const school = findSkill(s.id)?.school;
        if (school === undefined) return true;
        if (r.school !== undefined && r.school !== school) return true;
        return s.rank <= r.rank;
      });
    case "empty-slot":
      return WORN_SLOTS.every((k, i) => k !== r.slot || hero.worn[i] == null);
    case "never-cast":
    case "no-cast-rounds":
    case "barred-tag":
      // Casting and creature tags are enforced in battle and in the army.
      return true;
  }
}

/** Whether the hero's vows leave a worn slot kind usable. */
export function slotBarred(hero: HeroState, slotIndex: number): boolean {
  const kind = WORN_SLOTS[slotIndex];
  return vowRestrictions(hero).some(
    (r) => r.kind === "empty-slot" && r.slot === kind,
  );
}

// ------------------------------------------------------------------ offers

/** Draws one item with integer weights (all > 0), removing it. */
function drawWeighted<T>(
  rng: Rng,
  pool: Array<{ item: T; weight: number }>,
): T | undefined {
  const total = pool.reduce((n, p) => n + p.weight, 0);
  if (pool.length === 0 || total <= 0) return undefined;
  let r = rng.int(0, total - 1);
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i] as { item: T; weight: number };
    if (r < p.weight) {
      pool.splice(i, 1);
      return p.item;
    }
    r -= p.weight;
  }
  return undefined;
}

/**
 * A skill's offer weight (RULES_V2 3.3): class weight x wheel factor. A
 * school skill's factor is 4 when its school is allied to a school the
 * hero holds, 1 when opposed to one (opposed wins), else 2; other skills 2.
 * Vow-barred skills weigh 0.
 */
export function skillWeight(
  hero: HeroState,
  skill: SkillId,
  rankAfter: number,
): number {
  const def = findSkill(skill);
  if (def === undefined) return 0;
  if (skillBarred(vowRestrictions(hero), skill, rankAfter)) return 0;
  const cls = getHeroClass(hero.heroClass);
  const base = cls.weights[skill] ?? 0;
  if (def.school === undefined) return base * 2;
  let allied = false;
  let opposed = false;
  for (const s of hero.skills) {
    const other = findSkill(s.id)?.school;
    if (other === undefined) continue;
    const rel = schoolRelation(def.school, other);
    if (rel === "allied") allied = true;
    if (rel === "opposed") opposed = true;
  }
  return base * (opposed ? 1 : allied ? 4 : 2);
}

function offerSeed(
  state: GameState,
  hero: HeroState,
  step: "skill" | "feat",
): number {
  return deriveSeed(
    state.seed,
    "level-up",
    hero.id,
    pendingLevel(hero),
    step,
    hero.redraw ? 1 : 0,
  );
}

/** The three skill offers of the hero's pending level (RULES_V2 3.3). */
export function skillOffers(state: GameState, hero: HeroState): SkillOffer[] {
  const rng = createRng(offerSeed(state, hero, "skill"));
  const level = pendingLevel(hero);
  const offers: SkillOffer[] = [];
  const upgrades = hero.skills
    .filter((s) => s.rank < MAX_SKILL_RANK && findSkill(s.id) !== undefined)
    .map((s) => ({
      item: {
        kind: "upgrade",
        skill: s.id as SkillId,
        rank: s.rank + 1,
      } as SkillOffer,
      weight: skillWeight(hero, s.id as SkillId, s.rank + 1),
    }));
  // Offer 1, the guarantee: +1 rank in a held skill (any unbarred one).
  const guaranteePool = upgrades
    .filter((u) => {
      const o = u.item as { skill: SkillId; rank: number };
      return !skillBarred(vowRestrictions(hero), o.skill, o.rank);
    })
    .map((u) => ({ item: u.item, weight: Math.max(1, u.weight) }));
  const guarantee = drawWeighted(rng, guaranteePool);
  if (guarantee !== undefined) offers.push(guarantee);
  // Offers 2 and 3 from every remaining eligible offer.
  const pool = upgrades.filter(
    (u) =>
      u.weight > 0 &&
      (guarantee === undefined ||
        (u.item as { skill: string }).skill !==
          (guarantee as { skill: string }).skill),
  );
  if (hero.skills.length < MAX_SKILLS) {
    for (const id of SKILL_IDS) {
      if (hero.skills.some((s) => s.id === id)) continue;
      const weight = skillWeight(hero, id, 1);
      if (weight > 0) pool.push({ item: { kind: "new", skill: id }, weight });
    }
  }
  while (offers.length < 3) {
    const next = drawWeighted(rng, pool);
    if (next === undefined) break;
    offers.push(next);
  }
  // Stat offers fill the rest, in pattern order after this level's entry.
  const cls = getHeroClass(hero.heroClass);
  const start = (((level - 2) % 10) + 10) % 10;
  const seen = new Set<PrimaryStat>();
  for (let k = 1; offers.length < 3 && k <= cls.pattern.length * 2; k++) {
    const stat = cls.pattern[(start + k) % cls.pattern.length] as PrimaryStat;
    if (seen.has(stat)) continue;
    seen.add(stat);
    offers.push({ kind: "stat", stat });
  }
  for (const stat of PRIMARY_STATS) {
    if (offers.length >= 3) break;
    if (!offers.some((o) => o.kind === "stat" && o.stat === stat)) {
      offers.push({ kind: "stat", stat });
    }
  }
  return offers;
}

/** A feat's draft weight: 1 + 2 x the hero's ranks in its tags (3.5). */
export function featWeight(hero: HeroState, feat: FeatDef): number {
  let ranks = 0;
  for (const tag of feat.tags) {
    ranks += hero.skills.find((s) => s.id === tag)?.rank ?? 0;
  }
  return 1 + 2 * ranks;
}

/** Feats the hero could be offered: not held, vows only if satisfied. */
export function eligibleFeats(hero: HeroState): FeatDef[] {
  return FEAT_LIST.filter(
    (f) =>
      !hero.feats.includes(f.id) &&
      (f.restriction === undefined || satisfies(hero, f.restriction)),
  );
}

/**
 * The feat draft of the hero's pending level (RULES_V2 3.5): three drawn
 * by weight without replacement; at least one is not a vow when a non-vow
 * feat is eligible.
 */
export function featOffers(state: GameState, hero: HeroState): string[] {
  const rng = createRng(offerSeed(state, hero, "feat"));
  const eligible = eligibleFeats(hero);
  const pool = eligible.map((f) => ({ item: f, weight: featWeight(hero, f) }));
  const drawn: FeatDef[] = [];
  while (drawn.length < 3) {
    const f = drawWeighted(rng, pool);
    if (f === undefined) break;
    drawn.push(f);
  }
  if (drawn.length > 0 && drawn.every(isVow)) {
    const plain = pool.filter((p) => !isVow(p.item));
    const f = drawWeighted(rng, plain);
    if (f !== undefined) drawn[drawn.length - 1] = f;
  }
  return drawn.map((f) => f.id);
}

/** The hero's oldest pending choice, or null when none is pending. */
export function levelUpOffer(
  state: GameState,
  heroId: string,
): LevelUpOffer | null {
  const hero = findHero(state, heroId);
  if (hero === undefined || hero.pendingLevelUps <= 0) return null;
  const level = pendingLevel(hero);
  if (hero.levelUpStep === "feat") {
    return { step: "feat", heroId, level, offers: featOffers(state, hero) };
  }
  return { step: "skill", heroId, level, offers: skillOffers(state, hero) };
}

/**
 * Takes the hero's oldest pending choice: `index` into its offers (0..2).
 * After a skill choice at a level divisible by 3, the feat draft of that
 * level is next (skipped when no feat is eligible). Allowed while a battle
 * is pending, so a chained fight uses the new skill.
 */
export function chooseLevelUp(
  state: GameState,
  heroId: string,
  index: number,
): CommandResult {
  if (state.status !== "playing") return fail("game-over", "the game is over");
  const hero = findHero(state, heroId);
  if (hero === undefined || !hero.alive) {
    return fail("unknown-hero", `no hero ${heroId}`);
  }
  const offer = levelUpOffer(state, heroId);
  if (offer === null) return fail("no-level-up", "no level-up pending");
  if (!Number.isInteger(index) || index < 0 || index >= offer.offers.length) {
    return fail("bad-choice", `bad level-up choice ${String(index)}`);
  }
  const next = cloneState(state);
  const h = must(findHero(next, heroId), "hero");
  const events: GameEvent[] = [];
  h.redraw = false;
  if (offer.step === "feat") {
    const feat = offer.offers[index] as string;
    h.feats.push(feat);
    events.push({ type: "feat-gained", heroId, feat });
    h.pendingLevelUps--;
    h.levelUpStep = "skill";
    return success(next, events);
  }
  const choice = offer.offers[index] as SkillOffer;
  if (choice.kind === "stat") {
    h[choice.stat]++;
    events.push({ type: "stat-gained", heroId, stat: choice.stat });
  } else if (choice.kind === "new") {
    h.skills.push({ id: choice.skill, rank: 1 });
    events.push({
      type: "skill-gained",
      heroId,
      skill: choice.skill,
      rank: 1,
    });
  } else {
    const s = must(
      h.skills.find((x) => x.id === choice.skill),
      "held skill",
    );
    s.rank = choice.rank;
    events.push({
      type: "skill-gained",
      heroId,
      skill: choice.skill,
      rank: choice.rank,
    });
  }
  if (offer.level % FEAT_EVERY === 0 && eligibleFeats(h).length > 0) {
    h.levelUpStep = "feat";
  } else {
    h.pendingLevelUps--;
    h.levelUpStep = "skill";
  }
  return success(next, events);
}

/** A feat's name and whether it is a vow, for the interface. */
export function featInfo(id: string): FeatDef | undefined {
  return findFeat(id);
}
