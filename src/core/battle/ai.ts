/**
 * Battle AI v2 (neutrals, AI heroes, auto-combat and quick battle).
 *
 * A shallow search over the active stack's options, each scored by
 * rehearsing it on the real engine (applyAction on a copy, as
 * rehearse.ts does) and evaluating the resulting board:
 *
 * - **Options.** Moves, attacks (from every reachable hex), shots, swaps,
 *   Defend and Wait ({@link legalActions}); activated abilities with their
 *   candidate targets and walk-first hexes; creature casters' pages;
 *   area shots at hexes (Bomb); a walk after the attack (Hit and Run).
 *   Targets come from each act's `aiTargets` list (registry.ts) and must
 *   pass the act's own check.
 * - **Hero acts.** Casts (pages and scrolls, with every Echo and Fuel
 *   option), the Command and item acts are tried before the stack acts.
 *   The best few are searched one ply deeper: the hero act followed by the
 *   stack's best action, against the stack's best action alone. The act is
 *   taken when that difference, less its mana, scroll or Fuel cost, clears
 *   a threshold (lower for a cast at the side's last turn of the round).
 * - **Evaluation** ({@link evaluate}), from the deciding side: material
 *   (total HP x fight value per HP, by owner; summoned stacks count less),
 *   conditions (a per-kind estimate of what a boon or bane is worth for
 *   the rounds it has left), pending returns from remains, and positional
 *   terms: the damage each side's stacks could deal next turn (enemy
 *   threat weighs more than one's own, so the AI does not walk into reach
 *   needlessly; a shooter an enemy can reach is worth less), targets out
 *   of reach discounted per turn away (the pull forward), Defend's reduced
 *   damage taken. The side that would lose at the round limit as the
 *   board stands (1.12: less fight value left), and any neutral guard,
 *   presses: it fears the enemy's reach less, that fear fades over the
 *   first rounds, and its own threat weighs more each round. In the last
 *   three rounds a side 1.5 times ahead presses too, to finish the fight.
 * - **Links.** A Scapegoat is worth the value per HP it moves from the
 *   bearer to the far end (negative the wrong way round); Warded and
 *   Drenched only the share of damage that comes as Harm (bead bzc.36).
 * - **Candy Kingdom** (bead bzc.116; docs/design/AI.md "Candy Kingdom"):
 *   a stack that cannot walk (Stuck) threatens only what stands next to
 *   it, and its Stuck is worth most on a shooter held beside an enemy; a
 *   Dragon's reach counts two Strikes (Afters), plus the round-end Strike
 *   still due on what stands next to it once its turn is over; a shooter
 *   within a puller's walk and pull range (Reel In, `aiPull`) is exposed,
 *   and one a Sticky stack reaches doubly so; a place on the timeline
 *   (Hastened, Delayed) is worth a round less on a stack that has acted;
 *   pulls walk into range first, and walks onto remains a stack feeds on
 *   (the Larder, `aiWalkOnto`) are always rehearsed.
 * - **Deepforge** (bead bzc.134; docs/design/AI.md "Deepforge"): Steam is
 *   worth the share `steam` of what it adds to its bearer's best Strike,
 *   plus, for a stack whose steamed blow pushes (Ram, `aiSteamPush`), the
 *   retaliation it spares, so natives Stoke while nothing is in reach and
 *   strike when it pays; shells in the air (Lob, `aiShell`) count on the
 *   stacks on and around their hexes, in full for one whose turn is over
 *   and by half for one still to act (it may step off), friend or foe;
 *   spotters (`aiSpotPercent`) multiply their side's shots by position
 *   (the rates leave them out); a stack that shoots point-blank (Turret)
 *   shoots with an enemy next to it and is not silenced by one.
 * - **Tuning.** The weights ({@link DEFAULT_AI_WEIGHTS}) were set with the
 *   batch runner, tests/sim/battles.ts (`npm run sim:battles`).
 * - **Pruning.** Moves are first scored on a board with the stack simply
 *   placed on the hex (no engine run); only the best few are rehearsed.
 * - **Determinism.** Candidates are generated in a fixed order and ties go
 *   to the earliest, so the choice is a pure function of the state (the
 *   intents of RULES_V2 1.13 rely on it). Caches only memoise pure values.
 * - **Fast mode** (`mode: "fast"`, bead bzc.37; docs/design/AI.md "Battle
 *   AI fast mode"): for battles no human watches (the adventure AI's
 *   fight simulations and AI-against-AI resolution, chosen in
 *   resolver.ts). Moves, attack hexes and area shots are ranked by an
 *   incremental estimate that reuses the decision's threat map (only the
 *   moving stack's terms are recomputed); the best few are rehearsed
 *   (one hex per attack target, two moves, three area shots). Hero acts
 *   are judged by their own gain instead of a second ply, and only the
 *   best cast gets Echo and Fuel options. Same determinism; every action
 *   still comes from the legal candidates.
 */

