/**
 * Targeting modes of the action bar (pure, unit tested): aiming an
 * activated ability (with its walk first), the hero's Command (several
 * targets, "up to C times"), an item act and a shot at a hex (Bomb).
 *
 * A mode holds the targets chosen so far. {@link choices} lists every
 * target the next step may take, each tested exactly: a candidate is valid
 * when some completion of its step group makes the whole action legal by
 * the engine's own `actionError`. Previews are the engine's rehearsal
 * (`castPreview` runs `rehearse`), so what the panel says is what happens.
 *
 * Hit and Run's "attack, then step to" choice and the Heartened keep or
 * spend switch live here too.
 */

import {
  BATTLE_HEX_COUNT,
  ability as abilityDef,
  act as actDef,
  actionError,
  findPath,
  getStack,
  hexDistance,
  hexFromIndex,
  inBounds,
  isAlive,
  reachableHexes,
  rehearse,
  sameHex,
} from "../../core/battle/index.ts";
import type {
  ActDef,
  ActTarget,
  AttackAction,
  BattleAction,
  BattleStack,
  BattleState,
  Hex,
  StackId,
} from "../../core/battle/index.ts";
import {
  isBattleSpell,
  spellDef,
  targetSteps,
} from "../../core/magic/index.ts";
import { hexToStage } from "../../render/battle/geometry.ts";
import type { Point } from "../../render/battle/geometry.ts";
import { creatureName } from "./preview.ts";

/**
 * "page" is a creature caster's page: the screen aims it with the
 * spellbook's cast panel (magic.ts); here it only answers whether any
 * target exists.
 */
export type ModeKind = "ability" | "command" | "item" | "shootHex" | "page";
export type StepKind = "stack" | "hex" | "condition" | "choice" | "any";

/** An act being aimed from the action bar. */
export interface ActMode {
  readonly kind: ModeKind;
  /** Ability id (ability, shootHex), act id (command, item) or spell id (page). */
  readonly id: string;
  readonly actorId: StackId;
  readonly targets: readonly ActTarget[];
  /** A condition step: the stack whose conditions are offered. */
  readonly pickFor: StackId | null;
}

/** One valid target for the next step. */
export interface Choice {
  readonly target: ActTarget;
  /** Where it is on the field (a stack's hex for stack and condition). */
  readonly hex: Hex;
  /**
   * When this target completes the action: the hexes the actor may act
   * from (its own hex first; more for an ability that may walk first).
   * Empty when the action is not complete with it.
   */
  readonly froms: readonly Hex[];
}

export function startMode(
  state: BattleState,
  kind: ModeKind,
  id: string,
): ActMode {
  const actorId = state.activeStackId;
  if (actorId === null) throw new Error("no active stack");
  return { kind, id, actorId, targets: [], pickFor: null };
}

/** The act a mode performs, or null for a shot at a hex. */
export function modeAct(mode: ActMode): ActDef | null {
  if (mode.kind === "shootHex") return null;
  if (mode.kind === "ability") {
    const id = abilityDef(mode.id).act;
    return id === undefined ? null : actDef(id);
  }
  return actDef(mode.id);
}

/** Display name of what is being aimed. */
export function modeName(mode: ActMode): string {
  if (mode.kind === "ability" || mode.kind === "shootHex")
    return abilityDef(mode.id).name;
  if (mode.kind === "page" && isBattleSpell(mode.id))
    return spellDef(mode.id).name;
  return actDef(mode.id).name;
}

export interface TargetBounds {
  /** Targets needed. */
  readonly min: number;
  /** Most targets allowed ("up to C times"). */
  readonly max: number;
  /** Targets per repetition beyond `min`. */
  readonly step: number;
}

export function targetBounds(state: BattleState, mode: ActMode): TargetBounds {
  const def = modeAct(mode);
  if (def === null) return { min: 1, max: 1, step: 1 };
  const min = def.targets;
  const max = Math.max(min, def.maxTargets?.(state, mode.actorId) ?? min);
  return { min, max, step: Math.max(1, def.targetStep ?? 1) };
}

/** What target number `i` (0-based) is. */
export function stepKind(mode: ActMode, i: number): StepKind {
  if (mode.kind === "shootHex") return "hex";
  if (mode.kind === "page")
    return isBattleSpell(mode.id)
      ? (targetSteps(spellDef(mode.id).target)[i] ?? "any")
      : "any";
  const def = modeAct(mode);
  const kinds = def?.targetKinds;
  if (!def || !kinds) return "any";
  const step = Math.max(1, def.targetStep ?? 1);
  const k =
    i < def.targets ? i : def.targets - step + ((i - def.targets) % step);
  return kinds[k] ?? "any";
}

