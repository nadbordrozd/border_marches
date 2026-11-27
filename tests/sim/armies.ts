/**
 * Seeded armies, heroes and neutral guards for the battle simulations
 * (tests/sim/battles.ts; the balance bead reuses them). Everything is a
 * pure function of its arguments.
 *
 * - An army is bought with a gold-equivalent budget from one faction's
 *   roster: a seeded share per tier (weighted by weekly growth), the
 *   leftover on tier 1. Resources count at {@link RESOURCE_GOLD}.
 * - A hero is a named hero of one of the faction's two classes raised to a
 *   level (pattern stats per level), with a seeded book from its faction's
 *   guild weights (magic classes get more pages) and sometimes a scroll.
 * - A neutral guard is one neutral creature type split into up to three
 *   stacks, sized to a fight value.
 */
import { createRng, deriveSeed } from "../../src/core/rng.ts";
import { stackFor } from "../../src/core/map/gen/guards.ts";
import { splitNeutralStack } from "../../src/core/game/progression.ts";
import type { Rng } from "../../src/core/rng.ts";
import { creatureFightValue } from "../../src/core/battle/damage.ts";
import { NAMED_HEROES, getHeroClass } from "../../src/data/classes.ts";
import { rosterOf } from "../../src/data/factionCreatures.ts";
import {
  NEUTRAL_CREATURES,
  NEUTRAL_CREATURE_IDS,
  NEUTRAL_MAX_BATTLE_STACKS,
} from "../../src/data/neutrals.ts";
import { CREATURES } from "../../src/data/creatures.ts";
import type { CreatureDef, CreatureId } from "../../src/data/types.ts";
import { newHeroState } from "../../src/core/game/players.ts";
import { patternStat } from "../../src/core/game/hero.ts";
import { maxMana } from "../../src/core/game/effects.ts";
import { heroBattleProfile } from "../../src/core/game/battle-profile.ts";
import type {
  BattleSetup as GameBattleSetup,
  BattleSide as GameBattleSide,
  BattleStack as GameBattleStack,
} from "../../src/core/game/battle.ts";
import type { GameState, HeroState } from "../../src/core/game/types.ts";
import {
  FACTION_SCHOOL_WEIGHTS,
  factionMagic,
  guildSpells,
  learnableFromGuild,
} from "../../src/core/magic/guild.ts";
import { canLearn, heroMagic } from "../../src/core/magic/hero.ts";
import { allSpells } from "../../src/core/magic/catalog.ts";
import { chooseLevelUp, levelUpOffer } from "../../src/core/game/hero.ts";
import { wearError } from "../../src/core/game/artifacts.ts";
import {
  ARTIFACT_LIST,
  WORN_SLOTS,
  type WornArtifactDef,
} from "../../src/data/artifacts.ts";
import { AdventureAi } from "../../src/core/ai/adventure-ai.ts";

export const FACTIONS = [
  "humans",
  "undead",
  "goblins",
  "candy",
  "dwarves",
] as const;
export type Faction = (typeof FACTIONS)[number];

/**
 * Army budgets and hero levels by stage of a game (docs/design/BALANCE.md
 * section 2): from the week 1 ledger and weekly recruitment of
 * ECONOMY.md section 8 and its XP estimate (level by end of week).
 */
export const STAGES = {
  early: { budget: 8000, level: 5, label: "week 1-2", ring: 1 },
  mid: { budget: 30000, level: 11, label: "week 4", ring: 2 },
  late: { budget: 80000, level: 18, label: "week 8", ring: 3 },
} as const;
export type Stage = keyof typeof STAGES;
export const STAGE_IDS = Object.keys(STAGES) as Stage[];

/**
 * How much hero a side gets: full (stats, Command, book and scrolls),
 * nobook (stats and Command, no pages, scrolls or mana) or none (no hero).
 */
export type HeroMode = "full" | "nobook" | "none";
export const HERO_MODES: readonly HeroMode[] = ["full", "nobook", "none"];

/** Gold value of a resource unit when pricing an army. */
export const RESOURCE_GOLD = { wood: 150, ore: 150, essence: 400 } as const;

