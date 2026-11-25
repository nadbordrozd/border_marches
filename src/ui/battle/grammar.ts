/**
 * How the battle grammar is shown (RULES_V2.md 1.13): condition pips and
 * tooltips, links, ground, the timeline, the rehearsed step chain and enemy
 * intents, as plain data and text. Pure: the screen and renderer draw it.
 * Glyphs are placeholders until the UI polish pass.
 */

import {
  ability,
  act,
  conditionKind,
  getStack,
  groundKind,
  hasAbility,
  hasAct,
  hexIndex,
  isAlive,
  turnOrder,
} from "../../core/battle/index.ts";
import type {
  BattleEvent,
  BattleSide,
  BattleState,
  Condition,
  GroundFeature,
  Intent,
  School,
  StackId,
} from "../../core/battle/index.ts";
import { creatureName } from "./preview.ts";

export {
  SCHOOL_COLORS,
  conditionGlyph,
  conditionPips,
  groundMarks,
  linkLines,
} from "../../render/battle/grammar-view.ts";
export type {
  ConditionPip,
  GroundMark,
  LinkLine,
} from "../../render/battle/grammar-view.ts";

const SCHOOL_NAMES: Readonly<Record<School, string>> = {
  bloom: "Bloom",
  accord: "Accord",
  clock: "Clock",
  hush: "Hush",
  storm: "Storm",
};

function abilityName(id: string): string {
  return hasAbility(id) ? ability(id).name : id;
}

function actName(id: string): string {
  return hasAct(id) ? act(id).name : id;
}

function clockLabel(clock: number | null): string {
  return clock === null
    ? "until the battle ends"
    : `${clock} round${clock === 1 ? "" : "s"} left`;
}

/**
 * "Venomed (Bloom bane, size 3, 2 rounds left): -3 Defense (never below 0)
 * for 2 rounds."
 */
export function conditionTooltip(state: BattleState, c: Condition): string {
  const def = conditionKind(c.kind);
  const bits = [`${SCHOOL_NAMES[c.school]} ${c.polarity}`];
  if (c.hold) bits.push("Hold");
  if (c.size !== 0) bits.push(`size ${c.size}`);
  bits.push(clockLabel(c.clock));
  if (c.gate)
    bits.push(
      c.gate.measure === "hp"
        ? `gate ${c.gate.max} HP`
        : `gate tier ${c.gate.max}`,
    );
  let text = `${def.name} (${bits.join(", ")}): ${def.text(c)}`;
  if (c.link !== null) {
    const far = state.stacks.find((s) => s.id === c.link);
    if (far) text += ` Linked to ${creatureName(far.creature, far.count)}.`;
  }
  return text;
}

export function groundTooltip(g: GroundFeature): string {
  const def = groundKind(g.kind);
  const clock = g.clock === null ? "" : ` (${clockLabel(g.clock)})`;
  return `${def.name}${clock}: ${def.text(g)}`;
}

export function groundAtIndex(
  state: BattleState,
  index: number,
): GroundFeature | null {
  return state.ground.find((g) => hexIndex(g.hex) === index) ?? null;
}

export interface TimelineEntry {
  readonly kind: "stack" | "event";
  readonly id: string;
  readonly label: string;
  readonly side: BattleSide;
  readonly note: string;
}

/**
 * The visible timeline of this round (1.6): stacks in the order they will
 * act (extra turns, then the queue and waiting stacks by timeline class),
 * then the scheduled events still due this round.
 */
export function timelineEntries(state: BattleState): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  for (const id of turnOrder(state)) {
    const s = getStack(state, id);
    if (!isAlive(s)) continue;
    const notes: string[] = [];
    if (state.waiting.includes(id)) notes.push("waiting");
    for (const c of s.conditions) {
      const t = conditionKind(c.kind).timelineClass;
      if (t === "last") notes.push(conditionKind(c.kind).name);
      if (t === "first") notes.push(conditionKind(c.kind).name);
    }
    out.push({
      kind: "stack",
      id,
      label: `${creatureName(s.creature, s.count)} ${s.count}`,
      side: s.side,
      note: notes.join(", "),
    });
  }
  for (const e of state.scheduled) {
    out.push({
      kind: "event",
      id: `e${e.id}`,
      label: `${e.effect.id} (round ${e.round} ${e.phase})`,
      side: e.side,
      note: e.source,
    });
  }
  return out;
}

/** Names as the chain prints them, read from the state before the action. */
function namer(state: BattleState): (id: StackId) => string {
  return (id) => {
    const s = state.stacks.find((x) => x.id === id);
    return s ? creatureName(s.creature, Math.max(1, s.count)) : id;
  };
}

/**
 * One line per step of a rehearsed chain, e.g. "Trolls strike Triceratops
 * 140 → link → Ogres". Engine bookkeeping (turn starts) is left out.
 */
