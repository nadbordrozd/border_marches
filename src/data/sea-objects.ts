/**
 * The numbers of the sea and coastal objects (docs/design/NAVAL.md section
 * 5, bead bzc.151). Their catalogue rows are in ./objectTypes.ts (weight 0:
 * only the sea fill of a naval map places them), their visit rules in
 * src/core/game/sites.ts, their seeded contents in
 * src/core/map/gen/sea-contents.ts.
 */
import type { ResourceId } from "../core/map/types.ts";
import { NAVAL_SPELLS } from "./naval.ts";
import type { SeaCreatureId } from "./types.ts";

/** The twenty sea and coastal object types, in NAVAL.md 5's order. */
export const SEA_OBJECT_TYPE_IDS = [
  // 5.2 Producers
  "pearl-bed",
  "fishing-village",
  // 5.3 Dwellings and services
  "pirate-cove",
  "siren-grotto",
  "shipwright",
  // 5.4 Visitable sites
  "buoy",
  "mermaid-rock",
  "lighthouse",
  "sirens-rock",
  "shrine-of-the-tides",
  "ferry-landing",
  // 5.5 Banks
  "shipwreck",
  "coral-grotto",
  "krakens-deep",
  // 5.6 Treasure and teleports
  "flotsam",
  "sea-chest",
  "castaway",
  "message-in-a-bottle",
  "moored-boat",
  "whirlpool",
] as const;

export type SeaObjectTypeId = (typeof SEA_OBJECT_TYPE_IDS)[number];

/**
 * The two sea producers (NAVAL 5.2): flagged like mines (map object kind
 * "mine"), each with its own resource and daily yield.
 */
export const SEA_PRODUCERS: Readonly<
  Record<
    "pearl-bed" | "fishing-village",
    { readonly resource: ResourceId; readonly income: number }
  >
> = {
  // Pearls pay essence (NAVAL 6).
  "pearl-bed": { resource: "essence", income: 1 },
  // Fish pay gold.
  "fishing-village": { resource: "gold", income: 500 },
};

/** The creature each sea dwelling recruits (NAVAL 5.3; stock and price in SEA_HOMES). */
export const SEA_DWELLINGS: Readonly<
  Record<"pirate-cove" | "siren-grotto", SeaCreatureId>
> = {
  "pirate-cove": "corsair",
  "siren-grotto": "siren",
};

/** Sight a flagged Lighthouse reveals around itself when visited (NAVAL 2.8). */
export const LIGHTHOUSE_SIGHT = 10;

/** Sirens' Rock (NAVAL 5.4): experience, and each stack loses this share. */
export const SIRENS_ROCK_XP = 2000;
export const SIRENS_ROCK_LOSS_DIVISOR = 10;

/** A Ferry Landing's crossing costs (and needs) this many movement points. */
export const FERRY_MP = 300;

/**
 * A Sea Chest (NAVAL 5.6): gold or experience; the rich chest of rings 2-3
 * holds a Trinket and this much gold.
 */
export const SEA_CHEST = { gold: 1500, xp: 1000, richGold: 500 } as const;

/** A Castaway's experience when the army has no room for the strays. */
export const CASTAWAY_XP = 1000;
/** A Castaway's strays: a stack worth this fight value (NAVAL 5.6). */
export const CASTAWAY_FV: readonly [number, number] = [400, 900];

/** From this Seafaring rank a whirlpool takes nothing (NAVAL 2.4, 7.3). */
export const WHIRLPOOL_SAFE_RANK = 2;

/** Flotsam's seeded wood, or wood and gold (NAVAL 5.6). */
export const FLOTSAM = {
  wood: [5, 10],
  mixedWood: [4, 6],
  mixedGold: [300, 500],
} as const;

/** The Kraken's Deep's value (one to a map); its guard is 60% of it. */
export const KRAKENS_DEEP_VALUE = 16000;

/**
 * The five naval spells (NAVAL 7) a Shrine of the Tides draws from: the
 * naval spell list of src/data/naval.ts (bead bzc.154).
 */
export const NAVAL_SPELL_IDS: readonly string[] = NAVAL_SPELLS;