export function creatureCost(def: CreatureDef): number {
  const c = def.cost;
  return (
    (c.gold ?? 0) +
    (c.wood ?? 0) * RESOURCE_GOLD.wood +
    (c.ore ?? 0) * RESOURCE_GOLD.ore +
    (c.essence ?? 0) * RESOURCE_GOLD.essence
  );
}

export function armyCost(stacks: readonly GameBattleStack[]): number {
  return stacks.reduce(
    (t, s) => t + s.count * creatureCost(CREATURES[s.creature]),
    0,
  );
}

export function armyFightValue(stacks: readonly GameBattleStack[]): number {
  return stacks.reduce(
    (t, s) => t + s.count * creatureFightValue(CREATURES[s.creature]),
    0,
  );
}

function rngFor(seed: number, ...salt: string[]): Rng {
  return createRng(deriveSeed(seed, salt.join(":")));
}

/** A faction army worth about `budget` gold, seeded. */
export function buildArmy(
  faction: Faction,
  budget: number,
  seed: number,
): GameBattleStack[] {
  const rng = rngFor(seed, "army", faction);
  const roster = rosterOf(faction);
  const weights = roster.map((c) => c.growth * creatureCost(c) * 0.5 + 0.5);
  const shares = weights.map((w) => w * (0.4 + 1.2 * rng.next()));
  const total = shares.reduce((a, b) => a + b, 0);
  const counts = roster.map((c, i) =>
    Math.floor(((shares[i] as number) / total) * (budget / creatureCost(c))),
  );
  const spent = roster.reduce(
    (t, c, i) => t + (counts[i] as number) * creatureCost(c),
    0,
  );
  // Leftover: the cheapest tier.
  const t1 = roster[0] as CreatureDef;
  const extra = Math.floor((budget - spent) / creatureCost(t1));
  counts[0] = (counts[0] as number) + Math.max(0, extra);
  return roster
    .map((c, i) => ({
      creature: c.id as CreatureId,
      count: counts[i] as number,
    }))
    .filter((s) => s.count > 0);
}

/**
 * A map guard of about `fightValue` as the generator makes it
 * (src/core/map/gen/guards.ts stackFor: a stray of the ring whose count
 * fits 5-50), deployed as the game deploys it (splitNeutralStack).
 */
export function buildMapGuard(
  fightValue: number,
  seed: number,
  ring: number,
): GameBattleStack[] {
  const g = stackFor(rngFor(seed, "map-guard"), fightValue, { ring });
  return splitNeutralStack(g.count).map((count) => ({
    creature: g.creature as CreatureId,
    count,
  }));
}

/** A neutral guard of about `fightValue`, seeded (one creature type). */
export function buildGuard(
  fightValue: number,
  seed: number,
): GameBattleStack[] {
  const rng = rngFor(seed, "guard");
  const id = NEUTRAL_CREATURE_IDS[
    Math.floor(rng.next() * NEUTRAL_CREATURE_IDS.length)
  ] as CreatureId;
  const def = NEUTRAL_CREATURES[id as keyof typeof NEUTRAL_CREATURES];
  const count = Math.max(1, Math.round(fightValue / creatureFightValue(def)));
  const n = Math.max(1, Math.min(NEUTRAL_MAX_BATTLE_STACKS, count));
  const out: GameBattleStack[] = [];
  for (let i = 0; i < n; i++) {
    const c = Math.floor(count / n) + (i < count % n ? 1 : 0);
    if (c > 0) out.push({ creature: def.id as CreatureId, count: c });
  }
  return out;
}

/** The faction's might and magic classes. */
function classesOf(faction: Faction): { might: string; magic: string } {
  const ids = [
    ...new Set(
      NAMED_HEROES.filter((h) => h.faction === faction).map((h) => h.heroClass),
    ),
  ];
  const might = ids.find((id) => getHeroClass(id).leaning === "might");
  const magic = ids.find((id) => getHeroClass(id).leaning === "magic");
  if (might === undefined || magic === undefined)
    throw new Error(`no classes for ${faction}`);
  return { might, magic };
}

/**
 * What a hero has gathered by a stage of the game (bead bzc.36): the guild
 * level of its home town, spells from map shrines, scrolls and worn
 * artifacts by grade. Skills and feats come from its level-ups.
 */