/** Enough targets, in whole steps, and not too many. */
export function isComplete(
  state: BattleState,
  mode: ActMode,
  targets: readonly ActTarget[] = mode.targets,
): boolean {
  const b = targetBounds(state, mode);
  const n = targets.length;
  return n >= b.min && n <= b.max && (n - b.min) % b.step === 0;
}

/** No further target can be added. */
export function isFull(state: BattleState, mode: ActMode): boolean {
  return mode.targets.length >= targetBounds(state, mode).max;
}

/** How many uses of a repeated act the targets make ("2 of up to 3"). */
export function repetitions(
  state: BattleState,
  mode: ActMode,
): { readonly done: number; readonly most: number } | null {
  const b = targetBounds(state, mode);
  if (b.max === b.min) return null;
  const most = (b.max - b.min) / b.step + 1;
  const n = mode.targets.length;
  const done = n < b.min ? 0 : Math.floor((n - b.min) / b.step) + 1;
  return { done, most };
}

/** The engine action for a mode's targets (and walk-first hex). */
export function modeAction(
  state: BattleState,
  mode: ActMode,
  targets: readonly ActTarget[] = mode.targets,
  from?: Hex | null,
): BattleAction {
  const stackId = mode.actorId;
  if (mode.kind === "shootHex") {
    const t = targets[0];
    const at =
      t !== undefined && "hex" in t ? t.hex : getStack(state, stackId).hex;
    return { type: "shootHex", stackId, at };
  }
  if (mode.kind === "page")
    return { type: "creatureCast", stackId, spell: mode.id, targets };
  if (mode.kind === "ability") {
    const me = getStack(state, stackId);
    return {
      type: "ability",
      stackId,
      ability: mode.id,
      targets,
      ...(from && !sameHex(from, me.hex) ? { from } : {}),
    };
  }
  return { type: "heroAct", stackId, act: mode.id, targets };
}

/** The ability may walk before it acts. */
export function walksFirst(mode: ActMode): boolean {
  return mode.kind === "ability" && abilityDef(mode.id).moveFirst === true;
}

/** Hexes the actor may act from: its own first, then reachable ones. */
function fromHexes(state: BattleState, mode: ActMode): Hex[] {
  const me = getStack(state, mode.actorId);
  if (!walksFirst(mode)) return [me.hex];
  const out: Hex[] = [me.hex];
  for (const [i, d] of reachableHexes(state, me.id)) {
    if (d > 0) out.push(hexFromIndex(i));
  }
  return out;
}

/** The froms for which the complete action is legal. */
function legalFroms(
  state: BattleState,
  mode: ActMode,
  targets: readonly ActTarget[],
  froms: readonly Hex[],
  first = false,
): Hex[] {
  const out: Hex[] = [];
  for (const f of froms) {
    if (actionError(state, modeAction(state, mode, targets, f)) === null) {
      out.push(f);
      if (first) break;
    }
  }
  return out;
}

function stackAt(state: BattleState, h: Hex): BattleStack | null {
  return state.stacks.find((s) => isAlive(s) && sameHex(s.hex, h)) ?? null;
}

/** Every target a step of this kind could take. */
function candidates(
  state: BattleState,
  kind: StepKind,
  pickFor: StackId | null,
): ActTarget[] {
  const living = state.stacks.filter(isAlive);
  switch (kind) {
    case "stack":
      return living.map((s) => ({ stack: s.id }));
    case "condition":
      return living
        .filter((s) => pickFor === null || s.id === pickFor)
        .flatMap((s) =>
          s.conditions.map((c) => ({ stack: s.id, condition: c.uid })),
        );
    case "choice":
      return [{ choice: "+2" }, { choice: "-2" }];
    case "hex":
    case "any": {
      const out: ActTarget[] = [];
      for (let i = 0; i < BATTLE_HEX_COUNT; i++) {
        const h = hexFromIndex(i);
        const s = kind === "any" ? stackAt(state, h) : null;
        out.push(s ? { stack: s.id } : { hex: h });
      }
      return out;
    }
  }
}

/** The target count at which the step group containing target `n` ends. */
export function groupEnd(n: number, b: TargetBounds): number {
  if (n < b.min) return b.min;
  return Math.min(
    b.max,
    b.min + (Math.floor((n - b.min) / b.step) + 1) * b.step,
  );
}

/** Deepest look-ahead within a step group (heave-ho and pairs need 1). */
const MAX_LOOKAHEAD = 2;

