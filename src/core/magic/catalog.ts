/**
 * The adventure spells as data (CONTENT_SPELLS.md section 4) and one index
 * over every spell, battle and adventure, for books, guilds and the UI.
 * Their effects are in adventure.ts.
 */

import type { School } from "../battle/index.ts";
import { BATTLE_SPELLS } from "./spells.ts";

export type AdventureTargetKind =
  /** No choice. */
  | "none"
  /** A neutral stack adjacent to the hero. */
  | "adjacentMonster"
  /** An explored cell within 15 cells. */
  | "exploredCell"
  /** An enemy hero or a sealed site within range. */
  | "sealed"
  /** A number of movement points. */
  | "amount"
  /** A pylon the player has visited. */
  | "pylon";

export interface AdventureSpellDef {
  readonly id: string;
  readonly name: string;
  readonly school: School;
  readonly tier: 1 | 2 | 3 | 4 | 5;
  readonly mana: number;
  /** Movement points it costs besides mana ("all" for Tow Line). */
  readonly moveCost?: number | "all";
  readonly target: AdventureTargetKind;
  /** The scaling number, or null. */
  readonly scale: { readonly base: number; readonly per: number } | null;
  /** Scales as base + floor(P / 2) (Ask the Dead). */
  readonly halfPower?: boolean;
  /** v0.2 maps have no site this spell needs: it always refuses. */
  readonly deferred?: string;
  text(p: number): string;
}

export function adventureScale(s: AdventureSpellDef, p: number): number {
  if (!s.scale) return 0;
  return s.halfPower
    ? s.scale.base + Math.floor(p / 2)
    : s.scale.base + s.scale.per * p;
}

const A = (d: AdventureSpellDef): AdventureSpellDef => d;

export const ADVENTURE_SPELLS: readonly AdventureSpellDef[] = [
  A({
    id: "green-road",
    name: "Green Road",
    school: "bloom",
    tier: 2,
    mana: 7,
    target: "none",
    scale: null,
    text: () =>
      "Until the day ends this hero may enter forest at a move cost of 200; in forest at day end it goes back to its last clear cell.",
  }),
  A({
    id: "second-helping",
    name: "Second Helping",
    school: "bloom",
    tier: 3,
    mana: 10,
    target: "none",
    scale: { base: 100, per: 40 },
    text: (p) =>
      `The map dwelling the hero stands on (flying your flag) gains creatures worth ${100 + 40 * p} fight value (once a week per dwelling).`,
  }),
  A({
    id: "parley",
    name: "Parley",
    school: "accord",
    tier: 3,
    mana: 10,
    target: "adjacentMonster",
    scale: { base: 300, per: 150 },
    text: (p) =>
      `An adjacent neutral stack of fight value at most ${300 + 150 * p} has no zone of control against you today.`,
  }),
  A({
    id: "read-the-seal",
    name: "Read the Seal",
    school: "accord",
    tier: 1,
    mana: 4,
    target: "sealed",
    scale: { base: 6, per: 1 },
    text: (p) =>
      `Within ${6 + p} cells: show an enemy hero's pages, scrolls, mana and backpack, or a sealed site's contents.`,
  }),
  A({
    id: "borrowed-day",
    name: "Borrowed Day",
    school: "clock",
    tier: 3,
    mana: 10,
    target: "none",
    scale: { base: 300, per: 50 },
    text: (p) =>
      `Gain ${Math.min(1000, 300 + 50 * p)} movement now; start tomorrow with that much less.`,
  }),
  A({
    id: "saved-hour",
    name: "Saved Hour",
    school: "clock",
    tier: 1,
    mana: 4,
    moveCost: 0,
    target: "amount",
    scale: { base: 200, per: 50 },
    text: (p) =>
      `Give up to ${200 + 50 * p} of today's movement to have it tomorrow (cap 3000).`,
  }),
  A({
    id: "ask-the-dead",
    name: "Ask the Dead",
    school: "hush",
    tier: 1,
    mana: 4,
    target: "exploredCell",
    scale: { base: 4, per: 0 },
    halfPower: true,
    text: (p) =>
      `Reveal a disc of radius ${4 + Math.floor(p / 2)} around an explored cell within 15 cells.`,
  }),
  A({
    id: "dowse",
    name: "Dowse",
    school: "hush",
    tier: 2,
    mana: 7,
    target: "none",
    scale: { base: 5, per: 1 },
    text: (p) =>
      `Mark every buried cache and the buried Keystone within ${5 + p} cells.`,
  }),
  A({
    id: "tow-line",
    name: "Tow Line",
    school: "storm",
    tier: 4,
    mana: 14,
    moveCost: "all",
    target: "pylon",
    scale: null,
    text: () =>
      "From a pylon, move to any pylon you have visited (all movement, at least 300).",
  }),
  A({
    id: "opening-salvo",
    name: "Opening Salvo",
    school: "storm",
    tier: 2,
    mana: 7,
    moveCost: 100,
    target: "adjacentMonster",
    scale: { base: 30, per: 15 },
    text: (p) =>
      `An adjacent neutral stack takes Harm ${30 + 15 * p} before any battle (no XP).`,
  }),
];

const ADV = new Map(ADVENTURE_SPELLS.map((s) => [s.id, s]));

export function adventureSpell(id: string): AdventureSpellDef {
  const s = ADV.get(id);
  if (!s) throw new Error(`unknown adventure spell ${id}`);
  return s;
}

export function isAdventureSpell(id: string): boolean {
  return ADV.has(id);
}

/** What books, guilds and the UI need to know about any spell. */
export interface SpellInfo {
  readonly id: string;
  readonly name: string;
  readonly school: School;
  readonly tier: number;
  readonly mana: number;
  readonly kind: "battle" | "adventure";
  readonly tool: boolean;
  /** Drawn by guilds and shrines. */
  readonly pool: boolean;
  text(p: number): string;
}

const INFO = new Map<string, SpellInfo>([
  ...BATTLE_SPELLS.map((s): [string, SpellInfo] => [
    s.id,
    {
      id: s.id,
      name: s.name,
      school: s.school,
      tier: s.tier,
      mana: s.mana,
      kind: "battle",
      tool: s.tool === true,
      pool: s.pool !== false,
      text: (p) => s.text(p),
    },
  ]),
  ...ADVENTURE_SPELLS.map((s): [string, SpellInfo] => [
    s.id,
    {
      id: s.id,
      name: s.name,
      school: s.school,
      tier: s.tier,
      mana: s.mana,
      kind: "adventure",
      tool: false,
      pool: true,
      text: (p) => s.text(p),
    },
  ]),
]);

export function spellInfo(id: string): SpellInfo {
  const s = INFO.get(id);
  if (!s) throw new Error(`unknown spell ${id}`);
  return s;
}

export function isSpell(id: string): boolean {
  return INFO.has(id);
}

/** Every spell, battle then adventure. */
export function allSpells(): SpellInfo[] {
  return [...INFO.values()];
}

/** Scroll value in gold by tier (CONTENT_SPELLS 1). */
export const SCROLL_VALUE: readonly number[] = [0, 300, 600, 1000, 1500, 2500];
