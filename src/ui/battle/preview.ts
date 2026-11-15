/**
 * The exact attack preview as readable text (GAME_DESIGN.md 9.6): damage and
 * kills, the retaliation on the survivors, and every modifier that applied.
 * Pure: the screen renders these strings; the tests pin them.
 */

import { ABILITIES } from "../../data/abilities.ts";
import { CREATURES, isCreatureId } from "../../data/creatures.ts";
import { getStack } from "../../core/battle/index.ts";
import type {
  AttackPreview,
  BattleCreatureStats,
  BattleState,
  DamageBreakdown,
  Rational,
} from "../../core/battle/index.ts";

/** "Raptor" / "Raptors" for a count. */
export function creatureName(c: BattleCreatureStats, count: number): string {
  if (isCreatureId(c.id)) {
    const def = CREATURES[c.id];
    return count === 1 ? def.name : def.plural;
  }
  return c.name ?? c.id;
}

/** A multiplier with two decimals: 20/24 -> "0.83", 27/20 -> "1.35". */
export function formatMultiplier(m: Rational): string {
  // Round half up on the exact value, at two decimals.
  const hundredths = Math.floor((m.num * 200 + m.den) / (2 * m.den));
  return (hundredths / 100).toFixed(2);
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `−${-n}`;
}

/** Percent bonus text: 140 -> "+40%", 50 -> "−50%". */
function percentText(percent: number): string {
  return `${signed(percent - 100)}%`;
}

/** The modifiers of one strike, as short labels. */
export function breakdownBonuses(b: DamageBreakdown): string[] {
  const out: string[] = [];
  if (b.heroAttack !== 0) out.push(`Hero ${signed(b.heroAttack)} Atk`);
  for (const m of b.attackModifiers)
    out.push(`${m.label} ${signed(m.amount)} Atk`);
  if (b.heroDefense !== 0) out.push(`Hero ${signed(b.heroDefense)} Def`);
  for (const m of b.defenseModifiers)
    out.push(`${m.label} ${signed(m.amount)} Def`);
  if (b.defending) out.push("Defending ×1.3 Def");
  for (const m of b.abilityMultipliers)
    out.push(`${m.label} ${percentText(m.percent)}`);
  if (b.rangedInMelee) out.push("Ranged in melee ½");
  return out;
}

/** "Atk 10 vs Def 6 → ×1.20". */
export function attackLine(b: DamageBreakdown): string {
  return `Atk ${b.attack} vs Def ${b.defense} → ×${formatMultiplier(b.multiplier)}`;
}

export interface StrikeSummary {
  readonly damage: number;
  readonly kills: number;
  /** Creatures in the struck stack before and after. */
  readonly before: number;
  readonly after: number;
  /** Top creature's HP after the strike, and the creature's full HP. */
  readonly topAfter: number;
  readonly hp: number;
  /** Name of the struck stack (by its count before the strike). */
  readonly victim: string;
  readonly attackLine: string;
  readonly bonuses: readonly string[];
}

export interface PreviewSummary {
  readonly verb: "Attack" | "Shoot";
  readonly attacker: string;
  readonly attackerCount: number;
  readonly target: string;
  readonly hexesMoved: number;
  readonly strike: StrikeSummary;
  /** null when there is no retaliation; see `noRetaliation`. */
  readonly retaliation: StrikeSummary | null;
  readonly noRetaliation: string | null;
  /** Statuses applied, e.g. "Venom on Orc Brutes (−3 Def to end of round 3)". */
  readonly statuses: readonly string[];
}

/** Everything the preview panel shows for an attack or shot. */
export function summarizePreview(
  state: BattleState,
  preview: AttackPreview,
): PreviewSummary {
  const action = preview.action;
  const attacker = getStack(state, action.stackId);
  const target = getStack(state, action.targetId);
  const s = preview.strike;
  const strike: StrikeSummary = {
    damage: s.damage,
    kills: s.kills,
    before: target.count,
    after: s.targetCountAfter,
    topAfter: s.targetTopHpAfter,
    hp: target.creature.hp,
    victim: creatureName(target.creature, target.count),
    attackLine: attackLine(s.breakdown),
    bonuses: breakdownBonuses(s.breakdown),
  };
  let retaliation: StrikeSummary | null = null;
  let noRetaliation: string | null = null;
  const r = preview.retaliation;
  if (r !== null) {
    retaliation = {
      damage: r.damage,
      kills: r.kills,
      before: attacker.count,
      after: r.targetCountAfter,
      topAfter: r.targetTopHpAfter,
      hp: attacker.creature.hp,
      victim: creatureName(attacker.creature, attacker.count),
      attackLine: attackLine(r.breakdown),
      bonuses: breakdownBonuses(r.breakdown),
    };
  } else if (action.type === "shoot") {
    noRetaliation = "Shots are never retaliated";
  } else if (s.targetCountAfter === 0) {
    noRetaliation = "Target destroyed: no retaliation";
  } else if (attacker.creature.abilities.includes("terror")) {
    noRetaliation = `${ABILITIES.terror.name}: no retaliation`;
  } else if (target.retaliatedThisRound) {
    noRetaliation = "Already retaliated this round";
  } else {
    noRetaliation = "No retaliation";
  }
  const statuses = preview.statusesApplied.map((st) => {
    const holder = getStack(state, st.stackId);
    const name = creatureName(holder.creature, holder.count);
    if (st.status === "venom") {
      return `Venom on ${name} (−${ABILITIES.venom.params.defense ?? 0} Def to end of round ${st.expiresAfterRound})`;
    }
    return `${st.status} on ${name}`;
  });
  return {
    verb: action.type === "shoot" ? "Shoot" : "Attack",
    attacker: creatureName(attacker.creature, attacker.count),
    attackerCount: attacker.count,
    target: creatureName(target.creature, target.count),
    hexesMoved: preview.hexesMoved,
    strike,
    retaliation,
    noRetaliation,
    statuses,
  };
}

/**
 * "42 damage, 1 killed" / "12 damage, none killed" / "35 damage, all 7
 * killed" / "22 damage, the last one killed".
 */
export function strikeHeadline(s: StrikeSummary): string {
  if (s.after === 0) {
    const who = s.before === 1 ? "the last one" : `all ${s.before}`;
    return `${s.damage} damage, ${who} killed`;
  }
  const k = s.kills === 0 ? "none killed" : `${s.kills} killed`;
  return `${s.damage} damage, ${k}`;
}

/** "Trolls 3 \u2192 2, top 27/75 HP" / "Raptors 7 \u2192 0". */
export function stackChange(s: StrikeSummary): string {
  const counts = `${s.victim} ${s.before} \u2192 ${s.after}`;
  return s.after === 0 ? counts : `${counts}, top ${s.topAfter}/${s.hp} HP`;
}

/** A verb for a stack's count: ("attack", 1) -> "attacks"; plural stays. */
export function conjugate(verb: string, count: number): string {
  if (count !== 1) return verb;
  const [head = "", ...rest] = verb.split(" ");
  return [`${head}s`, ...rest].join(" ");
}
