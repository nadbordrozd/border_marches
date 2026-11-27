/**
 * What an adventure spell can be aimed at (bead bzc.47), free of the DOM:
 * the target type in plain words, every valid map target (the cell to
 * highlight and the target to cast with), and why a spell with no target
 * cannot be chosen. Neutral stacks, heroes and sites are tested by the
 * game's own `castAdventureSpell`, so what glows is what may be cast.
 */

import { inSight } from "../core/game/index.ts";
import type { GameState, HeroState } from "../core/game/index.ts";
import { getCreature } from "../data/creatures.ts";
import {
  ASK_RANGE,
  MONSTER_SPELL_RANGE,
  adventureCastError,
  adventurePower,
  adventureSpell,
  castAdventureSpell,
  monstersInSpellRange,
  scuttleTargets,
  towLineStops,
} from "../core/magic/index.ts";
import type {
  AdventureTarget,
  AdventureTargetKind,
} from "../core/magic/index.ts";
import type { TargetKind } from "./battle/spell-targets.ts";

/** One valid target on the map. */
export interface AdventureAim {
  readonly x: number;
  readonly y: number;
  /** "12 Goblins", "Lady Mirra", "pylon at 30,12". */
  readonly label: string;
  readonly target: AdventureTarget;
  /**
   * Legal, but the cast would change nothing there (Ask the Dead on a
   * cell whose whole disc is explored): why. Such aims do not glow.
   */
  readonly noEffect?: string;
}

