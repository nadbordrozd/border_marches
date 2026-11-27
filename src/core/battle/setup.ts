/**
 * Battle creation: deployment (GAME_DESIGN.md 9.1), seeded obstacles (rock
 * ground), battle-start rules and army Morale and Luck (RULES_V2.md 4.6, 6).
 */

import { createRng, deriveSeed } from "../rng.ts";
import { creatureFightValue } from "./damage.ts";
import { runStartRule, startBattle } from "./engine.ts";
import {
  DECK_GUN_RULE,
  WET_LANDING_RULE,
  isSeaLayout,
  layoutGround,
  scheduleDeckGun,
  wetLanding,
} from "./naval-field.ts";
import { ability, groundKind } from "./registry.ts";
import { blocksCreature } from "./resolve.ts";
import "./sea-abilities.ts";
import { sideMagicFromSetup } from "./magic.ts";
import type { Resolver } from "./resolve.ts";
import { BATTLE_HEIGHT, BATTLE_WIDTH, hexIndex, inBounds } from "./hex.ts";
import type { Hex } from "./hex.ts";
import type {
  BattleArmySetup,
  BattleSetup,
  BattleSide,
  BattleStack,
  BattleState,
  BattleStep,
  GroundFeature,
} from "./types.ts";

export const MAX_STACKS_PER_SIDE = 7;
export const MAX_OBSTACLES = 6;
export const ATTACKER_COLUMN = 0;
export const DEFENDER_COLUMN = BATTLE_WIDTH - 1;

/** Deployment rows by number of stacks (index = stacks - 1). */
export const DEPLOYMENT_ROWS: readonly (readonly number[])[] = [
  [5],
  [2, 8],
  [2, 5, 8],
  [0, 4, 6, 10],
  [0, 2, 5, 8, 10],
  [0, 2, 4, 6, 8, 10],
  [0, 2, 4, 5, 6, 8, 10],
];

/** Default hexes for `n` stacks of a side, in slot order. */
export function deploymentHexes(side: BattleSide, n: number): Hex[] {
  const rows = DEPLOYMENT_ROWS[n - 1];
  if (!rows) throw new RangeError(`cannot deploy ${n} stacks`);
  const col = side === "attacker" ? ATTACKER_COLUMN : DEFENDER_COLUMN;
  return rows.map((row) => ({ col, row }));
}

/**
 * 0-6 obstacle hexes from the battle seed, never in the deployment columns
 * (0 and 14), sorted by hex index.
 */
export function generateObstacles(seed: number): Hex[] {
  const rng = createRng(deriveSeed(seed, "battle-obstacles"));
  const count = rng.int(0, MAX_OBSTACLES);
  const chosen = new Set<number>();
  while (chosen.size < count) {
    const col = rng.int(ATTACKER_COLUMN + 1, DEFENDER_COLUMN - 1);
    const row = rng.int(0, BATTLE_HEIGHT - 1);
    chosen.add(hexIndex({ col, row }));
  }
  return [...chosen]
    .sort((a, b) => a - b)
    .map((i) => ({ col: i % BATTLE_WIDTH, row: Math.floor(i / BATTLE_WIDTH) }));
}

function buildStacks(side: BattleSide, army: BattleArmySetup): BattleStack[] {
  const n = army.stacks.length;
  if (n > MAX_STACKS_PER_SIDE)
    throw new RangeError(`${side}: more than 7 stacks`);
  const slots = army.stacks.map((s, i) => s.slot ?? i);
  if (new Set(slots).size !== n)
    throw new RangeError(`${side}: duplicate slots`);
  // Default positions follow slot order.
  const order = slots
    .map((slot, i) => [slot, i] as const)
    .sort((a, b) => a[0] - b[0]);
  const defaults = n > 0 ? deploymentHexes(side, n) : [];
  const defaultHex = new Map<number, Hex>();
  order.forEach(([, i], k) => defaultHex.set(i, defaults[k] as Hex));
  const prefix = side === "attacker" ? "a" : "d";
  const stacks = army.stacks.map((s, i): BattleStack => {
    const c = s.creature;
    if (!Number.isInteger(s.count) || s.count < 1) {
      throw new RangeError(`${side}: stack count must be a positive integer`);
    }
    const topHp = s.topHp ?? c.hp;
    if (!Number.isInteger(topHp) || topHp < 1 || topHp > c.hp) {
      throw new RangeError(`${side}: topHp must be 1..${c.hp}`);
    }
    const slot = slots[i] as number;
    const native = s.native ?? false;
    // The birthright: every native stack gains its faction's ability.
    const creature =
      native &&
      army.birthright !== undefined &&
      !c.abilities.includes(army.birthright)
        ? { ...c, abilities: [...c.abilities, army.birthright] }
        : c;
    return {
      id: `${prefix}${slot}`,
      owner: side,
      side,
      slot,
      creature,
      count: s.count,
      topHp,
      initialCount: s.count,
      hex: s.hex ?? (defaultHex.get(i) as Hex),
      shotsLeft: c.shots ?? 0,
      retaliatedThisRound: false,
      defending: false,
      waitedThisRound: false,
      turnStartedRound: 0,
      native,
      summoned: false,
      tags: c.tags ?? { remains: "corpse", cannotBear: [] },
      conditions: [],
      wary: 0,
      extraTurnRound: 0,
      abilitiesUsed: [],
    };
  });
  return stacks.sort((a, b) => a.slot - b.slot);
}