/** Some completion of the group up to `end` targets is legal. */
function completes(
  state: BattleState,
  mode: ActMode,
  prefix: readonly ActTarget[],
  end: number,
  froms: readonly Hex[],
): boolean {
  if (prefix.length >= end)
    return legalFroms(state, mode, prefix, froms, true).length > 0;
  if (end - prefix.length > MAX_LOOKAHEAD) return true;
  const kind = stepKind(mode, prefix.length);
  for (const c of candidates(state, kind, null)) {
    if (completes(state, mode, [...prefix, c], end, froms)) return true;
  }
  return false;
}

function targetHex(state: BattleState, t: ActTarget): Hex | null {
  if ("hex" in t) return t.hex;
  if ("stack" in t) return getStack(state, t.stack).hex;
  return null;
}

/**
 * Every valid target of the next step, each tested by the engine. For a
 * condition step without a chosen stack, the conditions of every stack.
 */
export function choices(state: BattleState, mode: ActMode): Choice[] {
  const b = targetBounds(state, mode);
  const n = mode.targets.length;
  if (n >= b.max) return [];
  const end = groupEnd(n, b);
  const kind = stepKind(mode, n);
  const froms = fromHexes(state, mode);
  const out: Choice[] = [];
  for (const c of candidates(state, kind, mode.pickFor)) {
    const targets = [...mode.targets, c];
    const hex = targetHex(state, c);
    if (hex === null) continue;
    if (targets.length >= end) {
      const ok = legalFroms(state, mode, targets, froms);
      if (ok.length > 0) out.push({ target: c, hex, froms: ok });
    } else if (completes(state, mode, targets, end, froms)) {
      out.push({ target: c, hex, froms: [] });
    }
  }
  return out;
}

/**
 * Whether the act can be used at all now: some target (or none, for an act
 * that takes none) makes it legal. Stops at the first success.
 */
export function anyTarget(state: BattleState, mode: ActMode): boolean {
  const b = targetBounds(state, mode);
  const froms = fromHexes(state, mode);
  if (b.max === 0) return legalFroms(state, mode, [], froms, true).length > 0;
  return completes(state, mode, [], groupEnd(0, b), froms);
}

/** The choices on hex `h` (a stack's, or the hex's own). */
export function choicesAt(list: readonly Choice[], h: Hex): Choice[] {
  return list.filter((c) => sameHex(c.hex, h));
}

/** The walk-first hex nearest the pointer (ties: the earlier, own hex first). */
export function pickFrom(
  froms: readonly Hex[],
  pointer: Point | null,
): Hex | null {
  if (froms.length === 0) return null;
  if (pointer === null) return froms[0] as Hex;
  let best = froms[0] as Hex;
  let bestD = Infinity;
  for (const f of froms) {
    const c = hexToStage(f);
    const d = (c.x - pointer.x) ** 2 + (c.y - pointer.y) ** 2;
    if (d < bestD - 1e-9) {
      best = f;
      bestD = d;
    }
  }
  return best;
}

/** The mode with one more target (a condition step's stack is cleared). */
export function addTarget(mode: ActMode, t: ActTarget): ActMode {
  return { ...mode, targets: [...mode.targets, t], pickFor: null };
}

/** For a condition step: offer this stack's conditions. */
export function pickStack(mode: ActMode, id: StackId): ActMode {
  return { ...mode, pickFor: id };
}

/**
 * Back one step: drop a chosen condition stack, else the last target;
 * null leaves the mode (Back with nothing chosen).
 */
export function backStep(mode: ActMode): ActMode | null {
  if (mode.pickFor !== null) return { ...mode, pickFor: null };
  if (mode.targets.length === 0) return null;
  return { ...mode, targets: mode.targets.slice(0, -1) };
}

/** The hexes of the act's area for these targets, for the outline. */
export function areaHexes(
  state: BattleState,
  mode: ActMode,
  targets: readonly ActTarget[],
): Hex[] {
  if (mode.kind === "shootHex") {
    const t = targets[0];
    if (t === undefined || !("hex" in t)) return [];
    const area = abilityDef(mode.id).shotArea;
    return (area ? area(state, t.hex) : [t.hex]).filter(inBounds);
  }
  const def = modeAct(mode);
  if (!def?.area) return [];
  return def.area(state, mode.actorId, targets).filter(inBounds);
}

/** The area a stack's shot at `centre` covers (Bomb), or null. */
export function shotAreaHexes(
  state: BattleState,
  stack: BattleStack,
  centre: Hex,
): Hex[] | null {
  for (const a of stack.creature.abilities) {
    const def = abilityDef(a);
    if (def.shotArea) return def.shotArea(state, centre).filter(inBounds);
  }
  return null;
}

