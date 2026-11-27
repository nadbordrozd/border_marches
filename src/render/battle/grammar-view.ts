/**
 * Drawable data for the battle grammar (RULES_V2.md 1.3 to 1.5): condition
 * badges, link lines and ground marks, read from a battle state. Colours
 * follow the five schools.
 *
 * Condition badges (UI_V2 UI2-04): each condition shows as its 16 px icon
 * (`iconFor("condition", kind, 16)`, the art the keyword registry names) on
 * a small plate under the stack's count chip, at most {@link MAX_BADGES} and
 * a "+N" plate for the rest. Link lines are drawn only for links that touch
 * the active or the hovered stack.
 */

import {
  conditionKind,
  getStack,
  groundKind,
  isAlive,
  neighbors,
  pendingShells,
} from "../../core/battle/index.ts";
import type {
  BattleState,
  Hex,
  School,
  StackId,
} from "../../core/battle/index.ts";
import type { Point } from "./geometry.ts";

/** One colour per school of the wheel (2.1). */
export const SCHOOL_COLORS: Readonly<Record<School, string>> = {
  bloom: "#6fdc3c",
  accord: "#f2c14e",
  clock: "#7fb8ff",
  hush: "#b48cff",
  storm: "#ff7a45",
};

export const REMAINS_COLOR = "#c9b79a";

export interface ConditionPip {
  readonly uid: number;
  readonly kind: string;
  readonly color: string;
  readonly bane: boolean;
  /** A Hold (Frozen, Asleep, Turned): shown first. */
  readonly hold: boolean;
  /** One end of a link (Sworn, Challenged, ...): shown next. */
  readonly linked: boolean;
  /**
   * The size its badge shows in a corner, for a gauge whose size is the
   * point (Steam, FACTION_DWARVES 3); absent for the others.
   */
  readonly size?: number;
}

/** Condition kinds whose badge shows their size (Steam's 1 to 3). */
export const SIZED_BADGES: ReadonlySet<string> = new Set(["steam"]);

export function pipOf(c: {
  readonly uid: number;
  readonly kind: string;
  readonly school: School;
  readonly polarity: "boon" | "bane";
  readonly hold?: boolean;
  readonly link?: StackId | null;
  readonly size?: number;
}): ConditionPip {
  return {
    uid: c.uid,
    kind: c.kind,
    color: SCHOOL_COLORS[c.school],
    bane: c.polarity === "bane",
    hold: c.hold === true,
    linked: c.link !== undefined && c.link !== null,
    ...(SIZED_BADGES.has(c.kind) && c.size !== undefined
      ? { size: c.size }
      : {}),
  };
}

export function conditionPips(state: BattleState, id: StackId): ConditionPip[] {
  return getStack(state, id).conditions.map(pipOf);
}

/** Badges under one count chip at most; the rest are counted on a "+N". */
export const MAX_BADGES = 3;

/** Holds, then links, then banes, then boons; list order within each. */
export function badgeOrder<T extends ConditionPip>(pips: readonly T[]): T[] {
  const rank = (p: ConditionPip): number =>
    p.hold ? 0 : p.linked ? 1 : p.bane ? 2 : 3;
  return pips
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i)
    .map((x) => x.p);
}

/**
 * The badges one stack shows: Holds first, then links, then banes, then
 * boons (list order within each), at most {@link MAX_BADGES}, and how many
 * more it bears.
 */
export function badgeRow(pips: readonly ConditionPip[]): {
  readonly shown: readonly ConditionPip[];
  readonly more: number;
} {
  const sorted = badgeOrder(pips);
  return {
    shown: sorted.slice(0, MAX_BADGES),
    more: Math.max(0, sorted.length - MAX_BADGES),
  };
}

/** A badge plate: a 16 px icon inside a 1 px border. */
export const BADGE_SIZE = 18;
/** Pixels between plates. */
export const BADGE_GAP = 1;
/** Width of the "+N" plate. */
export const MORE_W = 20;
/** The count chip's offset from the feet and its height (renderer.ts). */
export const CHIP_DX = 4;
export const CHIP_DY = 2;
export const CHIP_H = 15;

