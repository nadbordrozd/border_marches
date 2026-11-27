/**
 * The spell list as the adventure map needs it (bead bzc.13): id, name,
 * school, tier and whether it is an adventure spell, from
 * docs/design/CONTENT_SPELLS.md sections 3 and 4.
 *
 * A small adapter: the magic catalogue (src/core/magic/catalog.ts) owns
 * the spells. The map generator must not import it (it pulls in the battle
 * engine, which plain `node` cannot strip for `npm run map:ascii` and
 * `npm run perf`), so this table is a copy, checked against the catalogue
 * by tests/data/map-spells.test.ts. The map objects only use the functions
 * below.
 */
import type { School } from "../core/battle/types.ts";

export interface MapSpell {
  id: string;
  name: string;
  school: School;
  tier: number;
  adventure: boolean;
  /**
   * A naval spell (NAVAL 7.5, bead bzc.154): the map's draws hold it only
   * on a naval map.
   */
  naval: boolean;
}

// prettier-ignore
const ROWS: ReadonlyArray<readonly [string, string, School, number, boolean]> = [
  ["poultice", "Poultice", "bloom", 1, false],
  ["thornskin", "Thornskin", "bloom", 1, false],
  ["nettle", "Nettle", "bloom", 1, false],
  ["feed", "Feed", "bloom", 2, false],
  ["regrow", "Regrow", "bloom", 2, false],
  ["sprout", "Sprout", "bloom", 2, false],
  ["bramble-row", "Bramble Row", "bloom", 3, false],
  ["ripen", "Ripen", "bloom", 3, false],
  ["orchard-day", "Orchard Day", "bloom", 4, false],
  ["second-spring", "Second Spring", "bloom", 5, false],
  ["scapegoat", "Scapegoat", "accord", 1, false],
  ["close-ranks", "Close Ranks", "accord", 1, false],
  ["change-places", "Change Places", "accord", 1, false],
  ["share", "Share", "accord", 2, false],
  ["sign-here", "Sign Here", "accord", 2, false],
  ["soft-words", "Soft Words", "accord", 2, false],
  ["sanctuary-oath", "Sanctuary Oath", "accord", 3, false],
  ["take-heart", "Take Heart", "accord", 3, false],
  ["change-of-heart", "Change of Heart", "accord", 4, false],
  ["the-long-table", "The Long Table", "accord", 5, false],
  ["first-bell", "First Bell", "clock", 1, false],
  ["late-bell", "Late Bell", "clock", 1, false],
  ["appointment", "Appointment", "clock", 1, false],
  ["wind", "Wind", "clock", 2, false],
  ["treacle", "Treacle", "clock", 2, false],
  ["quick-march", "Quick March", "clock", 2, false],
  ["encore", "Encore", "clock", 3, false],
  ["forced-march", "Forced March", "clock", 3, false],
  ["deadline", "Deadline", "clock", 4, false],
  ["double-time", "Double Time", "clock", 5, false],
  ["hush-now", "Hush Now", "hush", 1, false],
  ["on-credit", "On Credit", "hush", 1, false],
  ["bad-omen", "Bad Omen", "hush", 1, false],
  ["pass-on", "Pass On", "hush", 2, false],
  ["lullaby", "Lullaby", "hush", 2, false],
  ["second-shift", "Second Shift", "hush", 2, false],
  ["leech-line", "Leech Line", "hush", 3, false],
  ["curtain-call", "Curtain Call", "hush", 3, false],
  ["pea-soup", "Pea Soup", "hush", 4, false],
  ["everybody-up", "Everybody Up", "hush", 5, false],
  ["jolt", "Jolt", "storm", 1, false],
  ["gust", "Gust", "storm", 1, false],
  ["hothead", "Hothead", "storm", 1, false],
  ["set-off", "Set Off", "storm", 2, false],
  ["broadside", "Broadside", "storm", 2, false],
  ["cold-snap", "Cold Snap", "storm", 2, false],
  ["downpour", "Downpour", "storm", 3, false],
  ["wildfire", "Wildfire", "storm", 3, false],
  ["whiteout", "Whiteout", "storm", 4, false],
  ["the-sky-falls", "The Sky Falls", "storm", 5, false],
  ["green-road", "Green Road", "bloom", 2, true],
  ["second-helping", "Second Helping", "bloom", 3, true],
  ["parley", "Parley", "accord", 3, true],
  ["read-the-seal", "Read the Seal", "accord", 1, true],
  ["borrowed-day", "Borrowed Day", "clock", 3, true],
  ["saved-hour", "Saved Hour", "clock", 1, true],
  ["ask-the-dead", "Ask the Dead", "hush", 1, true],
  ["dowse", "Dowse", "hush", 2, true],
  ["tow-line", "Tow Line", "storm", 4, true],
  ["opening-salvo", "Opening Salvo", "storm", 2, true],
];

/** The naval spells (NAVAL 7.1, 7.2): drawn only on naval maps. */
// prettier-ignore
const NAVAL_ROWS: ReadonlyArray<readonly [string, string, School, number, boolean]> = [
  ["tidal-wave", "Tidal Wave", "storm", 4, false],
  ["call-the-boat", "Call the Boat", "accord", 2, true],
  ["scuttle", "Scuttle", "hush", 2, true],
  ["lily-road", "Lily Road", "bloom", 3, true],
  ["fair-wind", "Fair Wind", "storm", 1, true],
];

export const MAP_SPELLS: readonly MapSpell[] = [
  ...ROWS.map(([id, name, school, tier, adventure]) => ({
    id,
    name,
    school,
    tier,
    adventure,
    naval: false,
  })),
  ...NAVAL_ROWS.map(([id, name, school, tier, adventure]) => ({
    id,
    name,
    school,
    tier,
    adventure,
    naval: true,
  })),
];

const BY_ID = new Map(MAP_SPELLS.map((s) => [s.id, s]));

export function findMapSpell(id: string): MapSpell | undefined {
  return BY_ID.get(id);
}

/** The spell's display name (the id, title-cased, when unknown). */
export function spellName(id: string): string {
  const known = BY_ID.get(id);
  if (known !== undefined) return known.name;
  return id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Battle spells of a tier (shrines and scrolls teach battle spells); the
 * naval Tidal Wave only when `naval` (NAVAL 7.5), so a map that is not
 * naval draws from exactly the list it drew from before it.
 */
export function battleSpellsOfTier(tier: number, naval = false): MapSpell[] {
  return MAP_SPELLS.filter(
    (s) => !s.adventure && s.tier === tier && (naval || !s.naval),
  );
}

/**
 * The spells of a tier a naval map's School Shrines and Scholars may also
 * teach (NAVAL 7.5): the naval spells, battle and adventure.
 */
export function navalSpellsOfTier(tier: number): MapSpell[] {
  return MAP_SPELLS.filter((s) => s.naval && s.tier === tier);
}

/** Scroll value by tier (CONTENT_MAP_OBJECTS 3.5, Loose Scroll). */
export const SCROLL_VALUE: readonly number[] = [0, 300, 600, 1000, 1500, 2500];
