/**
 * The deployment phase (Vanguard, CONTENT_HEROES.md army skills): an
 * optional step before round 1 in which a side with a deploy rule
 * rearranges its stacks within its first 1, 2 or 3 columns. It is a
 * visible step before the battle-start rules of RULES_V2 4.6, so it acts
 * on the BattleSetup: each placement sets the stacks' hexes, and
 * createBattle then runs the battle-start rules on the deployed field.
 * The battle state machine itself is unchanged, so every rehearsal and
 * preview of a battle in progress stays exact.
 *
 * The battle AI deploys with a simple heuristic (shooters and casters to
 * the back column, blockers to the front one), and instant and quick
 * battles use that placement ({@link autoDeploy}).
 */

import { groundKind } from "./registry.ts";
import { isRangedCreature } from "./resolve.ts";
import {
  ATTACKER_COLUMN,
  DEFENDER_COLUMN,
  deploymentHexes,
  generateObstacles,
} from "./setup.ts";
import { BATTLE_HEIGHT, hexIndex, inBounds, sameHex, type Hex } from "./hex.ts";
import type {
  BattleArmySetup,
  BattleSetup,
  BattleSide,
  BattleStackSetup,
} from "./types.ts";

const SIDES: readonly BattleSide[] = ["attacker", "defender"];

/** The deploy rules (Vanguard ranks 1-3), in rank order. */
export const DEPLOY_RULES = ["vanguard-1", "vanguard-2", "vanguard-3"] as const;

/**
 * How many columns a side may rearrange within before round 1: its
 * Vanguard rank (needs a hero, like every hero rule), or 0 for none.
 */
export function deployColumns(army: BattleArmySetup): number {
  if (army.hero === null) return 0;
  const rules = army.rules ?? [];
  for (let n = DEPLOY_RULES.length; n >= 1; n--) {
    if (rules.includes(DEPLOY_RULES[n - 1] as string)) return n;
  }
  return 0;
}

/** Sides that deploy before round 1, attacker first. */
export function deployingSides(setup: BattleSetup): BattleSide[] {
  return SIDES.filter(
    (s) => deployColumns(setup[s]) > 0 && setup[s].stacks.length > 0,
  );
}

/** Whether the battle has a deployment phase. */
export function hasDeployment(setup: BattleSetup): boolean {
  return deployingSides(setup).length > 0;
}

/** Hexes no stack may stand on at deployment: rocks and blocking ground. */
export function deployBlocked(setup: BattleSetup): Hex[] {
  const rocks = setup.obstacles ?? generateObstacles(setup.seed);
  const ground = (setup.ground ?? [])
    .filter((g) => groundKind(g.kind).class === "blocking")
    .map((g) => g.hex);
  return [...rocks, ...ground];
}

/** The columns of a side's deployment zone, from its edge forward. */
export function deployZoneColumns(side: BattleSide, columns: number): number[] {
  return Array.from({ length: columns }, (_, k) =>
    side === "attacker" ? ATTACKER_COLUMN + k : DEFENDER_COLUMN - k,
  );
}

/** The free hexes of a side's deployment zone, by column then row. */
export function deployZone(setup: BattleSetup, side: BattleSide): Hex[] {
  const blocked = new Set(deployBlocked(setup).map(hexIndex));
  const out: Hex[] = [];
  for (const col of deployZoneColumns(side, deployColumns(setup[side]))) {
    for (let row = 0; row < BATTLE_HEIGHT; row++) {
      const h = { col, row };
      if (!blocked.has(hexIndex(h))) out.push(h);
    }
  }
  return out;
}

/** Where each of a side's stacks stands now, in setup order. */
export function deployedHexes(setup: BattleSetup, side: BattleSide): Hex[] {
  const stacks = setup[side].stacks;
  if (stacks.length === 0) return [];
  // Default positions follow slot order (setup.ts buildStacks).
  const defaults = deploymentHexes(side, stacks.length);
  const order = stacks
    .map((s, i) => [s.slot ?? i, i] as const)
    .sort((a, b) => a[0] - b[0]);
  const out: Hex[] = Array.from({ length: stacks.length });
  order.forEach(([, i], k) => {
    out[i] = (stacks[i] as BattleStackSetup).hex ?? (defaults[k] as Hex);
  });
  return out;
}

/**
 * Why a placement (one hex per stack, setup order) is illegal for a side,
 * or null: every hex in the side's zone, free of rock, and distinct.
 */
