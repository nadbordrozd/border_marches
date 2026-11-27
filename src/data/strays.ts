/**
 * Strays and caretakers (docs/design/CONTENT_CREATURES.md, bead bzc.13):
 * the neutral roster of v0.2. They guard the map (replacing the MVP
 * neutrals as guards), live in stray huts and caretaker lodges. The two summons
 * of CONTENT_CREATURES section 4 (Seedling, Shade) are not in this roster or
 * in CREATURES: only magic makes them, so they live in SUMMONED_CREATURES
 * (src/core/magic/kinds.ts); their art is in src/assets/unit-art.ts.
 *
 * Stats are CONTENT_CREATURES section 1; abilities (section 2) are battle
 * rules registered in src/core/battle/stray-abilities.ts under the ids in
 * {@link STRAY_ABILITY_IDS}; where they live is section 3. Three of them
 * also swim and guard seas (NAVAL.md 4.4, src/data/sea.ts); the sea
 * guardians are not in this roster, so the land fill never places them.
 */
import type { Terrain } from "../core/map/types.ts";
import { SWIMMING_STRAYS } from "./sea.ts";
import type {
  CreatureDef,
  StrayAbilityId,
  StrayCreatureId,
  StrayDeathTag,
} from "./types.ts";

export type CaretakerSchool = "bloom" | "accord" | "clock" | "hush" | "storm";

/** Where a stray lives and how it is hired (CONTENT_CREATURES section 3). */
export interface StrayHome {
  terrain: readonly Terrain[];
  /** Guard rings (GAME_DESIGN 8.3) it is used in, inclusive. */
  rings: readonly [number, number];
  dwelling: "hut" | "lodge" | "wild";
  /** Weekly stock of its hut or lodge (0 for wild ones). */
  weekly: number;
  /** Hire cost in gold (FV x 1.5, rounded to 5). */
  hire: number;
  /** A caretaker's school. */
  school?: CaretakerSchool;
}

type Row = [
  id: StrayCreatureId,
  name: string,
  plural: string,
  tier: number,
  hp: number,
  attack: number,
  defense: number,
  damage: number,
  speed: number,
  shots: number,
  fv: number,
  remains: StrayDeathTag,
  cannotBear: readonly string[],
  ability: StrayAbilityId,
  sprite: string,
];

