/**
 * Feats and vows (CONTENT_HEROES.md sections 2 and 3, RULES_V2 3.5): all
 * 28 feats and 12 vows of the v0.2 catalogue.
 *
 * A feat is drafted one of three at every level that is a multiple of 3;
 * its offer weight is 1 + 2 x the hero's ranks in its tagged skills. A vow
 * is a feat with a restriction from the fixed list (src/data/effects.ts
 * {@link VowRestriction}); it is offered only to a hero that already
 * satisfies it, and is enforced after.
 *
 * A row is id, name, up to three tag skills, the rule sentence, its
 * effects and, for a vow, the restriction. Rules that bend the battle
 * grammar are `switch` effects (src/data/effects.ts RULE_SWITCH_IDS,
 * implemented where each id's comment says).
 */
import type { HeroEffect, RuleSwitchId, VowRestriction } from "./effects.ts";
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

/** A feat whose whole rule is one battle rule. */
function rule(
  id: string,
  name: string,
  tags: readonly SkillId[],
  text: string,
  sw: RuleSwitchId = id as RuleSwitchId,
): FeatDef {
  return { id, name, tags, text, effects: [{ kind: "switch", id: sw }] };
}

/** A vow: a restriction and its rule. */
function vow(
  id: string,
  name: string,
  tags: readonly SkillId[],
  restriction: VowRestriction,
  restrictionText: string,
  text: string,
  effects: readonly HeroEffect[],
): FeatDef {
  return { id, name, tags, text, effects, restriction, restrictionText };
}

