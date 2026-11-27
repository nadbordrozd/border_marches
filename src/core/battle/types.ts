/**
 * Battle engine data types (RULES_V2.md section 1, the battle grammar).
 * Everything here is plain, immutable, JSON-serialisable data: the engine
 * never mutates a state it was given and keeps no hidden randomness (the
 * seed is only used to place obstacles).
 *
 * The engine takes creature stats as input ({@link BattleCreatureStats}), so
 * it does not depend on src/data; the integration layer maps the game's
 * creature records onto these types. Behaviour that content adds (condition
 * kinds, ground kinds, abilities, acts, scheduled effects) lives in the
 * registries of registry.ts and is named here only by id.
 */

import type { AbilityId } from "../../data/types.ts";
import type { Hex } from "./hex.ts";

export type BattleSide = "attacker" | "defender";

/**
 * Every ability the engine knows: the game's ability ids
 * (src/data/types.ts) plus any id content registers (registry.ts).
 */
export type { AbilityId };
/** An ability id: the MVP's or one registered by content. */
export type AbilityKey = AbilityId | (string & {});

/** The five schools of the wheel (RULES_V2 2.1). */
export type School = "bloom" | "accord" | "clock" | "hush" | "storm";
export type Polarity = "boon" | "bane";

/** What a stack's death leaves on its hex (RULES_V2 1.2, 1.5). */
export type DeathTag = "corpse" | "bones" | "wreck" | "sweets" | "nothing";

export interface StackTags {
  readonly remains: DeathTag;
  /** At most two condition kinds the creature cannot bear. */
  readonly cannotBear: readonly string[];
}

/** A creature type's battle stats. */
export interface BattleCreatureStats {
  readonly id: string;
  readonly name?: string;
  /** 1..6; drives the AI's value per HP and the tier gate. */
  readonly tier: number;
  readonly hp: number;
  readonly attack: number;
  readonly defense: number;
  /** Fixed damage per creature (no ranges). */
  readonly damage: number;
  readonly speed: number;
  /** Present and > 0 for ranged creatures. */
  readonly shots?: number;
  readonly abilities: readonly AbilityKey[];
  /** Overrides the tier-based AI value per HP. */
  readonly aiValuePerHp?: number;
  /** Defaults to `{ remains: "corpse", cannotBear: [] }`. */
  readonly tags?: StackTags;
  /**
   * Creature caster pages (RULES_V2 2.6). Content may instead register them
   * by creature id with `registerCreatureCaster` (magic.ts).
   */
  readonly caster?: CreatureCaster;
}

/** A creature caster's pages and Power (RULES_V2 2.6). */
export interface CreatureCaster {
  /** At most two spell (act) ids. */
  readonly pages: readonly string[];
  readonly castPower: number;
  readonly castDivisor: number;
  readonly castCap: number;
}

/** What a hero brings to battle for casting (RULES_V2 2.3 to 2.5). */
export interface MagicSetup {
  /** Hero Power plus flat modifiers (not the school bonus). */
  readonly power: number;
  /** Mana the hero has now. */
  readonly mana: number;
  /** School skill ranks, 0 to 3; missing schools are 0. */
  readonly schoolRanks?: { readonly [S in School]?: number };
  /** Battle pages the hero knows (spell ids). */
  readonly pages: readonly string[];
  /** The scroll case: spell ids, one entry per scroll. */
  readonly scrolls?: readonly string[];
  /** Fuels per battle (default 1, at most 3). */
  readonly fuelMax?: number;
  /** Mana cost percentage (skills, artifacts); default 100. */
  readonly costPercent?: number;
  /**
   * Effective Power of a page of each school (hero model: Power, rank bonus
   * and school or page modifiers). Absent: power + rank bonus.
   */
  readonly pagePower?: { readonly [S in School]?: number };
  /** Effective Power of a scroll; absent: max(2, power). */
  readonly scrollPower?: number;
  /** Rounds Echo adds to a clock (default 1; a switch may make it 2). */
  readonly echoRounds?: number;
  /** Vows: schools this hero can never cast (pages and scrolls). */
  readonly neverCast?: readonly School[];
  /** Vows: rounds in which the hero cannot cast. */
  readonly noCastRounds?: "1-2" | "after-3" | "even";
  /** Extra Power for named spells (a Spell specialty, RULES_V2 3.7). */
  readonly spellPower?: { readonly [spell: string]: number };
  /** Pages spent before round 1 (The Missing Page). */
  readonly startSpent?: readonly string[];
  /** The one page that is never spent (The Unspent Page). */
  readonly unspentPage?: string;
}

