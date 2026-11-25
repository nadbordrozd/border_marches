/**
 * Hero effects in battle (RULES_V2 3, 4.6): how skills, feats, vows,
 * specialties and artifacts enter the battle grammar through the registry.
 *
 * - **Strike percentages and stack stats** (form 1 battle numbers: Onslaught,
 *   Bulwark, a Creature specialty, Vow of the Unlettered) become registered
 *   abilities with ids `hero-mod:<side>:...`. Every stack on the field
 *   carries both sides' hero abilities; each applies only while its owner
 *   fights for that side (RULES_V2 1.2: "a stack with hero bonuses takes
 *   them from the hero of the side it currently fights for"). The id
 *   encodes the numbers, so registration is lazy and deterministic.
 * - **Battle-start rules** (form 2) are `startRules` that name the effect
 *   {@link HERO_START_EFFECT} with the rule as JSON arguments.
 * - **Item acts** (form 4) are acts of kind "item" registered here; a side
 *   may use those its hero lists in `HeroBattleStats.itemActs`.
 * - **Rule switches** (form 5) travel in the game layer's battle profile
 *   (core/game/battle.ts) for the magic bead (bzc.9) to read.
 *
 * Speed from a stack-stats effect is added to the stack's creature stats
 * at setup ({@link heroSpeedBonus}): the grammar has no Speed hook for
 * abilities.
 */
import type {
  BattleStartRule,
  StackSelector,
  StrikeFilter,
} from "../../data/effects.ts";
import { isAlive } from "./abilities.ts";
import { creatureFightValue } from "./damage.ts";
import {
  hasConditionKind,
  registerAbility,
  registerAct,
  registerEffect,
  type EffectFn,
} from "./registry.ts";
import { effectiveSpeed, sideOf } from "./resolve.ts";
import { isAdjacent } from "./hex.ts";
import type {
  BattleSide,
  BattleStack,
  BattleState,
  ConditionSpec,
  EffectRef,
  JsonValue,
  StrikeKind,
} from "./types.ts";

/** Prefix of every hero modifier ability id. */
export const HERO_ABILITY_PREFIX = "hero-mod:";

/** A Strike percentage from a hero's skill, feat or artifact. */
export interface HeroStrikeModifier {
  /** Display label, e.g. "Onslaught 2". */
  label: string;
  strike: StrikeFilter;
  direction: "dealt" | "taken";
  /** +10 is x 110%, -20 is x 80%. */
  percent: number;
  /** Only against a stack bearing one of these condition kinds. */
  targetBears?: readonly string[];
}

/** Flat stats for the side's stacks, or one creature's (a specialty). */
export interface HeroStackModifier {
  label: string;
  /** Creature id; every stack when absent. */
  creature?: string;
  attack: number;
  defense: number;
  speed: number;
}

const registered = new Set<string>();

function strikeMatches(filter: StrikeFilter, kind: StrikeKind): boolean {
  if (filter === "all") return true;
  if (filter === "shot") return kind === "shot";
  return kind === "melee" || kind === "retaliation";
}

function key(text: string): string {
  return text.replace(/[^a-z0-9.-]+/gi, "_");
}

/** The ability id of a Strike percentage of `side`, registered on first use. */
export function strikeAbilityId(
  side: BattleSide,
  m: HeroStrikeModifier,
): string {
  const bears = (m.targetBears ?? []).join("+");
  const id = `${HERO_ABILITY_PREFIX}${side}:strike:${m.strike}:${m.direction}:${m.percent}:${bears}:${key(m.label)}`;
  if (registered.has(id)) return id;
  registered.add(id);
  const percent = 100 + m.percent;
  registerAbility({
    id,
    name: m.label,
    description: `${m.direction === "dealt" ? "Strikes by" : "Strikes against"} this side's stacks are x ${percent}% (hero).`,
    damageMultiplier(ctx, owner) {
      if (sideOf(owner) !== side || !strikeMatches(m.strike, ctx.kind)) {
        return null;
      }
      const mine = m.direction === "dealt" ? ctx.attacker : ctx.defender;
      if (owner.id !== mine.id) return null;
      if (
        m.targetBears !== undefined &&
        !ctx.defender.conditions.some((c) => m.targetBears?.includes(c.kind))
      ) {
        return null;
      }
      return { source: id, label: m.label, percent };
    },
  });
  return id;
}