import { isAlive } from "./abilities.ts";
import { creatureFightValue, totalHp } from "./damage.ts";
import {
  actionError,
  activeStack,
  applyAction,
  canShoot,
  heroActError,
  isRangedCreature,
  legalActions,
  reachableHexes,
  shootsAnyHex,
} from "./engine.ts";
import {
  BATTLE_HEX_COUNT,
  hexDistance,
  hexFromIndex,
  hexIndex,
  isAdjacent,
  neighbors,
} from "./hex.ts";
import type { Hex } from "./hex.ts";
import {
  creaturePagesLeft,
  echoError,
  fuelError,
  heroCastError,
  manaCost,
  touchedStacks,
} from "./magic.ts";
import { pendingShells } from "./factions/dwarves.ts";
import { DECK_GUN_EFFECT } from "./naval-field.ts";
import {
  ability,
  act as actDef,
  conditionKind,
  hasAbility,
  hasAct,
} from "./registry.ts";
import type { AbilityDef, ActDef } from "./registry.ts";
import {
  GET_UP_EFFECT,
  bears,
  blockingHexesFor,
  computeBreakdown,
  effectiveSpeed,
  enemySide,
  fightValueLeft,
  roundLimitOf,
  roundLimitWinner,
  shootsPointBlank,
} from "./resolve.ts";
import { STEAM, STEAM_PERCENT_PER_SIZE } from "./steam.ts";
import type {
  ActTarget,
  BattleAction,
  BattleCreatureStats,
  BattleSide,
  BattleStack,
  BattleState,
  Condition,
  ConditionRef,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Values

/** Memoised value per HP by creature record (records are never mutated). */
const valuePerHp = new WeakMap<BattleCreatureStats, number>();

/** AI value per HP: the creature's fight value per hit point. */
export function aiValuePerHp(creature: BattleCreatureStats): number {
  if (creature.aiValuePerHp !== undefined) return creature.aiValuePerHp;
  const hit = valuePerHp.get(creature);
  if (hit !== undefined) return hit;
  const v = creatureFightValue(creature) / Math.max(1, creature.hp);
  valuePerHp.set(creature, v);
  return v;
}

/** A stack's value: total HP x value per HP (0 when dead). */
export function stackValue(stack: BattleStack): number {
  return (
    totalHp({ count: stack.count, hp: stack.creature.hp, topHp: stack.topHp }) *
    aiValuePerHp(stack.creature)
  );
}

/** The tunable weights of the evaluation and of the hero-act thresholds. */
export interface AiWeights {
  /** Weight of the damage the enemy could deal next turn. */
  readonly enemyThreat: number;
  /** Weight of the damage this side could deal next turn. */
  readonly ownThreat: number;
  /** Discount per turn for targets out of reach (the pull forward). */
  readonly far: number;
  /** Extra own-threat weight per round for a side that presses. */
  readonly urgency: number;
  /**
   * A pressing side's boldness: its enemy-threat weight is x (1 - this),
   * its own-threat weight x (1 + this).
   */
  readonly aggression: number;
  /** A pressing side's enemy-threat weight fades to 0 over these rounds. */
  readonly fearRounds: number;
  /**
   * 1: the side that would lose at the round limit as the board stands
   * presses (aggression, fading fear, urgency); 0: the attacker does (the
   * v2 rule before bead bzc.24).
   */
  readonly behindPresses: number;
  /** 1: a neutral guard (no hero, no native stack) always presses. */
  readonly guardsPress: number;
  /**
   * 1: a neutral guard with Swimmers on a field with sea fears no reach
   * (NAVAL.md 12, "sea guards advance"); 0: it fears as any guard.
   */
  readonly seaGuardsAdvance: number;
  /**
   * The side ahead on the round-limit verdict presses too in the last
   * this many rounds when its fight value left is at least `aheadLead`
   * times the other's (0: never).
   */
  readonly aheadRounds: number;
  /** The lead (fight value left, ahead / behind) for `aheadRounds`. */
  readonly aheadLead: number;
  /** Fraction of a stack's value that a shooter in enemy reach loses. */
  readonly shooterExposure: number;
  /** Fraction of a stack's value it deals per round (condition values). */
  readonly tempo: number;
  /**
   * Share of the damage a stack takes that comes as Harm (spells, burns):
   * what Warded and Drenched act on.
   */
  readonly harmShare: number;
  /** Summoned stacks count this fraction of their value. */
  readonly summonWeight: number;
  /** Cast threshold as a fraction of this side's value. */
  readonly castFraction: number;
  /** The same at the side's last turn of the round. */
  readonly lastCastFraction: number;
  /** Command and item-act threshold as a fraction of this side's value. */
  readonly commandFraction: number;
  /** Value of one mana point (it stays spent after the battle). */
  readonly manaValue: number;
  /** Value of the battle's Fuel use. */
  readonly fuelValue: number;
  /** A scroll's cost as a fraction of its gold value. */
  readonly scrollFraction: number;
  /**
   * Share of what Steam adds to its bearer's best Strike (and, with Ram,
   * of the retaliation it spares) counted as the condition's worth: below
   * 1 because a banked blow is spent later, or by a retaliation, or never.
   */
  readonly steam: number;
}

export const DEFAULT_AI_WEIGHTS: AiWeights = {
  enemyThreat: 0.5,
  ownThreat: 0.3,
  far: 0.5,
  urgency: 0.03,
  aggression: 0.3,
  fearRounds: 6,
  behindPresses: 1,
  guardsPress: 1,
  seaGuardsAdvance: 1,
  aheadRounds: 3,
  aheadLead: 1.5,
  shooterExposure: 0.15,
  tempo: 0.2,
  harmShare: 0.2,
  summonWeight: 0.6,
  castFraction: 0.03,
  lastCastFraction: 0.01,
  commandFraction: 0.04,
  manaValue: 8,
  fuelValue: 60,
  scrollFraction: 0.3,
  steam: 0.6,
};

/**
 * How hard the AI searches: "full" (default) rehearses every candidate
 * and searches hero acts one ply deeper; "fast" estimates first and
 * rehearses the best few (battles no human watches, bead bzc.37).
 */
export type AiMode = "full" | "fast";

export interface AiOptions {
  /** Consider hero acts (casts, the Command, item acts). Default true. */
  readonly heroActs?: boolean;
  /** Weight overrides (tuning and tests). */
  readonly weights?: Partial<AiWeights>;
  /** Search mode (default "full"). */
  readonly mode?: AiMode;
  /**
   * Values the AI may reuse across the decisions of one battle (fast
   * mode; {@link createAiMemo}). With it the choice depends on the
   * decisions before it in that battle, so the battle screen's intents
   * (a pure function of the state) never pass one.
   */
  readonly memo?: AiMemo;
}

/**
 * Strike rates kept across the decisions of one battle round (fast mode,
 * bead bzc.37): the threat map's damage per creature of one stack
 * striking another, by both stacks' identity, side and conditions. A new
 * round (or another battle) starts it afresh. Owned by one auto-played
 * battle (auto.ts).
 */
export interface AiMemo {
  seed: number;
  round: number;
  readonly rates: Map<string, number>;
  /**
   * The round in which each side last searched its hero acts: with a
   * memo the fast mode searches them at a side's first decision of a
   * round and at its last, not at every stack's turn between.
   */
  readonly heroRound: { [S in BattleSide]: number };
}

/** Rounds a memo's strike rates are kept before they are recomputed. */
const MEMO_ROUNDS = 3;

export function createAiMemo(): AiMemo {
  return {
    seed: NaN,
    round: 0,
    rates: new Map(),
    heroRound: { attacker: 0, defender: 0 },
  };
}

/** Memo keys by stack record (records are never mutated). */
const memoKeys = new WeakMap<BattleStack, string>();

/** A stack's identity for the memo: id, creature, side and conditions. */
function memoKey(s: BattleStack): string {
  const hit = memoKeys.get(s);
  if (hit !== undefined) return hit;
  let k = `${s.id}:${s.creature.id}:${s.side}`;
  for (const c of s.conditions) k += `:${c.kind}${c.size}`;
  memoKeys.set(s, k);
  return k;
}

export interface ScoredAction {
  readonly action: BattleAction;
  /** Evaluation after the action minus before, from the acting side. */
  readonly score: number;
}

/** Gold value of a scroll by spell tier (catalog SCROLL_VALUE). */
const SCROLL_GOLD: readonly number[] = [0, 300, 600, 1000, 1500, 2500];

const WIN = 1e7;

/** The search limits of a mode. */
interface Limits {
  /** Moves rehearsed after the cheap estimate. */
  readonly movesRehearsed: number;
  /** Hero acts searched (the best by their own net gain). */
  readonly heroActsSearched: number;
  /**
   * Search each one ply deeper (the hero act, then the stack's best
   * action); without it a hero act counts its own gain.
   */
  readonly heroFollowUp: boolean;
  /** Casts tried with Echo and Fuel options. */
  readonly castsExtended: number;
  /** Stack targets tried per hero cast, the most valuable first. */
  readonly castTargets: number;
  /**
   * Attack hexes rehearsed per target, ranked by the incremental
   * placed-board estimate (Infinity: every hex, no estimate).
   */
  readonly attackHexes: number;
  /**
   * With ranked attack hexes: attacks and shots rehearsed in all, ranked
   * by the placed estimate plus the strike's damage value.
   */
  readonly strikeTargets: number;
  /** Area shots (any-hex) rehearsed, ranked by the stacks around them. */
  readonly areaShots: number;
  /** Hit and Run: attacks extended with a walk, and walks per attack. */
  readonly walkAttacks: number;
  readonly walksPerAttack: number;
  /** Rank moves with the incremental estimate (else full evaluations). */
  readonly incremental: boolean;
  /**
   * With a memo, search hero acts only at a side's first decision of a
   * round and at its last (else at every decision).
   */
  readonly heroActsOnce: boolean;
}

const LIMITS: { readonly [M in AiMode]: Limits } = {
  full: {
    movesRehearsed: 6,
    heroActsSearched: 3,
    heroFollowUp: true,
    castsExtended: 3,
    castTargets: Infinity,
    attackHexes: Infinity,
    strikeTargets: Infinity,
    areaShots: Infinity,
    walkAttacks: 2,
    walksPerAttack: 2,
    incremental: false,
    heroActsOnce: false,
  },
  fast: {
    movesRehearsed: 2,
    heroActsSearched: 3,
    heroFollowUp: false,
    castsExtended: 1,
    castTargets: 3,
    attackHexes: 1,
    strikeTargets: 3,
    areaShots: 3,
    walkAttacks: 1,
    walksPerAttack: 2,
    incremental: true,
    heroActsOnce: true,
  },
};

// ---------------------------------------------------------------------------
// Static distances (blocking ground only), cached per obstacle layout

const NEIGHBOURS: readonly (readonly number[])[] = Array.from(
  { length: BATTLE_HEX_COUNT },
  (_, i) => neighbors(hexFromIndex(i)).map(hexIndex),
);

const distCache = new Map<string, Uint8Array>();

function distances(state: BattleState, swimmer = false): Uint8Array {
  // A Swimmer's table leaves the sea open (NAVAL.md 3.8); on a field with
  // no sea both tables are the same one.
  const blocked = blockingHexesFor(state, swimmer ? SWIMMER : null).map(
    hexIndex,
  );
  const key = blocked.join(",");
  const hit = distCache.get(key);
  if (hit) return hit;
  const isBlocked = new Uint8Array(BATTLE_HEX_COUNT);
  for (const b of blocked) isBlocked[b] = 1;
  const n = BATTLE_HEX_COUNT;
  const table = new Uint8Array(n * n).fill(255);
  const queue = new Int16Array(n);
  for (let from = 0; from < n; from++) {
    const base = from * n;
    table[base + from] = 0;
    let head = 0;
    let tail = 0;
    queue[tail++] = from;
    while (head < tail) {
      const cur = queue[head++] as number;
      const d = table[base + cur] as number;
      for (const nb of NEIGHBOURS[cur] as readonly number[]) {
        // Blocked hexes get a distance (a stack may stand there after a
        // push) but are never walked through.
        if (table[base + nb] !== 255) continue;
        table[base + nb] = d + 1;
        if (!isBlocked[nb]) queue[tail++] = nb;
      }
    }
  }
  if (distCache.size >= 16) distCache.clear();
  distCache.set(key, table);
  return table;
}

// ---------------------------------------------------------------------------
// The decision context

/** A neutral guard: no hero and no native (faction) stack. */
function isNeutralGuard(state: BattleState, side: BattleSide): boolean {
  return (
    state.sides[side].hero === null &&
    !state.stacks.some((s) => s.owner === side && s.native)
  );
}

/**
 * The side ahead on the verdict by `aheadLead` presses in the last
 * `aheadRounds` rounds: it would win at the limit anyway, so it spends some
 * safety to finish the battle instead of waiting it out.
 */
function aheadPresses(
  state: BattleState,
  me: BattleSide,
  w: AiWeights,
): boolean {
  if (w.aheadRounds <= 0) return false;
  if (state.round <= roundLimitOf(state) - w.aheadRounds) return false;
  const mine = fightValueLeft(state, me);
  const theirs = fightValueLeft(state, enemySide(me));
  return mine >= w.aheadLead * Math.max(1, theirs);
}

/** A stand-in creature for the Swimmers' distance table. */
const SWIMMER: BattleCreatureStats = {
  id: "ai:swimmer",
  tier: 1,
  hp: 1,
  attack: 0,
  defense: 0,
  damage: 1,
  speed: 1,
  abilities: ["swimmer"],
};

class Context {
  readonly w: AiWeights;
  readonly me: BattleSide;
  readonly dist: Uint8Array;
  /** Walking distances for Swimmers (the sea open); `dist` without sea. */
  readonly swimDist: Uint8Array;
  readonly limits: Limits;
  /** This side presses (behind at the limit, a guard, or the attacker). */
  readonly presses: boolean;
  /**
   * A neutral guard with Swimmers on a field with sea (NAVAL.md 12): it
   * advances on the enemy's deck, fearing no reach (threatWeights).
   */
  readonly seaGuard: boolean;
  /** Attacker id -> target id + "s"/"m" -> damage per creature. */
  private readonly rates = new Map<string, Map<string, number>>();
  private readonly memo: AiMemo | null;

  constructor(
    state: BattleState,
    me: BattleSide,
    w: AiWeights,
    mode: AiMode = "full",
    memo: AiMemo | null = null,
  ) {
    this.w = w;
    this.me = me;
    this.limits = LIMITS[mode];
    this.memo = memo;
    if (
      memo !== null &&
      (memo.seed !== state.seed ||
        state.round < memo.round ||
        state.round >= memo.round + MEMO_ROUNDS)
    ) {
      // Another battle (or a later round): start afresh.
      if (memo.seed !== state.seed || state.round < memo.round) {
        memo.heroRound.attacker = 0;
        memo.heroRound.defender = 0;
      }
      memo.rates.clear();
      memo.round = state.round;
      memo.seed = state.seed;
    }
    this.dist = distances(state);
    this.swimDist = state.ground.some((g) => g.kind === "sea")
      ? distances(state, true)
      : this.dist;
    this.seaGuard =
      w.seaGuardsAdvance > 0 &&
      this.swimDist !== this.dist &&
      isNeutralGuard(state, me) &&
      state.stacks.some(
        (s) => s.side === me && isAlive(s) && traitsOf(s.creature).swims,
      );
    this.presses =
      (w.guardsPress > 0 && isNeutralGuard(state, me)) ||
      (w.behindPresses > 0
        ? roundLimitWinner(state) !== me
        : me === "attacker") ||
      aheadPresses(state, me, w);
  }

  /**
   * Walking distance between two hexes around blocking ground; through the
   * sea for a Swimmer.
   */
  distance(a: Hex, b: Hex, swimmer = false): number {
    const t = swimmer ? this.swimDist : this.dist;
    return t[hexIndex(a) * BATTLE_HEX_COUNT + hexIndex(b)] as number;
  }

  /**
   * Damage per creature of `a` striking `b` (melee or shot), with every
   * modifier of the board it is first asked on (memoised per decision,
   * and per round with a memo) except a spotter's (Spotter), which the
   * threat map applies by position. `bare` leaves `a`'s Steam out too
   * (what Steam adds is its condition's worth).
   */
  rate(
    state: BattleState,
    a: BattleStack,
    b: BattleStack,
    shot: boolean,
    bare = false,
  ): number {
    let row = this.rates.get(a.id);
    if (row === undefined) {
      row = new Map();
      this.rates.set(a.id, row);
    }
    const tag = `${shot ? "s" : "m"}${bare ? "0" : ""}`;
    const key = `${b.id}${tag}`;
    const hit = row.get(key);
    if (hit !== undefined) return hit;
    const memoKeyAB =
      this.memo === null ? null : `${memoKey(a)}>${memoKey(b)}${tag}`;
    if (memoKeyAB !== null) {
      const kept = this.memo?.rates.get(memoKeyAB);
      if (kept !== undefined) {
        row.set(key, kept);
        return kept;
      }
    }
    const attacker: BattleStack = bare
      ? {
          ...a,
          defending: false,
          conditions: a.conditions.filter((c) => c.kind !== STEAM),
        }
      : { ...a, defending: false };
    const bd = computeBreakdown({
      state,
      attacker,
      defender: { ...b, defending: false },
      kind: shot ? "shot" : "melee",
      hexesMoved: 0,
    });
    let damage = bd.damage;
    for (const m of bd.abilityMultipliers)
      if (spotPercentOf(m.source) > 0) damage /= m.percent / 100;
    const r = damage / Math.max(1, a.count);
    row.set(key, r);
    if (memoKeyAB !== null) this.memo?.rates.set(memoKeyAB, r);
    return r;
  }
}

// ---------------------------------------------------------------------------
// Evaluation

/** Spotter percents by ability id (0: not a spotter, or not an ability). */
const spotPercents = new Map<string, number>();

/** The `aiSpotPercent` of the ability `id`, 0 for other sources. */
function spotPercentOf(id: string): number {
  const hit = spotPercents.get(id);
  if (hit !== undefined) return hit;
  const p = hasAbility(id) ? (ability(id).aiSpotPercent ?? 0) : 0;
  spotPercents.set(id, p);
  return p;
}

/**
 * What a condition is worth to the bearer's side (negative for its
 * enemy), in value, for the rounds it has left. `far` is the living far
 * end of a link, if any.
 */
function conditionWorth(
  c: Condition,
  bearer: BattleStack,
  value: number,
  w: AiWeights,
  far: BattleStack | undefined,
  /** The bearer has had its turn this round. */
  acted = false,
  /** An enemy of the bearer stands next to it (for "cannot walk" kinds). */
  pinned = false,
): number {
  const rounds = c.clock === null ? 3 : Math.min(3, c.clock);
  const vph = aiValuePerHp(bearer.creature);
  const t = w.tempo;
  const kind = conditionKind(c.kind);
  const s = c.size;
  let worth: number;
  if (kind.cannotWalk === true) {
    // Cannot walk (Stuck, FACTION_CANDY 12): a shooter held next to an
    // enemy can neither shoot nor walk clear; a melee stack with nothing
    // next to it can do nothing; one in contact can still hit what holds
    // it, and a shooter in the clear still shoots.
    // A shooter that shoots point-blank (Turret) is never held from it.
    const shooter = liveShooter(bearer);
    const held = pinned && silenceable(bearer);
    const f = shooter ? (held ? 0.6 : 0.05) : pinned ? 0.1 : 0.3;
    worth = f * t * rounds * value;
    return kind.polarity === "boon" ? worth : -worth;
  }
  switch (c.kind) {
    case "frozen":
    case "asleep":
      worth = 1.5 * t * Math.min(2, rounds) * value;
      break;
    case "turned":
      worth = 3 * t * rounds * value;
      break;
    case "delayed":
    case "shaken":
    case "hastened": {
      // A place on the timeline (Hastened, Delayed) is no use in a round
      // whose turn the bearer has had (Sugar Rush on a stack that has not
      // acted gains a round more).
      const r =
        kind.timelineClass !== undefined && acted
          ? Math.max(0, rounds - 1)
          : rounds;
      worth = 0.2 * t * r * value;
      break;
    }
    case "heartened":
      worth = 0.8 * t * value;
      break;
    case "lucky":
      worth = 0.5 * t * value;
      break;
    case "jinxed":
      worth = (0.01 * s + 0.2) * t * rounds * value;
      break;
    case "venomed":
    case "shielded":
    case "fired-up":
      worth = 0.05 * s * t * rounds * value;
      break;
    case "mollified":
    case "ripening":
      worth = 0.01 * s * t * rounds * value;
      break;
    case "warded":
    case "drenched":
      // Only Harm is scaled (links carry theirs unscaled, 1.4).
      worth = (Math.min(75, s) / 100) * w.harmShare * t * rounds * value;
      break;
    case "quickened":
    case "slowed":
      worth = 0.06 * s * t * rounds * value;
      break;
    case "hushed":
      worth =
        isRangedCreature(bearer.creature) && bearer.shotsLeft > 0
          ? t * rounds * value
          : 0;
      break;
    case "burning":
    case "leeched":
      worth = Math.min(s * rounds * vph, value);
      break;
    case "reckoning":
      worth = Math.min(s * vph, value);
      break;
    case "mending":
      worth = 0.7 * s * rounds * vph;
      break;
    case "thorned":
      worth = 5 * s * rounds;
      break;
    case "scapegoat": {
      // Damage to the bearer goes to the far end as Harm, up to the far
      // end's HP: worth the difference in value per HP between the two
      // ends (negative when the far end is the dearer stack).
      if (far === undefined) {
        worth = 0;
        break;
      }
      const farHp = totalHp({
        count: far.count,
        hp: far.creature.hp,
        topHp: far.topHp,
      });
      const covered = Math.min(value, farHp * vph);
      worth =
        0.5 * t * rounds * covered * (1 - aiValuePerHp(far.creature) / vph);
      break;
    }
    case "sworn":
      worth = 0.15 * t * value;
      break;
    case "challenged":
      worth = 0.3 * t * rounds * value;
      break;
    default:
      worth = 0.15 * t * rounds * value;
  }
  return kind.polarity === "boon" ? worth : -worth;
}

/** The stack has had its turn this round (not active, queued or waiting). */
function hasActed(state: BattleState, s: BattleStack): boolean {
  return (
    s.id !== state.activeStackId &&
    !state.queue.includes(s.id) &&
    !state.waiting.includes(s.id)
  );
}

/** The creatures a dead stack gets up with (a third, rounded up). */
function getUpValue(stack: BattleStack): number {
  const n = Math.ceil(stack.initialCount / 3);
  return n * stack.creature.hp * aiValuePerHp(stack.creature);
}

function hasRemainsOf(state: BattleState, id: string): boolean {
  return state.ground.some((g) => g.class === "remains" && g.source === id);
}

/**
 * Damage value `side` could deal: each of its stacks that can act strikes
 * the enemy stack where it does the most (shooters anywhere, melee stacks
 * within Speed + 1 hexes around blocking ground). With `far` > 0, targets
 * out of reach count too, at `far` to the power of the turns it takes to
 * reach them (the pull toward the enemy).
 */
function threat(
  ctx: Context,
  state: BattleState,
  side: BattleSide,
  alive: readonly BattleStack[],
  far: number,
): number {
  let total = 0;
  const spots = spotMap(alive, side);
  for (const a of alive) {
    if (a.side !== side) continue;
    if (bears(a, "cannotAct")) continue;
    const enemyNear = alive.some(
      (e) => e.side !== side && isAdjacent(e.hex, a.hex),
    );
    const s = striker(a, a.hex, enemyNear, spots);
    let best = 0;
    for (const b of alive) {
      if (b.side === side) continue;
      const v = strikeValue(ctx, state, s, b, b.hex, far);
      if (v > best) best = v;
    }
    total += best;
    if (aftersPending(state, a)) {
      // The round-end turn still to come strikes what stands next to it.
      let extra = 0;
      for (const b of alive) {
        if (b.side === side || !isAdjacent(b.hex, a.hex)) continue;
        extra = Math.max(extra, strikeOnly(ctx, state, s, b, 1));
      }
      total += extra;
    }
  }
  return total;
}

/**
 * `a` still takes its round-end turn this round (Afters, FACTION_CANDY 5)
 * after its own turn is over: one more Strike, without a walk, on a stack
 * next to it.
 */
function aftersPending(state: BattleState, a: BattleStack): boolean {
  return (
    traitsOf(a.creature).afters &&
    a.extraTurnRound !== state.round &&
    a.aftersRound !== state.round &&
    !bears(a, "hold") &&
    !bears(a, "cannotAct") &&
    hasActed(state, a)
  );
}

/** A stack that could strike next turn, from `hex`. */
interface Striker {
  readonly a: BattleStack;
  readonly hex: Hex;
  readonly shooter: boolean;
  readonly speed: number;
  readonly reach: number;
  readonly teleport: boolean;
  /**
   * Rounds the stack cannot walk (a condition such as Stuck; 0: it can):
   * it reaches only what stands next to it, and farther targets wait that
   * many turns more.
   */
  readonly stuck: number;
  /** What the creature's abilities tell the threat map. */
  readonly traits: Traits;
  /**
   * Hexes its side's spotters stand next to, with their percent (its
   * shots there are multiplied; Spotter), or null.
   */
  readonly spots: SpotMap | null;
}

/** Hex index -> the best spotter percent on that hex (Spotter). */
type SpotMap = ReadonlyMap<number, number>;

/** The threat map's reading of a creature's abilities (FACTION_CANDY 12). */
interface Traits {
  /** Its walk is a teleport (Mist). */
  readonly teleport: boolean;
  /** It is a Swimmer: it walks through the sea (NAVAL.md 3.1). */
  readonly swims: boolean;
  /** It takes a round-end turn (Afters): a second Strike on what it reaches. */
  readonly afters: boolean;
  /** Its melee Strikes leave a "cannot walk" condition (Sticky). */
  readonly sticks: boolean;
  /** Pull abilities (Reel In): reach and HP limit against a target. */
  readonly pulls: readonly NonNullable<AbilityDef["aiPull"]>[];
  /** Friendly shots at a stack next to it are x this percent (0: none). */
  readonly spot: number;
  /** Its melee Strike that spends Steam denies the retaliation (Ram). */
  readonly steamPush: boolean;
  /** Its shot is a shell landing next round (Lob): the splash percent. */
  readonly shellSplash: number | null;
}

/** Memoised traits by creature record (records are never mutated). */
const traitsCache = new WeakMap<BattleCreatureStats, Traits>();

function traitsOf(creature: BattleCreatureStats): Traits {
  const hit = traitsCache.get(creature);
  if (hit !== undefined) return hit;
  const defs = creature.abilities.map((x) => ability(x));
  const pulls: NonNullable<AbilityDef["aiPull"]>[] = [];
  for (const d of defs) if (d.aiPull) pulls.push(d.aiPull);
  const t: Traits = {
    teleport: defs.some((d) => d.teleportWalk === true),
    swims: defs.some((d) => d.swimmer === true),
    afters: defs.some((d) => d.roundEndTurn === true),
    sticks: defs.some(
      (d) =>
        d.aiMeleeMakes !== undefined &&
        conditionKind(d.aiMeleeMakes).cannotWalk === true,
    ),
    pulls,
    spot: Math.max(0, ...defs.map((d) => d.aiSpotPercent ?? 0)),
    steamPush: defs.some((d) => d.aiSteamPush === true),
    shellSplash:
      defs.find((d) => d.aiShell !== undefined)?.aiShell?.splashPercent ?? null,
  };
  traitsCache.set(creature, t);
  return t;
}

/** Rounds `a` cannot walk for (the longest "cannot walk" clock), or 0. */
function stuckRounds(a: BattleStack): number {
  let n = 0;
  for (const c of a.conditions) {
    if (conditionKind(c.kind).cannotWalk !== true) continue;
    n = Math.max(n, c.clock === null ? 3 : Math.max(1, c.clock));
  }
  return n;
}

/**
 * The hexes `side`'s spotters (Spotter) stand next to, with the best
 * percent on each; null when the side has none. `moved` places one stack
 * on another hex (the fast estimate).
 */
function spotMap(
  alive: readonly BattleStack[],
  side: BattleSide,
  moved: { readonly id: string; readonly hex: Hex } | null = null,
): SpotMap | null {
  let out: Map<number, number> | null = null;
  for (const s of alive) {
    if (s.side !== side) continue;
    const p = traitsOf(s.creature).spot;
    if (p <= 0) continue;
    const hex = moved !== null && moved.id === s.id ? moved.hex : s.hex;
    out ??= new Map();
    for (const n of neighbors(hex)) {
      const i = hexIndex(n);
      if ((out.get(i) ?? 0) < p) out.set(i, p);
    }
  }
  return out;
}

function striker(
  a: BattleStack,
  hex: Hex,
  enemyNear: boolean,
  spots: SpotMap | null = null,
): Striker {
  // A stack that shoots point-blank (Turret) shoots with an enemy next to
  // it too.
  const shooter =
    isRangedCreature(a.creature) &&
    a.shotsLeft > 0 &&
    (!enemyNear || shootsPointBlank(a.creature)) &&
    !bears(a, "cannotShoot");
  const speed = Math.max(1, effectiveSpeed(a));
  const traits = traitsOf(a.creature);
  return {
    a,
    hex,
    shooter,
    speed,
    reach: speed + 1,
    teleport: traits.teleport,
    stuck: stuckRounds(a),
    traits,
    spots,
  };
}

/** A shooter that still has its shots (what reach and pulls take away). */
function liveShooter(b: BattleStack): boolean {
  return isRangedCreature(b.creature) && b.shotsLeft > 0 && !b.summoned;
}

/**
 * A live shooter that an enemy next to it stops shooting: not one that
 * shoots point-blank (Turret, FACTION_DWARVES 5).
 */
function silenceable(b: BattleStack): boolean {
  return liveShooter(b) && !shootsPointBlank(b.creature);
}

/**
 * What striker `s` is worth against shooter `b` on `bHex` by pulling it
 * out of shooting (Reel In) instead of striking: the shooter's exposure,
 * when `b` is within the striker's walk plus the pull's range and under
 * its HP limit; else 0.
 */
function pullValue(
  ctx: Context,
  s: Striker,
  b: BattleStack,
  bHex: Hex,
): number {
  if (s.traits.pulls.length === 0 || !silenceable(b)) return 0;
  const d = hexDistance(s.hex, bHex);
  if (d <= 1) return 0;
  const walk = s.stuck > 0 ? 0 : s.speed;
  const hp = totalHp({ count: b.count, hp: b.creature.hp, topHp: b.topHp });
  for (const pull of s.traits.pulls) {
    const lim = pull(s.a, b);
    if (d <= lim.range + walk && hp <= lim.hp)
      return ctx.w.shooterExposure * stackValue(b);
  }
  return 0;
}

/**
 * The damage value striker `s` could deal to `b` standing on `bHex` (0
 * out of reach unless `far` > 0 pulls it forward).
 */
function strikeValue(
  ctx: Context,
  state: BattleState,
  s: Striker,
  b: BattleStack,
  bHex: Hex,
  far: number,
): number {
  if (!s.shooter) {
    const d = s.teleport
      ? hexDistance(s.hex, bHex)
      : ctx.distance(s.hex, bHex, s.traits.swims);
    // A stack that cannot walk reaches only what stands next to it; a
    // farther target waits until it can walk again.
    const reach = s.stuck > 0 ? 1 : s.reach;
    if (d > reach) {
      const pv = pullValue(ctx, s, b, bHex);
      if (far <= 0 || d === 255) return pv;
      const turns = s.stuck + Math.max(0, d - s.reach) / s.speed;
      const factor = far ** Math.min(6, turns);
      return Math.max(
        pv,
        factor * strikeOnly(ctx, state, s, b, undefined, bHex),
      );
    }
  }
  let v = strikeOnly(ctx, state, s, b, undefined, bHex);
  // A shooter reached in melee loses its shots too, and one that cannot
  // walk clear of its striker (Sticky) loses them twice over; not one that
  // shoots point-blank (Turret).
  if (!s.shooter && silenceable(b))
    v += (s.traits.sticks ? 2 : 1) * ctx.w.shooterExposure * stackValue(b);
  return v;
}

/**
 * The damage value of striker `s` striking `b` standing on `bHex` (no
 * reach or exposure terms); a melee stack with a round-end turn (Afters)
 * strikes twice, and a shot at a stack its side's spotter stands next to
 * is multiplied (Spotter).
 */
function strikeOnly(
  ctx: Context,
  state: BattleState,
  s: Striker,
  b: BattleStack,
  strikes = s.traits.afters && !s.shooter ? 2 : 1,
  bHex: Hex = b.hex,
): number {
  let dmg = ctx.rate(state, s.a, b, s.shooter) * s.a.count;
  if (strikes !== 1) dmg *= strikes;
  if (s.shooter && s.spots !== null) {
    const p = s.spots.get(hexIndex(bHex));
    if (p !== undefined) dmg *= p / 100;
  }
  if (b.defending) dmg *= 0.8;
  const hp = totalHp({
    count: b.count,
    hp: b.creature.hp,
    topHp: b.topHp,
  });
  return Math.min(dmg, hp) * aiValuePerHp(b.creature);
}

/** The threat weights of the board: enemy reach (fear) and own reach. */
function threatWeights(
  ctx: Context,
  state: BattleState,
): { fear: number; own: number } {
  // The side behind on the round-limit verdict (1.12) must break the other
  // before the limit: it fears the enemy's reach less and presses harder,
  // more each round. Neutral guards always press, and so does a side well
  // ahead in the last rounds (aheadRounds).
  const att = ctx.presses;
  // Sea guards advance (NAVAL.md 3.6 and 12, bead bzc.156): neutral
  // Swimmers on a field with sea fear no reach at all. A ship's walkers
  // cannot come out to them, so a guard that kept out of their reach
  // would wait in the water for the round limit.
  const fade =
    att && ctx.w.fearRounds > 0
      ? Math.max(0, 1 - (state.round - 1) / ctx.w.fearRounds)
      : 1;
  const fear = ctx.seaGuard
    ? 0
    : ctx.w.enemyThreat * (att ? 1 - ctx.w.aggression : 1) * fade;
  const own =
    ctx.w.ownThreat * (att ? 1 + ctx.w.aggression : 1) +
    (att ? ctx.w.urgency * Math.max(0, state.round - 1) : 0);
  return { fear, own };
}

/** The board's value for `ctx.me` (higher is better). */
function evaluate(ctx: Context, state: BattleState): number {
  const me = ctx.me;
  if (state.winner !== null) {
    const v = materialOf(ctx, state);
    return state.winner === me ? WIN + v : -WIN + v;
  }
  const alive = state.stacks.filter(isAlive);
  let v = staticValue(ctx, state, alive);
  const shells = liveShells(state, alive);
  for (const s of alive)
    v += shellsOn(ctx, state, shells, s, s.hex, shellPresence(state, s));
  const them = enemySide(me);
  const { fear, own } = threatWeights(ctx, state);
  v -= fear * threat(ctx, state, them, alive, 0);
  v += own * threat(ctx, state, me, alive, ctx.w.far);
  return v;
}

/**
 * What Steam of `size` on `s` is worth to its side (FACTION_DWARVES 12):
 * the share `w.steam` of what it adds to the stack's best Strike on any
 * enemy (a shot for a shooter), and for a stack whose steamed melee
 * Strike pushes its target away (Ram) of the retaliation that Strike's
 * target would have made. Where the stacks stand does not matter.
 */
function steamWorth(
  ctx: Context,
  state: BattleState,
  s: BattleStack,
  alive: readonly BattleStack[],
  size: number,
): number {
  if (size <= 0 || bears(s, "cannotAct")) return 0;
  const shooter =
    isRangedCreature(s.creature) && s.shotsLeft > 0 && !bears(s, "cannotShoot");
  const pct = 1 + (STEAM_PERCENT_PER_SIZE * size) / 100;
  const push = !shooter && traitsOf(s.creature).steamPush;
  const ownHp = totalHp({ count: s.count, hp: s.creature.hp, topHp: s.topHp });
  let best = 0;
  for (const b of alive) {
    if (b.side === s.side) continue;
    const dmg = ctx.rate(state, s, b, shooter, true) * s.count;
    const hp = totalHp({ count: b.count, hp: b.creature.hp, topHp: b.topHp });
    let gain =
      (Math.min(dmg * pct, hp) - Math.min(dmg, hp)) * aiValuePerHp(b.creature);
    if (push && !bears(b, "cannotRetaliate") && !bears(b, "cannotAct")) {
      const back = ctx.rate(state, b, s, false) * b.count;
      gain += Math.min(back, ownHp) * aiValuePerHp(s.creature);
    }
    if (gain > best) best = gain;
  }
  return ctx.w.steam * best;
}

// ---------------------------------------------------------------------------
// Shells in the air (Lob, FACTION_DWARVES 5 and 12)

/**
 * The share of a stack still to act this round counted as standing where
 * it stands when a shell lands at the next round's start: it may step
 * off the marked hex.
 */
const SHELL_STAY = 0.5;

/** A shell in the air whose shooter lives (a dead shooter's is a dud). */
interface LiveShell {
  readonly m: BattleStack;
  readonly hex: Hex;
  /** Percent of the shell's Strike on the stacks next to its hex. */
  readonly splash: number;
  /** The shooter's side's spotters (Spotter, read when it lands). */
  readonly spots: SpotMap | null;
}

function liveShells(
  state: BattleState,
  alive: readonly BattleStack[],
  moved: { readonly id: string; readonly hex: Hex } | null = null,
): LiveShell[] {
  if (state.scheduled.length === 0) return [];
  const out: LiveShell[] = [];
  for (const sh of pendingShells(state)) {
    const m = alive.find((x) => x.id === sh.stackId);
    if (m === undefined) continue;
    out.push({
      m,
      hex: sh.hex,
      splash: traitsOf(m.creature).shellSplash ?? 0,
      spots: spotMap(alive, m.side, moved),
    });
  }
  return out;
}

/**
 * The share of `s` counted where it stands when the shells land: in full
 * for a stack whose turn this round is over and one that cannot walk;
 * `SHELL_STAY` for one still to act, the active stack included (a
 * rehearsed walk ends its turn, so the stack then counts in full where it
 * went).
 */
function shellPresence(state: BattleState, s: BattleStack): number {
  if (hasActed(state, s)) return 1;
  if (bears(s, "cannotWalk") || bears(s, "hold") || bears(s, "cannotAct"))
    return 1;
  return SHELL_STAY;
}

/**
 * What the shells in the air do to `s` standing on `hex`, for `ctx.me`
 * (positive when an enemy is hit): the shooter's shot Strike on the hex,
 * the splash next to it, friend or foe, times `presence`.
 */
function shellsOn(
  ctx: Context,
  state: BattleState,
  shells: readonly LiveShell[],
  s: BattleStack,
  hex: Hex,
  presence: number,
): number {
  let v = 0;
  for (const sh of shells) {
    const d = hexDistance(hex, sh.hex);
    if (d > 1) continue;
    let dmg = ctx.rate(state, sh.m, s, true) * sh.m.count;
    if (d === 1) dmg *= sh.splash / 100;
    const p = sh.spots?.get(hexIndex(hex));
    if (p !== undefined) dmg *= p / 100;
    if (s.defending) dmg *= 0.8;
    const hp = totalHp({ count: s.count, hp: s.creature.hp, topHp: s.topHp });
    v += Math.min(dmg, hp) * aiValuePerHp(s.creature) * presence;
  }
  return s.owner === ctx.me ? -v : v;
}

// ---------------------------------------------------------------------------
// Deck guns (NAVAL.md 3.3 and 12)

/** A scheduled deck gun's Harm (its event's `harm` argument), or 0. */
function deckGunHarmOf(args: unknown): number {
  if (args === null || typeof args !== "object" || Array.isArray(args))
    return 0;
  const h = (args as { readonly harm?: unknown }).harm;
  return typeof h === "number" && Number.isFinite(h) ? Math.max(0, h) : 0;
}

/**
 * What the deck guns still to fire are worth to `ctx.me` (bead bzc.156):
 * each scheduled gun's Harm on the strongest stack fighting against its
 * side (fight value, field order on a tie), as the event will pick it, in
 * value per HP; negative when that stack is ours. Like the tower's shot it
 * hits whatever stands where, so it is a term of the board: an action that
 * leaves another stack the strongest moves the shot, and every candidate
 * counts the next shot alike (a rehearsal that ends the round no longer
 * looks better or worse for the shot fired inside it).
 */
function deckGunsOn(
  ctx: Context,
  state: BattleState,
  alive: readonly BattleStack[],
): number {
  let v = 0;
  for (const e of state.scheduled) {
    if (e.effect.id !== DECK_GUN_EFFECT) continue;
    const harm = deckGunHarmOf(e.effect.args);
    // It stops when its side holds no living stack.
    if (harm <= 0 || !alive.some((s) => s.side === e.side)) continue;
    let target: BattleStack | null = null;
    let best = -1;
    for (const s of alive) {
      if (s.side === e.side) continue;
      const fv = s.count * creatureFightValue(s.creature);
      if (fv > best) {
        best = fv;
        target = s;
      }
    }
    if (target === null) continue;
    const hp = totalHp({
      count: target.count,
      hp: target.creature.hp,
      topHp: target.topHp,
    });
    const worth = Math.min(harm, hp) * aiValuePerHp(target.creature);
    v += target.owner === ctx.me ? -worth : worth;
  }
  return v;
}

/**
 * The board's value without the threat terms: material, conditions,
 * pending get-ups and the deck guns still to fire (nothing here depends on
 * where a stack stands).
 */
function staticValue(
  ctx: Context,
  state: BattleState,
  alive: readonly BattleStack[],
): number {
  const me = ctx.me;
  let v = materialOf(ctx, state);
  for (const s of alive) {
    const sign = s.owner === me ? 1 : -1;
    const value = stackValue(s);
    for (const c of s.conditions) {
      const far =
        c.link === null ? undefined : alive.find((x) => x.id === c.link);
      if (c.kind === STEAM) {
        v += sign * steamWorth(ctx, state, s, alive, c.size);
        continue;
      }
      const kind = conditionKind(c.kind);
      const acted = kind.timelineClass !== undefined && hasActed(state, s);
      const pinned =
        kind.cannotWalk === true &&
        alive.some((e) => e.side !== s.side && isAdjacent(e.hex, s.hex));
      v += sign * conditionWorth(c, s, value, ctx.w, far, acted, pinned);
    }
    if (s.getsUp === true) v += sign * 0.3 * getUpValue(s);
  }
  if (state.scheduled.length > 0) v += deckGunsOn(ctx, state, alive);
  for (const e of state.scheduled) {
    if (e.effect.id !== GET_UP_EFFECT) continue;
    const args = e.effect.args as { readonly stackId?: unknown } | undefined;
    const id = typeof args?.stackId === "string" ? args.stackId : null;
    const s = id === null ? null : state.stacks.find((x) => x.id === id);
    if (!s || isAlive(s) || !hasRemainsOf(state, s.id)) continue;
    v += (s.owner === me ? 0.9 : -0.9) * getUpValue(s);
  }
  return v;
}

/**
 * The worth of `s`'s "cannot walk" conditions for `ctx.me` (signed by
 * owner), with or without an enemy next to it.
 */
function pinWorth(ctx: Context, s: BattleStack, held: boolean): number {
  const sign = s.owner === ctx.me ? 1 : -1;
  const value = stackValue(s);
  let v = 0;
  for (const c of s.conditions) {
    if (conditionKind(c.kind).cannotWalk !== true) continue;
    v += sign * conditionWorth(c, s, value, ctx.w, undefined, false, held);
  }
  return v;
}

/**
 * The incremental move estimate (fast mode): the value of the board with
 * stack `moverId` placed on another hex, as {@link evaluate} would give it
 * for `placed(state, moverId, hex)`, without re-evaluating the board.
 * The threat map is computed once: every stack's best strike that does
 * not involve the mover; per hex only the mover's own strike and the
 * strikes against it are recomputed (and an enemy shooter it would stand
 * next to loses its shot).
 */
function placedEstimator(
  ctx: Context,
  state: BattleState,
  moverId: string,
): (hex: Hex) => number {
  const me = ctx.me;
  const them = enemySide(me);
  const alive = state.stacks.filter(isAlive);
  const m = alive.find((x) => x.id === moverId);
  const base = staticValue(ctx, state, alive);
  const { fear, own } = threatWeights(ctx, state);
  if (m === undefined || m.side !== me) {
    const fixed = evaluate(ctx, state);
    return () => fixed;
  }
  const moverActs = !bears(m, "cannotAct");
  // "Cannot walk" conditions are worth more on a stack held in contact:
  // the stacks whose contact the mover makes or breaks, and the mover.
  const pins: {
    readonly s: BattleStack;
    /** Held by a stack other than the mover. */
    readonly others: boolean;
    readonly now: number;
  }[] = [];
  for (const s of alive) {
    if (s.id !== m.id && s.side === m.side) continue;
    if (!s.conditions.some((c) => conditionKind(c.kind).cannotWalk === true))
      continue;
    const others = alive.some(
      (e) => e.id !== m.id && e.side !== s.side && isAdjacent(e.hex, s.hex),
    );
    const held = s.id === m.id ? others : others || isAdjacent(m.hex, s.hex);
    pins.push({ s, others, now: pinWorth(ctx, s, held) });
  }
  const pinDelta = (hex: Hex): number => {
    let d = 0;
    for (const p of pins) {
      const held =
        p.s.id === m.id
          ? alive.some(
              (e) =>
                e.side !== m.side && e.id !== m.id && isAdjacent(e.hex, hex),
            )
          : p.others || isAdjacent(hex, p.s.hex);
      d += pinWorth(ctx, p.s, held) - p.now;
    }
    return d;
  };
  // A spotter's hex changes what its side's shots are worth (Spotter):
  // with a spotting mover, the own shooters' strikes and the shells are
  // recomputed per hex.
  const moverSpots = traitsOf(m.creature).spot > 0;
  const mySpots = spotMap(alive, me);
  const theirSpots = spotMap(alive, them);
  const spotsAt = (hex: Hex): SpotMap | null =>
    moverSpots ? spotMap(alive, me, { id: m.id, hex }) : mySpots;
  const ownShooters: BattleStack[] = [];
  const bestStrike = (s: Striker): number => {
    let best = 0;
    for (const b of alive) {
      if (b.side === me) continue;
      const v = strikeValue(ctx, state, s, b, b.hex, ctx.w.far);
      if (v > best) best = v;
    }
    return best;
  };
  // Own side: every other stack's best strike (the enemies do not move).
  let ownFixed = 0;
  for (const a of alive) {
    if (a.side !== me || a.id === m.id || bears(a, "cannotAct")) continue;
    const near = alive.some((e) => e.side !== me && isAdjacent(e.hex, a.hex));
    const s = striker(a, a.hex, near, mySpots);
    if (moverSpots && s.shooter) ownShooters.push(a);
    else ownFixed += bestStrike(s);
    if (aftersPending(state, a)) {
      let extra = 0;
      for (const b of alive) {
        if (b.side === me || !isAdjacent(b.hex, a.hex)) continue;
        extra = Math.max(extra, strikeOnly(ctx, state, s, b, 1));
      }
      ownFixed += extra;
    }
  }
  const targets = alive.filter((b) => b.side !== me);
  // Enemy side: each stack's best strike at stacks other than the mover,
  // as a shooter and in melee (the mover may stand next to it).
  const enemies: {
    readonly hex: Hex;
    readonly nearExcl: boolean;
    readonly shoot: Striker;
    readonly melee: Striker;
    readonly bestShoot: number;
    readonly bestMelee: number;
    /** Its Afters strike is still due this round. */
    readonly afters: boolean;
    /** That strike's best value on stacks other than the mover. */
    readonly aftersExcl: number;
  }[] = [];
  for (const e of alive) {
    if (e.side !== them || bears(e, "cannotAct")) continue;
    const nearExcl = alive.some(
      (x) => x.side !== them && x.id !== m.id && isAdjacent(x.hex, e.hex),
    );
    const shoot = striker(e, e.hex, nearExcl, theirSpots);
    const melee = striker(e, e.hex, true, theirSpots);
    let bestShoot = 0;
    let bestMelee = 0;
    for (const b of alive) {
      if (b.side === them || b.id === m.id) continue;
      const vs = strikeValue(ctx, state, shoot, b, b.hex, 0);
      if (vs > bestShoot) bestShoot = vs;
      const vm =
        shoot.shooter === melee.shooter
          ? vs
          : strikeValue(ctx, state, melee, b, b.hex, 0);
      if (vm > bestMelee) bestMelee = vm;
    }
    const afters = aftersPending(state, e);
    let aftersExcl = 0;
    if (afters) {
      for (const b of alive) {
        if (b.side === them || b.id === m.id || !isAdjacent(b.hex, e.hex))
          continue;
        aftersExcl = Math.max(aftersExcl, strikeOnly(ctx, state, melee, b, 1));
      }
    }
    enemies.push({
      hex: e.hex,
      nearExcl,
      shoot,
      melee,
      bestShoot,
      bestMelee,
      afters,
      aftersExcl,
    });
  }
  // Shells in the air: the other stacks' share is fixed unless the mover
  // spots for them.
  const shells = liveShells(state, alive);
  let shellsFixed = 0;
  if (shells.length > 0 && !moverSpots)
    for (const s of alive)
      if (s.id !== m.id)
        shellsFixed += shellsOn(
          ctx,
          state,
          shells,
          s,
          s.hex,
          shellPresence(state, s),
        );
  const shellsAt = (hex: Hex): number => {
    if (shells.length === 0) return 0;
    const presence = shellPresence(state, m);
    if (!moverSpots)
      return shellsFixed + shellsOn(ctx, state, shells, m, hex, presence);
    const moved = liveShells(state, alive, { id: m.id, hex });
    let v = 0;
    for (const s of alive)
      v +=
        s.id === m.id
          ? shellsOn(ctx, state, moved, m, hex, presence)
          : shellsOn(ctx, state, moved, s, s.hex, shellPresence(state, s));
    return v;
  };
  return (hex) => {
    let enemyThreat = 0;
    for (const e of enemies) {
      const adjacent = isAdjacent(hex, e.hex);
      const near = e.nearExcl || adjacent;
      const best = near ? e.bestMelee : e.bestShoot;
      const v = strikeValue(ctx, state, near ? e.melee : e.shoot, m, hex, 0);
      enemyThreat += v > best ? v : best;
      if (e.afters) {
        const on = adjacent ? strikeOnly(ctx, state, e.melee, m, 1) : 0;
        enemyThreat += on > e.aftersExcl ? on : e.aftersExcl;
      }
    }
    let mine = ownFixed;
    const spots = spotsAt(hex);
    for (const a of ownShooters) {
      const near = alive.some((e) => e.side !== me && isAdjacent(e.hex, a.hex));
      mine += bestStrike(striker(a, a.hex, near, spots));
    }
    if (moverActs) {
      const near = targets.some((e) => isAdjacent(e.hex, hex));
      const s = striker(m, hex, near, spots);
      let best = 0;
      for (const b of targets) {
        const v = strikeValue(ctx, state, s, b, b.hex, ctx.w.far);
        if (v > best) best = v;
      }
      mine += best;
    }
    const pinned = pins.length === 0 ? 0 : pinDelta(hex);
    return base + pinned + shellsAt(hex) - fear * enemyThreat + own * mine;
  };
}

function materialOf(ctx: Context, state: BattleState): number {
  let v = 0;
  for (const s of state.stacks) {
    if (!isAlive(s)) continue;
    const value = stackValue(s) * (s.summoned ? ctx.w.summonWeight : 1);
    v += s.owner === ctx.me ? value : -value;
  }
  return v;
}

/** This side's material (the scale of the thresholds). */
function sideValue(state: BattleState, side: BattleSide): number {
  let v = 0;
  for (const s of state.stacks)
    if (isAlive(s) && s.owner === side && !s.summoned) v += stackValue(s);
  return v;
}

// ---------------------------------------------------------------------------
// Candidates

/** A state with one stack placed on another hex (cheap move estimate). */
function placed(state: BattleState, id: string, hex: Hex): BattleState {
  return {
    ...state,
    stacks: state.stacks.map((x) => (x.id === id ? { ...x, hex } : x)),
  };
}

/** Default targets of an act without an `aiTargets` list. */
function defaultTargets(state: BattleState, def: ActDef): ActTarget[][] {
  if (def.targets === 0) return [[]];
  if (def.targets !== 1) return [];
  const out: ActTarget[][] = state.stacks
    .filter(isAlive)
    .map((s) => [{ stack: s.id }]);
  for (const g of state.ground)
    if (g.class === "remains") out.push([{ hex: g.hex }]);
  return out;
}

function targetsOf(
  state: BattleState,
  def: ActDef,
  actorId: string,
): readonly (readonly ActTarget[])[] {
  return def.aiTargets?.(state, actorId) ?? defaultTargets(state, def);
}

/**
 * A hero cast's target choices: all of them in full mode; in fast mode
 * the choices without a stack, and of those with stacks the
 * `castTargets` whose stacks are worth the most (the biggest enemy to
 * strike, the biggest own stack to bless).
 */
function castTargets(
  ctx: Context,
  state: BattleState,
  def: ActDef,
  actorId: string,
): readonly (readonly ActTarget[])[] {
  const all = targetsOf(state, def, actorId);
  const n = ctx.limits.castTargets;
  if (all.length <= n) return all;
  const worth = (targets: readonly ActTarget[]): number => {
    let v = -1;
    for (const t of targets) {
      if (!("stack" in t)) continue;
      const s = state.stacks.find((x) => x.id === t.stack);
      if (s !== undefined && isAlive(s)) v = Math.max(v, stackValue(s));
    }
    return v;
  };
  const ranked = all
    .map((targets, i) => ({ targets, i, v: worth(targets) }))
    .filter((x) => x.v >= 0);
  ranked.sort((a, b) => b.v - a.v || a.i - b.i);
  const keep = new Set(ranked.slice(0, n).map((x) => x.i));
  return all.filter((targets, i) => keep.has(i) || worth(targets) < 0);
}

/**
 * Walk-first hexes for a pull (Reel In) at a target out of range from where
 * the stack stands: the reachable hex in range (not next to the target)
 * with the shortest walk, and the one farthest from the target (the
 * longest pull, toward the stack's own lines). Empty when the target is in
 * range already or out of the pull's HP limit.
 */
function pullHexes(
  self: BattleStack,
  target: BattleStack,
  pull: NonNullable<AbilityDef["aiPull"]>,
  reach: ReadonlyMap<number, number>,
): Hex[] {
  const lim = pull(self, target);
  const hp = totalHp({
    count: target.count,
    hp: target.creature.hp,
    topHp: target.topHp,
  });
  if (hp > lim.hp || hexDistance(self.hex, target.hex) <= lim.range) return [];
  let near: { h: Hex; walk: number } | null = null;
  let long: { h: Hex; walk: number; d: number } | null = null;
  for (const [i, walk] of reach) {
    if (walk === 0) continue;
    const h = hexFromIndex(i);
    const d = hexDistance(h, target.hex);
    if (d <= 1 || d > lim.range) continue;
    if (near === null || walk < near.walk) near = { h, walk };
    if (long === null || d > long.d || (d === long.d && walk < long.walk))
      long = { h, walk, d };
  }
  const out: Hex[] = [];
  if (near !== null) out.push(near.h);
  if (long !== null && (near === null || !sameAt({ hex: near.h }, long.h)))
    out.push(long.h);
  return out;
}

/** Activated abilities, creature casts and area shots of the active stack. */
function extraActions(state: BattleState, self: BattleStack): BattleAction[] {
  const out: BattleAction[] = [];
  let reach: Map<number, number> | null = null;
  for (const abilityId of self.creature.abilities) {
    const ab = ability(abilityId);
    if (!ab.act) continue;
    if (ab.everyTurn !== true && self.abilitiesUsed.includes(abilityId))
      continue;
    const def = actDef(ab.act);
    for (const targets of targetsOf(state, def, self.id)) {
      const base: BattleAction = {
        type: "ability",
        stackId: self.id,
        ability: abilityId,
        targets,
      };
      if (actionError(state, base) === null) out.push(base);
      if (ab.moveFirst !== true) continue;
      const t = targets[0];
      if (t === undefined || !("stack" in t) || "condition" in t) continue;
      const target = state.stacks.find((x) => x.id === t.stack);
      if (!target) continue;
      reach ??= reachableHexes(state, self.id);
      if (ab.aiPull) {
        // A pull walks into range, not next to the target.
        for (const n of pullHexes(self, target, ab.aiPull, reach)) {
          const a: BattleAction = { ...base, from: n };
          if (actionError(state, a) === null) out.push(a);
        }
        continue;
      }
      for (const n of neighbors(target.hex)) {
        const d = reach.get(hexIndex(n));
        if (d === undefined || d === 0) continue;
        const a: BattleAction = { ...base, from: n };
        if (actionError(state, a) === null) out.push(a);
      }
    }
  }
  for (const spell of creaturePagesLeft(self)) {
    if (!hasAct(spell)) continue;
    const def = actDef(spell);
    for (const targets of targetsOf(state, def, self.id)) {
      const a: BattleAction = {
        type: "creatureCast",
        stackId: self.id,
        spell,
        targets,
      };
      if (actionError(state, a) === null) out.push(a);
    }
  }
  if (shootsAnyHex(self) && canShoot(state, self.id)) {
    const seen = new Set<number>();
    for (const e of state.stacks) {
      if (!isAlive(e) || e.side === self.side) continue;
      for (const h of neighbors(e.hex)) {
        const i = hexIndex(h);
        if (seen.has(i)) continue;
        seen.add(i);
        if (state.stacks.some((s) => isAlive(s) && hexIndex(s.hex) === i))
          continue;
        out.push({ type: "shootHex", stackId: self.id, at: h });
      }
    }
  }
  return out;
}

interface Scored {
  readonly action: BattleAction;
  readonly value: number;
  readonly after: BattleState;
}

/**
 * Candidates rehearsed on the engine since the module loaded (the
 * search's main cost; tests compare the modes by it, not by the clock).
 */
let rehearsals = 0;

/** Rehearsals run so far (tests and tools). */
export function aiRehearsals(): number {
  return rehearsals;
}

function rehearsed(
  ctx: Context,
  state: BattleState,
  action: BattleAction,
): Scored {
  rehearsals++;
  const after = applyAction(state, action).state;
  return { action, value: evaluate(ctx, after), after };
}

function better(a: Scored | null, b: Scored): Scored {
  return a === null || b.value > a.value ? b : a;
}

/** Hexes within `n` walking steps of `from` (Hit and Run candidates). */
function hexesNear(ctx: Context, from: Hex, n: number): Hex[] {
  const out: Hex[] = [];
  for (let i = 0; i < BATTLE_HEX_COUNT; i++) {
    const h = hexFromIndex(i);
    const d = ctx.distance(from, h);
    if (d > 0 && d <= n) out.push(h);
  }
  return out;
}

/** Every creature option of the active stack, scored by one rehearsal. */
function scoreStackOptions(ctx: Context, state: BattleState): Scored[] {
  const self = activeStack(state);
  if (!self) return [];
  const lim = ctx.limits;
  // The cheap estimate of the active stack standing on another hex.
  const placedValue = (board: BattleState): ((h: Hex) => number) =>
    lim.incremental
      ? placedEstimator(ctx, board, self.id)
      : (h) => evaluate(ctx, placed(board, self.id, h));
  let estimate: ((h: Hex) => number) | null = null;
  const out: Scored[] = [];
  const moves: BattleAction[] = [];
  /** Walk-and-strike attacks by target (fast mode ranks their hexes). */
  const strikes = new Map<
    string,
    Extract<BattleAction, { type: "attack" }>[]
  >();
  const shots: Extract<BattleAction, { type: "shoot" }>[] = [];
  const ranking = lim.attackHexes !== Infinity;
  for (const action of legalActions(state)) {
    if (action.type === "move" && action.swapWith === undefined) {
      moves.push(action);
      continue;
    }
    if (ranking && action.type === "attack" && action.swapWith === undefined) {
      const list = strikes.get(action.targetId);
      if (list) list.push(action);
      else strikes.set(action.targetId, [action]);
      continue;
    }
    if (ranking && action.type === "shoot" && action.swapWith === undefined) {
      shots.push(action);
      continue;
    }
    out.push(rehearsed(ctx, state, action));
  }
  if (ranking) {
    // Fast mode: each target's attack hexes ranked by the placed
    // estimate; the targets (and shots) by that plus the strike's own
    // damage value; the best few rehearsed.
    const est = (estimate ??= placedValue(state));
    const shells = traitsOf(self.creature).shellSplash !== null;
    const gain = (target: string, from: Hex, shot: boolean): number => {
      const b = state.stacks.find((x) => x.id === target);
      if (b === undefined) return 0;
      // A shell lands on the target's hex next round (Lob).
      if (shot && shells) return shellAim(ctx, state, self, b.hex);
      const s = striker(self, from, !shot);
      return strikeValue(ctx, state, s, b, b.hex, 0);
    };
    const picks: { a: BattleAction; i: number; v: number }[] = [];
    for (const list of strikes.values()) {
      const hexes = list
        .map((a, i) => ({ a, i, v: est(a.from) }))
        .sort((x, y) => y.v - x.v || x.i - y.i)
        .slice(0, lim.attackHexes);
      for (const h of hexes)
        picks.push({
          a: h.a,
          i: picks.length,
          v: h.v + gain(h.a.targetId, h.a.from, false),
        });
    }
    const here = shots.length > 0 ? est(self.hex) : 0;
    for (const a of shots)
      picks.push({
        a,
        i: picks.length,
        v: here + gain(a.targetId, self.hex, true),
      });
    picks.sort((x, y) => y.v - x.v || x.i - y.i);
    for (const p of picks.slice(0, lim.strikeTargets))
      out.push(rehearsed(ctx, state, p.a));
  }
  // Moves: a cheap estimate on the placed board, then the best rehearsed.
  if (moves.length > 0) estimate ??= placedValue(state);
  const est = estimate;
  const estimates = moves.map((m, i) => ({
    i,
    v: m.type === "move" && est !== null ? est(m.to) : 0,
  }));
  estimates.sort((a, b) => b.v - a.v || a.i - b.i);
  const tried = new Set<number>();
  for (const e of estimates.slice(0, lim.movesRehearsed)) {
    tried.add(e.i);
    out.push(rehearsed(ctx, state, moves[e.i] as BattleAction));
  }
  // Walks onto remains the stack feeds on (the Larder's sweets): the
  // placed estimate cannot see the meal, so they are always rehearsed.
  const feeds = self.creature.abilities.flatMap(
    (x) => ability(x).aiWalkOnto ?? [],
  );
  if (feeds.length > 0) {
    moves.forEach((m, i) => {
      if (tried.has(i) || m.type !== "move") return;
      const meal = state.ground.some(
        (g) =>
          g.class === "remains" && feeds.includes(g.kind) && sameAt(g, m.to),
      );
      if (meal) out.push(rehearsed(ctx, state, m));
    });
  }
  const areaShots: { a: BattleAction; i: number; v: number }[] = [];
  for (const action of extraActions(state, self)) {
    if (lim.areaShots !== Infinity && action.type === "shootHex") {
      areaShots.push({
        a: action,
        i: areaShots.length,
        v:
          traitsOf(self.creature).shellSplash === null
            ? around(state, self.side, action.at)
            : shellAim(ctx, state, self, action.at),
      });
      continue;
    }
    out.push(rehearsed(ctx, state, action));
  }
  // Area shots (fast mode): ranked by the value standing around the hex.
  areaShots.sort((x, y) => y.v - x.v || x.i - y.i);
  for (const s of areaShots.slice(0, lim.areaShots))
    out.push(rehearsed(ctx, state, s.a));
  // Hit and Run: the best attacks, each with its best walk afterwards.
  const walk = Math.max(
    0,
    ...self.creature.abilities.map((a) => ability(a).walkAfterAttack ?? 0),
  );
  if (walk > 0) {
    const attacks = out
      .filter((s) => s.action.type === "attack")
      .sort((a, b) => b.value - a.value)
      .slice(0, lim.walkAttacks);
    for (const atk of attacks) {
      if (atk.action.type !== "attack") continue;
      const after = atk.after;
      const me = after.stacks.find((x) => x.id === self.id);
      if (!me || !isAlive(me)) continue;
      const walkValue = placedValue(after);
      const options = hexesNear(ctx, me.hex, walk)
        .filter((h) => !after.stacks.some((s) => isAlive(s) && sameAt(s, h)))
        .map((h, i) => ({ h, i, v: walkValue(h) }))
        .sort((a, b) => b.v - a.v || a.i - b.i)
        .slice(0, lim.walksPerAttack);
      for (const o of options) {
        const a: BattleAction = { ...atk.action, after: o.h };
        if (actionError(state, a) === null) out.push(rehearsed(ctx, state, a));
      }
    }
  }
  return out;
}

/**
 * A shell lobbed by `self` on `at` (Lob), as the evaluation will count it
 * once in the air: fast mode ranks the shooter's hexes by it.
 */
function shellAim(
  ctx: Context,
  state: BattleState,
  self: BattleStack,
  at: Hex,
): number {
  const alive = state.stacks.filter(isAlive);
  const shell: LiveShell = {
    m: self,
    hex: at,
    splash: traitsOf(self.creature).shellSplash ?? 0,
    spots: spotMap(alive, self.side),
  };
  let v = 0;
  for (const s of alive)
    v += shellsOn(ctx, state, [shell], s, s.hex, shellPresence(state, s));
  return v;
}

/**
 * Value standing on and around hex `h` (an area shot's rough worth to
 * `side`): enemy stacks count for, own stacks against.
 */
function around(state: BattleState, side: BattleSide, h: Hex): number {
  let v = 0;
  for (const s of state.stacks) {
    if (!isAlive(s)) continue;
    if (!sameAt(s, h) && !isAdjacent(s.hex, h)) continue;
    v += s.side === side ? -stackValue(s) : stackValue(s);
  }
  return v;
}

function sameAt(s: { readonly hex: Hex }, h: Hex): boolean {
  return s.hex.col === h.col && s.hex.row === h.row;
}

function bestOf(options: readonly Scored[]): Scored | null {
  let best: Scored | null = null;
  for (const o of options) best = better(best, o);
  return best;
}

// ---------------------------------------------------------------------------
// Hero acts

interface HeroOption extends Scored {
  /** Mana, scroll, Fuel or once-per-battle cost in value. */
  readonly cost: number;
  readonly kind: "cast" | "command" | "item";
}

function conditionRefs(
  state: BattleState,
  ids: readonly string[],
): ConditionRef[] {
  const out: ConditionRef[] = [];
  for (const id of ids) {
    const s = state.stacks.find((x) => x.id === id);
    if (!s) continue;
    for (const c of s.conditions) out.push({ stack: s.id, condition: c.uid });
  }
  return out;
}

function heroOptions(ctx: Context, state: BattleState): HeroOption[] {
  const self = activeStack(state);
  if (!self) return [];
  const side = state.sides[self.side];
  const hero = side.hero;
  if (!hero) return [];
  const out: HeroOption[] = [];
  const magic = side.magic;
  const tryAct = (
    action: Extract<BattleAction, { type: "heroAct" }>,
    cost: number,
    kind: HeroOption["kind"],
  ): HeroOption | null => {
    if (actionError(state, action) !== null) return null;
    const s = rehearsed(ctx, state, action);
    const o: HeroOption = { ...s, cost, kind };
    out.push(o);
    return o;
  };

  // Casts: pages, then scrolls (a side without book data casts nothing).
  if (magic && side.castRound !== state.round) {
    const castable: { act: string; scroll: boolean }[] = [];
    for (const scroll of [false, true]) {
      const seen = new Set<string>();
      for (const p of scroll ? magic.scrolls : magic.pages) {
        if (seen.has(p) || !hasAct(p)) continue;
        seen.add(p);
        if (heroCastError(state, self.side, p, scroll) === null)
          castable.push({ act: p, scroll });
      }
    }
    {
      const casts: HeroOption[] = [];
      for (const { act, scroll } of castable) {
        const def = actDef(act);
        if (def.kind !== "cast") continue;
        const cost = scroll
          ? ctx.w.scrollFraction * (SCROLL_GOLD[def.tier ?? 1] ?? 300)
          : magic
            ? manaCost(def, magic) * ctx.w.manaValue
            : 0;
        for (const targets of castTargets(ctx, state, def, self.id)) {
          const o = tryAct(
            {
              type: "heroAct",
              stackId: self.id,
              act,
              targets,
              ...(scroll ? { scroll: true } : {}),
            },
            cost,
            "cast",
          );
          if (o) casts.push(o);
        }
      }
      // Echo and Fuel options on the best casts.
      const top = [...casts]
        .sort((a, b) => b.value - b.cost - (a.value - a.cost))
        .slice(0, ctx.limits.castsExtended);
      const fuelLeft = magic ? magic.fuelUsed < magic.fuelMax : false;
      for (const o of top) {
        if (o.action.type !== "heroAct") continue;
        const base = o.action;
        const def = actDef(base.act);
        const touched = touchedStacks(state, def, self.id, base.targets);
        const refs = conditionRefs(state, touched);
        for (const ref of refs) {
          if (echoError(state, def, self.id, base.targets, ref) === null)
            tryAct({ ...base, echo: ref }, o.cost, "cast");
          if (
            fuelLeft &&
            fuelError(state, self.side, def, self.id, base.targets, ref) ===
              null
          )
            tryAct({ ...base, fuel: ref }, o.cost + ctx.w.fuelValue, "cast");
        }
      }
    }
  }

  // The Command and item acts: once per battle each.
  const once: { act: string; kind: "command" | "item" }[] = [];
  if (hero.command !== undefined && !side.commandUsed)
    once.push({ act: hero.command, kind: "command" });
  for (const it of hero.itemActs ?? [])
    if (!side.itemActsUsed.includes(it)) once.push({ act: it, kind: "item" });
  for (const { act, kind } of once) {
    if (!hasAct(act) || heroActError(state, self.side, act) !== null) continue;
    const def = actDef(act);
    const singles: HeroOption[] = [];
    for (const targets of targetsOf(state, def, self.id)) {
      const o = tryAct(
        { type: "heroAct", stackId: self.id, act, targets },
        0,
        kind,
      );
      if (o) singles.push(o);
    }
    // "Up to n times": grow the best choice greedily.
    const step = def.targetStep ?? 1;
    const max = def.maxTargets?.(state, self.id) ?? def.targets;
    let best = bestOf(singles) as HeroOption | null;
    while (best !== null && best.action.type === "heroAct") {
      const cur = best.action;
      if (cur.targets.length + step > max) break;
      let next: HeroOption | null = null;
      for (const extra of targetsOf(state, def, self.id)) {
        if (extra.length !== step) continue;
        const action = {
          ...cur,
          targets: [...cur.targets, ...extra],
        };
        if (actionError(state, action) !== null) continue;
        const s = rehearsed(ctx, state, action);
        if (next === null || s.value > next.value)
          next = { ...s, cost: 0, kind };
      }
      if (next === null || next.value <= best.value) break;
      out.push(next);
      best = next;
    }
  }
  return out;
}

/** True when no other stack of the side is still to act this round. */
function lastTurnOfRound(state: BattleState, self: BattleStack): boolean {
  const rest = [...state.queue, ...state.waiting].filter(
    (id) => id !== self.id,
  );
  return !rest.some((id) => {
    const s = state.stacks.find((x) => x.id === id);
    return s !== undefined && isAlive(s) && s.side === self.side;
  });
}

// ---------------------------------------------------------------------------
// The decision

function weightsOf(options: AiOptions): AiWeights {
  return { ...DEFAULT_AI_WEIGHTS, ...(options.weights ?? {}) };
}

/** Every creature option of the active stack with its score. */
export function scoreActions(
  state: BattleState,
  options: AiOptions = {},
): ScoredAction[] {
  const self = activeStack(state);
  if (!self || state.winner !== null) return [];
  const ctx = new Context(state, self.side, weightsOf(options), options.mode);
  const before = evaluate(ctx, state);
  return scoreStackOptions(ctx, state).map((s) => ({
    action: s.action,
    score: s.value - before,
  }));
}

/** The AI's action for the active stack. Throws when the battle is over. */
export function chooseAiAction(
  state: BattleState,
  options: AiOptions = {},
): BattleAction {
  const self = activeStack(state);
  if (!self || state.winner !== null)
    throw new Error("no action: the battle is over");
  const ctx = new Context(
    state,
    self.side,
    weightsOf(options),
    options.mode,
    options.memo ?? null,
  );
  const lim = ctx.limits;
  const stackBest = bestOf(scoreStackOptions(ctx, state));
  if (!stackBest) throw new Error("no action: the battle is over");
  if (options.heroActs === false || !state.sides[self.side].hero)
    return stackBest.action;
  const last = lastTurnOfRound(state, self);
  const memo = options.memo;
  if (lim.heroActsOnce && memo !== undefined) {
    // Fast mode: a side's first decision of the round and its last.
    if (memo.heroRound[self.side] === state.round && !last)
      return stackBest.action;
    memo.heroRound[self.side] = state.round;
  }

  const heroes = heroOptions(ctx, state)
    .map((o, i) => ({ o, i, net: o.value - o.cost }))
    .sort((a, b) => b.net - a.net || a.i - b.i)
    .slice(0, lim.heroActsSearched);
  const scale = Math.max(1, sideValue(state, self.side));
  /** The stack's best gain on the board as it stands (fast mode). */
  let stackGain: number | null = null;
  let pick: { action: BattleAction; margin: number } | null = null;
  for (const { o } of heroes) {
    let value = o.value;
    if (o.after.winner === null && o.after.activeStackId === self.id) {
      if (lim.heroFollowUp) {
        // One ply deeper: the hero act, then the stack's best action.
        const follow = bestOf(scoreStackOptions(ctx, o.after));
        if (follow) value = follow.value;
      } else {
        // The stack's best action is assumed to gain as much after the
        // hero act as it would now.
        stackGain ??= stackBest.value - evaluate(ctx, state);
        value = o.value + stackGain;
      }
    }
    const gain = value - stackBest.value - o.cost;
    const fraction =
      o.kind === "cast"
        ? last
          ? ctx.w.lastCastFraction
          : ctx.w.castFraction
        : ctx.w.commandFraction;
    const margin = gain - fraction * scale;
    if (margin > 0 && (pick === null || margin > pick.margin))
      pick = { action: o.action, margin };
  }
  return pick ? pick.action : stackBest.action;
}

/**
 * The board's value for `side` under the AI's evaluation (tools and
 * tests; higher is better).
 */
export function evaluateFor(
  state: BattleState,
  side: BattleSide,
  options: AiOptions = {},
): number {
  return evaluate(new Context(state, side, weightsOf(options)), state);
}

/**
 * The fast mode's incremental estimates of the active stack standing on
 * each of `hexes` (tests: they match {@link evaluateFor} on the placed
 * board).
 */
export function placedEstimates(
  state: BattleState,
  hexes: readonly Hex[],
  options: AiOptions = {},
): number[] {
  const self = activeStack(state);
  if (!self) return [];
  const ctx = new Context(state, self.side, weightsOf(options), "fast");
  const est = placedEstimator(ctx, state, self.id);
  return hexes.map(est);
}
