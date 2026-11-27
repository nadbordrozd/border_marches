/**
 * The sea guardians' abilities and the Swimmer flag (docs/design/NAVAL.md
 * 3.1 and 4.2, bead bzc.152) in the battle grammar. Each reuses an
 * existing condition or rule (NAVAL.md 4.5, no new condition kind):
 *
 * - Stinging Bell: Thorned at battle start (the Groundskeepers' Tend kind).
 * - Dead Weight: Slowed on a melee Strike.
 * - Carapace: the Skeletons' Bony under a crab's name.
 * - Swing Across: the Vampires' Mist (a teleport walk).
 * - Siren Song: the Riggers' Tow with a Mollified rider.
 * - Blood in the Water: a Strike condition on a visible count (the
 *   Lamplighters' shape), never on HP.
 * - Coil: Stuck on a melee Strike (a maker outside the Candy Kingdom).
 * - Many Arms: special Strikes like the Warboss's Stomp, enemies only.
 * - Swimmer: a flag (`AbilityDef.swimmer`) the naval battlefield reads; on a
 *   land field it changes nothing.
 *
 * Condition kinds come from magic (Thorned, Slowed, Mollified) and the
 * Candy Kingdom (Stuck); a missing kind makes that part do nothing (see
 * {@link tryCondition}). Imported for its side effect by the battle
 * resolver, like the strays' abilities.
 */
import { SEA_ABILITY_TEXT } from "../../data/sea.ts";
import type { SeaAbilityId } from "../../data/types.ts";
import { abilityParam, isAlive } from "./abilities.ts";
import { hexDistance, isAdjacent } from "./hex.ts";
import {
  hasAbility,
  hasAct,
  hasConditionKind,
  registerAbility as registerAbilityStrict,
  registerAct as registerActStrict,
  type AbilityDef,
  type ActDef,
  type Effects,
} from "./registry.ts";
import type { ActTarget, ConditionSpec, StackId } from "./types.ts";

/** Hexes the Sirens' Song reaches and pulls (NAVAL.md 4.2). */
export const SIREN_SONG_RANGE = 6;
export const SIREN_SONG_PULL = 3;
/** Mollified size and clock the Song adds. */
export const SIREN_SONG_MOLLIFIED = 30;
/** Stinging Bell's Thorned: 1 per Jellyfish, at most this. */
export const STINGING_BELL_MAX = 20;
/** Blood in the Water's percentage on a stack below its deployed count. */
export const BLOOD_IN_THE_WATER_PERCENT = 150;
/** Many Arms' special Strikes, as a percentage. */
export const MANY_ARMS_PERCENT = 50;

/** Registers unless another content module already did (idempotent). */
function registerAbility(def: AbilityDef): void {
  if (!hasAbility(def.id)) registerAbilityStrict(def);
}
function registerAct(def: ActDef): void {
  if (!hasAct(def.id)) registerActStrict(def);
}

function info(
  id: SeaAbilityId,
): Pick<AbilityDef, "id" | "name" | "description"> {
  const t = SEA_ABILITY_TEXT[id];
  return { id, name: t.name, description: t.text };
}

/** Adds a condition when its kind is registered; otherwise nothing. */
function tryCondition(fx: Effects, target: StackId, spec: ConditionSpec): void {
  if (!hasConditionKind(spec.kind)) return;
  if (!fx.isAlive(target)) return;
  fx.addCondition(target, spec);
}

/** Adds a condition to the stack the owner attacks in melee. */
function onOwnMelee(
  id: SeaAbilityId,
  spec: ConditionSpec,
  extra: Partial<AbilityDef> = {},
): AbilityDef {
  return {
    ...info(id),
    ...extra,
    onStrike(ctx, owner) {
      if (owner.id !== ctx.attacker.id || ctx.kind !== "melee") return null;
      const target = ctx.defender.id;
      return (fx) => tryCondition(fx, target, spec);
    },
  };
}

/** Siren Song's check: one living enemy stack within its range. */
const sirenSongCheck: NonNullable<ActDef["check"]> = (state, actorId, t) => {
  const target = t[0];
  if (t.length !== 1 || target === undefined || !("stack" in target)) {
    return "choose one stack";
  }
  const me = state.stacks.find((s) => s.id === actorId);
  const them = state.stacks.find((s) => s.id === target.stack);
  if (me === undefined || them === undefined || !isAlive(them)) {
    return "no such stack";
  }
  if (them.id === me.id) return "choose another stack";
  if (them.side === me.side) return "an enemy stack";
  if (hexDistance(me.hex, them.hex) > SIREN_SONG_RANGE) {
    return `the stack must be within ${SIREN_SONG_RANGE} hexes`;
  }
  return null;
};

