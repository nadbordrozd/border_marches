/**
 * The stack info panel's content (right-click on any stack): stats with the
 * standing modifiers that apply to them now (hero, fortification, auras,
 * conditions such as Venomed, Defend), the ability text, the stack's
 * conditions (with school, clock and gate) and its Wary counter. Pure.
 *
 * Situational bonuses that depend on the target (Mob, Pack Hunter, Charge,
 * Bony) are not standing modifiers: the attack preview shows them.
 */

import { ABILITIES } from "../../data/abilities.ts";
import {
  creatureAbilities,
  getCreature,
  isCreatureId,
} from "../../data/creatures.ts";
import { FACTIONS } from "../../data/factions.ts";
import type { FactionDef } from "../../data/factions.ts";
import { isBattleSpell, spellDef } from "../../core/magic/index.ts";
import {
  HERO_ABILITY_PREFIX,
  ability as abilityDef,
  casterOf,
  conditionKind,
  creatureCastPower,
  defendedDefense,
  effectiveSpeed,
  fightValueLeft,
  isAdjacent,
  isAlive,
  isRangedCreature,
  roundLimitOf,
  roundLimitWinner,
} from "../../core/battle/index.ts";
import type {
  BattleSide,
  BattleStack,
  BattleState,
  StrikeContext,
} from "../../core/battle/index.ts";
import { conditionTooltip } from "./grammar.ts";
import { creatureName } from "./preview.ts";

export interface StatLine {
  readonly label: string;
  /** Effective value now. */
  readonly value: string;
  /** How it is made up, e.g. "8 base, +2 hero, +2 War Drums"; "" if plain. */
  readonly note: string;
}

/** One of a stack's abilities with its full text. */
export interface AbilityLine {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  /**
   * "ability": the creature's own; "drill": taught by a town's Drill;
   * "birthright": the faction's, on a native stack; "other": anything
   * else a rule gave it.
   */
  readonly source: "ability" | "drill" | "birthright" | "other";
  /**
   * Activated abilities, when they may be used: "Every turn, instead of
   * attacking. It may walk first."
   */
  readonly activated: string | null;
}

/** A creature caster's page (RULES_V2 2.6). */
export interface PageLine {
  readonly id: string;
  readonly name: string;
  /** The effect at the stack's casting Power. */
  readonly text: string;
  readonly spent: boolean;
}

export interface StackInfo {
  readonly title: string;
  readonly count: number;
  readonly side: "attacker" | "defender";
  /** The side that brought it, when it differs (a Turned stack). */
  readonly owner: "attacker" | "defender";
  readonly stats: readonly StatLine[];
  readonly ability: { readonly name: string; readonly text: string } | null;
  /** Every ability: its own first, then Drills, the birthright, others. */
  readonly abilities: readonly AbilityLine[];
  /** The faction's birthright, for a native stack. */
  readonly birthright: { readonly name: string; readonly text: string } | null;
  /** Names of the Drills (town buildings) that taught it abilities. */
  readonly drills: readonly string[];
  /** A creature caster's pages, with the effect at its casting Power. */
  readonly pages: readonly PageLine[];
  readonly castPower: number | null;
  readonly statuses: readonly string[];
}

/** Drill abilities: "<creature>:<ability>" -> the Drill building's name. */
const DRILLS: ReadonlyMap<string, string> = new Map(
  FACTIONS.flatMap((f) =>
    Object.values(f.town?.buildings ?? {}).flatMap((b) =>
      b.drill
        ? [[`${b.drill.creature}:${b.drill.ability}`, b.name] as const]
        : [],
    ),
  ),
);

/** The faction of a creature of src/data, or null (stubs, neutrals). */
function factionOf(creatureId: string): FactionDef | null {
  if (!isCreatureId(creatureId)) return null;
  const def = getCreature(creatureId);
  return FACTIONS.find((f) => f.id === def.faction) ?? null;
}

function activatedNote(id: string, stack: BattleStack): string | null {
  const def = abilityDef(id);
  if (def.act === undefined) return null;
  const every = def.everyTurn === true;
  const used = !every && stack.abilitiesUsed.includes(id);
  // Plain words, as the action bar's hover card says it (UI2-05).
  return [
    every
      ? "Every turn, instead of attacking."
      : "Once per battle, instead of attacking.",
    ...(def.moveFirst ? ["It may walk first."] : []),
    ...(every ? [] : [used ? "Used this battle." : "Not used yet."]),
  ].join(" ");
}