export interface HeroKit {
  /** Highest guild level built in its town (capped by the faction). */
  readonly guild: number;
  /** Pages from shrines: random pool spells of tier 1-3, if learnable. */
  readonly shrinePages: number;
  readonly scrolls: number;
  readonly trinkets: number;
  readonly wonders: number;
}

/** Kits by stage (BALANCE.md section 8). */
export const STAGE_KITS: Readonly<Record<Stage, HeroKit>> = {
  early: { guild: 1, shrinePages: 0, scrolls: 1, trinkets: 1, wonders: 0 },
  mid: { guild: 3, shrinePages: 1, scrolls: 1, trinkets: 2, wonders: 1 },
  late: { guild: 5, shrinePages: 2, scrolls: 2, trinkets: 3, wonders: 2 },
};

/** Which heroes the runner builds: round 2's stage kits or round 1's bare. */
export type HeroGear = "stage" | "bare";

/**
 * Level-ups as a player makes them: the pattern stat, then the adventure
 * AI's pick among the real seeded skill offers and feat drafts.
 */
function levelUp(hero: HeroState, level: number, seed: number): HeroState {
  const ai = new AdventureAi();
  let state = {
    seed: deriveSeed(seed, "sim-hero"),
    status: "playing",
    heroes: [hero],
    map: null,
  } as unknown as GameState;
  const cls = getHeroClass(hero.heroClass);
  for (let l = 2; l <= level; l++) {
    const h = state.heroes[0] as HeroState;
    h[patternStat(cls, l)] += 1;
    h.level = l;
    h.pendingLevelUps = 1;
    h.levelUpStep = "skill";
    for (let guard = 0; guard < 4 && h.pendingLevelUps > 0; guard++) {
      const cur = state.heroes[0] as HeroState;
      const offer = levelUpOffer(state, cur.id);
      if (offer === null) break;
      const r = chooseLevelUp(state, cur.id, ai.levelUp(state, cur.id, offer));
      if (!r.ok) break;
      state = r.state;
      if ((state.heroes[0] as HeroState).pendingLevelUps <= 0) break;
    }
  }
  return state.heroes[0] as HeroState;
}

/** Worn trinkets and wonders, seeded, each in a free slot of its kind. */
function wearKit(hero: HeroState, kit: HeroKit, rng: Rng): void {
  const worn = ARTIFACT_LIST.filter(
    (a): a is WornArtifactDef =>
      a.kind === "worn" && a.cursed !== true && a.pieceOf === undefined,
  );
  for (const [grade, n] of [
    ["wonder", kit.wonders],
    ["trinket", kit.trinkets],
  ] as const) {
    const pool = worn.filter((a) => a.grade === grade);
    for (let k = 0; k < n && pool.length > 0; k++) {
      for (let tries = 0; tries < 8 && pool.length > 0; tries++) {
        const i = Math.floor(rng.next() * pool.length);
        const def = pool.splice(i, 1)[0] as WornArtifactDef;
        const slot = WORN_SLOTS.findIndex(
          (s, j) => s === def.slot && hero.worn[j] === null,
        );
        if (slot >= 0 && wearError(hero, def.id, slot) === null) {
          hero.worn[slot] = def.id;
          break;
        }
      }
    }
  }
}

/** The book: every guild page it can learn, shrine pages and scrolls. */
function learnKit(
  hero: HeroState,
  faction: Faction,
  kit: HeroKit,
  seed: number,
  rng: Rng,
): void {
  const { weights, cap, alsoFirst } = factionMagic(faction);
  const offer = guildSpells(
    deriveSeed(seed, `book:${faction}`),
    weights,
    cap,
    alsoFirst,
  );
  const level = Math.min(cap, kit.guild);
  hero.pages = [
    ...hero.pages,
    ...learnableFromGuild(heroMagic(hero), offer, level),
  ];
  const pool = allSpells().filter(
    (s) => s.pool && s.kind === "battle" && s.tier <= 3,
  );
  for (let k = 0; k < kit.shrinePages && pool.length > 0; k++) {
    const s = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
    if (s === undefined || hero.pages.includes(s.id)) continue;
    if (canLearn(heroMagic(hero), s.school, s.tier)) hero.pages.push(s.id);
  }
  const scrolls = allSpells().filter(
    (s) => s.pool && s.kind === "battle" && s.tier <= 2,
  );
  hero.scrolls = [];
  for (let k = 0; k < kit.scrolls; k++) {
    const s = scrolls[Math.floor(rng.next() * scrolls.length)];
    if (s !== undefined) hero.scrolls.push(s.id);
  }
}