/** The ability id of flat stack stats of `side`, registered on first use. */
export function stackAbilityId(
  side: BattleSide,
  m: HeroStackModifier,
): string | null {
  if (m.attack === 0 && m.defense === 0) return null;
  const id = `${HERO_ABILITY_PREFIX}${side}:stack:${m.creature ?? "*"}:${m.attack}:${m.defense}:${key(m.label)}`;
  if (registered.has(id)) return id;
  registered.add(id);
  const applies = (s: BattleStack): boolean =>
    sideOf(s) === side &&
    (m.creature === undefined || s.creature.id === m.creature);
  registerAbility({
    id,
    name: m.label,
    description: `+${m.attack} Attack and +${m.defense} Defense${m.creature ? ` for ${m.creature}` : ""} (hero).`,
    attackModifier(ctx, owner) {
      if (owner.id !== ctx.attacker.id || !applies(owner) || m.attack === 0) {
        return null;
      }
      return { source: id, label: m.label, amount: m.attack };
    },
    defenseModifier(ctx, owner) {
      if (owner.id !== ctx.defender.id || !applies(owner) || m.defense === 0) {
        return null;
      }
      return { source: id, label: m.label, amount: m.defense };
    },
  });
  return id;
}

/** Every hero ability id of one side's modifiers. */
export function heroAbilityIds(
  side: BattleSide,
  strikes: readonly HeroStrikeModifier[],
  stacks: readonly HeroStackModifier[],
): string[] {
  const out: string[] = [];
  for (const m of strikes) out.push(strikeAbilityId(side, m));
  for (const m of stacks) {
    const id = stackAbilityId(side, m);
    if (id !== null) out.push(id);
  }
  return out;
}

/** Speed a side's hero adds to stacks of one creature (stack-stats speed). */
export function heroSpeedBonus(
  stacks: readonly HeroStackModifier[],
  creature: string,
): number {
  let n = 0;
  for (const m of stacks) {
    if (m.creature === undefined || m.creature === creature) n += m.speed;
  }
  return n;
}

// ---------------------------------------------------------------- start rules

/** The effect id battle-start rules of heroes name. */
export const HERO_START_EFFECT = "hero-start";

/** Stacks of `side` chosen by a selector (ties to field order). */
export function selectStacks(
  stacks: readonly BattleStack[],
  side: BattleSide,
  selector: StackSelector,
  count = 1,
): BattleStack[] {
  const mine = stacks
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => isAlive(s) && sideOf(s) === side);
  if (selector === "all") return mine.map(({ s }) => s);
  const fv = (s: BattleStack): number =>
    s.count * creatureFightValue(s.creature);
  const pool =
    selector === "strongest-shooter"
      ? mine.filter(({ s }) => (s.creature.shots ?? 0) > 0)
      : mine;
  const measure = (s: BattleStack): number => {
    switch (selector) {
      case "strongest":
      case "strongest-shooter":
        return -fv(s);
      case "weakest":
        return fv(s);
      case "fastest":
        return -effectiveSpeed(s);
      case "slowest":
        return effectiveSpeed(s);
    }
  };
  return pool
    .sort((a, b) => measure(a.s) - measure(b.s) || a.i - b.i)
    .slice(0, count)
    .map(({ s }) => s);
}

const other = (side: BattleSide): BattleSide =>
  side === "attacker" ? "defender" : "attacker";

