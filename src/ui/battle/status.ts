/**
 * The battle status line (bead UI2-05, pure, unit tested): one sentence that
 * says what a click does right now, in every mode, as in Heroes' status
 * bar. "Move here (3 hexes)", "Attack Ogres: 52 damage, 2 killed · they
 * strike back: 30 damage, 1 killed", "Choose an enemy stack for Nettle (Esc
 * to cancel)", "Cast Nettle on Goblins · Goblins: −42 HP, 3 killed".
 *
 * The rules of the controls live in the battle's Keys help, not here.
 */

import { activeStack, getStack } from "../../core/battle/index.ts";
import type { BattleState } from "../../core/battle/index.ts";
import type { HoverIntent } from "./intent.ts";
import type { CastPreview } from "./magic.ts";
import {
  conjugate,
  creatureName,
  strikeHeadline,
  summarizePreview,
} from "./preview.ts";

/**
 * The battle's Keys help (?): the controls, and the click rules the
 * bottom panel used to repeat.
 */
export const BATTLE_KEYS: ReadonlyArray<readonly [string, string]> = [
  [
    "Click",
    "What the status line says: a shaded hex moves there; an enemy is attacked from the side the pointer is on, or shot; a ⇄ partner swaps places",
  ],
  ["Right-click", "A stack's details; leaves a chosen spell or act"],
  ["Hover", "An enemy shows the exact damage, kills and retaliation"],
  [
    "1–9, C, H",
    "The action bar: abilities, pages, the Command, items, Heartened",
  ],
  ["B", "Spellbook"],
  ["W", "Wait: act again later this round"],
  ["D", "Defend: +30% Defense until the stack's next turn"],
  ["U", "Take back the last action this round"],
  ["Enter", "Use or cast what is chosen"],
  ["Backspace", "Back one target"],
  ["Esc", "Cancel the chosen spell or act; close a panel"],
  ["A", "Auto-combat on or off"],
  ["S", "Animation speed"],
  ["Space", "Skip the animation"],
  ["?", "This list"],
];

/** How the line is coloured. */
export type StatusTone =
  /** A click does something: move, cast, use. */
  | "go"
  /** A click attacks. */
  | "attack"
  /** Nothing to click here, or the click does nothing. */
  | "idle"
  /** The click is refused or changes nothing. */
  | "warn"
  /** The enemy (or the AI) is acting. */
  | "enemy";

export interface StatusLine {
  readonly text: string;
  readonly tone: StatusTone;
}

/**
 * A chosen spell, page, ability, Command or item act being aimed: what
 * the next click picks and what the pointer is on.
 */
export interface ActStatus {
  /** "Nettle", "Swear In", "Bomb". */
  readonly name: string;
  /** "Cast" for spells and pages; "Use" for abilities and acts. */
  readonly verb: "Cast" | "Use";
  /**
   * The next step's prompt ("Choose an enemy stack."), or null when every
   * target is chosen and the act waits for Enter.
   */
  readonly prompt: string | null;
  /** Where the next pick is made: on the field, or in the side panel. */
  readonly pickIn: "field" | "panel";
  /** Valid targets of the next step on the field (0: nothing to aim at). */
  readonly valid: number | null;
  /** Why nothing can be aimed at, when `valid` is 0. */
  readonly noTarget: string | null;
  /** What the pointer is on. */
  readonly hover: ActHover;
}

export type ActHover =
  | { readonly kind: "none" }
  /**
   * A valid target: `what` names it ("Goblins", "this hex"); `preview` is
   * the rehearsal when this click completes the act, else null.
   */
  | {
      readonly kind: "target";
      readonly what: string;
      readonly preview: CastPreview | null;
      /** The click picks a stack whose condition is chosen next. */
      readonly thenCondition?: boolean;
    }
  /** A legal target on which the act would change nothing. */
  | {
      readonly kind: "no-effect";
      readonly what: string;
      readonly reason: string;
    }
  /** A hex that is no target of this step. */
  | { readonly kind: "invalid" };

/** What the screen is doing, for the status line. */
export type StatusMode =
  | { readonly kind: "over" }
  /** The enemy side's stack acts. */
  | { readonly kind: "enemy" }
  /** Auto-combat plays the player's side. */
  | { readonly kind: "auto" }
  /** The player's stack, but an animation is running. */
  | { readonly kind: "busy" }
  /** The player's turn, nothing chosen: the pointer's intent. */
  | {
      readonly kind: "turn";
      readonly intent: HoverIntent;
      /** A linked partner may be swapped with (Sworn). */
      readonly swaps: boolean;
      /** The attack is followed by a step (Hit and Run). */
      readonly stepAfter: number;
    }
  /** A spell or act is being aimed. */
  | { readonly kind: "act"; readonly act: ActStatus }
  /** Hit and Run: the step after the attack (hexes of the hovered step). */
  | { readonly kind: "after"; readonly hexes: number | null };

const lowerFirst = (s: string): string =>
  s.charAt(0).toLowerCase() + s.slice(1);
const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;
const ESC = "(Esc to cancel)";

/** "Ogres ×12": the stack by name and count. */
function stackLabel(state: BattleState, id: string): string {
  const s = getStack(state, id);
  return `${creatureName(s.creature, s.count)} ×${s.count}`;
}

