/**
 * Secondary skills (CONTENT_HEROES.md section 1, RULES_V2 3.4): three
 * ranks, six held at most.
 *
 * {@link SKILL_IDS} names all 24 catalogue skills so class weights can list
 * them; {@link SKILLS} holds the rows implemented so far. Offers only draw
 * skills that have a row. To add one (bead bzc.12): add a row with its
 * three ranks' text and effects (src/data/effects.ts kinds). Each rank
 * lists its whole effect, not the difference from the rank before.
 */
import type { HeroEffect, RuleSwitchId, School } from "./effects.ts";

export type SkillId =
  // School
  | "greencraft"
  | "covenant"
  | "horology"
  | "quietus"
  | "stormcalling"
  // Army
  | "onslaught"
  | "marksmanship"
  | "bulwark"
  | "riposte"
  | "long-shadow"
  | "vanguard"
  | "banner"
  | "lucky-streak"
  | "drill-sergeant"
  | "ambush"
  // Journey
  | "wayfaring"
  | "trailcraft"
  | "lookout"
  | "deep-wells"
  | "quick-study"
  | "stewardship"
  | "silver-tongue"
  | "packrat"
  | "wayfinder";

export const SKILL_IDS: readonly SkillId[] = [
  "greencraft",
  "covenant",
  "horology",
  "quietus",
  "stormcalling",
  "onslaught",
  "marksmanship",
  "bulwark",
  "riposte",
  "long-shadow",
  "vanguard",
  "banner",
  "lucky-streak",
  "drill-sergeant",
  "ambush",
  "wayfaring",
  "trailcraft",
  "lookout",
  "deep-wells",
  "quick-study",
  "stewardship",
  "silver-tongue",
  "packrat",
  "wayfinder",
];

export type SkillFamily = "school" | "army" | "journey";

export interface SkillRank {
  /** One sentence, as in CONTENT_HEROES. */
  text: string;
  effects: HeroEffect[];
}

export interface SkillDef {
  id: SkillId;
  name: string;
  family: SkillFamily;
  /** School skills only. */
  school?: School;
  /** Ranks 1, 2 and 3. */
  ranks: readonly [SkillRank, SkillRank, SkillRank];
}

export const MAX_SKILLS = 6;
export const MAX_SKILL_RANK = 3;

function schoolSkill(id: SkillId, name: string, school: School): SkillDef {
  const label = school[0]?.toUpperCase() + school.slice(1);
  const rank = (r: number, tiers: string, power: number): SkillRank => ({
    text: `Learn ${label} tiers ${tiers}; +${power} Power for ${label} pages.`,
    effects: [{ kind: "school-rank", school, rank: r }],
  });
  return {
    id,
    name,
    family: "school",
    school,
    ranks: [rank(1, "1-2", 0), rank(2, "1-4", 2), rank(3, "1-5", 4)],
  };
}

/** Three ranks of one percentage or flat effect. */
function steps(
  texts: readonly [string, string, string],
  make: (rank: number) => HeroEffect[],
): readonly [SkillRank, SkillRank, SkillRank] {
  return [
    { text: texts[0], effects: make(1) },
    { text: texts[1], effects: make(2) },
    { text: texts[2], effects: make(3) },
  ];
}

const RIPOSTE = ["riposte-1", "riposte-2", "riposte-3"] as const;
const LONG_SHADOW = [
  "long-shadow-1",
  "long-shadow-2",
  "long-shadow-3",
] as const;
const VANGUARD = ["vanguard-1", "vanguard-2", "vanguard-3"] as const;

