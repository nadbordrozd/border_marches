/**
 * Feats and vows (CONTENT_HEROES.md sections 2 and 3, RULES_V2 3.5).
 *
 * A feat is drafted one of three at every level that is a multiple of 3;
 * its offer weight is 1 + 2 x the hero's ranks in its tagged skills. A vow
 * is a feat with a restriction from the fixed list (src/data/effects.ts
 * {@link VowRestriction}); it is offered only to a hero that already
 * satisfies it, and is enforced after.
 *
 * To add a row (bead bzc.12): id, name, up to three tag skills, the rule
 * sentence, its effects (existing kinds) and, for a vow, the restriction.
 * Rules the battle grammar implements are carried as `switch` effects.
 */
import type { HeroEffect, VowRestriction } from "./effects.ts";
import type { SkillId } from "./skills.ts";

export interface FeatDef {
  id: string;
  name: string;
  /** Up to three skills; each rank held adds 2 to the offer weight. */
  tags: readonly SkillId[];
  /** The rule, one sentence. */
  text: string;
  effects: readonly HeroEffect[];
  /** Present for vows. */
  restriction?: VowRestriction;
  /** The restriction as shown to the player (vows). */
  restrictionText?: string;
}

/** Feats are drafted at every level divisible by this (RULES_V2 3.5). */
export const FEAT_EVERY = 3;

export const FEAT_LIST: readonly FeatDef[] = [
  {
    id: "long-echo",
    name: "Long Echo",
    tags: ["covenant", "horology"],
    text: "Your Echo adds 2 rounds instead of 1.",
    effects: [{ kind: "switch", id: "echo-adds-2" }],
  },
  {
    id: "bonfire",
    name: "Bonfire",
    tags: ["stormcalling", "quietus"],
    text: "Your Fuel triples the spell's size instead of doubling it.",
    effects: [{ kind: "switch", id: "fuel-triples" }],
  },
  {
    id: "pile-on",
    name: "Pile On",
    tags: ["horology", "onslaught"],
    text: "Strikes by your stacks against a Delayed, Slowed or Shaken stack are x 125%.",
    effects: [
      {
        kind: "strike-percent",
        strike: "all",
        direction: "dealt",
        percent: 25,
        targetBears: ["delayed", "slowed", "shaken"],
      },
    ],
  },
  {
    id: "field-surgeon",
    name: "Field Surgeon",
    tags: ["bulwark", "greencraft"],
    text: "After a battle you win, each of your stacks regains a tenth of the creatures it lost in it, rounded down.",
    effects: [{ kind: "field-surgeon", tenths: 1 }],
  },
  {
    id: "vow-of-the-grave",
    name: "Vow of the Grave",
    tags: ["quietus"],
    text: "Your Hush pages are not spent when cast on your own stacks or on remains.",
    effects: [{ kind: "switch", id: "hush-unspent-own" }],
    restriction: { kind: "never-cast", school: "bloom" },
    restrictionText: "You can never cast Bloom.",
  },
  {
    id: "vow-of-the-patient",
    name: "Vow of the Patient",
    tags: ["deep-wells", "bulwark"],
    text: "Your pages have +3 Power.",
    effects: [{ kind: "page-power", amount: 3 }],
    restriction: { kind: "no-cast-rounds", rounds: "1-2" },
    restrictionText: "You cannot cast in rounds 1 and 2.",
  },
  {
    id: "vow-of-the-unlettered",
    name: "Vow of the Unlettered",
    tags: ["onslaught", "bulwark", "banner"],
    text: "Your stacks have +1 Speed and their Strikes are x 110%.",
    effects: [
      { kind: "stack-stats", speed: 1 },
      {
        kind: "strike-percent",
        strike: "all",
        direction: "dealt",
        percent: 10,
      },
    ],
    restriction: { kind: "max-school-rank", rank: 0 },
    restrictionText: "You hold no school skill at all.",
  },
  {
    id: "vow-of-empty-pockets",
    name: "Vow of Empty Pockets",
    tags: ["stormcalling", "quietus"],
    text: "You may Fuel twice per battle.",
    effects: [{ kind: "switch", id: "fuel-uses-plus-1" }],
    restriction: { kind: "empty-slot", slot: "pocket" },
    restrictionText: "Both Pocket slots must stay empty.",
  },
  {
    id: "vow-of-the-barefoot-pilgrim",
    name: "Vow of the Barefoot Pilgrim",
    tags: ["wayfaring", "trailcraft"],
    text: "All passable terrain costs this hero 100 per straight step, and it has +200 movement points.",
    effects: [
      { kind: "terrain-cost", reduce: 1000 },
      { kind: "movement-flat", amount: 200 },
    ],
    restriction: { kind: "empty-slot", slot: "feet" },
    restrictionText: "The Feet slot must stay empty.",
  },
];

export const FEATS: Readonly<Record<string, FeatDef>> = Object.fromEntries(
  FEAT_LIST.map((f) => [f.id, f]),
);

export function findFeat(id: string): FeatDef | undefined {
  return Object.hasOwn(FEATS, id) ? FEATS[id] : undefined;
}

export function getFeat(id: string): FeatDef {
  const def = findFeat(id);
  if (def === undefined) throw new Error(`unknown feat "${id}"`);
  return def;
}

export function isVow(def: FeatDef): boolean {
  return def.restriction !== undefined;
}