/** The sentence for the player's turn with nothing chosen. */
function turnLine(
  state: BattleState,
  mode: Extract<StatusMode, { kind: "turn" }>,
): StatusLine {
  const it = mode.intent;
  const a = activeStack(state);
  const who = a ? stackLabel(state, a.id) : "";
  switch (it.kind) {
    case "move": {
      const n = it.path.length;
      return { text: `Move here (${plural(n, "hex", "hexes")})`, tone: "go" };
    }
    case "swap":
      return {
        text: `Swap places with the ${creatureName(it.partner.creature, it.partner.count)} (in place of the walk; ends the turn)`,
        tone: "go",
      };
    case "attack": {
      const s = summarizePreview(state, it.preview);
      const parts: string[] = [];
      let head = `${s.verb} ${s.target}`;
      if (it.action.swapWith !== undefined) {
        const p = getStack(state, it.action.swapWith);
        head = `Swap with the ${creatureName(p.creature, p.count)}, then ${lowerFirst(head)}`;
      }
      if (s.strike === null) {
        parts.push(head, s.noStrike ?? "it never lands");
        return { text: parts.join(" · "), tone: "warn" };
      }
      parts.push(`${head}: ${strikeHeadline(s.strike)}`);
      const target = getStack(state, it.action.targetId);
      if (s.retaliation) {
        const they = target.count === 1 ? "it" : "they";
        parts.push(
          `${they} ${conjugate("strike", target.count)} back: ${strikeHeadline(s.retaliation)}`,
        );
      } else parts.push(s.noRetaliation ?? "No retaliation");
      const first = s.statuses[0];
      if (first !== undefined) parts.push(first);
      if (it.action.type === "attack" && mode.stepAfter > 0)
        parts.push("then choose where to step");
      return { text: parts.join(" · "), tone: "attack" };
    }
    case "out-of-reach":
      return {
        text: `${stackLabel(state, it.stack.id)}: out of reach this turn`,
        tone: "warn",
      };
    case "inspect":
      return {
        text: `${stackLabel(state, it.stack.id)} · right-click for details`,
        tone: "idle",
      };
    case "none":
      return {
        text: `${who}: click a shaded hex to move or an enemy to attack${mode.swaps ? ", or a ⇄ partner to swap" : ""}`,
        tone: "idle",
      };
  }
}

/** "Choose an enemy stack for Nettle", or "Nettle: choose a stack, then ...". */
function promptFor(name: string, prompt: string): string {
  const p = prompt.replace(/[.:]\s*$/, "");
  // A plain "Choose X" reads best with the act's name after it.
  if (/^Choose [^,:;.]+$/.test(p) && !/ It may /.test(p))
    return `${p} for ${name}`;
  return `${name}: ${lowerFirst(p)}`;
}

function actLine(a: ActStatus): StatusLine {
  const h = a.hover;
  if (a.prompt === null)
    return {
      text: `Enter: ${lowerFirst(a.verb)} ${a.name} (Backspace goes back, Esc cancels)`,
      tone: "go",
    };
  if (a.valid === 0 && a.pickIn === "field")
    return {
      text: `${a.name} has nothing to aim at: ${a.noTarget ?? "No valid target"} ${ESC}`,
      tone: "warn",
    };
  if (h.kind === "no-effect")
    return {
      text: `No effect on ${h.what}: ${h.reason}`,
      tone: "warn",
    };
  if (h.kind === "target") {
    if (h.thenCondition)
      return {
        text: `Pick ${h.what}, then one of its conditions, for ${a.name}`,
        tone: "go",
      };
    if (h.preview === null)
      return {
        text: `Pick ${h.what} for ${a.name}, then the next target`,
        tone: "go",
      };
    if (!h.preview.legal)
      return {
        text: `Cannot ${lowerFirst(a.verb)} ${a.name} on ${h.what}: ${h.preview.message ?? "refused"}`,
        tone: "warn",
      };
    const effect = h.preview.summary.slice(0, 2).join("; ");
    const on = h.what === "" ? "" : ` on ${h.what}`;
    return {
      text: `${a.verb} ${a.name}${on}${effect ? ` · ${effect}` : ""}`,
      tone: "go",
    };
  }
  const where = a.pickIn === "panel" ? " in the panel" : "";
  return {
    text: `${promptFor(a.name, a.prompt)}${where} ${ESC}`,
    tone: "idle",
  };
}

/** The status line for the screen's mode. */
export function statusLine(state: BattleState, mode: StatusMode): StatusLine {
  const a = activeStack(state);
  switch (mode.kind) {
    case "over":
      return { text: "The battle is over.", tone: "idle" };
    case "enemy":
      return {
        text: a ? `Enemy turn: ${stackLabel(state, a.id)}` : "Enemy turn",
        tone: "enemy",
      };
    case "auto":
      return {
        text: `Auto-combat plays your side${a ? `: ${stackLabel(state, a.id)}` : ""} (A takes over)`,
        tone: "enemy",
      };
    case "busy":
      return { text: "Wait for the animation (Space skips it)", tone: "idle" };
    case "turn":
      return turnLine(state, mode);
    case "act":
      return actLine(mode.act);
    case "after":
      return mode.hexes === null
        ? {
            text: "Click a green hex to step there after the attack, or Enter to stay (Esc cancels the attack)",
            tone: "idle",
          }
        : {
            text: `Attack, then step here (${plural(mode.hexes, "hex", "hexes")})`,
            tone: "attack",
          };
  }
}
