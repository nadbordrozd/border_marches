/**
 * The Goblin Horde (FACTION_GOBLINS.md): Launched (birthright), the six
 * units' abilities, the three Drills and the two Commands.
 */

import {
  hexDistance,
  inBounds,
  isAdjacent,
  neighbors,
  sameHex,
  stepHex,
} from "../hex.ts";
import type { Hex } from "../hex.ts";
import { registerAbility, registerAct } from "../registry.ts";
import type { AreaRef } from "../registry.ts";
import { stackTotalHp } from "../resolve.ts";
import type { ActTarget, BattleSide, BattleStack, StackId } from "../types.ts";
import {
  commandC,
  enemiesOf,
  friendsOf,
  inBlast,
  living,
  sideFlags,
  stackOf,
  targetHex,
  targetStack,
} from "./common.ts";

/** Side flag: Launch Ramp (a Launched native gains Lucky). */
export const LAUNCH_RAMP = "launch-ramp";

/** Hex direction (0 E .. 5 NE) toward the enemy's deployment column. */
function towardEnemy(side: BattleSide): number {
  return side === "attacker" ? 0 : 3;
}

/** A hex and the hexes adjacent to it (a blast's outline). */
function blastHexes(centre: Hex): Hex[] {
  return [centre, ...neighbors(centre)];
}

/** The direction from `from` to a hex in a straight line from it, or null. */
export function lineDirection(from: Hex, to: Hex): number | null {
  const n = hexDistance(from, to);
  if (n === 0) return null;
  for (let dir = 0; dir < 6; dir++) {
    let cur = from;
    for (let i = 0; i < n; i++) cur = stepHex(cur, dir);
    if (sameHex(cur, to)) return dir;
  }
  return null;
}