/** A side's magic during a battle (pages spent, mana, Fuel). */
export interface SideMagic {
  readonly power: number;
  readonly mana: number;
  readonly schoolRanks: { readonly [S in School]: number };
  readonly pages: readonly string[];
  /** Pages spent this battle. */
  readonly spent: readonly string[];
  /** Scrolls still in the case. */
  readonly scrolls: readonly string[];
  /** Scrolls cast this battle (destroyed). */
  readonly scrollsUsed: readonly string[];
  readonly fuelUsed: number;
  readonly fuelMax: number;
  readonly costPercent: number;
  readonly pagePower: { readonly [S in School]?: number };
  readonly scrollPower: number | null;
  readonly echoRounds: number;
  readonly neverCast: readonly School[];
  readonly noCastRounds: "1-2" | "after-3" | "even" | null;
  /** Mana spent this battle (stays spent, 1.12). */
  readonly manaSpent: number;
  /** Extra Power for named spells (a Spell specialty). */
  readonly spellPower?: { readonly [spell: string]: number };
  /** The page that is never spent (The Unspent Page), if any. */
  readonly unspentPage?: string;
  /** Hero casts this battle in order: round and school (switches). */
  readonly casts?: ReadonlyArray<{
    readonly round: number;
    readonly school: School | null;
    readonly scroll: boolean;
    readonly free: boolean;
  }>;
}

export interface HeroBattleStats {
  readonly attack: number;
  readonly defense: number;
  /** The class's Command act id (RULES_V2 3.7), if any. */
  readonly command?: string;
  /** C for the Command (the profile's commandStrength). Default 1. */
  readonly commandC?: number;
  /**
   * Item acts (RULES_V2 4.6 form 4) of the hero's worn artifacts: act ids
   * of kind "item" this side may use, once per battle each. Absent: none.
   */
  readonly itemActs?: readonly string[];
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
  /** True when the side's birthright applies to this stack (3.8). */
  readonly native?: boolean;
}

/** A content effect named by id with JSON arguments (registry.ts). */
export interface EffectRef {
  readonly id: string;
  readonly args?: JsonValue;
}

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface BattleArmySetup {
  /** null for neutrals (hero Attack and Defense count as 0). */
  readonly hero: HeroBattleStats | null;
  /** Flat Defense bonus for every stack of this side (e.g. +2 fortified). */
  readonly defenseBonus?: number;
  readonly stacks: readonly BattleStackSetup[];
  /** Army Morale, -3..3 (RULES_V2 6). Default 0. */
  readonly morale?: number;
  /** Army Luck, -3..3 (RULES_V2 6). Default 0. */
  readonly luck?: number;
  /** The hero may retreat (1.12; the game layer decides). Default false. */
  readonly canRetreat?: boolean;
  /**
   * Battle-start rules (artifacts, form 2 of 4.6), resolved before round 1
   * in this order through the effect registry.
   */
  readonly startRules?: readonly EffectRef[];
  /**
   * The birthright of this army's faction (RULES_V2 3.8): an ability id
   * every native stack gains at deployment.
   */
  readonly birthright?: string;
  /**
   * Battle-setup flags of this side (Drills are applied to creatures by
   * the game layer; town specials and Keystone powers are read by content
   * through these, e.g. "chapel-of-oaths").
   */
  readonly flags?: readonly string[];
  /** The hero's book, mana and scrolls (needs a hero). */
  readonly magic?: MagicSetup;
  /**
   * Battle rules of the hero (RULES_V2 4.6 form 5 switches, feat and vow
   * rules, artifact reactions): ids of src/data/effects.ts RULE_SWITCH_IDS,
   * read by the grammar through `hasRule`. Default none.
   */
  readonly rules?: readonly string[];
  /**
   * The side fights from a ship (docs/design/NAVAL.md 3.3): its deck gun
   * deals this much Harm to the strongest enemy stack at every round start
   * from round 2. Absent: no deck gun.
   */
  readonly deckGun?: number;
  /**
   * Wet Landing (NAVAL.md 3.4): every stack of this side starts Drenched
   * 25, clock 2 (a beach landing's attacker). Default false.
   */
  readonly wetLanding?: boolean;
}