export function chainLines(
  before: BattleState,
  events: readonly BattleEvent[],
): string[] {
  const name = namer(before);
  const out: string[] = [];
  for (const e of events) {
    switch (e.type) {
      case "damage": {
        const verb = e.kind === "retaliation" ? "retaliate on" : "strike";
        let line = `${name(e.sourceId)} ${verb} ${name(e.targetId)} ${e.damage}`;
        if (e.redirectedTo !== null)
          line += ` → link → ${name(e.redirectedTo)}`;
        else if (e.countAfter === 0) line += `, all killed`;
        else if (e.kills > 0) line += `, ${e.kills} killed`;
        out.push(line);
        break;
      }
      case "harm": {
        let line = `${name(e.targetId)} take ${e.harm} Harm`;
        if (e.redirectedTo !== null)
          line += ` → link → ${name(e.redirectedTo)}`;
        else if (e.countAfter === 0) line += `, all killed`;
        else if (e.kills > 0) line += `, ${e.kills} killed`;
        out.push(line);
        break;
      }
      case "linkTransfer":
        out.push(
          e.excess > 0
            ? `link carries ${e.amount} to ${name(e.farId)}; ${e.excess} comes back`
            : `link carries ${e.amount} to ${name(e.farId)}`,
        );
        break;
      case "death":
        out.push(`${name(e.stackId)} destroyed`);
        break;
      case "condition": {
        const kind = conditionKind(e.condition.kind).name;
        const who = name(e.stackId);
        const text: Record<typeof e.change, string> = {
          landed: `${kind} on ${who}`,
          merged: `${kind} on ${who} refreshed`,
          displaced: `${kind} pushed off ${who}`,
          refused: `${kind} refused by ${who}${e.detail ? ` (${e.detail})` : ""}`,
          moved: `${kind} moves to ${who}`,
          copied: `${kind} copied to ${who}`,
          fed: `${kind} on ${who} grows to ${e.condition.size}`,
          wound: `${kind} on ${who}: clock ${e.condition.clock ?? "-"}`,
          setOff: `${kind} on ${who} set off`,
          expired: `${kind} on ${who} expires`,
          ended: `${kind} on ${who} ends`,
        };
        out.push(text[e.change]);
        break;
      }
      case "heal":
        out.push(
          `${name(e.stackId)} healed ${e.amount}${e.revived > 0 ? `, ${e.revived} back` : ""}`,
        );
        break;
      case "wary":
        out.push(`${name(e.stackId)} Wary for ${e.rounds - 1} more rounds`);
        break;
      case "extraTurn":
        out.push(
          e.granted
            ? `${name(e.stackId)} gain an extra turn`
            : `${name(e.stackId)}: no second extra turn`,
        );
        break;
      case "ground":
        if (e.change !== "ended")
          out.push(
            `${groundKind(e.feature.kind).name} ${e.change} at ${e.feature.hex.col},${e.feature.hex.row}`,
          );
        break;
      case "summon":
        out.push(`summoned: ${e.stackId}`);
        break;
      case "contentError":
        out.push(`content error: ${e.message}`);
        break;
      case "move": {
        const n = e.path.length;
        const hexes = `${n} hex${n === 1 ? "" : "es"}`;
        if (e.mode === "push" || e.mode === "pull")
          out.push(
            n === 0
              ? `${name(e.stackId)} cannot be ${e.mode}ed`
              : `${name(e.stackId)} ${e.mode}ed ${hexes}`,
          );
        else if (e.mode === "swap") {
          // A swap emits one move per stack: name the pair once.
          const other = events.find(
            (x) =>
              x !== e &&
              x.type === "move" &&
              x.mode === "swap" &&
              x.index === e.index + 1,
          );
          if (other && other.type === "move")
            out.push(
              `${name(e.stackId)} swap places with ${name(other.stackId)}`,
            );
        } else if (e.mode === "teleport")
          out.push(`${name(e.stackId)} teleport`);
        else if (e.rule === "engine:walk-after")
          out.push(`${name(e.stackId)} step away ${hexes}`);
        break;
      }
      case "ability":
        out.push(`${name(e.stackId)}: ${abilityName(e.ability)}`);
        break;
      case "heroAct":
        if (!e.cast) out.push(`${actName(e.act)}`);
        break;
      case "shootHex":
        out.push(`${name(e.stackId)} bomb ${e.at.col},${e.at.row}`);
        break;
      case "getUp":
        out.push(`${name(e.stackId)} get up (${e.count})`);
        break;
      default:
        break;
    }
  }
  return out;
}

export interface IntentMarker {
  readonly stackId: StackId;
  readonly target: StackId | null;
  readonly text: string;
}

/** A short marker per enemy intent: "→ Raptors 42" / "moves" / "defends". */
export function intentMarkers(
  state: BattleState,
  intents: readonly Intent[],
): IntentMarker[] {
  const name = namer(state);
  return intents.map((it) => {
    const a = it.action;
    if (a === null || it.rehearsal === null) {
      return {
        stackId: it.stackId,
        target: null,
        text: `${conditionKind(it.skippedBy ?? "frozen").name}: skips`,
      };
    }
    if (a.type === "attack" || a.type === "shoot") {
      const hit = it.rehearsal.steps.find(
        (e) => e.type === "damage" && e.sourceId === it.stackId,
      );
      const dmg = hit && hit.type === "damage" ? ` ${hit.damage}` : "";
      return {
        stackId: it.stackId,
        target: a.targetId,
        text: `${a.type === "shoot" ? "shoot" : "attack"} → ${name(a.targetId)}${dmg}`,
      };
    }
    return {
      stackId: it.stackId,
      target: null,
      text:
        a.type === "move" ? "move" : a.type === "defend" ? "defend" : a.type,
    };
  });
}