/** An adventure target kind in plain words with its icon. */
export function adventureTargetKind(kind: AdventureTargetKind): TargetKind {
  switch (kind) {
    case "none":
      return { icon: "self", label: "The hero (no aiming)" };
    case "nearbyMonster":
      return {
        icon: "enemy",
        label: `A neutral stack within ${MONSTER_SPELL_RANGE} cells`,
      };
    case "exploredCell":
      return {
        icon: "area",
        label: `An explored cell within ${ASK_RANGE} cells`,
      };
    case "sealed":
      return { icon: "enemy", label: "An enemy hero or a sealed site nearby" };
    case "amount":
      return { icon: "self", label: "The hero's own movement (an amount)" };
    case "pylon":
      return { icon: "hex", label: "Another pylon you have marked" };
    case "ship":
      return { icon: "enemy", label: "An empty ship within reach" };
  }
}

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** The game accepts this cast (the effect's own refusals included). */
function accepts(
  state: GameState,
  hero: HeroState,
  spellId: string,
  scroll: boolean,
  target: AdventureTarget,
): string | null {
  const r = castAdventureSpell(state, hero.id, spellId, target, { scroll });
  return r.ok ? null : r.message;
}

/**
 * Every valid map target of a spell that is aimed on the map or at a
 * listed destination, or null for a spell without one (none, amount).
 * Empty when it has a target type but nothing qualifies now.
 */
export function adventureAims(
  state: GameState,
  hero: HeroState,
  spellId: string,
  scroll: boolean,
): AdventureAim[] | null {
  const s = adventureSpell(spellId);
  switch (s.target) {
    case "none":
    case "amount":
      return null;
    case "nearbyMonster":
      return monstersInSpellRange(state, hero)
        .filter(
          (m) =>
            accepts(state, hero, spellId, scroll, { monsterId: m.id }) === null,
        )
        .map((m) => ({
          x: m.x,
          y: m.y,
          label: `${m.count} ${getCreature(m.creature).name}`,
          target: { monsterId: m.id },
        }));
    case "sealed": {
      const range = 6 + adventurePower(hero, spellId, scroll);
      const heroes: AdventureAim[] = state.heroes
        .filter(
          (h) =>
            h.alive &&
            h.owner !== hero.owner &&
            chebyshev(h.x, h.y, hero.x, hero.y) <= range,
        )
        .map((h) => ({
          x: h.x,
          y: h.y,
          label: h.name,
          target: { heroId: h.id },
        }));
      const sites: AdventureAim[] = state.map.objects
        .filter(
          (o) =>
            o.data.sealed === true &&
            chebyshev(o.x, o.y, hero.x, hero.y) <= range,
        )
        .map((o) => ({
          x: o.x,
          y: o.y,
          label: o.id,
          target: { objectId: o.id },
        }));
      return [...heroes, ...sites];
    }
    case "pylon":
      return towLineStops(state, hero).map((o) => ({
        x: o.x,
        y: o.y,
        label: `pylon at ${o.x},${o.y}`,
        target: { objectId: o.id },
      }));
    case "ship":
      // Scuttle (NAVAL 7.1): every empty ship in reach, anyone's.
      return scuttleTargets(
        state,
        hero,
        adventurePower(hero, spellId, scroll),
      ).map((ship) => ({
        x: ship.x,
        y: ship.y,
        label: `${ship.owner === hero.owner ? "your" : ship.owner === null ? "a neutral" : "an enemy"} ship at ${ship.x},${ship.y}`,
        target: { shipId: ship.id },
      }));
    case "exploredCell": {
      const player = state.players.find((p) => p.id === hero.owner);
      if (!player) return [];
      const { width: w, height: h } = state.map;
      const explored = player.explored;
      // The disc Ask the Dead reveals (adventure.ts): 4 + floor(P / 2).
      const r = 4 + Math.floor(adventurePower(hero, spellId, scroll) / 2);
      const revealsSome = (cx: number, cy: number): boolean => {
        for (let y = Math.max(0, cy - r); y <= Math.min(h - 1, cy + r); y++)
          for (let x = Math.max(0, cx - r); x <= Math.min(w - 1, cx + r); x++)
            if (inSight(x - cx, y - cy, r) && explored[y * w + x] !== true)
              return true;
        return false;
      };
      const out: AdventureAim[] = [];
      for (
        let y = Math.max(0, hero.y - ASK_RANGE);
        y <= Math.min(h - 1, hero.y + ASK_RANGE);
        y++
      )
        for (
          let x = Math.max(0, hero.x - ASK_RANGE);
          x <= Math.min(w - 1, hero.x + ASK_RANGE);
          x++
        )
          if (explored[y * w + x] === true)
            out.push({
              x,
              y,
              label: `${x},${y}`,
              target: { x, y },
              ...(revealsSome(x, y)
                ? {}
                : { noEffect: "everything around it is already explored" }),
            });
      return out;
    }
  }
}

/** Why a spell with a target type has nothing to aim at. */
function noAimReason(
  state: GameState,
  hero: HeroState,
  spellId: string,
  scroll: boolean,
): string {
  const s = adventureSpell(spellId);
  switch (s.target) {
    case "nearbyMonster": {
      const near = monstersInSpellRange(state, hero);
      if (near.length === 0)
        return `No neutral stack within ${MONSTER_SPELL_RANGE} cells`;
      const why = accepts(state, hero, spellId, scroll, {
        monsterId: near[0]?.id ?? "",
      });
      return why ? `No stack nearby it can take: ${why}` : "No valid target";
    }
    case "sealed":
      return `No enemy hero or sealed site within ${6 + adventurePower(hero, spellId, scroll)} cells`;
    case "pylon":
      return "No other pylon your player has marked";
    case "exploredCell":
      return "No explored cell in range";
    case "ship":
      return "No empty ship in reach";
    default:
      return "No valid target";
  }
}

export interface AdventureUsable {
  /** Why it cannot be chosen now, or null. */
  readonly reason: string | null;
  /** Its valid targets, or null when it takes none. */
  readonly aims: readonly AdventureAim[] | null;
}

/**
 * Whether a page or scroll can be chosen now: the game's own refusal
 * (mana, once a day, movement) first, then "nothing to aim at".
 */
export function adventureUsable(
  state: GameState,
  hero: HeroState,
  spellId: string,
  scroll: boolean,
): AdventureUsable {
  const err = adventureCastError(state, hero, spellId, scroll);
  if (err !== null) return { reason: sentence(err), aims: null };
  const s = adventureSpell(spellId);
  if (s.target === "amount") {
    const max = Math.min(
      hero.mp,
      200 + 50 * adventurePower(hero, spellId, scroll),
    );
    return { reason: max < 1 ? "No movement left to save" : null, aims: null };
  }
  const aims = adventureAims(state, hero, spellId, scroll);
  if (aims !== null && aims.length === 0)
    return { reason: noAimReason(state, hero, spellId, scroll), aims };
  if (aims !== null && aims.every((a) => a.noEffect !== undefined))
    return {
      reason:
        s.target === "exploredCell"
          ? "Would have no effect: everything in reach is already explored"
          : `Would have no effect: ${aims[0]?.noEffect ?? "nothing would change"}`,
      aims,
    };
  return { reason: null, aims };
}

/** "needs 6 mana, the hero has 2" → "Needs 6 mana, the hero has 2". */
function sentence(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The line under the map while a spell is aimed. */
export function aimHint(spellId: string): string {
  const s = adventureSpell(spellId);
  const what =
    s.target === "nearbyMonster"
      ? "a glowing neutral stack"
      : s.target === "sealed"
        ? "a glowing enemy hero or sealed site"
        : s.target === "exploredCell"
          ? `a glowing cell (explored, within ${ASK_RANGE} cells)`
          : s.target === "ship"
            ? "a glowing empty ship"
            : "a glowing target";
  return `${s.name}: click ${what} to cast. Esc cancels.`;
}
