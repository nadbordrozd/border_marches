/**
 * Which effect a game moment makes. Pure functions, so the choices are
 * testable without audio.
 */
import type { BattleEvent, BattleState } from "../core/battle/types.ts";
import type { ResourceId } from "../core/map/types.ts";
import type { SoundId } from "./sound.ts";

/** Tier from which a creature's blows sound heavy. */
export const HEAVY_TIER = 4;
/** A blow that takes this share of the target stack's HP sounds heavy. */
export const HEAVY_SHARE = 0.5;

/**
 * The sound of a battle event, played as the event starts animating:
 * arrows on release, hits on impact (heavy for big creatures or crushing
 * blows), deaths when a stack falls. Other events are silent.
 */
export function battleCue(e: BattleEvent, before: BattleState): SoundId | null {
  switch (e.type) {
    case "shoot":
      return "battle.shot";
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