/**
 * The battlefield's layout (NAVAL.md 3.2): `land` is the ordinary field
 * with seeded obstacles; `deck` is deck to deck, `open-water` a deck
 * against the water, `pier-deck` and `pier-water` the same with the
 * attacker's half on land; `beach` is a beach landing (the land field,
 * named for the banner; Wet Landing is the attacker's `wetLanding`).
 */
export type BattleLayout =
  "land" | "deck" | "open-water" | "pier-deck" | "pier-water" | "beach";

export interface BattleSetup {
  /** Battle seed: chooses the obstacles. */
  readonly seed: number;
  readonly attacker: BattleArmySetup;
  readonly defender: BattleArmySetup;
  /** The field's layout (NAVAL.md 3.2). Default `land`. */
  readonly layout?: BattleLayout;
  /** Explicit obstacle hexes instead of seeded ones (tests, scenarios). */
  readonly obstacles?: readonly Hex[];
  /** Extra starting ground (tests, scenarios). */
  readonly ground?: readonly GroundSpec[];
  /** Round to start in (default 1). */
  readonly startRound?: number;
  /** Round limit (default ROUND_LIMIT; simulations and scenarios). */
  readonly roundLimit?: number;
}

export type StackId = string;

/** A threshold a stack must pass to receive a condition (1.3). */
export interface Gate {
  readonly measure: "hp" | "tier";
  readonly max: number;
}

/** A condition on one stack (RULES_V2 1.3). */
export interface Condition {
  /** Unique within the battle; creation order ("oldest" = lowest). */
  readonly uid: number;
  readonly kind: string;
  readonly school: School;
  readonly polarity: Polarity;
  readonly size: number;
  readonly maxSize: number;
  /** Rounds left, 1..9, or null for "until the battle ends". */
  readonly clock: number | null;
  readonly gate: Gate | null;
  readonly hold: boolean;
  /** Far end of a link (1.4), or null. */
  readonly link: StackId | null;
  /** Stack id, "hero:<side>", or an artifact or rule id. */
  readonly source: string;
  /** Round ends passed while bearing it (a Hold's Wary length, 1.9). */
  readonly roundsBorne: number;
}

/** What a rule asks to put on a stack; the kind fills in the rest. */
export interface ConditionSpec {
  readonly kind: string;
  readonly size?: number;
  readonly maxSize?: number;
  /** Omitted: the kind's default clock. */
  readonly clock?: number | null;
  readonly gate?: Gate | null;
  readonly link?: StackId | null;
  readonly source?: string;
}

export interface BattleStack {
  /** "a<slot>", "d<slot>", or "s<n>" for summoned stacks. */
  readonly id: StackId;
  /** The battle side that brought or summoned it. Never changes. */
  readonly owner: BattleSide;
  /**
   * The side it fights for: the owner, or the other side while it bears
   * Turned. Derived: the engine recomputes it whenever conditions change
   * (see `sideOf`); never set it by hand.
   */
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
  readonly native: boolean;
  readonly summoned: boolean;
  readonly tags: StackTags;
  /** Ordered list, at most six. */
  readonly conditions: readonly Condition[];
  /**
   * Rounds left of refusing Holds, counting the round in which the Hold
   * left (1.9). Not a condition.
   */
  readonly wary: number;
  readonly retaliatedThisRound: boolean;
  /** Retaliations made this round when a rule allows more than one. */
  readonly retaliationsThisRound?: number;
  readonly defending: boolean;
  readonly waitedThisRound: boolean;
  /** Round whose turn-start effects have run for this stack. */
  readonly turnStartedRound: number;
  /** Round in which this stack was granted its extra turn (0: never). */
  readonly extraTurnRound: number;
  /**
   * Round in which this stack was granted its round-end turn (Afters); in
   * that turn it cannot walk. Absent: never.
   */
  readonly aftersRound?: number;
  /**
   * Round in which a melee Strike (an attack or a retaliation) last hit
   * this stack (Chewy reads it). Absent: never.
   */
  readonly meleeStruckRound?: number;
  /** Once-per-battle abilities this stack has used. */
  readonly abilitiesUsed: readonly string[];
  /**
   * The visible "gets up" badge (One More Time): the next time the stack
   * dies and leaves remains it gets up as by Not Done Yet. Default false.
   */
  readonly getsUp?: boolean;
  /** It has already got up by its faction's birthright once. */
  readonly rose?: boolean;
  /** It returned from its remains: it crumbles after the battle (1.12). */
  readonly risen?: boolean;
}

