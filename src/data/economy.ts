/**
 * Resources, starting stock, mines, pickups and the marketplace
 * (ECONOMY.md). Building and creature costs live with their definitions.
 */
import type { ResourceId, Resources } from "./types.ts";

/** Display order of the resources. */
export const RESOURCE_IDS: readonly ResourceId[] = [
  "gold",
  "wood",
  "ore",
  "essence",
];

export const RESOURCE_NAMES: Readonly<Record<ResourceId, string>> = {
  gold: "Gold",
  wood: "Wood",
  ore: "Ore",
  essence: "Essence",
};

/** ECONOMY.md section 2. */
export const STARTING_RESOURCES: Readonly<Resources> = {
  gold: 7500,
  wood: 20,
  ore: 10,
  essence: 4,
};

export interface MineDef {
  resource: ResourceId;
  name: string;
  /** Daily income once flagged (paid from the day after flagging). */
  income: number;
}

/** ECONOMY.md sections 3 and 4, keyed by the resource a mine produces. */
export const MINES: Readonly<Record<ResourceId, MineDef>> = {
  wood: { resource: "wood", name: "Sawmill", income: 3 },
  ore: { resource: "ore", name: "Ore Pit", income: 2 },
  essence: { resource: "essence", name: "Essence Spring", income: 1 },
  gold: { resource: "gold", name: "Gold Mine", income: 750 },
};

export interface PickupDef {
  resource: ResourceId;
  name: string;
  /** Amount range for the generator (inclusive). */
  min: number;
  max: number;
  /** Amounts are multiples of this. */
  step: number;
}

/** ECONOMY.md section 5. The map fixes each pickup's amount at generation. */
export const PICKUPS: Readonly<Record<ResourceId, PickupDef>> = {
  wood: { resource: "wood", name: "Wood pile", min: 5, max: 10, step: 1 },
  ore: { resource: "ore", name: "Ore pile", min: 3, max: 6, step: 1 },
  essence: {
    resource: "essence",
    name: "Essence crystals",
    min: 2,
    max: 4,
    step: 1,
  },
  gold: { resource: "gold", name: "Gold pile", min: 300, max: 800, step: 100 },
};

/**
 * Treasure chest: a pickup map object with `data.chest === true` (no
 * resource). The player chooses gold or experience.
 */
export const CHEST = { name: "Treasure chest", gold: 1000, xp: 750 } as const;

/** Marketplace prices in gold (ECONOMY.md section 7). Gold itself is 1. */
export const MARKET_BUY_PRICE: Readonly<Record<ResourceId, number>> = {
  gold: 1,
  wood: 250,
  ore: 250,
  essence: 600,
};

export const MARKET_SELL_PRICE: Readonly<Record<ResourceId, number>> = {
  gold: 1,
  wood: 25,
  ore: 25,
  essence: 60,
};
