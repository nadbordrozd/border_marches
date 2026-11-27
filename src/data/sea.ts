/**
 * Sea guardians (docs/design/NAVAL.md section 4, bead bzc.152): eight
 * neutral creatures that guard only sea cells, and where they live.
 *
 * They are in CREATURES (src/data/creatures.ts) but never in the land
 * guard roster (`GUARD_CREATURE_IDS`, src/data/strays.ts), the stray huts,
 * the caretaker lodges or any land fill: only the sea fill of a naval map
 * (NAVAL.md 8.6, the generator's bead) places them, from {@link SEA_HOMES}.
 * A map that is not naval is generated exactly as before.
 *
 * Every sea guardian but the Corsair is a Swimmer (NAVAL.md 3.1): the
 * ability "swimmer" in its abilities, as the Bog Leech, the Deep-Sea Diver
 * and the Lagoon Lurker also have (src/data/strays.ts). What a Swimmer may
 * do on a sea hex is the naval battlefield's rule (NAVAL.md 3.1, bead 5).
 * The summoned Hermit Crab (NAVAL.md 4.3) is a summon, so it lives with the
 * other summons in SUMMONED_CREATURES (src/core/magic/kinds.ts).
 *
 * Stats are NAVAL.md 4.1; abilities (4.2) are battle rules registered in
 * src/core/battle/sea-abilities.ts under the ids of {@link SEA_ABILITY_TEXT}.
 * No sea guardian shoots (NAVAL.md 4.4, "melee only").
 */
import type {
  CreatureDef,
  SeaAbilityId,
  SeaCreatureId,
  StrayCreatureId,
  StrayDeathTag,
} from "./types.ts";

type Row = [
  id: SeaCreatureId,
  name: string,
  plural: string,
  tier: number,
  hp: number,
  attack: number,
  defense: number,
  damage: number,
  speed: number,
  fv: number,
  remains: StrayDeathTag,
  cannotBear: readonly string[],
  swimmer: boolean,
  ability: SeaAbilityId,
];

const ROWS: readonly Row[] = [
  // prettier-ignore
  ["jellyfish", "Jellyfish", "Jellyfish", 1, 6, 4, 2, 2, 5, 45, "nothing", [], true, "stinging-bell"],
  // prettier-ignore
  ["drowned-sailor", "Drowned Sailor", "Drowned Sailors", 2, 15, 6, 5, 3, 4, 104, "bones", ["heartened", "shaken"], true, "dead-weight"],
  // prettier-ignore
  ["giant-crab", "Giant Crab", "Giant Crabs", 2, 16, 5, 9, 3, 4, 118, "corpse", [], true, "carapace"],
  // prettier-ignore
  ["corsair", "Corsair", "Corsairs", 3, 24, 9, 6, 5, 6, 192, "corpse", [], false, "swing-across"],
  // prettier-ignore
  ["siren", "Siren", "Sirens", 3, 20, 8, 5, 5, 6, 165, "corpse", [], true, "siren-song"],
  // prettier-ignore
  ["hammerhead", "Hammerhead", "Hammerheads", 4, 50, 13, 7, 10, 7, 447, "corpse", [], true, "blood-in-the-water"],
  // prettier-ignore
  ["sea-serpent", "Sea Serpent", "Sea Serpents", 5, 95, 14, 11, 16, 7, 877, "corpse", [], true, "coil"],
  // prettier-ignore
  ["kraken", "Kraken", "Krakens", 6, 170, 17, 15, 26, 5, 1729, "corpse", [], true, "many-arms"],
];

/**
 * The sprite key of a sea creature: `sea-<id>`, the studio set `sea-units`
 * (NAVAL.md 10.2). Until its art is in the manifest the creature draws the
 * placeholder (src/assets/unit-art.ts).
 */
export function seaSprite(id: string): string {
  return `sea-${id}`;
}

export const SEA_CREATURES: Readonly<Record<SeaCreatureId, CreatureDef>> =
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
        fv,
        remains,
        cannotBear,
        swimmer,
        ability,
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
          shots: 0,
          ability: null,
          abilities: swimmer ? [ability, "swimmer"] : [ability],
          growth: 0,
          cost: {},
          fightValue: fv,
          sprite: seaSprite(id),
          tags: { remains, cannotBear },
        } satisfies CreatureDef,
      ],
    ),
  ) as unknown as Record<SeaCreatureId, CreatureDef>;

/** Every sea guardian in roster order (by tier). */
export const SEA_CREATURE_IDS: readonly SeaCreatureId[] = ROWS.map((r) => r[0]);

/** The strays that also swim and guard seas (NAVAL.md 3.1 and 4.4). */
export const SWIMMING_STRAYS: readonly StrayCreatureId[] = [
  "bog-leech",
  "deep-sea-diver",
  "lagoon-lurker",
];