export interface BadgeRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** The condition on this plate, or null for the "+N" plate. */
  readonly pip: ConditionPip | null;
  /** How many more conditions the "+N" plate stands for (0 on icons). */
  readonly more: number;
}

/**
 * Where a stack's badges sit, in stage pixels: one row just under the count
 * chip, from the chip's left edge.
 */
export function badgeRects(
  feet: Point,
  pips: readonly ConditionPip[],
): BadgeRect[] {
  const { shown, more } = badgeRow(pips);
  const y = Math.round(feet.y + CHIP_DY) + CHIP_H + 1;
  let x = Math.round(feet.x + CHIP_DX);
  const out: BadgeRect[] = [];
  for (const pip of shown) {
    out.push({ x, y, w: BADGE_SIZE, h: BADGE_SIZE, pip, more: 0 });
    x += BADGE_SIZE + BADGE_GAP;
  }
  if (more > 0) out.push({ x, y, w: MORE_W, h: BADGE_SIZE, pip: null, more });
  return out;
}

/** The stack whose badge row is under `p`, if any (the last drawn wins). */
export function badgeAt(
  units: Iterable<{
    readonly id: StackId;
    readonly x: number;
    readonly y: number;
    readonly visible: boolean;
    readonly count: number;
    readonly pips: readonly ConditionPip[];
  }>,
  p: Point,
): StackId | null {
  let hit: StackId | null = null;
  for (const u of units) {
    if (!u.visible || u.count <= 0) continue;
    const rects = badgeRects(u, u.pips);
    const first = rects[0];
    const last = rects[rects.length - 1];
    if (first === undefined || last === undefined) continue;
    // The whole row, gaps and borders included.
    if (
      p.x >= first.x - 1 &&
      p.x <= last.x + last.w &&
      p.y >= first.y - 1 &&
      p.y <= first.y + first.h
    )
      hit = u.id;
  }
  return hit;
}

export interface LinkLine {
  readonly near: StackId;
  readonly far: StackId;
  readonly color: string;
  readonly label: string;
}

/** Every link on the field, drawn from its near end to its far end. */
export function linkLines(state: BattleState): LinkLine[] {
  const out: LinkLine[] = [];
  for (const s of state.stacks) {
    if (!isAlive(s)) continue;
    for (const c of s.conditions) {
      if (c.link === null) continue;
      out.push({
        near: s.id,
        far: c.link,
        color: SCHOOL_COLORS[c.school],
        label: conditionKind(c.kind).name,
      });
    }
  }
  return out;
}

/**
 * The links worth drawing now: those with an end at the active or the
 * hovered stack. Every other link is told by its badge (Sworn, Challenged)
 * and shows its line when either end is pointed at.
 */
export function visibleLinks(
  links: readonly LinkLine[],
  activeId: StackId | null,
  hoverId: StackId | null,
): LinkLine[] {
  const on = (id: StackId): boolean => id === activeId || id === hoverId;
  return links.filter((l) => on(l.near) || on(l.far));
}

export interface GroundMark {
  readonly hex: Hex;
  readonly kind: string;
  readonly color: string;
  readonly glyph: string;
}

/** Non-blocking ground, for the hex tint (rocks have their own art). */
export function groundMarks(state: BattleState): GroundMark[] {
  return state.ground
    .filter((g) => g.class !== "blocking")
    .map((g) => ({
      hex: g.hex,
      kind: g.kind,
      color: g.school ? SCHOOL_COLORS[g.school] : REMAINS_COLOR,
      glyph: groundKind(g.kind).name.charAt(0).toUpperCase(),
    }));
}

/**
 * A shell in the air (FACTION_DWARVES 5, Lob): its target hex, the hexes
 * its splash reaches, the round at whose start it lands and the side that
 * lobbed it. Drawn on the field from the moment it is lobbed.
 */
export interface ShellMark {
  readonly hex: Hex;
  readonly splash: readonly Hex[];
  readonly round: number;
  readonly stackId: StackId;
}

/** The shells in the air, in order of landing (`pendingShells`). */
export function shellMarks(state: BattleState): ShellMark[] {
  return pendingShells(state).map((p) => ({
    hex: p.hex,
    splash: neighbors(p.hex),
    round: p.round,
    stackId: p.stackId,
  }));
}
