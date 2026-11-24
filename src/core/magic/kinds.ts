/**
 * The condition and ground kinds of CONTENT_SPELLS.md section 2 that are
 * not engine-standard, and the two summoned creatures (Seedling, Shade) of
 * CONTENT_CREATURES.md section 4 with their death abilities.
 *
 * {@link registerMagicKinds} registers them once; it is idempotent.
 */

import {
  hasAbility,
  hasConditionKind,
  hasGroundKind,
  registerAbility,
  registerConditionKind,
  registerGroundKind,
} from "../battle/index.ts";
import type {
  BattleCreatureStats,
  ConditionKindDef,
  GroundKindDef,
} from "../battle/index.ts";

function clockText(clock: number | null): string {
  return clock === null
    ? "until the battle ends"
    : `for ${clock} round${clock === 1 ? "" : "s"}`;
}

/** The fourteen new condition kinds (CONTENT_SPELLS 2.1). */
export const MAGIC_CONDITION_KINDS: readonly ConditionKindDef[] = [
  {
    id: "mending",
    name: "Mending",
    school: "bloom",
    polarity: "boon",
    defaultClock: 3,
    text: (c) =>
      `Heals ${c.size} HP at its turn start, reviving, ${clockText(c.clock)}.`,
    onTurnStart(fx, holder, c) {
      fx.heal(holder, c.size, { revive: true });
    },
  },
  {
    id: "thorned",
    name: "Thorned",
    school: "bloom",
    polarity: "boon",
    defaultClock: 3,
    text: (c) =>
      `A stack striking it in melee takes ${c.size} Harm, ${clockText(c.clock)}.`,
    onStruck(ctx, holder, c) {
      if (holder.id !== ctx.defender.id) return null;
      if (ctx.kind !== "melee" && ctx.kind !== "retaliation") return null;
      const striker = ctx.attacker.id;
      return (fx) => {
        fx.harm(striker, c.size);
      };
    },
  },
  {
    id: "ripening",
    name: "Ripening",
    school: "bloom",
    polarity: "boon",
    defaultClock: 3,
    text: (c) =>
      `Its Strikes are x ${100 + c.size}%; grows by 10 at its turn start (max ${c.maxSize}), ${clockText(c.clock)}.`,
    strikeMultiplier(ctx, holder, c) {
      if (holder.id !== ctx.attacker.id) return null;
      return { source: "ripening", label: "Ripening", percent: 100 + c.size };
    },
    onTurnStart(fx, holder, c) {
      fx.feedCondition(holder, c.uid, 10);
    },
  },
  {
    id: "scapegoat",
    name: "Scapegoat",
    school: "accord",
    polarity: "boon",
    link: "redirect",
    defaultClock: 3,
    text: (c) =>
      `Damage to this stack goes to the far end as Harm, ${clockText(c.clock)}.`,
  },
  {
    id: "shielded",
    name: "Shielded",
    school: "accord",
    polarity: "boon",
    defaultClock: 3,
    text: (c) => `+${c.size} Defense ${clockText(c.clock)}.`,
    defenseModifier(ctx, holder, c) {
      if (holder.id !== ctx.defender.id || c.size === 0) return null;
      return { source: "shielded", label: "Shielded", amount: c.size };
    },
  },
  {
    id: "warded",
    name: "Warded",
    school: "accord",
    polarity: "boon",
    defaultClock: 3,
    text: (c) => `Harm it takes is x ${100 - c.size}% ${clockText(c.clock)}.`,
    harmTakenPercent: (_h, c) => 100 - Math.min(75, c.size),
  },
  {
    id: "mollified",
    name: "Mollified",
    school: "accord",
    polarity: "bane",
    defaultClock: 3,
    text: (c) => `Its Strikes are x ${100 - c.size}% ${clockText(c.clock)}.`,
    strikeMultiplier(ctx, holder, c) {
      if (holder.id !== ctx.attacker.id) return null;
      return {
        source: "mollified",
        label: "Mollified",
        percent: 100 - Math.min(75, c.size),
      };
    },
  },
  {
    id: "quickened",
    name: "Quickened",
    school: "clock",
    polarity: "boon",
    defaultClock: 2,
    text: (c) => `+${c.size} Speed ${clockText(c.clock)}.`,
    speedModifier: (_h, c) => c.size,
  },
  {
    id: "slowed",
    name: "Slowed",
    school: "clock",
    polarity: "bane",
    defaultClock: 2,
    text: (c) => `-${c.size} Speed (never below 1) ${clockText(c.clock)}.`,
    speedModifier: (_h, c) => -c.size,
  },
  {
    id: "reckoning",
    name: "Reckoning",
    school: "hush",
    polarity: "bane",
    debt: true,
    chargeFromSize: true,
    defaultClock: 3,
    text: (c) =>
      `A debt: takes ${c.size} Harm when the clock runs out (${clockText(c.clock)}).`,
    onExpire(fx, holder, c) {
      fx.harm(holder, c.size);
    },
  },
  {
    id: "hushed",
    name: "Hushed",
    school: "hush",
    polarity: "bane",
    cannotShoot: true,
    defaultClock: 2,
    text: (c) => `Cannot shoot ${clockText(c.clock)}.`,
  },
  {
    id: "leeched",
    name: "Leeched",
    school: "hush",
    polarity: "bane",
    link: "other",
    chargeFromSize: true,
    defaultClock: 3,
    text: (c) =>
      `Takes ${c.size} Harm at its turn start and the far end heals that much, reviving, ${clockText(c.clock)}.`,
    onTurnStart(fx, holder, c) {
      const dealt = fx.harm(holder, c.size);
      if (c.link !== null && dealt > 0 && fx.isAlive(c.link))
        fx.heal(c.link, dealt, { revive: true });
    },
  },
  {
    id: "drenched",
    name: "Drenched",
    school: "storm",
    polarity: "bane",
    defaultClock: 3,
    text: (c) => `Harm it takes is x ${100 + c.size}% ${clockText(c.clock)}.`,
    harmTakenPercent: (_h, c) => 100 + Math.min(100, c.size),
  },
  {
    id: "fired-up",
    name: "Fired Up",
    school: "storm",
    polarity: "boon",
    defaultClock: 3,
    text: (c) => `+${c.size} Attack ${clockText(c.clock)}.`,
    attackModifier(ctx, holder, c) {
      if (holder.id !== ctx.attacker.id || c.size === 0) return null;
      return { source: "fired-up", label: "Fired Up", amount: c.size };
    },
  },
];

