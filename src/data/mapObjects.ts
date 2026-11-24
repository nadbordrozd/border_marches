/**
 * The adventure-map object table: one row per object type the map generator
 * can place, with its prize value, footprint, visit side and how often it
 * appears in each kind of zone (bead border_marches-bzc.3).
 *
 * The generator reads only this table to fill zones, so a new object type
 * (a dwelling, a shrine, an artifact) plugs in by adding a row here (and, if
 * its `kind` is new, the kind to the map contract in src/core/map/types.ts).
 *
 * **Value** is the prize in gold-equivalent points. It drives two things:
 * - whether the object is guarded (a zone guards everything worth at least
 *   its free value, see {@link FREE_VALUE}),
 * - how strong the guard is: a guard's fight value is the value of what it
 *   guards times {@link GUARD_FV_PER_VALUE}, nudged by distance from the
 *   nearest start (GUARD_RING_FACTOR) and a small jitter.
 *
 * Unit values put the four resources on one scale (between the marketplace
 * buy and sell prices of ECONOMY.md section 7): a mine is worth about two
 * weeks of its income at those unit values, a pickup its amount.
 */
import type { MapObjectKind, ResourceId } from "../core/map/types.ts";

/** Kinds of zone the generator lays out. */
export type MapZoneKind = "start" | "middle" | "town" | "hold";

export const MAP_ZONE_KINDS: readonly MapZoneKind[] = [
  "start",
  "middle",
  "town",
  "hold",
];

/** Gold-equivalent value of one unit of each resource. */
export const RESOURCE_UNIT_VALUE: Readonly<Record<ResourceId, number>> = {
  gold: 1,
  wood: 100,
  ore: 150,
  essence: 300,
};

export interface MapObjectRow {
  /** Row id; also the prefix of the placed objects' ids. */
  id: string;
  /** Map object kind it places. */
  kind: MapObjectKind;
  /** Prize value (gold equivalent), before any rolled amount. */
  value: number;
  /** Extra value per unit of a rolled field (pickups: per resource unit). */
  unitValue?: { field: string; value: number };
  /** Bounding box of the object's cells. */
  footprint: { w: number; h: number };
  /** The entrance (visit) cell inside the footprint box; the rest blocks. */
  entrance: readonly [number, number];
  /**
   * Where a hero may stand to step onto the entrance: "any" side, or only
   * "front" (the three cells below the entrance row, like a mine's door).
   */
  visit: "any" | "front";
  /** Placement weight per zone kind; a missing kind means never. */
  weights: Partial<Record<MapZoneKind, number>>;
  /**
   * "auto": guarded when the value reaches the zone's free value; "never"
   * and "always" override that.
   */
  guard: "auto" | "never" | "always";
  /** At most this many per zone (from random fill; the start kit aside). */
  perZone?: number;
  /** Random fills keep at least this many days from every player's town. */
  minDays?: number;
  /** Fixed payload copied into MapObject.data. */
  data: Readonly<Record<string, unknown>>;
  /** Rolled payload fields: [min, max, step], inclusive. */
  rolls?: Readonly<Record<string, readonly [number, number, number]>>;
}

const pile = (
  resource: ResourceId,
  amount: readonly [number, number, number],
  weights: MapObjectRow["weights"],
): MapObjectRow => ({
  id: `pickup-${resource}`,
  kind: "pickup",
  value: 0,
  unitValue: { field: "amount", value: RESOURCE_UNIT_VALUE[resource] },
  footprint: { w: 1, h: 1 },
  entrance: [0, 0],
  visit: "any",
  weights,
  guard: "auto",
  data: { resource },
  rolls: { amount },
});

const mine = (
  resource: ResourceId,
  value: number,
  weights: MapObjectRow["weights"],
  extra: Partial<MapObjectRow> = {},
): MapObjectRow => ({
  id: `mine-${resource}`,
  kind: "mine",
  value,
  footprint: { w: 2, h: 1 },
  entrance: [1, 0],
  visit: "any",
  weights,
  guard: "auto",
  perZone: 2,
  data: { resource },
  ...extra,
});

/** Every object type the generator places, by row id. */
export const MAP_OBJECT_ROWS: readonly MapObjectRow[] = [
  pile("wood", [5, 10, 1], { start: 3, middle: 3, town: 3, hold: 1 }),
  pile("ore", [3, 6, 1], { start: 2, middle: 2.5, town: 2.5, hold: 1.5 }),
  pile("gold", [300, 800, 100], { start: 3, middle: 3, town: 3, hold: 3 }),
  pile("essence", [2, 4, 1], { start: 1, middle: 1.5, town: 1.5, hold: 2 }),
  {
    id: "chest",
    kind: "pickup",
    value: 1500,
    footprint: { w: 1, h: 1 },
    entrance: [0, 0],
    visit: "any",
    weights: { start: 1, middle: 1.6, town: 1.6, hold: 2.5 },
    guard: "auto",
    data: { resource: "gold", amount: 1000, chest: true, xp: 750 },
  },
  mine("wood", 1400, { middle: 1.2, town: 1.2, hold: 0.3 }),
  mine("ore", 1800, { middle: 1.1, town: 1.1, hold: 0.6 }),
  mine(
    "essence",
    3500,
    { middle: 0.35, town: 0.35, hold: 0.8 },
    {
      perZone: 1,
      minDays: 2,
    },
  ),
  mine(
    "gold",
    6000,
    { middle: 0.3, town: 0.45, hold: 1 },
    {
      perZone: 1,
      minDays: 1,
    },
  ),
];

export const MAP_OBJECT_ROW_BY_ID: Readonly<Record<string, MapObjectRow>> =
  Object.fromEntries(MAP_OBJECT_ROWS.map((r) => [r.id, r]));

/**
 * The prize value of a neutral town: its garrison is sized like a guard of
 * this value. Unused player starts in a game with fewer players count as
 * neutral towns too.
 */
export const NEUTRAL_TOWN_VALUE = 9000;

/**
 * Objects worth less than this are free for the taking in a zone of that
 * kind; anything worth at least this much gets a guard. Start zones are
 * generous (a sawmill and a chest near home are free), the rest are not.
 */
export const FREE_VALUE: Readonly<Record<MapZoneKind, number>> = {
  start: 1600,
  middle: 1200,
  town: 1200,
  hold: 1000,
};

/** Guard fight value per point of guarded value. */
export const GUARD_FV_PER_VALUE = 0.75;

/**
 * Factor on the guard fight value by ring (distance from the nearest player
 * town, GAME_DESIGN.md section 8.3): a prize far from home is a little
 * harder to take, so the proportion stays rough, never more than 1.5x.
 */
export const GUARD_RING_FACTOR: readonly number[] = [0.8, 1, 1.2, 1.4];

/**
 * Value behind a zone-to-zone passage, by the tier of the zone it opens
 * (1 = next to a start, 2 = farther, 3+ = deep; the Hold's zone uses the
 * last entry). A passage guard is sized from this value like any other.
 */
export const PASS_VALUE: readonly number[] = [0, 1800, 4000, 7000, 14000];
