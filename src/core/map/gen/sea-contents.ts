/**
 * Seeded contents of the sea and coastal objects (docs/design/NAVAL.md 5,
 * bead bzc.151): what each holds, fixed at generation, for the sea fill of
 * a naval map (the generator's bead, NAVAL 8.6) to merge into the placed
 * object's `data`, as the swamp and volcanic passes merge theirs. Nothing
 * in the land fill calls it, so maps that are not naval are unchanged.
 *
 * Placement data stays the sea fill's: a Shipwright's `dock`, the `pair`
 * of a Ferry Landing or Whirlpool, and the guards outside an object.
 */
import { CREATURES } from "../../../data/creatures.ts";
import { battleSpellsOfTier, findMapSpell } from "../../../data/map-spells.ts";
import {
  BANK_GUARD_SHARE,
  BANK_VALUE,
  OBJECT_TYPES,
  type BankSize,
  type Prize,
} from "../../../data/objectTypes.ts";
import {
  CASTAWAY_FV,
  FLOTSAM,
  KRAKENS_DEEP_VALUE,
  NAVAL_SPELL_IDS,
  SEA_CHEST,
  SEA_DWELLINGS,
  SEA_PRODUCERS,
  type SeaObjectTypeId,
} from "../../../data/sea-objects.ts";
import { HUT_STRAYS, STRAY_CREATURES } from "../../../data/strays.ts";
import type { CreatureId } from "../../../data/types.ts";
import type { Rng } from "../../rng.ts";
import { bankSize, pickSeaArtifact } from "./contents.ts";

type Data = Record<string, unknown>;
type Guard = Array<{ creature: CreatureId; count: number }>;

/**
 * A guard of about `fv` fight value in fixed shares (one stack per
 * share), each count nudged by up to 10%: the sea banks' crews.
 */
function crew(
  rng: Rng,
  fv: number,
  shares: ReadonlyArray<readonly [CreatureId, number]>,
): Guard {
  return shares.map(([creature, share]) => {
    const each = CREATURES[creature].fightValue;
    const count = Math.max(
      1,
      Math.round(((fv * share) / each) * (1 + rng.float(-0.1, 0.1))),
    );
    return { creature, count };
  });
}

/**
 * A sea bank's artifact: on a naval map half of its Trinket and Wonder
 * draws are sea artifacts (NAVAL 7.5, bead bzc.154; pickSeaArtifact).
 */
const artifact = (rng: Rng, grade: "trinket" | "wonder" | "piece") => {
  const a = pickSeaArtifact(rng, grade);
  return a === undefined ? [] : [a];
};

/** A Shipwreck's drowned crew and its coin and timbers (NAVAL 5.5). */
function shipwreck(rng: Rng, size: BankSize): Data {
  const fv = BANK_VALUE[size] * BANK_GUARD_SHARE;
  const guard =
    size === "small"
      ? crew(rng, fv, [
          ["drowned-sailor", 0.7],
          ["jellyfish", 0.3],
        ])
      : size === "medium"
        ? crew(rng, fv, [
            ["drowned-sailor", 0.5],
            ["drowned-sailor", 0.5],
          ])
        : crew(rng, fv, [
            ["drowned-sailor", 0.5],
            ["hammerhead", 0.5],
          ]);
  const prize: Prize =
    size === "small"
      ? { gold: 2000, wood: 5 }
      : size === "medium"
        ? { artifacts: artifact(rng, "trinket"), gold: 3500, wood: 10 }
        : {
            artifacts: [
              ...artifact(rng, "wonder"),
              ...artifact(rng, "trinket"),
            ],
            gold: 6000,
            wood: 20,
          };
  return { size, value: BANK_VALUE[size], guard, prize };
}

/** A Coral Grotto's keepers and its pearls and coral (NAVAL 5.5). */
function coralGrotto(rng: Rng, size: BankSize): Data {
  const fv = BANK_VALUE[size] * BANK_GUARD_SHARE;
  let guard: Guard;
  if (size === "small") guard = crew(rng, fv, [["giant-crab", 1]]);
  else if (size === "medium")
    guard = crew(rng, fv, [
      ["giant-crab", 0.55],
      ["siren", 0.45],
    ]);
  else {
    // "Giant Crabs and a Sea Serpent or two": the crabs make up the rest.
    const serpents = rng.int(1, 2);
    const rest = fv - serpents * CREATURES["sea-serpent"].fightValue;
    guard = [
      ...crew(rng, rest, [
        ["giant-crab", 0.5],
        ["giant-crab", 0.5],
      ]),
      { creature: "sea-serpent", count: serpents },
    ];
  }
  const prize: Prize =
    size === "small"
      ? { essence: 3, ore: 5, gold: 250 }
      : size === "medium"
        ? { essence: 6, ore: 10, gold: 2000 }
        : {
            artifacts: artifact(rng, "wonder"),
            essence: 12,
            ore: 20,
            gold: 1000,
          };
  return { size, value: BANK_VALUE[size], guard, prize };
}