export type GroundClass = "blocking" | "hazard" | "surface" | "remains";

export interface Remains {
  readonly creature: BattleCreatureStats;
  readonly owner: BattleSide;
  readonly initialCount: number;
}

/** One feature on one hex (RULES_V2 1.5). */
export interface GroundFeature {
  readonly hex: Hex;
  readonly kind: string;
  readonly class: GroundClass;
  readonly school: School | null;
  readonly size: number;
  readonly clock: number | null;
  readonly remains: Remains | null;
  readonly source: string;
  /**
   * A drawing hint for the renderer only (NAVAL.md 3.8): a `rock` drawn as
   * a crate or a reef. Absent on every other feature.
   */
  readonly look?: string;
}

export interface GroundSpec {
  readonly hex: Hex;
  readonly kind: string;
  readonly size?: number;
  readonly clock?: number | null;
  readonly source?: string;
  /** A drawing hint ({@link GroundFeature.look}). */
  readonly look?: string;
}

/** A visible scheduled event on the timeline (1.6). */
export interface ScheduledEvent {
  readonly id: number;
  readonly round: number;
  readonly phase: "start" | "end";
  readonly effect: EffectRef;
  readonly source: string;
  readonly side: BattleSide;
  /** True when firing it returns a stack of `side` (1.12 battle end). */
  readonly returnsStack?: boolean;
}

export interface BattleSideState {
  readonly hero: HeroBattleStats | null;
  readonly defenseBonus: number;
  readonly morale: number;
  readonly luck: number;
  readonly canRetreat: boolean;
  /** Round of the hero's last cast (0: none). One cast per round. */
  readonly castRound: number;
  /** Command used this battle. */
  readonly commandUsed: boolean;
  /** Item acts used this battle (act ids). */
  readonly itemActsUsed: readonly string[];
  /** The hero's battle rules (BattleArmySetup.rules). Absent: none. */
  readonly rules?: readonly string[];
  /** Once-per-battle rule uses ("spillover", "seed-bombs:a2", ...). */
  readonly rulesUsed?: readonly string[];
  /** Battle-setup flags (BattleArmySetup.flags). Default none. */
  readonly flags?: readonly string[];
  /**
   * The hero's magic. Absent: a hero with no book data (tests, legacy
   * setups) casts any cast act freely at Power 0.
   */
  readonly magic?: SideMagic;
}

export type EndReason = "eliminated" | "roundLimit" | "retreat";

export interface BattleState {
  readonly seed: number;
  /** At most one feature per hex, sorted by hex index (row by row). */
  readonly ground: readonly GroundFeature[];
  readonly sides: { readonly [S in BattleSide]: BattleSideState };
  /** All stacks: attacker's, defender's, then summoned in creation order. */
  readonly stacks: readonly BattleStack[];
  readonly round: number;
  /** Stacks still to act this round (not waiting), in order. */
  readonly queue: readonly StackId[];
  /** Stacks that waited, in the order they will act (slowest first). */
  readonly waiting: readonly StackId[];
  /** Stacks granted an extra turn that have not taken it yet. */
  readonly extraTurns: readonly StackId[];
  /** The stack whose action is expected; null once the battle is over. */
  readonly activeStackId: StackId | null;
  readonly winner: BattleSide | null;
  readonly endReason: EndReason | null;
  readonly scheduled: readonly ScheduledEvent[];
  /** Next condition uid / scheduled id / summoned stack number. */
  readonly nextUid: number;
  /** Local laws of the battleground (none in v0.2). */
  readonly laws: readonly string[];
  /** The round limit when not ROUND_LIMIT (simulations, scenarios). */
  readonly roundLimit?: number;
  /** The field's layout when not `land` (NAVAL.md 3.2). */
  readonly layout?: BattleLayout;
}