const NOUN: Readonly<Record<StepKind, string>> = {
  stack: "a stack",
  hex: "a hex",
  condition: "a stack, then one of its conditions",
  choice: "an option",
  any: "a stack or a hex",
};

/** The prompt for the next step. */
export function modePrompt(state: BattleState, mode: ActMode): string {
  if (mode.kind === "shootHex")
    return "Choose the hex to bomb: the stack there and every stack beside it are hit.";
  const n = mode.targets.length;
  const full = isFull(state, mode);
  const complete = isComplete(state, mode);
  if (full) return "Ready.";
  const kind = stepKind(mode, n);
  const picked = mode.pickFor === null ? null : getStack(state, mode.pickFor);
  let line =
    kind === "condition" && picked !== null
      ? `Choose one of the conditions of the ${creatureName(picked.creature, Math.max(1, picked.count))}.`
      : `Choose ${NOUN[kind]}.`;
  const b = targetBounds(state, mode);
  const rep = repetitions(state, mode);
  const lower = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);
  if (rep !== null) {
    const use = n < b.min ? 1 : Math.floor((n - b.min) / b.step) + 2;
    const group = n < b.min ? b.min : b.step;
    const pos = n < b.min ? n + 1 : ((n - b.min) % b.step) + 1;
    const of = group > 1 ? ` (target ${pos} of ${group})` : "";
    line = `Use ${use} of up to ${rep.most}${of}: ${lower(line)}`;
  } else if (b.min > 1) {
    line = `Target ${n + 1} of ${b.min}: ${lower(line)}`;
  }
  if (walksFirst(mode) && n === 0) line += " It may walk first.";
  if (complete) line += " Enter uses it now.";
  return line;
}

// ---------------------------------------------------------------------------
// Hit and Run: the walk after the attack

/** Hexes a stack may walk after its melee attack (Hit and Run), 0 if none. */
export function walkAfterRange(stack: BattleStack): number {
  return Math.max(
    0,
    ...stack.creature.abilities.map((a) => abilityDef(a).walkAfterAttack ?? 0),
  );
}

/** Where the walk after an attack could end, with its path. */
export interface AfterChoice {
  readonly hex: Hex;
  readonly path: readonly Hex[];
}

/**
 * The hexes the attacker could step to after this attack and its
 * retaliation, on the rehearsed board (empty when it cannot: no Hit and
 * Run, or the attack kills it, or the battle ends).
 */
export function afterChoices(
  state: BattleState,
  attack: AttackAction,
): AfterChoice[] {
  if (attack.type !== "attack") return [];
  const me = getStack(state, attack.stackId);
  const n = walkAfterRange(me);
  if (n <= 0) return [];
  const r = rehearse(state, attack);
  if (r.legal !== true || r.after.winner !== null) return [];
  const after = r.after.stacks.find((s) => s.id === me.id);
  if (!after || !isAlive(after)) return [];
  const out: AfterChoice[] = [];
  for (let i = 0; i < BATTLE_HEX_COUNT; i++) {
    const h = hexFromIndex(i);
    if (sameHex(h, after.hex) || hexDistance(h, after.hex) > n) continue;
    const path = findPath(r.after, me.id, h, n);
    if (path && path.length > 0) out.push({ hex: h, path });
  }
  return out;
}

/** The attack with its walk after (none for `null`: stay). */
export function withAfter(attack: AttackAction, to: Hex | null): AttackAction {
  if (attack.type !== "attack") return attack;
  const { after: _drop, ...rest } = attack;
  void _drop;
  return to === null ? rest : { ...rest, after: to };
}

// ---------------------------------------------------------------------------
// Heartened: keep or spend

/** The active stack bears Heartened and may spend it after this turn. */
export function canHearten(state: BattleState): boolean {
  const id = state.activeStackId;
  if (id === null || state.winner !== null) return false;
  const s = getStack(state, id);
  return (
    s.conditions.some((c) => c.kind === "heartened") &&
    s.extraTurnRound !== state.round
  );
}

/**
 * The action with the player's Heartened choice: `spend` false keeps it
 * (`hearten: false`) on the actions that take the choice. Moves and Waits
 * do not take it (a move spends it; a wait does not end the turn).
 */
export function withHearten(
  action: BattleAction,
  spend: boolean,
): BattleAction {
  if (spend) return action;
  switch (action.type) {
    case "attack":
    case "shoot":
    case "shootHex":
    case "defend":
    case "ability":
    case "creatureCast":
      return { ...action, hearten: false };
    default:
      return action;
  }
}