export const FEAT_LIST: readonly FeatDef[] = [
  // Feats (28), in catalogue order.
  rule(
    "spillover",
    "Spillover",
    ["greencraft", "quietus", "stormcalling"],
    "The first bane you place each battle also lands on one stack of your choice adjacent to its target.",
  ),
  rule(
    "bonfire",
    "Bonfire",
    ["stormcalling", "quietus"],
    "Your Fuel triples the spell's size instead of doubling it.",
    "fuel-triples",
  ),
  rule(
    "long-echo",
    "Long Echo",
    ["covenant", "horology"],
    "Your Echo adds 2 rounds instead of 1.",
    "echo-adds-2",
  ),
  rule(
    "gleaner",
    "Gleaner",
    ["quietus"],
    "Each time one of your rules uses remains, your hero regains 2 mana.",
  ),
  rule(
    "cold-hands",
    "Cold Hands",
    ["stormcalling", "onslaught"],
    "The Strike by one of your stacks that ends Frozen is x 300% instead of x 200%.",
  ),
  rule(
    "mob-rule",
    "Mob Rule",
    ["banner", "onslaught"],
    "When Heartened is ended on your stack for an extra turn, that stack gains Fired Up 3, clock 2.",
  ),
  rule(
    "double-or-nothing",
    "Double or Nothing",
    ["lucky-streak"],
    "Lucky on your stacks is x 200% instead of x 150%, and when it ends its bearer gains Jinxed 25, clock 2.",
  ),
  rule(
    "seed-bombs",
    "Seed Bombs",
    ["greencraft", "marksmanship"],
    "The first shot each battle by each of your shooters leaves brambles of size 6, clock 3, on the target's hex.",
  ),
  {
    id: "field-surgeon",
    name: "Field Surgeon",
    tags: ["bulwark", "greencraft"],
    text: "After a battle you win, each of your stacks regains a tenth of the creatures it lost in it, rounded down.",
    effects: [{ kind: "field-surgeon", tenths: 1 }],
  },
  rule(
    "green-thumb",
    "Green Thumb",
    ["greencraft"],
    "Mending on your stacks heals half again as much.",
  ),
  rule(
    "briar-patch",
    "Briar Patch",
    ["greencraft", "bulwark"],
    "When Thorned on your stack deals Harm, the striker also gains Venomed 2, clock 2.",
  ),
  rule(
    "burr",
    "Burr",
    ["greencraft", "riposte"],
    "Thorned on your stacks also answers shots.",
  ),
  rule(
    "harvest",
    "Harvest",
    ["greencraft", "onslaught"],
    "Ripening on your stacks grows by 20 a round instead of 10.",
  ),
  rule(
    "windfall",
    "Windfall",
    ["greencraft", "covenant"],
    "When Ripening ends or expires on your stack, each friendly stack adjacent to it gains Ripening of half that size, clock 2.",
  ),
  rule(
    "shield-wall",
    "Shield Wall",
    ["covenant", "bulwark", "riposte"],
    "Your Shielded stacks may retaliate any number of times per round.",
  ),
  rule(
    "mirror-ward",
    "Mirror Ward",
    ["covenant", "bulwark"],
    "Your Warded stacks take no Harm from ground.",
  ),
  rule(
    "peace-dividend",
    "Peace Dividend",
    ["covenant"],
    "Strikes by your stacks against a Mollified stack are not retaliated.",
  ),
  rule(
    "quickstep",
    "Quickstep",
    ["horology", "onslaught"],
    "Your Quickened stacks also gain Attack equal to twice Quickened's size.",
  ),
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
  rule(
    "co-signer",
    "Co-signer",
    ["covenant", "quietus"],
    "When a Reckoning expires on your stack, half of it, rounded down, is taken by the nearest enemy stack instead.",
  ),
  rule(
    "compound-interest",
    "Compound Interest",
    ["quietus"],
    "A Reckoning on an enemy stack grows by 10 at that stack's turn start, up to its maximum.",
  ),
  rule(
    "gag-rule",
    "Gag Rule",
    ["quietus", "marksmanship"],
    "Hushed enemy stacks also cannot retaliate.",
  ),
  rule(
    "bloodletting",
    "Bloodletting",
    ["quietus", "greencraft"],
    "A Leeched link whose far end is your stack heals it twice the Harm.",
  ),
  rule(
    "thicker-than-water",
    "Thicker than Water",
    ["quietus", "onslaught"],
    "When Leeched heals your stack, that stack gains Fired Up 2, clock 2.",
  ),
  rule(
    "soaked-powder",
    "Soaked Powder",
    ["stormcalling", "marksmanship"],
    "Drenched enemy stacks cannot shoot.",
  ),
  rule(
    "chain-lightning",
    "Chain Lightning",
    ["stormcalling"],
    "When your page deals Harm to a Drenched stack, each other enemy stack adjacent to it takes Harm 15.",
  ),
  rule(
    "firewalkers",
    "Firewalkers",
    ["stormcalling", "bulwark"],
    "Your Fired Up stacks take no Harm from Burning or from fire.",
  ),
  rule(
    "blaze-of-glory",
    "Blaze of Glory",
    ["stormcalling", "onslaught"],
    "When Fired Up expires on your stack, each enemy stack adjacent to it gains Burning of twice that size, clock 2.",
  ),
  // Vows (12).
  vow(
    "vow-of-the-grave",
    "Vow of the Grave",
    ["quietus"],
    { kind: "never-cast", school: "bloom" },
    "You can never cast Bloom.",
    "Your Hush pages are not spent when cast on your own stacks or on remains.",
    [{ kind: "switch", id: "hush-unspent-own" }],
  ),
  vow(
    "vow-of-the-still-air",
    "Vow of the Still Air",
    ["covenant"],
    { kind: "never-cast", school: "storm" },
    "You can never cast Storm.",
    "Links your side makes are clockless.",
    [{ kind: "switch", id: "links-clockless" }],
  ),
  vow(
    "vow-of-the-pyre",
    "Vow of the Pyre",
    ["stormcalling"],
    { kind: "never-cast", school: "accord" },
    "You can never cast Accord.",
    "Your Storm pages deal no Harm to stacks fighting for your side.",
    [{ kind: "switch", id: "storm-spares-own" }],
  ),
  vow(
    "vow-of-the-opening",
    "Vow of the Opening",
    ["horology", "ambush"],
    { kind: "no-cast-rounds", rounds: "after-3" },
    "You cannot cast after round 3.",
    "You may cast twice in round 1.",
    [{ kind: "switch", id: "second-cast-round-1" }],
  ),
  vow(
    "vow-of-the-patient",
    "Vow of the Patient",
    ["deep-wells", "bulwark"],
    { kind: "no-cast-rounds", rounds: "1-2" },
    "You cannot cast in rounds 1 and 2.",
    "Your pages have +3 Power.",
    [{ kind: "page-power", amount: 3 }],
  ),
  vow(
    "vow-of-silence",
    "Vow of Silence",
    ["deep-wells", "wayfinder"],
    { kind: "no-cast-rounds", rounds: "even" },
    "You cannot cast in even-numbered rounds.",
    "Your pages cost half their mana, rounded up.",
    [{ kind: "mana-cost-percent", percent: -50 }],
  ),
  vow(
    "vow-of-the-borrowed-book",
    "Vow of the Borrowed Book",
    ["packrat"],
    { kind: "max-school-rank", rank: 1 },
    "You hold no school skill above rank 1.",
    "Your scrolls are not used up; each costs its page's mana and is spent once per battle like a page.",
    [{ kind: "switch", id: "scrolls-kept" }],
  ),
  vow(
    "vow-of-the-unlettered",
    "Vow of the Unlettered",
    ["onslaught", "bulwark", "banner"],
    { kind: "max-school-rank", rank: 0 },
    "You hold no school skill at all.",
    "Your stacks have +1 Speed and their Strikes are x 110%.",
    [
      { kind: "stack-stats", speed: 1 },
      {
        kind: "strike-percent",
        strike: "all",
        direction: "dealt",
        percent: 10,
      },
    ],
  ),
  vow(
    "vow-of-empty-pockets",
    "Vow of Empty Pockets",
    ["stormcalling", "quietus"],
    { kind: "empty-slot", slot: "pocket" },
    "Both Pocket slots must stay empty.",
    "You may Fuel twice per battle.",
    [{ kind: "switch", id: "fuel-uses-plus-1" }],
  ),
  vow(
    "vow-of-the-barefoot-pilgrim",
    "Vow of the Barefoot Pilgrim",
    ["wayfaring", "trailcraft"],
    { kind: "empty-slot", slot: "feet" },
    "The Feet slot must stay empty.",
    "All passable terrain costs this hero 100 per straight step, and it has +200 movement points.",
    [
      { kind: "terrain-cost", reduce: 1000 },
      { kind: "movement-flat", amount: 200 },
    ],
  ),
  vow(
    "vow-of-bare-hands",
    "Vow of Bare Hands",
    ["bulwark", "covenant"],
    { kind: "empty-slot", slot: "ring" },
    "Both Ring slots must stay empty.",
    "A gated condition treats your stacks as having twice their HP.",
    [{ kind: "switch", id: "gates-double-hp" }],
  ),
  vow(
    "vow-of-flesh-and-blood",
    "Vow of Flesh and Blood",
    ["banner", "lucky-streak"],
    { kind: "barred-tag", tag: "wreck" },
    "Your army may contain no creature tagged wreck.",
    "Heartened on your stacks survives its first use each battle.",
    [{ kind: "switch", id: "heartened-survives-once" }],
  ),
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