/** A chosen target of an act or ability (law 5: anything can be one). */
export type ActTarget =
  | { readonly stack: StackId }
  | { readonly hex: Hex }
  | { readonly stack: StackId; readonly condition: number }
  /** A named option of the act ("+2" or "-2" for Wind). */
  | { readonly choice: string };

/** How a hero cast was made (shown on the heroAct event). */
export interface CastInfo {
  readonly power: number;
  readonly mana: number;
  readonly scroll: boolean;
  readonly fuelled: boolean;
  readonly echoed: boolean;
}

/** One condition on one stack, by identity. */
export interface ConditionRef {
  readonly stack: StackId;
  readonly condition: number;
}

export type BattleAction =
  | {
      readonly type: "move";
      readonly stackId: StackId;
      readonly to: Hex;
      /**
       * Swap hexes with this linked stack instead of walking (a link kind
       * with `swapAction`, e.g. Sworn); `to` must be its hex.
       */
      readonly swapWith?: StackId;
    }
  | {
      readonly type: "attack";
      readonly stackId: StackId;
      readonly targetId: StackId;
      /** Hex to attack from: the stack's own hex or a reachable one. */
      readonly from: Hex;
      /** Spend Heartened for an extra turn afterwards (default true). */
      readonly hearten?: boolean;
      /** Swap with this linked stack in place of the walk (`from` = its hex). */
      readonly swapWith?: StackId;
      /**
       * A walk after the attack and its retaliation, for a stack with an
       * ability that allows one (Hit and Run); ignored if not reachable then.
       */
      readonly after?: Hex;
    }
  | {
      readonly type: "shoot";
      readonly stackId: StackId;
      readonly targetId: StackId;
      readonly hearten?: boolean;
      /** Swap with this linked stack first, then shoot. */
      readonly swapWith?: StackId;
    }
  | {
      /**
       * A shot at a hex rather than a stack, for a shooter with an ability
       * that may target any hex (Bomb).
       */
      readonly type: "shootHex";
      readonly stackId: StackId;
      readonly at: Hex;
      readonly hearten?: boolean;
    }
  | { readonly type: "wait"; readonly stackId: StackId }
  | {
      readonly type: "defend";
      readonly stackId: StackId;
      readonly hearten?: boolean;
    }
  | {
      /** The active stack's activated ability, as its action. */
      readonly type: "ability";
      readonly stackId: StackId;
      readonly ability: string;
      readonly targets: readonly ActTarget[];
      readonly hearten?: boolean;
      /** Walk here first, for an ability that allows it (`moveFirst`). */
      readonly from?: Hex;
    }
  | {
      /**
       * The hero of the active stack's side acts before the stack: a cast,
       * the Command or an item act (registry.ts ActDef.kind). Does not end
       * the stack's turn.
       */
      readonly type: "heroAct";
      readonly stackId: StackId;
      readonly act: string;
      readonly targets: readonly ActTarget[];
      /** Cast from the scroll case instead of a page (RULES_V2 2.5). */
      readonly scroll?: boolean;
      /** Echo: a condition whose clock grows by 1 (RULES_V2 2.4). */
      readonly echo?: ConditionRef;
      /** Fuel: a condition burnt to double the spell's size (2.4). */
      readonly fuel?: ConditionRef;
    }
  | {
      /** A creature caster casts one of its pages as its action (2.6). */
      readonly type: "creatureCast";
      readonly stackId: StackId;
      readonly spell: string;
      readonly targets: readonly ActTarget[];
      readonly hearten?: boolean;
    }
  | { readonly type: "retreat"; readonly stackId: StackId };