export function deployError(
  setup: BattleSetup,
  side: BattleSide,
  hexes: readonly Hex[],
): string | null {
  if (deployColumns(setup[side]) === 0) return "this side does not deploy";
  if (hexes.length !== setup[side].stacks.length) {
    return "one hex for each stack";
  }
  const zone = new Set(deployZone(setup, side).map(hexIndex));
  const seen = new Set<number>();
  for (const h of hexes) {
    if (!inBounds(h) || !zone.has(hexIndex(h))) {
      return `(${h.col}, ${h.row}) is outside the deployment zone`;
    }
    if (seen.has(hexIndex(h))) return `(${h.col}, ${h.row}) is used twice`;
    seen.add(hexIndex(h));
  }
  return null;
}

/**
 * The setup with a side deployed at `hexes` (one per stack, setup order).
 * The obstacles are fixed in the setup, so the field never changes.
 * Throws on an illegal placement.
 */
export function deploy(
  setup: BattleSetup,
  side: BattleSide,
  hexes: readonly Hex[],
): BattleSetup {
  const why = deployError(setup, side, hexes);
  if (why !== null) throw new RangeError(`${side} deployment: ${why}`);
  return {
    ...setup,
    obstacles: setup.obstacles ?? generateObstacles(setup.seed),
    [side]: {
      ...setup[side],
      stacks: setup[side].stacks.map((s, i) => ({
        ...s,
        hex: hexes[i] as Hex,
      })),
    },
  };
}

/**
 * The player's move during deployment: stack `index` of `side` goes to
 * `to`; a friendly stack already there takes its place. Returns the new
 * setup, or the reason it is refused.
 */
export function redeploy(
  setup: BattleSetup,
  side: BattleSide,
  index: number,
  to: Hex,
): BattleSetup | string {
  const hexes = deployedHexes(setup, side);
  const from = hexes[index];
  if (from === undefined) return "no such stack";
  const other = hexes.findIndex((h) => sameHex(h, to));
  const next = [...hexes];
  next[index] = to;
  if (other >= 0) next[other] = from;
  return deployError(setup, side, next) ?? deploy(setup, side, next);
}

/** Shooters and casters stand at the back; everyone else blocks. */
function wantsBack(s: BattleStackSetup): boolean {
  return isRangedCreature(s.creature) || s.creature.caster !== undefined;
}

/**
 * The battle AI's placement for a side (one hex per stack, setup order):
 * shooters and casters in the back column, blockers in the front one,
 * each keeping its default row where it can (else the nearest free row).
 * A side without a deploy rule keeps its positions.
 */
export function aiDeployment(setup: BattleSetup, side: BattleSide): Hex[] {
  const now = deployedHexes(setup, side);
  const columns = deployColumns(setup[side]);
  if (columns === 0) return now;
  const cols = deployZoneColumns(side, columns); // edge (back) first
  const zone = new Set(deployZone(setup, side).map(hexIndex));
  const taken = new Set<number>();
  const stacks = setup[side].stacks;
  const out: Hex[] = Array.from({ length: stacks.length });
  // Blockers first, so a shooter never takes a front hex from one.
  const order = stacks
    .map((s, i) => ({ i, back: wantsBack(s) }))
    .sort((a, b) => Number(a.back) - Number(b.back) || a.i - b.i);
  for (const { i, back } of order) {
    const prefer = back ? cols : [...cols].reverse();
    const row0 = (now[i] as Hex).row;
    let placed: Hex | null = null;
    for (let d = 0; d < BATTLE_HEIGHT && placed === null; d++) {
      for (const row of d === 0 ? [row0] : [row0 - d, row0 + d]) {
        if (row < 0 || row >= BATTLE_HEIGHT || placed !== null) continue;
        for (const col of prefer) {
          const h = { col, row };
          const k = hexIndex(h);
          if (zone.has(k) && !taken.has(k)) {
            placed = h;
            break;
          }
        }
      }
    }
    // The zone holds the whole edge column (no rock there), so a hex is
    // always found for up to seven stacks.
    const hex = placed ?? (now[i] as Hex);
    taken.add(hexIndex(hex));
    out[i] = hex;
  }
  return out;
}

/**
 * The setup with every deploying side placed by the battle AI: instant
 * and quick battles, and the AI's side of a played battle.
 */
export function autoDeploy(
  setup: BattleSetup,
  sides: readonly BattleSide[] = deployingSides(setup),
): BattleSetup {
  let out = setup;
  for (const side of sides) {
    if (deployColumns(out[side]) === 0) continue;
    out = deploy(out, side, aiDeployment(out, side));
  }
  return out;
}