/** Fixed maximum sizes (CONTENT_SPELLS 2.1); others are 3 x the size. */
export const MAX_SIZE: Readonly<Record<string, number>> = {
  warded: 75,
  mollified: 75,
  drenched: 100,
};

/** The three ground kinds (CONTENT_SPELLS 2.2). */
export const MAGIC_GROUND_KINDS: readonly GroundKindDef[] = [
  {
    id: "fire",
    name: "Fire",
    class: "hazard",
    school: "storm",
    defaultClock: 3,
    text: (f) =>
      `Fire: ${f.size} Harm to a stack that enters or starts its turn here.`,
    onEnter: (fx, id, f) => void fx.harm(id, f.size),
    onTurnStart: (fx, id, f) => void fx.harm(id, f.size),
  },
  {
    id: "brambles",
    name: "Brambles",
    class: "hazard",
    school: "bloom",
    defaultClock: 3,
    text: (f) =>
      `Brambles: ${f.size} Harm and Slowed 1 to a stack that enters or starts its turn here.`,
    onEnter: (fx, id, f) => {
      fx.harm(id, f.size);
      fx.addCondition(id, { kind: "slowed", size: 1, clock: 2, tier: 3 });
    },
    onTurnStart: (fx, id, f) => {
      fx.harm(id, f.size);
      fx.addCondition(id, { kind: "slowed", size: 1, clock: 2, tier: 3 });
    },
  },
  {
    id: "mist",
    name: "Mist",
    class: "surface",
    school: "hush",
    defaultClock: 3,
    cannotShoot: true,
    text: () =>
      "Mist: a stack standing here cannot shoot; shots against it are x 50%.",
    strikeMultiplier(ctx, _f, standing) {
      if (standing.id !== ctx.defender.id || ctx.kind !== "shot") return null;
      return { source: "mist", label: "Mist", percent: 50 };
    },
  },
];

/** Summoned creatures (CONTENT_CREATURES 4). */
export const SEEDLING: BattleCreatureStats = {
  id: "seedling",
  name: "Seedling",
  tier: 1,
  hp: 6,
  attack: 3,
  defense: 3,
  damage: 2,
  speed: 4,
  abilities: ["gone-to-seed"],
  tags: { remains: "nothing", cannotBear: [] },
};

export const SHADE: BattleCreatureStats = {
  id: "shade",
  name: "Shade",
  tier: 1,
  hp: 8,
  attack: 5,
  defense: 3,
  damage: 3,
  speed: 6,
  abilities: ["fade"],
  tags: { remains: "nothing", cannotBear: ["heartened", "shaken"] },
};

export const SUMMONED_CREATURES: Readonly<Record<string, BattleCreatureStats>> =
  { seedling: SEEDLING, shade: SHADE };

/** Registers the kinds and the summoned creatures' abilities once. */
export function registerMagicKinds(): void {
  if (hasConditionKind("mending")) return;
  for (const k of MAGIC_CONDITION_KINDS) {
    // Test or debug content may already have registered a kind of this id.
    if (!hasConditionKind(k.id)) registerConditionKind(k);
  }
  for (const g of MAGIC_GROUND_KINDS) {
    if (!hasGroundKind(g.id)) registerGroundKind(g);
  }
  if (hasAbility("gone-to-seed")) return;
  registerAbility({
    id: "gone-to-seed",
    name: "Gone to Seed",
    description: "When it dies its hex receives brambles of size 4, clock 3.",
    onDeath(deadId, owner) {
      if (deadId !== owner.id) return null;
      const hex = owner.hex;
      return (fx) => {
        fx.addGround({ hex, kind: "brambles", size: 4, clock: 3 });
      };
    },
  });
  registerAbility({
    id: "fade",
    name: "Fade",
    description: "When it dies its hex receives mist, clock 2.",
    onDeath(deadId, owner) {
      if (deadId !== owner.id) return null;
      const hex = owner.hex;
      return (fx) => {
        fx.addGround({ hex, kind: "mist", clock: 2 });
      };
    },
  });
}
