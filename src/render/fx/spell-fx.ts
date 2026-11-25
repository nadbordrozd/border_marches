/**
 * The effect registry (bead bzc.26): how each battle spell looks. Every
 * spell has a delivery shape and may pick an element; a spell missing here
 * falls back to its school's look ({@link schoolFallback}), and an act
 * with no school (a creature ability) to {@link NEUTRAL_FX}.
 *
 * Shapes: `bolt` a projectile (or a strike from the sky) then the impact;
 * `touch` motes settle on a friendly stack; `burst` an area; `beam` a link
 * between two stacks; `ground` features spawned on hexes; `summon` a stack
 * rising; `wave` every friendly stack; `tool` a small flourish on a stack
 * whose condition the spell changes.
 */
import type { SpellShape } from "../../audio/fx.ts";
import type { School } from "../../core/battle/types.ts";
import type { Element } from "./emit.ts";

export interface SpellFx {
  readonly shape: SpellShape;
  readonly element?: Element;
}

export interface ResolvedSpellFx extends SpellFx {
  readonly school: School;
  /** True when the spell had no entry and took its school's look. */
  readonly fallback: boolean;
}

export const SPELL_FX: Readonly<Record<string, SpellFx>> = {
  // Bloom
  poultice: { shape: "touch" },
  thornskin: { shape: "touch" },
  nettle: { shape: "bolt" },
  feed: { shape: "tool" },
  regrow: { shape: "touch" },
  sprout: { shape: "summon" },
  "bramble-row": { shape: "ground" },
  ripen: { shape: "touch" },
  "orchard-day": { shape: "wave" },
  "second-spring": { shape: "wave" },
  mend: { shape: "touch" },
  // Accord
  scapegoat: { shape: "beam" },
  "close-ranks": { shape: "touch" },
  "change-places": { shape: "beam" },
  share: { shape: "beam" },
  "sign-here": { shape: "bolt" },
  "soft-words": { shape: "bolt" },
  "sanctuary-oath": { shape: "touch" },
  "take-heart": { shape: "touch" },
  "change-of-heart": { shape: "bolt" },
  "the-long-table": { shape: "burst" },
  // Clock
  "first-bell": { shape: "touch" },
  "late-bell": { shape: "bolt" },
  appointment: { shape: "bolt" },
  wind: { shape: "tool" },
  treacle: { shape: "burst" },
  "quick-march": { shape: "wave" },
  encore: { shape: "touch" },
  "forced-march": { shape: "wave" },
  deadline: { shape: "bolt" },
  "double-time": { shape: "wave" },
  // Hush
  "hush-now": { shape: "bolt" },
  "on-credit": { shape: "touch" },
  "bad-omen": { shape: "bolt" },
  "pass-on": { shape: "beam" },
  lullaby: { shape: "bolt" },
  "second-shift": { shape: "summon" },
  "leech-line": { shape: "beam" },
  "curtain-call": { shape: "summon" },
  "pea-soup": { shape: "ground" },
  "everybody-up": { shape: "summon" },
  "last-breath": { shape: "bolt" },
  // Storm
  jolt: { shape: "bolt", element: "lightning" },
  gust: { shape: "bolt", element: "wind" },
  hothead: { shape: "bolt", element: "fire" },
  "set-off": { shape: "tool", element: "fire" },
  broadside: { shape: "burst", element: "fire" },
  "cold-snap": { shape: "bolt", element: "frost" },
  downpour: { shape: "burst", element: "rain" },
  wildfire: { shape: "ground", element: "fire" },
  whiteout: { shape: "burst", element: "frost" },
  "the-sky-falls": { shape: "burst", element: "lightning" },
  thunderclap: { shape: "burst", element: "lightning" },
};

/** Each school's look for a spell with no entry. */
export const SCHOOL_FALLBACK: Readonly<Record<School, SpellFx>> = {
  bloom: { shape: "touch" },
  accord: { shape: "bolt" },
  clock: { shape: "bolt" },
  hush: { shape: "bolt" },
  storm: { shape: "bolt", element: "lightning" },
};

/** Acts with no school (creature abilities): a plain flourish. */
export const NEUTRAL_FX: ResolvedSpellFx = {
  shape: "tool",
  school: "accord",
  fallback: true,
};

export function schoolFallback(school: School): ResolvedSpellFx {
  return { ...SCHOOL_FALLBACK[school], school, fallback: true };
}

/** The look of a spell of `school` (or of an unknown act: neutral). */
export function spellFx(
  id: string,
  school: School | undefined,
): ResolvedSpellFx {
  if (school === undefined) return NEUTRAL_FX;
  const own = SPELL_FX[id];
  return own ? { ...own, school, fallback: false } : schoolFallback(school);
}
