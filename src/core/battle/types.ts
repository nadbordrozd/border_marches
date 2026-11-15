/**
 * Battle engine data types. Everything here is plain, immutable,
 * JSON-serialisable data: the engine never mutates a state it was given and
 * keeps no hidden randomness (the seed is only used to place obstacles).
 *
 * The engine takes creature stats as input ({@link BattleCreatureStats}), so
 * it does not depend on src/data; the integration layer maps the game's
 * creature records onto these types.
 */

import type { AbilityId } from "../../data/types.ts";
import type { Hex } from "./hex.ts";

export type BattleSide = "attacker" | "defender";

/**
 * Every ability the engine knows: the game's ability ids
 * (src/data/types.ts). Behaviour is in abilities.ts (ABILITY_HOOKS), names
 * and numbers in src/data/abilities.ts.
 */
export type { AbilityId };

/** Timed effects that sit on a stack (e.g. Venom's -3 Defense). */
export type StatusId = "venom";

/** A creature type's battle stats. */
export interface BattleCreatureStats {
  readonly id: string;
  readonly name?: string;
  /** 1..6; drives the AI's value per HP. */
  readonly tier: number;
  readonly hp: number;
  readonly attack: number;
  readonly defense: number;
  /** Fixed damage per creature (no ranges). */
  readonly damage: number;
  readonly speed: number;
  /** Present and > 0 for ranged creatures. */
  readonly shots?: number;
  readonly abilities: readonly AbilityId[];
  /** Overrides the tier-based AI value per HP. */
  readonly aiValuePerHp?: number;
}

export interface HeroBattleStats {
  readonly attack: number;
  readonly defense: number;
}

export interface BattleStackSetup {
  readonly creature: BattleCreatureStats;
  readonly count: number;
  /** Army slot 0..6 (turn-order tie-break). Defaults to the array index. */
  readonly slot?: number;
  /** Explicit position; defaults to the deployment table. */
  readonly hex?: Hex;
  /** HP of the top creature; defaults to full. */
  readonly topHp?: number;
}

export interface BattleArmySetup {
  /** null for neutrals (hero Attack and Defense count as 0). */
  readonly hero: HeroBattleStats | null;
  /** Flat Defense bonus for every stack of this side (e.g. +2 fortified). */
  readonly defenseBonus?: number;
  readonly stacks: readonly BattleStackSetup[];
}

export interface BattleSetup {
  /** Battle seed: chooses the obstacles. */
  readonly seed: number;
  readonly attacker: BattleArmySetup;
  readonly defender: BattleArmySetup;
  /** Explicit obstacle hexes instead of seeded ones (tests, scenarios). */
  readonly obstacles?: readonly Hex[];
  /** Round to start in (default 1). */
  readonly startRound?: number;
}

export type StackId = string;

export interface StatusInstance {
  readonly id: StatusId;
  /** The status is removed when this round ends. */
  readonly expiresAfterRound: number;
  /** The stack that applied it. */
  readonly sourceId: StackId;
}

export interface BattleStack {
  /** "a<slot>" for the attacker, "d<slot>" for the defender. */
  readonly id: StackId;
  readonly side: BattleSide;
  readonly slot: number;
  readonly creature: BattleCreatureStats;
  /** Creatures alive; 0 means the stack is dead (it stays in the list). */
  readonly count: number;
  /** HP of the top creature (0 when dead). */
  readonly topHp: number;
  readonly initialCount: number;
  readonly hex: Hex;
  readonly shotsLeft: number;
  readonly retaliatedThisRound: boolean;
  readonly defending: boolean;
  readonly waitedThisRound: boolean;
  /** Round whose turn-start effects have run for this stack. */
  readonly turnStartedRound: number;
  readonly statuses: readonly StatusInstance[];
}

export interface BattleSideState {
  readonly hero: HeroBattleStats | null;
  readonly defenseBonus: number;
}

export interface BattleState {
  readonly seed: number;
  readonly obstacles: readonly Hex[];
  readonly sides: { readonly [S in BattleSide]: BattleSideState };
  /** All stacks, attacker's first, each side in slot order. */
  readonly stacks: readonly BattleStack[];
  readonly round: number;
  /** Stacks still to act this round (not waiting), in order. */
  readonly queue: readonly StackId[];
  /** Stacks that waited, in the order they will act (slowest first). */
  readonly waiting: readonly StackId[];
  /** The stack whose action is expected; null once the battle is over. */
  readonly activeStackId: StackId | null;
  readonly winner: BattleSide | null;
}

export type BattleAction =
  | { readonly type: "move"; readonly stackId: StackId; readonly to: Hex }
  | {
      readonly type: "attack";
      readonly stackId: StackId;
      readonly targetId: StackId;
      /** Hex to attack from: the stack's own hex or a reachable one. */
      readonly from: Hex;
    }
  | {
      readonly type: "shoot";
      readonly stackId: StackId;
      readonly targetId: StackId;
    }
  | { readonly type: "wait"; readonly stackId: StackId }
  | { readonly type: "defend"; readonly stackId: StackId };

