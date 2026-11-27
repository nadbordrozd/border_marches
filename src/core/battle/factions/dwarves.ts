/**
 * The Deepforge (FACTION_DWARVES.md): Stoke (birthright) and the Steam
 * condition, the six units' abilities, the three Drills, The Great Boiler
 * (granted to natives by the battle resolver while their owner holds the
 * building) and the two Commands. The Pocket Boiler and Scalding (5.2)
 * are hero rules read by the engine's Defend (engine.ts) and by Steam here.
 *
 * Engine pieces they lean on: Lucky's shape for Steam (a Strike multiplier
 * spent by a reaction), the feed operation (steam.ts `stoke`), scheduled
 * events for the Mortars' shells (Appointment's), the Bomb's splash, Mist's
 * teleport walk (Rotors), the push and its "no longer adjacent, no
 * retaliation" (Follow Through's, for Ram), `stackKey` on multipliers
 * (Spotter), and the abilities' `pointBlank` flag (Turret).
 */

import { COMMANDS } from "../../../data/classes.ts";
import { withinReach } from "../abilities.ts";
import { hexDistance, isAdjacent, neighbors, sameHex } from "../hex.ts";
import type { Hex } from "../hex.ts";
import {
  registerAbility,
  registerAct,
  registerConditionKind,
  registerEffect,
} from "../registry.ts";
import type { AreaRef } from "../registry.ts";
import { groundAt, isRangedCreature, shootsPointBlank } from "../resolve.ts";
import {
  STEAM,
  STEAM_PERCENT_PER_SIZE,
  addSteam,
  steamOf,
  stoke,
} from "../steam.ts";
import type {
  ActTarget,
  BattleStack,
  BattleState,
  JsonValue,
  StackId,
} from "../types.ts";
import {
  commandC,
  enemiesOf,
  friendsOf,
  inBlast,
  living,
  oneEach,
  stackOf,
  stackOn,
  targetStack,
} from "./common.ts";
import { lineDirection } from "./goblins.ts";

/** Patch Up: HP healed per Tinker (FACTION_DWARVES 5). */
export const PATCH_UP_PER_TINKER = 4;
/** Hot Rivets: Burning of half the Gunners (at least 1, at most 15). */
export const HOT_RIVETS_MAX = 15;
/** Red-Hot Rivets and Spotter: the shot Strike's percentage. */
export const RED_HOT_PERCENT = 125;
export const SPOTTER_PERCENT = 125;
/** Lob: the splash on every stack next to the shell's hex. */
export const SHELL_SPLASH_PERCENT = 50;
/** Incendiary Shells: fire of the Mortars' count, at most this, clock 2. */
export const INCENDIARY_MAX = 30;
/** Ramming Speed reaches 4 + C hexes. */
export const RAMMING_REACH = 4;
/** Overpressure: Harm 15 x C x the Steam's size. */
export const OVERPRESSURE_HARM = 15;
/** Scalding: Burning of 5 x the spent Steam's size, clock 2. */
export const SCALDING_PER_SIZE = 5;

/** The scheduled effect of a lobbed shell (FACTION_DWARVES 5, Lob). */
export const SHELL_EFFECT = "dwarves:shell";

/** A shell in the air: who lobbed it, where and when it lands. */
export interface PendingShell {
  /** The scheduled event's id. */
  readonly id: number;
  /** The round at whose start it lands. */
  readonly round: number;
  readonly stackId: StackId;
  readonly hex: Hex;
}

interface ShellArgs {
  readonly stackId: StackId;
  readonly hex: Hex;
}

function shellArgs(args: JsonValue | undefined): ShellArgs | null {
  if (args === null || typeof args !== "object" || Array.isArray(args))
    return null;
  const a = args as { stackId?: unknown; hex?: unknown };
  const h = a.hex as { col?: unknown; row?: unknown } | undefined;
  if (typeof a.stackId !== "string" || h === undefined) return null;
  if (typeof h.col !== "number" || typeof h.row !== "number") return null;
  return { stackId: a.stackId, hex: { col: h.col, row: h.row } };
}

/**
 * The shells in the air (the hex markers and timeline tiles, and the AI's
 * threat map), in order of landing.
 */
export function pendingShells(state: BattleState): PendingShell[] {
  return state.scheduled.flatMap((e) => {
    if (e.effect.id !== SHELL_EFFECT) return [];
    const a = shellArgs(e.effect.args);
    return a === null ? [] : [{ id: e.id, round: e.round, ...a }];
  });
}

/** A stack is a machine when it leaves a wreck (FACTION_DWARVES 1). */
export function isMachine(stack: BattleStack): boolean {
  return stack.tags.remains === "wreck";
}