const ROWS: readonly Row[] = [
  // prettier-ignore
  ["bellhop", "Bellhop", "Bellhops", 1, 7, 3, 4, 1, 6, 0, 36, "wreck", ["heartened", "shaken"], "carry", "stray-bellhop"],
  // prettier-ignore
  ["whipping-boy", "Whipping Boy", "Whipping Boys", 1, 14, 2, 3, 1, 5, 0, 47, "corpse", [], "takes-the-blame", "stray-whipping-boy"],
  // prettier-ignore
  ["gremlin", "Gremlin", "Gremlins", 1, 6, 5, 2, 2, 7, 0, 47, "corpse", [], "sabotage", "cult-imp"],
  // prettier-ignore
  ["lamplighter", "Lamplighter", "Lamplighters", 1, 9, 4, 3, 2, 4, 0, 57, "corpse", [], "light-up", "stray-lamplighter"],
  // prettier-ignore
  ["newsie", "Newsie", "Newsies", 1, 6, 4, 2, 2, 5, 6, 56, "corpse", [], "extra", "stray-newsie"],
  // prettier-ignore
  ["notary", "Notary", "Notaries", 2, 16, 5, 6, 3, 5, 0, 107, "nothing", ["heartened", "shaken"], "stamp", "stray-notary"],
  // prettier-ignore
  ["crooner", "Crooner", "Crooners", 2, 12, 6, 3, 3, 5, 8, 109, "corpse", [], "croon", "stray-crooner"],
  // prettier-ignore
  ["bog-leech", "Bog Leech", "Bog Leeches", 2, 15, 7, 4, 3, 6, 0, 104, "nothing", [], "latch", "cult-tentacle"],
  // prettier-ignore
  ["loan-shark", "Loan Shark", "Loan Sharks", 2, 14, 6, 5, 4, 5, 0, 116, "corpse", [], "advance", "stray-loan-shark"],
  // prettier-ignore
  ["winder", "Winder", "Winders", 3, 26, 8, 8, 5, 5, 0, 205, "wreck", ["heartened", "shaken"], "wind-up", "dwarf-clockwork-gunner"],
  // prettier-ignore
  ["groundskeeper", "Groundskeeper", "Groundskeepers", 3, 32, 7, 9, 5, 4, 0, 228, "nothing", [], "tend", "stray-groundskeeper"],
  // prettier-ignore
  ["rigger", "Rigger", "Riggers", 3, 22, 9, 5, 5, 6, 6, 223, "corpse", [], "tow", "dwarf-engineer"],
  // prettier-ignore
  ["gumshoe", "Gumshoe", "Gumshoes", 3, 24, 9, 6, 6, 5, 8, 263, "corpse", [], "dead-to-rights", "stray-gumshoe"],
  // prettier-ignore
  ["deep-sea-diver", "Deep-Sea Diver", "Deep-Sea Divers", 3, 34, 8, 10, 6, 3, 0, 271, "wreck", [], "pressure-suit", "stray-deep-sea-diver"],
  // prettier-ignore
  ["sexton", "Sexton", "Sextons", 4, 45, 10, 10, 9, 5, 0, 402, "nothing", [], "night-shift", "stray-sexton"],
  // prettier-ignore
  ["lagoon-lurker", "Lagoon Lurker", "Lagoon Lurkers", 4, 55, 12, 8, 10, 5, 0, 469, "corpse", [], "drag-under", "cult-frog-unit"],
  // prettier-ignore
  ["fire-eater", "Fire-Eater", "Fire-Eaters", 4, 44, 11, 8, 9, 5, 0, 388, "corpse", ["burning"], "breath", "stray-fire-eater"],
  // prettier-ignore
  ["rime-walrus", "Rime Walrus", "Rime Walruses", 5, 95, 13, 13, 15, 4, 0, 868, "corpse", ["frozen"], "cold-front", "ice-folk-walrus"],
  // prettier-ignore
  ["tin-titan", "Tin Titan", "Tin Titans", 5, 100, 14, 14, 14, 4, 0, 898, "wreck", ["heartened", "shaken"], "stand-behind-me", "dwarf-brass-titan"],
  // prettier-ignore
  ["prize-pumpkin", "Prize Pumpkin", "Prize Pumpkins", 5, 85, 12, 12, 14, 4, 0, 759, "nothing", [], "late-bloomer", "stray-prize-pumpkin"],
  // prettier-ignore
  ["beanstalk-giant", "Beanstalk Giant", "Beanstalk Giants", 6, 160, 17, 14, 28, 5, 0, 1707, "corpse", [], "giant-stomp", "stray-beanstalk-giant"],
];

export const STRAY_CREATURES: Readonly<Record<StrayCreatureId, CreatureDef>> =
  Object.fromEntries(
    ROWS.map(
      ([
        id,
        name,
        plural,
        tier,
        hp,
        attack,
        defense,
        damage,
        speed,
        shots,
        fv,
        remains,
        cannotBear,
        ability,
        sprite,
      ]) => [
        id,
        {
          id,
          name,
          plural,
          faction: "neutral",
          tier,
          hp,
          attack,
          defense,
          damage,
          speed,
          shots,
          ability: null,
          // The Bog Leech, Deep-Sea Diver and Lagoon Lurker swim (NAVAL.md
          // 3.1); their sea homes are SEA_HOMES (src/data/sea.ts).
          abilities: SWIMMING_STRAYS.includes(id)
            ? [ability, "swimmer"]
            : [ability],
          ...(id === "sexton"
            ? {
                caster: {
                  pages: ["second-shift"],
                  castPower: 1,
                  castDivisor: 3,
                  castCap: 8,
                },
              }
            : {}),
          growth: 0,
          cost: {},
          fightValue: fv,
          sprite,
          tags: { remains, cannotBear },
        } as CreatureDef,
      ],
    ),
  ) as unknown as Record<StrayCreatureId, CreatureDef>;

type HomeRow = [
  StrayCreatureId,
  readonly Terrain[],
  readonly [number, number],
  StrayHome["dwelling"],
  number,
  number,
  CaretakerSchool?,
];

