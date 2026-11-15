/**
 * Battle creation: deployment (GAME_DESIGN.md 9.1) and seeded obstacles.
 */

import { createRng, deriveSeed } from "../rng.ts";
import { startBattle } from "./engine.ts";
import { BATTLE_HEIGHT, BATTLE_WIDTH, hexIndex, inBounds } from "./hex.ts";
import type { Hex } from "./hex.ts";
import type {
  BattleArmySetup,
  BattleSetup,
  BattleSide,
  BattleStack,
  BattleState,
  BattleStep,
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
    return {
      id: `${prefix}${slot}`,
      side,
      slot,
      creature: c,
      count: s.count,
      topHp,
      initialCount: s.count,
      hex: s.hex ?? (defaultHex.get(i) as Hex),
      shotsLeft: c.shots ?? 0,
      retaliatedThisRound: false,
      defending: false,
      waitedThisRound: false,
      turnStartedRound: 0,
      statuses: [],
    };
  });
  return stacks.sort((a, b) => a.slot - b.slot);
}

/**
 * Creates a battle and starts round 1 (or `startRound`): the returned state
 * waits for the first stack's action; events hold roundStart and turnStart.
 */
export function createBattle(setup: BattleSetup): BattleStep {
  const stacks = [
    ...buildStacks("attacker", setup.attacker),
    ...buildStacks("defender", setup.defender),
  ];
  const obstacles = setup.obstacles
    ? [...setup.obstacles]
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
  const state: BattleState = {
    seed: setup.seed,
    obstacles,
    sides: {
      attacker: {
        hero: setup.attacker.hero,
        defenseBonus: setup.attacker.defenseBonus ?? 0,
      },
      defender: {
        hero: setup.defender.hero,
        defenseBonus: setup.defender.defenseBonus ?? 0,
      },
    },
    stacks,
    round: 0,
    queue: [],
    waiting: [],
    activeStackId: null,
    winner: null,
  };
  return startBattle(state, setup.startRound ?? 1);
}