export type AttackAction = Extract<BattleAction, { type: "attack" | "shoot" }>;

/** "melee" is the active stack's melee attack. */
export type StrikeKind = "melee" | "shot" | "retaliation";

/** A flat Attack or Defense contribution, shown in the preview. */
export interface FlatModifier {
  /** Ability or status id, or "hero" / "fortified". */
  readonly source: string;
  readonly label: string;
  readonly amount: number;
  /**
   * Contributions sharing a key do not stack: only the largest counts
   * (War Drums from two Shamans, two Warbosses' Warcry).
   */
  readonly stackKey?: string;
}

/** A damage multiplier as a whole percentage (140 = x 1.40). */
export interface MultiplierModifier {
  readonly source: string;
  readonly label: string;
  readonly percent: number;
}

/** An exact rational number. */
export interface Rational {
  readonly num: number;
  readonly den: number;
}

/** Everything that went into one strike's damage. */
export interface DamageBreakdown {
  readonly kind: StrikeKind;
  readonly count: number;
  readonly damagePerCreature: number;
  readonly baseAttack: number;
  readonly heroAttack: number;
  readonly attackModifiers: readonly FlatModifier[];
  /** Final A. */
  readonly attack: number;
  readonly baseDefense: number;
  readonly heroDefense: number;
  /** Side bonus, abilities and statuses (Venom is negative). */
  readonly defenseModifiers: readonly FlatModifier[];
  /** max(0, ...) before Defend. */
  readonly defenseBeforeDefend: number;
  readonly defending: boolean;
  /** Final D. */
  readonly defense: number;
  /** M, exact. */
  readonly multiplier: Rational;
  readonly abilityMultipliers: readonly MultiplierModifier[];
  /** Ranged creature fighting in melee: x 0.5. */
  readonly rangedInMelee: boolean;
  readonly damage: number;
}

export interface StrikeResult {
  readonly attackerId: StackId;
  readonly targetId: StackId;
  readonly kind: StrikeKind;
  readonly breakdown: DamageBreakdown;
  readonly damage: number;
  readonly kills: number;
  /** HP actually removed (damage capped at the stack's total HP). */
  readonly hpLost: number;
  readonly targetCountAfter: number;
  readonly targetTopHpAfter: number;
}

/** What an attack or shot will do, exactly as {@link applyAction} does it. */
export interface AttackPreview {
  readonly action: AttackAction;
  readonly hexesMoved: number;
  readonly damage: number;
  readonly kills: number;
  readonly retaliationDamage: number;
  readonly retaliationKills: number;
  readonly strike: StrikeResult;
  /** null when there is no retaliation (shot, Terror, used, target dead). */
  readonly retaliation: StrikeResult | null;
  /** Statuses the strike and retaliation apply (e.g. Venom). */
  readonly statusesApplied: readonly {
    readonly stackId: StackId;
    readonly status: StatusId;
    readonly expiresAfterRound: number;
  }[];
}

/** The battle log the UI animates; emitted in order by createBattle/applyAction. */
export type BattleEvent =
  | { readonly type: "roundStart"; readonly round: number }
  | { readonly type: "turnStart"; readonly stackId: StackId }
  | {
      readonly type: "move";
      readonly stackId: StackId;
      readonly from: Hex;
      readonly to: Hex;
      /** Hexes entered, in order (excludes `from`, ends with `to`). */
      readonly path: readonly Hex[];
    }
  | {
      readonly type: "attack";
      readonly stackId: StackId;
      readonly targetId: StackId;
    }
  | {
      readonly type: "shoot";
      readonly stackId: StackId;
      readonly targetId: StackId;
    }
  | {
      readonly type: "retaliation";
      readonly stackId: StackId;
      readonly targetId: StackId;
    }
  | {
      readonly type: "damage";
      readonly sourceId: StackId;
      readonly targetId: StackId;
      readonly kind: StrikeKind;
      readonly damage: number;
      readonly kills: number;
      readonly countAfter: number;
      readonly topHpAfter: number;
      readonly breakdown: DamageBreakdown;
    }
  | { readonly type: "death"; readonly stackId: StackId }
  | {
      readonly type: "status";
      readonly stackId: StackId;
      readonly status: StatusId;
      readonly change: "applied" | "expired";
      readonly expiresAfterRound: number;
    }
  | {
      readonly type: "heal";
      readonly stackId: StackId;
      readonly source: AbilityId;
      readonly amount: number;
      readonly topHpAfter: number;
    }
  | { readonly type: "wait"; readonly stackId: StackId }
  | { readonly type: "defend"; readonly stackId: StackId }
  | {
      readonly type: "end";
      readonly winner: BattleSide | null;
      readonly reason: "eliminated" | "roundLimit";
    };

export interface BattleStep {
  readonly state: BattleState;
  readonly events: readonly BattleEvent[];
}