/** Stack fight value: count x creature FV (GAME_DESIGN 8.2), exact. */
export function stackFightValue(stack: BattleStack): number {
  return stack.count * creatureFightValue(stack.creature);
}

/** Army Morale and Luck as conditions (RULES_V2 6). */
const ARMY_NUMBERS = [
  { key: "morale", plus: "heartened", minus: "shaken" },
  { key: "luck", plus: "lucky", minus: "jinxed" },
] as const;

function clampArmy(n: number | undefined): number {
  return Math.max(-3, Math.min(3, Math.trunc(n ?? 0)));
}

/**
 * Battle-start rules (4.6 form 2), attacker's then defender's, then the
 * abilities' battle-start hooks, then army
 * Morale and Luck (6): the n strongest eligible stacks start Heartened,
 * Shaken, Lucky or Jinxed. A refused stack is skipped and the next
 * strongest is tried.
 */
function battleStart(fx: Resolver, setup: BattleSetup): void {
  const sides = ["attacker", "defender"] as const;
  for (const side of sides) {
    for (const rule of setup[side].startRules ?? [])
      runStartRule(fx, side, rule);
  }
  // Abilities' battle-start hooks, in field order (Hot from the Oven).
  for (const s of fx.d.stacks.slice()) {
    for (const id of s.creature.abilities) {
      const def = ability(id);
      if (!def.onBattleStart || !fx.isAlive(s.id)) continue;
      fx.d.beginStep();
      fx.d.within(null, `ability:${id}`, () => def.onBattleStart?.(fx, s.id));
      fx.resolveReactions();
    }
  }
  // Naval rules (NAVAL.md 3.3, 3.4): Wet Landing, after the artifacts'
  // rules and before Morale and Luck; then the deck guns are scheduled for
  // their first shot at the start of round 2.
  for (const side of sides) {
    if (setup[side].wetLanding !== true) continue;
    fx.d.beginStep();
    fx.d.within(null, WET_LANDING_RULE, () => wetLanding(fx, side));
    fx.resolveReactions();
  }
  for (const side of sides) {
    const harm = setup[side].deckGun;
    if (harm === undefined || harm <= 0) continue;
    const first = Math.max(2, (setup.startRound ?? 1) + 1);
    fx.d.beginStep();
    fx.d.within(null, DECK_GUN_RULE, () =>
      scheduleDeckGun(fx, side, harm, first),
    );
  }
  for (const side of sides) {
    for (const num of ARMY_NUMBERS) {
      const n = clampArmy(setup[side][num.key]);
      if (n === 0) continue;
      const kind = n > 0 ? num.plus : num.minus;
      const candidates = fx.d.stacks
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.owner === side && s.count > 0)
        .sort(
          (a, b) => stackFightValue(b.s) - stackFightValue(a.s) || a.i - b.i,
        );
      fx.d.beginStep();
      let placed = 0;
      fx.d.within(null, num.key, () => {
        for (const { s } of candidates) {
          if (placed >= Math.abs(n)) break;
          const res = fx.addCondition(s.id, {
            kind,
            source: num.key,
            ...(kind === "jinxed" ? { size: 25, clock: 3 } : {}),
            ...(kind === "shaken" ? { clock: 2 } : {}),
          });
          if (res.landed) placed++;
        }
      });
      fx.resolveReactions();
    }
  }
}

/**
 * Creates a battle and starts round 1 (or `startRound`): the returned state
 * waits for the first stack's action; events hold roundStart and turnStart.
 * Deployment (Vanguard, core/battle/deploy.ts) comes before this: it sets
 * the stacks' hexes in the setup, and battle-start rules then run here.
 */
export function createBattle(setup: BattleSetup): BattleStep {
  return startBattle(fieldState(setup), setup.startRound ?? 1, (fx) =>
    battleStart(fx, setup),
  );
}