/** A sea creature's home (NAVAL.md 4.4): always the cells of a sea. */
export interface SeaHome {
  /** Guard rings (GAME_DESIGN 8.3) it is used in, inclusive. */
  rings: readonly [number, number];
  /**
   * "wild", or the sea object that is its dwelling (Pirate Cove, Siren
   * Grotto; NAVAL.md 5.3).
   */
  dwelling: "wild" | "pirate-cove" | "siren-grotto";
  /** The sea bank it keeps, if any (NAVAL.md 5.5). */
  site?: "shipwreck" | "coral-grotto" | "krakens-deep";
  /** Weekly stock of its dwelling (0 for wild ones). */
  weekly: number;
  /** Hire cost in gold (FV x 1.5, rounded to 5; 0 for wild ones). */
  hire: number;
  /**
   * Drawn on the map as a pirate ship with its crew (the Corsairs): a
   * non-swimming sea stack, fought deck to deck (NAVAL.md 4.4).
   */
  pirateShip?: true;
}

type HomeRow = [
  SeaCreatureId | StrayCreatureId,
  readonly [number, number],
  SeaHome["dwelling"],
  number,
  number,
  SeaHome["site"]?,
];

const HOMES: readonly HomeRow[] = [
  ["jellyfish", [0, 1], "wild", 0, 0],
  ["drowned-sailor", [0, 2], "wild", 0, 0, "shipwreck"],
  ["giant-crab", [0, 2], "wild", 0, 0, "coral-grotto"],
  ["corsair", [1, 2], "pirate-cove", 3, 290],
  ["siren", [1, 2], "siren-grotto", 3, 250],
  ["hammerhead", [1, 3], "wild", 0, 0],
  ["sea-serpent", [2, 3], "wild", 0, 0],
  ["kraken", [3, 3], "wild", 0, 0, "krakens-deep"],
  ["bog-leech", [0, 2], "wild", 0, 0],
  ["deep-sea-diver", [1, 2], "wild", 0, 0],
  ["lagoon-lurker", [1, 3], "wild", 0, 0],
];

/**
 * Where each sea guard lives (NAVAL.md 4.4): the eight guardians and the
 * three swimming strays. Read only by the sea fill of a naval map; the land
 * fill reads STRAY_HOMES, which these entries do not change.
 */
export const SEA_HOMES: Readonly<
  Record<SeaCreatureId | StrayCreatureId, SeaHome>
> = Object.fromEntries(
  HOMES.map(([id, rings, dwelling, weekly, hire, site]) => [
    id,
    {
      rings,
      dwelling,
      weekly,
      hire,
      ...(site !== undefined ? { site } : {}),
      ...(id === "corsair" ? { pirateShip: true } : {}),
    },
  ]),
) as Record<SeaCreatureId | StrayCreatureId, SeaHome>;

/** The creatures that guard seas, in roster order then the strays. */
export const SEA_GUARD_IDS: readonly (SeaCreatureId | StrayCreatureId)[] =
  HOMES.map((h) => h[0]);

/** Ability names and rules for tooltips (NAVAL.md 3.1 and 4.2). */
export const SEA_ABILITY_TEXT: Readonly<
  Record<SeaAbilityId, { name: string; text: string }>
> = {
  swimmer: {
    name: "Swimmer",
    text: "A Swimmer: it may walk into, through and stand on sea hexes. On land it walks as usual.",
  },
  "stinging-bell": {
    name: "Stinging Bell",
    text: "The Jellyfish start each battle Thorned, of size 1 per Jellyfish (at most 20), for the whole battle.",
  },
  "dead-weight": {
    name: "Dead Weight",
    text: "A stack the Drowned Sailors attack in melee becomes Slowed 1 for 2 rounds.",
  },
  carapace: {
    name: "Carapace",
    text: "Shots deal half damage to these crabs.",
  },
  "swing-across": {
    name: "Swing Across",
    text: "The Corsairs do not walk: they swing to any free hex within their Speed, whatever is in the way, but never into the sea.",
  },
  "siren-song": {
    name: "Siren Song",
    text: "Once per battle, instead of attacking: pull an enemy stack within 6 hexes of the Sirens 3 hexes toward them; it becomes Mollified 30 for 2 rounds.",
  },
  "blood-in-the-water": {
    name: "Blood in the Water",
    text: "The Hammerheads' Strikes deal 50% more damage to a stack with fewer creatures than it was deployed with.",
  },
  coil: {
    name: "Coil",
    text: "A stack the Sea Serpents attack in melee becomes Stuck for 2 rounds.",
  },
  "many-arms": {
    name: "Many Arms",
    text: "After the Krakens attack in melee, they Strike every other enemy stack next to them for half damage. No retaliation.",
  },
};

export const SEA_ABILITY_IDS = Object.keys(SEA_ABILITY_TEXT) as SeaAbilityId[];
