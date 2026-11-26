/**
 * After-battle losses per unit type (beads bzc.92, bzc.104): the result
 * screen lists, per side, one row per creature type that lost units,
 * summing every stack of that creature, with just the number killed; a
 * type that lost nothing is left out. Losses come from the game-level
 * result (the survivors the game applies), so a side that loses everything
 * shows everything lost and a crumbling risen stack counts as lost.
 * Summoned stacks are not part of either army and are left out.
 */
import type {
  BattleResult as GameBattleResult,
  BattleSetup as GameBattleSetup,
} from "../../core/game/battle.ts";
import type { CreatureId } from "../../data/types.ts";

/** A creature and how many of it, as in an army slot. */
export interface CreatureCount {
  readonly creature: CreatureId;
  readonly count: number;
}

/**
 * The stacks summed per creature, in the order each creature first
 * appears; empty stacks are skipped.
 */
export function totalsByCreature(
  stacks: readonly CreatureCount[],
): CreatureCount[] {
  const out: Array<{ creature: CreatureId; count: number }> = [];
  for (const s of stacks) {
    if (s.count <= 0) continue;
    const row = out.find((r) => r.creature === s.creature);
    if (row === undefined) out.push({ creature: s.creature, count: s.count });
    else row.count += s.count;
  }
  return out;
}

/** One creature type's line on the result screen. */
export interface LossRow {
  readonly creature: CreatureId;
  /** How many fought (all its stacks). */
  readonly before: number;
  /** How many were lost. */
  readonly lost: number;
  /** How many are left after the battle. */
  readonly left: number;
}

export interface BattleLosses {
  readonly attacker: readonly LossRow[];
  readonly defender: readonly LossRow[];
}

function sideRows(
  stacks: readonly CreatureCount[],
  survivors: readonly number[],
): LossRow[] {
  const rows: Array<{ creature: CreatureId; before: number; left: number }> =
    [];
  stacks.forEach((s, i) => {
    if (s.count <= 0) return;
    const left = Math.max(0, Math.min(s.count, survivors[i] ?? 0));
    const row = rows.find((r) => r.creature === s.creature);
    if (row === undefined)
      rows.push({ creature: s.creature, before: s.count, left });
    else {
      row.before += s.count;
      row.left += left;
    }
  });
  return rows.map((r) => ({ ...r, lost: r.before - r.left }));
}

/**
 * Each side's losses, one row per creature type that lost units, in
 * deployment order; types with no losses are left out.
 */
export function battleLosses(
  setup: GameBattleSetup,
  result: GameBattleResult,
): BattleLosses {
  const killed = (rows: LossRow[]): LossRow[] => rows.filter((r) => r.lost > 0);
  return {
    attacker: killed(sideRows(setup.attacker.stacks, result.attacker)),
    defender: killed(sideRows(setup.defender.stacks, result.defender)),
  };
}

/** The line a side with no losses shows instead of rows. */
export const NO_LOSSES = "No losses";