const heroStart: EffectFn = (fx, args, owner) => {
  const rule = args as unknown as BattleStartRule & { source?: string };
  if (!hasConditionKind(rule.condition)) return; // kind not implemented yet
  const side = rule.side === "own" ? owner.side : other(owner.side);
  const spec: ConditionSpec = {
    kind: rule.condition,
    ...(rule.size !== undefined ? { size: rule.size } : {}),
    clock: rule.clock,
    // A gateless Hold says so (CONTENT_ARTIFACTS 4); rules give no gate.
    gate: null,
    tier: rule.tier ?? 3,
    source: rule.source ?? owner.source,
  };
  for (const s of selectStacks(
    fx.state.stacks,
    side,
    rule.selector,
    rule.count,
  )) {
    if (rule.linkTo !== undefined) {
      const farSide =
        rule.linkTo.side === "own" ? owner.side : other(owner.side);
      const far = selectStacks(
        fx.state.stacks,
        farSide,
        rule.linkTo.selector,
      )[0];
      if (far !== undefined) fx.link(s.id, far.id, spec);
    } else {
      fx.addCondition(s.id, spec);
    }
  }
};

registerEffect(HERO_START_EFFECT, heroStart);

/** A hero's battle-start rules as the setup's `startRules`. */
export function startRuleRefs(
  rules: ReadonlyArray<{ rule: BattleStartRule; source: string }>,
): EffectRef[] {
  return rules.map(({ rule, source }) => ({
    id: HERO_START_EFFECT,
    args: { ...rule, source } as unknown as JsonValue,
  }));
}

// ---------------------------------------------------------------- item acts

/**
 * A Pinch of Sand (CONTENT_ARTIFACTS 5): change one condition's clock by
 * 2, as the Wind tool. Target: { stack, condition }. Direction: longer for
 * a boon on the hero's side or a bane on the other, shorter otherwise
 * (Holds only shorten; the verb enforces it).
 */
registerAct({
  id: "a-pinch-of-sand",
  name: "A Pinch of Sand",
  text: "Change one condition's clock by 2 either way, exactly as the Wind tool.",
  kind: "item",
  targets: 1,
  check(state, _actorId, targets) {
    const t = targets[0];
    if (targets.length !== 1 || t === undefined || !("condition" in t)) {
      return "choose one condition";
    }
    const s = state.stacks.find((x) => x.id === t.stack);
    const c = s?.conditions.find((x) => x.uid === t.condition);
    if (c === undefined) return "no such condition";
    return c.clock === null ? "the condition has no clock" : null;
  },
  aiTargets: (state) =>
    state.stacks.flatMap((s) =>
      s.count > 0
        ? s.conditions
            .filter((c) => c.clock !== null)
            .map((c) => [{ stack: s.id, condition: c.uid }])
        : [],
    ),
  resolve(fx, actorId, targets) {
    const t = targets[0];
    if (t === undefined || !("condition" in t)) return;
    const s = fx.stack(t.stack);
    const c = s.conditions.find((x) => x.uid === t.condition);
    if (c === undefined) return;
    const heroSide = fx.sideOf(actorId);
    const friendly = sideOf(s) === heroSide;
    const longer = (c.polarity === "boon") === friendly;
    fx.windCondition(t.stack, t.condition, longer ? 2 : -2);
  },
});

/** The side the active stack (the hero's acting stack) fights for. */
function actorSide(state: BattleState, actorId: string): BattleSide | null {
  const a = state.stacks.find((x) => x.id === actorId);
  return a === undefined ? null : sideOf(a);
}

/**
 * The Bellhop's Cap (CONTENT_ARTIFACTS 3): choose one of your stacks, then
 * move one condition from a stack adjacent to it to another stack adjacent
 * to it (landing rules apply). Targets: { stack: hub }, { stack, condition
 * } (the condition to move), { stack } (where it goes).
 */