export function registerGoblins(): void {
  // --- Birthright ----------------------------------------------------------
  registerAbility({
    id: "launched",
    name: "Launched",
    description:
      "Caught in an area effect made by the side it fights for, this native stack takes no damage and no condition from it and is pushed 3 hexes directly away from the centre (from the centre hex: 3 hexes along its row toward the enemy).",
    onArea(fx, ownerId, area: AreaRef) {
      const side = fx.sideOf(ownerId);
      if (side !== area.side) return false;
      const me = fx.stack(ownerId);
      if (sameHex(me.hex, area.centre))
        fx.pushDir(ownerId, towardEnemy(side), 3);
      else fx.push(ownerId, area.centre, 3);
      if (
        fx.isAlive(ownerId) &&
        sideFlags(fx.state, side).includes(LAUNCH_RAMP)
      )
        fx.addCondition(ownerId, { kind: "lucky", source: LAUNCH_RAMP });
      return true;
    },
  });

  // --- Units ---------------------------------------------------------------
  registerAbility({
    id: "cannonball",
    name: "Cannonball",
    description:
      "After being pushed or pulled 1 or more hexes and stopping adjacent to an enemy, the stack makes a special Strike on the stack that stopped it (or the nearest adjacent enemy) at +25% per hex moved (max +150%). Not retaliated.",
    onMoved(info, owner) {
      const me = owner.id;
      return (fx) => {
        if (!fx.isAlive(me)) return;
        const side = fx.sideOf(me);
        const at = fx.stack(me).hex;
        const enemies = living(fx.state).filter(
          (s) => fx.sideOf(s.id) !== side && isAdjacent(s.hex, at),
        );
        if (enemies.length === 0) return;
        const stopper =
          info.stoppedBy !== null
            ? enemies.find((s) => s.id === info.stoppedBy)
            : undefined;
        const target = (stopper ?? enemies[0]) as BattleStack;
        fx.strike(me, target.id, {
          kind: "special",
          percent: 100 + Math.min(150, 25 * info.hexes),
          label: "Cannonball",
        });
      };
    },
  });

  registerAbility({
    id: "bomb",
    name: "Bomb",
    description:
      "The shot may target any hex and is an area effect centred there: a shot Strike on the stack in that hex and a shot Strike at x 50% on every stack adjacent to it, friend or foe.",
    shootAnyHex: true,
    shotArea: (_state, centre) => blastHexes(centre),
    shot(fx, ownerId, centre, targetId) {
      const me = fx.stack(ownerId);
      const area: AreaRef = { centre, side: fx.sideOf(ownerId) };
      const pots = me.creature.abilities.includes("fire-pots");
      const count = me.count;
      const around = inBlast(fx.state, centre)
        .filter((s) => !sameHex(s.hex, centre))
        .map((s) => s.id);
      if (targetId !== null && fx.isAlive(targetId)) {
        const hit = fx.strike(ownerId, targetId, { kind: "shot", area });
        if (hit && pots && fx.isAlive(targetId)) {
          fx.addCondition(targetId, {
            kind: "burning",
            size: 2 * count,
            clock: 3,
            tier: me.creature.tier,
            source: "fire-pots",
          });
        }
      }
      for (const id of around) {
        if (!fx.isAlive(id) || !fx.isAlive(ownerId)) continue;
        fx.strike(ownerId, id, {
          kind: "shot",
          area,
          percent: 50,
          label: "Bomb splash",
        });
      }
    },
  });

  registerAbility({
    id: "worry",
    name: "Worry",
    description:
      "A stack struck by the Wolf Riders (attack or retaliation) gains Venomed 3 for 2 rounds.",
    onStrike(ctx, owner) {
      if (owner.id !== ctx.attacker.id) return null;
      if (ctx.kind !== "melee" && ctx.kind !== "retaliation") return null;
      const target = ctx.defender.id;
      const tier = owner.creature.tier;
      return (fx) => {
        fx.addCondition(target, {
          kind: "venomed",
          size: 3,
          clock: 2,
          tier,
          source: owner.id,
        });
      };
    },
  });

  registerAct({
    id: "hurl",
    name: "Hurl",
    text: "An adjacent stack of any side with total HP at most 40 per Ogre is pushed 6 hexes directly away from the Ogres.",
    kind: "ability",
    targets: 1,
    targetKinds: ["stack"],
    check(state, actorId, t) {
      const me = stackOf(state, actorId);
      const s = stackOf(state, targetStack(t[0]) ?? "");
      if (!me || !s || s.id === me.id) return "choose another stack";
      if (!isAdjacent(me.hex, s.hex)) return "it must be adjacent";
      const limit = 40 * me.count;
      const hp = stackTotalHp(s);
      return hp <= limit ? null : `limit ${limit} HP, the stack has ${hp}`;
    },
    aiTargets: (state, actorId) =>
      living(state)
        .filter((s) => s.id !== actorId)
        .map((s) => [{ stack: s.id }]),
    resolve(fx, actorId, t) {
      fx.push(targetStack(t[0]) as StackId, fx.stack(actorId).hex, 6);
    },
  });
  registerAbility({
    id: "hurl",
    name: "Hurl",
    description:
      "Every turn, in place of an attack (may walk first): an adjacent stack of any side with total HP at most 40 per Ogre is pushed 6 hexes directly away from the Ogres.",
    act: "hurl",
    moveFirst: true,
    everyTurn: true,
  });

  registerAbility({
    id: "stomp",
    name: "Stomp",
    description:
      "The melee attack is an area effect centred on the Warbosses' hex: the Strike on the target and a special Strike at x 50% on every other stack adjacent to the Warbosses, friend or foe. Only the target retaliates.",
    onStrike(ctx, owner) {
      if (owner.id !== ctx.attacker.id || ctx.kind !== "melee") return null;
      const target = ctx.defender.id;
      const centre = owner.hex;
      const side = owner.side;
      const others = ctx.state.stacks
        .filter(
          (s) =>
            s.count > 0 &&
            s.id !== owner.id &&
            s.id !== target &&
            isAdjacent(s.hex, centre),
        )
        .map((s) => s.id);
      return (fx) => {
        const area: AreaRef = { centre, side };
        for (const id of others) {
          if (!fx.isAlive(id) || !fx.isAlive(owner.id)) continue;
          fx.strike(owner.id, id, {
            kind: "special",
            area,
            percent: 50,
            label: "Stomp",
          });
        }
      };
    },
  });

  // --- Drills --------------------------------------------------------------
  registerAbility({
    id: "fire-pots",
    name: "Fire Pots",
    description:
      "The stack on a Bomb's centre hex gains Burning of 2 per Bomb Chucker for 3 rounds.",
  });

  registerAbility({
    id: "hit-and-run",
    name: "Hit and Run",
    description:
      "After their melee attack and its retaliation, the Wolf Riders may walk up to 3 hexes.",
    walkAfterAttack: 3,
  });

  // --- Commands --------------------------------------------------------------
  registerAct({
    id: "heave-ho",
    name: "Heave-Ho",
    text: "Up to C + 1 times: choose a friendly stack and a hex in a straight line from it; the stack is pushed 4 hexes toward that hex.",
    kind: "command",
    targets: 2,
    targetStep: 2,
    targetKinds: ["stack", "hex"],
    maxTargets: (state, actorId) => {
      const me = stackOf(state, actorId);
      return 2 * ((me ? commandC(state, me.side) : 1) + 1);
    },
    area(state, _actorId, t) {
      // The push line of the last pair: 4 hexes on from the stack.
      const i = t.length % 2 === 0 ? t.length - 2 : t.length - 1;
      const s = stackOf(state, targetStack(t[i]) ?? "");
      const h = targetHex(t[i + 1]);
      if (!s || h === null) return [];
      const dir = lineDirection(s.hex, h);
      if (dir === null) return [];
      const out: Hex[] = [];
      let cur = s.hex;
      for (let k = 0; k < 4; k++) {
        cur = stepHex(cur, dir);
        if (!inBounds(cur)) break;
        out.push(cur);
      }
      return out;
    },
    check(state, actorId, t) {
      const me = stackOf(state, actorId);
      for (let i = 0; i + 1 < t.length; i += 2) {
        const s = stackOf(state, targetStack(t[i]) ?? "");
        const h = targetHex(t[i + 1]);
        if (!me || !s || s.side !== me.side) return "choose a friendly stack";
        if (h === null || lineDirection(s.hex, h) === null)
          return "choose a hex in a straight line from it";
      }
      return null;
    },
    aiTargets: (state, actorId) => {
      const out: ActTarget[][] = [];
      for (const s of friendsOf(state, actorId)) {
        for (let dir = 0; dir < 6; dir++) {
          let h = s.hex;
          for (let i = 0; i < 4; i++) {
            const n = stepHex(h, dir);
            if (!inBounds(n)) break;
            h = n;
          }
          if (!sameHex(h, s.hex)) out.push([{ stack: s.id }, { hex: h }]);
        }
      }
      return out;
    },
    resolve(fx, _actorId, t) {
      for (let i = 0; i + 1 < t.length; i += 2) {
        const id = targetStack(t[i]) as StackId;
        const h = targetHex(t[i + 1]) as Hex;
        if (!fx.isAlive(id)) continue;
        const dir = lineDirection(fx.stack(id).hex, h);
        if (dir !== null) fx.pushDir(id, dir, 4);
      }
    },
  });

  registerAct({
    id: "kaboom",
    name: "Kaboom",
    text: "Choose a hex: every stack on it or adjacent to it takes Harm 30 x C. An area effect.",
    kind: "command",
    targets: 1,
    targetKinds: ["hex"],
    area: (_s, _a, t) => {
      const h = targetHex(t[0]);
      return h === null ? [] : blastHexes(h);
    },
    check: (_s, _a, t) => (targetHex(t[0]) === null ? "choose a hex" : null),
    aiTargets: (state, actorId) => {
      const seen = new Set<string>();
      const out: ActTarget[][] = [];
      for (const e of enemiesOf(state, actorId)) {
        for (const h of [e.hex, ...neighbors(e.hex)]) {
          const k = `${h.col},${h.row}`;
          if (!inBounds(h) || seen.has(k)) continue;
          seen.add(k);
          out.push([{ hex: h }]);
        }
      }
      return out;
    },
    resolve(fx, actorId, t) {
      const centre = targetHex(t[0]) as Hex;
      const side = fx.sideOf(actorId);
      const x = 30 * commandC(fx.state, side);
      for (const s of inBlast(fx.state, centre))
        fx.harm(s.id, x, { area: { centre, side } });
    },
  });
}