const ROWS: SkillDef[] = [
  schoolSkill("greencraft", "Greencraft", "bloom"),
  schoolSkill("covenant", "Covenant", "accord"),
  schoolSkill("horology", "Horology", "clock"),
  schoolSkill("quietus", "Quietus", "hush"),
  schoolSkill("stormcalling", "Stormcalling", "storm"),
  {
    id: "onslaught",
    name: "Onslaught",
    family: "army",
    ranks: steps(
      [
        "Melee Strikes by your stacks are x 110%.",
        "Melee Strikes by your stacks are x 120%.",
        "Melee Strikes by your stacks are x 130%.",
      ],
      (r) => [
        {
          kind: "strike-percent",
          strike: "melee",
          direction: "dealt",
          percent: 10 * r,
        },
      ],
    ),
  },
  {
    id: "marksmanship",
    name: "Marksmanship",
    family: "army",
    ranks: steps(
      [
        "Shots by your stacks are x 110%.",
        "Shots by your stacks are x 120%.",
        "Shots by your stacks are x 130%.",
      ],
      (r) => [
        {
          kind: "strike-percent",
          strike: "shot",
          direction: "dealt",
          percent: 10 * r,
        },
      ],
    ),
  },
  {
    id: "bulwark",
    name: "Bulwark",
    family: "army",
    ranks: steps(
      [
        "Strikes against your stacks are x 90%.",
        "Strikes against your stacks are x 80%.",
        "Strikes against your stacks are x 70%.",
      ],
      (r) => [
        {
          kind: "strike-percent",
          strike: "all",
          direction: "taken",
          percent: -10 * r,
        },
      ],
    ),
  },
  {
    // The extra retaliation is a battle rule (core/battle/rules.ts).
    id: "riposte",
    name: "Riposte",
    family: "army",
    ranks: steps(
      [
        "Your strongest stack may retaliate twice per round.",
        "Your two strongest stacks may retaliate twice per round.",
        "Your three strongest stacks may retaliate twice per round.",
      ],
      (r) => [{ kind: "switch", id: RIPOSTE[r - 1] as RuleSwitchId }],
    ),
  },
  {
    // Reach of "adjacent" abilities (core/battle/abilities.ts withinReach).
    id: "long-shadow",
    name: "Long Shadow",
    family: "army",
    ranks: steps(
      [
        'Abilities of your strongest stack that say "adjacent" reach 2 hexes.',
        'Abilities of your two strongest stacks that say "adjacent" reach 2 hexes.',
        'Abilities of all your stacks that say "adjacent" reach 2 hexes.',
      ],
      (r) => [{ kind: "switch", id: LONG_SHADOW[r - 1] as RuleSwitchId }],
    ),
  },
  {
    // The deployment phase before round 1 (core/battle/deploy.ts).
    id: "vanguard",
    name: "Vanguard",
    family: "army",
    ranks: steps(
      [
        "Before round 1 you may rearrange your stacks within your deployment column.",
        "Before round 1 you may rearrange your stacks within your first 2 columns.",
        "Before round 1 you may rearrange your stacks within your first 3 columns.",
      ],
      (r) => [{ kind: "switch", id: VANGUARD[r - 1] as RuleSwitchId }],
    ),
  },
  {
    id: "drill-sergeant",
    name: "Drill Sergeant",
    family: "army",
    ranks: [
      {
        text: "Each stack your Command chooses or moves gains Fired Up 2, clock 2.",
        effects: [{ kind: "switch", id: "drill-sergeant-1" }],
      },
      {
        text: "Also: your Command counts C one higher.",
        effects: [
          { kind: "switch", id: "drill-sergeant-1" },
          { kind: "command-bonus", amount: 1 },
        ],
      },
      {
        text: "Also: each such stack gains Shielded 3, clock 2.",
        effects: [
          { kind: "switch", id: "drill-sergeant-3" },
          { kind: "command-bonus", amount: 1 },
        ],
      },
    ],
  },
  {
    id: "silver-tongue",
    name: "Silver Tongue",
    family: "journey",
    ranks: steps(
      [
        "Hiring at outposts, stray huts and lodges costs 10% less gold, and a neutral stack whose FV is at most 10% of this army's FV has no zone of control against this hero.",
        "Hiring costs 20% less, and neutral stacks of at most 20% of this army's FV have no zone of control against this hero.",
        "Hiring costs 30% less, and neutral stacks of at most 30% of this army's FV have no zone of control against this hero.",
      ],
      (r) => [
        { kind: "hire-discount", percent: 10 * r },
        { kind: "parley", percent: 10 * r },
      ],
    ),
  },
  {
    id: "wayfinder",
    name: "Wayfinder",
    family: "journey",
    ranks: steps(
      [
        "Adventure spells cost 10% less mana and scale as if Power were 1 higher.",
        "Adventure spells cost 20% less mana and scale as if Power were 2 higher.",
        "Adventure spells cost 30% less mana and scale as if Power were 3 higher, and each may be cast twice a day.",
      ],
      (r) => [
        {
          kind: "adventure-magic",
          costPercent: -10 * r,
          power: r,
          perDay: r === 3 ? 2 : 1,
        },
      ],
    ),
  },
  {
    id: "banner",
    name: "Banner",
    family: "army",
    ranks: steps(["+1 Morale.", "+2 Morale.", "+3 Morale."], (r) => [
      { kind: "morale", amount: r },
    ]),
  },
  {
    id: "lucky-streak",
    name: "Lucky Streak",
    family: "army",
    ranks: steps(["+1 Luck.", "+2 Luck.", "+3 Luck."], (r) => [
      { kind: "luck", amount: r },
    ]),
  },
  {
    id: "ambush",
    name: "Ambush",
    family: "army",
    ranks: [
      {
        text: "Your fastest stack starts each battle Hastened, clock 1.",
        effects: [AMBUSH_1()],
      },
      {
        text: "Also: your strongest stack starts Shielded 3, clock 3.",
        effects: [AMBUSH_1(), AMBUSH_2()],
      },
      {
        text: "Also: the fastest enemy stack starts Delayed, clock 1.",
        effects: [AMBUSH_1(), AMBUSH_2(), AMBUSH_3()],
      },
    ],
  },
  {
    id: "wayfaring",
    name: "Wayfaring",
    family: "journey",
    ranks: steps(
      ["+10% movement points.", "+20% movement points.", "+30%."],
      (r) => [{ kind: "movement-percent", percent: 10 * r }],
    ),
  },
  {
    id: "trailcraft",
    name: "Trailcraft",
    family: "journey",
    ranks: [
      {
        text: "Terrain that costs more than 100 per straight step costs 25 less, never below 100.",
        effects: [{ kind: "terrain-cost", reduce: 25 }],
      },
      {
        text: "Terrain that costs more than 100 costs 50 less, never below 100.",
        effects: [{ kind: "terrain-cost", reduce: 50 }],
      },
      {
        text: "All passable terrain costs 100 (roads stay 75).",
        effects: [{ kind: "terrain-cost", reduce: 1000 }],
      },
    ],
  },
  {
    id: "lookout",
    name: "Lookout",
    family: "journey",
    ranks: steps(
      ["+1 sight radius.", "+2 sight radius.", "+3 sight radius."],
      (r) => [{ kind: "sight", amount: r }],
    ),
  },
  {
    id: "deep-wells",
    name: "Deep Wells",
    family: "journey",
    ranks: steps(
      [
        "+10% maximum mana and +1 daily mana return.",
        "+20% maximum mana and +2 daily mana return.",
        "+30% maximum mana and +3 daily mana return.",
      ],
      (r) => [
        { kind: "max-mana-percent", percent: 10 * r },
        { kind: "mana-regen", amount: r },
      ],
    ),
  },
  {
    id: "quick-study",
    name: "Quick Study",
    family: "journey",
    ranks: steps(
      [
        "+10% to every XP gain.",
        "+20% to every XP gain.",
        "+30% to every XP gain.",
      ],
      (r) => [{ kind: "xp-percent", percent: 10 * r }],
    ),
  },
  {
    id: "stewardship",
    name: "Stewardship",
    family: "journey",
    ranks: steps(
      [
        "+125 gold each day while the hero is on the map.",
        "+250 gold each day while the hero is on the map.",
        "+375 gold each day while the hero is on the map.",
      ],
      (r) => [{ kind: "income", resources: { gold: 125 * r } }],
    ),
  },
  {
    id: "packrat",
    name: "Packrat",
    family: "journey",
    ranks: [
      {
        text: "Scroll case 12; your scrolls are cast at +1 Power.",
        effects: [
          { kind: "scroll-case-size", size: 12 },
          { kind: "scroll-power", amount: 1 },
        ],
      },
      {
        text: "Also: backpack 16, and sites buy your artifacts and scrolls at three quarters of value.",
        effects: [
          { kind: "scroll-case-size", size: 12 },
          { kind: "scroll-power", amount: 1 },
          { kind: "backpack-size", size: 16 },
          { kind: "sell-percent", percent: 75 },
        ],
      },
      {
        text: "Also: the first scroll you cast each battle does not use the round's cast.",
        effects: [
          { kind: "scroll-case-size", size: 12 },
          { kind: "scroll-power", amount: 1 },
          { kind: "backpack-size", size: 16 },
          { kind: "sell-percent", percent: 75 },
          { kind: "switch", id: "first-scroll-free" },
        ],
      },
    ],
  },
];