/**
 * The field before round 0 ends: stacks deployed, obstacles and ground
 * laid, no battle-start rule run and no turn given (round 0). The
 * deployment phase shows and validates this state.
 */
export function fieldState(setup: BattleSetup): BattleState {
  const stacks = [
    ...buildStacks("attacker", setup.attacker),
    ...buildStacks("defender", setup.defender),
  ];
  // A sea layout (NAVAL.md 3.2) lays its own features instead of the
  // seeded obstacles; a beach landing keeps the land field's.
  const sea = isSeaLayout(setup.layout);
  const obstacles = setup.obstacles
    ? [...setup.obstacles]
    : sea
      ? []
      : generateObstacles(setup.seed);
  const used = new Set<number>();
  for (const h of [...obstacles, ...stacks.map((s) => s.hex)]) {
    if (!inBounds(h))
      throw new RangeError(`hex (${h.col}, ${h.row}) out of bounds`);
    const i = hexIndex(h);
    if (used.has(i))
      throw new RangeError(`hex (${h.col}, ${h.row}) used twice`);
    used.add(i);
  }
  const rock = groundKind("rock");
  const ground: GroundFeature[] = obstacles.map((hex) => ({
    hex,
    kind: rock.id,
    class: rock.class,
    school: rock.school,
    size: 0,
    clock: null,
    remains: null,
    source: "battlefield",
  }));
  // The layout's sea, masts, crates and reefs: never under a stack it
  // would block (a stack placed by hand), never over an explicit obstacle.
  const stackAt = new Map(stacks.map((st) => [hexIndex(st.hex), st]));
  const layoutSpecs = sea
    ? layoutGround(setup.layout, setup.seed).filter((g) => {
        const i = hexIndex(g.hex);
        if (obstacles.some((o) => hexIndex(o) === i)) return false;
        const st = stackAt.get(i);
        if (st === undefined) return true;
        const def = groundKind(g.kind);
        const probe: GroundFeature = {
          hex: g.hex,
          kind: def.id,
          class: def.class,
          school: def.school,
          size: 0,
          clock: null,
          remains: null,
          source: "battlefield",
        };
        return !blocksCreature(probe, st.creature);
      })
    : [];
  for (const g of [...layoutSpecs, ...(setup.ground ?? [])]) {
    const def = groundKind(g.kind);
    if (!inBounds(g.hex))
      throw new RangeError(`hex (${g.hex.col}, ${g.hex.row}) out of bounds`);
    if (ground.some((x) => hexIndex(x.hex) === hexIndex(g.hex)))
      throw new RangeError(`hex (${g.hex.col}, ${g.hex.row}) has ground twice`);
    const feature: GroundFeature = {
      hex: g.hex,
      kind: def.id,
      class: def.class,
      school: def.school,
      size: g.size ?? 0,
      clock: g.clock === undefined ? (def.defaultClock ?? null) : g.clock,
      remains: null,
      source: g.source ?? "battlefield",
      ...(g.look !== undefined ? { look: g.look } : {}),
    };
    const on = stackAt.get(hexIndex(g.hex));
    if (
      def.class === "blocking" &&
      used.has(hexIndex(g.hex)) &&
      (on === undefined || blocksCreature(feature, on.creature))
    )
      throw new RangeError(`hex (${g.hex.col}, ${g.hex.row}) used twice`);
    ground.push(feature);
  }
  ground.sort((a, b) => hexIndex(a.hex) - hexIndex(b.hex));
  const side = (army: BattleSetup["attacker"]) => ({
    hero: army.hero,
    defenseBonus: army.defenseBonus ?? 0,
    morale: clampArmy(army.morale),
    luck: clampArmy(army.luck),
    canRetreat: army.hero !== null && (army.canRetreat ?? false),
    castRound: 0,
    commandUsed: false,
    itemActsUsed: [],
    ...(army.hero !== null && (army.rules ?? []).length > 0
      ? { rules: [...(army.rules ?? [])], rulesUsed: [] }
      : {}),
    flags: army.flags ?? [],
    ...(army.hero !== null && army.magic
      ? { magic: sideMagicFromSetup(army.magic) }
      : {}),
  });
  return {
    seed: setup.seed,
    ground,
    sides: { attacker: side(setup.attacker), defender: side(setup.defender) },
    stacks,
    round: 0,
    queue: [],
    waiting: [],
    extraTurns: [],
    activeStackId: null,
    winner: null,
    endReason: null,
    scheduled: [],
    nextUid: 1,
    laws: [],
    ...(setup.roundLimit !== undefined ? { roundLimit: setup.roundLimit } : {}),
    ...(setup.layout !== undefined && setup.layout !== "land"
      ? { layout: setup.layout }
      : {}),
  };
}