const HOMES: readonly HomeRow[] = [
  ["bellhop", ["grass", "steppe"], [0, 1], "hut", 8, 55],
  ["whipping-boy", ["grass", "badlands"], [0, 1], "hut", 8, 70],
  ["gremlin", ["badlands", "wasteland", "volcanic"], [0, 1], "hut", 8, 70],
  [
    "lamplighter",
    ["steppe", "wasteland", "volcanic", "snow", "sand"],
    [0, 1],
    "wild",
    0,
    0,
  ],
  ["newsie", ["grass", "steppe"], [0, 1], "hut", 8, 85],
  ["notary", ["grass", "steppe"], [0, 2], "lodge", 5, 160, "accord"],
  ["crooner", ["grass", "jungle"], [0, 2], "hut", 5, 165],
  ["bog-leech", ["jungle", "wasteland", "swamp"], [0, 2], "wild", 0, 0],
  ["loan-shark", ["steppe", "badlands", "sand"], [0, 2], "hut", 5, 175],
  ["winder", ["steppe", "badlands"], [1, 2], "lodge", 3, 310, "clock"],
  ["groundskeeper", ["jungle", "grass"], [1, 2], "lodge", 3, 340, "bloom"],
  ["rigger", ["badlands", "steppe", "sand"], [1, 2], "lodge", 3, 335, "storm"],
  ["gumshoe", ["grass", "badlands"], [1, 2], "hut", 3, 395],
  [
    "deep-sea-diver",
    ["jungle", "wasteland", "snow", "swamp"],
    [1, 2],
    "wild",
    0,
    0,
  ],
  [
    "sexton",
    ["wasteland", "badlands", "volcanic", "sand"],
    [1, 3],
    "lodge",
    2,
    605,
    "hush",
  ],
  ["lagoon-lurker", ["jungle", "wasteland", "swamp"], [1, 3], "wild", 0, 0],
  [
    "fire-eater",
    ["steppe", "badlands", "volcanic", "sand"],
    [1, 3],
    "hut",
    2,
    580,
  ],
  ["rime-walrus", ["steppe", "wasteland", "snow"], [2, 3], "wild", 0, 0],
  [
    "tin-titan",
    ["badlands", "steppe", "volcanic", "sand"],
    [2, 3],
    "wild",
    0,
    0,
  ],
  ["prize-pumpkin", ["grass", "jungle"], [2, 3], "wild", 0, 0],
  ["beanstalk-giant", ["grass", "jungle"], [3, 3], "wild", 0, 0],
];

export const STRAY_HOMES: Readonly<Record<StrayCreatureId, StrayHome>> =
  Object.fromEntries(
    HOMES.map(([id, terrain, rings, dwelling, weekly, hire, school]) => [
      id,
      {
        terrain,
        rings,
        dwelling,
        weekly,
        hire,
        ...(school !== undefined ? { school } : {}),
      },
    ]),
  ) as Record<StrayCreatureId, StrayHome>;

/** Every stray and caretaker in roster order (no summons: see the header). */
export const STRAY_CREATURE_IDS: readonly StrayCreatureId[] = ROWS.map(
  (r) => r[0],
);

/** Strays and caretakers that guard the map (all of them), by FV. */
export const GUARD_CREATURE_IDS: readonly StrayCreatureId[] =
  STRAY_CREATURE_IDS;

/** The caretaker of each school (the banks' guards). */
export const CARETAKER_OF: Readonly<Record<CaretakerSchool, StrayCreatureId>> =
  {
    bloom: "groundskeeper",
    accord: "notary",
    clock: "winder",
    hush: "sexton",
    storm: "rigger",
  };

/** Hireable at a stray hut: strays whose dwelling is a hut. */
export const HUT_STRAYS: readonly StrayCreatureId[] = GUARD_CREATURE_IDS.filter(
  (id) => STRAY_HOMES[id].dwelling === "hut",
);

/** Hireable at a caretaker lodge. */
export const LODGE_CARETAKERS: readonly StrayCreatureId[] =
  GUARD_CREATURE_IDS.filter((id) => STRAY_HOMES[id].dwelling === "lodge");

/** Ability names and rules for tooltips (CONTENT_CREATURES section 2). */
export const STRAY_ABILITY_TEXT: Readonly<
  Record<StrayAbilityId, { name: string; text: string }>