/** The first hex, of `hex` and then its neighbours, holding a wreck. */
function wreckNear(state: BattleState, hex: Hex): Hex | null {
  for (const h of [hex, ...neighbors(hex)]) {
    const g = groundAt(state, h);
    if (g !== null && g.class === "remains" && g.kind === "wreck") return h;
  }
  return null;
}

/** The stack bearing Steam, and the condition. */
function steamCondition(s: BattleStack) {
  return s.conditions.find((c) => c.kind === STEAM) ?? null;
}

/** A hex and the hexes adjacent to it (a shell's outline). */
function blastHexes(centre: Hex): Hex[] {
  return [centre, ...neighbors(centre)];
}

export function registerDwarves(): void {
  // --- Steam (FACTION_DWARVES 3) -------------------------------------------
  registerConditionKind({
    id: STEAM,
    name: "Steam",
    school: "storm",
    polarity: "boon",
    defaultClock: null,
    defaultSize: 1,
    text: (c) =>
      `Every Strike of its next attack, shot or retaliation deals ${STEAM_PERCENT_PER_SIZE * c.size}% more damage; then Steam ends. It never cools down.`,
    strikeMultiplier(ctx, holder, c) {
      if (holder.id !== ctx.attacker.id || c.size <= 0) return null;
      return {
        source: STEAM,
        label: `Steam ${c.size}`,
        percent: 100 + STEAM_PERCENT_PER_SIZE * c.size,
      };
    },
    // Spent by the Strike: every Strike of the same action is multiplied
    // before this reaction resolves (a shell's centre and splash alike).
    onStrike(ctx, holder, c) {
      if (holder.id !== ctx.attacker.id) return null;
      const target = ctx.defender.id;
      const { uid, size } = c;
      return (fx) => {
        fx.endCondition(holder.id, uid);
        // Scalding (FACTION_DWARVES 5.2): the stack struck gains Burning.
        if (fx.isAlive(target) && fx.hasRule(fx.sideOf(holder.id), "scalding"))
          fx.addCondition(target, {
            kind: "burning",
            size: SCALDING_PER_SIZE * size,
            clock: 2,
            source: "scalding",
          });
      };
    },
  });

  // --- Birthright ----------------------------------------------------------
  registerAbility({
    id: "stoke",
    name: "Stoke",
    description:
      "When this native stack Defends, it also gains Steam 1, or its Steam grows by 1, to at most 3.",
    onDefend(fx, owner) {
      stoke(fx, owner);
    },
  });

  // --- Units ---------------------------------------------------------------
  registerAct({
    id: "patch-up",
    name: "Patch Up",
    text: "One adjacent friendly machine (a stack that leaves a wreck) is healed 4 HP per Tinker, reviving.",
    kind: "ability",
    targets: 1,
    targetKinds: ["stack"],
    check(state, actorId, t) {
      const me = stackOf(state, actorId);
      const other = stackOf(state, targetStack(t[0]) ?? "");
      if (!me || !other || other.id === me.id)
        return "choose a friendly machine";
      if (me.abilitiesUsed.includes("patch-up")) {
        // Salvage: again on a later turn, with a wreck on or next to it.
        if (!me.creature.abilities.includes("salvage"))
          return "this ability is used for the battle";
        if (wreckNear(state, me.hex) === null)
          return "Salvage needs a wreck on or next to the Tinkers";
      }
      if (other.side !== me.side) return "choose a friendly machine";
      if (!isMachine(other)) return "only a machine can be patched up";
      return withinReach(state, me, me, other) ? null : "it must be adjacent";
    },
    aiTargets: (state, actorId) =>
      oneEach(
        friendsOf(state, actorId).filter(
          (s) => s.id !== actorId && isMachine(s),
        ),
      ),
    resolve(fx, actorId, t) {
      const me = fx.stack(actorId);
      // The engine has recorded this use: a second or later one is
      // Salvage's, and consumes a wreck.
      const uses = me.abilitiesUsed.filter((a) => a === "patch-up").length;
      if (uses > 1) {
        const h = wreckNear(fx.state, me.hex);
        if (h !== null) fx.useRemains(h);
      }
      fx.heal(targetStack(t[0]) as StackId, PATCH_UP_PER_TINKER * me.count, {
        revive: true,
      });
    },
  });
  registerAbility({
    id: "patch-up",
    name: "Patch Up",
    description:
      "Once per battle, instead of attacking (it may move first): one adjacent friendly machine (a stack that leaves a wreck) is healed 4 HP per Tinker, reviving.",
    act: "patch-up",
    moveFirst: true,
    repeatByCheck: true,
  });

  registerAbility({
    id: "hot-rivets",
    name: "Hot Rivets",
    description:
      "A stack hit by the Rivet Gunners' shot gains Burning of half their count (at least 1, at most 15) for 2 rounds.",
    onStrike(ctx, owner) {
      if (owner.id !== ctx.attacker.id || ctx.kind !== "shot") return null;
      const target = ctx.defender.id;
      const size = Math.max(
        1,
        Math.min(HOT_RIVETS_MAX, Math.floor(ctx.attacker.count / 2)),
      );
      return (fx) => {
        fx.addCondition(target, {
          kind: "burning",
          size,
          clock: 2,
          source: owner.id,
        });
      };
    },
  });

  registerAbility({
    id: "rotors",
    name: "Rotors",
    description:
      "The Gyrocopters do not walk: they fly to any free hex within their Speed, whatever is in the way.",
    teleportWalk: true,
  });

  registerAbility({
    id: "spotter",
    name: "Spotter",
    description:
      "Shots by friendly stacks deal 25% more damage to a stack next to the Gyrocopters. Several Spotters do not add up.",
    damageMultiplier(ctx, owner) {
      if (ctx.kind !== "shot") return null;
      if (owner.side !== ctx.attacker.side || owner.id === ctx.defender.id)
        return null;
      if (!isAdjacent(owner.hex, ctx.defender.hex)) return null;
      return {
        source: "spotter",
        label: "Spotter",
        percent: SPOTTER_PERCENT,
        stackKey: "spotter",
      };
    },
  });

  registerAbility({
    id: "lob",
    name: "Lob",
    description:
      "The shot is lobbed at any hex. At the next round's start the shell lands: a shot at the stack there and a half-damage shot at every stack next to it, friend or foe (an area effect). Dead Mortars' shells are duds.",
    shootAnyHex: true,
    shotArea: (_state, centre) => blastHexes(centre),
    shot(fx, ownerId, centre) {
      const args: ShellArgs = {
        stackId: ownerId,
        hex: { col: centre.col, row: centre.row },
      };
      fx.schedule({
        round: fx.round + 1,
        phase: "start",
        effect: { id: SHELL_EFFECT, args: args as unknown as JsonValue },
        side: fx.sideOf(ownerId),
      });
    },
  });
  registerEffect(SHELL_EFFECT, (fx, raw) => {
    const a = shellArgs(raw);
    // The Mortars are dead: the shell is a dud.
    if (a === null || !fx.isAlive(a.stackId)) return;
    const me = a.stackId;
    const centre = a.hex;
    const area: AreaRef = { centre, side: fx.sideOf(me) };
    const count = fx.stack(me).count;
    const incendiary = fx
      .stack(me)
      .creature.abilities.includes("incendiary-shells");
    const target = stackOn(fx.state, centre);
    const around = inBlast(fx.state, centre)
      .filter((s) => !sameHex(s.hex, centre))
      .map((s) => s.id);
    if (target !== null)
      fx.strike(me, target.id, { kind: "shot", area, label: "Shell" });
    for (const id of around) {
      if (!fx.isAlive(id) || !fx.isAlive(me)) continue;
      fx.strike(me, id, {
        kind: "shot",
        area,
        percent: SHELL_SPLASH_PERCENT,
        label: "Shell splash",
      });
    }
    if (incendiary)
      fx.addGround({
        hex: centre,
        kind: "fire",
        size: Math.min(INCENDIARY_MAX, count),
        clock: 2,
        source: "incendiary-shells",
      });
  });

  registerAbility({
    id: "ram",
    name: "Ram",
    description:
      "When a melee Strike by the Steam Tanks spends Steam, the stack struck is pushed 1 hex directly away from them per point of that Steam, before it retaliates. No longer next to them, it does not retaliate.",
    onStrike(ctx, owner) {
      if (owner.id !== ctx.attacker.id || ctx.kind === "shot") return null;
      const size = steamOf(ctx.attacker);
      if (size <= 0 || !isAdjacent(ctx.attacker.hex, ctx.defender.hex))
        return null;
      const target = ctx.defender.id;
      return (fx) => {
        if (!fx.isAlive(target) || !fx.isAlive(owner.id)) return;
        fx.push(target, fx.stack(owner.id).hex, size);
      };
    },
  });

  registerAbility({
    id: "turret",
    name: "Turret",
    description:
      "The Ironclads may shoot with an enemy next to them, and none of their Strikes is halved for a shooter in melee.",
    pointBlank: true,
  });

  // --- Drills --------------------------------------------------------------
  registerAbility({
    id: "salvage",
    name: "Salvage",
    description:
      "Patch Up may be used again on every later turn on which a wreck lies on or next to the Tinkers' hex; each further use consumes one such wreck.",
  });

  registerAbility({
    id: "red-hot-rivets",
    name: "Red-Hot Rivets",
    description:
      "The Rivet Gunners' shots deal 25% more damage to a stack that is Burning or stands in fire.",
    damageMultiplier(ctx, owner) {
      if (owner.id !== ctx.attacker.id || ctx.kind !== "shot") return null;
      const burning = ctx.defender.conditions.some((c) => c.kind === "burning");
      const fire = groundAt(ctx.state, ctx.defender.hex)?.kind === "fire";
      return burning || fire
        ? {
            source: "red-hot-rivets",
            label: "Red-Hot Rivets",
            percent: RED_HOT_PERCENT,
          }
        : null;
    },
  });

  registerAbility({
    id: "incendiary-shells",
    name: "Incendiary Shells",
    description:
      "After a shell's Strikes, its hex catches fire of the Mortars' count (at most 30) for 2 rounds.",
  });

  // --- Town buildings (granted to natives by the battle resolver) ---------
  registerAbility({
    id: "the-great-boiler",
    name: "The Great Boiler",
    description: "This native stack starts each battle with Steam 1.",
    onBattleStart(fx, ownerId) {
      addSteam(fx, ownerId, 1);
    },
  });

  // --- Commands --------------------------------------------------------------
  registerAct({
    id: "ramming-speed",
    name: "Ramming Speed",
    text: COMMANDS["ramming-speed"]?.text ?? "",
    kind: "command",
    targets: 2,
    targetKinds: ["stack", "stack"],
    check(state, actorId, t) {
      const me = stackOf(state, actorId);
      const f = stackOf(state, targetStack(t[0]) ?? "");
      const e = stackOf(state, targetStack(t[1]) ?? "");
      if (!me || !f || !e) return "choose a friendly and an enemy stack";
      if (f.side !== me.side) return "the first must be friendly";
      if (e.side === me.side) return "the second must be an enemy";
      if (lineDirection(f.hex, e.hex) === null)
        return "they must be in a straight hex line";
      const reach = RAMMING_REACH + commandC(state, me.side);
      return hexDistance(f.hex, e.hex) <= reach
        ? null
        : `they must be within ${reach} hexes`;
    },
    aiTargets: (state, actorId) => {
      const out: ActTarget[][] = [];
      for (const f of friendsOf(state, actorId))
        for (const e of enemiesOf(state, actorId))
          if (lineDirection(f.hex, e.hex) !== null)
            out.push([{ stack: f.id }, { stack: e.id }]);
      return out;
    },
    resolve(fx, _actorId, t) {
      const friend = targetStack(t[0]) as StackId;
      const enemy = targetStack(t[1]) as StackId;
      if (!fx.isAlive(friend) || !fx.isAlive(enemy)) return;
      const from = fx.stack(friend).hex;
      const to = fx.stack(enemy).hex;
      const dir = lineDirection(from, to);
      if (dir === null) return;
      // Pushed until it stops: the enemy itself stops it next to it.
      fx.pushDir(friend, dir, hexDistance(from, to));
      if (!fx.isAlive(friend) || !fx.isAlive(enemy)) return;
      if (!isAdjacent(fx.stack(friend).hex, fx.stack(enemy).hex)) return;
      // A special melee Strike, not retaliated; a shooter's is halved as
      // any shooter's in melee (Turret excepted).
      const c = fx.stack(friend).creature;
      const halved = isRangedCreature(c) && !shootsPointBlank(c);
      fx.strike(friend, enemy, {
        kind: "special",
        label: "Ramming Speed",
        ...(halved ? { percent: 50 } : {}),
      });
    },
  });

  registerAct({
    id: "overpressure",
    name: "Blow Off Steam",
    text: COMMANDS.overpressure?.text ?? "",
    kind: "command",
    targets: 1,
    targetKinds: ["stack"],
    area(state, _actorId, t) {
      const s = stackOf(state, targetStack(t[0]) ?? "");
      return s === null ? [] : neighbors(s.hex);
    },
    check(state, _actorId, t) {
      const s = stackOf(state, targetStack(t[0]) ?? "");
      if (!s) return "choose a stack";
      return steamCondition(s) !== null ? null : "the stack must bear Steam";
    },
    aiTargets: (state) =>
      oneEach(living(state).filter((s) => steamCondition(s) !== null)),
    resolve(fx, actorId, t) {
      const bearer = targetStack(t[0]) as StackId;
      if (!fx.isAlive(bearer)) return;
      const c = steamCondition(fx.stack(bearer));
      if (c === null) return;
      const side = fx.sideOf(actorId);
      const x = OVERPRESSURE_HARM * commandC(fx.state, side) * c.size;
      const centre = fx.stack(bearer).hex;
      fx.endCondition(bearer, c.uid);
      const around = living(fx.state)
        .filter((s) => s.id !== bearer && isAdjacent(s.hex, centre))
        .map((s) => s.id);
      for (const id of around) fx.harm(id, x, { area: { centre, side } });
    },
  });
}