/** Every ability of the stack with where it came from and its full text. */
export function abilityLines(stack: BattleStack): AbilityLine[] {
  const c = stack.creature;
  const own = isCreatureId(c.id)
    ? creatureAbilities(getCreature(c.id))
    : c.abilities;
  const birth = stack.native
    ? (factionOf(c.id)?.birthright?.ability ?? null)
    : null;
  const rank = { ability: 0, drill: 1, birthright: 2, other: 3 } as const;
  const out: AbilityLine[] = [];
  for (const id of c.abilities) {
    if (id.startsWith(HERO_ABILITY_PREFIX)) continue;
    const def = abilityDef(id);
    const source: AbilityLine["source"] =
      id === birth
        ? "birthright"
        : own.includes(id)
          ? "ability"
          : DRILLS.has(`${c.id}:${id}`)
            ? "drill"
            : "other";
    out.push({
      id,
      name: def.name,
      text: def.description,
      source,
      activated: activatedNote(id, stack),
    });
  }
  return out.sort((a, b) => rank[a.source] - rank[b.source]);
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `−${-n}`;
}

function hasAdjacentAura(
  state: BattleState,
  stack: BattleStack,
  ability: "war-drums" | "warcry",
): boolean {
  return state.stacks.some(
    (s) =>
      s.id !== stack.id &&
      s.side === stack.side &&
      isAlive(s) &&
      s.creature.abilities.includes(ability) &&
      isAdjacent(s.hex, stack.hex),
  );
}

export function stackInfo(state: BattleState, stack: BattleStack): StackInfo {
  const c = stack.creature;
  const side = state.sides[stack.side];
  const heroAtk = side.hero?.attack ?? 0;
  const heroDef = side.hero?.defense ?? 0;

  const atkParts: [string, number][] = [];
  if (heroAtk !== 0) atkParts.push(["hero", heroAtk]);
  if (hasAdjacentAura(state, stack, "war-drums")) {
    atkParts.push([
      ABILITIES["war-drums"].name,
      ABILITIES["war-drums"].params.attack ?? 0,
    ]);
  }
  const defParts: [string, number][] = [];
  if (heroDef !== 0) defParts.push(["hero", heroDef]);
  if (side.defenseBonus !== 0) defParts.push(["fortified", side.defenseBonus]);
  if (hasAdjacentAura(state, stack, "warcry")) {
    defParts.push([
      ABILITIES.warcry.name,
      ABILITIES.warcry.params.defense ?? 0,
    ]);
  }
  // Standing condition modifiers, as a Strike against this stack sees them.
  const ctx: StrikeContext = {
    state,
    attacker: stack,
    defender: stack,
    kind: "melee",
    hexesMoved: 0,
  };
  for (const cd of stack.conditions) {
    const m = conditionKind(cd.kind).defenseModifier?.(ctx, stack, cd);
    if (m) defParts.push([m.label, m.amount]);
  }
  const sum = (parts: [string, number][]): number =>
    parts.reduce((t, [, n]) => t + n, 0);
  const note = (base: number, parts: [string, number][]): string =>
    parts.length === 0
      ? ""
      : [`${base} base`, ...parts.map(([l, n]) => `${signed(n)} ${l}`)].join(
          ", ",
        );

  const attack = c.attack + sum(atkParts);
  let defense = Math.max(0, c.defense + sum(defParts));
  let defNote = note(c.defense, defParts);
  if (stack.defending) {
    const before = defense;
    defense = defendedDefense(defense);
    defNote = `${defNote === "" ? `${before}` : `${defNote} = ${before}`}, ×1.3 defending`;
  }

  const stats: StatLine[] = [
    { label: "Attack", value: String(attack), note: note(c.attack, atkParts) },
    { label: "Defense", value: String(defense), note: defNote },
    { label: "Damage", value: String(c.damage), note: "per creature" },
    { label: "Health", value: `${stack.topHp}/${c.hp}`, note: "top creature" },
    {
      label: "Speed",
      value: String(effectiveSpeed(stack)),
      note: effectiveSpeed(stack) === c.speed ? "" : `${c.speed} base`,
    },
  ];
  if (isRangedCreature(c)) {
    stats.push({
      label: "Shots",
      value: `${stack.shotsLeft}/${c.shots ?? 0}`,
      note: "",
    });
  }

  const statuses: string[] = [];
  for (const cd of stack.conditions) statuses.push(conditionTooltip(state, cd));
  if (stack.wary > 0)
    statuses.push(
      `Wary: refuses Holds for ${stack.wary} round${stack.wary === 1 ? "" : "s"} (counting this one)`,
    );
  if (stack.owner !== stack.side)
    statuses.push(`Fights for the ${stack.side}; owned by the ${stack.owner}`);
  if (stack.defending)
    statuses.push("Defending: +30% Defense until its next turn");
  if (isAlive(stack)) {
    statuses.push(
      stack.retaliatedThisRound
        ? "Has retaliated this round"
        : "Can retaliate this round",
    );
  }
  if (stack.waitedThisRound) statuses.push("Waited this round");
  if (!isAlive(stack)) statuses.push("Destroyed");

  // The creature's own ability: hero modifiers ride along as abilities.
  const abilityId = c.abilities.find((a) => !a.startsWith(HERO_ABILITY_PREFIX));
  const ability =
    abilityId === undefined
      ? null
      : {
          name: abilityDef(abilityId).name,
          text: abilityDef(abilityId).description,
        };

  const abilities = abilityLines(stack);
  const faction = stack.native ? factionOf(c.id) : null;
  const birthright = faction?.birthright
    ? { name: faction.birthright.name, text: faction.birthright.text }
    : null;
  const drills = abilities
    .filter((a) => a.source === "drill")
    .map((a) => DRILLS.get(`${c.id}:${a.id}`) ?? a.name);
  const caster = casterOf(c);
  const castPower = caster ? creatureCastPower(stack) : null;
  const pages: PageLine[] = (caster?.pages ?? [])
    .filter(isBattleSpell)
    .map((id) => ({
      id,
      name: spellDef(id).name,
      text: spellDef(id).text(castPower ?? 0),
      spent: stack.abilitiesUsed.includes(`page:${id}`),
    }));

  return {
    title: creatureName(c, stack.count),
    count: stack.count,
    side: stack.side,
    owner: stack.owner,
    stats,
    ability,
    abilities,
    birthright,
    drills,
    pages,
    castPower,
    statuses,
  };
}