registerAct({
  id: "the-bellhops-cap",
  name: "The Bellhop's Cap",
  text: "Choose one of your stacks; move one condition from a stack adjacent to it to another stack adjacent to it.",
  kind: "item",
  targets: 3,
  check(state, actorId, targets) {
    const [hubT, fromT, toT] = targets;
    if (
      targets.length !== 3 ||
      hubT === undefined ||
      !("stack" in hubT) ||
      fromT === undefined ||
      !("condition" in fromT) ||
      toT === undefined ||
      !("stack" in toT)
    ) {
      return "choose one of your stacks, a condition beside it and a stack beside it";
    }
    const find = (id: string): BattleStack | undefined =>
      state.stacks.find((x) => x.id === id && isAlive(x));
    const hub = find(hubT.stack);
    const from = find(fromT.stack);
    const to = find(toT.stack);
    if (hub === undefined || from === undefined || to === undefined)
      return "no such stack";
    if (sideOf(hub) !== actorSide(state, actorId))
      return "the first stack must be one of yours";
    if (!isAdjacent(hub.hex, from.hex) || !isAdjacent(hub.hex, to.hex))
      return "both stacks must be adjacent to your stack";
    if (from.id === to.id) return "the condition must move to another stack";
    return from.conditions.some((c) => c.uid === fromT.condition)
      ? null
      : "no such condition";
  },
  resolve(fx, _actorId, targets) {
    const from = targets[1];
    const to = targets[2];
    if (from === undefined || !("condition" in from)) return;
    if (to === undefined || !("stack" in to)) return;
    fx.moveCondition(from.stack, from.condition, to.stack);
  },
});

/**
 * Tinderbox (CONTENT_ARTIFACTS 3): the side's spent Fuel is restored, so
 * it may Fuel once more this battle (never above 3, RULES_V2 1.11).
 */
registerAct({
  id: "tinderbox",
  name: "Tinderbox",
  text: "Your spent Fuel is restored, so you may Fuel a second time this battle.",
  kind: "item",
  targets: 0,
  check(state, actorId) {
    const side = actorSide(state, actorId);
    const m = side === null ? undefined : state.sides[side].magic;
    if (m === undefined) return "the hero has no magic";
    return m.fuelMax >= 3 ? "Fuel is already at its most" : null;
  },
  resolve(fx, actorId) {
    fx.changeMagic(fx.sideOf(actorId), (m) => ({
      ...m,
      fuelMax: Math.min(3, m.fuelMax + 1),
    }));
  },
});

/**
 * Cider Flask (CONTENT_ARTIFACTS 3): end Ripening on one of your stacks;
 * it heals 3 x that size in HP, reviving. Target: { stack, condition }.
 */
registerAct({
  id: "cider-flask",
  name: "Cider Flask",
  text: "End Ripening on one of your stacks; it heals 3 x that size in HP, reviving.",
  kind: "item",
  targets: 1,
  check(state, actorId, targets) {
    const t = targets[0];
    if (targets.length !== 1 || t === undefined || !("condition" in t))
      return "choose Ripening on one of your stacks";
    const s = state.stacks.find((x) => x.id === t.stack);
    if (s === undefined || sideOf(s) !== actorSide(state, actorId))
      return "the stack must be one of yours";
    const c = s.conditions.find((x) => x.uid === t.condition);
    return c?.kind === "ripening" ? null : "choose a Ripening";
  },
  resolve(fx, _actorId, targets) {
    const t = targets[0];
    if (t === undefined || !("condition" in t)) return;
    const c = fx.stack(t.stack).conditions.find((x) => x.uid === t.condition);
    if (c === undefined) return;
    fx.endCondition(t.stack, c.uid);
    fx.heal(t.stack, 3 * c.size, { revive: true });
  },
});

/** Item act ids registered here (every artifact `itemActs` entry). */
export const ITEM_ACT_IDS: readonly string[] = [
  "a-pinch-of-sand",
  "the-bellhops-cap",
  "tinderbox",
  "cider-flask",
];
