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
    "The first bane you place each battle also lands on a stack of your choice next to its target.",
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
    "Your Echo makes a condition last 2 rounds longer instead of 1.",
    "echo-adds-2",
  ),
  rule(
    "gleaner",
    "Gleaner",
    ["quietus"],
    "Each time something of yours uses up remains, your hero gets 2 mana back.",
  ),
  rule(
    "cold-hands",
    "Cold Hands",
    ["stormcalling", "onslaught"],
    "When your stack's Strike ends Frozen, it deals triple damage instead of double.",
  ),
  rule(
    "mob-rule",
    "Mob Rule",
    ["banner", "onslaught"],
    "When your stack ends Heartened to take an extra turn, it also gains Fired Up 3 for 2 rounds.",
  ),
  rule(
    "double-or-nothing",
    "Double or Nothing",
    ["lucky-streak"],
    "Lucky on your stacks doubles the damage instead of +50%, but when Lucky ends the stack gains Jinxed 25 for 2 rounds.",
  ),
  rule(
    "seed-bombs",
    "Seed Bombs",
    ["greencraft", "marksmanship"],
    "The first shot each battle by each of your shooters leaves brambles 6 on the target's hex for 3 rounds.",
  ),
  {
    id: "field-surgeon",
    name: "Field Surgeon",
    tags: ["bulwark", "greencraft"],
    text: "After a battle you win, each of your stacks gets back a tenth of the creatures it lost (rounded down).",
    effects: [{ kind: "field-surgeon", tenths: 1 }],
  },
  rule(
    "green-thumb",
    "Green Thumb",
    ["greencraft"],
    "Mending on your stacks heals 50% more.",
  ),
  rule(
    "briar-patch",
    "Briar Patch",
    ["greencraft", "bulwark"],
    "When Thorned on your stack deals Harm, the attacker also gains Venomed 2 for 2 rounds.",
  ),
  rule(
    "burr",
    "Burr",
    ["greencraft", "riposte"],
    "Thorned on your stacks also hurts shooters that hit them, not only melee attackers.",
  ),
  rule(
    "harvest",
    "Harvest",
    ["greencraft", "onslaught"],
    "Ripening on your stacks grows by 20 each turn instead of 10.",
  ),
  rule(
    "windfall",
    "Windfall",
    ["greencraft", "covenant"],
    "When Ripening ends on your stack for any reason, every friendly stack next to it gains Ripening of half its size for 2 rounds.",
  ),
  rule(
    "shield-wall",
    "Shield Wall",
    ["covenant", "bulwark", "riposte"],
    "Your Shielded stacks can retaliate any number of times each round.",
  ),
  rule(
    "mirror-ward",
    "Mirror Ward",
    ["covenant", "bulwark"],
    "Your Warded stacks take no Harm from ground such as fire and brambles.",
  ),
  rule(
    "peace-dividend",
    "Peace Dividend",
    ["covenant"],
    "A Mollified stack cannot retaliate against your stacks' Strikes.",
  ),
  rule(
    "quickstep",
    "Quickstep",
    ["horology", "onslaught"],
    "Your Quickened stacks also gain Attack: twice their Quickened size.",
  ),
  {
    id: "pile-on",
    name: "Pile On",
    tags: ["horology", "onslaught"],
    text: "Your stacks' Strikes deal 25% more damage to Delayed, Slowed or Shaken stacks.",
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
    "When a Reckoning falls due on your stack, the nearest enemy stack takes half of its Harm (rounded down) instead.",
  ),
  rule(
    "compound-interest",
    "Compound Interest",
    ["quietus"],
    "A Reckoning on an enemy stack grows by 10 at the start of each of that stack's turns, up to its maximum.",
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
    "When Leeched drains an enemy into your stack, your stack heals twice the Harm.",
  ),
  rule(
    "thicker-than-water",
    "Thicker than Water",
    ["quietus", "onslaught"],
    "When Leeched heals your stack, it also gains Fired Up 2 for 2 rounds.",
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
    "When your page deals Harm to a Drenched stack, every other enemy stack next to it takes 15 Harm.",
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
    "When Fired Up runs out on your stack, every enemy stack next to it gains Burning of twice its size for 2 rounds.",
  ),
  // Vows (12).
  vow(
    "vow-of-the-grave",
    "Vow of the Grave",
    ["quietus"],
    { kind: "never-cast", school: "bloom" },
    "You can never cast Bloom.",
    "Your Hush pages are not spent when you cast them on your own stacks or on remains.",
    [{ kind: "switch", id: "hush-unspent-own" }],
  ),
  vow(
    "vow-of-the-still-air",
    "Vow of the Still Air",
    ["covenant"],
    { kind: "never-cast", school: "storm" },
    "You can never cast Storm.",
    "Links your side makes last the whole battle.",
    [{ kind: "switch", id: "links-clockless" }],
  ),
  vow(
    "vow-of-the-pyre",
    "Vow of the Pyre",
    ["stormcalling"],
    { kind: "never-cast", school: "accord" },
    "You can never cast Accord.",
    "Your Storm pages deal no Harm to stacks on your side.",
    [{ kind: "switch", id: "storm-spares-own" }],
  ),
  vow(
    "vow-of-the-opening",
    "Vow of the Opening",
    ["horology", "ambush"],
    { kind: "no-cast-rounds", rounds: "after-3" },
    "You cannot cast spells after round 3.",
    "You may cast two spells in round 1.",
    [{ kind: "switch", id: "second-cast-round-1" }],
  ),
  vow(
    "vow-of-the-patient",
    "Vow of the Patient",
    ["deep-wells", "bulwark"],
    { kind: "no-cast-rounds", rounds: "1-2" },
    "You cannot cast spells in rounds 1 and 2.",
    "Your pages are cast at +3 Power.",
    [{ kind: "page-power", amount: 3 }],
  ),
  vow(
    "vow-of-silence",
    "Vow of Silence",
    ["deep-wells", "wayfinder"],
    { kind: "no-cast-rounds", rounds: "even" },
    "You cannot cast spells in rounds 2, 4, 6 and so on.",
    "Your pages cost half their mana, rounded up.",
    [{ kind: "mana-cost-percent", percent: -50 }],
  ),
  vow(
    "vow-of-the-borrowed-book",
    "Vow of the Borrowed Book",
    ["packrat"],
    { kind: "max-school-rank", rank: 1 },
    "None of your school skills can go above rank 1.",
    "Your scrolls are never used up. Casting one costs its mana, like a page, and it is spent until the battle ends.",
    [{ kind: "switch", id: "scrolls-kept" }],
  ),
  vow(
    "vow-of-the-unlettered",
    "Vow of the Unlettered",
    ["onslaught", "bulwark", "banner"],
    { kind: "max-school-rank", rank: 0 },
    "You can never have a school skill.",
    "Your stacks get +1 Speed, and their Strikes deal 10% more damage.",
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
    "You cannot wear anything in your two Pocket slots.",
    "You may Fuel twice a battle.",
    [{ kind: "switch", id: "fuel-uses-plus-1" }],
  ),
  vow(
    "vow-of-the-barefoot-pilgrim",
    "Vow of the Barefoot Pilgrim",
    ["wayfaring", "trailcraft"],
    { kind: "empty-slot", slot: "feet" },
    "You cannot wear anything in your Feet slot.",
    "Every land terrain costs the hero 100 movement points a step, like grass, and it has 200 more movement points each day.",
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
    "You cannot wear anything in your two Ring slots.",
    "Conditions with a gate count your stacks' HP twice, so your stacks refuse them more easily.",
    [{ kind: "switch", id: "gates-double-hp" }],
  ),
  vow(
    "vow-of-flesh-and-blood",
    "Vow of Flesh and Blood",
    ["banner", "lucky-streak"],
    { kind: "barred-tag", tag: "wreck" },
    "Your army can have no creatures that leave a wreck when they die (machines).",
    "The first time each battle one of your stacks uses Heartened, it keeps it.",
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