/** The round-limit indicator of the top bar (RULES_V2 1.12, UI2-03). */
export interface RoundLimitInfo {
  readonly round: number;
  readonly limit: number;
  /** Rounds left, counting the current one (1 in the last round). */
  readonly roundsLeft: number;
  /** Who wins at the limit as the board stands. */
  readonly winner: BattleSide;
  /** Fight value left per side (the verdict's numbers). */
  readonly value: { readonly [S in BattleSide]: number };
  /** The chip: "Round 3 / 15". */
  readonly label: string;
  /** The hover card's title: "Round 3 of 15". */
  readonly title: string;
  /** "13 rounds left" or "Last round". */
  readonly left: string;
  /** In plain words: "If the battle ends now, you win." */
  readonly verdict: string;
  /** "Fight value left: you 4200, the enemy 3800." */
  readonly score: string;
  /** The rule, for the hover card. */
  readonly rule: string;
}

/**
 * What the round limit means now: rounds left and who would win if it were
 * reached with the board as it stands (more fight value left wins, the
 * defender takes a tie). `player` is the side shown as "you" (null: name
 * the sides).
 */
export function roundLimitInfo(
  state: BattleState,
  player: BattleSide | null,
): RoundLimitInfo {
  const limit = roundLimitOf(state);
  const round = Math.max(1, state.round);
  const roundsLeft = Math.max(0, limit - round + 1);
  const value = {
    attacker: fightValueLeft(state, "attacker"),
    defender: fightValueLeft(state, "defender"),
  };
  const winner = roundLimitWinner(state);
  const who =
    player === null
      ? `the ${winner} wins`
      : winner === player
        ? "you win"
        : "the enemy wins";
  const tie = value.attacker === value.defender;
  const other: BattleSide = player === "defender" ? "attacker" : "defender";
  const score =
    player === null
      ? `Fight value left: attacker ${value.attacker}, defender ${value.defender}.`
      : `Fight value left: you ${value[player]}, the enemy ${value[other]}.`;
  return {
    round,
    limit,
    roundsLeft,
    winner,
    value,
    label: `Round ${round} / ${limit}`,
    title: `Round ${round} of ${limit}`,
    left: roundsLeft <= 1 ? "Last round" : `${roundsLeft} rounds left`,
    verdict: `If the battle ends now, ${who}${tie ? " (a tie goes to the defender)" : ""}.`,
    score,
    rule:
      `If neither side is beaten by the end of round ${limit}, the side ` +
      "with more fight value left wins and the loser's survivors flee.",
  };
}
