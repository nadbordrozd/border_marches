/**
 * The action bar of the battle screen (pure, unit tested): every action the
 * active stack and its hero may take this turn, with an icon, a hotkey, the
 * exact rule text, its use state and why it is disabled.
 *
 * - The stack: its activated abilities (once per battle or every turn),
 *   a shot at a hex (Bomb), its creature pages, and the Heartened switch.
 * - The hero: the spellbook, the Command (with C and whether it is used)
 *   and item acts.
 * - The turn: Wait, Defend and Undo.
 *
 * Hotkeys: digits 1 to 9 in bar order for the stack's and items' actions,
 * C for the Command, H for Heartened, B, W, D and U as before.
 */

import {
  ability as abilityDef,
  act as actDef,
  bears,
  canShoot,
  commandC,
  conditionKind,
  getStack,
  groundAt,
  groundKind,
  hasAct,
  heroActError,
  isAdjacent,
  isAlive,
  isRangedCreature,
  shootsAnyHex,
} from "../../core/battle/index.ts";
import type {
  BattleSide,
  BattleStack,
  BattleState,
} from "../../core/battle/index.ts";
import type { IconKind } from "../../assets/icons.ts";
import { isBattleSpell, spellDef } from "../../core/magic/index.ts";
import { creatureBook, heroBook } from "./magic.ts";
import {
  castHasTarget,
  noTargetReason as spellNoTarget,
} from "./spell-targets.ts";
import { anyTarget, canHearten, startMode, targetBounds } from "./targeting.ts";
import type { ModeKind } from "./targeting.ts";

export type ActionGroup = "stack" | "hero" | "turn";

export type ActionIcon =
  { readonly icon: IconKind; readonly id: string } | { readonly glyph: string };

export type ActionState =
  /** Can be used now. */
  | "ready"
  /** Spent for this battle (or this round). */
  | "used"
  /** Cannot be used now for another reason (see `reason`). */
  | "blocked";

export interface BarAction {
  /** Unique: "ability:hurl", "page:mend", "shoot-hex:bomb", "command:swear-in", "item:<act>", "spells", "hearten", "wait", "defend", "undo". */
  readonly key: string;
  readonly group: ActionGroup;
  readonly label: string;
  /** Key shown on the button and accepted by the screen ("1", "C", "W"). */
  readonly hotkey: string;
  readonly icon: ActionIcon;
  /** The exact rule text. */
  readonly rule: string;
  /** How often it may be used and how ("Every turn, in place of an attack"). */
  readonly usage: string;
  readonly state: ActionState;
  /** Why it cannot be used now, or null. */
  readonly reason: string | null;
  /** A short badge: "C 2", "used", "every turn", a mana count. */
  readonly badge: string | null;
  /** For a toggle (Heartened): whether it is on. */
  readonly on?: boolean;
  /** What pressing it starts: a targeting mode, a page cast, or a command. */
  readonly mode?: { readonly kind: ModeKind; readonly id: string };
  readonly page?: string;
}

