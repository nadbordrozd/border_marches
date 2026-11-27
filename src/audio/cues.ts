/**
 * Which effect a game moment makes. Pure functions, so the choices are
 * testable without audio.
 */
import type { BattleEvent, BattleState } from "../core/battle/types.ts";
import type { ResourceId } from "../core/map/types.ts";
import type { ObjectTypeId } from "../data/objectTypes.ts";
import type { FactionId } from "../data/types.ts";
import type { SoundId } from "./sound.ts";

/** Tier from which a creature's blows sound heavy. */
export const HEAVY_TIER = 4;
/** A blow that takes this share of the target stack's HP sounds heavy. */
export const HEAVY_SHARE = 0.5;

/**
 * The sound of a battle event, played as the event starts animating: hits
 * on impact (heavy for big creatures or crushing blows), deaths when a
 * stack falls. Shots sound through their projectile's effect event
 * (`battle.shot.<kind>` in fx.ts), so each shooter has its own; other
 * events are silent here.
 */
export function battleCue(e: BattleEvent, before: BattleState): SoundId | null {
  switch (e.type) {
    case "death":
      return "battle.death";
    case "damage": {
      const source = before.stacks.find((s) => s.id === e.sourceId);
      const target = before.stacks.find((s) => s.id === e.targetId);
      const stackHp =
        target === undefined
          ? Infinity
          : Math.max(1, (target.count - 1) * target.creature.hp + target.topHp);
      const heavy =
        e.kind !== "shot" &&
        ((source?.creature.tier ?? 0) >= HEAVY_TIER ||
          e.damage >= stackHp * HEAVY_SHARE);
      return heavy ? "battle.heavy-hit" : "battle.hit";
    }
    default:
      return null;
  }
}

/** The sound of collecting a resource on the map. */
export function pickupCue(resource: ResourceId): SoundId {
  return resource === "gold" ? "gold" : "pickup";
}

/** The four factions with their own recruit, victory and town sounds. */
const VOICED = ["humans", "undead", "goblins", "candy"] as const;
type VoicedFaction = (typeof VOICED)[number];

function voiced(faction: FactionId | null | undefined): VoicedFaction | null {
  return (VOICED as readonly string[]).includes(faction ?? "")
    ? (faction as VoicedFaction)
    : null;
}

/** Recruiting creatures of a faction (the generic recruit otherwise). */
export function recruitCue(faction: FactionId | null | undefined): SoundId {
  const f = voiced(faction);
  return f === null ? "recruit" : `recruit.${f}`;
}

/** A battle won by an army of this faction (the generic sting otherwise). */
export function victoryCue(faction: FactionId | null | undefined): SoundId {
  const f = voiced(faction);
  return f === null ? "victory" : `victory.${f}`;
}

/** A one-shot of town life on opening a town screen (none for others). */
export function townCue(faction: FactionId | null | undefined): SoundId | null {
  const f = voiced(faction);
  return f === null ? null : `town.${f}`;
}

/**
 * Visits that did nothing stay silent; these are the engine's words for
 * them (src/core/game/sites.ts).
 */
const NOTHING_HAPPENED =
  /already|nothing more|no room|is empty|occupied|knows of no|weathered blank|admit heroes|nothing to teach|is locked/i;

/**
 * The family sound of a map object visit (a `site` event) or of a choice
 * made there, or null: shrine chime for blessings and learning, treasure
 * for finds and plundered banks, coins for trade, a lock for keys and
 * gates, a fanfare for a quest done or a prisoner freed.
 */
export function siteCue(
  type: ObjectTypeId | null,
  text: string,
): SoundId | null {
  if (type === null || NOTHING_HAPPENED.test(text)) return null;
  switch (type) {
    case "seer-hut":
      return /quest complete/i.test(text) ? "site.quest" : null;
    case "quest-gate":
      return /quest complete/i.test(text) ? "site.gate" : null;
    case "keymasters-tent":
    case "border-gate":
      return "site.gate";
    case "two-way-waystone":
    case "one-way-waystone":
      return "site.waystone";
    case "trading-post":
    case "tollhouse":
    case "windmill":
    case "water-wheel":
    case "orchard":
      return "site.market";
    case "campfire":
    case "loose-artifact":
    case "loose-scroll":
    case "fallen-adventurer":
    case "sealed-box":
    case "event-tile":
    case "treasure-chest":
    case "overgrown-greenhouse":
    case "sealed-registry":
    case "stopped-belfry":
    case "quiet-yard":
    case "thunderstruck-pylon-yard":
    case "landfall-wreck":
    case "keepers-vault":
    case "frost-giants-barrow":
    case "pyramid":
    case "sunken-tomb":
      return "site.treasure";
    case "prison":
      return "site.quest";
    case "faction-outpost":
    case "stray-hut":
    case "caretaker-lodge":
    case "walrus-rookery":
      // Arriving flags the dwelling; a hire made there recruits.
      return /^Hired/.test(text)
        ? "recruit"
        : /flagged/.test(text)
          ? "map.flag"
          : null;
    case "sign":
      return null;
    default:
      // Shrines, stones, wells, schools, temples, the observatory and the
      // rest of the blessing and learning family.
      return "site.shrine";
  }
}