/**
 * Catalogue skills without a row yet, with the reason (the coverage test,
 * tests/data/catalogue-coverage.test.ts, reads this). Offers never draw
 * them.
 */
export const DEFERRED_SKILLS: Readonly<Partial<Record<SkillId, string>>> = {};

function AMBUSH_1(): HeroEffect {
  return {
    kind: "battle-start",
    rule: { side: "own", selector: "fastest", condition: "hastened", clock: 1 },
  };
}
function AMBUSH_2(): HeroEffect {
  return {
    kind: "battle-start",
    rule: {
      side: "own",
      selector: "strongest",
      condition: "shielded",
      size: 3,
      clock: 3,
    },
  };
}
function AMBUSH_3(): HeroEffect {
  return {
    kind: "battle-start",
    rule: {
      side: "enemy",
      selector: "fastest",
      condition: "delayed",
      clock: 1,
    },
  };
}

/** Implemented skills by id (a subset of SKILL_IDS until bead bzc.12). */
export const SKILLS: Readonly<Partial<Record<SkillId, SkillDef>>> =
  Object.fromEntries(ROWS.map((s) => [s.id, s]));

export function findSkill(id: string): SkillDef | undefined {
  return Object.hasOwn(SKILLS, id) ? SKILLS[id as SkillId] : undefined;
}

/** The skill row; throws on an unknown or unimplemented id. */
export function getSkill(id: string): SkillDef {
  const def = findSkill(id);
  if (def === undefined) throw new Error(`unknown skill "${id}"`);
  return def;
}

/** The school skill of a school. */
export function schoolSkillOf(school: School): SkillDef {
  const def = ROWS.find((s) => s.school === school);
  if (def === undefined) throw new Error(`no skill for school ${school}`);
  return def;
}