export interface BarContext {
  /** The player may act now (their stack's turn, input awaited). */
  readonly playerTurn: boolean;
  /** Why not, when not ("The enemy's turn", "Animating"). */
  readonly notTurnReason?: string;
  /** Take-back has something to undo. */
  readonly canUndo: boolean;
  /** The Heartened switch: spend it after this action. */
  readonly heartenSpend: boolean;
  /** The hero's name, for tooltips. */
  readonly heroName?: string;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Why the stack cannot shoot now, or null when it can. */
export function shotBlocker(state: BattleState, s: BattleStack): string | null {
  if (!isRangedCreature(s.creature)) return "Not a shooter";
  if (s.shotsLeft <= 0) return "No shots left";
  const held = s.conditions.find((c) => conditionKind(c.kind).cannotShoot);
  if (held) return `${conditionKind(held.kind).name} forbids shooting`;
  const g = groundAt(state, s.hex);
  if (g && groundKind(g.kind).cannotShoot)
    return `${groundKind(g.kind).name} underfoot forbids shooting`;
  const foe = state.stacks.some(
    (x) => isAlive(x) && x.side !== s.side && isAdjacent(x.hex, s.hex),
  );
  if (foe) return "An enemy stands adjacent";
  return canShoot(state, s.id) ? null : "Cannot shoot now";
}

/** A first refusal message for a mode with no valid target, for the tooltip. */
function noTargetReason(
  state: BattleState,
  kind: ModeKind,
  id: string,
): string {
  if (kind === "command" && id === "last-rites")
    return state.ground.some((g) => g.class === "remains")
      ? "No valid target"
      : "No remains on the field";
  if (kind === "ability") {
    const def = abilityDef(id);
    return def.moveFirst
      ? "No valid target within reach"
      : "No valid target in place";
  }
  if (kind === "item" && id === "a-pinch-of-sand")
    return "No valid target (a condition with a clock is needed)";
  if (kind === "item" && id === "cider-flask")
    return "No valid target (one of your stacks bearing Ripening is needed)";
  if (kind === "page" && isBattleSpell(id))
    return spellNoTarget(spellDef(id).target);
  return "No valid target";
}

/** True when some target makes the act legal (the engine decides). */
export function hasTarget(
  state: BattleState,
  kind: ModeKind,
  id: string,
): boolean {
  try {
    return anyTarget(state, startMode(state, kind, id));
  } catch {
    return false;
  }
}

function abilityActions(
  state: BattleState,
  s: BattleStack,
  ctx: BarContext,
): BarAction[] {
  const out: BarAction[] = [];
  for (const a of s.creature.abilities) {
    const def = abilityDef(a);
    if (def.act === undefined || !hasAct(def.act)) continue;
    const every = def.everyTurn === true;
    const used = !every && s.abilitiesUsed.includes(a);
    const usage = `${every ? "Every turn" : "Once per battle"}, instead of attacking.${def.moveFirst ? " It may walk first." : ""}`;
    let reason: string | null = null;
    let st: ActionState = "ready";
    if (used) {
      st = "used";
      reason = "Used this battle";
    } else if (!ctx.playerTurn) {
      st = "blocked";
      reason = ctx.notTurnReason ?? "Not your turn";
    } else if (!hasTarget(state, "ability", a)) {
      st = "blocked";
      reason = noTargetReason(state, "ability", a);
    }
    out.push({
      key: `ability:${a}`,
      group: "stack",
      label: def.name,
      hotkey: "",
      icon: { glyph: abilityGlyph(a) },
      rule: actDef(def.act).text,
      usage,
      state: st,
      reason,
      badge: every ? "every turn" : used ? "used" : "once",
      mode: { kind: "ability", id: a },
    });
  }
  return out;
}

/** Glyphs for activated abilities without an icon of their own. */
const ABILITY_GLYPHS: Readonly<Record<string, string>> = {
  hurl: "⇶",
  attend: "✦",
  mesmerise: "◉",
  bomb: "✹",
};

export function abilityGlyph(id: string): string {
  return ABILITY_GLYPHS[id] ?? "✷";
}

function shootHexAction(
  state: BattleState,
  s: BattleStack,
  ctx: BarContext,
): BarAction | null {
  if (!shootsAnyHex(s)) return null;
  const id = s.creature.abilities.find(
    (a) => abilityDef(a).shootAnyHex === true,
  ) as string;
  const def = abilityDef(id);
  const blocker = shotBlocker(state, s);
  const reason = !ctx.playerTurn
    ? (ctx.notTurnReason ?? "Not your turn")
    : blocker;
  return {
    key: `shoot-hex:${id}`,
    group: "stack",
    label: `${def.name} a hex`,
    hotkey: "",
    icon: { glyph: abilityGlyph(id) },
    rule: def.description,
    usage: `A shot (${s.shotsLeft} of ${s.creature.shots ?? 0} left) at any hex, empty or not; point at an enemy to bomb it directly`,
    state: reason === null ? "ready" : s.shotsLeft <= 0 ? "used" : "blocked",
    reason,
    badge: `${s.shotsLeft}`,
    mode: { kind: "shootHex", id },
  };
}

function pageActions(state: BattleState, ctx: BarContext): BarAction[] {
  return creatureBook(state).map((e) => {
    const reason =
      e.status !== "ready"
        ? e.reason
        : !ctx.playerTurn
          ? (ctx.notTurnReason ?? "Not your turn")
          : !castHasTarget(state, e)
            ? spellNoTarget(spellDef(e.id).target)
            : null;
    return {
      key: `page:${e.id}`,
      group: "stack" as const,
      label: e.name,
      hotkey: "",
      icon: { icon: "spell" as const, id: e.id },
      rule: e.text,
      usage: `The stack's own page: once per battle, as its action, at Power ${e.power}`,
      state:
        e.status === "spent"
          ? ("used" as const)
          : reason === null
            ? ("ready" as const)
            : ("blocked" as const),
      reason,
      badge: e.status === "spent" ? "used" : `P${e.power}`,
      page: e.id,
    };
  });
}

function heartenAction(
  state: BattleState,
  s: BattleStack,
  ctx: BarContext,
): BarAction | null {
  if (!canHearten(state)) return null;
  const c = s.conditions.find((x) => x.kind === "heartened");
  const text = c ? conditionKind(c.kind).text(c) : "";
  return {
    key: "hearten",
    group: "stack",
    label: ctx.heartenSpend ? "Spend Heartened" : "Keep Heartened",
    hotkey: "H",
    icon: { icon: "condition", id: "heartened" },
    rule: text,
    usage: ctx.heartenSpend
      ? "On: after this action the stack ends Heartened for an extra turn. Press H to keep it for later."
      : "Off: the stack keeps Heartened after this action. Press H to spend it. (A move or a Wait does not take the choice.)",
    state: ctx.playerTurn ? "ready" : "blocked",
    reason: ctx.playerTurn ? null : (ctx.notTurnReason ?? "Not your turn"),
    badge: ctx.heartenSpend ? "spend" : "keep",
    on: ctx.heartenSpend,
  };
}

function heroActions(
  state: BattleState,
  side: BattleSide,
  ctx: BarContext,
): BarAction[] {
  const sideState = state.sides[side];
  const hero = sideState.hero;
  const out: BarAction[] = [];
  const heroName = ctx.heroName ?? "The hero";
  // The spellbook.
  const pages = heroBook(state, side).filter((p) => p.source !== "item");
  const own = creatureBook(state);
  const magic = sideState.magic;
  const castThisRound = sideState.castRound === state.round;
  let spellReason: string | null = null;
  if (!ctx.playerTurn) spellReason = ctx.notTurnReason ?? "Not your turn";
  else if (pages.length === 0 && own.length === 0)
    spellReason = hero === null ? "No hero leads this army" : "No spellbook";
  out.push({
    key: "spells",
    group: "hero",
    label: "Spells",
    hotkey: "B",
    icon: { icon: "stat", id: "power" },
    rule: "The hero casts one page or scroll a round, before this stack acts; a creature caster's own pages are in the book too.",
    usage: magic
      ? `Mana ${magic.mana} · Fuel ${magic.fuelMax - magic.fuelUsed} left · ${castThisRound ? "the hero has cast this round" : "one cast this round"}`
      : "Opens the spellbook",
    state: spellReason === null ? "ready" : "blocked",
    reason: spellReason,
    badge: magic ? `${magic.mana}` : null,
  });
  if (hero === null) return out;
  // The Command.
  if (hero.command !== undefined && hasAct(hero.command)) {
    const def = actDef(hero.command);
    const c = commandC(state, side);
    const err = heroActError(state, side, def.id);
    let reason: string | null = null;
    let st: ActionState = "ready";
    if (sideState.commandUsed) {
      st = "used";
      reason = "Used this battle (once per battle)";
    } else if (err !== null) {
      st = "blocked";
      reason = cap(err);
    } else if (!ctx.playerTurn) {
      st = "blocked";
      reason = ctx.notTurnReason ?? "Not your turn";
    } else if (!hasTarget(state, "command", def.id)) {
      st = "blocked";
      reason = noTargetReason(state, "command", def.id);
    }
    let times = "";
    if (state.activeStackId !== null && def.maxTargets) {
      const b = targetBounds(state, {
        kind: "command",
        id: def.id,
        actorId: state.activeStackId,
        targets: [],
        pickFor: null,
      });
      if (b.max > b.min)
        times = `, up to ${(b.max - b.min) / b.step + 1} times`;
    }
    out.push({
      key: `command:${def.id}`,
      group: "hero",
      label: def.name,
      hotkey: "C",
      icon: { icon: "skill", id: "banner" },
      rule: def.text,
      usage: `${heroName}'s Command: once per battle, before this stack acts. C = ${c}${times}.`,
      state: st,
      reason,
      badge: sideState.commandUsed ? "used" : `C${c}`,
      mode: { kind: "command", id: def.id },
    });
  }
  // Item acts.
  for (const id of hero.itemActs ?? []) {
    if (!hasAct(id)) continue;
    const def = actDef(id);
    const used = sideState.itemActsUsed.includes(id);
    const err = heroActError(state, side, id);
    let reason: string | null = null;
    let st: ActionState = "ready";
    if (used) {
      st = "used";
      reason = "Used this battle (once per battle)";
    } else if (err !== null) {
      st = "blocked";
      reason = cap(err);
    } else if (!ctx.playerTurn) {
      st = "blocked";
      reason = ctx.notTurnReason ?? "Not your turn";
    } else if (!hasTarget(state, "item", id)) {
      st = "blocked";
      reason = noTargetReason(state, "item", id);
    }
    out.push({
      key: `item:${id}`,
      group: "hero",
      label: def.name,
      hotkey: "",
      icon: { icon: "artifact", id },
      rule: def.text,
      usage: `Item act of ${heroName}'s artifact: once per battle, before this stack acts`,
      state: st,
      reason,
      badge: used ? "used" : null,
      mode: { kind: "item", id },
    });
  }
  return out;
}

function turnActions(s: BattleStack | null, ctx: BarContext): BarAction[] {
  const not = ctx.notTurnReason ?? "Not your turn";
  let waitReason: string | null = null;
  if (!ctx.playerTurn) waitReason = not;
  else if (s?.waitedThisRound) waitReason = "Already waited this round";
  else if (s && bears(s, "cannotWait")) {
    const c = s.conditions.find((x) => conditionKind(x.kind).cannotWait);
    waitReason = `${c ? conditionKind(c.kind).name : "A condition"} forbids waiting`;
  }
  return [
    {
      key: "wait",
      group: "turn",
      label: "Wait",
      hotkey: "W",
      icon: { glyph: "⧗" },
      rule: "Act again later this round, after every stack that has not acted (slowest waiting stack first).",
      usage: "Once per round",
      state: waitReason === null ? "ready" : "blocked",
      reason: waitReason,
      badge: null,
    },
    {
      key: "defend",
      group: "turn",
      label: "Defend",
      hotkey: "D",
      icon: { icon: "stat", id: "defense" },
      rule: "End the turn: +30% Defense until the stack's next turn.",
      usage: "Ends the turn",
      state: ctx.playerTurn ? "ready" : "blocked",
      reason: ctx.playerTurn ? null : not,
      badge: null,
    },
    {
      key: "undo",
      group: "turn",
      label: "Undo",
      hotkey: "U",
      icon: { glyph: "↶" },
      rule: "Take back your last action this round. Never across a round start, and never past an enemy hero's decision.",
      usage: "This round only",
      state: ctx.playerTurn && ctx.canUndo ? "ready" : "blocked",
      reason: !ctx.playerTurn
        ? not
        : ctx.canUndo
          ? null
          : "Nothing to take back this round",
      badge: null,
    },
  ];
}

/**
 * The action bar for the active stack: its own actions, its hero's, then
 * the turn's. Digits are given in bar order to the stack's and items'
 * actions (up to 9).
 */
export function actionBar(state: BattleState, ctx: BarContext): BarAction[] {
  const id = state.activeStackId;
  const s = id === null || state.winner !== null ? null : getStack(state, id);
  const out: BarAction[] = [];
  if (s !== null) {
    out.push(...abilityActions(state, s, ctx));
    const hex = shootHexAction(state, s, ctx);
    if (hex) out.push(hex);
    out.push(...pageActions(state, ctx));
    const h = heartenAction(state, s, ctx);
    if (h) out.push(h);
    out.push(...heroActions(state, s.side, ctx));
  }
  out.push(...turnActions(s, ctx));
  let digit = 1;
  return out.map((a) =>
    a.hotkey === "" && digit <= 9 ? { ...a, hotkey: String(digit++) } : a,
  );
}

/** The bar action a key press means (case-insensitive), or null. */
export function actionForKey(
  bar: readonly BarAction[],
  key: string,
): BarAction | null {
  const k = key.toUpperCase();
  return bar.find((a) => a.hotkey === k) ?? null;
}

/** The tooltip lines of a bar action: rule, usage, then the reason. */
export function actionTooltip(a: BarAction): {
  readonly title: string;
  readonly lines: readonly string[];
  readonly reason: string | null;
} {
  return {
    title: `${a.label}${a.hotkey ? ` (${a.hotkey})` : ""}`,
    lines: [a.rule, a.usage].filter((x) => x !== ""),
    reason: a.reason,
  };
}