/**
 * The spell a Shrine of the Tides teaches: one of the five naval spells
 * (NAVAL 7) once they exist, else a Storm spell of tier 1 to 3 (the
 * weather of the sea) until the spells' bead adds them.
 */
export function tidesSpell(rng: Rng): string | undefined {
  const naval = NAVAL_SPELL_IDS.filter((id) => findMapSpell(id) !== undefined);
  if (naval.length > 0) return rng.pick(naval);
  const storm = [1, 2, 3]
    .flatMap((t) => battleSpellsOfTier(t))
    .filter((s) => s.school === "storm");
  return storm.length > 0 ? rng.pick(storm).id : undefined;
}

/**
 * The seeded contents of a sea or coastal object at zone tier `tier`
 * (0 start, 1 next door, 2+ deeper), as fields of its `data`, with its
 * `value` (NAVAL 5's values on the shared scale).
 */
export function seaContents(
  type: SeaObjectTypeId,
  rng: Rng,
  tier: number,
): Data {
  const value = OBJECT_TYPES[type].value;
  switch (type) {
    case "pearl-bed":
    case "fishing-village":
      return { resource: SEA_PRODUCERS[type].resource, value };
    case "pirate-cove":
      // Corsairs keep watch beside it (an ordinary guard, NAVAL 5.3).
      return {
        creature: SEA_DWELLINGS[type],
        guardCreature: SEA_DWELLINGS[type],
        value,
      };
    case "siren-grotto":
      return { creature: SEA_DWELLINGS[type], value };
    case "shrine-of-the-tides": {
      const spell = tidesSpell(rng);
      return spell === undefined ? { value } : { spell, value };
    }
    case "shipwreck":
      return shipwreck(rng, bankSize(rng, tier));
    case "coral-grotto":
      return coralGrotto(rng, bankSize(rng, tier));
    case "krakens-deep":
      return {
        value: KRAKENS_DEEP_VALUE,
        guard: crew(rng, KRAKENS_DEEP_VALUE * BANK_GUARD_SHARE, [
          ["kraken", 0.36],
          ["hammerhead", 0.32],
          ["hammerhead", 0.32],
        ]),
        prize: {
          artifacts: [...artifact(rng, "piece"), ...artifact(rng, "wonder")],
          gold: 5000,
        },
      };
    case "flotsam": {
      if (rng.chance(0.5)) {
        const wood = rng.int(FLOTSAM.wood[0], FLOTSAM.wood[1]);
        return { prize: { wood }, value: wood * 100 };
      }
      const wood = rng.int(FLOTSAM.mixedWood[0], FLOTSAM.mixedWood[1]);
      const gold =
        rng.int(FLOTSAM.mixedGold[0] / 100, FLOTSAM.mixedGold[1] / 100) * 100;
      return { prize: { wood, gold }, value: wood * 100 + gold };
    }
    case "sea-chest": {
      // The rich chest of rings 2-3 holds a Trinket and 500 gold.
      if (tier >= 2 && rng.chance(0.5)) {
        const a = pickSeaArtifact(rng, "trinket");
        if (a !== undefined)
          return { artifact: a, gold: SEA_CHEST.richGold, value: 2500 };
      }
      return { gold: SEA_CHEST.gold, xp: SEA_CHEST.xp, value };
    }
    case "castaway": {
      // A hireable stray worth FV 400-900 (NAVAL 5.6).
      const target = rng.int(CASTAWAY_FV[0], CASTAWAY_FV[1]);
      const fits = HUT_STRAYS.filter((c) => {
        const n = Math.round(target / STRAY_CREATURES[c].fightValue);
        return n >= 1 && n * STRAY_CREATURES[c].fightValue <= CASTAWAY_FV[1];
      });
      const creature = rng.pick(fits.length > 0 ? fits : HUT_STRAYS);
      const count = Math.max(
        1,
        Math.round(target / STRAY_CREATURES[creature].fightValue),
      );
      return { creature, count, value };
    }
    default:
      // Buoy, Mermaid Rock, Lighthouse, Sirens' Rock, Shipwright, Message
      // in a Bottle, Moored Boat, Ferry Landing, Whirlpool: nothing seeded
      // beyond their place.
      return value > 0 ? { value } : {};
  }
}