/**
 * A hero of the faction at `level`. With a kit (round 2, the default
 * gear): real level-ups (pattern stat, the adventure AI's skill and feat
 * picks), the stage's guild pages it can learn, shrine pages, scrolls and
 * worn artifacts. Without one (round 1, `bare`): pattern stats only and a
 * seeded book drawn from the guild weights whatever its school skills.
 */
export function buildHero(
  faction: Faction,
  level: number,
  seed: number,
  leaning: "might" | "magic",
  kit: HeroKit | null = null,
): HeroState {
  const rng = rngFor(seed, "hero", faction, leaning);
  const classId = classesOf(faction)[leaning];
  const defs = NAMED_HEROES.filter((h) => h.heroClass === classId);
  const def = defs[Math.floor(rng.next() * defs.length)] ?? defs[0];
  if (def === undefined) throw new Error(`no hero of ${classId}`);
  if (kit !== null) {
    const hero = levelUp(
      newHeroState(`sim-${faction}`, def, 0, 0, 0),
      level,
      seed,
    );
    wearKit(hero, kit, rng);
    learnKit(hero, faction, kit, seed, rng);
    hero.mana = maxMana(hero);
    return hero;
  }
  const hero = newHeroState(`sim-${faction}`, def, 0, 0, 0);
  const cls = getHeroClass(classId);
  for (let l = 2; l <= level; l++) {
    const stat = patternStat(cls, l);
    hero[stat] += 1;
  }
  hero.level = level;
  const weights = FACTION_SCHOOL_WEIGHTS[faction]?.weights;
  if (weights !== undefined) {
    const levels = guildSpells(deriveSeed(seed, `book:${faction}`), weights, 3);
    const pool = levels.flat();
    const want = leaning === "magic" ? 5 : 2;
    const pages = new Set(hero.pages);
    while (pages.size < hero.pages.length + want && pool.length > 0) {
      const i = Math.floor(rng.next() * pool.length);
      pages.add(pool.splice(i, 1)[0] as string);
    }
    hero.pages = [...pages];
    if (rng.next() < 0.5) {
      const t1 = (levels[0] ?? []).concat(levels[1] ?? []);
      const s = t1[Math.floor(rng.next() * t1.length)];
      if (s !== undefined) hero.scrolls = [s];
    }
  }
  hero.mana = maxMana(hero);
  return hero;
}

/** A hero without spells: no pages, scrolls or mana. */
export function withoutBook(hero: HeroState): HeroState {
  hero.pages = [];
  hero.scrolls = [];
  hero.mana = 0;
  return hero;
}

export function heroSide(
  faction: Faction,
  hero: HeroState,
  stacks: GameBattleStack[],
  owner: number,
): GameBattleSide {
  return {
    owner,
    hero: {
      id: hero.id,
      name: hero.name,
      attack: hero.attack,
      defense: hero.defense,
      profile: heroBattleProfile(hero),
    },
    stacks,
    defenseBonus: 0,
    faction,
    drills: [],
    specials: [],
  };
}

/** A faction side with no hero (HeroMode none). */
export function heroLessSide(
  faction: Faction,
  stacks: GameBattleStack[],
  owner: number,
): GameBattleSide {
  return {
    owner,
    hero: null,
    stacks,
    defenseBonus: 0,
    faction,
    drills: [],
    specials: [],
  };
}

export function guardSide(stacks: GameBattleStack[]): GameBattleSide {
  return {
    owner: -1,
    hero: null,
    stacks,
    defenseBonus: 0,
    faction: null,
  };
}

export function gameSetup(
  seed: number,
  attacker: GameBattleSide,
  defender: GameBattleSide,
): GameBattleSetup {
  return {
    seed,
    terrain: "grass",
    attacker,
    defender,
    battle: { kind: "hero", objectId: "sim", heroId: "sim" },
  };
}
