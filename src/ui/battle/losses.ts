/**
 * After-battle losses per unit type (bead bzc.92): the result screen lists
 * one row per creature per side, summing every stack of that creature,
 * instead of one row per stack. Losses come from the game-level result
 * (the survivors the game applies), so a side that loses everything shows
 * everything lost and a crumbling risen stack counts as lost. Summoned
 * stacks are not part of either army and are left out.
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

/** Each side's losses, one row per creature type, in deployment order. */
export function battleLosses(
  setup: GameBattleSetup,
  result: GameBattleResult,
): BattleLosses {
  return {
    attacker: sideRows(setup.attacker.stacks, result.attacker),
    defender: sideRows(setup.defender.stacks, result.defender),
  };
}

/** "12 of 30 lost", "all 5 lost" or "none lost". */
export function lossText(row: LossRow): string {
  if (row.lost === 0) return "none lost";
  if (row.left === 0) return row.before === 1 ? "lost" : `all ${row.lost} lost`;
  return `${row.lost} of ${row.before} lost`;
}
