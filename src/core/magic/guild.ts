/**
 * Magic guilds (RULES_V2.md 2.9): what each level of a town's guild
 * teaches, drawn once per town from a seed and the faction's school
 * weights, visible before building; and learning on a hero's visit.
 *
 * The faction bead (bzc.11) calls {@link guildSpells} with its weights and
 * guild cap, or {@link townGuild} with a town; {@link FACTION_SCHOOL_WEIGHTS}
 * holds the documented weights of the three v0.2 factions.
 */

import { createRng, deriveSeed } from "../rng.ts";
import type { School } from "../battle/index.ts";
import { SCHOOLS } from "../battle/index.ts";
import { allSpells, spellInfo } from "./catalog.ts";
import type { SpellInfo } from "./catalog.ts";
import { canLearn } from "./hero.ts";
import type { HeroMagic } from "./hero.ts";

export type SchoolWeights = { readonly [S in School]: number };

/** Spells offered per guild level 1..5 (index = level - 1); tier = level. */
export const GUILD_OFFERS: readonly number[] = [4, 3, 3, 2, 1];

export const MAX_GUILD_LEVEL = 5;

/** Weights and guild caps from FACTION_HUMANS/UNDEAD/GOBLINS/CANDY section 2. */
export const FACTION_SCHOOL_WEIGHTS: Readonly<
  Record<
    string,
    {
      readonly weights: SchoolWeights;
      readonly cap: number;
      /**
       * A second school whose battle page level 1 also guarantees (the
       * Realm's Bloom since balance round 4: the Enchanter starts in Bloom,
       * so its first guild visit always finds a page it can learn).
       */
      readonly alsoFirst?: School;
    }
  >
> = {
  humans: {
    weights: { bloom: 3, accord: 4, clock: 2, hush: 0, storm: 1 },
    cap: 4,
    alsoFirst: "bloom",
  },
  undead: {
    weights: { bloom: 0, accord: 1, clock: 3, hush: 4, storm: 2 },
    cap: 5,
  },
  goblins: {
    weights: { bloom: 4, accord: 0, clock: 2, hush: 2, storm: 2 },
    cap: 3,
  },
  // FACTION_CANDY 2: level 1 always holds a Clock page (the heaviest), which
  // the Confectioner can always learn, so no second guarantee.
  candy: {
    weights: { bloom: 1, accord: 3, clock: 4, hush: 2, storm: 0 },
    cap: 4,
  },
};

/** Weights for a faction without documented ones: every school 1. */
export const EVEN_WEIGHTS: SchoolWeights = {
  bloom: 1,
  accord: 1,
  clock: 1,
  hush: 1,
  storm: 1,
};

export function factionMagic(faction: string): {
  weights: SchoolWeights;
  cap: number;
  alsoFirst?: School;
} {
  return FACTION_SCHOOL_WEIGHTS[faction] ?? { weights: EVEN_WEIGHTS, cap: 5 };
}

function validate(weights: SchoolWeights): void {
  const positive = SCHOOLS.filter((s) => weights[s] > 0).length;
  if (positive < 2)
    throw new Error("school weights: at least two schools above 0");
  for (const s of SCHOOLS) {
    const w = weights[s];
    if (!Number.isInteger(w) || w < 0 || w > 4)
      throw new Error(`school weight ${s} must be 0..4`);
  }
}

/** Picks one spell, weighted by its school's weight. */
function pick(
  rng: ReturnType<typeof createRng>,
  pool: readonly SpellInfo[],
  weights: SchoolWeights,
): SpellInfo | null {
  const total = pool.reduce((t, s) => t + weights[s.school], 0);
  if (total <= 0) return null;
  let r = rng.int(1, total);
  for (const s of pool) {
    r -= weights[s.school];
    if (r <= 0) return s;
  }
  return null;
}

function heaviest(weights: SchoolWeights): School {
  let best: School = SCHOOLS[0] as School;
  for (const s of SCHOOLS) if (weights[s] > weights[best]) best = s;
  return best;
}

/**
 * The spells of every guild level of one town, levels 1 to `cap` (index =
 * level - 1), drawn without replacement, weighted by school (2.9).
 * Guarantees: level 1 has a spell of the heaviest school, and a battle
 * spell of `alsoFirst` when given; level 2 has exactly one condition tool,
 * of a school weighted above 0. The pool holds
 * battle and adventure spells; faction-only pages are not in it.
 */
export function guildSpells(
  seed: number,
  weights: SchoolWeights,
  cap = MAX_GUILD_LEVEL,
  alsoFirst?: School,
): string[][] {
  validate(weights);
  const rng = createRng(deriveSeed(seed, "magic-guild"));
  const pool = allSpells().filter((s) => s.pool && weights[s.school] > 0);
  const levels: string[][] = [];
  for (let level = 1; level <= Math.min(cap, MAX_GUILD_LEVEL); level++) {
    const want = GUILD_OFFERS[level - 1] as number;
    let tierPool = pool.filter((s) => s.tier === level);
    const chosen: SpellInfo[] = [];
    const take = (s: SpellInfo | null): void => {
      if (!s) return;
      chosen.push(s);
      tierPool = tierPool.filter((x) => x.id !== s.id);
    };
    if (level === 1) {
      const top = heaviest(weights);
      take(
        pick(
          rng,
          tierPool.filter((s) => s.school === top),
          weights,
        ),
      );
      if (alsoFirst !== undefined && alsoFirst !== top)
        take(
          pick(
            rng,
            tierPool.filter(
              (s) => s.school === alsoFirst && s.kind === "battle",
            ),
            weights,
          ),
        );
    }
    if (level === 2) {
      take(
        pick(
          rng,
          tierPool.filter((s) => s.tool),
          weights,
        ),
      );
      tierPool = tierPool.filter((s) => !s.tool);
    }
    while (chosen.length < want && tierPool.length > 0) {
      take(pick(rng, tierPool, weights));
    }
    levels.push(chosen.map((s) => s.id));
  }
  return levels;
}

/** The seed of one town's guild (drawn at map creation, per town). */
export function townGuildSeed(gameSeed: number, townId: string): number {
  return deriveSeed(gameSeed, `guild:${townId}`);
}

/** A town's guild offer for its faction (all levels up to the cap). */
export function townGuild(
  gameSeed: number,
  town: { readonly id: string; readonly faction: string },
): string[][] {
  const { weights, cap, alsoFirst } = factionMagic(town.faction);
  return guildSpells(townGuildSeed(gameSeed, town.id), weights, cap, alsoFirst);
}

/**
 * Built guild level of a town: the highest `magic-guild-<n>` building
 * (the faction bead names its guild buildings this way).
 */
export function guildLevelOf(town: {
  readonly buildings: readonly string[];
}): number {
  let level = 0;
  for (const b of town.buildings) {
    const m = /^magic-guild-(\d)$/.exec(b);
    if (m) level = Math.max(level, Number(m[1]));
  }
  return level;
}

/**
 * The spells a hero learns from a guild of `level`: every offered spell up
 * to that level it can learn and does not know (2.9).
 */
export function learnableFromGuild(
  magic: HeroMagic,
  offer: readonly (readonly string[])[],
  level: number,
): string[] {
  const out: string[] = [];
  for (const ids of offer.slice(0, level)) {
    for (const id of ids) {
      const s = spellInfo(id);
      if (magic.knownSpells.includes(id)) continue;
      if (canLearn(magic, s.school, s.tier)) out.push(id);
    }
  }
  return out;
}