export type AttackAction = Extract<BattleAction, { type: "attack" | "shoot" }>;

/** "melee" is the active stack's melee attack; "special" comes from a rule. */
export type StrikeKind = "melee" | "shot" | "retaliation" | "special";

/** A flat Attack or Defense contribution, shown in the preview. */
export interface FlatModifier {
  /** Ability or condition id, or "hero" / "fortified". */
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
  /** Modifiers with the same key do not stack: only the largest applies. */
  readonly stackKey?: string;
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
  /** Side bonus, abilities and conditions (Venomed is negative). */
  readonly defenseModifiers: readonly FlatModifier[];
  /** max(0, ...) before Defend. */
  readonly defenseBeforeDefend: number;
  readonly defending: boolean;
  /** Final D. */
  readonly defense: number;
  /** M, exact. */
  readonly multiplier: Rational;
  readonly abilityMultipliers: readonly MultiplierModifier[];
  /** P after the 1/4 .. 4 clamp, exact. */
  readonly percentProduct: Rational;
  /** True when the clamp changed P. */
  readonly percentCapped: boolean;
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
  /** Far end that took the damage instead (redirect link), or null. */
  readonly redirectedTo: StackId | null;
}

/** A condition put on a stack by an attack's chain. */
export interface AppliedCondition {
  readonly stackId: StackId;
  readonly kind: string;
  readonly clock: number | null;
  readonly size: number;
}

/**
 * Why a legal attack or shot makes no strike on its target:
 * - `attackerDied`: the attacker died before striking (hazard ground on its
 *   walk, Harm carried down a link, ...);
 * - `targetDied`: the target died before the strike;
 * - `averted`: both live but the strike never landed (an area shot taken by
 *   the target's ability, a shot replaced by something else).
 */
export type NoStrikeReason = "attackerDied" | "targetDied" | "averted";

/** What an attack or shot will do, exactly as {@link applyAction} does it. */
export interface AttackPreview {
  readonly action: AttackAction;
  readonly hexesMoved: number;
  /** The strike's damage and kills (0 when no strike lands). */
  readonly damage: number;
  readonly kills: number;
  readonly retaliationDamage: number;
  readonly retaliationKills: number;
  /**
   * The attacker's strike on its target; null when none lands (the attacker
   * dies on the way, say). `noStrike` then says why.
   */
  readonly strike: StrikeResult | null;
  /** Why no strike landed; null when it did. */
  readonly noStrike: NoStrikeReason | null;
  /** null when there is no retaliation (shot, Terror, used, target dead). */
  readonly retaliation: StrikeResult | null;
  /** Conditions the chain put on stacks (e.g. Venomed). */
  readonly conditionsApplied: readonly AppliedCondition[];
  /** The full step chain of the action (rehearsal). */
  readonly chain: readonly BattleEvent[];
}

export type ConditionChange =
  | "landed"
  | "merged"
  | "displaced"
  | "refused"
  | "moved"
  | "copied"
  | "fed"
  | "wound"
  | "setOff"
  | "expired"
  | "ended";

/** Why a condition was refused (1.3 landing order). */
export type RefusalReason =
  | "tag"
  | "gate"
  | "hold"
  | "wary"
  | "full"
  | "sameStack"
  | "dead"
  | "neverProlonged";

