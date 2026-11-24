/**
 * Drawable data for the battle grammar (RULES_V2.md 1.3 to 1.5): condition
 * pips, link lines and ground marks, read from a battle state. Glyphs and
 * colours are placeholders until the UI polish pass; colours follow the
 * five schools.
 */

import {
  conditionKind,
  getStack,
  groundKind,
  isAlive,
} from "../../core/battle/index.ts";
import type {
  BattleState,
  Hex,
  School,
  StackId,
} from "../../core/battle/index.ts";

/** One colour per school of the wheel (2.1). */
export const SCHOOL_COLORS: Readonly<Record<School, string>> = {
  bloom: "#6fdc3c",
  accord: "#f2c14e",
  clock: "#7fb8ff",
  hush: "#b48cff",
  storm: "#ff7a45",
};

export const REMAINS_COLOR = "#c9b79a";

/** Placeholder glyphs for the engine-standard kinds; others: first letter. */
const GLYPHS: Readonly<Record<string, string>> = {
  venomed: "V",
  burning: "B",
  frozen: "F",
  asleep: "Z",
  turned: "T",
  delayed: "D",
  hastened: "H",
  heartened: "+",
  shaken: "!",
  lucky: "L",
  jinxed: "J",
};

export function conditionGlyph(kind: string): string {
  return GLYPHS[kind] ?? conditionKind(kind).name.charAt(0).toUpperCase();
}

export interface ConditionPip {
  readonly uid: number;
  readonly kind: string;
  readonly glyph: string;
  readonly color: string;
  readonly bane: boolean;
}

export function pipOf(c: {
  readonly uid: number;
  readonly kind: string;
  readonly school: School;
  readonly polarity: "boon" | "bane";
}): ConditionPip {
  return {
    uid: c.uid,
    kind: c.kind,
    glyph: conditionGlyph(c.kind),
    color: SCHOOL_COLORS[c.school],
    bane: c.polarity === "bane",
  };
}

export function conditionPips(state: BattleState, id: StackId): ConditionPip[] {
  return getStack(state, id).conditions.map(pipOf);
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
