/**
 * The naval layer's numbers (docs/design/NAVAL.md section 2, bead
 * bzc.149). Content that later beads add (the Seafaring skill, the harbour
 * buildings, the map Lighthouse) is found by the ids below.
 */

/** Sea movement points per day before bonuses (NAVAL 2.4). */
export const SEA_MOVE_BASE = 1500;
/** The cap on sea movement points (as on land, RULES_V2 3.9). */
export const SEA_MOVE_MAX = 3000;
/** A straight step at sea; a diagonal costs diagonalCost(100) = 141. */
export const SEA_STEP_COST = 100;
/** A boarding step from a shore cell, in land points (NAVAL 2.3). */
export const BOARD_STEP_COST = 100;

/**
 * Water bodies (4-connected) of at least this many cells are seas
 * (NAVAL 2.1): 60 on S maps (a side of SMALL_MAP_SIDE or less), 80 on M
 * and larger. Smaller water is a lake and stays scenery.
 */
export const SEA_MIN_SMALL = 60;
export const SEA_MIN = 80;
export const SMALL_MAP_SIDE = 36;

/**
 * A town's dock (NAVAL 2.2) is the sea cell nearest its entrance by
 * walking distance, at most this many steps away.
 */
export const DOCK_MAX_STEPS = 4;

/** The Journey skill whose rank 1 makes landing an ordinary step (7.3). */
export const SEAFARING_SKILL = "seafaring";

/** The town harbour building that gives sea movement (NAVAL 5.7). */
export const HARBOUR_LIGHTHOUSE = "lighthouse";
/** Its bonus to every hero of the player afloat, once however many. */
export const TOWN_LIGHTHOUSE_SEA_MP = 300;

/** The map site (catalogue type) that gives sea movement when flagged. */
export const MAP_LIGHTHOUSE_TYPE = "lighthouse";
export const MAP_LIGHTHOUSE_SEA_MP = 200;
/** At most this many flagged map Lighthouses count. */
export const MAP_LIGHTHOUSE_MAX = 3;

/** Map object kind of a moored boat placed on the map (NAVAL 5.6). */
export const BOAT_KIND = "boat";

/**
 * The three harbour buildings every town tree shares (NAVAL 5.7, bead
 * bzc.150), by building id: buildable only on a naval map in a town with a
 * dock, and hidden from the town screen on every other map.
 */
export const HARBOUR_SHIPYARD = "shipyard";
export const HARBOUR_ADMIRALTY = "admiralty";

/** A ship bought at a town's Shipyard (NAVAL 2.2). */
export const SHIP_PRICE = { gold: 1000, wood: 10 } as const;
/** A ship bought at a town that also has its Admiralty (NAVAL 5.7). */
export const ADMIRALTY_SHIP_PRICE = { gold: 500, wood: 5 } as const;

/**
 * The Admiralty's town special flag (BuildingDef.special): every hero of
 * its owner fires deck guns with this much more Harm (NAVAL 3.3, 5.7; one
 * Admiralty counts). Battle side specials carry it to the deck gun.
 */
export const ADMIRALTY_SPECIAL = "admiralty";
export const ADMIRALTY_DECK_GUN_HARM = 20;