const target0 = (targets: readonly ActTarget[]): StackId => {
  const t = targets[0];
  return t !== undefined && "stack" in t ? t.stack : "";
};

/** The act text: the ability's text without its "Once per battle" lead. */
function actText(text: string): string {
  const rest = text.replace(/^Once per battle, instead of attacking: /, "");
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

let registered = false;

/** Registers every sea ability once (idempotent). */
export function registerSeaAbilities(): void {
  if (registered) return;
  registered = true;

  registerAbility({ ...info("swimmer"), swimmer: true });

  // Jellyfish: Thorned of size = count (at most 20), clockless, at battle
  // start (read once: a later loss does not shrink it).
  registerAbility({
    ...info("stinging-bell"),
    onBattleStart(fx, owner) {
      const n = Math.min(STINGING_BELL_MAX, fx.stack(owner).count);
      if (n <= 0) return;
      tryCondition(fx, owner, {
        kind: "thorned",
        size: n,
        clock: null,
        source: "stinging-bell",
      });
    },
  });

  registerAbility(
    onOwnMelee("dead-weight", {
      kind: "slowed",
      size: 1,
      clock: 2,
      source: "dead-weight",
    }),
  );

  // Bony under a crab's name: the same percentage as the Skeletons'.
  registerAbility({
    ...info("carapace"),
    damageMultiplier(ctx, owner) {
      if (owner.id !== ctx.defender.id || ctx.kind !== "shot") return null;
      return {
        source: "carapace",
        label: "Carapace",
        percent: abilityParam("bony", "rangedPercent"),
      };
    },
  });

  // Mist under a pirate's name. The sea hexes it may not land on are the
  // naval battlefield's rule (NAVAL.md 3.1).
  registerAbility({ ...info("swing-across"), teleportWalk: true });

  registerAbility({
    ...info("blood-in-the-water"),
    damageMultiplier(ctx, owner) {
      if (owner.id !== ctx.attacker.id) return null;
      const d = ctx.defender;
      if (d.count >= d.initialCount) return null;
      return {
        source: "blood-in-the-water",
        label: "Blood in the Water",
        percent: BLOOD_IN_THE_WATER_PERCENT,
      };
    },
  });

  registerAbility(
    onOwnMelee(
      "coil",
      { kind: "stuck", clock: 2, source: "coil" },
      { aiMeleeMakes: "stuck" },
    ),
  );

  // After its melee Strike: a special Strike at x 50% on every other enemy
  // stack next to it, read when the reaction resolves (not retaliated).
  registerAbility({
    ...info("many-arms"),
    onStrike(ctx, owner) {
      if (owner.id !== ctx.attacker.id || ctx.kind !== "melee") return null;
      const target = ctx.defender.id;
      const me = owner.id;
      return (fx) => {
        if (!fx.isAlive(me)) return;
        const side = fx.sideOf(me);
        const at = fx.stack(me).hex;
        const others = fx.state.stacks
          .filter(
            (s) =>
              s.id !== me &&
              s.id !== target &&
              isAlive(s) &&
              fx.sideOf(s.id) !== side &&
              isAdjacent(s.hex, at),
          )
          .map((s) => s.id);
        for (const id of others) {
          if (!fx.isAlive(id) || !fx.isAlive(me)) continue;
          fx.strike(me, id, {
            kind: "special",
            percent: MANY_ARMS_PERCENT,
            label: "Many Arms",
          });
        }
      };
    },
  });

  // Siren Song: once per battle, instead of attacking (it may move first).
  const song = SEA_ABILITY_TEXT["siren-song"];
  registerAct({
    id: "sea:siren-song",
    name: song.name,
    text: actText(song.text),
    kind: "ability",
    targets: 1,
    check: sirenSongCheck,
    resolve(fx, actorId, t) {
      const id = target0(t);
      if (!fx.isAlive(id)) return;
      fx.pull(id, fx.stack(actorId).hex, SIREN_SONG_PULL);
      tryCondition(fx, id, {
        kind: "mollified",
        size: SIREN_SONG_MOLLIFIED,
        clock: 2,
        source: "siren-song",
      });
    },
  });
  registerAbility({
    ...info("siren-song"),
    act: "sea:siren-song",
    moveFirst: true,
  });
}

registerSeaAbilities();
