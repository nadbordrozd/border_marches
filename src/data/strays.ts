/**
 * Strays and caretakers (docs/design/CONTENT_CREATURES.md, bead bzc.13):
 * the neutral roster of v0.2. They guard the map (replacing the MVP
 * neutrals as guards), live in stray huts and caretaker lodges. The two summons
 * (Seedling, Shade) are magic's (src/core/magic/kinds.ts).
 *
 * Stats are CONTENT_CREATURES section 1; abilities (section 2) are battle
 * rules registered in src/core/battle/stray-abilities.ts under the ids in
 * {@link STRAY_ABILITY_IDS}; where they live is section 3.
 */
import type { Terrain } from "../core/map/types.ts";
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
  dwelling: "hut" | "lodge" | "wild" | "summon";
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
          abilities: [ability],
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
  ["gremlin", ["badlands", "wasteland"], [0, 1], "hut", 8, 70],
  ["lamplighter", ["steppe", "wasteland"], [0, 1], "wild", 0, 0],
  ["newsie", ["grass", "steppe"], [0, 1], "hut", 8, 85],
  ["notary", ["grass", "steppe"], [0, 2], "lodge", 5, 160, "accord"],
  ["crooner", ["grass", "jungle"], [0, 2], "hut", 5, 165],
  ["bog-leech", ["jungle", "wasteland"], [0, 2], "wild", 0, 0],
  ["loan-shark", ["steppe", "badlands"], [0, 2], "hut", 5, 175],
  ["winder", ["steppe", "badlands"], [1, 2], "lodge", 3, 310, "clock"],
  ["groundskeeper", ["jungle", "grass"], [1, 2], "lodge", 3, 340, "bloom"],
  ["rigger", ["badlands", "steppe"], [1, 2], "lodge", 3, 335, "storm"],
  ["gumshoe", ["grass", "badlands"], [1, 2], "hut", 3, 395],
  ["deep-sea-diver", ["jungle", "wasteland"], [1, 2], "wild", 0, 0],
  ["sexton", ["wasteland", "badlands"], [1, 3], "lodge", 2, 605, "hush"],
  ["lagoon-lurker", ["jungle", "wasteland"], [1, 3], "wild", 0, 0],
  ["fire-eater", ["steppe", "badlands"], [1, 3], "hut", 2, 580],
  ["rime-walrus", ["steppe", "wasteland"], [2, 3], "wild", 0, 0],
  ["tin-titan", ["badlands", "steppe"], [2, 3], "wild", 0, 0],
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

/** Every stray and caretaker in roster order (summons last). */
export const STRAY_CREATURE_IDS: readonly StrayCreatureId[] = ROWS.map(
  (r) => r[0],
);

/** Strays and caretakers that guard the map (not the summons), by FV. */
export const GUARD_CREATURE_IDS: readonly StrayCreatureId[] =
  STRAY_CREATURE_IDS.filter((id) => STRAY_HOMES[id].dwelling !== "summon");

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
    text: "Once per battle, instead of attacking, it moves one condition from an adjacent stack to another adjacent stack.",
  },
  "takes-the-blame": {
    name: "Takes the Blame",
    text: "Once per battle, instead of attacking, an adjacent friendly stack gains a Scapegoat link to the Whipping Boys, clock 3.",
  },
  sabotage: {
    name: "Sabotage",
    text: "Its melee Strike adds Hushed, clock 2.",
  },
  "light-up": {
    name: "Light Up",
    text: "Its Strikes are x 150% against a stack that bears Burning or stands in fire.",
  },
  extra: {
    name: "Extra!",
    text: "Once per battle, instead of attacking, every friendly stack adjacent to it gains Quickened 2, clock 2.",
  },
  stamp: {
    name: "Stamp",
    text: "Once per battle, instead of attacking, an adjacent enemy stack gains Turned, clock 1, gate 15 x the Notaries' count in HP.",
  },
  croon: { name: "Croon", text: "Its shot adds Mollified 30, clock 2." },
  latch: {
    name: "Latch",
    text: "Its melee Strike adds a Leeched link from the target to the Bog Leeches, size equal to their count (at most 40), clock 2.",
  },
  advance: {
    name: "Advance",
    text: "Once per battle, instead of attacking, an adjacent stack gains Fired Up 4, clock 3, and a Reckoning of 5 x the Loan Sharks' count (at most 150), clock 3.",
  },
  "wind-up": {
    name: "Wind Up",
    text: "Once per battle, instead of attacking, a stack within 3 hexes gains Delayed, clock 2.",
  },
  tend: {
    name: "Tend",
    text: "Once per battle, instead of attacking, an adjacent stack gains Mending 2 x count (at most 60) and Thorned of size count (at most 30), both clock 3.",
  },
  tow: {
    name: "Tow",
    text: "Once per battle, instead of attacking, it pulls a stack within 6 hexes 3 hexes toward itself, or 5 if that stack is Slowed.",
  },
  "dead-to-rights": {
    name: "Dead to Rights",
    text: "Its shots are x 150% against a Hushed stack.",
  },
  "pressure-suit": {
    name: "Pressure Suit",
    text: "It starts each battle bearing Warded 50, clockless.",
  },
  "night-shift": {
    name: "Night Shift",
    text: "Creature caster: Second Shift (raises Shades from remains).",
  },
  "drag-under": {
    name: "Drag Under",
    text: "Its melee Strike adds Drenched 50, clock 2.",
  },
  breath: {
    name: "Breath",
    text: "Instead of attacking, it places fire of size equal to its count (at most 30), clock 2, on the three hexes in a straight line from it.",
  },
  "cold-front": {
    name: "Cold Front",
    text: "Once per battle, instead of attacking, every adjacent enemy stack gains Frozen, clock 1, gate 15 x the Walruses' count in HP.",
  },
  "stand-behind-me": {
    name: "Stand Behind Me",
    text: "At its turn start every adjacent friendly stack gains Shielded 3, clock 2.",
  },
  "late-bloomer": {
    name: "Late Bloomer",
    text: "It starts each battle bearing Ripening 10, clockless.",
  },
  "giant-stomp": {
    name: "Stomp",
    text: "After its melee Strike, every other stack adjacent to the target takes Harm equal to a quarter of that Strike's damage.",
  },
  "gone-to-seed": {
    name: "Gone to Seed",
    text: "When it dies its hex receives brambles of size 4, clock 3.",
  },
  fade: { name: "Fade", text: "When it dies its hex receives mist, clock 2." },
};

export const STRAY_ABILITY_IDS = Object.keys(
  STRAY_ABILITY_TEXT,
) as StrayAbilityId[];
