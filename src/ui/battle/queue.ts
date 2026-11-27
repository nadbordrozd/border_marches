/**
 * The battle turn queue of the top bar (UI2-03, docs/design/UI_V2.md): the
 * next stacks to act as creature portraits in side-coloured frames, the
 * active one first and larger, then a "Round N" divider and the next
 * round's order. Pure: the screen draws it and maps `creatureId` to the
 * portrait.
 */

import {
  compareTurnOrder,
  getStack,
  isAlive,
} from "../../core/battle/index.ts";
import type {
  BattleSide,
  BattleState,
  Hex,
  StackId,
} from "../../core/battle/index.ts";
import { timelineEntries } from "./grammar.ts";
import { creatureName } from "./preview.ts";

/** One tile of the queue, or the divider before the next round. */
export type QueueEntry =
  | {
      readonly kind: "stack";
      /** Stable across refreshes: the stack id, with ":next" next round. */
      readonly key: string;
      readonly id: StackId;
      /** The side it fights for now (a Turned stack changes colour). */
      readonly side: BattleSide;
      /** The portrait to show (the creature's id). */
      readonly creatureId: string;
      readonly count: number;
      /** "Goblins", "Ogre". */
      readonly name: string;
      /** The stack acting now (drawn larger). */
      readonly now: boolean;
      /** The round of this turn. */
      readonly round: number;
      /** "waiting", conditions that move it in the order; "" when none. */
      readonly note: string;
      /** Its round-end turn (Afters): a second slot after the round's turns. */
      readonly afters: boolean;
    }
  | {
      readonly kind: "event";
      readonly key: string;
      readonly side: BattleSide;
      readonly label: string;
      readonly note: string;
      /**
       * A Mortar shell (FACTION_DWARVES 5, Lob): it sits on the round
       * boundary, after the divider, as it lands before any stack acts.
       */
      readonly shell?: {
        readonly hex: Hex;
        readonly round: number;
        readonly stackId: StackId;
      };
      /**
       * A ship's deck gun (NAVAL.md 3.3): drawn as a cannonball on the
       * round boundary, like a shell, as it fires before any stack acts.
       */
      readonly deckGun?: { readonly round: number; readonly harm: number };
    }
  | { readonly kind: "divider"; readonly key: string; readonly round: number };

/** The queue shows at most this many tiles (stacks and events). */
export const QUEUE_MAX = 8;

/** Widths in CSS pixels of the queue's parts (battle.css keeps them). */
export const QUEUE_TILE_W = 29;
export const QUEUE_NOW_W = 33;
export const QUEUE_DIVIDER_W = 64;

/** A count that fits a 24 px tile: 999, then 1.2k, 12k. */
export function queueCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 9950) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${Math.round(n / 1000)}k`;
}

/**
 * How many tiles fit in `width` CSS pixels: the active tile, the divider
 * and as many plain tiles as fit, never more than QUEUE_MAX and at least 1.
 */
export function queueSlots(width: number): number {
  const room = width - QUEUE_NOW_W - QUEUE_DIVIDER_W;
  const more = Math.floor(room / QUEUE_TILE_W);
  return Math.max(1, Math.min(QUEUE_MAX, 1 + Math.max(0, more)));
}

/**
 * The queue as the player sees it: this round's remaining turns (the active
 * stack first, then extra turns, the queue and waiting stacks; scheduled
 * events after them), then a divider and the next round's order, cut to
 * `slots` tiles. The divider only shows when a next-round tile follows it.
 * A finished battle shows this round's survivors with no active tile and
 * no next round; during deployment (round 0) the queue is round 1's order.
 */
export function turnQueue(
  state: BattleState,
  slots: number = QUEUE_MAX,
): QueueEntry[] {
  const out: QueueEntry[] = [];
  let tiles = 0;
  const over = state.winner !== null;
  const round = state.round;
  const timeline = timelineEntries(state);
  // Shells land at the start of the next round: they wait for the divider,
  // and keep their tiles however long this round is (one slot stays for
  // the active stack).
  // Deck guns (NAVAL.md 3.3) fire at the next round's start too.
  const boundary = (t: (typeof timeline)[number]): boolean =>
    t.kind === "event" &&
    (t.shell !== undefined ||
      (t.deckGun !== undefined && t.deckGun.round === round + 1));
  const landing: QueueEntry[] = over
    ? []
    : timeline.flatMap((t) =>
        boundary(t)
          ? [
              {
                kind: "event" as const,
                key: t.id,
                side: t.side,
                label: t.label,
                note: t.note,
                ...(t.shell !== undefined ? { shell: t.shell } : {}),
                ...(t.deckGun !== undefined ? { deckGun: t.deckGun } : {}),
              },
            ]
          : [],
      );
  const room = slots - Math.min(landing.length, Math.max(0, slots - 1));
  timeline.forEach((t, i) => {
    if (boundary(t)) return;
    if (tiles >= room) return;
    if (t.kind === "event") {
      out.push({
        kind: "event",
        key: t.id,
        side: t.side,
        label: t.label,
        note: t.note,
        ...(t.deckGun !== undefined ? { deckGun: t.deckGun } : {}),
      });
      tiles++;
      return;
    }
    const s = getStack(state, t.id);
    const now =
      i === 0 && !over && t.afters !== true && state.activeStackId === t.id;
    out.push({
      kind: "stack",
      key: t.afters === true ? `${t.id}:afters` : t.id,
      id: t.id,
      side: s.side,
      creatureId: s.creature.id,
      count: s.count,
      name: creatureName(s.creature, s.count),
      now,
      round,
      note: t.note,
      // Its second slot, or the Afters turn it is taking now.
      afters: t.afters === true || (now && s.aftersRound === round),
    });
    tiles++;
  });
  if (over || tiles >= slots) return out;
  const shells = landing.slice(0, Math.max(0, slots - tiles));
  tiles += shells.length;
  const next = state.stacks
    .filter(isAlive)
    .sort(compareTurnOrder)
    .slice(0, Math.max(0, slots - tiles));
  if (next.length === 0 && shells.length === 0) return out;
  out.push({ kind: "divider", key: "divider", round: round + 1 });
  out.push(...shells);
  for (const s of next) {
    out.push({
      kind: "stack",
      key: `${s.id}:next`,
      id: s.id,
      side: s.side,
      creatureId: s.creature.id,
      count: s.count,
      name: creatureName(s.creature, s.count),
      now: false,
      round: round + 1,
      note: "",
      afters: false,
    });
  }
  return out;
}