> = {
  carry: {
    name: "Carry",
    text: "Once per battle, instead of attacking: move one condition from a stack next to the Bellhops onto another stack next to them.",
  },
  "takes-the-blame": {
    name: "Takes the Blame",
    text: "Once per battle, instead of attacking: a friendly stack next to the Whipping Boys gets a Scapegoat link to them for 3 rounds, so the Whipping Boys take its damage.",
  },
  sabotage: {
    name: "Sabotage",
    text: "A stack the Gremlins attack in melee becomes Hushed for 2 rounds.",
  },
  "light-up": {
    name: "Light Up",
    text: "The Lamplighters' Strikes deal 50% more damage to a stack that is Burning or stands in fire.",
  },
  extra: {
    name: "Extra!",
    text: "Once per battle, instead of attacking: every friendly stack next to the Newsies gains Quickened 2 for 2 rounds.",
  },
  stamp: {
    name: "Stamp",
    text: "Once per battle, instead of attacking: an enemy stack next to the Notaries becomes Turned for 1 round. Gate 15 HP per Notary, doubled against a Mollified stack.",
  },
  croon: {
    name: "Croon",
    text: "A stack the Crooners shoot gains Mollified 30 for 2 rounds.",
  },
  latch: {
    name: "Latch",
    text: "A stack the Bog Leeches attack in melee becomes Leeched by them for 2 rounds: at each of its turns it takes 1 Harm per Bog Leech (at most 40) and they heal that much.",
  },
  advance: {
    name: "Advance",
    text: "Once per battle, instead of attacking: a stack next to the Loan Sharks gains Fired Up 4 and Reckoning (5 per Loan Shark, at most 150), both for 3 rounds.",
  },
  "wind-up": {
    name: "Wind Up",
    text: "Once per battle, instead of attacking: a stack within 3 hexes of the Winders becomes Delayed for 2 rounds. Quickened Winders reach 6 hexes.",
  },
  tend: {
    name: "Tend",
    text: "Once per battle, instead of attacking: a stack next to the Groundskeepers gains Mending (2 per Groundskeeper, at most 60) and Thorned (1 per Groundskeeper, at most 30), both for 3 rounds.",
  },
  tow: {
    name: "Tow",
    text: "Once per battle, instead of attacking: pull a stack within 6 hexes of the Riggers 3 hexes toward them, or 5 hexes if that stack is Slowed.",
  },
  "dead-to-rights": {
    name: "Dead to Rights",
    text: "The Gumshoes' shots ignore Shielded and deal 50% more damage to a Hushed stack.",
  },
  "pressure-suit": {
    name: "Pressure Suit",
    text: "In each battle, the Deep-Sea Divers gain Warded 50 at their first turn, for the whole battle.",
  },
  "night-shift": {
    name: "Night Shift",
    text: "Creature caster: the Sextons cast Second Shift, which raises Shades from remains.",
  },
  "drag-under": {
    name: "Drag Under",
    text: "A stack the Lagoon Lurkers attack in melee gains Drenched 50 for 2 rounds.",
  },
  breath: {
    name: "Breath",
    text: "Every turn, instead of attacking: the three hexes in a straight line from the Fire-Eaters catch fire for 2 rounds, of size 1 per Fire-Eater (at most 30).",
  },
  "cold-front": {
    name: "Cold Front",
    text: "Once per battle, instead of attacking: every enemy stack next to the Rime Walruses becomes Frozen for 1 round. Gate 15 HP per Walrus, doubled against a Drenched stack.",
  },
  "stand-behind-me": {
    name: "Stand Behind Me",
    text: "At the start of the Tin Titans' turn, every friendly stack next to them gains Shielded 3 for 2 rounds.",
  },
  "late-bloomer": {
    name: "Late Bloomer",
    text: "In each battle, the Prize Pumpkins gain Ripening 10 at their first turn, for the whole battle.",
  },
  "giant-stomp": {
    name: "Stomp",
    text: "After the Beanstalk Giants attack in melee, every other stack next to the target takes Harm equal to a quarter of the damage dealt.",
  },
  "gone-to-seed": {
    name: "Gone to Seed",
    text: "When it dies, brambles of size 4 cover its hex for 3 rounds.",
  },
  fade: {
    name: "Fade",
    text: "When it dies, mist covers its hex for 2 rounds.",
  },
};

export const STRAY_ABILITY_IDS = Object.keys(
  STRAY_ABILITY_TEXT,
) as StrayAbilityId[];