/** The body of one engine event (what happened). */
export type BattleEventBody =
  | { readonly type: "roundStart"; readonly round: number }
  | { readonly type: "roundEnd"; readonly round: number }
  | { readonly type: "turnStart"; readonly stackId: StackId }
  | {
      readonly type: "turnSkipped";
      readonly stackId: StackId;
      readonly condition: string;
    }
  | {
      readonly type: "move";
      readonly stackId: StackId;
      readonly from: Hex;
      readonly to: Hex;
      /** Hexes entered, in order (excludes `from`, ends with `to`). */
      readonly path: readonly Hex[];
      readonly mode: "walk" | "push" | "pull" | "teleport" | "swap";
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
      /** A shot at a hex (an area shot such as Bomb). */
      readonly type: "shootHex";
      readonly stackId: StackId;
      readonly at: Hex;
    }
  | {
      /** A dead stack returns from its remains (Not Done Yet). */
      readonly type: "getUp";
      readonly stackId: StackId;
      readonly hex: Hex;
      readonly count: number;
    }
  | {
      readonly type: "retaliation";
      readonly stackId: StackId;
      readonly targetId: StackId;
    }
  | {
      /** A Strike (1.8). */
      readonly type: "damage";
      readonly sourceId: StackId;
      readonly targetId: StackId;
      readonly kind: StrikeKind;
      readonly damage: number;
      readonly kills: number;
      /** HP actually removed (0 when redirected). */
      readonly hpLost: number;
      readonly countAfter: number;
      readonly topHpAfter: number;
      readonly breakdown: DamageBreakdown;
      /** Far end that takes it instead (redirect link), or null. */
      readonly redirectedTo: StackId | null;
    }
  | {
      /** Harm (1.8): harm = floor(x x Q). */
      readonly type: "harm";
      readonly targetId: StackId;
      readonly x: number;
      readonly q: Rational;
      readonly harm: number;
      readonly kills: number;
      readonly countAfter: number;
      readonly topHpAfter: number;
      readonly viaLink: boolean;
      readonly redirectedTo: StackId | null;
    }
  | {
      /** Damage carried down a redirect link to its far end. */
      readonly type: "linkTransfer";
      readonly nearId: StackId;
      readonly farId: StackId;
      readonly kind: string;
      readonly amount: number;
      /** What returns to the near end (far end died), 0 otherwise. */
      readonly excess: number;
    }
  | { readonly type: "death"; readonly stackId: StackId }
  | {
      readonly type: "condition";
      readonly stackId: StackId;
      readonly change: ConditionChange;
      readonly condition: Condition;
      /** For moved and copied: the other stack. */
      readonly otherId?: StackId;
      readonly reason?: RefusalReason;
      /** Human-readable numbers ("gate 120 HP, target has 400"). */
      readonly detail?: string;
    }
  | {
      readonly type: "wary";
      readonly stackId: StackId;
      readonly rounds: number;
    }
  | {
      readonly type: "ground";
      readonly change: "added" | "ended" | "used" | "refused";
      readonly feature: GroundFeature;
    }
  | {
      readonly type: "heal";
      readonly stackId: StackId;
      readonly source: string;
      readonly amount: number;
      readonly revived: number;
      readonly countAfter: number;
      readonly topHpAfter: number;
    }
  | { readonly type: "summon"; readonly stackId: StackId }
  | {
      readonly type: "schedule";
      readonly change: "added" | "fired" | "cancelled" | "refused";
      readonly event: ScheduledEvent;
    }
  | {
      readonly type: "extraTurn";
      readonly stackId: StackId;
      readonly granted: boolean;
    }
  | { readonly type: "wait"; readonly stackId: StackId }
  | { readonly type: "defend"; readonly stackId: StackId }
  | {
      readonly type: "ability";
      readonly stackId: StackId;
      readonly ability: string;
    }
  | {
      readonly type: "heroAct";
      readonly side: BattleSide;
      readonly act: string;
      /** For casts: the effective Power, mana paid and choices. */
      readonly cast?: CastInfo;
    }
  | {
      /** A creature caster's page (2.6). */
      readonly type: "creatureCast";
      readonly stackId: StackId;
      readonly spell: string;
      readonly power: number;
    }
  | { readonly type: "retreat"; readonly side: BattleSide }
  | { readonly type: "contentError"; readonly message: string }
  | {
      readonly type: "end";
      readonly winner: BattleSide | null;
      readonly reason: EndReason;
    };

/** Every event carries its place in the chain (RULES_V2 1.13). */
export interface EventMeta {
  /** Index within the step that emitted it (0, 1, 2, ...). */
  readonly index: number;
  /** Index of the event that triggered it; null for the action itself. */
  readonly cause: number | null;
  /** The rule that produced it: an ability, condition, act or engine id. */
  readonly rule: string;
}

/** The battle log the UI animates; emitted in order by the engine. */
export type BattleEvent = BattleEventBody & EventMeta;

export interface BattleStep {
  readonly state: BattleState;
  readonly events: readonly BattleEvent[];
}
